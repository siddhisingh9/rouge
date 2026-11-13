// The cycle ring on Today: one segment per day of the current cycle, coloured by the
// phase that day falls in (same rules as engine/status.ts). Pure, so it can be tested.
import { PMS_DAYS } from '../engine/constants.ts';
import { addDays, diffDays } from '../engine/dates.ts';
import type { PredictedCycle } from '../engine/forecast.ts';
import type { Status } from '../engine/status.ts';
import type { ISODate } from '../engine/types.ts';

export type RingPhase = 'period' | 'follicular' | 'ovulation' | 'luteal' | 'pms';

export interface RingModel {
  /** Phase of each cycle day, index 0 = day 1. */
  days: RingPhase[];
  /** 1-based; may exceed days.length when the period is late. */
  cycleDay: number;
  ovulationDay: number;
  late: boolean;
}

/** Phases that get a ring. Paused, possibly skipped and no data show a simpler card. */
const RING_PHASES = new Set<Status['phase']>([
  'period',
  'follicular',
  'ovulation',
  'luteal',
  'pms',
  'late',
]);

export function ringModel(
  status: Status,
  next: PredictedCycle | undefined,
  periodLength: number,
  today: ISODate,
): RingModel | null {
  if (!RING_PHASES.has(status.phase) || status.cycleDay === null || !next) return null;
  const { cycleDay } = status;
  const anchor = addDays(today, -(cycleDay - 1));
  // A late period keeps its predicted date, so this is still the expected cycle length.
  const total = diffDays(next.periodStart, anchor);
  if (total < 1) return null;
  const ovulationDay = diffDays(next.ovulation, anchor) + 1;
  // While the period is ongoing it may already be longer than the usual length.
  const bleed = status.phase === 'period' ? Math.max(periodLength, cycleDay) : periodLength;

  const days = Array.from({ length: total }, (_, i): RingPhase => {
    const d = i + 1;
    if (d <= bleed) return 'period';
    if (Math.abs(d - ovulationDay) <= 1) return 'ovulation';
    if (d > total - PMS_DAYS) return 'pms';
    if (d > ovulationDay + 1) return 'luteal';
    return 'follicular';
  });
  return { days, cycleDay, ovulationDay, late: status.phase === 'late' };
}
