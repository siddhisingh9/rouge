// The logging buttons. Each is one Dexie transaction; the UI re-derives via useLiveQuery.
import { patchLogs } from '../db/queries.ts';
import type { DailyLog, ISODate } from '../engine/types.ts';
import { planLogPeriod, planPeriodEnded } from './periodPlans.ts';

/** "Log period" (Today) and "Period started this day" (day editor). */
export function logPeriodStart(
  logs: readonly DailyLog[],
  start: ISODate,
  periodLength: number,
): Promise<void> {
  return patchLogs(planLogPeriod(logs, start, periodLength));
}

/** "Period ended" (Today, while in a period). */
export function endPeriod(logs: readonly DailyLog[], today: ISODate): Promise<void> {
  return patchLogs(planPeriodEnded(logs, today));
}
