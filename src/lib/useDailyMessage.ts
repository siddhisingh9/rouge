// The Today screen's phase message (spec §8): one per day, stored in settings so it
// stays the same all day and isn't repeated within the last 5.
import { useEffect } from 'react';
import { updateSettingsWith } from '../db/queries.ts';
import rawBank from '../content/messages.json';
import type { Phase } from '../engine/status.ts';
import type { ISODate } from '../engine/types.ts';
import {
  categoryFor,
  fillMessage,
  pickMessage,
  type MessageBank,
  type MessageState,
  type MessageVars,
} from './messages.ts';
import { save } from './save.ts';

const BANK = rawBank as MessageBank;

interface DailyMessageInput extends MessageState {
  phase: Phase;
  funMode: boolean;
  vars: MessageVars;
  today: ISODate;
}

/** Today's message text, or null for the moment while a new one is being chosen. */
export function useDailyMessage(input: DailyMessageInput): string | null {
  const { phase, funMode, vars, today, lastMessage, recentMessageIds } = input;
  const category = categoryFor(phase, funMode);
  const pickInput = { bank: BANK, category, vars, today, lastMessage, recentMessageIds };
  const current = pickMessage(pickInput);
  const needsNew = current?.kind === 'new';
  const { cycleDay, daysUntilNext } = vars;

  useEffect(() => {
    if (!needsNew) return;
    // Pick inside a transaction against the latest stored state, so a double effect
    // (React StrictMode) or two open tabs can't record two different messages.
    save(
      updateSettingsWith((s) => {
        const r = pickMessage({
          bank: BANK,
          category,
          vars: { cycleDay, daysUntilNext },
          today,
          lastMessage: s.lastMessage,
          recentMessageIds: s.recentMessageIds,
        });
        return r?.kind === 'new' ? r.state : null;
      }),
    );
  }, [needsNew, category, cycleDay, daysUntilNext, today]);

  return current?.kind === 'keep' ? fillMessage(current.message.text, vars) : null;
}
