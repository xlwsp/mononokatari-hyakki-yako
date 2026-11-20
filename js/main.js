// エントリーポイント
(function () {
  'use strict';
  const { BootScene, TitleScene, ResultScene } = MenuScenes;

  async function waitFonts() {
    if (!document.fonts || !document.fonts.load) return;
    // 画面で使う文字をあらかじめ読み込む（読み込まれていない文字だけ別のフォントになるのを防ぐ）
    const sample = '0123456789×―…←→≒⏱▼　、。々〇「」【】〜あいうえおかがきぎくぐけげこごさざしじすずせそぞただちっつづてでとどなにぬねのはばぱひびふぶぷへべほぼぽまみむめもゃやゅゆょよらりるれろわをんァアィイウェエォオカガキギクグケゲコゴサザシジスズセソゾタダチッツテデトドナニネノハバパヒビピフブプベペホボポマミムメモャヤュユョヨラリルレロワン・ー一三上下不与世両並中丸主久乗乱亀了予事二互交人今他付代以仮仲伐会伝伸位低体何余作使例係保信個倍倒値停側傘備像元充先光入全共内円再冷処出刃分切列初判別制則削前剣割力功加効動勾化北匹区十千半南単印危即参双反収取受古台右号各合同名向含吸吹告周呪味呼命咆和品員哮問四回囲図固土圧地型埋報場境増壁士声変外多夜大太央奏奪妖妨始姿威子字存守安定実害容寄密射小少届岩左巨差己巻帯常幅幕広底度座延式引弧弱強弾当形影径待後得復心必応念怒急性怪息情想意感態成戦戻所手打技抜択押招拡拾持捕捨掛接控描提換揺撃撹操改攻放散数整敵文断新方明昔星映時普景暗曲更書替最月有期木未末本材来東板枚果枠柄柱根格森様標模横欄次止正歩死残段毎毒比毛気水決油況波活派浮消深混済減渡測満準溶演激濃火灯炎無然焼燃爆片版牙物特状狐狙狸狼猛獅獲率玉王現理琴生用甲画界畑番痛発登白百的目直相省眉瞬矢知短石破硬確示祝神福秒移程種稼積空立端笠符第筆筋答算管節範簡系約紅紙素紫累細終組経結絞絵絶継続緑線編縁縦縮置羅群羽聞背能自舞色花茂茶草落葉虹蛇行衝表被裂装裏補西要見視覚解触言計討記試詰認説読誰調護貫賞質赤起超足跳身転軽載込近返追退送逃透途通速連進遅遊運道違遠適選還邪部都配醒重量金鈴鉄鋭録鐘長開間関闘防限階隔障隠隣雑離雪雰霧青静面音響項順頭顔類風飛飾首験高鬼魔魚鳴鹿黄黒鼓️！＆（）＋／：＝？';
    try {
      await Promise.race([
        Promise.all([
          document.fonts.load('800 20px "M PLUS Rounded 1c"', sample),
          document.fonts.load('500 20px "M PLUS Rounded 1c"', sample),
          document.fonts.load('900 20px "M PLUS Rounded 1c"', sample), // カードの読みやすい太字
          document.fonts.load('400 20px "Dela Gothic One"', sample),
          document.fonts.load('400 20px "Yuji Syuku"', sample), // タイトルロゴに合わせた筆文字
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
