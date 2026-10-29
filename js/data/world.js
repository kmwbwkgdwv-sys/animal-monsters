// 大陸（1つの大きな大陸）のデータ
import { SPECIES, BY_NAME, REGION_JA } from './species.js';

export const WORLD = { half: 768, cell: 4, n: 384, sea: 0 };

// 地域：ang = 中心角（+x軸から+z方向へ）。sector = 40°
export const REGIONS = {
  start: { name: 'はじまりの町周辺', lv: [2, 5], biome: 'plains', order: 0 },
  plains: { name: 'そよかぜ平原', ang: 90, lv: [3, 9], biome: 'plains', order: 1 },
  forest: { name: 'こもれびの森', ang: 130, lv: [7, 15], biome: 'forest', order: 2 },
  lake: { name: 'せせらぎ湖畔', ang: 170, lv: [13, 22], biome: 'lake', order: 3 },
  desert: { name: 'サンドラ砂漠', ang: 210, lv: [20, 30], biome: 'desert', order: 4 },
  canyon: { name: 'いわさき渓谷', ang: 250, lv: [28, 38], biome: 'canyon', order: 5 },
  snow: { name: 'フロスト氷山', ang: 290, lv: [36, 46], biome: 'snow', order: 6 },
  swamp: { name: 'よどみの湿原', ang: 330, lv: [44, 54], biome: 'swamp', order: 7 },
  highland: { name: 'てんくう高原', ang: 10, lv: [52, 62], biome: 'highland', order: 8 },
  volcano: { name: 'ほむら火山', ang: 50, lv: [60, 72], biome: 'volcano', order: 9 },
  sanctuary: { name: 'さいはての聖域', lv: [72, 84], biome: 'sanctuary', order: 10 },
  inner: { name: '聖域の奥地', lv: [88, 99], biome: 'inner', order: 11 },
  sea: { name: '海', lv: [10, 60], biome: 'sea', order: 99 },
};
export const ORDER = ['start', 'plains', 'forest', 'lake', 'desert', 'canyon', 'snow', 'swamp', 'highland', 'volcano', 'sanctuary', 'inner'];
export const RING = ['plains', 'forest', 'lake', 'desert', 'canyon', 'snow', 'swamp', 'highland', 'volcano'];
export const START_POS = [0, 590];
export const SANCT_R = 205, INNER_R = 75, COAST_R = 720;
export const VOLCANO_C = [250, 300];
export const LAKE_C = [-430, 70];
// ストーリーの最終決戦の場所（聖域の中、奥地の結界の手前）
export const ALTAR = [0, 118];

export function angDeg(x, z) { let a = Math.atan2(z, x) * 180 / Math.PI; if (a < 0) a += 360; return a; }
export function angDist(a, b) { let d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d; }
// リングの最寄り2地域と境界までの比率
export function ringAt(x, z) {
  const a = angDeg(x, z);
  let best = null, bd = 1e9, second = null, sd = 1e9;
  for (const id of RING) { const d = angDist(a, REGIONS[id].ang); if (d < bd) { second = best; sd = bd; best = id; bd = d; } else if (d < sd) { second = id; sd = d; } }
  return { a, id: best, d: bd, id2: second, d2: sd };
}
export function regionAt(x, z, h = 1) {
  const r = Math.hypot(x, z);
  if (h < -0.6 && r > COAST_R - 80) return 'sea';
  if (r > COAST_R + 25) return 'sea';
  if (r < INNER_R) return 'inner';
  if (r < SANCT_R) return 'sanctuary';
  if (Math.hypot(x - START_POS[0], z - START_POS[1]) < 120) return 'start';
  return ringAt(x, z).id;
}
export function polar(angDegV, r) { const a = angDegV * Math.PI / 180; return [Math.cos(a) * r, Math.sin(a) * r]; }

// ---------------- 町 ----------------
// b: 建物 [種類, dx, dz, 色]   種類: home lab hospital shop house hall
export const TOWNS = [
  { id: 'start', name: 'はじまりの町', pos: [0, 590], r: 46, region: 'start', b: [['home', -18, 14], ['lab', 18, -14], ['hospital', -16, -18], ['shop', 4, -24], ['house', 22, 14], ['house', -30, -2]] },
  { id: 'forest', name: 'もりの村', pos: polar(130, 450), r: 44, region: 'forest', guardian: 'g1', b: [['hospital', -14, -14], ['shop', 12, -16], ['hall', 0, -32], ['house', -26, 8], ['house', 24, 10], ['house', 8, 22]] },
  { id: 'lake', name: 'みなとまち', pos: polar(160, 600), r: 46, region: 'lake', guardian: 'g2', b: [['hospital', -14, -14], ['shop', 12, -16], ['hall', 0, -32], ['house', -28, 6], ['house', 26, 4], ['lighthouse', 30, 26]] },
  { id: 'desert', name: 'オアシスタウン', pos: polar(208, 440), r: 44, region: 'desert', guardian: 'g3', b: [['hospital', -14, -14], ['shop', 12, -16], ['hall', 0, -32], ['house', -26, 10], ['house', 26, 10]] },
  { id: 'canyon', name: 'いわやま町', pos: polar(252, 430), r: 44, region: 'canyon', guardian: 'g4', b: [['hospital', -14, -14], ['shop', 12, -16], ['hall', 0, -32], ['house', -26, 10], ['house', 24, 12], ['house', 0, 24]] },
  { id: 'snow', name: 'ゆきの村', pos: polar(290, 420), r: 44, region: 'snow', guardian: 'g5', b: [['hospital', -14, -14], ['shop', 12, -16], ['hall', 0, -32], ['house', -26, 8], ['house', 26, 8], ['house', 2, 24]] },
  { id: 'swamp', name: 'きりの集落', pos: polar(330, 440), r: 42, region: 'swamp', guardian: 'g6', b: [['hospital', -14, -14], ['shop', 12, -16], ['hall', 0, -32], ['house', -24, 10], ['house', 22, 12]] },
  { id: 'highland', name: 'そらの町', pos: polar(10, 450), r: 44, region: 'highland', guardian: 'g7', b: [['hospital', -14, -14], ['shop', 12, -16], ['hall', 0, -32], ['house', -26, 10], ['house', 26, 8], ['house', 0, 24]] },
  { id: 'volcano', name: 'ほむらの里', pos: polar(52, 570), r: 44, region: 'volcano', guardian: 'g8', b: [['hospital', -14, -14], ['shop', 12, -16], ['hall', 0, -32], ['house', -26, 10], ['house', 24, 10]] },
  { id: 'sanctuary', name: '聖域の祠', pos: polar(50, 160), r: 30, region: 'sanctuary', b: [['hospital', -10, -6], ['shop', 10, -6]] },
];
export const BUILD_JA = { home: 'あなたの家', lab: 'アルマ博士の研究所', hospital: 'アニモン病院', shop: 'ショップ', house: '民家', hall: '守護者の館', lighthouse: '灯台' };

// ---------------- ファストトラベルの岩 ----------------
export const STONES = [
  ...TOWNS.map(t => ({ id: 't_' + t.id, name: t.name, pos: [t.pos[0], t.pos[1] + 8], town: t.id })),
  { id: 'r_plains', name: 'そよかぜの丘', pos: [0, 400] },
  { id: 'r_plains2', name: '風車の草原', pos: polar(75, 560) },
  { id: 'r_forest', name: '大樹の広場', pos: polar(140, 330) },
  { id: 'r_lake', name: '湖のほこら', pos: polar(172, 330) },
  { id: 'r_desert', name: '砂の王墓前', pos: polar(220, 520) },
  { id: 'r_canyon', name: '鉱山跡', pos: polar(240, 600) },
  { id: 'r_snow', name: '氷晶の洞窟前', pos: polar(300, 540) },
  { id: 'r_swamp', name: '霧の大沼', pos: polar(322, 300) },
  { id: 'r_highland', name: '天空の塔前', pos: polar(2, 590) },
  { id: 'r_volcano', name: '溶岩洞前', pos: polar(40, 330) },
  { id: 'r_sanct', name: '聖域の門', pos: polar(50, 240) },
  { id: 'r_inner', name: '星の祭壇', pos: [0, 30] },
];

// ---------------- ダンジョン ----------------
export const DUNGEONS = {
  ruins: { name: '古代の遺跡', pos: polar(145, 610), rec: 18, lv: [14, 22], theme: 'ruins', size: 13, region: 'forest' },
  pyramid: { name: '砂の王墓', pos: polar(222, 560), rec: 33, lv: [28, 36], theme: 'pyramid', size: 15, region: 'desert' },
  icecave: { name: '氷晶の洞窟', pos: polar(302, 580), rec: 50, lv: [44, 54], theme: 'ice', size: 15, region: 'snow' },
  skytower: { name: '天空の塔', pos: polar(2, 630), rec: 65, lv: [58, 68], theme: 'sky', size: 15, region: 'highland' },
  lavacave: { name: '溶岩洞', pos: polar(40, 300), rec: 75, lv: [68, 78], theme: 'lava', size: 17, region: 'volcano' },
  abyss: { name: '深淵の迷宮', pos: [0, -30], rec: 95, lv: [90, 99], theme: 'abyss', size: 19, region: 'inner', post: true },
};

// ---------------- 落ちているアイテム ----------------
export const ITEM_BALLS = [
  ['ib1', 'herb', [30, 520]], ['ib2', 'food1', [-60, 470]], ['ib3', 'goodherb', polar(80, 640)], ['ib4', 'revive', polar(100, 330)],
  ['ib5', 'b_grass', polar(125, 600)], ['ib6', 'food2', polar(138, 380)], ['ib7', 'h_berry', polar(118, 300)],
  ['ib8', 'b_water', polar(175, 690)], ['ib9', 'ppdrop', polar(168, 480)], ['ib10', 'h_clear', polar(185, 360)],
  ['ib11', 'b_ground', polar(205, 650)], ['ib12', 'superherb', polar(215, 330)], ['ib13', 'h_claw', polar(198, 520)],
  ['ib14', 'b_rock', polar(245, 340)], ['ib15', 'revive', polar(258, 660)], ['ib16', 'h_vest', polar(262, 520)],
  ['ib17', 'b_ice', polar(285, 640)], ['ib18', 'fullmed', polar(295, 330)], ['ib19', 'h_bread', polar(280, 520)],
  ['ib20', 'b_poison', polar(335, 620)], ['ib21', 'b_ghost', polar(325, 360)], ['ib22', 'h_spike', polar(340, 520)],
  ['ib23', 'b_flying', polar(15, 640)], ['ib24', 'b_fairy', polar(5, 330)], ['ib25', 'h_glass', polar(18, 540)],
  ['ib26', 'b_fire', polar(60, 650)], ['ib27', 'b_dragon', polar(45, 420)], ['ib28', 'h_orb', polar(62, 330)],
  ['ib29', 'maxrevive', polar(90, 150)], ['ib30', 'ppspring', polar(200, 150)], ['ib31', 'candy', polar(300, 150)],
  ['ib32', 'b_psychic', [-20, -20]], ['ib33', 'b_dark', [40, 10]], ['ib34', 'h_band', [-10, 50]],
  // 海の上（泳いで取りに行く）
  ['ib35', 'b_steel', polar(120, 745)], ['ib36', 'b_electric', polar(190, 750)], ['ib37', 'h_shoes', polar(320, 748)], ['ib38', 'h_charm', polar(30, 750)],
  ['ib39', 'b_fighting', polar(260, 750)], ['ib40', 'b_bug', polar(150, 745)], ['ib41', 'b_normal', polar(95, 748)],
];

// ---------------- トレーナー ----------------
// team: [種族名, Lv, (持ち物)]
export const TRAINERS = {
  ren1: { name: 'ライバルのレン', team: 'RIVAL1', look: 'ren', reward: 300, ai: 'trainer' },
  grunt1: { name: 'クロギリ団の下っ端', team: [['コロネズ', 8], ['イトグモ', 9]], look: 'grunt', reward: 500, ai: 'trainer' },
  g1: { name: '森の守護者シルヴァ', team: [['コノハリス', 9], ['キノコロ', 10], ['ツタヘビ', 12]], look: 'g1', reward: 2000, ai: 'boss', guardian: 1 },
  ren2: { name: 'ライバルのレン', team: 'RIVAL2', look: 'ren', reward: 1500, ai: 'trainer' },
  zina1: { name: 'クロギリ団幹部ジーナ', team: [['クラゲン', 18], ['ハチッコ', 19], ['ツタヘビ', 20]], look: 'zina', reward: 2500, ai: 'boss' },
  g2: { name: '湖の守護者マリナ', team: [['アヒルン', 19], ['ハサミン', 20], ['ドンガメ', 21], ['ケロッタ', 22, 'b_water']], look: 'g2', reward: 3000, ai: 'boss', guardian: 2 },
  g3: { name: '砂漠の守護者ザイード', team: [['サボトゲ', 26], ['フェネッコ', 27], ['ドロモグラン', 28], ['スナワニス', 29, 'b_ground']], look: 'g3', reward: 4000, ai: 'boss', guardian: 3 },
  gou1: { name: 'クロギリ団幹部ゴウ', team: [['ゴロイシ', 33], ['ヨルバット', 33], ['ゴンゴウ', 35]], look: 'gou', reward: 4000, ai: 'boss' },
  g4: { name: '渓谷の守護者ガンテツ', team: [['イワヤギ', 34], ['マルジロ', 35], ['ゴロイシ', 36], ['サイゴロ', 37, 'b_rock']], look: 'g4', reward: 5000, ai: 'boss', guardian: 4 },
  ren3: { name: 'ライバルのレン', team: 'RIVAL3', look: 'ren', reward: 4000, ai: 'boss' },
  g5: { name: '氷山の守護者フリージア', team: [['ユキウサ', 42], ['アザラン', 43], ['ユキロウ', 44], ['マンモーネ', 45, 'b_ice']], look: 'g5', reward: 6000, ai: 'boss', guardian: 5 },
  grunts2: { name: 'クロギリ団の双子', team: [['ガマガマ', 47], ['ヨルバットン', 47], ['ヌメール', 48], ['ハゲタカン', 49]], look: 'grunt', reward: 4000, ai: 'trainer', format: 'double' },
  g6: { name: '湿原の守護者モルグ', team: [['ヒトダマン', 50], ['ヌメドロン', 51], ['オバケンシ', 52], ['カゲロウガ', 53, 'b_ghost']], look: 'g6', reward: 7000, ai: 'boss', guardian: 6 },
  g7: { name: '高原の守護者セレス', team: [['ハネコマ', 58], ['セイラン', 59], ['モクモ', 59], ['ライチョ', 60], ['ハナリンドウ', 61, 'b_fairy']], look: 'g7', reward: 8000, ai: 'boss', guardian: 7 },
  admins: { name: '幹部ジーナとゴウ', team: [['クラゲリオン', 64], ['コンゴウオー', 65], ['ドクバナーラ', 65], ['ゴロイシキング', 66]], look: 'zina', reward: 8000, ai: 'boss', format: 'double' },
  vald1: { name: 'クロギリ団ボス ヴァルド', team: [['ヨルバットン', 66], ['ハゲタカイザー', 67], ['スナワニオウ', 68], ['フブキロウ', 68], ['オブシディア', 70, 'h_spike']], look: 'vald', reward: 12000, ai: 'boss' },
  g8: { name: '火山の守護者バーン', team: [['ヨウガメラ', 65], ['テツカジシ', 66], ['サラマンダラ', 66], ['ヒノトリオン', 67], ['マグマジン', 69]], look: 'g8', reward: 10000, ai: 'boss', guardian: 8 },
  ren4: { name: 'ライバルのレン', team: 'RIVAL4', look: 'ren', reward: 10000, ai: 'boss' },
  vald2: { name: 'クロギリ団ボス ヴァルド', team: [['カゲロウガ', 78], ['ドラコンロード', 79], ['オブシディア', 79], ['ヤミノオウ', 80], ['スナワニオウ', 80], ['ハゲタカイザー', 82, 'h_orb']], look: 'vald', reward: 30000, ai: 'boss' },
  // サイドストーリー
  sailor1: { name: '船乗りのタケシ', team: [['ピチャコイ', 18], ['ハサミン', 19]], look: 'sailor', reward: 800, ai: 'trainer' },
  sailor2: { name: '船乗りのウミオ', team: [['アヒルン', 19], ['クラゲン', 20]], look: 'sailor', reward: 800, ai: 'trainer' },
  sailor3: { name: '船長のカイ', team: [['ビリウナ', 21], ['パカガイ', 21], ['ケロッタ', 22]], look: 'sailor', reward: 1500, ai: 'trainer' },
  mineGhost: { name: '廃鉱山のあかり', wild: ['カンテラン', 36], ai: 'wild' },
  swampLord: { name: '沼のぬし', wild: ['ヌマヌシ', 55], ai: 'wild' },
  // 殿堂（クリア後の強者）
  champ: { name: '伝説のトレーナー アルマ', team: [['イニシエノカミ', 96], ['クリスタリュウ', 96], ['ドラコンロード', 97], ['テンシエル', 97], ['フブキフクロウ', 97], ['ルミナリア', 98]], look: 'alma', reward: 50000, ai: 'boss', post: true },
};

// ライバルは主人公に有利なタイプの相棒を選ぶ
export function rivalTeam(key, starterIdx) {
  const rs = [1, 2, 0][starterIdx]; // 主人公:炎→レン水、水→草、草→炎
  const base = [1, 4, 7][rs];
  switch (key) {
    case 'RIVAL1': return [[SPECIES[base].name, 5]];
    case 'RIVAL2': return [['チュピール', 18], ['コロネズ', 18], [SPECIES[base + 1].name, 20]];
    case 'RIVAL3': return [['チュピランサー', 40], ['コロビッグ', 40], ['クマゴロウ', 41], ['リュウコイ', 41], [SPECIES[base + 2].name, 43, 'h_berry']];
    // 炎の相棒を連れるとき（主人公が草）は、ピコライジンの代わりにビバロックで弱点を補う
    case 'RIVAL4': return [['チュピランサー', 70], ['クマオウ', 71], ['リュウコイ', 71], [rs === 0 ? 'ビバロック' : 'ピコライジン', 72], ['スナドラゴン', 72], [SPECIES[base + 2].name, 74]];
  }
  return [];
}

// 道ばたのトレーナー（地域ごとに自動配置）
const TR_NAMES = ['たんけんかのソラ', 'むしとりのケンタ', 'ピクニックのミホ', 'ジョギングのダイ', 'つりびとのハルオ', 'がくせいのリコ', 'からておうのゴウキ', 'やまおとこのテツ', 'ゆきおんなのシズク', 'まじゅつしのレイ', 'とりつかいのツバサ', 'かじやのホムラ', 'エリートのアキラ', 'おじょうさまのユリ', 'ベテランのサトシ', 'ふなのりのナミオ'];
export function routeTrainers() {
  const out = [];
  let k = 0;
  for (const rid of ['plains', 'forest', 'lake', 'desert', 'canyon', 'snow', 'swamp', 'highland', 'volcano', 'sanctuary']) {
    const R = REGIONS[rid];
    const pool = encounterTable(rid, false).filter(e => SPECIES[e.sp].stage <= 2);
    for (let i = 0; i < 3; i++) {
      const id = `rt_${rid}_${i}`;
      const ang = rid === 'sanctuary' ? 30 + i * 100 : R.ang - 12 + i * 12;
      const rr = rid === 'sanctuary' ? 130 : 300 + i * 110;
      const pos = polar(ang, rr);
      const n = 2 + (i === 2 ? 1 : 0) + (R.order >= 6 ? 1 : 0);
      const team = [];
      for (let j = 0; j < n && pool.length; j++) {
        const e = pool[(k * 7 + j * 5 + i) % pool.length];
        const lv = Math.min(99, R.lv[0] + Math.round((R.lv[1] - R.lv[0]) * (0.3 + i * 0.25)) + j);
        if (!team.find(t => t[0] === SPECIES[e.sp].name)) team.push([SPECIES[e.sp].name, Math.max(lv, e.minLv)]);
      }
      out.push({ id, name: TR_NAMES[k % TR_NAMES.length], team, pos, region: rid, reward: R.lv[1] * 40, look: 'random', seed: k + 11, ai: 'trainer' });
      k++;
    }
  }
  return out;
}

// ---------------- 出現テーブル ----------------
const DUNGEON_OF = { start: 'ruins', plains: 'ruins', forest: 'ruins', lake: 'pyramid', desert: 'pyramid', canyon: 'icecave', snow: 'icecave', swamp: 'skytower', highland: 'skytower', volcano: 'lavacave', sanctuary: 'abyss', inner: 'abyss' };
export function isWaterSp(s) { return s.plan === 'fish' || (s.hab.includes('sea') && s.types.includes('water')) || (s.types.includes('water') && s.plan === 'serpent' && s.hab.includes('lake')); }

const _encCache = {};
export function encounterTable(region, water = false) {
  const key = region + (water ? '_w' : '');
  if (_encCache[key]) return _encCache[key];
  const R = REGIONS[region] || DUNGEONS[region];
  const lv = R.lv;
  const out = [];
  const add = (sp, w) => {
    const minLv = sp.evoFrom ? SPECIES[sp.evoFrom].evoLv : 1;
    if (minLv > lv[1] + 2) return;
    out.push({ sp: sp.id, w, minLv });
  };
  const isDungeon = !!DUNGEONS[region];
  for (const s of SPECIES) {
    if (!s || s.legend || s.story || s.side) continue;
    if (!!water !== isWaterSp(s) && !isDungeon) continue;
    const hab = s.hab.length ? s.hab : (s.evoFrom ? baseHab(s) : []);
    if (isDungeon) {
      if (s.hab.includes(region)) { add(s, 6); continue; }
      // ダンジョンには周辺地域の進化後のアニモンも出現
      const assoc = Object.entries(DUNGEON_OF).filter(([, d]) => d === region).map(([r]) => r);
      if (s.evoFrom && hab.some(h => assoc.includes(h))) add(s, s.evoTo ? 3 : 2);
      else if (!s.evoFrom && s.evoTo && hab.some(h => assoc.includes(h))) add(s, 1);
      continue;
    }
    if (region === 'inner') { if (!s.evoTo && s.stage > 1) add(s, 1); if (s.hab.includes('inner')) add(s, 4); continue; }
    if (region === 'sea') { if (s.hab.includes('sea') || (s.evoFrom && hab.includes('sea'))) add(s, s.stage === 1 ? 8 : 3); continue; }
    if (!hab.includes(region)) continue;
    if (s.stage === 1) add(s, s.rare ? 1.5 : (s.stages === 1 ? 4 : 10));
    else add(s, s.stage === 2 ? 2.5 : 0.8);
  }
  if (water && !out.length && region !== 'sea') return (_encCache[key] = encounterTable('sea', true));
  _encCache[key] = out;
  return out;
}
function baseHab(s) { let b = s; while (b.evoFrom) b = SPECIES[b.evoFrom]; return b.hab; }

export function regionLevel(region) { return (REGIONS[region] || DUNGEONS[region]).lv; }

// 入手方法（図鑑用）
export const SIDE_JA = { caravan: '砂漠のキャラバン', mine: '廃鉱山のあかり', swampboss: '沼のぬし' };
export function howToGet(s) {
  const out = [];
  if (s.legend) return ['ストーリーの最後に出会う（どちらか1匹だけ）'];
  if (s.story) out.push('ストーリーで仲間になる');
  if (s.side) out.push(`サイドストーリー「${SIDE_JA[s.side]}」をクリアする`);
  if (s.evoFrom) out.push(`${SPECIES[s.evoFrom].name} が Lv${SPECIES[s.evoFrom].evoLv} で進化`);
  const places = [];
  for (const rid of Object.keys(REGIONS)) {
    for (const water of [false, true]) if (encounterTable(rid, water).some(e => e.sp === s.id)) { places.push(REGION_JA[rid] + (water ? '（水上）' : '')); break; }
  }
  for (const did of Object.keys(DUNGEONS)) if (encounterTable(did).some(e => e.sp === s.id)) places.push(DUNGEONS[did].name);
  if (places.length) out.unshift('生息地：' + [...new Set(places)].join('・'));
  if (s.starter && !s.evoFrom) out.push('最初の相棒として選ぶ');
  return out.length ? out : ['？？？'];
}
export function hiddenInDex(s) { return s.legend || !!s.side || (s.rare && (s.hab.includes('inner') || s.hab.includes('abyss'))); }
export { BY_NAME };
