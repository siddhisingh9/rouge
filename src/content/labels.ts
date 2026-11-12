// Display labels for logged values. Keys come from the engine's option lists.
import type { Flow, Mood, Symptom } from '../engine/types.ts';

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
