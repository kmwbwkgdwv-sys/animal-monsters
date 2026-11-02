// =============================================================
//  フィールド（大陸・ダンジョン）の進行
// =============================================================
import { Scene, Camera, Node, GeoBuilder, PRIM, initPrims, M4, mixRgb, MAT, geoSerial, disposeSceneGeos } from '../engine/gl3d.js';
import { SkyRig } from '../render/sky.js';
import { Ambient, BIOME_AMBIENT } from '../render/ambient.js';
import { RuinFx } from '../render/ruinfx.js';
import { clamp, lerp, mulberry32, angleDiff, hashStr } from '../engine/util.js';
import { World, buildBuilding, SKY, SKY_RUIN, REGION_INDEX } from '../render/world.js';
import { Dungeon, chestGeo } from '../render/dungeon.js';
import { buildHuman, animateHuman, buildAnimon, animateAnimon, randomLook, pumpHumans } from '../render/models.js';
import { DUNGEON_BOSS, TOWNS, STONES, DUNGEONS, ITEM_BALLS, REGIONS, RING, TRAINERS, routeTrainers, encounterTable, regionLevel, ringAt, polar, BUILD_JA, SANCT_R, INNER_R, START_POS, COAST_R, ALTAR, ERA, IMPACT, CRATER_R, VOLCANO_C, RUINED, goneAt, P2_START, TIME_GATES } from '../data/world.js';
import { SPECIES, BY_NAME } from '../data/species.js';
import { DESIGN } from '../data/designs.js';
import { NPCS, LOOKS, QUESTS, STEPS } from '../data/story.js';
import { ITEMS } from '../data/items.js';
import { createMon, bossIv } from './mon.js';
import { G, isUnlocked, addItem, addMoney, save, itemName } from './state.js';
import { Input, readMove } from '../input.js';
import { audio } from '../audio.js';
import { $, el, esc, toast, say, confirmBox, fade, UI, glintAt } from '../ui/ui.js';
import * as SE from './storyEngine.js';
import * as FX from './movieFx.js';
import { startWildBattle, startTrainerBattle } from '../ui/battleUI.js';
import * as MENU from '../ui/menus.js';
import * as ER from './errands.js';
import * as COOP from './coop.js';
import { ERRAND_GIVERS } from '../data/errands.js';

function norm(v) { const l = Math.hypot(...v); return v.map(x => x / l); }
export const OW = {
  scene: null, cam: new Camera(42), player: null, npcs: [], wilds: [], trig: [], labels: [], spawned: {},
  region: null, inTown: null, mode: 'walk', dungeon: null, encCool: 0, zoom: 0.95, lastToast: 0, follower: null, trail: [],
  skyCur: null, t: 0, camOverride: null,
  trCool: {},   // 逃げた トレーナー（離れるまで 目が合わない）
};
const SPEED = { walk: 7, run: 11.5, land: 17, swim: 13, fly: 24 };
const TR_SIGHT = 7, TR_AWAY = 13;   // トレーナーの 視線（m）・逃げたあと また 目が合うように なる 距離
const RIDE_HIP = 0.6;   // 人の 足もとから おしりまでの 高さ（乗っている ときの すわる 位置）

// ---------- 構築 ----------
export async function buildOverworld(progress) {
  initPrims();
  if (!G.world) {
    progress && progress(0.3, '大陸を生成中…');
    await new Promise(r => setTimeout(r, 30));
    const clear = [...NPCS.map(n => n.pos), ...QUESTS.flatMap(q => [q.giver.pos, ...q.steps.filter(st => st.trig.pos).map(st => st.trig.pos)]), ...routeTrainers().map(t => t.pos), [0, 30], ALTAR, [ALTAR[0], ALTAR[1] - 12], [ALTAR[0] - 16, ALTAR[1] - 32], [ALTAR[0] + 16, ALTAR[1] - 32], ...ITEM_BALLS.map(b => b[2])];
    G.world = new World({ light: G.settings.light, clear, instancing: !!G.renderer.inst });
  }
  const W = G.world;
  W.boxes.length = 0;
  OW.trig = []; OW.npcs = []; OW.wilds = []; OW.spawned = {}; OW.labels = [];
  const S = new Scene();
  S.add(W.node);
  OW.scene = S;
  // アニメ調の光（低めの太陽で斜面の明暗をはっきり）
  S.lightDir = norm([0.5, 0.66, 0.56]);
  S.cloudShadow = [G.settings.light ? 0 : 0.38, 0.0105, 0, 0];
  S.hmap = W.hmapInfo();
  // 木・岩・建物・キャラクターの影（太陽から見た深度マップ）
  S.shadow = G.settings.light ? null : { center: [0, 0, 0], radius: 44, strength: 0.85, bias: 0.18 };
  S.outlineDist = 75;
  OW.sky = new SkyRig(S, { light: G.settings.light, cloudR: 230, cloudY: 30 });
  OW.amb = new Ambient(S, { light: G.settings.light });
  OW.ruinFx = new RuinFx(S, W, G.settings.light);
  // 水面（浅瀬・泡・きらめきはシェーダーで）
  const wb = new GeoBuilder(); const WN = G.settings.light ? 40 : 64, WS = 4;
  for (let j = 0; j <= WN; j++) for (let i = 0; i <= WN; i++) wb._push((i - WN / 2) * WS, 0, (j - WN / 2) * WS, 0, 1, 0, [1, 1, 1]);
  for (let j = 0; j < WN; j++) for (let i = 0; i < WN; i++) { const a = j * (WN + 1) + i; wb.tri(a, a + WN + 1, a + 1); wb.tri(a + 1, a + WN + 1, a + WN + 2); }
  OW.water = new Node(wb.build(), { color: [1, 1, 1], alpha: 0.85, wave: 1, kind: 2, outline: 0, cloudShadow: 0 }); OW.water.cull = false; OW.water.noDepthWrite = true;
  S.add(OW.water);
  progress && progress(0.6, '町を建設中…');
  // 町と建物
  TOWNS.forEach((t, ti) => {
    const h = W.townH[ti];
    t.b.forEach(([type, dx, dz], bi) => {
      if (t.ruined && type === 'lighthouse') return;   // こわれた 灯台は がれきに
      const rc = t.ruined ? '#7a706a' : { forest: '#3c9a4a', lake: '#2a78d0', desert: '#d0a040', canyon: '#b0603a', snow: '#6ab0e0', swamp: '#6a5a9a', highland: '#e080c0', volcano: '#d04020', start: '#d0503c', sanctuary: '#c0a050' }[t.region] || '#c8643c';
      const B = buildBuilding(type, ti * 31 + bi, rc);
      const x = t.pos[0] + dx, z = t.pos[1] + dz;
      const n = new Node(B.geo, { mat: MAT.building }); n.setPos(x, h, z); S.add(n);
      // 第2部：こわれた 町（屋根が 落ち、かたむいて、がれきが 散らばる）
      if (t.ruined) { n.setScale(1, 0.58 + (bi % 3) * 0.1, 1); n.rot[2] = (bi % 2 ? 1 : -1) * 0.05; n.rot[0] = (bi % 3 - 1) * 0.04; n.setColor && n.setColor([0.78, 0.74, 0.72]); ruinRubble(S, W, x, z, B.w, B.d, ti * 17 + bi); }
      W.boxes.push({ x0: x - B.w / 2, x1: x + B.w / 2, z0: z - B.d / 2, z1: z + B.d / 2 });
      // 研究所・家は 前に立っている 博士・ママに 話しかければ いいので、入口は 名前を 出すだけ（同じ会話が 2つ出ないように）
      OW.trig.push({ kind: 'door', type, town: t.id, x: x + B.door[0], z: z + B.door[1], r: (type === 'lab' || type === 'home') ? 0 : 2.8, label: type === 'house' ? '' : (type === 'hall' ? t.name.replace(/町|村|里|集落|タウン|まち/, '') + 'の守護者の館' : BUILD_JA[type]), ly: B.h + 3, lx: x, lz: z, bi });
    });
    // 町の広場の飾り（噴水）
    const f = new GeoBuilder();
    f.cylinder(3.1, 3.5, 0.9, [0.86, 0.84, 0.8], 0, 0, 0, 16); f.cylinder(3.15, 3.15, 0.18, [0.95, 0.93, 0.9], 0, 0.9, 0, 16);
    f.cylinder(2.7, 2.7, 0.86, [0.4, 0.72, 0.98], 0, 0.02, 0, 16);
    f.cylinder(0.45, 0.6, 1.6, [0.9, 0.88, 0.85], 0, 0, 0, 10); f.cylinder(1.4, 0.5, 0.35, [0.92, 0.9, 0.86], 0, 1.6, 0, 12); f.cylinder(1.2, 1.2, 0.2, [0.45, 0.76, 1], 0, 1.75, 0, 12);
    f.cylinder(0.25, 0.35, 0.9, [0.9, 0.88, 0.85], 0, 1.9, 0, 8);
    // 街灯・ベンチ・花だん（広場のまわり）
    const lamp = (x, z) => { f.cylinder(0.12, 0.16, 3.4, [0.22, 0.24, 0.3], x, 0, z, 6); f.box(0.6, 0.12, 0.6, [0.22, 0.24, 0.3], x, 3.4, z); f.box(0.45, 0.55, 0.45, [1, 0.92, 0.6], x, 3.75, z); f.cone(0.45, 0.4, [0.22, 0.24, 0.3], x, 4.05, z, 4); };
    const bench = (x, z, ry) => { f.setMatrix(M4.fromTRS([x, 0, z], [0, ry, 0], [1, 1, 1])); f.box(2.2, 0.15, 0.7, [0.66, 0.44, 0.26], 0, 0.55, 0); f.box(2.2, 0.55, 0.12, [0.66, 0.44, 0.26], 0, 0.95, -0.3); for (const s of [-1, 1]) f.box(0.12, 0.55, 0.6, [0.25, 0.25, 0.3], s * 0.9, 0.27, 0); f.setMatrix(null); };
    const bed = (x, z) => { f.cylinder(1.2, 1.25, 0.45, [0.8, 0.78, 0.74], x, 0, z, 12); f.cylinder(1.05, 1.05, 0.5, [0.42, 0.3, 0.22], x, 0, z, 12); const cols = [[1, 0.42, 0.55], [1, 0.85, 0.3], [1, 1, 1], [0.75, 0.5, 1]]; for (let k = 0; k < 7; k++) { const a = k / 7 * Math.PI * 2; f.sphere(0.26, k % 3 === 2 ? [0.4, 0.75, 0.32] : cols[k % 4], x + Math.cos(a) * 0.65, 0.65, z + Math.sin(a) * 0.65, 6, 4); } f.sphere(0.32, [0.4, 0.75, 0.32], x, 0.75, z, 6, 4); };
    for (const [dx, dz] of [[-6.5, -6], [6.5, -6], [-6.5, 3], [6.5, 3]]) lamp(dx, dz);
    bench(0, 5.2, Math.PI); bench(-5.4, -2, Math.PI / 2); bench(5.4, -2, -Math.PI / 2);
    bed(-8.5, -1.5); bed(8.5, -1.5);
    const fn = new Node(f.build(), { mat: MAT.building }); fn.setPos(t.pos[0], h, t.pos[1] - 2); S.add(fn);
    for (const [dx, dz] of [[-6.5, -6], [6.5, -6], [-6.5, 3], [6.5, 3]]) { const lx = t.pos[0] + dx, lz = t.pos[1] - 2 + dz; W.boxes.push({ x0: lx - 0.3, x1: lx + 0.3, z0: lz - 0.3, z1: lz + 0.3 }); }
    const spout = new Node(PRIM.drop, { color: [0.75, 0.92, 1], alpha: 0.7, outline: 0, emis: [0.1, 0.2, 0.3] }); spout.setPos(t.pos[0], h + 2.6, t.pos[1] - 2); spout.setScale(0.35, 0.5, 0.35); if (t.ruined) spout.visible = false; S.add(spout); (OW.spouts ||= []).push(spout); W.boxes.push({ x0: t.pos[0] - 3, x1: t.pos[0] + 3, z0: t.pos[1] - 5, z1: t.pos[1] + 1 });
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
    const col = { ruins: [0.6, 0.62, 0.52], pyramid: [0.85, 0.72, 0.45], ice: [0.7, 0.85, 0.95], sky: [0.92, 0.92, 1], lava: [0.3, 0.25, 0.25], abyss: [0.35, 0.28, 0.5], meteor: [0.24, 0.2, 0.32] }[d.theme];
    if (d.theme === 'pyramid') { g.cone(9, 9, col, 0, 0, -4, 4); }
    else if (d.theme === 'sky') { for (let i = 0; i < 6; i++) g.cylinder(3.2 - i * 0.3, 3.4 - i * 0.3, 5, i % 2 ? [0.95, 0.9, 0.7] : col, 0, i * 5, -4, 10); }
    else { g.sphere(6, col, 0, 0, -4, 8, 5, 0.9); }
    g.box(1.4, 5, 1.4, mixRgb(col, [0, 0, 0], 0.2), -2.6, 2.5, 1.6); g.box(1.4, 5, 1.4, mixRgb(col, [0, 0, 0], 0.2), 2.6, 2.5, 1.6); g.box(7, 1.2, 1.6, mixRgb(col, [0, 0, 0], 0.2), 0, 5.4, 1.6);
    g.box(3.8, 4.6, 0.3, [0.03, 0.03, 0.05], 0, 2.3, 1.8);
    const n = new Node(g.build(), { mat: MAT.building }); n.setPos(x, h, z); S.add(n);
    W.boxes.push({ x0: x - 6, x1: x + 6, z0: z - 10, z1: z + 1 });
    OW.trig.push({ kind: 'dungeon', id, x, z: z + 3.5, r: 3, label: d.name + `（推奨Lv${d.rec}）`, baseLabel: d.name, rec: d.rec, ly: 8 });
  }
  // いにしえの祭壇（聖域の中央）と星の祭壇（奥地）
  for (const [ax, az, big] of [[ALTAR[0], ALTAR[1], 1], [0, 30, 0]]) {
    const h = W.heightAt(ax, az);
    const g = new GeoBuilder();
    g.cylinder(7, 7.6, 0.6, [0.88, 0.86, 0.8], 0, 0, 0, 16); g.cylinder(4.5, 4.8, 0.5, [0.95, 0.93, 0.88], 0, 0.6, 0, 16);
    for (let k = 0; k < 6; k++) { const a = k / 6 * Math.PI * 2; g.cylinder(0.45, 0.55, big ? 5 : 3.5, [0.9, 0.88, 0.82], Math.cos(a) * 6.4, 0.3, Math.sin(a) * 6.4, 8); g.box(1.4, 0.4, 1.4, [0.95, 0.85, 0.5], Math.cos(a) * 6.4, (big ? 5 : 3.5) + 0.4, Math.sin(a) * 6.4); }
    const n = new Node(g.build(), { mat: MAT.building }); n.setPos(ax, h - 0.2, az); S.add(n);
    const gem = new Node(PRIM.gem, { color: big ? [1, 0.75, 0.4] : [0.8, 0.7, 1], emis: big ? [0.5, 0.3, 0.1] : [0.4, 0.3, 0.7] }); gem.setScale(0.8, 1.6, 0.8); gem.setPos(ax, h + 3, az); S.add(gem);
    OW.trig.push({ kind: 'altar', x: ax, z: az, r: 0.1, label: big ? 'いにしえの祭壇' : '星の祭壇', ly: 6, gem });
  }
  // 第2部：隕石・噴煙・流れ星の かけら・時の扉
  buildP2Objects(S, W);
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
  W.buildAll(P.x, P.z, 140);
  // セーブした場所が 立てない所（水の上・結界の外・木の中など）なら 最後に寄った病院の前へ
  if (!spawnOk(P.x, P.z)) {
    const st = STONES.find(x => x.id === G.save.lastHospital) || STONES.find(x => x.id === 't_start');
    [P.x, P.z] = freeSpot(st.pos[0], st.pos[1] + 4); P.ry = 0;
    W.buildAll(P.x, P.z, 140);
  }
  P.y = W.heightAt(P.x, P.z);
  refreshFollower();
  OW.region = null; OW.dungeon = null;
  progress && progress(0.95, 'もうすぐ…');
}

// ---------- 第2部の 置きもの ----------
function ruinRubble(S, W, x, z, w, d, seed) {
  const r = mulberry32(seed * 97 + 5), g = new GeoBuilder();
  for (let k = 0; k < 9; k++) {
    const a = r() * Math.PI * 2, rr = Math.max(w, d) * (0.55 + r() * 0.5), bx = x + Math.cos(a) * rr, bz = z + Math.sin(a) * rr;
    const s = 0.4 + r() * 0.9, c = r() < 0.5 ? [0.56, 0.5, 0.46] : [0.4, 0.3, 0.26];
    g.setMatrix(M4.fromTRS([bx - x, W.heightAt(bx, bz) - W.heightAt(x, z) + s * 0.3, bz - z], [r(), r() * 6, r()], [1, 1, 1])).box(s * 1.4, s * 0.6, s, c, 0, 0, 0).setMatrix(null);
  }
  const n = new Node(g.build(), { mat: MAT.decor }); n.setPos(x, W.heightAt(x, z), z); S.add(n);
}
function buildP2Objects(S, W) {
  OW.plume = null; OW.meteor = null; OW.p2fx = [];
  const st = G.save.story || {};
  if (ERA.ruin) {
    // 隕石（クレーターの まんなか）
    const [mx, mz] = IMPACT, mh = W.heightAt(mx, mz);
    const root = new Node(); root.setPos(mx, mh, mz);
    const rr = mulberry32(42);
    for (let k = 0; k < 7; k++) { const a = k / 7 * Math.PI * 2, d = k ? 4.5 : 0, rk = new Node(PRIM.sphere, { color: [0.16, 0.13, 0.2] }); rk.setScale(k ? 3 + rr() * 2 : 7, k ? 2.5 + rr() * 2 : 6, k ? 3 + rr() * 2 : 7); rk.setPos(Math.cos(a) * d, k ? 1 : 3, Math.sin(a) * d - 3); rk.rot = [rr(), rr() * 6, rr()]; root.add(rk); }
    const gems = [];
    for (let k = 0; k < 9; k++) { const a = k / 9 * Math.PI * 2, g = new Node(PRIM.gem, { color: [0.75, 0.4, 1], emis: [0.45, 0.2, 0.7], mat: MAT.glossy }); g.setScale(0.8 + rr() * 0.8, 2.4 + rr() * 2.4, 0.8 + rr() * 0.8); g.setPos(Math.cos(a) * (2 + rr() * 4), 6 + rr() * 3, Math.sin(a) * (2 + rr() * 4) - 3); g.rot = [Math.cos(a) * 0.5, 0, Math.sin(a) * 0.5]; root.add(g); gems.push(g); }
    S.add(root); OW.meteor = { root, gems };
    W.boxes.push({ x0: mx - 9, x1: mx + 9, z0: mz - 12, z1: mz + 5 });
    // 火山の 噴煙（灰色の けむりが 立ちのぼる）と 火口の 光
    const vh = W.heightAt(VOLCANO_C[0], VOLCANO_C[1]);
    const glow = new Node(PRIM.sphereHi, { color: [1, 0.45, 0.1], emis: [1, 0.4, 0.08], unlit: true, outline: 0 }); glow.setScale(12, 4, 12); glow.setPos(VOLCANO_C[0], vh + 2, VOLCANO_C[1]); S.add(glow);
    const puffs = [];
    for (let k = 0; k < 16; k++) { const p = new Node(PRIM.sphere, { color: k % 3 ? [0.32, 0.3, 0.32] : [0.5, 0.46, 0.46], alpha: 0.55, outline: 0, cloudShadow: 0 }); p.noDepthWrite = true; S.add(p); puffs.push({ n: p, ph: k / 16, k }); }
    OW.plume = { base: [VOLCANO_C[0], vh + 4, VOLCANO_C[1]], puffs, glow };
  }
  // 流れ星の かけら（第1部 クリア後・第2部の 前）
  const endI = STEPS.findIndex(s => s.id === 'end');
  if (!G.save.era && st.step >= endI) {
    const [x, z] = P2_START, h = W.heightAt(x, z);
    const gem = new Node(PRIM.gem, { color: [0.85, 0.5, 1], emis: [0.6, 0.3, 0.9], mat: MAT.glossy }); gem.setScale(0.7, 1.4, 0.7); gem.setPos(x, h + 1.4, z); S.add(gem);
    const ring = new Node(PRIM.torus, { color: [0.9, 0.7, 1], emis: [0.5, 0.35, 0.7], unlit: true, outline: 0 }); ring.setScale(1.6, 0.3, 1.6); ring.setPos(x, h + 0.2, z); S.add(ring);
    OW.trig.push({ kind: 'p2start', x, z, r: 3.2, gem, label: 'あやしい 流れ星の かけら', ly: 3 });
  }
  buildGates(S, W);
}
function buildGates(S, W) {
  const st = G.save.story || {};
  // 時の扉
  if (st.flags && st.flags.gates) {
    for (const g of TIME_GATES) {
      const [x, z] = g.pos, h = W.heightAt(x, z);
      const ring = new Node(PRIM.torus, { color: [0.5, 0.95, 1], emis: [0.3, 0.7, 0.8], mat: MAT.glossy, outline: 0.6 }); ring.setScale(2.4, 1.4, 2.4); ring.rot = [Math.PI / 2, 0, 0]; ring.setPos(x, h + 2.6, z);
      const disc = new Node(PRIM.disc, { color: ERA.ruin ? [0.6, 0.9, 1] : [1, 0.85, 0.5], alpha: 0.7, unlit: true, outline: 0 }); disc.doubleSide = true; disc.noDepthWrite = true; disc.setScale(2.1, 1, 2.1); disc.rot = [Math.PI / 2, 0, 0]; disc.setPos(x, h + 2.6, z);
      S.add(ring); S.add(disc);
      W.boxes.push({ x0: x - 0.6, x1: x + 0.6, z0: z - 0.3, z1: z + 0.3 });
      OW.trig.push({ kind: 'gate', id: g.id, x, z: z + 2.2, r: 3, ring, disc, label: ERA.ruin ? '時の扉（過去へ）' : '時の扉（現在へ）', ly: 5.6 });
    }
  }
}
export function rebuildP2Objects() {
  for (const t of OW.trig.filter(x => x.kind === 'gate')) { t.ring.parent?.remove(t.ring); t.disc.parent?.remove(t.disc); }
  OW.trig = OW.trig.filter(x => x.kind !== 'gate');
  buildGates(OW.scene, G.world);
}
function updateP2(dt) {
  if (OW.meteor) for (const [i, g] of OW.meteor.gems.entries()) { const e = 0.35 + 0.25 * Math.sin(OW.t * 2 + i); g.emis = [e, e * 0.45, e * 1.5]; }
  if (OW.plume) {
    const P = OW.plume;
    for (const p of P.puffs) {
      p.ph = (p.ph + dt * 0.045) % 1;
      const t = p.ph, s = 6 + t * 26;
      p.n.setPos(P.base[0] + Math.sin(p.ph * 9 + p.k) * 6 + t * 40, P.base[1] + t * 120, P.base[2] + Math.cos(p.ph * 7) * 6 + t * 30);
      p.n.setScale(s, s * 0.8, s); p.n.color[3] = 0.55 * (1 - t) * Math.min(1, t * 6);
    }
    const g = 0.8 + 0.2 * Math.sin(OW.t * 3); P.glow.emis = [g, g * 0.4, 0.08];
  }
  for (const t of OW.trig) {
    if (t.kind === 'p2start') { t.gem.rot[1] += dt * 1.2; t.gem.pos[1] = G.world.heightAt(t.x, t.z) + 1.4 + Math.sin(OW.t * 2) * 0.25; }
    else if (t.kind === 'gate') { const k = 2.05 + Math.sin(OW.t * 2.4) * 0.12; t.disc.setScale(k, 1, k); t.disc.color[3] = 0.55 + Math.sin(OW.t * 3) * 0.15; }
  }
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
// その 時代に いる 人か（第2部：消えた 町の 人は 過去にだけ・第2部の 人は 現在にだけ）
function eraOk(d) {
  if (d.era === 'now') return !!ERA.ruin;
  if (d.era === 'past') return !ERA.ruin;
  if (ERA.ruin && goneAt(d.pos)) return false;
  return true;
}
function makeNpc(def, look) {
  if (def.sp) {
    // アニモンの NPC（トキワタリ など）
    const M = buildAnimon(BY_NAME[def.sp].id, false); const W = G.world;
    const x = def.pos[0], z = def.pos[1];
    M.root.setPos(x, W.groundAt(x, z) + (M.sp.plan === 'blob' ? 0.6 : 0), z); M.root.rot[1] = def.ry ?? 0;
    OW.scene.add(M.root);
    return { ...def, M, x, z };
  }
  const lk = typeof look === 'string' ? (LOOKS[look] || randomLook(mulberry32(hashStr(look)))) : look;
  const H = buildHuman(lk, { lazy: true });
  const W = G.world;
  const x = def.pos[0], z = def.pos[1];
  H.root.setPos(x, W.groundAt(x, z), z); H.root.rot[1] = def.ry ?? 0;
  OW.scene.add(H.root);
  const sh = new Node(PRIM.disc, { color: [0, 0, 0], alpha: 0.25, unlit: true }); sh.noDepthWrite = true; sh.setScale(0.7); sh.setPos(x, W.groundAt(x, z) + 0.05, z); OW.scene.add(sh);
  return { ...def, H, x, z, shadow: sh };
}
export function refreshActors() {
  if (OW.dungeon) return;
  // 人（H）・アニモン（M）・光る しるしだけ（marker：サイドストーリーの 探しもの）の どれでも 片付けられるように
  for (const n of OW.npcs) { const r = n.H ? n.H.root : n.M ? n.M.root : null; if (r) OW.scene.root.remove(r); if (n.shadow) OW.scene.root.remove(n.shadow); if (n.marker) OW.scene.root.remove(n.marker); }
  OW.npcs = [];
  const si = G.save.story.step;
  const idx = (id) => id === null || id === undefined ? null : STEPS.findIndex(s => s.id === id);
  for (const d of NPCS) {
    if (d.show) { const a = idx(d.show[0]), b = idx(d.show[1]); if (a !== null && si < a) continue; if (b !== null && si >= b) continue; }
    if (!eraOk(d)) continue;
    OW.npcs.push(makeNpc({ ...d, kind: 'npc' }, d.look));
  }
  // 道ばたのトレーナー
  for (const t of OW.routeTr) {
    if (!isUnlocked(t.region)) continue;
    if (t.p2 ? !ERA.ruin : (ERA.ruin && (RUINED.has(t.region) || goneAt(t.pos)))) continue;
    const look = randomLook(mulberry32(t.seed * 13));
    OW.npcs.push(makeNpc({ id: t.id, name: t.name, pos: t.pos, ry: (t.seed % 4) * Math.PI / 2, kind: 'trainer', tr: t }, look));
  }
  // サイドストーリー
  for (const q of QUESTS) {
    const st = G.save.quests[q.id];
    const reqI = idx(q.req);
    if (!st && si < reqI) continue;
    if (q.hidden && !st) continue;   // 隠しミッションは 見つけるまで 出ない
    if (!eraOk({ era: q.era, pos: q.giver.pos })) continue;
    // 同じ 人（同じ 名前）が すぐ 近くに もう 立っている ときは、2人に ならないように その 人が サイドストーリーも 受けもつ
    const host = OW.npcs.find(n => n.kind === 'npc' && n.name === q.giver.name && Math.hypot(n.x - q.giver.pos[0], n.z - q.giver.pos[1]) < 14);
    if (host) host.mergedQuest = q;
    else OW.npcs.push(makeNpc({ id: 'giver_' + q.id, name: q.giver.name, pos: q.giver.pos, ry: 0, kind: 'giver', quest: q }, q.giver.look));
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
  // 町の住民・通行人（おつかい）
  for (const g of ERRAND_GIVERS) {
    if (!ER.giverTownUnlocked(g)) continue;
    const spot = errandSpot(g);
    if (!spot) continue;
    const n = makeNpc({ id: g.id, name: g.name, pos: spot.pos, ry: spot.ry, kind: 'errand', giver: g }, g.look);
    if (spot.path) { n.path = spot.path; n.pi = spot.pi || 0; n.wait = 1 + Math.random() * 2; }
    OW.npcs.push(n);
  }
  // シーンで出したもの
  for (const k in OW.spawned) { const sp = OW.spawned[k]; if (!sp.root.parent) OW.scene.add(sp.root); }
}

// 住民の立つ場所・通行人の散歩道を 町の中から さがす（建物・入口・ほかの人と 重ならない）
const errSpots = {};
function errandSpot(g) {
  if (errSpots[g.id]) return errSpots[g.id];
  const t = TOWNS.find(x => x.id === g.town); if (!t) return null;
  const W = G.world, [cx, cz] = t.pos;
  const free = (x, z, rad = 1.1) => {
    if (W.blockedByObst(x, z, rad)) return false;
    if (W.heightAt(x, z) < -0.3) return false;
    if (Math.hypot(x - cx, z - cz) > t.r - 5) return false;
    for (const tr of OW.trig) if (Math.hypot(tr.x - x, tr.z - z) < 3.4) return false;
    for (const n of OW.npcs) if (Math.hypot(n.x - x, n.z - z) < 3.2) return false;
    for (const id in errSpots) { const o = errSpots[id]; if (o.path) { for (const q of o.path) if (Math.hypot(q[0] - x, q[1] - z) < 2.5) return false; } else if (Math.hypot(o.pos[0] - x, o.pos[1] - z) < 3.2) return false; }
    return true;
  };
  const r = mulberry32(hashStr(g.id));
  if (g.walk) {
    // 広場を ぐるっと 回る 6角形の道（途中も 通れるか 確かめる）
    for (const R of [12, 15, 10, 18, 8, 21]) {
      const a0 = r() * Math.PI * 2, pts = [];
      for (let k = 0; k < 6; k++) { const a = a0 + k / 6 * Math.PI * 2; pts.push([cx + Math.cos(a) * R, cz + Math.sin(a) * R]); }
      let ok = true;
      for (let k = 0; k < 6 && ok; k++) {
        const A = pts[k], B = pts[(k + 1) % 6], L = Math.hypot(B[0] - A[0], B[1] - A[1]);
        for (let d = 0; d <= L; d += 1.2) { const x = A[0] + (B[0] - A[0]) * d / L, z = A[1] + (B[1] - A[1]) * d / L; if (W.blockedByObst(x, z, 0.8) || W.heightAt(x, z) < -0.3 || Math.hypot(x - cx, z - cz) > t.r - 4) { ok = false; break; } }
      }
      if (ok) return (errSpots[g.id] = { pos: pts[0], ry: 0, path: pts, pi: 1 });
    }
  }
  for (let k = 0; k < 80; k++) {
    const a = r() * Math.PI * 2, R = 10 + r() * (t.r - 16);
    const x = cx + Math.cos(a) * R, z = cz + Math.sin(a) * R;
    if (!free(x, z)) continue;
    return (errSpots[g.id] = { pos: [x, z], ry: Math.atan2(cx - x, cz - z) });
  }
  return null;
}

// 通行人の散歩（話しかけられる距離に プレイヤーがいると 立ち止まる）
function walkNpc(n, dt) {
  const P = OW.player;
  if (G.busy || Math.hypot(P.x - n.x, P.z - n.z) < 3.4) return false;
  if (n.wait > 0) { n.wait -= dt; return false; }
  const tg = n.path[n.pi], dx = tg[0] - n.x, dz = tg[1] - n.z, d = Math.hypot(dx, dz);
  if (d < 0.3) { n.pi = (n.pi + 1) % n.path.length; n.wait = Math.random() < 0.35 ? 1 + Math.random() * 2.5 : 0; return false; }
  const sp = 1.6, st = Math.min(d, sp * dt);
  n.x += dx / d * st; n.z += dz / d * st;
  const W = G.world, y = W.groundAt(n.x, n.z);
  const want = Math.atan2(dx, dz); n.H.root.rot[1] += angleDiff(n.H.root.rot[1], want) * Math.min(1, dt * 8);
  n.H.root.setPos(n.x, y, n.z);
  if (n.shadow) n.shadow.setPos(n.x, y + 0.05, n.z);
  animateHuman(n.H, dt, 'walk', 0.9);
  return true;
}

// ---------- 連れ歩き ----------
export function refreshFollower() {
  if (OW.follower) { OW.follower.root.parent?.remove(OW.follower.root); OW.follower = null; }
  const lead = G.save.party.find(m => m.hp > 0) || G.save.party[0];
  if (!lead || !OW.scene) return;
  const M = buildAnimon(lead.sp, lead.shiny, { lod: 'mid' });
  // 連れ歩きは本来の大きさ（大きすぎる子だけ少し小さく）
  const s = Math.min(1, 2.3 / Math.max(0.6, M.height));
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
  const M = buildAnimon(mon.sp, mon.shiny, { lod: 'mid' });
  const sc = clamp(2.5 / M.height, 1.0, 2.6) * (sp.legend ? 0.75 : 1) * (M.rideBoost || 1);
  M.root.setScale(sc);
  P.rideM = M; P.rideSp = mon.sp; P.rideScale = sc; P.rideH = M.height * sc; P.rideUid = mon.uid;
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
  P.rideM = null; P.rideSp = null; P.rideUid = null; OW.mode = 'walk';
  if (OW.follower) OW.follower.root.visible = true;
  return true;
}
function curScene() { return OW.dungeon ? OW.dscene : OW.scene; }
// キャラメイクで 見た目を かえたとき：主人公の モデルを 作りなおす
export function applyPlayerLook() {
  const P = OW.player; if (!P || !P.H) return;
  const old = P.H, parent = old.root.parent;
  const H = buildHuman(G.save.look);
  H.root.pos = old.root.pos.slice(); H.root.rot = old.root.rot.slice();
  if (parent) { parent.remove(old.root); parent.add(H.root); } else curScene().add(H.root);
  P.H = H;
}

// ---------- 地域レベル ----------
// ダンジョンの 周回：クリアするたびに 少しずつ 強くなる（最大 +10）
export const dungeonRuns = (id) => (G.save.runs || {})[id] || 0;
const runBonus = (id) => Math.min(10, dungeonRuns(id) * 2);
export function levelRangeAt(x, z) {
  if (OW.dungeon) { const [a, b] = DUNGEONS[OW.dungeon.id].lv, k = runBonus(OW.dungeon.id); return [Math.min(99, a + k), Math.min(99, b + k)]; }
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
  const max = OW.dungeon || repelOn() ? 0 : (G.settings.light ? 4 : 8);
  // むしよけスプレー中は 歩いている 野生の アニモンも 去っていく
  if (repelOn() && OW.wilds.length) { for (const w of OW.wilds) OW.scene.root.remove(w.M.root); OW.wilds = []; }
  // 出現
  OW.spawnT = (OW.spawnT || 0) - dt;
  if (OW.wilds.length < max && OW.spawnT <= 0 && !OW.inTown) {
    OW.spawnT = 0.6;
    const a = Math.random() * Math.PI * 2, d = 24 + Math.random() * 26;
    const x = P.x + Math.cos(a) * d, z = P.z + Math.sin(a) * d;
    const reg = W.regionAt(x, z);
    const info = W.cellInfo(x, z);
    const h = W.heightAt(x, z);
    if (isUnlocked(reg) && !info.flat && !(reg === 'start' && Math.hypot(x - START_POS[0], z - START_POS[1]) < 60) && !nearPeople(x, z, 10)) {
      const water = h < -0.8;
      if (!water && W.blockedByObst(x, z, 0.8)) return;
      const w = rollWild(reg === 'sea' ? 'sea' : reg, water, x, z);
      if (w) {
        // 体の大きさに合わせた広さがある場所にだけ出る（大きい子は開けた場所・水辺の広いところ）
        const big = SPECIES[w.sp].legend ? 2.4 : (DESIGN[SPECIES[w.sp].name]?.s || 1);
        const room = 0.6 + big * 0.9;
        if (!water && big > 1.2) {
          for (const [ox, oz] of [[room, 0], [-room, 0], [0, room], [0, -room]]) if (W.blockedByObst(x + ox, z + oz, 0.5) || W.heightAt(x + ox, z + oz) < -0.4) return;
          if (Math.abs(W.heightAt(x + room, z) - W.heightAt(x - room, z)) > room * 0.9) return;
        }
        if (water && big > 1.2 && [[room, 0], [-room, 0], [0, room], [0, -room]].some(([ox, oz]) => W.heightAt(x + ox, z + oz) > -0.8)) return;
        const mon = createMon(w.sp, w.lv);
        const M = buildAnimon(w.sp, mon.shiny, { lod: 'mid' });
        M.root.setPos(x, water ? -0.3 : h, z);
        OW.scene.add(M.root);
        OW.wilds.push({ mon, M, x, z, hx: x, hz: z, tx: x, tz: z, water, t: 0, life: 70, sparkle: 0, big, room });
      }
    }
  }
  for (let i = OW.wilds.length - 1; i >= 0; i--) {
    const w = OW.wilds[i];
    w.t -= dt; w.life -= dt;
    if (w.t <= 0) { w.t = 2 + Math.random() * 4; const a = Math.random() * Math.PI * 2, r = Math.random() * (6 + w.big * 4); w.tx = w.hx + Math.cos(a) * r; w.tz = w.hz + Math.sin(a) * r; }
    const dx = w.tx - w.x, dz = w.tz - w.z, l = Math.hypot(dx, dz);
    let moving = false;
    if (l > 0.3) {
      // 小さい子はちょこちょこ、大きい子はのっしのっし
      const sp = (1.5 + Math.min(w.big, 2.4) * 0.7) * dt; const nx = w.x + dx / l * sp, nz = w.z + dz / l * sp;
      const h = W.heightAt(nx, nz);
      if ((w.water ? h < -0.6 : (h > -0.3 && !W.blockedByObst(nx, nz, 0.3 + w.big * 0.35))) && isUnlocked(W.regionAt(nx, nz)) && !nearPeople(nx, nz, 7)) { w.x = nx; w.z = nz; moving = true; w.M.root.rot[1] = Math.atan2(dx, dz); } else w.t = 0;
    }
    w.M.root.setPos(w.x, w.water ? -0.35 : W.heightAt(w.x, w.z), w.z);
    animateAnimon(w.M, dt, moving ? 'walk' : 'idle', moving ? 1.25 / Math.sqrt(Math.max(0.5, w.big)) : 1);
    if (w.mon.shiny) {
      w.sparkle -= dt; if (w.sparkle <= 0) { w.sparkle = 0.25; sparkleAt(w.x, W.heightAt(w.x, w.z) + w.M.height, w.z); }
      // 近くに 色違いが 現れたら 1回だけ キラーン！
      if (!w.glinted && Math.hypot(w.x - P.x, w.z - P.z) < 34 && !G.busy) {
        w.glinted = true;
        const top = [w.x, W.heightAt(w.x, w.z) + w.M.height * 0.8, w.z], R = G.renderer, q = OW.cam.project(top, R.cssW, R.cssH);
        for (let k = 0; k < 10; k++) sparkleAt(top[0], top[1] - 0.5, top[2]);
        audio.sfx('kiran');
        if (q[2] > 0 && q[0] > 0 && q[0] < R.cssW && q[1] > 0 && q[1] < R.cssH) glintAt(q[0], q[1]);
        toast(`✨ キラーン！ 色違いの ${SPECIES[w.mon.sp].name} が いる！`, 3200);
      }
    }
    const pd = Math.hypot(w.x - P.x, w.z - P.z);
    if (pd > 80 || w.life <= 0) { OW.scene.root.remove(w.M.root); OW.wilds.splice(i, 1); continue; }
    if (!G.busy && OW.mode !== 'fly' && !OW.noEnc && pd < 1.1 + w.big * 0.8 && OW.encCool <= 0) {
      OW.scene.root.remove(w.M.root); OW.wilds.splice(i, 1);
      runFlow(async () => { await startWildBattle(w.mon, { biome: biomeHere(), water: w.water }); });
      return;
    }
  }
}
// 野生の アニモンは 町の中や 人（トレーナー・住民）の すぐ そばには 出ない・近づかない
//  （トレーナーの 横を 歩く 野生の子を「トレーナーの アニモン」と まちがえて つかまえられて しまわないように）
function nearPeople(x, z, r) {
  for (const t of TOWNS) if (Math.hypot(x - t.pos[0], z - t.pos[1]) < t.r + 6) return true;
  for (const n of OW.npcs) if (Math.hypot(x - n.x, z - n.z) < r) return true;
  return false;
}
// ---------- むしよけスプレー（のこり時間は 秒。遊んでいる あいだだけ 減る） ----------
export function repelLeft() { return Math.max(0, G.save?.repel || 0); }
export function repelOn() { return repelLeft() > 0; }
export function tickRepel(dt) {
  if (!G.save || !(G.save.repel > 0)) return;
  G.save.repel = Math.max(0, G.save.repel - dt);
  if (G.save.repel <= 0) {
    G.save.repel = 0;
    const left = G.save.bag?.repel || 0;
    toast(`🧴 むしよけスプレーの 効きめが きれた！${left ? `（あと ${left}個 持っている。バッグの「どうぐ」から 使える）` : ''}`, 4200);
  }
}
// ---------- ふしぎなアメ（大陸の どこかに まれに 光って 落ちている） ----------
//  ・フィールドの ランダムな 場所（道に かぎらない）に、ときどき 1つだけ 光る アメが 出る（同時に 1つまで）
//  ・出る数：遊んでいる 時間 2時間あたり 最大 5個（フィールドを 歩いて 30秒ごとに 2.5%＝平均 20分に 1回ほど）
//  ・ミニマップ・大陸マップには 表示しない（光と キラキラを 見つけて 拾う）
export const CANDY_MAX = 5, CANDY_WINDOW = 7200;
const CANDY = { node: null, x: 0, z: 0, life: 0, t: 0 };
function updateCandy(dt) {
  const P = OW.player, W = G.world;
  if (CANDY.node) {
    CANDY.life -= dt;
    const h = W.groundAt(CANDY.x, CANDY.z);
    CANDY.node.setPos(CANDY.x, h + 0.9 + Math.sin(OW.t * 3) * 0.15, CANDY.z); CANDY.node.rot[1] += dt * 2.5;
    if (CANDY.beam) { CANDY.beam.setPos(CANDY.x, h, CANDY.z); CANDY.beam.setScale(0.35, 7, 0.35); CANDY.beam.color[3] = 0.22 + Math.sin(OW.t * 4) * 0.1; }
    if ((CANDY.spk -= dt) <= 0) { CANDY.spk = 0.35; sparkleAt(CANDY.x, h + 0.9, CANDY.z); }
    const d = Math.hypot(P.x - CANDY.x, P.z - CANDY.z);
    if (CANDY.life <= 0 || d > 130) { removeCandy(); return; }
    // 近づくと 自動で 拾う（乗っていても OK）
    if (d < 1.8 && !G.busy && G.state === 'world' && OW.mode !== 'fly') pickCandy();
    return;
  }
  if (OW.inTown || G.busy || OW.mode === 'fly') return;
  CANDY.t += dt;
  if (CANDY.t < 30) return;
  CANDY.t = 0;
  const S = G.save; const now = S.playTime || 0;
  S.candyLog = (S.candyLog || []).filter(t => now - t < CANDY_WINDOW);
  if (S.candyLog.length >= CANDY_MAX) { CANDY.force = false; return; }
  if (!CANDY.force && Math.random() > 0.025) return;
  CANDY.force = false;
  // フィールドの ランダムな 場所（25〜70m 先・歩いて 行ける 陸地）
  for (let k = 0; k < 60; k++) {
    const a = Math.random() * Math.PI * 2, d = 25 + Math.random() * 45;
    const x = P.x + Math.cos(a) * d, z = P.z + Math.sin(a) * d;
    const info = W.cellInfo(x, z);
    if (info.flat || !isUnlocked(info.region) || info.region === 'sea' || W.heightAt(x, z) < -0.2 || W.blockedByObst(x, z, 0.8) || nearPeople(x, z, 5)) continue;
    const n = new Node(PRIM.gem, { color: [1, 0.55, 0.85], emis: [0.85, 0.35, 0.7] }); n.setScale(0.5, 0.65, 0.5);
    // 近くまで 来れば 見つけられるように 光の柱（地図には 出さない）
    const beam = new Node(PRIM.cyl, { color: [1, 0.7, 0.95], unlit: true, alpha: 0.35, castShadow: false }); beam.transparent = true; beam.noDepthWrite = true;
    OW.scene.add(n); OW.scene.add(beam);
    Object.assign(CANDY, { node: n, beam, x, z, life: 300, spk: 0 });
    S.candyLog.push(now);
    return;
  }
}
function removeCandy() { if (CANDY.node) { CANDY.node.parent?.remove(CANDY.node); CANDY.node = null; } if (CANDY.beam) { CANDY.beam.parent?.remove(CANDY.beam); CANDY.beam = null; } }
function pickCandy() {
  removeCandy();
  addItem('candy', 1); audio.sfx('item');
  toast('✨ 光っていた ふしぎなアメ を 拾った！（バッグの「どうぐ」から アニモンに 使える）', 3600);
  save();
}
export function candyHere() { return CANDY.node ? { x: CANDY.x, z: CANDY.z } : null; }
// 確認用（コンソールから ANIMON.debugCandy()）：次の 判定で 必ず 出す
export function debugCandy() { CANDY.t = 999; CANDY.force = true; }
const sparks = [];
function sparkleAt(x, y, z) {
  const n = new Node(PRIM.star, { color: [1, 0.95, 0.5], unlit: true, alpha: 1 }); n.doubleSide = true; n.noDepthWrite = true; n.setScale(0.35);
  n.setPos(x + (Math.random() - 0.5) * 1.5, y + Math.random(), z + (Math.random() - 0.5) * 1.5);
  curScene().add(n); sparks.push({ n, life: 0.8 });
}
export function biomeHere() {
  if (OW.dungeon) return DUNGEONS[OW.dungeon.id].theme;
  const P = OW.player; const r = G.world.regionAt(P.x, P.z);
  if (G.world.heightAt(P.x, P.z) < -0.6 && r !== 'lavaland') return 'sea';
  if (ERA.ruin && RUINED.has(r)) return 'ruin_' + r;
  return r;
}

// ---------- 流れの管理 ----------
export async function runFlow(fn) {
  if (G.busy) return;
  G.busy = true;
  try { await fn(); } catch (e) {
    console.error(e); toast('エラーが発生しました: ' + e.message);
    // 途中で 止まっても 画面が 真っ暗のまま・会話が 出たままに ならないように 片付ける
    try { const f = $('#fade'); f.style.transitionDuration = '300ms'; f.style.opacity = 0; $('#narr').classList.remove('on'); $('#letterbox').classList.remove('on'); $('#dialog').classList.add('hidden'); } catch (er) { /* */ }
  }
  G.busy = false;
  Input.clearEdges();
  OW.encCool = 2.5;
  // 念のため：処理が 終わったのに 暗転が 残っていたら 戻す
  setTimeout(() => { if (!G.busy && G.state === 'world') { const f = $('#fade'); if (f && +getComputedStyle(f).opacity > 0.5) { f.style.transitionDuration = '300ms'; f.style.opacity = 0; } } }, 900);
}

// ---------- メインの更新 ----------
// ---------- 視点の操作（ドラッグ・Q/Eキー・コンパスボタン） ----------
const PITCH0 = Math.atan2(9.6, 19.5);   // フィールドの基本の見下ろし角
const PITCH_D0 = Math.atan2(17.5, 10.5); // ダンジョン
function camPitch(dungeon) {
  return dungeon ? clamp(PITCH_D0 + (OW.camPitchAdj || 0), 0.8, 1.38) : clamp(PITCH0 + (OW.camPitchAdj || 0), 0.16, 1.3);
}
export function resetCamera() { OW.camYaw = 0; OW.camPitchAdj = 0; }
function updateCamControl(dt) {
  if (OW.camYaw === undefined) { OW.camYaw = 0; OW.camYawS = 0; OW.camPitchAdj = 0; }
  const canTurn = !OW.camOverride && G.state === 'world' && !document.querySelector('#screens .screen');
  const dx = Input.camDX, dy = Input.camDY; Input.camDX = 0; Input.camDY = 0;
  if (canTurn) {
    // 感度は 設定で 変えられる（左右・上下・反転）
    const S = G.settings, kx = (S.camSens ?? 1) * (S.camInvX ? -1 : 1), ky = (S.camSensY ?? 1) * (S.camInvY ? -1 : 1);
    const sens = Input.touch ? 0.0052 : 0.006;
    OW.camYaw -= dx * sens * kx;
    OW.camPitchAdj = clamp((OW.camPitchAdj || 0) + dy * sens * 0.5 * ky, -0.35, 0.6);
    if (Input.keys.has('camL')) OW.camYaw += dt * 2.2 * kx;
    if (Input.keys.has('camR')) OW.camYaw -= dt * 2.2 * kx;
    if (Input.keys.has('camUp')) OW.camPitchAdj = clamp(OW.camPitchAdj + dt * 0.8 * ky, -0.35, 0.6);
    if (Input.keys.has('camDown')) OW.camPitchAdj = clamp(OW.camPitchAdj - dt * 0.8 * ky, -0.35, 0.6);
    if (Input.edge('camReset')) resetCamera();
  }
  // なめらかに追いつく（角度は近い方向で）
  const diff = angleDiff(OW.camYawS, OW.camYaw);
  OW.camTurning = Math.abs(diff) > 0.01 || Math.abs(dx) + Math.abs(dy) > 0;
  OW.camYawS += diff * Math.min(1, dt * 14);
  // コンパス（北を指す）
  const cb = document.getElementById('btnCam');
  if (cb) { const n = cb.querySelector('.needle'); if (n) n.style.transform = `rotate(${(OW.camYawS * 180 / Math.PI).toFixed(1)}deg)`; }
}

export function updateOverworld(dt) {
  const P = OW.player; if (!P) return;
  OW.t += dt;
  const W = G.world;
  const D = OW.dungeon;
  OW.encCool = Math.max(0, OW.encCool - dt);
  if (!D) pumpHumans(P.x, P.z);
  let moved = 0;
  if (!G.busy && G.state === 'world') {
    const mv = readMove();
    // 画面の上下左右 → 視点の向きに合わせた地面の方向
    { const cy = Math.cos(OW.camYawS || 0), sy = Math.sin(OW.camYawS || 0); const x = mv.x * cy + mv.z * sy, z = -mv.x * sy + mv.z * cy; mv.x = x; mv.z = z; }
    if (mv.mag > 0) {
      const run = Input.run && OW.mode === 'walk';
      const spd = (OW.mode === 'walk' ? (run ? SPEED.run : SPEED.walk) : SPEED[OW.mode]) * Math.max(0.35, mv.mag);
      let nx = P.x + mv.x * spd * dt, nz = P.z + mv.z * spd * dt;
      const ok = (x, z) => canStand(x, z);
      if (ok(nx, nz)) { moved = Math.hypot(nx - P.x, nz - P.z); P.x = nx; P.z = nz; }
      else if (ok(nx, P.z)) { moved = Math.abs(nx - P.x); P.x = nx; }
      else if (ok(P.x, nz)) { moved = Math.abs(nz - P.z); P.z = nz; }
      // 動こうとしても まったく 動けず、今いる 場所が 建物・岩の 中なら、近くの 歩ける 場所へ 出す
      if (moved > 0) OW.stuckT = 0;
      else if ((OW.stuckT = (OW.stuckT || 0) + dt) > 1.2 && !standable(P.x, P.z, 0.3)) {
        OW.stuckT = 0;
        if (OW.dungeon) { P.x = OW.dungeon.entrance[0]; P.z = OW.dungeon.entrance[1] - 1.6; }
        else { const f = freeSpot(P.x, P.z); P.x = f[0]; P.z = f[1]; }
      }
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
    if (Input.wheel) { OW.zoom = clamp(OW.zoom + Input.wheel * 0.1 * (G.settings.zoomSens ?? 1), 0.55, 1.7); Input.wheel = 0; }
  } else P.state = P.state === 'walk' || P.state === 'run' ? 'idle' : P.state;
  updateCamControl(dt);

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
    const RM = P.rideM, sc = P.rideScale || 1;
    RM.root.setPos(P.x, P.y, P.z); RM.root.rot[1] = P.ry;
    animateAnimon(RM, dt, OW.mode === 'fly' ? 'fly' : (P.state !== 'idle' ? 'run' : 'idle'));
    // 背中の 高さ（モデルの 形から 計算した 値）に 腰を おろす。上下の ゆれ（走る・飛ぶ）にも ついていく
    const plan = SPECIES[P.rideSp].plan;
    const seatY = (RM.seatY ?? RM.height * (plan === 'biped' || plan === 'golem' ? 0.62 : 0.72)) * sc + RM.pivot.pos[1] * sc;
    const seatZ = (RM.seatZ ?? 0) * sc;
    P.H.root.setPos(P.x + Math.sin(P.ry) * seatZ, P.y + seatY - RIDE_HIP, P.z + Math.cos(P.ry) * seatZ);
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
    if (n.path && n.H) { if (walkNpc(n, dt)) continue; }
    if (n.H) animateHuman(n.H, dt, 'idle');
    if (n.M) animateAnimon(n.M, dt, 'idle');
    if (n.marker) { n.marker.rot[1] += dt * 2; }
  }
  for (const k in OW.spawned) { const s = OW.spawned[k]; if (s.M) animateAnimon(s.M, dt, s.M.sp.legend ? 'fly' : 'idle'); if (s.H) animateHuman(s.H, dt, 'idle'); }
  for (let i = sparks.length - 1; i >= 0; i--) { const s = sparks[i]; s.life -= dt; s.n.pos[1] += dt * 1.2; s.n.rot[2] += dt * 4; s.n.color[3] = Math.max(0, s.life / 0.8); if (s.life <= 0) { s.n.parent?.remove(s.n); sparks.splice(i, 1); } }
  updateP2(dt);
  if (OW.fx && OW.fx.length) OW.fx = OW.fx.filter(f => { try { return f(dt) !== false; } catch (e) { console.warn(e); return false; } });
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
    const sky = OW.movieSky || (ERA.ruin && SKY_RUIN[reg]) || SKY[reg] || SKY.plains;
    if (!OW.skyCur) OW.skyCur = { bg: sky.bg.slice(), fog: sky.fog.slice() };
    for (let i = 0; i < 3; i++) { OW.skyCur.bg[i] = lerp(OW.skyCur.bg[i], sky.bg[i], dt); OW.skyCur.fog[i] = lerp(OW.skyCur.fog[i], sky.fog[i], dt); }
    OW.scene.bg = OW.skyCur.bg;
    // 遠くは空の地平線の色に溶けこませる（描画範囲の切れ目が見えないように）
    { const hz = OW.scene.horizon || OW.skyCur.fog; OW.scene.fogColor = [hz[0] * 0.7 + OW.skyCur.fog[0] * 0.3, hz[1] * 0.7 + OW.skyCur.fog[1] * 0.3, hz[2] * 0.7 + OW.skyCur.fog[2] * 0.3]; }
    const far = (G.settings.light ? 130 : 160) * Math.max(0.9, OW.zoom) * (OW.mode === 'fly' ? 1.3 : 1);
    OW.scene.fogNear = far * 0.4; OW.scene.fogFar = far;
    // 見えている範囲（カメラは南から北を見下ろす）に合わせて、描画範囲の中心を少し北へ
    const fx = -Math.sin(OW.camYawS || 0), fz = -Math.cos(OW.camYawS || 0); // 見ている方向（地面）
    OW.scene.cullCenter = [P.x + fx * 26 * OW.zoom, 0, P.z + fz * 26 * OW.zoom]; OW.scene.cullRadius = (OW.mode === 'fly' ? 160 : (G.settings.light ? 105 : 125)) * Math.max(0.9, OW.zoom);
    // ムービーで 遠くを 見せる ときは、見ている 場所の まわりを 広く 描く
    { const co = OW.camOverride; if (co && co.wide) { OW.scene.cullCenter = [co.look[0], 0, co.look[2]]; OW.scene.cullRadius = co.wide; OW.scene.fogNear = co.wide * 0.7; OW.scene.fogFar = co.wide * 1.7; } }
    if (OW.scene.shadow) { const sh = OW.scene.shadow; sh.center = [P.x + fx * 6, W.heightAt(P.x, P.z), P.z + fz * 6]; sh.radius = 44 * Math.max(1, OW.zoom); sh.strength = OW.mode === 'fly' ? 0.5 : 0.85; }
    // 草むら・水上エンカウント
    if (moved > 0 && !G.busy && OW.encCool <= 0 && OW.mode !== 'fly' && !OW.noEnc && !repelOn()) {
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
    try { updateCandy(dt); } catch (e) { console.warn(e); }
    // トレーナーの視線
    //  逃げた（勝たなかった）トレーナーは、いちど 視線の外（TR_AWAY m 以上）に 離れるまで 勝負を 挑んでこない
    if (!G.busy) for (const n of OW.npcs) {
      if ((n.kind !== 'trainer') || G.save.defeated[n.id]) continue;
      const d = Math.hypot(n.x - P.x, n.z - P.z);
      if (OW.trCool[n.id]) { if (d > TR_AWAY) delete OW.trCool[n.id]; continue; }
      if (d < TR_SIGHT && OW.mode !== 'fly') { runFlow(() => trainerSpotted(n)); break; }
    }
    // ストーリー・クエストの位置トリガー
    if (!G.busy) SE.checkPosition(P.x, P.z, reg);
  } else {
    // ダンジョン
    OW.dscene.cullCenter = [P.x, 0, P.z]; OW.dscene.cullRadius = 80;
    // むしよけスプレー中は ダンジョンでも 野生とは 出会わない（主には 会える）
    if (moved > 0 && !G.busy && OW.encCool <= 0 && !OW.noEnc && !repelOn() && Math.random() < moved / 48) {
      const w = rollWild(D.id, false, P.x, P.z);
      if (w) runFlow(async () => { await startWildBattle(createMon(w.sp, w.lv), { biome: DUNGEONS[D.id].theme }); });
    }
  }
  // カメラ
  if (OW.camOverride) {
    const co = OW.camOverride; co.t = Math.min(1, co.t + dt * 1000 / co.ms);
    if (co.lookFn) { try { co.look = co.lookFn(); } catch (e) { /* */ } }
    const k = co.t * co.t * (3 - 2 * co.t);
    for (let i = 0; i < 3; i++) { OW.cam.pos[i] = lerp(co.fromPos[i], co.pos[i], k); OW.cam.target[i] = lerp(co.fromLook[i], co.look[i], k); }
  } else {
    const z = OW.zoom * (OW.mode === 'fly' ? 1.35 : 1);
    // 主人公のまわりを回るカメラ（向き＝camYaw、高さの角度＝pitch）。少し先を見ると遠くの丘まで見える
    const yaw = OW.camYawS || 0, pitch = camPitch(!!D);
    const ox = Math.sin(yaw), oz = Math.cos(yaw);
    const d = (D ? 20.4 : 21.7) * z;
    const ahead = D ? 0 : 4.5 * z * Math.cos(pitch) / Math.cos(PITCH0);
    const tx = P.x - ox * ahead, ty = P.y + 1.2 + (D ? 0 : 0.6 * z), tz = P.z - oz * ahead;
    const want = [tx + ox * Math.cos(pitch) * d, ty + Math.sin(pitch) * d, tz + oz * Math.cos(pitch) * d];
    // 地面にもぐらないように
    if (!D) want[1] = Math.max(want[1], W.heightAt(want[0], want[2]) + 2.2, 1.5);
    const kp = Math.min(1, dt * (OW.camTurning ? 14 : 6));
    for (let i = 0; i < 3; i++) OW.cam.pos[i] = lerp(OW.cam.pos[i], want[i], kp);
    OW.cam.target = [lerp(OW.cam.target[0], tx, Math.min(1, dt * 8)), lerp(OW.cam.target[1], ty, Math.min(1, dt * 8)), lerp(OW.cam.target[2], tz, Math.min(1, dt * 8))];
    if (Math.hypot(OW.cam.pos[0] - want[0], OW.cam.pos[2] - want[2]) > 60) { OW.cam.pos = want; OW.cam.target = [tx, ty, tz]; }
  }
  // 空（カメラについてくる）・空気中を舞うもの
  if (!D && OW.sky) {
    OW.sky.update(dt, OW.cam);
    { const th = OW.movieTheme || OW.skyTheme; if (th) OW.sky.setTheme(th, Math.min(1, dt * 1.5)); }
    if (OW.amb) OW.amb.update(dt, [P.x - Math.sin(OW.camYawS || 0) * 4, (P.y || 0) + 0.5, P.z - Math.cos(OW.camYawS || 0) * 4], OW.scene.wind);
    if (OW.ruinFx) try { OW.ruinFx.update(dt, P.x, P.z, OW.scene.wind); } catch (e) { console.warn(e); }
  }
  // 最後に 地面に立っていた場所（泳ぎ・飛行中に セーブしたとき用）
  if (!D && (OW.t * 4 | 0) !== (OW.lgT | 0)) { OW.lgT = OW.t * 4; if (W.heightAt(P.x, P.z) > -0.3 && !W.blockedByObst(P.x, P.z, 0.6)) OW.lastGround = [P.x, P.z]; }
  updatePrompt();
  updateLabels();
}

// ---------- セーブ位置 ----------
//  セーブするたびに 今いる場所を 記録 → 次に「続きから」で その場所に出る
//  ダンジョンの中なら 入り口の前、泳いでいる・飛んでいるときは 最後に 地面に立っていた場所
function spawnOk(x, z) {
  const W = G.world;
  if (!Number.isFinite(x) || !Number.isFinite(z) || Math.abs(x) > 760 || Math.abs(z) > 760) return false;
  if (!isUnlocked(W.regionAt(x, z))) return false;
  if (W.heightAt(x, z) < -0.4) return false;
  return !W.blockedByObst(x, z, 0.6);
}
export function capturePos() {
  const P = OW.player; if (!P || !G.save) return;
  let x = P.x, z = P.z, ry = P.ry || 0;
  if (OW.dungeon && OW.saveOut) { x = OW.saveOut[0]; z = OW.saveOut[1] + 2; ry = 0; }
  else if ((OW.mode === 'swim' || OW.mode === 'fly') && OW.lastGround) { [x, z] = OW.lastGround; }
  if (!Number.isFinite(x) || !Number.isFinite(z)) return;
  G.save.pos = [Math.round(x * 100) / 100, Math.round(z * 100) / 100]; G.save.ry = Math.round(ry * 100) / 100;
}
G.capturePos = capturePos;

// その場所に 立てるか（メッセージは 出さない）
function standable(x, z, rad = 0.5) {
  const W = G.world;
  if (OW.dungeon) return !OW.dungeon.blocked(x, z, 0.55);
  if (!Number.isFinite(x) || !Number.isFinite(z) || Math.abs(x) > 760 || Math.abs(z) > 760) return false;
  if (!isUnlocked(W.regionAt(x, z))) return false;
  if (OW.mode === 'fly') return true;
  if (W.heightAt(x, z) < -0.4 && OW.mode !== 'swim') return false;
  return !W.blockedByObst(x, z, rad);
}
// 近くの 立てる場所（ワープ先・復活した場所が 建物や 岩の 中に ならないように）
export function freeSpot(x, z, maxR = 30) {
  if (OW.dungeon) return [x, z];
  const W = G.world;
  const ok = (a, b) => spawnOk(a, b) && !W.blockedByObst(a, b, 0.9);
  if (ok(x, z)) return [x, z];
  for (let R = 1.5; R <= maxR; R += 1.5) for (let k = 0; k < 16; k++) { const a = k / 16 * Math.PI * 2, px = x + Math.cos(a) * R, pz = z + Math.sin(a) * R; if (ok(px, pz)) return [px, pz]; }
  return [x, z];
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
  // 空の色・舞うもの（花びら・雪・火の粉など）を地域に合わせる
  OW.skyTheme = ((ERA.ruin && SKY_RUIN[reg]) || SKY[reg] || SKY.plains).theme || 'day';
  { const ak = ERA.ruin && RUINED.has(reg) ? 'ruin_' + reg : reg; if (OW.amb) OW.amb.setKind(G.settings.light && reg !== 'snow' ? null : (BIOME_AMBIENT[ak] ?? null)); }
  if (prev !== null) save();
}

// ---------- 調べる・話す ----------
function nearest() {
  const P = OW.player;
  let best = null, bd = 1e9;
  // 空を 飛んでいる あいだは 地面の もの（木・岩・しげみ・人・落とし物・入口）には さわれない（おりてから）
  if (OW.mode === 'fly') return null;
  if (OW.dungeon) {
    for (const t of OW.dtrig) { const d = Math.hypot(t.x - P.x, t.z - P.z); if (d < t.r && d < bd) { bd = d; best = t; } }
    return best;
  }
  for (const t of OW.trig) { if (t.kind === 'item' && G.save.items[t.id]) continue; const d = Math.hypot(t.x - P.x, t.z - P.z); if (d < t.r && d < bd) { bd = d; best = t; } }
  for (const n of OW.npcs) { const d = Math.hypot(n.x - P.x, n.z - P.z); if (d < 3.6 && d < bd) { bd = d; best = { kind: 'npcRef', n }; } }
  // 同じワールドの フレンド
  if (!best) { const r = COOP.nearestRemote(P); if (r) best = { kind: 'friend', r }; }
  // 木・岩・しげみ など（素材集め）
  if (!best && !OW.inTown) {
    const o = G.world.nearestObst(P.x, P.z, 1.3);
    if (o) { const verb = ER.harvestVerb(o); if (verb) best = { kind: 'harvest', o, verb }; }
  }
  return best;
}
function updatePrompt() {
  const p = $('#prompt');
  if (G.busy || G.state !== 'world') { p.textContent = ''; return; }
  const t = nearest();
  let txt = '';
  if (t) {
    const btn = Input.touch ? 'A' : 'Space';
    const verb = t.kind === 'harvest' ? t.verb : t.kind === 'friend' ? `${t.r.name}と 話す` : ({ door: '入る', stone: '岩にさわる', item: '拾う', dungeon: '入る', p2start: '調べる', gate: '時の扉に 入る', npcRef: '話す', exit: '外に出る', chest: '開ける', boss: '調べる' }[t.kind] || '調べる');
    txt = `${btn}：${verb}`;
  }
  if (p.textContent !== txt) p.textContent = txt;
}
export function interact() {
  const t = nearest();
  if (!t) return;
  if (t.kind === 'harvest') {
    // 素材集めは 会話なしで その場で（連続で 押しやすいように）
    if (G.busy) return;
    const P = OW.player; P.ry = Math.atan2(t.o.x - P.x, t.o.z - P.z);
    ER.harvest(t.o); return;
  }
  audio.sfx('select');
  runFlow(async () => {
    const P = OW.player;
    if (t.kind === 'npcRef') {
      const n = t.n;
      if (n.H) n.H.root.rot[1] = Math.atan2(P.x - n.x, P.z - n.z);
      await SE.talkNpc(n);
    } else if (t.kind === 'friend') await COOP.talkRemote(t.r);
    else if (t.kind === 'door') await doorAction(t);
    else if (t.kind === 'stone') await stoneAction(t);
    else if (t.kind === 'item') {
      G.save.items[t.id] = true; addItem(t.item, 1); OW.scene.root.remove(t.node); audio.sfx('item');
      await say([`|${itemName(t.item)} を 拾った！`]); save();
    } else if (t.kind === 'dungeon') await dungeonEnter(t.id);
    else if (t.kind === 'p2start') await SE.startPart2();
    else if (t.kind === 'gate') await SE.useGate(t.id);
    else if (t.kind === 'exit') { if (await confirmBox('ダンジョンから 外に出ますか？')) await exitDungeon(); }
    else if (t.kind === 'chest') {
      if (OW.dungeon.opened.has(t.i)) { await say(['|からっぽだ。']); return; }
      OW.dungeon.opened.add(t.i); audio.sfx('item');
      // ふしぎなアメは 大陸に 光って 落ちている もの だけ（宝箱からは 出ない）
      const pool = ['superherb', 'revive', 'ppdrop', 'fullmed', 'food3', 'food4', 'h_berry', 'h_clear', 'ppspring', 'h_bread', 'h_claw', 'h_belt', 'h_spike', 'h_glass'];
      const it = pool[(t.i * 5 + OW.dungeon.id.length * 3 + Math.floor(Math.random() * 3)) % pool.length];
      addItem(it, 1); t.node.setColor([0.55, 0.5, 0.48]);
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
  else trainerCalm(n.id);
}
// 逃げた トレーナーは、少し 離れるまで もう一度 勝負を 挑んでこない（話しかければ いつでも 再戦できる）
export function trainerCalm(id) { OW.trCool[id] = true; }

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
  const s = STONES.find(x => x.id === stoneId) || STONES.find(x => x.id === 't_start'); if (!s) return;
  stopRide(true);
  audio.sfx('warp');
  await fade(true, 400);
  const P = OW.player;
  [P.x, P.z] = freeSpot(s.pos[0], s.pos[1] + 4); P.ry = 0;
  G.world.buildAll(P.x, P.z, 120);
  P.y = G.world.heightAt(P.x, P.z);
  OW.stuckT = 0;
  OW.cam.pos = [P.x, P.y + 20, P.z + 18]; OW.cam.target = [P.x, P.y, P.z];
  OW.trail.length = 0; if (OW.follower) { OW.follower.x = P.x; OW.follower.z = P.z + 2; }
  if (s.town) G.save.lastHospital = s.id;
  for (const w of OW.wilds) OW.scene.root.remove(w.M.root); OW.wilds = [];
  removeCandy();
  await new Promise(r => setTimeout(r, 200));
  await fade(false, 400);
  save();
}

// ---------- ダンジョン ----------
async function dungeonEnter(id) {
  const d = DUNGEONS[id];
  if (d.post && !G.save.postGame) { await say(['|強い力で 封印されている……。（ストーリークリア後に 入れる）']); return; }
  if (d.p2 && !G.save.story.flags?.meteorOpen) { await say(['|むらさきの 光の 壁に はじかれた……。（第2部の ストーリーを 進めると 入れる）']); return; }
  const runs = dungeonRuns(id);
  if (!await confirmBox(runs ? `${d.name}（推奨Lv${d.rec + runBonus(id)}）に 入りますか？\n周回 ${runs + 1}回目：入るたびに 中の形が 変わり、主と 宝箱が 復活します（クリアするほど 少し強く、ごほうびも 良くなる）` : `${d.name}（推奨Lv${d.rec}）に 入りますか？`)) return;
  stopRide(true);
  await fade(true, 400);
  OW.saveOut = [OW.player.x, OW.player.z];
  OW.dgeo0 = geoSerial();   // ダンジョンで 作った ジオメトリ（出るときに 片付ける）
  // 周回するたびに 迷路の形が 変わる（1回目は いつもの形）
  const Dg = new Dungeon(id, d, hashStr(id) + 7 + runs * 7919 + (runs ? Math.floor(Math.random() * 1000) : 0));
  Dg.runs = runs;
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
    const n = new Node(chestGeo(), { emis: [0.08, 0.05, 0] }); n.setPos(c[0], 0, c[1]); n.rot[1] = (i % 4) * Math.PI / 2; S.add(n);
    OW.dtrig.push({ kind: 'chest', x: c[0], z: c[1], r: 2.4, i, node: n });
  });
  // 主は 入るたびに 現れる（周回するほど 強い）。何度でも なつかせられる
  {
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
  await say([runs ? `|${d.name} に 入った。（周回 ${runs + 1}回目）道の形が 前と ちがう……！ いちばん奥で 主が 待っている。` : `|${d.name} に 入った。いちばん奥に 何かが いるようだ……`]);
}
// 周回の ごほうび（周回するほど 良い 道具が 出やすい）
function runReward(runs) {
  const tiers = [['superherb', 'revive', 'ppdrop', 'food3'], ['fullmed', 'food4', 'ppspring', 'h_berry', 'h_clear'], ['maxrevive', 'ppspring', 'h_claw', 'h_belt', 'h_glass', 'h_spike', 'h_bread'], ['scroll', 'maxrevive', 'h_orb', 'h_band', 'h_shoes', 'h_vest', 'h_charm']];
  const t = Math.min(tiers.length - 1, Math.floor(Math.random() * Math.min(tiers.length, 1 + Math.floor(runs / 2))));
  const pool = tiers[t];
  return pool[Math.floor(Math.random() * pool.length)];
}
export { DUNGEON_BOSS };
async function dungeonBoss() {
  const id = OW.dungeon.id;
  const [nm, lv0] = DUNGEON_BOSS[id];
  const runs = dungeonRuns(id), lv = Math.min(99, lv0 + runBonus(id));
  const again = G.save.cleared[id];
  await say([`|${DUNGEONS[id].name}の 主 ${nm}${runs ? `（Lv${lv}・周回 ${runs + 1}回目）` : ''} が 立ちはだかった！`, '|（主は「つかまえる」で なつかせることが できる。個体値は すべて 6以上！）']);
  const mon = createMon(BY_NAME[nm].id, lv, { iv: bossIv(), shiny: false });
  mon.boss = true;
  const res = await startWildBattle(mon, { biome: DUNGEONS[id].theme, boss: true });
  if (res === 'win' || res === 'caught') {
    const first = !again;
    G.save.cleared[id] = true;
    if (res === 'caught') { G.save.bossCaught = G.save.bossCaught || {}; G.save.bossCaught[id] = true; }
    if (OW.dbossM) { OW.dscene.root.remove(OW.dbossM.root); OW.dbossM = null; }
    OW.dtrig = OW.dtrig.filter(t => t.kind !== 'boss');
    const lines = [];
    G.save.runs = G.save.runs || {}; G.save.runs[id] = runs + 1;
    if (first) { const money = lv * 100; addMoney(money); lines.push(`|${DUNGEONS[id].name} を 攻略した！`, `|${money}円 を 手に入れた！`); }
    else {
      // 周回の ごほうび：少しの お金と、周回するほど 良くなる 道具
      const money = lv * 25; addMoney(money);
      const it = runReward(runs);
      addItem(it, 1);
      lines.push(`|${DUNGEONS[id].name} を また 攻略した！（クリア ${runs + 1}回目）`, `|${money}円 と ${itemName(it)} を 手に入れた！`);
    }
    if (res === 'win') lines.push(`|${nm}は 去っていった……。（次に 入ったとき、もっと 強くなって また 現れる）`);
    if (lines.length) await say(lines);
    SE.onDungeonClear(id);
    save();
    if (await confirmBox('入り口まで 戻りますか？')) await exitDungeon();
  }
}
// ダンジョンの 場面を 片付けて 大陸に もどす（演出なし）。
//  負けて 病院に 運ばれるときも これを 先に 呼ぶ（ダンジョンの まま 大陸の 座標に 飛ばされて 何もない 場所に 出ないように）
function swapOutOfDungeon() {
  const S = OW.dscene;
  const P = OW.player;
  if (!OW.dungeon || !S) return false;
  S.root.remove(P.H.root); S.root.remove(P.shadow);
  OW.scene.add(P.H.root); OW.scene.add(P.shadow);
  if (P.rideM) { S.root.remove(P.rideM.root); OW.scene.add(P.rideM.root); }
  if (OW.follower) { S.root.remove(OW.follower.root); OW.scene.add(OW.follower.root); }
  for (const sp of sparks.splice(0)) sp.n.parent?.remove(sp.n);
  try { disposeSceneGeos(S.root, OW.dgeo0 || 0); } catch (e) { console.warn(e); }
  OW.dungeon = null; OW.dscene = null; OW.dbossM = null; OW.dtrig = []; G.scene = OW.scene;
  const out = OW.saveOut || [START_POS[0], START_POS[1]];
  [P.x, P.z] = freeSpot(out[0], out[1] + 2); P.ry = 0;
  P.y = G.world.heightAt(P.x, P.z);
  OW.trail.length = 0; if (OW.follower) { OW.follower.x = P.x; OW.follower.z = P.z + 1.5; }
  OW.cam.pos = [P.x, P.y + 20, P.z + 18]; OW.cam.target = [P.x, P.y, P.z];
  OW.region = null; OW.stuckT = 0;
  return true;
}
export async function leaveDungeonQuiet() { if (OW.dungeon) swapOutOfDungeon(); }
export async function exitDungeon() {
  await fade(true, 400);
  swapOutOfDungeon();
  G.world.buildAll(OW.player.x, OW.player.z, 120);
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
        show(t.lx ?? t.x, gr(t.x, t.z) + (t.ly || 3), t.lz ?? t.z, t.kind === 'dungeon' && dungeonRuns(t.id) ? `${t.baseLabel}（推奨Lv${t.rec + Math.min(10, dungeonRuns(t.id) * 2)}・クリア${dungeonRuns(t.id)}回）` : t.label);
      }
      for (const n of OW.npcs) {
        const d = Math.hypot(n.x - P.x, n.z - P.z); if (d > 26) continue;
        const mark = SE.npcMark(n);
        if (mark) show(n.x, gr(n.x, n.z) + 3.0, n.z, mark, mark === '!' ? 'ex' : mark === '?' ? 'ex q' : 'ex er');
        else if (d < 9 && n.name) show(n.x, gr(n.x, n.z) + 2.7, n.z, n.name);
      }
    } else {
      for (const t of OW.dtrig) { const d = Math.hypot(t.x - P.x, t.z - P.z); if (d > 20) continue; if (t.kind === 'exit') show(t.x, 2.2, t.z, '出口'); if (t.kind === 'boss') show(t.x, 4, t.z, '!', 'ex'); }
    }
    // 歩いている 野生の アニモン：なかまに したことが ある 種類には ✔ の しるし
    if (!OW.dungeon) for (const w of OW.wilds) {
      if (!G.save.dex.caught[w.mon.sp]) continue;
      const d = Math.hypot(w.x - P.x, w.z - P.z); if (d > 48) continue;
      show(w.x, (w.water ? -0.35 : gr(w.x, w.z)) + (w.M.height || 1) + 0.35, w.z, '✔', 'own');
    }
    if (OW.exMark) show(OW.exMark.x, gr(OW.exMark.x, OW.exMark.z) + 3.2, OW.exMark.z, '!', 'ex');
    if (!OW.dungeon) COOP.coopLabels(show, P);
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
  // ムービー用：{ pos, look | lookFn, ms } や 名前つきの 場面（'meteor' 'legendsUp'）
  if (typeof target === 'string' && FX.camShot(target)) target = FX.camShot(target);
  if (target && !Array.isArray(target) && typeof target === 'object' && target.pos) {
    const look = target.lookFn ? target.lookFn() : target.look;
    OW.camOverride = { fromPos: OW.cam.pos.slice(), fromLook: OW.cam.target.slice(), pos: target.pos, look: look.slice(), lookFn: target.lookFn || null, t: 0, ms: target.ms || 1200 };
    return;
  }
  let look, pos;
  const W = G.world;
  if (Array.isArray(target)) { look = target; }
  else if (target === 'legends') look = [ALTAR[0], 12, ALTAR[1] - 26];
  else if (target === 'sanctuary') look = [0, 10, 0];
  else { const n = OW.npcs.find(x => x.id === target) || OW.spawned[target]; const p = n ? [n.x ?? n.pos[0], n.z ?? n.pos[1]] : [OW.player.x, OW.player.z]; look = [p[0], W.groundAt(p[0], p[1]) + 1.2, p[1]]; }
  pos = target === 'sanctuary' ? [60, 120, 160] : target === 'legends' ? [ALTAR[0], 30, ALTAR[1] + 20] : [look[0], look[1] + 14, look[2] + 13];
  OW.camOverride = { fromPos: OW.cam.pos.slice(), fromLook: OW.cam.target.slice(), pos, look, t: 0, ms: 1200 };
}
