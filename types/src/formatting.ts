export function shekelToAgora(shekel: number): number {
  return Math.round(shekel * 100);
}

export function formatAgora(agora: number, currency = 'ILS'): string {
  return new Intl.NumberFormat('he-IL', { style: 'currency', currency }).format(agora / 100);
}

export function formatDate(isoDate: string): string {
  const [year, month, day] = isoDate.split('-');
  return `${day}/${month}/${year}`;
}
