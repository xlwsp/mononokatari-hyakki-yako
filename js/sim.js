// モノノカタリ -百鬼夜行- ゲームロジック（ずっと続くオンライン世界）
// サーバー（macOS の jsc）で実行され、各プレイヤーにはまわりの様子だけを送る。
// プレイヤーはモンスター。敵を倒してレベルを上げ、固有の能力を伸ばし、Lv10で進化する。
(function (global) {
  'use strict';

  const WORLD = { w: 10000, h: 10000 };
  const TICK = 0.05;           // 20Hz
  const MAX_PLAYERS = 50;      // 1つの世界に入れる人数（Bot含む）
  const BOT_TARGET = 24;       // 人が少ないときはBotでこの人数まで埋める
  const ENEMY_PER_PLAYER = 95; // プレイヤー1人あたりの敵の上限（密度）
  const ENEMY_CAP = 3800;
  const FIELD_BOSS_CAP = 70;   // フィールドボス（各段階のボス）は世界にこの数まで
  const GEM_CAP = 5000;
  const SWARM_EVERY = 28;      // 敵の群れが押し寄せる間隔（プレイヤーごと）
  const BOSS_EVERY = 100;      // どこかにボスが出る間隔
  const VIEW_R = 1250;         // 細かい情報を送る範囲
  const RADAR_R = 4500;        // レーダー用にざっくり送る範囲
  const EVOLVE_LV = 30;        // このレベルで進化（進化するとものすごく強くなる）
  const PROTECT_TIME = 10;     // 出撃直後は体当たりされない
  const NEWBIE_LV = 1;         // （レベルによる保護はなし）
  const PVP_SHOT = 0.06;       // 通常攻撃が人に当たったとき：1秒あたり相手の最大HPの約6%（連射カードで増える）
  const BUMP_CD = 0.55;        // 同じ相手への体当たりの間隔（秒）
  const ELITE_LV = 12;         // このレベルから「強敵」が混ざる
  const PARADE_EVERY = 240;    // 百鬼夜行（高レベルの人のもとへ強敵の大群が押し寄せる）の間隔
  const PARADE_LV = 20;        // 百鬼夜行に巻き込まれるレベル
  const PARADE_TIME = 45;      // 百鬼夜行を生き延びる時間
  const BOUNTY_LV = 15;        // 賞金首になるレベル
  // 妖気の渦：Lv300以上の人の近くにときどき現れる。中にいると経験値が多くもらえて、敵がたくさんわく
  const RIFT_LV = 300, RIFT_R = 340, RIFT_TIME = 45;
  const riftMul = lv => Math.min(2.5, 1.5 + (lv - RIFT_LV) / 700); // Lv300で1.5倍 → Lv1000で2.5倍
  // ダッシュ：スタミナ満タンで3秒走れる。使い切ったら満タンに戻るまで（10秒）使えない。途中でやめた分はそのまま使える
  const DASH_TIME = 3, DASH_RECHARGE = 10, DASH_MUL = 1.7;
  const BIG_LVS = [1000]; // 大妖のレベル（Lv1000で固定）
  // ヌシ：マップの4か所にいる大きなボス（大妖と同じく突進・たたきつけ・呼び寄せ）。
  // レベルは「出てきたときの、いちばん高いプレイヤーのレベル × 1.3」
  const NUSHI_HOMES = [[28, 0.22, 0.22], [29, 0.78, 0.22], [29, 0.22, 0.78], [28, 0.78, 0.78]]; // [種類, 横, 縦]（マップに対する割合）
  const NUSHI_FIRST = 45, NUSHI_RESPAWN = 120, NUSHI_LEASH = 900, NUSHI_HP = 1300000, NUSHI_GEMS = 160;
  const NUSHI_NAME = { 28: '鬼のヌシ', 29: '化け狸のヌシ' };
  const BIG_LV = 200;          // 強さの基準になるレベル（HP・ごほうびはこのレベルを1倍として増減）
  const BIG_FIRST = 90;        // 世界ができてから大妖が現れるまで（秒）
  const BIG_RESPAWN = 180;     // 倒されてから次の大妖が現れるまで（秒）＝3分
  const BIG_HP_1000 = 3e8;     // Lv1000の大妖のHP（高レベルの人がみんなで削る）
  const BIG_HP = 600000;       // 大妖のHP（みんなで削る）
  const BIG_GEMS = 520;        // 倒すと中央に輪の形で並ぶ経験値の玉の数

  // プレイヤーが選べるモンスター（性能はだいたい同じ強さ。得意なことが違う）
  // atk: 自動で撃つ通常攻撃 / skill: 自動で発動するスキル / trait: プレイヤー同士のバトルで効く特性
  const SPECIES = {
    gekomaru: {
      name: 'ゲコまる', evoName: 'ガマベルガ', color: 0x9ccf5a, hp: 130, spd: 200, role: 'バランス型',
      atk: { pattern: 'single', dmg: 11, cd: 0.7, speed: 500, life: 0.9, r: 8 },
      skill: { id: 'tongue', name: 'ベロ伸ばし', cd: 4, desc: '長いベロで一直線に貫く', area: false },
      trait: { id: 'gulp', name: '丸のみ', desc: '体当たりで与えたダメージの一部を回復' },
    },
    suzune: {
      name: 'スズネ', evoName: 'スズリオン', color: 0xc89a6a, hp: 95, spd: 245, role: 'スピード型',
      atk: { pattern: 'single', dmg: 5, cd: 0.3, speed: 680, life: 0.7, r: 6 },
      skill: { id: 'wind', name: '追い風', cd: 8, desc: 'しばらく足がとても速くなる', area: false },
      trait: { id: 'alarm', name: '身代わりの鈴', desc: 'HPが減ると鈴が鳴り、猛ダッシュで逃げる' },
    },
    maimai: {
      name: 'マイマイ', evoName: 'モクリュウ', color: 0xc8d27a, hp: 165, spd: 175, role: 'タフ型',
      atk: { pattern: 'single', dmg: 17, cd: 1.1, speed: 320, life: 1.3, r: 10 },
      skill: { id: 'heal', name: 'ぬめぬめ回復', cd: 7, minCd: 5, desc: 'HPを回復', area: false },
      trait: { id: 'underdog', name: '根性', desc: '格上が相手だと体当たりが強くなる' },
    },
    rangyo: {
      name: 'ランギョ', evoName: 'リュウラン', color: 0xff8a4a, hp: 135, spd: 215, role: '成長型',
      atk: { pattern: 'spread', n: 3, spread: 0.25, dmg: 8, cd: 0.75, speed: 480, life: 0.85, r: 8 },
      skill: { id: 'lucky', name: '招き金魚', cd: 10, desc: '経験値をばらまく（いつでも経験値+15%）', area: false },
      trait: { id: 'luck', name: '強運', desc: 'よく会心の一撃（2倍ダメージ）' },
    },
    kodama: {
      name: 'コダマ', evoName: 'ネコマタ', color: 0xff6a5a, hp: 110, spd: 225, role: '近接型',
      atk: { pattern: 'spread', n: 3, spread: 0.35, dmg: 10, cd: 0.6, speed: 540, life: 0.38, r: 8 },
      skill: { id: 'frenzy', name: 'ひっかき乱舞', cd: 6, desc: '全方位をひっかく', area: false },
      trait: { id: 'first', name: '先制', desc: '久しぶりの体当たりは2倍ダメージ' },
    },
    kohaku: {
      name: 'コハク', evoName: 'シラヌイ', color: 0xffa07a, hp: 105, spd: 235, role: '撹乱型',
      atk: { pattern: 'single', dmg: 12, cd: 0.6, speed: 640, life: 0.8, r: 8 },
      skill: { id: 'moon', name: '月跳び', cd: 7, desc: 'まわりの敵をはじき飛ばす', area: true },
      trait: { id: 'hop', name: 'すりぬけ', desc: 'ときどき体当たりをひらりとよける' },
    },
    kuroro: {
      name: 'クロロ', evoName: 'ヤタガラス', color: 0x6a6a86, hp: 100, spd: 220, role: '狙撃型',
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
      name: 'コモリ', evoName: 'モリガルド', color: 0x7aaa5a, hp: 185, spd: 165, role: '守り型',
      atk: { pattern: 'single', dmg: 19, cd: 1.2, speed: 360, life: 1.2, r: 11 },
      skill: { id: 'shell', name: '甲羅バリア', cd: 9, minCd: 7, desc: 'ダメージを防ぐバリア', area: false },
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
      name: 'ハクア', evoName: 'ハクオウガ', color: 0xe8f0ff, hp: 130, spd: 215, role: '威圧型',
      atk: { pattern: 'spread', n: 3, spread: 0.2, dmg: 10, cd: 0.85, speed: 620, life: 0.9, r: 8, pierce: 1 },
      skill: { id: 'roar', name: '白狼の咆哮', cd: 8, desc: 'まわりの敵を気絶させる', area: true },
      trait: { id: 'awe', name: '威圧', desc: '体当たりした相手をしばらく遅くする' },
    },
    sinonome: {
      name: 'シノノメ', evoName: 'カグラジカ', color: 0xf0a050, hp: 120, spd: 210, role: '不死型',
      atk: { pattern: 'radial', n: 8, dmg: 9, cd: 1.4, speed: 480, life: 0.9, r: 8 },
      skill: { id: 'bless', name: '鈴の祝福', cd: 10, desc: '大きく回復', area: true },
      trait: { id: 'revive', name: 'よみがえりの鈴', desc: 'やられても一度だけ復活することがある' },
    },
  };
  const SPECIES_KEYS = Object.keys(SPECIES);

  // 進化すると覚える2つ目のスキル（自動で発動）
  const EVO_SKILLS = {
    gekomaru: { id: 'e_wave', name: 'ガマの大津波', cd: 9, desc: '全方位にベロを伸ばして貫く' },
    suzune: { id: 'e_gale', name: '鈴鳴り旋風', cd: 8, desc: 'まわりを切り裂き、少し足が速くなる' },
    maimai: { id: 'e_grove', name: '森の恵み', cd: 10, desc: '回復しつつ、まわりの敵を根で止める' },
    rangyo: { id: 'e_gold', name: '黄金の雨', cd: 11, desc: 'まわりに金の雨を降らせて経験値もばらまく' },
    kodama: { id: 'e_rend', name: '百裂ひっかき', cd: 8, desc: 'ひっかき乱舞を2回連続で放つ' },
    kohaku: { id: 'e_illusion', name: '狐火の幻', cd: 12, desc: '2.5秒すがたを消し、まわりの敵をはじく' },
    kuroro: { id: 'e_rain', name: '八咫の矢雨', cd: 9, desc: 'たくさんの敵に貫く矢を降らせる' },
    uroko: { id: 'e_coil', name: '大蛇の締めつけ', cd: 10, desc: 'まわりの敵を締めつけて動けなくする' },
    komori: { id: 'e_ward', name: '森の結界', cd: 12, desc: 'まわりの敵をはじき飛ばし、小さなバリアを張る' },
    toosibi: { id: 'e_chain', name: '業火連爆', cd: 9, desc: 'まわりで3回つづけて大爆発' },
    nejimaru: { id: 'e_turret', name: 'からくり砲台', cd: 8, desc: '全方位にパーツを2重に撃つ' },
    hakua: { id: 'e_howl', name: '白狼の遠吠え', cd: 11, desc: '広い範囲の敵を気絶させる' },
    sinonome: { id: 'e_kagura', name: '神楽の舞', cd: 14, desc: '大きく回復し、2秒間ダメージを受けない' },
  };
  // スキルのダメージの基準（画面の「スキル威力」の表示用。回復などは割合で表示）
  const SKILL_BASE = { tongue: 32, frenzy: 14, moon: 16, flock: 15, venom: 24, nova: 28, drone: 11, roar: 24, bless: 14 };
  const SKILL_PCT = { heal: ['回復', 0.11, 0.15], shell: ['バリア', 0.14, 0.2], wind: ['加速', 0.45, 0.45], lucky: ['経験値', 0, 0] };

  // 使い捨ての道具（ロビーの道具屋で買う。1回のプレイで1つにつき1回だけ使える）
  const CONSUMABLES = [
    { id: 'heal', name: '回復薬', icon: '🧪', price: 150, desc: 'HPを50%回復' },
    { id: 'inv', name: '透明化ポーション', icon: '👻', price: 250, desc: '6秒間すがたを消す（敵にも人にも狙われない）' },
    { id: 'warp', name: 'ランダムワープ', icon: '🌀', price: 120, desc: 'マップのどこかへ一瞬で移動' },
    { id: 'stone', name: '石化の札', icon: '🪨', price: 300, desc: 'まわりの敵と人を3秒間 石にする' },
    { id: 'poison', name: '毒ポーション', icon: '☠', price: 250, desc: 'まわりに毒の霧。敵と人をじわじわ削る' },
  ];
  const CONS_SLOTS = 3; // 持っていける種類の数

  // エモート（無料）とピンズ（やりこみで買う）
  const EMOTES = ['👍 いいね！', '😂 わはは', '😡 むかっ', '😭 えーん', '🙏 ありがとう', '⚔ 勝負だ！', '🏃 にげろ！', '🤝 GG'];
  const PINS = [
    { id: 'crown', e: '👑', t: 'ひれふせ！', price: 1500 }, { id: 'fire', e: '🔥', t: 'もえてきた！', price: 1000 },
    { id: 'sleep', e: '💤', t: 'ねむい…', price: 800 }, { id: 'cool', e: '😎', t: 'よゆう', price: 1200 },
    { id: 'dango', e: '🍡', t: 'おだんごタイム', price: 800 }, { id: 'ghost', e: '👻', t: 'うらめしや〜', price: 1500 },
  ];

  // 敵（番号は描画側と共通。4番はボス）
  const ENEMY_TYPES = ['slime', 'bat', 'wisp', 'brute', 'boss', 'shroom', 'beetle', 'gold', 'golem',
    'kedama', 'kasa', 'chochin', 'nezumi', 'hitodama', 'daruma', // 9〜14は弱い雑魚（群れで出る）
    'bigboss', // 15は大妖（世界に1体だけ）
    // 16〜25：新しい妖怪たち。レベルの段階ごとにこの順番で出てくる
    'obake', 'chochin2', 'boss1',   // 第1段階（Lv1〜）：笠おばけ・ちょうちん ／ ボス：化け提灯
    'kitsune', 'tanuki', 'boss2',   // 第2段階（Lv40〜）：狐・狸 ／ ボス：大蛇（Lv60〜）
    'oni', 'mujina', 'boss3',       // 第3段階（Lv110〜）：鬼・妖狸 ／ ボス：獅子（Lv140〜）
    'boss4',                        // 第4段階（Lv200〜）：ボス：白獅子神
    'onimen', 'karakasa',           // 26〜27：第1段階の雑魚を追加（鬼面おばけ・からかさ）
    'nushiOni', 'nushiTanuki'];     // 28〜29：ヌシ（マップの4か所にいる大きなボス）
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
    // 弱い雑魚たち：もろくて数が多い。まとめて倒すと気持ちいい
    kedama:   { hp: 5, spd: 92, dmg: 3, r: 13, xp: 1 },
    kasa:     { hp: 9, spd: 88, dmg: 4, r: 15, xp: 1 },
    chochin:  { hp: 8, spd: 66, dmg: 4, r: 15, xp: 1 },
    nezumi:   { hp: 4, spd: 150, dmg: 3, r: 12, xp: 1 },
    hitodama: { hp: 6, spd: 112, dmg: 4, r: 12, xp: 1 },
    daruma:   { hp: 12, spd: 58, dmg: 5, r: 15, xp: 1 },
    // 大妖：とても大きくて、とてもゆっくり。倒すと経験値の玉が世界の中央にばらまかれる
    bigboss:  { hp: BIG_HP, spd: 22, dmg: 30, r: 150, xp: 0 },
    // 新しい妖怪（高レベルの人向けに硬くて経験値も多い）
    obake:    { hp: 6, spd: 96, dmg: 3, r: 15, xp: 1 },
    chochin2: { hp: 10, spd: 72, dmg: 4, r: 16, xp: 1 },
    boss1:    { hp: 700, spd: 70, dmg: 12, r: 44, xp: 10 },
    kitsune:  { hp: 40, spd: 168, dmg: 6, r: 18, xp: 3 },
    tanuki:   { hp: 70, spd: 84, dmg: 7, r: 20, xp: 3 },
    boss2:    { hp: 1700, spd: 76, dmg: 14, r: 54, xp: 16 },
    oni:      { hp: 260, spd: 88, dmg: 10, r: 26, xp: 8 },
    mujina:   { hp: 200, spd: 124, dmg: 9, r: 24, xp: 7 },
    boss3:    { hp: 3300, spd: 82, dmg: 16, r: 62, xp: 26 },
    boss4:    { hp: 5200, spd: 88, dmg: 18, r: 70, xp: 42 },
    onimen:   { hp: 14, spd: 86, dmg: 5, r: 16, xp: 2 },   // 少し硬い雑魚
    karakasa: { hp: 7, spd: 138, dmg: 4, r: 15, xp: 1 },   // すばしっこい雑魚
    nushiOni:    { hp: NUSHI_HP, spd: 34, dmg: 26, r: 105, xp: 0 }, // HP・攻撃は出てきたときのレベルで決める
    nushiTanuki: { hp: NUSHI_HP, spd: 38, dmg: 24, r: 100, xp: 0 },
  };
  // フィールドボス：段階ごとのボス。解放されるレベルと、たたきつけの大きさ
  const FIELD_BOSSES = [[18, 5, 230], [21, 30, 270], [24, 90, 310], [25, 150, 350]];
  // 段階の解放レベル（雑魚・強敵）
  const TIER2_LV = 15, TIER3_LV = 60;
  // いちばん強い解放ずみの段階ボス
  const bossFor = lv => { let t = 18; for (const f of FIELD_BOSSES) if (lv >= f[1]) t = f[0]; return t; };
  const FB_R = {}; for (const [t, , r] of FIELD_BOSSES) FB_R[t] = r;
  // 群れで出る雑魚
  const PACK = { 16: 1, 17: 1, 26: 1, 27: 1 };

  // 強化カード。{skill} {trait} はモンスターごとのスキル名・特性名に置き換わる
  const UPGRADES = {
    // 強化は「足し算」で積み上がる（枚数に比例して強くなる。何枚でも取れる）
    dmg:      { name: '攻撃力 UP', desc: '攻撃のダメージ +20%', ok: () => true, apply: p => { p.dmgMul += 0.2; } },
    rate:     { name: '連射 UP', desc: '通常攻撃の間隔 -13%', ok: p => p.rateMul > 0.35, apply: p => { p.rateMul *= 0.87; } },
    extra:    { name: '弾数 +1', desc: '通常攻撃の弾が1つ増える', ok: p => p.extra < 4, apply: p => { p.extra++; } },
    pierce:   { name: '貫通弾', desc: '弾が敵を貫通 +1', ok: p => p.pierce < 3, apply: p => { p.pierce++; } },
    skillPow: { name: '{skill} 強化', desc: '{skill}の威力 +45%', ok: () => true, apply: p => { p.skillPow += 0.45; } },
    skillCd:  { name: '{skill} 連発', desc: '{skill}のクールタイム -22%', ok: p => p.skillCd > 0.3, apply: p => { p.skillCd *= 0.78; } },
    area:     { name: '{skill} 拡大', desc: '{skill}の範囲 +30%', ok: p => SPECIES[p.sp].skill.area && p.areaMul < 2.6, apply: p => { p.areaMul *= 1.3; } },
    // HPカードは30枚まで。増え方は「掛け算」ではなく「足し算」（レベルが高いほど少し多く増える）
    hp:       { name: 'タフネス', desc: '最大HPアップ & 全回復（30枚まで）', ok: p => (p.hpCards || 0) < 30, apply: p => { p.hpCards = (p.hpCards || 0) + 1; p.mhp += SPECIES[p.sp].hp * 0.25 * (1 + 0.04 * p.lv) * (p.evo ? 2.5 : 1); p.hp = p.mhp; } },
    // 自然回復：1枚ごとに毎秒・最大HPの0.5%（20枚まで＝毎秒10%）。進化でさらに+0.5%
    regen:    { name: '自然回復', desc: '毎秒 最大HPの0.5%回復（20枚まで）', ok: p => ((p.cards && p.cards.regen) || 0) < 20, apply: () => {} },
    magnet:   { name: 'マグネット', desc: '経験値の吸引範囲 +40%', ok: p => p.magnet < 450, apply: p => { p.magnet *= 1.4; } },
    bump:     { name: '体当たり強化', desc: 'ぶつかったときのダメージ +25%', ok: () => true, apply: p => { p.bumpMul += 0.25; } },
    trait:    { name: '{trait} 覚醒', desc: '【{trait}】の効果 大アップ＋攻撃と体当たり +10%', ok: p => p.traitLv < 5, apply: p => { p.traitLv++; p.dmgMul += 0.1; p.bumpMul += 0.1; } },
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
  const xpNeed0 = lv => Math.floor(3 + lv * 2 + lv * lv * 0.2);
  // Lv300から先は、敵の経験値の増え方に近いゆるやかな伸びにする（高レベルでもレベルが上がるように）
  const xpNeed = lv => (lv <= 300 ? xpNeed0(lv) : Math.floor(xpNeed0(300) * Math.pow((1 + 0.06 * (lv - 1)) / (1 + 0.06 * 299), 1.5)));
  // 敵の攻撃の強さ（レベルが上がるほど痛い）
  // Lv150を超えたらゆるやかな直線に（Lv200〜300の人もちゃんと遊べるように）
  const dmgCurve0 = lv => 1 + (lv - 1) * 0.05 + (lv - 1) * (lv - 1) * 0.0015;
  const dmgCurve = lv => (lv <= 150 ? dmgCurve0(lv) : dmgCurve0(150) + (lv - 150) * 0.22);
  // 高レベル向けに出た敵が低レベルの人に当たったときは、その人のレベル相当まで弱める
  const isNushi = e => e.ty === 28 || e.ty === 29;
  const isBigOne = e => e.ty === 15 || isNushi(e); // 大妖とヌシ（突進などの特別な動き）
  const isBoss = e => e.ty === 4 || isBigOne(e) || FB_R[e.ty] !== undefined; // 押し返し・気絶が効かない
  const isWorldBoss = e => e.ty === 4 || isBigOne(e); // 誰もいなくても消えない
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
      this.big = null;
      this.rifts = [];
      this.nushi = NUSHI_HOMES.map(() => null); this.nushiT = NUSHI_HOMES.map((_, i) => NUSHI_FIRST + i * 8);
      this.bigT = BIG_FIRST;
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
        hp: def.hp, mhp: def.hp, lv: 1, xp: 0, xpn: xpNeed(1), txp: 0, evo: 0, hpCards: 0,
        alive: true, kills: 0, score: 0, bossKills: 0, pkills: 0, pkScore: 0,
        spd: def.spd, espd: def.spd, dmgMul: 1, rateMul: 1, extra: 0, pierce: 0, skillPow: 1, skillCd: 1, areaMul: 1,
        magnet: 150, regen: 0, bumpMul: 1, traitLv: 1, poisonT: 0, poisonDps: 0, pslowT: 0, alarmCd: 0, lastBump: -99, hitCd: {},
        atkCd: 0, scd: rand(1, 3), iframe: 2, choices: [], chSeq: p.chSeq || 0, chT: 0,
        tpT: 0, protT: PROTECT_TIME, revived: false, hyT: 0,
        shield: 0, shieldT: 0, hasteT: 0, deadT: 0, killedBy: null,
        scd2: 3, hurtAcc: 0, invT: 0, stoneT: 0, emo: -1, emoT: 0, emoCd: 0, lifeT: 0, consUsed: [],
        st: { hl: 0, sa: 0, su: 0, dist: 0, dg: 0, sn: 0, rv: 0 }, route: [], marks: [], routeT: 0,
        ai: { t: 0, dx: 0, dy: 0, wx: 0, wy: 0 }, cards: {}, cardsV: (p.cardsV || 0) + 1,
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
      // Botもたまに装備を持っている（弱めのもの）
      this.setItem(p, bot && chance(0.6) ? { st: 1, t: randInt(0, ITEMS.length - 1), r: chance(0.25) ? 1 : 0 } : null);
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
      const o = { sp: p.sp, pc: p.choices.length, evo2: 1, hp2: 1, cards2: 1 };
      for (const k of SAVE_KEYS) o[k] = typeof p[k] === 'number' ? Math.round(p[k] * 1000) / 1000 : p[k];
      return o;
    }
    // カードなしのときの最大HP（レベルアップと進化の分だけ）
    baseHp(p) {
      const h = SPECIES[p.sp].hp, pre = Math.min(p.lv, EVOLVE_LV) - 1, post = Math.max(0, p.lv - EVOLVE_LV);
      const v = h + h * 0.08 * pre;
      return p.evo ? v * 2.5 + h * 0.08 * 2.5 * post : v + h * 0.08 * post;
    }
    loadSave(p, o) {
      if (!o || o.sp !== p.sp) return;
      for (const k of SAVE_KEYS) if (typeof o[k] === typeof p[k]) p[k] = o[k];
      p.lv = clamp(p.lv | 0, 1, 999);
      p.xpn = xpNeed(p.lv);
      // 進化レベルが10→30に変わる前のセーブ：Lv30未満なら進化前に戻す（Lv30で改めて進化）
      if (p.evo && p.lv < EVOLVE_LV) { p.evo = 0; p.mhp /= 1.5; }
      // 強化カードが掛け算だったころのセーブは、取った枚数に換算して足し算に直す
      if (!o.cards2) {
        const conv = (v, f, step) => (v > 1 ? 1 + Math.log(v) / Math.log(f) * step : v);
        p.dmgMul = conv(p.dmgMul, 1.2, 0.2);
        p.bumpMul = conv(p.bumpMul, 1.25, 0.25);
        p.skillPow = conv(p.skillPow, 1.4, 0.45);
      }
      // HPカードが掛け算だったころのセーブは、HPが大きくなりすぎているので上限をかける
      if (!o.hp2) {
        const cap = this.baseHp(p) + SPECIES[p.sp].hp * 0.25 * (1 + 0.04 * p.lv) * (p.evo ? 2.5 : 1) * 10;
        if (p.mhp > cap) { p.mhp = cap; p.hpCards = 10; }
      }
      // Lv30以上で前のルールのまま進化していた人は、新しい進化の強さに合わせる
      if (p.evo && !o.evo2) { if (o.hp2) p.mhp *= 2.5 / 1.5; p.spd *= 1.15; p.regen += 3; }
      // 持っているカードの記録がない古いセーブは、強さから枚数を見積もる
      if (!o.cards || typeof o.cards !== 'object') {
        const sp = SPECIES[p.sp], n = v => Math.max(0, Math.round(v));
        const lg = (v, f) => (v > 0 ? Math.log(v) / Math.log(f) : 0);
        const tl = Math.max(0, p.traitLv - 1), bot = p.bot ? 0.7 : 1;
        p.cards = {
          dmg: n((p.dmgMul - bot - 0.1 * tl) / 0.2), rate: n(lg(p.rateMul, 0.87)), extra: n(p.extra), pierce: n(p.pierce),
          skillPow: n((p.skillPow - 1) / 0.45), skillCd: n(lg(p.skillCd, 0.78)), area: n(lg(p.areaMul, 1.3)), hp: n(p.hpCards || 0),
          regen: n((p.regen - (p.evo ? 3 : 0)) / 1.5), magnet: n(lg(p.magnet / (150 * (p.evo ? 1.3 : 1)), 1.4)),
          bump: n((p.bumpMul - bot - 0.1 * tl) / 0.25), trait: n(tl),
        };
        for (const k in p.cards) if (!p.cards[k]) delete p.cards[k];
        if (!sp.skill.area) delete p.cards.area;
      } else p.cards = Object.assign({}, o.cards);
      p.cardsV = (p.cardsV || 0) + 1;
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
    // 大きさ：Lv20までは1レベル4ずつ、Lv100までは0.8ずつ、その先は0.3ずつ（大きくなりすぎて画面が見えなくならないように）
    static size(lv, evo) { return (40 + 4 * Math.min(lv, 20) + 0.8 * clamp(lv - 20, 0, 80) + 0.3 * Math.max(0, lv - 100)) * (evo ? 1.3 : 1); }
    // 体当たりのダメージ（レベル・進化・攻撃力・体当たり強化で上がる）
    bumpPower(p) { return 24 * this.lvMul(p) * p.bumpMul; }

    setInput(id, x, y, dash) {
      const p = this.pmap.get(id);
      if (!p || p.bot) return;
      if (typeof x !== 'number' || typeof y !== 'number' || !isFinite(x) || !isFinite(y)) return;
      p.tx = x; p.ty = y; p.dashIn = !!dash;
    }

    choose(id, seq, idx) {
      const p = this.pmap.get(id);
      if (!p) return;
      const cur = p.choices[0];
      if (!cur || cur.s !== seq) return;
      const key = cur.o[clamp(idx | 0, 0, cur.o.length - 1)];
      UPGRADES[key].apply(p);
      if (!p.cards) p.cards = {};
      p.cards[key] = (p.cards[key] || 0) + 1; // 持っているカードの枚数
      p.cardsV = (p.cardsV || 0) + 1;
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
      if (p.itXp) v *= p.itXp; // 打ち出の小槌
      v *= this.riftBonus(p); // 妖気の渦の中
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
        // 5レベルごとにガチャポイント。レベルが高いほどたくさん（Lv5:10P, Lv10:20P, Lv30:60P, Lv50:100P…）
        if (p.human && p.lv % 5 === 0) this.ev({ e: 'pt', p: p.id, n: 10 * (p.lv / 5) });
        if (!p.evo && p.lv >= EVOLVE_LV) {
          p.evo = 1;
          if (p.human) this.ev({ e: 'pt', p: p.id, n: 100 }); // 進化ボーナス
          p.mhp *= 2.5; p.hp = p.mhp; // HP2.5倍＆全回復
          p.spd *= 1.15; p.magnet *= 1.3; p.regen += 3; // 足が速く、吸い寄せ範囲も広く、自然回復も
          this.ev({ e: 'evo', p: p.id, sp: p.sp, x: r1(p.x), y: r1(p.y) });
          this.mark(p, 'evo');
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
        // ダッシュとスタミナ
        if (p.sta === undefined) { p.sta = DASH_TIME; p.staLock = false; }
        p.dashing = !!(p.dashIn && !p.staLock && p.sta > 0 && p.tpT <= 0);
        if (p.dashing) {
          p.sta -= dt;
          if (p.sta <= 0) { p.sta = 0; p.staLock = true; p.dashing = false; }
        } else {
          p.sta = Math.min(DASH_TIME, p.sta + dt * DASH_TIME / DASH_RECHARGE);
          if (p.staLock && p.sta >= DASH_TIME) p.staLock = false;
        }
        if (p.shieldT > 0) { p.shieldT -= dt; if (p.shieldT <= 0) p.shield = 0; }
        if (p.protT > 0) p.protT -= dt;
        if (p.invT > 0) p.invT -= dt;
        if (p.stoneT > 0) p.stoneT -= dt;
        if (p.emoT > 0) p.emoT -= dt;
        if (p.emoCd > 0) p.emoCd -= dt;
        p.hurtAcc = (p.hurtAcc || 0) * Math.max(0, 1 - dt / 2); // 2秒くらいで忘れる
        p.lifeT = (p.lifeT || 0) + dt;
        // 通った道（終わったあとに地図で見られる）
        if (p.human) {
          p.routeT = (p.routeT || 0) - dt;
          if (p.routeT <= 0) {
            p.routeT = 1.5;
            p.route.push(Math.round(p.x), Math.round(p.y));
            if (p.route.length > 1600) p.route = p.route.filter((v, i) => (i >> 1) % 2 === 0); // 長くなったら間引く
          }
        }
        const rg = 0.005 * Math.min(20, (p.cards && p.cards.regen) || 0) + (p.evo ? 0.005 : 0);
        if (p.woundT > 0) p.woundT -= dt; // 妖気の傷：自然回復しない
        else if (rg > 0) this.healP(p, p.mhp * rg * dt);
      }

      for (const p of this.players) this.movePlayer(p, dt);
      this.updateBumps(dt);
      this.spawnEnemies(dt);
      this.updateParade(dt);
      this.updateBounty(dt);
      this.updateBig(dt);
      this.updateRifts(dt);
      this.updateNushi(dt);
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
      const ox = p.x, oy = p.y;
      if (p.tpT > 0 || p.stoneT > 0) {
        // はじき飛ばされた直後・石になっている間は止まる
        if (p.stoneT > 0 && p.human) { p.tx = p.x; p.ty = p.y; }
      } else if (p.bot) {
        this.botThink(p, dt);
      } else if (p.tx !== null) {
        const dx = p.tx - p.x, dy = p.ty - p.y, d = Math.hypot(dx, dy);
        const max = p.espd * (p.dashing || p.staLock && p.sta < 0.3 ? DASH_MUL : 1) * dt * 1.8 + 4; // ダッシュ中（と終わった直後）は速く動ける
        if (d > max) { p.x += dx / d * max; p.y += dy / d * max; } else { p.x = p.tx; p.y = p.ty; }
      }
      p.x = clamp(p.x, EDGE, WORLD.w - EDGE);
      p.y = clamp(p.y, EDGE, WORLD.h - EDGE);
      resolve(this.map, p, 16);
      if (p.st) { const d = Math.hypot(p.x - ox, p.y - oy); if (d < 400) p.st.dist += d; }
    }

    kill(p, killer) {
      if (!p.alive) return;
      // よみがえりの鈴：一度だけ復活
      if (SPECIES[p.sp].trait.id === 'revive' && !p.revived && chance(0.3 + 0.1 * p.traitLv + (p.evo ? 0.15 : 0))) {
        p.revived = true;
        p.hp = p.mhp * 0.5; p.iframe = 2; p.st.rv++;
        this.ev({ e: 'rv', p: p.id, x: r1(p.x), y: r1(p.y) });
        return;
      }
      p.alive = false; p.hp = 0; p.deadT = 0; p.choices.length = 0; p.poisonT = 0;
      p.killedBy = killer ? killer.name : null;
      this.mark(p, 'dead');
      if (killer && killer.alive) this.mark(killer, 'pk');
      // 終わったあとに見る「通った道」と「1回のプレイの記録」
      if (p.human) {
        p.route.push(Math.round(p.x), Math.round(p.y));
        this.ev({ e: 'rt', p: p.id, r: p.route, m: p.marks, w: [WORLD.w, WORLD.h] });
        this.ev({ e: 'run', p: p.id, d: { sp: p.sp, lv: p.lv, ev: p.evo, sc: p.score, k: p.kills, pk: p.pkills, b: p.bossKills, t: Math.round(p.lifeT || 0), by: p.killedBy || '' } });
      }
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
      if (killer && killer.human && p.human) this.ev({ e: 'kl', g: 1, a: killer.name, b: p.name, ai: killer.id, bi: p.id }); // キルログ（人どうしだけ）
      this.ev({ e: 'dd', p: p.id, by: killer ? killer.id : 0, x: r1(p.x), y: r1(p.y), lv: p.lv, sc: p.score, sp: p.sp });
    }

    traitPow(p) { return 1 + 0.7 * (p.traitLv - 1) + (p.evo ? 0.6 : 0) + ((p.star || 1) >= 5 ? 0.5 : 0); }

    // ---------- プレイヤー同士の体当たり（ぶつかるとお互いにダメージ） ----------
    updateBumps(dt) {
      const al = this.players.filter(p => p.alive && !isProtected(p) && !(p.invT > 0));
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
      const pct = 0.03; // 体当たりは控えめ（相手の最大HPの3%＋少し）。ほかの攻撃と同じくらいの強さに
      const rel = clamp(this.lvMul(atk) / this.lvMul(def), 0.5, 1.5);
      let dmg = this.bumpPower(atk) * 0.15 + def.mhp * pct * rel * Math.sqrt(atk.bumpMul), note = '';
      if (ta === 'underdog' && def.lv > atk.lv) dmg *= 1 + Math.min(0.6 * wa, (def.lv - atk.lv) * 0.08 * wa);
      if (ta === 'first' && this.time - atk.lastBump > 3) { dmg *= 1 + Math.min(1, 0.5 * wa); note = '先制！'; }
      if (ta === 'luck' && chance(Math.min(0.6, 0.32 * wa))) { dmg *= 2; note = '会心！'; }
      atk.lastBump = this.time;
      if (td === 'hop' && chance(Math.min(0.5, 0.2 * wd))) { def.st.dg++; return { dmg: 0, note: 'よけた！' }; }
      if (td === 'guard') dmg *= 1 - Math.min(0.45, 0.2 * wd);
      this.hurtPlayer(def, dmg);
      def.iframe = Math.max(def.iframe, 0.2);
      if (def.itRef) atk.hp -= dmg * def.itRef * 0.5; // 八咫鏡：体当たりのダメージを少しはね返す
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
          const w = (isBoss(e) ? 3 : 1) * (1 - d / range) * 2.2 * (p.hp < p.mhp * 0.4 ? 1.6 : 1);
          fx += dx / d * w; fy += dy / d * w;
        }
      }
      let target = null, tw = 0, best = Infinity;
      // 同じくらいか少し弱い相手に体当たりしにいく。ずっと格下（6レベル以上下）は狙わない。強い相手・HPが少ないときは逃げる
      const my = p.lv + (p.evo ? 10 : 0), healthy = p.hp > p.mhp * 0.45;
      let danger = 0;
      for (const q of this.players) {
        if (q === p || !q.alive || q.invT > 0) continue;
        const dx = q.x - p.x, dy = q.y - p.y;
        if (Math.abs(dx) > 900 || Math.abs(dy) > 900) continue;
        const d = Math.hypot(dx, dy) || 1;
        const their = q.lv + (q.evo ? 10 : 0);
        if (healthy && !isProtected(p) && !isProtected(q) && their <= my + 2 && their >= my - 8 && d < 800 && d < best) { best = d; target = q; tw = 2.3; }
        else if ((their > my + 3 || p.hp < p.mhp * 0.35) && !isProtected(q) && !isProtected(p) && d < 450) {
          const w = (1 - d / 520) * 3;
          fx -= dx / d * w; fy -= dy / d * w;
          danger = Math.max(danger, w);
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
      // ダッシュ：強い相手から逃げるとき・HPが少なくて囲まれたとき・獲物に追いつけそうなとき（スタミナは人と同じ）
      const tgtP = target && target.mhp ? target : null;
      const tgtD = tgtP ? Math.hypot(tgtP.x - p.x, tgtP.y - p.y) : Infinity;
      const hurtRun = p.hp < p.mhp * 0.35 && (fx * fx + fy * fy) > 0.5;
      if (!p.dashIn && !p.staLock && p.sta >= DASH_TIME * 0.6 && (danger > 1.2 || hurtRun || (tgtD > 140 && tgtD < 420 && chance(0.04)))) p.dashIn = true;
      else if (p.dashIn && (p.sta < DASH_TIME * 0.15 || (!hurtRun && danger <= 0.4 && tgtD > 520))) p.dashIn = false;
      const dm = p.dashing ? DASH_MUL : 1;
      p.x += ai.dx * sp * p.espd * dm * dt;
      p.y += ai.dy * sp * p.espd * dm * dt;
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
        p.spawnAcc = (p.spawnAcc || 0) + (3.4 + Math.min(p.lv, 80) * 0.1) * dt;
        while (p.spawnAcc >= 1) {
          p.spawnAcc -= 1;
          if (this.enemies.length >= cap) continue;
          const ty = this.pickEnemyType(p.lv);
          if (PACK[ty]) {
            // 弱い雑魚は群れでまとめて出る（高レベルほど大きな群れ）
            const a = rand(0, Math.PI * 2), d = rand(680, 860);
            const cx = p.x + Math.cos(a) * d, cy = p.y + Math.sin(a) * d;
            const n = randInt(3, 6) + (p.lv >= 60 ? 2 : 0) + (p.lv >= 150 ? 2 : 0);
            for (let k = 0; k < n; k++) this.spawnEnemy(ty, p, cx + rand(-60, 60), cy + rand(-60, 60));
          } else if (ty === 7) this.spawnEnemy(ty, p);
          else {
            // 狐・狸・鬼・妖狸は2〜3匹の小さな組で。ときどき赤く光る強敵になる
            const a = rand(0, Math.PI * 2), d = rand(680, 860);
            const cx = p.x + Math.cos(a) * d, cy = p.y + Math.sin(a) * d;
            const n = randInt(1, 3);
            for (let k = 0; k < n; k++) this.spawnEnemy(ty, p, cx + rand(-50, 50), cy + rand(-50, 50), p.lv >= ELITE_LV && chance(Math.min(0.25, (p.lv - ELITE_LV + 1) * 0.012)));
          }
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
      // フィールドボス：レベルに応じた段階のボスが、あちこちにどんどん出る
      let fb = 0;
      for (const e of this.enemies) if (FB_R[e.ty] !== undefined && !e.dead) fb++;
      for (const p of alive) {
        if (p.lv < FIELD_BOSSES[0][1]) continue;
        p.fbT = (p.fbT === undefined ? rand(8, 20) : p.fbT) - dt;
        if (p.fbT > 0) continue;
        p.fbT = p.lv >= 150 ? rand(14, 20) : p.lv >= 60 ? rand(18, 26) : rand(24, 34);
        const n = p.lv >= 200 ? 2 : 1;
        for (let k = 0; k < n && fb < FIELD_BOSS_CAP; k++, fb++) {
          const open = FIELD_BOSSES.filter(f => p.lv >= f[1]);
          const ty = chance(0.55) ? open[open.length - 1][0] : open[randInt(0, open.length - 1)][0];
          const e = this.spawnEnemy(ty, p);
          // おともの雑魚
          const mob = ty === 18 ? 16 : ty === 21 ? 19 : ty === 24 ? 22 : 23;
          for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; this.spawnEnemy(mob, p, e.x + Math.cos(a) * 110, e.y + Math.sin(a) * 110); }
        }
      }
      // ボス：どこかのプレイヤーの近くに出現
      this.bossT -= dt;
      if (this.bossT <= 0) {
        this.bossT = BOSS_EVERY;
        const p = alive[randInt(0, alive.length - 1)];
        // その人の段階のいちばん強いボスを、特別に硬くして出す
        const e = this.spawnEnemy(bossFor(p.lv), p);
        e.mhp = e.hp = e.hp * 3; e.xp *= 2;
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
          // 百鬼夜行は強い敵だけ（狐・狸、Lv60からは鬼・妖狸）
          const strong = p.lv >= TIER3_LV ? [22, 23, 19] : [19, 20];
          const ty = strong[randInt(0, strong.length - 1)];
          for (let i = 0; i < n; i++) {
            const a = (i / n) * Math.PI * 2;
            this.spawnEnemy(i % 3 === 0 ? strong[0] : ty, p, p.x + Math.cos(a) * 640, p.y + Math.sin(a) * 640, true);
          }
          // 途中で大妖怪（ボス）も
          if (!p.hyBoss && p.hyT < PARADE_TIME - 15) {
            p.hyBoss = true;
            const e = this.spawnEnemy(bossFor(p.lv), p);
            e.mhp = e.hp = e.hp * 3.5; e.xp *= 2;
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
          const dmg = Math.min(dmgFor(s, p), p.mhp * (s.cap || (p.lv >= 100 ? 0.25 : 0.4))); // 1発で最大HPの4割（Lv100以上は2.5割、大妖は4割）まで
          this.hurtPlayer(p, dmg);
          p.iframe = Math.max(p.iframe, 0.4);
          this.ev({ e: 'sl', p: p.id, d: Math.round(dmg), x: r1(p.x), y: r1(p.y) });
          if (p.hp <= 0) this.kill(p, null);
        }
        this.ev({ e: 'slx', x: r1(s.x), y: r1(s.y), r: s.r });
      }
      this.slams = keep;
    }

    // ---------- ヌシ（マップの4か所） ----------
    updateNushi(dt) {
      let mx = 0;
      for (const p of this.players) if (p.alive && p.lv > mx) mx = p.lv;
      NUSHI_HOMES.forEach(([ty, fx, fy], i) => {
        const cur = this.nushi[i];
        if (cur && !cur.dead) return;
        if (cur && cur.dead) { this.nushi[i] = null; this.nushiT[i] = NUSHI_RESPAWN; return; }
        this.nushiT[i] -= dt;
        if (this.nushiT[i] > 0) return;
        if (!mx) { this.nushiT[i] = 10; return; }
        const hx = WORLD.w * fx, hy = WORLD.h * fy;
        const lv = Math.max(30, Math.round(mx * 1.3)), k = lv / 100;
        const e = this.spawnEnemy(ty, null, hx, hy);
        const lvd = dmgCurve(lv);
        e.lv = lv; e.rw = Math.pow(lv / BIG_LV, 0.7); e.home = [hx, hy];
        // HP：いちばん高い人が一人で戦って40〜60秒くらい（高レベルほど攻撃がとても強いので、レベルの2.2乗で増やす）
        e.mhp = e.hp = NUSHI_HP * Math.pow(Math.max(30, mx) / 100, 2.2); e.dmg = ENEMIES[ENEMY_TYPES[ty]].dmg * lvd; e.lvd = lvd;
        e.wx = hx; e.wy = hy; e.callT = 8; e.slamT = 4; e.chgT = 5;
        this.nushi[i] = e;
        this.ev({ e: 'nss', g: 1, x: r1(hx), y: r1(hy), lv, ty });
      });
    }
    // ヌシを倒した：持ち場のまわりに、輪の形で経験値の玉
    nushiDefeated(e, owner) {
      const rw = e.rw || 1, [hx, hy] = e.home || [e.x, e.y];
      if (owner) { owner.bossKills += 3; owner.pkScore += Math.round(2000 * rw); if (owner.human) this.ev({ e: 'pt', p: owner.id, n: Math.max(10, Math.round(25 * rw)) }); }
      const RINGS = [160, 340, 520], total = RINGS.reduce((a, r) => a + r, 0);
      for (let k = 0; k < RINGS.length; k++) {
        const R = RINGS[k], n = Math.round(NUSHI_GEMS * R / total);
        for (let i = 0; i < n; i++) { const a = k * 0.4 + i / n * Math.PI * 2; this.dropGem(e.x + Math.cos(a) * R, e.y + Math.sin(a) * R, rand(40, 120) * rw); }
      }
      this.ev({ e: 'nsk', g: 1, n: owner ? owner.name : '', p: owner ? owner.id : 0, lv: e.lv, ty: e.ty, x: r1(e.x), y: r1(e.y) });
    }

    // ---------- 妖気の渦（高レベルの人向け。中にいると経験値アップ＆敵がたくさん） ----------
    updateRifts(dt) {
      for (const p of this.players) {
        if (!p.human || !p.alive || p.lv < RIFT_LV) continue;
        if (p.riftT === undefined) p.riftT = rand(20, 40);
        p.riftT -= dt;
        if (p.riftT > 0) continue;
        p.riftT = rand(60, 90);
        if (this.rifts.some(r => Math.hypot(r.x - p.x, r.y - p.y) < 2200)) continue; // 近くにもうある
        const a = rand(0, Math.PI * 2), d = rand(700, 1100);
        const x = clamp(p.x + Math.cos(a) * d, EDGE + RIFT_R, WORLD.w - EDGE - RIFT_R), y = clamp(p.y + Math.sin(a) * d, EDGE + RIFT_R, WORLD.h - EDGE - RIFT_R);
        const rf = { id: this.uid(), x, y, r: RIFT_R, t: RIFT_TIME, lv: p.lv, mul: riftMul(p.lv), spT: 0 };
        this.rifts.push(rf);
        this.ev({ e: 'rz', p: p.id, x: r1(x), y: r1(y), m: Math.round(rf.mul * 10) / 10 });
      }
      if (!this.rifts.length) return;
      for (const rf of this.rifts) {
        rf.t -= dt;
        // 中にいる人のまわりに、敵がどんどんわく
        rf.spT -= dt;
        if (rf.spT <= 0) {
          rf.spT = 0.6;
          let tgt = null;
          for (const q of this.players) if (q.alive && Math.hypot(q.x - rf.x, q.y - rf.y) < rf.r) { tgt = q; break; }
          if (tgt && this.enemies.length < ENEMY_CAP) {
            const ty = this.pickEnemyType(Math.max(tgt.lv, rf.lv), true), n = PACK[ty] ? 6 : 3;
            for (let i = 0; i < n; i++) {
              const a = rand(0, Math.PI * 2);
              this.spawnEnemy(ty, tgt, rf.x + Math.cos(a) * (rf.r + 120), rf.y + Math.sin(a) * (rf.r + 120), !PACK[ty] && chance(0.3));
            }
          }
        }
      }
      this.rifts = this.rifts.filter(r => r.t > 0);
    }
    riftBonus(p) {
      if (!this.rifts.length || !p.human) return 1;
      for (const rf of this.rifts) if ((p.x - rf.x) ** 2 + (p.y - rf.y) ** 2 < rf.r * rf.r) return rf.mul;
      return 1;
    }

    // ---------- 大妖（ビッグボス）：世界の中央をのそのそ歩く大妖怪（Lv100〜1000のどれか）。みんなで倒すと中央に経験値がばらまかれる ----------
    updateBig(dt) {
      if (this.big && this.big.dead) { this.big = null; this.bigT = BIG_RESPAWN; }
      if (this.big) return;
      this.bigT -= dt;
      if (this.bigT > 0) return;
      if (!this.players.some(p => p.alive)) { this.bigT = 10; return; }
      const cx = WORLD.w / 2, cy = WORLD.h / 2;
      const e = this.spawnEnemy(15, null, cx, cy);
      // レベルは出るたびにランダム。高いほどHP・攻撃・ごほうびが大きい
      const lv = BIG_LVS[randInt(0, BIG_LVS.length - 1)], k = lv / BIG_LV;
      const lvd = dmgCurve(lv);
      e.lv = lv; e.rw = Math.pow(k, 0.7);
      e.mhp = e.hp = lv >= 1000 ? BIG_HP_1000 : BIG_HP * Math.pow(k, 0.8); e.dmg = ENEMIES.bigboss.dmg * lvd; e.lvd = lvd; e.spd = ENEMIES.bigboss.spd;
      e.wx = cx; e.wy = cy; e.callT = 6; e.slamT = 3;
      this.big = e;
      this.ev({ e: 'bbs', g: 1, x: r1(cx), y: r1(cy), lv });
    }
    moveBig(e, dt) {
      const cx = e.home ? e.home[0] : WORLD.w / 2, cy = e.home ? e.home[1] : WORLD.h / 2, LEASH = e.home ? NUSHI_LEASH : 1300;
      const t = e.tgt && e.tgt.alive ? e.tgt : null;
      // 突進（体当たり）：予告のあと、まっすぐ猛スピードで突っ込む。当たると最大HPの大部分を持っていかれる
      if (e.chg) {
        const c = e.chg;
        if (this.time < c.at) return; // ためている（予告中）
        const step = Math.min(c.left, 1600 * dt);
        e.x = clamp(e.x + c.dx * step, EDGE, WORLD.w - EDGE); e.y = clamp(e.y + c.dy * step, EDGE, WORLD.h - EDGE);
        c.left -= step;
        for (const q of this.players) {
          if (!q.alive || c.hit.has(q.id) || isProtected(q)) continue;
          const rr = e.r + this.radius(q) * 0.8;
          if ((q.x - e.x) ** 2 + (q.y - e.y) ** 2 > rr * rr) continue;
          c.hit.add(q.id);
          // 防御の軽減は効かない（バリアだけは効く）。当たると「妖気の傷」で6秒間 回復できなくなる
          const pct = clamp(0.55 + ((e.lv || BIG_LV) - q.lv) / 1500, 0.5, 0.85);
          const before = q.hp;
          let dmg = q.mhp * pct;
          if (q.shield > 0) { const a = Math.min(q.shield, dmg); q.shield -= a; dmg -= a; }
          q.hp -= dmg;
          q.woundT = 8;
          // はじき飛ばして、少しだけ動けなくする
          const sx = -c.dy, sy = c.dx, side = (q.x - e.x) * sx + (q.y - e.y) * sy >= 0 ? 1 : -1;
          q.x = clamp(q.x + (sx * side * 0.8 + c.dx * 0.6) * 260, EDGE, WORLD.w - EDGE); q.y = clamp(q.y + (sy * side * 0.8 + c.dy * 0.6) * 260, EDGE, WORLD.h - EDGE);
          resolve(this.map, q, 16); q.tx = q.x; q.ty = q.y; q.tp++; q.tpT = 0.45; q.iframe = Math.max(q.iframe, 0.3);
          this.ev({ e: 'bh', p: q.id, d: Math.round(before - Math.max(0, q.hp)), x: r1(q.x), y: r1(q.y) });
          if (q.hp <= 0) this.kill(q, null);
        }
        if (c.left <= 0) {
          e.chg = null;
          // 着地の衝撃：突進の終わりに、まわりへたたきつけ（予告つき）
          const r = 320, delay = 0.6;
          this.slams.push({ x: e.x, y: e.y, r, at: this.time + delay, dmg: e.dmg * 3, lvd: e.lvd, cap: 0.4 });
          this.ev({ e: 'tg', x: r1(e.x), y: r1(e.y), r, d: delay });
        }
        return;
      }
      if (e.chgT === undefined) e.chgT = 6;
      e.chgT -= dt;
      if (t && e.chgT <= 0) {
        const td0 = Math.hypot(t.x - e.x, t.y - e.y);
        if (td0 > 150 && td0 < 1100 && t.lv >= 30) {
          const dx = (t.x - e.x) / td0, dy = (t.y - e.y) / td0, len = Math.min(1400, td0 + 350);
          const delay = 1.1;
          e.chg = { dx, dy, left: len, at: this.time + delay, hit: new Set() };
          e.chgT = e.hp < e.mhp * 0.5 ? rand(4, 5) : rand(6, 8); // HPが半分を切ると突進の間隔が短く
          this.ev({ e: 'bch', x: r1(e.x), y: r1(e.y), x2: r1(e.x + dx * len), y2: r1(e.y + dy * len), w: Math.round(e.r * 2), d: delay });
          return;
        }
        e.chgT = 1;
      }
      // 近くの人をゆっくり追いかける。ただし中央からは離れすぎない
      let gx = e.wx, gy = e.wy;
      if (t && Math.hypot(t.x - cx, t.y - cy) < LEASH + 300) { gx = t.x; gy = t.y; }
      else if (Math.hypot(e.x - e.wx, e.y - e.wy) < 60) { const a = rand(0, Math.PI * 2), d = rand(0, LEASH * 0.7); e.wx = cx + Math.cos(a) * d; e.wy = cy + Math.sin(a) * d; }
      const dx = gx - e.x, dy = gy - e.y, d = Math.hypot(dx, dy) || 1;
      let sp = e.spd;
      if (e.slowT > 0) { e.slowT -= dt; sp *= 0.6; }
      if (d > 40) { e.x += dx / d * sp * dt; e.y += dy / d * sp * dt; }
      const ox = e.x - cx, oy = e.y - cy, od = Math.hypot(ox, oy);
      if (od > LEASH) { e.x = cx + ox / od * LEASH; e.y = cy + oy / od * LEASH; }
      if (!t) return;
      const td = Math.hypot(t.x - e.x, t.y - e.y);
      // 地面たたきつけ：大きな円で予告（Lv10以上の人だけ狙う）
      e.slamT -= dt;
      if (e.slamT <= 0 && td < 650 && t.lv >= 10) {
        e.slamT = 3.2;
        const r = 330, delay = 1.2;
        this.slams.push({ x: t.x, y: t.y, r, at: this.time + delay, dmg: e.dmg * 3, lvd: e.lvd, cap: 0.4 });
        this.ev({ e: 'tg', x: r1(t.x), y: r1(t.y), r, d: delay });
        // HPが半分を切ったら、まわりにも追加でたたきつける
        if (e.hp < e.mhp * 0.5) {
          for (let i = 0; i < 3; i++) {
            const a = rand(0, Math.PI * 2), x = t.x + Math.cos(a) * 420, y = t.y + Math.sin(a) * 420;
            this.slams.push({ x, y, r: 240, at: this.time + delay + 0.5, dmg: e.dmg * 2.2, lvd: e.lvd, cap: 0.3 });
            this.ev({ e: 'tg', x: r1(x), y: r1(y), r: 240, d: delay + 0.5 });
          }
        }
      }
      // ときどき雑魚を呼び寄せる
      e.callT -= dt;
      if (e.callT <= 0 && td < 1200) {
        e.callT = 7;
        const ty = [16, 17][randInt(0, 1)];
        for (let i = 0; i < 10; i++) {
          const a = i / 10 * Math.PI * 2;
          this.spawnEnemy(ty, t, e.x + Math.cos(a) * 200, e.y + Math.sin(a) * 200);
        }
      }
    }
    // 大妖を倒した：経験値の玉を世界の中央にばらまく
    bigDefeated(e, owner) {
      const cx = WORLD.w / 2, cy = WORLD.h / 2;
      const rw = e.rw || 1;
      if (owner) { owner.bossKills += 5; owner.pkScore += Math.round(5000 * rw); if (owner.human) this.ev({ e: 'pt', p: owner.id, n: Math.round(50 * rw) }); }
      // 世界の中央に、何重もの輪の形で経験値の玉を並べる（外の輪ほど玉が多い）
      const RINGS = [220, 480, 760, 1040, 1320];
      const total = RINGS.reduce((a, r) => a + r, 0);
      for (let k = 0; k < RINGS.length; k++) {
        const R = RINGS[k], n = Math.round(BIG_GEMS * R / total), off = k * 0.37;
        for (let i = 0; i < n; i++) {
          const a = off + i / n * Math.PI * 2;
          this.dropGem(cx + Math.cos(a) * R, cy + Math.sin(a) * R, rand(50, 150) * rw);
        }
      }
      this.ev({ e: 'bbk', g: 1, lv: e.lv || BIG_LV, n: owner ? owner.name : '', p: owner ? owner.id : 0, x: r1(e.x), y: r1(e.y) });
    }

    pickEnemyType(lv, swarm) {
      // [番号, 重み]：用意された妖怪だけ。レベルが上がると次の段階が混ざり、雑魚は減るけどずっと多め
      const f = lv >= 150 ? 0.45 : lv >= 60 ? 0.6 : 1;
      const t3 = lv >= 150 ? 1.6 : 1;
      const w = [[16, 1 * f], [17, lv > 2 ? 0.8 * f : 0], [27, lv > 3 ? 0.7 * f : 0], [26, lv > 6 ? 0.6 * f : 0],
        [19, lv >= TIER2_LV ? 0.45 : 0], [20, lv >= TIER2_LV ? 0.4 : 0],
        [22, lv >= TIER3_LV ? 0.3 * t3 : 0], [23, lv >= TIER3_LV ? 0.35 * t3 : 0],
        [7, swarm ? 0 : 0.015]];
      const total = w.reduce((a, b) => a + b[1], 0);
      let x = Math.random() * total;
      for (const [ty, wt] of w) { x -= wt; if (x <= 0) return ty; }
      return 16;
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
          if (!bt && !isWorldBoss(e)) { e.dead = true; e.gone = true; continue; }
        }
        if (isBigOne(e)) { this.moveBig(e, dt); continue; }
        if (!e.tgt) continue;
        if (e.stunT > 0) { e.stunT -= dt; continue; }
        if (e.tgt.invT > 0) continue; // すがたを消した人は見失う
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
        const fbr = FB_R[e.ty];
        if (e.ty === 4 || fbr || (e.el && (e.ty === 20 || e.ty === 22))) {
          e.slamT -= dt;
          if (e.slamT <= 0 && d < 460 && e.tgt.lv >= 10) { // 低レベルの人には使わない
            const boss = e.ty === 4 || !!fbr;
            e.slamT = e.ty === 4 ? 4.5 : fbr ? 5 : 6;
            const r = fbr || (boss ? 300 : 210), delay = boss ? 1.0 : 0.9;
            this.slams.push({ x: e.tgt.x, y: e.tgt.y, r, at: this.time + delay, dmg: e.dmg * (boss ? 2.6 : 2.2), lvd: e.lvd });
            this.ev({ e: 'tg', x: r1(e.tgt.x), y: r1(e.tgt.y), r, d: delay });
            // 白獅子神はまわりにも追加でたたきつける
            if (e.ty === 25) for (let i = 0; i < 3; i++) {
              const a = rand(0, Math.PI * 2), x = e.tgt.x + Math.cos(a) * 360, y = e.tgt.y + Math.sin(a) * 360;
              this.slams.push({ x, y, r: 220, at: this.time + delay + 0.4, dmg: e.dmg * 2, lvd: e.lvd });
              this.ev({ e: 'tg', x: r1(x), y: r1(y), r: 220, d: delay + 0.4 });
            }
          }
        }
        let sp = e.spd;
        if (e.slowT > 0) { e.slowT -= dt; sp *= 0.45; }
        e.x += dx / d * sp * dt;
        e.y += dy / d * sp * dt;
        if (!isWorldBoss(e)) resolve(this.map, e, e.r * 0.6);
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
              const w1 = isBoss(e1) ? (isBigOne(e1) ? 0 : 0.1) : 1, w2 = isBoss(e2) ? (isBigOne(e2) ? 0 : 0.1) : 1;
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
      dmg *= starBonus(p.star).def * (1 - (p.itDef || 0)) / (1 + 0.5 * (awakeBonus(p.aw) - 1));
      if (p.shield > 0) {
        const a = Math.min(p.shield, dmg);
        p.shield -= a; dmg -= a;
        if (p.st) p.st.sa += a;
        if (p.shield <= 0) { p.shield = 0; p.shieldT = 0; }
      }
      p.hp -= dmg;
      p.hurtAcc = (p.hurtAcc || 0) + dmg; // 最近受けたダメージ（甲羅バリアの合図）
    }
    // 回復（実際に回復した量を数える）
    healP(p, amt) {
      const before = p.hp;
      p.hp = Math.min(p.mhp, p.hp + amt);
      if (p.st) p.st.hl += p.hp - before;
    }

    // 攻撃の倍率：★と覚醒
    atkB(p) { return starBonus(p.star).atk * awakeBonus(p.aw); }
    lvMul(p) { return (1 + 0.06 * (p.lv - 1)) * (p.evo ? 3 : 1); } // 進化すると攻撃・体当たり3倍

    // ---------- 装備アイテム（ガチャで手に入る。種類ごとに役割がちがう） ----------
    setItem(p, item) {
      p.item = null;
      // ★（ガチャで同じ妖怪を重ねた強さ。1〜5）
      p.star = item && item.st ? clamp(item.st | 0, 1, 5) : 1;
      // 覚醒（★5のあとにポイントで上げる）・着せ替え・称号（見た目だけ）
      p.aw = item ? clamp(item.aw | 0, 0, AWAKE_MAX) : 0;
      p.cs = item && Array.isArray(item.cs) ? item.cs.slice(0, 4).map(v => clamp(v | 0, 0, 99)) : null;
      p.tl = item ? clamp(item.tl | 0, 0, 99) : 0;
      // 持ってきた使い捨ての道具（このプレイで1回ずつ）と、買ったピンズ
      p.cons = item && Array.isArray(item.cn) ? item.cn.filter(k => CONSUMABLES.some(c => c.id === k)).slice(0, CONS_SLOTS) : [];
      p.consUsed = [];
      p.pins = item && Array.isArray(item.pn) ? item.pn.map(v => v | 0).filter(v => v >= 1 && v <= PINS.length) : [];
      p.itDef = 0; p.itRef = 0; p.itXp = 1; p.itMag = 0; p.itCd = 1; p.itPow = 1; p.itCdMul = 1; p.combo = 0;
      if (!item || item.t === undefined || item.t === null) return;
      const t = item.t | 0, r = item.r | 0;
      if (t >= 0 && t < ITEMS.length && r >= 0 && r < RARITIES.length) {
        const plus = clamp(item.p | 0, 0, ITEM_PLUS_MAX);
        p.item = { t, r, p: plus };
        const d = ITEMS[t];
        // ＋強化（同じ装備がかぶるほど強い）と、妖怪との組み合わせ（隠し効果）
        p.combo = isCombo(p.sp, t) ? 1 : 0;
        p.itPow = (1 + ITEM_PLUS_STEP * plus) * (p.combo ? COMBO_POW : 1);
        p.itCdMul = p.combo ? COMBO_CD : 1;
        const k = p.itPow;
        if (d.def) p.itDef = Math.min(0.6, (d.def[0] + d.def[1] * r) * k);
        if (d.ref) p.itRef = (d.ref[0] + d.ref[1] * r) * k;
        if (d.xp) p.itXp = 1 + (d.xp[0] + d.xp[1] * r) * k;
        if (d.mag) p.itMag = (d.mag[0] + d.mag[1] * r) * k;
        if (p.combo && p.human) this.ev({ e: 'cb', p: p.id });
      }
    }
    itemDmg(p) {
      const it = p.item;
      return ITEMS[it.t].dmg * RARITIES[it.r].pow * (p.itPow || 1) * this.lvMul(p) * p.dmgMul * Math.sqrt(p.skillPow) * this.atkB(p);
    }
    // 撃てる相手（守られている人・生まれたての人・自分は撃たない）
    foeOk(p, q) { return q !== p && q.alive && !isProtected(q) && !isProtected(p) && !(q.invT > 0); }
    nearestFoe(p, range) {
      let best = range * range, bt = null;
      for (const q of this.players) {
        if (!this.foeOk(p, q)) continue;
        const d = (q.x - p.x) ** 2 + (q.y - p.y) ** 2;
        if (d < best) { best = d; bt = q; }
      }
      return bt;
    }
    // 装備の攻撃がプレイヤーに当たった：相手の最大HPの割合ダメージ（レベル差で少し変わる）
    itemHitPlayer(p, q, pct, slow) {
      if (!p.item) return;
      this.pvpHit(p, q, pct * RARITIES[p.item.r].pow * (p.itPow || 1), slow);
    }
    // 攻撃（通常攻撃・装備）がプレイヤーに当たった。pct = 相手の最大HPに対する割合
    pvpHit(p, q, pct, slow) {
      if (!this.foeOk(p, q)) return;
      if (SPECIES[q.sp].trait.id === 'hop' && chance(Math.min(0.5, 0.2 * this.traitPow(q)))) { q.st.dg++; this.ev({ e: 'ih', a: p.id, b: q.id, d: 0, x: r1(q.x), y: r1(q.y) }); return; }
      const rel = clamp(this.lvMul(p) / this.lvMul(q), 0.5, 1.5);
      const dmg = q.mhp * pct * rel * this.atkB(p);
      const before = q.hp;
      this.hurtPlayer(q, dmg);
      if (slow) q.pslowT = Math.max(q.pslowT, slow);
      this.ev({ e: 'ih', a: p.id, b: q.id, d: Math.round(before - q.hp), x: r1(q.x), y: r1(q.y) });
      this.ev({ e: 'hu', p: q.id, x: r1(q.x), y: r1(q.y) });
      if (q.hp <= 0) this.kill(q, p);
    }
    itemTick(p, dt) {
      const it = p.item;
      if (!it) return;
      const def = ITEMS[it.t], r = it.r;
      if (def.kind === 'orbit') {
        const n = itemCount(it.t, r), R = this.radius(p) + 46, hitR = 24 + r * 2;
        const dmg = this.itemDmg(p), cd = 0.35 * Math.sqrt(p.rateMul);
        const base = this.time * ORBIT_SPEED;
        const oc = p.oc || (p.oc = {});
        for (let i = 0; i < n; i++) {
          const a = base + (i / n) * Math.PI * 2;
          const ox = p.x + Math.cos(a) * R, oy = p.y - 20 + Math.sin(a) * R;
          this.enemiesIn(ox, oy, hitR, e => {
            if ((e.oc || 0) > this.time) return;
            e.oc = this.time + cd;
            this.damage(e, dmg, p, def.slow || 0);
            if (def.heal) p.hp = Math.min(p.mhp, p.hp + p.mhp * def.heal);
          });
          // 刃は人にも当たる（同じ相手には0.6秒に1回）
          if (def.pvp) for (const q of this.players) {
            if (!this.foeOk(p, q) || (oc[q.id] || 0) > this.time) continue;
            const rr = hitR + this.radius(q) * 0.8;
            if ((q.x - ox) ** 2 + (q.y - 20 - oy) ** 2 > rr * rr) continue;
            oc[q.id] = this.time + 0.6;
            this.itemHitPlayer(p, q, def.pvp);
          }
        }
        return;
      }
      if (!def.cd) return; // 持っているだけで効くもの（鏡・小槌）
      p.itCd -= dt;
      if (p.itCd > 0) return;
      const dmg = this.itemDmg(p), cdNext = (def.cd - (def.cdR || 0) * r) * Math.sqrt(p.rateMul) * (p.itCdMul || 1);
      const range = def.range || 520;
      if (def.kind === 'shot') {
        // 狙う相手：弓は人を優先、ほかは敵を優先
        let tg = def.hunt ? this.nearestFoe(p, range) : null;
        if (!tg) tg = this.nearestEnemy(p.x, p.y, range);
        if (!tg && def.pvp && !def.radial) tg = this.nearestFoe(p, range);
        if (!tg && !def.radial) { p.itCd = 0.2; return; }
        if (def.radial && !tg && !this.nearestFoe(p, range)) { p.itCd = 0.2; return; }
        const n = itemCount(it.t, r);
        const baseA = tg ? Math.atan2(tg.y - p.y, tg.x - p.x) : rand(0, Math.PI * 2);
        for (let i = 0; i < n; i++) {
          const ang = def.radial ? baseA + (i / n) * Math.PI * 2 : baseA + (i - (n - 1) / 2) * (def.spread || 0.16);
          this.spawnProj(p, p.x, p.y, ang, def.speed, dmg, def.pr, def.life, def.pierce || 0, def.pk, def.aoe, def.slow);
          this.projs[this.projs.length - 1].pv = (def.pvp || 0) * RARITIES[r].pow * (p.itPow || 1);
        }
      } else if (def.kind === 'zap') {
        // 雷：近くの敵（と人）へ次々に飛び移る
        let first = this.nearestEnemy(p.x, p.y, range), firstP = this.nearestFoe(p, range * 0.8);
        if (!first && !firstP) { p.itCd = 0.25; return; }
        const pts = [r1(p.x), r1(p.y - 30)];
        const hitE = new Set();
        let cx = p.x, cy = p.y;
        let cur = first;
        const jumps = itemCount(it.t, r);
        for (let j = 0; j < jumps && cur; j++) {
          hitE.add(cur.id);
          this.damage(cur, dmg, p, 0);
          if (!isBoss(cur)) cur.stunT = Math.max(cur.stunT || 0, 0.25);
          pts.push(r1(cur.x), r1(cur.y - cur.r));
          cx = cur.x; cy = cur.y;
          let nb = null, bd = 260 * 260;
          this.enemiesIn(cx, cy, 260, e => { if (hitE.has(e.id) || e.dead) return; const d = (e.x - cx) ** 2 + (e.y - cy) ** 2; if (d < bd) { bd = d; nb = e; } });
          cur = nb;
        }
        if (firstP) { pts.push(r1(firstP.x), r1(firstP.y - 30)); this.itemHitPlayer(p, firstP, def.pvp); }
        this.ev({ e: 'zp', x: r1(p.x), y: r1(p.y), pts });
      } else if (def.kind === 'wind') {
        // 突風：まわりの敵と人を吹き飛ばす
        const R = (def.R + 20 * r) * Math.sqrt(p.areaMul);
        let any = false;
        this.enemiesIn(p.x, p.y, R, e => {
          any = true;
          this.damage(e, dmg, p, 0);
          if (isBoss(e)) return;
          const dx = e.x - p.x, dy = e.y - p.y, d = Math.hypot(dx, dy) || 1, k = def.knock * (1 - d / R * 0.5);
          e.x = clamp(e.x + dx / d * k, EDGE, WORLD.w - EDGE); e.y = clamp(e.y + dy / d * k, EDGE, WORLD.h - EDGE);
          e.stunT = Math.max(e.stunT || 0, 0.5);
        });
        for (const q of this.players) {
          if (!this.foeOk(p, q)) continue;
          const dx = q.x - p.x, dy = q.y - p.y, d = Math.hypot(dx, dy) || 1;
          if (d > R) continue;
          any = true;
          q.x = clamp(q.x + dx / d * def.knock * 1.3, EDGE, WORLD.w - EDGE); q.y = clamp(q.y + dy / d * def.knock * 1.3, EDGE, WORLD.h - EDGE);
          resolve(this.map, q, 16); q.tx = q.x; q.ty = q.y; q.tp++; q.tpT = 0.12;
          this.itemHitPlayer(p, q, def.pvp);
        }
        if (!any) { p.itCd = 0.25; return; }
        this.ev({ e: 'wd', x: r1(p.x), y: r1(p.y), r: Math.round(R) });
      }
      p.itCd = cdNext;
    }

    playerCombat(p, dt) {
      if (!p.alive) return;
      this.itemTick(p, dt);
      // 接触ダメージ
      if (p.iframe <= 0) {
        // 当たり判定は見た目の大きさに比例（大きくなるほど当たりやすい）
        let hitBy = null;
        const pr = this.radius(p) * 0.85;
        this.enemiesIn(p.x, p.y, pr, e => {
          if (e.stunT <= 0 && e.dmg && (!hitBy || (isBigOne(e) && !isBigOne(hitBy)))) hitBy = e; // 大妖・ヌシに重なっていたらそちらを優先
        });
        if (hitBy && p.invT > 0 && !isBigOne(hitBy)) hitBy = null; // すがたを消している間はふつうの敵に当たらない
        if (hitBy) {
          // Lv100以上：1回で受けるダメージは最大HPの6%（ボスは12%）まで。囲まれると危ないが一瞬では溶けない
          const raw = dmgFor(hitBy, p);
          // 大妖・ヌシに重なると大ダメージ（体当たり）：最大HPの20〜45%（相手のレベルが上ほど痛い）。上限なし
          if (isBigOne(hitBy)) this.hurtPlayer(p, Math.max(raw * 0.3, p.mhp * clamp(0.25 + ((hitBy.lv || BIG_LV) - p.lv) / 2000, 0.2, 0.45)));
          // 高レベルでも油断できないように：ボスは1.4割、強敵（紫）は0.9割まで入る
          else this.hurtPlayer(p, p.lv >= 100 ? Math.min(raw, p.mhp * (isBigOne(hitBy) ? 0.2 : isBoss(hitBy) ? 0.14 : hitBy.el ? 0.09 : p.lv >= 200 ? 0.05 : 0.06)) : raw);
          if (p.itRef) this.damage(hitBy, this.itemDmg(p) * p.itRef * 2.5, p, 0); // 八咫鏡：はね返す
          p.iframe = 0.5;
          this.ev({ e: 'hu', p: p.id, x: r1(p.x), y: r1(p.y) });
          if (p.hp <= 0) { this.kill(p, null); return; }
        }
      }
      const def = SPECIES[p.sp];
      if (p.stoneT > 0) return; // 石になっている間は攻撃もスキルもできない
      // スキル
      p.scd -= dt;
      if (p.scd <= 0) {
        if (this.useSkill(p, def)) { p.scd = Math.max(def.skill.minCd || 0, def.skill.cd * p.skillCd * (p.evo ? 0.6 : 1) * starBonus(p.star).cd); p.st.su++; }
        else p.scd = 0.3;
      }
      // 進化スキル
      if (p.evo) {
        p.scd2 -= dt;
        if (p.scd2 <= 0) {
          if (this.useEvoSkill(p)) { p.scd2 = this.evoCd(p); p.st.su++; }
          else p.scd2 = 0.4;
        }
      }
      // 通常攻撃（モンスターごとに違う）
      p.atkCd -= dt;
      if (p.atkCd > 0) return;
      const a = def.atk;
      // 近くの敵か、近くのプレイヤー（近い方）をねらう
      let t = this.nearestEnemy(p.x, p.y, 420);
      const foe = this.nearestFoe(p, 420);
      if (foe && (!t || (foe.x - p.x) ** 2 + (foe.y - p.y) ** 2 < (t.x - p.x) ** 2 + (t.y - p.y) ** 2)) t = foe;
      if (!t) { p.atkCd = 0.1; return; }
      const dmg = a.dmg * p.dmgMul * this.lvMul(p) * this.atkB(p);
      const base = Math.atan2(t.y - p.y, t.x - p.x);
      const n = (a.n || 1) + p.extra;
      const vh = new Set(); // 1回の発射で同じプレイヤーに当たるのは1発だけ
      for (let i = 0; i < n; i++) {
        let ang;
        if (a.pattern === 'radial') ang = base + (i / n) * Math.PI * 2;
        else ang = base + (i - (n - 1) / 2) * (a.spread || 0.12);
        this.spawnProj(p, p.x, p.y, ang, a.speed, dmg, a.r, a.life, (a.pierce || 0) + p.pierce, p.sp, a.aoe, a.slow);
        // 通常攻撃もプレイヤーに当たる：どの妖怪でも1秒あたりの対人ダメージがだいたい同じになるよう、間隔と弾数でならす
        const pr = this.projs[this.projs.length - 1];
        pr.pv = PVP_SHOT * a.cd * Math.sqrt(p.dmgMul) * (p.bot ? 0.8 : 1); pr.vh = vh;
      }
      p.atkCd = a.cd * p.rateMul;
    }

    evoCd(p) { return EVO_SKILLS[p.sp].cd * Math.max(0.5, p.skillCd) * starBonus(p.star).cd; }
    // スキルの強さ（攻撃系の倍率）
    skillPw(p) { return p.skillPow * this.lvMul(p) * (p.evo ? 1.3 : 1) * starBonus(p.star).skill * awakeBonus(p.aw); }
    // 進化スキル。発動したら true
    useEvoSkill(p) {
      const es = EVO_SKILLS[p.sp];
      if (!es) return false;
      const pw = this.skillPw(p), area = p.areaMul, fx = p.x, fy = p.y;
      const sk = (k, r) => this.ev({ e: 'sk', k, p: p.id, sp: p.sp, x: r1(fx), y: r1(fy), r, en: es.name });
      const anyNear = r => !!this.nearestEnemy(fx, fy, r);
      const ring = (n, speed, dmg, rr, life, pierce, kind, off) => { for (let i = 0; i < n; i++) this.spawnProj(p, fx, fy, (i / n + (off || 0)) * Math.PI * 2, speed, dmg, rr, life, pierce, kind); };
      switch (es.id) {
        case 'e_wave': if (!anyNear(420)) return false; ring(8, 950, 30 * pw, 13, 0.55, 99, 'tongue'); sk('tongue', 0); return true;
        case 'e_gale': {
          if (!anyNear(240)) return false;
          const r = 240 * area; this.enemiesIn(fx, fy, r, e => this.damage(e, 26 * pw, p)); p.hasteT = Math.max(p.hasteT, 2); sk('moon', r); return true;
        }
        case 'e_grove': {
          if (p.hp >= p.mhp * 0.8 && !anyNear(220)) return false;
          this.healP(p, p.mhp * 0.12 * (p.woundT > 0 ? 0.5 : 1));
          const r = 250 * area; this.enemiesIn(fx, fy, r, e => { this.damage(e, 18 * pw, p); if (!isBoss(e)) { e.stunT = Math.max(e.stunT || 0, 1.2); p.st.sn++; } });
          sk('heal', r); return true;
        }
        case 'e_gold': {
          if (!anyNear(300)) return false;
          const r = 280 * area; this.enemiesIn(fx, fy, r, e => this.damage(e, 22 * pw, p));
          for (let i = 0; i < 6; i++) this.dropGem(fx + rand(-140, 140), fy + rand(-140, 140), (1 + Math.floor(p.lv / 5)) * Math.min(2, p.skillPow));
          sk('lucky', r); return true;
        }
        case 'e_rend': if (!anyNear(230)) return false; ring(16, 540, 15 * pw, 9, 0.45, 1, 'kodama'); ring(16, 600, 15 * pw, 9, 0.45, 1, 'kodama', 0.5 / 16); sk('frenzy', 0); return true;
        case 'e_illusion': {
          if (!anyNear(200) && !this.nearestFoe(p, 300)) return false;
          p.invT = Math.max(p.invT, 2.5);
          const r = 200 * area;
          this.enemiesIn(fx, fy, r, e => { this.damage(e, 14 * pw, p); if (!isBoss(e)) { const dx = e.x - fx, dy = e.y - fy, d = Math.hypot(dx, dy) || 1; e.x += dx / d * 120; e.y += dy / d * 120; } });
          sk('moon', r); return true;
        }
        case 'e_rain': {
          const list = this.nearEnemies(fx, fy, 520);
          if (!list.length) return false;
          list.sort((a, b) => ((a.x - fx) ** 2 + (a.y - fy) ** 2) - ((b.x - fx) ** 2 + (b.y - fy) ** 2));
          list.slice(0, 14).forEach(e => this.spawnProj(p, fx, fy, Math.atan2(e.y - fy, e.x - fx), 820, 16 * pw, 8, 0.85, 3, 'kuroro'));
          sk('flock', 0); return true;
        }
        case 'e_coil': {
          if (!anyNear(220)) return false;
          const r = 230 * area; this.enemiesIn(fx, fy, r, e => { this.damage(e, 20 * pw, p, 3); if (!isBoss(e)) { e.stunT = Math.max(e.stunT || 0, 1.8); p.st.sn++; } });
          sk('venom', r); return true;
        }
        case 'e_ward': {
          if (!anyNear(200) && (p.hurtAcc || 0) < p.mhp * 0.05) return false;
          const r = 210 * area;
          this.enemiesIn(fx, fy, r, e => { this.damage(e, 18 * pw, p); if (!isBoss(e)) { const dx = e.x - fx, dy = e.y - fy, d = Math.hypot(dx, dy) || 1; e.x += dx / d * 150; e.y += dy / d * 150; } });
          if (!(p.shield > 0)) { p.shield = p.mhp * 0.08; p.shieldT = 3; }
          sk('shell', r); return true;
        }
        case 'e_chain': {
          const t = this.nearestEnemy(fx, fy, 380);
          if (!t) return false;
          const r = 170 * area;
          for (let k = 0; k < 3; k++) {
            const bx = t.x + rand(-120, 120), by = t.y + rand(-120, 120);
            this.enemiesIn(bx, by, r, e => this.damage(e, 22 * pw, p));
            this.ev({ e: 'sk', k: 'nova', p: p.id, sp: p.sp, x: r1(bx), y: r1(by), r, en: k ? undefined : es.name });
          }
          return true;
        }
        case 'e_turret': if (!anyNear(360)) return false; ring(18, 560, 11 * pw, 8, 0.9, 1, 'nejimaru'); ring(18, 420, 11 * pw, 8, 0.9, 1, 'nejimaru', 0.5 / 18); sk('drone', 0); return true;
        case 'e_howl': {
          if (!anyNear(320)) return false;
          const r = 400 * area; this.enemiesIn(fx, fy, r, e => { this.damage(e, 20 * pw, p); if (!isBoss(e)) { e.stunT = Math.max(e.stunT || 0, 2.5); p.st.sn++; } });
          sk('roar', r); return true;
        }
        case 'e_kagura': {
          if (p.hp >= p.mhp * 0.6) return false;
          this.healP(p, p.mhp * 0.35 * (p.woundT > 0 ? 0.5 : 1));
          p.iframe = Math.max(p.iframe, 2);
          const r = 260 * area; this.enemiesIn(fx, fy, r, e => this.damage(e, 16 * pw, p));
          sk('bless', r); return true;
        }
      }
      return false;
    }

    // ---------- 使い捨ての道具・エモート ----------
    useCons(id, i) {
      const p = this.pmap.get(id);
      if (!p || !p.alive || !p.cons) return;
      i = i | 0;
      const k = p.cons[i];
      if (!k || p.consUsed.includes(k)) return;
      p.consUsed.push(k);
      const R = 320;
      switch (k) {
        case 'heal': this.healP(p, p.mhp * 0.5 * (p.woundT > 0 ? 0.5 : 1)); break;
        case 'inv': p.invT = 6; break;
        case 'warp': {
          const pos = this.spawnPos();
          p.x = pos.x; p.y = pos.y; p.tx = p.x; p.ty = p.y; p.tp++; p.iframe = Math.max(p.iframe, 1.5);
          break;
        }
        case 'stone':
          this.enemiesIn(p.x, p.y, R, e => { if (!isBoss(e)) e.stunT = Math.max(e.stunT || 0, 3); });
          for (const q of this.players) if (this.foeOk(p, q) && Math.hypot(q.x - p.x, q.y - p.y) < R) { q.stoneT = 3; q.tp++; }
          break;
        case 'poison':
          this.enemiesIn(p.x, p.y, R, e => this.damage(e, 30 * this.skillPw(p), p, 4));
          for (const q of this.players) if (this.foeOk(p, q) && Math.hypot(q.x - p.x, q.y - p.y) < R) { q.poisonT = 5; q.poisonDps = q.mhp * 0.035; q.poisonBy = p; }
          break;
      }
      this.ev({ e: 'cu', p: p.id, k, x: r1(p.x), y: r1(p.y), r: R, g: 1 });
      this.ev({ e: 'cuse', p: p.id, k }); // サーバーが持ち物を1つ減らす
    }
    emote(id, i) {
      const p = this.pmap.get(id);
      if (!p || !p.alive || p.emoCd > 0) return;
      i = i | 0;
      if (i < 0 || (i >= EMOTES.length && !(p.pins || []).includes(i - EMOTES.length + 1)) || i >= EMOTES.length + PINS.length) return;
      p.emo = i; p.emoT = 2.6; p.emoCd = 1.5;
    }
    // 記録用：通った道の上のできごと
    mark(p, k) { if (p && p.human && p.marks.length < 200) p.marks.push([k, Math.round(p.x), Math.round(p.y), Math.round(p.lifeT || 0)]); }

    // スキル発動。発動したら true
    useSkill(p, def) {
      const id = def.skill.id, evo = p.evo;
      const pw = p.skillPow * this.lvMul(p) * (evo ? 1.3 : 1) * starBonus(p.star).skill * awakeBonus(p.aw);
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
          // 回復量は最大HPの11%（進化15%）。強化カードの伸びはゆるやか
          this.healP(p, (p.woundT > 0 ? 0.5 : 1) * p.mhp * (evo ? 0.15 : 0.11) * (1 + Math.min(1, (p.skillPow - 1) * 0.3)) * starBonus(p.star).skill ** 0.5);
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
            if (!isBoss(e)) {
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
          // 最近の2秒くらいで最大HPの1割以上ダメージを受けたときだけ張る（むだ打ちしない）
          if ((p.hurtAcc || 0) < p.mhp * 0.1) return false;
          p.hurtAcc = 0;
          // バリアは最大HPの14%（進化20%）を4秒
          p.shield = p.mhp * (evo ? 0.2 : 0.14) * (1 + Math.min(0.8, (p.skillPow - 1) * 0.25)) * starBonus(p.star).skill ** 0.5;
          p.shieldT = 4;
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
          this.enemiesIn(fx, fy, r, e => { this.damage(e, 24 * pw, p); if (!isBoss(e)) { e.stunT = evo ? 2.2 : 1.5; p.st.sn++; } });
          sk(r);
          return true;
        }
        case 'bless': {
          if (p.hp >= p.mhp * 0.95 && !anyNear(200)) return false;
          this.healP(p, p.mhp * (evo ? 0.3 : 0.2) * (p.woundT > 0 ? 0.5 : 1));
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
        if (e.el && !isBoss(e)) for (let i = 0; i < 5; i++) this.dropGem(e.x + rand(-50, 50), e.y + rand(-50, 50), e.xp / 5);
        if (e.ty === 15) this.bigDefeated(e, owner);
        else if (isNushi(e)) this.nushiDefeated(e, owner);
        else if (e.ty === 4) {
          if (owner) { owner.bossKills++; this.mark(owner, 'boss'); }
          for (let i = 0; i < 24; i++) this.dropGem(e.x + rand(-90, 90), e.y + rand(-90, 90), 4 + Math.floor(e.xp));
        } else if (FB_R[e.ty] !== undefined) {
          // フィールドボス：経験値の玉をどさっと
          if (owner) owner.bossKills++;
          const n = e.ty === 18 ? 10 : e.ty === 21 ? 14 : e.ty === 24 ? 18 : 22;
          for (let i = 0; i < n; i++) this.dropGem(e.x + rand(-80, 80), e.y + rand(-80, 80), e.xp * 5 / n);
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
        // 装備の弾は人にも当たる
        if (pr.pv && pr.o && pr.o.alive) {
          for (const q of this.players) {
            if (!this.foeOk(pr.o, q) || (pr.hit && pr.hit.has(q.id)) || (pr.vh && pr.vh.has(q.id))) continue;
            const rr = this.radius(q) * 0.8 + pr.r;
            if ((q.x - pr.x) ** 2 + (q.y - 20 - pr.y) ** 2 >= rr * rr) continue;
            if (pr.aoe) this.ev({ e: 'bm', x: r1(pr.x), y: r1(pr.y), r: pr.aoe });
            this.pvpHit(pr.o, q, pr.pv, pr.slow);
            (pr.hit || (pr.hit = new Set())).add(q.id);
            if (pr.vh) pr.vh.add(q.id);
            if (pr.aoe || --pr.pierce < 0) { gone = true; break; }
          }
          if (gone) { this.ev({ e: 'pd', id: pr.id, x: r1(pr.x), y: r1(pr.y) }); continue; }
        }
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
    dropGem(x, y, v, fx, fy) {
      v = Math.max(1, Math.round(v * 10) / 10);
      // 多すぎるときは一番古い玉を消して、倒した場所には必ず落とす（遠くの玉にまとめると落ちないように見える）
      if (this.gems.length >= GEM_CAP) {
        for (const o of this.gems.splice(0, this.gems.length - GEM_CAP + 1)) this.ev({ e: 'gc', id: o.id, p: 0, x: r1(o.x), y: r1(o.y) });
      }
      const g = { id: this.uid(), x: clamp(x, EDGE, WORLD.w - EDGE), y: clamp(y, EDGE, WORLD.h - EDGE), v, pull: null, age: 0 };
      this.gems.push(g);
      const ev = { e: 'gs', id: g.id, x: r1(g.x), y: r1(g.y), v };
      if (fx !== undefined) { ev.fx = r1(fx); ev.fy = r1(fy); } // 飛び出してくる元の場所
      this.ev(ev);
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
            const mg = p.magnet + (p.itMag || 0) + this.radius(p); // 体が大きいほど吸い寄せる範囲も広い
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
        ds: p.dashing ? 1 : undefined, wd: p.woundT > 0 ? 1 : undefined, aw: p.aw || undefined, cs: p.cs && p.cs.some(v => v) ? p.cs : undefined, tl: p.tl || undefined,
        hd: p.invT > 0 ? 1 : undefined, so: p.stoneT > 0 ? 1 : undefined, em: p.emoT > 0 ? p.emo : undefined,
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
      for (const en of this.enemies) base.E.push(en.id, en.ty + (en.el ? 64 : 0), r1(en.x), r1(en.y)); // 強敵は種類+64
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
        else if (half && p.a && !p.hd && (inR(p.x, p.y, RADAR_R) || p.bn)) s.q.push([p.id, p.x, p.y, p.lv + (p.ev ? 10 : 0), p.bn ? 1 : 0, p.b ? 0 : 1]); // 賞金首はどこにいても映る
      }
      if (half) {
        s.f = []; // レーダー用：遠くのボスとゴールドスライム
        for (let i = 0; i < base.E.length; i += 4) {
          const ty = base.E[i + 1], x = base.E[i + 2], y = base.E[i + 3], bt = ty & 63;
          if (inR(x, y, R)) s.e.push(base.E[i], ty, x, y);
          else if ((bt === 4 || bt === 7 || FB_R[bt] !== undefined) && inR(x, y, RADAR_R)) s.f.push(bt, Math.round(x), Math.round(y));
        }
        // 大妖はどこにいても：位置とHP（千分率）。いないときは次に現れるまでの秒数
        const B = this.big;
        if (B && !B.dead) s.bb = [Math.round(B.x), Math.round(B.y), Math.ceil(B.hp / B.mhp * 1000), B.lv || BIG_LV];
        else s.bbt = Math.max(0, Math.ceil(this.bigT));
        // ヌシ（どこにいても）：[x, y, HP千分率, レベル, 種類]
        const ns = this.nushi.filter(n => n && !n.dead);
        if (ns.length) s.wb = ns.map(n => [Math.round(n.x), Math.round(n.y), Math.ceil(n.hp / n.mhp * 1000), n.lv, n.ty]);
        // 妖気の渦（まわりにあるもの）：[x, y, 半径, 残り秒, 倍率×10]
        if (this.rifts.length) s.rz = this.rifts.filter(r => inR(r.x, r.y, RADAR_R)).map(r => [Math.round(r.x), Math.round(r.y), r.r, Math.ceil(r.t), Math.round(r.mul * 10)]);
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
        sta: Math.round((p => (p.sta === undefined ? DASH_TIME : p.sta) / DASH_TIME * 100)(me)) / 100, sl: me.staLock ? 1 : 0,
        scd: Math.round(clamp(me.scd / Math.max(SPECIES[me.sp].skill.minCd || 0, SPECIES[me.sp].skill.cd * me.skillCd * (me.evo ? 0.6 : 1) * starBonus(me.star).cd), 0, 1) * 100) / 100, st: me.star || 1,
        by: me.killedBy, dt: me.alive ? 0 : Math.round(me.deadT),
        hy: me.hyT ? Math.ceil(me.hyT) : 0, pt: Math.max(0, Math.ceil(this.paradeT)),
        cd: me.cardsV !== me.cardsSent || this.tick % 40 === 0 ? (me.cardsSent = me.cardsV, me.cards) : undefined,
        st: { dmg: me.dmgMul, rate: me.rateMul, extra: me.extra, pierce: me.pierce, sp: me.skillPow, tl: me.traitLv, bump: Math.round(this.bumpPower(me)) },
        // 左下に出す強さ：通常攻撃1発のダメージと弾の数、スキルの威力
        ad: Math.round(SPECIES[me.sp].atk.dmg * me.dmgMul * this.lvMul(me) * this.atkB(me)), an: (SPECIES[me.sp].atk.n || 1) + me.extra,
        sd: SKILL_BASE[SPECIES[me.sp].skill.id] ? Math.round(SKILL_BASE[SPECIES[me.sp].skill.id] * this.skillPw(me)) : 0,
        sc2: me.evo ? Math.round(clamp(me.scd2 / this.evoCd(me), 0, 1) * 100) / 100 : undefined,
        cn: me.cons && me.cons.length ? me.cons.map(k => [k, me.consUsed.includes(k) ? 1 : 0]) : undefined,
        pn: me.pins && me.pins.length ? me.pins : undefined, ivt: me.invT > 0 ? Math.ceil(me.invT) : undefined,
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

  // 装備アイテム（ガチャで手に入る）。t=種類, r=レアリティ。並び順は変えない（持ち物のセーブが番号なので、足すときは後ろに）
  // kind: orbit=体のまわりを回る / shot=弾を撃つ / zap=連鎖する雷 / wind=突風 / passive=持っているだけで効く
  // n=[数の基本, レアリティ1つごとに増える数]  pvp=人に当たったときの、相手の最大HPに対する割合
  const ITEMS = [
    { key: 'sword', name: '小剣', kind: 'orbit', dmg: 12, n: [3, 1], pvp: 0.03, role: '近接・対人',
      desc: 'まわりを回る刃。敵にも、ほかのプレイヤーにも当たる' },
    { key: 'magatama', name: '勾玉', kind: 'orbit', dmg: 6, n: [2, 1], heal: 0.004, def: [0.06, 0.03], role: '守り・回復',
      desc: '当たるたびにHP回復。受けるダメージも減る' },
    { key: 'redfire', name: '赤ファイア', kind: 'shot', dmg: 20, cd: 1.5, cdR: 0.05, n: [1, 0.5], speed: 520, life: 1.1, pr: 14, aoe: 95, pvp: 0.05, pk: 'i_fire', range: 560, role: '遠距離・爆発',
      desc: '近くの敵に火の玉。当たると爆発する（人にも当たる）' },
    { key: 'bluefire', name: '青ファイア', kind: 'shot', dmg: 10, cd: 1.1, cdR: 0.04, n: [3, 0.5], spread: 0.22, speed: 600, life: 0.9, pr: 12, pierce: 2, slow: 1.5, pvp: 0.025, pk: 'i_ice', range: 520, role: '遠距離・足止め',
      desc: '冷たい炎を3方向に。当たった敵も人も遅くなる' },
    { key: 'bow', name: '破魔弓', kind: 'shot', dmg: 34, cd: 2.0, cdR: 0.12, n: [1, 0.34], speed: 1100, life: 0.85, pr: 10, pierce: 3, hunt: 1, pvp: 0.08, pk: 'i_arrow', range: 900, role: '狙撃・対人',
      desc: '遠くのプレイヤーを優先して狙い撃つ。人に大ダメージ' },
    { key: 'taiko', name: '雷太鼓', kind: 'zap', dmg: 32, cd: 2.4, cdR: 0.1, n: [3, 1], pvp: 0.04, range: 420, role: '連鎖・群れ',
      desc: '雷が敵から敵へ飛び移る。群れにつよい' },
    { key: 'mirror', name: '八咫鏡', kind: 'passive', dmg: 10, show: 2, def: [0.1, 0.04], ref: [0.3, 0.15], role: '反射・守り',
      desc: '受けるダメージが減り、ぶつかってきた敵や人にダメージを返す' },
    { key: 'uchiwa', name: '天狗の羽団扇', kind: 'wind', dmg: 14, cd: 3.2, cdR: 0.15, R: 230, knock: 170, pvp: 0.03, role: '吹き飛ばし',
      desc: '突風でまわりの敵と人を吹き飛ばす。囲まれたときに' },
    { key: 'kozuchi', name: '打ち出の小槌', kind: 'passive', dmg: 0, show: 1, xp: [0.1, 0.05], mag: [60, 25], role: '成長・稼ぎ',
      desc: 'もらえる経験値が増え、遠くの玉も吸い寄せる' },
    { key: 'shuriken', name: '手裏剣', kind: 'shot', dmg: 9, cd: 1.3, cdR: 0.05, n: [4, 1], radial: 1, speed: 640, life: 0.75, pr: 11, pierce: 1, pvp: 0.02, pk: 'i_shuri', range: 450, role: '全方向',
      desc: '全方向に手裏剣を投げる。うしろの敵にも当たる' },
  ];
  // ---------- 覚醒（★5の妖怪にポイントを使って、少しずつ強くする。いつまでも上げられる） ----------
  const AWAKE_MAX = 100;
  const awakeCost = n => 500 + 250 * n;                 // n段目→n+1段目に必要なポイント（server.py と同じ）
  // 攻撃・スキルの倍率（25段で+30%、そこからはゆっくり。100段で+60%）。受けるダメージはその半分だけ減る
  const awakeBonus = aw => 1 + 0.012 * Math.min(aw || 0, 25) + 0.004 * Math.max(0, (aw || 0) - 25);
  // 覚醒のオーラの色（5段ごとに変わる）
  const AWAKE_COLORS = [0, 0x8fe8ff, 0x7cff8a, 0xffe07a, 0xff9a4a, 0xff5a8a, 0xc070ff, 0xffffff];

  // ---------- 着せ替え（強さは変わらない。server.py の COSMETICS と同じ順・同じ値段） ----------
  // 番号は「その種類の中の何番目か＋1」（0 = なし）でやりとりする
  const COSMETICS = {
    tint: [ // 妖怪の色
      { id: 'gold', name: '金色', price: 3000, col: 0xffd860 }, { id: 'shadow', name: '影', price: 2000, col: 0x8a7aaa },
      { id: 'sakura', name: '桜', price: 2000, col: 0xffb8d8 }, { id: 'ice', name: '氷', price: 2000, col: 0xa8e8ff },
      { id: 'rainbow', name: '虹', price: 8000, col: -1 },
    ],
    ring: [ // 足もとの輪
      { id: 'fire', name: '炎の輪', price: 1500, col: 0xff6a2a }, { id: 'sakura', name: '桜の輪', price: 1500, col: 0xff9ad0 },
      { id: 'star', name: '星の輪', price: 1500, col: 0x7ae8ff }, { id: 'gold', name: '金の輪', price: 3000, col: 0xffd84f },
    ],
    kfx: [ // 倒したときの演出
      { id: 'hanabi', name: '花火', price: 2000 }, { id: 'sakura', name: '桜吹雪', price: 2000 }, { id: 'kaminari', name: '雷鳴', price: 2000 },
    ],
    nm: [ // 名前の色
      { id: 'red', name: '紅', price: 500, css: '#ff7a6a' }, { id: 'blue', name: '蒼', price: 500, css: '#7ab8ff' },
      { id: 'gold', name: '金', price: 2000, css: '#ffd84f' }, { id: 'rainbow', name: '虹', price: 5000, css: '' },
    ],
  };
  const COS_SLOTS = ['tint', 'ring', 'kfx', 'nm'];
  const COS_SLOT_NAME = { tint: '妖怪の色', ring: '足もとの輪', kfx: '倒したときの演出', nm: '名前の色' };

  // ---------- 実績と称号（server.py の ACHIEVEMENTS と同じ順。称号の番号＝順番＋1） ----------
  // stat: k=倒した敵 b=ボス pk=プレイヤー bb=大妖 bt=賞金首 lv=最高レベル t=遊んだ秒 ch=持っている妖怪 s5=★5の数 it=装備の種類 aw=覚醒の合計 w1=週間1位
  const ACHIEVEMENTS = [
    { id: 'k1', stat: 'k', goal: 1000, title: '妖怪退治人', pts: 300 },
    { id: 'k2', stat: 'k', goal: 10000, title: '百鬼殺し', pts: 1000 },
    { id: 'k3', stat: 'k', goal: 100000, title: '千鬼殺し', pts: 3000 },
    { id: 'b1', stat: 'b', goal: 10, title: 'ボスハンター', pts: 500 },
    { id: 'b2', stat: 'b', goal: 100, title: '鬼神', pts: 2000 },
    { id: 'p1', stat: 'pk', goal: 10, title: '腕自慢', pts: 500 },
    { id: 'p2', stat: 'pk', goal: 100, title: '修羅', pts: 2000 },
    { id: 'bb', stat: 'bb', goal: 1, title: '大妖討伐者', pts: 1500 },
    { id: 'bt', stat: 'bt', goal: 5, title: '賞金稼ぎ', pts: 1000 },
    { id: 'l1', stat: 'lv', goal: 100, title: '百段', pts: 800 },
    { id: 'l2', stat: 'lv', goal: 200, title: '天上', pts: 2000 },
    { id: 't1', stat: 't', goal: 36000, title: '常連', pts: 1000 },
    { id: 'c1', stat: 'ch', goal: 13, title: '妖怪コレクター', pts: 1500 },
    { id: 'c2', stat: 's5', goal: 5, title: '絆の主', pts: 2000 },
    { id: 'i1', stat: 'it', goal: 25, title: '蒐集家', pts: 1000 },
    { id: 'i2', stat: 'it', goal: 50, title: '宝物庫の主', pts: 3000 },
    { id: 'a1', stat: 'aw', goal: 10, title: '覚醒者', pts: 1000 },
    { id: 'a2', stat: 'aw', goal: 50, title: '真なる覚醒', pts: 3000 },
    { id: 'w1', stat: 'w1', goal: 1, title: '週間王者', pts: 0 },
  ];
  // 妖怪ごとの称号（その妖怪で遊んだときだけ数える）。server.py と同じ順
  const SPECIES_ACH = [
    ['gekomaru', 'k', 5000, '大食らい'], ['suzune', 'dist', 1000000, '韋駄天'], ['maimai', 'hl', 100000, 'タフネス'],
    ['rangyo', 'lv', 300, '大器晩成'], ['kodama', 'pk', 50, '辻斬り'], ['kohaku', 'dg', 300, '月下の舞'],
    ['kuroro', 'b', 50, '千里眼'], ['uroko', 'su', 3000, '毒蛇の主'], ['komori', 'sa', 100000, '鉄壁の守護者'],
    ['toosibi', 'k', 10000, '業火'], ['nejimaru', 'su', 3000, 'からくり師'], ['hakua', 'sn', 3000, '白き王'],
    ['sinonome', 'rv', 20, '不死鳥'],
  ];
  for (const [sp, stat, goal, title] of SPECIES_ACH) ACHIEVEMENTS.push({ id: 'sp_' + sp, stat: sp + ':' + stat, goal, title, pts: 1500, sp });
  const ACH_STAT_NAME = { hl: '回復した量', sa: 'バリアで防いだダメージ', su: 'スキルを使った回数', dist: '走った距離', dg: 'よけた回数', sn: '気絶させた敵', rv: '復活した回数', k: '倒した敵', b: 'たおしたボス', pk: 'たおしたプレイヤー', bb: '大妖の討伐', bt: '賞金首の討伐', lv: '最高レベル', t: '遊んだ時間', ch: '持っている妖怪', s5: '★5の妖怪', it: '集めた装備', aw: '覚醒の合計', w1: '週間ランキング1位' };

  // ＋強化：同じ装備が2個目で+1…最大+5。1つにつき威力・効果 +12%
  const ITEM_PLUS_MAX = 5, ITEM_PLUS_STEP = 0.12;
  // 妖怪と装備の組み合わせ（ゲームの中では秘密。装備したときに「組み合わせ効果アップ！」で分かる）
  const COMBOS = { gekomaru: 'magatama', suzune: 'uchiwa', maimai: 'mirror', rangyo: 'kozuchi', kodama: 'sword', kohaku: 'shuriken',
    kuroro: 'bow', uroko: 'bluefire', komori: 'mirror', toosibi: 'redfire', nejimaru: 'taiko', hakua: 'taiko', sinonome: 'magatama' };
  const COMBO_POW = 1.3, COMBO_CD = 0.85;
  const isCombo = (sp, t) => !!ITEMS[t] && COMBOS[sp] === ITEMS[t].key;
  // そのレアリティでの数（回る数・弾の数・雷が飛び移る回数）
  function itemCount(t, r) {
    const d = ITEMS[t];
    if (!d.n) return d.show || 1;
    return Math.max(1, Math.floor(d.n[0] + d.n[1] * r + 1e-6));
  }
  // 体のまわりに見せる数
  function itemShow(t, r) {
    const d = ITEMS[t];
    if (d.kind === 'orbit') return itemCount(t, r);
    return d.show || 2;
  }
  // 説明（UIで使う）。そのレアリティでの数値つき
  function itemInfo(t, r) {
    const d = ITEMS[t], ra = RARITIES[r], pct = v => Math.round(v * 100) + '%';
    const out = [];
    if (d.kind === 'orbit') out.push(`回る数 ${itemCount(t, r)}`);
    if (d.kind === 'shot') out.push(`${itemCount(t, r)}発 / ${(d.cd - (d.cdR || 0) * r).toFixed(1)}秒`);
    if (d.kind === 'zap') out.push(`${itemCount(t, r)}体に連鎖 / ${(d.cd - (d.cdR || 0) * r).toFixed(1)}秒`);
    if (d.kind === 'wind') out.push(`半径${d.R + 20 * r} / ${(d.cd - (d.cdR || 0) * r).toFixed(1)}秒`);
    if (d.dmg && d.kind !== 'passive') out.push(`威力 ${Math.round(d.dmg * ra.pow)}`);
    if (d.def) out.push(`被ダメ -${pct(d.def[0] + d.def[1] * r)}`);
    if (d.ref) out.push(`反射 ${pct(d.ref[0] + d.ref[1] * r)}`);
    if (d.xp) out.push(`経験値 +${pct(d.xp[0] + d.xp[1] * r)}`);
    if (d.mag) out.push(`吸い寄せ +${d.mag[0] + d.mag[1] * r}`);
    if (d.pvp) out.push(`対人 ${(d.pvp * ra.pow * 100).toFixed(1)}%/発`);
    return out.join('・');
  }
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
    'hpCards', 'dmgMul', 'rateMul', 'extra', 'pierce', 'skillPow', 'skillCd', 'areaMul', 'magnet', 'regen', 'bumpMul', 'traitLv', 'revived', 'cards', 'lifeT'];

  // ---------- 妖怪ガチャと★（server.py と同じ内容） ----------
  // はじめから持っている妖怪。ほかはガチャで手に入る
  const STARTERS = ['gekomaru', 'maimai', 'suzune'];
  // レア度（0:★ 1:★★ 2:★★★ 3:★★★★）と出る確率
  const CHARA_RARITY = { gekomaru: 0, maimai: 0, suzune: 0, kodama: 0, kohaku: 0, rangyo: 1, uroko: 1, kuroro: 1, nejimaru: 2, hakua: 2, komori: 2, toosibi: 3, sinonome: 3 };
  const CHARA_RATES = [50, 30, 15, 5];
  // 同じ妖怪が出たら★が上がる：★1→2に1体、→3に2体、→4に4体、→5に8体（倍々）
  const STAR_NEED = [1, 2, 4, 8];
  const starOf = dups => { let st = 1, acc = 0; for (const n of STAR_NEED) { acc += n; if (dups >= acc) st++; } return st; };
  // ★の強さ：攻撃・スキル威力・スキルの待ち時間・受けるダメージ。★5で特性も覚醒
  function starBonus(st) {
    const b = clamp((st || 1) - 1, 0, 4);
    return { atk: 1 + 0.06 * b, skill: 1 + 0.15 * b + (b >= 4 ? 0.25 : 0), cd: 1 - 0.05 * b, def: 1 - 0.04 * b, awake: b >= 4 };
  }

  // モンスターの解放：累計で獲得した経験値で順に解放（強いモンスターほど後ろ）
  const UNLOCKS = [
    ['gekomaru', 0], ['maimai', 0], ['suzune', 0],
    ['kodama', 500], ['kohaku', 1200], ['rangyo', 2000], ['uroko', 3000], ['kuroro', 4500],
    ['nejimaru', 6500], ['hakua', 9000], ['komori', 12000], ['toosibi', 16000], ['sinonome', 22000],
  ];
  const UNLOCK_AT = {}; UNLOCKS.forEach(([k, v]) => { UNLOCK_AT[k] = v; });

  global.GD = {
    EVO_SKILLS, SKILL_BASE, SKILL_PCT, CONSUMABLES, CONS_SLOTS, EMOTES, PINS, SPECIES_ACH,
    UNLOCKS, UNLOCK_AT, ITEMS, RARITIES, ORBIT_SPEED, RIFT_LV, NUSHI_NAME, DASH_TIME, DASH_RECHARGE, DASH_MUL, itemCount, itemShow, itemInfo, isCombo, AWAKE_MAX, awakeCost, awakeBonus, AWAKE_COLORS, COSMETICS, COS_SLOTS, COS_SLOT_NAME, ACHIEVEMENTS, ACH_STAT_NAME, ITEM_PLUS_MAX, ITEM_PLUS_STEP, STARTERS, CHARA_RARITY, CHARA_RATES, STAR_NEED, starOf, starBonus,
    WORLD, TICK, EDGE, VIEW_R, RADAR_R, MAX_PLAYERS, EVOLVE_LV, PROTECT_TIME, NEWBIE_LV, generateMap, resolve, auraTier,
    SPECIES, SPECIES_KEYS, ENEMY_TYPES, ENEMIES, UPGRADES, COLORS, upgradeText,
    xpNeed, clamp,
  };
  global.GameSim = GameSim;
})(typeof window !== 'undefined' ? window : globalThis);
