// Spec §9 — Supabase backup. The phone is the primary store; this is only a copy.
// The app must work normally when Supabase is unreachable or not configured, so the
// client is loaded lazily and every call can fail without affecting local data.
import type { Session, SupabaseClient } from '@supabase/supabase-js';
import {
  buildSnapshot,
  fingerprint,
  isEmptyData,
  parseSnapshot,
  SnapshotError,
  type BackupSnapshot,
  type LocalData,
} from './snapshot.ts';

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL ?? '';
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY ?? '';

/** False when the build has no Supabase settings: backup UI is hidden, all else works. */
export const backupConfigured = SUPABASE_URL !== '' && SUPABASE_ANON_KEY !== '';

let clientPromise: Promise<SupabaseClient> | null = null;

/** Loaded on first use, so the app starts without downloading the Supabase library. */
export function getClient(): Promise<SupabaseClient> {
  if (!backupConfigured) return Promise.reject(new Error('Backup is not set up.'));
  clientPromise ??= import('@supabase/supabase-js').then(({ createClient }) =>
    createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession: true, // the Home Screen app has its own storage, separate from Safari
        autoRefreshToken: true,
        detectSessionInUrl: false, // we use 6-digit codes, never links
      },
    }),
  );
  return clientPromise;
}

/** Turn library/network errors into something a person can act on. */
export function friendlyError(error: unknown): string {
  if (error instanceof SnapshotError) return error.message;
  const e = error as { message?: string; status?: number; code?: string } | null;
  const message = e?.message ?? '';
  if (e?.status === 429 || /rate limit/i.test(message)) {
    return 'Too many attempts. Please wait a few minutes and try again.';
  }
  if (/expired|invalid/i.test(message) && /token|otp|code/i.test(message)) {
    return 'That code is wrong or has expired. Check it, or ask for a new one.';
  }
  if (error instanceof TypeError || /fetch|network/i.test(message)) {
    return 'Couldn’t reach the backup server. Check your connection and try again.';
  }
  return message || 'Something went wrong. Please try again.';
}

// ---------------------------------------------------------------------------
// Auth — email one-time code (spec §9.2). Codes, not magic links: a link would open
// in Safari, not in the installed app, and the session would land in the wrong storage.
// ---------------------------------------------------------------------------

export interface BackupUser {
  id: string;
  email: string;
}

function toUser(session: Session | null): BackupUser | null {
  return session ? { id: session.user.id, email: session.user.email ?? '' } : null;
}

export async function sendCode(email: string): Promise<void> {
  const client = await getClient();
  const { error } = await client.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: true },
  });
  if (error) throw error;
}

export async function verifyCode(email: string, token: string): Promise<BackupUser> {
  const client = await getClient();
  const { data, error } = await client.auth.verifyOtp({ email, token, type: 'email' });
  if (error) throw error;
  const user = toUser(data.session);
  if (!user) throw new Error('Sign-in did not complete. Please try again.');
  return user;
}

export async function signOut(): Promise<void> {
  const client = await getClient();
  // 'local': sign out on this phone only, even if the server can't be reached.
  const { error } = await client.auth.signOut({ scope: 'local' });
  if (error) throw error;
}

export async function getCurrentUser(): Promise<BackupUser | null> {
  const client = await getClient();
  const { data } = await client.auth.getSession();
  return toUser(data.session);
}

/** Calls back on sign-in/out and token refresh. Returns an unsubscribe function. */
export async function onAuthChange(callback: (user: BackupUser | null) => void) {
  const client = await getClient();
  const { data } = client.auth.onAuthStateChange((_event, session) => callback(toUser(session)));
  return () => data.subscription.unsubscribe();
}

// ---------------------------------------------------------------------------
// Remote store — one row per user in public.backups (protected by RLS)
// ---------------------------------------------------------------------------

export interface RemoteBackup {
  snapshot: BackupSnapshot;
  updatedAt: string; // ISO timestamp
}

/** What sync needs from the server; a fake is used in tests. */
export interface RemoteStore {
  fetch(): Promise<RemoteBackup | null>;
  upload(snapshot: BackupSnapshot): Promise<string>; // returns updatedAt
  remove(): Promise<void>;
}

export function supabaseStore(client: SupabaseClient, userId: string): RemoteStore {
  const table = () => client.from('backups');
  return {
    async fetch() {
      const { data, error } = await table()
        .select('data, updated_at')
        .eq('user_id', userId)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      try {
        return { snapshot: parseSnapshot(data.data), updatedAt: data.updated_at as string };
      } catch (e) {
        throw new SnapshotError(`Your backup on the server can’t be read: ${(e as Error).message}`);
      }
    },
    async upload(snapshot) {
      const updatedAt = new Date().toISOString();
      const { error } = await table().upsert(
        { user_id: userId, data: snapshot, updated_at: updatedAt },
        { onConflict: 'user_id' },
      );
      if (error) throw error;
      return updatedAt;
    },
    async remove() {
      const { error } = await table().delete().eq('user_id', userId);
      if (error) throw error;
    },
  };
}

// ---------------------------------------------------------------------------
// Sync — never overwrite local or remote data without explicit confirmation (§9.4)
// ---------------------------------------------------------------------------

/**
 * "Last synced" = fingerprint of the data this phone last uploaded or restored, per
 * user. It's how we know whether the backup changed somewhere else since then.
 * Stored in localStorage: it is device bookkeeping, not user data.
 */
const syncedKey = (userId: string) => `rouge.backup.synced.${userId}`;

export function getSyncedFingerprint(userId: string): string | null {
  try {
    return localStorage.getItem(syncedKey(userId));
  } catch {
    return null;
  }
}

export function setSyncedFingerprint(userId: string, fp: string | null): void {
  try {
    if (fp) localStorage.setItem(syncedKey(userId), fp);
    else localStorage.removeItem(syncedKey(userId));
  } catch {
    // Storage blocked: worst case we ask the user again next time. Never data loss.
  }
}

export type SyncPlan = 'nothing' | 'upload' | 'in_sync' | 'ask_restore' | 'ask_conflict';

/**
 * Upload automatically only when that can't overwrite anything unseen: there is no
 * backup yet, or the backup is exactly what this phone last synced. Anything else
 * needs the user to choose.
 */
export function planSync(input: {
  localFp: string;
  remoteFp: string | null;
  syncedFp: string | null;
  localEmpty: boolean;
}): SyncPlan {
  const { localFp, remoteFp, syncedFp, localEmpty } = input;
  if (remoteFp === null) return localEmpty ? 'nothing' : 'upload';
  if (remoteFp === localFp) return 'in_sync';
  if (remoteFp === syncedFp) return 'upload'; // only this phone changed since last sync
  return localEmpty ? 'ask_restore' : 'ask_conflict';
}

export type SyncResult =
  | { kind: 'nothing' }
  | { kind: 'in_sync'; fingerprint: string; remoteUpdatedAt: string }
  | { kind: 'uploaded'; fingerprint: string; updatedAt: string }
  | {
      kind: 'ask';
      reason: 'restore' | 'conflict';
      remote: RemoteBackup;
      remoteFingerprint: string;
      local: BackupSnapshot;
    };

export async function runSync(input: {
  store: RemoteStore;
  local: LocalData;
  syncedFp: string | null;
  now: Date;
}): Promise<SyncResult> {
  const local = buildSnapshot(input.local, input.now);
  const localFp = await fingerprint(local);
  const remote = await input.store.fetch();
  const remoteFp = remote ? await fingerprint(remote.snapshot) : null;

  switch (
    planSync({ localFp, remoteFp, syncedFp: input.syncedFp, localEmpty: isEmptyData(local) })
  ) {
    case 'nothing':
      return { kind: 'nothing' };
    case 'in_sync':
      return { kind: 'in_sync', fingerprint: localFp, remoteUpdatedAt: remote!.updatedAt };
    case 'upload':
      return { kind: 'uploaded', fingerprint: localFp, updatedAt: await input.store.upload(local) };
    case 'ask_restore':
      return {
        kind: 'ask',
        reason: 'restore',
        remote: remote!,
        remoteFingerprint: remoteFp!,
        local,
      };
    case 'ask_conflict':
      return {
        kind: 'ask',
        reason: 'conflict',
        remote: remote!,
        remoteFingerprint: remoteFp!,
        local,
      };
  }
}

/** The user chose this phone's data: replace the backup with it. */
export async function forceUpload(store: RemoteStore, local: LocalData, now: Date) {
  const snapshot = buildSnapshot(local, now);
  return { fingerprint: await fingerprint(snapshot), updatedAt: await store.upload(snapshot) };
}
