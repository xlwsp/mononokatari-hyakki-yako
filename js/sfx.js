// 効果音（WebAudio で合成。音声ファイル不要）
(function () {
  'use strict';
  // [周波数, 長さ, 波形, 音量, 音程の変化, ノイズ音量, ノイズ周波数]
  const SHOOT = {
    default: [880, 0.07, 'triangle', 0.03, -500, 0.015, 5000],
    gekomaru: [520, 0.08, 'sine', 0.04, -260, 0.012, 1500],
    tongue: [300, 0.12, 'sawtooth', 0.025, 500, 0.02, 1200],
    suzune: [1600, 0.06, 'sine', 0.025, 400],
    maimai: [240, 0.12, 'sine', 0.05, -120, 0.02, 600],
    rangyo: [990, 0.06, 'triangle', 0.03, -400, 0.012, 3000],
    kodama: [700, 0.05, 'square', 0.018, -400, 0.02, 6000],
    kohaku: [1200, 0.07, 'triangle', 0.03, -700, 0.012, 5000],
    kuroro: [1400, 0.05, 'sawtooth', 0.016, -900, 0.02, 7000],
    uroko: [420, 0.1, 'sawtooth', 0.02, -200, 0.025, 2500],
    komori: [200, 0.12, 'sine', 0.06, -80, 0.02, 400],
    toosibi: [600, 0.1, 'triangle', 0.03, 300, 0.03, 2000],
    nejimaru: [1000, 0.04, 'square', 0.018, -600, 0.015, 8000],
    hakua: [660, 0.1, 'sawtooth', 0.02, -300, 0.025, 3500],
    sinonome: [1318, 0.12, 'sine', 0.03, 0],
  };
  const Sfx = {
    ctx: null,
    muted: false,
    last: {},
    init() {
      if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
      try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { this.ctx = null; }
    },
    tone(freq, dur, type = 'sine', vol = 0.05, slide = 0, delay = 0) {
      const c = this.ctx;
      if (!c || this.muted) return;
      const t = c.currentTime + delay;
      const o = c.createOscillator(), g = c.createGain();
      o.type = type;
      o.frequency.setValueAtTime(freq, t);
      if (slide) o.frequency.linearRampToValueAtTime(Math.max(30, freq + slide), t + dur);
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(c.destination);
      o.start(t); o.stop(t + dur + 0.02);
    },
    // ノイズ（シュワッ・ドーン用）
    noise(dur, vol, freq, delay) {
      const c = this.ctx;
      if (!c || this.muted) return;
      const t = c.currentTime + (delay || 0);
      const len = Math.floor(c.sampleRate * dur);
      const buf = c.createBuffer(1, len, c.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const src = c.createBufferSource(); src.buffer = buf;
      const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq || 1200; f.Q.value = 0.8;
      const g = c.createGain(); g.gain.setValueAtTime(vol || 0.08, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      src.connect(f); f.connect(g); g.connect(c.destination);
      src.start(t);
    },
    // 連続で拾うと音階が上がる
    gemLadder() {
      const now = performance.now();
      if (now - (this.last.gemL || 0) > 600) this.ladder = 0;
      if (now - (this.last.gemL || 0) < 45) return;
      this.last.gemL = now;
      const scale = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24];
      const n = scale[Math.min(this.ladder++, scale.length - 1)];
      this.tone(784 * Math.pow(2, n / 12), 0.07, 'sine', 0.04);
    },
    // コンボが増えるほど高くなる撃破音
    combo(n) {
      const now = performance.now();
      if (now - (this.last.combo || 0) < 50) return;
      this.last.combo = now;
      const f = 300 * Math.pow(2, Math.min(n, 48) / 24);
      this.tone(f, 0.07, 'triangle', 0.035, f * 0.5);
    },
    // 自分の攻撃を放つ音（モンスターごとに音色を変える）
    shoot(k) {
      const now = performance.now();
      if (now - (this.last.shoot || 0) < 85) return; // 弾が多くてもうるさくならないように
      this.last.shoot = now;
      const v = SHOOT[k] || SHOOT.default;
      const f = v[0] * (0.96 + Math.random() * 0.08);
      this.tone(f, v[1], v[2], v[3], v[4]);
      if (v[5]) this.noise(0.06, v[5], v[6] || 4000);
    },
    play(name) {
      if (!this.ctx || this.muted) return;
      const now = performance.now();
      const gap = { gem: 55, hit: 70, kill: 60 }[name] || 0;
      if (gap && now - (this.last[name] || 0) < gap) return;
      this.last[name] = now;
      switch (name) {
        case 'gem': this.tone(900 + Math.random() * 300, 0.06, 'sine', 0.035); break;
        case 'kill': this.tone(260, 0.08, 'triangle', 0.03, -120); break;
        case 'lvl': [523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.16, 'triangle', 0.06, 0, i * 0.07)); break;
        case 'cap': [660, 880, 990, 1320].forEach((f, i) => this.tone(f, 0.2, 'sine', 0.07, 0, i * 0.08)); break;
        case 'capL': [523, 659, 784, 1046, 1318, 1568].forEach((f, i) => this.tone(f, 0.28, 'triangle', 0.07, 0, i * 0.09)); break;
        case 'hurt': this.tone(160, 0.18, 'sawtooth', 0.05, -80); break;
        case 'down': this.tone(330, 0.5, 'triangle', 0.07, -220); break;
        case 'revive': [392, 523, 659].forEach((f, i) => this.tone(f, 0.18, 'sine', 0.06, 0, i * 0.08)); break;
        case 'boss': [110, 98, 82].forEach((f, i) => this.tone(f, 0.45, 'sawtooth', 0.06, 0, i * 0.3)); break;
        case 'click': this.tone(700, 0.05, 'square', 0.03); break;
        case 'win': [523, 659, 784, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.25, 'triangle', 0.07, 0, i * 0.13)); break;
        case 'lvlBig':
          this.noise(0.4, 0.06, 3000);
          [523, 659, 784, 1046, 1318].forEach((f, i) => this.tone(f, 0.22, 'triangle', 0.07, 0, i * 0.06));
          [1046, 1318, 1568].forEach(f => this.tone(f, 0.6, 'sine', 0.04, 0, 0.36));
          break;
        case 'card':
          this.noise(0.25, 0.05, 5000);
          [1318, 1568, 2093].forEach((f, i) => this.tone(f, 0.15, 'sine', 0.05, 0, i * 0.05));
          break;
        case 'evo':
          this.noise(1.0, 0.05, 800);
          [262, 330, 392, 523].forEach((f, i) => this.tone(f, 0.25, 'sawtooth', 0.025, f * 0.02, i * 0.12));
          [523, 659, 784, 1046, 1318, 1568, 2093].forEach((f, i) => this.tone(f, 0.35, 'triangle', 0.06, 0, 0.6 + i * 0.07));
          this.noise(0.5, 0.08, 2500, 0.6);
          break;
        case 'legend':
          [392, 523, 659, 784, 1046, 1318, 1568].forEach((f, i) => this.tone(f, 0.3, 'triangle', 0.07, 0, i * 0.08));
          [784, 988, 1175, 1568].forEach(f => this.tone(f, 0.9, 'sine', 0.035, 0, 0.6));
          break;
        case 'milestone':
          this.noise(0.3, 0.06, 2000);
          [659, 880, 1175].forEach((f, i) => this.tone(f, 0.18, 'square', 0.035, 0, i * 0.07));
          break;
        case 'skill': this.noise(0.22, 0.06, 1800); this.tone(520, 0.18, 'triangle', 0.05, 380); break;
        case 'slam': this.noise(0.35, 0.12, 220); this.tone(70, 0.35, 'sine', 0.14, -30); break;
        case 'stamp': this.noise(0.25, 0.1, 400); this.tone(110, 0.25, 'sine', 0.12, -40); break;
        case 'lose': [392, 349, 311, 262].forEach((f, i) => this.tone(f, 0.35, 'triangle', 0.06, 0, i * 0.2)); break;
      }
    },
  };
  window.Sfx = Sfx;
})();
