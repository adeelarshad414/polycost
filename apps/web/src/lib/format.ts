// Shared display formatters.
//
// H-F1 groundwork: these were defined inline in App.tsx and independently
// re-implemented in LandingPage, PersonaComparisonWorkspace, and
// FinOpsFeatureLayer. Centralising them removes that duplication and gives the
// extracted chart components something to import without reaching back into the
// App.tsx monolith (which would create a circular import).

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  }).format(value);
}

export function formatSignedCurrency(value: number): string {
  if (value === 0) {
    return '$0.00';
  }

  return `${value > 0 ? '+' : '-'}${formatCurrency(Math.abs(value))}`;
}

export function formatPercent(value: number): string {
  return `${value.toLocaleString('en-US', {
    maximumFractionDigits: value > 0 && value < 10 ? 1 : 0,
  })}%`;
}
