import { lookup as dnsLookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { request as httpsRequest, type RequestOptions } from 'node:https';
import ipaddr from 'ipaddr.js';

const MAX_REQUEST_BYTES = 32 * 1024;
const MAX_RESPONSE_BYTES = 64 * 1024;
const MAX_URL_LENGTH = 2_048;
const privateHostSuffixes = ['.localhost', '.local', '.internal', '.test'];

export type OutboundFailureKind = 'http_status' | 'connection' | 'timeout' | 'rejected';

export class OutboundRequestError extends Error {
  /** How the request failed; `rejected` means it was blocked before or without contacting the server. */
  readonly kind: OutboundFailureKind;
  readonly status: number | null;

  constructor(message: string, options: { kind?: OutboundFailureKind; status?: number } = {}) {
    super(message);
    this.name = 'OutboundRequestError';
    this.kind = options.kind ?? 'rejected';
    this.status = options.status ?? null;
  }
}

export interface OutboundHttpResult {
  status: number;
  contentType: string | null;
  body: unknown;
  responseBytes: number;
}

export type ResolvedAddress = { address: string; family: number };
export type AddressResolver = (hostname: string) => Promise<ResolvedAddress[]>;

const resolveAddresses: AddressResolver = async (hostname) => dnsLookup(hostname, { all: true, order: 'verbatim' });

export function isPublicUnicastAddress(address: string): boolean {
  try {
    return ipaddr.isValid(address) && ipaddr.process(address).range() === 'unicast';
  } catch {
    return false;
  }
}

export function validateOutboundUrl(input: string): URL {
  if (input.length === 0 || input.length > MAX_URL_LENGTH) {
    throw new OutboundRequestError('Outbound URL is missing or too long.');
  }

  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new OutboundRequestError('Outbound URL is invalid.');
  }

  const hostname = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (
    url.protocol !== 'https:' ||
    url.username !== '' ||
    url.password !== '' ||
    (url.port !== '' && url.port !== '443') ||
    hostname === '' ||
    hostname === 'localhost' ||
    privateHostSuffixes.some((suffix) => hostname.endsWith(suffix))
  ) {
    throw new OutboundRequestError('Only public HTTPS destinations on port 443 are allowed.');
  }

  if (isIP(hostname) && !isPublicUnicastAddress(hostname)) {
    throw new OutboundRequestError('Only public HTTPS destinations on port 443 are allowed.');
  }
  return url;
}

async function resolvePinnedAddress(url: URL, resolver: AddressResolver, timeoutMs: number): Promise<ResolvedAddress> {
  const hostname = url.hostname.replace(/^\[|\]$/g, '');
  const addresses = isIP(hostname)
    ? [{ address: hostname, family: isIP(hostname) }]
    : await new Promise<ResolvedAddress[]>((resolve, reject) => {
        const timer = setTimeout(() => reject(new OutboundRequestError('DNS resolution timed out.')), timeoutMs);
        resolver(hostname).then(
          (result) => { clearTimeout(timer); resolve(result); },
          () => { clearTimeout(timer); reject(new OutboundRequestError('The destination could not be resolved.')); },
        );
      });
  return assertPublicResolvedAddresses(addresses);
}

export function assertPublicResolvedAddresses(addresses: ResolvedAddress[]): ResolvedAddress {
  if (addresses.length === 0 || addresses.some(({ address }) => !isPublicUnicastAddress(address))) {
    throw new OutboundRequestError('The destination resolves to a non-public address.');
  }
  const family = isIP(addresses[0].address);
  if (!family) throw new OutboundRequestError('The destination could not be resolved.');
  return { address: addresses[0].address, family };
}

function requestPinnedHttps(
  url: URL,
  address: ResolvedAddress,
  method: string,
  body: string | undefined,
  timeoutMs: number,
): Promise<OutboundHttpResult> {
  return new Promise((resolve, reject) => {
    const hostname = url.hostname.replace(/^\[|\]$/g, '');
    const lookup: NonNullable<RequestOptions['lookup']> = (_requestedHost, options, callback) => {
      if (options.all) callback(null, [address]);
      else callback(null, address.address, address.family);
    };

    const request = httpsRequest(
      {
        protocol: 'https:',
        hostname,
        port: 443,
        path: `${url.pathname}${url.search}`,
        method,
        headers: {
          accept: 'application/json, text/plain;q=0.9, */*;q=0.1',
          ...(body === undefined ? {} : { 'content-type': 'application/json; charset=utf-8' }),
        },
        lookup,
        agent: false,
        ...(isIP(hostname) ? {} : { servername: hostname }),
        maxHeaderSize: 8 * 1024,
      },
      (response) => {
        const chunks: Buffer[] = [];
        let responseBytes = 0;
        response.on('data', (chunk: Buffer | string) => {
          const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
          responseBytes += buffer.length;
          if (responseBytes > MAX_RESPONSE_BYTES) {
            request.destroy(new OutboundRequestError('The external response exceeded the size limit.'));
            return;
          }
          chunks.push(buffer);
        });
        response.on('error', () => reject(new OutboundRequestError('The external request failed.', { kind: 'connection' })));
        response.on('end', () => {
          const status = response.statusCode ?? 0;
          if (status >= 300 && status < 400) {
            reject(new OutboundRequestError('External redirects are not followed.'));
            return;
          }
          if (status < 200 || status >= 300) {
            reject(new OutboundRequestError(`The external service returned HTTP ${status}.`, { kind: 'http_status', status }));
            return;
          }
          const text = Buffer.concat(chunks).toString('utf8');
          const contentTypeHeader = response.headers['content-type'];
          const contentType = Array.isArray(contentTypeHeader) ? contentTypeHeader[0] : contentTypeHeader ?? null;
          let parsedBody: unknown = text;
          if (contentType?.toLowerCase().includes('json') && text !== '') {
            try {
              parsedBody = JSON.parse(text);
            } catch {
              parsedBody = text;
            }
          }
          resolve({ status, contentType, body: parsedBody, responseBytes });
        });
      },
    );

    request.setTimeout(Math.max(1, timeoutMs), () => {
      request.destroy(new OutboundRequestError('The external request timed out.', { kind: 'timeout' }));
    });
    request.on('error', (error: unknown) => {
      reject(error instanceof OutboundRequestError ? error : new OutboundRequestError('The external request failed.', { kind: 'connection' }));
    });
    if (body !== undefined) {
      const bodyBuffer = Buffer.from(body, 'utf8');
      if (bodyBuffer.byteLength > MAX_REQUEST_BYTES) {
        request.destroy(new OutboundRequestError('The external request body exceeded the size limit.'));
        return;
      }
      request.write(bodyBuffer);
    }
    request.end();
  });
}

export async function sendPublicHttpsRequest(
  input: string,
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  body: string | undefined,
  timeoutMs: number,
  resolver: AddressResolver = resolveAddresses,
): Promise<OutboundHttpResult> {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new OutboundRequestError('Execution time limit reached.');
  if (body !== undefined && Buffer.byteLength(body, 'utf8') > MAX_REQUEST_BYTES) {
    throw new OutboundRequestError('The external request body exceeded the size limit.');
  }
  const url = validateOutboundUrl(input);
  const deadline = Date.now() + timeoutMs;
  const address = await resolvePinnedAddress(url, resolver, timeoutMs);
  const remainingMs = deadline - Date.now();
  if (remainingMs <= 0) throw new OutboundRequestError('The external request timed out.');
  return requestPinnedHttps(url, address, method, body, remainingMs);
}

export function outboundLimits(): { requestBytes: number; responseBytes: number; urlLength: number } {
  return { requestBytes: MAX_REQUEST_BYTES, responseBytes: MAX_RESPONSE_BYTES, urlLength: MAX_URL_LENGTH };
}
