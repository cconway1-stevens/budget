import { state, calcMonthlyValues, generateId } from './state.js';
import { save } from './storage.js';
import { fmt, fmtDecimal, fmtPct, fromMonthly, parseValue } from './formatting.js';
import { updateCharts } from './charts.js';

const ratioFormatter = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
});

function getSortedRows() {
  const sorted = [...state.rows];

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

export function renderTable() {
  const tbody = document.getElementById('ledgerBody');
  if (!tbody) return;

  const { results } = calcMonthlyValues();
  const sortedRows = getSortedRows();

  tbody.innerHTML = sortedRows.map((r) => {
    const monthly = results.get(r.id) || 0;
    const daily = fromMonthly(monthly, 'daily');
    const weekly = fromMonthly(monthly, 'weekly');
    const yearly = fromMonthly(monthly, 'yearly');

    const displayValue = r.mode === 'percent'
      ? `${r.value}%${r.reference ? ' of @' + r.reference : ''}`
      : r.value;

    return `
      <tr data-id="${r.id}">
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
      const id = row?.dataset.id;
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
      const id = btn.closest('tr')?.dataset.id;
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

  quickAddBtn?.addEventListener('click', () => {
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

  [quickName, quickValue].forEach(input => {
    input?.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') quickAddBtn?.click();
    });
  });
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

  const { totals, results } = calcMonthlyValues();
  const categoryMonthlyTotals = {};
  state.rows.forEach(row => {
    if (!row?.category) return;
    const monthlyVal = results.get(row.id) || 0;
    const typeKey = row.type === 'income' ? 'income' : 'expense';
    if (!categoryMonthlyTotals[row.category]) {
      categoryMonthlyTotals[row.category] = { income: 0, expense: 0 };
    }
    categoryMonthlyTotals[row.category][typeKey] += monthlyVal;
  });

  const normalizedCategoryTotals = Object.fromEntries(
    Object.entries(categoryMonthlyTotals).sort(([a], [b]) => a.localeCompare(b))
  );

  const now = new Date();
  const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  if (!Array.isArray(state.history)) {
    state.history = [];
  }

  const lastSnapshot = state.history[state.history.length - 1];
  const monthlySnapshot = {
    month: monthKey,
    income: totals.inc,
    expense: totals.exp,
    net: totals.net
  };

  let historyChanged = false;
  let shouldSave = false;
  if (!lastSnapshot || lastSnapshot.month !== monthKey) {
    state.history.push({ ...monthlySnapshot });
    historyChanged = true;
  } else if (
    lastSnapshot.income !== monthlySnapshot.income ||
    lastSnapshot.expense !== monthlySnapshot.expense ||
    lastSnapshot.net !== monthlySnapshot.net
  ) {
    Object.assign(lastSnapshot, monthlySnapshot);
    historyChanged = true;
  }

  if (historyChanged) {
    shouldSave = true;
  }

  const prevCategoryTotals = JSON.stringify(state.totalsByCategory || {});
  const serializedCategoryTotals = JSON.stringify(normalizedCategoryTotals);
  if (prevCategoryTotals !== serializedCategoryTotals) {
    state.totalsByCategory = normalizedCategoryTotals;
    shouldSave = true;
  }

  const incV = fromMonthly(totals.inc, view);
  const expV = fromMonthly(totals.exp, view);
  const netV = fromMonthly(totals.net, view);
  const savingsRate = totals.inc > 0 ? (totals.net / totals.inc) : 0;

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
    const [year, month] = (entry?.month || '').split('-').map(Number);
    let label = entry?.month || '';
    if (year && month) {
      label = monthFormatter.format(new Date(year, month - 1));
    } else if (!label) {
      label = 'Current';
    }

    const incomeVal = fromMonthly(entry?.income || 0, view);
    const expenseVal = fromMonthly(entry?.expense || 0, view);
    const netSource = entry?.net ?? ((entry?.income || 0) - (entry?.expense || 0));
    const netVal = fromMonthly(netSource, view);

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

  const trendSeries = {
    labels: trendPoints.map(point => point.label),
    income: trendPoints.map(point => point.income),
    expense: trendPoints.map(point => point.expense),
    net: trendPoints.map(point => point.net)
  };

  const goalValue = fromMonthly(state.netGoal ?? 0, view);

  const totalsByCategory = Object.fromEntries(
    Object.entries(normalizedCategoryTotals).map(([category, values]) => [
      category,
      {
        income: fromMonthly(values.income, view),
        expense: fromMonthly(values.expense, view)
      }
    ])
  );

  const categoryBreakdownEntries = Object.entries(totalsByCategory)
    .map(([category, values]) => ({
      category,
      income: Math.max(values.income ?? 0, 0),
      expense: Math.max(values.expense ?? 0, 0)
    }))
    .filter(entry => entry.expense > 0);

  categoryBreakdownEntries.sort((a, b) => {
    const expenseDiff = (b.expense || 0) - (a.expense || 0);
    if (expenseDiff !== 0) return expenseDiff;
    return a.category.localeCompare(b.category);
  });

  const topCategoryEntries = categoryBreakdownEntries.slice(0, 8);
  const remainingEntries = categoryBreakdownEntries.slice(8);

  if (remainingEntries.length > 0) {
    const aggregate = remainingEntries.reduce((acc, entry) => {
      acc.income += entry.income;
      acc.expense += entry.expense;
      return acc;
    }, { category: 'Other', income: 0, expense: 0 });
    if (aggregate.expense > 0) {
      topCategoryEntries.push(aggregate);
    }
  }

  const serializedBreakdown = JSON.stringify(topCategoryEntries);
  if (JSON.stringify(state.categoryBreakdown || []) !== serializedBreakdown) {
    state.categoryBreakdown = topCategoryEntries.map(entry => ({ ...entry }));
    shouldSave = true;
  }

  const bindCategoryKpi = (category, amountId, pctId) => {
    const amountEl = document.getElementById(amountId);
    if (!amountEl) return;

    const data = totalsByCategory[category];
    const incomeAmount = data?.income ?? 0;
    const expenseAmount = data?.expense ?? 0;

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

  const dailyExpenses = fromMonthly(totals.exp, 'daily');
  const annualExpenses = fromMonthly(totals.exp, 'yearly');
  document.getElementById('statAvgDaily').textContent = fmt.format(dailyExpenses);

  const annualExpensesEl = document.getElementById('statAnnualExpenses');
  if (annualExpensesEl) {
    annualExpensesEl.textContent = fmt.format(annualExpenses);
  }

  const annualContextEl = document.getElementById('statAnnualContext');
  if (annualContextEl) {
    if (annualExpenses > 0) {
      const annualIncome = fromMonthly(totals.inc, 'yearly');
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

  bindCategoryKpi('Investments', 'kpiInvestments', 'kpiInvestmentsPct');
  bindCategoryKpi('Taxes', 'kpiTaxes', 'kpiTaxesPct');
  bindCategoryKpi('Savings', 'kpiSavings', 'kpiSavingsPct');

  const topExpensesEl = document.getElementById('topExpenses');
  if (topExpensesEl) {
    const expensesWithValues = state.rows
      .filter(row => row.type === 'expense')
      .map(row => {
        const monthlyAmount = results.get(row.id) || 0;
        return {
          id: row.id,
          name: row.category || row.name || 'Uncategorized',
          monthlyAmount,
          viewAmount: fromMonthly(monthlyAmount, view)
        };
      })
      .filter(item => item.monthlyAmount > 0);

    if (expensesWithValues.length === 0) {
      topExpensesEl.innerHTML = `
        <p class="text-sm text-slate-400">No expenses recorded yet</p>
      `;
    } else {
      const topExpenses = expensesWithValues
        .sort((a, b) => b.monthlyAmount - a.monthlyAmount)
        .slice(0, 5);

      const totalExpenses = totals.exp;
      topExpensesEl.innerHTML = topExpenses.map(expense => {
        const share = totalExpenses > 0 ? (expense.monthlyAmount / totalExpenses) : 0;
        const sharePct = Math.min(1, Math.max(0, share));
        const shareLabel = fmtPct.format(sharePct);
        const width = `${(sharePct * 100).toFixed(0)}%`;
        return `
          <div class="space-y-1">
            <div class="flex items-center justify-between text-sm">
              <span class="font-medium text-white">${expense.name}</span>
              <span class="text-white">${fmt.format(expense.viewAmount)}</span>
            </div>
            <div class="flex items-center justify-between text-xs text-slate-400">
              <span>Share of expenses</span>
              <span>${shareLabel}</span>
            </div>
            <div class="h-1.5 bg-slate-700/60 rounded-full overflow-hidden">
              <div class="h-full bg-red-500" style="width: ${width};"></div>
            </div>
          </div>
        `;
      }).join('');
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
  const historySavings = historyForView.map(entry => Math.max(entry.income - entry.expense, 0));

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

  const sparkOptions = { width: 60, height: 28, lineWidth: 1.5 };

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
  const cssWidth = options.width ?? canvas.clientWidth || canvas.width || 80;
  const cssHeight = options.height ?? canvas.clientHeight || canvas.height || 30;

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

  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;

  ctx.clearRect(0, 0, width, height);
  ctx.strokeStyle = color;
  ctx.lineWidth = options.lineWidth ?? 2;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.beginPath();

  const divisor = data.length > 1 ? (data.length - 1) : 1;

  data.forEach((val, i) => {
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

  openBtn?.addEventListener('click', () => {
    modal?.classList.add('active');
    renderCategoryModal();
  });

  closeBtn?.addEventListener('click', () => {
    modal?.classList.remove('active');
  });

  addBtn?.addEventListener('click', () => {
    if (!input?.value.trim()) return;
    const value = input.value.trim();
    if (!state.categories.includes(value)) {
      state.categories.push(value);
      input.value = '';
      renderCategoryModal();
      save();
      renderTable();
      refreshDashboard();
    }
  });

  input?.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') addBtn?.click();
  });

  resetBtn?.addEventListener('click', () => {
    if (!confirm('Reset categories to default?')) return;
    state.categories = [...state.defaultCategories];
    renderCategoryModal();
    save();
    renderTable();
    refreshDashboard();
  });

  confirmBtn?.addEventListener('click', () => {
    modal?.classList.remove('active');
    renderTable();
    refreshDashboard();
  });

  modal?.addEventListener('click', (e) => {
    if (e.target === modal) {
      modal.classList.remove('active');
    }
  });
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
  document.getElementById('addIncome')?.addEventListener('click', () => {
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

  document.getElementById('addExpense')?.addEventListener('click', () => {
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

  document.getElementById('btnExample')?.addEventListener('click', () => {
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

function setupImportExport() {
  document.getElementById('btnExport')?.addEventListener('click', () => {
    const blob = new Blob([JSON.stringify({ rows: state.rows }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `budget-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  });

  document.getElementById('fileImport')?.addEventListener('change', async e => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      if (!data || !Array.isArray(data.rows)) throw new Error('Invalid file');
      state.rows = data.rows;
      save();
      renderTable();
      refreshDashboard();
      alert('✅ Data imported successfully!');
    } catch (err) {
      console.error(err);
      alert('❌ Import failed. Invalid file.');
    } finally {
      e.target.value = '';
    }
  });

  document.getElementById('btnClearAll')?.addEventListener('click', () => {
    if (!confirm('⚠️ Clear all entries? This cannot be undone.')) return;
    state.rows = [];
    save();
    renderTable();
    refreshDashboard();
  });
}

function setupViewSwitcher() {
  document.getElementById('viewSwitcher')?.addEventListener('click', e => {
    const btn = e.target.closest('button[data-view]');
    if (!btn) return;
    state.view = btn.dataset.view;
    save();
    refreshDashboard();
    if (!document.getElementById('pageEntry').classList.contains('hidden')) {
      renderTable();
    }
  });
}
