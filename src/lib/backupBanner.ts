// When to show the "back up your data" reminder on Today (spec §9.4). Pure.
import { diffDays } from '../engine/dates.ts';
import type { ISODate } from '../engine/types.ts';

export const STALE_DAYS = 14;
const DAY_MS = 86_400_000;

/**
 * Shown when backup is available, the user isn't signed in, and there's been no backup
 * for over 14 days. Not shown to brand-new users (fewer than 14 days since their first
 * log), and hidden for 14 days after being dismissed.
 */
export function shouldShowBackupBanner(input: {
  configured: boolean;
  signedIn: boolean;
  lastBackupAt: number | null;
  firstLogDate: ISODate | undefined;
  today: ISODate;
  now: number;
  dismissedAt: number;
}): boolean {
  const { configured, signedIn, lastBackupAt, firstLogDate, today, now, dismissedAt } = input;
  if (!configured || signedIn || !firstLogDate) return false;
  if (now - dismissedAt < STALE_DAYS * DAY_MS) return false;
  if (lastBackupAt !== null) return now - lastBackupAt > STALE_DAYS * DAY_MS;
  return diffDays(today, firstLogDate) > STALE_DAYS;
}
