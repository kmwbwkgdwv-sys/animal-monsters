// =============================================================
//  アニメ調の空（グラデーションの空・セル調の雲・遠くの山なみ）
// =============================================================
import { Node, GeoBuilder, PRIM, initPrims, mixRgb, MAT } from '../engine/gl3d.js';
import { mulberry32 } from '../engine/util.js';

// 空の色のテーマ
export const SKY_THEMES = {
  day: { zenith: [0.16, 0.42, 0.9], horizon: [0.7, 0.88, 1.0], cloud: [1, 1, 1], mount: [0.42, 0.58, 0.82], light: [0.45, 0.78, 0.42] },
  morning: { zenith: [0.26, 0.5, 0.93], horizon: [1.0, 0.86, 0.72], cloud: [1, 0.96, 0.92], mount: [0.5, 0.55, 0.78], light: [0.6, 0.5, 0.62] },
  sunset: { zenith: [0.26, 0.24, 0.62], horizon: [1.0, 0.62, 0.42], cloud: [1, 0.8, 0.72], mount: [0.42, 0.32, 0.55], light: [0.75, 0.28, 0.6] },
  desert: { zenith: [0.25, 0.5, 0.88], horizon: [1.0, 0.9, 0.7], cloud: [1, 0.97, 0.9], mount: [0.8, 0.62, 0.5], light: [0.4, 0.8, 0.45] },
  snow: { zenith: [0.35, 0.55, 0.9], horizon: [0.88, 0.94, 1.0], cloud: [1, 1, 1], mount: [0.7, 0.78, 0.92], light: [0.45, 0.72, 0.5] },
  swamp: { zenith: [0.3, 0.38, 0.5], horizon: [0.68, 0.74, 0.66], cloud: [0.85, 0.88, 0.86], mount: [0.42, 0.48, 0.46], light: [0.4, 0.75, 0.5] },
  volcano: { zenith: [0.24, 0.12, 0.18], horizon: [0.95, 0.45, 0.28], cloud: [0.55, 0.42, 0.42], mount: [0.3, 0.16, 0.18], light: [0.4, 0.75, 0.5] },
  sanctuary: { zenith: [0.38, 0.36, 0.82], horizon: [1.0, 0.86, 0.95], cloud: [1, 0.95, 1], mount: [0.62, 0.55, 0.82], light: [0.45, 0.78, 0.42] },
  inner: { zenith: [0.14, 0.1, 0.36], horizon: [0.7, 0.5, 0.92], cloud: [0.85, 0.75, 1], mount: [0.35, 0.25, 0.55], light: [0.45, 0.78, 0.42] },
  cave: { zenith: [0.04, 0.03, 0.07], horizon: [0.12, 0.1, 0.16], cloud: [0.2, 0.18, 0.25], mount: [0.08, 0.07, 0.1], light: [0.45, 0.78, 0.42], noClouds: true },
};

export class SkyRig {
  constructor(scene, opts = {}) {
    initPrims();
    this.scene = scene;
    this.node = new Node(); scene.add(this.node);
    this.dome = new Node(PRIM.sphere, { kind: 1, noFog: true, outline: 0, cull: false });
    this.dome.doubleSide = true; this.dome.cull = false;
    this.dome.setScale(opts.dome || 700);
    this.node.add(this.dome);
    this.cloudNode = new Node(); this.node.add(this.cloudNode);
    this.mountNode = new Node(); this.node.add(this.mountNode);
    const r = mulberry32(opts.seed || 11);
    this.light = !!opts.light;
    // 雲（もこもこの積雲）
    const nC = opts.clouds ?? (this.light ? 7 : 14);
    const R0 = opts.cloudR || 260;
    this.clouds = [];
    for (let i = 0; i < nC; i++) {
      const g = new GeoBuilder();
      const w = 22 + r() * 30, puffs = 5 + Math.floor(r() * 5);
      g.center([0, 4, 0]);
      for (let k = 0; k < puffs; k++) {
        const t = k / (puffs - 1) - 0.5;
        const rr = (7 + r() * 7) * (1 - Math.abs(t) * 0.9);
        g.sphere(rr, [1, 1, 1], t * w + (r() - 0.5) * 4, rr * 0.35 + r() * 3, (r() - 0.5) * 8, 10, 7, 0.82);
      }
      g.sphere(w * 0.42, [1, 1, 1], 0, 0, 0, 12, 6, 0.32);
      g.center(null);
      const n = new Node(g.build(), { mat: MAT.cloud, noFog: true, outline: 0, cloudShadow: 0, castShadow: false, receiveShadow: false });
      const a = i / nC * Math.PI * 2 + r() * 0.3, d = R0 + r() * 120;
      n.setPos(Math.cos(a) * d, (opts.cloudY || 35) + r() * 70, Math.sin(a) * d);
      n.rot[1] = -a + Math.PI / 2;
      const s = 0.8 + r() * 0.7; n.setScale(s, s * (0.8 + r() * 0.3), s);
      n.cull = false;
      this.cloudNode.add(n); this.clouds.push(n);
    }
    // 遠くの山なみ（稜線がつながった帯・下は霞・高い峰には雪）
    if (opts.mountains !== false) {
      for (let layer = 0; layer < 2; layer++) {
        const g = new GeoBuilder();
        const R = (opts.mountR || 430) + layer * 90, seg = 140;
        const H0 = (opts.mountH || 90) * (layer ? 1.35 : 1);
        const ph = r() * 10;
        const ridge = (a) => {
          let v = 0, amp = 1, f = 3;
          for (let o = 0; o < 4; o++) { v += (1 - Math.abs(Math.sin(a * f + ph * (o + 1)))) * amp; amp *= 0.5; f *= 2.3; }
          return Math.pow(v / 1.9, 1.6);
        };
        const top = [], mid = [], bot = [];
        for (let k = 0; k <= seg; k++) {
          const a = k / seg * Math.PI * 2, c = Math.cos(a), sn = Math.sin(a);
          const h = H0 * (0.25 + 0.75 * ridge(a));
          const snow = h > H0 * 0.72;
          const nx = -c * 0.8, nz = -sn * 0.8, ny = 0.6;
          bot.push(g._push(c * R, -12, sn * R, nx, ny, nz, [0.78, 0.8, 0.86]));
          mid.push(g._push(c * (R + 6), h * 0.55, sn * (R + 6), nx, ny, nz, [0.9, 0.9, 0.94]));
          top.push(g._push(c * (R + 14), h, sn * (R + 14), nx, ny + 0.3, nz, snow ? [1.5, 1.52, 1.6] : [1.02, 1.0, 1.0]));
        }
        for (let k = 0; k < seg; k++) { g.tri(bot[k], bot[k + 1], mid[k]); g.tri(mid[k], bot[k + 1], mid[k + 1]); g.tri(mid[k], mid[k + 1], top[k]); g.tri(top[k], mid[k + 1], top[k + 1]); }
        const n = new Node(g.build(), { mat: MAT.decor, noFog: true, outline: 0, cloudShadow: 0, castShadow: false, receiveShadow: false });
        n.cull = false; n.layer = layer; n.doubleSide = true;
        this.mountNode.add(n);
      }
    }
    this.t = 0;
    this.setTheme(opts.theme || 'day');
  }
  setTheme(name, k = 1) {
    const th = typeof name === 'string' ? (SKY_THEMES[name] || SKY_THEMES.day) : name;
    const S = this.scene;
    if (!this.cur || k >= 1) this.cur = JSON.parse(JSON.stringify(th));
    else for (const key of ['zenith', 'horizon', 'cloud', 'mount']) for (let i = 0; i < 3; i++) this.cur[key][i] += (th[key][i] - this.cur[key][i]) * k;
    const c = this.cur;
    S.zenith = c.zenith; S.horizon = c.horizon;
    for (const n of this.clouds) n.color = [c.cloud[0], c.cloud[1], c.cloud[2], 1];
    this.cloudNode.visible = !th.noClouds;
    for (const n of this.mountNode.children) { const m = mixRgb(c.mount, c.horizon, n.layer ? 0.55 : 0.25); n.color = [m[0], m[1], m[2], 1]; }
  }
  update(dt, cam) {
    this.t += dt;
    this.node.setPos(cam.pos[0], 0, cam.pos[2]);
    this.dome.setPos(0, cam.pos[1], 0);
    this.cloudNode.rot[1] += dt * 0.004;
  }
}
