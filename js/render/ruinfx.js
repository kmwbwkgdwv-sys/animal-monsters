// =============================================================
//  第2部：こわれた 大陸の 空気（火山と クレーターの 煙の 柱・焼けた 森の くすぶる 煙）
//   遠くからでも 見えるように、霧の 影響を 受けない 大きな 半とうめいの 玉を 立ちのぼらせる
// =============================================================
import { Node, PRIM, initPrims } from '../engine/gl3d.js';
import { ERA, IMPACT, VOLCANO_C, CRATER_R, polar } from '../data/world.js';

export class RuinFx {
  constructor(scene, world, light = false) {
    initPrims();
    this.world = world; this.light = light;
    this.node = new Node(); scene.add(this.node);
    this.puffs = []; this.t = 0; this.srcs = null; this.pillar = null;
  }
  _sources() {
    const W = this.world, S = [];
    // 火山の 噴煙（太く 高い）
    let top = -1e9; for (let a = 0; a < 6.28; a += 0.8) for (const r of [0, 10, 20]) top = Math.max(top, W.heightAt(VOLCANO_C[0] + Math.cos(a) * r, VOLCANO_C[1] + Math.sin(a) * r));
    S.push({ p: [VOLCANO_C[0], top - 4, VOLCANO_C[1]], range: 1100, every: this.light ? 0.9 : 0.45, s0: 9, s1: 42, vy: 9, life: 15, col: [[0.3, 0.26, 0.26], [0.42, 0.36, 0.34], [0.55, 0.3, 0.2]], a: 0.42, spread: 8 });
    // クレーターの むらさきの もや
    S.push({ p: [IMPACT[0], W.heightAt(IMPACT[0], IMPACT[1]) + 2, IMPACT[1]], range: 900, every: this.light ? 1.2 : 0.6, s0: 6, s1: 28, vy: 5, life: 11, col: [[0.62, 0.42, 0.9], [0.45, 0.32, 0.7], [0.8, 0.6, 1]], a: 0.26, spread: CRATER_R * 0.35 });
    // 焼けた 森で くすぶる 細い 煙
    for (let i = 0; i < 7; i++) { const a = 60 + i * 23, d = 160 + (i % 3) * 45; const q = [IMPACT[0] + Math.cos(a * 0.0175) * d, IMPACT[1] + Math.sin(a * 0.0175) * d]; S.push({ p: [q[0], W.heightAt(q[0], q[1]), q[1]], range: 280, every: this.light ? 0.9 : 0.4, s0: 1.2, s1: 7, vy: 3.5, life: 7, col: [[0.3, 0.28, 0.28], [0.45, 0.42, 0.4]], a: 0.45, spread: 0.6, fire: true }); }
    return S;
  }
  update(dt, px, pz, wind = [0.8, 0.35, 0.6]) {
    if (!ERA.ruin) { if (this.puffs.length || this.pillar) this.clear(); return; }
    if (!this.srcs) this.srcs = this._sources();
    this.t += dt;
    for (const s of this.srcs) {
      const d = Math.hypot(px - s.p[0], pz - s.p[2]);
      if (d > s.range) continue;
      s.k = (s.k || 0) - dt;
      if (s.k > 0) continue;
      s.k = s.every * (0.7 + Math.random() * 0.6);
      const col = s.col[Math.floor(Math.random() * s.col.length)];
      const n = new Node(PRIM.sphere, { color: col, alpha: s.a, unlit: true, noFog: true, outline: 0, cull: false, castShadow: false }); n.noDepthWrite = true; n.cloudShadow = 0;
      n.setPos(s.p[0] + (Math.random() - 0.5) * s.spread * 2, s.p[1], s.p[2] + (Math.random() - 0.5) * s.spread * 2);
      this.node.add(n);
      this.puffs.push({ n, s, life: 0, vx: (Math.random() - 0.5) * 1.5, vz: (Math.random() - 0.5) * 1.5 });
    }
    const cap = this.light ? 50 : 110;
    while (this.puffs.length > cap) this.node.remove(this.puffs.shift().n);
    for (let i = this.puffs.length - 1; i >= 0; i--) {
      const q = this.puffs[i], s = q.s; q.life += dt; const t = q.life / s.life;
      if (t >= 1) { this.node.remove(q.n); this.puffs.splice(i, 1); continue; }
      q.n.pos[0] += (q.vx + wind[0] * 2.5 * t) * dt; q.n.pos[2] += (q.vz + wind[2] * 2.5 * t) * dt; q.n.pos[1] += s.vy * (1 - t * 0.5) * dt;
      const sc = s.s0 + (s.s1 - s.s0) * Math.sqrt(t); q.n.setScale(sc, sc * 0.85, sc);
      q.n.color[3] = s.a * Math.min(1, t * 5) * (1 - t);
    }
    // クレーターの 光の 柱（ゆっくり 明るさが 変わる）
    if (!this.pillar) {
      const h = this.world.heightAt(IMPACT[0], IMPACT[1]);
      this.pillar = new Node(PRIM.cyl, { color: [0.75, 0.55, 1], alpha: 0.12, unlit: true, noFog: true, outline: 0, cull: false, castShadow: false });
      this.pillar.noDepthWrite = true; this.pillar.setPos(IMPACT[0], h - 2, IMPACT[1]); this.pillar.setScale(9, 260, 9);
      this.node.add(this.pillar);
    }
    this.pillar.color[3] = 0.09 + Math.sin(this.t * 0.9) * 0.04;
  }
  clear() { for (const q of this.puffs) this.node.remove(q.n); this.puffs = []; if (this.pillar) { this.node.remove(this.pillar); this.pillar = null; } this.srcs = null; }
}
void polar;
