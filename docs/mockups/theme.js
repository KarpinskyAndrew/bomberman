/* Mockup design switch: v1 "retro" (default) and v2 "modern".
   Load it in <head>, before the stylesheets, so the right theme is set before the first paint.
   - The theme lives in data-theme on <html>. mockups.css is the retro theme; mockups-modern.css
     restyles everything under [data-theme="modern"]. arena.js watches the attribute and redraws.
   - Precedence: ?theme=modern|retro in the URL, then localStorage, then retro.
   - The choice is saved in localStorage. If storage is blocked, links between mockups carry ?theme= instead.
   - A small "Retro / Modern" control is added to every top-level page (not to the index thumbnails).
   Not part of the real UI. */
(function () {
  'use strict';

  var KEY = 'bm-mockup-theme';
  var THEMES = ['retro', 'modern'];
  var root = document.documentElement;
  var framed = window.self !== window.top;

  function valid(t) { return THEMES.indexOf(t) >= 0 ? t : null; }

  var canStore = false;
  try {
    localStorage.setItem(KEY + '-probe', '1');
    localStorage.removeItem(KEY + '-probe');
    canStore = true;
  } catch (e) { canStore = false; }

  function load() {
    if (!canStore) return null;
    try { return valid(localStorage.getItem(KEY)); } catch (e) { return null; }
  }
  function save(t) {
    if (!canStore) return;
    try { localStorage.setItem(KEY, t); } catch (e) { canStore = false; }
  }
  function urlTheme() {
    try { return valid(new URLSearchParams(location.search).get('theme')); } catch (e) { return null; }
  }

  var fromUrl = urlTheme();
  var current = fromUrl || load() || 'retro';
  // A framed page (index thumbnail) only follows; it never writes the shared choice.
  if (fromUrl && !framed) save(fromUrl);
  root.setAttribute('data-theme', current);

  function syncControls() {
    var els = document.querySelectorAll('[data-theme-set]');
    for (var i = 0; i < els.length; i++) {
      els[i].setAttribute('aria-pressed', String(els[i].getAttribute('data-theme-set') === current));
    }
  }

  // Keep a ?theme= that is already in the address bar in step, so a reload doesn't flip the theme back.
  // Without storage, always write it, so a reload keeps the choice.
  function syncUrl() {
    if (!window.history || !history.replaceState) return;
    try {
      var u = new URL(location.href);
      if (!u.searchParams.has('theme') && canStore) return;
      u.searchParams.set('theme', current);
      history.replaceState(history.state, '', u.href);
    } catch (e) { /* file:// in some browsers */ }
  }

  function set(t, opts) {
    t = valid(t);
    if (!t) return;
    var changed = t !== current;
    current = t;
    root.setAttribute('data-theme', t);
    if (!framed && (!opts || opts.persist !== false)) save(t);
    syncControls();
    if (!framed) syncUrl();
    if (changed) {
      var ev;
      try { ev = new CustomEvent('mockthemechange', { detail: { theme: t } }); }
      catch (e) { ev = document.createEvent('CustomEvent'); ev.initCustomEvent('mockthemechange', false, false, { theme: t }); }
      window.dispatchEvent(ev);
    }
  }

  // Another tab or the index page switched the theme.
  window.addEventListener('storage', function (e) {
    if (e.key === KEY && valid(e.newValue)) set(e.newValue, { persist: false });
  });

  // Any [data-theme-set] element is a switch (the corner control, the cards on the index page).
  document.addEventListener('click', function (e) {
    var btn = e.target.closest && e.target.closest('[data-theme-set]');
    if (btn) { e.preventDefault(); set(btn.getAttribute('data-theme-set')); return; }
    // No storage: carry the theme over to the next mockup in the URL instead.
    if (canStore) return;
    var a = e.target.closest && e.target.closest('a[href]');
    if (!a || a.target === '_blank') return;
    try {
      var u = new URL(a.href, location.href);
      if (u.origin !== location.origin || !/\.html$/.test(u.pathname)) return;
      u.searchParams.set('theme', current);
      a.href = u.href;
    } catch (err) { /* leave the link alone */ }
  });

  // Fixed corner container shared by the theme control and the mockup navigator (mock.js).
  function dock() {
    var d = document.querySelector('.mock-dock');
    if (!d && document.body) {
      d = document.createElement('div');
      d.className = 'mock-dock';
      document.body.appendChild(d);
    }
    return d;
  }

  function mountControl() {
    syncControls();
    if (framed || document.querySelector('.theme-switch')) return;
    var d = dock();
    if (!d) return;
    var g = document.createElement('div');
    g.className = 'theme-switch';
    g.setAttribute('role', 'group');
    g.setAttribute('aria-label', 'Mockup design');
    g.innerHTML =
      '<span class="theme-switch-lbl" aria-hidden="true">Design</span>' +
      '<button type="button" data-theme-set="retro" title="v1: retro (pixel art)">Retro<small>v1</small></button>' +
      '<button type="button" data-theme-set="modern" title="v2: modern (as on bomberman.space)">Modern<small>v2</small></button>';
    d.insertBefore(g, d.firstChild);
    syncControls();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mountControl);
  else mountControl();

  window.MockTheme = {
    get: function () { return current; },
    set: set,
    dock: dock,
    canStore: function () { return canStore; },
    themes: THEMES.slice()
  };
})();
