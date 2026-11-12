import { describe, expect, it } from 'vitest';
import rawBank from '../content/messages.json';
import {
  categoryFor,
  fillMessage,
  FUN_PHASES,
  pickMessage,
  type MessageBank,
  type PickInput,
} from './messages.ts';

const bank = rawBank as MessageBank;
const TODAY = '2025-06-15';
const vars = { cycleDay: 12, daysUntilNext: 17 };

const input = (over: Partial<PickInput> = {}): PickInput => ({
  bank,
  category: 'follicular',
  vars,
  today: TODAY,
  lastMessage: null,
  recentMessageIds: [],
  random: () => 0,
  ...over,
});

describe('message bank (spec §8)', () => {
  const all = Object.values(bank).flat();

  it('has ~10 messages for each fun phase', () => {
    for (const phase of FUN_PHASES) expect(bank[phase].length).toBeGreaterThanOrEqual(10);
  });

  it('has every category, unique ids and only known placeholders', () => {
    for (const c of ['late', 'possibly_skipped', 'paused', 'no_data', 'neutral'] as const) {
      expect(bank[c].length).toBeGreaterThan(0);
    }
    expect(new Set(all.map((m) => m.id)).size).toBe(all.length);
    for (const m of all) {
      for (const [, name] of m.text.matchAll(/\{(\w+)\}/g)) {
        expect(['cycleDay', 'daysUntilNext']).toContain(name);
      }
    }
  });

  it('keeps the spec’s required messages', () => {
    expect(bank.period[0]).toEqual({
      id: 'p1',
      text: 'Your uterus is doing its monthly renovation. Excuse the noise.',
    });
    expect(bank.neutral[0]?.text).toBe('Day {cycleDay} of your cycle.');
  });
});

describe('categoryFor', () => {
  it('uses the phase in fun mode and neutral otherwise', () => {
    expect(categoryFor('pms', true)).toBe('pms');
    expect(categoryFor('pms', false)).toBe('neutral');
  });

  it('keeps late / skipped / paused / no data calm regardless of fun mode', () => {
    for (const p of ['late', 'possibly_skipped', 'paused', 'no_data'] as const) {
      expect(categoryFor(p, true)).toBe(p);
      expect(categoryFor(p, false)).toBe(p);
    }
  });
});

describe('pickMessage', () => {
  it('keeps today’s message', () => {
    const r = pickMessage(input({ lastMessage: { date: TODAY, id: 'f4' } }));
    expect(r).toMatchObject({ kind: 'keep', message: { id: 'f4' } });
  });

  it('picks a new one on a new day, or when the phase changed today', () => {
    expect(pickMessage(input({ lastMessage: { date: '2025-06-14', id: 'f4' } }))?.kind).toBe('new');
    expect(pickMessage(input({ lastMessage: { date: TODAY, id: 'p1' } }))?.kind).toBe('new');
  });

  it('never repeats one of the last 5 shown', () => {
    const recentMessageIds = ['f1', 'f2', 'f3', 'f4', 'f5'];
    for (let i = 0; i < 20; i++) {
      const r = pickMessage(input({ recentMessageIds, random: () => i / 20 }));
      expect(recentMessageIds).not.toContain(r?.message.id);
    }
  });

  it('records the pick and keeps only the last 5 ids', () => {
    const r = pickMessage(input({ recentMessageIds: ['a', 'b', 'c', 'd', 'e'] }));
    expect(r).toMatchObject({
      kind: 'new',
      message: { id: 'f1' },
      state: {
        lastMessage: { date: TODAY, id: 'f1' },
        recentMessageIds: ['b', 'c', 'd', 'e', 'f1'],
      },
    });
  });

  it('falls back gracefully when the category is too small to avoid repeats', () => {
    const r = pickMessage(
      input({ category: 'late', recentMessageIds: ['x1', 'x2'], lastMessage: null }),
    );
    expect(r?.message.id).toMatch(/^x/);
    // Prefers anything but yesterday's message.
    const r2 = pickMessage(
      input({
        category: 'late',
        recentMessageIds: ['x1', 'x2'],
        lastMessage: { date: '2025-06-14', id: 'x1' },
      }),
    );
    expect(r2?.message.id).toBe('x2');
  });

  it('skips messages whose placeholders have no value', () => {
    const late = { cycleDay: 40, daysUntilNext: null };
    for (let i = 0; i < 10; i++) {
      const r = pickMessage(input({ category: 'neutral', vars: late, random: () => i / 10 }));
      expect(r?.message.id).not.toBe('u2');
    }
  });
});

describe('fillMessage', () => {
  it('fills placeholders', () => {
    expect(fillMessage('Day {cycleDay}, {daysUntilNext} to go', vars)).toBe('Day 12, 17 to go');
  });
});
