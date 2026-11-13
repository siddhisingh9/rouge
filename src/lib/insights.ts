// Spec §7 Insights: turns engine output into the words and rows the screen shows.
// Pure (no React, no clock) so the copy rules can be tested.
import type { BacktestResult } from '../engine/backtest.ts';
import {
  BACKTEST_MIN,
  DEFAULT_CYCLE,
  IRREGULAR_SKIPS,
  MIN_CYCLES_FOR_MEDIAN,
  PATTERN_MIN_CYCLES,
} from '../engine/constants.ts';
import type { Cycle, CycleStatus } from '../engine/cycles.ts';
import type { CycleEstimate, PeriodEstimate } from '../engine/estimate.ts';
import type { Pattern } from '../engine/patterns.ts';
import { SYMPTOM_LABELS } from '../content/labels.ts';
import { days } from './format.ts';

const cycles = (n: number) => `${n} cycle${n === 1 ? '' : 's'}`;
const periods = (n: number) => `${n} period${n === 1 ? '' : 's'}`;

/** How the cycle-length estimate was worked out. */
export function cycleMethodText(est: CycleEstimate, setupAnswer: number | null): string {
  switch (est.method) {
    case 'median':
      return `Median of your last ${cycles(est.n)}.`;
    case 'blend':
      return setupAnswer === null
        ? `Your ${cycles(est.n)} so far, blended with a typical ${DEFAULT_CYCLE}-day cycle until there’s more history.`
        : `Your ${cycles(est.n)} so far, blended with your setup answer (${days(setupAnswer)}) until there’s more history.`;
    case 'onboarding':
      return setupAnswer === null
        ? `A typical ${DEFAULT_CYCLE}-day cycle for now. It updates once you’ve logged a full cycle.`
        : 'Based on your setup answer for now. It updates once you’ve logged a full cycle.';
  }
}

/** How the period-length estimate was worked out. */
export function periodMethodText(est: PeriodEstimate): string {
  switch (est.method) {
    case 'median':
      return `Median of your last ${periods(est.n)}.`;
    case 'blend':
      return `Your ${periods(est.n)} so far, blended with your setup answer.`;
    case 'onboarding':
      return 'Based on your setup answer until you’ve logged a full period.';
  }
}

export type RegularityLabel = 'not_enough' | 'regular' | 'varies' | 'irregular';

export interface Regularity {
  label: RegularityLabel;
  title: string;
  /** ± days, rounded; null until there are enough cycles to measure it. */
  spread: number | null;
  detail: string;
}

/** σ up to this many days reads as "regular". Above IRREGULAR_SIGMA it is irregular. */
export const REGULAR_SIGMA = 3;

export function regularity(
  est: CycleEstimate,
  irregular: boolean,
  skippedInLast365: number,
): Regularity {
  const measured = est.n >= MIN_CYCLES_FOR_MEDIAN;
  const spread = measured ? Math.round(est.sigma) : null;
  const skips =
    skippedInLast365 >= IRREGULAR_SKIPS ? ' Skipped periods also make them harder to predict.' : '';

  if (irregular) {
    return {
      label: 'irregular',
      title: 'Irregular',
      spread,
      detail:
        (spread !== null
          ? `Your cycle length usually varies by about ±${days(spread)}.`
          : 'Your cycles have been hard to predict.') +
        skips +
        ' Predictions are shown as rough ranges.',
    };
  }
  if (!measured) {
    const more = MIN_CYCLES_FOR_MEDIAN - est.n;
    return {
      label: 'not_enough',
      title: 'Not enough cycles yet',
      spread: null,
      detail: `Log ${more} more ${more === 1 ? 'cycle' : 'cycles'} to see how much yours vary.`,
    };
  }
  const regular = est.sigma <= REGULAR_SIGMA;
  return {
    label: regular ? 'regular' : 'varies',
    title: regular ? 'Regular' : 'Varies a little',
    spread,
    detail:
      spread === 0
        ? 'Your recent cycles have all been about the same length.'
        : `Your cycle length usually varies by about ±${days(spread!)}.` +
          (regular ? '' : ' That’s still common.'),
  };
}

export type Accuracy =
  | { available: false; checked: number; needed: number }
  | { available: true; headline: string; bias: string | null; n: number };

/** Spec §6.7 copy. Shown once at least BACKTEST_MIN periods could be checked. */
export function accuracy(result: BacktestResult): Accuracy {
  if (result.n < BACKTEST_MIN || result.mae === null || result.bias === null) {
    return { available: false, checked: result.n, needed: BACKTEST_MIN };
  }
  const within = Math.round(result.mae);
  const headline =
    within === 0
      ? 'Predictions have been spot on so far.'
      : `Predictions are usually accurate within ±${days(within)}.`;
  const b = Math.round(Math.abs(result.bias));
  const bias =
    Math.abs(result.bias) >= 1
      ? `Your period tends to come ${days(b)} ${result.bias > 0 ? 'later' : 'earlier'} than predicted.`
      : null;
  return { available: true, headline, bias, n: result.n };
}

/** "Cramps usually on days 1–2", "Headache often 2 days before your period". */
export function patternText(p: Pattern): string {
  const name = SYMPTOM_LABELS[p.symptom];
  const how = p.fraction >= 0.8 ? 'usually' : 'often';
  if (p.frame === 'after_start') {
    return p.from === p.to
      ? `${name} ${how} on day ${p.from}`
      : `${name} ${how} on days ${p.from}–${p.to}`;
  }
  if (p.from === p.to) {
    return p.from === 1
      ? `${name} ${how} the day before your period`
      : `${name} ${how} ${days(p.from)} before your period`;
  }
  return `${name} ${how} ${p.from}–${p.to} days before your period`;
}

/** "in 4 of 5 cycles" (the share includes the ±1 day tolerance). */
export function patternShare(p: Pattern, eligibleCycles: number): string {
  return `in ${Math.round(p.fraction * eligibleCycles)} of ${cycles(eligibleCycles)}`;
}

export type PatternsState = 'need_cycles' | 'need_symptoms' | 'none' | 'found';

export function patternsState(
  validCycleCount: number,
  anySymptomsLogged: boolean,
  patternCount: number,
): PatternsState {
  if (patternCount > 0) return 'found';
  if (validCycleCount < PATTERN_MIN_CYCLES) return 'need_cycles';
  if (!anySymptomsLogged) return 'need_symptoms';
  return 'none';
}

/** Spec §7: a gentle note when skipped periods happen repeatedly. */
export function showDoctorNote(skippedInLast365: number): boolean {
  return skippedInLast365 >= IRREGULAR_SKIPS;
}

export const HISTORY_LIMIT = 12;

export interface HistoryRow {
  start: Cycle['start'];
  length: number;
  status: CycleStatus;
  counted: boolean;
  /** Short tag for rows that aren't counted, e.g. "skipped", "2 skipped". */
  tag: string | null;
}

const TAGS: Record<Exclude<CycleStatus, 'valid'>, string> = {
  skipped: 'skipped',
  short: 'unusually short',
  paused: 'paused',
};

/** The last HISTORY_LIMIT cycles, most recent first. */
export function historyRows(all: readonly Cycle[]): HistoryRow[] {
  return all
    .slice(-HISTORY_LIMIT)
    .reverse()
    .map((c) => ({
      start: c.start,
      length: c.length,
      status: c.status,
      counted: c.status === 'valid',
      tag:
        c.status === 'valid'
          ? null
          : c.status === 'skipped' && c.skippedCount > 1
            ? `${c.skippedCount} skipped`
            : TAGS[c.status],
    }));
}
