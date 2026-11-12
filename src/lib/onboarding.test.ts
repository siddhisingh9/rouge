import { describe, expect, it } from 'vitest';
import { day } from '../engine/test-helpers.ts';
import {
  buildOnboarding,
  defaultAnswers,
  hasErrors,
  validateAnswers,
  type OnboardingAnswers,
} from './onboarding.ts';

const TODAY = '2025-06-15';
const answers = (over: Partial<OnboardingAnswers> = {}): OnboardingAnswers => ({
  ...defaultAnswers(),
  lastPeriodStart: '2025-06-01',
  ...over,
});

describe('validateAnswers', () => {
  it('requires the last period start, not in the future', () => {
    expect(validateAnswers(answers({ lastPeriodStart: '' }), TODAY).lastPeriodStart).toMatch(
      /choose/,
    );
    expect(
      validateAnswers(answers({ lastPeriodStart: '2025-06-16' }), TODAY).lastPeriodStart,
    ).toMatch(/future/);
    expect(hasErrors(validateAnswers(answers(), TODAY))).toBe(false);
    expect(hasErrors(validateAnswers(answers({ lastPeriodStart: TODAY }), TODAY))).toBe(false);
  });

  it('checks earlier periods are before the last one and not repeated', () => {
    const e = validateAnswers(
      answers({
        earlierPeriods: [
          { start: '2025-05-04', length: 5 }, // ok
          { start: '2025-06-01', length: 5 }, // same as last
          { start: '2025-05-04', length: 4 }, // duplicate
          { start: '', length: 5 }, // empty row — ignored
          { start: '2025-07-01', length: 5 }, // future
        ],
      }),
      TODAY,
    );
    expect(e.earlierPeriods[0]).toBeUndefined();
    expect(e.earlierPeriods[1]).toMatch(/before your last/);
    expect(e.earlierPeriods[2]).toMatch(/already added/);
    expect(e.earlierPeriods[3]).toBeUndefined();
    expect(e.earlierPeriods[4]).toMatch(/future/);
  });
});

describe('buildOnboarding', () => {
  it('stores the answers and marks onboarding done', () => {
    const r = buildOnboarding(
      answers({ cycleLength: 31, periodLength: 4, funMode: false }),
      [],
      TODAY,
    );
    expect(r.settings).toEqual({
      onboardingCycleLength: 31,
      onboardingPeriodLength: 4,
      funMode: false,
      onboardingDone: true,
    });
  });

  it('stores "not sure" as null', () => {
    const r = buildOnboarding(answers({ cycleNotSure: true }), [], TODAY);
    expect(r.settings.onboardingCycleLength).toBeNull();
  });

  it('logs the last and earlier periods as medium flow, in date order', () => {
    const r = buildOnboarding(
      answers({
        periodLength: 3,
        earlierPeriods: [
          { start: '2025-05-04', length: 2 },
          { start: '', length: 5 },
        ],
      }),
      [],
      TODAY,
    );
    expect(r.logPatches).toEqual(
      ['2025-05-04', '2025-05-05', '2025-06-01', '2025-06-02', '2025-06-03'].map((date) => ({
        date,
        patch: { flow: 'medium' },
      })),
    );
  });

  it('skips days that already have flow and clamps lengths', () => {
    const r = buildOnboarding(
      answers({ periodLength: 99, cycleLength: 5 }),
      [day('2025-06-02', { flow: 'heavy' })],
      TODAY,
    );
    expect(r.settings).toMatchObject({ onboardingPeriodLength: 14, onboardingCycleLength: 15 });
    expect(r.logPatches.map((p) => p.date)).not.toContain('2025-06-02');
    expect(r.logPatches).toHaveLength(13);
  });

  it('refuses invalid answers', () => {
    expect(() => buildOnboarding(answers({ lastPeriodStart: '' }), [], TODAY)).toThrow();
  });
});
