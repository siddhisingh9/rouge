// Spec §7 Calendar, as one continuous vertical scroll of months. A sticky header shows
// the month currently at the top, the weekday letters, "Today" and the key.
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { CalendarLegend, CalendarMonth, WeekdayRow } from '../components/CalendarMonth.tsx';
import { DayEditor } from '../components/DayEditor.tsx';
import { InfoIcon } from '../components/icons.tsx';
import type { ISODate } from '../engine/types.ts';
import {
  buildMonth,
  monthsBetween,
  shiftMonth,
  yearMonthOf,
  type YearMonth,
} from '../lib/calendarModel.ts';
import { formatMonthYear } from '../lib/format.ts';
import { useDerived, type DerivedState } from '../lib/useDerived.ts';
import '../components/Calendar.css';

/** Months shown before today's month at first, and how many "Show earlier" adds. */
const MONTHS_BACK = 6;
/** At least this many months after today's month, even without predictions. */
const MIN_MONTHS_AHEAD = 3;

const key = (ym: YearMonth) => `${ym.year}-${String(ym.month).padStart(2, '0')}`;

export function CalendarScreen() {
  const derived = useDerived();
  if (!derived) return <p className="muted">Loading…</p>;
  return <Calendar derived={derived} />;
}

function Calendar({ derived }: { derived: DerivedState }) {
  const { today, logs, predictions, settings, status, irregular } = derived;
  const thisMonth = yearMonthOf(today);
  const [monthsBack, setMonthsBack] = useState(MONTHS_BACK);
  const [editing, setEditing] = useState<ISODate | null>(null);
  const [showKey, setShowKey] = useState(false);
  const [visible, setVisible] = useState(key(thisMonth));

  const months = useMemo(() => {
    const thisMonth = yearMonthOf(today);
    const lastPrediction = predictions[predictions.length - 1];
    const ahead = Math.max(
      MIN_MONTHS_AHEAD,
      lastPrediction ? monthsBetween(thisMonth, yearMonthOf(lastPrediction.periodEnd)) : 0,
    );
    const first = shiftMonth(thisMonth, -monthsBack);
    return Array.from({ length: monthsBack + ahead + 1 }, (_, i) => {
      const ym = shiftMonth(first, i);
      return {
        ym,
        key: key(ym),
        weeks: buildMonth({
          ym,
          today,
          logs,
          predictions,
          showFertileWindow: settings.showFertileWindow,
        }),
      };
    });
  }, [today, logs, predictions, settings.showFertileWindow, monthsBack]);

  const sections = useRef(new Map<string, HTMLElement>());
  const header = useRef<HTMLDivElement>(null);
  const todayKey = key(thisMonth);

  const scrollToMonth = useCallback((k: string, behavior: ScrollBehavior = 'auto') => {
    sections.current.get(k)?.scrollIntoView({ block: 'start', behavior });
  }, []);

  // Open on this month (only when the screen opens, not when the date changes).
  const openOn = useRef(todayKey);
  useLayoutEffect(() => {
    scrollToMonth(openOn.current);
  }, [scrollToMonth]);

  // Keep the page from jumping when earlier months are added above.
  const heightBefore = useRef<number | null>(null);
  useLayoutEffect(() => {
    if (heightBefore.current === null) return;
    window.scrollBy(0, document.documentElement.scrollHeight - heightBefore.current);
    heightBefore.current = null;
  }, [monthsBack]);

  // Which month is under the sticky header.
  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      const line = (header.current?.getBoundingClientRect().bottom ?? 0) + 8;
      // The lowest month whose top has passed the header; above the first month,
      // the first month.
      let current: string | null = null;
      let best = -Infinity;
      let first: string | null = null;
      let firstTop = Infinity;
      for (const [k, el] of sections.current) {
        const top = el.getBoundingClientRect().top;
        if (top <= line && top > best) {
          best = top;
          current = k;
        }
        if (top < firstTop) {
          firstTop = top;
          first = k;
        }
      }
      current ??= first;
      if (current) setVisible(current);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      cancelAnimationFrame(frame);
    };
  }, [months]);

  const visibleYm = months.find((m) => m.key === visible)?.ym ?? thisMonth;
  const { phase } = status;

  return (
    <section className="calendar">
      <h1 className="visually-hidden">Calendar</h1>

      <div ref={header} className="cal-sticky">
        <div className="cal-sticky__bar">
          <p className="cal-sticky__title" aria-hidden="true">
            {formatMonthYear(visibleYm)}
          </p>
          {visible !== todayKey && (
            <button
              type="button"
              className="btn btn--secondary btn--small"
              aria-label="Scroll to today"
              onClick={() => scrollToMonth(todayKey, 'smooth')}
            >
              Today
            </button>
          )}
          <button
            type="button"
            className="btn btn--icon btn--small cal-sticky__key"
            onClick={() => setShowKey(true)}
          >
            <InfoIcon size={20} />
            <span className="visually-hidden">Calendar key</span>
          </button>
        </div>
        <WeekdayRow />
      </div>

      {(phase === 'paused' || phase === 'no_data' || irregular) && (
        <div className="cal-notes">
          {phase === 'paused' && <p className="cal-note muted">Predictions are paused.</p>}
          {phase === 'no_data' && (
            <p className="cal-note muted">
              Log a period to see predictions. Tap any day to log it.
            </p>
          )}
          {irregular && phase !== 'paused' && (
            <p className="cal-note muted">
              Your cycles vary quite a bit, so predictions are less certain and only shown 3 months
              ahead.
            </p>
          )}
        </div>
      )}

      <div className="cal-earlier">
        <button
          type="button"
          className="btn btn--secondary"
          onClick={() => {
            heightBefore.current = document.documentElement.scrollHeight;
            setMonthsBack((n) => n + MONTHS_BACK);
          }}
        >
          Show earlier months
        </button>
      </div>

      {months.map((m) => (
        <section
          key={m.key}
          ref={(el) => {
            if (el) sections.current.set(m.key, el);
            else sections.current.delete(m.key);
          }}
          className="cal-month"
          aria-label={formatMonthYear(m.ym)}
        >
          <h2 className="cal-month__title">{formatMonthYear(m.ym)}</h2>
          <CalendarMonth weeks={m.weeks} today={today} onSelect={setEditing} />
        </section>
      ))}

      <p className="cal-end muted">Predictions are estimates, not medical advice.</p>

      {showKey && (
        <CalendarLegend
          showFertileWindow={settings.showFertileWindow}
          onClose={() => setShowKey(false)}
        />
      )}

      <DayEditor
        date={editing}
        today={today}
        logs={logs}
        periodLength={derived.periodEstimate.length}
        onClose={() => setEditing(null)}
      />
    </section>
  );
}
