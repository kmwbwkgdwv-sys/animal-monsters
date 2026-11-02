// 大陸（1つの大きな大陸）のデータ
import { SPECIES, BY_NAME, REGION_JA } from './species.js';
import { smooth } from '../engine/util.js';

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
  // 第2部（隕石の あと）：溶岩の新大地（海に 広がった 新しい 陸と その まわりの 海）・メテオクレーター
  if (ERA.ruin) {
    const ext = lavaExt(x, z);
    if (ext > 1 && r > COAST_R - 40 && r < COAST_R + ext + 60) return 'lavaland';
    if (inCrater(x, z, 14)) return 'crater';
  }
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

export const PAST_DUNGEONS = { ...DUNGEONS };
// ダンジョンの主（種族名・レベル）
export const DUNGEON_BOSS = { ruins: ['イニシエ', 22], pyramid: ['ホウタイオウ', 38], icecave: ['ヒョウショウ', 55], skytower: ['ドラコンロード', 68], lavacave: ['マグマジン', 79], abyss: ['ヤミノオウ', 98] };

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
  ['ib29', 'maxrevive', polar(90, 150)], ['ib30', 'ppspring', polar(200, 150)], ['ib31', 'maxrevive', polar(300, 150)],
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
  // 第2部：こわれた 大陸の トレーナー（新しい アニモンを 連れた 強い トレーナー）
  if (ERA.ruin) {
    const NM = ['ほしよみのセナ', 'がれきひろいのトウマ', 'ひなんしゃのアキ', 'メテオハンターのジン', 'はいいろのカラス使いミオ', 'かざんがくしゃのリツ', 'さすらいのハヤテ', 'へんいけんきゅういんのユウ', 'ほのおのぬけがらのレイ', 'あらしのテン', 'クレーターのガイ', 'ようがんサーファーのナギ', 'ほしくずのシズク', 'しんたいりくのコウ'];
    const BASE_LV = { forest: 78, lake: 80, swamp: 84, highland: 86, volcano: 88, lavaland: 90, crater: 93 };
    let j2 = 0;
    for (const rid of Object.keys(BASE_LV)) {
      const pool = encounterTable(rid, false, true).slice().sort((a, b) => SPECIES[b.sp].stage - SPECIES[a.sp].stage);
      for (let i = 0; i < 2; i++) {
        let pos;
        if (rid === 'crater') { const a = i * 2.6 + 0.6; pos = [IMPACT[0] + Math.cos(a) * CRATER_R * 0.62, IMPACT[1] + Math.sin(a) * CRATER_R * 0.62]; }
        else if (rid === 'lavaland') pos = polar(38 + i * 16, 790 + i * 50);
        else { pos = polar(REGIONS[rid].ang - 9 + i * 18, 360 + i * 140); if (goneAt(pos)) pos = polar(REGIONS[rid].ang - 9 + i * 18, 560 + i * 60); }
        const team = [];
        for (let m = 0; m < 4 && pool.length; m++) { const e = pool[(j2 * 3 + m * 2 + i) % pool.length]; const lv = Math.min(99, BASE_LV[rid] + i * 2 + m); let s = SPECIES[e.sp]; while (s.evoTo && lv >= s.evoLv) s = SPECIES[s.evoTo]; if (!team.find(t => t[0] === s.name)) team.push([s.name, lv]); }
        out.push({ id: `p2rt_${rid}_${i}`, name: NM[j2 % NM.length], team, pos, region: rid, reward: BASE_LV[rid] * 60, look: 'random', seed: 300 + j2, ai: 'trainer', p2: true });
        j2++;
      }
    }
  }
  return out;
}

// ---------------- 出現テーブル ----------------
const DUNGEON_OF = { start: 'ruins', plains: 'ruins', forest: 'ruins', lake: 'pyramid', desert: 'pyramid', canyon: 'icecave', snow: 'icecave', swamp: 'skytower', highland: 'skytower', volcano: 'lavacave', sanctuary: 'abyss', inner: 'abyss' };
export function isWaterSp(s) { if (s.gen2) return !!s.waterSp; return s.plan === 'fish' || (s.hab.includes('sea') && s.types.includes('water')) || (s.types.includes('water') && s.plan === 'serpent' && s.hab.includes('lake')); }

const _encCache = {};
// 出現の重み（種族値の合計 230 を 1 として、強いほど 小さく）
export const spawnMul = (sp) => Math.pow(230 / (sp.bst || 230), 2.4) * (sp.rare ? 0.6 : 1);
export function encounterTable(region, water = false, ruin = ERA.ruin) {
  const key = region + (water ? '_w' : '') + (ruin ? '_r' : '');
  if (_encCache[key]) return _encCache[key];
  // 第2部：こわれた 地域・新しい 場所では 新しい アニモン だけ（レベルは もとの 場所の まま）
  if (ruin && (RUINED.has(region) || NEW_REGIONS[region] || NEW_DUNGEONS[region])) return (_encCache[key] = ruinTable(region, water));
  if (NEW_REGIONS[region] || NEW_DUNGEONS[region]) return (_encCache[key] = []);
  const R = REGIONS[region] || DUNGEONS[region] || PAST_DUNGEONS[region];
  const lv = R.lv;
  const out = [];
  const add = (sp, w) => {
    const minLv = sp.evoFrom ? SPECIES[sp.evoFrom].evoLv : 1;
    if (minLv > lv[1] + 2) return;
    // 強い（種族値の合計が高い）ほど 出にくい。もともと珍しい種族は さらに出にくい
    out.push({ sp: sp.id, w: w * spawnMul(sp), minLv });
  };
  const isDungeon = !!(DUNGEONS[region] || PAST_DUNGEONS[region]);
  for (const s of SPECIES) {
    if (!s || s.legend || s.story || s.side || s.gen2) continue;
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
    if (s.stage === 1) add(s, s.stages === 1 ? 5 : 10);
    else add(s, s.stage === 2 ? 4 : 2);
  }
  if (water && !out.length && region !== 'sea') return (_encCache[key] = encounterTable('sea', true));
  _encCache[key] = out;
  return out;
}
function baseHab(s) { let b = s; while (b.evoFrom) b = SPECIES[b.evoFrom]; return b.hab; }

export function regionLevel(region) { return (REGIONS[region] || DUNGEONS[region] || NEW_REGIONS[region] || NEW_DUNGEONS[region] || PAST_DUNGEONS[region]).lv; }

// =============================================================
//  第2部：隕石が 落ちた あとの 大陸（現在）／ 過去（第1部の 大陸）
//   ERA.ruin = true のとき：クレーター・噴火・溶岩の新大地。町や ダンジョンの 一部が 消える
//   applyEra() で 町・岩・ダンジョン・落とし物・地域名を 入れかえる（ほかの ファイルは 同じ 配列を 見ている）
// =============================================================
export const ERA = { ruin: false };
export const IMPACT = polar(140, 430);          // 隕石の 落ちた 場所（もりの村の あたり）
export const CRATER_R = 112, BLAST_R = 330;
export const RUINED = new Set(['forest', 'lake', 'swamp', 'highland', 'volcano']);
export const RUIN_NAMES = { forest: 'くだけた森', lake: 'ひからびた湖畔', swamp: 'どくぬまの湿原', highland: '灰の高原', volcano: 'ふんかした火山' };
const LAVA_A = 46, LAVA_W = 27, LAVA_EXT = 240;
// 溶岩の新大地：火山の 方角の 海が 陸に なった（海岸が 最大 230 外へ）
export function lavaExt(x, z) {
  const a = angDeg(x, z), t = angDist(a, LAVA_A) / LAVA_W; if (t >= 1) return 0;
  // 大陸の 四角の はしを こえないように
  const rad = a * Math.PI / 180, cap = 728 / Math.max(Math.abs(Math.cos(rad)), Math.abs(Math.sin(rad))) - COAST_R - 50;
  return Math.max(0, Math.min(LAVA_EXT * (1 - smooth(0.3, 1, t)), cap));
}
export function inCrater(x, z, pad = 0) { return Math.hypot(x - IMPACT[0], z - IMPACT[1]) < CRATER_R + pad; }
export const NEW_REGIONS = {
  crater: { name: 'メテオクレーター', lv: [80, 92], biome: 'crater', order: 12 },
  lavaland: { name: '溶岩の新大地', lv: [70, 85], biome: 'lavaland', order: 13 },
};
export const NEW_DUNGEONS = {
  meteor: { name: 'メテオコア', pos: [IMPACT[0], IMPACT[1] + 16], rec: 96, lv: [92, 99], theme: 'meteor', size: 17, region: 'crater', p2: true },
};
// 消えた 町・岩・ダンジョン（溶岩に のまれた・隕石で ふきとんだ）
const GONE_TOWNS = new Set(['forest', 'volcano']);
const GONE_STONES = new Set(['t_forest', 't_volcano', 'r_forest']);
const GONE_DUNGEONS = new Set(['ruins']);
export const P2_STONES = [
  { id: 'r_crater', name: 'クレーターのふち', pos: [IMPACT[0] + 40, IMPACT[1] + CRATER_R + 34] },
  { id: 'r_lavaland', name: '新大地の岬', pos: polar(46, 850) },
];
// 第2部の 落とし物（こわれた 大陸で 見つかる）
export const P2_ITEMS = [
  ['p2ib1', 'maxrevive', polar(150, 300)], ['p2ib2', 'ppspring', polar(168, 520)], ['p2ib3', 'h_power', polar(336, 470)],
  ['p2ib4', 'fullmed', polar(12, 520)], ['p2ib5', 'h_guard', polar(46, 800)], ['p2ib6', 'maxrevive', polar(42, 900)],
  ['p2ib7', 'h_heavy', [IMPACT[0] - 60, IMPACT[1] - 20]], ['p2ib8', 'h_regen', polar(64, 700)], ['p2ib9', 'scroll', polar(128, 600)],
];
// 第2部の 入口（クリア後に 丘に 落ちてくる 流れ星の かけら）
export const P2_START = [-34, 506];
// 時の扉（第2部 第3章の あと）：現在 ⇔ 過去。同じ 場所に 両方の 時代の 扉が ある
export const TIME_GATES = [
  { id: 'tg_crater', name: '時の扉（クレーターのふち）', pos: [IMPACT[0] + 74, IMPACT[1] + CRATER_R + 46] },
  { id: 'tg_lake', name: '時の扉（みなとまち）', pos: polar(160, 560) },
  { id: 'tg_volcano', name: '時の扉（火山のふもと）', pos: polar(36, 350) },
  { id: 'tg_highland', name: '時の扉（天空の塔の前）', pos: polar(4, 596) },
];
// その 場所が 消えた（クレーターの 中・消えた 町の 中）か
export function goneAt(p) {
  if (!ERA.ruin || !p) return false;
  if (inCrater(p[0], p[1], 26)) return true;
  for (const t of BASE.towns) if (GONE_TOWNS.has(t.id) && Math.hypot(p[0] - t.pos[0], p[1] - t.pos[1]) < t.r + 12) return true;
  return false;
}
// こわれた 場所の 種類（色・草木・空の 切りかえ用）
export function ruinKind(reg, x, z) {
  if (!ERA.ruin) return null;
  if (reg === 'crater' || reg === 'lavaland') return reg;
  if (RUINED.has(reg)) return 'r_' + reg;
  if (reg !== 'sea' && Math.hypot(x - IMPACT[0], z - IMPACT[1]) < BLAST_R) return 'r_blast';
  return null;
}
const BASE = { towns: null, stones: null, items: null, dungeons: null, names: null, townNames: null };
export function applyEra(ruin) {
  if (!BASE.towns) {
    BASE.towns = TOWNS.slice(); BASE.stones = STONES.slice(); BASE.items = ITEM_BALLS.slice(); BASE.dungeons = { ...DUNGEONS };
    BASE.names = Object.fromEntries(Object.entries(REGIONS).map(([k, v]) => [k, v.name]));
    BASE.townNames = Object.fromEntries(TOWNS.map(t => [t.id, t.name]));
  }
  ERA.ruin = !!ruin;
  for (const k in _encCache) delete _encCache[k];
  TOWNS.length = 0; TOWNS.push(...BASE.towns.filter(t => !ruin || !GONE_TOWNS.has(t.id)));
  for (const t of BASE.towns) { t.name = BASE.townNames[t.id]; t.ruined = false; }
  const lake = BASE.towns.find(t => t.id === 'lake');
  if (ruin) { lake.name = 'みなとまち跡'; lake.ruined = true; }
  STONES.length = 0; STONES.push(...BASE.stones.filter(s => !ruin || !GONE_STONES.has(s.id)), ...(ruin ? P2_STONES : []));
  for (const s of STONES) if (s.town) s.name = BASE.towns.find(t => t.id === s.town)?.name || s.name;
  ITEM_BALLS.length = 0; ITEM_BALLS.push(...BASE.items.filter(([, , p]) => !goneAt(p)), ...(ruin ? P2_ITEMS : []));
  for (const k of Object.keys(DUNGEONS)) delete DUNGEONS[k];
  for (const [k, v] of Object.entries(BASE.dungeons)) if (!ruin || !GONE_DUNGEONS.has(k)) DUNGEONS[k] = v;
  if (ruin) Object.assign(DUNGEONS, NEW_DUNGEONS);
  for (const [k, n] of Object.entries(BASE.names)) REGIONS[k].name = ruin && RUIN_NAMES[k] ? RUIN_NAMES[k] : n;
  for (const k of Object.keys(NEW_REGIONS)) { if (ruin) REGIONS[k] = NEW_REGIONS[k]; else delete REGIONS[k]; }
  if (ruin) DUNGEON_BOSS.meteor = ['ゼノドラグ', 99]; else delete DUNGEON_BOSS.meteor;
}
// こわれた 地域の 出現（新しい アニモン だけ）
function ruinTable(region, water) {
  const R = REGIONS[region] || NEW_REGIONS[region] || DUNGEONS[region] || NEW_DUNGEONS[region];
  const lv = R.lv, isDungeon = !!NEW_DUNGEONS[region], tag = RUINED.has(region) ? 'r_' + region : isDungeon ? 'crater' : region;
  const out = [];
  for (const s of SPECIES) {
    if (!s || !s.gen2 || s.legend || s.story) continue;
    if (!isDungeon && !!water !== !!s.waterSp) continue;
    if (!s.hab.includes(tag)) continue;
    const minLv = s.evoFrom ? SPECIES[s.evoFrom].evoLv : 1;
    if (minLv > lv[1] + 2) continue;
    const w = s.stages === 1 ? 5 : s.stage === 1 ? 10 : s.stage === 2 ? 4 : 2;
    out.push({ sp: s.id, w: w * spawnMul(s), minLv });
  }
  return out;
}

// 入手方法（図鑑用）
export const SIDE_JA = { caravan: '砂漠のキャラバン', mine: '廃鉱山のあかり', swampboss: '沼のぬし' };
export function howToGet(s) {
  const out = [];
  if (s.hiddenQuest) return ['隠しミッションで 入手可能'];
  if (s.legend) return ['ストーリー（第1部の 最後）で 出会う 伝説（どちらか 1匹）', '第2部 第9章で もう一匹も 仲間に なる'];
  if (s.name === 'トキワタリ') return ['第2部の ストーリーで 仲間に なる（第2部 クリア）'];
  if (s.story) out.push('ストーリーで仲間になる');
  if (s.side) out.push(`サイドストーリー「${SIDE_JA[s.side]}」をクリアする`);
  if (s.evoFrom) out.push(`${SPECIES[s.evoFrom].name} が Lv${SPECIES[s.evoFrom].evoLv} で進化`);
  const P = placesOf(s.id);
  if (s.gen2) {
    if (P.now.length) out.unshift('生息地（隕石の あとの 大陸）：' + P.now.join('・'));
    if (s.name === 'ゼノドラグ') out.push('メテオコア の 主（第2部 クリア後）');
  } else {
    if (P.past.length) out.unshift('生息地：' + P.past.join('・'));
    const gone = P.pastIds.filter(r => RUINED.has(r) || r === 'ruins');
    if (gone.length && gone.length === P.pastIds.length) out.push('第2部（隕石の あと）では 時の扉で 過去へ 行くと 会える');
    else if (gone.length) out.push(`第2部では ${gone.map(r => REGION_JA[r] || PAST_DUNGEONS[r]?.name).join('・')} には 出ない（時の扉で 過去へ 行くと 会える）`);
  }
  if (s.starter && !s.evoFrom) out.push('最初の相棒として選ぶ');
  return out.length ? out : ['？？？'];
}
// 種類ごとの 生息地（過去＝第1部の 大陸・現在＝隕石の あと）
const _placeCache = {};
export function placesOf(spId) {
  if (_placeCache[spId]) return _placeCache[spId];
  const s = SPECIES[spId], past = [], pastIds = [], now = [];
  const has = (tbl) => tbl.some(e => e.sp === spId);
  if (s && !s.gen2) {
    for (const rid of Object.keys(REGION_JA)) {
      if (!BASE_REGION_IDS.includes(rid)) continue;
      for (const water of [false, true]) if (has(encounterTable(rid, water, false))) { past.push(REGION_JA[rid] + (water && rid !== 'sea' ? '（水上）' : '')); pastIds.push(rid); break; }
    }
    for (const did of Object.keys(PAST_DUNGEONS)) if (has(encounterTable(did, false, false)) || DUNGEON_BOSS[did]?.[0] === s.name) { past.push(PAST_DUNGEONS[did].name); pastIds.push(did); }
  }
  if (s && s.gen2) {
    for (const rid of [...RUINED, ...Object.keys(NEW_REGIONS)]) for (const water of [false, true]) if (has(encounterTable(rid, water, true))) { now.push((RUIN_NAMES[rid] || NEW_REGIONS[rid].name) + (water ? '（水上）' : '')); break; }
    for (const did of Object.keys(NEW_DUNGEONS)) if (has(encounterTable(did, false, true))) now.push(NEW_DUNGEONS[did].name);
  }
  return (_placeCache[spId] = { past: [...new Set(past)], pastIds: [...new Set(pastIds)], now: [...new Set(now)] });
}
const BASE_REGION_IDS = ['start', 'plains', 'forest', 'lake', 'desert', 'canyon', 'snow', 'swamp', 'highland', 'volcano', 'sanctuary', 'inner', 'sea'];
// その アニモンが 住んでいる 場所の 名前（運営からの プレゼントなども ふつうに つかまえた ことに する）
//  同じ 種類でも 子ごとに ちがう 場所に なるよう seed（uid など）で えらぶ
const SIDE_REGION = { caravan: 'desert', mine: 'canyon', swampboss: 'swamp' };
const _habCache = {};
export function habitatPlaces(spId) {
  if (_habCache[spId]) return _habCache[spId];
  const s = SPECIES[spId]; if (!s) return [];
  let out = [];
  if (s.hiddenQuest) out = ['新大地の岬'];
  else if (s.legend) out = [REGION_JA.sanctuary];
  else if (s.name === 'トキワタリ') out = ['みなとまち跡'];
  else if (s.name === 'ゼノドラグ') out = [NEW_DUNGEONS.meteor.name];
  else {
    for (let b = s; b && !out.length; b = b.evoFrom ? SPECIES[b.evoFrom] : null) {
      const P = placesOf(b.id);
      out.push(...(b.gen2 ? P.now : P.past).map(n => n.replace(/（水上）$/, '')));
      if (!out.length && b.side) out.push(REGION_JA[SIDE_REGION[b.side]]);
    }
    if (!out.length && s.story) out = [REGION_JA.forest];
    if (!out.length) out = ['はじまりの町'];
  }
  return (_habCache[spId] = [...new Set(out)]);
}
export function habitatName(spId, seed = '') {
  const L = habitatPlaces(spId); let h = 0; for (const ch of String(seed)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return L[h % L.length] || '';
}
// 出会った 場所の 記録を ふつうに する（「運営からの プレゼント」や、管理サイトで 作った 子の「はじまりの町」→ 住んでいる 場所）
export function unnaturalMet(m) { const t = String(m?.metAt || ''); return /運営|プレゼント/.test(t) || (t === 'はじまりの町' && !habitatPlaces(m.sp).includes('はじまりの町')); }
export function naturalMetAt(m) { if (m && unnaturalMet(m)) m.metAt = habitatName(m.sp, m.uid); return m?.metAt || ''; }
export function hiddenInDex(s) { if (s.hiddenQuest) return false; return s.legend || !!s.side || (s.rare && (s.hab.includes('inner') || s.hab.includes('abyss'))); }
export { BY_NAME };
