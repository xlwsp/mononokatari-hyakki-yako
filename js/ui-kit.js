// UI 共通部品（ふわもこの森に合わせた、クリーム色＋こげ茶のやわらかいデザイン）
(function () {
  'use strict';
  const FONT = '"M PLUS Rounded 1c", "Hiragino Maru Gothic ProN", "Hiragino Sans", "Yu Gothic", sans-serif';
  // 見出し・数字・ボタン用のゲームっぽい太いフォント
  const DISPLAY = '"Dela Gothic One", "M PLUS Rounded 1c", "Hiragino Sans", sans-serif';
  // タイトル画面のロゴに合わせた筆文字（見出し・演出用）
  const BRUSH = '"Yuji Syuku", "Hiragino Mincho ProN", "Yu Mincho", serif';
  const C = {
    cream: 0xfff8ea, creamDark: 0xe9dcc3, brown: 0x4a3a2e, brownCss: '#4a3a2e', soft: '#7a6656',
    green: 0x7cc46a, greenDark: 0x4f8a42, orange: 0xf5a25d, orangeDark: 0xc4733a,
    blue: 0x6fb6e8, blueDark: 0x3f7fae, red: 0xe8615a, gray: 0xb9ad9c, grayDark: 0x8a7e6e,
  };

  function T(size, color, extra) {
    return Object.assign({
      fontFamily: FONT, fontSize: Math.round(size) + 'px', color: color || C.brownCss, fontStyle: '800',
    }, extra || {});
  }
  // 白フチ付きの見出し文字
  function TO(size, color, stroke, thick) {
    return {
      fontFamily: DISPLAY, fontSize: Math.round(size) + 'px', color: color || '#fff', fontStyle: 'normal',
      stroke: stroke || C.brownCss, strokeThickness: thick == null ? Math.max(3, size / 7) : thick,
    };
  }

  // 筆文字の見出し：古い紙のような金色＋こげ茶のフチ＋ほのかな光
  function TB(size, color, stroke, thick) {
    return {
      fontFamily: BRUSH, fontSize: Math.round(size) + 'px', color: color || '#fbeccb', fontStyle: 'normal',
      stroke: stroke || '#2a160a', strokeThickness: thick == null ? Math.max(3, size / 8) : thick,
      shadow: { offsetX: 0, offsetY: 0, color: 'rgba(255,190,90,0.75)', blur: Math.max(6, size / 4), stroke: true, fill: false },
    };
  }

  function panel(scene, x, y, w, h, opt = {}) {
    const g = scene.add.graphics();
    const r = opt.r == null ? 18 : opt.r;
    g.fillStyle(0x2a1f18, opt.shadow == null ? 0.18 : opt.shadow);
    g.fillRoundedRect(x + 3, y + 6, w, h, r);
    g.fillStyle(opt.color == null ? C.cream : opt.color, opt.alpha == null ? 0.94 : opt.alpha);
    g.fillRoundedRect(x, y, w, h, r);
    if (opt.border !== false) {
      g.lineStyle(opt.borderW || 3, opt.border || C.brown, opt.borderAlpha == null ? 0.85 : opt.borderAlpha);
      g.strokeRoundedRect(x, y, w, h, r);
    }
    return g;
  }

  // ボタン：見た目どおりの範囲で反応する透明ゾーンを重ねる。キーボードのフォーカス表示つき
  function button(scene, x, y, w, h, label, onClick, opt = {}) {
    const c = scene.add.container(x, y);
    const g = scene.add.graphics();
    const col = opt.color || C.green, dark = opt.dark || C.greenDark;
    const txt = scene.add.text(0, 0, label, opt.brush
      ? Object.assign(TB(opt.size || Math.min(26, h * 0.42), '#fff', Tex.rgb(dark, -0.45), 4), { shadow: undefined })
      : TO(opt.size || Math.min(26, h * 0.42), '#fff', Tex.rgb(dark, -0.35), 4)).setOrigin(0.5);
    let hover = false, down = false, disabled = false, focused = false;
    const draw = () => {
      g.clear();
      const dy = down ? 4 : 0;
      const k = disabled ? 0x9c9488 : col, kd = disabled ? 0x6e675e : dark;
      if (focused && !disabled) {
        g.fillStyle(0xffe07a, 0.55); g.fillRoundedRect(-w / 2 - 7, -h / 2 - 7 + dy, w + 14, h + 20, h * 0.45);
      }
      g.fillStyle(0x2a1f18, 0.2); g.fillRoundedRect(-w / 2 + 2, -h / 2 + 9, w, h, h * 0.4);
      g.fillStyle(kd, 1); g.fillRoundedRect(-w / 2, -h / 2 + 6, w, h, h * 0.4);
      g.fillStyle((hover || focused) && !disabled ? Phaser.Display.Color.ValueToColor(k).lighten(10).color : k, 1);
      g.fillRoundedRect(-w / 2, -h / 2 + dy, w, h, h * 0.4);
      g.fillStyle(0xffffff, 0.25); g.fillRoundedRect(-w / 2 + 8, -h / 2 + dy + 5, w - 16, h * 0.32, h * 0.16);
      g.lineStyle(focused ? 4 : 3, focused ? 0xfff2b0 : C.brown, 1); g.strokeRoundedRect(-w / 2, -h / 2 + dy, w, h, h * 0.4);
      txt.y = dy;
    };
    draw();
    const zone = scene.add.zone(0, 3, w, h + 6).setInteractive({ useHandCursor: true });
    c.add([g, txt, zone]);
    const press = () => {
      if (disabled) return;
      Sfx.init(); Sfx.play('click');
      onClick && onClick();
    };
    zone.on('pointerover', () => { hover = true; draw(); c.onHover && c.onHover(); });
    zone.on('pointerout', () => { hover = false; down = false; draw(); });
    zone.on('pointerdown', () => { if (disabled) return; down = true; draw(); });
    zone.on('pointerup', () => {
      const was = down;
      down = false; draw();
      if (was) press();
    });
    c.press = () => {
      down = true; draw();
      scene.time.delayedCall(90, () => { down = false; draw(); press(); });
    };
    c.setFocus = v => { if (focused !== v) { focused = v; draw(); } };
    c.setLabel = s => txt.setText(s);
    c.setDisabled = v => { disabled = v; draw(); };
    return c;
  }

  // 矢印キーで選択、Enter / Space で決定
  function keyNav(scene, items, opt = {}) {
    let idx = opt.start || 0;
    const list = items.filter(Boolean);
    const born = performance.now();
    const set = i => {
      idx = (i + list.length) % list.length;
      list.forEach((b, k) => b.setFocus(k === idx));
    };
    list.forEach((b, k) => { b.onHover = () => set(k); });
    set(idx);
    const onKey = e => {
      const ae = document.activeElement;
      if (ae && ae.tagName === 'INPUT') return;
      if (!list.every(b => b.active)) return;
      if (performance.now() - born < (opt.delay || 0)) return; // 直後の押し間違いを防ぐ
      if (e.key === 'ArrowDown' || e.key === 'ArrowRight') { set(idx + 1); Sfx.init(); Sfx.play('click'); }
      else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') { set(idx - 1); Sfx.init(); Sfx.play('click'); }
      else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault && e.preventDefault(); list[idx].press(); }
    };
    scene.input.keyboard.on('keydown', onKey);
    const off = () => scene.input.keyboard.off('keydown', onKey);
    scene.events.once('shutdown', off);
    return { set, off, get index() { return idx; } };
  }

  // 背景：森の地面＋素材の木や花を並べた飾り
  function forestBackdrop(scene, opts = {}) {
    const w = scene.scale.width, h = scene.scale.height;
    const objs = [];
    objs.push(scene.add.tileSprite(0, 0, w, h, 'ground').setOrigin(0));
    const rnd = new Phaser.Math.RandomDataGenerator(['nakama']);
    for (let i = 0; i < 14; i++) {
      objs.push(scene.add.image(rnd.between(0, w), rnd.between(0, h), 'patch')
        .setDisplaySize(rnd.between(200, 500), rnd.between(120, 260)).setTint(rnd.pick([0xb6dc7c, 0xa8d47c, 0xc9c76a])).setAlpha(0.3));
    }
    const items = [];
    const add = (k, x, y, s, f) => items.push({ k, x, y, s, f });
    // 上と下の木の列
    for (let x = -60; x < w + 120; x += 120) {
      add(rnd.pick(['tree1', 'tree2', 'tree3']), x + rnd.between(-20, 20), rnd.between(70, 120), rnd.realInRange(0.6, 0.8), rnd.frac() < 0.5);
      add(rnd.pick(['tree1', 'tree2', 'tree3']), x + 60 + rnd.between(-20, 20), h + rnd.between(40, 90), rnd.realInRange(0.7, 0.9), rnd.frac() < 0.5);
    }
    for (let i = 0; i < Math.floor(w * h / 26000); i++) {
      add(rnd.pick(['flower1', 'flower2', 'flower1', 'bush']), rnd.between(0, w), rnd.between(140, h - 60), rnd.realInRange(0.24, 0.36), rnd.frac() < 0.5);
    }
    for (let i = 0; i < 3; i++) add('rock', rnd.between(0, w), rnd.between(h * 0.3, h - 80), rnd.realInRange(0.4, 0.55), rnd.frac() < 0.5);
    items.sort((a, b) => a.y - b.y);
    for (const it of items) {
      if (it.k === 'bush') it.s *= 1.3;
      const dw = scene.textures.get(it.k).getSourceImage().width * it.s;
      objs.push(scene.add.image(it.x, it.y - 3, 'shadow').setDisplaySize(dw * 0.9, dw * 0.3).setAlpha(0.8));
      objs.push(scene.add.image(it.x, it.y, it.k).setOrigin(0.5, 1).setScale(it.s).setFlipX(it.f));
    }
    // 少し暗くして文字を読みやすく
    objs.push(scene.add.rectangle(0, 0, w, h, 0x1d2b17, opts.dim == null ? 0.25 : opts.dim).setOrigin(0));
    return objs;
  }

  // スマホなら全画面＆縦向き固定を試みる（できない端末では何もしない）
  const isMobile = () => window.matchMedia && window.matchMedia('(pointer: coarse)').matches && Math.min(screen.width, screen.height) < 820;
  function mobileEnter() {
    if (!isMobile()) return;
    try {
      const el = document.documentElement;
      const p = el.requestFullscreen ? el.requestFullscreen({ navigationUI: 'hide' }) : null;
      const lock = () => { try { screen.orientation && screen.orientation.lock && screen.orientation.lock('portrait').catch(() => {}); } catch (e) { /* noop */ } };
      if (p && p.then) p.then(lock).catch(() => {}); else lock();
    } catch (e) { /* noop */ }
  }

  window.UI = { FONT, DISPLAY, BRUSH, C, T, TO, TB, panel, button, keyNav, forestBackdrop, isMobile, mobileEnter };
})();
