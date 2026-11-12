import { describe, expect, it } from 'vitest';
import { forecast } from '../engine/forecast.ts';
import { day } from '../engine/test-helpers.ts';
import {
  buildMonth,
  monthGridDates,
  shiftMonth,
  weekday,
  type DayCell,
  type MonthInput,
} from './calendarModel.ts';

describe('month grid', () => {
  it('knows the weekday of a date', () => {
    expect(weekday('1970-01-01')).toBe(4); // Thursday
    expect(weekday('2025-03-01')).toBe(6); // Saturday
    expect(weekday('1969-12-28')).toBe(0); // Sunday, before day 0
  });

  it('is always 42 days starting on the week start', () => {
    const sun = monthGridDates({ year: 2025, month: 3 }, 0);
    expect(sun).toHaveLength(42);
    expect(sun[0]).toBe('2025-02-23'); // Sunday before Sat 1 March
    const mon = monthGridDates({ year: 2025, month: 3 }, 1);
    expect(mon[0]).toBe('2025-02-24');
    // A month starting on the week start has no leading days.
    expect(monthGridDates({ year: 2025, month: 6 }, 0)[0]).toBe('2025-06-01');
  });

  it('shifts months across year boundaries', () => {
    expect(shiftMonth({ year: 2025, month: 12 }, 1)).toEqual({ year: 2026, month: 1 });
    expect(shiftMonth({ year: 2025, month: 1 }, -1)).toEqual({ year: 2024, month: 12 });
  });
});

describe('buildMonth', () => {
  // One logged period 1–5 March; next predicted 29 March (L = 28, σ = 2).
  const logs = [
    ...['2025-03-01', '2025-03-02', '2025-03-03', '2025-03-04', '2025-03-05'].map((d) =>
      day(d, { flow: d === '2025-03-01' ? 'heavy' : 'medium' }),
    ),
    day('2025-03-10', { moods: ['happy'] }),
    day('2025-03-29', { flow: 'light' }), // logged on a predicted day
  ];
  const predictions = forecast({
    periods: [{ start: '2025-03-01', end: '2025-03-05', length: 5 }],
    estimates: { cycleLength: 28, sigma: 2, periodLength: 5, irregular: false },
    pauses: [],
    today: '2025-03-12',
  });
  const input: MonthInput = {
    ym: { year: 2025, month: 3 },
    today: '2025-03-12',
    logs,
    predictions,
    showFertileWindow: false,
  };
  const cellsOf = (i: MonthInput) =>
    new Map(
      buildMonth(i)
        .flat()
        .map((c) => [c.date, c]),
    );
  const cells = cellsOf(input);
  const get = (d: string) => cells.get(d) as DayCell;

  it('returns 6 weeks of 7 days', () => {
    const weeks = buildMonth(input);
    expect(weeks).toHaveLength(6);
    expect(weeks.every((w) => w.length === 7)).toBe(true);
  });

  it('marks logged flow, details, today and in-month days', () => {
    expect(get('2025-03-01')).toMatchObject({ flow: 'heavy', inMonth: true });
    expect(get('2025-03-10')).toMatchObject({ flow: null, hasDetails: true });
    expect(get('2025-03-12').isToday).toBe(true);
    expect(get('2025-02-28').inMonth).toBe(false);
  });

  it('marks predicted period days, the dotted start range and ovulation', () => {
    // Predicted 29 Mar – 2 Apr, start range ±2 → 27–31 Mar; ovulation 15 Mar ±4.
    expect(get('2025-03-30')).toMatchObject({ predictedPeriod: true, startRange: true });
    expect(get('2025-03-27')).toMatchObject({ predictedPeriod: false, startRange: true });
    expect(get('2025-03-15')).toMatchObject({ ovulation: true, ovulationRange: true });
    expect(get('2025-03-11')).toMatchObject({ ovulation: false, ovulationRange: true });
    expect(get('2025-03-20').ovulationRange).toBe(false);
  });

  it('logged flow wins over predicted fill', () => {
    expect(get('2025-03-29')).toMatchObject({
      flow: 'light',
      predictedPeriod: false,
      startRange: false,
    });
  });

  it('shows the fertile window only when enabled', () => {
    expect(get('2025-03-12').fertile).toBe(false);
    const on = cellsOf({ ...input, showFertileWindow: true });
    // ovulation 15 Mar → fertile 10–16 Mar
    expect(on.get('2025-03-10')?.fertile).toBe(true);
    expect(on.get('2025-03-16')?.fertile).toBe(true);
    expect(on.get('2025-03-17')?.fertile).toBe(false);
  });
});
