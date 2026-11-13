// "Backup from {date} found. Restore?" and the conflict prompt (spec §9.4).
import { useEffect, useId, useRef } from 'react';
import type { BackupDecision, DecisionChoice } from '../lib/backupContext.ts';
import { formatMediumDate } from '../lib/format.ts';
import type { BackupSnapshot } from '../lib/snapshot.ts';
import './BackupDecisionDialog.css';

function describe(s: BackupSnapshot): string {
  const days = s.dailyLogs.length;
  const last = s.dailyLogs[days - 1]?.date;
  if (days === 0) return 'Nothing logged';
  return `${days} day${days === 1 ? '' : 's'} logged, latest ${formatMediumDate(last!)}`;
}

interface Props {
  decision: BackupDecision;
  busy: boolean;
  error: string | null;
  onChoose: (choice: DecisionChoice) => void;
}

export function BackupDecisionDialog({ decision, busy, error, onChoose }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const backupDate = formatMediumDate(decision.remote.updatedAt.slice(0, 10));

  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  return (
    <dialog
      ref={ref}
      className="decision"
      aria-labelledby={titleId}
      // Esc = decide later; nothing is overwritten.
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onChoose('later');
      }}
    >
      {decision.reason === 'restore' ? (
        <>
          <h2 id={titleId}>Backup from {backupDate} found</h2>
          <p>Restore it to this phone?</p>
          <p className="muted decision__detail">{describe(decision.remote.snapshot)}.</p>
          {error && (
            <p className="decision__error" role="alert">
              {error}
            </p>
          )}
          <div className="decision__actions">
            <button
              type="button"
              className="btn btn--primary btn--block"
              disabled={busy}
              onClick={() => onChoose('use_backup')}
            >
              {busy ? 'Restoring…' : 'Restore'}
            </button>
            <button
              type="button"
              className="btn btn--ghost btn--block"
              disabled={busy}
              onClick={() => onChoose('later')}
            >
              Not now
            </button>
          </div>
        </>
      ) : (
        <>
          <h2 id={titleId}>This phone and your backup are different</h2>
          <p>Which one do you want to keep? The other will be replaced.</p>
          <dl className="decision__compare">
            <div>
              <dt>This phone</dt>
              <dd>{describe(decision.local)}</dd>
            </div>
            <div>
              <dt>Backup from {backupDate}</dt>
              <dd>{describe(decision.remote.snapshot)}</dd>
            </div>
          </dl>
          {error && (
            <p className="decision__error" role="alert">
              {error}
            </p>
          )}
          <div className="decision__actions">
            <button
              type="button"
              className="btn btn--secondary btn--block"
              disabled={busy}
              onClick={() => onChoose('keep_phone')}
            >
              Keep this phone’s data
            </button>
            <button
              type="button"
              className="btn btn--secondary btn--block"
              disabled={busy}
              onClick={() => onChoose('use_backup')}
            >
              Use the backup
            </button>
            <button
              type="button"
              className="btn btn--ghost btn--block"
              disabled={busy}
              onClick={() => onChoose('later')}
            >
              Decide later
            </button>
          </div>
          <p className="muted decision__detail">
            Tip: export this phone’s data first (Settings → Export) if you’re not sure.
          </p>
        </>
      )}
    </dialog>
  );
}
