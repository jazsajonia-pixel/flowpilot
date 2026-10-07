import type { Config } from '@netlify/functions';
import { randomUUID } from 'node:crypto';
import { desc, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../../db';
import { credentials, users } from '../../db/schema';
import { AI_PROVIDER_IDS, type AICredentialSummary, type AIProviderId } from '../../types/ai';
import { getRequestUser } from '../../server/auth/request-user';
import { isSameOriginRequest, jsonResponse, parseJsonBody } from '../../server/auth/http';
import { CredentialEncryptionError, encryptCredential } from '../../server/ai/credential-vault';

const MAX_CREDENTIAL_BODY_BYTES = 4 * 1024;
const MAX_CREDENTIALS_PER_USER = 10;
export const createCredentialSchema = z.object({
  provider: z.enum(AI_PROVIDER_IDS),
  name: z.string().trim().min(1).max(80),
  apiKey: z.string().trim().min(16).max(512).regex(/^\S+$/),
}).strict();

export const config: Config = {
  path: '/api/ai-credentials',
  method: ['GET', 'POST'],
};

type CredentialMetadata = {
  id: string;
  provider: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
};

export function toCredentialSummary(record: CredentialMetadata): AICredentialSummary {
  return {
    id: record.id,
    provider: record.provider as AIProviderId,
    name: record.name,
    maskedKey: '••••••••••••',
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

export default async function aiCredentials(request: Request): Promise<Response> {
  if (request.method === 'POST' && !isSameOriginRequest(request)) {
    return jsonResponse(403, { error: 'Cross-origin request rejected.' });
  }
  if (request.method !== 'GET' && request.method !== 'POST') {
    return jsonResponse(405, { error: 'Method not allowed.' }, { Allow: 'GET, POST' });
  }

  try {
    const user = await getRequestUser(request);
    if (!user) return jsonResponse(401, { error: 'Authentication required.' });

    if (request.method === 'GET') {
      const records = await db
        .select({ id: credentials.id, provider: credentials.provider, name: credentials.name, createdAt: credentials.createdAt, updatedAt: credentials.updatedAt })
        .from(credentials)
        .where(eq(credentials.ownerId, user.id))
        .orderBy(desc(credentials.updatedAt), desc(credentials.id));
      return jsonResponse(200, { credentials: records.map(toCredentialSummary) });
    }

    const body = await parseJsonBody(request, MAX_CREDENTIAL_BODY_BYTES);
    if (!body.ok) return jsonResponse(body.status, { error: body.message });
    const parsed = createCredentialSchema.safeParse(body.value);
    if (!parsed.success) return jsonResponse(400, { error: 'Credential details are invalid.' });

    const id = randomUUID();
    const encryptedPayload = encryptCredential(parsed.data.apiKey, {
      ownerId: user.id,
      credentialId: id,
      provider: parsed.data.provider,
    });
    // Single conditional INSERT: the Neon HTTP driver has no interactive transactions,
    // so the per-owner limit is enforced inside one statement instead of a locked read.
    const inserted = await db.execute<{ id: string; provider: string; name: string; created_at: string | Date; updated_at: string | Date }>(sql`
      insert into ${credentials} (id, owner_id, provider, name, encrypted_payload)
      select ${id}, ${user.id}, ${parsed.data.provider}, ${parsed.data.name}, ${encryptedPayload}
      where exists (select 1 from ${users} where ${users.id} = ${user.id})
        and (select count(*) from ${credentials} where ${credentials.ownerId} = ${user.id}) < ${MAX_CREDENTIALS_PER_USER}
      returning id, provider, name, created_at, updated_at
    `);
    const row = inserted.rows[0];
    const result = row
      ? {
        kind: 'saved' as const,
        record: { id: row.id, provider: row.provider, name: row.name, createdAt: new Date(row.created_at), updatedAt: new Date(row.updated_at) },
      }
      : { kind: 'limit' as const };
    if (result.kind === 'limit') return jsonResponse(409, { error: 'The maximum number of saved provider credentials has been reached.' });
    if (result.kind !== 'saved') return jsonResponse(503, { error: 'Credential could not be saved.' });
    return jsonResponse(201, { credential: toCredentialSummary(result.record) });
  } catch (error) {
    if (error instanceof CredentialEncryptionError) {
      return jsonResponse(503, { error: 'The credential vault is not configured.' });
    }
    return jsonResponse(503, { error: 'AI credential service unavailable.' });
  }
}
