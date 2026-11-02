// =============================================================
//  ストーリー進行・ムービー（カットシーン）・サイドストーリー
// =============================================================
import { STEPS, STEP_INDEX, SCENES, CHAPTERS, QUESTS, GUARDIAN_STEP, CREST_JA, NPCS, chLabel } from '../data/story.js';
import { TOWNS, TRAINERS, REGIONS, DUNGEONS, ERA, IMPACT, CRATER_R, VOLCANO_C, TIME_GATES, polar } from '../data/world.js';
import { SPECIES, BY_NAME } from '../data/species.js';
import { createMon, legendIv, monName, ivTotal } from './mon.js';
import { G, giveMon, addItem, addMoney, healParty, save, itemName, registerDex, monCap, itemCount } from './state.js';
import { ITEMS, SHOP_FOODS, SHOP_HELD } from '../data/items.js';
import { UI, $, say, sayLine, hideDialog, narrate, fade, flash, letterbox, chapterTitle, toast, ask, confirmBox } from '../ui/ui.js';
import { audio } from '../audio.js';
import { OW, spawnActor, despawnActor, camTo, buildBarriers, refreshActors, refreshFollower, runFlow } from './overworld.js';
import { startTrainerBattle, startWildBattle } from '../ui/battleUI.js';
import * as FX from './movieFx.js';
import * as MENU from '../ui/menus.js';
import * as ER from './errands.js';

export function currentStep() { return STEPS[Math.min(G.save.story.step, STEPS.length - 1)]; }
export function stepIdx(id) { return STEP_INDEX[id]; }
export function objective() {
  const st = currentStep();
  const ch = st.ch <= 11 || (st.ch >= 13 && st.ch <= 21) ? chLabel(st.ch, false) + '　' + CHAPTERS[st.ch] : chLabel(st.ch);
  let quest = '';
  const act = activeQuest();
  if (act) quest = `◆${act.q.name}：${act.q.steps[act.st.stage].obj}`;
  return { ch, txt: st.obj, quest };
}
// 次の行き先（ミニマップ・マップ・HUDの矢印用）
//  返り値 { x, z, label, kind:'story'|'quest' } または null
export function navTarget() {
  const st = currentStep(), t = st.trig;
  const npcPos = (id) => {
    const live = OW.npcs.find(n => n.id === id); if (live) return [live.x, live.z];
    const sp = OW.spawned && OW.spawned[id]; if (sp && sp.root) return [sp.root.pos[0], sp.root.pos[2]];
    const d = NPCS.find(n => n.id === id); return d && d.pos ? d.pos : null;
  };
  let p = null, label = '';
  // ちがう 時代で 起きる イベント（過去の 人・過去の 場所）のときは、まず 時の扉へ
  const needEra = t.era || (t.npc && (NPCS.find(n => n.id === t.npc) || {}).era);
  if (needEra && G.save.era && (needEra === 'past') === !!ERA.ruin) {
    const P = OW.player; let b = null, bd = 1e9; for (const g of TIME_GATES) { const d = P ? Math.hypot(g.pos[0] - P.x, g.pos[1] - P.z) : 0; if (d < bd) { bd = d; b = g; } }
    if (b) return { x: b.pos[0], z: b.pos[1], label: needEra === 'past' ? '時の扉（過去へ）' : '時の扉（現在へ）', kind: 'story' };
  }
  if (t.t === 'talk' || (t.t === 'deliver' && t.npc)) { p = npcPos(t.npc); label = (NPCS.find(n => n.id === t.npc) || {}).name || ''; }
  else if (t.t === 'era') { const P = OW.player; let b = null, bd = 1e9; for (const g of TIME_GATES) { const d = P ? Math.hypot(g.pos[0] - P.x, g.pos[1] - P.z) : 0; if (d < bd) { bd = d; b = g; } } if (b) { p = b.pos; label = '時の扉'; } }
  else if (t.t === 'reach') { p = t.pos; }
  else if (t.t === 'region') { const tw = TOWNS.find(x => x.region === t.region); p = tw ? tw.pos : null; label = REGIONS[t.region]?.name || ''; }
  else if (t.t === 'guardian') {
    const tw = TOWNS.find(x => x.guardian === 'g' + t.g);
    const door = OW.trig.find(d => d.kind === 'door' && d.type === 'hall' && d.town === tw?.id);
    p = door ? [door.x, door.z] : tw?.pos; label = '守護者の館';
  }
  if (st.id === 'end' && !G.save.era && G.save.story.step >= STEP_INDEX.end) { p = [-34, 506]; label = '流れ星の かけら'; }
  if (p && (t.t === 'reach' || t.t === 'region')) p = openSpot(p);
  if (p) return { x: p[0], z: p[1], label: label || st.obj.replace(/（.*?）/g, '').slice(0, 14), kind: 'story' };
  // ストーリーの行き先がないときは、進行中のサイドストーリー
  const act = activeQuest();
  if (act) {
    const qs = act.q.steps[act.st.stage], qt = qs.trig;
    let qp = qt.pos || (qt.t === 'talk' ? act.q.giver.pos : null);
    if (qt.t === 'dungeon' && DUNGEONS[qt.id]) qp = DUNGEONS[qt.id].pos;
    if (qp) return { x: qp[0], z: qp[1], label: act.q.name, kind: 'quest' };
  }
  return null;
}
// 行き先の 光の柱が 噴水・建物・岩の 中に 立たないよう、近くの 歩ける場所に ずらす
//  町の 真ん中（噴水）のときは、噴水の 南側の 広場（光る岩との あいだ）
function openSpot(p) {
  const tw = TOWNS.find(t => Math.hypot(t.pos[0] - p[0], t.pos[1] - p[1]) < 0.5);
  if (tw) p = [tw.pos[0], tw.pos[1] + 4.6];
  const W = G.world; if (!W) return p;
  const free = (x, z) => !W.blockedByObst(x, z, 1.2) && W.heightAt(x, z) > -0.3;
  if (free(p[0], p[1])) return p;
  for (let R = 2; R <= 16; R += 2) for (let k = 0; k < 12; k++) { const a = k / 12 * Math.PI * 2, x = p[0] + Math.sin(a) * R, z = p[1] + Math.cos(a) * R; if (free(x, z)) return [x, z]; }
  return p;
}
function activeQuest() {
  let best = null;
  for (const q of QUESTS) { const st = G.save.quests[q.id]; if (st && !st.done && (!best || st.t > best.st.t)) best = { q, st }; }
  return best;
}
// ---- ストーリー一覧（目的の枠を 押すと 開く画面）用 ----
const townNear = (p) => { if (!p) return ''; let b = null, bd = 1e9; for (const t of TOWNS) { const d = Math.hypot(t.pos[0] - p[0], t.pos[1] - p[1]); if (d < bd) { bd = d; b = t; } } return b && bd < b.r + 8 ? b.name : ''; };
const regionName = (p) => { if (!p || !G.world) return ''; const r = G.world.regionAt(p[0], p[1]); return REGIONS[r]?.name || ''; };
export function placeName(p) { return townNear(p) || regionName(p) || ''; }
// サイドストーリーの 状態と 行き先
export function questInfo(q) {
  const st = G.save.quests[q.id];
  const reqI = STEP_INDEX[q.req] ?? 0;
  const avail = G.save.story.step >= reqI;
  if (st && st.done) return { state: 'done', obj: 'クリア済み' };
  if (!st) {
    if (!avail) return { state: 'locked', obj: 'ストーリーを 進めると 見つかるかも……' };
    return { state: 'new', obj: `${placeName(q.giver.pos)}の ${q.giver.name}に 話しかけよう`, pos: q.giver.pos, dest: `${placeName(q.giver.pos)}（${q.giver.name}）` };
  }
  const step = q.steps[st.stage], t = step.trig;
  let pos = t.pos || (t.t === 'talk' ? q.giver.pos : null);
  if (t.t === 'dungeon' && DUNGEONS[t.id]) pos = DUNGEONS[t.id].pos;
  if (t.t === 'battle') pos = TOWNS.find(x => x.id === 'lake')?.pos;
  const dest = t.t === 'talk' ? `${placeName(pos)}（${q.giver.name}）` : t.t === 'dungeon' ? DUNGEONS[t.id]?.name : placeName(pos);
  return { state: 'active', obj: step.obj, pos, dest, stage: st.stage, total: q.steps.length };
}
export function storyInfo() {
  const st = currentStep(), nav = navTarget();
  const P = OW.player;
  const p = nav && nav.kind === 'story' ? [nav.x, nav.z] : null;
  const t = st.trig, pl = p ? placeName(p) : '';
  const dest = !p ? '' : (t.t === 'talk' || t.t === 'deliver') ? `${pl}（${nav.label}）` : t.t === 'guardian' ? `${pl}の 守護者の館` : pl;
  return { ch: st.ch, chName: CHAPTERS[st.ch] || '', obj: st.obj, pos: p, dest, dist: p && P ? Math.round(Math.hypot(p[0] - P.x, p[1] - P.z)) : null, end: t.t === 'none' };
}
export { CHAPTERS, QUESTS };

// ---------- 王冠（銀：第6章クリア／金：ストーリークリア。1アカウント 1つずつ） ----------
export const CROWN_SILVER_CRESTS = 4;
export async function grantCrown(kind, quiet = false) {
  const C = (G.save.crowns ||= {});
  if (C[kind]) return false;
  C[kind] = true;
  const id = kind === 'g' ? 'crown_g' : 'crown_s';
  addItem(id, 1);
  audio.sfx('kiran');
  const how = kind === 'g' ? 'アニモン1匹の 個体値を 4つとも 最大に できる' : 'アニモン1匹の 個体値を 1つ 最大に できる';
  if (quiet) toast(`👑 ${ITEMS[id].name} を 手に入れた！（${how}）`, 4000);
  else await sayLine('', `👑 ${ITEMS[id].name} を 手に入れた！\n${how}。バッグの「その他」から 使えます（使うと なくなります）。`);
  save();
  return true;
}

// ---------- シーン実行 ----------
export async function runScene(sc, ctx = {}) {
  const list = typeof sc === 'string' ? SCENES[sc] : sc;
  if (!list) return;
  const isMovie = list.some(c => typeof c === 'object' && (c.narr || c.cam || c.spawn || c.flash));
  letterbox(isMovie);
  const sk = $('#skipBtn');
  sk.classList.remove('hidden');
  sk.onclick = () => { UI.skipping = true; import('../ui/ui.js').then(m => m.advance()); };
  if (G.settings.autoSkip) UI.skipping = true;
  try { await runList(list, ctx); }
  finally {
    UI.skipping = false; sk.classList.add('hidden'); hideDialog(); letterbox(false); camTo(null);
    $('#fade').style.opacity = 0; $('#narr').classList.remove('on');
  }
}
async function runList(list, ctx) {
  for (const c of list) {
    if (typeof c === 'string') {
      const i = c.indexOf('|');
      const name = i >= 0 ? c.slice(0, i) : '', text = i >= 0 ? c.slice(i + 1) : c;
      if (!UI.skipping) await sayLine(name, text);
      continue;
    }
    hideDialog();
    if (c.if) { const ok = c.if === 'won' ? ctx.won : !!G.save.story.flags[c.if]; await runList(ok ? c.then : (c.else || []), ctx); continue; }
    if (c.narr) { if (!UI.skipping) await narrate(c.narr, c.pic, c.mood); continue; }
    if (c.title) { await chapterTitle(c.title); continue; }
    if (c.bgm) { audio.playBgm(c.bgm); continue; }
    if (c.fade) { await fade(c.fade === 'out', UI.skipping ? 50 : (c.ms || 500)); continue; }
    if (c.flash) { audio.sfx('warp'); if (!UI.skipping) await flash(350); continue; }
    if (c.shake) { OW.shake = 1.2; if (!UI.skipping) await new Promise(r => setTimeout(r, 500)); continue; }
    if (c.wait) { if (!UI.skipping) await new Promise(r => setTimeout(r, c.wait)); continue; }
    if ('cam' in c) { camTo(c.cam); if (c.cam && !UI.skipping) await new Promise(r => setTimeout(r, c.ms || 1200)); continue; }
    if (c.spawn) { spawnActor(c.spawn); continue; }
    if (c.despawn) { despawnActor(c.despawn); continue; }
    if (c.do) { const wasSkip = UI.skipping; await doAction(c); UI.skipping = wasSkip; continue; }
  }
  hideDialog();
}

async function doAction(c) {
  const S = G.save.story;
  switch (c.do) {
    case 'chooseStarter': {
      UI.skipping = false;
      const idx = await MENU.chooseStarter();
      S.starter = idx;
      const sp = [1, 4, 7][idx];
      const mon = createMon(sp, 5, { ot: G.save.name, metAt: 'はじまりの町' });
      giveMon(mon); S.starterUid = mon.uid;
      UI.vars.S = SPECIES[sp].name;
      audio.sfx('catch');
      toast(`${SPECIES[sp].name} が 仲間になった！`);
      refreshFollower();
      break;
    }
    case 'rivalPick': { const rs = [4, 7, 1][S.starter]; await sayLine('', `レンは ${SPECIES[rs].name} を 選んだ！`); break; }
    case 'healParty': healParty(); break;
    case 'give': addItem(c.item, c.n || 1); audio.sfx('item'); break;
    case 'unlock': if (!G.save.unlocked.includes(c.region)) G.save.unlocked.push(c.region); buildBarriers(); refreshActors(); audio.sfx('warp'); break;
    case 'giveLulu': {
      // もう ルルが いる（管理サイトで 進み具合を もどした ときなど）なら 2匹目は 出さない
      if (S.luluUid && ([...G.save.party, ...G.save.box].some(m => m.uid === S.luluUid) || S.lulu)) break;
      const mon = createMon(BY_NAME['ルミナ'].id, 10, { nick: 'ルル', gift: true, ot: G.save.name, metAt: 'こもれびの森' });
      const where = giveMon(mon); S.luluUid = mon.uid; audio.sfx('catch');
      if (where === 'box') toast('ルルは ボックスに 送られた');
      break;
    }
    case 'crest': {
      const before = S.crests;
      S.crests = Math.max(S.crests, c.n);
      G.save.defeated['g' + c.n] = true;
      audio.sfx('lvup');
      await sayLine('', `${CREST_JA[c.n - 1]} を 手に入れた！`);
      // 新しいエサがショップに入荷
      for (const id of SHOP_FOODS) { const u = ITEMS[id].unlock; if (u > before && u <= S.crests) await sayLine('', `ショップに 新しいエサ「${ITEMS[id].name}」（なつきやすさ ${'★'.repeat(ITEMS[id].rank)}）が 入荷した！`); }
      // 新しい 持ち物（守り・耐える 系）も 入荷
      { const nh = SHOP_HELD.filter(id => { const u = ITEMS[id].unlock; return u > before && u <= S.crests; }); if (nh.length) await sayLine('', `ショップに 新しい 持ち物が ${nh.length}種類 入荷した！（${nh.map(id => ITEMS[id].name).join('・')}）`); }
      if (S.crests > before) await sayLine('', `📦 アニモンを 持てる数が ${monCap()}匹に 増えた！`);
      // 4つ目の紋章（第6章クリア）の ごほうび：銀の王冠
      if (S.crests >= CROWN_SILVER_CRESTS) await grantCrown('s');
      break;
    }
    case 'takeLulu': case 'loseLulu': {
      const uid = S.luluUid;
      for (const arr of [G.save.party, G.save.box]) { const i = arr.findIndex(m => m.uid === uid); if (i >= 0) { S.lulu = arr.splice(i, 1)[0]; break; } }
      // 連れ去られる 前の 技・持ち物を 覚えておく（戻ってきたとき そのまま 返す）
      if (S.lulu) S.luluKeep = { moves: JSON.parse(JSON.stringify(S.lulu.moves)), item: S.lulu.item || null, nick: S.lulu.nick || '' };
      if (G.save.party.length === 0 && G.save.box.length) G.save.party.push(G.save.box.shift());
      refreshFollower();
      break;
    }
    case 'returnLulu': {
      if (S.lulu) {
        const m = S.lulu;
        // 技構成・持ち物・ニックネームは 連れ去られる 前と 同じ まま
        if (S.luluKeep) { if (Array.isArray(S.luluKeep.moves) && S.luluKeep.moves.length) m.moves = S.luluKeep.moves; m.item = S.luluKeep.item; if (S.luluKeep.nick) m.nick = S.luluKeep.nick; }
        m.hp = Math.max(1, m.hp);
        const where = giveMon(m); S.lulu = null; delete S.luluKeep;
        if (where === 'box') toast('ルルは ボックスに 送られた（パーティーがいっぱい）');
      }
      refreshFollower();
      break;
    }
    case 'chooseLegend': {
      UI.skipping = false;
      const sp = await MENU.chooseLegend();
      S.legend = sp; UI.vars.L = SPECIES[sp].name;
      break;
    }
    case 'giveLegend': {
      // もう 伝説を 持っているなら 2匹目は 出さない（進み具合を もどして もう一度 見た ときなど）
      if (S.legendUid && [...G.save.party, ...G.save.box].some(m => m.uid === S.legendUid)) break;
      // 個体値は1回だけ決めてセーブに記録（読み込み直しても変わらない）
      if (!S.legendIv) { S.legendIv = legendIv(); save(); }
      const mon = createMon(S.legend, 80, { ot: G.save.name, metAt: 'さいはての聖域', iv: { ...S.legendIv } });
      const where = giveMon(mon); S.legendUid = mon.uid; audio.sfx('catch');
      save(); // 伝説は1発勝負：すぐ保存
      if (where === 'box') toast(`${SPECIES[S.legend].name}は ボックスに 送られた`);
      break;
    }
    case 'legendSleep': {
      const other = S.legend === BY_NAME['エンテイオウ'].id ? 'narume' : 'enteiou';
      despawnActor(other);
      despawnActor(other === 'narume' ? 'enteiou' : 'narume');
      registerDex(S.legend, true);
      break;
    }
    case 'warpHome': {
      const P = OW.player; P.x = -18; P.z = 613; P.ry = 0; OW.trail.length = 0;
      G.world.buildAll(P.x, P.z, 100); P.y = G.world.heightAt(P.x, P.z); OW.cam.pos = [P.x, P.y + 18, P.z + 18]; OW.cam.target = [P.x, P.y, P.z];
      G.save.lastHospital = 't_start';
      break;
    }
    case 'giveOtherStarters': {
      if (S.othersGiven) break;
      S.othersGiven = true;
      for (const sp of [1, 4, 7]) { if (sp === [1, 4, 7][S.starter]) continue; giveMon(createMon(sp, 5, { ot: G.save.name, metAt: 'はじまりの町' }), true); }
      break;
    }
    // ===== 第2部 =====
    case 'p2Sky': OW.movieSky = { bg: [0.22, 0.08, 0.12], fog: [0.36, 0.14, 0.14] }; OW.movieTheme = 'volcano'; break;
    case 'meteorIn': FX.meteorIn(); break;
    case 'legendsRise': FX.legendsRise(); break;
    case 'beams': FX.beams(); break;
    case 'meteorBreak': FX.meteorBreak(); break;
    case 'p2Impact': await p2Impact(); break;
    case 'view': await FX.view(c.at); break;
    case 'mutants': FX.mutants(); break;
    case 'mutantsGone': FX.mutantsGone(); break;
    case 'gatesOpen': S.flags.gates = true; save(); { const ov = await import('./overworld.js'); ov.rebuildP2Objects(); } break;
    case 'meteorOpen': S.flags.meteorOpen = true; save(); break;
    case 'legendCorrupt': FX.legendCorrupt(otherLegend()); break;
    case 'legendCalm': FX.legendCalm(); break;
    case 'giveOtherLegend': {
      if (S.legend2Uid && [...G.save.party, ...G.save.box].some(m => m.uid === S.legend2Uid)) break;
      const sp = otherLegend();
      const L = legendIv();
      const mon = createMon(sp, 99, { ot: G.save.name, metAt: 'メテオクレーター', iv: { ...L } });
      const where = giveMon(mon); S.legend2Uid = mon.uid; registerDex(sp, true); audio.sfx('catch');
      save();
      await sayLine('', `${SPECIES[sp].name} が 仲間に なった！` + (where === 'box' ? '（ボックスへ）' : ''));
      break;
    }
    case 'giveToki': {
      if (S.tokiUid && [...G.save.party, ...G.save.box].some(m => m.uid === S.tokiUid)) break;
      const mon = createMon(BY_NAME['トキワタリ'].id, 90, { ot: G.save.name, metAt: 'みなとまち跡', iv: { hp: 12, atk: 12, def: 12, spe: 12 } });
      const where = giveMon(mon); S.tokiUid = mon.uid; registerDex(mon.sp, true); audio.sfx('catch');
      await sayLine('トキワタリ', '……チク、タク。これからも いっしょ。');
      await sayLine('', `トキワタリ が 仲間に なった！` + (where === 'box' ? '（ボックスへ）' : ''));
      break;
    }
    case 'p2Clear': { S.flags.p2clear = true; S.flags.meteorOpen = true; save(); break; }
    case 'postGame': {
      G.save.postGame = true;
      await grantCrown('g');
      await sayLine('', `📦 アニモンを 持てる数が 最大の ${monCap()}匹に なった！`);
      if (!G.save.unlocked.includes('inner')) G.save.unlocked.push('inner');
      buildBarriers(); refreshActors();
      break;
    }
  }
}

// ---------- ステップの実行 ----------
let running = false;
export async function runStep() {
  if (running) return; running = true;
  try {
    while (true) {
      const st = currentStep();
      if (st.trig.t === 'none') break;
      if (st.scene) await runScene(st.scene);
      if (st.before) await runScene(st.before);
      // 納品：条件に あう アニモンを わたす（わたさなければ 進まない）
      if (st.trig.t === 'deliver' && !(await deliverMon(st.trig))) break;
      let won = true;
      if (st.battle) {
        const tr = TRAINERS[st.battle];
        if (tr.format === 'double' && G.save.party.filter(m => m.hp > 0).length < 2) {
          await say(['|ダブルバトルには 戦えるアニモンが 2匹 必要だ！ 仲間を 増やしてから 来よう。']);
          break;
        }
        const res = await startTrainerBattle(st.battle, { story: true, allowLose: st.allowLose });
        won = res === 'win';
        // 逃げたときは ストーリーは 進まない（あとで もう一度 話しかける・その場所に 行くと 再開）
        //  （負けても 進む 勝負＝はじめての ライバル戦 などは、逃げても 負けと 同じ あつかいで 進む）
        if ((res === 'run' && !st.allowLose) || res === 'none') {
          if (res === 'run') {
            toast('勝負から 逃げた。準備が できたら もう一度 挑戦しよう', 3200);
            if (st.trig.t === 'reach' || st.trig.t === 'region') { declined = G.save.story.step; decAt = [OW.player.x, OW.player.z]; rearmed = false; }
          }
          break;
        }
        if (!won && !st.allowLose) break;
      }
      // 第2部 第9章：心を こわされた もう一匹の 伝説（野生の ぬしと 同じ。勝つまで 何度でも）
      if (st.wildBoss) {
        const mon = createMon(otherLegend(), 99, { iv: { hp: 15, atk: 15, def: 15, spe: 15 } });
        const res = await startWildBattle(mon, { boss: true, noCatch: true, noRun: true });
        won = res === 'win';
        if (!won) { toast('伝説の 力に おされてしまった……。準備を して もう一度 挑もう', 3600); break; }
      }
      if (st.after) await runScene(st.after, { won });
      G.save.story.step++;
      refreshActors();
      save();
      if (!st.chain) break;
    }
  } finally { running = false; }
}

// 場所に着くと始まる ストーリーの イベントは、いきなり 始めずに 確認する。
//  「あとで」を 選んだら、その場所を いったん 離れるまで 始まらない（前の章の やり残しを 先に 終わらせられる）
//  地域に入るタイプは、境目を かすっただけで 始まらないよう 少し 奥まで 入ったときだけ
//  「あとで」のあとは、①その地域・場所を いったん 離れて もどる ②光の柱（目的地）に 行く ③ストーリー一覧の「イベントを 始める」 のどれかで 始まる
let declined = -1, decAt = null, rearmed = false;
const deepIn = (x, z, region) => [[6, 0], [-6, 0], [0, 6], [0, -6]].every(([dx, dz]) => G.world.regionAt(x + dx, z + dz) === region);
function posHit(t, x, z, reg) {
  if (t.era && (t.era === 'past') === !!ERA.ruin) return { near: 1e9, hit: false };   // その 時代で ないと 始まらない
  const near = t.t === 'reach' ? Math.hypot(x - t.pos[0], z - t.pos[1]) : 0;
  return { near, hit: (t.t === 'reach' && near < t.r) || (t.t === 'region' && reg === t.region && deepIn(x, z, t.region)) };
}
// いる場所で 始められる ストーリーの イベントが あるか（ストーリー一覧の ボタン用）
export function pendingHere() {
  const t = currentStep().trig, P = OW.player;
  if (running || !P || !G.world || (t.t !== 'reach' && t.t !== 'region')) return false;
  return posHit(t, P.x, P.z, G.world.regionAt(P.x, P.z)).hit;
}
export async function startPendingHere() {
  if (!pendingHere()) return false;
  declined = -1; running = false;
  await runStep();
  return true;
}
export function checkPosition(x, z, reg) {
  if (running) return;
  const st = currentStep();
  const t = st.trig;
  if (t.t === 'auto') { runFlow(() => runStep()); return; }
  const { near, hit } = posHit(t, x, z, reg);
  if (declined === G.save.story.step) {
    // 離れたら また 確認するように
    if ((t.t === 'reach' && near > t.r + 12) || (t.t === 'region' && reg !== t.region)) declined = -1;
    else {
      // 断った場所から 少し 動いたあと、光の柱（目的地）に 来たら もう一度 確認
      if (!rearmed && decAt && Math.hypot(x - decAt[0], z - decAt[1]) > 5) rearmed = true;
      if (rearmed && hit) { const nv = navTarget(); if (nv && nv.kind === 'story' && Math.hypot(x - nv.x, z - nv.z) < 4.5) declined = -1; }
    }
  } else if (hit) {
    const stepNow = G.save.story.step;
    runFlow(async () => {
      const ch = st.ch <= 11 || (st.ch >= 13 && st.ch <= 21) ? chLabel(st.ch, true) : '';
      const k = await ask(`📖 ここから ストーリーの イベントが 始まります。${ch}\n目的：${UI.fmt(st.obj)}\n今 進めますか？（「あとで」でも、光の柱に 行くか 左上の 目的を 押せば いつでも 始められます）`, ['進める', 'あとで']);
      if (k === 0) { running = false; await runStep(); }
      else { declined = stepNow; decAt = [OW.player.x, OW.player.z]; rearmed = false; toast('準備が できたら 光の柱へ（左上の 目的からも 始められます）', 3500); }
    });
    return;
  }
  // サイドストーリー（場所に着く）
  for (const q of QUESTS) {
    const s = G.save.quests[q.id]; if (!s || s.done) continue;
    const step = q.steps[s.stage];
    if (step.trig.t === 'reach' && Math.hypot(x - step.trig.pos[0], z - step.trig.pos[1]) < step.trig.r) { runFlow(() => questAdvance(q)); return; }
  }
}
export async function onCatch() {
  const st = currentStep();
  if (st.trig.t === 'catch') await runStep();
}
export function onDungeonClear(id) {
  for (const q of QUESTS) {
    const s = G.save.quests[q.id]; if (!s || s.done) continue;
    const step = q.steps[s.stage];
    if (step.trig.t === 'dungeon' && step.trig.id === id) { s.stage++; s.t = Date.now(); toast(`サイドストーリー「${q.name}」が 進んだ！`); refreshActors(); }
  }
}

// ---------- 話しかけ ----------
export function npcMark(n) {
  const st = currentStep();
  if ((st.trig.t === 'talk' || st.trig.t === 'deliver') && st.trig.npc === n.id) return '!';
  if (n.donate && !G.save.story.flags['don_' + n.donate]) return '…';
  if (n.kind === 'giver' || n.mergedQuest) {
    const q = n.kind === 'giver' ? n.quest : n.mergedQuest, s = G.save.quests[q.id];
    if (!s) return '!';
    if (!s.done && ['talk', 'deliver'].includes(q.steps[s.stage].trig.t)) return '?';
  }
  if (n.kind === 'spot') return '!';
  if (n.kind === 'questTrainer' && !G.save.defeated[n.id]) return '!';
  if (n.kind === 'errand') return ER.errandMark(n);
  return null;
}
export async function talkNpc(n) {
  const st = currentStep();
  if ((st.trig.t === 'talk' || st.trig.t === 'deliver') && st.trig.npc === n.id) { running = false; return runStep(); }
  if (n.donate) return donateTalk(n);
  // 同じ 人が 受けもつ サイドストーリー（始める とき・話して 進む ときだけ）
  if (n.mergedQuest) { const q = n.mergedQuest, s = G.save.quests[q.id], stp = s && !s.done ? q.steps[s.stage] : null; if (!s || (stp && ['talk', 'deliver'].includes(stp.trig.t))) return giverTalk(q); }
  if (n.kind === 'trainer') {
    if (G.save.defeated[n.id]) return say([`${n.name}|また いつか 勝負しようね！`]);
    await say([`${n.name}|勝負だ！`]);
    const res = await startTrainerBattle(n.tr.id, { route: n.tr });
    if (res !== 'win') OW.trCool[n.id] = true;   // 逃げたら 少し 離れるまで 目が合わない
    return res;
  }
  if (n.kind === 'errand') return ER.talkErrand(n);
  if (n.kind === 'giver') return giverTalk(n.quest);
  if (n.kind === 'spot') return spotTalk(n.quest);
  if (n.kind === 'questTrainer') {
    if (G.save.defeated[n.id]) return say([`${n.name}|まいったよ……。`]);
    await say([`${n.name}|${TRAINERS[n.id]?.intro || 'へっ、灯台守の じいさんに 頼まれたのか？ 勝負だ！'}`]);
    const res = await startTrainerBattle(n.id, {});
    if (res === 'win') checkQuestBattles();
    return;
  }
  if (n.trainer) {
    if (n.before) await runScene(n.before);
    const res = await startTrainerBattle(n.trainer, { rematch: true });
    if (res === 'win' && n.after) await runScene(n.after);
    return;
  }
  if (n.rest) {
    // ママ：話すと 休ませてくれる（家の入口と 同じことを 2回 しないよう ここに まとめた）
    await say(['ママ|{P}、おかえり！ 少し 休んでいきなさい。']);
    await fade(true, 400); MENU.healAll(); audio.sfx('heal'); await fade(false, 400);
    return say(['|アニモンたちは 元気いっぱいに なった！', 'ママ|アニモンが ケガをしたら 病院に 連れていくのよ。いってらっしゃい！']);
  }
  if (n.talk) return runScene(typeof n.talk === 'string' ? n.talk : n.talk);
  return say([`${n.name}|こんにちは！`]);
}
export async function enterHall(townId) {
  const t = TOWNS.find(x => x.id === townId);
  const g = +t.guardian.slice(1);
  const tr = TRAINERS['g' + g];
  if (G.save.defeated['g' + g]) return say([`${tr.name}|また いつでも 来なさい。あなたの 成長を 楽しみにしているわ。`.replace('わ。', '。')]);
  const st = currentStep();
  if (st.trig.t === 'guardian' && st.trig.g === g) { running = false; return runStep(); }
  if (G.save.story.step < STEP_INDEX[GUARDIAN_STEP[g]]) return say([`|${tr.name.replace(/.*守護者/, '守護者')}は 町の外の 騒ぎを 気にしているようだ……。（目的を 先に 進めよう）`]);
  return say(['|館は 静まりかえっている。']);
}

// ---------- サイドストーリー ----------
async function giverTalk(q) {
  let s = G.save.quests[q.id];
  if (!s) {
    await runScene(q.intro);
    G.save.quests[q.id] = s = { stage: 0, t: Date.now() };
    audio.sfx('item');
    toast(`サイドストーリー「${q.name}」開始！`);
    refreshActors(); save();
    return;
  }
  if (s.done) return say([`${q.giver.name}|この前は ありがとう！`]);
  const step = q.steps[s.stage];
  if (step.trig.t === 'talk') return questAdvance(q);
  if (step.trig.t === 'deliver') { if (await deliverMon(step.trig, q.giver.name)) return questAdvance(q); return; }
  return say([`${q.giver.name}|${step.obj.replace(/^【\d\/\d】/, '')}……おねがいね！`]);
}
async function spotTalk(q) {
  const s = G.save.quests[q.id]; if (!s || s.done) return;
  const step = q.steps[s.stage];
  if (step.trig.battle) {
    const tr = TRAINERS[step.trig.battle];
    const mon = createMon(BY_NAME[tr.wild[0]].id, tr.wild[1]);
    await say([`|${tr.name}…… ${tr.wild[0]} が 襲いかかってきた！`]);
    const res = await startWildBattle(mon, { boss: true, noCatch: true, noRun: true });
    if (res !== 'win') return;
  }
  return questAdvance(q);
}
export async function questAdvance(q) {
  const s = G.save.quests[q.id];
  const step = q.steps[s.stage];
  if (step.scene) await runScene(step.scene);
  if (q.reward.monFromSpot && step.trig.battle) {
    const [nm, lv] = q.reward.monFromSpot;
    const mon = createMon(BY_NAME[nm].id, lv, { ot: G.save.name, gift: true });
    const where = giveMon(mon); audio.sfx('catch');
    await say([`|${nm} が 仲間になった！` + (where === 'box' ? '（ボックスへ）' : '')]);
  }
  s.stage++; s.t = Date.now();
  if (s.stage >= q.steps.length) {
    s.done = true;
    const r = q.reward;
    const lines = [];
    if (r.money) { addMoney(r.money); lines.push(`|${r.money}円 を もらった！`); }
    for (const [id, n] of (r.items || [])) { addItem(id, n); lines.push(`|${itemName(id)} を ${n}個 もらった！`); }
    if (r.skyDragon) {
      // 隠しミッションの ごほうび：スカイドラゴン（個体値は すべて 12以上）
      const R = () => 12 + Math.floor(Math.random() * 4);
      const mon = createMon(BY_NAME['スカイドラゴン'].id, 80, { ot: G.save.name, metAt: '新大地の岬', iv: { hp: R(), atk: R(), def: R(), spe: R() } });
      const where = giveMon(mon); registerDex(mon.sp, true); audio.sfx('catch');
      lines.push(`|伝説の アニモン スカイドラゴン が 仲間になった！` + (where === 'box' ? '（ボックスへ）' : ''));
    }
    if (r.mon) { const [nm, lv] = r.mon; const mon = createMon(BY_NAME[nm].id, lv, { ot: G.save.name, gift: true }); const where = giveMon(mon); lines.push(`|${nm} を もらった！` + (where === 'box' ? '（ボックスへ）' : '')); }
    audio.sfx('lvup');
    lines.push(q.hidden ? `|${q.name} 3/3 クリア！` : `|サイドストーリー「${q.name}」クリア！`);
    await say(lines);
  } else toast(q.hidden ? `${q.name} ${s.stage + 1}/${q.steps.length} が 始まった！` : `サイドストーリー「${q.name}」が 進んだ！`);
  refreshActors(); save();
}
export function checkQuestBattles() {
  for (const q of QUESTS) {
    const s = G.save.quests[q.id]; if (!s || s.done) continue;
    const step = q.steps[s.stage];
    if (step.trig.t === 'battle' && step.trig.trainers.every(t => G.save.defeated[t])) { s.stage++; s.t = Date.now(); toast(`サイドストーリー「${q.name}」が 進んだ！`); refreshActors(); }
  }
}
export { activeQuest, NPCS };

// =============================================================
//  第2部：はじまり・時の扉・納品・寄付
// =============================================================
export function otherLegend() { const S = G.save.story; return S.legend === BY_NAME['ナルメクシア'].id ? BY_NAME['エンテイオウ'].id : BY_NAME['ナルメクシア'].id; }
// 読みこみ なおし（時代を 切りかえる・第2部の はじまり）。セーブして クラウドにも 送ってから
async function reloadInto(era, pos, scene) {
  const S = G.save;
  S.era = era; if (pos) S.pos = pos; S.ry = 0;
  if (scene) S.pendingScene = scene;
  G.capturePos = null;
  save();
  try { const ON = await import('../online.js'); if (ON.isConfigured() && S.pid) await Promise.race([ON.pushSave(true), new Promise(r => setTimeout(r, 5000))]); } catch (e) { /* */ }
  try { sessionStorage.setItem('animon_fastcont', '1'); } catch (e) { /* */ }
  location.reload();
  await new Promise(() => { });   // 読みこみ なおすまで 待つ
}
// 流れ星の かけらに さわる → 第2部
export async function startPart2() {
  const S = G.save.story;
  if (G.save.era) return;
  if (!(await confirmBox('あやしい 流れ星の かけらが 光っている……\nさわってみますか？\n（第2部が 始まります。大陸の 姿が 大きく 変わります）', 'さわる', 'やめる'))) return;
  try { const ON = await import('../online.js'); if (ON.inWorld && ON.inWorld()) { await say(['|フレンドと いっしょの ワールドに いる あいだは さわれない。（ワールドを 出てから）']); return; } } catch (e) { /* */ }
  await runScene('p2Meteor');
}
async function p2Impact() {
  const S = G.save.story;
  const f = $('#fade'); f.style.background = '#fff';
  await fade(true, 900);
  FX.cleanup();
  S.step = STEP_INDEX.p2_1;
  S.flags.p2 = true;
  for (const r of ['crater', 'lavaland']) if (!G.save.unlocked.includes(r)) G.save.unlocked.push(r);
  G.save.lastHospital = 't_start';
  await reloadInto('now', [-6, 604], 'p2After');
}
// 時の扉
export async function useGate(id) {
  const g = TIME_GATES.find(x => x.id === id); if (!g) return;
  const toPast = !!ERA.ruin;
  try { const ON = await import('../online.js'); if (ON.inWorld && ON.inWorld()) { await say(['|フレンドと いっしょの ワールドに いる あいだは 時の扉を 使えない。（ワールドを 出てから）']); return; } } catch (e) { /* */ }
  if (!(await confirmBox(toPast ? '時の扉が ゆらめいている……\n隕石が 落ちる 前の「過去」へ 行きますか？\n（もどるときは 過去の 同じ 場所の 扉から）' : '時の扉が ゆらめいている……\n「現在」へ もどりますか？', toPast ? '過去へ' : '現在へ', 'やめる'))) return;
  audio.sfx('warp');
  await flash(300);
  const f = $('#fade'); f.style.background = toPast ? '#fff6dc' : '#dcf6ff';
  await fade(true, 800);
  await reloadInto(toPast ? 'past' : 'now', [g.pos[0], g.pos[1] + 5], toPast ? 'gateToPast' : 'gateToNow');
}
SCENES.gateToPast = ['|時を こえて…… 隕石が 落ちる 前の 大陸に 来た！', '|（現在に もどるときは、この 時の扉に 入ろう）'];
SCENES.gateToNow = ['|時を こえて…… 現在の 大陸に もどってきた！'];
// 時代に 着いた ときの ストーリー（era トリガー）
export async function checkEraStep() {
  const st = currentStep();
  if (st.trig.t !== 'era') return false;
  if ((st.trig.era === 'past') !== !ERA.ruin) return false;
  running = false;
  await runStep();
  return true;
}
// 納品：条件に あう アニモンを 1匹 選んで わたす
async function deliverMon(t, who = '') {
  const ids = t.sp.map(n => BY_NAME[n]?.id).filter(Boolean);
  const S = G.save.story;
  const ok = (m) => ids.includes(m.sp) && ivTotal(m) >= t.iv && m.uid !== S.luluUid && !SPECIES[m.sp].legend;
  const all = [...G.save.party, ...G.save.box];
  if (!all.some(ok)) {
    const near = all.filter(m => ids.includes(m.sp)).map(m => ivTotal(m)).sort((a, b) => b - a)[0];
    await say([`${who ? who + '|' : '|'}${t.sp.join('か ')}で、個体値の 合計が ${t.iv}以上の 子を 連れてきてね。`, `|（ボックスの 子も わたせます。アニモンを 押すと 個体値を 確認できる${near != null ? `。今いる いちばん 高い 子は 合計 ${near}` : ''}）`]);
    return false;
  }
  UI.skipping = false;
  // 同じ 種類の 子を 1匹ずつ スライドして 見くらべ、わたす 子を 自分で 決める
  const cand = all.filter(m => ids.includes(m.sp) && m.uid !== S.luluUid && !SPECIES[m.sp].legend);
  const m = await MENU.slidePick({ title: '納品する アニモンを 選ぶ', mons: cand, okFn: ok, need: t.iv, cond: `${t.sp.join('／')}・個体値の 合計 ${t.iv}以上` });
  if (!m) return false;
  if (G.save.party.length === 1 && G.save.party[0] === m) { await say(['|パーティーが 0匹に なってしまう！ ほかの 子を パーティーに 入れてから わたそう。']); return false; }
  if (!(await confirmBox(`${monName(m)}（Lv${m.lv}・個体値の 合計 ${ivTotal(m)}）を わたしますか？\nわたした アニモンは もどってきません。${m.item ? '\n（持たせている 道具は バッグに もどります）' : ''}`, 'わたす', 'やめる'))) return false;
  if (m.item) { addItem(m.item, 1); m.item = null; }
  for (const arr of [G.save.party, G.save.box]) { const i = arr.indexOf(m); if (i >= 0) arr.splice(i, 1); }
  audio.sfx('item');
  await sayLine('', `${monName(m)} を わたした！`);
  refreshFollower(); save();
  return true;
}
// ボロボロの 町の 2人（2万円ずつ 寄付すると 隠しミッション）
const DONATE = {
  gen: { ask: ['ゲン|……すまんが、少しばかり 恵んでは くれんか。', 'ゲン|隕石の 夜に、家も 相棒も なくしてしもうてな……'], thanks: ['ゲン|……なんと。こんな 大金を……！', 'ゲン|ありがたい。この 恩は わすれんぞ。'], after: ['ゲン|空を 見上げると、むかしを 思い出すわい……'] },
  mitsu: { ask: ['ミツ|あんた、旅の 人かい？ この 町も すっかり 変わっちまってねえ。', 'ミツ|あたしゃ 港で 店を やってたんだけど、ぜんぶ 灰の 下さ。少しで いいから 助けて くれないかい？'], thanks: ['ミツ|まあ……！ あんた、なんて いい 子なんだい。', 'ミツ|これで しばらく 食べていけるよ。ありがとうねえ。'], after: ['ミツ|となりの ゲン じいさんはね、むかしは えらい 人だったらしいよ。'] },
};
async function donateTalk(n) {
  const F = G.save.story.flags, key = 'don_' + n.donate, D = DONATE[n.donate];
  if (F[key]) return say(D.after);
  await say(D.ask);
  const k = await ask('2万円 寄付しますか？', ['2万円 寄付する', 'やめておく']);
  if (k !== 0) return say([`${n.name.replace(/^ホームレスの/, '')}|……そうかい。気に しないで おくれ。`]);
  if (G.save.money < 20000) return say(['|お金が 足りない……（2万円 必要）']);
  addMoney(-20000); F[key] = true; audio.sfx('item');
  await say(D.thanks);
  if (F.don_gen && F.don_mitsu && !G.save.quests.q_skydragon) {
    await say(['|……ゲンが ゆっくりと 立ち上がった。', 'ゲン|ふたりに 寄付を してくれたのは、おまえさんが はじめてじゃ。', 'ゲン|実は わしは、むかし「竜使い」と よばれておった。', 'ゲン|空の 果てに すむ 伝説の 竜…… スカイドラゴンを 知っておるか？', 'ゲン|あの 竜に 会う 資格が あるか、3つの 試練で ためさせて もらおう。']);
    F.skyq = true;
    G.save.quests.q_skydragon = { stage: 0, t: Date.now() };
    audio.sfx('kiran');
    toast('隠しミッション 1/3 が 始まった！', 3600);
    refreshActors();
  }
  save();
}