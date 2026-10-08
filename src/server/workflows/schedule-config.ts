import { z } from 'zod';

/**
 * Schedule Trigger settings for the Vercel Hobby scheduler.
 *
 * Hobby Cron jobs run at most once per day with hourly precision, so FlowPilot
 * only supports daily or weekly (selected UTC weekdays) schedules. Each run is
 * attributed to the UTC midnight "slot" of the daily tick; actual start time may
 * vary by up to 59 minutes after 00:00 UTC.
 */

export const SCHEDULE_FREQUENCIES = ['daily', 'weekly'] as const;
export type ScheduleFrequency = (typeof SCHEDULE_FREQUENCIES)[number];

/** UTC weekday numbers, matching Date#getUTCDay (0 = Sunday … 6 = Saturday). */
export const SCHEDULE_WEEKDAYS = [0, 1, 2, 3, 4, 5, 6] as const;

const weekdaySchema = z.number().int().min(0).max(6);

/** Draft schema used while editing; every field is optional so partial graphs can be saved. */
export const scheduleTriggerDraftConfigSchema = z
  .object({
    frequency: z.enum(SCHEDULE_FREQUENCIES).optional(),
    weekdays: z.array(weekdaySchema).max(7).optional(),
  })
  .strict()
  .superRefine((config, context) => {
    if (config.weekdays && new Set(config.weekdays).size !== config.weekdays.length) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: 'Weekdays must be unique.', path: ['weekdays'] });
    }
    if (config.frequency === 'daily' && config.weekdays !== undefined && config.weekdays.length > 0) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: 'Daily schedules cannot select weekdays.', path: ['weekdays'] });
    }
  });

/** Complete schema required before a scheduled workflow can be activated or executed. */
export const scheduleTriggerConfigSchema = z
  .discriminatedUnion('frequency', [
    z.object({ frequency: z.literal('daily'), weekdays: z.array(weekdaySchema).max(0).optional() }).strict(),
    z.object({ frequency: z.literal('weekly'), weekdays: z.array(weekdaySchema).min(1).max(7) }).strict(),
  ])
  .refine((config) => !config.weekdays || new Set(config.weekdays).size === config.weekdays.length, {
    message: 'Weekdays must be unique.',
    path: ['weekdays'],
  });

export type ScheduleTriggerConfig = z.infer<typeof scheduleTriggerConfigSchema>;

export function parseScheduleConfig(config: unknown): ScheduleTriggerConfig | null {
  const parsed = scheduleTriggerConfigSchema.safeParse(config);
  return parsed.success ? parsed.data : null;
}

/** Returns true when the schedule is due for the UTC day of the given slot. */
export function isScheduleDue(config: ScheduleTriggerConfig, slot: Date): boolean {
  if (config.frequency === 'daily') return true;
  return config.weekdays.includes(slot.getUTCDay());
}

/**
 * Attribute a Cron invocation to the nearest UTC midnight.
 * Hobby invocations for `0 0 * * *` arrive between 00:00 and 00:59 UTC; rounding
 * to the nearest midnight also tolerates small early clock skew.
 */
export function nearestUtcMidnight(now: Date): Date {
  const dayMs = 24 * 60 * 60 * 1000;
  return new Date(Math.round(now.getTime() / dayMs) * dayMs);
}
