// React context for backup state (provided by components/BackupProvider.tsx).
import { createContext, useContext } from 'react';
import type { BackupUser, RemoteBackup } from './backup.ts';
import type { BackupSnapshot } from './snapshot.ts';

/** A choice only the user can make (spec §9.4: never overwrite without confirmation). */
export interface BackupDecision {
  reason: 'restore' | 'conflict';
  remote: RemoteBackup;
  remoteFingerprint: string;
  local: BackupSnapshot;
}

export type DecisionChoice = 'use_backup' | 'keep_phone' | 'later';

export interface BackupContextValue {
  configured: boolean;
  /** False until we know whether someone is signed in. */
  authReady: boolean;
  user: BackupUser | null;
  busy: boolean;
  error: string | null;
  decision: BackupDecision | null;
  onSignedIn: (user: BackupUser) => void;
  backupNow: () => Promise<void>;
  /** Asks for confirmation itself. */
  restoreFromBackup: () => Promise<'restored' | 'none' | 'cancelled'>;
  /** Caller must confirm first. Deletes the server copy and signs out. */
  deleteBackup: () => Promise<void>;
  signOut: () => Promise<void>;
  resolveDecision: (choice: DecisionChoice) => Promise<void>;
}

export const BackupContext = createContext<BackupContextValue | null>(null);

export function useBackup(): BackupContextValue {
  const value = useContext(BackupContext);
  if (!value) throw new Error('useBackup must be used inside <BackupProvider>');
  return value;
}
