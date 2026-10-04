import { and, eq, gt, isNull } from 'drizzle-orm';
import { db } from '../../db';
import { sessions, users } from '../../db/schema';
import { hashSessionToken, createSessionToken, SESSION_TTL_SECONDS } from './session-token';

export interface AuthenticatedUser {
  id: string;
  email: string;
  displayName: string | null;
}

export async function createUserSession(userId: string, now = new Date()): Promise<string> {
  const token = createSessionToken();
  const expiresAt = new Date(now.getTime() + SESSION_TTL_SECONDS * 1000);
  await db.insert(sessions).values({
    userId,
    tokenHash: hashSessionToken(token),
    expiresAt,
  });
  return token;
}

export async function getAuthenticatedUser(
  token: string,
  now = new Date(),
): Promise<AuthenticatedUser | null> {
  const [record] = await db
    .select({
      id: users.id,
      email: users.email,
      displayName: users.displayName,
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(
      and(
        eq(sessions.tokenHash, hashSessionToken(token)),
        isNull(sessions.revokedAt),
        gt(sessions.expiresAt, now),
      ),
    )
    .limit(1);

  return record ?? null;
}

export async function revokeUserSession(token: string, now = new Date()): Promise<void> {
  await db
    .update(sessions)
    .set({ revokedAt: now })
    .where(and(eq(sessions.tokenHash, hashSessionToken(token)), isNull(sessions.revokedAt)));
}
