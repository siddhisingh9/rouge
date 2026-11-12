// Spec §6.2 — periods are derived from daily flow logs (the one source of truth).
import { diffDays } from './dates.ts';
import type { DailyLog, ISODate } from './types.ts';

export interface Period {
  start: ISODate;
  end: ISODate;
  length: number; // diffDays(end, start) + 1
}

/** A single empty day between flow days does not split a period; two or more do. */
const MAX_STEP_WITHIN_PERIOD = 2;

export function derivePeriods(logs: ReadonlyArray<Pick<DailyLog, 'date' | 'flow'>>): Period[] {
  const flowDates = logs
    .filter((l) => l.flow !== null)
    .map((l) => l.date)
    .sort();

  const periods: Period[] = [];
  for (const date of flowDates) {
    const current = periods[periods.length - 1];
    if (current && diffDays(date, current.end) <= MAX_STEP_WITHIN_PERIOD) {
      current.end = date;
      current.length = diffDays(date, current.start) + 1;
    } else {
      periods.push({ start: date, end: date, length: 1 });
    }
  }
  return periods;
}

/** The latest period that has started on or before `today` (ignores future-dated logs). */
export function lastStartedPeriod(periods: readonly Period[], today: ISODate): Period | undefined {
  for (let i = periods.length - 1; i >= 0; i--) {
    if (periods[i]!.start <= today) return periods[i];
  }
  return undefined;
}
