// Builders for engine tests: turn period start dates + lengths into DailyLog rows.
import { addDays } from './dates.ts';
import type { DailyLog, Flow, ISODate, Mood, Symptom } from './types.ts';

export function day(
  date: ISODate,
  fields: { flow?: Flow | null; symptoms?: Symptom[]; moods?: Mood[]; notes?: string } = {},
): DailyLog {
  return {
    date,
    flow: fields.flow ?? null,
    symptoms: fields.symptoms ?? [],
    moods: fields.moods ?? [],
    notes: fields.notes ?? '',
    updatedAt: 0,
  };
}

/** Flow logs for each period, given its start date and length in days. */
export function logsFromPeriods(
  periods: ReadonlyArray<{ start: ISODate; length: number }>,
  flow: Flow = 'medium',
): DailyLog[] {
  return periods.flatMap(({ start, length }) =>
    Array.from({ length }, (_, i) => day(addDays(start, i), { flow })),
  );
}

/** Period start dates: `first`, then each following start after the given cycle lengths. */
export function startsFromCycles(first: ISODate, cycleLengths: readonly number[]): ISODate[] {
  const starts = [first];
  for (const len of cycleLengths) starts.push(addDays(starts[starts.length - 1]!, len));
  return starts;
}

/** Flow logs for a history described by its cycle lengths. */
export function logsFromCycles(
  first: ISODate,
  cycleLengths: readonly number[],
  periodLength = 5,
): DailyLog[] {
  return logsFromPeriods(
    startsFromCycles(first, cycleLengths).map((start) => ({ start, length: periodLength })),
  );
}

/** Merge extra fields into existing day rows (or add new rows), keeping date order. */
export function withDays(logs: readonly DailyLog[], extra: readonly DailyLog[]): DailyLog[] {
  const byDate = new Map(logs.map((l) => [l.date, l]));
  for (const e of extra) {
    const base = byDate.get(e.date);
    byDate.set(e.date, base ? { ...base, ...e, flow: e.flow ?? base.flow } : e);
  }
  return [...byDate.values()].sort((a, b) => (a.date < b.date ? -1 : 1));
}
