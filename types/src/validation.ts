/**
 * Validates an Israeli ID number (ת.ז.) using the standard Luhn-variant checksum.
 * Requires exactly 9 digits.
 */
export function validateIsraeliId(id: string): boolean {
  if (!/^\d{9}$/.test(id)) return false;
  const digits = id.split('').map(Number);
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    let val = (digits[i] ?? 0) * ((i % 2) + 1);
    if (val > 9) val -= 9;
    sum += val;
  }
  return sum % 10 === 0;
}
