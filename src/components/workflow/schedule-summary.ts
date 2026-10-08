export const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

/** Human summary of a Schedule Trigger config, or null when it is not yet complete. */
export function describeSchedule(config: Record<string, unknown>): string | null {
  if (config.frequency === 'daily') return 'Every day (UTC)';
  if (config.frequency !== 'weekly' || !Array.isArray(config.weekdays)) return null;
  const days = [...new Set(config.weekdays)]
    .filter((day): day is number => typeof day === 'number' && Number.isInteger(day) && day >= 0 && day <= 6)
    .sort((a, b) => a - b);
  return days.length > 0 ? `Weekly on ${days.map((day) => WEEKDAY_LABELS[day]).join(', ')} (UTC)` : null;
}
