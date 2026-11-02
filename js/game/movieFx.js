// =============================================================
//  第2部の ムービー演出（隕石・伝説の 光線・噴火の あとの 大陸めぐり）
//   ムービーの あいだ だけ フィールドの シーンに 物を 置いて、毎フレーム 動かす（OW.fx）
// =============================================================
import { Node, PRIM } from '../engine/gl3d.js';
import { Part, sph, cap, box } from '../render/sculpt.js';
import { mulberry32 } from '../engine/util.js';
import { OW, spawnActor, despawnActor, camTo } from './overworld.js';
import { G } from './state.js';
import { IMPACT, VOLCANO_C, polar } from '../data/world.js';
import { SPECIES } from '../data/species.js';

const M = { meteor: null, tails: [], frags: [], beams: [], legends: [], mutants: [], aura: null, t: 0, phase: null, from: null, hover: null, pos: [0, 0, 0] };
const add = (n) => { OW.scene.add(n); return n; };
const rm = (n) => { if (n && n.parent) n.parent.remove(n); };
function fx(fn) { (OW.fx ||= []).push(fn); }
const lerp3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const ease = (t) => t * t * (3 - 2 * t);
function dirToImpact() { const P = OW.player; const dx = IMPACT[0] - P.x, dz = IMPACT[1] - P.z, l = Math.hypot(dx, dz) || 1; return [dx / l, dz / l]; }

// ---------- 隕石の 形（ごつごつの 岩＋光る ひび割れ）：一度だけ 作る ----------
let ROCK = null;
function rockGeos() {
  if (ROCK) return ROCK;
  const rr = mulberry32(2026);
  const P = new Part([sph([0, 0, 0], 0.86, [0.24, 0.18, 0.17], { k: 0 })], { noise: 0.07, noiseF: 3.2 });
  for (let i = 0; i < 9; i++) { const a = rr() * 6.28, e = (rr() - 0.5) * 2.4, d = [Math.cos(e) * Math.cos(a), Math.sin(e), Math.cos(e) * Math.sin(a)]; P.add(sph([d[0] * 0.5, d[1] * 0.5, d[2] * 0.5], 0.42 + rr() * 0.2, [0.2 + rr() * 0.08, 0.15, 0.14], { k: 0.2 })); }
  for (let i = 0; i < 7; i++) { const a = rr() * 6.28, e = (rr() - 0.5) * 2.2, d = [Math.cos(e) * Math.cos(a), Math.sin(e), Math.cos(e) * Math.sin(a)]; P.add(sph([d[0] * 1.02, d[1] * 1.02, d[2] * 1.02], 0.16 + rr() * 0.12, null, { op: 'sub', k: 0.06 })); }
  for (let i = 0; i < 14; i++) { const a = rr() * 6.28, e = (rr() - 0.5) * 2.6; P.paint(box([Math.cos(e) * Math.cos(a) * 0.9, Math.sin(e) * 0.9, Math.cos(e) * Math.sin(a) * 0.9], [0.035, 0.5, 0.035], 0, null, { rot: [rr() * 3, rr() * 3, rr() * 3] }), [1, 0.55, 0.15], 0.03); }
  const body = P.mesh(0.045);
  // 光る ひび（表面に 少し 浮いた 細い すじ）
  const C = new Part();
  for (let i = 0; i < 11; i++) {
    let a = rr() * 6.28, e = (rr() - 0.5) * 2.4, prev = null;
    for (let k = 0; k < 5; k++) { a += (rr() - 0.5) * 0.5; e += (rr() - 0.5) * 0.4; const q = [Math.cos(e) * Math.cos(a) * 1.03, Math.sin(e) * 1.03, Math.cos(e) * Math.sin(a) * 1.03]; if (prev) C.add(cap(prev, q, 0.045, 0.03, [1, 0.62, 0.2], { k: 0.02 })); prev = q; }
  }
  const cracks = C.mesh(0.03);
  // 小さな かけら
  const F = new Part([sph([0, 0, 0], 0.8, [0.25, 0.19, 0.17], { k: 0 }), sph([0.4, 0.3, 0], 0.5, [0.22, 0.17, 0.16], { k: 0.2 })], { noise: 0.1, noiseF: 3 });
  ROCK = { body, cracks, frag: F.mesh(0.08) };
  return ROCK;
}
const PUFF = [], SPARK = [], RINGS = [];
function particle(list, n, life, vel, s0, s1, a0) { add(n); list.push({ n, life: 0, max: life, vel, s0, s1, a0 }); return n; }
function stepParticles(list, dt) {
  for (let i = list.length - 1; i >= 0; i--) {
    const q = list[i]; q.life += dt; const t = q.life / q.max;
    if (t >= 1) { rm(q.n); list.splice(i, 1); continue; }
    q.n.pos[0] += q.vel[0] * dt; q.n.pos[1] += q.vel[1] * dt; q.n.pos[2] += q.vel[2] * dt;
    q.vel[1] -= (q.grav || 0) * dt;
    const s = q.s0 + (q.s1 - q.s0) * (1 - (1 - t) * (1 - t));
    if (q.ring) q.n.setScale(s, s * 0.35, s); else q.n.setScale(s);
    q.n.color[3] = q.a0 * (1 - t) * (q.fadeIn ? Math.min(1, t * 6) : 1);
  }
}
const dirRot = (d) => { const l = Math.hypot(d[0], d[1], d[2]) || 1; return [Math.acos(Math.max(-1, Math.min(1, d[1] / l))), Math.atan2(d[0], d[2]), 0]; };

// 隕石が 空の 向こうから やってくる
export function meteorIn() {
  cleanupMeteor();
  const P = OW.player, [dx, dz] = dirToImpact(), R = rockGeos();
  // 横から ななめに 飛んでくる（ほうき星の 尾が よく 見えるように）
  const px = -dz, pz = dx;
  M.from = [P.x + dx * 760 + px * 620, 720, P.z + dz * 760 + pz * 620];
  M.hover = [P.x + dx * 300, 190, P.z + dz * 300];
  // 遠くの 隕石も 写るように カメラの 描画距離を のばす
  if (OW.cam) OW.cam.far = 2600;
  M.pos = M.from.slice(); M.prev = M.pos.slice(); M.vel = [0, -1, 0];
  const o = { noFog: true, outline: 0, cull: false };
  M.meteor = add(new Node(null, { cull: false }));
  M.rock = new Node(R.body, { emis: [0.16, 0.05, 0.01], ...o, outline: 0.6 }); M.meteor.add(M.rock);
  M.crack = new Node(R.cracks, { color: [1, 0.62, 0.2], emis: [1, 0.48, 0.1], unlit: true, ...o }); M.rock.add(M.crack);
  // 前の 面が 熱で とけて 光る
  M.front = new Node(PRIM.sphereHi, { color: [1, 0.72, 0.3], alpha: 0.4, unlit: true, ...o }); M.front.noDepthWrite = true; M.meteor.add(M.front);
  // 光の 層（内側ほど 明るい）
  M.halo = [[1, 0.9, 0.55, 0.2, 1.14], [1, 0.6, 0.2, 0.12, 1.5], [1, 0.35, 0.12, 0.06, 2.3]].map(([r, g, b, a, k]) => { const n = new Node(PRIM.sphereHi, { color: [r, g, b], alpha: a, unlit: true, ...o }); n.noDepthWrite = true; n.k = k; M.meteor.add(n); return n; });
  // ほうき星の 尾（3重の 円すい）
  M.tails = [[1, 0.95, 0.7, 0.55, 0.78, 5], [1, 0.62, 0.22, 0.3, 1.0, 9.5], [0.95, 0.3, 0.12, 0.14, 1.25, 15]].map(([r, g, b, a, w, l]) => { const n = add(new Node(PRIM.cone, { color: [r, g, b], alpha: a, unlit: true, ...o })); n.noDepthWrite = true; n.w = w; n.l = l; n.a0 = a; return n; });
  // まわりを いっしょに 飛ぶ かけら
  M.frags = [];
  for (let i = 0; i < 7; i++) { const n = add(new Node(R.frag, { emis: [0.25, 0.08, 0.01], ...o, outline: 0.5 })); n.off = [Math.sin(i * 2.3) * 1.6, Math.cos(i * 1.7) * 1.3, -1.6 - i * 0.55]; n.sz = 0.12 + (i % 3) * 0.06; n.spin = [0.6 + i * 0.2, 0.9 - i * 0.1, 0.3]; M.frags.push(n); }
  M.t = 0; M.phase = 'in'; M.emit = 0; M.sparkT = 0; M.ringT = 0; M.boom = null;
  fx(updateMeteor);
}
function updateMeteor(dt) {
  if (!M.meteor) return false;
  M.t += dt;
  M.prev = M.pos.slice();
  if (M.phase === 'in') { const k = ease(Math.min(1, M.t / 6)); M.pos = lerp3(M.from, M.hover, k); }
  else if (M.phase === 'hold') { const k = Math.min(1, M.t / 8); M.pos = lerp3(M.hover, [M.hover[0], M.hover[1] + 40, M.hover[2]], ease(k)); M.pos[0] += Math.sin(M.t * 31) * 0.8; M.pos[1] += Math.sin(M.t * 27) * 0.6; }
  else if (M.phase === 'fall') { const k = Math.min(1, M.t / 2.6); M.pos = lerp3(M.fallFrom, [IMPACT[0], 0, IMPACT[1]], k * k); if (k >= 1 && !M.boom) impactBoom(); }
  // 進む 向き（止まって いる ときは 前の 向きの まま）
  const mv = [M.pos[0] - M.prev[0], M.pos[1] - M.prev[1], M.pos[2] - M.prev[2]], ml = Math.hypot(...mv);
  if (ml > 1e-3) M.vel = [mv[0] / ml, mv[1] / ml, mv[2] / ml];
  const fwd = M.phase === 'hold' ? [M.vel[0] * 0.3, -1, M.vel[2] * 0.3] : M.vel, fl = Math.hypot(...fwd), f = [fwd[0] / fl, fwd[1] / fl, fwd[2] / fl];
  const back = [-f[0], -f[1], -f[2]];
  const s = 34, hot = M.phase === 'hold' ? 1.35 : M.phase === 'fall' ? 1.25 : 1, fl2 = 1 + Math.sin(M.t * 23) * 0.04 + Math.sin(M.t * 37) * 0.03;
  M.meteor.setPos(...M.pos);
  M.rock.setScale(s); M.rock.rot[0] += dt * 0.25; M.rock.rot[1] += dt * 0.4;
  M.crack.emis = [1 * hot, 0.45 * hot, 0.08];
  M.front.setPos(f[0] * s * 0.32, f[1] * s * 0.32, f[2] * s * 0.32); M.front.setScale(s * 0.82 * fl2, s * 0.82 * fl2, s * 0.82 * fl2);
  M.halo.forEach((n, i) => { n.setScale(s * n.k * hot * (1 + Math.sin(M.t * (7 + i * 3)) * 0.04)); n.setPos(f[0] * s * 0.12, f[1] * s * 0.12, f[2] * s * 0.12); });
  const tailK = M.phase === 'hold' ? 0.45 : M.phase === 'fall' ? 1.35 : 1;
  M.tails.forEach((n, i) => { n.setPos(M.pos[0] - back[0] * s * 0.3, M.pos[1] - back[1] * s * 0.3, M.pos[2] - back[2] * s * 0.3); n.rot = dirRot(back); n.setScale(s * n.w * fl2, s * n.l * tailK * (1 + Math.sin(M.t * (11 + i * 4)) * 0.06), s * n.w * fl2); n.color[3] = n.a0 * (0.85 + Math.sin(M.t * 17 + i) * 0.15); });
  M.frags.forEach((n, i) => { const lag = M.phase === 'hold' ? 0.4 : 1; n.setPos(M.pos[0] + (n.off[0] * s) + back[0] * s * (-n.off[2] - 1) * lag, M.pos[1] + n.off[1] * s + back[1] * s * (-n.off[2] - 1) * lag, M.pos[2] + back[2] * s * (-n.off[2] - 1) * lag); n.setScale(s * n.sz); n.rot[0] += dt * n.spin[0]; n.rot[1] += dt * n.spin[1]; n.rot[2] += dt * n.spin[2]; });
  // けむり（通った あとに 残って ひろがる）
  M.emit -= dt;
  while (M.emit < 0) {
    M.emit += M.phase === 'hold' ? 0.3 : M.phase === 'fall' ? 0.035 : 0.06;
    const j = [(Math.random() - 0.5) * s * 0.9, (Math.random() - 0.5) * s * 0.9, (Math.random() - 0.5) * s * 0.9];
    const n = new Node(PRIM.sphere, { color: Math.random() < 0.35 ? [0.5, 0.36, 0.3] : [0.3, 0.27, 0.29], alpha: 0.32, unlit: true, noFog: true, outline: 0, cull: false }); n.noDepthWrite = true;
    n.setPos(M.pos[0] + back[0] * s * 1.4 + j[0], M.pos[1] + back[1] * s * 1.4 + j[1], M.pos[2] + back[2] * s * 1.4 + j[2]);
    particle(PUFF, n, 3.0, [j[0] * 0.3 + back[0] * 20, 6 + Math.random() * 5 + back[1] * 20, j[2] * 0.3 + back[2] * 20], s * 0.5, s * (1.5 + Math.random() * 0.6), 0.32);
    PUFF[PUFF.length - 1].fadeIn = true;
    if (PUFF.length > 70) { rm(PUFF[0].n); PUFF.shift(); }
  }
  // 火の粉
  M.sparkT -= dt;
  while (M.sparkT < 0) {
    M.sparkT += M.phase === 'hold' ? 0.015 : 0.03;
    const a = Math.random() * 6.28, b = Math.random() * 6.28, sp = (M.phase === 'hold' ? 90 : 45) + Math.random() * 60;
    const d = [Math.cos(a) * Math.sin(b), Math.cos(b), Math.sin(a) * Math.sin(b)];
    const v = [d[0] * sp + back[0] * 60, d[1] * sp + back[1] * 60, d[2] * sp + back[2] * 60];
    const n = new Node(PRIM.sphereLo, { color: Math.random() < 0.5 ? [1, 0.9, 0.5] : [1, 0.5, 0.15], alpha: 1, unlit: true, noFog: true, outline: 0, cull: false }); n.noDepthWrite = true;
    n.setPos(M.pos[0] + d[0] * s, M.pos[1] + d[1] * s, M.pos[2] + d[2] * s);
    particle(SPARK, n, 0.8 + Math.random() * 0.8, v, s * 0.09, s * 0.02, 1); SPARK[SPARK.length - 1].grav = 30;
    if (SPARK.length > 90) { rm(SPARK[0].n); SPARK.shift(); }
  }
  // 光線と ぶつかる ところに 衝撃の 輪
  if (M.phase === 'hold') {
    M.ringT -= dt;
    if (M.ringT < 0) {
      M.ringT = 0.35;
      const n = new Node(PRIM.torus, { color: [1, 0.85, 0.6], alpha: 0.7, unlit: true, noFog: true, outline: 0, cull: false }); n.noDepthWrite = true;
      n.setPos(M.pos[0], M.pos[1] - s * 0.95, M.pos[2]);
      particle(RINGS, n, 1.1, [0, -6, 0], s * 0.6, s * 2.6, 0.7); RINGS[RINGS.length - 1].ring = true;
    }
  }
  stepParticles(PUFF, dt); stepParticles(SPARK, dt); stepParticles(RINGS, dt);
  if (M.boom) stepBoom(dt);
  return true;
}
// 落ちた しゅんかんの 大爆発（火の玉・衝撃波・土けむり）
function impactBoom() {
  const g = [IMPACT[0], 0, IMPACT[1]];
  const o = { unlit: true, noFog: true, outline: 0, cull: false };
  const ball = add(new Node(PRIM.sphereHi, { color: [1, 0.85, 0.5], alpha: 0.95, ...o })); ball.noDepthWrite = true; ball.setPos(...g);
  const ball2 = add(new Node(PRIM.sphereHi, { color: [1, 0.45, 0.12], alpha: 0.6, ...o })); ball2.noDepthWrite = true; ball2.setPos(...g);
  const ring = add(new Node(PRIM.torus, { color: [1, 0.9, 0.75], alpha: 0.8, ...o })); ring.noDepthWrite = true; ring.setPos(g[0], 6, g[2]);
  const dust = add(new Node(PRIM.sphereHi, { color: [0.45, 0.36, 0.32], alpha: 0.55, ...o })); dust.noDepthWrite = true; dust.setPos(...g);
  M.boom = { t: 0, ball, ball2, ring, dust };
  for (const n of [M.meteor, ...M.tails, ...M.frags]) if (n) n.visible = false;
}
function stepBoom(dt) {
  const B = M.boom; B.t += dt; const t = B.t;
  B.ball.setScale(30 + t * 260); B.ball.color[3] = Math.max(0, 0.95 - t * 0.9);
  B.ball2.setScale(40 + t * 360); B.ball2.color[3] = Math.max(0, 0.6 - t * 0.45);
  B.ring.setScale(40 + t * 900, 20, 40 + t * 900); B.ring.color[3] = Math.max(0, 0.8 - t * 0.6);
  B.dust.setScale(20 + t * 200, 10 + t * 120, 20 + t * 200); B.dust.color[3] = Math.min(0.55, t * 1.5);
}
export function meteorPos() { return M.pos.slice(); }

// 2匹の 伝説が 空へ
export function legendsRise() {
  const P = OW.player, [dx, dz] = dirToImpact();
  const px = -dz, pz = dx;   // 横の 向き
  const ry = Math.atan2(dx, dz);
  for (const [id, sp, side] of [['enteiou', 'エンテイオウ', -1], ['narume', 'ナルメクシア', 1]]) {
    const pos = [P.x + dx * 34 + px * side * 14, P.z + dz * 34 + pz * side * 14];
    const rec = spawnActor({ id, kind: 'animon', sp, pos, y: 4, ry });
    rec.root.traverse(n => { n.cull = false; });
    rec.rise = { y0: rec.root.pos[1], y1: rec.root.pos[1] + 44, t: 0 };
    M.legends.push(rec);
  }
  fx((dt) => {
    let alive = false;
    for (const L of M.legends) { if (!L.rise || !L.root.parent) continue; L.rise.t = Math.min(1, L.rise.t + dt / 3); L.root.pos[1] = L.rise.y0 + (L.rise.y1 - L.rise.y0) * ease(L.rise.t) + Math.sin(OW.t * 2 + L.rise.y0) * 0.6; alive = true; }
    return alive && M.phase !== 'done';
  });
}
// 光線で 隕石を おしとどめる
export function beams() {
  M.phase = 'hold'; M.t = 0;
  const cols = [[1, 0.5, 0.15], [0.35, 0.7, 1]];
  M.legends.forEach((L, i) => {
    const b = add(new Node(PRIM.cyl, { color: cols[i], alpha: 0.5, unlit: true, noFog: true, outline: 0, cull: false }));
    const c = add(new Node(PRIM.cyl, { color: [1, 1, 0.92], alpha: 0.95, unlit: true, noFog: true, outline: 0, cull: false }));
    const h = add(new Node(PRIM.sphereHi, { color: cols[i], alpha: 0.6, unlit: true, noFog: true, outline: 0, cull: false }));
    for (const n of [b, c, h]) n.noDepthWrite = true;
    M.beams.push({ b, c, h, L });
  });
  fx(() => {
    if (!M.beams.length) return false;
    for (const { b, c, h, L } of M.beams) {
      const a = [L.root.pos[0], L.root.pos[1] + 3, L.root.pos[2]], m = [M.pos[0], M.pos[1] - 24, M.pos[2]];
      const d = [m[0] - a[0], m[1] - a[1], m[2] - a[2]], len = Math.hypot(...d);
      const r = dirRot(d);
      const w = 2.6 + Math.sin(OW.t * 14) * 0.5;
      b.setPos(...a); b.rot = r; b.setScale(w, len, w);
      c.setPos(...a); c.rot = r.slice(); c.setScale(w * 0.4, len, w * 0.4);
      h.setPos(...a); h.setScale(4 + Math.sin(OW.t * 9) * 0.6);
    }
    return true;
  });
}
// おしきれずに 隕石が 落ちる
export function meteorBreak() {
  for (const { b, c, h } of M.beams) { rm(b); rm(c); rm(h); }
  M.beams = [];
  M.fallFrom = M.pos.slice(); M.phase = 'fall'; M.t = 0;
  // 伝説も はじきとばされる
  for (const L of M.legends) { L.rise = null; L.knock = { from: L.root.pos.slice(), t: 0 }; }
  fx((dt) => {
    let alive = false;
    for (const L of M.legends) { if (!L.knock || !L.root.parent) continue; L.knock.t = Math.min(1, L.knock.t + dt / 2.4); const to = [L.knock.from[0] + (IMPACT[0] - L.knock.from[0]) * 0.5, L.knock.from[1] - 30, L.knock.from[2] + (IMPACT[1] - L.knock.from[2]) * 0.5]; const p = lerp3(L.knock.from, to, ease(L.knock.t)); L.root.setPos(...p); L.root.rot[2] = L.knock.t * 2; alive = true; }
    return alive;
  });
  const P = OW.player, [dx, dz] = dirToImpact();
  camTo({ pos: [P.x - dx * 16, P.y + 30, P.z - dz * 16], lookFn: () => M.pos, ms: 1200 });
}

// ムービー用の カメラ（隕石を 見上げる・伝説を 見る）
export function camShot(name) {
  const P = OW.player, [dx, dz] = dirToImpact();
  if (name === 'meteor') return { pos: [P.x - dx * 14, P.y + 6, P.z - dz * 14], lookFn: () => M.pos, ms: 2400 };
  if (name === 'legendsUp') return { pos: [P.x - dx * 10, P.y + 12, P.z - dz * 10], lookFn: () => { const L = M.legends[0]; return L ? [L.root.pos[0] + dx * 4, L.root.pos[1] + 6, L.root.pos[2] + dz * 4] : M.pos; }, ms: 2000 };
  return null;
}

// 噴火の あとの 大陸めぐり（遠くの 場所も 先に 作っておく）
const VIEWS = {
  crater: () => ({ look: [IMPACT[0], 6, IMPACT[1]], pos: [IMPACT[0] + 140, 105, IMPACT[1] + 175] }),
  volcano: () => ({ look: [VOLCANO_C[0], 70, VOLCANO_C[1]], pos: [VOLCANO_C[0] - 210, 120, VOLCANO_C[1] + 230] }),
  lavaland: () => { const l = polar(46, 860), p = polar(40, 600); return { look: [l[0], 4, l[1]], pos: [p[0], 95, p[1]] }; },
};
export async function view(at) {
  if (!at || at === 'home') { camTo(null); OW.movieSky = null; OW.movieTheme = null; return; }
  const v = VIEWS[at] && VIEWS[at](); if (!v) return;
  try { G.world.buildAll(v.look[0], v.look[2], 210); G.world.buildAll(v.pos[0], v.pos[2], 90); } catch (e) { /* */ }
  OW.movieSky = { bg: [0.4, 0.32, 0.36], fog: [0.5, 0.42, 0.44] }; OW.movieTheme = at === 'volcano' ? 'volcano' : at === 'crater' ? 'inner' : 'swamp';
  OW.camOverride = { fromPos: v.pos.slice(), fromLook: v.look.slice(), pos: v.pos, look: v.look, t: 1, ms: 10, wide: 300 };
  await new Promise(r => setTimeout(r, 1400));
}

// 突然変異した 新しい アニモンたちが あらわれる
const MUT = ['メテオクズリ', 'カザンリュウ', 'ヒバチョウガ', 'メテオロード', 'カラカラスオー', 'スミネズミ'];
export function mutants() {
  mutantsGone();
  const P = OW.player;
  MUT.forEach((sp, i) => {
    const a = -0.9 + i * 0.36, r = 9 + (i % 2) * 4;
    const rec = spawnActor({ id: 'mut' + i, kind: 'animon', sp, pos: [P.x + Math.sin(a) * r, P.z - Math.cos(a) * r], ry: Math.PI + a * 0.4 });
    M.mutants.push('mut' + i);
    rec.root.setScale(0.01);
    rec.grow = 0;
  });
  fx((dt) => {
    let any = false;
    for (const id of M.mutants) { const s = OW.spawned[id]; if (!s) continue; s.grow = Math.min(1, (s.grow || 0) + dt * 1.2); s.root.setScale(ease(s.grow)); any = any || s.grow < 1; }
    return any;
  });
  camTo({ pos: [P.x, P.y + 7, P.z + 9], look: [P.x, P.y + 1.5, P.z - 9], ms: 1200 });
}
export function mutantsGone() { for (const id of M.mutants) despawnActor(id); M.mutants = []; }

// 第2部 第9章：心を こわされた もう一匹の 伝説
export function legendCorrupt(spId) {
  const name = SPECIES[spId].name;
  const pos = [IMPACT[0], IMPACT[1] + 12];
  const rec = spawnActor({ id: 'legendX', kind: 'animon', sp: name, pos, y: 7, ry: 0 });
  M.aura = add(new Node(PRIM.sphereHi, { color: [0.7, 0.3, 1], alpha: 0.28, unlit: true, outline: 0 }));
  M.aura.noDepthWrite = true;
  fx(() => {
    if (!M.aura || !rec.root.parent) return false;
    const p = rec.root.pos; M.aura.setPos(p[0], p[1] + 5, p[2]); M.aura.setScale(9 + Math.sin(OW.t * 5) * 0.8);
    return true;
  });
  camTo({ pos: [pos[0] + 14, G.world.groundAt(pos[0], pos[1]) + 10, pos[1] + 26], look: [pos[0], G.world.groundAt(pos[0], pos[1]) + 8, pos[1]], ms: 1500 });
}
export function legendCalm() { rm(M.aura); M.aura = null; despawnActor('legendX'); camTo(null); }

function cleanupMeteor() {
  for (const n of [M.meteor, ...(M.tails || []), ...(M.frags || [])]) rm(n);
  for (const { b, c, h } of M.beams) { rm(b); rm(c); rm(h); }
  for (const L of [PUFF, SPARK, RINGS]) { for (const q of L) rm(q.n); L.length = 0; }
  if (M.boom) for (const k of ['ball', 'ball2', 'ring', 'dust']) rm(M.boom[k]);
  M.meteor = null; M.tails = []; M.frags = []; M.beams = []; M.boom = null;
  if (OW.cam) OW.cam.far = 900;
}
export function cleanup() {
  M.phase = 'done';
  cleanupMeteor();
  for (const L of M.legends) rm(L.root);
  M.legends = [];
  despawnActor('enteiou'); despawnActor('narume'); despawnActor('almaM');
  mutantsGone();
  rm(M.aura); M.aura = null;
  OW.fx = [];
  OW.movieSky = null; OW.movieTheme = null;
}
