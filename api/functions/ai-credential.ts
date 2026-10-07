import type { Config, Context } from '@netlify/functions';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../../src/db';
import { credentials } from '../../src/db/schema';
import { getRequestUser } from '../../src/server/auth/request-user';
import { isSameOriginRequest, jsonResponse } from '../../src/server/auth/http';

const credentialIdSchema = z.string().uuid();

export const config: Config = {
  path: '/api/ai-credentials/:credentialId',
  method: ['DELETE'],
};

export default async function aiCredential(request: Request, context: Context): Promise<Response> {
  if (request.method !== 'DELETE') return jsonResponse(405, { error: 'Method not allowed.' }, { Allow: 'DELETE' });
  if (!isSameOriginRequest(request)) return jsonResponse(403, { error: 'Cross-origin request rejected.' });

  try {
    const user = await getRequestUser(request);
    if (!user) return jsonResponse(401, { error: 'Authentication required.' });
    const parsedId = credentialIdSchema.safeParse(context.params.credentialId);
    if (!parsedId.success) return jsonResponse(404, { error: 'Credential not found.' });

    const [deleted] = await db
      .delete(credentials)
      .where(and(eq(credentials.id, parsedId.data), eq(credentials.ownerId, user.id)))
      .returning({ id: credentials.id });
    if (!deleted) return jsonResponse(404, { error: 'Credential not found.' });
    return jsonResponse(200, { ok: true });
  } catch {
    return jsonResponse(503, { error: 'AI credential service unavailable.' });
  }
}
