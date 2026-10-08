/**
 * Bounded owner-only email notifications for the Send Email action.
 *
 * Messages go only to the workflow owner's account email, never to a
 * user-supplied address, so public triggers cannot be used to send mail to
 * third parties. Delivery uses a fixed vendor HTTPS endpoint (Resend) with a
 * server-managed key; message content, addresses, and provider responses are
 * never logged or returned.
 */

export const MAX_EMAILS_PER_RUN = 3;
export const MAX_EMAILS_PER_OWNER_PER_DAY = 20;
export const MAX_EMAIL_SUBJECT_CHARACTERS = 200;
export const MAX_EMAIL_BODY_CHARACTERS = 10_000;
const RESEND_ENDPOINT = 'https://api.resend.com/emails';
const MAX_EMAIL_REQUEST_MS = 2_500;

export type EmailNotificationErrorMessage =
  | 'Email notifications are not configured on this server.'
  | 'The email subject and body are required.'
  | 'The email subject or body is too long.'
  | 'Email limit reached for this run.'
  | 'Daily email limit reached for this account.'
  | 'The email request timed out.'
  | 'The email provider rejected the message.';

/** Safe, fixed email errors only; never include addresses, content, or provider responses. */
export class EmailNotificationError extends Error {
  constructor(message: EmailNotificationErrorMessage) {
    super(message);
    this.name = 'EmailNotificationError';
  }
}

export interface EmailMessage {
  subject: string;
  text: string;
}

export interface EmailDelivery {
  to: string;
  subject: string;
  text: string;
  timeoutMs: number;
}

export type EmailTransport = (delivery: EmailDelivery) => Promise<void>;

/** Engine-facing sender: the engine supplies only subject/body and remaining time. */
export type OwnerEmailSender = (message: EmailMessage, remainingMs: number) => Promise<void>;

/** Remove control characters from the subject (header-injection hardening) and trim. */
export function sanitizeEmailSubject(subject: string): string {
  return subject.replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim();
}

export function validateEmailMessage(message: EmailMessage): EmailMessage {
  const subject = sanitizeEmailSubject(message.subject);
  const text = message.text.replace(/\u0000/g, '').trim();
  if (!subject || !text) throw new EmailNotificationError('The email subject and body are required.');
  if (subject.length > MAX_EMAIL_SUBJECT_CHARACTERS || text.length > MAX_EMAIL_BODY_CHARACTERS) {
    throw new EmailNotificationError('The email subject or body is too long.');
  }
  return { subject, text };
}

export interface OwnerEmailSenderOptions {
  /** Resolve the owner's account email; null disables sending. */
  loadOwnerEmail: () => Promise<string | null>;
  /** Successful sends recorded for this owner in the last 24 hours. */
  countRecentSends: () => Promise<number>;
  transport: EmailTransport;
}

/**
 * One sender per execution. Enforces the per-run cap locally and the per-owner daily cap
 * against persisted history (counted once, then tracked in memory for this run).
 */
export function createOwnerEmailSender(options: OwnerEmailSenderOptions): OwnerEmailSender {
  let sentThisRun = 0;
  let recentSends: number | null = null;
  let ownerEmail: string | null | undefined;
  return async (message, remainingMs) => {
    const valid = validateEmailMessage(message);
    if (sentThisRun >= MAX_EMAILS_PER_RUN) throw new EmailNotificationError('Email limit reached for this run.');
    recentSends ??= await options.countRecentSends();
    if (recentSends + sentThisRun >= MAX_EMAILS_PER_OWNER_PER_DAY) {
      throw new EmailNotificationError('Daily email limit reached for this account.');
    }
    if (ownerEmail === undefined) ownerEmail = await options.loadOwnerEmail();
    if (!ownerEmail) throw new EmailNotificationError('Email notifications are not configured on this server.');
    await options.transport({
      to: ownerEmail,
      subject: valid.subject,
      text: valid.text,
      timeoutMs: Math.max(1, Math.min(MAX_EMAIL_REQUEST_MS, remainingMs)),
    });
    sentThisRun += 1;
  };
}

export interface ResendTransportOptions {
  apiKey: string | undefined;
  from: string | undefined;
  fetchImpl?: typeof fetch;
}

/** Returns null when the server is not configured, so callers can fail closed. */
export function createResendTransport(options: ResendTransportOptions): EmailTransport | null {
  const apiKey = options.apiKey?.trim();
  const from = options.from?.trim();
  if (!apiKey || !from) return null;
  const fetchImpl = options.fetchImpl ?? fetch;
  return async (delivery) => {
    let response: Response;
    try {
      response = await fetchImpl(RESEND_ENDPOINT, {
        method: 'POST',
        headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
        body: JSON.stringify({ from, to: [delivery.to], subject: delivery.subject, text: delivery.text }),
        redirect: 'error',
        signal: AbortSignal.timeout(delivery.timeoutMs),
      });
    } catch (error) {
      if (error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')) {
        throw new EmailNotificationError('The email request timed out.');
      }
      throw new EmailNotificationError('The email provider rejected the message.');
    }
    // Drain without reading provider details into logs or results.
    await response.body?.cancel().catch(() => undefined);
    if (!response.ok) throw new EmailNotificationError('The email provider rejected the message.');
  };
}
