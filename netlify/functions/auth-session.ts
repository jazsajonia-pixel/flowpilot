import type { Config } from '@netlify/functions';
import { jsonResponse, isSecureRequest } from '../../src/server/auth/http';
import { getAuthenticatedUser } from '../../src/server/auth/session-store';
import { readSessionToken, serializeClearedSessionCookie } from '../../src/server/auth/session-token';

export const config: Config = {
  path: '/api/auth/session',
  method: ['GET'],
};

export default async function getSession(request: Request): Promise<Response> {
  const token = readSessionToken(request.headers.get('cookie'));
  try {
    const user = token ? await getAuthenticatedUser(token) : null;
    const headers: Record<string, string> = user
      ? {}
      : { 'Set-Cookie': serializeClearedSessionCookie(isSecureRequest(request)) };
    return jsonResponse(200, { user }, headers);
  } catch {
    console.error('[auth.session] Session lookup failed.');
    return jsonResponse(503, { error: 'Authentication service unavailable.' });
  }
}
