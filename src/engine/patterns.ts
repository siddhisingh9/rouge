// Spec §6.8 — recurring symptoms at a consistent point in the cycle.
import { PATTERN_MIN_CYCLES, PATTERN_THRESHOLD } from './constants.ts';
import type { Cycle } from './cycles.ts';
import { diffDays } from './dates.ts';
import { median } from './stats.ts';
import { SYMPTOMS, type DailyLog, type Symptom } from './types.ts';

export type PatternFrame = 'after_start' | 'before_next';

export interface Pattern {
  symptom: Symptom;
  /** after_start: cycle days from…to (1 = first day of period).
   *  before_next: days before the next period, from…to (1 = the day before). */
  frame: PatternFrame;
  from: number;
  to: number;
  fraction: number; // peak share of cycles (with the ±1 day tolerance)
}

const AFTER_START_MAX = 15;
const BEFORE_NEXT_MAX = 10;
const TOLERANCE = 1; // ± days around each position, for detection
const EPSILON = 1e-9;

type PatternLog = Pick<DailyLog, 'date' | 'symptoms'>;

interface CycleSymptoms {
  length: number;
  /** symptom → 0-based day offsets within the cycle where it was logged */
  offsets: Map<Symptom, Set<number>>;
}

interface Window {
  from: number;
  to: number;
  fraction: number;
}

/** Runs of consecutive positions at/above the threshold, each with its peak fraction. */
function windows(fractions: readonly number[]): Window[] {
  const out: Window[] = [];
  fractions.forEach((f, i) => {
    const pos = i + 1;
    if (f < PATTERN_THRESHOLD - EPSILON) return;
    const prev = out[out.length - 1];
    if (prev && prev.to === pos - 1) {
      prev.to = pos;
      prev.fraction = Math.max(prev.fraction, f);
    } else {
      out.push({ from: pos, to: pos, fraction: f });
    }
  });
  return out;
}

/**
 * The ±1 tolerance widens every window by a day on each side (cramps on days 1–2 would
 * read as "days 1–3"). Trim the window to the days where the symptom was actually
 * logged most: positions whose exact-day share is at least half the window's peak.
 * This copes with symptoms that drift (day 2 in some cycles, day 3 in others).
 */
function trim(window: Window, exact: readonly number[]): Window {
  const positions: number[] = [];
  for (let pos = window.from; pos <= window.to; pos++) positions.push(pos);
  const peak = Math.max(...positions.map((pos) => exact[pos - 1] ?? 0));
  if (peak === 0) return window;
  const strong = positions.filter((pos) => (exact[pos - 1] ?? 0) >= peak / 2 - EPSILON);
  return { ...window, from: strong[0]!, to: strong[strong.length - 1]! };
}

/**
 * Only valid cycles are used. Every cycle begins with logged flow, so each one counts —
 * a cycle where no symptom was logged counts as "no symptom" (decision: many people
 * only log flow, and that is still a real data point).
 */
export function symptomPatterns(logs: readonly PatternLog[], cycles: readonly Cycle[]): Pattern[] {
  const symptomLogs = logs.filter((l) => l.symptoms.length > 0);
  const eligible: CycleSymptoms[] = cycles
    .filter((c) => c.status === 'valid')
    .map((c) => {
      const offsets = new Map<Symptom, Set<number>>();
      for (const l of symptomLogs) {
        if (l.date < c.start || l.date >= c.nextStart) continue;
        const offset = diffDays(l.date, c.start);
        for (const s of l.symptoms) {
          if (!offsets.has(s)) offsets.set(s, new Set());
          offsets.get(s)!.add(offset);
        }
      }
      return { length: c.length, offsets };
    });
  if (eligible.length < PATTERN_MIN_CYCLES) return [];

  /** Share of cycles with the symptom within ±tolerance of a 0-based offset. */
  const fractionAt = (
    symptom: Symptom,
    offsetFor: (c: CycleSymptoms) => number,
    tolerance: number,
  ): number => {
    let hits = 0;
    for (const c of eligible) {
      const days = c.offsets.get(symptom);
      if (!days) continue;
      const centre = offsetFor(c);
      for (let o = centre - tolerance; o <= centre + tolerance; o++) {
        if (o >= 0 && o < c.length && days.has(o)) {
          hits++;
          break;
        }
      }
    }
    return hits / eligible.length;
  };

  // after_start position d → offset d − 1; before_next position b → offset length − b.
  const frames = [
    { frame: 'after_start' as const, max: AFTER_START_MAX, offset: (pos: number) => () => pos - 1 },
    {
      frame: 'before_next' as const,
      max: BEFORE_NEXT_MAX,
      offset: (pos: number) => (c: CycleSymptoms) => c.length - pos,
    },
  ];

  // Typical cycle length, to compare the two frames on one approximate day scale.
  const typicalLength = median(eligible.map((c) => c.length));
  const toCycleDays = (p: Window & { frame: PatternFrame }): [number, number] =>
    p.frame === 'after_start'
      ? [p.from, p.to]
      : [typicalLength - p.to + 1, typicalLength - p.from + 1];

  const patterns: Pattern[] = [];
  for (const symptom of SYMPTOMS) {
    const candidates = frames.flatMap(({ frame, max, offset }) => {
      const share = (tolerance: number) =>
        Array.from({ length: max }, (_, i) => fractionAt(symptom, offset(i + 1), tolerance));
      const exact = share(0);
      return windows(share(TOLERANCE)).map((w) => ({ ...trim(w, exact), frame }));
    });

    // Strongest windows first (after_start wins ties); drop any that overlap a kept one.
    candidates.sort((a, b) => b.fraction - a.fraction);
    const kept: [number, number][] = [];
    for (const cand of candidates) {
      const [lo, hi] = toCycleDays(cand);
      if (kept.some(([klo, khi]) => lo <= khi && hi >= klo)) continue;
      kept.push([lo, hi]);
      patterns.push({ symptom, ...cand });
    }
  }
  return patterns.sort((a, b) => b.fraction - a.fraction);
}
