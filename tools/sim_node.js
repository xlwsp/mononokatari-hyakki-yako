// sim_driver.js を Node.js で動かすための入れ物（macOS 以外、たとえば Render のサーバー用）
// jsc にある readline / print / load / arguments を Node.js で用意してから、sim_driver.js をそのまま実行する。
//   使い方: node tools/sim_node.js <ゲームのフォルダ>
'use strict';
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const { StringDecoder } = require('string_decoder');

const root = process.argv[2] || path.join(__dirname, '..');
const pause = new Int32Array(new SharedArrayBuffer(4));
const sleep = ms => Atomics.wait(pause, 0, 0, ms);

// 1行ずつ読む（読めるまで待つ。終わりなら null）
const chunk = Buffer.alloc(1 << 16);
const dec = new StringDecoder('utf8');
let inBuf = '';
globalThis.readline = function () {
  for (;;) {
    const i = inBuf.indexOf('\n');
    if (i >= 0) { const l = inBuf.slice(0, i); inBuf = inBuf.slice(i + 1); return l; }
    let n;
    try { n = fs.readSync(0, chunk, 0, chunk.length, null); } catch (e) {
      if (e.code === 'EAGAIN') { sleep(2); continue; }
      if (e.code === 'EOF') return null;
      throw e;
    }
    if (n === 0) return inBuf.length ? (() => { const l = inBuf; inBuf = ''; return l; })() : null;
    inBuf += dec.write(chunk.subarray(0, n));
  }
};

// 書き出し：1ティック分（最後の "."）までためて、まとめて書く
let out = [];
function writeAll(s) {
  const b = Buffer.from(s, 'utf8');
  let off = 0;
  while (off < b.length) {
    try { off += fs.writeSync(1, b, off, b.length - off); } catch (e) { if (e.code === 'EAGAIN') { sleep(2); continue; } throw e; }
  }
}
globalThis.print = function (...a) {
  const s = a.join(' ');
  out.push(s);
  if (s === '.' || out.length > 2000) { writeAll(out.join('\n') + '\n'); out = []; }
};
globalThis.load = p => vm.runInThisContext(fs.readFileSync(p, 'utf8'), { filename: p });
globalThis.arguments = [root];

const driver = path.join(__dirname, 'sim_driver.js');
vm.runInThisContext(fs.readFileSync(driver, 'utf8'), { filename: driver });
if (out.length) writeAll(out.join('\n') + '\n');
