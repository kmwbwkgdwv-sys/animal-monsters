// =============================================================
//  大陸ワールドの生成と描画
// =============================================================
import { Node, GeoBuilder, PRIM, initPrims, M4, hexToRgb, mixRgb } from '../engine/gl3d.js';
import { fbm, ridge, vnoise, smooth, clamp, lerp, mulberry32 } from '../engine/util.js';
import { WORLD, REGIONS, RING, TOWNS, STONES, DUNGEONS, ITEM_BALLS, START_POS, SANCT_R, INNER_R, COAST_R, VOLCANO_C, LAKE_C, ringAt, regionAt, polar, angDeg, angDist } from '../data/world.js';

const N = WORLD.n, CELL = WORLD.cell, HALF = WORLD.half, CH = 32; // チャンク = 32セル
export const NCH = N / CH;
const RID = ['start', 'plains', 'forest', 'lake', 'desert', 'canyon', 'snow', 'swamp', 'highland', 'volcano', 'sanctuary', 'inner', 'sea'];
export const REGION_INDEX = Object.fromEntries(RID.map((r, i) => [r, i]));

// ---------- 地形の高さ ----------
function biomeH(b, x, z) {
  switch (b) {
    case 'plains': return 3 + fbm(x / 90, z / 90, 4, 1) * 7 + fbm(x / 22, z / 22, 2, 2) * 1.2;
    case 'forest': return 4 + fbm(x / 70, z / 70, 4, 3) * 10;
    case 'lake': {
      const d = Math.hypot(x - LAKE_C[0], z - LAKE_C[1]) + (fbm(x / 30, z / 30, 2, 9) - 0.5) * 40;
      const base = 2.5 + fbm(x / 60, z / 60, 3, 4) * 5;
      return lerp(-7, base, smooth(75, 135, d));
    }
    case 'desert': return 3 + ridge(x / 55, z / 55, 3, 5) * 11 + fbm(x / 200, z / 200, 2, 6) * 5;
    case 'canyon': { const n = fbm(x / 75, z / 75, 4, 7); return 4 + smooth(0.47, 0.6, n) * 15 + smooth(0.62, 0.72, n) * 8 + fbm(x / 18, z / 18, 2, 8) * 1.5; }
    case 'snow': { const r = Math.hypot(x, z); return 6 + ridge(x / 85, z / 85, 4, 10) * 30 * smooth(300, 560, r) + fbm(x / 40, z / 40, 3, 11) * 4; }
    case 'swamp': return 1.0 + (fbm(x / 40, z / 40, 4, 12) - 0.5) * 7;
    case 'highland': return 15 + fbm(x / 80, z / 80, 4, 13) * 9;
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
  // 海岸
  const coast = COAST_R + (fbm(x / 120, z / 120, 3, 19) - 0.5) * 90;
  h = lerp(h, -9, smooth(coast - 45, coast + 25, r));
  return h;
}

// ---------- ワールド ----------
export class World {
  constructor(opts = {}) {
    initPrims();
    this.light = !!opts.light;
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
    for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++) {
      const x = i * CELL - HALF, z = j * CELL - HALF;
      let h = rawHeight(x, z);
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
    switch (B) {
      case 'plains': c = mixRgb([0.42, 0.72, 0.3], [0.56, 0.8, 0.36], n); break;
      case 'forest': c = mixRgb([0.22, 0.5, 0.2], [0.34, 0.62, 0.26], n); break;
      case 'lake': c = mixRgb([0.38, 0.7, 0.36], [0.5, 0.78, 0.4], n); break;
      case 'desert': c = mixRgb([0.93, 0.8, 0.5], [0.85, 0.7, 0.42], n); break;
      case 'canyon': c = h > 14 ? mixRgb([0.78, 0.55, 0.36], [0.7, 0.5, 0.32], n) : mixRgb([0.76, 0.45, 0.3], [0.62, 0.38, 0.26], n); break;
      case 'snow': c = mixRgb([0.88, 0.92, 0.98], [0.97, 0.98, 1], n); if (h < 8) c = mixRgb(c, [0.7, 0.82, 0.9], 0.3); break;
      case 'swamp': c = mixRgb([0.3, 0.38, 0.22], [0.4, 0.45, 0.28], n); break;
      case 'highland': c = mixRgb([0.5, 0.78, 0.38], [0.62, 0.86, 0.45], n); break;
      case 'volcano': { const d = Math.hypot(x - VOLCANO_C[0], z - VOLCANO_C[1]); c = mixRgb([0.32, 0.28, 0.27], [0.22, 0.2, 0.2], n); if (d < 60) c = mixRgb(c, [0.45, 0.2, 0.15], 0.4); break; }
      case 'sanctuary': c = mixRgb([0.72, 0.78, 0.55], [0.85, 0.82, 0.6], n); break;
      case 'inner': c = mixRgb([0.78, 0.74, 0.92], [0.88, 0.84, 0.98], n); break;
      default: c = [0.8, 0.75, 0.6];
    }
    if (slope > 2.6 && B !== 'snow') c = mixRgb(c, [0.48, 0.45, 0.42], clamp((slope - 2.6) / 2, 0, 0.85));
    if (B === 'snow' && slope > 3.5) c = mixRgb(c, [0.55, 0.6, 0.68], 0.5);
    if (h < 1.3 && h > -1 && B !== 'swamp') c = mixRgb([0.9, 0.85, 0.65], c, smooth(0.3, 1.3, h));
    if (h <= -1) c = mixRgb([0.75, 0.7, 0.55], [0.45, 0.55, 0.55], clamp(-h / 8, 0, 1));
    // 町の広場
    for (const t of this.townsFlat) { const d = Math.hypot(x - t.x, z - t.z); if (d < t.r * 0.42) { c = mixRgb([0.82, 0.78, 0.7], [0.74, 0.7, 0.62], n2); break; } if (d < t.r + 4 && !road) { c = mixRgb(c, [0.5, 0.75, 0.38], 0.25); } }
    { const gi = Math.floor((x + HALF) / CELL), gj = Math.floor((z + HALF) / CELL); if (gi >= 0 && gj >= 0 && gi < N && gj < N && this.GRASS && this.GRASS[gj * N + gi]) c = mixRgb(c, [0.12, 0.35, 0.1], 0.35); }
    if (road) c = B === 'snow' ? [0.78, 0.8, 0.85] : B === 'desert' ? [0.8, 0.68, 0.45] : B === 'volcano' ? [0.4, 0.35, 0.32] : B === 'inner' || B === 'sanctuary' ? [0.86, 0.84, 0.78] : [0.72, 0.6, 0.42];
    const v = 0.9 + n2 * 0.16;
    return [c[0] * v, c[1] * v, c[2] * v];
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

  _buildChunk(ci, cj) {
    const node = new Node();
    const gb = new GeoBuilder();
    const i0 = ci * CH, j0 = cj * CH;
    // 地形
    const start = gb.vcount;
    for (let j = 0; j <= CH; j++) for (let i = 0; i <= CH; i++) {
      const gi = i0 + i, gj = j0 + j;
      const x = gi * CELL - HALF, z = gj * CELL - HALF;
      const h = this.H[this.idx(gi, gj)];
      const hl = this.H[this.idx(Math.max(0, gi - 1), gj)], hr = this.H[this.idx(Math.min(N, gi + 1), gj)];
      const hd = this.H[this.idx(gi, Math.max(0, gj - 1))], hu = this.H[this.idx(gi, Math.min(N, gj + 1))];
      let nx = hl - hr, ny = 2 * CELL, nz = hd - hu; const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
      const slope = Math.abs(hl - hr) + Math.abs(hd - hu);
      const ci2 = Math.min(N - 1, gi), cj2 = Math.min(N - 1, gj);
      const k = cj2 * N + ci2;
      const reg = RID[this.REG[k]];
      const col = this._color(x, z, h, reg === 'sea' ? (ringAt(x, z).id) : reg, slope, this.ROAD[k]);
      gb._push(x, h, z, nx, ny, nz, col);
    }
    for (let j = 0; j < CH; j++) for (let i = 0; i < CH; i++) {
      const a = start + j * (CH + 1) + i, b = a + 1, c = a + CH + 1, d = c + 1;
      gb.tri(a, c, b); gb.tri(b, c, d);
    }
    // 装飾
    const r = mulberry32(ci * 7919 + cj * 104729 + 3);
    const dens = this.light ? 0.55 : 1;
    const gr = new GeoBuilder();
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
      if (h < 0.4) { if (B === 'swamp' && h < -0.2 && h > -2.5 && r() < 0.08 * dens) gb.setMatrix(M4.fromTRS([x, 0.05, z], [0, r() * 6, 0], [1, 1, 1])).disc(1.1, [0.3, 0.6, 0.25]).setMatrix(null); continue; }
      if (this.GRASS[k] && r() < 0.7) continue;
      const roll = r() / dens;
      const s = 0.8 + r() * 0.6;
      const sl = Math.abs(this.heightAt(x + 2, z) - this.heightAt(x - 2, z)) + Math.abs(this.heightAt(x, z + 2) - this.heightAt(x, z - 2));
      if (sl > 6) continue;
      switch (B) {
        case 'plains': if (roll < 0.03) this._tree(gb, x, h, z, s, 'round', r); else if (roll < 0.06) this._bush(gb, x, h, z, s, r); else if (roll < 0.2) this._flower(gb, x, h, z, r); else if (roll < 0.16) this._rock(gb, x, h, z, s * 0.6, [0.6, 0.58, 0.55]); break;
        case 'forest': if (roll < 0.22) this._tree(gb, x, h, z, s * 1.15, r() < 0.5 ? 'pine' : 'round', r); else if (roll < 0.25) this._mush(gb, x, h, z, r); else if (roll < 0.3) this._flower(gb, x, h, z, r); break;
        case 'lake': if (roll < 0.03) this._tree(gb, x, h, z, s, 'round', r); else if (h < 2.2 && roll < 0.3) this._reed(gb, x, h, z, r); else if (roll < 0.33) this._flower(gb, x, h, z, r); break;
        case 'desert': if (roll < 0.018) this._cactus(gb, x, h, z, s, r); else if (roll < 0.035) this._rock(gb, x, h, z, s * 0.8, [0.78, 0.66, 0.45]); else if (roll < 0.06) this._deadbush(gb, x, h, z, r); else if (roll < 0.064) this._palm(gb, x, h, z, s); break;
        case 'canyon': if (roll < 0.02) this._pillar(gb, x, h, z, s, [0.72, 0.45, 0.3], r); else if (roll < 0.06) this._rock(gb, x, h, z, s, [0.62, 0.42, 0.3]); break;
        case 'snow': if (roll < 0.05) this._tree(gb, x, h, z, s, 'snowpine', r); else if (roll < 0.06) this._crystal(gb, x, h, z, s * 0.8, [0.7, 0.9, 1], r); else if (roll < 0.075) this._rock(gb, x, h, z, s * 0.7, [0.75, 0.8, 0.88]); break;
        case 'swamp': if (roll < 0.035) this._deadtree(gb, x, h, z, s, r); else if (roll < 0.065) this._mush(gb, x, h, z, r, true); else if (roll < 0.1) this._reed(gb, x, h, z, r); break;
        case 'highland': if (roll < 0.12) this._flower(gb, x, h, z, r); else if (roll < 0.135) this._tree(gb, x, h, z, s * 0.85, 'round', r); else if (roll < 0.145) this._rock(gb, x, h, z, s * 0.6, [0.7, 0.7, 0.68]); break;
        case 'volcano': if (roll < 0.035) this._rock(gb, x, h, z, s, [0.25, 0.22, 0.22]); else if (roll < 0.045) this._lavaCrack(gb, x, h, z, r); else if (roll < 0.05) this._deadtree(gb, x, h, z, s, r); break;
        case 'sanctuary': if (roll < 0.015) this._crystal(gb, x, h, z, s, [0.95, 0.85, 0.5], r); else if (roll < 0.02) this._pillar(gb, x, h, z, s * 0.7, [0.88, 0.86, 0.8], r); else if (roll < 0.08) this._flower(gb, x, h, z, r); break;
        case 'inner': if (roll < 0.035) this._crystal(gb, x, h, z, s * 1.2, [0.8, 0.7, 1], r); else if (roll < 0.08) this._flower(gb, x, h, z, r); break;
      }
    }
    const terrain = new Node(gb.build(), { color: [1, 1, 1] });
    node.add(terrain);
    if (gr.vcount) { const g = new Node(gr.build(), { wave: this.light ? 0 : -1 }); node.add(g); }
    this.node.add(node);
    return { node };
  }
  _addObst(x, z, rad) {
    const key = this.toCell(x) + ',' + this.toCell(z);
    if (!this.obst.has(key)) this.obst.set(key, []);
    this.obst.get(key).push({ x, z, r: rad });
  }
  _tree(gb, x, h, z, s, kind, r) {
    const trunk = [0.45, 0.3, 0.18];
    if (kind === 'pine' || kind === 'snowpine') {
      gb.cylinder(0.3 * s, 0.4 * s, 2 * s, trunk, x, h, z, 6, false);
      const leaf = kind === 'snowpine' ? [0.3, 0.5, 0.4] : [0.16, 0.42 + r() * 0.1, 0.22];
      for (let k = 0; k < 3; k++) gb.cylinder(0.05, (2.4 - k * 0.6) * s, 2.2 * s, leaf, x, h + (1.4 + k * 1.3) * s, z, 7, true, kind === 'snowpine' ? [0.95, 0.97, 1] : null);
    } else {
      gb.cylinder(0.3 * s, 0.4 * s, 2.2 * s, trunk, x, h, z, 6, false);
      const leaf = [0.25 + r() * 0.1, 0.6 + r() * 0.12, 0.22];
      gb.sphere(1.7 * s, leaf, x, h + 3.4 * s, z, 7, 5);
      gb.sphere(1.2 * s, mixRgb(leaf, [1, 1, 0.8], 0.1), x + 0.8 * s, h + 3.0 * s, z + 0.5 * s, 6, 4);
    }
    this._addObst(x, z, 0.9 * s);
  }
  _palm(gb, x, h, z, s) {
    gb.cylinder(0.25 * s, 0.35 * s, 4.5 * s, [0.6, 0.45, 0.28], x, h, z, 6, false);
    for (let k = 0; k < 5; k++) { const a = k / 5 * Math.PI * 2; gb.setMatrix(M4.fromTRS([x, h + 4.5 * s, z], [0.5, a, 0], [2.2 * s, 1, 0.8 * s])).quad([0, 0, -0.5], [1, -0.3, -0.1], [1, -0.3, 0.1], [0, 0, 0.5], [0.3, 0.65, 0.25]).quad([0, 0, 0.5], [1, -0.3, 0.1], [1, -0.3, -0.1], [0, 0, -0.5], [0.3, 0.65, 0.25]).setMatrix(null); }
    this._addObst(x, z, 0.6 * s);
  }
  _deadtree(gb, x, h, z, s, r) {
    const c = [0.35, 0.28, 0.24];
    gb.cylinder(0.2 * s, 0.35 * s, 3.2 * s, c, x, h, z, 5, false);
    for (let k = 0; k < 3; k++) gb.setMatrix(M4.fromTRS([x, h + (1.8 + k * 0.5) * s, z], [0.9, k * 2.1 + r(), 0], [1, 1, 1])).cylinder(0.05 * s, 0.12 * s, 1.4 * s, c, 0, 0, 0, 4, false).setMatrix(null);
    this._addObst(x, z, 0.5 * s);
  }
  _bush(gb, x, h, z, s, r) { const c = [0.3 + r() * 0.08, 0.6 + r() * 0.1, 0.25]; gb.sphere(0.9 * s, c, x, h + 0.4 * s, z, 7, 4, 0.8); gb.sphere(0.7 * s, mixRgb(c, [1, 1, 0.8], 0.12), x + 0.6 * s, h + 0.3 * s, z + 0.3 * s, 6, 4, 0.8); if (r() < 0.4) gb.sphere(0.13, [1, 0.4, 0.45], x + 0.3, h + 0.95 * s, z + 0.4, 5, 3); this._addObst(x, z, 0.7 * s); }
  _rock(gb, x, h, z, s, c) { gb.sphere(1.1 * s, c, x, h + 0.3 * s, z, 6, 4, 0.7); this._addObst(x, z, 0.9 * s); }
  _pillar(gb, x, h, z, s, c, r) { const hh = (4 + r() * 6) * s; gb.box(2.2 * s, hh, 2.2 * s, c, x, h + hh / 2 - 0.3, z); gb.box(2.6 * s, 0.6 * s, 2.6 * s, mixRgb(c, [1, 1, 1], 0.15), x, h + hh, z); this._addObst(x, z, 1.5 * s); }
  _cactus(gb, x, h, z, s, r) {
    const c = [0.32, 0.6, 0.3];
    gb.cylinder(0.4 * s, 0.45 * s, 3 * s, c, x, h, z, 7, true);
    gb.sphere(0.4 * s, c, x, h + 3 * s, z, 7, 4);
    const side = r() < 0.5 ? 1 : -1;
    gb.cylinder(0.25 * s, 0.25 * s, 0.8 * s, c, x + side * 0.6 * s, h + 1.4 * s, z, 6, false); gb.cylinder(0.25 * s, 0.25 * s, 1.2 * s, c, x + side * 0.9 * s, h + 1.4 * s, z, 6, true);
    if (r() < 0.4) gb.sphere(0.2 * s, [1, 0.5, 0.6], x, h + 3.35 * s, z, 6, 4);
    this._addObst(x, z, 0.6 * s);
  }
  _deadbush(gb, x, h, z, r) { for (let k = 0; k < 4; k++) gb.setMatrix(M4.fromTRS([x, h, z], [0.6, k * 1.6 + r(), 0], [1, 1, 1])).cylinder(0.03, 0.06, 0.9, [0.6, 0.48, 0.3], 0, 0, 0, 3, false).setMatrix(null); }
  _flower(gb, x, h, z, r) {
    const cols = [[1, 0.4, 0.45], [1, 0.85, 0.3], [0.7, 0.5, 1], [1, 1, 1], [1, 0.6, 0.2], [0.4, 0.7, 1]];
    const c = cols[Math.floor(r() * cols.length)];
    for (let k = 0; k < 3; k++) {
      const ox = (r() - 0.5) * 1.6, oz = (r() - 0.5) * 1.6;
      gb.cylinder(0.04, 0.04, 0.55, [0.3, 0.6, 0.25], x + ox, h - 0.05, z + oz, 3, false);
      gb.sphere(0.24, c, x + ox, h + 0.6, z + oz, 6, 3, 0.7);
      gb.sphere(0.1, [1, 0.95, 0.5], x + ox, h + 0.72, z + oz, 4, 2);
    }
  }
  _mush(gb, x, h, z, r, glow = false) {
    gb.cylinder(0.12, 0.15, 0.5, [0.95, 0.92, 0.85], x, h, z, 6, false);
    gb.sphere(0.4, glow ? [0.6, 0.4, 0.9] : (r() < 0.5 ? [0.9, 0.25, 0.2] : [0.85, 0.6, 0.3]), x, h + 0.5, z, 7, 4, 0.55);
  }
  _reed(gb, x, h, z, r) { for (let k = 0; k < 4; k++) { const ox = (r() - 0.5) * 0.8, oz = (r() - 0.5) * 0.8; gb.cylinder(0.03, 0.05, 1.4 + r() * 0.6, [0.45, 0.6, 0.3], x + ox, h - 0.2, z + oz, 3, false); gb.cylinder(0.08, 0.08, 0.35, [0.5, 0.35, 0.2], x + ox, h + 1.2, z + oz, 4, true); } }
  _crystal(gb, x, h, z, s, c, r) {
    for (let k = 0; k < 3; k++) { const a = k * 2.1 + r(); gb.setMatrix(M4.fromTRS([x + Math.cos(a) * 0.5 * s, h, z + Math.sin(a) * 0.5 * s], [Math.cos(a) * 0.3, 0, Math.sin(a) * 0.3], [0.45 * s, (1.6 + r() * 1.5) * s, 0.45 * s])).cone(1, 1, c, 0, 0, 0, 5).setMatrix(null); }
    this._addObst(x, z, 0.9 * s);
  }
  _lavaCrack(gb, x, h, z, r) { gb.setMatrix(M4.fromTRS([x, h + 0.08, z], [0, r() * 6, 0], [1.6, 1, 0.5])).disc(1, [1, 0.42, 0.1], 0, 0, 0, 8).setMatrix(null); }
  _grass(gr, x0, z0, B, r) {
    const base = B === 'desert' ? [0.75, 0.68, 0.35] : B === 'snow' ? [0.7, 0.85, 0.85] : B === 'volcano' ? [0.4, 0.35, 0.3] : B === 'swamp' ? [0.3, 0.45, 0.22] : B === 'canyon' ? [0.6, 0.55, 0.3] : B === 'sanctuary' ? [0.85, 0.8, 0.45] : B === 'highland' ? [0.35, 0.72, 0.3] : [0.24, 0.58, 0.22];
    const tip = mixRgb(base, [1, 1, 0.8], 0.35);
    const n = this.light ? 6 : 11;
    for (let k = 0; k < n; k++) {
      const x = x0 + r() * CELL, z = z0 + r() * CELL, h = this.heightAt(x, z) - 0.1;
      const hh = 1.0 + r() * 0.8, w = 0.4;
      const a = r() * Math.PI;
      const dx = Math.cos(a) * w, dz = Math.sin(a) * w;
      // 2枚の交差した板（下から上へ色が明るく）
      const s0 = gr.vcount;
      gr._push(x - dx, h, z - dz, 0, 1, 0, base); gr._push(x + dx, h, z + dz, 0, 1, 0, base); gr._push(x, h + hh, z, 0, 1, 0, tip);
      gr._push(x - dz, h, z + dx, 0, 1, 0, base); gr._push(x + dz, h, z - dx, 0, 1, 0, base); gr._push(x, h + hh * 0.9, z, 0, 1, 0, tip);
      gr.tri(s0, s0 + 1, s0 + 2); gr.tri(s0 + 1, s0, s0 + 2); gr.tri(s0 + 3, s0 + 4, s0 + 5); gr.tri(s0 + 4, s0 + 3, s0 + 5);
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

// ---------- 建物 ----------
const ROOF = ['#d0503c', '#3c78c8', '#4caa5a', '#d09a2a', '#8a5ac0', '#c8643c'];
export function buildBuilding(type, seed = 0, regionColor = '#c8643c') {
  initPrims();
  const gb = new GeoBuilder();
  const r = mulberry32(seed + 5);
  const wall = [0.96, 0.93, 0.86], dark = [0.25, 0.2, 0.18], win = [0.55, 0.8, 0.95];
  let w = 8, d = 7, hh = 4.5, door = [0, 0];
  const windows = (W, D, H, y0 = 0) => { for (const s of [-1, 1]) gb.box(1.2, 1.2, 0.15, win, s * W * 0.28, y0 + H * 0.55, D / 2 + 0.05); };
  if (type === 'house' || type === 'home') {
    gb.box(w, hh, d, wall, 0, hh / 2, 0);
    gb.roof(w + 1.2, 3, d + 1.2, hexToRgb(type === 'home' ? '#d0503c' : ROOF[Math.floor(r() * ROOF.length)]), 0, hh, 0);
    gb.box(1.6, 2.6, 0.2, [0.55, 0.35, 0.2], 0, 1.3, d / 2 + 0.05);
    windows(w, d, hh);
    if (type === 'home') gb.box(1, 3, 1, [0.6, 0.35, 0.3], 2.5, hh + 2, -1);
    door = [0, d / 2 + 1.5];
  } else if (type === 'hospital') {
    w = 12; d = 9; hh = 5.5;
    gb.box(w, hh, d, [1, 1, 1], 0, hh / 2, 0);
    gb.box(w + 0.8, 0.8, d + 0.8, [0.92, 0.3, 0.32], 0, hh + 0.4, 0);
    gb.box(2.6, 3, 0.25, [0.6, 0.85, 0.95], 0, 1.5, d / 2 + 0.05);
    // 赤十字の看板
    gb.box(3.2, 1.0, 0.3, [0.92, 0.25, 0.28], 0, hh + 2.2, d / 2 - 0.5); gb.box(1.0, 3.2, 0.3, [0.92, 0.25, 0.28], 0, hh + 2.2, d / 2 - 0.5);
    gb.box(3.8, 3.8, 0.25, [1, 1, 1], 0, hh + 2.2, d / 2 - 0.7);
    windows(w, d, hh);
    door = [0, d / 2 + 1.6];
  } else if (type === 'shop') {
    w = 10; d = 8; hh = 5;
    gb.box(w, hh, d, [0.98, 0.95, 0.85], 0, hh / 2, 0);
    gb.box(w + 0.8, 0.8, d + 0.8, [0.25, 0.5, 0.9], 0, hh + 0.4, 0);
    gb.box(2.4, 3, 0.25, [0.6, 0.85, 0.95], 0, 1.5, d / 2 + 0.05);
    // ひさし
    for (let i = 0; i < 6; i++) gb.box(w / 6, 0.2, 1.6, i % 2 ? [1, 1, 1] : [0.25, 0.5, 0.9], -w / 2 + w / 12 + i * w / 6, hh - 0.6, d / 2 + 0.8);
    gb.box(4, 1.3, 0.3, [0.25, 0.5, 0.9], 0, hh + 1.5, d / 2 - 0.3);
    windows(w, d, hh);
    door = [0, d / 2 + 1.6];
  } else if (type === 'hall') {
    w = 16; d = 12; hh = 7;
    const rc = hexToRgb(regionColor);
    gb.box(w, hh, d, [0.92, 0.9, 0.86], 0, hh / 2, 0);
    gb.roof(w + 1.6, 4.5, d + 1.6, rc, 0, hh, 0);
    for (const s of [-1, -0.35, 0.35, 1]) gb.cylinder(0.5, 0.5, hh, [1, 1, 1], s * (w / 2 - 1), 0, d / 2 + 1, 8);
    gb.box(w + 1, 0.6, 3, [0.85, 0.83, 0.8], 0, hh, d / 2 + 1);
    gb.box(3, 4, 0.25, [0.4, 0.28, 0.2], 0, 2, d / 2 + 0.05);
    gb.box(2, 2, 0.3, rc, 0, hh + 1.6, d / 2 + 0.3);
    door = [0, d / 2 + 3];
  } else if (type === 'lab') {
    w = 14; d = 10; hh = 6;
    gb.box(w, hh, d, [0.9, 0.92, 0.95], 0, hh / 2, 0);
    gb.box(w + 0.6, 0.6, d + 0.6, [0.5, 0.55, 0.6], 0, hh + 0.3, 0);
    gb.cylinder(0.2, 0.2, 2, [0.6, 0.6, 0.65], 4, hh + 0.6, -2, 6); gb.sphere(1.4, [0.9, 0.9, 0.95], 4, hh + 2.8, -2, 8, 5, 0.4);
    gb.box(2.6, 3, 0.25, [0.6, 0.85, 0.95], 0, 1.5, d / 2 + 0.05);
    for (const s of [-1, 1]) gb.box(2.5, 1.5, 0.15, win, s * 4.2, 3.2, d / 2 + 0.05);
    door = [0, d / 2 + 1.6];
  } else if (type === 'lighthouse') {
    w = 5; d = 5; hh = 14;
    for (let i = 0; i < 4; i++) gb.cylinder(2.2 - i * 0.25, 2.4 - i * 0.25, hh / 4, i % 2 ? [0.9, 0.25, 0.25] : [1, 1, 1], 0, i * hh / 4, 0, 10, i === 3);
    gb.cylinder(1.5, 1.5, 1.8, [1, 0.95, 0.6], 0, hh, 0, 8); gb.cone(1.8, 1.4, [0.9, 0.25, 0.25], 0, hh + 1.8, 0, 8);
    gb.box(1.4, 2.4, 0.3, [0.4, 0.28, 0.2], 0, 1.2, 2.3);
    door = [0, 3.5];
  }
  return { geo: gb.build(), w, d, h: hh, door };
}

// 地域ごとの空・霧
export const SKY = {
  plains: { bg: [0.55, 0.78, 0.96], fog: [0.66, 0.84, 0.97] }, start: { bg: [0.55, 0.78, 0.96], fog: [0.66, 0.84, 0.97] },
  forest: { bg: [0.5, 0.72, 0.85], fog: [0.55, 0.72, 0.7] }, lake: { bg: [0.55, 0.8, 0.98], fog: [0.7, 0.86, 0.96] },
  desert: { bg: [0.85, 0.82, 0.7], fog: [0.92, 0.84, 0.66] }, canyon: { bg: [0.85, 0.7, 0.6], fog: [0.86, 0.7, 0.58] },
  snow: { bg: [0.82, 0.88, 0.95], fog: [0.9, 0.93, 0.98] }, swamp: { bg: [0.45, 0.5, 0.45], fog: [0.5, 0.56, 0.5] },
  highland: { bg: [0.5, 0.75, 1], fog: [0.75, 0.88, 1] }, volcano: { bg: [0.45, 0.3, 0.28], fog: [0.5, 0.32, 0.28] },
  sanctuary: { bg: [0.75, 0.7, 0.9], fog: [0.85, 0.8, 0.9] }, inner: { bg: [0.4, 0.35, 0.6], fog: [0.55, 0.45, 0.75] },
  sea: { bg: [0.5, 0.75, 0.95], fog: [0.62, 0.82, 0.96] },
};
