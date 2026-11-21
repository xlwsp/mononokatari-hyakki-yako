// サーバー側で「ずっと続く世界」を計算するドライバー（macOS 標準の JavaScriptCore "jsc" で実行）
// server.py から 1 行 = 1 ティック分の指示を受け取り、ゲームを進めて結果を返す。
//   1行目: {"seed":..}
//   以降  : {"join":[[id,name,sp,save]],"leave":[id],"respawn":[[id,sp]],"in":{"id":[x,y]},"ch":[[id,seq,idx]]}
//   出力  : 毎ティック "id<TAB>json" を人数分、最後に "."
//           セーブは "!S<TAB>id<TAB>json"（2秒ごと・抜けるとき。やられていたら null）
//           ハイスコアは "!H<TAB>id<TAB>json"、ガチャポイントは "!P<TAB>id<TAB>数"
//           賞金首を倒した人は "!B<TAB>id"、お題用の数は "!M<TAB>id<TAB>json"（5秒ごと）
var window = this;
load(arguments[0] + '/js/sim.js');

var cfg = JSON.parse(readline());
var sim = new GameSim(cfg.seed);
for (var i = 0; i < 24; i++) sim.manageBots(); // 最初からBotがいる状態で始める
var humans = [];
var errors = 0;
function saveLine(id) {
  var p = sim.pmap.get(id);
  if (p) print('!S\t' + id + '\t' + JSON.stringify(sim.exportSave(p)));
  scoreLine(p);
}
// ハイスコア用：今のスコア
var wasAlive = {};
function scoreLine(p) {
  if (p && p.score > 0) print('!H\t' + p.id + '\t' + JSON.stringify({ sc: p.score, sp: p.sp, lv: p.lv, ev: p.evo }));
}

for (;;) {
  var line = readline();
  if (line === null || line === undefined || line === 'q') break;
  var cmd;
  try { cmd = JSON.parse(line); } catch (e) { cmd = {}; }
  try {
    if (cmd.join) cmd.join.forEach(function (j) { sim.join(j[0], j[1], j[2], j[3] || null, j[4] || null); if (humans.indexOf(j[0]) < 0) humans.push(j[0]); });
    if (cmd.leave) cmd.leave.forEach(function (id) { saveLine(id); sim.remove(id); humans = humans.filter(function (h) { return h !== id; }); });
    if (cmd.respawn) cmd.respawn.forEach(function (r) { sim.respawn(r[0], r[1], r[2] || null); });
    if (cmd.in) for (var id in cmd.in) sim.setInput(id, cmd.in[id][0], cmd.in[id][1], cmd.in[id][2]);
    if (cmd.ch) cmd.ch.forEach(function (c) { sim.choose(c[0], c[1], c[2]); });
    sim.step(GD.TICK);
    if (sim.tick % 40 === 0) humans.forEach(saveLine);
    humans.forEach(function (id) { // やられた瞬間のスコアも記録
      var p = sim.pmap.get(id);
      if (p && wasAlive[id] && !p.alive) scoreLine(p);
      wasAlive[id] = !!(p && p.alive);
    });
  } catch (e) { if (errors++ < 20) print('#err ' + e + ' ' + (e.stack || '')); }
  if (true) { // 毎ティック（1秒に20回）送ってなめらかに
    var base = sim.snapshot();
    base.ev.forEach(function (e) {
      if (e.e === 'pt') print('!P\t' + e.p + '\t' + e.n); // ガチャポイント
      else if (e.e === 'btk' && humans.indexOf(e.k) >= 0) print('!B\t' + e.k); // 賞金首を倒した → 装備ドロップ
      else if (e.e === 'bbk' && humans.indexOf(e.p) >= 0) print('!K\t' + e.p); // 大妖を倒した（実績）
    });
    // 毎日のお題用：5秒ごとに、倒した数などの今の値
    if (sim.tick % 100 === 0) humans.forEach(function (id) {
      var p = sim.pmap.get(id);
      if (p) print('!M\t' + id + '\t' + JSON.stringify({ k: p.kills, b: p.bossKills, pk: p.pkills, lv: p.lv, a: p.alive ? 1 : 0 }));
    });
    humans.forEach(function (id) {
      var s = sim.snapshotFor(base, id);
      if (s) print(id + '\t' + JSON.stringify(s));
    });
  }
  print('.');
}
