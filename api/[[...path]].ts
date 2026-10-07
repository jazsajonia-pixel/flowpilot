import type { VercelRequest, VercelResponse } from '@vercel/node';
import { Readable } from 'node:stream';
import { handler as health } from '../netlify/functions/health';
import { handler as dbHealth } from '../netlify/functions/db-health';
import authLogin from '../netlify/functions/auth-login';
import authRegister from '../netlify/functions/auth-register';
import authLogout from '../netlify/functions/auth-logout';
import authSession from '../netlify/functions/auth-session';
import aiCredentials from '../netlify/functions/ai-credentials';
import aiCredential from '../netlify/functions/ai-credential';
import workflows from '../netlify/functions/workflows';
import workflow from '../netlify/functions/workflow';
import workflowGraph from '../netlify/functions/workflow-graph';
import workflowExecutions from '../netlify/functions/workflow-executions';
import webhookTrigger from '../netlify/functions/webhook-trigger';

type WebHandler = (request: Request, context?: { params: Record<string, string> }) => Promise<Response>;
type LegacyHandler = () => Promise<{ statusCode: number; headers?: Record<string, string>; body?: string }>;
type RouteModule = { default?: WebHandler; handler?: LegacyHandler };

const routeTable: Array<{ match: RegExp; module: RouteModule; params?: (match: RegExpMatchArray) => Record<string, string> }> = [
  { match: /^\/api\/auth\/login\/?$/, module: { default: authLogin } },
  { match: /^\/api\/auth\/register\/?$/, module: { default: authRegister } },
  { match: /^\/api\/auth\/logout\/?$/, module: { default: authLogout } },
  { match: /^\/api\/auth\/session\/?$/, module: { default: authSession } },
  { match: /^\/api\/ai-credentials\/?$/, module: { default: aiCredentials } },
  { match: /^\/api\/ai-credentials\/([^/]+)\/?$/, module: { default: aiCredential }, params: (match) => ({ credentialId: match[1] }) },
  { match: /^\/api\/workflows\/?$/, module: { default: workflows } },
  { match: /^\/api\/workflows\/([^/]+)\/graph\/?$/, module: { default: workflowGraph }, params: (match) => ({ workflowId: match[1] }) },
  { match: /^\/api\/workflows\/([^/]+)\/executions\/?$/, module: { default: workflowExecutions }, params: (match) => ({ workflowId: match[1] }) },
  { match: /^\/api\/workflows\/([^/]+)\/?$/, module: { default: workflow }, params: (match) => ({ workflowId: match[1] }) },
  { match: /^\/api\/hooks\/([^/]+)\/?$/, module: { default: webhookTrigger }, params: (match) => ({ webhookToken: match[1] }) },
  { match: /^\/api\/health\/?$/, module: { handler: health } },
  { match: /^\/api\/db-health\/?$/, module: { handler: dbHealth } },
];

function copyHeaders(response: Response, target: VercelResponse) {
  response.headers.forEach((value, key) => target.setHeader(key, value));
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const protocol = req.headers['x-forwarded-proto'] ?? 'https';
  const host = req.headers.host ?? 'localhost';
  const url = new URL(req.url ?? '/', `${protocol}://${host}`);
  const route = routeTable.find((candidate) => candidate.match.test(url.pathname));

  if (!route) {
    res.status(404).json({ error: 'Not found.' });
    return;
  }

  try {
    if (route.module.handler) {
      const legacy = await route.module.handler();
      res.status(legacy.statusCode);
      for (const [key, value] of Object.entries(legacy.headers ?? {})) res.setHeader(key, value);
      res.end(legacy.body ?? '');
      return;
    }

    if (!route.module.default) {
      res.status(500).json({ error: 'Handler unavailable.' });
      return;
    }

    const body = req.method === 'GET' || req.method === 'HEAD'
      ? undefined
      : Readable.toWeb(req as never) as unknown as ReadableStream;
    const request = new Request(url, {
      method: req.method,
      headers: req.headers as HeadersInit,
      body,
      duplex: body ? 'half' : undefined,
    } as RequestInit & { duplex?: 'half' });
    const match = route.match.exec(url.pathname);
    const response = await route.module.default(request, {
      params: match && route.params ? route.params(match) : {},
    });
    copyHeaders(response, res);
    res.status(response.status);
    res.end(Buffer.from(await response.arrayBuffer()));
  } catch (error) {
    console.error('[vercel.dispatcher] request failed', error instanceof Error ? error.message : 'unknown');
    res.status(503).json({ error: 'Service unavailable.' });
  }
}
