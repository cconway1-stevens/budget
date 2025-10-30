import { toMonthly } from './formatting.js';

export const state = {
  rows: [],
  view: 'monthly',
  lastMonthData: { income: 0, expenses: 0, net: 0 },
  history: [],
  filterCategory: '',
  dashboardFilters: {
    category: 'all',
    type: 'all'
  },
  netGoal: 0,
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
  categoryBreakdown: [],
  // NEW: Account tracking for wealth building
  accounts: []
};

export function generateId() {
  return (typeof crypto !== 'undefined' && crypto.randomUUID)
    ? crypto.randomUUID()
    : String(Date.now() + Math.random());
}

const VALID_TYPES = new Set(['income', 'expense', 'investment', 'allocation']);
const VALID_FREQS = new Set(['daily', 'weekly', 'monthly', 'yearly']);

function normalizeRow(row = {}, seenIds) {
  if (!row || typeof row !== 'object') {
    return null;
  }

  const normalized = { ...row };

  let id = typeof row.id === 'string' ? row.id.trim() : '';
  if (!id || (seenIds && seenIds.has(id))) {
    id = generateId();
  }
  if (seenIds) {
    seenIds.add(id);
  }
  normalized.id = id;

  const type = typeof row.type === 'string' ? row.type.toLowerCase() : '';
  normalized.type = VALID_TYPES.has(type) ? type : 'expense';

  normalized.name = typeof row.name === 'string' ? row.name : '';

  const mode = row.mode === 'percent' ? 'percent' : 'amount';
  normalized.mode = mode;

  let value = typeof row.value === 'string' ? parseFloat(row.value) : row.value;
  if (!Number.isFinite(value)) {
    value = 0;
  }
  normalized.value = value;

  normalized.reference = mode === 'percent' && typeof row.reference === 'string'
    ? row.reference
    : '';

  const freq = typeof row.freq === 'string' ? row.freq.toLowerCase() : '';
  normalized.freq = VALID_FREQS.has(freq) ? freq : 'monthly';

  normalized.category = typeof row.category === 'string' ? row.category : '';

  // NEW: Allocation-specific fields for wealth building tracking
  normalized.isWealthBuilding = normalized.type === 'allocation'
    ? Boolean(row.isWealthBuilding)
    : false;

  normalized.sourceIncome = normalized.type === 'allocation' && typeof row.sourceIncome === 'string'
    ? row.sourceIncome
    : '';

  normalized.targetAccount = normalized.type === 'allocation' && typeof row.targetAccount === 'string'
    ? row.targetAccount
    : '';

  return normalized;
}

export function normalizeRows(rows) {
  if (!Array.isArray(rows)) {
    return [];
  }

  const seenIds = new Set();
  return rows
    .map(row => normalizeRow(row, seenIds))
    .filter(Boolean);
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

  const totals = { inc: 0, exp: 0, investment: 0, allocation: 0, wealthBuilding: 0, net: 0 };

  for (const row of state.rows) {
    const val = compute(row.id);
    if (row.type === 'income') {
      totals.inc += val;
    } else if (row.type === 'allocation') {
      totals.allocation += val;
      if (row.isWealthBuilding) {
        totals.wealthBuilding += val;
      }
    } else if (row.type === 'investment') {
      totals.investment += val;
      // Legacy: treat investments as wealth building
      totals.wealthBuilding += val;
    } else {
      totals.exp += val;
    }
  }

  // Net = income - true expenses (excluding wealth building allocations)
  totals.net = totals.inc - totals.exp;
  return { totals, results };
}

// Account Management Functions

export function createAccount(name, type, balance = 0, expectedReturn = 0) {
  const account = {
    id: generateId(),
    name: name || 'New Account',
    type: type || 'savings', // retirement, investment, savings, liquid
    balance: Number(balance) || 0,
    expectedReturn: Number(expectedReturn) || 0,
    isActive: true,
    createdAt: Date.now()
  };
  state.accounts.push(account);
  return account;
}

export function getAccountById(accountId) {
  return state.accounts.find(acc => acc.id === accountId);
}

export function getAccountByName(accountName) {
  const normalized = (accountName || '').toLowerCase().trim();
  return state.accounts.find(acc =>
    (acc.name || '').toLowerCase().trim() === normalized
  );
}

export function calculateAccountContributions() {
  const contributions = new Map();
  const { results } = calcMonthlyValues();

  state.rows.forEach(row => {
    if (row.type === 'allocation' && row.targetAccount) {
      const monthlyVal = results.get(row.id) || 0;
      const current = contributions.get(row.targetAccount) || 0;
      contributions.set(row.targetAccount, current + monthlyVal);
    }
  });

  return contributions;
}

export function calculateNetWorth() {
  return state.accounts.reduce((total, account) => {
    if (account.isActive) {
      return total + (Number(account.balance) || 0);
    }
    return total;
  }, 0);
}
