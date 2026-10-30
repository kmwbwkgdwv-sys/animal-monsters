// =============================================================
//  フレンドと 同じワールドで あそぶ
//   ・ほかの プレイヤーの すがた（＋先頭のアニモン・ライド中のアニモン）を 表示
//   ・自分の 位置を 1秒に 4回まで 送る
//   ・近づいて A で「あいさつ」「対戦」「トレード」
//   ・ゲーム中 いつでも 招待（対戦・トレード・ワールド）を 受け取れる
// =============================================================
import { G } from './state.js';
import { OW, runFlow } from './overworld.js';
import { buildHuman, animateHuman, buildAnimon, animateAnimon } from '../render/models.js';
import { Node, PRIM } from '../engine/gl3d.js';
import { SPECIES } from '../data/species.js';
import { $, el, esc, toast, ask } from '../ui/ui.js';
import { audio } from '../audio.js';

let ON = null;
const R = new Map();           // pid → 表示中の プレイヤー
let pubT = 0, beatT = 0, lastPub = '', chip = null, bar = null;
const dismissed = new Set();
const lerp = (a, b, t) => a + (b - a) * t;

export function coopActive() { return !!(ON && ON.World.host); }
export function remotesNear() { return [...R.values()].filter(r => r.shown); }

export async function initCoop() {
  ON = await import('../online.js');
  ON.World.onChange = () => sync();
  ON.World.onClosed = (nm) => { toast(`${nm || 'ホスト'} の ワールドが 閉じられた`, 3000); clearAll(); updChip(); };
  window.addEventListener('pagehide', () => { if (ON.World.host) ON.leaveWorld(); });
}
// 招待の受け取り（オンラインの準備ができてから）
export function startInviteWatch() {
  if (!ON || !ON.Online.pid) return;
  ON.watchInvitesAlways((list) => {
    const inv = list.filter(i => !dismissed.has(i.id)).sort((a, b) => (b.at || 0) - (a.at || 0))[0];
    showInvite(inv || null);
  });
}
function showInvite(inv) {
  if (!bar) { bar = el('div', ''); bar.id = 'invbar'; document.body.appendChild(bar); }
  if (!inv) { bar.classList.remove('on'); return; }
  const what = inv.type === 'world' ? 'ワールドへの 招待' : inv.type === 'battle' ? '対戦の 招待' : 'トレードの 招待';
  const ic = inv.type === 'world' ? '🌏' : inv.type === 'battle' ? '⚔️' : '🔄';
  bar.innerHTML = `<span class="ic">${ic}</span><span class="tx"><b>${esc(inv.fromName || 'フレンド')}</b> から ${what}</span><button class="btn sm pri ok">参加する</button><button class="btn sm ng">あとで</button>`;
  bar.classList.add('on');
  audio.sfx('select');
  bar.querySelector('.ng').onclick = () => { dismissed.add(inv.id); bar.classList.remove('on'); };
  bar.querySelector('.ok').onclick = () => {
    if (G.state !== 'world' || G.busy) { toast('いまは 参加できない（バトルや 会話が 終わってから）'); return; }
    dismissed.add(inv.id); bar.classList.remove('on');
    runFlow(async () => {
      if (inv.type === 'world') {
        try { await ON.joinWorld(inv.world); toast(`🌏 ${inv.fromName} の ワールドに 参加した！`, 3000); audio.sfx('warp'); }
        catch (e) { toast(e.message || '参加できませんでした'); }
      } else (await import('../ui/onlineUI.js')).acceptInvite(inv);
    });
  };
}

// ---- メンバーの 変化を 反映 ----
function sync() {
  const W = ON.World, me = ON.Online.pid;
  const mem = W.members || {};
  for (const [pid, m] of Object.entries(mem)) {
    if (pid === me || !m) continue;
    let r = R.get(pid);
    if (!r) {
      const lk = m.look && typeof m.look === 'object' && Object.keys(m.look).length ? m.look : G.save.look;
      const H = buildHuman(lk, { lazy: false });
      OW.scene.add(H.root);
      const sh = new Node(PRIM.disc, { color: [0, 0, 0], alpha: 0.25, unlit: true }); sh.noDepthWrite = true; sh.setScale(0.75); OW.scene.add(sh);
      r = { pid, H, sh, x: m.x || 0, z: m.z || 0, y: 0, ry: m.ry || 0, seen: performance.now(), M: null, lead: null, rideM: null, ride: null, emoAt: 0 };
      R.set(pid, r);
      if (W.members && Object.keys(W.members).length > 1) toast(`🌏 ${m.name} が ワールドに いる`, 2400);
    }
    if (r.tx !== m.x || r.tz !== m.z || r.t !== m.t) r.seen = performance.now();
    Object.assign(r, { name: m.name, tx: m.x || 0, tz: m.z || 0, try: m.ry || 0, st: m.st || 'idle', mode: m.mode || 'walk', dg: !!m.dg, t: m.t });
    if (m.emo && m.emoAt !== r.emoKey) { r.emoKey = m.emoAt; r.emo = m.emo; r.emoAt = performance.now(); }
    // 先頭の アニモン
    const lead = m.lead ? `${m.lead}:${m.shiny ? 1 : 0}` : null;
    if (lead !== r.lead) {
      if (r.M) { r.M.root.parent?.remove(r.M.root); r.M = null; }
      r.lead = lead;
      if (m.lead && SPECIES[m.lead]) { r.M = buildAnimon(m.lead, !!m.shiny, { lod: 'mid' }); r.M.root.setScale(Math.min(1, 2.3 / Math.max(0.6, r.M.height))); OW.scene.add(r.M.root); r.fx = r.x; r.fz = r.z + 2; }
    }
    // ライド中の アニモン
    const ride = m.mode !== 'walk' && m.ride ? m.ride : null;
    if (ride !== r.ride) {
      if (r.rideM) { r.rideM.root.parent?.remove(r.rideM.root); r.rideM = null; }
      r.ride = ride;
      if (ride && SPECIES[ride]) { r.rideM = buildAnimon(ride, false, { lod: 'mid' }); const sc = Math.max(1, 1.9 / Math.max(0.5, r.rideM.height)); r.rideM.root.setScale(sc); r.rideSc = sc; r.rideH = r.rideM.height * sc; OW.scene.add(r.rideM.root); }
    }
  }
  for (const [pid, r] of [...R]) if (!mem[pid]) { removeRemote(r); R.delete(pid); }
  updChip();
}
function removeRemote(r) {
  for (const n of [r.H?.root, r.sh, r.M?.root, r.rideM?.root]) if (n && n.parent) n.parent.remove(n);
}
function clearAll() { for (const r of R.values()) removeRemote(r); R.clear(); }

// ---- 毎フレーム ----
export function updateCoop(dt) {
  if (!ON) return;
  if (!ON.World.host) { if (R.size) clearAll(); if (chip) chip.style.display = 'none'; return; }
  const P = OW.player; if (!P || !G.world) return;
  const W = G.world, now = performance.now();
  for (const r of R.values()) {
    const stale = now - r.seen > 25000;
    r.shown = !OW.dungeon && !r.dg && !stale && G.state !== 'battle';
    for (const n of [r.H.root, r.sh, r.M?.root, r.rideM?.root]) if (n) n.visible = r.shown;
    if (!r.shown) continue;
    const d = Math.hypot(r.tx - r.x, r.tz - r.z);
    if (d > 40) { r.x = r.tx; r.z = r.tz; } else { r.x = lerp(r.x, r.tx, Math.min(1, dt * 7)); r.z = lerp(r.z, r.tz, Math.min(1, dt * 7)); }
    r.ry += (((r.try - r.ry + Math.PI * 3) % (Math.PI * 2)) - Math.PI) * Math.min(1, dt * 10);
    const h = W.heightAt(r.x, r.z);
    const gy = r.mode === 'fly' ? Math.max(h, 0) + 12 : h < -0.3 ? -0.45 : h;
    r.y = Math.abs(r.y - gy) > 4 ? gy : lerp(r.y, gy, Math.min(1, dt * 10));
    const moving = d > 0.08;
    if (r.rideM) {
      r.rideM.root.setPos(r.x, r.y, r.z); r.rideM.root.rot[1] = r.ry;
      animateAnimon(r.rideM, dt, r.mode === 'fly' ? 'fly' : moving ? 'run' : 'idle');
      r.H.root.setPos(r.x, r.y + r.rideH * 0.7 - 0.55 + (r.mode === 'fly' ? r.rideM.pivot.pos[1] * r.rideSc : 0), r.z);
      animateHuman(r.H, dt, 'ride');
    } else {
      r.H.root.setPos(r.x, r.y, r.z);
      animateHuman(r.H, dt, moving ? (r.st === 'run' ? 'run' : 'walk') : 'idle');
    }
    r.H.root.rot[1] = r.ry;
    r.sh.setPos(r.x, W.groundAt(r.x, r.z) + 0.05, r.z);
    // 先頭の アニモンが うしろを ついてくる
    if (r.M) {
      r.M.root.visible = r.shown && !r.rideM;
      const bx = r.x - Math.sin(r.ry) * 2, bz = r.z - Math.cos(r.ry) * 2;
      const fd = Math.hypot(bx - r.fx, bz - r.fz);
      if (fd > 30) { r.fx = bx; r.fz = bz; } else { r.fx = lerp(r.fx, bx, Math.min(1, dt * 3)); r.fz = lerp(r.fz, bz, Math.min(1, dt * 3)); }
      r.M.root.setPos(r.fx, Math.max(W.heightAt(r.fx, r.fz), -0.45), r.fz); r.M.root.rot[1] = Math.atan2(r.x - r.fx, r.z - r.fz);
      animateAnimon(r.M, dt, fd > 0.15 ? 'walk' : 'idle');
    }
  }
  // 表示の位置（ミニマップの すぐ下）
  if (chip && chip.style.display !== 'none') {
    const mm = $('#minimap'), hud = $('#hud');
    if (mm && hud && mm.offsetParent) { const a = mm.getBoundingClientRect(), b = hud.getBoundingClientRect(); const top = Math.round(a.bottom - b.top + 6); if (chip._top !== top) { chip._top = top; chip.style.top = top + 'px'; } }
  }
  // 自分の 位置を 送る
  pubT -= dt; beatT -= dt;
  if (pubT <= 0) {
    pubT = 0.25;
    const lead = G.save.party.find(m => m.hp > 0) || G.save.party[0];
    const data = { x: Math.round(P.x * 10) / 10, z: Math.round(P.z * 10) / 10, ry: Math.round(P.ry * 100) / 100, st: P.state || 'idle', mode: OW.mode || 'walk', ride: P.rideSp || 0, lead: lead ? lead.sp : 0, shiny: !!(lead && lead.shiny), dg: !!OW.dungeon };
    const key = JSON.stringify(data);
    if (key !== lastPub || beatT <= 0) { lastPub = key; beatT = 4; ON.publishWorld(data); }
  }
}
// 名前・あいさつの ふきだし（overworld の ラベル処理から 呼ぶ）
export function coopLabels(show, P) {
  const now = performance.now();
  for (const r of R.values()) {
    if (!r.shown) continue;
    const d = Math.hypot(r.x - P.x, r.z - P.z); if (d > 60) continue;
    const top = r.H.root.pos[1] + 2.6;
    if (r.emo && now - r.emoAt < 4000) show(r.x, top + 0.6, r.z, r.emo, 'emo');
    show(r.x, top, r.z, '🌏 ' + (r.name || ''), 'friend');
  }
}
export function nearestRemote(P, maxD = 3.6) {
  let best = null, bd = maxD;
  for (const r of R.values()) { if (!r.shown) continue; const d = Math.hypot(r.x - P.x, r.z - P.z); if (d < bd) { bd = d; best = r; } }
  return best;
}
// 近くの フレンドに 話しかける
export async function talkRemote(r) {
  const k = await ask(`${r.name} と 何をする？`, ['👋 あいさつ', '⚔️ 対戦を もうしこむ', '🔄 トレードを もうしこむ', 'やめる'], r.name);
  if (k === 0) return emote('👋');
  const OU = await import('../ui/onlineUI.js');
  if (k === 1) return OU.startBattleWith(r.pid, r.name);
  if (k === 2) return OU.startTradeWith(r.pid, r.name);
}
export function emote(e) {
  if (!coopActive()) return;
  ON.publishWorld({ emo: e, emoAt: Date.now() });
  toast(`${e} を 送った！`);
}

// ---- 画面右上の 小さな表示（ワールドの名前・人数・あいさつ・退出） ----
function updChip() {
  if (!chip) {
    chip = el('div', ''); chip.id = 'coopChip';
    const hud = $('#hud'); (hud || document.body).appendChild(chip);
  }
  if (!ON || !ON.World.host) { chip.style.display = 'none'; return; }
  const n = Object.keys(ON.World.members || {}).length;
  const mine = ON.World.host === ON.Online.pid;
  chip.style.display = '';
  chip.innerHTML = `<span class="w">🌏 ${mine ? 'あなた' : esc(ON.World.hostName || '')}の ワールド</span><span class="n">${n}人</span><button class="hi" title="あいさつ">👋</button><button class="out">退出</button>`;
  chip.querySelector('.hi').onclick = (e) => { e.stopPropagation(); emote('👋'); };
  chip.querySelector('.out').onclick = async (e) => {
    e.stopPropagation();
    if (G.busy) return;
    runFlow(async () => {
      const k = await ask(mine ? 'ワールドを 閉じますか？（参加している フレンドも 退出します）' : 'このワールドから 退出しますか？', ['退出する', 'やめる']);
      if (k === 0) { await ON.leaveWorld(); clearAll(); updChip(); toast('ワールドから 退出した'); }
    });
  };
}
