import { getAuthenticatedUser, type AuthenticatedUser } from './session-store';
import { readSessionToken } from './session-token';

/** Resolve identity only from a validated, active server-side session. */
export async function getRequestUser(request: Request): Promise<AuthenticatedUser | null> {
  const token = readSessionToken(request.headers.get('cookie'));
  if (!token) return null;
  return getAuthenticatedUser(token);
}
