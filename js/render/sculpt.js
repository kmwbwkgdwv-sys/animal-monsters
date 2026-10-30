// =============================================================
//  スカルプト（SDF＝距離関数）でなめらかな形を作り、メッシュ化する
//   ・楕円体／先細りカプセル／角丸の箱 を「なめらかに」くっつける
//   ・色はパーツごと、さらに「塗り」領域で模様（おなか・くつ下・しっぽの先）を描く
//   ・Surface Nets で三角形メッシュに変換（法線は距離関数の勾配）
//   ・目・口などは表面にぴったり沿う「デカール」として貼る
// =============================================================
import { Geometry, VSTRIDE } from '../engine/gl3d.js';

// ---------- 形の定義 ----------
// 共通: col（色）, k（なめらかさ）, op: 'add' | 'sub' | 'paint', soft（塗りのぼかし）
const deg = Math.PI / 180;
export function rotM(rx = 0, ry = 0, rz = 0) {
  // R = Ry * Rx * Rz（エンジンと同じ順）。逆回転（転置）を保存して点をローカルへ
  const cx = Math.cos(rx), sx = Math.sin(rx), cy = Math.cos(ry), sy = Math.sin(ry), cz = Math.cos(rz), sz = Math.sin(rz);
  const r00 = cy * cz + sy * sx * sz, r01 = -cy * sz + sy * sx * cz, r02 = sy * cx;
  const r10 = cx * sz, r11 = cx * cz, r12 = -sx;
  const r20 = -sy * cz + cy * sx * sz, r21 = sy * sz + cy * sx * cz, r22 = cy * cx;
  return [r00, r10, r20, r01, r11, r21, r02, r12, r22]; // 転置
}
export const sph = (c, r, col, o = {}) => ({ t: 0, c, r: [r, r, r], col, ...o });
export const ell = (c, r, col, o = {}) => ({ t: 0, c, r, col, ...o });
export const cap = (a, b, ra, rb, col, o = {}) => ({ t: 1, a, b, ra, rb, col, ...o });
export const box = (c, h, rr, col, o = {}) => ({ t: 2, c, h, rr, col, ...o });
export const tor = (c, R, r, col, o = {}) => ({ t: 3, c, R, rr: r, col, ...o });

function prep(s) {
  if (s._p) return s;
  s._p = true;
  s.k = s.k ?? 0.08;
  s.op = s.op || 'add';
  if (s.rot) s.m = rotM(s.rot[0], s.rot[1], s.rot[2]);
  if (s.sc) s.scMin = Math.min(s.sc[0], s.sc[1], s.sc[2]);
  if (s.t === 1) {
    const [ax, ay, az] = s.a, [bx, by, bz] = s.b;
    s.ba = [bx - ax, by - ay, bz - az];
    s.l2 = s.ba[0] ** 2 + s.ba[1] ** 2 + s.ba[2] ** 2;
    s.rr = s.ra - s.rb;
    s.a2 = s.l2 - s.rr * s.rr;
    s.il2 = 1 / Math.max(1e-9, s.l2);
  }
  // 影響範囲（AABB）
  const pad = (s.op === 'paint' ? (s.soft || 0) : s.k) + 0.001;
  if (s.t === 0) { const m = Math.max(...s.r); const r = s.m ? [m, m, m] : s.r; s.bb = [s.c[0] - r[0] - pad, s.c[1] - r[1] - pad, s.c[2] - r[2] - pad, s.c[0] + r[0] + pad, s.c[1] + r[1] + pad, s.c[2] + r[2] + pad]; }
  else if (s.t === 1) { const m = Math.max(s.ra, s.rb) + pad; s.bb = [Math.min(s.a[0], s.b[0]) - m, Math.min(s.a[1], s.b[1]) - m, Math.min(s.a[2], s.b[2]) - m, Math.max(s.a[0], s.b[0]) + m, Math.max(s.a[1], s.b[1]) + m, Math.max(s.a[2], s.b[2]) + m]; }
  else if (s.t === 2) { const m = Math.hypot(...s.h) + s.rr + pad; s.bb = [s.c[0] - m, s.c[1] - m, s.c[2] - m, s.c[0] + m, s.c[1] + m, s.c[2] + m]; }
  else { const m = s.R + s.rr + pad; s.bb = [s.c[0] - m, s.c[1] - m, s.c[2] - m, s.c[0] + m, s.c[1] + m, s.c[2] + m]; }
  if (s.sc) {
    const pv = s.pv || (s.t === 1 ? s.a : s.c);
    // 軸ごとの拡大縮小に合わせて範囲も伸び縮みさせる（余白 pad はそのまま）
    for (let i = 0; i < 3; i++) { const k = s.sc[i]; const lo = s.bb[i] + pad, hi = s.bb[i + 3] - pad; s.bb[i] = pv[i] + (lo - pv[i]) * k - pad; s.bb[i + 3] = pv[i] + (hi - pv[i]) * k + pad; }
  }
  return s;
}

// 1つの形の距離（sc: 軸ごとの拡大縮小・pv: その中心）
function sd(s, x, y, z) {
  if (s.sc) {
    const pv = s.pv || (s.t === 1 ? s.a : s.c);
    return sdRaw(s, pv[0] + (x - pv[0]) / s.sc[0], pv[1] + (y - pv[1]) / s.sc[1], pv[2] + (z - pv[2]) / s.sc[2]) * s.scMin;
  }
  return sdRaw(s, x, y, z);
}
function sdRaw(s, x, y, z) {
  if (s.t === 0) {
    let px = x - s.c[0], py = y - s.c[1], pz = z - s.c[2];
    if (s.m) { const m = s.m; const qx = m[0] * px + m[3] * py + m[6] * pz, qy = m[1] * px + m[4] * py + m[7] * pz, qz = m[2] * px + m[5] * py + m[8] * pz; px = qx; py = qy; pz = qz; }
    const r = s.r;
    if (r[0] === r[1] && r[1] === r[2]) return Math.sqrt(px * px + py * py + pz * pz) - r[0];
    const ax = px / r[0], ay = py / r[1], az = pz / r[2], bx = ax / r[0], by = ay / r[1], bz = az / r[2];
    const k0 = Math.sqrt(ax * ax + ay * ay + az * az);
    const k1 = Math.sqrt(bx * bx + by * by + bz * bz);
    return k1 < 1e-9 ? -Math.min(r[0], r[1], r[2]) : k0 * (k0 - 1) / k1;
  }
  if (s.t === 1) {
    // 先細りカプセル（Inigo Quilez の round cone）
    const px = x - s.a[0], py = y - s.a[1], pz = z - s.a[2];
    const ba = s.ba, l2 = s.l2, rr = s.rr, a2 = s.a2, il2 = s.il2;
    const pd = px * ba[0] + py * ba[1] + pz * ba[2];
    const qx = px * l2 - ba[0] * pd, qy = py * l2 - ba[1] * pd, qz = pz * l2 - ba[2] * pd;
    const x2 = qx * qx + qy * qy + qz * qz;
    const yy = pd - l2;
    const y2 = yy * yy * l2, z2 = pd * pd * l2;
    const k = Math.sign(rr) * rr * rr * x2;
    if (Math.sign(yy) * a2 * y2 > k) return Math.sqrt(x2 + y2) * il2 - s.rb;
    if (Math.sign(pd) * a2 * z2 < k) return Math.sqrt(x2 + z2) * il2 - s.ra;
    return (Math.sqrt(x2 * a2 * il2) + pd * rr) * il2 - s.ra;
  }
  if (s.t === 2) {
    let px = x - s.c[0], py = y - s.c[1], pz = z - s.c[2];
    if (s.m) { const m = s.m; const qx = m[0] * px + m[3] * py + m[6] * pz, qy = m[1] * px + m[4] * py + m[7] * pz, qz = m[2] * px + m[5] * py + m[8] * pz; px = qx; py = qy; pz = qz; }
    const qx = Math.abs(px) - s.h[0] + s.rr, qy = Math.abs(py) - s.h[1] + s.rr, qz = Math.abs(pz) - s.h[2] + s.rr;
    const mx = qx > 0 ? qx : 0, my = qy > 0 ? qy : 0, mz = qz > 0 ? qz : 0;
    return Math.sqrt(mx * mx + my * my + mz * mz) + Math.min(Math.max(qx, qy, qz), 0) - s.rr;
  }
  // トーラス（xz 平面）
  let px = x - s.c[0], py = y - s.c[1], pz = z - s.c[2];
  if (s.m) { const m = s.m; const qx = m[0] * px + m[3] * py + m[6] * pz, qy = m[1] * px + m[4] * py + m[7] * pz, qz = m[2] * px + m[5] * py + m[8] * pz; px = qx; py = qy; pz = qz; }
  const q = Math.sqrt(px * px + pz * pz) - s.R;
  return Math.sqrt(q * q + py * py) - s.rr;
}

// ---------- パーツ（形の集まり） ----------
export class Part {
  constructor(shapes = [], opts = {}) {
    this.shapes = []; this.paints = []; this.subs = [];
    this.add(...shapes);
    this.noise = opts.noise || 0;      // 表面のでこぼこ（岩・木の葉）
    this.noiseF = opts.noiseF || 6;
    this.sway = opts.sway || 0;        // 風ゆれ（木）
    this.swayY = opts.swayY ?? null;   // この高さより上だけ揺らす
  }
  add(...ss) { for (const s of ss) { if (!s) continue; prep(s); (s.op === 'paint' ? this.paints : s.op === 'sub' ? this.subs : this.shapes).push(s); } return this; }
  paint(s, col, soft = 0.015) { return this.add({ ...s, col, op: 'paint', soft }); }
  // 距離のみ
  dist(x, y, z) {
    const S = this.shapes;
    let d = 1e9;
    for (let i = 0; i < S.length; i++) {
      const s = S[i];
      const bb = s.bb;
      // 遠い形は簡易距離で十分（なめらか結合の範囲外）
      let e;
      if (x < bb[0] || y < bb[1] || z < bb[2] || x > bb[3] || y > bb[4] || z > bb[5]) {
        const dx = Math.max(bb[0] - x, 0, x - bb[3]), dy = Math.max(bb[1] - y, 0, y - bb[4]), dz = Math.max(bb[2] - z, 0, z - bb[5]);
        e = Math.sqrt(dx * dx + dy * dy + dz * dz) + s.k;
        if (e >= d + s.k) continue;
        e = s.sc ? sd(s, x, y, z) : sdRaw(s, x, y, z);
      } else e = s.sc ? sd(s, x, y, z) : sdRaw(s, x, y, z);
      if (i === 0) { d = e; continue; }
      const k = s.k;
      if (k <= 0) { if (e < d) d = e; continue; }
      const h = Math.max(k - Math.abs(d - e), 0) / k;
      d = Math.min(d, e) - h * h * k * 0.25;
    }
    for (const s of this.subs) {
      const e = -sd(s, x, y, z), k = s.k;
      if (k <= 0) { if (e > d) d = e; continue; }
      const h = Math.max(k - Math.abs(d - e), 0) / k;
      d = Math.max(d, e) + h * h * k * 0.25;
    }
    if (this.noise) d += this.noise * nz3(x * this.noiseF, y * this.noiseF, z * this.noiseF);
    return d;
  }
  // 距離と色
  color(x, y, z) {
    const S = this.shapes;
    let d = 1e9, r = 1, g = 1, b = 1;
    for (let i = 0; i < S.length; i++) {
      const s = S[i];
      const e = sd(s, x, y, z);
      const c = s.col;
      if (i === 0) { d = e; r = c[0]; g = c[1]; b = c[2]; continue; }
      const k = s.k;
      if (k <= 0) { if (e < d) { d = e; r = c[0]; g = c[1]; b = c[2]; } continue; }
      const h = Math.max(k - Math.abs(d - e), 0) / k;
      // 色の混ざり具合（境目はやや固め＝アニメ塗り）
      let t = Math.min(1, Math.max(0, 0.5 + 0.5 * (d - e) / k));
      t = t * t * (3 - 2 * t);
      t = t * t * (3 - 2 * t);
      r += (c[0] - r) * t; g += (c[1] - g) * t; b += (c[2] - b) * t;
      d = Math.min(d, e) - h * h * k * 0.25;
    }
    for (const s of this.paints) {
      const e = sd(s, x, y, z);
      if (e > s.soft) continue;
      let t = s.soft > 0 ? Math.min(1, Math.max(0, (s.soft - e) / (2 * s.soft))) : 1;
      t = t * t * (3 - 2 * t);
      if (s.mask && !s.mask(x, y, z)) continue;
      const c = s.col;
      r += (c[0] - r) * t; g += (c[1] - g) * t; b += (c[2] - b) * t;
    }
    return [r, g, b];
  }
  bounds() {
    const bb = [1e9, 1e9, 1e9, -1e9, -1e9, -1e9];
    for (const s of this.shapes) for (let i = 0; i < 3; i++) { bb[i] = Math.min(bb[i], s.bb[i]); bb[i + 3] = Math.max(bb[i + 3], s.bb[i + 3]); }
    return bb;
  }
  grad(x, y, z, e) {
    const gx = this.dist(x + e, y, z) - this.dist(x - e, y, z);
    const gy = this.dist(x, y + e, z) - this.dist(x, y - e, z);
    const gz = this.dist(x, y, z + e) - this.dist(x, y, z - e);
    const l = Math.sqrt(gx * gx + gy * gy + gz * gz) || 1;
    return [gx / l, gy / l, gz / l];
  }
  // 中心 c から方向 dir に進んで表面の点と法線を求める
  surface(c, dir, maxD = 3) {
    const l = Math.hypot(dir[0], dir[1], dir[2]) || 1; const d0 = [dir[0] / l, dir[1] / l, dir[2] / l];
    // 外から内へ（球追跡）。当たらなければ hit=false
    let t = maxD, hit = false;
    let p = [c[0] + d0[0] * t, c[1] + d0[1] * t, c[2] + d0[2] * t];
    for (let i = 0; i < 80; i++) {
      const d = this.dist(p[0], p[1], p[2]);
      if (Math.abs(d) < 1e-4) { hit = true; break; }
      t -= d * 0.9;
      if (t < -maxD * 0.25) { t = 0; break; }
      if (t > maxD * 1.5) t = maxD * 1.5;
      p = [c[0] + d0[0] * t, c[1] + d0[1] * t, c[2] + d0[2] * t];
    }
    if (!hit) p = [c[0] + d0[0] * Math.max(0, t), c[1] + d0[1] * Math.max(0, t), c[2] + d0[2] * Math.max(0, t)];
    return { p, n: this.grad(p[0], p[1], p[2], 0.004), hit };
  }
  // 点 p を表面に吸着（方向 n の逆向きに）
  project(p, n, iters = 24) {
    let q = [p[0], p[1], p[2]];
    for (let i = 0; i < iters; i++) {
      const d = this.dist(q[0], q[1], q[2]);
      if (Math.abs(d) < 2e-4) break;
      const g = this.grad(q[0], q[1], q[2], 0.003);
      // 法線方向に戻す（なめらかな面向け）
      q = [q[0] - g[0] * d * 0.9, q[1] - g[1] * d * 0.9, q[2] - g[2] * d * 0.9];
    }
    return { p: q, n: this.grad(q[0], q[1], q[2], 0.004) };
  }

  // ---------- メッシュ化（Surface Nets） ----------
  mesh(cell, opts = {}) {
    const bb = this.bounds();
    const pad = cell * 2;
    const x0 = bb[0] - pad, y0 = bb[1] - pad, z0 = bb[2] - pad;
    const nx = Math.max(3, Math.ceil((bb[3] - bb[0] + pad * 2) / cell) + 1);
    const ny = Math.max(3, Math.ceil((bb[4] - bb[1] + pad * 2) / cell) + 1);
    const nz = Math.max(3, Math.ceil((bb[5] - bb[2] + pad * 2) / cell) + 1);
    const F = new Float32Array(nx * ny * nz);
    const id = (i, j, k) => (k * ny + j) * nx + i;
    // 粗い格子で先に測り、表面から遠い点は計算を省く（Lipschitz 連続を利用）
    const C = 3, gx = Math.ceil((nx - 1) / C) + 1, gy = Math.ceil((ny - 1) / C) + 1, gz = Math.ceil((nz - 1) / C) + 1;
    const CF = new Float32Array(gx * gy * gz);
    for (let k = 0; k < gz; k++) for (let j = 0; j < gy; j++) for (let i = 0; i < gx; i++) CF[(k * gy + j) * gx + i] = this.dist(x0 + i * C * cell, y0 + j * C * cell, z0 + k * C * cell);
    const far = cell * 1.25 * (this.noise ? 1.6 : 1.05);
    // 各軸の「最寄りの粗い点」と距離の2乗を前計算
    const tab = (n, g) => { const ci = new Int32Array(n), d2 = new Float32Array(n); for (let i = 0; i < n; i++) { const c = Math.min(g - 1, Math.round(i / C)); ci[i] = c; d2[i] = (i - c * C) ** 2 * cell * cell; } return [ci, d2]; };
    const [cxI, dx2] = tab(nx, gx), [cyI, dy2] = tab(ny, gy), [czI, dz2] = tab(nz, gz);
    for (let k = 0; k < nz; k++) {
      const ck = czI[k], dk2 = dz2[k], z = z0 + k * cell;
      for (let j = 0; j < ny; j++) {
        const cj = cyI[j], djk = dk2 + dy2[j], y = y0 + j * cell, crow = (ck * gy + cj) * gx, row = (k * ny + j) * nx;
        for (let i = 0; i < nx; i++) {
          const dc = CF[crow + cxI[i]];
          const a = (dc < 0 ? -dc : dc) - far;
          F[row + i] = (a > 0 && a * a > djk + dx2[i]) ? dc : this.dist(x0 + i * cell, y, z);
        }
      }
    }
    const cnx = nx - 1, cny = ny - 1, cnz = nz - 1;
    const cid = new Int32Array(cnx * cny * cnz).fill(-1);
    const V = [], NV = []; // 頂点位置・法線
    const EDGES = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
    const co = [[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0], [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1]];
    const val = new Float32Array(8);
    const OFF = co.map(([a, b, c]) => a + b * nx + c * nx * ny);
    const o1 = OFF[1], o2 = OFF[2], o3 = OFF[3], o4 = OFF[4], o5 = OFF[5], o6 = OFF[6], o7 = OFF[7];
    for (let k = 0; k < cnz; k++) for (let j = 0; j < cny; j++) {
      const row = (k * ny + j) * nx;
      for (let i = 0; i < cnx; i++) {
      const b0 = row + i;
      const v0 = F[b0], v1 = F[b0 + o1], v2 = F[b0 + o2], v3 = F[b0 + o3], v4 = F[b0 + o4], v5 = F[b0 + o5], v6 = F[b0 + o6], v7 = F[b0 + o7];
      const neg = (v0 < 0) + (v1 < 0) + (v2 < 0) + (v3 < 0) + (v4 < 0) + (v5 < 0) + (v6 < 0) + (v7 < 0);
      if (neg === 0 || neg === 8) continue;
      val[0] = v0; val[1] = v1; val[2] = v2; val[3] = v3; val[4] = v4; val[5] = v5; val[6] = v6; val[7] = v7;
      let sx = 0, sy = 0, sz = 0, n = 0;
      for (const [a, b] of EDGES) {
        const va = val[a], vb = val[b];
        if ((va < 0) === (vb < 0)) continue;
        const t = va / (va - vb);
        sx += co[a][0] + (co[b][0] - co[a][0]) * t; sy += co[a][1] + (co[b][1] - co[a][1]) * t; sz += co[a][2] + (co[b][2] - co[a][2]) * t; n++;
      }
      let px = x0 + (i + sx / n) * cell, py = y0 + (j + sy / n) * cell, pz = z0 + (k + sz / n) * cell;
      // 表面に寄せる（1回）。そのときの勾配を法線に使う
      const d = this.dist(px, py, pz);
      const g = this.grad(px, py, pz, cell * 0.3);
      const s = Math.max(-cell * 0.6, Math.min(cell * 0.6, d));
      px -= g[0] * s; py -= g[1] * s; pz -= g[2] * s;
      cid[(k * cny + j) * cnx + i] = V.length / 3;
      V.push(px, py, pz); NV.push(g[0], g[1], g[2]);
      }
    }
    const I = [];
    const cidx = (i, j, k) => cid[(k * cny + j) * cnx + i];
    // 四角形の頂点順は格子の向きから決める（形が崩れても裏返らない）
    const quad = (a, b, c, d, flip) => {
      if (a < 0 || b < 0 || c < 0 || d < 0) return;
      if (flip) { const t = b; b = d; d = t; }
      // 短い対角線で分割
      if (dist2(V, a, c) <= dist2(V, b, d)) I.push(a, b, c, a, c, d); else I.push(a, b, d, b, c, d);
    };
    for (let k = 1; k < cnz; k++) for (let j = 1; j < cny; j++) for (let i = 0; i < cnx; i++) {
      const va = F[id(i, j, k)], vb = F[id(i + 1, j, k)];
      if ((va < 0) === (vb < 0)) continue;
      quad(cidx(i, j - 1, k - 1), cidx(i, j, k - 1), cidx(i, j, k), cidx(i, j - 1, k), !(va < 0));
    }
    for (let k = 1; k < cnz; k++) for (let j = 0; j < cny; j++) for (let i = 1; i < cnx; i++) {
      const va = F[id(i, j, k)], vb = F[id(i, j + 1, k)];
      if ((va < 0) === (vb < 0)) continue;
      quad(cidx(i - 1, j, k - 1), cidx(i, j, k - 1), cidx(i, j, k), cidx(i - 1, j, k), va < 0);
    }
    for (let k = 0; k < cnz; k++) for (let j = 1; j < cny; j++) for (let i = 1; i < cnx; i++) {
      const va = F[id(i, j, k)], vb = F[id(i, j, k + 1)];
      if ((va < 0) === (vb < 0)) continue;
      quad(cidx(i - 1, j - 1, k), cidx(i, j - 1, k), cidx(i, j, k), cidx(i - 1, j, k), !(va < 0));
    }
    // 頂点データ
    const nv = V.length / 3;
    const data = new Float32Array(nv * VSTRIDE);
    const sw = this.sway, swY = this.swayY;
    const tint = opts.tint;
    for (let v = 0; v < nv; v++) {
      const x = V[v * 3], y = V[v * 3 + 1], z = V[v * 3 + 2];
      const n = [NV[v * 3], NV[v * 3 + 1], NV[v * 3 + 2]];
      let c = this.color(x, y, z);
      if (tint) c = tint(c, x, y, z, n);
      const o = v * VSTRIDE;
      data[o] = x; data[o + 1] = y; data[o + 2] = z;
      data[o + 3] = n[0]; data[o + 4] = n[1]; data[o + 5] = n[2];
      data[o + 6] = c[0]; data[o + 7] = c[1]; data[o + 8] = c[2];
      data[o + 9] = n[0]; data[o + 10] = n[1]; data[o + 11] = n[2];
      data[o + 12] = sw ? (swY == null ? sw : Math.max(0, Math.min(1, (y - swY) / 2)) * sw) : 0;
    }
    const index = nv > 65535 ? new Uint32Array(I) : new Uint16Array(I);
    return new Geometry(data, index);
  }
}
function dist2(V, a, b) { const dx = V[a * 3] - V[b * 3], dy = V[a * 3 + 1] - V[b * 3 + 1], dz = V[a * 3 + 2] - V[b * 3 + 2]; return dx * dx + dy * dy + dz * dz; }

// 3Dの値ノイズ（-0.5〜0.5）
function h3(i, j, k) { let n = i * 374761393 + j * 668265263 + k * 1274126177; n = (n ^ (n >>> 13)) * 1274126177; n = n ^ (n >>> 16); return (n & 0xffff) / 65535; }
export function nz3(x, y, z) {
  const i = Math.floor(x), j = Math.floor(y), k = Math.floor(z);
  let fx = x - i, fy = y - j, fz = z - k;
  fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy); fz = fz * fz * (3 - 2 * fz);
  const l = (a, b, t) => a + (b - a) * t;
  return l(l(l(h3(i, j, k), h3(i + 1, j, k), fx), l(h3(i, j + 1, k), h3(i + 1, j + 1, k), fx), fy),
    l(l(h3(i, j, k + 1), h3(i + 1, j, k + 1), fx), l(h3(i, j + 1, k + 1), h3(i + 1, j + 1, k + 1), fx), fy), fz) - 0.5;
}

// ---------- デカール（表面に沿って貼る平らな模様） ----------
// frame: { p:中心, n:法線, u:横方向 }   shape: 2D の多角形（u,v）  返り値は frame 基準のローカル座標
export function decalFrame(part, center, dir, up = [0, 1, 0]) {
  const s = part.surface(center, dir);
  const n = s.n;
  // u = up × n（横方向）, v = n × u（上方向）
  let u = [up[1] * n[2] - up[2] * n[1], up[2] * n[0] - up[0] * n[2], up[0] * n[1] - up[1] * n[0]];
  let l = Math.hypot(...u) || 1; u = u.map(x => x / l);
  let v = [n[1] * u[2] - n[2] * u[1], n[2] * u[0] - n[0] * u[2], n[0] * u[1] - n[1] * u[0]];
  l = Math.hypot(...v) || 1; v = v.map(x => x / l);
  return { p: s.p, n, u, v };
}
// 2D の閉じた輪郭（[x,y] の配列、反時計回り）を表面に投影して扇形の三角形メッシュにする
// layers: [{ pts, col, off, emis? }]  → 1つのジオメトリ（frame ローカル座標）
export function decalGeo(part, frame, layers, opts = {}) {
  const v = [], idx = [];
  const { p: P, n: N, u: U, v: Vv } = frame;
  const toW = (x, y) => [P[0] + U[0] * x + Vv[0] * y, P[1] + U[1] * x + Vv[1] * y, P[2] + U[2] * x + Vv[2] * y];
  const toL = (q) => { const d = [q[0] - P[0], q[1] - P[1], q[2] - P[2]]; return [d[0] * U[0] + d[1] * U[1] + d[2] * U[2], d[0] * Vv[0] + d[1] * Vv[1] + d[2] * Vv[2], d[0] * N[0] + d[1] * N[1] + d[2] * N[2]]; };
  const cache = new Map();
  const onSurf = (x, y) => {
    const key = Math.round(x * 4000) + ',' + Math.round(y * 4000);
    if (cache.has(key)) return cache.get(key);
    const w = toW(x, y);
    // 法線の方向に沿って表面まで移動（ニュートン法：数回で収束）
    let q = [w[0], w[1], w[2]];
    for (let i = 0; i < 8; i++) {
      const d = part.dist(q[0], q[1], q[2]);
      if (Math.abs(d) < 2e-4) break;
      q = [q[0] - N[0] * d, q[1] - N[1] * d, q[2] - N[2] * d];
    }
    const g = part.grad(q[0], q[1], q[2], 0.004);
    const r = { q, g };
    cache.set(key, r);
    return r;
  };
  const flat = opts.flat || 0; // 1なら表面に沿わせず平面（ハイライトなど）
  const P2 = []; // 2D 座標（三角形の向きの確認用）
  for (const L of layers) {
    const ring = (x, y) => {
      const s = onSurf(x, y);
      const loc = toL(s.q);
      const gl = [s.g[0] * U[0] + s.g[1] * U[1] + s.g[2] * U[2], s.g[0] * Vv[0] + s.g[1] * Vv[1] + s.g[2] * Vv[2], s.g[0] * N[0] + s.g[1] * N[1] + s.g[2] * N[2]];
      const off = L.off || 0.004;
      const z = (L.flat || flat) ? Math.max(loc[2], 0) + off : loc[2] + off;
      v.push(x, y, z, gl[0], gl[1], gl[2], L.col[0], L.col[1], L.col[2], gl[0], gl[1], gl[2], 0);
      P2.push(x, y);
      return v.length / VSTRIDE - 1;
    };
    const tri = (a, b, c) => {
      const ax = P2[a * 2], ay = P2[a * 2 + 1];
      const cr = (P2[b * 2] - ax) * (P2[c * 2 + 1] - ay) - (P2[b * 2 + 1] - ay) * (P2[c * 2] - ax);
      if (Math.abs(cr) < 1e-12) return;
      if (cr > 0) idx.push(a, b, c); else idx.push(a, c, b);
    };
    if (L.strip) {
      // 帯（まつ毛・口などの曲線）
      const [A, B] = L.strip;
      const ia = A.map(([x, y]) => ring(x, y)), ib = B.map(([x, y]) => ring(x, y));
      for (let i = 0; i < ia.length - 1; i++) { tri(ia[i], ia[i + 1], ib[i + 1]); tri(ia[i], ib[i + 1], ib[i]); }
      continue;
    }
    const pts = L.pts;
    // 中心（重心）から扇形に
    let cx = 0, cy = 0; for (const [x, y] of pts) { cx += x; cy += y; } cx /= pts.length; cy /= pts.length;
    const c0 = ring(cx, cy);
    // 内側にもう1周（大きいデカールを曲面に沿わせる）
    const mids = pts.map(([x, y]) => ring(cx + (x - cx) * 0.55, cy + (y - cy) * 0.55));
    const outs = pts.map(([x, y]) => ring(x, y));
    const n = pts.length;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      tri(c0, mids[i], mids[j]);
      tri(mids[i], outs[i], outs[j]); tri(mids[i], outs[j], mids[j]);
    }
  }
  return new Geometry(new Float32Array(v), new Uint16Array(idx));
}
// 2D 図形の便利関数
export function ellipse2(cx, cy, rx, ry, n = 20, rot = 0) {
  const out = []; const c = Math.cos(rot), s = Math.sin(rot);
  for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2; const x = Math.cos(a) * rx, y = Math.sin(a) * ry; out.push([cx + x * c - y * s, cy + x * s + y * c]); }
  return out;
}
// 三日月・弧（太さのある曲線）  a0〜a1 の角度、半径 r、太さ w（先端は細く）
//  返り値 { strip:[外側, 内側] }（decalGeo のレイヤーにそのまま使える）
//  wfn(t) で太さの変化を指定できる（t=0〜1）
export function arc2(cx, cy, rx, ry, a0, a1, w, n = 14, wfn = null) {
  const outer = [], inner = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, a = a0 + (a1 - a0) * t;
    const ww = wfn ? w * wfn(t) : w * Math.pow(Math.sin(Math.PI * Math.min(1, Math.max(0, t * 0.92 + 0.04))), 0.6);
    outer.push([cx + Math.cos(a) * (rx + ww / 2), cy + Math.sin(a) * (ry + ww / 2)]);
    inner.push([cx + Math.cos(a) * (rx - ww / 2), cy + Math.sin(a) * (ry - ww / 2)]);
  }
  return { strip: [outer, inner] };
}
// 折れ線（点列）に太さをつけた帯
export function line2(pts, w, wfn = null) {
  const A = [], B = [];
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i], q = pts[Math.min(pts.length - 1, i + 1)], o = pts[Math.max(0, i - 1)];
    let dx = q[0] - o[0], dy = q[1] - o[1]; const l = Math.hypot(dx, dy) || 1; dx /= l; dy /= l;
    const ww = (wfn ? wfn(i / (pts.length - 1)) : 1) * w / 2;
    A.push([p[0] - dy * ww, p[1] + dx * ww]); B.push([p[0] + dy * ww, p[1] - dx * ww]);
  }
  return { strip: [A, B] };
}
export { deg };
