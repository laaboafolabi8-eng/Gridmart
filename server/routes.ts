import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertProductSchema, insertOrderSchema, insertNodeAvailabilitySchema, insertNodeApplicationSchema, insertProductTemplateSchema, insertInventoryBatchSchema, insertHostPaymentSchema, insertLandingPageSchema, phoneVerificationCodes as phoneVerificationCodesTable, users, orders, orderItems, products, orderFeedback, nodes, inviteTokens, dropoutSurveys, surveyOptions, adminSettings, surveys, surveyResponses, screeningQuestions, notifications, paymentLinks, landingPages, availabilityEditHistory } from "@shared/schema";
import { db } from "../db/index";
import { eq, lt, desc, asc, sql, and, isNull, isNotNull } from "drizzle-orm";
import bcrypt from "bcrypt";
import nodemailer from "nodemailer";
import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import { registerObjectStorageRoutes } from "./replit_integrations/object_storage";
import { sendOrderReadySms, sendOrderPlacedSmsToHost, sendCustomerArrivedSms, sendOrderCompleteSms, isSmsConfigured, setSmsTemplateStorage, DEFAULT_SMS_TEMPLATES, SMS_TEMPLATE_VARIABLES, SmsTemplateKey, sendSms } from "./services/sms";
import { isWithinPickupWindow, isNodeCurrentlyAvailable, getNextAvailabilityStart, startOrderNotificationQueue } from "./services/orderQueue";
import { importProductFromUrl } from "./services/productImport";
import { getUncachableStripeClient, getStripePublishableKey } from "./stripeClient";
import { generateProductCode } from "./services/duplicateDetection";
import { generateLabelPdfs } from "./services/labelPdf";
import { generatePriceTagPdfs } from "./services/priceTagPdf";
import { processExpiredOrders } from "./services/orderExpiration";
import { googleMerchantService } from "./services/googleMerchant";
import { setupAuth, registerAuthRoutes } from "./replit_integrations/auth";
import { objectStorageClient } from "./replit_integrations/object_storage/objectStorage";
import { randomUUID } from "crypto";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import { addDays, parse, format } from "date-fns";

const TIMEZONE = "America/Toronto";

const gmailTransporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASSWORD,
  },
});

async function sendVerificationEmail(to: string, code: string): Promise<boolean> {
  if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) {
    console.log(`[EMAIL] Gmail not configured. Code for ${to}: ${code}`);
    return false;
  }
  
  try {
    await gmailTransporter.sendMail({
      from: `"GridMart" <${process.env.GMAIL_USER}>`,
      to,
      subject: `Your GridMart verification code: ${code}`,
      text: `Your verification code is: ${code}\n\nThis code expires in 10 minutes.\n\nIf you didn't request this code, please ignore this email.`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 400px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #0d9488; margin-bottom: 20px;">GridMart</h2>
          <p>Your verification code is:</p>
          <div style="background: #f3f4f6; padding: 16px; border-radius: 8px; text-align: center; margin: 20px 0;">
            <span style="font-size: 32px; font-weight: bold; letter-spacing: 4px; color: #1f2937;">${code}</span>
          </div>
          <p style="color: #6b7280; font-size: 14px;">This code expires in 10 minutes.</p>
          <p style="color: #6b7280; font-size: 14px;">If you didn't request this code, please ignore this email.</p>
        </div>
      `,
    });
    console.log(`[EMAIL] Verification code sent to ${to}`);
    return true;
  } catch (error) {
    console.error(`[EMAIL] Failed to send to ${to}:`, error);
    return false;
  }
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

async function getNotificationRecipients(settingKey: string): Promise<string[]> {
  const configured = await storage.getSiteSetting(settingKey);
  if (configured && configured.trim()) {
    return configured.split(',').map(e => e.trim()).filter(Boolean);
  }
  const admins = await db.select({ email: users.email }).from(users).where(eq(users.type, 'admin'));
  return admins.map(a => a.email).filter(Boolean) as string[];
}

async function notifyAdminNewAccount(accountName: string, accountEmail: string, accountType: string, extra?: string) {
  try {
    if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) {
      console.log(`[ADMIN NOTIFY] Gmail not configured, skipping notification for new ${accountType}: ${accountEmail}`);
      return;
    }

    const adminEmails = await getNotificationRecipients('notifEmail_newAccount');
    if (adminEmails.length === 0) return;

    const safeName = escapeHtml(accountName);
    const safeEmail = escapeHtml(accountEmail);
    const typeLabel = accountType === 'node' ? 'Node Host' : 'Shopper';
    const extraInfo = extra ? `<p style="color:#374151;font-size:14px;">${escapeHtml(extra)}</p>` : '';

    await gmailTransporter.sendMail({
      from: `"GridMart" <${process.env.GMAIL_USER}>`,
      to: adminEmails.join(','),
      subject: `New ${typeLabel} Account: ${accountName || accountEmail}`,
      html: `
        <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:20px;">
          <h2 style="color:#0d9488;margin-bottom:8px;">New ${typeLabel} Account Created</h2>
          <table style="width:100%;border-collapse:collapse;margin:12px 0;">
            <tr><td style="padding:6px 12px;color:#6b7280;">Name</td><td style="padding:6px 12px;font-weight:600;">${safeName || '(not provided)'}</td></tr>
            <tr><td style="padding:6px 12px;color:#6b7280;">Email</td><td style="padding:6px 12px;">${safeEmail}</td></tr>
            <tr><td style="padding:6px 12px;color:#6b7280;">Type</td><td style="padding:6px 12px;">${typeLabel}</td></tr>
          </table>
          ${extraInfo}
          <p style="color:#9ca3af;font-size:12px;margin-top:16px;">This is an automated notification from GridMart.</p>
        </div>
      `,
    });
    console.log(`[ADMIN NOTIFY] Sent new ${accountType} account notification for ${accountEmail}`);
  } catch (error) {
    console.error(`[ADMIN NOTIFY] Failed to notify admins:`, error);
  }
}

// Ensure admin user exists (runs on startup)
async function ensureAdminUser() {
  try {
    const adminEmail = "admin@gridmart.ca";
    const existingAdmin = await storage.getUserByEmail(adminEmail);
    
    if (!existingAdmin) {
      console.log("Creating admin user...");
      const hashedPassword = await bcrypt.hash("admin123", 10);
      await storage.createUser({
        email: adminEmail,
        password: hashedPassword,
        name: "Admin User",
        type: "admin"
      });
      console.log("Admin user created: admin@gridmart.ca / admin123");
    }
  } catch (error) {
    console.error("Error ensuring admin user:", error);
  }
}

let verificationCleanupInterval: NodeJS.Timeout | null = null;

export function stopVerificationCleanup(): void {
  if (verificationCleanupInterval) {
    clearInterval(verificationCleanupInterval);
    verificationCleanupInterval = null;
  }
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  
  app.get("/robots.txt", (_req, res) => {
    res.type("text/plain").send(
      [
        "User-agent: Googlebot",
        "Allow: /",
        "Allow: /product/",
        "Allow: /api/objects/",
        "Disallow: /admin",
        "Disallow: /node-dashboard",
        "Disallow: /api/",
        "Allow: /api/objects/",
        "Disallow: /checkout",
        "Disallow: /thank-you",
        "",
        "User-agent: Googlebot-Image",
        "Allow: /api/objects/",
        "Allow: /product/",
        "",
        "User-agent: *",
        "Allow: /",
        "Disallow: /admin",
        "Disallow: /node-dashboard",
        "Disallow: /api/",
        "Allow: /api/objects/",
        "Disallow: /checkout",
        "Disallow: /thank-you",
        "",
        "Sitemap: https://gridmart.ca/sitemap.xml",
      ].join("\n")
    );
  });

  app.get("/sitemap.xml", async (_req, res) => {
    try {
      const { productUrl } = await import("../shared/slugify");
      const escXml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
      const allProducts = await db.select({ id: products.id, name: products.name, deletedAt: products.deletedAt }).from(products).where(isNull(products.deletedAt));
      const baseUrl = "https://gridmart.ca";
      const today = new Date().toISOString().split("T")[0];

      const staticPages = [
        { loc: "/", priority: "1.0", changefreq: "daily" },
        { loc: "/about", priority: "0.5", changefreq: "monthly" },
        { loc: "/contact", priority: "0.5", changefreq: "monthly" },
        { loc: "/privacy", priority: "0.3", changefreq: "yearly" },
        { loc: "/terms", priority: "0.3", changefreq: "yearly" },
        { loc: "/apply", priority: "0.6", changefreq: "monthly" },
      ];

      let xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n`;
      for (const page of staticPages) {
        xml += `  <url>\n    <loc>${escXml(baseUrl + page.loc)}</loc>\n    <lastmod>${today}</lastmod>\n    <changefreq>${page.changefreq}</changefreq>\n    <priority>${page.priority}</priority>\n  </url>\n`;
      }
      for (const product of allProducts) {
        const url = productUrl(product);
        xml += `  <url>\n    <loc>${escXml(baseUrl + url)}</loc>\n    <changefreq>weekly</changefreq>\n    <priority>0.8</priority>\n  </url>\n`;
      }
      xml += `</urlset>`;
      res.type("application/xml").send(xml);
    } catch (error) {
      console.error("Sitemap generation error:", error);
      res.status(500).send("Error generating sitemap");
    }
  });

  // Ensure admin user exists on startup
  await ensureAdminUser();
  
  // Initialize SMS template storage to use admin settings
  setSmsTemplateStorage((key: string) => storage.getAdminSetting(key));
  
  // Setup Replit Auth (Google OAuth) - must be before other routes
  await setupAuth(app);
  registerAuthRoutes(app);
  
  // Setup direct Google OAuth (if credentials are configured)
  if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
    console.log("[Google OAuth] Configuring direct Google login...");
    
    // Determine the callback URL based on environment
    const isProduction = process.env.NODE_ENV === 'production';
    let baseUrl: string;
    if (isProduction) {
      // Use REPLIT_DEPLOYMENT_URL in production, fallback to custom domain
      if (process.env.REPLIT_DEPLOYMENT_URL) {
        baseUrl = process.env.REPLIT_DEPLOYMENT_URL;
      } else {
        baseUrl = 'https://gridmart.ca';
      }
    } else if (process.env.REPLIT_DEV_DOMAIN) {
      baseUrl = `https://${process.env.REPLIT_DEV_DOMAIN}`;
    } else {
      baseUrl = `https://${process.env.REPL_SLUG}.${process.env.REPL_OWNER?.toLowerCase()}.repl.co`;
    }
    const callbackURL = `${baseUrl}/api/auth/google/callback`;
    console.log(`[Google OAuth] Using callback URL: ${callbackURL}`);
    
    passport.use(new GoogleStrategy({
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: callbackURL,
    }, async (accessToken, refreshToken, profile, done) => {
      try {
        const email = profile.emails?.[0]?.value;
        if (!email) {
          return done(new Error("No email found in Google profile"));
        }
        
        // Check if user exists
        let user = await storage.getUserByEmail(email);
        
        if (!user) {
          // Create new user with Google info
          user = await storage.createUser({
            email: email,
            name: profile.displayName || email.split('@')[0],
            password: null, // No password for OAuth users
            type: 'buyer',
            roles: ['buyer'],
          });
          console.log(`[Google OAuth] Created new user: ${email}`);
          notifyAdminNewAccount(profile.displayName || email.split('@')[0], email, 'buyer', 'Signed up via Google');
        } else if (user.deletedAt) {
          return done(new Error("This account has been deactivated"));
        }
        
        return done(null, user);
      } catch (error) {
        console.error("[Google OAuth] Error:", error);
        return done(error as Error);
      }
    }));
    
    passport.serializeUser((user: any, done) => {
      done(null, user.id);
    });
    
    passport.deserializeUser(async (id: string, done) => {
      try {
        const user = await storage.getUser(id);
        done(null, user);
      } catch (error) {
        done(error);
      }
    });
    
    app.use(passport.initialize());
    
    // Google OAuth routes
    app.get("/api/auth/google", (req, res, next) => {
      console.log("[Google OAuth] Starting authentication flow...");
      passport.authenticate("google", { 
        scope: ["profile", "email"],
        session: false 
      })(req, res, next);
    });
    
    app.get("/api/auth/google/callback", (req, res, next) => {
      passport.authenticate("google", { session: false }, async (err: any, user: any) => {
        if (err) {
          console.error("[Google OAuth] Callback error:", err);
          return res.redirect(`/login?error=${encodeURIComponent(err.message || 'Authentication failed')}`);
        }
        if (!user) {
          return res.redirect('/login?error=Authentication%20failed');
        }
        
        // Set up session manually
        (req.session as any).userId = user.id;
        
        console.log(`[Google OAuth] User authenticated: ${user.email}`);
        
        // Save session before redirecting to ensure it persists
        req.session.save((saveErr) => {
          if (saveErr) {
            console.error("[Google OAuth] Session save error:", saveErr);
            return res.redirect('/login?error=Session%20error');
          }
          
          // Check if Google user needs to add phone (first-time login)
          if (!user.phone) {
            console.log(`[Google OAuth] User ${user.email} needs to add phone`);
            return res.redirect('/add-phone');
          }
          
          // Redirect based on user type
          if (user.type === 'admin') {
            return res.redirect('/admin');
          } else if (user.type === 'node') {
            return res.redirect('/node-dashboard');
          } else {
            return res.redirect('/');
          }
        });
      })(req, res, next);
    });
    
    console.log(`[Google OAuth] Configured with callback URL: ${callbackURL}`);
  } else {
    console.log("[Google OAuth] Not configured - missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET");
  }
  
  // Register object storage routes for file uploads
  registerObjectStorageRoutes(app);
  
  // ===== Authentication Routes =====
  
  // Login
  app.post("/api/auth/login", async (req, res) => {
    try {
      const { email, password } = req.body;
      
      const user = await storage.getUserByEmail(email);
      if (!user) {
        return res.status(401).json({ error: "Invalid credentials" });
      }
      
      // Check if account is deleted
      if (user.deletedAt) {
        return res.status(401).json({ error: "This account has been deleted" });
      }
      
      const validPassword = await bcrypt.compare(password, user.password);
      if (!validPassword) {
        return res.status(401).json({ error: "Invalid credentials" });
      }
      
      // Store user in session
      if (req.session) {
        req.session.userId = user.id;
      }
      
      // Don't send password to client
      const { password: _, ...userWithoutPassword } = user;
      res.json({ user: userWithoutPassword });
    } catch (error) {
      console.error("Login error:", error);
      res.status(500).json({ error: "Login failed" });
    }
  });
  
  // Logout
  app.post("/api/auth/logout", async (req, res) => {
    req.session?.destroy((err) => {
      if (err) {
        return res.status(500).json({ error: "Logout failed" });
      }
      res.json({ success: true });
    });
  });
  
  // Get current user (supports both /me and /session endpoints)
  const getSessionHandler = async (req: any, res: any) => {
    if (!req.session?.userId) {
      return res.status(401).json({ error: "Not authenticated" });
    }
    
    const user = await storage.getUser(req.session.userId);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }
    
    // Check if account is deleted
    if (user.deletedAt) {
      req.session.destroy(() => {});
      return res.status(401).json({ error: "This account has been deleted" });
    }
    
    const { password: _, ...userWithoutPassword } = user;
    res.json({ user: userWithoutPassword });
  };
  
  app.get("/api/auth/me", getSessionHandler);
  app.get("/api/auth/session", getSessionHandler);
  
  // Register new user
  app.post("/api/auth/register", async (req, res) => {
    try {
      const { name, email, password, type } = req.body;
      
      // Validate required fields
      if (!name || !email || !password || !type) {
        return res.status(400).json({ error: "Missing required fields" });
      }
      
      // Validate email format
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return res.status(400).json({ error: "Invalid email format" });
      }
      
      // Validate password length
      if (password.length < 6) {
        return res.status(400).json({ error: "Password must be at least 6 characters" });
      }
      
      // Check if email already exists
      const existingUser = await storage.getUserByEmail(email);
      if (existingUser) {
        return res.status(400).json({ error: "Email already registered" });
      }
      
      // Hash password
      const hashedPassword = await bcrypt.hash(password, 10);
      
      // Create user with roles
      const userType = type === 'node' ? 'node' : 'buyer';
      const user = await storage.createUser({
        name,
        email,
        password: hashedPassword,
        type: userType,
        roles: userType === 'node' ? ['node', 'buyer'] : ['buyer'], // Node users can also shop
      });
      
      const { password: _, ...userWithoutPassword } = user;
      notifyAdminNewAccount(name, email, userType);
      res.json({ user: userWithoutPassword, message: "Registration successful" });
    } catch (error) {
      console.error("Registration error:", error);
      res.status(500).json({ error: "Registration failed" });
    }
  });
  
  // Rate limiting: track send attempts per phone (phone -> { count, resetAt })
  // Keep in memory since rate limits are less critical and can reset on restart
  const phoneSendAttempts = new Map<string, { count: number; resetAt: number }>();
  
  // Helper: normalize phone to E.164 format (+1XXXXXXXXXX)
  function normalizePhone(phone: string): string {
    let digits = phone.replace(/\D/g, '');
    if (digits.length === 10) {
      return '+1' + digits;
    } else if (digits.length === 11 && digits.startsWith('1')) {
      return '+' + digits;
    } else if (!digits.startsWith('+')) {
      return '+' + digits;
    }
    return digits;
  }
  
  // Clean up expired codes and rate limits periodically
  verificationCleanupInterval = setInterval(async () => {
    const now = new Date();
    // Clean expired verification codes from database
    try {
      await db.delete(phoneVerificationCodesTable).where(lt(phoneVerificationCodesTable.expiresAt, now));
    } catch (error: any) {
      if (error?.message?.includes('Connection terminated')) return;
      console.error("Error cleaning expired verification codes:", error);
    }
    // Clean expired rate limits from memory
    const nowMs = Date.now();
    for (const [key, value] of phoneSendAttempts.entries()) {
      if (value.resetAt < nowMs) {
        phoneSendAttempts.delete(key);
      }
    }
  }, 60000); // Clean every minute
  
  // Send phone verification code
  app.post("/api/auth/send-code", async (req, res) => {
    try {
      let { phone } = req.body;
      
      if (!phone) {
        return res.status(400).json({ error: "Phone number is required" });
      }
      
      // Normalize phone number to E.164
      phone = normalizePhone(phone);
      
      // Rate limiting: max 3 codes per phone per 15 minutes
      const now = Date.now();
      const rateLimit = phoneSendAttempts.get(phone);
      if (rateLimit) {
        if (rateLimit.resetAt > now && rateLimit.count >= 3) {
          const waitMinutes = Math.ceil((rateLimit.resetAt - now) / 60000);
          return res.status(429).json({ error: `Too many attempts. Please wait ${waitMinutes} minute(s) before trying again.` });
        }
        if (rateLimit.resetAt <= now) {
          phoneSendAttempts.set(phone, { count: 1, resetAt: now + 15 * 60 * 1000 });
        } else {
          phoneSendAttempts.set(phone, { count: rateLimit.count + 1, resetAt: rateLimit.resetAt });
        }
      } else {
        phoneSendAttempts.set(phone, { count: 1, resetAt: now + 15 * 60 * 1000 });
      }
      
      // Generate 6-digit code
      const code = Math.floor(100000 + Math.random() * 900000).toString();
      
      // Store code with 5-minute expiry and 0 verification attempts in database
      const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes
      
      // Upsert: delete existing and insert new
      await db.delete(phoneVerificationCodesTable).where(eq(phoneVerificationCodesTable.phone, phone));
      await db.insert(phoneVerificationCodesTable).values({
        phone,
        code,
        expiresAt,
        attempts: 0,
      });
      
      // Send SMS via TextBee
      if (!isSmsConfigured()) {
        // For development, log the code and return success
        console.log(`[DEV] Verification code for ${phone}: ${code}`);
        return res.json({ success: true, message: "Verification code sent", devCode: code });
      }
      
      const { sendVerificationCode } = await import('./services/sms');
      const result = await sendVerificationCode(phone, code);
      
      if (!result.success) {
        console.error("Failed to send verification SMS:", result.error);
        return res.status(500).json({ error: "Failed to send verification code" });
      }
      
      res.json({ success: true, message: "Verification code sent" });
    } catch (error: any) {
      console.error("Send verification code error:", error);
      res.status(500).json({ error: error.message || "Failed to send verification code" });
    }
  });
  
  // Verify phone code and create/login user
  app.post("/api/auth/verify-code", async (req, res) => {
    try {
      let { phone, code } = req.body;
      
      if (!phone || !code) {
        return res.status(400).json({ error: "Phone and code are required" });
      }
      
      // Normalize phone number using same helper for consistency
      phone = normalizePhone(phone);
      
      // Check verification code from database
      const verifications = await db.select().from(phoneVerificationCodesTable).where(eq(phoneVerificationCodesTable.phone, phone));
      const verification = verifications[0];
      
      if (!verification) {
        return res.status(400).json({ error: "No verification code found. Please request a new one." });
      }
      
      if (verification.expiresAt < new Date()) {
        await db.delete(phoneVerificationCodesTable).where(eq(phoneVerificationCodesTable.phone, phone));
        return res.status(400).json({ error: "Verification code expired. Please request a new one." });
      }
      
      // Limit verification attempts to prevent brute force (max 5 attempts per code)
      if (verification.attempts >= 5) {
        await db.delete(phoneVerificationCodesTable).where(eq(phoneVerificationCodesTable.phone, phone));
        return res.status(400).json({ error: "Too many failed attempts. Please request a new code." });
      }
      
      if (verification.code !== code) {
        // Increment attempts counter in database
        await db.update(phoneVerificationCodesTable)
          .set({ attempts: verification.attempts + 1 })
          .where(eq(phoneVerificationCodesTable.phone, phone));
        return res.status(400).json({ error: "Invalid verification code" });
      }
      
      // Code is valid - delete it to prevent reuse
      await db.delete(phoneVerificationCodesTable).where(eq(phoneVerificationCodesTable.phone, phone));
      
      // Check if user with this phone exists
      let user = await storage.getUserByPhone(phone);
      
      if (user && user.deletedAt) {
        return res.status(401).json({ error: "This account has been deleted" });
      }
      
      if (!user) {
        // Create new user with phone (no password needed for phone auth)
        // Generate a random password since the field is required
        const randomPassword = await bcrypt.hash(Math.random().toString(36), 10);
        
        user = await storage.createUser({
          name: '', // Will be collected at checkout
          email: `${phone.replace(/\D/g, '')}@phone.gridmart.ca`, // Placeholder email
          password: randomPassword,
          phone,
          type: 'buyer',
          roles: ['buyer'],
          smsOptIn: true,
        });
        notifyAdminNewAccount('', phone, 'buyer', 'Signed up via phone verification');
      }
      
      // Log the user in
      req.session!.userId = user.id;
      
      const { password: _, ...userWithoutPassword } = user;
      res.json({ user: userWithoutPassword, isNewUser: !user.name });
    } catch (error: any) {
      console.error("Verify code error:", error);
      console.error("Verify code stack:", error.stack);
      res.status(500).json({ error: "Verification failed. Please try again or request a new code." });
    }
  });
  
  // Email verification codes table (using same DB table as phone)
  // Send email verification code
  app.post("/api/auth/send-email-code", async (req, res) => {
    try {
      let { email } = req.body;
      
      if (!email) {
        return res.status(400).json({ error: "Email is required" });
      }
      
      email = email.toLowerCase().trim();
      
      // Generate 6-digit code
      const code = Math.floor(100000 + Math.random() * 900000).toString();
      
      // Store code with 10-minute expiry in database (use email as key)
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
      
      // Upsert: delete existing and insert new
      await db.delete(phoneVerificationCodesTable).where(eq(phoneVerificationCodesTable.phone, `email:${email}`));
      await db.insert(phoneVerificationCodesTable).values({
        phone: `email:${email}`, // Use phone column with email: prefix
        code,
        expiresAt,
        attempts: 0,
      });
      
      // Send verification email
      const emailSent = await sendVerificationEmail(email, code);
      
      if (!emailSent) {
        // If email not configured, log and return error in production
        if (process.env.NODE_ENV !== 'development') {
          return res.status(500).json({ error: "Email service not configured" });
        }
        // In development, return success with code for testing
        return res.json({ success: true, message: "Verification code sent", devCode: code });
      }
      
      res.json({ success: true, message: "Verification code sent to your email" });
    } catch (error: any) {
      console.error("Send email code error:", error);
      res.status(500).json({ error: error.message || "Failed to send verification code" });
    }
  });

  // Verify email code and create/login user
  app.post("/api/auth/verify-email-code", async (req, res) => {
    try {
      let { email, code } = req.body;
      
      if (!email || !code) {
        return res.status(400).json({ error: "Email and code are required" });
      }
      
      email = email.toLowerCase().trim();
      const key = `email:${email}`;
      
      // Check verification code from database
      const verifications = await db.select().from(phoneVerificationCodesTable).where(eq(phoneVerificationCodesTable.phone, key));
      const verification = verifications[0];
      
      if (!verification) {
        return res.status(400).json({ error: "No verification code found. Please request a new one." });
      }
      
      if (verification.expiresAt < new Date()) {
        await db.delete(phoneVerificationCodesTable).where(eq(phoneVerificationCodesTable.phone, key));
        return res.status(400).json({ error: "Verification code expired. Please request a new one." });
      }
      
      if (verification.attempts >= 5) {
        await db.delete(phoneVerificationCodesTable).where(eq(phoneVerificationCodesTable.phone, key));
        return res.status(400).json({ error: "Too many failed attempts. Please request a new code." });
      }
      
      if (verification.code !== code) {
        await db.update(phoneVerificationCodesTable)
          .set({ attempts: verification.attempts + 1 })
          .where(eq(phoneVerificationCodesTable.phone, key));
        return res.status(400).json({ error: "Invalid verification code" });
      }
      
      // Code is valid - delete it
      await db.delete(phoneVerificationCodesTable).where(eq(phoneVerificationCodesTable.phone, key));
      
      // Check if user exists
      let user = await storage.getUserByEmail(email);
      
      if (!user) {
        // Create new user with just email
        const randomPassword = await bcrypt.hash(Math.random().toString(36), 10);
        
        user = await storage.createUser({
          name: '', // Will be collected at checkout
          email,
          password: randomPassword,
          type: 'buyer',
          roles: ['buyer'],
        });
        notifyAdminNewAccount('', email, 'buyer', 'Signed up via email verification');
      }
      
      // Log the user in
      req.session!.userId = user.id;
      
      const { password: _, ...userWithoutPassword } = user;
      res.json({ user: userWithoutPassword, isNewUser: !user.name });
    } catch (error: any) {
      console.error("Verify email code error:", error);
      res.status(500).json({ error: error.message || "Verification failed" });
    }
  });

  // Check if email exists (for quick sign-in flow)
  app.post("/api/auth/check-email", async (req, res) => {
    try {
      const { email } = req.body;
      
      if (!email) {
        return res.status(400).json({ error: "Email is required" });
      }
      
      const user = await storage.getUserByEmail(email.toLowerCase().trim());
      res.json({ exists: !!user });
    } catch (error: any) {
      console.error("Check email error:", error);
      res.status(500).json({ error: "Failed to check email" });
    }
  });

  // Email login (for existing users)
  app.post("/api/auth/email-login", async (req, res) => {
    try {
      const { email } = req.body;
      
      if (!email) {
        return res.status(400).json({ error: "Email is required" });
      }
      
      const user = await storage.getUserByEmail(email.toLowerCase().trim());
      
      if (!user) {
        return res.status(404).json({ error: "Account not found" });
      }
      
      // Log the user in
      req.session!.userId = user.id;
      
      const { password: _, ...userWithoutPassword } = user;
      res.json({ user: userWithoutPassword });
    } catch (error: any) {
      console.error("Email login error:", error);
      res.status(500).json({ error: error.message || "Login failed" });
    }
  });

  // Quick signup (email + name + phone)
  app.post("/api/auth/quick-signup", async (req, res) => {
    try {
      let { email, name, phone } = req.body;
      
      if (!email || !name || !phone) {
        return res.status(400).json({ error: "Email, name, and phone are required" });
      }
      
      email = email.toLowerCase().trim();
      phone = normalizePhone(phone);
      
      // Check if email already exists
      const existingUser = await storage.getUserByEmail(email);
      if (existingUser) {
        return res.status(400).json({ error: "An account with this email already exists" });
      }
      
      // Create new user
      const randomPassword = await bcrypt.hash(Math.random().toString(36), 10);
      
      const user = await storage.createUser({
        name: name.trim(),
        email,
        password: randomPassword,
        phone,
        type: 'buyer',
        roles: ['buyer'],
        smsOptIn: true,
      });
      notifyAdminNewAccount(name.trim(), email, 'buyer', 'Signed up via quick signup');
      
      // Log the user in
      req.session!.userId = user.id;
      
      const { password: _, ...userWithoutPassword } = user;
      res.json({ user: userWithoutPassword });
    } catch (error: any) {
      console.error("Quick signup error:", error);
      res.status(500).json({ error: error.message || "Account creation failed" });
    }
  });

  // Phone login without SMS verification (temporary while Twilio A2P pending)
  app.post("/api/auth/phone-login", async (req, res) => {
    try {
      let { phone } = req.body;
      
      if (!phone) {
        return res.status(400).json({ error: "Phone number is required" });
      }
      
      // Normalize phone number
      phone = normalizePhone(phone);
      
      // Check if user with this phone exists
      let user = await storage.getUserByPhone(phone);
      
      if (!user) {
        // Create new user with phone (no password needed for phone auth)
        const randomPassword = await bcrypt.hash(Math.random().toString(36), 10);
        
        user = await storage.createUser({
          name: '', // Will be collected at checkout
          email: `${phone.replace(/\D/g, '')}@phone.gridmart.ca`, // Placeholder email
          password: randomPassword,
          phone,
          type: 'buyer',
          roles: ['buyer'],
          smsOptIn: true,
        });
        notifyAdminNewAccount('', phone, 'buyer', 'Signed up via phone login');
      }
      
      // Log the user in
      req.session!.userId = user.id;
      
      const { password: _, ...userWithoutPassword } = user;
      res.json({ user: userWithoutPassword, isNewUser: !user.name });
    } catch (error: any) {
      console.error("Phone login error:", error);
      res.status(500).json({ error: error.message || "Login failed" });
    }
  });

  // Update user profile (name, phone, etc.)
  app.post("/api/auth/update-profile", async (req, res) => {
    try {
      const userId = req.session?.userId;
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      
      const { name, phone, email, smsOptIn, emailOptIn, verificationCode } = req.body;
      const updates: Record<string, any> = {};
      
      if (name && typeof name === 'string') {
        updates.name = name.trim();
      }
      if (phone && typeof phone === 'string') {
        const normalizedPhone = normalizePhone(phone);
        const user = await storage.getUser(userId);
        
        // Only require verification code for phone-signup users (email ends with @phone.gridmart.ca)
        const isPhoneSignupUser = user?.email?.endsWith('@phone.gridmart.ca');
        
        if (isPhoneSignupUser) {
          // Phone signup users need verification to change their login phone
          if (!verificationCode) {
            return res.status(400).json({ error: "Verification code required to update phone number." });
          }
          
          const storedCode = await storage.getVerificationCode(normalizedPhone);
          if (!storedCode) {
            return res.status(400).json({ error: "Verification code expired. Please request a new code." });
          }
          if (storedCode.attempts >= 5) {
            await storage.deleteVerificationCode(normalizedPhone);
            return res.status(400).json({ error: "Too many attempts. Please request a new code." });
          }
          if (storedCode.code !== verificationCode) {
            await storage.incrementVerificationAttempts(normalizedPhone);
            return res.status(400).json({ error: "Incorrect code. Please try again." });
          }
          // Code verified - delete it
          await storage.deleteVerificationCode(normalizedPhone);
        }
        
        updates.phone = normalizedPhone;
      }
      if (email && typeof email === 'string') {
        const normalizedEmail = email.toLowerCase().trim();
        if (!normalizedEmail.includes('@phone.gridmart.ca')) {
          // Check if email is already in use by another user
          const existingUser = await storage.getUserByEmail(normalizedEmail);
          if (existingUser && existingUser.id !== userId) {
            return res.status(400).json({ error: "This email is already in use. Please use a different email address." });
          }
          updates.email = normalizedEmail;
        }
      }
      if (typeof smsOptIn === 'boolean') {
        updates.smsOptIn = smsOptIn;
      }
      if (typeof emailOptIn === 'boolean') {
        updates.emailOptIn = emailOptIn;
      }
      
      if (Object.keys(updates).length === 0) {
        return res.status(400).json({ error: "No updates provided" });
      }
      
      const user = await storage.updateUser(userId, updates);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      
      const { password: _, ...userWithoutPassword } = user;
      res.json({ user: userWithoutPassword });
    } catch (error: any) {
      console.error("Update profile error:", error);
      res.status(500).json({ error: error.message || "Profile update failed" });
    }
  });
  
  // Confirm phone number change (requires password verification)
  app.post("/api/auth/confirm-phone-change", async (req, res) => {
    try {
      const userId = req.session?.userId;
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      
      const { password, newPhone, name, email, emailOptIn } = req.body;
      
      if (!password) {
        return res.status(400).json({ error: "Password is required" });
      }
      
      if (!newPhone) {
        return res.status(400).json({ error: "New phone number is required" });
      }
      
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      
      // Verify password
      const validPassword = await bcrypt.compare(password, user.password);
      if (!validPassword) {
        return res.status(401).json({ error: "Incorrect password" });
      }
      
      // Build updates
      const updates: Record<string, any> = {
        phone: normalizePhone(newPhone),
        smsOptIn: true, // Always on for order updates
      };
      
      if (name && typeof name === 'string') {
        updates.name = name.trim();
      }
      if (email && typeof email === 'string') {
        const normalizedEmail = email.toLowerCase().trim();
        if (!normalizedEmail.includes('@phone.gridmart.ca')) {
          updates.email = normalizedEmail;
        }
      }
      if (typeof emailOptIn === 'boolean') {
        updates.emailOptIn = emailOptIn;
      }
      
      const updatedUser = await storage.updateUser(userId, updates);
      if (!updatedUser) {
        return res.status(404).json({ error: "User not found" });
      }
      
      const { password: _, ...userWithoutPassword } = updatedUser;
      res.json({ user: userWithoutPassword });
    } catch (error: any) {
      console.error("Confirm phone change error:", error);
      res.status(500).json({ error: error.message || "Phone change failed" });
    }
  });
  
  // Change password
  app.post("/api/auth/change-password", async (req, res) => {
    try {
      const userId = req.session?.userId;
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      
      const { currentPassword, newPassword } = req.body;
      
      if (!currentPassword || !newPassword) {
        return res.status(400).json({ error: "Current and new password are required" });
      }
      
      if (newPassword.length < 6) {
        return res.status(400).json({ error: "Password must be at least 6 characters" });
      }
      
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      
      const bcrypt = await import('bcrypt');
      const isValid = await bcrypt.compare(currentPassword, user.password);
      if (!isValid) {
        return res.status(400).json({ error: "Current password is incorrect" });
      }
      
      const hashedPassword = await bcrypt.hash(newPassword, 10);
      await storage.updateUser(userId, { password: hashedPassword });
      
      res.json({ success: true });
    } catch (error: any) {
      console.error("Change password error:", error);
      res.status(500).json({ error: error.message || "Password change failed" });
    }
  });
  
  // Delete account
  app.delete("/api/auth/delete-account", async (req, res) => {
    try {
      const userId = req.session?.userId;
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      
      // Hard delete the user - completely remove from database
      await storage.deleteUser(userId);
      
      // Destroy session
      req.session.destroy((err) => {
        if (err) {
          console.error("Session destroy error:", err);
        }
      });
      
      res.json({ success: true });
    } catch (error: any) {
      console.error("Delete account error:", error);
      res.status(500).json({ error: error.message || "Account deletion failed" });
    }
  });
  
  // User addresses endpoints
  app.get("/api/user/addresses", async (req, res) => {
    try {
      const userId = req.session?.userId;
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      
      const addresses = await storage.getUserAddresses(userId);
      res.json(addresses);
    } catch (error: any) {
      console.error("Get addresses error:", error);
      res.status(500).json({ error: error.message || "Failed to get addresses" });
    }
  });
  
  app.post("/api/user/addresses", async (req, res) => {
    try {
      const userId = req.session?.userId;
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      
      const { label, name, phone, street, city, province, postalCode, isDefault } = req.body;
      
      if (!label || !name || !street || !city || !province || !postalCode) {
        return res.status(400).json({ error: "Missing required fields" });
      }
      
      // If setting as default, unset other defaults first
      if (isDefault) {
        await storage.clearDefaultAddresses(userId);
      }
      
      const address = await storage.createUserAddress({
        userId,
        label,
        name,
        phone: phone || null,
        street,
        city,
        province,
        postalCode,
        isDefault: isDefault || false,
      });
      
      res.json(address);
    } catch (error: any) {
      console.error("Create address error:", error);
      res.status(500).json({ error: error.message || "Failed to create address" });
    }
  });
  
  app.put("/api/user/addresses/:id", async (req, res) => {
    try {
      const userId = req.session?.userId;
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      
      const { id } = req.params;
      const { label, name, phone, street, city, province, postalCode, isDefault } = req.body;
      
      // Verify ownership
      const existing = await storage.getUserAddress(id);
      if (!existing || existing.userId !== userId) {
        return res.status(404).json({ error: "Address not found" });
      }
      
      // If setting as default, unset other defaults first
      if (isDefault) {
        await storage.clearDefaultAddresses(userId);
      }
      
      const address = await storage.updateUserAddress(id, {
        label,
        name,
        phone: phone || null,
        street,
        city,
        province,
        postalCode,
        isDefault,
      });
      
      res.json(address);
    } catch (error: any) {
      console.error("Update address error:", error);
      res.status(500).json({ error: error.message || "Failed to update address" });
    }
  });
  
  app.put("/api/user/addresses/:id/default", async (req, res) => {
    try {
      const userId = req.session?.userId;
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      
      const { id } = req.params;
      
      // Verify ownership
      const existing = await storage.getUserAddress(id);
      if (!existing || existing.userId !== userId) {
        return res.status(404).json({ error: "Address not found" });
      }
      
      await storage.clearDefaultAddresses(userId);
      const address = await storage.updateUserAddress(id, { isDefault: true });
      
      res.json(address);
    } catch (error: any) {
      console.error("Set default address error:", error);
      res.status(500).json({ error: error.message || "Failed to set default address" });
    }
  });
  
  app.delete("/api/user/addresses/:id", async (req, res) => {
    try {
      const userId = req.session?.userId;
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      
      const { id } = req.params;
      
      // Verify ownership
      const existing = await storage.getUserAddress(id);
      if (!existing || existing.userId !== userId) {
        return res.status(404).json({ error: "Address not found" });
      }
      
      await storage.deleteUserAddress(id);
      
      res.json({ success: true });
    } catch (error: any) {
      console.error("Delete address error:", error);
      res.status(500).json({ error: error.message || "Failed to delete address" });
    }
  });
  
  // Register new node host via invite token
  app.post("/api/auth/register-node", async (req, res) => {
    try {
      const { name, email, password, phone, nodeName, address, inviteToken } = req.body;
      
      // Validate required fields
      if (!name || !email || !password || !inviteToken) {
        return res.status(400).json({ error: "Missing required fields" });
      }
      
      // Validate invite token
      const invite = await storage.getInviteTokenByToken(inviteToken);
      if (!invite) {
        return res.status(400).json({ error: "Invalid invite link" });
      }
      if (invite.usedAt) {
        return res.status(400).json({ error: "This invite link has already been used" });
      }
      if (new Date(invite.expiresAt) < new Date()) {
        return res.status(400).json({ error: "This invite link has expired" });
      }
      
      // Validate email format
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return res.status(400).json({ error: "Invalid email format" });
      }
      
      // Validate password length
      if (password.length < 6) {
        return res.status(400).json({ error: "Password must be at least 6 characters" });
      }
      
      // Enforce invite metadata - if invite has email/nodeName, must match
      if (invite.email && email.toLowerCase() !== invite.email.toLowerCase()) {
        return res.status(400).json({ error: "Email must match the invited email address" });
      }
      if (invite.nodeName && nodeName !== invite.nodeName) {
        return res.status(400).json({ error: "Node name must match the invited node name" });
      }
      
      // Check if email already exists
      const existingUser = await storage.getUserByEmail(email);
      if (existingUser) {
        return res.status(400).json({ error: "Email already registered" });
      }
      
      // Hash password
      const hashedPassword = await bcrypt.hash(password, 10);
      
      // Use a transaction to ensure user, node, and invite token update all succeed or all fail
      const result = await db.transaction(async (tx) => {
        // Create user as node type
        const [user] = await tx.insert(users).values({
          name,
          email,
          password: hashedPassword,
          phone: phone || null,
          type: 'node',
          roles: ['node', 'buyer'],
        }).returning();
        
        // Create node record
        const [nodeRecord] = await tx.insert(nodes).values({
          name: nodeName || `${name}'s Node`,
          address: address || '',
          city: '',
          userId: user.id,
          status: 'pending',
        }).returning();
        
        // Mark invite token as used
        await tx.update(inviteTokens)
          .set({ usedAt: new Date(), usedByUserId: user.id })
          .where(eq(inviteTokens.token, inviteToken));
        
        return { user, nodeRecord };
      });
      
      // Set session
      req.session.userId = result.user.id;
      notifyAdminNewAccount(name, email, 'node', `Node name: ${nodeName || name + "'s Node"} (via invite link)`);
      
      const { password: _, ...userWithoutPassword } = result.user;
      res.json({ 
        user: userWithoutPassword, 
        node: result.nodeRecord,
        message: "Registration successful! Your node is pending activation." 
      });
    } catch (error) {
      console.error("Node registration error:", error);
      res.status(500).json({ error: "Registration failed" });
    }
  });
  
  // ===== Image Proxy Route =====
  // Proxy external images to avoid CORS issues when drawing to canvas
  app.get("/api/image-proxy", async (req, res) => {
    try {
      const imageUrl = req.query.url as string;
      if (!imageUrl) {
        return res.status(400).json({ error: "Missing url parameter" });
      }
      
      // Validate URL
      let parsedUrl: URL;
      try {
        parsedUrl = new URL(imageUrl);
        if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
          return res.status(400).json({ error: "Invalid URL protocol" });
        }
      } catch {
        return res.status(400).json({ error: "Invalid URL" });
      }
      
      const response = await fetch(imageUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
        },
        redirect: 'follow',
      });
      
      if (!response.ok) {
        return res.status(response.status).json({ error: "Failed to fetch image" });
      }
      
      const contentType = response.headers.get('content-type') || 'image/jpeg';
      const buffer = Buffer.from(await response.arrayBuffer());
      
      res.setHeader('Content-Type', contentType);
      res.setHeader('Cache-Control', 'public, max-age=86400');
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.send(buffer);
    } catch (error: any) {
      console.error('Image proxy error:', error);
      res.status(500).json({ error: "Failed to proxy image" });
    }
  });
  
  // ===== Product Routes =====
  
  // Get all products with inventory
  // Query param: ?live=true returns only products that have inventory > 0 at any node
  app.get("/api/products", async (req, res) => {
    try {
      const liveOnly = req.query.live === 'true';
      const cityId = req.query.cityId as string | undefined;
      const allProducts = await storage.getAllProducts();
      
      // Build a map of base code to variant products for image aggregation
      const variantsByBaseCode = new Map<string, typeof allProducts>();
      for (const product of allProducts) {
        if (product.productCode) {
          // Extract base code (strip suffix after last dash if it looks like a variant suffix)
          const baseCode = product.variantSuffix 
            ? product.productCode.replace(new RegExp(`-${product.variantSuffix}$`), '')
            : product.productCode;
          if (!variantsByBaseCode.has(baseCode)) {
            variantsByBaseCode.set(baseCode, []);
          }
          variantsByBaseCode.get(baseCode)!.push(product);
        }
      }
      
      // Get active node IDs for filtering inventory (only show inventory at active nodes)
      const nodesForInventory = await storage.getAllNodesAdmin();
      let activeNodesFiltered = nodesForInventory.filter(n => n.status === 'active');
      if (cityId) {
        activeNodesFiltered = activeNodesFiltered.filter(n => n.servingCityId === cityId);
      }
      const activeNodeIdsForInv = new Set(activeNodesFiltered.map(n => n.id));
      
      // Fetch inventory for all products and normalize image/images field
      const productsWithInventory = await Promise.all(
        allProducts.map(async (product) => {
          const rawInventory = await storage.getInventoryByProduct(product.id);
          const inventory = liveOnly ? rawInventory.filter(inv => activeNodeIdsForInv.has(inv.nodeId)) : rawInventory;
          
          // Start with product's stored images array, fallback to single image
          let images: string[] = product.images && product.images.length > 0 
            ? [...product.images] 
            : (product.image ? [product.image] : []);
          
          // For parent products (no variantSuffix), also aggregate images from variants
          if (product.productCode && !product.variantSuffix) {
            const variants = variantsByBaseCode.get(product.productCode) || [];
            for (const variant of variants) {
              if (variant.id !== product.id) {
                // Add variant's stored images
                const variantImages = variant.images && variant.images.length > 0 
                  ? variant.images 
                  : (variant.image ? [variant.image] : []);
                for (const img of variantImages) {
                  if (img && !images.includes(img)) {
                    images.push(img);
                  }
                }
              }
            }
          }
          
          const deduped = new Map<string, number>();
          for (const inv of inventory) {
            const existing = deduped.get(inv.nodeId) || 0;
            deduped.set(inv.nodeId, Math.max(existing, parseInt(inv.quantity.toString())));
          }
          
          return {
            ...product,
            images,
            inventory: Array.from(deduped.entries()).map(([nodeId, quantity]) => ({
              nodeId,
              quantity
            }))
          };
        })
      );
      
      // If liveOnly, filter to products that have inventory > 0 AND are in active crates with active assignments at active nodes
      if (liveOnly) {
        const allCrates = await storage.getAllCrates();
        const allAssignments = await storage.getAllCrateAssignments();
        const allNodes = await storage.getAllNodesAdmin();
        let filteredNodes = allNodes.filter(n => n.status === 'active');
        if (cityId) {
          filteredNodes = filteredNodes.filter(n => n.servingCityId === cityId);
        }
        const activeNodeIds = new Set(filteredNodes.map(n => n.id));
        
        // A product is visible if it's in at least one crate that:
        // 1. Has isActive=true, AND
        // 2. Has at least one active assignment to an ACTIVE node
        const productsInActiveCrates = new Set<string>();
        
        for (const crate of allCrates) {
          if (!crate.isActive) continue;
          
          const crateAssignments = allAssignments.filter(a => a.crateId === crate.id);
          const hasActiveAssignmentAtActiveNode = crateAssignments.some(
            a => a.status === 'active' && activeNodeIds.has(a.nodeId)
          );
          
          if (hasActiveAssignmentAtActiveNode) {
            const items = await storage.getCrateItems(crate.id);
            items.forEach(item => productsInActiveCrates.add(item.productId));
          }
        }
        
        // Build parent-child stock map for variant groups
        const childrenByParent = new Map<string, typeof productsWithInventory>();
        for (const p of productsWithInventory) {
          if (p.parentProductId) {
            if (!childrenByParent.has(p.parentProductId)) {
              childrenByParent.set(p.parentProductId, []);
            }
            childrenByParent.get(p.parentProductId)!.push(p);
          }
        }
        
        const liveProducts = productsWithInventory.filter(product => {
          const children = childrenByParent.get(product.id) || [];
          const isComingSoon = product.comingSoon || children.some(child => child.comingSoon);
          
          if (isComingSoon) {
            if (!cityId) return true;
            const isInActiveCrate = productsInActiveCrates.has(product.id) || 
              children.some(child => productsInActiveCrates.has(child.id));
            return isInActiveCrate;
          }
          
          const ownStock = product.inventory.some(inv => inv.quantity > 0);
          const childrenStock = children.some(child => 
            child.inventory.some(inv => inv.quantity > 0)
          );
          const hasStock = ownStock || childrenStock;
          
          const isInActiveCrate = productsInActiveCrates.has(product.id) || 
            children.some(child => productsInActiveCrates.has(child.id));
            
          return hasStock && isInActiveCrate;
        });
        return res.json(liveProducts);
      }
      
      res.json(productsWithInventory);
    } catch (error) {
      console.error("Get products error:", error);
      res.status(500).json({ error: "Failed to fetch products" });
    }
  });
  
  // Get all deleted products (admin only) - MUST be before :id route
  app.get("/api/products/deleted", async (req, res) => {
    try {
      const deletedProducts = await storage.getDeletedProducts();
      const productsWithImages = deletedProducts.map(product => ({
        ...product,
        images: product.images || (product.image ? [product.image] : []),
      }));
      res.json(productsWithImages);
    } catch (error) {
      console.error("Get deleted products error:", error);
      res.status(500).json({ error: "Failed to get deleted products" });
    }
  });
  
  // Get products with hierarchy - MUST be before :id route
  app.get("/api/products/hierarchy", async (req, res) => {
    try {
      const products = await storage.getProductsWithHierarchy();
      res.json(products);
    } catch (error) {
      console.error("Get hierarchy error:", error);
      res.status(500).json({ error: "Failed to fetch product hierarchy" });
    }
  });
  
  // Get single product
  app.get("/api/products/:id", async (req, res) => {
    try {
      let product;
      const paramId = req.params.id;
      if (paramId.startsWith('prefix:')) {
        const prefix = paramId.substring(7);
        product = await storage.getProductByIdPrefix(prefix);
      } else {
        product = await storage.getProduct(paramId);
      }
      if (!product) {
        return res.status(404).json({ error: "Product not found" });
      }
      
      const rawInventory = await storage.getInventoryByProduct(product.id);
      const allNodesForProduct = await storage.getAllNodesAdmin();
      const activeNodeIdsForProduct = new Set(allNodesForProduct.filter(n => n.status === 'active').map(n => n.id));
      const inventory = rawInventory.filter(inv => activeNodeIdsForProduct.has(inv.nodeId));
      
      // Start with product's stored images array, fallback to single image
      let images: string[] = product.images && product.images.length > 0 
        ? [...product.images] 
        : (product.image ? [product.image] : []);
      
      // For parent products (no variantSuffix), also aggregate images from variants
      if (product.productCode && !product.variantSuffix) {
        const allProducts = await storage.getAllProducts();
        const variants = allProducts.filter(p => 
          p.id !== product.id && 
          p.productCode && 
          p.variantSuffix &&
          p.productCode.startsWith(product.productCode!)
        );
        for (const variant of variants) {
          // Add variant's stored images
          const variantImages = variant.images && variant.images.length > 0 
            ? variant.images 
            : (variant.image ? [variant.image] : []);
          for (const img of variantImages) {
            if (img && !images.includes(img)) {
              images.push(img);
            }
          }
        }
      }
      
      const deduped = new Map<string, number>();
      for (const inv of inventory) {
        const existing = deduped.get(inv.nodeId) || 0;
        deduped.set(inv.nodeId, Math.max(existing, parseInt(inv.quantity.toString())));
      }
      
      res.json({
        ...product,
        images,
        inventory: Array.from(deduped.entries()).map(([nodeId, quantity]) => ({
          nodeId,
          quantity
        }))
      });
    } catch (error) {
      console.error("Get product error:", error);
      res.status(500).json({ error: "Failed to fetch product" });
    }
  });
  
  // Insert blank product rows (admin only)
  app.post("/api/products/insert-rows", async (req, res) => {
    try {
      if (!req.session?.userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      
      const { afterRow, count } = req.body;
      
      if (typeof afterRow !== 'number' || typeof count !== 'number') {
        return res.status(400).json({ error: "afterRow and count must be numbers" });
      }
      
      if (count < 1 || count > 100) {
        return res.status(400).json({ error: "count must be between 1 and 100" });
      }
      
      const newProducts = await storage.insertProductRows(afterRow, count);
      res.json({ 
        success: true, 
        inserted: newProducts.length,
        products: newProducts.map(p => ({
          ...p,
          images: p.images || (p.image ? [p.image] : []),
        }))
      });
    } catch (error: any) {
      console.error("Insert product rows error:", error);
      res.status(500).json({ error: error.message || "Failed to insert product rows" });
    }
  });
  
  // Create product (admin only)
  app.post("/api/products", async (req, res) => {
    try {
      // Handle both image and images fields from frontend
      const { images, ...rest } = req.body;
      const imagesList = images && images.length > 0 ? images : (rest.image ? [rest.image] : []);
      const productData = {
        ...rest,
        image: imagesList[0] || '',
        images: imagesList, // Store all images
      };
      const parsed = insertProductSchema.parse(productData);
      const product = await storage.createProduct(parsed);
      res.json({
        ...product,
        images: product.images || (product.image ? [product.image] : []),
      });
    } catch (error) {
      console.error("Create product error:", error);
      res.status(400).json({ error: "Invalid product data" });
    }
  });
  
  // Update product (admin only)
  app.patch("/api/products/:id", async (req, res) => {
    try {
      // Handle both image and images fields from frontend
      const { images, ...rest } = req.body;
      const updateData = {
        ...rest,
        ...(images && images.length > 0 && { 
          image: images[0],
          images: images, // Store all images
        }),
      };
      // If category changes and subcategory wasn't explicitly set, clear it
      if (updateData.category && updateData.subcategory === undefined) {
        const existingProduct = await storage.getProduct(req.params.id);
        if (existingProduct && existingProduct.category !== updateData.category) {
          updateData.subcategory = null;
        }
      }
      
      const product = await storage.updateProduct(req.params.id, updateData);
      if (!product) {
        return res.status(404).json({ error: "Product not found" });
      }
      
      // If category or subcategory was updated, propagate to child products (variants and batches)
      if (updateData.category || updateData.subcategory !== undefined) {
        const allProducts = await storage.getAllProducts();
        const childProducts = allProducts.filter(p => p.parentProductId === req.params.id);
        const childUpdate: any = {};
        if (updateData.category) childUpdate.category = updateData.category;
        if (updateData.subcategory !== undefined) childUpdate.subcategory = updateData.subcategory;
        for (const child of childProducts) {
          await storage.updateProduct(child.id, childUpdate);
        }
      }
      
      res.json({
        ...product,
        images: product.images || (product.image ? [product.image] : []),
      });
    } catch (error) {
      console.error("Update product error:", error);
      res.status(500).json({ error: "Failed to update product" });
    }
  });
  
  // Delete product (soft delete - moves to deleted folder)
  app.delete("/api/products/:id", async (req, res) => {
    try {
      await storage.deleteProduct(req.params.id);
      res.json({ success: true });
    } catch (error) {
      console.error("Delete product error:", error);
      res.status(500).json({ error: "Failed to delete product" });
    }
  });
  
  // Restore a soft-deleted product
  app.post("/api/products/:id/restore", async (req, res) => {
    try {
      const product = await storage.restoreProduct(req.params.id);
      if (!product) {
        return res.status(404).json({ error: "Product not found" });
      }
      res.json({
        ...product,
        images: product.images || (product.image ? [product.image] : []),
      });
    } catch (error) {
      console.error("Restore product error:", error);
      res.status(500).json({ error: "Failed to restore product" });
    }
  });
  
  // Permanently delete a product (cannot be recovered)
  app.delete("/api/products/:id/permanent", async (req, res) => {
    try {
      await storage.permanentlyDeleteProduct(req.params.id);
      res.json({ success: true });
    } catch (error) {
      console.error("Permanent delete product error:", error);
      res.status(500).json({ error: "Failed to permanently delete product" });
    }
  });
  
  // Pickwhip: Link product A to product B (A becomes variant of B)
  app.post("/api/products/:sourceId/pickwhip/:targetId", async (req, res) => {
    try {
      if (!req.session?.userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      
      const { sourceId, targetId } = req.params;
      
      // Get both products
      const sourceProduct = await storage.getProduct(sourceId);
      const targetProduct = await storage.getProduct(targetId);
      
      if (!sourceProduct || !targetProduct) {
        return res.status(404).json({ error: "Product not found" });
      }
      
      if (!targetProduct.productCode) {
        return res.status(400).json({ error: "Target product has no product code" });
      }
      
      // Update source product: set its productCode to match target's, and set canonicalProductId to target
      const updatedProduct = await storage.updateProduct(sourceId, {
        productCode: targetProduct.productCode,
        canonicalProductId: targetId,
      });
      
      res.json({
        success: true,
        source: updatedProduct,
        target: targetProduct,
        message: `Product ${sourceProduct.productCode || sourceId} linked to ${targetProduct.productCode}`
      });
    } catch (error) {
      console.error("Pickwhip error:", error);
      res.status(500).json({ error: "Failed to link products" });
    }
  });
  
  // Unlink a variant product (remove canonicalProductId, optionally generate new code)
  app.post("/api/products/:id/unlink", async (req, res) => {
    try {
      if (!req.session?.userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      
      const product = await storage.getProduct(req.params.id);
      if (!product) {
        return res.status(404).json({ error: "Product not found" });
      }
      
      // Generate a new unique product code
      const generateCode = () => {
        const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
        let code = 'GM-';
        for (let i = 0; i < 4; i++) {
          code += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return code;
      };
      
      const newCode = generateCode();
      
      const updatedProduct = await storage.updateProduct(req.params.id, {
        productCode: newCode,
        canonicalProductId: null,
      });
      
      res.json({
        success: true,
        product: updatedProduct,
        message: `Product unlinked with new code ${newCode}`
      });
    } catch (error) {
      console.error("Unlink error:", error);
      res.status(500).json({ error: "Failed to unlink product" });
    }
  });
  
  // Toggle product stock status (in stock / out of stock) and sync to sheet
  app.post("/api/products/:id/toggle-stock", async (req, res) => {
    try {
      if (!req.session?.userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      const product = await storage.getProduct(req.params.id);
      if (!product) {
        return res.status(404).json({ error: "Product not found" });
      }

      const { inStock } = req.body;
      const previousQty = product.sheetQuantity || 0;
      const newQuantity = inStock ? Math.max(previousQty, 1) : 0;

      await storage.updateProduct(req.params.id, { sheetQuantity: newQuantity });

      let sheetSyncWarning: string | null = null;
      if (product.sheetSource && product.sheetRow) {
        try {
          const { getSpreadsheetMetadata, updateSpreadsheetCell } = await import('./services/googleSheets');
          const metadata = await getSpreadsheetMetadata(product.sheetSource);
          const sheetName = metadata.sheets?.[0]?.title || 'Sheet1';
          const cellRange = `${sheetName}!C${product.sheetRow}`;
          await updateSpreadsheetCell(product.sheetSource, cellRange, String(newQuantity));
        } catch (sheetError: any) {
          console.error("Failed to sync stock to sheet:", sheetError);
          sheetSyncWarning = "Stock updated locally but failed to sync to inventory sheet";
        }
      }

      try {
        const allAssignments = await storage.getAllCrateAssignments();
        const activeAssignments = allAssignments.filter(a => a.status === 'active');
        for (const assignment of activeAssignments) {
          const crateItems = await storage.getCrateItems(assignment.crateId);
          const matchingItem = crateItems.find(ci => ci.productId === req.params.id);
          if (matchingItem) {
            await storage.updateCrateItemQuantity(matchingItem.id, newQuantity);
            await storage.upsertInventory({
              productId: req.params.id,
              nodeId: assignment.nodeId,
              quantity: newQuantity,
            });
          }
        }
      } catch (syncError) {
        console.error("Failed to sync stock to inventory:", syncError);
      }

      const updated = await storage.getProduct(req.params.id);
      res.json({ ...updated, sheetSyncWarning });
    } catch (error) {
      console.error("Toggle stock error:", error);
      res.status(500).json({ error: "Failed to toggle stock status" });
    }
  });

  // Set product parent (for hierarchical linking)
  app.patch("/api/products/:id/parent", async (req, res) => {
    try {
      if (!req.session?.userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      
      const { parentProductId, relationshipType } = req.body;
      const productId = req.params.id;
      
      // Validate parent exists if provided
      if (parentProductId) {
        const parent = await storage.getProduct(parentProductId);
        if (!parent) {
          return res.status(404).json({ error: "Parent product not found" });
        }
        // Prevent self-parenting
        if (parentProductId === productId) {
          return res.status(400).json({ error: "Product cannot be its own parent" });
        }
        // Prevent circular references - check if potential parent is already a child
        const children = await storage.getProductChildren(productId);
        const hasCircular = children.some(c => c.id === parentProductId);
        if (hasCircular) {
          return res.status(400).json({ error: "Circular parent reference not allowed" });
        }
      }
      
      const product = await storage.setProductParent(productId, parentProductId || null, relationshipType || 'batch');
      if (!product) {
        return res.status(404).json({ error: "Product not found" });
      }
      
      res.json({ success: true, product });
    } catch (error) {
      console.error("Set parent error:", error);
      res.status(500).json({ error: "Failed to set product parent" });
    }
  });
  
  // ===== Node Routes =====
  
  // Get current user's node (for node hosts)
  app.get("/api/nodes/my-node", async (req, res) => {
    try {
      if (!req.session?.userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      
      const node = await storage.getNodeByUserId(req.session.userId);
      if (!node) {
        return res.status(404).json({ error: "No node found for this user" });
      }
      res.json(node);
    } catch (error) {
      console.error("Get my node error:", error);
      res.status(500).json({ error: "Failed to fetch node" });
    }
  });
  
  // Get all nodes
  app.get("/api/nodes", async (req, res) => {
    try {
      const allNodes = await storage.getAllNodesAdmin();
      res.json(allNodes);
    } catch (error) {
      console.error("Get nodes error:", error);
      res.status(500).json({ error: "Failed to fetch nodes" });
    }
  });
  
  // Get node by user ID
  app.get("/api/nodes/by-user/:userId", async (req, res) => {
    try {
      const node = await storage.getNodeByUserId(req.params.userId);
      if (!node) {
        return res.status(404).json({ error: "Node not found" });
      }
      res.json(node);
    } catch (error) {
      console.error("Get node error:", error);
      res.status(500).json({ error: "Failed to fetch node" });
    }
  });
  
  // Get node with availability
  app.get("/api/nodes/:id", async (req, res) => {
    try {
      const node = await storage.getNode(req.params.id);
      if (!node) {
        return res.status(404).json({ error: "Node not found" });
      }
      
      const availability = await storage.getNodeAvailability(node.id);
      res.json({ ...node, availability });
    } catch (error) {
      console.error("Get node error:", error);
      res.status(500).json({ error: "Failed to fetch node" });
    }
  });
  
  // Create node (admin only)
  app.post("/api/nodes", async (req, res) => {
    try {
      if (!req.session?.userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      
      const user = await storage.getUser(req.session.userId);
      if (!user || user.type !== 'admin') {
        return res.status(403).json({ error: "Admin access required" });
      }
      
      const { name, address, city, servingCityId, latitude, longitude, pickupInstructions, status, kitCount, kitFee, earningsPerHandoff, handoffTiers, availabilityNoticeHours, minimumAvailabilityHours } = req.body;
      
      if (!name || !address || !city) {
        return res.status(400).json({ error: "Name, address, and city are required" });
      }
      
      // Create the node - admin creates on behalf of themselves or a placeholder user
      const node = await storage.createNode({
        userId: req.session.userId, // Admin owns the node until assigned to a node host
        name,
        address,
        city,
        servingCityId: servingCityId || null,
        latitude: latitude || null,
        longitude: longitude || null,
        pickupInstructions: pickupInstructions || null,
        status: status || 'active',
        ...(kitCount != null ? { kitCount: Number(kitCount) } : {}),
        ...(kitFee != null ? { kitFee: String(kitFee) } : {}),
        ...(earningsPerHandoff != null ? { earningsPerHandoff: String(earningsPerHandoff) } : {}),
        ...(handoffTiers ? { handoffTiers } : {}),
        ...(availabilityNoticeHours != null ? { availabilityNoticeHours: Number(availabilityNoticeHours) } : {}),
        ...(minimumAvailabilityHours != null ? { minimumAvailabilityHours: Number(minimumAvailabilityHours) } : {}),
      });
      
      res.json(node);
    } catch (error) {
      console.error("Create node error:", error);
      res.status(500).json({ error: "Failed to create node" });
    }
  });
  
  // Delete node (admin only)
  app.delete("/api/nodes/:id", async (req, res) => {
    try {
      if (!req.session?.userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      
      const user = await storage.getUser(req.session.userId);
      if (!user || user.type !== 'admin') {
        return res.status(403).json({ error: "Admin access required" });
      }
      
      await storage.deleteNode(req.params.id);
      res.json({ success: true });
    } catch (error) {
      console.error("Delete node error:", error);
      res.status(500).json({ error: "Failed to delete node" });
    }
  });
  
  // Update node (admin or node owner)
  app.patch("/api/nodes/:id", async (req, res) => {
    try {
      if (!req.session?.userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      
      const user = await storage.getUser(req.session.userId);
      if (!user) {
        return res.status(401).json({ error: "User not found" });
      }
      
      const existingNode = await storage.getNode(req.params.id);
      if (!existingNode) {
        return res.status(404).json({ error: "Node not found" });
      }
      
      const isAdmin = user.type === 'admin';
      const isOwner = existingNode.userId === user.id;
      
      if (!isAdmin && !isOwner) {
        return res.status(403).json({ error: "Not authorized to update this node" });
      }
      
      // Node owners can update basic settings including notifications
      let updateData = req.body;
      if (!isAdmin) {
        const { name, pickupInstructions, notificationPhone, availabilityNoticeHours } = req.body;
        updateData = { name, pickupInstructions, notificationPhone, availabilityNoticeHours };
      }
      
      if (updateData.kitCount !== undefined && updateData.kitFee !== undefined) {
        updateData.monthlyFee = String((Number(updateData.kitCount) * parseFloat(String(updateData.kitFee))).toFixed(2));
      }

      if (updateData.status === 'active') {
        const lat = updateData.latitude ?? existingNode.latitude;
        const lng = updateData.longitude ?? existingNode.longitude;
        if (!lat || !lng) {
          return res.status(400).json({ error: "Cannot activate node without coordinates. Please set the node's location on the map first." });
        }
        if (!existingNode.activatedAt) {
          updateData.activatedAt = new Date();
        }
      }
      
      const node = await storage.updateNode(req.params.id, updateData);
      if (!node) {
        return res.status(404).json({ error: "Node not found" });
      }
      res.json(node);
    } catch (error) {
      console.error("Update node error:", error);
      res.status(500).json({ error: "Failed to update node" });
    }
  });
  
  // ===== Inventory Routes =====
  
  // Update inventory (admin only)
  app.post("/api/inventory", async (req, res) => {
    try {
      const { productId, nodeId, quantity } = req.body;
      
      // Check current inventory to see if listing is going live
      const currentInventory = await storage.getInventoryItem(productId, nodeId);
      const wasAtZero = !currentInventory || parseInt(currentInventory.quantity.toString()) === 0;
      const isGoingLive = wasAtZero && quantity > 0;
      
      const inventory = await storage.upsertInventory({
        productId,
        nodeId,
        quantity
      });
      
      // Also update the product's sheetQuantity to match
      // This ensures consistent display when frontend uses Math.max(invStock, sheetQty)
      await storage.updateProduct(productId, { sheetQuantity: quantity });

      // Sync crate item quantities to match, keeping crates as source of truth
      try {
        const allAssignments = await storage.getAllCrateAssignments();
        const nodeAssignments = allAssignments.filter(a => a.nodeId === nodeId && a.status === 'active');
        for (const assignment of nodeAssignments) {
          const crateItems = await storage.getCrateItems(assignment.crateId);
          const matchingItem = crateItems.find(ci => ci.productId === productId);
          if (matchingItem) {
            await storage.updateCrateItemQuantity(matchingItem.id, quantity);
            break;
          }
        }
      } catch (syncError) {
        console.error("Failed to sync crate item quantity:", syncError);
      }
      
      res.json(inventory);
    } catch (error) {
      console.error("Update inventory error:", error);
      res.status(500).json({ error: "Failed to update inventory" });
    }
  });

  // Update inventory by product and node (PUT variant)
  app.put("/api/inventory/:productId/:nodeId", async (req, res) => {
    try {
      const { productId, nodeId } = req.params;
      const { quantity } = req.body;

      const currentInventory = await storage.getInventoryItem(productId, nodeId);
      const wasAtZero = !currentInventory || parseInt(currentInventory.quantity.toString()) === 0;
      const isGoingLive = wasAtZero && quantity > 0;

      const inventory = await storage.upsertInventory({
        productId,
        nodeId,
        quantity
      });
      
      // Also update the product's sheetQuantity to match
      // This ensures consistent display when frontend uses Math.max(invStock, sheetQty)
      await storage.updateProduct(productId, { sheetQuantity: quantity });

      // Sync crate item quantities to match, keeping crates as source of truth
      try {
        const allAssignments = await storage.getAllCrateAssignments();
        const nodeAssignments = allAssignments.filter(a => a.nodeId === nodeId && a.status === 'active');
        for (const assignment of nodeAssignments) {
          const crateItems = await storage.getCrateItems(assignment.crateId);
          const matchingItem = crateItems.find(ci => ci.productId === productId);
          if (matchingItem) {
            await storage.updateCrateItemQuantity(matchingItem.id, quantity);
            break;
          }
        }
      } catch (syncError) {
        console.error("Failed to sync crate item quantity:", syncError);
      }

      res.json(inventory);
    } catch (error) {
      console.error("Update inventory error:", error);
      res.status(500).json({ error: "Failed to update inventory" });
    }
  });
  
  // Get inventory for a node
  app.get("/api/inventory/node/:nodeId", async (req, res) => {
    try {
      const inventory = await storage.getInventoryByNode(req.params.nodeId);
      res.json(inventory);
    } catch (error) {
      console.error("Get inventory error:", error);
      res.status(500).json({ error: "Failed to fetch inventory" });
    }
  });
  
  // ===== Order Routes =====

  // Get average prep time (order created -> ready) for a node
  app.get("/api/nodes/:nodeId/prep-time", async (req, res) => {
    try {
      const { nodeId } = req.params;
      const result = await db.execute(sql`
        SELECT 
          COUNT(*) as total_orders,
          AVG(EXTRACT(EPOCH FROM (ready_at - created_at))) as avg_seconds,
          MIN(EXTRACT(EPOCH FROM (ready_at - created_at))) as min_seconds,
          MAX(EXTRACT(EPOCH FROM (ready_at - created_at))) as max_seconds
        FROM orders 
        WHERE node_id = ${nodeId} 
          AND ready_at IS NOT NULL 
          AND status IN ('ready', 'picked_up', 'completed')
      `);
      const row = result.rows[0] as any;
      const avgSeconds = row?.avg_seconds ? parseFloat(row.avg_seconds) : null;
      const avgMinutes = avgSeconds ? Math.round(avgSeconds / 60) : null;
      
      res.json({
        nodeId,
        totalOrders: parseInt(row?.total_orders || '0'),
        avgMinutes,
        minMinutes: row?.min_seconds ? Math.round(parseFloat(row.min_seconds) / 60) : null,
        maxMinutes: row?.max_seconds ? Math.round(parseFloat(row.max_seconds) / 60) : null,
        exceedsThreshold: avgMinutes !== null && avgMinutes > 30,
      });
    } catch (error) {
      console.error("Error fetching prep time:", error);
      res.status(500).json({ error: "Failed to fetch prep time" });
    }
  });

  // Get average prep time for all nodes (admin)
  app.get("/api/admin/prep-times", async (req, res) => {
    try {
      if (!req.session?.userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const user = await storage.getUser(req.session.userId);
      if (!user || user.type !== 'admin') {
        return res.status(403).json({ error: "Admin access required" });
      }
      
      const result = await db.execute(sql`
        SELECT 
          o.node_id,
          n.name as node_name,
          COUNT(*) as total_orders,
          AVG(EXTRACT(EPOCH FROM (o.ready_at - o.created_at))) as avg_seconds,
          MIN(EXTRACT(EPOCH FROM (o.ready_at - o.created_at))) as min_seconds,
          MAX(EXTRACT(EPOCH FROM (o.ready_at - o.created_at))) as max_seconds,
          AVG(CASE WHEN o.picked_up_at IS NOT NULL AND o.ready_at IS NOT NULL 
              THEN EXTRACT(EPOCH FROM (o.picked_up_at - o.ready_at)) END) as avg_ready_to_pickup_seconds,
          AVG(CASE WHEN o.picked_up_at IS NOT NULL AND o.customer_arrived_at IS NOT NULL 
              THEN EXTRACT(EPOCH FROM (o.picked_up_at - o.customer_arrived_at)) END) as avg_here_to_pickup_seconds,
          AVG(CASE WHEN o.customer_arrived_at IS NOT NULL AND o.ready_at IS NOT NULL 
              THEN EXTRACT(EPOCH FROM (o.customer_arrived_at - o.ready_at)) END) as avg_ready_to_here_seconds
        FROM orders o
        JOIN nodes n ON n.id = o.node_id
        WHERE o.ready_at IS NOT NULL 
          AND o.status IN ('ready', 'picked_up', 'completed')
        GROUP BY o.node_id, n.name
        ORDER BY avg_seconds DESC
      `);
      
      const prepTimes = result.rows.map((row: any) => {
        const avgSeconds = parseFloat(row.avg_seconds);
        const avgMinutes = Math.round(avgSeconds / 60);
        const toMin = (val: string | null) => val ? Math.round(parseFloat(val) / 60) : null;
        return {
          nodeId: row.node_id,
          nodeName: row.node_name,
          totalOrders: parseInt(row.total_orders),
          avgMinutes,
          minMinutes: Math.round(parseFloat(row.min_seconds) / 60),
          maxMinutes: Math.round(parseFloat(row.max_seconds) / 60),
          exceedsThreshold: avgMinutes > 30,
          avgReadyToPickupMinutes: toMin(row.avg_ready_to_pickup_seconds),
          avgHereToPickupMinutes: toMin(row.avg_here_to_pickup_seconds),
          avgReadyToHereMinutes: toMin(row.avg_ready_to_here_seconds),
        };
      });
      
      res.json(prepTimes);
    } catch (error) {
      console.error("Error fetching admin prep times:", error);
      res.status(500).json({ error: "Failed to fetch prep times" });
    }
  });

  // Get all orders (or filter by buyer/node)
  app.get("/api/orders", async (req, res) => {
    try {
      const { buyerId, nodeId } = req.query;
      
      let orders;
      if (buyerId) {
        orders = await storage.getOrdersByBuyer(buyerId as string);
      } else if (nodeId) {
        orders = await storage.getOrdersByNode(nodeId as string);
      } else {
        orders = await storage.getAllOrders();
      }
      
      // Fetch order items, node, and product details for each order
      const ordersWithDetails = await Promise.all(
        orders.map(async (order) => {
          const items = await storage.getOrderItems(order.id);
          const node = await storage.getNode(order.nodeId);
          
          // Fetch product details for each item
          const itemsWithProducts = await Promise.all(
            items.map(async (item) => {
              const product = await storage.getProduct(item.productId);
              return { ...item, product };
            })
          );
          
          return { 
            ...order, 
            items: itemsWithProducts,
            nodeName: node?.name || 'Unknown Location'
          };
        })
      );
      
      res.json(ordersWithDetails);
    } catch (error) {
      console.error("Get orders error:", error);
      res.status(500).json({ error: "Failed to fetch orders" });
    }
  });

  // Get current user's orders with feedback
  app.get("/api/orders/my-orders", async (req, res) => {
    try {
      const userId = req.session?.userId;
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      const userOrders = await storage.getOrdersByBuyer(userId);
      
      // Fetch order items and feedback for each order
      const ordersWithDetails = await Promise.all(
        userOrders.map(async (order) => {
          const items = await storage.getOrderItems(order.id);
          const itemsWithProducts = await Promise.all(
            items.map(async (item) => {
              const product = await storage.getProduct(item.productId);
              return {
                id: item.id,
                productId: item.productId,
                productName: product?.name || 'Unknown Product',
                productCode: product?.productCode || '',
                quantity: item.quantity,
                price: item.price,
              };
            })
          );

          // Get feedback for this order
          const [feedback] = await db.select().from(orderFeedback).where(eq(orderFeedback.orderId, order.id));

          return {
            id: order.id,
            pickupCode: order.pickupCode,
            status: order.status,
            total: order.total,
            createdAt: order.createdAt,
            items: itemsWithProducts,
            feedback: feedback ? {
              rating: feedback.rating,
              comment: feedback.comment,
              createdAt: feedback.createdAt,
            } : undefined,
          };
        })
      );

      res.json(ordersWithDetails);
    } catch (error) {
      console.error("Get my orders error:", error);
      res.status(500).json({ error: "Failed to fetch orders" });
    }
  });

  // Submit feedback for an order
  app.post("/api/orders/:orderId/feedback", async (req, res) => {
    try {
      const userId = req.session?.userId;
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      const { orderId } = req.params;
      const { rating, comment } = req.body;

      if (!rating || rating < 1 || rating > 5) {
        return res.status(400).json({ error: "Rating must be between 1 and 5" });
      }

      // Verify the order belongs to the user
      const order = await storage.getOrder(orderId);
      if (!order) {
        return res.status(404).json({ error: "Order not found" });
      }
      if (order.buyerId !== userId) {
        return res.status(403).json({ error: "Not authorized to provide feedback for this order" });
      }
      if (order.status !== 'completed') {
        return res.status(400).json({ error: "Can only provide feedback for completed orders" });
      }

      // Check if feedback already exists
      const [existingFeedback] = await db.select().from(orderFeedback).where(eq(orderFeedback.orderId, orderId));
      if (existingFeedback) {
        return res.status(400).json({ error: "Feedback already submitted for this order" });
      }

      // Insert feedback
      const [feedback] = await db.insert(orderFeedback).values({
        orderId,
        userId,
        rating,
        comment: comment || null,
      }).returning();

      res.json({ success: true, feedback });
    } catch (error) {
      console.error("Submit feedback error:", error);
      res.status(500).json({ error: "Failed to submit feedback" });
    }
  });

  // Public feedback submission by order number (no login required)
  app.post("/api/feedback/submit", async (req, res) => {
    try {
      const { orderNumber, customerName, rating, comment } = req.body;

      if (!orderNumber || !orderNumber.trim()) {
        return res.status(400).json({ error: "Order number is required" });
      }

      if (!customerName || !customerName.trim()) {
        return res.status(400).json({ error: "Name is required" });
      }

      if (!comment || !comment.trim()) {
        return res.status(400).json({ error: "Feedback comment is required" });
      }

      if (!rating || rating < 1 || rating > 5) {
        return res.status(400).json({ error: "Rating must be between 1 and 5" });
      }

      // Find order by pickup code
      const allOrders = await storage.getAllOrders();
      const order = allOrders.find(o => o.pickupCode?.toUpperCase() === orderNumber.toUpperCase().trim());
      
      if (!order) {
        return res.status(404).json({ error: "Order not found. Please check your order number." });
      }

      // Check if feedback already exists for this order
      const [existingFeedback] = await db.select().from(orderFeedback).where(eq(orderFeedback.orderId, order.id));
      if (existingFeedback) {
        return res.status(400).json({ error: "Feedback has already been submitted for this order" });
      }

      // Insert feedback (use order's buyerId if available, otherwise null)
      const [feedback] = await db.insert(orderFeedback).values({
        orderId: order.id,
        userId: order.buyerId || 'anonymous',
        rating,
        comment: `[${customerName}] ${comment}`,
      }).returning();

      console.log(`Feedback submitted for order ${order.pickupCode} by ${customerName}`);
      res.json({ success: true, feedback });
    } catch (error) {
      console.error("Submit public feedback error:", error);
      res.status(500).json({ error: "Failed to submit feedback" });
    }
  });
  
  // Get single order
  app.get("/api/orders/:id", async (req, res) => {
    try {
      const order = await storage.getOrder(req.params.id);
      if (!order) {
        return res.status(404).json({ error: "Order not found" });
      }
      
      const items = await storage.getOrderItems(order.id);
      const node = await storage.getNode(order.nodeId);
      
      // Fetch product details for each item
      const itemsWithProducts = await Promise.all(
        items.map(async (item) => {
          const product = await storage.getProduct(item.productId);
          return { ...item, product };
        })
      );
      
      res.json({ 
        ...order, 
        items: itemsWithProducts,
        nodeName: node?.name || 'Unknown Location'
      });
    } catch (error) {
      console.error("Get order error:", error);
      res.status(500).json({ error: "Failed to fetch order" });
    }
  });
  
  // Create order
  app.post("/api/orders", async (req, res) => {
    try {
      // Check if user is a node host - they cannot make purchases
      if (req.session?.userId) {
        const user = await storage.getUser(req.session.userId);
        if (user?.type === 'node') {
          return res.status(403).json({ 
            error: "Node host accounts cannot make purchases. Please use a buyer account." 
          });
        }
      }
      
      const { items, ...orderData } = req.body;
      
      // Create the order
      const order = await storage.createOrder(orderData, items.map((item: any) => ({
        orderId: '', // Will be set by the storage layer
        productId: item.productId,
        quantity: item.quantity,
        price: item.price
      })));
      
      // Decrement crate assignment quantities and sync inventory
      if (orderData.nodeId) {
        for (const item of items) {
          await adjustCrateAssignmentQuantities(orderData.nodeId, item.productId, -item.quantity);
        }
        await syncCrateInventoryToNode(orderData.nodeId);
      }
      
      res.json(order);
    } catch (error) {
      console.error("Create order error:", error);
      res.status(500).json({ error: "Failed to create order" });
    }
  });
  
  // Update order status
  app.patch("/api/orders/:id/status", async (req, res) => {
    try {
      const { status } = req.body;
      const order = await storage.updateOrderStatus(req.params.id, status);
      if (!order) {
        return res.status(404).json({ error: "Order not found" });
      }
      
      // Send SMS notification when order is ready
      if (status === 'ready' && order.buyerPhone && !order.smsSent) {
        const node = await storage.getNode(order.nodeId);
        if (node) {
          // Use the locked-in pickup time from the order, not current node availability
          let availabilityWindow = order.pickupTime || '';
          let formattedPickupDate = '';
          let pickupDeadline = '';
          
          if (order.pickupDate) {
            const pickupDate = new Date(order.pickupDate);
            formattedPickupDate = pickupDate.toLocaleDateString('en-US', { 
              weekday: 'long', 
              month: 'long', 
              day: 'numeric', 
              year: 'numeric' 
            });
            
            // Extract the end time from the locked-in pickup window for the deadline
            if (order.pickupTime) {
              // pickupTime is typically "9:00 AM - 5:00 PM" format
              const timeParts = order.pickupTime.split(' - ');
              if (timeParts.length === 2) {
                pickupDeadline = timeParts[1].trim(); // The end time
              }
            }
          }
          
          const smsResult = await sendOrderReadySms(order.buyerPhone, {
            orderId: order.id,
            pickupCode: order.pickupCode,
            nodeName: node.name,
            nodeAddress: `${node.address}, ${node.city}`,
            availabilityWindow: availabilityWindow || undefined,
            pickupDate: formattedPickupDate || undefined,
            pickupDeadline: pickupDeadline || undefined,
            pickupInstructions: node.pickupInstructions || undefined,
          });
          
          if (smsResult.success) {
            await storage.markOrderSmsSent(order.id);
          }
        }
      }
      
      // Send SMS notification when order is completed/picked_up (manual completion from dashboard)
      if ((status === 'completed' || status === 'picked_up') && order.buyerPhone) {
        await sendOrderCompleteSms(order.buyerPhone, {
          orderId: order.id,
        });
        console.log(`Order ${order.pickupCode} marked as ${status} via dashboard, thank you SMS sent`);
      }
      
      res.json(order);
    } catch (error) {
      console.error("Update order status error:", error);
      res.status(500).json({ error: "Failed to update order status" });
    }
  });

  // Customer cancel order - refunds, restocks, notifies node host
  app.post("/api/orders/:orderId/cancel", async (req, res) => {
    try {
      const userId = req.session?.userId;
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      
      const { orderId } = req.params;
      const order = await storage.getOrder(orderId);
      
      if (!order) {
        return res.status(404).json({ error: "Order not found" });
      }
      
      // Verify the user owns this order
      if (order.buyerId !== userId) {
        return res.status(403).json({ error: "You can only cancel your own orders" });
      }
      
      // Check if order can be cancelled (not already picked up, cancelled, or refunded)
      const nonCancellableStatuses = ['picked_up', 'completed', 'cancelled', 'canceled', 'refunded', 'expired'];
      if (nonCancellableStatuses.includes(order.status)) {
        return res.status(400).json({ error: `Cannot cancel an order with status: ${order.status}` });
      }
      
      // Calculate refund amount before making any changes
      const orderTotal = parseFloat(order.total);
      const alreadyRefunded = parseFloat(order.refundedAmount || '0');
      const amountToRefund = orderTotal - alreadyRefunded;
      
      // Process full refund if there's a payment and amount to refund
      let refundResult = null;
      if (order.stripePaymentIntentId && amountToRefund > 0) {
        const stripe = await getUncachableStripeClient();
        refundResult = await stripe.refunds.create({
          payment_intent: order.stripePaymentIntentId,
          amount: Math.round(amountToRefund * 100),
          reason: 'requested_by_customer',
        });
        
        await storage.updateOrder(orderId, { refundedAmount: orderTotal.toFixed(2) });
      }
      
      // Update order status to cancelled
      await storage.updateOrderStatus(orderId, 'cancelled');
      
      // Restock by restoring crate assignment quantities and syncing inventory
      const orderItems = await storage.getOrderItems(orderId);
      if (order.nodeId) {
        for (const item of orderItems) {
          if (item.productId) {
            try {
              await adjustCrateAssignmentQuantities(order.nodeId, item.productId, item.quantity);
            } catch (restockError) {
              console.error(`Failed to restock product ${item.productId}:`, restockError);
            }
          }
        }
        await syncCrateInventoryToNode(order.nodeId);
      }
      
      // Get node for SMS notification
      const node = await storage.getNode(order.nodeId);
      
      // Send SMS to node host about cancellation
      if (node?.notificationPhone) {
        const itemSummary = orderItems.map((item: any) => 
          `${item.product?.productCode || 'Unknown'} x${item.quantity}`
        ).join(', ');
        
        const hostMessage = `Order #${order.pickupCode} has been CANCELLED by the customer. Items restocked: ${itemSummary}. No action needed.`;
        
        try {
          await sendSms(node.notificationPhone, hostMessage);
        } catch (smsError) {
          console.error("Failed to send cancellation SMS to host:", smsError);
        }
      }
      
      // Send confirmation SMS to customer using the pre-calculated refund amount
      if (order.buyerPhone) {
        const customerMessage = amountToRefund > 0
          ? `Your GridMart order #${order.pickupCode} has been cancelled. A refund of $${amountToRefund.toFixed(2)} will be returned to your original payment method within 5-10 business days.`
          : `Your GridMart order #${order.pickupCode} has been cancelled.`;
        
        try {
          await sendSms(order.buyerPhone, customerMessage);
        } catch (smsError) {
          console.error("Failed to send cancellation SMS to customer:", smsError);
        }
      }
      
      res.json({ 
        success: true, 
        message: "Order cancelled successfully",
        refunded: !!refundResult,
        refundAmount: amountToRefund
      });
    } catch (error: any) {
      console.error("Cancel order error:", error);
      res.status(500).json({ error: error.message || "Failed to cancel order" });
    }
  });

  // Feedback routes
  app.post("/api/feedback", async (req, res) => {
    try {
      const { orderId, hostRating, overallRating, comment } = req.body;
      
      if (!orderId || !hostRating || !overallRating) {
        return res.status(400).json({ error: "orderId, hostRating, and overallRating are required" });
      }
      
      const order = await storage.getOrder(orderId);
      if (!order) {
        return res.status(404).json({ error: "Order not found" });
      }
      
      const existingFeedback = await storage.getFeedbackByOrderId(orderId);
      if (existingFeedback) {
        return res.status(400).json({ error: "Feedback already submitted for this order" });
      }
      
      const feedback = await storage.createFeedback({
        orderId,
        buyerId: order.buyerId,
        nodeId: order.nodeId,
        hostRating,
        overallRating,
        comment: comment || null,
      });
      
      res.status(201).json(feedback);
    } catch (error) {
      console.error("Create feedback error:", error);
      res.status(500).json({ error: "Failed to submit feedback" });
    }
  });

  app.get("/api/feedback", async (req, res) => {
    try {
      const feedback = await storage.getAllFeedback();
      res.json(feedback);
    } catch (error) {
      console.error("Get feedback error:", error);
      res.status(500).json({ error: "Failed to get feedback" });
    }
  });

  app.get("/api/feedback/order/:orderId", async (req, res) => {
    try {
      const feedback = await storage.getFeedbackByOrderId(req.params.orderId);
      res.json(feedback || null);
    } catch (error) {
      console.error("Get order feedback error:", error);
      res.status(500).json({ error: "Failed to get feedback" });
    }
  });

  app.get("/api/feedback/node/:nodeId", async (req, res) => {
    try {
      const feedback = await storage.getFeedbackByNodeId(req.params.nodeId);
      res.json(feedback);
    } catch (error) {
      console.error("Get node feedback error:", error);
      res.status(500).json({ error: "Failed to get feedback" });
    }
  });
  
  // Listing Template routes
  app.get("/api/listing-templates", async (req, res) => {
    try {
      const templates = await storage.getAllListingTemplates();
      res.json(templates);
    } catch (error) {
      console.error("Get listing templates error:", error);
      res.status(500).json({ error: "Failed to get listing templates" });
    }
  });
  
  app.get("/api/listing-templates/:id", async (req, res) => {
    try {
      const template = await storage.getListingTemplate(req.params.id);
      if (!template) {
        return res.status(404).json({ error: "Template not found" });
      }
      res.json(template);
    } catch (error) {
      console.error("Get listing template error:", error);
      res.status(500).json({ error: "Failed to get template" });
    }
  });
  
  app.post("/api/listing-templates", async (req, res) => {
    try {
      const template = await storage.createListingTemplate(req.body);
      res.status(201).json(template);
    } catch (error) {
      console.error("Create listing template error:", error);
      res.status(500).json({ error: "Failed to create template" });
    }
  });
  
  app.patch("/api/listing-templates/:id", async (req, res) => {
    try {
      const template = await storage.updateListingTemplate(req.params.id, req.body);
      if (!template) {
        return res.status(404).json({ error: "Template not found" });
      }
      res.json(template);
    } catch (error) {
      console.error("Update listing template error:", error);
      res.status(500).json({ error: "Failed to update template" });
    }
  });
  
  app.delete("/api/listing-templates/:id", async (req, res) => {
    try {
      await storage.deleteListingTemplate(req.params.id);
      res.json({ success: true });
    } catch (error) {
      console.error("Delete listing template error:", error);
      res.status(500).json({ error: "Failed to delete template" });
    }
  });
  
  // Category routes
  app.get("/api/categories", async (req, res) => {
    try {
      const categoriesList = await storage.getAllCategories();
      res.json(categoriesList);
    } catch (error) {
      console.error("Get categories error:", error);
      res.status(500).json({ error: "Failed to get categories" });
    }
  });
  
  app.post("/api/categories", async (req, res) => {
    try {
      const { name, description, parentId } = req.body;
      if (!name) {
        return res.status(400).json({ error: "Category name is required" });
      }
      const category = await storage.createCategory({ name, description, parentId: parentId || null });
      res.json(category);
    } catch (error: any) {
      console.error("Create category error:", error);
      if (error.code === '23505') {
        return res.status(400).json({ error: "Category already exists" });
      }
      res.status(500).json({ error: "Failed to create category" });
    }
  });
  
  app.patch("/api/categories/:id", async (req, res) => {
    try {
      const { name, description, parentId } = req.body;
      const oldCategory = await storage.getCategory(req.params.id);
      const updateData: any = {};
      if (name !== undefined) updateData.name = name;
      if (description !== undefined) updateData.description = description;
      if (parentId !== undefined) updateData.parentId = parentId;
      const category = await storage.updateCategory(req.params.id, updateData);
      if (!category) {
        return res.status(404).json({ error: "Category not found" });
      }
      
      // If name changed, update products referencing the old name
      if (oldCategory && name && name !== oldCategory.name) {
        const allProducts = await storage.getAllProducts();
        if (oldCategory.parentId) {
          // Subcategory renamed - update products' subcategory field
          for (const p of allProducts) {
            if (p.subcategory === oldCategory.name) {
              await storage.updateProduct(p.id, { subcategory: name });
            }
          }
        } else {
          // Parent category renamed - update products' category field
          for (const p of allProducts) {
            if (p.category === oldCategory.name) {
              await storage.updateProduct(p.id, { category: name });
            }
          }
        }
      }
      
      res.json(category);
    } catch (error: any) {
      console.error("Update category error:", error);
      if (error.code === '23505') {
        return res.status(400).json({ error: "Category already exists" });
      }
      res.status(500).json({ error: "Failed to update category" });
    }
  });
  
  app.delete("/api/categories/:id", async (req, res) => {
    try {
      const allCats = await storage.getAllCategories();
      const deletedCat = allCats.find(c => c.id === req.params.id);
      const subcats = allCats.filter(c => c.parentId === req.params.id);
      const allProducts = await storage.getAllProducts();
      
      // Clear subcategory from products when a subcategory is deleted
      if (deletedCat?.parentId) {
        for (const p of allProducts) {
          if (p.subcategory === deletedCat.name) {
            await storage.updateProduct(p.id, { subcategory: null });
          }
        }
      }
      
      // Delete subcategories and clear their product references
      for (const sub of subcats) {
        for (const p of allProducts) {
          if (p.subcategory === sub.name) {
            await storage.updateProduct(p.id, { subcategory: null });
          }
        }
        await storage.deleteCategory(sub.id);
      }
      
      await storage.deleteCategory(req.params.id);
      res.json({ success: true });
    } catch (error) {
      console.error("Delete category error:", error);
      res.status(500).json({ error: "Failed to delete category" });
    }
  });
  
  app.post("/api/categories/reorder", async (req, res) => {
    try {
      const { orderedIds } = req.body;
      if (!orderedIds || !Array.isArray(orderedIds)) {
        return res.status(400).json({ error: "orderedIds array required" });
      }
      await storage.reorderCategories(orderedIds);
      res.json({ success: true });
    } catch (error) {
      console.error("Reorder categories error:", error);
      res.status(500).json({ error: "Failed to reorder categories" });
    }
  });
  
  // Reorder products within a category
  app.post("/api/products/reorder", async (req, res) => {
    try {
      const { orderedIds } = req.body;
      if (!orderedIds || !Array.isArray(orderedIds)) {
        return res.status(400).json({ error: "orderedIds array required" });
      }
      await storage.reorderProducts(orderedIds);
      res.json({ success: true });
    } catch (error) {
      console.error("Reorder products error:", error);
      res.status(500).json({ error: "Failed to reorder products" });
    }
  });
  
  // Promo code routes
  app.get("/api/promo-codes", async (req, res) => {
    try {
      const promoCodes = await storage.getAllPromoCodes();
      res.json(promoCodes);
    } catch (error) {
      console.error("Get promo codes error:", error);
      res.status(500).json({ error: "Failed to get promo codes" });
    }
  });
  
  app.get("/api/promo-codes/:id", async (req, res) => {
    try {
      const promoCode = await storage.getPromoCode(req.params.id);
      if (!promoCode) {
        return res.status(404).json({ error: "Promo code not found" });
      }
      res.json(promoCode);
    } catch (error) {
      console.error("Get promo code error:", error);
      res.status(500).json({ error: "Failed to get promo code" });
    }
  });
  
  app.post("/api/promo-codes", async (req, res) => {
    try {
      const { code, name, discountType, discountValue, ...rest } = req.body;
      if (!code || !name || !discountType || discountValue === undefined) {
        return res.status(400).json({ error: "code, name, discountType, and discountValue are required" });
      }
      const promoCode = await storage.createPromoCode({
        code: code.toUpperCase(),
        name,
        discountType,
        discountValue: String(discountValue),
        ...rest,
      });
      res.json(promoCode);
    } catch (error: any) {
      console.error("Create promo code error:", error);
      if (error.code === '23505') {
        return res.status(400).json({ error: "A promo code with this code already exists" });
      }
      res.status(500).json({ error: "Failed to create promo code" });
    }
  });
  
  app.patch("/api/promo-codes/:id", async (req, res) => {
    try {
      const updateData = { ...req.body };
      if (updateData.code) {
        updateData.code = updateData.code.toUpperCase();
      }
      if (updateData.discountValue !== undefined) {
        updateData.discountValue = String(updateData.discountValue);
      }
      if (updateData.minOrderAmount !== undefined) {
        updateData.minOrderAmount = updateData.minOrderAmount ? String(updateData.minOrderAmount) : null;
      }
      const promoCode = await storage.updatePromoCode(req.params.id, updateData);
      if (!promoCode) {
        return res.status(404).json({ error: "Promo code not found" });
      }
      res.json(promoCode);
    } catch (error: any) {
      console.error("Update promo code error:", error);
      if (error.code === '23505') {
        return res.status(400).json({ error: "A promo code with this code already exists" });
      }
      res.status(500).json({ error: "Failed to update promo code" });
    }
  });
  
  app.delete("/api/promo-codes/:id", async (req, res) => {
    try {
      await storage.deletePromoCode(req.params.id);
      res.json({ success: true });
    } catch (error) {
      console.error("Delete promo code error:", error);
      res.status(500).json({ error: "Failed to delete promo code" });
    }
  });
  
  app.get("/api/nodes/:nodeId/coupons", async (req, res) => {
    try {
      const userId = req.session?.userId;
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const user = await storage.getUser(userId);
      const node = await storage.getNode(req.params.nodeId);
      if (!node) {
        return res.status(404).json({ error: "Node not found" });
      }
      if (node.userId !== userId && user?.type !== 'admin') {
        return res.status(403).json({ error: "Not authorized" });
      }
      const coupons = await storage.getPromoCodesByNodeId(req.params.nodeId);
      res.json(coupons);
    } catch (error) {
      console.error("Get node coupons error:", error);
      res.status(500).json({ error: "Failed to get node coupons" });
    }
  });

  app.post("/api/promo-codes/batch", async (req, res) => {
    try {
      if (!req.session?.userId) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      const user = await storage.getUser(req.session.userId);
      if (!user || user.type !== 'admin') {
        return res.status(403).json({ error: "Forbidden - admin access required" });
      }

      const { count, prefix, assignedNodeId, discountType, discountValue, minOrderAmount, validFrom, validTo, name, description, giftProductIds, giftQuantity, giftPoolSize, giftSelectCount, benefits } = req.body;

      if (!count || count < 1 || count > 100) {
        return res.status(400).json({ error: "Count must be between 1 and 100" });
      }
      if (!assignedNodeId) {
        return res.status(400).json({ error: "Batch codes must be assigned to a node host" });
      }

      const batchId = `BATCH-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`;
      const codePrefix = prefix || '';
      const codes: any[] = [];

      for (let i = 0; i < count; i++) {
        const randomPart = Math.random().toString(36).substring(2, 8).toUpperCase();
        const code = codePrefix ? `${codePrefix}-${randomPart}` : randomPart;

        const created = await storage.createPromoCode({
          code,
          name: name || `Batch Code ${i + 1}`,
          description: description || null,
          discountType: discountType || 'percentage',
          discountValue: discountValue || '0',
          minOrderAmount: minOrderAmount || null,
          maxUses: 1,
          maxUsesPerCustomer: 1,
          validFrom: validFrom ? new Date(validFrom) : null,
          validTo: validTo ? new Date(validTo) : null,
          status: 'active',
          stackable: false,
          giftProductIds: giftProductIds || null,
          giftQuantity: giftQuantity || 1,
          giftPoolSize: giftPoolSize || null,
          giftSelectCount: giftSelectCount || null,
          benefits: benefits || null,
          assignedNodeId,
          batchId,
          givenOut: false,
        });
        codes.push(created);
      }

      res.json({ batchId, codes, count: codes.length });
    } catch (error: any) {
      console.error("Batch promo code generation error:", error);
      if (error.message?.includes('unique')) {
        return res.status(400).json({ error: "Code generation conflict - please try again" });
      }
      res.status(500).json({ error: "Failed to generate batch codes" });
    }
  });

  app.patch("/api/promo-codes/:id/given-out", async (req, res) => {
    try {
      const userId = req.session?.userId;
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const user = await storage.getUser(userId);
      const promoCode = await storage.getPromoCode(req.params.id);
      if (!promoCode) {
        return res.status(404).json({ error: "Promo code not found" });
      }
      if (promoCode.assignedNodeId) {
        const node = await storage.getNode(promoCode.assignedNodeId);
        if (!node || (node.userId !== userId && user?.type !== 'admin')) {
          return res.status(403).json({ error: "Not authorized" });
        }
      } else if (user?.type !== 'admin') {
        return res.status(403).json({ error: "Not authorized" });
      }

      const { givenOut } = req.body;
      const updated = await storage.updatePromoCodeGivenOut(req.params.id, !!givenOut);
      res.json(updated);
    } catch (error) {
      console.error("Update given out error:", error);
      res.status(500).json({ error: "Failed to update coupon" });
    }
  });

  app.post("/api/promo-codes/:id/send-sms", async (req, res) => {
    try {
      const userId = req.session?.userId;
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const user = await storage.getUser(userId);
      const promoCode = await storage.getPromoCode(req.params.id);
      if (!promoCode) {
        return res.status(404).json({ error: "Promo code not found" });
      }
      if (promoCode.assignedNodeId) {
        const node = await storage.getNode(promoCode.assignedNodeId);
        if (!node || (node.userId !== userId && user?.type !== 'admin')) {
          return res.status(403).json({ error: "Not authorized" });
        }
      } else if (user?.type !== 'admin') {
        return res.status(403).json({ error: "Not authorized" });
      }

      const { phone } = req.body;
      if (!phone || typeof phone !== 'string') {
        return res.status(400).json({ error: "Phone number is required" });
      }

      const normalized = phone.replace(/[^\d+]/g, '');
      if (normalized.length < 10) {
        return res.status(400).json({ error: "Invalid phone number" });
      }

      const discountDesc = promoCode.discountType === 'percentage'
        ? `${promoCode.discountValue}% off`
        : promoCode.discountType === 'fixed'
        ? `$${parseFloat(promoCode.discountValue).toFixed(2)} off`
        : 'a special deal';

      const message = `You've been gifted a GridMart coupon! Use code ${promoCode.code} at checkout for ${discountDesc}. Happy shopping!`;

      const smsResult = await sendSms(normalized, message);
      if (!smsResult.success) {
        return res.status(500).json({ error: smsResult.error || "Failed to send SMS" });
      }

      await storage.updatePromoCodeGivenOut(req.params.id, true);

      res.json({ success: true, message: "Coupon sent via SMS" });
    } catch (error) {
      console.error("Send coupon SMS error:", error);
      res.status(500).json({ error: "Failed to send coupon SMS" });
    }
  });

  // Validate promo code (for checkout)
  app.post("/api/promo-codes/validate", async (req, res) => {
    try {
      const { code, orderTotal, nodeId } = req.body;
      const userId = req.session?.userId;
      
      if (!code) {
        return res.status(400).json({ error: "Promo code is required" });
      }
      
      const promoCode = await storage.getPromoCodeByCode(code);
      if (!promoCode) {
        return res.status(404).json({ error: "Invalid promo code" });
      }
      
      if (userId && promoCode.assignedNodeId) {
        const assignedNode = await storage.getNode(promoCode.assignedNodeId);
        if (assignedNode && assignedNode.userId === userId) {
          return res.status(400).json({ error: "You cannot use a coupon assigned to your own node" });
        }
      }
      
      if (promoCode.nodeOnly && promoCode.assignedNodeId && nodeId && promoCode.assignedNodeId !== nodeId) {
        const assignedNode = await storage.getNode(promoCode.assignedNodeId);
        const nodeName = assignedNode?.name || 'the assigned node';
        return res.status(400).json({ error: `This coupon can only be used at ${nodeName}` });
      }
      
      // Check if active
      if (promoCode.status !== 'active') {
        return res.status(400).json({ error: "This promo code is no longer active" });
      }
      
      // Check dates
      const now = new Date();
      if (promoCode.validFrom && new Date(promoCode.validFrom) > now) {
        return res.status(400).json({ error: "This promo code is not yet valid" });
      }
      if (promoCode.validTo && new Date(promoCode.validTo) < now) {
        return res.status(400).json({ error: "This promo code has expired" });
      }
      
      // Check total usage limit
      if (promoCode.maxUses && promoCode.usedCount >= promoCode.maxUses) {
        return res.status(400).json({ error: "This promo code has reached its usage limit" });
      }
      
      // Check per-customer usage limit (defaults to 1 per account)
      if (userId) {
        const perCustomerLimit = promoCode.maxUsesPerCustomer || 1;
        const userUsageCount = await storage.getPromoCodeUsageCount(promoCode.id, userId);
        if (userUsageCount >= perCustomerLimit) {
          return res.status(400).json({ error: "You have already used this promo code" });
        }
      }
      
      // Check minimum order amount
      const minAmount = promoCode.minOrderAmount ? parseFloat(promoCode.minOrderAmount) : 0;
      if (orderTotal !== undefined && orderTotal < minAmount) {
        return res.status(400).json({ error: `Minimum order of $${minAmount.toFixed(2)} required for this code` });
      }
      
      // Calculate discount
      const discountValue = parseFloat(promoCode.discountValue);
      let discountAmount = 0;
      if (promoCode.discountType === 'percentage') {
        discountAmount = orderTotal ? (orderTotal * discountValue / 100) : 0;
      } else if (promoCode.discountType === 'fixed') {
        discountAmount = discountValue;
      }
      // Gift types don't have a discount amount - they add free products
      
      // Fetch gift products if applicable
      let giftProducts: any[] = [];
      const giftProductIds = (promoCode as any).giftProductIds;
      if ((promoCode.discountType === 'free_gift' || promoCode.discountType === 'gift_choice') && giftProductIds && giftProductIds.length > 0) {
        const products = await storage.getProductsByIds(giftProductIds);
        giftProducts = products.map(p => ({
          id: p.id,
          name: p.name,
          code: p.productCode,
          images: p.images,
          price: p.price,
        }));
      }
      
      // Handle combo promo codes - fetch products for each benefit
      const benefits = (promoCode as any).benefits;
      let comboBenefits: any[] = [];
      if (promoCode.discountType === 'combo' && benefits && Array.isArray(benefits)) {
        for (const benefit of benefits) {
          if (benefit.type === 'percentage' || benefit.type === 'fixed') {
            // Calculate discount for combo
            if (benefit.type === 'percentage') {
              discountAmount = orderTotal ? (orderTotal * benefit.value / 100) : 0;
            } else {
              discountAmount = benefit.value;
            }
            comboBenefits.push({
              type: benefit.type,
              value: benefit.value,
              discountAmount,
            });
          } else if (benefit.type === 'free_gift' && benefit.productIds?.length > 0) {
            const products = await storage.getProductsByIds(benefit.productIds);
            comboBenefits.push({
              type: 'free_gift',
              quantity: benefit.quantity || 1,
              products: products.map(p => ({
                id: p.id,
                name: p.name,
                code: p.productCode,
                images: p.images,
                price: p.price,
              })),
            });
          } else if (benefit.type === 'gift_choice' && benefit.productIds?.length > 0) {
            const products = await storage.getProductsByIds(benefit.productIds);
            comboBenefits.push({
              type: 'gift_choice',
              poolSize: benefit.poolSize || products.length,
              selectCount: benefit.selectCount || 1,
              products: products.map(p => ({
                id: p.id,
                name: p.name,
                code: p.productCode,
                images: p.images,
                price: p.price,
              })),
            });
          }
        }
      }
      
      res.json({
        valid: true,
        promoCode: {
          id: promoCode.id,
          code: promoCode.code,
          name: promoCode.name,
          discountType: promoCode.discountType,
          discountValue: discountValue,
          stackable: promoCode.stackable,
          giftProductIds: giftProductIds,
          giftQuantity: (promoCode as any).giftQuantity,
          giftPoolSize: (promoCode as any).giftPoolSize,
          giftSelectCount: (promoCode as any).giftSelectCount,
          benefits: benefits,
        },
        discountAmount,
        giftProducts,
        comboBenefits,
      });
    } catch (error) {
      console.error("Validate promo code error:", error);
      res.status(500).json({ error: "Failed to validate promo code" });
    }
  });
  
  // Delete order (admin only)
  // Edit manual sale details (admin only)
  app.patch("/api/orders/:id/manual-sale", async (req, res) => {
    try {
      if (!req.session?.userId) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      const user = await storage.getUser(req.session.userId);
      if (!user || user.type !== 'admin') {
        return res.status(403).json({ error: "Forbidden - admin access required" });
      }
      
      const orderId = req.params.id;
      const order = await storage.getOrder(orderId);
      if (!order) {
        return res.status(404).json({ error: "Order not found" });
      }
      if (order.saleSource === 'online' || !order.saleSource) {
        return res.status(400).json({ error: "Only manual sales can be edited" });
      }
      
      const { buyerName, buyerPhone, buyerEmail, pickupDate, saleNotes, paymentMethod, total } = req.body;
      
      const updates: any = {};
      if (buyerName !== undefined) updates.buyerName = buyerName;
      if (buyerPhone !== undefined) updates.buyerPhone = buyerPhone;
      if (buyerEmail !== undefined) updates.buyerEmail = buyerEmail;
      if (pickupDate !== undefined) {
        updates.pickupDate = pickupDate;
        updates.createdAt = new Date(pickupDate + 'T12:00:00');
      }
      if (saleNotes !== undefined) updates.saleNotes = saleNotes;
      if (paymentMethod !== undefined) updates.paymentMethod = paymentMethod;
      if (total !== undefined) updates.total = total;
      
      const updatedOrder = await storage.updateOrder(orderId, updates);
      res.json(updatedOrder);
    } catch (error) {
      console.error("Edit manual sale error:", error);
      res.status(500).json({ error: "Failed to update manual sale" });
    }
  });

  app.patch("/api/orders/:id/assign-node", async (req, res) => {
    try {
      if (!req.session?.userId) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      const user = await storage.getUser(req.session.userId);
      if (!user || user.type !== 'admin') {
        return res.status(403).json({ error: "Forbidden - admin access required" });
      }

      const orderId = req.params.id;
      const { nodeId } = req.body;

      const order = await storage.getOrder(orderId);
      if (!order) {
        return res.status(404).json({ error: "Order not found" });
      }

      const updates: any = { nodeId: nodeId || null };
      const updatedOrder = await storage.updateOrder(orderId, updates);
      res.json(updatedOrder);
    } catch (error) {
      console.error("Assign node to order error:", error);
      res.status(500).json({ error: "Failed to assign node" });
    }
  });

  app.delete("/api/orders/:id", async (req, res) => {
    try {
      if (!req.session?.userId) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      const user = await storage.getUser(req.session.userId);
      if (!user || user.type !== 'admin') {
        return res.status(403).json({ error: "Forbidden - admin access required" });
      }
      
      const orderId = req.params.id;
      const order = await storage.getOrder(orderId);
      if (!order) {
        return res.status(404).json({ error: "Order not found" });
      }
      
      const deleted = await storage.deleteOrder(orderId);
      if (deleted) {
        res.json({ success: true, message: "Order deleted successfully" });
      } else {
        res.status(500).json({ error: "Failed to delete order" });
      }
    } catch (error) {
      console.error("Delete order error:", error);
      res.status(500).json({ error: "Failed to delete order" });
    }
  });
  
  // Bulk delete orders (admin only)
  app.post("/api/orders/bulk-delete", async (req, res) => {
    try {
      if (!req.session?.userId) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      const user = await storage.getUser(req.session.userId);
      if (!user || user.type !== 'admin') {
        return res.status(403).json({ error: "Forbidden - admin access required" });
      }
      
      const { orderIds } = req.body;
      if (!orderIds || !Array.isArray(orderIds) || orderIds.length === 0) {
        return res.status(400).json({ error: "Order IDs required" });
      }
      
      let deletedCount = 0;
      for (const orderId of orderIds) {
        const deleted = await storage.deleteOrder(orderId);
        if (deleted) deletedCount++;
      }
      
      res.json({ success: true, deletedCount, message: `Deleted ${deletedCount} order(s)` });
    } catch (error) {
      console.error("Bulk delete orders error:", error);
      res.status(500).json({ error: "Failed to delete orders" });
    }
  });
  
  app.post("/api/orders/bulk-update-source", async (req, res) => {
    try {
      if (!req.session?.userId) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      const user = await storage.getUser(req.session.userId);
      if (!user || user.type !== 'admin') {
        return res.status(403).json({ error: "Forbidden - admin access required" });
      }
      
      const { orderIds, saleSource, saleSourceOther } = req.body;
      if (!orderIds || !Array.isArray(orderIds) || orderIds.length === 0) {
        return res.status(400).json({ error: "Order IDs required" });
      }
      if (!saleSource) {
        return res.status(400).json({ error: "Sale source required" });
      }
      
      let updatedCount = 0;
      for (const orderId of orderIds) {
        const updates: any = { saleSource };
        if (saleSource === 'other' && saleSourceOther) {
          updates.saleSourceOther = saleSourceOther;
        }
        await storage.updateOrder(orderId, updates);
        updatedCount++;
      }
      
      res.json({ success: true, updatedCount, message: `Updated source for ${updatedCount} order(s)` });
    } catch (error) {
      console.error("Bulk update source error:", error);
      res.status(500).json({ error: "Failed to update order sources" });
    }
  });

  // Record manual sale (admin only) - for off-platform sales like cash/e-transfer
  app.post("/api/orders/manual-sale", async (req, res) => {
    try {
      if (!req.session?.userId) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      const user = await storage.getUser(req.session.userId);
      if (!user || user.type !== 'admin') {
        return res.status(403).json({ error: "Forbidden - admin access required" });
      }
      
      const { items, paymentMethod, nodeId, buyerName, buyerPhone, buyerEmail, notes, total } = req.body;
      
      if (!items || !Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ error: "At least one product is required" });
      }
      
      if (!paymentMethod) {
        return res.status(400).json({ error: "Payment method is required" });
      }
      
      // Validate products exist and have sufficient stock
      for (const item of items) {
        const product = await storage.getProduct(item.productId);
        if (!product) {
          return res.status(400).json({ error: `Product not found: ${item.productId}` });
        }
        const stock = product.sheetQuantity || 0;
        if (stock < item.quantity) {
          return res.status(400).json({ 
            error: `Insufficient stock for ${product.name}. Available: ${stock}, Requested: ${item.quantity}` 
          });
        }
      }
      
      // Calculate total if not provided
      let orderTotal = total;
      if (!orderTotal) {
        orderTotal = 0;
        for (const item of items) {
          const product = await storage.getProduct(item.productId);
          if (product) {
            orderTotal += parseFloat(product.price) * item.quantity;
          }
        }
      }
      
      // Generate pickup code for manual sale (use MAN- prefix)
      const pickupCode = `MAN-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
      
      // Build order items array
      const { saleDate, manualSource } = req.body;
      const orderItems: { productId: string; quantity: number; price: string }[] = [];
      for (const item of items) {
        const product = await storage.getProduct(item.productId);
        if (product) {
          orderItems.push({
            productId: item.productId,
            quantity: item.quantity,
            price: product.price,
          });
        }
      }
      
      // Create the order with items
      const order = await storage.createOrder({
        buyerId: user.id,
        nodeId: nodeId || null,
        status: 'picked_up', // Manual sales are already completed
        total: orderTotal.toString(),
        pickupCode,
        pickupDate: saleDate || new Date().toISOString().split('T')[0],
        pickupTime: null,
        buyerName: buyerName || 'Cash Customer',
        buyerEmail: buyerEmail || null,
        buyerPhone: buyerPhone || null,
        saleSource: manualSource || 'manual',
        paymentMethod,
        saleNotes: notes || null,
      }, orderItems);
      
      if (saleDate) {
        await db.update(orders).set({ createdAt: new Date(saleDate + 'T12:00:00') }).where(eq(orders.id, order.id));
        order.createdAt = new Date(saleDate + 'T12:00:00');
      }
      
      // Decrement crate assignment quantities and sync inventory
      const allNodes = await storage.getAllNodes();
      const targetNodeId = nodeId || allNodes.find(n => n.status === 'active')?.id;
      if (targetNodeId) {
        for (const item of items) {
          await adjustCrateAssignmentQuantities(targetNodeId, item.productId, -item.quantity);
        }
        await syncCrateInventoryToNode(targetNodeId);
      }
      
      res.json({ success: true, order });
    } catch (error) {
      console.error("Manual sale error:", error);
      res.status(500).json({ error: "Failed to record manual sale" });
    }
  });
  
  // ============== Invite Token Routes ==============
  
  // Get all invite tokens (admin only)
  app.get("/api/invite-tokens", async (req, res) => {
    if (!req.session?.userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    const user = await storage.getUser(req.session.userId);
    if (!user || user.type !== 'admin') {
      return res.status(403).json({ error: "Forbidden" });
    }
    try {
      const tokens = await storage.getAllInviteTokens();
      res.json(tokens);
    } catch (error) {
      console.error("Get invite tokens error:", error);
      res.status(500).json({ error: "Failed to get invite tokens" });
    }
  });
  
  // Create new invite token (admin only)
  app.post("/api/invite-tokens", async (req, res) => {
    if (!req.session?.userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    const user = await storage.getUser(req.session.userId);
    if (!user || user.type !== 'admin') {
      return res.status(403).json({ error: "Forbidden" });
    }
    try {
      const { email, nodeName, notes, expiresInDays = 7 } = req.body;
      
      // Validate email format if provided
      if (email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
          return res.status(400).json({ error: "Please enter a valid email address" });
        }
      }
      
      // Generate a unique token (16 chars alphanumeric)
      const token = Array.from({ length: 16 }, () => 
        'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
          .charAt(Math.floor(Math.random() * 62))
      ).join('');
      
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + expiresInDays);
      
      const invite = await storage.createInviteToken({
        token,
        email: email || null,
        nodeName: nodeName || null,
        notes: notes || null,
        expiresAt,
        createdByUserId: req.session.userId,
      });
      
      res.json(invite);
    } catch (error) {
      console.error("Create invite token error:", error);
      res.status(500).json({ error: "Failed to create invite token" });
    }
  });
  
  // Validate invite token (public - for onboarding page)
  app.get("/api/invite-tokens/validate/:token", async (req, res) => {
    try {
      const invite = await storage.getInviteTokenByToken(req.params.token);
      
      if (!invite) {
        return res.status(404).json({ valid: false, error: "Invalid invite link" });
      }
      
      if (invite.usedAt) {
        return res.status(400).json({ valid: false, error: "This invite link has already been used" });
      }
      
      if (new Date(invite.expiresAt) < new Date()) {
        return res.status(400).json({ valid: false, error: "This invite link has expired" });
      }
      
      res.json({
        valid: true,
        email: invite.email,
        nodeName: invite.nodeName,
      });
    } catch (error) {
      console.error("Validate invite token error:", error);
      res.status(500).json({ error: "Failed to validate invite token" });
    }
  });
  
  // Delete invite token (admin only)
  app.delete("/api/invite-tokens/:id", async (req, res) => {
    if (!req.session?.userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    const user = await storage.getUser(req.session.userId);
    if (!user || user.type !== 'admin') {
      return res.status(403).json({ error: "Forbidden" });
    }
    try {
      await storage.deleteInviteToken(req.params.id);
      res.json({ success: true });
    } catch (error) {
      console.error("Delete invite token error:", error);
      res.status(500).json({ error: "Failed to delete invite token" });
    }
  });
  
  // Check SMS configuration status
  app.get("/api/sms/status", async (req, res) => {
    res.json({ configured: isSmsConfigured() });
  });
  
  // Get all SMS templates
  app.get("/api/sms/templates", async (req, res) => {
    try {
      const templates: Record<string, { template: string; info: { name: string; description: string; recipient: string; variables: string[] } }> = {};
      
      for (const key of Object.keys(DEFAULT_SMS_TEMPLATES) as SmsTemplateKey[]) {
        const stored = await storage.getAdminSetting(`sms_template_${key}`);
        templates[key] = {
          template: stored || DEFAULT_SMS_TEMPLATES[key],
          info: SMS_TEMPLATE_VARIABLES[key],
        };
      }
      
      res.json(templates);
    } catch (error) {
      console.error("Get SMS templates error:", error);
      res.status(500).json({ error: "Failed to get SMS templates" });
    }
  });
  
  // Update an SMS template
  app.put("/api/sms/templates/:key", async (req, res) => {
    try {
      const { key } = req.params;
      const { template } = req.body;
      
      if (!Object.keys(DEFAULT_SMS_TEMPLATES).includes(key)) {
        return res.status(400).json({ error: "Invalid template key" });
      }
      
      if (!template || typeof template !== 'string') {
        return res.status(400).json({ error: "Template content is required" });
      }
      
      await storage.upsertAdminSetting(`sms_template_${key}`, template);
      res.json({ success: true, key, template });
    } catch (error) {
      console.error("Update SMS template error:", error);
      res.status(500).json({ error: "Failed to update SMS template" });
    }
  });
  
  // Reset an SMS template to default
  app.delete("/api/sms/templates/:key", async (req, res) => {
    try {
      const { key } = req.params;
      
      if (!Object.keys(DEFAULT_SMS_TEMPLATES).includes(key)) {
        return res.status(400).json({ error: "Invalid template key" });
      }
      
      // Delete the custom template to use default
      await storage.upsertAdminSetting(`sms_template_${key}`, '');
      res.json({ 
        success: true, 
        key, 
        template: DEFAULT_SMS_TEMPLATES[key as SmsTemplateKey] 
      });
    } catch (error) {
      console.error("Reset SMS template error:", error);
      res.status(500).json({ error: "Failed to reset SMS template" });
    }
  });
  
  app.get("/api/sms/queued-notifications", async (req, res) => {
    try {
      if (!req.session?.userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const user = await storage.getUser(req.session.userId);
      if (!user || user.role !== 'admin') {
        return res.status(403).json({ error: "Admin access required" });
      }

      const queuedOrders = await db.select().from(orders).where(
        and(
          eq(orders.hostNotificationQueued, true),
          isNull(orders.hostNotifiedAt)
        )
      ).orderBy(desc(orders.createdAt));

      const recentlySent = await db.select().from(orders).where(
        and(
          isNotNull(orders.hostNotifiedAt),
          eq(orders.hostNotificationQueued, false)
        )
      ).orderBy(desc(orders.hostNotifiedAt)).limit(20);

      const allNodes = await storage.getAllNodes();
      const nodeMap = new Map(allNodes.map(n => [n.id, n]));

      const queuedWithDetails = await Promise.all(queuedOrders.map(async (order) => {
        const node = order.nodeId ? nodeMap.get(order.nodeId) : null;
        let nextAvailableAt: string | null = null;
        if (order.nodeId) {
          const availability = await storage.getNodeAvailability(order.nodeId);
          const nextStart = getNextAvailabilityStart(availability);
          nextAvailableAt = nextStart ? nextStart.toISOString() : null;
        }
        return {
          orderId: order.id,
          pickupCode: order.pickupCode,
          buyerName: order.buyerName,
          nodeName: node?.name || 'Unknown',
          nodeId: order.nodeId,
          createdAt: order.createdAt.toISOString(),
          pickupDate: order.pickupDate,
          pickupTime: order.pickupTime,
          status: 'queued' as const,
          nextAvailableAt,
        };
      }));

      const sentWithDetails = recentlySent.map(order => {
        const node = order.nodeId ? nodeMap.get(order.nodeId) : null;
        return {
          orderId: order.id,
          pickupCode: order.pickupCode,
          buyerName: order.buyerName,
          nodeName: node?.name || 'Unknown',
          nodeId: order.nodeId,
          createdAt: order.createdAt.toISOString(),
          hostNotifiedAt: order.hostNotifiedAt?.toISOString() || null,
          pickupDate: order.pickupDate,
          pickupTime: order.pickupTime,
          status: 'sent' as const,
        };
      });

      res.json({ queued: queuedWithDetails, recentlySent: sentWithDetails });
    } catch (error) {
      console.error("Error fetching queued notifications:", error);
      res.status(500).json({ error: "Failed to fetch queued notifications" });
    }
  });

  // Helper function to handle customer HERE reply
  async function handleCustomerHere(normalizedPhone: string, from: string, res: any, storage: any) {
    // Find customer by phone number
    const allUsers = await storage.getAllUsers();
    let customer = null;
    
    for (const user of allUsers) {
      if (user.phone) {
        const userPhone = user.phone.replace(/\D/g, '').slice(-10);
        if (userPhone === normalizedPhone) {
          customer = user;
          break;
        }
      }
    }
    
    if (!customer) {
      console.log(`SMS HERE received from unknown customer: ${from}`);
      res.type('text/xml');
      return res.send('<?xml version="1.0" encoding="UTF-8"?><Response><Message>Sorry, we could not find an account associated with this phone number.</Message></Response>');
    }
    
    // Find the customer's most recent ready order
    const customerOrders = await storage.getOrdersByBuyer(customer.id);
    const readyOrders = customerOrders
      .filter((o: any) => o.status === 'ready')
      .sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    
    if (readyOrders.length === 0) {
      res.type('text/xml');
      return res.send('<?xml version="1.0" encoding="UTF-8"?><Response><Message>No ready orders found. Please wait until your order is marked as ready.</Message></Response>');
    }
    
    const order = readyOrders[0];
    
    // Get the node and host info
    const node = await storage.getNode(order.nodeId);
    if (!node) {
      res.type('text/xml');
      return res.send('<?xml version="1.0" encoding="UTF-8"?><Response><Message>Error finding pickup location. Please contact support.</Message></Response>');
    }

    // Check if current time is within the node's availability window (Eastern time)
    const now = new Date();
    const currentDayEastern = formatInTimeZone(now, TIMEZONE, 'EEEE').toLowerCase();
    const currentTime = formatInTimeZone(now, TIMEZONE, 'HH:mm');
    
    const availability = await storage.getNodeAvailability(node.id);
    const todayAvailability = availability.find((a: any) => a.dayOfWeek.toLowerCase() === currentDayEastern && a.enabled);
    
    if (!todayAvailability) {
      // No availability today - find next available day
      const enabledDays = availability.filter((a: any) => a.enabled).map((a: any) => a.dayOfWeek);
      const openDays = enabledDays.length > 0 ? enabledDays.join(', ') : '';
      
      // Get template for location closed today
      const storedTemplate = await storage.getAdminSetting('sms_template_location_closed_today');
      let closedMessage = storedTemplate || DEFAULT_SMS_TEMPLATES.location_closed_today;
      
      // Interpolate variables
      closedMessage = closedMessage.replace(/\{\{#openDays\}\}([\s\S]*?)\{\{\/openDays\}\}/g, (_, content) => openDays ? content.replace(/\{\{openDays\}\}/g, openDays) : '');
      closedMessage = closedMessage.replace(/\{\{\^openDays\}\}([\s\S]*?)\{\{\/openDays\}\}/g, (_, content) => !openDays ? content : '');
      closedMessage = closedMessage.replace(/\{\{openDays\}\}/g, openDays);
      closedMessage = closedMessage.replace(/\n{3,}/g, '\n\n').trim();
      
      res.type('text/xml');
      return res.send(`<?xml version="1.0" encoding="UTF-8"?><Response><Message>${closedMessage}</Message></Response>`);
    }
    
    // Check if current time is within the window
    const startTime = todayAvailability.startTime; // e.g., "09:00"
    const endTime = todayAvailability.endTime; // e.g., "17:00"
    
    if (currentTime < startTime || currentTime > endTime) {
      const formatTime = (time: string) => {
        const [h, m] = time.split(':');
        const hour = parseInt(h);
        const ampm = hour >= 12 ? 'PM' : 'AM';
        const hour12 = hour % 12 || 12;
        return `${hour12}:${m} ${ampm}`;
      };
      const todayHours = `${formatTime(startTime)} - ${formatTime(endTime)}`;
      
      // Get template for location closed hours
      const storedTemplate = await storage.getAdminSetting('sms_template_location_closed_hours');
      let closedMessage = storedTemplate || DEFAULT_SMS_TEMPLATES.location_closed_hours;
      closedMessage = closedMessage.replace(/\{\{todayHours\}\}/g, todayHours);
      closedMessage = closedMessage.replace(/\n{3,}/g, '\n\n').trim();
      
      res.type('text/xml');
      return res.send(`<?xml version="1.0" encoding="UTF-8"?><Response><Message>${closedMessage}</Message></Response>`);
    }
    
    const hostUser = await storage.getUser(node.userId);
    const hostPhone = node.notificationPhone || hostUser?.phone;
    if (!hostPhone) {
      res.type('text/xml');
      return res.send('<?xml version="1.0" encoding="UTF-8"?><Response><Message>Host notification unavailable. Please proceed to pickup.</Message></Response>');
    }
    
    // Send SMS to host (use node's notificationPhone if set, otherwise user's phone)
    console.log(`Attempting to send customer arrived SMS to host at ${hostPhone}`);
    const smsResult = await sendCustomerArrivedSms(hostPhone, {
      orderNumber: order.pickupCode,
      pickupCode: order.pickupCode,
      customerName: order.buyerName || customer.name || 'Customer',
    });
    
    if (smsResult.success) {
      console.log(`Customer arrived SMS sent successfully to host ${hostPhone} for order ${order.pickupCode}`);
    } else {
      console.error(`Failed to send customer arrived SMS to host ${hostPhone}: ${smsResult.error}`);
    }
    
    console.log(`Customer ${customer.email || customer.phone} arrived for order ${order.pickupCode}`);
    
    if (!order.customerArrivedAt) {
      await storage.updateOrder(order.id, { customerArrivedAt: new Date() });
    }
    
    // Get the customer HERE confirmation template
    const hereConfirmationMessage = DEFAULT_SMS_TEMPLATES.customer_here_confirmation;
    
    res.type('text/xml');
    res.send(`<?xml version="1.0" encoding="UTF-8"?><Response><Message>${hereConfirmationMessage}</Message></Response>`);
  }
  
  // Helper function to handle host COMPLETE reply
  async function handleOrderComplete(normalizedPhone: string, from: string, res: any, storage: any) {
    // Find node host by phone number
    const allNodes = await storage.getAllNodesAdmin();
    let matchedNode = null;
    let nodeUser = null;
    
    for (const node of allNodes) {
      const user = await storage.getUser(node.userId);
      if (user?.phone) {
        const userPhone = user.phone.replace(/\D/g, '').slice(-10);
        if (userPhone === normalizedPhone) {
          matchedNode = node;
          nodeUser = user;
          break;
        }
      }
    }
    
    if (!matchedNode) {
      console.log(`SMS COMPLETE received from unknown number: ${from}`);
      res.type('text/xml');
      return res.send('<?xml version="1.0" encoding="UTF-8"?><Response><Message>Sorry, we could not find a node associated with this phone number.</Message></Response>');
    }
    
    // Find the oldest ready order at this node
    const nodeOrders = await storage.getOrdersByNode(matchedNode.id);
    const readyOrders = nodeOrders
      .filter((o: any) => o.status === 'ready')
      .sort((a: any, b: any) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    
    if (readyOrders.length === 0) {
      res.type('text/xml');
      return res.send('<?xml version="1.0" encoding="UTF-8"?><Response><Message>No ready orders found to mark as complete.</Message></Response>');
    }
    
    const order = readyOrders[0];
    
    // Update order status to picked_up
    await storage.updateOrderStatus(order.id, 'picked_up');
    
    // Send thank you SMS to customer - try order.buyerPhone first, then look up user
    let customerPhone = order.buyerPhone;
    if (!customerPhone && order.buyerId) {
      const buyer = await storage.getUser(order.buyerId);
      customerPhone = buyer?.phone;
    }
    
    if (customerPhone) {
      await sendOrderCompleteSms(customerPhone, {
        orderId: order.id,
      });
      console.log(`Order ${order.pickupCode} marked as picked up via SMS COMPLETE from ${from}`);
      res.type('text/xml');
      res.send(`<?xml version="1.0" encoding="UTF-8"?><Response><Message>Order ${order.pickupCode} marked as picked up. Customer has been sent a thank you message.</Message></Response>`);
    } else {
      console.log(`Order ${order.pickupCode} marked as picked up via SMS COMPLETE from ${from} (no customer phone for thank you)`);
      res.type('text/xml');
      res.send(`<?xml version="1.0" encoding="UTF-8"?><Response><Message>Order ${order.pickupCode} marked as picked up.</Message></Response>`);
    }
  }
  
  // Inbound SMS webhook for Twilio - handles READY, HERE, and COMPLETE replies
  app.post("/api/sms/inbound", async (req, res) => {
    try {
      const { From, Body } = req.body;
      
      if (!From || !Body) {
        return res.status(400).send('Missing From or Body');
      }
      
      const messageBody = Body.trim().toUpperCase();
      const normalizedPhone = From.replace(/\D/g, '').slice(-10);
      
      // Handle HERE - customer has arrived
      if (messageBody.includes('HERE')) {
        return await handleCustomerHere(normalizedPhone, From, res, storage);
      }
      
      // Handle COMPLETE - host has handed off order
      if (messageBody.includes('COMPLETE')) {
        return await handleOrderComplete(normalizedPhone, From, res, storage);
      }
      
      // Check if message contains READY
      if (!messageBody.includes('READY')) {
        // Respond with TwiML empty response
        res.type('text/xml');
        return res.send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
      }
      
      // Find node host by phone number
      const allNodes = await storage.getAllNodesAdmin();
      let matchedNode = null;
      let nodeUser = null;
      
      for (const node of allNodes) {
        const user = await storage.getUser(node.userId);
        if (user?.phone) {
          const userPhone = user.phone.replace(/\D/g, '').slice(-10);
          if (userPhone === normalizedPhone) {
            matchedNode = node;
            nodeUser = user;
            break;
          }
        }
      }
      
      if (!matchedNode) {
        console.log(`SMS READY received from unknown number: ${From}`);
        res.type('text/xml');
        return res.send('<?xml version="1.0" encoding="UTF-8"?><Response><Message>Sorry, we could not find a node associated with this phone number.</Message></Response>');
      }
      
      // Find oldest confirmed order at this node
      const nodeOrders = await storage.getOrdersByNode(matchedNode.id);
      const confirmedOrders = nodeOrders
        .filter(o => o.status === 'confirmed')
        .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
      
      if (confirmedOrders.length === 0) {
        res.type('text/xml');
        return res.send('<?xml version="1.0" encoding="UTF-8"?><Response><Message>No pending orders found to mark as ready.</Message></Response>');
      }
      
      const orderToUpdate = confirmedOrders[0];
      
      // Update order status to ready
      await storage.updateOrderStatus(orderToUpdate.id, 'ready');
      
      // Get node availability for the pickup day
      let availabilityWindow = '';
      if (orderToUpdate.pickupDate) {
        const pickupDate = new Date(orderToUpdate.pickupDate);
        const dayOfWeek = pickupDate.toLocaleDateString('en-US', { weekday: 'long' });
        const availability = await storage.getNodeAvailability(matchedNode.id);
        const dayAvailability = availability.find(a => a.dayOfWeek === dayOfWeek && a.enabled);
        
        if (dayAvailability) {
          // Format times for display
          const formatTime = (time: string) => {
            const [hours, minutes] = time.split(':');
            const hour = parseInt(hours);
            const ampm = hour >= 12 ? 'PM' : 'AM';
            const displayHour = hour % 12 || 12;
            return `${displayHour}:${minutes} ${ampm}`;
          };
          availabilityWindow = `${formatTime(dayAvailability.startTime)} - ${formatTime(dayAvailability.endTime)}`;
        }
      }
      
      // Format pickup date for display
      let formattedPickupDate = '';
      if (orderToUpdate.pickupDate) {
        const pickupDate = new Date(orderToUpdate.pickupDate);
        formattedPickupDate = pickupDate.toLocaleDateString('en-US', { 
          weekday: 'long', 
          month: 'long', 
          day: 'numeric', 
          year: 'numeric' 
        });
      }
      
      // Send SMS to customer
      if (orderToUpdate.buyerPhone) {
        const smsResult = await sendOrderReadySms(orderToUpdate.buyerPhone, {
          orderId: orderToUpdate.id,
          pickupCode: orderToUpdate.pickupCode,
          nodeName: matchedNode.name,
          nodeAddress: `${matchedNode.address}, ${matchedNode.city}`,
          availabilityWindow: availabilityWindow || undefined,
          pickupDate: formattedPickupDate || undefined,
          pickupInstructions: matchedNode.pickupInstructions || undefined,
        });
        
        if (smsResult.success) {
          await storage.markOrderSmsSent(orderToUpdate.id);
        }
      }
      
      console.log(`Order ${orderToUpdate.pickupCode} marked ready via SMS from ${From}`);
      
      // Respond with confirmation
      res.type('text/xml');
      res.send(`<?xml version="1.0" encoding="UTF-8"?><Response><Message>Order ${orderToUpdate.pickupCode} marked as ready. Customer has been notified.</Message></Response>`);
    } catch (error) {
      console.error("Inbound SMS error:", error);
      res.type('text/xml');
      res.send('<?xml version="1.0" encoding="UTF-8"?><Response><Message>An error occurred processing your request.</Message></Response>');
    }
  });
  
  // ===== Stripe Payment Routes =====
  
  // Get Stripe publishable key
  app.get("/api/stripe/config", async (req, res) => {
    try {
      const publishableKey = await getStripePublishableKey();
      res.json({ publishableKey });
    } catch (error: any) {
      console.error("Stripe config error:", error);
      res.status(500).json({ error: "Stripe not configured" });
    }
  });
  
  // Create checkout session for order payment
  app.post("/api/stripe/checkout", async (req, res) => {
    try {
      const { items, nodeId, scheduledDate, scheduledTime, buyerName, buyerEmail, buyerPhone, promoCodeId } = req.body;
      
      if (!items || items.length === 0) {
        return res.status(400).json({ error: "No items in cart" });
      }
      
      // Require authenticated user for checkout
      if (!req.session?.userId) {
        return res.status(401).json({ error: "Please log in to complete your purchase" });
      }
      
      const stripe = await getUncachableStripeClient();
      const baseUrl = `https://${process.env.REPLIT_DOMAINS?.split(',')[0]}`;
      
      // Calculate subtotal
      const subtotal = items.reduce((sum: number, item: any) => sum + (item.price * item.quantity), 0);
      
      // Validate and apply promo code if provided
      let discountAmount = 0;
      let appliedPromoCode: any = null;
      if (promoCodeId) {
        const promoCode = await storage.getPromoCode(promoCodeId);
        if (promoCode && promoCode.status === 'active') {
          // Check node-only restriction
          if (promoCode.nodeOnly && promoCode.assignedNodeId && nodeId && promoCode.assignedNodeId !== nodeId) {
            return res.status(400).json({ error: "This coupon can only be used at the assigned node" });
          }
          
          const now = new Date();
          const validFrom = promoCode.validFrom ? new Date(promoCode.validFrom) : null;
          const validTo = promoCode.validTo ? new Date(promoCode.validTo) : null;
          const minAmount = promoCode.minOrderAmount ? parseFloat(promoCode.minOrderAmount) : 0;
          const maxUses = promoCode.maxUses;
          
          // Check per-customer usage (defaults to 1 per account)
          let userCanUse = true;
          if (req.session.userId) {
            const perCustomerLimit = promoCode.maxUsesPerCustomer || 1;
            const userUsageCount = await storage.getPromoCodeUsageCount(promoCode.id, req.session.userId);
            userCanUse = userUsageCount < perCustomerLimit;
          }
          
          // Validate promo code
          if (userCanUse && 
              (!validFrom || validFrom <= now) && 
              (!validTo || validTo >= now) && 
              subtotal >= minAmount &&
              (!maxUses || promoCode.usedCount < maxUses)) {
            
            const discountValue = parseFloat(promoCode.discountValue);
            if (promoCode.discountType === 'percentage') {
              discountAmount = subtotal * discountValue / 100;
            } else {
              discountAmount = discountValue;
            }
            appliedPromoCode = promoCode;
            
            // Increment usage count
            await storage.incrementPromoCodeUsage(promoCode.id);
          }
        }
      }
      
      const subtotalAfterDiscount = subtotal - discountAmount;
      
      // Calculate total amount in cents
      // Filter out base64 images (they're too long for Stripe's 2048 char limit)
      const lineItems = items.map((item: any) => {
        const validImages = (item.images || [])
          .filter((img: string) => img && img.startsWith('http') && img.length < 2000)
          .slice(0, 1);
        
        return {
          price_data: {
            currency: 'cad',
            product_data: {
              name: item.name,
              ...(validImages.length > 0 ? { images: validImages } : {}),
            },
            unit_amount: Math.round(item.price * 100),
          },
          quantity: item.quantity,
        };
      });
      
      // Add discount line item if promo code applied
      if (discountAmount > 0 && appliedPromoCode) {
        lineItems.push({
          price_data: {
            currency: 'cad',
            product_data: {
              name: `Discount (${appliedPromoCode.code})`,
            },
            unit_amount: -Math.round(discountAmount * 100),
          },
          quantity: 1,
        });
      }
      
      // Check tax settings
      const siteSettings = await storage.getAllSiteSettings();
      const taxEnabled = siteSettings.taxEnabled !== 'false';
      const taxRatePercent = taxEnabled ? parseFloat(siteSettings.taxRate || '13') / 100 : 0;
      const taxLabelText = siteSettings.taxLabel || 'HST';

      // Add tax line item if tax is enabled
      const taxAmountCents = Math.round(subtotalAfterDiscount * taxRatePercent * 100);
      if (taxEnabled && taxAmountCents > 0) {
        lineItems.push({
          price_data: {
            currency: 'cad',
            product_data: {
              name: `Tax (${(taxRatePercent * 100).toFixed(1).replace(/\.0$/, '')}% ${taxLabelText})`,
            },
            unit_amount: taxAmountCents,
          },
          quantity: 1,
        });
      }
      
      // Create pending order first
      const orderTotal = subtotalAfterDiscount * (1 + taxRatePercent);
      const order = await storage.createOrder({
        nodeId,
        buyerId: req.session.userId,
        buyerName,
        buyerEmail,
        buyerPhone: buyerPhone || null,
        total: orderTotal.toFixed(2),
        subtotal: subtotal.toFixed(2),
        discountAmount: discountAmount.toFixed(2),
        promoCode: appliedPromoCode?.code || null,
        giftProductIds: giftProductIds?.length > 0 ? giftProductIds : null,
        status: 'pending_payment',
        pickupCode: Math.random().toString(36).substring(2, 8).toUpperCase(),
        pickupDate: scheduledDate,
        pickupTime: scheduledTime,
      }, items.map((item: any) => ({
        orderId: '',
        productId: item.productId,
        quantity: item.quantity,
        price: item.price.toString(),
      })));
      
      // Record promo code usage for this customer
      if (appliedPromoCode && req.session.userId) {
        await storage.recordPromoCodeUsage(appliedPromoCode.id, req.session.userId, order.id);
      }
      
      // Create Stripe checkout session
      const session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        line_items: lineItems,
        mode: 'payment',
        success_url: `${baseUrl}/thank-you?order=${order.id}`,
        cancel_url: `${baseUrl}/checkout?payment=cancelled`,
        customer_email: buyerEmail,
        metadata: {
          orderId: order.id,
          nodeId,
        },
      });
      
      res.json({ 
        sessionId: session.id, 
        url: session.url,
        orderId: order.id 
      });
    } catch (error: any) {
      console.error("Stripe checkout error:", error);
      res.status(500).json({ error: error.message || "Failed to create checkout session" });
    }
  });
  
  // Create payment intent for embedded Stripe Elements
  app.post("/api/stripe/payment-intent", async (req, res) => {
    try {
      const { items, nodeId, scheduledDate, scheduledTime, buyerName, buyerEmail, buyerPhone, vehicleInfo, promoCodeId, giftProductIds } = req.body;
      
      if (!items || items.length === 0) {
        return res.status(400).json({ error: "No items in cart" });
      }
      
      // Require authenticated user for checkout
      if (!req.session?.userId) {
        return res.status(401).json({ error: "Please log in to complete your purchase" });
      }
      
      const stripe = await getUncachableStripeClient();
      
      // Calculate subtotal
      const subtotal = items.reduce((sum: number, item: any) => sum + (item.price * item.quantity), 0);
      
      // Validate and apply promo code if provided
      let discountAmount = 0;
      let appliedPromoCode: any = null;
      if (promoCodeId) {
        const promoCode = await storage.getPromoCode(promoCodeId);
        if (promoCode && promoCode.status === 'active') {
          // Check node-only restriction
          if (promoCode.nodeOnly && promoCode.assignedNodeId && nodeId && promoCode.assignedNodeId !== nodeId) {
            return res.status(400).json({ error: "This coupon can only be used at the assigned node" });
          }
          
          const now = new Date();
          const validFrom = promoCode.validFrom ? new Date(promoCode.validFrom) : null;
          const validTo = promoCode.validTo ? new Date(promoCode.validTo) : null;
          const minAmount = promoCode.minOrderAmount ? parseFloat(promoCode.minOrderAmount) : 0;
          const maxUses = promoCode.maxUses;
          
          // Check per-customer usage (defaults to 1 per account)
          let userCanUse = true;
          if (req.session.userId) {
            const perCustomerLimit = promoCode.maxUsesPerCustomer || 1;
            const userUsageCount = await storage.getPromoCodeUsageCount(promoCode.id, req.session.userId);
            userCanUse = userUsageCount < perCustomerLimit;
          }
          
          if (userCanUse && 
              (!validFrom || validFrom <= now) && 
              (!validTo || validTo >= now) && 
              subtotal >= minAmount &&
              (!maxUses || promoCode.usedCount < maxUses)) {
            
            const discountValue = parseFloat(promoCode.discountValue);
            if (promoCode.discountType === 'percentage') {
              discountAmount = subtotal * discountValue / 100;
            } else {
              discountAmount = discountValue;
            }
            appliedPromoCode = promoCode;
            await storage.incrementPromoCodeUsage(promoCode.id);
          }
        }
      }
      
      const subtotalAfterDiscount = subtotal - discountAmount;
      const orderSiteSettings = await storage.getAllSiteSettings();
      const orderTaxEnabled = orderSiteSettings.taxEnabled !== 'false';
      const orderTaxRate = orderTaxEnabled ? parseFloat(orderSiteSettings.taxRate || '13') / 100 : 0;
      const taxAmount = subtotalAfterDiscount * orderTaxRate;
      const orderTotal = subtotalAfterDiscount + taxAmount;
      const amountInCents = Math.round(orderTotal * 100);
      
      // Build order items including gift products
      const orderItems = items.map((item: any) => ({
        orderId: '',
        productId: item.productId,
        quantity: item.quantity,
        price: item.price.toString(),
      }));
      
      // Add gift products from promo code (price $0)
      if (appliedPromoCode && giftProductIds && giftProductIds.length > 0) {
        const giftQuantity = appliedPromoCode.discountType === 'free_gift' 
          ? (appliedPromoCode.giftQuantity || 1) 
          : 1;
        
        for (const giftProductId of giftProductIds) {
          orderItems.push({
            orderId: '',
            productId: giftProductId,
            quantity: giftQuantity,
            price: '0.00',
          });
        }
      }
      
      // Create pending order
      const order = await storage.createOrder({
        nodeId,
        buyerId: req.session.userId,
        buyerName,
        buyerEmail,
        buyerPhone: buyerPhone || null,
        total: orderTotal.toFixed(2),
        subtotal: subtotal.toFixed(2),
        discountAmount: discountAmount.toFixed(2),
        promoCode: appliedPromoCode?.code || null,
        giftProductIds: giftProductIds?.length > 0 ? giftProductIds : null,
        status: 'pending_payment',
        pickupCode: Math.random().toString(36).substring(2, 8).toUpperCase(),
        pickupDate: scheduledDate,
        pickupTime: scheduledTime,
        vehicleInfo: vehicleInfo || null,
      }, orderItems);
      
      // Record promo code usage for this customer
      if (appliedPromoCode && req.session.userId) {
        await storage.recordPromoCodeUsage(appliedPromoCode.id, req.session.userId, order.id);
      }
      
      // Create payment intent
      const paymentIntent = await stripe.paymentIntents.create({
        amount: amountInCents,
        currency: 'cad',
        automatic_payment_methods: { enabled: true },
        metadata: {
          orderId: order.id,
          nodeId,
        },
        receipt_email: buyerEmail,
      });
      
      res.json({ 
        clientSecret: paymentIntent.client_secret,
        orderId: order.id,
      });
    } catch (error: any) {
      console.error("Payment intent error:", error);
      res.status(500).json({ error: error.message || "Failed to create payment intent" });
    }
  });

  // Confirm payment succeeded (called after Stripe Elements payment)
  app.post("/api/stripe/confirm-payment", async (req, res) => {
    try {
      const { orderId, paymentIntentId } = req.body;
      
      if (!orderId || !paymentIntentId) {
        return res.status(400).json({ error: "Missing orderId or paymentIntentId" });
      }
      
      const stripe = await getUncachableStripeClient();
      const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
      
      if (paymentIntent.status === 'succeeded') {
        // Update order status
        await storage.updateOrderStatus(orderId, 'confirmed');
        
        // Decrement crate assignment quantities, sync inventory, and send host notification
        const order = await storage.getOrder(orderId);
        if (order) {
          const orderItems = await storage.getOrderItems(orderId);
          if (order.nodeId) {
            for (const item of orderItems) {
              await adjustCrateAssignmentQuantities(order.nodeId, item.productId, -item.quantity);
            }
            await syncCrateInventoryToNode(order.nodeId);
          }
          
          const nodeCurrentlyAvailable = order.nodeId ? await isNodeCurrentlyAvailable(order.nodeId) : true;
          if (!nodeCurrentlyAvailable) {
            await storage.updateOrder(order.id, { hostNotificationQueued: true });
            console.log(`Order ${order.pickupCode} queued for notification (node outside availability window)`);
          } else if (isSmsConfigured()) {
            try {
              const node = await storage.getNode(order.nodeId);
              if (node) {
                const nodeUser = await storage.getUser(node.userId);
                const hostPhone = node.notificationPhone || nodeUser?.phone;
                if (hostPhone) {
                  const products = await storage.getProductsByIds(orderItems.map(i => i.productId));
                  const items = orderItems.map(item => {
                    const product = products.find(p => p.id === item.productId);
                    return { code: product?.productCode || 'ITEM', quantity: item.quantity };
                  });
                  
                  console.log(`Attempting to send order placed SMS to host at ${hostPhone}`);
                  const smsResult = await sendOrderPlacedSmsToHost(hostPhone, {
                    orderNumber: order.pickupCode,
                    customerFirstName: order.buyerName?.split(' ')[0] || 'Customer',
                    items,
                  });
                  
                  if (smsResult.success) {
                    console.log(`Order placed SMS sent successfully to host ${hostPhone} for order ${order.pickupCode}`);
                    await storage.updateOrder(order.id, { hostNotifiedAt: new Date() });
                  } else {
                    console.error(`Failed to send order placed SMS to host ${hostPhone}: ${smsResult.error}`);
                  }
                }
              }
            } catch (smsError) {
              console.error("Failed to send order placed SMS to host:", smsError);
            }
          }
        }
        
        res.json({ success: true, orderId });
      } else {
        res.status(400).json({ error: "Payment not completed" });
      }
    } catch (error: any) {
      console.error("Confirm payment error:", error);
      res.status(500).json({ error: error.message || "Failed to confirm payment" });
    }
  });

  // === Payment Links ===

  // Create a payment link
  app.post("/api/payment-links", async (req, res) => {
    try {
      if (!req.session?.userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const user = await storage.getUser(req.session.userId);
      if (!user || user.type !== 'admin') {
        return res.status(403).json({ error: "Admin access required" });
      }

      const { amount, memo, customerEmail } = req.body;
      if (!amount || parseFloat(amount) <= 0) {
        return res.status(400).json({ error: "Valid amount is required" });
      }

      const stripe = await getUncachableStripeClient();
      const amountCents = Math.round(parseFloat(amount) * 100);
      const baseUrl = `${req.protocol}://${req.get("host")}`;

      const session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        line_items: [{
          price_data: {
            currency: 'cad',
            product_data: {
              name: memo || 'Payment',
              description: memo || undefined,
            },
            unit_amount: amountCents,
          },
          quantity: 1,
        }],
        mode: 'payment',
        success_url: `${baseUrl}/payment-success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${baseUrl}/payment-cancelled`,
        customer_email: customerEmail || undefined,
        metadata: {
          paymentLinkType: 'manual',
        },
      });

      const link = await db.insert(paymentLinks).values({
        amount: amount.toString(),
        memo: memo || null,
        customerEmail: customerEmail || null,
        stripeSessionId: session.id,
        url: session.url,
        status: 'pending',
      }).returning();

      res.json(link[0]);
    } catch (error: any) {
      console.error("Create payment link error:", error);
      res.status(500).json({ error: error.message || "Failed to create payment link" });
    }
  });

  // Get all payment links
  app.get("/api/payment-links", async (req, res) => {
    try {
      if (!req.session?.userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const user = await storage.getUser(req.session.userId);
      if (!user || (user.type !== 'admin' && user.type !== 'node')) {
        return res.status(403).json({ error: "Access denied" });
      }

      const links = await db.select().from(paymentLinks).orderBy(desc(paymentLinks.createdAt));
      
      // Check status of pending links against Stripe
      const stripe = await getUncachableStripeClient();
      const updatedLinks = await Promise.all(links.map(async (link) => {
        if (link.status === 'pending' && link.stripeSessionId) {
          try {
            const session = await stripe.checkout.sessions.retrieve(link.stripeSessionId);
            if (session.payment_status === 'paid') {
              const paymentIntentId = typeof session.payment_intent === 'string' 
                ? session.payment_intent 
                : session.payment_intent?.id;
              const updated = await db.update(paymentLinks)
                .set({ 
                  status: 'paid', 
                  paidAt: new Date(),
                  stripePaymentIntentId: paymentIntentId || null,
                })
                .where(eq(paymentLinks.id, link.id))
                .returning();
              return updated[0];
            } else if (session.status === 'expired') {
              const updated = await db.update(paymentLinks)
                .set({ status: 'expired' })
                .where(eq(paymentLinks.id, link.id))
                .returning();
              return updated[0];
            }
          } catch (e) {
            // Session may have been deleted, skip
          }
        }
        return link;
      }));

      res.json(updatedLinks);
    } catch (error: any) {
      console.error("Get payment links error:", error);
      res.status(500).json({ error: "Failed to fetch payment links" });
    }
  });

  // Delete a payment link
  app.delete("/api/payment-links/:id", async (req, res) => {
    try {
      if (!req.session?.userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const user = await storage.getUser(req.session.userId);
      if (!user || user.type !== 'admin') {
        return res.status(403).json({ error: "Admin access required" });
      }

      await db.delete(paymentLinks).where(eq(paymentLinks.id, req.params.id));
      res.json({ success: true });
    } catch (error: any) {
      console.error("Delete payment link error:", error);
      res.status(500).json({ error: "Failed to delete payment link" });
    }
  });

  // Host Payments CRUD
  app.get("/api/host-payments", async (req, res) => {
    try {
      if (!req.session?.userId) return res.status(401).json({ error: "Not authenticated" });
      const user = await storage.getUser(req.session.userId);
      if (!user || user.type !== 'admin') return res.status(403).json({ error: "Admin access required" });
      const payments = await storage.getHostPayments();
      res.json(payments);
    } catch (error: any) {
      res.status(500).json({ error: "Failed to fetch host payments" });
    }
  });

  app.post("/api/host-payments", async (req, res) => {
    try {
      if (!req.session?.userId) return res.status(401).json({ error: "Not authenticated" });
      const user = await storage.getUser(req.session.userId);
      if (!user || user.type !== 'admin') return res.status(403).json({ error: "Admin access required" });
      const parsed = insertHostPaymentSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: "Invalid payment data", details: parsed.error.flatten() });
      const payment = await storage.createHostPayment(parsed.data);
      res.json(payment);
    } catch (error: any) {
      console.error("Create host payment error:", error);
      res.status(500).json({ error: "Failed to create host payment" });
    }
  });

  app.put("/api/host-payments/:id", async (req, res) => {
    try {
      if (!req.session?.userId) return res.status(401).json({ error: "Not authenticated" });
      const user = await storage.getUser(req.session.userId);
      if (!user || user.type !== 'admin') return res.status(403).json({ error: "Admin access required" });
      const parsed = insertHostPaymentSchema.partial().safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: "Invalid payment data", details: parsed.error.flatten() });
      const payment = await storage.updateHostPayment(req.params.id, parsed.data);
      if (!payment) return res.status(404).json({ error: "Payment not found" });
      res.json(payment);
    } catch (error: any) {
      res.status(500).json({ error: "Failed to update host payment" });
    }
  });

  app.delete("/api/host-payments/:id", async (req, res) => {
    try {
      if (!req.session?.userId) return res.status(401).json({ error: "Not authenticated" });
      const user = await storage.getUser(req.session.userId);
      if (!user || user.type !== 'admin') return res.status(403).json({ error: "Admin access required" });
      await storage.deleteHostPayment(req.params.id);
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: "Failed to delete host payment" });
    }
  });

  // Landing Pages CRUD (admin)
  app.get("/api/admin/landing-pages", async (req, res) => {
    try {
      if (!req.session?.userId) return res.status(401).json({ error: "Not authenticated" });
      const user = await storage.getUser(req.session.userId);
      if (!user || user.type !== 'admin') return res.status(403).json({ error: "Admin access required" });
      const pages = await storage.getAllLandingPages();
      res.json(pages);
    } catch (error: any) {
      res.status(500).json({ error: "Failed to fetch landing pages" });
    }
  });

  app.post("/api/admin/landing-pages", async (req, res) => {
    try {
      if (!req.session?.userId) return res.status(401).json({ error: "Not authenticated" });
      const user = await storage.getUser(req.session.userId);
      if (!user || user.type !== 'admin') return res.status(403).json({ error: "Admin access required" });
      const parsed = insertLandingPageSchema.parse(req.body);
      const page = await storage.createLandingPage(parsed);
      res.json(page);
    } catch (error: any) {
      res.status(400).json({ error: error.message || "Failed to create landing page" });
    }
  });

  app.patch("/api/admin/landing-pages/:id", async (req, res) => {
    try {
      if (!req.session?.userId) return res.status(401).json({ error: "Not authenticated" });
      const user = await storage.getUser(req.session.userId);
      if (!user || user.type !== 'admin') return res.status(403).json({ error: "Admin access required" });
      const page = await storage.updateLandingPage(req.params.id, req.body);
      if (!page) return res.status(404).json({ error: "Landing page not found" });
      res.json(page);
    } catch (error: any) {
      res.status(400).json({ error: error.message || "Failed to update landing page" });
    }
  });

  app.delete("/api/admin/landing-pages/:id", async (req, res) => {
    try {
      if (!req.session?.userId) return res.status(401).json({ error: "Not authenticated" });
      const user = await storage.getUser(req.session.userId);
      if (!user || user.type !== 'admin') return res.status(403).json({ error: "Admin access required" });
      await storage.deleteLandingPage(req.params.id);
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: "Failed to delete landing page" });
    }
  });

  app.post("/api/nearest-node", async (req, res) => {
    try {
      const { postalCode } = req.body;
      if (!postalCode || typeof postalCode !== 'string') {
        return res.status(400).json({ error: "Postal code is required" });
      }

      const cleanPostal = postalCode.trim().toUpperCase().replace(/\s+/g, '');

      const geocodeUrl = `https://geocoder.ca/?locate=${encodeURIComponent(cleanPostal)}&geoit=XML&json=1`;
      let geocodeData: any = null;
      const maxRetries = 3;
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 5000);
          const geocodeRes = await fetch(geocodeUrl, { signal: controller.signal });
          clearTimeout(timeout);
          geocodeData = await geocodeRes.json();
          if (geocodeData.latt && geocodeData.longt) break;
          console.log(`[nearest-node] Attempt ${attempt}/${maxRetries} for "${cleanPostal}" — no coordinates returned`);
        } catch (err: any) {
          console.log(`[nearest-node] Attempt ${attempt}/${maxRetries} for "${cleanPostal}" failed: ${err.message}`);
        }
        if (attempt < maxRetries) await new Promise(r => setTimeout(r, 500 * attempt));
      }

      console.log(`[nearest-node] Geocoding "${cleanPostal}" via geocoder.ca: lat=${geocodeData?.latt}, lng=${geocodeData?.longt}`);

      if (!geocodeData?.latt || !geocodeData?.longt) {
        return res.status(404).json({ error: "Could not geocode postal code" });
      }

      const lat = parseFloat(geocodeData.latt);
      const lng = parseFloat(geocodeData.longt);

      const allNodes = await storage.getAllNodes();
      const activeNodes = allNodes.filter(n => n.status === 'active' && n.latitude && n.longitude);

      if (activeNodes.length === 0) {
        return res.status(404).json({ error: "No active nodes found" });
      }

      let nearestNode = activeNodes[0];
      let minDist = Infinity;

      for (const node of activeNodes) {
        const nLat = Number(node.latitude);
        const nLng = Number(node.longitude);
        const dLat = (nLat - lat) * Math.PI / 180;
        const dLng = (nLng - lng) * Math.PI / 180;
        const a = Math.sin(dLat / 2) ** 2 +
          Math.cos(lat * Math.PI / 180) * Math.cos(nLat * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
        const dist = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)) * 6371;
        if (dist < minDist) {
          minDist = dist;
          nearestNode = node;
        }
      }

      const allInventory = await storage.getInventoryByNode(String(nearestNode.id));
      const nodeProducts: any[] = [];
      for (const inv of allInventory) {
        if (inv.quantity <= 0) continue;
        const prod = await storage.getProduct(String(inv.productId));
        if (prod && !prod.deletedAt) {
          const existing = nodeProducts.find(p => String(p.id) === String(prod.id));
          if (!existing) {
            nodeProducts.push({ ...prod, inventory: [{ nodeId: String(nearestNode.id), quantity: inv.quantity }] });
          }
        }
      }

      res.json({
        node: nearestNode,
        products: nodeProducts,
        distance: Math.round(minDist * 10) / 10,
      });
    } catch (error: any) {
      console.error("Nearest node error:", error);
      res.status(500).json({ error: "Failed to find nearest node" });
    }
  });

  // Public landing page by slug - returns full page data with product, promos, and shop-more products
  app.get("/api/landing-pages/:slug", async (req, res) => {
    try {
      const page = await storage.getLandingPageBySlug(req.params.slug);
      if (!page || page.status !== 'active') return res.status(404).json({ error: "Landing page not found" });
      
      const allNodes = await storage.getAllNodes();
      const activeNodes = allNodes.filter(n => n.status === 'active');

      let promoDetails: any[] = [];
      if (page.promoCodes && page.promoCodes.length > 0) {
        const allPromos = await db.select().from(
          (await import("@shared/schema")).promoCodes
        );
        promoDetails = allPromos.filter(p => 
          page.promoCodes!.includes(p.code) && p.status === 'active'
        ).map(p => ({
          code: p.code,
          name: p.name,
          discountType: p.discountType,
          discountValue: p.discountValue,
          description: p.description,
        }));
      }

      const isPostalCode = page.mode === 'postal-code';
      const isLocation = page.mode === 'location' && page.nodeId;
      const isProductLocation = page.mode === 'product-location' && page.nodeId && page.productIds && page.productIds.length > 0;
      const isMulti = page.mode === 'multi' && page.productIds && page.productIds.length > 0;

      if (isPostalCode) {
        res.json({
          page,
          product: null,
          products: [],
          nodes: activeNodes,
          promoDetails,
          shopMoreProducts: [],
        });
        return;
      }

      if (isProductLocation) {
        const node = activeNodes.find(n => n.id === page.nodeId);
        if (!node) return res.status(404).json({ error: "Node not found" });

        const products: any[] = [];
        for (const pid of page.productIds!) {
          const prod = await storage.getProduct(String(pid));
          if (prod && !prod.deletedAt) {
            const inv = await storage.getInventoryByProduct(String(prod.id));
            products.push({ ...prod, inventory: inv });
          }
        }

        if (products.length === 0) return res.status(404).json({ error: "Products not found" });

        let soonestSlot: string | null = null;
        let soonestDate: string | null = null;
        try {
          const { nodeAvailability } = await import("@shared/schema");
          const avail = await db.select().from(nodeAvailability).where(eq(nodeAvailability.nodeId, page.nodeId!));
          if (avail.length > 0) {
            const schedule = avail[0].weeklySchedule as any;
            if (schedule) {
              const now = new Date();
              const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
              for (let d = 0; d < 7; d++) {
                const checkDate = new Date(now.getTime() + d * 86400000);
                const dayName = dayNames[checkDate.getDay()];
                const daySchedule = schedule[dayName];
                if (daySchedule?.enabled && daySchedule.startTime) {
                  soonestDate = checkDate.toISOString().split('T')[0];
                  soonestSlot = daySchedule.startTime;
                  break;
                }
              }
            }
          }
        } catch {}

        res.json({
          page,
          product: products[0],
          products,
          nodes: activeNodes,
          promoDetails,
          shopMoreProducts: [],
          locationNode: { ...node, soonestSlot, soonestDate },
        });
        return;
      }

      if (isLocation) {
        const node = activeNodes.find(n => n.id === page.nodeId);
        if (!node) return res.status(404).json({ error: "Node not found" });

        const allInventory = await storage.getInventoryByNode(page.nodeId!);
        const nodeProducts: any[] = [];
        for (const inv of allInventory) {
          if (inv.quantity <= 0) continue;
          const prod = await storage.getProduct(String(inv.productId));
          if (prod && !prod.deletedAt) {
            const existing = nodeProducts.find(p => String(p.id) === String(prod.id));
            if (!existing) {
              nodeProducts.push({ ...prod, inventory: [{ nodeId: page.nodeId, quantity: inv.quantity }] });
            }
          }
        }

        let soonestSlot: string | null = null;
        let soonestDate: string | null = null;
        try {
          const { nodeAvailability } = await import("@shared/schema");
          const avail = await db.select().from(nodeAvailability).where(eq(nodeAvailability.nodeId, page.nodeId!));
          if (avail.length > 0) {
            const schedule = avail[0].weeklySchedule as any;
            if (schedule) {
              const now = new Date();
              const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
              for (let d = 0; d < 7; d++) {
                const checkDate = new Date(now.getTime() + d * 86400000);
                const dayName = dayNames[checkDate.getDay()];
                const daySchedule = schedule[dayName];
                if (daySchedule?.enabled && daySchedule.startTime) {
                  soonestDate = checkDate.toISOString().split('T')[0];
                  soonestSlot = daySchedule.startTime;
                  break;
                }
              }
            }
          }
        } catch {}

        res.json({
          page,
          product: nodeProducts[0] || null,
          products: nodeProducts,
          nodes: activeNodes,
          promoDetails,
          shopMoreProducts: [],
          locationNode: { ...node, soonestSlot, soonestDate },
        });
        return;
      }

      const heroProductIds = isMulti ? page.productIds! : [page.productId];

      const products: any[] = [];
      for (const pid of heroProductIds) {
        const prod = await storage.getProduct(String(pid));
        if (prod && !prod.deletedAt) {
          const inv = await storage.getInventoryByProduct(String(prod.id));
          products.push({ ...prod, inventory: inv });
        }
      }

      if (products.length === 0) return res.status(404).json({ error: "Product not found" });

      const product = products[0];

      let shopMoreProducts: any[] = [];
      const heroIdSet = new Set(heroProductIds.map(String));
      if (page.shopMoreMode === 'custom' && page.shopMoreProductIds?.length) {
        const ids = page.shopMoreProductIds.map(String);
        shopMoreProducts = (await storage.getProductsByIds(ids)).filter(p => !p.deletedAt && !heroIdSet.has(String(p.id)));
      } else if (page.shopMoreMode === 'subcategory' && product.subcategory) {
        const allProducts = await storage.getAllProducts();
        shopMoreProducts = allProducts.filter(p => !p.deletedAt && p.subcategory === product.subcategory && !heroIdSet.has(String(p.id))).slice(0, 12);
      } else if (page.shopMoreMode === 'category' || (page.shopMoreMode === 'subcategory' && !product.subcategory)) {
        const allProducts = await storage.getAllProducts();
        shopMoreProducts = allProducts.filter(p => !p.deletedAt && p.category === product.category && !heroIdSet.has(String(p.id))).slice(0, 12);
      }

      res.json({
        page,
        product,
        products: isMulti ? products : undefined,
        nodes: activeNodes,
        promoDetails,
        shopMoreProducts,
      });
    } catch (error: any) {
      console.error("Landing page fetch error:", error);
      res.status(500).json({ error: "Failed to fetch landing page" });
    }
  });

  app.get("/api/admin/qr-codes", async (req, res) => {
    try {
      if (!req.session?.userId) return res.status(401).json({ error: "Not authenticated" });
      const user = await storage.getUser(req.session.userId);
      if (!user || user.type !== 'admin') return res.status(403).json({ error: "Admin access required" });
      const qrs = await storage.getAllSavedQrCodes();
      res.json(qrs);
    } catch (error: any) {
      res.status(500).json({ error: "Failed to fetch QR codes" });
    }
  });

  app.post("/api/admin/qr-codes", async (req, res) => {
    try {
      if (!req.session?.userId) return res.status(401).json({ error: "Not authenticated" });
      const user = await storage.getUser(req.session.userId);
      if (!user || user.type !== 'admin') return res.status(403).json({ error: "Admin access required" });
      const qr = await storage.createSavedQrCode(req.body);
      res.json(qr);
    } catch (error: any) {
      res.status(500).json({ error: "Failed to save QR code" });
    }
  });

  app.delete("/api/admin/qr-codes/:id", async (req, res) => {
    try {
      if (!req.session?.userId) return res.status(401).json({ error: "Not authenticated" });
      const user = await storage.getUser(req.session.userId);
      if (!user || user.type !== 'admin') return res.status(403).json({ error: "Admin access required" });
      await storage.deleteSavedQrCode(req.params.id);
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: "Failed to delete QR code" });
    }
  });

  // Import product from URL
  app.post("/api/products/import", async (req, res) => {
    try {
      if (!req.session?.userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      
      const user = await storage.getUser(req.session.userId);
      if (!user || user.type !== 'admin') {
        return res.status(403).json({ error: "Admin access required" });
      }
      
      const { url } = req.body;
      if (!url) {
        return res.status(400).json({ error: "URL is required" });
      }
      
      const imported = await importProductFromUrl(url);
      res.json(imported);
    } catch (error: any) {
      console.error("Product import error:", error);
      res.status(500).json({ error: error.message || "Failed to import product" });
    }
  });
  
  // ===== Product Template Routes =====
  
  // Get all templates
  app.get("/api/templates", async (req, res) => {
    try {
      const templates = await storage.getAllProductTemplates();
      res.json(templates);
    } catch (error) {
      console.error("Get templates error:", error);
      res.status(500).json({ error: "Failed to fetch templates" });
    }
  });
  
  // Get template by ID
  app.get("/api/templates/:id", async (req, res) => {
    try {
      const template = await storage.getProductTemplate(req.params.id);
      if (!template) {
        return res.status(404).json({ error: "Template not found" });
      }
      res.json(template);
    } catch (error) {
      console.error("Get template error:", error);
      res.status(500).json({ error: "Failed to fetch template" });
    }
  });
  
  // Create template - each import creates a unique product (no auto-merging)
  // Manual linking of product codes can be done via PATCH endpoint
  app.post("/api/templates", async (req, res) => {
    try {
      if (!req.session?.userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      
      const user = await storage.getUser(req.session.userId);
      if (!user || user.type !== 'admin') {
        return res.status(403).json({ error: "Admin access required" });
      }
      
      // Validate with schema
      const parsed = insertProductTemplateSchema.safeParse(req.body);
      if (!parsed.success) {
        const errors = parsed.error.errors.map(e => `${e.path.join('.')}: ${e.message}`);
        return res.status(400).json({ error: `Validation failed: ${errors.join(', ')}` });
      }
      
      const { name, description, price, category, images, condition, colors } = parsed.data;
      const { quantity, sheetRow } = req.body; // Additional fields not in schema
      
      // Generate unique product code for new template (no duplicate checking)
      let productCode = generateProductCode();
      while (await storage.getProductTemplateByCode(productCode)) {
        productCode = generateProductCode();
      }
      
      const template = await storage.createProductTemplate({
        productCode,
        name,
        description,
        price,
        images: images || [],
        category,
        condition: condition || 'new',
        colors: colors || null,
        isActive: true,
      });
      
      // Also create a legacy product entry so it shows in Products tab
      await storage.createProduct({
        name,
        description,
        price,
        image: (images && images.length > 0) ? images[0] : '',
        category,
        productCode,
        sheetQuantity: quantity || 0,
        sheetRow: sheetRow || null,
      });
      
      res.json({ 
        template, 
        action: 'created'
      });
    } catch (error) {
      console.error("Create template error:", error);
      res.status(500).json({ error: "Failed to create template" });
    }
  });
  
  // Update template
  app.put("/api/templates/:id", async (req, res) => {
    try {
      if (!req.session?.userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      
      const user = await storage.getUser(req.session.userId);
      if (!user || user.type !== 'admin') {
        return res.status(403).json({ error: "Admin access required" });
      }
      
      const template = await storage.updateProductTemplate(req.params.id, req.body);
      if (!template) {
        return res.status(404).json({ error: "Template not found" });
      }
      res.json(template);
    } catch (error) {
      console.error("Update template error:", error);
      res.status(500).json({ error: "Failed to update template" });
    }
  });
  
  // Delete template
  app.delete("/api/templates/:id", async (req, res) => {
    try {
      if (!req.session?.userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      
      const user = await storage.getUser(req.session.userId);
      if (!user || user.type !== 'admin') {
        return res.status(403).json({ error: "Admin access required" });
      }
      
      await storage.deleteProductTemplate(req.params.id);
      res.json({ success: true });
    } catch (error) {
      console.error("Delete template error:", error);
      res.status(500).json({ error: "Failed to delete template" });
    }
  });
  
  // ===== Inventory Batch Routes =====
  
  // Get all batches
  app.get("/api/batches", async (req, res) => {
    try {
      const batches = await storage.getAllInventoryBatches();
      res.json(batches);
    } catch (error) {
      console.error("Get batches error:", error);
      res.status(500).json({ error: "Failed to fetch batches" });
    }
  });
  
  // Get batches by template
  app.get("/api/templates/:templateId/batches", async (req, res) => {
    try {
      const batches = await storage.getInventoryBatchesByTemplate(req.params.templateId);
      res.json(batches);
    } catch (error) {
      console.error("Get batches by template error:", error);
      res.status(500).json({ error: "Failed to fetch batches" });
    }
  });
  
  // Create batch - each import creates a new template (no auto-merging)
  // Products can be manually linked later via the product code pickwhip
  app.post("/api/batches", async (req, res) => {
    try {
      if (!req.session?.userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      
      const user = await storage.getUser(req.session.userId);
      if (!user || user.type !== 'admin') {
        return res.status(403).json({ error: "Admin access required" });
      }
      
      const { 
        templateId, sheetId, sheetName, sheetRow, sourceUrl, quantity, costPrice, purchaseDate, nodeId, batchNotes,
        productName, productDescription, productPrice, productCategory, productImages, productCondition, productColors
      } = req.body;
      
      // Check if batch for this sheet row already exists
      if (sheetId && sheetRow) {
        const existing = await storage.getInventoryBatchBySheetRow(sheetId, sheetRow);
        if (existing) {
          return res.status(400).json({ error: "Batch for this sheet row already exists", existingBatchId: existing.id });
        }
      }
      
      let resolvedTemplateId = templateId;
      let matchAction = 'existing';
      let matchDetails = null;
      
      // If no templateId provided, always create a new template (no auto-matching)
      if (!resolvedTemplateId && productName) {
        let productCode = generateProductCode();
        while (await storage.getProductTemplateByCode(productCode)) {
          productCode = generateProductCode();
        }
        
        const newTemplate = await storage.createProductTemplate({
          productCode,
          name: productName,
          description: productDescription || '',
          price: productPrice || '0',
          images: productImages || [],
          category: productCategory || 'Uncategorized',
          condition: productCondition || 'new',
          colors: productColors || null,
          isActive: true,
        });
        
        resolvedTemplateId = newTemplate.id;
        matchAction = 'created_template';
        matchDetails = { templateId: newTemplate.id, productCode: newTemplate.productCode };
      }
      
      if (!resolvedTemplateId) {
        return res.status(400).json({ error: "templateId or product info (productName) is required" });
      }
      
      const batch = await storage.createInventoryBatch({
        templateId: resolvedTemplateId,
        sheetId: sheetId || null,
        sheetName: sheetName || null,
        sheetRow: sheetRow || null,
        sourceUrl: sourceUrl || null,
        quantity: quantity || 0,
        costPrice: costPrice || null,
        purchaseDate: purchaseDate || null,
        nodeId: nodeId || null,
        batchNotes: batchNotes || null,
        status: 'available',
      });
      
      res.json({ 
        batch, 
        matchAction,
        matchDetails
      });
    } catch (error) {
      console.error("Create batch error:", error);
      res.status(500).json({ error: "Failed to create batch" });
    }
  });
  
  // Update batch
  app.put("/api/batches/:id", async (req, res) => {
    try {
      if (!req.session?.userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      
      const user = await storage.getUser(req.session.userId);
      if (!user || user.type !== 'admin') {
        return res.status(403).json({ error: "Admin access required" });
      }
      
      const batch = await storage.updateInventoryBatch(req.params.id, req.body);
      if (!batch) {
        return res.status(404).json({ error: "Batch not found" });
      }
      res.json(batch);
    } catch (error) {
      console.error("Update batch error:", error);
      res.status(500).json({ error: "Failed to update batch" });
    }
  });
  
  // Delete batch
  app.delete("/api/batches/:id", async (req, res) => {
    try {
      if (!req.session?.userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      
      const user = await storage.getUser(req.session.userId);
      if (!user || user.type !== 'admin') {
        return res.status(403).json({ error: "Admin access required" });
      }
      
      await storage.deleteInventoryBatch(req.params.id);
      res.json({ success: true });
    } catch (error) {
      console.error("Delete batch error:", error);
      res.status(500).json({ error: "Failed to delete batch" });
    }
  });
  
  // ===== Duplicate Queue Routes (Legacy) =====
  
  // Get pending duplicates
  app.get("/api/duplicates/pending", async (req, res) => {
    try {
      if (!req.session?.userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      
      const user = await storage.getUser(req.session.userId);
      if (!user || user.type !== 'admin') {
        return res.status(403).json({ error: "Admin access required" });
      }
      
      const duplicates = await storage.getPendingDuplicates();
      res.json(duplicates);
    } catch (error) {
      console.error("Get pending duplicates error:", error);
      res.status(500).json({ error: "Failed to fetch duplicates" });
    }
  });
  
  // Resolve duplicate (approve or reject merge)
  app.post("/api/duplicates/:id/resolve", async (req, res) => {
    try {
      if (!req.session?.userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      
      const user = await storage.getUser(req.session.userId);
      if (!user || user.type !== 'admin') {
        return res.status(403).json({ error: "Admin access required" });
      }
      
      const { action } = req.body; // 'approve' or 'reject'
      const status = action === 'approve' ? 'approved' : 'rejected';
      
      const duplicate = await storage.updateDuplicateQueueStatus(req.params.id, status);
      if (!duplicate) {
        return res.status(404).json({ error: "Duplicate item not found" });
      }
      
      res.json(duplicate);
    } catch (error) {
      console.error("Resolve duplicate error:", error);
      res.status(500).json({ error: "Failed to resolve duplicate" });
    }
  });
  
  // ===== Node Availability Routes =====
  
  // Get concrete pickup slots for next 48 hours (guaranteed windows)
  app.get("/api/nodes/:nodeId/pickup-slots", async (req, res) => {
    try {
      const nodeId = req.params.nodeId;
      const node = await storage.getNode(nodeId);
      if (!node) {
        return res.status(404).json({ error: "Node not found" });
      }
      
      const availability = await storage.getNodeAvailability(nodeId);
      if (!availability || availability.length === 0) {
        return res.json({ slots: [], node });
      }
      
      // Generate concrete slots based on node's availability notice hours (default 48)
      // Lock period = minimum advance booking time. Slots must start AFTER this cutoff to be bookable.
      // EXCEPTION: When a node is newly activated (within the notice window), all slots are immediately available.
      // The lock-in only applies to availability changes made AFTER activation.
      // All times are processed in America/Toronto timezone for consistency across environments
      
      const nowUtc = new Date();
      const noticeHours = node.availabilityNoticeHours ?? 48;
      
      // Check if node was recently activated - if so, skip lock-in entirely
      const activatedAt = node.activatedAt ? new Date(node.activatedAt) : null;
      const timeSinceActivation = activatedAt ? (nowUtc.getTime() - activatedAt.getTime()) : Infinity;
      const isNewlyActivated = timeSinceActivation < noticeHours * 60 * 60 * 1000;
      
      const rawNoticeEndUtc = new Date(nowUtc.getTime() + noticeHours * 60 * 60 * 1000);
      
      // Determine how many calendar days (Eastern time) the notice window spans
      // If it spans 3+ days, round down to show only 2 days
      const todayEastern = formatInTimeZone(nowUtc, TIMEZONE, 'yyyy-MM-dd');
      const noticeEndEastern = formatInTimeZone(rawNoticeEndUtc, TIMEZONE, 'yyyy-MM-dd');
      const todayDate = parse(todayEastern, 'yyyy-MM-dd', new Date());
      const noticeEndDate = parse(noticeEndEastern, 'yyyy-MM-dd', new Date());
      const daySpan = Math.round((noticeEndDate.getTime() - todayDate.getTime()) / (24 * 60 * 60 * 1000)) + 1;
      
      let earliestBookableUtc: Date;
      if (isNewlyActivated) {
        // Newly activated nodes: no lock-in, all slots are immediately bookable
        earliestBookableUtc = nowUtc;
      } else if (daySpan > 2) {
        // Cap at end of 2nd calendar day (23:59:59 Eastern)
        const secondDay = addDays(todayDate, 1);
        const secondDayEnd = `${format(secondDay, 'yyyy-MM-dd')} 23:59`;
        earliestBookableUtc = fromZonedTime(parse(secondDayEnd, 'yyyy-MM-dd HH:mm', new Date()), TIMEZONE);
      } else {
        earliestBookableUtc = rawNoticeEndUtc;
      }
      const maxBookingWindowUtc = new Date(nowUtc.getTime() + 7 * 24 * 60 * 60 * 1000); // 7 days max
      
      const slots: Array<{
        id: string;
        date: string;
        dayOfWeek: string;
        startTime: string;
        endTime: string;
        guaranteed: boolean;
        locked: boolean;
      }> = [];
      
      const rawSlots: Array<{
        date: string;
        dayOfWeek: string;
        startTime: string;
        endTime: string;
        locked: boolean;
      }> = [];
      
      // Get today's date string in Eastern timezone (this is the ground truth for "today")
      const todayDateStr = formatInTimeZone(nowUtc, TIMEZONE, 'yyyy-MM-dd');
      
      // Parse today's date string back to get a base date for iteration
      // Use noon to avoid any edge cases with date parsing
      const todayBase = parse(todayDateStr, 'yyyy-MM-dd', new Date());
      
      // Iterate through next 7 days using date strings
      for (let dayOffset = 0; dayOffset < 8; dayOffset++) {
        // Add days to base date and format
        const currentDay = addDays(todayBase, dayOffset);
        const dateStr = format(currentDay, 'yyyy-MM-dd');
        const dayName = format(currentDay, 'EEEE'); // Monday, Tuesday, etc.
        
        // Find availability for this day (case-insensitive comparison)
        const dayAvail = availability.filter(a => 
          a.dayOfWeek.toLowerCase() === dayName.toLowerCase() && a.enabled
        );
        
        for (const avail of dayAvail) {
          // Create UTC instants for slot start/end by converting from Eastern time strings
          // This treats dateStr + avail.startTime as an Eastern local time and converts to UTC
          const slotStartStr = `${dateStr} ${avail.startTime}`;
          
          // Handle special case of "24:00" (midnight end of day)
          // Convert to "00:00" of the next day for proper parsing
          let slotEndStr: string;
          let effectiveEndTime = avail.endTime;
          if (avail.endTime === '24:00') {
            // Parse as midnight of the same day, then add 24 hours
            slotEndStr = `${dateStr} 00:00`;
            effectiveEndTime = '23:59'; // For display purposes
          } else {
            slotEndStr = `${dateStr} ${avail.endTime}`;
          }
          
          const slotStartUtc = fromZonedTime(parse(slotStartStr, 'yyyy-MM-dd HH:mm', new Date()), TIMEZONE);
          let slotEndUtc = fromZonedTime(parse(slotEndStr, 'yyyy-MM-dd HH:mm', new Date()), TIMEZONE);
          
          // If end time was 24:00, add 24 hours to get actual midnight
          if (avail.endTime === '24:00') {
            slotEndUtc = new Date(slotEndUtc.getTime() + 24 * 60 * 60 * 1000);
          }
          
          if (slotEndUtc > nowUtc && slotStartUtc < maxBookingWindowUtc) {
            const isLocked = !isNewlyActivated && slotStartUtc < earliestBookableUtc;
            rawSlots.push({
              date: dateStr,
              dayOfWeek: dayName,
              startTime: avail.startTime,
              endTime: effectiveEndTime,
              locked: isLocked,
            });
          }
        }
      }
      
      // Merge consecutive slots on the same day (only merge if same locked status)
      const mergedByDay: Record<string, Array<{ startTime: string; endTime: string; locked: boolean }>> = {};
      for (const slot of rawSlots) {
        if (!mergedByDay[slot.date]) {
          mergedByDay[slot.date] = [];
        }
        mergedByDay[slot.date].push({ startTime: slot.startTime, endTime: slot.endTime, locked: slot.locked });
      }
      
      // Sort and merge consecutive windows for each day
      for (const date of Object.keys(mergedByDay)) {
        const windows = mergedByDay[date].sort((a, b) => a.startTime.localeCompare(b.startTime));
        const merged: Array<{ startTime: string; endTime: string; locked: boolean }> = [];
        
        for (const win of windows) {
          if (merged.length === 0) {
            merged.push({ ...win });
          } else {
            const last = merged[merged.length - 1];
            // Only merge if same locked status and consecutive
            if (win.startTime === last.endTime && win.locked === last.locked) {
              last.endTime = win.endTime;
            } else {
              merged.push({ ...win });
            }
          }
        }
        
        mergedByDay[date] = merged;
      }
      
      // Convert back to slots array
      for (const date of Object.keys(mergedByDay).sort()) {
        const parsedDate = parse(date, 'yyyy-MM-dd', new Date());
        const dayOfWeek = format(parsedDate, 'EEEE');
        for (const win of mergedByDay[date]) {
          slots.push({
            id: `${nodeId}-${date}-${win.startTime}-${win.endTime}`,
            date,
            dayOfWeek,
            startTime: win.startTime,
            endTime: win.endTime,
            guaranteed: !win.locked,
            locked: win.locked,
          });
        }
      }
      
      res.json({ slots, node });
    } catch (error) {
      console.error("Get pickup slots error:", error);
      res.status(500).json({ error: "Failed to fetch pickup slots" });
    }
  });
  
  // Update node availability
  app.post("/api/nodes/:nodeId/availability", async (req, res) => {
    try {
      const parsed = insertNodeAvailabilitySchema.parse({
        nodeId: req.params.nodeId,
        ...req.body
      });
      const availability = await storage.upsertNodeAvailability(parsed);
      res.json(availability);
    } catch (error) {
      console.error("Update availability error:", error);
      res.status(400).json({ error: "Invalid availability data" });
    }
  });

  // Bulk save node availability schedule
  app.put("/api/nodes/:nodeId/availability/schedule", async (req, res) => {
    try {
      const nodeId = req.params.nodeId;
      const { schedule } = req.body;
      
      if (!Array.isArray(schedule)) {
        return res.status(400).json({ error: "Schedule must be an array" });
      }
      
      // Validate each entry
      for (const entry of schedule) {
        if (!entry.dayOfWeek || !entry.startTime || !entry.endTime) {
          return res.status(400).json({ error: "Each entry must have dayOfWeek, startTime, and endTime" });
        }
      }
      
      // Helper function to convert time string to minutes for comparison
      const timeToMinutes = (timeStr: string): number => {
        const [hours, minutes] = timeStr.split(':').map(Number);
        return hours * 60 + minutes;
      };
      
      // Check for overlapping windows on the same day
      const enabledEntries = schedule.filter((e: any) => e.enabled);
      const entriesByDay: Record<string, Array<{ startTime: string; endTime: string; index: number }>> = {};
      
      enabledEntries.forEach((entry: any, idx: number) => {
        if (!entriesByDay[entry.dayOfWeek]) {
          entriesByDay[entry.dayOfWeek] = [];
        }
        entriesByDay[entry.dayOfWeek].push({
          startTime: entry.startTime,
          endTime: entry.endTime,
          index: idx
        });
      });
      
      // Check each day for overlaps
      for (const [day, entries] of Object.entries(entriesByDay)) {
        if (entries.length > 1) {
          // Sort by start time
          entries.sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime));
          
          // Check for overlaps between consecutive windows
          for (let i = 0; i < entries.length - 1; i++) {
            const current = entries[i];
            const next = entries[i + 1];
            
            const currentEnd = timeToMinutes(current.endTime);
            const nextStart = timeToMinutes(next.startTime);
            
            if (currentEnd > nextStart) {
              return res.status(400).json({ 
                error: `Overlapping pickup windows on ${day}: ${current.startTime}-${current.endTime} overlaps with ${next.startTime}-${next.endTime}` 
              });
            }
          }
        }
      }
      
      // Server-side lock enforcement: for active nodes, prevent changes to days within the lock window
      // The weekly schedule is a template (not date-specific), so we lock at the day level.
      // The next occurrence of each day that falls within the lock window is protected.
      const node = await storage.getNode(nodeId);
      if (node && node.status === 'active') {
        const noticeHours = node.availabilityNoticeHours ?? 48;
        if (noticeHours > 0) {
          const now = new Date();
          const lockEndTime = new Date(now.getTime() + noticeHours * 60 * 60 * 1000);
          const currentAvailability = await storage.getNodeAvailability(nodeId);
          
          // Build map of current availability by day
          const currentByDay: Record<string, Array<{startTime: string; endTime: string}>> = {};
          for (const entry of currentAvailability) {
            if (entry.enabled) {
              if (!currentByDay[entry.dayOfWeek]) currentByDay[entry.dayOfWeek] = [];
              currentByDay[entry.dayOfWeek].push({ startTime: entry.startTime, endTime: entry.endTime });
            }
          }
          
          // Check which days have their next occurrence starting within the lock window
          const DAYS_OF_WEEK = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
          const lockedDays = new Set<string>();
          for (let dayOffset = 0; dayOffset < 7; dayOffset++) {
            const checkDate = new Date(now);
            checkDate.setDate(now.getDate() + dayOffset);
            const dayName = DAYS_OF_WEEK[checkDate.getDay()];
            // A day is locked if the start of that day is before the lock end time
            checkDate.setHours(0, 0, 0, 0);
            if (checkDate < lockEndTime) {
              lockedDays.add(dayName);
            }
          }
          
          // For locked days, preserve the current availability (don't allow changes)
          if (lockedDays.size > 0) {
            const newByDay: Record<string, Array<{startTime: string; endTime: string; enabled: boolean}>> = {};
            for (const entry of schedule) {
              if (!newByDay[entry.dayOfWeek]) newByDay[entry.dayOfWeek] = [];
              newByDay[entry.dayOfWeek].push(entry);
            }
            
            const finalSchedule: typeof schedule = [];
            
            for (const day of ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']) {
              if (lockedDays.has(day)) {
                const currentWindows = currentByDay[day] || [];
                for (const w of currentWindows) {
                  finalSchedule.push({ dayOfWeek: day, startTime: w.startTime, endTime: w.endTime, enabled: true });
                }
              } else {
                const newWindows = newByDay[day] || [];
                for (const w of newWindows) {
                  finalSchedule.push(w);
                }
              }
            }
            
            schedule.length = 0;
            schedule.push(...finalSchedule);
          }
        }
      }
      
      const previousAvailability = await storage.getNodeAvailability(nodeId);
      const result = await storage.saveNodeAvailabilityBulk(nodeId, schedule);

      try {
        const userName = req.session?.userId ? (await storage.getUser(req.session.userId))?.name || req.session.userId : 'unknown';
        const prevDays = [...new Set(previousAvailability.filter(a => a.enabled).map(a => a.dayOfWeek))];
        const newDays = [...new Set(schedule.filter((e: any) => e.enabled).map((e: any) => e.dayOfWeek))];
        const summary = `Weekly schedule updated: ${prevDays.length} days → ${newDays.length} days (${newDays.join(', ') || 'none'})`;
        await db.insert(availabilityEditHistory).values({
          nodeId,
          editType: 'schedule',
          editedBy: req.session?.userId || 'unknown',
          editedByName: userName,
          previousValue: previousAvailability.filter(a => a.enabled).map(a => ({ dayOfWeek: a.dayOfWeek, startTime: a.startTime, endTime: a.endTime })),
          newValue: schedule.filter((e: any) => e.enabled).map((e: any) => ({ dayOfWeek: e.dayOfWeek, startTime: e.startTime, endTime: e.endTime })),
          summary,
        });
      } catch (histErr) {
        console.error("Failed to log availability edit:", histErr);
      }

      res.json(result);
    } catch (error) {
      console.error("Save availability schedule error:", error);
      res.status(500).json({ error: "Failed to save availability schedule" });
    }
  });
  
  // Save date-specific availability overrides
  app.put("/api/nodes/:nodeId/availability/overrides", async (req, res) => {
    try {
      const nodeId = req.params.nodeId;
      const { overrides } = req.body;
      
      // Validate overrides format
      if (typeof overrides !== 'object') {
        return res.status(400).json({ error: "Overrides must be an object" });
      }
      
      // Helper function to convert time string to minutes
      const timeToMinutes = (timeStr: string): number => {
        const [hours, minutes] = timeStr.split(':').map(Number);
        return hours * 60 + minutes;
      };
      
      // Check for overlaps in custom overrides
      for (const [date, override] of Object.entries(overrides) as [string, any][]) {
        if (override.type === 'custom' && override.windows && override.windows.length > 1) {
          const windows = override.windows as Array<{ startTime: string; endTime: string }>;
          const sorted = [...windows].sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime));
          
          for (let i = 0; i < sorted.length - 1; i++) {
            const currentEnd = timeToMinutes(sorted[i].endTime);
            const nextStart = timeToMinutes(sorted[i + 1].startTime);
            
            if (currentEnd > nextStart) {
              return res.status(400).json({
                error: `Overlapping windows on ${date}: ${sorted[i].startTime}-${sorted[i].endTime} overlaps with ${sorted[i + 1].startTime}-${sorted[i + 1].endTime}`
              });
            }
          }
        }
      }
      
      const node = await storage.getNode(nodeId);
      const previousOverrides = (node as any)?.availabilityOverrides || {};

      await storage.updateNode(nodeId, { availabilityOverrides: overrides });

      try {
        const userName = req.session?.userId ? (await storage.getUser(req.session.userId))?.name || req.session.userId : 'unknown';
        const prevDates = Object.keys(previousOverrides);
        const newDates = Object.keys(overrides);
        const addedDates = newDates.filter(d => !prevDates.includes(d));
        const removedDates = prevDates.filter(d => !newDates.includes(d));
        const changedDates = newDates.filter(d => prevDates.includes(d) && JSON.stringify(overrides[d]) !== JSON.stringify(previousOverrides[d]));
        const parts = [];
        if (addedDates.length) parts.push(`added ${addedDates.length} override(s)`);
        if (removedDates.length) parts.push(`removed ${removedDates.length} override(s)`);
        if (changedDates.length) parts.push(`changed ${changedDates.length} override(s)`);
        const summary = parts.length > 0 ? `Calendar overrides: ${parts.join(', ')}` : 'Calendar overrides updated (no changes)';
        await db.insert(availabilityEditHistory).values({
          nodeId,
          editType: 'override',
          editedBy: req.session?.userId || 'unknown',
          editedByName: userName,
          previousValue: previousOverrides,
          newValue: overrides,
          summary,
        });
      } catch (histErr) {
        console.error("Failed to log availability override edit:", histErr);
      }

      res.json({ success: true });
    } catch (error) {
      console.error("Save availability overrides error:", error);
      res.status(500).json({ error: "Failed to save availability overrides" });
    }
  });
  
  app.get("/api/nodes/:nodeId/availability/history", async (req, res) => {
    try {
      if (!req.session?.userId) return res.status(401).json({ error: "Not authenticated" });
      const user = await storage.getUser(req.session.userId);
      if (!user || user.type !== 'admin') return res.status(403).json({ error: "Admin access required" });
      const nodeId = req.params.nodeId;
      const history = await db.select().from(availabilityEditHistory)
        .where(eq(availabilityEditHistory.nodeId, nodeId))
        .orderBy(desc(availabilityEditHistory.createdAt))
        .limit(50);
      res.json(history);
    } catch (error) {
      console.error("Fetch availability history error:", error);
      res.status(500).json({ error: "Failed to fetch availability history" });
    }
  });

  // ===== Contact Form =====
  app.post("/api/contact", async (req, res) => {
    try {
      const { name, email, subject, message } = req.body;
      if (!name || !email || !message) {
        return res.status(400).json({ error: "Name, email, and message are required" });
      }
      res.json({ success: true });

      try {
        if (process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD) {
          const recipients = await getNotificationRecipients('notifEmail_contactForm');
          if (recipients.length > 0) {
            await gmailTransporter.sendMail({
              from: `"GridMart" <${process.env.GMAIL_USER}>`,
              to: recipients.join(','),
              replyTo: email,
              subject: `Contact Form: ${subject || 'No Subject'}`,
              html: `
                <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:20px;">
                  <h2 style="color:#0d9488;margin-bottom:8px;">New Contact Form Message</h2>
                  <table style="width:100%;border-collapse:collapse;margin:12px 0;">
                    <tr><td style="padding:6px 12px;color:#6b7280;">Name</td><td style="padding:6px 12px;font-weight:600;">${escapeHtml(name)}</td></tr>
                    <tr><td style="padding:6px 12px;color:#6b7280;">Email</td><td style="padding:6px 12px;">${escapeHtml(email)}</td></tr>
                    ${subject ? `<tr><td style="padding:6px 12px;color:#6b7280;">Subject</td><td style="padding:6px 12px;">${escapeHtml(subject)}</td></tr>` : ''}
                  </table>
                  <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:16px;margin-top:12px;">
                    <p style="color:#374151;white-space:pre-wrap;">${escapeHtml(message)}</p>
                  </div>
                  <p style="color:#9ca3af;font-size:12px;margin-top:16px;">Submitted ${new Date().toLocaleString()}</p>
                </div>
              `,
            });
            console.log(`[EMAIL] Contact form notification sent for ${name}`);
          }
        }
      } catch (emailErr) {
        console.error("[EMAIL] Failed to send contact form notification:", emailErr);
      }
    } catch (error) {
      console.error("Contact form error:", error);
      res.status(500).json({ error: "Failed to submit contact form" });
    }
  });

  // ===== Node Application Routes =====
  
  // Submit node application
  app.post("/api/node-applications", async (req, res) => {
    try {
      const parsed = insertNodeApplicationSchema.parse(req.body);
      const application = await storage.createNodeApplication(parsed);
      res.json(application);

      try {
        if (process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD) {
          const recipients = await getNotificationRecipients('notifEmail_nodeApplication');

          if (recipients.length > 0) {
            const safeName = escapeHtml(application.name || '(not provided)');
            const safeEmail = escapeHtml(application.email || '(not provided)');
            const safeCity = escapeHtml(application.cityNeighborhood || '(not provided)');
            const safeNotes = application.additionalNotes ? escapeHtml(application.additionalNotes) : '';

            await gmailTransporter.sendMail({
              from: `"GridMart" <${process.env.GMAIL_USER}>`,
              to: recipients.join(','),
              subject: `New Node Host Application: ${application.name || application.email}`,
              html: `
                <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:20px;">
                  <h2 style="color:#0d9488;margin-bottom:8px;">New Node Host Application</h2>
                  <table style="width:100%;border-collapse:collapse;margin:12px 0;">
                    <tr><td style="padding:6px 12px;color:#6b7280;">Name</td><td style="padding:6px 12px;font-weight:600;">${safeName}</td></tr>
                    <tr><td style="padding:6px 12px;color:#6b7280;">Email</td><td style="padding:6px 12px;">${safeEmail}</td></tr>
                    <tr><td style="padding:6px 12px;color:#6b7280;">Area</td><td style="padding:6px 12px;">${safeCity}</td></tr>
                    ${safeNotes ? `<tr><td style="padding:6px 12px;color:#6b7280;">Notes</td><td style="padding:6px 12px;">${safeNotes}</td></tr>` : ''}
                  </table>
                  <p style="color:#6b7280;font-size:13px;margin-top:16px;">Review this application in your admin dashboard.</p>
                </div>
              `,
            });
            console.log(`[EMAIL] New application notification sent for ${application.name}`);
          }
        }
      } catch (emailErr) {
        console.error('[EMAIL] Failed to send application notification:', emailErr);
      }
    } catch (error) {
      console.error("Create node application error:", error);
      res.status(400).json({ error: "Invalid application data" });
    }
  });
  
  // Get all node applications (admin only)
  app.get("/api/node-applications", async (req, res) => {
    try {
      if (!req.session?.userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      
      const user = await storage.getUser(req.session.userId);
      if (!user || user.type !== 'admin') {
        return res.status(403).json({ error: "Admin access required" });
      }
      
      const applications = await storage.getAllNodeApplications();
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('ETag', Date.now().toString());
      res.json(applications);
    } catch (error) {
      console.error("Get node applications error:", error);
      res.status(500).json({ error: "Failed to fetch applications" });
    }
  });
  
  // Update node application status (admin only)
  app.patch("/api/node-applications/:id/status", async (req, res) => {
    try {
      if (!req.session?.userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      
      const user = await storage.getUser(req.session.userId);
      if (!user || user.type !== 'admin') {
        return res.status(403).json({ error: "Admin access required" });
      }
      
      const { status } = req.body;
      const application = await storage.updateNodeApplicationStatus(req.params.id, status);
      if (!application) {
        return res.status(404).json({ error: "Application not found" });
      }
      
      // If approved and applicant exists, give them buyer role so they can shop
      if (status === 'approved' && application.email) {
        const nodeUser = await storage.getUserByEmail(application.email);
        if (nodeUser && nodeUser.type === 'node') {
          await storage.updateUserRoles(nodeUser.id, ['node', 'buyer']);
        }
      }
      
      res.json(application);
    } catch (error) {
      console.error("Update application status error:", error);
      res.status(500).json({ error: "Failed to update application status" });
    }
  });
  
  // Delete node application (admin only)
  app.delete("/api/node-applications/:id", async (req, res) => {
    try {
      if (!req.session?.userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      
      const user = await storage.getUser(req.session.userId);
      if (!user || user.type !== 'admin') {
        return res.status(403).json({ error: "Admin access required" });
      }
      
      const deleted = await storage.deleteNodeApplication(req.params.id);
      if (!deleted) {
        return res.status(404).json({ error: "Application not found" });
      }
      
      res.json({ success: true });
    } catch (error) {
      console.error("Delete application error:", error);
      res.status(500).json({ error: "Failed to delete application" });
    }
  });

  // Update application onboarding status and notes
  app.patch("/api/node-applications/:id/details", async (req, res) => {
    try {
      if (!req.session?.userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      
      const user = await storage.getUser(req.session.userId);
      if (!user || user.type !== 'admin') {
        return res.status(403).json({ error: "Admin access required" });
      }
      
      const { onboardingStatus, notes } = req.body;
      const updated = await storage.updateNodeApplicationDetails(req.params.id, { onboardingStatus, notes });
      if (!updated) {
        return res.status(404).json({ error: "Application not found" });
      }
      
      res.json(updated);
    } catch (error) {
      console.error("Update application details error:", error);
      res.status(500).json({ error: "Failed to update application" });
    }
  });

  // Application Status CRUD
  app.get("/api/application-statuses", async (req, res) => {
    try {
      const statuses = await storage.getAllApplicationStatuses();
      res.json(statuses);
    } catch (error) {
      console.error("Get application statuses error:", error);
      res.status(500).json({ error: "Failed to fetch statuses" });
    }
  });

  app.post("/api/application-statuses", async (req, res) => {
    try {
      if (!req.session?.userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      
      const user = await storage.getUser(req.session.userId);
      if (!user || user.type !== 'admin') {
        return res.status(403).json({ error: "Admin access required" });
      }
      
      const { name, color, sortOrder } = req.body;
      if (!name) {
        return res.status(400).json({ error: "Name is required" });
      }
      
      const status = await storage.createApplicationStatus({ 
        name, 
        color: color || '#9CA3AF', 
        sortOrder: sortOrder || 0 
      });
      res.json(status);
    } catch (error) {
      console.error("Create application status error:", error);
      res.status(500).json({ error: "Failed to create status" });
    }
  });

  app.patch("/api/application-statuses/:id", async (req, res) => {
    try {
      if (!req.session?.userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      
      const user = await storage.getUser(req.session.userId);
      if (!user || user.type !== 'admin') {
        return res.status(403).json({ error: "Admin access required" });
      }
      
      const { name, color, sortOrder } = req.body;
      const updated = await storage.updateApplicationStatus(req.params.id, { name, color, sortOrder });
      if (!updated) {
        return res.status(404).json({ error: "Status not found" });
      }
      
      res.json(updated);
    } catch (error) {
      console.error("Update application status error:", error);
      res.status(500).json({ error: "Failed to update status" });
    }
  });

  app.delete("/api/application-statuses/:id", async (req, res) => {
    try {
      if (!req.session?.userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      
      const user = await storage.getUser(req.session.userId);
      if (!user || user.type !== 'admin') {
        return res.status(403).json({ error: "Admin access required" });
      }
      
      const deleted = await storage.deleteApplicationStatus(req.params.id);
      if (!deleted) {
        return res.status(404).json({ error: "Status not found" });
      }
      
      res.json({ success: true });
    } catch (error) {
      console.error("Delete application status error:", error);
      res.status(500).json({ error: "Failed to delete status" });
    }
  });
  
  // ===== Screening Questions Routes =====
  
  // Get all screening questions (admin only)
  app.get("/api/screening-questions", async (req, res) => {
    try {
      if (!req.session?.userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      
      const user = await storage.getUser(req.session.userId);
      if (!user || user.type !== 'admin') {
        return res.status(403).json({ error: "Admin access required" });
      }
      
      const questions = await storage.getAllScreeningQuestions();
      res.json(questions);
    } catch (error) {
      console.error("Get screening questions error:", error);
      res.status(500).json({ error: "Failed to get screening questions" });
    }
  });
  
  // Create screening question (admin only)
  app.post("/api/screening-questions", async (req, res) => {
    try {
      if (!req.session?.userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      
      const user = await storage.getUser(req.session.userId);
      if (!user || user.type !== 'admin') {
        return res.status(403).json({ error: "Admin access required" });
      }
      
      const { question, questionType = 'text', options, isRequired = true, sortOrder = 0 } = req.body;
      if (!question) {
        return res.status(400).json({ error: "Question is required" });
      }
      
      const created = await storage.createScreeningQuestion({
        question,
        questionType,
        options: options || null,
        isRequired,
        sortOrder,
        isActive: true,
      });
      res.json(created);
    } catch (error) {
      console.error("Create screening question error:", error);
      res.status(500).json({ error: "Failed to create screening question" });
    }
  });
  
  // Update screening question (admin only)
  app.patch("/api/screening-questions/:id", async (req, res) => {
    try {
      if (!req.session?.userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      
      const user = await storage.getUser(req.session.userId);
      if (!user || user.type !== 'admin') {
        return res.status(403).json({ error: "Admin access required" });
      }
      
      const updated = await storage.updateScreeningQuestion(req.params.id, req.body);
      if (!updated) {
        return res.status(404).json({ error: "Question not found" });
      }
      res.json(updated);
    } catch (error) {
      console.error("Update screening question error:", error);
      res.status(500).json({ error: "Failed to update screening question" });
    }
  });
  
  // Delete screening question (admin only)
  app.delete("/api/screening-questions/:id", async (req, res) => {
    try {
      if (!req.session?.userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      
      const user = await storage.getUser(req.session.userId);
      if (!user || user.type !== 'admin') {
        return res.status(403).json({ error: "Admin access required" });
      }
      
      await storage.deleteScreeningQuestion(req.params.id);
      res.json({ success: true });
    } catch (error) {
      console.error("Delete screening question error:", error);
      res.status(500).json({ error: "Failed to delete screening question" });
    }
  });
  
  // Get AI chat history
  app.get("/api/screening-questions/ai-chat-history", async (req, res) => {
    try {
      if (!req.session?.userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const user = await storage.getUser(req.session.userId);
      if (!user || user.type !== 'admin') {
        return res.status(403).json({ error: "Admin access required" });
      }
      
      const result = await db.execute(sql`SELECT messages FROM screening_ai_chat LIMIT 1`);
      const messages = result.rows[0]?.messages || [];
      res.json({ messages });
    } catch (error) {
      console.error("Get AI chat history error:", error);
      res.json({ messages: [] });
    }
  });
  
  // Save AI chat history
  app.post("/api/screening-questions/ai-chat-history", async (req, res) => {
    try {
      if (!req.session?.userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const user = await storage.getUser(req.session.userId);
      if (!user || user.type !== 'admin') {
        return res.status(403).json({ error: "Admin access required" });
      }
      
      const { messages } = req.body;
      // Upsert - insert or update the single chat history row
      await db.execute(sql`
        INSERT INTO screening_ai_chat (id, messages, updated_at) 
        VALUES ('main', ${JSON.stringify(messages)}::jsonb, NOW())
        ON CONFLICT (id) DO UPDATE SET messages = ${JSON.stringify(messages)}::jsonb, updated_at = NOW()
      `);
      res.json({ success: true });
    } catch (error) {
      console.error("Save AI chat history error:", error);
      res.status(500).json({ error: "Failed to save chat history" });
    }
  });
  
  // Clear AI chat history
  app.delete("/api/screening-questions/ai-chat-history", async (req, res) => {
    try {
      if (!req.session?.userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const user = await storage.getUser(req.session.userId);
      if (!user || user.type !== 'admin') {
        return res.status(403).json({ error: "Admin access required" });
      }
      
      await db.execute(sql`DELETE FROM screening_ai_chat WHERE id = 'main'`);
      res.json({ success: true });
    } catch (error) {
      console.error("Clear AI chat history error:", error);
      res.status(500).json({ error: "Failed to clear chat history" });
    }
  });
  
  // AI chat for screening questions
  app.post("/api/screening-questions/ai-chat", async (req, res) => {
    try {
      if (!req.session?.userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      
      const user = await storage.getUser(req.session.userId);
      if (!user || user.type !== 'admin') {
        return res.status(403).json({ error: "Admin access required" });
      }
      
      const { messages, currentQuestions } = req.body;
      if (!messages || !Array.isArray(messages)) {
        return res.status(400).json({ error: "Messages are required" });
      }
      
      const OpenAI = (await import('openai')).default;
      const openai = new OpenAI({
        apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
        baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
      });
      
      const businessContext = `You are an AI assistant helping create secondary screening questions for GridMart's node host application process.

ABOUT GRIDMART:
GridMart is a local pickup marketplace connecting buyers with neighborhood "Nodes" (fulfillment partners who host pickup locations). Node hosts store products at their home/business, manage pickup schedules, and hand off orders to customers. They earn a handoff fee for each order they fulfill.

INITIAL APPLICATION (already collected):
- Full name, phone, email
- City/neighborhood area
- Node type (home-based vs storefront)
- Availability window (morning, afternoon, evening)
- Late availability (after 7pm, after 9pm)
- Storage size (small/medium/large)
- Agreement to prepaid model
- Can store a crate of products
- Comfortable meeting customers outside
- Comfortable adjusting availability
- Can pause handoffs when needed
- Additional notes

CURRENT SECONDARY SCREENING QUESTIONS:
${currentQuestions?.length > 0 ? currentQuestions.map((q: string, i: number) => `${i + 1}. ${q}`).join('\n') : '(none yet)'}

YOUR ROLE:
- Be a friendly, conversational assistant - chat naturally like a colleague
- Help the admin think through what they want to learn about applicants
- Discuss concerns, ideas, and strategy before jumping to specific questions
- Only provide questions when the admin specifically asks for question suggestions
- It's totally fine to just chat, brainstorm ideas, or discuss without listing questions
- Keep responses concise but warm - you're having a conversation, not writing a document

QUESTION FORMAT (when providing questions):
When you suggest a question, include a JSON block at the END of your message with ALL fields:

\`\`\`json
{"questions": [
  {"question": "Your question text", "questionType": "text", "isRequired": true, "options": []},
  {"question": "Another question", "questionType": "select", "isRequired": true, "options": ["Option 1", "Option 2", "Option 3"]}
]}
\`\`\`

Question types:
- "text" = short text answer
- "textarea" = long text answer  
- "select" = multiple choice (MUST include options array)
- "boolean" = yes/no

Always include the JSON block when suggesting questions so they can be created with proper formatting.`;
      
      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: businessContext },
          ...messages.map((m: any) => ({ role: m.role, content: m.content }))
        ],
        max_completion_tokens: 500,
      });
      
      const reply = response.choices[0]?.message?.content?.trim() || "I'm sorry, I couldn't generate a response.";
      
      // Extract structured questions from JSON block if present
      let suggestedQuestions: any[] = [];
      const jsonMatch = reply.match(/```json\s*([\s\S]*?)\s*```/);
      if (jsonMatch) {
        try {
          const parsed = JSON.parse(jsonMatch[1]);
          if (parsed.questions && Array.isArray(parsed.questions)) {
            suggestedQuestions = parsed.questions;
          }
        } catch (e) {
          console.log('[AI Chat] Failed to parse JSON block:', e);
        }
      }
      
      // Return clean reply (without JSON block) plus structured questions
      const cleanReply = reply.replace(/```json[\s\S]*?```/g, '').trim();
      res.json({ reply: cleanReply, suggestedQuestions });
    } catch (error) {
      console.error("AI chat error:", error);
      res.status(500).json({ error: "Failed to get AI response" });
    }
  });
  
  // AI-rewrite screening question
  app.post("/api/screening-questions/ai-rewrite", async (req, res) => {
    try {
      if (!req.session?.userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      
      const user = await storage.getUser(req.session.userId);
      if (!user || user.type !== 'admin') {
        return res.status(403).json({ error: "Admin access required" });
      }
      
      const { question, prompt, questionType, options, isRequired } = req.body;
      if (!question || !prompt) {
        return res.status(400).json({ error: "Question and prompt are required" });
      }
      
      const OpenAI = (await import('openai')).default;
      const openai = new OpenAI({
        apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
        baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
      });
      
      const businessContext = `GridMart is a local pickup marketplace connecting buyers with neighborhood "Nodes" (fulfillment partners who host pickup locations). Node hosts store products at their home/business, manage pickup schedules, and hand off orders to customers.

Initial Application Questions Already Asked:
- Full name, phone, email
- City/neighborhood area
- Node type (home-based vs storefront)
- Availability window (morning, afternoon, evening)
- Late availability (after 7pm, after 9pm)
- Storage size (small/medium/large)
- Agreement to prepaid model
- Can store a crate of products
- Comfortable meeting customers outside
- Comfortable adjusting availability
- Can pause handoffs when needed
- Additional notes`;

      const currentSettings = `Current settings:
- Response type: ${questionType || 'text'} (options: text, textarea, select, boolean)
- Required: ${isRequired !== false ? 'yes' : 'no'}
- Options: ${options?.length ? options.join(', ') : 'none'}`;
      
      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: `You are helping create secondary screening questions for GridMart's node host application process.

${businessContext}

${currentSettings}

Your task: Modify the question based on the admin's instruction. You can change:
1. The question text
2. The response type (text = short answer, textarea = long answer, select = multiple choice, boolean = yes/no)
3. Whether it's required or optional
4. The options (for multiple choice questions)

IMPORTANT: Always return a complete JSON object with ALL fields:
{
  "question": "the rewritten question text",
  "questionType": "text" or "textarea" or "select" or "boolean",
  "isRequired": true or false,
  "options": ["Option 1", "Option 2", "Option 3"] (required if questionType is "select", otherwise empty array [])
}

If making it multiple choice, you MUST set questionType to "select" and provide options array.
Return ONLY the JSON object, no markdown code blocks or explanation.`
          },
          {
            role: "user",
            content: `Question to edit: "${question}"\n\nInstruction: ${prompt}`
          }
        ],
        max_completion_tokens: 500,
      });
      
      let responseText = response.choices[0]?.message?.content?.trim() || '{}';
      
      // Strip markdown code blocks if present
      responseText = responseText.replace(/^```json?\s*/i, '').replace(/\s*```$/i, '').trim();
      
      console.log('[AI Rewrite] Raw response:', responseText);
      
      try {
        // Try to parse as JSON for full control
        const parsed = JSON.parse(responseText);
        console.log('[AI Rewrite] Parsed:', parsed);
        
        const result = {
          rewritten: parsed.question || question,
          questionType: parsed.questionType || undefined,
          isRequired: typeof parsed.isRequired === 'boolean' ? parsed.isRequired : undefined,
          options: Array.isArray(parsed.options) ? parsed.options : undefined
        };
        console.log('[AI Rewrite] Returning:', result);
        res.json(result);
      } catch (parseError) {
        console.log('[AI Rewrite] JSON parse failed:', parseError);
        // Fall back to treating response as just the question text
        res.json({ rewritten: responseText });
      }
    } catch (error) {
      console.error("AI rewrite error:", error);
      res.status(500).json({ error: "Failed to rewrite question" });
    }
  });
  
  // Reorder screening questions
  app.post("/api/screening-questions/reorder", async (req, res) => {
    try {
      if (!req.session?.userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      
      const user = await storage.getUser(req.session.userId);
      if (!user || user.type !== 'admin') {
        return res.status(403).json({ error: "Admin access required" });
      }
      
      const { questionIds } = req.body;
      if (!Array.isArray(questionIds)) {
        return res.status(400).json({ error: "questionIds array is required" });
      }
      
      // Update sortOrder for each question
      for (let i = 0; i < questionIds.length; i++) {
        await storage.updateScreeningQuestion(questionIds[i], { sortOrder: i });
      }
      
      res.json({ success: true });
    } catch (error) {
      console.error("Reorder questions error:", error);
      res.status(500).json({ error: "Failed to reorder questions" });
    }
  });
  
  // ===== Primary Screening Questions Routes =====
  
  // Get all primary screening questions (admin only)
  app.get("/api/primary-screening-questions", async (req, res) => {
    try {
      if (!req.session?.userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      
      const user = await storage.getUser(req.session.userId);
      if (!user || user.type !== 'admin') {
        return res.status(403).json({ error: "Admin access required" });
      }
      
      const questions = await storage.getAllPrimaryScreeningQuestions();
      res.json(questions);
    } catch (error) {
      console.error("Get primary screening questions error:", error);
      res.status(500).json({ error: "Failed to get primary screening questions" });
    }
  });
  
  // Get active primary screening questions (public - for the application form)
  app.get("/api/primary-screening-questions/active", async (req, res) => {
    try {
      const questions = await storage.getActivePrimaryScreeningQuestions();
      res.json(questions);
    } catch (error) {
      console.error("Get active primary screening questions error:", error);
      res.status(500).json({ error: "Failed to get primary screening questions" });
    }
  });
  
  // Create primary screening question (admin only)
  app.post("/api/primary-screening-questions", async (req, res) => {
    try {
      if (!req.session?.userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      
      const user = await storage.getUser(req.session.userId);
      if (!user || user.type !== 'admin') {
        return res.status(403).json({ error: "Admin access required" });
      }
      
      const { question, questionType = 'text', options, hasOtherOption = false, isRequired = true, sortOrder = 0, fieldKey } = req.body;
      if (!question) {
        return res.status(400).json({ error: "Question is required" });
      }
      
      const created = await storage.createPrimaryScreeningQuestion({
        question,
        questionType,
        options: options || null,
        hasOtherOption,
        isRequired,
        sortOrder,
        fieldKey: fieldKey || null,
        isActive: true,
      });
      res.json(created);
    } catch (error) {
      console.error("Create primary screening question error:", error);
      res.status(500).json({ error: "Failed to create primary screening question" });
    }
  });
  
  // Update primary screening question (admin only)
  app.patch("/api/primary-screening-questions/:id", async (req, res) => {
    try {
      if (!req.session?.userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      
      const user = await storage.getUser(req.session.userId);
      if (!user || user.type !== 'admin') {
        return res.status(403).json({ error: "Admin access required" });
      }
      
      const updated = await storage.updatePrimaryScreeningQuestion(req.params.id, req.body);
      if (!updated) {
        return res.status(404).json({ error: "Question not found" });
      }
      res.json(updated);
    } catch (error) {
      console.error("Update primary screening question error:", error);
      res.status(500).json({ error: "Failed to update primary screening question" });
    }
  });
  
  // Delete primary screening question (admin only)
  app.delete("/api/primary-screening-questions/:id", async (req, res) => {
    try {
      if (!req.session?.userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      
      const user = await storage.getUser(req.session.userId);
      if (!user || user.type !== 'admin') {
        return res.status(403).json({ error: "Admin access required" });
      }
      
      await storage.deletePrimaryScreeningQuestion(req.params.id);
      res.json({ success: true });
    } catch (error) {
      console.error("Delete primary screening question error:", error);
      res.status(500).json({ error: "Failed to delete primary screening question" });
    }
  });
  
  // Reorder primary screening questions (admin only)
  app.post("/api/primary-screening-questions/reorder", async (req, res) => {
    try {
      if (!req.session?.userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      
      const user = await storage.getUser(req.session.userId);
      if (!user || user.type !== 'admin') {
        return res.status(403).json({ error: "Admin access required" });
      }
      
      const { questionIds } = req.body;
      if (!Array.isArray(questionIds)) {
        return res.status(400).json({ error: "questionIds array is required" });
      }
      
      for (let i = 0; i < questionIds.length; i++) {
        await storage.updatePrimaryScreeningQuestion(questionIds[i], { sortOrder: i });
      }
      
      res.json({ success: true });
    } catch (error) {
      console.error("Reorder primary questions error:", error);
      res.status(500).json({ error: "Failed to reorder questions" });
    }
  });
  
  // ===== Serving Cities Routes =====

  app.get("/api/serving-cities", async (_req, res) => {
    try {
      const cities = await storage.getServingCities();
      res.json(cities);
    } catch (error) {
      console.error("Get serving cities error:", error);
      res.status(500).json({ error: "Failed to get serving cities" });
    }
  });

  app.post("/api/serving-cities", async (req, res) => {
    try {
      if (!req.session?.userId) return res.status(401).json({ error: "Not authenticated" });
      const user = await storage.getUser(req.session.userId);
      if (!user || user.type !== 'admin') return res.status(403).json({ error: "Admin access required" });

      const { name, province, latitude, longitude, isAvailable, sortOrder } = req.body;
      if (!name || !province || !latitude || !longitude) {
        return res.status(400).json({ error: "Name, province, latitude, and longitude are required" });
      }

      const city = await storage.createServingCity({
        name, province, latitude, longitude,
        isAvailable: isAvailable ?? false,
        sortOrder: sortOrder ?? 0,
      });
      res.status(201).json(city);
    } catch (error) {
      console.error("Create serving city error:", error);
      res.status(500).json({ error: "Failed to create serving city" });
    }
  });

  app.patch("/api/serving-cities/:id", async (req, res) => {
    try {
      if (!req.session?.userId) return res.status(401).json({ error: "Not authenticated" });
      const user = await storage.getUser(req.session.userId);
      if (!user || user.type !== 'admin') return res.status(403).json({ error: "Admin access required" });

      const updated = await storage.updateServingCity(req.params.id, req.body);
      if (!updated) return res.status(404).json({ error: "City not found" });
      res.json(updated);
    } catch (error) {
      console.error("Update serving city error:", error);
      res.status(500).json({ error: "Failed to update serving city" });
    }
  });

  app.delete("/api/serving-cities/:id", async (req, res) => {
    try {
      if (!req.session?.userId) return res.status(401).json({ error: "Not authenticated" });
      const user = await storage.getUser(req.session.userId);
      if (!user || user.type !== 'admin') return res.status(403).json({ error: "Admin access required" });

      await storage.deleteServingCity(req.params.id);
      res.json({ success: true });
    } catch (error) {
      console.error("Delete serving city error:", error);
      res.status(500).json({ error: "Failed to delete serving city" });
    }
  });

  app.post("/api/serving-cities/reorder", async (req, res) => {
    try {
      if (!req.session?.userId) return res.status(401).json({ error: "Not authenticated" });
      const user = await storage.getUser(req.session.userId);
      if (!user || user.type !== 'admin') return res.status(403).json({ error: "Admin access required" });

      const { cityIds } = req.body;
      if (!Array.isArray(cityIds)) return res.status(400).json({ error: "cityIds array is required" });

      for (let i = 0; i < cityIds.length; i++) {
        await storage.updateServingCity(cityIds[i], { sortOrder: i });
      }
      res.json({ success: true });
    } catch (error) {
      console.error("Reorder serving cities error:", error);
      res.status(500).json({ error: "Failed to reorder cities" });
    }
  });

  // ===== Screening Links Routes =====
  
  // Generate screening link (standalone or for an application) - admin only
  app.post("/api/screening-links", async (req, res) => {
    try {
      if (!req.session?.userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      
      const user = await storage.getUser(req.session.userId);
      if (!user || user.type !== 'admin') {
        return res.status(403).json({ error: "Admin access required" });
      }
      
      const { applicationId, expiresInDays, name, email } = req.body;
      
      // Check if link already exists for this application (only if applicationId provided)
      if (applicationId) {
        const existing = await storage.getScreeningLinkByApplication(applicationId);
        if (existing) {
          return res.json(existing);
        }
      }
      
      // Generate unique token
      const token = Array.from({ length: 32 }, () => 
        'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'[Math.floor(Math.random() * 62)]
      ).join('');
      
      const expiresAt = expiresInDays ? new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000) : null;
      
      const link = await storage.createScreeningLink({
        applicationId: applicationId || null,
        token,
        expiresAt,
        name: name || null,
        email: email || null,
      });
      
      res.json(link);
    } catch (error) {
      console.error("Create screening link error:", error);
      res.status(500).json({ error: "Failed to create screening link" });
    }
  });
  
  // Get all screening links (admin only)
  app.get("/api/screening-links", async (req, res) => {
    try {
      if (!req.session?.userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      
      const user = await storage.getUser(req.session.userId);
      if (!user || user.type !== 'admin') {
        return res.status(403).json({ error: "Admin access required" });
      }
      
      const links = await storage.getAllScreeningLinks();
      res.json(links);
    } catch (error) {
      console.error("Get all screening links error:", error);
      res.status(500).json({ error: "Failed to get screening links" });
    }
  });
  
  // Get responses for a specific screening link (admin only)
  app.get("/api/screening-links/:linkId/responses", async (req, res) => {
    try {
      if (!req.session?.userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      
      const user = await storage.getUser(req.session.userId);
      if (!user || user.type !== 'admin') {
        return res.status(403).json({ error: "Admin access required" });
      }
      
      const link = await storage.getScreeningLink(req.params.linkId);
      if (!link) {
        return res.status(404).json({ error: "Link not found" });
      }
      
      const responses = await storage.getScreeningResponsesByLink(req.params.linkId);
      res.json({ link, responses });
    } catch (error) {
      console.error("Get screening link responses error:", error);
      res.status(500).json({ error: "Failed to get responses" });
    }
  });
  
  // Delete screening link (admin only)
  app.delete("/api/screening-links/:linkId", async (req, res) => {
    try {
      if (!req.session?.userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      
      const user = await storage.getUser(req.session.userId);
      if (!user || user.type !== 'admin') {
        return res.status(403).json({ error: "Admin access required" });
      }
      
      const deleted = await storage.deleteScreeningLink(req.params.linkId);
      if (!deleted) {
        return res.status(404).json({ error: "Screening link not found" });
      }
      
      res.json({ success: true });
    } catch (error) {
      console.error("Delete screening link error:", error);
      res.status(500).json({ error: "Failed to delete screening link" });
    }
  });
  
  // Get screening link for an application (admin only)
  app.get("/api/screening-links/by-application/:applicationId", async (req, res) => {
    try {
      if (!req.session?.userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      
      const user = await storage.getUser(req.session.userId);
      if (!user || user.type !== 'admin') {
        return res.status(403).json({ error: "Admin access required" });
      }
      
      const link = await storage.getScreeningLinkByApplication(req.params.applicationId);
      if (!link) {
        return res.status(404).json({ error: "No screening link found" });
      }
      
      // Also get responses if completed
      let responses: any[] = [];
      if (link.completedAt) {
        responses = await storage.getScreeningResponses(link.id);
      }
      
      res.json({ link, responses });
    } catch (error) {
      console.error("Get screening link error:", error);
      res.status(500).json({ error: "Failed to get screening link" });
    }
  });
  
  // Public: Get screening form by token (no auth required)
  app.get("/api/screening/:token", async (req, res) => {
    try {
      const link = await storage.getScreeningLinkByToken(req.params.token);
      if (!link) {
        return res.status(404).json({ error: "Invalid screening link" });
      }
      
      if (link.completedAt) {
        return res.status(400).json({ error: "This form has already been submitted" });
      }
      
      if (link.expiresAt && new Date(link.expiresAt) < new Date()) {
        return res.status(400).json({ error: "This screening link has expired" });
      }
      
      // Check if standalone link (no application)
      const isStandalone = !link.applicationId;
      let applicantName = 'Applicant';
      
      if (!isStandalone && link.applicationId) {
        const applications = await storage.getAllNodeApplications();
        const application = applications.find(a => a.id === link.applicationId);
        applicantName = application?.name || 'Applicant';
      }
      
      // Get active questions
      const questions = await storage.getActiveScreeningQuestions();
      
      res.json({
        linkId: link.id,
        applicantName,
        isStandalone,
        questions,
      });
    } catch (error) {
      console.error("Get screening form error:", error);
      res.status(500).json({ error: "Failed to get screening form" });
    }
  });
  
  // Public: Submit screening responses (no auth required)
  app.post("/api/screening/:token/submit", async (req, res) => {
    try {
      const link = await storage.getScreeningLinkByToken(req.params.token);
      if (!link) {
        return res.status(404).json({ error: "Invalid screening link" });
      }
      
      if (link.completedAt) {
        return res.status(400).json({ error: "This form has already been submitted" });
      }
      
      if (link.expiresAt && new Date(link.expiresAt) < new Date()) {
        return res.status(400).json({ error: "This screening link has expired" });
      }
      
      const { responses, name, email } = req.body;
      if (!responses || !Array.isArray(responses)) {
        return res.status(400).json({ error: "Responses are required" });
      }
      
      // For standalone links (no application), require name and email
      if (!link.applicationId && (!name || !email)) {
        return res.status(400).json({ error: "Name and email are required" });
      }
      
      // Create responses
      const responseRecords = responses.map((r: any) => ({
        linkId: link.id,
        questionId: r.questionId,
        answer: r.answer || '',
      }));
      
      await storage.createScreeningResponses(responseRecords);
      
      // Mark link as completed (update name/email for standalone links)
      await storage.markScreeningLinkCompleted(link.id, name, email);
      
      res.json({ success: true });

      // Notify admin(s) via email about completed screening
      try {
        if (process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD) {
          const adminEmails = await getNotificationRecipients('notifEmail_screeningComplete');
          if (adminEmails.length > 0) {
            const applicantName = name || link.name || 'Unknown';
            const applicantEmail = email || link.email || 'Unknown';
            const allQuestions = await db.select().from(screeningQuestions);
            const questionMap = new Map(allQuestions.map(q => [q.id, q.question]));
            const answersHtml = responses.map((r: any) => {
              const qText = questionMap.get(r.questionId) || r.questionId;
              return `<tr><td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;color:#6b7280;">${escapeHtml(qText)}</td><td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;">${escapeHtml(r.answer || '')}</td></tr>`;
            }).join('');
            await gmailTransporter.sendMail({
              from: `"GridMart" <${process.env.GMAIL_USER}>`,
              to: adminEmails.join(','),
              subject: `Screening Completed: ${applicantName}`,
              html: `
                <div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:20px;">
                  <h2 style="color:#0d9488;margin-bottom:8px;">Screening Completed</h2>
                  <p style="color:#374151;margin-bottom:16px;"><strong>${escapeHtml(applicantName)}</strong> (${escapeHtml(applicantEmail)}) has completed their screening form.</p>
                  <table style="width:100%;border-collapse:collapse;border:1px solid #e5e7eb;border-radius:8px;">
                    <thead><tr><th style="padding:8px 12px;text-align:left;background:#f9fafb;border-bottom:1px solid #e5e7eb;">Question</th><th style="padding:8px 12px;text-align:left;background:#f9fafb;border-bottom:1px solid #e5e7eb;">Answer</th></tr></thead>
                    <tbody>${answersHtml}</tbody>
                  </table>
                  <p style="margin-top:16px;"><a href="${process.env.REPLIT_DEV_DOMAIN ? 'https://' + process.env.REPLIT_DEV_DOMAIN : 'https://gridmart.ca'}/admin" style="color:#0d9488;">View in Admin Dashboard</a></p>
                </div>
              `,
            });
            console.log(`[EMAIL] Screening completion notification sent to ${adminEmails.length} admin(s) for ${applicantName}`);
          }
        }
      } catch (emailErr) {
        console.error("[EMAIL] Failed to send screening completion notification:", emailErr);
      }
    } catch (error) {
      console.error("Submit screening error:", error);
      res.status(500).json({ error: "Failed to submit screening" });
    }
  });
  
  // ===== Email Subscribers Routes =====
  
  // Subscribe to launch notifications
  app.post("/api/email-subscribers", async (req, res) => {
    try {
      const { email, source = 'coming_soon' } = req.body;
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return res.status(400).json({ error: "Invalid email address" });
      }
      const subscriber = await storage.createEmailSubscriber({ email, source });
      res.json(subscriber);
    } catch (error: any) {
      if (error.code === '23505') {
        return res.status(409).json({ error: "Email already subscribed" });
      }
      console.error("Create email subscriber error:", error);
      res.status(500).json({ error: "Failed to subscribe" });
    }
  });
  
  // Get all email subscribers (admin only)
  app.get("/api/email-subscribers", async (req, res) => {
    try {
      if (!req.session?.userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      
      const user = await storage.getUser(req.session.userId);
      if (!user || user.type !== 'admin') {
        return res.status(403).json({ error: "Admin access required" });
      }
      
      const subscribers = await storage.getAllEmailSubscribers();
      res.json(subscribers);
    } catch (error) {
      console.error("Get email subscribers error:", error);
      res.status(500).json({ error: "Failed to fetch subscribers" });
    }
  });
  
  // Delete email subscriber (admin only)
  app.delete("/api/email-subscribers/:id", async (req, res) => {
    try {
      if (!req.session?.userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      
      const user = await storage.getUser(req.session.userId);
      if (!user || user.type !== 'admin') {
        return res.status(403).json({ error: "Admin access required" });
      }
      
      await storage.deleteEmailSubscriber(req.params.id);
      res.json({ success: true });
    } catch (error) {
      console.error("Delete email subscriber error:", error);
      res.status(500).json({ error: "Failed to delete subscriber" });
    }
  });
  
  // ===== Accounts Management Routes (Admin) =====
  
  // Get all user accounts
  app.get("/api/admin/accounts", async (req, res) => {
    try {
      const userId = req.session?.userId;
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      
      const user = await storage.getUser(userId);
      if (!user || user.type !== 'admin') {
        return res.status(403).json({ error: "Admin access required" });
      }
      
      // Get all users from database
      const allUsers = await db.select({
        id: users.id,
        name: users.name,
        email: users.email,
        phone: users.phone,
        type: users.type,
        roles: users.roles,
        createdAt: users.createdAt,
        smsOptIn: users.smsOptIn,
        emailOptIn: users.emailOptIn,
      }).from(users).orderBy(desc(users.createdAt));
      
      res.json(allUsers);
    } catch (error: any) {
      console.error("Get accounts error:", error);
      res.status(500).json({ error: error.message || "Failed to fetch accounts" });
    }
  });
  
  // Bulk SMS to users (admin only)
  app.post("/api/admin/accounts/bulk-sms", async (req, res) => {
    try {
      if (!req.session?.userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const user = await storage.getUser(req.session.userId);
      if (!user || user.type !== 'admin') {
        return res.status(403).json({ error: "Admin access required" });
      }
      
      const { userIds, message } = req.body;
      if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
        return res.status(400).json({ error: "userIds array is required" });
      }
      if (!message || typeof message !== 'string' || message.trim().length === 0) {
        return res.status(400).json({ error: "message is required" });
      }
      
      let sent = 0;
      let failed = 0;
      const errors: string[] = [];
      
      for (const userId of userIds) {
        const targetUser = await storage.getUser(userId);
        if (!targetUser || !targetUser.phone) {
          failed++;
          errors.push(`User ${userId}: no phone number`);
          continue;
        }
        
        const result = await sendSms(targetUser.phone, message.trim());
        if (result.success) {
          sent++;
        } else {
          failed++;
          errors.push(`User ${targetUser.name || userId}: ${result.error}`);
        }
      }
      
      res.json({ sent, failed, errors, total: userIds.length });
    } catch (error) {
      console.error("Bulk SMS error:", error);
      res.status(500).json({ error: "Failed to send bulk SMS" });
    }
  });

  // Get single account with order history
  app.get("/api/admin/accounts/:id", async (req, res) => {
    try {
      const userId = req.session?.userId;
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      
      const user = await storage.getUser(userId);
      if (!user || user.type !== 'admin') {
        return res.status(403).json({ error: "Admin access required" });
      }
      
      const accountId = req.params.id;
      
      // Get user details
      const [account] = await db.select({
        id: users.id,
        name: users.name,
        email: users.email,
        phone: users.phone,
        type: users.type,
        roles: users.roles,
        createdAt: users.createdAt,
        smsOptIn: users.smsOptIn,
        emailOptIn: users.emailOptIn,
      }).from(users).where(eq(users.id, accountId));
      
      if (!account) {
        return res.status(404).json({ error: "Account not found" });
      }
      
      // Get order history for this user
      const userOrders = await db.select().from(orders).where(eq(orders.buyerId, accountId)).orderBy(desc(orders.createdAt));
      
      // Get order items for each order
      const ordersWithItems = await Promise.all(
        userOrders.map(async (order) => {
          const items = await db.select({
            id: orderItems.id,
            productId: orderItems.productId,
            quantity: orderItems.quantity,
            price: orderItems.price,
            productName: products.name,
            productCode: products.productCode,
          })
          .from(orderItems)
          .leftJoin(products, eq(orderItems.productId, products.id))
          .where(eq(orderItems.orderId, order.id));
          
          return { ...order, items };
        })
      );
      
      const assignedNode = account.type === 'node'
        ? (await db.select({ id: nodes.id, name: nodes.name, status: nodes.status }).from(nodes).where(eq(nodes.userId, accountId)).limit(1))[0] || null
        : null;

      res.json({ account, orders: ordersWithItems, assignedNode });
    } catch (error: any) {
      console.error("Get account details error:", error);
      res.status(500).json({ error: error.message || "Failed to fetch account details" });
    }
  });

  app.patch("/api/admin/accounts/:id/assign-node", async (req, res) => {
    try {
      const userId = req.session?.userId;
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      const user = await storage.getUser(userId);
      if (!user || user.type !== 'admin') {
        return res.status(403).json({ error: "Admin access required" });
      }

      const accountId = req.params.id;
      const { nodeId } = req.body;

      if (!nodeId) {
        return res.status(400).json({ error: "nodeId is required" });
      }

      const targetUser = await storage.getUser(accountId);
      if (!targetUser) {
        return res.status(404).json({ error: "Account not found" });
      }

      const [targetNode] = await db.select().from(nodes).where(eq(nodes.id, nodeId));
      if (!targetNode) {
        return res.status(404).json({ error: "Node not found" });
      }

      await db.update(nodes)
        .set({ userId: accountId })
        .where(eq(nodes.id, nodeId));

      if (targetUser.type !== 'node') {
        await db.update(users)
          .set({ type: 'node', roles: ['node', 'buyer'] })
          .where(eq(users.id, accountId));
      }

      res.json({ success: true, node: { id: targetNode.id, name: targetNode.name } });
    } catch (error: any) {
      console.error("Admin assign node error:", error);
      res.status(500).json({ error: error.message || "Failed to assign node" });
    }
  });

  app.patch("/api/admin/accounts/:id/type", async (req, res) => {
    try {
      const userId = req.session?.userId;
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      
      const user = await storage.getUser(userId);
      if (!user || user.type !== 'admin') {
        return res.status(403).json({ error: "Admin access required" });
      }
      
      const accountId = req.params.id;
      const { type } = req.body;
      
      if (!type || !['buyer', 'node'].includes(type)) {
        return res.status(400).json({ error: "Invalid account type. Must be 'buyer' or 'node'" });
      }
      
      if (accountId === userId) {
        return res.status(400).json({ error: "Cannot change your own admin account type" });
      }
      
      const targetUser = await storage.getUser(accountId);
      if (!targetUser) {
        return res.status(404).json({ error: "Account not found" });
      }
      
      if (targetUser.type === 'admin') {
        return res.status(400).json({ error: "Cannot change admin account type" });
      }
      
      const newRoles = type === 'node' ? ['node', 'buyer'] : ['buyer'];
      
      await db.update(users)
        .set({ type, roles: newRoles })
        .where(eq(users.id, accountId));
      
      if (type === 'node') {
        const existingNode = await db.select().from(nodes).where(eq(nodes.userId, accountId)).limit(1);
        if (existingNode.length === 0) {
          await db.insert(nodes).values({
            name: `${targetUser.name || targetUser.email?.split('@')[0] || 'New'}'s Node`,
            address: '',
            city: '',
            userId: accountId,
            status: 'pending',
          });
        }
      }
      
      const [updated] = await db.select({
        id: users.id,
        name: users.name,
        email: users.email,
        phone: users.phone,
        type: users.type,
        roles: users.roles,
        createdAt: users.createdAt,
        smsOptIn: users.smsOptIn,
        emailOptIn: users.emailOptIn,
      }).from(users).where(eq(users.id, accountId));
      
      res.json({ account: updated });
    } catch (error: any) {
      console.error("Admin update account type error:", error);
      res.status(500).json({ error: error.message || "Failed to update account type" });
    }
  });

  // Admin delete account
  app.delete("/api/admin/accounts/:id", async (req, res) => {
    try {
      const userId = req.session?.userId;
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      
      const user = await storage.getUser(userId);
      if (!user || user.type !== 'admin') {
        return res.status(403).json({ error: "Admin access required" });
      }
      
      const accountId = req.params.id;
      
      // Prevent admin from deleting their own account
      if (accountId === userId) {
        return res.status(400).json({ error: "Cannot delete your own admin account" });
      }
      
      // Hard delete the user
      await storage.deleteUser(accountId);
      
      res.json({ success: true });
    } catch (error: any) {
      console.error("Admin delete account error:", error);
      res.status(500).json({ error: error.message || "Failed to delete account" });
    }
  });
  
  // Refund order (admin only) - partial or full refund
  app.post("/api/admin/orders/:orderId/refund", async (req, res) => {
    try {
      const userId = req.session?.userId;
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      
      const user = await storage.getUser(userId);
      if (!user || user.type !== 'admin') {
        return res.status(403).json({ error: "Admin access required" });
      }
      
      const { orderId } = req.params;
      const { amount, reason } = req.body;
      
      if (!amount || isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) {
        return res.status(400).json({ error: "Valid refund amount is required" });
      }
      
      const order = await storage.getOrder(orderId);
      if (!order) {
        return res.status(404).json({ error: "Order not found" });
      }
      
      if (!order.stripePaymentIntentId) {
        return res.status(400).json({ error: "No payment information found for this order. The order may have been placed before refund tracking was enabled." });
      }
      
      const refundAmount = parseFloat(amount);
      const orderTotal = parseFloat(order.total);
      const alreadyRefunded = parseFloat(order.refundedAmount || '0');
      const maxRefundable = orderTotal - alreadyRefunded;
      
      if (refundAmount > maxRefundable) {
        return res.status(400).json({ 
          error: `Maximum refundable amount is $${maxRefundable.toFixed(2)}` 
        });
      }
      
      // Process refund through Stripe
      const stripe = await getUncachableStripeClient();
      const refund = await stripe.refunds.create({
        payment_intent: order.stripePaymentIntentId,
        amount: Math.round(refundAmount * 100), // Convert to cents
        reason: reason === 'duplicate' ? 'duplicate' : 
                reason === 'fraudulent' ? 'fraudulent' : 'requested_by_customer',
      });
      
      // Update order refunded amount
      const newRefundedAmount = (alreadyRefunded + refundAmount).toFixed(2);
      await storage.updateOrder(orderId, { refundedAmount: newRefundedAmount });
      
      // If fully refunded, update status
      if (parseFloat(newRefundedAmount) >= orderTotal) {
        await storage.updateOrderStatus(orderId, 'refunded');
      }
      
      // Send refund confirmation SMS to customer
      if (order.buyerPhone) {
        const isFullRefund = parseFloat(newRefundedAmount) >= orderTotal;
        const refundMessage = isFullRefund 
          ? `Your GridMart order #${order.pickupCode} has been fully refunded. $${refundAmount.toFixed(2)} will be returned to your original payment method within 5-10 business days.`
          : `A partial refund of $${refundAmount.toFixed(2)} has been issued for your GridMart order #${order.pickupCode}. The amount will be returned to your original payment method within 5-10 business days.`;
        
        try {
          await sendSms(order.buyerPhone, refundMessage);
        } catch (smsError) {
          console.error("Failed to send refund SMS:", smsError);
          // Don't fail the refund if SMS fails
        }
      }
      
      res.json({ 
        success: true, 
        refundId: refund.id,
        amountRefunded: refundAmount,
        totalRefunded: parseFloat(newRefundedAmount),
        remainingRefundable: orderTotal - parseFloat(newRefundedAmount)
      });
    } catch (error: any) {
      console.error("Refund error:", error);
      res.status(500).json({ error: error.message || "Failed to process refund" });
    }
  });
  
  // Manual trigger for expired order processing (admin only)
  app.post("/api/admin/orders/process-expired", async (req, res) => {
    try {
      const userId = req.session?.userId;
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      
      const user = await storage.getUser(userId);
      if (!user || user.type !== 'admin') {
        return res.status(403).json({ error: "Admin access required" });
      }
      
      const result = await processExpiredOrders();
      
      res.json({
        success: true,
        message: `Processed ${result.processed} expired orders`,
        processed: result.processed,
        errors: result.errors
      });
    } catch (error: any) {
      console.error("Process expired orders error:", error);
      res.status(500).json({ error: error.message || "Failed to process expired orders" });
    }
  });

  // ===== Admin Notification Settings Routes =====
  
  // Get all admin settings (admin only)
  app.get("/api/admin/settings", async (req, res) => {
    try {
      if (!req.session?.userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      
      const user = await storage.getUser(req.session.userId);
      if (!user || user.type !== 'admin') {
        return res.status(403).json({ error: "Admin access required" });
      }
      
      const settings = await storage.getAllAdminSettings();
      res.json(settings);
    } catch (error) {
      console.error("Get admin settings error:", error);
      res.status(500).json({ error: "Failed to fetch settings" });
    }
  });
  
  // Update admin setting (admin only)
  app.put("/api/admin/settings/:key", async (req, res) => {
    try {
      if (!req.session?.userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      
      const user = await storage.getUser(req.session.userId);
      if (!user || user.type !== 'admin') {
        return res.status(403).json({ error: "Admin access required" });
      }
      
      const { key } = req.params;
      const { value } = req.body;
      
      if (typeof value !== 'string') {
        return res.status(400).json({ error: "Value must be a string" });
      }
      
      // Validate email format for email settings
      if (key.includes('email') && value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
        return res.status(400).json({ error: "Invalid email format" });
      }
      
      await storage.upsertAdminSetting(key, value);
      res.json({ success: true });
    } catch (error) {
      console.error("Update admin setting error:", error);
      res.status(500).json({ error: "Failed to update setting" });
    }
  });
  
  app.post("/api/admin/notify-nodes", async (req, res) => {
    try {
      if (!req.session?.userId) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      const user = await storage.getUser(req.session.userId);
      if (!user || user.type !== 'admin') {
        return res.status(403).json({ error: "Forbidden - admin access required" });
      }

      const { nodeIds, message, title, channels } = req.body;
      if (!nodeIds || !Array.isArray(nodeIds) || nodeIds.length === 0) {
        return res.status(400).json({ error: "At least one node must be selected" });
      }
      if (!message || !message.trim()) {
        return res.status(400).json({ error: "Message is required" });
      }
      if (!channels || (!channels.dashboard && !channels.email && !channels.sms)) {
        return res.status(400).json({ error: "At least one notification method must be selected" });
      }

      const notifTitle = title?.trim() || 'Message from GridMart Admin';
      const results = { dashboard: 0, email: 0, sms: 0, errors: [] as string[] };

      for (const nodeId of nodeIds) {
        const node = await storage.getNode(nodeId);
        if (!node) {
          results.errors.push(`Node ${nodeId} not found`);
          continue;
        }
        const nodeUser = await storage.getUser(node.userId);
        if (!nodeUser) {
          results.errors.push(`User for node ${node.name} not found`);
          continue;
        }

        if (channels.dashboard) {
          try {
            await storage.createNotification({
              userId: nodeUser.id,
              type: 'system',
              title: notifTitle,
              message: message.trim(),
              link: '/node-dashboard',
            });
            results.dashboard++;
          } catch (e) {
            results.errors.push(`Dashboard notification failed for ${node.name}`);
          }
        }

        if (channels.email && nodeUser.email) {
          try {
            if (process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD) {
              await gmailTransporter.sendMail({
                from: `"GridMart" <${process.env.GMAIL_USER}>`,
                to: nodeUser.email,
                subject: notifTitle,
                text: message.trim(),
                html: `
                  <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                    <h2 style="color: #0d9488; margin-bottom: 20px;">GridMart</h2>
                    <h3 style="margin-bottom: 10px;">${notifTitle}</h3>
                    <p style="white-space: pre-wrap;">${message.trim()}</p>
                    <p style="color:#9ca3af;font-size:12px;margin-top:16px;">This is a message from GridMart Admin.</p>
                  </div>
                `,
              });
              results.email++;
            } else {
              results.errors.push(`Email not configured - skipped for ${node.name}`);
            }
          } catch (e) {
            results.errors.push(`Email failed for ${node.name}`);
          }
        }

        if (channels.sms) {
          const phone = node.notificationPhone || nodeUser.phone;
          if (phone) {
            try {
              await sendSms(phone, `GridMart: ${message.trim()}`);
              results.sms++;
            } catch (e) {
              results.errors.push(`SMS failed for ${node.name}`);
            }
          } else {
            results.errors.push(`No phone number for ${node.name}`);
          }
        }
      }

      res.json({
        success: true,
        sent: results,
        summary: `Sent: ${results.dashboard} dashboard, ${results.email} email, ${results.sms} SMS`,
      });
    } catch (error) {
      console.error("Notify nodes error:", error);
      res.status(500).json({ error: "Failed to send notifications" });
    }
  });

  app.get("/api/notifications", async (req, res) => {
    try {
      if (!req.session?.userId) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      const notifs = await storage.getUserNotifications(req.session.userId);
      res.json(notifs);
    } catch (error) {
      console.error("Get notifications error:", error);
      res.status(500).json({ error: "Failed to fetch notifications" });
    }
  });

  app.patch("/api/notifications/:id/read", async (req, res) => {
    try {
      if (!req.session?.userId) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      await storage.markNotificationRead(req.params.id, req.session.userId);
      res.json({ success: true });
    } catch (error) {
      console.error("Mark notification read error:", error);
      res.status(500).json({ error: "Failed to mark notification as read" });
    }
  });

  app.get("/api/admin/notification-history", async (req, res) => {
    try {
      if (!req.session?.userId) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      const user = await storage.getUser(req.session.userId);
      if (!user || user.type !== 'admin') {
        return res.status(403).json({ error: "Forbidden - admin access required" });
      }

      const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
      const offset = parseInt(req.query.offset as string) || 0;

      const results = await db.select({
        id: notifications.id,
        userId: notifications.userId,
        type: notifications.type,
        title: notifications.title,
        message: notifications.message,
        read: notifications.read,
        link: notifications.link,
        createdAt: notifications.createdAt,
        userName: users.name,
        userEmail: users.email,
        userPhone: users.phone,
      })
        .from(notifications)
        .leftJoin(users, eq(notifications.userId, users.id))
        .where(eq(notifications.type, 'system'))
        .orderBy(desc(notifications.createdAt))
        .limit(limit)
        .offset(offset);

      res.json(results);
    } catch (error) {
      console.error("Notification history error:", error);
      res.status(500).json({ error: "Failed to fetch notification history" });
    }
  });

  // ===== Spreadsheet Sync Routes =====
  
  // Import sync job manager
  const { createJob, getJob, updateJob, cancelJob } = await import('./services/syncJobManager');
  
  // Get sync job progress (polling endpoint)
  app.get("/api/spreadsheet-sync/progress/:jobId", async (req, res) => {
    try {
      const job = getJob(req.params.jobId);
      if (!job) {
        return res.status(404).json({ error: "Job not found" });
      }
      res.json(job);
    } catch (error) {
      console.error("Get sync progress error:", error);
      res.status(500).json({ error: "Failed to get sync progress" });
    }
  });
  
  // Cancel sync job
  app.post("/api/spreadsheet-sync/cancel/:jobId", async (req, res) => {
    try {
      const success = cancelJob(req.params.jobId);
      res.json({ success });
    } catch (error) {
      console.error("Cancel sync error:", error);
      res.status(500).json({ error: "Failed to cancel sync" });
    }
  });
  
  // Get sync settings
  app.get("/api/spreadsheet-sync", async (req, res) => {
    try {
      const syncSettings = await storage.getSpreadsheetSyncSettings();
      // Use environment variable as primary source, fallback to database
      const envSpreadsheetId = process.env.GOOGLE_SPREADSHEET_ID;
      res.json({
        ...syncSettings,
        spreadsheetId: envSpreadsheetId || syncSettings?.spreadsheetId || null,
        useTitleFromSheet: syncSettings?.useTitleFromSheet ?? false,
        lastSyncedRow: syncSettings?.lastSyncedRow ?? null,
        lastSyncAt: syncSettings?.lastSyncAt ?? null,
      });
    } catch (error) {
      console.error("Get sync settings error:", error);
      res.status(500).json({ error: "Failed to get sync settings" });
    }
  });
  
  // Update sync settings
  app.post("/api/spreadsheet-sync/settings", async (req, res) => {
    try {
      if (!req.session?.userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      
      const user = await storage.getUser(req.session.userId);
      if (!user || user.type !== 'admin') {
        return res.status(403).json({ error: "Admin access required" });
      }
      
      const { spreadsheetId, useTitleFromSheet, usePicturesFromSheet } = req.body;
      const settings = await storage.upsertSpreadsheetSyncSettings({
        spreadsheetId,
        useTitleFromSheet,
        usePicturesFromSheet,
      });
      res.json(settings);
    } catch (error) {
      console.error("Update sync settings error:", error);
      res.status(500).json({ error: "Failed to update sync settings" });
    }
  });
  
  // Sync products from spreadsheet with SSE progress
  app.post("/api/spreadsheet-sync/sync", async (req, res) => {
    try {
      if (!req.session?.userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      
      const user = await storage.getUser(req.session.userId);
      if (!user || user.type !== 'admin') {
        return res.status(403).json({ error: "Admin access required" });
      }
      
      const { mode, spreadsheetId, manualRows, stream } = req.body;
      const { getSpreadsheetData, getSpreadsheetMetadata } = await import('./services/googleSheets');
      const { importProductFromUrl } = await import('./services/productImport');
      const { findMatchingProductWithAI } = await import('./services/duplicateDetection');
      
      // Parse manual row selection like "4-8, 19, 22, 132-150"
      const parseRowSelection = (input: string): Set<number> => {
        const selectedRows = new Set<number>();
        const parts = input.split(',').map(p => p.trim()).filter(Boolean);
        
        for (const part of parts) {
          if (part.includes('-')) {
            const [start, end] = part.split('-').map(n => parseInt(n.trim(), 10));
            if (!isNaN(start) && !isNaN(end)) {
              for (let i = Math.min(start, end); i <= Math.max(start, end); i++) {
                selectedRows.add(i);
              }
            }
          } else {
            const num = parseInt(part, 10);
            if (!isNaN(num)) {
              selectedRows.add(num);
            }
          }
        }
        return selectedRows;
      };
      
      // Get sync settings - use env var as primary source
      let syncSettings = await storage.getSpreadsheetSyncSettings();
      const envSpreadsheetId = process.env.GOOGLE_SPREADSHEET_ID;
      const sheetId = spreadsheetId || envSpreadsheetId || syncSettings?.spreadsheetId;
      
      if (!sheetId) {
        return res.status(400).json({ error: "No spreadsheet configured" });
      }
      
      // Get spreadsheet metadata to find actual sheet name
      const metadata = await getSpreadsheetMetadata(sheetId);
      const firstSheetName = metadata.sheets?.[0]?.title || 'Sheet1';
      
      // Get all data from the first sheet
      const rows = await getSpreadsheetData(sheetId, firstSheetName);
      
      if (!rows || rows.length <= 1) {
        return res.json({ imported: 0, message: "No data found in spreadsheet" });
      }
      
      // Skip header row
      const dataRows = rows.slice(1);
      
      // Determine which rows to process based on mode
      let rowsToProcess: { row: any[], rowNumber: number }[] = [];
      let isRedoMode = mode === 'redo';
      
      // Get all existing products with sheet rows from this sheet (for duplicate prevention)
      let existingProductsByRow: Map<number, any> = new Map();
      const allProducts = await storage.getAllProducts();
      for (const product of allProducts) {
        if (product.sheetSource === sheetId && product.sheetRow) {
          existingProductsByRow.set(product.sheetRow, product);
        }
      }
      
      if (mode === 'manual' && manualRows) {
        const selectedRowNumbers = parseRowSelection(manualRows);
        rowsToProcess = dataRows
          .map((row, idx) => ({ row, rowNumber: idx + 2 }))
          .filter(item => selectedRowNumbers.has(item.rowNumber));
      } else if (mode === 'new' && syncSettings?.lastSyncedRow) {
        const startRow = syncSettings.lastSyncedRow;
        rowsToProcess = dataRows
          .slice(startRow)
          .map((row, idx) => ({ row, rowNumber: startRow + idx + 2 }));
      } else if (isRedoMode) {
        // Only process rows that have existing products
        rowsToProcess = dataRows
          .map((row, idx) => ({ row, rowNumber: idx + 2 }))
          .filter(item => existingProductsByRow.has(item.rowNumber));
      } else {
        rowsToProcess = dataRows.map((row, idx) => ({ row, rowNumber: idx + 2 }));
      }
      
      // Filter to only rows with links
      // Debug: log rows without links - Link is now in column H (index 7)
      const rowsWithoutLinks = rowsToProcess.filter(({ row }) => !row[7]);
      if (rowsWithoutLinks.length > 0) {
        console.log(`[SYNC DEBUG] Skipping ${rowsWithoutLinks.length} rows without links in column H:`, 
          rowsWithoutLinks.slice(0, 10).map(({ row, rowNumber }) => ({
            rowNumber,
            name: row[0],
            colH: row[7],
            rowLength: row.length,
          }))
        );
      }
      // Process ALL rows, not just those with links - never fail imports
      const totalToProcess = rowsToProcess.length;
      
      // Create a job for polling-based progress tracking
      const jobId = createJob();
      updateJob(jobId, { status: 'running', total: totalToProcess });
      
      // Return job ID immediately, process in background
      res.json({ jobId, total: totalToProcess });
      
      // Process in background (fire and forget)
      (async () => {
        const results: any[] = [];
        const useTitleFromSheet = syncSettings?.useTitleFromSheet ?? false;
        const usePicturesFromSheet = syncSettings?.usePicturesFromSheet ?? false;
        let processed = 0;
        
        // Get all existing products for AI matching
        let existingProducts = await storage.getAllProducts();
        
        for (const { row, rowNumber: actualRowNumber } of rowsToProcess) {
          // Column layout: A=name, B=?, C=quantity, D=price, E=?, F=?, G=code, H=link, I=sheetImages
          const [name, , quantity, price, , , codeCell, linkCell, sheetImages] = row;
          
          // Parse link text early so it's available in catch block
          const linkText = String(linkCell || '');
          
          // Check if job was cancelled
          const currentJob = getJob(jobId);
          if (currentJob?.cancelled) {
            updateJob(jobId, { status: 'cancelled' });
            break;
          }
          
          // Never fail imports - wrap everything in try/catch with fallback
          let imported: any = { title: '', description: '', images: [], videos: [], price: undefined, brand: null };
          let primaryLink = '';
          let scrapeWarning: string | undefined;
          
          try {
            updateJob(jobId, { 
              current: processed + 1,
              currentRow: actualRowNumber,
              currentName: name || 'Product',
            });
            
            // Only try to scrape if there's a link
            if (linkCell) {
              // Parse multiple links from cell (separated by newlines, commas, or spaces)
              const urlPattern = /https?:\/\/[^\s,\n]+/gi;
              const links = linkText.match(urlPattern) || [];
              
              // Scrape all links and combine results
              let combinedImages: string[] = [];
              let combinedVideos: string[] = [];
              let firstImported: any = null;
              
              for (const link of links) {
                if (!link || !link.startsWith('http')) continue;
                try {
                  const scrapedData = await importProductFromUrl(link.trim());
                  if (!firstImported) {
                    firstImported = scrapedData;
                  }
                  // Add images from this link
                  if (scrapedData.images && scrapedData.images.length > 0) {
                    combinedImages.push(...scrapedData.images);
                  }
                  // Add videos from this link
                  if (scrapedData.videos && scrapedData.videos.length > 0) {
                    combinedVideos.push(...scrapedData.videos);
                  }
                } catch (err: any) {
                  console.log(`[SYNC] Failed to scrape link: ${link}`, err?.message || err);
                  scrapeWarning = `URL scraping failed: ${err?.message || 'Unknown error'}`;
                }
              }
              
              // Deduplicate images and videos
              combinedImages = Array.from(new Set(combinedImages)).slice(0, 10);
              combinedVideos = Array.from(new Set(combinedVideos)).slice(0, 5);
              
              // Use first link as the primary source URL
              primaryLink = links[0] || linkText;
              
              if (firstImported) {
                imported = firstImported;
                imported.images = combinedImages;
                imported.videos = combinedVideos;
              }
            }
            
            const productName = useTitleFromSheet && name ? name : (imported.title || name || 'Unknown Product');
            const sheetPrice = price ? parseFloat(price.toString().replace(/[^0-9.]/g, '')) : null;
            const sellingPrice = imported.price || sheetPrice || 0;
            const costOfGoods = sheetPrice;
            
            // Parse images from sheet column H (comma-separated URLs or product listing URLs to scrape)
            let productImages = imported.images || [];
            if (usePicturesFromSheet && sheetImages) {
              const sheetUrls = String(sheetImages)
                .split(',')
                .map(url => url.trim())
                .filter(url => url && (url.startsWith('http://') || url.startsWith('https://')));
              
              if (sheetUrls.length > 0) {
                // Check if URLs are direct image URLs or product listing URLs
                const isImageUrl = (url: string) => {
                  const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.svg'];
                  const lowerUrl = url.toLowerCase().split('?')[0]; // Remove query params
                  return imageExtensions.some(ext => lowerUrl.endsWith(ext)) || 
                         url.includes('/images/') || 
                         url.includes('media-amazon.com') ||
                         url.includes('ebayimg.com') ||
                         url.includes('walmartimages.com') ||
                         url.includes('alicdn.com');
                };
                
                const directImages: string[] = [];
                const urlsToScrape: string[] = [];
                
                for (const url of sheetUrls) {
                  if (isImageUrl(url)) {
                    directImages.push(url);
                  } else {
                    urlsToScrape.push(url);
                  }
                }
                
                // Scrape product listing URLs to get images
                if (urlsToScrape.length > 0) {
                  try {
                    const { scrapeProductFromUrl } = await import('./services/productImport');
                    for (const url of urlsToScrape) {
                      try {
                        console.log(`[SYNC] Scraping images from column H URL: ${url}`);
                        const scraped = await scrapeProductFromUrl(url);
                        if (scraped.images && scraped.images.length > 0) {
                          directImages.push(...scraped.images);
                        }
                      } catch (scrapeErr: any) {
                        console.log(`[SYNC] Failed to scrape column H URL: ${url}`, scrapeErr?.message);
                      }
                    }
                  } catch (importErr) {
                    console.log('[SYNC] Could not import scraper');
                  }
                }
                
                if (directImages.length > 0) {
                  // Deduplicate
                  productImages = Array.from(new Set(directImages)).slice(0, 10);
                }
              }
            }
            
            const sheetQty = quantity ? parseInt(quantity.toString(), 10) || 0 : 0;
            
            // Helper to merge and deduplicate images
            const mergeImages = (existingImages: string[] | null, newImages: string[]): string[] => {
              const existing = existingImages || [];
              const allImages = [...existing];
              for (const img of newImages) {
                // Normalize URL for comparison (remove trailing slashes, lowercase)
                const normalizedNew = img.toLowerCase().replace(/\/+$/, '');
                const isDuplicate = allImages.some(e => e.toLowerCase().replace(/\/+$/, '') === normalizedNew);
                if (!isDuplicate) {
                  allImages.push(img);
                }
              }
              return allImages.slice(0, 10); // Limit to 10 images
            };
            
            let product: any;
            let productCode: string | undefined;
            
            if (isRedoMode) {
              // Update existing product
              const existingProduct = existingProductsByRow.get(actualRowNumber);
              if (existingProduct) {
                const mergedImages = mergeImages(existingProduct.images, productImages);
                product = await storage.updateProduct(existingProduct.id, {
                  name: productName,
                  description: imported.description || '',
                  price: sellingPrice.toString(),
                  costPrice: costOfGoods ? costOfGoods.toString() : null,
                  image: mergedImages[0] || existingProduct.image,
                  images: mergedImages,
                  sourceUrl: primaryLink,
                  brand: imported.brand || existingProduct.brand,
                });
                productCode = existingProduct.productCode;
                results.push({ row: actualRowNumber, name: productName, productId: existingProduct.id, productCode, status: 'success', updated: true });
              }
            } else {
              // Check if product already exists for this row
              const existingProduct = existingProductsByRow.get(actualRowNumber);
              if (existingProduct) {
                // Row already has a product - update sheet attributes but keep existing code
                // Also update images if we got new ones from scraping or sheet (merge and deduplicate)
                const mergedImages = mergeImages(existingProduct.images, productImages);
                await storage.updateProduct(existingProduct.id, {
                  sheetQuantity: sheetQty,
                  costPrice: costOfGoods ? costOfGoods.toString() : existingProduct.costPrice,
                  image: mergedImages[0] || existingProduct.image,
                  images: mergedImages,
                  brand: imported.brand || existingProduct.brand,
                });
                results.push({ row: actualRowNumber, name: existingProduct.name, productId: existingProduct.id, productCode: existingProduct.productCode, status: 'success', updated: true });
                processed++;
                continue;
              }
              
              // Use code from column G if available, otherwise generate
              const sheetCode = codeCell ? String(codeCell).trim() : '';
              if (sheetCode) {
                const existingWithCode = await storage.getProductByCode(sheetCode);
                if (existingWithCode) {
                  productCode = generateProductCode();
                  while (await storage.getProductByCode(productCode)) {
                    productCode = generateProductCode();
                  }
                  console.log(`[SYNC] Code "${sheetCode}" from column G already exists, generated ${productCode} instead`);
                } else {
                  productCode = sheetCode;
                }
              } else {
                productCode = generateProductCode();
                while (await storage.getProductByCode(productCode)) {
                  productCode = generateProductCode();
                }
              }
              
              product = await storage.createProduct({
                name: productName,
                description: imported.description || '',
                price: sellingPrice.toString(),
                costPrice: costOfGoods ? costOfGoods.toString() : null,
                image: productImages[0] || '',
                images: productImages,
                category: 'General',
                sheetRow: actualRowNumber,
                sheetSource: sheetId,
                sourceUrl: primaryLink,
                purchaseDate: null,
                sheetQuantity: sheetQty,
                productCode,
                brand: imported.brand || null,
              });
              
              // Try to find a matching existing product using AI (no auto-linking, just detection)
              let potentialMatch = null;
              try {
                const match = await findMatchingProductWithAI(
                  { name: productName, description: imported.description, category: 'General' },
                  existingProducts.filter(p => p.id !== product.id) // Exclude the just-created product
                );
                
                if (match) {
                  // Get the matched product's row from existing products
                  const matchedProduct = existingProducts.find(p => p.id === match.productId);
                  const matchedRow = matchedProduct?.sheetRow || null;
                  
                  // Don't auto-link - instead report as potential duplicate for manual review
                  potentialMatch = {
                    newProductId: product.id,
                    newProduct: productName,
                    newProductCode: productCode,
                    newProductRow: actualRowNumber,
                    matchedProductId: match.productId,
                    matchedProductName: match.name,
                    matchedProductCode: match.productCode,
                    matchedProductRow: matchedRow,
                    reason: match.reason
                  };
                  
                  // Potential duplicates will be included in the final results
                }
              } catch (matchErr) {
                console.error('AI matching error for row', actualRowNumber, matchErr);
              }
              
              // Add the new product to existing products for future matching
              existingProducts = [...existingProducts, product];
              
              results.push({ row: actualRowNumber, name: productName, productId: product.id, productCode, status: 'success', potentialMatch, warning: scrapeWarning });
            }
          } catch (err: any) {
            // Never fail imports - create product with fallback data from spreadsheet only
            console.error(`[SYNC] Error for row ${actualRowNumber}, creating with fallback data:`, err?.message || err);
            try {
              const fallbackName = name || `Product Row ${actualRowNumber}`;
              const sheetQty = quantity ? parseInt(quantity.toString(), 10) || 0 : 0;
              const sheetPrice = price ? parseFloat(price.toString().replace(/[^0-9.]/g, '')) : 0;
              
              // Check if product already exists for this row
              const existingProduct = existingProductsByRow.get(actualRowNumber);
              if (existingProduct) {
                // Update existing product with sheet data
                await storage.updateProduct(existingProduct.id, {
                  sheetQuantity: sheetQty,
                  costPrice: sheetPrice ? sheetPrice.toString() : existingProduct.costPrice,
                });
                results.push({ row: actualRowNumber, name: existingProduct.name, productId: existingProduct.id, productCode: existingProduct.productCode, status: 'success', updated: true, warning: `Created from sheet only: ${err?.message}` });
              } else {
                // Use code from column G if available, otherwise generate
                const fallbackSheetCode = codeCell ? String(codeCell).trim() : '';
                let fallbackCode: string;
                if (fallbackSheetCode) {
                  const existingWithCode = await storage.getProductByCode(fallbackSheetCode);
                  if (existingWithCode) {
                    fallbackCode = generateProductCode();
                    while (await storage.getProductByCode(fallbackCode)) {
                      fallbackCode = generateProductCode();
                    }
                  } else {
                    fallbackCode = fallbackSheetCode;
                  }
                } else {
                  fallbackCode = generateProductCode();
                  while (await storage.getProductByCode(fallbackCode)) {
                    fallbackCode = generateProductCode();
                  }
                }
                
                // Parse images from sheet column H if available (scrape if product listing URL)
                let fallbackImages: string[] = [];
                if (sheetImages) {
                  const sheetUrls = String(sheetImages)
                    .split(',')
                    .map(url => url.trim())
                    .filter(url => url && (url.startsWith('http://') || url.startsWith('https://')));
                  
                  const isImageUrl = (url: string) => {
                    const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.svg'];
                    const lowerUrl = url.toLowerCase().split('?')[0];
                    return imageExtensions.some(ext => lowerUrl.endsWith(ext)) || 
                           url.includes('/images/') || 
                           url.includes('media-amazon.com') ||
                           url.includes('ebayimg.com') ||
                           url.includes('walmartimages.com') ||
                           url.includes('alicdn.com');
                  };
                  
                  for (const url of sheetUrls) {
                    if (isImageUrl(url)) {
                      fallbackImages.push(url);
                    } else {
                      // Try to scrape product listing URL
                      try {
                        const { scrapeProductFromUrl } = await import('./services/productImport');
                        console.log(`[SYNC Fallback] Scraping images from: ${url}`);
                        const scraped = await scrapeProductFromUrl(url);
                        if (scraped.images && scraped.images.length > 0) {
                          fallbackImages.push(...scraped.images);
                        }
                      } catch (scrapeErr: any) {
                        console.log(`[SYNC Fallback] Failed to scrape: ${url}`, scrapeErr?.message);
                      }
                    }
                  }
                  fallbackImages = Array.from(new Set(fallbackImages)).slice(0, 10);
                }
                
                const fallbackProduct = await storage.createProduct({
                  name: fallbackName,
                  description: '',
                  price: sheetPrice.toString(),
                  costPrice: sheetPrice ? sheetPrice.toString() : null,
                  image: fallbackImages[0] || '',
                  images: fallbackImages,
                  category: 'General',
                  sheetRow: actualRowNumber,
                  sheetSource: sheetId,
                  sourceUrl: linkText || null,
                  purchaseDate: null,
                  sheetQuantity: sheetQty,
                  productCode: fallbackCode,
                  brand: null,
                });
                
                existingProducts = [...existingProducts, fallbackProduct];
                results.push({ row: actualRowNumber, name: fallbackName, productId: fallbackProduct.id, productCode: fallbackCode, status: 'success', warning: `Created from sheet only: ${err?.message}` });
              }
            } catch (fallbackErr: any) {
              // Only fail if we truly can't create anything
              console.error(`[SYNC] Fallback also failed for row ${actualRowNumber}:`, fallbackErr?.message || fallbackErr);
              results.push({ row: actualRowNumber, name: name || linkText || `Row ${actualRowNumber}`, status: 'error', error: fallbackErr.message });
              const currentErrors = results.filter(r => r.status === 'error').map(r => `Row ${r.row}: ${r.name} - ${r.error}`);
              updateJob(jobId, { errors: currentErrors });
            }
          }
          
          processed++;
          updateJob(jobId, { imported: results.filter(r => r.status === 'success').length });
        }
        
        // Update sync settings with log
        const totalRows = dataRows.length;
        const syncLog = JSON.stringify(results.map(r => ({
          row: r.row,
          name: r.name,
          status: r.status,
          error: r.error || null,
          productCode: r.productCode || null,
          updated: r.updated || false,
        })));
        await storage.updateSpreadsheetSyncStatus(sheetId, totalRows, metadata.title || null, syncLog);
        
        // Mark job as complete
        updateJob(jobId, { 
          status: 'complete',
          imported: results.filter(r => r.status === 'success').length,
          lastSyncLog: syncLog,
          completedAt: Date.now(),
        });
      })().catch(err => {
        console.error('Background sync error:', err);
        updateJob(jobId, { status: 'error', errors: [err.message] });
      });
    } catch (error: any) {
      console.error("Spreadsheet sync error:", error);
      res.status(500).json({ error: error.message || "Failed to sync from spreadsheet" });
    }
  });
  
  // ===== Bulk Sheet Sync Route =====
  app.post("/api/sheet-sync/bulk", async (req, res) => {
    try {
      if (!req.session?.userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      
      const { columnKey, productIds } = req.body;
      
      if (!columnKey || !['quantity', 'costPrice', 'price', 'name', 'images', 'description', 'code'].includes(columnKey)) {
        return res.status(400).json({ error: "Invalid columnKey. Must be 'quantity', 'costPrice', 'price', 'name', 'images', 'description', or 'code'" });
      }
      
      if (!productIds || !Array.isArray(productIds) || productIds.length === 0) {
        return res.status(400).json({ error: "productIds array is required" });
      }
      
      // Get products with their sheet info
      const products = await Promise.all(
        productIds.map(id => storage.getProduct(id))
      );
      
      const validProducts = products.filter(p => p && p.sheetRow && p.sheetSource);
      
      if (validProducts.length === 0) {
        return res.status(400).json({ error: "No products have sheet references" });
      }
      
      // Group products by sheet source
      const productsBySheet: Record<string, typeof validProducts> = {};
      for (const product of validProducts) {
        if (!product) continue;
        const sheetId = product.sheetSource!;
        if (!productsBySheet[sheetId]) {
          productsBySheet[sheetId] = [];
        }
        productsBySheet[sheetId].push(product);
      }
      
      const results: { productId: string; status: 'success' | 'error'; error?: string }[] = [];
      
      // Process each sheet
      for (const [sheetId, sheetProducts] of Object.entries(productsBySheet)) {
        try {
          // Get all rows from the sheet - use correct sheet name from metadata
          const { getSpreadsheetData, getSpreadsheetMetadata } = await import('./services/googleSheets');
          const metadata = await getSpreadsheetMetadata(sheetId);
          const sheetName = metadata.sheets?.[0]?.title || 'Sheet1';
          const rows = await getSpreadsheetData(sheetId, sheetName);
          
          // Update each product
          for (const product of sheetProducts) {
            if (!product) continue;
            try {
              // sheetRow is 1-based (row 1 = header, row 2 = first data row)
              // rows array is 0-based (rows[0] = header, rows[1] = first data)
              // So sheetRow 2 corresponds to rows[1]
              const rowIndex = (product.sheetRow || 1) - 1; // Convert to 0-based index
              const row = rows[rowIndex];
              
              if (!row) {
                results.push({ productId: product.id, status: 'error', error: `Row ${product.sheetRow} not found` });
                continue;
              }
              
              // Column mapping: A=0 (name), B=1, C=2 (quantity), D=3 (price/cost)
              if (columnKey === 'quantity') {
                const quantity = row[2] ? parseInt(row[2].toString(), 10) || 0 : 0;
                await storage.updateProduct(product.id, { sheetQuantity: quantity });
              } else if (columnKey === 'costPrice') {
                const priceStr = row[3] ? row[3].toString().replace(/[^0-9.]/g, '') : '0';
                const price = parseFloat(priceStr) || 0;
                await storage.updateProduct(product.id, { costPrice: price.toString() });
              } else if (columnKey === 'price') {
                const priceStr = row[3] ? row[3].toString().replace(/[^0-9.]/g, '') : '0';
                const price = parseFloat(priceStr) || 0;
                await storage.updateProduct(product.id, { price: price.toString() });
              } else if (columnKey === 'name') {
                const name = row[0] ? row[0].toString().trim() : '';
                if (name) {
                  await storage.updateProduct(product.id, { name });
                }
              } else if (columnKey === 'images') {
                // Images are in column H (index 7) - this is a product listing URL to scrape
                let productUrl = row[7] ? row[7].toString().trim() : '';
                // Fallback to product's stored sourceUrl if column H is empty
                if ((!productUrl || !productUrl.startsWith('http')) && product.sourceUrl) {
                  productUrl = product.sourceUrl;
                  console.log(`[Sheet Sync] Using stored sourceUrl for product ${product.id}: ${productUrl}`);
                }
                if (productUrl && productUrl.startsWith('http')) {
                  try {
                    // Scrape the product page to extract images
                    const { scrapeProductFromUrl } = await import('./services/productImport');
                    console.log(`[Sheet Sync] Scraping images from: ${productUrl}`);
                    const scraped = await scrapeProductFromUrl(productUrl);
                    
                    if (scraped.images && scraped.images.length > 0) {
                      // Replace existing images with scraped ones
                      await storage.updateProduct(product.id, { 
                        images: scraped.images,
                        image: scraped.images[0] // Update main image
                      });
                      console.log(`[Sheet Sync] Updated product ${product.id} with ${scraped.images.length} images`);
                    } else {
                      results.push({ productId: product.id, status: 'error', error: 'No images found on scraped page' });
                      continue;
                    }
                  } catch (scrapeError: any) {
                    console.error(`[Sheet Sync] Failed to scrape ${productUrl}:`, scrapeError.message);
                    results.push({ productId: product.id, status: 'error', error: `Scrape failed: ${scrapeError.message}` });
                    continue;
                  }
                } else {
                  results.push({ productId: product.id, status: 'error', error: 'No valid URL in column H or stored sourceUrl' });
                  continue;
                }
              } else if (columnKey === 'description') {
                // Description scraped from URL in column H (index 7), or fallback to product's sourceUrl
                let productUrl = row[7] ? row[7].toString().trim() : '';
                // Fallback to product's stored sourceUrl if column H is empty
                if ((!productUrl || !productUrl.startsWith('http')) && product.sourceUrl) {
                  productUrl = product.sourceUrl;
                  console.log(`[Sheet Sync] Using stored sourceUrl for product ${product.id}: ${productUrl}`);
                }
                if (productUrl && productUrl.startsWith('http')) {
                  try {
                    // Scrape the product page to extract description
                    const { scrapeProductFromUrl } = await import('./services/productImport');
                    console.log(`[Sheet Sync] Scraping description from: ${productUrl}`);
                    const scraped = await scrapeProductFromUrl(productUrl);
                    
                    if (scraped.description && scraped.description.trim()) {
                      await storage.updateProduct(product.id, { 
                        description: scraped.description
                      });
                      console.log(`[Sheet Sync] Updated product ${product.id} with scraped description`);
                    } else {
                      results.push({ productId: product.id, status: 'error', error: 'No description found on scraped page' });
                      continue;
                    }
                  } catch (scrapeError: any) {
                    console.error(`[Sheet Sync] Failed to scrape ${productUrl}:`, scrapeError.message);
                    results.push({ productId: product.id, status: 'error', error: `Scrape failed: ${scrapeError.message}` });
                    continue;
                  }
                } else {
                  results.push({ productId: product.id, status: 'error', error: 'No valid URL in column H or stored sourceUrl' });
                  continue;
                }
              } else if (columnKey === 'code') {
                // Product code is in column G (index 6)
                const code = row[6] ? row[6].toString().trim().toUpperCase() : '';
                if (code) {
                  await storage.updateProduct(product.id, { productCode: code });
                  console.log(`[Sheet Sync] Updated product ${product.id} with code: ${code}`);
                } else {
                  results.push({ productId: product.id, status: 'error', error: 'No code found in column G' });
                  continue;
                }
              }
              
              results.push({ productId: product.id, status: 'success' });
            } catch (err: any) {
              results.push({ productId: product.id, status: 'error', error: err.message });
            }
          }
        } catch (err: any) {
          // If sheet fetch fails, mark all products from this sheet as failed
          for (const product of sheetProducts) {
            if (product) {
              results.push({ productId: product.id, status: 'error', error: `Sheet error: ${err.message}` });
            }
          }
        }
      }
      
      res.json({
        successCount: results.filter(r => r.status === 'success').length,
        failureCount: results.filter(r => r.status === 'error').length,
        results
      });
    } catch (error: any) {
      console.error("Bulk sheet sync error:", error);
      res.status(500).json({ error: error.message || "Failed to sync from sheet" });
    }
  });
  
  // Transfer product codes to spreadsheet
  app.post("/api/spreadsheet-sync/export-codes", async (req, res) => {
    try {
      if (!req.session?.userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      
      const { columnName, productIds } = req.body;
      const targetColumn = columnName || 'code-G';
      
      // Get sync settings to find the spreadsheet - use env var as primary source
      const syncSettings = await storage.getSpreadsheetSyncSettings();
      const envSpreadsheetId = process.env.GOOGLE_SPREADSHEET_ID;
      const sheetId = envSpreadsheetId || syncSettings?.spreadsheetId;
      
      if (!sheetId) {
        return res.status(400).json({ error: "No spreadsheet configured" });
      }
      
      // Get products with sheet references (optionally filtered by productIds)
      const allProducts = await storage.getAllProducts();
      let productsToProcess = allProducts;
      
      // Filter to specific product IDs if provided
      if (productIds && Array.isArray(productIds) && productIds.length > 0) {
        const idSet = new Set(productIds);
        productsToProcess = allProducts.filter(p => idSet.has(p.id));
      }
      
      const productsWithSheet = productsToProcess.filter(p => 
        p.sheetSource === sheetId && p.sheetRow && p.productCode
      );
      
      if (productsWithSheet.length === 0) {
        return res.json({ updated: 0, message: "No products with sheet references found" });
      }
      
      // Get spreadsheet data to find the target column and check existing values
      const { getSpreadsheetData, getSpreadsheetMetadata, batchUpdateSpreadsheetCells } = await import('./services/googleSheets');
      const metadata = await getSpreadsheetMetadata(sheetId);
      const sheetName = metadata.sheets?.[0]?.title || 'Sheet1';
      const rows = await getSpreadsheetData(sheetId, sheetName);
      
      if (rows.length === 0) {
        return res.status(400).json({ error: "Spreadsheet is empty" });
      }
      
      // Find the target column index from header row
      const headerRow = rows[0];
      let targetColIndex = headerRow.findIndex((h: string) => 
        h && h.toString().toLowerCase().trim() === targetColumn.toLowerCase().trim()
      );
      
      if (targetColIndex === -1) {
        return res.status(400).json({ 
          error: `Column "${targetColumn}" not found in spreadsheet. Available columns: ${headerRow.join(', ')}` 
        });
      }
      
      // Convert column index to letter (0=A, 1=B, etc.)
      const colLetter = String.fromCharCode(65 + targetColIndex);
      
      // Build updates for products, skipping rows that already have values
      const updates: { range: string; value: string }[] = [];
      let skippedCount = 0;
      
      for (const product of productsWithSheet) {
        const rowIndex = product.sheetRow! - 1; // Convert to 0-based
        const row = rows[rowIndex];
        
        if (!row) continue;
        
        // Check if cell already has a value
        const existingValue = row[targetColIndex];
        if (existingValue && existingValue.toString().trim() !== '') {
          skippedCount++;
          continue;
        }
        
        // Add to updates
        updates.push({
          range: `${sheetName}!${colLetter}${product.sheetRow}`,
          value: product.productCode!,
        });
      }
      
      if (updates.length === 0) {
        return res.json({ 
          updated: 0, 
          skipped: skippedCount,
          message: skippedCount > 0 
            ? `All ${skippedCount} rows already have values in the "${targetColumn}" column` 
            : "No products to update" 
        });
      }
      
      // Batch update the spreadsheet
      await batchUpdateSpreadsheetCells(sheetId, updates);
      
      res.json({ 
        updated: updates.length, 
        skipped: skippedCount,
        message: `Updated ${updates.length} product codes to "${targetColumn}" column${skippedCount > 0 ? `, skipped ${skippedCount} rows with existing values` : ''}` 
      });
    } catch (error: any) {
      console.error("Export codes error:", error);
      res.status(500).json({ error: error.message || "Failed to export codes to spreadsheet" });
    }
  });
  
  // ===== AI Tag Generation Routes =====
  
  // Generate marketplace tags for products
  app.post("/api/products/generate-tags", async (req, res) => {
    try {
      const userId = req.session?.userId;
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      
      const user = await storage.getUser(userId);
      if (!user || user.type !== 'admin') {
        return res.status(403).json({ error: "Admin access required" });
      }
      
      const { products, tagCount = 10 } = req.body;
      if (!products || !Array.isArray(products) || products.length === 0) {
        return res.status(400).json({ error: "Products array is required" });
      }
      const requestedTagCount = Math.min(Math.max(parseInt(tagCount) || 10, 3), 25);
      
      const OpenAI = (await import('openai')).default;
      const openai = new OpenAI({
        apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
        baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
      });
      
      const tagResults: Record<string, string[]> = {};
      
      for (const product of products) {
        try {
          const response = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
              {
                role: "system",
                content: `You are a Facebook Marketplace listing expert. Generate broad, relevant tags for products to maximize visibility. Include:
- Direct product category tags
- Related broader category tags (e.g., for a mouse: electronics, computer accessories, tech, office supplies)
- Common search terms buyers might use
- General condition/type tags if applicable
- Synonyms and alternative names for the product

Return ONLY a JSON array of exactly ${requestedTagCount} lowercase tags, no explanation. Example: ["computer mouse","electronics","tech","computer accessories","office supplies","gaming","wireless","peripherals","desktop accessories","input devices"]`
              },
              {
                role: "user",
                content: `Generate marketplace tags for: ${product.name}${product.category ? ` (Category: ${product.category})` : ''}${product.description ? ` - ${product.description.substring(0, 100)}` : ''}`
              }
            ],
            max_completion_tokens: 500,
          });
          
          const content = response.choices[0]?.message?.content || '[]';
          console.log(`[Tags] Product ${product.id}: requested ${requestedTagCount}, got response:`, content);
          try {
            const tags = JSON.parse(content);
            console.log(`[Tags] Parsed ${tags.length} tags for ${product.id}`);
            tagResults[product.id] = Array.isArray(tags) ? tags : [];
          } catch {
            console.log(`[Tags] Failed to parse tags for ${product.id}`);
            tagResults[product.id] = [];
          }
        } catch (err) {
          console.error(`Error generating tags for product ${product.id}:`, err);
          tagResults[product.id] = [];
        }
      }
      
      res.json({ tags: tagResults });
    } catch (error: any) {
      console.error("Generate tags error:", error);
      res.status(500).json({ error: error.message || "Failed to generate tags" });
    }
  });
  
  // ===== AI Image Editing Routes =====
  
  // Proxy external images to avoid CORS issues
  app.get("/api/images/proxy", async (req, res) => {
    try {
      const { url } = req.query;
      if (!url || typeof url !== 'string') {
        return res.status(400).json({ error: "URL is required" });
      }
      
      // Security: Validate URL to prevent SSRF attacks
      let parsedUrl: URL;
      try {
        parsedUrl = new URL(url);
      } catch {
        return res.status(400).json({ error: "Invalid URL" });
      }
      
      // Only allow http/https protocols
      if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
        return res.status(400).json({ error: "Only HTTP/HTTPS URLs are allowed" });
      }
      
      // Block private/internal IP ranges and localhost
      const hostname = parsedUrl.hostname.toLowerCase();
      const blockedPatterns = [
        /^localhost$/,
        /^127\./,
        /^10\./,
        /^172\.(1[6-9]|2[0-9]|3[01])\./,
        /^192\.168\./,
        /^0\.0\.0\.0$/,
        /^::1$/,
        /^169\.254\./,
        /\.local$/,
      ];
      if (blockedPatterns.some(pattern => pattern.test(hostname))) {
        return res.status(400).json({ error: "Internal URLs are not allowed" });
      }
      
      // Fetch the image
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });
      
      if (!response.ok) {
        return res.status(response.status).json({ error: "Failed to fetch image" });
      }
      
      const contentType = response.headers.get('content-type') || 'image/jpeg';
      const buffer = Buffer.from(await response.arrayBuffer());
      
      res.setHeader('Content-Type', contentType);
      res.setHeader('Cache-Control', 'public, max-age=86400');
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.send(buffer);
    } catch (error: any) {
      console.error("Image proxy error:", error);
      res.status(500).json({ error: "Failed to proxy image" });
    }
  });
  
  // Remove background from image using @imgly/background-removal-node (true transparency)
  app.post("/api/images/remove-background", async (req, res) => {
    try {
      if (!req.session?.userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      
      let { imageUrl } = req.body;
      if (!imageUrl) {
        return res.status(400).json({ error: "Image URL is required" });
      }
      
      // Convert relative URLs to absolute URLs for the library
      if (imageUrl.startsWith('/')) {
        const protocol = req.protocol || 'https';
        const host = req.get('host') || 'localhost:5000';
        imageUrl = `${protocol}://${host}${imageUrl}`;
      }
      
      const { removeBackground } = await import('@imgly/background-removal-node');
      
      console.log("Starting background removal for:", imageUrl.substring(0, 100));
      
      // Handle data URLs from previous edits
      let inputSource: string | Blob = imageUrl;
      if (imageUrl.startsWith('data:')) {
        const base64Data = imageUrl.split(',')[1];
        const buffer = Buffer.from(base64Data, 'base64');
        inputSource = new Blob([buffer], { type: 'image/png' });
      }
      
      console.log("Running background removal AI...");
      const resultBlob = await removeBackground(inputSource, {
        model: 'medium',
        output: { format: 'image/png' }
      });
      
      // Convert result blob to base64
      const resultArrayBuffer = await resultBlob.arrayBuffer();
      const base64 = Buffer.from(resultArrayBuffer).toString('base64');
      
      console.log("Background removal completed successfully with transparency");
      
      res.json({ 
        imageUrl: `data:image/png;base64,${base64}`,
        message: "Background removed successfully with transparency"
      });
    } catch (error: any) {
      console.error("Remove background error:", error);
      res.status(500).json({ error: error.message || "Failed to remove background" });
    }
  });
  
  // Edit image with AI prompt
  app.post("/api/images/edit", async (req, res) => {
    try {
      if (!req.session?.userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      
      let { imageUrl, prompt } = req.body;
      if (!imageUrl || !prompt) {
        return res.status(400).json({ error: "Image URL and prompt are required" });
      }
      
      // Convert relative URLs to absolute URLs
      if (imageUrl.startsWith('/')) {
        const protocol = req.protocol || 'https';
        const host = req.get('host') || 'localhost:5000';
        imageUrl = `${protocol}://${host}${imageUrl}`;
      }
      
      const fs = await import('fs');
      const path = await import('path');
      const os = await import('os');
      const sharp = (await import('sharp')).default;
      const OpenAI = (await import('openai')).default;
      
      const openai = new OpenAI({
        apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
        baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
      });
      
      // Fetch the image (handle data URLs from previous edits)
      let imageBuffer: Buffer;
      if (imageUrl.startsWith('data:')) {
        const base64Data = imageUrl.split(',')[1];
        imageBuffer = Buffer.from(base64Data, 'base64');
      } else {
        const imageResponse = await fetch(imageUrl);
        imageBuffer = Buffer.from(await imageResponse.arrayBuffer());
      }
      
      // Convert to PNG using Sharp to ensure proper format
      const pngBuffer = await sharp(imageBuffer).png().toBuffer();
      
      // Save to temp file
      const tempDir = os.tmpdir();
      const tempFile = path.join(tempDir, `image_${Date.now()}.png`);
      fs.writeFileSync(tempFile, pngBuffer);
      
      try {
        // Create a File object with proper mime type
        const imageBlob = new Blob([pngBuffer], { type: 'image/png' });
        const imageFile = new File([imageBlob], 'image.png', { type: 'image/png' });
        
        const response = await openai.images.edit({
          model: "gpt-image-1",
          image: imageFile as any,
          prompt: `${prompt}. Keep this as a professional product photo suitable for e-commerce.`,
        });
        
        if (!response.data || !response.data[0]?.b64_json) {
          throw new Error("No image data returned");
        }
        const imageBase64 = response.data[0].b64_json;
        
        res.json({ 
          imageUrl: `data:image/png;base64,${imageBase64}`,
          message: "Image edited successfully"
        });
      } finally {
        // Clean up temp file
        try { fs.unlinkSync(tempFile); } catch {}
      }
    } catch (error: any) {
      console.error("Edit image error:", error);
      res.status(500).json({ error: error.message || "Failed to edit image" });
    }
  });
  
  // Inpaint image (remove selected objects)
  app.post("/api/images/inpaint", async (req, res) => {
    try {
      if (!req.session?.userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      
      let { imageUrl, maskDataUrl, prompt } = req.body;
      if (!imageUrl || !maskDataUrl) {
        return res.status(400).json({ error: "Image URL and mask are required" });
      }
      
      // Convert relative URLs to absolute URLs
      if (imageUrl.startsWith('/')) {
        const protocol = req.protocol || 'https';
        const host = req.get('host') || 'localhost:5000';
        imageUrl = `${protocol}://${host}${imageUrl}`;
      }
      
      const sharp = (await import('sharp')).default;
      const OpenAI = (await import('openai')).default;
      
      const openai = new OpenAI({
        apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
        baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
      });
      
      // Fetch the original image
      let imageBuffer: Buffer;
      if (imageUrl.startsWith('data:')) {
        const base64Data = imageUrl.split(',')[1];
        imageBuffer = Buffer.from(base64Data, 'base64');
      } else {
        const imageResponse = await fetch(imageUrl);
        imageBuffer = Buffer.from(await imageResponse.arrayBuffer());
      }
      
      // Get mask from data URL
      const maskBase64Data = maskDataUrl.split(',')[1];
      const maskBuffer = Buffer.from(maskBase64Data, 'base64');
      
      // Get image dimensions
      const imageMetadata = await sharp(imageBuffer).metadata();
      const targetWidth = imageMetadata.width || 512;
      const targetHeight = imageMetadata.height || 512;
      
      // Resize mask to match image dimensions and convert to proper format
      // OpenAI expects the mask with transparent areas where edits should happen
      const resizedMask = await sharp(maskBuffer)
        .resize(targetWidth, targetHeight)
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
      
      // Create a new mask where white areas become transparent (area to edit)
      // and black areas remain opaque (area to keep)
      const { data, info } = resizedMask;
      const pixels = new Uint8Array(info.width * info.height * 4);
      
      for (let i = 0; i < data.length; i += 4) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        
        // If pixel is white-ish (selected area), make it transparent
        const isWhite = r > 128 && g > 128 && b > 128;
        
        pixels[i] = 0;     // R
        pixels[i + 1] = 0; // G
        pixels[i + 2] = 0; // B
        pixels[i + 3] = isWhite ? 0 : 255; // A: transparent where we want to edit
      }
      
      const finalMaskBuffer = await sharp(Buffer.from(pixels), {
        raw: { width: info.width, height: info.height, channels: 4 }
      }).png().toBuffer();
      
      // Convert original image to PNG with proper size
      const pngBuffer = await sharp(imageBuffer)
        .resize(targetWidth, targetHeight, { fit: 'fill' })
        .png()
        .toBuffer();
      
      try {
        // Create File objects
        const imageBlob = new Blob([pngBuffer], { type: 'image/png' });
        const imageFile = new File([imageBlob], 'image.png', { type: 'image/png' });
        
        const maskBlob = new Blob([finalMaskBuffer], { type: 'image/png' });
        const maskFile = new File([maskBlob], 'mask.png', { type: 'image/png' });
        
        const response = await openai.images.edit({
          model: "gpt-image-1",
          image: imageFile as any,
          mask: maskFile as any,
          prompt: prompt || "Remove the object and fill with the surrounding background seamlessly. Make the result look natural as a product photo.",
        });
        
        if (!response.data || !response.data[0]?.b64_json) {
          throw new Error("No image data returned");
        }
        const imageBase64 = response.data[0].b64_json;
        
        res.json({ 
          imageUrl: `data:image/png;base64,${imageBase64}`,
          message: "Object removed successfully"
        });
      } catch (apiError: any) {
        console.error("OpenAI inpaint API error:", apiError);
        throw new Error(apiError.message || "Failed to process image with AI");
      }
    } catch (error: any) {
      console.error("Inpaint image error:", error);
      res.status(500).json({ error: error.message || "Failed to remove selection" });
    }
  });
  
  // ===== AI Reword Route =====
  app.post("/api/reword", async (req, res) => {
    try {
      if (!req.session?.userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      
      const { text, prompt } = req.body;
      if (!text || typeof text !== 'string') {
        return res.status(400).json({ error: "Text is required" });
      }
      
      const OpenAI = (await import('openai')).default;
      const openai = new OpenAI({
        apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
        baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
      });
      
      const systemPrompt = prompt 
        ? `You are a product description writer. Rewrite the following product description with this style: ${prompt}. Keep it concise, engaging, and suitable for an e-commerce listing. IMPORTANT: When using bullet points, always use the • character (Unicode bullet), never use hyphens (-) or asterisks (*). Example format: "• Feature one\n• Feature two"`
        : `You are a product description writer. Rewrite the following product description to be unique, engaging, and professional. Keep it concise and suitable for an e-commerce listing. IMPORTANT: When using bullet points, always use the • character (Unicode bullet), never use hyphens (-) or asterisks (*). Example format: "• Feature one\n• Feature two"`;
      
      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: text }
        ],
        max_tokens: 500,
      });
      
      const reworded = completion.choices[0]?.message?.content || text;
      res.json({ reworded });
    } catch (error) {
      console.error("Reword error:", error);
      res.status(500).json({ error: "Failed to reword text" });
    }
  });
  
  // Helper: adjust crate assignment quantity overrides when an order is placed or cancelled
  // delta is negative for purchases (decrement), positive for cancellations (restore)
  async function adjustCrateAssignmentQuantities(nodeId: string, productId: string, delta: number) {
    const assignments = await storage.getNodeCrateAssignments(nodeId);
    const activeAssignments = assignments.filter(a => a.status === 'active');
    
    let remaining = Math.abs(delta);
    const isDecrement = delta < 0;
    
    for (const assignment of activeAssignments) {
      if (remaining <= 0) break;
      
      const items = await storage.getCrateItems(assignment.crateId);
      const item = items.find(i => i.productId === productId);
      if (!item) continue;
      
      const overrides = (assignment.quantityOverrides as Record<string, { quantity: number; originalQuantity: number }>) || {};
      const currentQty = overrides[productId]?.quantity ?? item.quantity;
      const originalQty = overrides[productId]?.originalQuantity ?? item.quantity;
      
      if (isDecrement) {
        const canTake = Math.min(remaining, currentQty);
        if (canTake > 0) {
          overrides[productId] = { quantity: currentQty - canTake, originalQuantity: originalQty };
          remaining -= canTake;
        }
      } else {
        const canRestore = Math.min(remaining, originalQty - currentQty);
        if (canRestore > 0) {
          overrides[productId] = { quantity: currentQty + canRestore, originalQuantity: originalQty };
          remaining -= canRestore;
        }
      }
      
      await storage.updateCrateAssignmentQuantityOverrides(assignment.id, overrides);
    }
  }

  // Helper: sync inventory table from crate assignments for a given node
  async function syncCrateInventoryToNode(nodeId: string) {
    const assignments = await storage.getNodeCrateAssignments(nodeId);
    const activeAssignments = assignments.filter(a => a.status === 'active');
    const allProducts = await storage.getAllProducts();
    const activeProductIds = new Set(allProducts.map(p => p.id));

    const productQuantities = new Map<string, number>();
    for (const assignment of activeAssignments) {
      const items = await storage.getCrateItems(assignment.crateId);
      const overrides = (assignment.quantityOverrides as Record<string, { quantity: number }>) || {};
      for (const item of items) {
        if (!activeProductIds.has(item.productId)) continue;
        const qty = Math.max(0, overrides[item.productId]?.quantity ?? item.quantity);
        productQuantities.set(item.productId, (productQuantities.get(item.productId) || 0) + qty);
      }
    }

    for (const [productId, quantity] of productQuantities) {
      await storage.upsertInventory({ productId, nodeId, quantity });
    }

    const nodeInventory = await storage.getInventoryByNode(nodeId);
    for (const inv of nodeInventory) {
      if (!productQuantities.has(inv.productId)) {
        await storage.upsertInventory({ productId: inv.productId, nodeId, quantity: 0 });
      }
    }

    const allUpdatedProductIds = new Set([
      ...productQuantities.keys(),
      ...nodeInventory.filter(inv => !productQuantities.has(inv.productId)).map(inv => inv.productId)
    ]);
    for (const productId of allUpdatedProductIds) {
      const allInv = await storage.getInventoryByProduct(productId);
      const seen = new Set<string>();
      let totalQty = 0;
      for (const inv of allInv) {
        const key = `${inv.productId}-${inv.nodeId}`;
        if (!seen.has(key)) {
          seen.add(key);
          totalQty += parseInt(inv.quantity.toString());
        }
      }
      await storage.updateProduct(productId, { sheetQuantity: totalQty });
    }

    pushLocalInventoryToGoogle(nodeId, productQuantities).catch(err => {
      console.error('[Google Merchant] Auto-sync local inventory failed:', err.message);
    });
  }

  async function pushLocalInventoryToGoogle(nodeId: string, productQuantities: Map<string, number>) {
    try {
      const storeCode = await storage.getAdminSetting('google_store_code');
      if (!storeCode) return;

      await googleMerchantService.initialize();
      if (!googleMerchantService.isConfigured()) return;

      for (const [productId] of productQuantities) {
        const product = await storage.getProduct(productId);
        if (!product?.productCode) continue;

        const allInv = await storage.getInventoryByProduct(productId);
        const seen = new Set<string>();
        let totalQty = 0;
        for (const inv of allInv) {
          const key = `${inv.productId}-${inv.nodeId}`;
          if (!seen.has(key)) {
            seen.add(key);
            totalQty += parseInt(inv.quantity.toString());
          }
        }

        await googleMerchantService.insertLocalInventory(
          product.productCode,
          storeCode,
          totalQty,
        );
      }
    } catch (error: any) {
      console.error('[Google Merchant] pushLocalInventoryToGoogle error:', error.message);
    }
  }

  // ===== Crate Routes =====
  app.get("/api/crates", async (req, res) => {
    try {
      const allCrates = await storage.getAllCrates();
      const products = await storage.getAllProducts();
      const productMap = new Map(products.map(p => [p.id, p]));
      const cratesWithItems = await Promise.all(
        allCrates.map(async (crate) => {
          const items = await storage.getCrateItems(crate.id);
          const liveItems = items.filter(item => productMap.has(item.productId));
          
          const aggregatedItems: Record<string, { 
            productId: string; 
            productName: string; 
            productCode: string | null;
            quantity: number;
            variantCount: number;
            image?: string;
          }> = {};
          
          for (const item of liveItems) {
            const product = productMap.get(item.productId)!;
            
            const code = product.productCode || product.id;
            
            if (aggregatedItems[code]) {
              aggregatedItems[code].quantity += item.quantity;
              aggregatedItems[code].variantCount += 1;
            } else {
              const canonicalProduct = product.canonicalProductId 
                ? productMap.get(product.canonicalProductId) 
                : product;
              
              aggregatedItems[code] = {
                productId: canonicalProduct?.id || product.id,
                productName: canonicalProduct?.name || product.name,
                productCode: product.productCode,
                quantity: item.quantity,
                variantCount: 1,
                image: canonicalProduct?.image || product.image,
              };
            }
          }
          
          return {
            ...crate,
            items: Object.values(aggregatedItems),
            rawItems: liveItems.map(item => {
              const product = productMap.get(item.productId)!;
              return {
                ...item,
                productName: product.name,
                productCode: product.productCode,
              };
            }),
          };
        })
      );
      res.json(cratesWithItems);
    } catch (error) {
      console.error("Get crates error:", error);
      res.status(500).json({ error: "Failed to fetch crates" });
    }
  });
  
  app.post("/api/crates", async (req, res) => {
    try {
      if (!req.session?.userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const { name, description, items } = req.body;
      if (!name || !items || !Array.isArray(items)) {
        return res.status(400).json({ error: "Name and items are required" });
      }
      const crate = await storage.createCrate({ name, description }, items);
      res.json(crate);
    } catch (error) {
      console.error("Create crate error:", error);
      res.status(500).json({ error: "Failed to create crate" });
    }
  });
  
  app.delete("/api/crates/:id", async (req, res) => {
    try {
      if (!req.session?.userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      await storage.deleteCrate(req.params.id);
      res.json({ success: true });
    } catch (error) {
      console.error("Delete crate error:", error);
      res.status(500).json({ error: "Failed to delete crate" });
    }
  });
  
  app.post("/api/crates/:id/duplicate", async (req, res) => {
    try {
      if (!req.session?.userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const crate = await storage.getCrate(req.params.id);
      if (!crate) {
        return res.status(404).json({ error: "Crate not found" });
      }
      const items = await storage.getCrateItems(req.params.id);
      const activeProducts = await storage.getAllProducts();
      const activeProductIds = new Set(activeProducts.map(p => p.id));
      const liveItems = items.filter(item => activeProductIds.has(item.productId));
      const customName = req.body?.name;
      const newCrate = await storage.createCrate(
        { name: customName || `${crate.name} (Copy)`, description: crate.description },
        liveItems.map(item => ({ productId: item.productId, quantity: item.quantity }))
      );
      if (crate.mapData) {
        try {
          const mapData = typeof crate.mapData === 'string' ? JSON.parse(crate.mapData) : crate.mapData;
          const cleanCell = (cell: any) => {
            if (!cell) return cell;
            return { ...cell, items: (cell.items || []).filter((i: any) => activeProductIds.has(i.productId)) };
          };
          const cleanDivider = (d: any) => {
            if (!d) return d;
            return { ...d, items: (d.items || []).filter((i: any) => activeProductIds.has(i.productId)) };
          };
          if (mapData.cells) {
            mapData.cells = mapData.cells.map((row: any[]) => row.map(cleanCell));
          }
          if (mapData.hDividers) {
            mapData.hDividers = mapData.hDividers.map(cleanDivider);
          }
          if (mapData.vDividers) {
            mapData.vDividers = mapData.vDividers.map((row: any[]) => row.map(cleanDivider));
          }
          const cleanedMapData = JSON.stringify(mapData);
          await storage.updateCrate(newCrate.id, { mapData: cleanedMapData });
          newCrate.mapData = cleanedMapData;
        } catch (e) {
          await storage.updateCrate(newCrate.id, { mapData: crate.mapData });
          newCrate.mapData = crate.mapData;
        }
      }
      res.json(newCrate);
    } catch (error) {
      console.error("Duplicate crate error:", error);
      res.status(500).json({ error: "Failed to duplicate crate" });
    }
  });
  
  // Update crate status (active/inactive)
  app.patch("/api/crates/:id/status", async (req, res) => {
    try {
      if (!req.session?.userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const { isActive } = req.body;
      if (typeof isActive !== 'boolean') {
        return res.status(400).json({ error: "isActive must be a boolean" });
      }
      const updatedCrate = await storage.updateCrate(req.params.id, { isActive });
      if (!updatedCrate) {
        return res.status(404).json({ error: "Crate not found" });
      }
      res.json(updatedCrate);
    } catch (error) {
      console.error("Update crate status error:", error);
      res.status(500).json({ error: "Failed to update crate status" });
    }
  });
  
  app.put("/api/crates/:id", async (req, res) => {
    try {
      if (!req.session?.userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const { name, description, items } = req.body;
      if (!items || !Array.isArray(items)) {
        return res.status(400).json({ error: "Items array is required" });
      }
      for (const item of items) {
        if (typeof item.quantity !== 'number' || item.quantity < 0) {
          return res.status(400).json({ error: "Invalid item quantity" });
        }
      }
      const updatedCrate = await storage.updateCrate(
        req.params.id,
        { name, description },
        items
      );
      if (!updatedCrate) {
        return res.status(404).json({ error: "Crate not found" });
      }
      const crateItems = await storage.getCrateItems(updatedCrate.id);
      const products = await storage.getAllProducts();
      const productMap = new Map(products.map(p => [p.id, p]));
      const liveCrateItems = crateItems.filter(item => productMap.has(item.productId));
      const aggregatedItems: Record<string, { 
        productId: string; 
        productName: string; 
        productCode: string | null;
        quantity: number;
        variantCount: number;
        image?: string;
      }> = {};
      
      for (const item of liveCrateItems) {
        const product = productMap.get(item.productId)!;
        
        const code = product.productCode || product.id;
        
        if (aggregatedItems[code]) {
          aggregatedItems[code].quantity += item.quantity;
          aggregatedItems[code].variantCount += 1;
        } else {
          const canonicalProduct = product.canonicalProductId 
            ? productMap.get(product.canonicalProductId) 
            : product;
          
          aggregatedItems[code] = {
            productId: canonicalProduct?.id || product.id,
            productName: canonicalProduct?.name || product.name,
            productCode: product.productCode,
            quantity: item.quantity,
            variantCount: 1,
            image: canonicalProduct?.image || product.image,
          };
        }
      }
      
      const allAssignments = await storage.getAllCrateAssignments();
      const relevantAssignments = allAssignments.filter(a => a.crateId === updatedCrate.id && a.status === 'active');
      for (const a of relevantAssignments) {
        await syncCrateInventoryToNode(a.nodeId);
      }

      res.json({
        ...updatedCrate,
        items: Object.values(aggregatedItems),
        rawItems: liveCrateItems.map(item => {
          const product = productMap.get(item.productId)!;
          return {
            ...item,
            productName: product.name,
            productCode: product.productCode,
          };
        }),
      });
    } catch (error) {
      console.error("Update crate error:", error);
      res.status(500).json({ error: "Failed to update crate" });
    }
  });
  
  app.put("/api/crates/:id/map", async (req, res) => {
    try {
      if (!req.session?.userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const { mapData } = req.body;
      const updatedCrate = await storage.updateCrate(req.params.id, { mapData: mapData || null });
      if (!updatedCrate) {
        return res.status(404).json({ error: "Crate not found" });
      }
      res.json({ success: true, mapData: updatedCrate.mapData });
    } catch (error) {
      console.error("Update crate map error:", error);
      res.status(500).json({ error: "Failed to update crate map" });
    }
  });

  app.post("/api/crates/:crateId/assign/:nodeId", async (req, res) => {
    try {
      if (!req.session?.userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const { crateId, nodeId } = req.params;
      const assignment = await storage.assignCrateToNode(crateId, nodeId);
      await syncCrateInventoryToNode(nodeId);
      res.json(assignment);
    } catch (error) {
      console.error("Assign crate error:", error);
      res.status(500).json({ error: "Failed to assign crate to node" });
    }
  });
  
  app.get("/api/nodes/:nodeId/crates", async (req, res) => {
    try {
      const assignments = await storage.getNodeCrateAssignments(req.params.nodeId);
      const products = await storage.getAllProducts();
      const productMap = new Map(products.map(p => [p.id, p]));
      const cratesWithDetails = await Promise.all(
        assignments.map(async (assignment) => {
          const crate = await storage.getCrate(assignment.crateId);
          const items = crate ? await storage.getCrateItems(crate.id) : [];
          const liveItems = items.filter(item => productMap.has(item.productId));
          
          const aggregatedItems: Record<string, { 
            productId: string; 
            productName: string; 
            productCode: string | null;
            quantity: number;
            variantCount: number;
            image?: string;
          }> = {};
          
          for (const item of liveItems) {
            const product = productMap.get(item.productId)!;
            
            const code = product.productCode || product.id;
            
            if (aggregatedItems[code]) {
              aggregatedItems[code].quantity += item.quantity;
              aggregatedItems[code].variantCount += 1;
            } else {
              const canonicalProduct = product.canonicalProductId 
                ? productMap.get(product.canonicalProductId) 
                : product;
              
              aggregatedItems[code] = {
                productId: canonicalProduct?.id || product.id,
                productName: canonicalProduct?.name || product.name,
                productCode: product.productCode,
                quantity: item.quantity,
                variantCount: 1,
                image: canonicalProduct?.image || product.image,
              };
            }
          }
          
          return {
            ...assignment,
            crate: crate ? {
              ...crate,
              items: Object.values(aggregatedItems),
              rawItems: liveItems.map(item => {
                const product = productMap.get(item.productId)!;
                return {
                  ...item,
                  productName: product.name,
                  productCode: product.productCode,
                };
              }),
            } : null,
          };
        })
      );
      res.json(cratesWithDetails);
    } catch (error) {
      console.error("Get node crates error:", error);
      res.status(500).json({ error: "Failed to fetch node crates" });
    }
  });
  
  app.get("/api/crate-assignments", async (req, res) => {
    try {
      const assignments = await storage.getAllCrateAssignments();
      const allCrates = await storage.getAllCrates();
      
      // Auto-heal: if any crate has active assignments but is itself inactive, activate it
      const cratesWithActiveAssignments = new Set(
        assignments.filter(a => a.status === 'active').map(a => a.crateId)
      );
      for (const crate of allCrates) {
        if (!crate.isActive && cratesWithActiveAssignments.has(crate.id)) {
          console.log(`Auto-healing crate "${crate.name}" (${crate.id}): has active assignments but was inactive`);
          await storage.updateCrate(crate.id, { isActive: true });
        }
      }
      
      // Build response with crate names
      const enrichedAssignments = assignments.map(assignment => {
        const crate = allCrates.find(c => c.id === assignment.crateId);
        return {
          id: assignment.id,
          crateId: assignment.crateId,
          nodeId: assignment.nodeId,
          status: assignment.status,
          crateName: crate?.name || 'Unknown Crate',
          droppedAt: assignment.assignedAt,
          completedAt: assignment.completedAt,
          quantityOverrides: assignment.quantityOverrides || null,
        };
      });
      
      res.json(enrichedAssignments);
    } catch (error) {
      console.error("Get all crate assignments error:", error);
      res.status(500).json({ error: "Failed to fetch crate assignments" });
    }
  });
  
  app.patch("/api/crate-assignments/:id/status", async (req, res) => {
    try {
      if (!req.session?.userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const { status } = req.body;
      if (!status) {
        return res.status(400).json({ error: "Status is required" });
      }
      
      // Get the assignment to find the crate ID
      const assignment = await storage.getCrateAssignment(req.params.id);
      if (!assignment) {
        return res.status(404).json({ error: "Assignment not found" });
      }
      
      // When activating an assignment, also activate the crate
      if (status === 'active') {
        await storage.updateCrate(assignment.crateId, { isActive: true });
      }
      
      // When deactivating, check if there are any other active assignments for this crate
      // If not, deactivate the crate too
      if (status === 'inactive') {
        const allAssignments = await storage.getAllCrateAssignments();
        const otherActiveAssignments = allAssignments.filter(
          a => a.crateId === assignment.crateId && a.id !== req.params.id && a.status === 'active'
        );
        if (otherActiveAssignments.length === 0) {
          await storage.updateCrate(assignment.crateId, { isActive: false });
        }
      }
      
      const updated = await storage.updateCrateAssignmentStatus(req.params.id, status);
      await syncCrateInventoryToNode(assignment.nodeId);
      res.json(updated);
    } catch (error) {
      console.error("Update crate assignment error:", error);
      res.status(500).json({ error: "Failed to update crate assignment" });
    }
  });
  
  app.patch("/api/crate-assignments/:id/quantity-override", async (req, res) => {
    try {
      if (!req.session?.userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const { productId, quantity, originalQuantity } = req.body;
      if (!productId || quantity === undefined) {
        return res.status(400).json({ error: "productId and quantity are required" });
      }
      
      // Get current assignment
      const assignment = await storage.getCrateAssignment(req.params.id);
      if (!assignment) {
        return res.status(404).json({ error: "Assignment not found" });
      }
      
      // Update quantity overrides
      const currentOverrides = (assignment.quantityOverrides as Record<string, { quantity: number; originalQuantity: number }>) || {};
      currentOverrides[productId] = { quantity, originalQuantity };
      
      const updated = await storage.updateCrateAssignmentQuantityOverrides(req.params.id, currentOverrides);
      await syncCrateInventoryToNode(assignment.nodeId);
      res.json({ success: true, quantityOverrides: updated?.quantityOverrides });
    } catch (error) {
      console.error("Update quantity override error:", error);
      res.status(500).json({ error: "Failed to update quantity override" });
    }
  });
  
  app.delete("/api/crate-assignments/:id", async (req, res) => {
    try {
      if (!req.session?.userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const assignment = await storage.getCrateAssignment(req.params.id);
      await storage.deleteCrateAssignment(req.params.id);
      if (assignment) {
        await syncCrateInventoryToNode(assignment.nodeId);
      }
      res.json({ success: true });
    } catch (error) {
      console.error("Delete crate assignment error:", error);
      res.status(500).json({ error: "Failed to delete crate assignment" });
    }
  });
  
  // ===== User Label Templates =====
  
  app.get("/api/label-templates", async (req, res) => {
    try {
      if (!req.session?.userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const templates = await storage.getUserLabelTemplates(req.session.userId);
      // Convert to record format keyed by labelSize
      const templatesRecord: Record<string, any> = {};
      for (const t of templates) {
        templatesRecord[t.labelSize] = t.template;
      }
      res.json(templatesRecord);
    } catch (error) {
      console.error("Get label templates error:", error);
      res.status(500).json({ error: "Failed to get label templates" });
    }
  });
  
  app.post("/api/label-templates", async (req, res) => {
    try {
      if (!req.session?.userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const { labelSize, template } = req.body;
      if (!labelSize || !template) {
        return res.status(400).json({ error: "Missing labelSize or template" });
      }
      await storage.upsertUserLabelTemplate(req.session.userId, labelSize, template);
      res.json({ success: true });
    } catch (error) {
      console.error("Save label template error:", error);
      res.status(500).json({ error: "Failed to save label template" });
    }
  });
  
  app.post("/api/label-templates/bulk", async (req, res) => {
    try {
      if (!req.session?.userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const { templates } = req.body;
      if (!templates || typeof templates !== 'object') {
        return res.status(400).json({ error: "Missing templates object" });
      }
      // Save all templates
      for (const [labelSize, template] of Object.entries(templates)) {
        await storage.upsertUserLabelTemplate(req.session.userId, labelSize, template);
      }
      res.json({ success: true });
    } catch (error) {
      console.error("Save bulk label templates error:", error);
      res.status(500).json({ error: "Failed to save label templates" });
    }
  });
  
  // ===== Label PDF Generation =====
  
  app.post("/api/labels/generate-pdf", async (req, res) => {
    console.log('[PDF] Request received for label PDF generation');
    
    try {
      if (!req.session?.userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      
      const { labelsByProduct, templates } = req.body;
      console.log('[PDF] Payload received:', { 
        products: Object.keys(labelsByProduct || {}).length,
        templates: Object.keys(templates || {}).length 
      });
      
      if (!labelsByProduct || !templates) {
        return res.status(400).json({ error: "Missing labelsByProduct or templates" });
      }
      
      console.log('[PDF] Calling generateLabelPdfs...');
      const result = await generateLabelPdfs(labelsByProduct, templates, () => false);
      console.log('[PDF] Generation complete:', { type: result.type, size: result.buffer.length });
      
      const contentType = result.type === 'pdf' ? 'application/pdf' : 'application/zip';
      res.setHeader('Content-Type', contentType);
      res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
      console.log('[PDF] Sending response...');
      res.send(result.buffer);
      console.log('[PDF] Response sent');
    } catch (error: any) {
      console.error("Generate label PDFs error:", error);
      if (!res.headersSent) {
        res.status(500).json({ error: "Failed to generate label PDFs" });
      }
    }
  });
  
  // ===== Price Tag Templates =====

  app.get("/api/pricetag-templates", async (req, res) => {
    try {
      if (!req.session?.userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const all = await storage.getUserLabelTemplates(req.session.userId);
      const result: Record<string, any> = {};
      for (const t of all) {
        if (t.labelSize.startsWith('pt-')) {
          result[t.labelSize.slice(3)] = t.template;
        }
      }
      res.json(result);
    } catch (error) {
      console.error("Get price tag templates error:", error);
      res.status(500).json({ error: "Failed to get price tag templates" });
    }
  });

  app.post("/api/pricetag-templates/bulk", async (req, res) => {
    try {
      if (!req.session?.userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const { templates } = req.body;
      if (!templates || typeof templates !== 'object') {
        return res.status(400).json({ error: "Missing templates object" });
      }
      for (const [key, template] of Object.entries(templates)) {
        await storage.upsertUserLabelTemplate(req.session.userId, `pt-${key}`, template);
      }
      res.json({ success: true });
    } catch (error) {
      console.error("Save price tag templates error:", error);
      res.status(500).json({ error: "Failed to save price tag templates" });
    }
  });

  app.delete("/api/pricetag-templates/:key", async (req, res) => {
    try {
      if (!req.session?.userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      await storage.deleteUserLabelTemplate(req.session.userId, `pt-${req.params.key}`);
      res.json({ success: true });
    } catch (error) {
      console.error("Delete price tag template error:", error);
      res.status(500).json({ error: "Failed to delete price tag template" });
    }
  });

  // ===== Price Tag PDF Generation =====

  app.post("/api/pricetags/generate-pdf", async (req, res) => {
    try {
      if (!req.session?.userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const { tagsByProduct, templates } = req.body;
      if (!tagsByProduct || !templates) {
        return res.status(400).json({ error: "Missing tagsByProduct or templates" });
      }
      const result = await generatePriceTagPdfs(tagsByProduct, templates);
      const contentType = result.type === 'pdf' ? 'application/pdf' : 'application/zip';
      res.setHeader('Content-Type', contentType);
      res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
      res.send(result.buffer);
    } catch (error: any) {
      console.error("Generate price tag PDFs error:", error);
      if (!res.headersSent) {
        res.status(500).json({ error: "Failed to generate price tag PDFs" });
      }
    }
  });

  // ===== Agreements =====
  
  // Get all agreements (public - for checkout and footer)
  app.get("/api/agreements", async (_req, res) => {
    try {
      let agreementsList = await storage.getAllAgreements();
      
      // Seed default agreements if none exist
      if (agreementsList.length === 0) {
        await storage.upsertAgreement('terms', 'Terms of Service', 'Please add your Terms of Service content here.');
        await storage.upsertAgreement('refund', 'Refund Policy', 'Please add your Refund Policy content here.');
        await storage.upsertAgreement('host_handoff', 'Host Handoff Responsibilities and Limitations', 'Please add your Host Handoff Responsibilities and Limitations content here, including acknowledgements regarding product warranties and host limitations.');
        agreementsList = await storage.getAllAgreements();
      }
      
      res.json(agreementsList);
    } catch (error) {
      console.error("Get agreements error:", error);
      res.status(500).json({ error: "Failed to get agreements" });
    }
  });
  
  // Get single agreement by key (public)
  app.get("/api/agreements/:key", async (req, res) => {
    try {
      const agreement = await storage.getAgreement(req.params.key);
      if (!agreement) {
        return res.status(404).json({ error: "Agreement not found" });
      }
      res.json(agreement);
    } catch (error) {
      console.error("Get agreement error:", error);
      res.status(500).json({ error: "Failed to get agreement" });
    }
  });
  
  // Update agreement (admin only)
  app.put("/api/agreements/:key", async (req, res) => {
    try {
      if (!req.session?.userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const user = await storage.getUser(req.session.userId);
      if (!user || user.type !== 'admin') {
        return res.status(403).json({ error: "Admin access required" });
      }
      
      const { title, content } = req.body;
      if (!title || !content) {
        return res.status(400).json({ error: "Title and content are required" });
      }
      
      const validKeys = ['terms', 'refund', 'host_handoff'];
      if (!validKeys.includes(req.params.key)) {
        return res.status(400).json({ error: "Invalid agreement key" });
      }
      
      const updated = await storage.upsertAgreement(req.params.key, title, content);
      res.json(updated);
    } catch (error) {
      console.error("Update agreement error:", error);
      res.status(500).json({ error: "Failed to update agreement" });
    }
  });
  
  // ===== Admin Settings Routes =====
  
  // Get admin setting by key
  app.get("/api/admin-settings/:key", async (req, res) => {
    try {
      const value = await storage.getAdminSetting(req.params.key);
      res.json({ key: req.params.key, value: value || null });
    } catch (error) {
      console.error("Get admin setting error:", error);
      res.status(500).json({ error: "Failed to get admin setting" });
    }
  });
  
  // Set admin setting (admin only)
  app.put("/api/admin-settings/:key", async (req, res) => {
    try {
      if (!req.session?.userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const user = await storage.getUser(req.session.userId);
      if (!user || user.type !== 'admin') {
        return res.status(403).json({ error: "Admin access required" });
      }
      
      const { value } = req.body;
      if (value === undefined || value === null) {
        return res.status(400).json({ error: "Value is required" });
      }
      
      await storage.upsertAdminSetting(req.params.key, String(value));
      res.json({ key: req.params.key, value: String(value) });
    } catch (error) {
      console.error("Set admin setting error:", error);
      res.status(500).json({ error: "Failed to set admin setting" });
    }
  });
  
  app.get("/api/map-screenshot", async (req, res) => {
    try {
      const { center, zoom: zoomStr, width: widthStr, height: heightStr, markers, circles } = req.query;
      if (!center || !zoomStr) return res.status(400).json({ error: "Missing center or zoom" });

      const [latStr, lngStr] = String(center).split(',');
      const lat = parseFloat(latStr);
      const lng = parseFloat(lngStr);
      const zoom = parseInt(String(zoomStr), 10);
      const imgWidth = Math.min(parseInt(String(widthStr || '800'), 10), 1600);
      const imgHeight = Math.min(parseInt(String(heightStr || '800'), 10), 1600);

      function lngToTileX(lon: number, z: number) { return Math.floor(((lon + 180) / 360) * Math.pow(2, z)); }
      function latToTileY(la: number, z: number) { return Math.floor((1 - Math.log(Math.tan(la * Math.PI / 180) + 1 / Math.cos(la * Math.PI / 180)) / Math.PI) / 2 * Math.pow(2, z)); }
      function lngToPixelX(lon: number, z: number) { return ((lon + 180) / 360) * Math.pow(2, z) * 256; }
      function latToPixelY(la: number, z: number) { return (1 - Math.log(Math.tan(la * Math.PI / 180) + 1 / Math.cos(la * Math.PI / 180)) / Math.PI) / 2 * Math.pow(2, z) * 256; }

      const centerPixelX = lngToPixelX(lng, zoom);
      const centerPixelY = latToPixelY(lat, zoom);

      const topLeftPixelX = centerPixelX - imgWidth / 2;
      const topLeftPixelY = centerPixelY - imgHeight / 2;

      const tileMinX = Math.floor(topLeftPixelX / 256);
      const tileMinY = Math.floor(topLeftPixelY / 256);
      const tileMaxX = Math.floor((topLeftPixelX + imgWidth - 1) / 256);
      const tileMaxY = Math.floor((topLeftPixelY + imgHeight - 1) / 256);

      const tilePromises: { x: number; y: number; buf: Promise<Buffer | null> }[] = [];
      const tileServers = ['a', 'b', 'c'];
      let serverIdx = 0;

      for (let ty = tileMinY; ty <= tileMaxY; ty++) {
        for (let tx = tileMinX; tx <= tileMaxX; tx++) {
          const s = tileServers[serverIdx % 3];
          serverIdx++;
          const tileUrl = `https://${s}.tile.openstreetmap.org/${zoom}/${tx}/${ty}.png`;
          const bufPromise = fetch(tileUrl, {
            headers: { 'User-Agent': 'GridMart/1.0 (map screenshot)' }
          }).then(r => r.ok ? r.arrayBuffer().then(ab => Buffer.from(ab)) : null).catch(() => null);
          tilePromises.push({ x: tx, y: ty, buf: bufPromise });
        }
      }

      const composites: { input: Buffer; left: number; top: number }[] = [];
      for (const tile of tilePromises) {
        const buf = await tile.buf;
        if (!buf) continue;
        const left = Math.round(tile.x * 256 - topLeftPixelX);
        const top = Math.round(tile.y * 256 - topLeftPixelY);
        composites.push({ input: buf, left, top });
      }

      const sharp = (await import('sharp')).default;

      let image = sharp({ create: { width: imgWidth, height: imgHeight, channels: 4, background: { r: 229, g: 227, b: 223, alpha: 1 } } }).png();

      if (composites.length > 0) {
        image = sharp({ create: { width: imgWidth, height: imgHeight, channels: 4, background: { r: 229, g: 227, b: 223, alpha: 1 } } })
          .composite(composites)
          .png();
      }

      const circleList = circles ? (Array.isArray(circles) ? circles : [circles]) : [];
      const svgOverlays: string[] = [];

      circleList.forEach((c: any) => {
        const parts = String(c).split('|');
        const clat = parseFloat(parts[0]);
        const clng = parseFloat(parts[1]);
        const radiusMeters = parseFloat(parts[2]);
        const color = parts[3] || '#13a89e';
        const opacity = parseFloat(parts[4] || '0.2');

        const cx = Math.round(lngToPixelX(clng, zoom) - topLeftPixelX);
        const cy = Math.round(latToPixelY(clat, zoom) - topLeftPixelY);

        const metersPerPixel = 156543.03392 * Math.cos(clat * Math.PI / 180) / Math.pow(2, zoom);
        const radiusPixels = Math.round(radiusMeters / metersPerPixel);

        svgOverlays.push(`<circle cx="${cx}" cy="${cy}" r="${radiusPixels}" fill="${color}" fill-opacity="${opacity}" stroke="${color}" stroke-width="2" stroke-opacity="0.8"/>`);
      });

      const markerList = markers ? (Array.isArray(markers) ? markers : [markers]) : [];
      markerList.forEach((m: any) => {
        const parts = String(m).split('|');
        let mlat = 0, mlng = 0, color = '#e74c3c', label = '';
        parts.forEach((p: string) => {
          if (p.startsWith('color:')) color = p.replace('color:', '').replace('0x', '#');
          else if (p.startsWith('label:')) label = p.replace('label:', '');
          else if (p.includes(',')) { const [a, b] = p.split(','); mlat = parseFloat(a); mlng = parseFloat(b); }
        });
        const mx = Math.round(lngToPixelX(mlng, zoom) - topLeftPixelX);
        const my = Math.round(latToPixelY(mlat, zoom) - topLeftPixelY);

        svgOverlays.push(`<circle cx="${mx}" cy="${my}" r="12" fill="${color}" stroke="white" stroke-width="2"/>`);
        if (label) {
          svgOverlays.push(`<text x="${mx}" y="${my + 5}" text-anchor="middle" fill="white" font-size="12" font-weight="bold" font-family="Arial,sans-serif">${label}</text>`);
        }
      });

      if (svgOverlays.length > 0) {
        const svgBuf = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${imgWidth}" height="${imgHeight}">${svgOverlays.join('')}</svg>`);
        const baseBuffer = await image.toBuffer();
        image = sharp(baseBuffer).composite([{ input: svgBuf, top: 0, left: 0 }]).png();
      }

      const finalBuffer = await image.toBuffer();
      res.set("Content-Type", "image/png");
      res.set("Content-Disposition", `attachment; filename="gridmart-map-${new Date().toISOString().split('T')[0]}.png"`);
      res.send(finalBuffer);
    } catch (error) {
      console.error("Map screenshot error:", error);
      res.status(500).json({ error: "Failed to generate map screenshot" });
    }
  });

  // Get all site settings (public - for tax config at checkout)
  app.get("/api/site-settings", async (_req, res) => {
    try {
      const settings = await storage.getAllSiteSettings();
      res.json(settings);
    } catch (error) {
      console.error("Get site settings error:", error);
      res.status(500).json({ error: "Failed to get site settings" });
    }
  });
  
  // Update site setting (admin only)
  app.put("/api/site-settings/:key", async (req, res) => {
    try {
      if (!req.session?.userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const user = await storage.getUser(req.session.userId);
      if (!user || user.type !== 'admin') {
        return res.status(403).json({ error: "Admin access required" });
      }
      
      const { value } = req.body;
      if (value === undefined || value === null) {
        return res.status(400).json({ error: "Value is required" });
      }
      
      await storage.setSiteSetting(req.params.key, String(value));
      res.json({ key: req.params.key, value: String(value) });
    } catch (error) {
      console.error("Set site setting error:", error);
      res.status(500).json({ error: "Failed to set site setting" });
    }
  });
  
  // User preferences endpoints
  app.get("/api/user-preferences/:key", async (req, res) => {
    try {
      if (!req.session.userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const value = await storage.getUserPreference(req.session.userId, req.params.key);
      res.json({ key: req.params.key, value });
    } catch (error) {
      console.error("Get user preference error:", error);
      res.status(500).json({ error: "Failed to get user preference" });
    }
  });
  
  app.put("/api/user-preferences/:key", async (req, res) => {
    try {
      if (!req.session.userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      
      const { value } = req.body;
      if (value === undefined || value === null) {
        return res.status(400).json({ error: "Value is required" });
      }
      
      await storage.setUserPreference(req.session.userId, req.params.key, String(value));
      res.json({ key: req.params.key, value: String(value) });
    } catch (error) {
      console.error("Set user preference error:", error);
      res.status(500).json({ error: "Failed to set user preference" });
    }
  });
  
  // Image proxy endpoint - fetches external images through the server
  // This allows the browser to load images from sites that block CORS
  app.get("/api/image-proxy", async (req, res) => {
    try {
      const url = req.query.url as string;
      if (!url) {
        return res.status(400).json({ error: "URL required" });
      }
      
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
        },
        redirect: 'follow',
      });
      
      if (!response.ok) {
        return res.status(response.status).json({ error: "Failed to fetch image" });
      }
      
      const contentType = response.headers.get('content-type') || 'image/jpeg';
      const buffer = Buffer.from(await response.arrayBuffer());
      
      res.set({
        'Content-Type': contentType,
        'Content-Length': buffer.length,
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=86400',
      });
      res.send(buffer);
    } catch (error: any) {
      console.error("Image proxy error:", error.message);
      res.status(500).json({ error: "Failed to proxy image" });
    }
  });
  
  // Google Merchant API routes
  // Host product images on our own storage
  app.post("/api/products/host-images", async (req, res) => {

    try {
      if (!req.session.userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      
      const user = await storage.getUser(req.session.userId);
      if (user?.type !== 'admin') {
        return res.status(403).json({ error: "Admin access required" });
      }
      
      const { productIds } = req.body;
      if (!productIds || !Array.isArray(productIds) || productIds.length === 0) {
        return res.status(400).json({ error: "No product IDs provided" });
      }
      
      const bucketId = process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID;
      if (!bucketId) {
        return res.status(400).json({ error: "Object storage not configured" });
      }
      
      const results: { productId: string; productCode: string; success: boolean; hosted: number; error?: string }[] = [];
      
      for (const productId of productIds) {
        const product = await storage.getProduct(productId);
        if (!product) {
          results.push({ productId, productCode: '', success: false, hosted: 0, error: "Product not found" });
          continue;
        }
        
        try {
          // Combine images array with legacy image field
          let images = product.images || [];
          if (product.image && !images.includes(product.image)) {
            images = [product.image, ...images];
          }
          if (images.length === 0) {
            results.push({ productId, productCode: product.productCode || '', success: true, hosted: 0 });
            continue;
          }
          const newImages: string[] = [];
          let hostedCount = 0;
          
          for (let i = 0; i < images.length; i++) {
            const imageUrl = images[i];
            
            // Skip if already hosted on our storage
            if (imageUrl.includes('storage.googleapis.com') && imageUrl.includes(bucketId)) {
              newImages.push(imageUrl);
              continue;
            }
            
            // Skip data URIs - handle them separately
            if (imageUrl.startsWith('data:')) {
              // Convert base64 to hosted
              const matches = imageUrl.match(/^data:image\/(\w+);base64,(.+)$/);
              if (matches) {
                const [, format, data] = matches;
                const buffer = Buffer.from(data, 'base64');
                const contentType = `image/${format}`;
                
                // Use private storage with API path (works with access prevention)
                const privateDir = process.env.PRIVATE_OBJECT_DIR;
                if (!privateDir) {
                  console.log(`[Host Images] PRIVATE_OBJECT_DIR not set for base64`);
                  newImages.push(imageUrl);
                  continue;
                }
                
                const objectId = randomUUID();
                const fullPath = `${privateDir}/uploads/${objectId}`;
                const pathParts = fullPath.startsWith('/') ? fullPath.slice(1).split('/') : fullPath.split('/');
                const bucketName = pathParts[0];
                const objectName = pathParts.slice(1).join('/');
                
                const bucket = objectStorageClient.bucket(bucketName);
                const file = bucket.file(objectName);
                
                await file.save(buffer, {
                  metadata: { contentType },
                });
                
                const apiPath = `/api/objects/uploads/${objectId}`;
                newImages.push(apiPath);
                hostedCount++;
                console.log(`[Host Images] Hosted base64 image for ${product.productCode}: ${apiPath}`);
              } else {
                newImages.push(imageUrl);
              }
              continue;
            }
            
            // Download external image and upload to our storage
            try {
              let buffer: Buffer | null = null;
              let contentType = 'image/jpeg';
              
              console.log(`[Host Images] Attempting to download: ${imageUrl}`);
              
              // Try direct fetch first with browser-like headers
              try {
                const response = await fetch(imageUrl, {
                  headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
                    'Accept-Language': 'en-US,en;q=0.9',
                    'Referer': new URL(imageUrl).origin + '/',
                    'Sec-Fetch-Dest': 'image',
                    'Sec-Fetch-Mode': 'no-cors',
                    'Sec-Fetch-Site': 'cross-site',
                  },
                  redirect: 'follow',
                });
                
                if (response.ok) {
                  const ct = response.headers.get('content-type') || '';
                  if (ct.includes('image')) {
                    contentType = ct;
                    buffer = Buffer.from(await response.arrayBuffer());
                    console.log(`[Host Images] Direct download succeeded: ${buffer.length} bytes`);
                  } else {
                    console.log(`[Host Images] Direct download returned non-image: ${ct}`);
                  }
                } else {
                  console.log(`[Host Images] Direct download failed: ${response.status}`);
                }
              } catch (e: any) {
                console.log(`[Host Images] Direct download error: ${e.message}`);
              }
              
              // Try ScrapFly as second attempt
              if (!buffer && process.env.SCRAPFLY_API_KEY) {
                console.log(`[Host Images] Trying ScrapFly for ${imageUrl}...`);
                try {
                  const scrapflyUrl = `https://api.scrapfly.io/scrape?key=${process.env.SCRAPFLY_API_KEY}&url=${encodeURIComponent(imageUrl)}&render_js=false&asp=true`;
                  const response = await fetch(scrapflyUrl, { redirect: 'follow' });
                  if (response.ok) {
                    const data = await response.json();
                    if (data.result?.content) {
                      buffer = Buffer.from(data.result.content, 'base64');
                      contentType = data.result.response_headers?.['content-type'] || 'image/jpeg';
                      console.log(`[Host Images] ScrapFly succeeded: ${buffer.length} bytes`);
                    }
                  }
                } catch (e: any) {
                  console.log(`[Host Images] ScrapFly error: ${e.message}`);
                }
              }
              
              // Try ScrapingBee as third attempt
              if (!buffer && process.env.SCRAPINGBEE_API_KEY) {
                console.log(`[Host Images] Trying ScrapingBee for ${imageUrl}...`);
                try {
                  const scrapingBeeUrl = `https://app.scrapingbee.com/api/v1/?api_key=${process.env.SCRAPINGBEE_API_KEY}&url=${encodeURIComponent(imageUrl)}&render_js=false`;
                  const response = await fetch(scrapingBeeUrl, { redirect: 'follow' });
                  if (response.ok) {
                    const ct = response.headers.get('content-type') || '';
                    if (ct.includes('image')) {
                      buffer = Buffer.from(await response.arrayBuffer());
                      contentType = ct;
                      console.log(`[Host Images] ScrapingBee succeeded: ${buffer.length} bytes`);
                    }
                  }
                } catch (e: any) {
                  console.log(`[Host Images] ScrapingBee error: ${e.message}`);
                }
              }
              
              if (!buffer || buffer.length < 100) {
                console.log(`[Host Images] All download methods failed for ${imageUrl}`);
                newImages.push(imageUrl);
                continue;
              }
              
              // Use presigned URL upload (works with public access prevention)
              const privateDir = process.env.PRIVATE_OBJECT_DIR;
              if (!privateDir) {
                console.log(`[Host Images] PRIVATE_OBJECT_DIR not set`);
                newImages.push(imageUrl);
                continue;
              }
              
              const objectId = randomUUID();
              const fullPath = `${privateDir}/uploads/${objectId}`;
              // Parse the path to get bucket name and object name
              const pathParts = fullPath.startsWith('/') ? fullPath.slice(1).split('/') : fullPath.split('/');
              const bucketName = pathParts[0];
              const objectName = pathParts.slice(1).join('/');
              
              const bucket = objectStorageClient.bucket(bucketName);
              const file = bucket.file(objectName);
              
              await file.save(buffer, {
                metadata: { contentType },
              });
              
              // Use API path to serve the image (works with access prevention)
              const apiPath = `/api/objects/uploads/${objectId}`;
              newImages.push(apiPath);
              hostedCount++;
              console.log(`[Host Images] Hosted image for ${product.productCode}: ${apiPath}`);
            } catch (downloadError: any) {
              console.error(`[Host Images] Error downloading ${imageUrl}:`, downloadError.message);
              newImages.push(imageUrl);
            }
          }
          
          // Update product with new image URLs
          if (hostedCount > 0) {
            await storage.updateProduct(productId, {
              images: newImages,
              image: newImages[0] || product.image,
            });
          }
          
          results.push({ 
            productId, 
            productCode: product.productCode || '', 
            success: true, 
            hosted: hostedCount 
          });
        } catch (productError: any) {
          results.push({ 
            productId, 
            productCode: product.productCode || '', 
            success: false, 
            hosted: 0, 
            error: productError.message 
          });
        }
      }
      
      const totalHosted = results.reduce((sum, r) => sum + r.hosted, 0);
      const successful = results.filter(r => r.success).length;
      
      res.json({ 
        total: productIds.length, 
        successful, 
        failed: productIds.length - successful,
        totalHosted,
        results 
      });
    } catch (error: any) {
      console.error("Host images error:", error);
      res.status(500).json({ error: error.message || "Failed to host images" });
    }
  });
  
  app.get("/api/google-merchant/status", async (req, res) => {
    try {
      if (!req.session.userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      
      const user = await storage.getUser(req.session.userId);
      if (user?.type !== 'admin') {
        return res.status(403).json({ error: "Admin access required" });
      }
      
      await googleMerchantService.initialize();
      const isConfigured = googleMerchantService.isConfigured();
      
      if (!isConfigured) {
        return res.json({ 
          configured: false, 
          message: "Google Merchant API credentials not configured" 
        });
      }
      
      const connectionTest = await googleMerchantService.testConnection();
      res.json({
        configured: true,
        connected: connectionTest.success,
        message: connectionTest.message,
        productCount: connectionTest.productCount,
      });
    } catch (error: any) {
      console.error("Google Merchant status error:", error);
      res.status(500).json({ error: error.message || "Failed to check status" });
    }
  });
  
  app.post("/api/google-merchant/sync", async (req, res) => {
    try {
      if (!req.session.userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      
      const user = await storage.getUser(req.session.userId);
      if (user?.type !== 'admin') {
        return res.status(403).json({ error: "Admin access required" });
      }
      
      await googleMerchantService.initialize();
      if (!googleMerchantService.isConfigured()) {
        return res.status(400).json({ error: "Google Merchant API not configured" });
      }
      
      const { productCodes } = req.body;
      
      // Get products to sync
      let productsToSync = await storage.getAllProducts();
      
      // Filter to specific products if provided
      if (productCodes && Array.isArray(productCodes) && productCodes.length > 0) {
        productsToSync = productsToSync.filter((p: any) => productCodes.includes(p.productCode));
      }
      
      // Only sync products that have a productCode
      productsToSync = productsToSync.filter((p: any) => !!p.productCode);
      
      if (productsToSync.length === 0) {
        return res.json({ 
          success: true, 
          message: "No valid products to sync (missing product codes)",
          total: 0,
          successful: 0,
          failed: 0,
        });
      }
      
      // Get site URL from request
      const protocol = req.headers['x-forwarded-proto'] || 'https';
      const host = req.headers['host'] || 'gridmart.ca';
      const siteUrl = `${protocol}://${host}`;
      
      // Build a map of product ID to product code for looking up parent codes
      const productCodeMap = new Map<string, string>();
      productsToSync.forEach((p: any) => {
        if (p.id && p.productCode) {
          productCodeMap.set(p.id, p.productCode);
        }
      });
      
      // Format products for Google Merchant
      const formattedProducts = productsToSync.map((p: any) => {
        const inventoryStock = (p.inventory || []).reduce((sum: number, inv: any) => sum + inv.quantity, 0);
        const quantity = inventoryStock > 0 ? inventoryStock : (p.sheetQuantity || 0);
        
        // Look up parent product code for variants
        let parentProductCode = null;
        if (p.parentProductId) {
          parentProductCode = productCodeMap.get(p.parentProductId) || null;
        }
        
        return {
          id: p.id,
          productCode: p.productCode,
          name: p.name,
          description: p.description || '',
          price: p.price,
          image: p.image,
          images: p.images || [],
          category: p.category,
          condition: p.condition,
          brand: p.brand,
          quantity,
          // Variant fields
          parentProductId: p.parentProductId || null,
          parentProductCode,
          variantName: p.variantName || null,
          variantSuffix: p.variantSuffix || null,
          colors: p.colors || null,
        };
      });
      
      const result = await googleMerchantService.syncProducts(formattedProducts, siteUrl);
      
      // Get first few error messages for debugging
      const failedResults = result.results.filter(r => !r.success);
      const firstErrors = failedResults.slice(0, 3).map(r => r.error);
      
      res.json({
        success: true,
        message: `Synced ${result.successful} of ${result.total} products`,
        ...result,
        sampleErrors: firstErrors.length > 0 ? firstErrors : undefined,
      });
    } catch (error: any) {
      console.error("Google Merchant sync error:", error);
      res.status(500).json({ error: error.message || "Failed to sync products" });
    }
  });
  
  app.get("/api/google-merchant/products", async (req, res) => {
    try {
      if (!req.session.userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      
      const user = await storage.getUser(req.session.userId);
      if (user?.type !== 'admin') {
        return res.status(403).json({ error: "Admin access required" });
      }
      
      await googleMerchantService.initialize();
      if (!googleMerchantService.isConfigured()) {
        return res.status(400).json({ error: "Google Merchant API not configured" });
      }
      
      const result = await googleMerchantService.listProducts(100);
      
      if (!result.success) {
        return res.status(500).json({ error: result.error });
      }
      
      res.json({ products: result.products });
    } catch (error: any) {
      console.error("Google Merchant list error:", error);
      res.status(500).json({ error: error.message || "Failed to list products" });
    }
  });
  
  app.delete("/api/google-merchant/products/:productCode", async (req, res) => {
    try {
      if (!req.session.userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      
      const user = await storage.getUser(req.session.userId);
      if (user?.type !== 'admin') {
        return res.status(403).json({ error: "Admin access required" });
      }
      
      await googleMerchantService.initialize();
      if (!googleMerchantService.isConfigured()) {
        return res.status(400).json({ error: "Google Merchant API not configured" });
      }
      
      const result = await googleMerchantService.deleteProduct(req.params.productCode);
      
      if (!result.success) {
        return res.status(500).json({ error: result.error });
      }
      
      res.json({ success: true });
    } catch (error: any) {
      console.error("Google Merchant delete error:", error);
      res.status(500).json({ error: error.message || "Failed to delete product" });
    }
  });

  app.post("/api/google-merchant/local-inventory/sync", async (req, res) => {
    try {
      if (!req.session.userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      
      const user = await storage.getUser(req.session.userId);
      if (user?.type !== 'admin') {
        return res.status(403).json({ error: "Admin access required" });
      }
      
      await googleMerchantService.initialize();
      if (!googleMerchantService.isConfigured()) {
        return res.status(400).json({ error: "Google Merchant API not configured" });
      }
      
      const globalStoreCode = await storage.getAdminSetting('google_store_code');
      
      if (!globalStoreCode) {
        return res.json({
          success: false,
          message: "Google store code not configured. Set it in the Google Merchant section of the admin dashboard.",
          productsSync: { total: 0, successful: 0, failed: 0 },
          inventorySync: { total: 0, successful: 0, failed: 0 },
        });
      }
      
      const protocol = req.headers['x-forwarded-proto'] || 'https';
      const host = req.headers['host'] || 'gridmart.ca';
      const siteUrl = `${protocol}://${host}`;
      
      const allProducts = await storage.getAllProducts();
      const productsWithCode = allProducts.filter((p: any) => !!p.productCode);
      
      const inventoryData: Array<{ product: any; storeCode: string; quantity: number }> = [];
      
      for (const product of productsWithCode) {
        const inventoryRows = await storage.getInventoryByProduct(product.id);
        const totalStock = inventoryRows.length > 0
          ? inventoryRows.reduce((sum, i) => sum + i.quantity, 0)
          : (product.sheetQuantity || 0);
        
        inventoryData.push({
          product: {
            id: product.id,
            productCode: product.productCode,
            name: product.name,
            description: product.description || '',
            price: product.price,
            image: product.image,
            images: product.images || [],
            category: product.category,
            condition: product.condition,
            brand: product.brand,
            quantity: totalStock,
          },
          storeCode: globalStoreCode,
          quantity: totalStock,
        });
      }
      
      if (inventoryData.length === 0) {
        return res.json({
          success: true,
          message: "No inventory data to sync",
          productsSync: { total: 0, successful: 0, failed: 0 },
          inventorySync: { total: 0, successful: 0, failed: 0 },
        });
      }
      
      const result = await googleMerchantService.syncAllLocalInventory(inventoryData, siteUrl);
      
      res.json({
        success: true,
        message: `Local inventory sync: ${result.inventorySync.successful} of ${result.inventorySync.total} entries synced using store code ${globalStoreCode}`,
        ...result,
      });
    } catch (error: any) {
      console.error("Google Merchant local inventory sync error:", error);
      res.status(500).json({ error: error.message || "Failed to sync local inventory" });
    }
  });

  async function generateLocalInventoryXml(): Promise<{ xml: string; totalRows: number; productCount: number; nodeCount: number }> {
    const globalStoreCode = await storage.getAdminSetting('google_store_code');
    if (!globalStoreCode) {
      throw new Error("Google store code not configured. Set it in the Google Merchant section.");
    }

    const allProducts = await storage.getAllProducts();
    const productsWithCode = allProducts.filter((p: any) => !!p.productCode && !p.deletedAt);
    const allNodes = await storage.getAllNodes();
    const activeNodes = allNodes.filter((n: any) => n.status === 'active');
    const nodeMap = new Map(activeNodes.map(n => [n.id, n]));

    const allAssignments = await storage.getAllCrateAssignments();
    const activeAssignments = allAssignments.filter(a => a.status === 'active');

    const productNodeMap = new Map<string, Set<string>>();
    for (const assignment of activeAssignments) {
      const crateItems = await storage.getCrateItems(assignment.crateId);
      for (const item of crateItems) {
        if (!productNodeMap.has(item.productId)) {
          productNodeMap.set(item.productId, new Set());
        }
        productNodeMap.get(item.productId)!.add(assignment.nodeId);
      }
    }

    const nodeCountSet = new Set<string>();
    let totalRows = 0;
    const entries: string[] = [];

    for (const product of productsWithCode) {
      const assignedNodeIds = productNodeMap.get(product.id);
      if (!assignedNodeIds || assignedNodeIds.size === 0) continue;

      const inventoryRows = await storage.getInventoryByProduct(product.id);

      for (const nodeId of assignedNodeIds) {
        const node = nodeMap.get(nodeId);
        if (!node) continue;
        nodeCountSet.add(nodeId);

        const inv = inventoryRows.find(i => i.nodeId === nodeId);
        const qty = inv ? inv.quantity : (product.sheetQuantity || 0);
        const availability = qty > 0 ? 'in stock' : 'out of stock';
        const price = `${product.price} CAD`;

        const escXml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

        entries.push(`  <entry>
    <g:id>${escXml(product.productCode!)}</g:id>
    <g:store_code>${escXml(globalStoreCode)}</g:store_code>
    <g:availability>${availability}</g:availability>
    <g:price>${escXml(price)}</g:price>
    <g:quantity>${qty}</g:quantity>
    <g:pickup_sla>same day</g:pickup_sla>
    <g:instore_product_location>${escXml(node.name)}</g:instore_product_location>
  </entry>`);
        totalRows++;
      }
    }

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom" xmlns:g="http://base.google.com/ns/1.0">
  <title>Local Inventory</title>
  <updated>${new Date().toISOString()}</updated>
${entries.join('\n')}
</feed>`;

    return { xml, totalRows, productCount: productsWithCode.length, nodeCount: nodeCountSet.size };
  }

  function inferBrand(product: any): string {
    if (product.brand && product.brand.trim()) return product.brand.trim();
    const knownBrands = ['Duracell', 'Energizer', 'Jelly Comb', 'JELLY COMB', 'AUKEY', 'TACKLIFE', 'IFORY', 'Logitech', 'Anker', 'Samsung', 'Apple', 'Sony', 'JBL', 'Bose', 'Nintendo', 'Canon', 'Nikon'];
    const text = `${product.name} ${Array.isArray(product.description) ? product.description.join(' ') : (product.description || '')}`;
    for (const brand of knownBrands) {
      if (text.toLowerCase().includes(brand.toLowerCase())) return brand;
    }
    return '';
  }

  function getProductFeedData(product: any, baseUrl: string, slugifyFn: (s: string) => string) {
    const slug = slugifyFn(product.name);
    const shortId = product.id.slice(0, 8);
    const productLink = `${baseUrl}/product/${slug}-${shortId}`;

    const images = product.images && product.images.length > 0
      ? product.images
      : product.image ? [product.image] : [];
    const imageLink = images.length > 0
      ? (images[0].startsWith('http') ? images[0] : `${baseUrl}${images[0]}`)
      : '';
    const additionalImages = images.slice(1).map((img: string) =>
      img.startsWith('http') ? img : `${baseUrl}${img}`
    );

    const descriptionRaw = Array.isArray(product.description)
      ? product.description.join('\n')
      : (product.description || product.name);
    const description = descriptionRaw.replace(/<[^>]*>/g, '').slice(0, 5000);

    const condition = (product.condition || 'new').toLowerCase() === 'new' ? 'new'
      : (product.condition || '').toLowerCase().includes('refurbished') ? 'refurbished'
      : 'used';

    return { productLink, imageLink, additionalImages, description, condition };
  }

  function getFeedBaseUrl(req?: any) {
    const host = req?.get?.('host') || '';
    if (host && host.includes('gridmart.ca')) {
      return 'https://gridmart.ca';
    }
    if (process.env.REPLIT_DEPLOYMENT_URL) {
      return 'https://gridmart.ca';
    }
    return process.env.REPLIT_DEV_DOMAIN
      ? `https://${process.env.REPLIT_DEV_DOMAIN}`
      : 'https://gridmart.ca';
  }

  const escXml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');

  app.get("/api/inventory.xml", async (req, res) => {
    try {
      const allProducts = await storage.getAllProducts();
      const productsWithCode = allProducts.filter((p: any) => !!p.productCode && !p.deletedAt);
      const baseUrl = getFeedBaseUrl(req);
      const { slugify } = await import('../shared/slugify');
      const entries: string[] = [];

      for (const product of productsWithCode) {
        const inventoryRows = await storage.getInventoryByProduct(product.id);
        const totalQty = inventoryRows.reduce((sum, i) => sum + i.quantity, 0);
        const availability = totalQty > 0 ? 'in stock' : 'out of stock';
        const price = `${product.price} CAD`;
        const { productLink, imageLink, additionalImages, description, condition } = getProductFeedData(product, baseUrl, slugify);
        const brand = inferBrand(product);

        entries.push(`  <entry>
    <g:id>${escXml(product.productCode!)}</g:id>
    <g:title>${escXml(product.name.slice(0, 150))}</g:title>
    <g:description>${escXml(description)}</g:description>
    <g:availability>${availability}</g:availability>
    <g:condition>${condition}</g:condition>
    <g:price>${escXml(price)}</g:price>
    <g:link>${escXml(productLink)}</g:link>
    <g:image_link>${escXml(imageLink)}</g:image_link>${additionalImages.map((img: string) => `
    <g:additional_image_link>${escXml(img)}</g:additional_image_link>`).join('')}${brand ? `
    <g:brand>${escXml(brand)}</g:brand>` : ''}
    <g:quantity>${totalQty}</g:quantity>${product.category ? `
    <g:product_type>${escXml(product.category)}</g:product_type>` : ''}
  </entry>`);
      }

      const xml = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom" xmlns:g="http://base.google.com/ns/1.0">
  <title>Product Inventory</title>
  <updated>${new Date().toISOString()}</updated>
${entries.join('\n')}
</feed>`;

      res.set('Content-Type', 'application/xml; charset=utf-8');
      res.send(xml);
    } catch (error: any) {
      res.status(500).set('Content-Type', 'application/xml').send(`<?xml version="1.0"?><error>${error.message}</error>`);
    }
  });

  app.get("/api/fb-inventory.xml", async (req, res) => {
    try {
      const allProducts = await storage.getAllProducts();
      const productsWithCode = allProducts.filter((p: any) => !!p.productCode && !p.deletedAt);
      const baseUrl = getFeedBaseUrl(req);
      const { slugify } = await import('../shared/slugify');
      const items: string[] = [];

      for (const product of productsWithCode) {
        const inventoryRows = await storage.getInventoryByProduct(product.id);
        const totalQty = inventoryRows.reduce((sum, i) => sum + i.quantity, 0);
        const availability = totalQty > 0 ? 'in stock' : 'out of stock';
        const price = `${product.price} CAD`;
        const { productLink, imageLink, additionalImages, description, condition } = getProductFeedData(product, baseUrl, slugify);
        const brand = inferBrand(product);

        items.push(`    <item>
      <g:id>${escXml(product.productCode!)}</g:id>
      <g:title>${escXml(product.name.slice(0, 150))}</g:title>
      <g:description>${escXml(description)}</g:description>
      <g:availability>${availability}</g:availability>
      <g:condition>${condition}</g:condition>
      <g:price>${escXml(price)}</g:price>
      <g:link>${escXml(productLink)}</g:link>
      <g:image_link>${escXml(imageLink)}</g:image_link>${additionalImages.map((img: string) => `
      <g:additional_image_link>${escXml(img)}</g:additional_image_link>`).join('')}${brand ? `
      <g:brand>${escXml(brand)}</g:brand>` : ''}
      <g:quantity_to_sell_on_facebook>${totalQty}</g:quantity_to_sell_on_facebook>
      <g:inventory>${totalQty}</g:inventory>${product.category ? `
      <g:google_product_category>${escXml(product.category)}</g:google_product_category>
      <g:product_type>${escXml(product.category)}</g:product_type>` : ''}
    </item>`);
      }

      const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">
  <channel>
    <title>GridMart Product Catalog</title>
    <link>${escXml(baseUrl)}</link>
    <description>GridMart product feed for Facebook Commerce</description>
${items.join('\n')}
  </channel>
</rss>`;

      res.set('Content-Type', 'application/xml; charset=utf-8');
      res.send(xml);
    } catch (error: any) {
      res.status(500).set('Content-Type', 'application/xml').send(`<?xml version="1.0"?><error>${error.message}</error>`);
    }
  });

  app.get("/api/local-inventory.xml", async (_req, res) => {
    try {
      const { xml } = await generateLocalInventoryXml();
      res.set('Content-Type', 'application/xml; charset=utf-8');
      res.send(xml);
    } catch (error: any) {
      res.status(500).set('Content-Type', 'application/xml').send(`<?xml version="1.0"?><error>${error.message}</error>`);
    }
  });

  app.post("/api/google-merchant/local-inventory/sync-xml", async (req, res) => {
    try {
      if (!req.session.userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const user = await storage.getUser(req.session.userId);
      if (user?.type !== 'admin') {
        return res.status(403).json({ error: "Admin access required" });
      }

      const { totalRows, productCount, nodeCount } = await generateLocalInventoryXml();

      res.json({
        success: true,
        message: `Local inventory XML ready: ${totalRows} entries (${productCount} products across ${nodeCount} nodes)`,
        totalRows,
        products: productCount,
        nodes: nodeCount,
        xmlUrl: '/api/local-inventory.xml',
      });
    } catch (error: any) {
      console.error("Local inventory XML generation error:", error);
      res.status(500).json({ error: error.message || "Failed to generate inventory XML" });
    }
  });

  const LOCAL_INVENTORY_SHEET_ID = '1Eji7CTGNEk4ahd37WL9ztpkTfyrbS2Vd-5Yyrd3j3aQ';

  app.post("/api/google-merchant/local-inventory/sync-sheet", async (req, res) => {
    try {
      if (!req.session.userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const user = await storage.getUser(req.session.userId);
      if (user?.type !== 'admin') {
        return res.status(403).json({ error: "Admin access required" });
      }

      const globalStoreCode = await storage.getAdminSetting('google_store_code');
      if (!globalStoreCode) {
        return res.status(400).json({ error: "Google store code not configured. Set it in the Google Merchant section." });
      }

      const allProducts = await storage.getAllProducts();
      const productsWithCode = allProducts.filter((p: any) => !!p.productCode && !p.deletedAt);
      const allNodes = await storage.getAllNodes();
      const activeNodes = allNodes.filter((n: any) => n.status === 'active');
      const nodeMap = new Map(activeNodes.map(n => [n.id, n]));

      const allAssignments = await storage.getAllCrateAssignments();
      const activeAssignments = allAssignments.filter(a => a.status === 'active');

      const productNodeMap = new Map<string, Set<string>>();
      for (const assignment of activeAssignments) {
        const crateItems = await storage.getCrateItems(assignment.crateId);
        for (const item of crateItems) {
          if (!productNodeMap.has(item.productId)) {
            productNodeMap.set(item.productId, new Set());
          }
          productNodeMap.get(item.productId)!.add(assignment.nodeId);
        }
      }

      const header = ['id', 'store_code', 'availability', 'price', 'quantity', 'pickup_sla', 'instore_product_location'];
      const rows: string[][] = [header];
      let nodeCount = new Set<string>();

      for (const product of productsWithCode) {
        const assignedNodeIds = productNodeMap.get(product.id);
        if (!assignedNodeIds || assignedNodeIds.size === 0) continue;

        const inventoryRows = await storage.getInventoryByProduct(product.id);

        for (const nodeId of assignedNodeIds) {
          const node = nodeMap.get(nodeId);
          if (!node) continue;
          nodeCount.add(nodeId);

          const inv = inventoryRows.find(i => i.nodeId === nodeId);
          const qty = inv ? inv.quantity : (product.sheetQuantity || 0);
          const availability = qty > 0 ? 'in_stock' : 'out_of_stock';
          const price = `${product.price} CAD`;

          rows.push([
            product.productCode!,
            globalStoreCode,
            availability,
            price,
            String(qty),
            'same day',
            node.name,
          ]);
        }
      }

      const { clearAndWriteSheet } = await import('./services/googleSheets');
      await clearAndWriteSheet(LOCAL_INVENTORY_SHEET_ID, 'Sheet1', rows);

      res.json({
        success: true,
        message: `Synced ${rows.length - 1} inventory rows (${productsWithCode.length} products across ${nodeCount.size} nodes) to Google Sheet`,
        totalRows: rows.length - 1,
        products: productsWithCode.length,
        nodes: nodeCount.size,
      });
    } catch (error: any) {
      console.error("Google Sheets local inventory sync error:", error);
      res.status(500).json({ error: error.message || "Failed to sync inventory to Google Sheet" });
    }
  });

  // ======== SURVEYS (generalized) ========

  // Public: get survey by ID with options
  app.get("/api/surveys/:id/public", async (req, res) => {
    try {
      const [survey] = await db.select().from(surveys).where(eq(surveys.id, req.params.id));
      if (!survey || !survey.active) return res.status(404).json({ error: "Survey not found" });
      const options = await db.select().from(surveyOptions)
        .where(eq(surveyOptions.surveyId, req.params.id))
        .orderBy(asc(surveyOptions.sortOrder));
      res.json({ survey, options: options.filter(o => o.active) });
    } catch (error) {
      console.error("Get public survey error:", error);
      res.status(500).json({ error: "Failed to get survey" });
    }
  });

  // Public: submit survey response
  app.post("/api/surveys/:id/respond", async (req, res) => {
    try {
      const [survey] = await db.select().from(surveys).where(eq(surveys.id, req.params.id));
      if (!survey || !survey.active) return res.status(404).json({ error: "Survey not found" });
      const { reasons, comment } = req.body;
      if (!reasons || !Array.isArray(reasons) || reasons.length === 0) {
        return res.status(400).json({ error: "At least one reason is required" });
      }
      const [response] = await db.insert(surveyResponses).values({
        surveyId: req.params.id,
        reasons,
        comment: comment || null,
      }).returning();
      res.json({ success: true, id: response.id });

      // Notify admin(s) via email about new survey response
      try {
        if (process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD) {
          const adminEmails = await getNotificationRecipients('notifEmail_surveyResponse');
          if (adminEmails.length > 0) {
            const reasonsList = reasons.map((r: string) => `<li style="padding:4px 0;">${escapeHtml(r)}</li>`).join('');
            const commentHtml = comment ? `<p style="margin-top:12px;color:#374151;"><strong>Comment:</strong> <em>"${escapeHtml(comment)}"</em></p>` : '';
            await gmailTransporter.sendMail({
              from: `"GridMart" <${process.env.GMAIL_USER}>`,
              to: adminEmails.join(','),
              subject: `New Survey Response: ${survey.title}`,
              html: `
                <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:20px;">
                  <h2 style="color:#0d9488;margin-bottom:8px;">New Survey Response</h2>
                  <p style="color:#6b7280;margin-bottom:16px;">Someone completed the <strong>${escapeHtml(survey.title)}</strong> survey.</p>
                  <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:16px;">
                    <p style="font-weight:600;margin-bottom:8px;">Selected reasons:</p>
                    <ul style="margin:0;padding-left:20px;color:#374151;">${reasonsList}</ul>
                    ${commentHtml}
                  </div>
                  <p style="color:#9ca3af;font-size:12px;margin-top:16px;">Submitted ${new Date().toLocaleString()}</p>
                </div>
              `,
            });
            console.log(`[EMAIL] Survey response notification sent to ${adminEmails.length} admin(s)`);
          }
        }
      } catch (emailErr) {
        console.error("[EMAIL] Failed to send survey response notification:", emailErr);
      }
    } catch (error) {
      console.error("Submit survey response error:", error);
      res.status(500).json({ error: "Failed to submit response" });
    }
  });

  // Legacy: keep old dropout-survey POST working
  app.post("/api/dropout-survey", async (req, res) => {
    try {
      const parsed = insertDropoutSurveySchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid survey data" });
      }
      const [survey] = await db.insert(dropoutSurveys).values(parsed.data).returning();
      res.json({ success: true, id: survey.id });
    } catch (error) {
      console.error("Dropout survey submit error:", error);
      res.status(500).json({ error: "Failed to submit survey" });
    }
  });

  // Admin: list all surveys
  app.get("/api/admin/surveys", async (req, res) => {
    try {
      if (!req.session?.userId) return res.status(401).json({ error: "Not authenticated" });
      const user = await storage.getUser(req.session.userId);
      if (!user || user.type !== 'admin') return res.status(403).json({ error: "Admin access required" });
      const allSurveys = await db.select().from(surveys).orderBy(desc(surveys.createdAt));
      const allOptions = await db.select().from(surveyOptions).orderBy(asc(surveyOptions.sortOrder));
      const allResponses = await db.select().from(surveyResponses).orderBy(desc(surveyResponses.createdAt));
      const surveysWithData = allSurveys.map(s => ({
        ...s,
        options: allOptions.filter(o => o.surveyId === s.id),
        responses: allResponses.filter(r => r.surveyId === s.id),
      }));
      res.json(surveysWithData);
    } catch (error) {
      console.error("Get admin surveys error:", error);
      res.status(500).json({ error: "Failed to get surveys" });
    }
  });

  // Admin: create survey
  app.post("/api/admin/surveys", async (req, res) => {
    try {
      if (!req.session?.userId) return res.status(401).json({ error: "Not authenticated" });
      const user = await storage.getUser(req.session.userId);
      if (!user || user.type !== 'admin') return res.status(403).json({ error: "Admin access required" });
      const { title, description, allowMultiple } = req.body;
      if (!title || typeof title !== 'string' || !title.trim()) {
        return res.status(400).json({ error: "Title is required" });
      }
      const [survey] = await db.insert(surveys).values({
        title: title.trim(),
        description: description?.trim() || null,
        allowMultiple: allowMultiple !== false,
      }).returning();
      res.json(survey);
    } catch (error) {
      console.error("Create survey error:", error);
      res.status(500).json({ error: "Failed to create survey" });
    }
  });

  // Admin: update survey
  app.patch("/api/admin/surveys/:id", async (req, res) => {
    try {
      if (!req.session?.userId) return res.status(401).json({ error: "Not authenticated" });
      const user = await storage.getUser(req.session.userId);
      if (!user || user.type !== 'admin') return res.status(403).json({ error: "Admin access required" });
      const { title, description, allowMultiple, active } = req.body;
      const updates: any = {};
      if (title !== undefined) updates.title = title.trim();
      if (description !== undefined) updates.description = description?.trim() || null;
      if (allowMultiple !== undefined) updates.allowMultiple = allowMultiple;
      if (active !== undefined) updates.active = active;
      const [survey] = await db.update(surveys)
        .set(updates)
        .where(eq(surveys.id, req.params.id))
        .returning();
      if (!survey) return res.status(404).json({ error: "Survey not found" });
      res.json(survey);
    } catch (error) {
      console.error("Update survey error:", error);
      res.status(500).json({ error: "Failed to update survey" });
    }
  });

  // Admin: delete survey
  app.delete("/api/admin/surveys/:id", async (req, res) => {
    try {
      if (!req.session?.userId) return res.status(401).json({ error: "Not authenticated" });
      const user = await storage.getUser(req.session.userId);
      if (!user || user.type !== 'admin') return res.status(403).json({ error: "Admin access required" });
      const [deleted] = await db.delete(surveys)
        .where(eq(surveys.id, req.params.id))
        .returning();
      if (!deleted) return res.status(404).json({ error: "Survey not found" });
      res.json({ success: true });
    } catch (error) {
      console.error("Delete survey error:", error);
      res.status(500).json({ error: "Failed to delete survey" });
    }
  });

  // Admin: add option to survey
  app.post("/api/admin/surveys/:surveyId/options", async (req, res) => {
    try {
      if (!req.session?.userId) return res.status(401).json({ error: "Not authenticated" });
      const user = await storage.getUser(req.session.userId);
      if (!user || user.type !== 'admin') return res.status(403).json({ error: "Admin access required" });
      const { label } = req.body;
      if (!label || typeof label !== 'string' || !label.trim()) {
        return res.status(400).json({ error: "Label is required" });
      }
      const maxOrder = await db.select({ max: sql<number>`COALESCE(MAX(sort_order), 0)` })
        .from(surveyOptions)
        .where(eq(surveyOptions.surveyId, req.params.surveyId));
      const [option] = await db.insert(surveyOptions).values({
        surveyId: req.params.surveyId,
        label: label.trim(),
        sortOrder: (maxOrder[0]?.max || 0) + 1,
      }).returning();
      res.json(option);
    } catch (error) {
      console.error("Create survey option error:", error);
      res.status(500).json({ error: "Failed to create option" });
    }
  });

  // Admin: update survey option
  app.patch("/api/admin/survey-options/:id", async (req, res) => {
    try {
      if (!req.session?.userId) return res.status(401).json({ error: "Not authenticated" });
      const user = await storage.getUser(req.session.userId);
      if (!user || user.type !== 'admin') return res.status(403).json({ error: "Admin access required" });
      const { label, sortOrder, active } = req.body;
      const updates: any = {};
      if (label !== undefined) updates.label = label.trim();
      if (sortOrder !== undefined) updates.sortOrder = sortOrder;
      if (active !== undefined) updates.active = active;
      const [option] = await db.update(surveyOptions)
        .set(updates)
        .where(eq(surveyOptions.id, req.params.id))
        .returning();
      if (!option) return res.status(404).json({ error: "Option not found" });
      res.json(option);
    } catch (error) {
      console.error("Update survey option error:", error);
      res.status(500).json({ error: "Failed to update option" });
    }
  });

  // Admin: delete survey option
  app.delete("/api/admin/survey-options/:id", async (req, res) => {
    try {
      if (!req.session?.userId) return res.status(401).json({ error: "Not authenticated" });
      const user = await storage.getUser(req.session.userId);
      if (!user || user.type !== 'admin') return res.status(403).json({ error: "Admin access required" });
      const [deleted] = await db.delete(surveyOptions)
        .where(eq(surveyOptions.id, req.params.id))
        .returning();
      if (!deleted) return res.status(404).json({ error: "Option not found" });
      res.json({ success: true });
    } catch (error) {
      console.error("Delete survey option error:", error);
      res.status(500).json({ error: "Failed to delete option" });
    }
  });

  // Comprehensive inventory reconciliation from crate assignments
  app.post("/api/admin/fix-inventory-retroactive", async (req, res) => {
    try {
      if (!req.session?.userId) return res.status(401).json({ error: "Unauthorized" });
      const user = await storage.getUser(req.session.userId);
      if (!user || user.type !== 'admin') return res.status(403).json({ error: "Admin only" });

      const allAssignments = await storage.getAllCrateAssignments();
      const activeAssignments = allAssignments.filter(a => a.status === 'active');
      
      // Step 1: Ensure all products in active assignments have quantity overrides set
      // (so they aren't re-inflated from raw crate item quantities)
      for (const assignment of activeAssignments) {
        const items = await storage.getCrateItems(assignment.crateId);
        const overrides = (assignment.quantityOverrides as Record<string, { quantity: number; originalQuantity: number }>) || {};
        let changed = false;
        
        for (const item of items) {
          if (!overrides[item.productId]) {
            overrides[item.productId] = { quantity: item.quantity, originalQuantity: item.quantity };
            changed = true;
          }
        }
        
        if (changed) {
          await storage.updateCrateAssignmentQuantityOverrides(assignment.id, overrides);
        }
      }
      
      // Step 2: Subtract sold quantities (from non-cancelled orders) from assignment overrides
      const soldResult = await db.execute(sql`
        SELECT oi.product_id, o.node_id, SUM(oi.quantity)::int as total_sold
        FROM order_items oi
        JOIN orders o ON oi.order_id = o.id
        WHERE o.status IN ('confirmed', 'ready', 'ready_for_pickup', 'picked_up', 'completed')
          AND o.node_id IS NOT NULL
        GROUP BY oi.product_id, o.node_id
      `);
      
      for (const row of soldResult.rows as any[]) {
        const { product_id, node_id, total_sold } = row;
        const sold = parseInt(total_sold);
        if (sold > 0) {
          await adjustCrateAssignmentQuantities(node_id, product_id, -sold);
        }
      }
      
      // Step 3: Sync all node inventories from the adjusted assignment overrides
      const uniqueNodeIds = new Set(activeAssignments.map(a => a.nodeId));
      for (const nodeId of uniqueNodeIds) {
        await syncCrateInventoryToNode(nodeId);
      }
      
      // Gather results for response
      const fixes: { nodeId: string; productId: string; quantity: number }[] = [];
      for (const nodeId of uniqueNodeIds) {
        const nodeInv = await storage.getInventoryByNode(nodeId);
        for (const inv of nodeInv) {
          fixes.push({ nodeId, productId: inv.productId, quantity: parseInt(inv.quantity.toString()) });
        }
      }

      console.log(`Retroactive inventory fix applied: ${fixes.length} inventory records reconciled`);
      res.json({ success: true, fixes });
    } catch (error) {
      console.error("Retroactive inventory fix error:", error);
      res.status(500).json({ error: "Failed to fix inventory" });
    }
  });

  // === Social Media Tracker Routes ===
  app.get('/api/social-fb-accounts', async (_req, res) => {
    try {
      const accounts = await storage.getSocialFbAccounts();
      res.json(accounts);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch FB accounts' });
    }
  });

  app.post('/api/social-fb-accounts', async (req, res) => {
    try {
      const account = await storage.createSocialFbAccount(req.body);
      res.json(account);
    } catch (error) {
      res.status(500).json({ error: 'Failed to create FB account' });
    }
  });

  app.patch('/api/social-fb-accounts/:id', async (req, res) => {
    try {
      const updated = await storage.updateSocialFbAccount(req.params.id, req.body);
      if (!updated) return res.status(404).json({ error: 'Account not found' });
      res.json(updated);
    } catch (error) {
      res.status(500).json({ error: 'Failed to update FB account' });
    }
  });

  app.delete('/api/social-fb-accounts/:id', async (req, res) => {
    try {
      await storage.deleteSocialFbAccount(req.params.id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: 'Failed to delete FB account' });
    }
  });

  app.get('/api/social-categories', async (_req, res) => {
    try {
      const cats = await storage.getSocialCategories();
      res.json(cats);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch social categories' });
    }
  });

  app.post('/api/social-categories', async (req, res) => {
    try {
      const cat = await storage.createSocialCategory(req.body);
      res.json(cat);
    } catch (error) {
      res.status(500).json({ error: 'Failed to create social category' });
    }
  });

  app.patch('/api/social-categories/:id', async (req, res) => {
    try {
      const updated = await storage.updateSocialCategory(req.params.id, req.body);
      if (!updated) return res.status(404).json({ error: 'Category not found' });
      res.json(updated);
    } catch (error) {
      res.status(500).json({ error: 'Failed to update social category' });
    }
  });

  app.delete('/api/social-categories/:id', async (req, res) => {
    try {
      await storage.deleteSocialCategory(req.params.id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: 'Failed to delete social category' });
    }
  });

  app.get('/api/social-groups', async (_req, res) => {
    try {
      const groups = await storage.getSocialGroups();
      res.json(groups);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch social groups' });
    }
  });

  app.post('/api/social-groups', async (req, res) => {
    try {
      const group = await storage.createSocialGroup(req.body);
      res.json(group);
    } catch (error) {
      res.status(500).json({ error: 'Failed to create social group' });
    }
  });

  app.patch('/api/social-groups/:id', async (req, res) => {
    try {
      const updated = await storage.updateSocialGroup(req.params.id, req.body);
      if (!updated) return res.status(404).json({ error: 'Group not found' });
      res.json(updated);
    } catch (error) {
      res.status(500).json({ error: 'Failed to update social group' });
    }
  });

  app.delete('/api/social-groups/:id', async (req, res) => {
    try {
      await storage.deleteSocialGroup(req.params.id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: 'Failed to delete social group' });
    }
  });

  app.get('/api/social-posts', async (_req, res) => {
    try {
      const posts = await storage.getSocialPosts();
      res.json(posts);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch social posts' });
    }
  });

  app.post('/api/social-posts', async (req, res) => {
    try {
      const post = await storage.createSocialPost(req.body);
      res.json(post);
    } catch (error) {
      res.status(500).json({ error: 'Failed to create social post' });
    }
  });

  app.patch('/api/social-posts/:id', async (req, res) => {
    try {
      const updated = await storage.updateSocialPost(req.params.id, req.body);
      if (!updated) return res.status(404).json({ error: 'Post not found' });
      res.json(updated);
    } catch (error) {
      res.status(500).json({ error: 'Failed to update social post' });
    }
  });

  app.delete('/api/social-posts/:id', async (req, res) => {
    try {
      await storage.deleteSocialPost(req.params.id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: 'Failed to delete social post' });
    }
  });

  return httpServer;
}
