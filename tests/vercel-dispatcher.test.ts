import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { resolveRequestUrl } from '../vercel/request-url';

const base = 'https://flowpilot.test';

test('rewritten /api/dispatch requests recover their original nested path', () => {
  assert.equal(resolveRequestUrl('/api/dispatch?__fp_path=auth/login', base).pathname, '/api/auth/login');
  assert.equal(resolveRequestUrl('/api/dispatch?__fp_path=internal%2Fschedule-tick', base).pathname, '/api/internal/schedule-tick');
  const hook = resolveRequestUrl('/api/dispatch?__fp_path=hooks/abc_DEF-123&x=1', base);
  assert.equal(hook.pathname, '/api/hooks/abc_DEF-123');
  assert.equal(hook.search, '?x=1');
  assert.equal(resolveRequestUrl('/api/dispatch?__fp_path=health', base).pathname, '/api/health');
});

test('original URLs pass through unchanged and the routing parameter is stripped', () => {
  assert.equal(resolveRequestUrl('/api/workflows/abc/graph', base).pathname, '/api/workflows/abc/graph');
  const url = resolveRequestUrl('/api/auth/login?__fp_path=evil', base);
  assert.equal(url.pathname, '/api/auth/login');
  assert.equal(url.search, '');
});

test('encoded slashes or dot segments cannot escape the /api prefix', () => {
  const url = resolveRequestUrl('/api/dispatch?__fp_path=..%2F..%2Fadmin', base);
  assert.equal(url.pathname.startsWith('/api/'), true);
});
