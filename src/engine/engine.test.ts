// Spec §6.9 — required engine tests 1–12 (test 13 lives in dates.test.ts).
import { describe, expect, it } from 'vitest';
import { backtest } from './backtest.ts';
import { deriveCycles } from './cycles.ts';
import { addDays, addMonths } from './dates.ts';
import { derive, type Onboarding } from './derive.ts';
import { estimateCycle, estimatePeriodLength } from './estimate.ts';
import { forecast } from './forecast.ts';
import { symptomPatterns } from './patterns.ts';
import { derivePeriods } from './periods.ts';
import {
  day,
  logsFromCycles,
  logsFromPeriods,
  startsFromCycles,
  withDays,
} from './test-helpers.ts';
import type { Pause } from './types.ts';

const FIRST = '2025-01-06';
const NO_PAUSES: Pause[] = [];
const ONB_28: Onboarding = { cycleLength: 28, periodLength: 5 };
const ONB_DEFAULT: Onboarding = { cycleLength: null, periodLength: 5 };

/** Derive with `today` set a few days after the last period start. */
function deriveFromCycles(cycles: number[], onboarding: Onboarding = ONB_DEFAULT, daysAfter = 3) {
  const starts = startsFromCycles(FIRST, cycles);
  const today = addDays(starts[starts.length - 1]!, daysAfter);
  return {
    starts,
    today,
    ...derive({ logs: logsFromCycles(FIRST, cycles), pauses: NO_PAUSES, onboarding, today }),
  };
}

// ---------------------------------------------------------------------------
describe('1. period derivation', () => {
  it('a single empty day between flow days does not split a period', () => {
    const logs = [day('2025-03-01', { flow: 'heavy' }), day('2025-03-03', { flow: 'light' })];
    expect(derivePeriods(logs)).toEqual([{ start: '2025-03-01', end: '2025-03-03', length: 3 }]);
  });

  it('two empty days split it', () => {
    const logs = [day('2025-03-01', { flow: 'heavy' }), day('2025-03-04', { flow: 'light' })];
    expect(derivePeriods(logs)).toEqual([
      { start: '2025-03-01', end: '2025-03-01', length: 1 },
      { start: '2025-03-04', end: '2025-03-04', length: 1 },
    ]);
  });

  it('ignores days without flow and unsorted input', () => {
    const logs = [
      day('2025-03-02', { flow: 'medium' }),
      day('2025-02-01', { symptoms: ['acne'] }),
      day('2025-03-01', { flow: 'heavy' }),
    ];
    expect(derivePeriods(logs)).toEqual([{ start: '2025-03-01', end: '2025-03-02', length: 2 }]);
  });
});

// ---------------------------------------------------------------------------
describe('2. cold start', () => {
  it('blends onboarding 30 with one 26-day cycle → 29', () => {
    const d = deriveFromCycles([26], { cycleLength: 30, periodLength: 5 });
    expect(d.cycles.map((c) => c.status)).toEqual(['valid']);
    expect(d.cycleEstimate).toMatchObject({ length: 29, method: 'blend', n: 1, sigma: 2 });
  });

  it('uses onboarding alone with no cycles, and 28 when "not sure"', () => {
    expect(estimateCycle([], 31)).toMatchObject({ length: 31, method: 'onboarding', n: 0 });
    expect(estimateCycle([], null)).toMatchObject({ length: 28, method: 'onboarding' });
  });
});

// ---------------------------------------------------------------------------
describe('3. regular cycles', () => {
  it('six 28-day cycles → L = 28 and next start = last + 28', () => {
    const d = deriveFromCycles([28, 28, 28, 28, 28, 28]);
    const last = d.starts[d.starts.length - 1]!;
    expect(d.cycleEstimate).toMatchObject({ length: 28, method: 'median', n: 6, sigma: 0 });
    expect(d.irregular).toBe(false);
    expect(d.predictions[0]).toMatchObject({ k: 1, periodStart: addDays(last, 28) });
    expect(d.predictions[1]?.periodStart).toBe(addDays(last, 56));
  });

  it('fills in the dependent dates of each prediction', () => {
    const d = deriveFromCycles([28, 28, 28, 28, 28, 28]);
    const p = d.predictions[0]!;
    expect(p.periodEnd).toBe(addDays(p.periodStart, 4)); // period length 5
    expect(p.ovulation).toBe(addDays(p.periodStart, -14));
    expect(p.fertileStart).toBe(addDays(p.ovulation, -5));
    expect(p.fertileEnd).toBe(addDays(p.ovulation, 1));
    // σ = 0 → start range is still at least ±1
    expect([p.rangeStart, p.rangeEnd]).toEqual([
      addDays(p.periodStart, -1),
      addDays(p.periodStart, 1),
    ]);
    expect([p.ovulationRangeStart, p.ovulationRangeEnd]).toEqual([
      addDays(p.ovulation, -3),
      addDays(p.ovulation, 3),
    ]);
    expect(p.lowConfidence).toBe(false);
  });

  it('forecasts up to 6 months ahead', () => {
    const d = deriveFromCycles([28, 28, 28, 28, 28, 28]);
    const horizon = addMonths(d.today, 6);
    expect(d.predictions.every((p) => p.periodStart <= horizon)).toBe(true);
    expect(addDays(d.predictions[d.predictions.length - 1]!.periodStart, 28) > horizon).toBe(true);
    expect(d.predictions.map((p) => p.k)).toEqual(d.predictions.map((_, i) => i + 1));
  });
});

// ---------------------------------------------------------------------------
describe('4. one skipped month', () => {
  it('28, 29, 27, then 58 → skipped ×1, L stays 28', () => {
    const d = deriveFromCycles([28, 29, 27, 58]);
    expect(d.cycles.map((c) => c.status)).toEqual(['valid', 'valid', 'valid', 'skipped']);
    expect(d.cycles[3]?.skippedCount).toBe(1);
    expect(d.cycleEstimate.length).toBe(28);
  });
});

describe('5. two skipped months', () => {
  it('28, 30, 29, then 88 → skipped ×2', () => {
    const d = deriveFromCycles([28, 30, 29, 88]);
    expect(d.cycles[3]).toMatchObject({ status: 'skipped', skippedCount: 2, length: 88 });
    expect(d.cycleEstimate.length).toBe(29);
  });
});

describe('6. short cycle', () => {
  it('a 10-day gap is short and excluded from averages', () => {
    const d = deriveFromCycles([28, 28, 28, 10]);
    expect(d.cycles[3]).toMatchObject({ status: 'short', length: 10 });
    expect(d.validCycles).toHaveLength(3);
    expect(d.cycleEstimate).toMatchObject({ length: 28, n: 3 });
  });

  it('a gap under 0.6 × baseline is short even when ≥ 15 days', () => {
    const d = deriveFromCycles([35, 35, 35, 20]); // 20 < 0.6 × 35 = 21
    expect(d.cycles[3]?.status).toBe('short');
  });
});

// ---------------------------------------------------------------------------
describe('7. irregular', () => {
  it('21, 36, 26, 40, 23, 34 → σ ≈ 7.7, irregular, low confidence, 3-month horizon', () => {
    const d = deriveFromCycles([21, 36, 26, 40, 23, 34]);
    expect(d.cycles.every((c) => c.status === 'valid')).toBe(true);
    expect(d.cycleEstimate.sigma).toBeCloseTo(7.72, 2);
    expect(d.cycleEstimate.length).toBe(30); // median of the six
    expect(d.irregular).toBe(true);
    expect(d.status.irregular).toBe(true);
    expect(d.predictions.length).toBeGreaterThan(0);
    expect(d.predictions.every((p) => p.lowConfidence)).toBe(true);
    const horizon = addMonths(d.today, 3);
    expect(d.predictions.every((p) => p.periodStart <= horizon)).toBe(true);
    expect(addDays(d.predictions[d.predictions.length - 1]!.periodStart, 30) > horizon).toBe(true);
  });

  it('two skipped periods in the last year also mean irregular', () => {
    const d = deriveFromCycles([28, 28, 28, 56, 28, 56]);
    expect(d.cycleEstimate.sigma).toBe(0);
    expect(d.skippedInLast365).toBe(2);
    expect(d.irregular).toBe(true);
  });
});

// ---------------------------------------------------------------------------
describe('8. range widening', () => {
  it('σ = 3 → k=1 ±3, k=4 ±6 (ovulation adds ±2)', () => {
    const periods = [{ start: '2025-01-01', end: '2025-01-05', length: 5 }];
    const preds = forecast({
      periods,
      estimates: { cycleLength: 28, sigma: 3, periodLength: 5, irregular: false },
      pauses: NO_PAUSES,
      today: '2025-01-03',
    });
    const k1 = preds[0]!;
    const k4 = preds[3]!;
    expect(k1.periodStart).toBe('2025-01-29');
    expect([k1.rangeStart, k1.rangeEnd]).toEqual(['2025-01-26', '2025-02-01']);
    expect(k4.k).toBe(4);
    expect(k4.periodStart).toBe(addDays('2025-01-01', 4 * 28));
    expect([k4.rangeStart, k4.rangeEnd]).toEqual([
      addDays(k4.periodStart, -6),
      addDays(k4.periodStart, 6),
    ]);
    expect([k1.ovulationRangeStart, k1.ovulationRangeEnd]).toEqual([
      addDays(k1.ovulation, -5),
      addDays(k1.ovulation, 5),
    ]);
    expect(k4.ovulationRangeEnd).toBe(addDays(k4.ovulation, 8));
  });
});

// ---------------------------------------------------------------------------
describe('9. late → possibly skipped', () => {
  const cycles = [30, 30, 30, 30];
  const onboarding = { cycleLength: 30, periodLength: 5 };
  const lastStart = startsFromCycles(FIRST, cycles)[4]!;
  const due = addDays(lastStart, 30);
  const logs = logsFromCycles(FIRST, cycles);
  const at = (today: string) => derive({ logs, pauses: NO_PAUSES, onboarding, today });

  it('on the due date it is not late yet', () => {
    expect(at(due).status).toMatchObject({ daysLate: null, daysUntilNext: 0 });
  });

  it('10 days late → late; k=1 stays on its date', () => {
    const d = at(addDays(due, 10));
    expect(d.cycleEstimate.length).toBe(30);
    expect(d.status).toMatchObject({ phase: 'late', daysLate: 10, cycleDay: 41 });
    expect(d.predictions[0]).toMatchObject({ k: 1, periodStart: due });
    expect(d.predictions[1]?.periodStart).toBe(addDays(due, 30));
  });

  it('18 days late → possibly skipped and forecasts roll forward past today', () => {
    const today = addDays(due, 18); // round(0.6 × 30) = 18
    const d = at(today);
    expect(d.status).toMatchObject({ phase: 'possibly_skipped', daysLate: 18 });
    expect(d.predictions[0]).toMatchObject({ k: 1, periodStart: addDays(due, 30) });
    expect(d.predictions.every((p) => p.periodStart > today)).toBe(true);
    expect(d.status.daysUntilNext).toBe(12);
  });

  it('17 days late is still only late', () => {
    expect(at(addDays(due, 17)).status.phase).toBe('late');
  });
});

// ---------------------------------------------------------------------------
describe('10. pauses', () => {
  it('today inside a pause → no forecasts, phase paused', () => {
    const logs = logsFromCycles(FIRST, [28, 28, 28]);
    const pauses: Pause[] = [{ id: 1, start: '2025-04-01', end: null }];
    const d = derive({ logs, pauses, onboarding: ONB_28, today: '2025-04-10' });
    expect(d.predictions).toEqual([]);
    expect(d.status.phase).toBe('paused');
  });

  it('a pause that has ended no longer blocks forecasts', () => {
    const logs = logsFromCycles(FIRST, [28, 28, 28]);
    const pauses: Pause[] = [{ id: 1, start: '2025-04-01', end: '2025-04-05' }];
    const d = derive({ logs, pauses, onboarding: ONB_28, today: '2025-04-10' });
    expect(d.predictions.length).toBeGreaterThan(0);
  });

  it('after coming off a long pause, the cycle restarts the day after it ended', () => {
    // Last period 2025-03-31, then ~9 months on the pill.
    const logs = logsFromCycles(FIRST, [28, 28, 28]);
    const pauses: Pause[] = [{ id: 1, start: '2025-04-01', end: '2025-12-31' }];
    const d = derive({ logs, pauses, onboarding: ONB_28, today: '2026-01-10' });
    expect(d.status).toMatchObject({ phase: 'follicular', cycleDay: 10, daysLate: null });
    expect(d.predictions[0]?.periodStart).toBe('2026-01-29'); // 2026-01-01 + 28
  });

  it('a pause that ended before the last period does not move the anchor', () => {
    const logs = logsFromCycles(FIRST, [28, 28, 28]); // last period 2025-03-31
    const pauses: Pause[] = [{ id: 1, start: '2024-06-01', end: '2024-12-01' }];
    const d = derive({ logs, pauses, onboarding: ONB_28, today: '2025-04-10' });
    expect(d.status.cycleDay).toBe(11);
    expect(d.predictions[0]?.periodStart).toBe('2025-04-28');
  });

  it('gaps overlapping a pause are paused and excluded from averages', () => {
    const starts = startsFromCycles(FIRST, [28, 28, 28, 45, 28]);
    // Pause entirely inside the 45-day gap (starts[3] → starts[4]).
    const pauses: Pause[] = [{ start: addDays(starts[3]!, 10), end: addDays(starts[3]!, 20) }];
    const d = derive({
      logs: logsFromCycles(FIRST, [28, 28, 28, 45, 28]),
      pauses,
      onboarding: ONB_28,
      today: addDays(starts[5]!, 2),
    });
    expect(d.cycles.map((c) => c.status)).toEqual(['valid', 'valid', 'valid', 'paused', 'valid']);
    expect(d.validCycles.map((c) => c.length)).toEqual([28, 28, 28, 28]);
    expect(d.cycleEstimate.length).toBe(28);
  });
});

// ---------------------------------------------------------------------------
describe('11. backtest', () => {
  it('a perfectly regular history has mae 0', () => {
    const r = backtest(logsFromCycles(FIRST, [28, 28, 28, 28, 28, 28]), NO_PAUSES, ONB_28);
    expect(r.n).toBe(6);
    expect(r.mae).toBe(0);
    expect(r.bias).toBe(0);
  });

  it('excludes the target after a skipped gap', () => {
    const logs = logsFromCycles(FIRST, [28, 28, 28, 56, 28]);
    const starts = startsFromCycles(FIRST, [28, 28, 28, 56, 28]);
    const r = backtest(logs, NO_PAUSES, ONB_28);
    expect(r.n).toBe(4);
    expect(r.errors.map((e) => e.date)).not.toContain(starts[4]);
    expect(r.mae).toBe(0);
  });

  it('measures a consistent lateness as positive bias', () => {
    // Onboarding says 28, but cycles run 30: the cold-start predictions come early.
    const r = backtest(logsFromCycles(FIRST, [30, 30, 30, 30, 30]), NO_PAUSES, ONB_28);
    // L = 28 → blend 29 → blend (2·28+30+30)/4 = 29 → median 30 → 30
    expect(r.errors.map((e) => e.error)).toEqual([2, 1, 1, 0, 0]);
    expect(r.bias).toBeCloseTo(0.8);
    expect(r.mae).toBeCloseTo(0.8);
  });

  it('has no score with no usable targets', () => {
    expect(backtest(logsFromCycles(FIRST, []), NO_PAUSES, ONB_28)).toEqual({
      errors: [],
      mae: null,
      bias: null,
      n: 0,
    });
  });
});

// ---------------------------------------------------------------------------
describe('12. symptom patterns', () => {
  const cycleLens = [28, 28, 28, 28, 28];
  const starts = startsFromCycles(FIRST, cycleLens);
  const base = logsFromCycles(FIRST, cycleLens);

  /** Patterns for a history with the given extra symptom days. */
  function patternsFor(extra: ReturnType<typeof day>[], history = base) {
    const logs = withDays(history, extra);
    const cycles = deriveCycles(derivePeriods(logs), NO_PAUSES, ONB_28);
    return symptomPatterns(logs, cycles);
  }

  /** Cramps on cycle days 1–2 in the given cycles. */
  const crampsIn = (cycleIndexes: number[]) =>
    cycleIndexes.flatMap((i) => [
      day(starts[i]!, { symptoms: ['cramps'] }),
      day(addDays(starts[i]!, 1), { symptoms: ['cramps'] }),
    ]);

  it('cramps on days 1–2 in 4 of 5 cycles → reported as days 1–2 (window trimmed)', () => {
    expect(patternsFor(crampsIn([0, 1, 2, 3]))).toEqual([
      { symptom: 'cramps', frame: 'after_start', from: 1, to: 2, fraction: 0.8 },
    ]);
  });

  it('cramps in 2 of 5 cycles → not reported', () => {
    expect(patternsFor(crampsIn([0, 1]))).toEqual([]);
  });

  it('cycles with only flow logged still count (as "no symptom")', () => {
    // 3 of 5 = 0.6 → reported; the 2 flow-only cycles are in the denominator.
    expect(patternsFor(crampsIn([0, 1, 2]))).toEqual([
      { symptom: 'cramps', frame: 'after_start', from: 1, to: 2, fraction: 0.6 },
    ]);
  });

  it('needs at least 3 valid cycles', () => {
    const twoCycles = logsFromCycles(FIRST, [28, 28]);
    expect(patternsFor(crampsIn([0, 1]), twoCycles)).toEqual([]);
  });

  it('a symptom that drifts by a day is reported across both days', () => {
    // Day 2 in three cycles, day 3 in two: tolerance finds it, trim keeps days 2–3.
    const extra = [0, 1, 2, 3, 4].map((i) =>
      day(addDays(starts[i]!, i < 3 ? 1 : 2), { symptoms: ['cramps'] }),
    );
    expect(patternsFor(extra)).toEqual([
      { symptom: 'cramps', frame: 'after_start', from: 2, to: 3, fraction: 1 },
    ]);
  });

  it('finds "before next period" patterns', () => {
    // Headache 2 days before the next period in cycles 0–3 (4 of 5).
    const extra = [1, 2, 3, 4].map((i) => day(addDays(starts[i]!, -2), { symptoms: ['headache'] }));
    expect(patternsFor(extra)).toEqual([
      { symptom: 'headache', frame: 'before_next', from: 2, to: 2, fraction: 0.8 },
    ]);
  });
});

// ---------------------------------------------------------------------------
describe('period length estimate', () => {
  it('uses the median of complete periods and skips one that may be ongoing', () => {
    const periods = derivePeriods(
      logsFromPeriods([
        { start: '2025-01-01', length: 4 },
        { start: '2025-02-01', length: 6 },
        { start: '2025-03-01', length: 5 },
        { start: '2025-04-01', length: 2 }, // ongoing: ends today
      ]),
    );
    expect(estimatePeriodLength(periods, 5, '2025-04-02')).toMatchObject({
      length: 5,
      n: 3,
      method: 'median',
    });
  });

  it('blends with onboarding when there are fewer than 3 periods', () => {
    const periods = derivePeriods(logsFromPeriods([{ start: '2025-01-01', length: 8 }]));
    // (2·5 + 8) / 3 = 6
    expect(estimatePeriodLength(periods, 5, '2025-02-01')).toMatchObject({
      length: 6,
      method: 'blend',
    });
  });
});

// ---------------------------------------------------------------------------
describe('status phases', () => {
  const cycles = [28, 28, 28, 28, 28, 28];
  const logs = logsFromCycles(FIRST, cycles);
  const last = startsFromCycles(FIRST, cycles)[6]!;
  const at = (offset: number) =>
    derive({ logs, pauses: NO_PAUSES, onboarding: ONB_28, today: addDays(last, offset) }).status;

  it('walks through a 28-day cycle', () => {
    // Day 1–5 logged flow; ovulation = day 15 (28 − 14 + 1), window days 14–16;
    // PMS = 5 days before day 29.
    expect(at(0)).toMatchObject({ phase: 'period', cycleDay: 1, daysUntilNext: 28 });
    expect(at(4).phase).toBe('period');
    expect(at(5).phase).toBe('follicular');
    expect(at(12).phase).toBe('follicular');
    expect(at(13).phase).toBe('ovulation');
    expect(at(15).phase).toBe('ovulation');
    expect(at(16).phase).toBe('luteal');
    expect(at(22).phase).toBe('luteal');
    expect(at(23)).toMatchObject({ phase: 'pms', daysUntilNext: 5 });
    expect(at(27)).toMatchObject({ phase: 'pms', daysUntilNext: 1 });
    expect(at(29)).toMatchObject({ phase: 'late', daysLate: 1, daysUntilNext: null });
  });

  it('has no data without periods', () => {
    const s = derive({ logs: [], pauses: NO_PAUSES, onboarding: ONB_28, today: '2025-01-01' });
    expect(s.status).toEqual({
      phase: 'no_data',
      cycleDay: null,
      daysUntilNext: null,
      daysLate: null,
      irregular: false,
    });
    expect(s.predictions).toEqual([]);
  });
});
