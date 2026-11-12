// Human-readable dates, using the device locale (Intl — no extra dependency).
import { parseISODate } from '../engine/dates.ts';
import type { ISODate } from '../engine/types.ts';
import { firstOfMonth, type YearMonth } from './calendarModel.ts';

const longDate = new Intl.DateTimeFormat(undefined, {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
});
const longDateWithYear = new Intl.DateTimeFormat(undefined, {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});
const monthYear = new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' });

/** "Wednesday 12 March" — adds the year when it isn't the current one. */
export function formatLongDate(date: ISODate, today?: ISODate): string {
  const sameYear = today !== undefined && date.slice(0, 4) === today.slice(0, 4);
  return (sameYear ? longDate : longDateWithYear).format(parseISODate(date));
}

/** "March 2025" */
export function formatMonthYear(ym: YearMonth): string {
  return monthYear.format(parseISODate(firstOfMonth(ym)));
}

/** Weekday names in grid order, e.g. [{ short: 'S', long: 'Sunday' }, …]. */
export function weekdayNames(weekStartsOn: 0 | 1): { short: string; long: string }[] {
  const narrow = new Intl.DateTimeFormat(undefined, { weekday: 'narrow' });
  const long = new Intl.DateTimeFormat(undefined, { weekday: 'long' });
  // 2025-06-01 was a Sunday.
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(2025, 5, 1 + ((i + weekStartsOn) % 7));
    return { short: narrow.format(d), long: long.format(d) };
  });
}
