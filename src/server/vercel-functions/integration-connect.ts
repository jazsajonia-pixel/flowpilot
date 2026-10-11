import type { Config, Context } from '@netlify/functions';
import { oauthService } from '../integrations/oauth-service';

export const config: Config = { path: '/api/integrations/:provider/connect', method: ['POST'] };

export default function integrationConnect(request: Request, context: Context): Promise<Response> {
  return oauthService.start(request, context.params.provider ?? '');
}
