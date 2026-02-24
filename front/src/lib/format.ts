export function shekelToAgora(shekel: number): number {
  return Math.round(shekel * 100);
}

export function formatAgora(agora: number): string {
  return new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS' }).format(agora / 100);
}
