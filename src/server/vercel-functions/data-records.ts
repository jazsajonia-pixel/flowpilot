import { and, desc, eq, sql } from 'drizzle-orm';
import { db } from '../../db';
import { dataRecords } from '../../db/schema';
import { getRequestUser } from '../../server/auth/request-user';
import { isSameOriginRequest, jsonResponse } from '../../server/auth/http';
import { COLLECTION_NAME_PATTERN, MAX_RECORD_KEY_CHARACTERS } from '../../server/data/records';

const MAX_LISTED_RECORDS = 100;

/**
 * Owner-only view of workflow-written records.
 * GET                         -> collections with record counts
 * GET    ?collection=name      -> latest 100 records in that collection
 * DELETE ?collection=name&key=k -> delete one owned record
 */
export default async function dataRecordsHandler(request: Request): Promise<Response> {
  if (request.method !== 'GET' && request.method !== 'DELETE') {
    return jsonResponse(405, { error: 'Method not allowed.' }, { Allow: 'GET, DELETE' });
  }
  if (request.method === 'DELETE' && !isSameOriginRequest(request)) {
    return jsonResponse(403, { error: 'Cross-origin request rejected.' });
  }
  try {
    const user = await getRequestUser(request);
    if (!user) return jsonResponse(401, { error: 'Authentication required.' });
    const params = new URL(request.url).searchParams;
    const collection = params.get('collection');
    if (collection !== null && !COLLECTION_NAME_PATTERN.test(collection)) return jsonResponse(400, { error: 'Invalid collection name.' });

    if (request.method === 'DELETE') {
      const key = params.get('key');
      if (!collection || !key || key.length > MAX_RECORD_KEY_CHARACTERS) return jsonResponse(400, { error: 'Collection and key are required.' });
      const [deleted] = await db
        .delete(dataRecords)
        .where(and(eq(dataRecords.ownerId, user.id), eq(dataRecords.collection, collection), eq(dataRecords.recordKey, key)))
        .returning({ id: dataRecords.id });
      return deleted ? jsonResponse(200, { ok: true }) : jsonResponse(404, { error: 'Record not found.' });
    }

    if (!collection) {
      const collections = await db
        .select({ name: dataRecords.collection, count: sql<number>`count(*)::int`, updatedAt: sql<string>`max(${dataRecords.updatedAt})` })
        .from(dataRecords)
        .where(eq(dataRecords.ownerId, user.id))
        .groupBy(dataRecords.collection)
        .orderBy(dataRecords.collection);
      return jsonResponse(200, { collections });
    }

    const records = await db
      .select({ key: dataRecords.recordKey, data: dataRecords.data, createdAt: dataRecords.createdAt, updatedAt: dataRecords.updatedAt })
      .from(dataRecords)
      .where(and(eq(dataRecords.ownerId, user.id), eq(dataRecords.collection, collection)))
      .orderBy(desc(dataRecords.updatedAt))
      .limit(MAX_LISTED_RECORDS);
    return jsonResponse(200, { records });
  } catch {
    return jsonResponse(503, { error: 'Data record service unavailable.' });
  }
}
