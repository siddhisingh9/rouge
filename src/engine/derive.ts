// The whole pipeline: logs → periods → cycles → estimates → forecast → status.
// Nothing here is stored; it is recomputed from the logs on every render (spec §1).
import { deriveCycles, skippedInLast365, type Cycle, type Onboarding } from './cycles.ts';
import {
  estimateCycle,
  estimatePeriodLength,
  isIrregular,
  type CycleEstimate,
  type PeriodEstimate,
} from './estimate.ts';
import { forecast, type PredictedCycle } from './forecast.ts';
import { derivePeriods, type Period } from './periods.ts';
import { getStatus, type Status } from './status.ts';
import type { DailyLog, ISODate, Pause } from './types.ts';

export type { Onboarding } from './cycles.ts';

export interface DeriveInput {
  logs: ReadonlyArray<Pick<DailyLog, 'date' | 'flow'>>;
  pauses: readonly Pause[];
  onboarding: Onboarding;
  today: ISODate;
}

export interface Derived {
  periods: Period[];
  cycles: Cycle[];
  validCycles: Cycle[];
  cycleEstimate: CycleEstimate;
  periodEstimate: PeriodEstimate;
  skippedInLast365: number;
  irregular: boolean;
  predictions: PredictedCycle[];
  status: Status;
}

export function derive({ logs, pauses, onboarding, today }: DeriveInput): Derived {
  const periods = derivePeriods(logs);
  const cycles = deriveCycles(periods, pauses, onboarding);
  const validCycles = cycles.filter((c) => c.status === 'valid');
  const cycleEstimate = estimateCycle(validCycles, onboarding.cycleLength);
  const periodEstimate = estimatePeriodLength(periods, onboarding.periodLength, today);
  const skipped = skippedInLast365(cycles, today);
  const irregular = isIrregular(cycleEstimate.sigma, skipped);

  const predictions = forecast({
    periods,
    estimates: {
      cycleLength: cycleEstimate.length,
      sigma: cycleEstimate.sigma,
      periodLength: periodEstimate.length,
      irregular,
    },
    pauses,
    today,
  });

  const status = getStatus({
    logs,
    periods,
    predictions,
    pauses,
    cycleLength: cycleEstimate.length,
    irregular,
    today,
  });

  return {
    periods,
    cycles,
    validCycles,
    cycleEstimate,
    periodEstimate,
    skippedInLast365: skipped,
    irregular,
    predictions,
    status,
  };
}
