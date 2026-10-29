// ダンジョン（迷路）の生成と描画
import { Node, GeoBuilder, initPrims, mixRgb } from '../engine/gl3d.js';
import { mulberry32 } from '../engine/util.js';

const THEME = {
  ruins: { floor: [0.55, 0.6, 0.45], wall: [0.6, 0.62, 0.55], top: [0.35, 0.55, 0.3], bg: [0.08, 0.12, 0.08], torch: [0.4, 1, 0.6] },
  pyramid: { floor: [0.85, 0.72, 0.48], wall: [0.78, 0.64, 0.4], top: [0.65, 0.5, 0.3], bg: [0.15, 0.1, 0.05], torch: [1, 0.7, 0.3] },
  ice: { floor: [0.75, 0.88, 0.95], wall: [0.6, 0.8, 0.95], top: [0.9, 0.97, 1], bg: [0.05, 0.1, 0.18], torch: [0.5, 0.85, 1] },
  sky: { floor: [0.9, 0.92, 1], wall: [0.78, 0.82, 0.95], top: [1, 0.95, 0.75], bg: [0.45, 0.65, 0.95], torch: [1, 0.95, 0.6] },
  lava: { floor: [0.3, 0.24, 0.22], wall: [0.38, 0.28, 0.24], top: [0.2, 0.15, 0.14], bg: [0.15, 0.03, 0.02], torch: [1, 0.45, 0.1] },
  abyss: { floor: [0.25, 0.2, 0.35], wall: [0.32, 0.25, 0.45], top: [0.5, 0.4, 0.8], bg: [0.02, 0.0, 0.06], torch: [0.75, 0.45, 1] },
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
    const gb = new GeoBuilder();
    const S = this.S, half = S * DCELL / 2;
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const [cx, cz] = this.cellPos(x, y);
      if (this.wall(x, y)) {
        const h = 2.2 + r() * 0.4;
        gb.box(DCELL, h, DCELL, mixRgb(T.wall, [0, 0, 0], r() * 0.15), cx, h / 2, cz);
        gb.box(DCELL + 0.1, 0.4, DCELL + 0.1, T.top, cx, h + 0.2, cz);
      } else {
        gb.box(DCELL, 0.2, DCELL, mixRgb(T.floor, [1, 1, 1], ((x + y) % 2) * 0.06), cx, -0.1, cz);
      }
    }
    void half;
    const root = new Node(gb.build());
    // たいまつ
    const tb = new GeoBuilder();
    let n = 0;
    for (let y = 1; y < S - 1; y += 2) for (let x = 1; x < S - 1; x += 2) {
      if (this.wall(x, y) || r() > 0.35) continue;
      const [cx, cz] = this.cellPos(x, y);
      tb.cylinder(0.1, 0.12, 1.2, [0.35, 0.25, 0.2], cx + 2.3, 0, cz + 2.3, 5);
      tb.sphere(0.32, T.torch, cx + 2.3, 1.4, cz + 2.3, 6, 4);
      n++;
    }
    if (n) root.add(new Node(tb.build(), { emis: T.torch.map(v => v * 0.6) }));
    return root;
  }
}
