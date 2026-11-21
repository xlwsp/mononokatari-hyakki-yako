// ロビーの「やりこみ」画面：覚醒（★5のあとにポイントで強くする）・着せ替え・称号と実績（図鑑の進み具合つき）
(function () {
  'use strict';
  const { TR, TB, button } = UI;
  const INK = '#3a2414', SOFT = '#6a4a2a';
  const lsGet = (k, d) => { try { return localStorage.getItem('nakama_' + k) || d; } catch (e) { return d; } };
  const lsSet = (k, v) => { try { localStorage.setItem('nakama_' + k, v); } catch (e) { /* noop */ } };
  const pct = v => Math.round(v * 100) + '%';
  const statText = (stat, v) => (stat === 't' ? `${Math.floor(v / 3600)}時間` : stat === 'lv' ? `Lv${v}` : Number(v).toLocaleString());
  const goalText = (stat, g) => (stat === 't' ? `${Math.round(g / 3600)}時間` : stat === 'lv' ? `Lv${g}` : Number(g).toLocaleString());

  function open(scene) {
    if (scene.shopBox) return;
    const ui = Shop.overlay(scene, '🏯 やりこみ', 760, 820);
    const { x, y, pw, ph, w, add } = ui;
    const small = pw < 520;
    let tab = lsGet('xt', 'aw');
    let prof = null, busy = false;
    let dyn = [];
    const clear = () => { dyn.forEach(o => o.active && o.destroy()); dyn = []; };
    const D = o => { dyn.push(o); if (o.setDepth) o.setDepth(Math.max(o.depth || 0, 63)); return o; };
    const ptsText = add(scene.add.text(w / 2, y + 50, '読み込み中…', TR(small ? 18 : 21, '#0a5a9a', '#ffffff', 5)).setOrigin(0.5).setDepth(62));
    const top = y + 132, bottom = y + ph - 70;
    let sel = scene.sp;

    // タブ
    const TABS = [['aw', '✦ 覚醒', 0xe07a2a, 0x8a4010], ['cos', '🎨 着せ替え', 0xd0508a, 0x7a2450], ['ach', '🏅 称号・実績', 0xd8a020, 0x7a5a08]];
    let tabBtns = [];
    const drawTabs = () => {
      tabBtns.forEach(b => b.destroy());
      const tw = Math.min(220, (pw - 40) / 3 - 8);
      tabBtns = TABS.map(([k, label, col, dark], i) => {
        const on = k === tab;
        const b = button(scene, w / 2 + (i - 1) * (tw + 10), y + 92, tw, 44, label, () => {
          if (tab === k || busy) return;
          tab = k; lsSet('xt', k); Sfx.play('click'); drawTabs(); draw();
        }, { color: on ? col : 0xb8ab98, dark: on ? dark : 0x6a6050, size: small ? 15 : 19, brush: true }).setDepth(63);
        if (!on) b.setAlpha(0.8);
        return b;
      });
    };
    const act = promise => {
      if (busy) return;
      busy = true;
      promise.then(p => { busy = false; if (!ui.closed && p) { const before = prof; prof = p; draw(); after(before, p); } })
        .catch(() => { busy = false; if (!ui.closed) ptsText.setText('サーバーにつながりません'); });
    };
    // 実績のお知らせ（覚醒などで達成したとき）
    const after = (before, p) => {
      (p.box || []).forEach((b, i) => {
        const a = b.k === 'ach' ? GD.ACHIEVEMENTS[b.i - 1] : null;
        const msg = a ? `🏅 実績達成！ 称号【${a.title}】${b.pts ? ' +' + b.pts + 'P' : ''}` : b.m;
        if (!msg) return;
        scene.time.delayedCall(i * 1600, () => {
          const t = scene.add.text(w / 2, y + ph / 2, msg, TB(small ? 22 : 28, '#ffe07a', '#2a160a', 7)).setOrigin(0.5).setDepth(90).setScale(0.3);
          scene.tweens.add({ targets: t, scale: 1, duration: 280, ease: 'Back.out' });
          scene.tweens.add({ targets: t, alpha: 0, y: t.y - 30, delay: 1300, duration: 400, onComplete: () => t.destroy() });
          Sfx.play('legend');
        });
      });
    };

    // 妖怪をえらぶ列（覚醒・着せ替えのプレビュー用）
    const picker = (yy, size, onPick) => {
      const keys = GD.UNLOCKS.map(u => u[0]).filter(k => prof.chars[k] !== undefined);
      if (!keys.includes(sel)) sel = keys[0];
      const cols = Math.min(keys.length, small ? 7 : 13);
      const sz = Math.min(size, Math.floor((pw - 40) / cols) - 6), gap = Math.floor((pw - 30 - cols * sz) / (cols + 1));
      keys.forEach((k, i) => {
        const col = i % cols, row = Math.floor(i / cols);
        const rowN = Math.min(cols, keys.length - row * cols), rowW = rowN * sz + (rowN - 1) * gap;
        const cx = w / 2 - rowW / 2 + sz / 2 + col * (sz + gap), cy = yy + sz / 2 + row * (sz + 18);
        if (k === sel) D(scene.add.circle(cx, cy, sz / 2 + 5, 0xffd76a));
        D(scene.add.circle(cx, cy, sz / 2, 0xfff6dc).setStrokeStyle(3, 0x8a5a1a));
        const ic = D(scene.add.image(cx, cy, 'ic_' + k)); ic.setScale((sz - 4) / ic.height);
        const aw = (prof.aw || {})[k] || 0, st = GD.starOf(prof.chars[k] || 0);
        D(scene.add.text(cx, cy + sz / 2 + 1, aw ? `✦${aw}` : '★'.repeat(st), TR(aw ? 12 : 9, aw ? '#c05a10' : '#d89a10', '#fff', 3)).setOrigin(0.5, 0));
        D(scene.add.zone(cx, cy, sz + 6, sz + 6).setInteractive({ useHandCursor: true })).on('pointerdown', () => { sel = k; Sfx.play('click'); onPick(); });
      });
      const rows = Math.ceil(keys.length / cols);
      return yy + rows * (sz + 18) + 6;
    };

    // ---------- 覚醒 ----------
    const drawAwake = () => {
      let yy = picker(top, 50, draw);
      const sp = GD.SPECIES[sel], d = prof.chars[sel] || 0, st = GD.starOf(d), aw = (prof.aw || {})[sel] || 0;
      const g = D(scene.add.graphics());
      const boxH = bottom - yy - 6;
      g.fillStyle(0x1c1028, 0.95); g.fillRoundedRect(x + 18, yy, pw - 36, boxH, 14);
      g.lineStyle(3, 0xc89a4a, 1); g.strokeRoundedRect(x + 18, yy, pw - 36, boxH, 14);
      // 左：絵とオーラ / 右：説明
      const lx = x + 18 + Math.min(170, pw * 0.26), cy = yy + boxH * 0.45;
      const ac = aw ? GD.AWAKE_COLORS[Math.min(GD.AWAKE_COLORS.length - 1, Math.floor(aw / 5) + 1)] : 0x555566;
      const glow = D(scene.add.image(lx, cy, 'aura').setBlendMode(Phaser.BlendModes.ADD).setTint(ac).setDisplaySize(260, 260).setAlpha(aw ? 0.8 : 0.2));
      scene.tweens.add({ targets: glow, alpha: aw ? 0.45 : 0.1, yoyo: true, repeat: -1, duration: 900 });
      const img = D(scene.add.image(lx, cy, 'cr_' + sel + (st >= 5 ? '_e' : '')));
      img.setScale(Math.min(200 / img.width, 190 / img.height, small ? 0.75 : 1));
      D(scene.add.text(lx, yy + boxH - 30, `${sp.name}　${'★'.repeat(st)}`, TR(small ? 15 : 18, '#fff8ea', '#1a1020', 4)).setOrigin(0.5));
      const rx = x + 18 + Math.min(340, pw * 0.52), rw = x + pw - 36 - rx;
      let ty = yy + 18;
      D(scene.add.text(rx, ty, aw ? `覚醒 ${aw}段` : '未覚醒', TB(small ? 28 : 36, aw ? '#ffb84a' : '#c0b0a0', '#1a0a00', 6)));
      ty += small ? 46 : 56;
      const B = GD.awakeBonus(aw), nB = GD.awakeBonus(aw + 1);
      const line = (txt, col) => { const t = D(scene.add.text(rx, ty, txt, TR(small ? 13 : 16, col || '#fff8ea', '#1a1020', 3, { wordWrap: { width: rw, useAdvancedWrap: true } }))); ty += t.height + 8; };
      line(`いまの強さ：攻撃・スキル +${pct(B - 1)}　受けるダメージ -${pct(1 - 1 / (1 + 0.5 * (B - 1)))}`, '#ffe07a');
      if (st < 5) {
        const need = GD.STAR_NEED.reduce((a, b) => a + b, 0) - d;
        line(`★5にすると覚醒できます（あと${need}体）`, '#ff9a8a');
        line('ガチャで同じ妖怪を重ねて★5を目指そう。', '#d8c8b0');
      } else if (aw >= GD.AWAKE_MAX) {
        line('覚醒MAX！ これ以上は上がりません', '#ffb84a');
      } else {
        const cost = GD.awakeCost(aw);
        line(`次の段：攻撃・スキル +${pct(nB - 1)}`, '#bfe8ff');
        line(`5段ごとに、足もとの覚醒の輪の色が変わる（次の色まで あと${5 - (aw % 5)}段）`, '#d8c8b0');
        ty += 6;
        const bb = D(button(scene, rx + Math.min(rw, 300) / 2, ty + 30, Math.min(rw, 300), 60, `覚醒する  ${cost.toLocaleString()}P`, () => {
          Sfx.play('card'); act(Net.awaken(sel).then(p => { if (p && p.got === 'ok') { scene.cameras.main.flash(250, 255, 200, 120); Sfx.play('lvlBig'); if (window.FX) FX.confetti(scene, lx, cy, 60, ac); } return p; }));
        }, { color: 0xe07a2a, dark: 0x8a4010, size: small ? 19 : 23, brush: true }));
        if (prof.pts < cost) { bb.setDisabled(true); ty += 70; line('ポイントが足りません', '#ff9a8a'); }
      }
      D(scene.add.text(x + pw / 2, bottom + 2, '覚醒は★5の妖怪だけ。段が上がるほど必要なポイントも増える（ゆっくり強くなる）', TR(small ? 10.5 : 12, SOFT, null, 0, { align: 'center', wordWrap: { width: pw - 40 } })).setOrigin(0.5, 0));
    };

    // ---------- 着せ替え ----------
    let pending = null; // 「買う？」の確認中のもの
    const drawCos = () => {
      const own = new Set(prof.cos || []), cse = prof.cse || {};
      // 上：プレビュー（今えらんでいる妖怪に着せた見た目）
      let yy = top;
      const pvH = small ? 120 : 150;
      const g = D(scene.add.graphics());
      g.fillStyle(0x4a7a3a, 1); g.fillRoundedRect(x + 18, yy, pw - 36, pvH, 14);
      const pcx = w / 2, pcy = yy + pvH - 26;
      const ring = cse.ring ? GD.COSMETICS.ring[cse.ring - 1] : null;
      g.lineStyle(4, ring ? ring.col : 0xffd84f, 1); g.strokeEllipse(pcx, pcy, 110, 34);
      if (ring) { g.lineStyle(2, ring.col, 0.6); g.strokeEllipse(pcx, pcy, 132, 42); }
      const img = D(scene.add.image(pcx, pcy + 4, 'cr_' + sel).setOrigin(0.5, 1));
      img.setScale(Math.min(130 / img.width, (pvH - 40) / img.height));
      const tint = cse.tint ? GD.COSMETICS.tint[cse.tint - 1] : null;
      if (tint) {
        if (tint.col >= 0) img.setTint(tint.col);
        else { const o = { h: 0 }; scene.tweens.add({ targets: o, h: 1, duration: 2000, repeat: -1, onUpdate: () => img.active && img.setTint(Phaser.Display.Color.HSVToRGB(o.h, 0.35, 1).color) }); }
      }
      const nm = cse.nm ? GD.COSMETICS.nm[cse.nm - 1] : null;
      const tl = prof.tl ? GD.ACHIEVEMENTS[prof.tl - 1] : null;
      const name = (scene.registry && scene.registry.get && scene.registry.get('name')) || lsGet('name', 'あなた');
      const nt = D(scene.add.text(pcx, yy + 8, `${tl ? '【' + tl.title + '】' : ''}${name}`, TR(16, nm && nm.css ? nm.css : '#ffffff', '#2a1a20', 4)).setOrigin(0.5, 0));
      if (nm && !nm.css) { const o = { h: 0 }; scene.tweens.add({ targets: o, h: 1, duration: 1500, repeat: -1, onUpdate: () => { if (!nt.active) return; const c = Phaser.Display.Color.HSVToRGB(o.h, 0.55, 1); nt.setColor(Phaser.Display.Color.RGBToString(c.r, c.g, c.b)); } }); }
      D(scene.add.text(x + 30, yy + 8, '見た目だけ変わる（強さは同じ）', TR(11, '#e8ffe0', '#1a3010', 3)));
      yy += pvH + 10;
      // 下：種類ごとの品物
      const rowH = Math.min(78, (bottom - yy) / GD.COS_SLOTS.length);
      GD.COS_SLOTS.forEach((slot, si) => {
        const ry = yy + si * rowH;
        D(scene.add.text(x + 24, ry + 2, GD.COS_SLOT_NAME[slot], TR(small ? 13 : 15, INK)));
        const list = [{ name: 'なし', price: 0 }].concat(GD.COSMETICS[slot]);
        const bw = (pw - 48) / list.length - 6, bh = rowH - 30;
        list.forEach((it, i) => {
          const bx = x + 24 + i * (bw + 6) + bw / 2, by = ry + 24 + bh / 2;
          const has = i === 0 || own.has(`${slot}:${i}`), on = (cse[slot] || 0) === i;
          const key = `${slot}:${i}`;
          const label = on ? `✔ ${it.name}` : has ? it.name : pending === key ? '買う？' : `${it.name}\n${it.price.toLocaleString()}P`;
          const col = on ? 0xd8a020 : has ? 0x6a8a4a : pending === key ? 0xe0503e : 0x5a4a6a;
          const b = D(button(scene, bx, by, bw, bh, label, () => {
            if (busy) return;
            Sfx.play('click');
            if (has) { pending = null; if (!on) act(Net.cosmetic(slot, i, false)); return; }
            if (pending !== key) { pending = key; draw(); return; } // 1回目は確認だけ
            pending = null;
            act(Net.cosmetic(slot, i, true).then(p => { if (p) { Sfx.play('legend'); scene.cameras.main.flash(200, 255, 230, 240); } return p; }));
          }, { color: col, dark: 0x2a1f30, size: Math.min(small ? 11 : 14, bw / 5.5) }));
          if (!has && prof.pts < it.price && pending !== key) b.setAlpha(0.6);
          if (slot === 'tint' && it.col > 0) D(scene.add.circle(bx - bw / 2 + 9, by - bh / 2 + 9, 5, it.col).setStrokeStyle(1.5, 0x1a1020));
          if (slot === 'ring' && it.col) D(scene.add.circle(bx - bw / 2 + 9, by - bh / 2 + 9, 5, it.col).setStrokeStyle(1.5, 0x1a1020));
          if (slot === 'nm' && it.css) D(scene.add.circle(bx - bw / 2 + 9, by - bh / 2 + 9, 5, Phaser.Display.Color.HexStringToColor(it.css).color).setStrokeStyle(1.5, 0x1a1020));
        });
      });
    };

    // ---------- 称号・実績（図鑑） ----------
    const drawAch = () => {
      const have = new Set(prof.ach || []), st = prof.st || {};
      let yy = top;
      // 図鑑の進み具合
      const ownCh = Object.keys(prof.chars).length, totalCh = GD.SPECIES_KEYS.length;
      const itKinds = Object.keys(prof.inv).filter(k => prof.inv[k] > 0).length, totalIt = GD.ITEMS.length * GD.RARITIES.length;
      const s5 = Object.values(prof.chars).filter(v => v >= GD.STAR_NEED.reduce((a, b) => a + b, 0)).length;
      const g = D(scene.add.graphics());
      g.fillStyle(0x2a1430, 0.92); g.fillRoundedRect(x + 18, yy, pw - 36, 44, 12);
      D(scene.add.text(w / 2, yy + 22, `📖 図鑑　妖怪 ${ownCh}/${totalCh}　★5 ${s5}/${totalCh}　装備 ${itKinds}/${totalIt}　｜　称号 ${have.size}/${GD.ACHIEVEMENTS.length}`, TR(small ? 11.5 : 15, '#fff8ea', '#1a1020', 3)).setOrigin(0.5));
      yy += 54;
      if (prof.tl) D(button(scene, x + pw - 100, yy - 76, 140, 32, '称号をはずす', () => act(Net.title(0)), { color: 0x8a7e6e, dark: 0x4a4038, size: 13 }));
      // 一覧（2列）
      const cols = small ? 1 : 2, list = GD.ACHIEVEMENTS;
      const rows = Math.ceil(list.length / cols);
      const cw = (pw - 36 - (cols - 1) * 8) / cols, rh = Math.min(64, (bottom - yy) / rows);
      list.forEach((a, i) => {
        const c = Math.floor(i / rows), r = i % rows;
        const bx = x + 18 + c * (cw + 8), by = yy + r * rh;
        const got = have.has(a.id), on = prof.tl === i + 1;
        const v = st[a.stat] || 0, k = Math.min(1, v / a.goal);
        const gg = D(scene.add.graphics());
        gg.fillStyle(on ? 0x7a4a08 : got ? 0x4a3a10 : 0x2a1f30, 0.92); gg.fillRoundedRect(bx, by + 2, cw, rh - 4, 10);
        if (on) { gg.lineStyle(3, 0xffd76a, 1); gg.strokeRoundedRect(bx, by + 2, cw, rh - 4, 10); }
        const fs = Math.min(small ? 13 : 15, rh * 0.3);
        D(scene.add.text(bx + 10, by + 6, `${got ? '🏅' : '🔒'}【${a.title}】`, TR(fs, got ? '#ffe07a' : '#c8b8a8', '#1a1020', 3)));
        D(scene.add.text(bx + cw - 10, by + 6, a.pts ? `+${a.pts}P` : '', TR(fs * 0.85, '#9aff7a', '#1a1020', 3)).setOrigin(1, 0));
        D(scene.add.text(bx + 10, by + rh * 0.5, `${GD.ACH_STAT_NAME[a.stat]} ${goalText(a.stat, a.goal)}`, TR(fs * 0.78, '#e8d8c0', '#1a1020', 2)));
        if (!got) {
          const gw = cw * 0.38, gx = bx + cw - gw - 10, gy = by + rh * 0.55;
          gg.fillStyle(0x0c0816, 1); gg.fillRoundedRect(gx, gy, gw, 8, 4);
          if (k > 0) { gg.fillStyle(0xf0b030, 1); gg.fillRoundedRect(gx, gy, Math.max(8, gw * k), 8, 4); }
          D(scene.add.text(gx + gw / 2, gy - 1, `${statText(a.stat, Math.min(v, a.goal))}`, TR(9.5, '#fff', '#1a1020', 2)).setOrigin(0.5, 1));
        } else if (!on) {
          D(scene.add.text(bx + cw - 10, by + rh * 0.5, 'タップでつける', TR(fs * 0.75, '#ffd76a', '#1a1020', 2)).setOrigin(1, 0));
        }
        if (got) D(scene.add.zone(bx + cw / 2, by + rh / 2, cw, rh - 4).setInteractive({ useHandCursor: true })).on('pointerdown', () => { Sfx.play('click'); act(Net.title(on ? 0 : i + 1)); });
      });
    };

    const draw = () => {
      clear();
      if (!prof) return;
      ptsText.setText(`ガチャポイント  ${prof.pts.toLocaleString()}P`);
      if (tab === 'aw') drawAwake(); else if (tab === 'cos') drawCos(); else drawAch();
    };
    drawTabs();
    act(Net.profile());
    ui.onClose = () => { clear(); tabBtns.forEach(b => b.destroy()); };
  }

  window.Extra = { open };
})();
