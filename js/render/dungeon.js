// ダンジョン（迷路）の生成と描画
import { Node, GeoBuilder, initPrims, mixRgb } from '../engine/gl3d.js';
import { mulberry32 } from '../engine/util.js';
import { getFlora, getSmallFlora, stamp } from './flora.js';

// floor/wall/top: 床・壁・壁の上  deco: 壁の上と通路に置く飾り [種類, 大きさ最小, 最大, 色の倍率]
const THEME = {
  ruins: { floor: [0.6, 0.62, 0.5], wall: [0.62, 0.64, 0.56], top: [0.36, 0.6, 0.3], bg: [0.08, 0.12, 0.08], torch: [0.45, 1, 0.6],
    topDeco: [['bush', 0.5, 0.8, null]], floorDeco: [['tuft', 1, 1.5, [0.45, 0.75, 0.32], 1], ['rock', 0.3, 0.55, null], ['mush', 0.5, 0.75, null]] },
  pyramid: { floor: [0.88, 0.74, 0.5], wall: [0.8, 0.66, 0.42], top: [0.68, 0.52, 0.32], bg: [0.15, 0.1, 0.05], torch: [1, 0.7, 0.3],
    topDeco: [], floorDeco: [['rock', 0.3, 0.6, [1.2, 1.0, 0.72]]] },
  ice: { floor: [0.76, 0.88, 0.96], wall: [0.6, 0.78, 0.95], top: [0.94, 0.98, 1], bg: [0.05, 0.1, 0.18], torch: [0.5, 0.85, 1],
    topDeco: [['crystal', 0.4, 0.65, null]], floorDeco: [['crystal', 0.3, 0.5, null], ['rock', 0.3, 0.5, [1.05, 1.12, 1.25]]] },
  sky: { floor: [0.92, 0.93, 1], wall: [0.8, 0.84, 0.96], top: [1, 0.94, 0.72], bg: [0.45, 0.65, 0.95], torch: [1, 0.95, 0.6],
    topDeco: [['goldcrystal', 0.3, 0.5, null]], floorDeco: [['flower', 1, 1.3, [1, 0.86, 0.3], 1], ['flower', 1, 1.3, [1, 1, 1], 1]] },
  meteor: { floor: [0.22, 0.18, 0.3], wall: [0.3, 0.24, 0.42], top: [0.55, 0.35, 0.8], bg: [0.06, 0.02, 0.12], torch: [0.8, 0.4, 1],
    topDeco: [['purplecrystal', 0.4, 0.7, null]], floorDeco: [['purplecrystal', 0.3, 0.55, null], ['rock', 0.3, 0.55, [0.5, 0.42, 0.6]]] },
  lava: { floor: [0.32, 0.25, 0.23], wall: [0.4, 0.3, 0.26], top: [0.22, 0.16, 0.15], bg: [0.15, 0.03, 0.02], torch: [1, 0.45, 0.1],
    topDeco: [], floorDeco: [['rock', 0.35, 0.6, [0.5, 0.42, 0.42]], ['dead', 0.45, 0.6, [0.75, 0.6, 0.55]]] },
  abyss: { floor: [0.27, 0.22, 0.37], wall: [0.34, 0.27, 0.47], top: [0.52, 0.42, 0.82], bg: [0.02, 0.0, 0.06], torch: [0.75, 0.45, 1],
    topDeco: [['purplecrystal', 0.35, 0.55, null]], floorDeco: [['glowmush', 0.5, 0.7, null], ['purplecrystal', 0.25, 0.4, null]] },
};
export const DCELL = 6;

export class Dungeon {
  constructor(id, def, seed) {
    initPrims();
    this.id = id; this.def = def;
    const S = def.size | 1;
    this.S = S;
    const r = mulberry32(seed);
    const g = new Uint8Array(S * S).fill(1); // 1=壁
    const st = [[1, S - 2]]; g[(S - 2) * S + 1] = 0;
    while (st.length) {
      const [x, y] = st[st.length - 1];
      const dirs = [[2, 0], [-2, 0], [0, 2], [0, -2]].filter(([dx, dy]) => { const nx = x + dx, ny = y + dy; return nx > 0 && ny > 0 && nx < S - 1 && ny < S - 1 && g[ny * S + nx]; });
      if (!dirs.length) { st.pop(); continue; }
      const [dx, dy] = dirs[Math.floor(r() * dirs.length)];
      g[(y + dy / 2) * S + x + dx / 2] = 0; g[(y + dy) * S + x + dx] = 0; st.push([x + dx, y + dy]);
    }
    // ループを追加して遊びやすく
    for (let k = 0; k < S * 1.5; k++) { const x = 1 + Math.floor(r() * (S - 2)), y = 1 + Math.floor(r() * (S - 2)); if (g[y * S + x] && ((x % 2 === 1) !== (y % 2 === 1))) g[y * S + x] = 0; }
    this.g = g;
    // 入口から最も遠いマス＝ボス部屋
    const dist = new Int32Array(S * S).fill(-1); const q = [[1, S - 2]]; dist[(S - 2) * S + 1] = 0; let far = [1, S - 2];
    while (q.length) { const [x, y] = q.shift(); for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, ny = y + dy; if (!g[ny * S + nx] && dist[ny * S + nx] < 0) { dist[ny * S + nx] = dist[y * S + x] + 1; q.push([nx, ny]); if (dist[ny * S + nx] > dist[far[1] * S + far[0]]) far = [nx, ny]; } } }
    this.entrance = this.cellPos(1, S - 2);
    this.boss = this.cellPos(far[0], far[1]);
    // 宝箱（行き止まり）
    this.chests = [];
    for (let y = 1; y < S - 1; y++) for (let x = 1; x < S - 1; x++) {
      if (g[y * S + x]) continue;
      const open = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([dx, dy]) => !g[(y + dy) * S + x + dx]).length;
      if (open === 1 && !(x === 1 && y === S - 2) && !(x === far[0] && y === far[1]) && r() < 0.5 && this.chests.length < 4) this.chests.push(this.cellPos(x, y));
    }
    this.node = this._build(r);
  }
  cellPos(x, y) { return [(x - this.S / 2) * DCELL + DCELL / 2, (y - this.S / 2) * DCELL + DCELL / 2]; }
  cellOf(px, pz) { return [Math.floor(px / DCELL + this.S / 2), Math.floor(pz / DCELL + this.S / 2)]; }
  wall(x, y) { if (x < 0 || y < 0 || x >= this.S || y >= this.S) return true; return !!this.g[y * this.S + x]; }
  blocked(px, pz, rad = 0.6) {
    for (const [ox, oz] of [[rad, rad], [-rad, rad], [rad, -rad], [-rad, -rad]]) { const [x, y] = this.cellOf(px + ox, pz + oz); if (this.wall(x, y)) return true; }
    return false;
  }
  heightAt() { return 0; }
  _build(r) {
    const T = THEME[this.def.theme] || THEME.ruins;
    this.theme = T;
    const F = getFlora(), SM = getSmallFlora();
    const lib = (k, small) => (small ? SM[k] : F[k]) || [];
    const gb = new GeoBuilder(), deco = new GeoBuilder();
    const S = this.S, H2 = DCELL / 2;
    const sh = (c, k) => mixRgb(c, k > 0 ? [1, 1, 1] : [0, 0, 0], Math.min(1, Math.abs(k)));
    const put = (list, x, y, z) => {
      if (!list.length) return;
      const [k, s0, s1, tint, small] = list[Math.floor(r() * list.length)];
      const L = lib(k, small); if (!L.length) return;
      stamp(deco, L[Math.floor(r() * L.length)], x, y, z, r() * 6.28, s0 + r() * (s1 - s0), tint);
    };
    const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const [cx, cz] = this.cellPos(x, y);
      if (this.wall(x, y)) {
        // 石積みの壁：本体＋目地の帯＋ところどころ出っ張った石＋上のふち
        const h = 2.3 + r() * 0.5;
        gb.box(DCELL, h, DCELL, sh(T.wall, -r() * 0.12), cx, h / 2, cz);
        for (const yy of [0.85, 1.7]) if (yy < h - 0.3) gb.box(DCELL + 0.06, 0.07, DCELL + 0.06, sh(T.wall, -0.32), cx, yy, cz);
        gb.box(DCELL + 0.1, 0.18, DCELL + 0.1, sh(T.wall, -0.25), cx, 0.09, cz);
        for (const [dx, dy] of DIRS) {
          if (this.wall(x + dx, y + dy)) continue;
          for (let k = 0; k < 3; k++) {
            if (r() < 0.35) continue;
            const u = (r() - 0.5) * (DCELL - 1.6), bw = 0.9 + r() * 0.9, bh = 0.45 + r() * 0.35, yy = 0.3 + r() * (h - 1.0);
            const px = dx ? cx + dx * (H2 + 0.05) : cx + u, pz = dy ? cz + dy * (H2 + 0.05) : cz + u;
            gb.box(dx ? 0.16 : bw, bh, dy ? 0.16 : bw, sh(T.wall, (r() - 0.4) * 0.25), px, yy, pz);
          }
        }
        // 上のふち：4枚の石板（高さと色を少しずつ変え、苔や雪がまだらに乗った感じに）
        gb.box(DCELL + 0.2, 0.22, DCELL + 0.2, sh(T.wall, -0.2), cx, h + 0.05, cz);
        for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) {
          const th = 0.2 + r() * 0.16;
          gb.box(H2 - 0.1, th, H2 - 0.1, mixRgb(sh(T.wall, 0.08), sh(T.top, (r() - 0.5) * 0.15), 0.35 + r() * 0.6), cx + (i - 0.5) * H2, h + 0.12 + th / 2, cz + (j - 0.5) * H2);
        }
        if (T.topDeco.length && r() < 0.45) put(T.topDeco, cx + (r() - 0.5) * 3.4, h + 0.3, cz + (r() - 0.5) * 3.4);
      } else {
        // 石だたみの床（目地のすき間＋1枚ずつ色むら）
        gb.box(DCELL, 0.2, DCELL, sh(T.floor, -0.38), cx, -0.12, cz);
        for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) gb.box(H2 - 0.12, 0.1, H2 - 0.12, sh(T.floor, (r() - 0.5) * 0.16 + ((i + j) % 2) * 0.04), cx + (i - 0.5) * H2, -0.03, cz + (j - 0.5) * H2);
        // 通路の飾り：壁ぎわに置く（真ん中は通れるように空ける）
        const nW = DIRS.filter(([dx, dy]) => this.wall(x + dx, y + dy));
        for (let k = 0; k < 2; k++) {
          if (!nW.length || r() > 0.42) continue;
          const [dx, dy] = nW[Math.floor(r() * nW.length)], u = (r() - 0.5) * (DCELL - 1.4);
          put(T.floorDeco, cx + (dx ? dx * (H2 - 0.55) : u), 0, cz + (dy ? dy * (H2 - 0.55) : u));
        }
      }
    }
    const root = new Node(gb.build(), { castShadow: false });
    if (deco.vcount) root.add(new Node(deco.build(), { outline: 0.6 }));
    // たいまつ（柱・皿・炎）と、床を照らす光の輪
    const tb = new GeoBuilder(), fb = new GeoBuilder(), gl = new GeoBuilder();
    let n = 0;
    for (let y = 1; y < S - 1; y += 2) for (let x = 1; x < S - 1; x += 2) {
      if (this.wall(x, y) || r() > 0.4) continue;
      const [cx, cz] = this.cellPos(x, y);
      const tx = cx + 2.3, tz = cz + 2.3;
      tb.cylinder(0.11, 0.15, 1.3, sh(T.wall, -0.35), tx, 0, tz, 6);
      tb.cylinder(0.34, 0.16, 0.24, [0.3, 0.24, 0.2], tx, 1.3, tz, 8);
      fb.sphere(0.26, T.torch, tx, 1.68, tz, 7, 5, 1.5);
      fb.sphere(0.15, mixRgb(T.torch, [1, 1, 1], 0.6), tx, 1.62, tz, 6, 4, 1.3);
      gl.cylinder(2.6, 2.6, 0.02, T.torch, tx - 0.5, 0.06, tz - 0.5, 16);
      n++;
    }
    if (n) {
      root.add(new Node(tb.build()));
      root.add(new Node(fb.build(), { emis: T.torch.map(v => v * 0.75), outline: 0.4, castShadow: false }));
      const glow = new Node(gl.build(), { color: [1, 1, 1], alpha: 0.16, unlit: true, outline: 0, castShadow: false, receiveShadow: false });
      glow.noDepthWrite = true; root.add(glow);
    }
    return root;
  }
}

// 宝箱（木の箱＋金の縁取り）
export function chestGeo() {
  const g = new GeoBuilder();
  const wood = [0.72, 0.42, 0.18], dark = [0.45, 0.25, 0.1], gold = [1, 0.82, 0.3];
  g.box(1.3, 0.7, 0.9, wood, 0, 0.35, 0);
  g.box(1.36, 0.36, 0.96, mixRgb(wood, [1, 1, 1], 0.08), 0, 0.88, 0);
  g.box(1.38, 0.08, 0.98, dark, 0, 0.7, 0);
  for (const sx of [-0.5, 0.5]) g.box(0.1, 1.08, 1.0, gold, sx, 0.54, 0);
  g.box(0.24, 0.26, 0.06, gold, 0, 0.66, 0.48);
  return g.build();
}
