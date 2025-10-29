import { state } from './state.js';
import { fmt, fmtPct, fromMonthly } from './formatting.js';

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
