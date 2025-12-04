import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from "@shared/schema";

console.log('DATABASE_URL', process.env.DATABASE_URL);
if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

// Configure PostgreSQL connection pool for Azure PostgreSQL
export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Only disable SSL certificate validation in development (required for Azure PostgreSQL)
  // In production, use stricter SSL validation for better security
  ...(process.env.NODE_ENV === 'production' && {
    ssl: { rejectUnauthorized: false },
  }),
  max: 10, // Maximum number of clients in pool
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

export const db = drizzle(pool, { schema });