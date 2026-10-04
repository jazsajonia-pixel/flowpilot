import { Handler } from '@netlify/functions';
import { sql } from 'drizzle-orm';
import { getDb } from '../../src/db/index';

/**
 * Netlify Function: Server-side Database Health Check Endpoint
 * Executes a minimal PostgreSQL query `SELECT 1` via Drizzle ORM and Netlify Database.
 */
export const handler: Handler = async () => {
  try {
    const db = getDb();
    await db.execute(sql`SELECT 1`);

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ok: true,
        message: "Database connection healthy",
        timestamp: new Date().toISOString(),
      }),
    };
  } catch (error) {
    // Log internal error server-side, but do not leak connection strings or secrets to client
    console.error("Database health check error:", error instanceof Error ? error.message : error);

    return {
      statusCode: 503,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ok: false,
        error: "Database connection unavailable",
      }),
    };
  }
};
