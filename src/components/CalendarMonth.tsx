// Month grid with every visual state from spec §7 (Calendar).
import { useRef } from 'react';
import { FLOW_LABELS } from '../content/labels.ts';
import type { ISODate } from '../engine/types.ts';
import { WEEK_STARTS_ON, type DayCell } from '../lib/calendarModel.ts';
import { formatLongDate, weekdayNames } from '../lib/format.ts';
import './Calendar.css';

const WEEKDAYS = weekdayNames(WEEK_STARTS_ON);
const SWIPE_MIN_PX = 50;

function dayClassName(cell: Omit<DayCell, 'date' | 'day'>): string {
  return [
    'cal-day',
    !cell.inMonth && 'cal-day--outside',
    cell.isToday && 'cal-day--today',
    cell.fertile && 'cal-day--fertile',
    cell.predictedPeriod && 'cal-day--predicted',
    cell.ovulation && 'cal-day--ovulation',
    cell.flow && `cal-day--flow-${cell.flow}`,
    cell.ovulationRange && 'cal-day--ovulation-range',
    cell.startRange && 'cal-day--start-range',
  ]
    .filter(Boolean)
    .join(' ');
}

/** Screen-reader description — the visual encoding is never the only signal. */
function dayLabel(cell: DayCell, today: ISODate): string {
  const parts = [formatLongDate(cell.date, today)];
  if (cell.isToday) parts.push('today');
  if (cell.flow) parts.push(`${FLOW_LABELS[cell.flow].toLowerCase()} flow logged`);
  if (cell.predictedPeriod) parts.push('predicted period');
  if (cell.startRange) parts.push('possible period start');
  if (cell.ovulation) parts.push('estimated ovulation');
  else if (cell.ovulationRange) parts.push('possible ovulation');
  if (cell.fertile) parts.push('fertile window estimate');
  if (cell.hasDetails) parts.push('has symptoms, mood or notes');
  return parts.join(', ');
}

interface CalendarMonthProps {
  weeks: DayCell[][];
  today: ISODate;
  onSelect: (date: ISODate) => void;
  onSwipe: (delta: 1 | -1) => void;
}

export function CalendarMonth({ weeks, today, onSelect, onSwipe }: CalendarMonthProps) {
  const touchStart = useRef<{ x: number; y: number } | null>(null);

  return (
    <div
      className="cal-grid"
      onTouchStart={(e) => {
        const t = e.touches[0];
        touchStart.current = t ? { x: t.clientX, y: t.clientY } : null;
      }}
      onTouchEnd={(e) => {
        const start = touchStart.current;
        const t = e.changedTouches[0];
        touchStart.current = null;
        if (!start || !t) return;
        const dx = t.clientX - start.x;
        const dy = t.clientY - start.y;
        if (Math.abs(dx) >= SWIPE_MIN_PX && Math.abs(dx) > Math.abs(dy) * 1.5) {
          onSwipe(dx < 0 ? 1 : -1); // swipe left → next month
        }
      }}
    >
      <div className="cal-row cal-row--head" aria-hidden="true">
        {WEEKDAYS.map((w) => (
          <span key={w.long} className="cal-weekday">
            {w.short}
          </span>
        ))}
      </div>
      {weeks.map((week) => (
        <div key={week[0]!.date} className="cal-row">
          {week.map((cell) => (
            <button
              key={cell.date}
              type="button"
              className={dayClassName(cell)}
              aria-label={dayLabel(cell, today)}
              aria-current={cell.isToday ? 'date' : undefined}
              onClick={() => onSelect(cell.date)}
            >
              <span className="cal-day__num">{cell.day}</span>
              {cell.hasDetails && <span className="cal-day__dot" />}
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}

const BLANK: Omit<DayCell, 'date' | 'day'> = {
  inMonth: true,
  isToday: false,
  flow: null,
  hasDetails: false,
  predictedPeriod: false,
  startRange: false,
  ovulation: false,
  ovulationRange: false,
  fertile: false,
};

function Swatch({ cell, dot }: { cell: Partial<DayCell>; dot?: boolean }) {
  return (
    <span className={dayClassName({ ...BLANK, ...cell })} aria-hidden="true">
      <span className="cal-day__num">8</span>
      {dot && <span className="cal-day__dot" />}
    </span>
  );
}

export function CalendarLegend({ showFertileWindow }: { showFertileWindow: boolean }) {
  type Item = [label: string, cell: Partial<DayCell>, dot?: boolean];
  const fertile: Item[] = showFertileWindow
    ? [['Fertile window (estimate, not contraception)', { fertile: true }]]
    : [];
  const items: Item[] = [
    ['Period: light flow', { flow: 'light' }],
    ['Period: medium flow', { flow: 'medium' }],
    ['Period: heavy flow', { flow: 'heavy' }],
    ['Predicted period', { predictedPeriod: true }],
    ['Possible period start (dotted)', { startRange: true }],
    ['Estimated ovulation', { ovulation: true }],
    ['Possible ovulation (dotted)', { ovulationRange: true }],
    ...fertile,
    ['Today', { isToday: true }],
    ['Symptoms, mood or notes logged', {}, true],
  ];
  return (
    <details className="cal-legend">
      <summary>Legend</summary>
      <ul>
        {items.map(([label, cell, dot]) => (
          <li key={label}>
            <Swatch cell={cell} dot={dot} />
            {label}
          </li>
        ))}
      </ul>
    </details>
  );
}
