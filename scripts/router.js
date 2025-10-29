import { renderTable } from './render.js';

export function route() {
  const hash = location.hash.slice(1) || '/dashboard';
  const dashboard = document.getElementById('pageDashboard');
  const entry = document.getElementById('pageEntry');

  if (hash === '/entry') {
    dashboard?.classList.add('hidden');
    entry?.classList.remove('hidden');
    document.getElementById('navDashboard')?.classList.remove('active');
    document.getElementById('navEntry')?.classList.add('active');
    renderTable();
  } else {
    dashboard?.classList.remove('hidden');
    entry?.classList.add('hidden');
    document.getElementById('navDashboard')?.classList.add('active');
    document.getElementById('navEntry')?.classList.remove('active');
  }

  lucide.createIcons();
}

export function initRouter() {
  window.addEventListener('hashchange', route);
}
