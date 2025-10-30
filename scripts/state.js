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

// Memoization cache for calcMonthlyValues
let cachedCalcResults = null;
let lastRowsHash = null;

function hashRows(rows) {
  // Simple hash based on row count and row IDs/values
  if (!Array.isArray(rows) || rows.length === 0) return 'empty';
  return rows.map(r => `${r.id}:${r.value}:${r.mode}:${r.freq}:${r.reference}`).join('|');
}

// Call this whenever rows are modified to invalidate the cache
export function invalidateCache() {
  cachedCalcResults = null;
  lastRowsHash = null;
}

export function calcMonthlyValues() {
  // Check if we can use cached results
  const currentHash = hashRows(state.rows);
  if (cachedCalcResults && lastRowsHash === currentHash) {
    return cachedCalcResults;
  }

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

  // Cache the results for next time
  const result = { totals, results };
  cachedCalcResults = result;
  lastRowsHash = currentHash;

  return result;
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

export function updateAccount(accountId, updates) {
  const account = getAccountById(accountId);
  if (!account) {
    return { success: false, error: 'Account not found' };
  }

  // Validate updates
  if (updates.name !== undefined) {
    const trimmedName = String(updates.name).trim();
    if (!trimmedName) {
      return { success: false, error: 'Account name cannot be empty' };
    }
    // Check for duplicate names (excluding current account)
    const duplicate = state.accounts.find(acc =>
      acc.id !== accountId &&
      acc.name.toLowerCase().trim() === trimmedName.toLowerCase()
    );
    if (duplicate) {
      return { success: false, error: 'Account name already exists' };
    }
    account.name = trimmedName;
  }

  if (updates.type !== undefined) {
    const validTypes = ['retirement', 'investment', 'savings', 'liquid'];
    if (!validTypes.includes(updates.type)) {
      return { success: false, error: 'Invalid account type' };
    }
    account.type = updates.type;
  }

  if (updates.balance !== undefined) {
    const balance = Number(updates.balance);
    if (!Number.isFinite(balance)) {
      return { success: false, error: 'Invalid balance amount' };
    }
    account.balance = balance;
  }

  if (updates.expectedReturn !== undefined) {
    const returnRate = Number(updates.expectedReturn);
    if (!Number.isFinite(returnRate)) {
      return { success: false, error: 'Invalid expected return' };
    }
    account.expectedReturn = returnRate;
  }

  if (updates.isActive !== undefined) {
    account.isActive = Boolean(updates.isActive);
  }

  return { success: true, account };
}

export function deleteAccount(accountId) {
  const index = state.accounts.findIndex(acc => acc.id === accountId);
  if (index === -1) {
    return { success: false, error: 'Account not found' };
  }

  // Check if any allocations are targeting this account
  const hasAllocations = state.rows.some(row =>
    row.type === 'allocation' && row.targetAccount === accountId
  );

  if (hasAllocations) {
    const confirmed = confirm(
      '⚠️ Delete Account?\n\n' +
      'This account has active allocations pointing to it.\n' +
      'Deleting it will also remove those allocations.\n\n' +
      'Continue?'
    );

    if (!confirmed) {
      return { success: false, error: 'User cancelled' };
    }

    // Remove allocations targeting this account
    state.rows = state.rows.filter(row =>
      !(row.type === 'allocation' && row.targetAccount === accountId)
    );
  }

  state.accounts.splice(index, 1);
  return { success: true };
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

// Calculate projected account value after N years
export function projectAccountValue(account, years) {
  if (!account || !account.isActive) return 0;

  const currentBalance = Number(account.balance) || 0;
  const annualReturn = Number(account.expectedReturn) || 0;
  const contributions = calculateAccountContributions();
  const monthlyContribution = contributions.get(account.id) || 0;

  // Future value with regular contributions
  // FV = PV(1+r)^n + PMT × [((1+r)^n - 1) / r]
  const monthlyRate = annualReturn / 12;
  const periods = years * 12;

  if (monthlyRate === 0) {
    // No growth, just contributions
    return currentBalance + (monthlyContribution * periods);
  }

  const futureValueOfPrincipal = currentBalance * Math.pow(1 + monthlyRate, periods);
  const futureValueOfContributions = monthlyContribution *
    ((Math.pow(1 + monthlyRate, periods) - 1) / monthlyRate);

  return futureValueOfPrincipal + futureValueOfContributions;
}

// Calculate when net worth will reach a target
export function calculateTimeToTarget(targetNetWorth) {
  const currentNetWorth = calculateNetWorth();
  const { totals } = calcMonthlyValues();
  const monthlyWealthBuilding = totals.wealthBuilding || 0;

  if (monthlyWealthBuilding <= 0) {
    return null; // Can't reach target without wealth building
  }

  // Calculate weighted average return across all accounts
  let totalBalance = 0;
  let weightedReturn = 0;

  state.accounts.forEach(account => {
    if (account.isActive) {
      const balance = Number(account.balance) || 0;
      const returnRate = Number(account.expectedReturn) || 0;
      totalBalance += balance;
      weightedReturn += balance * returnRate;
    }
  });

  const avgReturn = totalBalance > 0 ? weightedReturn / totalBalance : 0.07;

  // Use simplified calculation: months to target with compound growth
  // Target = Current × (1+r)^n + Monthly × [((1+r)^n - 1) / r]
  const monthlyRate = avgReturn / 12;

  if (monthlyRate === 0) {
    // No growth, linear accumulation
    const remaining = targetNetWorth - currentNetWorth;
    return remaining > 0 ? remaining / monthlyWealthBuilding : 0;
  }

  // Solve for n using approximation (simplified for performance)
  let months = 0;
  let netWorth = currentNetWorth;

  while (netWorth < targetNetWorth && months < 600) { // Max 50 years
    netWorth = netWorth * (1 + monthlyRate) + monthlyWealthBuilding;
    months++;
  }

  return months < 600 ? months : null;
}

// Calculate annual passive income potential at target return
export function calculatePassiveIncome(returnRate = 0.04) {
  const netWorth = calculateNetWorth();
  return netWorth * returnRate;
}
