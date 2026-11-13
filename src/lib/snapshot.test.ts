import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../db/normalize.ts';
import { day } from '../engine/test-helpers.ts';
import {
  buildSnapshot,
  fingerprint,
  isEmptyData,
  parseSnapshot,
  SnapshotError,
  type LocalData,
} from './snapshot.ts';

const NOW = new Date('2025-06-15T10:00:00Z');
const local = (over: Partial<LocalData> = {}): LocalData => ({
  dailyLogs: [
    day('2025-06-01', { flow: 'heavy', symptoms: ['cramps'] }),
    day('2025-06-02', { flow: 'medium', moods: ['calm'], notes: 'ok' }),
  ],
  pauses: [{ id: 3, start: '2025-01-01', end: '2025-02-01', label: 'Pill' }],
  settings: {
    ...DEFAULT_SETTINGS,
    onboardingDone: true,
    lastBackupAt: 123,
    lastMessage: { date: '2025-06-15', id: 'f1' },
    recentMessageIds: ['f1'],
  },
  ...over,
});

describe('buildSnapshot (spec §9.3)', () => {
  it('has the spec shape and leaves out per-device fields', () => {
    const s = buildSnapshot(local(), NOW);
    expect(s.schemaVersion).toBe(1);
    expect(s.exportedAt).toBe('2025-06-15T10:00:00.000Z');
    expect(s.dailyLogs).toHaveLength(2);
    expect(s.settings).toEqual({
      key: 'main',
      onboardingCycleLength: 28,
      onboardingPeriodLength: 5,
      onboardingDone: true,
      funMode: true,
      showFertileWindow: false,
    });
    expect(s.settings).not.toHaveProperty('lastBackupAt');
    expect(s.settings).not.toHaveProperty('lastMessage');
    expect(s.settings).not.toHaveProperty('recentMessageIds');
  });

  it('knows when there is nothing to back up', () => {
    expect(isEmptyData(buildSnapshot(local({ dailyLogs: [], pauses: [] }), NOW))).toBe(true);
    expect(isEmptyData(buildSnapshot(local(), NOW))).toBe(false);
  });
});

describe('parseSnapshot', () => {
  const valid = () => JSON.parse(JSON.stringify(buildSnapshot(local(), NOW)));

  it('round-trips through JSON', () => {
    const parsed = parseSnapshot(valid());
    expect(parsed.dailyLogs.map((l) => l.date)).toEqual(['2025-06-01', '2025-06-02']);
    expect(parsed.pauses).toEqual([{ start: '2025-01-01', end: '2025-02-01', label: 'Pill' }]);
    expect(parsed.settings.onboardingDone).toBe(true);
  });

  it('normalises: canonical order, empty days dropped, logs sorted', () => {
    const raw = valid();
    raw.dailyLogs = [
      { date: '2025-06-03', flow: null, symptoms: ['nausea', 'cramps'], moods: [], notes: '' },
      { date: '2025-06-01', flow: null, symptoms: [], moods: [], notes: '  ' },
    ];
    const parsed = parseSnapshot(raw);
    expect(parsed.dailyLogs).toHaveLength(1);
    expect(parsed.dailyLogs[0]?.symptoms).toEqual(['cramps', 'nausea']);
  });

  it.each([
    ['not an object', () => 'hello', /not a Rouge backup/],
    ['wrong version', () => ({ ...valid(), schemaVersion: 2 }), /newer version/],
    [
      'bad date',
      () => ({ ...valid(), dailyLogs: [{ ...valid().dailyLogs[0], date: '2025-02-30' }] }),
      /invalid date/,
    ],
    [
      'unknown flow',
      () => ({ ...valid(), dailyLogs: [{ ...valid().dailyLogs[0], flow: 'spotting' }] }),
      /unknown flow/,
    ],
    [
      'unknown symptom',
      () => ({ ...valid(), dailyLogs: [{ ...valid().dailyLogs[0], symptoms: ['x'] }] }),
      /unknown symptom/,
    ],
    [
      'duplicate day',
      () => ({ ...valid(), dailyLogs: [valid().dailyLogs[0], valid().dailyLogs[0]] }),
      /twice/,
    ],
    [
      'bad pause',
      () => ({ ...valid(), pauses: [{ start: '2025-02-01', end: '2025-01-01' }] }),
      /Pause 1/,
    ],
    [
      'bad setting',
      () => ({ ...valid(), settings: { ...valid().settings, funMode: 'yes' } }),
      /funMode/,
    ],
    [
      'bad cycle length',
      () => ({ ...valid(), settings: { ...valid().settings, onboardingCycleLength: -3 } }),
      /onboardingCycleLength/,
    ],
  ])('rejects %s', (_name, make, message) => {
    expect(() => parseSnapshot(make())).toThrow(SnapshotError);
    expect(() => parseSnapshot(make())).toThrow(message);
  });
});

describe('fingerprint', () => {
  it('ignores timestamps, ids and ordering', async () => {
    const a = buildSnapshot(local(), NOW);
    const b = buildSnapshot(
      local({
        dailyLogs: [...local().dailyLogs].reverse().map((l) => ({ ...l, updatedAt: 999 })),
        pauses: local().pauses.map((p) => ({ ...p, id: 77 })),
      }),
      new Date('2030-01-01T00:00:00Z'),
    );
    expect(await fingerprint(a)).toBe(await fingerprint(b));
  });

  it('changes when any content changes', async () => {
    const base = await fingerprint(buildSnapshot(local(), NOW));
    const changed = [
      local({ dailyLogs: [day('2025-06-01', { flow: 'light' })] }),
      local({ pauses: [] }),
      local({ settings: { ...local().settings, funMode: false } }),
    ];
    for (const l of changed) expect(await fingerprint(buildSnapshot(l, NOW))).not.toBe(base);
  });

  it('is not affected by per-device fields', async () => {
    const other = local({
      settings: { ...local().settings, lastBackupAt: 5, recentMessageIds: [] },
    });
    expect(await fingerprint(buildSnapshot(other, NOW))).toBe(
      await fingerprint(buildSnapshot(local(), NOW)),
    );
  });
});
