// =============================================================
//  フィールド（大陸・ダンジョン）の進行
// =============================================================
import { Scene, Camera, Node, GeoBuilder, PRIM, initPrims, M4, mixRgb } from '../engine/gl3d.js';
import { clamp, lerp, mulberry32, angleDiff, hashStr } from '../engine/util.js';
import { World, buildBuilding, SKY, REGION_INDEX } from '../render/world.js';
import { Dungeon } from '../render/dungeon.js';
import { buildHuman, animateHuman, buildAnimon, animateAnimon, randomLook } from '../render/models.js';
import { TOWNS, STONES, DUNGEONS, ITEM_BALLS, REGIONS, RING, TRAINERS, routeTrainers, encounterTable, regionLevel, ringAt, polar, BUILD_JA, SANCT_R, INNER_R, START_POS, COAST_R, ALTAR } from '../data/world.js';
import { SPECIES, BY_NAME } from '../data/species.js';
import { NPCS, LOOKS, QUESTS, STEPS } from '../data/story.js';
import { ITEMS } from '../data/items.js';
import { createMon } from './mon.js';
import { G, isUnlocked, addItem, save, itemName } from './state.js';
import { Input, readMove } from '../input.js';
import { audio } from '../audio.js';
import { $, el, esc, toast, say, confirmBox, fade, UI } from '../ui/ui.js';
import * as SE from './storyEngine.js';
import { startWildBattle, startTrainerBattle } from '../ui/battleUI.js';
import * as MENU from '../ui/menus.js';

export const OW = {
  scene: null, cam: new Camera(42), player: null, npcs: [], wilds: [], trig: [], labels: [], spawned: {},
  region: null, inTown: null, mode: 'walk', dungeon: null, encCool: 0, zoom: 1.12, lastToast: 0, follower: null, trail: [],
  skyCur: null, t: 0, camOverride: null,
};
const SPEED = { walk: 7, run: 11.5, land: 17, swim: 13, fly: 24 };

// ---------- 構築 ----------
export async function buildOverworld(progress) {
  initPrims();
  if (!G.world) {
    progress && progress(0.3, '大陸を生成中…');
    await new Promise(r => setTimeout(r, 30));
    const clear = [...NPCS.map(n => n.pos), ...QUESTS.flatMap(q => [q.giver.pos, ...q.steps.filter(st => st.trig.pos).map(st => st.trig.pos)]), ...routeTrainers().map(t => t.pos), [0, 30], ALTAR, [ALTAR[0], ALTAR[1] - 12], [ALTAR[0] - 16, ALTAR[1] - 32], [ALTAR[0] + 16, ALTAR[1] - 32], ...ITEM_BALLS.map(b => b[2])];
    G.world = new World({ light: G.settings.light, clear });
  }
  const W = G.world;
  W.boxes.length = 0;
  OW.trig = []; OW.npcs = []; OW.wilds = []; OW.spawned = {}; OW.labels = [];
  const S = new Scene();
  S.add(W.node);
  OW.scene = S;
  // 水面
  const wb = new GeoBuilder(); const WN = G.settings.light ? 40 : 64, WS = 4;
  for (let j = 0; j <= WN; j++) for (let i = 0; i <= WN; i++) wb._push((i - WN / 2) * WS, 0, (j - WN / 2) * WS, 0, 1, 0, [1, 1, 1]);
  for (let j = 0; j < WN; j++) for (let i = 0; i < WN; i++) { const a = j * (WN + 1) + i; wb.tri(a, a + WN + 1, a + 1); wb.tri(a + 1, a + WN + 1, a + WN + 2); }
  OW.water = new Node(wb.build(), { color: [0.3, 0.6, 0.95], alpha: 0.72, wave: 1 }); OW.water.cull = false; OW.water.noDepthWrite = true;
  S.add(OW.water);
  progress && progress(0.6, '町を建設中…');
  // 町と建物
  TOWNS.forEach((t, ti) => {
    const h = W.townH[ti];
    t.b.forEach(([type, dx, dz], bi) => {
      const rc = { forest: '#3c9a4a', lake: '#2a78d0', desert: '#d0a040', canyon: '#b0603a', snow: '#6ab0e0', swamp: '#6a5a9a', highland: '#e080c0', volcano: '#d04020', start: '#d0503c', sanctuary: '#c0a050' }[t.region] || '#c8643c';
      const B = buildBuilding(type, ti * 31 + bi, rc);
      const x = t.pos[0] + dx, z = t.pos[1] + dz;
      const n = new Node(B.geo); n.setPos(x, h, z); S.add(n);
      W.boxes.push({ x0: x - B.w / 2, x1: x + B.w / 2, z0: z - B.d / 2, z1: z + B.d / 2 });
      OW.trig.push({ kind: 'door', type, town: t.id, x: x + B.door[0], z: z + B.door[1], r: 2.8, label: type === 'house' ? '' : (type === 'hall' ? t.name.replace(/町|村|里|集落|タウン|まち/, '') + 'の守護者の館' : BUILD_JA[type]), ly: B.h + 3, lx: x, lz: z, bi });
    });
    // 町の広場の飾り（噴水）
    const f = new GeoBuilder(); f.cylinder(3, 3.4, 0.8, [0.75, 0.75, 0.78], 0, 0, 0, 12); f.cylinder(2.6, 2.6, 0.82, [0.45, 0.7, 0.95], 0, 0.01, 0, 12); f.cylinder(0.4, 0.5, 2.2, [0.8, 0.8, 0.85], 0, 0, 0, 8);
    const fn = new Node(f.build()); fn.setPos(t.pos[0], h, t.pos[1] - 2); S.add(fn); W.boxes.push({ x0: t.pos[0] - 3, x1: t.pos[0] + 3, z0: t.pos[1] - 5, z1: t.pos[1] + 1 });
  });
  // ファストトラベルの岩
  for (const s of STONES) {
    const x = s.pos[0], z = s.pos[1], h = W.heightAt(x, z);
    const root = new Node(); root.setPos(x, h, z);
    const rock = new Node(PRIM.sphere, { color: [0.55, 0.55, 0.6] }); rock.setScale(1.3, 0.8, 1.3); root.add(rock);
    const gem = new Node(PRIM.gem, { color: [0.4, 0.9, 1], emis: [0.2, 0.6, 0.8] }); gem.setScale(0.5, 0.9, 0.5); gem.setPos(0, 1.8, 0); root.add(gem);
    S.add(root);
    W.boxes.push({ x0: x - 1, x1: x + 1, z0: z - 1, z1: z + 1 });
    OW.trig.push({ kind: 'stone', id: s.id, name: s.name, x, z, r: 2.8, gem, label: s.name, ly: 3.2 });
  }
  // アイテム
  for (const [id, item, pos] of ITEM_BALLS) {
    if (G.save.items[id]) continue;
    const x = pos[0], z = pos[1];
    const n = new Node(PRIM.sphere, { color: [1, 0.8, 0.3], emis: [0.4, 0.3, 0.05] }); n.setScale(0.45);
    OW.trig.push({ kind: 'item', id, item, x, z, r: 2.2, node: n });
    S.add(n);
  }
  // ダンジョン入口
  for (const [id, d] of Object.entries(DUNGEONS)) {
    const x = d.pos[0], z = d.pos[1], h = W.heightAt(x, z);
    const g = new GeoBuilder();
    const col = { ruins: [0.6, 0.62, 0.52], pyramid: [0.85, 0.72, 0.45], ice: [0.7, 0.85, 0.95], sky: [0.92, 0.92, 1], lava: [0.3, 0.25, 0.25], abyss: [0.35, 0.28, 0.5] }[d.theme];
    if (d.theme === 'pyramid') { g.cone(9, 9, col, 0, 0, -4, 4); }
    else if (d.theme === 'sky') { for (let i = 0; i < 6; i++) g.cylinder(3.2 - i * 0.3, 3.4 - i * 0.3, 5, i % 2 ? [0.95, 0.9, 0.7] : col, 0, i * 5, -4, 10); }
    else { g.sphere(6, col, 0, 0, -4, 8, 5, 0.9); }
    g.box(1.4, 5, 1.4, mixRgb(col, [0, 0, 0], 0.2), -2.6, 2.5, 1.6); g.box(1.4, 5, 1.4, mixRgb(col, [0, 0, 0], 0.2), 2.6, 2.5, 1.6); g.box(7, 1.2, 1.6, mixRgb(col, [0, 0, 0], 0.2), 0, 5.4, 1.6);
    g.box(3.8, 4.6, 0.3, [0.03, 0.03, 0.05], 0, 2.3, 1.8);
    const n = new Node(g.build()); n.setPos(x, h, z); S.add(n);
    W.boxes.push({ x0: x - 6, x1: x + 6, z0: z - 10, z1: z + 1 });
    OW.trig.push({ kind: 'dungeon', id, x, z: z + 3.5, r: 3, label: d.name + `（推奨Lv${d.rec}）`, ly: 8 });
  }
  // いにしえの祭壇（聖域の中央）と星の祭壇（奥地）
  for (const [ax, az, big] of [[ALTAR[0], ALTAR[1], 1], [0, 30, 0]]) {
    const h = W.heightAt(ax, az);
    const g = new GeoBuilder();
    g.cylinder(7, 7.6, 0.6, [0.88, 0.86, 0.8], 0, 0, 0, 16); g.cylinder(4.5, 4.8, 0.5, [0.95, 0.93, 0.88], 0, 0.6, 0, 16);
    for (let k = 0; k < 6; k++) { const a = k / 6 * Math.PI * 2; g.cylinder(0.45, 0.55, big ? 5 : 3.5, [0.9, 0.88, 0.82], Math.cos(a) * 6.4, 0.3, Math.sin(a) * 6.4, 8); g.box(1.4, 0.4, 1.4, [0.95, 0.85, 0.5], Math.cos(a) * 6.4, (big ? 5 : 3.5) + 0.4, Math.sin(a) * 6.4); }
    const n = new Node(g.build()); n.setPos(ax, h - 0.2, az); S.add(n);
    const gem = new Node(PRIM.gem, { color: big ? [1, 0.75, 0.4] : [0.8, 0.7, 1], emis: big ? [0.5, 0.3, 0.1] : [0.4, 0.3, 0.7] }); gem.setScale(0.8, 1.6, 0.8); gem.setPos(ax, h + 3, az); S.add(gem);
    OW.trig.push({ kind: 'altar', x: ax, z: az, r: 0.1, label: big ? 'いにしえの祭壇' : '星の祭壇', ly: 6, gem });
  }
  progress && progress(0.75, '人々を配置中…');
  // 道ばたのトレーナー
  OW.routeTr = routeTrainers();
  buildBarriers();
  // 主人公
  const P = OW.player = { x: G.save.pos[0], z: G.save.pos[1], y: 0, ry: G.save.ry || 0, H: buildHuman(G.save.look), state: 'idle', rideM: null, rideSp: null };
  S.add(P.H.root);
  OW.mode = 'walk';
  // シャドウ
  P.shadow = new Node(PRIM.disc, { color: [0, 0, 0], alpha: 0.28, unlit: true }); P.shadow.noDepthWrite = true; P.shadow.setScale(0.75); S.add(P.shadow);
  refreshActors();
  refreshFollower();
  W.buildAll(P.x, P.z, 140);
  OW.region = null; OW.dungeon = null;
  progress && progress(0.95, 'もうすぐ…');
}

// 結界（まだ行けない地域との境目）
export function buildBarriers() {
  if (OW.barrier) OW.scene.root.remove(OW.barrier);
  const g = new GeoBuilder();
  const wall = (pts, y0 = -6, y1 = 40) => {
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
      g.quad([ax, y0, az], [bx, y0, bz], [bx, y1, bz], [ax, y1, az], [0.7, 0.4, 1]);
      g.quad([bx, y0, bz], [ax, y0, az], [ax, y1, az], [bx, y1, bz], [0.7, 0.4, 1]);
    }
  };
  // リング地域の境界
  for (let i = 0; i < RING.length; i++) {
    const a = RING[i], b = RING[(i + 1) % RING.length];
    if (isUnlocked(a) === isUnlocked(b)) continue;
    let ang = (REGIONS[a].ang + REGIONS[b].ang) / 2; if (Math.abs(REGIONS[a].ang - REGIONS[b].ang) > 180) ang += 180;
    const pts = []; for (let r = SANCT_R + 30; r <= COAST_R + 60; r += 20) pts.push(polar(ang, r));
    wall(pts);
  }
  // はじまりの町
  if (!isUnlocked('plains')) { const pts = []; for (let k = 0; k <= 36; k++) { const a = k / 36 * Math.PI * 2; pts.push([START_POS[0] + Math.cos(a) * 120, START_POS[1] + Math.sin(a) * 120]); } wall(pts); }
  if (!isUnlocked('sanctuary')) { const pts = []; for (let k = 0; k <= 48; k++) { const a = k / 48 * Math.PI * 2; pts.push([Math.cos(a) * SANCT_R, Math.sin(a) * SANCT_R]); } wall(pts, -6, 60); }
  if (!isUnlocked('inner')) { const pts = []; for (let k = 0; k <= 32; k++) { const a = k / 32 * Math.PI * 2; pts.push([Math.cos(a) * INNER_R, Math.sin(a) * INNER_R]); } wall(pts, 0, 40); }
  if (!g.vcount) { OW.barrier = null; return; }
  OW.barrier = new Node(g.build(), { color: [0.75, 0.5, 1], alpha: 0.28, unlit: true });
  OW.barrier.noDepthWrite = true; OW.barrier.cull = false;
  OW.scene.add(OW.barrier);
}

// ---------- NPC・トレーナー ----------
function makeNpc(def, look) {
  const lk = typeof look === 'string' ? (LOOKS[look] || randomLook(mulberry32(hashStr(look)))) : look;
  const H = buildHuman(lk);
  const W = G.world;
  const x = def.pos[0], z = def.pos[1];
  H.root.setPos(x, W.groundAt(x, z), z); H.root.rot[1] = def.ry ?? 0;
  OW.scene.add(H.root);
  const sh = new Node(PRIM.disc, { color: [0, 0, 0], alpha: 0.25, unlit: true }); sh.noDepthWrite = true; sh.setScale(0.7); sh.setPos(x, W.groundAt(x, z) + 0.05, z); OW.scene.add(sh);
  return { ...def, H, x, z, shadow: sh };
}
export function refreshActors() {
  if (OW.dungeon) return;
  for (const n of OW.npcs) { OW.scene.root.remove(n.H ? n.H.root : n.M.root); if (n.shadow) OW.scene.root.remove(n.shadow); if (n.marker) OW.scene.root.remove(n.marker); }
  OW.npcs = [];
  const si = G.save.story.step;
  const idx = (id) => id === null || id === undefined ? null : STEPS.findIndex(s => s.id === id);
  for (const d of NPCS) {
    if (d.show) { const a = idx(d.show[0]), b = idx(d.show[1]); if (a !== null && si < a) continue; if (b !== null && si >= b) continue; }
    OW.npcs.push(makeNpc({ ...d, kind: 'npc' }, d.look));
  }
  // 道ばたのトレーナー
  for (const t of OW.routeTr) {
    if (!isUnlocked(t.region)) continue;
    const look = randomLook(mulberry32(t.seed * 13));
    OW.npcs.push(makeNpc({ id: t.id, name: t.name, pos: t.pos, ry: (t.seed % 4) * Math.PI / 2, kind: 'trainer', tr: t }, look));
  }
  // サイドストーリー
  for (const q of QUESTS) {
    const st = G.save.quests[q.id];
    const reqI = idx(q.req);
    if (!st && si < reqI) continue;
    OW.npcs.push(makeNpc({ id: 'giver_' + q.id, name: q.giver.name, pos: q.giver.pos, ry: 0, kind: 'giver', quest: q }, q.giver.look));
    if (st && !st.done) {
      const step = q.steps[st.stage];
      if (step && step.trig.t === 'spot') {
        const p = step.trig.pos;
        if (step.trig.npc) OW.npcs.push(makeNpc({ id: 'spot_' + q.id, name: step.trig.npc.name, pos: p, ry: 0, kind: 'spot', quest: q }, step.trig.npc.look));
        else if (step.trig.sp) {
          const M = buildAnimon(BY_NAME[step.trig.sp].id, false); const h = G.world.groundAt(p[0], p[1]);
          M.root.setPos(p[0], h, p[1]); OW.scene.add(M.root);
          OW.npcs.push({ id: 'spot_' + q.id, kind: 'spot', quest: q, M, x: p[0], z: p[1], name: step.trig.sp });
        } else {
          const n = new Node(PRIM.star, { color: [1, 0.9, 0.4], unlit: true, emis: [0.5, 0.4, 0.1] }); n.doubleSide = true; const h = G.world.groundAt(p[0], p[1]); n.setPos(p[0], h + 1.4, p[1]); n.setScale(0.6); OW.scene.add(n);
          OW.npcs.push({ id: 'spot_' + q.id, kind: 'spot', quest: q, marker: n, x: p[0], z: p[1], name: 'あやしい光' });
        }
      }
      if (step && step.trig.t === 'battle') {
        const pos = [[-14, 30], [-2, 36], [10, 40]];
        step.trig.trainers.forEach((tid, k) => {
          if (G.save.defeated[tid]) return;
          const tp = TOWNS.find(t => t.id === 'lake').pos;
          OW.npcs.push(makeNpc({ id: tid, name: TRAINERS[tid].name, pos: [tp[0] + pos[k][0], tp[1] + pos[k][1]], ry: Math.PI, kind: 'questTrainer', quest: q, tr: { id: tid } }, TRAINERS[tid].look));
        });
      }
    }
  }
  // シーンで出したもの
  for (const k in OW.spawned) { const sp = OW.spawned[k]; if (!sp.root.parent) OW.scene.add(sp.root); }
}

// ---------- 連れ歩き ----------
export function refreshFollower() {
  if (OW.follower) { OW.follower.root.parent?.remove(OW.follower.root); OW.follower = null; }
  const lead = G.save.party.find(m => m.hp > 0) || G.save.party[0];
  if (!lead || !OW.scene) return;
  const M = buildAnimon(lead.sp, lead.shiny);
  const s = Math.min(1, 1.3 / Math.max(0.6, M.height));
  M.root.setScale(s);
  OW.follower = { M, uid: lead.uid, root: M.root, x: OW.player.x, z: OW.player.z + 2, ry: 0 };
  M.root.setPos(OW.follower.x, 0, OW.follower.z);
  (OW.dungeon ? OW.dscene : OW.scene).add(M.root);
}

// ---------- ライド ----------
export function startRide(mon) {
  const P = OW.player;
  const sp = SPECIES[mon.sp];
  stopRide(true);
  const M = buildAnimon(mon.sp, mon.shiny);
  const sc = clamp(2.5 / M.height, 1.0, 2.6) * (sp.legend ? 0.75 : 1);
  M.root.setScale(sc);
  P.rideM = M; P.rideSp = mon.sp; P.rideScale = sc; P.rideH = M.height * sc;
  OW.mode = sp.ride;
  curScene().add(M.root);
  if (OW.follower) OW.follower.root.visible = false;
  audio.sfx('warp');
  toast(`${mon.nick || sp.name} に 乗った！` + (sp.ride === 'fly' ? '（空を飛べる）' : sp.ride === 'swim' ? '（水の上を泳げる）' : '（速く走れる）'));
}
export function stopRide(silent = false) {
  const P = OW.player;
  if (!P.rideM) return true;
  if (OW.mode === 'fly' || OW.mode === 'swim') {
    const h = G.world && !OW.dungeon ? G.world.heightAt(P.x, P.z) : 0;
    if (h < -0.4 && !silent) { toast('ここでは 降りられない！'); return false; }
    if (!silent && !OW.dungeon && G.world.blockedByObst(P.x, P.z, 0.5)) { toast('ここでは 降りられない！'); return false; }
  }
  P.rideM.root.parent?.remove(P.rideM.root);
  P.rideM = null; P.rideSp = null; OW.mode = 'walk';
  if (OW.follower) OW.follower.root.visible = true;
  return true;
}
function curScene() { return OW.dungeon ? OW.dscene : OW.scene; }

// ---------- 地域レベル ----------
export function levelRangeAt(x, z) {
  if (OW.dungeon) return DUNGEONS[OW.dungeon.id].lv;
  let r = G.world.regionAt(x, z);
  if (r === 'sea') r = Math.hypot(x, z) < SANCT_R + 40 ? 'sanctuary' : ringAt(x, z).id;
  if (r === 'start') return REGIONS.start.lv;
  return REGIONS[r].lv;
}
export function rollWild(region, water, x, z) {
  let table = encounterTable(region, water);
  const [lo, hi] = levelRangeAt(x, z);
  table = table.filter(e => e.minLv <= hi + 1);
  if (!table.length) table = encounterTable(water ? 'sea' : 'plains', water).filter(e => e.minLv <= hi + 1);
  if (!table.length) return null;
  const tot = table.reduce((a, e) => a + e.w, 0);
  let k = Math.random() * tot, pick = table[0];
  for (const e of table) { k -= e.w; if (k <= 0) { pick = e; break; } }
  let lv = lo + Math.floor(Math.random() * (hi - lo + 1));
  lv = Math.max(lv, pick.minLv);
  return { sp: pick.sp, lv: Math.min(99, lv) };
}

// ---------- 野生のアニモン（見えるエンカウント） ----------
function updateWilds(dt) {
  const P = OW.player, W = G.world;
  const max = OW.dungeon ? 0 : (G.settings.light ? 4 : 8);
  // 出現
  OW.spawnT = (OW.spawnT || 0) - dt;
  if (OW.wilds.length < max && OW.spawnT <= 0 && !OW.inTown) {
    OW.spawnT = 0.6;
    const a = Math.random() * Math.PI * 2, d = 24 + Math.random() * 26;
    const x = P.x + Math.cos(a) * d, z = P.z + Math.sin(a) * d;
    const reg = W.regionAt(x, z);
    const info = W.cellInfo(x, z);
    const h = W.heightAt(x, z);
    if (isUnlocked(reg) && !info.flat && !(reg === 'start' && Math.hypot(x - START_POS[0], z - START_POS[1]) < 60)) {
      const water = h < -0.8;
      if (!water && W.blockedByObst(x, z, 0.8)) return;
      const w = rollWild(reg === 'sea' ? 'sea' : reg, water, x, z);
      if (w) {
        const mon = createMon(w.sp, w.lv);
        const M = buildAnimon(w.sp, mon.shiny);
        M.root.setPos(x, water ? -0.3 : h, z);
        OW.scene.add(M.root);
        OW.wilds.push({ mon, M, x, z, hx: x, hz: z, tx: x, tz: z, water, t: 0, life: 70, sparkle: 0 });
      }
    }
  }
  for (let i = OW.wilds.length - 1; i >= 0; i--) {
    const w = OW.wilds[i];
    w.t -= dt; w.life -= dt;
    if (w.t <= 0) { w.t = 2 + Math.random() * 4; const a = Math.random() * Math.PI * 2, r = Math.random() * 8; w.tx = w.hx + Math.cos(a) * r; w.tz = w.hz + Math.sin(a) * r; }
    const dx = w.tx - w.x, dz = w.tz - w.z, l = Math.hypot(dx, dz);
    let moving = false;
    if (l > 0.3) {
      const sp = 2.2 * dt; const nx = w.x + dx / l * sp, nz = w.z + dz / l * sp;
      const h = W.heightAt(nx, nz);
      if ((w.water ? h < -0.6 : (h > -0.3 && !W.blockedByObst(nx, nz, 0.6))) && isUnlocked(W.regionAt(nx, nz))) { w.x = nx; w.z = nz; moving = true; w.M.root.rot[1] = Math.atan2(dx, dz); } else w.t = 0;
    }
    w.M.root.setPos(w.x, w.water ? -0.35 : W.heightAt(w.x, w.z), w.z);
    animateAnimon(w.M, dt, moving ? 'walk' : 'idle');
    if (w.mon.shiny) { w.sparkle -= dt; if (w.sparkle <= 0) { w.sparkle = 0.25; sparkleAt(w.x, W.heightAt(w.x, w.z) + w.M.height, w.z); } }
    const pd = Math.hypot(w.x - P.x, w.z - P.z);
    if (pd > 80 || w.life <= 0) { OW.scene.root.remove(w.M.root); OW.wilds.splice(i, 1); continue; }
    if (!G.busy && OW.mode !== 'fly' && !OW.noEnc && pd < 1.4 + w.M.height * 0.35 && OW.encCool <= 0) {
      OW.scene.root.remove(w.M.root); OW.wilds.splice(i, 1);
      runFlow(async () => { await startWildBattle(w.mon, { biome: biomeHere(), water: w.water }); });
      return;
    }
  }
}
const sparks = [];
function sparkleAt(x, y, z) {
  const n = new Node(PRIM.star, { color: [1, 0.95, 0.5], unlit: true, alpha: 1 }); n.doubleSide = true; n.noDepthWrite = true; n.setScale(0.35);
  n.setPos(x + (Math.random() - 0.5) * 1.5, y + Math.random(), z + (Math.random() - 0.5) * 1.5);
  curScene().add(n); sparks.push({ n, life: 0.8 });
}
export function biomeHere() {
  if (OW.dungeon) return DUNGEONS[OW.dungeon.id].theme;
  const P = OW.player; const r = G.world.regionAt(P.x, P.z);
  if (G.world.heightAt(P.x, P.z) < -0.6) return 'sea';
  return r;
}

// ---------- 流れの管理 ----------
export async function runFlow(fn) {
  if (G.busy) return;
  G.busy = true;
  try { await fn(); } catch (e) { console.error(e); toast('エラーが発生しました: ' + e.message); }
  G.busy = false;
  Input.clearEdges();
  OW.encCool = 2.5;
}

// ---------- メインの更新 ----------
export function updateOverworld(dt) {
  const P = OW.player; if (!P) return;
  OW.t += dt;
  const W = G.world;
  const D = OW.dungeon;
  OW.encCool = Math.max(0, OW.encCool - dt);
  let moved = 0;
  if (!G.busy && G.state === 'world') {
    const mv = readMove();
    if (mv.mag > 0) {
      const run = Input.run && OW.mode === 'walk';
      const spd = (OW.mode === 'walk' ? (run ? SPEED.run : SPEED.walk) : SPEED[OW.mode]) * Math.max(0.35, mv.mag);
      let nx = P.x + mv.x * spd * dt, nz = P.z + mv.z * spd * dt;
      const ok = (x, z) => canStand(x, z);
      if (ok(nx, nz)) { moved = Math.hypot(nx - P.x, nz - P.z); P.x = nx; P.z = nz; }
      else if (ok(nx, P.z)) { moved = Math.abs(nx - P.x); P.x = nx; }
      else if (ok(P.x, nz)) { moved = Math.abs(nz - P.z); P.z = nz; }
      const tr = Math.atan2(mv.x, mv.z);
      P.ry += angleDiff(P.ry, tr) * Math.min(1, dt * 14);
      P.state = run ? 'run' : 'walk';
    } else P.state = 'idle';
    // ボタン
    if (Input.edge('a')) interact();
    if (Input.edge('menu')) runFlow(() => MENU.openMainMenu());
    if (Input.edge('map')) runFlow(() => MENU.openMap());
    if (Input.edge('ride')) runFlow(() => MENU.toggleRide());
    Input.edge('b');
    if (Input.wheel) { OW.zoom = clamp(OW.zoom + Input.wheel * 0.1, 0.55, 1.7); Input.wheel = 0; }
  } else P.state = P.state === 'walk' || P.state === 'run' ? 'idle' : P.state;

  // 高さ
  let gy;
  if (D) gy = 0;
  else {
    const h = W.heightAt(P.x, P.z);
    if (OW.mode === 'fly') gy = Math.max(h, 0) + 12;
    else if (h < -0.3) gy = -0.45;
    else gy = h;
  }
  P.y = OW.mode === 'fly' ? lerp(P.y, gy, Math.min(1, dt * 3)) : (Math.abs(P.y - gy) > 3 ? gy : lerp(P.y, gy, Math.min(1, dt * 18)));
  // モデル配置
  if (P.rideM) {
    P.rideM.root.setPos(P.x, P.y, P.z); P.rideM.root.rot[1] = P.ry;
    animateAnimon(P.rideM, dt, OW.mode === 'fly' ? 'fly' : (P.state !== 'idle' ? 'run' : 'idle'));
    const seat = P.rideH * (SPECIES[P.rideSp].plan === 'biped' || SPECIES[P.rideSp].plan === 'golem' ? 0.62 : 0.72) + (OW.mode === 'fly' ? P.rideM.pivot.pos[1] * P.rideScale : 0);
    P.H.root.setPos(P.x, P.y + seat - 0.55, P.z);
    animateHuman(P.H, dt, 'ride');
  } else {
    P.H.root.setPos(P.x, P.y, P.z);
    animateHuman(P.H, dt, P.state);
  }
  P.H.root.rot[1] = P.ry;
  P.shadow.setPos(P.x, (D ? 0 : W.groundAt(P.x, P.z)) + 0.06, P.z); P.shadow.setScale(OW.mode === 'fly' ? 1.2 : 0.75);
  // 連れ歩き
  if (OW.follower && !P.rideM) {
    const f = OW.follower;
    OW.trail.push([P.x, P.z]); if (OW.trail.length > 40) OW.trail.shift();
    const tgt = OW.trail[0];
    const dx = tgt[0] - f.x, dz = tgt[1] - f.z, l = Math.hypot(dx, dz);
    const dp = Math.hypot(P.x - f.x, P.z - f.z);
    let fm = false;
    if (dp > 2.4 && l > 0.05) { const sp = Math.min(l, Math.max(SPEED.walk, dp * 3) * dt); f.x += dx / l * sp; f.z += dz / l * sp; f.ry = Math.atan2(dx, dz); fm = true; }
    if (dp > 25) { f.x = P.x - Math.sin(P.ry) * 2; f.z = P.z - Math.cos(P.ry) * 2; }
    const fh = D ? 0 : Math.max(W.heightAt(f.x, f.z), -0.45);
    f.root.setPos(f.x, fh, f.z); f.root.rot[1] = f.ry;
    animateAnimon(f.M, dt, fm ? 'walk' : 'idle');
  }
  // NPCアニメ
  for (const n of OW.npcs) {
    if (n.H) animateHuman(n.H, dt, 'idle');
    if (n.M) animateAnimon(n.M, dt, 'idle');
    if (n.marker) { n.marker.rot[1] += dt * 2; }
  }
  for (const k in OW.spawned) { const s = OW.spawned[k]; if (s.M) animateAnimon(s.M, dt, s.M.sp.legend ? 'fly' : 'idle'); if (s.H) animateHuman(s.H, dt, 'idle'); }
  for (let i = sparks.length - 1; i >= 0; i--) { const s = sparks[i]; s.life -= dt; s.n.pos[1] += dt * 1.2; s.n.rot[2] += dt * 4; s.n.color[3] = Math.max(0, s.life / 0.8); if (s.life <= 0) { s.n.parent?.remove(s.n); sparks.splice(i, 1); } }
  // アイテム・岩のゆらぎ
  for (const t of OW.trig) {
    if (t.kind === 'item' && t.node) { const h = W.groundAt(t.x, t.z); t.node.setPos(t.x, h + 0.7 + Math.sin(OW.t * 3 + t.x) * 0.15, t.z); }
    if (t.kind === 'altar') { t.gem.rot[1] += dt; t.gem.pos[1] = W.heightAt(t.x, t.z) + 3 + Math.sin(OW.t * 1.5) * 0.3; }
    if (t.kind === 'stone') { t.gem.rot[1] += dt * 1.5; t.gem.pos[1] = 1.8 + Math.sin(OW.t * 2) * 0.12; const reg = G.save.stones[t.id]; t.gem.setColor(reg ? [0.4, 0.9, 1] : [0.55, 0.55, 0.6]); t.gem.emis = reg ? [0.2, 0.6, 0.8] : [0, 0, 0]; }
  }
  if (OW.barrier) OW.barrier.color[3] = 0.2 + Math.sin(OW.t * 2) * 0.08;

  if (!D) {
    // チャンク
    W.ensureChunks(P.x, P.z, G.settings.light ? 110 : 150);
    // 水面
    OW.water.setPos(Math.round(P.x / 4) * 4, 0, Math.round(P.z / 4) * 4);
    // 地域
    const reg = W.regionAt(P.x, P.z);
    const town = TOWNS.find(t => Math.hypot(P.x - t.pos[0], P.z - t.pos[1]) < t.r + 4) || null;
    if (reg !== OW.region || (town?.id || null) !== (OW.inTown?.id || null)) onRegionChange(reg, town);
    // 空の色
    const sky = SKY[reg] || SKY.plains;
    if (!OW.skyCur) OW.skyCur = { bg: sky.bg.slice(), fog: sky.fog.slice() };
    for (let i = 0; i < 3; i++) { OW.skyCur.bg[i] = lerp(OW.skyCur.bg[i], sky.bg[i], dt); OW.skyCur.fog[i] = lerp(OW.skyCur.fog[i], sky.fog[i], dt); }
    OW.scene.bg = OW.skyCur.bg; OW.scene.fogColor = OW.skyCur.fog;
    const far = (G.settings.light ? 120 : 165) * OW.zoom * (OW.mode === 'fly' ? 1.3 : 1);
    OW.scene.fogNear = far * 0.45; OW.scene.fogFar = far;
    OW.scene.cullCenter = [P.x, 0, P.z]; OW.scene.cullRadius = (OW.mode === 'fly' ? 120 : 72) * OW.zoom;
    // 草むら・水上エンカウント
    if (moved > 0 && !G.busy && OW.encCool <= 0 && OW.mode !== 'fly' && !OW.noEnc) {
      const info = W.cellInfo(P.x, P.z);
      const h = W.heightAt(P.x, P.z);
      const water = h < -0.6;
      const rate = water ? 1 / 75 : (info.grass ? 1 / 42 : 0);
      if (rate && Math.random() < moved * rate) {
        const w = rollWild(reg === 'sea' ? 'sea' : reg, water, P.x, P.z);
        if (w) runFlow(async () => { await startWildBattle(createMon(w.sp, w.lv), { biome: biomeHere(), water }); });
      }
    }
    updateWilds(dt);
    // トレーナーの視線
    if (!G.busy) for (const n of OW.npcs) {
      if ((n.kind !== 'trainer') || G.save.defeated[n.id]) continue;
      const d = Math.hypot(n.x - P.x, n.z - P.z);
      if (d < 7 && OW.mode !== 'fly') { runFlow(() => trainerSpotted(n)); break; }
    }
    // ストーリー・クエストの位置トリガー
    if (!G.busy) SE.checkPosition(P.x, P.z, reg);
  } else {
    // ダンジョン
    OW.dscene.cullCenter = [P.x, 0, P.z]; OW.dscene.cullRadius = 80;
    if (moved > 0 && !G.busy && OW.encCool <= 0 && !OW.noEnc && Math.random() < moved / 48) {
      const w = rollWild(D.id, false, P.x, P.z);
      if (w) runFlow(async () => { await startWildBattle(createMon(w.sp, w.lv), { biome: DUNGEONS[D.id].theme }); });
    }
  }
  // カメラ
  if (OW.camOverride) {
    const co = OW.camOverride; co.t = Math.min(1, co.t + dt * 1000 / co.ms);
    const k = co.t * co.t * (3 - 2 * co.t);
    for (let i = 0; i < 3; i++) { OW.cam.pos[i] = lerp(co.fromPos[i], co.pos[i], k); OW.cam.target[i] = lerp(co.fromLook[i], co.look[i], k); }
  } else {
    const z = OW.zoom * (OW.mode === 'fly' ? 1.35 : 1);
    const tx = P.x, ty = P.y + 1.2, tz = P.z;
    const want = D ? [tx, ty + 19 * z, tz + 9 * z] : [tx, ty + 17.5 * z, tz + 17.5 * z];
    for (let i = 0; i < 3; i++) OW.cam.pos[i] = lerp(OW.cam.pos[i], want[i], Math.min(1, dt * 6));
    OW.cam.target = [lerp(OW.cam.target[0], tx, Math.min(1, dt * 8)), lerp(OW.cam.target[1], ty, Math.min(1, dt * 8)), lerp(OW.cam.target[2], tz, Math.min(1, dt * 8))];
    if (Math.hypot(OW.cam.pos[0] - want[0], OW.cam.pos[2] - want[2]) > 60) { OW.cam.pos = want; OW.cam.target = [tx, ty, tz]; }
  }
  updatePrompt();
  updateLabels();
}

function canStand(x, z) {
  const W = G.world;
  if (OW.dungeon) return !OW.dungeon.blocked(x, z, 0.55);
  if (Math.abs(x) > 760 || Math.abs(z) > 760) return false;
  const reg = W.regionAt(x, z);
  if (!isUnlocked(reg)) {
    if (OW.t - OW.lastToast > 2.5) { OW.lastToast = OW.t; toast('ふしぎな結界に はばまれて 進めない！\n（ストーリーを進めると 通れるようになる）'); audio.sfx('bump'); }
    return false;
  }
  if (OW.mode === 'fly') return true;
  const h = W.heightAt(x, z);
  if (h < -0.4 && OW.mode !== 'swim') {
    if (OW.t - OW.lastToast > 3 && h < -0.4) { OW.lastToast = OW.t; toast('水に入るには 泳げるアニモンに「ライド」しよう'); }
    return false;
  }
  if (W.blockedByObst(x, z, 0.5)) return false;
  return true;
}

function onRegionChange(reg, town) {
  const prev = OW.region;
  OW.region = reg; OW.inTown = town;
  const lv = reg === 'sea' ? null : REGIONS[reg]?.lv;
  const name = town ? town.name : (REGIONS[reg]?.name || '');
  if (name && (prev !== null || true)) {
    const rn = $('#regionName');
    rn.innerHTML = esc(name) + (lv && !town ? `<small>野生のアニモン Lv${lv[0]}〜${lv[1]}</small>` : '');
    rn.classList.add('show'); clearTimeout(OW.rnT); OW.rnT = setTimeout(() => rn.classList.remove('show'), 2600);
  }
  audio.playBgm(town ? 'town' : 'field');
  if (prev !== null) save();
}

// ---------- 調べる・話す ----------
function nearest() {
  const P = OW.player;
  let best = null, bd = 1e9;
  if (OW.dungeon) {
    for (const t of OW.dtrig) { const d = Math.hypot(t.x - P.x, t.z - P.z); if (d < t.r && d < bd) { bd = d; best = t; } }
    return best;
  }
  for (const t of OW.trig) { if (t.kind === 'item' && G.save.items[t.id]) continue; const d = Math.hypot(t.x - P.x, t.z - P.z); if (d < t.r && d < bd) { bd = d; best = t; } }
  for (const n of OW.npcs) { const d = Math.hypot(n.x - P.x, n.z - P.z); if (d < 3.6 && d < bd) { bd = d; best = { kind: 'npcRef', n }; } }
  return best;
}
function updatePrompt() {
  const p = $('#prompt');
  if (G.busy || G.state !== 'world') { p.textContent = ''; return; }
  const t = nearest();
  let txt = '';
  if (t) {
    const btn = Input.touch ? 'A' : 'Space';
    const verb = { door: '入る', stone: '岩にさわる', item: '拾う', dungeon: '入る', npcRef: '話す', exit: '外に出る', chest: '開ける', boss: '調べる' }[t.kind] || '調べる';
    txt = `${btn}：${verb}`;
  }
  if (p.textContent !== txt) p.textContent = txt;
}
export function interact() {
  const t = nearest();
  if (!t) return;
  audio.sfx('select');
  runFlow(async () => {
    const P = OW.player;
    if (t.kind === 'npcRef') {
      const n = t.n;
      if (n.H) n.H.root.rot[1] = Math.atan2(P.x - n.x, P.z - n.z);
      await SE.talkNpc(n);
    } else if (t.kind === 'door') await doorAction(t);
    else if (t.kind === 'stone') await stoneAction(t);
    else if (t.kind === 'item') {
      G.save.items[t.id] = true; addItem(t.item, 1); OW.scene.root.remove(t.node); audio.sfx('item');
      await say([`|${itemName(t.item)} を 拾った！`]); save();
    } else if (t.kind === 'dungeon') await dungeonEnter(t.id);
    else if (t.kind === 'exit') { if (await confirmBox('ダンジョンから 外に出ますか？')) await exitDungeon(); }
    else if (t.kind === 'chest') {
      if (OW.dungeon.opened.has(t.i)) { await say(['|からっぽだ。']); return; }
      OW.dungeon.opened.add(t.i); audio.sfx('item');
      const pool = ['superherb', 'revive', 'ppdrop', 'fullmed', 'food3', 'food4', 'h_berry', 'h_clear', 'candy', 'h_bread', 'h_claw', 'h_belt', 'h_spike', 'h_glass'];
      const it = pool[(t.i * 5 + OW.dungeon.id.length * 3 + Math.floor(Math.random() * 3)) % pool.length];
      addItem(it, 1); t.node.setColor([0.4, 0.3, 0.2]);
      await say([`|宝箱を 開けた！ ${itemName(it)} を 手に入れた！`]); save();
    } else if (t.kind === 'boss') await dungeonBoss();
  });
}
async function trainerSpotted(n) {
  const P = OW.player;
  const lbl = { x: n.x, z: n.z };
  OW.exMark = lbl; audio.sfx('encounter');
  n.H.root.rot[1] = Math.atan2(P.x - n.x, P.z - n.z);
  await new Promise(r => setTimeout(r, 700));
  OW.exMark = null;
  await say([`${n.name}|目が合ったら 勝負だ！`]);
  const res = await startTrainerBattle(n.tr.id, { route: n.tr });
  if (res === 'win') { await say([`${n.name}|まいった！ きみ 強いね！`]); }
}

async function doorAction(t) {
  if (t.type === 'hospital') return MENU.openHospital(t.town);
  if (t.type === 'shop') return MENU.openShop(t.town);
  if (t.type === 'hall') return SE.enterHall(t.town);
  if (t.type === 'home') {
    await say(['ママ|おかえり！ 少し 休んでいきなさい。']);
    await fade(true, 400); MENU.healAll(); audio.sfx('heal'); await fade(false, 400);
    await say(['|アニモンたちは 元気いっぱいに なった！']); return;
  }
  if (t.type === 'lab') return SE.talkNpc(OW.npcs.find(n => n.id === 'alma' || n.id === 'almaPost') || { id: 'alma', name: 'アルマ博士', talk: ['アルマ博士|研究は 順調だよ。'] });
  if (t.type === 'lighthouse') return say(['|灯台の 明かりが 海を 照らしている。']);
  const lines = ['住人|この大陸の どこかに、伝説のアニモンが 眠っているらしいよ。', '住人|アニモンの 特殊能力は 1種類ごとに 1つ 決まっているんだ。', '住人|進化すると 能力は 上がるけど、個体値は 変わらないんだって。', '住人|技は 1匹につき 8種類。覚えられるのは 4つまでだよ。', '住人|「おもいだしの巻物」があれば、覚えられる技を いつでも 覚え直せるんだ。', '住人|強いアニモンほど、バトルから 逃げにくいから 気をつけて。'];
  return say([lines[(t.bi + t.town.length) % lines.length]]);
}
async function stoneAction(t) {
  if (!G.save.stones[t.id]) {
    G.save.stones[t.id] = true; audio.sfx('warp');
    await say([`|${t.name} の 岩が 光った！`, '|ファストトラベルに 登録した！']);
    save();
  }
  await MENU.openTravel(t.id);
}
export async function warpTo(stoneId) {
  const s = STONES.find(x => x.id === stoneId); if (!s) return;
  stopRide(true);
  audio.sfx('warp');
  await fade(true, 400);
  const P = OW.player;
  P.x = s.pos[0]; P.z = s.pos[1] + 4; P.ry = 0;
  G.world.buildAll(P.x, P.z, 120);
  P.y = G.world.heightAt(P.x, P.z);
  OW.cam.pos = [P.x, P.y + 20, P.z + 18]; OW.cam.target = [P.x, P.y, P.z];
  OW.trail.length = 0; if (OW.follower) { OW.follower.x = P.x; OW.follower.z = P.z + 2; }
  if (s.town) G.save.lastHospital = s.id;
  for (const w of OW.wilds) OW.scene.root.remove(w.M.root); OW.wilds = [];
  await new Promise(r => setTimeout(r, 200));
  await fade(false, 400);
  save();
}

// ---------- ダンジョン ----------
async function dungeonEnter(id) {
  const d = DUNGEONS[id];
  if (d.post && !G.save.postGame) { await say(['|強い力で 封印されている……。（ストーリークリア後に 入れる）']); return; }
  if (!await confirmBox(`${d.name}（推奨Lv${d.rec}）に 入りますか？`)) return;
  stopRide(true);
  await fade(true, 400);
  OW.saveOut = [OW.player.x, OW.player.z];
  const Dg = new Dungeon(id, d, hashStr(id) + 7);
  Dg.opened = new Set();
  const S = new Scene();
  S.bg = Dg.theme.bg.slice(); S.fogColor = Dg.theme.bg.slice(); S.fogNear = 18; S.fogFar = 55;
  S.sky = [0.45, 0.45, 0.55]; S.ground = [0.25, 0.22, 0.3]; S.sun = [0.6, 0.58, 0.55];
  if (d.theme === 'sky') { S.fogNear = 40; S.fogFar = 90; S.sun = [0.9, 0.88, 0.8]; }
  S.add(Dg.node);
  OW.dscene = S; OW.dungeon = Dg;
  OW.dtrig = [{ kind: 'exit', x: Dg.entrance[0], z: Dg.entrance[1] + 2.2, r: 1.6 }];
  // 出口の光
  const ex = new Node(PRIM.disc, { color: [1, 1, 0.8], emis: [0.6, 0.6, 0.4] }); ex.setScale(1.4); ex.setPos(Dg.entrance[0], 0.05, Dg.entrance[1] + 2.2); S.add(ex);
  Dg.chests.forEach((c, i) => {
    const n = new Node(PRIM.box, { color: [0.85, 0.6, 0.2], emis: [0.15, 0.1, 0] }); n.setScale(1.4, 1, 1); n.setPos(c[0], 0.5, c[1]); S.add(n);
    OW.dtrig.push({ kind: 'chest', x: c[0], z: c[1], r: 2.4, i, node: n });
  });
  if (!G.save.cleared[id]) {
    const B = DUNGEON_BOSS[id];
    const M = buildAnimon(BY_NAME[B[0]].id, false); M.root.setPos(Dg.boss[0], 0, Dg.boss[1]); M.root.rot[1] = Math.PI; S.add(M.root);
    OW.dtrig.push({ kind: 'boss', x: Dg.boss[0], z: Dg.boss[1], r: 3.5, M });
    OW.dbossM = M;
  }
  const P = OW.player;
  P.x = Dg.entrance[0]; P.z = Dg.entrance[1] - 1.6; P.y = 0; P.ry = Math.PI;
  OW.scene.root.remove(P.H.root); OW.scene.root.remove(P.shadow);
  S.add(P.H.root); S.add(P.shadow);
  if (OW.follower) { OW.scene.root.remove(OW.follower.root); S.add(OW.follower.root); OW.follower.x = P.x; OW.follower.z = P.z + 1; }
  OW.trail.length = 0;
  OW.cam.pos = [P.x, 22, P.z + 9]; OW.cam.target = [P.x, 0, P.z];
  audio.playBgm('dungeon');
  G.scene = S;
  await fade(false, 400);
  await say([`|${d.name} に 入った。いちばん奥に 何かが いるようだ……`]);
}
export const DUNGEON_BOSS = { ruins: ['イニシエ', 22], pyramid: ['ホウタイオウ', 38], icecave: ['ヒョウショウ', 55], skytower: ['ドラコンロード', 68], lavacave: ['マグマジン', 79], abyss: ['ヤミノオウ', 98] };
async function dungeonBoss() {
  const id = OW.dungeon.id;
  const [nm, lv] = DUNGEON_BOSS[id];
  await say([`|${DUNGEONS[id].name}の 主 ${nm} が 立ちはだかった！`]);
  const mon = createMon(BY_NAME[nm].id, lv);
  const res = await startWildBattle(mon, { biome: DUNGEONS[id].theme, boss: true });
  if (res === 'win' || res === 'caught') {
    G.save.cleared[id] = true;
    if (OW.dbossM) { OW.dscene.root.remove(OW.dbossM.root); OW.dbossM = null; }
    OW.dtrig = OW.dtrig.filter(t => t.kind !== 'boss');
    const money = lv * 100; G.save.money += money;
    await say([`|${DUNGEONS[id].name} を 攻略した！`, `|${money}円 を 手に入れた！`]);
    SE.onDungeonClear(id);
    save();
    if (await confirmBox('入り口まで 戻りますか？')) await exitDungeon();
  }
}
export async function exitDungeon() {
  await fade(true, 400);
  const S = OW.dscene;
  const P = OW.player;
  S.root.remove(P.H.root); S.root.remove(P.shadow);
  OW.scene.add(P.H.root); OW.scene.add(P.shadow);
  if (OW.follower) { S.root.remove(OW.follower.root); OW.scene.add(OW.follower.root); }
  OW.dungeon = null; OW.dscene = null; G.scene = OW.scene;
  P.x = OW.saveOut[0]; P.z = OW.saveOut[1] + 2; P.ry = 0;
  OW.trail.length = 0; if (OW.follower) { OW.follower.x = P.x; OW.follower.z = P.z + 1.5; }
  OW.cam.pos = [P.x, P.y + 20, P.z + 18]; OW.cam.target = [P.x, G.world.heightAt(P.x, P.z), P.z];
  OW.region = null;
  await fade(false, 400);
  save();
}

// ---------- 名前ラベル ----------
const pool = [];
function updateLabels() {
  const box = $('#labels');
  const P = OW.player; const R = G.renderer;
  const W = R.cssW, H = R.cssH;
  let k = 0;
  const show = (x, y, z, text, cls = '') => {
    const p = OW.cam.project([x, y, z], W, H);
    if (p[2] <= 0 || p[0] < -50 || p[0] > W + 50 || p[1] < -30 || p[1] > H + 30) return;
    let e = pool[k]; if (!e) { e = el('div', 'lbl'); box.appendChild(e); pool[k] = e; }
    k++;
    if (e._t !== text) { e.textContent = text; e._t = text; }
    if (e._c !== cls) { e.className = 'lbl ' + cls; e._c = cls; }
    e.style.display = '';
    e.style.left = p[0] + 'px'; e.style.top = p[1] + 'px';
  };
  if (G.state === 'world' && !OW.camOverride) {
    const gr = (x, z) => OW.dungeon ? 0 : G.world.groundAt(x, z);
    if (!OW.dungeon) {
      for (const t of OW.trig) {
        if (!t.label) continue;
        const d = Math.hypot(t.x - P.x, t.z - P.z);
        if (d > 32) continue;
        show(t.lx ?? t.x, gr(t.x, t.z) + (t.ly || 3), t.lz ?? t.z, t.label);
      }
      for (const n of OW.npcs) {
        const d = Math.hypot(n.x - P.x, n.z - P.z); if (d > 26) continue;
        const mark = SE.npcMark(n);
        if (mark) show(n.x, gr(n.x, n.z) + 3.0, n.z, mark, mark === '!' ? 'ex' : 'ex q');
        else if (d < 9 && n.name) show(n.x, gr(n.x, n.z) + 2.7, n.z, n.name);
      }
    } else {
      for (const t of OW.dtrig) { const d = Math.hypot(t.x - P.x, t.z - P.z); if (d > 20) continue; if (t.kind === 'exit') show(t.x, 2.2, t.z, '出口'); if (t.kind === 'boss') show(t.x, 4, t.z, '!', 'ex'); }
    }
    if (OW.exMark) show(OW.exMark.x, gr(OW.exMark.x, OW.exMark.z) + 3.2, OW.exMark.z, '!', 'ex');
  }
  for (let i = k; i < pool.length; i++) if (pool[i].style.display !== 'none') pool[i].style.display = 'none';
}

// ---------- シーン用：一時的な登場 ----------
export function spawnActor(def) {
  despawnActor(def.id);
  const P = OW.player;
  const pos = def.pos || [P.x + (def.rel ? def.rel[0] : 0), P.z + (def.rel ? def.rel[1] : -4)];
  let rec;
  if (def.kind === 'animon') {
    const M = buildAnimon(BY_NAME[def.sp].id, false);
    M.root.setPos(pos[0], G.world.groundAt(pos[0], pos[1]) + (def.y || 0), pos[1]); M.root.rot[1] = def.ry || 0;
    rec = { root: M.root, M };
  } else {
    const H = buildHuman(LOOKS[def.look] || randomLook(mulberry32(7)));
    H.root.setPos(pos[0], G.world.groundAt(pos[0], pos[1]), pos[1]); H.root.rot[1] = def.ry ?? Math.atan2(P.x - pos[0], P.z - pos[1]);
    rec = { root: H.root, H };
  }
  rec.pos = pos;
  OW.spawned[def.id] = rec;
  curScene().add(rec.root);
  return rec;
}
export function despawnActor(id) {
  const s = OW.spawned[id];
  if (s) { s.root.parent?.remove(s.root); delete OW.spawned[id]; }
  // 常駐NPCも消す
  const n = OW.npcs.find(x => x.id === id);
  if (n) { (n.H?.root || n.M?.root)?.parent?.remove(n.H?.root || n.M?.root); n.shadow?.parent?.remove(n.shadow); OW.npcs.splice(OW.npcs.indexOf(n), 1); }
}
export function camTo(target) {
  if (!target) { OW.camOverride = null; return; }
  let look, pos;
  const W = G.world;
  if (Array.isArray(target)) { look = target; }
  else if (target === 'legends') look = [ALTAR[0], 12, ALTAR[1] - 26];
  else if (target === 'sanctuary') look = [0, 10, 0];
  else { const n = OW.npcs.find(x => x.id === target) || OW.spawned[target]; const p = n ? [n.x ?? n.pos[0], n.z ?? n.pos[1]] : [OW.player.x, OW.player.z]; look = [p[0], W.groundAt(p[0], p[1]) + 1.2, p[1]]; }
  pos = target === 'sanctuary' ? [60, 120, 160] : target === 'legends' ? [ALTAR[0], 30, ALTAR[1] + 20] : [look[0], look[1] + 14, look[2] + 13];
  OW.camOverride = { fromPos: OW.cam.pos.slice(), fromLook: OW.cam.target.slice(), pos, look, t: 0, ms: 1200 };
}
