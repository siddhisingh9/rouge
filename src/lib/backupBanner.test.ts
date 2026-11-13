import { describe, expect, it } from 'vitest';
import { shouldShowBackupBanner } from './backupBanner.ts';

const DAY = 86_400_000;
const NOW = Date.UTC(2025, 5, 30);
const base = {
  configured: true,
  signedIn: false,
  lastBackupAt: null,
  firstLogDate: '2025-06-01',
  today: '2025-06-30',
  now: NOW,
  dismissedAt: 0,
};

describe('shouldShowBackupBanner (spec §9.4)', () => {
  it('shows for a long-time user who never backed up', () => {
    expect(shouldShowBackupBanner(base)).toBe(true);
  });

  it('shows when the last backup is over 14 days old', () => {
    expect(shouldShowBackupBanner({ ...base, lastBackupAt: NOW - 15 * DAY })).toBe(true);
    expect(shouldShowBackupBanner({ ...base, lastBackupAt: NOW - 13 * DAY })).toBe(false);
  });

  it('hides when signed in, not configured, or with no data', () => {
    expect(shouldShowBackupBanner({ ...base, signedIn: true })).toBe(false);
    expect(shouldShowBackupBanner({ ...base, configured: false })).toBe(false);
    expect(shouldShowBackupBanner({ ...base, firstLogDate: undefined })).toBe(false);
  });

  it('waits until a new user has been logging for 14 days', () => {
    expect(shouldShowBackupBanner({ ...base, firstLogDate: '2025-06-20' })).toBe(false);
  });

  it('stays hidden for 14 days after being dismissed', () => {
    expect(shouldShowBackupBanner({ ...base, dismissedAt: NOW - 3 * DAY })).toBe(false);
    expect(shouldShowBackupBanner({ ...base, dismissedAt: NOW - 15 * DAY })).toBe(true);
  });
});
