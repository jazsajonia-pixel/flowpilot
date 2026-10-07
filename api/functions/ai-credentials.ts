import type { Config } from '@netlify/functions';
import { randomUUID } from 'node:crypto';
import { count, desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../../src/db';
import { credentials, users } from '../../src/db/schema';
import { AI_PROVIDER_IDS, type AICredentialSummary, type AIProviderId } from '../../src/types/ai';
import { getRequestUser } from '../../src/server/auth/request-user';
import { isSameOriginRequest, jsonResponse, parseJsonBody } from '../../src/server/auth/http';
import { CredentialEncryptionError, encryptCredential } from '../../src/server/ai/credential-vault';

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
    const result = await db.transaction(async (tx) => {
      const [lockedOwner] = await tx.select({ id: users.id }).from(users).where(eq(users.id, user.id)).for('update');
      if (!lockedOwner) return { kind: 'unavailable' as const };
      const [credentialCount] = await tx
        .select({ count: count() })
        .from(credentials)
        .where(eq(credentials.ownerId, user.id));
      if (credentialCount && credentialCount.count >= MAX_CREDENTIALS_PER_USER) return { kind: 'limit' as const };
      const [record] = await tx
        .insert(credentials)
        .values({
          id,
          ownerId: user.id,
          provider: parsed.data.provider,
          name: parsed.data.name,
          encryptedPayload,
        })
        .returning({ id: credentials.id, provider: credentials.provider, name: credentials.name, createdAt: credentials.createdAt, updatedAt: credentials.updatedAt });
      return record ? { kind: 'saved' as const, record } : { kind: 'unavailable' as const };
    });
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
