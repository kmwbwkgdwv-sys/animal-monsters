// =============================================================
//  開発用：ストーリーの 途中から 始められる セーブデータを 作る
//   buildStorySave('nekojita', 5) → 第5章「砂に眠る記憶」が 始まったところ
//   （tools/make-account.html から 使う。ゲーム本体からは 使わない）
// =============================================================
import { newState } from './save.js';
import { createMon, maxHp } from './mon.js';
import { BY_NAME, SPECIES } from '../data/species.js';
import { STEP_INDEX } from '../data/story.js';
import { STONES, TOWNS } from '../data/world.js';

const id = (nm) => BY_NAME[nm].id;
export function buildStorySave(name = 'nekojita', chapter = 5, opts = {}) {
  if (chapter !== 5) throw new Error('いまは 第5章の データだけ 作れます');
  const look = opts.look || { skin: 1, hair: 'short', hairCol: 1, shirt: 4, pants: 5, shoes: 6, hat: 'cap', hatCol: 8, bottom: 'pants' };
  const S = newState(name, look);
  const starter = opts.starter ?? 0;            // 0:炎 1:水 2:草
  const meet = (nm, lv, place, o = {}) => createMon(id(nm), lv, { ot: name, metAt: place, ...o });
  // ---- パーティー（第4章の 守護者マリナ Lv22 を 倒したくらいの 強さ） ----
  const st = createMon([2, 5, 8][starter], 27, { ot: name, metAt: 'はじまりの町' });     // 最初の相棒（Lv16で 進化ずみ）
  const lulu = createMon(id('ルミナ'), 25, { nick: 'ルル', gift: true, ot: name, metAt: 'こもれびの森' });
  const party = [st, lulu, meet('チュピール', 24, 'そよかぜ平原'), meet('ポニカ', 24, 'そよかぜ平原'), meet('ドンガメ', 23, 'せせらぎ湖畔'), meet('コノハリス', 23, 'こもれびの森')];
  const box = [meet('コロネズ', 12, 'はじまりの町周辺'), meet('ワタポポ', 11, 'そよかぜ平原'), meet('ハチッコ', 14, 'そよかぜ平原'), meet('キノコロ', 15, 'こもれびの森'), meet('アヒルン', 18, 'せせらぎ湖畔'), meet('ピチャコイ', 17, 'せせらぎ湖畔'), meet('イモムー', 9, 'そよかぜ平原')];
  const t0 = Date.now() - 5 * 86400000;
  [...party, ...box].forEach((m, i) => { m.caughtAt = t0 + i * 3600000; m.hp = maxHp(m); });
  S.party = party; S.box = box;
  // ---- ストーリー ----
  S.story = { step: STEP_INDEX['s10'], crests: 2, starter, legend: null, luluUid: lulu.uid, lulu: null, flags: {}, starterUid: st.uid };
  S.unlocked = ['start', 'plains', 'forest', 'lake', 'desert'];
  S.defeated = { ren1: true, grunt1: true, g1: true, ren2: true, zina1: true, g2: true };
  S.stones = { t_start: true, t_forest: true, t_lake: true, r_plains: true, r_plains2: true, r_forest: true, r_lake: true };
  S.lastHospital = 't_lake';
  // みなとまち（光る岩の前）から
  const stone = STONES.find(x => x.id === 't_lake');
  S.pos = [stone.pos[0], stone.pos[1] + 4]; S.ry = 0;
  // ---- 図鑑 ----
  const seenNames = ['チュピ', 'コロネズ', 'ピコネズ', 'モコモコ', 'ケロッタ', 'イトグモ', 'コノハリス', 'キノコロ', 'ツタヘビ', 'クラゲン', 'ハチッコ', 'ハサミン', 'ドンガメ', 'アヒルン', 'ウサピョン', 'ドロモグ', 'コンコ', 'ノネコ', 'フクロン', 'スイレン', 'トンボン', 'ビバロ'];
  for (const m of [...party, ...box]) { S.dex.seen[m.sp] = true; S.dex.caught[m.sp] = true; }
  for (const nm of seenNames) if (BY_NAME[nm]) S.dex.seen[BY_NAME[nm].id] = true;
  for (const sp of [1, 4, 7, [1, 4, 7][starter]]) S.dex.seen[sp] = true;
  S.dex.caught[[1, 4, 7][starter]] = true;
  // ---- 道具・お金 ----
  S.money = 12800;
  S.bag = { herb: 6, goodherb: 5, cureall: 2, revive: 2, ppdrop: 1, food1: 15, food2: 8, repel: 2, b_grass: 1, b_water: 1, h_berry: 1, h_clear: 1, scroll: 1 };
  S.items = { ib1: true, ib2: true, ib5: true, ib6: true, ib7: true, ib8: true, ib10: true };
  S.seenFoods = ['food1', 'food2'];
  S.playTime = 5 * 3600 + 23 * 60;
  S.created = t0; S.saved = Date.now();
  S.needLink = false;
  void SPECIES; void TOWNS;
  return S;
}
