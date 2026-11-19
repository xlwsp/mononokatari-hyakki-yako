// 起動・タイトル（モンスター選び）・やられた画面
(function () {
  'use strict';
  const { T, TO, TB, C, panel, button, keyNav, forestBackdrop } = UI;

  const store = {
    get(k, d) { try { const v = localStorage.getItem('nakama_' + k); return v == null ? d : v; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('nakama_' + k, v); } catch (e) { /* noop */ } },
  };
  window.Store = store;

  // 累計獲得EXPとモンスターの解放（この端末に保存）
  const Unlock = {
    total: parseInt(store.get('texp', '0'), 10) || 0,
    lastTx: 0, saveAt: 0, dirty: false,
    ok(k) { return this.total >= (GD.UNLOCK_AT[k] || 0); },
    next() { return GD.UNLOCKS.find(([, v]) => v > this.total) || null; },
    // サーバーから届く「今の命で稼いだEXP」を足していく。新しく解放されたモンスターを返す
    track(tx) {
      if (this.lastTx < 0) { this.lastTx = tx; return null; } // 続きから：セーブ済みの分は数えない
      if (tx < this.lastTx) this.lastTx = 0; // 再出撃で0に戻った
      const d = tx - this.lastTx;
      this.lastTx = tx;
      if (d <= 0) return null;
      const before = this.total;
      this.total += d; this.dirty = true;
      const now = performance.now();
      if (now - this.saveAt > 1000) { this.save(); this.saveAt = now; }
      const got = GD.UNLOCKS.find(([, v]) => v > before && v <= this.total);
      return got ? got[0] : null;
    },
    reset(cont) { this.lastTx = cont ? -1 : 0; },
    save() {
      if (!this.dirty) return; // 増えていないときは書かない（他のタブの値を消さないように）
      this.dirty = false;
      const saved = parseInt(store.get('texp', '0'), 10) || 0;
      store.set('texp', String(Math.floor(Math.max(saved, this.total))));
    },
  };
  window.Unlock = Unlock;
  window.addEventListener('beforeunload', () => Unlock.save());

  // 解放状況の表示（累計EXPと、次のモンスターまで）
  function unlockInfo(scene, cx, y, width) {
    const nx = Unlock.next();
    const tot = Math.floor(Unlock.total);
    scene.add.text(cx, y, `累計獲得EXP  ${tot.toLocaleString()}`, TO(17, '#ffe07a', '#4a3a2e', 5)).setOrigin(0.5, 0);
    const bw = Math.min(300, width - 40), bx = cx - bw / 2, by = y + 26;
    const g = scene.add.graphics();
    g.fillStyle(0x3a2a20, 0.85); g.fillRoundedRect(bx, by, bw, 12, 6);
    if (nx) {
      const prev = [...GD.UNLOCKS].reverse().find(([, v]) => v <= tot);
      const p0 = prev ? prev[1] : 0, r = Phaser.Math.Clamp((tot - p0) / (nx[1] - p0), 0, 1);
      if (r > 0) { g.fillStyle(0xffc94a, 1); g.fillRoundedRect(bx, by, Math.max(12, bw * r), 12, 6); }
      scene.add.text(cx, by + 16, `あと ${(nx[1] - tot).toLocaleString()} EXP で「${GD.SPECIES[nx[0]].name}」解放（${nx[1].toLocaleString()} EXP）`, T(12, C.soft)).setOrigin(0.5, 0);
    } else {
      g.fillStyle(0xffc94a, 1); g.fillRoundedRect(bx, by, bw, 12, 6);
      scene.add.text(cx, by + 16, '全モンスター解放済み！', T(12, C.soft)).setOrigin(0.5, 0);
    }
    return 50;
  }
  // タイトル画面の背景：物置の絵。ロビーではツボに寄って暗くぼかし、妖気がただよう
  const TBG = { w: 1600, h: 900, potX: 770, potY: 610 };
  function titleBackdrop(scene, zoomed) {
    const w = scene.scale.width, h = scene.scale.height;
    const cover = Math.max(w / TBG.w, h / TBG.h);
    const objs = [];
    scene.cameras.main.setBackgroundColor('#0c0816');
    if (zoomed) {
      const sc = cover * 1.9;
      const img = scene.add.image(w / 2 + (TBG.w / 2 - TBG.potX) * sc, h * 0.5 + (TBG.h / 2 - TBG.potY) * sc, 'title_bg').setScale(sc);
      if (img.preFX) img.preFX.addBlur(1, 2, 2, 1.2);
      objs.push(img);
      objs.push(scene.add.rectangle(0, 0, w, h, 0x0a0614, 0.5).setOrigin(0));
      // ツボからただよう妖気
      for (let i = 0; i < 14; i++) {
        const c = scene.add.circle(Phaser.Math.Between(0, w), h + 20, Phaser.Math.Between(3, 8), Phaser.Math.RND.pick([0xb070ff, 0x8a5aff, 0xffd090]), 0.5).setBlendMode('ADD');
        scene.tweens.add({ targets: c, y: -30, x: c.x + Phaser.Math.Between(-80, 80), alpha: 0, duration: Phaser.Math.Between(6000, 11000), delay: Phaser.Math.Between(0, 8000), repeat: -1 });
        objs.push(c);
      }
    } else {
      // ロゴが切れないように（縦長の画面では横幅に合わせ、すき間はぼかした絵でうめる）
      const sc = Math.max(Math.min(w / TBG.w, h / TBG.h), Math.min(cover, w / 980));
      if (sc < cover) {
        const back = scene.add.image(w / 2, h / 2, 'title_bg').setScale(cover * 1.05);
        if (back.preFX) back.preFX.addBlur(1, 3, 3, 1.5);
        objs.push(back, scene.add.rectangle(0, 0, w, h, 0x0a0614, 0.6).setOrigin(0));
      }
      const img = scene.add.image(w / 2, h / 2, 'title_bg').setScale(sc);
      objs.push(img);
      objs.bottom = h / 2 + TBG.h / 2 * sc;
    }
    return objs;
  }
  const V = () => (window.GV && window.GV !== '__VERSION__' ? '?v=' + window.GV : '');

  // モンスター選びのグリッド（タイトルとやられた画面で共通）
  const PICK_KEYS = () => GD.UNLOCKS.map(u => u[0]);
  function monsterPicker(scene, cx, top, width, sel, onPick) {
    const keys = PICK_KEYS();
    const cols = width < 420 ? 5 : 7;
    const size = Math.min(58, Math.floor((width - 10) / cols) - 8);
    const gap = Math.floor((width - cols * size) / (cols + 1));
    const objs = [];
    const items = keys.map((k, i) => {
      const col = i % cols, row = Math.floor(i / cols);
      const rowCount = Math.min(cols, keys.length - row * cols);
      const rowW = rowCount * size + (rowCount - 1) * gap;
      const x = cx - rowW / 2 + size / 2 + col * (size + gap);
      const y = top + size / 2 + row * (size + gap);
      const ring = scene.add.circle(x, y, size / 2 + 4, 0xffd76a).setVisible(false);
      const bg = scene.add.circle(x, y, size / 2, 0xfff6dc).setStrokeStyle(3, C.brown);
      const ic = scene.add.image(x, y, 'ic_' + k);
      ic.setScale((size - 4) / ic.height);
      const zone = scene.add.zone(x, y, size + 6, size + 6).setInteractive({ useHandCursor: true });
      zone.on('pointerdown', () => { Sfx.init(); Sfx.play('click'); onPick(k); });
      objs.push(ring, bg, ic, zone);
      if (!Unlock.ok(k)) { // まだ解放されていない：暗くしてカギ
        ic.setTint(0x222222);
        const dark = scene.add.circle(x, y, size / 2, 0x000000, 0.35);
        const lock = scene.add.text(x, y - 4, '🔒', { fontSize: Math.round(size * 0.36) + 'px' }).setOrigin(0.5);
        const need = scene.add.text(x, y + size * 0.3, (GD.UNLOCK_AT[k] / 1000) + 'k', TO(11, '#ffe07a', '#2a1f18', 3)).setOrigin(0.5);
        objs.push(dark, lock, need);
      }
      return { k, ring, ic, x, y };
    });
    const rows = Math.ceil(keys.length / cols);
    const api = {
      height: rows * size + (rows - 1) * gap,
      cols,
      set(k) {
        items.forEach(it => {
          const on = it.k === k;
          it.ring.setVisible(on);
          scene.tweens.killTweensOf(it.ic);
          it.ic.setScale((size - 4) / it.ic.height * (on ? 1.12 : 1));
        });
      },
      destroy() { objs.forEach(o => o.destroy()); },
    };
    api.set(sel);
    return api;
  }

  function speciesInfo(sp) {
    const d = GD.SPECIES[sp];
    if (!Unlock.ok(sp)) return { title: `🔒 ${d.name}（${d.role}）`, line: `累計獲得EXP ${GD.UNLOCK_AT[sp].toLocaleString()} で解放\nスキル【${d.skill.name}】${d.skill.desc}` };
    return { title: `${d.name}（${d.role}）`, line: `スキル【${d.skill.name}】${d.skill.desc}\n特性【${d.trait.name}】${d.trait.desc}` };
  }

  // ---------------- Boot ----------------
  class BootScene extends Phaser.Scene {
    constructor() { super('Boot'); }
    preload() {
      const w = this.scale.width, h = this.scale.height;
      this.cameras.main.setBackgroundColor('#5d8f4a');
      const label = this.add.text(w / 2, h / 2 - 30, 'よみこみ中…', TO(26)).setOrigin(0.5);
      const bar = this.add.graphics();
      this.load.on('progress', v => {
        bar.clear();
        bar.fillStyle(0x000000, 0.25); bar.fillRoundedRect(w / 2 - 160, h / 2, 320, 18, 9);
        bar.fillStyle(C.cream, 1); bar.fillRoundedRect(w / 2 - 160, h / 2, 320 * v, 18, 9);
      });
      this.load.on('loaderror', f => { label.setText('読み込みエラー: ' + f.src); });
      for (const k of ['tree1', 'tree2', 'tree3', 'rock', 'bush', 'flower1', 'flower2', 'bigboss']) {
        this.load.image(k, 'assets/' + k + '.png' + V());
      }
      this.load.image('title_bg', 'assets/title_bg.jpg' + V());
      for (const k of GD.SPECIES_KEYS) {
        for (const suf of ['', '_e']) {
          this.load.image('cr_' + k + suf, 'assets/cr_' + k + suf + '.png' + V());
          this.load.image('ic_' + k + suf, 'assets/ic_' + k + suf + '.png' + V());
        }
      }
    }
    create() {
      Tex.makeAll(this);
      this.scene.start('Title');
    }
  }

  // ---------------- Title ----------------
  class TitleScene extends Phaser.Scene {
    constructor() { super('Title'); }
    init(data) {
      this.notice = data && data.msg;
      if (!(data && data.keep)) this.saveData = undefined; // 画面の向きが変わっただけのときは確認し直さない
      this.confirmBox = null; this.nameAsk = null; this.rankBox = null; this.shopBox = null; this.maintBox = null; this.splash = null;
    }
    create() {
      this.sp = store.get('sp', 'gekomaru');
      if (!GD.SPECIES[this.sp] || !Unlock.ok(this.sp)) this.sp = 'gekomaru';
      this.connecting = false;
      this.build();
      this.onResize = () => { this.saveName(); this.scene.restart({ msg: this.msgText && this.msgText.text, keep: true }); };
      this.scale.on('resize', this.onResize);
      this.onKey = e => {
        const ae = document.activeElement;
        if (ae && ae.tagName === 'INPUT') return;
        if (this.rankBox || this.confirmBox || this.nameAsk || this.shopBox || this.maintBox || this.splash) return;
        const keys = PICK_KEYS(), i = keys.indexOf(this.sp), cols = this.picker.cols;
        const move = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -cols, ArrowDown: cols }[e.key];
        if (move) { this.pick(keys[(i + move + keys.length) % keys.length]); Sfx.init(); Sfx.play('click'); }
        else if (e.key === 'Enter' || e.key === ' ') this.go();
      };
      this.input.keyboard.on('keydown', this.onKey);
      this.events.once('shutdown', () => { this.scale.off('resize', this.onResize); this.saveName(); });
    }
    saveName() { if (this.input_ && this.input_.node) store.set('name', this.input_.node.value); }
    getName() {
      const v = (this.input_ && this.input_.node.value || '').trim();
      return (v || 'ゆうしゃ').slice(0, 12);
    }
    pick(k) {
      this.sp = k;
      if (Unlock.ok(k)) store.set('sp', k);
      this.picker.set(k);
      const info = speciesInfo(k);
      this.infoTitle.setText(info.title);
      this.infoLine.setText(info.line);
      if (this.preview) {
        this.preview.setTexture('cr_' + k).setTint(Unlock.ok(k) ? 0xffffff : 0x111111);
        const s = this.previewH / this.preview.height;
        this.preview.setScale(s * 0.6);
        this.tweens.add({ targets: this.preview, scale: s, duration: 260, ease: 'Back.out' });
      }
    }

    build() {
      const w = this.scale.width, h = this.scale.height;
      titleBackdrop(this, true);
      const wide = w > 900;
      const s = Math.min(1, w / 1000, h / 720);

      // 選んだモンスターを大きく
      if (wide) {
        this.previewH = Math.min(h * 0.5, 320);
        this.add.image(w * 0.83, h * 0.78, 'shadow').setDisplaySize(260, 60).setAlpha(0.8);
        this.preview = this.add.image(w * 0.83, h * 0.8, 'cr_' + this.sp).setOrigin(0.5, 1);
        this.preview.setScale(this.previewH / this.preview.height);
        this.tweens.add({ targets: this.preview, y: h * 0.8 - 8, duration: 1400, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
      }

      const cx = wide ? w * 0.4 : w / 2;
      const logoY = Math.max(48, h * 0.1);
      // ロゴ（タイトル絵と同じ、古い紙のような金色の筆文字）
      const logo = this.add.text(cx, logoY, 'モノノカタリ', TB(64 * s + 10, '#f8e6bc', '#2a160a', 8 * s + 3)).setOrigin(0.5);
      this.tweens.add({ targets: logo, scale: 1.03, duration: 1400, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
      this.add.text(cx, logoY + 40 * s + 18, '― 百鬼夜行 ―', TB(22 * s + 8, '#e0c0ff', '#1a0a2a', 4)).setOrigin(0.5);

      // メニューパネル
      const pw = Math.min(560, w - 20);
      const py = logoY + 60 * s + 34;
      const gridTop = py + 84;
      // 先にピッカーの高さを測るため仮配置
      const tmp = monsterPicker(this, cx, -9999, pw - 30, this.sp, () => {});
      const gridH = tmp.height; tmp.destroy();
      const ph = 84 + gridH + 150 + 74;
      // 古い紙のようなパネル＋金のフチ
      panel(this, cx - pw / 2, py, pw, ph, { color: 0xf6ead0, alpha: 0.95, border: 0x8a5a1a, borderW: 4, shadow: 0.5 });
      this.add.graphics().lineStyle(1.5, 0xc89a4a, 0.8).strokeRoundedRect(cx - pw / 2 + 6, py + 6, pw - 12, ph - 12, 13);
      const BR = (sz, col) => T(sz, col, { fontFamily: UI.BRUSH, fontStyle: 'normal' });
      this.add.text(cx - pw / 2 + 22, py + 16, 'なまえ', BR(19, '#5a3a1a'));
      const inputW = pw - 120;
      this.input_ = this.add.dom(cx - pw / 2 + 92 + inputW / 2, py + 30, 'input', [
        `width:${inputW}px`, 'height:40px', 'box-sizing:border-box', 'border-radius:12px', 'border:3px solid #4a3a2e',
        'background:#fff', 'padding:0 12px', `font-family:${UI.FONT}`, 'font-weight:800', 'font-size:18px', 'color:#4a3a2e', 'outline:none',
      ].join(';'));
      this.input_.node.maxLength = 12;
      this.input_.node.placeholder = 'ゆうしゃ';
      this.input_.node.value = store.get('name', '');
      this.input_.node.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') this.input_.node.blur(); });

      this.add.text(cx, py + 66, '― 妖怪をえらぶ ―', BR(17, '#5a3a1a')).setOrigin(0.5);
      this.picker = monsterPicker(this, cx, gridTop, pw - 30, this.sp, k => this.pick(k));
      const infoY = gridTop + gridH + 12;
      this.infoTitle = this.add.text(cx, infoY, '', T(17, C.brownCss)).setOrigin(0.5, 0);
      this.infoLine = this.add.text(cx, infoY + 24, '', T(12, C.soft, { align: 'center', wordWrap: { width: pw - 30, useAdvancedWrap: true } })).setOrigin(0.5, 0);
      unlockInfo(this, cx, py + ph - 146, pw);
      this.goBtn = null;
      // 続きから（オートセーブ）／初めから
      const bw = Math.min(240, (pw - 50) / 2), by = py + ph - 60;
      this.contBtn = button(this, cx - bw / 2 - 8, by, bw, 56, '続きから', () => this.go(true), { color: 0xd0503e, dark: 0x7a2418, size: 26, brush: true });
      this.newBtn = button(this, cx + bw / 2 + 8, by, bw, 56, '初めから', () => this.goNew(), { color: 0x6a54b0, dark: 0x352668, size: 26, brush: true });
      this.contInfo = this.add.text(cx - bw / 2 - 8, by + 36, '確認中…', T(12, C.soft)).setOrigin(0.5, 0);
      this.add.text(cx + bw / 2 + 8, by + 36, '選んだモンスターでLv1から', T(12, C.soft)).setOrigin(0.5, 0);
      this.setSave(this.saveData === undefined ? null : this.saveData, this.saveData === undefined);
      if (this.saveData === undefined) {
        Net.saveInfo().then(d => { this.saveData = d; if (this.sys.isActive()) this.setSave(d); })
          .catch(() => { this.saveData = null; if (this.sys.isActive()) { this.setSave(null, false, true); this.showMaint(); } });
      }
      this.pick(this.sp);

      this.msgText = this.add.text(cx, py + ph + 20, this.notice || '', TO(15, '#fff', '#4a3a2e', 4)).setOrigin(0.5);
      const narrow = w < 500;
      if (py + ph + 70 < h && !(narrow && py + ph + 120 > h)) {
        const help = pw < 480
          ? 'ドラッグで移動・攻撃とスキルは自動！\nレベルアップ → Lv30で進化！\n他のプレイヤーには体当たりで攻撃'
          : '移動: WASD / 矢印 / ドラッグ　攻撃とスキルは自動！\n敵を倒してレベルアップ → Lv30で進化！ 他のプレイヤーには体当たりで攻撃';
        this.add.text(cx, py + ph + (narrow ? 34 : 44), help, T(12, '#fff8ea', { align: 'center', stroke: '#2a1f18', strokeThickness: 3 })).setOrigin(0.5, 0);
      }
      const best = parseInt(store.get('best', '0'), 10) || 0;
      this.add.text(w - 12, 10, `ベストスコア  ${best.toLocaleString()}`, TO(16, '#ffe7a8', '#4a3a2e', 4)).setOrigin(1, 0);
      // ガチャポイント
      this.ptsText = this.add.text(w - 12, 34, '', TO(15, '#7ae8ff', '#1a2a40', 4)).setOrigin(1, 0);
      this.refreshPts();
      // ランキング・ガチャ・装備（スマホは画面の下に横並び、PCは左上に縦並び）
      const menu = [
        ['🏆 ランキング', () => this.showRanking(), 0xf0b030, 0xb07a18],
        ['🎲 ガチャ', () => this.openShop('gacha'), 0xef7a6a, 0xb24a3e],
        ['🛡 装備', () => this.openShop('equip'), 0x6fb6e8, 0x3f7fae],
      ];
      menu.forEach(([label, fn, col, dark], i) => {
        if (narrow) {
          const bw = (w - 24) / 3 - 6;
          button(this, 12 + bw / 2 + i * (bw + 9), h - 30, bw, 38, label, fn, { color: col, dark, size: 15 });
        } else {
          button(this, 86, 30 + i * 52, 148, 42, label, fn, { color: col, dark, size: 18 });
        }
      });
      if (!window.__titleSeen && !this.notice) this.showSplash();
      if (this.notice && /メンテナンス/.test(this.notice)) this.showMaint();
      else Net.ping().then(r => { if (r && r.maint && this.sys.isActive()) this.showMaint(); }).catch(() => {});
    }

    // ハイスコアランキング（全期間・人のプレイヤーだけ・1人1つの自己ベスト）
    showRanking() {
      if (this.rankBox || this.nameAsk || this.confirmBox || this.connecting) return;
      const w = this.scale.width, h = this.scale.height;
      const pw = Math.min(520, w - 20), ph = Math.min(h - 30, 660), x = w / 2 - pw / 2, y = h / 2 - ph / 2;
      const objs = [];
      const dim = this.add.rectangle(0, 0, w, h, 0x1d1020, 0.65).setOrigin(0).setInteractive().setDepth(60);
      const box = this.add.container(0, 0).setDepth(61);
      objs.push(dim, box);
      box.add(panel(this, x, y, pw, ph, { alpha: 1 }));
      box.add(this.add.text(w / 2, y + 32, '🏆 ハイスコアランキング', TO(w < 500 ? 22 : 28, '#ffe07a', '#4a3a2e', 6)).setOrigin(0.5));
      const status = this.add.text(w / 2, y + ph / 2, '読み込み中…', T(16, C.soft)).setOrigin(0.5);
      box.add(status);
      this.hideInput(true);
      const close = () => { objs.forEach(o => o.destroy()); this.rankBox = null; this.input.keyboard.off('keydown', onKey); this.hideInput(false); };
      const onKey = e => { if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') close(); };
      this.time.delayedCall(250, () => this.rankBox && this.input.keyboard.on('keydown', onKey));
      const btn = button(this, w / 2, y + ph - 34, 160, 44, 'とじる', close, { color: C.gray, dark: C.grayDark, size: 18 }).setDepth(62);
      objs.push(btn);
      box.setScale(0.7).setAlpha(0);
      this.tweens.add({ targets: box, scale: 1, alpha: 1, duration: 220, ease: 'Back.out' });
      this.rankBox = { close };
      const medal = ['#f7c948', '#c9d3dc', '#d99a5b'];
      Net.highScores().then(d => {
        if (!this.rankBox || !status.active) return;
        const list = (d && d.list) || [];
        if (!list.length) { status.setText('まだ記録がありません\nいちばん乗りをめざそう！').setAlign('center'); return; }
        status.destroy();
        const top = y + 64, bottom = y + ph - 100;
        const rowH = Math.max(22, Math.min(30, Math.floor((bottom - top) / list.length)));
        const n = Math.min(list.length, Math.floor((bottom - top) / rowH));
        const fs = rowH >= 28 ? 16 : 14, isz = rowH - 4;
        for (let i = 0; i < n; i++) {
          const r = list[i], ry = top + i * rowH + rowH / 2;
          if (r.me) box.add(this.add.rectangle(w / 2, ry, pw - 24, rowH - 2, 0xffe07a, 0.55));
          else if (i % 2 === 0) box.add(this.add.rectangle(w / 2, ry, pw - 24, rowH - 2, 0x4a3a2e, 0.06));
          const rc = i < 3 ? medal[i] : C.brownCss;
          box.add(this.add.text(x + 34, ry, String(i + 1), i < 3 ? TO(fs + 2, rc, '#4a3a2e', 4) : T(fs, rc)).setOrigin(0.5));
          if (GD.SPECIES[r.sp]) {
            const key = 'ic_' + r.sp + (r.ev ? '_e' : '');
            const ic = this.add.image(x + 66, ry, this.textures.exists(key) ? key : 'ic_' + r.sp);
            ic.setScale(isz / ic.height);
            box.add(ic);
          }
          const nm = this.add.text(x + 86, ry, r.n, T(fs, C.brownCss)).setOrigin(0, 0.5);
          const room = pw - 150 - 86 - 8;
          while (nm.width > room && nm.text.length > 1) nm.setText(nm.text.slice(0, -2) + '…');
          box.add(nm);
          box.add(this.add.text(x + pw - 150, ry, 'Lv' + r.lv, T(fs - 2, C.soft)).setOrigin(0, 0.5));
          box.add(this.add.text(x + pw - 20, ry, Number(r.sc).toLocaleString(), T(fs, C.brownCss)).setOrigin(1, 0.5));
        }
        const m = d.mine;
        const mine = m ? `あなたの自己ベスト：${m.rank}位 / ${d.total}人　${Number(m.sc).toLocaleString()}` : 'あなたの記録はまだありません';
        box.add(this.add.text(w / 2, y + ph - 78, mine, T(14, C.brownCss)).setOrigin(0.5));
      }).catch(() => { if (status.active) status.setText('サーバーにつながりません'); });
    }

    msg(s) { this.msgText.setText(s); }

    refreshPts() {
      Net.profile().then(p => { if (this.ptsText && this.ptsText.active) this.ptsText.setText(`ガチャポイント  ${p.pts}P`); }).catch(() => {});
    }
    openShop(kind) {
      if (this.rankBox || this.confirmBox || this.nameAsk || this.connecting || this.shopBox || this.maintBox) return;
      if (kind === 'gacha') Shop.openGacha(this); else Shop.openEquip(this);
    }

    // メンテナンス中：遊べないようにして、終わったら自動で最新版を読み込み直す
    // 最初に開いたときだけ：タイトルの絵を大きく見せる。タップでロビーへ
    showSplash() {
      const w = this.scale.width, h = this.scale.height;
      const objs = titleBackdrop(this, false);
      const subY = Math.min(h * 0.8, objs.bottom + 40), s = Math.min(1, w / 700);
      const sub = this.add.text(w / 2, subY, '― 百 鬼 夜 行 ―', TB(40 * s + 14, '#e8c8ff', '#1a0a2a', 6)).setOrigin(0.5).setAlpha(0);
      const tap = this.add.text(w / 2, Math.min(h - 30, subY + 52 * s + 26), UI.isMobile() ? 'タップしてはじめる' : 'クリック / Enter ではじめる', TB(20 * s + 8, '#fbeccb', '#2a160a', 4)).setOrigin(0.5).setAlpha(0);
      objs.push(sub, tap);
      this.tweens.add({ targets: sub, alpha: 1, duration: 1200, delay: 300 });
      this.tweens.add({ targets: tap, alpha: { from: 0.25, to: 1 }, duration: 900, delay: 1200, yoyo: true, repeat: -1 });
      const all = this.add.container(0, 0, objs).setDepth(100);
      const zone = this.add.zone(0, 0, w, h).setOrigin(0).setInteractive().setDepth(101);
      this.hideInput(true);
      this.splash = { close: () => {
        if (!this.splash) return;
        this.splash = null;
        window.__titleSeen = true;
        this.input.keyboard.off('keydown', onKey);
        zone.destroy();
        this.hideInput(false);
        this.tweens.add({ targets: all, alpha: 0, scale: 1.15, x: -w * 0.075, y: -h * 0.075, duration: 450, ease: 'Quad.in', onComplete: () => all.destroy() });
      } };
      const go = () => { Sfx.init(); Sfx.play('click'); UI.mobileEnter(); this.splash && this.splash.close(); };
      const onKey = e => { if (e.key === 'Enter' || e.key === ' ') go(); };
      zone.on('pointerdown', go);
      this.time.delayedCall(200, () => this.splash && this.input.keyboard.on('keydown', onKey));
    }

    showMaint() {
      if (this.splash) this.splash.close();
      if (this.maintBox) return;
      const w = this.scale.width, h = this.scale.height;
      const objs = [];
      objs.push(this.add.rectangle(0, 0, w, h, 0x10081a, 0.82).setOrigin(0).setInteractive().setDepth(90));
      const pw = Math.min(460, w - 30), ph = 220;
      objs.push(panel(this, w / 2 - pw / 2, h / 2 - ph / 2, pw, ph, { alpha: 1 }).setDepth(91));
      objs.push(this.add.text(w / 2, h / 2 - 62, '🔧 メンテナンス中', TO(30, '#ffe07a', '#4a3a2e', 7)).setOrigin(0.5).setDepth(92));
      objs.push(this.add.text(w / 2, h / 2 - 6, 'ゲームを更新しています。\n終わると自動で始められるようになります。\n（セーブは消えません）', T(15, C.brownCss, { align: 'center', lineSpacing: 4 })).setOrigin(0.5).setDepth(92));
      const dots = this.add.text(w / 2, h / 2 + 66, '', T(16, C.soft)).setOrigin(0.5).setDepth(92);
      objs.push(dots);
      this.hideInput(true);
      let n = 0;
      const anim = this.time.addEvent({ delay: 400, loop: true, callback: () => dots.setText('待っています' + '.'.repeat(++n % 4)) });
      // 数秒ごとにサーバーをのぞいて、メンテナンスが終わったら最新版を読み込み直す
      const check = () => {
        Net.ping().then(r => {
          if (!this.maintBox) return;
          if (r && !r.maint) { dots.setText('メンテナンス終了！ 読み込み中…'); setTimeout(() => location.reload(), 600); return; }
          this.maintTimer = setTimeout(check, 4000);
        }).catch(() => { if (this.maintBox) this.maintTimer = setTimeout(check, 4000); });
      };
      this.maintTimer = setTimeout(check, 3000);
      this.maintBox = { objs, anim };
      this.events.once('shutdown', () => { clearTimeout(this.maintTimer); this.maintBox = null; });
    }
    // 名前の入力欄は画面のいちばん上に出てしまうので、ウィンドウを開いている間は隠す
    hideInput(v) { if (this.input_ && this.input_.node) this.input_.node.style.visibility = v ? 'hidden' : 'visible'; }

    // 続きからのデータの表示
    setSave(d, checking, failed) {
      if (!this.contBtn || !this.contBtn.active || !this.contInfo.active) return; // 画面が作り直された後に届いたとき
      this.contBtn.setDisabled(!d);
      if (checking) { this.contInfo.setText('セーブを確認中…'); this.contBtn.setDisabled(true); return; }
      if (d) {
        const sp = GD.SPECIES[d.sp];
        this.contInfo.setText(`${d.ev ? sp.evoName : sp.name}  Lv${d.lv}`);
        this.contTween = this.contTween || this.tweens.add({ targets: this.contBtn, scale: 1.04, duration: 700, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
      } else {
        this.contInfo.setText(failed ? 'サーバーにつながりません' : 'セーブデータなし');
        if (!failed) this.tweens.add({ targets: this.newBtn, scale: 1.04, duration: 700, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
      }
    }

    // 初めから：セーブがあるときは確認する
    goNew() {
      if (this.connecting || this.nameAsk || this.confirmBox) return;
      if (!Unlock.ok(this.sp)) { this.go(false); return; }
      if (!this.saveData) { this.go(false); return; }
      const w = this.scale.width, h = this.scale.height;
      const pw = Math.min(420, w - 30), ph = 190, x = w / 2 - pw / 2, y = h / 2 - ph / 2;
      const sp = GD.SPECIES[this.saveData.sp];
      const dim = this.add.rectangle(0, 0, w, h, 0x1d1020, 0.6).setOrigin(0).setInteractive().setDepth(50);
      const box = this.add.container(0, 0).setDepth(51);
      box.add(panel(this, x, y, pw, ph, { alpha: 1 }));
      box.add(this.add.text(w / 2, y + 34, '初めからにする？', TO(24, '#fff8ea', '#4a3a2e', 6)).setOrigin(0.5));
      box.add(this.add.text(w / 2, y + 72, `今のセーブ（${this.saveData.ev ? sp.evoName : sp.name} Lv${this.saveData.lv}）は消えます`, T(14, '#c0392b', { align: 'center', wordWrap: { width: pw - 30 } })).setOrigin(0.5));
      this.hideInput(true);
      const close = () => { [dim, box, b1, b2].forEach(o => o.destroy()); this.confirmBox = null; this.hideInput(false); };
      const b1 = button(this, w / 2 - 80, y + ph - 44, 140, 48, '初めから', () => { close(); this.go(false); }, { color: C.blue, dark: C.blueDark, size: 20 }).setDepth(52);
      const b2 = button(this, w / 2 + 80, y + ph - 44, 140, 48, 'やめる', close, { color: C.gray, dark: C.grayDark, size: 20 }).setDepth(52);
      box.setScale(0.6).setAlpha(0);
      this.tweens.add({ targets: box, scale: 1, alpha: 1, duration: 220, ease: 'Back.out' });
      this.confirmBox = { close };
    }

    // 名前が空のまま始めようとしたら、名前を入れてもらうカットイン（空のままOKなら「ゆうしゃ」で始める）
    askName() {
      if (this.nameAsk) return;
      const w = this.scale.width, h = this.scale.height;
      const pw = Math.min(440, w - 30), ph = 210, x = w / 2 - pw / 2, y = h / 2 - ph / 2;
      const objs = [];
      const dim = this.add.rectangle(0, 0, w, h, 0x1d1020, 0.6).setOrigin(0).setInteractive().setDepth(50);
      const band = this.add.rectangle(w / 2, h / 2, w, ph + 40, 0xef7a6a, 0.95).setDepth(50).setScale(0, 1);
      const box = this.add.container(0, 0).setDepth(51);
      box.add(panel(this, x, y, pw, ph));
      box.add(this.add.text(w / 2, y + 34, 'なまえを入力してね！', TO(26, '#fff8ea', '#4a3a2e', 6)).setOrigin(0.5));
      box.add(this.add.text(w / 2, y + 66, 'ランキングに表示されます', T(13, C.soft)).setOrigin(0.5));
      const inp = this.add.dom(w / 2, y + 108, 'input', [
        `width:${pw - 60}px`, 'height:46px', 'box-sizing:border-box', 'border-radius:12px', 'border:3px solid #4a3a2e',
        'background:#fff', 'padding:0 12px', `font-family:${UI.FONT}`, 'font-weight:800', 'font-size:20px', 'color:#4a3a2e', 'outline:none', 'text-align:center',
      ].join(';')).setDepth(52);
      inp.node.maxLength = 12; inp.node.placeholder = 'ゆうしゃ';
      const ok = () => {
        const v = inp.node.value.trim();
        if (this.input_) this.input_.node.value = v || 'ゆうしゃ';
        this.nameAsked = true;
        close();
        this.go(this.goCont);
      };
      inp.node.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') ok(); });
      const btn = button(this, w / 2, y + ph - 36, 200, 48, 'OK', ok, { color: 0xef7a6a, dark: 0xb24a3e, size: 22 }).setDepth(52);
      objs.push(dim, band, box, inp, btn);
      box.setX(-w); btn.setAlpha(0); inp.setAlpha(0);
      this.tweens.add({ targets: band, scaleX: 1, duration: 220, ease: 'Cubic.out' });
      this.tweens.add({ targets: box, x: 0, duration: 380, delay: 120, ease: 'Back.out' });
      this.tweens.add({ targets: [btn, inp], alpha: 1, duration: 200, delay: 420, onComplete: () => inp.node.focus() });
      this.tweens.add({ targets: band, alpha: 0, duration: 300, delay: 500 });
      Sfx.play('card');
      this.hideInput(true);
      const close = () => { objs.forEach(o => o.destroy()); this.nameAsk = null; this.hideInput(false); };
      this.nameAsk = { close };
    }

    go(cont) {
      if (this.connecting || this.nameAsk || this.confirmBox || this.rankBox || this.shopBox || this.maintBox) return; // 連打で二重参加しないように
      if (cont === undefined) { if (this.saveData) cont = true; else { this.goNew(); return; } } // Enter キー
      this.goCont = cont;
      if (!this.nameAsked && !(this.input_ && this.input_.node.value.trim())) { this.askName(); return; }
      if (!cont && !Unlock.ok(this.sp)) { this.msg(`🔒 ${GD.SPECIES[this.sp].name} は累計 ${GD.UNLOCK_AT[this.sp].toLocaleString()} EXP で解放されます`); Sfx.play('click'); return; }
      this.connecting = true;
      Sfx.init();
      UI.mobileEnter();
      this.saveName();
      this.msg('接続中…');
      Net.connect(this.getName(), cont ? (this.saveData && this.saveData.sp) || this.sp : this.sp, cont).then(session => {
        if (cont && !session.cont) { session.leave(); this.connecting = false; this.saveData = null; this.setSave(null); this.msg('セーブデータが見つかりませんでした。「初めから」で遊んでね'); return; }
        this.scene.start('Game', { session });
      }).catch(e => {
        this.connecting = false;
        if (e.maint) { this.showMaint(); return; }
        this.msg(e.message || 'サーバーに接続できませんでした');
      });
    }
  }

  // ---------------- やられた画面（再出撃） ----------------
  class ResultScene extends Phaser.Scene {
    constructor() { super('Result'); }
    init(data) { this.d = data; }
    create() {
      const d = this.d, w = this.scale.width, h = this.scale.height;
      Unlock.save();
      this.sp = d.session.sp || store.get('sp', 'gekomaru');
      if (!Unlock.ok(this.sp)) this.sp = 'gekomaru';
      this.add.rectangle(0, 0, w, h, 0x1d1020, 0.55).setOrigin(0);
      const pw = Math.min(520, w - 20);
      const tmp = monsterPicker(this, w / 2, -9999, pw - 30, this.sp, () => {});
      const gridH = tmp.height; tmp.destroy();
      const ph = 200 + gridH + 110 + 56;
      const x = w / 2 - pw / 2, y = Math.max(10, h / 2 - ph / 2);
      panel(this, x, y, pw, ph);
      const title = this.add.text(w / 2, y + 38, 'やられた…', TO(40, '#c8d8ff', '#3a2a40', 8)).setOrigin(0.5).setScale(0.3);
      this.tweens.add({ targets: title, scale: 1, duration: 400, ease: 'Back.out' });
      Sfx.play('lose');
      const by = d.by ? `${d.by} に倒された` : '敵の群れにやられた';
      this.add.text(w / 2, y + 80, by, T(16, C.soft)).setOrigin(0.5);
      this.add.text(w / 2, y + 112, `スコア ${Number(d.sc || 0).toLocaleString()}　撃破 ${d.k || 0}　倒したプレイヤー ${d.pk || 0}`, T(16, C.brownCss)).setOrigin(0.5);
      const best = parseInt(store.get('best', '0'), 10) || 0;
      if ((d.sc || 0) > best) {
        store.set('best', d.sc);
        const nb = this.add.text(w / 2, y + 142, `ベストスコア更新！ ${Number(d.sc).toLocaleString()}`, TO(18, '#ffe07a', '#4a3a2e', 5)).setOrigin(0.5);
        this.tweens.add({ targets: nb, scale: 1.08, duration: 500, yoyo: true, repeat: -1 });
      }
      this.add.text(w / 2, y + 172, '次のモンスターをえらんで再出撃！', T(14, C.soft)).setOrigin(0.5);
      this.lockMsg = this.add.text(w / 2, y + 192 + gridH + 10, '', T(12, '#c0392b')).setOrigin(0.5, 0);
      this.picker = monsterPicker(this, w / 2, y + 192, pw - 30, this.sp, k => {
        if (!Unlock.ok(k)) { this.lockMsg.setText(`🔒 ${GD.SPECIES[k].name} は累計 ${GD.UNLOCK_AT[k].toLocaleString()} EXP で解放`); return; }
        this.lockMsg.setText(''); this.sp = k; store.set('sp', k); this.picker.set(k);
      });
      unlockInfo(this, w / 2, y + ph - 154, pw);
      const b1 = button(this, w / 2, y + ph - 70, Math.min(300, pw - 40), 50, '再出撃！', () => this.respawn(), { color: C.orange, dark: C.orangeDark, size: 22 });
      const b2 = button(this, w / 2, y + ph - 22, 140, 32, 'タイトルへ', () => this.toTitle(), { color: C.gray, dark: C.grayDark, size: 14 });
      keyNav(this, [b1, b2], { delay: 600 });
    }
    respawn() {
      this.d.session.respawn(this.sp);
      this.scene.stop();
    }
    toTitle() {
      this.d.session.leave();
      this.scene.stop('Game');
      this.scene.stop('UI');
      this.scene.start('Title');
    }
  }

  window.MenuScenes = { BootScene, TitleScene, ResultScene };
})();
