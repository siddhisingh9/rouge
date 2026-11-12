/// <reference types="node" />
// Spec §6.9 test 13: no off-by-one across month/year boundaries and DST changes.
// Runs under several time zones by switching process.env.TZ (Node applies it live).
import { afterAll, describe, expect, it } from 'vitest';
import {
  addDays,
  addMonths,
  diffDays,
  fromDayNumber,
  isISODate,
  parseISODate,
  toDayNumber,
  toISODate,
} from './dates.ts';

const ORIGINAL_TZ = process.env.TZ;
afterAll(() => {
  if (ORIGINAL_TZ === undefined) delete process.env.TZ;
  else process.env.TZ = ORIGINAL_TZ;
});

// Zones with DST transitions on different dates, one with a midnight transition
// (São Paulo 2018: local midnight on 2018-11-04 did not exist), and one far east.
const ZONES = [
  'UTC',
  'America/New_York',
  'Europe/London',
  'Asia/Kolkata',
  'America/Sao_Paulo',
  'Pacific/Auckland',
];

describe.each(ZONES)('dates in %s', (tz) => {
  process.env.TZ = tz;

  it('crosses month and year boundaries', () => {
    process.env.TZ = tz;
    expect(addDays('2025-01-31', 1)).toBe('2025-02-01');
    expect(addDays('2024-12-31', 1)).toBe('2025-01-01');
    expect(addDays('2025-01-01', -1)).toBe('2024-12-31');
    expect(addDays('2024-02-28', 1)).toBe('2024-02-29');
    expect(addDays('2025-02-28', 1)).toBe('2025-03-01');
    expect(diffDays('2025-01-01', '2024-12-31')).toBe(1);
    expect(diffDays('2025-03-01', '2024-03-01')).toBe(365);
    expect(diffDays('2024-03-01', '2023-03-01')).toBe(366);
  });

  it('crosses DST changes', () => {
    process.env.TZ = tz;
    // US (Mar 9 / Nov 2), EU (Mar 30 / Oct 26), NZ (Apr 6 / Sep 28), Brazil 2018 (Nov 4)
    for (const [before, after] of [
      ['2025-03-08', '2025-03-10'],
      ['2025-11-01', '2025-11-03'],
      ['2025-03-29', '2025-03-31'],
      ['2025-10-25', '2025-10-27'],
      ['2025-04-05', '2025-04-07'],
      ['2025-09-27', '2025-09-29'],
      ['2018-11-03', '2018-11-05'],
    ] as const) {
      expect(diffDays(after, before)).toBe(2);
      expect(addDays(before, 2)).toBe(after);
      expect(addDays(after, -2)).toBe(before);
    }
  });

  it('round-trips every day of a leap year through local Date', () => {
    process.env.TZ = tz;
    let d = '2024-01-01';
    for (let i = 0; i < 366; i++) {
      expect(toISODate(parseISODate(d))).toBe(d);
      d = addDays(d, 1);
    }
    expect(d).toBe('2025-01-01');
    // Including the São Paulo day whose midnight was skipped.
    expect(toISODate(parseISODate('2018-11-04'))).toBe('2018-11-04');
  });
});

describe('date helpers', () => {
  it('day numbers are consecutive integers', () => {
    expect(toDayNumber('1970-01-01')).toBe(0);
    expect(toDayNumber('1970-01-02')).toBe(1);
    expect(fromDayNumber(toDayNumber('2031-07-15'))).toBe('2031-07-15');
  });

  it('addMonths clamps to the end of shorter months', () => {
    expect(addMonths('2025-01-31', 1)).toBe('2025-02-28');
    expect(addMonths('2024-01-31', 1)).toBe('2024-02-29');
    expect(addMonths('2025-10-15', 3)).toBe('2026-01-15');
    expect(addMonths('2025-01-15', -1)).toBe('2024-12-15');
    expect(addMonths('2025-08-31', 6)).toBe('2026-02-28');
  });

  it('validates ISO dates and refuses to parse bad ones', () => {
    expect(isISODate('2024-02-29')).toBe(true);
    expect(isISODate('2025-02-29')).toBe(false);
    expect(isISODate('2025-4-1')).toBe(false);
    expect(() => addDays('2025-02-30', 1)).toThrow();
  });
});
