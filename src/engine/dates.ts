// Calendar-date helpers — spec §3.
//
// All arithmetic is done on a "day number" (whole days since 1970-01-01) computed with
// Date.UTC, so it can never be off by one because of time zones or DST changes.
// Only parseISODate / toISODate touch local time, and only for UI interop.
import type { ISODate } from './types.ts';

const MS_PER_DAY = 86_400_000;
const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

function pad(n: number, width = 2): string {
  return String(n).padStart(width, '0');
}

function fromParts(year: number, month: number, day: number): ISODate {
  return `${pad(year, 4)}-${pad(month)}-${pad(day)}`;
}

/** Number of days in a month (month is 1-12). */
export function daysInMonth(year: number, month: number): number {
  // Day 0 of the next month = last day of this month.
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** True for a real calendar date in "YYYY-MM-DD" form (rejects 2025-02-30 etc). */
export function isISODate(value: unknown): value is ISODate {
  if (typeof value !== 'string') return false;
  const m = ISO_DATE_RE.exec(value);
  if (!m) return false;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  return month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth(year, month);
}

function parts(date: ISODate): [year: number, month: number, day: number] {
  if (!isISODate(date)) throw new Error(`Invalid ISO date: ${JSON.stringify(date)}`);
  return [Number(date.slice(0, 4)), Number(date.slice(5, 7)), Number(date.slice(8, 10))];
}

/** Whole days since 1970-01-01 — a time-zone-free integer for calendar arithmetic. */
export function toDayNumber(date: ISODate): number {
  const [y, m, d] = parts(date);
  return Math.round(Date.UTC(y, m - 1, d) / MS_PER_DAY);
}

export function fromDayNumber(dayNumber: number): ISODate {
  const dt = new Date(dayNumber * MS_PER_DAY);
  return fromParts(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
}

/** A Date at local midnight on that calendar day (for UI formatting only). */
export function parseISODate(date: ISODate): Date {
  const [y, m, d] = parts(date);
  return new Date(y, m - 1, d);
}

/** The local calendar day of a Date. */
export function toISODate(date: Date): ISODate {
  return fromParts(date.getFullYear(), date.getMonth() + 1, date.getDate());
}

export function addDays(date: ISODate, days: number): ISODate {
  return fromDayNumber(toDayNumber(date) + days);
}

/** Whole calendar days from `b` to `a` (positive when a is later). */
export function diffDays(a: ISODate, b: ISODate): number {
  return toDayNumber(a) - toDayNumber(b);
}

/** Add calendar months, clamping the day (Jan 31 + 1 month = Feb 28/29). */
export function addMonths(date: ISODate, months: number): ISODate {
  const [y, m, d] = parts(date);
  const total = y * 12 + (m - 1) + months;
  const year = Math.floor(total / 12);
  const month = total - year * 12 + 1;
  return fromParts(year, month, Math.min(d, daysInMonth(year, month)));
}

/** Inclusive range check. ISO dates compare correctly as strings. */
export function isWithin(date: ISODate, start: ISODate, end: ISODate): boolean {
  return date >= start && date <= end;
}
