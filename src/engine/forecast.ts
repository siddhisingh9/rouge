// Spec §6.5 — forecast upcoming periods, ovulation and fertile windows.
import {
  HORIZON_MONTHS,
  HORIZON_MONTHS_IRREGULAR,
  LUTEAL_DAYS,
  OVULATION_SPREAD,
  POSSIBLY_SKIPPED_RATIO,
} from './constants.ts';
import { addDays, addMonths, diffDays } from './dates.ts';
import { isPausedOn } from './pauses.ts';
import { lastStartedPeriod, type Period } from './periods.ts';
import type { ISODate, Pause } from './types.ts';

export interface PredictedCycle {
  k: number; // 1 = next period
  periodStart: ISODate; // point estimate
  periodEnd: ISODate; // start + periodLength − 1
  rangeStart: ISODate; // dotted range for the start date
  rangeEnd: ISODate;
  /** periodStart − LUTEAL_DAYS. For k = 1 this is the current cycle's ovulation. */
  ovulation: ISODate;
  ovulationRangeStart: ISODate;
  ovulationRangeEnd: ISODate;
  fertileStart: ISODate; // ovulation − 5
  fertileEnd: ISODate; // ovulation + 1
  lowConfidence: boolean; // true in irregular mode
}

export interface ForecastEstimates {
  cycleLength: number; // L
  sigma: number;
  periodLength: number;
  irregular: boolean;
}

export interface ForecastInput {
  periods: readonly Period[];
  estimates: ForecastEstimates;
  pauses: readonly Pause[];
  today: ISODate;
}

export interface Lateness {
  /** Days past the predicted start (anchor + L); 0 or negative when not late. */
  daysLate: number;
  possiblySkipped: boolean;
}

/**
 * Day 1 of the current cycle: the last period start — unless a pause ended after that
 * period started, in which case the day after the pause ended. Coming off the pill (etc.)
 * starts a fresh cycle, so counting from a period before the pause would wrongly show
 * "late" or "possibly skipped" straight away. (Owner's decision; not in the spec.)
 */
export function cycleAnchor(
  periods: readonly Period[],
  pauses: readonly Pause[],
  today: ISODate,
): ISODate | undefined {
  const last = lastStartedPeriod(periods, today);
  if (!last) return undefined;
  let anchor = last.start;
  for (const p of pauses) {
    if (p.end === null || p.end >= today || p.end < last.start) continue;
    const dayAfter = addDays(p.end, 1);
    if (dayAfter > anchor) anchor = dayAfter;
  }
  return anchor;
}

/** How late the next period is relative to the cycle anchor. */
export function lateness(anchor: ISODate, cycleLength: number, today: ISODate): Lateness {
  const daysLate = diffDays(today, addDays(anchor, cycleLength));
  return {
    daysLate,
    possiblySkipped: daysLate > 0 && daysLate >= Math.round(POSSIBLY_SKIPPED_RATIO * cycleLength),
  };
}

/** ± days for the k-th predicted start: max(1, round(σ·√k)). */
export function startSpread(sigma: number, k: number): number {
  return Math.max(1, Math.round(sigma * Math.sqrt(k)));
}

export function forecast({ periods, estimates, pauses, today }: ForecastInput): PredictedCycle[] {
  if (isPausedOn(pauses, today)) return [];
  const start = cycleAnchor(periods, pauses, today);
  if (!start) return [];

  const { cycleLength: L, sigma, periodLength, irregular } = estimates;
  if (!(L >= 1)) return []; // defensive: never loop on a nonsensical length
  let anchor = start;

  // Late: k = 1 stays on its (past) date. Possibly skipped: roll the anchor forward by
  // whole cycles until the next predicted start is after today.
  if (lateness(anchor, L, today).possiblySkipped) {
    anchor = addDays(anchor, Math.floor(diffDays(today, anchor) / L) * L);
  }

  const horizonEnd = addMonths(today, irregular ? HORIZON_MONTHS_IRREGULAR : HORIZON_MONTHS);
  const predictions: PredictedCycle[] = [];
  for (let k = 1; ; k++) {
    const periodStart = addDays(anchor, k * L);
    if (k > 1 && periodStart > horizonEnd) break;

    const spread = startSpread(sigma, k);
    const ovulation = addDays(periodStart, -LUTEAL_DAYS);
    const ovulationSpread = OVULATION_SPREAD + spread;
    predictions.push({
      k,
      periodStart,
      periodEnd: addDays(periodStart, periodLength - 1),
      rangeStart: addDays(periodStart, -spread),
      rangeEnd: addDays(periodStart, spread),
      ovulation,
      ovulationRangeStart: addDays(ovulation, -ovulationSpread),
      ovulationRangeEnd: addDays(ovulation, ovulationSpread),
      fertileStart: addDays(ovulation, -5),
      fertileEnd: addDays(ovulation, 1),
      lowConfidence: irregular,
    });
  }
  return predictions;
}
