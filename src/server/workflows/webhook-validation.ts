import { z } from 'zod';

export const webhookBodySchema = z.record(z.string(), z.unknown());
