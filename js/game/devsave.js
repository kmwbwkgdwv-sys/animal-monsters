// =============================================================
//  開発用：ストーリーの 途中から 始められる セーブデータを 作る
//   buildStorySave('nekojita', 4) → 第4章まで クリア（＝第5章が 始まったところ）
//   cleared は 1〜11（11 ＝ ストーリー 全クリア）
//   ストーリーの データ（STEPS・SCENES）を 順に なぞって、紋章・解放した 地域・倒した トレーナー・
//   ルル・伝説 などを 本物と 同じように そろえる。
//  （管理サイト admin/ と tools/make-account.html から 使う。ゲーム本体からは 使わない）
// =============================================================
import { newState } from './save.js';
import { createMon, maxHp, legendIv } from './mon.js';
import { BY_NAME, SPECIES } from '../data/species.js';
import { STEPS, SCENES, CHAPTERS } from '../data/story.js';
import { STONES, TOWNS, TRAINERS, rivalTeam, encounterTable, REGIONS, ORDER, DUNGEONS, DUNGEON_BOSS } from '../data/world.js';
import { SHOP_FOODS, ITEMS } from '../data/items.js';

export { CHAPTERS };
const id = (nm) => BY_NAME[nm] && BY_NAME[nm].id;
// その レベルまで 進化させた 種類
function grown(base, lv) { let s = SPECIES[base]; while (s && s.evoTo && s.evoLv && lv >= s.evoLv) s = SPECIES[s.evoTo]; return s ? s.id : base; }
// 章を クリアしたときの 目安の レベル（守護者・ライバルの レベルから）
const LV = { 1: 7, 2: 11, 3: 16, 4: 24, 5: 31, 6: 39, 7: 47, 8: 55, 9: 63, 10: 73, 11: 82 };
// 章を クリアしたときに いる 町（その章の 最後の イベントの 場所）
const TOWN_AT = { 1: 't_start', 2: 't_forest', 3: 't_forest', 4: 't_lake', 5: 't_desert', 6: 't_canyon', 7: 't_snow', 8: 't_swamp', 9: 't_highland', 10: 't_volcano', 11: 't_start' };

// ストーリーの 出来事を なぞる（勝った ことに する）
function simulate(clearedCh) {
  const target = STEPS.findIndex(s => s.ch > clearedCh);
  const end = target < 0 ? STEPS.length - 1 : target;
  const R = { step: end, unlocked: ['start'], crests: 0, defeated: {}, lulu: 'none', legend: false, others: false, postGame: false, home: false, gifts: {} };
  const run = (list) => {
    if (!list) return;
    if (typeof list === 'string') list = SCENES[list];
    if (!Array.isArray(list)) return;
    for (const c of list) {
      if (!c || typeof c !== 'object') continue;
      if (c.if) { run(c.if === 'won' ? c.then : (c.else || [])); continue; }
      switch (c.do) {
        case 'unlock': if (!R.unlocked.includes(c.region)) R.unlocked.push(c.region); break;
        case 'crest': R.crests = Math.max(R.crests, c.n); R.defeated['g' + c.n] = true; break;
        case 'giveLulu': R.lulu = 'party'; break;
        case 'takeLulu': case 'loseLulu': if (R.lulu === 'party') R.lulu = 'taken'; break;
        case 'returnLulu': if (R.lulu === 'taken') R.lulu = 'party'; break;
        case 'giveLegend': R.legend = true; break;
        case 'giveOtherStarters': R.others = true; break;
        case 'postGame': R.postGame = true; if (!R.unlocked.includes('inner')) R.unlocked.push('inner'); break;
        case 'warpHome': R.home = true; break;
        case 'give': R.gifts[c.item] = (R.gifts[c.item] || 0) + (c.n || 1); break;
      }
    }
  };
  for (let i = 0; i < end; i++) {
    const st = STEPS[i];
    run(st.scene); run(st.before);
    if (st.battle) R.defeated[st.battle] = true;
    run(st.after);
  }
  return R;
}

// その章まで クリアした ときに 歩いた 地域（解放されたばかりで まだ 行っていない 地域は のぞく）
export function visitedRegions(cleared) { return cleared <= 1 ? [] : cleared === 2 ? ['plains', 'forest'] : ORDER.slice(1, cleared); }
// その章までに 図鑑に のりそうな アニモン（管理サイトの 図鑑の 数あわせ用）
//  catchable：歩いた 地域・その地域の ダンジョン（主も）で 出会える 種類（＝捕まえられる）
//  seen：catchable ＋ 戦った トレーナーの アニモン・最初の 相棒3匹・（全クリアなら）伝説2匹
export function chapterPool(cleared, starter = 0) {
  cleared = Math.max(1, Math.min(11, Math.round(+cleared || 4)));
  const R = simulate(cleared);
  const catchable = new Set(), seen = new Set();
  // info：種類ごとの 出やすさ（w：その場所で 出会う 確率の 合計）・レベルの はんい・場所
  const info = new Map();
  const note = (sp, w, lv, minLv, where) => {
    const o = info.get(sp) || { w: 0, lv: null, where: '', best: -1 };
    o.w += w;
    if (w > o.best) { o.best = w; o.lv = [Math.max(lv[0], minLv || 1), Math.max(lv[1], minLv || 1)]; o.where = where; }
    info.set(sp, o); catchable.add(sp);
  };
  const regs = ['start', ...visitedRegions(cleared)];
  for (const reg of regs) for (const water of [false, true]) {
    let tbl = []; try { tbl = encounterTable(reg, water); } catch (e) { /* 水辺なし */ }
    if (water && tbl === encounterTable('sea', true)) tbl = [];   // その地域の 水辺の 子が いない（海の 子は のぞく）
    const tot = tbl.reduce((a, e) => a + e.w, 0) || 1;
    for (const e of tbl) note(e.sp, e.w / tot * (water ? 0.35 : 1), REGIONS[reg].lv, e.minLv, REGIONS[reg].name);
  }
  for (const [d, D] of Object.entries(DUNGEONS)) {
    if (!regs.includes(D.region) || D.post) continue;   // クリア後の ダンジョン（深淵の迷宮）は まだ 行っていない
    const tbl = encounterTable(d), tot = tbl.reduce((a, e) => a + e.w, 0) || 1;
    for (const e of tbl) note(e.sp, e.w / tot * 0.5, D.lv, e.minLv, D.name);
    const b = SPECIES.find(s => s && s.name === DUNGEON_BOSS[d]?.[0]); if (b) note(b.id, 0.02, [DUNGEON_BOSS[d][1], DUNGEON_BOSS[d][1]], 1, D.name + 'の主');
  }
  for (const id of catchable) seen.add(id);
  for (const tid of Object.keys(R.defeated)) {
    const tr = TRAINERS[tid]; if (!tr || !tr.team) continue;
    const team = typeof tr.team === 'string' ? rivalTeam(tr.team, starter) : tr.team;
    for (const [nm] of team) if (id(nm)) seen.add(id(nm));
  }
  for (const sp of [1, 4, 7]) seen.add(sp);
  if (R.lulu !== 'none') seen.add(id('ルミナ'));
  if (R.legend) { seen.add(199); seen.add(200); }
  return { catchable, seen, info };
}

// opts: { starter: 0|1|2, legend: 199|200, look }
export function buildStorySave(name = 'nekojita', cleared = 4, opts = {}) {
  cleared = Math.max(1, Math.min(11, Math.round(+cleared || 4)));
  const look = opts.look || { skin: 1, hair: 'short', hairCol: 1, shirt: 4, pants: 5, shoes: 6, hat: 'cap', hatCol: 8, bottom: 'pants' };
  const S = newState(name, look);
  const R = simulate(cleared);
  const starter = opts.starter ?? 0;
  const lv = LV[cleared];
  // 実際に 歩いた 地域（解放されたばかりで まだ 行っていない 地域は のぞく）
  const visited = visitedRegions(cleared);
  const t0 = Date.now() - (cleared + 1) * 86400000;
  let k = 0;
  const meet = (base, l, place, o = {}) => { const m = createMon(grown(base, l), l, { ot: name, metAt: place, ...o }); m.caughtAt = t0 + (k++) * 3600000; return m; };
  // ---- 手持ち ----
  const st = meet([1, 4, 7][starter], cleared === 1 ? lv : lv + 2, 'はじまりの町');
  let lulu = null;
  if (R.lulu !== 'none') lulu = meet(id('ルミナ'), Math.max(10, lv), 'こもれびの森', { nick: 'ルル', gift: true });
  // 地域ごとの 仲間（ライドできる子を 先に）
  const POOL = [['チュピ', 'plains', 2], ['ポニカ', 'plains', 2], ['コノハリス', 'forest', 3], ['ドンガメ', 'lake', 4]];
  for (const reg of ['desert', 'canyon', 'snow', 'swamp', 'highland', 'volcano', 'sanctuary']) {
    if (!visited.includes(reg)) continue;
    const used = new Set(POOL.map(p => SPECIES[id(p[0])].line));
    const e = encounterTable(reg).find(x => { const s = SPECIES[x.sp]; return s.stage === 1 && s.stages >= 2 && !s.evoFrom && !used.has(s.line); });
    if (e) POOL.push([SPECIES[e.sp].name, reg, 99]);
  }
  const want = cleared === 1 ? 0 : cleared === 2 ? 2 : cleared === 3 ? 3 : 5;   // 相棒・ルル の ほかに パーティーに 入れる 数
  const caught = [];
  POOL.forEach(([nm, reg], i) => {
    if (!id(nm) || !visited.includes(reg)) return;   // 第1章クリア直後は まだ 相棒だけ
    const l = Math.max(3, lv - 1 - (i % 3));
    caught.push(meet(id(nm), l, REGIONS[reg]?.name || ''));
  });
  const party = [st];
  if (lulu && R.lulu === 'party') party.push(lulu);
  const room = Math.min(6 - party.length, want + (R.lulu === 'party' ? 0 : (cleared >= 3 ? 1 : 0)));
  // 新しい 地域の 子を 優先しつつ、ライドできる子（ポニカ・ドンガメ）は 残す
  const order = [...caught].sort((a, b) => (SPECIES[b.sp].ride ? 1 : 0) - (SPECIES[a.sp].ride ? 1 : 0) || b.caughtAt - a.caughtAt);
  const inParty = order.slice(0, Math.max(0, room));
  party.push(...inParty);
  const box = caught.filter(m => !inParty.includes(m));
  // ボックス：通った 地域で つかまえた 子（各地域 2匹）
  const lineOf = (sp) => SPECIES[sp].line;
  const have = (sp) => [...party, ...box].some(m => lineOf(m.sp) === lineOf(sp));
  for (const reg of visited) {
    const tbl = encounterTable(reg).filter(x => SPECIES[x.sp].stage === 1 && !have(x.sp));
    const rl = REGIONS[reg]?.lv || [5, 10];
    for (const e of tbl.slice(0, 2)) box.push(meet(e.sp, rl[0] + 1, REGIONS[reg].name));
  }
  if (R.others) { for (const sp of [1, 4, 7]) if (sp !== [1, 4, 7][starter]) box.push(meet(sp, 5, 'はじまりの町')); S.story.othersGiven = true; }
  // 伝説（全クリア）
  let legendMon = null;
  if (R.legend) {
    const legSp = opts.legend === 200 ? 200 : 199;
    const iv = legendIv();
    legendMon = createMon(legSp, 80, { ot: name, metAt: 'さいはての聖域', iv: { ...iv } });
    legendMon.caughtAt = Date.now() - 3600000;
    if (party.length >= 6) box.unshift(party.pop());   // 伝説は 手持ちに 入れる
    party.push(legendMon);
    S.story.legend = legSp; S.story.legendIv = iv; S.story.legendUid = legendMon.uid;
  }
  for (const m of [...party, ...box]) m.hp = maxHp(m);
  if (lulu) lulu.hp = maxHp(lulu);
  S.party = party; S.box = box;
  // ---- ストーリー ----
  Object.assign(S.story, { step: R.step, crests: R.crests, starter, starterUid: st.uid, luluUid: lulu ? lulu.uid : null, lulu: R.lulu === 'taken' ? lulu : null, flags: {} });
  S.unlocked = R.unlocked;
  S.defeated = R.defeated;
  S.postGame = R.postGame;
  // 光る岩：歩いた 地域の 町と 岩
  S.stones = { t_start: true };
  for (const t of TOWNS) if (visited.includes(t.region)) S.stones['t_' + t.id] = true;
  const RSTONE = { sanctuary: 'r_sanct', inner: 'r_inner' };
  for (const s of STONES) { if (s.town) continue; const reg = Object.keys(RSTONE).find(r => RSTONE[r] === s.id) || s.id.replace(/^r_/, '').replace(/\d+$/, ''); if (visited.includes(reg)) S.stones[s.id] = true; }
  const home = TOWN_AT[cleared];
  S.lastHospital = home; S.stones[home] = true;
  const stone = STONES.find(x => x.id === home);
  S.pos = [stone.pos[0], stone.pos[1] + 4]; S.ry = 0;
  // ---- 図鑑 ----
  const seen = (sp) => { if (sp) S.dex.seen[sp] = true; };
  for (const m of [...party, ...box, ...(lulu ? [lulu] : [])]) { S.dex.caught[m.sp] = true; let s = SPECIES[m.sp]; while (s) { seen(s.id); s = s.evoFrom ? SPECIES[s.evoFrom] : null; } }
  for (const sp of [1, 4, 7]) seen(sp);
  for (const tid of Object.keys(R.defeated)) {
    const tr = TRAINERS[tid]; if (!tr || !tr.team) continue;
    const team = typeof tr.team === 'string' ? rivalTeam(tr.team, starter) : tr.team;
    for (const [nm] of team) seen(id(nm));
  }
  if (R.legend) { seen(199); seen(200); }
  // ---- 道具・お金 ----
  const c = R.crests;
  S.money = 3000 + cleared * 3500;
  S.bag = { herb: 5 + cleared, food1: 15, repel: 2 };
  if (c >= 1) Object.assign(S.bag, { goodherb: 3 + c, food2: 10, revive: 1 + Math.floor(c / 2), ppdrop: 1 });
  if (c >= 2) S.bag.scroll = 1;
  if (c >= 3) Object.assign(S.bag, { superherb: 2 + c, food3: 6 });
  if (c >= 5) Object.assign(S.bag, { fullmed: 2, ppspring: 1 });
  if (c >= 6) S.bag.food4 = 4;
  if (R.postGame) S.bag.maxrevive = 2;
  for (const [it, n] of Object.entries(R.gifts)) S.bag[it] = (S.bag[it] || 0) + n;
  S.seenFoods = SHOP_FOODS.filter(f => c >= (ITEMS[f].unlock || 0));
  S.crowns = {};
  if (c >= 4) { S.crowns.s = true; S.bag.crown_s = 1; }
  if (R.postGame) { S.crowns.g = true; S.bag.crown_g = 1; }
  S.playTime = Math.round(cleared * 1.15 * 3600 + 1200);
  S.created = t0; S.saved = Date.now();
  S.needLink = false;
  return S;
}
// 選択肢の 文字（管理サイト用）
export const CLEAR_JA = (n) => n >= 11 ? `第11章「${CHAPTERS[11]}」クリア（ストーリー 全クリア）` : `第${n}章「${CHAPTERS[n]}」クリア まで（第${n + 1}章「${CHAPTERS[n + 1]}」が 始まる ところ）`;

// =============================================================
//  今ある セーブの ストーリーの 進み具合を「第N章まで クリア」に そろえる（管理サイトの プレゼントで 使う）
//   ・アニモンは 消さない（ルルは さらわれ中／いっしょ を その章に 合わせる、いなければ 作る）
//   ・紋章・行ける 地域・倒した ストーリーの 相手・クリア後 を その章に 合わせる
//   ・次の 章が 始まる 町へ 移動（行けない 地域に 取り残されないように）
// =============================================================
export function applyProgress(S, cleared, opts = {}) {
  cleared = Math.max(1, Math.min(11, Math.round(+cleared || 1)));
  const R = simulate(cleared);
  const st = S.story;
  const storyTr = new Set(STEPS.filter(x => x.battle).map(x => x.battle));
  for (const t of storyTr) delete S.defeated[t];
  for (let n = 1; n <= 8; n++) delete S.defeated['g' + n];
  Object.assign(S.defeated, R.defeated);
  st.step = R.step; st.crests = R.crests; st.flags = {};
  S.unlocked = R.unlocked.slice();
  S.postGame = R.postGame;
  const all = () => [...S.party, ...S.box];
  const avg = Math.max(5, Math.round(S.party.reduce((a, m) => a + m.lv, 0) / Math.max(1, S.party.length)));
  // ルル
  let lulu = st.luluUid ? (all().find(m => m.uid === st.luluUid) || st.lulu || null) : null;
  if (!lulu && R.lulu !== 'none') { lulu = createMon(id('ルミナ'), Math.min(99, Math.max(10, avg)), { nick: 'ルル', gift: true, ot: S.name, metAt: 'こもれびの森' }); st.luluUid = lulu.uid; }
  if (lulu) {
    const pi = S.party.indexOf(lulu), bi = S.box.indexOf(lulu);
    if (R.lulu === 'taken') { if (pi >= 0) S.party.splice(pi, 1); if (bi >= 0) S.box.splice(bi, 1); st.lulu = lulu; }
    else { st.lulu = null; if (pi < 0 && bi < 0) { if (S.party.length < 6 && !S.party.some(m => m.sp === lulu.sp)) S.party.push(lulu); else S.box.unshift(lulu); } }
  }
  if (!S.party.length && S.box.length) S.party.push(S.box.shift());
  // 伝説（全クリアで まだ 持っていない とき）
  if (R.legend && !st.legendReleased && !(st.legendUid && all().some(m => m.uid === st.legendUid))) {
    const sp = opts.legend === 200 ? 200 : opts.legend === 199 ? 199 : (st.legend || 199);
    const iv = st.legendIv || legendIv();
    const m = createMon(sp, 80, { ot: S.name, metAt: 'さいはての聖域', iv: { ...iv } });
    st.legend = sp; st.legendIv = iv; st.legendUid = m.uid;
    if (S.party.length < 6) S.party.push(m); else S.box.unshift(m);
    S.dex.seen[199] = S.dex.seen[200] = true;
  }
  // 全クリアの ごほうび：ほかの 最初の 相棒 2匹
  if (R.others && !st.othersGiven) {
    st.othersGiven = true;
    for (const sp of [1, 4, 7]) if (sp !== [1, 4, 7][st.starter ?? 0]) S.box.push(createMon(sp, 5, { ot: S.name, metAt: 'はじまりの町' }));
  }
  for (const m of [...all(), ...(st.lulu ? [st.lulu] : [])]) { S.dex.caught[m.sp] = true; S.dex.seen[m.sp] = true; }
  // 次の 章が 始まる 町へ
  const home = TOWN_AT[cleared];
  S.lastHospital = home; S.stones = S.stones || {}; S.stones[home] = true;
  const stone = STONES.find(x => x.id === home);
  if (stone) { S.pos = [stone.pos[0], stone.pos[1] + 4]; S.ry = 0; }
  return { step: R.step, crests: R.crests, lulu: R.lulu, legend: R.legend, postGame: R.postGame };
}
// セーブから「いま 何章か」（管理サイトの 表示用）
export function progressText(S) {
  const step = STEPS[S?.story?.step ?? 0];
  if (!step) return '？';
  return step.ch > 11 ? 'ストーリー クリア後' : `第${step.ch}章「${CHAPTERS[step.ch]}」：${step.obj}`;
}
