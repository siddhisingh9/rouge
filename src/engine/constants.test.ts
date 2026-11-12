// Toolchain smoke test (Milestone 1). The real engine tests (spec §6.9) arrive in Milestone 3.
import { describe, expect, it } from 'vitest';
import * as C from './constants.ts';

describe('engine constants', () => {
  it('match the spec defaults', () => {
    expect(C.DEFAULT_CYCLE).toBe(28);
    expect(C.DEFAULT_PERIOD).toBe(5);
    expect(C.WINDOW).toBe(6);
  });

  it('classification thresholds bracket the baseline', () => {
    expect(C.SHORT_RATIO).toBeLessThan(1);
    expect(C.SKIP_RATIO).toBeGreaterThan(1);
  });
});
