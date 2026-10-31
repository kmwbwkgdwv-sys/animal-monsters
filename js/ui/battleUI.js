// =============================================================
//  バトル画面（UI・演出・結果処理）
// =============================================================
import { Battle } from '../game/battle.js';
import { BattleView } from '../render/battleScene.js';
import { SPECIES, BY_NAME } from '../data/species.js';
import { MOVES, moveEffectText, moveEffects } from '../data/moves.js';
import { ITEMS } from '../data/items.js';
import { TRAINERS, rivalTeam, DUNGEONS, REGIONS } from '../data/world.js';
import { typeBadge, TYPE_COLOR, TYPE_JA, typeEff } from '../data/types.js';
import { createMon, monName, calcStats, evolveMon, healMon, cloneMon } from '../game/mon.js';
import { G, giveMon, registerDex, itemCount, useItem, addMoney, save, healParty, findMon, monFull, monCount, monCap } from '../game/state.js';
import { $, el, esc, UI, toast, say, ask, confirmBox, inputText, fade, flash, hpClass, hideDialog, letterbox, glintAt } from './ui.js';
import { audio } from '../audio.js';
import { portrait } from '../render/portrait.js';
import { STATUS_JA } from '../game/battle.js';
import { Input } from '../input.js';

let bv = null, B = null, root = null, mySide = 0, ctx = null;
export function battleView() { return bv; }
const vs = (s) => s ^ mySide;

// ---------- 公開API ----------
export async function startWildBattle(mon, opts = {}) {
  if (!G.save.party.some(m => m.hp > 0)) { toast('戦える アニモンが いない！ 病院で 回復しよう'); return 'none'; }
  registerDex(mon.sp, false);
  return runBattle({
    kind: 'wild', format: 'single', biome: opts.biome || 'plains', boss: opts.boss, noCatch: opts.noCatch, noRun: opts.noRun,
    sides: [{ name: G.save.name, team: G.save.party, ai: 'player' }, { name: '野生', team: [mon], ai: 'wild' }],
  });
}
export async function startTrainerBattle(id, opts = {}) {
  const tr = opts.route ? { ...opts.route, ai: 'trainer' } : TRAINERS[id];
  let team = tr.team;
  if (typeof team === 'string') team = rivalTeam(team, G.save.story.starter ?? 0);
  const strong = tr.ai === 'boss';
  const mons = team.map(([nm, lv, item], i) => createMon(BY_NAME[nm].id, lv, { item, iv: strong ? { atk: 10 + (i * 3) % 6, def: 9 + (i * 5) % 7, hp: 10 + i % 6, spe: 9 + (i * 7) % 7 } : undefined, shiny: false }));
  // 最初のライバル戦は、レンの相棒がまだノーマル技しか覚えていない
  if (id === 'ren1') for (const m of mons) m.moves = m.moves.slice(0, 1);
  if (!G.save.party.some(m => m.hp > 0)) { toast('戦える アニモンが いない！'); return 'none'; }
  for (const m of mons) registerDex(m.sp, false);
  const res = await runBattle({
    kind: 'trainer', format: tr.format || 'single', biome: opts.biome || (await import('../game/overworld.js')).biomeHere(), boss: strong, trainerName: tr.name,
    sides: [{ name: G.save.name, team: G.save.party, ai: 'player' }, { name: tr.name, team: mons, ai: tr.ai === 'boss' ? 'boss' : 'trainer' }],
    reward: tr.reward || 0, story: opts.story, allowLose: opts.allowLose,
  });
  if (res === 'win' && !opts.rematch) G.save.defeated[opts.route ? opts.route.id : id] = true;
  return res;
}

// PvP（フレンド対戦）: remote = { mySide, submit(phase, choices), wait(phase) }
export async function startPvpBattle(cfg) {
  mySide = cfg.mySide;
  return runBattle({ ...cfg, kind: 'pvp' });
}

// ---------- 本体 ----------
async function runBattle(cfg) {
  ctx = cfg;
  if (cfg.kind !== 'pvp') mySide = 0;
  const prevState = G.state;
  G.state = 'battle';
  $('#hud').classList.add('hidden'); $('#touch').classList.add('hidden'); $('#labels').style.display = 'none'; letterbox(false);
  $('#screens').style.display = 'none'; // 開いているメニューはバトル中は隠す
  audio.sfx('encounter');
  audio.playBgm(cfg.boss || cfg.kind === 'pvp' ? 'boss' : 'battle');
  await battleWipe(true);
  bv = new BattleView();
  bv.setup(cfg.biome || 'plains', cfg.format);
  G.battleView = bv;
  // 色違いが 出たら キラーン（画面に 光の十字＋音＋一瞬の 白い光）
  bv.onGlint = (p) => {
    audio.sfx('kiran');
    const R = G.renderer, q = bv.cam.project(p, R.cssW, R.cssH);
    if (q[2] > 0) glintAt(q[0], q[1]);
    flash(180);
  };
  buildUI(cfg);
  battleWipe(false);
  if (cfg.trainerName) cutIn(`VS ${cfg.trainerName}`);
  else if (cfg.boss) cutIn('強敵 出現！');
  const seed = cfg.seed ?? Math.floor(Math.random() * 2 ** 31);
  B = new Battle({ sides: cfg.sides, format: cfg.format, seed, kind: cfg.kind, lvOverride: cfg.lvOverride, postGame: G.save?.postGame });
  if (cfg.trainerName) await msg(`${cfg.trainerName} が 勝負を しかけてきた！`);
  await play(B.start());
  // 色違い
  let phase = 0;
  while (!B.over) {
    const needs = B.needs();
    const mine = needs[mySide];
    if (cfg.kind === 'pvp') {
      let choices = null;
      if (mine) choices = await chooseFor(mine, true);
      if (B.over) break;
      await cfg.remote.submit(phase, choices);
      setMsg('相手の 選択を 待っています……');
      const other = needs[1 - mySide] ? await cfg.remote.wait(phase) : null;
      if (other && other.forfeit !== undefined) { B.over = true; B.result = { kind: 'forfeit', by: 1 - mySide }; break; }
      if (choices && choices.forfeit) { B.over = true; B.result = { kind: 'forfeit', by: mySide }; break; }
      if (mine) B.submit(mySide, choices);
      if (needs[1 - mySide]) B.submit(1 - mySide, other);
    } else if (mine) {
      const choices = await chooseFor(mine, false);
      B.submit(0, choices);
    }
    phase++;
    await play(B.resolve());
  }
  const result = B.result?.kind || 'run';
  G.lastBattle = { result: B.result, turn: B.turn, hp: B.sides.map(sd => sd.team.map(b => b.m.hp)) };
  await new Promise(r => setTimeout(r, 400));
  // 後片付け
  const caught = B.caught, pendingMoves = B.pendingMoves.slice(), evos = B.evos.slice();
  teardown();
  G.state = prevState === 'battle' ? 'world' : prevState;
  if (cfg.kind === 'pvp') return B.result;
  return await afterBattle(cfg, result, caught, pendingMoves, evos);
}

function teardown() {
  if (root) root.remove(); root = null;
  $('#screens').style.display = ''; $('#labels').style.display = '';
  G.battleView = null;
  $('#hud').classList.remove('hidden');
  if (Input.touch) $('#touch').classList.remove('hidden');
  hideDialog();
}

async function afterBattle(cfg, result, caught, pendingMoves, evos) {
  const { OW, refreshFollower } = await import('../game/overworld.js');
  const SE = await import('../game/storyEngine.js');
  audio.playBgm(OW.dungeon ? 'dungeon' : (OW.inTown ? 'town' : 'field'));
  if (result === 'lose') {
    if (cfg.allowLose) { healParty(); return 'lose'; }
    await blackout();
    return 'lose';
  }
  // おつかい：野生のアニモンを たおした／つかまえた
  if (cfg.kind === 'wild' && !cfg.boss && (result === 'win' || caught)) {
    try { (await import('../game/errands.js')).onWildBeaten((caught || cfg.sides[1].team[0]).sp); } catch (e) { console.warn(e); }
  }
  if (result === 'win' && cfg.kind === 'trainer') {
    audio.jingle('victory');
    if (cfg.reward) { addMoney(cfg.reward); await say([`|${cfg.trainerName} に 勝った！`, `|${cfg.reward}円 を 手に入れた！`]); }
  }
  if (caught) {
    caught.ot = G.save.name; caught.caughtAt = Date.now();
    caught.metAt = OW.dungeon ? DUNGEONS[OW.dungeon.id].name : (REGIONS[OW.region]?.name || '');
    caught.status = null;
    if (caught.boss) { delete caught.boss; G.save.bossCaught = G.save.bossCaught || {}; if (OW.dungeon) G.save.bossCaught[OW.dungeon.id] = true; }
    const first = !G.save.dex.caught[caught.sp];
    const where = giveMon(caught);
    const money = 50 + caught.lv * 15 + (caught.shiny ? 1000 : 0);
    addMoney(money);
    audio.jingle('victory');
    await say([`|${monName(caught)} が 仲間になった！`, `|${money}円 を 手に入れた！`]);
    if (first) await dexRegister(caught);
    if (await confirmBox(`${monName(caught)} に ニックネームを つけますか？`)) {
      const nm = await inputText('ニックネーム（10文字まで）', SPECIES[caught.sp].name, 10);
      if (nm) caught.nick = nm;
    }
    if (where === 'box') await say([`|${monName(caught)} は ボックスに 送られた。` + (G.save.party.length >= 6 ? '（パーティーがいっぱい）' : '（同じアニモンが パーティーにいる）')]);
    { const left = monCap() - monCount(); if (left <= 0) await say([`|アニモンが いっぱいに なった！（${monCount()}/${monCap()}匹）ボックスで 逃がすと また つかまえられる。`]); else if (left <= 5) toast(`📦 あと ${left}匹で いっぱい（${monCount()}/${monCap()}匹）`, 3000); }
  }
  // 技を覚える
  for (const pm of pendingMoves) { const m = findMon(pm.uid); if (m) await learnMove(m, pm.move); }
  // 進化
  for (const uid of evos) { const m = findMon(uid); if (m && SPECIES[m.sp].evoTo && m.lv >= SPECIES[m.sp].evoLv) await evolveScene(m); }
  refreshFollower();
  save();
  if (caught) await SE.onCatch();
  return result;
}

export async function blackout() {
  const { warpTo } = await import('../game/overworld.js');
  await say(['|手持ちの アニモンが 全員 たおれてしまった……', '|目の前が 真っ暗に なった……']);
  const lost = Math.floor(G.save.money * 0.1);
  addMoney(-lost);
  healParty();
  await warpTo(G.save.lastHospital || 't_start');
  await say([`|${lost}円 を 落としてしまった……`, '|病院で アニモンたちを 回復してもらった。']);
}

// ---------- UI構築 ----------
// ---------- 演出（画面の切りかえ・カットイン） ----------
function battleWipe(cover) {
  return new Promise(res => {
    let w = $('#bwipe');
    if (!w) { w = el('div', ''); w.id = 'bwipe'; for (let i = 0; i < 7; i++) w.appendChild(el('i', '')); $('#ui').appendChild(w); }
    w.className = cover ? 'in' : 'out';
    setTimeout(() => { if (!cover) w.remove(); res(); }, cover ? 620 : 700);
  });
}
function cutIn(text, cls = '') {
  if (!root) return;
  const c = el('div', 'bcut ' + cls, `<span>${esc(text)}</span>`);
  root.appendChild(c);
  setTimeout(() => c.remove(), 1000);
}
function buildUI(cfg) {
  root = el('div', ''); root.id = 'battleUI';
  root.innerHTML = `<div id="bmsg"><div class="msg"></div><div class="cmds"></div></div>`;
  $('#ui').insertBefore(root, $('#screens'));
  root.addEventListener('pointerdown', (e) => { if (!e.target.closest('button')) { if (msgSkip) msgSkip(); } });
}
function panel(vside, slot) {
  const cls = (vside === 0 ? 'me' : 'foe') + slot;
  let p = root.querySelector('.bpanel.' + cls);
  if (!p) { p = el('div', 'bpanel ' + cls); root.appendChild(p); }
  return p;
}
function renderPanel(side, slot) {
  const b = B.active(side, slot);
  const v = vs(side);
  const p = panel(v, slot);
  if (!b) { p.style.opacity = 0; return; }
  p.style.opacity = 1;
  const m = b.m, max = b.maxhp, r = m.hp / max;
  const sp = SPECIES[m.sp];
  p.innerHTML = `<div class="top"><span>${m.shiny ? '<span class="shiny">✨</span>' : ''}${esc(monName(m))}${m.status ? `<span class="st ${m.status}">${STATUS_JA[m.status]}</span>` : ''}</span><span class="lv">Lv${b.lv}</span></div>
  <div style="font-size:.7em">${sp.types.map(typeBadge).join('')}</div>
  <div class="hprow"><b>HP</b><div class="hpbar"><i class="${hpClass(r)}" style="width:${Math.max(0, r * 100)}%"></i></div></div>
  ${v === 0 ? `<div class="hpnum">${Math.max(0, m.hp)} / ${max}</div>` : ''}`;
}
function renderAll() { for (const s of [0, 1]) for (let k = 0; k < B.n; k++) renderPanel(s, k); }

let msgSkip = null;
function setMsg(t) { if (root) root.querySelector('#bmsg .msg').textContent = t; }
function msg(text, wait = true) {
  return new Promise(res => {
    if (!root) { res(); return; }
    const box = root.querySelector('#bmsg .msg');
    box.textContent = '';
    let i = 0;
    const spd = G.settings.textSpeed >= 2 ? 4 : G.settings.textSpeed === 0 ? 35 : 16;
    const iv = setInterval(() => { i += 2; box.textContent = text.slice(0, i); if (i >= text.length) clearInterval(iv); }, spd);
    const hold = (G.settings.textSpeed >= 2 ? 350 : 650) + text.length * (G.settings.textSpeed >= 2 ? 8 : 18);
    const fin = () => { clearInterval(iv); box.textContent = text; msgSkip = null; clearTimeout(tm); res(); };
    const tm = setTimeout(fin, wait ? hold : 10);
    msgSkip = fin;
  });
}

async function play(events) {
  for (const e of events) {
    if (!root) return;
    switch (e.t) {
      case 'msg': await msg(e.s); break;
      case 'send': {
        const b = B.active(e.side, e.slot);
        renderPanel(e.side, e.slot);
        await bv.setMon(vs(e.side), e.slot, b.m);
        if (b.m.shiny) await msg(`✨ キラーン！ ${monName(b.m)} は 色違いだ！ キラキラと 光っている！`);
        break;
      }
      case 'withdraw': await bv.withdraw(vs(e.side), e.slot); break;
      case 'move': audio.sfx(e.status ? 'stat' : 'select'); if (MOVES[e.move]) cutIn(MOVES[e.move].name, 'mv ' + (vs(e.side) === 0 ? 'me' : 'foe')); await bv.playMove(vs(e.side), e.slot, vs(e.tside), e.tslot, e.type, e.status); break;
      case 'dmg': renderPanel(e.side, e.slot); if (!e.chip) { audio.sfx(e.eff > 1 || e.crit ? 'super' : 'hit'); await bv.hit(vs(e.side), e.slot, e.eff, e.crit); } else await bv.wait(250); break;
      case 'heal': renderPanel(e.side, e.slot); audio.sfx('heal'); await bv.healFx(vs(e.side), e.slot); break;
      case 'faint': audio.sfx('faint'); await bv.faint(vs(e.side), e.slot); renderPanel(e.side, e.slot); panel(vs(e.side), e.slot).style.opacity = 0; break;
      case 'status': renderPanel(e.side, e.slot); if (e.status) await bv.statusFx(vs(e.side), e.slot, e.status); break;
      case 'stat': await bv.statFx(vs(e.side), e.slot, e.delta > 0); break;
      case 'protect': await bv.protectFx(vs(e.side), e.slot); break;
      case 'miss': await bv.wait(200); break;
      case 'catch': {
        const col = { food1: [0.95, 0.75, 0.4], food2: [1, 0.5, 0.5], food3: [1, 0.85, 0.3], food4: [0.7, 0.5, 1], food5: [0.5, 1, 0.9] }[e.item] || [1, 1, 1];
        await bv.catchSeq(vs(e.side), e.slot, e.shakes, e.ok, col);
        audio.sfx(e.ok ? 'catch' : 'fail');
        break;
      }
      case 'lvup': audio.sfx('lvup'); if (e.slot >= 0 && e.side !== undefined) renderPanel(e.side, e.slot); break;
      case 'end': break;
    }
  }
  if (root) renderAll();
}

// ---------- 行動の選択 ----------
function cmdBox() { root.querySelector('#bmsg .bback')?.remove(); return root.querySelector('#bmsg .cmds'); }
function clearCmds() { if (root) cmdBox().innerHTML = ''; }
function backBtn(fn) { const b = el('button', 'cmd run bback', '◀ もどる'); b.onclick = () => { b.remove(); fn(); }; root.querySelector('#bmsg').appendChild(b); }
async function chooseFor(need, pvp) {
  const s = B.sides[mySide];
  const out = [];
  let timer = null, timeLeft = 90, autoFire = null;
  if (pvp) {
    const tEl = el('div', 'timer'); root.appendChild(tEl);
    timer = setInterval(() => { timeLeft--; tEl.textContent = `残り ${timeLeft}秒`; if (timeLeft <= 0 && autoFire) autoFire(); }, 1000);
  }
  try {
    for (let k = 0; k < need.slots.length; k++) {
      const slot = need.slots[k];
      if (need.kind === 'switch') {
        const used = out.map(o => o.idx);
        const idx = await pickParty(true, used, (f) => autoFire = f);
        out.push({ type: 'switch', idx });
        continue;
      }
      const b = s.active[slot];
      const c = await chooseCommand(b, slot, pvp, out, (f) => autoFire = f);
      if (c.forfeit) return { forfeit: true };
      out.push(c);
      if (c.type === 'run' || c.type === 'catch') break;
    }
  } finally { if (timer) { clearInterval(timer); root?.querySelector('.timer')?.remove(); } clearCmds(); }
  return out;
}

function chooseCommand(b, slot, pvp, already, setAuto) {
  return new Promise(res => {
    const done = (c) => { clearCmds(); res(c); };
    setAuto(() => done({ type: 'move', move: Math.max(0, b.m.moves.findIndex(x => x.pp > 0)), target: firstFoe(b) }));
    const main = () => {
      setMsg(`${monName(b.m)} は どうする？`);
      const box = cmdBox(); box.innerHTML = '';
      const add = (cls, label, fn, dis = false) => { const bt = el('button', 'cmd ' + cls, label); bt.disabled = dis; bt.onclick = () => { audio.sfx('select'); fn(); }; box.appendChild(bt); };
      add('fight', '<span class="ic">⚔️</span>たたかう', () => moves());
      if (pvp) {
        add('party', '<span class="ic">🐾</span>てもち', () => partyCmd());
        add('run', '<span class="ic">🏳️</span>降参する', async () => { if (await confirmBox('本当に 降参しますか？')) done({ forfeit: true }); else main(); });
      } else {
        add('catch', '<span class="ic">🍖</span>つかまえる', () => catchCmd(), B.kind !== 'wild' || ctx.noCatch || B.n > 1);
        add('party', '<span class="ic">🐾</span>てもち', () => partyCmd());
        add('run', '<span class="ic">💨</span>にげる', () => done({ type: 'run' }), B.kind !== 'wild' || ctx.noRun);
      }
    };
    const moves = () => {
      const box = cmdBox(); box.innerHTML = '';
      const allZero = b.m.moves.every(x => x.pp <= 0);
      if (allZero) { done({ type: 'move', move: 0, target: firstFoe(b) }); return; }
      b.m.moves.forEach((mm, i) => {
        const mv = MOVES[mm.id];
        const locked = b.locked && (b.item === 'h_band' || b.item === 'h_shoes') && mm.id !== b.locked;
        const vest = b.item === 'h_vest' && mv.power === 0;
        const foe = B.foesOf(b)[0];
        let effTxt = '';
        if (mv.power > 0 && foe) { const e = typeEff(mv.type, foe.types); effTxt = e === 0 ? ' 効果なし' : e > 1 ? ' ◎ばつぐん' : e < 1 ? ' △いまひとつ' : ''; }
        const fx = moveEffectText(mv);
        const bt = el('button', 'cmd move', `${esc(mv.name)}<small>${TYPE_JA[mv.type]} ${mv.power ? '威力' + mv.power : '変化'}${mv.acc ? '・命中' + mv.acc : ''}　PP ${mm.pp}/${mv.pp}${effTxt}</small>${fx ? `<small class="fx">${esc(fx)}</small>` : ''}`);
        bt.style.background = `linear-gradient(${TYPE_COLOR[mv.type]}, ${TYPE_COLOR[mv.type]}cc)`;
        bt.disabled = mm.pp <= 0 || locked || vest;
        // 説明：マウスを のせる／長押しで 下の メッセージ欄に 技の くわしい 効果を 出す
        const info = () => setMsg(`【${mv.name}】${mv.desc || ''}${fx && fx !== '追加効果なし' ? `（${fx}）` : ''}`);
        let lp = null, longed = false;
        bt.onpointerenter = (e) => { if (e.pointerType === 'mouse') info(); };
        bt.onpointerleave = (e) => { if (e.pointerType === 'mouse') setMsg('どの 技を つかう？'); clearTimeout(lp); };
        bt.onpointerdown = (e) => { longed = false; if (e.pointerType !== 'mouse') lp = setTimeout(() => { longed = true; info(); }, 450); };
        bt.onpointerup = () => clearTimeout(lp);
        bt.oncontextmenu = (e) => e.preventDefault();
        bt.onclick = async () => {
          if (longed) { longed = false; return; }
          audio.sfx('select');
          let target = null;
          const targetsFoe = mv.power > 0 || mv.e.some(e => e[2] === 'foe' || ['brn', 'psn', 'par', 'slp', 'frz'].includes(e[0]));
          if (B.n === 2 && targetsFoe) {
            const foes = B.foesOf(b);
            if (foes.length > 1) { target = await pickTarget(foes); if (!target) { moves(); return; } }
            else if (foes.length) target = { side: foes[0].side, slot: foes[0].slot };
          } else target = firstFoe(b);
          done({ type: 'move', move: i, target });
        };
        box.appendChild(bt);
      });
      backBtn(() => { audio.sfx('cancel'); main(); });
      setMsg(Input.touch ? 'どの 技を つかう？（長押しで 技の説明）' : 'どの 技を つかう？（マウスを のせると 技の説明）');
    };
    const catchCmd = () => {
      const foods = Object.values(ITEMS).filter(i => i.cat === 'food' && itemCount(i.id) > 0).sort((a, b) => (a.rank || 0) - (b.rank || 0));
      const box = cmdBox(); box.innerHTML = '';
      // 持てる数が いっぱいなら つかまえられない
      if (monFull()) { setMsg(`アニモンが いっぱいで これ以上 なかまに できない！（${monCount()}/${monCap()}匹）\nボックスで 逃がして 空きを つくろう。（紋章を 手に入れると 持てる数が 増える）`); backBtn(() => { audio.sfx('cancel'); main(); }); return; }
      if (!foods.length) { setMsg('エサを 持っていない！ ショップで 買おう。'); }
      const foe = B.foesOf(b)[0];
      for (const f of foods) {
        const p = B.catchChance(f.id, b, foe);
        const hint = p >= 0.6 ? 'なつきそう！' : p >= 0.3 ? 'まあまあ' : p >= 0.08 ? 'むずかしい' : 'ほぼ無理';
        const bt = el('button', 'cmd catch', `${f.icon || ''} ${esc(f.name)} ×${itemCount(f.id)}<small>${'★'.repeat(f.rank || 1)}　${hint}</small>`);
        bt.style.textAlign = 'left';
        bt.onclick = () => { audio.sfx('select'); useItem(f.id); done({ type: 'catch', item: f.id }); };
        box.appendChild(bt);
      }
      backBtn(() => { audio.sfx('cancel'); main(); });
      if (foods.length) setMsg(foe.lv - b.lv > 10 ? 'レベル差が 大きすぎる……。なついてくれないかも。' : 'どの エサを あげる？（HPを減らすと なつきやすい）');
    };
    const partyCmd = async () => {
      const used = already.filter(o => o.type === 'switch').map(o => o.idx);
      const r = await partyMenu(b, pvp, used);
      if (!r) { main(); return; }
      done(r);
    };
    main();
  });
}
function firstFoe(b) { const f = B.foesOf(b)[0]; return f ? { side: f.side, slot: f.slot } : null; }
function pickTarget(foes) {
  return new Promise(res => {
    const box = cmdBox(); box.innerHTML = '';
    setMsg('どの 相手に 使う？');
    for (const f of foes) { const bt = el('button', 'cmd fight', `${esc(monName(f.m))}<small>Lv${f.lv}</small>`); bt.onclick = () => res({ side: f.side, slot: f.slot }); box.appendChild(bt); }
    backBtn(() => res(null));
  });
}
// てもち：交代 or 道具
function partyMenu(b, pvp, used) {
  return new Promise(res => {
    const s = B.sides[mySide];
    const ov = el('div', 'screen'); ov.style.zIndex = 30;
    ov.innerHTML = `<div class="head"><h2>てもち</h2><button class="close">もどる</button></div><div class="body"><div class="mlist"></div></div>`;
    root.appendChild(ov);
    const close = (v) => { ov.remove(); res(v); };
    ov.querySelector('.close').onclick = () => close(null);
    const list = ov.querySelector('.mlist');
    s.team.forEach((tb, i) => {
      const m = tb.m, max = tb.maxhp, r = m.hp / max;
      const c = el('button', 'mcard' + (m.hp <= 0 ? ' fnt' : '') + (tb.slot >= 0 ? ' sel' : ''));
      c.innerHTML = `<img src="${portrait(m.sp, m.shiny)}"><div class="info"><div class="nm">${m.shiny ? '<span class="shiny">✨</span>' : ''}${esc(monName(m))} <span class="lv">Lv${tb.lv}</span>${m.status ? `<span class="st ${m.status}">${STATUS_JA[m.status]}</span>` : ''}${m.hp <= 0 ? '<span class="st fnt">ひんし</span>' : ''}</div><div class="hpbar"><i class="${hpClass(r)}" style="width:${r * 100}%"></i></div><div class="muted">${m.hp}/${max}${tb.slot >= 0 ? '　（戦闘中）' : ''}</div></div>`;
      c.onclick = async () => {
        audio.sfx('select');
        const opts = [];
        const canSwitch = m.hp > 0 && tb.slot < 0 && !used.includes(i);
        if (canSwitch) opts.push('交代する');
        if (!pvp) opts.push('道具を使う');
        opts.push('やめる');
        const k = await ask(`${monName(m)} を どうする？`, opts);
        const pickd = opts[k];
        if (pickd === '交代する') close({ type: 'switch', idx: i });
        else if (pickd === '道具を使う') {
          const it = await pickBattleItem(tb);
          if (it) { useItem(it); close({ type: 'item', item: it, idx: i }); }
        }
      };
      list.appendChild(c);
    });
  });
}
function pickBattleItem(tb) {
  return new Promise(res => {
    const items = Object.values(ITEMS).filter(i => ['heal', 'revive', 'status', 'pp'].includes(i.cat) && itemCount(i.id) > 0);
    const ov = el('div', 'screen'); ov.style.zIndex = 31;
    ov.innerHTML = `<div class="head"><h2>どの道具を使う？</h2><button class="close">もどる</button></div><div class="body"></div>`;
    root.appendChild(ov);
    const close = (v) => { ov.remove(); res(v); };
    ov.querySelector('.close').onclick = () => close(null);
    const body = ov.querySelector('.body');
    if (!items.length) body.innerHTML = '<p class="muted">使える道具を 持っていない。</p>';
    for (const it of items) {
      const ok = (it.cat === 'revive') === (tb.m.hp <= 0) && !(it.cat === 'heal' && tb.m.hp >= tb.maxhp) && !(it.cat === 'status' && !tb.m.status);
      const r = el('div', 'itemrow', `<div class="grow"><div class="nm">${esc(it.name)}</div><div class="ds">${esc(it.desc)}</div></div><div class="cnt">×${itemCount(it.id)}</div>`);
      const b = el('button', 'btn sm pri', '使う'); b.disabled = !ok; b.onclick = () => close(it.id);
      r.appendChild(b); body.appendChild(r);
    }
  });
}
// 強制交代
function pickParty(forced, used, setAuto) {
  return new Promise(res => {
    const s = B.sides[mySide];
    const ov = el('div', 'screen'); ov.style.zIndex = 30;
    ov.innerHTML = `<div class="head"><h2>次に 出す アニモンを 選んでください</h2></div><div class="body"><div class="mlist"></div></div>`;
    root.appendChild(ov);
    const close = (v) => { ov.remove(); res(v); };
    const firstOk = s.team.findIndex((tb, i) => tb.m.hp > 0 && tb.slot < 0 && !used.includes(i));
    setAuto(() => close(firstOk));
    const list = ov.querySelector('.mlist');
    s.team.forEach((tb, i) => {
      const m = tb.m, r = m.hp / tb.maxhp;
      const ok = m.hp > 0 && tb.slot < 0 && !used.includes(i);
      const c = el('button', 'mcard' + (ok ? '' : ' fnt'));
      c.disabled = !ok;
      c.innerHTML = `<img src="${portrait(m.sp, m.shiny)}"><div class="info"><div class="nm">${esc(monName(m))} <span class="lv">Lv${tb.lv}</span></div><div class="hpbar"><i class="${hpClass(r)}" style="width:${r * 100}%"></i></div></div>`;
      c.onclick = () => { audio.sfx('select'); close(i); };
      list.appendChild(c);
    });
  });
}

// ---------- 技を覚える ----------
export async function learnMove(m, moveId) {
  const mv = MOVES[moveId];
  if (m.moves.find(x => x.id === moveId)) return;
  if (m.moves.length < 4) { m.moves.push({ id: moveId, pp: mv.pp }); await say([`|${monName(m)} は ${mv.name} を 覚えた！`]); return; }
  await say([`|${monName(m)} は ${mv.name} を 覚えたい……`, '|しかし 技を 4つ 覚えていて いっぱいだ！']);
  const opts = [...m.moves.map(x => { const o = MOVES[x.id]; return `${o.name}（${o.power ? '威力' + o.power : '変化'}${moveEffects(o).length ? '・' + moveEffects(o)[0] : ''}）を忘れる`; }), `${mv.name} を覚えない`];
  const k = await ask(`${mv.name}（${TYPE_JA[mv.type]}・${mv.power ? '威力' + mv.power : '変化'}${mv.acc ? '・命中' + mv.acc : ''}）\n${mv.desc}${moveEffects(mv).length ? '\n効果：' + moveEffectText(mv) : ''}\n代わりに どの技を 忘れさせる？`, opts);
  if (k < 4) {
    const old = MOVES[m.moves[k].id].name;
    m.moves[k] = { id: moveId, pp: mv.pp };
    await say([`|1、2の…… ポカン！`, `|${monName(m)} は ${old} を きれいに 忘れた！`, `|そして ${mv.name} を 覚えた！`]);
  } else await say([`|${monName(m)} は ${mv.name} を 覚えずに 終わった。`]);
}

// ---------- 進化 ----------
export async function evolveScene(m) {
  const prev = G.state;
  G.state = 'battle';
  $('#hud').classList.add('hidden'); $('#touch').classList.add('hidden'); $('#labels').style.display = 'none';
  $('#screens').style.display = 'none';
  const v = new BattleView(); v.setup('inner', 'evolve');
  v.camBase = [0, 2.4, 8]; v.camLook = [0, 1.2, 0];
  bv = v; G.battleView = v;
  const fromName = monName(m), oldSp = m.sp;
  await v.setMon(0, 0, { sp: oldSp, shiny: m.shiny }, { instant: true });
  audio.playBgm('legend');
  await say([`|おや……？ ${fromName} の ようすが……！`]);
  audio.sfx('evolve');
  const newSp = SPECIES[oldSp].evoTo;
  for (let i = 0; i < 9; i++) {
    const ms = 420 - i * 40;
    await v.setMon(0, 0, { sp: i % 2 ? oldSp : newSp, shiny: m.shiny }, { instant: true });
    const e = v.mons['0,0']; e.M.root.traverse(n => { if (n.geo) { n.emis = [0.9, 0.9, 1]; } });
    await v.wait(ms);
  }
  await flash(500);
  const res = evolveMon(m);
  await v.setMon(0, 0, { sp: m.sp, shiny: m.shiny }, { instant: true });
  v.burst(0, 1, 0, [1, 1, 0.7], 40, 6);
  registerDex(m.sp, true);
  audio.jingle('victory');
  await say([`|おめでとう！ ${fromName} は ${SPECIES[m.sp].name} に 進化した！`]);
  for (const id of res.learned) await say([`|${monName(m)} は ${MOVES[id].name} を 覚えた！`]);
  for (const id of res.pending) await learnMove(m, id);
  G.battleView = null; bv = null;
  G.state = prev === 'battle' ? 'world' : prev;
  $('#screens').style.display = ''; $('#labels').style.display = '';
  $('#hud').classList.remove('hidden'); if (Input.touch) $('#touch').classList.remove('hidden');
}

// ---------- 図鑑登録 ----------
export function dexRegister(m) {
  return new Promise(res => {
    const sp = SPECIES[m.sp];
    audio.sfx('catch');
    const d = el('div', 'dexreg', `<div class="rays"></div><div class="in"><div class="pic"><img src="${portrait(m.sp, m.shiny)}"></div><div class="txt"><div class="ribbon">図鑑に 登録しました！</div><div class="no">No.${String(sp.id).padStart(3, '0')}</div><h3>${m.shiny ? '<span class="shiny">✨</span>' : ''}${esc(sp.name)}</h3><div>${sp.types.map(typeBadge).join('')}</div><p>${esc(sp.desc)}</p><button class="btn pri ok">完了</button><span class="hint">画面のどこをタップしても閉じます</span></div></div>`);
    // 図鑑登録はバトル後に出るので、画面レイヤーが隠れていても必ず見えるように #ui 直下に置く
    $('#ui').appendChild(d);
    let fin = false;
    const close = () => { if (fin) return; fin = true; window.removeEventListener('keydown', key, true); audio.sfx('select'); d.remove(); res(); };
    d.querySelector('.ok').onclick = (e) => { e.stopPropagation(); close(); };
    // 画面のどこをタップしても閉じる（スクロールしたときは閉じない）。
    // スマホでは click が届かないことがあるので pointerup で判定する
    let sx = 0, sy = 0, down = false;
    const t0 = performance.now();
    d.addEventListener('pointerdown', (e) => { sx = e.clientX; sy = e.clientY; down = true; });
    d.addEventListener('pointerup', (e) => {
      if (!down) return; down = false;
      if (performance.now() - t0 < 500) return;
      if (Math.hypot(e.clientX - sx, e.clientY - sy) < 10) close();
    });
    d.addEventListener('pointercancel', () => { down = false; });
    // キーボードでも閉じられる
    function key(e) { if (['Space', 'Enter', 'KeyZ', 'Escape', 'KeyX'].includes(e.code)) { e.preventDefault(); e.stopPropagation(); close(); } }
    setTimeout(() => { if (!fin) window.addEventListener('keydown', key, true); }, 400);
  });
}
