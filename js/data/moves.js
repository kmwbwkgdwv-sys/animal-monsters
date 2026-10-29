// 技データ
// e: 追加効果 [種類, 確率 or 変化量, 対象, 確率]
//   状態異常: ['brn'|'psn'|'par'|'slp'|'frz', 確率]   ひるみ: ['flinch', 確率]
//   能力変化: ['atk'|'def'|'spe'|'acc', 変化量, 'self'|'foe', 確率]
// tier: 1=弱 2=中 3=強 4=最強 0=変化技
export const MOVES = {};
function mv(id, name, type, power, acc, pp, tier, o = {}) {
  MOVES[id] = { id, name, type, power, acc, pp, tier, pri: o.pri || 0, e: o.e || [], crit: o.crit || 0, drain: o.drain || 0, recoil: o.recoil || 0, heal: o.heal || 0,
    protect: !!o.protect, redirect: !!o.redirect, help: !!o.help, sig: o.sig || null, desc: o.desc || '' };
}

// ---- ノーマル ----
mv('tackle', 'たいあたり', 'normal', 40, 100, 35, 1, { desc: '体ごとぶつかって攻撃する。' });
mv('scratch', 'ひっかく', 'normal', 40, 100, 35, 1, { desc: 'するどい爪でひっかく。' });
mv('quick', 'すばやいいちげき', 'normal', 40, 100, 30, 1, { pri: 1, desc: '必ず先制できる素早い一撃。' });
mv('headbutt', 'ずつき', 'normal', 70, 100, 15, 2, { e: [['flinch', 30]], desc: '頭突き。相手をひるませることがある。' });
mv('bodyslam', 'のしかかり', 'normal', 85, 100, 15, 3, { e: [['par', 30]], desc: '全体重でのしかかる。まひさせることがある。' });
mv('fulltackle', 'フルパワータックル', 'normal', 120, 100, 10, 4, { recoil: 1 / 3, desc: '捨て身の突進。自分も反動を受ける。' });
mv('megabeam', 'メガトンビーム', 'normal', 130, 90, 5, 4, { e: [['spe', -1, 'self', 100]], desc: '強烈な光線。撃った後、自分の素早さが下がる。' });
mv('growl', 'いかくのこえ', 'normal', 0, 100, 30, 0, { e: [['atk', -1, 'foe', 100]], desc: '相手の攻撃を下げる。' });
mv('harden', 'かたくなる', 'normal', 0, null, 30, 0, { e: [['def', 1, 'self', 100]], desc: '自分の防御を上げる。' });
mv('powerup', 'ちからため', 'normal', 0, null, 20, 0, { e: [['atk', 2, 'self', 100]], desc: '自分の攻撃をぐーんと上げる。' });
mv('windstep', 'かぜのあし', 'normal', 0, null, 20, 0, { e: [['spe', 2, 'self', 100]], desc: '自分の素早さをぐーんと上げる。' });
mv('guard', 'まもりのかまえ', 'normal', 0, null, 10, 0, { pri: 4, protect: true, desc: 'そのターン相手の攻撃を受けない。連続で使うと失敗しやすい。' });
mv('recover', 'じこしゅうふく', 'normal', 0, null, 10, 0, { heal: 0.5, desc: '最大HPの半分を回復する。' });
mv('decoy', 'おとりのさけび', 'normal', 0, null, 20, 0, { pri: 2, redirect: true, desc: '【ダブル】そのターン、相手の攻撃を自分に集める。' });
mv('cheer', 'エール', 'normal', 0, null, 20, 0, { pri: 3, help: true, desc: '【ダブル】味方の次の技の威力を1.5倍にする。' });

// ---- 炎 ----
mv('emberdart', 'ほのおのつぶて', 'fire', 40, 100, 25, 1, { e: [['brn', 10]], desc: '小さな火の玉。やけどさせることがある。' });
mv('burnfang', 'やきつけキバ', 'fire', 65, 95, 15, 2, { e: [['brn', 10], ['flinch', 10]], desc: '炎をまとったキバでかみつく。' });
mv('flaredash', 'フレアダッシュ', 'fire', 60, 100, 20, 2, { e: [['spe', 1, 'self', 100]], desc: '炎をまとって突進し素早さを上げる。' });
mv('heatflow', 'ねつりゅう', 'fire', 85, 100, 15, 3, { e: [['brn', 20]], desc: '高熱の奔流を放つ。' });
mv('infernoshot', 'ごうえんほう', 'fire', 110, 85, 5, 4, { e: [['brn', 30]], desc: '超高温の炎の砲撃。' });
mv('blazestrike', 'ブレイズストライク', 'fire', 120, 100, 10, 4, { recoil: 1 / 3, e: [['brn', 10]], desc: '燃えさかる体当たり。反動を受ける。' });
mv('kindle', 'たきつける', 'fire', 0, null, 20, 0, { e: [['atk', 2, 'self', 100]], desc: '闘志を燃やして攻撃をぐーんと上げる。' });
mv('willfire', 'まどうび', 'fire', 0, 85, 15, 0, { e: [['brn', 100]], desc: '怪しい炎で相手をやけどにする。' });

// ---- 水 ----
mv('splash', 'みずしぶき', 'water', 40, 100, 25, 1, { desc: '勢いよく水をかける。' });
mv('aquaspin', 'アクアスピン', 'water', 60, 100, 20, 2, { e: [['spe', 1, 'self', 50]], desc: '水をまとい回転攻撃。素早さが上がることがある。' });
mv('whirl', 'うずしお', 'water', 70, 95, 15, 2, { e: [['flinch', 10]], desc: '渦潮で巻き込む。' });
mv('bigwave', 'ビッグウェーブ', 'water', 90, 100, 15, 3, { desc: '大波で押し流す。' });
mv('aquacannon', 'アクアキャノン', 'water', 110, 80, 5, 4, { desc: '高圧の水流を撃ち出す。' });
mv('hydrobreak', 'ハイドロブレイク', 'water', 120, 100, 10, 4, { recoil: 1 / 3, desc: '激流をまとった突撃。反動を受ける。' });
mv('waterveil', 'みずのベール', 'water', 0, null, 20, 0, { e: [['def', 2, 'self', 100]], desc: '水の膜で防御をぐーんと上げる。' });
mv('aquaring', 'アクアリング', 'water', 0, null, 10, 0, { heal: 0.5, desc: '清らかな水でHPを半分回復。' });

// ---- 草 ----
mv('leafthrow', 'リーフスロー', 'grass', 40, 100, 25, 1, { desc: '鋭い葉を投げつける。' });
mv('vinebind', 'ツタしばり', 'grass', 55, 100, 20, 2, { e: [['spe', -1, 'foe', 100]], desc: 'ツタで縛り素早さを下げる。' });
mv('rootsip', 'ねっこすい', 'grass', 65, 100, 15, 2, { drain: 0.5, desc: '与えたダメージの半分を回復する。' });
mv('petalstorm', 'はなふぶき', 'grass', 85, 100, 15, 3, { desc: '花びらの嵐で攻撃する。' });
mv('solarcannon', 'ソーラーキャノン', 'grass', 120, 85, 5, 4, { desc: '光を集めた砲撃。' });
mv('forestrage', 'しんりんのいかり', 'grass', 120, 90, 5, 4, { e: [['atk', -2, 'self', 100]], desc: '森の怒りを放つ。自分の攻撃ががくっと下がる。' });
mv('sleeppollen', 'ねむりのかふん', 'grass', 0, 75, 15, 0, { e: [['slp', 100]], desc: '花粉で相手を眠らせる。' });
mv('sunbath', 'ひかりあび', 'grass', 0, null, 10, 0, { heal: 0.5, desc: '光を浴びてHPを半分回復。' });

// ---- 電気 ----
mv('zaptouch', 'ピリピリタッチ', 'electric', 40, 100, 30, 1, { e: [['par', 10]], desc: '電気を帯びた手で触る。' });
mv('shockfang', 'でんげきキバ', 'electric', 65, 95, 15, 2, { e: [['par', 10], ['flinch', 10]], desc: '電気のキバでかみつく。' });
mv('boltshot', 'いなずまショット', 'electric', 75, 100, 15, 2, { e: [['par', 10]], desc: '稲妻を撃ち出す。' });
mv('thunderball', 'らいめいだん', 'electric', 90, 100, 15, 3, { e: [['par', 10]], desc: '雷鳴とどろく電撃弾。' });
mv('gigavolt', 'ギガボルト', 'electric', 110, 75, 5, 4, { e: [['par', 30]], desc: '巨大な落雷。' });
mv('lightningtackle', 'ライトニングタックル', 'electric', 120, 100, 10, 4, { recoil: 1 / 3, e: [['par', 10]], desc: '電撃をまとった突進。反動を受ける。' });
mv('stunpulse', 'しびれパルス', 'electric', 0, 90, 20, 0, { e: [['par', 100]], desc: '電磁波で相手をまひさせる。' });
mv('charge', 'チャージアップ', 'electric', 0, null, 20, 0, { e: [['atk', 1, 'self', 100], ['def', 1, 'self', 100]], desc: '電気をためて攻撃と防御を上げる。' });

// ---- 氷 ----
mv('powder', 'こなゆき', 'ice', 40, 100, 25, 1, { e: [['frz', 10]], desc: '粉雪を吹きつける。' });
mv('icicle', 'つららばり', 'ice', 60, 100, 20, 2, { e: [['flinch', 10]], desc: 'つららを突き刺す。' });
mv('frostfang', 'ひょうがキバ', 'ice', 65, 95, 15, 2, { e: [['frz', 10], ['flinch', 10]], desc: '氷のキバでかみつく。' });
mv('frostbreath', 'フロストブレス', 'ice', 85, 100, 10, 3, { e: [['frz', 10]], desc: '凍える息を吐く。' });
mv('absolutewind', 'ぜったいれいふう', 'ice', 110, 70, 5, 4, { e: [['frz', 20]], desc: '絶対零度の暴風。' });
mv('glacierdrop', 'ひょうざんおとし', 'ice', 110, 95, 10, 4, { e: [['spe', -1, 'self', 100]], desc: '氷山を落とす。自分の素早さが下がる。' });
mv('icearmor', 'こおりのよろい', 'ice', 0, null, 20, 0, { e: [['def', 2, 'self', 100]], desc: '氷をまとって防御をぐーんと上げる。' });

// ---- 格闘 ----
mv('jab', 'ジャブ', 'fighting', 40, 100, 30, 1, { pri: 1, desc: '先制の素早いパンチ。' });
mv('spinkick', 'せんぷうげり', 'fighting', 60, 100, 20, 2, { e: [['flinch', 20]], desc: '回し蹴り。ひるませることがある。' });
mv('ironfist', 'てっけん', 'fighting', 75, 100, 15, 2, { desc: '鍛え抜いた拳で殴る。' });
mv('fistwave', 'けんぷうしょう', 'fighting', 90, 100, 10, 3, { e: [['def', -1, 'foe', 10]], desc: '拳圧の衝撃波。' });
mv('allout', 'ぜんしんげき', 'fighting', 120, 100, 5, 4, { e: [['def', -1, 'self', 100]], desc: '全身全霊の連撃。自分の防御が下がる。' });
mv('heeldrop', 'かかとおとし', 'fighting', 100, 90, 10, 4, { desc: '高く跳んでかかとを落とす。' });
mv('train', 'きたえる', 'fighting', 0, null, 20, 0, { e: [['atk', 1, 'self', 100], ['def', 1, 'self', 100]], desc: '体を鍛えて攻撃と防御を上げる。' });

// ---- 毒 ----
mv('poisonthorn', 'どくのトゲ', 'poison', 40, 100, 30, 1, { e: [['psn', 30]], desc: '毒のトゲを刺す。' });
mv('acid', 'さんせいえき', 'poison', 60, 100, 20, 2, { e: [['def', -1, 'foe', 30]], desc: '酸をかけて防御を下げることがある。' });
mv('venomblade', 'どくのやいば', 'poison', 80, 100, 15, 3, { e: [['psn', 30]], desc: '毒の刃で切りつける。' });
mv('sludgecannon', 'ヘドロキャノン', 'poison', 90, 100, 10, 3, { e: [['psn', 30]], desc: 'ヘドロの塊を撃つ。' });
mv('toxicstorm', 'どくのあらし', 'poison', 120, 80, 5, 4, { e: [['psn', 30]], desc: '毒の嵐を巻き起こす。' });
mv('toxic', 'もうどく', 'poison', 0, 90, 10, 0, { e: [['psn', 100]], desc: '相手を毒状態にする。' });
mv('goobody', 'ドロドロボディ', 'poison', 0, null, 20, 0, { e: [['def', 2, 'self', 100]], desc: '体を溶かし防御をぐーんと上げる。' });

// ---- 地面 ----
mv('mudsling', 'どろかけ', 'ground', 40, 100, 25, 1, { e: [['acc', -1, 'foe', 50]], desc: '泥をかけて命中を下げることがある。' });
mv('mudball', 'どろだま', 'ground', 55, 95, 15, 2, { e: [['spe', -1, 'foe', 100]], desc: '泥の玉で素早さを下げる。' });
mv('quake', 'じひびき', 'ground', 65, 100, 20, 2, { desc: '地面を揺らして攻撃する。' });
mv('drill', 'ちていドリル', 'ground', 85, 95, 10, 3, { crit: 1, desc: '回転して突き進む。急所に当たりやすい。' });
mv('magmaground', 'マグマグラウンド', 'ground', 90, 100, 10, 3, { e: [['def', -1, 'foe', 10]], desc: '大地のエネルギーを噴き出す。' });
mv('earthrage', 'だいちのいかり', 'ground', 100, 100, 10, 4, { desc: '大地を揺るがす大地震。' });
mv('sandarmor', 'すなのよろい', 'ground', 0, null, 20, 0, { e: [['def', 2, 'self', 100]], desc: '砂をまとって防御をぐーんと上げる。' });

// ---- 飛行 ----
mv('peck', 'くちばしつつき', 'flying', 40, 100, 35, 1, { desc: 'くちばしでつつく。' });
mv('wingattack', 'ウイングアタック', 'flying', 60, 100, 25, 2, { desc: '翼を広げて打ちつける。' });
mv('windblade', 'かぜのやいば', 'flying', 75, 95, 15, 2, { e: [['flinch', 30]], desc: '風の刃で切り裂く。' });
mv('spiralbeak', 'らせんくちばし', 'flying', 85, 100, 15, 3, { desc: '回転するくちばしで突く。' });
mv('skydive', 'スカイダイブ', 'flying', 120, 100, 10, 4, { recoil: 1 / 3, desc: '上空から急降下。反動を受ける。' });
mv('tornado', 'たつまきかぜ', 'flying', 110, 70, 5, 4, { e: [['flinch', 20]], desc: '竜巻を起こす。' });
mv('tailwind', 'おいかぜのまい', 'flying', 0, null, 15, 0, { e: [['spe', 2, 'self', 100]], desc: '追い風に乗り素早さをぐーんと上げる。' });
mv('wingrest', 'つばさやすめ', 'flying', 0, null, 10, 0, { heal: 0.5, desc: '翼を休めてHPを半分回復。' });

// ---- エスパー ----
mv('psypulse', 'サイコパルス', 'psychic', 50, 100, 25, 1, { e: [['flinch', 10]], desc: '念波を当てる。' });
mv('miragebeam', 'ミラージュビーム', 'psychic', 65, 100, 20, 2, { e: [['acc', -1, 'foe', 10]], desc: '幻の光線。' });
mv('mindhead', 'マインドヘッド', 'psychic', 80, 90, 15, 3, { e: [['flinch', 20]], desc: '念を込めた頭突き。' });
mv('teleblast', 'テレキネシスブラスト', 'psychic', 90, 100, 10, 3, { e: [['def', -1, 'foe', 10]], desc: '強力な念動力で攻撃。' });
mv('psyburst', 'サイコバースト', 'psychic', 130, 90, 5, 4, { e: [['atk', -2, 'self', 100]], desc: '念力を暴発させる。自分の攻撃ががくっと下がる。' });
mv('focusmind', 'せいしんとういつ', 'psychic', 0, null, 20, 0, { e: [['atk', 1, 'self', 100], ['spe', 1, 'self', 100]], desc: '心を研ぎ澄まし攻撃と素早さを上げる。' });
mv('hypnolight', 'さいみんのひかり', 'psychic', 0, 65, 20, 0, { e: [['slp', 100]], desc: '催眠の光で眠らせる。' });
mv('psyshield', 'サイコシールド', 'psychic', 0, null, 20, 0, { e: [['def', 2, 'self', 100]], desc: '念力の盾で防御をぐーんと上げる。' });

// ---- むし ----
mv('nibble', 'かじりつき', 'bug', 45, 100, 25, 1, { desc: 'かじりついて攻撃。' });
mv('flutter', 'はばたきアタック', 'bug', 60, 100, 20, 2, { desc: '激しく羽ばたいて体当たり。' });
mv('suck', 'すいつき', 'bug', 70, 100, 10, 2, { drain: 0.5, desc: '吸いついて体力を奪う。' });
mv('crossscissor', 'クロスシザー', 'bug', 80, 100, 15, 3, { desc: '鎌やハサミを交差させて切る。' });
mv('buzzwave', 'はおとのうねり', 'bug', 90, 100, 10, 3, { e: [['def', -1, 'foe', 10]], desc: '羽音の振動で攻撃。' });
mv('grandhorn', 'グランホーン', 'bug', 120, 85, 10, 4, { desc: '巨大な角で突き刺す。' });
mv('stickythread', 'ねばいいと', 'bug', 0, 95, 30, 0, { e: [['spe', -2, 'foe', 100]], desc: '糸を吐き相手の素早さをがくっと下げる。' });
mv('wingdance', 'はねのまい', 'bug', 0, null, 20, 0, { e: [['atk', 1, 'self', 100], ['spe', 1, 'self', 100]], desc: '舞って攻撃と素早さを上げる。' });

// ---- 岩 ----
mv('pebble', 'いしつぶて', 'rock', 45, 100, 25, 1, { desc: '小石を投げつける。' });
mv('rockseal', 'いわふうじ', 'rock', 60, 95, 15, 2, { e: [['spe', -1, 'foe', 100]], desc: '岩で動きを封じ素早さを下げる。' });
mv('rockslide', 'がんせきなだれ', 'rock', 75, 90, 10, 2, { e: [['flinch', 30]], desc: '岩をなだれのようにぶつける。' });
mv('gembeam', 'ほうせきビーム', 'rock', 80, 100, 20, 3, { desc: '宝石の輝きを光線にする。' });
mv('sharpstone', 'とがりいし', 'rock', 100, 80, 5, 4, { crit: 1, desc: '尖った岩で突き刺す。急所に当たりやすい。' });
mv('rockhead', 'がんせきずつき', 'rock', 130, 80, 5, 4, { recoil: 1 / 2, desc: '命がけの岩石頭突き。大きな反動を受ける。' });
mv('rockarmor', 'がんせきのよろい', 'rock', 0, null, 20, 0, { e: [['def', 2, 'self', 100]], desc: '岩をまとって防御をぐーんと上げる。' });

// ---- ゴースト ----
mv('chilltouch', 'ひやりタッチ', 'ghost', 35, 100, 30, 1, { e: [['par', 30]], desc: '冷たい手で触れる。まひさせることがある。' });
mv('shadowstitch', 'かげぬい', 'ghost', 40, 100, 30, 1, { pri: 1, desc: '影から先制攻撃する。' });
mv('spook', 'ばけおどし', 'ghost', 55, 100, 15, 2, { e: [['flinch', 30]], desc: 'おどかしてひるませることがある。' });
mv('darkclaw', 'やみのつめ', 'ghost', 70, 100, 15, 2, { crit: 1, desc: '影の爪で切り裂く。急所に当たりやすい。' });
mv('soulsip', 'たましいすい', 'ghost', 75, 100, 10, 3, { drain: 0.5, desc: '魂を吸い取りHPを回復する。' });
mv('ghostball', 'ゴーストボール', 'ghost', 85, 100, 15, 3, { e: [['def', -1, 'foe', 20]], desc: '霊気の塊を投げつける。' });
mv('wraithcry', 'ゆうれいのさけび', 'ghost', 110, 85, 5, 4, { e: [['flinch', 10]], desc: '怨霊の叫びを浴びせる。' });
mv('evileye', 'おにのまなざし', 'ghost', 0, 100, 15, 0, { e: [['atk', -2, 'foe', 100]], desc: 'にらんで相手の攻撃をがくっと下げる。' });

// ---- ドラゴン ----
mv('dragonbreath', 'りゅうのいき', 'dragon', 60, 100, 20, 2, { e: [['par', 30]], desc: '竜の息吹。まひさせることがある。' });
mv('dragontail', 'りゅうのしっぽ', 'dragon', 55, 100, 20, 1, { desc: '尻尾で打ちつける。' });
mv('dragonclaw', 'りゅうのつめ', 'dragon', 80, 100, 15, 3, { desc: '竜の爪で切り裂く。' });
mv('dragontackle', 'ドラゴンタックル', 'dragon', 100, 80, 10, 4, { e: [['flinch', 20]], desc: '殺気を放ち突撃する。' });
mv('dragonrage', 'りゅうのいかり', 'dragon', 120, 100, 10, 4, { e: [['def', -1, 'self', 100]], desc: '怒りのままに暴れる。自分の防御が下がる。' });
mv('meteorrain', 'りゅうせいのあめ', 'dragon', 130, 90, 5, 4, { e: [['atk', -2, 'self', 100]], desc: '流星を降らせる。自分の攻撃ががくっと下がる。' });
mv('dragondance', 'りゅうしんのまい', 'dragon', 0, null, 20, 0, { e: [['atk', 1, 'self', 100], ['spe', 1, 'self', 100]], desc: '神秘の舞で攻撃と素早さを上げる。' });

// ---- 悪 ----
mv('bite', 'かみつき', 'dark', 60, 100, 25, 2, { e: [['flinch', 30]], desc: 'するどい歯でかみつく。' });
mv('sneak', 'ふいをつく', 'dark', 45, 100, 20, 1, { pri: 1, desc: '不意を突いて先制攻撃する。' });
mv('darknail', 'あくのつめ', 'dark', 65, 100, 20, 2, { crit: 1, desc: '悪意の爪。急所に当たりやすい。' });
mv('crunch', 'かみくだき', 'dark', 80, 100, 15, 3, { e: [['def', -1, 'foe', 20]], desc: 'かみ砕く。防御を下げることがある。' });
mv('darkpulse', 'やみのはどう', 'dark', 80, 100, 15, 3, { e: [['flinch', 20]], desc: '闇の波動を放つ。' });
mv('midnight', 'ミッドナイトバースト', 'dark', 105, 90, 10, 4, { desc: '真夜中の闇を爆発させる。' });
mv('scheme', 'くわだて', 'dark', 0, null, 20, 0, { e: [['atk', 2, 'self', 100]], desc: '悪だくみで攻撃をぐーんと上げる。' });

// ---- 鋼 ----
mv('steelclaw', 'はがねのつめ', 'steel', 50, 95, 35, 1, { e: [['atk', 1, 'self', 10]], desc: '鋼の爪で切り裂く。' });
mv('bulletfist', 'てっけんだん', 'steel', 40, 100, 30, 1, { pri: 1, desc: '弾丸のような先制パンチ。' });
mv('steelwing', 'こうてつのつばさ', 'steel', 70, 90, 25, 2, { e: [['def', 1, 'self', 10]], desc: '鋼の翼で打つ。' });
mv('ironhead', 'てっとうずつき', 'steel', 80, 100, 15, 3, { e: [['flinch', 30]], desc: '鋼の頭で突撃する。' });
mv('silverbeam', 'ぎんいろこうせん', 'steel', 80, 100, 10, 3, { e: [['def', -1, 'foe', 10]], desc: '銀色の光線を放つ。' });
mv('metalpress', 'メタルプレス', 'steel', 100, 90, 10, 4, { desc: '重い鋼の体で押しつぶす。' });
mv('steelwall', 'こうてつのかべ', 'steel', 0, null, 15, 0, { e: [['def', 2, 'self', 100]], desc: '鋼の壁で防御をぐーんと上げる。' });

// ---- フェアリー ----
mv('fairywind', 'フェアリーウインド', 'fairy', 40, 100, 30, 1, { desc: '妖精の風を起こす。' });
mv('kiss', 'ちゅうちゅうキス', 'fairy', 50, 100, 15, 1, { drain: 0.75, desc: 'キスで体力を吸い取る。' });
mv('sparklevoice', 'きらめきボイス', 'fairy', 70, 100, 15, 2, { desc: 'きらめく声で攻撃する。' });
mv('playrough', 'じゃれあい', 'fairy', 90, 90, 10, 3, { e: [['atk', -1, 'foe', 10]], desc: 'じゃれついて攻撃する。' });
mv('moonbullet', 'つきのひかりだん', 'fairy', 95, 100, 10, 4, { e: [['atk', -1, 'foe', 30]], desc: '月の力を込めた弾。' });
mv('fairyburst', 'フェアリーバースト', 'fairy', 110, 85, 5, 4, { desc: '妖精の力を爆発させる。' });
mv('teary', 'うるうるめ', 'fairy', 0, 100, 20, 0, { e: [['atk', -2, 'foe', 100]], desc: 'うるんだ目で攻撃をがくっと下げる。' });
mv('moonheal', 'ムーンヒール', 'fairy', 0, null, 10, 0, { heal: 0.5, desc: '月光でHPを半分回復。' });

// ---- 特別技（その種族だけが覚える） ----
// 伝説
mv('sig_haou', '覇王炎獄', 'fire', 140, 95, 5, 5, { sig: 'エンテイオウ', e: [['brn', 30]], desc: '【特別技】大地を焦がす覇王の業火。やけどさせることがある。エンテイオウだけが使える。' });
mv('sig_tenkai', '天海の螺旋', 'water', 130, 100, 5, 5, { sig: 'ナルメクシア', e: [['spe', 1, 'self', 100]], desc: '【特別技】天と海をつなぐ渦。撃つたび素早さが上がる。ナルメクシアだけが使える。' });
// 御三家最終
mv('sig_guren', 'ぐれんのかぎづめ', 'fire', 100, 100, 10, 4, { sig: 'セリカイザー', crit: 1, desc: '【特別技】紅蓮の爪で切り裂く。急所に当たりやすい。' });
mv('sig_tsunami', 'しんかいのつなみ', 'water', 100, 100, 10, 4, { sig: 'シドーテンペス', e: [['def', -1, 'foe', 30]], desc: '【特別技】深海から呼び寄せた津波。防御を下げることがある。' });
mv('sig_jukai', 'じゅかいのいのり', 'grass', 95, 100, 10, 4, { sig: 'モーラガイア', drain: 0.5, desc: '【特別技】樹海の祈り。与えたダメージの半分を回復する。' });
// 一部の通常アニモン
mv('sig_lumina', 'ほしのしらべ', 'fairy', 85, 100, 10, 3, { sig: 'ルミナ', heal: 0, e: [['atk', 1, 'self', 50], ['spe', 1, 'self', 50]], desc: '【特別技】星のしらべを奏でる。自分の攻撃や素早さが上がることがある。' });
mv('sig_raijin', 'らいじんのつち', 'electric', 105, 95, 5, 4, { sig: 'ピコライジン', e: [['par', 20]], desc: '【特別技】雷神の槌を振り下ろす。' });
mv('sig_yukihime', 'ゆきひめのまい', 'ice', 90, 100, 10, 3, { sig: 'ユキヒメリア', e: [['spe', 1, 'self', 100]], desc: '【特別技】雪の舞で攻撃し、素早さを上げる。' });
mv('sig_kagerou', 'かげろうぎり', 'dark', 90, 100, 10, 3, { sig: 'カゲロウガ', pri: 1, desc: '【特別技】陽炎のように揺らめき先制で切りつける。' });
mv('sig_gaia', 'だいちのこどう', 'ground', 110, 95, 5, 4, { sig: 'ガイアモス', e: [['def', 1, 'self', 100]], desc: '【特別技】大地の鼓動。自分の防御が上がる。' });
mv('sig_seiran', 'せいらんのかぜ', 'flying', 95, 100, 10, 3, { sig: 'セイランバード', e: [['spe', 1, 'self', 50]], desc: '【特別技】晴嵐の風で吹き飛ばす。' });
mv('sig_toxiqueen', 'どくひめのくちづけ', 'poison', 90, 100, 10, 3, { sig: 'ドクバナクイーン', drain: 0.5, e: [['psn', 30]], desc: '【特別技】毒姫の口づけ。HPを吸い取る。' });
mv('sig_kongou', 'こんごうしょう', 'steel', 100, 100, 10, 4, { sig: 'コンゴウオー', e: [['flinch', 20]], desc: '【特別技】金剛の掌打。' });
mv('sig_mikoto', 'しんたくのひかり', 'psychic', 100, 100, 10, 4, { sig: 'ミコトラ', e: [['def', -1, 'foe', 30]], desc: '【特別技】神託の光。' });
mv('sig_kotodama', 'いにしえのうた', 'rock', 95, 100, 10, 3, { sig: 'イニシエノカミ', e: [['def', 1, 'self', 50]], desc: '【特別技】古代の歌が岩を呼ぶ。' });

// タイプ別プール（tier順）
export const POOLS = {};
for (const m of Object.values(MOVES)) {
  if (m.sig) continue;
  (POOLS[m.type] ||= { 0: [], 1: [], 2: [], 3: [], 4: [] })[m.tier].push(m.id);
}
// サブ技（補完）として相性の良いタイプ
export const COVERAGE = {
  normal: ['fighting', 'ground', 'dark'], fire: ['ground', 'rock', 'dragon'], water: ['ice', 'ground', 'dark'], grass: ['poison', 'ground', 'fairy'],
  steel: ['rock', 'ground', 'fighting'], poison: ['dark', 'ground', 'ghost'], electric: ['steel', 'flying', 'ice'], ice: ['water', 'ground', 'rock'],
  fighting: ['rock', 'dark', 'steel'], ground: ['rock', 'steel', 'dark'], flying: ['fighting', 'steel', 'dark'], psychic: ['fairy', 'ghost', 'fighting'],
  bug: ['rock', 'fighting', 'poison'], rock: ['ground', 'fighting', 'steel'], ghost: ['dark', 'psychic', 'poison'], dragon: ['fire', 'ground', 'steel'],
  dark: ['ghost', 'fighting', 'poison'], fairy: ['psychic', 'fire', 'grass'],
};
