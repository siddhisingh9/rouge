// Spec §8 — choosing the daily phase message. Pure; the caller persists the result.
import type { Phase } from '../engine/status.ts';
import type { ISODate } from '../engine/types.ts';

export interface Message {
  id: string;
  text: string;
}

export type MessageCategory = Phase | 'neutral';
export type MessageBank = Record<MessageCategory, Message[]>;

/** Phases that get light-hearted messages when fun mode is on. */
export const FUN_PHASES: readonly Phase[] = ['period', 'follicular', 'ovulation', 'luteal', 'pms'];
export const RECENT_LIMIT = 5;

export interface MessageVars {
  cycleDay: number | null;
  daysUntilNext: number | null;
}

/** Calm phases (late, skipped, paused, no data) always use their own messages. */
export function categoryFor(phase: Phase, funMode: boolean): MessageCategory {
  if (!FUN_PHASES.includes(phase)) return phase;
  return funMode ? phase : 'neutral';
}

const PLACEHOLDER = /\{(\w+)\}/g;

/** A message can be shown only if every placeholder it uses has a value. */
function canFill(text: string, vars: MessageVars): boolean {
  for (const [, name] of text.matchAll(PLACEHOLDER)) {
    const value = vars[name as keyof MessageVars];
    if (value === undefined || value === null) return false;
  }
  return true;
}

export function fillMessage(text: string, vars: MessageVars): string {
  return text.replace(PLACEHOLDER, (whole, name: string) => {
    const value = vars[name as keyof MessageVars];
    return value === undefined || value === null ? whole : String(value);
  });
}

export interface MessageState {
  lastMessage: { date: ISODate; id: string } | null;
  recentMessageIds: string[];
}

export interface PickInput extends MessageState {
  bank: MessageBank;
  category: MessageCategory;
  vars: MessageVars;
  today: ISODate;
  random?: () => number; // injectable for tests
}

export type PickResult =
  | { kind: 'keep'; message: Message } // today's message is still valid
  | { kind: 'new'; message: Message; state: MessageState };

/**
 * One message per day: keep today's if it still fits the category, otherwise pick a
 * random one that wasn't among the last RECENT_LIMIT shown (falling back gracefully
 * when a category is too small to avoid repeats).
 */
export function pickMessage(input: PickInput): PickResult | null {
  const { bank, category, vars, today, lastMessage, recentMessageIds } = input;
  const usable = (bank[category] ?? []).filter((m) => canFill(m.text, vars));
  if (usable.length === 0) return null;

  if (lastMessage?.date === today) {
    const kept = usable.find((m) => m.id === lastMessage.id);
    if (kept) return { kind: 'keep', message: kept };
  }

  const recent = new Set(recentMessageIds);
  const fresh = usable.filter((m) => !recent.has(m.id));
  const notLast = usable.filter((m) => m.id !== lastMessage?.id);
  const pool = fresh.length > 0 ? fresh : notLast.length > 0 ? notLast : usable;

  const random = input.random ?? Math.random;
  const message = pool[Math.floor(random() * pool.length)] ?? pool[0]!;
  return {
    kind: 'new',
    message,
    state: {
      lastMessage: { date: today, id: message.id },
      recentMessageIds: [...recentMessageIds.filter((id) => id !== message.id), message.id].slice(
        -RECENT_LIMIT,
      ),
    },
  };
}
