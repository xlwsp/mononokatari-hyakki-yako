// Render などで「yarn start / npm start」したときの入口。
// ゲームサーバー本体は Python（server.py・標準ライブラリだけ）なので、python3 で起動する。
// ポートは Render が渡す PORT（なければ 8000）。ゲームの計算は Node.js（tools/sim_node.js）で動く。
'use strict';
const { spawn, spawnSync } = require('child_process');
const path = require('path');

const root = path.join(__dirname, '..');
const port = String(process.env.PORT || 8000);
const py = ['python3', 'python'].find(c => spawnSync(c, ['--version']).status === 0);
if (!py) {
  console.error('python3 が見つかりません。Render の Runtime を Docker にするか、Python が入った環境で動かしてください。');
  process.exit(1);
}
console.log(`starting server.py with ${py} on port ${port}`);
const child = spawn(py, ['-u', 'server.py', port], { cwd: root, stdio: 'inherit', env: process.env });
const stop = sig => { try { child.kill(sig); } catch (e) { /* noop */ } };
process.on('SIGTERM', () => stop('SIGTERM'));
process.on('SIGINT', () => stop('SIGINT'));
child.on('exit', code => process.exit(code == null ? 1 : code));
