/**
 * vercel.json rewrites every /api/* request to /api/dispatch?__fp_path=<rest>, because Vercel's
 * non-Next.js file routing matches only one segment for api/[[...path]].ts. Rebuild the original
 * path from that parameter (or keep req.url when the platform already passes the original URL).
 */
export function resolveRequestUrl(rawUrl: string, base: string): URL {
  const url = new URL(rawUrl, base);
  const rewrittenPath = url.searchParams.get('__fp_path');
  url.searchParams.delete('__fp_path');
  if (rewrittenPath !== null && (url.pathname === '/api/dispatch' || url.pathname === '/api/dispatch/')) {
    const segments = rewrittenPath.split('/').filter((segment) => segment !== '' && segment !== '.' && segment !== '..').map((segment) => encodeURIComponent(segment));
    url.pathname = `/api/${segments.join('/')}`;
  }
  return url;
}
