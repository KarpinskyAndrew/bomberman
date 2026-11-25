/* BomberMan Online mockups: a playable touch-controls demo (GUI-PLAN §7.1).
   Wires the phone layout (#touch in game.html, or a standalone page with the same markup)
   to a tiny tile-by-tile simulation: floating joystick (4 directions, dead zone, hysteresis),
   bomb button, breakable walls, chain reactions, one wandering alien and a static opponent.
   It is a feel test for the controls, NOT the game: no netcode, no prediction, simplified rules. */
(function () {
  'use strict';
  const root = document.getElementById('touch');
  const canvas = document.getElementById('touch-arena');
  if (!root || !canvas || !window.Arena) return;

  const C = Arena.COLORS;
  const SIZE = 15;             // ranked 1v1 arena: Small 15x15 (SPEC §4.1)
  const STEP = 0.22;          // seconds per tile, player
  const ALIEN_STEP = 0.5;     // seconds per tile, drifter
  const FUSE = 3, FIRE_TIME = 0.5, INVULN = 1.5;
  const KNOB_MAX = 38;        // px the knob may travel from the base centre
  const DEAD = 0.25;          // dead zone, fraction of KNOB_MAX
  const HYST = 10;            // extra degrees needed to switch direction
  const DIRS = { u: [0, -1], d: [0, 1], l: [-1, 0], r: [1, 0] };
  const OPP = { u: 'd', d: 'u', l: 'r', r: 'l' };

  const START = { x: 5, y: 7 }, KATE = { x: 9, y: 9 }, ALIEN_START = { x: 11, y: 3 };
  const scene = {
    seed: 23, density: 0.62, names: true, size: SIZE,
    players: [{ x: START.x, y: START.y, color: C.p1, name: 'Andrew', dir: 'r' },
              { x: KATE.x, y: KATE.y, color: C.p3, name: 'Kate', dir: 'l' }],
    aliens: [{ type: 'drifter', x: ALIEN_START.x, y: ALIEN_START.y }],
    bombs: [],
    items: [{ x: 7, y: 7, kind: 'fire' }, { x: 5, y: 11, kind: 'bomb' }],
    clear: [[3, 7], [4, 7], [6, 7], [5, 6], [5, 8], [5, 9], [8, 9], [10, 9], [9, 8], [9, 10],
            [10, 3], [12, 3], [11, 4], [11, 5]]
  };
  const view = Arena.mount(canvas, scene);
  const map = scene._map;
  scene._fire = [];

  /* ---------- state ---------- */
  const mover = (x, y) => ({ tx: x, ty: y, m: null, prog: 0 });
  const me = Object.assign(mover(START.x, START.y), { hp: 3, inv: 0, dead: 0, cap: 2, range: 2, sprite: scene.players[0] });
  const kate = Object.assign(mover(KATE.x, KATE.y), { hp: 2, inv: 0, dead: 0, sprite: scene.players[1] });
  const alien = Object.assign(mover(ALIEN_START.x, ALIEN_START.y), { dead: 0, sprite: scene.aliens[0] });
  let fires = [];             // { x, y, dir, burning, t }
  let held = null;            // joystick or keyboard direction
  const keys = [];            // held-direction stack for the keyboard
  let clock = 102;            // 1:42

  /* ---------- DOM ---------- */
  const $ = s => root.querySelector(s);
  const controls = $('.t-controls'), joy = $('.joy'), knob = $('.joy .knob');
  const bombBtn = $('.bomb-btn'), bombLabel = bombBtn.querySelector('b');
  const clockEl = $('.t-bar .clock'), msgEl = $('.t-msg');
  const heartsMe = $('.t-p.me .hearts'), heartsKate = $('.t-p:not(.me) .hearts');
  let msgTimer = 0;
  function say(text, secs) {
    if (!msgEl) return;
    msgEl.textContent = text;
    msgTimer = secs || 2.5;
  }
  function hearts(el, n) {
    if (el) el.innerHTML = n > 0 ? '<span>♥</span>'.repeat(n) : '<span style="opacity:.5">☠</span>';
  }
  function buzz(ms) { try { navigator.vibrate && navigator.vibrate(ms); } catch (e) { /* not allowed here */ } }

  /* ---------- rules (simplified) ---------- */
  const inside = (x, y) => x >= 0 && y >= 0 && x < SIZE && y < SIZE;
  const bombAt = (x, y) => scene.bombs.some(b => b.x === x && b.y === y);
  const canEnter = (x, y) => inside(x, y) && map[y][x] === 0 && !bombAt(x, y);
  const tileOf = o => o.m && o.prog >= 0.5 ? { x: o.tx + DIRS[o.m][0], y: o.ty + DIRS[o.m][1] } : { x: o.tx, y: o.ty };
  const posOf = o => o.m ? { x: o.tx + DIRS[o.m][0] * o.prog, y: o.ty + DIRS[o.m][1] * o.prog } : { x: o.tx, y: o.ty };

  function stepMover(o, want, secsPerTile, dt) {
    if (o.m && want === OPP[o.m]) {            // reverse mid-step: feels instant
      o.tx += DIRS[o.m][0]; o.ty += DIRS[o.m][1]; o.prog = 1 - o.prog; o.m = want;
    }
    if (o.m) {
      o.prog += dt / secsPerTile;
      if (o.prog >= 1) { o.tx += DIRS[o.m][0]; o.ty += DIRS[o.m][1]; o.prog = 0; o.m = null; }
    }
    if (!o.m && want) {
      const [dx, dy] = DIRS[want];
      if (canEnter(o.tx + dx, o.ty + dy)) { o.m = want; o.prog = 0; }
    }
  }

  function placeBomb() {
    if (me.dead) return;
    const t = tileOf(me);
    const mine = scene.bombs.filter(b => b.own).length;
    if (mine >= me.cap) { say('No bombs left: wait for one to go off', 1.6); return; }
    if (bombAt(t.x, t.y)) return;
    scene.bombs.push({ x: t.x, y: t.y, fuse: FUSE, own: true, range: me.range });
    buzz(12);
    bombBtn.classList.add('pressed');
    setTimeout(() => bombBtn.classList.remove('pressed'), 120);
  }

  function explode(b) {
    scene.bombs.splice(scene.bombs.indexOf(b), 1);
    const out = [{ x: b.x, y: b.y, dir: 'c' }];
    for (const [dx, dy, dir] of [[1, 0, 'h'], [-1, 0, 'h'], [0, 1, 'v'], [0, -1, 'v']]) {
      for (let i = 1; i <= b.range; i++) {
        const x = b.x + dx * i, y = b.y + dy * i;
        if (!inside(x, y) || map[y][x] === 2) break;
        if (map[y][x] === 1) { out.push({ x, y, dir, burning: true }); map[y][x] = 0; break; }
        out.push({ x, y, dir });
      }
    }
    out.forEach(f => {
      f.t = FIRE_TIME;
      const other = scene.bombs.find(o => o.x === f.x && o.y === f.y);
      if (other) other.fuse = Math.min(other.fuse, 0.06);       // chain reaction
      const it = scene.items.findIndex(i => i.x === f.x && i.y === f.y);
      if (it >= 0) scene.items.splice(it, 1);                     // fire burns items
    });
    fires = fires.concat(out);
  }

  function inFire(o) { const t = tileOf(o); return fires.some(f => f.x === t.x && f.y === t.y); }

  function hurt(p, who) {
    if (p.dead || p.inv > 0) return;
    p.hp -= 1;
    if (p.hp <= 0) { kill(p, who === 'me' ? 'Blown up by your own bomb' : 'Kate is out'); return; }
    p.inv = INVULN;
    if (who === 'me') { buzz(40); say('Hit! ' + p.hp + ' ♥ left', 1.6); }
  }

  function kill(p, why) {
    p.hp = 0; p.dead = 3; p.m = null;
    if (p === me) { buzz([60, 40, 60]); say(why + '. Back in 3 s', 3); } else say(why + '. She is back in 3 s', 2.5);
  }

  function respawn(p, at, hp) {
    Object.assign(p, { tx: at.x, ty: at.y, m: null, prog: 0, hp, inv: INVULN, dead: 0 });
  }

  /* ---------- joystick (floating) ---------- */
  let joyId = null, base = null;
  function setDir(d) {
    held = d;
    joy.dataset.dir = d || '';
  }
  function joyMove(e) {
    const dx = e.clientX - base.x, dy = e.clientY - base.y;
    const len = Math.hypot(dx, dy), k = len > KNOB_MAX ? KNOB_MAX / len : 1;
    knob.style.transform = `translate(${dx * k}px, ${dy * k}px)`;
    if (len < KNOB_MAX * DEAD) { setDir(null); return; }
    const ang = Math.atan2(dy, dx) * 180 / Math.PI;           // 0 = right, 90 = down
    const axis = { r: 0, d: 90, l: 180, u: -90 };
    const off = d => Math.abs(((ang - axis[d] + 540) % 360) - 180);
    if (held && off(held) <= 45 + HYST) return;              // hysteresis: keep the current direction
    setDir(['r', 'd', 'l', 'u'].reduce((a, b) => (off(a) <= off(b) ? a : b)));
  }
  function joyStart(e) {
    const r = controls.getBoundingClientRect();
    const half = joy.offsetWidth / 2;
    const cx = Math.max(r.left + half + 4, Math.min(e.clientX, r.left + r.width / 2 - half));
    const cy = Math.max(r.top + half + 4, Math.min(e.clientY, r.bottom - half - 4));
    base = { x: cx, y: cy };
    joy.style.left = (cx - r.left - half) + 'px';
    joy.style.top = (cy - r.top - half) + 'px';
    joy.style.marginTop = '0';
    joy.classList.add('active');
    joyId = e.pointerId;
    joyMove(e);
  }
  function joyEnd() {
    joyId = null; base = null;
    joy.classList.remove('active');
    joy.style.left = joy.style.top = joy.style.marginTop = '';
    knob.style.transform = '';
    setDir(keys[keys.length - 1] || null);
  }

  controls.addEventListener('pointerdown', e => {
    const r = controls.getBoundingClientRect();
    if (e.target.closest('.bomb-btn')) { e.preventDefault(); placeBomb(); return; }
    if (joyId === null && e.clientX < r.left + r.width / 2) {
      e.preventDefault();
      try { controls.setPointerCapture(e.pointerId); } catch (err) { /* synthetic event */ }
      joyStart(e);
    }
  });
  controls.addEventListener('pointermove', e => { if (e.pointerId === joyId) joyMove(e); });
  ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(t =>
    controls.addEventListener(t, e => { if (e.pointerId === joyId) joyEnd(); }));
  bombBtn.addEventListener('click', e => e.preventDefault());
  controls.addEventListener('contextmenu', e => e.preventDefault());

  /* ---------- keyboard (so the demo also works on a laptop) ---------- */
  const KEYMAP = { ArrowUp: 'u', KeyW: 'u', ArrowDown: 'd', KeyS: 'd', ArrowLeft: 'l', KeyA: 'l', ArrowRight: 'r', KeyD: 'r' };
  window.addEventListener('keydown', e => {
    if (!visible()) return;
    if (e.code === 'Space') { e.preventDefault(); if (!e.repeat) placeBomb(); return; }
    const d = KEYMAP[e.code];
    if (!d) return;
    e.preventDefault();
    if (!keys.includes(d)) keys.push(d);
    if (joyId === null) setDir(d);
  });
  window.addEventListener('keyup', e => {
    const d = KEYMAP[e.code];
    if (!d) return;
    keys.splice(keys.indexOf(d), 1);
    if (joyId === null) setDir(keys[keys.length - 1] || null);
  });
  window.addEventListener('blur', () => { keys.length = 0; if (joyId === null) setDir(null); });

  /* ---------- loop ---------- */
  const visible = () => root.getClientRects().length > 0;
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let last = performance.now();

  function alienWant(o) {
    if (o.m) return o.m;
    const opts = Object.keys(DIRS).filter(d => canEnter(o.tx + DIRS[d][0], o.ty + DIRS[d][1]));
    if (!opts.length) return null;
    if (o.last && opts.includes(o.last) && Math.random() < 0.7) return o.last;
    const fwd = opts.filter(d => d !== OPP[o.last]);
    const pick = (fwd.length ? fwd : opts)[Math.floor(Math.random() * (fwd.length || opts.length))];
    o.last = pick;
    return pick;
  }

  function tick(dt) {
    // timers
    clock = clock > 0 ? clock - dt : 180;
    if (msgTimer > 0 && (msgTimer -= dt) <= 0 && msgEl) msgEl.textContent = msgEl.dataset.idle || '';
    [me, kate].forEach(p => { if (p.inv > 0) p.inv -= dt; });

    // movement
    if (!me.dead) stepMover(me, held, STEP, dt);
    if (!alien.dead) { const w = alienWant(alien); stepMover(alien, w, ALIEN_STEP, dt); if (!alien.m) alien.last = w; }

    // bombs and fire
    scene.bombs.slice().forEach(b => { b.fuse -= dt; b.fast = b.fuse < 0.5; if (b.fuse <= 0) explode(b); });
    fires.forEach(f => { f.t -= dt; });
    fires = fires.filter(f => f.t > 0);
    scene._fire = fires;

    // damage, alien contact, pickups
    if (!me.dead && inFire(me)) hurt(me, 'me');
    if (!kate.dead && inFire(kate)) hurt(kate, 'kate');
    if (!alien.dead && inFire(alien)) { alien.dead = 4; say('Drifter destroyed', 1.6); }
    if (!me.dead && !alien.dead) {
      const a = posOf(alien), p = posOf(me);
      if (Math.abs(a.x - p.x) + Math.abs(a.y - p.y) < 0.7) kill(me, 'Eaten by the Drifter');
    }
    if (!me.dead) {
      const t = tileOf(me);
      const i = scene.items.findIndex(it => it.x === t.x && it.y === t.y);
      if (i >= 0) {
        const it = scene.items.splice(i, 1)[0];
        if (it.kind === 'fire') { me.range = Math.min(me.range + 1, 6); say('+1 fire: range ' + me.range, 1.6); }
        if (it.kind === 'bomb') { me.cap = Math.min(me.cap + 1, 8); say('+1 bomb: ' + me.cap + ' at once', 1.6); }
        buzz(15);
      }
    }

    // deaths and respawns
    if (me.dead && (me.dead -= dt) <= 0) respawn(me, START, 3);
    if (kate.dead && (kate.dead -= dt) <= 0) respawn(kate, KATE, 2);
    if (alien.dead && (alien.dead -= dt) <= 0) { alien.dead = 0; Object.assign(alien, mover(ALIEN_START.x, ALIEN_START.y)); }
  }

  function sync() {
    const p = posOf(me);
    Object.assign(me.sprite, { x: p.x, y: p.y, dead: me.dead > 0, blink: me.inv > 0 });
    if (held === 'l' || held === 'r') me.sprite.dir = held;
    Object.assign(kate.sprite, { x: kate.tx, y: kate.ty, dead: kate.dead > 0, blink: kate.inv > 0 });
    if (alien.dead) scene.aliens.length = 0;
    else { const a = posOf(alien); alien.sprite.x = a.x; alien.sprite.y = a.y; scene.aliens[0] = alien.sprite; }

    const inUse = scene.bombs.filter(b => b.own).length;
    bombLabel.textContent = inUse + '/' + me.cap;
    bombBtn.classList.toggle('empty', inUse >= me.cap || me.dead > 0);
    bombBtn.setAttribute('aria-label', `Drop bomb, ${inUse} of ${me.cap} in use`);
    hearts(heartsMe, me.dead ? 0 : me.hp);
    hearts(heartsKate, kate.dead ? 0 : kate.hp);
    const s = Math.max(0, Math.ceil(clock));
    clockEl.lastChild.textContent = Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
  }

  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (visible()) {
      tick(dt);
      sync();
      if (reduce) view.draw();
    }
    requestAnimationFrame(frame);
  }
  sync();
  requestAnimationFrame(frame);
})();
