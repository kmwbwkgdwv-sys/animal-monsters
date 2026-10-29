// バトル画面の3D演出
import { Scene, Camera, Node, PRIM, initPrims, GeoBuilder, hexToRgb, mixRgb } from '../engine/gl3d.js';
import { buildAnimon, animateAnimon } from './models.js';
import { TYPE_COLOR } from '../data/types.js';
import { SKY } from './world.js';
import { mulberry32 } from '../engine/util.js';

const GROUND = {
  plains: [0.45, 0.74, 0.34], start: [0.45, 0.74, 0.34], forest: [0.28, 0.55, 0.24], lake: [0.45, 0.72, 0.4], desert: [0.92, 0.8, 0.52], canyon: [0.75, 0.48, 0.32],
  snow: [0.92, 0.95, 1], swamp: [0.33, 0.4, 0.25], highland: [0.55, 0.8, 0.42], volcano: [0.3, 0.26, 0.25], sanctuary: [0.8, 0.8, 0.6], inner: [0.8, 0.76, 0.95],
  sea: [0.3, 0.55, 0.85], ruins: [0.55, 0.6, 0.45], pyramid: [0.85, 0.72, 0.48], ice: [0.75, 0.88, 0.95], sky: [0.9, 0.92, 1], lava: [0.3, 0.24, 0.22], abyss: [0.25, 0.2, 0.35], arena: [0.75, 0.75, 0.8],
};

export class BattleView {
  constructor() {
    initPrims();
    this.scene = new Scene();
    this.cam = new Camera(40);
    this.mons = {}; // "side,slot" → {M, base:[x,y,z], ry}
    this.fx = []; this.tweens = []; this.t = 0; this.shake = 0;
    this.n = 1;
  }
  setup(biome, format) {
    this.scene = new Scene();
    this.mons = {}; this.fx = []; this.tweens = [];
    this.n = format === 'double' ? 2 : 1;
    const sky = SKY[biome] || (biome === 'ruins' || biome === 'abyss' || biome === 'lava' || biome === 'pyramid' || biome === 'ice' ? { bg: [0.08, 0.06, 0.1], fog: [0.1, 0.08, 0.12] } : SKY.plains);
    this.scene.bg = sky.bg.slice(); this.scene.fogColor = sky.fog.slice(); this.scene.fogNear = 30; this.scene.fogFar = 90;
    if (biome === 'sky') { this.scene.bg = [0.5, 0.72, 1]; this.scene.fogColor = [0.75, 0.85, 1]; }
    const g = GROUND[biome] || GROUND.plains;
    const gr = new Node(PRIM.disc, { color: g }); gr.setScale(80, 1, 80); this.scene.add(gr);
    const r = mulberry32(biome.length * 31 + 7);
    // 足場
    for (const p of this.slotsAll()) { const d = new Node(PRIM.disc, { color: mixRgb(g, [1, 1, 1], 0.3) }); d.setScale(2.6, 1, 2.6); d.setPos(p[0], 0.02, p[2]); this.scene.add(d); const d2 = new Node(PRIM.disc, { color: mixRgb(g, [0, 0, 0], 0.15) }); d2.setScale(2.9, 1, 2.9); d2.setPos(p[0], 0.01, p[2]); this.scene.add(d2); }
    // 背景の飾り
    const gb = new GeoBuilder();
    for (let i = 0; i < 40; i++) {
      const a = r() * Math.PI * 2, rr = 22 + r() * 30;
      const x = Math.cos(a) * rr, z = Math.sin(a) * rr - 10;
      if (z > 8) continue;
      if (biome === 'desert' || biome === 'pyramid') gb.cylinder(0.5, 0.6, 3 + r() * 2, [0.32, 0.6, 0.3], x, 0, z, 6);
      else if (biome === 'snow' || biome === 'ice') { gb.cylinder(0.05, 2, 5, [0.85, 0.92, 1], x, 0, z, 6); }
      else if (biome === 'volcano' || biome === 'lava') gb.sphere(1.5 + r() * 1.5, [0.2, 0.17, 0.17], x, 0.3, z, 6, 4, 0.7);
      else if (biome === 'canyon') gb.box(3, 5 + r() * 8, 3, [0.7, 0.45, 0.3], x, 3, z);
      else if (biome === 'sea' || biome === 'lake') { if (r() < 0.5) gb.sphere(1.2, [0.55, 0.55, 0.5], x, 0.2, z, 6, 4, 0.6); }
      else if (biome === 'sanctuary' || biome === 'inner' || biome === 'abyss' || biome === 'sky' || biome === 'ruins') gb.box(1.5, 6 + r() * 4, 1.5, [0.85, 0.82, 0.78], x, 3, z);
      else { gb.cylinder(0.3, 0.4, 2.5, [0.45, 0.3, 0.18], x, 0, z, 6); gb.sphere(2, biome === 'forest' ? [0.2, 0.5, 0.2] : [0.3, 0.62, 0.25], x, 3.6, z, 7, 5); }
    }
    if (gb.vcount) this.scene.add(new Node(gb.build()));
    if (biome === 'sea' || biome === 'lake') { const w = new Node(PRIM.disc, { color: [0.3, 0.55, 0.9], alpha: 0.6 }); w.setScale(80, 1, 80); w.setPos(0, 0.05, -30); w.transparent = true; this.scene.add(w); }
    this.baseCam();
  }
  slotPos(side, slot) {
    if (this.n === 1) return side === 0 ? [-2.6, 0, 3.6] : [2.6, 0, -3.8];
    return side === 0 ? [[-5.4, 0, 3.0], [-1.2, 0, 5.4]][slot] : [[1.2, 0, -5.4], [5.4, 0, -3.0]][slot];
  }
  slotsAll() { const a = []; for (const s of [0, 1]) for (let k = 0; k < this.n; k++) a.push(this.slotPos(s, k)); return a; }
  baseCam() {
    if (this.n === 1) { this.camBase = [4.2, 4.2, 11.5]; this.camLook = [-0.8, -0.6, -1.0]; }
    else { this.camBase = [6.5, 6.8, 16]; this.camLook = [-1.2, -1.0, -1.2]; }
    this.cam.pos = this.camBase.slice(); this.cam.target = this.camLook.slice();
  }
  key(s, k) { return s + ',' + k; }
  setMon(side, slot, mon, opts = {}) {
    this.clearMon(side, slot);
    const M = buildAnimon(mon.sp, mon.shiny);
    // 大きすぎるモデル（伝説など）はバトル画面に収まるよう縮める
    const maxH = this.n === 2 ? 3.0 : 3.4;
    if (M.height > maxH) { const k = maxH / M.height; M.pivot.setScale(M.size * k); M.height = maxH; M.size *= k; }
    const p = this.slotPos(side, slot);
    M.root.setPos(p[0], p[1], p[2]);
    // 相手の方を向く
    const tgt = this.slotPos(1 - side, Math.min(slot, this.n - 1));
    const ry = Math.atan2(tgt[0] - p[0], tgt[2] - p[2]);
    M.root.rot[1] = ry;
    this.scene.add(M.root);
    const ent = { M, base: p.slice(), ry, alive: true };
    this.mons[this.key(side, slot)] = ent;
    if (opts.instant) return Promise.resolve();
    // 登場演出
    M.root.setScale(0.01);
    this.burst(p[0], 1, p[2], [1, 1, 1], 14, 3);
    return this.tween(380, (t) => { const s = t < 0.8 ? t / 0.8 * 1.1 : 1.1 - (t - 0.8) / 0.2 * 0.1; M.root.setScale(Math.max(0.01, s)); }).then(() => { M.root.setScale(1); if (mon.shiny) return this.sparkle(side, slot); });
  }
  clearMon(side, slot) {
    const e = this.mons[this.key(side, slot)];
    if (e) { this.scene.root.remove(e.M.root); delete this.mons[this.key(side, slot)]; }
  }
  withdraw(side, slot) {
    const e = this.mons[this.key(side, slot)];
    if (!e) return Promise.resolve();
    return this.tween(250, t => e.M.root.setScale(Math.max(0.01, 1 - t))).then(() => this.clearMon(side, slot));
  }
  tween(ms, fn) { return new Promise(res => this.tweens.push({ ms, t: 0, fn, res })); }
  wait(ms) { return this.tween(ms, () => { }); }

  // ---- エフェクト ----
  particle(x, y, z, vx, vy, vz, col, life, size = 0.18, geo = PRIM.sphereLo, grav = -6) {
    const n = new Node(geo, { color: col, unlit: true, emis: [0, 0, 0] });
    n.setPos(x, y, z); n.setScale(size); n.transparent = true; n.noDepthWrite = true; n.doubleSide = true;
    this.scene.add(n);
    this.fx.push({ n, vx, vy, vz, life, max: life, size, grav });
  }
  burst(x, y, z, col, count = 16, sp = 4, geo = PRIM.sphereLo, size = 0.18) {
    for (let i = 0; i < count; i++) { const a = Math.random() * Math.PI * 2, b = Math.random() * Math.PI - Math.PI / 2; this.particle(x, y, z, Math.cos(a) * Math.cos(b) * sp, Math.sin(b) * sp + 2, Math.sin(a) * Math.cos(b) * sp, col, 0.5 + Math.random() * 0.4, size, geo); }
  }
  sparkle(side, slot) {
    const e = this.mons[this.key(side, slot)]; if (!e) return Promise.resolve();
    const [x, , z] = e.base; const h = e.M.height;
    for (let i = 0; i < 18; i++) setTimeout(() => this.particle(x + (Math.random() - 0.5) * 2.5, h * (0.3 + Math.random()), z + (Math.random() - 0.5) * 2.5, 0, 1.2, 0, [1, 0.95, 0.5], 0.9, 0.35, PRIM.star, 0), i * 45);
    return this.wait(900);
  }
  center(side, slot) { const e = this.mons[this.key(side, slot)]; const p = e ? e.base : this.slotPos(side, slot); return [p[0], (e ? e.M.height * 0.5 : 1), p[2]]; }

  async playMove(side, slot, tside, tslot, type, isStatus) {
    const e = this.mons[this.key(side, slot)];
    if (!e) return;
    const col = hexToRgb(TYPE_COLOR[type] || '#ffffff');
    if (isStatus) {
      const [x, y, z] = this.center(side, slot);
      for (let i = 0; i < 12; i++) this.particle(x + Math.cos(i) * 1.3, 0.2, z + Math.sin(i) * 1.3, 0, 3 + Math.random() * 2, 0, col, 0.7, 0.2, PRIM.sphereLo, 0);
      await this.tween(500, t => { e.M.root.setScale(1 + Math.sin(t * Math.PI) * 0.12); });
      return;
    }
    const tp = this.center(tside, tslot);
    const sp = e.base;
    const dx = tp[0] - sp[0], dz = tp[2] - sp[2], L = Math.hypot(dx, dz) || 1;
    // 突進
    await this.tween(200, t => { const k = Math.sin(t * Math.PI / 2) * 1.6; e.M.root.setPos(sp[0] + dx / L * k, sp[1] + Math.sin(t * Math.PI) * 0.4, sp[2] + dz / L * k); });
    // 弾
    const [x0, y0, z0] = this.center(side, slot);
    const steps = 6;
    for (let i = 0; i < steps; i++) setTimeout(() => {
      const f = 0.85;
      this.particle(x0 + dx / L * 1.5, y0, z0 + dz / L * 1.5, (tp[0] - x0) / 0.28 * f, (tp[1] - y0) / 0.28 * f, (tp[2] - z0) / 0.28 * f, i % 2 ? col : mixRgb(col, [1, 1, 1], 0.5), 0.32, 0.32, PRIM.sphereLo, 0);
    }, i * 30);
    await this.tween(200, t => { const k = (1 - t) * 1.6; e.M.root.setPos(sp[0] + dx / L * k, sp[1], sp[2] + dz / L * k); });
    e.M.root.setPos(sp[0], sp[1], sp[2]);
  }
  async hit(side, slot, eff = 1, crit = false) {
    const e = this.mons[this.key(side, slot)]; if (!e) return;
    const [x, y, z] = this.center(side, slot);
    this.burst(x, y, z, eff > 1 ? [1, 0.9, 0.3] : [1, 1, 1], eff > 1 ? 22 : 12, eff > 1 ? 6 : 4);
    this.shake = eff > 1 || crit ? 0.6 : 0.25;
    const nodes = []; e.M.root.traverse(n => { if (n.geo) nodes.push(n); });
    await this.tween(420, t => {
      const on = Math.floor(t * 8) % 2 === 0;
      for (const n of nodes) { n._emis0 = n._emis0 || n.emis.slice(); n.emis = on ? [0.6, 0.6, 0.6] : n._emis0; }
      e.M.root.pos[0] = e.base[0] + Math.sin(t * 40) * 0.15 * (1 - t);
    });
    for (const n of nodes) if (n._emis0) n.emis = n._emis0;
    e.M.root.pos[0] = e.base[0];
  }
  async faint(side, slot) {
    const e = this.mons[this.key(side, slot)]; if (!e) return;
    await this.tween(650, t => { e.M.root.pos[1] = -t * e.M.height * 1.2; e.M.root.rot[2] = t * 0.6; e.M.root.setScale(1 - t * 0.3); });
    this.clearMon(side, slot);
  }
  statFx(side, slot, up) {
    const e = this.mons[this.key(side, slot)]; if (!e) return this.wait(10);
    const [x, , z] = e.base;
    const col = up ? [1, 0.5, 0.35] : [0.4, 0.6, 1];
    for (let i = 0; i < 14; i++) this.particle(x + (Math.random() - 0.5) * 2, up ? 0.2 : e.M.height + 0.5, z + (Math.random() - 0.5) * 2, 0, up ? 4 : -4, 0, col, 0.55, 0.15, PRIM.cone4, 0);
    return this.wait(500);
  }
  statusFx(side, slot, st) {
    const col = { brn: [1, 0.4, 0.1], psn: [0.7, 0.3, 0.9], par: [1, 0.9, 0.2], slp: [0.8, 0.8, 1], frz: [0.6, 0.9, 1] }[st] || [1, 1, 1];
    const [x, y, z] = this.center(side, slot);
    this.burst(x, y, z, col, 16, 3);
    return this.wait(400);
  }
  healFx(side, slot) {
    const e = this.mons[this.key(side, slot)]; if (!e) return this.wait(10);
    const [x, , z] = e.base;
    for (let i = 0; i < 16; i++) this.particle(x + (Math.random() - 0.5) * 2, 0.2, z + (Math.random() - 0.5) * 2, 0, 2.5 + Math.random() * 2, 0, [0.5, 1, 0.6], 0.8, 0.2, PRIM.star, 0);
    return this.wait(500);
  }
  protectFx(side, slot) {
    const [x, y, z] = this.center(side, slot);
    const n = new Node(PRIM.sphere, { color: [0.5, 0.9, 0.6], alpha: 0.35, unlit: true }); n.setPos(x, y, z); n.setScale(2.2); n.noDepthWrite = true; this.scene.add(n);
    return this.tween(500, t => n.color[3] = 0.4 * (1 - t)).then(() => this.scene.root.remove(n));
  }
  // エサを投げてなつかせる演出
  async catchSeq(side, slot, shakes, ok, foodColor = [0.95, 0.7, 0.3]) {
    const e = this.mons[this.key(side, slot)]; if (!e) return;
    const [tx, ty, tz] = this.center(side, slot);
    const s0 = this.center(0, 0);
    const food = new Node(PRIM.sphere, { color: foodColor }); food.setScale(0.35); this.scene.add(food);
    await this.tween(550, t => { food.setPos(s0[0] + (tx - s0[0]) * t, s0[1] + 1 + Math.sin(t * Math.PI) * 4 + (0.2 - s0[1]) * t, s0[2] + (tz + 1.2 - s0[2]) * t); });
    // もぐもぐ
    for (let i = 0; i < 3; i++) {
      if (i >= shakes) break;
      await this.tween(380, t => { e.M.root.rot[0] = Math.sin(t * Math.PI * 2) * 0.25; food.setScale(0.35 * (1 - (i + t) / 3.2)); });
      // ハート
      this.particle(tx + (Math.random() - 0.5), ty + e.M.height * 0.6, tz, 0, 2, 0, [1, 0.35, 0.55], 0.9, 0.3, PRIM.sphereLo, 0);
      this.particle(tx + (Math.random() - 0.5), ty + e.M.height * 0.6 + 0.2, tz, 0.3, 2.2, 0, [1, 0.45, 0.6], 0.9, 0.25, PRIM.sphereLo, 0);
      await this.wait(220);
    }
    this.scene.root.remove(food);
    e.M.root.rot[0] = 0;
    if (ok) { for (let i = 0; i < 10; i++) this.particle(tx + Math.cos(i) * 1.5, ty + e.M.height * 0.5, tz + Math.sin(i) * 1.5, Math.cos(i) * 2, 3, Math.sin(i) * 2, [1, 0.4, 0.6], 1.2, 0.3, PRIM.star, -2); await this.wait(700); }
    else { await this.tween(300, t => { e.M.root.rot[1] = e.ry + Math.sin(t * Math.PI) * 1.2; }); e.M.root.rot[1] = e.ry; }
  }

  update(dt) {
    this.t += dt;
    // トゥイーン
    for (let i = this.tweens.length - 1; i >= 0; i--) {
      const tw = this.tweens[i]; tw.t += dt * 1000;
      const k = Math.min(1, tw.t / tw.ms);
      tw.fn(k);
      if (k >= 1) { this.tweens.splice(i, 1); tw.res(); }
    }
    // パーティクル
    for (let i = this.fx.length - 1; i >= 0; i--) {
      const f = this.fx[i]; f.life -= dt;
      f.vy += f.grav * dt;
      f.n.pos[0] += f.vx * dt; f.n.pos[1] += f.vy * dt; f.n.pos[2] += f.vz * dt;
      f.n.color[3] = Math.max(0, Math.min(1, f.life / f.max * 1.5));
      f.n.rot[2] += dt * 3; f.n.rot[1] += dt * 2;
      if (f.life <= 0) { this.scene.root.remove(f.n); this.fx.splice(i, 1); }
    }
    for (const k in this.mons) animateAnimon(this.mons[k].M, dt, 'idle');
    // カメラのゆらぎ
    const sway = Math.sin(this.t * 0.4) * 0.25;
    this.shake = Math.max(0, this.shake - dt * 2);
    const sh = this.shake * 0.5;
    this.cam.pos = [this.camBase[0] + sway + (Math.random() - 0.5) * sh, this.camBase[1] + (Math.random() - 0.5) * sh, this.camBase[2]];
    this.cam.target = this.camLook;
  }
}
