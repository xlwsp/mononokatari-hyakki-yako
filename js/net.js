// 通信まわり：サーバーとの WebSocket 接続。ゲームの計算はサーバーで行い、ここでは受け取って表示するだけ。
(function () {
  'use strict';

  class Relay {
    constructor(url) {
      this.handlers = {};
      this.ws = new WebSocket(url);
      this.ws.onmessage = ev => {
        let m;
        try { m = JSON.parse(ev.data); } catch (e) { return; }
        (this.handlers[m.t] || []).slice().forEach(h => h(m));
      };
      this.ws.onclose = () => (this.handlers.close || []).slice().forEach(h => h({ t: 'close' }));
      this.ws.onerror = () => (this.handlers.error || []).slice().forEach(h => h({ t: 'error' }));
      this.ws.onopen = () => (this.handlers.open || []).slice().forEach(h => h({ t: 'open' }));
    }
    on(t, fn) {
      (this.handlers[t] || (this.handlers[t] = [])).push(fn);
      return () => { this.handlers[t] = (this.handlers[t] || []).filter(h => h !== fn); };
    }
    send(obj) {
      if (this.ws.readyState === 1) this.ws.send(JSON.stringify(obj));
    }
    close() {
      this.handlers = {};
      try { this.ws.close(); } catch (e) { /* noop */ }
    }
  }

  // ずっと続く世界への参加
  class Session {
    constructor({ myId, seed, relay, sp, name }) {
      this.myId = myId;
      this.seed = seed;
      this.relay = relay;
      this.sp = sp;
      this.name = name;
      this.pending = [];
      this._onSnap = null;
      this.onLost = null;
      this.lastSend = 0;
      this.unsubs = [
        relay.on('st', m => { if (this._onSnap) this._onSnap(m.s); else { this.pending.push(m.s); if (this.pending.length > 20) this.pending.shift(); } }),
        relay.on('reset', () => this.onLost && this.onLost('サーバーの世界が作り直されました')),
        relay.on('close', () => this.onLost && this.onLost('サーバーとの接続が切れました')),
      ];
    }
    set onSnapshot(fn) { this._onSnap = fn; if (fn) { this.pending.forEach(fn); this.pending = []; } }
    sendInput(x, y) {
      const now = performance.now();
      if (now - this.lastSend < 45) return;
      this.lastSend = now;
      this.relay.send({ t: 'in', x: Math.round(x), y: Math.round(y) });
    }
    choose(seq, idx) { this.relay.send({ t: 'ch', s: seq, i: idx }); }
    respawn(sp) { this.sp = sp; this.relay.send({ t: 'respawn', sp }); }
    leave() {
      this.unsubs.forEach(u => u());
      this.relay.send({ t: 'leave' });
      this.relay.close();
    }
  }

  // つなぎ先のサーバーを決める。
  // GitHub Pages（〇〇.github.io）から開いたときは、リポジトリの server.json に書かれた今のサーバーへつなぐ
  async function serverUrl() {
    if (!/\.github\.io$/.test(location.hostname)) {
      return (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws';
    }
    const owner = location.hostname.split('.')[0];
    const repo = location.pathname.split('/').filter(Boolean)[0] || (owner + '.github.io');
    // GitHub の API から読む（ページのキャッシュに左右されず、いつも最新）。server ブランチに置いてある
    const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/server.json?ref=server&t=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) throw new Error('サーバーの場所がわかりませんでした');
    const j = await res.json();
    const info = JSON.parse(decodeURIComponent(escape(atob(j.content.replace(/\s/g, '')))));
    if (!info.ws) throw new Error('サーバーが起動していません');
    return info.ws;
  }

  // この端末の合言葉（セーブの持ち主を見分ける。ほかの人には見えない）
  function token() {
    let t = null;
    try { t = localStorage.getItem('nakama_tok'); } catch (e) { /* noop */ }
    if (!t || !/^[0-9a-f]{32}$/.test(t)) {
      const a = new Uint8Array(16);
      crypto.getRandomValues(a);
      t = Array.from(a, b => b.toString(16).padStart(2, '0')).join('');
      try { localStorage.setItem('nakama_tok', t); } catch (e) { /* noop */ }
    }
    return t;
  }

  let urlCache = null;
  const getUrl = () => (urlCache || (urlCache = serverUrl().catch(e => { urlCache = null; throw new Error(e.message || 'サーバーの場所がわかりませんでした'); })));

  // サーバーにつないで世界に参加する。cont=true なら続きから。成功したら Session を返す
  function connect(name, sp, cont) {
    return getUrl().then(url => openSession(url, name, sp, cont)).catch(e => { urlCache = null; throw e; });
  }

  // サーバーに1回だけ質問して答えをもらう
  function ask(q, a) {
    return getUrl().then(url => new Promise((resolve, reject) => {
      let relay;
      try { relay = new Relay(url); } catch (e) { reject(e); return; }
      const timer = setTimeout(() => { relay.close(); reject(new Error('timeout')); }, 8000);
      relay.on('open', () => relay.send({ t: q, tok: token() }));
      relay.on(a, m => { clearTimeout(timer); relay.close(); resolve(m.d || null); });
      relay.on('error', () => { clearTimeout(timer); reject(new Error('error')); });
    }));
  }
  // 続きからのデータがあるか（{sp, lv, ev} か null）
  const saveInfo = () => ask('save?', 'save');
  // ハイスコアランキング（{list, mine, total}）
  const highScores = () => ask('hs?', 'hs');

  function openSession(url, name, sp, cont) {
    return new Promise((resolve, reject) => {
      if (location.protocol === 'file:') { reject(new Error('server.py を起動して http://localhost:8000 を開いてね')); return; }
      let relay;
      try { relay = new Net.Relay(url); } catch (e) { reject(new Error('サーバーに接続できませんでした')); return; }
      const offs = [];
      const done = () => offs.forEach(f => f());
      const timer = setTimeout(() => { done(); relay.close(); reject(new Error('サーバーが応答しません')); }, 10000);
      offs.push(relay.on('open', () => relay.send({ t: 'join', name, sp, tok: token(), cont: !!cont })));
      offs.push(relay.on('joined', m => {
        clearTimeout(timer); done();
        const ss = new Session({ myId: m.id, seed: m.seed, relay, sp, name }); ss.cont = !!m.cont; if (m.sp) ss.sp = m.sp; resolve(ss);
      }));
      offs.push(relay.on('full', () => { clearTimeout(timer); done(); relay.close(); reject(new Error('満員です（最大50人）。少し待ってね')); }));
      offs.push(relay.on('error', () => { clearTimeout(timer); done(); reject(new Error('サーバーに接続できませんでした（今はサーバーが止まっているかも）')); }));
    });
  }

  window.Net = { Relay, Session, connect, saveInfo, highScores };
})();
