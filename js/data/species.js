// アニモン200種のデータ
// 体型 p: quad(四足) biped(二足) bird(鳥) fish(魚) serpent(ヘビ) bug(虫) blob(浮遊/スライム) dragon(竜) turtle(亀) plant(植物) golem(岩人形) leviathan(伝説の海竜)
import { POOLS, COVERAGE, MOVES } from './moves.js';
import { mulberry32 } from '../engine/util.js';

export const ARCH = {
  balanced: [.25, .25, .25, .25], attacker: [.23, .31, .2, .26], speedster: [.21, .27, .18, .34], tank: [.31, .21, .32, .16],
  wall: [.28, .17, .38, .17], bruiser: [.28, .31, .26, .15], glass: [.19, .35, .15, .31], hp: [.37, .23, .22, .18],
};

// 地域
export const REGION_JA = {
  start: 'はじまりの町周辺', plains: 'そよかぜ平原', forest: 'こもれびの森', lake: 'せせらぎ湖畔', sea: '海', desert: 'サンドラ砂漠', canyon: 'いわさき渓谷',
  snow: 'フロスト氷山', swamp: 'よどみの湿原', highland: 'てんくう高原', volcano: 'ほむら火山', sanctuary: 'さいはての聖域', inner: '聖域の奥地',
  ruins: '古代の遺跡', pyramid: '砂の王墓', icecave: '氷晶の洞窟', skytower: '天空の塔', lavacave: '溶岩洞', abyss: '深淵の迷宮',
};

const LINES = [
  // ===== はじまりの御三家（図鑑1〜9） =====
  { n: ['セリック', 'セリオン', 'セリカイザー'], t: [['fire'], ['fire'], ['fire', 'steel']], evo: [16, 36], a: ['speedster', 'attacker', 'attacker'], p: 'quad', starter: true,
    f: { ears: 'pointy', tail: 'flame', face: 'snout' }, fs: [{}, { back: 'mane' }, { back: 'mane', extra: ['armor', 'crown'], horn: 2 }], ab: 'soul_fire', ride: [0, 0, 'land'], sig: 'sig_guren', c: ['#f2733a', '#ffd25a'],
    d: ['しっぽの炎で気持ちを表す子ネコのアニモン。うれしいと炎が大きくなる。', 'たてがみの炎は仲間を守るときに最も熱く燃え上がる。', '紅蓮の鎧をまとう獅子の王。その爪は鋼さえも溶かし切る。'] },
  { n: ['シドー', 'シドール', 'シドーテンペス'], t: [['water'], ['water'], ['water', 'electric']], evo: [16, 36], a: ['balanced', 'balanced', 'attacker'], p: ['quad', 'quad', 'biped'], starter: true,
    f: { ears: 'round', tail: 'fin', face: 'whiskers' }, fs: [{}, { back: 'fins' }, { back: 'fins', tail: 'bolt', extra: ['scarf'] }], ab: 'soul_water', ride: [0, 0, 'swim'], sig: 'sig_tsunami', c: ['#4a9cf0', '#d2efff'],
    d: ['川辺で遊ぶのが大好きな子カワウソのアニモン。水鉄砲が得意。', '背中のヒレで水をかき、川の流れより速く泳ぐ。', '嵐を呼ぶ水の戦士。雷をまとった水流で全てを押し流す。'] },
  { n: ['モーラ', 'モーラン', 'モーラガイア'], t: [['grass'], ['grass'], ['grass', 'ground']], evo: [16, 36], a: ['tank', 'tank', 'bruiser'], p: 'turtle', starter: true,
    f: { ears: 'none', tail: 'short', back: 'leaf' }, fs: [{}, { back: 'bush' }, { back: 'tree', horn: 1 }], ab: 'soul_grass', ride: [0, 0, 'land'], sig: 'sig_jukai', c: ['#62c254', '#9b7a4c'],
    d: ['甲羅の若葉で日光を浴びて育つ子ガメのアニモン。おっとりした性格。', '甲羅のしげみには小さなアニモンが住みつくことがある。', '背中に大樹を背負う大地の守り神。歩くと森が生まれるという。'] },

  // ===== 平原 =====
  { n: ['チュピ', 'チュピール', 'チュピランサー'], t: [['normal', 'flying']], evo: [14, 32], a: ['speedster', 'speedster', 'attacker'], p: 'bird', h: ['start', 'plains'], bst: 0.96,
    f: { tail: 'feather', face: 'beak' }, fs: [{}, { extra: ['crest'] }, { extra: ['crest'], tail: 'long' }], ab: ['keeneye', 'keeneye', 'reckless'], ride: [0, 0, 'fly'],
    d: ['どこにでもいる小鳥のアニモン。朝になると元気に鳴く。', '群れで飛び回り、すばしっこく虫を捕まえる。', '槍のようなくちばしで急降下する。人を乗せて空を飛ぶこともできる。'] },
  { n: ['コロネズ', 'コロビッグ'], t: [['normal']], evo: [20], a: ['attacker', 'bruiser'], p: 'quad', h: ['start', 'plains'], bst: 0.95,
    f: { ears: 'round', tail: 'long', face: 'whiskers' }, fs: [{}, { ears: 'big' }], ab: ['technician', 'guts'],
    d: ['大きな前歯で何でもかじる。数が多くどこでも見かける。', '前歯は岩もかじれるほど丈夫。食べ物をほおにためこむ。'] },
  { n: ['ピコネズ', 'ピコボルト', 'ピコライジン'], t: [['electric'], ['electric'], ['electric', 'fighting']], evo: [18, 36], a: ['speedster', 'speedster', 'glass'], p: ['quad', 'quad', 'biped'], h: ['plains', 'forest'],
    f: { ears: 'big', tail: 'bolt' }, fs: [{}, { extra: ['stripes'] }, { extra: ['stripes', 'scarf'] }], ab: ['staticbody', 'staticbody', 'plus'], sig: 'sig_raijin', c: ['#f7d43e', '#c0392b'],
    d: ['ほっぺに電気をためるネズミのアニモン。驚くとピリッとする。', '電気で体を光らせて仲間と合図を送り合う。', '雷神の槌を操る拳士。仲間の「マイナス」と組むと力が増す。'] },
  { n: ['モコモコ', 'モコメリー'], t: [['normal', 'fairy']], evo: [22], a: ['hp', 'tank'], p: 'quad', h: ['plains'],
    f: { ears: 'round', tail: 'short', back: 'wool' }, fs: [{}, { horn: 2, hornStyle: 'curl' }], ab: ['friendguard', 'friendguard'], support: 'cheer', c: ['#fff6ea', '#f9b4dc'],
    d: ['ふわふわの毛につつまれた子ヒツジ。抱きしめると眠くなる。', '毛の中に仲間を包んで守る。ダブルバトルで頼れる存在。'] },
  { n: ['イモムー', 'マユムー', 'ハネムー'], t: [['bug'], ['bug'], ['bug', 'flying']], evo: [7, 12], a: ['hp', 'wall', 'glass'], p: ['serpent', 'blob', 'bug'], h: ['start', 'plains', 'forest'], bst: 0.82,
    f: { extra: ['antenna'] }, fs: [{}, { extra: [] }, { back: 'wings', extra: ['antenna'] }], ab: ['shielddust', 'shielddust', 'serenegrace'], c: ['#a6c635', '#f7d43e'],
    d: ['葉っぱをもりもり食べるイモムシ。すぐに大きくなる。', 'マユの中でじっと進化の時を待っている。', '色鮮やかな羽を持つチョウのアニモン。りんぷんで相手を惑わす。'] },
  { n: ['ハチッコ', 'ハチクイン'], t: [['bug', 'poison']], evo: [24], a: ['speedster', 'attacker'], p: 'bug', h: ['plains', 'forest'],
    f: { back: 'wings', tail: 'spike', extra: ['stripes', 'antenna'] }, fs: [{}, { extra: ['stripes', 'antenna', 'crown'] }], ab: ['poisonbody', 'moxie'], c: ['#f7c72e', '#3a3020'],
    d: ['花の蜜を集める小さなハチ。おしりの針には毒がある。', '群れを統べる女王バチ。怒らせると大群が飛んでくる。'] },
  { n: ['ワタポポ', 'ワタポポリン'], t: [['grass', 'flying']], evo: [20], a: ['speedster', 'speedster'], p: 'plant', h: ['plains'], bst: 0.95,
    f: { back: 'cloud' }, fs: [{}, { back: 'cloud', extra: ['flowerhead'] }], ab: ['sunbask', 'sunbask'], c: ['#9ed65b', '#ffffff'],
    d: ['綿毛で風に乗りふわふわ飛ぶ。晴れた日に大量発生する。', '大きな綿毛で大陸中を旅する。種をまいて花を咲かせる。'] },
  { n: ['ウサピョン', 'ウサランナ'], t: [['normal'], ['normal', 'fighting']], evo: [25], a: ['speedster', 'speedster'], p: ['quad', 'biped'], h: ['plains'],
    f: { ears: 'long', tail: 'fluffy' }, fs: [{}, { extra: ['scarf'] }], ab: ['quickfeet', 'quickfeet'], ride: [0, 'land'], c: ['#f3e6cf', '#c99a6a'],
    d: ['長い耳で遠くの音を聞き分ける。ぴょんぴょん跳ねて移動する。', '強靭な脚で大地を駆ける。人を背中に乗せて走ることもある。'] },
  { n: ['ケロッタ', 'ケロバトラ'], t: [['water'], ['water', 'fighting']], evo: [26], a: ['balanced', 'bruiser'], p: 'biped', h: ['plains', 'lake'],
    f: { ears: 'none', tail: 'none', extra: ['spots'] }, fs: [{}, { extra: ['spots', 'belt'] }], ab: ['waterabsorb', 'innerfocus'], c: ['#5fc4a8', '#f7f0a0'],
    d: ['池に住むカエルのアニモン。雨の日は大合唱する。', '水かきのついた拳で岩を割る格闘家。礼儀正しい。'] },
  { n: ['ドロモグ', 'ドロモグラン'], t: [['ground'], ['ground', 'steel']], evo: [28], a: ['bruiser', 'attacker'], p: 'quad', h: ['plains', 'canyon'],
    f: { ears: 'none', tail: 'short', face: 'snout', extra: ['claws'] }, fs: [{}, { extra: ['claws', 'helmet'] }], ab: ['sturdy', 'hugepower'], bst: 0.97, c: ['#8a6a4a', '#e8b0a0'],
    d: ['地面に穴を掘って暮らすモグラ。日光がちょっと苦手。', '鋼のツメで地中を掘り進む。トンネルは迷路のよう。'] },
  { n: ['ポニカ', 'ポニカゼ'], t: [['normal']], evo: [30], a: ['speedster', 'speedster'], p: 'quad', h: ['plains'],
    f: { ears: 'pointy', tail: 'long', back: 'mane', face: 'snout' }, fs: [{}, { horn: 0, extra: ['scarf'] }], ab: ['quickfeet', 'speedboost'], ride: ['land', 'land'], bst: 0.97, c: ['#d9a46a', '#ffffff'],
    d: ['草原をかけまわる子ウマ。人懐っこく背中に乗せてくれる。', '風のように走る駿馬。旅人の相棒として愛されている。'] },
  { n: ['コンコ'], t: [['normal', 'psychic']], a: ['glass'], p: 'quad', h: ['plains', 'forest'], rare: true,
    f: { ears: 'big', tail: 'fluffy', face: 'snout' }, ab: ['synchro'], c: ['#f0a050', '#ffffff'],
    d: ['人をからかうのが好きなキツネ。不思議な力で幻を見せる。'] },
  { n: ['ノネコ', 'ノネコマタ'], t: [['normal'], ['normal', 'ghost']], evo: [30], a: ['speedster', 'glass'], p: 'quad', h: ['start', 'plains', 'swamp'],
    f: { ears: 'pointy', tail: 'long', face: 'whiskers' }, fs: [{}, { tail: 'twin', extra: ['ghostfire'] }], ab: ['lucky', 'lucky'], c: ['#9a9aa8', '#ffffff'],
    d: ['町の近くに住む野良ネコ。気まぐれで、なつくかは運しだい。', '長く生きたネコが変化した姿。二本のしっぽに鬼火を灯す。'] },

  // ===== 森 =====
  { n: ['キノコロ', 'キノコング'], t: [['grass', 'poison'], ['grass', 'fighting']], evo: [24], a: ['hp', 'bruiser'], p: ['blob', 'biped'], h: ['forest'],
    f: { back: 'mushroom', extra: ['spots'] }, fs: [{}, { back: 'mushroom' }], ab: ['poisonbody', 'guts'], c: ['#f0e0c0', '#d04040'],
    d: ['頭のカサからほうしを飛ばす。森の湿った場所にいる。', '太い腕でキノコパンチをくり出す。カサは鉄より硬い。'] },
  { n: ['コノハリス', 'ジュモクリス'], t: [['grass']], evo: [26], a: ['speedster', 'attacker'], p: 'quad', h: ['forest'],
    f: { ears: 'tuft', tail: 'leaf' }, fs: [{}, { tail: 'leaf', back: 'leaf' }], ab: ['sapsipper', 'technician'], c: ['#b07a40', '#7ccf5a'],
    d: ['木の葉のしっぽで枝から枝へ飛び移る。木の実が大好物。', '森の木々と心を通わせる。しっぽの葉は刃のように鋭い。'] },
  { n: ['カブトン', 'カブトギア'], t: [['bug'], ['bug', 'steel']], evo: [30], a: ['bruiser', 'tank'], p: 'bug', h: ['forest'],
    f: { horn: 1, hornStyle: 'cone' }, fs: [{}, { horn: 1, hornStyle: 'unicorn', extra: ['armor'] }], ab: ['sturdy', 'solidshell'], c: ['#6a4a2a', '#c0c8d0'],
    d: ['立派な角を持つカブトムシ。力比べが大好き。', '鋼の装甲で身を固めた甲虫。角の一撃は大木を倒す。'] },
  { n: ['クワガー', 'クワガイオー'], t: [['bug'], ['bug', 'fighting']], evo: [30], a: ['attacker', 'attacker'], p: ['bug', 'biped'], h: ['forest'],
    f: { face: 'pincers' }, fs: [{}, { face: 'pincers', extra: ['armor'] }], ab: ['hugepower', 'moxie'], bst: 0.96, c: ['#3a3040', '#d8a040'],
    d: ['大きなアゴで何でもはさむクワガタ。ライバルはカブトン。', '二本足で立ち上がり、アゴと拳で戦う森の武闘家。'] },
  { n: ['フクロン', 'フクロウジャ'], t: [['normal', 'flying'], ['psychic', 'flying']], evo: [28], a: ['hp', 'balanced'], p: 'bird', h: ['forest'],
    f: { ears: 'tuft', face: 'beak', tail: 'feather' }, fs: [{}, { extra: ['halo'] }], ab: ['keeneye', 'synchro'], c: ['#8a6a50', '#f0e0c0'],
    d: ['夜の森で静かに見張りをするフクロウ。首が一回転する。', '未来を見通すといわれる賢者のフクロウ。森の長老。'] },
  { n: ['ツタヘビ', 'ツタジャラ'], t: [['grass'], ['grass', 'poison']], evo: [30], a: ['speedster', 'attacker'], p: 'serpent', h: ['forest'],
    f: { back: 'leaf' }, fs: [{}, { back: 'leaf', extra: ['hood'] }], ab: ['shedskin', 'shedskin'], c: ['#4aa050', '#c0e070'],
    d: ['ツタにまぎれて獲物を待つヘビ。体は葉っぱの匂いがする。', '毒のツタを自在に操る。森の奥深くの主。'] },
  { n: ['フワリン', 'フワリーナ'], t: [['fairy']], evo: [30], a: ['hp', 'balanced'], p: 'blob', h: ['forest'],
    f: { back: 'wings', extra: ['halo'] }, fs: [{}, { back: 'wings', extra: ['halo', 'crown'] }], ab: ['prankster', 'prankster'], support: 'decoy', c: ['#f9c4e4', '#ffffff'],
    d: ['花畑をふわふわただよう妖精。いたずら好き。', '仲間を守るためなら自ら敵を引きつける勇敢な妖精。'] },
  { n: ['コジカ', 'モリノジカ'], t: [['normal'], ['normal', 'grass']], evo: [32], a: ['speedster', 'balanced'], p: 'quad', h: ['forest'],
    f: { ears: 'pointy', tail: 'short', extra: ['spots'] }, fs: [{ horn: 0 }, { horn: 2, hornStyle: 'antler', back: 'flowers' }], ab: ['sapsipper', 'sapsipper'], ride: [0, 'land'], c: ['#c08050', '#fff0d0'],
    d: ['背中の白い斑点が目印の子ジカ。森の中を軽やかに跳ねる。', '角に花を咲かせる森の守り神。人を乗せて森を駆ける。'] },
  { n: ['コケダマ'], t: [['grass', 'rock']], a: ['wall'], p: 'blob', h: ['forest', 'canyon'],
    f: { back: 'leaf' }, ab: ['sturdy'], c: ['#5a8a40', '#8a8070'],
    d: ['苔むした石が命を持ったアニモン。何百年も動かないことがある。'] },
  { n: ['イトグモ', 'ヨルグモ'], t: [['bug', 'dark']], evo: [25], a: ['balanced', 'attacker'], p: 'bug', h: ['forest'],
    f: { extra: ['spots'] }, fs: [{}, { extra: ['spots', 'mask'] }], ab: ['keeneye', 'sniper'], support: 'stickythread', c: ['#4a4a6a', '#e0c040'],
    d: ['夜の間に大きな巣を張るクモ。糸はとても丈夫。', '闇にまぎれて獲物をねらう。糸で相手の動きを封じる。'] },
  { n: ['ルミナ', 'ルミナリア'], t: [['fairy', 'psychic']], evo: [50], a: ['balanced', 'balanced'], p: 'blob', h: [], story: true, bstAbs: [255, 350],
    f: { back: 'wings', extra: ['star', 'halo'] }, fs: [{}, { back: 'wings', extra: ['star', 'halo', 'crown'] }], ab: ['serenegrace', 'serenegrace'], sig: 'sig_lumina', sigSlot: 7, c: ['#fff3b0', '#b4c8ff'],
    d: ['星のかけらから生まれたといわれる不思議なアニモン。歌で心を通わせる。', '星空のような羽を持つ。その歌声は伝説のアニモンの心さえ鎮める。'] },
  { n: ['クマコロ', 'クマゴロウ', 'クマオウ'], t: [['normal'], ['normal', 'fighting'], ['normal', 'fighting']], evo: [22, 40], a: ['bruiser', 'bruiser', 'bruiser'], p: ['quad', 'biped', 'biped'], h: ['forest'],
    f: { ears: 'round', tail: 'short', face: 'snout' }, fs: [{}, { extra: ['belly'] }, { extra: ['belly', 'scar'] }], ab: ['thickfat', 'guts', 'guts'], ride: [0, 0, 'land'], c: ['#8a5a3a', '#e8c090'],
    d: ['はちみつが大好きな子グマ。ころころ転がって遊ぶ。', '力自慢の若いクマ。大木を素手でなぎ倒す。', '森の王と呼ばれる大グマ。背中に乗れば森を自由に駆けられる。'] },

  // ===== 湖・海 =====
  { n: ['ピチャコイ', 'リュウコイ'], t: [['water'], ['water', 'dragon']], evo: [34], a: ['hp', 'attacker'], p: ['fish', 'serpent'], h: ['lake', 'sea'], bstAbs: [180, 355],
    f: { tail: 'fin', face: 'whiskers' }, fs: [{}, { back: 'fins', horn: 2, extra: ['whiskers'] }], ab: ['swiftswim', 'glare'], ride: [0, 'swim'], c: ['#f08a40', '#ffffff'],
    d: ['跳ねることしかできないと笑われる鯉。でもあきらめない。', '滝をのぼりきった鯉が竜となった姿。その背に乗れば海も渡れる。'] },
  { n: ['ハサミン', 'ハサミンガー'], t: [['water'], ['water', 'steel']], evo: [28], a: ['bruiser', 'tank'], p: 'bug', h: ['lake', 'sea'],
    f: { face: 'pincers' }, fs: [{}, { face: 'pincers', extra: ['armor'] }], ab: ['hugepower', 'solidshell'], bst: 0.97, c: ['#e05a40', '#f0d0b0'],
    d: ['大きなハサミが自慢のカニ。横歩きで素早く逃げる。', '鋼のハサミは岩も切断する。浜辺のボス的存在。'] },
  { n: ['ドンガメ', 'ドンガメロン'], t: [['water', 'rock']], evo: [32], a: ['wall', 'tank'], p: 'turtle', h: ['lake'],
    f: { back: 'shell', tail: 'short' }, fs: [{}, { back: 'shell', extra: ['spikes'] }], ab: ['solidshell', 'solidshell'], ride: ['swim', 'swim'], c: ['#5aa0c0', '#8a7a5a'],
    d: ['のんびり屋のカメ。背中に乗せて湖を泳いでくれる。', '岩の甲羅を持つ大ガメ。どんな荒波でも人を運ぶ。'] },
  { n: ['クラゲン', 'クラゲリオン'], t: [['water', 'poison']], evo: [30], a: ['wall', 'balanced'], p: 'blob', h: ['lake', 'sea'],
    f: { extra: ['tentacles'] }, fs: [{}, { extra: ['tentacles', 'crown'] }], ab: ['poisonbody', 'regen'], c: ['#a8d8f8', '#c060c0'],
    d: ['水の中をただようクラゲ。触手にさわるとしびれる。', '無数の触手を持つ海の女王。群れで海を光らせる。'] },
  { n: ['アヒルン', 'アヒルーラ'], t: [['water', 'flying']], evo: [25], a: ['balanced', 'speedster'], p: 'bird', h: ['lake'],
    f: { face: 'beak', tail: 'feather' }, fs: [{}, { extra: ['crest'] }], ab: ['swiftswim', 'swiftswim'], c: ['#fff4b0', '#f0a030'],
    d: ['湖をすいすい泳ぐアヒル。いつもマイペース。', '水面を滑るように走り、そのまま空へ飛び立つ。'] },
  { n: ['ビバロ', 'ビバロック'], t: [['water'], ['water', 'ground']], evo: [26], a: ['tank', 'bruiser'], p: 'quad', h: ['lake'],
    f: { ears: 'round', tail: 'paddle', face: 'teeth' }, fs: [{}, { extra: ['helmet'] }], ab: ['sturdy', 'rockhead'], c: ['#9a6a40', '#d0b080'],
    d: ['木をかじってダムを作るビーバー。働き者。', '川をせき止める巨大なダムを一晩で作り上げる。'] },
  { n: ['ビリウナ', 'ビリウナギン'], t: [['electric', 'water']], evo: [33], a: ['balanced', 'attacker'], p: 'serpent', h: ['lake'],
    f: { back: 'fins', extra: ['spots'] }, fs: [{}, { back: 'fins', extra: ['spots', 'glow'] }], ab: ['minus', 'minus'], c: ['#4a6ae0', '#f7e04a'],
    d: ['水中で電気を放つウナギ。夜の湖をほのかに照らす。', '「プラス」の仲間と組むと強力な放電をくり出す。'] },
  { n: ['パカガイ', 'パールガイ'], t: [['water'], ['water', 'rock']], evo: [30], a: ['wall', 'wall'], p: 'blob', h: ['lake', 'sea'],
    f: { back: 'clam' }, fs: [{}, { back: 'clam', extra: ['gem'] }], ab: ['solidshell', 'sturdy'], c: ['#d0b0e0', '#ffffff'],
    d: ['貝殻をパカパカ開けて話す。中には小さな真珠がある。', '貝の中で育てた真珠は光を放つ宝石となる。'] },
  { n: ['スイレン', 'スイレンヒメ'], t: [['grass', 'water'], ['water', 'fairy']], evo: [30], a: ['hp', 'balanced'], p: 'plant', h: ['lake'],
    f: { back: 'lily' }, fs: [{}, { back: 'lily', extra: ['flowerhead'] }], ab: ['waterabsorb', 'regen'], c: ['#6ac080', '#f8a0c0'],
    d: ['水面に浮かぶ葉の上で昼寝をする。花の香りで仲間を呼ぶ。', '湖の上で舞う姫。清らかな水を守っている。'] },
  { n: ['イルカナ', 'イルカナミ'], t: [['water'], ['water', 'psychic']], evo: [35], a: ['speedster', 'speedster'], p: 'fish', h: ['sea'],
    f: { back: 'fin', tail: 'fin' }, fs: [{}, { back: 'fin', extra: ['gem'] }], ab: ['swiftswim', 'synchro'], ride: ['swim', 'swim'], c: ['#6ab0f0', '#ffffff'],
    d: ['海で遊ぶのが大好きなイルカ。船と並んで泳ぐ。', '心を読む賢いイルカ。人を乗せて大海原を駆ける。'] },
  { n: ['シャクー', 'シャクーガ'], t: [['water', 'dark']], evo: [32], a: ['attacker', 'glass'], p: 'fish', h: ['sea'],
    f: { back: 'fin', tail: 'fin', face: 'teeth' }, fs: [{}, { back: 'fin', face: 'teeth', extra: ['scar'] }], ab: ['strongjaw', 'strongjaw'], ride: [0, 'swim'], c: ['#5a7090', '#f0f0f0'],
    d: ['するどい歯を持つ小さなサメ。血の気が多い。', '海のギャング。乗りこなせれば最速の海の足となる。'] },
  { n: ['クジラン'], t: [['water']], a: ['hp'], p: 'fish', h: ['sea'], rare: true, bstAbs: [345],
    f: { tail: 'fin', extra: ['spots'] }, ab: ['thickfat'], ride: ['swim'], scale: 1.6, c: ['#4a6ab0', '#e0f0ff'],
    d: ['とても大きなクジラのアニモン。背中に小島ができることもある。'] },

  // ===== 砂漠 =====
  { n: ['サソリン', 'サソリガン'], t: [['poison', 'ground']], evo: [36], a: ['attacker', 'bruiser'], p: 'bug', h: ['desert'],
    f: { face: 'pincers', tail: 'stinger' }, fs: [{}, { face: 'pincers', tail: 'stinger', extra: ['armor'] }], ab: ['poisonbody', 'sniper'], c: ['#c09040', '#8040a0'],
    d: ['砂の中にひそむサソリ。しっぽの毒針に注意。', '砂漠の暗殺者。急所をねらう一撃は致命的。'] },
  { n: ['サボトゲ', 'サボトゲラ'], t: [['grass'], ['grass', 'dark']], evo: [32], a: ['tank', 'attacker'], p: 'plant', h: ['desert'],
    f: { back: 'spikes', extra: ['flowerhead'] }, fs: [{}, { back: 'spikes', extra: ['flowerhead', 'mask'] }], ab: ['waterabsorb', 'poisonbody'], c: ['#5aa050', '#f06090'],
    d: ['砂漠で水をたくわえるサボテン。トゲトゲで抱っこはむずかしい。', '夜になると動き出し、トゲの腕で旅人をおどかす。'] },
  { n: ['スナワニ', 'スナワニス', 'スナワニオウ'], t: [['ground', 'dark']], evo: [29, 42], a: ['attacker', 'attacker', 'bruiser'], p: 'quad', h: ['desert'],
    f: { face: 'longjaw', tail: 'long', back: 'spikes' }, fs: [{}, { extra: ['mask'] }, { extra: ['mask', 'crown'] }], ab: ['glare', 'glare', 'moxie'], c: ['#c8a060', '#3a3040'],
    d: ['砂の中を泳ぐワニ。目だけ出して獲物を待つ。', 'サングラスのような模様の目でにらみつける。', '砂漠の王者。倒した相手の数だけ強くなる。'] },
  { n: ['キャラバ'], t: [['ground', 'normal']], a: ['hp'], p: 'quad', h: [], side: 'caravan',
    f: { back: 'humps', ears: 'round', tail: 'short', face: 'snout' }, ab: ['thickfat'], ride: ['land'], c: ['#d8b070', '#a07040'],
    d: ['砂漠のキャラバンを支えるラクダのアニモン。水がなくても何日も歩ける。'] },
  { n: ['コロガシ', 'タイヨウコロガシ'], t: [['bug', 'ground'], ['bug', 'fire']], evo: [34], a: ['tank', 'attacker'], p: 'bug', h: ['desert'],
    f: { horn: 1 }, fs: [{}, { horn: 1, extra: ['sunball'] }], ab: ['sturdy', 'flashfire'], c: ['#3a5a40', '#f0a020'],
    d: ['大きな砂の玉を転がして運ぶ。玉の中に宝物を入れている。', '太陽のような火の玉を転がす。古代では神の使いとされた。'] },
  { n: ['ホウタイ', 'ホウタイオウ'], t: [['ghost', 'ground']], evo: [37], a: ['wall', 'bruiser'], p: 'biped', h: ['pyramid'],
    f: { extra: ['wraps'] }, fs: [{}, { extra: ['wraps', 'crown'] }], ab: ['disguise', 'magicguard'], c: ['#e8e0c8', '#6a5aa8'],
    d: ['王墓をさまよう包帯のアニモン。ほどけると恥ずかしがる。', '古代の王の魂が宿る。王墓に眠る宝を守り続けている。'] },
  { n: ['フェネッコ', 'フェネクス'], t: [['ground'], ['ground', 'fire']], evo: [32], a: ['speedster', 'glass'], p: 'quad', h: ['desert'],
    f: { ears: 'big', tail: 'fluffy', face: 'snout' }, fs: [{}, { tail: 'flame', ears: 'big' }], ab: ['quickfeet', 'flashfire'], c: ['#f0d090', '#f06030'],
    d: ['大きな耳で砂の下の音を聞く砂漠のキツネ。', '熱砂を駆ける炎のキツネ。耳から熱を逃がしている。'] },
  { n: ['ハゲタカン', 'ハゲタカイザー'], t: [['dark', 'flying']], evo: [38], a: ['balanced', 'attacker'], p: 'bird', h: ['desert', 'canyon'],
    f: { face: 'beak', tail: 'feather' }, fs: [{}, { extra: ['scarf', 'crest'] }], ab: ['keeneye', 'moxie'], c: ['#5a4a40', '#f0e0d0'],
    d: ['砂漠の上空を旋回するハゲタカ。弱った獲物を見逃さない。', '砂漠の空を支配する猛禽。翼を広げると太陽が隠れる。'] },
  { n: ['スナトカゲ', 'スナドラコ', 'スナドラゴン'], t: [['ground'], ['ground', 'dragon'], ['ground', 'dragon']], evo: [35, 48], a: ['speedster', 'attacker', 'attacker'], p: ['quad', 'quad', 'dragon'], h: ['desert'],
    f: { tail: 'long', back: 'spikes' }, fs: [{}, { horn: 1, back: 'sail' }, { horn: 2, back: 'wings' }], ab: ['quickfeet', 'adapt', 'adapt'], bst: 0.96, ride: [0, 0, 'fly'], c: ['#d8b860', '#a05030'],
    d: ['砂の上を高速で走るトカゲ。熱い砂でも平気。', '竜の血に目覚めたトカゲ。背中の帆で熱を操る。', '砂嵐を翼で起こす砂漠の竜。背に乗れば空を飛べる。'] },
  { n: ['スフィネコ'], t: [['psychic', 'rock']], a: ['tank'], p: 'quad', h: ['pyramid'], rare: true,
    f: { ears: 'pointy', tail: 'long', extra: ['headdress'] }, ab: ['magicguard'], c: ['#e0c080', '#3060c0'],
    d: ['王墓の謎を守る猫のアニモン。なぞなぞに答えられないと通してくれない。'] },

  // ===== 渓谷 =====
  { n: ['コロイシ', 'ゴロイシ', 'ゴロイシキング'], t: [['rock'], ['rock'], ['rock', 'ground']], evo: [25, 40], a: ['tank', 'bruiser', 'bruiser'], p: 'golem', h: ['canyon'],
    f: {}, fs: [{}, { extra: ['spikes'] }, { extra: ['spikes', 'crown'] }], ab: ['sturdy', 'sturdy', 'rockhead'], c: ['#9a8a70', '#5a4e3a'],
    d: ['道ばたの石にそっくり。踏むと怒って転がってくる。', '岩をくっつけて体を大きくする。山を転がり落ちて移動する。', '岩山のように巨大な王。歩くたびに地響きが起きる。'] },
  { n: ['イワヤギ', 'ガンケイヤギ'], t: [['rock'], ['rock', 'fighting']], evo: [34], a: ['balanced', 'bruiser'], p: 'quad', h: ['canyon'],
    f: { ears: 'pointy', horn: 2, hornStyle: 'curl', tail: 'short', face: 'snout' }, fs: [{}, { horn: 2, hornStyle: 'curl', extra: ['beard'] }], ab: ['sapsipper', 'defiant'], ride: [0, 'land'], c: ['#d0c8b0', '#7a6a50'],
    d: ['けわしい崖をひょいひょい登るヤギ。角で岩をくだく。', '渓谷の崖を自在に駆ける。背に乗れば険しい山道も平気。'] },
  { n: ['ゴンタ', 'ゴンゴウ', 'コンゴウオー'], t: [['fighting'], ['fighting'], ['fighting', 'steel']], evo: [28, 45], a: ['bruiser', 'bruiser', 'attacker'], p: 'biped', h: ['canyon'],
    f: { ears: 'round' }, fs: [{ extra: ['belt'] }, { extra: ['belt', 'scarf'] }, { extra: ['armor', 'crown'] }], ab: ['guts', 'guts', 'innerfocus'], sig: 'sig_kongou', c: ['#c86a4a', '#f0d0a0'],
    d: ['毎日修行にはげむ格闘家の卵。一日千回パンチの練習をする。', '岩山で修行を積んだ戦士。拳一つで岩を砕く。', '金剛の体を手に入れた拳王。その掌打は山をも動かす。'] },
  { n: ['ヨルバット', 'ヨルバットン'], t: [['dark', 'flying']], evo: [30], a: ['speedster', 'speedster'], p: 'bird', h: ['canyon', 'swamp'],
    f: { ears: 'big', back: 'batwings' }, fs: [{}, { ears: 'big', back: 'batwings', face: 'teeth' }], ab: ['keeneye', 'prankster'], c: ['#4a3a6a', '#c04a6a'],
    d: ['洞窟に住むコウモリ。超音波で暗闇でも迷わない。', '夜空を音もなく飛ぶ。闇にまぎれて相手をかく乱する。'] },
  { n: ['マルジロ', 'マルジロガード'], t: [['ground', 'steel']], evo: [34], a: ['wall', 'tank'], p: 'quad', h: ['canyon'],
    f: { back: 'shell', ears: 'pointy', tail: 'short' }, fs: [{}, { back: 'shell', extra: ['spikes'] }], ab: ['solidshell', 'clearbody'], c: ['#a09080', '#606870'],
    d: ['危なくなると丸くなるアルマジロ。転がって逃げる。', '鋼の甲羅で仲間を守る盾役。どんな攻撃も跳ね返す。'] },
  { n: ['ハヤブサン', 'ハヤブサムライ'], t: [['flying'], ['flying', 'fighting']], evo: [36], a: ['speedster', 'attacker'], p: 'bird', h: ['canyon'],
    f: { face: 'beak', tail: 'feather' }, fs: [{}, { extra: ['mask', 'scarf'] }], ab: ['keeneye', 'innerfocus'], ride: [0, 'fly'], c: ['#6a7a9a', '#f0f0e0'],
    d: ['渓谷を最速で飛ぶハヤブサ。狙った獲物は逃さない。', '武士のように誇り高い。主と認めた者を背に乗せて空を飛ぶ。'] },
  { n: ['ジュエルン', 'ジュエリナ'], t: [['rock', 'fairy']], evo: [36], a: ['wall', 'balanced'], p: 'blob', h: ['canyon'],
    f: { extra: ['gem'] }, fs: [{}, { extra: ['gem', 'crown'], back: 'crystal' }], ab: ['clearbody', 'clearbody'], c: ['#f0a0d0', '#a0e0f0'],
    d: ['鉱山の奥で見つかる宝石のアニモン。光を当てるとキラキラ輝く。', '体中が宝石でできている。その輝きは傷ついた心を癒す。'] },
  { n: ['カンテラン', 'カンテラード'], t: [['ghost', 'fire']], evo: [40], a: ['glass', 'glass'], p: 'blob', h: [], side: 'mine',
    f: { extra: ['lantern'] }, fs: [{}, { extra: ['lantern', 'crown'] }], ab: ['flashfire', 'flashfire'], c: ['#5a4a7a', '#ffb040'],
    d: ['廃鉱山をさまよう古いカンテラ。迷子を出口まで照らしてくれる。', '魂の炎を灯す。かつての鉱夫たちの思い出を守っている。'] },
  { n: ['サイゴロ', 'サイゴーン'], t: [['rock', 'ground']], evo: [38], a: ['bruiser', 'bruiser'], p: 'quad', h: ['canyon'],
    f: { horn: 1, hornStyle: 'unicorn', tail: 'short', ears: 'round' }, fs: [{}, { horn: 2, hornStyle: 'unicorn', extra: ['armor'] }], ab: ['rockhead', 'rockhead'], ride: [0, 'land'], c: ['#8a8a90', '#c0b0a0'],
    d: ['角で何でも突き飛ばすサイ。前しか見ていない。', '岩の鎧を持つ巨大なサイ。人を乗せて岩場を突き進む。'] },
  { n: ['ツチノコ'], t: [['ground']], a: ['speedster'], p: 'serpent', h: ['canyon', 'forest'], rare: true, bstAbs: [330],
    f: { extra: ['belly'] }, ab: ['speedboost'], c: ['#9a8a60', '#5a4a30'], short: true,
    d: ['幻と呼ばれるずんぐりしたヘビ。見つけると幸運が訪れるという。'] },

  // ===== 氷山 =====
  { n: ['ペンチョ', 'ペンキング'], t: [['water', 'ice']], evo: [40], a: ['balanced', 'bruiser'], p: 'biped', h: ['snow'],
    f: { face: 'beak' }, fs: [{}, { extra: ['crown', 'cape'] }], ab: ['thickfat', 'thickfat'], c: ['#3a4a6a', '#ffffff'],
    d: ['氷の上をよちよち歩くペンギン。泳ぎは得意。', '氷山の群れを率いる王。冷たい海を自在に泳ぐ。'] },
  { n: ['ユキウサ', 'ユキヒメリア'], t: [['ice'], ['ice', 'fairy']], evo: [40], a: ['speedster', 'speedster'], p: ['quad', 'biped'], h: ['snow'],
    f: { ears: 'long', tail: 'fluffy' }, fs: [{}, { extra: ['crown', 'cape'] }], ab: ['icebody', 'icebody'], sig: 'sig_yukihime', c: ['#ffffff', '#a8d8f8'],
    d: ['雪にまぎれる真っ白なウサギ。耳だけ少し青い。', '雪原で舞う姫。舞うほどに速く美しくなる。'] },
  { n: ['アザラン', 'アザラード'], t: [['water', 'ice']], evo: [38], a: ['hp', 'hp'], p: 'fish', h: ['snow', 'sea'],
    f: { tail: 'fin', face: 'whiskers', extra: ['spots'] }, fs: [{}, { face: 'tusks' }], ab: ['thickfat', 'thickfat'], ride: [0, 'swim'], c: ['#d0d8e0', '#5a6a80'],
    d: ['氷の上でごろごろするアザラシ。脂肪で寒さに強い。', '凍てつく海を泳ぐ。人を背に乗せて流氷を渡る。'] },
  { n: ['ユキコグマ', 'ヒョウガグマ'], t: [['ice'], ['ice', 'fighting']], evo: [40], a: ['bruiser', 'bruiser'], p: ['quad', 'biped'], h: ['snow'],
    f: { ears: 'round', tail: 'short', face: 'snout' }, fs: [{}, { extra: ['claws'], back: 'crystal' }], ab: ['thickfat', 'guts'], c: ['#f0f4ff', '#7ab0d0'],
    d: ['雪の中で生まれた白い子グマ。氷をなめるのが好き。', '氷河の力を宿す大グマ。氷の拳で何でも砕く。'] },
  { n: ['ユキロウ', 'フブキロウ'], t: [['ice', 'dark']], evo: [38], a: ['speedster', 'attacker'], p: 'quad', h: ['snow'],
    f: { ears: 'pointy', tail: 'fluffy', face: 'snout' }, fs: [{}, { back: 'mane', extra: ['scar'] }], ab: ['glare', 'moxie'], ride: [0, 'land'], c: ['#d8e8f8', '#3a4a6a'],
    d: ['吹雪の夜に遠吠えするオオカミの子。群れで行動する。', '吹雪とともに現れる群れのリーダー。雪原を誰よりも速く駆ける。'] },
  { n: ['マンモ', 'マンモーネ', 'マンモスロード'], t: [['ice', 'ground']], evo: [34, 50], a: ['hp', 'bruiser', 'bruiser'], p: 'quad', h: ['snow'],
    f: { ears: 'big', tail: 'short', face: 'trunk' }, fs: [{}, { face: 'tusks', back: 'wool' }, { face: 'tusks', back: 'wool', extra: ['crown'] }], ab: ['thickfat', 'thickfat', 'sturdy'], ride: [0, 0, 'land'], c: ['#a07a5a', '#f0f0f0'],
    d: ['毛むくじゃらの子マンモス。鼻で雪玉を作って遊ぶ。', '大きな牙で氷を割って草を探す。', '氷河時代から生きるといわれる巨獣。背中に乗れば氷山も越えられる。'] },
  { n: ['ヒョウショウ'], t: [['ice', 'psychic']], a: ['glass'], p: 'blob', h: ['icecave'], rare: true,
    f: { back: 'crystal', extra: ['gem'] }, ab: ['magicguard'], c: ['#c0f0ff', '#a080f0'],
    d: ['氷晶の洞窟の奥で光る結晶のアニモン。千年分の記憶を宿すという。'] },
  { n: ['ユキフクロ', 'フブキフクロウ'], t: [['ice', 'flying']], evo: [40], a: ['balanced', 'balanced'], p: 'bird', h: ['snow'],
    f: { ears: 'tuft', face: 'beak', tail: 'feather' }, fs: [{}, { extra: ['crest'], back: 'crystal' }], ab: ['keeneye', 'icebody'], ride: [0, 'fly'], c: ['#ffffff', '#8ab0e0'],
    d: ['雪原で静かに獲物を探す白いフクロウ。', '吹雪を起こして飛ぶ大フクロウ。背中に乗れば雪山を越えられる。'] },

  // ===== 湿原 =====
  { n: ['ヌメール', 'ヌメドロン'], t: [['poison'], ['poison', 'ground']], evo: [38], a: ['hp', 'tank'], p: 'blob', h: ['swamp'],
    f: {}, fs: [{}, { extra: ['bubbles'] }], ab: ['poisonheal', 'poisonheal'], c: ['#8a5ab0', '#60a050'],
    d: ['沼の泥から生まれたスライム。毒がむしろ元気のもと。', '毒の沼そのものが動き出したような巨体。'] },
  { n: ['ガマガマ', 'ガマオヤブン'], t: [['poison', 'water']], evo: [36], a: ['hp', 'bruiser'], p: 'biped', h: ['swamp'],
    f: { extra: ['spots'] }, fs: [{}, { extra: ['spots', 'cape'] }], ab: ['waterabsorb', 'thickfat'], c: ['#7a8a4a', '#e0c070'],
    d: ['沼で大きな声で鳴くガマガエル。のどをふくらませて威嚇する。', '沼の親分。子分のガマガマたちを率いている。'] },
  { n: ['オバケン', 'オバケンシ', 'オバケンゴウ'], t: [['ghost'], ['ghost', 'steel'], ['ghost', 'steel']], evo: [30, 45], a: ['glass', 'attacker', 'attacker'], p: ['blob', 'biped', 'biped'], h: ['swamp'],
    f: { tail: 'ghost' }, fs: [{}, { extra: ['sword', 'helmet'] }, { extra: ['sword', 'helmet', 'armor', 'cape'] }], ab: ['disguise', 'technician', 'technician'], c: ['#9a8ad8', '#c0c8d0'],
    d: ['夜の湿原にあらわれるおばけ。人をおどかすのが生きがい。', '古い剣に宿った霊。剣士として修行を始めた。', '霊剣を振るう亡霊の剣豪。その剣筋は誰にも見切れない。'] },
  { n: ['ヒトダマン', 'オニビダマ'], t: [['ghost', 'psychic']], evo: [38], a: ['glass', 'glass'], p: 'blob', h: ['swamp'],
    f: { tail: 'ghost', extra: ['glow'] }, fs: [{}, { tail: 'ghost', extra: ['glow', 'halo'] }], ab: ['levitate', 'levitate'], c: ['#a0e0ff', '#5a6ad0'],
    d: ['青白く光る人魂。迷い込んだ旅人の後をついてくる。', '鬼火を自在に操る。見た者の心を読むという。'] },
  { n: ['トンボン', 'トンボルグ'], t: [['bug', 'water'], ['bug', 'flying']], evo: [34], a: ['speedster', 'speedster'], p: 'bug', h: ['swamp', 'lake'],
    f: { back: 'wings' }, fs: [{}, { back: 'wings', extra: ['glow'] }], ab: ['speedboost', 'speedboost'], bst: 0.95, c: ['#3a8ad0', '#a0f0c0'],
    d: ['水辺を飛び回るトンボ。大きな目で全方向を見ている。', '音速で飛ぶといわれる。とどまることなく加速し続ける。'] },
  { n: ['ドクバナ', 'ドクバナーラ', 'ドクバナクイーン'], t: [['grass', 'poison']], evo: [28, 44], a: ['hp', 'balanced', 'balanced'], p: 'plant', h: ['swamp'],
    f: { extra: ['flowerhead'] }, fs: [{}, { extra: ['flowerhead'], back: 'leaf' }, { extra: ['flowerhead', 'crown'], back: 'flowers' }], ab: ['poisonbody', 'poisonbody', 'regen'], sig: 'sig_toxiqueen', c: ['#7ab040', '#c040a0'],
    d: ['甘い香りで虫を誘う毒の花。かわいいけど危険。', '毒の花びらを舞わせて踊る。', '湿原に咲く毒花の女王。その口づけは命を吸う。'] },
  { n: ['カゲコ', 'カゲロウガ'], t: [['dark'], ['dark', 'ghost']], evo: [40], a: ['speedster', 'glass'], p: 'quad', h: ['swamp'],
    f: { ears: 'pointy', tail: 'fluffy', face: 'snout' }, fs: [{}, { tail: 'twin', extra: ['mask', 'glow'] }], ab: ['sniper', 'sniper'], sig: 'sig_kagerou', c: ['#3a3a4a', '#a060f0'],
    d: ['影から影へ移動する子ギツネ。めったに姿を見せない。', '陽炎のように揺らめく影の狐。先手で敵を切り裂く。'] },
  { n: ['ヌマヌシ'], t: [['water', 'ground']], a: ['hp'], p: 'fish', h: [], side: 'swampboss', scale: 1.5,
    f: { face: 'whiskers', tail: 'fin', extra: ['crown'] }, ab: ['waterabsorb'], c: ['#5a6a50', '#d0c080'],
    d: ['湿原の底に棲む巨大ナマズ。沼の主として恐れられている。'] },

  // ===== 高原 =====
  { n: ['ハネコマ', 'ハネスター'], t: [['fairy', 'flying']], evo: [42], a: ['speedster', 'speedster'], p: 'quad', h: ['highland'],
    f: { ears: 'pointy', tail: 'long', back: 'wings', face: 'snout' }, fs: [{}, { horn: 1, hornStyle: 'unicorn', back: 'wings', extra: ['star'] }], ab: ['serenegrace', 'serenegrace'], ride: ['fly', 'fly'], c: ['#ffffff', '#f0b0e0'],
    d: ['翼を持つ子ウマ。雲の上で生まれるといわれる。', '星をまとう天馬。主を乗せて天空を駆ける。'] },
  { n: ['セイラ', 'セイラン', 'セイランバード'], t: [['flying'], ['flying'], ['flying', 'psychic']], evo: [30, 48], a: ['speedster', 'speedster', 'attacker'], p: 'bird', h: ['highland'],
    f: { face: 'beak', tail: 'feather' }, fs: [{}, { extra: ['crest'], tail: 'long' }, { extra: ['crest', 'halo'], tail: 'long' }], ab: ['keeneye', 'keeneye', 'serenegrace'], ride: [0, 0, 'fly'], sig: 'sig_seiran', c: ['#5ab0e0', '#f0f0ff'],
    d: ['高原の青空のような羽を持つ小鳥。', '晴れた日に高原の風に乗って舞う。', '晴嵐の化身。その羽ばたきは天候さえ変える。'] },
  { n: ['モクモ', 'モクモクジラ'], t: [['normal', 'flying']], evo: [44], a: ['hp', 'hp'], p: 'fish', h: ['highland'],
    f: { back: 'cloud', tail: 'fin' }, fs: [{}, { back: 'cloud', tail: 'fin', extra: ['spots'] }], ab: ['friendguard', 'friendguard'], support: 'decoy', ride: [0, 'fly'], c: ['#ffffff', '#a0c0f0'],
    d: ['雲にまぎれて浮かぶ小さな雲クジラ。', '空を泳ぐ巨大な雲クジラ。背中に乗れば空の旅ができる。'] },
  { n: ['ハナリン', 'ハナリンドウ'], t: [['fairy', 'grass']], evo: [40], a: ['hp', 'balanced'], p: 'plant', h: ['highland'],
    f: { extra: ['flowerhead'] }, fs: [{}, { extra: ['flowerhead', 'halo'], back: 'flowers' }], ab: ['sunbask', 'powerspot'], support: 'cheer', c: ['#f8b0d0', '#7ac060'],
    d: ['高原に咲く花の妖精。仲間を応援するのが得意。', '仲間の力を引き出す花の妖精。ダブルバトルの名サポーター。'] },
  { n: ['ミコネコ', 'ミコトラ'], t: [['psychic'], ['psychic', 'fighting']], evo: [42], a: ['glass', 'attacker'], p: 'quad', h: ['highland'],
    f: { ears: 'pointy', tail: 'long', face: 'whiskers', extra: ['halo'] }, fs: [{}, { extra: ['halo', 'stripes', 'scarf'] }], ab: ['synchro', 'innerfocus'], sig: 'sig_mikoto', c: ['#f0e0f8', '#c050a0'],
    d: ['神社に住みつく巫女のようなネコ。不思議な力で未来を占う。', '神託を告げる霊獣。その光は邪悪を打ち払う。'] },
  { n: ['ライチョ', 'ライチョウオー'], t: [['electric', 'flying']], evo: [44], a: ['speedster', 'attacker'], p: 'bird', h: ['highland'],
    f: { face: 'beak', tail: 'bolt' }, fs: [{}, { extra: ['crest', 'glow'], tail: 'bolt' }], ab: ['voltabsorb', 'minus'], ride: [0, 'fly'], c: ['#f7e040', '#3a3a5a'],
    d: ['雷雲の中で生まれる雷鳥。羽ばたくと火花が散る。', '雷の王。「プラス」の仲間と組むと雷を倍増させる。'] },
  { n: ['ドラコ', 'ドラコーン', 'ドラコンロード'], t: [['dragon'], ['dragon'], ['dragon', 'flying']], evo: [35, 55], a: ['balanced', 'attacker', 'attacker'], p: ['quad', 'quad', 'dragon'], h: ['highland', 'skytower'], rare: true,
    f: { tail: 'long', horn: 1 }, fs: [{}, { horn: 2, back: 'spikes' }, { horn: 2, back: 'wings', extra: ['crown'] }], ab: ['soul_dragon', 'soul_dragon', 'multiscale'], ride: [0, 0, 'fly'], bst: 0.98, c: ['#6270ec', '#eacb60'],
    d: ['竜の子ども。まだうまく火を吹けない。', '鋭い角と爪を持つ若き竜。', '天空を統べる竜の王。背に乗れば空の果てまで行ける。'] },

  // ===== 火山 =====
  { n: ['マグマル', 'マグマグ', 'マグマジン'], t: [['fire', 'rock']], evo: [30, 50], a: ['tank', 'bruiser', 'bruiser'], p: 'golem', h: ['volcano'],
    f: { extra: ['lava'] }, fs: [{}, { extra: ['lava', 'spikes'] }, { extra: ['lava', 'spikes', 'crown'] }], ab: ['flamebody', 'flamebody', 'solidshell'], c: ['#3a3030', '#ff6020'],
    d: ['溶岩のかたまりから生まれた。触るとやけどする。', '体の中をマグマが流れる。怒ると噴火する。', '火山そのものの化身。体から溶岩があふれ出る。'] },
  { n: ['サラマ', 'サラマンダラ'], t: [['fire', 'poison']], evo: [44], a: ['speedster', 'glass'], p: 'quad', h: ['volcano'],
    f: { tail: 'flame', extra: ['spots'] }, fs: [{}, { tail: 'flame', back: 'flame', extra: ['spots'] }], ab: ['flashfire', 'adapt'], bst: 0.96, c: ['#e04a30', '#a040d0'],
    d: ['火山の熱い岩の上で暮らすサンショウウオ。', '毒の炎をまとう大トカゲ。炎と毒の技を極めている。'] },
  { n: ['ヒノトリス', 'ヒノトリオン'], t: [['fire', 'flying']], evo: [45], a: ['speedster', 'attacker'], p: 'bird', h: ['volcano'],
    f: { face: 'beak', tail: 'flame' }, fs: [{}, { tail: 'flame', back: 'flame', extra: ['crest'] }], ab: ['flamebody', 'flamebody'], ride: [0, 'fly'], c: ['#ff7030', '#ffe060'],
    d: ['火山の噴煙の中を飛ぶ火の鳥のひな。', '炎の翼で空を焦がす不死鳥。背中に乗っても熱くない不思議な炎。'] },
  { n: ['ヨウガメ', 'ヨウガメラ'], t: [['fire', 'ground']], evo: [42], a: ['wall', 'tank'], p: 'turtle', h: ['volcano'],
    f: { back: 'shell', extra: ['lava'] }, fs: [{}, { back: 'volcano', extra: ['lava'] }], ab: ['solidshell', 'flamebody'], c: ['#5a4a40', '#ff6030'],
    d: ['甲羅から煙を出す溶岩ガメ。のんびりしている。', '甲羅に小さな火山を背負う。ときどき噴火する。'] },
  { n: ['ヒバナウマ', 'ヒバナテンバ'], t: [['fire'], ['fire', 'fairy']], evo: [40], a: ['speedster', 'speedster'], p: 'quad', h: ['volcano'],
    f: { ears: 'pointy', back: 'mane', tail: 'flame', face: 'snout' }, fs: [{}, { horn: 1, hornStyle: 'unicorn', back: 'mane', tail: 'flame' }], ab: ['flashfire', 'quickfeet'], ride: ['land', 'land'], c: ['#fff0d0', '#ff7040'],
    d: ['火花のたてがみを持つ子ウマ。走ると火の粉が舞う。', '炎の一角を持つ天馬。背に乗れば溶岩の上も駆け抜ける。'] },
  { n: ['オブシ', 'オブシディア'], t: [['rock', 'dark']], evo: [45], a: ['tank', 'bruiser'], p: 'golem', h: ['volcano'],
    f: { extra: ['gem'] }, fs: [{}, { extra: ['gem', 'spikes', 'crown'] }], ab: ['clearbody', 'defiant'], c: ['#2a2a3a', '#a040a0'],
    d: ['黒曜石でできた体を持つ。表面は鏡のようにつるつる。', '漆黒の鎧をまとう石の騎士。能力を下げられるほど燃え上がる。'] },
  { n: ['テツカジ', 'テツカジシ'], t: [['steel', 'fire']], evo: [44], a: ['bruiser', 'bruiser'], p: 'biped', h: ['volcano'],
    f: { ears: 'round', extra: ['hammer'] }, fs: [{}, { extra: ['hammer', 'armor', 'belt'] }], ab: ['flashfire', 'technician'], c: ['#8a8a9a', '#ff8030'],
    d: ['火山で金属を打つ小さな鍛冶屋。ハンマーは自作。', '伝説の武具を作る鍛冶師。炎と鋼の技を極めた。'] },

  // ===== 聖域 =====
  { n: ['イニシエ', 'イニシエノカミ'], t: [['rock', 'psychic']], evo: [60], a: ['tank', 'balanced'], p: 'golem', h: ['ruins', 'sanctuary'], rare: true,
    f: { extra: ['runes'] }, fs: [{}, { extra: ['runes', 'halo', 'crown'] }], ab: ['clearbody', 'magicguard'], sig: 'sig_kotodama', c: ['#b0a890', '#60e0d0'],
    d: ['古代の遺跡で眠っていた石像のアニモン。古い言葉を話す。', '古代文明が祀った神。いにしえの歌で岩を呼び起こす。'] },
  { n: ['テンシル', 'テンシエル'], t: [['fairy', 'flying']], evo: [55], a: ['balanced', 'balanced'], p: 'biped', h: ['sanctuary'],
    f: { back: 'wings', extra: ['halo'] }, fs: [{}, { back: 'wings', extra: ['halo', 'cape'] }], ab: ['powerspot', 'powerspot'], support: 'cheer', c: ['#ffffff', '#f0d060'],
    d: ['聖域に住む天使のようなアニモン。仲間に力を分け与える。', '聖域を守護する天使。仲間の力を何倍にも高める。'] },
  { n: ['ガイアモ', 'ガイアモス'], t: [['ground', 'bug']], evo: [50], a: ['tank', 'tank'], p: ['serpent', 'bug'], h: ['sanctuary', 'inner'],
    f: { extra: ['antenna'] }, fs: [{}, { back: 'wings', extra: ['antenna', 'runes'] }], ab: ['sturdy', 'solidshell'], sig: 'sig_gaia', c: ['#8a7050', '#60c0a0'],
    d: ['聖域の大地の下で眠る幼虫。大地の力を吸って育つ。', '大地の鼓動を羽ばたきで伝える巨大な蛾。'] },
  { n: ['クリスタリュウ'], t: [['dragon', 'fairy']], a: ['balanced'], p: 'dragon', h: ['inner'], rare: true, bstAbs: [372],
    f: { horn: 2, back: 'crystal', tail: 'long' }, ab: ['multiscale'], c: ['#d0f0ff', '#f0b0f0'],
    d: ['聖域の奥地にだけ住む水晶の竜。その姿を見た者はほとんどいない。'] },
  { n: ['ヤミノコ', 'ヤミノオウ'], t: [['dark', 'psychic']], evo: [55], a: ['glass', 'attacker'], p: ['blob', 'biped'], h: ['sanctuary', 'abyss'],
    f: { extra: ['mask'] }, fs: [{}, { extra: ['mask', 'cape', 'crown'] }], ab: ['prankster', 'adapt'], bst: 0.97, c: ['#3a2a4a', '#f04a7a'],
    d: ['聖域の影に生まれた闇の子。光をこわがる。', '闇を統べる王。強大な念力と闇の力を併せ持つ。'] },
];

// 伝説（図鑑199・200）
const LEGENDS = [
  { n: ['エンテイオウ'], t: [['fire', 'dragon']], a: ['custom'], stats: [118, 125, 112, 65], p: 'dragon', legend: true, scale: 2.4,
    f: { horn: 3, back: 'wings', tail: 'flame', extra: ['crown', 'armor', 'mane'] }, ab: 'haou', ride: ['fly'], sig: 'sig_haou', c: ['#c42a1a', '#ffc040'],
    d: ['大地の炎をつかさどる伝説の覇王。その炎は大陸を生んだといわれる。耐久力と攻撃力はあらゆるアニモンを上回るが、動きは重い。'] },
  { n: ['ナルメクシア'], t: [['water', 'flying']], a: ['custom'], stats: [92, 120, 82, 126], p: 'leviathan', legend: true, scale: 2.4,
    f: { back: 'wings', tail: 'fin', horn: 2, extra: ['crown', 'whiskers'] }, ab: 'soten', ride: ['fly'], sig: 'sig_tenkai', c: ['#2a70e0', '#e8f8ff'],
    d: ['天と海をつかさどる伝説の女王。嵐の中を誰よりも速く飛ぶ。攻撃と素早さに優れるが、耐久力はやや低い。'] },
];

// ---------- 種族テーブル生成 ----------
export const SPECIES = [null]; // 1始まり
export const BY_NAME = {};
const STAGE_BST = { 3: [205, 282, 352], 2: [232, 345], 1: [338] };
const STARTER_BST = [228, 300, 364];

function arr(v, i) { return Array.isArray(v) ? (v[i] ?? v[v.length - 1]) : v; }

let lineId = 0;
function addLine(L, isLegend = false) {
  lineId++;
  const len = L.n.length;
  const ids = [];
  for (let i = 0; i < len; i++) {
    const id = SPECIES.length;
    ids.push(id);
    const types = (L.t.length === 1 ? L.t[0] : L.t[i]).slice();
    const stage = i + 1;
    // 能力値
    let stats;
    if (L.stats) stats = L.stats.slice();
    else {
      let total = L.bstAbs ? L.bstAbs[i] : (L.starter ? STARTER_BST[i] : STAGE_BST[len][i]);
      if (L.bst && !L.bstAbs) total = Math.round(total * L.bst);
      const fr = ARCH[arr(L.a, i)];
      const r = mulberry32(id * 131 + 7);
      stats = fr.map(f => Math.round(total * f * (0.96 + r() * 0.08)));
    }
    const f = { ...L.f, ...(L.fs ? L.fs[i] : {}) };
    const sp = {
      id, line: lineId, name: L.n[i], types, stage, stages: len, evoTo: i < len - 1 ? id + 1 : null, evoFrom: i > 0 ? id - 1 : null, evoLv: i < len - 1 ? L.evo[i] : null,
      base: { hp: stats[0], atk: stats[1], def: stats[2], spe: stats[3] }, plan: arr(L.p, i), feats: f, ability: arr(L.ab, i),
      ride: L.ride ? (L.ride[i] || null) : null, desc: L.d[i], color: L.c || null, hab: L.h || [], legend: !!L.legend, starter: !!L.starter,
      story: !!L.story, side: L.side || null, rare: !!L.rare, scale: L.scale || 1, short: !!L.short,
      sig: L.sig && MOVES[L.sig] && MOVES[L.sig].sig === L.n[i] ? L.sig : null,
      sigSlot: L.sigSlot || 8, support: L.support || null,
    };
    // 捕まえやすさ・経験値
    if (sp.legend) { sp.catchRate = 0; sp.baseExp = 320; }
    else if (len === 1) { sp.catchRate = sp.rare ? 35 : 75; sp.baseExp = 175; }
    else if (len === 2) { sp.catchRate = i === 0 ? 170 : 55; sp.baseExp = i === 0 ? 70 : 190; }
    else { sp.catchRate = [190, 90, 40][i]; sp.baseExp = [60, 140, 235][i]; }
    sp.moves = buildLearnset(sp, lineId);
    SPECIES.push(sp);
    BY_NAME[sp.name] = sp;
  }
  return ids;
}

function buildLearnset(sp, seed) {
  const r = mulberry32(seed * 7919 + 13);
  const ch = (a) => a[Math.floor(r() * a.length)];
  const used = new Set();
  const take = (...lists) => {
    for (const l of lists) {
      if (!l) continue;
      const c = l.filter(x => !used.has(x));
      if (c.length) { const m = ch(c); used.add(m); return m; }
    }
    return null;
  };
  const [t1, t2] = sp.types;
  const P = (t, tier) => POOLS[t]?.[tier];
  const cov = t2 || ch(COVERAGE[t1]);
  const cov2 = t2 ? ch(COVERAGE[t1]) : ch(COVERAGE[t1].filter(x => x !== cov));
  const list = [];
  list.push(take(t1 === 'normal' ? P('normal', 1) : ['tackle', 'scratch'], P('normal', 1)));
  list.push(take(P(t1, 1), P(t1, 2)));
  if (sp.support) { used.add(sp.support); list.push(sp.support); }
  else list.push(take(P(t1, 0), t2 ? P(t2, 0) : null, P('normal', 0)));
  list.push(take(P(t1, 2), P(t1, 1)));
  list.push(take(P(cov, 2), P(cov, 1), P('normal', 2)));
  list.push(take(P(t1, 3), P(t1, 2)));
  list.push(take(P(cov2, 3), P(cov, 3), P('normal', 3)));
  list.push(take(P(t1, 4), P(t1, 3)));
  if (sp.sig) list[(sp.sigSlot || 8) - 1] = sp.sig;
  const sched = sp.legend ? [1, 1, 1, 1, 60, 70, 80, 90] : sp.stages === 1 ? [1, 1, 6, 12, 20, 30, 40, 52]
    : sp.stage === 1 ? [1, 1, 6, 12, 18, 25, 33, 44] : sp.stage === 2 ? [1, 1, 6, 12, 18, 26, 36, 48] : [1, 1, 6, 12, 18, 28, 42, 56];
  return list.map((m, i) => ({ id: m, lv: sched[i] }));
}

for (const L of LINES) addLine(L);
for (const L of LEGENDS) addLine(L, true);

// 伝説の技は特別技を含む強力なものに
for (const sp of SPECIES) {
  if (!sp) continue;
  if (sp.name === 'エンテイオウ') sp.moves = [['sig_haou', 1], ['dragonclaw', 1], ['earthrage', 1], ['kindle', 1], ['heatflow', 60], ['dragonrage', 70], ['magmaground', 80], ['infernoshot', 90]].map(([id, lv]) => ({ id, lv }));
  if (sp.name === 'ナルメクシア') sp.moves = [['sig_tenkai', 1], ['skydive', 1], ['frostbreath', 1], ['tailwind', 1], ['windblade', 60], ['bigwave', 70], ['aquacannon', 80], ['tornado', 90]].map(([id, lv]) => ({ id, lv }));
}

export const DEX_COUNT = SPECIES.length - 1;
export const LEGEND_IDS = SPECIES.filter(s => s && s.legend).map(s => s.id);
export function sp(id) { return SPECIES[id]; }

// 特別技の持ち主の整合チェック
for (const m of Object.values(MOVES)) if (m.sig && !BY_NAME[m.sig]) console.warn('特別技の持ち主が見つかりません', m.name, m.sig);
