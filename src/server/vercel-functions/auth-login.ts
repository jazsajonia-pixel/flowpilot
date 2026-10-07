import type { Config } from '@netlify/functions';
import { eq } from 'drizzle-orm';
import { db } from '../../db';
import { users } from '../../db/schema';
import { jsonResponse, isSameOriginRequest, isSecureRequest, parseJsonBody } from '../../server/auth/http';
import { verifyPassword } from '../../server/auth/password';
import { createUserSession, revokeUserSession } from '../../server/auth/session-store';
import { readSessionToken, serializeSessionCookie } from '../../server/auth/session-token';
import { loginSchema } from '../../server/auth/validation';

export const config: Config = {
  path: '/api/auth/login',
  method: ['POST'],
};

// Fixed, non-secret verifier used only to perform equivalent scrypt work for an unknown email.
const DUMMY_PASSWORD_HASH =
  'scrypt$16384$8$5$Zmxvd3BpbG90RHVtbXkwMQ$o9JbtKC0-RqodG0KJ9ORpon5WoK6Lw8ClZi21GXjm7Y1z50BxZ_61BVNvA2NiCHkVePXQROMC40LQvogglGQ_w';

export default async function login(request: Request): Promise<Response> {
  if (!isSameOriginRequest(request)) {
    return jsonResponse(403, { error: 'Cross-origin request rejected.' });
  }

  const body = await parseJsonBody(request);
  if (!body.ok) return jsonResponse(body.status, { error: body.message });

  const parsed = loginSchema.safeParse(body.value);
  if (!parsed.success) {
    return jsonResponse(400, { error: 'Invalid email or password.' });
  }

  try {
    const [user] = await db
      .select({
        id: users.id,
        email: users.email,
        displayName: users.displayName,
        passwordHash: users.passwordHash,
      })
      .from(users)
      .where(eq(users.email, parsed.data.email))
      .limit(1);

    const candidateHash = user?.passwordHash ?? DUMMY_PASSWORD_HASH;
    const passwordIsValid = await verifyPassword(parsed.data.password, candidateHash);
    if (!user || !user.passwordHash || !passwordIsValid) {
      return jsonResponse(401, { error: 'Invalid email or password.' });
    }

    // Replace the current browser session after successful re-authentication.
    const priorToken = readSessionToken(request.headers.get('cookie'));
    if (priorToken) await revokeUserSession(priorToken);

    const token = await createUserSession(user.id);
    return jsonResponse(
      200,
      { user: { id: user.id, email: user.email, displayName: user.displayName } },
      { 'Set-Cookie': serializeSessionCookie(token, isSecureRequest(request)) },
    );
  } catch {
    console.error('[auth.login] Authentication operation failed.');
    return jsonResponse(503, { error: 'Authentication service unavailable.' });
  }
}
