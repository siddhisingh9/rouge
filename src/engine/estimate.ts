// Spec §6.4 — cycle and period length estimates.
import {
  DEFAULT_CYCLE,
  DEFAULT_SIGMA,
  IRREGULAR_SIGMA,
  IRREGULAR_SKIPS,
  MIN_CYCLES_FOR_MEDIAN,
  PRIOR_WEIGHT_K,
  WINDOW,
} from './constants.ts';
import { addDays } from './dates.ts';
import type { Period } from './periods.ts';
import { median, sampleStdDev, sum } from './stats.ts';
import type { ISODate } from './types.ts';

export type EstimateMethod = 'onboarding' | 'blend' | 'median';

export interface CycleEstimate {
  length: number; // L, whole days
  sigma: number; // days
  n: number; // valid cycles used (≤ WINDOW)
  method: EstimateMethod;
}

export interface PeriodEstimate {
  length: number;
  n: number; // complete periods used (≤ WINDOW)
  method: EstimateMethod;
}

/**
 * Shared rule for both estimates: no history → the prior; 1–2 values → blend with the
 * prior weighted as K observations; ≥ 3 → median of the last WINDOW. Rounded.
 */
function estimateLength(
  values: readonly number[],
  prior: number,
): { length: number; recent: number[]; method: EstimateMethod } {
  const recent = values.slice(-WINDOW);
  const n = recent.length;
  if (n === 0) return { length: Math.round(prior), recent, method: 'onboarding' };
  if (n < MIN_CYCLES_FOR_MEDIAN) {
    const blended = (PRIOR_WEIGHT_K * prior + sum(recent)) / (PRIOR_WEIGHT_K + n);
    return { length: Math.round(blended), recent, method: 'blend' };
  }
  return { length: Math.round(median(recent)), recent, method: 'median' };
}

/** `validCycles` must be valid cycles only, in chronological order. */
export function estimateCycle(
  validCycles: ReadonlyArray<{ length: number }>,
  onboardingCycleLength: number | null,
): CycleEstimate {
  const { length, recent, method } = estimateLength(
    validCycles.map((c) => c.length),
    onboardingCycleLength ?? DEFAULT_CYCLE,
  );
  const n = recent.length;
  const sigma = n >= MIN_CYCLES_FOR_MEDIAN ? sampleStdDev(recent) : DEFAULT_SIGMA;
  return { length, sigma, n, method };
}

/** Excludes periods that may still be ongoing (end ≥ today − 1). */
export function estimatePeriodLength(
  periods: readonly Period[],
  onboardingPeriodLength: number,
  today: ISODate,
): PeriodEstimate {
  const cutoff = addDays(today, -1);
  const complete = periods.filter((p) => p.end < cutoff).map((p) => p.length);
  const { length, recent, method } = estimateLength(complete, onboardingPeriodLength);
  return { length, n: recent.length, method };
}

export function isIrregular(sigma: number, skippedInLast365: number): boolean {
  return sigma > IRREGULAR_SIGMA || skippedInLast365 >= IRREGULAR_SKIPS;
}
