export function toMinorUnits(majorUnits: number): number {
  return Math.round(majorUnits * 100);
}

export function formatMinorUnits(minorUnits: number, currency = 'ILS'): string {
  return new Intl.NumberFormat('he-IL', { style: 'currency', currency }).format(minorUnits / 100);
}

export function formatDate(isoDate: string): string {
  const [year, month, day] = isoDate.split('-');
  return `${day}/${month}/${year}`;
}
