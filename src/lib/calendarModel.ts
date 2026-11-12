// Pure model for the month view: which visual states each day has (spec §7 Calendar).
import { addDays, isWithin, toDayNumber } from '../engine/dates.ts';
import type { PredictedCycle } from '../engine/forecast.ts';
import type { DailyLog, Flow, ISODate } from '../engine/types.ts';

/** 0 = Sunday, 1 = Monday. */
export const WEEK_STARTS_ON: 0 | 1 = 0;

export interface YearMonth {
  year: number;
  month: number; // 1–12
}

export interface DayCell {
  date: ISODate;
  day: number; // day of month
  inMonth: boolean;
  isToday: boolean;
  flow: Flow | null; // logged
  hasDetails: boolean; // symptoms, moods or notes logged
  predictedPeriod: boolean; // only on days without logged flow
  startRange: boolean; // possible period start (dotted)
  ovulation: boolean;
  ovulationRange: boolean; // dotted, accent colour
  fertile: boolean; // only when the setting is on
}

/** 0 = Sunday … 6 = Saturday. 1970-01-01 (day 0) was a Thursday. */
export function weekday(date: ISODate): number {
  return (((toDayNumber(date) + 4) % 7) + 7) % 7;
}

export function yearMonthOf(date: ISODate): YearMonth {
  return { year: Number(date.slice(0, 4)), month: Number(date.slice(5, 7)) };
}

export function shiftMonth({ year, month }: YearMonth, delta: number): YearMonth {
  const total = year * 12 + (month - 1) + delta;
  const y = Math.floor(total / 12);
  return { year: y, month: total - y * 12 + 1 };
}

export function firstOfMonth({ year, month }: YearMonth): ISODate {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-01`;
}

/** Always 6 weeks (42 days) so the grid height never jumps between months. */
export function monthGridDates(ym: YearMonth, weekStartsOn = WEEK_STARTS_ON): ISODate[] {
  const first = firstOfMonth(ym);
  const lead = (weekday(first) - weekStartsOn + 7) % 7;
  const start = addDays(first, -lead);
  return Array.from({ length: 42 }, (_, i) => addDays(start, i));
}

export interface MonthInput {
  ym: YearMonth;
  today: ISODate;
  logs: readonly DailyLog[];
  predictions: readonly PredictedCycle[];
  showFertileWindow: boolean;
  weekStartsOn?: 0 | 1;
}

/** The month as 6 rows of 7 cells. */
export function buildMonth(input: MonthInput): DayCell[][] {
  const { ym, today, logs, predictions, showFertileWindow } = input;
  const dates = monthGridDates(ym, input.weekStartsOn);
  const logByDate = new Map(logs.map((l) => [l.date, l]));
  const monthPrefix = firstOfMonth(ym).slice(0, 8); // "YYYY-MM-"
  // There are only a handful of predictions (≤ 6 months), so checking all is cheap.
  const any = (test: (p: PredictedCycle) => boolean) => predictions.some(test);

  const cells = dates.map((date): DayCell => {
    const log = logByDate.get(date);
    const flow = log?.flow ?? null;
    return {
      date,
      day: Number(date.slice(8, 10)),
      inMonth: date.startsWith(monthPrefix),
      isToday: date === today,
      flow,
      hasDetails:
        !!log && (log.symptoms.length > 0 || log.moods.length > 0 || log.notes.trim() !== ''),
      predictedPeriod: flow === null && any((p) => isWithin(date, p.periodStart, p.periodEnd)),
      startRange: flow === null && any((p) => isWithin(date, p.rangeStart, p.rangeEnd)),
      ovulation: any((p) => p.ovulation === date),
      ovulationRange: any((p) => isWithin(date, p.ovulationRangeStart, p.ovulationRangeEnd)),
      fertile: showFertileWindow && any((p) => isWithin(date, p.fertileStart, p.fertileEnd)),
    };
  });

  return Array.from({ length: 6 }, (_, w) => cells.slice(w * 7, w * 7 + 7));
}
