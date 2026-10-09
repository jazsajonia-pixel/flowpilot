/** Keep final logs/status writes well below the Vercel function limit. */
export const EXECUTION_FINALIZATION_TIMEOUT_MS = 2_000;
/** Reserve a small, fresh budget for marking a run failed after persistence errors. */
export const EXECUTION_FAILURE_FINALIZATION_TIMEOUT_MS = 1_000;

export function createExecutionFinalizationSignal(): AbortSignal {
  return AbortSignal.timeout(EXECUTION_FINALIZATION_TIMEOUT_MS);
}

export function createExecutionFailureSignal(): AbortSignal {
  return AbortSignal.timeout(EXECUTION_FAILURE_FINALIZATION_TIMEOUT_MS);
}
