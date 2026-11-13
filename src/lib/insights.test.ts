import { describe, expect, it } from 'vitest';
import { backtest } from '../engine/backtest.ts';
import { deriveCycles, type Cycle } from '../engine/cycles.ts';
import type { CycleEstimate } from '../engine/estimate.ts';
import { derivePeriods } from '../engine/periods.ts';
import type { Pattern } from '../engine/patterns.ts';
import { logsFromCycles } from '../engine/test-helpers.ts';
import {
  accuracy,
  cycleMethodText,
  historyRows,
  HISTORY_LIMIT,
  patternShare,
  patternsState,
  patternText,
  periodMethodText,
  regularity,
  showDoctorNote,
} from './insights.ts';

const est = (over: Partial<CycleEstimate> = {}): CycleEstimate => ({
  length: 28,
  sigma: 2,
  n: 6,
  method: 'median',
  ...over,
});

describe('how the estimates were computed', () => {
  it('describes each cycle method', () => {
    expect(cycleMethodText(est({ n: 5 }), 30)).toBe('Median of your last 5 cycles.');
    expect(cycleMethodText(est({ n: 1, method: 'blend' }), 30)).toMatch(
      /^Your 1 cycle so far, blended with your setup answer \(30 days\)/,
    );
    expect(cycleMethodText(est({ n: 2, method: 'blend' }), null)).toMatch(/typical 28-day/);
    expect(cycleMethodText(est({ n: 0, method: 'onboarding' }), 30)).toMatch(
      /^Based on your setup answer/,
    );
    expect(cycleMethodText(est({ n: 0, method: 'onboarding' }), null)).toMatch(
      /^A typical 28-day cycle/,
    );
  });

  it('describes each period method', () => {
    expect(periodMethodText({ length: 5, n: 3, method: 'median' })).toBe(
      'Median of your last 3 periods.',
    );
    expect(periodMethodText({ length: 5, n: 1, method: 'blend' })).toMatch(/^Your 1 period so/);
    expect(periodMethodText({ length: 5, n: 0, method: 'onboarding' })).toMatch(/setup answer/);
  });
});

describe('regularity', () => {
  it('needs 3 cycles before measuring', () => {
    const r = regularity(est({ n: 1, method: 'blend', sigma: 2 }), false, 0);
    expect(r).toMatchObject({ label: 'not_enough', spread: null });
    expect(r.detail).toBe('Log 2 more cycles to see how much yours vary.');
  });

  it('labels by σ', () => {
    expect(regularity(est({ sigma: 1.4 }), false, 0)).toMatchObject({
      label: 'regular',
      spread: 1,
    });
    expect(regularity(est({ sigma: 3 }), false, 0).label).toBe('regular');
    expect(regularity(est({ sigma: 5.2 }), false, 0)).toMatchObject({
      label: 'varies',
      spread: 5,
    });
    expect(regularity(est({ sigma: 0 }), false, 0).detail).toMatch(/all been about the same/);
  });

  it('follows the engine’s irregular flag, including repeated skips', () => {
    const bySigma = regularity(est({ sigma: 7.7 }), true, 0);
    expect(bySigma).toMatchObject({ label: 'irregular', spread: 8 });
    expect(bySigma.detail).toMatch(/±8 days/);

    const bySkips = regularity(est({ n: 2, method: 'blend' }), true, 2);
    expect(bySkips).toMatchObject({ label: 'irregular', spread: null });
    expect(bySkips.detail).toMatch(/Skipped periods also make them harder/);
  });
});

describe('prediction accuracy', () => {
  it('is hidden until 3 periods could be checked', () => {
    expect(accuracy({ errors: [], mae: null, bias: null, n: 0 })).toEqual({
      available: false,
      checked: 0,
      needed: 3,
    });
    expect(accuracy({ errors: [], mae: 1, bias: 1, n: 2 })).toEqual({
      available: false,
      checked: 2,
      needed: 3,
    });
  });

  it('uses the spec copy', () => {
    expect(accuracy({ errors: [], mae: 2.4, bias: 0.4, n: 5 })).toEqual({
      available: true,
      headline: 'Predictions are usually accurate within ±2 days.',
      bias: null,
      n: 5,
    });
    expect(accuracy({ errors: [], mae: 1.6, bias: -1.4, n: 4 })).toMatchObject({
      headline: 'Predictions are usually accurate within ±2 days.',
      bias: 'Your period tends to come 1 day earlier than predicted.',
    });
    expect(accuracy({ errors: [], mae: 3, bias: 3, n: 3 })).toMatchObject({
      bias: 'Your period tends to come 3 days later than predicted.',
    });
  });

  it('says spot on for a perfectly regular history', () => {
    const logs = logsFromCycles('2025-01-01', [28, 28, 28, 28, 28]);
    const result = accuracy(backtest(logs, [], { cycleLength: 28, periodLength: 5 }));
    expect(result).toMatchObject({ available: true, headline: expect.stringMatching(/spot on/) });
  });
});

describe('symptom pattern copy', () => {
  const p = (over: Partial<Pattern>): Pattern => ({
    symptom: 'cramps',
    frame: 'after_start',
    from: 1,
    to: 2,
    fraction: 0.8,
    ...over,
  });

  it('matches the spec examples', () => {
    expect(patternText(p({}))).toBe('Cramps usually on days 1–2');
    expect(patternText(p({ from: 1, to: 1, fraction: 0.6 }))).toBe('Cramps often on day 1');
    expect(
      patternText(p({ symptom: 'headache', frame: 'before_next', from: 2, to: 2, fraction: 0.6 })),
    ).toBe('Headache often 2 days before your period');
    expect(patternText(p({ frame: 'before_next', from: 1, to: 1 }))).toBe(
      'Cramps usually the day before your period',
    );
    expect(patternText(p({ frame: 'before_next', from: 1, to: 3 }))).toBe(
      'Cramps usually 1–3 days before your period',
    );
  });

  it('gives the share as whole cycles', () => {
    expect(patternShare(p({ fraction: 0.8 }), 5)).toBe('in 4 of 5 cycles');
    expect(patternShare(p({ fraction: 2 / 3 }), 3)).toBe('in 2 of 3 cycles');
  });

  it('explains why there are no patterns', () => {
    expect(patternsState(2, true, 0)).toBe('need_cycles');
    expect(patternsState(4, false, 0)).toBe('need_symptoms');
    expect(patternsState(4, true, 0)).toBe('none');
    expect(patternsState(4, true, 2)).toBe('found');
  });
});

describe('doctor note', () => {
  it('appears only for repeated skips', () => {
    expect(showDoctorNote(0)).toBe(false);
    expect(showDoctorNote(1)).toBe(false);
    expect(showDoctorNote(2)).toBe(true);
  });
});

describe('cycle history rows', () => {
  it('lists the most recent first and tags excluded cycles', () => {
    const logs = logsFromCycles('2025-01-01', [28, 29, 27, 58, 10, 28]);
    const all = deriveCycles(derivePeriods(logs), [], { cycleLength: 28, periodLength: 5 });
    const rows = historyRows(all);
    expect(rows.map((r) => [r.length, r.tag])).toEqual([
      [28, null],
      [10, 'unusually short'],
      [58, 'skipped'],
      [27, null],
      [29, null],
      [28, null],
    ]);
    expect(rows.map((r) => r.counted)).toEqual([true, false, false, true, true, true]);
  });

  it('counts multiple skipped periods and caps the list', () => {
    const skipped: Cycle = {
      start: '2025-01-01',
      nextStart: '2025-03-30',
      length: 88,
      status: 'skipped',
      skippedCount: 2,
    };
    expect(historyRows([skipped])[0]!.tag).toBe('2 skipped');

    const many = deriveCycles(derivePeriods(logsFromCycles('2023-01-01', Array(20).fill(28))), [], {
      cycleLength: 28,
      periodLength: 5,
    });
    const rows = historyRows(many);
    expect(rows).toHaveLength(HISTORY_LIMIT);
    expect(rows[0]!.start).toBe(many[many.length - 1]!.start);
  });
});
