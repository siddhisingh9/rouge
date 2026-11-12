// Core domain types — spec §4. Lives in the engine (pure, no imports) so both the
// engine and the db layer can share them without the engine depending on Dexie.

/** A local calendar date, always "YYYY-MM-DD". Never a timestamp (spec §3). */
export type ISODate = string;

// The option lists are the single source of truth: the types are derived from them,
// and the UI / validation iterate over them. Order here is the canonical display order.

/** No spotting option, by design. */
export const FLOWS = ['light', 'medium', 'heavy'] as const;
export type Flow = (typeof FLOWS)[number];

export const SYMPTOMS = [
  'cramps',
  'headache',
  'bloating',
  'back_pain',
  'breast_tenderness',
  'acne',
  'fatigue',
  'cravings',
  'nausea',
  'digestive_issues',
  'trouble_sleeping',
] as const;
export type Symptom = (typeof SYMPTOMS)[number];

export const MOODS = [
  'happy',
  'calm',
  'energetic',
  'sad',
  'anxious',
  'irritable',
  'low_energy',
] as const;
export type Mood = (typeof MOODS)[number];

export interface DailyLog {
  date: ISODate; // primary key
  flow: Flow | null;
  symptoms: Symptom[];
  moods: Mood[]; // multi-select
  notes: string;
  updatedAt: number; // ms timestamp, for backup bookkeeping only
}

/** A prediction pause (hormonal birth control, pregnancy, etc.). */
export interface Pause {
  id?: number;
  start: ISODate;
  end: ISODate | null; // null = ongoing
  label?: string;
}
