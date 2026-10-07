import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import * as schema from './schema';

/**
 * Server-side Drizzle client for Vercel serverless functions backed by Neon.
 * This module must remain server-side only.
 */
const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl && process.env.NODE_ENV === 'production') {
  throw new Error('DATABASE_URL is required in production.');
}

const sql = neon(databaseUrl ?? 'postgresql://localhost/flowpilot');
export const db = drizzle(sql, { schema });

export function getDb() {
  return db;
}

export { schema };
