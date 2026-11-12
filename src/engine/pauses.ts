// Prediction pauses (hormonal birth control, pregnancy, etc.).
import { addDays } from './dates.ts';
import type { ISODate, Pause } from './types.ts';

/** True when `today` falls inside a pause (an open-ended pause counts as ongoing). */
export function isPausedOn(pauses: readonly Pause[], today: ISODate): boolean {
  return pauses.some((p) => p.start <= today && (p.end === null || p.end >= today));
}

/** True when any pause touches the days `start … nextStart − 1`. */
export function overlapsPause(
  pauses: readonly Pause[],
  start: ISODate,
  nextStart: ISODate,
): boolean {
  const lastDay = addDays(nextStart, -1);
  return pauses.some((p) => p.start <= lastDay && (p.end === null || p.end >= start));
}
