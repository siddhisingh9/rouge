import { describe, expect, it } from 'vitest';
import { derive } from '../engine/derive.ts';
import { addDays } from '../engine/dates.ts';
import { logsFromCycles } from '../engine/test-helpers.ts';
import { ringModel } from './cycleRing.ts';

const onboarding = { cycleLength: 28, periodLength: 5 };

function ringFor(first: string, cycles: number[], todayOffset: number) {
  const logs = logsFromCycles(first, cycles);
  const lastStart = addDays(
    first,
    cycles.reduce((a, b) => a + b, 0),
  );
  const today = addDays(lastStart, todayOffset);
  const d = derive({ logs, pauses: [], onboarding, today });
  return { d, ring: ringModel(d.status, d.predictions[0], d.periodEstimate.length, today) };
}

describe('cycle ring', () => {
  it('colours a regular 28-day cycle like the status rules', () => {
    const { d, ring } = ringFor('2025-01-01', [28, 28, 28], 9); // cycle day 10
    expect(d.status.phase).toBe('follicular');
    expect(ring).not.toBeNull();
    const { days, cycleDay, ovulationDay } = ring!;
    expect(days).toHaveLength(28);
    expect(cycleDay).toBe(10);
    expect(ovulationDay).toBe(15); // next start − 14 days
    const runs = days.reduce<string[]>(
      (acc, p) => (acc[acc.length - 1]?.startsWith(p) ? acc : [...acc, p]),
      [],
    );
    expect(runs).toEqual(['period', 'follicular', 'ovulation', 'luteal', 'pms']);
    expect(days.filter((p) => p === 'period')).toHaveLength(5);
    expect(days.filter((p) => p === 'ovulation')).toHaveLength(3);
    expect(days.slice(-5)).toEqual(Array(5).fill('pms'));
  });

  it('matches today’s phase on every day of the cycle', () => {
    for (let offset = 5; offset < 28; offset++) {
      const { d, ring } = ringFor('2025-01-01', [28, 28, 28], offset);
      expect(ring!.days[ring!.cycleDay - 1]).toBe(d.status.phase);
    }
  });

  it('keeps the expected length when late, with today past the end', () => {
    const { d, ring } = ringFor('2025-01-01', [28, 28, 28], 31);
    expect(d.status.phase).toBe('late');
    expect(ring).toMatchObject({ late: true, cycleDay: 32 });
    expect(ring!.days).toHaveLength(28);
  });

  it('has no ring when possibly skipped or with no data', () => {
    expect(ringFor('2025-01-01', [28, 28, 28], 50).ring).toBeNull();
    const empty = derive({ logs: [], pauses: [], onboarding, today: '2025-06-01' });
    expect(ringModel(empty.status, empty.predictions[0], 5, '2025-06-01')).toBeNull();
  });
});
