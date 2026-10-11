import { getRequestUser } from '../auth/request-user';
import { hashSessionToken, readSessionToken } from '../auth/session-token';
import { oauthRepository } from './oauth-repository';
import { createOAuthService } from './oauth-core';

export const oauthService = createOAuthService({
  repository: oauthRepository,
  authenticate: async (request) => {
    const sessionToken = readSessionToken(request.headers.get('cookie'));
    if (!sessionToken) return null;
    const user = await getRequestUser(request);
    return user ? { ownerId: user.id, sessionTokenHash: hashSessionToken(sessionToken) } : null;
  },
});
