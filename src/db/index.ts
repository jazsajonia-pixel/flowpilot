import { drizzle } from 'drizzle-orm/node-postgres';
import { getConnectionString } from '@netlify/database';
import * as schema from './schema';

/**
 * Server-Side Drizzle Database Client
 *
 * Interacts with Netlify Database (PostgreSQL).
 * MUST remain server-side only (Netlify Functions). Never import into React UI code.
 */
let dbInstance: ReturnType<typeof drizzle<typeof schema>> | null = null;

export function getDb() {
  if (!dbInstance) {
    const connectionString = process.env.NETLIFY_DB_URL || getConnectionString();
    if (!connectionString) {
      throw new Error("Database connection string unavailable. Ensure Netlify Database is connected or NETLIFY_DB_URL is set.");
    }
    dbInstance = drizzle(connectionString, { schema });
  }
  return dbInstance;
}

export { schema };
