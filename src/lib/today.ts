// The only place in the app that reads the clock for calendar purposes (spec §3).
import { useEffect, useState } from 'react';
import { toISODate } from '../engine/dates.ts';
import type { ISODate } from '../engine/types.ts';

/** Today's date in the user's local calendar. */
export function todayISO(): ISODate {
  return toISODate(new Date());
}

/** Milliseconds until the next local midnight (plus a small margin). */
function msUntilMidnight(): number {
  const now = new Date();
  const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  return midnight.getTime() - now.getTime() + 1000;
}

/**
 * Today's date, kept current: updates at midnight and whenever the app comes back to
 * the foreground (iOS suspends PWAs, so timers alone can't be trusted).
 */
export function useToday(): ISODate {
  const [today, setToday] = useState(todayISO);

  useEffect(() => {
    const refresh = () => setToday(todayISO());
    let timer = window.setTimeout(function tick() {
      refresh();
      timer = window.setTimeout(tick, msUntilMidnight());
    }, msUntilMidnight());

    const onVisible = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', refresh);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', refresh);
    };
  }, []);

  return today;
}
