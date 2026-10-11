import type { Config, Context } from '@netlify/functions';
import { oauthService } from '../integrations/oauth-service';

export const config: Config = { path: '/api/integrations/oauth/:provider/callback', method: ['GET'] };

export default function integrationCallback(request: Request, context: Context): Promise<Response> {
  return oauthService.callback(request, context.params.provider ?? '');
}
