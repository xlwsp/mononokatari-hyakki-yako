// エントリーポイント
(function () {
  'use strict';
  const { BootScene, TitleScene, ResultScene } = MenuScenes;

  async function waitFonts() {
    if (!document.fonts || !document.fonts.load) return;
    const sample = 'なかまサバイバーふわもこの森みんなで遊ぶソロ仲間レベル強化ランキングスコア撃破捕獲復活ボス出現0123456789';
    try {
      await Promise.race([
        Promise.all([
          document.fonts.load('800 20px "M PLUS Rounded 1c"', sample),
          document.fonts.load('500 20px "M PLUS Rounded 1c"', sample),
          document.fonts.load('400 20px "Dela Gothic One"', sample),
        ]),
        new Promise(r => setTimeout(r, 2500)),
      ]);
    } catch (e) { /* フォントが無くても続行 */ }
  }

  waitFonts().then(() => {
    window.game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: 'game',
      backgroundColor: '#3f6b37',
      scale: { mode: Phaser.Scale.RESIZE, width: '100%', height: '100%' },
      dom: { createContainer: true },
      input: { activePointers: 3 },
      render: { antialias: true, powerPreference: 'high-performance' },
      fps: { target: 60 },
      scene: [BootScene, TitleScene, GameScene, UIScene, ResultScene],
    });
  });
})();
