import { randomBytes } from 'node:crypto';

const WEBHOOK_TOKEN_BYTES = 32;

export function createWebhookToken(): string {
  return randomBytes(WEBHOOK_TOKEN_BYTES).toString('base64url');
}
