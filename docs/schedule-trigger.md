# Schedule Trigger (Phase 7)

FlowPilot can start an active workflow once per due day from a single Vercel Cron job. The design is deliberately limited to what the Vercel **Hobby** plan supports.

## Hosting constraints (Vercel Hobby)

- Hobby Cron jobs may run **at most once per day**; expressions that fire more often fail deployment.
- Hobby timing precision is **per hour**: a `0 0 * * *` job starts anywhere between **00:00 and 00:59 UTC**.
- Vercel does **not retry** a failed Cron invocation, and may occasionally deliver the same event twice.
- Vercel sends `Authorization: Bearer $CRON_SECRET` on each Cron invocation when `CRON_SECRET` is set.

References: [Cron usage and pricing](https://vercel.com/docs/cron-jobs/usage-and-pricing), [Managing Cron jobs](https://vercel.com/docs/cron-jobs/manage-cron-jobs).

Because of these limits FlowPilot offers **no time-of-day selection and no sub-daily frequency**. Do not add a more frequent Cron expression or change the Vercel plan without the maintainer's explicit approval.

## User-facing behavior

The Schedule Trigger node accepts one of two configurations:

| Config | Meaning |
|---|---|
| `{ "frequency": "daily" }` | Run every UTC day. |
| `{ "frequency": "weekly", "weekdays": [1, 3, 5] }` | Run on the selected UTC weekdays (`0` = Sunday … `6` = Saturday). |

Drafts may be saved incomplete; activation requires a complete config. Later steps can read `{{trigger.scheduledAt}}` (the UTC-midnight slot, ISO 8601) and `{{trigger.frequency}}`.

## Request flow

1. `vercel.json` registers one Cron job: `GET /api/internal/schedule-tick` at `0 0 * * *`.
2. The route is served by the bundled dispatcher (`vercel/dispatcher.ts` → `server-build/dispatcher.mjs`) like every other API route.
3. `handleScheduleTick` (`src/server/workflows/schedule-trigger-core.ts`):
   - rejects non-`GET` methods (`405`);
   - fails closed with `503` when `CRON_SECRET` is missing or shorter than 16 characters;
   - compares the bearer token in constant time (`401` on mismatch);
   - attributes the tick to the nearest UTC midnight and ignores ticks outside 23:45–01:30 UTC (`200 { skipped }`);
   - loads at most **25** active workflows that contain a Schedule Trigger and runs them with at most **5** in parallel.
4. Each run validates the saved graph, checks the schedule is due for the slot's UTC weekday, then claims the slot by inserting an `executions` row with `scheduled_at = <slot>`. The unique index `(workflow_id, scheduled_at)` makes duplicate Cron deliveries no-ops.
5. The run uses the normal execution engine (50 graph nodes, 25 executed nodes, 8-second budget) with owner-scoped AI credential resolution, and persists safe logs exactly like webhook runs.

Worst case per tick is about 25 / 5 × 8 s ≈ 40 s, inside the 60-second `maxDuration` set for the API function.

The response body contains only counts (`completed`, `failed`, `not_due`, `duplicate`, `invalid`, `error`) — no workflow IDs, inputs, or outputs.

## Capacity and activation

- Activation (`PATCH /api/workflows/:id` with `isActive: true`) requires exactly one Webhook or Schedule Trigger. For schedules it also requires a complete config and returns `409` once 25 other scheduled workflows are active across the deployment.
- Saving a graph for an active workflow re-checks activation. If the new graph could no longer be activated (for example, an incomplete schedule), the save succeeds and the workflow is deactivated; the response includes `deactivated: true`.

## Operations

- `CRON_SECRET` must be set for the **Production** environment in Vercel (random, at least 16 characters). Never commit or log it. Cron jobs run only on production deployments.
- Migration `0003_schedule_run_idempotency` adds `executions.scheduled_at` and the unique index; it must be applied to every database before deploying code that uses it.
- To trigger a tick manually for diagnosis, call the route with the bearer secret between 23:45 and 01:30 UTC; outside that window the handler intentionally does nothing.
- Missed days (a failed or skipped Cron invocation) are not back-filled.
