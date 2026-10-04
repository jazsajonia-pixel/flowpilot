import { and, eq } from 'drizzle-orm';
import { workflows } from '../../db/schema';

/** Never query or mutate an item using its ID alone. */
export function workflowOwnerScope(workflowId: string, ownerId: string) {
  return and(eq(workflows.id, workflowId), eq(workflows.ownerId, ownerId));
}
