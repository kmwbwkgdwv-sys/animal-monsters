// =============================================================
//  おつかい（町の住民・通行人からの お願い）と 素材集め
// =============================================================
import { ERRAND_GIVERS, GIVER_BY_ID, MATS, matOf, errandReward, ERRAND_MAX, ERRAND_COOLDOWN } from '../data/errands.js';
import { TOWNS, REGIONS } from '../data/world.js';
import { SPECIES } from '../data/species.js';
import { TYPE_JA } from '../data/types.js';
import { G, itemCount, addItem, addMoney, save, isUnlocked } from './state.js';
import { monName } from './mon.js';
import { say, ask, toast } from '../ui/ui.js';
import { audio } from '../audio.js';

const TOWN_NAME = Object.fromEntries(TOWNS.map(t => [t.id, t.name]));
const townOf = (id) => TOWNS.find(t => t.id === id);
export const giverTownUnlocked = (g) => { const t = townOf(g.town); return !!t && isUnlocked(t.region); };

export function errState(id) {
  const E = (G.save.errands ||= {});
  return (E[id] ||= { i: 0, st: 'idle', ri: 0, prog: 0, next: 0, done: 0 });
}
const now = () => G.save.playTime || 0;
const reqOf = (g, s) => g.reqs[s.ri % g.reqs.length];

// 次に お願いする内容（届け先の町が まだ行けないなら とばす）
function nextReq(g) {
  const s = errState(g.id), L = g.reqs.length;
  for (let k = 0; k < L; k++) {
    const idx = (s.i + k) % L, r = g.reqs[idx];
    if (r.t === 'deliver') { const to = GIVER_BY_ID[r.to]; if (!to || !giverTownUnlocked(to)) continue; }
    return { req: r, idx };
  }
  return null;
}
export function activeErrands() {
  const out = [];
  for (const g of ERRAND_GIVERS) { const s = G.save.errands?.[g.id]; if (s && s.st === 'active') out.push({ g, s, req: reqOf(g, s) }); }
  return out;
}
const partyHasType = (type) => G.save.party.find(m => SPECIES[m.sp].types.includes(type));

// お願いの説明（短い）
export function reqSummary(req) {
  if (req.t === 'gather') { const M = MATS[req.mat]; return `${M.icon} ${M.name}を ${req.n}こ 持ってくる`; }
  if (req.t === 'hunt') return `⚔️ ${TYPE_JA[req.type]}タイプの 野生アニモンを ${req.n}匹 追いはらう`;
  if (req.t === 'show') return `👀 ${TYPE_JA[req.type]}タイプの アニモンを 見せる`;
  if (req.t === 'deliver') { const to = GIVER_BY_ID[req.to]; return `📦 ${TOWN_NAME[to.town]}の ${to.name}に 荷物を とどける`; }
  return '';
}
// 進み具合（表示用）
export function reqProgress(g, s, req) {
  if (req.t === 'gather') { const have = itemCount(MATS[req.mat].item); return { txt: `${Math.min(have, req.n)}/${req.n}`, ok: have >= req.n }; }
  if (req.t === 'hunt') return { txt: `${Math.min(s.prog, req.n)}/${req.n}`, ok: s.prog >= req.n };
  if (req.t === 'show') { const m = partyHasType(req.type); return { txt: m ? `${monName(m)}を 見せられる` : 'パーティーに いない', ok: !!m }; }
  if (req.t === 'deliver') return { txt: 'とどけ先へ 行こう', ok: false };
  return { txt: '', ok: false };
}
export function errandReady(g) {
  const s = G.save.errands?.[g.id]; if (!s || s.st !== 'active') return false;
  return reqProgress(g, s, reqOf(g, s)).ok;
}
function canOffer(g) {
  const s = errState(g.id);
  return s.st === 'idle' && now() >= s.next && G.save.party.length > 0 && activeErrands().length < ERRAND_MAX && !!nextReq(g);
}
// 頭の上の印：📦 届け物がある / 💰 報告できる / 🧺 新しいお願い
export function errandMark(n) {
  const g = n.giver; if (!g) return null;
  if (activeErrands().some(e => e.req.t === 'deliver' && e.req.to === g.id)) return '📦';
  if (errandReady(g)) return '💰';
  if (canOffer(g)) return '🧺';
  return null;
}

function finish(g, s) {
  s.st = 'idle'; s.prog = 0; s.done = (s.done || 0) + 1; s.i = s.ri + 1; s.next = now() + ERRAND_COOLDOWN;
  G.save.errandsDone = (G.save.errandsDone || 0) + 1;
}
async function pay(req, town, payerName, line) {
  const money = errandReward(req, town);
  addMoney(money); audio.sfx('item');
  await say([`${payerName}|${line}`, `|お小遣い ${money}円 を もらった！`]);
}

export async function talkErrand(n) {
  const g = n.giver, s = errState(g.id);
  // 1) この人あての 届け物
  const del = activeErrands().find(e => e.req.t === 'deliver' && e.req.to === g.id);
  if (del) {
    await say([`|${del.g.name}から あずかった 荷物を わたした。`]);
    finish(del.g, del.s);
    await pay(del.req, del.g.town, g.name, `${del.g.name}から？ わざわざ とどけてくれて ありがとう！ これ、お駄賃だよ。`);
    save(); return;
  }
  // 2) 引き受けている お願い
  if (s.st === 'active') {
    const req = reqOf(g, s), pr = reqProgress(g, s, req);
    if (!pr.ok) {
      const hint = req.t === 'gather' ? `（いま ${pr.txt}。フィールドで ${MATS[req.mat].verb}と 集まるよ）`
        : req.t === 'hunt' ? `（いま ${pr.txt}。たおすか つかまえると 数に入るよ）`
          : req.t === 'show' ? '（パーティーに 入れて 話しかけてね）' : '';
      await say([`${g.name}|${reqSummary(req).replace(/^\S+ /, '')}……おねがいね！${hint}`]);
      return;
    }
    if (req.t === 'gather') addItem(MATS[req.mat].item, -req.n);
    const line = req.t === 'show' ? `わあ……！ これが ${TYPE_JA[req.type]}タイプの ${monName(partyHasType(req.type))}！ 見せてくれて ありがとう！`
      : req.t === 'hunt' ? 'ほんとうに 追いはらってくれたんだ！ これで 安心だよ。ありがとう！'
        : `${MATS[req.mat]?.name || ''}を ${req.n}こ ちょうど！ 助かったよ、ありがとう！`;
    finish(g, s);
    await pay(req, g.town, g.name, line);
    save(); return;
  }
  // 3) 新しい お願い
  if (!G.save.party.length) return say([`${g.name}|アニモンを 連れて 冒険に 出たら、ちょっと たのみごとを してもいいかな？`]);
  if (now() < s.next) return say([`${g.name}|この前は ありがとう！ また こまったら たのむね。`]);
  const nx = nextReq(g);
  if (!nx) return say([`${g.name}|こんにちは！ いい 天気だね。`]);
  if (activeErrands().length >= ERRAND_MAX) return say([`${g.name}|おつかいで いそがしそうだね……。（同時に 引き受けられるのは ${ERRAND_MAX}つまで）`]);
  const req = nx.req, money = errandReward(req, g.town);
  await say([`${g.name}|${req.say}`]);
  const k = await ask(`おつかい：${reqSummary(req)}\nお小遣い：${money}円`, ['引き受ける', 'やめておく'], g.name);
  if (k !== 0) return say([`${g.name}|そっか……。気が向いたら また 声を かけてね。`]);
  s.st = 'active'; s.ri = nx.idx; s.prog = 0;
  audio.sfx('select');
  toast(`おつかいを 引き受けた！（メニューの「おつかい」で 確認できる）`, 2800);
  // すでに 見せられるなら その場で
  if (req.t === 'show' && partyHasType(req.type)) { save(); return talkErrand(n); }
  save();
}

export function cancelErrand(id) {
  const s = errState(id); if (s.st !== 'active') return;
  s.st = 'idle'; s.prog = 0; s.i = s.ri + 1; s.next = now() + 60;
  save();
}

// ---- 野生のアニモンを たおした／つかまえた ----
export function onWildBeaten(spId) {
  const sp = SPECIES[spId]; if (!sp) return;
  for (const e of activeErrands()) {
    if (e.req.t !== 'hunt' || !sp.types.includes(e.req.type) || e.s.prog >= e.req.n) continue;
    e.s.prog++;
    toast(e.s.prog >= e.req.n ? `🧺 おつかい達成！ ${TOWN_NAME[e.g.town]}の ${e.g.name}に 報告しよう` : `🧺 ${TYPE_JA[e.req.type]}タイプを 追いはらった（${e.s.prog}/${e.req.n}）`, 2600);
  }
}

// ---- 素材集め（木を切る・岩をくだく など） ----
const taken = new Map(); // 同じ場所は しばらく とれない
const TAKE_CD = 120 * 1000;
const okey = (o) => o.x.toFixed(1) + ',' + o.z.toFixed(1);
export function harvestMat(o) {
  const reg = G.world.regionAt(o.x, o.z);
  return matOf(o.k, REGIONS[reg]?.biome || reg);
}
export function harvestVerb(o) { const m = harvestMat(o); return m ? MATS[m].verb : null; }
export function harvest(o) {
  const mat = harvestMat(o); if (!mat) return;
  const M = MATS[mat];
  const t = taken.get(okey(o));
  if (t && performance.now() - t < TAKE_CD) { toast('もう 何も とれなさそうだ……（少し 時間を おこう）'); return; }
  if (itemCount(M.item) >= 99) { toast(`${M.name}は これ以上 持てない！`); return; }
  taken.set(okey(o), performance.now());
  const n = Math.random() < 0.2 ? 2 : 1;
  addItem(M.item, Math.min(n, 99 - itemCount(M.item)));
  audio.sfx(mat === 'stone' || mat === 'ore' ? 'hit' : 'item');
  // その素材を 集める おつかいがあれば 進み具合も
  const need = activeErrands().find(e => e.req.t === 'gather' && e.req.mat === mat);
  const extra = need ? `　おつかい ${Math.min(itemCount(M.item), need.req.n)}/${need.req.n}` : '';
  toast(`${M.icon} ${M.got}${n > 1 ? '（×2）' : ''}　${M.name} ${itemCount(M.item)}こ${extra}`, 2400);
  if (need && itemCount(M.item) >= need.req.n && itemCount(M.item) - n < need.req.n) toast(`🧺 ${M.name}が そろった！ ${TOWN_NAME[need.g.town]}の ${need.g.name}に とどけよう`, 3000);
  save();
}
export { TOWN_NAME };
