// ロビーの「戦績」「道具屋」と、やられた画面の「通った道」
(function () {
  'use strict';
  const { TR, TB, button } = UI;
  const INK = '#2a1a3a', SOFT = '#5a4a6a';
  const fmtT = t => (t >= 3600 ? `${Math.floor(t / 3600)}時間${Math.floor(t % 3600 / 60)}分` : `${Math.floor(t / 60)}分${t % 60}秒`);
  const fmtDate = at => { const d = new Date(at * 1000); return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`; };
  const spName = r => (r.ev ? GD.SPECIES[r.sp].evoName : GD.SPECIES[r.sp].name);

  // ---------- 戦績 ----------
  function openRecords(scene) {
    if (scene.shopBox) return;
    const ui = Shop.overlay(scene, '📜 戦績', 760, 820);
    const { x, y, pw, ph, w, add } = ui;
    const small = pw < 520;
    let tab = 'sp', rec = null, dyn = [], tabBtns = [];
    const clear = () => { dyn.forEach(o => o.active && o.destroy()); dyn = []; };
    const D = o => { dyn.push(o); if (o.setDepth) o.setDepth(Math.max(o.depth || 0, 63)); return o; };
    const top = y + 118, bottom = y + ph - 70;
    const status = add(scene.add.text(w / 2, y + ph / 2, '読み込み中…', TR(18, SOFT)).setOrigin(0.5).setDepth(62));
    const TABS = [['sp', '妖怪ごと'], ['run', '最近のプレイ'], ['best', '名勝負']];
    const drawTabs = () => {
      tabBtns.forEach(b => b.destroy());
      const tw = Math.min(200, (pw - 40) / 3 - 8);
      tabBtns = TABS.map(([k, label], i) => {
        const b = button(scene, w / 2 + (i - 1) * (tw + 10), y + 66, tw, 42, label, () => { if (tab !== k) { tab = k; Sfx.play('click'); drawTabs(); draw(); } },
          { night: true, accent: k === tab ? 0xffd76a : undefined, size: small ? 15 : 18 }).setDepth(63);
        if (k !== tab) b.setAlpha(0.7);
        return b;
      });
    };
    const icon = (k, cx, cy, sz, ev) => { const ic = D(scene.add.image(cx, cy, 'ic_' + k + (ev ? '_e' : ''))); ic.setScale(sz / ic.height); return ic; };
    const row = (yy, h, i) => { const g = D(scene.add.graphics()); g.fillStyle(i % 2 ? 0xe6dcef : 0xf3ecf8, 1); g.fillRoundedRect(x + 16, yy, pw - 32, h - 3, 8); };

    const drawSp = () => {
      const best = rec.best || {};
      const keys = GD.SPECIES_KEYS;
      const rh = Math.min(48, (bottom - top - 26) / keys.length);
      const cols = small ? [0.13, 0.42, 0.58, 0.76, 0.92] : [0.1, 0.36, 0.52, 0.7, 0.88];
      ['妖怪', '最高Lv', '最高スコア', '最多キル', '回数'].forEach((t, i) => D(scene.add.text(x + pw * cols[i], top, t, TR(small ? 11 : 13, SOFT)).setOrigin(i ? 0.5 : 0, 0)));
      keys.forEach((k, i) => {
        const yy = top + 22 + i * rh, b = best[k];
        row(yy, rh, i);
        icon(k, x + 34, yy + rh / 2 - 1, rh - 8, b && b.lv >= GD.EVOLVE_LV);
        D(scene.add.text(x + 58, yy + rh / 2 - 1, GD.SPECIES[k].name, TR(small ? 12 : 15, INK)).setOrigin(0, 0.5));
        const v = b ? [`Lv${b.lv}`, b.sc.toLocaleString(), `${b.pk}人`, `${b.n}回`] : ['―', '―', '―', '―'];
        v.forEach((t, j) => D(scene.add.text(x + pw * cols[j + 1], yy + rh / 2 - 1, t, TR(small ? 12 : 15, b ? INK : '#9a90a8')).setOrigin(0.5, 0.5)));
      });
    };
    const runRow = (r, yy, rh, i, hl) => {
      row(yy, rh, i);
      icon(r.sp, x + 34, yy + rh / 2 - 1, rh - 10, r.ev);
      const fs = small ? 11.5 : 14;
      D(scene.add.text(x + 58, yy + 5, `${spName(r)}  Lv${r.lv}　スコア ${r.sc.toLocaleString()}`, TR(fs, INK)));
      D(scene.add.text(x + 58, yy + rh / 2 + 2, `${fmtDate(r.at)}　${fmtT(r.t)}　撃破${r.k}　キル${r.pk}人　${r.by ? r.by + 'に倒された' : '敵にやられた'}`, TR(fs * 0.8, SOFT)));
      if (hl) D(scene.add.text(x + pw - 26, yy + rh / 2 - 1, hl, TR(fs * 1.1, '#c0501a')).setOrigin(1, 0.5));
    };
    const drawRuns = () => {
      const runs = (rec.runs || []).slice().reverse();
      if (!runs.length) { D(scene.add.text(w / 2, top + 60, 'まだ記録がありません\n（やられるまでが1回のプレイ）', TR(16, SOFT, null, 0, { align: 'center' })).setOrigin(0.5)); return; }
      const rh = 50, n = Math.floor((bottom - top) / rh);
      runs.slice(0, n).forEach((r, i) => runRow(r, top + i * rh, rh, i));
      if (runs.length > n) D(scene.add.text(w / 2, bottom + 2, `ほか ${runs.length - n} 件（最近${runs.length}件まで記録）`, TR(11, SOFT)).setOrigin(0.5, 0));
    };
    const drawBest = () => {
      const half = (bottom - top) / 2;
      [['top_sc', '🏆 スコアが高かったプレイ', r => r.sc.toLocaleString()], ['top_pk', '⚔ いちばんキルしたプレイ', r => `${r.pk}人`]].forEach(([key, title, hl], s) => {
        const list = rec[key] || [], yy0 = top + s * half;
        D(scene.add.text(x + 20, yy0, title, TB(small ? 16 : 19, '#3a2a5a', '#ffffff', 3)));
        if (!list.length) { D(scene.add.text(x + 30, yy0 + 34, 'まだ記録がありません', TR(13, SOFT))); return; }
        const rh = Math.min(46, (half - 34) / 5);
        list.slice(0, 5).forEach((r, i) => runRow(r, yy0 + 30 + i * rh, rh, i, `${i + 1}位 ${hl(r)}`));
      });
    };
    const draw = () => {
      clear();
      if (!rec) return;
      if (tab === 'sp') drawSp(); else if (tab === 'run') drawRuns(); else drawBest();
    };
    drawTabs();
    Net.records().then(r => { if (ui.closed) return; status.destroy(); rec = r || {}; draw(); })
      .catch(() => { if (!ui.closed) status.setText('サーバーにつながりません'); });
    ui.onClose = () => { clear(); tabBtns.forEach(b => b.destroy()); };
  }

  // ---------- 道具屋（使い捨ての道具） ----------
  function openItemShop(scene) {
    if (scene.shopBox) return;
    const ui = Shop.overlay(scene, '🧪 道具屋', 700, 760);
    const { x, y, pw, ph, w, add } = ui;
    const small = pw < 520;
    let prof = null, busy = false, dyn = [];
    const clear = () => { dyn.forEach(o => o.active && o.destroy()); dyn = []; };
    const D = o => { dyn.push(o); if (o.setDepth) o.setDepth(Math.max(o.depth || 0, 63)); return o; };
    const ptsText = add(scene.add.text(w / 2, y + 52, '読み込み中…', TR(small ? 17 : 20, '#0a5a9a', '#ffffff', 5)).setOrigin(0.5).setDepth(62));
    const act = pr => {
      if (busy) return; busy = true;
      pr.then(p => { busy = false; if (!ui.closed && p) { prof = p; draw(); } }).catch(() => { busy = false; if (!ui.closed) ptsText.setText('サーバーにつながりません'); });
    };
    const draw = () => {
      clear();
      if (!prof) return;
      ptsText.setText(`ガチャポイント  ${prof.pts.toLocaleString()}P`);
      const cons = prof.cons || {}, bag = prof.bag || [];
      let yy = y + 78;
      D(scene.add.text(w / 2, yy, `1回のプレイ（やられるまで）で、えらんだ道具を1つずつ使えます。持っていけるのは${GD.CONS_SLOTS}種類まで。\nゲーム中は右下のボタンか Z / X / C キーで使う（使わなければ減らない）`, TR(small ? 11 : 13, '#4a3a5a', null, 0, { align: 'center', wordWrap: { width: pw - 40 } })).setOrigin(0.5, 0));
      yy += small ? 58 : 50;
      const rh = Math.min(104, (y + ph - 80 - yy) / GD.CONSUMABLES.length);
      GD.CONSUMABLES.forEach((c, i) => {
        const ry = yy + i * rh, have = cons[c.id] || 0, on = bag.includes(c.id);
        const g = D(scene.add.graphics());
        g.fillStyle(on ? 0xfff0c8 : 0xf3ecf8, 1); g.fillRoundedRect(x + 16, ry, pw - 32, rh - 6, 12);
        g.lineStyle(on ? 3 : 1.5, on ? 0xd8a020 : 0x9a88c0, 1); g.strokeRoundedRect(x + 16, ry, pw - 32, rh - 6, 12);
        D(scene.add.text(x + 46, ry + (rh - 6) / 2, c.icon, { fontSize: small ? '30px' : '38px' }).setOrigin(0.5));
        D(scene.add.text(x + 80, ry + 8, `${c.name}　${c.price}P`, TR(small ? 14 : 17, INK)));
        D(scene.add.text(x + 80, ry + (small ? 30 : 34), c.desc, TR(small ? 11 : 13, SOFT, null, 0, { wordWrap: { width: pw - 330, useAdvancedWrap: true } })));
        D(scene.add.text(x + 80, ry + rh - 26, `持っている数：${have}`, TR(small ? 11 : 13, have ? '#2a7a2a' : '#9a90a8')));
        const bx = x + pw - 30, bw = small ? 64 : 84, bh = Math.min(34, (rh - 18) / 2);
        const b1 = D(button(scene, bx - bw / 2 - bw - 8, ry + 6 + bh / 2, bw, bh, '1個買う', () => act(Net.consBuy(c.id, 1)), { night: true, size: small ? 11 : 13 }));
        const b5 = D(button(scene, bx - bw / 2, ry + 6 + bh / 2, bw, bh, '5個買う', () => act(Net.consBuy(c.id, 5)), { night: true, size: small ? 11 : 13 }));
        if (prof.pts < c.price) b1.setDisabled(true);
        if (prof.pts < c.price * 5) b5.setDisabled(true);
        const full = !on && bag.length >= GD.CONS_SLOTS;
        const bt = D(button(scene, bx - bw - 4, ry + rh - 14 - bh / 2, bw * 2 + 8, bh, on ? '✔ 持っていく' : full ? '（いっぱい）' : '持っていく', () => {
          const nb = on ? bag.filter(k => k !== c.id) : bag.concat([c.id]);
          act(Net.consBag(nb));
        }, { night: true, accent: on ? 0xffd76a : undefined, size: small ? 11 : 13 }));
        if (full) bt.setDisabled(true);
      });
    };
    act(Net.profile());
    ui.onClose = () => clear();
  }

  // ---------- 通った道（やられた画面から） ----------
  const MARK = { pk: ['⚔', 'プレイヤーをたおした！'], boss: ['👹', 'ボスをたおした！'], evo: ['✨', '進化した！'], dead: ['💀', 'ここでやられた…'] };
  function openRoute(scene, rt, seed) {
    if (!rt || !rt.r || rt.r.length < 2 || scene.routeBox) return;
    const ui = Shop.overlay(scene, '🗺 通った道', 680, 800, { slot: 'routeBox' });
    const { x, y, pw, ph, w, add } = ui;
    const W = rt.w[0], H = rt.w[1];
    const mw = pw - 40, mh = Math.min(ph - 260, mw * H / W);
    const sc = Math.min(mw / W, mh / H), ox = w / 2 - W * sc / 2, oy = y + 66;
    const P = (px, py) => [ox + px * sc, oy + py * sc];
    const g = add(scene.add.graphics().setDepth(62));
    // 地図：夜の森と小道
    g.fillStyle(0x1e2c34, 1); g.fillRoundedRect(ox - 6, oy - 6, W * sc + 12, H * sc + 12, 10);
    g.lineStyle(2, 0xffffff, 0.8); g.strokeRoundedRect(ox - 6, oy - 6, W * sc + 12, H * sc + 12, 10);
    try {
      const map = GD.generateMap(seed);
      g.lineStyle(Math.max(2, 70 * sc), 0x55527a, 0.7);
      for (const path of map.paths) { g.beginPath(); path.forEach((pt, i) => { const [a, b] = P(pt.x, pt.y); if (i) g.lineTo(a, b); else g.moveTo(a, b); }); g.strokePath(); }
    } catch (e) { /* 地図なしでも道は描く */ }
    const [cx, cy] = P(W / 2, H / 2);
    g.fillStyle(0x6e6a98, 0.8); g.fillCircle(cx, cy, Math.max(6, 260 * sc));
    // 通った道（はじめ＝水色 → おわり＝赤）
    const r = rt.r, n = r.length / 2;
    for (let i = 1; i < n; i++) {
      const k = i / n, c = Phaser.Display.Color.Interpolate.ColorWithColor({ r: 110, g: 230, b: 255 }, { r: 255, g: 90, b: 80 }, 100, k * 100);
      const [a1, b1] = P(r[i * 2 - 2], r[i * 2 - 1]), [a2, b2] = P(r[i * 2], r[i * 2 + 1]);
      if (Math.hypot(a2 - a1, b2 - b1) > 120) continue; // ワープした所はつながない
      g.lineStyle(3, Phaser.Display.Color.GetColor(c.r, c.g, c.b), 0.95); g.lineBetween(a1, b1, a2, b2);
    }
    const [sx, sy] = P(r[0], r[1]);
    add(scene.add.text(sx, sy, '🚩', { fontSize: '18px' }).setOrigin(0.2, 1).setDepth(63));
    // できごと
    const marks = rt.m || [];
    const tip = add(scene.add.text(w / 2, oy + H * sc + 14, 'マークをタップすると説明が出るよ', TR(13, SOFT)).setOrigin(0.5, 0).setDepth(63));
    marks.forEach(m => {
      const def = MARK[m[0]]; if (!def) return;
      const [a, b] = P(m[1], m[2]);
      const t = add(scene.add.text(a, b, def[0], { fontSize: m[0] === 'dead' ? '22px' : '17px' }).setOrigin(0.5).setDepth(64));
      t.setInteractive({ useHandCursor: true }).on('pointerdown', () => { Sfx.play('click'); tip.setText(`${def[0]} ${def[1]}（${fmtT(m[3] || 0)}）`).setColor(INK); });
    });
    // まとめ
    const cnt = k => marks.filter(m => m[0] === k).length;
    add(scene.add.text(w / 2, oy + H * sc + 40, `🚩スタート → 💀やられた所　｜　⚔ キル ${cnt('pk')}　👹 ボス ${cnt('boss')}　✨ 進化 ${cnt('evo')}`, TR(pw < 480 ? 12 : 14, INK, null, 0, { align: 'center', wordWrap: { width: pw - 40 } })).setOrigin(0.5, 0).setDepth(63));
    add(scene.add.text(w / 2, oy + H * sc + 66, '線の色：水色＝はじめのころ → 赤＝さいご', TR(12, SOFT)).setOrigin(0.5, 0).setDepth(63));
  }

  window.Records = { openRecords, openItemShop, openRoute };
})();
