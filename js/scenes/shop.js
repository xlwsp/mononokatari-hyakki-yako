// ロビーの「ガチャ」と「装備」画面
(function () {
  'use strict';
  const { T, TO, C, panel, button } = UI;

  const itemLabel = (t, r) => `${GD.RARITIES[r].name} ${GD.ITEMS[t].name}`;

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

  // 共通：暗幕＋パネル。close() で全部消える
  function overlay(scene, title, pw, ph) {
    const w = scene.scale.width, h = scene.scale.height;
    pw = Math.min(pw, w - 16); ph = Math.min(ph, h - 16);
    const x = w / 2 - pw / 2, y = h / 2 - ph / 2;
    const objs = [];
    const add = o => { objs.push(o); if (o.setDepth && !o._d) o.setDepth(Math.max(o.depth || 0, 61)); return o; };
    add(scene.add.rectangle(0, 0, w, h, 0x1d1020, 0.7).setOrigin(0).setInteractive().setDepth(60));
    add(panel(scene, x, y, pw, ph, { alpha: 1 }).setDepth(61));
    add(scene.add.text(w / 2, y + 30, title, TO(w < 500 ? 24 : 28, '#ffe07a', '#4a3a2e', 6)).setOrigin(0.5).setDepth(62));
    scene.hideInput && scene.hideInput(true);
    let onKey = null;
    const ui = {
      x, y, pw, ph, w, h, add,
      close() {
        objs.forEach(o => o.active && o.destroy());
        if (onKey) scene.input.keyboard.off('keydown', onKey);
        scene.shopBox = null;
        scene.hideInput && scene.hideInput(false);
        scene.refreshPts && scene.refreshPts();
      },
    };
    add(button(scene, w / 2, y + ph - 32, 150, 44, 'とじる', () => ui.close(), { color: C.gray, dark: C.grayDark, size: 18 }).setDepth(63));
    onKey = e => { if (e.key === 'Escape') ui.close(); };
    scene.time.delayedCall(200, () => scene.shopBox === ui && scene.input.keyboard.on('keydown', onKey));
    scene.shopBox = ui;
    return ui;
  }

  // ---------------- ガチャ ----------------
  function openGacha(scene) {
    if (scene.shopBox) return;
    const ui = overlay(scene, '🎲 ガチャ', 540, 620);
    const { x, y, pw, ph, w, add } = ui;
    const ptsText = add(scene.add.text(w / 2, y + 62, '読み込み中…', TO(20, '#7ae8ff', '#1a2a40', 5)).setOrigin(0.5).setDepth(62));
    add(scene.add.text(w / 2, y + 88, '5レベルごとにポイント（高レベルほど多い）・進化で100P', T(13, C.soft)).setOrigin(0.5).setDepth(62));
    const rates = GD.RARITIES.map(r => `${r.name} ${r.rate}%`).join('　');
    add(scene.add.text(w / 2, y + 108, rates, T(11, C.soft, { align: 'center', wordWrap: { width: pw - 30 } })).setOrigin(0.5, 0).setDepth(62));
    const stageY = y + 128, stageH = ph - 128 - 140;
    const stage = add(scene.add.rectangle(w / 2, stageY + stageH / 2, pw - 30, stageH, 0x2a1f30, 0.92).setDepth(61));
    stage.setStrokeStyle(3, 0x4a3a2e);
    let shown = [];
    const clear = () => { shown.forEach(o => o.active && o.destroy()); shown = []; };
    const hint = add(scene.add.text(w / 2, stageY + stageH / 2, '何が出るかな？', TO(22, '#fff8ea', '#2a1f18', 5)).setOrigin(0.5).setDepth(62));
    let prof = null, busy = false;
    const setPts = p => { prof = p; ptsText.setText(`ガチャポイント  ${p.pts}P`); b1.setDisabled(p.pts < p.cost); b10.setDisabled(p.pts < p.cost * 10); };
    const pull = n => {
      if (busy || !prof) return;
      busy = true; b1.setDisabled(true); b10.setDisabled(true);
      clear(); hint.setVisible(false);
      Sfx.play('card');
      Net.gacha(n).then(p => {
        busy = false;
        if (ui.closed || !ptsText.active) return;
        setPts(p);
        if (!p.got || !p.got.length) { hint.setVisible(true).setText('ポイントが足りません'); return; }
        reveal(p.got);
      }).catch(() => { busy = false; if (hint.active) hint.setVisible(true).setText('サーバーにつながりません'); });
    };
    const reveal = got => {
      if (ui.closed) return;
      const best = Math.max(...got.map(g => g.r));
      const cx = w / 2, cy = stageY + stageH / 2;
      // 光の玉 → はじけて登場
      const orb = scene.add.image(cx, cy, 'aura').setBlendMode(Phaser.BlendModes.ADD).setDisplaySize(40, 40).setDepth(64);
      shown.push(orb);
      scene.tweens.add({
        targets: orb, displayWidth: 200, displayHeight: 200, duration: 600, ease: 'Quad.in',
        onUpdate: () => orb.setTint(GD.RARITIES[Math.floor(Math.random() * (best + 1))].color),
        onComplete: () => {
          if (ui.closed) { orb.destroy(); return; }
          orb.setTint(GD.RARITIES[best].color);
          scene.tweens.add({ targets: orb, alpha: 0, displayWidth: 420, displayHeight: 420, duration: 380, onComplete: () => orb.destroy() });
          if (best >= 3) { scene.cameras.main.flash(300, 255, 240, 200); FX.confetti(scene, cx, cy - 40, best === 4 ? 140 : 70, GD.RARITIES[best].color); }
          Sfx.play(best >= 4 ? 'legend' : best >= 3 ? 'lvlBig' : best >= 2 ? 'capL' : 'cap');
          if (got.length === 1) {
            const g = got[0];
            itemIcon(scene, cx, cy - 18, g.t, g.r, Math.min(110, stageH * 0.5)).forEach(o => { o.setDepth(63); shown.push(o); });
            const ra = GD.RARITIES[g.r];
            shown.push(scene.add.text(cx, cy + stageH * 0.3, itemLabel(g.t, g.r), TO(24, ra.css, '#1a1020', 6)).setOrigin(0.5).setDepth(64));
            shown.push(scene.add.text(cx, cy + stageH * 0.3 + 28, `${GD.ITEMS[g.t].desc}・まわり8方向`, T(13, '#fff8ea')).setOrigin(0.5).setDepth(64));
          } else {
            const cols = 5, cw = (pw - 50) / cols, rh = Math.min(cw, stageH / 2 - 6);
            got.forEach((g, i) => {
              const gx = x + 25 + cw * (i % cols) + cw / 2, gy = stageY + 10 + rh * Math.floor(i / cols) + rh / 2 - 6;
              const icons = itemIcon(scene, gx, gy, g.t, g.r, rh * 0.48);
              icons.forEach(o => { o.setDepth(63); shown.push(o); o.setAlpha(0); scene.tweens.add({ targets: o, alpha: 1, delay: i * 70, duration: 200 }); });
              shown.push(scene.add.text(gx, gy + rh * 0.36, GD.RARITIES[g.r].name, TO(11, GD.RARITIES[g.r].css, '#1a1020', 3)).setOrigin(0.5).setDepth(64));
            });
          }
        },
      });
    };
    const bw = Math.min(200, (pw - 50) / 2);
    const b1 = add(button(scene, w / 2 - bw / 2 - 8, y + ph - 90, bw, 50, '1回 100P', () => pull(1), { color: 0xef7a6a, dark: 0xb24a3e, size: 20 }).setDepth(63));
    const b10 = add(button(scene, w / 2 + bw / 2 + 8, y + ph - 90, bw, 50, '10連 1000P', () => pull(10), { color: 0xb060ff, dark: 0x7a3ab0, size: 20 }).setDepth(63));
    b1.setDisabled(true); b10.setDisabled(true);
    const oldClose = ui.close;
    ui.close = () => { ui.closed = true; clear(); oldClose(); };
    Net.profile().then(p => { if (ptsText.active) setPts(p); }).catch(() => { if (ptsText.active) ptsText.setText('サーバーにつながりません'); });
  }

  // ---------------- 装備 ----------------
  function openEquip(scene) {
    if (scene.shopBox) return;
    const ui = overlay(scene, '🛡 装備', 560, 680);
    const { x, y, pw, ph, w, add } = ui;
    const keys = GD.UNLOCKS.map(u => u[0]).filter(k => Unlock.ok(k));
    let sel = keys.includes(scene.sp) ? scene.sp : keys[0];
    let prof = null;
    const dyn = [];
    const clearDyn = () => { dyn.forEach(o => o.active && o.destroy()); dyn.length = 0; };
    const status = add(scene.add.text(w / 2, y + ph / 2, '読み込み中…', T(16, C.soft)).setOrigin(0.5).setDepth(62));
    add(scene.add.text(w / 2, y + 58, 'モンスターをえらんで、アイテムをタップで装備', T(13, C.soft)).setOrigin(0.5).setDepth(62));

    const draw = () => {
      clearDyn();
      if (!prof) return;
      status.setVisible(false);
      const D = o => { dyn.push(o); if (o.setDepth) o.setDepth(Math.max(o.depth || 0, 62)); return o; };
      // モンスター
      const cols = Math.min(keys.length, pw < 420 ? 7 : 9);
      const size = Math.min(44, Math.floor((pw - 30) / cols) - 6);
      const gap = Math.floor((pw - 20 - cols * size) / (cols + 1));
      const top = y + 76;
      keys.forEach((k, i) => {
        const col = i % cols, row = Math.floor(i / cols);
        const rowN = Math.min(cols, keys.length - row * cols);
        const rowW = rowN * size + (rowN - 1) * gap;
        const cx = w / 2 - rowW / 2 + size / 2 + col * (size + gap), cy = top + size / 2 + row * (size + gap);
        if (k === sel) D(scene.add.circle(cx, cy, size / 2 + 4, 0xffd76a));
        D(scene.add.circle(cx, cy, size / 2, 0xfff6dc).setStrokeStyle(2, C.brown));
        const ic = D(scene.add.image(cx, cy, 'ic_' + k)); ic.setScale((size - 4) / ic.height);
        const eq = prof.eq[k];
        if (eq) { const [t, r] = eq.split('_').map(Number); D(scene.add.circle(cx + size * 0.36, cy + size * 0.36, 7, GD.RARITIES[r].color).setStrokeStyle(2, 0x2a1f18)); }
        D(scene.add.zone(cx, cy, size + 6, size + 6).setInteractive({ useHandCursor: true })).on('pointerdown', () => { sel = k; Sfx.play('click'); draw(); });
      });
      const rows = Math.ceil(keys.length / cols);
      let yy = top + rows * (size + gap) + 6;
      // 装備中
      const cur = prof.eq[sel];
      D(scene.add.rectangle(w / 2, yy + 26, pw - 30, 52, 0x4a3a2e, 0.08));
      const sp = GD.SPECIES[sel];
      if (cur) {
        const [t, r] = cur.split('_').map(Number);
        itemIcon(scene, x + 46, yy + 26, t, r, 36).forEach(D);
        D(scene.add.text(x + 76, yy + 14, `${sp.name} の装備`, T(12, C.soft)));
        D(scene.add.text(x + 76, yy + 30, itemLabel(t, r), TO(17, GD.RARITIES[r].css, '#2a1f18', 4)));
        D(button(scene, x + pw - 70, yy + 26, 100, 36, 'はずす', () => doEquip(null), { color: C.gray, dark: C.grayDark, size: 15 }));
      } else {
        D(scene.add.text(w / 2, yy + 26, `${sp.name} は何も装備していません`, T(15, C.soft)).setOrigin(0.5));
      }
      yy += 62;
      // 持ち物（種類 × レアリティ の表）
      const gridBottom = y + ph - 64;
      const cw = (pw - 70) / 5, rh = Math.min(cw, (gridBottom - yy - 24) / 4);
      GD.RARITIES.forEach((ra, r) => D(scene.add.text(x + 52 + cw * r + cw / 2, yy + 8, ra.name, TO(11, ra.css, '#2a1f18', 3)).setOrigin(0.5)));
      GD.ITEMS.forEach((it, t) => {
        const ry = yy + 20 + rh * t + rh / 2;
        D(scene.add.text(x + 30, ry, it.name, T(11, C.brownCss, { align: 'center', wordWrap: { width: 44 } })).setOrigin(0.5));
        GD.RARITIES.forEach((ra, r) => {
          const cx = x + 52 + cw * r + cw / 2, key = t + '_' + r, n = prof.inv[key] || 0;
          const box = D(scene.add.rectangle(cx, ry, cw - 6, rh - 6, n ? 0x2a1f30 : 0x4a3a2e, n ? 0.9 : 0.12));
          if (cur === key) box.setStrokeStyle(3, 0xffd76a); else box.setStrokeStyle(1, 0x4a3a2e, 0.4);
          if (!n) { D(scene.add.text(cx, ry, '？', T(16, '#b0a090')).setOrigin(0.5)); return; }
          itemIcon(scene, cx, ry - 2, t, r, Math.min(rh, cw) * 0.5).forEach(D);
          if (n > 1) D(scene.add.text(cx + (cw - 6) / 2 - 4, ry + (rh - 6) / 2 - 2, '×' + n, TO(11, '#fff', '#1a1020', 3)).setOrigin(1, 1));
          D(scene.add.zone(cx, ry, cw - 6, rh - 6).setInteractive({ useHandCursor: true })).on('pointerdown', () => doEquip(key));
        });
      });
    };
    const doEquip = key => {
      Sfx.play('click');
      Net.equip(sel, key).then(p => { prof = p; if (status.active) { draw(); if (key) Sfx.play('cap'); } }).catch(() => {});
    };
    Net.profile().then(p => { prof = p; if (status.active) draw(); }).catch(() => { if (status.active) status.setText('サーバーにつながりません'); });
    const oldClose = ui.close;
    ui.close = () => { clearDyn(); oldClose(); };
  }

  window.Shop = { openGacha, openEquip, itemIcon };
})();
