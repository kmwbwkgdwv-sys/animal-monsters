// =============================================================
//  木・しげみ・岩などの「原型」をスカルプトで作り、地形チャンクに複製して置く
//   ・アニメ調のもこもこした木（上は明るく下は暗い葉）
//   ・ゴツゴツした岩（上に苔）
//   ・原型は1度だけメッシュ化し、位置・回転・大きさ・色味を変えて大量に使う
// =============================================================
import { M4, VSTRIDE, GeoBuilder } from '../engine/gl3d.js';
import { Part, sph, ell, cap, box } from './sculpt.js';
import { mulberry32 } from '../engine/util.js';

const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// 原型 = { data: Float32Array(頂点), index: Uint16Array/Uint32Array, r: 当たり判定の半径 }
function toProto(geo, r) { return { data: geo.data, index: geo.index, r, nv: geo.data.length / VSTRIDE }; }

// 葉の色づけ：上ほど明るく黄色みに、下・内側ほど暗く青みに（アニメの木の塗り）
function leafTint(top, bot, cy, h) {
  return (c, x, y, z, n) => {
    const t = clamp((y - (cy - h)) / (2 * h), 0, 1);
    let k = mix(bot, top, t * 0.7 + clamp(n[1], 0, 1) * 0.3);
    // 光の当たる側のハイライト
    if (n[1] > 0.55 && t > 0.55) k = mix(k, [k[0] * 1.12 + 0.05, k[1] * 1.1 + 0.05, k[2] * 0.95], 0.6);
    return [k[0] * c[0], k[1] * c[1], k[2] * c[2]];
  };
}

export function buildFlora(light = false) {
  const q = light ? 1.5 : 1;
  const P = {};
  const r = mulberry32(4242);
  // ---- 丸い広葉樹（4種） ----
  const roundTree = (seed, s, leafA, leafB, blossom = false) => {
    const rr = mulberry32(seed);
    const trunkC = [0.48, 0.32, 0.2];
    const T = new Part([cap([0, -0.3, 0], [0.12, 2.6 * s, 0.05], 0.36 * s, 0.22 * s, trunkC, { k: 0 })], {});
    for (const a of [0.4, 2.5, 4.3]) T.add(cap([0, 0.05, 0], [Math.cos(a) * 0.65 * s, -0.25, Math.sin(a) * 0.65 * s], 0.2 * s, 0.08 * s, trunkC, { k: 0.18 * s }));
    T.add(cap([0.1, 1.9 * s, 0], [0.9 * s, 2.9 * s, 0.3 * s], 0.14 * s, 0.08 * s, trunkC, { k: 0.1 * s }));
    const trunk = T.mesh(0.2 * s * q);
    const cy = 3.6 * s;
    const L = new Part([sph([0, cy, 0], 1.75 * s, [1, 1, 1], { k: 0 })], { noise: 0.22 * s, noiseF: 1.6 / s, sway: 0.3, swayY: cy - 1.8 * s });
    const nb = 5 + Math.floor(rr() * 3);
    for (let k = 0; k < nb; k++) {
      const a = k / nb * Math.PI * 2 + rr() * 0.6, d = (0.95 + rr() * 0.45) * s, rad = (0.95 + rr() * 0.45) * s;
      L.add(sph([Math.cos(a) * d, cy - 0.3 * s + rr() * 1.1 * s, Math.sin(a) * d], rad, [1, 1, 1], { k: 0.55 * s }));
    }
    L.add(sph([0.15 * s, cy + 1.15 * s, 0.1 * s], 1.05 * s, [1, 1, 1], { k: 0.6 * s }));
    const leaves = L.mesh(0.52 * s * q, { tint: leafTint(leafA, leafB, cy, 2.2 * s) });
    const parts = [trunk, leaves];
    // 実（りんご）や花
    if (!blossom && rr() < 0.35) { const F = new Part(); for (let k = 0; k < 5; k++) { const a = rr() * 6.28, b = 0.3 + rr() * 0.9; F.add(sph([Math.cos(a) * Math.cos(b) * 2.0 * s, cy + Math.sin(b) * 1.6 * s, Math.sin(a) * Math.cos(b) * 2.0 * s], 0.17 * s, [0.95, 0.25, 0.22], { k: 0 })); } parts.push(F.mesh(0.12 * q)); }
    return { parts, r: 0.9 * s };
  };
  const GREEN_T = [0.62, 0.86, 0.3], GREEN_B = [0.12, 0.42, 0.22];
  P.round = [roundTree(11, 1.0, GREEN_T, GREEN_B), roundTree(12, 1.18, [0.7, 0.9, 0.32], [0.14, 0.46, 0.2]), roundTree(13, 0.86, [0.56, 0.84, 0.36], [0.1, 0.38, 0.24]), roundTree(14, 1.3, GREEN_T, GREEN_B)];
  P.blossom = [roundTree(21, 1.05, [1, 0.86, 0.92], [0.86, 0.48, 0.66], true), roundTree(22, 1.2, [1, 0.9, 0.95], [0.9, 0.52, 0.7], true)];
  P.autumn = [roundTree(31, 1.1, [1, 0.78, 0.3], [0.78, 0.32, 0.12]), roundTree(32, 1.0, [0.98, 0.62, 0.26], [0.7, 0.24, 0.12])];
  // ---- 針葉樹（森・雪山） ----
  const pine = (seed, s, snow) => {
    const rr = mulberry32(seed);
    const T = new Part([cap([0, -0.3, 0], [0, 2.2 * s, 0], 0.32 * s, 0.2 * s, [0.42, 0.28, 0.18], { k: 0 })]);
    const trunk = T.mesh(0.2 * s * q);
    const L = new Part([], { noise: 0.12 * s, noiseF: 2.2 / s, sway: 0.25, swayY: 1.2 * s });
    for (let k = 0; k < 4; k++) { const y = (1.2 + k * 1.15) * s, w = (2.35 - k * 0.48) * s; L.add(cap([0, y, 0], [rr() * 0.1, y + 1.9 * s, 0], w, 0.05 * s, [1, 1, 1], { k: 0.25 * s })); }
    const top = snow ? [0.98, 0.99, 1] : [0.36, 0.72, 0.36], bot = snow ? [0.18, 0.38, 0.4] : [0.06, 0.3, 0.2];
    const tint = (c, x, y, z, n) => {
      const t = clamp(y / (6.5 * s), 0, 1);
      let k = mix(bot, snow ? [0.22, 0.5, 0.44] : top, t * 0.6 + clamp(n[1], 0, 1) * 0.4);
      if (snow && n[1] > 0.45) k = mix(k, [0.97, 0.99, 1], clamp((n[1] - 0.45) * 3, 0, 1));
      return k;
    };
    return { parts: [trunk, L.mesh(0.46 * s * q, { tint })], r: 0.75 * s };
  };
  P.pine = [pine(41, 1.0, false), pine(42, 1.25, false), pine(43, 0.85, false)];
  P.snowpine = [pine(51, 1.0, true), pine(52, 1.2, true)];
  // ---- しげみ ----
  const bush = (seed, s, a, b, flowers) => {
    const rr = mulberry32(seed);
    const B = new Part([sph([0, 0.45 * s, 0], 0.95 * s, [1, 1, 1], { k: 0 })], { noise: 0.14 * s, noiseF: 2.6 / s, sway: 0.12 });
    for (let k = 0; k < 4; k++) { const ang = k * 1.7 + rr(); B.add(sph([Math.cos(ang) * 0.7 * s, (0.3 + rr() * 0.35) * s, Math.sin(ang) * 0.7 * s], (0.55 + rr() * 0.2) * s, [1, 1, 1], { k: 0.35 * s })); }
    const parts = [B.mesh(0.3 * s * q, { tint: leafTint(a, b, 0.5 * s, 1.0 * s) })];
    if (flowers) { const F = new Part(); for (let k = 0; k < 6; k++) { const ang = rr() * 6.28, el = 0.2 + rr() * 1.0; F.add(sph([Math.cos(ang) * Math.cos(el) * 1.0 * s, 0.45 * s + Math.sin(el) * 0.85 * s, Math.sin(ang) * Math.cos(el) * 1.0 * s], 0.13 * s, flowers, { k: 0 })); } parts.push(F.mesh(0.1 * q)); }
    return { parts, r: 0.75 * s };
  };
  P.bush = [bush(61, 1, [0.6, 0.88, 0.32], [0.14, 0.42, 0.18], null), bush(62, 1.15, [0.56, 0.84, 0.3], [0.12, 0.4, 0.2], [1, 0.45, 0.6]), bush(63, 0.9, [0.64, 0.9, 0.36], [0.16, 0.46, 0.2], [1, 1, 1]), bush(64, 1.05, [0.6, 0.86, 0.3], [0.12, 0.4, 0.18], [1, 0.82, 0.3])];
  // ---- 岩（ゴツゴツ・上に苔） ----
  const rock = (seed, s, moss) => {
    const rr = mulberry32(seed);
    const R = new Part([ell([0, 0.35 * s, 0], [1.1 * s, 0.85 * s, 1.0 * s], [1, 1, 1], { k: 0, rot: [rr() * 0.3, rr() * 3, rr() * 0.3] })], { noise: 0.28 * s, noiseF: 1.7 / s });
    R.add(ell([0.75 * s, 0.15 * s, 0.35 * s], [0.65 * s, 0.5 * s, 0.6 * s], [1, 1, 1], { k: 0.25 * s, rot: [0, rr() * 3, 0] }));
    if (rr() < 0.6) R.add(ell([-0.6 * s, 0.1 * s, -0.4 * s], [0.5 * s, 0.38 * s, 0.5 * s], [1, 1, 1], { k: 0.2 * s }));
    const tint = (c, x, y, z, n) => {
      let k = mix([0.62, 0.6, 0.58], [0.82, 0.8, 0.76], clamp(n[1] * 0.5 + 0.5, 0, 1));
      if (moss && n[1] > 0.55) k = mix(k, [0.42, 0.66, 0.3], clamp((n[1] - 0.55) * 3.5, 0, 1));
      return k;
    };
    return { parts: [R.mesh(0.27 * s * q, { tint })], r: 0.95 * s };
  };
  P.rock = [rock(71, 1, true), rock(72, 1.3, true), rock(73, 0.8, false), rock(74, 1.1, false)];
  // ---- サボテン ----
  const cactus = (seed, s) => {
    const rr = mulberry32(seed);
    const C = new Part([cap([0, -0.2, 0], [0, 3.0 * s, 0], 0.42 * s, 0.36 * s, [1, 1, 1], { k: 0 })]);
    const side = rr() < 0.5 ? 1 : -1;
    C.add(cap([0, 1.3 * s, 0], [side * 0.9 * s, 1.45 * s, 0], 0.24 * s, 0.24 * s, [1, 1, 1], { k: 0.12 * s }), cap([side * 0.9 * s, 1.45 * s, 0], [side * 0.95 * s, 2.4 * s, 0], 0.24 * s, 0.2 * s, [1, 1, 1], { k: 0.1 * s }));
    if (rr() < 0.6) C.add(cap([0, 1.9 * s, 0], [-side * 0.7 * s, 2.0 * s, 0], 0.2 * s, 0.2 * s, [1, 1, 1], { k: 0.1 * s }), cap([-side * 0.7 * s, 2.0 * s, 0], [-side * 0.72 * s, 2.7 * s, 0], 0.2 * s, 0.17 * s, [1, 1, 1], { k: 0.1 * s }));
    const tint = (c, x, y, z, n) => { const st = Math.cos(Math.atan2(z, x) * 8) > 0.6 ? 0.82 : 1; const k = mix([0.18, 0.46, 0.24], [0.42, 0.74, 0.36], clamp(n[1] * 0.3 + 0.5 + n[0] * 0.2, 0, 1)); return [k[0] * st, k[1] * st, k[2] * st]; };
    const parts = [C.mesh(0.19 * s * q, { tint })];
    if (rr() < 0.5) { const F = new Part([sph([0, 3.15 * s, 0], 0.2 * s, [1, 0.45, 0.62], { k: 0 })]); parts.push(F.mesh(0.07 * q)); }
    return { parts, r: 0.6 * s };
  };
  P.cactus = [cactus(81, 1), cactus(82, 1.25)];
  // ---- 枯れ木 ----
  const dead = (seed, s) => {
    const rr = mulberry32(seed);
    const D = new Part([cap([0, -0.2, 0], [0.2 * s, 3.2 * s, 0], 0.3 * s, 0.1 * s, [0.38, 0.3, 0.28], { k: 0 })]);
    for (let k = 0; k < 4; k++) { const a = k * 1.8 + rr(), y = (1.6 + k * 0.45) * s; D.add(cap([0.05 * s, y, 0], [Math.cos(a) * 1.3 * s, y + 0.9 * s, Math.sin(a) * 1.3 * s], 0.12 * s, 0.03 * s, [0.38, 0.3, 0.28], { k: 0.08 * s })); }
    return { parts: [D.mesh(0.14 * s * q)], r: 0.5 * s };
  };
  P.dead = [dead(91, 1), dead(92, 1.2)];
  // ---- きのこ ----
  const mush = (seed, s, glow) => {
    const M = new Part([cap([0, -0.1, 0], [0, 0.55 * s, 0], 0.17 * s, 0.13 * s, [0.98, 0.95, 0.86], { k: 0 }), ell([0, 0.62 * s, 0], [0.52 * s, 0.3 * s, 0.52 * s], glow ? [0.62, 0.42, 0.95] : [0.95, 0.26, 0.22], { k: 0.06 * s })]);
    for (let k = 0; k < 5; k++) { const a = k * 1.3; M.paint(sph([Math.cos(a) * 0.32 * s, 0.82 * s, Math.sin(a) * 0.32 * s], 0.08 * s), [1, 1, 1], 0.02 * s); }
    return { parts: [M.mesh(0.1 * s * q)], r: 0.3 * s };
  };
  P.mush = [mush(101, 1, false), mush(102, 1.4, false)];
  P.glowmush = [mush(103, 1.2, true)];
  // ---- 結晶 ----
  const crystal = (seed, s, col) => {
    const rr = mulberry32(seed);
    const C = new Part();
    for (let k = 0; k < 4; k++) { const a = k * 1.9 + rr(), d = k ? 0.45 * s : 0, h = (k ? 1.2 + rr() * 0.9 : 2.4) * s; C.add(cap([Math.cos(a) * d, -0.2, Math.sin(a) * d], [Math.cos(a) * d * 1.8, h, Math.sin(a) * d * 1.8], (k ? 0.3 : 0.45) * s, 0.04 * s, col, { k: 0.05 * s })); }
    return { parts: [C.mesh(0.16 * s * q)], r: 0.8 * s };
  };
  P.crystal = [crystal(111, 1, [0.72, 0.9, 1])];
  P.goldcrystal = [crystal(112, 1, [1, 0.88, 0.5])];
  P.purplecrystal = [crystal(113, 1.2, [0.82, 0.7, 1])];
  void r;
  return P;
}

// 原型をビルダーに複製（位置・y回転・大きさ・色の倍率）
export function stamp(gb, proto, x, y, z, ry = 0, s = 1, tint = null) {
  const m = M4.fromTRS([x, y, z], [0, ry, 0], [s, s, s]);
  for (const geo of proto.parts) {
    const d = geo.data, idx = geo.index, off = gb.vcount;
    for (let i = 0; i < d.length; i += VSTRIDE) {
      const px = d[i], py = d[i + 1], pz = d[i + 2];
      const wx = m[0] * px + m[4] * py + m[8] * pz + m[12], wy = m[1] * px + m[5] * py + m[9] * pz + m[13], wz = m[2] * px + m[6] * py + m[10] * pz + m[14];
      const nx = d[i + 3], ny = d[i + 4], nz = d[i + 5];
      const rnx = (m[0] * nx + m[8] * nz) / s, rnz = (m[2] * nx + m[10] * nz) / s;
      const ox = d[i + 9], oz = d[i + 11];
      const rox = (m[0] * ox + m[8] * oz) / s, roz = (m[2] * ox + m[10] * oz) / s;
      let r = d[i + 6], g = d[i + 7], b = d[i + 8];
      if (tint) { r *= tint[0]; g *= tint[1]; b *= tint[2]; }
      gb.v.push(wx, wy, wz, rnx, ny, rnz, r, g, b, rox, d[i + 10], roz, d[i + 12]);
    }
    for (let i = 0; i < idx.length; i++) gb.i.push(idx[i] + off);
  }
}

// ---- 花・草むら・草の房（GeoBuilder で軽く作る） ----
export function buildSmallFlora(light = false) {
  const P = {};
  const rr = mulberry32(777);
  // 花のかたまり（茎と花びらを別パーツにして、花びらだけ色を変える）
  P.flower = [];
  for (let v = 0; v < 3; v++) {
    const stems = new GeoBuilder(), heads = new GeoBuilder();
    const n = light ? 3 : 4 + v;
    for (let k = 0; k < n; k++) {
      const a = rr() * Math.PI * 2, d = rr() * 0.9, x = Math.cos(a) * d, z = Math.sin(a) * d, hh = 0.45 + rr() * 0.35;
      // 茎（交差した細い三角形）
      for (const ang of [0, Math.PI / 2]) {
        const dx = Math.cos(ang) * 0.035, dz = Math.sin(ang) * 0.035, s0 = stems.vcount;
        stems._push(x - dx, -0.05, z - dz, 0, 1, 0, [0.3, 0.6, 0.24], 0); stems._push(x + dx, -0.05, z + dz, 0, 1, 0, [0.3, 0.6, 0.24], 0); stems._push(x, hh, z, 0, 1, 0, [0.4, 0.72, 0.3], 0.8);
        stems.tri(s0, s0 + 1, s0 + 2); stems.tri(s0 + 1, s0, s0 + 2);
      }
      // 花びら（6枚の扇・上向き）＋ 中心
      const c = heads.vcount, R = 0.17 + rr() * 0.05, tilt = (rr() - 0.5) * 0.3;
      heads._push(x, hh + 0.02, z, 0, 1, 0, [1, 0.95, 0.55], 0.85);
      for (let i = 0; i <= 12; i++) { const b = i / 12 * Math.PI * 2, rad = R * (i % 2 ? 0.62 : 1); heads._push(x + Math.cos(b) * rad, hh + Math.cos(b) * tilt * rad, z + Math.sin(b) * rad, 0, 1, 0, [1, 1, 1], 0.85); }
      for (let i = 0; i < 12; i++) { heads.tri(c, c + 2 + i, c + 1 + i); heads.tri(c, c + 1 + i, c + 2 + i); }
      const cc = heads.vcount;
      heads._push(x, hh + 0.04, z, 0, 1, 0, [1, 0.85, 0.25], 0.85);
      for (let i = 0; i <= 6; i++) { const b = i / 6 * Math.PI * 2; heads._push(x + Math.cos(b) * R * 0.32, hh + 0.035, z + Math.sin(b) * R * 0.32, 0, 1, 0, [1, 0.78, 0.2], 0.85); }
      for (let i = 0; i < 6; i++) heads.tri(cc, cc + 2 + i, cc + 1 + i);
    }
    P.flower.push({ parts: [stems.build(), heads.build()], tintParts: [false, true], r: 0 });
  }
  // 草むら（エンカウント）の束：根元が暗く先が明るい（色は置くときに地域の色をかける）
  P.grass = [];
  for (let v = 0; v < 3; v++) {
    const g = new GeoBuilder();
    const nb = light ? 4 : 7;
    for (let b = 0; b < nb; b++) {
      const a = b / nb * Math.PI * 2 + rr() * 0.6, out = 0.25 + rr() * 0.35;
      const dx = Math.cos(a), dz = Math.sin(a);
      const hh = 1.0 + rr() * 0.8, w = 0.19 + rr() * 0.06;
      const bx = dx * 0.12, bz = dz * 0.12, px = -dz * w, pz = dx * w;
      const s0 = g.vcount;
      g._push(bx - px, -0.08, bz - pz, 0, 1, 0, [0.42, 0.42, 0.42], 0); g._push(bx + px, -0.08, bz + pz, 0, 1, 0, [0.42, 0.42, 0.42], 0);
      const mx = bx + dx * out * 0.45, mz = bz + dz * out * 0.45, my = hh * 0.55;
      g._push(mx - px * 0.7, my, mz - pz * 0.7, 0, 1, 0, [0.75, 0.78, 0.68], 0.45); g._push(mx + px * 0.7, my, mz + pz * 0.7, 0, 1, 0, [0.75, 0.78, 0.68], 0.45);
      g._push(bx + dx * out, hh, bz + dz * out, 0, 1, 0, [1.12, 1.15, 0.86], 1);
      g.tri(s0, s0 + 1, s0 + 3); g.tri(s0, s0 + 3, s0 + 2); g.tri(s0 + 2, s0 + 3, s0 + 4);
      g.tri(s0, s0 + 3, s0 + 1); g.tri(s0, s0 + 2, s0 + 3); g.tri(s0 + 2, s0 + 4, s0 + 3);
    }
    P.grass.push({ parts: [g.build()], tintParts: [true], r: 0 });
  }
  // 草の房（飾り・小さい）
  P.tuft = [];
  for (let v = 0; v < 2; v++) {
    const g = new GeoBuilder();
    for (let k = 0; k < 5; k++) {
      const a = rr() * Math.PI, w = 0.13, hh = 0.45 + rr() * 0.4, px = (rr() - 0.5) * 0.7, pz = (rr() - 0.5) * 0.7, dx = Math.cos(a) * w, dz = Math.sin(a) * w, lean = (rr() - 0.5) * 0.4;
      const s0 = g.vcount;
      g._push(px - dx, -0.05, pz - dz, 0, 1, 0, [0.5, 0.5, 0.5], 0); g._push(px + dx, -0.05, pz + dz, 0, 1, 0, [0.5, 0.5, 0.5], 0); g._push(px + lean, hh, pz, 0, 1, 0, [1.1, 1.12, 0.85], 1);
      g.tri(s0, s0 + 1, s0 + 2); g.tri(s0 + 1, s0, s0 + 2);
    }
    P.tuft.push({ parts: [g.build()], tintParts: [true], r: 0 });
  }
  return P;
}

// どこからでも使えるように一度だけ作って共有
let FLORA = null, SMALL = null;
export function getFlora(light = false) { if (!FLORA) FLORA = buildFlora(light); return FLORA; }
export function getSmallFlora(light = false) { if (!SMALL) SMALL = buildSmallFlora(light); return SMALL; }
export function setSharedFlora(f, s) { FLORA = f; SMALL = s; }
// インスタンスの束を1つのノードにまとめる（instancing が使えない環境では頂点を複製）
export function instanceNodes(list, opts = {}) {
  // list: [{ proto, x, y, z, ry, s, tint }]
  const groups = new Map();
  for (const it of list) it.proto.parts.forEach((geo, k) => {
    let g = groups.get(geo);
    if (!g) { g = { arr: [], mat: it.proto.mat, tinted: !it.proto.tintParts || it.proto.tintParts[k] }; groups.set(geo, g); }
    const t = g.tinted ? (it.tint || [1, 1, 1]) : [1, 1, 1];
    g.arr.push(it.x, it.y, it.z, it.ry || 0, it.s || 1, t[0], t[1], t[2]);
  });
  return groups;
}
