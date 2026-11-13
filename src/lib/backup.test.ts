// Sync rules (spec §9.4), against a fake server.
import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../db/normalize.ts';
import { day } from '../engine/test-helpers.ts';
import { forceUpload, planSync, runSync, type RemoteBackup, type RemoteStore } from './backup.ts';
import { buildSnapshot, fingerprint, type BackupSnapshot, type LocalData } from './snapshot.ts';

const NOW = new Date('2025-06-15T10:00:00Z');

function data(dates: string[]): LocalData {
  return {
    dailyLogs: dates.map((d) => day(d, { flow: 'medium' })),
    pauses: [],
    settings: { ...DEFAULT_SETTINGS, onboardingDone: true },
  };
}

function fakeStore(initial: BackupSnapshot | null) {
  let row: RemoteBackup | null = initial
    ? { snapshot: initial, updatedAt: '2025-06-01T00:00:00.000Z' }
    : null;
  const uploads: BackupSnapshot[] = [];
  const store: RemoteStore = {
    fetch: async () => row,
    upload: async (s) => {
      uploads.push(s);
      row = { snapshot: s, updatedAt: '2025-06-15T10:00:00.000Z' };
      return row.updatedAt;
    },
    remove: async () => {
      row = null;
    },
  };
  return { store, uploads };
}

const fp = (d: LocalData) => fingerprint(buildSnapshot(d, NOW));

describe('planSync', () => {
  const base = { localFp: 'L', syncedFp: 'S', localEmpty: false };
  it.each([
    [{ ...base, remoteFp: null }, 'upload'],
    [{ ...base, remoteFp: null, localEmpty: true }, 'nothing'],
    [{ ...base, remoteFp: 'L' }, 'in_sync'],
    [{ ...base, remoteFp: 'S' }, 'upload'], // only this phone changed
    [{ ...base, remoteFp: 'R' }, 'ask_conflict'], // changed elsewhere
    [{ ...base, remoteFp: 'R', localEmpty: true }, 'ask_restore'],
    [{ ...base, remoteFp: 'R', syncedFp: null }, 'ask_conflict'], // first sign-in here
  ] as const)('%o → %s', (input, expected) => {
    expect(planSync(input)).toBe(expected);
  });
});

describe('runSync', () => {
  it('uploads when there is no backup yet', async () => {
    const { store, uploads } = fakeStore(null);
    const r = await runSync({ store, local: data(['2025-06-01']), syncedFp: null, now: NOW });
    expect(r.kind).toBe('uploaded');
    expect(uploads).toHaveLength(1);
  });

  it('does nothing for an empty phone with no backup', async () => {
    const { store, uploads } = fakeStore(null);
    expect((await runSync({ store, local: data([]), syncedFp: null, now: NOW })).kind).toBe(
      'nothing',
    );
    expect(uploads).toHaveLength(0);
  });

  it('uploads local changes made since the last sync', async () => {
    const before = data(['2025-06-01']);
    const { store, uploads } = fakeStore(buildSnapshot(before, NOW));
    const r = await runSync({
      store,
      local: data(['2025-06-01', '2025-06-02']),
      syncedFp: await fp(before),
      now: NOW,
    });
    expect(r.kind).toBe('uploaded');
    expect(uploads).toHaveLength(1);
  });

  it('reports in-sync without uploading', async () => {
    const same = data(['2025-06-01']);
    const { store, uploads } = fakeStore(buildSnapshot(same, NOW));
    const r = await runSync({ store, local: same, syncedFp: null, now: NOW });
    expect(r.kind).toBe('in_sync');
    expect(uploads).toHaveLength(0);
  });

  it('asks before restoring onto an empty phone (never overwrites silently)', async () => {
    const { store, uploads } = fakeStore(buildSnapshot(data(['2025-05-01']), NOW));
    const r = await runSync({ store, local: data([]), syncedFp: null, now: NOW });
    expect(r).toMatchObject({ kind: 'ask', reason: 'restore' });
    expect(uploads).toHaveLength(0);
  });

  it('asks when both sides differ, and never uploads over the backup', async () => {
    const synced = data(['2025-05-01']);
    // The backup changed on another phone, and this phone changed too.
    const { store, uploads } = fakeStore(buildSnapshot(data(['2025-05-01', '2025-05-29']), NOW));
    const r = await runSync({
      store,
      local: data(['2025-05-01', '2025-06-01']),
      syncedFp: await fp(synced),
      now: NOW,
    });
    expect(r).toMatchObject({ kind: 'ask', reason: 'conflict' });
    expect(uploads).toHaveLength(0);
  });

  it('forceUpload replaces the backup when the user chooses this phone', async () => {
    const { store, uploads } = fakeStore(buildSnapshot(data(['2025-05-01']), NOW));
    const mine = data(['2025-06-01']);
    const r = await forceUpload(store, mine, NOW);
    expect(r.fingerprint).toBe(await fp(mine));
    expect(uploads).toHaveLength(1);
  });
});
