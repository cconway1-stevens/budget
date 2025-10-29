import { state } from './state.js';
import { fmt, fmtPct } from './formatting.js';

let chartTrend = null;
let chartBreakdown = null;

export function updateCharts(trendSeries = {}, goalValue) {
  const rawLabels = Array.isArray(trendSeries?.labels) ? trendSeries.labels : [];
  const rawIncome = Array.isArray(trendSeries?.income) ? trendSeries.income : [];
  const rawExpense = Array.isArray(trendSeries?.expense) ? trendSeries.expense : [];
  const rawNet = Array.isArray(trendSeries?.net) ? trendSeries.net : [];

  const fallbackLabel = rawLabels[0] ?? 'Current';
  const fallbackIncome = Number.isFinite(rawIncome[0]) ? rawIncome[0] : 0;
  const fallbackExpense = Number.isFinite(rawExpense[0]) ? rawExpense[0] : 0;
  const fallbackNet = Number.isFinite(rawNet[0]) ? rawNet[0] : (fallbackIncome - fallbackExpense);

  const labels = rawLabels.length ? rawLabels : [fallbackLabel];
  const incomeSeries = labels.map((_, idx) => Number.isFinite(rawIncome[idx]) ? rawIncome[idx] : fallbackIncome);
  const expenseSeries = labels.map((_, idx) => Number.isFinite(rawExpense[idx]) ? rawExpense[idx] : fallbackExpense);
  const netSeries = labels.map((_, idx) => Number.isFinite(rawNet[idx]) ? rawNet[idx] : fallbackNet);

  const goalLine = Number.isFinite(goalValue)
    ? labels.map(() => goalValue)
    : null;

  const netDataset = {
    label: 'Net',
    data: netSeries,
    borderColor: '#38bdf8',
    backgroundColor: ctx => (ctx?.parsed?.y ?? 0) >= 0
      ? 'rgba(56, 189, 248, 0.25)'
      : 'rgba(239, 68, 68, 0.25)',
    fill: 'origin',
    tension: 0.25,
    borderWidth: 2.5,
    pointRadius: 4,
    pointHoverRadius: 6,
    pointBackgroundColor: '#38bdf8',
    pointBorderColor: '#0f172a',
    pointBorderWidth: 2,
    order: 1
  };

  const incomeBandDataset = {
    label: 'Income band',
    data: incomeSeries,
    borderColor: 'rgba(16, 185, 129, 0.6)',
    backgroundColor: 'rgba(16, 185, 129, 0.08)',
    borderWidth: 1.5,
    borderDash: [6, 6],
    pointRadius: 0,
    pointHoverRadius: 0,
    tension: 0,
    stepped: true,
    fill: 'origin',
    order: 0
  };

  const expenseBandDataset = {
    label: 'Expense band',
    data: expenseSeries,
    borderColor: 'rgba(239, 68, 68, 0.6)',
    backgroundColor: 'rgba(239, 68, 68, 0.08)',
    borderWidth: 1.5,
    borderDash: [6, 6],
    pointRadius: 0,
    pointHoverRadius: 0,
    tension: 0,
    stepped: true,
    fill: 'origin',
    order: 0
  };

  const datasets = [incomeBandDataset, expenseBandDataset, netDataset];

  if (goalLine) {
    datasets.push({
      label: 'Goal',
      data: goalLine,
      borderColor: '#facc15',
      borderWidth: 1.5,
      borderDash: [8, 6],
      pointRadius: 0,
      pointHoverRadius: 0,
      fill: false,
      order: 2
    });
  }

  const trendCanvas = document.getElementById('chartTrend');

  if (!chartTrend && trendCanvas) {
    chartTrend = new Chart(trendCanvas, {
      type: 'line',
      data: {
        labels,
        datasets
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: 'rgba(15, 23, 42, 0.95)',
            padding: 12,
            borderColor: 'rgba(100, 116, 180, 0.3)',
            borderWidth: 1,
            filter: ctx => ctx.dataset?.label === 'Net' || ctx.dataset?.label === 'Goal',
            itemSort: (a, b) => {
              if (a.dataset?.label === b.dataset?.label) return 0;
              if (a.dataset?.label === 'Net') return -1;
              if (b.dataset?.label === 'Net') return 1;
              return 0;
            },
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
  } else if (chartTrend && trendCanvas) {
    chartTrend.data.labels = labels;
    chartTrend.data.datasets = datasets;
    chartTrend.update();
  }

  if (!trendCanvas && chartTrend) {
    chartTrend.destroy();
    chartTrend = null;
  }

  const breakdownCanvas = document.getElementById('chartBreakdown');
  const breakdownContainer = breakdownCanvas?.parentElement;
  breakdownContainer?.classList.add('chart-breakdown-container');

  const categoryBreakdown = Array.isArray(state.categoryBreakdown)
    ? state.categoryBreakdown
    : [];

  const breakdownLabels = categoryBreakdown.map(entry => entry.category);
  const breakdownValues = categoryBreakdown.map(entry => Math.max(entry?.expense ?? entry?.amount ?? 0, 0));
  const totalBreakdownValue = breakdownValues.reduce((sum, val) => sum + val, 0);

  let runningTotal = 0;
  const cumulativePercentages = breakdownValues.map(value => {
    runningTotal += value;
    if (totalBreakdownValue <= 0) return 0;
    return (runningTotal / totalBreakdownValue) * 100;
  });

  const palette = [
    '#ef4444', '#f97316', '#f59e0b', '#eab308', '#84cc16',
    '#22c55e', '#10b981', '#14b8a6', '#06b6d4', '#0ea5e9',
    '#3b82f6', '#6366f1', '#8b5cf6', '#a855f7', '#d946ef'
  ];
  const barColors = breakdownValues.map((_, index) => palette[index % palette.length]);

  const tooltipCallbacks = {
    label: ctx => {
      const datasetLabel = ctx.dataset.label || '';
      const rawValue = typeof ctx.parsed?.x === 'number'
        ? ctx.parsed.x
        : (typeof ctx.parsed?.y === 'number' ? ctx.parsed.y : 0);
      if (ctx.dataset.type === 'line') {
        const pct = rawValue / 100;
        return `${datasetLabel}: ${fmtPct.format(pct)}`;
      }
      const total = ctx.dataset.metaTotal ?? totalBreakdownValue;
      const share = total > 0 ? (rawValue / total) : 0;
      return `${datasetLabel}: ${fmt.format(rawValue)} (${fmtPct.format(share)})`;
    },
    footer: items => {
      const index = items?.[0]?.dataIndex ?? 0;
      const pct = cumulativePercentages[index] ?? 0;
      return `Cumulative: ${fmtPct.format((pct || 0) / 100)}`;
    }
  };

  const trimLabel = label => {
    if (typeof label !== 'string') return label;
    return label.length > 26 ? `${label.slice(0, 23)}…` : label;
  };

  const barDataset = {
    type: 'bar',
    label: 'Expenses',
    data: breakdownValues,
    backgroundColor: barColors,
    borderRadius: 10,
    borderSkipped: false,
    maxBarThickness: 24,
    metaTotal: totalBreakdownValue
  };

  const lineDataset = {
    type: 'line',
    label: 'Cumulative %',
    data: cumulativePercentages,
    yAxisID: 'percentage',
    borderColor: '#f97316',
    backgroundColor: 'rgba(249, 115, 22, 0.25)',
    tension: 0.35,
    fill: false,
    pointRadius: 4,
    pointHoverRadius: 6,
    pointBackgroundColor: '#f97316',
    pointBorderColor: '#0f172a',
    pointBorderWidth: 2,
    spanGaps: true
  };

  if (!chartBreakdown) {
    if (!breakdownCanvas) return;
    chartBreakdown = new Chart(breakdownCanvas, {
      type: 'bar',
      data: {
        labels: breakdownLabels,
        datasets: [barDataset, lineDataset]
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        layout: {
          padding: {
            top: 8,
            right: 8,
            bottom: 8,
            left: 0
          }
        },
        plugins: {
          legend: {
            position: 'top',
            labels: {
              color: '#cbd5e1',
              padding: 12,
              usePointStyle: true,
              boxWidth: 10,
              font: {
                size: 11
              }
            }
          },
          tooltip: {
            backgroundColor: 'rgba(15, 23, 42, 0.95)',
            padding: 12,
            borderColor: 'rgba(100, 116, 180, 0.3)',
            borderWidth: 1,
            callbacks: tooltipCallbacks
          }
        },
        scales: {
          x: {
            beginAtZero: true,
            grid: {
              color: 'rgba(100, 116, 180, 0.1)',
              drawBorder: false
            },
            ticks: {
              color: '#94a3b8',
              padding: 6,
              align: 'end',
              callback: value => fmt.format(value)
            }
          },
          y: {
            grid: {
              display: false,
              drawBorder: false
            },
            ticks: {
              color: '#cbd5e1',
              padding: 6,
              autoSkip: false,
              callback: value => trimLabel(String(value))
            }
          },
          percentage: {
            type: 'linear',
            position: 'right',
            axis: 'y',
            beginAtZero: true,
            min: 0,
            max: 100,
            grid: {
              drawOnChartArea: false,
              drawBorder: false
            },
            ticks: {
              color: '#facc15',
              padding: 6,
              callback: value => `${Math.round(value)}%`
            }
          }
        }
      }
    });
  } else {
    chartBreakdown.data.labels = breakdownLabels;
    chartBreakdown.data.datasets[0].data = breakdownValues;
    chartBreakdown.data.datasets[0].backgroundColor = barColors;
    chartBreakdown.data.datasets[0].metaTotal = totalBreakdownValue;
    chartBreakdown.data.datasets[1].data = cumulativePercentages;
    chartBreakdown.options.plugins.tooltip.callbacks = tooltipCallbacks;
    chartBreakdown.options.scales.y.ticks.callback = value => trimLabel(String(value));
    chartBreakdown.update();
  }
}
