import { state, calcMonthlyValues, generateId } from './state.js';
import { save } from './storage.js';
import { fmt, fmtDecimal, fmtPct, fromMonthly, parseValue } from './formatting.js';
import { updateCharts } from './charts.js';

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
  const incV = fromMonthly(totals.inc, view);
  const expV = fromMonthly(totals.exp, view);
  const netV = fromMonthly(totals.net, view);

  document.getElementById('kpiIncome').textContent = fmt.format(incV);
  document.getElementById('kpiExpenses').textContent = fmt.format(expV);
  document.getElementById('kpiNet').textContent = fmt.format(netV);

  const savingsRate = totals.inc > 0 ? (totals.net / totals.inc) : 0;
  document.getElementById('kpiMargin').textContent = fmtPct.format(savingsRate);

  const circumference = 175.93;
  const offset = circumference - (savingsRate * circumference);
  const circle = document.getElementById('progressCircle');
  if (circle) circle.style.strokeDashoffset = offset;

  const incChange = state.lastMonthData.income > 0 ? (incV - state.lastMonthData.income) / state.lastMonthData.income : 0;
  const expChange = state.lastMonthData.expenses > 0 ? (expV - state.lastMonthData.expenses) / state.lastMonthData.expenses : 0;
  const netChange = state.lastMonthData.net !== 0 ? (netV - state.lastMonthData.net) / Math.abs(state.lastMonthData.net) : 0;

  updateTrendBadge('incomeChange', incChange, true);
  updateTrendBadge('expenseChange', expChange, false);
  updateTrendBadge('netChange', netChange, true);

  document.getElementById('statEntries').textContent = state.rows.length;
  document.getElementById('statRecurring').textContent = state.rows.filter(r => r.freq !== 'monthly').length;
  document.getElementById('statAvgDaily').textContent = fmt.format(fromMonthly(totals.exp, 'daily'));

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

  updateCharts(totals, results, view);

  const sparkData = [0.8, 0.9, 1.0, 0.95, 1.1, 1.0].map(m => incV * m);
  updateSparkline('sparkIncome', sparkData, '#10b981');
  updateSparkline('sparkExpense', sparkData, '#ef4444');
  updateSparkline('sparkNet', sparkData.map((v, i) => v - expV * [0.9, 0.95, 0.9, 1.0, 0.85, 0.9][i]), '#3b82f6');
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

function updateSparkline(id, data, color) {
  const canvas = document.getElementById(id);
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  const width = canvas.width = 80;
  const height = canvas.height = 30;

  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;

  ctx.clearRect(0, 0, width, height);
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.beginPath();

  data.forEach((val, i) => {
    const x = (i / (data.length - 1)) * width;
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
