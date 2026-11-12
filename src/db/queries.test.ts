// Integration tests for the Dexie layer, run against an in-memory IndexedDB.
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from './schema.ts';
import {
  addPause,
  deleteLog,
  deletePause,
  endPause,
  getAllLogs,
  getLog,
  getPauses,
  getSettings,
  patchLog,
  patchLogs,
  updateLog,
  updatePause,
  updateSettings,
} from './queries.ts';
import { DEFAULT_SETTINGS } from './normalize.ts';

beforeEach(async () => {
  await Promise.all([db.dailyLogs.clear(), db.pauses.clear(), db.settings.clear()]);
});

describe('schema', () => {
  it('is version 1 with the spec tables', async () => {
    await db.open();
    expect(db.verno).toBe(1);
    expect(db.tables.map((t) => t.name).sort()).toEqual(['dailyLogs', 'pauses', 'settings']);
  });
});

describe('daily logs', () => {
  it('creates, reads and returns logs in date order', async () => {
    await patchLog('2025-03-12', { flow: 'light' });
    await patchLog('2025-03-10', { flow: 'heavy' });
    const all = await getAllLogs();
    expect(all.map((l) => l.date)).toEqual(['2025-03-10', '2025-03-12']);
    expect((await getLog('2025-03-10'))?.flow).toBe('heavy');
  });

  it('deletes a day when everything on it is cleared', async () => {
    await patchLog('2025-03-10', { flow: 'medium', moods: ['calm'] });
    await patchLog('2025-03-10', { flow: null, moods: [] });
    expect(await getLog('2025-03-10')).toBeUndefined();
  });

  it('does not store an edit that leaves a new day empty', async () => {
    await patchLog('2025-03-10', { flow: null });
    expect(await getAllLogs()).toEqual([]);
  });

  it('does not bump updatedAt for a no-op edit', async () => {
    await patchLog('2025-03-10', { flow: 'light' });
    const before = (await getLog('2025-03-10'))!.updatedAt;
    await new Promise((r) => setTimeout(r, 5));
    await patchLog('2025-03-10', { flow: 'light' });
    expect((await getLog('2025-03-10'))!.updatedAt).toBe(before);
  });

  it('applies a batch atomically, with later patches building on earlier ones', async () => {
    await patchLog('2025-03-11', { flow: 'light' });
    await patchLogs([
      { date: '2025-03-10', patch: { flow: 'medium' } },
      { date: '2025-03-10', patch: { notes: 'ouch' } },
      { date: '2025-03-11', patch: { flow: null } },
    ]);
    expect(await getAllLogs()).toEqual([
      expect.objectContaining({ date: '2025-03-10', flow: 'medium', notes: 'ouch' }),
    ]);
  });

  it('rejects the whole batch if any date is invalid', async () => {
    await expect(
      patchLogs([
        { date: '2025-03-10', patch: { flow: 'medium' } },
        { date: '2025-02-30', patch: { flow: 'medium' } },
      ]),
    ).rejects.toThrow();
    expect(await getAllLogs()).toEqual([]);
  });

  it('updateLog builds on the stored value, so concurrent toggles both land', async () => {
    const add = (s: 'cramps' | 'acne') =>
      updateLog('2025-03-10', (cur) => ({ symptoms: [...cur.symptoms, s] }));
    await Promise.all([add('cramps'), add('acne')]);
    expect((await getLog('2025-03-10'))?.symptoms).toEqual(['cramps', 'acne']);
    await updateLog('2025-03-10', () => ({ symptoms: [] }));
    expect(await getLog('2025-03-10')).toBeUndefined();
  });

  it('deleteLog removes a day', async () => {
    await patchLog('2025-03-10', { notes: 'x' });
    await deleteLog('2025-03-10');
    expect(await getLog('2025-03-10')).toBeUndefined();
  });
});

describe('settings', () => {
  it('returns defaults before anything is stored', async () => {
    expect(await getSettings()).toEqual(DEFAULT_SETTINGS);
  });

  it('merges updates into the single main row', async () => {
    await updateSettings({ funMode: false });
    await updateSettings({ onboardingCycleLength: null, onboardingDone: true });
    const s = await getSettings();
    expect(s).toMatchObject({ funMode: false, onboardingCycleLength: null, onboardingDone: true });
    expect(await db.settings.count()).toBe(1);
  });

  it('rejects invalid updates without writing', async () => {
    await expect(updateSettings({ onboardingPeriodLength: -1 })).rejects.toThrow();
    expect(await db.settings.count()).toBe(0);
  });
});

describe('pauses', () => {
  it('adds, orders by start, ends and deletes pauses', async () => {
    const later = await addPause({ start: '2025-06-01', end: null, label: ' Pill ' });
    const earlier = await addPause({ start: '2025-01-01', end: '2025-02-01' });
    expect((await getPauses()).map((p) => p.id)).toEqual([earlier, later]);
    expect((await getPauses())[1]?.label).toBe('Pill');

    await endPause(later, '2025-07-01');
    expect((await getPauses())[1]?.end).toBe('2025-07-01');

    await deletePause(earlier);
    expect((await getPauses()).map((p) => p.id)).toEqual([later]);
  });

  it('rejects invalid pauses and unknown ids', async () => {
    await expect(addPause({ start: '2025-02-01', end: '2025-01-01' })).rejects.toThrow();
    const id = await addPause({ start: '2025-02-01', end: null });
    await expect(endPause(id, '2025-01-01')).rejects.toThrow();
    await expect(updatePause(9999, { end: null })).rejects.toThrow();
  });
});
