import express, { type Request, Response, NextFunction } from "express";
import compression from "compression";
import { registerRoutes, stopVerificationCleanup } from "./routes";
import { startOrderNotificationQueue, stopOrderNotificationQueue } from "./services/orderQueue";
import { serveStatic } from "./static";
import { setupProductMetaRoutes } from "./productMeta";
import { createServer } from "http";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import MemoryStore from "memorystore";
import { pool } from "../db/index";
import { runMigrations } from 'stripe-replit-sync';
import { getStripeSync } from './stripeClient';
import { WebhookHandlers } from './webhookHandlers';
import { startOrderExpirationJob, stopOrderExpirationJob } from './services/orderExpiration';
import { startOrderReminderJob, stopOrderReminderJob } from './services/orderReminder';
import { db } from '../db/index';
import { applicationStatuses } from '../shared/schema';

async function cleanupDuplicateInventory() {
  try {
    const result = await db.execute(sql`
      DELETE FROM inventory
      WHERE id NOT IN (
        SELECT DISTINCT ON (product_id, node_id) id
        FROM inventory
        ORDER BY product_id, node_id, updated_at DESC
      )
    `);
    const deleted = (result as any)?.rowCount || 0;
    if (deleted > 0) {
      console.log(`Cleaned up ${deleted} duplicate inventory records`);
    }
  } catch (error) {
    console.error('Inventory cleanup warning:', error);
  }
}

async function seedDefaultApplicationStatuses() {
  try {
    const existing = await db.select().from(applicationStatuses);
    if (existing.length === 0) {
      const defaults = [
        { name: 'applied', color: '#3B82F6', sortOrder: 1 },
        { name: 'screening', color: '#F59E0B', sortOrder: 2 },
        { name: 'screened', color: '#8B5CF6', sortOrder: 3 },
        { name: 'invited', color: '#EC4899', sortOrder: 4 },
        { name: 'signed', color: '#10B981', sortOrder: 5 },
        { name: 'onboarded', color: '#059669', sortOrder: 6 },
      ];
      await db.insert(applicationStatuses).values(defaults);
      console.log('Seeded default application statuses');
    }
  } catch (error) {
    console.error('Failed to seed application statuses:', error);
  }
}

const app = express();
const httpServer = createServer(app);

// Trust proxy for production (required for secure cookies behind Replit's proxy)
if (process.env.NODE_ENV === "production") {
  app.set('trust proxy', 1);
}

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

declare module "express-session" {
  interface SessionData {
    userId: string;
  }
}

// Initialize Stripe (runs in background, doesn't block server startup)
async function initStripe() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.log('DATABASE_URL not set, skipping Stripe initialization');
    return;
  }

  try {
    console.log('Initializing Stripe schema...');
    await runMigrations({ databaseUrl });
    console.log('Stripe schema ready');

    const stripeSync = await getStripeSync();

    const replitDomain = process.env.REPLIT_DOMAINS?.split(',')[0];
    if (replitDomain) {
      const webhookUrl = `https://${replitDomain}/api/stripe/webhook`;
      console.log('Setting up managed webhook...');
      const result = await stripeSync.findOrCreateManagedWebhook(webhookUrl);
      if (result?.webhook?.url) {
        console.log(`Webhook configured: ${result.webhook.url}`);
      } else {
        console.log('Webhook setup pending (will be configured on first request)');
      }
    }

    console.log('Syncing Stripe data in background...');
    stripeSync.syncBackfill()
      .then(() => console.log('Stripe data synced'))
      .catch((err: any) => console.error('Error syncing Stripe data:', err));
  } catch (error) {
    console.error('Failed to initialize Stripe:', error);
  }
}

// Initialize Stripe in background
initStripe();

// CRITICAL: Register Stripe webhook route BEFORE express.json()
app.post(
  '/api/stripe/webhook',
  express.raw({ type: 'application/json' }),
  async (req, res) => {
    const signature = req.headers['stripe-signature'];

    if (!signature) {
      return res.status(400).json({ error: 'Missing stripe-signature' });
    }

    try {
      const sig = Array.isArray(signature) ? signature[0] : signature;

      if (!Buffer.isBuffer(req.body)) {
        console.error('STRIPE WEBHOOK ERROR: req.body is not a Buffer');
        return res.status(500).json({ error: 'Webhook processing error' });
      }

      await WebhookHandlers.processWebhook(req.body as Buffer, sig);
      res.status(200).json({ received: true });
    } catch (error: any) {
      console.error('Webhook error:', error.message);
      res.status(400).json({ error: 'Webhook processing error' });
    }
  }
);

app.use(compression());

// Session setup - use memory store as fallback to avoid blocking on DB connection
const PgStore = connectPgSimple(session);
const MemStore = MemoryStore(session);

// Create session store - try PostgreSQL first, fall back to memory store
let sessionStore: session.Store;
if (process.env.DATABASE_URL) {
  try {
    sessionStore = new PgStore({
      pool,
      tableName: "session",
      createTableIfMissing: true,
    });
    console.log('Using PostgreSQL session store');
  } catch (err) {
    console.warn('Failed to create PostgreSQL session store, using memory store:', err);
    sessionStore = new MemStore({
      checkPeriod: 86400000 // prune expired entries every 24h
    });
  }
} else {
  console.log('DATABASE_URL not set, using memory session store');
  sessionStore = new MemStore({
    checkPeriod: 86400000 // prune expired entries every 24h
  });
}

app.use(
  session({
    store: sessionStore,
    secret: process.env.SESSION_SECRET || "gridmart-secret-key-change-in-production",
    resave: false,
    saveUninitialized: false,
    cookie: {
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
    },
  })
);

// Now apply JSON middleware for all other routes
// Increased limit to 50mb to support base64 encoded images
app.use(
  express.json({
    limit: '50mb',
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(express.urlencoded({ extended: false, limit: '50mb' }));

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  await registerRoutes(httpServer, app);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    if (!res.headersSent) {
      res.status(status).json({ message });
    }
    console.error(err);
  });

  setupProductMetaRoutes(app);

  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || "5000", 10);
  httpServer.listen(
    {
      port,
      host: "0.0.0.0",
      reusePort: true,
    },
    () => {
      log(`serving on port ${port}`);
      cleanupDuplicateInventory();
      seedDefaultApplicationStatuses();
      startOrderExpirationJob(1);
      startOrderReminderJob(5); // Check for reminders every 5 minutes
      startOrderNotificationQueue(); // Check for queued order notifications every 60s
    },
  );

  function gracefulShutdown(signal: string) {
    console.log(`Received ${signal}, shutting down gracefully...`);
    stopOrderExpirationJob();
    stopOrderReminderJob();
    stopOrderNotificationQueue();
    stopVerificationCleanup();
    httpServer.close(() => {
      pool.end().then(() => {
        console.log('Database pool closed');
        process.exit(0);
      }).catch(() => {
        process.exit(0);
      });
    });
    setTimeout(() => process.exit(0), 5000);
  }

  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
})();
