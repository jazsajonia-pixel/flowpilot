import type { Config, Context } from '@netlify/functions';
import { oauthService } from '../integrations/oauth-service';

export const config: Config = { path: '/api/integrations/:provider/:integrationId', method: ['DELETE'] };

export default function integrationAccount(request: Request, context: Context): Promise<Response> {
  return oauthService.disconnect(request, context.params.provider ?? '', context.params.integrationId ?? '');
}
