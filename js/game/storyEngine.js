// =============================================================
//  ストーリー進行・ムービー（カットシーン）・サイドストーリー
// =============================================================
import { STEPS, STEP_INDEX, SCENES, CHAPTERS, QUESTS, GUARDIAN_STEP, CREST_JA, NPCS } from '../data/story.js';
import { TOWNS, TRAINERS } from '../data/world.js';
import { SPECIES, BY_NAME } from '../data/species.js';
import { createMon, legendIv } from './mon.js';
import { G, giveMon, addItem, addMoney, healParty, save, itemName, registerDex } from './state.js';
import { ITEMS, SHOP_FOODS } from '../data/items.js';
import { UI, $, say, sayLine, hideDialog, narrate, fade, flash, letterbox, chapterTitle, toast } from '../ui/ui.js';
import { audio } from '../audio.js';
import { OW, spawnActor, despawnActor, camTo, buildBarriers, refreshActors, refreshFollower, runFlow } from './overworld.js';
import { startTrainerBattle, startWildBattle } from '../ui/battleUI.js';
import * as MENU from '../ui/menus.js';

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
function activeQuest() {
  let best = null;
  for (const q of QUESTS) { const st = G.save.quests[q.id]; if (st && !st.done && (!best || st.t > best.st.t)) best = { q, st }; }
  return best;
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

export function checkPosition(x, z, reg) {
  if (running) return;
  const st = currentStep();
  const t = st.trig;
  if ((t.t === 'reach' && Math.hypot(x - t.pos[0], z - t.pos[1]) < t.r) || (t.t === 'region' && reg === t.region) || t.t === 'auto') {
    runFlow(() => runStep());
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
