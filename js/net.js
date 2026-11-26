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
      this.chat = []; this.onSay = null; // 全体チャット
      this.notes = []; this.onNote = null;
      this.unsubs = [
        relay.on('st', m => { if (this._onSnap) this._onSnap(m.s); else { this.pending.push(m.s); if (this.pending.length > 20) this.pending.shift(); } }),
        relay.on('say', m => { this.chatOn = true; (m.h || []).forEach(r => { this.chat.push(r); if (this.chat.length > 30) this.chat.shift(); }); if (this.onSay) this.onSay(m.h || []); }),
        relay.on('note', m => { if (this.onNote) this.onNote(m); else this.notes.push(m); }), // お題クリア・賞金首のドロップ
        relay.on('reset', () => this.onLost && this.onLost('サーバーの世界が作り直されました')),
        relay.on('maint', () => this.onLost && this.onLost('🔧 メンテナンス中です')),
        relay.on('close', () => this.onLost && this.onLost('サーバーとの接続が切れました')),
      ];
    }
    // 画面の準備中にたまった分は、新しい数個だけ渡す（一度に大量に処理して固まらないように）
    set onSnapshot(fn) { this._onSnap = fn; if (fn) { this.pending.slice(-3).forEach(fn); this.pending = []; } }
    sendInput(x, y, dash) {
      const now = performance.now();
      if (now - this.lastSend < 45 && !!dash === !!this.lastDash) return; // ダッシュの押し始め・終わりはすぐ送る
      this.lastSend = now; this.lastDash = !!dash;
      this.relay.send(dash ? { t: 'in', x: Math.round(x), y: Math.round(y), d: 1 } : { t: 'in', x: Math.round(x), y: Math.round(y) });
    }
    useItem(i) { this.relay.send({ t: 'use', i }); }
    emote(i) { this.relay.send({ t: 'emo', i }); }
    lock(on) { this.relay.send({ t: 'lock', on: on ? 1 : 0 }); }
    say(text) { this.relay.send({ t: 'say', m: String(text).slice(0, 60) }); }
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
    // GitHub の API から読む（いつも最新）。server ブランチに置いてある。
    // API は同じネット回線から1時間に60回までなので、断られたら raw（回数制限なし・最大5分前の内容）から読む
    let info = null;
    try {
      const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/server.json?ref=server&t=${Date.now()}`, { cache: 'no-store' });
      if (res.ok) { const j = await res.json(); info = JSON.parse(decodeURIComponent(escape(atob(j.content.replace(/\s/g, ''))))); }
    } catch (e) { /* 下で raw を試す */ }
    if (!info) {
      const res = await fetch(`https://raw.githubusercontent.com/${owner}/${repo}/server/server.json?t=${Date.now()}`, { cache: 'no-store' });
      if (!res.ok) throw new Error('サーバーの場所がわかりませんでした');
      info = await res.json();
    }
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

  // サーバーの場所（GitHub に1時間60回までしか聞けないので、聞き直しは30秒に1回まで）
  let urlCache = null, lastUrl = null, lastAsk = 0, lastErr = null;
  const getUrl = () => {
    if (urlCache) return urlCache;
    if (lastAsk && performance.now() - lastAsk < 30000) {
      if (lastUrl) return (urlCache = Promise.resolve(lastUrl));
      return Promise.reject(new Error(lastErr || 'サーバーが起動していません'));
    }
    lastAsk = performance.now();
    return (urlCache = serverUrl().then(u => { lastErr = null; return (lastUrl = u); })
      .catch(e => { urlCache = null; lastUrl = null; lastErr = e.message || 'サーバーの場所がわかりませんでした'; throw new Error(lastErr); }));
  };

  // サーバーにつないで世界に参加する。cont=true なら続きから。成功したら Session を返す
  function connect(name, sp, cont) {
    return getUrl().then(url => openSession(url, name, sp, cont)).catch(e => { urlCache = null; throw e; });
  }

  // サーバーに1回だけ質問して答えをもらう
  function ask(q, a, extra) {
    return getUrl().then(url => new Promise((resolve, reject) => {
      let relay;
      try { relay = new Relay(url); } catch (e) { reject(e); return; }
      const timer = setTimeout(() => { relay.close(); reject(new Error('timeout')); }, 8000);
      relay.on('open', () => relay.send(Object.assign({ t: q, tok: token() }, extra || {})));
      relay.on(a, m => { clearTimeout(timer); relay.close(); resolve(m.d || null); });
      relay.on('error', () => { clearTimeout(timer); reject(new Error('error')); });
    })).catch(e => { urlCache = null; throw e; }); // つながらなかったら、次はサーバーの場所から調べ直す（URLが変わっていることがある）
  }
  // 続きからのデータがあるか（{sp, lv, ev} か null）
  const saveInfo = () => ask('save?', 'save');
  // ハイスコアランキング（{list, mine, total}）
  const highScores = weekly => ask('hs?', 'hs', weekly ? { w: 1 } : null);
  // ガチャポイント・持ち物・装備（{pts, inv, eq, cost, got}）
  // texp：前の「累計EXPで解放」の記録（サーバーが1回だけ妖怪を引きつぐ）
  const legacy = () => { try { return parseInt(localStorage.getItem('nakama_texp') || '0', 10) || 0; } catch (e) { return 0; } };
  const profile = () => ask('prof?', 'prof', { texp: legacy() });
  const gacha = (n, k) => ask('gacha', 'prof', { n: n || 1, k: k || 'chara', texp: legacy() });
  const equip = (sp, key) => ask('equip', 'prof', { sp, key });
  // やりこみ：覚醒・着せ替え（buy=買う / 着がえ i=0 ではずす）・称号
  const awaken = sp => ask('awake', 'prof', { sp });
  const cosmetic = (slot, i, buy) => ask('cos', 'prof', { slot, i, buy: buy ? 1 : 0 });
  const title = i => ask('title', 'prof', { i });
  // 道具屋：買う（n個）／持っていく道具をえらぶ（最大3種類）
  const consBuy = (k, n) => ask('cons', 'prof', { k, n: n || 1 });
  const consBag = bag => ask('bag', 'prof', { bag });
  // 戦績（{best, runs, top_sc, top_pk}）
  const records = () => ask('rec?', 'rec');
  // ご意見・バグ報告を運営に送る（{ok} か {wait}）
  const feedback = d => ask('fb', 'fbok', d);
  // サーバーの様子（{maint: true/false}）
  const ping = () => ask('ping', 'pong');

  function openSession(url, name, sp, cont) {
    return new Promise((resolve, reject) => {
      if (location.protocol === 'file:') { reject(new Error('server.py を起動して http://localhost:8765 を開いてね')); return; }
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
      offs.push(relay.on('maint', () => { clearTimeout(timer); done(); relay.close(); const e = new Error('メンテナンス中です'); e.maint = true; reject(e); }));
      offs.push(relay.on('full', () => { clearTimeout(timer); done(); relay.close(); reject(new Error('満員です（最大50人）。少し待ってね')); }));
      offs.push(relay.on('error', () => { clearTimeout(timer); done(); reject(new Error('サーバーに接続できませんでした（今はサーバーが止まっているかも）')); }));
    });
  }

  window.Net = { Relay, Session, connect, saveInfo, highScores, profile, gacha, equip, awaken, cosmetic, title, feedback, ping, consBuy, consBag, records };
})();
