// Pure helpers for the data layer: validation, normalisation and defaults.
// No Dexie here, so everything in this file is unit-testable in Node.
import { DEFAULT_CYCLE, DEFAULT_PERIOD } from '../engine/constants.ts';
import {
  FLOWS,
  MOODS,
  SYMPTOMS,
  type DailyLog,
  type ISODate,
  type Pause,
  type Settings,
  type SettingsPatch,
} from './types.ts';

// ---------------------------------------------------------------------------
// Dates (minimal guard only; the full date helpers arrive with the engine)
// ---------------------------------------------------------------------------

const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** True for a real calendar date in "YYYY-MM-DD" form (rejects 2025-02-30 etc). */
export function isISODate(value: unknown): value is ISODate {
  if (typeof value !== 'string') return false;
  const m = ISO_DATE_RE.exec(value);
  if (!m) return false;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (month < 1 || month > 12 || day < 1) return false;
  // Day 0 of the next month = last day of this month. UTC avoids any DST/timezone effect.
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return day <= daysInMonth;
}

export function assertISODate(value: unknown, what = 'date'): asserts value is ISODate {
  if (!isISODate(value)) {
    throw new Error(`Invalid ${what}: expected "YYYY-MM-DD", got ${JSON.stringify(value)}`);
  }
}

// ---------------------------------------------------------------------------
// Daily logs
// ---------------------------------------------------------------------------

/** The editable fields of a day. `date` and `updatedAt` are managed by the db layer. */
export type LogPatch = Partial<Pick<DailyLog, 'flow' | 'symptoms' | 'moods' | 'notes'>>;

export function emptyLog(date: ISODate): DailyLog {
  return { date, flow: null, symptoms: [], moods: [], notes: '', updatedAt: 0 };
}

/** Spec §4: a day with nothing logged is deleted rather than stored. */
export function isEmptyLog(log: Pick<DailyLog, 'flow' | 'symptoms' | 'moods' | 'notes'>): boolean {
  return (
    log.flow === null &&
    log.symptoms.length === 0 &&
    log.moods.length === 0 &&
    log.notes.trim() === ''
  );
}

/** Dedupe and sort into canonical order; drops anything not in `allowed`. */
function canonical<T extends string>(values: readonly T[], allowed: readonly T[]): T[] {
  const present = new Set(values);
  return allowed.filter((v) => present.has(v));
}

function sameContent(a: DailyLog, b: DailyLog): boolean {
  return (
    a.flow === b.flow &&
    a.notes === b.notes &&
    a.symptoms.join() === b.symptoms.join() &&
    a.moods.join() === b.moods.join()
  );
}

/**
 * Apply an edit to a day.
 * Returns the row to store, `null` if the day should be deleted, or `'unchanged'`
 * when the edit is a no-op (so we don't bump `updatedAt` and trigger a backup).
 */
export function applyLogPatch(
  existing: DailyLog | undefined,
  date: ISODate,
  patch: LogPatch,
  now: number,
): DailyLog | null | 'unchanged' {
  assertISODate(date);
  if (patch.flow !== undefined && patch.flow !== null && !FLOWS.includes(patch.flow)) {
    throw new Error(`Invalid flow: ${JSON.stringify(patch.flow)}`);
  }

  const base = existing ?? emptyLog(date);
  const next: DailyLog = {
    date,
    flow: patch.flow !== undefined ? patch.flow : base.flow,
    symptoms: canonical(patch.symptoms ?? base.symptoms, SYMPTOMS),
    moods: canonical(patch.moods ?? base.moods, MOODS),
    notes: patch.notes ?? base.notes,
    updatedAt: now,
  };

  if (isEmptyLog(next)) return existing ? null : 'unchanged';
  if (existing && sameContent(existing, next)) return 'unchanged';
  return next;
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

export const SETTINGS_KEY = 'main' as const;

export const DEFAULT_SETTINGS: Readonly<Settings> = Object.freeze({
  key: SETTINGS_KEY,
  onboardingCycleLength: DEFAULT_CYCLE,
  onboardingPeriodLength: DEFAULT_PERIOD,
  onboardingDone: false,
  funMode: true,
  showFertileWindow: false,
  lastBackupAt: null,
  lastMessage: null,
  recentMessageIds: [],
});

/** Fill in any missing fields, so a missing or older settings row is always usable. */
export function withSettingsDefaults(row: Partial<Settings> | undefined): Settings {
  const merged = { ...DEFAULT_SETTINGS, ...row, key: SETTINGS_KEY };
  return { ...merged, recentMessageIds: [...merged.recentMessageIds] };
}

function isPositiveInt(n: unknown): boolean {
  return typeof n === 'number' && Number.isInteger(n) && n > 0;
}

export function validateSettingsPatch(patch: SettingsPatch): void {
  if ('key' in patch) throw new Error('The settings key cannot be changed');
  const { onboardingCycleLength: cycle, onboardingPeriodLength: period } = patch;
  if (cycle !== undefined && cycle !== null && !isPositiveInt(cycle)) {
    throw new Error(`Invalid onboardingCycleLength: ${JSON.stringify(cycle)}`);
  }
  if (period !== undefined && !isPositiveInt(period)) {
    throw new Error(`Invalid onboardingPeriodLength: ${JSON.stringify(period)}`);
  }
  if (patch.lastMessage) assertISODate(patch.lastMessage.date, 'lastMessage.date');
}

// ---------------------------------------------------------------------------
// Pauses
// ---------------------------------------------------------------------------

/** Validate a pause and tidy its label (trimmed; dropped when blank). */
export function normalizePause(pause: Pause): Pause {
  assertISODate(pause.start, 'pause start');
  if (pause.end !== null) {
    assertISODate(pause.end, 'pause end');
    // ISO dates compare correctly as strings.
    if (pause.end < pause.start) throw new Error('A pause cannot end before it starts');
  }
  const label = pause.label?.trim();
  const out: Pause = { start: pause.start, end: pause.end };
  if (pause.id !== undefined) out.id = pause.id;
  if (label) out.label = label;
  return out;
}
