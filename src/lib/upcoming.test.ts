import { describe, expect, it } from 'vitest';
import { derive } from '../engine/derive.ts';
import { addDays } from '../engine/dates.ts';
import { logsFromCycles } from '../engine/test-helpers.ts';
import { upcomingCards } from './upcoming.ts';

const onboarding = { cycleLength: 28, periodLength: 5 };
const FIRST = '2025-01-01';
const LAST_START = addDays(FIRST, 84); // after cycles of 28, 28, 28

function cards(todayOffset: number, showFertileWindow = false) {
  const today = addDays(LAST_START, todayOffset);
  const d = derive({ logs: logsFromCycles(FIRST, [28, 28, 28]), pauses: [], onboarding, today });
  return upcomingCards({
    status: d.status,
    next: d.predictions[0],
    today,
    showFertileWindow,
    cycleLength: d.cycleEstimate.length,
    periodLength: d.periodEstimate.length,
  });
}

describe('coming up cards', () => {
  it('early in the cycle: next period, ovulation, fertile window, cycle summary', () => {
    const c = cards(5, true); // cycle day 6
    expect(c.map((x) => x.kind)).toEqual(['period', 'ovulation', 'fertile', 'cycle']);
    expect(c[0]).toMatchObject({ title: 'Next period', value: 'In 23 days' });
    expect(c[1]).toMatchObject({ value: 'In 9 days' });
    expect(c[2]).toMatchObject({ value: 'In 4 days' });
    expect(c[3]).toMatchObject({ value: '~28 days', sub: 'Period ~5 days' });
  });

  it('around ovulation, then PMS after it', () => {
    expect(cards(14)[1]).toMatchObject({ kind: 'ovulation', value: 'Around now' });
    expect(cards(18)[1]).toMatchObject({ kind: 'pms', value: 'In 5 days' });
    expect(cards(25)[1]).toMatchObject({ kind: 'pms', value: 'Now' });
    expect(cards(27)[0]).toMatchObject({ value: 'Tomorrow' });
  });

  it('hides the fertile window unless the setting is on', () => {
    expect(cards(5).some((c) => c.kind === 'fertile')).toBe(false);
  });

  it('late: shows how late, nothing about ovulation', () => {
    const c = cards(31);
    expect(c.map((x) => x.kind)).toEqual(['period', 'cycle']);
    expect(c[0]).toMatchObject({ value: 'Late by 3 days' });
  });

  it('no data: nothing', () => {
    const d = derive({ logs: [], pauses: [], onboarding, today: '2025-06-01' });
    expect(
      upcomingCards({
        status: d.status,
        next: d.predictions[0],
        today: '2025-06-01',
        showFertileWindow: true,
        cycleLength: 28,
        periodLength: 5,
      }),
    ).toEqual([]);
  });
});
