// Live React hooks over Dexie. Each returns `undefined` while the first read is
// loading, then re-renders automatically whenever the underlying data changes.
import { useLiveQuery } from 'dexie-react-hooks';
import { getAllLogs, getLog, getPauses, getSettings } from './queries.ts';
import type { DailyLog, ISODate, Pause, Settings } from './types.ts';

/** All daily logs, oldest first. */
export function useLogs(): DailyLog[] | undefined {
  return useLiveQuery(getAllLogs, []);
}

/** One day's log: `undefined` while loading, `null` when nothing is logged. */
export function useLog(date: ISODate): DailyLog | null | undefined {
  return useLiveQuery(async () => (await getLog(date)) ?? null, [date]);
}

/** Settings with defaults filled in. */
export function useSettings(): Settings | undefined {
  return useLiveQuery(getSettings, []);
}

/** All pauses, ordered by start date. */
export function usePauses(): Pause[] | undefined {
  return useLiveQuery(getPauses, []);
}
