const forbiddenPathSegments = new Set(['__proto__', 'prototype', 'constructor']);
const pathPattern = /^[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+|\[\d+\])*$/;
const templatePattern = /{{\s*([^{}]+?)\s*}}/g;

export interface ExecutionContext {
  trigger: Record<string, unknown>;
  steps: Record<string, unknown>;
  item?: unknown;
}

function parsePath(path: string): Array<string | number> {
  const normalized = path.trim();
  if (!pathPattern.test(normalized)) throw new Error('Template path is invalid.');
  const segments: Array<string | number> = [];
  for (const segment of normalized.split('.')) {
    const root = /^([^[]+)/.exec(segment)?.[1];
    if (root) segments.push(root);
    for (const match of segment.matchAll(/\[(\d+)\]/g)) segments.push(Number(match[1]));
  }
  if (segments.some((segment) => typeof segment === 'string' && forbiddenPathSegments.has(segment))) {
    throw new Error('Template path is invalid.');
  }
  return segments;
}

export function readExecutionPath(context: ExecutionContext, path: string): unknown {
  const segments = parsePath(path);
  let value: unknown = context;
  for (const segment of segments) {
    if (typeof segment === 'number') {
      if (!Array.isArray(value)) return undefined;
      value = value[segment];
    } else {
      if (typeof value !== 'object' || value === null || !Object.prototype.hasOwnProperty.call(value, segment)) return undefined;
      value = (value as Record<string, unknown>)[segment];
    }
  }
  return value;
}

function asTemplateText(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return JSON.stringify(value);
}

export function resolveTemplate(value: unknown, context: ExecutionContext): unknown {
  if (typeof value === 'string') {
    const fullMatch = /^{{\s*([^{}]+?)\s*}}$/.exec(value);
    if (fullMatch) return readExecutionPath(context, fullMatch[1]);
    return value.replace(templatePattern, (_match, path: string) => asTemplateText(readExecutionPath(context, path)));
  }
  if (Array.isArray(value)) return value.map((item) => resolveTemplate(item, context));
  if (typeof value === 'object' && value !== null) {
    const result = Object.create(null) as Record<string, unknown>;
    for (const [key, entry] of Object.entries(value)) result[key] = resolveTemplate(entry, context);
    return result;
  }
  return value;
}
