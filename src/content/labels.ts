// Display labels for logged values. Keys come from the engine's option lists.
import type { Phase } from '../engine/status.ts';
import type { Flow, Mood, Symptom } from '../engine/types.ts';

export const PHASE_LABELS: Record<Phase, string> = {
  period: 'Period',
  follicular: 'Follicular phase',
  ovulation: 'Ovulation window (estimate)',
  luteal: 'Luteal phase',
  pms: 'PMS days',
  late: 'Period is late',
  possibly_skipped: 'Possibly skipped',
  paused: 'Predictions paused',
  no_data: 'Welcome',
};

export const FLOW_LABELS: Record<Flow, string> = {
  light: 'Light',
  medium: 'Medium',
  heavy: 'Heavy',
};

export const SYMPTOM_LABELS: Record<Symptom, string> = {
  cramps: 'Cramps',
  headache: 'Headache',
  bloating: 'Bloating',
  back_pain: 'Back pain',
  breast_tenderness: 'Tender breasts',
  acne: 'Acne',
  fatigue: 'Fatigue',
  cravings: 'Cravings',
  nausea: 'Nausea',
  digestive_issues: 'Digestive issues',
  trouble_sleeping: 'Trouble sleeping',
};

export const MOOD_LABELS: Record<Mood, string> = {
  happy: 'Happy',
  calm: 'Calm',
  energetic: 'Energetic',
  sad: 'Sad',
  anxious: 'Anxious',
  irritable: 'Irritable',
  low_energy: 'Low energy',
};

export const MOOD_EMOJI: Record<Mood, string> = {
  happy: '😊',
  calm: '😌',
  energetic: '⚡',
  sad: '😢',
  anxious: '😰',
  irritable: '😤',
  low_energy: '🥱',
};

/** Short phase names for the ring legend and pills. */
export const PHASE_SHORT: Record<'period' | 'follicular' | 'ovulation' | 'luteal' | 'pms', string> =
  {
    period: 'Period',
    follicular: 'Follicular',
    ovulation: 'Ovulation',
    luteal: 'Luteal',
    pms: 'PMS',
  };
