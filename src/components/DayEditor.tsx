// Spec §5.3 — edit flow, symptoms, moods and notes for any date. Every tap saves
// immediately; notes save when the field loses focus or the sheet closes.
import { useEffect, useId, useRef, useState } from 'react';
import { useLog } from '../db/hooks.ts';
import { emptyLog } from '../db/normalize.ts';
import { patchLog, updateLog } from '../db/queries.ts';
import { FLOWS, MOODS, SYMPTOMS, type DailyLog, type ISODate } from '../engine/types.ts';
import { FLOW_LABELS, MOOD_EMOJI, MOOD_LABELS, SYMPTOM_LABELS } from '../content/labels.ts';
import { formatLongDate } from '../lib/format.ts';
import { logPeriodStart } from '../lib/periodActions.ts';
import { save } from '../lib/save.ts';
import { DropIcon } from './icons.tsx';
import './DayEditor.css';

const DROPS = { light: 1, medium: 2, heavy: 3 } as const;

interface DayEditorProps {
  /** The day to edit; `null` keeps the sheet closed. */
  date: ISODate | null;
  today: ISODate;
  logs: readonly DailyLog[];
  /** Estimated period length, for "Period started this day". */
  periodLength: number;
  onClose: () => void;
}

export function DayEditor({ date, ...rest }: DayEditorProps) {
  if (!date) return null;
  // Keyed by date so the notes draft resets when a different day opens.
  return <DayEditorSheet key={date} date={date} {...rest} />;
}

function toggle<T>(list: readonly T[], item: T): T[] {
  return list.includes(item) ? list.filter((x) => x !== item) : [...list, item];
}

function DayEditorSheet({
  date,
  today,
  logs,
  periodLength,
  onClose,
}: DayEditorProps & { date: ISODate }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const notesId = useId();
  const stored = useLog(date);
  const current = stored ?? emptyLog(date);
  // null = not edited yet → show what's stored.
  const [notesDraft, setNotesDraft] = useState<string | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    // Guarded so React StrictMode's double effect doesn't throw.
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  const saveNotes = () => {
    if (notesDraft !== null && notesDraft !== current.notes) {
      save(patchLog(date, { notes: notesDraft }));
    }
  };

  const close = () => dialogRef.current?.close(); // fires onClose below

  const canStartPeriod = date <= today && current.flow === null;

  return (
    <dialog
      ref={dialogRef}
      className="sheet"
      aria-labelledby={titleId}
      onClose={() => {
        saveNotes();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) close(); // tap on the backdrop
      }}
    >
      <div className="sheet__body">
        <header className="sheet__header">
          <h2 id={titleId} className="sheet__title">
            {formatLongDate(date, today)}
          </h2>
          <button type="button" className="btn btn--ghost" onClick={close}>
            Done
          </button>
        </header>

        {stored === undefined ? (
          <p className="muted">Loading…</p>
        ) : (
          <>
            {canStartPeriod && (
              <button
                type="button"
                className="btn btn--primary btn--block"
                onClick={() => save(logPeriodStart(logs, date, periodLength))}
              >
                Period started this day
              </button>
            )}

            <fieldset className="field">
              <legend className="field__label">Flow</legend>
              <div className="chips chips--flow">
                {[null, ...FLOWS].map((flow) => (
                  <label key={flow ?? 'none'} className="chip">
                    <input
                      type="radio"
                      name={`flow-${date}`}
                      checked={current.flow === flow}
                      onChange={() => save(patchLog(date, { flow }))}
                    />
                    <span className={`chip__face${flow ? ` chip__face--${flow}` : ''}`}>
                      {flow && (
                        <span className="chip__drops" aria-hidden="true">
                          {Array.from({ length: DROPS[flow] }, (_, i) => (
                            <DropIcon key={i} size={12} />
                          ))}
                        </span>
                      )}
                      {flow ? FLOW_LABELS[flow] : 'None'}
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>

            <fieldset className="field">
              <legend className="field__label">Symptoms</legend>
              <div className="chips">
                {SYMPTOMS.map((s) => (
                  <label key={s} className="chip">
                    <input
                      type="checkbox"
                      checked={current.symptoms.includes(s)}
                      onChange={() =>
                        save(updateLog(date, (cur) => ({ symptoms: toggle(cur.symptoms, s) })))
                      }
                    />
                    <span className="chip__face">{SYMPTOM_LABELS[s]}</span>
                  </label>
                ))}
              </div>
            </fieldset>

            <fieldset className="field">
              <legend className="field__label">Mood</legend>
              <div className="chips">
                {MOODS.map((m) => (
                  <label key={m} className="chip">
                    <input
                      type="checkbox"
                      checked={current.moods.includes(m)}
                      onChange={() =>
                        save(updateLog(date, (cur) => ({ moods: toggle(cur.moods, m) })))
                      }
                    />
                    <span className="chip__face">
                      <span className="chip__emoji" aria-hidden="true">
                        {MOOD_EMOJI[m]}
                      </span>
                      {MOOD_LABELS[m]}
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>

            <div className="field">
              <label className="field__label" htmlFor={notesId}>
                Notes
              </label>
              <textarea
                id={notesId}
                className="textarea"
                rows={3}
                value={notesDraft ?? current.notes}
                onChange={(e) => setNotesDraft(e.target.value)}
                onBlur={saveNotes}
              />
            </div>
          </>
        )}
      </div>
    </dialog>
  );
}
