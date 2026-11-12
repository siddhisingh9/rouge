// Show a setting's new value immediately while the database write catches up.
// Without this, two quick taps on a stepper both start from the old stored value
// (one tap is lost), and toggles briefly snap back before the live query updates.
import { useState } from 'react';
import { save } from './save.ts';

export function useLocalValue<T>(
  stored: T,
  write: (value: T) => Promise<unknown>,
): [T, (value: T) => void] {
  const [local, setLocal] = useState<{ value: T } | null>(null);

  // Once the store has caught up, drop the override (React's "adjust state while
  // rendering" pattern) so later changes from elsewhere show through.
  if (local && Object.is(local.value, stored)) setLocal(null);

  const set = (value: T) => {
    setLocal({ value });
    save(write(value));
  };
  return [local ? local.value : stored, set];
}
