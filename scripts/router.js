import { renderTable } from './render.js';

export function route() {
  const hash = location.hash.slice(1) || '/dashboard';
  const dashboard = document.getElementById('pageDashboard');
  const entry = document.getElementById('pageEntry');

  if (hash === '/entry') {
    if (dashboard) {
      dashboard.classList.add('hidden');
    }
    if (entry) {
      entry.classList.remove('hidden');
    }
    const navDashboard = document.getElementById('navDashboard');
    if (navDashboard) {
      navDashboard.classList.remove('active');
    }
    const navEntry = document.getElementById('navEntry');
    if (navEntry) {
      navEntry.classList.add('active');
    }
    renderTable();
  } else {
    if (dashboard) {
      dashboard.classList.remove('hidden');
    }
    if (entry) {
      entry.classList.add('hidden');
    }
    const navDashboard = document.getElementById('navDashboard');
    if (navDashboard) {
      navDashboard.classList.add('active');
    }
    const navEntry = document.getElementById('navEntry');
    if (navEntry) {
      navEntry.classList.remove('active');
    }
  }

  lucide.createIcons();
}

export function initRouter() {
  window.addEventListener('hashchange', route);
}
