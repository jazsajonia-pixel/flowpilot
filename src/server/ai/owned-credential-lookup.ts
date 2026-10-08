import { and, eq } from 'drizzle-orm';
import { db } from '../../db';
import { credentials } from '../../db/schema';
import { isAIProviderId } from '../../types/ai';
import type { FindOwnedCredential } from './provider-resolver';

/** Load an encrypted AI credential only when it belongs to the given owner and provider. */
export const findOwnedAICredential: FindOwnedCredential = async (ownerId, credentialId, provider) => {
  const [credential] = await db
    .select({
      id: credentials.id,
      ownerId: credentials.ownerId,
      provider: credentials.provider,
      encryptedPayload: credentials.encryptedPayload,
    })
    .from(credentials)
    .where(and(
      eq(credentials.id, credentialId),
      eq(credentials.ownerId, ownerId),
      eq(credentials.provider, provider),
    ))
    .limit(1);
  if (!credential || !isAIProviderId(credential.provider)) return null;
  return { ...credential, provider: credential.provider };
};
