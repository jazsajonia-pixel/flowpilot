import { and, eq, sql } from 'drizzle-orm';
import { db, getDbForSignal } from '../../db';
import { dataRecords, users } from '../../db/schema';
import { MAX_RECORDS_PER_OWNER, withRunWriteLimit, type OwnerDataStore } from './records';

/**
 * Database-backed owner data store for one execution. Every statement is scoped by owner_id,
 * and single-statement writes are used because the Neon HTTP driver has no interactive transactions.
 */
export function createOwnerDataStore(ownerId: string): OwnerDataStore {
  return withRunWriteLimit({
    async create(collection, key, data, signal) {
      const queryDb = signal ? getDbForSignal(signal) : db;
      const inserted = await queryDb.execute<{ id: string }>(sql`
        insert into ${dataRecords} (owner_id, collection, record_key, data)
        select ${ownerId}, ${collection}, ${key}, ${JSON.stringify(data)}::jsonb
        where exists (select 1 from ${users} where ${users.id} = ${ownerId})
          and (select count(*) from ${dataRecords} where ${dataRecords.ownerId} = ${ownerId}) < ${MAX_RECORDS_PER_OWNER}
        on conflict (owner_id, collection, record_key) do nothing
        returning id
      `);
      if (inserted.rows.length > 0) return 'created';
      const [existing] = await queryDb
        .select({ id: dataRecords.id })
        .from(dataRecords)
        .where(and(eq(dataRecords.ownerId, ownerId), eq(dataRecords.collection, collection), eq(dataRecords.recordKey, key)))
        .limit(1);
      return existing ? 'exists' : 'limit';
    },
    async update(collection, key, data, mode, signal) {
      const queryDb = signal ? getDbForSignal(signal) : db;
      const json = JSON.stringify(data);
      const updated = await queryDb
        .update(dataRecords)
        .set({
          data: mode === 'merge' ? sql`${dataRecords.data} || ${json}::jsonb` : sql`${json}::jsonb`,
          updatedAt: new Date(),
        })
        .where(and(eq(dataRecords.ownerId, ownerId), eq(dataRecords.collection, collection), eq(dataRecords.recordKey, key)))
        .returning({ id: dataRecords.id });
      return updated.length > 0;
    },
  });
}
