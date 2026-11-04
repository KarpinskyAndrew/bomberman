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
     aliens:  [{ type: 'drifter'|'seeker'|'brute', x, y, locked, target: [x, y], hp, blink }],
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

  const N = 21;
  const SPAWNS = [[1, 1], [19, 1], [1, 19], [19, 19]];
  const COLORS = { p1: '#4da3ff', p2: '#ff9a3c', p3: '#47d16c', p4: '#e46bd6' };
  const PAL = {
    floorA: '#171e30', floorB: '#1a2236',
    hard: '#39446a', hardHi: '#5a6a96', hardSide: '#46537d', hardLo: '#232a42',
    soft: '#8a5a3a', softHi: '#b07a50', softLo: '#5a3824', mortar: '#432a1b',
    outline: '#0a0d17'
  };
  const HEART = new Path2D('M12 20.5s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7.6a4.3 4.3 0 0 1 7.5 2.7c0 5.6-7.5 10.2-7.5 10.2z');
  const FLAME = new Path2D('M12 22c4 0 7-2.7 7-6.8 0-3.4-2.2-5.6-3.7-7.2-.3 1.8-1.2 3-2.5 3.6.4-3.3-1-6.4-3.8-8.6.3 3-1.4 5-3 6.8C4.6 11.3 5 13 5 15.2 5 19.3 8 22 12 22z');

  function rng(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function isHard(x, y) {
    return x === 0 || y === 0 || x === N - 1 || y === N - 1 || (x % 2 === 0 && y % 2 === 0);
  }

  function genMap(seed, density) {
    const r = rng(seed);
    const safe = new Set();
    for (const [sx, sy] of SPAWNS) {
      const dx = sx === 1 ? 1 : -1;
      const dy = sy === 1 ? 1 : -1;
      safe.add(sx + ',' + sy);
      safe.add(sx + dx + ',' + sy);
      safe.add(sx + ',' + (sy + dy));
    }
    const map = [];
    for (let y = 0; y < N; y++) {
      const row = [];
      for (let x = 0; x < N; x++) {
        if (isHard(x, y)) row.push(2);
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
        if (x < 0 || y < 0 || x >= N || y >= N || map[y][x] === 2) break;
        if (map[y][x] === 1) { out.push({ x, y, dir, burning: true }); break; }
        out.push({ x, y, dir });
      }
    }
    return out;
  }

  function prepare(scene) {
    const map = genMap(scene.seed || 7, scene.density == null ? 0.65 : scene.density);
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

  function drawLock(ctx, a, t, time) {
    if (!a.locked || !a.target) return;
    const p = t / 8;
    ctx.save();
    ctx.strokeStyle = 'rgba(255,70,80,.75)';
    ctx.lineWidth = Math.max(1, p * 0.5);
    ctx.setLineDash([p * 1.2, p * 1]);
    ctx.lineDashOffset = -time / 40;
    ctx.beginPath();
    ctx.moveTo((a.x + 0.5) * t, (a.y + 0.5) * t);
    ctx.lineTo((a.target[0] + 0.5) * t, (a.target[1] + 0.5) * t);
    ctx.stroke();
    ctx.restore();
  }

  /* ---------- scene ---------- */
  function render(canvas, scene, time) {
    const ctx = canvas.getContext('2d');
    const t = canvas._t;
    if (!t) return;
    ctx.imageSmoothingEnabled = false;
    const map = scene._map;
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        if (map[y][x] === 2) drawHard(ctx, x, y, t);
        else drawFloor(ctx, x, y, t, map);
      }
    }
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (map[y][x] === 1) drawSoft(ctx, x, y, t);

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
    (scene.aliens || []).forEach(a => drawLock(ctx, a, t, time));
    (scene.aliens || []).forEach(a => drawAlien(ctx, a, t, time));
    (scene.players || []).forEach(pl => drawPlayer(ctx, pl, t, time, scene.names));
  }

  function fit(canvas, scene) {
    const host = canvas.parentElement;
    const box = host.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const side = scene.cover ? Math.max(box.width, box.height) : Math.min(box.width, box.height);
    const zoom = scene.zoom || 1;
    const t = Math.max(2, scene.cover ? Math.ceil((side * dpr * zoom) / N) : Math.floor((side * dpr * zoom) / N));
    if (canvas._t === t) return;
    canvas._t = t;
    canvas.width = canvas.height = t * N;
    canvas.style.width = canvas.style.height = (t * N) / dpr + 'px';
  }

  function mount(canvas, initial) {
    let scene = initial;
    prepare(scene);
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const redraw = () => { fit(canvas, scene); render(canvas, scene, performance.now()); };
    new ResizeObserver(redraw).observe(canvas.parentElement);
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
    ctx.imageSmoothingEnabled = false;
    const draw = time => {
      ctx.clearRect(0, 0, t, t);
      const a = Object.assign({}, actor, { x: 0, y: 0 });
      if (actor.type) drawAlien(ctx, a, t, time); else drawPlayer(ctx, a, t, time, false);
    };
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) draw(0);
    else { const loop = ts => { draw(ts); requestAnimationFrame(loop); }; requestAnimationFrame(loop); }
  }

  window.Arena = { mount, portrait, COLORS, N };
})();
