// Spec §7 Today: cycle status, the daily message, Log period / Period ended, and a
// quick log for today.
import { useState } from 'react';
import { DayEditor } from '../components/DayEditor.tsx';
import { FLOW_LABELS, MOOD_LABELS, PHASE_LABELS, SYMPTOM_LABELS } from '../content/labels.ts';
import type { Status } from '../engine/status.ts';
import type { DailyLog } from '../engine/types.ts';
import { days, formatLongDate, formatShortDate } from '../lib/format.ts';
import { endPeriod, logPeriodStart } from '../lib/periodActions.ts';
import { save } from '../lib/save.ts';
import { useDailyMessage } from '../lib/useDailyMessage.ts';
import { useDerived, type DerivedState } from '../lib/useDerived.ts';
import './Today.css';

/** Keep a short date like "Wed 9 Dec" on one line. */
const noWrap = (s: string) => s.replace(/ /g, ' ');

/** The line under the big day number. */
function nextLine(status: Status, nextStart: string | undefined): string {
  const { phase, daysUntilNext, daysLate } = status;
  switch (phase) {
    case 'no_data':
      return 'Log your period to get started.';
    case 'paused':
      return 'You can still log anything you like.';
    case 'late':
      return `Late by ${days(daysLate ?? 0)}`;
    case 'possibly_skipped':
      return daysUntilNext !== null && nextStart
        ? `Next likely period in ${days(daysUntilNext)} · ${noWrap(formatShortDate(nextStart))}`
        : 'Predictions have moved to your next likely period.';
    default:
      if (daysUntilNext === null || !nextStart) return '';
      if (daysUntilNext === 0) return 'Period expected today';
      return `Next period in ${days(daysUntilNext)} · ${noWrap(formatShortDate(nextStart))}`;
  }
}

function logSummary(log: DailyLog | undefined): string[] {
  if (!log) return [];
  return [
    ...(log.flow ? [`${FLOW_LABELS[log.flow]} flow`] : []),
    ...log.symptoms.map((s) => SYMPTOM_LABELS[s]),
    ...log.moods.map((m) => MOOD_LABELS[m]),
    ...(log.notes.trim() ? ['Note'] : []),
  ];
}

export function TodayScreen() {
  const derived = useDerived();
  if (!derived) return <p className="muted">Loading…</p>;
  return <Today derived={derived} />;
}

function Today({ derived }: { derived: DerivedState }) {
  const [editing, setEditing] = useState(false);
  const { today, logs, status, periodEstimate, cycleEstimate, predictions, settings } = derived;
  const { phase, cycleDay } = status;
  const next = predictions[0];

  const message = useDailyMessage({
    phase,
    funMode: settings.funMode,
    vars: { cycleDay, daysUntilNext: status.daysUntilNext },
    today,
    lastMessage: settings.lastMessage,
    recentMessageIds: settings.recentMessageIds,
  });

  const showDay = cycleDay !== null && phase !== 'paused';
  const showOf = showDay && phase !== 'late' && phase !== 'possibly_skipped';
  const todayLog = logs.find((l) => l.date === today);
  // Based on today's log rather than the phase, so it also works during a pause.
  const inPeriod = !!todayLog?.flow;
  const summary = logSummary(todayLog);

  return (
    <section className="today">
      <h1 className="visually-hidden">Today</h1>
      <p className="today__date muted">{formatLongDate(today, today)}</p>

      <div className={`status-card status-card--${phase}`}>
        <p className="status-card__phase">{PHASE_LABELS[phase]}</p>
        {showDay && (
          <p className="status-card__day">
            <span className="status-card__big">Day {cycleDay}</span>
            {showOf && <span className="status-card__of"> of ~{cycleEstimate.length}</span>}
          </p>
        )}
        <p className="status-card__next">{nextLine(status, next?.periodStart)}</p>
      </div>

      <p className="today__message" aria-live="polite">
        {message ?? ' '}
      </p>

      {inPeriod ? (
        <button
          type="button"
          className="btn btn--primary btn--block"
          onClick={() => save(endPeriod(logs, today))}
        >
          Period ended
        </button>
      ) : (
        <button
          type="button"
          className="btn btn--primary btn--block"
          onClick={() => save(logPeriodStart(logs, today, periodEstimate.length))}
        >
          Log period
        </button>
      )}

      <div className="today-log">
        <div className="today-log__text">
          <h2 className="today-log__title">Today’s log</h2>
          {summary.length > 0 ? (
            <ul className="today-log__tags">
              {summary.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ul>
          ) : (
            <p className="muted">Nothing logged yet.</p>
          )}
        </div>
        <button type="button" className="btn btn--secondary" onClick={() => setEditing(true)}>
          {summary.length > 0 ? 'Edit' : 'Add'}
          <span className="visually-hidden"> symptoms, mood or notes for today</span>
        </button>
      </div>

      {derived.irregular && phase !== 'paused' && (
        <p className="today__note muted">
          Your cycles vary quite a bit, so predictions are less certain. They’ll improve as you log
          more.
        </p>
      )}

      <DayEditor
        date={editing ? today : null}
        today={today}
        logs={logs}
        periodLength={periodEstimate.length}
        onClose={() => setEditing(false)}
      />
    </section>
  );
}
