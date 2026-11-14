/* BomberMan Online mockups: a tiny Canvas 2D arena painter.
   It only draws a still/looping scene for the mockups. It is NOT the game renderer
   and has no game rules beyond what is needed to place things believably.

   Arena.mount(canvas, scene) -> { update(scene), draw() }
   scene._map (0 empty, 1 soft, 2 hard) and scene._fire may be mutated in place by a live demo.
   scene = {
     seed, density,            // map generation (21x21, hard border + pillars on even tiles)
     cover,                    // true: fill the whole host (background); false: fit inside it
     zoom,                     // optional tile-size multiplier (shows only the middle of the arena)
     players: [{ x, y, color, name, dir, blink, dead }],
     aliens:  [{ type: 'drifter'|'seeker'|'brute', x, y, hp, blink,
                 locked, target: [x, y] }],   // optional: red Seeker eye looking at a tile; unused while alien behavior is undecided
     bombs:   [{ x, y, fast }],
     fires:   [{ x, y, range }],
     items:   [{ x, y, kind: 'health'|'fire'|'bomb' }],
     danger:  [[x, y]],        // red-tinted tiles (danger preview)
     falling: [[x, y]],        // sudden-death falling-block shadows
     spawnPulse: true,         // pulsing rings on the four spawn tiles (countdown)
     names: true,              // name tags above players
     still: true               // draw once, no animation loop
   }
*/
(function () {
  'use strict';

  const N = 21;               // default size; a scene may set size: 15 | 17 | 21 (SPEC §4.1)
  const COLORS = { p1: '#4da3ff', p2: '#ff9a3c', p3: '#47d16c', p4: '#e46bd6' };
  const PAL = {
    floorA: '#171e30', floorB: '#1a2236',
    hard: '#39446a', hardHi: '#5a6a96', hardSide: '#46537d', hardLo: '#232a42',
    soft: '#8a5a3a', softHi: '#b07a50', softLo: '#5a3824', mortar: '#432a1b',
    outline: '#0a0d17'
  };
  const HEART = new Path2D('M12 20.5s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7.6a4.3 4.3 0 0 1 7.5 2.7c0 5.6-7.5 10.2-7.5 10.2z');
  const FLAME = new Path2D('M12 22c4 0 7-2.7 7-6.8 0-3.4-2.2-5.6-3.7-7.2-.3 1.8-1.2 3-2.5 3.6.4-3.3-1-6.4-3.8-8.6.3 3-1.4 5-3 6.8C4.6 11.3 5 13 5 15.2 5 19.3 8 22 12 22z');

  /* v2 "modern" theme (data-theme="modern" on <html>, set by theme.js): clean vector shapes and glows.
     Scenes keep passing COLORS.pN; the modern painter maps them to its own palette by index.
     Player colors are Okabe-Ito (colorblind-safe), brightened for the dark arena, and every player
     also wears a different crest shape (circle, triangle, square, diamond), so color is never the only cue. */
  const MOD_P = ['#2f9be6', '#f5b034', '#19c29a', '#e79bcb'];
  const MOD = {
    floor: '#0a0f1c', grid: 'rgba(130,160,255,0.07)', node: 'rgba(150,180,255,0.18)',
    hardTop: '#26314f', hardBot: '#151c31', rimTop: '#1b2339', rimBot: '#0f1526',
    hardEdge: 'rgba(150,175,255,0.22)', hardHi: 'rgba(255,255,255,0.10)', hardChip: 'rgba(120,160,255,0.12)',
    softBase: '#261a15', softEdge: 'rgba(255,165,90,0.55)', softLine: 'rgba(255,190,120,0.25)',
    visor: '#0a0f1c', eye: '#e6f7ff',
    drifter: '#4ade80', drifterDk: '#15803d', seeker: '#a78bfa', seekerDk: '#5b21b6', brute: '#fb4f6b', bruteDk: '#9f1239',
    lock: '#ff3b5c'
  };
  const pIndex = c => [COLORS.p1, COLORS.p2, COLORS.p3, COLORS.p4].indexOf(c);
  const pColor = c => { const i = pIndex(c); return i >= 0 ? MOD_P[i] : c; };

  // The theme is read from the DOM; every mounted canvas and portrait redraws when it changes.
  const isModern = () => document.documentElement.getAttribute('data-theme') === 'modern';
  let modern = isModern();
  const redrawers = new Set();
  new MutationObserver(() => {
    const m = isModern();
    if (m === modern) return;
    modern = m;
    redrawers.forEach(fn => fn());
  }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

  function rng(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function isHard(x, y, n) {
    return x === 0 || y === 0 || x === n - 1 || y === n - 1 || (x % 2 === 0 && y % 2 === 0);
  }

  function genMap(seed, density, n) {
    const r = rng(seed);
    const safe = new Set();
    for (const [sx, sy] of [[1, 1], [n - 2, 1], [1, n - 2], [n - 2, n - 2]]) {
      const dx = sx === 1 ? 1 : -1;
      const dy = sy === 1 ? 1 : -1;
      safe.add(sx + ',' + sy);
      safe.add(sx + dx + ',' + sy);
      safe.add(sx + ',' + (sy + dy));
    }
    const map = [];
    for (let y = 0; y < n; y++) {
      const row = [];
      for (let x = 0; x < n; x++) {
        if (isHard(x, y, n)) row.push(2);
        else if (safe.has(x + ',' + y)) row.push(0);
        else row.push(r() < density ? 1 : 0);
      }
      map.push(row);
    }
    return map;
  }

  function computeFire(map, b) {
    const out = [{ x: b.x, y: b.y, dir: 'c' }];
    const dirs = [[1, 0, 'h'], [-1, 0, 'h'], [0, 1, 'v'], [0, -1, 'v']];
    for (const [dx, dy, dir] of dirs) {
      for (let i = 1; i <= b.range; i++) {
        const x = b.x + dx * i;
        const y = b.y + dy * i;
        if (x < 0 || y < 0 || x >= map.length || y >= map.length || map[y][x] === 2) break;
        if (map[y][x] === 1) { out.push({ x, y, dir, burning: true }); break; }
        out.push({ x, y, dir });
      }
    }
    return out;
  }

  function prepare(scene) {
    scene._n = scene.size || N;
    const map = genMap(scene.seed || 7, scene.density == null ? 0.65 : scene.density, scene._n);
    const clear = (x, y) => { if (map[y] && map[y][x] === 1) map[y][x] = 0; };
    (scene.players || []).forEach(p => clear(p.x, p.y));
    (scene.aliens || []).forEach(a => clear(a.x, a.y));
    (scene.bombs || []).forEach(b => clear(b.x, b.y));
    (scene.items || []).forEach(i => clear(i.x, i.y));
    (scene.fires || []).forEach(f => clear(f.x, f.y));
    (scene.clear || []).forEach(([x, y]) => clear(x, y));
    scene._map = map;
    scene._fire = [];
    (scene.fires || []).forEach(f => { scene._fire = scene._fire.concat(computeFire(map, f)); });
  }

  /* ---------- primitives ---------- */
  function px(ctx, x, y, w, h, c) {
    ctx.fillStyle = c;
    ctx.fillRect(Math.round(x), Math.round(y), Math.max(1, Math.round(w)), Math.max(1, Math.round(h)));
  }
  function rr(ctx, x, y, w, h, r, c) {
    ctx.fillStyle = c;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
    ctx.fill();
  }
  function circle(ctx, x, y, r, c) {
    ctx.fillStyle = c;
    ctx.beginPath();
    ctx.arc(x, y, Math.max(0.5, r), 0, Math.PI * 2);
    ctx.fill();
  }
  function shadow(ctx, cx, cy, rx, ry) {
    ctx.fillStyle = 'rgba(0,0,0,.35)';
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  function glyph(ctx, path, cx, cy, size, color) {
    ctx.save();
    ctx.translate(cx - size / 2, cy - size / 2);
    ctx.scale(size / 24, size / 24);
    ctx.fillStyle = color;
    ctx.fill(path);
    ctx.restore();
  }

  /* ---------- tiles ---------- */
  function drawFloor(ctx, x, y, t, map) {
    const X = x * t, Y = y * t, p = t / 8;
    px(ctx, X, Y, t, t, (x + y) % 2 ? PAL.floorA : PAL.floorB);
    if (map[y - 1] && map[y - 1][x] > 0) px(ctx, X, Y, t, p * 1.2, 'rgba(0,0,0,.28)');
    if (map[y][x - 1] > 0) px(ctx, X, Y, p * 0.8, t, 'rgba(0,0,0,.16)');
  }
  function drawHard(ctx, x, y, t) {
    const X = x * t, Y = y * t, p = t / 8;
    px(ctx, X, Y, t, t, PAL.hardLo);
    px(ctx, X, Y, t, t - p * 1.4, PAL.hard);
    px(ctx, X, Y, t, p, PAL.hardHi);
    px(ctx, X, Y + p, p, t - p * 2.4, PAL.hardSide);
    px(ctx, X + p * 2, Y + p * 2.2, p, p, PAL.hardHi);
    px(ctx, X + t - p * 3, Y + p * 2.2, p, p, PAL.hardHi);
    px(ctx, X + p * 2, Y + t - p * 3.6, p, p, PAL.hardLo);
    px(ctx, X + t - p * 3, Y + t - p * 3.6, p, p, PAL.hardLo);
  }
  function drawSoft(ctx, x, y, t) {
    const X = x * t, Y = y * t, p = t / 8;
    px(ctx, X, Y, t, t, PAL.mortar);
    const rh = t / 3;
    for (let r = 0; r < 3; r++) {
      const off = r % 2 ? -t / 4 : 0;
      for (let c = -1; c < 3; c++) {
        const bx = X + off + c * (t / 2) + p * 0.35;
        const by = Y + r * rh + p * 0.3;
        const bw = t / 2 - p * 0.7;
        const bh = rh - p * 0.6;
        const x0 = Math.max(bx, X), x1 = Math.min(bx + bw, X + t);
        if (x1 - x0 < 1) continue;
        px(ctx, x0, by, x1 - x0, bh, PAL.soft);
        px(ctx, x0, by, x1 - x0, p * 0.45, PAL.softHi);
        px(ctx, x0, by + bh - p * 0.4, x1 - x0, p * 0.4, PAL.softLo);
      }
    }
  }

  /* ---------- actors ---------- */
  function drawPlayer(ctx, pl, t, time, names) {
    if (pl.dead) return;
    if (pl.blink && Math.floor(time / 110) % 2) return;
    const p = t / 8;
    const cx = (pl.x + 0.5) * t, cy = (pl.y + 0.5) * t;
    const bob = Math.sin(time / 170 + pl.x) * p * 0.22;
    shadow(ctx, cx, cy + p * 3, p * 2.6, p * 0.9);
    const w = p * 5.2, h = p * 5.4;
    const x = cx - w / 2, y = cy - h / 2 - p * 0.5 + bob;
    px(ctx, cx - p * 0.6, y - p * 1.5, p * 1.2, p * 1.6, PAL.outline);
    px(ctx, cx - p * 0.35, y - p * 1.25, p * 0.7, p * 1.3, pl.color);
    rr(ctx, x - p * 0.5, y - p * 0.5, w + p, h + p, p * 1.7, PAL.outline);
    rr(ctx, x, y, w, h, p * 1.3, pl.color);
    ctx.save();
    ctx.globalAlpha = 0.28;
    rr(ctx, x, y + h * 0.64, w, h * 0.36, p * 1.2, '#000');
    ctx.restore();
    rr(ctx, x + p * 0.7, y + p * 1.3, w - p * 1.4, p * 2, p * 0.8, '#0d1322');
    const ex = pl.dir === 'l' ? -p * 0.7 : pl.dir === 'r' ? p * 0.7 : 0;
    px(ctx, cx - p * 1.45 + ex, y + p * 1.8, p * 0.95, p * 1.0, '#e9fbff');
    px(ctx, cx + p * 0.5 + ex, y + p * 1.8, p * 0.95, p * 1.0, '#e9fbff');
    px(ctx, x + p * 0.6, y + p * 0.45, p * 1.4, p * 0.5, 'rgba(255,255,255,.5)');
    px(ctx, x + p * 0.5, y + h - p * 0.1, p * 1.6, p * 0.8, PAL.outline);
    px(ctx, x + w - p * 2.1, y + h - p * 0.1, p * 1.6, p * 0.8, PAL.outline);
    if (names && pl.name) {
      const fs = Math.max(9, Math.round(p * 2.1));
      ctx.font = `700 ${fs}px Inter, system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      const tw = ctx.measureText(pl.name).width;
      const ty = y - p * 2;
      rr(ctx, cx - tw / 2 - p, ty - fs - p * 0.4, tw + p * 2, fs + p * 0.9, p, 'rgba(10,13,23,.75)');
      ctx.fillStyle = pl.color;
      ctx.fillText(pl.name, cx, ty + p * 0.2);
    }
  }

  function drawHalo(ctx, a, t, time) {
    const pulse = 0.5 + 0.5 * Math.sin(time / 280 + a.x);
    const lw = Math.max(1, t / 16);
    ctx.fillStyle = `rgba(255,60,70,${0.1 + 0.08 * pulse})`;
    ctx.fillRect(a.x * t, a.y * t, t, t);
    ctx.strokeStyle = `rgba(255,80,90,${0.3 + 0.25 * pulse})`;
    ctx.lineWidth = lw;
    ctx.strokeRect(a.x * t + lw / 2, a.y * t + lw / 2, t - lw, t - lw);
  }

  function drawAlien(ctx, a, t, time) {
    const p = t / 8;
    const cx = (a.x + 0.5) * t, cy = (a.y + 0.5) * t;
    const bob = Math.sin(time / 210 + a.x * 3) * p * 0.35;
    shadow(ctx, cx, cy + p * 3, p * 2.5, p * 0.85);
    if (a.blink && Math.floor(time / 90) % 2) return;

    if (a.type === 'drifter') {
      const r = p * 2.7, y = cy - p * 0.3 + bob;
      const blob = (rad, col) => {
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.arc(cx, y, rad, Math.PI, 0);
        ctx.lineTo(cx + rad, y + rad * 0.95);
        const n = 3, w = (2 * rad) / n;
        for (let i = 0; i < n; i++) {
          const x0 = cx + rad - i * w;
          ctx.quadraticCurveTo(x0 - w / 2, y + rad * 0.45, x0 - w, y + rad * 0.95);
        }
        ctx.closePath();
        ctx.fill();
      };
      blob(r + p * 0.5, PAL.outline);
      blob(r, '#5fd35a');
      circle(ctx, cx - r * 0.35, y - r * 0.45, p * 0.55, 'rgba(255,255,255,.55)');
      circle(ctx, cx - p * 1.0, y, p * 0.85, '#f4fff0');
      circle(ctx, cx + p * 1.0, y, p * 0.85, '#f4fff0');
      circle(ctx, cx - p * 0.9, y + p * 0.15, p * 0.42, '#14301a');
      circle(ctx, cx + p * 1.1, y + p * 0.15, p * 0.42, '#14301a');
    } else if (a.type === 'seeker') {
      const r = p * 2.6, y = cy - p * 0.6 + bob;
      for (let i = -1; i <= 1; i++) {
        const sway = Math.sin(time / 160 + i) * p * 0.4;
        px(ctx, cx + i * p * 1.3 - p * 0.35 + sway, y + r * 0.6, p * 0.7, p * 1.9, '#5a2f8a');
      }
      circle(ctx, cx, y, r + p * 0.5, PAL.outline);
      circle(ctx, cx, y, r, '#9b5de5');
      circle(ctx, cx - r * 0.45, y - r * 0.5, p * 0.5, 'rgba(255,255,255,.5)');
      circle(ctx, cx, y + p * 0.1, p * 1.55, '#f6f0ff');
      const look = a.target ? Math.atan2(a.target[1] - a.y, a.target[0] - a.x) : 0;
      const ix = a.target ? Math.cos(look) * p * 0.6 : 0;
      const iy = a.target ? Math.sin(look) * p * 0.6 : 0;
      if (a.locked) {
        ctx.save();
        ctx.shadowColor = '#ff3b3b';
        ctx.shadowBlur = p * 3;
        circle(ctx, cx + ix, y + p * 0.1 + iy, p * 0.85, '#ff3b3b');
        ctx.restore();
      } else {
        circle(ctx, cx + ix, y + p * 0.1 + iy, p * 0.85, '#3a1d63');
      }
      circle(ctx, cx + ix, y + p * 0.1 + iy, p * 0.35, '#0a0610');
    } else {
      const w = p * 5.8, h = p * 5.0;
      const x = cx - w / 2, y = cy - h / 2 + bob * 0.5;
      ctx.fillStyle = PAL.outline;
      ctx.beginPath();
      ctx.moveTo(x - p * 0.3, y + p * 0.8); ctx.lineTo(x - p * 0.8, y - p * 1.6); ctx.lineTo(x + p * 1.8, y + p * 0.2);
      ctx.moveTo(x + w + p * 0.3, y + p * 0.8); ctx.lineTo(x + w + p * 0.8, y - p * 1.6); ctx.lineTo(x + w - p * 1.8, y + p * 0.2);
      ctx.fill();
      ctx.fillStyle = '#d8d0c0';
      ctx.beginPath();
      ctx.moveTo(x + p * 0.2, y + p * 0.6); ctx.lineTo(x - p * 0.3, y - p * 0.9); ctx.lineTo(x + p * 1.4, y + p * 0.3);
      ctx.moveTo(x + w - p * 0.2, y + p * 0.6); ctx.lineTo(x + w + p * 0.3, y - p * 0.9); ctx.lineTo(x + w - p * 1.4, y + p * 0.3);
      ctx.fill();
      rr(ctx, x - p * 0.5, y - p * 0.5, w + p, h + p, p * 1.2, PAL.outline);
      rr(ctx, x, y, w, h, p * 0.9, '#c0392b');
      px(ctx, x, y + h * 0.55, w, h * 0.45, '#8e2a20');
      px(ctx, x + p * 0.5, y + p * 0.4, w - p, p * 0.5, 'rgba(255,255,255,.35)');
      rr(ctx, x + p * 0.8, y + p * 1.5, w - p * 1.6, p * 1.3, p * 0.4, '#1b0b0a');
      const glow = 0.7 + 0.3 * Math.sin(time / 120);
      px(ctx, x + p * 1.3, y + p * 1.85, w - p * 2.6, p * 0.6, `rgba(255,210,80,${glow})`);
      px(ctx, x + p * 1.2, y + h - p * 1.6, p * 1, p * 1, '#5e1c15');
      px(ctx, x + w - p * 2.2, y + h - p * 1.6, p * 1, p * 1, '#5e1c15');
      const hp = a.hp == null ? 3 : a.hp;
      for (let i = 0; i < 3; i++) {
        px(ctx, cx - p * 2.1 + i * p * 1.5, y - p * 1.9, p * 1.1, p * 0.6, i < hp ? '#ff5a5a' : 'rgba(255,255,255,.18)');
      }
    }
  }

  function drawBomb(ctx, b, t, time) {
    const p = t / 8;
    const cx = (b.x + 0.5) * t, cy = (b.y + 0.5) * t + p * 0.4;
    const s = 1 + 0.08 * Math.sin(time / (b.fast ? 45 : 95));
    const r = p * 2.6 * s;
    shadow(ctx, cx, cy + p * 2.5, p * 2.4, p * 0.8);
    circle(ctx, cx, cy, r + p * 0.5, PAL.outline);
    circle(ctx, cx, cy, r, b.fast ? '#3a2430' : '#252c42');
    circle(ctx, cx - r * 0.38, cy - r * 0.38, r * 0.28, 'rgba(255,255,255,.35)');
    px(ctx, cx + r * 0.25, cy - r * 1.05, p * 1.3, p * 0.9, '#3b4462');
    ctx.strokeStyle = '#c9a46a';
    ctx.lineWidth = Math.max(1, p * 0.55);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(cx + r * 0.55, cy - r * 1.0);
    ctx.quadraticCurveTo(cx + r * 0.9, cy - r * 1.55, cx + r * 1.25, cy - r * 1.35);
    ctx.stroke();
    const f = Math.floor(time / 70) % 2;
    circle(ctx, cx + r * 1.25, cy - r * 1.35, p * (f ? 0.95 : 0.7), f ? '#ffdd55' : '#ff8a1f');
  }

  function drawFire(ctx, f, t, time) {
    const X = f.x * t, Y = f.y * t, p = t / 8;
    const fl = Math.sin(time / 45 + f.x * 1.7 + f.y * 2.3) * p * 0.35;
    if (f.burning) {
      ctx.fillStyle = 'rgba(255,138,31,.55)';
      ctx.fillRect(X, Y, t, t);
    }
    const layers = [['#ff3d2e', p * 0.4], ['#ff8a1f', p * 1.4], ['#ffdd55', p * 2.4], ['#fff6d0', p * 3.1]];
    for (const [c, ins] of layers) {
      const i = Math.max(0, ins + fl * 0.5);
      if (f.dir === 'h' || f.dir === 'c') px(ctx, X, Y + i, t, t - 2 * i, c);
      if (f.dir === 'v' || f.dir === 'c') px(ctx, X + i, Y, t - 2 * i, t, c);
    }
  }

  function drawItem(ctx, it, t, time) {
    const p = t / 8;
    const X = it.x * t, Y = it.y * t;
    const b = Math.sin(time / 240 + it.x) * p * 0.3;
    const col = it.kind === 'health' ? '#ff4d5a' : it.kind === 'fire' ? '#ff8a1f' : '#ffdd55';
    rr(ctx, X + p * 0.9, Y + p * 0.9 + b, t - p * 1.8, t - p * 1.8, p * 1.3, col);
    rr(ctx, X + p * 1.4, Y + p * 1.4 + b, t - p * 2.8, t - p * 2.8, p * 1, '#121827');
    const cx = X + t / 2, cy = Y + t / 2 + b, sz = p * 4.2;
    if (it.kind === 'health') glyph(ctx, HEART, cx, cy, sz, '#ff4d5a');
    else if (it.kind === 'fire') { glyph(ctx, FLAME, cx, cy, sz, '#ff8a1f'); glyph(ctx, FLAME, cx, cy + p * 0.6, sz * 0.5, '#ffdd55'); }
    else {
      circle(ctx, cx - p * 0.3, cy + p * 0.4, p * 1.5, '#e8e3d4');
      circle(ctx, cx - p * 0.3, cy + p * 0.4, p * 1.1, '#252c42');
      circle(ctx, cx + p * 1.2, cy - p * 1.2, p * 0.5, '#ffdd55');
    }
  }

  /* ---------- modern (v2) painter ---------- */
  function glowOn(ctx, color, blur) { ctx.shadowColor = color; ctx.shadowBlur = blur; }
  function glowOff(ctx) { ctx.shadowBlur = 0; ctx.shadowColor = 'transparent'; }

  function mFloor(ctx, t, n) {
    ctx.fillStyle = MOD.floor;
    ctx.fillRect(0, 0, t * n, t * n);
    const lw = Math.max(1, Math.round(t / 40));
    ctx.fillStyle = MOD.grid;
    for (let i = 0; i <= n; i++) {
      ctx.fillRect(i * t, 0, lw, t * n);
      ctx.fillRect(0, i * t, t * n, lw);
    }
    if (t < 12) return;
    const d = Math.max(2, Math.round(t / 18));
    ctx.fillStyle = MOD.node;
    for (let y = 1; y < n; y++) for (let x = 1; x < n; x++) ctx.fillRect(x * t - d / 2 + lw / 2, y * t - d / 2 + lw / 2, d, d);
  }

  function mHard(ctx, x, y, t, rim) {
    const g = t * 0.05, r = t * 0.2, s = t - 2 * g;
    ctx.save();
    ctx.translate(x * t, y * t);
    const grd = ctx.createLinearGradient(0, 0, 0, t);
    grd.addColorStop(0, rim ? MOD.rimTop : MOD.hardTop);
    grd.addColorStop(1, rim ? MOD.rimBot : MOD.hardBot);
    rr(ctx, g, g, s, s, r, grd);
    ctx.strokeStyle = MOD.hardEdge;
    ctx.lineWidth = Math.max(1, t / 40);
    ctx.stroke();
    if (t >= 10) {
      rr(ctx, g + r * 0.7, g + t * 0.06, s - r * 1.4, Math.max(1, t * 0.035), t, MOD.hardHi);
      if (!rim) rr(ctx, t * 0.36, t * 0.36, t * 0.28, t * 0.28, t * 0.07, MOD.hardChip);
    }
    ctx.restore();
  }

  function mSoft(ctx, x, y, t) {
    const g = t * 0.09, r = t * 0.16, s = t - 2 * g;
    ctx.save();
    ctx.translate(x * t, y * t);
    rr(ctx, g, g, s, s, r, MOD.softBase);
    const grd = ctx.createLinearGradient(0, g, t, t - g);
    grd.addColorStop(0, 'rgba(255,170,70,0.34)');
    grd.addColorStop(1, 'rgba(255,61,46,0.10)');
    ctx.fillStyle = grd;
    ctx.fill();
    ctx.strokeStyle = MOD.softEdge;
    ctx.lineWidth = Math.max(1, t / 36);
    ctx.stroke();
    if (t >= 10) {
      ctx.strokeStyle = MOD.softLine;
      ctx.lineWidth = Math.max(1, t / 44);
      ctx.beginPath();
      ctx.roundRect(t * 0.3, t * 0.3, t * 0.4, t * 0.4, t * 0.08);
      ctx.moveTo(g + s * 0.12, t / 2); ctx.lineTo(t * 0.3, t / 2);
      ctx.moveTo(t * 0.7, t / 2); ctx.lineTo(t - g - s * 0.12, t / 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  // Crest shapes so players differ without color: P1 circle, P2 triangle, P3 square, P4 diamond.
  function mCrest(ctx, i, cx, cy, s, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    if (i === 0) ctx.arc(cx, cy, s, 0, Math.PI * 2);
    else if (i === 1) { ctx.moveTo(cx, cy - s * 1.15); ctx.lineTo(cx + s * 1.1, cy + s * 0.8); ctx.lineTo(cx - s * 1.1, cy + s * 0.8); ctx.closePath(); }
    else if (i === 2) ctx.rect(cx - s * 0.9, cy - s * 0.9, s * 1.8, s * 1.8);
    else if (i === 3) { ctx.moveTo(cx, cy - s * 1.2); ctx.lineTo(cx + s * 1.1, cy); ctx.lineTo(cx, cy + s * 1.2); ctx.lineTo(cx - s * 1.1, cy); ctx.closePath(); }
    else return;
    ctx.fill();
  }

  function mPlayer(ctx, pl, t, time, names) {
    if (pl.dead) return;
    if (pl.blink && Math.floor(time / 110) % 2) return;
    const i = pIndex(pl.color), col = pColor(pl.color);
    const cx = (pl.x + 0.5) * t, bob = Math.sin(time / 170 + pl.x) * t * 0.018;
    const R = t * 0.33, cy = (pl.y + 0.5) * t - t * 0.03 + bob;
    ctx.fillStyle = 'rgba(0,0,0,.45)';
    ctx.beginPath();
    ctx.ellipse(cx, (pl.y + 0.5) * t + R * 0.98, R * 0.85, R * 0.24, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.save();
    glowOn(ctx, col, t * 0.4);
    circle(ctx, cx, cy, R, col);
    ctx.restore();
    const sh = ctx.createRadialGradient(cx - R * 0.35, cy - R * 0.45, R * 0.05, cx, cy, R * 1.05);
    sh.addColorStop(0, 'rgba(255,255,255,.55)');
    sh.addColorStop(0.38, 'rgba(255,255,255,0)');
    sh.addColorStop(1, 'rgba(0,0,0,.38)');
    circle(ctx, cx, cy, R, sh);
    const ex = pl.dir === 'l' ? -R * 0.14 : pl.dir === 'r' ? R * 0.14 : 0;
    rr(ctx, cx - R * 0.66 + ex, cy - R * 0.06, R * 1.32, R * 0.5, R * 0.25, MOD.visor);
    ctx.save();
    glowOn(ctx, '#9fdcff', t * 0.12);
    rr(ctx, cx - R * 0.44 + ex, cy + R * 0.09, R * 0.3, R * 0.19, R * 0.1, MOD.eye);
    rr(ctx, cx + R * 0.14 + ex, cy + R * 0.09, R * 0.3, R * 0.19, R * 0.1, MOD.eye);
    ctx.restore();
    mCrest(ctx, i, cx, cy - R * 0.52, R * 0.2, 'rgba(8,12,22,.82)');
    if (names && pl.name) {
      const fs = Math.max(9, Math.round(t * 0.26));
      ctx.font = `600 ${fs}px Inter, system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const tw = ctx.measureText(pl.name).width;
      const h = fs * 1.5, ty = cy - R - h * 0.5 - t * 0.08;
      rr(ctx, cx - tw / 2 - fs * 0.6, ty - h / 2, tw + fs * 1.2, h, h / 2, 'rgba(8,12,22,.8)');
      ctx.strokeStyle = col;
      ctx.globalAlpha = 0.55;
      ctx.lineWidth = Math.max(1, t / 48);
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.fillStyle = col;
      ctx.fillText(pl.name, cx, ty + fs * 0.05);
    }
  }

  function mHalo(ctx, a, t, time) {
    const pulse = 0.5 + 0.5 * Math.sin(time / 280 + a.x);
    const g = t * 0.06;
    const grd = ctx.createRadialGradient((a.x + 0.5) * t, (a.y + 0.5) * t, t * 0.1, (a.x + 0.5) * t, (a.y + 0.5) * t, t * 0.7);
    grd.addColorStop(0, `rgba(255,59,92,${0.05 + 0.05 * pulse})`);
    grd.addColorStop(1, `rgba(255,59,92,${0.18 + 0.12 * pulse})`);
    rr(ctx, a.x * t + g, a.y * t + g, t - 2 * g, t - 2 * g, t * 0.18, grd);
    ctx.strokeStyle = `rgba(255,80,110,${0.35 + 0.3 * pulse})`;
    ctx.lineWidth = Math.max(1, t / 36);
    ctx.stroke();
  }

  function mAlien(ctx, a, t, time) {
    const cx = (a.x + 0.5) * t, cy = (a.y + 0.5) * t;
    const bob = Math.sin(time / 210 + a.x * 3) * t * 0.03;
    ctx.fillStyle = 'rgba(0,0,0,.45)';
    ctx.beginPath();
    ctx.ellipse(cx, cy + t * 0.33, t * 0.28, t * 0.08, 0, 0, Math.PI * 2);
    ctx.fill();
    if (a.blink && Math.floor(time / 90) % 2) return;

    if (a.type === 'drifter') {
      const r = t * 0.3, y = cy - t * 0.03 + bob;
      ctx.save();
      glowOn(ctx, MOD.drifter, t * 0.35);
      const grd = ctx.createLinearGradient(0, y - r, 0, y + r);
      grd.addColorStop(0, '#86efac');
      grd.addColorStop(1, MOD.drifterDk);
      ctx.fillStyle = grd;
      ctx.beginPath();
      ctx.arc(cx, y, r, Math.PI, 0);
      ctx.lineTo(cx + r, y + r * 0.85);
      const n = 3, w = (2 * r) / n, k = Math.sin(time / 140) * r * 0.08;
      for (let i = 0; i < n; i++) {
        const x0 = cx + r - i * w;
        ctx.quadraticCurveTo(x0 - w / 2, y + r * 0.45 + k, x0 - w, y + r * 0.85);
      }
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      circle(ctx, cx - r * 0.34, y - r * 0.05, r * 0.24, '#f0fff4');
      circle(ctx, cx + r * 0.34, y - r * 0.05, r * 0.24, '#f0fff4');
      circle(ctx, cx - r * 0.3, y + r * 0.0, r * 0.11, '#052e16');
      circle(ctx, cx + r * 0.38, y + r * 0.0, r * 0.11, '#052e16');
    } else if (a.type === 'seeker') {
      const r = t * 0.27, y = cy - t * 0.06 + bob;
      ctx.save();
      ctx.strokeStyle = MOD.seeker;
      ctx.globalAlpha = 0.6;
      ctx.lineWidth = Math.max(1, t / 30);
      ctx.lineCap = 'round';
      ctx.beginPath();
      for (let i = -1; i <= 1; i++) {
        const sway = Math.sin(time / 160 + i) * t * 0.04;
        ctx.moveTo(cx + i * r * 0.45, y + r * 0.7);
        ctx.quadraticCurveTo(cx + i * r * 0.55 + sway, y + r * 1.1, cx + i * r * 0.4 - sway, y + r * 1.4);
      }
      ctx.stroke();
      ctx.restore();
      ctx.save();
      glowOn(ctx, a.locked ? MOD.lock : MOD.seeker, t * 0.4);
      const grd = ctx.createRadialGradient(cx - r * 0.3, y - r * 0.4, r * 0.1, cx, y, r);
      grd.addColorStop(0, '#ddd6fe');
      grd.addColorStop(0.45, MOD.seeker);
      grd.addColorStop(1, MOD.seekerDk);
      circle(ctx, cx, y, r, grd);
      ctx.restore();
      circle(ctx, cx, y + r * 0.05, r * 0.58, '#f5f3ff');
      const look = a.target ? Math.atan2(a.target[1] - a.y, a.target[0] - a.x) : 0;
      const ix = a.target ? Math.cos(look) * r * 0.2 : 0;
      const iy = a.target ? Math.sin(look) * r * 0.2 : 0;
      ctx.save();
      if (a.locked) glowOn(ctx, MOD.lock, t * 0.3);
      circle(ctx, cx + ix, y + r * 0.05 + iy, r * 0.32, a.locked ? MOD.lock : '#4c1d95');
      ctx.restore();
      circle(ctx, cx + ix, y + r * 0.05 + iy, r * 0.13, '#0a0610');
    } else {
      const w = t * 0.7, h = t * 0.6;
      const x = cx - w / 2, y = cy - h / 2 + bob * 0.5;
      ctx.save();
      ctx.strokeStyle = '#e2e8f0';
      ctx.lineWidth = Math.max(1, t / 22);
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(x + w * 0.16, y + h * 0.1); ctx.quadraticCurveTo(x - w * 0.02, y - h * 0.1, x - w * 0.04, y - h * 0.32);
      ctx.moveTo(x + w * 0.84, y + h * 0.1); ctx.quadraticCurveTo(x + w * 1.02, y - h * 0.1, x + w * 1.04, y - h * 0.32);
      ctx.stroke();
      glowOn(ctx, MOD.brute, t * 0.35);
      const grd = ctx.createLinearGradient(0, y, 0, y + h);
      grd.addColorStop(0, MOD.brute);
      grd.addColorStop(1, MOD.bruteDk);
      ctx.fillStyle = grd;
      ctx.beginPath();
      ctx.moveTo(x + w * 0.2, y); ctx.lineTo(x + w * 0.8, y); ctx.lineTo(x + w, y + h * 0.4);
      ctx.lineTo(x + w * 0.82, y + h); ctx.lineTo(x + w * 0.18, y + h); ctx.lineTo(x, y + h * 0.4);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      rr(ctx, x + w * 0.18, y + h * 0.3, w * 0.64, h * 0.22, h * 0.11, '#1a0508');
      const glow = 0.7 + 0.3 * Math.sin(time / 120);
      ctx.save();
      glowOn(ctx, '#ffd250', t * 0.25);
      rr(ctx, x + w * 0.26, y + h * 0.36, w * 0.48, h * 0.1, h * 0.05, `rgba(255,210,80,${glow})`);
      ctx.restore();
      const hp = a.hp == null ? 3 : a.hp;
      for (let i = 0; i < 3; i++) {
        ctx.save();
        if (i < hp) glowOn(ctx, '#ff5a6e', t * 0.15);
        rr(ctx, cx - w * 0.33 + i * w * 0.24, y - h * 0.32, w * 0.18, h * 0.1, h * 0.05, i < hp ? '#ff6b7d' : 'rgba(255,255,255,.18)');
        ctx.restore();
      }
    }
  }

  function mBomb(ctx, b, t, time) {
    const cx = (b.x + 0.5) * t, cy = (b.y + 0.5) * t + t * 0.04;
    const s = 1 + 0.07 * Math.sin(time / (b.fast ? 45 : 95));
    const r = t * 0.3 * s, hot = b.fast ? '#ff3d5a' : '#ff8a1f';
    ctx.fillStyle = 'rgba(0,0,0,.45)';
    ctx.beginPath();
    ctx.ellipse(cx, cy + r * 0.95, r * 0.85, r * 0.24, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.save();
    glowOn(ctx, hot, t * (b.fast ? 0.55 : 0.35));
    const grd = ctx.createRadialGradient(cx - r * 0.35, cy - r * 0.4, r * 0.1, cx, cy, r);
    grd.addColorStop(0, '#46527a');
    grd.addColorStop(1, '#0b0f1c');
    circle(ctx, cx, cy, r, grd);
    ctx.restore();
    ctx.strokeStyle = hot;
    ctx.globalAlpha = 0.85;
    ctx.lineWidth = Math.max(1, t / 28);
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.72, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
    circle(ctx, cx - r * 0.36, cy - r * 0.38, r * 0.16, 'rgba(255,255,255,.4)');
    ctx.strokeStyle = '#c9a46a';
    ctx.lineWidth = Math.max(1, t / 22);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(cx + r * 0.5, cy - r * 0.85);
    ctx.quadraticCurveTo(cx + r * 0.85, cy - r * 1.4, cx + r * 1.2, cy - r * 1.25);
    ctx.stroke();
    const f = 0.75 + 0.25 * Math.sin(time / 35);
    ctx.save();
    glowOn(ctx, '#ffdd55', t * 0.3);
    circle(ctx, cx + r * 1.2, cy - r * 1.25, t * 0.07 * f, '#fff3c4');
    ctx.restore();
  }

  function mFire(ctx, f, t, time) {
    const X = f.x * t, Y = f.y * t;
    const fl = Math.sin(time / 45 + f.x * 1.7 + f.y * 2.3) * t * 0.025;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    if (f.burning) rr(ctx, X + t * 0.06, Y + t * 0.06, t * 0.88, t * 0.88, t * 0.16, 'rgba(255,120,40,.35)');
    const band = (horizontal) => {
      const ins = t * 0.12 + fl;
      const grd = horizontal ? ctx.createLinearGradient(0, Y + ins, 0, Y + t - ins) : ctx.createLinearGradient(X + ins, 0, X + t - ins, 0);
      grd.addColorStop(0, 'rgba(255,61,46,0)');
      grd.addColorStop(0.2, 'rgba(255,90,40,.8)');
      grd.addColorStop(0.42, '#ffb347');
      grd.addColorStop(0.5, '#fff6d0');
      grd.addColorStop(0.58, '#ffb347');
      grd.addColorStop(0.8, 'rgba(255,90,40,.8)');
      grd.addColorStop(1, 'rgba(255,61,46,0)');
      ctx.fillStyle = grd;
      if (horizontal) ctx.fillRect(X, Y + ins, t, t - 2 * ins);
      else ctx.fillRect(X + ins, Y, t - 2 * ins, t);
    };
    if (f.dir === 'h' || f.dir === 'c') band(true);
    if (f.dir === 'v' || f.dir === 'c') band(false);
    if (f.dir === 'c') {
      const grd = ctx.createRadialGradient(X + t / 2, Y + t / 2, 0, X + t / 2, Y + t / 2, t * 0.55);
      grd.addColorStop(0, 'rgba(255,246,208,.9)');
      grd.addColorStop(1, 'rgba(255,138,31,0)');
      ctx.fillStyle = grd;
      ctx.fillRect(X, Y, t, t);
    }
    ctx.restore();
  }

  function mItem(ctx, it, t, time) {
    const X = it.x * t, Y = it.y * t;
    const b = Math.sin(time / 240 + it.x) * t * 0.035;
    const col = it.kind === 'health' ? '#ff5468' : it.kind === 'fire' ? '#ff8a1f' : '#ffdd55';
    const g = t * 0.14;
    ctx.save();
    glowOn(ctx, col, t * 0.3);
    rr(ctx, X + g, Y + g + b, t - 2 * g, t - 2 * g, t * 0.2, '#0d1324');
    ctx.strokeStyle = col;
    ctx.lineWidth = Math.max(1, t / 26);
    ctx.stroke();
    ctx.restore();
    const cx = X + t / 2, cy = Y + t / 2 + b, sz = t * 0.46;
    ctx.save();
    glowOn(ctx, col, t * 0.18);
    if (it.kind === 'health') glyph(ctx, HEART, cx, cy, sz, col);
    else if (it.kind === 'fire') { glyph(ctx, FLAME, cx, cy, sz, col); glyph(ctx, FLAME, cx, cy + t * 0.07, sz * 0.5, '#ffdd55'); }
    else {
      circle(ctx, cx - t * 0.04, cy + t * 0.05, t * 0.15, '#2a3352');
      ctx.strokeStyle = col;
      ctx.lineWidth = Math.max(1, t / 30);
      ctx.beginPath();
      ctx.moveTo(cx + t * 0.12, cy - t * 0.18); ctx.lineTo(cx + t * 0.12, cy - t * 0.04);
      ctx.moveTo(cx + t * 0.05, cy - t * 0.11); ctx.lineTo(cx + t * 0.19, cy - t * 0.11);
      ctx.stroke();
    }
    ctx.restore();
  }

  function renderModern(ctx, scene, t, time) {
    ctx.imageSmoothingEnabled = true;
    const map = scene._map, n = scene._n;
    mFloor(ctx, t, n);
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        if (map[y][x] === 2) mHard(ctx, x, y, t, x === 0 || y === 0 || x === n - 1 || y === n - 1);
        else if (map[y][x] === 1) mSoft(ctx, x, y, t);
      }
    }
    (scene.danger || []).forEach(([x, y]) => rr(ctx, x * t + t * 0.04, y * t + t * 0.04, t * 0.92, t * 0.92, t * 0.16, 'rgba(255,59,92,.16)'));
    (scene.falling || []).forEach(([x, y]) => {
      const k = 0.5 + 0.5 * Math.sin(time / 120);
      const i = t * (0.2 - 0.12 * k);
      rr(ctx, x * t + i, y * t + i, t - 2 * i, t - 2 * i, t * 0.14, `rgba(0,0,0,${0.35 + 0.3 * k})`);
      ctx.save();
      glowOn(ctx, '#ff3d2e', t * 0.25);
      ctx.strokeStyle = 'rgba(255,61,46,.85)';
      ctx.lineWidth = Math.max(1, t / 22);
      ctx.beginPath();
      ctx.roundRect(x * t + t * 0.06, y * t + t * 0.06, t * 0.88, t * 0.88, t * 0.16);
      ctx.stroke();
      ctx.restore();
    });
    if (scene.spawnPulse) {
      const k = (time / 900) % 1;
      (scene.players || []).forEach(pl => {
        ctx.save();
        glowOn(ctx, pColor(pl.color), t * 0.3);
        ctx.strokeStyle = pColor(pl.color);
        ctx.globalAlpha = 1 - k;
        ctx.lineWidth = Math.max(2, t / 14);
        ctx.beginPath();
        ctx.arc((pl.x + 0.5) * t, (pl.y + 0.5) * t, t * (0.35 + k * 0.6), 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      });
    }
    (scene.items || []).forEach(i => mItem(ctx, i, t, time));
    scene._fire.forEach(f => mFire(ctx, f, t, time));
    (scene.aliens || []).forEach(a => mHalo(ctx, a, t, time));
    (scene.bombs || []).forEach(b => mBomb(ctx, b, t, time));
    (scene.aliens || []).forEach(a => mAlien(ctx, a, t, time));
    (scene.players || []).forEach(pl => mPlayer(ctx, pl, t, time, scene.names));
  }

  // Each frame starts from a clean context, so one theme's glows never leak into the other.
  function resetCtx(ctx) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.setLineDash([]);
    glowOff(ctx);
  }

  /* ---------- scene ---------- */
  function render(canvas, scene, time) {
    const ctx = canvas.getContext('2d');
    const t = canvas._t;
    if (!t) return;
    resetCtx(ctx);
    if (modern) { renderModern(ctx, scene, t, time); return; }
    ctx.imageSmoothingEnabled = false;
    const map = scene._map, n = scene._n;
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        if (map[y][x] === 2) drawHard(ctx, x, y, t);
        else drawFloor(ctx, x, y, t, map);
      }
    }
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (map[y][x] === 1) drawSoft(ctx, x, y, t);

    (scene.danger || []).forEach(([x, y]) => {
      ctx.fillStyle = 'rgba(255,40,50,.16)';
      ctx.fillRect(x * t, y * t, t, t);
    });
    (scene.falling || []).forEach(([x, y]) => {
      const k = 0.5 + 0.5 * Math.sin(time / 120);
      ctx.fillStyle = `rgba(0,0,0,${0.35 + 0.3 * k})`;
      const i = t * (0.2 - 0.12 * k);
      ctx.fillRect(x * t + i, y * t + i, t - 2 * i, t - 2 * i);
      ctx.strokeStyle = 'rgba(255,61,46,.8)';
      ctx.lineWidth = Math.max(1, t / 16);
      ctx.strokeRect(x * t + 1, y * t + 1, t - 2, t - 2);
    });
    if (scene.spawnPulse) {
      const k = (time / 900) % 1;
      (scene.players || []).forEach(pl => {
        ctx.strokeStyle = pl.color;
        ctx.globalAlpha = 1 - k;
        ctx.lineWidth = Math.max(2, t / 10);
        ctx.beginPath();
        ctx.arc((pl.x + 0.5) * t, (pl.y + 0.5) * t, t * (0.35 + k * 0.6), 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 1;
      });
    }
    (scene.items || []).forEach(i => drawItem(ctx, i, t, time));
    scene._fire.forEach(f => drawFire(ctx, f, t, time));
    (scene.aliens || []).forEach(a => drawHalo(ctx, a, t, time));
    (scene.bombs || []).forEach(b => drawBomb(ctx, b, t, time));
    (scene.aliens || []).forEach(a => drawAlien(ctx, a, t, time));
    (scene.players || []).forEach(pl => drawPlayer(ctx, pl, t, time, scene.names));
  }

  function fit(canvas, scene) {
    const host = canvas.parentElement;
    const box = host.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const side = scene.cover ? Math.max(box.width, box.height) : Math.min(box.width, box.height);
    const zoom = scene.zoom || 1;
    const t = Math.max(2, scene.cover ? Math.ceil((side * dpr * zoom) / scene._n) : Math.floor((side * dpr * zoom) / scene._n));
    if (canvas._t === t && canvas._n === scene._n) return;
    canvas._n = scene._n;
    canvas._t = t;
    canvas.width = canvas.height = t * scene._n;
    canvas.style.width = canvas.style.height = (t * scene._n) / dpr + 'px';
  }

  function mount(canvas, initial) {
    let scene = initial;
    prepare(scene);
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const redraw = () => { fit(canvas, scene); render(canvas, scene, performance.now()); };
    new ResizeObserver(redraw).observe(canvas.parentElement);
    redrawers.add(redraw);
    redraw();
    if (!reduce) {
      const loop = ts => {
        if (!document.hidden && !scene.still) render(canvas, scene, ts);
        requestAnimationFrame(loop);
      };
      requestAnimationFrame(loop);
    }
    return {
      update(next) { scene = next; prepare(scene); canvas._t = 0; redraw(); },
      // For live demos (touch.js) that mutate the scene in place: draw one frame now.
      draw() { redraw(); }
    };
  }

  /* Draws one actor centered on a small standalone canvas (portraits, legends). */
  function portrait(canvas, actor, size) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const t = Math.round(size * dpr);
    canvas.width = canvas.height = t;
    canvas.style.width = canvas.style.height = size + 'px';
    const ctx = canvas.getContext('2d');
    const draw = time => {
      resetCtx(ctx);
      ctx.imageSmoothingEnabled = modern;
      ctx.clearRect(0, 0, t, t);
      const a = Object.assign({}, actor, { x: 0, y: 0 });
      if (modern) { if (actor.type) mAlien(ctx, a, t, time); else mPlayer(ctx, a, t, time, false); }
      else if (actor.type) drawAlien(ctx, a, t, time); else drawPlayer(ctx, a, t, time, false);
    };
    redrawers.add(() => draw(performance.now()));
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) draw(0);
    else { const loop = ts => { draw(ts); requestAnimationFrame(loop); }; requestAnimationFrame(loop); }
  }

  window.Arena = { mount, portrait, COLORS, N };
})();
