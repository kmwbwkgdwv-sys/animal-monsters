// =============================================================
//  ストーリー進行・ムービー（カットシーン）・サイドストーリー
// =============================================================
import { STEPS, STEP_INDEX, SCENES, CHAPTERS, QUESTS, GUARDIAN_STEP, CREST_JA, NPCS } from '../data/story.js';
import { TOWNS, TRAINERS, REGIONS, DUNGEONS } from '../data/world.js';
import { SPECIES, BY_NAME } from '../data/species.js';
import { createMon, legendIv } from './mon.js';
import { G, giveMon, addItem, addMoney, healParty, save, itemName, registerDex, monCap } from './state.js';
import { ITEMS, SHOP_FOODS, SHOP_HELD } from '../data/items.js';
import { UI, $, say, sayLine, hideDialog, narrate, fade, flash, letterbox, chapterTitle, toast, ask } from '../ui/ui.js';
import { audio } from '../audio.js';
import { OW, spawnActor, despawnActor, camTo, buildBarriers, refreshActors, refreshFollower, runFlow } from './overworld.js';
import { startTrainerBattle, startWildBattle } from '../ui/battleUI.js';
import * as MENU from '../ui/menus.js';
import * as ER from './errands.js';

export function currentStep() { return STEPS[Math.min(G.save.story.step, STEPS.length - 1)]; }
export function stepIdx(id) { return STEP_INDEX[id]; }
export function objective() {
  const st = currentStep();
  const ch = st.ch <= 11 ? `第${st.ch}章　${CHAPTERS[st.ch]}` : 'クリア後';
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
  if (t.t === 'talk') { p = npcPos(t.npc); label = (NPCS.find(n => n.id === t.npc) || {}).name || ''; }
  else if (t.t === 'reach') { p = t.pos; }
  else if (t.t === 'region') { const tw = TOWNS.find(x => x.region === t.region); p = tw ? tw.pos : null; label = REGIONS[t.region]?.name || ''; }
  else if (t.t === 'guardian') {
    const tw = TOWNS.find(x => x.guardian === 'g' + t.g);
    const door = OW.trig.find(d => d.kind === 'door' && d.type === 'hall' && d.town === tw?.id);
    p = door ? [door.x, door.z] : tw?.pos; label = '守護者の館';
  }
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
  const dest = !p ? '' : t.t === 'talk' ? `${pl}（${nav.label}）` : t.t === 'guardian' ? `${pl}の 守護者の館` : pl;
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
      if (G.save.party.length === 0 && G.save.box.length) G.save.party.push(G.save.box.shift());
      refreshFollower();
      break;
    }
    case 'returnLulu': {
      if (S.lulu) { const m = S.lulu; m.hp = Math.max(1, m.hp); const where = giveMon(m); S.lulu = null; if (where === 'box') toast('ルルは ボックスに 送られた（パーティーがいっぱい）'); }
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
      for (const sp of [1, 4, 7]) { if (sp === [1, 4, 7][S.starter]) continue; giveMon(createMon(sp, 5, { ot: G.save.name, metAt: 'はじまりの町' }), true); }
      break;
    }
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
      const ch = st.ch <= 11 ? `第${st.ch}章「${CHAPTERS[st.ch]}」` : '';
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
  if (st.trig.t === 'talk' && st.trig.npc === n.id) return '!';
  if (n.kind === 'giver') {
    const s = G.save.quests[n.quest.id];
    if (!s) return '!';
    if (!s.done && n.quest.steps[s.stage].trig.t === 'talk') return '?';
  }
  if (n.kind === 'spot') return '!';
  if (n.kind === 'questTrainer' && !G.save.defeated[n.id]) return '!';
  if (n.kind === 'errand') return ER.errandMark(n);
  return null;
}
export async function talkNpc(n) {
  const st = currentStep();
  if (st.trig.t === 'talk' && st.trig.npc === n.id) { running = false; return runStep(); }
  if (n.kind === 'trainer') {
    if (G.save.defeated[n.id]) return say([`${n.name}|また いつか 勝負しようね！`]);
    await say([`${n.name}|勝負だ！`]);
    return startTrainerBattle(n.tr.id, { route: n.tr });
  }
  if (n.kind === 'errand') return ER.talkErrand(n);
  if (n.kind === 'giver') return giverTalk(n.quest);
  if (n.kind === 'spot') return spotTalk(n.quest);
  if (n.kind === 'questTrainer') {
    if (G.save.defeated[n.id]) return say([`${n.name}|まいったよ……。`]);
    await say([`${n.name}|へっ、灯台守の じいさんに 頼まれたのか？ 勝負だ！`]);
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
  return say([`${q.giver.name}|${step.obj}……おねがいね！`]);
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
    if (r.mon) { const [nm, lv] = r.mon; const mon = createMon(BY_NAME[nm].id, lv, { ot: G.save.name, gift: true }); const where = giveMon(mon); lines.push(`|${nm} を もらった！` + (where === 'box' ? '（ボックスへ）' : '')); }
    audio.sfx('lvup');
    lines.push(`|サイドストーリー「${q.name}」クリア！`);
    await say(lines);
  } else toast(`サイドストーリー「${q.name}」が 進んだ！`);
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
