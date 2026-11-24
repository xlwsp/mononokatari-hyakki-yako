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

  // 読みやすさ重視の太い丸ゴシック（カードの名前・数値・説明用）
  function TR(size, color, stroke, thick, extra) {
    return Object.assign({
      fontFamily: FONT, fontSize: Math.round(size) + 'px', color: color || C.brownCss, fontStyle: '900',
      stroke: stroke || '#000', strokeThickness: thick == null ? 0 : thick,
    }, extra || {});
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
    // どのボタンも夜の枠にそろえる（color は うっすらした色味として残す）
    if (!opt.night && !opt.classic) opt = Object.assign({}, opt, { night: true, accent: opt.accent != null ? opt.accent : opt.color });
    const c = scene.add.container(x, y);
    const g = scene.add.graphics();
    const col = opt.color || C.green, dark = opt.dark || C.greenDark;
    const txt = scene.add.text(0, 0, label, opt.night
      ? Object.assign(TB(opt.size || Math.min(26, h * 0.42), '#fff8f0', '#0a0614', 3), { shadow: { offsetX: 0, offsetY: 0, color: 'rgba(190,150,255,0.85)', blur: 8, stroke: true, fill: false } })
      : opt.brush
      ? Object.assign(TB(opt.size || Math.min(26, h * 0.42), '#fff', Tex.rgb(dark, -0.45), 4), { shadow: undefined })
      : TO(opt.size || Math.min(26, h * 0.42), '#fff', Tex.rgb(dark, -0.35), 4)).setOrigin(0.5);
    let hover = false, down = false, disabled = false, focused = false;
    const draw = () => {
      g.clear();
      if (opt.night) { // 夜の枠：半透明の黒＋白い線＋角の◆
        const dy = down ? 2 : 0, hl = (hover || focused) && !disabled;
        frameDraw(g, -w / 2, -h / 2 + dy, w, h, {
          glow: hl ? 0xb48cff : null, alpha: disabled ? 0.4 : hl ? 0.72 : 0.6,
          tint: opt.accent, lineA: disabled ? 0.4 : 1, line: focused ? 0xffe7a0 : 0xffffff, inner: false,
        });
        txt.y = dy + (opt.labelDy || 0); txt.setAlpha(disabled ? 0.5 : 1);
        return;
      }
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

  // ---------- 夜の枠（タイトルのデザインに合わせた、半透明の黒＋白い線＋角の◆） ----------
  function gem(g, x, y, s, col, a) {
    g.fillStyle(col, a);
    g.fillPoints([{ x, y: y - s }, { x: x + s, y }, { x, y: y + s }, { x: x - s, y }], true);
  }
  function cornerGems(g, x, y, w, h, s, col) {
    for (const [cx, cy] of [[x, y], [x + w, y], [x, y + h], [x + w, y + h]]) {
      gem(g, cx, cy, s + 2, 0x0a0614, 0.9);
      gem(g, cx, cy, s, col == null ? 0xfff6e6 : col, 1);
    }
  }
  function frameDraw(g, x, y, w, h, opt = {}) {
    const r = opt.r == null ? Math.min(14, h * 0.2) : opt.r;
    if (opt.glow) { g.fillStyle(opt.glow, 0.22); g.fillRoundedRect(x - 6, y - 6, w + 12, h + 12, r + 6); }
    g.fillStyle(opt.fill == null ? 0x07050f : opt.fill, opt.alpha == null ? 0.6 : opt.alpha);
    g.fillRoundedRect(x, y, w, h, r);
    if (opt.tint != null) { g.fillStyle(opt.tint, 0.18); g.fillRoundedRect(x, y, w, h, r); }
    g.lineStyle(opt.lw || (h > 80 ? 3 : 2.5), opt.line || 0xffffff, opt.lineA == null ? 0.95 : opt.lineA);
    g.strokeRoundedRect(x, y, w, h, r);
    if (opt.inner !== false && h > 70 && w > 70) {
      g.lineStyle(1, opt.line || 0xffffff, 0.2); g.strokeRoundedRect(x + 6, y + 6, w - 12, h - 12, Math.max(2, r - 5));
    }
    const s = opt.gem == null ? Phaser.Math.Clamp(Math.min(w, h) * 0.07, 4, 8) : opt.gem;
    if (s) cornerGems(g, x + 1, y + 1, w - 2, h - 2, s, opt.gemCol);
    return g;
  }
  function nightFrame(scene, x, y, w, h, opt = {}) { return frameDraw(scene.add.graphics(), x, y, w, h, opt); }

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
    objs.push(scene.add.rectangle(0, 0, w, h, 0x0a0c22, opts.dim == null ? 0.3 : opts.dim).setOrigin(0));
    return objs;
  }

  // スマホなら全画面＆縦向き固定を試みる（できない端末では何もしない）
  const isMobile = () => window.matchMedia && window.matchMedia('(pointer: coarse)').matches && Math.min(screen.width, screen.height) < 820;
  // ---------- スマホは横画面に固定 ----------
  // 縦に持っているときは #vp を90度まわして横画面として表示する。
  // 大きさ（倍率）はどの画面でも同じ：スマホは高さ480相当に固定（タイトル・ロビー・プレイ中で大きさが変わらない）
  const VP = { rot: false, f: 1, iw: 0, phone: false };
  const PHONE_H = 420;
  const phoneDev = () => !!(window.matchMedia && matchMedia('(pointer: coarse)').matches) && Math.min(innerWidth, innerHeight) < 520;
  function applyViewport() {
    const el = document.getElementById('vp');
    if (!el) return;
    const iw = window.innerWidth, ih = window.innerHeight, phone = phoneDev();
    VP.rot = phone && ih > iw; VP.iw = iw;
    const sw = VP.rot ? ih : iw, sh = VP.rot ? iw : ih;
    VP.phone = phone;
    VP.f = phone ? Math.max(1, PHONE_H / sh) : 1;
    const s = el.style;
    s.width = Math.round(sw * VP.f) + 'px'; s.height = Math.round(sh * VP.f) + 'px';
    const sc = VP.f !== 1 ? ` scale(${1 / VP.f})` : '';
    s.transform = VP.rot ? `translate(${iw}px,0) rotate(90deg)${sc}` : (sc ? sc.trim() : 'none');
    if (window.game && window.game.scale && window.game.scale.refresh) window.game.scale.refresh();
  }
  // Phaser に、まわした画面の大きさとタッチの位置を正しく伝える
  function attachViewport(game) {
    const sm = game.scale;
    sm.getParentBounds = function () {
      if (!this.parent) return false;
      const W = this.parent.offsetWidth, H = this.parent.offsetHeight; // まわす前の大きさ
      if (this.parentSize.width !== W || this.parentSize.height !== H) { this.parentSize.setSize(W, H); return true; }
      return false;
    };
    const im = game.input, orig = im.transformPointer;
    im.transformPointer = function (pointer, pageX, pageY, wasMove) {
      if (!VP.rot && VP.f === 1) return orig.call(this, pointer, pageX, pageY, wasMove);
      const sx = pageX - (window.scrollX || 0), sy = pageY - (window.scrollY || 0);
      const x = VP.rot ? sy * VP.f : sx * VP.f, y = VP.rot ? (VP.iw - sx) * VP.f : sy * VP.f;
      const p0 = pointer.position, p1 = pointer.prevPosition;
      p1.x = p0.x; p1.y = p0.y;
      const a = pointer.smoothFactor;
      if (!wasMove || a === 0) { p0.x = x; p0.y = y; } else { p0.x = x * a + p1.x * (1 - a); p0.y = y * a + p1.y * (1 - a); }
    };
    applyViewport();
    setTimeout(applyViewport, 300);
  }
  window.addEventListener('resize', () => applyViewport());
  // 向きを変えた直後は画面の大きさがまだ変わっていないことがあるので、少し待ってからも合わせ直す
  window.addEventListener('orientationchange', () => { setTimeout(applyViewport, 120); setTimeout(applyViewport, 500); });
  applyViewport();
  // 画面の上に出したパネルを押したとき、後ろのボタンが反応しないように：しばらくゲームの入力を止める
  function pauseInput(scene, ms) {
    if (!scene || !scene.input) return;
    scene.input.enabled = false;
    scene.time.delayedCall(ms || 250, () => { if (scene.sys && scene.sys.isActive()) scene.input.enabled = true; });
  }
  // HTMLのパネル（名前入力・ご意見）を開いている間は、後ろのゲーム画面に操作を伝えない
  function guardDom(wrap) {
    const g = window.game;
    if (g && g.input) g.input.enabled = false;
    ['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'touchstart', 'touchend', 'click'].forEach(t => wrap.addEventListener(t, e => e.stopPropagation()));
    const obs = new MutationObserver(() => {
      if (wrap.isConnected) return;
      obs.disconnect();
      setTimeout(() => { if (g && g.input && !document.querySelector('#nameEditor, #fbPanel')) g.input.enabled = true; }, 250);
    });
    obs.observe(wrap.parentNode || document.body, { childList: true });
  }
  // 画面に重ねるHTML（名前入力・ご意見・チャット）を置く場所。まわした画面と一緒にまわる
  const domRoot = () => document.getElementById('vp') || document.body;

  // 画面の向きを固定（できる端末だけ。全画面のときのみ効く）
  function lockOrient(o) {
    try { if (screen.orientation && screen.orientation.lock) screen.orientation.lock(o).catch(() => {}); } catch (e) { /* noop */ }
  }
  // スマホ：全画面にして向きを固定（メニューは縦、プレイ中は横）
  function mobileEnter(orient) {
    if (!isMobile()) return;
    const o = orient || 'landscape';
    try {
      const el = document.documentElement;
      const p = !document.fullscreenElement && el.requestFullscreen ? el.requestFullscreen({ navigationUI: 'hide' }) : null;
      if (p && p.then) p.then(() => lockOrient(o)).catch(() => {}); else lockOrient(o);
    } catch (e) { /* noop */ }
  }
  // プレイ中かどうか（スマホはプレイ中だけ横画面）
  function setPlaying(on) {
    document.body.classList.toggle('playing', !!on);
    applyViewport();
  }

  window.UI = { FONT, DISPLAY, BRUSH, C, T, TO, TB, TR, panel, button, nightFrame, frameDraw, cornerGems, keyNav, forestBackdrop, isMobile, mobileEnter, lockOrient, setPlaying, applyViewport, attachViewport, domRoot, VP, pauseInput, guardDom };
})();
