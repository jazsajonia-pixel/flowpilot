import type { Config } from '@netlify/functions';
import { desc, eq } from 'drizzle-orm';
import { db } from '../../db';
import { workflows } from '../../db/schema';
import { isSameOriginRequest, jsonResponse, parseJsonBody } from '../../server/auth/http';
import { getRequestUser } from '../../server/auth/request-user';
import { createWorkflowSchema } from '../../server/workflows/validation';
import { createWebhookToken } from '../../server/workflows/webhook-token';

export const config: Config = {
  path: '/api/workflows',
  method: ['GET', 'POST'],
};

const workflowFields = {
  id: workflows.id,
  title: workflows.title,
  description: workflows.description,
  isActive: workflows.isActive,
  webhookToken: workflows.webhookToken,
  createdAt: workflows.createdAt,
  updatedAt: workflows.updatedAt,
};

export default async function workflowCollection(request: Request): Promise<Response> {
  if (request.method === 'POST' && !isSameOriginRequest(request)) {
    return jsonResponse(403, { error: 'Cross-origin request rejected.' });
  }

  try {
    const user = await getRequestUser(request);
    if (!user) return jsonResponse(401, { error: 'Authentication required.' });

    if (request.method === 'GET') {
      const records = await db
        .select(workflowFields)
        .from(workflows)
        .where(eq(workflows.ownerId, user.id))
        .orderBy(desc(workflows.updatedAt), desc(workflows.id));
      return jsonResponse(200, { workflows: records });
    }

    if (request.method !== 'POST') {
      return jsonResponse(405, { error: 'Method not allowed.' }, { Allow: 'GET, POST' });
    }

    const body = await parseJsonBody(request);
    if (!body.ok) return jsonResponse(body.status, { error: body.message });
    const parsed = createWorkflowSchema.safeParse(body.value);
    if (!parsed.success) {
      return jsonResponse(400, {
        error: 'Invalid workflow details.',
        fields: parsed.error.flatten().fieldErrors,
      });
    }

    const [workflow] = await db
      .insert(workflows)
      .values({
        ownerId: user.id,
        title: parsed.data.title,
        description: parsed.data.description ?? null,
        webhookToken: createWebhookToken(),
      })
      .returning(workflowFields);

    return jsonResponse(201, { workflow });
  } catch {
    console.error('[workflows.collection] Workflow request failed.');
    return jsonResponse(503, { error: 'Workflow service unavailable.' });
  }
}
