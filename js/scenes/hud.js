// HUD（HP・レベル・スコア・ランキング・レーダー・スキル・強化カード・演出・仮想スティック）
(function () {
  'use strict';
  const { T, TO, TB, TR, C, button } = UI;
  // 強化カードの種類ごとの色とアイコン
  const UP_COLOR = { dmg: 0xe8505a, rate: 0xe8505a, extra: 0xe8505a, pierce: 0xe8505a, skillPow: 0xf08a20, skillCd: 0xf08a20, area: 0xf08a20,
    hp: 0x3cb85a, regen: 0x3cb85a, magnet: 0x3a8ae8, bump: 0xe8505a, trait: 0x9a5ae8 };
  const UP_TAG = { dmg: 'ATTACK', rate: 'ATTACK', extra: 'ATTACK', pierce: 'ATTACK', skillPow: 'SKILL', skillCd: 'SKILL', area: 'SKILL',
    hp: 'GUARD', regen: 'GUARD', magnet: 'SUPPORT', bump: 'ATTACK', trait: 'POWER' };
  const UP_SHORT = { dmg: '攻撃', rate: '連射', extra: '弾数', pierce: '貫通', skillPow: '技威力', skillCd: '技連発', area: '技範囲', hp: 'HP', regen: '回復', magnet: '吸引', bump: '体当り', trait: '覚醒' };
  const UP_ORDER = ['dmg', 'rate', 'extra', 'pierce', 'bump', 'skillPow', 'skillCd', 'area', 'hp', 'regen', 'magnet', 'trait'];
  // カードの「数値」と「説明」（数値は大きく色つきで見せる）
  // 毎日のお題の文（menu.js と同じ）
  const missionText = m => ({ k: `敵を${m.g}体たおす`, b: `ボスを${m.g}体たおす`, pk: `プレイヤーを${m.g}回たおす`, lv: `レベル${m.g}に到達`, t: `${Math.round(m.g / 60)}分あそぶ` }[m.k] || '');
  window.missionText = missionText;
  const UP_VAL = {
    dmg: ['+20%', '攻撃のダメージ'], rate: ['-13%', '攻撃の間隔（速く撃てる）'], extra: ['+1発', '通常攻撃の弾が増える'],
    pierce: ['+1体', '弾が敵をつらぬく'], skillPow: ['+45%', '{skill}の威力'], skillCd: ['-22%', '{skill}の待ち時間'],
    area: ['+30%', '{skill}の範囲'], hp: ['HP UP', '最大HPアップ＆全回復\n（30枚まで）'], regen: ['+0.5%/秒', '毎秒 最大HPの0.5%回復\n（20枚まで）'],
    magnet: ['+40%', '経験値を吸い寄せる範囲'], bump: ['+25%', 'ぶつかったときのダメージ'], trait: ['+10%', '【{trait}】大アップ\n＋攻撃と体当たり'],
  };
  const UP_ICON = { dmg: '⚔️', rate: '⚡', extra: '✨', pierce: '🏹', skillPow: '💥', skillCd: '⏱️', area: '🌀', hp: '❤️', regen: '💚', magnet: '🧲', bump: '💢', trait: '👑' };

  class UIScene extends Phaser.Scene {
    constructor() { super('UI'); }

    create() {
      this.ready = false;
      this.gs = this.scene.get('Game');
      this.g = this.add.graphics();
      this.mg = this.add.graphics().setDepth(2);
      this.hurt = this.add.rectangle(0, 0, 10, 10, 0xff3030, 0).setOrigin(0).setDepth(50);
      FX.emitters(this, 75);

      this.lvText = this.add.text(0, 0, '', TO(18, '#fff', '#7a4a1e', 4)).setOrigin(0.5).setDepth(3);
      this.hpText = this.add.text(0, 0, '', TO(12, '#fff', '#1a1020', 3)).setOrigin(0, 0.5).setDepth(3);
      this.xpText = this.add.text(0, 0, '', T(11, '#b8c8ff')).setOrigin(1, 0.5).setDepth(3);
      this.cpText = this.add.text(0, 0, '', TO(22, '#ffe07a', '#1a1020', 5)).setOrigin(0.5, 0).setDepth(3);
      this.subText = this.add.text(0, 0, '', TO(12, '#ffffff', '#1a1020', 3)).setOrigin(0.5, 0).setDepth(3);
      this.protText = this.add.text(0, 0, '', TO(13, '#fff6a0', '#1a1020', 4)).setOrigin(0.5, 0).setDepth(3);
      this.lbTitle = this.add.text(0, 0, 'ランキング', T(12, '#ffd76a')).setDepth(3);
      this.lbRows = [];
      for (let i = 0; i < 8; i++) {
        this.lbRows.push({
          name: this.add.text(0, 0, '', T(13, '#ffffff')).setDepth(3),
          sc: this.add.text(0, 0, '', T(13, '#ffe9a8')).setOrigin(1, 0).setDepth(3),
        });
      }
      // 自分のモンスターとスキル
      this.skIcon = this.add.image(0, 0, 'ic_gekomaru').setDepth(3);
      this.skName = this.add.text(0, 0, '', TO(13, '#ffffff', '#1a1020', 3)).setOrigin(0, 0.5).setDepth(3);
      this.skSub = this.add.text(0, 0, '', T(11, '#bfe8ff')).setOrigin(0, 0.5).setDepth(3);
      this.skZone = this.add.zone(0, 0, 10, 10).setInteractive({ useHandCursor: true }).setDepth(5);
      this.skZone.on('pointerdown', () => this.showInfo());
      this.skZone.on('pointerover', () => this.showInfo());

      this.exitBtn = button(this, 0, 0, 74, 30, '退出', () => this.exit(), { color: C.gray, dark: C.grayDark, size: 14 });
      const bgmLabel = v => (v >= 1 ? '♪ 大' : v > 0 ? '♪ 小' : '♪ OFF');
      this.bgmBtn = button(this, 0, 0, 74, 30, bgmLabel(Bgm.vol), () => this.bgmBtn.setLabel(bgmLabel(Bgm.toggle())), { color: C.blue, dark: C.blueDark, size: 14 });
      // カードの自動選択（ONにするとAIがいちばん良さそうなカードを選ぶ。初心者向け）
      try { this.autoCard = localStorage.getItem('nakama_autocard') === '1'; } catch (e) { this.autoCard = false; }
      const autoLabel = () => (this.autoCard ? '🤖 自動ON' : '🤖 自動OFF');
      this.autoBtn = button(this, 0, 0, 84, 30, autoLabel(), () => {
        this.autoCard = !this.autoCard;
        try { localStorage.setItem('nakama_autocard', this.autoCard ? '1' : '0'); } catch (e) { /* noop */ }
        this.autoBtn.setLabel(autoLabel());
        this.banner(this.autoCard ? '🤖 カード自動選択 ON' : 'カード自動選択 OFF', '#bfe8ff');
        if (this.autoCard && this.cards) this.autoPick();
      }, { color: this.autoCard ? 0x3aa86a : C.gray, dark: C.grayDark, size: 13 });

      // レベルアップカード
      this.cards = null; this.cardSeq = -1; this.chosen = -1;
      this.input.keyboard.on('keydown', e => {
        if (!this.cards || e.repeat) return;
        const i = ['1', '2', '3'].indexOf(e.key);
        if (i >= 0) { this.select(i); this.pick(i); return; }
        if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') this.select(this.cards.sel - 1, true);
        else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') this.select(this.cards.sel + 1, true);
        else if (e.key === 'Enter' || e.key === ' ') this.pick(this.cards.sel);
      });

      // 仮想スティック（タッチ・ドラッグで移動）
      this.joyG = this.add.graphics().setDepth(30);
      this.joyId = null;
      this.input.on('pointerdown', (p, over) => {
        if (over.length || this.joyId !== null) return;
        this.joyId = p.id; this.joyO = { x: p.x, y: p.y };
      });
      this.input.on('pointermove', p => {
        if (p.id !== this.joyId) return;
        const dx = p.x - this.joyO.x, dy = p.y - this.joyO.y, d = Math.hypot(dx, dy), R = 56;
        const k = d > R ? R / d : 1;
        this.gs.joy.x = dx * k / R; this.gs.joy.y = dy * k / R;
      });
      const up = p => {
        if (p.id !== this.joyId) return;
        this.joyId = null; this.gs.joy.x = 0; this.gs.joy.y = 0;
      };
      this.input.on('pointerup', up);
      this.input.on('pointerupoutside', up);

      this.combo = 0; this.comboT = 0; this.lastSc = 0;
      this.comboText = this.add.text(0, 0, '', TO(30, '#ffe07a', '#3a2a20', 7)).setOrigin(1, 0.5).setDepth(34).setAlpha(0);
      this.comboSub = this.add.text(0, 0, 'COMBO', TO(13, '#fff', '#3a2a20', 4)).setOrigin(1, 0.5).setDepth(34).setAlpha(0);
      this.bannerText = null;
      // 持っているカード（アイコン×枚数）
      this.cardBag = this.add.text(0, 0, '', TR(14, '#fff8ea', '#10141f', 3, { lineSpacing: 3 })).setDepth(3);
      this.cardBagG = this.add.graphics().setDepth(2);
      this.cardBagKey = '';
      // 大妖のHPバー
      this.bbG = this.add.graphics().setDepth(3);
      this.bbName = this.add.text(0, 0, '大妖 オオマガツ　Lv200', TB(16, '#e8d0ff', '#1a0a2a', 4)).setOrigin(0.5, 1).setDepth(4).setVisible(false);
      this.bbHint = this.add.text(0, 0, '', TO(12, '#e8d0ff', '#1a0a2a', 3)).setOrigin(0.5, 0).setDepth(4).setVisible(false);
      this.setupChat();
      this.setupFeed();
      this.setupDash();
      this.layout();
      this.onResize = () => { this.layout(); if (this.cards) { this.hideCards(); this.cardSeq = -1; } };
      this.scale.on('resize', this.onResize);
      this.events.once('shutdown', () => this.scale.off('resize', this.onResize));
      this.ready = true;
    }

    // ---------- ダッシュボタンとスタミナゲージ ----------
    setupDash() {
      this.dashG = this.add.graphics().setDepth(6);
      this.dashTxt = this.add.text(0, 0, 'ダッシュ', TR(15, '#fff8ea', '#1a1020', 4)).setOrigin(0.5).setDepth(7);
      this.dashSub = this.add.text(0, 0, '', TR(11, '#bfe8ff', '#1a1020', 3)).setOrigin(0.5).setDepth(7);
      this.dashZone = this.add.zone(0, 0, 10, 10).setInteractive({ useHandCursor: true }).setDepth(8);
      this.dashPid = null;
      this.dashZone.on('pointerdown', p => { this.dashPid = p.id; this.gs.dashHold = true; });
      const up = p => { if (p.id === this.dashPid) { this.dashPid = null; this.gs.dashHold = false; } };
      this.input.on('pointerup', up);
      this.input.on('pointerupoutside', up);
      this.dashZone.on('pointerout', p => up(p));
      this.dashShown = 1;
    }
    drawDash(me) {
      const L = this.L, g = this.dashG;
      const R = L.compact ? 38 : 44;
      // 置き場所：パソコンはレーダーの左。スマホ横画面はレーダーの真上。
      // スマホ縦画面は右はしで、スキル欄・カード一覧より上（重ならないように実際の位置を見て決める）
      let cx, cy;
      if (L.portrait) {
        const stackTop = Math.min(this.skPos ? this.skPos.y : L.h, this.bagTop || L.h);
        cx = L.w - R - 14; cy = Math.min(L.h * 0.6, stackTop - R - 18);
      } else if (L.compact) {
        cx = L.mmX + L.mm / 2; cy = L.mmY - R - 16;
      } else { cx = L.mmX - R - 22; cy = L.h - R - 26; }
      this.dashZone.setPosition(cx, cy).setSize(R * 2 + 16, R * 2 + 16);
      if (this.dashZone.input) this.dashZone.input.hitArea.setTo(0, 0, R * 2 + 16, R * 2 + 16);
      const sta = me.sta === undefined ? 1 : me.sta, lock = !!me.sl, on = !!this.gs.dashing;
      // ゲージの見た目を少しなめらかに
      this.dashShown += (sta - this.dashShown) * 0.35;
      const v = this.dashShown;
      g.clear();
      g.fillStyle(0x000000, 0.35); g.fillCircle(cx + 2, cy + 4, R + 6);
      g.fillStyle(on ? 0x1f5a8a : 0x161c30, 0.88); g.fillCircle(cx, cy, R + 4);
      // 外側の輪：スタミナ（金＝使える / 赤＝使い切って回復待ち / 水色＝ダッシュ中）
      g.lineStyle(9, 0x0b0f1c, 1); g.strokeCircle(cx, cy, R - 2);
      const col = lock ? 0xff5a4a : on ? 0x6fe0ff : v >= 0.999 ? 0xffd23a : 0xf0b030;
      if (v > 0.005) {
        g.lineStyle(7, col, 1); g.beginPath();
        g.arc(cx, cy, R - 2, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, v), false); g.strokePath();
      }
      // 3秒ぶんの目盛り
      g.lineStyle(2, 0x0b0f1c, 0.9);
      for (let i = 0; i < 3; i++) { const a = -Math.PI / 2 + i / 3 * Math.PI * 2; g.lineBetween(cx + Math.cos(a) * (R - 7), cy + Math.sin(a) * (R - 7), cx + Math.cos(a) * (R + 3), cy + Math.sin(a) * (R + 3)); }
      g.lineStyle(2, on ? 0x9ff0ff : 0xd8a83a, 0.9); g.strokeCircle(cx, cy, R + 4);
      if (on) { g.fillStyle(0x6fe0ff, 0.15 + Math.sin(this.time.now / 80) * 0.08); g.fillCircle(cx, cy, R - 7); }
      this.dashTxt.setPosition(cx, cy - (L.compact ? 5 : 6)).setText(on ? '💨 GO!' : '💨 ダッシュ').setFontSize(L.compact ? 12 : 14).setColor(lock ? '#ff9a8a' : '#fff8ea');
      const left = lock ? Math.ceil((1 - sta) * GD.DASH_RECHARGE) : 0;
      this.dashSub.setPosition(cx, cy + (L.compact ? 11 : 13)).setText(lock ? `あと${left}秒` : L.compact ? `${(sta * GD.DASH_TIME).toFixed(1)}秒` : `Shift／Space`).setColor(lock ? '#ff9a8a' : '#bfe8ff');
      this.dashG.setAlpha(me.a ? 1 : 0.4);
    }

    // ---------- 右側の記録（プレイヤー同士のキル・大妖の討伐・ドロップ） ----------
    setupFeed() {
      const box = this.feedBox = document.createElement('div');
      box.style.cssText = 'position:fixed;right:12px;top:140px;width:min(300px,46vw);z-index:20;pointer-events:none;font-family:"M PLUS Rounded 1c",sans-serif;font-weight:800;font-size:13.5px;line-height:1.35;display:flex;flex-direction:column;align-items:flex-end;';
      document.body.appendChild(box);
      this.events.once('shutdown', () => box.remove());
      const ss = this.gs.session;
      const note = m => {
        if (m.k === 'drop' && m.it) {
          const it = GD.ITEMS[m.it.t], ra = GD.RARITIES[m.it.r];
          if (!it || !ra) return;
          const plus = Math.min(GD.ITEM_PLUS_MAX, (m.it.n || 1) - 1);
          this.banner(`💰 ${ra.name} ${it.name}${plus ? ' +' + plus : ''} を手に入れた！`, ra.css);
          this.feed(`💰 賞金首から <b style="color:${ra.css}">${ra.name} ${it.name}</b>${plus ? ' (+' + plus + ')' : ''} をゲット`, '#3a2a08');
          if (window.Sfx) Sfx.play('legend');
        } else if (m.k === 'box' && m.b) {
          const b = m.b;
          if (b.k === 'ach') {
            const a = GD.ACHIEVEMENTS[b.i - 1];
            if (!a) return;
            this.banner(`🏅 実績達成！ 称号【${a.title}】`, '#ffe07a');
            this.feed(`🏅 実績達成：称号【${a.title}】${b.pts ? ` <b style="color:#ffe07a">+${b.pts}P</b>` : ''}`, '#3a2a08');
            if (window.Sfx) Sfx.play('legend');
          } else if (b.m) { this.banner(b.m, '#ffe07a'); this.feed(b.m, '#3a2a08'); }
        } else if (m.k === 'mis' && m.m) {
          this.banner(`📅 お題クリア！ +${m.m.pt}P`, '#9aff7a');
          this.feed(`📅 お題クリア：${missionText(m.m)}　<b style="color:#9aff7a">+${m.m.pt}P</b>`, '#14301a');
          if (window.Sfx) Sfx.play('cap');
        }
      };
      if (ss) { ss.notes.splice(0).forEach(note); ss.onNote = note; this.events.once('shutdown', () => { ss.onNote = null; }); }
    }
    feed(html, bg) {
      if (!this.feedBox) return;
      const d = document.createElement('div');
      d.style.cssText = `margin-top:4px;padding:4px 10px;border-radius:8px;background:${bg || '#10141f'}d0;color:#fff8ea;text-shadow:0 1px 2px #000;transition:opacity 1s;max-width:100%;`;
      d.innerHTML = html;
      this.feedBox.appendChild(d);
      while (this.feedBox.children.length > 6) this.feedBox.removeChild(this.feedBox.firstChild);
      setTimeout(() => { d.style.opacity = '0'; }, 9000);
      setTimeout(() => d.remove(), 10200);
    }

    // ---------- 全体チャット（友達と遊ぶ間だけ。サーバーの CHAT_ON で切りかえ） ----------
    setupChat() {
      const ss = this.gs.session;
      if (!ss || !ss.say) return;
      const box = this.chatBox = document.createElement('div');
      box.style.cssText = 'position:fixed;left:12px;top:150px;max-width:340px;z-index:20;pointer-events:none;font-family:"M PLUS Rounded 1c",sans-serif;font-weight:800;font-size:14px;line-height:1.35;';
      document.body.appendChild(box);
      const bar = this.chatBar = document.createElement('div');
      bar.style.cssText = 'position:fixed;left:50%;bottom:16px;transform:translateX(-50%);width:min(440px,calc(100vw - 32px));display:none;gap:6px;z-index:30;';
      const inp = document.createElement('input');
      inp.maxLength = 60; inp.placeholder = 'みんなにメッセージ（Enterで送信）';
      inp.style.cssText = 'flex:1;min-width:0;font-size:16px;padding:10px 12px;border-radius:10px;border:3px solid #f0c35a;background:#1a1020ee;color:#fff8ea;font-family:inherit;outline:none;';
      const send = document.createElement('button');
      send.textContent = '送信';
      send.style.cssText = 'font-size:16px;font-weight:900;padding:0 16px;border-radius:10px;border:3px solid #5a3a14;background:#f0a830;color:#2a1608;';
      bar.append(inp, send); document.body.appendChild(bar);
      const kb = this.game.input.keyboard;
      const close = () => {
        bar.style.display = 'none'; inp.blur(); this.chatOpen = false;
        if (kb) { kb.enabled = true; }
      };
      const submit = () => { const v = inp.value.trim(); if (v) ss.say(v); inp.value = ''; close(); };
      this.openChat = () => {
        if (this.chatOpen) { submit(); return; }
        this.chatOpen = true;
        if (kb) { kb.enabled = false; this.gs.input.keyboard.resetKeys(); this.input.keyboard.resetKeys(); }
        bar.style.display = 'flex';
        setTimeout(() => inp.focus(), 0);
      };
      inp.addEventListener('keydown', e => {
        e.stopPropagation();
        if (e.isComposing || e.keyCode === 229) return; // 日本語の変換中のEnterは送らない
        if (e.key === 'Enter') { e.preventDefault(); submit(); } else if (e.key === 'Escape') { inp.value = ''; close(); }
      });
      send.addEventListener('pointerdown', e => { e.preventDefault(); submit(); });
      const onKey = e => { if (!this.chatOpen && e.key === 'Enter' && !this.cards && document.activeElement === document.body) { e.preventDefault(); this.openChat(); } };
      window.addEventListener('keydown', onKey);
      this.chatBtn = button(this, 0, 0, 74, 30, '💬 チャット', () => this.openChat(), { color: C.blue, dark: C.blueDark, size: 13 });
      const esc = t => t.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
      const add = rows => rows.forEach(r => {
        const d = document.createElement('div');
        const mine = r.id === this.gs.myId;
        d.style.cssText = 'margin-top:3px;padding:3px 9px;border-radius:8px;background:#10141fb8;color:#fff8ea;text-shadow:0 1px 2px #000;transition:opacity 1s;word-break:break-all;';
        d.innerHTML = `<span style="color:${mine ? '#fff07a' : '#7fdcff'}">${esc(r.n)}</span>：${esc(r.m)}`;
        box.appendChild(d);
        while (box.children.length > 7) box.removeChild(box.firstChild);
        setTimeout(() => { d.style.opacity = '0'; }, 15000);
        setTimeout(() => d.remove(), 16200);
      });
      add(ss.chat.slice(-5));
      this.chatBtn.setVisible(!!ss.chatOn);
      ss.onSay = rows => { this.chatBtn.setVisible(true); add(rows); if (rows.length === 1 && rows[0].id !== this.gs.myId && window.Sfx) Sfx.play('click'); };
      this.events.once('shutdown', () => {
        ss.onSay = null; window.removeEventListener('keydown', onKey);
        if (kb) kb.enabled = true;
        box.remove(); bar.remove();
      });
    }

    layout() {
      const w = this.scale.width, h = this.scale.height;
      const portrait = h > w && w < 760; // スマホ縦画面
      const compact = w < 760;
      const L = this.L = { w, h, compact, portrait };
      if (portrait) {
        L.mm = 118;
        L.mmX = w - 10 - L.mm; L.mmY = 10;
        L.hud = { x: 10, y: 10, w: w - 30 - L.mm, h: 66 };
        L.cx = L.hud.x + L.hud.w / 2;
        L.lb = { w: 132, rows: 3, x: w - 10 - 132, y: L.mmY + L.mm + 8, alpha: 0.6 };
        this.cpText.setPosition(L.cx, 82).setFontSize(18);
        this.subText.setPosition(L.cx, 106);
        this.protText.setPosition(L.cx, 124);
        this.exitBtn.setPosition(40, h - 30).setScale(0.85);
        this.bgmBtn.setPosition(40, h - 62).setScale(0.85);
      } else {
        L.mm = compact ? 140 : 190;
        L.mmX = w - 12 - L.mm; L.mmY = h - 12 - L.mm;
        L.lb = { w: compact ? 150 : 210, rows: compact ? 3 : 5, alpha: 0.8 };
        L.hud = { x: 12, y: 12, w: compact ? Math.min(210, w - L.lb.w - 36) : 280, h: 70 };
        L.lb.x = w - 12 - L.lb.w; L.lb.y = 12;
        L.cx = w / 2;
        this.cpText.setPosition(w / 2, compact ? 90 : 12).setFontSize(compact ? 20 : 24);
        this.subText.setPosition(w / 2, (compact ? 90 : 12) + 30);
        this.protText.setPosition(w / 2, (compact ? 90 : 12) + 48);
        this.exitBtn.setPosition(L.hud.x + 37, L.hud.y + L.hud.h + 24).setScale(1);
        this.bgmBtn.setPosition(L.hud.x + 37 + 82, L.hud.y + L.hud.h + 24).setScale(1);
      }
      if (portrait) this.autoBtn.setPosition(44, h - 126).setScale(0.85);
      else this.autoBtn.setPosition(L.hud.x + 37 + 164 + 87, L.hud.y + L.hud.h + 24).setScale(1);
      if (this.chatBtn) {
        if (portrait) this.chatBtn.setPosition(40, h - 94).setScale(0.85);
        else this.chatBtn.setPosition(L.hud.x + 37 + 164, L.hud.y + L.hud.h + 24).setScale(1);
        this.chatBox.style.top = (portrait ? 150 : L.hud.y + L.hud.h + 50) + 'px';
        this.chatBox.style.maxWidth = Math.min(340, w - 150) + 'px';
      }
      this.hurt.setSize(w, h);
      if (!this.mmLabel) this.mmLabel = this.add.text(0, 0, 'レーダー', TO(10, '#9fffb0', '#0f2418', 3)).setDepth(3);
      this.mmLabel.setPosition(L.mmX + 8, L.mmY + 5);
    }

    // ---------- 毎フレーム ----------
    update() {
      const gs = this.gs;
      const s = gs.latest, me = gs.me;
      if (!s || !me) return;
      const L = this.L, g = this.g;
      g.clear();
      this.tickCombo();
      if (me.sc > this.lastSc) {
        const now = this.time.now;
        if (!this.scoreBumpAt || now - this.scoreBumpAt > 160) {
          this.scoreBumpAt = now;
          this.tweens.add({ targets: this.cpText, scale: { from: 1.12, to: 1 }, duration: 160 });
        }
      }
      this.lastSc = me.sc;

      // 左上：Lv・HP・経験値
      const H = L.hud;
      this.panelG(g, H.x, H.y, H.w, H.h);
      g.fillStyle(0x7a4a10, 1); g.fillCircle(H.x + 34, H.y + H.h / 2 + 2, 27);
      g.fillStyle(0xf0b030, 1); g.fillCircle(H.x + 34, H.y + H.h / 2, 25);
      g.fillStyle(0xffd76a, 1); g.fillCircle(H.x + 34, H.y + H.h / 2 - 2, 20);
      g.fillStyle(0xffffff, 0.35); g.fillEllipse(H.x + 29, H.y + H.h / 2 - 11, 22, 10);
      g.lineStyle(2.5, 0x5a3008, 1); g.strokeCircle(H.x + 34, H.y + H.h / 2, 25);
      this.lvText.setPosition(H.x + 34, H.y + H.h / 2).setText('Lv' + me.lv);
      const bx = H.x + 68, bw = H.w - 80;
      this.bar(g, bx, H.y + 12, bw, 18, me.hp / me.mhp, 0xe8615a);
      this.hpText.setPosition(bx + 8, H.y + 21).setText(`HP ${Math.max(0, me.hp)} / ${me.mhp}`);
      const evoLeft = me.ev ? '' : `　Lv${GD.EVOLVE_LV}で進化`;
      this.bar(g, bx, H.y + 38, bw, 11, me.xp / me.xpn, 0x6fb6e8);
      this.xpText.setPosition(bx + bw, H.y + 58).setText(`EXP ${me.xp}/${me.xpn}${evoLeft}`);

      // 上中央：スコア・撃破数・オンライン人数
      this.cpText.setText(`SCORE ${me.sc.toLocaleString()}`);
      this.subText.setText(`撃破 ${me.k}　倒したプレイヤー ${me.pk || 0}　オンライン ${s.on}人`);
      if (me.hy) this.protText.setVisible(true).setText(`👹 百鬼夜行！ 生き延びろ　残り ${me.hy}秒`).setColor('#e0a8ff');
      else if (me.a && me.lv >= 20 && me.pt > 0 && me.pt <= 15) this.protText.setVisible(true).setText(`👹 百鬼夜行まで ${me.pt}秒`).setColor('#e0a8ff');
      else if (me.pr) this.protText.setVisible(true).setText('🛡 出撃直後は体当たりされない').setColor('#fff6a0');
      else this.protText.setVisible(false);
      if (window.Bgm) Bgm.intense(!!me.hy || !!this.gs.bossNear);

      this.drawRanking(s, me);
      this.drawSkill(me);
      this.drawCardBag();
      this.drawBigBoss(me);
      this.drawMinimap(s, me);
      this.drawDash(me);

      // レベルアップカード
      const ch = me.a ? me.ch : null;
      if (ch && ch.s !== this.cardSeq && ch.s !== this.chosen && this.time.now >= (this.cardsHoldUntil || 0)) { this.showCards(ch, me.sp); this.lastCh = ch; this.lastMe = me; if (this.autoCard) this.autoPick(); }
      if (this.cards && (!ch || ch.s !== this.cardSeq)) this.hideCards();
      if (this.cards) this.cards.timer.setText(`あと ${me.cht} 秒で自動選択`);

      // スティック
      this.joyG.clear();
      if (this.joyId !== null) {
        this.joyG.fillStyle(0xffffff, 0.18); this.joyG.fillCircle(this.joyO.x, this.joyO.y, 56);
        this.joyG.lineStyle(3, 0xffffff, 0.5); this.joyG.strokeCircle(this.joyO.x, this.joyO.y, 56);
        this.joyG.fillStyle(0xfff8ea, 0.8);
        this.joyG.fillCircle(this.joyO.x + this.gs.joy.x * 56, this.joyO.y + this.gs.joy.y * 56, 22);
      }
    }

    // ランキング（プレイの邪魔にならないよう小さく・半透明）
    drawRanking(s, me) {
      const L = this.L, LB = L.lb, g = this.g;
      const lb = this.gs.lastLb || [], rk = this.gs.lastRk;
      // 上から順に（Botは1位と最下位だけ届く）。最下位のBotと自分はいつも表示
      const all = lb.map((r, i) => ({ r, rank: r[5] || i + 1 }));
      const total = all.length ? all[all.length - 1].rank : 0;
      const lastBot = all.length && all[all.length - 1].r[4] && all[all.length - 1].rank === total ? all[all.length - 1] : null;
      const rows = all.filter(x => x !== lastBot).slice(0, LB.rows);
      if (!rows.some(x => x.r[0] === me.id) && rk) rows.push({ r: [me.id, me.n, me.sc, me.lv, 0], rank: rk });
      if (lastBot && !rows.includes(lastBot)) rows.push(lastBot);
      const ph = 24 + rows.length * 20;
      if (this.feedBox) { const ft = (LB.y + ph + 8) + 'px'; if (this.feedBox.style.top !== ft) this.feedBox.style.top = ft; }
      g.fillStyle(0x161c30, LB.alpha * 0.85); g.fillRoundedRect(LB.x, LB.y, LB.w, ph, 10);
      g.lineStyle(2, 0xf0c35a, LB.alpha); g.strokeRoundedRect(LB.x, LB.y, LB.w, ph, 10);
      this.lbTitle.setPosition(LB.x + 10, LB.y + 4).setAlpha(Math.min(1, LB.alpha + 0.3));
      this.lbRows.forEach((row, i) => {
        const it = rows[i];
        row.name.setVisible(!!it); row.sc.setVisible(!!it);
        if (!it) return;
        const y = LB.y + 22 + i * 20;
        const mine = it.r[0] === me.id;
        if (mine) { g.fillStyle(0xffd76a, 0.3); g.fillRoundedRect(LB.x + 4, y - 1, LB.w - 8, 19, 6); }
        const maxLen = L.compact ? 4 : 8;
        const nm = it.r[1].length > maxLen ? it.r[1].slice(0, maxLen) + '…' : it.r[1];
        row.name.setPosition(LB.x + 8, y).setText(`${it.rank}. ${nm}${it.r[4] ? ' 🤖' : ''}`).setAlpha(Math.min(1, LB.alpha + 0.3)).setColor(it.r[4] ? '#b8c4dc' : '#ffffff');
        row.sc.setPosition(LB.x + LB.w - 8, y).setText(L.compact && it.r[2] >= 10000 ? Math.round(it.r[2] / 1000) + 'k' : it.r[2].toLocaleString()).setAlpha(Math.min(1, LB.alpha + 0.3));
      });
    }

    // 下：自分のモンスターとスキルのクールタイム
    drawSkill(me) {
      const L = this.L, g = this.g;
      const def = GD.SPECIES[me.sp];
      const w = Math.min(260, L.w - 120), h = 54;
      const x = L.portrait ? (L.w - w) / 2 + 30 : 12, y = L.h - h - 14;
      this.panelG(g, x, y, w, h);
      const cx = x + 30, cy = y + h / 2;
      g.fillStyle(0x0b0f1c, 1); g.fillCircle(cx, cy, 23);
      const ready = me.scd <= 0.02;
      g.lineStyle(4, ready ? 0x7cff8a : 0x5a6a8a, 1); g.strokeCircle(cx, cy, 23);
      if (!ready) {
        g.lineStyle(4, 0xffd76a, 1);
        g.beginPath(); g.arc(cx, cy, 23, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (1 - me.scd)); g.strokePath();
      }
      const key = 'ic_' + me.sp + (me.ev ? '_e' : '');
      if (this.skIcon.texture.key !== key) this.skIcon.setTexture(key);
      this.skIcon.setPosition(cx, cy).setScale(42 / this.skIcon.height);
      this.skName.setPosition(x + 60, cy - 9).setText(`${me.ev ? def.evoName : def.name}【${def.skill.name}】`);
      this.skSub.setPosition(x + 60, cy + 11).setText(ready ? 'スキル準備OK！（タップで説明）' : 'スキル チャージ中…');
      this.skZone.setPosition(x + w / 2, cy).setSize(w, h);
      if (this.skZone.input) this.skZone.input.hitArea.setTo(0, 0, w, h);
      this.skPos = { x, y, w };
    }

    // 持っているカード：スキル欄の上に「⚔️攻撃×3」のように並べる
    drawCardBag() {
      const cards = this.gs.myCards || {}, L = this.L;
      const short = L.compact;
      const parts = UP_ORDER.filter(k => cards[k] > 0).map(k => `${UP_ICON[k]}${short ? '' : UP_SHORT[k]}×${cards[k]}${k === 'hp' ? '/30' : k === 'regen' ? '/20' : ''}`);
      const key = parts.join(' ') + '|' + L.w + '|' + (this.skPos ? this.skPos.y : 0);
      if (key === this.cardBagKey) return;
      this.cardBagKey = key;
      const g = this.cardBagG;
      g.clear();
      if (!parts.length || !this.skPos) { this.cardBag.setText(''); this.bagTop = null; return; }
      const w = Math.min(L.portrait ? L.w - 20 : 330, L.w - 20);
      this.cardBag.setText(parts.join('  ')).setWordWrapWidth(w - 16, true).setFontSize(short ? 15 : 14);
      const h = this.cardBag.height + 10;
      const x = L.portrait ? (L.w - w) / 2 : this.skPos.x, y = this.skPos.y - h - 8;
      g.fillStyle(0x161c30, 0.62); g.fillRoundedRect(x, y, Math.min(w, this.cardBag.width + 16), h, 8);
      g.lineStyle(1.5, 0xf0c35a, 0.6); g.strokeRoundedRect(x, y, Math.min(w, this.cardBag.width + 16), h, 8);
      this.cardBag.setPosition(x + 8, y + 5);
      this.bagTop = y;
    }

    // 大妖：近くにいるときは画面上にHPバー。いないときは出現までの秒数（30秒前から）
    drawBigBoss(me) {
      const bb = this.gs.bb, g = this.bbG, L = this.L;
      g.clear();
      const meX = this.gs.local ? this.gs.local.x : me.x, meY = this.gs.local ? this.gs.local.y : me.y;
      const y0 = this.protText.y + (this.protText.visible ? 26 : 4);
      if (bb && Math.hypot(bb[0] - meX, bb[1] - meY) < 2600) {
        const w = Math.min(420, L.w - (L.portrait ? 150 : 40)), x = L.cx - w / 2, y = y0 + 22;
        const bt = `大妖 オオマガツ　Lv${bb[3] || 200}`;
        if (this.bbName.text !== bt) this.bbName.setText(bt);
        this.bbName.setVisible(true).setPosition(L.cx, y - 2);
        this.bar(g, x, y, w, 14, bb[2] / 1000, 0xa050ff, 0x140820);
        this.bbHint.setVisible(true).setPosition(L.cx, y + 16).setText(`${(bb[2] / 10).toFixed(1)}%　倒すと世界の中央に経験値がばらまかれる！`);
      } else if (!bb && this.gs.bbt > 0 && this.gs.bbt <= 30) {
        this.bbName.setVisible(false);
        this.bbHint.setVisible(true).setPosition(L.cx, y0).setText(`👹 大妖が世界の中央に現れるまで ${this.gs.bbt}秒`);
      } else { this.bbName.setVisible(false); this.bbHint.setVisible(false); }
    }
    bigBossFx(spawn, name, lv) {
      if (!this.ready) return;
      if (spawn) {
        FX.flash(this, 0x5a2090, 0.5, 400);
        FX.stamp(this, '大妖 出現', '#d8a8ff', this.L.h * 0.28, this.L.compact ? 46 : 64);
        this.time.delayedCall(900, () => this.banner(`世界の中央に Lv${lv || 200} の大妖が現れた！`, '#e8d0ff'));
      } else {
        FX.flash(this, 0xffffff, 0.7, 400);
        this.stampFx('大妖 討伐！', '#ffe07a');
        this.time.delayedCall(900, () => this.banner(name ? `${name} がとどめ！ 中央に経験値が散らばった！` : '中央に経験値が散らばった！ 急げ！', '#ffe07a'));
      }
    }

    // 自分のモンスターの説明（スキル・特性・強化の状態）
    showInfo() {
      const me = this.gs.me;
      if (!me || !this.skPos) return;
      const d = GD.SPECIES[me.sp];
      if (this.info) this.info.forEach(o => o.destroy());
      const w = Math.min(320, this.L.w - 20), h = 150;
      const x = Phaser.Math.Clamp(this.skPos.x, 10, this.L.w - w - 10), y = this.skPos.y - h - 10;
      const g = this.add.graphics().setDepth(70);
      this.panelG(g, x, y, w, h, d.color);
      const st = me.st || {};
      const lines = [
        this.add.text(x + 12, y + 10, `${me.ev ? d.evoName : d.name}（${d.role}）`, T(15, '#ffffff')).setDepth(71),
        this.add.text(x + 12, y + 34, `スキル【${d.skill.name}】${d.skill.desc}`, T(12, '#bfe8ff', { wordWrap: { width: w - 24, useAdvancedWrap: true } })).setDepth(71),
        this.add.text(x + 12, y + 66, `特性【${d.trait.name}】${d.trait.desc}（覚醒Lv${st.tl || 1}）`, T(12, '#ffd9a0', { wordWrap: { width: w - 24, useAdvancedWrap: true } })).setDepth(71),
        this.add.text(x + 12, y + h - 26, `体当たり ${st.bump || 0}　攻撃×${(st.dmg || 1).toFixed(2)}　弾+${st.extra || 0}　スキル×${(st.sp || 1).toFixed(2)}`, T(11, '#ffe07a')).setDepth(71),
      ];
      this.info = [g, ...lines];
      const mine = this.info;
      if (this.infoTimer) this.infoTimer.remove();
      this.infoTimer = this.time.delayedCall(2600, () => { if (this.info === mine) { mine.forEach(o => o.destroy()); this.info = null; } });
    }

    // ゲームっぽいパネル：暗いガラス＋金のフチ
    panelG(g, x, y, w, h, accent) {
      const r = 12;
      g.fillStyle(0x000000, 0.35); g.fillRoundedRect(x + 2, y + 5, w, h, r);
      g.fillStyle(0x161c30, 0.86); g.fillRoundedRect(x, y, w, h, r);
      g.fillStyle(0x34406a, 0.55); g.fillRoundedRect(x + 3, y + 3, w - 6, Math.min(h * 0.42, 30), { tl: r - 2, tr: r - 2, bl: 4, br: 4 });
      g.lineStyle(3, accent || 0xf0c35a, 1); g.strokeRoundedRect(x, y, w, h, r);
      g.lineStyle(1.2, 0xfff3c0, 0.35); g.strokeRoundedRect(x + 4, y + 4, w - 8, h - 8, r - 4);
    }
    bar(g, x, y, w, h, v, col, back) {
      v = Phaser.Math.Clamp(v || 0, 0, 1);
      g.fillStyle(back || 0x0b0f1c, 0.95); g.fillRoundedRect(x, y, w, h, h / 2);
      if (v > 0) {
        const fw = Math.max(h, w * v);
        g.fillStyle(Phaser.Display.Color.ValueToColor(col).darken(25).color, 1); g.fillRoundedRect(x, y, fw, h, h / 2);
        g.fillStyle(col, 1); g.fillRoundedRect(x, y, fw, h * 0.7, { tl: h / 2, tr: h / 2, bl: h * 0.2, br: h * 0.2 });
        g.fillStyle(0xffffff, 0.45); g.fillRoundedRect(x + 4, y + 2, Math.max(0, fw - 8), h * 0.25, h * 0.12);
      }
      g.lineStyle(2, 0xf0c35a, 0.9); g.strokeRoundedRect(x, y, w, h, h / 2);
    }

    // レーダー：自分のまわりを拡大。敵（モンスター・他プレイヤー）を大きくはっきり表示
    drawMinimap(s, me) {
      const L = this.L, g = this.mg, S = L.mm;
      const x0 = L.mmX, y0 = L.mmY;
      const RANGE = 6400; // 前より広く（まわり約3200まで）
      const k = S / RANGE;
      const meX = this.gs.local ? this.gs.local.x : me.x, meY = this.gs.local ? this.gs.local.y : me.y;
      const cx = x0 + S / 2, cy = y0 + S / 2;
      const toR = (x, y) => [cx + (x - meX) * k, cy + (y - meY) * k];
      const inside = (px, py, m) => px > x0 + m && px < x0 + S - m && py > y0 + m && py < y0 + S - m;
      g.clear();
      g.fillStyle(0x000000, 0.35); g.fillRoundedRect(x0 + 2, y0 + 5, S, S, 10);
      g.fillStyle(0x0f2418, 0.85); g.fillRoundedRect(x0, y0, S, S, 10);
      g.lineStyle(1, 0x7cff9a, 0.18);
      g.strokeCircle(cx, cy, S * 0.22); g.strokeCircle(cx, cy, S * 0.44);
      g.lineBetween(cx, y0 + 6, cx, y0 + S - 6); g.lineBetween(x0 + 6, cy, x0 + S - 6, cy);
      // マップの外周
      const [ex0, ey0] = toR(GD.EDGE, GD.EDGE), [ex1, ey1] = toR(GD.WORLD.w - GD.EDGE, GD.WORLD.h - GD.EDGE);
      g.lineStyle(3, 0x4caf50, 0.8);
      const cl = (v, a, b) => Math.max(a, Math.min(b, v));
      if (ex0 > x0 && ex0 < x0 + S) g.lineBetween(ex0, cl(ey0, y0, y0 + S), ex0, cl(ey1, y0, y0 + S));
      if (ex1 > x0 && ex1 < x0 + S) g.lineBetween(ex1, cl(ey0, y0, y0 + S), ex1, cl(ey1, y0, y0 + S));
      if (ey0 > y0 && ey0 < y0 + S) g.lineBetween(cl(ex0, x0, x0 + S), ey0, cl(ex1, x0, x0 + S), ey0);
      if (ey1 > y0 && ey1 < y0 + S) g.lineBetween(cl(ex0, x0, x0 + S), ey1, cl(ex1, x0, x0 + S), ey1);
      // 敵モンスター（赤くはっきり）
      const blink = 0.75 + Math.sin(this.time.now / 160) * 0.25;
      const es = this.gs.esnaps.length ? this.gs.esnaps[this.gs.esnaps.length - 1].e : [];
      for (let i = 0; i < es.length; i += 4) {
        const [px, py] = toR(es[i + 2], es[i + 3]);
        if (!inside(px, py, 3)) continue;
        const ty = es[i + 1] & 63, el = es[i + 1] >= 64;
        if (ty === 7) { g.fillStyle(0xffd84f, 1); g.fillCircle(px, py, 3.5); continue; }
        const boss = ty === 4 || ty === 18 || ty === 21 || ty === 24 || ty === 25, big = boss || el;
        g.fillStyle(0x200000, 0.9); g.fillCircle(px, py, boss ? 7.5 : el ? 5 : 3.4);
        g.fillStyle(boss ? 0xff2a5a : el ? 0xc040ff : 0xff4a3a, big ? blink : 1); g.fillCircle(px, py, boss ? 6 : el ? 3.8 : 2.4);
      }
      // 妖気の渦（紫の輪。範囲外は端に出す）
      for (const r of this.gs.rz || []) {
        let [px, py] = toR(r[0], r[1]);
        if (!inside(px, py, 8)) {
          const dx = r[0] - meX, dy = r[1] - meY, t = (S / 2 - 9) / Math.max(Math.abs(dx), Math.abs(dy));
          px = cx + dx * t; py = cy + dy * t;
        }
        g.fillStyle(0x7a2aff, 0.5); g.fillCircle(px, py, Math.max(6, r[2] * k));
        g.lineStyle(2.5, 0xe0b8ff, blink); g.strokeCircle(px, py, Math.max(7, r[2] * k));
      }
      // 遠くのボス・ゴールドスライム
      const fs = this.gs.lastF || [];
      for (let i = 0; i < fs.length; i += 3) {
        const [px, py] = toR(fs[i + 1], fs[i + 2]);
        if (!inside(px, py, 4)) continue;
        if (fs[i] === 7) { g.fillStyle(0xffd84f, 1); g.fillCircle(px, py, 3.5); }
        else { g.fillStyle(0x200000, 0.9); g.fillCircle(px, py, 7.5); g.fillStyle(0xff2a5a, blink); g.fillCircle(px, py, 6); }
      }
      // 他のプレイヤー（レベルで色分け：赤＝格上 / 黄＝同じくらい / 緑＝格下）。範囲外は端に矢印
      const myPow = me.lv + (me.ev ? 10 : 0);
      const others = [];
      for (const p of s.p) if (p.id !== me.id && p.a) others.push([p.x, p.y, p.lv + (p.ev ? 10 : 0), p.bn, p.b ? 0 : 1]);
      const nearIds = new Set(s.p.map(p => p.id));
      for (const q of this.gs.lastQ || []) if (!nearIds.has(q[0])) others.push([q[1], q[2], q[3], q[4], q[5]]);
      let bountyPos = null;
      for (const [ox, oy, opow, bn, hu] of others) {
        if (bn) bountyPos = [ox, oy];
        const col = opow > myPow + 1 ? 0xff3a3a : opow < myPow - 1 ? 0x5aff7a : 0xffd84f;
        let [px, py] = toR(ox, oy);
        if (inside(px, py, 5)) {
          if (hu) { // オンラインのプレイヤー：水色のふちで大きめ
            g.fillStyle(0x0a2a3a, 1); g.fillCircle(px, py, 8.4);
            g.fillStyle(0x3ad8ff, 1); g.fillCircle(px, py, 7.4);
            g.fillStyle(col, 1); g.fillCircle(px, py, 4.2);
          } else {
            g.fillStyle(0xffffff, 1); g.fillCircle(px, py, 6);
            g.fillStyle(col, 1); g.fillCircle(px, py, 4.6);
          }
          if (bn) { g.lineStyle(2, 0xffd84f, blink); g.strokeCircle(px, py, 9); } // 賞金首
        } else {
          const dx = ox - meX, dy = oy - meY;
          const t = (S / 2 - 7) / Math.max(Math.abs(dx), Math.abs(dy));
          px = cx + dx * t; py = cy + dy * t;
          const a = Math.atan2(dy, dx);
          g.fillStyle(hu ? 0x3ad8ff : col, 0.95);
          g.fillTriangle(px + Math.cos(a) * 6, py + Math.sin(a) * 6, px + Math.cos(a + 2.4) * 5, py + Math.sin(a + 2.4) * 5, px + Math.cos(a - 2.4) * 5, py + Math.sin(a - 2.4) * 5);
        }
      }
      // 大妖（どこにいても表示。範囲外は紫の矢印）
      const bb = this.gs.bb;
      if (bb) {
        let [px, py] = toR(bb[0], bb[1]);
        if (inside(px, py, 9)) {
          g.fillStyle(0x10001a, 0.9); g.fillCircle(px, py, 10);
          g.fillStyle(0xa050ff, blink); g.fillCircle(px, py, 8);
          g.lineStyle(2, 0xe8d0ff, blink); g.strokeCircle(px, py, 12);
        } else {
          const dx = bb[0] - meX, dy = bb[1] - meY;
          const t = (S / 2 - 9) / Math.max(Math.abs(dx), Math.abs(dy));
          px = cx + dx * t; py = cy + dy * t;
          const a = Math.atan2(dy, dx);
          g.fillStyle(0xb070ff, 1);
          g.fillTriangle(px + Math.cos(a) * 9, py + Math.sin(a) * 9, px + Math.cos(a + 2.4) * 7, py + Math.sin(a + 2.4) * 7, px + Math.cos(a - 2.4) * 7, py + Math.sin(a - 2.4) * 7);
        }
      }
      g.fillStyle(0xffffff, 1); g.fillCircle(cx, cy, 5);
      g.lineStyle(2, 0x2a6aff, 1); g.strokeCircle(cx, cy, 5);
      // 右下に世界全体の中での自分の位置（小さな全体図）
      const ws = Math.round(S * 0.3), wx = x0 + S - ws - 5, wy = y0 + S - ws - 5;
      g.fillStyle(0x000000, 0.6); g.fillRect(wx, wy, ws, ws);
      g.lineStyle(1, 0x7cff9a, 0.7); g.strokeRect(wx, wy, ws, ws);
      const vw = RANGE / GD.WORLD.w * ws, vh = RANGE / GD.WORLD.h * ws;
      const mx = wx + meX / GD.WORLD.w * ws, my = wy + meY / GD.WORLD.h * ws;
      g.lineStyle(1, 0xffffff, 0.5); g.strokeRect(mx - vw / 2, my - vh / 2, vw, vh);
      g.fillStyle(0xffffff, 1); g.fillCircle(mx, my, 2.5);
      if (bb) { g.fillStyle(0xb070ff, blink); g.fillCircle(wx + bb[0] / GD.WORLD.w * ws, wy + bb[1] / GD.WORLD.h * ws, 3.5); }
      if (bountyPos) { g.fillStyle(0xffd84f, blink); g.fillCircle(wx + bountyPos[0] / GD.WORLD.w * ws, wy + bountyPos[1] / GD.WORLD.h * ws, 2.5); }
      g.lineStyle(3, 0xf0c35a, 1); g.strokeRoundedRect(x0, y0, S, S, 10);
    }

    // ---------- レベルアップカード ----------
    showCards(ch, sp) {
      this.hideCards();
      this.cardSeq = ch.s;
      const L = this.L, n = ch.o.length;
      const cw = Math.min(250, (L.w - 16) / n - 6), chh = L.compact ? 214 : 262;
      const gap = L.compact ? 6 : 22;
      const total = n * cw + (n - 1) * gap;
      const cy = L.h * 0.5 + (L.compact ? 20 : 10);
      const objs = [];
      const dim = this.add.rectangle(0, 0, L.w, L.h, 0x0d1020, 0.5).setOrigin(0).setDepth(39);
      const title = this.add.text(L.w / 2, cy - chh / 2 - 62, 'レベルアップ！ 能力をのばそう', TR(L.compact ? 21 : 28, '#ffe07a', '#3a1a08', 7)).setOrigin(0.5).setDepth(41);
      const hint = this.add.text(L.w / 2, cy + chh / 2 + 30, L.compact ? 'タップで決定' : '← → でえらぶ　Enter で決定　（1・2・3 キーでもOK）', TR(L.compact ? 15 : 17, '#fff', '#2a1a10', 5)).setOrigin(0.5).setDepth(41);
      const timer = this.add.text(L.w / 2, cy + chh / 2 + 56, '', TR(14, '#ffe7c0', '#2a1a10', 4)).setOrigin(0.5).setDepth(41);
      const arrow = this.add.text(0, 0, '▼', TO(24, '#ffe07a', '#7a4a1e', 5)).setOrigin(0.5).setDepth(42);
      this.tweens.add({ targets: arrow, scaleY: 0.8, duration: 300, yoyo: true, repeat: -1 });
      objs.push(dim, title, hint, timer, arrow);
      const cards = [];
      ch.o.forEach((key, i) => {
        const up = GD.upgradeText(key, sp);
        const x = L.w / 2 - total / 2 + cw / 2 + i * (cw + gap);
        const c = this.add.container(x, cy).setDepth(40);
        const g = this.add.graphics();
        const col = UP_COLOR[key] || 0x3a8ae8;
        const dark = Phaser.Display.Color.ValueToColor(col).darken(30).color;
        const fsz = L.compact ? 0.88 : 1;
        // 上半分：アイコンと名前 ／ 下半分：大きな数値＋説明（クリーム色の地に濃い文字）
        const iconY = -chh * 0.29, nameY = -chh * 0.075, descTop = nameY + 19 * fsz;
        const dsp = GD.SPECIES[sp];
        const fill = t => t.replace(/\{skill\}/g, dsp ? dsp.skill.name : 'スキル').replace(/\{trait\}/g, dsp ? dsp.trait.name : '特性');
        const [val, sub0] = UP_VAL[key] || ['', up.desc];
        const sub = fill(sub0);
        const tag = this.add.text(0, -chh / 2 + 15, UP_TAG[key] || '', TR(12 * fsz, '#fff', Tex.rgb(dark, -0.4), 3)).setOrigin(0.5);
        const icon = this.add.text(0, iconY, UP_ICON[key] || '★', T(32 * fsz)).setOrigin(0.5);
        const nm = this.add.text(0, nameY, up.name, TR(21 * fsz, '#ffffff', '#140a04', 6)).setOrigin(0.5);
        if (nm.width > cw - 16) nm.setScale((cw - 16) / nm.width);
        const boxTop = descTop + 2, boxBot = chh / 2 - 10;
        // 数値：プラスは赤、短くなる系（マイナス）は青、HPは緑
        const vcol = key === 'hp' || key === 'regen' ? '#12923a' : val[0] === '-' ? '#1a64d0' : '#d8281a';
        const vl = this.add.text(0, boxTop + 24 * fsz, val, TR(34 * fsz, vcol, '#ffffff', 6)).setOrigin(0.5);
        if (vl.width > cw - 24) vl.setScale((cw - 24) / vl.width);
        const subTop = boxTop + 46 * fsz;
        const ds = this.add.text(0, (subTop + boxBot) / 2, sub, TR(15.5 * fsz, '#2a1608', null, 0, { align: 'center', lineSpacing: 3, wordWrap: { width: cw - 26, useAdvancedWrap: true } })).setOrigin(0.5);
        if (ds.height > boxBot - subTop - 4) ds.setScale((boxBot - subTop - 4) / ds.height);
        const kh = this.add.text(cw / 2 - 10, chh / 2 - 6, String(i + 1), TR(14, '#ffd76a', '#1a1020', 4)).setOrigin(1, 1);
        // いま持っている枚数（数字を大きく）
        const have = (this.gs.myCards || {})[key] || 0;
        const hv = this.add.text(0, -chh / 2 - 12, have ? `いま ×${have}` : 'はじめて！', TR(17 * fsz, have ? '#ffe07a' : '#a8f0ff', '#140a04', 5)).setOrigin(0.5, 1);
        const zone = this.add.zone(0, 0, cw, chh).setInteractive({ useHandCursor: true });
        c.add([g, tag, icon, nm, vl, ds, kh, hv, zone]);
        const card = { c, g, cw, chh, x, y: cy };
        card.draw = sel => {
          g.clear();
          const hw = cw / 2, hh = chh / 2, R = 14;
          if (sel) {
            g.fillStyle(0xffe07a, 0.35); g.fillRoundedRect(-hw - 12, -hh - 12, cw + 24, chh + 24, R + 10);
            g.fillStyle(0xffe07a, 0.45); g.fillRoundedRect(-hw - 6, -hh - 6, cw + 12, chh + 12, R + 5);
          }
          g.fillStyle(0x000000, 0.45); g.fillRoundedRect(-hw + 3, -hh + 7, cw, chh, R);
          g.fillStyle(sel ? 0xffe27a : 0xd8a83a, 1); g.fillRoundedRect(-hw, -hh, cw, chh, R);
          g.fillStyle(0x7a5010, 1); g.fillRoundedRect(-hw + 3, -hh + 3, cw - 6, chh - 6, R - 2);
          g.fillStyle(dark, 1); g.fillRoundedRect(-hw + 5, -hh + 5, cw - 10, chh - 10, R - 4);
          g.fillStyle(col, 1); g.fillRoundedRect(-hw + 5, -hh + 5, cw - 10, chh * 0.55, { tl: R - 4, tr: R - 4, bl: 0, br: 0 });
          g.fillStyle(0xffffff, 0.16);
          g.fillTriangle(-hw + 5, -hh + 5, -hw + cw * 0.55, -hh + 5, -hw + 5, -hh + chh * 0.45);
          g.fillStyle(0x000000, 0.5); g.fillRect(-hw + 5, nameY - 17 * fsz, cw - 10, 34 * fsz);
          g.fillStyle(0xfff6dc, 1); g.fillRoundedRect(-hw + 9, descTop + 2, cw - 18, hh - descTop - 10, 8);
          g.fillStyle(0xffe6a8, 1); g.fillRoundedRect(-hw + 15, descTop + 7, cw - 30, 36 * fsz, 6); // 数値の帯
          g.fillStyle(0x7a5010, 1); g.fillCircle(0, iconY, 30 * fsz);
          g.fillStyle(0xfff6dc, 1); g.fillCircle(0, iconY, 27 * fsz);
          g.fillStyle(0xffffff, 0.8); g.fillEllipse(-6 * fsz, iconY - 10 * fsz, 20 * fsz, 8 * fsz);
          if (sel) { g.lineStyle(3, 0xfff6c0, 1); g.strokeRoundedRect(-hw, -hh, cw, chh, R); }
        };
        zone.on('pointerover', () => this.select(i));
        zone.on('pointerdown', () => { this.select(i); this.pick(i); });
        c.setScale(0.6).setAlpha(0);
        this.tweens.add({ targets: c, scale: 1, alpha: 1, duration: 220, delay: i * 60, ease: 'Back.out' });
        objs.push(c);
        cards.push(card);
      });
      this.cards = { objs, timer, arrow, n, cards, sel: -1, born: this.time.now };
      this.select(0);
    }
    select(i, sound) {
      const cs = this.cards;
      if (!cs) return;
      i = (i + cs.n) % cs.n;
      if (i === cs.sel) return;
      cs.sel = i;
      cs.cards.forEach((cd, k) => {
        const on = k === i;
        cd.draw(on);
        cd.c.setDepth(on ? 41 : 40);
        this.tweens.killTweensOf(cd.c);
        this.tweens.add({ targets: cd.c, scale: on ? (this.L.compact ? 1.04 : 1.1) : (this.L.compact ? 0.96 : 0.93), alpha: on ? 1 : 0.92, y: on && !this.L.compact ? cd.y - 12 : cd.y, duration: 140, ease: 'Quad.out' });
      });
      const sc = cs.cards[i];
      cs.arrow.setPosition(sc.x, sc.y - sc.chh / 2 - 32);
      if (sound) Sfx.play('click');
    }
    hideCards() {
      if (!this.cards) return;
      this.cards.cards.forEach(cd => this.tweens.killTweensOf(cd.c));
      this.cards.objs.forEach(o => o.destroy());
      this.cards = null;
    }
    // ---------- カードの自動選択：今の状態からいちばん良さそうなカードを選ぶ ----------
    bestCard(opts, me) {
      const have = this.gs.myCards || {}, sp = GD.SPECIES[me.sp] || {}, sk = (sp.skill || {}).id;
      const hpr = me.mhp ? Math.max(0, me.hp) / me.mhp : 1, lv = me.lv || 1;
      // 基本の点数（攻撃系を重く）と、同じカードを重ねたときの減り方
      const BASE = { dmg: 10, rate: 9, extra: 9.5, pierce: 6, skillPow: 7, skillCd: 7, area: 5, hp: 7, regen: 6, magnet: 4, bump: 2, trait: 6.5 };
      const DIM = { dmg: 0.1, rate: 0.25, extra: 0.35, pierce: 0.4, skillPow: 0.15, skillCd: 0.3, area: 0.4, hp: 0.12, regen: 0.15, magnet: 0.9, bump: 0.3, trait: 0.25 };
      const score = k => {
        let v = (BASE[k] || 3) / (1 + (DIM[k] || 0.2) * (have[k] || 0));
        if (k === 'hp') v *= 1 + 1.8 * (1 - hpr);            // HPが減っているほどタフネス（全回復つき）
        if (k === 'regen') v *= 1 + 0.8 * (1 - hpr);
        if (lv < 10 && (k === 'extra' || k === 'rate')) v += 2; // 序盤は手数を増やす
        if (lv < 10 && k === 'magnet' && !have.magnet) v += 2;  // 序盤は経験値を集めやすく
        if ((sk === 'heal' || sk === 'shell' || sk === 'bless') && k === 'skillCd') v += 2; // 回復・バリア系はスキル連発
        if ((sk === 'nova' || sk === 'roar' || sk === 'venom' || sk === 'moon') && (k === 'area' || k === 'skillPow')) v += 1.5; // 範囲スキル
        return v;
      };
      let best = 0, bs = -1;
      opts.forEach((k, i) => { const v = score(k); if (v > bs) { bs = v; best = i; } });
      return best;
    }
    autoPick() {
      if (!this.cards || !this.lastCh || this.autoT) return;
      const seq = this.cardSeq, i = this.bestCard(this.lastCh.o, this.lastMe || {});
      this.select(i);
      // 少し見せてから決定（何を選んだか分かるように）
      this.autoT = this.time.delayedCall(750, () => { this.autoT = null; if (this.cards && this.cardSeq === seq && this.autoCard) this.pick(i); });
    }
    pick(i) {
      if (!this.cards || i < 0 || i >= this.cards.n) return;
      if (this.time.now - this.cards.born < 250) return; // 出た瞬間の押し間違い防止
      this.gs.session.choose(this.cardSeq, i);
      this.chosen = this.cardSeq;
      const cd = this.cards.cards[i];
      // 選んだカードだけ残して、キラキラさせながら飛ばす
      this.cards.objs = this.cards.objs.filter(o => o !== cd.c);
      this.hideCards();
      const c = cd.c;
      this.tweens.killTweensOf(c);
      c.setDepth(46);
      cd.draw(true);
      const stamp = this.add.text(0, 0, 'GET!', TO(34, '#ff5a5a', '#fff', 6)).setOrigin(0.5).setAngle(-12).setScale(3).setAlpha(0);
      c.add(stamp);
      this.tweens.add({ targets: stamp, scale: 1, alpha: 1, duration: 200, ease: 'Back.out' });
      this.tweens.add({ targets: c, scale: 1.25, duration: 180, ease: 'Back.out' });
      this.tweens.add({
        targets: c, x: this.L.hud.x + 34, y: this.L.hud.y + 35, scale: 0.15, angle: 360, alpha: 0.2,
        delay: 450, duration: 450, ease: 'Cubic.in', onComplete: () => { c.destroy(); FX.stars(this, this.L.hud.x + 34, this.L.hud.y + 35, 14); },
      });
      FX.confetti(this, cd.x, cd.y, 60);
      FX.stars(this, cd.x, cd.y, 16);
      Sfx.play('card');
    }

    // ---------- 演出 ----------
    flashFx(color, a) { FX.flash(this, color, a); }
    stampFx(text, color) { if (this.ready) { FX.stamp(this, text, color, this.L.h * 0.32, this.L.compact ? 40 : 56); FX.screenConfetti(this, 60); } }

    addCombo() {
      if (!this.ready) return;
      this.combo++;
      this.comboT = 2.4;
      const n = this.combo;
      if (n < 3) return;
      const L = this.L;
      const tier = n >= 100 ? '#ff7ad9' : n >= 50 ? '#ff8a4a' : n >= 25 ? '#ffd84f' : n >= 10 ? '#a8ff90' : '#ffffff';
      const x = L.w - 16, y = L.portrait ? L.h * 0.55 : L.h * 0.5;
      this.comboText.setText(`${n}`).setColor(tier).setPosition(x, y).setAlpha(1).setFontSize(Math.min(64, 28 + n * 0.3));
      this.comboSub.setPosition(x, y + 30).setAlpha(1);
      this.tweens.killTweensOf(this.comboText);
      this.comboText.setScale(1.6);
      this.tweens.add({ targets: this.comboText, scale: 1, duration: 140, ease: 'Back.out' });
      const ms = { 10: 'ナイス！', 25: 'すごい！', 50: 'ヤバい！！', 100: '神！！！', 200: '伝説！！！', 300: '無双！！！！' }[n];
      if (ms) {
        FX.stamp(this, `${n} COMBO ${ms}`, tier, L.h * 0.3, L.compact ? 32 : 48);
        FX.flash(this, 0xffffff, 0.35, 250);
        Sfx.play('milestone');
        if (n >= 50) FX.screenConfetti(this, 100);
      }
    }
    tickCombo() {
      if (this.comboT <= 0) return;
      this.comboT -= this.game.loop.delta / 1000;
      if (this.comboT <= 0) {
        this.combo = 0;
        this.tweens.add({ targets: [this.comboText, this.comboSub], alpha: 0, duration: 300 });
      }
    }

    levelUpFx(lv) {
      if (!this.ready) return;
      FX.flash(this, 0xfff6c0, 0.55, 300);
      if (!this.cards) this.cardsHoldUntil = this.time.now + 850; // 演出を見せてからカードを出す
      FX.stamp(this, 'LEVEL UP!', '#ffe07a', this.L.h * 0.17, this.L.compact ? 40 : 56);
      const t = this.add.text(this.L.w / 2, this.L.h * 0.17 + 46, `Lv ${lv - 1} → Lv ${lv}`, TO(22, '#fff', '#3a2a20', 5)).setOrigin(0.5).setDepth(82).setAlpha(0);
      this.tweens.add({ targets: t, alpha: 1, y: t.y - 6, duration: 200, delay: 150 });
      this.tweens.add({ targets: t, alpha: 0, delay: 1300, duration: 300, onComplete: () => t.destroy() });
      FX.screenConfetti(this, 60);
      this.tweens.add({ targets: this.lvText, scale: { from: 2, to: 1 }, duration: 400, ease: 'Back.out' });
    }

    evolveFx(sp) {
      if (!this.ready) return;
      const def = GD.SPECIES[sp], L = this.L;
      FX.spotlight(this, 2600);
      const cx = L.w / 2, cy = L.h * 0.45;
      const rays = this.add.image(cx, cy, 'fx_rays').setTint(def.color).setBlendMode('ADD').setDepth(75).setScale(0.2).setAlpha(0);
      this.tweens.add({ targets: rays, scale: Math.max(L.w, L.h) / 400, alpha: 0.9, duration: 700 });
      this.tweens.add({ targets: rays, angle: 180, duration: 2600 });
      const pre = this.add.image(cx, cy, 'cr_' + sp).setDepth(76);
      const h0 = Math.min(180, L.h * 0.25);
      pre.setScale(h0 / pre.height);
      this.tweens.add({ targets: pre, scale: pre.scale * 1.15, duration: 120, yoyo: true, repeat: 3 });
      this.time.delayedCall(300, () => pre.setTintFill(0xffffff));
      this.time.delayedCall(900, () => {
        FX.flash(this, 0xffffff, 0.95, 500);
        pre.destroy();
        const evo = this.add.image(cx, cy, 'cr_' + sp + '_e').setDepth(76);
        const h1 = Math.min(240, L.h * 0.32);
        evo.setScale(0.2);
        this.tweens.add({ targets: evo, scale: h1 / evo.height, duration: 500, ease: 'Back.out' });
        FX.stamp(this, '進化！', '#ffe07a', cy - h1 / 2 - 30, L.compact ? 48 : 64);
        const nm = this.add.text(cx, cy + h1 / 2 + 28, `${def.name} → ${def.evoName}`, TO(L.compact ? 20 : 26, '#fff8ea', '#3a2a20', 6)).setOrigin(0.5).setDepth(82);
        const sk = this.add.text(cx, cy + h1 / 2 + 58, `攻撃も体当たりも2倍！ スキル【${def.skill.name}】も強化！`, TO(L.compact ? 13 : 16, '#ffe07a', '#3a2a20', 4)).setOrigin(0.5).setDepth(82);
        FX.screenConfetti(this, 180);
        FX.stars(this, cx, cy, 30);
        this.time.delayedCall(1700, () => {
          this.tweens.add({ targets: [evo, nm, sk, rays], alpha: 0, duration: 400, onComplete: () => { evo.destroy(); nm.destroy(); sk.destroy(); rays.destroy(); } });
        });
      });
    }

    banner(msg, color) {
      if (!this.ready) return;
      if (this.bannerText) this.bannerText.destroy();
      const t = this.add.text(this.L.w / 2, this.L.h * 0.3, msg, Object.assign(TB(this.L.compact ? 26 : 38, color || '#fff', '#2a160a', 8), { shadow: undefined })).setOrigin(0.5).setDepth(36).setScale(0.3);
      if (t.width > this.L.w - 20) t.setFontSize(Math.floor((this.L.compact ? 26 : 38) * (this.L.w - 20) / t.width));
      this.bannerText = t;
      this.tweens.add({ targets: t, scale: 1, duration: 300, ease: 'Back.out' });
      this.tweens.add({ targets: t, alpha: 0, y: t.y - 30, delay: 1300, duration: 500, onComplete: () => { t.destroy(); if (this.bannerText === t) this.bannerText = null; } });
    }
    hurtFlash() {
      if (!this.ready) return;
      this.hurt.setFillStyle(0xff3030, 0.22);
      this.tweens.add({ targets: this.hurt, fillAlpha: 0, duration: 250 });
    }

    exit() {
      this.gs.leaving = true;
      this.gs.session.leave();
      this.scene.stop('Result');
      this.scene.stop('Game');
      this.scene.start('Title');
    }
  }

  window.UIScene = UIScene;
})();
