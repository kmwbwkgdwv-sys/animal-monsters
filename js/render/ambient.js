// =============================================================
//  空気中を舞うもの（花びら・木の葉・雪・火の粉・ホタル・光の粒）
// =============================================================
import { Node, PRIM, initPrims } from '../engine/gl3d.js';

const KINDS = {
  petals: { geo: 'leaf', cols: [[1, 0.72, 0.82], [1, 1, 1], [1, 0.9, 0.5], [1, 0.6, 0.72]], size: [0.16, 0.26], fall: -0.6, drift: 2.2, spin: 3, lit: true },
  leaves: { geo: 'leaf', cols: [[0.45, 0.78, 0.28], [0.85, 0.82, 0.3], [0.35, 0.62, 0.22], [0.95, 0.6, 0.2]], size: [0.22, 0.34], fall: -0.9, drift: 1.6, spin: 2.6, lit: true },
  sand: { geo: 'sphereLo', cols: [[1, 0.9, 0.7], [0.95, 0.82, 0.6]], size: [0.05, 0.09], fall: 0, drift: 7, spin: 0, alpha: 0.75 },
  snow: { geo: 'sphereLo', cols: [[1, 1, 1], [0.92, 0.96, 1]], size: [0.07, 0.14], fall: -2.0, drift: 0.9, spin: 0, alpha: 0.95 },
  fireflies: { geo: 'sphereLo', cols: [[0.85, 1, 0.45], [0.6, 1, 0.6]], size: [0.07, 0.11], fall: 0, drift: 0.3, wander: 1.4, glow: true, blink: true },
  embers: { geo: 'sphereLo', cols: [[1, 0.55, 0.12], [1, 0.82, 0.3], [1, 0.35, 0.1]], size: [0.06, 0.12], fall: 1.8, drift: 0.8, wander: 0.8, glow: true, blink: true },
  motes: { geo: 'star', cols: [[1, 0.92, 0.55], [0.85, 0.75, 1], [1, 1, 1]], size: [0.1, 0.18], fall: 0.6, drift: 0.4, wander: 0.5, glow: true, blink: true, spin: 1.5 },
};
export const BIOME_AMBIENT = {
  start: 'petals', plains: 'petals', highland: 'petals', lake: 'petals', forest: 'leaves', desert: 'sand', canyon: 'sand',
  snow: 'snow', swamp: 'fireflies', volcano: 'embers', sanctuary: 'motes', inner: 'motes', sea: null,
  ruins: 'motes', pyramid: 'sand', ice: 'snow', sky: 'motes', lava: 'embers', abyss: 'motes',
};

export class Ambient {
  constructor(scene, opts = {}) {
    initPrims();
    this.scene = scene;
    this.max = opts.count ?? (opts.light ? 16 : 44);
    this.radius = opts.radius || 24;
    this.height = opts.height || 11;
    this.parts = [];
    this.kind = null; this.t = 0;
    this.node = new Node(); scene.add(this.node);
  }
  setKind(k) {
    if (k === this.kind) return;
    this.kind = k;
    for (const p of this.parts) this.node.remove(p.n);
    this.parts = [];
  }
  _spawn(c, init) {
    const K = KINDS[this.kind];
    const col = K.cols[Math.floor(Math.random() * K.cols.length)];
    const n = new Node(PRIM[K.geo], { color: col, unlit: !K.lit, outline: 0, cloudShadow: 0, alpha: K.alpha ?? 1, emis: K.glow ? col.map(v => v * 0.6) : [0, 0, 0], castShadow: false });
    if (K.geo === 'leaf' || K.geo === 'star') n.doubleSide = true;
    if (K.alpha || K.blink) { n.transparent = true; n.noDepthWrite = true; }
    const s = K.size[0] + Math.random() * (K.size[1] - K.size[0]);
    n.setScale(K.geo === 'leaf' ? s * 1.6 : s, s, K.geo === 'leaf' ? s : s);
    const a = Math.random() * Math.PI * 2, d = Math.sqrt(Math.random()) * this.radius;
    const y = init ? Math.random() * this.height : (K.fall < 0 ? this.height : K.fall > 0 ? 0 : Math.random() * this.height);
    n.setPos(c[0] + Math.cos(a) * d, c[1] + y, c[2] + Math.sin(a) * d);
    n.rot = [Math.random() * 6, Math.random() * 6, Math.random() * 6];
    this.node.add(n);
    return { n, life: 6 + Math.random() * 8, ph: Math.random() * 10, s, base: n.color[3] };
  }
  update(dt, center, wind = [0.8, 0.35, 0.6]) {
    this.t += dt;
    if (!this.kind || !KINDS[this.kind]) return;
    const K = KINDS[this.kind];
    while (this.parts.length < this.max) this.parts.push(this._spawn(center, this.parts.length < this.max * 0.8));
    const wx = wind[0] * K.drift * (0.6 + wind[1]), wz = wind[2] * K.drift * (0.6 + wind[1]);
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const p = this.parts[i], n = p.n;
      p.life -= dt;
      const t = this.t + p.ph;
      const wan = K.wander || 0;
      n.pos[0] += (wx + Math.sin(t * 1.3) * (0.4 + wan)) * dt;
      n.pos[2] += (wz + Math.cos(t * 1.1) * (0.4 + wan)) * dt;
      n.pos[1] += (K.fall + Math.sin(t * 2.1) * (0.3 + wan * 0.6)) * dt;
      if (K.spin) { n.rot[0] += dt * K.spin; n.rot[2] += dt * K.spin * 0.7; }
      if (K.blink) n.color[3] = 0.35 + 0.65 * Math.max(0, Math.sin(t * 2.6));
      const dx = n.pos[0] - center[0], dz = n.pos[2] - center[2], dy = n.pos[1] - center[1];
      if (p.life <= 0 || dx * dx + dz * dz > this.radius * this.radius * 1.4 || dy < -2 || dy > this.height + 4) {
        this.node.remove(n); this.parts.splice(i, 1);
      }
    }
  }
  clear() { this.setKind(null); }
}
