import { state, normalizeRows } from './state.js';

const STORAGE_KEY = 'financialAnalyticsPro';

// Validate imported data structure
function validateStateData(data) {
  if (!data || typeof data !== 'object') {
    return { valid: false, error: 'Invalid data format' };
  }

  // Check required fields
  if (!Array.isArray(data.rows)) {
    return { valid: false, error: 'Missing or invalid rows array' };
  }

  // Validate each row has basic structure
  for (const row of data.rows) {
    if (!row || typeof row !== 'object') {
      return { valid: false, error: 'Invalid row format' };
    }
    // Check for basic required fields
    if (!row.type || !['income', 'expense', 'investment', 'allocation'].includes(row.type)) {
      return { valid: false, error: `Invalid row type: ${row.type}` };
    }
  }

  // Validate categories if present
  if (data.categories !== undefined && !Array.isArray(data.categories)) {
    return { valid: false, error: 'Invalid categories format' };
  }

  // Validate accounts if present
  if (data.accounts !== undefined && !Array.isArray(data.accounts)) {
    return { valid: false, error: 'Invalid accounts format' };
  }

  return { valid: true };
}

export function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    return { success: true };
  } catch (e) {
    console.error('Save failed:', e);

    // User-facing error notification
    if (e.name === 'QuotaExceededError') {
      alert('⚠️ Storage Full!\n\nYour browser storage is full. Please:\n1. Export your data (Download button)\n2. Clear old data\n3. Consider reducing history size');
    } else {
      alert('⚠️ Save Failed!\n\nUnable to save your data. Please:\n1. Export your data immediately as backup\n2. Check browser storage settings\n3. Try refreshing the page');
    }

    return { success: false, error: e };
  }
}

export function load() {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    if (data) {
      const parsed = JSON.parse(data);

      // Validate before loading
      const validation = validateStateData(parsed);
      if (!validation.valid) {
        console.error('Invalid data in storage:', validation.error);
        alert(`⚠️ Data Validation Failed!\n\n${validation.error}\n\nUsing default state instead.`);
        return;
      }

      Object.assign(state, parsed);
      state.rows = normalizeRows(state.rows);
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
        state.dashboardFilters.type = ['all', 'income', 'expense', 'investment', 'allocation'].includes(normalizedType)
          ? normalizedType
          : 'all';
      }
      // NEW: Initialize accounts array if missing
      if (!Array.isArray(state.accounts)) {
        state.accounts = [];
      }
    }
  } catch (e) {
    console.error('Load failed:', e);
    alert('⚠️ Failed to Load Data!\n\nYour saved data may be corrupted. Starting with empty state.');
  }
}

// Import data from external file
export function importData(data) {
  try {
    const parsed = typeof data === 'string' ? JSON.parse(data) : data;

    // Validate imported data
    const validation = validateStateData(parsed);
    if (!validation.valid) {
      alert(`⚠️ Import Failed!\n\n${validation.error}\n\nPlease check your import file.`);
      return { success: false, error: validation.error };
    }

    // Ask for confirmation before overwriting
    const confirmed = confirm(
      '⚠️ Import Data?\n\n' +
      'This will replace all current data.\n' +
      'Make sure you have exported your current data first!\n\n' +
      'Click OK to continue, or Cancel to abort.'
    );

    if (!confirmed) {
      return { success: false, error: 'User cancelled import' };
    }

    // Import the data
    Object.assign(state, parsed);
    state.rows = normalizeRows(state.rows);

    // Normalize other fields
    if (!Array.isArray(state.categories) || !state.categories.length) {
      state.categories = [...state.defaultCategories];
    }
    if (!Array.isArray(state.history)) {
      state.history = [];
    }
    if (!Array.isArray(state.accounts)) {
      state.accounts = [];
    }

    // Save the imported data
    const saveResult = save();
    if (!saveResult.success) {
      return saveResult;
    }

    return { success: true };
  } catch (e) {
    console.error('Import failed:', e);
    alert('⚠️ Import Failed!\n\nInvalid JSON format. Please check your file.');
    return { success: false, error: e.message };
  }
}
