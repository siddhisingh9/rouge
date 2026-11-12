import { describe, expect, it } from 'vitest';
import {
  applyLogPatch,
  DEFAULT_SETTINGS,
  emptyLog,
  isEmptyLog,
  isISODate,
  normalizePause,
  validateSettingsPatch,
  withSettingsDefaults,
} from './normalize.ts';
import type { DailyLog } from './types.ts';

const NOW = 1_700_000_000_000;

function log(overrides: Partial<DailyLog> = {}): DailyLog {
  return { ...emptyLog('2025-03-10'), updatedAt: 1, ...overrides };
}

describe('isISODate', () => {
  it('accepts real calendar dates', () => {
    expect(isISODate('2025-01-31')).toBe(true);
    expect(isISODate('2024-02-29')).toBe(true); // leap year
    expect(isISODate('2025-12-31')).toBe(true);
  });

  it('rejects malformed or impossible dates', () => {
    for (const bad of [
      '2025-02-29',
      '2025-04-31',
      '2025-13-01',
      '2025-00-10',
      '2025-1-5',
      '',
      20250101,
      null,
    ]) {
      expect(isISODate(bad)).toBe(false);
    }
  });
});

describe('isEmptyLog', () => {
  it('is true only when nothing is logged', () => {
    expect(isEmptyLog(log())).toBe(true);
    expect(isEmptyLog(log({ notes: '   ' }))).toBe(true);
    expect(isEmptyLog(log({ flow: 'light' }))).toBe(false);
    expect(isEmptyLog(log({ symptoms: ['acne'] }))).toBe(false);
    expect(isEmptyLog(log({ moods: ['calm'] }))).toBe(false);
    expect(isEmptyLog(log({ notes: 'hi' }))).toBe(false);
  });
});

describe('applyLogPatch', () => {
  it('creates a new row from an empty day', () => {
    const out = applyLogPatch(undefined, '2025-03-10', { flow: 'heavy' }, NOW);
    expect(out).toEqual({ ...emptyLog('2025-03-10'), flow: 'heavy', updatedAt: NOW });
  });

  it('merges a patch over the existing row and stamps updatedAt', () => {
    const existing = log({ flow: 'light', notes: 'tired' });
    const out = applyLogPatch(existing, '2025-03-10', { moods: ['calm'] }, NOW);
    expect(out).toEqual({ ...existing, moods: ['calm'], updatedAt: NOW });
  });

  it('can clear flow with an explicit null', () => {
    const out = applyLogPatch(
      log({ flow: 'medium', notes: 'x' }),
      '2025-03-10',
      { flow: null },
      NOW,
    );
    expect(out).toMatchObject({ flow: null, notes: 'x' });
  });

  it('deletes a stored day that becomes empty (spec §4)', () => {
    expect(applyLogPatch(log({ flow: 'medium' }), '2025-03-10', { flow: null }, NOW)).toBeNull();
  });

  it('does nothing when an empty patch hits an empty day', () => {
    expect(applyLogPatch(undefined, '2025-03-10', { flow: null }, NOW)).toBe('unchanged');
  });

  it('reports no-op edits as unchanged so updatedAt is not bumped', () => {
    const existing = log({ flow: 'light', symptoms: ['cramps'] });
    expect(applyLogPatch(existing, '2025-03-10', { flow: 'light' }, NOW)).toBe('unchanged');
  });

  it('dedupes symptoms/moods and stores them in canonical order', () => {
    const out = applyLogPatch(
      undefined,
      '2025-03-10',
      { symptoms: ['nausea', 'cramps', 'nausea'], moods: ['low_energy', 'happy'] },
      NOW,
    );
    expect(out).toMatchObject({ symptoms: ['cramps', 'nausea'], moods: ['happy', 'low_energy'] });
  });

  it('rejects invalid dates and flows', () => {
    expect(() => applyLogPatch(undefined, '2025-02-30', { flow: 'light' }, NOW)).toThrow();
    // @ts-expect-error — 'spotting' is deliberately not a Flow
    expect(() => applyLogPatch(undefined, '2025-03-10', { flow: 'spotting' }, NOW)).toThrow();
  });
});

describe('settings', () => {
  it('fills defaults when no row exists', () => {
    expect(withSettingsDefaults(undefined)).toEqual(DEFAULT_SETTINGS);
    expect(DEFAULT_SETTINGS).toMatchObject({
      onboardingPeriodLength: 5,
      onboardingDone: false,
      funMode: true,
      showFertileWindow: false,
    });
  });

  it('keeps stored values and fills only the missing ones', () => {
    const s = withSettingsDefaults({ funMode: false, onboardingCycleLength: null });
    expect(s.funMode).toBe(false);
    expect(s.onboardingCycleLength).toBeNull();
    expect(s.onboardingPeriodLength).toBe(5);
  });

  it('never shares the default recentMessageIds array', () => {
    withSettingsDefaults(undefined).recentMessageIds.push('p1');
    expect(DEFAULT_SETTINGS.recentMessageIds).toEqual([]);
  });

  it('validates patches', () => {
    expect(() => validateSettingsPatch({ onboardingCycleLength: null })).not.toThrow();
    expect(() => validateSettingsPatch({ onboardingCycleLength: 30 })).not.toThrow();
    expect(() => validateSettingsPatch({ onboardingCycleLength: 0 })).toThrow();
    expect(() => validateSettingsPatch({ onboardingPeriodLength: 4.5 })).toThrow();
    expect(() => validateSettingsPatch({ lastMessage: { date: 'today', id: 'p1' } })).toThrow();
  });
});

describe('normalizePause', () => {
  it('accepts ongoing and closed pauses', () => {
    expect(normalizePause({ start: '2025-01-01', end: null })).toEqual({
      start: '2025-01-01',
      end: null,
    });
    expect(normalizePause({ start: '2025-01-01', end: '2025-01-01' }).end).toBe('2025-01-01');
  });

  it('trims the label and drops it when blank', () => {
    expect(normalizePause({ start: '2025-01-01', end: null, label: '  Pill ' }).label).toBe('Pill');
    expect(normalizePause({ start: '2025-01-01', end: null, label: '  ' })).not.toHaveProperty(
      'label',
    );
  });

  it('rejects an end before the start, and bad dates', () => {
    expect(() => normalizePause({ start: '2025-02-01', end: '2025-01-31' })).toThrow();
    expect(() => normalizePause({ start: '2025/01/01', end: null })).toThrow();
  });
});
