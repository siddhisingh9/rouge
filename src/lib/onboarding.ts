// Spec §7 Onboarding — validation and turning the answers into stored data. Pure.
import type { SettingsPatch } from '../db/types.ts';
import { addDays, isISODate } from '../engine/dates.ts';
import { DEFAULT_CYCLE, DEFAULT_PERIOD } from '../engine/constants.ts';
import type { DailyLog, ISODate } from '../engine/types.ts';
import type { DayPatch } from './periodPlans.ts';

export const CYCLE_RANGE = { min: 15, max: 60 } as const;
export const PERIOD_RANGE = { min: 1, max: 14 } as const;

export interface EarlierPeriod {
  start: ISODate | ''; // '' = row added but no date picked yet (ignored)
  length: number;
}

export interface OnboardingAnswers {
  cycleLength: number;
  cycleNotSure: boolean; // stored as null → engine uses 28
  periodLength: number;
  lastPeriodStart: ISODate | '';
  earlierPeriods: EarlierPeriod[];
  funMode: boolean;
}

export function defaultAnswers(): OnboardingAnswers {
  return {
    cycleLength: DEFAULT_CYCLE,
    cycleNotSure: false,
    periodLength: DEFAULT_PERIOD,
    lastPeriodStart: '',
    earlierPeriods: [],
    funMode: true,
  };
}

export interface OnboardingErrors {
  lastPeriodStart?: string;
  earlierPeriods: (string | undefined)[]; // one entry per row
}

export function validateAnswers(a: OnboardingAnswers, today: ISODate): OnboardingErrors {
  const errors: OnboardingErrors = { earlierPeriods: a.earlierPeriods.map(() => undefined) };

  if (!a.lastPeriodStart) {
    errors.lastPeriodStart = 'Please choose the day your last period started.';
  } else if (!isISODate(a.lastPeriodStart)) {
    errors.lastPeriodStart = 'Please choose a valid date.';
  } else if (a.lastPeriodStart > today) {
    errors.lastPeriodStart = 'That date is in the future.';
  }

  const seen = new Set<ISODate>();
  a.earlierPeriods.forEach((p, i) => {
    if (!p.start) return; // empty rows are ignored
    if (!isISODate(p.start)) errors.earlierPeriods[i] = 'Please choose a valid date.';
    else if (p.start > today) errors.earlierPeriods[i] = 'That date is in the future.';
    else if (a.lastPeriodStart && p.start >= a.lastPeriodStart) {
      errors.earlierPeriods[i] = 'This should be before your last period.';
    } else if (seen.has(p.start)) errors.earlierPeriods[i] = "You've already added this date.";
    seen.add(p.start);
  });
  return errors;
}

export function hasErrors(e: OnboardingErrors): boolean {
  return e.lastPeriodStart !== undefined || e.earlierPeriods.some((x) => x !== undefined);
}

function clamp(n: number, { min, max }: { min: number; max: number }): number {
  return Math.min(max, Math.max(min, Math.round(n)));
}

export interface OnboardingResult {
  settings: SettingsPatch;
  logPatches: DayPatch[];
}

/**
 * The settings to store and the flow days to log. Every period is filled with medium
 * flow (like "Log period"); days that already have flow are left alone.
 */
export function buildOnboarding(
  a: OnboardingAnswers,
  existingLogs: ReadonlyArray<Pick<DailyLog, 'date' | 'flow'>>,
  today: ISODate,
): OnboardingResult {
  if (hasErrors(validateAnswers(a, today))) throw new Error('Onboarding answers are invalid');
  const periodLength = clamp(a.periodLength, PERIOD_RANGE);

  const periods = [
    { start: a.lastPeriodStart as ISODate, length: periodLength },
    ...a.earlierPeriods
      .filter((p): p is { start: ISODate; length: number } => p.start !== '')
      .map((p) => ({ start: p.start, length: clamp(p.length, PERIOD_RANGE) })),
  ];

  const hasFlow = new Set(existingLogs.filter((l) => l.flow !== null).map((l) => l.date));
  const dates = new Set<ISODate>();
  for (const { start, length } of periods) {
    for (let i = 0; i < length; i++) {
      const date = addDays(start, i);
      if (!hasFlow.has(date)) dates.add(date);
    }
  }

  return {
    settings: {
      onboardingCycleLength: a.cycleNotSure ? null : clamp(a.cycleLength, CYCLE_RANGE),
      onboardingPeriodLength: periodLength,
      funMode: a.funMode,
      onboardingDone: true,
    },
    logPatches: [...dates].sort().map((date) => ({ date, patch: { flow: 'medium' as const } })),
  };
}
