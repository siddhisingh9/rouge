// Spec §12: one hook that combines live Dexie data + today and runs the engine, so
// every screen reads predictions from the same place. Nothing derived is ever stored.
import { useMemo } from 'react';
import { useLogs, usePauses, useSettings } from '../db/hooks.ts';
import type { Settings } from '../db/types.ts';
import { derive, type Derived } from '../engine/derive.ts';
import type { DailyLog, ISODate, Pause } from '../engine/types.ts';
import { useToday } from './today.ts';

export interface DerivedState extends Derived {
  today: ISODate;
  logs: DailyLog[];
  pauses: Pause[];
  settings: Settings;
}

/** `undefined` while the database is loading. */
export function useDerived(): DerivedState | undefined {
  const logs = useLogs();
  const pauses = usePauses();
  const settings = useSettings();
  const today = useToday();

  return useMemo(() => {
    if (!logs || !pauses || !settings) return undefined;
    const onboarding = {
      cycleLength: settings.onboardingCycleLength,
      periodLength: settings.onboardingPeriodLength,
    };
    return { ...derive({ logs, pauses, onboarding, today }), today, logs, pauses, settings };
  }, [logs, pauses, settings, today]);
}
