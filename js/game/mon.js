// アニモン個体（能力値計算・経験値・技・進化）
import { SPECIES } from '../data/species.js';
import { MOVES } from '../data/moves.js';
import { uid } from '../engine/util.js';

export const MAX_LV = 99;
export const expForLevel = (L) => L <= 1 ? 0 : L * L * L;

// ---- 能力値 ----
//  種族ごとに 基本の HP・攻撃・防御・素早さ（種族値）が決まっていて、
//  個体値（1〜15）は 7.5 を基準に ±で 種族値を 少しだけ 上げ下げする。
//   個体値15 → 種族値 +9%、個体値1 → 種族値 −7.8%（1あたり 1.2%）
//  インフレしないよう、平均的な個体（7.5）は 今までと ほぼ同じ強さ。
export const IV_MIN = 1, IV_MAX = 15, IV_MID = 7.5, IV_STEP = 0.012;
export const ivMul = (iv) => 1 + (iv - IV_MID) * IV_STEP;
// 個体値で調整したあとの種族値（表示用は小数1けた）
export function adjBase(mon) {
  const s = SPECIES[mon.sp], o = {};
  for (const k of ['hp', 'atk', 'def', 'spe']) o[k] = s.base[k] * ivMul(mon.iv[k]);
  return o;
}
export function calcStats(mon, lvOverride = null) {
  const L = lvOverride || mon.lv, b = adjBase(mon);
  const f = (x) => Math.floor((2 * x + 11) * L / 100);
  return {
    hp: f(b.hp) + L + 10,
    atk: f(b.atk) + 5,
    def: f(b.def) + 5,
    spe: f(b.spe) + 5,
  };
}
export function maxHp(mon, lvo) { return calcStats(mon, lvo).hp; }

export function movesAtLevel(spId, lv) {
  const s = SPECIES[spId];
  const ok = [...new Set(s.moves.filter(m => m.lv <= lv).map(m => m.id))];
  let res = ok.slice(-4);
  // 特別技は必ず残す
  if (s.sig && ok.includes(s.sig) && !res.includes(s.sig)) res = [s.sig, ...res.slice(-3)];
  return res;
}

// 伝説の個体値：4つとも 10〜15 のランダム
export const LEGEND_IV_MIN = 10;
export function legendIv(r = Math.random) {
  const v = () => LEGEND_IV_MIN + Math.floor(r() * (16 - LEGEND_IV_MIN));
  return { atk: v(), def: v(), hp: v(), spe: v() };
}
// ダンジョンの主の個体値：4つとも 6〜15
export function bossIv(r = Math.random) { const v = () => 6 + Math.floor(r() * 10); return { atk: v(), def: v(), hp: v(), spe: v() }; }
export function createMon(spId, lv, o = {}) {
  const r = o.rng || Math.random;
  const s = SPECIES[spId];
  // 個体値は 1〜15 の抽選（7.5 が まんなか）
  const v = () => IV_MIN + Math.floor(r() * (IV_MAX - IV_MIN + 1));
  const iv = o.iv || (s.legend ? legendIv(r) : { atk: v(), def: v(), hp: v(), spe: v() });
  const shiny = s.legend ? false : (o.shiny ?? (r() < 0.001));
  const mon = {
    uid: o.uid || uid('m'), sp: spId, nick: o.nick || '', lv, exp: expForLevel(lv), iv,
    moves: (o.moves || movesAtLevel(spId, lv)).map(id => ({ id, pp: MOVES[id].pp })),
    hp: 0, status: null, slp: 0, item: o.item || null, shiny, ot: o.ot || '', metAt: o.metAt || '', metLv: lv,
    caughtAt: Date.now(), fav: false, gift: !!o.gift,
  };
  mon.hp = maxHp(mon);
  return mon;
}

export function monName(mon) { return mon.nick || SPECIES[mon.sp].name; }
export function ivTotal(mon) { return mon.iv.atk + mon.iv.def + mon.iv.hp + mon.iv.spe; }
export function ivRank(mon) {
  const t = ivTotal(mon);
  if (t >= 60) return { s: 'さいこう', c: '#ffb800' };
  if (t >= 45) return { s: 'すばらしい', c: '#3aa0ff' };
  if (t >= 30) return { s: 'なかなか', c: '#4caf50' };
  return { s: 'ふつう', c: '#999' };
}

export function healMon(mon) {
  mon.hp = maxHp(mon); mon.status = null; mon.slp = 0;
  for (const m of mon.moves) m.pp = MOVES[m.id].pp;
}

// 経験値を加算。レベルアップ・新技・進化を返す
export function addExp(mon, amount) {
  const res = { lvups: [], learned: [], pending: [], evolve: null };
  if (mon.lv >= MAX_LV) return res;
  mon.exp += amount;
  while (mon.lv < MAX_LV && mon.exp >= expForLevel(mon.lv + 1)) {
    const before = maxHp(mon);
    mon.lv++;
    const after = maxHp(mon);
    if (mon.hp > 0) mon.hp = Math.min(after, mon.hp + (after - before));
    res.lvups.push(mon.lv);
    for (const lm of SPECIES[mon.sp].moves) {
      if (lm.lv === mon.lv && !mon.moves.find(x => x.id === lm.id)) {
        if (mon.moves.length < 4) { mon.moves.push({ id: lm.id, pp: MOVES[lm.id].pp }); res.learned.push(lm.id); }
        else res.pending.push(lm.id);
      }
    }
  }
  if (mon.lv >= MAX_LV) mon.exp = expForLevel(MAX_LV);
  const s = SPECIES[mon.sp];
  if (s.evoTo && mon.lv >= s.evoLv) res.evolve = s.evoTo;
  return res;
}

export function evolveMon(mon) {
  const s = SPECIES[mon.sp];
  if (!s.evoTo) return null;
  const before = maxHp(mon);
  mon.sp = s.evoTo;
  const after = maxHp(mon);
  if (mon.hp > 0) mon.hp = Math.min(after, mon.hp + (after - before));
  // 進化したレベルで覚える技
  const learned = [], pending = [];
  for (const lm of SPECIES[mon.sp].moves) {
    if (lm.lv === mon.lv && !mon.moves.find(x => x.id === lm.id)) {
      if (mon.moves.length < 4) { mon.moves.push({ id: lm.id, pp: MOVES[lm.id].pp }); learned.push(lm.id); } else pending.push(lm.id);
    }
  }
  return { from: s.id, to: mon.sp, learned, pending };
}

export function cloneMon(m) { return JSON.parse(JSON.stringify(m)); }
export function expToNext(mon) { return mon.lv >= MAX_LV ? 0 : expForLevel(mon.lv + 1) - mon.exp; }
export function expProgress(mon) {
  if (mon.lv >= MAX_LV) return 1;
  const a = expForLevel(mon.lv), b = expForLevel(mon.lv + 1);
  return Math.max(0, Math.min(1, (mon.exp - a) / (b - a)));
}
