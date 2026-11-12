import { describe, expect, it } from 'vitest';
import { day } from '../engine/test-helpers.ts';
import { planLogPeriod, planPeriodEnded } from './periodPlans.ts';

describe('planLogPeriod (spec §5.1)', () => {
  it('fills start … start + length − 1 with medium flow', () => {
    expect(planLogPeriod([], '2025-03-30', 4)).toEqual([
      { date: '2025-03-30', patch: { flow: 'medium' } },
      { date: '2025-03-31', patch: { flow: 'medium' } },
      { date: '2025-04-01', patch: { flow: 'medium' } },
      { date: '2025-04-02', patch: { flow: 'medium' } },
    ]);
  });

  it('leaves days that already have flow alone', () => {
    const logs = [
      day('2025-03-31', { flow: 'heavy' }),
      day('2025-04-01', { symptoms: ['cramps'] }), // no flow → gets filled
    ];
    expect(planLogPeriod(logs, '2025-03-30', 3).map((p) => p.date)).toEqual([
      '2025-03-30',
      '2025-04-01',
    ]);
  });
});

describe('planPeriodEnded (spec §5.2)', () => {
  const logs = [
    day('2025-03-01', { flow: 'heavy' }),
    day('2025-03-02', { flow: 'medium' }),
    day('2025-03-03', { flow: 'medium' }),
    day('2025-03-05', { flow: 'light' }), // single empty day → same period
    day('2025-03-06', { notes: 'x' }),
    day('2025-03-20', { flow: 'light' }), // a different, later period
  ];

  it('clears flow on later days of the current period only', () => {
    expect(planPeriodEnded(logs, '2025-03-02')).toEqual([
      { date: '2025-03-03', patch: { flow: null } },
      { date: '2025-03-05', patch: { flow: null } },
    ]);
  });

  it('does nothing outside a period, or on its last day', () => {
    expect(planPeriodEnded(logs, '2025-03-10')).toEqual([]);
    expect(planPeriodEnded(logs, '2025-03-05')).toEqual([]);
  });
});
