import { load } from './storage.js';
import { renderTable, refreshDashboard, initEntryInteractions } from './render.js';
import { initRouter, route } from './router.js';

lucide.createIcons();

load();
renderTable();
refreshDashboard();
initEntryInteractions();
initRouter();

if (!location.hash) {
  location.hash = '#/dashboard';
}

route();
