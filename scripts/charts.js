import { state } from './state.js';
import { fmt, fromMonthly } from './formatting.js';

let chartTrend = null;
let chartBreakdown = null;

export function updateCharts(totals, results, view) {
  const history = Array.isArray(state.history) ? state.history : [];
  const monthFormatter = new Intl.DateTimeFormat('en-US', { month: 'short', year: 'numeric' });

  const labels = history.map(entry => {
    if (!entry?.month) return '';
    const [year, month] = entry.month.split('-').map(Number);
    if (!year || !month) return entry.month;
    return monthFormatter.format(new Date(year, month - 1));
  });

  const incomeSeries = history.map(entry => fromMonthly(entry?.income || 0, view));
  const expenseSeries = history.map(entry => fromMonthly(entry?.expense || 0, view));

  if (!labels.length) {
    labels.push('Current');
    incomeSeries.push(fromMonthly(totals.inc, view));
    expenseSeries.push(fromMonthly(totals.exp, view));
  }

  if (!chartTrend) {
    chartTrend = new Chart(document.getElementById('chartTrend'), {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: 'Income',
            data: incomeSeries,
            borderColor: '#10b981',
            backgroundColor: 'rgba(16, 185, 129, 0.1)',
            fill: true,
            tension: 0.4
          },
          {
            label: 'Expenses',
            data: expenseSeries,
            borderColor: '#ef4444',
            backgroundColor: 'rgba(239, 68, 68, 0.1)',
            fill: true,
            tension: 0.4
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: 'rgba(15, 23, 42, 0.95)',
            padding: 12,
            borderColor: 'rgba(100, 116, 180, 0.3)',
            borderWidth: 1,
            callbacks: {
              label: ctx => `${ctx.dataset.label}: ${fmt.format(ctx.parsed.y)}`
            }
          }
        },
        scales: {
          y: {
            beginAtZero: true,
            grid: { color: 'rgba(100, 116, 180, 0.1)' },
            ticks: {
              color: '#94a3b8',
              callback: value => fmt.format(value)
            }
          },
          x: {
            grid: { display: false },
            ticks: { color: '#94a3b8' }
          }
        }
      }
    });
  } else {
    chartTrend.data.labels = labels;
    chartTrend.data.datasets[0].data = incomeSeries;
    chartTrend.data.datasets[1].data = expenseSeries;
    chartTrend.update();
  }

  const expenseRows = state.rows.filter(r => r.type === 'expense');
  const expenseLabels = expenseRows.map(r => r.name || '(unnamed)');
  const expenseData = expenseRows.map(r => fromMonthly(results.get(r.id) || 0, view));

  if (!chartBreakdown) {
    chartBreakdown = new Chart(document.getElementById('chartBreakdown'), {
      type: 'doughnut',
      data: {
        labels: expenseLabels,
        datasets: [
          {
            data: expenseData,
            backgroundColor: [
              '#ef4444', '#f97316', '#f59e0b', '#eab308', '#84cc16',
              '#22c55e', '#10b981', '#14b8a6', '#06b6d4', '#0ea5e9',
              '#3b82f6', '#6366f1', '#8b5cf6', '#a855f7', '#d946ef'
            ],
            borderWidth: 2,
            borderColor: '#0f172a'
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'bottom',
            labels: {
              color: '#cbd5e1',
              padding: 15,
              font: { size: 11 },
              usePointStyle: true
            }
          },
          tooltip: {
            backgroundColor: 'rgba(15, 23, 42, 0.95)',
            padding: 12,
            borderColor: 'rgba(100, 116, 180, 0.3)',
            borderWidth: 1,
            callbacks: {
              label: ctx => `${ctx.label}: ${fmt.format(ctx.parsed)}`
            }
          }
        }
      }
    });
  } else {
    chartBreakdown.data.labels = expenseLabels;
    chartBreakdown.data.datasets[0].data = expenseData;
    chartBreakdown.update();
  }
}
