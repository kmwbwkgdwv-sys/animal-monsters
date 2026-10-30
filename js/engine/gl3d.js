// =============================================================
//  アニマルモンスター  軽量3Dエンジン（WebGL / 依存ライブラリなし）
// =============================================================

// ---------- 行列（列優先 / WebGL互換） ----------
export const M4 = {
  ident() { const m = new Float32Array(16); m[0] = m[5] = m[10] = m[15] = 1; return m; },
  mul(a, b, out = new Float32Array(16)) {
    const a00 = a[0], a01 = a[1], a02 = a[2], a03 = a[3], a10 = a[4], a11 = a[5], a12 = a[6], a13 = a[7],
      a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11], a30 = a[12], a31 = a[13], a32 = a[14], a33 = a[15];
    for (let i = 0; i < 4; i++) {
      const b0 = b[i * 4], b1 = b[i * 4 + 1], b2 = b[i * 4 + 2], b3 = b[i * 4 + 3];
      out[i * 4] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
      out[i * 4 + 1] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
      out[i * 4 + 2] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
      out[i * 4 + 3] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;
    }
    return out;
  },
  perspective(fovy, aspect, near, far, out = new Float32Array(16)) {
    const f = 1 / Math.tan(fovy / 2), nf = 1 / (near - far);
    out.fill(0);
    out[0] = f / aspect; out[5] = f; out[10] = (far + near) * nf; out[11] = -1; out[14] = 2 * far * near * nf;
    return out;
  },
  ortho(l, r, b, t, n, f, out = new Float32Array(16)) {
    out.fill(0);
    out[0] = 2 / (r - l); out[5] = 2 / (t - b); out[10] = -2 / (f - n);
    out[12] = -(r + l) / (r - l); out[13] = -(t + b) / (t - b); out[14] = -(f + n) / (f - n); out[15] = 1;
    return out;
  },
  lookAt(e, t, up = [0, 1, 0], out = new Float32Array(16)) {
    let zx = e[0] - t[0], zy = e[1] - t[1], zz = e[2] - t[2];
    let l = Math.hypot(zx, zy, zz) || 1; zx /= l; zy /= l; zz /= l;
    let xx = up[1] * zz - up[2] * zy, xy = up[2] * zx - up[0] * zz, xz = up[0] * zy - up[1] * zx;
    l = Math.hypot(xx, xy, xz) || 1; xx /= l; xy /= l; xz /= l;
    const yx = zy * xz - zz * xy, yy = zz * xx - zx * xz, yz = zx * xy - zy * xx;
    out[0] = xx; out[1] = yx; out[2] = zx; out[3] = 0;
    out[4] = xy; out[5] = yy; out[6] = zy; out[7] = 0;
    out[8] = xz; out[9] = yz; out[10] = zz; out[11] = 0;
    out[12] = -(xx * e[0] + xy * e[1] + xz * e[2]);
    out[13] = -(yx * e[0] + yy * e[1] + yz * e[2]);
    out[14] = -(zx * e[0] + zy * e[1] + zz * e[2]);
    out[15] = 1;
    return out;
  },
  // 回転順: R = Ry * Rx * Rz
  fromTRS(p, r, s, out = new Float32Array(16)) {
    const cx = Math.cos(r[0]), sx = Math.sin(r[0]), cy = Math.cos(r[1]), sy = Math.sin(r[1]), cz = Math.cos(r[2]), sz = Math.sin(r[2]);
    const r00 = cy * cz + sy * sx * sz, r01 = -cy * sz + sy * sx * cz, r02 = sy * cx;
    const r10 = cx * sz, r11 = cx * cz, r12 = -sx;
    const r20 = -sy * cz + cy * sx * sz, r21 = sy * sz + cy * sx * cz, r22 = cy * cx;
    out[0] = r00 * s[0]; out[1] = r10 * s[0]; out[2] = r20 * s[0]; out[3] = 0;
    out[4] = r01 * s[1]; out[5] = r11 * s[1]; out[6] = r21 * s[1]; out[7] = 0;
    out[8] = r02 * s[2]; out[9] = r12 * s[2]; out[10] = r22 * s[2]; out[11] = 0;
    out[12] = p[0]; out[13] = p[1]; out[14] = p[2]; out[15] = 1;
    return out;
  },
  apply(m, x, y, z) {
    return [m[0] * x + m[4] * y + m[8] * z + m[12], m[1] * x + m[5] * y + m[9] * z + m[13], m[2] * x + m[6] * y + m[10] * z + m[14]];
  },
  applyDir(m, x, y, z) {
    return [m[0] * x + m[4] * y + m[8] * z, m[1] * x + m[5] * y + m[9] * z, m[2] * x + m[6] * y + m[10] * z];
  },
};

export function hexToRgb(h) {
  if (Array.isArray(h)) return h;
  h = h.replace('#', '');
  if (h.length === 3) h = h.split('').map(c => c + c).join('');
  const n = parseInt(h, 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}
export function rgbToHsl([r, g, b]) {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b); let h = 0, s = 0; const l = (mx + mn) / 2;
  if (mx !== mn) {
    const d = mx - mn; s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
    if (mx === r) h = (g - b) / d + (g < b ? 6 : 0); else if (mx === g) h = (b - r) / d + 2; else h = (r - g) / d + 4;
    h /= 6;
  }
  return [h, s, l];
}
export function hslToRgb([h, s, l]) {
  if (s === 0) return [l, l, l];
  const hue = (p, q, t) => { if (t < 0) t += 1; if (t > 1) t -= 1; if (t < 1 / 6) return p + (q - p) * 6 * t; if (t < 1 / 2) return q; if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6; return p; };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
  return [hue(p, q, h + 1 / 3), hue(p, q, h), hue(p, q, h - 1 / 3)];
}
export function shiftHue(c, dh, ds = 0, dl = 0) {
  const [h, s, l] = rgbToHsl(hexToRgb(c));
  return hslToRgb([(h + dh + 10) % 1, Math.min(1, Math.max(0, s + ds)), Math.min(0.95, Math.max(0.05, l + dl))]);
}
export function mixRgb(a, b, t) { a = hexToRgb(a); b = hexToRgb(b); return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }

// ---------- ジオメトリ ----------
// 頂点: 位置(3) 法線(3) 色(3) 輪郭の押し出し方向(3) 風ゆれ(1) = 13 float
export const VSTRIDE = 13;
const M4_IDENT = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
let GEO_ID = 1;
export class Geometry {
  constructor(data, index) {
    this.id = GEO_ID++;
    this.data = data;
    this.index = index; // Uint16Array | Uint32Array
    this.count = index.length;
    this.buffers = new Map();
    let minx = 1e9, miny = 1e9, minz = 1e9, maxx = -1e9, maxy = -1e9, maxz = -1e9;
    for (let i = 0; i < data.length; i += VSTRIDE) {
      const x = data[i], y = data[i + 1], z = data[i + 2];
      if (x < minx) minx = x; if (x > maxx) maxx = x; if (y < miny) miny = y; if (y > maxy) maxy = y; if (z < minz) minz = z; if (z > maxz) maxz = z;
    }
    this.center = [(minx + maxx) / 2, (miny + maxy) / 2, (minz + maxz) / 2];
    this.radius = Math.hypot(maxx - minx, maxy - miny, maxz - minz) / 2;
    this.min = [minx, miny, minz]; this.max = [maxx, maxy, maxz];
  }
  dispose() {
    for (const [gl, b] of this.buffers) { gl.deleteBuffer(b.vb); gl.deleteBuffer(b.ib); }
    this.buffers.clear();
  }
}

export class GeoBuilder {
  constructor() { this.v = []; this.i = []; this.mat = null; this.oc = null; this.forceC = null; this.sw = 0; }
  get vcount() { return this.v.length / VSTRIDE; }
  setMatrix(m) { this.mat = m; return this; }
  // 輪郭線の押し出し中心（パーツのまとまりを1つの塊として縁取りたいとき）
  center(c) { this.forceC = c; return this; }
  sway(w) { this.sw = w; return this; }
  _c(c, fn) { const prev = this.oc; this.oc = this.forceC || c; fn(); this.oc = prev; return this; }
  _push(x, y, z, nx, ny, nz, c, sw) {
    let ox, oy, oz;
    if (this.oc) { ox = x - this.oc[0]; oy = y - this.oc[1]; oz = z - this.oc[2]; } else { ox = nx; oy = ny; oz = nz; }
    const s = sw ?? this.sw;
    if (this.mat) {
      const p = M4.apply(this.mat, x, y, z), n = M4.applyDir(this.mat, nx, ny, nz), o = M4.applyDir(this.mat, ox, oy, oz);
      const l = Math.hypot(n[0], n[1], n[2]) || 1, lo = Math.hypot(o[0], o[1], o[2]) || 1;
      this.v.push(p[0], p[1], p[2], n[0] / l, n[1] / l, n[2] / l, c[0], c[1], c[2], o[0] / lo, o[1] / lo, o[2] / lo, s);
    } else {
      const lo = Math.hypot(ox, oy, oz) || 1;
      this.v.push(x, y, z, nx, ny, nz, c[0], c[1], c[2], ox / lo, oy / lo, oz / lo, s);
    }
    return this.vcount - 1;
  }
  tri(a, b, c) { this.i.push(a, b, c); }
  // 平面四角形（フラット法線）  p0→p1→p2→p3 を表から見て反時計回りで指定
  quad(p0, p1, p2, p3, col) {
    col = hexToRgb(col);
    const ux = p1[0] - p0[0], uy = p1[1] - p0[1], uz = p1[2] - p0[2], vx = p3[0] - p0[0], vy = p3[1] - p0[1], vz = p3[2] - p0[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
    const cc = [(p0[0] + p1[0] + p2[0] + p3[0]) / 4, (p0[1] + p1[1] + p2[1] + p3[1]) / 4, (p0[2] + p1[2] + p2[2] + p3[2]) / 4];
    return this._c(cc, () => {
      const a = this._push(...p0, nx, ny, nz, col), b = this._push(...p1, nx, ny, nz, col), c = this._push(...p2, nx, ny, nz, col), d = this._push(...p3, nx, ny, nz, col);
      this.tri(a, b, c); this.tri(a, c, d);
    });
  }
  box(w, h, d, col, ox = 0, oy = 0, oz = 0) {
    col = hexToRgb(col);
    const x0 = ox - w / 2, x1 = ox + w / 2, y0 = oy - h / 2, y1 = oy + h / 2, z0 = oz - d / 2, z1 = oz + d / 2;
    const faces = [
      [[x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1], [1, 0, 0]],
      [[x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [x0, y0, z0], [-1, 0, 0]],
      [[x0, y1, z0], [x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [0, 1, 0]],
      [[x0, y0, z1], [x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [0, -1, 0]],
      [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1]],
      [[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [0, 0, -1]],
    ];
    return this._c([ox, oy, oz], () => {
      for (const f of faces) {
        const n = f[4];
        const a = this._push(...f[0], ...n, col), b = this._push(...f[1], ...n, col), c = this._push(...f[2], ...n, col), e = this._push(...f[3], ...n, col);
        this.tri(a, b, c); this.tri(a, c, e);
      }
    });
  }
  sphere(r, col, ox = 0, oy = 0, oz = 0, seg = 10, rings = 7, sy = 1, col2 = null) {
    col = hexToRgb(col); const c2 = col2 ? hexToRgb(col2) : null;
    return this._c([ox, oy, oz], () => {
      const start = this.vcount;
      for (let j = 0; j <= rings; j++) {
        const v = j / rings, phi = v * Math.PI;
        for (let i = 0; i <= seg; i++) {
          const u = i / seg, th = u * Math.PI * 2;
          const nx = Math.sin(phi) * Math.cos(th), ny = Math.cos(phi), nz = Math.sin(phi) * Math.sin(th);
          const cc = c2 && ny < -0.2 ? c2 : col;
          this._push(ox + nx * r, oy + ny * r * sy, oz + nz * r, nx, ny / sy, nz, cc);
        }
      }
      for (let j = 0; j < rings; j++) for (let i = 0; i < seg; i++) {
        const a = start + j * (seg + 1) + i, b = a + seg + 1;
        this.tri(a, a + 1, b); this.tri(b, a + 1, b + 1);
      }
    });
  }
  // 底面 y=oy, 上面 y=oy+h
  cylinder(rt, rb, h, col, ox = 0, oy = 0, oz = 0, seg = 8, caps = true, colTop = null) {
    col = hexToRgb(col); const ct = colTop ? hexToRgb(colTop) : col;
    return this._c([ox, oy + h * 0.5, oz], () => {
      const start = this.vcount; const slope = (rb - rt) / h;
      const swb = this.sw, swt = this.swTop ?? this.sw;
      for (let i = 0; i <= seg; i++) {
        const th = i / seg * Math.PI * 2, cs = Math.cos(th), sn = Math.sin(th);
        const l = Math.hypot(1, slope);
        this._push(ox + cs * rb, oy, oz + sn * rb, cs / l, slope / l, sn / l, col, swb);
        this._push(ox + cs * rt, oy + h, oz + sn * rt, cs / l, slope / l, sn / l, ct, swt);
      }
      for (let i = 0; i < seg; i++) { const a = start + i * 2; this.tri(a, a + 1, a + 2); this.tri(a + 2, a + 1, a + 3); }
      if (caps) {
        if (rt > 0.001) { const c = this._push(ox, oy + h, oz, 0, 1, 0, ct, swt); const s = this.vcount; for (let i = 0; i <= seg; i++) { const th = i / seg * Math.PI * 2; this._push(ox + Math.cos(th) * rt, oy + h, oz + Math.sin(th) * rt, 0, 1, 0, ct, swt); } for (let i = 0; i < seg; i++) this.tri(c, s + i + 1, s + i); }
        if (rb > 0.001) { const c = this._push(ox, oy, oz, 0, -1, 0, col, swb); const s = this.vcount; for (let i = 0; i <= seg; i++) { const th = i / seg * Math.PI * 2; this._push(ox + Math.cos(th) * rb, oy, oz + Math.sin(th) * rb, 0, -1, 0, col, swb); } for (let i = 0; i < seg; i++) this.tri(c, s + i, s + i + 1); }
      }
    });
  }
  cone(r, h, col, ox = 0, oy = 0, oz = 0, seg = 8) { return this.cylinder(0.0001, r, h, col, ox, oy, oz, seg, true); }
  // 円盤（上向き）
  disc(r, col, ox = 0, oy = 0, oz = 0, seg = 16) {
    col = hexToRgb(col);
    return this._c([ox, oy, oz], () => {
      const c = this._push(ox, oy, oz, 0, 1, 0, col); const s = this.vcount;
      for (let i = 0; i <= seg; i++) { const th = i / seg * Math.PI * 2; this._push(ox + Math.cos(th) * r, oy, oz + Math.sin(th) * r, 0, 1, 0, col); }
      for (let i = 0; i < seg; i++) this.tri(c, s + i + 1, s + i);
    });
  }
  // 三角柱の屋根（x方向に棟）
  roof(w, h, d, col, ox = 0, oy = 0, oz = 0) {
    col = hexToRgb(col);
    const x0 = ox - w / 2, x1 = ox + w / 2, z0 = oz - d / 2, z1 = oz + d / 2, y0 = oy, y1 = oy + h;
    const keep = this.forceC; this.forceC = keep || [ox, oy + h * 0.4, oz];
    this.quad([x0, y0, z1], [x1, y0, z1], [x1, y1, oz], [x0, y1, oz], col);
    this.quad([x1, y0, z0], [x0, y0, z0], [x0, y1, oz], [x1, y1, oz], col);
    this._c(null, () => {
      const n1 = [1, 0, 0], n0 = [-1, 0, 0];
      let a = this._push(x1, y0, z0, ...n1, col), b = this._push(x1, y1, oz, ...n1, col), c = this._push(x1, y0, z1, ...n1, col); this.tri(a, b, c);
      a = this._push(x0, y0, z1, ...n0, col); b = this._push(x0, y1, oz, ...n0, col); c = this._push(x0, y0, z0, ...n0, col); this.tri(a, b, c);
    });
    this.forceC = keep;
    return this;
  }
  // 回転体（下から上へ [半径, 高さ] の輪郭）
  lathe(prof, col, seg = 12, ox = 0, oy = 0, oz = 0) {
    col = hexToRgb(col);
    const ys = prof.map(p => p[1]); const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
    return this._c([ox, oy + cy, oz], () => {
      const start = this.vcount, n = prof.length;
      for (let j = 0; j < n; j++) {
        const [r, y] = prof[j];
        const pa = prof[Math.max(0, j - 1)], pb = prof[Math.min(n - 1, j + 1)];
        const dr = pb[0] - pa[0], dy = pb[1] - pa[1];
        let nr = dy, ny = -dr; const l = Math.hypot(nr, ny) || 1; nr /= l; ny /= l;
        for (let i = 0; i <= seg; i++) { const th = i / seg * Math.PI * 2, cs = Math.cos(th), sn = Math.sin(th); this._push(ox + cs * r, oy + y, oz + sn * r, cs * nr, ny, sn * nr, col); }
      }
      for (let j = 0; j < n - 1; j++) for (let i = 0; i < seg; i++) { const a = start + j * (seg + 1) + i, b = a + seg + 1; this.tri(a, b, a + 1); this.tri(a + 1, b, b + 1); }
    });
  }
  merge(other) {
    const off = this.vcount;
    for (let k = 0; k < other.v.length; k++) this.v.push(other.v[k]);
    for (let k = 0; k < other.i.length; k++) this.i.push(other.i[k] + off);
    return this;
  }
  build() {
    const data = new Float32Array(this.v);
    const index = this.vcount > 65535 ? new Uint32Array(this.i) : new Uint16Array(this.i);
    return new Geometry(data, index);
  }
}

// ---------- 材質（セル調の陰影） ----------
// [影の境目の下限, 上限, リムライト, ハイライト]
export const MAT = {
  char: [-0.03, 0.07, 0.6, 0.0],
  glossy: [-0.03, 0.07, 0.6, 0.7],
  decor: [-0.12, 0.14, 0.3, 0.0],
  building: [-0.06, 0.1, 0.18, 0.0],
  terrain: [-0.22, 0.3, 0.0, 0.0],
  cloud: [-0.35, 0.25, 0.45, 0.0],
  flat: [-1.0, -0.9, 0.0, 0.0],
};

// ---------- シーングラフ ----------
// 木構造全体の、ワールド座標での外接箱（[minx,miny,minz,maxx,maxy,maxz]）
export function treeBounds(root) {
  root.update(root.parent ? root.parent.world : null);
  const b = [1e9, 1e9, 1e9, -1e9, -1e9, -1e9];
  root.traverse(n => {
    if (!n.geo || !n.visible || !n.geo.min || n.inst) return;
    const m = n.world, lo = n.geo.min, hi = n.geo.max;
    for (let k = 0; k < 8; k++) {
      const x = k & 1 ? hi[0] : lo[0], y = k & 2 ? hi[1] : lo[1], z = k & 4 ? hi[2] : lo[2];
      const wx = m[0] * x + m[4] * y + m[8] * z + m[12], wy = m[1] * x + m[5] * y + m[9] * z + m[13], wz = m[2] * x + m[6] * y + m[10] * z + m[14];
      if (wx < b[0]) b[0] = wx; if (wy < b[1]) b[1] = wy; if (wz < b[2]) b[2] = wz;
      if (wx > b[3]) b[3] = wx; if (wy > b[4]) b[4] = wy; if (wz > b[5]) b[5] = wz;
    }
  });
  return b;
}
export class Node {
  constructor(geo = null, opts = {}) {
    this.geo = geo;
    this.pos = [0, 0, 0]; this.rot = [0, 0, 0]; this.scl = [1, 1, 1];
    this.children = []; this.parent = null;
    this.color = opts.color ? [...hexToRgb(opts.color), opts.alpha ?? 1] : [1, 1, 1, opts.alpha ?? 1];
    this.emis = opts.emis ? hexToRgb(opts.emis) : [0, 0, 0];
    this.unlit = !!opts.unlit; this.transparent = !!opts.transparent || (opts.alpha ?? 1) < 1;
    this.wave = opts.wave || 0; this.noFog = !!opts.noFog; this.noDepthWrite = !!opts.noDepthWrite;
    this.visible = true; this.name = opts.name || '';
    this.world = M4.ident(); this.local = M4.ident();
    this.cull = opts.cull ?? true;
    this.renderOrder = opts.renderOrder || 0;
    this.mat = opts.mat ? (typeof opts.mat === 'string' ? MAT[opts.mat] : opts.mat) : MAT.char;
    this.outline = opts.outline ?? 1;   // 輪郭線の太さ倍率（0で無し）
    this.kind = opts.kind || 0;         // 0:通常 1:空 2:水 3:雲
    this.cloudShadow = opts.cloudShadow ?? 1;
    this.castShadow = opts.castShadow ?? true;
    this.receiveShadow = opts.receiveShadow ?? true;
  }
  add(...ns) { for (const n of ns) { if (n.parent) n.parent.remove(n); n.parent = this; this.children.push(n); } return this; }
  remove(n) { const i = this.children.indexOf(n); if (i >= 0) { this.children.splice(i, 1); n.parent = null; } return this; }
  setPos(x, y, z) { this.pos[0] = x; this.pos[1] = y; this.pos[2] = z; return this; }
  setRot(x, y, z) { this.rot[0] = x; this.rot[1] = y; this.rot[2] = z; return this; }
  setScale(x, y = x, z = x) { this.scl[0] = x; this.scl[1] = y; this.scl[2] = z; return this; }
  setColor(c, a) { const r = hexToRgb(c); this.color[0] = r[0]; this.color[1] = r[1]; this.color[2] = r[2]; if (a !== undefined) { this.color[3] = a; this.transparent = a < 1; } return this; }
  update(parentWorld) {
    M4.fromTRS(this.pos, this.rot, this.scl, this.local);
    if (parentWorld) M4.mul(parentWorld, this.local, this.world); else this.world.set(this.local);
    for (const c of this.children) c.update(this.world);
  }
  traverse(fn) { fn(this); for (const c of this.children) c.traverse(fn); }
  find(name) { if (this.name === name) return this; for (const c of this.children) { const f = c.find(name); if (f) return f; } return null; }
  worldPos() { return [this.world[12], this.world[13], this.world[14]]; }
}

export class Scene {
  constructor() {
    this.root = new Node();
    this.bg = [0.55, 0.78, 0.95];
    this.fogColor = [0.62, 0.82, 0.95]; this.fogNear = 60; this.fogFar = 160;
    this.lightDir = norm3([0.45, 0.78, 0.42]);
    // アニメ調：明るい面は暖色、影は青紫
    this.sun = [0.86, 0.83, 0.76]; this.shadowC = [0.34, 0.33, 0.5];
    this.sky = [0.2, 0.22, 0.3]; this.ground = [0.12, 0.1, 0.1];
    this.zenith = [0.22, 0.48, 0.92]; this.horizon = [0.72, 0.88, 1.0];
    this.wind = [0.8, 0.35, 0.6];       // 風向き x, 強さ, z
    this.cloudShadow = [0, 0.012, 0, 0]; // 強さ, 大きさ, ずれx, ずれz
    this.outline = true; this.outlinePx = 2.0; this.outlineDist = 95;
    this.hmap = null;
    this.cullCenter = null; this.cullRadius = 1e9;
    // 影（太陽から見た深度マップ）  center: 影を作る範囲の中心, radius: 半径
    this.shadow = null; // { center:[x,y,z], radius, strength }
  }
  add(...n) { this.root.add(...n); return this; }
}
export function norm3(v) { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; }

export class Camera {
  constructor(fov = 45) { this.fov = fov * Math.PI / 180; this.near = 0.5; this.far = 900; this.pos = [0, 30, 30]; this.target = [0, 0, 0]; this.aspect = 1; this.view = M4.ident(); this.proj = M4.ident(); this.vp = M4.ident(); }
  update() { M4.lookAt(this.pos, this.target, [0, 1, 0], this.view); M4.perspective(this.fov, this.aspect, this.near, this.far, this.proj); M4.mul(this.proj, this.view, this.vp); }
  project(p, w, h) {
    const m = this.vp; const x = m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12], y = m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13], ww = m[3] * p[0] + m[7] * p[1] + m[11] * p[2] + m[15];
    return [(x / ww * 0.5 + 0.5) * w, (1 - (y / ww * 0.5 + 0.5)) * h, ww];
  }
}

const VS = `
attribute vec3 aPos; attribute vec3 aNor; attribute vec3 aCol; attribute vec3 aOut; attribute float aSway;
attribute vec4 aI0; attribute vec4 aI1;
uniform mat4 uVP; uniform mat4 uM; uniform float uTime; uniform vec4 uMisc; uniform vec3 uWind; uniform vec3 uCam; uniform vec2 uOut;
uniform mat4 uLightVP; uniform float uInst;
varying vec3 vCol; varying vec3 vNor; varying vec3 vW; varying vec4 vLS;
vec3 iRot(vec3 v, float c, float s) { return vec3(c * v.x + s * v.z, v.y, -s * v.x + c * v.z); }
void main(){
  vec3 P = aPos, NR = aNor, OD = aOut, CO = aCol;
  if (uInst > 0.5) { float c = cos(aI0.w), s = sin(aI0.w); P = iRot(P, c, s) * aI1.x + aI0.xyz; NR = iRot(NR, c, s); OD = iRot(OD, c, s); CO *= aI1.yzw; }
  vec4 w = uM * vec4(P, 1.0);
  float wave = uMisc.w;
  if (wave > 0.0) { w.y += ((sin(w.x * 0.13 + uTime * 1.4) + cos(w.z * 0.11 + uTime * 1.1)) * 0.16 + sin(w.x * 0.47 + w.z * 0.39 + uTime * 2.6) * 0.06) * wave; }
  if (aSway > 0.0) {
    float ph = w.x * 0.21 + w.z * 0.17;
    float gust = 0.55 + 0.45 * sin(uTime * 0.6 + w.x * 0.03 + w.z * 0.021);
    float s = (sin(uTime * 2.1 + ph) * 0.65 + sin(uTime * 3.9 + ph * 1.7) * 0.35 + 0.35) * gust * uWind.y * aSway;
    w.x += uWind.x * s; w.z += uWind.z * s; w.y -= abs(s) * 0.25;
  }
  vec3 n = normalize((uM * vec4(NR, 0.0)).xyz);
  if (uOut.x > 0.0) {
    vec3 od = (uM * vec4(OD, 0.0)).xyz; float ol = length(od);
    od = ol > 0.00001 ? od / ol : n;
    w.xyz += od * min(uOut.x * length(w.xyz - uCam), uOut.y);
  }
  vW = w.xyz; vNor = n; vCol = CO;
  vLS = uLightVP * vec4(w.xyz + n * 0.06, 1.0);
  gl_Position = uVP * w;
}`;
const FS = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform vec4 uColor; uniform vec3 uEmis; uniform vec3 uLight; uniform vec3 uSun; uniform vec3 uShadowC; uniform vec3 uSky; uniform vec3 uGround;
uniform vec3 uFogCol; uniform vec2 uFog; uniform vec3 uCam; uniform float uUnlit; uniform float uNoFog; uniform float uTime;
uniform vec4 uMat; uniform vec4 uMisc; uniform vec3 uZenith; uniform vec3 uHorizon; uniform vec4 uCloud;
uniform sampler2D uHMap; uniform vec4 uHRect; uniform vec2 uOut;
uniform sampler2D uShadowMap; uniform vec4 uShadowP; uniform vec3 uWind;
varying vec3 vCol; varying vec3 vNor; varying vec3 vW; varying vec4 vLS;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y); }
float unpackD(vec4 c) { return dot(c, vec4(1.0, 1.0 / 255.0, 1.0 / 65025.0, 1.0 / 16581375.0)); }
float shadowAt() {
  if (uShadowP.x < 0.5) return 1.0;
  vec3 p = vLS.xyz / vLS.w * 0.5 + 0.5;
  if (p.x <= 0.0 || p.x >= 1.0 || p.y <= 0.0 || p.y >= 1.0 || p.z >= 1.0) return 1.0;
  // 2テクセル幅の箱フィルタ（9点・端の重みを小数部で配分）→ 影のふちのギザギザを無くす
  float ts = uShadowP.y, z = p.z - uShadowP.z;
  vec2 x = p.xy / ts, fr = fract(x);
  vec2 b = (floor(x) - 0.5) * ts;
  vec3 wx = vec3(1.0 - fr.x, 1.0, fr.x), wy = vec3(1.0 - fr.y, 1.0, fr.y);
  float s = 0.0;
  for (int j = 0; j < 3; j++) {
    float row = 0.0;
    for (int i = 0; i < 3; i++) {
      float w = i == 0 ? wx.x : (i == 1 ? wx.y : wx.z);
      row += w * step(z, unpackD(texture2D(uShadowMap, b + vec2(float(i), float(j)) * ts)));
    }
    s += row * (j == 0 ? wy.x : (j == 1 ? wy.y : wy.z));
  }
  vec2 e = min(p.xy, 1.0 - p.xy);
  float fade = smoothstep(0.0, 0.1, min(e.x, e.y));
  return mix(1.0, s * 0.25, fade * uShadowP.w);
}
vec3 fogIt(vec3 c) {
  if (uNoFog > 0.5) return c;
  float f = clamp((length(vW - uCam) - uFog.x) / (uFog.y - uFog.x), 0.0, 1.0);
  return mix(c, uFogCol, f * f * (3.0 - 2.0 * f));
}
void main(){
  vec3 base = vCol * uColor.rgb;
  float kind = uMisc.x;
  // 輪郭線（色付きの線：その部分の色を暗くした色）
  if (uOut.x > 0.0) {
    vec3 oc = mix(base * vec3(0.36, 0.33, 0.42), vec3(0.09, 0.06, 0.14), 0.42);
    gl_FragColor = vec4(fogIt(oc), 1.0);
    return;
  }
  // 空（グラデーション＋太陽のにじみ）
  if (kind > 0.5 && kind < 1.5) {
    vec3 dir = normalize(vW - uCam);
    float t = clamp(dir.y, 0.0, 1.0);
    vec3 c = mix(uHorizon, uZenith, pow(t, 0.6));
    c = mix(c, uHorizon * 1.04, smoothstep(0.02, -0.12, dir.y));
    float sd = max(dot(dir, uLight), 0.0);
    c += vec3(1.0, 0.93, 0.78) * (pow(sd, 300.0) * 1.2 + pow(sd, 18.0) * 0.22 + pow(sd, 4.0) * 0.06);
    gl_FragColor = vec4(c, 1.0);
    return;
  }
  vec3 n = normalize(vNor);
  vec3 V = normalize(uCam - vW);
  // 地面：手描き風のムラ・風が草原を渡る明るい帯
  if (kind > 3.5 && kind < 4.5) {
    float n1 = vnoise(vW.xz * 0.04), n2 = vnoise(vW.xz * 0.17 + 7.0), n3 = vnoise(vW.xz * 0.75 + 3.0);
    float grassy = clamp((base.g - max(base.r, base.b)) * 5.0, 0.0, 1.0);
    base *= 0.86 + n1 * 0.24 + (n2 - 0.5) * 0.14 + (n3 - 0.5) * 0.07;
    // 日なたの黄緑のムラと、しっとりした深緑のムラ
    base = mix(base, base * vec3(1.18, 1.1, 0.72), smoothstep(0.6, 0.8, n1) * grassy * 0.65);
    base = mix(base, base * vec3(0.78, 0.92, 0.9), smoothstep(0.42, 0.24, n1) * grassy * 0.5);
    float wv = sin(dot(vW.xz, normalize(uWind.xz)) * 0.085 - uTime * 1.5 + n1 * 4.0);
    float sweep = smoothstep(0.7, 1.0, wv) * (0.4 + 0.6 * n2);
    base += vec3(0.09, 0.12, 0.03) * sweep * grassy * clamp(uWind.y * 2.2, 0.0, 1.0);
  }
  vec3 c = base;
  float alpha = uColor.a;
  if (uUnlit < 0.5) {
    float ndl = dot(n, uLight);
    float lit = smoothstep(uMat.x, uMat.y, ndl);
    if (uMisc.y > 0.5) lit *= shadowAt();
    if (uCloud.x > 0.0 && uMisc.z > 0.5) {
      float cn = vnoise(vW.xz * uCloud.y + uCloud.zw) * 0.7 + vnoise(vW.xz * uCloud.y * 2.3 - uCloud.zw * 1.3) * 0.3;
      lit *= 1.0 - uCloud.x * smoothstep(0.56, 0.68, cn);
    }
    vec3 amb = mix(uGround, uSky, n.y * 0.5 + 0.5);
    c = base * (amb + mix(uShadowC, uSun, lit));
    float rim = pow(1.0 - clamp(dot(n, V), 0.0, 1.0), 3.0);
    c += (uSun * 0.55 + vec3(0.18)) * rim * uMat.z * (0.3 + 0.7 * lit);
    if (uMat.w > 0.0) { float sp = dot(reflect(-uLight, n), V); c += vec3(1.0) * smoothstep(0.88, 0.92, sp) * uMat.w * (0.4 + 0.6 * lit); }
  }
  c += uEmis;
  // 水面（浅瀬の色・波打ち際の泡・きらめき）
  if (kind > 1.5 && kind < 2.5) {
    vec2 uv = ((vW.xz - uHRect.xy) / uHRect.z + 0.5) / uHRect.w;
    float th = texture2D(uHMap, uv).r * 16.0 - 12.0;
    float depth = max(0.0, vW.y - th);
    vec3 shallow = vec3(0.32, 0.86, 0.86), deep = vec3(0.09, 0.36, 0.78);
    vec3 wc = mix(shallow, deep, smoothstep(0.2, 5.5, depth));
    float fres = pow(1.0 - clamp(V.y, 0.0, 1.0), 2.0);
    wc = mix(wc, uHorizon, fres * 0.45);
    float lightband = max(dot(n, uLight), 0.0);
    wc *= 0.82 + lightband * 0.3;
    float g = vnoise(vW.xz * 0.32 + vec2(uTime * 0.22, uTime * 0.16)) * vnoise(vW.xz * 0.85 - vec2(uTime * 0.35, -uTime * 0.28));
    wc += vec3(1.0) * smoothstep(0.40, 0.44, g) * 0.55;
    float edge = 0.55 + 0.3 * sin(uTime * 1.7 + vW.x * 0.25 + vW.z * 0.2);
    float foam = 1.0 - smoothstep(edge * 0.55, edge, depth);
    float foam2 = (1.0 - smoothstep(0.0, 0.12, abs(depth - edge * 1.6))) * 0.6;
    wc = mix(wc, vec3(0.97, 0.99, 1.0), clamp(foam + foam2, 0.0, 1.0) * 0.92);
    c = wc;
    alpha = mix(0.55, 0.92, smoothstep(0.0, 3.0, depth));
    alpha = max(alpha, foam * 0.95);
  }
  c = fogIt(c);
  gl_FragColor = vec4(c, alpha);
}`;

// 影用（太陽から見た深さを色に詰めて保存）
const SVS = `
attribute vec3 aPos; attribute float aSway; attribute vec4 aI0; attribute vec4 aI1;
uniform mat4 uLightVP; uniform mat4 uM; uniform float uTime; uniform vec4 uMisc; uniform vec3 uWind; uniform float uInst;
varying float vD;
void main(){
  vec3 P = aPos;
  if (uInst > 0.5) { float c = cos(aI0.w), s = sin(aI0.w); P = vec3(c * P.x + s * P.z, P.y, -s * P.x + c * P.z) * aI1.x + aI0.xyz; }
  vec4 w = uM * vec4(P, 1.0);
  float wave = uMisc.w;
  if (wave > 0.0) { w.y += ((sin(w.x * 0.13 + uTime * 1.4) + cos(w.z * 0.11 + uTime * 1.1)) * 0.16 + sin(w.x * 0.47 + w.z * 0.39 + uTime * 2.6) * 0.06) * wave; }
  if (aSway > 0.0) {
    float ph = w.x * 0.21 + w.z * 0.17;
    float gust = 0.55 + 0.45 * sin(uTime * 0.6 + w.x * 0.03 + w.z * 0.021);
    float s = (sin(uTime * 2.1 + ph) * 0.65 + sin(uTime * 3.9 + ph * 1.7) * 0.35 + 0.35) * gust * uWind.y * aSway;
    w.x += uWind.x * s; w.z += uWind.z * s; w.y -= abs(s) * 0.25;
  }
  gl_Position = uLightVP * w;
  vD = gl_Position.z * 0.5 + 0.5;
}`;
const SFS = `
precision highp float;
varying float vD;
void main(){
  vec4 e = fract(vec4(1.0, 255.0, 65025.0, 16581375.0) * clamp(vD, 0.0, 0.99999));
  e -= e.yzww * vec4(1.0 / 255.0, 1.0 / 255.0, 1.0 / 255.0, 0.0);
  gl_FragColor = e;
}`;

export class Renderer {
  constructor(canvas, opts = {}) {
    this.canvas = canvas;
    const attrs = { antialias: opts.antialias ?? true, alpha: !!opts.alpha, preserveDrawingBuffer: !!opts.preserve, powerPreference: 'high-performance' };
    let gl = canvas.getContext('webgl2', attrs);
    this.webgl2 = !!gl;
    if (!gl) { gl = canvas.getContext('webgl', attrs) || canvas.getContext('experimental-webgl', attrs); if (gl) gl.getExtension('OES_element_index_uint'); }
    if (!gl) throw new Error('WebGLが使用できません');
    this.gl = gl;
    this.pixelRatio = 1; this.time = 0; this.drawCalls = 0;
    this.outlines = opts.outlines ?? true;
    const prog = this._program(VS, FS);
    this.prog = prog;
    this.loc = {};
    for (const n of ['aPos', 'aNor', 'aCol', 'aOut', 'aSway', 'aI0', 'aI1']) this.loc[n] = gl.getAttribLocation(prog, n);
    // インスタンス描画（同じ形を大量に：木・岩・草）
    if (this.webgl2) this.inst = { draw: (m, c, t, o, n) => gl.drawElementsInstanced(m, c, t, o, n), div: (i, d) => gl.vertexAttribDivisor(i, d) };
    else { const ext = gl.getExtension('ANGLE_instanced_arrays'); if (ext) this.inst = { draw: (m, c, t, o, n) => ext.drawElementsInstancedANGLE(m, c, t, o, n), div: (i, d) => ext.vertexAttribDivisorANGLE(i, d) }; }
    for (const n of ['uVP', 'uM', 'uTime', 'uMisc', 'uWind', 'uColor', 'uEmis', 'uLight', 'uSun', 'uShadowC', 'uSky', 'uGround', 'uFogCol', 'uFog', 'uCam', 'uUnlit', 'uNoFog', 'uMat', 'uZenith', 'uHorizon', 'uCloud', 'uHMap', 'uHRect', 'uOut', 'uLightVP', 'uShadowMap', 'uShadowP', 'uInst']) this.loc[n] = gl.getUniformLocation(prog, n);
    this._initShadow(opts.shadowSize ?? 1024);
    gl.enable(gl.DEPTH_TEST); gl.enable(gl.CULL_FACE); gl.cullFace(gl.BACK);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    this._opaque = []; this._trans = []; this._sky = []; this._ol = [];
    // 高さマップ用（水面）のダミー
    this.dummyTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.dummyTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.LUMINANCE, 1, 1, 0, gl.LUMINANCE, gl.UNSIGNED_BYTE, new Uint8Array([0]));
    this.hmapTex = null; this.hmapSrc = null;
  }
  _program(vs, fs) {
    const gl = this.gl;
    const mk = (t, s) => { const sh = gl.createShader(t); gl.shaderSource(sh, s); gl.compileShader(sh); if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh)); return sh; };
    const p = gl.createProgram(); gl.attachShader(p, mk(gl.VERTEX_SHADER, vs)); gl.attachShader(p, mk(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    return p;
  }
  _initShadow(size) {
    const gl = this.gl;
    this.shadowOK = false; this.shadowSize = size;
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, this.dummyTex2 || (this.dummyTex2 = (() => { const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([255, 255, 255, 255])); return t; })()));
    gl.activeTexture(gl.TEXTURE0);
    if (!size) return;
    try {
      const hp = gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER, gl.HIGH_FLOAT);
      if (!hp || hp.precision < 16) return;
      this.sprog = this._program(SVS, SFS);
      const gp = this.sprog;
      this.sloc = { aPos: gl.getAttribLocation(gp, 'aPos'), aSway: gl.getAttribLocation(gp, 'aSway'), aI0: gl.getAttribLocation(gp, 'aI0'), aI1: gl.getAttribLocation(gp, 'aI1') };
      for (const n of ['uLightVP', 'uM', 'uTime', 'uMisc', 'uWind', 'uInst']) this.sloc[n] = gl.getUniformLocation(gp, n);
      this.stex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, this.stex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, size, size, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      this.sfbo = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.sfbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.stex, 0);
      const rb = gl.createRenderbuffer(); gl.bindRenderbuffer(gl.RENDERBUFFER, rb);
      gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, size, size);
      gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, rb);
      const ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.bindTexture(gl.TEXTURE_2D, null);
      this.lightVP = M4.ident(); this._lv = M4.ident(); this._lp = M4.ident();
      this.shadowOK = ok;
    } catch (e) { console.warn('shadow off', e); this.shadowOK = false; }
  }
  _renderShadow(scene, casters) {
    const gl = this.gl, sh = scene.shadow, L = this.sloc, size = this.shadowSize;
    const r = sh.radius || 40;
    const ld = scene.lightDir;
    M4.lookAt([ld[0] * 200, ld[1] * 200, ld[2] * 200], [0, 0, 0], Math.abs(ld[1]) > 0.98 ? [0, 0, 1] : [0, 1, 0], this._lv);
    const c = M4.apply(this._lv, sh.center[0], sh.center[1], sh.center[2]);
    const tx = 2 * r / size;
    const lx = Math.round(c[0] / tx) * tx, ly = Math.round(c[1] / tx) * tx, dc = -c[2];
    const depth = sh.depth || 160;
    M4.ortho(lx - r, lx + r, ly - r, ly + r, dc - depth, dc + depth, this._lp);
    M4.mul(this._lp, this._lv, this.lightVP);
    this._shadowDepth = depth * 2;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.sfbo);
    gl.viewport(0, 0, size, size);
    gl.clearColor(1, 1, 1, 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.useProgram(this.sprog);
    gl.uniformMatrix4fv(L.uLightVP, false, this.lightVP);
    gl.uniform1f(L.uTime, this.time);
    gl.uniform3fv(L.uWind, scene.wind);
    gl.disable(gl.CULL_FACE);
    for (const n of casters) {
      const b = this._buf(n.geo);
      gl.bindBuffer(gl.ARRAY_BUFFER, b.vb);
      gl.enableVertexAttribArray(L.aPos); gl.vertexAttribPointer(L.aPos, 3, gl.FLOAT, false, VSTRIDE * 4, 0);
      if (L.aSway >= 0) { gl.enableVertexAttribArray(L.aSway); gl.vertexAttribPointer(L.aSway, 1, gl.FLOAT, false, VSTRIDE * 4, 48); }
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, b.ib);
      gl.uniformMatrix4fv(L.uM, false, n.world);
      gl.uniform4f(L.uMisc, n.kind, 0, 0, n.wave);
      if (n.inst) { this._bindInst(n, L, true); gl.uniform1f(L.uInst, 1); this.inst.draw(gl.TRIANGLES, n.geo.count, b.type, 0, n.inst.count); this._unbindInst(L); gl.uniform1f(L.uInst, 0); }
      else gl.drawElements(gl.TRIANGLES, n.geo.count, b.type, 0);
      this.drawCalls++;
    }
    gl.enable(gl.CULL_FACE);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }
  _bindInst(n, L) {
    const gl = this.gl, I = n.inst;
    let b = I.buffers && I.buffers.get(gl);
    if (!b) { I.buffers = I.buffers || new Map(); b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, I.data, gl.STATIC_DRAW); I.buffers.set(gl, b); }
    gl.bindBuffer(gl.ARRAY_BUFFER, b);
    if (L.aI0 >= 0) { gl.enableVertexAttribArray(L.aI0); gl.vertexAttribPointer(L.aI0, 4, gl.FLOAT, false, 32, 0); this.inst.div(L.aI0, 1); }
    if (L.aI1 >= 0) { gl.enableVertexAttribArray(L.aI1); gl.vertexAttribPointer(L.aI1, 4, gl.FLOAT, false, 32, 16); this.inst.div(L.aI1, 1); }
  }
  _unbindInst(L) {
    const gl = this.gl;
    if (L.aI0 >= 0) { this.inst.div(L.aI0, 0); gl.disableVertexAttribArray(L.aI0); }
    if (L.aI1 >= 0) { this.inst.div(L.aI1, 0); gl.disableVertexAttribArray(L.aI1); }
  }
  setSize(w, h, pr = 1) {
    this.pixelRatio = pr;
    const W = Math.max(1, Math.floor(w * pr)), H = Math.max(1, Math.floor(h * pr));
    if (this.canvas.width !== W || this.canvas.height !== H) { this.canvas.width = W; this.canvas.height = H; }
    this.cssW = w; this.cssH = h;
  }
  _buf(geo) {
    const gl = this.gl;
    let b = geo.buffers.get(gl);
    if (!b) {
      b = { vb: gl.createBuffer(), ib: gl.createBuffer(), type: geo.index instanceof Uint32Array ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT };
      gl.bindBuffer(gl.ARRAY_BUFFER, b.vb); gl.bufferData(gl.ARRAY_BUFFER, geo.data, gl.STATIC_DRAW);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, b.ib); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, geo.index, gl.STATIC_DRAW);
      geo.buffers.set(gl, b);
    }
    return b;
  }
  _hmap(h) {
    const gl = this.gl;
    if (this.hmapSrc === h.data && this.hmapTex) return this.hmapTex;
    if (this.hmapTex) gl.deleteTexture(this.hmapTex);
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.LUMINANCE, h.w, h.h, 0, gl.LUMINANCE, gl.UNSIGNED_BYTE, h.data);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    this.hmapTex = t; this.hmapSrc = h.data;
    return t;
  }
  render(scene, cam, viewport = null) {
    const gl = this.gl, L = this.loc;
    const W = this.canvas.width, H = this.canvas.height;
    let vh = H;
    if (viewport) cam.aspect = viewport[2] / viewport[3]; else cam.aspect = W / H;
    if (viewport) vh = viewport[3];
    cam.update();
    scene.root.update(null);
    const op = this._opaque, tr = this._trans, sk = this._sky, ol = this._ol; op.length = 0; tr.length = 0; sk.length = 0; ol.length = 0;
    const cs = this._cast || (this._cast = []); cs.length = 0;
    const cc = scene.cullCenter, cr = scene.cullRadius;
    const cp = cam.pos;
    const doOl = this.outlines && scene.outline;
    const olD = scene.outlineDist;
    const sh = scene.shadow && this.shadowOK && (scene.shadow.strength ?? 1) > 0 ? scene.shadow : null;
    const sc = sh ? sh.center : null, sr = sh ? (sh.radius || 40) * 1.45 : 0;
    const walk = (n) => {
      if (!n.visible) return;
      if (n.geo) {
        let ok = true;
        const c = n.inst ? n.inst.center : n.geo.center, w = n.world;
        const x = w[0] * c[0] + w[4] * c[1] + w[8] * c[2] + w[12], y = w[1] * c[0] + w[5] * c[1] + w[9] * c[2] + w[13], z = w[2] * c[0] + w[6] * c[1] + w[10] * c[2] + w[14];
        const s = Math.max(Math.hypot(w[0], w[1], w[2]), Math.hypot(w[4], w[5], w[6]), Math.hypot(w[8], w[9], w[10]));
        const rad = (n.inst ? n.inst.radius : n.geo.radius) * s;
        if (cc && n.cull) { if (Math.hypot(x - cc[0], z - cc[2]) - rad > cr) ok = false; }
        if (sh && n.castShadow && !n.transparent && n.kind !== 1 && n.kind !== 2 && !n.unlit && Math.hypot(x - sc[0], z - sc[2]) - rad < sr && (!n.inst || this.inst)) cs.push(n);
        if (ok) {
          if (n.kind === 1) sk.push(n);
          else if (n.transparent) tr.push(n);
          else {
            op.push(n);
            if (doOl && n.outline > 0 && !n.unlit && Math.hypot(x - cp[0], y - cp[1], z - cp[2]) - rad < olD) { n._os = (n.inst ? n.geo.radius * n.inst.maxS : n.geo.radius) * s; ol.push(n); }
          }
        }
      }
      for (const c of n.children) walk(c);
    };
    walk(scene.root);
    this.drawCalls = 0;
    // 影
    this._shadowOn = false;
    if (sh && cs.length) { this._renderShadow(scene, cs); this._shadowOn = true; }
    if (viewport) gl.viewport(viewport[0], viewport[1], viewport[2], viewport[3]); else gl.viewport(0, 0, W, H);
    gl.clearColor(scene.bg[0], scene.bg[1], scene.bg[2], scene.bgAlpha ?? 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.useProgram(this.prog);
    gl.uniformMatrix4fv(L.uVP, false, cam.vp);
    gl.uniform1f(L.uTime, this.time);
    gl.uniform3fv(L.uLight, scene.lightDir); gl.uniform3fv(L.uSun, scene.sun); gl.uniform3fv(L.uShadowC, scene.shadowC); gl.uniform3fv(L.uSky, scene.sky); gl.uniform3fv(L.uGround, scene.ground);
    gl.uniform3fv(L.uFogCol, scene.fogColor); gl.uniform2f(L.uFog, scene.fogNear, scene.fogFar); gl.uniform3fv(L.uCam, cam.pos);
    gl.uniform3fv(L.uZenith, scene.zenith); gl.uniform3fv(L.uHorizon, scene.horizon); gl.uniform3fv(L.uWind, scene.wind);
    gl.uniform4fv(L.uCloud, scene.cloudShadow);
    gl.activeTexture(gl.TEXTURE1);
    if (this._shadowOn) {
      gl.bindTexture(gl.TEXTURE_2D, this.stex);
      gl.uniformMatrix4fv(L.uLightVP, false, this.lightVP);
      gl.uniform4f(L.uShadowP, 1, 1 / this.shadowSize, (sh.bias ?? 0.12) / this._shadowDepth, sh.strength ?? 1);
    } else {
      gl.bindTexture(gl.TEXTURE_2D, this.dummyTex2);
      gl.uniformMatrix4fv(L.uLightVP, false, M4_IDENT);
      gl.uniform4f(L.uShadowP, 0, 0, 0, 0);
    }
    gl.uniform1i(L.uShadowMap, 1);
    gl.activeTexture(gl.TEXTURE0);
    if (scene.hmap) { gl.bindTexture(gl.TEXTURE_2D, this._hmap(scene.hmap)); gl.uniform4f(L.uHRect, scene.hmap.x0, scene.hmap.z0, scene.hmap.cell, scene.hmap.w); }
    else { gl.bindTexture(gl.TEXTURE_2D, this.dummyTex); gl.uniform4f(L.uHRect, 0, 0, 1, 1); }
    gl.uniform1i(L.uHMap, 0);
    gl.uniform2f(L.uOut, 0, 0);
    gl.disable(gl.BLEND);
    if (sk.length) { gl.depthMask(false); for (const n of sk) this._draw(n); }
    gl.depthMask(true);
    for (const n of op) this._draw(n);
    // 輪郭線（裏面を少し膨らませて描く）
    if (ol.length) {
      const k = scene.outlinePx * this.pixelRatio * 2 * Math.tan(cam.fov / 2) / vh;
      gl.cullFace(gl.FRONT);
      // 輪郭線（裏面）を少し奥へずらし、関節の重なりなどで線が表に出ないように
      gl.enable(gl.POLYGON_OFFSET_FILL); gl.polygonOffset(1.5, 6);
      for (const n of ol) {
        const w = k * n.outline;
        gl.uniform2f(L.uOut, w, Math.max(0.004, n._os * 0.16 * Math.min(1.6, n.outline)));
        this._draw(n, true);
      }
      gl.disable(gl.POLYGON_OFFSET_FILL);
      gl.cullFace(gl.BACK);
      gl.uniform2f(L.uOut, 0, 0);
    }
    if (tr.length) {
      for (const n of tr) { const w = n.world; n._d = (n.renderOrder * 1e6) - Math.hypot(w[12] - cp[0], w[13] - cp[1], w[14] - cp[2]); }
      tr.sort((a, b) => a._d - b._d);
      gl.enable(gl.BLEND);
      for (const n of tr) { gl.depthMask(!n.noDepthWrite); this._draw(n); }
      gl.depthMask(true); gl.disable(gl.BLEND);
    }
  }
  _draw(n, outline = false) {
    const gl = this.gl, L = this.loc, b = this._buf(n.geo);
    const S = VSTRIDE * 4;
    gl.bindBuffer(gl.ARRAY_BUFFER, b.vb);
    gl.enableVertexAttribArray(L.aPos); gl.vertexAttribPointer(L.aPos, 3, gl.FLOAT, false, S, 0);
    if (L.aNor >= 0) { gl.enableVertexAttribArray(L.aNor); gl.vertexAttribPointer(L.aNor, 3, gl.FLOAT, false, S, 12); }
    if (L.aCol >= 0) { gl.enableVertexAttribArray(L.aCol); gl.vertexAttribPointer(L.aCol, 3, gl.FLOAT, false, S, 24); }
    if (L.aOut >= 0) { gl.enableVertexAttribArray(L.aOut); gl.vertexAttribPointer(L.aOut, 3, gl.FLOAT, false, S, 36); }
    if (L.aSway >= 0) { gl.enableVertexAttribArray(L.aSway); gl.vertexAttribPointer(L.aSway, 1, gl.FLOAT, false, S, 48); }
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, b.ib);
    gl.uniformMatrix4fv(L.uM, false, n.world);
    gl.uniform4fv(L.uColor, n.color);
    if (!outline) {
      gl.uniform3fv(L.uEmis, n.emis); gl.uniform4fv(L.uMat, n.mat);
      gl.uniform1f(L.uUnlit, n.unlit ? 1 : 0);
    }
    gl.uniform1f(L.uNoFog, n.noFog ? 1 : 0);
    gl.uniform4f(L.uMisc, n.kind, this._shadowOn && n.receiveShadow !== false ? 1 : 0, n.cloudShadow, n.wave);
    if (n.doubleSide && !outline) gl.disable(gl.CULL_FACE);
    if (n.inst) {
      this._bindInst(n, L); gl.uniform1f(L.uInst, 1);
      this.inst.draw(gl.TRIANGLES, n.geo.count, b.type, 0, n.inst.count);
      this._unbindInst(L); gl.uniform1f(L.uInst, 0);
    } else gl.drawElements(gl.TRIANGLES, n.geo.count, b.type, 0);
    if (n.doubleSide && !outline) gl.enable(gl.CULL_FACE);
    this.drawCalls++;
  }
}

// ---------- 共有プリミティブ ----------
export const PRIM = {};
export function initPrims() {
  if (PRIM.sphere) return PRIM;
  PRIM.sphere = new GeoBuilder().sphere(1, '#ffffff', 0, 0, 0, 12, 8).build();
  PRIM.sphereLo = new GeoBuilder().sphere(1, '#ffffff', 0, 0, 0, 8, 6).build();
  PRIM.box = new GeoBuilder().box(1, 1, 1, '#ffffff').build();
  PRIM.cyl = new GeoBuilder().cylinder(1, 1, 1, '#ffffff', 0, 0, 0, 10).build();      // 底 y=0 上 y=1
  PRIM.cylDown = new GeoBuilder().cylinder(1, 1, 1, '#ffffff', 0, -1, 0, 10).build(); // 上 y=0 底 y=-1（手足用）
  PRIM.taperDown = new GeoBuilder().cylinder(1, 0.7, 1, '#ffffff', 0, -1, 0, 10).build();
  PRIM.cone = new GeoBuilder().cone(1, 1, '#ffffff', 0, 0, 0, 10).build();
  PRIM.cone4 = new GeoBuilder().cone(1, 1, '#ffffff', 0, 0, 0, 4).build();
  PRIM.disc = new GeoBuilder().disc(1, '#ffffff', 0, 0, 0, 20).build();
  PRIM.roof = new GeoBuilder().roof(1, 1, 1, '#ffffff').build();
  // 羽・ヒレ用の薄い板（両面）
  const wb = new GeoBuilder();
  wb.quad([0, 0, -0.5], [1, 0, -0.5], [1, 0, 0.5], [0, 0, 0.5], '#ffffff');
  wb.quad([0, 0, 0.5], [1, 0, 0.5], [1, 0, -0.5], [0, 0, -0.5], '#ffffff');
  PRIM.plate = wb.build();
  // 三角の羽（先細り）
  const tb = new GeoBuilder();
  tb.quad([0, 0, -0.5], [1, 0, -0.1], [1, 0, 0.1], [0, 0, 0.5], '#ffffff');
  tb.quad([0, 0, 0.5], [1, 0, 0.1], [1, 0, -0.1], [0, 0, -0.5], '#ffffff');
  PRIM.wing = tb.build();
  // ダイヤ（光る石）
  const db = new GeoBuilder();
  db.cone(1, 1, '#ffffff', 0, 0, 0, 6);
  const m = M4.fromTRS([0, 0, 0], [Math.PI, 0, 0], [1, 1, 1]); db.setMatrix(m); db.cone(1, 1, '#ffffff', 0, 0, 0, 6); db.setMatrix(null);
  PRIM.gem = db.build();
  // 星（きらめき）
  const sb = new GeoBuilder();
  const pts = []; for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2, r = i % 2 ? 0.35 : 1; pts.push([Math.cos(a) * r, Math.sin(a) * r]); }
  for (let i = 0; i < 8; i++) { const p = pts[i], q = pts[(i + 1) % 8]; const a = sb._push(0, 0, 0, 0, 0, 1, [1, 1, 1]), b = sb._push(p[0], p[1], 0, 0, 0, 1, [1, 1, 1]), c = sb._push(q[0], q[1], 0, 0, 0, 1, [1, 1, 1]); sb.tri(a, b, c); sb.tri(a, c, b); }
  PRIM.star = sb.build();
  // トーラス（輪：天使の輪・マフラー用）
  const tor = new GeoBuilder(); const R = 1, rr = 0.18, S1 = 16, S2 = 6; const st = tor.vcount;
  for (let i = 0; i <= S1; i++) { const a = i / S1 * Math.PI * 2; for (let j = 0; j <= S2; j++) { const b = j / S2 * Math.PI * 2; const nx = Math.cos(a) * Math.cos(b), ny = Math.sin(b), nz = Math.sin(a) * Math.cos(b); tor._push(Math.cos(a) * (R + rr * Math.cos(b)), rr * Math.sin(b), Math.sin(a) * (R + rr * Math.cos(b)), nx, ny, nz, [1, 1, 1]); } }
  for (let i = 0; i < S1; i++) for (let j = 0; j < S2; j++) { const a = st + i * (S2 + 1) + j, b2 = a + S2 + 1; tor.tri(a, a + 1, b2); tor.tri(b2, a + 1, b2 + 1); }
  PRIM.torus = tor.build();
  // なめらかな球（顔・目）
  PRIM.sphereHi = new GeoBuilder().sphere(1, '#ffffff', 0, 0, 0, 18, 12).build();
  // しずく形（炎・毛先・耳・つの）  下 y=-1 〜 先端 y=2
  PRIM.drop = new GeoBuilder().lathe([[0, -1], [0.5, -0.87], [0.8, -0.6], [0.97, -0.25], [1, 0.05], [0.9, 0.45], [0.7, 0.9], [0.45, 1.35], [0.2, 1.72], [0.02, 2.0]], '#ffffff', 12).build();
  // 手足（角の丸い先細りの筒）  上 y=0 〜 下 y=-1
  PRIM.limb = new GeoBuilder().lathe([[0, -1.07], [0.45, -1.05], [0.68, -1.0], [0.76, -0.93], [0.88, -0.5], [1.0, -0.08], [0.92, 0.02], [0.62, 0.07], [0, 0.09]], '#ffffff', 10).build();
  // つの（先のとがった円すい・ふち丸め）
  PRIM.horn = new GeoBuilder().lathe([[0, 0], [0.8, 0.02], [1, 0.1], [0.82, 0.4], [0.55, 0.65], [0.3, 0.85], [0.02, 1.0]], '#ffffff', 10).build();
  // 葉っぱ・羽根・耳の内側用の両面の板（先がとがる）  x: 0〜1
  const lf = new GeoBuilder(); const LN = 8;
  lf.center([0.5, 0, 0]);
  for (const side of [1, -1]) {
    const st2 = lf.vcount;
    for (let i = 0; i <= LN; i++) {
      const t = i / LN, w = Math.pow(Math.sin(Math.PI * Math.min(1, t * 0.95 + 0.03)), 0.75) * 0.5, bend = Math.sin(Math.PI * t) * 0.08;
      lf._push(t, bend, -w, 0, side, 0, [1, 1, 1]); lf._push(t, bend + 0.04, 0, 0, side, 0, [1, 1, 1]); lf._push(t, bend, w, 0, side, 0, [1, 1, 1]);
    }
    for (let i = 0; i < LN; i++) {
      const a = st2 + i * 3;
      if (side > 0) { lf.tri(a, a + 1, a + 4); lf.tri(a, a + 4, a + 3); lf.tri(a + 1, a + 2, a + 5); lf.tri(a + 1, a + 5, a + 4); }
      else { lf.tri(a, a + 4, a + 1); lf.tri(a, a + 3, a + 4); lf.tri(a + 1, a + 5, a + 2); lf.tri(a + 1, a + 4, a + 5); }
    }
  }
  lf.center(null);
  PRIM.leaf = lf.build();
  // 半円の輪（口・まゆ）
  const ar = new GeoBuilder(); const AS = 10, AT = 5, ar0 = ar.vcount;
  for (let i = 0; i <= AS; i++) { const a = Math.PI + i / AS * Math.PI; for (let j = 0; j <= AT; j++) { const b = j / AT * Math.PI * 2; const nx = Math.cos(a) * Math.cos(b), ny = Math.sin(a) * Math.cos(b), nz = Math.sin(b); ar._push(Math.cos(a) * (1 + 0.2 * Math.cos(b)), Math.sin(a) * (1 + 0.2 * Math.cos(b)), 0.2 * Math.sin(b), nx, ny, nz, [1, 1, 1]); } }
  for (let i = 0; i < AS; i++) for (let j = 0; j < AT; j++) { const a = ar0 + i * (AT + 1) + j, b2 = a + AT + 1; ar.tri(a, b2, a + 1); ar.tri(a + 1, b2, b2 + 1); }
  PRIM.arc = ar.build();
  return PRIM;
}
export function mesh(geo, color = '#ffffff', opts = {}) { return new Node(geo, { ...opts, color }); }
