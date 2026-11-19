// 起動・タイトル（モンスター選び）・やられた画面
(function () {
  'use strict';
  const { T, TO, C, panel, button, keyNav, forestBackdrop } = UI;

  const store = {
    get(k, d) { try { const v = localStorage.getItem('nakama_' + k); return v == null ? d : v; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('nakama_' + k, v); } catch (e) { /* noop */ } },
  };
  window.Store = store;
  const V = () => (window.GV && window.GV !== '__VERSION__' ? '?v=' + window.GV : '');

  // モンスター選びのグリッド（タイトルとやられた画面で共通）
  function monsterPicker(scene, cx, top, width, sel, onPick) {
    const keys = GD.SPECIES_KEYS;
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
      for (const k of ['tree1', 'tree2', 'tree3', 'rock', 'bush', 'flower1', 'flower2']) {
        this.load.image(k, 'assets/' + k + '.png' + V());
      }
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
    init(data) { this.notice = data && data.msg; }
    create() {
      this.sp = store.get('sp', 'gekomaru');
      if (!GD.SPECIES[this.sp]) this.sp = 'gekomaru';
      this.connecting = false;
      this.build();
      this.onResize = () => { this.saveName(); this.scene.restart({ msg: this.msgText && this.msgText.text }); };
      this.scale.on('resize', this.onResize);
      this.onKey = e => {
        const ae = document.activeElement;
        if (ae && ae.tagName === 'INPUT') return;
        const keys = GD.SPECIES_KEYS, i = keys.indexOf(this.sp), cols = this.picker.cols;
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
      store.set('sp', k);
      this.picker.set(k);
      const info = speciesInfo(k);
      this.infoTitle.setText(info.title);
      this.infoLine.setText(info.line);
      if (this.preview) {
        this.preview.setTexture('cr_' + k);
        const s = this.previewH / this.preview.height;
        this.preview.setScale(s * 0.6);
        this.tweens.add({ targets: this.preview, scale: s, duration: 260, ease: 'Back.out' });
      }
    }

    build() {
      const w = this.scale.width, h = this.scale.height;
      forestBackdrop(this);
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
      const logo = this.add.text(cx, logoY, 'なかまサバイバー', TO(64 * s + 10, '#fff8ea', '#4a3a2e', 10 * s + 3))
        .setOrigin(0.5).setShadow(0, 6, 'rgba(0,0,0,0.3)', 0, true, true);
      this.tweens.add({ targets: logo, scale: 1.03, duration: 1400, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
      this.add.text(cx, logoY + 40 * s + 18, '〜 モンスターを育てて最強をめざせ 〜', TO(16 * s + 6, '#ffe7a8', '#4a3a2e', 4)).setOrigin(0.5);

      // メニューパネル
      const pw = Math.min(560, w - 20);
      const py = logoY + 60 * s + 34;
      const gridTop = py + 84;
      // 先にピッカーの高さを測るため仮配置
      const tmp = monsterPicker(this, cx, -9999, pw - 30, this.sp, () => {});
      const gridH = tmp.height; tmp.destroy();
      const ph = 84 + gridH + 150;
      panel(this, cx - pw / 2, py, pw, ph);
      this.add.text(cx - pw / 2 + 22, py + 18, 'なまえ', T(17, C.soft));
      const inputW = pw - 120;
      this.input_ = this.add.dom(cx - pw / 2 + 92 + inputW / 2, py + 30, 'input', [
        `width:${inputW}px`, 'height:40px', 'box-sizing:border-box', 'border-radius:12px', 'border:3px solid #4a3a2e',
        'background:#fff', 'padding:0 12px', `font-family:${UI.FONT}`, 'font-weight:800', 'font-size:18px', 'color:#4a3a2e', 'outline:none',
      ].join(';'));
      this.input_.node.maxLength = 12;
      this.input_.node.placeholder = 'ゆうしゃ';
      this.input_.node.value = store.get('name', '');
      this.input_.node.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') this.input_.node.blur(); });

      this.add.text(cx, py + 66, 'モンスターをえらぶ', T(15, C.soft)).setOrigin(0.5);
      this.picker = monsterPicker(this, cx, gridTop, pw - 30, this.sp, k => this.pick(k));
      const infoY = gridTop + gridH + 12;
      this.infoTitle = this.add.text(cx, infoY, '', T(17, C.brownCss)).setOrigin(0.5, 0);
      this.infoLine = this.add.text(cx, infoY + 24, '', T(12, C.soft, { align: 'center', wordWrap: { width: pw - 30, useAdvancedWrap: true } })).setOrigin(0.5, 0);
      const btn = button(this, cx, py + ph - 42, Math.min(360, pw - 40), 56, 'オンラインで遊ぶ', () => this.go(), { color: 0xef7a6a, dark: 0xb24a3e, size: 24 });
      this.tweens.add({ targets: btn, scale: 1.04, duration: 700, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
      this.pick(this.sp);

      this.msgText = this.add.text(cx, py + ph + 20, this.notice || '', TO(15, '#fff', '#4a3a2e', 4)).setOrigin(0.5);
      if (py + ph + 70 < h) {
        const help = pw < 480
          ? 'ドラッグで移動・攻撃とスキルは自動！\nレベルアップ → Lv10で進化！\n他のプレイヤーには体当たりで攻撃'
          : '移動: WASD / 矢印 / ドラッグ　攻撃とスキルは自動！\n敵を倒してレベルアップ → Lv10で進化！ 他のプレイヤーには体当たりで攻撃';
        this.add.text(cx, py + ph + 44, help, T(12, '#fff8ea', { align: 'center', stroke: '#2a1f18', strokeThickness: 3 })).setOrigin(0.5, 0);
      }
      const best = parseInt(store.get('best', '0'), 10) || 0;
      this.add.text(w - 12, 10, `ベストスコア  ${best.toLocaleString()}`, TO(16, '#ffe7a8', '#4a3a2e', 4)).setOrigin(1, 0);
    }

    msg(s) { this.msgText.setText(s); }

    go() {
      if (this.connecting) return; // 連打で二重参加しないように
      this.connecting = true;
      Sfx.init();
      UI.mobileEnter();
      this.saveName();
      this.msg('接続中…');
      Net.connect(this.getName(), this.sp).then(session => {
        this.scene.start('Game', { session });
      }).catch(e => {
        this.connecting = false;
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
      this.add.rectangle(0, 0, w, h, 0x1d1020, 0.55).setOrigin(0);
      const pw = Math.min(520, w - 20);
      const tmp = monsterPicker(this, w / 2, -9999, pw - 30, this.sp, () => {});
      const gridH = tmp.height; tmp.destroy();
      const ph = 200 + gridH + 110;
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
      this.picker = monsterPicker(this, w / 2, y + 192, pw - 30, this.sp, k => { this.sp = k; store.set('sp', k); this.picker.set(k); });
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
