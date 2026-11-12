// Typed reads and writes. All writes go through here so the rules in normalize.ts
// (delete empty days, canonical ordering, validation) are always applied.
import { db } from './schema.ts';
import {
  applyLogPatch,
  assertISODate,
  emptyLog,
  normalizePause,
  SETTINGS_KEY,
  validateSettingsPatch,
  withSettingsDefaults,
  type LogPatch,
} from './normalize.ts';
import type { DailyLog, ISODate, Pause, Settings, SettingsPatch } from './types.ts';

// ---------------------------------------------------------------------------
// Daily logs
// ---------------------------------------------------------------------------

/** All logs, oldest first (primary-key order). */
export function getAllLogs(): Promise<DailyLog[]> {
  return db.dailyLogs.toArray();
}

export function getLog(date: ISODate): Promise<DailyLog | undefined> {
  assertISODate(date);
  return db.dailyLogs.get(date);
}

/**
 * Edit several days in one transaction. Later patches for the same date build on
 * earlier ones. Days that end up empty are deleted.
 */
export async function patchLogs(
  patches: ReadonlyArray<{ date: ISODate; patch: LogPatch }>,
): Promise<void> {
  for (const { date } of patches) assertISODate(date);
  if (patches.length === 0) return;
  const now = Date.now();

  await db.transaction('rw', db.dailyLogs, async () => {
    const dates = [...new Set(patches.map((p) => p.date))];
    const stored = await db.dailyLogs.bulkGet(dates);
    // date → current row (undefined = nothing stored)
    const current = new Map<ISODate, DailyLog | undefined>(dates.map((d, i) => [d, stored[i]]));
    const original = new Map(current);

    for (const { date, patch } of patches) {
      const result = applyLogPatch(current.get(date), date, patch, now);
      if (result === 'unchanged') continue;
      current.set(date, result ?? undefined);
    }

    const toPut: DailyLog[] = [];
    const toDelete: ISODate[] = [];
    for (const [date, row] of current) {
      if (row === original.get(date)) continue; // untouched
      if (row) toPut.push(row);
      else toDelete.push(date);
    }
    if (toPut.length) await db.dailyLogs.bulkPut(toPut);
    if (toDelete.length) await db.dailyLogs.bulkDelete(toDelete);
  });
}

export function patchLog(date: ISODate, patch: LogPatch): Promise<void> {
  return patchLogs([{ date, patch }]);
}

/**
 * Read-modify-write one day inside a transaction, so quick successive taps (e.g.
 * toggling two symptoms) each build on the latest stored value instead of a stale one.
 */
export async function updateLog(
  date: ISODate,
  updater: (current: DailyLog) => LogPatch,
): Promise<void> {
  assertISODate(date);
  const now = Date.now();
  await db.transaction('rw', db.dailyLogs, async () => {
    const existing = await db.dailyLogs.get(date);
    const result = applyLogPatch(existing, date, updater(existing ?? emptyLog(date)), now);
    if (result === 'unchanged') return;
    if (result) await db.dailyLogs.put(result);
    else await db.dailyLogs.delete(date);
  });
}

export function deleteLog(date: ISODate): Promise<void> {
  assertISODate(date);
  return db.dailyLogs.delete(date);
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

/** Always returns a complete Settings object, even before the row exists. */
export async function getSettings(): Promise<Settings> {
  return withSettingsDefaults(await db.settings.get(SETTINGS_KEY));
}

export async function updateSettings(patch: SettingsPatch): Promise<void> {
  validateSettingsPatch(patch);
  await db.transaction('rw', db.settings, async () => {
    const current = withSettingsDefaults(await db.settings.get(SETTINGS_KEY));
    await db.settings.put({ ...current, ...patch, key: SETTINGS_KEY });
  });
}

/** Save the onboarding answers: logs and settings together, all or nothing. */
export async function completeOnboarding(
  settings: SettingsPatch,
  logPatches: ReadonlyArray<{ date: ISODate; patch: LogPatch }>,
): Promise<void> {
  const patch = { ...settings, onboardingDone: true };
  validateSettingsPatch(patch);
  await db.transaction('rw', db.settings, db.dailyLogs, async () => {
    await patchLogs(logPatches);
    await updateSettings(patch);
  });
}

// ---------------------------------------------------------------------------
// Pauses
// ---------------------------------------------------------------------------

/** All pauses, ordered by start date. */
export function getPauses(): Promise<Pause[]> {
  return db.pauses.orderBy('start').toArray();
}

/** Returns the new pause's id. */
export async function addPause(pause: Omit<Pause, 'id'>): Promise<number> {
  const { start, end, label } = normalizePause({ ...pause });
  const id = await db.pauses.add(label === undefined ? { start, end } : { start, end, label });
  // '++id' always auto-generates a key; Dexie's typings just can't express that.
  if (id === undefined) throw new Error('Failed to create pause');
  return id;
}

export async function updatePause(id: number, patch: Partial<Omit<Pause, 'id'>>): Promise<void> {
  await db.transaction('rw', db.pauses, async () => {
    const existing = await db.pauses.get(id);
    if (!existing) throw new Error(`Pause ${id} not found`);
    await db.pauses.put(normalizePause({ ...existing, ...patch, id }));
  });
}

/** End an ongoing pause on the given date. */
export function endPause(id: number, end: ISODate): Promise<void> {
  return updatePause(id, { end });
}

export function deletePause(id: number): Promise<void> {
  return db.pauses.delete(id);
}
