// Spec §9.4: a backup reminder on Today (rules in lib/backupBanner.ts).
import { useState } from 'react';
import type { ISODate } from '../engine/types.ts';
import { useBackup } from '../lib/backupContext.ts';
import { shouldShowBackupBanner } from '../lib/backupBanner.ts';

const DISMISS_KEY = 'rouge.backupBanner.dismissedAt';

function readDismissedAt(): number {
  try {
    return Number(localStorage.getItem(DISMISS_KEY)) || 0;
  } catch {
    return 0;
  }
}

interface Props {
  lastBackupAt: number | null;
  firstLogDate: ISODate | undefined;
  today: ISODate;
  onOpenSettings: () => void;
}

export function BackupBanner({ lastBackupAt, firstLogDate, today, onOpenSettings }: Props) {
  const backup = useBackup();
  const [dismissedAt, setDismissedAt] = useState(readDismissedAt);
  // Read the clock once per mount (render must stay pure); Today re-mounts often enough.
  const [now] = useState(() => Date.now());

  const show =
    backup.authReady &&
    shouldShowBackupBanner({
      configured: backup.configured,
      signedIn: backup.user !== null,
      lastBackupAt,
      firstLogDate,
      today,
      now,
      dismissedAt,
    });
  if (!show) return null;

  const dismiss = () => {
    const now = Date.now();
    try {
      localStorage.setItem(DISMISS_KEY, String(now));
    } catch {
      // ignore: it just shows again next time
    }
    setDismissedAt(now);
  };

  return (
    <div className="backup-banner" role="note">
      <p>
        {lastBackupAt
          ? 'You haven’t backed up in over two weeks.'
          : 'Your data is only on this phone.'}{' '}
        Turn on backup so you don’t lose it if something happens to your phone.
      </p>
      <div className="backup-banner__actions">
        <button type="button" className="btn btn--secondary" onClick={onOpenSettings}>
          Set up backup
        </button>
        <button type="button" className="btn btn--ghost" onClick={dismiss}>
          Not now
        </button>
      </div>
    </div>
  );
}
