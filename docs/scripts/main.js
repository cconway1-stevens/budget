import { load } from './storage.js';
import { renderTable, refreshDashboard, initEntryInteractions } from './render.js';
import { initRouter, route } from './router.js';
import { initShareWidget } from './share.js';

lucide.createIcons();

load();
renderTable();
refreshDashboard();
initEntryInteractions();
initRouter();
initShareWidget();

if (!location.hash) {
  location.hash = '#/dashboard';
}

route();
