// Spec §6.7 — walk-forward backtest: how accurate would our predictions have been?
import { deriveCycles, type Onboarding } from './cycles.ts';
import { addDays, diffDays } from './dates.ts';
import { derive } from './derive.ts';
import { derivePeriods } from './periods.ts';
import { mean } from './stats.ts';
import type { DailyLog, ISODate, Pause } from './types.ts';

export interface BacktestResult {
  /** error = actual − predicted, in days (positive = the period came late). */
  errors: { date: ISODate; error: number }[];
  mae: number | null; // mean absolute error; null when n = 0
  bias: number | null; // mean error; null when n = 0
  n: number;
}

export function backtest(
  logs: ReadonlyArray<Pick<DailyLog, 'date' | 'flow'>>,
  pauses: readonly Pause[],
  onboarding: Onboarding,
): BacktestResult {
  const periods = derivePeriods(logs);
  // Classification is chronological, so the full-history run classifies each gap
  // exactly as a run that stopped at that gap would.
  const cycles = deriveCycles(periods, pauses, onboarding);

  const errors: BacktestResult['errors'] = [];
  for (let i = 1; i < periods.length; i++) {
    if (cycles[i - 1]?.status !== 'valid') continue; // skipped / short / paused target

    const actual = periods[i]!.start;
    const past = logs.filter((l) => l.date < actual);
    const { predictions } = derive({ logs: past, pauses, onboarding, today: addDays(actual, -1) });
    const predicted = predictions[0];
    if (!predicted) continue;

    errors.push({ date: actual, error: diffDays(actual, predicted.periodStart) });
  }

  const n = errors.length;
  if (n === 0) return { errors, mae: null, bias: null, n };
  return {
    errors,
    mae: mean(errors.map((e) => Math.abs(e.error))),
    bias: mean(errors.map((e) => e.error)),
    n,
  };
}
