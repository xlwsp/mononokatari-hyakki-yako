// コードで描くテクスチャ（仲間キャラ・敵・弾・地面など）
// 素材画像のやわらかい3D風タッチに合わせ、グラデーションで立体感を出す
(function () {
  'use strict';

  function rgb(hex, f) {
    let r = (hex >> 16) & 255, g = (hex >> 8) & 255, b = hex & 255;
    if (f > 0) { r += (255 - r) * f; g += (255 - g) * f; b += (255 - b) * f; }
    else if (f < 0) { r *= 1 + f; g *= 1 + f; b *= 1 + f; }
    return `rgb(${r | 0},${g | 0},${b | 0})`;
  }
  function rgba(hex, a) { return `rgba(${(hex >> 16) & 255},${(hex >> 8) & 255},${hex & 255},${a})`; }

  function canvasTex(scene, key, w, h, draw) {
    if (scene.textures.exists(key)) return;
    const t = scene.textures.createCanvas(key, w, h);
    const ctx = t.context;
    draw(ctx, w, h);
    t.refresh();
  }

  // ぷっくりした玉
  function ball(ctx, x, y, rx, ry, col) {
    const g = ctx.createRadialGradient(x - rx * 0.35, y - ry * 0.45, Math.min(rx, ry) * 0.1, x, y, Math.max(rx, ry) * 1.08);
    g.addColorStop(0, rgb(col, 0.5));
    g.addColorStop(0.5, rgb(col, 0.05));
    g.addColorStop(1, rgb(col, -0.32));
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); ctx.fill();
  }
  function fillPath(ctx, col, pts, light) {
    const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
    const x0 = Math.min(...xs), y0 = Math.min(...ys), x1 = Math.max(...xs), y1 = Math.max(...ys);
    const g = ctx.createLinearGradient(x0, y0, x1 * 0.3 + x0 * 0.7, y1);
    g.addColorStop(0, rgb(col, light == null ? 0.35 : light));
    g.addColorStop(1, rgb(col, -0.2));
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.closePath(); ctx.fill();
  }
  function eyes(ctx, x, y, sp, s, opt = {}) {
    for (const dx of [-sp, sp]) {
      ctx.fillStyle = opt.color || '#3a2a24';
      ctx.beginPath(); ctx.ellipse(x + dx, y, s * 0.8, s, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = opt.glint || '#fff';
      ctx.beginPath(); ctx.arc(x + dx - s * 0.25, y - s * 0.4, s * 0.32, 0, Math.PI * 2); ctx.fill();
      if (opt.angry) {
        ctx.strokeStyle = opt.color || '#3a2a24'; ctx.lineWidth = s * 0.55; ctx.lineCap = 'round';
        // 眉を中央に向かって下げる（怒り顔）
        const outer = dx < 0 ? -1 : 1;
        ctx.beginPath();
        ctx.moveTo(x + dx + outer * s * 1.1, y - s * 1.8);
        ctx.lineTo(x + dx - outer * s * 1.0, y - s * 1.1);
        ctx.stroke();
      }
    }
  }
  function cheeks(ctx, x, y, sp, s) {
    ctx.fillStyle = 'rgba(255,120,130,0.45)';
    for (const dx of [-sp, sp]) { ctx.beginPath(); ctx.ellipse(x + dx, y, s * 1.2, s * 0.7, 0, 0, Math.PI * 2); ctx.fill(); }
  }
  function mouth(ctx, x, y, s) {
    ctx.strokeStyle = '#3a2a24'; ctx.lineWidth = Math.max(1.5, s * 0.35); ctx.lineCap = 'round';
    ctx.beginPath(); ctx.arc(x, y - s * 0.3, s, 0.2 * Math.PI, 0.8 * Math.PI); ctx.stroke();
  }
  function star(ctx, cx, cy, ro, ri, n) {
    ctx.beginPath();
    for (let i = 0; i < n * 2; i++) {
      const r = i % 2 ? ri : ro, a = -Math.PI / 2 + i * Math.PI / n;
      i ? ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r) : ctx.moveTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
    }
    ctx.closePath();
  }

  // ---------- 敵 ----------
  const ENEMY_DRAW = {
    slime: [60, 52, ctx => {
      ball(ctx, 30, 32, 26, 19, 0x8a63d2);
      ball(ctx, 30, 22, 14, 12, 0x9b78e0);
      eyes(ctx, 30, 30, 8, 3.6, { angry: true, color: '#2a1636' });
    }],
    bat: [72, 50, ctx => {
      fillPath(ctx, 0x4b3a62, [[30, 24], [4, 8], [10, 22], [2, 30], [16, 32], [12, 42], [28, 32]], 0.15);
      fillPath(ctx, 0x4b3a62, [[42, 24], [68, 8], [62, 22], [70, 30], [56, 32], [60, 42], [44, 32]], 0.15);
      ball(ctx, 36, 28, 15, 14, 0x5c4878);
      eyes(ctx, 36, 27, 5.5, 3, { color: '#ff3355', glint: '#ffd0d8' });
    }],
    wisp: [56, 62, ctx => {
      const g = ctx.createRadialGradient(24, 30, 2, 28, 36, 28);
      g.addColorStop(0, '#d6f0ff'); g.addColorStop(0.45, '#5f8fe0'); g.addColorStop(1, 'rgba(40,60,140,0.9)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.moveTo(28, 2);
      ctx.quadraticCurveTo(40, 18, 50, 30); ctx.quadraticCurveTo(58, 58, 28, 60);
      ctx.quadraticCurveTo(-2, 58, 6, 30); ctx.quadraticCurveTo(16, 18, 28, 2);
      ctx.fill();
      eyes(ctx, 28, 38, 7, 3.4, { angry: true, color: '#14204a' });
    }],
    brute: [84, 84, ctx => {
      fillPath(ctx, 0xf3e3c8, [[18, 24], [8, 2], [28, 18]], 0.4);
      fillPath(ctx, 0xf3e3c8, [[66, 24], [76, 2], [56, 18]], 0.4);
      const g = ctx.createRadialGradient(30, 30, 4, 42, 46, 44);
      g.addColorStop(0, rgb(0xb0644a, 0.4)); g.addColorStop(0.6, rgb(0xb0644a, 0)); g.addColorStop(1, rgb(0xb0644a, -0.35));
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.roundRect(8, 14, 68, 66, 22); ctx.fill();
      eyes(ctx, 42, 42, 12, 4.5, { angry: true, color: '#2a140c' });
      ctx.fillStyle = '#2a140c'; ctx.beginPath(); ctx.roundRect(30, 56, 24, 8, 4); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.fillRect(34, 56, 4, 4); ctx.fillRect(46, 56, 4, 4);
    }],
    boss: [176, 176, ctx => {
      ball(ctx, 88, 100, 76, 70, 0x9b2d4a);
      ball(ctx, 88, 78, 40, 26, 0xb8435f);
      ctx.fillStyle = '#f2b134';
      ctx.beginPath(); ctx.moveTo(50, 40); ctx.lineTo(56, 8); ctx.lineTo(70, 28); ctx.lineTo(88, 2); ctx.lineTo(106, 28); ctx.lineTo(120, 8); ctx.lineTo(126, 40); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#ffe48a'; ctx.fillRect(52, 34, 72, 8);
      ctx.fillStyle = '#7fe0ff'; ctx.beginPath(); ctx.arc(88, 24, 6, 0, Math.PI * 2); ctx.fill();
      eyes(ctx, 88, 92, 24, 9, { angry: true, color: '#1a0810' });
      ctx.fillStyle = '#1a0810'; ctx.beginPath(); ctx.ellipse(88, 128, 30, 14, 0, 0, Math.PI); ctx.fill();
      ctx.fillStyle = '#fff';
      for (let i = 0; i < 5; i++) { ctx.beginPath(); ctx.moveTo(64 + i * 12, 128); ctx.lineTo(70 + i * 12, 138); ctx.lineTo(76 + i * 12, 128); ctx.fill(); }
    }],
    // キノコ（ゆっくり・かたい）
    shroom: [60, 60, ctx => {
      ctx.fillStyle = '#f3e3c8'; ctx.beginPath(); ctx.roundRect(20, 30, 20, 26, 8); ctx.fill();
      ball(ctx, 30, 26, 27, 18, 0xc8503a);
      ctx.fillStyle = 'rgba(255,245,230,0.9)';
      for (const [x, y, r] of [[18, 20, 4], [34, 14, 5], [44, 26, 3.5], [26, 31, 3]]) { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); }
      eyes(ctx, 30, 44, 5, 2.6, { angry: true, color: '#3a1a10' });
    }],
    // カブトムシ（速い）
    beetle: [64, 54, ctx => {
      ctx.strokeStyle = '#2a1a30'; ctx.lineWidth = 3; ctx.lineCap = 'round';
      for (const s of [-1, 1]) for (const k of [0, 1, 2]) { ctx.beginPath(); ctx.moveTo(32 + s * 10, 30 + k * 7); ctx.lineTo(32 + s * 26, 34 + k * 8); ctx.stroke(); }
      ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(32, 14); ctx.lineTo(32, 2); ctx.lineTo(38, 6); ctx.stroke();
      ball(ctx, 32, 32, 20, 18, 0x3a5ad0);
      ctx.strokeStyle = 'rgba(0,0,40,0.5)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(32, 16); ctx.lineTo(32, 50); ctx.stroke();
      ball(ctx, 32, 16, 10, 7, 0x2a3a90);
      eyes(ctx, 32, 16, 5, 2.2, { color: '#ffdd44', glint: '#fff' });
    }],
    // ゴールドスライム（逃げ回るボーナス敵）
    gold: [64, 56, ctx => {
      const g = ctx.createRadialGradient(24, 22, 2, 32, 34, 30);
      g.addColorStop(0, '#fffbe0'); g.addColorStop(0.4, '#ffd84f'); g.addColorStop(1, '#c08a10');
      ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(32, 36, 28, 20, 0, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(32, 24, 15, 13, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#fff'; star(ctx, 50, 12, 7, 3, 4); ctx.fill(); star(ctx, 12, 20, 5, 2, 4); ctx.fill();
      eyes(ctx, 32, 33, 8, 3.6, { color: '#5a3a00' });
      ctx.strokeStyle = '#5a3a00'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(32, 40, 5, 0.1 * Math.PI, 0.9 * Math.PI); ctx.stroke();
    }],
    // ゴーレム（大きくてかたい）
    golem: [96, 96, ctx => {
      const rock = (x, y, w, h, c) => { const g = ctx.createLinearGradient(x, y, x + w, y + h); g.addColorStop(0, rgb(c, 0.3)); g.addColorStop(1, rgb(c, -0.3)); ctx.fillStyle = g; ctx.beginPath(); ctx.roundRect(x, y, w, h, 10); ctx.fill(); };
      rock(6, 40, 22, 34, 0x8a8278); rock(68, 40, 22, 34, 0x8a8278);
      rock(18, 22, 60, 58, 0x9a9288);
      rock(28, 6, 40, 30, 0xa8a096);
      rock(22, 76, 20, 18, 0x7a7268); rock(54, 76, 20, 18, 0x7a7268);
      ctx.fillStyle = '#7cff9a'; ctx.beginPath(); ctx.ellipse(40, 21, 4, 3, 0, 0, Math.PI * 2); ctx.ellipse(56, 21, 4, 3, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(60,140,80,0.8)'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(30, 50); ctx.lineTo(44, 58); ctx.lineTo(40, 70); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(64, 46); ctx.lineTo(56, 60); ctx.stroke();
    }],
  };

  // 弾：モンスターごとの色（サイズは攻撃の当たり判定から）
  function projTable() {
    const t = { player: [0x8fe8ff, 22], tongue: [0xff7a90, 30] };
    for (const k of GD.SPECIES_KEYS) {
      const sp = GD.SPECIES[k];
      t[k] = [sp.color === 0xe8f0ff ? 0xb8d8ff : sp.color, Math.max(16, sp.atk.r * 2 + 8 + (sp.atk.aoe ? 8 : 0))];
    }
    return t;
  }

  function makeAll(scene) {
    // 地面タイル（継ぎ目なし）
    canvasTex(scene, 'ground', 256, 256, (ctx, w, h) => {
      ctx.fillStyle = '#7db462'; ctx.fillRect(0, 0, w, h);
      let seed = 7;
      const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
      const wrap = (fn, x, y, m) => { for (const ox of [-w, 0, w]) for (const oy of [-h, 0, h]) if (x + ox > -m && x + ox < w + m && y + oy > -m && y + oy < h + m) fn(x + ox, y + oy); };
      for (let i = 0; i < 26; i++) {
        const x = rnd() * w, y = rnd() * h, r = 20 + rnd() * 40, light = rnd() < 0.5;
        wrap((xx, yy) => {
          const g = ctx.createRadialGradient(xx, yy, 0, xx, yy, r);
          g.addColorStop(0, light ? 'rgba(170,215,120,0.28)' : 'rgba(80,140,70,0.22)');
          g.addColorStop(1, 'rgba(0,0,0,0)');
          ctx.fillStyle = g; ctx.fillRect(xx - r, yy - r, r * 2, r * 2);
        }, x, y, r);
      }
      for (let i = 0; i < 140; i++) {
        const x = rnd() * w, y = rnd() * h, len = 4 + rnd() * 6, lean = (rnd() - 0.5) * 4;
        const c = rnd() < 0.55 ? 'rgba(160,210,110,0.7)' : 'rgba(80,135,65,0.6)';
        wrap((xx, yy) => {
          ctx.strokeStyle = c; ctx.lineWidth = 1.6; ctx.lineCap = 'round';
          ctx.beginPath(); ctx.moveTo(xx, yy); ctx.lineTo(xx + lean, yy - len); ctx.stroke();
        }, x, y, 12);
      }
    });
    canvasTex(scene, 'patch', 128, 128, (ctx) => {
      const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
      g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.6, 'rgba(255,255,255,0.5)'); g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, 128, 128);
    });
    canvasTex(scene, 'shadow', 128, 64, (ctx) => {
      const g = ctx.createRadialGradient(64, 32, 0, 64, 32, 64);
      g.addColorStop(0, 'rgba(30,50,25,0.5)'); g.addColorStop(0.6, 'rgba(30,50,25,0.25)'); g.addColorStop(1, 'rgba(30,50,25,0)');
      ctx.save(); ctx.scale(1, 0.5); ctx.fillStyle = g; ctx.fillRect(0, 0, 128, 128); ctx.restore();
    });
    canvasTex(scene, 'spark', 16, 16, (ctx) => {
      const g = ctx.createRadialGradient(8, 8, 0, 8, 8, 8);
      g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, 16, 16);
    });
    canvasTex(scene, 'ring', 96, 48, (ctx) => {
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.ellipse(48, 24, 42, 19, 0, 0, Math.PI * 2); ctx.stroke();
    });
    canvasTex(scene, 'grave', 44, 52, (ctx) => {
      const g = ctx.createLinearGradient(0, 0, 44, 52);
      g.addColorStop(0, '#e8e2dc'); g.addColorStop(1, '#9a928c');
      ctx.fillStyle = g; ctx.beginPath(); ctx.roundRect(6, 4, 32, 46, [16, 16, 4, 4]); ctx.fill();
      ctx.fillStyle = '#7a726c'; ctx.fillRect(19, 14, 6, 22); ctx.fillRect(13, 20, 18, 6);
    });

    for (const k of Object.keys(ENEMY_DRAW)) {
      const [w, h, fn] = ENEMY_DRAW[k];
      canvasTex(scene, 'en_' + k, w, h, fn);
    }
    const PROJ = projTable();
    for (const k of Object.keys(PROJ)) {
      const [col, size] = PROJ[k];
      canvasTex(scene, 'pj_' + k, size, size, (ctx) => {
        const r = size / 2;
        const g = ctx.createRadialGradient(r, r, 0, r, r, r);
        g.addColorStop(0, '#ffffff'); g.addColorStop(0.35, rgb(col, 0.2)); g.addColorStop(0.7, rgba(col, 0.6)); g.addColorStop(1, rgba(col, 0));
        ctx.fillStyle = g;
        if (k === 'sinonome') { star(ctx, r, r, r, r * 0.45, 5); ctx.fill(); } else ctx.fillRect(0, 0, size, size);
      });
    }
    [[0x6fe3ff, 'gem0'], [0x7cff8a, 'gem1'], [0xff7ab8, 'gem2']].forEach(([col, key]) => {
      canvasTex(scene, key, 18, 24, (ctx) => {
        fillPath(ctx, col, [[9, 1], [17, 12], [9, 23], [1, 12]], 0.6);
        ctx.fillStyle = 'rgba(255,255,255,0.8)';
        ctx.beginPath(); ctx.moveTo(9, 3); ctx.lineTo(13, 11); ctx.lineTo(9, 10); ctx.closePath(); ctx.fill();
      });
    });
    // プレイヤー画像が読み込めなかった場合の代わり
    for (const k of ['player_front', 'player_side', 'player_back']) {
      if (!scene.textures.exists(k) || scene.textures.get(k).key === '__MISSING') {
        canvasTex(scene, k, 84, 200, (ctx) => {
          ball(ctx, 42, 50, 36, 36, 0x6b4a3a);
          ctx.fillStyle = '#3a2c28'; ctx.beginPath(); ctx.roundRect(12, 86, 60, 110, 20); ctx.fill();
        });
      }
    }
  }

  window.Tex = { makeAll, rgb };
})();
