import type { VercelRequest, VercelResponse } from '@vercel/node';
import { Readable } from 'node:stream';

type WebHandler = (request: Request, context?: { params: Record<string, string> }) => Promise<Response>;
type LegacyHandler = () => Promise<{ statusCode: number; headers?: Record<string, string>; body?: string }>;

const routeTable: Array<{ match: RegExp; load: () => Promise<{ default?: WebHandler; handler?: LegacyHandler }>; params?: (match: RegExpMatchArray) => Record<string, string> }> = [
  { match: /^\/api\/auth\/login\/?$/, load: () => import('../netlify/functions/auth-login') },
  { match: /^\/api\/auth\/register\/?$/, load: () => import('../netlify/functions/auth-register') },
  { match: /^\/api\/auth\/logout\/?$/, load: () => import('../netlify/functions/auth-logout') },
  { match: /^\/api\/auth\/session\/?$/, load: () => import('../netlify/functions/auth-session') },
  { match: /^\/api\/ai-credentials\/?$/, load: () => import('../netlify/functions/ai-credentials') },
  { match: /^\/api\/ai-credentials\/([^/]+)\/?$/, load: () => import('../netlify/functions/ai-credential'), params: (match) => ({ credentialId: match[1] }) },
  { match: /^\/api\/workflows\/?$/, load: () => import('../netlify/functions/workflows') },
  { match: /^\/api\/workflows\/([^/]+)\/graph\/?$/, load: () => import('../netlify/functions/workflow-graph'), params: (match) => ({ workflowId: match[1] }) },
  { match: /^\/api\/workflows\/([^/]+)\/executions\/?$/, load: () => import('../netlify/functions/workflow-executions'), params: (match) => ({ workflowId: match[1] }) },
  { match: /^\/api\/workflows\/([^/]+)\/?$/, load: () => import('../netlify/functions/workflow'), params: (match) => ({ workflowId: match[1] }) },
  { match: /^\/api\/hooks\/([^/]+)\/?$/, load: () => import('../netlify/functions/webhook-trigger'), params: (match) => ({ webhookToken: match[1] }) },
  { match: /^\/api\/health\/?$/, load: () => import('../netlify/functions/health') },
  { match: /^\/api\/db-health\/?$/, load: () => import('../netlify/functions/db-health') },
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
    const module = await route.load();
    if (module.handler) {
      const legacy = await module.handler();
      res.status(legacy.statusCode);
      for (const [key, value] of Object.entries(legacy.headers ?? {})) res.setHeader(key, value);
      res.end(legacy.body ?? '');
      return;
    }

    if (!module.default) {
      res.status(500).json({ error: 'Handler unavailable.' });
      return;
    }

    const body = req.method === 'GET' || req.method === 'HEAD' ? undefined : Readable.toWeb(req as never) as unknown as ReadableStream;
    const request = new Request(url, {
      method: req.method,
      headers: req.headers as HeadersInit,
      body,
      duplex: body ? 'half' : undefined,
    } as RequestInit & { duplex?: 'half' });
    const match = route.match.exec(url.pathname);
    const response = await module.default(request, { params: match && route.params ? route.params(match) : {} });
    copyHeaders(response, res);
    res.status(response.status);
    res.end(Buffer.from(await response.arrayBuffer()));
  } catch (error) {
    console.error('[vercel.dispatcher] request failed', error instanceof Error ? error.message : 'unknown');
    res.status(503).json({ error: 'Service unavailable.' });
  }
}
