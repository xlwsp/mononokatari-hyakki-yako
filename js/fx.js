// 派手な演出まとめ（レベルアップ・進化・捕獲・コンボ・紙吹雪・フラッシュなど）
(function () {
  'use strict';
  const RAINBOW = [0xff6b6b, 0xffb84f, 0xfff06a, 0x7cff8a, 0x6fd8ff, 0xb48cff, 0xff8ad8];

  function makeTextures(scene) {
    const tex = (key, w, h, draw) => {
      if (scene.textures.exists(key)) return;
      const t = scene.textures.createCanvas(key, w, h);
      draw(t.context, w, h); t.refresh();
    };
    // 後光（回転する光の筋）
    tex('fx_rays', 512, 512, (c, w, h) => {
      const cx = w / 2, cy = h / 2, n = 18;
      for (let i = 0; i < n; i++) {
        const a0 = (i / n) * Math.PI * 2, a1 = a0 + Math.PI / n * 0.9;
        const g = c.createRadialGradient(cx, cy, 10, cx, cy, w / 2);
        g.addColorStop(0, 'rgba(255,255,255,0.95)'); g.addColorStop(1, 'rgba(255,255,255,0)');
        c.fillStyle = g;
        c.beginPath(); c.moveTo(cx, cy); c.arc(cx, cy, w / 2, a0, a1); c.closePath(); c.fill();
      }
    });
    tex('fx_confetti', 10, 6, c => { c.fillStyle = '#fff'; c.fillRect(0, 0, 10, 6); });
    tex('fx_star', 32, 32, c => {
      c.fillStyle = '#fff'; c.beginPath();
      for (let i = 0; i < 10; i++) {
        const r = i % 2 ? 6 : 16, a = -Math.PI / 2 + i * Math.PI / 5;
        i ? c.lineTo(16 + Math.cos(a) * r, 16 + Math.sin(a) * r) : c.moveTo(16 + Math.cos(a) * r, 16 + Math.sin(a) * r);
      }
      c.closePath(); c.fill();
    });
    tex('fx_pillar', 64, 256, c => {
      const g = c.createLinearGradient(0, 0, 64, 0);
      g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.5, 'rgba(255,255,255,1)'); g.addColorStop(1, 'rgba(255,255,255,0)');
      c.fillStyle = g; c.fillRect(0, 0, 64, 256);
      const v = c.createLinearGradient(0, 0, 0, 256);
      v.addColorStop(0, 'rgba(0,0,0,1)'); v.addColorStop(0.3, 'rgba(0,0,0,0)');
      c.globalCompositeOperation = 'destination-out'; c.fillStyle = v; c.fillRect(0, 0, 64, 256);
    });
  }

  // シーンごとに使う紙吹雪・星のパーティクル
  function emitters(scene, depth) {
    if (scene._fx) return scene._fx;
    makeTextures(scene);
    const confetti = scene.add.particles(0, 0, 'fx_confetti', {
      speed: { min: 220, max: 620 }, angle: { min: 200, max: 340 }, gravityY: 900, lifespan: { min: 900, max: 1600 },
      rotate: { start: 0, end: 720 }, scaleX: { start: 1.2, end: 0.4 }, scaleY: { min: 0.8, max: 1.3 },
      tint: RAINBOW, emitting: false,
    }).setDepth(depth);
    const stars = scene.add.particles(0, 0, 'fx_star', {
      speed: { min: 120, max: 420 }, lifespan: { min: 400, max: 900 }, scale: { start: 0.9, end: 0 },
      rotate: { start: 0, end: 360 }, blendMode: 'ADD', tint: [0xfff6a0, 0xffffff, 0xffd060], emitting: false,
    }).setDepth(depth);
    const twinkle = scene.add.particles(0, 0, 'fx_star', {
      speed: { min: 20, max: 80 }, lifespan: 500, scale: { start: 0.5, end: 0 }, blendMode: 'ADD', tint: 0xfff6a0, emitting: false,
    }).setDepth(depth);
    scene._fx = { confetti, stars, twinkle };
    return scene._fx;
  }

  const FX = {
    RAINBOW,
    emitters,

    // 紙吹雪。tint を渡すとその色だけ（レア度の色など）
    confetti(scene, x, y, n, tint) {
      const fx = emitters(scene, 1e6 + 20);
      let e = fx.confetti;
      if (tint !== undefined) {
        const k = 'c' + tint;
        if (!fx[k]) {
          fx[k] = scene.add.particles(0, 0, 'fx_confetti', {
            speed: { min: 220, max: 620 }, angle: { min: 200, max: 340 }, gravityY: 900, lifespan: { min: 900, max: 1600 },
            rotate: { start: 0, end: 720 }, scaleX: { start: 1.2, end: 0.4 }, scaleY: { min: 0.8, max: 1.3 },
            tint: [tint, 0xffffff, tint], emitting: false,
          }).setDepth(fx.confetti.depth);
        }
        e = fx[k];
      }
      e.explode(n || 60, x, y);
    },
    stars(scene, x, y, n) { emitters(scene, 1e6 + 20).stars.explode(n || 14, x, y); },
    twinkle(scene, x, y, n) { emitters(scene, 1e6 + 20).twinkle.explode(n || 3, x, y); },

    // 回転する後光（ワールド座標）
    rays(scene, x, y, color, size, dur) {
      makeTextures(scene);
      const r = scene.add.image(x, y, 'fx_rays').setTint(color).setBlendMode('ADD').setDepth(1e6 - 20).setAlpha(0).setScale(0.1);
      scene.tweens.add({ targets: r, alpha: 0.85, scale: (size || 400) / 512, duration: 250, ease: 'Back.out' });
      scene.tweens.add({ targets: r, angle: 120, duration: dur || 1400 });
      scene.tweens.add({ targets: r, alpha: 0, delay: (dur || 1400) - 400, duration: 400, onComplete: () => r.destroy() });
      return r;
    },

    // 光の柱
    pillar(scene, x, y, color) {
      makeTextures(scene);
      const p = scene.add.image(x, y + 10, 'fx_pillar').setOrigin(0.5, 1).setTint(color).setBlendMode('ADD').setDepth(1e6 - 19)
        .setScale(0.3, 0.1).setAlpha(0.95);
      scene.tweens.add({ targets: p, scaleX: 1.3, scaleY: 2.2, duration: 220, ease: 'Quad.out' });
      scene.tweens.add({ targets: p, alpha: 0, scaleX: 0.2, delay: 500, duration: 500, onComplete: () => p.destroy() });
    },

    // 衝撃波リング
    shockwave(scene, x, y, color, r) {
      const c = scene.add.circle(x, y, r || 120).setStrokeStyle(8, color, 1).setDepth(1e6 - 18).setScale(0.1);
      scene.tweens.add({ targets: c, scale: 1, alpha: 0, duration: 500, ease: 'Cubic.out', onComplete: () => c.destroy() });
    },

    // カメラのズームパンチ
    punch(scene, amount) {
      // ゲーム画面はカメラの倍率を自分で管理しているので、倍率の係数だけ動かす
      if (scene.punch !== undefined) {
        scene.tweens.killTweensOf(scene);
        scene.punch = 1;
        scene.tweens.add({ targets: scene, punch: 1 + (amount || 0.08), duration: 90, ease: 'Quad.out', yoyo: true, hold: 60, onComplete: () => { scene.punch = 1; } });
        return;
      }
      const cam = scene.cameras.main;
      const base = scene.baseZoom || cam.zoom;
      scene.tweens.killTweensOf(cam);
      cam.setZoom(base);
      scene.tweens.add({ targets: cam, zoom: base * (1 + (amount || 0.08)), duration: 90, ease: 'Quad.out', yoyo: true, hold: 60, onComplete: () => cam.setZoom(base) });
    },


    // ---- UI（画面座標）側の演出 ----
    flash(ui, color, alpha, dur) {
      const r = ui.add.rectangle(0, 0, ui.scale.width, ui.scale.height, color || 0xffffff, alpha || 0.6).setOrigin(0).setDepth(80);
      ui.tweens.add({ targets: r, alpha: 0, duration: dur || 350, onComplete: () => r.destroy() });
    },
    rainbowFlash(ui) {
      RAINBOW.forEach((c, i) => ui.time.delayedCall(i * 60, () => FX.flash(ui, c, 0.25, 220)));
    },
    screenConfetti(ui, n) {
      const e = emitters(ui, 75).confetti;
      const w = ui.scale.width;
      for (let i = 0; i < 5; i++) e.explode(Math.round((n || 120) / 5), w * (0.1 + i * 0.2), ui.scale.height * 0.15);
    },
    // スタンプ（WIN!! / GET! / 撃破！ など）
    stamp(ui, text, color, y, size) {
      const t = ui.add.text(ui.scale.width / 2, y || ui.scale.height * 0.4, text, Object.assign(UI.TB(size || 64, color || '#ffe07a', '#2a160a', 10), { shadow: undefined }))
        .setOrigin(0.5).setDepth(82).setScale(3).setAlpha(0).setAngle(-8);
      ui.tweens.add({ targets: t, scale: 1, alpha: 1, duration: 260, ease: 'Back.out' });
      ui.tweens.add({ targets: t, scale: 1.08, duration: 160, delay: 260, yoyo: true });
      ui.tweens.add({ targets: t, alpha: 0, y: t.y - 40, delay: 1100, duration: 400, onComplete: () => t.destroy() });
      return t;
    },
    // 画面の暗転＋スポットライト（進化演出用）
    spotlight(ui, dur) {
      const w = ui.scale.width, h = ui.scale.height;
      const g = ui.add.graphics().setDepth(74);
      g.fillStyle(0x000000, 0.55); g.fillRect(0, 0, w, h);
      g.alpha = 0;
      ui.tweens.add({ targets: g, alpha: 1, duration: 200 });
      ui.tweens.add({ targets: g, alpha: 0, delay: (dur || 1600) - 300, duration: 300, onComplete: () => g.destroy() });
    },
  };

  window.FX = FX;
})();
