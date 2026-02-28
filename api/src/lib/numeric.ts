/**
 * Converts a Drizzle numeric column value (string) to a finite number.
 * Throws if the value is not a finite number.
 */
export function toNumber(value: string): number {
  const n = Number(value);
  if (!Number.isFinite(n)) {
    throw new TypeError(`Expected a finite number, got: ${value}`);
  }
  return n;
}
