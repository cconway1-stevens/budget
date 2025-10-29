export const fmt = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0
});

export const fmtDecimal = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD'
});

export const fmtPct = new Intl.NumberFormat('en-US', {
  style: 'percent',
  minimumFractionDigits: 1,
  maximumFractionDigits: 1
});

export function toMonthly(val, freq) {
  const multipliers = { daily: 30.4167, weekly: 4.33, monthly: 1, yearly: 1 / 12 };
  return val * (multipliers[freq] || 1);
}

export function fromMonthly(val, view) {
  const multipliers = { daily: 1 / 30.4167, weekly: 1 / 4.33, monthly: 1, yearly: 12 };
  return val * (multipliers[view] || 1);
}

export function parseValue(valueStr, row) {
  const percentMatch = valueStr.match(/^(\d+(?:\.\d+)?)\s*%\s*(?:of\s*)?@?(\w+)$/i);
  if (percentMatch) {
    return { mode: 'percent', value: parseFloat(percentMatch[1]), reference: percentMatch[2] };
  }

  const justPercent = valueStr.match(/^(\d+(?:\.\d+)?)\s*%$/);
  if (justPercent) {
    return { mode: 'percent', value: parseFloat(justPercent[1]), reference: row.reference || '' };
  }

  const refMatch = valueStr.match(/@(\w+)/);
  if (refMatch) {
    return { mode: 'percent', value: row.value || 0, reference: refMatch[1] };
  }

  const amount = parseFloat(valueStr.replace(/[^0-9.-]/g, '')) || 0;
  return { mode: 'amount', value: amount, reference: '' };
}
