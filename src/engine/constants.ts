// Prediction engine constants — spec §6.1. Pure data, no imports.

export const DEFAULT_CYCLE = 28;
export const DEFAULT_PERIOD = 5;
export const PRIOR_WEIGHT_K = 2; // onboarding value counts as 2 cycles during cold start
export const WINDOW = 6; // use last 6 valid cycles / periods
export const MIN_CYCLES_FOR_MEDIAN = 3;
export const DEFAULT_SIGMA = 2; // days, when < 3 valid cycles
export const SKIP_RATIO = 1.6; // gap ≥ 1.6 × baseline → skipped period(s)
export const SHORT_RATIO = 0.6; // gap < 0.6 × baseline → short/anomalous cycle
export const MIN_CYCLE_DAYS = 15; // gap < 15 days → short/anomalous cycle
export const IRREGULAR_SIGMA = 7; // σ > 7 → irregular mode
export const IRREGULAR_SKIPS = 2; // ≥ 2 skipped periods in last 365 days → irregular mode
export const LUTEAL_DAYS = 14; // ovulation = next period start − 14
export const OVULATION_SPREAD = 2; // ± days of luteal variation
export const PMS_DAYS = 5;
export const POSSIBLY_SKIPPED_RATIO = 0.6; // daysLate ≥ round(0.6 × L) → "possibly skipped"
export const HORIZON_MONTHS = 6;
export const HORIZON_MONTHS_IRREGULAR = 3;
export const PATTERN_THRESHOLD = 0.6;
export const PATTERN_MIN_CYCLES = 3;
export const BACKTEST_MIN = 3;
