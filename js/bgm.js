// BGM（WebAudio でその場で演奏。音声ファイル不要）
// 和の音階（都節：レ・ミ♭・ソ・ラ・シ♭）で、太鼓・三味線・琴風の音を重ねた妖怪っぽい曲。
// 百鬼夜行やボスが近いときは、テンポが上がって太鼓が激しくなる。
(function () {
  'use strict';
  const D4 = 293.66;
  const f = semi => D4 * Math.pow(2, semi / 12);
  const _ = null;
  // メロディ（16分音符×16＝1小節、4小節でひと回り）。数字はレからの半音
  const MEL_A = [
    12, _, _, 8, 7, _, 8, _, 7, _, 5, _, 1, _, _, _,
    0, _, 1, _, 5, _, 7, _, 8, _, 7, _, 5, _, _, _,
    12, _, 13, _, 12, _, 8, _, 7, _, 5, _, 7, _, 8, _,
    7, _, _, _, 5, _, 1, _, 0, _, _, _, _, _, _, _,
  ];
  const MEL_B = [
    17, _, _, _, 13, _, 12, _, 8, _, _, _, 7, _, 8, _,
    12, _, _, _, 8, _, 7, _, 5, _, 7, _, 1, _, _, _,
    0, _, 5, _, 7, _, 8, _, 12, _, 13, _, 12, _, 8, _,
    7, _, _, _, 8, _, 7, _, 5, _, _, _, 0, _, _, _,
  ];
  const ROOTS = [0, -4, -7, -5]; // 小節ごとのベース（レ・シ♭・ソ・ラ）
  const BASS_STEPS = [0, 3, 6, 8, 11, 14];

  const Bgm = {
    on: false, hot: false, hotTarget: false, step: 0, next: 0, timer: null, master: null, section: 0,
    vol: 0.5,
    start() {
      Sfx.init();
      const c = Sfx.ctx;
      if (!c || this.on) return;
      let m = 1;
      try { m = parseFloat(localStorage.getItem('nakama_bgm') || '1'); } catch (e) { /* noop */ }
      this.vol = isNaN(m) ? 1 : m;
      this.master = c.createGain();
      this.master.gain.value = 0;
      this.master.gain.linearRampToValueAtTime(0.5 * this.vol, c.currentTime + 2);
      // ほんのり響き（簡単なディレイ）
      const dl = c.createDelay(); dl.delayTime.value = 0.28;
      const fb = c.createGain(); fb.gain.value = 0.25;
      const wet = c.createGain(); wet.gain.value = 0.3;
      this.bus = c.createGain();
      this.bus.connect(this.master);
      this.bus.connect(dl); dl.connect(fb); fb.connect(dl); dl.connect(wet); wet.connect(this.master);
      this.master.connect(c.destination);
      this.on = true; this.step = 0; this.section = 0;
      this.next = c.currentTime + 0.1;
      this.timer = setInterval(() => this.tick(), 25);
    },
    stop() {
      if (!this.on) return;
      this.on = false;
      clearInterval(this.timer);
      const c = Sfx.ctx, m = this.master;
      if (c && m) {
        m.gain.cancelScheduledValues(c.currentTime);
        m.gain.setValueAtTime(m.gain.value, c.currentTime);
        m.gain.linearRampToValueAtTime(0, c.currentTime + 0.8);
        setTimeout(() => { try { m.disconnect(); } catch (e) { /* noop */ } }, 1000);
      }
    },
    // 音量（0 / 0.5 / 1 を切り替え）
    toggle() {
      this.vol = this.vol >= 1 ? 0 : this.vol > 0 ? 1 : 0.5;
      try { localStorage.setItem('nakama_bgm', String(this.vol)); } catch (e) { /* noop */ }
      if (this.master && Sfx.ctx) this.master.gain.setTargetAtTime(0.5 * this.vol, Sfx.ctx.currentTime, 0.1);
      return this.vol;
    },
    intense(v) { this.hotTarget = !!v; },
    tick() {
      const c = Sfx.ctx;
      if (!c || !this.on) return;
      if (c.state === 'suspended') return;
      if (Sfx.muted) return;
      // 少し先まで予約しておく
      while (this.next < c.currentTime + 0.12) {
        this.play(this.step, this.next);
        const bpm = this.hot ? 132 : 100;
        this.next += 60 / bpm / 4;
        this.step = (this.step + 1) % 64;
        if (this.step === 0) { this.section++; this.hot = this.hotTarget; }
        if (this.step % 16 === 0 && this.hotTarget !== this.hot) this.hot = this.hotTarget;
      }
      if (this.next < c.currentTime - 0.5) this.next = c.currentTime + 0.05; // タブが裏に回っていたとき
    },
    play(i, t) {
      const bar = Math.floor(i / 16), s = i % 16;
      const hot = this.hot;
      const mel = (this.section % 4 === 3 || hot) ? MEL_B : MEL_A;
      const root = ROOTS[bar];
      // 太鼓
      if (hot) {
        if ([0, 3, 6, 8, 10, 12, 14].includes(s)) this.taiko(t, s % 8 === 0 ? 0.55 : 0.32);
        if (s % 2 === 1) this.ka(t, 0.05);
      } else {
        if (s === 0 || s === 8 || (s === 14 && bar === 3)) this.taiko(t, s === 0 ? 0.45 : 0.3);
        if (s === 4 || s === 12) this.ka(t, 0.07);
      }
      // 三味線のベース
      if (BASS_STEPS.includes(s)) this.pluck(f(root - 12 + (s === 6 || s === 14 ? 7 : 0)), t, hot ? 0.11 : 0.08, 900);
      // 琴のメロディ（最初の1周は静かに入る）
      const n = mel[i];
      if (n !== null && n !== undefined && (this.section > 0 || bar >= 2)) this.koto(f(n), t, hot ? 0.07 : 0.06);
      // 持続音（雰囲気）
      if (s === 0) this.pad(f(root - 12), t, 60 / (hot ? 132 : 100) * 4);
    },
    env(g, t, v, a, d) {
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(v, t + a);
      g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
    },
    taiko(t, v) {
      const c = Sfx.ctx;
      const o = c.createOscillator(), g = c.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(110, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.3);
      this.env(g, t, v, 0.005, 0.45);
      o.connect(g); g.connect(this.master);
      o.start(t); o.stop(t + 0.5);
    },
    ka(t, v) {
      const c = Sfx.ctx;
      const len = Math.floor(c.sampleRate * 0.05);
      if (!this.noiseBuf) {
        this.noiseBuf = c.createBuffer(1, c.sampleRate * 0.3, c.sampleRate);
        const d = this.noiseBuf.getChannelData(0);
        for (let k = 0; k < d.length; k++) d[k] = Math.random() * 2 - 1;
      }
      const src = c.createBufferSource(); src.buffer = this.noiseBuf;
      const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 2600; bp.Q.value = 2;
      const g = c.createGain(); this.env(g, t, v, 0.002, len / c.sampleRate);
      src.connect(bp); bp.connect(g); g.connect(this.master);
      src.start(t); src.stop(t + 0.08);
    },
    pluck(freq, t, v, cut) {
      const c = Sfx.ctx;
      const o = c.createOscillator(), lp = c.createBiquadFilter(), g = c.createGain();
      o.type = 'sawtooth'; o.frequency.value = freq;
      lp.type = 'lowpass'; lp.Q.value = 4;
      lp.frequency.setValueAtTime(cut * 3, t); lp.frequency.exponentialRampToValueAtTime(cut * 0.5, t + 0.18);
      this.env(g, t, v, 0.003, 0.32);
      o.connect(lp); lp.connect(g); g.connect(this.bus);
      o.start(t); o.stop(t + 0.4);
    },
    koto(freq, t, v) {
      const c = Sfx.ctx;
      const g = c.createGain();
      this.env(g, t, v, 0.004, 0.75);
      g.connect(this.bus);
      [[1, 'triangle', 1], [2, 'sine', 0.35], [3, 'sine', 0.12]].forEach(([m, type, a]) => {
        const o = c.createOscillator(), og = c.createGain();
        o.type = type; o.frequency.value = freq * m; og.gain.value = a;
        o.connect(og); og.connect(g);
        o.start(t); o.stop(t + 0.85);
      });
    },
    pad(freq, t, dur) {
      const c = Sfx.ctx;
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.025, t + dur * 0.3);
      g.gain.linearRampToValueAtTime(0.0001, t + dur);
      const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 700;
      g.connect(lp); lp.connect(this.bus);
      [1, 1.5, 2.003].forEach(m => {
        const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = freq * m;
        const og = c.createGain(); og.gain.value = 0.33;
        o.connect(og); og.connect(g);
        o.start(t); o.stop(t + dur + 0.05);
      });
    },
  };
  window.Bgm = Bgm;
})();
