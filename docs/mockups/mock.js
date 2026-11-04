/* Mockup helpers: inline icon sprite (works on file://) + floating screen/state navigator.
   The navigator is not part of the real UI. */
(function () {
  'use strict';

  const F = 'fill="currentColor" stroke="none"';
  const ICONS = {
    bomb: `<circle cx="10.5" cy="14" r="7" ${F}/><path d="M15.2 9.3l2.6-2.6"/><path d="M19.5 2.5v1.6M22 5h-1.6M21.2 2.8l-1.1 1.1"/>`,
    fire: `<path ${F} d="M12 22c4 0 7-2.7 7-6.8 0-3.4-2.2-5.6-3.7-7.2-.3 1.8-1.2 3-2.5 3.6.4-3.3-1-6.4-3.8-8.6.3 3-1.4 5-3 6.8C4.6 11.3 5 13 5 15.2 5 19.3 8 22 12 22z"/>`,
    heart: `<path ${F} d="M12 20.5s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7.6a4.3 4.3 0 0 1 7.5 2.7c0 5.6-7.5 10.2-7.5 10.2z"/>`,
    trophy: `<path d="M8 4h8v5a4 4 0 0 1-8 0V4z"/><path d="M8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v4M8 20h8M10 17h4v3h-4z"/>`,
    gear: `<circle cx="12" cy="12" r="3"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1"/><circle cx="12" cy="12" r="6.5"/>`,
    lock: `<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>`,
    hash: `<path d="M5 9h14M5 15h14M10 4l-2 16M16 4l-2 16"/>`,
    bolt: `<path ${F} d="M13 2L4 14h7l-1 8 9-12h-7l1-8z"/>`,
    plus: `<path d="M12 5v14M5 12h14"/>`,
    copy: `<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h8"/>`,
    link: `<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>`,
    eye: `<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>`,
    skull: `<path d="M12 3a8 8 0 0 0-8 8c0 2.6 1.2 4.4 3 5.5V20h10v-3.5c1.8-1.1 3-2.9 3-5.5a8 8 0 0 0-8-8z"/><circle cx="9" cy="11.5" r="1.6" ${F}/><circle cx="15" cy="11.5" r="1.6" ${F}/><path d="M10 20v-2M14 20v-2"/>`,
    crown: `<path ${F} d="M3 8l4.5 4L12 5l4.5 7L21 8l-2 11H5L3 8z"/>`,
    clock: `<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>`,
    alien: `<path d="M12 3c-4.4 0-8 3.2-8 7.5 0 4.6 4.6 10.5 8 10.5s8-5.9 8-10.5C20 6.2 16.4 3 12 3z"/><path ${F} d="M7.5 11c1.6 0 3 1 3.2 2.5-1.7.3-3.3-.6-3.2-2.5zM16.5 11c-1.6 0-3 1-3.2 2.5 1.7.3 3.3-.6 3.2-2.5z"/>`,
    'arrow-left': `<path d="M19 12H5M11 6l-6 6 6 6"/>`,
    search: `<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>`,
    users: `<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14.5a6.5 6.5 0 0 1 3.5 5.5"/>`,
    check: `<path d="M5 12.5l4.5 4.5L19 7"/>`,
    x: `<path d="M6 6l12 12M18 6L6 18"/>`,
    'chevron-down': `<path d="M6 9l6 6 6-6"/>`,
    flag: `<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>`,
    logout: `<path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 17l-5-5 5-5M5 12h11"/>`,
    refresh: `<path d="M20 11a8 8 0 0 0-14.9-3M4 4v4h4M4 13a8 8 0 0 0 14.9 3M20 20v-4h-4"/>`,
    play: `<path ${F} d="M7 4.5v15l12-7.5z"/>`,
    grid: `<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>`,
    globe: `<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>`,
    keyboard: `<rect x="2" y="6" width="20" height="12" rx="2"/><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10"/>`,
    volume: `<path d="M4 9v6h4l5 4V5L8 9H4z"/><path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12"/>`,
    monitor: `<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/>`,
    wifi: `<path d="M2 8.5a15 15 0 0 1 20 0M5 12a10 10 0 0 1 14 0M8.5 15.5a5 5 0 0 1 7 0"/><circle cx="12" cy="19" r="1" ${F}/>`,
    star: `<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/>`,
    pause: `<path d="M8 5v14M16 5v14"/>`,
    menu: `<path d="M4 7h16M4 12h16M4 17h16"/>`,
    info: `<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.01"/>`,
    warn: `<path d="M12 3l10 18H2L12 3z"/><path d="M12 10v5M12 18v.01"/>`
  };
  const sprite = '<svg xmlns="http://www.w3.org/2000/svg" style="display:none" aria-hidden="true">' +
    Object.entries(ICONS).map(([k, v]) => `<symbol id="i-${k}" viewBox="0 0 24 24">${v}</symbol>`).join('') + '</svg>';
  document.body.insertAdjacentHTML('afterbegin', sprite);

  const PAGES = [
    ['index.html', 'All screens', ''],
    ['landing.html', 'Landing', '/'],
    ['lobby.html', 'Lobby', '/lobby'],
    ['waiting-room.html', 'Waiting room', '/arena/:id'],
    ['game.html', 'In-game', '/arena/:id'],
    ['results.html', 'Match results', '/arena/:id'],
    ['profile.html', 'Profile', '/profile/:name'],
    ['leaderboard.html', 'Leaderboard', '/leaderboard'],
    ['not-found.html', 'Not found', '*']
  ];
  window.MOCK_PAGES = PAGES;

  const here = decodeURIComponent(location.pathname.split('/').pop() || 'index.html');
  if (here === 'index.html' || window.self !== window.top) return;

  const states = (document.body.dataset.states || '').split(';').filter(Boolean).map(s => s.split('|'));
  const esc = s => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  let html = '<details class="mock-nav"><summary><svg class="i"><use href="#i-grid"/></svg> Mockups</summary><div class="mock-menu"><p>Screens</p>';
  for (const [file, label, route] of PAGES) {
    html += `<a href="${file}"${file === here ? ' aria-current="true"' : ''}>${esc(label)}<small>${esc(route)}</small></a>`;
  }
  if (states.length) {
    html += '<p>States on this screen</p><a href="#" data-state="">Default</a>';
    for (const [id, label] of states) html += `<a href="#${id}" data-state="${id}">${esc(label)}</a>`;
  }
  html += '</div></details>';
  document.body.insertAdjacentHTML('beforeend', html);

  const mark = () => {
    const h = location.hash.slice(1);
    document.querySelectorAll('.mock-menu a[data-state]').forEach(a => {
      a.toggleAttribute('aria-current', a.dataset.state === h);
      if (a.dataset.state === h) a.setAttribute('aria-current', 'true');
    });
  };
  window.addEventListener('hashchange', mark);
  mark();
})();
