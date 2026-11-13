// Month grid with every visual state from spec §7 (Calendar). Months are stacked in one
// scrolling list, so days outside the month are left blank (each appears in its own month).
import { useEffect, useId, useRef } from 'react';
import { FLOW_LABELS } from '../content/labels.ts';
import type { ISODate } from '../engine/types.ts';
import { WEEK_STARTS_ON, type DayCell } from '../lib/calendarModel.ts';
import { formatLongDate, weekdayNames } from '../lib/format.ts';
import './Calendar.css';

const WEEKDAYS = weekdayNames(WEEK_STARTS_ON);

function dayClassName(cell: Omit<DayCell, 'date' | 'day'>): string {
  return [
    'cal-day',
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

/** The S M T W T F S row (shown once, in the sticky header). */
export function WeekdayRow() {
  return (
    <div className="cal-row cal-row--head" aria-hidden="true">
      {WEEKDAYS.map((w) => (
        <span key={w.long} className="cal-weekday">
          {w.short}
        </span>
      ))}
    </div>
  );
}

interface CalendarMonthProps {
  weeks: DayCell[][];
  today: ISODate;
  onSelect: (date: ISODate) => void;
}

export function CalendarMonth({ weeks, today, onSelect }: CalendarMonthProps) {
  // Skip weeks that belong entirely to the previous / next month.
  const rows = weeks.filter((week) => week.some((c) => c.inMonth));
  return (
    <div className="cal-grid">
      {rows.map((week) => (
        <div key={week[0]!.date} className="cal-row">
          {week.map((cell) =>
            cell.inMonth ? (
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
            ) : (
              <span key={cell.date} className="cal-day cal-day--blank" aria-hidden="true" />
            ),
          )}
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

/** The calendar key, in a bottom sheet. Rendered only while open. */
export function CalendarLegend({
  showFertileWindow,
  onClose,
}: {
  showFertileWindow: boolean;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

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
    <dialog
      ref={dialogRef}
      className="sheet"
      aria-labelledby={titleId}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) dialogRef.current?.close();
      }}
    >
      <div className="sheet__body">
        <header className="sheet__header">
          <h2 id={titleId} className="sheet__title">
            Calendar key
          </h2>
          <button
            type="button"
            className="btn btn--ghost"
            onClick={() => dialogRef.current?.close()}
          >
            Done
          </button>
        </header>
        <ul className="cal-legend">
          {items.map(([label, cell, dot]) => (
            <li key={label}>
              <Swatch cell={cell} dot={dot} />
              {label}
            </li>
          ))}
        </ul>
      </div>
    </dialog>
  );
}
