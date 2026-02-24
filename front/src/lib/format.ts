export function toMinorUnits(majorUnits: number): number {
  return Math.round(majorUnits * 100);
}

export function formatMinorUnits(minorUnits: number): string {
  return new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS' }).format(
    minorUnits / 100
  );
}
