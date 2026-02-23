export function formatAgora(agora: number): string {
  return new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS' }).format(agora / 100);
}
