// Spec §6.6 — where the user is in their cycle today.
import { PMS_DAYS } from './constants.ts';
import { diffDays } from './dates.ts';
import { cycleAnchor, lateness, type PredictedCycle } from './forecast.ts';
import { isPausedOn } from './pauses.ts';
import { lastStartedPeriod, type Period } from './periods.ts';
import type { DailyLog, ISODate, Pause } from './types.ts';

export type Phase =
  | 'period'
  | 'follicular'
  | 'ovulation'
  | 'luteal'
  | 'pms'
  | 'late'
  | 'possibly_skipped'
  | 'paused'
  | 'no_data';

export interface Status {
  phase: Phase;
  cycleDay: number | null; // 1 = first day of last period (or day after a pause ended)
  daysUntilNext: number | null;
  daysLate: number | null; // set only when late
  irregular: boolean;
}

export interface StatusInput {
  logs: ReadonlyArray<Pick<DailyLog, 'date' | 'flow'>>;
  periods: readonly Period[];
  predictions: readonly PredictedCycle[];
  pauses: readonly Pause[];
  cycleLength: number;
  irregular: boolean;
  today: ISODate;
}

/** Phase rules from the spec, first match wins. */
export function getStatus(input: StatusInput): Status {
  const { logs, periods, predictions, pauses, cycleLength, irregular, today } = input;
  const empty = { cycleDay: null, daysUntilNext: null, daysLate: null, irregular };

  if (isPausedOn(pauses, today)) return { phase: 'paused', ...empty };
  const last = lastStartedPeriod(periods, today);
  const anchor = cycleAnchor(periods, pauses, today);
  const next = predictions[0];
  if (!last || !anchor || !next) return { phase: 'no_data', ...empty };

  const cycleDay = diffDays(today, anchor) + 1;
  const base = { cycleDay, irregular };

  const todayHasFlow = logs.some((l) => l.date === today && l.flow !== null);
  if (todayHasFlow && today <= last.end) {
    return {
      phase: 'period',
      ...base,
      daysUntilNext: diffDays(next.periodStart, today),
      daysLate: null,
    };
  }

  const { daysLate, possiblySkipped } = lateness(anchor, cycleLength, today);
  if (possiblySkipped) {
    // Predictions have rolled forward, so there is a meaningful countdown again.
    return {
      phase: 'possibly_skipped',
      ...base,
      daysUntilNext: diffDays(next.periodStart, today),
      daysLate,
    };
  }
  if (daysLate > 0) return { phase: 'late', ...base, daysUntilNext: null, daysLate };

  const daysUntilNext = diffDays(next.periodStart, today);
  const fromOvulation = diffDays(today, next.ovulation);
  const counts = { ...base, daysUntilNext, daysLate: null };

  if (Math.abs(fromOvulation) <= 1) return { phase: 'ovulation', ...counts };
  if (daysUntilNext >= 1 && daysUntilNext <= PMS_DAYS) return { phase: 'pms', ...counts };
  if (fromOvulation > 1) return { phase: 'luteal', ...counts };
  return { phase: 'follicular', ...counts };
}
