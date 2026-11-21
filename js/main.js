// エントリーポイント
(function () {
  'use strict';
  const { BootScene, TitleScene, ResultScene } = MenuScenes;

  async function waitFonts() {
    if (!document.fonts || !document.fonts.load) return;
    // 画面で使う文字をあらかじめ読み込む（読み込まれていない文字だけ別のフォントになるのを防ぐ）
    const sample = '0123456789×―…←→≒⏱▼★☆♪♭⚔⚠⚡✅✔✦✨❤　、。々〇「」【】〜あいうえおかがきぎくぐけげこごさざしじすずせそぞただちっつづてでとどなにぬねのはばぱひびふぶぷへべほぼぽまみむめもゃやゅゆょよらりるれろわをんァアィイウェエォオカガキギクグケゲコゴサザシジスズセソゾタダチッツテデトドナニヌネノハバパヒビピフブプベペホボポマミムメモャヤュユョヨラリルレロワン・ー一三上下不与世両並中丸主久乗乱亀了予事二互交人今他付代以仮仲伐会伝伸位低体何余作使例係保信修個倍倒値停側傘備像優元充先光入全八共具内円再冷処出刃分切列初判別到制則削前剣割力功加効動勾化北匹区十千半南単印危即参友双反収取受古台右号各合同名向含吸吹告周呪味呼命咆和咫品員哮問四回団囲図固土圧地型埋基報場境増壁士声変外多夜大天太央奏奪妖妨妻始姿威子字存守安定宝実害家容寄密対射小少届岩左巨差己巻帯常幅幕広序底度座庫延式弓引弧弱強弾当形影役径待後得復心必応念怒急性怪息情想意感態慢成戦戻所扇手打技投抜択押招拡拾持指捕捨掛接控描提換揺撃撹操改攻放散数整敵文断新方日明昔星映時普景暗曜曲更書替最月有期木未末本材来東板枚果枠柄柱根格桜森槌様標模横欄次止正歩死残段殺毎毒比毛気水氷決油治況波活派浮消深混済減渡渦測満準溶演激濃火灯炎点無然焼燃爆片版牙物特状狐狗狙狸狼猛獅獲率玉王現理琴生用甲画界畑番痛発登白百的盛盤目直相省眉真着瞬矢知短石破硬確示祝神福秒秘称移程種稲稼積空突立端笠符第筆筋答算管節範簡系約紅紙素紫累細終組絆経結絞絵絶継続緑線編縁縦縮績置羅群羽者聞背能腕自舞良色花茂茶草落葉蒐蒼虹蛇行衝表被裂装裏補西要見視覚覧親解触言計討記試詰認語説読誰調護貫買賞質赤走起超足距跳身転軽載輪辺込近返追退送逃透途通速連週進遅遊運道達違遠適選還邪部都配醒重量金鈴鉄鋭録鎖鏡鐘鑑長開間関闘防限階隔際障隠隣集雑離雪雰雷霧青静面音響項順頭題顔類風飛飾首験高鬼魔魚鳴鹿黄黒鼓️！＆（）＋／：＝？｜🌀🎁🎨🎲🏅🏆🏯🏹👑👹💚💢💥💨💬💰📅📖🔒🔧🗡🛡🤖🥇🥈🥉🧲';
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
