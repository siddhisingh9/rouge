// Spec §7 Settings → manage pauses (hormonal birth control, pregnancy, etc.).
import { useId, useState } from 'react';
import { addPause, deletePause, endPause } from '../db/queries.ts';
import type { ISODate, Pause } from '../engine/types.ts';
import { formatMediumDate } from '../lib/format.ts';
import { save } from '../lib/save.ts';

interface PausesSectionProps {
  pauses: readonly Pause[];
  today: ISODate;
}

export function PausesSection({ pauses, today }: PausesSectionProps) {
  const [adding, setAdding] = useState(false);

  return (
    <div className="stack">
      <p className="muted settings__hint">
        Pause predictions while something changes your cycle, like hormonal birth control or
        pregnancy. When a pause ends, your cycle count restarts the next day.
      </p>

      {pauses.length > 0 && (
        <ul className="pause-list">
          {[...pauses].reverse().map((p) => {
            const ongoing = p.end === null || p.end >= today;
            return (
              <li key={p.id} className="pause-list__item">
                <div>
                  <p className="pause-list__label">{p.label ?? 'Pause'}</p>
                  <p className="muted pause-list__dates">
                    {formatMediumDate(p.start)} –{' '}
                    {p.end === null ? 'ongoing' : formatMediumDate(p.end)}
                  </p>
                </div>
                <div className="pause-list__actions">
                  {ongoing && p.start <= today && p.end !== today && (
                    <button
                      type="button"
                      className="btn btn--secondary"
                      onClick={() => save(endPause(p.id!, today))}
                    >
                      End today
                    </button>
                  )}
                  <button
                    type="button"
                    className="btn btn--ghost"
                    onClick={() => {
                      if (window.confirm('Delete this pause?')) save(deletePause(p.id!));
                    }}
                  >
                    Delete
                    <span className="visually-hidden"> pause from {formatMediumDate(p.start)}</span>
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {adding ? (
        <AddPauseForm today={today} onDone={() => setAdding(false)} />
      ) : (
        <button type="button" className="btn btn--secondary" onClick={() => setAdding(true)}>
          + Add a pause
        </button>
      )}
    </div>
  );
}

function AddPauseForm({ today, onDone }: { today: ISODate; onDone: () => void }) {
  const id = useId();
  const [start, setStart] = useState<string>(today);
  const [ongoing, setOngoing] = useState(true);
  const [end, setEnd] = useState<string>(today);
  const [label, setLabel] = useState('');
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!start) return setError('Please choose a start date.');
    if (!ongoing && !end) return setError('Please choose an end date.');
    if (!ongoing && end < start) return setError('The end date can’t be before the start.');
    try {
      await addPause({ start, end: ongoing ? null : end, label });
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save this pause.');
    }
  };

  return (
    <form
      className="pause-form"
      noValidate // our own messages; native validation bubbles are unreliable on iOS
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <div className="settings__field">
        <label htmlFor={`${id}-label`}>Reason (optional)</label>
        <input
          id={`${id}-label`}
          className="input"
          type="text"
          placeholder="e.g. Birth control, pregnancy"
          maxLength={60}
          value={label}
          onChange={(e) => setLabel(e.target.value)}
        />
      </div>
      <div className="settings__field">
        <label htmlFor={`${id}-start`}>Start date</label>
        <input
          id={`${id}-start`}
          className="input"
          type="date"
          value={start}
          onChange={(e) => setStart(e.target.value)}
        />
      </div>
      <label className="settings__check">
        <input type="checkbox" checked={ongoing} onChange={(e) => setOngoing(e.target.checked)} />
        <span>Still ongoing</span>
      </label>
      {!ongoing && (
        <div className="settings__field">
          <label htmlFor={`${id}-end`}>End date</label>
          <input
            id={`${id}-end`}
            className="input"
            type="date"
            min={start}
            value={end}
            onChange={(e) => setEnd(e.target.value)}
          />
        </div>
      )}
      {error && (
        <p className="settings__error" role="alert">
          {error}
        </p>
      )}
      <div className="pause-form__actions">
        <button type="button" className="btn btn--ghost" onClick={onDone}>
          Cancel
        </button>
        <button type="submit" className="btn btn--primary">
          Save pause
        </button>
      </div>
    </form>
  );
}
