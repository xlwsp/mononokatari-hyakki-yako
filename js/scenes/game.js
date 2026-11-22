// ゲーム本編の描画シーン（サーバーから届くスナップショットを補間して表示する）
(function () {
  'use strict';
  const { TO, TR } = UI;
  // 夜の色：地面や木だけを月明かりの青に寄せる（キャラや敵は元の明るさのまま）
  const NIGHT_PROP = 0x8a96c8, NIGHT_FLOWER = 0xb4b4e8;
  const nightCol = c => {
    const r = (c >> 16) & 255, g = (c >> 8) & 255, b = c & 255;
    return (Math.round(r * 0.38 + 10) << 16) | (Math.round(g * 0.48 + 16) << 8) | Math.round(b * 0.5 + 44);
  };
  const lerp = (a, b, t) => a + (b - a) * t;
  const FX_DEPTH = 1000000;
  // 0〜14は昔の番号（もう出てこない。念のため用意された画像で表示）。7は金色の笠おばけ（逃げ回るボーナス）
  const OB = 'ek_obake';
  const ENEMY_KEYS = [OB, OB, OB, OB, 'ek_boss1', OB, OB, OB, OB, OB, OB, OB, OB, OB, OB, 'bigboss',
    'ek_obake', 'ek_chochin', 'ek_boss1', 'ek_kitsune', 'ek_tanuki', 'ek_boss2', 'ek_oni', 'ek_mujina', 'ek_boss3', 'ek_boss4', 'ek_onimen', 'ek_karakasa', 'ek_nushioni', 'ek_nushitanuki'];
  // 新しい妖怪の画像は大きめに書き出してあるので小さく表示（見た目の直径 ≒ 当たり判定の約3.4倍）
  const ENEMY_SCALE = [0.42, 0.42, 0.42, 0.42, 0.6, 0.42, 0.42, 0.46, 0.42, 0.42, 0.42, 0.42, 0.42, 0.42, 0.42, 0.95,
    0.42, 0.44, 0.6, 0.4, 0.44, 0.62, 0.45, 0.42, 0.62, 0.64, 0.42, 0.42, 0.9, 0.9]; // 28・29はヌシ（lv3強敵の絵を大きく書き出したもの）
  const ENEMY_BURST = [0xb48cff, 0x9a7ad0, 0x8fb8ff, 0xff9a7a, 0xff5a7e, 0xd8604a, 0x5a7ad0, 0xffd84f, 0x9a9288, 0xf0e2c4, 0xff6a7a, 0xffb050, 0xc0c0d0, 0x9ff0d8, 0xff4a3a, 0xb070ff,
    0xc08aff, 0xff5a4a, 0xff7a3a, 0xff6a6a, 0xd8a060, 0xb070ff, 0xff4a3a, 0xa060ff, 0xff4a8a, 0xffe07a, 0xff5a5a, 0xd04a3a, 0xff3a3a, 0xb070ff];
  const FIELD_BOSS = { 18: 1, 21: 2, 24: 3, 25: 4 }; // 段階ボス
  // オーラの色（レベルが上がるほど派手に）：Lv5 白 / 10 緑 / 15 水色 / 20 紫 / 30 金 / 40 虹
  const AURA = [0, 0xffffff, 0x7cff8a, 0x6fd8ff, 0xc58bff, 0xffd84f, 0xff7ad9];
  const CHUNK = 800;

  // コマの直径（最初は敵より小さく、強くなるほど大きく。サーバーの当たり判定と同じ式）
  const monsterH = (lv, evo) => GameSim.size(lv, evo);
  const BODY_K = 1.2; // 全身の絵の長い辺 = 体の大きさ × これ

  class GameScene extends Phaser.Scene {
    constructor() { super('Game'); }

    init(data) {
      this.session = data.session;
      this.myId = this.session.myId;
    }

    create() {
      const W = GD.WORLD.w, H = GD.WORLD.h;
      this.map = GD.generateMap(this.session.seed);
      this.cameras.main.setBackgroundColor('#1e2a33'); // 夜
      this.cameras.main.setBounds(-120, -120, W + 240, H + 240);

      this.buildWorld();
      this.makeFireflies();
      FX.emitters(this, FX_DEPTH + 20); // 演出用の画像を先に用意

      this.pSprites = new Map();
      this.eSprites = new Map();
      this.ePool = ENEMY_KEYS.map(() => []);
      this.gSprites = new Map();
      this.projs = new Map();
      this.projPool = {};
      this.overlay = this.add.graphics().setDepth(FX_DEPTH - 1);
      this.dmgPool = [];
      this.dmgActive = 0;
      this.snaps = [];
      this.esnaps = [];      // 敵は1秒10回なので別に持つ
      this.lastQ = []; this.lastLb = []; this.lastRk = 0; this.bb = null; this.bbt = 0; this.myCards = {};
      this.offset = null;
      this.delay = 0.12;     // 届く間隔のゆらぎに合わせて自動調整
      this.arrI = 0.05; this.arrJ = 0.01; this.lastArr = 0;
      this.lowFx = false; this.slowT = 0;
      this.zoomCur = 1.25; this.punch = 1; // 体が大きくなるほどカメラを引く
      this.local = null;
      this.latest = null;
      this.me = null;
      this.joy = { x: 0, y: 0 };
      this.frame = 0;
      this.emitters = {};
      this.wasAlive = true;
      this.leaving = false;

      this.keys = this.input.keyboard.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT,SHIFT,SPACE');
      this.dashHold = false; // スマホのダッシュボタン（HUDが押している間 true にする）

      this.session.onSnapshot = s => this.onSnap(s);
      this.session.onLost = msg => this.lost(msg);

      this.applyZoom();
      this.onResize = () => this.applyZoom();
      this.scale.on('resize', this.onResize);
      Bgm.start();
      this.events.once('shutdown', () => {
        Bgm.stop();
        this.scale.off('resize', this.onResize);
        this.session.onSnapshot = null;
        this.session.onLost = null;
      });
      this.scene.launch('UI');
      this.ui = this.scene.get('UI');
      if (this.session.cont) this.time.delayedCall(700, () => this.ui.banner('つづきから！', '#ffe07a'));
    }

    applyZoom() {
      const w = this.scale.width, h = this.scale.height;
      const z = h > w
        ? Phaser.Math.Clamp(w / 430, 0.7, 1.25)  // スマホ縦画面：キャラを大きく
        : Phaser.Math.Clamp(Math.min(w / 1280, h / 760) * 1.1, 0.6, 1.15);
      this.baseZoom = z;
      this.cameras.main.setZoom(z * (this.zoomCur || 1) * (this.punch || 1));
    }

    lost(msg) {
      if (this.leaving) return;
      this.leaving = true;
      try { this.session.leave(); } catch (e) { /* noop */ }
      this.scene.stop('UI');
      this.scene.stop('Result');
      this.scene.start('Title', { msg });
    }

    // ---------- マップ ----------
    buildWorld() {
      const W = GD.WORLD.w, H = GD.WORLD.h, map = this.map;
      // 地面は画面に映る範囲だけ描き、カメラに合わせて動かす（巨大な画像を作らない）
      this.ground = this.add.tileSprite(0, 0, 64, 64, 'ground').setOrigin(0).setDepth(-1000);
      // 木や花は区画（チャンク）ごとに分けて、カメラの近くだけ作る（広いマップでも軽く）
      this.chunkData = new Map();
      const bucket = (x, y) => {
        const k = Math.floor(x / CHUNK) + ',' + Math.floor(y / CHUNK);
        if (!this.chunkData.has(k)) this.chunkData.set(k, { props: [], patches: [], dots: [] });
        return this.chunkData.get(k);
      };
      for (const p of map.props) bucket(p.x, p.y).props.push(p);
      for (const p of map.patches) bucket(p.x, p.y).patches.push(p);
      // 土の小道と中央広場：円の並びにして、かかる区画すべてに登録（区画の絵に焼き込む）
      const dots = [];
      for (const path of map.paths) {
        for (let i = 0; i < path.length; i++) {
          const a = path[i], b = path[Math.min(path.length - 1, i + 1)];
          for (let k = 0; k < 3; k++) dots.push([lerp(a.x, b.x, k / 3), lerp(a.y, b.y, k / 3), 1]);
        }
      }
      dots.push([W / 2, H / 2, 5.6]);
      for (const d of dots) {
        const r = 46 * d[2] + 2;
        for (let cx = Math.floor((d[0] - r) / CHUNK); cx <= Math.floor((d[0] + r) / CHUNK); cx++) {
          for (let cy = Math.floor((d[1] - r) / CHUNK); cy <= Math.floor((d[1] + r) / CHUNK); cy++) {
            const k = cx + ',' + cy;
            if (!this.chunkData.has(k)) this.chunkData.set(k, { props: [], patches: [], dots: [] });
            this.chunkData.get(k).dots.push(d);
          }
        }
      }
      this.tmpG = this.make.graphics({ add: false });
      this.tmpI = this.make.image({ key: 'shadow', add: false });
      this.chunks = new Map();
      this.trees = [];
    }

    // 地面の飾り（草の模様・小道・影・花・小石）は区画ごとに1枚の絵に焼き込む（描く物の数を大きく減らしてカクつきを防ぐ）
    makeChunk(key) {
      const d = this.chunkData.get(key);
      const objs = [], trees = [];
      if (d) {
        const [cx, cy] = key.split(',').map(Number);
        const ox = cx * CHUNK, oy = cy * CHUNK, PAD = 0; // 区画どうしは重ねない（重ねると影が二重になる）
        const rt = this.add.renderTexture(ox - PAD, oy - PAD, CHUNK + PAD * 2, CHUNK + PAD * 2).setOrigin(0).setDepth(-999);
        objs.push(rt);
        const tx = ox - PAD, ty = oy - PAD;
        const im = this.tmpI, g = this.tmpG;
        const near = (x, y, m) => x > tx - m && x < tx + CHUNK + PAD * 2 + m && y > ty - m && y < ty + CHUNK + PAD * 2 + m;
        // 隣の区画の飾りも、はみ出して見える分は描く（区画の境目で切れないように）
        const around = [];
        for (let ax = cx - 1; ax <= cx + 1; ax++) for (let ay = cy - 1; ay <= cy + 1; ay++) {
          const n = this.chunkData.get(ax + ',' + ay);
          if (n) around.push([n, ax === cx && ay === cy]);
        }
        rt.beginDraw();
        // 草の模様
        for (const [n] of around) for (const p of n.patches) {
          if (!near(p.x, p.y, p.rx)) continue;
          im.setTexture('patch').setOrigin(0.5).setFlip(false, false).setDisplaySize(p.rx * 2, p.ry * 2).setTint(nightCol(p.c)).setAlpha(p.a);
          rt.batchDraw(im, p.x - tx, p.y - ty);
        }
        im.clearTint();
        rt.endDraw();
        // 小道
        g.clear();
        g.fillStyle(0x3e3c5a, 0.6); // 月明かりの石畳
        for (const p of d.dots) g.fillCircle(p[0] - tx, p[1] - ty, 46 * (p[2] > 1 ? p[2] : 1));
        rt.draw(g);
        g.clear();
        g.fillStyle(0x55527a, 1);
        for (const p of d.dots) g.fillCircle(p[0] - tx, p[1] - ty, 38 * (p[2] > 1 ? p[2] : 1));
        if (d.dots.some(p => p[2] > 1)) { g.fillStyle(0x6e6a98, 0.7); g.fillCircle(GD.WORLD.w / 2 - tx, GD.WORLD.h / 2 - ty, 150); }
        rt.draw(g);
        rt.beginDraw();
        // 影（木・茂み・石）と、地面に置くだけの花・小石
        const flat = [];
        for (const [n] of around) for (const p of n.props) if (near(p.x, p.y, 200)) flat.push(p);
        flat.sort((a, b) => a.y - b.y);
        for (const p of flat) {
          if (p.k === 'flower1' || p.k === 'flower2') continue;
          const src = this.textures.get(p.k).getSourceImage();
          const sw = p.k.startsWith('tree') ? src.width * p.s * 0.75 : src.width * p.s * 0.95;
          im.setTexture('shadow').setOrigin(0.5).setFlip(false, false).setDisplaySize(sw, sw * 0.32).setAlpha(0.85);
          rt.batchDraw(im, p.x - tx, p.y - 4 - ty);
        }
        for (const p of flat) {
          if (!(p.k === 'flower1' || p.k === 'flower2' || p.k === 'rock')) continue;
          im.setTexture(p.k).setOrigin(0.5, 1).setScale(p.s).setFlip(p.f, false).setAlpha(1).setTint(p.k === 'rock' ? NIGHT_PROP : NIGHT_FLOWER);
          rt.batchDraw(im, p.x - tx, p.y - ty);
        }
        im.clearTint();
        rt.endDraw();
        // 茂みと木は、キャラとの前後関係があるので普通の画像のまま
        for (const p of d.props) {
          if (p.k === 'flower1' || p.k === 'flower2' || p.k === 'rock') continue;
          const src = this.textures.get(p.k).getSourceImage();
          const img = this.add.image(p.x, p.y, p.k).setOrigin(0.5, 1).setScale(p.s).setFlipX(p.f).setDepth(p.y).setTint(NIGHT_PROP);
          objs.push(img);
          if (p.k.startsWith('tree')) trees.push({ img, x: p.x, y: p.y, w: src.width * p.s, h: src.height * p.s, a: 1 });
        }
      }
      this.chunks.set(key, { objs, trees });
    }

    // 最初の位置がわかったら、まわりの地面をまとめて先に作る（遊び始めてから少しずつ作るとカクつくため）。
    // そのあいだは画面をフェードインで隠す
    warmUp(me) {
      this.warmed = true;
      const cam = this.cameras.main;
      const hw = cam.width / cam.zoom / 2 + 500, hh = cam.height / cam.zoom / 2 + 700;
      const x0 = Math.floor((me.x - hw) / CHUNK), x1 = Math.floor((me.x + hw) / CHUNK);
      const y0 = Math.floor((me.y - hh) / CHUNK), y1 = Math.floor((me.y + hh) / CHUNK);
      for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) {
        const k = cx + ',' + cy;
        if (!this.chunks.has(k)) this.makeChunk(k);
      }
      cam.fadeIn(450, 14, 16, 34);
    }

    updateChunks() {
      const v = this.cameras.main.worldView;
      const x0 = Math.floor((v.x - 300) / CHUNK), x1 = Math.floor((v.right + 300) / CHUNK);
      const y0 = Math.floor((v.y - 300) / CHUNK), y1 = Math.floor((v.bottom + 500) / CHUNK);
      // 一度にたくさん作るとカクつくので、1回に1区画まで
      let made = 0;
      for (let cy = y0; cy <= y1 && made < 1; cy++) for (let cx = x0; cx <= x1 && made < 1; cx++) {
        const k = cx + ',' + cy;
        if (!this.chunks.has(k)) { this.makeChunk(k); made++; }
      }
      for (const [k, c] of this.chunks) {
        const [cx, cy] = k.split(',').map(Number);
        // 少し離れたら片付ける
        if (cx < x0 - 1 || cx > x1 + 1 || cy < y0 - 1 || cy > y1 + 1) {
          c.objs.forEach(o => o.destroy());
          this.chunks.delete(k);
        }
      }
      this.trees = [];
      for (const c of this.chunks.values()) for (const t of c.trees) this.trees.push(t);
    }

    // ホタル・人魂：画面の中をふわふわ漂う光（夜の雰囲気）
    makeFireflies() {
      this.flies = [];
      for (let i = 0; i < 26; i++) {
        const f = this.add.image(0, 0, 'spark').setBlendMode(Phaser.BlendModes.ADD).setDepth(1e6 - 10)
          .setTint(Phaser.Math.RND.pick([0xd8ff8a, 0xfff0a0, 0x9ad0ff, 0xc8a8ff])).setAlpha(0);
        f.ph = Math.random() * 10; f.sp = 0.4 + Math.random() * 0.8; f.sz = 5 + Math.random() * 6; f.vx = (Math.random() - 0.5) * 30; f.vy = -6 - Math.random() * 14;
        this.flies.push(f);
      }
    }
    updateFlies(dt, now) {
      if (!this.flies) return;
      const v = this.cameras.main.worldView, z = this.cameras.main.zoom;
      for (const f of this.flies) {
        if (!f.placed || f.x < v.x - 60 || f.x > v.right + 60 || f.y < v.y - 60 || f.y > v.bottom + 60) {
          f.placed = true; f.x = v.x + Math.random() * v.width; f.y = v.y + Math.random() * v.height;
        }
        f.ph += dt * f.sp;
        f.x += (f.vx + Math.sin(f.ph * 1.7) * 18) * dt / Math.max(0.3, z);
        f.y += (f.vy + Math.cos(f.ph * 1.3) * 12) * dt / Math.max(0.3, z);
        const d = f.sz / z;
        f.setDisplaySize(d, d).setAlpha(0.25 + 0.6 * Math.max(0, Math.sin(f.ph * 2.2)));
      }
    }

    updateGround() {
      const v = this.cameras.main.worldView, m = 300;
      const x = Math.floor((v.x - m) / 256) * 256, y = Math.floor((v.y - m) / 256) * 256;
      const w = Math.ceil((v.width + m * 2) / 256 + 1) * 256, h = Math.ceil((v.height + m * 2) / 256 + 1) * 256;
      if (this.ground.width !== w || this.ground.height !== h) this.ground.setSize(w, h);
      this.ground.setPosition(x, y);
      this.ground.setTilePosition(x, y);
    }

    // 自分が木の後ろにいたら木を半透明に
    canopyFade() {
      if (!this.local) return;
      const mx = this.local.x, my = this.local.y;
      for (const p of this.trees) {
        const behind = Math.abs(mx - p.x) < p.w * 0.42 && my < p.y - 8 && my > p.y - p.h * 0.95;
        const ta = behind ? 0.45 : 1;
        if (p.a !== ta) {
          p.a += (ta - p.a) * 0.2;
          if (Math.abs(p.a - ta) < 0.02) p.a = ta;
          p.img.setAlpha(p.a);
        }
      }
    }

    // ---------- スナップショット受信 ----------
    onSnap(s) {
      const now = performance.now() / 1000;
      // 届く間隔とゆらぎを測って、補間の待ち時間を決める（ネットが安定していれば遅れを小さく）
      if (this.lastArr) {
        const iv = now - this.lastArr;
        this.arrI += (iv - this.arrI) * 0.05;
        this.arrJ += (Math.abs(iv - this.arrI) - this.arrJ) * 0.05;
        this.delay = Phaser.Math.Clamp(this.arrI * 1.2 + this.arrJ * 2.5 + 0.02, 0.07, 0.3);
      }
      this.lastArr = now;
      const est = s.t - now;
      if (this.offset === null || Math.abs(est - this.offset) > 1) this.offset = est;
      else this.offset += (est - this.offset) * 0.08;
      this.snaps.push(s);
      if (this.snaps.length > 40) this.snaps.shift();
      if (s.e) { this.esnaps.push({ t: s.t, e: s.e }); if (this.esnaps.length > 20) this.esnaps.shift(); }
      if (s.q) this.lastQ = s.q;
      if (s.f) this.lastF = s.f;
      if (s.e) { this.bb = s.bb || null; this.bbt = s.bbt || 0; this.rz = s.rz || []; this.wb = s.wb || []; } // 大妖の位置とHP・妖気の渦
      if (s.me && s.me.cd) this.myCards = s.me.cd; // 持っているカードの枚数
      if (s.lb) { this.lastLb = s.lb; this.lastRk = s.rk; }
      this.latest = s;
      const mine = s.p.find(p => p.id === this.myId);
      if (mine) this.me = Object.assign({}, mine, s.me);
      if (mine && !this.warmed) this.warmUp(mine);
    }

    pmap(s) {
      if (!s._pm) { s._pm = new Map(); for (const p of s.p) s._pm.set(p.id, p); }
      return s._pm;
    }
    emap(s) {
      if (!s._em) { s._em = new Map(); for (let i = 0; i < s.e.length; i += 4) s._em.set(s.e[i], i); }
      return s._em;
    }

    // ---------- メインループ ----------
    update(time, deltaMs) {
      try {
        this.step(time, deltaMs);
      } catch (e) {
        // 描画中にエラーが起きても画面を止めない
        if ((this.errN = (this.errN || 0) + 1) <= 5) console.error('render error', e);
      }
    }

    step(time, deltaMs) {
      const dt = Math.min(0.05, deltaMs / 1000);
      this.frame++;
      this.updateFlies(dt, time);
      if (!this.snaps.length) return;
      const now = performance.now() / 1000;
      const rt = now + this.offset - this.delay;
      this.rt = rt;

      for (const s of this.snaps) {
        if (s.t > rt) break;
        if (!s.done) { s.done = true; this.applyEvents(s, rt); }
      }
      let ai = -1;
      for (let i = 0; i < this.snaps.length; i++) { if (this.snaps[i].t <= rt) ai = i; else break; }
      let a, b;
      if (ai < 0) { a = b = this.snaps[0]; }
      else { a = this.snaps[ai]; b = this.snaps[ai + 1] || a; }
      const al = b === a ? 0 : Phaser.Math.Clamp((rt - a.t) / (b.t - a.t), 0, 1);
      if (ai > 0) this.snaps.splice(0, ai);

      this.moveLocal(dt);
      this.overlay.clear();
      this.renderRifts(time);
      this.renderNushiLabels();
      this.renderGems();
      // 敵は別のバッファで補間（1秒10回なので少し長めに待つ）
      const ert = now + this.offset - Math.max(this.delay, 0.13);
      let ei = -1;
      for (let i = 0; i < this.esnaps.length; i++) { if (this.esnaps[i].t <= ert) ei = i; else break; }
      if (this.esnaps.length) {
        let ea, eb;
        if (ei < 0) { ea = eb = this.esnaps[0]; } else { ea = this.esnaps[ei]; eb = this.esnaps[ei + 1] || ea; }
        const eal = eb === ea ? 0 : Phaser.Math.Clamp((ert - ea.t) / (eb.t - ea.t), 0, 1);
        if (ei > 0) this.esnaps.splice(0, ei);
        this.renderEnemies(ea, eb, eal, dt);
      }
      this.watchFps(dt);
      if (this.me) {
        // 体が大きくなったらカメラを引く：キャラが画面の短い辺の約2割に収まるように。
        // ただし引きすぎると周りの情報（サーバーが送る範囲）より外が映るので、そこで止める
        const w = this.scale.width, h = this.scale.height;
        const vis = monsterH(this.me.lv, this.me.ev) * BODY_K;
        const minZ = Math.max(w, h) / 2300 / this.baseZoom;
        // スマホ（画面の短い辺が小さい）：キャラは小さくてもいいので、まわりを広く見せる（短い辺で約800〜1000見える）
        const phone = Math.min(w, h) < 560;
        const want = phone
          ? Phaser.Math.Clamp(Math.min(w, h) / (780 + vis * 1.2) / this.baseZoom, Math.min(1, minZ), 1.25)
          : Phaser.Math.Clamp(Math.min(w, h) * 0.2 / (vis * this.baseZoom), Math.min(1, minZ), 1.25);
        this.zoomCur += (want - this.zoomCur) * Math.min(1, dt * 2);
        this.cameras.main.setZoom(this.baseZoom * this.zoomCur * this.punch);
      }
      this.renderPlayers(a, b, al, dt, time);
      this.updateProjs(dt);
      this.updateGround();
      if (this.frame % 3 === 1) this.updateChunks();
      this.canopyFade();
      this.checkDeath();
    }

    // 端末が重いときは演出を控えめにする
    watchFps(dt) {
      const fps = this.game.loop.actualFps;
      if (fps < 40) this.slowT += dt; else this.slowT = Math.max(0, this.slowT - dt * 0.5);
      if (!this.lowFx && this.slowT > 2) this.lowFx = true;
      if (this.lowFx && this.slowT === 0 && fps > 55) this.lowFx = false;
    }

    // やられたら再出撃画面へ
    checkDeath() {
      const me = this.me;
      if (!me) return;
      if (!me.a && this.wasAlive) {
        this.wasAlive = false;
        setTimeout(() => {
          if (this.leaving || !this.me || this.me.a || this.scene.isActive('Result')) return;
          this.scene.launch('Result', { session: this.session, by: this.me.by, lv: this.me.lv, sc: this.me.sc, k: this.me.k, pk: this.me.pk });
        }, 1200);
      } else if (me.a && !this.wasAlive) {
        this.wasAlive = true;
        if (this.scene.isActive('Result')) this.scene.stop('Result');
        this.cameras.main.flash(300, 255, 255, 255);
      }
    }

    // 自分のキャラはクライアント側で即座に動かす（操作の遅延をなくす）
    moveLocal(dt) {
      const me = this.me;
      if (!me) return;
      if (!this.local) this.local = { x: me.x, y: me.y, vx: 0, vy: 0 };
      const L = this.local;
      if (this.lastTp !== me.tp) {
        // はじき飛ばし・再出撃などでサーバー側が位置を変えたら合わせる
        if (this.lastTp !== undefined) { L.x = me.x; L.y = me.y; }
        this.lastTp = me.tp;
      }
      if (!me.a || me.bt) {
        L.vx = L.vy = 0;
        if (!me.a) { L.x = me.x; L.y = me.y; } else this.session.sendInput(L.x, L.y);
        this.dashing = false;
        return;
      }
      let ix = 0, iy = 0;
      const k = this.keys;
      if (k.A.isDown || k.LEFT.isDown) ix -= 1;
      if (k.D.isDown || k.RIGHT.isDown) ix += 1;
      if (k.W.isDown || k.UP.isDown) iy -= 1;
      if (k.S.isDown || k.DOWN.isDown) iy += 1;
      ix += this.joy.x; iy += this.joy.y;
      const len = Math.hypot(ix, iy);
      if (len > 1) { ix /= len; iy /= len; }
      const px = L.x, py = L.y;
      // ダッシュ：Shift・スペース・ダッシュボタンを押している間（スタミナがあれば）
      const want = (k.SHIFT.isDown || k.SPACE.isDown || this.dashHold) && (ix || iy);
      const can = (me.sta === undefined ? 1 : me.sta) > 0.01 && !me.sl;
      this.dashing = !!(want && can);
      const spd = (me.spd || 200) * (this.dashing ? GD.DASH_MUL : 1);
      L.x += ix * spd * dt;
      L.y += iy * spd * dt;
      L.x = Phaser.Math.Clamp(L.x, GD.EDGE, GD.WORLD.w - GD.EDGE);
      L.y = Phaser.Math.Clamp(L.y, GD.EDGE, GD.WORLD.h - GD.EDGE);
      GD.resolve(this.map, L, 16);
      // サーバーとずれすぎたら合わせる
      if (Math.hypot(L.x - me.x, L.y - me.y) > 300) { L.x = me.x; L.y = me.y; }
      L.vx = (L.x - px) / dt; L.vy = (L.y - py) / dt;
      this.session.sendInput(L.x, L.y, this.dashing);
    }

    // ---------- ヌシの頭の上の名前とHPバー ----------
    renderNushiLabels() {
      if (!this.nushiTx) this.nushiTx = [];
      const list = this.wb || [], v = this.cameras.main.worldView, z = Math.max(0.4, this.cameras.main.zoom);
      list.forEach((n, i) => {
        const [x, y, hp, lv, ty] = n;
        let tx = this.nushiTx[i];
        if (!tx) tx = this.nushiTx[i] = this.add.text(0, 0, '', TR(20, '#ffd0c0', '#3a0a0a', 6)).setOrigin(0.5, 1).setDepth(FX_DEPTH - 2);
        const vis = x > v.x - 300 && x < v.right + 300 && y > v.y - 200 && y < v.bottom + 500;
        tx.setVisible(vis);
        if (!vis) return;
        const top = y - 330;
        tx.setText(`${GD.NUSHI_NAME[ty]}　Lv${lv}`).setPosition(x, top - 14 / z).setScale(1 / z);
        const bw = 220, bh = 12;
        this.overlay.fillStyle(0x140820, 0.9); this.overlay.fillRoundedRect(x - bw / 2 - 3, top - 3, bw + 6, bh + 6, 6);
        this.overlay.fillStyle(0xff5a3a, 1); this.overlay.fillRoundedRect(x - bw / 2, top, bw * Phaser.Math.Clamp(hp / 1000, 0, 1), bh, 5);
      });
      for (let i = list.length; i < this.nushiTx.length; i++) this.nushiTx[i].setVisible(false);
    }

    // ---------- 妖気の渦（地面に紫のうず。中にいると経験値アップ） ----------
    renderRifts(time) {
      if (!this.riftG) { this.riftG = this.add.graphics().setDepth(-900); this.riftTx = []; }
      const g = this.riftG, list = this.rz || [];
      g.clear();
      const t = (time || 0) / 1000;
      list.forEach((r, i) => {
        const [x, y, R, left, m10] = r;
        const pul = 0.5 + Math.sin(t * 3 + i) * 0.5;
        g.fillStyle(0x7a2aff, 0.14 + pul * 0.06); g.fillCircle(x, y, R);
        g.fillStyle(0xc070ff, 0.10); g.fillCircle(x, y, R * 0.55);
        g.lineStyle(6, 0xc890ff, 0.75); g.strokeCircle(x, y, R);
        // ぐるぐる回る渦の筋
        for (let k = 0; k < 6; k++) {
          const a0 = t * 1.4 + k * Math.PI / 3;
          g.lineStyle(4, 0xe0b8ff, 0.5); g.beginPath();
          for (let j = 0; j <= 12; j++) { const f = j / 12, a = a0 + f * 2.2, rr = R * (0.15 + 0.8 * f); const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr; if (j) g.lineTo(px, py); else g.moveTo(px, py); }
          g.strokePath();
        }
        if (Math.random() < 0.3) this.burst(x + Phaser.Math.Between(-R, R) * 0.7, y + Phaser.Math.Between(-R, R) * 0.7, 0xc070ff, 2);
        let tx = this.riftTx[i];
        if (!tx) tx = this.riftTx[i] = this.add.text(0, 0, '', TR(22, '#f0d8ff', '#2a0a4a', 6)).setOrigin(0.5).setDepth(FX_DEPTH - 2);
        tx.setVisible(true).setPosition(x, y - R - 26).setText(`🌀 妖気の渦　経験値×${(m10 / 10).toFixed(1)}　あと${left}秒`).setScale(1 / Math.max(0.4, this.cameras.main.zoom));
      });
      for (let i = list.length; i < this.riftTx.length; i++) this.riftTx[i].setVisible(false);
    }

    // ---------- プレイヤー（モンスター） ----------
    makePlayer(pb) {
      const isMe = pb.id === this.myId;
      const col = GD.COLORS[pb.cl % GD.COLORS.length];
      const o = {
        glow: this.add.image(0, 0, 'spark').setBlendMode(Phaser.BlendModes.ADD).setVisible(false),
        rays: this.add.image(0, 0, 'fx_rays').setBlendMode(Phaser.BlendModes.ADD).setVisible(false),
        shadow: this.add.image(0, 0, 'shadow'),
        ring: this.add.image(0, 0, 'ring').setTint(isMe ? 0xffffff : col).setAlpha(isMe ? 1 : 0.85),
        body: this.add.image(0, 0, 'cr_' + pb.sp).setOrigin(0.5, 1),
        bubble: this.add.image(0, 0, 'spark').setBlendMode(Phaser.BlendModes.ADD).setVisible(false),
        name: this.add.text(0, 0, '', TO(14, isMe ? '#fff8a8' : '#ffffff', '#2a1a20', 4)).setOrigin(0.5, 1).setDepth(FX_DEPTH),
        key: null, lx: pb.x, ly: pb.y, walk: 0, flip: false, h: 60, twT: 0, base: 1,
      };
      this.pSprites.set(pb.id, o);
      if (isMe) this.cameras.main.startFollow(o.body, false, 0.14, 0.14, 0, 30);
      return o;
    }
    destroyPlayer(id) {
      const o = this.pSprites.get(id);
      if (!o || id === this.myId) return;
      ['glow', 'rays', 'shadow', 'ring', 'body', 'bubble', 'name'].forEach(k => o[k].destroy());
      this.clearOrbit(o);
      this.pSprites.delete(id);
    }

    renderPlayers(a, b, al, dt, time) {
      const am = this.pmap(a);
      const seen = new Set();
      const myPow = this.me ? this.me.lv + (this.me.ev ? 10 : 0) : 0;
      for (const pb of b.p) {
        seen.add(pb.id);
        const pa = am.get(pb.id) || pb;
        const o = this.pSprites.get(pb.id) || this.makePlayer(pb);
        const isMe = pb.id === this.myId;
        let x, y;
        if (isMe && this.local) { x = this.local.x; y = this.local.y; }
        else if (Math.hypot(pa.x - pb.x, pa.y - pb.y) > 400) { x = pb.x; y = pb.y; }
        else { x = lerp(pa.x, pb.x, al); y = lerp(pa.y, pb.y, al); }
        const vx = isMe && this.local ? this.local.vx * dt : x - o.lx;
        const vy = isMe && this.local ? this.local.vy * dt : y - o.ly;
        o.lx = x; o.ly = y;
        const moving = Math.hypot(vx, vy) > 0.4;
        if (moving) { o.walk += dt * 12; if (Math.abs(vx) > 0.3) o.flip = vx > 0; } else o.walk = 0;
        // 見た目：全身の絵。進化したら絵が変わり、レベルで大きくなる（絵の長い辺をそろえて、全員同じ大きさに）
        const key = 'cr_' + pb.sp + (pb.ev ? '_e' : '');
        const H = monsterH(pb.lv, pb.ev), D = H; // 体の大きさの基準
        if (o.key !== key || Math.abs(o.h - H) > 0.5) {
          const changed = o.key && o.key !== key;
          o.key = key; o.h = H;
          o.body.setTexture(key);
          o.base = D * BODY_K / Math.max(o.body.width, o.body.height);
          o.dh = o.body.height * o.base;
          o.body.setScale(o.base);
          if (changed) { o.body.setScale(o.base * 0.3); this.tweens.add({ targets: o.body, scale: o.base, duration: 500, ease: 'Back.out' }); }
        }
        const alive = !!pb.a;
        const cs = pb.cs || []; // 着せ替え [色, 輪, 倒したときの演出, 名前の色]
        const bob = moving ? Math.abs(Math.sin(o.walk)) * 6 : Math.sin(time / 380) * 1.5;
        const squash = moving ? 1 + Math.sin(o.walk * 2) * 0.05 : 1;
        const cy = y - D / 2 - 4 - bob;
        o.body.setFlipX(o.flip).setPosition(x, y + 2 - bob).setDepth(y).setRotation(moving ? Math.sin(o.walk) * 0.08 : 0);
        if (!this.tweens.isTweening(o.body)) o.body.setScale(o.base * squash, o.base / squash);
        o.body.setAlpha(alive ? (pb.iv ? (Math.floor(time / 80) % 2 ? 0.55 : 1) : 1) : 0.25);
        o.pb = pb;
        // 着せ替え：妖怪の色
        const tintC = cs[0] ? GD.COSMETICS.tint[cs[0] - 1] : null;
        if (tintC) o.body.setTint(tintC.col >= 0 ? tintC.col : Phaser.Display.Color.HSVToRGB((time / 2000) % 1, 0.35, 1).color);
        else if (o.body.isTinted) o.body.clearTint();
        const sw = D * 0.95;
        o.shadow.setPosition(x, y - 2).setDisplaySize(sw, sw * 0.3).setDepth(y - 2);
        o.ring.setVisible(false);
        // 足もとの輪（自分は金、他の人はチームの色）
        const fxOk0 = !this.lowFx || isMe;
        if (alive) {
          const col = isMe ? 0xffd84f : GD.COLORS[pb.cl % GD.COLORS.length];
          const ringC = cs[1] ? GD.COSMETICS.ring[cs[1] - 1] : null;
          if (ringC) {
            // 着せ替え：足もとの輪（二重の輪＋キラキラ）
            const pul = 0.75 + Math.sin(time / 220) * 0.25;
            this.overlay.lineStyle(isMe ? 5 : 4, ringC.col, 1); this.overlay.strokeEllipse(x, y - 2, D * 1.05, D * 0.34);
            this.overlay.lineStyle(2, ringC.col, 0.6 * pul); this.overlay.strokeEllipse(x, y - 2, D * 1.25, D * 0.42);
            if (fxOk0 && Math.random() < 0.15) FX.twinkle(this, x + Phaser.Math.Between(-D / 2, D / 2), y - 4, 1);
          } else { this.overlay.lineStyle(isMe ? 4 : 3, col, 0.95); this.overlay.strokeEllipse(x, y - 2, D * 1.05, D * 0.34); }
          // 覚醒：5段ごとに色が変わる輪
          if (pb.aw) {
            const ac = GD.AWAKE_COLORS[Math.min(GD.AWAKE_COLORS.length - 1, Math.floor(pb.aw / 5) + 1)];
            this.overlay.lineStyle(3, ac, 0.55 + Math.sin(time / 300) * 0.3); this.overlay.strokeEllipse(x, y - 2, D * 1.45, D * 0.5);
          }
          if (pb.ps) { this.overlay.lineStyle(3, 0xa04aff, 0.9); this.overlay.strokeEllipse(x, y - 2, D * 1.2, D * 0.42); }
        }
        // オーラ（レベルが上がるほど強そうに）
        const tier = pb.au || 0;
        const fxOk = !this.lowFx || isMe;
        o.glow.setVisible(alive && tier > 0 && fxOk);
        if (tier > 0 && fxOk) {
          const c = tier === 6 ? Phaser.Display.Color.HSVToRGB((time / 1500) % 1, 0.6, 1).color : AURA[tier];
          const gs = D * (1.5 + tier * 0.18);
          o.glow.setTint(c).setPosition(x, cy).setDepth(y - 3).setDisplaySize(gs, gs)
            .setAlpha(0.35 + tier * 0.06 + Math.sin(time / 250) * 0.08);
        }
        o.rays.setVisible(alive && tier >= 5 && fxOk);
        if (tier >= 5 && fxOk) {
          o.rays.setTint(tier === 6 ? 0xffffff : 0xffd84f).setPosition(x, cy).setDepth(y - 3.5)
            .setDisplaySize(D * 2.8, D * 2.8).setAngle(time / 40).setAlpha(0.35);
        }
        // 高レベルはキラキラが舞う
        if (alive && tier >= 4 && fxOk) {
          o.twT -= dt;
          if (o.twT <= 0) { o.twT = 0.25 - tier * 0.02; FX.twinkle(this, x + Phaser.Math.Between(-D / 2, D / 2), cy + Phaser.Math.Between(-D / 2, D / 2), 1); }
        }
        // シールド・保護中
        const showBubble = alive && (!!pb.sh || !!pb.pr);
        o.bubble.setVisible(showBubble);
        if (showBubble) {
          o.bubble.setPosition(x, cy).setDepth(y + 2).setTint(pb.pr ? 0xfff6a0 : 0x8fd8ff)
            .setDisplaySize(D * 1.9, D * 1.9).setAlpha(0.35 + Math.sin(time / 150) * 0.1);
        }
        if (pb.hs && alive && fxOk && Math.random() < 0.4) FX.twinkle(this, x - (o.flip ? 20 : -20), y - 10, 1);
        // ダッシュ中：足もとに土けむり＋残像
        if ((pb.ds || (isMe && this.dashing)) && alive && moving && fxOk) {
          o.dsT = (o.dsT || 0) - dt;
          if (o.dsT <= 0) {
            o.dsT = 0.05;
            const puff = this.add.image(x - vx * 2, y - 4, 'spark').setTint(0xe8dcc0).setAlpha(0.7).setDisplaySize(D * 0.35, D * 0.22).setDepth(y - 3);
            this.tweens.add({ targets: puff, alpha: 0, scaleX: puff.scaleX * 2.2, scaleY: puff.scaleY * 1.6, duration: 380, onComplete: () => puff.destroy() });
            const ghost = this.add.image(o.body.x, o.body.y, o.body.texture.key).setOrigin(0.5, 1).setFlipX(o.flip).setScale(o.body.scaleX, o.body.scaleY).setAlpha(0.35).setTintFill(0xbfe8ff).setDepth(y - 1);
            this.tweens.add({ targets: ghost, alpha: 0, duration: 220, onComplete: () => ghost.destroy() });
          }
        }
        // 名前（自分より強い相手は赤、弱い相手は緑）
        const ny = Math.min(cy - D / 2, y + 2 - bob - (o.dh || D)) - 12;
        const pow = pb.lv + (pb.ev ? 10 : 0);
        const ncol = isMe ? '#fff8a8' : pow > myPow + 1 ? '#ff9a8a' : pow < myPow - 1 ? '#a8ff9a' : '#ffffff';
        const ach = pb.tl ? GD.ACHIEVEMENTS[pb.tl - 1] : null;
        const nmC = cs[3] ? GD.COSMETICS.nm[cs[3] - 1] : null;
        const nameCol = pb.bn ? '#ffd84f' : nmC ? (nmC.css || (c => Phaser.Display.Color.RGBToString(c.r, c.g, c.b))(Phaser.Display.Color.HSVToRGB((time / 1500) % 1, 0.55, 1))) : ncol;
        o.name.setPosition(x, ny - 6).setText(`${ach ? '【' + ach.title + '】' : ''}${pb.bn ? '💰' : ''}${pb.n}${pb.aw ? ' ✦' + pb.aw : ''}${pb.wd ? ' 💔' : ''}${pb.b ? ' 🤖' : ''}${pb.pr ? ' 🛡' : ''}`).setColor(nameCol);
        o.name.setVisible(alive);
        // HPバー
        if (alive) {
          const bw = Math.max(46, D * 0.9), bx = x - bw / 2, by = ny - 2;
          this.overlay.fillStyle(0x0b0f1c, 0.85); this.overlay.fillRoundedRect(bx - 2, by - 2, bw + 4, 9, 4);
          this.overlay.fillStyle(isMe ? 0x7cdc6a : 0xe8615a, 1); this.overlay.fillRoundedRect(bx, by, bw * Phaser.Math.Clamp(pb.hp / pb.mhp, 0, 1), 5, 2);
          // 自分のスタミナ（減っているときだけ、HPバーの下に細く）
          const sta = isMe && this.me ? (this.me.sta === undefined ? 1 : this.me.sta) : 1;
          if (isMe && sta < 0.995) {
            this.overlay.fillStyle(0x0b0f1c, 0.85); this.overlay.fillRoundedRect(bx - 2, by + 7, bw + 4, 6, 3);
            this.overlay.fillStyle(this.me.sl ? 0xff5a4a : this.dashing ? 0x6fe0ff : 0xf0b030, 1); this.overlay.fillRoundedRect(bx, by + 8, Math.max(2, bw * sta), 3, 1.5);
          }
        }
        o.lyTop = cy;
        // 自分のキャラは絵の真ん中が画面の中央に来るように
        if (isMe) this.cameras.main.setFollowOffset(0, (o.dh || D) / 2);
        this.renderOrbit(o, pb.it, alive, x, cy, D, y);
      }
      for (const id of Array.from(this.pSprites.keys())) if (!seen.has(id)) this.destroyPlayer(id);
    }

    // ---------- 装備アイテム：体のまわりをくるくる回る（レアリティの色のオーラつき） ----------
    clearOrbit(o) {
      if (o.orb) { o.orb.forEach(e => { e.img.destroy(); e.aura.destroy(); }); o.orb = null; }
      o.orbCode = -1;
    }
    renderOrbit(o, code, alive, x, cy, D, y) {
      if (code === undefined) code = -1;
      if (o.orbCode !== code) {
        this.clearOrbit(o);
        o.orbCode = code;
        if (code >= 0) {
          const t = code >> 3, r = code & 7, it = GD.ITEMS[t], ra = GD.RARITIES[r];
          if (it && ra) {
            o.orb = [];
            for (let i = 0, n = GD.itemShow(t, r); i < n; i++) {
              o.orb.push({
                aura: this.add.image(0, 0, 'aura').setBlendMode(Phaser.BlendModes.ADD).setTint(ra.color),
                img: this.add.image(0, 0, 'it_' + it.key),
              });
            }
            o.orbR = r; o.orbSpin = it.key === 'sword' || it.key === 'shuriken';
          }
        }
      }
      if (!o.orb) return;
      const vis = alive && (!this.lowFx || o === this.pSprites.get(this.myId) || o.orb.length <= 3);
      const n = o.orb.length, R = D / 2 + 46;
      const base = (this.rt || 0) * GD.ORBIT_SPEED, now = this.time.now;
      const leg = o.orbR === 4;
      o.orb.forEach((e, i) => {
        e.img.setVisible(alive); e.aura.setVisible(vis);
        if (!alive) return;
        const a = base + (i / n) * Math.PI * 2;
        const ox = x + Math.cos(a) * R, oy = cy + 24 + Math.sin(a) * R - 20;
        const front = Math.sin(a) > 0;
        e.img.setPosition(ox, oy).setDepth(front ? y + 3 : y - 4).setScale(0.62 + o.orbR * 0.04).setRotation(o.orbSpin ? a + Math.PI / 2 : Math.sin(now / 300 + i) * 0.15); // 剣だけ回転、炎や勾玉は立てたまま
        if (vis) {
          const pulse = 0.75 + Math.sin(now / 200 + i) * 0.15;
          e.aura.setPosition(ox, oy).setDepth(front ? y + 2 : y - 5).setScale(0.75 + o.orbR * 0.12).setAlpha(pulse);
          if (leg) e.aura.setTint(Phaser.Display.Color.HSVToRGB((now / 1500 + i / n) % 1, 0.5, 1).color);
        }
      });
    }

    // ---------- 敵 ----------
    getEnemy(ty) {
      const pool = this.ePool[ty] || this.ePool[0];
      let o = pool.pop();
      if (!o) {
        o = {
          shadow: this.add.image(0, 0, 'shadow'),
          img: this.add.image(0, 0, ENEMY_KEYS[ty] || ENEMY_KEYS[0]).setOrigin(0.5, 0.85).setScale(ENEMY_SCALE[ty] || 0.8),
          ty, flash: 0,
        };
        const sw = o.img.displayWidth * 0.8;
        o.shadow.setDisplaySize(sw, sw * 0.35).setAlpha(0.8);
      }
      o.img.setVisible(true).clearTint(); o.shadow.setVisible(true);
      // 出てくるときはふわっと（広く映すスマホで、急に現れたように見えないように）
      this.tweens.killTweensOf(o.img);
      o.img.setAlpha(0); this.tweens.add({ targets: o.img, alpha: 1, duration: 280 });
      o.flash = 0; o.lx = null;
      return o;
    }
    freeEnemy(id) {
      const o = this.eSprites.get(id);
      if (!o) return;
      o.img.setVisible(false); o.shadow.setVisible(false);
      (this.ePool[o.ty] || this.ePool[0]).push(o);
      this.eSprites.delete(id);
    }

    renderEnemies(a, b, al, dt) {
      const am = this.emap(a), ae = a.e, be = b.e;
      const stamp = this.frame;
      const v = this.cameras.main.worldView;
      let bossNear = false;
      for (let i = 0; i < be.length; i += 4) {
        const id = be[i], raw = be[i + 1], ty = raw & 63, el = raw >= 64; // 強敵は種類+64
        if (ty === 4 || ty === 15 || ty >= 28 || FIELD_BOSS[ty]) bossNear = true;
        let o = this.eSprites.get(id);
        if (!o) {
          o = this.getEnemy(ty); this.eSprites.set(id, o);
          o.el = el;
          if (el) { o.img.setTint(0xff8a8a); o.shadow.setTint(0xff0000); } else o.shadow.clearTint();
          if (ty === 7) o.img.setTint(0xffd84f); // 金色のおばけ
        }
        o.stamp = stamp;
        const j = am.get(id);
        const x = j !== undefined ? lerp(ae[j + 2], be[i + 2], al) : be[i + 2];
        const y = j !== undefined ? lerp(ae[j + 3], be[i + 3], al) : be[i + 3];
        const inView = x > v.x - 120 && x < v.right + 120 && y > v.y - 120 && y < v.bottom + 160;
        o.img.setVisible(inView); o.shadow.setVisible(inView);
        if (!inView) { o.lx = x; continue; }
        if (o.lx != null && Math.abs(x - o.lx) > 0.2) o.img.setFlipX(x > o.lx);
        o.lx = x;
        const wob = Math.sin(this.time.now / 140 + id) * 0.06;
        const s = (ENEMY_SCALE[ty] || 0.8) * (o.el ? 1.4 : 1);
        if (ty === 15 || ty === 28 || ty === 29) o.img.setScale(s * (1 + wob * 0.25), s * (1 - wob * 0.25)); // 大妖・ヌシはゆっくり息をする
        else if (ty === 0 || ty === 7 || ty === 9 || ty === 12 || ty === 20 || ty === 23) o.img.setScale(s * (1 + wob), s * (1 - wob));
        else if (ty === 17 || ty === 18) o.img.setScale(s).setRotation(wob * 1.6); // ちょうちんはぶらぶら
        else if (FIELD_BOSS[ty]) o.img.setScale(s * (1 + wob * 0.4), s * (1 - wob * 0.4)); // ボスは息づかい
        else if (ty === 14) o.img.setScale(s).setRotation(wob * 2.5); // だるまはゆらゆら
        else if (ty === 1) o.img.setScale(s, s * (1 + wob * 1.5));
        else o.img.setScale(s);
        const lift = ty === 1 || ty === 2 || ty === 13 || ty === 16 || ty === 17 ? 14 + wob * 40 : ty === 19 ? Math.abs(wob) * 90 : ty === 10 || ty === 27 ? Math.abs(wob) * 140 : ty === 26 ? 10 + wob * 30 : ty === 11 ? 6 + wob * 30 : 0; // 浮く・跳ねる
        o.img.setPosition(x, y - lift).setDepth(y);
        o.shadow.setPosition(x, y + 2).setDepth(y - 1);
        if (FIELD_BOSS[ty] && Math.random() < 0.06 * FIELD_BOSS[ty]) this.burst(x + Phaser.Math.Between(-60, 60), y - Phaser.Math.Between(20, 140), ENEMY_BURST[ty], 1); // ボスの妖気
        if ((ty === 28 || ty === 29) && Math.random() < 0.25) this.burst(x + Phaser.Math.Between(-110, 110), y - Phaser.Math.Between(40, 260), ENEMY_BURST[ty], 1); // ヌシの妖気
        if (ty === 15 && Math.random() < 0.3) this.burst(x + Phaser.Math.Between(-150, 150), y - Phaser.Math.Between(60, 300), 0x8a4aff, 1); // 妖気
        if (ty === 7 && Math.random() < 0.15) FX.twinkle(this, x + Phaser.Math.Between(-15, 15), y - 20, 1);
        if (o.el && Math.random() < 0.08) this.burst(x + Phaser.Math.Between(-20, 20), y - 30, 0xff3a3a, 1);
        if (o.flash > 0) { o.flash -= dt; if (o.flash <= 0) { if (o.el) o.img.setTint(0xff8a8a); else if (o.ty === 7) o.img.setTint(0xffd84f); else o.img.clearTint(); } }
      }
      for (const [id, o] of this.eSprites) if (o.stamp !== stamp) this.freeEnemy(id);
      this.bossNear = bossNear; // ボスが近いとBGMが激しくなる
    }

    // ---------- ジェム ----------
    addGem(id, x, y, v, fx, fy) {
      if (this.gSprites.has(id)) return;
      const key = v <= 1.5 ? 'gem0' : v <= 5 ? 'gem1' : 'gem2';
      const img = this.add.image(x, y, key).setDepth(y - 5).setScale(v > 5 ? 1.25 : 0.95);
      const g = { img, x, y, ph: Math.random() * 6 };
      this.gSprites.set(id, g);
      if (fx !== undefined) {
        // 大妖から飛び出して、弧を描いて散らばる
        g.taken = true; // 飛んでいるあいだは揺らさない
        const sx = fx, sy = fy - 120, d = Math.hypot(x - sx, y - sy);
        const o = { t: 0 };
        img.setPosition(sx, sy).setScale(0.4);
        this.tweens.add({
          targets: o, t: 1, duration: 500 + d * 0.5, delay: Math.random() * 400, ease: 'Sine.out',
          onUpdate: () => { if (!img.active || g.got) return; img.setPosition(sx + (x - sx) * o.t, sy + (y - sy) * o.t - Math.sin(o.t * Math.PI) * Math.min(500, 120 + d * 0.3)); },
          onComplete: () => { if (!img.active || g.got) return; img.setPosition(x, y).setScale(v > 5 ? 1.25 : 0.95); if (this.gSprites.get(id) === g) g.taken = false; },
        });
      }
    }
    renderGems() {
      if (this.frame % 2) return;
      const t = this.time.now / 300;
      const v = this.cameras.main.worldView;
      for (const [id, g] of this.gSprites) {
        if (g.taken) continue;
        // 遠くに残ったジェムは片付ける（範囲外の情報は届かないため）
        if (this.local && (Math.abs(g.x - this.local.x) > GD.VIEW_R + 400 || Math.abs(g.y - this.local.y) > GD.VIEW_R + 400)) {
          g.img.destroy(); this.gSprites.delete(id); continue;
        }
        const vis = g.x > v.x - 40 && g.x < v.right + 40 && g.y > v.y - 40 && g.y < v.bottom + 40;
        g.img.setVisible(vis);
        if (vis) g.img.y = g.y + Math.sin(t + g.ph) * 3;
      }
    }

    // ---------- 弾 ----------
    spawnProj(ev, age) {
      const pool = this.projPool[ev.k] || (this.projPool[ev.k] = []);
      let img = pool.pop();
      if (!img) img = this.add.image(0, 0, this.textures.exists('pj_' + ev.k) ? 'pj_' + ev.k : 'pj_player').setDepth(FX_DEPTH - 10).setBlendMode(Phaser.BlendModes.ADD);
      img.setVisible(true).setPosition(ev.x + ev.vx * age, ev.y - 26 + ev.vy * age).setRotation(Math.atan2(ev.vy, ev.vx));
      this.projs.set(ev.id, { img, vx: ev.vx, vy: ev.vy, life: ev.l - age, k: ev.k });
    }
    freeProj(id) {
      const p = this.projs.get(id);
      if (!p) return;
      p.img.setVisible(false);
      this.projPool[p.k].push(p.img);
      this.projs.delete(id);
    }
    updateProjs(dt) {
      for (const [id, p] of this.projs) {
        p.life -= dt;
        if (p.life <= 0) { this.freeProj(id); continue; }
        p.img.x += p.vx * dt; p.img.y += p.vy * dt;
        if (p.k === 'sinonome' || p.k === 'i_shuri') p.img.rotation += dt * 14;
      }
    }

    // ---------- エフェクト ----------
    burst(x, y, color, n) {
      let em = this.emitters[color];
      if (!em) {
        em = this.add.particles(0, 0, 'spark', {
          speed: { min: 60, max: 220 }, lifespan: { min: 250, max: 550 }, scale: { start: 1.1, end: 0 },
          tint: color, blendMode: 'ADD', emitting: false,
        }).setDepth(FX_DEPTH - 5);
        this.emitters[color] = em;
      }
      em.explode(n || 10, x, y);
    }
    dmgText(x, y, d, color) {
      const v = this.cameras.main.worldView;
      if (x < v.x || x > v.right || y < v.y || y > v.bottom) return;
      if (this.dmgActive > (this.lowFx ? 12 : 30)) return;
      let t = this.dmgPool.pop();
      if (!t) t = this.add.text(0, 0, '', TO(16, '#fff', '#3a2a20', 4)).setOrigin(0.5).setDepth(FX_DEPTH + 1);
      this.dmgActive++;
      const big = d >= 30;
      t.setText(String(d)).setColor(color || (big ? '#ffe04a' : '#ffffff')).setPosition(x + Phaser.Math.Between(-10, 10), y).setAlpha(1).setVisible(true);
      t.setScale(big ? 2.0 : 1.3);
      this.tweens.add({ targets: t, scale: big ? 1.3 : 1, duration: 160, ease: 'Back.out' });
      this.tweens.add({ targets: t, y: y - (big ? 46 : 34), alpha: 0, delay: 120, duration: 520, ease: 'Quad.out', onComplete: () => { t.setVisible(false); this.dmgPool.push(t); this.dmgActive--; } });
    }
    floatText(x, y, s, color, size) {
      const t = this.add.text(x, y, s, TO(size || 20, color || '#fff', '#3a2a20', 5)).setOrigin(0.5).setDepth(FX_DEPTH + 2);
      this.tweens.add({ targets: t, y: y - 50, alpha: 0, duration: 1300, ease: 'Quad.out', onComplete: () => t.destroy() });
    }
    posOf(id) {
      const o = this.pSprites.get(id);
      return o ? { x: o.lx, y: o.ly } : null;
    }

    // スキルの演出
    skillFx(ev) {
      const v = this.cameras.main.worldView;
      if (ev.x < v.x - 300 || ev.x > v.right + 300 || ev.y < v.y - 300 || ev.y > v.bottom + 300) return;
      const def = GD.SPECIES[ev.sp];
      const col = def.color === 0xe8f0ff ? 0xb8d8ff : def.color;
      if (ev.r > 0) {
        const c = this.add.circle(ev.x, ev.y, ev.r, col, 0.28).setStrokeStyle(4, col, 0.9).setDepth(FX_DEPTH - 6).setScale(0.2);
        this.tweens.add({ targets: c, scale: 1, alpha: 0, duration: 450, ease: 'Quad.out', onComplete: () => c.destroy() });
      } else this.burst(ev.x, ev.y - 20, col, 10);
      if (ev.k === 'heal' || ev.k === 'bless') this.burst(ev.x, ev.y - 30, 0x9fffa0, 18);
      if (ev.k === 'shell') this.burst(ev.x, ev.y - 30, 0x8fd8ff, 18);
      if (ev.p === this.myId) {
        const now = this.time.now;
        if (!this.lastSkillText || now - this.lastSkillText > 350) {
          this.lastSkillText = now;
          this.floatText(ev.x, ev.y - 100, def.skill.name + '！', '#ffffff', 16);
        }
      }
    }

    // ---------- イベント処理 ----------
    applyEvents(s, rt) {
      if (s.g) {
        const ids = new Set();
        for (let i = 0; i < s.g.length; i += 4) { ids.add(s.g[i]); this.addGem(s.g[i], s.g[i + 1], s.g[i + 2], s.g[i + 3]); }
        for (const [id, g] of this.gSprites) if (!ids.has(id) && !g.taken) { g.img.destroy(); this.gSprites.delete(id); }
      }
      const age = Math.max(0, rt - s.t);
      const me = this.myId;
      for (const ev of s.ev) {
        switch (ev.e) {
          case 'sh': this.spawnProj(ev, age); if (ev.o === me) Sfx.shoot(ev.k); break; // 自分の攻撃を放つ音
          case 'pd': this.freeProj(ev.id); break;
          case 'h': {
            const o = this.eSprites.get(ev.i);
            if (o) { o.img.setTintFill(0xffffff); o.flash = 0.07; }
            this.dmgText(ev.x, ev.y - 20, ev.d);
            break;
          }
          case 'kl': {
            // キルログ（人どうしだけ）
            const esc = t => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
            const mine = ev.ai === me || ev.bi === me;
            this.ui.feed(`<span style="color:${ev.ai === me ? '#fff07a' : '#ffb0a0'}">${esc(ev.a)}</span> ⚔ <span style="color:${ev.bi === me ? '#fff07a' : '#b8dcff'}">${esc(ev.b)}</span>`, mine ? '#4a1a10' : '#10141f');
            break;
          }
          case 'rz':
            if (ev.p === me) { this.ui.banner(`🌀 妖気の渦が現れた！ 中で経験値×${ev.m}`, '#e0b8ff'); Sfx.play('boss'); }
            break;
          case 'cb':
            if (ev.p === me) { this.ui.banner('✨ 組み合わせ効果アップ！', '#ffe07a'); Sfx.play('lvlBig'); }
            break;
                    case 'zp': {
            // 雷太鼓：ジグザグの稲妻
            const g = this.add.graphics().setDepth(FX_DEPTH - 4).setBlendMode('ADD');
            const P = ev.pts || [];
            for (const [wd, col, al] of [[7, 0xffe04a, 0.5], [3, 0xffffff, 1]]) {
              g.lineStyle(wd, col, al); g.beginPath(); g.moveTo(P[0], P[1]);
              for (let i = 2; i < P.length; i += 2) {
                const x0 = P[i - 2], y0 = P[i - 1], x1 = P[i], y1 = P[i + 1];
                for (let k = 1; k <= 3; k++) g.lineTo(x0 + (x1 - x0) * k / 4 + Phaser.Math.Between(-14, 14), y0 + (y1 - y0) * k / 4 + Phaser.Math.Between(-14, 14));
                g.lineTo(x1, y1);
              }
              g.strokePath();
            }
            for (let i = 2; i < P.length; i += 2) this.burst(P[i], P[i + 1], 0xfff07a, 6);
            this.tweens.add({ targets: g, alpha: 0, duration: 260, onComplete: () => g.destroy() });
            if (ev.pts && ev.x !== undefined && this.me && Math.hypot(ev.x - this.me.x, ev.y - this.me.y) < 500) Sfx.play('zap');
            break;
          }
          case 'wd': {
            // 天狗の羽団扇：緑の突風の輪
            const c = this.add.circle(ev.x, ev.y - 20, ev.r, 0x9affb0, 0.18).setStrokeStyle(6, 0xd8ffe0, 0.9).setDepth(FX_DEPTH - 6).setScale(0.2).setBlendMode('ADD');
            this.tweens.add({ targets: c, scale: 1, alpha: 0, duration: 380, ease: 'Cubic.out', onComplete: () => c.destroy() });
            this.burst(ev.x, ev.y - 20, 0xc8ffd0, 14);
            if (this.me && Math.hypot(ev.x - this.me.x, ev.y - this.me.y) < 500) Sfx.play('wind');
            break;
          }
          case 'ih': {
            // 装備の攻撃がプレイヤーに当たった
            const col = ev.b === me ? '#ff6a6a' : ev.a === me ? '#ffb84a' : '#ffffff';
            this.floatText(ev.x + Phaser.Math.Between(-14, 14), ev.y - 80, ev.d > 0 ? String(ev.d) : 'MISS', col, ev.a === me || ev.b === me ? 22 : 16);
            if (ev.a === me) Sfx.play('kill');
            break;
          }
          case 'bm': {
            const c = this.add.circle(ev.x, ev.y, ev.r, 0xffa04a, 0.45).setDepth(FX_DEPTH - 6).setScale(0.3).setBlendMode('ADD');
            this.tweens.add({ targets: c, scale: 1, alpha: 0, duration: 320, onComplete: () => c.destroy() });
            break;
          }
          case 'ed': {
            this.burst(ev.x, ev.y - 10, ENEMY_BURST[ev.ty] || 0xffffff, ev.ty === 15 ? 140 : ev.ty >= 28 ? 100 : ev.ty === 4 ? 60 : FIELD_BOSS[ev.ty] ? 30 + FIELD_BOSS[ev.ty] * 10 : ev.ty === 7 ? 30 : 8);
            this.freeEnemy(ev.i);
            if (ev.by === me) { this.ui.addCombo(); FX.twinkle(this, ev.x, ev.y - 20, 3); Sfx.pop(ev.ty, ev.el, this.ui.combo); } // 倒した！の音
            if (ev.ty === 7 && ev.by === me) { FX.confetti(this, ev.x, ev.y - 30, 60, 0xffd84f); this.ui.stampFx('GOLD!!', '#ffd84f'); Sfx.play('legend'); }
            if (FIELD_BOSS[ev.ty]) {
              const lvB = FIELD_BOSS[ev.ty];
              this.cameras.main.shake(200 + lvB * 60, 0.004 + lvB * 0.002);
              FX.shockwave(this, ev.x, ev.y - 20, ENEMY_BURST[ev.ty], 140 + lvB * 40);
              if (ev.by === me) { FX.rays(this, ev.x, ev.y - 30, ENEMY_BURST[ev.ty], 300 + lvB * 80, 900); FX.confetti(this, ev.x, ev.y - 40, 30 + lvB * 15); this.ui.stampFx(['', '化け提灯 撃破！', '大蛇 撃破！！', '獅子 撃破！！', '白獅子神 撃破！！！'][lvB], '#ffe07a'); }
            }
            if (ev.ty === 4) {
              this.cameras.main.shake(400, 0.01);
              FX.rays(this, ev.x, ev.y - 30, 0xffd060, 600, 1600); FX.confetti(this, ev.x, ev.y - 40, 120); FX.punch(this, 0.12);
              if (ev.by === me) { this.ui.flashFx(0xffffff, 0.6); this.ui.stampFx('ボス撃破！！', '#ffe07a'); Sfx.play('lvlBig'); }
            }
            break;
          }
          case 'gs': this.addGem(ev.id, ev.x, ev.y, ev.v, ev.fx, ev.fy); break;
          case 'gc': {
            const g = this.gSprites.get(ev.id);
            if (!g) break;
            g.taken = true; g.got = true;
            const pos = ev.p ? this.posOf(ev.p) : null;
            if (!pos) { this.tweens.add({ targets: g.img, alpha: 0, duration: 200, onComplete: () => { g.img.destroy(); this.gSprites.delete(ev.id); } }); break; }
            this.tweens.add({
              targets: g.img, x: pos.x, y: pos.y - 30, scale: 0.3, duration: 160, ease: 'Quad.in',
              onComplete: () => { g.img.destroy(); this.gSprites.delete(ev.id); },
            });
            if (ev.p === me) { Sfx.gemLadder(); if (Math.random() < 0.4) FX.twinkle(this, pos.x + Phaser.Math.Between(-20, 20), pos.y - 40, 2); }
            break;
          }
          case 'lu': {
            const pos = this.posOf(ev.p) || { x: ev.x, y: ev.y };
            this.burst(pos.x, pos.y - 30, 0xffe07a, 14);
            if (ev.p === me) {
              // レベルアップ演出：光の柱・後光・衝撃波・紙吹雪・ズーム
              FX.pillar(this, pos.x, pos.y, 0xffe07a);
              FX.rays(this, pos.x, pos.y - 40, 0xffe07a, 380, 1300);
              FX.shockwave(this, pos.x, pos.y - 20, 0xffe07a, 160);
              FX.confetti(this, pos.x, pos.y - 60, 70);
              FX.stars(this, pos.x, pos.y - 40, 18);
              FX.punch(this, 0.1);
              Sfx.play('lvlBig');
              this.ui.levelUpFx(ev.lv);
            }
            break;
          }
          case 'evo': {
            const def = GD.SPECIES[ev.sp];
            const pos = this.posOf(ev.p) || { x: ev.x, y: ev.y };
            this.burst(pos.x, pos.y - 30, def.color, 40);
            this.burst(pos.x, pos.y - 30, 0xffffff, 20);
            if (ev.p === me) {
              // 進化演出：暗転→スポットライト→白フラッシュ→進化後の姿
              FX.rays(this, pos.x, pos.y - 40, 0xffffff, 700, 2400);
              FX.pillar(this, pos.x, pos.y, def.color);
              this.time.delayedCall(900, () => {
                FX.shockwave(this, pos.x, pos.y - 30, 0xffffff, 260);
                FX.confetti(this, pos.x, pos.y - 60, 140);
                FX.stars(this, pos.x, pos.y - 40, 30);
                FX.punch(this, 0.14);
                this.cameras.main.shake(300, 0.008);
              });
              Sfx.play('evo');
              this.ui.evolveFx(ev.sp);
            } else this.floatText(pos.x, pos.y - 120, `進化！ ${def.evoName}`, '#ffe07a', 17);
            break;
          }
          case 'sk': this.skillFx(ev); if (ev.p === me) Sfx.play('skill'); break;
          case 'hu':
            if (ev.p === me) { Sfx.play('hurt'); this.cameras.main.shake(90, 0.004); this.ui.hurtFlash(); }
            break;
          case 'dd':
            this.burst(ev.x, ev.y - 30, 0xff8a8a, 30);
            if (ev.p === me) { Sfx.play('down'); this.cameras.main.shake(300, 0.01); }
            {
              // 着せ替え：倒したときの演出（倒した人が持っていれば、まわりの人にも見える）
              const ko = this.pSprites.get(ev.by), kf = ko && ko.pb && ko.pb.cs ? ko.pb.cs[2] : 0;
              if (kf === 1) { for (let i = 0; i < 4; i++) this.time.delayedCall(i * 140, () => { FX.confetti(this, ev.x + Phaser.Math.Between(-60, 60), ev.y - 80 - i * 20, 50); this.burst(ev.x, ev.y - 90, [0xff5a5a, 0xffe07a, 0x7ae8ff, 0xb07aff][i], 30); }); Sfx.play('lvlBig'); }
              else if (kf === 2) { FX.confetti(this, ev.x, ev.y - 60, 140, 0xffb8d8); this.burst(ev.x, ev.y - 40, 0xff9ad0, 50); }
              else if (kf === 3) {
                const g = this.add.graphics().setDepth(FX_DEPTH - 4).setBlendMode('ADD');
                g.lineStyle(6, 0xfff07a, 1); g.beginPath(); g.moveTo(ev.x + 20, ev.y - 600);
                for (let k = 1; k <= 6; k++) g.lineTo(ev.x + Phaser.Math.Between(-40, 40), ev.y - 600 + k * 100);
                g.strokePath(); this.cameras.main.flash(120, 255, 250, 200);
                this.tweens.add({ targets: g, alpha: 0, duration: 400, onComplete: () => g.destroy() }); Sfx.play('zap');
              }
            }
            if (ev.p === me) { /* 上で処理済み */ }
            else if (ev.by === me) {
              FX.confetti(this, ev.x, ev.y - 40, 90); FX.stars(this, ev.x, ev.y - 40, 20);
              this.ui.stampFx('撃破！！', '#ffe07a'); Sfx.play('stamp');
            }
            break;
          case 'rv': {
            const pos = this.posOf(ev.p) || { x: ev.x, y: ev.y };
            FX.pillar(this, pos.x, pos.y, 0xfff6a0); this.burst(pos.x, pos.y - 30, 0x8fffa0, 24);
            if (ev.p === me) { Sfx.play('revive'); this.ui.stampFx('よみがえった！', '#a8ff90'); }
            break;
          }
          case 'spawn': this.burst(ev.x, ev.y - 30, 0xffffff, 20); break;
          // 大妖（ビッグボス）
          case 'nss': {
            const dir = (ev.y < GD.WORLD.h / 2 ? '北' : '南') + (ev.x < GD.WORLD.w / 2 ? '西' : '東');
            this.ui.banner(`⚠ ${GD.NUSHI_NAME[ev.ty]}（Lv${ev.lv}）が${dir}に現れた！`, '#ffb0a0');
            this.ui.feed(`⚠ <b style="color:#ffb0a0">${GD.NUSHI_NAME[ev.ty]} Lv${ev.lv}</b> が${dir}に現れた`, '#3a1010');
            Sfx.play('boss');
            break;
          }
          case 'nsk': {
            const esc = t => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
            const nm = `${GD.NUSHI_NAME[ev.ty]} Lv${ev.lv}`;
            this.ui.feed(ev.n ? `👹 <b style="color:#fff07a">${esc(ev.n)}</b> が <b style="color:#ffb0a0">${nm}</b> を討伐！` : `👹 <b style="color:#ffb0a0">${nm}</b> が倒された！`, '#3a1010');
            if (this.local && Math.hypot(this.local.x - ev.x, this.local.y - ev.y) < 2000) {
              this.cameras.main.shake(500, 0.01); FX.confetti(this, ev.x, ev.y - 120, 100); FX.shockwave(this, ev.x, ev.y - 40, 0xffb0a0, 300);
              this.ui.stampFx('ヌシ 討伐！', '#ffe07a'); Sfx.play(ev.p === me ? 'legend' : 'lvlBig');
            }
            break;
          }
          case 'bbs':
            Sfx.play('boss'); this.cameras.main.shake(900, 0.008);
            this.ui.bigBossFx(true, '', ev.lv);
            break;
          case 'bbk': {
            const near = this.local && Math.hypot(this.local.x - ev.x, this.local.y - ev.y) < 2500;
            if (near) {
              this.cameras.main.shake(900, 0.014);
              FX.rays(this, ev.x, ev.y - 120, 0xc890ff, 900, 2400); FX.shockwave(this, ev.x, ev.y - 60, 0xd8b0ff, 420);
              FX.confetti(this, ev.x, ev.y - 160, 160); FX.punch(this, 0.12);
              this.burst(ev.x, ev.y - 100, 0xffe07a, 80);
            }
            this.ui.bigBossFx(false, ev.p === me ? '' : ev.n);
            { const esc = t => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
              const bn = `大妖オオマガツ Lv${ev.lv || 200}`;
              this.ui.feed(ev.n ? `👹 <b style="color:#fff07a">${esc(ev.n)}</b> が <b style="color:#e0b0ff">${bn}</b> を討伐！` : `👹 <b style="color:#e0b0ff">${bn}</b> が倒された！`, '#2a1040'); }
            Sfx.play(ev.p === me ? 'legend' : 'lvlBig');
            break;
          }
          case 'boss':
            Sfx.play('boss'); this.cameras.main.shake(500, 0.006);
            this.ui.banner('⚠ ボス出現！', '#ff8a7a');
            break;
          case 'bump': {
            // 体当たり：衝撃と、お互いのダメージ数字
            const mine = ev.a === me || ev.b === me;
            this.burst(ev.x, ev.y - 30, 0xfff07a, mine ? 24 : 12);
            const c = this.add.circle(ev.x, ev.y - 30, 40, 0xffffff, 0.5).setDepth(FX_DEPTH - 6).setScale(0.3).setBlendMode('ADD');
            this.tweens.add({ targets: c, scale: 1.4, alpha: 0, duration: 220, onComplete: () => c.destroy() });
            const pa = this.posOf(ev.a), pb = this.posOf(ev.b);
            const num = (pos, d, to, note) => {
              if (!pos) return;
              const col = to === me ? '#ff6a6a' : (to === ev.a ? ev.b : ev.a) === me ? '#ffe04a' : '#ffffff';
              this.floatText(pos.x + Phaser.Math.Between(-12, 12), pos.y - 70, d > 0 ? String(d) : 'MISS', col, d >= 60 ? 26 : 20);
              if (note) this.floatText(pos.x, pos.y - 100, note, '#ffd76a', 15);
            };
            num(pb, ev.da, ev.b, ev.ca);   // a が b に与えたダメージ
            num(pa, ev.db, ev.a, ev.cb);   // b が a に与えたダメージ
            if (mine) {
              Sfx.play('stamp');
              this.cameras.main.shake(140, 0.008);
              if ((ev.a === me && ev.db > 0) || (ev.b === me && ev.da > 0)) this.ui.hurtFlash();
            }
            break;
          }
          case 'tr': {
            const pos = this.posOf(ev.p) || { x: ev.x, y: ev.y };
            if (ev.k === 'curse') { this.burst(ev.x, ev.y - 30, 0x8a2aff, 30); this.floatText(ev.x, ev.y - 90, '道連れの呪い！', '#d08aff', 18); }
            if (ev.k === 'alarm') { this.burst(pos.x, pos.y - 30, 0xfff6a0, 20); this.floatText(pos.x, pos.y - 90, '身代わりの鈴！', '#fff6a0', 16); }
            break;
          }
          case 'gone': this.destroyPlayer(ev.p); break;
          case 'pt':
            if (ev.p === me && this.local) { this.floatText(this.local.x, this.local.y - 140, `+${ev.n} ガチャポイント`, '#7ae8ff', 20); Sfx.play('milestone'); }
            break;
          // 予告：赤い円が広がり、時間がたつと地面がたたきつけられる
          case 'bch': {
            // 大妖の突進の予告：進む道に赤い帯。ためている間にだんだん濃くなる
            const dx = ev.x2 - ev.x, dy = ev.y2 - ev.y, len = Math.hypot(dx, dy) || 1, nx = -dy / len * ev.w / 2, ny = dx / len * ev.w / 2;
            const pts = [new Phaser.Math.Vector2(ev.x + nx, ev.y + ny), new Phaser.Math.Vector2(ev.x2 + nx, ev.y2 + ny), new Phaser.Math.Vector2(ev.x2 - nx, ev.y2 - ny), new Phaser.Math.Vector2(ev.x - nx, ev.y - ny)];
            const g = this.add.graphics().setDepth(-4);
            const o = { k: 0 };
            const drawB = () => {
              g.clear();
              g.fillStyle(0xff2020, 0.12 + o.k * 0.25); g.fillPoints(pts, true);
              g.lineStyle(4, 0xff3030, 0.6 + o.k * 0.4); g.strokePoints(pts, true);
              // 矢印
              for (let i = 1; i <= 4; i++) {
                const f = i / 5, ax = ev.x + dx * f, ay = ev.y + dy * f, ux = dx / len * 40, uy = dy / len * 40;
                g.lineStyle(6, 0xffe0e0, 0.4 + o.k * 0.5); g.beginPath(); g.moveTo(ax - ux + nx * 0.4, ay - uy + ny * 0.4); g.lineTo(ax, ay); g.lineTo(ax - ux - nx * 0.4, ay - uy - ny * 0.4); g.strokePath();
              }
            };
            drawB();
            this.tweens.add({ targets: o, k: 1, duration: ev.d * 1000, onUpdate: drawB, onComplete: () => { this.tweens.add({ targets: g, alpha: 0, duration: 500, onComplete: () => g.destroy() }); } });
            if (this.local && Math.hypot(this.local.x - ev.x, this.local.y - ev.y) < 1500) { this.ui.banner('⚠ 大妖の突進！ よけろ！', '#ff8a7a'); Sfx.play('boss'); }
            break;
          }
          case 'bh': {
            // 突進に当たった
            const pos = this.posOf(ev.p) || { x: ev.x, y: ev.y };
            this.floatText(pos.x, pos.y - 90, String(ev.d), '#ff3a3a', 34);
            this.burst(pos.x, pos.y - 30, 0xff5a5a, 30);
            if (ev.p === me) { this.cameras.main.shake(400, 0.02); this.ui.hurtFlash(); Sfx.play('stamp'); }
            break;
          }
          case 'tg': {
            const ring = this.add.circle(ev.x, ev.y, ev.r, 0xff2020, 0.12).setStrokeStyle(4, 0xff3030, 0.9).setDepth(-5);
            const fill = this.add.circle(ev.x, ev.y, ev.r, 0xff2020, 0.3).setDepth(-4).setScale(0);
            this.tweens.add({ targets: fill, scale: 1, duration: ev.d * 1000, ease: 'Linear' });
            this.tweens.add({ targets: ring, alpha: 0.5, duration: 160, yoyo: true, repeat: -1 });
            this.time.delayedCall(ev.d * 1000 + 40, () => { ring.destroy(); fill.destroy(); });
            break;
          }
          case 'slx': {
            const c = this.add.circle(ev.x, ev.y, ev.r, 0xffb070, 0.55).setDepth(FX_DEPTH - 6).setBlendMode('ADD').setScale(0.4);
            this.tweens.add({ targets: c, scale: 1.1, alpha: 0, duration: 380, onComplete: () => c.destroy() });
            this.burst(ev.x, ev.y, 0xffa060, this.lowFx ? 6 : 16);
            const d = this.local ? Math.hypot(ev.x - this.local.x, ev.y - this.local.y) : 9999;
            if (d < 900) { this.cameras.main.shake(220, 0.006); Sfx.play('slam'); }
            break;
          }
          case 'sl':
            if (ev.p === me) { this.ui.hurtFlash(); this.floatText(ev.x, ev.y - 80, '-' + ev.d, '#ff5a5a', 26); }
            break;
          // 百鬼夜行
          case 'hyw':
            if (this.me && this.me.lv >= ev.lv) { this.ui.banner('⚠ 百鬼夜行が近づいている…', '#d08aff'); Sfx.play('boss'); }
            break;
          case 'hy':
            if (this.me && this.me.hy) { this.ui.stampFx('百鬼夜行！', '#d08aff'); this.cameras.main.shake(600, 0.008); Sfx.play('boss'); Bgm.intense(true); }
            break;
          case 'hyc':
            if (ev.p === me) { this.ui.stampFx('生還！', '#ffe07a'); FX.confetti(this, ev.x, ev.y - 40, 120); FX.rays(this, ev.x, ev.y - 30, 0xffd060, 600, 1600); Sfx.play('lvlBig'); }
            break;
          // 賞金首
          case 'bty':
            this.ui.banner(ev.p === me ? '💰 あなたが賞金首になった！' : `💰 賞金首：${ev.n}`, '#ffd84f');
            break;
          case 'btk':
            this.ui.banner(ev.k === me ? '💰 賞金首を討ち取った！' : `💰 ${ev.n} が賞金首 ${ev.v} を討ち取った`, '#ffd84f');
            if (ev.k === me) Sfx.play('legend');
            break;
        }
      }
    }
  }

  window.GameScene = GameScene;
})();
