// Spec §6.3 — derive the gaps between period starts and classify them.
import { MIN_CYCLE_DAYS, SHORT_RATIO, SKIP_RATIO } from './constants.ts';
import { addDays, diffDays } from './dates.ts';
import { estimateCycle } from './estimate.ts';
import { overlapsPause } from './pauses.ts';
import type { Period } from './periods.ts';
import type { ISODate, Pause } from './types.ts';

export type CycleStatus = 'valid' | 'skipped' | 'short' | 'paused';

export interface Cycle {
  start: ISODate; // period start
  nextStart: ISODate; // next period start
  length: number; // diffDays(nextStart, start)
  status: CycleStatus;
  skippedCount: number; // only non-zero for 'skipped'
}

/** The user's setup answers. */
export interface Onboarding {
  cycleLength: number | null; // null = "not sure"
  periodLength: number;
}

/**
 * Gaps are processed chronologically, and each one is judged against a baseline built
 * only from the valid cycles before it. That keeps classification honest for backtests.
 */
export function deriveCycles(
  periods: readonly Period[],
  pauses: readonly Pause[],
  onboarding: Onboarding,
): Cycle[] {
  const cycles: Cycle[] = [];
  const valid: Cycle[] = [];

  for (let i = 0; i + 1 < periods.length; i++) {
    const start = periods[i]!.start;
    const nextStart = periods[i + 1]!.start;
    const length = diffDays(nextStart, start);
    const baseline = estimateCycle(valid, onboarding.cycleLength).length;

    let status: CycleStatus = 'valid';
    let skippedCount = 0;
    if (overlapsPause(pauses, start, nextStart)) {
      status = 'paused';
    } else if (length < MIN_CYCLE_DAYS || length < SHORT_RATIO * baseline) {
      status = 'short';
    } else if (length >= SKIP_RATIO * baseline) {
      status = 'skipped';
      skippedCount = Math.max(1, Math.round(length / baseline) - 1);
    }

    const cycle: Cycle = { start, nextStart, length, status, skippedCount };
    cycles.push(cycle);
    if (status === 'valid') valid.push(cycle);
  }
  return cycles;
}

/** Number of skipped periods in gaps that ended within the last 365 days. */
export function skippedInLast365(cycles: readonly Cycle[], today: ISODate): number {
  const since = addDays(today, -365);
  return cycles
    .filter((c) => c.status === 'skipped' && c.nextStart > since)
    .reduce((total, c) => total + c.skippedCount, 0);
}
