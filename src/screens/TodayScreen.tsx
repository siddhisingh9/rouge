// Milestone 4: the logging actions only. The full status card and phase messages
// arrive in Milestone 6.
import { useState } from 'react';
import { DayEditor } from '../components/DayEditor.tsx';
import type { Status } from '../engine/status.ts';
import { endPeriod, logPeriodStart } from '../lib/periodActions.ts';
import { save } from '../lib/save.ts';
import { useDerived } from '../lib/useDerived.ts';

/** Plain status line (placeholder until Milestone 6). */
function statusLine({ phase, cycleDay, daysUntilNext, daysLate }: Status): string {
  if (phase === 'no_data') return 'Log your period to get started.';
  if (phase === 'paused') return 'Predictions are paused.';
  const day = cycleDay !== null ? `Day ${cycleDay}` : '';
  if (phase === 'late') return `${day} · Late by ${daysLate} day${daysLate === 1 ? '' : 's'}`;
  if (phase === 'possibly_skipped') return `${day} · Possibly skipped`;
  if (daysUntilNext === null) return day;
  if (daysUntilNext === 0) return `${day} · Period expected today`;
  return `${day} · Next period in ${daysUntilNext} day${daysUntilNext === 1 ? '' : 's'}`;
}

export function TodayScreen() {
  const derived = useDerived();
  const [editing, setEditing] = useState(false);

  if (!derived) return <p className="muted">Loading…</p>;
  const { today, logs, status, periodEstimate } = derived;
  const inPeriod = status.phase === 'period';

  return (
    <section className="stack">
      <h1>Today</h1>
      <p className="muted">{statusLine(status)}</p>

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

      <button
        type="button"
        className="btn btn--secondary btn--block"
        onClick={() => setEditing(true)}
      >
        Log symptoms, mood or notes
      </button>

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
