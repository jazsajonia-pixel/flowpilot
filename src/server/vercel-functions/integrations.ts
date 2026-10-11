import type { Config } from '@netlify/functions';
import { oauthService } from '../integrations/oauth-service';

export const config: Config = { path: '/api/integrations', method: ['GET'] };

export default function integrations(request: Request): Promise<Response> {
  return oauthService.list(request);
}
