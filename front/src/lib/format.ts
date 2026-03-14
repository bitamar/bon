const currencyFormatter = new Intl.NumberFormat('he-IL', {
  style: 'currency',
  currency: 'ILS',
});

export function formatCurrency(amountMinorUnits: number): string {
  return currencyFormatter.format(amountMinorUnits / 100);
}

export function formatCurrencyWhole(amount: number): string {
  return currencyFormatter.format(amount);
}
