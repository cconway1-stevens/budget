import { toMonthly } from './formatting.js';

export const state = {
  rows: [],
  view: 'monthly',
  lastMonthData: { income: 0, expenses: 0, net: 0 },
  history: [],
  categories: [
    'Salary',
    'Freelance',
    'Investments',
    'Taxes',
    'Savings',
    'Other Income',
    'Housing',
    'Food',
    'Transport',
    'Utilities',
    'Entertainment',
    'Healthcare',
    'Education',
    'Other'
  ],
  sortColumn: null,
  sortDirection: 'asc',
  defaultCategories: [
    'Salary',
    'Freelance',
    'Investments',
    'Taxes',
    'Savings',
    'Other Income',
    'Housing',
    'Food',
    'Transport',
    'Utilities',
    'Entertainment',
    'Healthcare',
    'Education',
    'Other'
  ],
  totalsByCategory: {},
  categoryBreakdown: []
};

export function generateId() {
  return (typeof crypto !== 'undefined' && crypto.randomUUID)
    ? crypto.randomUUID()
    : String(Date.now() + Math.random());
}

export function calcMonthlyValues() {
  const results = new Map();
  const visited = new Set();
  const nameToId = new Map();

  state.rows.forEach(row => {
    if (row.name) {
      nameToId.set(row.name.toLowerCase().trim(), row.id);
    }
  });

  function compute(id, depth = 0) {
    if (depth > 50) return 0;
    if (results.has(id)) return results.get(id);
    if (visited.has(id)) return 0;

    visited.add(id);
    const row = state.rows.find(r => r.id === id);
    if (!row) {
      visited.delete(id);
      return 0;
    }

    let val = 0;
    if (row.mode === 'percent' && row.reference) {
      const refId = nameToId.get(row.reference.toLowerCase().trim());
      if (refId) {
        const refVal = compute(refId, depth + 1);
        val = refVal * (Number(row.value) || 0) / 100;
      }
    } else if (row.mode === 'amount') {
      val = toMonthly(Number(row.value) || 0, row.freq || 'monthly');
    }

    results.set(id, val);
    visited.delete(id);
    return val;
  }

  const totals = { inc: 0, exp: 0, net: 0 };

  for (const row of state.rows) {
    const val = compute(row.id);
    if (row.type === 'income') totals.inc += val;
    else totals.exp += val;
  }

  totals.net = totals.inc - totals.exp;
  return { totals, results };
}
