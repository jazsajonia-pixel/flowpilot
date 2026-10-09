import type { Handler } from '@netlify/functions';

export const handler: Handler = async () => ({
  statusCode: 200,
  headers: {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  },
  body: JSON.stringify({
    ok: true,
    service: 'flowpilot-api',
    status: 'healthy',
  }),
});
