// Spec §9.3 — the backup / export snapshot. One JSON blob, so v2 can encrypt it whole.
// Pure: build, validate and fingerprint snapshots.
import { applyLogPatch, normalizePause, validateSettingsPatch } from '../db/normalize.ts';
import type { PortableSettings, Settings } from '../db/types.ts';
import { isISODate } from '../engine/dates.ts';
import {
  FLOWS,
  MOODS,
  SYMPTOMS,
  type DailyLog,
  type Flow,
  type Mood,
  type Pause,
  type Symptom,
} from '../engine/types.ts';

export const SCHEMA_VERSION = 1;

export type SnapshotSettings = PortableSettings;

export interface BackupSnapshot {
  schemaVersion: 1;
  exportedAt: string; // ISO timestamp
  dailyLogs: DailyLog[];
  pauses: Pause[];
  settings: SnapshotSettings;
}

export interface LocalData {
  dailyLogs: DailyLog[];
  pauses: Pause[];
  settings: Settings;
}

export function buildSnapshot(data: LocalData, now: Date): BackupSnapshot {
  // lastBackupAt / lastMessage / recentMessageIds are left out on purpose: they're
  // per-device bookkeeping that shouldn't travel between phones.
  const s = data.settings;
  return {
    schemaVersion: SCHEMA_VERSION,
    exportedAt: now.toISOString(),
    dailyLogs: data.dailyLogs,
    pauses: data.pauses,
    settings: {
      key: 'main',
      onboardingCycleLength: s.onboardingCycleLength,
      onboardingPeriodLength: s.onboardingPeriodLength,
      onboardingDone: s.onboardingDone,
      funMode: s.funMode,
      showFertileWindow: s.showFertileWindow,
    },
  };
}

/** Nothing worth backing up yet (settings alone don't count). */
export function isEmptyData(s: Pick<BackupSnapshot, 'dailyLogs' | 'pauses'>): boolean {
  return s.dailyLogs.length === 0 && s.pauses.length === 0;
}

// ---------------------------------------------------------------------------
// Validation — everything read from a file or the server is untrusted.
// ---------------------------------------------------------------------------

export class SnapshotError extends Error {
  override name = 'SnapshotError';
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function fail(message: string): never {
  throw new SnapshotError(message);
}

function parseLog(raw: unknown, i: number): DailyLog | null {
  if (!isRecord(raw)) fail(`Day ${i + 1} is not an object.`);
  const { date, flow, symptoms, moods, notes, updatedAt } = raw;
  if (!isISODate(date)) fail(`Day ${i + 1} has an invalid date.`);
  const oneOf = (list: readonly string[], v: unknown) => typeof v === 'string' && list.includes(v);
  if (flow !== null && !oneOf(FLOWS, flow)) fail(`${date}: unknown flow.`);
  if (!Array.isArray(symptoms) || !symptoms.every((s) => oneOf(SYMPTOMS, s))) {
    fail(`${date}: unknown symptom.`);
  }
  if (!Array.isArray(moods) || !moods.every((m) => oneOf(MOODS, m))) {
    fail(`${date}: unknown mood.`);
  }
  if (typeof notes !== 'string') fail(`${date}: notes must be text.`);
  const stamp = typeof updatedAt === 'number' && Number.isFinite(updatedAt) ? updatedAt : 0;
  // Reuse the normal write rules: canonical order, and empty days dropped.
  const patch = {
    flow: flow as Flow | null,
    symptoms: symptoms as Symptom[],
    moods: moods as Mood[],
    notes,
  };
  const result = applyLogPatch(undefined, date, patch, stamp);
  return result === 'unchanged' || result === null ? null : result;
}

function parsePause(raw: unknown, i: number): Pause {
  if (!isRecord(raw)) fail(`Pause ${i + 1} is not an object.`);
  const { start, end, label } = raw;
  if (label !== undefined && typeof label !== 'string') fail(`Pause ${i + 1}: bad label.`);
  try {
    const p = normalizePause({
      start: start as string,
      end: (end ?? null) as string | null,
      ...(typeof label === 'string' ? { label } : {}),
    });
    return p; // ids are not carried over; the database assigns new ones
  } catch (e) {
    fail(`Pause ${i + 1}: ${(e as Error).message}`);
  }
}

function parseSettings(raw: unknown): SnapshotSettings {
  if (!isRecord(raw)) fail('Settings are missing.');
  const s = {
    key: 'main' as const,
    onboardingCycleLength: raw.onboardingCycleLength,
    onboardingPeriodLength: raw.onboardingPeriodLength,
    onboardingDone: raw.onboardingDone,
    funMode: raw.funMode,
    showFertileWindow: raw.showFertileWindow,
  };
  for (const k of ['onboardingDone', 'funMode', 'showFertileWindow'] as const) {
    if (typeof s[k] !== 'boolean') fail(`Setting "${k}" must be true or false.`);
  }
  try {
    validateSettingsPatch({
      onboardingCycleLength: s.onboardingCycleLength as number | null,
      onboardingPeriodLength: s.onboardingPeriodLength as number,
    });
  } catch (e) {
    fail((e as Error).message);
  }
  if (s.onboardingCycleLength === undefined) fail('Setting "onboardingCycleLength" is missing.');
  if (s.onboardingPeriodLength === undefined) fail('Setting "onboardingPeriodLength" is missing.');
  return s as SnapshotSettings;
}

/** Validate untrusted JSON as a snapshot. Throws SnapshotError with a readable message. */
export function parseSnapshot(raw: unknown): BackupSnapshot {
  if (!isRecord(raw)) fail('This file is not a Rouge backup.');
  if (raw.schemaVersion !== SCHEMA_VERSION) {
    fail(
      typeof raw.schemaVersion === 'number' && raw.schemaVersion > SCHEMA_VERSION
        ? 'This backup was made by a newer version of Rouge.'
        : 'This file is not a Rouge backup.',
    );
  }
  if (typeof raw.exportedAt !== 'string' || Number.isNaN(Date.parse(raw.exportedAt))) {
    fail('This backup has no valid date.');
  }
  if (!Array.isArray(raw.dailyLogs)) fail('This backup has no days.');
  if (!Array.isArray(raw.pauses)) fail('This backup has no pauses list.');

  const byDate = new Map<string, DailyLog>();
  raw.dailyLogs.forEach((l, i) => {
    const log = parseLog(l, i);
    if (!log) return;
    if (byDate.has(log.date)) fail(`${log.date} appears twice.`);
    byDate.set(log.date, log);
  });

  return {
    schemaVersion: SCHEMA_VERSION,
    exportedAt: raw.exportedAt,
    dailyLogs: [...byDate.values()].sort((a, b) => (a.date < b.date ? -1 : 1)),
    pauses: raw.pauses.map(parsePause),
    settings: parseSettings(raw.settings),
  };
}

// ---------------------------------------------------------------------------
// Fingerprint — "is this the same data?" ignoring timestamps and database ids.
// ---------------------------------------------------------------------------

/** Canonical JSON of the content only. Same data → same string, whatever its history. */
export function canonicalContent(s: Pick<BackupSnapshot, 'dailyLogs' | 'pauses' | 'settings'>) {
  const logs = [...s.dailyLogs]
    .sort((a, b) => (a.date < b.date ? -1 : 1))
    .map((l) => [l.date, l.flow, [...l.symptoms].sort(), [...l.moods].sort(), l.notes]);
  const pauses = s.pauses
    .map((p) => [p.start, p.end, p.label ?? ''])
    .sort((a, b) => (JSON.stringify(a) < JSON.stringify(b) ? -1 : 1));
  const { onboardingCycleLength, onboardingPeriodLength, onboardingDone, funMode } = s.settings;
  const settings = [
    onboardingCycleLength,
    onboardingPeriodLength,
    onboardingDone,
    funMode,
    s.settings.showFertileWindow,
  ];
  return JSON.stringify({ logs, pauses, settings });
}

/** SHA-256 of the canonical content, hex. */
export async function fingerprint(
  s: Pick<BackupSnapshot, 'dailyLogs' | 'pauses' | 'settings'>,
): Promise<string> {
  const bytes = new TextEncoder().encode(canonicalContent(s));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
