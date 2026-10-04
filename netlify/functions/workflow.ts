import type { Config, Context } from '@netlify/functions';
import { db } from '../../src/db';
import { workflows } from '../../src/db/schema';
import { isSameOriginRequest, jsonResponse, parseJsonBody } from '../../src/server/auth/http';
import { getRequestUser } from '../../src/server/auth/request-user';
import { workflowOwnerScope } from '../../src/server/workflows/ownership';
import { updateWorkflowSchema, workflowIdSchema } from '../../src/server/workflows/validation';

export const config: Config = {
  path: '/api/workflows/:workflowId',
  method: ['GET', 'PATCH', 'DELETE'],
};

const workflowFields = {
  id: workflows.id,
  title: workflows.title,
  description: workflows.description,
  isActive: workflows.isActive,
  createdAt: workflows.createdAt,
  updatedAt: workflows.updatedAt,
};

function hasDatabaseErrorCode(error: unknown, code: string): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === code;
}

export default async function workflowItem(request: Request, context: Context): Promise<Response> {
  const isMutation = request.method === 'PATCH' || request.method === 'DELETE';
  if (isMutation && !isSameOriginRequest(request)) {
    return jsonResponse(403, { error: 'Cross-origin request rejected.' });
  }

  try {
    const user = await getRequestUser(request);
    if (!user) return jsonResponse(401, { error: 'Authentication required.' });

    const idResult = workflowIdSchema.safeParse(context.params.workflowId);
    if (!idResult.success) return jsonResponse(404, { error: 'Workflow not found.' });
    const workflowId = idResult.data;
    const ownershipScope = workflowOwnerScope(workflowId, user.id);

    if (request.method === 'GET') {
      const [workflow] = await db
        .select(workflowFields)
        .from(workflows)
        .where(ownershipScope)
        .limit(1);
      return workflow
        ? jsonResponse(200, { workflow })
        : jsonResponse(404, { error: 'Workflow not found.' });
    }

    if (request.method === 'PATCH') {
      const body = await parseJsonBody(request);
      if (!body.ok) return jsonResponse(body.status, { error: body.message });
      const parsed = updateWorkflowSchema.safeParse(body.value);
      if (!parsed.success) {
        return jsonResponse(400, {
          error: 'Invalid workflow update.',
          fields: parsed.error.flatten().fieldErrors,
        });
      }

      const [workflow] = await db
        .update(workflows)
        .set({ ...parsed.data, updatedAt: new Date() })
        .where(ownershipScope)
        .returning(workflowFields);
      return workflow
        ? jsonResponse(200, { workflow })
        : jsonResponse(404, { error: 'Workflow not found.' });
    }

    if (request.method === 'DELETE') {
      const [deleted] = await db
        .delete(workflows)
        .where(ownershipScope)
        .returning({ id: workflows.id });
      return deleted
        ? jsonResponse(200, { ok: true })
        : jsonResponse(404, { error: 'Workflow not found.' });
    }

    return jsonResponse(405, { error: 'Method not allowed.' }, { Allow: 'GET, PATCH, DELETE' });
  } catch (error) {
    if (request.method === 'DELETE' && hasDatabaseErrorCode(error, '23503')) {
      return jsonResponse(409, { error: 'Workflow has dependent records and cannot be deleted.' });
    }
    console.error('[workflows.item] Workflow request failed.');
    return jsonResponse(503, { error: 'Workflow service unavailable.' });
  }
}
