// =============================================================
//  バトル画面の3D演出（アニメ調）
//   ・空のグラデーションと雲、まわりを囲む丘・木・岩・草
//   ・太陽の影、足場のリング、地面を渡る風
//   ・カメラワーク（登場の寄り・攻撃の追いかけ・ヒットの揺れ）
//   ・タイプごとの技エフェクト（炎・水しぶき・木の葉・雷・氷の破片・衝撃波など）
// =============================================================
import { Scene, Camera, Node, PRIM, initPrims, GeoBuilder, hexToRgb, mixRgb, MAT, M4, norm3, geoSerial, disposeSceneGeos } from '../engine/gl3d.js';
import { buildAnimon, animateAnimon } from './models.js';
import { TYPE_COLOR } from '../data/types.js';
import { mulberry32, fbm, smooth, clamp, lerp } from '../engine/util.js';
import { SkyRig } from './sky.js';
import { Ambient, BIOME_AMBIENT } from './ambient.js';
import { getFlora, getSmallFlora, instanceNodes, stamp } from './flora.js';
import { G } from '../game/state.js';

// 地面の色（中心・まわり・足場）
const PAL = {
  plains: { g: [0.42, 0.74, 0.3], g2: [0.62, 0.84, 0.36], pad: [0.72, 0.6, 0.42], sky: 'day', flora: 'meadow' },
  start: { g: [0.42, 0.74, 0.3], g2: [0.62, 0.84, 0.36], pad: [0.72, 0.6, 0.42], sky: 'day', flora: 'meadow' },
  forest: { g: [0.24, 0.52, 0.22], g2: [0.38, 0.66, 0.26], pad: [0.55, 0.42, 0.3], sky: 'day', flora: 'forest' },
  lake: { g: [0.4, 0.72, 0.36], g2: [0.86, 0.82, 0.6], pad: [0.86, 0.8, 0.6], sky: 'day', flora: 'lake' },
  sea: { g: [0.86, 0.8, 0.58], g2: [0.92, 0.86, 0.66], pad: [0.8, 0.72, 0.52], sky: 'day', flora: 'sea' },
  desert: { g: [0.94, 0.8, 0.52], g2: [0.98, 0.88, 0.62], pad: [0.82, 0.62, 0.4], sky: 'desert', flora: 'desert' },
  canyon: { g: [0.82, 0.52, 0.34], g2: [0.9, 0.62, 0.4], pad: [0.7, 0.44, 0.3], sky: 'desert', flora: 'canyon' },
  snow: { g: [0.9, 0.94, 1], g2: [0.98, 1, 1], pad: [0.72, 0.82, 0.92], sky: 'snow', flora: 'snow' },
  swamp: { g: [0.3, 0.42, 0.24], g2: [0.38, 0.5, 0.3], pad: [0.42, 0.36, 0.28], sky: 'swamp', flora: 'swamp' },
  highland: { g: [0.48, 0.8, 0.36], g2: [0.7, 0.9, 0.42], pad: [0.78, 0.7, 0.5], sky: 'day', flora: 'meadow' },
  volcano: { g: [0.34, 0.27, 0.26], g2: [0.48, 0.3, 0.24], pad: [0.3, 0.24, 0.24], sky: 'volcano', flora: 'volcano' },
  sanctuary: { g: [0.78, 0.84, 0.56], g2: [0.92, 0.88, 0.66], pad: [0.92, 0.9, 0.84], sky: 'sanctuary', flora: 'sanctuary' },
  inner: { g: [0.78, 0.72, 0.94], g2: [0.9, 0.84, 1], pad: [0.86, 0.8, 0.98], sky: 'inner', flora: 'inner' },
  ruins: { g: [0.5, 0.56, 0.42], g2: [0.62, 0.62, 0.5], pad: [0.72, 0.7, 0.62], sky: 'cave', cave: true, flora: 'ruins' },
  pyramid: { g: [0.86, 0.72, 0.48], g2: [0.92, 0.8, 0.56], pad: [0.78, 0.64, 0.42], sky: 'cave', cave: true, flora: 'ruins' },
  ice: { g: [0.74, 0.88, 0.96], g2: [0.86, 0.95, 1], pad: [0.6, 0.78, 0.92], sky: 'cave', cave: true, flora: 'ice' },
  icecave: { g: [0.74, 0.88, 0.96], g2: [0.86, 0.95, 1], pad: [0.6, 0.78, 0.92], sky: 'cave', cave: true, flora: 'ice' },
  sky: { g: [0.9, 0.92, 1], g2: [1, 1, 1], pad: [0.8, 0.82, 0.92], sky: 'sanctuary', flora: 'sky' },
  skytower: { g: [0.9, 0.92, 1], g2: [1, 1, 1], pad: [0.8, 0.82, 0.92], sky: 'sanctuary', flora: 'sky' },
  lava: { g: [0.3, 0.24, 0.22], g2: [0.42, 0.26, 0.2], pad: [0.28, 0.22, 0.22], sky: 'volcano', cave: true, flora: 'volcano' },
  lavacave: { g: [0.3, 0.24, 0.22], g2: [0.42, 0.26, 0.2], pad: [0.28, 0.22, 0.22], sky: 'volcano', cave: true, flora: 'volcano' },
  abyss: { g: [0.26, 0.22, 0.36], g2: [0.36, 0.3, 0.5], pad: [0.4, 0.34, 0.56], sky: 'inner', cave: true, flora: 'inner' },
  // 第2部（隕石の あとの 大陸）
  ruin_forest: { g: [0.22, 0.18, 0.16], g2: [0.34, 0.27, 0.22], pad: [0.4, 0.32, 0.28], sky: 'volcano', flora: 'volcano' },
  ruin_lake: { g: [0.6, 0.5, 0.38], g2: [0.5, 0.42, 0.32], pad: [0.7, 0.6, 0.46], sky: 'desert', flora: 'desert' },
  ruin_swamp: { g: [0.26, 0.21, 0.3], g2: [0.36, 0.3, 0.36], pad: [0.4, 0.34, 0.4], sky: 'swamp', flora: 'swamp' },
  ruin_highland: { g: [0.56, 0.56, 0.56], g2: [0.66, 0.65, 0.64], pad: [0.7, 0.68, 0.64], sky: 'swamp', flora: 'canyon' },
  ruin_volcano: { g: [0.26, 0.2, 0.2], g2: [0.4, 0.24, 0.2], pad: [0.26, 0.2, 0.2], sky: 'volcano', flora: 'volcano' },
  crater: { g: [0.18, 0.16, 0.22], g2: [0.32, 0.26, 0.4], pad: [0.36, 0.3, 0.46], sky: 'inner', flora: 'inner' },
  lavaland: { g: [0.12, 0.1, 0.1], g2: [0.24, 0.18, 0.16], pad: [0.22, 0.18, 0.18], sky: 'volcano', flora: 'volcano' },
  meteor: { g: [0.2, 0.16, 0.28], g2: [0.32, 0.24, 0.44], pad: [0.4, 0.32, 0.54], sky: 'inner', cave: true, flora: 'inner' },
  arena: { g: [0.72, 0.74, 0.8], g2: [0.85, 0.86, 0.9], pad: [0.92, 0.92, 0.96], sky: 'day', flora: 'meadow' },
};

export class BattleView {
  constructor() {
    initPrims();
    this.scene = new Scene();
    this.cam = new Camera(36);
    this.mons = {}; // "side,slot" → {M, base:[x,y,z], ry}
    this.fx = []; this.tweens = []; this.t = 0; this.shake = 0; this.hitStop = 0;
    this.n = 1;
    this.camShot = null;
    this.geo0 = geoSerial();   // このバトル画面で 作った ジオメトリは ここから先の 番号
  }
  // バトルが 終わったら GPU の メモリを 返す（くり返し バトルしても スマホが 重く・落ちないように）
  dispose() {
    if (this.disposed) return; this.disposed = true;
    const tw = this.tweens.splice(0); for (const t of tw) { try { t.res(); } catch (e) { /* */ } }
    this.fx.length = 0;
    try { disposeSceneGeos(this.scene && this.scene.root, this.geo0); } catch (e) { console.warn(e); }
  }
  setup(biome, format) {
    const S = this.scene = new Scene();
    this.mons = {}; this.fx = []; this.tweens = [];
    this.n = format === 'double' ? 2 : 1;
    if (format === 'evolve') this.slotPos = () => [0, 0, 0];
    this.biome = biome;
    const P = PAL[biome] || PAL.plains;
    this.pal = P;
    const light = !!(G.settings && G.settings.light);
    S.lightDir = norm3([0.5, 0.78, 0.42]);
    S.fogNear = 60; S.fogFar = 150;
    S.wind = [0.8, 0.45, 0.6];
    S.outlineDist = 120;
    S.cloudShadow = [light ? 0 : 0.3, 0.02, 0, 0];
    this.sky = new SkyRig(S, { light, clouds: light ? 6 : 12, cloudR: 140, cloudY: 22, mountR: 230, dome: 420, theme: P.sky });
    if (P.cave) { S.zenith = mixRgb(P.g, [0.05, 0.04, 0.1], 0.75); S.horizon = mixRgb(P.g, [0.15, 0.12, 0.2], 0.5); this.sky.cloudNode.visible = false; }
    if (biome === 'sky' || biome === 'skytower') this.sky.mountNode.visible = false;
    S.fogColor = S.horizon.slice(); S.bg = S.horizon.slice();
    S.shadow = light ? null : { center: [0, 0, 0], radius: 15, strength: 0.75, bias: 0.06 };
    this._ground(P);
    this._decor(P, light);
    this.amb = new Ambient(S, { light, count: light ? 10 : 30, radius: 18, height: 9 });
    this.amb.setKind(BIOME_AMBIENT[biome] || (biome === 'plains' || biome === 'start' ? 'petals' : null));
    this.baseCam();
    this.cam.pos = [this.camBase[0] + 6, this.camBase[1] + 7, this.camBase[2] + 8];
    this.cam.target = this.camLook.slice();
  }
  // ---- 地面：足場のまわりは平ら、遠くは丘になってせり上がる ----
  _ground(P) {
    const g = new GeoBuilder();
    const R = 120, NR = 26, NA = 48;
    const water = this.biome === 'sea' || this.biome === 'lake';
    const hAt = (x, z) => {
      const d = Math.hypot(x, z + 4);
      let h = smooth(20, 70, d) * (8 + fbm(x / 26, z / 26, 3, 7) * 16) + (fbm(x / 9, z / 9, 2, 3) - 0.5) * 0.6 * smooth(6, 14, d);
      if (this.pal.cave) h = smooth(18, 34, d) * 18 + fbm(x / 7, z / 7, 2, 5) * 2 * smooth(16, 30, d);
      if (water) h = smooth(9, 14, Math.hypot(x + 2.5, z - 3.6)) * -2.4 + (z < -2 ? 0 : 0) + smooth(30, 60, d) * 6;
      if (this.biome === 'sky' || this.biome === 'skytower') h = d < 26 ? 0 : -60;
      return h;
    };
    const col = (x, z, h) => {
      const n = fbm(x / 8, z / 8, 2, 11);
      let c = mixRgb(this.pal.g, this.pal.g2, smooth(0.35, 0.7, n));
      if (h > 6) c = mixRgb(c, this.pal.cave ? mixRgb(this.pal.g, [0.15, 0.12, 0.18], 0.4) : mixRgb(this.pal.g, [0.9, 0.95, 1], 0.12), smooth(6, 18, h) * 0.6);
      return c;
    };
    const rows = [];
    for (let i = 0; i <= NR; i++) {
      const rr = R * Math.pow(i / NR, 1.6);
      const row = [];
      for (let k = 0; k <= NA; k++) {
        const a = k / NA * Math.PI * 2, x = Math.cos(a) * rr, z = Math.sin(a) * rr - 2;
        const h = hAt(x, z), e = 0.5;
        const nx = hAt(x - e, z) - hAt(x + e, z), nz = hAt(x, z - e) - hAt(x, z + e);
        const l = Math.hypot(nx, 2 * e, nz);
        row.push(g._push(x, h, z, nx / l, 2 * e / l, nz / l, col(x, z, h)));
      }
      rows.push(row);
    }
    for (let i = 0; i < NR; i++) for (let k = 0; k < NA; k++) { const a = rows[i][k], b = rows[i][k + 1], c = rows[i + 1][k], d = rows[i + 1][k + 1]; g.tri(a, b, c); g.tri(b, d, c); }
    this.scene.add(new Node(g.build(), { mat: MAT.terrain, outline: 0, kind: 4, castShadow: false }));
    this.hAt = hAt;
    if (water) {
      const wb = new GeoBuilder(); const WN = 40, WS = 3;
      for (let j = 0; j <= WN; j++) for (let i = 0; i <= WN; i++) wb._push((i - WN / 2) * WS, 0, (j - WN / 2) * WS - 10, 0, 1, 0, [1, 1, 1]);
      for (let j = 0; j < WN; j++) for (let i = 0; i < WN; i++) { const a = j * (WN + 1) + i; wb.tri(a, a + WN + 1, a + 1); wb.tri(a + 1, a + WN + 1, a + WN + 2); }
      const w = new Node(wb.build(), { color: [1, 1, 1], alpha: 0.85, wave: 0.6, kind: 2, outline: 0, cloudShadow: 0, castShadow: false });
      w.setPos(0, -0.55, 0); w.noDepthWrite = true; w.cull = false; this.scene.add(w);
    }
    // 足場（アニメ調のリング）
    for (const p of this.slotsAll()) {
      const pg = new GeoBuilder();
      const pad = this.pal.pad;
      pg.cylinder(2.75, 2.95, 0.16, mixRgb(pad, [0, 0, 0], 0.18), 0, -0.1, 0, 32, true);
      pg.cylinder(2.5, 2.6, 0.2, pad, 0, -0.06, 0, 32, true);
      pg.cylinder(2.0, 2.0, 0.21, mixRgb(pad, [1, 1, 1], 0.22), 0, -0.05, 0, 32, true);
      const n = new Node(pg.build(), { mat: MAT.decor, outline: 0.8 });
      n.setPos(p[0], this.hAt(p[0], p[2]) + 0.03, p[2]);
      this.scene.add(n);
    }
  }
  // ---- まわりの木・岩・草（アリーナの奥と横に） ----
  _decor(P, light) {
    const F = getFlora(light), SM = getSmallFlora(light);
    const r = mulberry32(this.biome.length * 131 + 7);
    const items = [];
    const slots = this.slotsAll();
    const put = (list, x, z, s, tint) => {
      // 足場の上には置かない
      for (const p of slots) if (Math.hypot(x - p[0], z - p[2]) < 3.4 + s * 0.6) return;
      // カメラの手前（画面に大きく割り込む位置）には大きな物を置かない
      if (list !== SM.flower && z > 2.5 && x > -7 && Math.hypot(x - 5.5, z - 13.5) < 16) return;
      const proto = list[Math.floor(r() * list.length)]; items.push({ proto, x, y: this.hAt(x, z) - 0.15, z, ry: r() * 6.28, s, tint });
    };
    const kind = P.flora;
    const ring = (n, r0, r1, fn) => { for (let i = 0; i < n; i++) { const a = r() * Math.PI * 2; const d = r0 + r() * (r1 - r0); const x = Math.cos(a) * d, z = Math.sin(a) * d - 4; if (x > 4 && z > 2) continue; fn(x, z, d); } };
    const v = () => 0.92 + r() * 0.16;
    if (kind === 'meadow' || kind === 'lake') {
      ring(light ? 14 : 30, 16, 60, (x, z) => put(r() < 0.25 ? F.blossom : F.round, x, z, 1.1 + r() * 0.8));
      ring(light ? 10 : 22, 11, 26, (x, z) => put(F.bush, x, z, 0.9 + r() * 0.5));
      ring(light ? 6 : 12, 10, 30, (x, z) => put(F.rock, x, z, 0.6 + r() * 0.6));
      ring(light ? 40 : 110, 4, 22, (x, z) => put(SM.flower, x, z, 1, [[1, 0.42, 0.55], [1, 0.86, 0.3], [1, 1, 1], [0.75, 0.5, 1]][Math.floor(r() * 4)]));
    } else if (kind === 'forest') {
      ring(light ? 20 : 46, 14, 60, (x, z) => put(r() < 0.55 ? F.pine : F.round, x, z, 1.3 + r() * 0.8, [v(), v(), v()]));
      ring(light ? 10 : 20, 10, 24, (x, z) => put(F.bush, x, z, 1 + r() * 0.4));
      ring(light ? 6 : 14, 9, 22, (x, z) => put(F.mush, x, z, 1 + r() * 0.8));
    } else if (kind === 'desert') {
      ring(light ? 8 : 16, 13, 50, (x, z) => put(F.cactus, x, z, 1 + r() * 0.6));
      ring(light ? 8 : 16, 10, 45, (x, z) => put(F.rock, x, z, 0.8 + r() * 1.2, [1.22, 1.02, 0.78]));
    } else if (kind === 'canyon') {
      ring(light ? 10 : 22, 11, 50, (x, z) => put(F.rock, x, z, 1 + r() * 2.2, [1.18, 0.82, 0.62]));
    } else if (kind === 'snow' || kind === 'ice') {
      ring(light ? 12 : 30, 14, 60, (x, z) => put(F.snowpine, x, z, 1.1 + r() * 0.8));
      ring(light ? 6 : 12, 9, 30, (x, z) => put(F.crystal, x, z, 0.7 + r() * 0.8));
      ring(light ? 6 : 10, 10, 30, (x, z) => put(F.rock, x, z, 0.7 + r() * 0.8, [1.05, 1.12, 1.25]));
    } else if (kind === 'swamp') {
      ring(light ? 10 : 22, 12, 55, (x, z) => put(F.dead, x, z, 1 + r() * 0.6));
      ring(light ? 8 : 16, 9, 26, (x, z) => put(F.glowmush, x, z, 1 + r() * 0.8));
    } else if (kind === 'volcano') {
      ring(light ? 10 : 22, 10, 50, (x, z) => put(F.rock, x, z, 0.9 + r() * 1.6, [0.48, 0.42, 0.44]));
      ring(light ? 4 : 8, 12, 40, (x, z) => put(F.dead, x, z, 1, [0.75, 0.62, 0.6]));
    } else if (kind === 'sanctuary' || kind === 'sky') {
      ring(light ? 6 : 12, 12, 40, (x, z) => put(F.goldcrystal, x, z, 0.8 + r() * 0.8));
      ring(light ? 6 : 14, 14, 50, (x, z) => put(F.blossom, x, z, 1.1 + r() * 0.6));
    } else if (kind === 'inner') {
      ring(light ? 8 : 18, 10, 45, (x, z) => put(F.purplecrystal, x, z, 0.8 + r() * 1.2));
    } else if (kind === 'ruins') {
      ring(light ? 8 : 16, 10, 35, (x, z) => put(F.rock, x, z, 0.8 + r() * 1.4, [0.9, 0.92, 0.82]));
    } else if (kind === 'sea') {
      ring(light ? 6 : 12, 14, 40, (x, z) => put(F.rock, x, z, 0.8 + r() * 1.2, [0.95, 0.92, 0.85]));
    }
    // 草の房（足場のまわり）
    if (!['desert', 'canyon', 'volcano', 'sky', 'inner', 'sanctuary', 'sea'].includes(kind)) {
      const gc = mixRgb(P.g, [1, 1, 1], 0.05);
      ring(light ? 60 : 180, 3.5, 26, (x, z) => put(SM.tuft, x, z, 0.7 + r() * 0.5, [gc[0] * 1.2, gc[1] * 1.15, gc[2] * 1.05]));
      if (kind !== 'snow' && kind !== 'ice') ring(light ? 10 : 30, 5, 18, (x, z) => put(SM.grass, x, z, 0.8 + r() * 0.4, [P.g[0] * 0.9, P.g[1] * 0.95, P.g[2] * 0.9]));
    }
    // 洞窟・遺跡の柱
    if (P.cave || kind === 'sky' || kind === 'sanctuary') {
      const gb = new GeoBuilder();
      for (let i = 0; i < 10; i++) {
        const a = -Math.PI * 0.1 - i / 9 * Math.PI * 0.95, d = 15 + (i % 3) * 4;
        const x = Math.cos(a) * d, z = Math.sin(a) * d - 4, h = 7 + r() * 6;
        const pc = P.cave ? mixRgb(P.pad, [0.2, 0.18, 0.22], 0.25) : [0.95, 0.93, 0.88];
        gb.box(2, h, 2, pc, x, this.hAt(x, z) + h / 2 - 0.3, z); gb.box(2.6, 0.6, 2.6, mixRgb(pc, [1, 1, 1], 0.15), x, this.hAt(x, z) + h, z);
        if (P.cave) { gb.box(0.4, 0.8, 0.4, [0.4, 0.3, 0.2], x + 1.2, this.hAt(x, z) + h * 0.55, z + 0.4); gb.sphere(0.35, [1, 0.75, 0.3], x + 1.2, this.hAt(x, z) + h * 0.55 + 0.6, z + 0.4, 6, 4); }
      }
      this.scene.add(new Node(gb.build(), { mat: MAT.building }));
    }
    // まとめて描く
    const groups = instanceNodes(items);
    const inst = !!(G.renderer && G.renderer.inst);
    for (const [geo, g] of groups) {
      const a = g.arr, n = a.length / 8;
      if (inst) {
        let ms = 0; for (let i = 0; i < a.length; i += 8) ms = Math.max(ms, a[i + 4]);
        const nd = new Node(geo, { mat: g.mat || MAT.decor, outline: geo.data.length / 13 < 200 ? 0 : 1, castShadow: geo.data.length / 13 >= 200 });
        nd.inst = { data: new Float32Array(a), count: n, center: [0, 0, -4], radius: 140, maxS: ms };
        nd.cull = false;
        this.scene.add(nd);
      } else {
        const gb = new GeoBuilder();
        for (let i = 0; i < a.length; i += 8) stamp(gb, { parts: [geo] }, a[i], a[i + 1], a[i + 2], a[i + 3], a[i + 4], [a[i + 5], a[i + 6], a[i + 7]]);
        this.scene.add(new Node(gb.build(), { mat: g.mat || MAT.decor, outline: geo.data.length / 13 < 200 ? 0 : 1 }));
      }
    }
  }
  slotPos(side, slot) {
    if (this.n === 1) return side === 0 ? [-2.6, 0, 3.6] : [2.6, 0, -3.8];
    return side === 0 ? [[-5.4, 0, 3.0], [-1.2, 0, 5.4]][slot] : [[1.2, 0, -5.4], [5.4, 0, -3.0]][slot];
  }
  slotsAll() { const a = []; for (const s of [0, 1]) for (let k = 0; k < this.n; k++) { const p = this.slotPos(s, k); if (!a.some(q => q[0] === p[0] && q[2] === p[2])) a.push(p); } return a; }
  baseCam() {
    // メッセージ欄（画面の下）にかくれないよう、少し下を見る
    if (this.n === 1) { this.camBase = [4.4, 4.3, 11.6]; this.camLook = [-0.5, -0.45, -1.2]; }
    else { this.camBase = [7.0, 6.8, 16.4]; this.camLook = [-0.9, -0.8, -1.4]; }
  }
  key(s, k) { return s + ',' + k; }
  setMon(side, slot, mon, opts = {}) {
    this.clearMon(side, slot);
    const M = buildAnimon(mon.sp, mon.shiny, { lod: 'hi' });
    // 大きすぎるモデル（伝説など）はバトル画面に収まるよう縮める
    // 種ごとの大きさの差は残しつつ、小さい子も見えるように少しだけ縮める（大きい子は画面に収める）
    const maxH = this.n === 2 ? 3.2 : 3.8;
    const want = M.sp.legend ? Math.min(M.height, maxH) : Math.min(maxH, Math.max(0.85, 1.35 * Math.pow(M.height / 1.35, 0.7)));
    if (Math.abs(want - M.height) > 0.01) { const k = want / M.height; M.pivot.setScale(M.size * k); M.height = want; M.size *= k; }
    const p = this.slotPos(side, slot);
    const gy = this.hAt ? this.hAt(p[0], p[2]) : 0;
    M.root.setPos(p[0], gy + 0.08, p[2]);
    // 相手の方を向く（少しカメラ側へ）
    const tgt = this.slotPos(1 - side, Math.min(slot, this.n - 1));
    const ry = Math.atan2(tgt[0] - p[0], tgt[2] - p[2]) + (side === 0 ? -0.25 : 0.35);
    M.root.rot[1] = ry;
    this.scene.add(M.root);
    const ent = { M, base: [p[0], gy + 0.08, p[2]], ry, alive: true, state: 'battle' };
    this.mons[this.key(side, slot)] = ent;
    if (opts.instant) return Promise.resolve();
    // 登場演出：光の柱 → 上から着地 → 土けむり
    M.root.setScale(0.01);
    this.ring(p[0], gy + 0.1, p[2], [1, 1, 1], 0.4, 3.2, 0.45);
    this.beam(p[0], gy, p[2], [1, 0.95, 0.75], 0.5);
    return this.tween(420, (t) => {
      const k = t < 0.7 ? t / 0.7 * 1.12 : 1.12 - (t - 0.7) / 0.3 * 0.12;
      M.root.setScale(Math.max(0.01, k));
      M.root.pos[1] = gy + 0.08 + (1 - Math.min(1, t * 1.4)) * 2.2;
    }).then(() => {
      M.root.setScale(1); M.root.pos[1] = gy + 0.08;
      this.dust(p[0], gy, p[2], 10);
      this.shake = Math.max(this.shake, M.height > 2.5 ? 0.5 : 0.18);
      if (mon.shiny) return this.sparkle(side, slot);
    });
  }
  clearMon(side, slot) {
    const e = this.mons[this.key(side, slot)];
    if (e) { this.scene.root.remove(e.M.root); delete this.mons[this.key(side, slot)]; }
  }
  withdraw(side, slot) {
    const e = this.mons[this.key(side, slot)];
    if (!e) return Promise.resolve();
    this.beam(e.base[0], e.base[1], e.base[2], [1, 0.4, 0.4], 0.35);
    return this.tween(260, t => e.M.root.setScale(Math.max(0.01, 1 - t))).then(() => this.clearMon(side, slot));
  }
  tween(ms, fn) { return new Promise(res => this.tweens.push({ ms, t: 0, fn, res })); }
  wait(ms) { return this.tween(ms, () => { }); }

  // ---- 基本のエフェクト ----
  particle(x, y, z, vx, vy, vz, col, life, size = 0.18, geo = PRIM.sphereLo, grav = -6, o = {}) {
    const n = new Node(geo, { color: col, unlit: o.lit ? false : true, emis: [0, 0, 0], castShadow: false });
    n.setPos(x, y, z); n.setScale(size); n.transparent = true; n.noDepthWrite = true; n.doubleSide = true;
    if (o.rot) n.rot = o.rot.slice();
    this.scene.add(n);
    this.fx.push({ n, vx, vy, vz, life, max: life, size, grow: o.grow || 0, spin: o.spin ?? 3, grav, drag: o.drag || 0 });
    return n;
  }
  burst(x, y, z, col, count = 16, sp = 4, geo = PRIM.sphereLo, size = 0.18, o = {}) {
    for (let i = 0; i < count; i++) { const a = Math.random() * Math.PI * 2, b = Math.random() * Math.PI - Math.PI / 2; this.particle(x, y, z, Math.cos(a) * Math.cos(b) * sp, Math.sin(b) * sp + 2, Math.sin(a) * Math.cos(b) * sp, Array.isArray(col[0]) ? col[i % col.length] : col, 0.45 + Math.random() * 0.4, size, geo, o.grav ?? -6, o); }
  }
  // 広がる輪（衝撃波）
  ring(x, y, z, col, t0 = 0.3, R = 3, life = 0.4, tilt = null) {
    const n = new Node(PRIM.torus, { color: col, unlit: true, castShadow: false, alpha: 0.9 });
    n.setPos(x, y, z); n.transparent = true; n.noDepthWrite = true; n.doubleSide = true;
    if (tilt) n.rot = tilt.slice();
    this.scene.add(n);
    this.fx.push({ n, ring: true, life, max: life, R0: t0, R1: R });
    return n;
  }
  // 光の柱（登場・回復）
  beam(x, y, z, col, life = 0.5) {
    const n = new Node(PRIM.cyl, { color: col, unlit: true, alpha: 0.6, castShadow: false });
    n.setPos(x, y, z); n.transparent = true; n.noDepthWrite = true;
    this.scene.add(n);
    this.fx.push({ n, beam: true, life, max: life });
  }
  dust(x, y, z, count = 10, col = null) {
    const c = col || mixRgb(this.pal.pad, [1, 1, 1], 0.6);
    for (let i = 0; i < count; i++) { const a = i / count * Math.PI * 2; const n = this.particle(x + Math.cos(a) * 0.9, y + 0.15, z + Math.sin(a) * 0.9, Math.cos(a) * 2.4, 0.5 + Math.random() * 0.6, Math.sin(a) * 2.4, c, 0.45, 0.2, PRIM.sphereHi, -1.2, { grow: 2.2, drag: 3 }); n.maxA = 0.55; }
  }
  // 色違いの登場：キラーン！（光の輪・星のはじけ・大きな光の十字）
  sparkle(side, slot) {
    const e = this.mons[this.key(side, slot)]; if (!e) return Promise.resolve();
    const [x, y0, z] = e.base; const h = e.M.height;
    const top = [x, y0 + h * 0.75, z];
    if (this.onGlint) this.onGlint(top);
    this.ring(x, y0 + 0.15, z, [1, 0.92, 0.45], 0.4, 3.4, 0.55);
    this.ring(top[0], top[1], top[2], [1, 1, 1], 0.2, 2.2, 0.4, [Math.PI / 2, 0, 0]);
    this.burst(top[0], top[1], top[2], [[1, 0.95, 0.5], [1, 1, 1], [0.7, 0.9, 1]], 26, 5, PRIM.star, 0.32, { grav: -2, spin: 6 });
    for (let i = 0; i < 26; i++) setTimeout(() => this.particle(x + (Math.random() - 0.5) * 2.6, y0 + h * (0.2 + Math.random()), z + (Math.random() - 0.5) * 2.6, 0, 1.2, 0, i % 3 ? [1, 0.95, 0.5] : [1, 1, 1], 0.9, 0.38, PRIM.star, 0), 120 + i * 40);
    return this.wait(1150);
  }
  center(side, slot) { const e = this.mons[this.key(side, slot)]; const p = e ? e.base : this.slotPos(side, slot); return [p[0], (p[1] || 0) + (e ? e.M.height * 0.5 : 1), p[2]]; }

  // ---- カメラワーク ----
  // 指定した位置を見る（ms で移動・hold だけ止まる）
  shot(pos, look, ms = 300) { this.camShot = { from: this.cam.pos.slice(), fromL: this.cam.target.slice(), pos, look, t: 0, ms }; }
  resetShot(ms = 400) { this.shot(this.camBase.slice(), this.camLook.slice(), ms); this.camShot.release = true; }

  // ---- 技 ----
  async playMove(side, slot, tside, tslot, type, isStatus) {
    const e = this.mons[this.key(side, slot)];
    if (!e) return;
    const col = hexToRgb(TYPE_COLOR[type] || '#ffffff');
    const [x0, y0, z0] = this.center(side, slot);
    if (isStatus) {
      e.state = 'roar';
      this.ring(e.base[0], e.base[1] + 0.1, e.base[2], col, 0.4, 2.8, 0.5);
      for (let i = 0; i < 14; i++) this.particle(x0 + Math.cos(i) * 1.3, e.base[1] + 0.2, z0 + Math.sin(i) * 1.3, 0, 3 + Math.random() * 2, 0, col, 0.7, 0.2, PRIM.star, 0);
      await this.tween(520, t => { e.M.root.setScale(1 + Math.sin(t * Math.PI) * 0.14); });
      e.state = 'battle';
      return;
    }
    const tp = this.center(tside, tslot);
    const sp = e.base;
    const dx = tp[0] - sp[0], dz = tp[2] - sp[2], L = Math.hypot(dx, dz) || 1;
    // 攻撃する側に少し寄る
    const side0 = side === 0;
    this.shot([lerp(this.camBase[0], x0, 0.35) + (side0 ? 0.5 : 2.5), this.camBase[1] - 0.6, lerp(this.camBase[2], z0, 0.3)], [lerp(x0, tp[0], 0.3), y0, lerp(z0, tp[2], 0.3)], 220);
    e.state = 'attack';
    // ため → 突進
    await this.tween(140, t => { const k = -Math.sin(t * Math.PI / 2) * 0.35; e.M.root.setPos(sp[0] + dx / L * k, sp[1], sp[2] + dz / L * k); });
    await this.tween(170, t => { const k = -0.35 + Math.sin(t * Math.PI / 2) * 2.0; e.M.root.setPos(sp[0] + dx / L * k, sp[1] + Math.sin(t * Math.PI) * 0.45, sp[2] + dz / L * k); });
    const from = [x0 + dx / L * 1.6, y0, z0 + dz / L * 1.6];
    // 相手側にカメラを向ける
    this.shot([lerp(this.camBase[0], tp[0], 0.25) + 1.5, this.camBase[1] - 0.3, lerp(this.camBase[2], tp[2], 0.25) + 1], [tp[0] * 0.8, tp[1], tp[2] * 0.8], 260);
    await this.typeFx(type, col, from, tp);
    await this.tween(200, t => { const k = (1 - t) * 1.65; e.M.root.setPos(sp[0] + dx / L * k, sp[1], sp[2] + dz / L * k); });
    e.M.root.setPos(sp[0], sp[1], sp[2]);
    e.state = 'battle';
  }
  // タイプごとの飛び道具・演出（命中の瞬間まで）
  async typeFx(type, col, a, b) {
    const lighter = mixRgb(col, [1, 1, 1], 0.5);
    const dir = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], T = 0.3;
    const vel = (k = 1) => [dir[0] / T * k, dir[1] / T * k, dir[2] / T * k];
    const stream = (n, gap, mk) => new Promise(res => { for (let i = 0; i < n; i++) setTimeout(() => { mk(i); if (i === n - 1) setTimeout(res, T * 1000); }, i * gap); });
    switch (type) {
      case 'fire':
        await stream(12, 22, (i) => { const v = vel(); this.particle(a[0], a[1], a[2], v[0] + (Math.random() - 0.5), v[1] + (Math.random() - 0.5), v[2] + (Math.random() - 0.5), i % 3 ? [1, 0.5, 0.1] : [1, 0.9, 0.4], T, 0.3, PRIM.drop, 0, { grow: 1.5, rot: [Math.PI / 2, 0, 0] }); });
        this.burst(b[0], b[1], b[2], [[1, 0.45, 0.1], [1, 0.8, 0.3], [1, 0.25, 0.1]], 22, 5, PRIM.drop, 0.3, { grow: 0.8 });
        for (let i = 0; i < 6; i++) this.particle(b[0] + (Math.random() - 0.5), b[1], b[2] + (Math.random() - 0.5), 0, 1.5 + Math.random(), 0, [0.35, 0.3, 0.32], 1.0, 0.4, PRIM.sphere, 0, { grow: 1.2, lit: true });
        this.ring(b[0], b[1], b[2], [1, 0.6, 0.2], 0.3, 2.8, 0.35, [Math.PI / 2, 0, 0]);
        break;
      case 'water':
        await stream(14, 18, () => { const v = vel(); this.particle(a[0], a[1], a[2], v[0] + (Math.random() - 0.5) * 0.6, v[1] + 1.5, v[2] + (Math.random() - 0.5) * 0.6, Math.random() < 0.5 ? [0.35, 0.7, 1] : [0.75, 0.92, 1], T, 0.24, PRIM.sphereHi, -10); });
        this.burst(b[0], b[1], b[2], [[0.45, 0.78, 1], [0.85, 0.96, 1]], 24, 5, PRIM.sphereHi, 0.18, { grav: -12 });
        this.ring(b[0], b[1] - 0.5, b[2], [0.7, 0.9, 1], 0.4, 2.6, 0.4);
        break;
      case 'grass': case 'bug':
        await stream(10, 30, (i) => { const v = vel(); this.particle(a[0], a[1], a[2], v[0] + Math.sin(i) * 1.5, v[1] + Math.cos(i) * 1.5, v[2], type === 'bug' ? [0.7, 0.85, 0.2] : (i % 2 ? [0.45, 0.85, 0.3] : [0.65, 0.95, 0.4]), T, 0.32, PRIM.leaf, 0, { spin: 12 }); });
        this.burst(b[0], b[1], b[2], [[0.45, 0.85, 0.3], [0.8, 1, 0.5]], 18, 4, PRIM.leaf, 0.3, { spin: 10 });
        break;
      case 'electric':
        this.bolt(a, b, [1, 0.95, 0.4]); await this.wait(70); this.bolt(a, b, [1, 1, 0.8]); await this.wait(90); this.bolt([b[0], b[1] + 6, b[2]], b, [1, 0.95, 0.5]);
        this.burst(b[0], b[1], b[2], [[1, 0.95, 0.4], [1, 1, 1]], 20, 6, PRIM.star, 0.22);
        this.ring(b[0], b[1], b[2], [1, 0.95, 0.5], 0.3, 2.4, 0.3, [Math.PI / 2, 0, 0]);
        break;
      case 'ice':
        await stream(10, 30, () => { const v = vel(); this.particle(a[0], a[1], a[2], v[0], v[1], v[2], [0.75, 0.95, 1], T, 0.3, PRIM.gem, 0, { spin: 8 }); });
        this.burst(b[0], b[1], b[2], [[0.8, 0.95, 1], [1, 1, 1]], 18, 5, PRIM.gem, 0.22, { spin: 6 });
        this.ring(b[0], b[1] - 0.6, b[2], [0.85, 0.97, 1], 0.4, 2.4, 0.5);
        break;
      case 'rock': case 'ground': case 'steel': {
        const c2 = type === 'steel' ? [0.85, 0.88, 0.95] : type === 'ground' ? [0.75, 0.55, 0.35] : [0.66, 0.6, 0.52];
        await stream(6, 40, () => { const v = vel(); this.particle(a[0], a[1] + 0.5, a[2], v[0], v[1] + 3, v[2], c2, T, 0.38, type === 'steel' ? PRIM.box : PRIM.sphereLo, -18, { lit: true, spin: 6 }); });
        this.burst(b[0], b[1], b[2], c2, 18, 5, PRIM.sphereLo, 0.24, { lit: true });
        this.dust(b[0], b[1] - 1, b[2], 10);
        break;
      }
      case 'psychic': case 'fairy': case 'ghost': case 'dark': case 'poison': {
        const c2 = type === 'poison' ? [0.75, 0.4, 0.95] : type === 'dark' ? [0.35, 0.25, 0.45] : lighter;
        for (let i = 0; i < 4; i++) { const k = i / 4; this.ring(lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k), i % 2 ? col : c2, 0.2, 1.2, 0.45); await this.wait(60); }
        await stream(8, 25, () => { const v = vel(); this.particle(a[0], a[1], a[2], v[0], v[1], v[2], type === 'poison' ? [0.75, 0.35, 0.95] : c2, T, 0.3, type === 'fairy' ? PRIM.star : PRIM.sphereHi, 0, { grow: 0.6 }); });
        this.burst(b[0], b[1], b[2], [col, c2], 20, 4, type === 'fairy' ? PRIM.star : PRIM.sphereHi, 0.22);
        this.ring(b[0], b[1], b[2], col, 0.3, 3, 0.45, [Math.PI / 2, 0, 0]);
        break;
      }
      case 'dragon': {
        const bm = new Node(PRIM.cyl, { color: col, unlit: true, alpha: 0.85, castShadow: false }); bm.transparent = true; bm.noDepthWrite = true;
        const L = Math.hypot(...dir); const yaw = Math.atan2(dir[0], dir[2]), pitch = Math.atan2(Math.hypot(dir[0], dir[2]), dir[1]);
        bm.setPos(a[0], a[1], a[2]); bm.rot = [pitch, yaw, 0]; this.scene.add(bm);
        await this.tween(260, t => bm.setScale(0.35 * (1 - t * 0.3), L * Math.min(1, t * 2), 0.35 * (1 - t * 0.3)));
        this.scene.root.remove(bm);
        this.burst(b[0], b[1], b[2], [col, lighter, [1, 1, 1]], 26, 6, PRIM.star, 0.28);
        this.ring(b[0], b[1], b[2], lighter, 0.4, 3.6, 0.5, [Math.PI / 2, 0, 0]);
        break;
      }
      case 'flying':
        for (let i = 0; i < 3; i++) { const n = this.ring(lerp(a[0], b[0], 0.3 + i * 0.25), lerp(a[1], b[1], 0.3 + i * 0.25), lerp(a[2], b[2], 0.3 + i * 0.25), [0.9, 0.97, 1], 0.6, 1.4, 0.35, [0, Math.atan2(dir[0], dir[2]), 0]); void n; await this.wait(70); }
        this.burst(b[0], b[1], b[2], [[0.9, 0.97, 1], [1, 1, 1]], 16, 5, PRIM.leaf, 0.3, { spin: 14 });
        break;
      default: // normal / fighting：衝撃の星
        await this.wait(60);
        this.burst(b[0], b[1], b[2], [[1, 1, 1], lighter], 16, 5, PRIM.star, 0.32);
        this.ring(b[0], b[1], b[2], [1, 1, 1], 0.3, 2.6, 0.3, [Math.PI / 2, Math.atan2(dir[0], dir[2]), 0]);
    }
  }
  // 稲妻（ジグザグの線をその場で作る）
  bolt(a, b, col) {
    const g = new GeoBuilder();
    const n = 9; let prev = a;
    for (let i = 1; i <= n; i++) {
      const t = i / n, j = i === n ? 0 : 0.55;
      const p = [lerp(a[0], b[0], t) + (Math.random() - 0.5) * j, lerp(a[1], b[1], t) + (Math.random() - 0.5) * j, lerp(a[2], b[2], t) + (Math.random() - 0.5) * j];
      const d = [p[0] - prev[0], p[1] - prev[1], p[2] - prev[2]], L = Math.hypot(...d);
      g.setMatrix(M4.fromTRS([(p[0] + prev[0]) / 2, (p[1] + prev[1]) / 2, (p[2] + prev[2]) / 2], [Math.atan2(Math.hypot(d[0], d[2]), d[1]), Math.atan2(d[0], d[2]), 0], [1, 1, 1])).box(0.12, L, 0.12, col, 0, 0, 0).setMatrix(null);
      prev = p;
    }
    const nd = new Node(g.build(), { unlit: true, castShadow: false, alpha: 1 }); nd.transparent = true; nd.noDepthWrite = true;
    this.scene.add(nd);
    this.fx.push({ n: nd, flick: true, life: 0.16, max: 0.16 });
  }
  async hit(side, slot, eff = 1, crit = false) {
    const e = this.mons[this.key(side, slot)]; if (!e) return;
    const [x, y, z] = this.center(side, slot);
    this.burst(x, y, z, eff > 1 ? [[1, 0.9, 0.3], [1, 1, 1]] : [1, 1, 1], eff > 1 ? 24 : 12, eff > 1 ? 6 : 4, PRIM.star, 0.2);
    if (eff > 1 || crit) { this.hitStop = 0.09; this.ring(x, y, z, [1, 1, 1], 0.4, 4, 0.35, [Math.PI / 2, 0, 0]); }
    this.shake = eff > 1 || crit ? 0.75 : 0.3;
    const nodes = []; e.M.root.traverse(n => { if (n.geo) nodes.push(n); });
    e.state = 'hurt';
    const away = e.base[2] > 0 ? 1 : -1;
    await this.tween(440, t => {
      const on = Math.floor(t * 8) % 2 === 0;
      for (const n of nodes) { n._emis0 = n._emis0 || n.emis.slice(); n.emis = on ? [0.7, 0.7, 0.7] : n._emis0; }
      const kb = Math.sin(Math.min(1, t * 3) * Math.PI) * 0.35 * (1 - t);
      e.M.root.pos[0] = e.base[0] + Math.sin(t * 40) * 0.12 * (1 - t);
      e.M.root.pos[2] = e.base[2] + kb * away;
    });
    for (const n of nodes) if (n._emis0) n.emis = n._emis0;
    e.M.root.pos[0] = e.base[0]; e.M.root.pos[2] = e.base[2];
    e.state = 'battle';
    this.resetShot(350);
  }
  async faint(side, slot) {
    const e = this.mons[this.key(side, slot)]; if (!e) return;
    e.state = 'hurt';
    await this.tween(260, t => { e.M.root.rot[2] = t * 0.35; });
    this.dust(e.base[0], e.base[1], e.base[2], 14);
    await this.tween(520, t => { e.M.root.pos[1] = e.base[1] - t * e.M.height * 1.1; e.M.root.setScale(1 - t * 0.35); });
    this.clearMon(side, slot);
  }
  statFx(side, slot, up) {
    const e = this.mons[this.key(side, slot)]; if (!e) return this.wait(10);
    const [x, , z] = e.base;
    const col = up ? [1, 0.55, 0.35] : [0.4, 0.6, 1];
    for (let i = 0; i < 16; i++) this.particle(x + (Math.random() - 0.5) * 2, e.base[1] + (up ? 0.2 : e.M.height + 0.5), z + (Math.random() - 0.5) * 2, 0, up ? 4 : -4, 0, col, 0.55, 0.16, PRIM.cone4, 0, { spin: 0, rot: up ? [0, 0, 0] : [Math.PI, 0, 0] });
    this.ring(x, e.base[1] + 0.1, z, col, 0.5, 2.4, 0.5);
    return this.wait(520);
  }
  statusFx(side, slot, st) {
    const col = { brn: [1, 0.4, 0.1], psn: [0.7, 0.3, 0.9], par: [1, 0.9, 0.2], slp: [0.8, 0.8, 1], frz: [0.6, 0.9, 1] }[st] || [1, 1, 1];
    const [x, y, z] = this.center(side, slot);
    this.burst(x, y, z, col, 18, 3, st === 'frz' ? PRIM.gem : st === 'par' ? PRIM.star : PRIM.sphereLo, 0.2);
    return this.wait(420);
  }
  healFx(side, slot) {
    const e = this.mons[this.key(side, slot)]; if (!e) return this.wait(10);
    const [x, , z] = e.base;
    this.beam(x, e.base[1], z, [0.5, 1, 0.6], 0.7);
    for (let i = 0; i < 18; i++) this.particle(x + (Math.random() - 0.5) * 2, e.base[1] + 0.2, z + (Math.random() - 0.5) * 2, 0, 2.5 + Math.random() * 2, 0, [0.5, 1, 0.6], 0.8, 0.22, PRIM.star, 0);
    return this.wait(520);
  }
  protectFx(side, slot) {
    const [x, y, z] = this.center(side, slot);
    const n = new Node(PRIM.sphereHi, { color: [0.5, 0.95, 0.65], alpha: 0.35, unlit: true, castShadow: false }); n.setPos(x, y, z); n.setScale(2.2); n.noDepthWrite = true; this.scene.add(n);
    return this.tween(520, t => { n.color[3] = 0.42 * (1 - t); n.setScale(2.2 + t * 0.3); }).then(() => this.scene.root.remove(n));
  }
  // エサを投げてなつかせる演出
  async catchSeq(side, slot, shakes, ok, foodColor = [0.95, 0.7, 0.3]) {
    const e = this.mons[this.key(side, slot)]; if (!e) return;
    const [tx, ty, tz] = this.center(side, slot);
    const s0 = [this.camBase[0] - 2, 1.2, this.camBase[2] - 4];
    const food = new Node(PRIM.sphereHi, { color: foodColor, castShadow: true }); food.setScale(0.35); this.scene.add(food);
    this.shot([lerp(this.camBase[0], tx, 0.4) + 2, this.camBase[1] - 0.8, lerp(this.camBase[2], tz, 0.4) + 1.5], [tx, ty, tz], 500);
    await this.tween(600, t => { food.setPos(s0[0] + (tx - s0[0]) * t, s0[1] + Math.sin(t * Math.PI) * 4.5 + (e.base[1] + 0.3 - s0[1]) * t, s0[2] + (tz + 1.2 - s0[2]) * t); food.rot[0] += 0.3; });
    // もぐもぐ
    for (let i = 0; i < 3; i++) {
      if (i >= shakes) break;
      await this.tween(380, t => { e.M.root.rot[0] = Math.sin(t * Math.PI * 2) * 0.25; food.setScale(0.35 * (1 - (i + t) / 3.2)); });
      this.particle(tx + (Math.random() - 0.5), ty + e.M.height * 0.6, tz, 0, 2, 0, [1, 0.35, 0.55], 0.9, 0.32, PRIM.sphereHi, 0);
      this.particle(tx + (Math.random() - 0.5), ty + e.M.height * 0.6 + 0.2, tz, 0.3, 2.2, 0, [1, 0.45, 0.6], 0.9, 0.26, PRIM.sphereHi, 0);
      await this.wait(220);
    }
    this.scene.root.remove(food);
    e.M.root.rot[0] = 0;
    if (ok) {
      e.state = 'happy';
      for (let i = 0; i < 14; i++) this.particle(tx + Math.cos(i) * 1.5, ty + e.M.height * 0.5, tz + Math.sin(i) * 1.5, Math.cos(i) * 2, 3, Math.sin(i) * 2, [1, 0.4, 0.6], 1.2, 0.32, PRIM.star, -2);
      this.ring(e.base[0], e.base[1] + 0.1, e.base[2], [1, 0.6, 0.75], 0.4, 3, 0.6);
      await this.wait(900);
      e.state = 'battle';
    } else { await this.tween(300, t => { e.M.root.rot[1] = e.ry + Math.sin(t * Math.PI) * 1.2; }); e.M.root.rot[1] = e.ry; }
    this.resetShot(500);
  }

  update(dt) {
    // ヒットストップ（強い攻撃の瞬間だけ時間を止める）
    if (this.hitStop > 0) { this.hitStop -= dt; dt *= 0.08; }
    this.t += dt;
    for (let i = this.tweens.length - 1; i >= 0; i--) {
      const tw = this.tweens[i]; tw.t += dt * 1000;
      const k = Math.min(1, tw.t / tw.ms);
      // 演出の 途中で エラーが 出ても、その演出だけ 終わらせて 先に進む（バトルが 固まらないように）
      let bad = false;
      try { tw.fn(k); } catch (e) { bad = true; console.warn(e); }
      if (k >= 1 || bad) { this.tweens.splice(i, 1); tw.res(); }
    }
    for (let i = this.fx.length - 1; i >= 0; i--) {
      const f = this.fx[i]; if (!f || !f.n) { this.fx.splice(i, 1); continue; } f.life -= dt;
      const k = 1 - Math.max(0, f.life) / f.max;
      if (f.ring) { const R = lerp(f.R0, f.R1, 1 - (1 - k) * (1 - k)); f.n.setScale(R, R * 0.6, R); f.n.color[3] = 0.9 * (1 - k); }
      else if (f.beam) { f.n.setScale(0.9 * (1 - k * 0.6), 8 * Math.min(1, k * 4), 0.9 * (1 - k * 0.6)); f.n.color[3] = 0.6 * (1 - k); }
      else if (f.flick) { f.n.visible = Math.random() > 0.25; f.n.color[3] = 1 - k; }
      else {
        f.vy += f.grav * dt;
        if (f.drag) { const d = Math.max(0, 1 - f.drag * dt); f.vx *= d; f.vy *= d; f.vz *= d; }
        f.n.pos[0] += f.vx * dt; f.n.pos[1] += f.vy * dt; f.n.pos[2] += f.vz * dt;
        f.n.color[3] = Math.max(0, Math.min(f.n.maxA || 1, f.life / f.max * 1.5));
        if (f.grow) f.n.setScale(f.size * (1 + k * f.grow));
        f.n.rot[2] += dt * f.spin; f.n.rot[1] += dt * f.spin * 0.6;
      }
      if (f.life <= 0) { this.scene.root.remove(f.n); this.fx.splice(i, 1); }
    }
    for (const k in this.mons) { const e = this.mons[k]; try { animateAnimon(e.M, dt, e.state || 'battle'); } catch (er) { /* */ } }
    // カメラ
    this.shake = Math.max(0, this.shake - dt * 2.2);
    const sh = this.shake * 0.5;
    if (this.camShot) {
      const c = this.camShot; c.t = Math.min(1, c.t + dt * 1000 / c.ms);
      const k = 1 - Math.pow(1 - c.t, 3);
      for (let i = 0; i < 3; i++) { this.cam.pos[i] = lerp(c.from[i], c.pos[i], k); this.cam.target[i] = lerp(c.fromL[i], c.look[i], k); }
      if (c.t >= 1 && c.release) this.camShot = null;
    } else {
      // 待機中はゆっくり横にゆれる
      const sway = Math.sin(this.t * 0.35) * 0.45, bob = Math.sin(this.t * 0.5) * 0.12;
      // 横長で背の低い画面（スマホ横向き）は下のメッセージ欄に隠れないよう、場面を少し上に・引きで写す
      const ar = innerWidth / Math.max(1, innerHeight), wide = Math.min(1, Math.max(0, (ar - 1.75) / 0.45));
      const want = [this.camBase[0] + sway, this.camBase[1] + bob + wide * 0.5, this.camBase[2] + Math.cos(this.t * 0.35) * 0.2 + wide * 1.2];
      const look = [this.camLook[0], this.camLook[1] - wide * 1.25, this.camLook[2]];
      for (let i = 0; i < 3; i++) { this.cam.pos[i] = lerp(this.cam.pos[i], want[i], Math.min(1, dt * 2.5)); this.cam.target[i] = lerp(this.cam.target[i], look[i], Math.min(1, dt * 3)); }
    }
    if (sh > 0) { this.cam.pos = [this.cam.pos[0] + (Math.random() - 0.5) * sh, this.cam.pos[1] + (Math.random() - 0.5) * sh, this.cam.pos[2]]; }
    if (this.sky) this.sky.update(dt, this.cam);
    if (this.amb) this.amb.update(dt, [0, 0.3, -2], this.scene.wind);
  }
}
