// エントリーポイント
(function () {
  'use strict';
  const { BootScene, TitleScene, ResultScene } = MenuScenes;

  async function waitFonts() {
    if (!document.fonts || !document.fonts.load) return;
    // 画面で使う文字をあらかじめ読み込む（読み込まれていない文字だけ別のフォントになるのを防ぐ）
    const sample = '、。〇「」【】あいうえおかがきぎくぐけげこごさざしじすずせそただちっつづてでとどなにぬねのはばひびふぶぷへべほぽまみむめもゃやゅゆよらりるれろわをんァアィイウェエォオカガキギクグケゲコゴサザシジスズセソゾタダチッツテデトドナニネノハバパヒビピフブプベペホボポマミムメモャヤュユョヨラリルレロワン・ー一上下不与世両並中丸主久乱亀事二互人今他付代以仮仲会伝伸位低体何作使例係保信倍倒値停側備像充先光入全共内円再処出分切列初判別制則前割力功加効動化北区半南印即参双反収取受古右号各合同名向含吸吹周呪命咆品員哮四回囲図固土圧地型埋報場境増壁士声変外多夜大太央奪妨始姿威子字存守安定実害寄密射小少届岩左巨差常幕広底度座延式引弱強弾当影径待後得復心必応怒性情想意感態成戦戻所手打抜択押招拡拾持捕捨接控描換撃撹操攻放数整敵文新方明星映時普景暗更書最月有木末本材来東枚果柱根格森様標模横次止死残段毎毒比気水決況波活派消深混済減渡測満準演火炎無然焼爆片牙物特状狙狼猛獲率玉王現理生用甲画界畑番発登白百的目直相眉瞬矢石破確示祝神福秒移種稼空立端筋答算管範約紅紙素紫累細経結絞絵絶継続緑線編縁縦置羅群羽聞背能自舞色花茂茶草落葉虹蛇行衝表装補西要見覚解触言計試認説読誰調護貫赤起足跳身転軽込近返追退送逃透通速連進遅遊運道違遠適選邪部配醒重量金鈴鉄録長開間関闘防限階隔障隣離雪霧面音項順頭顔類風飛飾験高鬼魔魚鳴鹿黄黒️！＆（）＋／：＝？0123456789';
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
