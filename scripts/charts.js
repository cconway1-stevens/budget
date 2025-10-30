import { state } from './state.js';
import { fmt, fmtPct, fromMonthly } from './formatting.js';

let chartTrend = null;
let chartBreakdown = null;

export function updateCharts(trendSeries = {}, goalValue) {
  const resolvedGoal = Number.isFinite(goalValue) ? goalValue : null;
  const rawLabels = Array.isArray(trendSeries?.labels) ? trendSeries.labels : [];
  const rawIncome = Array.isArray(trendSeries?.income) ? trendSeries.income : [];
  const rawExpense = Array.isArray(trendSeries?.expense) ? trendSeries.expense : [];
  const rawNet = Array.isArray(trendSeries?.net) ? trendSeries.net : [];

  const fallbackLabel = rawLabels[0] ?? 'Current';
  const labels = rawLabels.length ? rawLabels : [fallbackLabel];

  const toNumber = (value) => {
    if (typeof value === 'number') return value;
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : null;
  };

  const firstFinite = (series) => {
    if (!Array.isArray(series)) return 0;
    for (const value of series) {
      const numeric = toNumber(value);
      if (numeric !== null) return numeric;
    }
    return 0;
  };

  const fallbackIncome = firstFinite(rawIncome);
  const fallbackExpense = firstFinite(rawExpense);

  const incomeSeries = labels.map((_, idx) => {
    const candidate = toNumber(rawIncome[idx]);
    if (candidate !== null) return candidate;
    return fallbackIncome;
  });

  const expenseSeries = labels.map((_, idx) => {
    const candidate = toNumber(rawExpense[idx]);
    if (candidate !== null) return candidate;
    return fallbackExpense;
  });

  const netSeries = labels.map((_, idx) => {
    const candidate = toNumber(rawNet[idx]);
    if (candidate !== null) return candidate;
    return incomeSeries[idx] - expenseSeries[idx];
  });

  const goalLine = resolvedGoal !== null
    ? labels.map(() => resolvedGoal)
    : null;

  const netDataset = {
    label: 'Net',
    data: netSeries,
    borderColor: '#38bdf8',
    fill: {
      target: 'origin',
      above: 'rgba(56, 189, 248, 0.2)',
      below: 'rgba(248, 113, 113, 0.25)'
    },
    tension: 0.25,
    borderWidth: 2.5,
    pointRadius: 3,
    pointHoverRadius: 5,
    pointBackgroundColor: ctx => ((ctx?.parsed?.y ?? 0) >= 0 ? '#38bdf8' : '#f87171'),
    pointBorderColor: '#0f172a',
    pointBorderWidth: 2,
    segment: {
      borderColor: ctx => {
        const prev = ctx?.p0?.parsed?.y ?? 0;
        const next = ctx?.p1?.parsed?.y ?? prev;
        return ((prev + next) / 2) >= 0 ? '#38bdf8' : '#f87171';
      }
    },
    order: 2
  };

  const incomeBandDataset = {
    label: 'Income band',
    data: incomeSeries,
    borderColor: 'rgba(16, 185, 129, 0.45)',
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    borderWidth: 1,
    borderDash: [4, 6],
    pointRadius: 0,
    pointHoverRadius: 0,
    tension: 0,
    stepped: true,
    fill: {
      target: 'origin',
      above: 'rgba(16, 185, 129, 0.1)',
      below: 'rgba(16, 185, 129, 0.05)'
    },
    order: 0
  };

  const expenseBandDataset = {
    label: 'Expense band',
    data: expenseSeries,
    borderColor: 'rgba(239, 68, 68, 0.45)',
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderWidth: 1,
    borderDash: [4, 6],
    pointRadius: 0,
    pointHoverRadius: 0,
    tension: 0,
    stepped: true,
    fill: {
      target: 'origin',
      above: 'rgba(239, 68, 68, 0.08)',
      below: 'rgba(239, 68, 68, 0.12)'
    },
    order: 1
  };

  const datasets = [];

  if (incomeSeries.some(val => Math.abs(val) > 0.0001)) {
    datasets.push(incomeBandDataset);
  }

  if (expenseSeries.some(val => Math.abs(val) > 0.0001)) {
    datasets.push(expenseBandDataset);
  }

  datasets.push(netDataset);

  if (goalLine) {
    datasets.push({
      label: 'Goal',
      data: goalLine,
      borderColor: '#facc15',
      borderWidth: 1.25,
      borderDash: [8, 6],
      pointRadius: 0,
      pointHoverRadius: 0,
      tension: 0,
      fill: false,
      order: 3
    });
  }

  const yValues = [...netSeries, ...(goalLine ?? [])];
  const numericYValues = yValues.filter(value => Number.isFinite(value));
  const minY = numericYValues.length ? Math.min(...numericYValues) : 0;
  const maxY = numericYValues.length ? Math.max(...numericYValues) : 0;
  const rangeY = maxY - minY;
  const paddingY = rangeY === 0
    ? Math.max(Math.abs(maxY), 1) * 0.15
    : rangeY * 0.12;
  const suggestedMin = minY - paddingY;
  const suggestedMax = maxY + paddingY;

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
        interaction: { mode: 'index', intersect: false, axis: 'x' },
        layout: {
          padding: { top: 8, right: 12, bottom: 0, left: 0 }
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: 'rgba(15, 23, 42, 0.95)',
            padding: 12,
            borderColor: 'rgba(100, 116, 180, 0.3)',
            borderWidth: 1,
            displayColors: true,
            filter: ctx => ctx.dataset?.label === 'Net' || ctx.dataset?.label === 'Goal',
            itemSort: (a, b) => {
              if (a.dataset?.label === b.dataset?.label) return 0;
              if (a.dataset?.label === 'Net') return -1;
              if (b.dataset?.label === 'Net') return 1;
              return 0;
            },
            callbacks: {
              label: ctx => `${ctx.dataset.label}: ${fmt.format(ctx.parsed.y)}`,
              afterLabel: ctx => {
                const goalTarget = ctx?.chart?.$goalTarget;
                if (ctx.dataset?.label !== 'Net' || !Number.isFinite(goalTarget)) return undefined;
                const delta = ctx.parsed.y - goalTarget;
                if (!Number.isFinite(delta)) return undefined;
                const sign = delta >= 0 ? '+' : '−';
                return `vs goal: ${sign}${fmt.format(Math.abs(delta))}`;
              }
            }
          }
        },
        scales: {
          y: {
            suggestedMin,
            suggestedMax,
            grid: {
              color: 'rgba(100, 116, 180, 0.1)',
              drawBorder: false
            },
            ticks: {
              color: '#94a3b8',
              padding: 6,
              callback: value => fmt.format(value)
            }
          },
          x: {
            grid: { display: false },
            ticks: {
              color: '#94a3b8',
              maxRotation: 0,
              autoSkipPadding: 16
            }
          }
        }
      }
    });
    chartTrend.$goalTarget = resolvedGoal;
  } else if (chartTrend && trendCanvas) {
    chartTrend.data.labels = labels;
    chartTrend.data.datasets = datasets;
    chartTrend.options.scales.y.suggestedMin = suggestedMin;
    chartTrend.options.scales.y.suggestedMax = suggestedMax;
    chartTrend.$goalTarget = resolvedGoal;
    chartTrend.update();
  }

  if (!trendCanvas && chartTrend) {
    chartTrend.destroy();
    chartTrend = null;
  }

  const breakdownCanvas = document.getElementById('chartBreakdown');
  const breakdownContainer = breakdownCanvas?.parentElement;
  breakdownContainer?.classList.add('chart-breakdown-container', 'chart-breakdown-ranked');

  const rankedCategoryTotals = Array.isArray(state.categoryBreakdown)
    ? state.categoryBreakdown
    : [];

  const viewForBreakdown = state.view || 'monthly';
  const breakdownLabels = rankedCategoryTotals.map(entry => entry.category);
  const monthlyExpenses = rankedCategoryTotals.map(entry => Math.max(entry?.expense ?? entry?.amount ?? 0, 0));
  const breakdownValues = monthlyExpenses.map(amount => fromMonthly(amount, viewForBreakdown));
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
    const maxLength = 22;
    return label.length > maxLength ? `${label.slice(0, maxLength - 1)}…` : label;
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
