// =============================================================
//  大陸ワールドの生成と描画
// =============================================================
import { Node, GeoBuilder, PRIM, initPrims, M4, hexToRgb, mixRgb, MAT } from '../engine/gl3d.js';
import { fbm, ridge, vnoise, smooth, clamp, lerp, mulberry32 } from '../engine/util.js';
import { getFlora, getSmallFlora, stamp } from './flora.js';
import { WORLD, REGIONS, RING, TOWNS, STONES, DUNGEONS, ITEM_BALLS, START_POS, SANCT_R, INNER_R, COAST_R, VOLCANO_C, LAKE_C, ringAt, regionAt, polar, angDeg, angDist } from '../data/world.js';

const N = WORLD.n, CELL = WORLD.cell, HALF = WORLD.half, CH = 32; // チャンク = 32セル
const MAT_GLOSS = null;
export const NCH = N / CH;
const RID = ['start', 'plains', 'forest', 'lake', 'desert', 'canyon', 'snow', 'swamp', 'highland', 'volcano', 'sanctuary', 'inner', 'sea'];
export const REGION_INDEX = Object.fromEntries(RID.map((r, i) => [r, i]));

// ---------- 地形の高さ ----------
function biomeH(b, x, z) {
  switch (b) {
    // 起伏をはっきり（丘・くぼみ・小さな尾根）
    case 'plains': return Math.max(1.4, 4 + (fbm(x / 70, z / 70, 4, 1) - 0.42) * 17 + ridge(x / 38, z / 38, 2, 2) * 3.2 + fbm(x / 16, z / 16, 2, 2) * 1.4);
    case 'forest': return Math.max(1.6, 5 + (fbm(x / 52, z / 52, 4, 3) - 0.42) * 22 + fbm(x / 15, z / 15, 2, 3) * 1.6);
    case 'lake': {
      const d = Math.hypot(x - LAKE_C[0], z - LAKE_C[1]) + (fbm(x / 30, z / 30, 2, 9) - 0.5) * 40;
      const base = 2.5 + fbm(x / 60, z / 60, 3, 4) * 5;
      return lerp(-7, base, smooth(75, 135, d));
    }
    case 'desert': return 3 + ridge(x / 55, z / 55, 3, 5) * 11 + fbm(x / 200, z / 200, 2, 6) * 5;
    case 'canyon': { const n = fbm(x / 75, z / 75, 4, 7); return 4 + smooth(0.47, 0.6, n) * 15 + smooth(0.62, 0.72, n) * 8 + fbm(x / 18, z / 18, 2, 8) * 1.5; }
    case 'snow': { const r = Math.hypot(x, z); return 6 + ridge(x / 85, z / 85, 4, 10) * 30 * smooth(300, 560, r) + fbm(x / 40, z / 40, 3, 11) * 4; }
    case 'swamp': return 1.0 + (fbm(x / 40, z / 40, 4, 12) - 0.5) * 7;
    case 'highland': { const b = 15 + (fbm(x / 60, z / 60, 4, 13) - 0.42) * 20; const st = 3.2, f = b / st, fl = Math.floor(f); return (fl + smooth(0.62, 0.92, f - fl)) * st * 0.7 + b * 0.3; }
    case 'volcano': {
      const d = Math.hypot(x - VOLCANO_C[0], z - VOLCANO_C[1]);
      const cone = Math.max(0, 1 - d / 175);
      let h = 5 + fbm(x / 50, z / 50, 3, 14) * 4 + 60 * Math.pow(cone, 1.5);
      if (d < 22) h -= (22 - d) * 1.6;
      return h;
    }
    case 'sanctuary': return 6 + fbm(x / 50, z / 50, 3, 15) * 2.5;
    case 'inner': return 8 + fbm(x / 30, z / 30, 2, 16) * 1;
  }
  return 3;
}
function rawHeight(x, z) {
  const r = Math.hypot(x, z);
  let h;
  const ring = ringAt(x, z);
  const t = ring.d / 20; // 0=中心 1=境界
  const w2 = 0.5 * smooth(0.5, 1.0, t);
  h = biomeH(REGIONS[ring.id].biome, x, z);
  if (w2 > 0.001) h = lerp(h, biomeH(REGIONS[ring.id2].biome, x, z), w2);
  // 聖域（中央）
  if (r < SANCT_R + 40) {
    const hs = r < INNER_R + 20 ? lerp(biomeH('inner', x, z), biomeH('sanctuary', x, z), smooth(INNER_R - 15, INNER_R + 20, r)) : biomeH('sanctuary', x, z);
    h = lerp(hs, h, smooth(SANCT_R - 25, SANCT_R + 40, r));
  }
  // 聖域を囲む山脈（火山側に門）
  const gate = 1 - smooth(4, 10, angDist(angDeg(x, z), 50));
  const ringM = smooth(SANCT_R - 15, SANCT_R + 5, r) * smooth(SANCT_R + 45, SANCT_R + 20, r) * (1 - gate);
  h += ringM * (18 + ridge(x / 25, z / 25, 2, 17) * 14);
  // はじまりの町周辺はなだらかに
  const ds = Math.hypot(x - START_POS[0], z - START_POS[1]);
  h = lerp(4 + fbm(x / 60, z / 60, 3, 18) * 3, h, smooth(110, 170, ds));
  // 起伏を強調（立体感）
  if (h > 3) h = 3 + (h - 3) * 1.32;
  // 海岸
  const coast = COAST_R + (fbm(x / 120, z / 120, 3, 19) - 0.5) * 90;
  h = lerp(h, -9, smooth(coast - 45, coast + 25, r));
  return h;
}

// 台地（がけで囲まれた高台）：地形に立体感を出す
function mesaH(x, z) {
  const ring = ringAt(x, z);
  const B = REGIONS[ring.id]?.biome;
  if (!['plains', 'highland', 'desert', 'forest', 'lake', 'swamp'].includes(B)) return 0;
  if (Math.hypot(x - START_POS[0], z - START_POS[1]) < 150) return 0;
  const m = fbm(x / 62, z / 62, 3, 41);
  const t1 = B === 'desert' ? 0.6 : B === 'highland' ? 0.6 : 0.63;
  const amp = B === 'highland' ? 6.5 : B === 'swamp' ? 2.5 : 4.8;
  // 境界から少し内側へ（がけを地域の内側に）
  const edge = smooth(0.35, 0.7, 1 - ring.d / 20);
  return (smooth(t1, t1 + 0.022, m) * amp + smooth(t1 + 0.075, t1 + 0.095, m) * amp * 0.7) * edge;
}

// ---------- ワールド ----------
export class World {
  constructor(opts = {}) {
    initPrims();
    this.light = !!opts.light;
    this.instancing = !!opts.instancing;
    this.clearSpots = opts.clear || [];
    this.node = new Node();
    this.chunks = new Map();
    this.H = new Float32Array((N + 1) * (N + 1));
    this.REG = new Uint8Array(N * N);
    this.GRASS = new Uint8Array(N * N);
    this.ROAD = new Uint8Array(N * N);
    this.FLAT = new Uint8Array(N * N);
    this.obst = new Map(); // セル→[{x,z,r}]
    this.boxes = [];       // 建物 AABB
    this.triggers = [];    // 扉・岩・アイテムなど
    this.labels = [];      // 画面に出す名前
    this._gen();
  }
  idx(i, j) { return j * (N + 1) + i; }
  toCell(x) { return Math.floor((x + HALF) / CELL); }

  _roads() {
    const pts = [START_POS, [0, 400], ...RING.slice(1).map(id => TOWNS.find(t => t.region === id).pos), polar(50, 240), TOWNS.find(t => t.id === 'sanctuary').pos];
    const segs = [];
    for (let i = 0; i < pts.length - 1; i++) segs.push([pts[i], pts[i + 1]]);
    // 平原から火山の里へ（近道）
    segs.push([[0, 400], TOWNS.find(t => t.id === 'volcano').pos]);
    // ダンジョンへの小道
    for (const d of Object.values(DUNGEONS)) { const t = TOWNS.find(tt => tt.region === d.region); if (t) segs.push([t.pos, d.pos]); }
    return segs;
  }

  _gen() {
    // 町の地ならし高さ
    this.townH = TOWNS.map(t => Math.max(2, rawHeight(t.pos[0], t.pos[1])));
    const flatSpots = [...TOWNS.map((t, i) => ({ x: t.pos[0], z: t.pos[1], r: t.r + 6, h: this.townH[i] })),
      ...Object.values(DUNGEONS).map(d => ({ x: d.pos[0], z: d.pos[1], r: 10, h: Math.max(2, rawHeight(d.pos[0], d.pos[1])) })),
      ...STONES.filter(s => !s.town).map(s => ({ x: s.pos[0], z: s.pos[1], r: 6, h: Math.max(1.5, rawHeight(s.pos[0], s.pos[1])) }))];
    this.flatSpots = flatSpots;
    this.townsFlat = TOWNS.map(t => ({ x: t.pos[0], z: t.pos[1], r: t.r }));
    this.clear = this.clearSpots || [];
    const segs = this.roadSegs = this._roads();
    this.flora = getFlora(this.light);
    this.small = getSmallFlora(this.light);
    for (const l of this.flora.crystal.concat(this.flora.goldcrystal, this.flora.purplecrystal)) l.mat = MAT.glossy;
    // 障害物の種類（木・岩など）。おつかいの素材集めに使う
    const F = this.flora;
    this._kindOf = new Map([[F.round, 'tree'], [F.pine, 'tree'], [F.autumn, 'tree'], [F.blossom, 'tree'], [F.snowpine, 'tree'], [F.dead, 'dead'],
      [F.bush, 'bush'], [F.rock, 'rock'], [F.mush, 'mush'], [F.glowmush, 'mush'], [F.cactus, 'cactus'], [F.crystal, 'crystal'], [F.goldcrystal, 'crystal'], [F.purplecrystal, 'crystal']]);
    for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++) {
      const x = i * CELL - HALF, z = j * CELL - HALF;
      let h = rawHeight(x, z);
      const ms = mesaH(x, z);
      if (ms > 0.01) {
        // 道の近くは台地にしない（道がふさがらないように）
        let rd = 1e9; for (const [a, b] of segs) { const d = distSeg(x, z, a, b); if (d < rd) rd = d; }
        h += ms * smooth(6, 16, rd);
      }
      for (const f of flatSpots) {
        const d = Math.hypot(x - f.x, z - f.z);
        if (d < f.r + 18) h = lerp(f.h, h, smooth(f.r, f.r + 18, d));
      }
      this.H[this.idx(i, j)] = h;
    }
    // セルごとの情報
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const x = (i + 0.5) * CELL - HALF, z = (j + 0.5) * CELL - HALF;
      const h = this.heightAt(x, z);
      const reg = regionAt(x, z, h);
      const k = j * N + i;
      this.REG[k] = REGION_INDEX[reg];
      let road = 0;
      for (const [a, b] of segs) { if (distSeg(x, z, a, b) < 4.5) { road = 1; break; } }
      this.ROAD[k] = road;
      let flat = 0;
      for (const f of flatSpots) if (Math.hypot(x - f.x, z - f.z) < f.r + 4) { flat = 1; break; }
      this.FLAT[k] = flat;
      const g = fbm(x / 34, z / 34, 3, 77);
      const slope = Math.abs(this.heightAt(x + 2, z) - this.heightAt(x - 2, z)) + Math.abs(this.heightAt(x, z + 2) - this.heightAt(x, z - 2));
      const okR = reg !== 'sea' && reg !== 'start' && reg !== 'inner';
      const thr = reg === 'plains' ? 0.55 : 0.58;
      this.GRASS[k] = (okR && !road && !flat && h > 0.7 && slope < 5 && g > thr) ? 1 : (reg === 'start' && !road && !flat && g > 0.66 && Math.hypot(x - START_POS[0], z - START_POS[1]) > 60 ? 1 : 0);
    }
  }
  heightAt(x, z) {
    const fx = (x + HALF) / CELL, fz = (z + HALF) / CELL;
    const i = clamp(Math.floor(fx), 0, N - 1), j = clamp(Math.floor(fz), 0, N - 1);
    const u = clamp(fx - i, 0, 1), v = clamp(fz - j, 0, 1);
    const H = this.H, a = H[this.idx(i, j)], b = H[this.idx(i + 1, j)], c = H[this.idx(i, j + 1)], d = H[this.idx(i + 1, j + 1)];
    return a * (1 - u) * (1 - v) + b * u * (1 - v) + c * (1 - u) * v + d * u * v;
  }
  groundAt(x, z) { return Math.max(this.heightAt(x, z), WORLD.sea); }
  cellInfo(x, z) {
    const i = this.toCell(x), j = this.toCell(z);
    if (i < 0 || j < 0 || i >= N || j >= N) return { region: 'sea', grass: 0, road: 0 };
    const k = j * N + i;
    return { region: RID[this.REG[k]], grass: this.GRASS[k], road: this.ROAD[k], flat: this.FLAT[k] };
  }
  regionAt(x, z) { return this.cellInfo(x, z).region; }

  // ---------- 色 ----------
  _color(x, z, h, reg, slope, road) {
    const n = fbm(x / 14, z / 14, 2, 31) * 0.7 + fbm(x / 60, z / 60, 2, 33) * 0.3, n2 = vnoise(x / 3, z / 3, 32);
    let c;
    const B = REGIONS[reg]?.biome || 'plains';
    const hk = clamp((h - 2) / 22, 0, 1); // 高いところほど明るく
    switch (B) {
      case 'plains': c = mixRgb(mixRgb([0.36, 0.7, 0.24], [0.56, 0.84, 0.3], n), [0.72, 0.88, 0.42], hk * 0.5); break;
      case 'forest': c = mixRgb(mixRgb([0.18, 0.5, 0.2], [0.3, 0.64, 0.24], n), [0.45, 0.72, 0.3], hk * 0.4); break;
      case 'lake': c = mixRgb([0.34, 0.72, 0.34], [0.5, 0.82, 0.38], n); break;
      case 'desert': c = mixRgb(mixRgb([0.98, 0.84, 0.52], [0.9, 0.7, 0.42], n), [1, 0.9, 0.66], hk * 0.5); break;
      case 'canyon': c = h > 14 ? mixRgb([0.86, 0.56, 0.34], [0.76, 0.48, 0.3], n) : mixRgb([0.82, 0.44, 0.28], [0.68, 0.36, 0.24], n); break;
      case 'snow': c = mixRgb([0.88, 0.93, 1], [0.98, 0.99, 1], n); if (h < 8) c = mixRgb(c, [0.68, 0.82, 0.92], 0.3); break;
      case 'swamp': c = mixRgb([0.27, 0.4, 0.22], [0.38, 0.48, 0.26], n); break;
      case 'highland': c = mixRgb(mixRgb([0.46, 0.8, 0.34], [0.64, 0.9, 0.42], n), [0.82, 0.94, 0.55], hk * 0.4); break;
      case 'volcano': { const d = Math.hypot(x - VOLCANO_C[0], z - VOLCANO_C[1]); c = mixRgb([0.34, 0.27, 0.27], [0.22, 0.18, 0.2], n); if (d < 60) c = mixRgb(c, [0.55, 0.2, 0.14], 0.45); break; }
      case 'sanctuary': c = mixRgb([0.7, 0.82, 0.52], [0.88, 0.86, 0.6], n); break;
      case 'inner': c = mixRgb([0.8, 0.74, 0.95], [0.92, 0.86, 1], n); break;
      default: c = [0.8, 0.75, 0.6];
    }
    // 崖（地層のしま模様）
    if (slope > 2.6 && B !== 'snow') {
      const band = (Math.floor(h / 1.7) % 2 + 2) % 2;
      const rock = B === 'canyon' || B === 'desert' ? (band ? [0.78, 0.46, 0.3] : [0.66, 0.38, 0.26]) : B === 'volcano' ? (band ? [0.3, 0.25, 0.26] : [0.22, 0.18, 0.2]) : (band ? [0.6, 0.56, 0.52] : [0.5, 0.47, 0.46]);
      c = mixRgb(c, rock, clamp((slope - 2.6) / 1.8, 0, 0.92));
    }
    if (B === 'snow' && slope > 3.5) c = mixRgb(c, [0.55, 0.62, 0.74], 0.5);
    if (h < 1.3 && h > -1 && B !== 'swamp') c = mixRgb([0.98, 0.9, 0.66], c, smooth(0.3, 1.3, h));
    if (h <= -1) c = mixRgb([0.86, 0.8, 0.58], [0.4, 0.6, 0.6], clamp(-h / 8, 0, 1));
    // 町の広場
    for (const t of this.townsFlat) { const d = Math.hypot(x - t.x, z - t.z); if (d < t.r * 0.42) { c = mixRgb([0.9, 0.84, 0.74], [0.8, 0.74, 0.66], n2); break; } if (d < t.r + 4 && !road) { c = mixRgb(c, [0.5, 0.8, 0.36], 0.25); } }
    { const gi = Math.floor((x + HALF) / CELL), gj = Math.floor((z + HALF) / CELL); if (gi >= 0 && gj >= 0 && gi < N && gj < N && this.GRASS && this.GRASS[gj * N + gi]) c = mixRgb(c, [0.1, 0.36, 0.1], 0.35); }
    if (road) c = B === 'snow' ? [0.8, 0.82, 0.88] : B === 'desert' ? [0.86, 0.72, 0.48] : B === 'volcano' ? [0.42, 0.36, 0.33] : B === 'inner' || B === 'sanctuary' ? [0.9, 0.88, 0.8] : [0.8, 0.66, 0.44];
    const v = 0.92 + n2 * 0.12;
    return [c[0] * v, c[1] * v, c[2] * v];
  }

  // 水面の深さ計算用の高さマップ（0〜255 = -12〜+4）
  hmapInfo() {
    if (this._hm) return this._hm;
    const W = N + 1, data = new Uint8Array(W * W);
    for (let k = 0; k < W * W; k++) data[k] = Math.max(0, Math.min(255, Math.round((this.H[k] + 12) / 16 * 255)));
    this._hm = { data, w: W, h: W, x0: -HALF, z0: -HALF, cell: CELL };
    return this._hm;
  }

  // ---------- チャンク ----------
  ensureChunks(cx, cz, radius) {
    const ci = Math.floor((cx + HALF) / (CH * CELL)), cj = Math.floor((cz + HALF) / (CH * CELL));
    const rc = Math.ceil(radius / (CH * CELL));
    let built = 0;
    for (let dj = -rc; dj <= rc; dj++) for (let di = -rc; di <= rc; di++) {
      const i = ci + di, j = cj + dj;
      if (i < 0 || j < 0 || i >= NCH || j >= NCH) continue;
      const key = i + ',' + j;
      if (!this.chunks.has(key)) {
        if (built >= 1) continue; // 1フレームに作りすぎない
        this.chunks.set(key, this._buildChunk(i, j)); built++;
      }
    }
    // 表示切替・遠いチャンクは破棄してメモリを節約
    for (const [key, ch] of this.chunks) {
      const [i, j] = key.split(',').map(Number);
      const d = Math.max(Math.abs(i - ci), Math.abs(j - cj));
      ch.node.visible = d <= rc + 1;
      if (d > rc + 3) this._disposeChunk(key, ch, i, j);
    }
    return built;
  }
  _disposeChunk(key, ch, ci, cj) {
    ch.node.traverse(n => { if (n.geo) n.geo.dispose(); });
    this.node.remove(ch.node);
    this.chunks.delete(key);
    for (let j = cj * CH; j < (cj + 1) * CH; j++) for (let i = ci * CH; i < (ci + 1) * CH; i++) this.obst.delete(i + ',' + j);
  }
  buildAll(cx, cz, radius) { let b; do { b = this.ensureChunks(cx, cz, radius); } while (b > 0); }
  _Hc(i, j) { return this.H[this.idx(clamp(i, 0, N), clamp(j, 0, N))]; }

  _buildChunk(ci, cj) {
    const node = new Node();
    const tb = new GeoBuilder();   // 地面
    const gb = new GeoBuilder();   // 木・岩など（輪郭線あり）
    const i0 = ci * CH, j0 = cj * CH;
    // 地形（くぼみは暗く・尾根は明るく）
    for (let j = 0; j <= CH; j++) for (let i = 0; i <= CH; i++) {
      const gi = i0 + i, gj = j0 + j;
      const x = gi * CELL - HALF, z = gj * CELL - HALF;
      const h = this.H[this.idx(gi, gj)];
      const hl = this._Hc(gi - 1, gj), hr = this._Hc(gi + 1, gj), hd = this._Hc(gi, gj - 1), hu = this._Hc(gi, gj + 1);
      let nx = hl - hr, ny = 2 * CELL, nz = hd - hu; const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
      const slope = Math.abs(hl - hr) + Math.abs(hd - hu);
      const ci2 = Math.min(N - 1, gi), cj2 = Math.min(N - 1, gj);
      const k = cj2 * N + ci2;
      const reg = RID[this.REG[k]];
      const col = this._color(x, z, h, reg === 'sea' ? (ringAt(x, z).id) : reg, slope, this.ROAD[k]);
      const avg = (this._Hc(gi - 2, gj) + this._Hc(gi + 2, gj) + this._Hc(gi, gj - 2) + this._Hc(gi, gj + 2)) / 4;
      const ao = clamp(1 + (h - avg) * 0.055, 0.74, 1.12);
      tb._push(x, h, z, nx, ny, nz, [col[0] * ao, col[1] * ao, col[2] * ao]);
    }
    for (let j = 0; j < CH; j++) for (let i = 0; i < CH; i++) {
      const a = j * (CH + 1) + i, b = a + 1, c = a + CH + 1, d = c + 1;
      tb.tri(a, c, b); tb.tri(b, c, d);
    }
    // 装飾
    const r = mulberry32(ci * 7919 + cj * 104729 + 3);
    const dens = this.light ? 0.55 : 1;
    const gr = new GeoBuilder();
    this._ib = new Map(); this._gr = gr; this._gb = gb;
    for (let j = 0; j < CH; j++) for (let i = 0; i < CH; i++) {
      const gi = i0 + i, gj = j0 + j, k = gj * N + gi;
      const x = (gi + r()) * CELL - HALF, z = (gj + r()) * CELL - HALF;
      const h = this.heightAt(x, z);
      const reg = RID[this.REG[k]];
      if (this.ROAD[k] || this.FLAT[k]) continue;
      if (this.clear.length && this.clear.some(c => Math.abs(c[0] - x) < 7 && Math.abs(c[1] - z) < 7)) continue;
      const B = REGIONS[reg]?.biome;
      // 草むら（エンカウント）
      if (this.GRASS[k]) this._grass(gr, (gi) * CELL - HALF, (gj) * CELL - HALF, B, r);
      if (h < 0.4) { if (B === 'swamp' && h < -0.2 && h > -2.5 && r() < 0.08 * dens) { gb.setMatrix(M4.fromTRS([x, 0.05, z], [0, r() * 6, 0], [1, 1, 1])).disc(1.1, [0.3, 0.66, 0.25]).setMatrix(null); if (r() < 0.4) gb.sphere(0.2, [1, 0.7, 0.85], x + 0.3, 0.15, z, 6, 4, 0.6); } continue; }
      if (this.GRASS[k] && r() < 0.7) continue;
      // 地面をおおう短い草（草原・森・湖畔・高原）
      if ((B === 'plains' || B === 'forest' || B === 'lake' || B === 'highland' || reg === 'start') && !this.GRASS[k]) {
        const gc = this._color(x, z, h, reg, 0, 0);
        const nC = this.light ? 1 : 2;
        for (let c = 0; c < nC; c++) { const tx = (gi + r()) * CELL - HALF, tz = (gj + r()) * CELL - HALF; this._put(this.small.tuft[Math.floor(r() * 2)], tx, this.heightAt(tx, tz), tz, r() * 6.28, 0.55 + r() * 0.35, [gc[0] * 1.15, gc[1] * 1.12, gc[2] * 1.05], { outline: 0, cast: false }); }
      }
      const roll = r() / dens;
      const s = 0.8 + r() * 0.6;
      const sl = Math.abs(this.heightAt(x + 2, z) - this.heightAt(x - 2, z)) + Math.abs(this.heightAt(x, z + 2) - this.heightAt(x, z - 2));
      if (sl > 7) { if (sl > 9 && roll < 0.05 && B !== 'snow') this._stampRock(gb, x, h, z, s * 0.8, B, r); continue; }
      const F = this.flora;
      const nearStart = Math.hypot(x - START_POS[0], z - START_POS[1]) < 260;
      // 木立（木が集まる場所）と ひらけた野原 をノイズで分ける
      const grove = smooth(0.54, 0.7, fbm(x / 46, z / 46, 2, 55));
      switch (B) {
        case 'plains': { const tp = 0.008 + grove * 0.1; if (roll < tp) this._stampTree(gb, (nearStart && r() < 0.35) ? F.blossom : F.round, x, h, z, s * (1 + grove * 0.3), r); else if (roll < tp + 0.022 + grove * 0.03) this._stampBush(gb, x, h, z, s, r); else if (roll < tp + 0.06) this._stampRock(gb, x, h, z, s * 0.65, B, r); else if (roll < 0.24) this._flower(gr, x, h, z, r); else if (roll < 0.48) this._tuft(gr, x, h, z, B, r); break; }
        case 'forest': if (roll < 0.075 + grove * 0.1) this._stampTree(gb, r() < 0.5 ? F.pine : (r() < 0.25 ? F.autumn : F.round), x, h, z, s * 1.35, r); else if (roll < 0.175) this._stampProto(gb, F.mush, x, h, z, 1 + r() * 0.6, r, 0.4); else if (roll < 0.21) this._stampBush(gb, x, h, z, s, r); else if (roll < 0.26) this._flower(gr, x, h, z, r); else if (roll < 0.4) this._tuft(gr, x, h, z, B, r); break;
        case 'lake': if (roll < 0.025) this._stampTree(gb, F.round, x, h, z, s, r); else if (h < 2.2 && roll < 0.3) this._reed(gr, x, h, z, r); else if (roll < 0.33) this._flower(gr, x, h, z, r); else if (roll < 0.36) this._stampBush(gb, x, h, z, s * 0.9, r); else if (roll < 0.46) this._tuft(gr, x, h, z, B, r); break;
        case 'desert': if (roll < 0.016) this._stampProto(gb, F.cactus, x, h, z, s, r, 0.6); else if (roll < 0.032) this._stampRock(gb, x, h, z, s * 0.9, B, r); else if (roll < 0.055) this._deadbush(gb, x, h, z, r); else if (roll < 0.059) this._palm(gb, x, h, z, s); break;
        case 'canyon': if (roll < 0.02) this._pillar(gb, x, h, z, s, [0.82, 0.5, 0.33], r); else if (roll < 0.06) this._stampRock(gb, x, h, z, s, B, r); break;
        case 'snow': if (roll < 0.05) this._stampTree(gb, F.snowpine, x, h, z, s, r); else if (roll < 0.058) this._stampProto(gb, F.crystal, x, h, z, s * 0.8, r, 0.8, MAT_GLOSS); else if (roll < 0.074) this._stampRock(gb, x, h, z, s * 0.7, B, r); break;
        case 'swamp': if (roll < 0.03) this._stampProto(gb, F.dead, x, h, z, s, r, 0.5); else if (roll < 0.06) this._stampProto(gb, F.glowmush, x, h, z, 0.9 + r() * 0.6, r, 0.4); else if (roll < 0.1) this._reed(gr, x, h, z, r); else if (roll < 0.16) this._tuft(gr, x, h, z, B, r); break;
        case 'highland': if (roll < 0.11) this._flower(gr, x, h, z, r); else if (roll < 0.125) this._stampTree(gb, r() < 0.4 ? F.blossom : F.round, x, h, z, s * 0.9, r); else if (roll < 0.14) this._stampRock(gb, x, h, z, s * 0.75, B, r); else if (roll < 0.15) this._stampBush(gb, x, h, z, s, r); else if (roll < 0.26) this._tuft(gr, x, h, z, B, r); break;
        case 'volcano': if (roll < 0.035) this._stampRock(gb, x, h, z, s, B, r); else if (roll < 0.045) this._lavaCrack(gb, x, h, z, r); else if (roll < 0.05) this._stampProto(gb, F.dead, x, h, z, s, r, 0.5, null, [0.75, 0.62, 0.6]); break;
        case 'sanctuary': if (roll < 0.012) this._stampProto(gb, F.goldcrystal, x, h, z, s, r, 0.8); else if (roll < 0.018) this._pillar(gb, x, h, z, s * 0.7, [0.92, 0.9, 0.84], r); else if (roll < 0.026) this._stampTree(gb, F.blossom, x, h, z, s, r); else if (roll < 0.09) this._flower(gr, x, h, z, r); break;
        case 'inner': if (roll < 0.03) this._stampProto(gb, F.purplecrystal, x, h, z, s * 1.1, r, 0.9); else if (roll < 0.08) this._flower(gr, x, h, z, r); break;
      }
    }
    const terrain = new Node(tb.build(), { mat: MAT.terrain, outline: 0, kind: 4, castShadow: false });
    node.add(terrain);
    if (gb.vcount) node.add(new Node(gb.build(), { mat: MAT.decor }));
    if (gr.vcount) node.add(new Node(gr.build(), { mat: MAT.decor, outline: 0, castShadow: false }));
    // インスタンス（同じ形をまとめて描く）
    for (const [geo, g] of this._ib) {
      const a = g.arr, n = a.length / 8;
      let cx = 0, cy = 0, cz = 0, ms = 0;
      for (let i = 0; i < a.length; i += 8) { cx += a[i]; cy += a[i + 1]; cz += a[i + 2]; if (a[i + 4] > ms) ms = a[i + 4]; }
      cx /= n; cy /= n; cz /= n;
      let rad = 0; for (let i = 0; i < a.length; i += 8) rad = Math.max(rad, Math.hypot(a[i] - cx, a[i + 1] - cy, a[i + 2] - cz));
      const nd = new Node(geo, { mat: g.mat || MAT.decor, outline: g.outline, castShadow: g.cast });
      nd.inst = { data: new Float32Array(a), count: n, center: [cx, cy, cz], radius: rad + (Math.hypot(...geo.center) + geo.radius) * ms, maxS: ms };
      node.add(nd);
    }
    this._ib = null;
    this.node.add(node);
    return { node };
  }
  _addObst(x, z, rad, k = null) {
    const key = this.toCell(x) + ',' + this.toCell(z);
    if (!this.obst.has(key)) this.obst.set(key, []);
    this.obst.get(key).push({ x, z, r: rad, k });
  }
  // いちばん近い（ふちまでの距離が maxD 以内の）種類つき障害物
  nearestObst(x, z, maxD = 1.2, ok = null) {
    const ci = this.toCell(x), cj = this.toCell(z);
    let best = null, bd = 1e9;
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
      const l = this.obst.get((ci + di) + ',' + (cj + dj));
      if (l) for (const o of l) {
        if (!o.k || (ok && !ok(o))) continue;
        const d = Math.hypot(x - o.x, z - o.z) - o.r;
        if (d < maxD && d < bd) { bd = d; best = o; }
      }
    }
    return best;
  }
  // 原型を置く（少し埋めて、向き・大きさ・色味をばらつかせる）
  //  インスタンス描画が使えるときは位置だけ記録し、使えないときは頂点を複製する
  _put(p, x, y, z, ry, s, t, o = {}) {
    if (this.instancing && this._ib) {
      p.parts.forEach((geo, k) => {
        let g = this._ib.get(geo);
        if (!g) { g = { arr: [], mat: p.mat, outline: o.outline ?? 1, cast: o.cast ?? true }; this._ib.set(geo, g); }
        const tt = (p.tintParts && !p.tintParts[k]) ? [1, 1, 1] : t;
        g.arr.push(x, y, z, ry, s, tt[0], tt[1], tt[2]);
      });
    } else {
      const tgt = o.cast === false ? this._gr : this._gb;
      if (p.tintParts) p.parts.forEach((geo, k) => stamp(tgt, { parts: [geo] }, x, y, z, ry, s, p.tintParts[k] ? t : null));
      else stamp(tgt, p, x, y, z, ry, s, t);
    }
  }
  _stampProto(gb, list, x, h, z, s, r, obstR = 0.8, _mat = null, tint = null) {
    const p = list[Math.floor(r() * list.length)];
    const v = 0.92 + r() * 0.16;
    const t = tint ? [tint[0] * v, tint[1] * v, tint[2] * v] : [v, v, v];
    this._put(p, x, h - 0.15, z, r() * Math.PI * 2, s, t);
    if (obstR) this._addObst(x, z, p.r * s * obstR / 0.8, this._kindOf.get(list) || null);
  }
  _stampTree(gb, list, x, h, z, s, r) { this._stampProto(gb, list, x, h, z, s, r, 0.8, null, [0.95 + r() * 0.1, 0.95 + r() * 0.1, 0.92 + r() * 0.1]); }
  _stampBush(gb, x, h, z, s, r) { this._stampProto(gb, this.flora.bush, x, h, z, s * 0.9, r, 0.7); }
  _stampRock(gb, x, h, z, s, B, r) {
    const tint = B === 'desert' ? [1.22, 1.02, 0.78] : B === 'canyon' ? [1.18, 0.82, 0.62] : B === 'volcano' ? [0.48, 0.42, 0.44] : B === 'snow' ? [1.05, 1.12, 1.25] : B === 'swamp' ? [0.78, 0.86, 0.74] : [1, 1, 1];
    this._stampProto(gb, this.flora.rock, x, h, z, s, r, 0.85, null, tint);
  }
  _palm(gb, x, h, z, s) {
    gb.setMatrix(M4.fromTRS([x, h, z], [0, 0, 0.12], [1, 1, 1])).cylinder(0.22 * s, 0.36 * s, 4.6 * s, [0.66, 0.48, 0.3], 0, 0, 0, 7, false).setMatrix(null);
    gb.sway(0.5);
    for (let k = 0; k < 6; k++) { const a = k / 6 * Math.PI * 2; gb.setMatrix(M4.fromTRS([x + 0.55 * s, h + 4.5 * s, z], [0.45, a, 0], [2.4 * s, 1, 0.9 * s])).quad([0, 0, -0.5], [1, -0.35, -0.1], [1, -0.35, 0.1], [0, 0, 0.5], [0.3, 0.72, 0.25]).quad([0, 0, 0.5], [1, -0.35, 0.1], [1, -0.35, -0.1], [0, 0, -0.5], [0.24, 0.6, 0.2]).setMatrix(null); }
    gb.sway(0);
    this._addObst(x, z, 0.6 * s, 'tree');
  }
  _pillar(gb, x, h, z, s, c, r) { const hh = (4 + r() * 6) * s; gb.box(2.2 * s, hh, 2.2 * s, c, x, h + hh / 2 - 0.3, z); gb.box(2.6 * s, 0.6 * s, 2.6 * s, mixRgb(c, [1, 1, 1], 0.15), x, h + hh, z); for (let k = 1; k < 3; k++) gb.box(2.3 * s, 0.18 * s, 2.3 * s, mixRgb(c, [0, 0, 0], 0.15), x, h + hh * k / 3, z); this._addObst(x, z, 1.5 * s); }
  _deadbush(gb, x, h, z, r) { for (let k = 0; k < 4; k++) gb.setMatrix(M4.fromTRS([x, h, z], [0.6, k * 1.6 + r(), 0], [1, 1, 1])).cylinder(0.03, 0.06, 0.9, [0.66, 0.52, 0.32], 0, 0, 0, 3, false).setMatrix(null); }
  // 花（風でゆれる）
  _flower(gr, x, h, z, r) {
    const cols = [[1, 0.42, 0.55], [1, 0.86, 0.3], [0.74, 0.52, 1], [1, 1, 1], [1, 0.62, 0.24], [0.45, 0.72, 1], [1, 0.62, 0.85]];
    const c = cols[Math.floor(r() * cols.length)];
    this._put(this.small.flower[Math.floor(r() * this.small.flower.length)], x, h, z, r() * 6.28, 0.9 + r() * 0.3, c, { outline: 0, cast: false });
  }
  // 草の房（エンカウントしない飾り）
  _tuft(gr, x, h, z, B, r) {
    const base = B === 'highland' ? [0.42, 0.78, 0.3] : B === 'forest' ? [0.22, 0.55, 0.22] : B === 'swamp' ? [0.3, 0.45, 0.22] : [0.36, 0.7, 0.26];
    this._put(this.small.tuft[Math.floor(r() * 2)], x, h, z, r() * 6.28, 0.9 + r() * 0.4, base, { outline: 0, cast: false });
  }
  _reed(gr, x, h, z, r) { for (let k = 0; k < 5; k++) { const ox = (r() - 0.5) * 0.9, oz = (r() - 0.5) * 0.9, hh = 1.4 + r() * 0.7; gr.sw = 0; gr.swTop = 0.9; gr.cylinder(0.03, 0.05, hh, [0.45, 0.64, 0.3], x + ox, h - 0.2, z + oz, 3, false); gr.swTop = undefined; gr.sway(0.95); gr.cylinder(0.08, 0.08, 0.35, [0.55, 0.36, 0.2], x + ox, h + hh - 0.4, z + oz, 4, true); gr.sway(0); } }
  _lavaCrack(gb, x, h, z, r) { gb.setMatrix(M4.fromTRS([x, h + 0.08, z], [0, r() * 6, 0], [1.6, 1, 0.5])).disc(1, [1, 0.45, 0.1], 0, 0, 0, 8).setMatrix(null); }
  // 草むら（エンカウント）：根元が暗く先が明るい、しなる葉の束（ぎっしり）
  _grass(gr, x0, z0, B, r) {
    const base = B === 'desert' ? [0.82, 0.72, 0.32] : B === 'snow' ? [0.55, 0.8, 0.82] : B === 'volcano' ? [0.5, 0.38, 0.3] : B === 'swamp' ? [0.26, 0.48, 0.2] : B === 'canyon' ? [0.72, 0.6, 0.28] : B === 'sanctuary' ? [0.95, 0.85, 0.4] : B === 'highland' ? [0.3, 0.72, 0.24] : [0.2, 0.6, 0.18];
    const nC = this.light ? 3 : 5;
    for (let c = 0; c < nC; c++) {
      const cx = x0 + r() * CELL, cz = z0 + r() * CELL;
      const v = 0.88 + r() * 0.24;
      this._put(this.small.grass[Math.floor(r() * 3)], cx, this.heightAt(cx, cz), cz, r() * 6.28, 0.85 + r() * 0.35, [base[0] * v, base[1] * v, base[2] * v], { outline: 0, cast: false });
    }
  }

  // ---------- 衝突判定 ----------
  blockedByObst(x, z, rad = 0.5) {
    const ci = this.toCell(x), cj = this.toCell(z);
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
      const l = this.obst.get((ci + di) + ',' + (cj + dj));
      if (l) for (const o of l) if (Math.hypot(x - o.x, z - o.z) < o.r + rad) return true;
    }
    for (const b of this.boxes) if (x > b.x0 - rad && x < b.x1 + rad && z > b.z0 - rad && z < b.z1 + rad) return true;
    return false;
  }
  // 障害物は描画しないと登録されないので、周辺チャンクを先に作る
  ensureObstAround(x, z) { this.ensureChunks(x, z, 60); }
}

function distSeg(x, z, a, b) {
  const vx = b[0] - a[0], vz = b[1] - a[1], wx = x - a[0], wz = z - a[1];
  const t = clamp((wx * vx + wz * vz) / (vx * vx + vz * vz), 0, 1);
  return Math.hypot(wx - vx * t, wz - vz * t);
}

// ---------- 建物（アニメ調：しっくい壁・木の梁・張り出した屋根・窓の花かざり） ----------
const ROOF = ['#e0583f', '#3f7fd6', '#4caa5a', '#e0a832', '#8a5ac0', '#d26a3c', '#2fa3a0'];
const SHUTTER = ['#3f7fd6', '#4caa5a', '#d0503c', '#8a5ac0', '#e0a832'];
export function buildBuilding(type, seed = 0, regionColor = '#c8643c') {
  initPrims();
  const gb = new GeoBuilder();
  const r = mulberry32(seed + 5);
  const wall = [0.98, 0.95, 0.87], beam = [0.5, 0.33, 0.22], stone = [0.62, 0.6, 0.6], glass = [0.55, 0.82, 1], frame = [1, 1, 1];
  let w = 8, d = 7, hh = 4.5, door = [0, 0];
  const darker = (c, k = 0.15) => mixRgb(c, [0.1, 0.05, 0.1], k);
  // 窓：白い枠・ガラス・よろい戸・花かざり
  const windowAt = (x, y, z, wW = 1.3, wH = 1.4, shut = null, flowers = true, face = 1) => {
    gb.box(wW + 0.3, wH + 0.3, 0.2, frame, x, y, z + face * 0.08);
    gb.box(wW, wH, 0.22, glass, x, y, z + face * 0.1);
    gb.box(0.12, wH, 0.24, frame, x, y, z + face * 0.12); gb.box(wW, 0.12, 0.24, frame, x, y, z + face * 0.12);
    gb.box(0.2, wH * 0.38, 0.24, [1, 1, 1], x - wW * 0.28, y + wH * 0.22, z + face * 0.11);
    if (shut) for (const s of [-1, 1]) { gb.box(wW * 0.5, wH + 0.25, 0.12, shut, x + s * (wW * 0.5 + 0.42), y, z + face * 0.08); gb.box(wW * 0.5 - 0.15, 0.08, 0.14, darker(shut, 0.2), x + s * (wW * 0.5 + 0.42), y + wH * 0.25, z + face * 0.13); gb.box(wW * 0.5 - 0.15, 0.08, 0.14, darker(shut, 0.2), x + s * (wW * 0.5 + 0.42), y - wH * 0.25, z + face * 0.13); }
    if (flowers) {
      gb.box(wW + 0.4, 0.38, 0.5, [0.6, 0.38, 0.24], x, y - wH / 2 - 0.3, z + face * 0.3);
      const fc = [[1, 0.42, 0.55], [1, 0.85, 0.3], [1, 1, 1], [0.75, 0.5, 1]][Math.floor(r() * 4)];
      for (let k = 0; k < 4; k++) gb.sphere(0.2, k % 2 ? fc : [0.4, 0.75, 0.32], x - wW * 0.45 + k * wW * 0.3, y - wH / 2 - 0.05, z + face * 0.36, 6, 4);
    }
  };
  const doorAt = (x, z, dw = 1.7, dh = 2.7, col = [0.58, 0.36, 0.22], canopy = null) => {
    gb.box(dw + 0.4, dh + 0.25, 0.22, frame, x, dh / 2 + 0.1, z + 0.06);
    gb.box(dw, dh, 0.26, col, x, dh / 2, z + 0.08);
    gb.box(dw * 0.4, dh * 0.38, 0.28, darker(col, 0.25), x - dw * 0.22, dh * 0.62, z + 0.09); gb.box(dw * 0.4, dh * 0.38, 0.28, darker(col, 0.25), x + dw * 0.22, dh * 0.62, z + 0.09);
    gb.sphere(0.09, [1, 0.85, 0.35], x + dw * 0.32, dh * 0.45, z + 0.24, 5, 3);
    gb.box(dw + 1.2, 0.25, 1.1, stone, x, 0.12, z + 0.55);
    if (canopy) { gb.setMatrix(M4.fromTRS([x, dh + 0.55, z + 0.55], [0.35, 0, 0], [1, 1, 1])).box(dw + 1.1, 0.15, 1.4, canopy, 0, 0, 0).setMatrix(null); }
  };
  // 屋根：張り出し・瓦のしま・棟
  const gable = (W, H, D, col, y0) => {
    gb.roof(W + 1.6, H, D + 1.6, col, 0, y0, 0);
    const dk = darker(col, 0.18);
    for (let k = 1; k < 4; k++) {
      const t = k / 4, yy = y0 + H * t, zz = (D + 1.6) / 2 * (1 - t);
      for (const s of [-1, 1]) gb.setMatrix(M4.fromTRS([0, yy + 0.02, s * zz], [s * Math.atan2(H, (D + 1.6) / 2), 0, 0], [1, 1, 1])).box(W + 1.7, 0.1, 0.18, dk, 0, 0, 0).setMatrix(null);
    }
    gb.box(W + 1.9, 0.32, 0.45, darker(col, 0.3), 0, y0 + H + 0.05, 0);
  };
  // 木の梁（角と上下）
  const timber = (W, H, D) => {
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) gb.box(0.35, H, 0.35, beam, sx * W / 2, H / 2, sz * D / 2);
    gb.box(W + 0.2, 0.3, 0.3, beam, 0, H - 0.15, D / 2 + 0.02); gb.box(W + 0.2, 0.3, 0.3, beam, 0, H - 0.15, -D / 2 - 0.02);
    gb.box(W + 0.4, 0.6, D + 0.4, stone, 0, 0.3, 0);
  };
  if (type === 'house' || type === 'home') {
    w = 8 + Math.floor(r() * 2); d = 7; hh = 4.4;
    const wc = type === 'home' ? wall : [[0.98, 0.95, 0.87], [1, 0.92, 0.84], [0.95, 0.96, 0.9], [1, 0.95, 0.8]][Math.floor(r() * 4)];
    gb.box(w, hh, d, wc, 0, hh / 2, 0);
    timber(w, hh, d);
    const rc = hexToRgb(type === 'home' ? '#e0583f' : ROOF[Math.floor(r() * ROOF.length)]);
    gable(w, 2.8, d, rc, hh);
    // 妻側の三角壁
    gb.setMatrix(M4.fromTRS([0, hh, 0], [0, 0, 0], [1, 1, 1]));
    gb.setMatrix(null);
    const sh = hexToRgb(SHUTTER[Math.floor(r() * SHUTTER.length)]);
    doorAt(0, d / 2, 1.6, 2.6, [0.6, 0.38, 0.22], darker(rc, 0.05));
    windowAt(-w * 0.3, hh * 0.56, d / 2, 1.2, 1.3, sh); windowAt(w * 0.3, hh * 0.56, d / 2, 1.2, 1.3, sh);
    // 煙突
    gb.box(1.0, 2.6, 1.0, [0.75, 0.42, 0.32], w * 0.28, hh + 2.2, -d * 0.18); gb.box(1.3, 0.3, 1.3, [0.55, 0.3, 0.24], w * 0.28, hh + 3.5, -d * 0.18);
    if (type === 'home') { gb.box(0.25, 1.1, 0.25, beam, w / 2 + 1.2, 0.55, d / 2 + 0.8); gb.box(1.0, 0.7, 0.6, [0.3, 0.55, 0.9], w / 2 + 1.2, 1.3, d / 2 + 0.8); }
    door = [0, d / 2 + 1.6];
  } else if (type === 'hospital') {
    w = 13; d = 9; hh = 5.8;
    const pink = [1, 0.55, 0.6];
    gb.box(w, hh, d, [1, 1, 1], 0, hh / 2, 0);
    gb.box(w + 0.4, 0.6, d + 0.4, [0.75, 0.75, 0.78], 0, 0.3, 0);
    gb.box(w + 1.2, 0.9, d + 1.2, pink, 0, hh + 0.45, 0);
    gb.box(w + 0.6, 0.5, d + 0.6, [1, 1, 1], 0, hh + 1.1, 0);
    gb.box(w * 0.55, 1.6, d * 0.55, pink, 0, hh + 1.9, 0);
    // 赤十字の看板
    gb.box(4.4, 4.4, 0.3, [1, 1, 1], 0, hh + 2.4, d / 2 - 0.4); gb.box(3.3, 1.05, 0.4, [0.95, 0.25, 0.32], 0, hh + 2.4, d / 2 - 0.3); gb.box(1.05, 3.3, 0.4, [0.95, 0.25, 0.32], 0, hh + 2.4, d / 2 - 0.3);
    doorAt(0, d / 2, 3, 3.2, [0.62, 0.86, 1], pink);
    for (const x of [-w * 0.33, w * 0.33]) windowAt(x, hh * 0.55, d / 2, 2.2, 1.6, null, true);
    gb.box(w + 0.1, 0.35, 0.1, pink, 0, hh * 0.2, d / 2 + 0.05);
    door = [0, d / 2 + 1.7];
  } else if (type === 'shop') {
    w = 10; d = 8; hh = 5;
    const blue = [0.28, 0.55, 0.95];
    gb.box(w, hh, d, [1, 0.97, 0.88], 0, hh / 2, 0);
    gb.box(w + 0.4, 0.6, d + 0.4, [0.62, 0.6, 0.6], 0, 0.3, 0);
    gb.box(w + 0.9, 0.8, d + 0.9, blue, 0, hh + 0.4, 0);
    gb.box(w * 0.7, 1.2, d * 0.7, [1, 1, 1], 0, hh + 1.3, 0);
    // しまもようのひさし
    for (let i = 0; i < 8; i++) gb.setMatrix(M4.fromTRS([-w / 2 + w / 16 + i * w / 8, hh - 0.8, d / 2 + 0.9], [0.4, 0, 0], [1, 1, 1])).box(w / 8, 0.15, 2.0, i % 2 ? [1, 1, 1] : blue, 0, 0, 0).setMatrix(null);
    gb.box(4.4, 1.4, 0.35, blue, 0, hh + 1.6, d / 2 - 0.2); gb.box(3.9, 0.9, 0.4, [1, 1, 1], 0, hh + 1.6, d / 2 - 0.1);
    doorAt(0, d / 2, 2.4, 3, [0.62, 0.86, 1]);
    for (const x of [-w * 0.32, w * 0.32]) windowAt(x, hh * 0.45, d / 2, 2, 1.8, null, false);
    // 店先の木箱
    gb.box(1, 0.8, 0.8, [0.72, 0.52, 0.32], -w / 2 - 0.2, 0.4, d / 2 + 1.2); gb.sphere(0.25, [1, 0.35, 0.3], -w / 2 - 0.3, 0.95, d / 2 + 1.2, 6, 4); gb.sphere(0.25, [1, 0.7, 0.2], -w / 2, 0.95, d / 2 + 1.0, 6, 4);
    door = [0, d / 2 + 1.7];
  } else if (type === 'hall') {
    w = 16; d = 12; hh = 7;
    const rc = hexToRgb(regionColor);
    gb.box(w, hh, d, [0.95, 0.93, 0.88], 0, hh / 2, 0);
    gb.box(w + 1.2, 1.0, d + 1.2, [0.78, 0.76, 0.74], 0, 0.5, 0);
    for (let k = 0; k < 3; k++) gb.box(w + 1.2 - k * 0.0, 0.3, 2.8 - k * 0.6, [0.82, 0.8, 0.78], 0, 0.15 + k * 0.3, d / 2 + 2.2 - k * 0.3);
    gable(w, 4.5, d, rc, hh);
    for (const s of [-1, -0.35, 0.35, 1]) { gb.cylinder(0.55, 0.62, hh, [1, 1, 1], s * (w / 2 - 1), 0.9, d / 2 + 1.1, 10); gb.box(1.6, 0.4, 1.6, [0.9, 0.88, 0.85], s * (w / 2 - 1), hh + 0.6, d / 2 + 1.1); }
    gb.box(w + 1, 0.7, 3, [0.88, 0.86, 0.82], 0, hh + 0.3, d / 2 + 1);
    doorAt(0, d / 2, 3.2, 4.2, [0.48, 0.3, 0.2]);
    // 紋章
    gb.cylinder(1.5, 1.5, 0.4, [1, 0.85, 0.3], 0, hh + 1.6, d / 2 + 0.4, 12); gb.cylinder(1.1, 1.1, 0.45, rc, 0, hh + 1.62, d / 2 + 0.42, 12);
    for (const x of [-w * 0.32, w * 0.32]) { gb.box(1.6, 3.4, 0.25, [0.55, 0.82, 1], x, hh * 0.5, d / 2 + 0.05); gb.box(2, 0.3, 0.4, [1, 1, 1], x, hh * 0.5 + 1.85, d / 2 + 0.1); }
    // 旗
    for (const s of [-1, 1]) { gb.cylinder(0.08, 0.1, 4, [0.85, 0.85, 0.9], s * (w / 2 + 1.5), 0, d / 2 + 2.5, 6); gb.box(0.08, 1.2, 1.6, rc, s * (w / 2 + 1.5), 3.3, d / 2 + 3.3); }
    door = [0, d / 2 + 3];
  } else if (type === 'lab') {
    w = 14; d = 10; hh = 6;
    gb.box(w, hh, d, [0.94, 0.95, 0.98], 0, hh / 2, 0);
    gb.box(w + 0.4, 0.6, d + 0.4, [0.6, 0.62, 0.66], 0, 0.3, 0);
    gb.box(w + 0.6, 0.6, d + 0.6, [0.36, 0.5, 0.72], 0, hh + 0.3, 0);
    gb.box(w * 0.98, 0.5, 0.2, [0.36, 0.5, 0.72], 0, hh * 0.35, d / 2 + 0.05);
    gb.cylinder(0.3, 0.3, 2, [0.6, 0.6, 0.65], 4, hh + 0.6, -2, 8); gb.sphere(1.6, [0.92, 0.94, 1], 4, hh + 3, -2, 12, 7, 0.5);
    for (let i = 0; i < 3; i++) gb.setMatrix(M4.fromTRS([-4 + i * 1.6, hh + 1.2, 1], [-0.5, 0, 0], [1, 1, 1])).box(1.4, 0.12, 2.2, [0.25, 0.32, 0.55], 0, 0, 0).setMatrix(null);
    doorAt(0, d / 2, 2.6, 3, [0.62, 0.86, 1], [0.36, 0.5, 0.72]);
    for (const s of [-1, 1]) windowAt(s * 4.4, 3.4, d / 2, 2.8, 1.6, null, false);
    door = [0, d / 2 + 1.7];
  } else if (type === 'lighthouse') {
    w = 5; d = 5; hh = 14;
    for (let i = 0; i < 4; i++) gb.cylinder(2.2 - i * 0.25, 2.4 - i * 0.25, hh / 4, i % 2 ? [0.92, 0.28, 0.28] : [1, 1, 1], 0, i * hh / 4, 0, 14, i === 3);
    gb.cylinder(2.3, 2.3, 0.3, [0.3, 0.3, 0.35], 0, hh, 0, 14);
    gb.cylinder(1.5, 1.5, 1.8, [1, 0.95, 0.6], 0, hh + 0.3, 0, 10); gb.cone(1.9, 1.4, [0.92, 0.28, 0.28], 0, hh + 2.1, 0, 10);
    gb.box(1.4, 2.4, 0.3, [0.45, 0.3, 0.22], 0, 1.2, 2.3);
    door = [0, 3.5];
  }
  return { geo: gb.build(), w, d, h: hh, door };
}

// 地域ごとの空・霧（アニメ調の空のテーマ）
export const SKY = {
  plains: { bg: [0.6, 0.82, 1], fog: [0.74, 0.88, 1], theme: 'day' }, start: { bg: [0.6, 0.82, 1], fog: [0.74, 0.88, 1], theme: 'day' },
  forest: { bg: [0.5, 0.74, 0.86], fog: [0.6, 0.8, 0.78], theme: 'day' }, lake: { bg: [0.6, 0.84, 1], fog: [0.74, 0.9, 1], theme: 'day' },
  desert: { bg: [0.9, 0.86, 0.72], fog: [1, 0.9, 0.72], theme: 'desert' }, canyon: { bg: [0.9, 0.74, 0.62], fog: [0.96, 0.78, 0.62], theme: 'desert' },
  snow: { bg: [0.84, 0.9, 0.98], fog: [0.9, 0.94, 1], theme: 'snow' }, swamp: { bg: [0.48, 0.55, 0.5], fog: [0.56, 0.64, 0.58], theme: 'swamp' },
  highland: { bg: [0.55, 0.8, 1], fog: [0.78, 0.9, 1], theme: 'day' }, volcano: { bg: [0.5, 0.3, 0.28], fog: [0.6, 0.36, 0.3], theme: 'volcano' },
  sanctuary: { bg: [0.82, 0.76, 0.95], fog: [0.92, 0.84, 0.95], theme: 'sanctuary' }, inner: { bg: [0.45, 0.38, 0.65], fog: [0.62, 0.5, 0.82], theme: 'inner' },
  sea: { bg: [0.55, 0.8, 1], fog: [0.7, 0.86, 1], theme: 'day' },
};
