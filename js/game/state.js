// ゲーム全体で共有する状態と、よく使う操作
import { SPECIES } from '../data/species.js';
import { ITEMS } from '../data/items.js';
import { writeGame } from './save.js';
import { healMon } from './mon.js';

export const G = {
  save: null, settings: null, renderer: null, state: 'boot', world: null, scene: null, cam: null,
  busy: false, // 会話・バトル・メニュー中は移動しない
};

export const PARTY_MAX = 6;
export function allMons() { return [...G.save.party, ...G.save.box]; }
export function findMon(uid) { return allMons().find(m => m.uid === uid) || null; }
export function partyHasSpecies(sp, exceptUid = null) { return G.save.party.some(m => m.sp === sp && m.uid !== exceptUid); }
// 仲間に加える（同じアニモンはパーティーに入れない・6体まで）
export function giveMon(mon, toBoxOnly = false) {
  registerDex(mon.sp, true);
  if (!toBoxOnly && G.save.party.length < PARTY_MAX && !partyHasSpecies(mon.sp)) { G.save.party.push(mon); return 'party'; }
  G.save.box.push(mon); return 'box';
}
export function registerDex(sp, caught) {
  const d = G.save.dex;
  const first = caught && !d.caught[sp];
  d.seen[sp] = true;
  if (caught) d.caught[sp] = true;
  return first;
}
export function dexCounts() {
  const d = G.save.dex;
  return { seen: Object.keys(d.seen).length, caught: Object.keys(d.caught).length };
}
export function itemCount(id) { return G.save.bag[id] || 0; }
export function addItem(id, n = 1) { G.save.bag[id] = (G.save.bag[id] || 0) + n; if (G.save.bag[id] <= 0) delete G.save.bag[id]; }
export function useItem(id) { if (!itemCount(id)) return false; addItem(id, -1); return true; }
export function addMoney(n) { G.save.money = Math.max(0, Math.min(9999999, G.save.money + n)); }
export function healParty() { for (const m of G.save.party) healMon(m); }
export function crests() { return G.save.story.crests || 0; }
// アニモンを 持てる数：はじめは 100匹。紋章 1つごとに +75、ストーリー クリアで 800匹
export const MON_CAP_BASE = 100, MON_CAP_STEP = 75, MON_CAP_MAX = 800;
export function monCap() { if (!G.save) return MON_CAP_BASE; return G.save.postGame ? MON_CAP_MAX : Math.min(MON_CAP_MAX, MON_CAP_BASE + crests() * MON_CAP_STEP); }
export function monCount() { return (G.save.party?.length || 0) + (G.save.box?.length || 0); }
export function monFull() { return monCount() >= monCap(); }
// 逃がせない子（ルル・伝説）
export function canRelease(m) { const S = G.save.story || {}; return !(m.uid === S.luluUid || m.uid === S.legendUid || SPECIES[m.sp]?.legend); }
export function save() { if (G.save) { try { if (G.capturePos) G.capturePos(); } catch (e) { /* */ } if (G.save.pid) G.save.cloudDirty = true; writeGame(G.save); if (G.onSaved) G.onSaved(); } }
export function itemName(id) { return ITEMS[id]?.name || id; }
export function speciesName(id) { return SPECIES[id]?.name || '？'; }
export function isUnlocked(region) { if (region === 'sea') return true; return G.save.unlocked.includes(region); }
