// 起動・タイトル（モンスター選び）・やられた画面
(function () {
  'use strict';
  const { T, TO, TB, TR, C, panel, button, keyNav, forestBackdrop, nightFrame } = UI;

  // 名前の入力パネル：ゲーム画面（Phaser）とは別の、ふつうのWebページの入力欄。
  // 画面サイズが変わっても（スマホのキーボードが出ても）消えない。日本語の変換中の Enter では閉じない
  function openNameEditor(game, opt) {
    const old = document.getElementById('nameEditor');
    if (old) old.remove();
    const wrap = document.createElement('div');
    wrap.id = 'nameEditor';
    wrap.style.cssText = 'position:fixed;inset:0;z-index:1000;background:rgba(20,10,30,0.66);display:flex;align-items:flex-start;justify-content:center;padding-top:40px;';
    const box = document.createElement('div');
    box.style.cssText = 'width:min(420px,calc(100% - 32px));background:rgba(12,12,14,0.97);border:1px solid #3a3a42;border-radius:2px;padding:18px 18px 16px;box-shadow:0 10px 30px rgba(0,0,0,0.5);font-family:"Hiragino Sans","Hiragino Kaku Gothic ProN","Noto Sans JP",sans-serif;text-align:center;';
    const title = document.createElement('div');
    title.textContent = opt.title || 'なまえ';
    title.style.cssText = 'font-weight:900;font-size:22px;color:#fff4e6;margin-bottom:4px;';
    const sub = document.createElement('div');
    sub.textContent = opt.sub || 'ランキングやほかの人の画面に表示されます（12文字まで）';
    sub.style.cssText = 'font-weight:800;font-size:13px;color:#cfc2e6;margin-bottom:12px;';
    const inp = document.createElement('input');
    inp.type = 'text'; inp.maxLength = 12; inp.placeholder = 'ゆうしゃ'; inp.value = opt.value || '';
    inp.autocomplete = 'off'; inp.enterKeyHint = 'done';
    inp.style.cssText = 'width:100%;box-sizing:border-box;height:52px;border-radius:2px;border:1px solid #3a3a42;background:#0c0c0e;padding:0 12px;font-family:inherit;font-weight:800;font-size:20px;color:#fff4e6;outline:none;text-align:center;';
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;gap:10px;margin-top:14px;';
    const mk = (label, bg, fg) => { const b = document.createElement('button'); b.textContent = label; b.style.cssText = `flex:1;height:50px;border-radius:2px;border:1px solid #3a3a42;background:${bg};color:${fg};font-family:inherit;font-weight:700;font-size:18px;cursor:pointer;`; return b; };
    const cancel = mk(opt.cancelLabel || 'やめる', 'rgba(255,255,255,0.08)', '#fff4e6'), ok = mk('けってい', '#f4f4f6', '#0c0c0e');
    row.append(cancel, ok); box.append(title, sub, inp, row); wrap.append(box);
    UI.domRoot().appendChild(wrap);
    // 入力中はゲームのキー操作を止める（WASD・スペースなどが打てなくならないように）
    const kb = game && game.input && game.input.keyboard;
    if (kb) kb.enabled = false;
    let done = false;
    const close = v => {
      if (done) return;
      done = true;
      if (kb) kb.enabled = true;
      wrap.remove();
      if (v === null) { if (opt.onCancel) opt.onCancel(); } else opt.onDone(v.trim().slice(0, 12));
    };
    ok.addEventListener('click', () => close(inp.value));
    cancel.addEventListener('click', () => close(null));
    wrap.addEventListener('pointerdown', e => { if (e.target === wrap) close(null); });
    inp.addEventListener('keydown', e => {
      e.stopPropagation();
      if (e.isComposing || e.keyCode === 229) return; // 日本語の変換を確定するEnterでは閉じない
      if (e.key === 'Enter') { e.preventDefault(); close(inp.value); } else if (e.key === 'Escape') close(null);
    });
    inp.addEventListener('keyup', e => e.stopPropagation());
    setTimeout(() => { inp.focus(); try { inp.setSelectionRange(inp.value.length, inp.value.length); } catch (e) { /* noop */ } }, 50);
    return { close: () => close(null), isOpen: () => !done };
  }

  const store = {
    get(k, d) { try { const v = localStorage.getItem('nakama_' + k); return v == null ? d : v; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('nakama_' + k, v); } catch (e) { /* noop */ } },
  };
  window.Store = store;

  // 持っている妖怪と★（サーバーのプロフィールが正。すぐ表示できるようにこの端末にも覚えておく）
  const Unlock = {
    chars: (() => { try { return JSON.parse(store.get('chars', 'null')); } catch (e) { return null; } })(),
    ok(k) { return GD.STARTERS.includes(k) || !!(this.chars && k in this.chars); },
    dups(k) { return this.chars && this.chars[k] != null ? this.chars[k] : (GD.STARTERS.includes(k) ? 0 : -1); },
    star(k) { const d = this.dups(k); return d < 0 ? 0 : GD.starOf(d); },
    // 新しい情報が来たら覚える。変わったら true
    set(chars) {
      if (!chars) return false;
      const a = JSON.stringify(chars), changed = a !== JSON.stringify(this.chars);
      this.chars = chars; store.set('chars', a);
      return changed;
    },
    // 次の★まであと何体（MAXなら0）
    toNext(k) {
      const d = this.dups(k); if (d < 0) return -1;
      let acc = 0; for (const n of GD.STAR_NEED) { acc += n; if (d < acc) return acc - d; }
      return 0;
    },
  };
  window.Unlock = Unlock;

  // ★の表示（★★★☆☆）
  const starStr = st => '★'.repeat(st) + '☆'.repeat(5 - st);
  const RARE_NAME = ['★', '★★', '★★★', '★★★★'];
  function starLine(st) {
    const b = GD.starBonus(st), pct = v => Math.round(v * 100);
    if (st <= 1) return '★を上げると 攻撃・スキル・守りが強くなる（最大★5）';
    return `攻撃+${pct(b.atk - 1)}%　スキル威力+${pct(b.skill - 1)}%　待ち時間-${pct(1 - b.cd)}%　被ダメ-${pct(1 - b.def)}%${b.awake ? '　特性覚醒！' : ''}`;
  }
  // 選んだ妖怪の★と、次の★まで（ロビー・やられた画面で共通）
  function starInfo(scene, cx, y, width, opt = {}) {
    const head = scene.add.text(cx, y, '', TR(18, '#c8901a', '#3a1e0a', 4)).setOrigin(0.5, 0);
    const gw = Math.min(340, width - 60), gx = cx - gw / 2, gy = y + 28;
    let gauge = [];
    const sub = scene.add.text(cx, y + 52, '', TR(13, opt.dark ? '#ece4fa' : '#5a3a1a', null, 0, { align: 'center', wordWrap: { width: width - 30, useAdvancedWrap: true } })).setOrigin(0.5, 0);
    return {
      set(k) {
        gauge.forEach(o => o.destroy()); gauge = [];
        if (!Unlock.ok(k)) {
          head.setText(`🔒 ガチャで手に入る（レア度 ${RARE_NAME[GD.CHARA_RARITY[k] || 0]}）`).setColor(opt.dark ? '#d8b8c8' : '#8a5a5a');
          sub.setText('ガチャで同じ妖怪が出ると★が上がる（最大★5）').setY(y + 30);
          return;
        }
        const st = Unlock.star(k);
        head.setText(`${starStr(st)}${st >= 5 ? '　MAX！' : ''}`).setColor(st >= 5 ? '#e0402a' : '#c8901a');
        // ★レベルアップのゲージ
        gauge = Shop.starGauge(scene, gx, gy, gw, 16, Unlock.dups(k));
        sub.setText(starLine(st)).setY(y + 52);
      },
    };
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
  // ロビーの背景（月と妖怪の影のイラスト）。ロゴの下端と月の位置を返す
  const HBG = { w: 1600, h: 899, logoB: 0.31, moonX: 0.5, moonY: 0.51, moonR: 0.2 };
  function homeBackdrop(scene, wide) {
    const w = scene.scale.width, h = scene.scale.height;
    scene.cameras.main.setBackgroundColor('#1a1a28');
    let sc, ox, oy;
    if (wide) { sc = Math.max(w / HBG.w, h / HBG.h); ox = w / 2 - HBG.w * sc / 2; oy = h / 2 - HBG.h * sc / 2; }
    else { sc = Math.max(w * 1.55 / HBG.w, Math.min(h * 0.42 / HBG.h, w * 2.2 / HBG.w)); ox = w / 2 - HBG.w * sc / 2; oy = 0; }
    scene.add.image(ox, oy, 'home_bg').setOrigin(0).setScale(sc);
    const ih = HBG.h * sc;
    if (!wide && oy + ih < h) { // 絵の下は、なめらかに夜の色へ
      const g = scene.add.graphics();
      g.fillGradientStyle(0x1a1a28, 0x1a1a28, 0x1a1a28, 0x1a1a28, 0, 0, 1, 1);
      g.fillRect(0, oy + ih * 0.7, w, ih * 0.3 + 1);
      g.fillStyle(0x1a1a28, 1); g.fillRect(0, oy + ih, w, h - oy - ih);
    }
    // ただよう人魂（ひとだま）
    for (let i = 0; i < 12; i++) {
      const c = scene.add.circle(Phaser.Math.Between(0, w), h + 20, Phaser.Math.Between(2, 6), Phaser.Math.RND.pick([0xb8a0ff, 0x8ab8ff, 0xffe0b0]), 0.55).setBlendMode('ADD');
      scene.tweens.add({ targets: c, y: -30, x: c.x + Phaser.Math.Between(-80, 80), alpha: 0, duration: Phaser.Math.Between(7000, 12000), delay: Phaser.Math.Between(0, 8000), repeat: -1 });
    }
    return { logoBottom: oy + HBG.logoB * ih, moonY: oy + HBG.moonY * ih, moonR: HBG.moonR * ih, moonX: ox + HBG.moonX * HBG.w * sc };
  }
  const V = () => (window.GV && window.GV !== '__VERSION__' ? '?v=' + window.GV : '');

  // モンスター選びのグリッド（タイトルとやられた画面で共通）
  const PICK_KEYS = () => GD.UNLOCKS.map(u => u[0]);
  function monsterPicker(scene, cx, top, width, sel, onPick, opt = {}) {
    const keys = PICK_KEYS();
    const cols = opt.cols || (width < 420 ? 5 : 7);
    const size = Math.min(opt.maxSize || 58, Math.floor((width - 10) / cols) - 8);
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
      if (!Unlock.ok(k)) { // まだ持っていない：暗くしてカギ（ガチャで手に入る）
        ic.setTint(0x222222);
        const dark = scene.add.circle(x, y, size / 2, 0x000000, 0.35);
        const lock = scene.add.text(x, y - 4, '🔒', { fontSize: Math.round(size * 0.36) + 'px' }).setOrigin(0.5);
        const need = scene.add.text(x, y + size * 0.32, 'ガチャ', TR(Math.max(10, size * 0.2), '#ffe07a', '#2a1f18', 3)).setOrigin(0.5);
        objs.push(dark, lock, need);
      } else {
        // ★の数（下に小さく）
        const st = Unlock.star(k);
        const sb = scene.add.text(x, y + size / 2 + 1, '★'.repeat(st), TR(Math.max(9, size * 0.19), st >= 5 ? '#ff6a3a' : '#ffd23a', '#3a1e0a', 3)).setOrigin(0.5, 0.5);
        objs.push(sb);
      }
      return { k, ring, ic, x, y };
    });
    if (opt.depth) objs.forEach(o => o.setDepth(opt.depth));
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
    if (!Unlock.ok(sp)) return { title: `🔒 ${d.name}（${d.role}）`, line: `ガチャで手に入る妖怪\nスキル【${d.skill.name}】${d.skill.desc}` };
    return { title: `${d.name}（${d.role}）${'★'.repeat(Unlock.star(sp))}`, line: `スキル【${d.skill.name}】${d.skill.desc}\n特性【${d.trait.name}】${d.trait.desc}` };
  }

  // ---------------- Boot ----------------
  class BootScene extends Phaser.Scene {
    constructor() { super('Boot'); }
    preload() {
      const w = this.scale.width, h = this.scale.height;
      this.cameras.main.setBackgroundColor('#141022');
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
      for (const k of ['obake', 'chochin', 'boss1', 'kitsune', 'tanuki', 'boss2', 'oni', 'mujina', 'boss3', 'boss4', 'onimen', 'karakasa', 'nushioni', 'nushitanuki']) {
        this.load.image('ek_' + k, 'assets/ek_' + k + '.png' + V());
      }
      this.load.image('title_bg', 'assets/title_bg.jpg' + V());
      this.load.image('title_main', 'assets/title_main.jpg' + V());
      this.load.image('home_bg', 'assets/home_bg.jpg' + V());
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
      this.onResize = () => {
        // 名前の入力中（スマホのキーボードが出て画面サイズが変わったとき）は作り直さず、閉じてから
        if (this.nameEditor && this.nameEditor.isOpen()) { this.resizePending = true; return; }
        this.saveName(); this.scene.restart({ msg: this.msgText && this.msgText.text, keep: true });
      };
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
      this.events.once('shutdown', () => { this.scale.off('resize', this.onResize); this.saveName(); if (this.nameEditor && this.nameEditor.isOpen()) this.nameEditor.close(); });
    }
    saveName() { if (this.input_ && this.input_.node) store.set('name', this.input_.node.value); }
    // ---------- ご意見・バグ報告（運営に送る。届いた内容はサーバーのPCでだけ見られる） ----------
    openFeedback() {
      if (document.getElementById('fbPanel') || this.connecting) return;
      Sfx.init(); Sfx.play('click');
      const kb = this.game.input.keyboard; if (kb) kb.enabled = false;
      const wrap = document.createElement('div');
      wrap.id = 'fbPanel';
      wrap.style.cssText = 'position:fixed;inset:0;z-index:1000;background:rgba(20,10,30,0.66);display:flex;align-items:flex-start;justify-content:center;padding-top:20px;overflow:auto;';
      const F = '"Hiragino Sans","Hiragino Kaku Gothic ProN","Noto Sans JP",sans-serif';
      wrap.innerHTML = `
        <div style="width:min(480px,calc(100% - 28px));background:rgba(12,12,14,0.97);border:1px solid #3a3a42;border-radius:2px;padding:16px;box-shadow:0 10px 30px rgba(0,0,0,.5);font-family:${F};color:#fff4e6;">
          <div style="font-weight:900;font-size:22px;text-align:center">📮 ご意見・バグ報告</div>
          <div style="font-weight:800;font-size:12.5px;color:#cfc2e6;text-align:center;margin:4px 0 10px">運営に届きます。ほかのプレイヤーには見えません</div>
          <div id="fbKinds" style="display:flex;gap:6px;margin-bottom:10px"></div>
          <div id="fbStars" style="text-align:center;font-size:30px;margin-bottom:6px;cursor:pointer;user-select:none"></div>
          <textarea id="fbText" maxlength="2000" placeholder="ここに書いてね（2000文字まで）" style="width:100%;box-sizing:border-box;height:150px;border-radius:2px;border:1px solid #3a3a42;background:#0c0c0e;padding:10px;font-family:${F};font-weight:800;font-size:16px;color:#fff4e6;resize:vertical;outline:none"></textarea>
          <div id="fbMsg" style="font-weight:800;font-size:13px;color:#ff8a7a;min-height:18px;margin:4px 0"></div>
          <div style="display:flex;gap:10px">
            <button id="fbCancel" style="flex:1;height:48px;border-radius:2px;border:1px solid #3a3a42;background:rgba(255,255,255,0.08);color:#fff4e6;font-family:${F};font-weight:900;font-size:18px">とじる</button>
            <button id="fbSend" style="flex:1;height:48px;border-radius:2px;border:1px solid #3a3a42;background:#f4f4f6;color:#0c0c0e;font-family:${F};font-weight:700;font-size:18px">送信する</button>
          </div>
        </div>`;
      UI.domRoot().appendChild(wrap);
      const $ = id => wrap.querySelector('#' + id);
      const KINDS = [['review', '⭐ レビュー'], ['idea', '🙏 改善してほしい'], ['bug', '🐞 バグ報告']];
      let kind = 'idea', stars = 0;
      const drawKinds = () => {
        $('fbKinds').innerHTML = KINDS.map(([k, l]) => `<button data-k="${k}" style="flex:1;height:42px;border-radius:2px;border:2px solid ${k === kind ? '#ffd76a' : 'rgba(255,255,255,0.6)'};background:${k === kind ? 'rgba(255,215,106,0.25)' : 'rgba(255,255,255,0.06)'};color:#fff4e6;font-family:${F};font-weight:900;font-size:14px">${l}</button>`).join('');
        $('fbKinds').querySelectorAll('button').forEach(b => b.addEventListener('click', () => { kind = b.dataset.k; drawKinds(); }));
        $('fbStars').style.display = kind === 'review' ? 'block' : 'none';
        $('fbStars').innerHTML = [1, 2, 3, 4, 5].map(i => `<span data-s="${i}" style="color:${i <= stars ? '#ffd23a' : '#5a5070'}">★</span>`).join('');
        $('fbStars').querySelectorAll('span').forEach(sp => sp.addEventListener('click', () => { stars = +sp.dataset.s; drawKinds(); }));
        $('fbText').placeholder = kind === 'bug' ? 'どこで・何をしたら・どうなったか を書いてね（500文字まで）' : kind === 'review' ? '遊んでみた感想を書いてね（500文字まで）' : '直してほしいところ・欲しい機能を書いてね（500文字まで）';
      };
      drawKinds();
      const close = () => { if (kb) kb.enabled = true; wrap.remove(); };
      $('fbCancel').addEventListener('click', close);
      wrap.addEventListener('pointerdown', e => { if (e.target === wrap) close(); });
      wrap.addEventListener('keydown', e => e.stopPropagation());
      $('fbSend').addEventListener('click', () => {
        const text = $('fbText').value.trim();
        if (text.length < 2) { $('fbMsg').textContent = '内容を書いてね'; return; }
        $('fbSend').disabled = true; $('fbMsg').style.color = '#cfc2e6'; $('fbMsg').textContent = '送信中…';
        Net.feedback({ k: kind, st: kind === 'review' ? stars : 0, m: text, n: (this.input_ && this.input_.node.value.trim()) || '', ua: (navigator.userAgent || '').slice(0, 160), sc: `${window.innerWidth}x${window.innerHeight}` })
          .then(r => {
            if (r && r.ok) { $('fbMsg').style.color = '#8aff9a'; $('fbMsg').textContent = '送信しました！ ありがとう！'; Sfx.play('cap'); setTimeout(close, 1200); }
            else { $('fbSend').disabled = false; $('fbMsg').style.color = '#ff8a7a'; $('fbMsg').textContent = r && r.wait ? '少し時間をあけてから送ってね' : '送れませんでした'; }
          })
          .catch(() => { $('fbSend').disabled = false; $('fbMsg').style.color = '#ff8a7a'; $('fbMsg').textContent = 'サーバーにつながりません'; });
      });
      setTimeout(() => $('fbText').focus(), 50);
      this.events.once('shutdown', () => { if (wrap.isConnected) close(); });
    }

    // 名前の入力パネルを開く（then があれば決めたあとに呼ぶ）
    editName(opt = {}) {
      if (this.nameEditor && this.nameEditor.isOpen()) return;
      this.nameEditor = openNameEditor(this.game, {
        title: opt.title || 'なまえを入力', sub: opt.sub, value: this.input_ ? this.input_.node.value : '', cancelLabel: opt.cancelLabel,
        onDone: v => {
          this.nameEditor = null;
          if (this.input_) this.input_.node.value = v;
          store.set('name', v);
          if (this.showName && this.sys.isActive()) this.showName();
          if (this.resizePending) { this.resizePending = false; this.onResize(); }
          if (opt.then) opt.then(v);
        },
        onCancel: () => { this.nameEditor = null; if (this.resizePending) { this.resizePending = false; this.onResize(); } if (opt.onCancel) opt.onCancel(); },
      });
    }
    getName() {
      const v = (this.input_ && this.input_.node.value || '').trim();
      return (v || 'ゆうしゃ').slice(0, 12);
    }
    // その妖怪を進化させたことがあるか（妖怪ごとの最高レベルで判断）
    evolved(k) { const st = this.prof && this.prof.st; return !!st && (st[k + ':lv'] || 0) >= GD.EVOLVE_LV; }
    pick(k, keepEvo) {
      if (!keepEvo) this.showEvo = false;
      this.sp = k;
      if (Unlock.ok(k)) store.set('sp', k);
      this.picker.set(k);
      if (this.starBox) this.starBox.set(k);
      const info = speciesInfo(k);
      const evo = this.showEvo && this.evolved(k), def = GD.SPECIES[k], es = GD.EVO_SKILLS[k];
      if (this.evoBtn && this.evoBtn.active) { this.evoBtn.setVisible(this.evolved(k)); if (this.evoBtn.setLabel) this.evoBtn.setLabel(evo ? '↩ 進化前にもどす' : '✨ 進化後を見る'); }
      this.infoTitle.setText(evo ? `✨ ${def.evoName}` : info.title);
      this.infoLine.setText(evo ? `${def.name}の進化した姿\n進化技【${es.name}】${es.desc}` : info.line);
      // 説明が枠に入りきらないときは縮める
      this.infoLine.setScale(1);
      if (this.infoMaxH && this.infoLine.height > this.infoMaxH) this.infoLine.setScale(this.infoMaxH / this.infoLine.height);
      if (this.infoTitle.width > this.infoMaxW) this.infoTitle.setScale(this.infoMaxW / this.infoTitle.width); else this.infoTitle.setScale(1);
      if (this.lockerNo && this.lockerNo.active) { const ks = PICK_KEYS(); this.lockerNo.setText(`◀ ${ks.indexOf(k) + 1} / ${ks.length} ▶　タップで一覧`); }
      if (this.preview) {
        this.preview.setTexture('cr_' + k + (evo ? '_e' : '')).setTint(Unlock.ok(k) ? 0xffffff : 0x111111);
        const s = Math.min(this.previewH / this.preview.height, this.previewW / this.preview.width);
        this.preview.setScale(s * 0.6);
        this.tweens.add({ targets: this.preview, scale: s, duration: 260, ease: 'Back.out' });
      }
    }

    build() {
      const w = this.scale.width, h = this.scale.height;
      // 横長で十分な広さ → ロッカー型（左右にメニュー・真ん中の月の前に妖怪）。それ以外は縦1列
      const two = w >= 760 && w / h >= 1.15;
      const bg = homeBackdrop(this, two);
      const best = parseInt(store.get('best', '0'), 10) || 0;
      const NB = (x, y, bw, bh, label, fn, o = {}) => button(this, x, y, bw, bh, label, fn, Object.assign({ night: true }, o, { size: Math.min(o.size || 99, bh * 0.42, bw / Math.max(3, label.length * 0.95 + 0.6)) }));
      const openList = () => this.openCharList();
      // 名前の欄：押すと入力パネルが開くボタン（画面の中に入力欄は置かない）
      const nameInput = (x, y, iw, ih, fs) => {
        this.input_ = { node: { value: store.get('name', ''), style: {} } }; // 名前の値（前と同じ形で読めるように）
        const g = this.add.graphics();
        const draw = hov => { g.clear(); g.fillStyle(hov ? 0x2a2040 : 0x140e24, 0.9); g.fillRoundedRect(x, y - ih / 2, iw, ih, 10); g.lineStyle(2, 0xffffff, hov ? 1 : 0.7); g.strokeRoundedRect(x, y - ih / 2, iw, ih, 10); };
        draw(false);
        const txt = this.add.text(x + 12, y, '', TR(fs, '#fff8f0')).setOrigin(0, 0.5);
        const pen = this.add.text(x + iw - 10, y, '✏️ 変える', TR(Math.max(12, fs - 5), '#ffd68a')).setOrigin(1, 0.5);
        this.showName = () => {
          const v = this.input_.node.value.trim();
          txt.setText(v || 'タップして名前を入力').setColor(v ? '#fff8f0' : '#9a90b0');
          while (txt.width > iw - pen.width - 30 && txt.text.length > 1) txt.setText(txt.text.slice(0, -2) + '…');
        };
        this.showName();
        const zone = this.add.zone(x + iw / 2, y, iw, ih).setInteractive({ useHandCursor: true });
        zone.on('pointerover', () => draw(true)); zone.on('pointerout', () => draw(false));
        zone.on('pointerup', () => { Sfx.init(); Sfx.play('click'); this.editName(); });
      };
      // 真ん中の妖怪（ロッカー）：左右の ◀ ▶ で切り替え
      const stage = (cx, top, bot, halfW, moonY, moonR) => {
        this.previewH = bot - top; this.previewW = halfW * 1.5;
        const glow = this.add.circle(cx, moonY, moonR, 0xc8a8ff, 0.16).setBlendMode('ADD');
        this.tweens.add({ targets: glow, scale: 1.07, alpha: 0.26, duration: 1800, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
        this.add.image(cx, bot - 4, 'shadow').setDisplaySize(Math.min(300, halfW * 1.2), 54).setAlpha(0.9);
        this.preview = this.add.image(cx, bot, 'cr_' + this.sp).setOrigin(0.5, 1);
        this.tweens.add({ targets: this.preview, y: bot - 8, duration: 1400, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
        const step = d => { const keys = PICK_KEYS(); this.pick(keys[(keys.indexOf(this.sp) + d + keys.length) % keys.length]); };
        const ay = top + (bot - top) * 0.55, as = Phaser.Math.Clamp(halfW * 0.16, 40, 60);
        NB(cx - halfW + as / 2, ay, as, as * 1.25, '◀', () => step(-1), { size: as * 0.45 });
        NB(cx + halfW - as / 2, ay, as, as * 1.25, '▶', () => step(1), { size: as * 0.45 });
        // 何番目か
        this.lockerNo = this.add.text(cx, bot + 6, '', TR(13, '#d8ccf0', '#0a0614', 3)).setOrigin(0.5, 0);
        // 絵をタップしても一覧が開く
        this.add.zone(cx, (top + bot) / 2, halfW * 1.2, bot - top).setInteractive({ useHandCursor: true }).on('pointerup', openList);
        // 進化させたことのある妖怪は、進化後の姿と進化技を見られる
        this.evoBtn = NB(cx + halfW - 74, top + 22, 140, 36, '✨ 進化後を見る', () => { Sfx.play('click'); this.showEvo = !this.showEvo; this.pick(this.sp, true); }, { size: 14, accent: 0xffc040 }).setDepth(5);
        this.evoBtn.setVisible(false);
      };
      const infoBox = (cx, y, iw, ih, big) => {
        nightFrame(this, cx - iw / 2, y, iw, ih);
        this.infoTitle = this.add.text(cx, y + 8, '', TB(big ? 26 : 19, '#fff4dc', '#0a0614', 4)).setOrigin(0.5, 0);
        const ty = big ? 42 : 34;
        this.infoLine = this.add.text(cx, y + ty + (ih - ty) / 2, '', TR(big ? 15 : 12.5, '#ece4fa', null, 0, { align: 'center', lineSpacing: big ? 5 : 2, wordWrap: { width: iw - 24, useAdvancedWrap: true } })).setOrigin(0.5);
        this.infoMaxH = ih - ty - 8; this.infoMaxW = iw - 16;
      };
      const startBtn = (x, y, bw, bh, fs, cont) => {
        const b = NB(x, y, bw, bh, cont ? '続きから' : '初めから', () => (cont ? this.go(true) : this.goNew()), { size: fs, accent: cont ? 0xff5a4a : 0x8a6aff, labelDy: -bh * 0.12 });
        const t = this.add.text(x, y + bh * 0.27, cont ? '確認中…' : '選んだ妖怪でLv1から', TR(Math.max(11, fs * 0.46), '#e6dcf6', '#0a0614', 3)).setOrigin(0.5);
        if (cont) { this.contBtn = b; this.contInfo = t; } else { this.newBtn = b; this.newInfo = t; }
      };
      this.picker = { cols: 1, set() {} };

      if (two) {
        // ---------- パソコン（横長）：左右にメニュー、真ん中の月の前に妖怪 ----------
        const M = Math.max(16, Math.round(w * 0.022));
        const colW = Phaser.Math.Clamp(Math.round(w * 0.24), 230, 380);
        const top = Math.max(bg.logoBottom + 12, h * 0.3);
        const bot = h - M;
        // 左：大きなボタン5つ
        const gap = Phaser.Math.Clamp(h * 0.018, 8, 16);
        const bh = Math.min(82, (bot - top - gap * 4) / 5);
        const lx = M + colW / 2;
        let y = top + bh / 2;
        startBtn(lx, y, colW, bh, bh * 0.4, true); y += bh + gap;
        startBtn(lx, y, colW, bh, bh * 0.4, false); y += bh + gap;
        NB(lx, y, colW, bh, '召喚（ガチャ）', () => this.openShop('gacha'), { accent: 0xff7a9a }); y += bh + gap;
        NB(lx, y, colW, bh, '装備', () => this.openShop('equip'), { accent: 0x6ab6ff }); y += bh + gap;
        NB(lx, y, colW, bh, 'やりこみ', () => this.openShop('extra'), { accent: 0xc07aff });
        // 右：名前とポイント → ★の情報 → 小さなボタン4つ
        const rx = w - M - colW;
        const sbh = Phaser.Math.Clamp(bh * 0.72, 38, 56), sbw = (colW - gap) / 2;
        const smallTop = bot - sbh * 3 - gap * 2;
        const small = [['道具屋', () => this.openShop('item')], ['戦績', () => this.openShop('rec')], ['キャラ一覧', openList], ['ランキング', () => this.showRanking()], ['お題', () => this.showDaily()], ['ご意見', () => this.openFeedback()]];
        small.forEach(([l, fn], i) => NB(rx + sbw / 2 + (i % 2) * (sbw + gap), smallTop + sbh / 2 + Math.floor(i / 2) * (sbh + gap), sbw, sbh, l, fn, { size: 20 }));
        const panH = smallTop - gap - top;
        nightFrame(this, rx, top, colW, panH);
        const py = top + 16;
        this.add.text(rx + 18, py + 4, 'なまえ', TB(17, '#fff4dc', '#0a0614', 3)).setOrigin(0, 0);
        nameInput(rx + 16, py + 46, colW - 32, 42, 18);
        this.ptsText = this.add.text(rx + 18, py + 78, '', TR(15, '#7ae8ff', '#0a0614', 4)).setOrigin(0, 0);
        this.bestText = this.add.text(rx + 18, py + 100, `ベストスコア  ${best.toLocaleString()}`, TR(15, '#ffe7a8', '#0a0614', 4)).setOrigin(0, 0);
        if (panH >= 230) this.starBox = starInfo(this, rx + colW / 2, py + 132, colW - 10, { dark: true });
        // 真ん中
        const cx = w / 2, halfW = (w - colW * 2 - M * 4) / 2;
        const infoH = Phaser.Math.Clamp(Math.round(h * 0.14), 84, 116);
        const iw = Math.min(halfW * 2, 560);
        const iy = bot - infoH;
        infoBox(cx, iy, iw, infoH, true);
        const pBot = Math.min(bg.moonY + bg.moonR * 1.05, iy - 26);
        stage(cx, Math.max(top - 20, bg.logoBottom - 10), pBot, Math.min(halfW, 300), bg.moonY, bg.moonR);
        this.msgText = this.add.text(cx, top - 6, this.notice || '', TR(17, '#fff', '#0a0614', 5, { align: 'center', wordWrap: { width: halfW * 2 } })).setOrigin(0.5, 0).setDepth(5);
        if (h >= 600) this.add.text(cx, h - 6, '移動: WASD / 矢印 / ドラッグ　ダッシュ: Shift　攻撃とスキルは自動！　Lv30で進化', TR(12, '#cfc4e8', '#0a0614', 3)).setOrigin(0.5, 1);
      } else {
        // ---------- スマホ（縦長）：上から ロゴ → 妖怪（◀ ▶）→ 説明 → 名前 → 出撃 → ★ → メニュー ----------
        const M = 12, pw = Math.min(560, w - M * 2), cx = w / 2;
        const menuH = 42, menuGap = 6, menuY = h - 8 - menuH * 2 - menuGap;
        let y = bg.logoBottom + 2;
        this.ptsText = this.add.text(cx + 6, y, '', TR(13, '#7ae8ff', '#0a0614', 4)).setOrigin(0, 0);
        this.bestText = this.add.text(cx - 6, y, `ベスト ${best.toLocaleString()}`, TR(13, '#ffe7a8', '#0a0614', 4)).setOrigin(1, 0);
        y += 22;
        const infoH = 74, nameH = 44, btnH = 56, starH = 84;
        const fixed = infoH + 8 + nameH + 10 + btnH + 10 + menuH * 2 + menuGap + 16 + 20;
        let showStar = h - y - fixed - starH >= 150;
        const stageH = Math.min(300, h - y - fixed - (showStar ? starH : 0));
        const sTop = y, sBot = y + stageH;
        stage(cx, sTop, sBot - 18, Math.min(pw / 2, 220), bg.moonY, bg.moonR);
        NB(cx - pw / 2 + 24, sTop + 20, 46, 36, '📮', () => this.openFeedback(), { size: 18 });
        y = sBot + 4;
        infoBox(cx, y, pw, infoH, false);
        y += infoH + 8;
        nightFrame(this, cx - pw / 2, y, pw, nameH, { gem: 4 });
        this.add.text(cx - pw / 2 + 14, y + nameH / 2, 'なまえ', TB(16, '#fff4dc', '#0a0614', 3)).setOrigin(0, 0.5);
        nameInput(cx - pw / 2 + 76, y + nameH / 2, pw - 86, 34, 16);
        y += nameH + 10;
        const bw = (pw - 10) / 2;
        startBtn(cx - bw / 2 - 5, y + btnH / 2, bw, btnH, 24, true);
        startBtn(cx + bw / 2 + 5, y + btnH / 2, bw, btnH, 24, false);
        y += btnH + 10;
        if (showStar) { nightFrame(this, cx - pw / 2, y, pw, starH - 4, { gem: 4 }); this.starBox = starInfo(this, cx, y + 6, pw, { dark: true }); }
        this.msgText = this.add.text(cx, sTop + 4, this.notice || '', TR(15, '#fff', '#0a0614', 5, { align: 'center', wordWrap: { width: w - 30 } })).setOrigin(0.5, 0).setDepth(5);
        const menu = [['召喚', () => this.openShop('gacha')], ['装備', () => this.openShop('equip')], ['道具屋', () => this.openShop('item')], ['やりこみ', () => this.openShop('extra')],
          ['戦績', () => this.openShop('rec')], ['順位', () => this.showRanking()], ['お題', () => this.showDaily()], ['一覧', openList]];
        const mw = (w - 16 - 6 * 3) / 4;
        menu.forEach(([l, fn], i) => NB(8 + mw / 2 + (i % 4) * (mw + 6), menuY + menuH / 2 + Math.floor(i / 4) * (menuH + menuGap), mw, menuH, l, fn, { size: 17 }));
      }
      this.goBtn = null;
      this.setSave(this.saveData === undefined ? null : this.saveData, this.saveData === undefined);
      if (this.saveData === undefined) {
        Net.saveInfo().then(d => { this.saveData = d; if (this.sys.isActive()) this.setSave(d); })
          .catch(() => { this.saveData = null; if (this.sys.isActive()) { this.setSave(null, false, true); this.showMaint(); } });
      }
      this.pick(this.sp);
      this.refreshPts();
      if (!window.__titleSeen && !this.notice) this.showSplash();
      if (this.notice && /メンテナンス/.test(this.notice)) this.showMaint();
      else Net.ping().then(r => { if (r && r.maint && this.sys.isActive()) this.showMaint(); }).catch(() => {});
    }

    // 妖怪の一覧（ロッカーの中身）。えらぶと真ん中に出る
    openCharList() {
      if (this.rankBox || this.shopBox || this.nameAsk || this.confirmBox || this.connecting) return;
      const ui = Shop.overlay(this, '妖怪をえらぶ', 660, 520);
      const { x, y, pw, ph, w, add } = ui;
      const picker = monsterPicker(this, w / 2, y + 64, pw - 40, this.sp, k => { this.pick(k); ui.close(); }, { cols: pw < 480 ? 5 : 7, maxSize: 70, depth: 64 });
      ui.onClose = () => picker.destroy();
      add(this.add.text(w / 2, y + 64 + picker.height + 18, '🔒 はガチャ（召喚）で手に入る', TR(14, '#cfc2e6')).setOrigin(0.5, 0));
    }

    // ハイスコアランキング（全期間・人のプレイヤーだけ・1人1つの自己ベスト）
    showRanking() {
      if (this.rankBox || this.shopBox || this.nameAsk || this.confirmBox || this.connecting) return;
      const ui = Shop.overlay(this, '🏆 ランキング', 600, 780, { slot: 'rankBox' });
      const { x, y, pw, ph, w, add } = ui;
      const small = pw < 480;
      const medal = ['#e8a810', '#8a9aa8', '#c0783a'];
      let weekly = store.get('rkw', '1') === '1';
      let dyn = [], tabs = [];
      const D = o => { dyn.push(o); return add(o).setDepth(Math.max(o.depth || 0, 62)); };
      const drawTabs = () => {
        tabs.forEach(t => t.destroy());
        const tw = Math.min(220, (pw - 50) / 2);
        tabs = [[true, '📅 今週'], [false, '👑 全期間']].map(([wk, label], i) => {
          const on = wk === weekly;
          const b = add(button(this, w / 2 + (i ? 1 : -1) * (tw / 2 + 6), y + 58, tw, 42, label, () => {
            if (on) return;
            weekly = wk; store.set('rkw', wk ? '1' : '0'); Sfx.play('click'); drawTabs(); load();
          }, { color: on ? 0xf0b030 : 0xb8ab98, dark: on ? 0xb07a18 : 0x6a6050, size: small ? 17 : 20, brush: true })).setDepth(63);
          if (!on) b.setAlpha(0.8);
          return b;
        });
      };
      const load = () => {
        dyn.forEach(o => o.active && o.destroy()); dyn = [];
        const status = D(this.add.text(w / 2, y + ph / 2, '読み込み中…', TR(18, '#cfc2e6')).setOrigin(0.5));
        const wk = weekly;
        Net.highScores(wk).then(d => {
          if (ui.closed || wk !== weekly) return;
          status.destroy();
          let top = y + 88;
          if (wk) {
            const left = (d && d.left) || 0, dd = Math.floor(left / 86400), hh = Math.floor(left % 86400 / 3600);
            const rw = (d && d.rw) || [];
            D(this.add.text(w / 2, top, `リセットまで あと${dd}日${hh}時間（月曜0時）`, TR(small ? 13 : 15, '#ff8a7a')).setOrigin(0.5, 0));
            D(this.add.text(w / 2, top + 20, `ごほうび：1位 ${rw[0] || 0}P＋称号【週間王者】／2位 ${rw[1] || 0}P／3位 ${rw[2] || 0}P／〜10位 ${rw[9] || 0}P`, TR(small ? 10.5 : 12.5, '#cfc2e6', null, 0, { align: 'center', wordWrap: { width: pw - 30 } })).setOrigin(0.5, 0));
            top += small ? 56 : 46;
          } else {
            D(this.add.text(w / 2, top, 'ハイスコア（全期間・1人1つの自己ベスト）', TR(small ? 13 : 15, '#cfc2e6')).setOrigin(0.5, 0));
            top += 26;
          }
          const list = (d && d.list) || [];
          if (!list.length) { D(this.add.text(w / 2, y + ph / 2, wk ? '今週の記録はまだありません\nいちばん乗りをめざそう！' : 'まだ記録がありません\nいちばん乗りをめざそう！', TR(18, '#cfc2e6', null, 0, { align: 'center' })).setOrigin(0.5)); return; }
          const bottom = y + ph - 110;
          const rowH = Math.max(24, Math.min(34, Math.floor((bottom - top) / list.length)));
          const n = Math.min(list.length, Math.floor((bottom - top) / rowH));
          const fs = rowH >= 32 ? 18 : rowH >= 28 ? 16 : 14, isz = rowH - 4;
          for (let i = 0; i < n; i++) {
            const r = list[i], ry = top + i * rowH + rowH / 2;
            if (r.me) D(this.add.rectangle(w / 2, ry, pw - 28, rowH - 2, 0xffd76a, 0.28));
            else if (i % 2 === 0) D(this.add.rectangle(w / 2, ry, pw - 28, rowH - 2, 0xffffff, 0.06));
            const rc = i < 3 ? medal[i] : '#fff4e6';
            D(this.add.text(x + 36, ry, i < 3 ? ['🥇', '🥈', '🥉'][i] : String(i + 1), TR(i < 3 ? fs + 2 : fs, rc, i < 3 ? '#fff' : null, i < 3 ? 4 : 0)).setOrigin(0.5).setDepth(63));
            if (GD.SPECIES[r.sp]) {
              const key = 'ic_' + r.sp + (r.ev ? '_e' : '');
              const ic = D(this.add.image(x + 70, ry, this.textures.exists(key) ? key : 'ic_' + r.sp).setDepth(63));
              ic.setScale(isz / ic.height);
            }
            // 右から：スコア → Lv → 名前（数字が大きくても重ならないように、幅を測って並べる）
            const sc = D(this.add.text(x + pw - 22, ry, Number(r.sc).toLocaleString(), TR(fs, '#ffb070')).setOrigin(1, 0.5).setDepth(63));
            const lvT = D(this.add.text(sc.x - sc.width - 12, ry, 'Lv' + r.lv, TR(fs - 3, '#cfc2e6')).setOrigin(1, 0.5).setDepth(63));
            const nm = D(this.add.text(x + 92, ry, r.n, TR(fs, '#fff4e6')).setOrigin(0, 0.5).setDepth(63));
            const room = lvT.x - lvT.width - 10 - nm.x;
            while (nm.width > room && nm.text.length > 1) nm.setText(nm.text.slice(0, -2) + '…');
          }
          const m = d.mine;
          const mine = m ? `あなたの${wk ? '今週の' : ''}自己ベスト：${m.rank}位 / ${d.total}人　${Number(m.sc).toLocaleString()}` : `あなたの${wk ? '今週の' : ''}記録はまだありません`;
          D(this.add.text(w / 2, y + ph - 84, mine, TR(small ? 14 : 16, '#fff4e6')).setOrigin(0.5).setDepth(63));
        }).catch(() => { if (status.active) status.setText('サーバーにつながりません'); });
      };
      drawTabs(); load();
    }

    // ---------- 毎日のお題・ログインボーナス ----------
    showDaily(lb) {
      if (this.rankBox || this.shopBox || this.nameAsk || this.confirmBox || this.connecting) return;
      const ui = Shop.overlay(this, lb ? '🎁 ログインボーナス' : '📅 今日のお題', 560, 600);
      const { x, y, pw, ph, w, add } = ui;
      const small = pw < 460;
      const D = o => add(o).setDepth(63);
      const draw = p => {
        if (ui.closed || !p || !p.dy) { if (!ui.closed && (!p || !p.dy)) D(this.add.text(w / 2, y + ph / 2, 'サーバーにつながりません', TR(18, '#cfc2e6')).setOrigin(0.5)); return; }
        let yy = y + 50;
        const dy = p.dy;
        if (lb) {
          D(this.add.text(w / 2, yy + 6, `連続ログイン ${lb.st}日目！`, TB(small ? 24 : 30, '#ffb070', '#0a0614', 4)).setOrigin(0.5, 0));
          D(this.add.text(w / 2, yy + 50, `+${lb.n}P`, TR(small ? 34 : 42, '#e07a10', '#fff', 6)).setOrigin(0.5, 0));
          this.cameras.main.flash(250, 255, 240, 200);
          if (window.FX) FX.confetti(this, w / 2, yy + 60, 70);
          Sfx.play('legend');
          yy += 112;
        } else {
          D(this.add.text(w / 2, yy + 4, `連続ログイン ${dy.st}日目　（明日のボーナス ${Math.min(400, dy.lbn + 50)}P）`, TR(small ? 13 : 15, '#cfc2e6')).setOrigin(0.5, 0));
          yy += 34;
        }
        D(this.add.text(w / 2, yy, '📅 今日のお題（毎日0時に新しくなる）', TR(small ? 16 : 19, '#fff4e6')).setOrigin(0.5, 0));
        yy += 34;
        const bh = Math.min(86, (y + ph - 80 - yy) / 3 - 8);
        dy.m.forEach(m => {
          const g = add(this.add.graphics()).setDepth(62);
          g.fillStyle(m.ok ? 0x2a5a2a : 0x2a1430, 0.92); g.fillRoundedRect(x + 20, yy, pw - 40, bh, 12);
          g.lineStyle(3, m.ok ? 0x9aff7a : 0xd8a83a, 1); g.strokeRoundedRect(x + 20, yy, pw - 40, bh, 12);
          D(this.add.text(x + 36, yy + 10, (m.ok ? '✅ ' : '') + missionText(m), TR(small ? 16 : 19, '#fff8ea', '#1a1020', 3)));
          D(this.add.text(x + pw - 36, yy + 10, `+${m.pt}P`, TR(small ? 16 : 19, m.ok ? '#9aff7a' : '#ffe07a', '#1a1020', 3)).setOrigin(1, 0));
          const gw = pw - 72, gy = yy + bh - 24, k = Math.min(1, m.c / m.g);
          g.fillStyle(0x0c0816, 1); g.fillRoundedRect(x + 36, gy, gw, 14, 7);
          if (k > 0) { g.fillStyle(m.ok ? 0x6ae04a : 0xf0b030, 1); g.fillRoundedRect(x + 36, gy, Math.max(14, gw * k), 14, 7); }
          const cur = m.k === 't' ? `${Math.floor(m.c / 60)}/${Math.round(m.g / 60)}分` : `${m.c}/${m.g}`;
          D(this.add.text(x + 36 + gw / 2, gy + 7, m.ok ? 'クリア！（ポイントは自動でもらえます）' : cur, TR(11.5, '#fff', '#1a1020', 3)).setOrigin(0.5));
          yy += bh + 8;
        });
      };
      if (this.prof && this.prof.dy) draw(this.prof); else Net.profile().then(draw).catch(() => draw(null));
    }

    msg(s) { this.msgText.setText(s); }

    refreshPts() {
      Net.profile().then(p => {
        if (!this.ptsText || !this.ptsText.active) return;
        this.ptsText.setText(`ガチャポイント  ${p.pts.toLocaleString()}P`);
        this.prof = p;
        if (this.evoBtn && this.evoBtn.active) this.evoBtn.setVisible(this.evolved(this.sp));
        // お知らせ（実績達成・週間ランキングのごほうび）
        (p.box || []).forEach((b, i) => {
          const a = b.k === 'ach' ? GD.ACHIEVEMENTS[b.i - 1] : null;
          const msg = a ? `🏅 実績達成！ 称号【${a.title}】${b.pts ? ' +' + b.pts + 'P' : ''}` : b.m;
          if (!msg) return;
          this.time.delayedCall(600 + i * 1800, () => {
            const t = this.add.text(this.scale.width / 2, this.scale.height * 0.4, msg, UI.TB(Math.min(30, this.scale.width / 16), '#ffe07a', '#2a160a', 7)).setOrigin(0.5).setDepth(95).setScale(0.3);
            this.tweens.add({ targets: t, scale: 1, duration: 300, ease: 'Back.out' });
            this.tweens.add({ targets: t, alpha: 0, y: t.y - 30, delay: 1500, duration: 400, onComplete: () => t.destroy() });
            Sfx.play('legend');
          });
        });
        // 今日はじめて：ログインボーナスとお題を見せる
        if (p.lb && !this.shopBox && !this.rankBox && !this.nameAsk && !this.confirmBox && !this.connecting) { this.showDaily(p.lb); return; }
        // 持っている妖怪が変わっていたら（ガチャ・引きつぎ）画面を作り直す
        if (Unlock.set(p.chars) && !this.shopBox && !this.rankBox && !this.nameAsk && !this.confirmBox && !this.connecting) {
          this.saveName(); this.scene.restart({ msg: this.msgText && this.msgText.text, keep: true });
        }
      }).catch(() => {});
    }
    openShop(kind) {
      if (this.rankBox || this.confirmBox || this.nameAsk || this.connecting || this.shopBox || this.maintBox) return;
      if (kind === 'gacha') Shop.openGacha(this); else if (kind === 'extra') Extra.open(this); else if (kind === 'item') Records.openItemShop(this); else if (kind === 'rec') Records.openRecords(this); else Shop.openEquip(this);
    }

    // メンテナンス中：遊べないようにして、終わったら自動で最新版を読み込み直す
    // 最初に開いたときだけ：タイトルの絵を大きく見せる。タップでロビーへ
    showSplash() {
      const w = this.scale.width, h = this.scale.height;
      const objs = [];
      // タイトルの絵。ロゴが切れないように（縦長の画面では横幅に合わせ、すき間はぼかした絵でうめる）
      const TW = 1600, TH = 900, cover = Math.max(w / TW, h / TH);
      const sc = Math.max(Math.min(w / TW, h / TH), Math.min(cover, w / 1020));
      if (sc < cover) {
        const back = this.add.image(w / 2, h / 2, 'title_main').setScale(cover * 1.05);
        if (back.preFX) back.preFX.addBlur(1, 3, 3, 1.5);
        objs.push(back, this.add.rectangle(0, 0, w, h, 0x0a0614, 0.55).setOrigin(0));
      }
      const img = this.add.image(w / 2, h / 2, 'title_main').setScale(sc);
      objs.push(img);
      const bottom = h / 2 + TH / 2 * sc, s = Math.min(1, w / 700);
      const ty = sc < cover ? Math.min(h - 40, bottom + 44) : h * 0.9;
      const tap = this.add.text(w / 2, ty, UI.isMobile() ? 'タップしてはじめる' : 'クリック / Enter ではじめる', Object.assign(TB(20 * s + 10, '#fff8f0', '#0a0614', 4), { shadow: { offsetX: 0, offsetY: 0, color: 'rgba(190,150,255,0.9)', blur: 10, stroke: true, fill: false } })).setOrigin(0.5).setAlpha(0);
      objs.push(tap);
      this.tweens.add({ targets: tap, alpha: { from: 0.3, to: 1 }, duration: 900, delay: 900, yoyo: true, repeat: -1 });
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
      objs.push(UI.nightFrame(this, w / 2 - pw / 2, h / 2 - ph / 2, pw, ph, { alpha: 0.92, fill: 0x0c0818 }).setDepth(91));
      objs.push(this.add.text(w / 2, h / 2 - 62, '🔧 メンテナンス中', TO(30, '#ffe07a', '#0a0614', 7)).setOrigin(0.5).setDepth(92));
      objs.push(this.add.text(w / 2, h / 2 - 6, 'ゲームを更新しています。\n終わると自動で始められるようになります。\n（セーブは消えません）', T(15, '#fff4e6', { align: 'center', lineSpacing: 4 })).setOrigin(0.5).setDepth(92));
      const dots = this.add.text(w / 2, h / 2 + 66, '', T(16, '#cfc2e6')).setOrigin(0.5).setDepth(92);
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
    hideInput() { /* 名前の欄はもう画面の中の入力欄ではないので、隠す必要はない */ }

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
      box.add(nightFrame(this, x, y, pw, ph, { alpha: 0.92, fill: 0x0c0818 }));
      box.add(this.add.text(w / 2, y + 34, '初めからにする？', TO(24, '#fff8ea', '#0a0614', 6)).setOrigin(0.5));
      box.add(this.add.text(w / 2, y + 72, `今のセーブ（${this.saveData.ev ? sp.evoName : sp.name} Lv${this.saveData.lv}）は消えます`, T(14, '#ff8a7a', { align: 'center', wordWrap: { width: pw - 30 } })).setOrigin(0.5));
      this.hideInput(true);
      const close = () => { [dim, box, b1, b2].forEach(o => o.destroy()); this.confirmBox = null; this.hideInput(false); };
      const b1 = button(this, w / 2 - 80, y + ph - 44, 140, 48, '初めから', () => { close(); this.go(false); }, { color: C.blue, dark: C.blueDark, size: 20 }).setDepth(52);
      const b2 = button(this, w / 2 + 80, y + ph - 44, 140, 48, 'やめる', close, { color: C.gray, dark: C.grayDark, size: 20 }).setDepth(52);
      box.setScale(0.6).setAlpha(0);
      this.tweens.add({ targets: box, scale: 1, alpha: 1, duration: 220, ease: 'Back.out' });
      this.confirmBox = { close };
    }

    // 名前が空のまま始めようとしたら、名前を入れてもらう（空のまま「けってい」なら「ゆうしゃ」で始める）
    askName() {
      if (this.nameAsk) return;
      this.nameAsk = { close: () => {} };
      Sfx.play('card');
      this.editName({
        title: 'なまえを入力してね！', sub: 'ランキングに表示されます（空のままなら「ゆうしゃ」）', cancelLabel: 'もどる',
        then: v => { this.nameAsk = null; if (this.input_) this.input_.node.value = v || 'ゆうしゃ'; this.nameAsked = true; this.go(this.goCont); },
        onCancel: () => { this.nameAsk = null; },
      });
    }

    go(cont) {
      if (this.connecting || this.nameAsk || this.confirmBox || this.rankBox || this.shopBox || this.maintBox) return; // 連打で二重参加しないように
      if (cont === undefined) { if (this.saveData) cont = true; else { this.goNew(); return; } } // Enter キー
      this.goCont = cont;
      if (!this.nameAsked && !(this.input_ && this.input_.node.value.trim())) { this.askName(); return; }
      if (!cont && !Unlock.ok(this.sp)) { this.msg(`🔒 ${GD.SPECIES[this.sp].name} はガチャで手に入ります`); Sfx.play('click'); return; }
      this.connecting = true;
      Sfx.init();
      UI.mobileEnter('landscape'); // プレイ中は横画面
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
      this.sp = d.session.sp || store.get('sp', 'gekomaru');
      if (!Unlock.ok(this.sp)) this.sp = 'gekomaru';
      this.add.rectangle(-w, -h, w * 3, h * 3, 0x1d1020, 0.55).setOrigin(0);
      const pw = Math.min(520, w - 20);
      const tmp = monsterPicker(this, w / 2, -9999, pw - 30, this.sp, () => {});
      const gridH = tmp.height; tmp.destroy();
      const ph = 200 + gridH + 150 + 56;
      // スマホ横画面などで入りきらないときは、画面の真ん中を中心に全体を縮めて表示
      const fit = ph > h - 16;
      const x = w / 2 - pw / 2, y = fit ? h / 2 - ph / 2 : Math.max(10, h / 2 - ph / 2);
      if (fit) this.cameras.main.setZoom((h - 16) / ph);
      UI.nightFrame(this, x, y, pw, ph, { alpha: 0.9, fill: 0x0c0818, r: 18, gem: 9 });
      const title = this.add.text(w / 2, y + 38, 'やられた…', TO(40, '#c8d8ff', '#3a2a40', 8)).setOrigin(0.5).setScale(0.3);
      this.tweens.add({ targets: title, scale: 1, duration: 400, ease: 'Back.out' });
      Sfx.play('lose');
      const by = d.by ? `${d.by} に倒された` : '敵の群れにやられた';
      this.add.text(w / 2, y + 80, by, T(16, '#cfc2e6')).setOrigin(0.5);
      this.add.text(w / 2, y + 112, `スコア ${Number(d.sc || 0).toLocaleString()}　撃破 ${d.k || 0}　倒したプレイヤー ${d.pk || 0}`, T(16, '#fff4e6')).setOrigin(0.5);
      const best = parseInt(store.get('best', '0'), 10) || 0;
      if ((d.sc || 0) > best) {
        store.set('best', d.sc);
        const nb = this.add.text(w / 2, y + 142, `ベストスコア更新！ ${Number(d.sc).toLocaleString()}`, TO(18, '#ffe07a', '#4a3a2e', 5)).setOrigin(0.5);
        this.tweens.add({ targets: nb, scale: 1.08, duration: 500, yoyo: true, repeat: -1 });
      }
      this.add.text(w / 2, y + 172, '次のモンスターをえらんで再出撃！', T(14, '#cfc2e6')).setOrigin(0.5);
      this.lockMsg = this.add.text(w / 2, y + 192 + gridH + 10, '', T(12, '#ff8a7a')).setOrigin(0.5, 0);
      this.picker = monsterPicker(this, w / 2, y + 192, pw - 30, this.sp, k => {
        if (!Unlock.ok(k)) { this.lockMsg.setText(`🔒 ${GD.SPECIES[k].name} はガチャで手に入ります`); return; }
        this.lockMsg.setText(''); this.sp = k; store.set('sp', k); this.picker.set(k); sb.set(k);
      });
      const sb = starInfo(this, w / 2, y + ph - 186, pw, { dark: true });
      sb.set(this.sp);
      const b1 = button(this, w / 2, y + ph - 70, Math.min(300, pw - 40), 50, '再出撃！', () => this.respawn(), { color: C.orange, dark: C.orangeDark, size: 22 });
      const route = window.__lastRoute && window.__lastRoute.r && window.__lastRoute.r.length > 2 ? window.__lastRoute : null;
      const b2 = button(this, w / 2 - (route ? 78 : 0), y + ph - 22, 140, 32, 'タイトルへ', () => this.toTitle(), { color: C.gray, dark: C.grayDark, size: 14 });
      if (route) button(this, w / 2 + 78, y + ph - 22, 140, 32, '🗺 通った道', () => Records.openRoute(this, route, d.session.seed), { night: true, size: 14 });
      keyNav(this, [b1, b2], { delay: 600 });
    }
    respawn() {
      if (this.routeBox) return;
      window.__lastRoute = null;
      this.d.session.respawn(this.sp);
      this.scene.stop();
    }
    toTitle() {
      if (this.routeBox) return;
      window.__lastRoute = null;
      this.d.session.leave();
      this.scene.stop('Game');
      this.scene.stop('UI');
      this.scene.start('Title');
    }
  }

  window.MenuScenes = { BootScene, TitleScene, ResultScene };
})();
