// モノノカタリ -百鬼夜行- ゲームロジック（ずっと続くオンライン世界）
// サーバー（macOS の jsc）で実行され、各プレイヤーにはまわりの様子だけを送る。
// プレイヤーはモンスター。敵を倒してレベルを上げ、固有の能力を伸ばし、Lv10で進化する。
(function (global) {
  'use strict';

  const WORLD = { w: 10000, h: 10000 };
  const TICK = 0.05;           // 20Hz
  const MAX_PLAYERS = 50;      // 1つの世界に入れる人数（Bot含む）
  const BOT_TARGET = 24;       // 人が少ないときはBotでこの人数まで埋める
  const ENEMY_PER_PLAYER = 55; // プレイヤー1人あたりの敵の上限（密度）
  const ENEMY_CAP = 2600;
  const GEM_CAP = 5000;
  const SWARM_EVERY = 28;      // 敵の群れが押し寄せる間隔（プレイヤーごと）
  const BOSS_EVERY = 100;      // どこかにボスが出る間隔
  const VIEW_R = 1250;         // 細かい情報を送る範囲
  const RADAR_R = 4500;        // レーダー用にざっくり送る範囲
  const EVOLVE_LV = 30;        // このレベルで進化（進化するとものすごく強くなる）
  const PROTECT_TIME = 10;     // 出撃直後は体当たりされない
  const NEWBIE_LV = 1;         // （レベルによる保護はなし）
  const BUMP_CD = 0.55;        // 同じ相手への体当たりの間隔（秒）
  const ELITE_LV = 12;         // このレベルから「強敵」が混ざる
  const PARADE_EVERY = 240;    // 百鬼夜行（高レベルの人のもとへ強敵の大群が押し寄せる）の間隔
  const PARADE_LV = 20;        // 百鬼夜行に巻き込まれるレベル
  const PARADE_TIME = 45;      // 百鬼夜行を生き延びる時間
  const BOUNTY_LV = 15;        // 賞金首になるレベル

  // プレイヤーが選べるモンスター（性能はだいたい同じ強さ。得意なことが違う）
  // atk: 自動で撃つ通常攻撃 / skill: 自動で発動するスキル / trait: プレイヤー同士のバトルで効く特性
  const SPECIES = {
    gekomaru: {
      name: 'ゲコまる', evoName: 'ガマまる', color: 0x9ccf5a, hp: 130, spd: 200, role: 'バランス型',
      atk: { pattern: 'single', dmg: 11, cd: 0.7, speed: 500, life: 0.9, r: 8 },
      skill: { id: 'tongue', name: 'ベロ伸ばし', cd: 4, desc: '長いベロで一直線に貫く', area: false },
      trait: { id: 'gulp', name: '丸のみ', desc: '体当たりで与えたダメージの一部を回復' },
    },
    suzune: {
      name: 'スズネ', evoName: 'めだまスズネ', color: 0xc89a6a, hp: 95, spd: 245, role: 'スピード型',
      atk: { pattern: 'single', dmg: 5, cd: 0.3, speed: 680, life: 0.7, r: 6 },
      skill: { id: 'wind', name: '追い風', cd: 8, desc: 'しばらく足がとても速くなる', area: false },
      trait: { id: 'alarm', name: '身代わりの鈴', desc: 'HPが減ると鈴が鳴り、猛ダッシュで逃げる' },
    },
    maimai: {
      name: 'マイマイ', evoName: 'オオマイマイ', color: 0xc8d27a, hp: 165, spd: 175, role: 'タフ型',
      atk: { pattern: 'single', dmg: 17, cd: 1.1, speed: 320, life: 1.3, r: 10 },
      skill: { id: 'heal', name: 'ぬめぬめ回復', cd: 7, desc: 'HPを回復', area: false },
      trait: { id: 'underdog', name: '根性', desc: '格上が相手だと体当たりが強くなる' },
    },
    rangyo: {
      name: 'ランギョ', evoName: 'らんちゅう大王', color: 0xff8a4a, hp: 135, spd: 215, role: '成長型',
      atk: { pattern: 'spread', n: 3, spread: 0.25, dmg: 8, cd: 0.75, speed: 480, life: 0.85, r: 8 },
      skill: { id: 'lucky', name: '招き金魚', cd: 10, desc: '経験値をばらまく（いつでも経験値+15%）', area: false },
      trait: { id: 'luck', name: '強運', desc: 'よく会心の一撃（2倍ダメージ）' },
    },
    kodama: {
      name: 'コダマ', evoName: '紅コダマ', color: 0xff6a5a, hp: 110, spd: 225, role: '近接型',
      atk: { pattern: 'spread', n: 3, spread: 0.35, dmg: 10, cd: 0.6, speed: 540, life: 0.38, r: 8 },
      skill: { id: 'frenzy', name: 'ひっかき乱舞', cd: 6, desc: '全方位をひっかく', area: false },
      trait: { id: 'first', name: '先制', desc: '久しぶりの体当たりは2倍ダメージ' },
    },
    kohaku: {
      name: 'コハク', evoName: '炎コハク', color: 0xffa07a, hp: 105, spd: 235, role: '撹乱型',
      atk: { pattern: 'single', dmg: 12, cd: 0.6, speed: 640, life: 0.8, r: 8 },
      skill: { id: 'moon', name: '月跳び', cd: 7, desc: 'まわりの敵をはじき飛ばす', area: true },
      trait: { id: 'hop', name: 'すりぬけ', desc: 'ときどき体当たりをひらりとよける' },
    },
    kuroro: {
      name: 'クロロ', evoName: '黒羽クロロ', color: 0x6a6a86, hp: 100, spd: 220, role: '狙撃型',
      atk: { pattern: 'single', dmg: 11, cd: 0.7, speed: 660, life: 0.9, r: 8, pierce: 1 },
      skill: { id: 'flock', name: 'カラスの群れ', cd: 6, desc: '何体もの敵を同時に狙う', area: false },
      trait: { id: 'steal', name: '横取り', desc: '倒した相手の経験値を多めに奪う' },
    },
    uroko: {
      name: 'ウロコ', evoName: '大蛇ウロコ', color: 0xc89a5a, hp: 145, spd: 210, role: '妨害型',
      atk: { pattern: 'single', dmg: 13, cd: 0.65, speed: 560, life: 0.95, r: 9, slow: 1.5 },
      skill: { id: 'venom', name: '毒霧', cd: 5, desc: 'まわりの敵にダメージ＋スロー', area: true },
      trait: { id: 'poison', name: '毒牙', desc: '体当たりした相手を毒にする' },
    },
    komori: {
      name: 'コモリ', evoName: '森亀コモリ', color: 0x7aaa5a, hp: 185, spd: 165, role: '守り型',
      atk: { pattern: 'single', dmg: 19, cd: 1.2, speed: 360, life: 1.2, r: 11 },
      skill: { id: 'shell', name: '甲羅バリア', cd: 9, desc: 'ダメージを防ぐバリア', area: false },
      trait: { id: 'guard', name: '鉄壁', desc: '受ける体当たりダメージを軽減' },
    },
    toosibi: {
      name: 'トオシビ', evoName: '大トオシビ', color: 0xff5a3a, hp: 110, spd: 200, role: '爆発型',
      atk: { pattern: 'single', dmg: 15, cd: 1.2, speed: 400, life: 1.1, r: 11, aoe: 75 },
      skill: { id: 'nova', name: '鬼火爆発', cd: 6.5, desc: 'まわりを大爆発', area: true },
      trait: { id: 'curse', name: '道連れ', desc: 'やられたとき、倒した相手に大ダメージ' },
    },
    nejimaru: {
      name: 'ネジまる', evoName: '分解ネジまる', color: 0x5ab0b0, hp: 120, spd: 205, role: '弾幕型',
      atk: { pattern: 'spread', n: 2, spread: 0.15, dmg: 9, cd: 0.65, speed: 580, life: 0.9, r: 8 },
      skill: { id: 'drone', name: 'パーツ発射', cd: 5, desc: '全方位にパーツを飛ばす', area: false },
      trait: { id: 'bomb', name: '自爆装置', desc: 'やられたとき大爆発してまわりにダメージ' },
    },
    hakua: {
      name: 'ハクア', evoName: '白狼ハクア', color: 0xe8f0ff, hp: 130, spd: 215, role: '威圧型',
      atk: { pattern: 'spread', n: 3, spread: 0.2, dmg: 10, cd: 0.85, speed: 620, life: 0.9, r: 8, pierce: 1 },
      skill: { id: 'roar', name: '白狼の咆哮', cd: 8, desc: 'まわりの敵を気絶させる', area: true },
      trait: { id: 'awe', name: '威圧', desc: '体当たりした相手をしばらく遅くする' },
    },
    sinonome: {
      name: 'シノノメ', evoName: '鈴鹿シノノメ', color: 0xf0a050, hp: 120, spd: 210, role: '不死型',
      atk: { pattern: 'radial', n: 8, dmg: 9, cd: 1.4, speed: 480, life: 0.9, r: 8 },
      skill: { id: 'bless', name: '鈴の祝福', cd: 10, desc: '大きく回復', area: true },
      trait: { id: 'revive', name: 'よみがえりの鈴', desc: 'やられても一度だけ復活することがある' },
    },
  };
  const SPECIES_KEYS = Object.keys(SPECIES);

  // 敵（番号は描画側と共通。4番はボス）
  const ENEMY_TYPES = ['slime', 'bat', 'wisp', 'brute', 'boss', 'shroom', 'beetle', 'gold', 'golem'];
  const ENEMIES = {
    slime:  { hp: 14, spd: 72, dmg: 6, r: 17, xp: 1 },
    bat:    { hp: 8, spd: 135, dmg: 5, r: 14, xp: 1 },
    wisp:   { hp: 24, spd: 100, dmg: 8, r: 16, xp: 2 },
    brute:  { hp: 80, spd: 56, dmg: 14, r: 26, xp: 5 },
    boss:   { hp: 2400, spd: 62, dmg: 26, r: 56, xp: 5 },
    shroom: { hp: 30, spd: 50, dmg: 6, r: 16, xp: 2 },
    beetle: { hp: 18, spd: 165, dmg: 7, r: 15, xp: 2 },
    gold:   { hp: 70, spd: 150, dmg: 0, r: 18, xp: 30 },  // 逃げ回るボーナス敵
    golem:  { hp: 240, spd: 45, dmg: 18, r: 32, xp: 12 },
  };

  // 強化カード。{skill} {trait} はモンスターごとのスキル名・特性名に置き換わる
  const UPGRADES = {
    dmg:      { name: '攻撃力 UP', desc: '通常攻撃のダメージ +20%', ok: () => true, apply: p => { p.dmgMul *= 1.2; } },
    rate:     { name: '連射 UP', desc: '通常攻撃の間隔 -13%', ok: p => p.rateMul > 0.35, apply: p => { p.rateMul *= 0.87; } },
    extra:    { name: '弾数 +1', desc: '通常攻撃の弾が1つ増える', ok: p => p.extra < 4, apply: p => { p.extra++; } },
    pierce:   { name: '貫通弾', desc: '弾が敵を貫通 +1', ok: p => p.pierce < 3, apply: p => { p.pierce++; } },
    skillPow: { name: '{skill} 強化', desc: '{skill}の威力 +45%', ok: () => true, apply: p => { p.skillPow *= 1.45; } },
    skillCd:  { name: '{skill} 連発', desc: '{skill}のクールタイム -22%', ok: p => p.skillCd > 0.3, apply: p => { p.skillCd *= 0.78; } },
    area:     { name: '{skill} 拡大', desc: '{skill}の範囲 +30%', ok: p => SPECIES[p.sp].skill.area && p.areaMul < 2.6, apply: p => { p.areaMul *= 1.3; } },
    hp:       { name: 'タフネス', desc: '最大HP +25% & 全回復', ok: () => true, apply: p => { p.mhp *= 1.25; p.hp = p.mhp; } },
    regen:    { name: '自然回復', desc: '毎秒HPが回復 +1.5', ok: p => p.regen < 9, apply: p => { p.regen += 1.5; } },
    magnet:   { name: 'マグネット', desc: '経験値の吸引範囲 +40%', ok: p => p.magnet < 450, apply: p => { p.magnet *= 1.4; } },
    bump:     { name: '体当たり強化', desc: 'ぶつかったときのダメージ +25%', ok: () => true, apply: p => { p.bumpMul *= 1.25; } },
    trait:    { name: '{trait} 覚醒', desc: '【{trait}】の効果 大アップ＋攻撃と体当たり +10%', ok: p => p.traitLv < 5, apply: p => { p.traitLv++; p.dmgMul *= 1.1; p.bumpMul *= 1.1; } },
  };
  const UPGRADE_KEYS = Object.keys(UPGRADES);
  function upgradeText(key, sp) {
    const u = UPGRADES[key], d = SPECIES[sp];
    const f = s => s.replace(/\{skill\}/g, d ? d.skill.name : 'スキル').replace(/\{trait\}/g, d ? d.trait.name : '特性');
    return { name: f(u.name), desc: f(u.desc) };
  }

  const BOT_NAMES = ['ハヤテ', 'ミナト', 'ソラ', 'リン', 'カイ', 'ユズ', 'レン', 'ヒナ', 'アオイ', 'トワ', 'ナギ', 'コハル',
    'イブキ', 'サク', 'ツムギ', 'ルイ', 'ミオ', 'タケル', 'ノア', 'ヒカリ', 'ケイ', 'アサヒ', 'シオン', 'リク', 'ユウ', 'メイ',
    'カナタ', 'ハル', 'スイ', 'ダイチ', 'モモ', 'ジン', 'ルナ', 'セナ', 'ライ', 'ミク', 'ソウ', 'エマ', 'タイガ', 'ヨル'];
  const COLORS = [0x4fc3ff, 0xff6b6b, 0x7cff8a, 0xffd84f, 0xd38bff, 0xff9f43, 0x5ff5e0, 0xff7ad9, 0xb0c4ff, 0xc8ff6b,
    0xffb3b3, 0x9effff, 0xf0e68c, 0x87cefa, 0xffa07a, 0x98fb98, 0xdda0dd, 0xffdab9, 0x7fffd4, 0xe0b0ff];

  // 必要経験値：低レベルは少なめ、高レベルでも上がり続けるようゆるやかに
  const xpNeed = lv => Math.floor(3 + lv * 2 + lv * lv * 0.2);
  // 敵の攻撃の強さ（レベルが上がるほど痛い）
  const dmgCurve = lv => 1 + (lv - 1) * 0.05 + (lv - 1) * (lv - 1) * 0.0015;
  // 高レベル向けに出た敵が低レベルの人に当たったときは、その人のレベル相当まで弱める
  const dmgFor = (e, p) => (e.lvd > 1 ? e.dmg * Math.min(1, dmgCurve(p.lv) / e.lvd) : e.dmg);
  const rand = (a, b) => a + Math.random() * (b - a);
  const randInt = (a, b) => Math.floor(rand(a, b + 1));
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const r1 = v => Math.round(v);
  const chance = p => Math.random() < p;
  // 見た目の強さ（オーラ）の段階：Lv5,10,15,20,30,40
  const isProtected = p => p.protT > 0 || p.lv < NEWBIE_LV;
  const auraTier = lv => (lv >= 40 ? 6 : lv >= 30 ? 5 : lv >= 20 ? 4 : lv >= 15 ? 3 : lv >= 10 ? 2 : lv >= 5 ? 1 : 0);

  // ---------- マップ生成（シード固定で全員同じマップになる） ----------
  // ブラウザ間で結果がずれないよう、四則演算と sqrt だけを使う（sin などは使わない）
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const EDGE = 110; // プレイヤーが入れない外周
  const PLAZA_R = 470;
  const SOLID_CELL = 200;

  function generateMap(seed) {
    const rnd = mulberry32(seed || 1);
    const R = (a, b) => a + rnd() * (b - a);
    const W = WORLD.w, H = WORLD.h, cx = W / 2, cy = H / 2;
    const AREA = (W * H) / (3200 * 3200);
    const props = [], solids = [], patches = [], paths = [];

    // 中央広場から東西南北へのびる、くねくねした小道
    const dirs = [[0, -1], [1, 0], [0, 1], [-1, 0]];
    for (const [dx, dy] of dirs) {
      const pts = [];
      const len = (dx ? W : H) / 2 - 40;
      const N = 110;
      let off = 0, vel = 0;
      for (let i = 0; i <= N; i++) {
        const t = i / N;
        vel = vel * 0.86 + (rnd() - 0.5) * 18 - off * 0.012;
        off += vel;
        const o = off * t;
        pts.push({ x: cx + dx * len * t - dy * o, y: cy + dy * len * t + dx * o });
      }
      paths.push(pts);
    }
    const pathPts = [].concat(...paths);
    const nearPath = (x, y, m) => { const m2 = m * m; for (const p of pathPts) if ((p.x - x) * (p.x - x) + (p.y - y) * (p.y - y) < m2) return true; return false; };
    const d2c = (x, y) => (x - cx) * (x - cx) + (y - cy) * (y - cy);
    const zone = (x, y) => {
      if (d2c(x, y) < PLAZA_R * PLAZA_R) return 'plaza';
      const east = x >= cx, north = y < cy;
      if (east && north) return 'autumn';
      if (!east && !north) return 'deep';
      if (!east && north) return 'flower';
      return 'rock';
    };

    const addTree = (x, y, z) => {
      let k;
      if (z === 'autumn') k = rnd() < 0.8 ? 'tree3' : (rnd() < 0.5 ? 'tree1' : 'tree2');
      else if (z === 'deep') k = rnd() < 0.08 ? 'tree3' : (rnd() < 0.5 ? 'tree1' : 'tree2');
      else k = rnd() < 0.25 ? 'tree3' : (rnd() < 0.5 ? 'tree1' : 'tree2');
      const s = R(0.72, 0.95);
      props.push({ k, x, y, s, f: rnd() < 0.5 });
      solids.push({ x, y: y - 22 * s, r: 34 * s });
    };

    // 外周を囲む木の壁（木は外周だけ）
    for (const inset of [36, 140]) {
      for (let t = 0; t < W; t += 100) {
        const j = () => R(-28, 28);
        const pts = [[t + j(), inset + j()], [t + j(), H - inset + j()], [inset + j(), t + j()], [W - inset + j(), t + j()]];
        for (const [x, y] of pts) addTree(x, y + 40, zone(x, y));
      }
    }

    // 小石（飾り。当たり判定なし。南東の岩場に多い）
    for (let i = 0, tries = 0; i < 100 * AREA && tries < 30000; tries++) {
      const x = R(220, W - 220), y = R(220, H - 220), z = zone(x, y);
      if (d2c(x, y) < 260 * 260 || nearPath(x, y, 50)) continue;
      if (z !== 'rock' && rnd() < 0.75) continue;
      const cluster = z === 'rock' ? Math.floor(R(1, 4)) : 1;
      for (let c = 0; c < cluster; c++) {
        props.push({ k: 'rock', x: x + R(-40, 40) * c, y: y + R(-24, 24) * c, s: R(0.1, 0.2), f: rnd() < 0.5 });
      }
      i++;
    }

    // 茂み（飾り。南西の深緑エリアに多い）
    for (let i = 0, tries = 0; i < 60 * AREA && tries < 20000; tries++) {
      const x = R(220, W - 220), y = R(220, H - 220), z = zone(x, y);
      if (d2c(x, y) < 300 * 300 || nearPath(x, y, 60)) continue;
      if (z !== 'deep' && rnd() < 0.7) continue;
      props.push({ k: 'bush', x, y, s: R(0.22, 0.34), f: rnd() < 0.5 }); i++;
    }

    // 花（北西の花畑にたくさん）
    for (let i = 0, tries = 0; i < 220 * AREA && tries < 40000; tries++) {
      const x = R(200, W - 200), y = R(200, H - 200), z = zone(x, y);
      if (nearPath(x, y, 40)) continue;
      if (z !== 'flower' && rnd() < 0.8) continue;
      if (z === 'plaza' && d2c(x, y) < 260 * 260) continue;
      const k = rnd() < 0.55 ? 'flower1' : 'flower2';
      props.push({ k, x, y, s: R(0.24, 0.36), f: rnd() < 0.5 }); i++;
    }

    // 地面の模様
    for (let i = 0; i < 70 * AREA; i++) {
      const x = R(0, W), y = R(0, H), z = zone(x, y);
      const tint = z === 'autumn' ? (rnd() < 0.5 ? 0xe0a050 : 0xd8c060) : z === 'flower' ? 0xb6dc7c : z === 'rock' ? 0xa9bd88 : z === 'deep' ? 0x5f9a4c : 0xa8d47c;
      patches.push({ x, y, rx: R(120, 320), ry: R(80, 200), c: tint, a: R(0.18, 0.35) });
    }

    props.sort((a, b) => a.y - b.y);

    // 当たり判定用のグリッド
    const gw = Math.ceil(W / SOLID_CELL), gh = Math.ceil(H / SOLID_CELL);
    const grid = new Array(gw * gh);
    for (let i = 0; i < grid.length; i++) grid[i] = [];
    for (const s of solids) {
      const x0 = Math.max(0, Math.floor((s.x - s.r) / SOLID_CELL)), x1 = Math.min(gw - 1, Math.floor((s.x + s.r) / SOLID_CELL));
      const y0 = Math.max(0, Math.floor((s.y - s.r) / SOLID_CELL)), y1 = Math.min(gh - 1, Math.floor((s.y + s.r) / SOLID_CELL));
      for (let yy = y0; yy <= y1; yy++) for (let xx = x0; xx <= x1; xx++) grid[yy * gw + xx].push(s);
    }
    return { seed, props, solids, patches, paths, grid, gw, gh };
  }

  // 円 o(x,y) 半径 r を障害物から押し出す
  function resolve(map, o, r) {
    const cx = Math.floor(o.x / SOLID_CELL), cy = Math.floor(o.y / SOLID_CELL);
    if (cx < 0 || cy < 0 || cx >= map.gw || cy >= map.gh) return;
    const cell = map.grid[cy * map.gw + cx];
    for (let pass = 0; pass < 2; pass++) {
      for (const s of cell) {
        const dx = o.x - s.x, dy = o.y - s.y, min = s.r + r, d2 = dx * dx + dy * dy;
        if (d2 < min * min) {
          const d = Math.sqrt(d2) || 0.01;
          o.x = s.x + dx / d * min;
          o.y = s.y + dy / d * min;
        }
      }
    }
  }

  const GRID = 80;
  const GW = Math.ceil(WORLD.w / GRID), GH = Math.ceil(WORLD.h / GRID);

  class GameSim {
    constructor(seed) {
      this.seed = seed || 1;
      this.map = generateMap(this.seed);
      this.time = 0;
      this.tick = 0;
      this.nextId = 1;
      this.botSeq = 0;
      this.players = [];
      this.pmap = new Map();
      this.enemies = [];
      this.projs = [];
      this.gems = [];
      this.events = [];
      this.hitEv = 0;
      this.bossT = BOSS_EVERY * 0.6;
      this.paradeT = PARADE_EVERY * 0.75;
      this.paradeWarned = false;
      this.bounty = null;
      this.bountyT = 0;
      this.slams = [];
      this.maxCP = 1;
      this.cells = new Array(GW * GH);
      for (let i = 0; i < this.cells.length; i++) this.cells[i] = [];
      this.usedCells = [];
    }

    uid() { return this.nextId++; }
    ev(o) { this.events.push(o); }

    // ---------- プレイヤー（モンスター） ----------
    spawnPos() {
      // まわりのプレイヤーからなるべく離れた場所に出撃
      let best = null, bestD = -1;
      for (let i = 0; i < 24; i++) {
        const x = rand(EDGE + 400, WORLD.w - EDGE - 400), y = rand(EDGE + 400, WORLD.h - EDGE - 400);
        let d = 1e9;
        for (const p of this.players) if (p.alive) d = Math.min(d, Math.hypot(p.x - x, p.y - y));
        if (d > bestD) { bestD = d; best = { x, y }; }
        if (d > 1500) break;
      }
      return best;
    }

    resetPlayer(p, sp) {
      const def = SPECIES[sp] ? SPECIES[sp] : SPECIES[SPECIES_KEYS[randInt(0, SPECIES_KEYS.length - 1)]];
      p.sp = SPECIES[sp] ? sp : SPECIES_KEYS.find(k => SPECIES[k] === def);
      const pos = this.spawnPos();
      Object.assign(p, {
        x: pos.x, y: pos.y, tx: null, ty: null,
        hp: def.hp, mhp: def.hp, lv: 1, xp: 0, xpn: xpNeed(1), txp: 0, evo: 0,
        alive: true, kills: 0, score: 0, bossKills: 0, pkills: 0, pkScore: 0,
        spd: def.spd, espd: def.spd, dmgMul: 1, rateMul: 1, extra: 0, pierce: 0, skillPow: 1, skillCd: 1, areaMul: 1,
        magnet: 150, regen: 0, bumpMul: 1, traitLv: 1, poisonT: 0, poisonDps: 0, pslowT: 0, alarmCd: 0, lastBump: -99, hitCd: {},
        atkCd: 0, scd: rand(1, 3), iframe: 2, choices: [], chSeq: p.chSeq || 0, chT: 0,
        tpT: 0, protT: PROTECT_TIME, revived: false, hyT: 0,
        shield: 0, shieldT: 0, hasteT: 0, deadT: 0, killedBy: null,
        ai: { t: 0, dx: 0, dy: 0, wx: 0, wy: 0 },
      });
      p.tp = (p.tp || 0) + 1;
      if (p.bot) {
        // Botは人より少し弱め（攻撃・体当たり・足の速さ・成長が控えめ）
        p.dmgMul = 0.7; p.bumpMul = 0.7; p.spd *= 0.9;
      }
    }

    addPlayer(id, name, bot, sp) {
      const p = { id, name, bot: !!bot, human: !bot, color: this.players.length % COLORS.length, tp: 0 };
      this.resetPlayer(p, sp);
      this.players.push(p);
      this.pmap.set(id, p);
      return p;
    }
    join(id, name, sp, save, item) {
      if (this.pmap.has(id)) return this.pmap.get(id);
      // 満員ならBotに抜けてもらう
      if (this.players.length >= MAX_PLAYERS) this.removeBot();
      const p = this.addPlayer(id, String(name || 'Player').slice(0, 12), false, save && SPECIES[save.sp] ? save.sp : sp);
      if (save) this.loadSave(p, save);
      this.setItem(p, item);
      return p;
    }

    // ---------- セーブ（続きから遊べるように） ----------
    exportSave(p) {
      if (!p || !p.alive) return null;
      const o = { sp: p.sp, pc: p.choices.length, evo2: 1 };
      for (const k of SAVE_KEYS) o[k] = typeof p[k] === 'number' ? Math.round(p[k] * 1000) / 1000 : p[k];
      return o;
    }
    loadSave(p, o) {
      if (!o || o.sp !== p.sp) return;
      for (const k of SAVE_KEYS) if (typeof o[k] === typeof p[k]) p[k] = o[k];
      p.lv = clamp(p.lv | 0, 1, 999);
      p.xpn = xpNeed(p.lv);
      // 進化レベルが10→30に変わる前のセーブ：Lv30未満なら進化前に戻す（Lv30で改めて進化）
      if (p.evo && p.lv < EVOLVE_LV) { p.evo = 0; p.mhp /= 1.5; }
      // Lv30以上で前のルールのまま進化していた人は、新しい進化の強さに合わせる
      if (p.evo && !o.evo2) { p.mhp *= 2.5 / 1.5; p.spd *= 1.15; p.regen += 3; }
      p.hp = clamp(p.hp, p.mhp * 0.3, p.mhp); // 少なくとも3割は回復した状態で再開
      for (let i = 0; i < Math.min(6, o.pc | 0); i++) this.makeChoices(p); // 選び残したカード
    }
    remove(id) {
      const p = this.pmap.get(id);
      if (!p) return;
      this.players = this.players.filter(q => q !== p);
      this.pmap.delete(id);
      this.ev({ e: 'gone', p: id });
    }
    respawn(id, sp, item) {
      const p = this.pmap.get(id);
      if (!p || p.alive) return;
      this.resetPlayer(p, sp);
      this.setItem(p, item);
      this.ev({ e: 'spawn', p: id, x: r1(p.x), y: r1(p.y) });
    }
    removeBot() {
      const bots = this.players.filter(p => p.bot);
      if (!bots.length) return;
      const dead = bots.find(p => !p.alive);
      this.remove((dead || bots[randInt(0, bots.length - 1)]).id);
    }
    manageBots() {
      const humans = this.players.filter(p => p.human).length;
      const bots = this.players.length - humans;
      const want = clamp(BOT_TARGET - humans, 0, MAX_PLAYERS - humans);
      if (bots < want) {
        const name = BOT_NAMES[this.botSeq % BOT_NAMES.length] + (this.botSeq >= BOT_NAMES.length ? Math.floor(this.botSeq / BOT_NAMES.length) + 1 : '');
        this.addPlayer('bot' + (this.botSeq++), name, true);
      } else if (bots > want) this.removeBot();
    }

    // 体の大きさ（レベルと進化で大きくなる。見た目と当たり判定の両方に使う）
    // 最初は敵より小さく、強くなるほど大きくなる
    radius(p) { return GameSim.size(p.lv, p.evo) / 2; }
    static size(lv, evo) { return (40 + 4 * Math.min(lv, 50)) * (evo ? 1.3 : 1); }
    // 体当たりのダメージ（レベル・進化・攻撃力・体当たり強化で上がる）
    bumpPower(p) { return 24 * this.lvMul(p) * p.bumpMul; }

    setInput(id, x, y) {
      const p = this.pmap.get(id);
      if (!p || p.bot) return;
      if (typeof x !== 'number' || typeof y !== 'number' || !isFinite(x) || !isFinite(y)) return;
      p.tx = x; p.ty = y;
    }

    choose(id, seq, idx) {
      const p = this.pmap.get(id);
      if (!p) return;
      const cur = p.choices[0];
      if (!cur || cur.s !== seq) return;
      const key = cur.o[clamp(idx | 0, 0, cur.o.length - 1)];
      UPGRADES[key].apply(p);
      p.choices.shift();
      p.chT = 0;
      this.ev({ e: 'up', p: p.id, k: key });
    }

    makeChoices(p) {
      const pool = UPGRADE_KEYS.filter(k => UPGRADES[k].ok(p));
      const opts = [];
      while (opts.length < 3 && pool.length) opts.push(pool.splice(randInt(0, pool.length - 1), 1)[0]);
      p.choices.push({ s: ++p.chSeq, o: opts });
      if (p.choices.length > 6) p.choices.shift(); // たまりすぎたら古いものから捨てる
    }

    addXp(p, v) {
      if (!p.alive) return;
      if (p.bot) v *= 0.7; // Botは成長がゆっくり
      if (p.lv < 10) v *= 1 + 0.6 * (10 - p.lv) / 9; // 低レベルは経験値ボーナス（Lv1で+60%、Lv10で0）
      if (p.sp === 'rangyo') v *= 1.15; // 成長型
      p.xp += v; p.txp += v;
      while (p.xp >= p.xpn) {
        p.xp -= p.xpn;
        p.lv++;
        p.xpn = xpNeed(p.lv);
        const gain = SPECIES[p.sp].hp * 0.08 * (p.evo ? 2.5 : 1); // レベルが上がるとHPも増える
        p.mhp += gain; p.hp += gain;
        p.hp = Math.min(p.mhp, p.hp + p.mhp * 0.2);
        this.makeChoices(p);
        this.ev({ e: 'lu', p: p.id, lv: p.lv, x: r1(p.x), y: r1(p.y) });
        if (p.human && p.lv % 5 === 0) this.ev({ e: 'pt', p: p.id, n: 10 }); // 5レベルごとにガチャポイント
        if (!p.evo && p.lv >= EVOLVE_LV) {
          p.evo = 1;
          p.mhp *= 2.5; p.hp = p.mhp; // HP2.5倍＆全回復
          p.spd *= 1.15; p.magnet *= 1.3; p.regen += 3; // 足が速く、吸い寄せ範囲も広く、自然回復も
          this.ev({ e: 'evo', p: p.id, sp: p.sp, x: r1(p.x), y: r1(p.y) });
        }
      }
    }

    // ---------- メインループ ----------
    step(dt) {
      this.time += dt;
      this.tick++;
      if (this.tick % 10 === 0) this.manageBots();

      // 速さ：レベルが上がると速くなる（大きくなってカメラが引いても遅く感じないように）。Lv30で頭打ち。
      // 格下は「いちばん強い人との差」の半分だけ底上げ + 最大15%速い（一方的に追いかけられないように）
      let mx = 1;
      for (const p of this.players) if (p.alive && p.lv > mx) mx = p.lv;
      const lvSpd = lv => 1 + 0.015 * Math.min(lv - 1, 30);
      for (const p of this.players) {
        if (!p.alive) continue;
        const ls = lvSpd(p.lv);
        let mul = (ls + 0.5 * (lvSpd(mx) - ls)) * (1 + 0.15 * clamp(1 - p.lv / mx, 0, 1));
        if (p.hasteT > 0) { p.hasteT -= dt; mul *= 1.45; }
        if (p.pslowT > 0) { p.pslowT -= dt; mul *= 0.6; }
        if (p.alarmCd > 0) p.alarmCd -= dt;
        if (p.poisonT > 0) {
          p.poisonT -= dt; p.hp -= p.poisonDps * dt;
          if (p.hp <= 0) { this.kill(p, p.poisonBy && p.poisonBy.alive ? p.poisonBy : null); continue; }
        }
        p.espd = p.spd * mul;
        if (p.shieldT > 0) { p.shieldT -= dt; if (p.shieldT <= 0) p.shield = 0; }
        if (p.protT > 0) p.protT -= dt;
        if (p.regen > 0) p.hp = Math.min(p.mhp, p.hp + p.regen * dt);
      }

      for (const p of this.players) this.movePlayer(p, dt);
      this.updateBumps(dt);
      this.spawnEnemies(dt);
      this.updateParade(dt);
      this.updateBounty(dt);
      this.moveEnemies(dt);
      this.updateSlams();
      this.buildGrid();
      this.separateEnemies();
      for (const p of this.players) this.playerCombat(p, dt);
      this.updateProjs(dt);
      this.cleanupEnemies();
      this.updateGems(dt);
      this.updateChoices(dt);
      for (const p of this.players) {
        if (!p.alive) {
          p.deadT += dt;
          if (p.bot && p.deadT > 3) this.resetPlayer(p);
          continue;
        }
        p.score = p.kills * 5 + Math.floor(p.txp) * 2 + p.bossKills * 300 + p.pkScore;
      }
    }

    movePlayer(p, dt) {
      if (!p.alive) return;
      if (p.iframe > 0) p.iframe -= dt;
      if (p.tpT > 0) p.tpT -= dt;
      if (p.tpT > 0) {
        // はじき飛ばされた直後は少しだけ停止
      } else if (p.bot) {
        this.botThink(p, dt);
      } else if (p.tx !== null) {
        const dx = p.tx - p.x, dy = p.ty - p.y, d = Math.hypot(dx, dy);
        const max = p.espd * dt * 1.8 + 4;
        if (d > max) { p.x += dx / d * max; p.y += dy / d * max; } else { p.x = p.tx; p.y = p.ty; }
      }
      p.x = clamp(p.x, EDGE, WORLD.w - EDGE);
      p.y = clamp(p.y, EDGE, WORLD.h - EDGE);
      resolve(this.map, p, 16);
    }

    kill(p, killer) {
      if (!p.alive) return;
      // よみがえりの鈴：一度だけ復活
      if (SPECIES[p.sp].trait.id === 'revive' && !p.revived && chance(0.3 + 0.1 * p.traitLv + (p.evo ? 0.15 : 0))) {
        p.revived = true;
        p.hp = p.mhp * 0.5; p.iframe = 2;
        this.ev({ e: 'rv', p: p.id, x: r1(p.x), y: r1(p.y) });
        return;
      }
      p.alive = false; p.hp = 0; p.deadT = 0; p.choices.length = 0; p.poisonT = 0;
      p.killedBy = killer ? killer.name : null;
      const tr = SPECIES[p.sp].trait.id, w = this.traitPow(p);
      if (killer && killer.alive) {
        // 倒した側は相手の経験値を吸収
        const kt = SPECIES[killer.sp].trait.id;
        const absorb = 0.85 + (kt === 'steal' ? 0.25 * this.traitPow(killer) : 0);
        killer.pkills++;
        killer.pkScore += 200 + p.lv * 25;
        if (this.bounty === p) {
          // 賞金首を倒した！
          killer.pkScore += 1500 + p.lv * 50;
          this.addXp(killer, p.txp * 0.5);
          this.ev({ e: 'btk', g: 1, n: killer.name, v: p.name, k: killer.id });
          this.bounty = null; this.bountyT = 3;
        }
        this.addXp(killer, 40 + p.lv * 20 + p.txp * absorb); // プレイヤーを倒すと経験値がたくさん
        // 道連れ：倒した相手に大ダメージ
        if (tr === 'curse') {
          killer.hp -= killer.mhp * Math.min(0.8, 0.35 * w);
          this.ev({ e: 'tr', p: p.id, k: 'curse', x: r1(killer.x), y: r1(killer.y) });
          if (killer.hp <= 0) this.kill(killer, null);
        }
      }
      // 自爆装置：まわりに大爆発
      if (tr === 'bomb') {
        const R = 230;
        for (const q of this.players) {
          if (q === p || !q.alive || isProtected(q) || Math.hypot(q.x - p.x, q.y - p.y) > R) continue;
          q.hp -= q.mhp * Math.min(0.7, 0.25 * w);
          if (q.hp <= 0) this.kill(q, null);
        }
        this.enemiesIn(p.x, p.y, R, e => this.damage(e, 50 * w, null));
        this.ev({ e: 'bm', x: r1(p.x), y: r1(p.y), r: R });
      }
      this.ev({ e: 'dd', p: p.id, by: killer ? killer.id : 0, x: r1(p.x), y: r1(p.y), lv: p.lv, sc: p.score, sp: p.sp });
    }

    traitPow(p) { return 1 + 0.7 * (p.traitLv - 1) + (p.evo ? 0.6 : 0); }

    // ---------- プレイヤー同士の体当たり（ぶつかるとお互いにダメージ） ----------
    updateBumps(dt) {
      const al = this.players.filter(p => p.alive && !isProtected(p));
      al.sort((a, b) => a.x - b.x);
      let maxR = 0;
      for (const q of al) maxR = Math.max(maxR, this.radius(q));
      for (let i = 0; i < al.length; i++) {
        const a = al[i];
        const ra = this.radius(a);
        for (let j = i + 1; j < al.length && al[j].x - a.x < ra + maxR + 20; j++) {
          const b = al[j];
          if (!a.alive || !b.alive) continue;
          const rr = ra + this.radius(b) + 16; // 見た目どおり当たるよう少し広めに
          const dx = b.x - a.x, dy = b.y - a.y, d2 = dx * dx + dy * dy;
          if (d2 >= rr * rr) continue;
          if ((a.hitCd[b.id] || 0) > this.time) continue;
          a.hitCd[b.id] = b.hitCd[a.id] = this.time + BUMP_CD;
          this.bump(a, b, Math.sqrt(d2) || 1, dx, dy, rr);
        }
      }
    }

    bump(a, b, d, dx, dy, rr) {
      const da = this.hitOnce(a, b), db = this.hitOnce(b, a);
      // 反動ではじき合う（大きい方はあまり動かない）
      const ra = this.radius(a), rb = this.radius(b);
      const push = rr - d + 70;
      const wa = rb / (ra + rb), wb = ra / (ra + rb);
      for (const [p, s, w] of [[a, -1, wa], [b, 1, wb]]) {
        if (!p.alive) continue;
        p.x = clamp(p.x + dx / d * push * w * s, EDGE, WORLD.w - EDGE);
        p.y = clamp(p.y + dy / d * push * w * s, EDGE, WORLD.h - EDGE);
        resolve(this.map, p, 16);
        p.tx = p.x; p.ty = p.y;
        p.tp++; p.tpT = 0.12;
      }
      this.ev({ e: 'bump', a: a.id, b: b.id, da: Math.round(da.dmg), db: Math.round(db.dmg), ca: da.note, cb: db.note, x: r1((a.x + b.x) / 2), y: r1((a.y + b.y) / 2) });
      if (b.hp <= 0) this.kill(b, a);
      if (a.hp <= 0) this.kill(a, b);
    }

    // atk が def に体当たりしたときのダメージ（特性込み）
    hitOnce(atk, def) {
      const ta = SPECIES[atk.sp].trait.id, td = SPECIES[def.sp].trait.id;
      const wa = this.traitPow(atk), wd = this.traitPow(def);
      // 固定ダメージ＋相手の最大HPの割合ダメージ（大きくなっても戦いが長引かないように。上限なし）
      const pct = 0.04 + 0.002 * Math.min(atk.lv, 40);
      const rel = clamp(this.lvMul(atk) / this.lvMul(def), 0.5, 1.5);
      let dmg = this.bumpPower(atk) + def.mhp * pct * rel * Math.sqrt(atk.bumpMul), note = '';
      if (ta === 'underdog' && def.lv > atk.lv) dmg *= 1 + Math.min(0.6 * wa, (def.lv - atk.lv) * 0.08 * wa);
      if (ta === 'first' && this.time - atk.lastBump > 3) { dmg *= 1 + wa; note = '先制！'; }
      if (ta === 'luck' && chance(Math.min(0.6, 0.32 * wa))) { dmg *= 2; note = '会心！'; }
      atk.lastBump = this.time;
      if (td === 'hop' && chance(Math.min(0.5, 0.2 * wd))) return { dmg: 0, note: 'よけた！' };
      if (td === 'guard') dmg *= 1 - Math.min(0.6, 0.3 * wd);
      this.hurtPlayer(def, dmg);
      def.iframe = Math.max(def.iframe, 0.2);
      if (ta === 'gulp') atk.hp = Math.min(atk.mhp, atk.hp + dmg * 0.3 * wa);
      if (ta === 'poison') { def.poisonT = 4; def.poisonDps = dmg * 0.3 * wa; def.poisonBy = atk; }
      if (ta === 'awe') def.pslowT = 1.2 * wa;
      // 身代わりの鈴：HPが減ったら猛ダッシュ
      if (td === 'alarm' && def.hp > 0 && def.hp < def.mhp * 0.3 && def.alarmCd <= 0) {
        def.alarmCd = 12; def.hasteT = 2.5 + wd; def.protT = Math.max(def.protT, 1.5);
        this.ev({ e: 'tr', p: def.id, k: 'alarm', x: r1(def.x), y: r1(def.y) });
      }
      return { dmg, note };
    }

    // ---------- Bot AI ----------
    botThink(p, dt) {
      const ai = p.ai;
      let fx = 0, fy = 0;
      const FR = 230;
      for (const e of this.nearEnemies(p.x, p.y, FR + 40)) {
        if (!e.dmg) continue;
        const dx = p.x - e.x, dy = p.y - e.y;
        const d = Math.hypot(dx, dy) || 1;
        const range = FR + e.r;
        if (d < range) {
          const w = (e.ty === 4 ? 3 : 1) * (1 - d / range) * 2.2 * (p.hp < p.mhp * 0.4 ? 1.6 : 1);
          fx += dx / d * w; fy += dy / d * w;
        }
      }
      let target = null, tw = 0, best = Infinity;
      // 同じくらいか少し弱い相手に体当たりしにいく。ずっと格下（6レベル以上下）は狙わない。強い相手・HPが少ないときは逃げる
      const my = p.lv + (p.evo ? 10 : 0), healthy = p.hp > p.mhp * 0.45;
      for (const q of this.players) {
        if (q === p || !q.alive) continue;
        const dx = q.x - p.x, dy = q.y - p.y;
        if (Math.abs(dx) > 900 || Math.abs(dy) > 900) continue;
        const d = Math.hypot(dx, dy) || 1;
        const their = q.lv + (q.evo ? 10 : 0);
        if (healthy && !isProtected(p) && !isProtected(q) && their <= my + 2 && their >= my - 8 && d < 800 && d < best) { best = d; target = q; tw = 2.3; }
        else if ((their > my + 3 || p.hp < p.mhp * 0.35) && !isProtected(q) && !isProtected(p) && d < 450) {
          const w = (1 - d / 520) * 3;
          fx -= dx / d * w; fy -= dy / d * w;
        }
      }
      // 経験値ジェム・ゴールドスライム
      if (!target) {
        best = 520;
        for (const g of this.nearGems(p.x, p.y, best)) {
          const d = Math.hypot(g.x - p.x, g.y - p.y);
          if (d < best) { best = d; target = g; tw = 1.0; }
        }
      }
      if (target) {
        const dx = target.x - p.x, dy = target.y - p.y, d = Math.hypot(dx, dy) || 1;
        if (d > 30) { fx += dx / d * tw; fy += dy / d * tw; }
      }
      // 外周の木をよける
      const M = 360;
      if (p.x < M) fx += (M - p.x) / M * 2;
      if (p.x > WORLD.w - M) fx -= (p.x - (WORLD.w - M)) / M * 2;
      if (p.y < M) fy += (M - p.y) / M * 2;
      if (p.y > WORLD.h - M) fy -= (p.y - (WORLD.h - M)) / M * 2;
      // ふらふら
      ai.t -= dt;
      if (ai.t <= 0) { ai.t = rand(1.5, 3.5); const a = rand(0, Math.PI * 2); ai.wx = Math.cos(a); ai.wy = Math.sin(a); }
      fx += ai.wx * 0.45; fy += ai.wy * 0.45;

      const fl = Math.hypot(fx, fy);
      if (fl > 1) { fx /= fl; fy /= fl; }
      ai.dx += (fx - ai.dx) * 0.25;
      ai.dy += (fy - ai.dy) * 0.25;
      const ml = Math.hypot(ai.dx, ai.dy);
      const sp = ml > 1 ? 1 / ml : 1;
      p.x += ai.dx * sp * p.espd * dt;
      p.y += ai.dy * sp * p.espd * dt;
    }
    nearEnemies(x, y, r) { const out = []; this.enemiesIn(x, y, r, e => out.push(e)); return out; }
    nearGems(x, y, r) {
      const out = [];
      for (const g of this.gems) if (Math.abs(g.x - x) < r && Math.abs(g.y - y) < r) out.push(g);
      return out;
    }

    // ---------- 敵 ----------
    spawnEnemies(dt) {
      const alive = this.players.filter(p => p.alive);
      if (!alive.length) return;
      const cap = Math.min(ENEMY_CAP, alive.length * ENEMY_PER_PLAYER);
      for (const p of alive) {
        // プレイヤーごとに、そのまわりへ敵を補充する（どこにいても密度は同じ）
        p.spawnAcc = (p.spawnAcc || 0) + (3.2 + Math.min(p.lv, 40) * 0.12) * dt;
        while (p.spawnAcc >= 1) {
          p.spawnAcc -= 1;
          if (this.enemies.length < cap) this.spawnEnemy(this.pickEnemyType(p.lv), p, undefined, undefined, p.lv >= ELITE_LV && chance(Math.min(0.25, (p.lv - ELITE_LV + 1) * 0.012)));
        }
        // 群れ：一定時間ごとにまわりから敵がわらわら
        p.swarmT = (p.swarmT === undefined ? rand(5, SWARM_EVERY) : p.swarmT) - dt;
        if (p.swarmT <= 0) {
          p.swarmT = SWARM_EVERY;
          const ty = this.pickEnemyType(p.lv, true);
          for (let i = 0; i < 14; i++) {
            const a = (i / 14) * Math.PI * 2;
            if (this.enemies.length < cap + 300) this.spawnEnemy(ty, p, p.x + Math.cos(a) * 560, p.y + Math.sin(a) * 560);
          }
        }
      }
      // ボス：どこかのプレイヤーの近くに出現
      this.bossT -= dt;
      if (this.bossT <= 0) {
        this.bossT = BOSS_EVERY;
        const p = alive[randInt(0, alive.length - 1)];
        const e = this.spawnEnemy(4, p);
        e.mhp = e.hp = ENEMIES.boss.hp * (1 + p.lv * 0.25);
        this.ev({ e: 'boss', x: r1(e.x), y: r1(e.y) });
      }
    }

    // ---------- 百鬼夜行：一定時間ごとに、高レベルの人のもとへ強敵の大群が押し寄せる。生き延びればごほうび ----------
    updateParade(dt) {
      this.paradeT -= dt;
      if (!this.paradeWarned && this.paradeT <= 15) {
        this.paradeWarned = true;
        this.ev({ e: 'hyw', g: 1, s: 15, lv: PARADE_LV });
      }
      if (this.paradeT <= 0) {
        this.paradeT = PARADE_EVERY; this.paradeWarned = false;
        let n = 0;
        for (const p of this.players) {
          if (!p.alive || p.lv < PARADE_LV) continue;
          p.hyT = PARADE_TIME; p.hyW = 0; p.hyBoss = false; n++;
        }
        this.ev({ e: 'hy', g: 1, n });
      }
      for (const p of this.players) {
        if (!p.hyT) continue;
        if (!p.alive) { p.hyT = 0; continue; }
        p.hyT -= dt; p.hyW -= dt;
        if (p.hyT <= 0) {
          // 生き延びた！ ごほうび
          p.hyT = 0;
          for (let i = 0; i < 12; i++) this.dropGem(p.x + rand(-140, 140), p.y + rand(-140, 140), 8 + p.lv * 2.5);
          p.pkScore += 600 + p.lv * 40;
          p.hp = p.mhp;
          this.ev({ e: 'hyc', p: p.id, x: r1(p.x), y: r1(p.y) });
          continue;
        }
        if (p.hyW <= 0) {
          p.hyW = 8;
          const n = p.evo ? 12 + Math.min(10, Math.floor(p.lv / 6)) : 7; // 進化前は少なめ
          const ty = this.pickEnemyType(p.lv + 8, true);
          for (let i = 0; i < n; i++) {
            const a = (i / n) * Math.PI * 2;
            this.spawnEnemy(i % 3 === 0 ? 3 : ty, p, p.x + Math.cos(a) * 640, p.y + Math.sin(a) * 640, true);
          }
          // 途中で大妖怪（ボス）も
          if (!p.hyBoss && p.hyT < PARADE_TIME - 15) {
            p.hyBoss = true;
            const e = this.spawnEnemy(4, p);
            e.mhp = e.hp = ENEMIES.boss.hp * (1 + p.lv * 0.3);
            e.dmg *= 1.3;
            this.ev({ e: 'boss', x: r1(e.x), y: r1(e.y) });
          }
        }
      }
    }

    // ---------- 賞金首：いちばんスコアの高い人（Lv15以上）。倒すと大量のスコアと経験値 ----------
    updateBounty(dt) {
      this.bountyT -= dt;
      if (this.bountyT > 0) return;
      this.bountyT = 5;
      if (this.bounty && !this.bounty.alive) this.bounty = null;
      let best = null;
      for (const p of this.players) if (p.alive && p.lv >= BOUNTY_LV && (!best || p.score > best.score)) best = p;
      // いまの賞金首より大きく上回ったら交代
      if (best && best !== this.bounty && (!this.bounty || best.score > this.bounty.score * 1.15)) {
        this.bounty = best;
        this.ev({ e: 'bty', g: 1, n: best.name, p: best.id });
      }
    }

    // 予告していた範囲攻撃を当てる
    updateSlams() {
      if (!this.slams.length) return;
      const keep = [];
      for (const s of this.slams) {
        if (s.at > this.time) { keep.push(s); continue; }
        for (const p of this.players) {
          if (!p.alive || p.iframe > 0) continue;
          const rr = s.r + this.radius(p) * 0.6;
          if ((p.x - s.x) ** 2 + (p.y - s.y) ** 2 > rr * rr) continue;
          const dmg = Math.min(dmgFor(s, p), p.mhp * 0.4); // 1発で最大HPの4割まで
          this.hurtPlayer(p, dmg);
          p.iframe = Math.max(p.iframe, 0.4);
          this.ev({ e: 'sl', p: p.id, d: Math.round(dmg), x: r1(p.x), y: r1(p.y) });
          if (p.hp <= 0) this.kill(p, null);
        }
        this.ev({ e: 'slx', x: r1(s.x), y: r1(s.y), r: s.r });
      }
      this.slams = keep;
    }

    pickEnemyType(lv, swarm) {
      // [番号, 重み]（レベルが上がるほど強い敵が混ざる）
      const w = [[0, 1], [1, lv > 2 ? 0.7 : 0], [5, lv > 4 ? 0.6 : 0], [2, lv > 7 ? 0.5 : 0], [6, lv > 10 ? 0.5 : 0],
        [3, lv > 14 ? 0.35 : 0], [8, lv > 20 ? 0.25 : 0], [7, swarm ? 0 : 0.015]];
      const total = w.reduce((a, b) => a + b[1], 0);
      let x = Math.random() * total;
      for (const [ty, wt] of w) { x -= wt; if (x <= 0) return ty; }
      return 0;
    }

    spawnEnemy(ty, near, x, y, elite) {
      if (x === undefined) {
        const a = rand(0, Math.PI * 2), d = rand(680, 860);
        x = near.x + Math.cos(a) * d; y = near.y + Math.sin(a) * d;
      }
      const def = ENEMIES[ENEMY_TYPES[ty]];
      const lv = near ? near.lv : 1;
      const hpMul = 1 + (lv - 1) * 0.13;
      const e = {
        id: this.uid(), ty, x: clamp(x, EDGE, WORLD.w - EDGE), y: clamp(y, EDGE, WORLD.h - EDGE),
        // 高レベルほど敵の攻撃も痛い（油断するとやられる）
        hp: def.hp * hpMul, mhp: def.hp * hpMul, spd: def.spd * rand(0.9, 1.1), dmg: def.dmg * dmgCurve(lv), lvd: dmgCurve(lv), r: def.r,
        xp: def.xp * (1 + (lv - 1) * 0.06), slowT: 0, stunT: 0, tgt: near, retT: 0, dead: false, life: ty === 7 ? 18 : 0,
        el: 0, slamT: rand(2, 4),
      };
      // 強敵：大きくて硬くて痛い。そのぶん経験値もたくさん
      if (elite && ty !== 7) {
        e.el = 1; e.hp *= 5; e.mhp = e.hp; e.dmg *= 2; e.r *= 1.35; e.xp *= 6; e.spd *= 1.1;
      }
      resolve(this.map, e, e.r * 0.6);
      this.enemies.push(e);
      return e;
    }

    moveEnemies(dt) {
      const alive = this.players.filter(p => p.alive);
      for (const e of this.enemies) {
        e.retT -= dt;
        if (e.retT <= 0 || !e.tgt || !e.tgt.alive) {
          e.retT = rand(0.5, 0.9);
          let best = Infinity, bt = null;
          for (const p of alive) {
            const dx = p.x - e.x, dy = p.y - e.y;
            if (Math.abs(dx) > 1700 || Math.abs(dy) > 1700) continue;
            const d = dx * dx + dy * dy;
            if (d < best) { best = d; bt = p; }
          }
          e.tgt = bt;
          // 誰も近くにいない敵は消える
          if (!bt && e.ty !== 4) { e.dead = true; e.gone = true; continue; }
        }
        if (!e.tgt) continue;
        if (e.stunT > 0) { e.stunT -= dt; continue; }
        if (e.ty === 7) {
          // ゴールドスライム：プレイヤーから逃げ回り、しばらくすると消える
          e.life -= dt;
          if (e.life <= 0) { e.dead = true; e.gone = true; continue; }
          const fx = e.x - e.tgt.x, fy = e.y - e.tgt.y, fd = Math.hypot(fx, fy) || 1;
          if (fd < 600) { e.x += fx / fd * e.spd * dt; e.y += fy / fd * e.spd * dt; }
          e.x = clamp(e.x, EDGE + 20, WORLD.w - EDGE - 20); e.y = clamp(e.y, EDGE + 20, WORLD.h - EDGE - 20);
          resolve(this.map, e, e.r * 0.6);
          continue;
        }
        const dx = e.tgt.x - e.x, dy = e.tgt.y - e.y, d = Math.hypot(dx, dy) || 1;
        // ボスと大きな強敵は、予告のあとに地面をたたきつける範囲攻撃
        if (e.ty === 4 || (e.el && (e.ty === 3 || e.ty === 8))) {
          e.slamT -= dt;
          if (e.slamT <= 0 && d < 420 && e.tgt.lv >= 10) { // 低レベルの人には使わない
            const boss = e.ty === 4;
            e.slamT = boss ? 4.5 : 6;
            const r = boss ? 300 : 210, delay = boss ? 1.0 : 0.9;
            this.slams.push({ x: e.tgt.x, y: e.tgt.y, r, at: this.time + delay, dmg: e.dmg * (boss ? 3 : 2.2), lvd: e.lvd });
            this.ev({ e: 'tg', x: r1(e.tgt.x), y: r1(e.tgt.y), r, d: delay });
          }
        }
        let sp = e.spd;
        if (e.slowT > 0) { e.slowT -= dt; sp *= 0.45; }
        e.x += dx / d * sp * dt;
        e.y += dy / d * sp * dt;
        if (e.ty !== 4) resolve(this.map, e, e.r * 0.6);
      }
    }

    buildGrid() {
      for (const i of this.usedCells) this.cells[i].length = 0;
      this.usedCells.length = 0;
      for (const e of this.enemies) {
        if (e.dead) continue;
        const cx = clamp((e.x / GRID) | 0, 0, GW - 1), cy = clamp((e.y / GRID) | 0, 0, GH - 1);
        const i = cy * GW + cx;
        if (!this.cells[i].length) this.usedCells.push(i);
        this.cells[i].push(e);
      }
    }

    near(x, y, fn) {
      const cx = clamp((x / GRID) | 0, 0, GW - 1), cy = clamp((y / GRID) | 0, 0, GH - 1);
      for (let yy = Math.max(0, cy - 1); yy <= Math.min(GH - 1, cy + 1); yy++) {
        for (let xx = Math.max(0, cx - 1); xx <= Math.min(GW - 1, cx + 1); xx++) {
          const c = this.cells[yy * GW + xx];
          for (let k = 0; k < c.length; k++) if (fn(c[k]) === false) return;
        }
      }
    }

    // 半径 r 内の敵を全部（グリッドを使って高速に）
    enemiesIn(x, y, r, fn) {
      const c0 = clamp(((x - r) / GRID) | 0, 0, GW - 1), c1 = clamp(((x + r) / GRID) | 0, 0, GW - 1);
      const r0 = clamp(((y - r) / GRID) | 0, 0, GH - 1), r1_ = clamp(((y + r) / GRID) | 0, 0, GH - 1);
      for (let yy = r0; yy <= r1_; yy++) {
        for (let xx = c0; xx <= c1; xx++) {
          const c = this.cells[yy * GW + xx];
          for (let k = 0; k < c.length; k++) {
            const e = c[k];
            if (e.dead) continue;
            const rr = r + e.r;
            if ((e.x - x) * (e.x - x) + (e.y - y) * (e.y - y) < rr * rr) fn(e);
          }
        }
      }
    }
    enemiesInAll(x, y, r, fn) { this.enemiesIn(x, y, r, fn); }

    separateEnemies() {
      for (const i of this.usedCells) {
        const c = this.cells[i];
        for (let a = 0; a < c.length; a++) {
          for (let b = a + 1; b < c.length; b++) {
            const e1 = c[a], e2 = c[b];
            const dx = e2.x - e1.x, dy = e2.y - e1.y;
            const min = (e1.r + e2.r) * 0.8;
            const d2 = dx * dx + dy * dy;
            if (d2 < min * min && d2 > 0.01) {
              const d = Math.sqrt(d2), push = (min - d) * 0.25;
              const w1 = e1.ty === 4 ? 0.1 : 1, w2 = e2.ty === 4 ? 0.1 : 1;
              e1.x -= dx / d * push * w1; e1.y -= dy / d * push * w1;
              e2.x += dx / d * push * w2; e2.y += dy / d * push * w2;
            }
          }
        }
      }
    }

    nearestEnemy(x, y, range) {
      let best = range * range, bt = null;
      this.enemiesIn(x, y, range, e => {
        const d = (e.x - x) ** 2 + (e.y - y) ** 2;
        if (d < best) { best = d; bt = e; }
      });
      return bt;
    }

    // ---------- 戦闘 ----------
    hurtPlayer(p, dmg) {
      if (p.shield > 0) {
        const a = Math.min(p.shield, dmg);
        p.shield -= a; dmg -= a;
        if (p.shield <= 0) { p.shield = 0; p.shieldT = 0; }
      }
      p.hp -= dmg;
    }

    lvMul(p) { return (1 + 0.06 * (p.lv - 1)) * (p.evo ? 3 : 1); } // 進化すると攻撃・体当たり3倍

    // 装備アイテム（体のまわりをくるくる回って、触れた敵にダメージ）
    setItem(p, item) {
      p.item = null;
      if (!item) return;
      const t = item.t | 0, r = item.r | 0;
      if (t >= 0 && t < ITEMS.length && r >= 0 && r < RARITIES.length) p.item = { t, r };
    }
    orbitHits(p) {
      const it = p.item;
      if (!it) return;
      const def = ITEMS[it.t], n = RARITIES[it.r].n;
      const R = this.radius(p) + 46, hitR = 24 + it.r * 2;
      const dmg = def.dmg * RARITIES[it.r].pow * this.lvMul(p);
      const base = this.time * ORBIT_SPEED;
      for (let i = 0; i < n; i++) {
        const a = base + (i / n) * Math.PI * 2;
        const ox = p.x + Math.cos(a) * R, oy = p.y - 20 + Math.sin(a) * R;
        this.enemiesIn(ox, oy, hitR, e => {
          if ((e.oc || 0) > this.time) return;
          e.oc = this.time + 0.35;
          this.damage(e, dmg, p, def.slow || 0);
          if (def.heal) p.hp = Math.min(p.mhp, p.hp + p.mhp * def.heal);
        });
      }
    }

    playerCombat(p, dt) {
      if (!p.alive) return;
      this.orbitHits(p);
      // 接触ダメージ
      if (p.iframe <= 0) {
        // 当たり判定は見た目の大きさに比例（大きくなるほど当たりやすい）
        let hitBy = null;
        const pr = this.radius(p) * 0.85;
        this.enemiesIn(p.x, p.y, pr, e => {
          if (!hitBy && e.stunT <= 0 && e.dmg) hitBy = e;
        });
        if (hitBy) {
          this.hurtPlayer(p, dmgFor(hitBy, p));
          p.iframe = 0.5;
          this.ev({ e: 'hu', p: p.id, x: r1(p.x), y: r1(p.y) });
          if (p.hp <= 0) { this.kill(p, null); return; }
        }
      }
      const def = SPECIES[p.sp];
      // スキル
      p.scd -= dt;
      if (p.scd <= 0) {
        if (this.useSkill(p, def)) p.scd = def.skill.cd * p.skillCd * (p.evo ? 0.6 : 1);
        else p.scd = 0.3;
      }
      // 通常攻撃（モンスターごとに違う）
      p.atkCd -= dt;
      if (p.atkCd > 0) return;
      const a = def.atk;
      const t = this.nearestEnemy(p.x, p.y, 420);
      if (!t) { p.atkCd = 0.1; return; }
      const dmg = a.dmg * p.dmgMul * this.lvMul(p);
      const base = Math.atan2(t.y - p.y, t.x - p.x);
      const n = (a.n || 1) + p.extra;
      for (let i = 0; i < n; i++) {
        let ang;
        if (a.pattern === 'radial') ang = base + (i / n) * Math.PI * 2;
        else ang = base + (i - (n - 1) / 2) * (a.spread || 0.12);
        this.spawnProj(p, p.x, p.y, ang, a.speed, dmg, a.r, a.life, (a.pierce || 0) + p.pierce, p.sp, a.aoe, a.slow);
      }
      p.atkCd = a.cd * p.rateMul;
    }

    // スキル発動。発動したら true
    useSkill(p, def) {
      const id = def.skill.id, evo = p.evo;
      const pw = p.skillPow * this.lvMul(p) * (evo ? 1.3 : 1);
      const area = p.areaMul;
      const fx = p.x, fy = p.y;
      const sk = (r, extra) => this.ev(Object.assign({ e: 'sk', k: id, p: p.id, sp: p.sp, x: r1(fx), y: r1(fy), r }, extra || {}));
      const anyNear = r => !!this.nearestEnemy(fx, fy, r);
      switch (id) {
        case 'tongue': {
          const t = this.nearestEnemy(fx, fy, 430);
          if (!t) return false;
          const ang = Math.atan2(t.y - fy, t.x - fx);
          for (let i = 0; i < (evo ? 3 : 1); i++) this.spawnProj(p, fx, fy, ang + (i - (evo ? 1 : 0)) * 0.2, 950, 32 * pw, 13, evo ? 0.6 : 0.45, 99, 'tongue');
          sk(0);
          return true;
        }
        case 'wind':
          if (!anyNear(500)) return false;
          p.hasteT = evo ? 5 : 3.5;
          sk(0);
          return true;
        case 'heal':
          if (p.hp >= p.mhp * 0.9) return false;
          p.hp = Math.min(p.mhp, p.hp + p.mhp * (evo ? 0.25 : 0.16) * Math.min(2, p.skillPow));
          sk(0);
          return true;
        case 'lucky': {
          const n = evo ? 6 : 4;
          for (let i = 0; i < n; i++) this.dropGem(p.x + rand(-100, 100), p.y + rand(-100, 100), (1 + Math.floor(p.lv / 5)) * Math.min(2, p.skillPow));
          sk(0);
          return true;
        }
        case 'frenzy': {
          if (!anyNear(230)) return false;
          const n = evo ? 16 : 12;
          for (let i = 0; i < n; i++) this.spawnProj(p, fx, fy, (i / n) * Math.PI * 2, 540, 14 * pw, 9, 0.4, 1, 'kodama');
          sk(0);
          return true;
        }
        case 'moon': {
          if (!anyNear(170)) return false;
          const r = (evo ? 220 : 175) * area;
          this.enemiesIn(fx, fy, r, e => {
            this.damage(e, 16 * pw, p);
            if (e.ty !== 4) {
              const dx = e.x - fx, dy = e.y - fy, d = Math.hypot(dx, dy) || 1;
              e.x += dx / d * 110; e.y += dy / d * 110;
            }
          });
          sk(r);
          return true;
        }
        case 'flock': {
          const list = this.nearEnemies(fx, fy, 470);
          if (!list.length) return false;
          list.sort((a, b) => ((a.x - fx) ** 2 + (a.y - fy) ** 2) - ((b.x - fx) ** 2 + (b.y - fy) ** 2));
          list.slice(0, evo ? 9 : 6).forEach(e => this.spawnProj(p, fx, fy, Math.atan2(e.y - fy, e.x - fx), 780, 15 * pw, 8, 0.8, 0, 'kuroro'));
          sk(0);
          return true;
        }
        case 'venom': {
          if (!anyNear(190)) return false;
          const r = (evo ? 250 : 195) * area;
          this.enemiesIn(fx, fy, r, e => this.damage(e, 24 * pw, p, 3));
          sk(r);
          return true;
        }
        case 'shell':
          if (p.shield > 0) return false;
          p.shield = ((evo ? 60 : 35) + p.lv * 3) * Math.min(2.5, p.skillPow);
          p.shieldT = 6;
          sk(0);
          return true;
        case 'nova': {
          if (!anyNear(190)) return false;
          const r = (evo ? 260 : 195) * area;
          this.enemiesIn(fx, fy, r, e => this.damage(e, 28 * pw, p));
          sk(r);
          return true;
        }
        case 'drone': {
          if (!anyNear(350)) return false;
          const n = evo ? 18 : 12;
          for (let i = 0; i < n; i++) this.spawnProj(p, fx, fy, (i / n) * Math.PI * 2, 580, 11 * pw, 8, 0.9, 1, 'nejimaru');
          sk(0);
          return true;
        }
        case 'roar': {
          if (!anyNear(260)) return false;
          const r = (evo ? 330 : 265) * area;
          this.enemiesIn(fx, fy, r, e => { this.damage(e, 24 * pw, p); if (e.ty !== 4) e.stunT = evo ? 2.2 : 1.5; });
          sk(r);
          return true;
        }
        case 'bless': {
          if (p.hp >= p.mhp * 0.95 && !anyNear(200)) return false;
          p.hp = Math.min(p.mhp, p.hp + p.mhp * (evo ? 0.3 : 0.2));
          const r = 240 * area;
          this.enemiesIn(fx, fy, r, e => this.damage(e, 14 * pw, p));
          sk(r);
          return true;
        }
      }
      return false;
    }

    spawnProj(owner, x, y, ang, speed, dmg, r, life, pierce, kind, aoe, slow) {
      const vx = Math.cos(ang) * speed, vy = Math.sin(ang) * speed;
      const pr = { id: this.uid(), o: owner, x, y, vx, vy, dmg, r, life, pierce, k: kind, aoe: aoe || 0, slow: slow || 0, hit: null };
      this.projs.push(pr);
      this.ev({ e: 'sh', id: pr.id, x: r1(x), y: r1(y), vx: r1(vx), vy: r1(vy), l: life, k: kind, o: owner.id });
    }

    damage(e, dmg, owner, slow) {
      if (e.dead) return;
      e.hp -= dmg;
      if (slow) e.slowT = slow;
      if (this.hitEv < 160) { this.hitEv++; this.ev({ e: 'h', i: e.id, d: Math.round(dmg), x: r1(e.x), y: r1(e.y - e.r), o: owner ? owner.id : 0 }); }
      if (e.hp <= 0) {
        e.dead = true;
        if (owner) owner.kills++;
        this.ev({ e: 'ed', i: e.id, ty: e.ty, el: e.el, x: r1(e.x), y: r1(e.y), by: owner ? owner.id : 0 });
        if (e.el && e.ty !== 4) for (let i = 0; i < 5; i++) this.dropGem(e.x + rand(-50, 50), e.y + rand(-50, 50), e.xp / 5);
        if (e.ty === 4) {
          if (owner) owner.bossKills++;
          for (let i = 0; i < 24; i++) this.dropGem(e.x + rand(-90, 90), e.y + rand(-90, 90), 4 + Math.floor(e.xp));
        } else if (e.ty === 7) {
          for (let i = 0; i < 10; i++) this.dropGem(e.x + rand(-60, 60), e.y + rand(-60, 60), e.xp / 8);
        } else if (!e.el) this.dropGem(e.x, e.y, e.xp);
      }
    }

    updateProjs(dt) {
      const keep = [];
      for (const pr of this.projs) {
        pr.x += pr.vx * dt; pr.y += pr.vy * dt;
        pr.life -= dt;
        if (pr.life <= 0) continue;
        let gone = false;
        this.near(pr.x, pr.y, e => {
          if (e.dead || (pr.hit && pr.hit.has(e.id))) return;
          const rr = e.r + pr.r;
          if ((e.x - pr.x) ** 2 + (e.y - pr.y) ** 2 >= rr * rr) return;
          if (pr.aoe) {
            this.ev({ e: 'bm', x: r1(pr.x), y: r1(pr.y), r: pr.aoe });
            this.enemiesIn(pr.x, pr.y, pr.aoe, e2 => this.damage(e2, pr.dmg, pr.o, pr.slow));
            gone = true; return false;
          }
          this.damage(e, pr.dmg, pr.o, pr.slow);
          pr.pierce--;
          if (pr.pierce < 0) { gone = true; return false; }
          (pr.hit || (pr.hit = new Set())).add(e.id);
        });
        if (gone) { this.ev({ e: 'pd', id: pr.id, x: r1(pr.x), y: r1(pr.y) }); continue; }
        keep.push(pr);
      }
      this.projs = keep;
    }

    cleanupEnemies() {
      if (this.enemies.some(e => e.dead)) this.enemies = this.enemies.filter(e => !e.dead);
    }

    // ---------- 経験値ジェム ----------
    dropGem(x, y, v) {
      v = Math.max(1, Math.round(v * 10) / 10);
      // 多すぎるときは一番古い玉を消して、倒した場所には必ず落とす（遠くの玉にまとめると落ちないように見える）
      if (this.gems.length >= GEM_CAP) {
        for (const o of this.gems.splice(0, this.gems.length - GEM_CAP + 1)) this.ev({ e: 'gc', id: o.id, p: 0, x: r1(o.x), y: r1(o.y) });
      }
      const g = { id: this.uid(), x: clamp(x, EDGE, WORLD.w - EDGE), y: clamp(y, EDGE, WORLD.h - EDGE), v, pull: null, age: 0 };
      this.gems.push(g);
      this.ev({ e: 'gs', id: g.id, x: r1(g.x), y: r1(g.y), v });
    }

    updateGems(dt) {
      const keep = [];
      for (const g of this.gems) {
        g.age += dt;
        if (!g.pull || !g.pull.alive) {
          g.pull = null;
          for (const p of this.players) {
            if (!p.alive) continue;
            const dx = p.x - g.x, dy = p.y - g.y;
            const mg = p.magnet + this.radius(p); // 体が大きいほど吸い寄せる範囲も広い
            if (Math.abs(dx) > mg || Math.abs(dy) > mg) continue;
            if (dx * dx + dy * dy < mg * mg) { g.pull = p; break; }
          }
        }
        if (g.pull) {
          const p = g.pull, dx = p.x - g.x, dy = p.y - g.y, d = Math.hypot(dx, dy) || 1;
          if (d < Math.max(28, this.radius(p) * 0.8)) {
            this.addXp(p, g.v);
            this.ev({ e: 'gc', id: g.id, p: p.id, x: r1(g.x), y: r1(g.y) });
            continue;
          }
          const s = Math.min(d, 600 * dt);
          g.x += dx / d * s; g.y += dy / d * s;
        } else if (g.age > 60) {
          this.ev({ e: 'gc', id: g.id, p: 0, x: r1(g.x), y: r1(g.y) }); // 古いジェムは消える
          continue;
        }
        keep.push(g);
      }
      this.gems = keep;
    }

    updateChoices(dt) {
      for (const p of this.players) {
        const c = p.choices[0];
        if (!c) continue;
        p.chT += dt;
        if (p.bot && p.chT > 0.6) {
          // Botはカードを適当に選ぶ（強い選び方はしない）
          this.choose(p.id, c.s, randInt(0, c.o.length - 1));
        } else if (p.chT > 15) {
          this.choose(p.id, c.s, randInt(0, c.o.length - 1));
        }
      }
    }

    // ---------- 送信用スナップショット ----------
    playerFull(p) {
      return {
        id: p.id, n: p.name, b: p.bot ? 1 : 0, x: r1(p.x), y: r1(p.y), sp: p.sp, ev: p.evo,
        hp: Math.ceil(Math.max(0, p.hp)), mhp: Math.round(p.mhp), lv: p.lv, a: p.alive ? 1 : 0,
        sc: p.score, cl: p.color, au: auraTier(p.lv), spd: Math.round(p.espd || p.spd), ps: p.poisonT > 0 ? 1 : 0,
        sh: p.shield > 0 ? 1 : 0, hs: p.hasteT > 0 ? 1 : 0, pr: isProtected(p) ? 1 : 0,
        bt: p.tpT > 0 ? 1 : 0, tp: p.tp, iv: p.iframe > 0 ? 1 : 0, bn: this.bounty === p ? 1 : 0,
        it: p.item ? p.item.t * 8 + p.item.r : -1,
      };
    }

    snapshot() {
      const base = {
        t: Math.round(this.time * 1000) / 1000,
        on: this.players.filter(p => p.human).length,
        n: this.players.length,
        P: this.players.map(p => this.playerFull(p)),
        E: [],
        ev: this.events,
      };
      for (const en of this.enemies) base.E.push(en.id, en.ty + (en.el ? 16 : 0), r1(en.x), r1(en.y)); // 強敵は種類+16
      if (this.tick % 40 < 2) base.G = this.gems;
      // ランキング（スコア順・Botも含めた順位）
      base.LB = this.players.filter(p => p.alive).sort((a, b) => b.score - a.score);
      this.events = [];
      this.hitEv = 0;
      return base;
    }

    // あるプレイヤー向けに、まわりの情報だけに絞る
    snapshotFor(base, id) {
      const me = this.pmap.get(id);
      if (!me) return null;
      const vx = me.x, vy = me.y, R = VIEW_R;
      const inR = (x, y, r) => Math.abs(x - vx) < r && Math.abs(y - vy) < r;
      // プレイヤーと出来事は毎回、敵とレーダーは2回に1回、ランキングは10回に1回（通信量を減らす）
      const half = this.tick % 2 === 0;
      const s = { t: base.t, on: base.on, n: base.n, p: [], ev: [] };
      if (half) { s.q = []; s.e = []; }
      for (const p of base.P) {
        if (p.id === id || inR(p.x, p.y, R + 200)) s.p.push(p);
        else if (half && p.a && (inR(p.x, p.y, RADAR_R) || p.bn)) s.q.push([p.id, p.x, p.y, p.lv + (p.ev ? 10 : 0), p.bn ? 1 : 0]); // 賞金首はどこにいても映る
      }
      if (half) {
        s.f = []; // レーダー用：遠くのボスとゴールドスライム
        for (let i = 0; i < base.E.length; i += 4) {
          const ty = base.E[i + 1], x = base.E[i + 2], y = base.E[i + 3], bt = ty & 15;
          if (inR(x, y, R)) s.e.push(base.E[i], ty, x, y);
          else if ((bt === 4 || bt === 7) && inR(x, y, RADAR_R)) s.f.push(bt, Math.round(x), Math.round(y));
        }
      }
      for (const ev of base.ev) {
        if (ev.p === id || ev.a === id || ev.b === id || ev.by === id) { s.ev.push(ev); continue; }
        if (ev.e === 'gone' || ev.g) { s.ev.push(ev); continue; } // 全員に知らせる出来事
        if (ev.x === undefined) continue;
        if (ev.e === 'h') { if (ev.o === id) s.ev.push(ev); continue; } // ダメージ数字は自分の攻撃だけ
        if (inR(ev.x, ev.y, ev.e === 'sh' ? 800 : R)) s.ev.push(ev);
      }
      if (base.G) {
        s.g = [];
        for (const g of base.G) if (inR(g.x, g.y, R)) s.g.push(g.id, r1(g.x), r1(g.y), g.v);
      }
      // 自分だけの情報
      s.me = {
        xp: Math.floor(me.xp), xpn: me.xpn, tx: Math.floor(me.txp), k: me.kills, pk: me.pkills, ch: me.choices[0] || null,
        cht: me.choices[0] ? Math.max(0, Math.ceil(15 - me.chT)) : 0,
        scd: Math.round(clamp(me.scd / (SPECIES[me.sp].skill.cd * me.skillCd * (me.evo ? 0.6 : 1)), 0, 1) * 100) / 100,
        by: me.killedBy, dt: me.alive ? 0 : Math.round(me.deadT),
        hy: me.hyT ? Math.ceil(me.hyT) : 0, pt: Math.max(0, Math.ceil(this.paradeT)),
        st: { dmg: me.dmgMul, rate: me.rateMul, extra: me.extra, pierce: me.pierce, sp: me.skillPow, tl: me.traitLv, bump: Math.round(this.bumpPower(me)) },
      };
      if (this.tick % 10 === 0) {
        const rank = base.LB.indexOf(me);
        // 人は全員ぶん、Botは1位と最下位だけ載せる（順位はBotも含めた本当の順位）
        const L = base.LB, out = [];
        for (let i = 0; i < L.length && out.length < 12; i++) {
          const p = L[i];
          if (p.human || i === 0 || i === L.length - 1) out.push([p.id, p.name, p.score, p.lv, p.bot ? 1 : 0, i + 1]);
        }
        const last = L[L.length - 1];
        if (last && last.bot && !out.some(r => r[0] === last.id)) out.push([last.id, last.name, last.score, last.lv, 1, L.length]);
        s.lb = out;
        s.rk = rank >= 0 ? rank + 1 : 0;
      }
      return s;
    }
  }

  // 装備アイテム（ガチャで手に入る）。t=種類, r=レアリティ
  const ITEMS = [
    { key: 'sword', name: '小剣', dmg: 11, desc: '鋭い刃で切り裂く' },
    { key: 'magatama', name: '勾玉', dmg: 7, heal: 0.004, desc: '当てるたびにHPが少し回復' },
    { key: 'redfire', name: '赤ファイア', dmg: 14, desc: '燃えさかる炎で大ダメージ' },
    { key: 'bluefire', name: '青ファイア', dmg: 8, slow: 1.2, desc: '冷たい炎で敵を遅くする' },
  ];
  // n=まわりに出る数, pow=威力
  const RARITIES = [
    { name: 'コモン', color: 0xd0d0d0, css: '#d0d0d0', n: 8, pow: 0.55, rate: 50 },
    { name: 'アンコモン', color: 0x5ad06a, css: '#5ad06a', n: 8, pow: 0.75, rate: 28 },
    { name: 'レア', color: 0x4aa0ff, css: '#4aa0ff', n: 8, pow: 1.0, rate: 15 },
    { name: 'エピック', color: 0xb060ff, css: '#c080ff', n: 8, pow: 1.35, rate: 6 },
    { name: 'レジェンド', color: 0xffc030, css: '#ffc840', n: 8, pow: 1.8, rate: 1 },
  ];
  const ORBIT_SPEED = 3.2; // 回る速さ（ラジアン/秒）

  // セーブする項目（レベル・経験値・強化の状態など）
  const SAVE_KEYS = ['lv', 'xp', 'txp', 'evo', 'hp', 'mhp', 'kills', 'score', 'bossKills', 'pkills', 'pkScore', 'spd',
    'dmgMul', 'rateMul', 'extra', 'pierce', 'skillPow', 'skillCd', 'areaMul', 'magnet', 'regen', 'bumpMul', 'traitLv', 'revived'];

  // モンスターの解放：累計で獲得した経験値で順に解放（強いモンスターほど後ろ）
  const UNLOCKS = [
    ['gekomaru', 0], ['maimai', 0], ['suzune', 0],
    ['kodama', 500], ['kohaku', 1200], ['rangyo', 2000], ['uroko', 3000], ['kuroro', 4500],
    ['nejimaru', 6500], ['hakua', 9000], ['komori', 12000], ['toosibi', 16000], ['sinonome', 22000],
  ];
  const UNLOCK_AT = {}; UNLOCKS.forEach(([k, v]) => { UNLOCK_AT[k] = v; });

  global.GD = {
    UNLOCKS, UNLOCK_AT, ITEMS, RARITIES, ORBIT_SPEED,
    WORLD, TICK, EDGE, VIEW_R, RADAR_R, MAX_PLAYERS, EVOLVE_LV, PROTECT_TIME, NEWBIE_LV, generateMap, resolve, auraTier,
    SPECIES, SPECIES_KEYS, ENEMY_TYPES, ENEMIES, UPGRADES, COLORS, upgradeText,
    xpNeed, clamp,
  };
  global.GameSim = GameSim;
})(typeof window !== 'undefined' ? window : globalThis);
