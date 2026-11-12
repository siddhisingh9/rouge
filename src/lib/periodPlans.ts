// Spec §5 — what "Log period" and "Period ended" change. Pure: returns the edits to make.
import type { LogPatch } from '../db/normalize.ts';
import { addDays, isWithin } from '../engine/dates.ts';
import { derivePeriods } from '../engine/periods.ts';
import type { DailyLog, ISODate } from '../engine/types.ts';

export type DayPatch = { date: ISODate; patch: LogPatch };
type FlowLog = Pick<DailyLog, 'date' | 'flow'>;

/**
 * "Log period" / "Period started this day": fill start … start + (periodLength − 1)
 * with medium flow, but only on days that have no flow yet.
 */
export function planLogPeriod(
  logs: readonly FlowLog[],
  start: ISODate,
  periodLength: number,
): DayPatch[] {
  const hasFlow = new Set(logs.filter((l) => l.flow !== null).map((l) => l.date));
  const patches: DayPatch[] = [];
  for (let i = 0; i < Math.max(1, periodLength); i++) {
    const date = addDays(start, i);
    if (!hasFlow.has(date)) patches.push({ date, patch: { flow: 'medium' } });
  }
  return patches;
}

/**
 * "Period ended": clear flow on every day after today that belongs to the period
 * today is in. Today itself keeps its flow.
 */
export function planPeriodEnded(logs: readonly FlowLog[], today: ISODate): DayPatch[] {
  const current = derivePeriods(logs).find((p) => isWithin(today, p.start, p.end));
  if (!current) return [];
  return logs
    .filter((l) => l.flow !== null && l.date > today && l.date <= current.end)
    .map((l) => ({ date: l.date, patch: { flow: null } }));
}
