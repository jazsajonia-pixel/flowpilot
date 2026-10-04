import { z } from 'zod';

const titleSchema = z.string().trim().min(1).max(200);
const descriptionSchema = z.string().trim().max(2_000).nullable();

export const createWorkflowSchema = z
  .object({
    title: titleSchema,
    description: descriptionSchema.optional(),
  })
  .strict();

export const updateWorkflowSchema = z
  .object({
    title: titleSchema.optional(),
    description: descriptionSchema.optional(),
  })
  .strict()
  .refine((value) => value.title !== undefined || value.description !== undefined, {
    message: 'At least one editable workflow field is required.',
  });

export const workflowIdSchema = z.string().uuid();

export type CreateWorkflowInput = z.infer<typeof createWorkflowSchema>;
export type UpdateWorkflowInput = z.infer<typeof updateWorkflowSchema>;
