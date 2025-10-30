import { state } from './state.js';

const STORAGE_KEY = 'financialAnalyticsPro';

export function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    console.error('Save failed:', e);
  }
}

export function load() {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    if (data) {
      Object.assign(state, JSON.parse(data));
      if (!Array.isArray(state.categories) || !state.categories.length) {
        state.categories = [...state.defaultCategories];
      }
      if (!Array.isArray(state.history)) {
        state.history = [];
      }
      if (typeof state.netGoal !== 'number' || Number.isNaN(state.netGoal)) {
        state.netGoal = 0;
      }
      if (typeof state.filterCategory !== 'string') {
        state.filterCategory = '';
      }
      if (!state.dashboardFilters || typeof state.dashboardFilters !== 'object') {
        state.dashboardFilters = { category: 'all', type: 'all' };
      } else {
        if (typeof state.dashboardFilters.category !== 'string' || !state.dashboardFilters.category) {
          state.dashboardFilters.category = 'all';
        }
        if (state.dashboardFilters.category.toLowerCase() === 'all') {
          state.dashboardFilters.category = 'all';
        }
        if (typeof state.dashboardFilters.type !== 'string' || !state.dashboardFilters.type) {
          state.dashboardFilters.type = 'all';
        }
        const normalizedType = state.dashboardFilters.type.toLowerCase();
        state.dashboardFilters.type = ['all', 'income', 'expense', 'investment'].includes(normalizedType)
          ? normalizedType
          : 'all';
      }
    }
  } catch (e) {
    console.error('Load failed:', e);
  }
}
