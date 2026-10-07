import type { Config } from '@netlify/functions';
import { isSameOriginRequest, isSecureRequest, jsonResponse, parseJsonBody } from '../../server/auth/http';
import { revokeUserSession } from '../../server/auth/session-store';
import { readSessionToken, serializeClearedSessionCookie } from '../../server/auth/session-token';
import { logoutSchema } from '../../server/auth/validation';

export const config: Config = {
  path: '/api/auth/logout',
  method: ['POST'],
};

export default async function logout(request: Request): Promise<Response> {
  if (!isSameOriginRequest(request)) {
    return jsonResponse(403, { error: 'Cross-origin request rejected.' });
  }

  const body = await parseJsonBody(request);
  if (!body.ok) return jsonResponse(body.status, { error: body.message });
  if (!logoutSchema.safeParse(body.value).success) {
    return jsonResponse(400, { error: 'Invalid logout request.' });
  }

  const token = readSessionToken(request.headers.get('cookie'));
  try {
    if (token) await revokeUserSession(token);
    return jsonResponse(200, { ok: true }, {
      'Set-Cookie': serializeClearedSessionCookie(isSecureRequest(request)),
    });
  } catch {
    console.error('[auth.logout] Session revocation failed.');
    return jsonResponse(503, { error: 'Authentication service unavailable.' });
  }
}
