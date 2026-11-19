// サーバー側で「ずっと続く世界」を計算するドライバー（macOS 標準の JavaScriptCore "jsc" で実行）
// server.py から 1 行 = 1 ティック分の指示を受け取り、ゲームを進めて結果を返す。
//   1行目: {"seed":..}
//   以降  : {"join":[[id,name,sp]],"leave":[id],"respawn":[[id,sp]],"in":{"id":[x,y]},"ch":[[id,seq,idx]]}
//   出力  : 毎ティック "id<TAB>json" を人数分、最後に "."
var window = this;
load(arguments[0] + '/js/sim.js');

var cfg = JSON.parse(readline());
var sim = new GameSim(cfg.seed);
for (var i = 0; i < 24; i++) sim.manageBots(); // 最初からBotがいる状態で始める
var humans = [];
var errors = 0;

for (;;) {
  var line = readline();
  if (line === null || line === undefined || line === 'q') break;
  var cmd;
  try { cmd = JSON.parse(line); } catch (e) { cmd = {}; }
  try {
    if (cmd.join) cmd.join.forEach(function (j) { sim.join(j[0], j[1], j[2]); if (humans.indexOf(j[0]) < 0) humans.push(j[0]); });
    if (cmd.leave) cmd.leave.forEach(function (id) { sim.remove(id); humans = humans.filter(function (h) { return h !== id; }); });
    if (cmd.respawn) cmd.respawn.forEach(function (r) { sim.respawn(r[0], r[1]); });
    if (cmd.in) for (var id in cmd.in) sim.setInput(id, cmd.in[id][0], cmd.in[id][1]);
    if (cmd.ch) cmd.ch.forEach(function (c) { sim.choose(c[0], c[1], c[2]); });
    sim.step(GD.TICK);
  } catch (e) { if (errors++ < 20) print('#err ' + e + ' ' + (e.stack || '')); }
  if (true) { // 毎ティック（1秒に20回）送ってなめらかに
    var base = sim.snapshot();
    humans.forEach(function (id) {
      var s = sim.snapshotFor(base, id);
      if (s) print(id + '\t' + JSON.stringify(s));
    });
  }
  print('.');
}
