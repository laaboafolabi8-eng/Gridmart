import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  connectionTimeoutMillis: 5000,
  idleTimeoutMillis: 10000,
  max: 10,
  keepAlive: true,
  keepAliveInitialDelayMillis: 5000,
});

// Prevent idle-connection drops from crashing the process.
// pg auto-reconnects on the next query; we just need to swallow the error event.
pool.on("error", (err) => {
  console.warn("[db pool] idle client error (auto-recovers):", err.message);
});

export const db = drizzle(pool);
