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
    }
  } catch (e) {
    console.error('Load failed:', e);
  }
}
