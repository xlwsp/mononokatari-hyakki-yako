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

  // 敵は images/ から作った画像（assets/ek_*.png）を使うので、ここでは描かない

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
    // 装備アイテム（64×64）：小剣・勾玉・赤ファイア・青ファイア
    canvasTex(scene, 'it_sword', 64, 64, ctx => {
      ctx.translate(32, 32); ctx.rotate(-Math.PI / 4);
      ctx.lineJoin = 'round';
      // 刃
      const g = ctx.createLinearGradient(-6, 0, 6, 0);
      g.addColorStop(0, '#dfe8f4'); g.addColorStop(0.5, '#ffffff'); g.addColorStop(1, '#9fb0c8');
      ctx.fillStyle = g; ctx.strokeStyle = '#3a4058'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(0, -28); ctx.lineTo(7, -18); ctx.lineTo(7, 10); ctx.lineTo(-7, 10); ctx.lineTo(-7, -18); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = 'rgba(120,140,170,0.8)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(0, -22); ctx.lineTo(0, 8); ctx.stroke();
      // つば・柄
      ctx.fillStyle = '#e0a83a'; ctx.strokeStyle = '#5a3a14'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.roundRect(-14, 9, 28, 7, 3); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#7a3a2a'; ctx.beginPath(); ctx.roundRect(-4, 16, 8, 13, 3); ctx.fill(); ctx.stroke();
    });
    canvasTex(scene, 'it_magatama', 64, 64, ctx => {
      ctx.lineWidth = 3; ctx.strokeStyle = '#1e3a2a';
      const g = ctx.createRadialGradient(26, 24, 2, 32, 32, 28);
      g.addColorStop(0, '#b8ffd0'); g.addColorStop(0.5, '#3ccf7a'); g.addColorStop(1, '#1a7a44');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(28, 26, 16, Math.PI * 0.5, Math.PI * 2.2, false);
      ctx.quadraticCurveTo(46, 50, 30, 58);
      ctx.quadraticCurveTo(36, 46, 28, 42);
      ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(28, 25, 5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.beginPath(); ctx.ellipse(20, 18, 5, 3, -0.6, 0, Math.PI * 2); ctx.fill();
    });
    const flame = (key, outer, mid, inner) => canvasTex(scene, key, 64, 64, ctx => {
      const layer = (col, sx, sy) => {
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.moveTo(32, 32 - 28 * sy);
        ctx.bezierCurveTo(32 + 10 * sx, 32 - 12 * sy, 32 + 22 * sx, 32 + 0 * sy, 32 + 18 * sx, 32 + 14 * sy);
        ctx.bezierCurveTo(32 + 14 * sx, 32 + 28 * sy, 32 - 14 * sx, 32 + 28 * sy, 32 - 18 * sx, 32 + 14 * sy);
        ctx.bezierCurveTo(32 - 22 * sx, 32 + 0 * sy, 32 - 6 * sx, 32 - 10 * sy, 32, 32 - 28 * sy);
        ctx.fill();
      };
      ctx.shadowColor = outer; ctx.shadowBlur = 8;
      layer(outer, 1, 1); ctx.shadowBlur = 0;
      ctx.translate(0, 6); layer(mid, 0.68, 0.72);
      ctx.translate(0, 6); layer(inner, 0.38, 0.45);
    });
    flame('it_redfire', '#ff4a1a', '#ffa020', '#fff2a0');
    flame('it_bluefire', '#2a6aff', '#40c8ff', '#e8fbff');
    // 新しい装備（64×64）
    canvasTex(scene, 'it_bow', 64, 64, ctx => {
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.strokeStyle = '#3a1a0a'; ctx.lineWidth = 9;
      ctx.beginPath(); ctx.arc(14, 32, 26, -Math.PI * 0.42, Math.PI * 0.42); ctx.stroke();
      ctx.strokeStyle = '#c0392b'; ctx.lineWidth = 5;
      ctx.beginPath(); ctx.arc(14, 32, 26, -Math.PI * 0.42, Math.PI * 0.42); ctx.stroke();
      ctx.strokeStyle = '#fff4d8'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(20, 8); ctx.lineTo(20, 56); ctx.stroke();
      ctx.strokeStyle = '#3a2a14'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(10, 32); ctx.lineTo(56, 32); ctx.stroke();
      ctx.fillStyle = '#e8eef8'; ctx.strokeStyle = '#3a4058'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(62, 32); ctx.lineTo(50, 25); ctx.lineTo(50, 39); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#ffffff'; ctx.fillRect(8, 27, 8, 4); ctx.fillRect(8, 33, 8, 4);
    });
    canvasTex(scene, 'it_taiko', 64, 64, ctx => {
      ctx.lineWidth = 3; ctx.strokeStyle = '#2a1408';
      ctx.fillStyle = '#b8402a'; ctx.beginPath(); ctx.ellipse(32, 36, 22, 16, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#f4e6c4'; ctx.beginPath(); ctx.ellipse(32, 30, 20, 10, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#e0a83a'; for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; ctx.beginPath(); ctx.arc(32 + Math.cos(a) * 21, 38 + Math.sin(a) * 13, 2, 0, 7); ctx.fill(); }
      ctx.fillStyle = '#fff07a'; ctx.strokeStyle = '#7a5a00'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(36, 2); ctx.lineTo(26, 18); ctx.lineTo(33, 18); ctx.lineTo(27, 30); ctx.lineTo(42, 13); ctx.lineTo(35, 13); ctx.closePath(); ctx.fill(); ctx.stroke();
    });
    canvasTex(scene, 'it_mirror', 64, 64, ctx => {
      ctx.lineWidth = 3; ctx.strokeStyle = '#5a3a08';
      ctx.fillStyle = '#e0a83a'; ctx.beginPath(); for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2 + Math.PI / 8; ctx.lineTo(32 + Math.cos(a) * 29, 32 + Math.sin(a) * 29); } ctx.closePath(); ctx.fill(); ctx.stroke();
      const g = ctx.createLinearGradient(14, 14, 50, 50); g.addColorStop(0, '#ffffff'); g.addColorStop(0.5, '#bfe6ff'); g.addColorStop(1, '#6aa0d8');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(32, 32, 19, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(22, 30); ctx.lineTo(30, 22); ctx.moveTo(24, 38); ctx.lineTo(38, 24); ctx.stroke();
    });
    canvasTex(scene, 'it_uchiwa', 64, 64, ctx => {
      ctx.lineWidth = 3; ctx.strokeStyle = '#1e3a14';
      ctx.fillStyle = '#7a4a1a'; ctx.beginPath(); ctx.roundRect(29, 38, 6, 24, 3); ctx.fill(); ctx.stroke();
      for (let i = 0; i < 7; i++) {
        const a = -Math.PI / 2 + (i - 3) * 0.32;
        ctx.fillStyle = i % 2 ? '#3a9a4a' : '#5ac85a';
        ctx.beginPath(); ctx.ellipse(32 + Math.cos(a) * 15, 38 + Math.sin(a) * 15, 7, 17, a + Math.PI / 2, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      }
      ctx.fillStyle = '#ffd84f'; ctx.beginPath(); ctx.arc(32, 38, 5, 0, 7); ctx.fill(); ctx.stroke();
    });
    canvasTex(scene, 'it_kozuchi', 64, 64, ctx => {
      ctx.lineWidth = 3; ctx.strokeStyle = '#3a1a08';
      ctx.save(); ctx.translate(32, 32); ctx.rotate(-0.6);
      ctx.fillStyle = '#8a4a1a'; ctx.beginPath(); ctx.roundRect(-4, -2, 8, 30, 3); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#c0392b'; ctx.beginPath(); ctx.roundRect(-20, -22, 40, 22, 8); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#ffd84f'; ctx.beginPath(); ctx.roundRect(-20, -15, 40, 7, 2); ctx.fill(); ctx.stroke();
      ctx.restore();
      ctx.fillStyle = '#ffe07a'; ctx.strokeStyle = '#8a5a00'; ctx.lineWidth = 2;
      [[50, 12], [56, 26]].forEach(([x, y]) => { ctx.beginPath(); ctx.arc(x, y, 5, 0, 7); ctx.fill(); ctx.stroke(); });
    });
    canvasTex(scene, 'it_shuriken', 64, 64, ctx => {
      ctx.lineWidth = 3; ctx.strokeStyle = '#1a1e2a';
      const g = ctx.createRadialGradient(32, 32, 2, 32, 32, 28); g.addColorStop(0, '#ffffff'); g.addColorStop(1, '#7a8aa8');
      ctx.fillStyle = g; star(ctx, 32, 32, 29, 9, 4); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#1a1e2a'; ctx.beginPath(); ctx.arc(32, 32, 5, 0, 7); ctx.fill();
    });
    // 装備の弾
    const glow = (key, col, size) => canvasTex(scene, key, size, size, ctx => {
      const r = size / 2, g = ctx.createRadialGradient(r, r, 0, r, r, r);
      g.addColorStop(0, '#ffffff'); g.addColorStop(0.3, col); g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, size, size);
    });
    glow('pj_i_fire', '#ff7a1a', 40);
    glow('pj_i_ice', '#4ad8ff', 30);
    canvasTex(scene, 'pj_i_arrow', 56, 16, ctx => {
      ctx.strokeStyle = '#ffe9b0'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(4, 8); ctx.lineTo(44, 8); ctx.stroke();
      ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.moveTo(56, 8); ctx.lineTo(42, 2); ctx.lineTo(42, 14); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#ff8a7a'; ctx.fillRect(2, 3, 9, 3); ctx.fillRect(2, 10, 9, 3);
    });
    canvasTex(scene, 'pj_i_shuri', 30, 30, ctx => {
      ctx.fillStyle = '#e8eef8'; star(ctx, 15, 15, 14, 4, 4); ctx.fill();
    });
    // レアリティのオーラ（白いもや。色は表示するときに付ける）
    canvasTex(scene, 'aura', 96, 96, ctx => {
      const g = ctx.createRadialGradient(48, 48, 6, 48, 48, 46);
      g.addColorStop(0, 'rgba(255,255,255,0.9)'); g.addColorStop(0.45, 'rgba(255,255,255,0.45)'); g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, 96, 96);
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
