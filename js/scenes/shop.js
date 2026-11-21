// ロビーの「ガチャ」と「装備」画面（ロビーと同じ、古い紙＋金のフチ＋筆文字の見出し。中の文字は読みやすい太い丸ゴシック）
(function () {
  'use strict';
  const { TR, TB, C, panel, button } = UI;
  const INK = '#3a2414', SOFT = '#6a4a2a';

  const itemLabel = (t, r) => `${GD.RARITIES[r].name} ${GD.ITEMS[t].name}`;
  const lsGet = (k, d) => { try { return localStorage.getItem('nakama_' + k) || d; } catch (e) { return d; } };
  const lsSet = (k, v) => { try { localStorage.setItem('nakama_' + k, v); } catch (e) { /* noop */ } };
  // 妖怪のレア度 → 色（★=緑 ★★=青 ★★★=紫 ★★★★=金）
  const TIER_COL = [0x5ac85a, 0x4a9aff, 0xb060ff, 0xffc030];
  const TIER_NAME = ['★', '★★', '★★★', '★★★★'];
  const stars = st => '★'.repeat(st) + '☆'.repeat(5 - st);

  // ★の進み具合（d＝重ねた数）→ {st, cur, need}（MAXなら need=0）
  function starProg(d) {
    let acc = 0, st = 1;
    for (const n of GD.STAR_NEED) { if (d < acc + n) return { st, cur: d - acc, need: n }; acc += n; st++; }
    return { st: 5, cur: 0, need: 0 };
  }
  // ★レベルアップのゲージ（区切り線つき）。from を渡すとそこから伸びるアニメ
  function starGauge(scene, x, y, w, h, d, opt = {}) {
    const g = scene.add.graphics();
    const txt = opt.label === false ? null : scene.add.text(x + w / 2, y + h / 2, '', TR(Math.max(10, h * 0.78), '#fff', '#2a1408', 3)).setOrigin(0.5);
    const draw = v => {
      const pr = starProg(Math.floor(v)), frac = pr.need ? Math.min(1, (v - (Math.floor(v) - pr.cur)) / pr.need) : 1;
      g.clear();
      g.fillStyle(0x2a1408, 0.9); g.fillRoundedRect(x - 2, y - 2, w + 4, h + 4, (h + 4) / 2);
      g.fillStyle(0x5a4030, 1); g.fillRoundedRect(x, y, w, h, h / 2);
      const fw = Math.max(0, w * frac);
      if (fw > 0) {
        g.fillStyle(pr.need ? 0xffc030 : 0xff6a3a, 1); g.fillRoundedRect(x, y, Math.max(h, fw), h, h / 2);
        g.fillStyle(0xffffff, 0.35); g.fillRoundedRect(x + 2, y + 1, Math.max(h, fw) - 4, h * 0.35, h * 0.2);
      }
      if (pr.need > 1) { g.lineStyle(2, 0x2a1408, 0.7); for (let i = 1; i < pr.need; i++) g.lineBetween(x + w * i / pr.need, y + 1, x + w * i / pr.need, y + h - 1); }
      if (txt) txt.setText(pr.need ? `★${pr.st}→★${pr.st + 1}  ${Math.floor(v) - (Math.floor(v) - pr.cur)}/${pr.need}` : '★MAX');
    };
    if (opt.from != null && opt.from < d) {
      // まず前の状態、少し待ってから新しい状態へ
      draw(opt.from);
      const o = { v: opt.from };
      scene.tweens.add({ targets: o, v: d, delay: opt.delay || 300, duration: 600, ease: 'Quad.out', onUpdate: () => g.active && draw(o.v >= d - 0.001 ? d : o.v), onComplete: () => g.active && draw(d) });
    } else draw(d);
    return txt ? [g, txt] : [g];
  }

  // アイテムの絵（レアリティ色のオーラつき）
  function itemIcon(scene, x, y, t, r, size) {
    const ra = GD.RARITIES[r];
    const aura = scene.add.image(x, y, 'aura').setBlendMode(Phaser.BlendModes.ADD).setTint(ra.color).setDisplaySize(size * 1.7, size * 1.7);
    const img = scene.add.image(x, y, 'it_' + GD.ITEMS[t].key).setDisplaySize(size, size);
    scene.tweens.add({ targets: aura, alpha: 0.55, duration: 700 + r * 60, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
    if (r === 4) {
      scene.tweens.addCounter({ from: 0, to: 1, duration: 2400, repeat: -1, onUpdate: tw => {
        if (aura.active) aura.setTint(Phaser.Display.Color.HSVToRGB(tw.getValue(), 0.5, 1).color);
      } });
    }
    return [aura, img];
  }

  // 共通：暗幕＋紙のパネル＋筆文字の見出し。close() で全部消える
  function overlay(scene, title, pw, ph, opt = {}) {
    const w = scene.scale.width, h = scene.scale.height;
    pw = Math.min(pw, w - 12); ph = Math.min(ph, h - 30);
    const x = w / 2 - pw / 2, y = h / 2 - ph / 2 + 10;
    const objs = [];
    const add = o => { objs.push(o); if (o.setDepth) o.setDepth(Math.max(o.depth || 0, 61)); return o; };
    add(scene.add.rectangle(0, 0, w, h, 0x0c0816, 0.78).setOrigin(0).setInteractive().setDepth(60));
    add(panel(scene, x, y, pw, ph, { color: 0xf6ead0, alpha: 1, border: 0x8a5a1a, borderW: 4, shadow: 0.5 }).setDepth(61));
    add(scene.add.graphics().lineStyle(1.5, 0xc89a4a, 0.9).strokeRoundedRect(x + 6, y + 6, pw - 12, ph - 12, 13).setDepth(61));
    // 見出しの帯
    const bandW = Math.min(pw - 40, 380);
    const band = add(scene.add.graphics().setDepth(61));
    band.fillStyle(0x2a1430, 1); band.fillRoundedRect(w / 2 - bandW / 2, y - 18, bandW, 50, 14);
    band.lineStyle(3, 0xd8a83a, 1); band.strokeRoundedRect(w / 2 - bandW / 2, y - 18, bandW, 50, 14);
    add(scene.add.text(w / 2, y + 7, title, TB(w < 500 ? 24 : 28, '#fbeccb', '#2a160a', 5)).setOrigin(0.5).setDepth(62));
    scene.hideInput && scene.hideInput(true);
    let onKey = null;
    const slot = opt.slot || 'shopBox';
    const ui = {
      x, y, pw, ph, w, h, add,
      close() {
        if (ui.closed) return;
        ui.closed = true;
        if (ui.onClose) ui.onClose();
        objs.forEach(o => o.active && o.destroy());
        if (onKey) scene.input.keyboard.off('keydown', onKey);
        scene[slot] = null;
        scene.hideInput && scene.hideInput(false);
        scene.refreshPts && scene.refreshPts();
      },
    };
    const cbw = Math.min(200, pw - 40);
    add(button(scene, w / 2, y + ph - 34, cbw, 48, 'とじる', () => ui.close(), { color: 0x8a7e6e, dark: 0x4a4038, size: 22, brush: true }).setDepth(63));
    onKey = e => { if (e.key === 'Escape') ui.close(); };
    scene.time.delayedCall(200, () => !ui.closed && scene.input.keyboard.on('keydown', onKey));
    scene[slot] = ui;
    return ui;
  }

  // ---------------- ガチャ（妖怪ガチャ／装備ガチャ） ----------------
  function openGacha(scene) {
    if (scene.shopBox) return;
    const ui = overlay(scene, '🎲 ガチャ', 680, 760);
    const { x, y, pw, ph, w, add } = ui;
    const small = pw < 480;
    let kind = lsGet('gk', 'chara');
    let prof = null, busy = false;
    let shown = [];
    const clear = () => { shown.forEach(o => o.active && o.destroy()); shown = []; };
    const S = o => { shown.push(o); if (o.setDepth) o.setDepth(Math.max(o.depth || 0, 63)); return o; };

    // 文字・舞台・ボタン
    const ptsText = add(scene.add.text(w / 2, y + 100, '読み込み中…', TR(small ? 20 : 24, '#0a5a9a', '#ffffff', 5)).setOrigin(0.5).setDepth(62));
    add(scene.add.text(w / 2, y + 126, '5レベルごと・進化でポイントがもらえる', TR(13, SOFT)).setOrigin(0.5).setDepth(62));
    const rateText = add(scene.add.text(w / 2, y + 144, '', TR(small ? 11.5 : 13.5, INK, null, 0, { align: 'center', lineSpacing: 3, wordWrap: { width: pw - 36, useAdvancedWrap: true } })).setOrigin(0.5, 0).setDepth(62));
    const stageY = y + 196, stageH = Math.max(160, ph - 196 - 150);
    const stageG = add(scene.add.graphics().setDepth(61));
    stageG.fillStyle(0x1c1028, 0.96); stageG.fillRoundedRect(x + 16, stageY, pw - 32, stageH, 14);
    stageG.lineStyle(3, 0xc89a4a, 1); stageG.strokeRoundedRect(x + 16, stageY, pw - 32, stageH, 14);
    const hint = add(scene.add.text(w / 2, stageY + stageH / 2, '', TR(22, '#fff8ea', '#2a1f18', 5, { align: 'center' })).setOrigin(0.5).setDepth(62));
    const bw = Math.min(250, (pw - 50) / 2), by = stageY + stageH + 40;
    const b1 = add(button(scene, w / 2 - bw / 2 - 8, by, bw, 60, '1回  100P', () => pull(1), { color: 0xef7a6a, dark: 0xb24a3e, size: small ? 20 : 24, brush: true }).setDepth(63));
    const b10 = add(button(scene, w / 2 + bw / 2 + 8, by, bw, 60, '10連  1000P', () => pull(10), { color: 0xb060ff, dark: 0x7a3ab0, size: small ? 20 : 24, brush: true }).setDepth(63));
    b1.setDisabled(true); b10.setDisabled(true);
    const setPts = p => {
      prof = p;
      ptsText.setText(`ガチャポイント  ${p.pts.toLocaleString()}P`);
      b1.setDisabled(busy || p.pts < p.cost); b10.setDisabled(busy || p.pts < p.cost * 10);
    };

    // タブ
    const tabW = Math.min(250, (pw - 50) / 2), tabY = y + 56;
    let tabs = [];
    const drawTabs = () => {
      tabs.forEach(t => t.destroy());
      tabs = [['chara', '👹 妖怪ガチャ', 0xd0503e, 0x7a2418], ['item', '🗡 装備ガチャ', 0x3a8ae8, 0x1f4f8a]].map(([k, label, col, dark], i) => {
        const on = k === kind;
        const b = button(scene, w / 2 + (i ? 1 : -1) * (tabW / 2 + 6), tabY, tabW, 46, label, () => {
          if (kind === k || busy) return;
          kind = k; lsSet('gk', k); Sfx.play('click'); drawTabs(); refresh();
        }, { color: on ? col : 0xb8ab98, dark: on ? dark : 0x6a6050, size: small ? 17 : 21, brush: true }).setDepth(63);
        if (!on) b.setAlpha(0.8);
        return b;
      });
    };
    const refresh = () => {
      clear();
      if (kind === 'chara') {
        rateText.setText(`${GD.CHARA_RATES.map((r, i) => `${TIER_NAME[i]} ${r}%`).join('　')}　／　10連は★★以上が1体確定\n同じ妖怪が出ると★アップ（★2に1体・★3に2体・★4に4体・★5に8体）`);
        hint.setVisible(true).setText('どの妖怪が出るかな？');
      } else {
        rateText.setText(`${GD.RARITIES.map(r => `${r.name} ${r.rate}%`).join('　')}\n全${GD.ITEMS.length}種（遠距離・対人・守り・稼ぎ…）。出たアイテムは「装備」で妖怪に持たせる`);
        hint.setVisible(true).setText('何が出るかな？');
      }
    };
    const pull = n => {
      if (busy || !prof) return;
      busy = true; b1.setDisabled(true); b10.setDisabled(true);
      clear(); hint.setVisible(false);
      Sfx.play('card');
      const k = kind;
      Net.gacha(n, k).then(p => {
        busy = false;
        if (ui.closed) return;
        setPts(p);
        if (!p.got || !p.got.length) { hint.setVisible(true).setText('ポイントが足りません'); return; }
        if (k === 'chara') revealChara(p.got); else revealItem(p.got);
      }).catch(() => { busy = false; if (!ui.closed) { hint.setVisible(true).setText('サーバーにつながりません'); if (prof) setPts(prof); } });
    };
    // 光の玉 → はじけて登場（共通）
    const burst = (best, colOf, then) => {
      const cx = w / 2, cy = stageY + stageH / 2;
      const orb = S(scene.add.image(cx, cy, 'aura').setBlendMode(Phaser.BlendModes.ADD).setDisplaySize(40, 40));
      scene.tweens.add({
        targets: orb, displayWidth: 220, displayHeight: 220, duration: 650, ease: 'Quad.in',
        onUpdate: () => orb.setTint(colOf(Math.floor(Math.random() * (best + 1)))),
        onComplete: () => {
          if (ui.closed) return;
          orb.setTint(colOf(best));
          scene.tweens.add({ targets: orb, alpha: 0, displayWidth: 460, displayHeight: 460, duration: 400 });
          then();
        },
      });
    };
    const needLeft = d => { let acc = 0; for (const n of GD.STAR_NEED) { acc += n; if (d < acc) return acc - d; } return 0; };
    const revealChara = got => {
      const best = Math.max(...got.map(g => g.r));
      burst(best, i => TIER_COL[i], () => {
        const cx = w / 2;
        if (best >= 2) { scene.cameras.main.flash(300, 255, 240, 200); FX.confetti(scene, cx, stageY + 40, best === 3 ? 160 : 80, TIER_COL[best]); }
        Sfx.play(best >= 3 ? 'legend' : best >= 2 ? 'lvlBig' : best >= 1 ? 'capL' : 'cap');
        if (got.length === 1) {
          const g = got[0], sp = GD.SPECIES[g.c];
          const imgH = stageH * 0.5, imgY = stageY + 14 + imgH;
          const glow = S(scene.add.image(cx, imgY - imgH / 2, 'aura').setBlendMode(Phaser.BlendModes.ADD).setTint(TIER_COL[g.r]).setDisplaySize(imgH * 1.5, imgH * 1.5));
          scene.tweens.add({ targets: glow, alpha: 0.5, duration: 800, yoyo: true, repeat: -1 });
          const im = S(scene.add.image(cx, imgY, 'cr_' + g.c).setOrigin(0.5, 1));
          const sc = Math.min(imgH / im.height, (pw - 80) / im.width);
          im.setScale(sc * 0.3);
          scene.tweens.add({ targets: im, scale: sc, duration: 420, ease: 'Back.out' });
          const room = stageY + stageH - imgY;
          const f = Math.min(1, room / 130);
          S(scene.add.text(cx, imgY + 4, `${TIER_NAME[g.r]}  ${sp.name}`, TB((small ? 24 : 30) * f, '#fbeccb', '#2a160a', 5)).setOrigin(0.5, 0));
          S(scene.add.text(cx, imgY + 44 * f, stars(g.st), TR((small ? 20 : 24) * f, g.st >= 5 ? '#ff6a3a' : '#ffd23a', '#2a1408', 5)).setOrigin(0.5, 0));
          const msg = g.new ? ['NEW！ 仲間になった！', '#ffe07a'] : g.up ? [`★${g.st} にアップ！ 強くなった！`, '#ff7a5a']
            : g.rf ? [`★MAX！ ${g.rf}P もどってきた`, '#7ae8ff'] : [`+1体（★${g.st + 1}まであと${needLeft(g.d)}体）`, '#e8e0ff'];
          const mt = S(scene.add.text(cx, imgY + 78 * f, msg[0], TR((small ? 17 : 21) * f, msg[1], '#1a0a20', 5)).setOrigin(0.5, 0));
          if (g.new || g.up) scene.tweens.add({ targets: mt, scale: 1.08, duration: 400, yoyo: true, repeat: -1 });
          // ★レベルアップのゲージ（伸びるアニメつき）
          const gw = Math.min(300, pw - 100), gh = 16 * f;
          starGauge(scene, cx - gw / 2, imgY + 112 * f, gw, gh, g.d, { from: g.new || g.rf ? null : g.d - 1, delay: 500 }).forEach(S);
        } else {
          const cols = 5, rows = 2, cw = (pw - 52) / cols, rh = (stageH - 16) / rows;
          const size = Math.max(28, Math.min(cw - 12, rh - 60));
          got.forEach((g, i) => {
            const gx = x + 26 + cw * (i % cols) + cw / 2, gy = stageY + 8 + rh * Math.floor(i / cols) + size / 2 + 6;
            const parts = [];
            parts.push(S(scene.add.circle(gx, gy, size / 2 + 4, TIER_COL[g.r])));
            parts.push(S(scene.add.circle(gx, gy, size / 2, 0xfff6dc)));
            const ic = S(scene.add.image(gx, gy, 'ic_' + g.c)); ic.setScale((size - 4) / ic.height); parts.push(ic);
            const nm = S(scene.add.text(gx, gy + size / 2 + 6, GD.SPECIES[g.c].name, TR(small ? 11 : 13, '#fff8ea', '#1a0a20', 3)).setOrigin(0.5, 0));
            if (nm.width > cw - 4) nm.setScale((cw - 4) / nm.width);
            parts.push(nm);
            parts.push(S(scene.add.text(gx, gy + size / 2 + 24, '★'.repeat(g.st), TR(small ? 10 : 12, g.st >= 5 ? '#ff6a3a' : '#ffd23a', '#1a0a20', 3)).setOrigin(0.5, 0)));
            starGauge(scene, gx - (cw - 18) / 2, gy + size / 2 + 42, cw - 18, 7, g.d, { label: false }).forEach(o => { S(o); parts.push(o); });
            const badge = g.new ? ['NEW', '#ffe07a'] : g.up ? ['UP!', '#ff7a5a'] : g.rf ? [`+${g.rf}P`, '#7ae8ff'] : null;
            if (badge) parts.push(S(scene.add.text(gx + size / 2, gy - size / 2, badge[0], TR(small ? 11 : 13, badge[1], '#1a0a20', 4)).setOrigin(0.8, 0.3).setAngle(12)));
            parts.forEach(o => { o.setAlpha(0); scene.tweens.add({ targets: o, alpha: 1, delay: i * 90, duration: 220 }); });
          });
        }
      });
    };
    const revealItem = got => {
      const best = Math.max(...got.map(g => g.r));
      burst(best, i => GD.RARITIES[i].color, () => {
        const cx = w / 2, cy = stageY + stageH / 2;
        if (best >= 3) { scene.cameras.main.flash(300, 255, 240, 200); FX.confetti(scene, cx, cy - 40, best === 4 ? 140 : 70, GD.RARITIES[best].color); }
        Sfx.play(best >= 4 ? 'legend' : best >= 3 ? 'lvlBig' : best >= 2 ? 'capL' : 'cap');
        if (got.length === 1) {
          const g = got[0], ra = GD.RARITIES[g.r];
          itemIcon(scene, cx, cy - 30, g.t, g.r, Math.min(130, stageH * 0.42)).forEach(S);
          S(scene.add.text(cx, cy + stageH * 0.24, itemLabel(g.t, g.r), TR(small ? 22 : 26, ra.css, '#1a1020', 6)).setOrigin(0.5));
          const it = GD.ITEMS[g.t];
          S(scene.add.text(cx, cy + stageH * 0.24 + 24, `【${it.role}】${it.desc}`, TR(small ? 13 : 15, '#fff8ea', '#1a1020', 3, { align: 'center', wordWrap: { width: pw - 60, useAdvancedWrap: true } })).setOrigin(0.5, 0));
          S(scene.add.text(cx, cy + stageH * 0.24 + (small ? 62 : 50), GD.itemInfo(g.t, g.r), TR(small ? 12 : 13.5, '#ffe07a', '#1a1020', 3, { align: 'center', wordWrap: { width: pw - 60, useAdvancedWrap: true } })).setOrigin(0.5, 0));
        } else {
          const cols = 5, cw = (pw - 52) / cols, rh = (stageH - 16) / 2;
          got.forEach((g, i) => {
            const gx = x + 26 + cw * (i % cols) + cw / 2, gy = stageY + 8 + rh * Math.floor(i / cols) + rh / 2 - 8;
            itemIcon(scene, gx, gy, g.t, g.r, Math.min(cw, rh) * 0.5).forEach(o => { S(o); o.setAlpha(0); scene.tweens.add({ targets: o, alpha: 1, delay: i * 70, duration: 200 }); });
            S(scene.add.text(gx, gy + rh * 0.32, GD.ITEMS[g.t].name, TR(small ? 10 : 12, '#fff8ea', '#1a1020', 3)).setOrigin(0.5));
            S(scene.add.text(gx, gy + rh * 0.32 + (small ? 14 : 16), GD.RARITIES[g.r].name, TR(small ? 10 : 12, GD.RARITIES[g.r].css, '#1a1020', 3)).setOrigin(0.5));
          });
        }
      });
    };
    drawTabs(); refresh();
    ui.onClose = () => { clear(); tabs.forEach(t => t.destroy()); };
    Net.profile().then(p => { if (!ui.closed) setPts(p); }).catch(() => { if (!ui.closed) ptsText.setText('サーバーにつながりません'); });
  }

  // ---------------- 装備 ----------------
  function openEquip(scene) {
    if (scene.shopBox) return;
    const ui = overlay(scene, '🛡 装備', 760, 820);
    const { x, y, pw, ph, w, add } = ui;
    const small = pw < 480;
    const keys = GD.UNLOCKS.map(u => u[0]).filter(k => Unlock.ok(k));
    let sel = keys.includes(scene.sp) ? scene.sp : keys[0];
    let prof = null;
    const dyn = [];
    const clearDyn = () => { dyn.forEach(o => o.active && o.destroy()); dyn.length = 0; };
    const status = add(scene.add.text(w / 2, y + ph / 2, '読み込み中…', TR(18, SOFT)).setOrigin(0.5).setDepth(62));
    add(scene.add.text(w / 2, y + 48, '妖怪をえらんで、下のアイテムをタップで装備', TR(small ? 13 : 16, INK)).setOrigin(0.5).setDepth(62));
    add(scene.add.text(w / 2, y + 68, '装備ごとに役割がちがう：遠くを撃つ・人に強い・守る・稼ぐ など（カードの攻撃UPも乗る）', TR(small ? 11 : 12.5, SOFT, null, 0, { align: 'center', wordWrap: { width: pw - 30 } })).setOrigin(0.5, 0).setDepth(62));

    const draw = () => {
      clearDyn();
      if (!prof) return;
      status.setVisible(false);
      const D = o => { dyn.push(o); if (o.setDepth) o.setDepth(Math.max(o.depth || 0, 62)); return o; };
      // 妖怪
      const cols = Math.min(keys.length, small ? 6 : 9);
      const size = Math.min(54, Math.floor((pw - 30) / cols) - 8);
      const gap = Math.floor((pw - 20 - cols * size) / (cols + 1));
      const top = y + 100;
      keys.forEach((k, i) => {
        const col = i % cols, row = Math.floor(i / cols);
        const rowN = Math.min(cols, keys.length - row * cols);
        const rowW = rowN * size + (rowN - 1) * gap;
        const cx = w / 2 - rowW / 2 + size / 2 + col * (size + gap), cy = top + size / 2 + row * (size + gap + 4);
        if (k === sel) D(scene.add.circle(cx, cy, size / 2 + 5, 0xffd76a));
        D(scene.add.circle(cx, cy, size / 2, 0xfff6dc).setStrokeStyle(3, C.brown));
        const ic = D(scene.add.image(cx, cy, 'ic_' + k)); ic.setScale((size - 4) / ic.height);
        const eq = prof.eq[k];
        if (eq) { const r = Number(eq.split('_')[1]); D(scene.add.circle(cx + size * 0.36, cy + size * 0.36, 8, GD.RARITIES[r].color).setStrokeStyle(2, 0x2a1f18)); }
        D(scene.add.zone(cx, cy, size + 6, size + 6).setInteractive({ useHandCursor: true })).on('pointerdown', () => { sel = k; Sfx.play('click'); draw(); });
      });
      const rows = Math.ceil(keys.length / cols);
      let yy = top + rows * (size + gap + 4) + 2;
      // 装備中
      const cur = prof.eq[sel];
      const sp = GD.SPECIES[sel];
      const bar = D(scene.add.graphics());
      bar.fillStyle(0x2a1430, 0.92); bar.fillRoundedRect(x + 16, yy, pw - 32, 84, 12);
      if (cur) {
        const [t, r] = cur.split('_').map(Number);
        itemIcon(scene, x + 54, yy + 31, t, r, 40).forEach(D);
        D(scene.add.text(x + 88, yy + 8, `${sp.name} の装備`, TR(13, '#e8d8c0')));
        D(scene.add.text(x + 88, yy + 26, itemLabel(t, r) + `【${GD.ITEMS[t].role}】`, TR(small ? 15 : 19, GD.RARITIES[r].css, '#1a1020', 4)));
        D(scene.add.text(x + 26, yy + 56, GD.itemInfo(t, r), TR(small ? 11 : 13, '#ffe07a', '#1a1020', 3, { wordWrap: { width: pw - 70, useAdvancedWrap: true } })));
        D(button(scene, x + pw - 78, yy + 31, 106, 42, 'はずす', () => doEquip(null), { color: 0x8a7e6e, dark: 0x4a4038, size: 18, brush: true }));
      } else {
        D(scene.add.text(w / 2, yy + 31, `${sp.name} は何も装備していません`, TR(16, '#e8d8c0')).setOrigin(0.5));
      }
      yy += 94;
      // 持ち物（種類 × レアリティ の表）。広い画面は2列
      const gridBottom = y + ph - 66;
      const N = GD.ITEMS.length, gc = pw >= 640 ? 2 : 1, perCol = Math.ceil(N / gc);
      const colW = (pw - 32 - (gc - 1) * 12) / gc;
      const lw = small ? 62 : 84;
      const cw = (colW - lw) / 5, rh = Math.min(cw, (gridBottom - yy - 24) / perCol);
      for (let c = 0; c < gc; c++) {
        const gx0 = x + 16 + c * (colW + 12);
        GD.RARITIES.forEach((ra, r) => D(scene.add.text(gx0 + lw + cw * r + cw / 2, yy + 9, ra.name, TR(small ? 10 : 11.5, ra.css, '#2a1f18', 3)).setOrigin(0.5)));
      }
      GD.ITEMS.forEach((it, t) => {
        const c = Math.floor(t / perCol), gx0 = x + 16 + c * (colW + 12);
        const ry = yy + 22 + rh * (t % perCol) + rh / 2;
        D(scene.add.text(gx0 + lw / 2, ry - 7, it.name, TR(small ? 11 : 13, INK, null, 0, { align: 'center', wordWrap: { width: lw - 4, useAdvancedWrap: true } })).setOrigin(0.5));
        D(scene.add.text(gx0 + lw / 2, ry + 11, it.role, TR(small ? 9 : 10, '#8a4a1a', null, 0, { align: 'center' })).setOrigin(0.5));
        GD.RARITIES.forEach((ra, r) => {
          const cx = gx0 + lw + cw * r + cw / 2, key = t + '_' + r, n = prof.inv[key] || 0;
          const box = D(scene.add.rectangle(cx, ry, cw - 5, rh - 5, n ? 0x2a1f30 : 0x4a3a2e, n ? 0.92 : 0.12));
          if (cur === key) box.setStrokeStyle(4, 0xffd76a); else box.setStrokeStyle(1, 0x4a3a2e, 0.4);
          if (!n) { D(scene.add.text(cx, ry, '？', TR(16, '#b0a090')).setOrigin(0.5)); return; }
          itemIcon(scene, cx, ry - 1, t, r, Math.min(rh, cw) * 0.58).forEach(D);
          if (n > 1) D(scene.add.text(cx + (cw - 5) / 2 - 3, ry + (rh - 5) / 2 - 1, '×' + n, TR(12, '#fff', '#1a1020', 4)).setOrigin(1, 1));
          D(scene.add.zone(cx, ry, cw - 5, rh - 5).setInteractive({ useHandCursor: true })).on('pointerdown', () => doEquip(key));
        });
      });
    };
    const doEquip = key => {
      Sfx.play('click');
      Net.equip(sel, key).then(p => { prof = p; if (!ui.closed) { draw(); if (key) Sfx.play('cap'); } }).catch(() => {});
    };
    Net.profile().then(p => { prof = p; if (!ui.closed) draw(); }).catch(() => { if (!ui.closed) status.setText('サーバーにつながりません'); });
    ui.onClose = clearDyn;
  }

  window.Shop = { openGacha, openEquip, itemIcon, overlay, starGauge, starProg };
})();
