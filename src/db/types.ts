// App-level stored types — spec §4. Domain types are re-exported from the engine.
import type { ISODate } from '../engine/types.ts';

export type { DailyLog, Flow, ISODate, Mood, Pause, Symptom } from '../engine/types.ts';
export { FLOWS, MOODS, SYMPTOMS } from '../engine/types.ts';

/** Single row, key = 'main'. */
export interface Settings {
  key: 'main';
  onboardingCycleLength: number | null; // null = "not sure" → engine uses 28
  onboardingPeriodLength: number; // default 5
  onboardingDone: boolean;
  funMode: boolean; // default true
  showFertileWindow: boolean; // default false
  lastBackupAt: number | null;
  lastMessage: { date: ISODate; id: string } | null;
  recentMessageIds: string[]; // last 5 shown, to avoid repeats
}

/** Fields callers may change. The key is fixed. */
export type SettingsPatch = Partial<Omit<Settings, 'key'>>;

/** Settings that travel in a backup/export (spec §9.3); the rest is per-device. */
export type PortableSettings = Omit<Settings, 'lastBackupAt' | 'lastMessage' | 'recentMessageIds'>;
