import { drizzle } from 'drizzle-orm/netlify-db';
import * as schema from './schema';

/**
 * Server-Side Drizzle Database Client
 *
 * Interacts with Netlify Database (PostgreSQL) using Netlify's native Drizzle adapter.
 * MUST remain server-side only (Netlify Functions). Never import into React UI code.
 */
export const db = drizzle({ schema });

export function getDb() {
  return db;
}

export { schema };
