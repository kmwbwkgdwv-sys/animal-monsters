// 道具データ
// cat: heal / revive / status / pp / food / held / scroll / candy
export const ITEMS = {};
function it(id, name, cat, price, desc, o = {}) { ITEMS[id] = { id, name, cat, price, desc, ...o }; }

// ---- 回復 ----
it('herb', 'やくそう', 'heal', 100, 'アニモンのHPを30回復する。', { hp: 30 });
it('goodherb', 'いいやくそう', 'heal', 300, 'アニモンのHPを80回復する。', { hp: 80 });
it('superherb', 'すごいやくそう', 'heal', 800, 'アニモンのHPを200回復する。', { hp: 200 });
it('fullmed', 'まんたんのくすり', 'heal', 2000, 'アニモンのHPを全て回復する。', { hp: 9999 });
it('cureall', 'なんでもなおし', 'status', 300, 'アニモンの状態異常を全て治す。');
it('revive', 'げんきのかけら', 'revive', 1500, 'ひんしのアニモンをHP半分で復活させる。', { rev: 0.5 });
it('maxrevive', 'げんきのかたまり', 'revive', 0, 'ひんしのアニモンをHP全快で復活させる。（非売品）', { rev: 1 });
it('ppdrop', 'わざのしずく', 'pp', 800, 'アニモンの全ての技の使用回数を10回復する。', { pp: 10 });
it('ppspring', 'わざのいずみ', 'pp', 2500, 'アニモンの全ての技の使用回数を全て回復する。', { pp: 999 });

// ---- エサ（捕まえる用）：4種類。良いエサほど なつきやすい。ストーリーが進むとショップに順に入荷 ----
it('food1', 'ふつうのエサ', 'food', 50, 'どこでも買える基本のエサ。なつきやすさ：★（×1.0）', { mult: 1, rank: 1, icon: '🍙', unlock: 0 });
it('food2', 'おいしいエサ', 'food', 200, '香ばしく焼いた木の実入り。なつきやすさ：★★（×1.6）', { mult: 1.6, rank: 2, icon: '🍖', unlock: 1 });
it('food3', 'ごちそうエサ', 'food', 600, '果物と肉の豪華なごちそう。なつきやすさ：★★★（×2.4）', { mult: 2.4, rank: 3, icon: '🍱', unlock: 3 });
it('food4', 'きわみのエサ', 'food', 1500, '職人が作った極上のエサ。なつきやすさ：★★★★（×3.5）', { mult: 3.5, rank: 4, icon: '🍰', unlock: 6 });
it('food5', 'まぼろしのエサ', 'food', 0, '伝説の料理人が作ったエサ。どんなアニモンでも必ずなつく。（非売品）', { mult: 999, rank: 5, icon: '🌟' });
// ショップに並ぶエサ（必要な紋章の数＝ストーリーの進み具合）
export const SHOP_FOODS = ['food1', 'food2', 'food3', 'food4'];
export const FOOD_STARS = (id) => '★'.repeat(ITEMS[id].rank || 1);

// ---- 技 ----
it('scroll', 'おもいだしの巻物', 'scroll', 3000, 'そのアニモンが覚えられる8つの技のうち、好きな技をいつでも覚えさせられる。');
it('candy', 'レベルアメ', 'candy', 0, 'アニモンのレベルを1上げる。（非売品）');

// ---- 持ち物（30種） ----
const BOOST = [
  ['b_normal', 'まっさらなリボン', 'normal', 'ノーマル'], ['b_fire', 'ひだねの石', 'fire', '炎'], ['b_water', 'しずくの石', 'water', '水'], ['b_grass', 'わかばのタネ', 'grass', '草'],
  ['b_steel', 'はがねのネジ', 'steel', '鋼'], ['b_poison', 'どくのビン', 'poison', '毒'], ['b_electric', 'でんきのコイル', 'electric', '電気'], ['b_ice', 'ひょうけつのかけら', 'ice', '氷'],
  ['b_fighting', 'とうしのはちまき', 'fighting', '格闘'], ['b_ground', 'だいちのすな', 'ground', '地面'], ['b_flying', 'かぜのはね', 'flying', '飛行'], ['b_psychic', 'ねんりきのすず', 'psychic', 'エスパー'],
  ['b_bug', 'むしのりんぷん', 'bug', 'むし'], ['b_rock', 'ごつごつ石', 'rock', '岩'], ['b_ghost', 'ゆうれいのおふだ', 'ghost', 'ゴースト'], ['b_dragon', 'りゅうのうろこ', 'dragon', 'ドラゴン'],
  ['b_dark', 'やみのメガネ', 'dark', '悪'], ['b_fairy', 'ようせいのはね', 'fairy', 'フェアリー'],
];
for (const [id, name, type, ja] of BOOST) it(id, name, 'held', 1000, `持たせると${ja}タイプの技の威力が1.2倍になる。`, { boost: type });
it('h_charm', 'いのちのお守り', 'held', 3000, 'HPが満タンのとき、どんな攻撃を受けても1度だけHP1で耐える。（使うとなくなる）');
it('h_band', 'いちずのハチマキ', 'held', 4000, '攻撃が1.5倍になるが、最初に出した技しか使えなくなる。');
it('h_shoes', 'いちずのくつ', 'held', 4000, '素早さが1.5倍になるが、最初に出した技しか使えなくなる。');
it('h_bread', 'めぐみのパン', 'held', 3000, '毎ターン終了時にHPが1/16回復する。');
it('h_berry', 'ふっかつの実', 'held', 800, 'HPが半分以下になるとHPを1/4回復する。（使うとなくなる）');
it('h_clear', 'すっきりの実', 'held', 600, '状態異常になると1度だけ治す。（使うとなくなる）');
it('h_belt', 'とっくんのおび', 'held', 3500, 'まだ進化できるアニモンに持たせると防御が1.5倍になる。');
it('h_orb', 'ちからの宝珠', 'held', 4000, '技の威力が1.3倍になるが、攻撃するたびにHPが1/10減る。');
it('h_spike', 'トゲトゲよろい', 'held', 3000, '攻撃してきた相手のHPを1/6減らす。');
it('h_vest', 'てっぺきベスト', 'held', 3500, '防御が1.5倍になるが、変化技が使えなくなる。');
it('h_glass', 'じゃくてんメガネ', 'held', 3000, '効果抜群の技の威力がさらに1.2倍になる。');
it('h_claw', 'はやわざのツメ', 'held', 2500, '20%の確率で同じ優先度の中で先に行動できる。');

export const HELD_IDS = Object.values(ITEMS).filter(i => i.cat === 'held').map(i => i.id);
export const CAT_JA = { heal: '回復', revive: '復活', status: '状態回復', pp: '技回復', food: 'エサ', held: '持ち物', scroll: '巻物', candy: 'アメ' };
