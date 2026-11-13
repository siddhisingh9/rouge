// Settings → Backup (spec §9) and Export / Import (spec §7).
import { useRef, useState } from 'react';
import { replaceAllData } from '../db/queries.ts';
import type { ISODate } from '../engine/types.ts';
import { useBackup } from '../lib/backupContext.ts';
import { exportToFile, readImportFile } from '../lib/exportImport.ts';
import { formatAgo, formatMediumDate } from '../lib/format.ts';
import { SignInForm } from './SignInForm.tsx';

export function BackupSection({ lastBackupAt }: { lastBackupAt: number | null }) {
  const backup = useBackup();
  const [message, setMessage] = useState<string | null>(null);

  if (!backup.configured) {
    return (
      <p className="muted settings__hint">
        Backup isn’t set up in this version of the app. Your data is stored only on this phone; use
        Export below to keep a copy.
      </p>
    );
  }
  if (!backup.authReady) return <p className="muted settings__hint">Loading…</p>;

  const explainer = (
    <p className="muted settings__hint">
      Optional. When you’re signed in and online, a copy of your data is saved to the app owner’s
      Supabase project a few seconds after each change. In this version backups are{' '}
      <strong>not encrypted</strong>, so the app owner could read them.
    </p>
  );

  if (!backup.user) {
    return (
      <>
        {explainer}
        <SignInForm />
      </>
    );
  }

  const status = backup.busy
    ? 'Backing up…'
    : lastBackupAt
      ? `Last backup: ${formatAgo(lastBackupAt)}`
      : 'Not backed up yet';

  return (
    <>
      <div>
        <p>
          Signed in as <strong>{backup.user.email}</strong>
        </p>
        <p className="muted settings__hint" aria-live="polite">
          {status}
        </p>
      </div>
      {backup.error && (
        <p className="settings__error" role="alert">
          {backup.error}
        </p>
      )}
      {message && (
        <p className="settings__hint" role="status">
          {message}
        </p>
      )}
      <div className="settings__buttons">
        <button
          type="button"
          className="btn btn--secondary"
          disabled={backup.busy}
          onClick={() => {
            setMessage(null);
            void backup.backupNow();
          }}
        >
          Back up now
        </button>
        <button
          type="button"
          className="btn btn--secondary"
          disabled={backup.busy}
          onClick={async () => {
            setMessage(null);
            const r = await backup.restoreFromBackup();
            if (r === 'none') setMessage('There’s no backup on the server yet.');
            if (r === 'restored') setMessage('Restored from your backup.');
          }}
        >
          Restore from backup
        </button>
      </div>
      {explainer}
      <div className="settings__buttons">
        <button type="button" className="btn btn--ghost" onClick={() => void backup.signOut()}>
          Sign out
        </button>
        <button
          type="button"
          className="btn btn--ghost"
          onClick={() => {
            const ok = window.confirm(
              'Delete your backup from the server? You’ll be signed out so it isn’t backed up again. Data on this phone is not affected.',
            );
            if (ok) void backup.deleteBackup();
          }}
        >
          Delete my backup
        </button>
      </div>
    </>
  );
}

export function ExportImportSection({ today }: { today: ISODate }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const importFile = async (file: File) => {
    setMessage(null);
    setError(null);
    try {
      const snapshot = await readImportFile(file);
      const days = snapshot.dailyLogs.length;
      const ok = window.confirm(
        `Replace everything on this phone with this file (exported ${formatMediumDate(
          snapshot.exportedAt.slice(0, 10),
        )}, ${days} day${days === 1 ? '' : 's'} logged)? Your current data will be replaced. Export it first if you’re not sure.`,
      );
      if (!ok) return;
      await replaceAllData(snapshot);
      setMessage('Imported.');
    } catch (e) {
      setError((e as Error).message || 'This file couldn’t be imported.');
    }
  };

  return (
    <>
      <p className="muted settings__hint">
        Save everything you’ve logged to a file, or load a file you saved before. Files aren’t
        encrypted, so keep them somewhere private.
      </p>
      {error && (
        <p className="settings__error" role="alert">
          {error}
        </p>
      )}
      {message && (
        <p className="settings__hint" role="status">
          {message}
        </p>
      )}
      <div className="settings__buttons">
        <button
          type="button"
          className="btn btn--secondary"
          onClick={async () => {
            setMessage(null);
            setError(null);
            try {
              const r = await exportToFile(today);
              if (r !== 'cancelled') setMessage('Exported.');
            } catch (e) {
              setError((e as Error).message || 'Export failed.');
            }
          }}
        >
          Export to a file
        </button>
        <button
          type="button"
          className="btn btn--secondary"
          onClick={() => fileRef.current?.click()}
        >
          Import from a file
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = ''; // allow choosing the same file again
            if (file) void importFile(file);
          }}
        />
      </div>
    </>
  );
}
