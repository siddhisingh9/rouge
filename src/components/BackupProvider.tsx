// Spec §9.4 — backup behaviour: auto backup ~10 s after the last change when signed in
// and online, catch-up on the `online` event, restore / conflict prompts. Everything
// here is optional: with backup unconfigured or offline, the app works as normal.
import { useLiveQuery } from 'dexie-react-hooks';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { readAllData, replaceAllData, updateSettings } from '../db/queries.ts';
import {
  backupConfigured,
  forceUpload,
  friendlyError,
  getClient,
  getCurrentUser,
  getSyncedFingerprint,
  onAuthChange,
  runSync,
  setSyncedFingerprint,
  signOut as signOutRemote,
  supabaseStore,
  type BackupUser,
} from '../lib/backup.ts';
import {
  BackupContext,
  type BackupContextValue,
  type BackupDecision,
  type DecisionChoice,
} from '../lib/backupContext.ts';
import { formatMediumDate } from '../lib/format.ts';
import { buildSnapshot, fingerprint } from '../lib/snapshot.ts';
import { BackupDecisionDialog } from './BackupDecisionDialog.tsx';

const AUTO_BACKUP_DELAY_MS = 10_000;

type Trigger = 'start' | 'auto' | 'manual';

export function BackupProvider({ children }: { children: ReactNode }) {
  const [authReady, setAuthReady] = useState(!backupConfigured);
  const [user, setUser] = useState<BackupUser | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [decision, setDecision] = useState<BackupDecision | null>(null);

  const userRef = useRef<BackupUser | null>(null);
  // Declared before the effects below, so it is updated before they run.
  useEffect(() => {
    userRef.current = user;
  }, [user]);
  const running = useRef(false);
  const rerun = useRef(false);
  // After "Decide later", no automatic syncs until the next launch or a manual action,
  // so the user isn't asked again on every edit.
  const deferred = useRef(false);

  const userId = user?.id ?? null;

  // --- Session ----------------------------------------------------------------
  useEffect(() => {
    if (!backupConfigured) return;
    let unsubscribe: (() => void) | undefined;
    let cancelled = false;
    const apply = (u: BackupUser | null) => {
      if (cancelled) return;
      // Keep the same object when the user hasn't changed (token refreshes).
      setUser((prev) => (prev?.id === u?.id && prev?.email === u?.email ? prev : u));
      setAuthReady(true);
    };
    getCurrentUser()
      .then(apply)
      .catch(() => apply(null));
    onAuthChange(apply)
      .then((off) => (cancelled ? off() : (unsubscribe = off)))
      .catch(() => {});
    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, []);

  // --- Sync -------------------------------------------------------------------
  const sync = useCallback(async (trigger: Trigger) => {
    const u = userRef.current;
    if (!u) return;
    if (!navigator.onLine) {
      if (trigger === 'manual')
        setError('You’re offline. Your data will back up when you’re back online.');
      return;
    }
    if (running.current) {
      rerun.current = true;
      return;
    }
    running.current = true;
    setBusy(true);
    setError(null);
    try {
      const store = supabaseStore(await getClient(), u.id);
      const local = await readAllData();
      const result = await runSync({
        store,
        local,
        syncedFp: getSyncedFingerprint(u.id),
        now: new Date(),
      });
      if (userRef.current?.id !== u.id) return; // signed out meanwhile
      switch (result.kind) {
        case 'uploaded':
          setSyncedFingerprint(u.id, result.fingerprint);
          await updateSettings({ lastBackupAt: Date.parse(result.updatedAt) });
          break;
        case 'in_sync':
          setSyncedFingerprint(u.id, result.fingerprint);
          if (local.settings.lastBackupAt === null) {
            await updateSettings({ lastBackupAt: Date.parse(result.remoteUpdatedAt) });
          }
          break;
        case 'ask':
          setDecision({
            reason: result.reason,
            remote: result.remote,
            remoteFingerprint: result.remoteFingerprint,
            local: result.local,
          });
          break;
        case 'nothing':
          break;
      }
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      running.current = false;
      setBusy(false);
      if (rerun.current) {
        // Something changed while we were syncing: go again (via the ref, so this
        // callback doesn't reference itself).
        rerun.current = false;
        void syncRef.current('auto');
      }
    }
  }, []);
  const syncRef = useRef(sync);
  useEffect(() => {
    syncRef.current = sync;
  }, [sync]);

  // On sign-in (or app start with a saved session): check against the server.
  useEffect(() => {
    if (!userId) return;
    deferred.current = false;
    // Next tick, not inside the effect itself; StrictMode's double effect cancels one.
    const timer = window.setTimeout(() => void sync('start'), 0);
    return () => window.clearTimeout(timer);
  }, [userId, sync]);

  // Auto backup: ~10 s after the last local change, if it differs from what's synced.
  const data = useLiveQuery(() => (backupConfigured ? readAllData() : null), []);
  useEffect(() => {
    if (!data || !userId || deferred.current || decision) return;
    let timer: number | undefined;
    let cancelled = false;
    void fingerprint(buildSnapshot(data, new Date())).then((fp) => {
      if (cancelled || fp === getSyncedFingerprint(userId)) return;
      timer = window.setTimeout(() => void sync('auto'), AUTO_BACKUP_DELAY_MS);
    });
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [data, userId, decision, sync]);

  // Back online: catch up on unsynced changes.
  useEffect(() => {
    if (!userId) return;
    const onOnline = async () => {
      if (deferred.current) return;
      const fp = await fingerprint(buildSnapshot(await readAllData(), new Date()));
      if (fp !== getSyncedFingerprint(userId)) void sync('auto');
    };
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  }, [userId, sync]);

  // --- Actions ----------------------------------------------------------------
  const resolveDecision = useCallback(
    async (choice: DecisionChoice) => {
      const u = userRef.current;
      const d = decision;
      if (!u || !d) return;
      if (choice === 'later') {
        deferred.current = true;
        setDecision(null);
        return;
      }
      setBusy(true);
      setError(null);
      try {
        if (choice === 'use_backup') {
          const at = Date.parse(d.remote.updatedAt);
          await replaceAllData(d.remote.snapshot, { lastBackupAt: at });
          setSyncedFingerprint(u.id, d.remoteFingerprint);
        } else {
          const store = supabaseStore(await getClient(), u.id);
          const r = await forceUpload(store, await readAllData(), new Date());
          setSyncedFingerprint(u.id, r.fingerprint);
          await updateSettings({ lastBackupAt: Date.parse(r.updatedAt) });
        }
        deferred.current = false;
        setDecision(null);
      } catch (e) {
        setError(friendlyError(e));
      } finally {
        setBusy(false);
      }
    },
    [decision],
  );

  const value = useMemo<BackupContextValue>(
    () => ({
      configured: backupConfigured,
      authReady,
      user,
      busy,
      error,
      decision,
      onSignedIn: (u) => setUser((prev) => (prev?.id === u.id ? prev : u)),
      backupNow: async () => {
        deferred.current = false;
        await sync('manual');
      },
      restoreFromBackup: async () => {
        const u = userRef.current;
        if (!u) return 'cancelled';
        setError(null);
        try {
          const store = supabaseStore(await getClient(), u.id);
          const remote = await store.fetch();
          if (!remote) return 'none';
          const days = remote.snapshot.dailyLogs.length;
          const ok = window.confirm(
            `Replace all data on this phone with your backup from ${formatMediumDate(
              remote.updatedAt.slice(0, 10),
            )} (${days} day${days === 1 ? '' : 's'} logged)? This can’t be undone.`,
          );
          if (!ok) return 'cancelled';
          await replaceAllData(remote.snapshot, { lastBackupAt: Date.parse(remote.updatedAt) });
          setSyncedFingerprint(u.id, await fingerprint(remote.snapshot));
          setDecision(null);
          return 'restored';
        } catch (e) {
          setError(friendlyError(e));
          return 'cancelled';
        }
      },
      deleteBackup: async () => {
        const u = userRef.current;
        if (!u) return;
        setError(null);
        try {
          await supabaseStore(await getClient(), u.id).remove();
          setSyncedFingerprint(u.id, null);
          await updateSettings({ lastBackupAt: null });
          // Signing out stops automatic backup from immediately re-creating it.
          await signOutRemote();
          setUser(null);
          setDecision(null);
        } catch (e) {
          setError(friendlyError(e));
        }
      },
      signOut: async () => {
        setError(null);
        try {
          await signOutRemote();
        } catch (e) {
          setError(friendlyError(e));
        }
        setUser(null);
        setDecision(null);
      },
      resolveDecision,
    }),
    [authReady, user, busy, error, decision, sync, resolveDecision],
  );

  return (
    <BackupContext.Provider value={value}>
      {children}
      {decision && (
        <BackupDecisionDialog
          decision={decision}
          busy={busy}
          error={error}
          onChoose={(c) => void resolveDecision(c)}
        />
      )}
    </BackupContext.Provider>
  );
}
