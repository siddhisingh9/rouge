import { useMemo, useState } from 'react';
import { CalendarLegend, CalendarMonth } from '../components/CalendarMonth.tsx';
import { DayEditor } from '../components/DayEditor.tsx';
import type { ISODate } from '../engine/types.ts';
import { buildMonth, shiftMonth, yearMonthOf, type YearMonth } from '../lib/calendarModel.ts';
import { formatMonthYear } from '../lib/format.ts';
import { todayISO } from '../lib/today.ts';
import { useDerived } from '../lib/useDerived.ts';

export function CalendarScreen() {
  const derived = useDerived();
  const [ym, setYm] = useState<YearMonth>(() => yearMonthOf(todayISO()));
  const [editing, setEditing] = useState<ISODate | null>(null);

  const weeks = useMemo(
    () =>
      derived &&
      buildMonth({
        ym,
        today: derived.today,
        logs: derived.logs,
        predictions: derived.predictions,
        showFertileWindow: derived.settings.showFertileWindow,
      }),
    [derived, ym],
  );

  if (!derived || !weeks) return <p className="muted">Loading…</p>;

  const thisMonth = yearMonthOf(derived.today);
  const onThisMonth = ym.year === thisMonth.year && ym.month === thisMonth.month;
  const go = (delta: number) => setYm((cur) => shiftMonth(cur, delta));
  const { phase } = derived.status;

  return (
    <section>
      <h1 className="visually-hidden">Calendar</h1>
      <div className="cal-header">
        <button
          type="button"
          className="btn btn--icon"
          aria-label="Previous month"
          onClick={() => go(-1)}
        >
          ‹
        </button>
        <h2 className="cal-header__title" aria-live="polite">
          {formatMonthYear(ym)}
        </h2>
        <button
          type="button"
          className="btn btn--icon"
          aria-label="Next month"
          onClick={() => go(1)}
        >
          ›
        </button>
      </div>

      <CalendarMonth
        weeks={weeks}
        today={derived.today}
        onSelect={setEditing}
        onSwipe={(delta) => go(delta)}
      />

      <div className="cal-actions">
        {!onThisMonth && (
          <button type="button" className="btn btn--secondary" onClick={() => setYm(thisMonth)}>
            Jump to today
          </button>
        )}
      </div>

      {phase === 'paused' && <p className="cal-note muted">Predictions are paused.</p>}
      {phase === 'no_data' && (
        <p className="cal-note muted">Log a period to see predictions. Tap any day to log it.</p>
      )}
      {derived.irregular && phase !== 'paused' && (
        <p className="cal-note muted">
          Your cycles vary quite a bit, so predictions are less certain and only shown 3 months
          ahead.
        </p>
      )}

      <CalendarLegend showFertileWindow={derived.settings.showFertileWindow} />

      <DayEditor
        date={editing}
        today={derived.today}
        logs={derived.logs}
        periodLength={derived.periodEstimate.length}
        onClose={() => setEditing(null)}
      />
    </section>
  );
}
