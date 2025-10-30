import { state, calcMonthlyValues, generateId, normalizeRows } from './state.js';
import { save } from './storage.js';
import { fmt, fmtDecimal, fmtPct, fromMonthly, parseValue } from './formatting.js';
import { updateCharts } from './charts.js';

const ratioFormatter = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
});

const VALID_DASHBOARD_TYPES = ['all', 'income', 'expense', 'investment'];

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function ensureDashboardFilters() {
  if (!state.dashboardFilters || typeof state.dashboardFilters !== 'object') {
    state.dashboardFilters = { category: 'all', type: 'all' };
  }

  if (typeof state.dashboardFilters.category !== 'string' || !state.dashboardFilters.category) {
    state.dashboardFilters.category = 'all';
  } else if (state.dashboardFilters.category.toLowerCase() === 'all') {
    state.dashboardFilters.category = 'all';
  } else if (Array.isArray(state.categories) && !state.categories.includes(state.dashboardFilters.category)) {
    state.dashboardFilters.category = 'all';
  }

  if (typeof state.dashboardFilters.type !== 'string' || !state.dashboardFilters.type) {
    state.dashboardFilters.type = 'all';
  }
  const normalizedType = state.dashboardFilters.type.toLowerCase();
  state.dashboardFilters.type = VALID_DASHBOARD_TYPES.includes(normalizedType)
    ? normalizedType
    : 'all';

  return state.dashboardFilters;
}

function matchesDashboardFilters(row, filters) {
  if (!row) return false;
  const categoryFilter = filters.category;
  const typeFilter = filters.type;

  const categoryMatch = categoryFilter === 'all' || (row.category || '') === categoryFilter;
  if (!categoryMatch) return false;

  if (typeFilter === 'all') return true;
  return (row.type || '').toLowerCase() === typeFilter;
}

function computeTotalsForRows(rows, results) {
  return rows.reduce((acc, row) => {
    if (!row) return acc;
    const monthlyVal = results.get(row.id) || 0;
    const type = (row.type || '').toLowerCase();
    if (type === 'expense') {
      acc.exp += monthlyVal;
    } else if (type === 'investment') {
      acc.investment += monthlyVal;
    } else {
      acc.inc += monthlyVal;
    }
    return acc;
  }, { inc: 0, exp: 0, investment: 0 });
}

function aggregateCategoryTotals(rows, results) {
  const totals = {};
  rows.forEach(row => {
    if (!row || !row.category) return;
    const monthlyVal = results.get(row.id) || 0;
    const type = (row.type || '').toLowerCase();
    if (!totals[row.category]) {
      totals[row.category] = { income: 0, expense: 0, investment: 0 };
    }
    if (type === 'expense') {
      totals[row.category].expense += monthlyVal;
    } else if (type === 'investment') {
      totals[row.category].investment += monthlyVal;
    } else {
      totals[row.category].income += monthlyVal;
    }
  });
  return totals;
}

function sortCategoryTotals(totals) {
  const sortedEntries = Object.entries(totals || {})
    .sort(([a], [b]) => a.localeCompare(b));
  const sortedTotals = {};
  sortedEntries.forEach(([category, values]) => {
    sortedTotals[category] = {
      income: values && values.income != null ? values.income : 0,
      expense: values && values.expense != null ? values.expense : 0,
      investment: values && values.investment != null ? values.investment : 0
    };
  });
  return sortedTotals;
}

function deriveDisplayTotals(totals, filterType = 'all') {
  const inc = Number(totals && totals.inc) || 0;
  const expense = Number(totals && totals.exp) || 0;
  const investment = Number(totals && totals.investment) || 0;
  const type = filterType || 'all';

  if (type === 'income') {
    return { income: inc, expense: 0, net: inc };
  }
  if (type === 'expense') {
    return { income: 0, expense, net: -expense };
  }
  if (type === 'investment') {
    return { income: 0, expense: investment, net: -investment };
  }

  const combinedExpense = expense + investment;
  return {
    income: inc,
    expense: combinedExpense,
    net: inc - combinedExpense
  };
}

function computeHistoryTotals(entry, filters) {
  if (!entry || typeof entry !== 'object') {
    return { inc: 0, exp: 0, investment: 0 };
  }

  const fallback = {
    inc: Number(entry.income) || 0,
    exp: Number(entry.expense) || 0,
    investment: Number(entry.investment) || 0
  };

  const categoryFilter = filters && filters.category ? filters.category : 'all';
  if (categoryFilter === 'all') {
    return fallback;
  }

  const categories = entry.categories && typeof entry.categories === 'object'
    ? entry.categories
    : {};
  const selected = categories[categoryFilter];
  if (!selected) {
    return { inc: 0, exp: 0, investment: 0 };
  }

  return {
    inc: Number(selected.income) || 0,
    exp: Number(selected.expense) || 0,
    investment: Number(selected.investment) || 0
  };
}

function renderDashboardFilterChips(filters = ensureDashboardFilters()) {
  const categoryContainer = document.getElementById('dashboardFilterCategories');
  if (categoryContainer) {
    const categories = Array.isArray(state.categories) ? state.categories : [];
    const activeCategory = filters.category || 'all';
    const chips = ['all', ...categories];
    categoryContainer.innerHTML = chips.map(value => {
      const label = value === 'all' ? 'All' : value;
      const isActive = value === 'all'
        ? activeCategory === 'all'
        : activeCategory === value;
      const classList = ['pill', isActive ? 'pill-active' : 'pill-soft'];
      return `<button class="${classList.join(' ')}" data-filter-type="category" data-value="${escapeHtml(value)}" aria-pressed="${isActive}">${escapeHtml(label)}</button>`;
    }).join('');
  }

  const typeContainer = document.getElementById('dashboardFilterTypes');
  if (typeContainer) {
    const activeType = filters.type || 'all';
    const options = [
      { value: 'all', label: 'All' },
      { value: 'income', label: 'Income' },
      { value: 'expense', label: 'Expense' },
      { value: 'investment', label: 'Investment' }
    ];

    typeContainer.innerHTML = options.map(option => {
      const isActive = activeType === option.value;
      const classList = ['pill', isActive ? 'pill-active' : 'pill-soft'];
      return `<button class="${classList.join(' ')}" data-filter-type="type" data-value="${option.value}" aria-pressed="${isActive}">${option.label}</button>`;
    }).join('');
  }
}

function getSortedRows() {
  const rows = Array.isArray(state.rows) ? state.rows : [];

  const sorted = [...rows];

  if (state.sortColumn) {
    sorted.sort((a, b) => {
      let aVal = a[state.sortColumn];
      let bVal = b[state.sortColumn];

      if (state.sortColumn === 'value') {
        aVal = Number(aVal) || 0;
        bVal = Number(bVal) || 0;
      }

      if (aVal < bVal) return state.sortDirection === 'asc' ? -1 : 1;
      if (aVal > bVal) return state.sortDirection === 'asc' ? 1 : -1;
      return 0;
    });
  }

  return sorted;
}

function applyCategoryFilter(category) {
  const normalized = category || '';
  state.filterCategory = state.filterCategory === normalized ? '' : normalized;
  save();
  renderTable();
  refreshDashboard();
}

function updateTableFilterNotice(activeCategory, matchCount) {
  const notice = document.getElementById('tableFilterNotice');
  if (!notice) return;

  if (!activeCategory) {
    notice.classList.add('hidden');
    notice.setAttribute('aria-hidden', 'true');
    return;
  }

  const summaryEl = document.getElementById('tableFilterSummary');
  if (summaryEl) {
    if (matchCount === 0) {
      summaryEl.textContent = `No entries currently exist for the '${activeCategory}' category. Add one below or clear the filter.`;
    } else if (matchCount === 1) {
      summaryEl.textContent = `1 entry matches the '${activeCategory}' category. Matching rows are highlighted in the table.`;
    } else {
      summaryEl.textContent = `${matchCount} entries match the '${activeCategory}' category. Matching rows are highlighted in the table.`;
    }
  }

  notice.classList.remove('hidden');
  notice.setAttribute('aria-hidden', 'false');
}

export function renderTable() {
  const tbody = document.getElementById('ledgerBody');
  if (!tbody) return;

  const { results } = calcMonthlyValues();
  const sortedRows = getSortedRows();
  const activeCategoryFilter = state.filterCategory || '';
  const matchingRows = activeCategoryFilter
    ? sortedRows.filter(row => (row.category || '') === activeCategoryFilter).length
    : 0;

  updateTableFilterNotice(activeCategoryFilter, matchingRows);

  tbody.innerHTML = sortedRows.map((r) => {
    const monthly = results.get(r.id) || 0;
    const daily = fromMonthly(monthly, 'daily');
    const weekly = fromMonthly(monthly, 'weekly');
    const yearly = fromMonthly(monthly, 'yearly');

    const displayValue = r.mode === 'percent'
      ? `${r.value}%${r.reference ? ' of @' + r.reference : ''}`
      : r.value;

    const isCategoryMatch = Boolean(activeCategoryFilter) && (r.category || '') === activeCategoryFilter;
    const rowClassAttr = isCategoryMatch ? ' class="filtered-row"' : '';

    return `
      <tr data-id="${r.id}"${rowClassAttr}>
        <td>
          <select class="w-full cell-change" data-field="type" style="padding: 8px 12px;">
            <option value="income" ${r.type === 'income' ? 'selected' : ''}>Income</option>
            <option value="expense" ${r.type === 'expense' ? 'selected' : ''}>Expense</option>
          </select>
        </td>
        <td>
          <input type="text" value="${r.name || ''}" placeholder="e.g., Salary, Rent, Tips"
                 class="w-full cell-change" data-field="name" />
        </td>
        <td>
          <input type="text" value="${displayValue}" placeholder="300 or 30% of @Salary"
                 class="w-full cell-change" data-field="value" />
        </td>
        <td>
          <select class="w-full cell-change" data-field="freq" style="padding: 8px 12px;">
            <option value="daily" ${r.freq === 'daily' ? 'selected' : ''}>Daily</option>
            <option value="weekly" ${r.freq === 'weekly' ? 'selected' : ''}>Weekly</option>
            <option value="monthly" ${r.freq === 'monthly' ? 'selected' : ''}>Monthly</option>
            <option value="yearly" ${r.freq === 'yearly' ? 'selected' : ''}>Yearly</option>
          </select>
        </td>
        <td>
          <select class="w-full cell-change" data-field="category" style="padding: 8px 12px;">
            <option value="">None</option>
            ${state.categories.map(cat => `<option value="${cat}" ${r.category === cat ? 'selected' : ''}>${cat}</option>`).join('')}
          </select>
        </td>
        <td class="text-right freq-value">
          ${fmt.format(Math.abs(daily))}
        </td>
        <td class="text-right freq-value">
          ${fmt.format(Math.abs(weekly))}
        </td>
        <td class="text-right freq-value highlight">
          ${fmt.format(Math.abs(monthly))}
        </td>
        <td class="text-right freq-value">
          ${fmt.format(Math.abs(yearly))}
        </td>
        <td class="text-center">
          <button class="btn-delete p-2 rounded-lg hover:bg-red-500/20 transition-colors" title="Delete">
            <i data-lucide="trash-2" class="w-4 h-4 text-red-400"></i>
          </button>
        </td>
      </tr>
    `;
  }).join('') + `
    <tr class="quick-add-row">
      <td>
        <select id="quickType" style="padding: 8px 12px;">
          <option value="expense">Expense</option>
          <option value="income">Income</option>
        </select>
      </td>
      <td>
        <input type="text" id="quickName" placeholder="Quick add: Enter name..." class="w-full" />
      </td>
      <td>
        <input type="text" id="quickValue" placeholder="Amount or %" class="w-full" />
      </td>
      <td>
        <select id="quickFreq" style="padding: 8px 12px;">
          <option value="monthly">Monthly</option>
          <option value="daily">Daily</option>
          <option value="weekly">Weekly</option>
          <option value="yearly">Yearly</option>
        </select>
      </td>
      <td>
        <select id="quickCategory" style="padding: 8px 12px;">
          <option value="">None</option>
          ${state.categories.map(cat => `<option value="${cat}">${cat}</option>`).join('')}
        </select>
      </td>
      <td colspan="4">
        <button id="quickAddBtn" class="btn btn-primary w-full">
          <i data-lucide="plus" class="w-4 h-4"></i>
          Add Entry
        </button>
      </td>
    </tr>
  `;

  lucide.createIcons();
  attachTableListeners();
  updateSortIndicators();
}

function attachTableListeners() {
  document.querySelectorAll('thead th[data-sort]').forEach(th => {
    if (th.dataset.sortListenerAttached) return;
    th.dataset.sortListenerAttached = 'true';
    th.addEventListener('click', () => {
      const col = th.dataset.sort;
      if (state.sortColumn === col) {
        state.sortDirection = state.sortDirection === 'asc' ? 'desc' : 'asc';
      } else {
        state.sortColumn = col;
        state.sortDirection = 'asc';
      }
      save();
      renderTable();
    });
  });

  document.querySelectorAll('.cell-change').forEach(input => {
    input.addEventListener('change', function () {
      const row = this.closest('tr');
      const id = row && row.dataset ? row.dataset.id : undefined;
      if (!id) return;

      const field = this.dataset.field;
      const rowData = state.rows.find(r => r.id === id);
      if (!rowData) return;

      if (field === 'value') {
        const parsed = parseValue(this.value, rowData);
        rowData.mode = parsed.mode;
        rowData.value = parsed.value;
        rowData.reference = parsed.reference;
      } else {
        rowData[field] = this.value;
      }

      save();
      renderTable();
      refreshDashboard();
    });
  });

  document.querySelectorAll('.btn-delete').forEach(btn => {
    btn.addEventListener('click', () => {
      if (!confirm('Delete this entry?')) return;
      const closestRow = btn.closest('tr');
      const id = closestRow && closestRow.dataset ? closestRow.dataset.id : undefined;
      const index = state.rows.findIndex(r => r.id === id);
      if (index >= 0) {
        state.rows.splice(index, 1);
        save();
        renderTable();
        refreshDashboard();
      }
    });
  });

  const quickAddBtn = document.getElementById('quickAddBtn');
  const quickName = document.getElementById('quickName');
  const quickValue = document.getElementById('quickValue');
  const quickCategory = document.getElementById('quickCategory');

  if (quickCategory) {
    quickCategory.value = state.filterCategory || '';
  }

  if (quickAddBtn) {
    quickAddBtn.addEventListener('click', () => {
      if (!quickName.value.trim()) {
        quickName.focus();
        return;
      }

      const parsed = parseValue(quickValue.value || '0', {});

      state.rows.push({
        id: generateId(),
        type: document.getElementById('quickType').value,
        name: quickName.value.trim(),
        value: parsed.value,
        mode: parsed.mode,
        reference: parsed.reference,
        freq: document.getElementById('quickFreq').value,
        category: quickCategory.value || ''
      });

      save();
      renderTable();
      refreshDashboard();
      quickName.value = '';
      quickValue.value = '';
      quickCategory.value = '';
      quickName.focus();
    });
  }

  [quickName, quickValue].forEach(input => {
    if (input) {
      input.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && quickAddBtn) quickAddBtn.click();
      });
    }
  });

  const clearFilterBtn = document.getElementById('clearTableFilter');
  if (clearFilterBtn && !clearFilterBtn.dataset.listenerAttached) {
    clearFilterBtn.dataset.listenerAttached = 'true';
    clearFilterBtn.addEventListener('click', () => {
      if (!state.filterCategory) return;
      state.filterCategory = '';
      save();
      renderTable();
      refreshDashboard();
    });
  }
}

function updateSortIndicators() {
  document.querySelectorAll('[data-sort]').forEach(th => {
    const indicator = th.querySelector('.sort-indicator');
    if (th.dataset.sort === state.sortColumn) {
      th.classList.add('sorted');
      indicator.textContent = state.sortDirection === 'asc' ? '↑' : '↓';
    } else {
      th.classList.remove('sorted');
      indicator.textContent = '';
    }
  });
}

export function refreshDashboard() {
  const view = state.view;
  const viewLabel = view[0].toUpperCase() + view.slice(1);
  document.getElementById('viewLabel').textContent = viewLabel;

  document.querySelectorAll('#viewSwitcher button').forEach(btn => {
    btn.classList.toggle('pill-active', btn.dataset.view === view);
    btn.classList.toggle('pill-soft', btn.dataset.view !== view);
  });

  const filters = ensureDashboardFilters();
  renderDashboardFilterChips(filters);

  const { results } = calcMonthlyValues();
  const allRows = Array.isArray(state.rows) ? state.rows : [];
  const filteredRows = allRows.filter(row => matchesDashboardFilters(row, filters));

  const globalTotals = computeTotalsForRows(allRows, results);
  const filteredTotalsBase = computeTotalsForRows(filteredRows, results);
  const displayTotals = deriveDisplayTotals(filteredTotalsBase, filters.type);

  const globalCategoryTotals = aggregateCategoryTotals(allRows, results);
  const filteredCategoryTotals = aggregateCategoryTotals(filteredRows, results);

  const sortedGlobalCategoryTotals = sortCategoryTotals(globalCategoryTotals);
  const sortedFilteredCategoryTotals = sortCategoryTotals(filteredCategoryTotals);

  const serializedFilteredCategoryTotals = JSON.stringify(sortedFilteredCategoryTotals);
  const serializedGlobalCategoryTotals = JSON.stringify(sortedGlobalCategoryTotals);

  const snapshotCategoryTotals = JSON.parse(serializedGlobalCategoryTotals || '{}');

  const now = new Date();
  const currentYear = now.getFullYear();
  const monthKey = `${currentYear}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  if (!Array.isArray(state.history)) {
    state.history = [];
  }

  const lastSnapshot = state.history[state.history.length - 1];
  const globalDisplayTotals = deriveDisplayTotals(globalTotals, 'all');
  const monthlySnapshot = {
    month: monthKey,
    income: globalTotals.inc,
    expense: globalTotals.exp,
    investment: globalTotals.investment,
    net: globalDisplayTotals.net,
    categories: snapshotCategoryTotals
  };

  let historyChanged = false;
  let shouldSave = false;
  if (!lastSnapshot || lastSnapshot.month !== monthKey) {
    state.history.push({ ...monthlySnapshot });
    historyChanged = true;
  } else {
    const totalsChanged = (
      lastSnapshot.income !== monthlySnapshot.income ||
      lastSnapshot.expense !== monthlySnapshot.expense ||
      lastSnapshot.net !== monthlySnapshot.net ||
      lastSnapshot.investment !== monthlySnapshot.investment
    );
    const categoriesChanged = JSON.stringify(lastSnapshot.categories || {}) !== serializedGlobalCategoryTotals;
    if (totalsChanged || categoriesChanged) {
      Object.assign(lastSnapshot, monthlySnapshot);
      historyChanged = true;
    }
  }

  if (historyChanged) {
    shouldSave = true;
  }

  const prevCategoryTotals = JSON.stringify(state.totalsByCategory || {});
  if (prevCategoryTotals !== serializedFilteredCategoryTotals) {
    state.totalsByCategory = JSON.parse(serializedFilteredCategoryTotals || '{}');
    shouldSave = true;
  }

  const incV = fromMonthly(displayTotals.income, view);
  const expV = fromMonthly(displayTotals.expense, view);
  const netV = fromMonthly(displayTotals.net, view);
  const savingsRate = displayTotals.income > 0 ? (displayTotals.net / displayTotals.income) : 0;

  const applyMetricColor = (el, value, positiveIsGood = true) => {
    if (!el) return;
    const classes = ['text-emerald-400', 'text-red-400', 'text-slate-300'];
    el.classList.remove(...classes);

    if (value === null || Number.isNaN(value)) {
      el.classList.add('text-slate-300');
      return;
    }

    if (value === 0) {
      el.classList.add('text-slate-300');
      return;
    }

    const isPositive = value > 0;
    const isGood = positiveIsGood ? isPositive : !isPositive;
    el.classList.add(isGood ? 'text-emerald-400' : 'text-red-400');
  };

  const historyEntries = Array.isArray(state.history) ? state.history : [];
  const monthFormatter = new Intl.DateTimeFormat('en-US', { month: 'short', year: 'numeric' });
  const formattedHistory = historyEntries.map(entry => {
    const monthString = entry && entry.month ? entry.month : '';
    const [year, month] = monthString.split('-').map(Number);
    let label = monthString;
    if (year && month) {
      label = monthFormatter.format(new Date(year, month - 1));
    } else if (!label) {
      label = 'Current';
    }

    const historyTotals = computeHistoryTotals(entry, filters);
    const displayHistoryTotals = deriveDisplayTotals(historyTotals, filters.type);
    const incomeVal = fromMonthly(displayHistoryTotals.income, view);
    const expenseVal = fromMonthly(displayHistoryTotals.expense, view);
    const netVal = fromMonthly(displayHistoryTotals.net, view);

    return {
      label,
      income: incomeVal,
      expense: expenseVal,
      net: netVal
    };
  });

  const recentTrend = formattedHistory.slice(-12);
  const trendFallback = {
    label: 'Current',
    income: incV,
    expense: expV,
    net: netV
  };
  const trendPoints = recentTrend.length ? recentTrend : [trendFallback];

  const toMaybeNumber = (value) => {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : null;
  };

  const trendLabels = trendPoints.map(point => point.label);
  const incomeSeries = trendPoints.map(point => {
    const raw = toMaybeNumber(point ? point.income : undefined);
    return raw != null ? raw : 0;
  });
  const expenseSeries = trendPoints.map(point => {
    const raw = toMaybeNumber(point ? point.expense : undefined);
    return raw != null ? raw : 0;
  });
  const netSeries = trendPoints.map((point, index) => {
    const rawNet = toMaybeNumber(point ? point.net : undefined);
    if (rawNet !== null) return rawNet;
    return incomeSeries[index] - expenseSeries[index];
  });

  const trendSeries = {
    labels: trendLabels,
    income: incomeSeries,
    expense: expenseSeries,
    net: netSeries
  };

  const rawGoal = typeof state.netGoal === 'number' ? state.netGoal : Number(state.netGoal);
  const goalValue = Number.isFinite(rawGoal) ? fromMonthly(rawGoal, view) : null;

  const rankedCategoryTotals = Object.entries(state.totalsByCategory || {})
    .map(([category, values]) => {
      const incomeValue = Math.max(values && values.income != null ? values.income : 0, 0);
      const expenseValue = Math.max(values && values.expense != null ? values.expense : 0, 0);
      const investmentValue = Math.max(values && values.investment != null ? values.investment : 0, 0);
      return {
        category,
        income: incomeValue,
        expense: expenseValue + investmentValue,
        investment: investmentValue
      };
    })
    .filter(entry => entry.income > 0 || entry.expense > 0)
    .sort((a, b) => {
      const expenseDiff = (b.expense || 0) - (a.expense || 0);
      if (expenseDiff !== 0) return expenseDiff;
      return a.category.localeCompare(b.category);
    });

  const topRankedTotals = rankedCategoryTotals.slice(0, 8);
  const overflowTotals = rankedCategoryTotals.slice(8);

  if (overflowTotals.length > 0) {
    const aggregate = overflowTotals.reduce((acc, entry) => {
      acc.income += entry.income;
      acc.expense += entry.expense;
      acc.investment += entry.investment || 0;
      return acc;
    }, { category: 'Other', income: 0, expense: 0, investment: 0 });

    if (aggregate.expense > 0 || aggregate.income > 0) {
      topRankedTotals.push(aggregate);
    }
  }

  const serializedBreakdown = JSON.stringify(topRankedTotals);
  if (JSON.stringify(state.categoryBreakdown || []) !== serializedBreakdown) {
    state.categoryBreakdown = topRankedTotals.map(entry => ({ ...entry }));
    shouldSave = true;
  }

  const totalsByCategory = Object.fromEntries(
    Object.entries(sortedFilteredCategoryTotals).map(([category, values]) => {
      const incomeMonthly = values && values.income != null ? values.income : 0;
      const expenseMonthly = values && values.expense != null ? values.expense : 0;
      const investmentMonthly = values && values.investment != null ? values.investment : 0;
      return [
        category,
        {
          income: fromMonthly(incomeMonthly, view),
          expense: fromMonthly(expenseMonthly + investmentMonthly, view),
          investment: fromMonthly(investmentMonthly, view)
        }
      ];
    })
  );

  const bindCategoryKpi = (category, amountId, pctId) => {
    const amountEl = document.getElementById(amountId);
    if (!amountEl) return;

    const data = totalsByCategory[category];
    const incomeAmount = data && data.income != null ? data.income : 0;
    const expenseAmount = data && data.expense != null ? data.expense : 0;

    let displayAmount = 0;
    let pctOfTotal = 0;
    let pctType = 'none';

    if (incomeAmount > 0 || expenseAmount > 0) {
      if (incomeAmount >= expenseAmount && incomeAmount > 0) {
        displayAmount = incomeAmount;
        pctType = 'income';
        pctOfTotal = incV > 0 ? incomeAmount / incV : 0;
      } else {
        displayAmount = expenseAmount;
        pctType = 'expense';
        pctOfTotal = expV > 0 ? expenseAmount / expV : 0;
      }
    }

    amountEl.textContent = fmt.format(displayAmount);

    const pctEl = document.getElementById(pctId);
    if (pctEl) {
      const baseText = fmtPct.format(pctOfTotal);
      const contextText = pctType === 'income'
        ? `${baseText} of income`
        : pctType === 'expense'
          ? `${baseText} of expenses`
          : baseText;
      pctEl.textContent = contextText;
      pctEl.classList.remove('text-emerald-400', 'text-red-400', 'text-slate-400');
      const colorClass = pctType === 'income'
        ? 'text-emerald-400'
        : pctType === 'expense'
          ? 'text-red-400'
          : 'text-slate-400';
      pctEl.classList.add(colorClass);
    }
  };

  document.getElementById('kpiIncome').textContent = fmt.format(incV);
  document.getElementById('kpiExpenses').textContent = fmt.format(expV);
  document.getElementById('kpiNet').textContent = fmt.format(netV);

  const incChange = state.lastMonthData.income > 0 ? (incV - state.lastMonthData.income) / state.lastMonthData.income : 0;
  const expChange = state.lastMonthData.expenses > 0 ? (expV - state.lastMonthData.expenses) / state.lastMonthData.expenses : 0;
  const netChange = state.lastMonthData.net !== 0 ? (netV - state.lastMonthData.net) / Math.abs(state.lastMonthData.net) : 0;
  const lastSavingsRate = state.lastMonthData.income > 0
    ? (state.lastMonthData.net / state.lastMonthData.income)
    : 0;
  const savingsChange = lastSavingsRate !== 0
    ? (savingsRate - lastSavingsRate) / Math.abs(lastSavingsRate)
    : (savingsRate - lastSavingsRate);

  updateTrendBadge('incomeChange', incChange, true);
  updateTrendBadge('expenseChange', expChange, false);
  updateTrendBadge('netChange', netChange, true);
  updateTrendBadge('savingsChange', savingsChange, true);

  document.getElementById('statEntries').textContent = state.rows.length;
  document.getElementById('statRecurring').textContent = state.rows.filter(r => r.freq !== 'monthly').length;

  const dailyExpenses = fromMonthly(displayTotals.expense, 'daily');
  const annualExpenses = fromMonthly(displayTotals.expense, 'yearly');
  document.getElementById('statAvgDaily').textContent = fmt.format(dailyExpenses);

  const annualExpensesEl = document.getElementById('statAnnualExpenses');
  if (annualExpensesEl) {
    annualExpensesEl.textContent = fmt.format(annualExpenses);
  }

  const annualContextEl = document.getElementById('statAnnualContext');
  if (annualContextEl) {
    if (annualExpenses > 0) {
        const annualIncome = fromMonthly(displayTotals.income, 'yearly');
      if (annualIncome > 0) {
        const pctOfIncome = annualExpenses / annualIncome;
        annualContextEl.textContent = `${fmtPct.format(pctOfIncome)} of annual income`;
      } else {
        annualContextEl.textContent = 'No income recorded yet';
      }
    } else {
      annualContextEl.textContent = 'No expenses recorded yet';
    }
  }

  const investmentValueEl = document.getElementById('kpiInvestments');
  const investmentReturnEl = document.getElementById('kpiInvestmentsReturn');
  const investmentPillEl = document.getElementById('investmentPill');

  if (investmentValueEl || investmentReturnEl || investmentPillEl) {
    const pickValue = (source) => {
      if (!source || typeof source !== 'object') return 0;
      const fields = ['investment', 'income', 'expense'];
      for (const field of fields) {
        if (field in source) {
          const numeric = Number(source[field]);
          if (Number.isFinite(numeric)) {
            return numeric;
          }
        }
      }
      return 0;
    };

    const investmentViewTotals = totalsByCategory['Investments'];
    let displayAmount = pickValue(investmentViewTotals);
    if (!investmentViewTotals) {
      const fallbackMonthly = pickValue(globalCategoryTotals['Investments']);
      displayAmount = fromMonthly(fallbackMonthly, view);
    }
    if (investmentValueEl) {
      investmentValueEl.textContent = fmt.format(displayAmount);
    }

    const investmentMonthlyTotals = globalCategoryTotals['Investments'];
    let currentMonthlyValue = pickValue(investmentMonthlyTotals);
    if (!Number.isFinite(currentMonthlyValue)) {
      currentMonthlyValue = 0;
    }

    const getHistoryInvestmentMonthly = (entry) => {
      if (!entry || typeof entry !== 'object') return 0;
      const categories = entry.categories && entry.categories.Investments;
      if (categories && typeof categories === 'object') {
        return pickValue(categories);
      }
      const fallback = Number(entry.investment);
      return Number.isFinite(fallback) ? fallback : 0;
    };

    const investmentHistoryForYear = historyEntries
      .filter(entry => entry && typeof entry.month === 'string' && entry.month.startsWith(`${currentYear}-`))
      .sort((a, b) => (a.month || '').localeCompare(b.month || ''));

    let ytdReturn = null;
    if (investmentHistoryForYear.length > 0) {
      const firstMonthly = getHistoryInvestmentMonthly(investmentHistoryForYear[0]);
      const lastRecordedMonthly = getHistoryInvestmentMonthly(investmentHistoryForYear[investmentHistoryForYear.length - 1]);
      const latestMonthly = Number.isFinite(currentMonthlyValue) ? currentMonthlyValue : lastRecordedMonthly;

      if (Number.isFinite(firstMonthly) && Number.isFinite(latestMonthly)) {
        if (firstMonthly === 0) {
          ytdReturn = latestMonthly === 0 ? 0 : null;
        } else {
          ytdReturn = (latestMonthly - firstMonthly) / Math.abs(firstMonthly);
        }
      }
    }

    if (investmentReturnEl) {
      investmentReturnEl.classList.remove('text-emerald-400', 'text-red-400', 'text-slate-300');
      let returnText = '—';
      let returnClass = 'text-slate-300';

      if (ytdReturn !== null && Number.isFinite(ytdReturn)) {
        if (ytdReturn === 0) {
          returnText = fmtPct.format(0);
        } else {
          const isPositive = ytdReturn > 0;
          const sign = isPositive ? '+' : '−';
          returnText = `${sign}${fmtPct.format(Math.abs(ytdReturn))}`;
          returnClass = isPositive ? 'text-emerald-400' : 'text-red-400';
        }
      }

      investmentReturnEl.textContent = returnText;
      investmentReturnEl.classList.add(returnClass);
    }

    if (investmentPillEl) {
      investmentPillEl.classList.remove('stat-pill-positive', 'stat-pill-negative');
      if (ytdReturn !== null && Number.isFinite(ytdReturn)) {
        if (ytdReturn > 0) {
          investmentPillEl.classList.add('stat-pill-positive');
        } else if (ytdReturn < 0) {
          investmentPillEl.classList.add('stat-pill-negative');
        }
      }
    }
  }

  bindCategoryKpi('Taxes', 'kpiTaxes', 'kpiTaxesPct');
  bindCategoryKpi('Savings', 'kpiSavings', 'kpiSavingsPct');

  const topExpensesBody = document.getElementById('topExpensesBody');
  if (topExpensesBody) {
    const historyCount = historyEntries.length;
    const previousEntry = historyCount >= 2 ? historyEntries[historyCount - 2] : null;
    const previousCategories = (previousEntry && previousEntry.categories && typeof previousEntry.categories === 'object')
      ? previousEntry.categories
      : {};

    const allCategories = new Set([
      ...Object.keys(sortedFilteredCategoryTotals),
      ...Object.keys(previousCategories)
    ]);

    const EPSILON = 0.005;
    const categoryChanges = Array.from(allCategories).map(category => {
      const current = sortedFilteredCategoryTotals[category] || { income: 0, expense: 0, investment: 0 };
      const previous = previousCategories[category] || { income: 0, expense: 0, investment: 0 };
      const currentExpense = fromMonthly((current.expense || 0) + (current.investment || 0), view);
      const previousExpense = fromMonthly((previous.expense || 0) + (previous.investment || 0), view);
      const deltaAmount = currentExpense - previousExpense;
      const magnitude = Math.abs(deltaAmount);
      if (magnitude < EPSILON) {
        return null;
      }

      const pctChange = Math.abs(previousExpense) > EPSILON
        ? deltaAmount / Math.abs(previousExpense)
        : (currentExpense === 0 ? 0 : null);

      return {
        category,
        deltaAmount,
        pctChange,
        magnitude,
        currentExpense,
        previousExpense
      };
    }).filter(Boolean);

    if (!categoryChanges.length) {
      topExpensesBody.innerHTML = `
        <tr>
          <td colspan="4" class="py-4 text-center text-sm text-slate-400">
            No expense changes yet
          </td>
        </tr>
      `;
    } else {
      const topChanges = categoryChanges
        .sort((a, b) => {
          if (b.magnitude !== a.magnitude) {
            return b.magnitude - a.magnitude;
          }
          return a.category.localeCompare(b.category);
        })
        .slice(0, 5);

      topExpensesBody.innerHTML = topChanges.map(change => {
        const isIncrease = change.deltaAmount > 0;
        const symbol = isIncrease ? '▲' : '▼';
        const accentClass = isIncrease ? 'text-red-400' : 'text-emerald-400';
        const amountPrefix = isIncrease ? '+' : '−';
        const amountClass = isIncrease ? 'text-red-300' : 'text-emerald-300';
        const amountValue = fmtDecimal.format(Math.abs(change.deltaAmount));

        let pctDisplay = '—';
        let pctClass = 'text-slate-400';
        if (change.pctChange !== null) {
          if (change.pctChange === 0) {
            pctDisplay = fmtPct.format(0);
            pctClass = 'text-slate-300';
          } else {
            const pctPrefix = change.pctChange > 0 ? '+' : '−';
            pctDisplay = `${pctPrefix}${fmtPct.format(Math.abs(change.pctChange))}`;
            pctClass = change.pctChange > 0 ? 'text-red-300' : 'text-emerald-300';
          }
        }

        const previousLabel = fmtDecimal.format(change.previousExpense);
        const currentLabel = fmtDecimal.format(change.currentExpense);
        const isActive = state.filterCategory === change.category;
        const rowClasses = [
          'group',
          'cursor-pointer',
          'transition-colors',
          isActive ? 'bg-slate-700/60' : 'hover:bg-slate-700/40'
        ].join(' ');

        return `
          <tr class="${rowClasses}" data-category="${change.category}">
            <td class="w-10 py-3 pl-3 pr-2">
              <span class="inline-flex h-6 w-6 items-center justify-center rounded-full bg-slate-800/80 ${accentClass}">
                ${symbol}
              </span>
            </td>
            <td class="py-3 pr-3">
              <div class="text-sm font-medium text-white">${change.category}</div>
              <div class="text-xs text-slate-400">${previousLabel} → ${currentLabel}</div>
            </td>
            <td class="py-3 pr-3 text-right font-medium ${amountClass}">${amountPrefix}${amountValue}</td>
            <td class="py-3 pr-4 text-right ${pctClass}">${pctDisplay}</td>
          </tr>
        `;
      }).join('');

      topExpensesBody.querySelectorAll('tr[data-category]').forEach(row => {
        row.addEventListener('click', () => {
          const { category } = row.dataset;
          applyCategoryFilter(category || '');
        });
      });
    }
  }

  const healthScore = Math.min(100, Math.max(0, Math.round(savingsRate * 100 + 30)));
  document.getElementById('healthScore').textContent = healthScore;
  const healthCircumference = 440;
  const healthOffset = healthCircumference - ((healthScore / 100) * healthCircumference);
  const healthCircle = document.getElementById('healthCircle');
  if (healthCircle) healthCircle.style.strokeDashoffset = healthOffset;

  const healthStatus = healthScore >= 75 ? 'Excellent financial health! 💪'
    : healthScore >= 50 ? 'Good financial standing 👍'
    : healthScore >= 25 ? 'Room for improvement 📊'
    : 'Consider reviewing your budget 📉';
  const healthStatusEl = document.getElementById('healthStatus');
  if (healthStatusEl) healthStatusEl.textContent = healthStatus;

  const summaryIncomeEl = document.getElementById('summaryIncome');
  if (summaryIncomeEl) summaryIncomeEl.textContent = fmtDecimal.format(incV);
  const summaryExpenseEl = document.getElementById('summaryExpense');
  if (summaryExpenseEl) summaryExpenseEl.textContent = fmtDecimal.format(expV);
  const summaryNetEl = document.getElementById('summaryNet');
  if (summaryNetEl) summaryNetEl.textContent = fmtDecimal.format(netV);

  const summaryEl = document.getElementById('summaryChange');
  if (summaryEl) {
    const summaryChange = netV - expV;
    const isPositive = summaryChange >= 0;
    summaryEl.textContent = `${isPositive ? '+' : ''}${fmtDecimal.format(summaryChange)}`;
    summaryEl.className = isPositive ? 'text-emerald-400 font-medium' : 'text-red-400 font-medium';
  }

  if (shouldSave) {
    save();
  }

  updateCharts(trendSeries, goalValue);

  const historyForView = (formattedHistory.length ? formattedHistory : [trendFallback])
    .map(entry => ({
      income: entry.income,
      expense: entry.expense,
      net: entry.net
    }));

  const savingsRateEl = document.getElementById('kpiMargin');
  if (savingsRateEl) {
    savingsRateEl.textContent = fmtPct.format(savingsRate);
    applyMetricColor(savingsRateEl, savingsRate, true);
  }

  const netTrendEl = document.getElementById('metricNetTrend');
  if (netTrendEl) {
    const netValues = historyForView
      .map(entry => entry.net)
      .filter(value => Number.isFinite(value));

    if (netValues.length) {
      const recentNet = netValues.slice(-3);
      const averageNet = recentNet.reduce((sum, value) => sum + value, 0) / recentNet.length;
      const formattedNet = fmtDecimal.format(averageNet);
      netTrendEl.textContent = averageNet > 0 ? `+${formattedNet}` : formattedNet;
      applyMetricColor(netTrendEl, averageNet, true);
    } else {
      netTrendEl.textContent = '—';
      applyMetricColor(netTrendEl, null, true);
    }
  }

  const coverageEl = document.getElementById('metricExpenseCoverage');
  if (coverageEl) {
    if (expV > 0) {
      const coverageRatio = incV / expV;
      coverageEl.textContent = `${ratioFormatter.format(coverageRatio)}×`;
      applyMetricColor(coverageEl, coverageRatio - 1, true);
    } else if (incV > 0) {
      coverageEl.textContent = '∞';
      applyMetricColor(coverageEl, Number.POSITIVE_INFINITY, true);
    } else {
      coverageEl.textContent = '—';
      applyMetricColor(coverageEl, null, true);
    }
  }

  const historyIncome = historyForView.map(entry => entry.income);
  const historyExpense = historyForView.map(entry => entry.expense);
  const historyNet = historyForView.map(entry => entry.net);
  const historySavings = historyForView.map(entry => {
    const netCandidate = Number(entry.net);
    if (Number.isFinite(netCandidate)) {
      return netCandidate;
    }

    const incomeVal = Number(entry.income) || 0;
    const expenseVal = Number(entry.expense) || 0;
    const fallback = incomeVal - expenseVal;
    return Number.isFinite(fallback) ? fallback : 0;
  });

  const incomeSpark = historyIncome.length > 1
    ? historyIncome
    : [historyIncome[0] || 0, historyIncome[0] || 0];
  const expenseSpark = historyExpense.length > 1
    ? historyExpense
    : [historyExpense[0] || 0, historyExpense[0] || 0];
  const netSpark = historyNet.length > 1
    ? historyNet
    : [historyNet[0] || 0, historyNet[0] || 0];
  const savingsSpark = historySavings.length > 1
    ? historySavings
    : [historySavings[0] || 0, historySavings[0] || 0];

  const sparkOptions = { width: 60, height: 28, lineWidth: 1.75 };

  updateSparkline('sparkIncome', incomeSpark, '#10b981', sparkOptions);
  updateSparkline('sparkExpense', expenseSpark, '#ef4444', sparkOptions);
  updateSparkline('sparkNet', netSpark, '#3b82f6', sparkOptions);
  updateSparkline('sparkSavings', savingsSpark, '#8b5cf6', sparkOptions);
}

function updateTrendBadge(id, change, higherIsBetter) {
  const el = document.getElementById(id);
  if (!el) return;

  const isPositive = higherIsBetter ? change > 0 : change < 0;
  const icon = change > 0 ? 'arrow-up' : change < 0 ? 'arrow-down' : 'minus';
  const className = isPositive ? 'trend-badge up' : 'trend-badge down';

  el.className = className;
  el.innerHTML = `
    <i data-lucide="${icon}" class="w-3 h-3"></i>
    ${Math.abs(change * 100).toFixed(1)}%
  `;
  lucide.createIcons();
}

function updateSparkline(id, data, color, options = {}) {
  const canvas = document.getElementById(id);
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const fallbackWidth = Number(canvas.getAttribute('width')) || 60;
  const fallbackHeight = Number(canvas.getAttribute('height')) || 28;
  const cssWidth = options.width !== undefined && options.width !== null
    ? options.width
    : (canvas.clientWidth || fallbackWidth);
  const cssHeight = options.height !== undefined && options.height !== null
    ? options.height
    : (canvas.clientHeight || fallbackHeight);

  canvas.width = cssWidth * dpr;
  canvas.height = cssHeight * dpr;

  if (options.width) {
    canvas.style.width = `${cssWidth}px`;
  }

  if (options.height) {
    canvas.style.height = `${cssHeight}px`;
  }

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.scale(dpr, dpr);

  const width = cssWidth;
  const height = cssHeight;

  const values = (Array.isArray(data) && data.length ? data : [0, 0]).map(val => {
    const numeric = Number(val);
    return Number.isFinite(numeric) ? numeric : 0;
  });
  const max = Math.max(...values);
  const min = Math.min(...values);
  const range = max - min || 1;

  ctx.clearRect(0, 0, width, height);
  ctx.strokeStyle = color;
  const desiredLineWidth = options.lineWidth !== undefined && options.lineWidth !== null
    ? options.lineWidth
    : Math.max(1.5, width / 40);
  ctx.lineWidth = desiredLineWidth;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.beginPath();

  const divisor = values.length > 1 ? (values.length - 1) : 1;

  values.forEach((val, i) => {
    const x = (i / divisor) * width;
    const y = height - ((val - min) / range) * height;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });

  ctx.stroke();
}

export function initEntryInteractions() {
  setupCategoryModal();
  setupActionButtons();
  setupImportExport();
  setupViewSwitcher();
}

function setupCategoryModal() {
  const openBtn = document.getElementById('btnCategories');
  const modal = document.getElementById('categoryModal');
  const closeBtn = document.getElementById('closeCategoryModal');
  const addBtn = document.getElementById('addCategoryBtn');
  const input = document.getElementById('newCategoryInput');
  const resetBtn = document.getElementById('resetCategoriesBtn');
  const confirmBtn = document.getElementById('confirmCategoryBtn');

  if (openBtn) {
    openBtn.addEventListener('click', () => {
      if (modal) {
        modal.classList.add('active');
      }
      renderCategoryModal();
    });
  }

  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      if (modal) {
        modal.classList.remove('active');
      }
    });
  }

  if (addBtn) {
    addBtn.addEventListener('click', () => {
      const value = input && input.value ? input.value.trim() : '';
      if (!value) {
        if (input) {
          input.focus();
        }
        return;
      }
      if (!state.categories.includes(value)) {
        state.categories.push(value);
        if (input) {
          input.value = '';
        }
        renderCategoryModal();
        save();
        renderTable();
        refreshDashboard();
      }
    });
  }

  if (input) {
    input.addEventListener('keypress', (e) => {
      if (e.key === 'Enter' && addBtn) {
        addBtn.click();
      }
    });
  }

  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      if (!confirm('Reset categories to default?')) return;
      state.categories = [...state.defaultCategories];
      renderCategoryModal();
      save();
      renderTable();
      refreshDashboard();
    });
  }

  if (confirmBtn) {
    confirmBtn.addEventListener('click', () => {
      if (modal) {
        modal.classList.remove('active');
      }
      renderTable();
      refreshDashboard();
    });
  }

  if (modal) {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        modal.classList.remove('active');
      }
    });
  }
}

function renderCategoryModal() {
  const list = document.getElementById('categoryList');
  if (!list) return;

  list.innerHTML = state.categories.map(cat => `
    <div class="category-item" data-category="${cat}">
      <span>${cat}</span>
      <button class="remove-cat" data-remove-category="${cat}" aria-label="Remove ${cat}">
        <i data-lucide="x" class="w-4 h-4"></i>
      </button>
    </div>
  `).join('');

  list.querySelectorAll('[data-remove-category]').forEach(btn => {
    btn.addEventListener('click', () => {
      const cat = btn.getAttribute('data-remove-category');
      removeCategory(cat);
    });
  });

  lucide.createIcons();
}

function removeCategory(cat) {
  state.categories = state.categories.filter(c => c !== cat);
  renderCategoryModal();
  save();
  renderTable();
  refreshDashboard();
}

function setupActionButtons() {
  const addIncomeBtn = document.getElementById('addIncome');
  if (addIncomeBtn) {
    addIncomeBtn.addEventListener('click', () => {
      state.rows.push({
        id: generateId(),
        type: 'income',
        name: '',
        value: 0,
        mode: 'amount',
        reference: '',
        freq: 'monthly',
        category: ''
      });
      save();
      renderTable();
      refreshDashboard();
    });
  }

  const addExpenseBtn = document.getElementById('addExpense');
  if (addExpenseBtn) {
    addExpenseBtn.addEventListener('click', () => {
      state.rows.push({
        id: generateId(),
        type: 'expense',
        name: '',
        value: 0,
        mode: 'amount',
        reference: '',
        freq: 'monthly',
        category: ''
      });
      save();
      renderTable();
      refreshDashboard();
    });
  }

  const exampleBtn = document.getElementById('btnExample');
  if (exampleBtn) {
    exampleBtn.addEventListener('click', () => {
      state.rows = [
        { id: '1', type: 'income', name: 'Salary', value: 75000, mode: 'amount', reference: '', freq: 'yearly', category: 'Salary' },
        { id: '2', type: 'income', name: 'Tips', value: 5, mode: 'amount', reference: '', freq: 'daily', category: 'Other Income' },
        { id: '3', type: 'expense', name: 'Income Tax', value: 30, mode: 'percent', reference: 'Salary', freq: 'yearly', category: 'Other' },
        { id: '4', type: 'expense', name: 'Electric', value: 300, mode: 'amount', reference: '', freq: 'monthly', category: 'Utilities' },
        { id: '5', type: 'expense', name: 'Mortgage', value: 1800, mode: 'amount', reference: '', freq: 'monthly', category: 'Housing' },
        { id: '6', type: 'expense', name: 'Internet', value: 60, mode: 'amount', reference: '', freq: 'monthly', category: 'Utilities' },
        { id: '7', type: 'expense', name: 'Groceries', value: 500, mode: 'amount', reference: '', freq: 'monthly', category: 'Food' },
        { id: '8', type: 'expense', name: 'Car Insurance', value: 1200, mode: 'amount', reference: '', freq: 'yearly', category: 'Transport' },
        { id: '9', type: 'expense', name: 'Gas', value: 200, mode: 'amount', reference: '', freq: 'monthly', category: 'Transport' },
        { id: '10', type: 'expense', name: 'Dining Out', value: 300, mode: 'amount', reference: '', freq: 'monthly', category: 'Food' }
      ];
      save();
      renderTable();
      refreshDashboard();
    });
  }
}

function setupImportExport() {
  const exportBtn = document.getElementById('btnExport');
  if (exportBtn) {
    exportBtn.addEventListener('click', () => {
      const blob = new Blob([JSON.stringify({ rows: state.rows }, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `budget-${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
    });
  }

  const importInput = document.getElementById('fileImport');
  if (importInput) {
    importInput.addEventListener('change', async e => {
      const target = e.target;
      const files = target && target.files ? target.files : null;
      const file = files && files[0] ? files[0] : null;
      if (!file) return;
      try {
        const text = await file.text();
        const data = JSON.parse(text);
        if (!data || !Array.isArray(data.rows)) throw new Error('Invalid file');
        state.rows = normalizeRows(data.rows);
        save();
        renderTable();
        refreshDashboard();
        alert('✅ Data imported successfully!');
      } catch (err) {
        console.error(err);
        alert('❌ Import failed. Invalid file.');
      } finally {
        if (target) {
          target.value = '';
        }
      }
    });
  }

  const clearAllBtn = document.getElementById('btnClearAll');
  if (clearAllBtn) {
    clearAllBtn.addEventListener('click', () => {
      if (!confirm('⚠️ Clear all entries? This cannot be undone.')) return;
      state.rows = [];
      save();
      renderTable();
      refreshDashboard();
    });
  }
}

function setupViewSwitcher() {
  const switcher = document.getElementById('viewSwitcher');
  if (switcher && !switcher.dataset.listenerAttached) {
    switcher.dataset.listenerAttached = 'true';
    switcher.addEventListener('click', e => {
      const btn = e.target.closest('button[data-view]');
      if (!btn) return;
      state.view = btn.dataset.view;
      save();
      refreshDashboard();
      const entryPage = document.getElementById('pageEntry');
      if (entryPage && !entryPage.classList.contains('hidden')) {
        renderTable();
      }
    });
  }

  const filterRow = document.getElementById('dashboardFilterRow');
  if (filterRow && !filterRow.dataset.listenerAttached) {
    filterRow.dataset.listenerAttached = 'true';
    filterRow.addEventListener('click', e => {
      const btn = e.target.closest('button[data-filter-type]');
      if (!btn) return;
      const filters = ensureDashboardFilters();
      const filterType = btn.dataset.filterType;
      const rawValue = btn.dataset.value || 'all';
      let changed = false;

      if (filterType === 'category') {
        const nextCategory = rawValue === 'all' ? 'all' : rawValue;
        if (filters.category === nextCategory) {
          if (nextCategory !== 'all') {
            filters.category = 'all';
            changed = true;
          }
        } else {
          filters.category = nextCategory;
          changed = true;
        }
      } else if (filterType === 'type') {
        const normalized = (rawValue || '').toLowerCase();
        const nextType = VALID_DASHBOARD_TYPES.includes(normalized) ? normalized : 'all';
        if (filters.type === nextType) {
          if (nextType !== 'all') {
            filters.type = 'all';
            changed = true;
          }
        } else {
          filters.type = nextType;
          changed = true;
        }
      }

      if (changed) {
        save();
        refreshDashboard();
      }
    });
  }
}
