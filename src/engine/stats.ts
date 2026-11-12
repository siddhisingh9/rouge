// Small numeric helpers. All take a non-empty list unless stated.

export function sum(xs: readonly number[]): number {
  return xs.reduce((a, b) => a + b, 0);
}

export function mean(xs: readonly number[]): number {
  if (xs.length === 0) throw new Error('mean of an empty list');
  return sum(xs) / xs.length;
}

export function median(xs: readonly number[]): number {
  if (xs.length === 0) throw new Error('median of an empty list');
  const sorted = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/** Sample standard deviation (divides by n − 1). Returns 0 for fewer than 2 values. */
export function sampleStdDev(xs: readonly number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(sum(xs.map((x) => (x - m) ** 2)) / (xs.length - 1));
}
