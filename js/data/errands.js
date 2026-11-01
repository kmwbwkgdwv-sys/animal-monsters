// =============================================================
//  町の住民・通行人の「おつかい」
//   ・各町に 3人（住民2人＋町を歩く通行人1人）
//   ・1人ずつ 順番に お願いごとを してくる（終わると 少したってから 次のお願い）
//   ・ごほうびは 少しの お小遣い（インフレしないよう 100〜500円くらい）
//  お願いの種類
//   gather  : 素材を n こ 持ってくる（木を切る・岩をくだく など、フィールドで A ボタン）
//   hunt    : ○タイプの 野生アニモンを n 匹 追いはらう（たおす or つかまえる）
//   show    : ○タイプの アニモンを パーティーに入れて 見せる
//   deliver : ほかの町の 人に 荷物を とどける（受け取った人が お小遣いをくれる）
// =============================================================

// 素材（バッグの「素材」タブに入る）
export const MATS = {
  wood: { item: 'mat_wood', name: '木材', icon: '🪵', verb: '木を切る', got: '木を 切って 木材を 手に入れた！' },
  stone: { item: 'mat_stone', name: '石ころ', icon: '🪨', verb: '岩をくだく', got: '岩を くだいて 石ころを 手に入れた！' },
  berry: { item: 'mat_berry', name: '木の実', icon: '🫐', verb: '木の実をとる', got: 'しげみで 木の実を 見つけた！' },
  mush: { item: 'mat_mush', name: 'キノコ', icon: '🍄', verb: 'キノコをつむ', got: 'キノコを つんだ！' },
  cactus: { item: 'mat_cactus', name: 'サボテンの実', icon: '🌵', verb: '実をもぐ', got: 'サボテンの実を もいだ！' },
  crystal: { item: 'mat_crystal', name: '結晶のかけら', icon: '💎', verb: '結晶をけずる', got: '結晶のかけらを けずりとった！' },
  ore: { item: 'mat_ore', name: '火山の鉱石', icon: '⛏️', verb: '鉱石をほる', got: '火山の鉱石を 掘りだした！' },
};
// 障害物の種類 → とれる素材（火山の岩は 鉱石）
export function matOf(kind, biome) {
  if (kind === 'tree' || kind === 'dead') return 'wood';
  if (kind === 'rock') return biome === 'volcano' ? 'ore' : 'stone';
  if (kind === 'bush') return 'berry';
  if (kind === 'mush') return 'mush';
  if (kind === 'cactus') return 'cactus';
  if (kind === 'crystal') return 'crystal';
  return null;
}

// 町の段階（ごほうびの 大きさ）
export const TOWN_TIER = { start: 1, forest: 2, lake: 3, desert: 4, canyon: 5, snow: 6, swamp: 7, highland: 8, volcano: 9, sanctuary: 10 };
// ごほうび（10円単位）。最初の町で 100〜200円、最後のほうでも 500円前後
export function errandReward(req, town) {
  const base = 80 + (TOWN_TIER[town] || 1) * 25;
  const k = req.t === 'gather' ? 0.7 + 0.2 * req.n : req.t === 'hunt' ? 0.8 + 0.25 * req.n : req.t === 'deliver' ? 1.4 : 1.0;
  return Math.round(base * k / 10) * 10;
}

// 歩く人（walk:true）は 町の広場を ぐるっと 散歩する
export const ERRAND_GIVERS = [
  // ---- はじまりの町 ----
  { id: 'e_start_1', town: 'start', name: 'パン屋のおばさん', look: 'er_start_1', reqs: [
    { t: 'gather', mat: 'berry', n: 3, say: '木の実の パンを 焼きたいの。町の外の しげみで 木の実を 3こ 集めてきてくれない？' },
    { t: 'gather', mat: 'wood', n: 3, say: 'かまどの まきが 足りなくて……。木を 切って 木材を 3こ 持ってきて！' },
    { t: 'show', type: 'fire', say: '炎タイプの アニモンって パンを ふっくら 焼けるのかしら？ 一度 見せてくれる？' }] },
  { id: 'e_start_2', town: 'start', name: '大工のゲンさん', look: 'er_start_2', reqs: [
    { t: 'gather', mat: 'wood', n: 4, say: '家の さくが こわれちまった。木材を 4こ 持ってきてくれ！' },
    { t: 'hunt', type: 'normal', n: 2, say: '屋根を かじる ノーマルタイプの 野生アニモンが いるんだ。2匹 追いはらってくれ！' },
    { t: 'gather', mat: 'stone', n: 3, say: '庭に 石だたみを しきたいんだ。岩を くだいて 石ころを 3こ たのむ！' }] },
  { id: 'e_start_3', town: 'start', name: '散歩中のおじいさん', look: 'er_start_3', walk: true, reqs: [
    { t: 'hunt', type: 'bug', n: 2, say: '畑の 野菜を むしタイプの アニモンが かじってしまうんじゃ。2匹 追いはらってくれんか？' },
    { t: 'deliver', to: 'e_forest_1', say: 'もりの村の きこりの モリオに、この 手紙を とどけてくれんか。わしの 古い友だちでな。' },
    { t: 'show', type: 'grass', say: 'むかし 草タイプの アニモンと 暮らしておってな……。もう一度 見たいのう。' }] },
  // ---- もりの村 ----
  { id: 'e_forest_1', town: 'forest', name: 'きこりのモリオ', look: 'er_forest_1', reqs: [
    { t: 'gather', mat: 'wood', n: 5, say: '村の 橋を 直すのに 木材が 5こ いるんだ。森の 木を 切ってきてくれ！' },
    { t: 'hunt', type: 'bug', n: 3, say: '切った 木を むしタイプの アニモンが かじっちまう。3匹 追いはらってくれ！' },
    { t: 'gather', mat: 'berry', n: 3, say: '仕事の あとは 木の実が 一番！ 3こ 集めてきてくれないか？' }] },
  { id: 'e_forest_2', town: 'forest', name: 'キノコ料理人のシイタ', look: 'er_forest_2', reqs: [
    { t: 'gather', mat: 'mush', n: 3, say: '森の キノコ汁を 作りたいの。森で キノコを 3こ つんできて！' },
    { t: 'show', type: 'poison', say: '毒キノコと 見分けるのに、毒タイプの アニモンの 鼻が ほしいの。一度 見せて！' },
    { t: 'gather', mat: 'mush', n: 5, say: 'お祭りの 料理に キノコが 5こ 必要なの！ おねがい！' }] },
  { id: 'e_forest_3', town: 'forest', name: '森の配達人', look: 'er_forest_3', walk: true, reqs: [
    { t: 'deliver', to: 'e_lake_1', say: 'みなとまちの 漁師の カイさんに この 荷物を とどけてほしいんだ。ぼくは 森の 配達で 手いっぱいで……。' },
    { t: 'gather', mat: 'berry', n: 4, say: '配達の とちゅうで 食べる 木の実が ほしいな。4こ たのめる？' },
    { t: 'show', type: 'flying', say: '空を 飛べる アニモンが いたら 配達が 楽なのになあ。飛行タイプを 見せて！' }] },
  // ---- みなとまち ----
  { id: 'e_lake_1', town: 'lake', name: '漁師のカイ', look: 'er_lake_1', reqs: [
    { t: 'hunt', type: 'water', n: 3, say: '網を やぶる 水タイプの 野生アニモンに 困ってるんだ。3匹 追いはらってくれ！' },
    { t: 'gather', mat: 'wood', n: 4, say: '船の 修理に 木材が 4こ いるんだ。湖の まわりの 木を 切ってきてくれ！' },
    { t: 'show', type: 'electric', say: '電気タイプの アニモンって、夜の 漁で あかりに なるのかな？ 見せてくれ！' }] },
  { id: 'e_lake_2', town: 'lake', name: '灯台のそうじ係', look: 'er_lake_2', reqs: [
    { t: 'gather', mat: 'stone', n: 3, say: '灯台の 階段が かけちゃって……。石ころを 3こ 持ってきてくれる？' },
    { t: 'gather', mat: 'berry', n: 3, say: '灯台守の じいさんに 木の実の おやつを 作りたいの。3こ おねがい！' },
    { t: 'show', type: 'water', say: '水タイプの アニモンって かわいいよね！ あなたの 子を 見せて！' }] },
  { id: 'e_lake_3', town: 'lake', name: '港の水夫', look: 'er_lake_3', walk: true, reqs: [
    { t: 'deliver', to: 'e_desert_1', say: 'オアシスタウンの 果物屋の サラに この 塩を とどけてくれ。船が 出せなくてな。' },
    { t: 'hunt', type: 'grass', n: 2, say: '桟橋に 草タイプの アニモンが 巻きついて 困ってる。2匹 追いはらってくれ！' },
    { t: 'gather', mat: 'berry', n: 5, say: '長い 船旅には 木の実が かかせねえ。5こ 集めてきてくれ！' }] },
  // ---- オアシスタウン ----
  { id: 'e_desert_1', town: 'desert', name: '果物屋のサラ', look: 'er_desert_1', reqs: [
    { t: 'gather', mat: 'cactus', n: 3, say: 'サボテンの実の ジュースが 大人気なの！ 砂漠で 3こ もいできて！' },
    { t: 'show', type: 'water', say: '砂漠では 水タイプの アニモンは めずらしいの。見せてくれたら うれしいな！' },
    { t: 'gather', mat: 'cactus', n: 5, say: 'お祭りで ジュースを たくさん 作るの！ サボテンの実を 5こ おねがい！' }] },
  { id: 'e_desert_2', town: 'desert', name: '井戸ほりのドン', look: 'er_desert_2', reqs: [
    { t: 'gather', mat: 'stone', n: 4, say: '井戸の かべを 石で かためたいんだ。石ころを 4こ 持ってきてくれ！' },
    { t: 'hunt', type: 'ground', n: 3, say: '井戸を ほりかえす 地面タイプの アニモンが いるんだ。3匹 追いはらってくれ！' },
    { t: 'gather', mat: 'wood', n: 2, say: '井戸の つるべに 木材が 2こ いる。ヤシの木でも いいぞ！' }] },
  { id: 'e_desert_3', town: 'desert', name: '旅の商人', look: 'er_desert_3', walk: true, reqs: [
    { t: 'deliver', to: 'e_canyon_1', say: 'いわやま町の 石工の ガンさんに この 品を とどけてくれないか？ お代は むこうで もらってくれ。' },
    { t: 'show', type: 'fire', say: '砂漠の 夜は 冷えるんだ……。炎タイプの アニモンを 見せてくれ、あったまりたい！' },
    { t: 'gather', mat: 'cactus', n: 2, say: 'サボテンの実は 旅の おともさ。2こ ゆずってくれないか？' }] },
  // ---- いわやま町 ----
  { id: 'e_canyon_1', town: 'canyon', name: '石工のガンさん', look: 'er_canyon_1', reqs: [
    { t: 'gather', mat: 'stone', n: 5, say: '町の 石がきを 直すのに 石ころが 5こ いるんだ。渓谷の 岩を くだいてきてくれ！' },
    { t: 'show', type: 'rock', say: '岩タイプの アニモンの 体の 石は、いい 石材に 見えるんだよなあ。見せてくれ！' },
    { t: 'gather', mat: 'stone', n: 6, say: '大きな 石像を ほるんだ。石ころを 6こ 集めてくれ！' }] },
  { id: 'e_canyon_2', town: 'canyon', name: '鉱夫の見習い', look: 'er_canyon_2', reqs: [
    { t: 'hunt', type: 'rock', n: 3, say: '坑道の 入り口を 岩タイプの アニモンが ふさいでるんです。3匹 追いはらってください！' },
    { t: 'gather', mat: 'stone', n: 3, say: '坑道の ささえに 石ころが 3こ いるんです。おねがいします！' },
    { t: 'show', type: 'steel', say: '鋼タイプの アニモンって、つるはしより かたいんですか？ 見せてください！' }] },
  { id: 'e_canyon_3', town: 'canyon', name: '登山家', look: 'er_canyon_3', walk: true, reqs: [
    { t: 'deliver', to: 'e_snow_1', say: 'ゆきの村の 木こりに この ロープを とどけてくれ。雪山の 仕事で 使うんだ。' },
    { t: 'hunt', type: 'flying', n: 3, say: '岩場で 飛行タイプの アニモンに おそわれるんだ。3匹 追いはらってくれ！' },
    { t: 'gather', mat: 'stone', n: 4, say: '登山道の 目印を 作るのに 石ころが 4こ ほしいんだ。' }] },
  // ---- ゆきの村 ----
  { id: 'e_snow_1', town: 'snow', name: '雪国の木こり', look: 'er_snow_1', reqs: [
    { t: 'gather', mat: 'wood', n: 4, say: 'ストーブの まきが 足りないんだ。雪の 木を 切って 木材を 4こ たのむ！' },
    { t: 'hunt', type: 'ice', n: 3, say: '村の 道を 氷タイプの アニモンが 凍らせちまう。3匹 追いはらってくれ！' },
    { t: 'gather', mat: 'wood', n: 6, say: '冬ごもりの じゅんびだ。木材を 6こ 集めてくれないか？' }] },
  { id: 'e_snow_2', town: 'snow', name: '氷細工師', look: 'er_snow_2', reqs: [
    { t: 'gather', mat: 'crystal', n: 3, say: '氷の 置き物に 結晶の かざりを つけたいの。結晶のかけらを 3こ 持ってきて！' },
    { t: 'show', type: 'ice', say: '氷タイプの アニモンを 見ながら 作品を ほりたいの。見せてくれる？' },
    { t: 'gather', mat: 'crystal', n: 5, say: 'こんどは 大作よ！ 結晶のかけらを 5こ おねがい！' }] },
  { id: 'e_snow_3', town: 'snow', name: '雪かきの少年', look: 'er_snow_3', walk: true, reqs: [
    { t: 'show', type: 'fire', say: 'さむい〜！ 炎タイプの アニモンを 見せて！ 見るだけで あったかく なりそう！' },
    { t: 'deliver', to: 'e_swamp_1', say: 'きりの集落の 薬師の おばばに、母さんからの 手紙を とどけてくれる？' },
    { t: 'gather', mat: 'stone', n: 3, say: '雪だるまの 目に する 石ころが 3こ ほしいんだ！' }] },
  // ---- きりの集落 ----
  { id: 'e_swamp_1', town: 'swamp', name: '薬師のおばば', look: 'er_swamp_1', reqs: [
    { t: 'gather', mat: 'mush', n: 4, say: '光る キノコは よい 薬に なるんじゃ。湿原で 4こ つんできておくれ。' },
    { t: 'show', type: 'fairy', say: 'フェアリータイプの アニモンには ふしぎな 力が あるというのう。見せておくれ。' },
    { t: 'gather', mat: 'mush', n: 6, say: '薬が 足りんのじゃ……。キノコを 6こ たのめるかの？' }] },
  { id: 'e_swamp_2', town: 'swamp', name: '霧番の青年', look: 'er_swamp_2', reqs: [
    { t: 'hunt', type: 'ghost', n: 3, say: '霧の 夜に ゴーストタイプが 旅人を まよわせるんだ。3匹 追いはらってくれ！' },
    { t: 'gather', mat: 'wood', n: 4, say: '霧の 中の 道しるべを 作りたい。枯れ木から 木材を 4こ たのむ！' },
    { t: 'show', type: 'psychic', say: 'エスパータイプの アニモンなら 霧の 先も 見えるのかな？ 見せてくれ！' }] },
  { id: 'e_swamp_3', town: 'swamp', name: '道にまよった旅人', look: 'er_swamp_3', walk: true, reqs: [
    { t: 'deliver', to: 'e_highland_1', say: 'そらの町の 風車番に この 部品を とどけるはずが、霧で まよってしまって……。たのめますか？' },
    { t: 'hunt', type: 'poison', n: 3, say: '毒タイプの アニモンに おどかされて 動けないんです。3匹 追いはらってください！' },
    { t: 'gather', mat: 'mush', n: 3, say: 'おなかが ぺこぺこで……。キノコを 3こ わけてもらえませんか？' }] },
  // ---- そらの町 ----
  { id: 'e_highland_1', town: 'highland', name: '風車番のフウ', look: 'er_highland_1', reqs: [
    { t: 'gather', mat: 'wood', n: 5, say: '風車の はねが こわれちゃった。木材を 5こ 持ってきてくれる？' },
    { t: 'hunt', type: 'electric', n: 3, say: '電気タイプの アニモンが 風車の 歯車に いたずらするの。3匹 追いはらって！' },
    { t: 'gather', mat: 'stone', n: 4, say: '風車の 土台を 直したいの。石ころを 4こ おねがい！' }] },
  { id: 'e_highland_2', town: 'highland', name: '花屋のハナ', look: 'er_highland_2', reqs: [
    { t: 'gather', mat: 'berry', n: 5, say: '花の 肥料に 木の実を 使うの。高原の しげみで 5こ 集めてきて！' },
    { t: 'show', type: 'fairy', say: 'フェアリータイプの アニモンが いると 花が よく さくんだって！ 見せて！' },
    { t: 'gather', mat: 'berry', n: 3, say: '花束に そえる 木の実が 3こ ほしいな。' }] },
  { id: 'e_highland_3', town: 'highland', name: '気球乗り', look: 'er_highland_3', walk: true, reqs: [
    { t: 'deliver', to: 'e_volcano_2', say: 'ほむらの里の 温泉宿の おかみに この 地図を とどけてくれ。気球が 修理中でね。' },
    { t: 'hunt', type: 'flying', n: 3, say: '気球に 飛行タイプの アニモンが ぶつかってくるんだ。3匹 追いはらってくれ！' },
    { t: 'show', type: 'dragon', say: 'ドラゴンタイプの アニモンと 空を 飛ぶのが ゆめなんだ。見せてくれ！' }] },
  // ---- ほむらの里 ----
  { id: 'e_volcano_1', town: 'volcano', name: '鍛冶の見習いテツ', look: 'er_volcano_1', reqs: [
    { t: 'gather', mat: 'ore', n: 3, say: '練習用の 鉱石が ほしいんです。火山の 岩を ほって 3こ 持ってきてください！' },
    { t: 'show', type: 'steel', say: '鋼タイプの アニモンの 体を 見て、いい 刃の 形を 学びたいんです！' },
    { t: 'gather', mat: 'ore', n: 5, say: '師匠に 一人前と みとめられたい！ 鉱石を 5こ おねがいします！' }] },
  { id: 'e_volcano_2', town: 'volcano', name: '温泉宿のおかみ', look: 'er_volcano_2', reqs: [
    { t: 'gather', mat: 'wood', n: 4, say: 'お湯を わかす まきが 足りないの。枯れ木から 木材を 4こ おねがい！' },
    { t: 'hunt', type: 'fire', n: 3, say: '炎タイプの アニモンが お湯を 熱くしすぎて 困ってるの。3匹 追いはらって！' },
    { t: 'gather', mat: 'ore', n: 2, say: '岩ぶろを 作るのに 鉱石が 2こ ほしいの。' }] },
  { id: 'e_volcano_3', town: 'volcano', name: '湯治客', look: 'er_volcano_3', walk: true, reqs: [
    { t: 'deliver', to: 'e_sanctuary_1', say: '聖域の祠の 巫女さまに この おそなえを とどけてもらえんかの。' },
    { t: 'show', type: 'water', say: '熱い 里では 水タイプの アニモンが 見たくなるのう。見せておくれ。' },
    { t: 'gather', mat: 'wood', n: 3, say: '湯上がりの たき火用に 木材を 3こ たのむよ。' }] },
  // ---- 聖域の祠 ----
  { id: 'e_sanctuary_1', town: 'sanctuary', name: '祠の巫女', look: 'er_sanctuary_1', reqs: [
    { t: 'gather', mat: 'crystal', n: 4, say: '祠の かざりに 金の 結晶を そなえたいのです。結晶のかけらを 4こ おねがいします。' },
    { t: 'show', type: 'psychic', say: 'エスパータイプの アニモンの 心の 声を 聞いてみたいのです。見せてくださいますか？' },
    { t: 'hunt', type: 'dark', n: 3, say: '悪タイプの アニモンが 祠の まわりを あらしています。3匹 しずめてください。' }] },
  { id: 'e_sanctuary_2', town: 'sanctuary', name: '巡礼者', look: 'er_sanctuary_2', walk: true, reqs: [
    { t: 'deliver', to: 'e_start_1', say: 'はじまりの町の パン屋さんに この 手紙を……。旅の とちゅうで お世話に なったのです。' },
    { t: 'gather', mat: 'crystal', n: 3, say: '巡礼の しるしに 結晶のかけらを 3こ 集めているのです。' },
    { t: 'gather', mat: 'wood', n: 3, say: '聖域の 桜の 木で お守りを 作りたいのです。木材を 3こ おねがいします。' }] },
  { id: 'e_sanctuary_3', town: 'sanctuary', name: '祠の守り人', look: 'er_sanctuary_3', reqs: [
    { t: 'show', type: 'ghost', say: 'ゴーストタイプの アニモンは 祠の 古い 友だちだ。見せてくれないか。' },
    { t: 'gather', mat: 'crystal', n: 6, say: '結界を 強くするのに 結晶のかけらが 6こ いるんだ。たのむ。' },
    { t: 'hunt', type: 'dragon', n: 2, say: '若い ドラゴンタイプが あばれている。2匹 しずめてくれ。' }] },
];
export const GIVER_BY_ID = Object.fromEntries(ERRAND_GIVERS.map(g => [g.id, g]));
export const ERRAND_MAX = 5;          // 同時に 引き受けられる おつかいの数
export const ERRAND_COOLDOWN = 180;   // 次の お願いまでの 時間（プレイ時間の秒）
