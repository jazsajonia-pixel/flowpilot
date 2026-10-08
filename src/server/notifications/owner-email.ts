import { and, eq, gt, sql } from 'drizzle-orm';
import { db } from '../../db';
import { executionLogs, executions, users, workflows } from '../../db/schema';
import { createOwnerEmailSender, createResendTransport, type OwnerEmailSender } from './email';

/**
 * Database-backed owner email sender, or undefined when RESEND_API_KEY / EMAIL_FROM are unset
 * (the engine then fails Send Email nodes closed with a fixed message).
 */
export function createOwnerEmailNotifier(ownerId: string): OwnerEmailSender | undefined {
  const transport = createResendTransport({ apiKey: process.env.RESEND_API_KEY, from: process.env.EMAIL_FROM });
  if (!transport) return undefined;
  return createOwnerEmailSender({
    transport,
    async loadOwnerEmail() {
      const [owner] = await db.select({ email: users.email }).from(users).where(eq(users.id, ownerId)).limit(1);
      return owner?.email ?? null;
    },
    async countRecentSends() {
      const [row] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(executionLogs)
        .innerJoin(executions, eq(executions.id, executionLogs.executionId))
        .innerJoin(workflows, eq(workflows.id, executions.workflowId))
        .where(and(
          eq(workflows.ownerId, ownerId),
          eq(executionLogs.status, 'success'),
          sql`${executionLogs.inputData}->>'category' = 'send_email'`,
          gt(executionLogs.timestamp, sql`now() - interval '24 hours'`),
        ));
      return row?.count ?? 0;
    },
  });
}
