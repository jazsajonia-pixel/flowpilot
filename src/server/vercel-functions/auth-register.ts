import type { Config } from '@netlify/functions';
import { db } from '../../db';
import { users } from '../../db/schema';
import { hashPassword } from '../../server/auth/password';
import { isSameOriginRequest, isSecureRequest, jsonResponse, parseJsonBody } from '../../server/auth/http';
import { createUserSession, revokeUserSession } from '../../server/auth/session-store';
import { readSessionToken, serializeSessionCookie } from '../../server/auth/session-token';
import { registrationSchema } from '../../server/auth/validation';

export const config: Config = {
  path: '/api/auth/register',
  method: ['POST'],
};

function isUniqueConstraintViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === '23505';
}

export default async function register(request: Request): Promise<Response> {
  if (!isSameOriginRequest(request)) {
    return jsonResponse(403, { error: 'Cross-origin request rejected.' });
  }

  const body = await parseJsonBody(request);
  if (!body.ok) return jsonResponse(body.status, { error: body.message });

  const parsed = registrationSchema.safeParse(body.value);
  if (!parsed.success) {
    return jsonResponse(400, {
      error: 'Invalid registration details.',
      fields: parsed.error.flatten().fieldErrors,
    });
  }

  try {
    const passwordHash = await hashPassword(parsed.data.password);
    const [user] = await db
      .insert(users)
      .values({
        email: parsed.data.email,
        passwordHash,
        displayName: parsed.data.displayName || null,
      })
      .returning({ id: users.id, email: users.email, displayName: users.displayName });

    const priorToken = readSessionToken(request.headers.get('cookie'));
    if (priorToken) await revokeUserSession(priorToken);
    const token = await createUserSession(user.id);
    return jsonResponse(
      201,
      { user },
      { 'Set-Cookie': serializeSessionCookie(token, isSecureRequest(request)) },
    );
  } catch (error) {
    if (isUniqueConstraintViolation(error)) {
      return jsonResponse(409, { error: 'Unable to create an account with those details.' });
    }
    console.error('[auth.register] Authentication operation failed.');
    return jsonResponse(500, { error: 'Unable to complete the authentication request.' });
  }
}
