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
let GEO_ID = 1;
export class Geometry {
  constructor(data, index) {
    this.id = GEO_ID++;
    this.data = data;   // Float32Array interleaved pos(3) nor(3) col(3)
    this.index = index; // Uint16Array | Uint32Array
    this.count = index.length;
    this.buffers = new Map();
    // 境界球（カリング用）
    let minx = 1e9, miny = 1e9, minz = 1e9, maxx = -1e9, maxy = -1e9, maxz = -1e9;
    for (let i = 0; i < data.length; i += 9) {
      const x = data[i], y = data[i + 1], z = data[i + 2];
      if (x < minx) minx = x; if (x > maxx) maxx = x; if (y < miny) miny = y; if (y > maxy) maxy = y; if (z < minz) minz = z; if (z > maxz) maxz = z;
    }
    this.center = [(minx + maxx) / 2, (miny + maxy) / 2, (minz + maxz) / 2];
    this.radius = Math.hypot(maxx - minx, maxy - miny, maxz - minz) / 2;
  }
  dispose() {
    for (const [gl, b] of this.buffers) { gl.deleteBuffer(b.vb); gl.deleteBuffer(b.ib); }
    this.buffers.clear();
  }
}

export class GeoBuilder {
  constructor() { this.v = []; this.i = []; this.mat = null; }
  get vcount() { return this.v.length / 9; }
  setMatrix(m) { this.mat = m; return this; }
  _push(x, y, z, nx, ny, nz, c) {
    if (this.mat) {
      const p = M4.apply(this.mat, x, y, z), n = M4.applyDir(this.mat, nx, ny, nz);
      const l = Math.hypot(n[0], n[1], n[2]) || 1;
      this.v.push(p[0], p[1], p[2], n[0] / l, n[1] / l, n[2] / l, c[0], c[1], c[2]);
    } else this.v.push(x, y, z, nx, ny, nz, c[0], c[1], c[2]);
    return this.vcount - 1;
  }
  tri(a, b, c) { this.i.push(a, b, c); }
  // 平面四角形（フラット法線）
  quad(p0, p1, p2, p3, col) {
    col = hexToRgb(col);
    const ux = p1[0] - p0[0], uy = p1[1] - p0[1], uz = p1[2] - p0[2], vx = p3[0] - p0[0], vy = p3[1] - p0[1], vz = p3[2] - p0[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
    // p0→p1→p2→p3 を表から見て反時計回りで指定
    const a = this._push(...p0, nx, ny, nz, col), b = this._push(...p1, nx, ny, nz, col), c = this._push(...p2, nx, ny, nz, col), d = this._push(...p3, nx, ny, nz, col);
    this.tri(a, b, c); this.tri(a, c, d);
    return this;
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
    for (const f of faces) {
      const n = f[4];
      const a = this._push(...f[0], ...n, col), b = this._push(...f[1], ...n, col), c = this._push(...f[2], ...n, col), e = this._push(...f[3], ...n, col);
      this.tri(a, b, c); this.tri(a, c, e);
    }
    return this;
  }
  sphere(r, col, ox = 0, oy = 0, oz = 0, seg = 10, rings = 7, sy = 1, col2 = null) {
    col = hexToRgb(col); const c2 = col2 ? hexToRgb(col2) : null;
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
    return this;
  }
  // 底面 y=oy, 上面 y=oy+h
  cylinder(rt, rb, h, col, ox = 0, oy = 0, oz = 0, seg = 8, caps = true, colTop = null) {
    col = hexToRgb(col); const ct = colTop ? hexToRgb(colTop) : col;
    const start = this.vcount; const slope = (rb - rt) / h;
    for (let i = 0; i <= seg; i++) {
      const th = i / seg * Math.PI * 2, cs = Math.cos(th), sn = Math.sin(th);
      const l = Math.hypot(1, slope);
      this._push(ox + cs * rb, oy, oz + sn * rb, cs / l, slope / l, sn / l, col);
      this._push(ox + cs * rt, oy + h, oz + sn * rt, cs / l, slope / l, sn / l, ct);
    }
    for (let i = 0; i < seg; i++) { const a = start + i * 2; this.tri(a, a + 1, a + 2); this.tri(a + 2, a + 1, a + 3); }
    if (caps) {
      if (rt > 0.001) { const c = this._push(ox, oy + h, oz, 0, 1, 0, ct); const s = this.vcount; for (let i = 0; i <= seg; i++) { const th = i / seg * Math.PI * 2; this._push(ox + Math.cos(th) * rt, oy + h, oz + Math.sin(th) * rt, 0, 1, 0, ct); } for (let i = 0; i < seg; i++) this.tri(c, s + i + 1, s + i); }
      if (rb > 0.001) { const c = this._push(ox, oy, oz, 0, -1, 0, col); const s = this.vcount; for (let i = 0; i <= seg; i++) { const th = i / seg * Math.PI * 2; this._push(ox + Math.cos(th) * rb, oy, oz + Math.sin(th) * rb, 0, -1, 0, col); } for (let i = 0; i < seg; i++) this.tri(c, s + i, s + i + 1); }
    }
    return this;
  }
  cone(r, h, col, ox = 0, oy = 0, oz = 0, seg = 8) { return this.cylinder(0.0001, r, h, col, ox, oy, oz, seg, true); }
  // 円盤（上向き）
  disc(r, col, ox = 0, oy = 0, oz = 0, seg = 16) {
    col = hexToRgb(col); const c = this._push(ox, oy, oz, 0, 1, 0, col); const s = this.vcount;
    for (let i = 0; i <= seg; i++) { const th = i / seg * Math.PI * 2; this._push(ox + Math.cos(th) * r, oy, oz + Math.sin(th) * r, 0, 1, 0, col); }
    for (let i = 0; i < seg; i++) this.tri(c, s + i + 1, s + i);
    return this;
  }
  // 三角柱の屋根（x方向に棟）
  roof(w, h, d, col, ox = 0, oy = 0, oz = 0) {
    col = hexToRgb(col);
    const x0 = ox - w / 2, x1 = ox + w / 2, z0 = oz - d / 2, z1 = oz + d / 2, y0 = oy, y1 = oy + h;
    this.quad([x0, y0, z1], [x1, y0, z1], [x1, y1, oz], [x0, y1, oz], col);
    this.quad([x1, y0, z0], [x0, y0, z0], [x0, y1, oz], [x1, y1, oz], col);
    const n1 = [1, 0, 0], n0 = [-1, 0, 0];
    let a = this._push(x1, y0, z0, ...n1, col), b = this._push(x1, y1, oz, ...n1, col), c = this._push(x1, y0, z1, ...n1, col); this.tri(a, b, c);
    a = this._push(x0, y0, z1, ...n0, col); b = this._push(x0, y1, oz, ...n0, col); c = this._push(x0, y0, z0, ...n0, col); this.tri(a, b, c);
    return this;
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

// ---------- シーングラフ ----------
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
    this.lightDir = norm3([0.4, 0.85, 0.35]);
    this.sun = [0.66, 0.63, 0.57]; this.sky = [0.46, 0.5, 0.58]; this.ground = [0.26, 0.25, 0.24];
    this.cullCenter = null; this.cullRadius = 1e9;
  }
  add(...n) { this.root.add(...n); return this; }
}
export function norm3(v) { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; }

export class Camera {
  constructor(fov = 45) { this.fov = fov * Math.PI / 180; this.near = 0.5; this.far = 600; this.pos = [0, 30, 30]; this.target = [0, 0, 0]; this.aspect = 1; this.view = M4.ident(); this.proj = M4.ident(); this.vp = M4.ident(); }
  update() { M4.lookAt(this.pos, this.target, [0, 1, 0], this.view); M4.perspective(this.fov, this.aspect, this.near, this.far, this.proj); M4.mul(this.proj, this.view, this.vp); }
  project(p, w, h) {
    const m = this.vp; const x = m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12], y = m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13], ww = m[3] * p[0] + m[7] * p[1] + m[11] * p[2] + m[15];
    return [(x / ww * 0.5 + 0.5) * w, (1 - (y / ww * 0.5 + 0.5)) * h, ww];
  }
}

const VS = `
attribute vec3 aPos; attribute vec3 aNor; attribute vec3 aCol;
uniform mat4 uVP; uniform mat4 uM; uniform float uTime; uniform float uWave;
varying vec3 vCol; varying vec3 vNor; varying vec3 vW;
void main(){
  vec4 w = uM * vec4(aPos, 1.0);
  if (uWave > 0.0) { w.y += (sin(w.x * 0.13 + uTime * 1.4) + cos(w.z * 0.11 + uTime * 1.1)) * 0.18 * uWave; }
  if (uWave < 0.0) { float s = max(aPos.y, 0.0) * -uWave; w.x += sin(uTime * 2.2 + w.z * 0.35 + w.x * 0.1) * 0.12 * s; w.z += cos(uTime * 1.8 + w.x * 0.3) * 0.08 * s; }
  vW = w.xyz; vNor = (uM * vec4(aNor, 0.0)).xyz; vCol = aCol;
  gl_Position = uVP * w;
}`;
const FS = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform vec4 uColor; uniform vec3 uEmis; uniform vec3 uLight; uniform vec3 uSun; uniform vec3 uSky; uniform vec3 uGround;
uniform vec3 uFogCol; uniform vec2 uFog; uniform vec3 uCam; uniform float uUnlit; uniform float uNoFog;
varying vec3 vCol; varying vec3 vNor; varying vec3 vW;
void main(){
  vec3 base = vCol * uColor.rgb;
  vec3 c = base;
  if (uUnlit < 0.5) {
    vec3 n = normalize(vNor);
    float d = max(dot(n, uLight), 0.0);
    d = smoothstep(0.02, 0.4, d) * 0.72 + d * 0.28;
    vec3 amb = mix(uGround, uSky, n.y * 0.5 + 0.5);
    c = base * (amb + uSun * d);
  }
  c += uEmis;
  if (uNoFog < 0.5) {
    float f = clamp((length(vW - uCam) - uFog.x) / (uFog.y - uFog.x), 0.0, 1.0);
    c = mix(c, uFogCol, f);
  }
  gl_FragColor = vec4(c, uColor.a);
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
    const prog = this._program(VS, FS);
    this.prog = prog;
    this.loc = {};
    for (const n of ['aPos', 'aNor', 'aCol']) this.loc[n] = gl.getAttribLocation(prog, n);
    for (const n of ['uVP', 'uM', 'uTime', 'uWave', 'uColor', 'uEmis', 'uLight', 'uSun', 'uSky', 'uGround', 'uFogCol', 'uFog', 'uCam', 'uUnlit', 'uNoFog']) this.loc[n] = gl.getUniformLocation(prog, n);
    gl.enable(gl.DEPTH_TEST); gl.enable(gl.CULL_FACE); gl.cullFace(gl.BACK);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    this._opaque = []; this._trans = [];
  }
  _program(vs, fs) {
    const gl = this.gl;
    const mk = (t, s) => { const sh = gl.createShader(t); gl.shaderSource(sh, s); gl.compileShader(sh); if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh)); return sh; };
    const p = gl.createProgram(); gl.attachShader(p, mk(gl.VERTEX_SHADER, vs)); gl.attachShader(p, mk(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    return p;
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
  render(scene, cam, viewport = null) {
    const gl = this.gl, L = this.loc;
    const W = this.canvas.width, H = this.canvas.height;
    if (viewport) { gl.viewport(viewport[0], viewport[1], viewport[2], viewport[3]); cam.aspect = viewport[2] / viewport[3]; }
    else { gl.viewport(0, 0, W, H); cam.aspect = W / H; }
    cam.update();
    gl.clearColor(scene.bg[0], scene.bg[1], scene.bg[2], scene.bgAlpha ?? 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.useProgram(this.prog);
    gl.uniformMatrix4fv(L.uVP, false, cam.vp);
    gl.uniform1f(L.uTime, this.time);
    gl.uniform3fv(L.uLight, scene.lightDir); gl.uniform3fv(L.uSun, scene.sun); gl.uniform3fv(L.uSky, scene.sky); gl.uniform3fv(L.uGround, scene.ground);
    gl.uniform3fv(L.uFogCol, scene.fogColor); gl.uniform2f(L.uFog, scene.fogNear, scene.fogFar); gl.uniform3fv(L.uCam, cam.pos);
    scene.root.update(null);
    const op = this._opaque, tr = this._trans; op.length = 0; tr.length = 0;
    const cc = scene.cullCenter, cr = scene.cullRadius;
    const walk = (n) => {
      if (!n.visible) return;
      if (n.geo) {
        let ok = true;
        if (cc && n.cull) {
          const c = n.geo.center, w = n.world;
          const x = w[0] * c[0] + w[4] * c[1] + w[8] * c[2] + w[12], z = w[2] * c[0] + w[6] * c[1] + w[10] * c[2] + w[14];
          const s = Math.max(Math.abs(w[0]), Math.abs(w[5]), Math.abs(w[10]));
          if (Math.hypot(x - cc[0], z - cc[2]) - n.geo.radius * s > cr) ok = false;
        }
        if (ok) { if (n.transparent) tr.push(n); else op.push(n); }
      }
      for (const c of n.children) walk(c);
    };
    walk(scene.root);
    this.drawCalls = 0;
    gl.disable(gl.BLEND); gl.depthMask(true);
    for (const n of op) this._draw(n);
    if (tr.length) {
      const cp = cam.pos;
      for (const n of tr) { const w = n.world; n._d = (n.renderOrder * 1e6) - Math.hypot(w[12] - cp[0], w[13] - cp[1], w[14] - cp[2]); }
      tr.sort((a, b) => a._d - b._d);
      gl.enable(gl.BLEND);
      for (const n of tr) { gl.depthMask(!n.noDepthWrite); this._draw(n); }
      gl.depthMask(true); gl.disable(gl.BLEND);
    }
  }
  _draw(n) {
    const gl = this.gl, L = this.loc, b = this._buf(n.geo);
    gl.bindBuffer(gl.ARRAY_BUFFER, b.vb);
    gl.enableVertexAttribArray(L.aPos); gl.vertexAttribPointer(L.aPos, 3, gl.FLOAT, false, 36, 0);
    if (L.aNor >= 0) { gl.enableVertexAttribArray(L.aNor); gl.vertexAttribPointer(L.aNor, 3, gl.FLOAT, false, 36, 12); }
    gl.enableVertexAttribArray(L.aCol); gl.vertexAttribPointer(L.aCol, 3, gl.FLOAT, false, 36, 24);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, b.ib);
    gl.uniformMatrix4fv(L.uM, false, n.world);
    gl.uniform4fv(L.uColor, n.color); gl.uniform3fv(L.uEmis, n.emis);
    gl.uniform1f(L.uUnlit, n.unlit ? 1 : 0); gl.uniform1f(L.uWave, n.wave); gl.uniform1f(L.uNoFog, n.noFog ? 1 : 0);
    if (n.doubleSide) gl.disable(gl.CULL_FACE);
    gl.drawElements(gl.TRIANGLES, n.geo.count, b.type, 0);
    if (n.doubleSide) gl.enable(gl.CULL_FACE);
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
  return PRIM;
}
export function mesh(geo, color = '#ffffff', opts = {}) { return new Node(geo, { ...opts, color }); }
