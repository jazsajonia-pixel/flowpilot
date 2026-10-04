const DEFAULT_MAX_BODY_BYTES = 8 * 1024;

export type ParsedJsonBody =
  | { ok: true; value: unknown }
  | { ok: false; status: 400 | 413 | 415; message: string };

export function isSameOriginRequest(request: Request): boolean {
  const origin = request.headers.get('origin');
  if (!origin) return false;

  try {
    return new URL(origin).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}

export async function parseJsonBody(
  request: Request,
  maxBytes = DEFAULT_MAX_BODY_BYTES,
): Promise<ParsedJsonBody> {
  const contentType = request.headers.get('content-type')?.split(';', 1)[0].trim().toLowerCase();
  if (contentType !== 'application/json') {
    return { ok: false, status: 415, message: 'Expected a JSON request body.' };
  }

  const contentLength = request.headers.get('content-length');
  if (contentLength && Number(contentLength) > maxBytes) {
    return { ok: false, status: 413, message: 'Request body is too large.' };
  }

  const reader = request.body?.getReader();
  if (!reader) return { ok: false, status: 400, message: 'Invalid request body.' };

  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        await reader.cancel().catch(() => undefined);
        return { ok: false, status: 413, message: 'Request body is too large.' };
      }
      chunks.push(value);
    }
  } catch {
    return { ok: false, status: 400, message: 'Invalid request body.' };
  }

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  let rawBody: string;
  try {
    rawBody = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    return { ok: true, value: JSON.parse(rawBody) as unknown };
  } catch {
    return { ok: false, status: 400, message: 'Invalid JSON request body.' };
  }
}

export function jsonResponse(
  status: number,
  payload: unknown,
  extraHeaders: Record<string, string> = {},
): Response {
  const headers = new Headers({
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    Pragma: 'no-cache',
    'X-Content-Type-Options': 'nosniff',
    ...extraHeaders,
  });
  return new Response(JSON.stringify(payload), { status, headers });
}

export function isSecureRequest(request: Request): boolean {
  try {
    return new URL(request.url).protocol === 'https:';
  } catch {
    return false;
  }
}
