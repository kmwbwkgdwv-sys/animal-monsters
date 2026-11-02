// =============================================================
//  アニモン・人物のモデル（スカルプトによるアニメ調の造形）
//   ・体・頭・手足は「なめらかにくっつく形」から作る（ぬいぐるみ／アニメのような丸み）
//   ・目は表面にぴったり貼るアニメ調の瞳（ハイライト・まつ毛・グラデーション）
//   ・進化前はチビキャラ、最終進化は頭身が上がって前のめりのかっこいい姿
//   ・しなる尻尾、ゆらめく炎、はねる耳、伸び縮みする待機モーション
// =============================================================
import { Node, PRIM, initPrims, hexToRgb, shiftHue, mixRgb, MAT, GeoBuilder, M4, treeBounds } from '../engine/gl3d.js';
import { DESIGN } from '../data/designs.js';
import { SPECIES } from '../data/species.js';
import { TYPE_BODY } from '../data/types.js';
import { mulberry32 } from '../engine/util.js';
import { Part, sph, ell, cap, box, tor, decalFrame, decalGeo, ellipse2, arc2, line2 } from './sculpt.js';

const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const mix = (a, b, t) => mixRgb(a, b, t);
const lum = (c) => c[0] * 0.3 + c[1] * 0.55 + c[2] * 0.15;
const EYE_DARK = [0.1, 0.07, 0.16], WHITE = [1, 1, 1], MOUTH = [0.36, 0.1, 0.14];
const IRIS = {
  fire: [0.98, 0.5, 0.1], water: [0.1, 0.5, 1], grass: [0.2, 0.72, 0.3], electric: [0.98, 0.72, 0.08], psychic: [0.86, 0.28, 0.82],
  dark: [0.9, 0.16, 0.24], ghost: [0.6, 0.36, 1], dragon: [1, 0.7, 0.06], ice: [0.3, 0.8, 1], fairy: [0.98, 0.4, 0.72],
  poison: [0.7, 0.26, 0.9], steel: [0.36, 0.6, 0.92], rock: [0.78, 0.48, 0.18], ground: [0.7, 0.44, 0.14], fighting: [0.92, 0.3, 0.16],
  normal: [0.5, 0.3, 0.16], flying: [0.22, 0.58, 1], bug: [0.36, 0.72, 0.14],
};

function sat(c, ds = 0.1, dl = 0) { return shiftHue(c, 0, ds, dl); }
export function speciesColors(sp, shiny) {
  const tb = TYPE_BODY[sp.types[0]];
  let c1 = hexToRgb(sp.color ? sp.color[0] : tb[0]);
  let c2 = hexToRgb(sp.color ? sp.color[1] : (sp.types[1] ? TYPE_BODY[sp.types[1]][0] : tb[1]));
  if (shiny) {
    c1 = shiftHue(c1, 0.43, 0.12, 0.02); c2 = shiftHue(c2, 0.5, 0.1, 0.04);
    if (Math.abs(c1[0] - c1[1]) < 0.05 && Math.abs(c1[1] - c1[2]) < 0.05) c1 = [0.95, 0.8, 0.3]; // 無彩色は金色に
  }
  // アニメらしく少し鮮やかに
  c1 = sat(c1, 0.12, 0.02); c2 = sat(c2, 0.1, 0.03);
  return { c1, c2, dark: mix(c1, [0.08, 0.04, 0.12], 0.5), light: mix(c1, [1, 1, 1], 0.55) };
}

// ---------------- 詳細度・キャッシュ ----------------
// 数字が大きいほど粗い（三角形が少ない）
export const MODEL_LOD = { hi: 1, mid: 1.4, low: 1.9 };
let defaultLod = 'hi';
export function setModelDetail(light) { defaultLod = light ? 'mid' : 'hi'; }
export function modelDetail() { return defaultLod; }
const TPL = new Map();
const TPL_MAX = 40;

export function buildAnimon(spId, shiny = false, opts = {}) {
  initPrims();
  let lod = opts.lod || defaultLod;
  if (defaultLod !== 'hi' && lod === 'hi') lod = defaultLod;
  if (defaultLod === 'mid' && lod === 'mid' && opts.lod === 'mid') lod = 'low';
  const key = spId + (shiny ? 's' : 'n') + lod;
  let T = TPL.get(key);
  if (!T) {
    T = buildTemplate(spId, shiny, MODEL_LOD[lod] || 1);
    T.t = 0; T.blink = 2; T.hop = 2;
    if (opts.noCache) return T;
    TPL.set(key, T);
    if (TPL.size > TPL_MAX) TPL.delete(TPL.keys().next().value);
  } else { TPL.delete(key); TPL.set(key, T); }
  const M = cloneRig(T);
  M.t = Math.random() * 10; M.blink = 1 + Math.random() * 3; M.hop = 1 + Math.random() * 3;
  return M;
}
// 先に作っておく（読み込み中・待ち時間に）
export function prewarmAnimon(spId, shiny = false, lod) { buildAnimon(spId, shiny, { lod }); }

const SKIP = new Set(['parent', 'children', 'world', 'local', 'geo', '_r0', '_emis0', '_os', '_d']);
function cloneTree(n, map) {
  const c = new Node(n.geo);
  for (const k of Object.keys(n)) {
    if (SKIP.has(k)) continue;
    const v = n[k];
    c[k] = Array.isArray(v) ? v.slice() : v;
  }
  map.set(n, c);
  for (const ch of n.children) c.add(cloneTree(ch, map));
  return c;
}
function cloneRig(T) {
  const map = new Map();
  cloneTree(T.root, map);
  const M = {};
  const mp = (x) => (x instanceof Node ? (map.get(x) || x) : Array.isArray(x) ? x.map(mp) : x);
  for (const [k, v] of Object.entries(T)) M[k] = (v instanceof Node || Array.isArray(v)) ? mp(v) : v;
  return M;
}

// ---------------- 組み立て用の道具 ----------------
// パーツの種類ごとの細かさ：最小セル と 大きさに対する分割数の上限
const CELL = { body: 0.03, head: 0.021, limb: 0.02, small: 0.014, tiny: 0.01 };
const RES = { body: 34, head: 30, limb: 20, small: 17, tiny: 14 };
class Kit {
  constructor(sp, shiny, q, D = {}) {
    this.sp = sp; this.q = q; this.T = sp.types; this.d = D;
    const { c1, c2, dark, light } = speciesColors(sp, shiny);
    this.c1 = c1; this.c2 = c2; this.dark = dark; this.light = light;
    this.belly = lum(c2) > lum(c1) + 0.08 ? mix(c2, WHITE, 0.15) : mix(c1, WHITE, 0.62);
    this.muzzle = mix(this.belly, WHITE, 0.35);
    this.sock = lum(c1) > 0.75 ? mix(c1, [0.15, 0.1, 0.2], 0.35) : mix(c1, [0.05, 0.03, 0.1], 0.35);
    this.r = mulberry32(sp.id * 977 + 13);
    this.f = { ...(sp.feats || {}) };
    this.ex = new Set(this.f.extra || []);
    // 成長段階 0（ちびっこ）〜1（最終進化・伝説）
    this.st = sp.legend ? 1 : sp.stages === 1 ? 0.62 : sp.stages === 2 ? [0.2, 0.86][sp.stage - 1] : [0, 0.52, 1][sp.stage - 1];
    const T = this.T;
    const fierce0 = !!(sp.legend || (this.st >= 0.85 && (sp.stage >= 3 || T.some(t => ['dark', 'dragon', 'fighting', 'steel', 'rock', 'fire', 'poison'].includes(t)))) || (sp.stage >= 2 && T.includes('dark')));
    this.eyeStyle = D.eye || (fierce0 ? 'sharp' : ((T.includes('ghost') || T.includes('psychic')) && sp.stage >= 2 ? 'sleepy' : 'cute'));
    // 顔つき：目の種類と成長段階から「かわいい」「いかつい」を決める
    this.fierce = D.eye ? (sp.legend || (['angry', 'sharp', 'glow'].includes(D.eye) && this.st >= 0.45)) : fierce0;
    this.cute = ['cute', 'dot', 'round'].includes(this.eyeStyle) || (this.eyeStyle === 'sleepy' && this.st < 0.5);
    this.mouth = D.mouth || (this.cute ? 'cat' : this.fierce ? 'fang' : 'smile');
    for (const p of D.pat || []) this.ex.add(p);
    this.iris = IRIS[T[0]] || IRIS.normal;
    this.glow = T.includes('fire') ? [1, 0.55, 0.15] : T.includes('electric') ? [1, 0.95, 0.3] : T.includes('ghost') ? [0.6, 0.5, 1] : T.includes('psychic') ? [1, 0.5, 0.85] : T.includes('water') ? [0.4, 0.85, 1] : [0.6, 0.95, 1];
    this.hornCol = T.includes('steel') ? [0.86, 0.9, 0.97] : T.includes('fire') ? [1, 0.86, 0.42] : T.includes('ice') ? [0.85, 0.97, 1] : T.includes('dark') ? [0.3, 0.26, 0.36] : [0.99, 0.94, 0.8];
    this.metal = T.includes('fire') ? [0.92, 0.62, 0.22] : [0.78, 0.82, 0.9];
    this.slit = T.includes('dragon') || (this.fierce && (T.includes('fire') || T.includes('dark') || T.includes('poison'))) || sp.plan === 'serpent';
  }
  cell(kind) { return CELL[kind] * this.q; }
  mesh(part, kind = 'body') {
    const bb = part.bounds();
    const ext = Math.max(bb[3] - bb[0], bb[4] - bb[1], bb[5] - bb[2]);
    // いちばん細い形がつぶれないように（太さの 1/1.7 以下のセル）
    let feat = 1e9;
    for (const sh of part.shapes) feat = Math.min(feat, sh.t === 1 ? Math.max(sh.ra, sh.rb) * (sh.sc ? sh.scMin : 1) : sh.t === 0 ? Math.min(...sh.r) * (sh.sc ? sh.scMin : 1) : sh.t === 2 ? Math.min(...sh.h) : sh.rr);
    const cell = Math.max(Math.min(Math.max(CELL[kind], ext / RES[kind]), feat / 1.5), ext / 44, 0.006);
    return part.mesh(cell * this.q);
  }
  add(parent, geo, opts = {}) { const n = new Node(geo, { mat: MAT.char, ...opts }); parent.add(n); return n; }
  prim(parent, geo, color, pos, scl, rot, o = {}) {
    const n = new Node(geo, { color, mat: MAT.char, ...o });
    if (pos) n.setPos(pos[0], pos[1], pos[2]);
    if (scl) n.setScale(scl[0], scl[1] ?? scl[0], scl[2] ?? scl[0]);
    if (rot) n.setRot(rot[0], rot[1], rot[2]);
    parent.add(n);
    return n;
  }
  joint(parent, pos, rot) { const n = new Node(); n.setPos(pos[0], pos[1], pos[2]); if (rot) n.setRot(rot[0], rot[1], rot[2]); parent.add(n); return n; }
}

// フレーム（u,v,n）から ノードの回転（Ry*Rx*Rz）を求める
function eulerFrom(u, v, n) {
  const rx = Math.asin(clamp(-n[1], -1, 1));
  const ry = Math.atan2(n[0], n[2]);
  const rz = Math.atan2(u[1], v[1]);
  return [rx, ry, rz];
}

// ---------------- 目（アニメ調・表面に貼る） ----------------
function eyeLayers(K, E, side, style, iris) {
  const L = [];
  const irisD = mix(iris, [0.02, 0, 0.12], 0.6), irisL = mix(iris, WHITE, 0.42), pupil = mix(iris, [0, 0, 0.05], 0.88);
  const lash = EYE_DARK;
  let o = 0.0012;
  const nx = () => (o += 0.0016);
  if (style === 'cute') {
    L.push({ pts: ellipse2(0, 0, 0.5 * E, 0.6 * E, 30), col: lash, off: nx() });
    L.push({ pts: ellipse2(0, -0.02 * E, 0.43 * E, 0.53 * E, 30), col: WHITE, off: nx() });
    L.push({ pts: ellipse2(0, -0.05 * E, 0.37 * E, 0.48 * E, 30), col: iris, off: nx() });
    // 上半分を濃く（アニメの瞳のグラデーション）
    const top = []; for (let i = 0; i <= 16; i++) { const a = i / 16 * Math.PI; top.push([Math.cos(a) * 0.37 * E, -0.05 * E + Math.sin(a) * 0.48 * E]); }
    for (let i = 1; i < 8; i++) { const t = i / 8; top.push([lerp(-0.37, 0.37, t) * E, -0.05 * E - Math.sin(t * Math.PI) * 0.1 * E + 0.04 * E]); }
    L.push({ pts: top.reverse(), col: irisD, off: nx() });
    L.push({ pts: ellipse2(0, -0.34 * E, 0.24 * E, 0.12 * E, 16), col: irisL, off: nx() });
    L.push({ pts: ellipse2(0, -0.04 * E, K.slit ? 0.07 * E : 0.17 * E, 0.27 * E, 18), col: pupil, off: nx() });
    L.push({ pts: ellipse2(-0.13 * E, 0.17 * E, 0.13 * E, 0.17 * E, 16, 0.4), col: WHITE, off: nx() });
    L.push({ pts: ellipse2(0.14 * E, -0.24 * E, 0.065 * E, 0.065 * E, 12), col: WHITE, off: o });
    L.push({ pts: ellipse2(0.02 * E, 0.3 * E, 0.04 * E, 0.04 * E, 10), col: mix(WHITE, iris, 0.2), off: o });
    // まつ毛（上のふち）＋ 目じりのはね
    L.push({ ...arc2(0, -0.02 * E, 0.45 * E, 0.55 * E, Math.PI * (side > 0 ? 0.98 : 0.02), Math.PI * (side > 0 ? 0.05 : 0.95), 0.12 * E, 16, (t) => 0.55 + 0.45 * Math.sin(Math.PI * t) + (t > 0.85 ? 0.3 : 0)), col: lash, off: nx() });
    L.push({ ...line2([[side * 0.4 * E, 0.3 * E], [side * 0.56 * E, 0.42 * E], [side * 0.62 * E, 0.5 * E]], 0.09 * E, (t) => 1 - t * 0.85), col: lash, off: o });
  } else if (style === 'dot') {
    // つぶらな瞳（黒目だけ・大きなハイライト）
    L.push({ pts: ellipse2(0, 0, 0.32 * E, 0.42 * E, 24), col: mix(iris, EYE_DARK, 0.86), off: nx() });
    L.push({ pts: ellipse2(0, -0.15 * E, 0.22 * E, 0.19 * E, 18), col: mix(iris, EYE_DARK, 0.45), off: nx() });
    L.push({ pts: ellipse2(-0.1 * E, 0.14 * E, 0.12 * E, 0.14 * E, 14), col: WHITE, off: nx() });
    L.push({ pts: ellipse2(0.11 * E, -0.17 * E, 0.05 * E, 0.05 * E, 10), col: WHITE, off: o });
  } else if (style === 'round') {
    // まんまるの目（白目が大きく、黒目は小さめ）
    L.push({ pts: ellipse2(0, 0, 0.5 * E, 0.5 * E, 30), col: lash, off: nx() });
    L.push({ pts: ellipse2(0, 0, 0.44 * E, 0.44 * E, 30), col: WHITE, off: nx() });
    L.push({ pts: ellipse2(side * 0.05 * E, -0.03 * E, 0.26 * E, 0.28 * E, 22), col: iris, off: nx() });
    L.push({ pts: ellipse2(side * 0.05 * E, -0.03 * E, 0.15 * E, 0.17 * E, 18), col: pupil, off: nx() });
    L.push({ pts: ellipse2(side * 0.05 * E - 0.08 * E, 0.08 * E, 0.08 * E, 0.09 * E, 12), col: WHITE, off: nx() });
  } else if (style === 'glow') {
    // 光る切れ長の目（白目なし）
    const cut = (x) => 0.12 * E + side * x * 0.35;
    L.push({ pts: ellipse2(0, 0, 0.56 * E, 0.32 * E, 28).map(([x, y]) => [x, Math.min(y, cut(x))]), col: mix(iris, EYE_DARK, 0.75), off: nx() });
    L.push({ pts: ellipse2(0, -0.02 * E, 0.47 * E, 0.23 * E, 26).map(([x, y]) => [x, Math.min(y, cut(x) - 0.04 * E)]), col: mix(iris, WHITE, 0.2), off: nx() });
    L.push({ pts: ellipse2(0, -0.04 * E, 0.22 * E, 0.11 * E, 18), col: mix(iris, WHITE, 0.75), off: nx() });
  } else if (style === 'compound') {
    // 虫の複眼（つやつや＋小さな粒）
    L.push({ pts: ellipse2(0, 0, 0.55 * E, 0.62 * E, 30), col: mix(iris, EYE_DARK, 0.78), off: nx() });
    L.push({ pts: ellipse2(0, -0.06 * E, 0.45 * E, 0.5 * E, 30), col: mix(iris, EYE_DARK, 0.45), off: nx() });
    for (let i = 0; i < 5; i++) for (let k = 0; k < 5; k++) { const x = (i - 2) * 0.16 * E + (k % 2) * 0.08 * E, y = (k - 2) * 0.17 * E - 0.05 * E; if ((x * x) / (0.38 * E) ** 2 + (y * y) / (0.44 * E) ** 2 > 1) continue; L.push({ pts: ellipse2(x, y, 0.045 * E, 0.045 * E, 6), col: mix(iris, WHITE, 0.2), off: o + 0.0016 }); }
    L.push({ pts: ellipse2(-0.16 * E, 0.22 * E, 0.12 * E, 0.15 * E, 14), col: WHITE, off: o + 0.0032 });
  } else if (style === 'sharp' || style === 'angry') {
    // つり目：上が内側に向かって切れ込む（怒り顔はさらに急に）
    const steep = style === 'angry' ? 0.66 : 0.42;
    const cut = (x) => (style === 'angry' ? 0.12 : 0.2) * E + side * x * steep;
    const sclera = ellipse2(0, -0.02 * E, 0.5 * E, 0.42 * E, 32).map(([x, y]) => [x, Math.min(y, cut(x))]);
    const outer = ellipse2(0, -0.02 * E, 0.56 * E, 0.48 * E, 32).map(([x, y]) => [x, Math.min(y, cut(x) + 0.06 * E)]);
    L.push({ pts: outer, col: lash, off: nx() });
    L.push({ pts: sclera, col: WHITE, off: nx() });
    const ix = -side * 0.06 * E, iy = -0.04 * E;
    L.push({ pts: ellipse2(ix, iy, 0.3 * E, 0.36 * E, 26).map(([x, y]) => [x, Math.min(y, cut(x) - 0.01 * E)]), col: iris, off: nx() });
    L.push({ pts: ellipse2(ix, iy + 0.12 * E, 0.3 * E, 0.22 * E, 22).map(([x, y]) => [x, Math.min(y, cut(x) - 0.01 * E)]), col: irisD, off: nx() });
    L.push({ pts: ellipse2(ix, iy, K.slit ? 0.06 * E : 0.13 * E, 0.25 * E, 16), col: pupil, off: nx() });
    L.push({ pts: ellipse2(ix - 0.1 * E, iy + 0.1 * E, 0.08 * E, 0.09 * E, 12), col: WHITE, off: nx() });
    L.push({ pts: ellipse2(ix + 0.1 * E, iy - 0.16 * E, 0.04 * E, 0.04 * E, 10), col: WHITE, off: o });
    // 太い上まぶたのライン ＋ まゆ
    const lid = []; for (let i = 0; i <= 10; i++) { const x = lerp(-0.56, 0.56, i / 10) * E; lid.push([x, cut(x) + 0.02 * E]); }
    L.push({ ...line2(lid, 0.13 * E, (t) => { const tt = side > 0 ? t : 1 - t; return 0.6 + tt * 0.6; }), col: lash, off: nx() });
    const brow = []; for (let i = 0; i <= 8; i++) { const x = lerp(-0.5, 0.55, i / 8) * E; brow.push([x, cut(x) + (style === 'angry' ? 0.2 : 0.28) * E + Math.sin(i / 8 * Math.PI) * 0.03 * E]); }
    L.push({ ...line2(brow, (style === 'angry' ? 0.17 : 0.12) * E, (t) => { const tt = side > 0 ? t : 1 - t; return 1.2 - tt * 0.7; }), col: mix(K.dark, EYE_DARK, 0.5), off: o });
  } else {
    // ねむそうな目（半分まぶた）
    const lidY = 0.06 * E;
    L.push({ pts: ellipse2(0, -0.04 * E, 0.5 * E, 0.5 * E, 28).map(([x, y]) => [x, Math.min(y, lidY + 0.04 * E)]), col: lash, off: nx() });
    L.push({ pts: ellipse2(0, -0.06 * E, 0.44 * E, 0.44 * E, 28).map(([x, y]) => [x, Math.min(y, lidY)]), col: WHITE, off: nx() });
    L.push({ pts: ellipse2(0, -0.1 * E, 0.32 * E, 0.38 * E, 24).map(([x, y]) => [x, Math.min(y, lidY - 0.01 * E)]), col: iris, off: nx() });
    L.push({ pts: ellipse2(0, -0.1 * E, 0.14 * E, 0.24 * E, 16).map(([x, y]) => [x, Math.min(y, lidY - 0.01 * E)]), col: pupil, off: nx() });
    L.push({ pts: ellipse2(-0.12 * E, -0.04 * E, 0.07 * E, 0.07 * E, 12), col: WHITE, off: nx() });
    const lid = []; for (let i = 0; i <= 10; i++) lid.push([lerp(-0.52, 0.52, i / 10) * E, lidY + 0.02 * E - Math.sin(i / 10 * Math.PI) * 0.02 * E]);
    L.push({ ...line2(lid, 0.11 * E), col: lash, off: nx() });
  }
  return L;
}
// head: {node, part, c(中心), R}
function addEyes(K, M, head, o = {}) {
  const { dir = [0.48, 0.2, 0.86], size = 0.6, style = K.eyeStyle, iris = K.iris, glow = false } = o;
  const R = head.R;
  const E = R * size * (style === 'cute' ? (K.st < 0.3 ? 1.12 : 1) : style === 'sharp' ? 0.95 : style === 'dot' ? 0.78 : style === 'angry' ? 0.92 : style === 'compound' ? 1.2 : 1);
  for (const side of [-1, 1]) {
    const d = [dir[0] * side, dir[1], dir[2]];
    const fr = decalFrame(head.part, head.c, d);
    const geo = decalGeo(head.part, fr, eyeLayers(K, E, side, style, iris));
    // 目のノードは表面の点に置き、まばたきは縦方向の縮小で表す
    const g = new Node(); g.setPos(fr.p[0], fr.p[1], fr.p[2]);
    // ジオメトリは frame の (u,v,n) 座標なので、ノードの回転で合わせる
    const e = eulerFrom(fr.u, fr.v, fr.n); g.setRot(e[0], e[1], e[2]);
    head.node.add(g);
    // decalGeo の頂点はフレーム（u,v,n）座標なので、そのまま子に置く
    const mesh = new Node(geo, { mat: MAT.flat, outline: 0, emis: glow ? iris.map(v => v * 0.35) : [0, 0, 0] });
    g.add(mesh);
    g.base = g.scl.slice(); g.side = side;
    M.eyes.push(g);
  }
}

// 表面に模様を貼る（sculpt.decalGeo はフレーム座標 (x=u, y=v, z=n方向) で頂点を出す）
function decalNode(parent, part, fr, layers, opts = {}) {
  const geo = decalGeo(part, fr, layers);
  const g = new Node(); g.setPos(fr.p[0], fr.p[1], fr.p[2]);
  const e = eulerFrom(fr.u, fr.v, fr.n); g.setRot(e[0], e[1], e[2]);
  const n = new Node(geo, { mat: MAT.flat, outline: 0, ...opts });
  g.add(n); parent.add(g);
  return g;
}

// 口・鼻・ほっぺ（口の形：cat ω / smile 開いた口 / fang キバ / grin 歯 / flat 一文字 / none）
function addFace(K, M, head, o = {}) {
  const R = head.R, P = head.part, f = K.f, c = head.c || [0, 0, 0];
  const face = o.face ?? f.face;
  // 鼻
  if (o.nose !== false && face !== 'beak') {
    const sf = P.surface([c[0], c[1] + (o.noseY ?? -R * 0.12), c[2]], [0, 0.12, 1]);
    const ns = R * (face === 'snout' || (o.snout ?? 0) > 0.6 ? 0.13 : 0.085);
    K.prim(head.node, PRIM.sphereHi, mix(K.dark, EYE_DARK, 0.6), [sf.p[0], sf.p[1] + ns * 0.1, sf.p[2] - ns * 0.15], [ns * 1.25, ns * 0.8, ns * 0.9], null, { mat: MAT.glossy, outline: 0.5 });
  }
  // ほっぺ（かわいい子）
  if (K.cute && o.blush !== false) for (const sx of [-1, 1]) {
    const fr = decalFrame(P, c, [sx * 0.62, -0.25, 0.75]);
    decalNode(head.node, P, fr, [{ pts: ellipse2(0, 0, R * 0.17, R * 0.1, 16), col: mix(o.skin || K.c1, [1, 0.45, 0.55], 0.55), off: 0.002 }]);
  }
  if (face === 'beak' || o.mouth === false) return;
  const mt = K.mouth;
  if (mt === 'none' && !M.buck) return;
  const mfr = decalFrame(P, [c[0], c[1] + (o.mouthY ?? -R * 0.32), c[2]], [0, -0.35, 1]);
  const w = R * 0.05, mw = R * 0.12 * (o.wide || 1);
  const L = [];
  const pink = [0.98, 0.5, 0.58];
  if (mt === 'cat') {
    L.push({ ...arc2(-mw * 0.5, 0, mw * 0.5, mw * 0.42, Math.PI * 1.02, Math.PI * 1.98, w, 10, () => 1), col: MOUTH, off: 0.002 });
    L.push({ ...arc2(mw * 0.5, 0, mw * 0.5, mw * 0.42, Math.PI * 1.02, Math.PI * 1.98, w, 10, () => 1), col: MOUTH, off: 0.002 });
  } else if (mt === 'smile') {
    // 大きく開いた笑顔（舌つき）
    const pts = []; for (let i = 0; i <= 14; i++) { const a = Math.PI + i / 14 * Math.PI; pts.push([Math.cos(a) * mw * 1.05, Math.sin(a) * mw * 0.95]); }
    L.push({ pts: [[-mw * 1.05, mw * 0.05], ...pts.slice(1, -1), [mw * 1.05, mw * 0.05]].reverse(), col: MOUTH, off: 0.002 });
    L.push({ pts: ellipse2(0, -mw * 0.62, mw * 0.55, mw * 0.3, 14), col: pink, off: 0.0035 });
  } else if (mt === 'fang') {
    L.push({ ...line2([[-mw * 1.2, mw * 0.2], [-mw * 0.5, -mw * 0.12], [mw * 0.5, -mw * 0.12], [mw * 1.2, mw * 0.2]], w * 1.1), col: MOUTH, off: 0.002 });
    for (const sx of K.fierce ? [-1, 1] : [1]) L.push({ pts: [[sx * mw * 0.62, -mw * 0.06], [sx * mw * 0.3, -mw * 0.1], [sx * mw * 0.48, -mw * 0.62]], col: WHITE, off: 0.004 });
  } else if (mt === 'grin') {
    // 歯を見せてニヤリ
    const W2 = mw * 1.5;
    const top = [], bot = [];
    for (let i = 0; i <= 10; i++) { const t = i / 10, x = lerp(-W2, W2, t); top.push([x, mw * 0.22 - Math.sin(t * Math.PI) * mw * 0.1]); bot.push([x, -mw * 0.25 - Math.sin(t * Math.PI) * mw * 0.55]); }
    L.push({ pts: [...top, ...bot.reverse()], col: MOUTH, off: 0.002 });
    const tt = []; for (let i = 0; i <= 10; i++) { const t = i / 10, x = lerp(-W2 * 0.9, W2 * 0.9, t); tt.push([x, mw * 0.18 - Math.sin(t * Math.PI) * mw * 0.1]); }
    for (let i = 10; i >= 0; i--) { const t = i / 10, x = lerp(-W2 * 0.9, W2 * 0.9, t); tt.push([x, -mw * 0.08 - Math.sin(t * Math.PI) * mw * 0.12]); }
    L.push({ pts: tt, col: WHITE, off: 0.0035 });
    for (let i = -3; i <= 3; i++) L.push({ ...line2([[i * W2 * 0.25, mw * 0.2], [i * W2 * 0.25, -mw * 0.12]], w * 0.35), col: [0.75, 0.72, 0.75], off: 0.005 });
  } else if (mt === 'flat') {
    L.push({ ...line2([[-mw * 0.8, 0], [mw * 0.8, -mw * 0.05]], w * 1.1), col: MOUTH, off: 0.002 });
  }
  if (M.buck) { L.push({ ...arc2(-mw * 0.5, 0, mw * 0.5, mw * 0.42, Math.PI * 1.02, Math.PI * 1.98, w, 10, () => 1), col: MOUTH, off: 0.002 }); L.push({ ...arc2(mw * 0.5, 0, mw * 0.5, mw * 0.42, Math.PI * 1.02, Math.PI * 1.98, w, 10, () => 1), col: MOUTH, off: 0.002 }); for (const sx of [-1, 1]) L.push({ pts: [[sx * mw * 0.04, -mw * 0.3], [sx * mw * 0.42, -mw * 0.3], [sx * mw * 0.42, -mw * 1.0], [sx * mw * 0.04, -mw * 1.0]], col: WHITE, off: 0.004 }); }
  if (L.length) decalNode(head.node, P, mfr, L);
}
// くちばし（鳥・ペンギン）：hook=かぎ形 bill=平たいくちばし
function addBeak(K, M, head) {
  const R = head.R, b = M.beak, c = head.c || [0, 0, 0];
  const Lb = (b.len || 0.8) * lerp(1, 1.25, K.st);
  const bk = b.hook ? [0.98, 0.84, 0.32] : [1, 0.72, 0.2], bk2 = mix(bk, [0.8, 0.3, 0.05], 0.3);
  const f0 = head.part.surface(c, [0, -0.12, 1]).p;
  const base = [f0[0], f0[1], f0[2] - R * 0.12];
  const BP = new Part();
  if (b.bill) {
    BP.add(ell([base[0], base[1] - R * 0.06, base[2] + R * 0.38 * Lb], [R * 0.4, R * 0.1, R * 0.45 * Lb], bk, { k: 0 }));
    BP.add(ell([base[0], base[1] - R * 0.18, base[2] + R * 0.32 * Lb], [R * 0.34, R * 0.07, R * 0.38 * Lb], bk2, { k: R * 0.04 }));
  } else {
    BP.add(cap(base, [base[0], base[1] - R * 0.14, base[2] + R * 0.6 * Lb], R * 0.27, R * 0.03, bk, { k: 0, sc: [1, 0.75, 1], pv: base }));
    const lb = [base[0], base[1] - R * 0.14, base[2]];
    BP.add(cap(lb, [lb[0], lb[1] - R * 0.1, lb[2] + R * 0.38 * Lb], R * 0.18, R * 0.02, bk2, { k: R * 0.04, sc: [1, 0.6, 1], pv: lb }));
    if (b.hook) BP.add(cap([base[0], base[1] - R * 0.1, base[2] + R * 0.52 * Lb], [base[0], base[1] - R * 0.36, base[2] + R * 0.6 * Lb], R * 0.08, R * 0.02, mix(bk, [0.25, 0.18, 0.1], 0.45), { k: R * 0.03 }));
  }
  K.add(head.node, K.mesh(BP, 'tiny'), { mat: MAT.glossy });
}

// 哺乳類タイプの頭（snout:鼻先の長さ flat:平たさ wide:横幅 brow:けわしい眉骨）
function mammalHead(K, R, o = {}) {
  const snout = o.snout ?? (K.f.face === 'snout' ? 0.75 : K.f.face === 'longjaw' ? 1.5 : 0.25);
  const c1 = o.col || K.c1, fy = o.flat || 1, wx = o.wide || 1, sn = Math.min(snout, 1.5);
  const P = new Part([ell([0, 0, 0], [R * 1.05 * wx, R * 0.95 * fy, R * 0.98], c1, { k: 0 })]);
  if (o.cheeks !== false) for (const sx of [-1, 1]) P.add(ell([sx * R * 0.5 * wx, -R * 0.3 * fy, R * 0.14], [R * 0.52, R * 0.44 * fy, R * 0.54], c1, { k: R * 0.3 }));
  const mz = R * (0.58 + snout * 0.32);
  P.add(ell([0, -R * (0.28 + sn * 0.05) * fy, mz], [R * (0.42 - sn * 0.05) * wx, R * (0.3 - sn * 0.03) * fy, R * (0.36 + snout * 0.3)], c1, { k: R * 0.32 }));
  P.add(sph([0, -R * 0.5 * fy, -R * 0.38], R * 0.55, c1, { k: R * 0.4 }));
  if (o.muzzle !== false) P.paint(ell([0, -R * 0.42 * fy, mz + R * 0.05], [R * 0.5, R * 0.36 * fy, R * (0.44 + snout * 0.32)]), K.muzzle, R * 0.05);
  if (o.brow ?? K.fierce) P.add(ell([0, R * 0.34 * fy, R * 0.56], [R * 0.78 * wx, R * 0.2 * fy, R * 0.34], c1, { k: R * 0.26 }));
  if (K.f.face === 'longjaw' && snout < 1.6) for (const s of [-1, 1]) P.add(ell([s * R * 0.2, R * 0.0, R * 0.85], [R * 0.16, R * 0.14, R * 0.2], c1, { k: R * 0.12 }));
  if (snout > 1.6) for (const s of [-1, 1]) P.add(ell([s * R * 0.22, R * 0.08 * fy, R * 0.7], [R * 0.17, R * 0.15, R * 0.2], c1, { k: R * 0.1 }));
  if (K.ex.has('mask')) P.paint(ell([0, R * 0.16, R * 0.75], [R * 1.0, R * 0.26, R * 0.5]), mix(K.dark, EYE_DARK, 0.3), R * 0.04);
  if (K.ex.has('beard')) P.add(cap([0, -R * 0.55, R * 0.62], [0, -R * 1.05, R * 0.55], R * 0.22, R * 0.04, K.light, { k: R * 0.15 }));
  if (K.ex.has('hood')) P.add(ell([0, R * 0.1, -R * 0.28], [R * 1.28, R * 1.12, R * 0.95], K.c2, { k: R * 0.08 }));
  if (K.ex.has('helmet')) P.add(ell([0, R * 0.32, -R * 0.06], [R * 1.12, R * 0.78, R * 1.08], K.metal, { k: R * 0.06 }));
  if (K.ex.has('headdress')) { P.add(box([0, R * 0.2, -R * 0.25], [R * 1.15, R * 0.62, R * 0.85], R * 0.25, [0.98, 0.82, 0.3], { k: R * 0.1 })); for (const s of [-1, 1]) P.add(box([s * R * 0.92, -R * 0.45, -R * 0.1], [R * 0.18, R * 0.62, R * 0.45], R * 0.12, [0.25, 0.4, 0.85], { k: R * 0.08 })); }
  if (K.ex.has('crest')) for (let i = 0; i < 3; i++) P.add(cap([0, R * 0.8, R * 0.25 - i * R * 0.3], [0, R * (1.35 - i * 0.12), R * (0.1 - i * 0.45)], R * 0.16, R * 0.02, K.c2, { k: R * 0.12 }));
  return { part: P, R, c: [0, 0, 0], snout, mz };
}

// 耳（形の種類が多いほど見分けやすい）
const EAR_DIR = { long: [0.32, 0.95, -0.08], round: [0.66, 0.74, -0.04], mouse: [0.62, 0.74, -0.06], flop: [0.62, 0.72, -0.05], side: [0.85, 0.42, -0.05], wide: [0.72, 0.62, -0.1], elephant: [0.94, 0.12, -0.12], small: [0.6, 0.76, -0.05], bat: [0.48, 0.86, -0.04] };
function addEars(K, M, head, style) {
  const R = head.R;
  if (!style || style === 'none') return;
  const inner = mix(K.c1, [1, 0.62, 0.7], lum(K.c1) > 0.7 ? 0.45 : 0.6);
  const c = head.c || [0, 0, 0];
  for (const s of [-1, 1]) {
    const d0 = EAR_DIR[style] || [0.56, 0.82, -0.04];
    const sf = head.part.surface(c, [s * d0[0], d0[1], d0[2]]);
    const P = new Part();
    let tilt = 0.32, back = -0.08, tw = 0;
    if (style === 'pointy' || style === 'big' || style === 'huge' || style === 'bat') {
      const k = style === 'big' ? 1.35 : style === 'huge' ? 1.9 : style === 'bat' ? 1.6 : 1;
      P.add(cap([0, -R * 0.1, 0], [0, R * 0.78 * k, R * 0.04], R * 0.34 * k * (style === 'huge' ? 0.85 : 1), R * 0.025, K.c1, { k: 0, sc: [1, 1, 0.5], pv: [0, 0, 0] }));
      P.paint(cap([0, R * 0.08, R * 0.12], [0, R * 0.62 * k, R * 0.12], R * 0.2 * k, R * 0.02), inner, R * 0.025);
      if (K.fierce) P.paint(cap([0, R * 0.55 * k, 0], [0, R * 0.8 * k, R * 0.04], R * 0.15, R * 0.02), K.dark, R * 0.02);
      tilt = style === 'big' ? 0.5 : style === 'huge' ? 0.62 : style === 'bat' ? 0.45 : 0.36;
    } else if (style === 'round' || style === 'mouse' || style === 'small') {
      const k = style === 'mouse' ? 1.7 : style === 'small' ? 0.55 : 1;
      P.add(ell([0, R * 0.16 * k, 0], [R * 0.32 * k, R * 0.3 * k, R * 0.13], K.c1, { k: 0 }));
      P.paint(ell([0, R * 0.17 * k, R * 0.1], [R * 0.2 * k, R * 0.18 * k, R * 0.1]), inner, R * 0.02);
      tilt = style === 'mouse' ? 0.4 : 0.25;
    } else if (style === 'long') {
      P.add(cap([0, -R * 0.05, 0], [0, R * 1.2, -R * 0.08], R * 0.2, R * 0.16, K.c1, { k: 0, sc: [1, 1, 0.5], pv: [0, 0, 0] }));
      P.paint(cap([0, R * 0.15, R * 0.08], [0, R * 1.05, R * 0.02], R * 0.12, R * 0.1), inner, R * 0.02);
      tilt = 0.12; back = -0.32;
    } else if (style === 'flop') {
      // たれ耳（子犬）
      const ec = mix(K.c1, K.dark, 0.28);
      P.add(cap([0, 0, 0], [0, -R * 0.62, R * 0.06], R * 0.2, R * 0.24, ec, { k: 0, sc: [0.5, 1, 1], pv: [0, 0, 0] }));
      tilt = 0.35; back = 0.15;
    } else if (style === 'side' || style === 'wide') {
      // 横に張り出した耳（ヒツジ・ヤギ・シカ）
      const k = style === 'wide' ? 1.25 : 0.9;
      P.add(ell([0, R * 0.36 * k, 0], [R * 0.16 * k, R * 0.4 * k, R * 0.07], K.c1, { k: 0 }));
      P.paint(ell([0, R * 0.38 * k, R * 0.05], [R * 0.1 * k, R * 0.3 * k, R * 0.05]), inner, R * 0.02);
      tilt = style === 'wide' ? 1.05 : 1.45; back = -0.1;
    } else if (style === 'elephant') {
      // ゾウの大きな耳
      P.add(ell([0, -R * 0.05, -R * 0.2], [R * 0.08, R * 0.68, R * 0.62], K.c1, { k: 0 }));
      P.paint(ell([R * 0.05, -R * 0.05, -R * 0.2], [R * 0.06, R * 0.5, R * 0.45]), inner, R * 0.04);
      tilt = -0.15 * s * s; back = 0; tw = s * 0.35;
    } else if (style === 'tuft') {
      P.add(cap([0, 0, 0], [0, R * 0.45, R * 0.05], R * 0.16, R * 0.02, K.dark, { k: 0 }));
      tilt = 0.3;
    }
    const j = K.joint(head.node, [sf.p[0] - sf.n[0] * R * 0.08, sf.p[1] - sf.n[1] * R * 0.08, sf.p[2] - sf.n[2] * R * 0.08], [back, tw, -s * tilt]);
    K.add(j, K.mesh(P, 'small'));
    j.r0 = j.rot.slice(); j.side = s;
    M.ears.push(j);
  }
}

// 角（頭に直接）
function addHorns(K, head, n, style) {
  if (!n) return;
  const R = head.R, P = new Part();
  const hc = K.hornCol;
  const horn = (x, z, len, rad, lean = -0.35, out = 0.55) => {
    const sf = head.part.surface(head.c, [x, 0.9, z]);
    const b = sf.p;
    const tip = [b[0] + Math.sign(x || 0.0001) * out * len * Math.abs(x) * 1.2, b[1] + len, b[2] + lean * len];
    const mid = [(b[0] + tip[0]) / 2, (b[1] + tip[1]) / 2 + len * 0.05, (b[2] + tip[2]) / 2 - lean * len * 0.25];
    P.add(cap([b[0] - sf.n[0] * rad * 0.5, b[1] - sf.n[1] * rad * 0.5, b[2] - sf.n[2] * rad * 0.5], mid, rad, rad * 0.62, hc, { k: 0.01 }));
    P.add(cap(mid, tip, rad * 0.62, rad * 0.08, hc, { k: 0.01 }));
  };
  if (style === 'antler') {
    for (const s of [-1, 1]) {
      const sf = head.part.surface(head.c, [s * 0.45, 0.85, -0.1]);
      const b = sf.p, br = [0.66, 0.48, 0.32];
      const t1 = [b[0] + s * R * 0.5, b[1] + R * 1.0, b[2] - R * 0.15];
      P.add(cap(b, t1, R * 0.08, R * 0.05, br, { k: 0.01 }));
      P.add(cap([lerp(b[0], t1[0], 0.5), lerp(b[1], t1[1], 0.5), lerp(b[2], t1[2], 0.5)], [b[0] + s * R * 0.75, b[1] + R * 0.75, b[2] + R * 0.2], R * 0.05, R * 0.025, br, { k: 0.01 }));
      P.add(cap(t1, [t1[0] + s * R * 0.25, t1[1] + R * 0.35, t1[2] - R * 0.1], R * 0.05, R * 0.02, br, { k: 0.01 }));
      P.add(cap(t1, [t1[0] - s * R * 0.1, t1[1] + R * 0.4, t1[2] + R * 0.1], R * 0.05, R * 0.02, br, { k: 0.01 }));
    }
  } else if (style === 'curl') {
    const hs = K.hornScale || 1;
    for (const s of [-1, 1]) {
      const sf = head.part.surface(head.c, [s * 0.7, 0.55, -0.1]);
      const b = sf.p; let prev = b;
      const n = hs > 1.3 ? 10 : 7;
      for (let i = 1; i <= n; i++) {
        const a = i / 7 * Math.PI * 1.5, rr = R * (0.42 - i * 0.025) * hs;
        const p = [b[0] + s * (R * 0.12 + Math.sin(a) * rr * 0.4 + (hs > 1.3 ? i * R * 0.04 : 0)), b[1] + Math.sin(a) * rr * 0.9, b[2] - (1 - Math.cos(a)) * rr * 0.9];
        P.add(cap(prev, p, R * (0.17 - i * 0.012) * Math.sqrt(hs), R * (0.155 - i * 0.012) * Math.sqrt(hs), hc, { k: 0.02 }));
        prev = p;
      }
    }
  } else if (style === 'sweep') {
    // 後ろへ大きく反る角（アイベックス）。ふしのある長い角
    const hs = K.hornScale || 1;
    for (const s of [-1, 1]) {
      const sf = head.part.surface(head.c, [s * 0.35, 0.85, 0.1]);
      let prev = sf.p;
      for (let i = 1; i <= 8; i++) {
        const t = i / 8, a = t * 1.9;
        const p = [sf.p[0] + s * R * 0.35 * t * hs, sf.p[1] + Math.sin(a) * R * 0.9 * hs, sf.p[2] - (1 - Math.cos(a)) * R * 0.85 * hs];
        P.add(cap(prev, p, R * (0.16 - t * 0.11), R * (0.15 - t * 0.12), hc, { k: 0.01 }));
        if (i % 2 === 0) P.add(tor(p, R * (0.13 - t * 0.08), R * 0.025, hc, { k: 0.01, rot: [0.6, 0, 0] }));
        prev = p;
      }
    }
  } else if (style === 'unicorn') {
    const sf = head.part.surface(head.c, [0, 0.6, 0.8]);
    const b = sf.p; P.add(cap(b, [b[0], b[1] + R * 1.1, b[2] + R * 0.55], R * 0.14, R * 0.015, hc, { k: 0.01 }));
  } else {
    const L = R * (K.fierce ? 0.85 : 0.55);
    if (n === 1) horn(0.0001, 0.35, L * 1.2, R * 0.16, -0.2, 0);
    if (n >= 2) { horn(-0.42, -0.05, L, R * 0.13); horn(0.42, -0.05, L, R * 0.13); }
    if (n >= 3) horn(0.0001, 0.3, L * 1.1, R * 0.13, -0.3, 0);
  }
  K.add(head.node, K.mesh(P, 'tiny'), { mat: MAT.glossy });
}

// 炎（ゆらめく・光る）
const FLAME_GEO = new Map();
function flameGeo(K, s, blue = false) {
  s = Math.round(s * 8) / 8;
  const key = (blue ? 'b' : 'f') + s.toFixed(3) + K.q;
  if (FLAME_GEO.has(key)) return FLAME_GEO.get(key);
  const core = blue ? [0.85, 0.95, 1] : [1, 0.96, 0.6], mid = blue ? [0.45, 0.62, 1] : [1, 0.55, 0.1], tip = blue ? [0.32, 0.28, 0.95] : [0.94, 0.2, 0.08];
  // しずく形の本体から、高さの違う炎の舌が S 字にゆらめいて立ちのぼる（アニメ調の炎）
  const t = 0.014 * s;
  const P = new Part([
    cap([0, 0, 0], [0.03 * s, 0.26 * s, -0.02 * s], 0.13 * s, 0.075 * s, mid, { k: 0 }),
    cap([0.03 * s, 0.26 * s, -0.02 * s], [-0.05 * s, 0.66 * s, -0.09 * s], 0.075 * s, t, mid, { k: 0.05 * s }),
    cap([0.06 * s, 0.1 * s, 0], [0.21 * s, 0.44 * s, -0.05 * s], 0.06 * s, t, mid, { k: 0.05 * s }),
    cap([-0.06 * s, 0.08 * s, 0.02 * s], [-0.19 * s, 0.37 * s, 0.07 * s], 0.055 * s, t, mid, { k: 0.05 * s }),
    cap([0, 0.1 * s, -0.06 * s], [0.04 * s, 0.34 * s, -0.22 * s], 0.05 * s, t, mid, { k: 0.045 * s }),
    cap([0, 0.08 * s, 0.06 * s], [-0.04 * s, 0.27 * s, 0.18 * s], 0.045 * s, t, mid, { k: 0.04 * s }),
  ]);
  P.paint(ell([0, 0.07 * s, 0.03 * s], [0.11 * s, 0.17 * s, 0.11 * s]), core, 0.07 * s);
  P.paint(box([0, 0.62 * s, 0], [0.6 * s, 0.24 * s, 0.6 * s], 0), tip, 0.16 * s);
  const g = P.mesh(Math.max(0.008, 0.016 * s) * K.q);
  FLAME_GEO.set(key, g);
  return g;
}
function addFlame(K, M, parent, pos, s = 1, rot = null, blue = false) {
  const j = K.joint(parent, pos, rot);
  const n = K.add(j, flameGeo(K, s, blue), { emis: blue ? [0.3, 0.4, 0.75] : [0.55, 0.22, 0.02], mat: MAT.flat, outline: 0.55 });
  n.cloudShadow = 0;
  j.s0 = s; M.flames.push(j);
  return j;
}

// 尻尾（関節でしなる）  dir0: 付け根の向き（x回転）。curl: 関節ごとの曲がり
function tailChain(K, M, parent, base, n, len, rad, col, rx0, curl, yaw = 0, tipCol = null, taper = 0.5) {
  const js = [];
  let p = K.joint(parent, base, [rx0, yaw, 0]);
  for (let i = 0; i < n; i++) {
    const k0 = 1 - i / n * taper, k1 = 1 - (i + 1) / n * taper;
    const P = new Part([cap([0, len * 0.08, 0], [0, -len * 1.02, 0], rad * k0, rad * k1, col, { k: 0 })]);
    if (tipCol && i === n - 1) P.paint(sph([0, -len * 1.0, 0], rad * 1.6), tipCol, rad * 0.25);
    K.add(p, K.mesh(P, 'limb'));
    p.r0 = p.rot.slice(); js.push(p);
    if (i < n - 1) p = K.joint(p, [0, -len, 0], [curl, 0, 0]);
  }
  const tip = K.joint(js[js.length - 1], [0, -len, 0]);
  M.chains.push(js);
  return tip;
}
function addTail(K, M, parent, base, type, scale = 1) {
  const s = scale, c1 = K.c1, c2 = K.c2;
  if (!type || type === 'none' || !base) return;
  const S = (v) => v * s;
  if (type === 'short') {
    const j = K.joint(parent, base, [0.6, 0, 0]);
    K.add(j, K.mesh(new Part([sph([0, 0, -S(0.06)], S(0.13), c1)]), 'small'));
    M.tails.push(j); return;
  }
  if (type === 'long' || type === 'twin' || type === 'ghostlong') {
    for (const yaw of type === 'twin' ? [-0.35, 0.35] : [0]) {
      const tip = tailChain(K, M, parent, base, 4, S(0.17), S(0.075), c1, 2.15, 0.18, yaw, K.ex.has('ghostfire') ? null : c2);
      if (K.ex.has('ghostfire')) addFlame(K, M, tip, [0, 0, 0], 0.8 * s, [Math.PI, 0, 0], true);
    }
    return;
  }
  if (type === 'fluffy') {
    const js = []; const p0 = K.joint(parent, base, [2.35, 0, 0]);
    const P = new Part([cap([0, 0, 0], [0, -S(0.12), 0], S(0.07), S(0.09), c1, { k: 0 }), ell([0, -S(0.34), S(0.02)], [S(0.19), S(0.3), S(0.19)], c1, { k: S(0.12) })]);
    P.add(cap([0, -S(0.5), S(0.02)], [0, -S(0.66), S(-0.04)], S(0.14), S(0.02), c1, { k: S(0.1) }));
    P.paint(ell([0, -S(0.62), 0], [S(0.22), S(0.16), S(0.22)]), K.belly, S(0.04));
    K.add(p0, K.mesh(P, 'limb'));
    p0.r0 = p0.rot.slice(); js.push(p0); M.chains.push(js);
    return;
  }
  if (type === 'flame') {
    const tip = tailChain(K, M, parent, base, 3, S(0.16), S(0.065), c1, 2.25, 0.25, 0, null);
    addFlame(K, M, tip, [0, S(0.02), 0], 1.25 * s, [Math.PI, 0, 0]);
    return;
  }
  if (type === 'leaf') {
    const tip = tailChain(K, M, parent, base, 2, S(0.14), S(0.055), mix(c1, [0.3, 0.6, 0.25], 0.3), 2.2, 0.25);
    const P = new Part([ell([0, -S(0.25), 0], [S(0.17), S(0.3), S(0.05)], [0.4, 0.8, 0.3], { k: 0 })]);
    P.paint(box([0, -S(0.25), 0], [S(0.012), S(0.3), S(0.2)], 0), [0.28, 0.6, 0.22], S(0.01));
    K.add(tip, K.mesh(P, 'small'));
    return;
  }
  if (type === 'spike' || type === 'stinger') {
    const tip = tailChain(K, M, parent, base, 4, S(0.16), S(0.08), c1, 2.1, 0.12);
    const P = new Part([cap([0, S(0.02), 0], [0, -S(0.32), 0], S(0.09), S(0.008), type === 'stinger' ? [0.3, 0.18, 0.32] : K.hornCol, { k: 0 })]);
    K.add(tip, K.mesh(P, 'tiny'), { mat: MAT.glossy });
    return;
  }
  if (type === 'fin') {
    const tip = tailChain(K, M, parent, base, 2, S(0.16), S(0.08), c1, 1.95, 0.1);
    const P = new Part();
    for (const s2 of [-1, 1]) P.add(cap([0, 0, 0], [s2 * S(0.24), -S(0.3), 0], S(0.12), S(0.04), c2, { k: S(0.03), sc: [1, 1, 0.3], pv: [0, 0, 0] }));
    K.add(tip, K.mesh(P, 'small'));
    return;
  }
  if (type === 'feather') {
    const j = K.joint(parent, base, [0.25, 0, 0]);
    const P = new Part();
    for (const a of [-0.45, -0.15, 0.15, 0.45]) P.add(cap([0, 0, 0], [Math.sin(a) * S(0.32), S(0.06), -S(0.42)], S(0.08), S(0.05), Math.abs(a) < 0.3 ? c1 : c2, { k: S(0.03), sc: [1, 0.35, 1], pv: [0, 0, 0] }));
    K.add(j, K.mesh(P, 'small'));
    M.tails.push(j); return;
  }
  if (type === 'bolt') {
    const j = K.joint(parent, base, [0.35, 0, 0]);
    const col = K.T.includes('electric') ? [1, 0.86, 0.12] : c2;
    const pts = [[0, 0, 0], [0, S(0.22), -S(0.12)], [S(0.14), S(0.3), -S(0.24)], [0, S(0.52), -S(0.38)], [S(0.16), S(0.64), -S(0.48)], [0, S(0.86), -S(0.62)]];
    const P = new Part();
    for (let i = 0; i < pts.length - 1; i++) P.add(cap(pts[i], pts[i + 1], S(0.06 + i * 0.012), S(0.07 + i * 0.012), col, { k: S(0.02), sc: [1, 1, 0.45], pv: [0, 0, 0] }));
    P.paint(sph([0, 0, 0], S(0.14)), c1, S(0.03));
    K.add(j, K.mesh(P, 'small'));
    M.tails.push(j); return;
  }
  if (type === 'ghost') {
    const j = K.joint(parent, base, [1.7, 0, 0]);
    const P = new Part([cap([0, S(0.05), 0], [S(0.08), -S(0.45), -S(0.05)], S(0.24), S(0.015), c1, { k: 0 })]);
    K.add(j, K.mesh(P, 'small'));
    M.tails.push(j); return;
  }
  if (type === 'horse') {
    // 馬のしっぽ（毛の束）
    const j = K.joint(parent, base, [0.55, 0, 0]);
    const hc = mix(c2, K.dark, lum(c2) > 0.85 ? 0.15 : 0.05);
    const P = new Part([cap([0, 0, 0], [0, -S(0.18), -S(0.08)], S(0.07), S(0.09), hc, { k: 0 })]);
    for (const x of [-1, 0, 1]) P.add(cap([0, -S(0.12), -S(0.06)], [x * S(0.07), -S(0.66), -S(0.14) + Math.abs(x) * S(0.03)], S(0.09), S(0.035), hc, { k: S(0.05) }));
    K.add(j, K.mesh(P, 'small')); M.tails.push(j); return;
  }
  if (type === 'squirrel') {
    // リスの大きなしっぽ（背中にそってくるん）
    const j = K.joint(parent, base, [0, 0, 0]);
    const P = new Part(); let prev = [0, 0, -S(0.04)];
    for (let i = 1; i <= 7; i++) { const t = i / 7; const p = [0, S(0.95) * t, -S(0.08) - S(0.3) * Math.sin(t * Math.PI * 0.95)]; const rr = S(0.07 + Math.sin(t * Math.PI * 0.9) * 0.17); P.add(cap(prev, p, rr, rr, c1, { k: S(0.08) })); prev = p; }
    P.add(sph([0, S(1.0), S(0.05)], S(0.14), c1, { k: S(0.1) }));
    P.paint(sph([0, S(1.0), S(0.08)], S(0.14)), mix(c1, WHITE, 0.4), S(0.05));
    K.add(j, K.mesh(P, 'limb')); M.tails.push(j); return;
  }
  if (type === 'club') {
    const tip = tailChain(K, M, parent, base, 4, S(0.2), S(0.11), c1, 1.45, 0.04, 0, null, 0.55);
    const P = new Part([sph([0, -S(0.08), 0], S(0.2), mix(c1, K.dark, 0.3), { k: 0 })]);
    for (const [x, y, z] of [[1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1], [0, -1, 0]]) P.add(cap([0, -S(0.08), 0], [x * S(0.3), -S(0.08) + y * S(0.3), z * S(0.3)], S(0.08), S(0.01), K.hornCol, { k: S(0.02) }));
    K.add(tip, K.mesh(P, 'small')); return;
  }
  if (type === 'puff') { const j = K.joint(parent, base, [0, 0, 0]); K.add(j, K.mesh(new Part([sph([0, S(0.02), -S(0.05)], S(0.12), mix(c1, WHITE, 0.55))]), 'small')); M.tails.push(j); return; }
  if (type === 'thick') { const r0 = M.tailR || S(0.11); tailChain(K, M, parent, base, 5, r0 * 1.4, r0, c1, 1.32, 0.05, 0, K.ex.has('tip') ? c2 : null, 0.85); return; }
  if (type === 'thin') { tailChain(K, M, parent, base, 4, S(0.14), S(0.035), mix(c1, K.dark, 0.15), 2.0, 0.15, 0, null, 0.4); return; }
  if (type === 'lion') { const tip = tailChain(K, M, parent, base, 4, S(0.17), S(0.045), c1, 2.1, 0.2, 0, null, 0.3); K.add(tip, K.mesh(new Part([sph([0, -S(0.04), 0], S(0.09), mix(K.c2, K.dark, 0.2))]), 'small')); return; }
  if (type === 'curl') { tailChain(K, M, parent, base, 3, S(0.12), S(0.07), c1, 2.9, 0.65, 0, K.belly, 0.4); return; }
  if (type === 'plumes') { for (const yaw of [-0.32, 0, 0.32]) { const tip = tailChain(K, M, parent, base, 4, S(0.2), S(0.05), K.c2, 1.85, -0.08, yaw, null, 0.3); const P = new Part([ell([0, -S(0.2), 0], [S(0.11), S(0.24), S(0.03)], mix(K.c2, [1, 0.85, 0.3], 0.5), { k: 0 })]); K.add(tip, K.mesh(P, 'small')); } return; }
  if (type === 'paddle') {
    const j = K.joint(parent, base, [0.4, 0, 0]);
    const P = new Part([ell([0, 0, -S(0.28)], [S(0.18), S(0.05), S(0.28)], K.dark, { k: 0 })]);
    K.add(j, K.mesh(P, 'small'));
    M.tails.push(j); return;
  }
}

// ---------------- 背中の飾り（胴体に溶け込ませるもの） ----------------
// A: { y:背中の高さ, z0, z1:前後, w:幅, top:(z)=>背中の表面の高さ }
function backShapes(K, P, A) {
  const b = K.f.back, c2 = K.c2, ex = K.ex;
  const zs = (n) => Array.from({ length: n }, (_, i) => lerp(A.z0, A.z1, n === 1 ? 0.5 : i / (n - 1)));
  if (b === 'spikes' || ex.has('spikes')) {
    const n = 5;
    zs(n).forEach((z, i) => { const h = A.top(z); const L = A.w * (0.75 - Math.abs(i - (n - 1) / 2) * 0.12) * (0.8 + K.st * 0.5); P.add(cap([0, h - A.w * 0.12, z], [0, h + L, z - L * 0.45], A.w * 0.22, A.w * 0.02, b === 'spikes' ? c2 : K.hornCol, { k: A.w * 0.12 })); });
  }
  if (b === 'mane' || ex.has('mane')) {
    // たてがみ：首のまわりにトゲトゲの毛
    const col = K.T.includes('fire') ? [1, 0.58, 0.16] : c2;
    const cz = A.neck[2], cy = A.neck[1], r = A.w * 0.95;
    for (let i = 0; i < 14; i++) {
      const a = i / 14 * Math.PI * 2;
      const dx = Math.cos(a), dy = Math.sin(a);
      const base = [dx * r * 0.62, cy + dy * r * 0.6 + r * 0.1, cz - r * 0.1];
      const L = r * (0.55 + (i % 2) * 0.25) * (0.8 + K.st * 0.4);
      P.add(cap(base, [base[0] + dx * L * 0.7, base[1] + dy * L * 0.7 + L * 0.15, base[2] - L * 0.65], r * 0.3, r * 0.03, col, { k: r * 0.18 }));
    }
    P.add(ell([0, cy + r * 0.05, cz - r * 0.05], [r * 0.95, r * 0.9, r * 0.6], col, { k: r * 0.25 }));
  }
  if (b === 'wool' || b === 'cloud') {
    const col = b === 'cloud' ? [1, 1, 1] : [1, 0.98, 0.94];
    for (let i = 0; i < 16; i++) {
      const a = i * 2.39996, rr = Math.sqrt((i + 0.5) / 16);
      const x = Math.cos(a) * rr * A.w * 1.05, z = lerp(A.z0, A.z1, 0.5) + Math.sin(a) * rr * (A.z0 - A.z1) * 0.62;
      P.add(sph([x, A.top(z) - A.w * 0.02 + (1 - rr) * A.w * 0.15, z], A.w * (0.42 + (i % 3) * 0.06), col, { k: A.w * 0.12 }));
    }
  }
  if (b === 'humps') for (const z of zs(2)) P.add(ell([0, A.top(z) + A.w * 0.3, z], [A.w * 0.55, A.w * 0.6, A.w * 0.45], K.c1, { k: A.w * 0.3 }));
  if (b === 'fins' || b === 'fin' || b === 'sail') {
    const n = b === 'fin' ? 1 : b === 'sail' ? 1 : 3;
    zs(n).forEach((z, i) => { const h = A.top(z); const L = A.w * (b === 'sail' ? 1.3 : 0.75) * (1 - i * 0.15); P.add(cap([0, h - A.w * 0.1, z + A.w * 0.15], [0, h + L, z - L * 0.7], A.w * (b === 'sail' ? 0.55 : 0.32), A.w * 0.04, c2, { k: A.w * 0.08, sc: [0.3, 1, 1], pv: [0, h, z] })); });
  }
  if (b === 'shell') {
    const zc = lerp(A.z0, A.z1, 0.5);
    P.add(ell([0, A.top(zc) - A.w * 0.15, zc], [A.w * 1.15, A.w * 0.75, (A.z0 - A.z1) * 0.75], c2, { k: A.w * 0.1 }));
  }
}
// 背中に乗せる別パーツ（光るもの・植物・翼など）
function backNodes(K, M, parent, A) {
  const b = K.f.back, ex = K.ex;
  const zc = lerp(A.z0, A.z1, 0.45), top = A.top(zc);
  if (b === 'flame') for (let i = 0; i < 3; i++) { const z = lerp(A.z0, A.z1, i / 2.5); addFlame(K, M, parent, [0, A.top(z) - A.w * 0.08, z], (1.3 - i * 0.18) * A.w * 2.4, [-0.35, 0, 0]); }
  if (b === 'leaf') {
    for (const s of [-1, 1]) {
      const P = new Part([ell([0, A.w * 0.9, 0], [A.w * 0.5, A.w * 0.95, A.w * 0.12], [0.42, 0.85, 0.32], { k: 0 })]);
      P.paint(box([0, A.w * 0.9, 0], [A.w * 0.03, A.w * 0.9, A.w * 0.3], 0), [0.3, 0.62, 0.24], A.w * 0.02);
      const j = K.joint(parent, [0, top - A.w * 0.1, zc], [0.2, 0, s * 0.55]);
      K.add(j, K.mesh(P, 'small'), { outline: 0.8 }).swayLeaf = true;
    }
  }
  if (b === 'bush' || b === 'tree') {
    const P = new Part([], { noise: 0.025, noiseF: 9 });
    const leaf = [0.3, 0.68, 0.28], leaf2 = [0.5, 0.82, 0.32];
    if (b === 'tree') {
      P.add(cap([0, 0, 0], [0, A.w * 2.4, 0], A.w * 0.28, A.w * 0.18, [0.55, 0.38, 0.22], { k: 0 }));
      for (let i = 0; i < 7; i++) { const a = i * 2.4; P.add(sph([Math.cos(a) * A.w * 0.75, A.w * (2.5 + (i % 3) * 0.35), Math.sin(a) * A.w * 0.75], A.w * (0.75 + (i % 2) * 0.15), i % 2 ? leaf2 : leaf, { k: A.w * 0.3 })); }
      P.add(sph([0, A.w * 3.25, 0], A.w * 0.8, leaf2, { k: A.w * 0.3 }));
    } else for (let i = 0; i < 6; i++) { const a = i * 2.1; P.add(sph([Math.cos(a) * A.w * 0.45, A.w * (0.45 + (i % 2) * 0.25), Math.sin(a) * A.w * 0.45], A.w * 0.48, i % 2 ? leaf2 : leaf, { k: A.w * 0.25 })); }
    K.add(K.joint(parent, [0, top - A.w * 0.15, zc]), K.mesh(P, b === 'tree' ? 'head' : 'small'));
    if (b === 'bush') for (let i = 0; i < 3; i++) K.prim(parent, PRIM.sphereHi, [1, 0.42, 0.5], [Math.cos(i * 2.1) * A.w * 0.4, top + A.w * 0.75, zc + Math.sin(i * 2.1) * A.w * 0.4], [A.w * 0.12], null, { outline: 0.5 });
  }
  if (b === 'flowers') for (let i = 0; i < 5; i++) {
    const a = i * 2.4, x = Math.cos(a) * A.w * 0.5, z = zc + Math.sin(a) * A.w * 0.5;
    const col = [[1, 0.55, 0.72], [1, 0.9, 0.35], [0.85, 0.62, 1], [1, 1, 1], [1, 0.62, 0.3]][i];
    const P = new Part(); for (let k = 0; k < 5; k++) { const b2 = k / 5 * Math.PI * 2; P.add(ell([Math.cos(b2) * A.w * 0.13, 0, Math.sin(b2) * A.w * 0.13], [A.w * 0.12, A.w * 0.05, A.w * 0.12], col, { k: A.w * 0.03 })); }
    P.add(sph([0, A.w * 0.04, 0], A.w * 0.07, [1, 0.88, 0.3], { k: A.w * 0.02 }));
    K.add(K.joint(parent, [x, A.top(z) + A.w * 0.02, z]), K.mesh(P, 'tiny'), { outline: 0.6 });
  }
  if (b === 'mushroom') {
    const P = new Part([cap([0, -A.w * 0.2, 0], [0, A.w * 0.4, 0], A.w * 0.35, A.w * 0.3, [0.98, 0.94, 0.86], { k: 0 }), ell([0, A.w * 0.6, 0], [A.w * 1.3, A.w * 0.6, A.w * 1.3], K.c2, { k: A.w * 0.1 })]);
    for (let i = 0; i < 6; i++) { const a = i * 1.1; P.paint(sph([Math.cos(a) * A.w * 0.8, A.w * 0.95, Math.sin(a) * A.w * 0.8], A.w * 0.2), [1, 1, 1], A.w * 0.03); }
    K.add(K.joint(parent, [0, top, zc]), K.mesh(P, 'head'));
  }
  if (b === 'crystal') for (let i = 0; i < 4; i++) K.prim(parent, PRIM.gem, [0.75, 0.92, 1], [Math.sin(i * 1.7) * A.w * 0.4, A.top(lerp(A.z0, A.z1, i / 3)) + A.w * 0.3, lerp(A.z0, A.z1, i / 3)], [A.w * 0.2, A.w * 0.55, A.w * 0.2], [0, i, 0.2 * Math.sin(i)], { emis: [0.12, 0.22, 0.32], mat: MAT.glossy });
  if (b === 'volcano') { const P = new Part([cap([0, 0, 0], [0, A.w * 1.1, 0], A.w * 0.8, A.w * 0.35, [0.38, 0.3, 0.28], { k: 0 })]); P.add({ ...sph([0, A.w * 1.25, 0], A.w * 0.32, [0.2, 0.1, 0.1]), op: 'sub', k: A.w * 0.08 }); K.add(K.joint(parent, [0, top - A.w * 0.2, zc]), K.mesh(P, 'small')); addFlame(K, M, parent, [0, top + A.w * 0.75, zc], A.w * 3.2); }
  if (b === 'lily') K.prim(parent, PRIM.cyl, [0.38, 0.76, 0.36], [0, top + A.w * 0.02, zc], [A.w * 1.4, A.w * 0.06, A.w * 1.4]);
  if (b === 'clam') {
    const sh = (flip) => { const P = new Part([ell([0, 0, 0], [A.w * 1.2, A.w * 0.32, A.w * 1.1], K.c2, { k: 0 })]); for (let i = -2; i <= 2; i++) P.paint(box([i * A.w * 0.42, 0, 0], [A.w * 0.03, A.w * 0.5, A.w * 1.2], 0), mix(K.c2, [0, 0, 0], 0.2), A.w * 0.02); return K.mesh(P, 'small'); };
    K.add(K.joint(parent, [0, A.w * 0.3, zc]), sh());
    const top2 = K.joint(parent, [0, A.w * 1.0, zc - A.w * 0.6], [0.5, 0, 0]); K.add(top2, sh()); M.clam = top2;
  }
  if (b === 'wings' || b === 'batwings') addWings(K, M, parent, A, b === 'batwings');
}

// 翼（鳥：羽根を重ねた形 / こうもり・竜：骨と膜）
function addWings(K, M, parent, A, bat = false) {
  const plan = K.sp.plan;
  const big = plan === 'dragon' ? 2.0 : plan === 'quad' ? 1.35 : plan === 'blob' ? 0.95 : plan === 'bug' ? 1.1 : plan === 'leviathan' ? 2.2 : 1.15;
  const w = A.w * big;
  const T = K.T;
  for (const s of [-1, 1]) {
    const j = K.joint(parent, [s * A.w * 0.55, A.top(A.wingZ ?? lerp(A.z0, A.z1, 0.3)) - A.w * 0.05, A.wingZ ?? lerp(A.z0, A.z1, 0.3)], [0, 0, 0]);
    if (plan === 'bug') {
      for (const [k, a] of [[1, 0.3], [0.75, -0.25]]) {
        const P = new Part([ell([s * w * 0.55 * k, 0, -w * 0.1], [w * 0.55 * k, w * 0.03, w * 0.3 * k], [0.9, 0.97, 1], { k: 0, rot: [0, s * a, 0] })]);
        P.paint(ell([s * w * 0.55 * k, 0, -w * 0.1], [w * 0.62 * k, w * 0.1, w * 0.34 * k], [0.92, 0.98, 1], { rot: [0, s * a, 0] }), [0.75, 0.88, 1], w * 0.02);
        const n = K.add(j, K.mesh(P, 'small'), { alpha: 0.7, outline: 0 }); n.transparent = true;
      }
    } else if (bat || plan === 'dragon' || (plan === 'leviathan')) {
      // 骨（腕＋指4本）と、指のあいだの膜（ふちが内側にカーブ）
      const memCol = A.mem || (bat ? K.dark : (plan === 'leviathan' ? mix(K.c2, [0.6, 0.9, 1], 0.4) : mix(K.c1, K.c2, 0.35)));
      const memIn = A.memIn || mix(memCol, WHITE, 0.18);
      const boneCol = bat ? mix(K.dark, [0, 0, 0], 0.3) : mix(K.c1, [0.1, 0.02, 0.04], 0.25);
      const sh = [0, 0, 0], el = [s * w * 0.42, w * 0.38, -w * 0.05], wr = [s * w * 0.78, w * 0.52, -w * 0.2];
      const tips = [[s * w * 1.45, w * 0.78, -w * 0.12], [s * w * 1.5, w * 0.28, -w * 0.55], [s * w * 1.18, -w * 0.05, -w * 0.88], [s * w * 0.72, -w * 0.12, -w * 1.0]];
      const back = [s * w * 0.12, -w * 0.08, -w * 0.62];
      const P = new Part([cap(sh, el, w * 0.1, w * 0.075, boneCol, { k: 0 }), cap(el, wr, w * 0.075, w * 0.06, boneCol, { k: w * 0.03 }), sph(el, w * 0.09, boneCol, { k: w * 0.03 })]);
      for (const t of tips) P.add(cap(wr, t, w * 0.05, w * 0.014, boneCol, { k: w * 0.03 }));
      P.add(cap(wr, [wr[0] + s * w * 0.05, wr[1] + w * 0.22, wr[2] + w * 0.1], w * 0.05, w * 0.008, K.hornCol, { k: w * 0.02 }));
      K.add(j, K.mesh(P, 'small'));
      const g = new GeoBuilder();
      const tri = (a, b, c, col) => { g.quad(a, b, c, c, col); g.quad(a, c, b, b, col); };
      const scallop = (a, b, toward, n = 5) => { const pts = []; for (let k = 0; k <= n; k++) { const t = k / n, bow = Math.sin(t * Math.PI) * 0.28; pts.push([lerp(a[0], b[0], t) + (toward[0] - lerp(a[0], b[0], t)) * bow, lerp(a[1], b[1], t) + (toward[1] - lerp(a[1], b[1], t)) * bow, lerp(a[2], b[2], t) + (toward[2] - lerp(a[2], b[2], t)) * bow]); } return pts; };
      const edges = [[tips[0], tips[1]], [tips[1], tips[2]], [tips[2], tips[3]], [tips[3], back]];
      edges.forEach(([a, b], ei) => { const pts = scallop(a, b, ei === 3 ? sh : wr); for (let k = 0; k < pts.length - 1; k++) tri(ei === 3 ? sh : wr, pts[k], pts[k + 1], k % 2 ? memCol : memIn); });
      tri(sh, el, wr, memCol); tri(sh, wr, back, memIn);
      const mn = K.add(j, g.build(), { outline: 0.9, emis: A.memEmis || (plan === 'leviathan' ? [0.04, 0.1, 0.18] : [0, 0, 0]), mat: MAT.decor }); mn.doubleSide = true;
    } else {
      // 鳥・妖精の翼：丸みのある腕の部分＋羽根を扇状に重ねる
      const wc = T.includes('fairy') ? [1, 0.92, 1] : (plan === 'bird' ? K.c1 : K.c2);
      const tipC = plan === 'bird' ? mix(K.c1, K.c2, 0.65) : mix(wc, WHITE, 0.45);
      const cov = plan === 'bird' ? mix(K.c1, K.belly, 0.5) : wc;
      const P = new Part([ell([s * w * 0.3, 0, -w * 0.02], [w * 0.34, w * 0.1, w * 0.2], wc, { k: 0, rot: [0, s > 0 ? 0.25 : Math.PI - 0.25, 0] })]);
      for (let i = 0; i < 6; i++) {
        const a = 0.15 + i * 0.2;                // 外側→後ろへ
        const L = w * (0.98 - i * 0.1);
        const b0 = [s * w * (0.52 - i * 0.06), 0, -w * (0.06 + i * 0.02)];
        const dir = [s * Math.cos(a), 0, -Math.sin(a)];
        const c = [b0[0] + dir[0] * L * 0.5, b0[1] - i * w * 0.012, b0[2] + dir[2] * L * 0.5];
        P.add(ell(c, [L * 0.52, w * 0.045, w * 0.1 + i * w * 0.004], i < 3 ? tipC : wc, { k: w * 0.05, rot: [0, s > 0 ? a : Math.PI - a, 0] }));
      }
      P.paint(ell([s * w * 0.3, -w * 0.05, -w * 0.1], [w * 0.4, w * 0.12, w * 0.3]), cov, w * 0.05);
      K.add(j, K.mesh(P, 'small'));
    }
    j.side = s; M.wings.push(j);
  }
}

// 体全体に関わる飾り（胴体パーツに模様を描く）
function bodyPaints(K, P, A) {
  const ex = K.ex, r = mulberry32(K.sp.id * 31 + 7);
  if (ex.has('spots')) for (let i = 0; i < 6; i++) { const z = lerp(A.z0, A.z1, r()), x = (r() - 0.5) * A.w * 1.6; P.paint(sph([x, A.top(z), z], A.w * (0.18 + r() * 0.12)), K.T.includes('water') ? mix(K.c1, [0.1, 0.2, 0.4], 0.35) : K.dark, A.w * 0.03); }
  if (ex.has('stripes')) for (let i = 0; i < 4; i++) { const z = lerp(A.z0, A.z1, 0.15 + i * 0.23); P.paint(box([0, A.top(z), z], [A.w * 2, A.w * 0.55, A.w * 0.07], 0, null, { rot: [0.3, 0, 0] }), mix(K.dark, EYE_DARK, 0.4), A.w * 0.02); }
  if (ex.has('armor')) { P.paint(ell([0, A.top(A.z0) - A.w * 0.3, A.z0 + A.w * 0.2], [A.w * 1.1, A.w * 0.9, A.w * 0.7]), K.metal, A.w * 0.03); }
  if (ex.has('wraps')) for (let i = 0; i < 5; i++) P.paint(tor([0, A.y - A.w * 0.6 + i * A.w * 0.32, (A.z0 + A.z1) / 2], A.w * 1.0, A.w * 0.06, [0.95, 0.92, 0.82], { rot: [0.25 * (i % 2 ? 1 : -1), 0, 0.15] }), [0.95, 0.92, 0.82], A.w * 0.02);
  if (ex.has('belt')) P.paint(tor([0, A.belt ?? A.y - A.w * 0.3, (A.z0 + A.z1) / 2], A.w * 1.0, A.w * 0.09, [0.3, 0.2, 0.15]), [0.32, 0.22, 0.16], A.w * 0.015);
  if (ex.has('lava')) for (let i = 0; i < 5; i++) { const z = lerp(A.z0, A.z1, r()); P.paint(box([(r() - 0.5) * A.w, A.top(z), z], [A.w * 0.06, A.w * 0.8, A.w * 0.06], 0, null, { rot: [r(), r(), r()] }), [1, 0.5, 0.1], A.w * 0.02); }
  if (ex.has('saddle')) { const zc = (A.z0 + A.z1) / 2; P.paint(ell([0, A.top(zc), zc], [A.w * 1.25, A.w * 0.5, Math.abs(A.z0 - A.z1) * 0.55]), mix(K.c1, K.dark, 0.45), A.w * 0.1); }
  if (ex.has('twotone')) P.paint(box([0, A.y + A.w * 1.25, (A.z0 + A.z1) / 2], [A.w * 3, A.w * 0.95, 3], 0), mix(K.c1, K.dark, 0.32), A.w * 0.14);
  if (ex.has('runes')) for (let i = 0; i < 4; i++) { const z = lerp(A.z0, A.z1, 0.2 + i * 0.2); P.paint(box([0, A.top(z), z], [A.w * 0.5, A.w * 0.05, A.w * 0.05], 0, null, { rot: [0, i, 0] }), [0.4, 1, 0.9], A.w * 0.01); }
}

// 背中の高さを調べる関数（形を追加する前の胴体で）
function topFn(P) {
  const base = new Part(P.shapes.slice());
  const memo = new Map();
  const bb = base.bounds();
  const z0 = bb[2] + (bb[5] - bb[2]) * 0.12, z1 = bb[5] - (bb[5] - bb[2]) * 0.12, cy = (bb[1] + bb[4]) / 2;
  return (z) => {
    const k = Math.round(z * 200); if (memo.has(k)) return memo.get(k);
    const zz = clamp(z, z0, z1);
    const s = base.surface([0, cy, zz], [0, 1, 0], 4);
    const y = s.hit ? s.p[1] : bb[4];
    memo.set(k, y); return y;
  };
}

// ---------------- 脚（四足・二足 共通） ----------------
// o: { hoof, paw, claws, thigh, sock, digi }
function legPart(K, len, lr, front, col, o = {}) {
  const pawR = lr * 1.3 * (o.paw || 1);
  const P = new Part([sph([0, 0, 0], lr * 1.5 * (o.thigh || 1), col, { k: 0 })]);
  if (o.digi) {
    // かかとが浮いた脚（ウサギ・獣人・虫人）
    const knee = [0, -len * 0.42, lr * 1.2], ankle = [0, -len * 0.82, -lr * 1.4];
    P.add(ell([0, -len * 0.18, lr * 0.2], [lr * 1.5 * (o.thigh || 1), len * 0.26, lr * 1.7 * (o.thigh || 1)], col, { k: lr * 0.6 }));
    P.add(cap([0, -len * 0.2, lr * 0.4], knee, lr * 1.15, lr * 0.85, col, { k: lr * 0.5 }));
    P.add(cap(knee, ankle, lr * 0.85, lr * 0.62, col, { k: lr * 0.4 }));
    P.add(cap(ankle, [0, -len + pawR * 0.5, pawR * 0.6], lr * 0.62, pawR * 0.62, col, { k: lr * 0.3 }));
  } else if (front) {
    P.add(cap([0, -0.02, 0], [0, -len * 0.55, 0.02], lr * 1.18, lr * 0.92, col, { k: lr * 0.6 }));
    P.add(cap([0, -len * 0.55, 0.02], [0, -len + pawR * 0.8, 0], lr * 0.92, lr * 0.8, col, { k: lr * 0.4 }));
  } else {
    const th = o.thigh || 1;
    P.add(ell([0, -len * 0.2, -0.01], [lr * 1.45 * th, len * 0.3 * Math.min(th, 1.3), lr * 1.75 * th], col, { k: lr * 0.6 }));
    P.add(cap([0, -len * 0.32, 0.02], [0, -len * 0.68, -0.05 * th], lr * 1.0, lr * 0.82, col, { k: lr * 0.5 }));
    P.add(cap([0, -len * 0.68, -0.05 * th], [0, -len + pawR * 0.8, 0], lr * 0.82, lr * 0.78, col, { k: lr * 0.4 }));
  }
  if (o.hoof) {
    // ひづめ（細い脚の先に濃い色の円柱）
    P.add(cap([0, -len + lr * 1.1, 0.005], [0, -len + lr * 0.35, 0.01], lr * 1.05, lr * 1.12, col, { k: lr * 0.3 }));
    P.paint(box([0, -len + lr * 0.4, 0], [lr * 3, lr * 0.62, lr * 3], 0), mix(K.dark, [0.15, 0.1, 0.08], 0.5), lr * 0.08);
  } else {
    P.add(ell([0, -len + pawR * 0.68, pawR * 0.35], [pawR * 0.95, pawR * 0.68, pawR * 1.25], col, { k: lr * 0.5 }));
  }
  if (o.sock) P.paint(box([0, -len * 0.92, 0], [1, len * 0.22, 1], 0), o.sock, lr * 0.3);
  if (o.claws) for (const x of [-1, 0, 1]) P.add(cap([x * pawR * 0.45, -len + pawR * 0.45, pawR * 1.2], [x * pawR * 0.5, -len + pawR * 0.15, pawR * 1.75], pawR * 0.17, pawR * 0.03, [0.98, 0.96, 0.9], { k: pawR * 0.1 }));
  return P;
}

// ---------------- 四足の骨格（姿の種類ごとの寸法） ----------------
// L:胴の長さ legH:脚の長さ chest/hip:胸と腰の大きさ neck:首の長さ neckA:首の角度(0=真上 1.57=前)
// head:頭の大きさ snout:鼻先の長さ flat:頭の平たさ splay:脚の開き hind:後ろ脚の太さ
const QA = {
  cat: { L: .62, legH: .4, chest: [.25, .26, .27], hip: [.23, .24, .25], neck: .24, neckA: .7, head: .32, snout: .35, legR: .078, ears: 'pointy', tail: 'long' },
  bigcat: { L: .82, legH: .48, chest: [.34, .36, .36], hip: [.27, .28, .3], lift: .08, neck: .24, neckA: .85, head: .31, snout: .55, legR: .115, paw: 1.3, ears: 'round', tail: 'lion', mane: 1, brow: 1 },
  tiger: { L: .92, legH: .48, chest: [.32, .33, .36], hip: [.28, .29, .31], lift: .05, neck: .22, neckA: .95, head: .31, snout: .5, legR: .11, paw: 1.35, ears: 'round', tail: 'long', pat: ['stripes'], brow: 1 },
  sphinx: { L: .7, legH: .44, chest: [.27, .31, .29], hip: [.27, .26, .28], lift: .22, neck: .3, neckA: .25, head: .3, snout: .35, legR: .078, ears: 'pointy', tail: 'long' },
  fox: { L: .68, legH: .4, chest: [.23, .24, .27], hip: [.21, .23, .25], neck: .28, neckA: .72, head: .3, snout: 1.05, legR: .066, ears: 'big', tail: 'fluffy', pat: ['socks'] },
  fennec: { L: .52, legH: .32, chest: [.23, .24, .25], hip: [.22, .23, .24], neck: .18, neckA: .6, head: .34, snout: .7, legR: .062, ears: 'huge', tail: 'fluffy' },
  pup: { L: .6, legH: .37, chest: [.27, .28, .28], hip: [.25, .26, .26], neck: .18, neckA: .6, head: .36, snout: .75, legR: .092, paw: 1.3, ears: 'flop', tail: 'curl' },
  wolf: { L: .92, legH: .55, chest: [.29, .34, .36], hip: [.23, .25, .27], lift: .1, neck: .28, neckA: 1.05, head: .29, snout: 1.25, legR: .088, paw: 1.15, ears: 'pointy', tail: 'fluffy', hump: .12, brow: 1 },
  mouse: { L: .38, legH: .17, chest: [.25, .25, .23], hip: [.31, .3, .29], lift: -.01, neck: .08, neckA: .5, head: .35, snout: .5, legR: .058, ears: 'mouse', tail: 'thin' },
  rat: { L: .55, legH: .23, chest: [.29, .29, .29], hip: [.35, .33, .33], neck: .1, neckA: .8, head: .32, snout: .8, legR: .078, ears: 'round', tail: 'thin', buck: 1, brow: 1 },
  squirrel: { L: .36, legH: .2, chest: [.21, .24, .21], hip: [.27, .27, .26], lift: .13, neck: .08, neckA: .3, head: .34, snout: .4, legR: .058, ears: 'tuft', tail: 'squirrel' },
  rabbit: { L: .4, legH: .2, chest: [.23, .25, .23], hip: [.31, .3, .31], lift: .1, neck: .08, neckA: .35, head: .36, snout: .3, legR: .062, hind: 1.6, ears: 'long', tail: 'puff' },
  bearcub: { L: .5, legH: .27, chest: [.33, .33, .32], hip: [.33, .32, .32], neck: .08, neckA: .7, head: .38, snout: .5, legR: .12, paw: 1.2, ears: 'round', tail: 'puff' },
  sheep: { L: .58, legH: .34, chest: [.29, .3, .31], hip: [.29, .3, .3], neck: .12, neckA: .85, head: .26, snout: .6, legR: .052, hoof: 1, ears: 'side', tail: 'puff', wool: 1 },
  pony: { L: .68, legH: .58, chest: [.26, .28, .3], hip: [.25, .27, .28], lift: .07, neck: .38, neckA: .45, head: .3, snout: 1.0, legR: .07, hoof: 1, ears: 'pointy', tail: 'horse', mane: 2 },
  horse: { L: .95, legH: .9, chest: [.29, .33, .36], hip: [.28, .31, .33], lift: .1, neck: .55, neckA: .5, head: .26, snout: 1.55, legR: .08, hoof: 1, ears: 'pointy', tail: 'horse', mane: 2 },
  fawn: { L: .58, legH: .6, chest: [.22, .24, .26], hip: [.21, .23, .25], neck: .32, neckA: .3, head: .34, snout: .8, legR: .052, hoof: 1, ears: 'wide', tail: 'puff' },
  deer: { L: .85, legH: .95, chest: [.26, .3, .33], hip: [.25, .28, .3], lift: .05, neck: .55, neckA: .35, head: .26, snout: 1.25, legR: .06, hoof: 1, ears: 'wide', tail: 'puff' },
  goat: { L: .72, legH: .56, chest: [.29, .31, .33], hip: [.27, .29, .3], neck: .26, neckA: .6, head: .27, snout: 1.0, legR: .076, hoof: 1, ears: 'side', tail: 'puff' },
  rhino: { L: 1.0, legH: .46, chest: [.44, .46, .47], hip: [.41, .43, .45], lift: .03, neck: .16, neckA: 1.3, head: .34, snout: 1.35, legR: .15, hoof: 1, ears: 'small', tail: 'thin', noseHorn: 1, plates: 1, brow: 1 },
  babymammoth: { L: .58, legH: .4, chest: [.35, .36, .36], hip: [.34, .35, .34], neck: .08, neckA: .9, head: .43, snout: .3, legR: .13, ears: 'elephant', tail: 'thin', trunk: 1 },
  mammoth: { L: 1.0, legH: .85, chest: [.48, .52, .5], hip: [.44, .47, .46], hump: .3, neck: .1, neckA: 1.0, head: .42, snout: .3, legR: .19, ears: 'elephant', tail: 'thin', trunk: 1, tusks: 1, wool: 1 },
  camel: { L: .9, legH: 1.0, chest: [.29, .31, .35], hip: [.28, .3, .33], neck: .62, neckA: .85, head: .24, snout: 1.15, legR: .062, hoof: 1, ears: 'small', tail: 'thin', humps: 1 },
  croc: { L: 1.25, legH: .17, chest: [.3, .22, .38], hip: [.28, .21, .36], lift: 0, neck: .1, neckA: 1.5, head: .3, snout: 2.3, flat: .55, legR: .085, splay: .9, ears: 'none', tail: 'thick', scutes: 1 },
  lizard: { L: .9, legH: .19, chest: [.23, .19, .3], hip: [.21, .18, .28], neck: .16, neckA: 1.2, head: .28, snout: .9, flat: .72, legR: .064, splay: .8, ears: 'none', tail: 'thick' },
  dragonling: { L: .52, legH: .3, chest: [.3, .3, .3], hip: [.32, .31, .31], lift: .1, neck: .14, neckA: .55, head: .38, snout: .75, legR: .1, ears: 'none', tail: 'thick', horn: 2 },
  drake: { L: .9, legH: .55, chest: [.34, .36, .38], hip: [.3, .31, .33], lift: .1, neck: .36, neckA: .8, head: .3, snout: 1.15, legR: .11, claws: 1, ears: 'none', tail: 'thick', horn: 2, back: 'spikes', brow: 1 },
  wyvern: { L: 1.0, legH: .65, chest: [.38, .4, .42], hip: [.32, .33, .35], lift: .14, neck: .5, neckA: .7, head: .3, snout: 1.3, legR: .125, claws: 1, ears: 'none', tail: 'thick', horn: 2, wings: 1, back: 'spikes', brow: 1 },
  crystaldragon: { L: .95, legH: .6, chest: [.34, .36, .38], hip: [.3, .31, .33], lift: .12, neck: .45, neckA: .65, head: .31, snout: 1.0, legR: .1, ears: 'none', tail: 'thick', horn: 2, wings: 1 },
  mole: { L: .5, legH: .15, chest: [.33, .29, .31], hip: [.33, .29, .31], neck: .03, neckA: 1.35, head: .3, snout: 1.05, legR: .075, paw: 1.9, claws: 1, ears: 'none', tail: 'puff', eyeK: .6 },
  armadillo: { L: .58, legH: .23, chest: [.3, .3, .32], hip: [.32, .32, .34], neck: .06, neckA: 1.25, head: .25, snout: 1.35, legR: .066, claws: 1, ears: 'small', tail: 'thin', bands: 1 },
  beaver: { L: .6, legH: .19, chest: [.3, .3, .31], hip: [.36, .35, .36], neck: .06, neckA: .8, head: .31, snout: .5, legR: .078, ears: 'small', tail: 'paddle', buck: 1 },
  otter: { L: .85, legH: .23, chest: [.22, .22, .28], hip: [.23, .23, .28], lift: .04, neck: .24, neckA: .7, head: .29, snout: .55, legR: .062, ears: 'small', tail: 'thick' },
  // ---- 進化後専用の姿 ----
  ram: { L: .78, legH: .5, chest: [.36, .38, .38], hip: [.32, .34, .34], lift: .06, neck: .14, neckA: .9, head: .27, snout: .75, legR: .075, hoof: 1, ears: 'side', tail: 'puff', wool: 1, bigHorns: 1.8, brow: 1 },
  ibex: { L: .9, legH: .78, chest: [.32, .36, .38], hip: [.28, .31, .33], lift: .1, neck: .34, neckA: .45, head: .26, snout: 1.1, legR: .072, hoof: 1, ears: 'side', tail: 'puff', bigHorns: 2.4, sweep: 1, brow: 1 },
  ankylo: { L: 1.15, legH: .26, chest: [.46, .38, .48], hip: [.48, .4, .5], lift: 0, neck: .08, neckA: 1.4, head: .28, snout: .8, flat: .8, legR: .13, claws: 1, ears: 'none', tail: 'club', plates: 1, spikesSide: 1, brow: 1 },
  mammothking: { L: 1.05, legH: .9, chest: [.52, .55, .52], hip: [.46, .48, .47], hump: .36, neck: .1, neckA: 1.0, head: .44, snout: .3, legR: .2, ears: 'elephant', tail: 'thin', trunk: 1, tusks: 1.6, back: 'crystal', forceBack: 1, plates: 1, brow: 1 },
  crocking: { L: 1.5, legH: .3, chest: [.42, .32, .5], hip: [.38, .3, .46], lift: .04, neck: .14, neckA: 1.4, head: .33, snout: 2.0, flat: .62, legR: .13, splay: .6, claws: 1, ears: 'none', tail: 'thick', scutes: 1, brow: 1 },
  drake: { L: .9, legH: .55, chest: [.34, .36, .38], hip: [.3, .31, .33], lift: .1, neck: .36, neckA: .8, head: .3, snout: 1.15, legR: .11, claws: 1, ears: 'none', tail: 'thick', horn: 2, back: 'spikes', brow: 1 },
};
const TAIL_SPECIAL = new Set(['flame', 'bolt', 'leaf', 'twin', 'ghost', 'spike', 'stinger', 'paddle', 'fin', 'fluffy']);

function planQuad(K, M, pv, Q) {
  M.plan = 'quad';
  const s = K.st, c1 = K.c1;
  const L = Q.L * lerp(0.86, 1, s);
  const legH = Q.legH * lerp(0.8, 1.03, s);
  const headR = Q.head * lerp(1.24, 0.97, s);
  const neck = (Q.neck ?? 0.25) * lerp(0.7, 1.05, s);
  const snout = (Q.snout ?? 0.4) * lerp(0.65, 1.04, s);
  const mus = lerp(0.97, 1.08, s);
  const cR = Q.chest.map((v, i) => v * (i === 0 ? mus : 1));
  const hR = Q.hip.slice();
  const lift = Q.lift ?? 0.06, splay = Q.splay || 0;
  const by = legH + hR[1] * 0.5;
  const cy = by + lift + (cR[1] - hR[1]) * 0.5;
  const cz = L * 0.5, hz = -L * 0.5;
  const P = new Part([ell([0, cy, cz], cR, c1, { k: 0, rot: [-lift * 0.9, 0, 0] }), ell([0, by, hz], hR, c1, { k: 0.2 })]);
  if (L > 0.72) P.add(ell([0, (by + cy) / 2, 0], [(cR[0] + hR[0]) * 0.46, (cR[1] + hR[1]) * 0.44, L * 0.34], c1, { k: 0.2 }));
  if (Q.hump) P.add(ell([0, cy + cR[1] * 0.58, cz - cR[2] * 0.2], [cR[0] * 0.72, Q.hump, cR[2] * 0.72], c1, { k: 0.18 }));
  // 首
  const na = Q.neckA ?? 0.7, nd = [0, Math.cos(na), Math.sin(na)];
  const n0 = [0, cy + cR[1] * 0.3, cz + cR[2] * 0.45];
  const neckR = Math.min(cR[0], cR[1]) * (Q.neckK ?? 0.55);
  const n1 = [0, n0[1] + nd[1] * neck, n0[2] + nd[2] * neck];
  if (neck > 0.05) P.add(cap(n0, n1, neckR, neckR * 0.85, c1, { k: 0.12 }));
  const hp = [0, n1[1] + nd[1] * headR * 0.3 + headR * 0.18, n1[2] + nd[2] * headR * 0.42 + headR * 0.05];
  // おなか・胸の明るい色
  P.paint(ell([0, Math.min(cy, by) - cR[1] * 0.62, 0], [cR[0] * 0.74, cR[1] * 0.5, L * 0.55 + cR[2] * 0.35]), K.belly, 0.035);
  P.paint(ell([0, cy - cR[1] * 0.1, cz + cR[2] * 0.82], [cR[0] * 0.6, cR[1] * 0.7, 0.14]), K.belly, 0.035);
  if (Q.mane === 2) {
    // 首すじのたてがみ（馬）
    const mc = mix(K.c2, K.dark, lum(K.c2) > 0.8 ? 0.15 : 0);
    for (let i = 0; i <= 5; i++) { const t = i / 5; const b = [0, lerp(n0[1], n1[1], t) + neckR * 0.7, lerp(n0[2], n1[2], t) - neckR * 0.35]; const Lm = neckR * (1.3 - t * 0.5); P.add(cap(b, [0, b[1] + Lm * 0.6, b[2] - Lm * 0.9], neckR * 0.42, neckR * 0.08, mc, { k: neckR * 0.25 })); }
  }
  if (Q.plates) for (const z of [cz * 0.4, hz * 0.3]) P.add(ell([0, cy + cR[1] * 0.2, z], [cR[0] * 1.06, cR[1] * 0.75, cR[2] * 0.32], mix(c1, K.dark, 0.2), { k: 0.04 }));
  if (Q.back && (!K.f.back || Q.forceBack)) K.f.back = Q.back;
  if (Q.spikesSide) for (let i = 0; i < 5; i++) for (const sx of [-1, 1]) { const z = lerp(cz, hz, i / 4), y = lerp(cy, by, i / 4); P.add(cap([sx * cR[0] * 0.85, y + cR[1] * 0.1, z], [sx * cR[0] * 1.35, y + cR[1] * 0.3, z - 0.05], cR[0] * 0.16, cR[0] * 0.02, K.hornCol, { k: 0.04 })); }
  if (Q.bands) for (let i = 0; i < 5; i++) P.paint(box([0, by + hR[1] * 0.6, lerp(cz, hz, i / 4)], [1, 0.4, 0.025], 0), mix(K.c2, K.dark, 0.35), 0.012);
  if (Q.scutes) for (let i = 0; i < 8; i++) for (const x of [-1, 1]) { const z = lerp(cz + cR[2] * 0.3, hz - hR[2] * 0.4, i / 7); P.add(sph([x * cR[0] * 0.35, lerp(cy, by, i / 7) + cR[1] * 0.92, z], cR[0] * 0.15, mix(c1, K.dark, 0.25), { k: 0.03 })); }
  const A = { y: by, z0: cz + 0.02, z1: hz - 0.02, w: cR[0], top: topFn(P), neck: [0, n1[1], n1[2] - neckR * 0.4], wingZ: cz - 0.05 };
  backShapes(K, P, A); bodyPaints(K, P, A);
  M.body = K.add(pv, K.mesh(P, 'body'));
  // 脚
  const lr = Q.legR * lerp(1.06, 1, s);
  const fTop = cy - cR[1] * 0.45, hTop = by - hR[1] * 0.35, cs = Math.cos(splay);
  const sock = (K.ex.has('socks') || K.T.includes('fire')) && s >= 0.5 ? K.sock : null;
  const lo = { sock, claws: Q.claws || K.ex.has('claws') || (K.fierce && s >= 1), hoof: Q.hoof, paw: Q.paw };
  const gF = K.mesh(legPart(K, fTop / cs, lr, true, c1, lo), 'limb');
  const gH = K.mesh(legPart(K, hTop / cs, lr * (Q.hind ? 1.05 : 1), false, c1, { ...lo, thigh: Q.hind || 1 }), 'limb');
  for (const [sx, front] of [[-1, 1], [1, 1], [-1, 0], [1, 0]]) {
    const top = front ? fTop : hTop;
    const j = K.joint(pv, [sx * (front ? cR[0] * 0.6 : hR[0] * 0.62), top, front ? cz + 0.03 : hz - 0.02], [0, 0, sx * splay]);
    K.add(j, front ? gF : gH);
    j.len = top; M.legs.push(j);
  }
  // 変異種：まんなかにも もう1対の 脚（6本足）
  if (Q.legs6) for (const sx of [1, -1]) { const top = (fTop + hTop) / 2; const j = K.joint(pv, [sx * (cR[0] + hR[0]) * 0.31, top, 0], [0, 0, sx * splay]); K.add(j, gF); j.len = top; M.legs.push(j); }
  // 頭
  const head = mammalHead(K, headR, { snout, flat: Q.flat, brow: Q.brow && s > 0.4, cheeks: Q.flat ? false : undefined });
  const hj = K.joint(pv, hp, [Q.flat ? 0.05 : 0, 0, 0]);
  K.add(hj, K.mesh(head.part, 'head'));
  head.node = hj; M.head = hj; M.headInfo = head;
  if (Q.noseHorn) { const t = head.part.surface([0, 0, headR * 0.5], [0, 0.7, 0.75]).p; const HP = new Part([cap([t[0], t[1] - headR * 0.1, t[2] - headR * 0.05], [t[0], t[1] + headR * (0.75 + s * 0.4), t[2] + headR * 0.15], headR * 0.24, headR * 0.03, K.hornCol, { k: 0 })]); if (s > 0.6) HP.add(cap([t[0], t[1] - headR * 0.05, t[2] - headR * 0.45], [t[0], t[1] + headR * 0.4, t[2] - headR * 0.42], headR * 0.16, headR * 0.03, K.hornCol, { k: headR * 0.04 })); K.add(hj, K.mesh(HP, 'small'), { mat: MAT.glossy }); }
  if (Q.trunk) {
    const p = head.part.surface([0, -headR * 0.2, 0], [0, -0.25, 1]).p;
    const tl = tailChain(K, M, hj, [p[0], p[1], p[2] - headR * 0.1], 4, headR * 0.32, headR * 0.2, c1, -0.35, -0.32, 0, null, 0.55);
    void tl; M.chains[M.chains.length - 1].trunk = true;
  }
  if (Q.tusks && (s > 0.4 || K.f.face === 'tusks')) for (const sx of [-1, 1]) { const p = head.part.surface([0, -headR * 0.3, 0], [sx * 0.45, -0.45, 0.8]).p; const TP = new Part(); let prev = p; const tk = +Q.tusks || 1; for (let i = 1; i <= 4; i++) { const a = i / 4; const q = [p[0] + sx * headR * 0.25 * a * tk, p[1] - headR * 0.75 * Math.sin(a * 1.4) * tk + headR * 0.55 * a * a * tk, p[2] + headR * 0.9 * a * tk]; TP.add(cap(prev, q, headR * (0.15 - a * 0.025), headR * (0.13 - a * 0.025), [1, 0.96, 0.86], { k: headR * 0.03 })); prev = q; } K.add(hj, K.mesh(TP, 'small'), { mat: MAT.glossy }); }
  const ears = K.f.ears === 'none' ? 'none' : (Q.ears ?? K.f.ears);
  M.earStyle = ears;
  if (Q.horn && !K.f.horn) K.f.horn = s > 0.5 ? Q.horn : 1;
  if (Q.bigHorns) { K.f.horn = 2; K.f.hornStyle = Q.sweep ? 'sweep' : 'curl'; K.hornScale = Q.bigHorns; if (lum(K.c1) > 0.7) K.hornCol = [0.62, 0.48, 0.34]; }
  backNodes(K, M, pv, A);
  if (Q.wings && K.f.back !== 'wings') addWings(K, M, pv, A);
  if (K.d.wings && K.f.back !== 'wings') addWings(K, M, pv, A);
  M.tailBase = [0, by + hR[1] * 0.15, hz - hR[2] * 0.85];
  M.tailType = Q.tail === 'squirrel' ? 'squirrel' : TAIL_SPECIAL.has(K.f.tail) ? K.f.tail : (Q.tail ?? K.f.tail);
  M.tailR = hR[1] * 0.5;
  M.anchor = A;
  M.eyeCfg = { dir: [0.47 + Math.min(snout, 1.5) * 0.08, 0.2 + (Q.flat ? 0.25 : 0), 0.85 - Math.min(snout, 1.5) * 0.05], size: 0.6 * (Q.eyeK || 1) * (Q.flat ? 0.85 : 1) };
  return head;
}

// ---------------- 二足の骨格 ----------------
// hipY:脚の長さ tH:胴の高さ tw:胴の幅 sh:肩幅 waist:腰の細さ head:頭 aL/ar:腕の長さ/太さ fist:手の大きさ
// lr:脚の太さ foot:足の大きさ hunch:前かがみ robe:すそ広がりの服（脚なし） float:浮いている
const BA = {
  athlete: { hipY: .6, tH: .6, tw: .26, sh: 1.35, waist: .8, head: .27, snout: .5, aL: .55, ar: .068, fist: 1.25, lr: .085, foot: 1.2 },
  brawler: { hipY: .48, tH: .62, tw: .33, sh: 1.55, waist: .78, head: .28, snout: .35, aL: .56, ar: .1, fist: 1.85, lr: .105, foot: 1.3, hunch: .12, brow: 1 },
  titan: { hipY: .58, tH: .82, tw: .4, sh: 1.7, waist: .75, head: .25, snout: .3, aL: .72, ar: .14, fist: 2.0, lr: .15, foot: 1.4, hunch: .15, brow: 1 },
  kid: { hipY: .28, tH: .38, tw: .28, sh: 1.05, waist: 1.0, head: .38, snout: .3, aL: .3, ar: .075, fist: 1.6, lr: .09, foot: 1.3 },
  runner: { hipY: .7, tH: .48, tw: .22, sh: 1.15, waist: .85, head: .31, snout: .4, aL: .45, ar: .055, fist: 1.2, lr: .085, foot: 1.6, digi: 1 },
  beast: { hipY: .52, tH: .78, tw: .42, sh: 1.45, waist: .9, head: .3, snout: .65, aL: .72, ar: .14, fist: 1.5, lr: .15, foot: 1.5, hunch: .4, claws: 1, belly: 1, brow: 1 },
  knight: { hipY: .55, tH: .62, tw: .3, sh: 1.45, waist: .8, head: .26, snout: 0, aL: .56, ar: .085, fist: 1.4, lr: .1, foot: 1.35, armor: 1, visor: 1 },
  smith: { hipY: .28, tH: .46, tw: .34, sh: 1.3, waist: 1.05, head: .34, snout: .3, aL: .38, ar: .1, fist: 1.6, lr: .11, foot: 1.3, apron: 1 },
  mummy: { hipY: .3, tH: .4, tw: .27, sh: 1.0, waist: 1.0, head: .37, snout: 0, aL: .34, ar: .07, fist: 1.1, lr: .085, foot: 1.0, zombie: 1 },
  mummyking: { hipY: .6, tH: .7, tw: .3, sh: 1.35, waist: .9, head: .28, snout: 0, aL: .6, ar: .075, fist: 1.1, robe: 1.3 },
  princess: { hipY: .48, tH: .44, tw: .2, sh: 1.05, waist: .68, head: .31, snout: .2, aL: .42, ar: .05, fist: 1.0, robe: 2.0 },
  angelkid: { hipY: .24, tH: .34, tw: .24, sh: 1.0, waist: 1.0, head: .39, snout: .1, aL: .26, ar: .06, fist: 1.2, robe: 1.45, float: 1 },
  angel: { hipY: .6, tH: .52, tw: .21, sh: 1.15, waist: .72, head: .27, snout: .1, aL: .5, ar: .05, fist: 1.0, robe: 1.7, float: 1 },
  darklord: { hipY: .68, tH: .62, tw: .26, sh: 1.65, waist: .7, head: .26, snout: .1, aL: .6, ar: .06, fist: 1.2, robe: 1.55, float: 1, pads: 1 },
  fairy: { hipY: .32, tH: .36, tw: .19, sh: 1.0, waist: .72, head: .37, snout: .1, aL: .3, ar: .045, fist: 1.0, robe: 1.7, float: 1 },
  maiden: { hipY: .44, tH: .44, tw: .2, sh: 1.0, waist: .7, head: .3, snout: .1, aL: .4, ar: .05, fist: 1.0, robe: 2.0, petals: 1 },
  insectoid: { hipY: .6, tH: .58, tw: .25, sh: 1.35, waist: .55, head: .23, snout: 0, aL: .62, ar: .06, fist: 1.0, lr: .07, foot: 1.0, digi: 1, carapace: 1, blades: 1 },
  frog: { hipY: .13, tH: .42, tw: .34, sh: .95, waist: 1.25, head: .4, snout: 0, aL: .26, ar: .065, fist: 1.3, lr: .09, foot: 1.9, frog: 1 },
  frogfighter: { hipY: .36, tH: .55, tw: .36, sh: 1.35, waist: 1.0, head: .36, snout: 0, aL: .5, ar: .1, fist: 1.7, lr: .1, foot: 1.8, frog: 1 },
  toadboss: { hipY: .22, tH: .64, tw: .46, sh: 1.05, waist: 1.3, head: .4, snout: 0, aL: .46, ar: .1, fist: 1.4, lr: .12, foot: 1.7, frog: 1, belly: 1 },
  penguin: { hipY: .08, tH: .7, tw: .32, sh: .9, waist: 1.2, head: .3, snout: 0, aL: .38, ar: .055, fist: 0, lr: .06, foot: 1.7, penguin: 1 },
  // ---- 進化後専用の姿 ----
  lionknight: { hipY: .58, tH: .66, tw: .32, sh: 1.5, waist: .78, head: .3, snout: .6, aL: .58, ar: .09, fist: 1.5, lr: .1, foot: 1.4, claws: 1, armor: 1, mane: 1, tail: 'lion', digi: 1, brow: 1, ears: 'round' },
  swimmer: { hipY: .44, tH: .52, tw: .25, sh: 1.1, waist: .85, head: .33, snout: .55, aL: .4, ar: .06, fist: 1.0, lr: .08, foot: 1.9, tail: 'thick', ears: 'small' },
  digger: { hipY: .34, tH: .62, tw: .38, sh: 1.45, waist: 1.0, head: .27, snout: 1.15, aL: .5, ar: .1, fist: 2.0, claws: 1, hunch: .32, lr: .1, foot: 1.3, eyeK: .65, ears: 'none' },
  catfolk: { hipY: .5, tH: .5, tw: .22, sh: 1.05, waist: .72, head: .34, snout: .4, aL: .44, ar: .05, fist: 1.0, robe: 1.45, float: 1, ears: 'pointy' },
  critter: { hipY: .3, tH: .44, tw: .27, sh: 1.0, waist: 1.0, head: .37, snout: .45, aL: .3, ar: .06, fist: 1.25, lr: .085, foot: 1.5, digi: 1, tail: 'squirrel', ears: 'tuft' },
  beetleknight: { hipY: .6, tH: .62, tw: .28, sh: 1.5, waist: .6, head: .25, snout: 0, aL: .58, ar: .075, fist: 1.3, lr: .08, foot: 1.1, digi: 1, carapace: 1, shell: 1 },
  crabman: { hipY: .44, tH: .58, tw: .38, sh: 1.45, waist: .9, head: .27, snout: 0, aL: .55, ar: .1, fist: 0, pincer: 1, carapace: 1, lr: .09, foot: 1.2, stalks: 1 },
  builder: { hipY: .3, tH: .5, tw: .36, sh: 1.25, waist: 1.1, head: .34, snout: .5, aL: .38, ar: .1, fist: 1.5, lr: .11, foot: 1.4, buck: 1, tail: 'paddle', apron: 1, ears: 'small' },
  crocman: { hipY: .55, tH: .64, tw: .33, sh: 1.4, waist: .85, head: .28, snout: 2.0, flat: .62, aL: .52, ar: .09, fist: 1.4, claws: 1, hunch: .18, lr: .11, foot: 1.5, tail: 'thick', brow: 1, ears: 'none' },
  lizardman: { hipY: .55, tH: .52, tw: .25, sh: 1.15, waist: .8, head: .28, snout: 1.15, flat: .72, aL: .44, ar: .065, fist: 1.1, claws: 1, lr: .08, foot: 1.4, digi: 1, tail: 'thick', hunch: .15, ears: 'none' },
  vampire: { hipY: .58, tH: .56, tw: .24, sh: 1.35, waist: .68, head: .31, snout: .3, aL: .5, ar: .06, fist: 1.0, robe: 1.6, float: 1, wings: 'bat', ears: 'bat' },
  rhinobrute: { hipY: .52, tH: .8, tw: .44, sh: 1.45, waist: .95, head: .32, snout: 1.25, aL: .68, ar: .14, fist: 1.6, lr: .15, foot: 1.5, hunch: .35, noseHorn: 1, armor: 1, brow: 1, belly: 1, ears: 'small' },
  emperor: { hipY: .1, tH: 1.05, tw: .3, sh: .9, waist: 1.1, head: .27, snout: 0, aL: .5, ar: .055, fist: 0, lr: .06, foot: 1.8, penguin: 1, emperor: 1 },
  shogun: { hipY: .62, tH: .66, tw: .32, sh: 1.6, waist: .8, head: .27, snout: 0, aL: .6, ar: .09, fist: 1.4, robe: 1.5, float: 1, armor: 1, visor: 1, kabuto: 1 },
  sunbearer: { hipY: .5, tH: .55, tw: .26, sh: 1.3, waist: .6, head: .25, snout: 0, aL: .52, ar: .07, fist: 1.2, lr: .075, foot: 1.1, digi: 1, carapace: 1, raise: 1, shell: 1 },
  flyknight: { hipY: .55, tH: .55, tw: .22, sh: 1.25, waist: .55, head: .24, snout: 0, aL: .5, ar: .06, fist: 1.0, lr: .065, foot: 1.0, digi: 1, carapace: 1, bugWings: 'dragonfly', float: 1, blades: 1 },
};

function planBiped(K, M, pv, B) {
  M.plan = 'biped';
  const s = K.st, c1 = K.c1, c2 = K.c2;
  const hipY = B.hipY * lerp(0.78, 1.03, s), tH = B.tH * lerp(0.86, 1.03, s), tw = B.tw * lerp(0.96, 1.05, s);
  const headR = B.head * lerp(1.22, 0.97, s);
  const sh = B.sh, wa = B.waist, hunch = B.hunch || 0;
  if (B.float) M.floating = true;
  const yW = hipY + tH * 0.28, yC = hipY + tH * 0.7, fz = hunch * tH * 0.55;
  const P = new Part();
  if (B.penguin) {
    P.add(ell([0, hipY + tH * 0.5, 0], [tw, tH * 0.56, tw * 0.86], c1, { k: 0 }));
    P.paint(ell([0, hipY + tH * 0.45, tw * 0.45], [tw * 0.78, tH * 0.48, tw * 0.6]), WHITE, 0.03);
  } else {
    P.add(ell([0, yW, 0], [tw * wa, tH * 0.36, tw * 0.8 * Math.max(wa, 0.85)], c1, { k: 0 }));
    P.add(ell([0, yC, fz], [tw * sh, tH * 0.38, tw * 0.85], c1, { k: 0.14, rot: [hunch * 0.5, 0, 0] }));
    if (B.belly || B.frog) P.add(ell([0, yW + tH * 0.08, tw * 0.3], [tw * wa * 1.05, tH * 0.4, tw * 0.78], c1, { k: 0.12 }));
    P.paint(ell([0, (yW + yC) / 2, tw * 0.6], [tw * 0.72, tH * 0.5, tw * 0.55]), B.frog ? mix(K.belly, [1, 0.95, 0.75], 0.3) : K.belly, 0.035);
  }
  if (B.pads) for (const sx of [-1, 1]) P.add(ell([sx * tw * sh * 0.95, yC + tH * 0.2, fz], [tw * 0.55, tH * 0.16, tw * 0.6], mix(c1, K.dark, 0.35), { k: 0.06, rot: [0, 0, sx * 0.3] }));
  if (B.armor) { P.paint(ell([0, yC, fz + tw * 0.5], [tw * sh * 0.85, tH * 0.38, tw * 0.5]), K.metal, 0.02); for (const sx of [-1, 1]) P.add(ell([sx * tw * sh * 0.92, yC + tH * 0.22, fz], [tw * 0.5, tH * 0.15, tw * 0.55], K.metal, { k: 0.04, rot: [0, 0, sx * 0.35] })); }
  if (B.carapace) P.add(ell([0, yC + tH * 0.05, fz - tw * 0.25], [tw * sh * 0.9, tH * 0.42, tw * 0.75], mix(c1, K.dark, 0.25), { k: 0.05 }));
  if (B.shell) { for (const sx of [-1, 1]) P.add(ell([sx * tw * 0.42, yC - tH * 0.05, -tw * 0.62], [tw * 0.55, tH * 0.62, tw * 0.38], c2, { k: 0.03, rot: [0.15, 0, sx * 0.08] })); P.paint(box([0, yC, -tw * 1.0], [tw * 0.025, tH, tw * 0.4], 0), mix(c2, K.dark, 0.5), 0.006); }
  if (B.emperor) for (const sx of [-1, 1]) P.paint(ell([sx * tw * 0.75, hipY + tH * 0.92, tw * 0.2], [tw * 0.3, tH * 0.12, tw * 0.3]), [1, 0.78, 0.22], 0.03);
  if (B.apron) P.paint(box([0, yW, tw * 0.6], [tw * 0.7, tH * 0.42, tw * 0.5], 0.02), [0.45, 0.3, 0.2], 0.015);
  if (B.zombie || K.ex.has('wraps')) for (let i = 0; i < 6; i++) P.paint(tor([0, hipY + tH * (0.05 + i * 0.17), 0], tw * 1.05, tw * 0.07, WHITE, { rot: [0.25 * (i % 2 ? 1 : -1), 0, 0.12] }), [0.95, 0.92, 0.82], tw * 0.03);
  let floor = 0;
  if (B.robe) {
    // すそ広がりの服（ドレス・ローブ）。浮く種は地面から少し離す
    floor = B.float ? hipY * 0.35 : 0.02;
    const rc = B.petals ? mix(c2, WHITE, 0.15) : (K.ex.has('wraps') ? [0.95, 0.92, 0.82] : c2);
    P.add(cap([0, yW + tH * 0.12, 0], [0, floor + tw * 0.25, 0], tw * 0.75, tw * B.robe, rc, { k: 0.08 }));
    P.add(box([0, floor - 1, 0], [3, 1, 3], 0, null, { op: 'sub', k: 0.02 }));
    P.paint(box([0, floor + tw * 0.1, 0], [3, tw * 0.12, 3], 0), mix(rc, WHITE, 0.45), 0.01);
    if (B.petals) for (let i = 0; i < 7; i++) { const a = i / 7 * Math.PI * 2; P.add(ell([Math.cos(a) * tw * B.robe * 0.75, floor + tw * 0.55, Math.sin(a) * tw * B.robe * 0.75], [tw * 0.55, tw * 0.9, tw * 0.22], mix(rc, K.c1, (i % 2) * 0.3), { k: tw * 0.2, rot: [0, -a + Math.PI / 2, 0.45] })); }
  }
  // 首と頭の位置
  const hy = hipY + tH + headR * (B.penguin ? 0.45 : B.frog ? 0.35 : 0.62) - hunch * headR * 0.6, hz = fz * 1.6 + (B.frog ? tw * 0.12 : 0.02);
  if (!B.penguin && !B.frog) P.add(cap([0, yC + tH * 0.2, fz], [0, hy - headR * 0.55, hz], tw * 0.42, tw * 0.36, c1, { k: 0.08 }));
  const A = { y: yC, z0: tw * 0.2, z1: -tw * 0.5, w: tw, neck: [0, hipY + tH * 0.95, fz], belt: hipY + 0.05, wingZ: -tw * 0.35 };
  A.top = (() => { const base = new Part(P.shapes.slice()); return () => base.surface([0, yC, 0], [0, 0.35, -1], 3).p[1]; })();
  if (B.mane) K.ex.add('mane');
  if (K.f.back === 'spikes' || K.ex.has('spikes')) for (let i = 0; i < 4; i++) P.add(cap([0, hipY + tH * (0.95 - i * 0.2), -tw * 0.7], [0, hipY + tH * (1.1 - i * 0.2), -tw * 1.35], tw * 0.2, tw * 0.02, c2, { k: tw * 0.1 }));
  else if (['mane', 'wool', 'cloud', 'shell', 'fins', 'fin', 'sail', 'humps'].includes(K.f.back) || K.ex.has('mane')) backShapes(K, P, { ...A, z0: -tw * 0.4, z1: -tw * 0.6, top: () => hipY + tH * 0.95, neck: [0, hipY + tH * 0.95, -0.02] });
  bodyPaints(K, P, { ...A, z0: tw * 0.4, z1: -tw * 0.4, top: () => hipY + tH * 0.6 });
  M.body = K.add(pv, K.mesh(P, 'body'));
  // 脚（服で隠れる種はなし）
  if (!B.robe) {
    const lr = (B.lr || 0.09) * lerp(1.05, 1, s);
    const LP = legPart(K, hipY, lr, false, B.penguin ? [1, 0.62, 0.18] : c1, { digi: B.digi, claws: B.claws || K.ex.has('claws'), paw: B.foot, thigh: B.frog ? 1.5 : 1 });
    if (B.penguin) { LP.shapes.length = 0; LP.add(ell([0, -hipY + 0.03, 0.08], [lr * 1.6, lr * 0.5, lr * 2.4], [1, 0.62, 0.18], { k: 0 })); LP.add(cap([0, 0, 0], [0, -hipY + 0.03, 0.04], lr * 0.8, lr * 0.7, [1, 0.62, 0.18], { k: lr * 0.4 })); }
    const lg = K.mesh(LP, 'limb');
    const legX = tw * (B.frog ? 0.85 : 0.5);
    for (const sx of [-1, 1]) { const j = K.joint(pv, [sx * legX, hipY + 0.02, 0], [0, 0, B.frog ? sx * 0.5 : 0]); K.add(j, lg); j.len = hipY; M.legs.push(j); }
  }
  // 腕
  const aL = B.aL * lerp(0.82, 1.03, s), ar = B.ar * lerp(1.05, 1, s);
  for (const sx of [-1, 1]) {
    const AP = new Part();
    if (B.penguin) {
      AP.add(ell([0, -aL * 0.45, 0], [ar * 0.7, aL * 0.55, ar * 2.4], c1, { k: 0, rot: [0, 0, 0] }));
    } else {
      AP.add(sph([0, 0, 0], ar * 1.35, c1, { k: 0 }));
      AP.add(cap([0, 0, 0], [0, -aL * 0.5, 0.03], ar * 1.15, ar * 0.95, c1, { k: ar * 0.5 }));
      AP.add(cap([0, -aL * 0.5, 0.03], [0, -aL, 0.07], ar * 0.95, ar * (B.fist > 1.5 ? 1.1 : 0.85), c1, { k: ar * 0.4 }));
      if (B.pincer) {
        // カニのハサミ（大きな爪）
        const cs = lerp(1.2, 1.7, s), pc = c2;
        AP.add(ell([0, -aL - ar * 1.2 * cs, ar * 0.6], [ar * 1.6 * cs, ar * 1.9 * cs, ar * 1.4 * cs], pc, { k: ar * 0.5 }));
        AP.add(cap([ar * 0.6, -aL - ar * 2.4 * cs, ar * 1.2], [ar * 0.9, -aL - ar * 4.6 * cs, ar * 1.6], ar * 0.9 * cs, ar * 0.12, pc, { k: ar * 0.3 }));
        AP.add(cap([-ar * 0.7, -aL - ar * 2.3 * cs, ar * 1.0], [-ar * 0.9, -aL - ar * 3.9 * cs, ar * 1.4], ar * 0.7 * cs, ar * 0.1, pc, { k: ar * 0.3 }));
      } else if (B.blades) AP.add(cap([0, -aL * 0.55, 0.05], [0, -aL * 1.05, ar * 3.5], ar * 0.6, ar * 0.05, K.hornCol, { k: ar * 0.2, sc: [0.35, 1, 1], pv: [0, -aL * 0.55, 0.05] }));
      else if (B.fist) AP.add(sph([0, -aL - ar * 0.3 * B.fist, 0.08], ar * 0.85 * B.fist, K.T.includes('fighting') || B.fist > 1.7 ? c2 : c1, { k: ar * 0.5 }));
      if (B.armor) AP.paint(cap([0, -aL * 0.5, 0.03], [0, -aL, 0.07], ar * 1.2, ar * 1.1), K.metal, ar * 0.1);
      if (B.claws || K.ex.has('claws')) for (const x of [-1, 0, 1]) AP.add(cap([x * ar * 0.6, -aL - ar * 0.7 * B.fist, ar * 0.9], [x * ar * 0.7, -aL - ar * 1.6 * B.fist, ar * 1.5], ar * 0.28, ar * 0.04, [0.98, 0.96, 0.9], { k: ar * 0.15 }));
    }
    const j = K.joint(pv, [sx * tw * sh * (B.penguin ? 1.0 : 0.98), yC + tH * (B.penguin ? 0.05 : 0.16), fz], B.raise ? [-0.25, 0, sx * 2.55] : [B.zombie ? -1.35 : -0.2, 0, sx * (B.penguin ? 0.35 : 0.28)]);
    K.add(j, K.mesh(AP, 'limb'));
    j.r0 = j.rot.slice(); j.len = aL; M.arms.push(j);
  }
  // 頭
  let head;
  if (B.frog) {
    const R = headR;
    const HP = new Part([ell([0, 0, 0], [R * 1.3, R * 0.78, R * 1.0], c1, { k: 0 })]);
    for (const sx of [-1, 1]) HP.add(sph([sx * R * 0.55, R * 0.55, R * 0.3], R * 0.38, c1, { k: R * 0.18 }));
    HP.paint(ell([0, -R * 0.45, R * 0.5], [R * 1.0, R * 0.35, R * 0.6]), K.belly, R * 0.05);
    head = { part: HP, R, c: [0, 0, 0] };
    M.eyeCfg = { dir: [0.5, 0.75, 0.45], size: 0.62 };
    M.faceCfg = { nose: false, mouthY: -R * 0.18, wide: 2.2 };
  } else if (B.penguin) {
    head = mammalHead(K, headR, { snout: 0, cheeks: true, muzzle: false });
    head.part.paint(ell([0, -headR * 0.2, headR * 0.6], [headR * 0.75, headR * 0.6, headR * 0.5]), WHITE, headR * 0.05);
    M.beak = { len: 0.9, hook: 0 };
    M.eyeCfg = { dir: [0.5, 0.25, 0.83], size: 0.55 };
    M.faceCfg = { nose: false, mouth: false };
  } else if (B.visor || K.ex.has('helmet')) {
    const R = headR;
    const HP = new Part([ell([0, 0, 0], [R * 1.0, R * 1.0, R * 1.0], K.metal, { k: 0 })]);
    HP.add(ell([0, -R * 0.1, R * 0.35], [R * 0.85, R * 0.8, R * 0.75], K.metal, { k: R * 0.1 }));
    HP.add(cap([0, R * 0.7, -R * 0.2], [0, R * 1.5, -R * 0.9], R * 0.18, R * 0.04, mix(c2, [0.9, 0.2, 0.2], 0.4), { k: R * 0.1, sc: [0.4, 1, 1], pv: [0, R * 0.7, -R * 0.2] }));
    HP.paint(box([0, R * 0.12, R * 0.9], [R * 0.75, R * 0.12, R * 0.4], 0), [0.08, 0.06, 0.12], R * 0.02);
    if (B.kabuto) {
      // かぶと（大きな前立てと しころ）
      HP.add(ell([0, -R * 0.15, -R * 0.35], [R * 1.35, R * 0.55, R * 1.05], mix(K.metal, K.dark, 0.35), { k: R * 0.1 }));
      for (const sx of [-1, 1]) HP.add(cap([sx * R * 0.3, R * 0.6, R * 0.6], [sx * R * 1.15, R * 1.75, R * 0.45], R * 0.2, R * 0.03, [1, 0.82, 0.25], { k: R * 0.05, sc: [1, 1, 0.35], pv: [sx * R * 0.3, R * 0.6, R * 0.6] }));
    }
    head = { part: HP, R, c: [0, 0, 0] };
    M.eyeCfg = { dir: [0.32, 0.15, 0.94], size: 0.45 };
    M.faceCfg = { nose: false, mouth: false, blush: false };
    M.noEars = true;
  } else {
    head = mammalHead(K, headR, { snout: (B.snout ?? 0.3) * lerp(0.7, 1, s), brow: B.brow && s > 0.4, flat: B.flat, cheeks: B.flat ? false : undefined });
    if (K.ex.has('wraps') || B.zombie) for (let i = 0; i < 3; i++) head.part.paint(tor([0, headR * (0.45 - i * 0.4), 0], headR * 1.0, headR * 0.09, WHITE, { rot: [0.2 * (i % 2 ? 1 : -1), 0, 0.1] }), [0.95, 0.92, 0.82], headR * 0.03);
    const sn = Math.min(1.5, B.snout || 0);
    M.eyeCfg = { dir: [0.45 + sn * 0.08, 0.16 + (B.flat ? 0.25 : 0), 0.88 - sn * 0.05], size: 0.6 * (B.eyeK || 1) * (B.flat ? 0.85 : 1) };
  }
  const hj = K.joint(pv, [0, hy, hz]);
  K.add(hj, K.mesh(head.part, 'head'));
  head.node = hj; M.head = hj; M.headInfo = head;
  if (B.frog) M.noEars = true;
  if (B.ears) M.earStyle = B.ears;
  if (B.buck) M.buck = true;
  if (B.stalks) { const SPk = new Part(); for (const sx of [-1, 1]) { SPk.add(cap([sx * headR * 0.35, headR * 0.6, headR * 0.3], [sx * headR * 0.6, headR * 1.45, headR * 0.35], headR * 0.12, headR * 0.1, c1, { k: headR * 0.05 })); SPk.add(sph([sx * headR * 0.62, headR * 1.55, headR * 0.38], headR * 0.22, [0.1, 0.08, 0.15], { k: headR * 0.04 })); SPk.paint(sph([sx * headR * 0.62 - headR * 0.06, headR * 1.62, headR * 0.55], headR * 0.07), WHITE, headR * 0.01); } K.add(hj, K.mesh(SPk, 'tiny')); M.eyeCfg.size *= 0.6; }
  if (B.noseHorn) { const t = head.part.surface([0, 0, headR * 0.5], [0, 0.7, 0.75]).p; const HP2 = new Part([cap([t[0], t[1] - headR * 0.1, t[2] - headR * 0.05], [t[0], t[1] + headR * 1.25, t[2] + headR * 0.2], headR * 0.26, headR * 0.03, K.hornCol, { k: 0 }), cap([t[0], t[1] - headR * 0.05, t[2] - headR * 0.45], [t[0], t[1] + headR * 0.5, t[2] - headR * 0.42], headR * 0.17, headR * 0.03, K.hornCol, { k: headR * 0.04 })]); K.add(hj, K.mesh(HP2, 'small'), { mat: MAT.glossy }); }
  if (B.raise) M.sunTop = [0, hy + headR * 2.6, hz + 0.05];
  backNodes(K, M, pv, { ...A, z0: -tw * 0.3, z1: -tw * 0.55, wingZ: -tw * 0.45, top: () => hipY + tH * 0.95, w: tw * 0.9 });
  if (B.wings === 'bat' && K.f.back !== 'batwings') addWings(K, M, pv, { ...A, z0: -tw * 0.3, z1: -tw * 0.55, wingZ: -tw * 0.45, top: () => hipY + tH * 0.95, w: tw * 1.2 }, true);
  if (B.bugWings) addBugWings(K, M, pv, B.bugWings, yC + tH * 0.1, s, [0, 0, -tw * 0.7], 1.3);
  M.tailBase = [0, hipY + 0.14, -tw * 0.62];
  M.tailType = TAIL_SPECIAL.has(K.f.tail) ? K.f.tail : (B.tail ?? K.f.tail);
  M.anchor = A;
  return head;
}

// ---------------- 鳥 ----------------
const BRD = {
  chick: { body: [.34, .33, .34], by: .36, head: 0, legL: .06, wing: .55, beak: .5, round: 1 },
  songbird: { body: [.26, .27, .36], by: .5, head: .27, legL: .2, wing: 1.0, beak: 1.0, tilt: .3 },
  falcon: { body: [.24, .28, .38], by: .55, head: .24, legL: .24, wing: 1.3, beak: .85, hook: 1, tilt: .55 },
  raptor: { body: [.3, .36, .46], by: .7, head: .25, legL: .3, wing: 1.3, beak: 1.0, hook: 1, crest: 1, tilt: .6, talon: 1 },
  owl: { body: [.33, .37, .33], by: .48, head: .34, legL: .12, wing: .85, beak: .42, hook: 1, disc: 1, tilt: 0, tufts: 1 },
  duck: { body: [.3, .27, .38], by: .3, head: .25, neck: .12, legL: .12, wing: .8, bill: 1, tilt: .05, webbed: 1 },
  swan: { body: [.33, .28, .44], by: .36, head: .2, neck: .62, legL: .12, wing: 1.15, bill: 1, swan: 1, webbed: 1 },
  vulture: { body: [.32, .34, .4], by: .58, head: .2, neck: .3, legL: .26, wing: 1.45, beak: 1.1, hook: 1, bald: 1, ruff: 1, tilt: .5, talon: 1 },
  phoenix: { body: [.28, .33, .42], by: .68, head: .25, neck: .2, legL: .3, wing: 1.75, beak: .9, hook: 1, crest: 2, plumes: 1, tilt: .55, talon: 1 },
  bat: { body: [.3, .31, .28], by: .55, head: 0, legL: .08, bat: 1 },
  greatowl: { body: [.36, .52, .34], by: .66, head: .37, legL: .16, wing: 1.2, beak: .5, hook: 1, disc: 1, tilt: -.05, tufts: 1, bigTufts: 1, cape: 1, talon: 1 },
  condor: { body: [.36, .42, .52], by: .78, head: .22, neck: .36, legL: .3, wing: 2.1, beak: 1.25, hook: 1, bald: 1, ruff: 1, crest: 1, tilt: .5, talon: 1, spread: 1 },
};
function planBird(K, M, pv, Bd) {
  M.plan = 'bird';
  const s = K.st, c1 = K.c1;
  if (Bd.bat) return planBat(K, M, pv, Bd);
  const tilt = Bd.tilt ?? 0.3;
  const R = Bd.body.map(v => v * lerp(1.05, 1, s));
  const by = Bd.by * lerp(0.85, 1.02, s) + Bd.legL * 0.5;
  const P = new Part([ell([0, by, 0], R, c1, { k: 0, rot: [-tilt, 0, 0] })]);
  if (!Bd.round) P.add(ell([0, by - R[1] * 0.15, R[2] * 0.35], [R[0] * 0.88, R[1] * 0.85, R[2] * 0.6], c1, { k: 0.12 }));
  P.add(cap([0, by + Math.sin(tilt) * R[2] * 0.4, -R[2] * 0.62], [0, by + Math.sin(tilt) * R[2] * 0.75, -R[2] * 1.15], R[1] * 0.42, R[1] * 0.15, c1, { k: 0.1 }));
  P.paint(ell([0, by - R[1] * 0.35, R[2] * 0.4], [R[0] * 0.72, R[1] * 0.72, R[2] * 0.62]), K.belly, 0.04);
  let headR = Bd.head * lerp(1.2, 0.97, s), hy, hz;
  if (Bd.round) { headR = R[1]; hy = by + R[1] * 0.05; hz = 0; }
  else if (Bd.swan) {
    // S字の長い首
    const pts = [[0, by + R[1] * 0.4, R[2] * 0.55], [0, by + R[1] * 0.9 + Bd.neck * 0.3, R[2] * 0.85], [0, by + R[1] + Bd.neck * 0.75, R[2] * 0.55], [0, by + R[1] + Bd.neck * 1.05, R[2] * 0.75]];
    for (let i = 0; i < 3; i++) P.add(cap(pts[i], pts[i + 1], R[0] * (0.42 - i * 0.07), R[0] * (0.35 - i * 0.06), c1, { k: 0.06 }));
    hy = pts[3][1] + headR * 0.4; hz = pts[3][2] + headR * 0.2;
  } else {
    hy = by + R[1] * 0.85 + headR * 0.55 + (Bd.neck || 0); hz = R[2] * 0.45 + Math.sin(tilt) * 0.08;
    P.add(cap([0, by + R[1] * 0.4, R[2] * 0.3], [0, hy - headR * 0.5, hz - headR * 0.2], R[0] * 0.5, R[0] * 0.42, Bd.bald ? mix(c1, [1, 0.7, 0.6], 0.5) : c1, { k: 0.1 }));
  }
  if (Bd.cape) { P.add(cap([0, by + R[1] * 0.75, -R[2] * 0.4], [0, by - R[1] * 0.9, -R[2] * 0.95], R[0] * 1.0, R[0] * 1.3, mix(K.c2, K.dark, 0.25), { k: 0.08, sc: [1, 1, 0.35], pv: [0, by, -R[2] * 0.6] })); }
  if (Bd.ruff) P.add(tor([0, by + R[1] * 0.75, R[2] * 0.3], R[0] * 0.55, R[0] * 0.22, mix(K.c2, WHITE, 0.6), { k: 0.08, rot: [0.6, 0, 0] }));
  const A = { y: by, z0: R[2] * 0.3, z1: -R[2] * 0.6, w: R[0], top: topFn(P), neck: [0, hy - headR, hz - 0.1], wingZ: R[2] * 0.05 };
  bodyPaints(K, P, A);
  M.body = K.add(pv, K.mesh(P, 'body'));
  // 足（水かき・かぎ爪）
  const fc = Bd.talon ? [0.95, 0.75, 0.25] : [0.98, 0.62, 0.18];
  const legL = by - R[1] * 0.6;
  const LP = new Part([cap([0, 0, 0], [0, -legL + 0.05, 0.02], 0.045 * (Bd.talon ? 1.3 : 1), 0.035, fc, { k: 0 })]);
  if (Bd.webbed) LP.add(ell([0, -legL + 0.03, 0.1], [0.12, 0.025, 0.12], fc, { k: 0.03 }));
  else for (const a of [-0.5, 0, 0.5]) LP.add(cap([0, -legL + 0.05, 0.02], [Math.sin(a) * 0.14, -legL + 0.02, 0.02 + Math.cos(a) * 0.14], 0.03, 0.018, fc, { k: 0.02 }));
  if (Bd.talon) for (const a of [-0.5, 0, 0.5]) LP.add(cap([Math.sin(a) * 0.14, -legL + 0.02, 0.02 + Math.cos(a) * 0.14], [Math.sin(a) * 0.17, -legL - 0.01, 0.06 + Math.cos(a) * 0.15], 0.018, 0.004, [0.2, 0.15, 0.15], { k: 0.005 }));
  const lg = K.mesh(LP, 'small');
  for (const sx of [-1, 1]) { const j = K.joint(pv, [sx * R[0] * 0.42, legL, 0.04]); K.add(j, lg); j.len = legL; M.legs.push(j); }
  // 頭
  if (Bd.crest) K.ex.add('crest');
  let head;
  if (Bd.round) {
    head = { part: P, R: headR, c: [0, by + R[1] * 0.12, R[2] * 0.15], node: pv };
    M.head = null; M.headInfo = head;
    M.eyeCfg = { dir: [0.42, 0.25, 0.87], size: 0.42 };
  } else {
    head = mammalHead(K, headR, { snout: 0, cheeks: s < 0.6, muzzle: false, col: Bd.bald ? mix(c1, [1, 0.7, 0.6], 0.6) : c1 });
    if (Bd.disc) head.part.paint(ell([0, 0, headR * 0.55], [headR * 0.95, headR * 0.85, headR * 0.6]), mix(K.belly, WHITE, 0.3), headR * 0.06);
    const hj = K.joint(pv, [0, hy, hz]);
    K.add(hj, K.mesh(head.part, 'head'));
    head.node = hj; M.head = hj; M.headInfo = head;
    M.eyeCfg = { dir: Bd.disc ? [0.38, 0.12, 0.92] : [0.6, 0.22, 0.77], size: Bd.disc ? 0.66 : 0.6 };
  }
  M.beak = { len: Bd.beak || 0.8, hook: Bd.hook, bill: Bd.bill };
  M.faceCfg = { nose: false, mouth: false };
  if (Bd.tufts && !K.f.ears) K.f.ears = 'tuft';
  if (Bd.bigTufts) { K.f.ears = 'tuft'; K.ex.add('crest'); }
  if (Bd.spread) M.spread = true;
  addWings(K, M, pv, { ...A, top: () => by + R[1] * 0.45, w: R[0] * Bd.wing * lerp(0.85, 1.05, s) });
  M.tailBase = [0, by + Math.sin(tilt) * R[2] * 0.7, -R[2] * 1.1];
  M.tailType = Bd.plumes ? 'plumes' : (K.f.tail || 'feather');
  M.anchor = A;
  return head;
}
// こうもり：まんまるの毛玉＋大きな耳＋膜の翼
function planBat(K, M, pv, Bd) {
  M.floating = true; M.plan = 'bird';
  const s = K.st, c1 = K.c1, R = Bd.body.map(v => v * lerp(1.1, 1, s));
  const by = 0.6;
  const P = new Part([ell([0, by, 0], R, c1, { k: 0 })]);
  P.paint(ell([0, by - R[1] * 0.3, R[2] * 0.55], [R[0] * 0.7, R[1] * 0.6, R[2] * 0.5]), K.belly, 0.04);
  const A = { y: by, z0: R[2] * 0.2, z1: -R[2] * 0.4, w: R[0] * 0.9, top: topFn(P), neck: [0, by + R[1] * 0.7, 0], wingZ: -0.02 };
  bodyPaints(K, P, A);
  const bj = K.joint(pv, [0, 0, 0]);
  M.body = K.add(bj, K.mesh(P, 'body'));
  const head = { part: P, R: R[1], c: [0, by + 0.05, 0], node: bj };
  M.head = null; M.headInfo = head;
  M.eyeCfg = { dir: [0.38, 0.22, 0.9], size: 0.48 };
  M.faceCfg = { nose: true, mouthY: -R[1] * 0.18, noseY: 0 };
  K.f.ears = 'bat';
  addWings(K, M, pv, { ...A, top: () => by + R[1] * 0.2, w: R[0] * lerp(1.0, 1.5, s) }, true);
  const LP = new Part([cap([0, 0, 0], [0, -0.14, 0.02], 0.035, 0.025, K.dark, { k: 0 })]);
  for (const sx of [-1, 1]) { const j = K.joint(pv, [sx * R[0] * 0.35, by - R[1] * 0.85, 0]); K.add(j, K.mesh(LP, 'tiny')); }
  M.tailBase = null;
  M.anchor = A;
  return head;
}

// ---------------- 魚・海獣 ----------------
const FSH = {
  goldfish: { R: [.3, .33, .36], tail: 'flow', fins: 'flow', top: 1 },
  dolphin: { R: [.25, .27, .62], tail: 'fluke', dorsal: .8, beak: 1 },
  shark: { R: [.27, .3, .72], tail: 'shark', dorsal: 1.6, jaw: 1, gills: 1 },
  whale: { R: [.48, .46, .95], tail: 'fluke', dorsal: 0, grooves: 1, eyeK: .7 },
  cloudfish: { R: [.36, .32, .42], tail: 'fluke', cloud: 1 },
  catfish: { R: [.42, .28, .78], tail: 'fan', whisk: 1, flatHead: 1 },
  seal: { R: [.33, .32, .5], ground: 1, flipper: 1 },
  walrus: { R: [.46, .42, .62], ground: 1, flipper: 1, tusks: 1, stache: 1 },
  narwhal: { R: [.3, .32, .7], tail: 'fluke', dorsal: .5, horn: 1, spots: 1 },
  hammer: { R: [.3, .33, .78], tail: 'shark', dorsal: 1.8, jaw: 1, gills: 1, hammer: 1 },
};
function planFish(K, M, pv, F) {
  M.plan = 'fish';
  const s = K.st, c1 = K.c1, c2 = K.c2;
  if (F.ground) return planSeal(K, M, pv, F);
  M.floating = true;
  const R = F.R.map((v, i) => v * (i === 2 ? lerp(0.85, 1.05, s) : lerp(1.05, 1, s)));
  const by = 0.6 + R[1] * 0.4;
  const P = new Part([ell([0, by, 0.04], R, c1, { k: 0 })]);
  if (F.cloud) for (let i = 0; i < 9; i++) { const a = i * 2.4; P.add(sph([Math.cos(a) * R[0] * 0.7, by + R[1] * (0.3 + (i % 3) * 0.15), Math.sin(a) * R[2] * 0.6], R[0] * (0.45 + (i % 2) * 0.12), mix(WHITE, c1, 0.15), { k: R[0] * 0.25 })); }
  P.add(cap([0, by, -R[2] * 0.5], [0, by + 0.02, -R[2] * 1.15], R[1] * 0.45, R[1] * 0.16, c1, { k: 0.14 }));
  if (F.beak) P.add(cap([0, by - R[1] * 0.1, R[2] * 0.8], [0, by - R[1] * 0.18, R[2] * 1.25], R[1] * 0.3, R[1] * 0.2, c1, { k: R[1] * 0.25 }));
  if (F.horn) { const hb = [0, by + R[1] * 0.05, R[2] * 0.95]; let prev = hb; for (let i = 1; i <= 6; i++) { const q = [0, hb[1] + i * R[1] * 0.06, hb[2] + i * R[2] * 0.22]; P.add(cap(prev, q, R[1] * (0.13 - i * 0.017), R[1] * (0.12 - i * 0.018), [0.97, 0.94, 0.85], { k: 0.01 })); prev = q; } }
  if (F.hammer) { P.add(ell([0, by + R[1] * 0.1, R[2] * 0.85], [R[0] * 2.2, R[1] * 0.42, R[2] * 0.2], c1, { k: R[1] * 0.25 })); }
  if (F.flatHead) P.add(ell([0, by - R[1] * 0.1, R[2] * 0.55], [R[0] * 1.25, R[1] * 0.75, R[2] * 0.45], c1, { k: R[1] * 0.3 }));
  if (F.jaw) P.add(ell([0, by - R[1] * 0.35, R[2] * 0.6], [R[0] * 0.75, R[1] * 0.45, R[2] * 0.4], c1, { k: R[1] * 0.25 }));
  if (F.bigJaw) { P.add(ell([0, by - R[1] * 0.42, R[2] * 0.42], [R[0] * 1.02, R[1] * 0.55, R[2] * 0.72], c1, { k: R[1] * 0.2 })); P.add(ell([0, by - R[1] * 0.18, R[2] * 1.05], [R[0] * 0.7, R[1] * 0.12, R[2] * 0.3], null, { op: 'sub', k: R[1] * 0.06 })); }
  if (F.eyeTop) for (const sx of [-1, 1]) P.add(sph([sx * R[0] * 0.42, by + R[1] * 0.78, R[2] * 0.55], R[1] * 0.36, c1, { k: R[1] * 0.12 }));
  P.paint(ell([0, by - R[1] * 0.6, 0], [R[0] * 1.1, R[1] * 0.62, R[2] * 1.1]), K.belly, 0.04);
  if (F.grooves) for (let i = -3; i <= 3; i++) P.paint(box([i * R[0] * 0.18, by - R[1] * 0.85, R[2] * 0.3], [R[0] * 0.025, R[1] * 0.2, R[2] * 0.55], 0), mix(K.belly, K.dark, 0.25), R[0] * 0.02);
  if (F.gills) for (const sx of [-1, 1]) for (let i = 0; i < 3; i++) P.paint(box([sx * R[0] * 0.9, by, R[2] * (0.35 - i * 0.09)], [R[0] * 0.2, R[1] * 0.35, R[2] * 0.012], 0), mix(c1, K.dark, 0.5), R[0] * 0.015);
  // 背びれ
  if (F.dorsal) P.add(cap([0, by + R[1] * 0.7, R[2] * 0.15], [0, by + R[1] * (0.8 + F.dorsal * 0.9), -R[2] * (0.1 + F.dorsal * 0.3)], R[1] * 0.42, R[1] * 0.03, F.dorsal > 1 ? c1 : c2, { k: 0.05, sc: [0.28, 1, 1], pv: [0, by + R[1] * 0.7, R[2] * 0.15] }));
  else if (F.top) P.add(cap([0, by + R[1] * 0.7, R[2] * 0.1], [0, by + R[1] * 1.45, -R[2] * 0.4], R[1] * 0.42, 0.02, c2, { k: 0.06, sc: [0.3, 1, 1], pv: [0, by + R[1] * 0.7, R[2] * 0.1] }));
  const A = { y: by, z0: R[2] * 0.4, z1: -R[2] * 0.6, w: R[0], top: topFn(P), neck: [0, by, R[2] * 0.5] };
  bodyPaints(K, P, A);
  const bj = K.joint(pv, [0, 0, 0]);
  M.body = K.add(bj, K.mesh(P, 'body'));
  const head = { part: P, R: R[1] * 1.05, c: [0, by + 0.02, R[2] * 0.42], node: bj };
  M.head = null; M.headInfo = head;
  // 胸びれ
  for (const sx of [-1, 1]) {
    const flow = F.fins === 'flow';
    const FP = new Part([cap([0, 0, 0], [sx * R[0] * (flow ? 1.0 : 0.85), -R[1] * 0.35, -R[2] * (flow ? 0.45 : 0.35)], R[1] * 0.3, R[1] * (flow ? 0.15 : 0.08), c2, { k: 0, sc: [1, 0.3, 1], pv: [0, 0, 0] })]);
    const j = K.joint(pv, [sx * R[0] * 0.85, by - R[1] * 0.35, R[2] * 0.2]); K.add(j, K.mesh(FP, 'small'));
    j.side = sx; M.fins.push(j);
  }
  // 尾びれ
  const TP = new Part();
  const tl = F.tail;
  if (tl === 'flow') for (const sy of [-1, 0, 1]) TP.add(cap([0, 0, 0], [sy * R[0] * 0.3, sy * R[1] * 0.9, -R[2] * 1.25], R[1] * 0.38, R[1] * 0.22, mix(c2, WHITE, 0.2), { k: R[1] * 0.12, sc: [0.25, 1, 1], pv: [0, 0, 0] }));
  else if (tl === 'fluke') for (const sx of [-1, 1]) TP.add(cap([0, 0, 0], [sx * R[0] * 1.1, R[1] * 0.1, -R[2] * 0.45], R[1] * 0.32, R[1] * 0.08, F.cloud ? WHITE : c1, { k: 0.03, sc: [1, 0.25, 1], pv: [0, 0, 0] }));
  else if (tl === 'shark') { TP.add(cap([0, 0, 0], [0, R[1] * 1.2, -R[2] * 0.55], R[1] * 0.35, R[1] * 0.04, c1, { k: 0.03, sc: [0.25, 1, 1], pv: [0, 0, 0] })); TP.add(cap([0, 0, 0], [0, -R[1] * 0.7, -R[2] * 0.35], R[1] * 0.3, R[1] * 0.04, c1, { k: 0.03, sc: [0.25, 1, 1], pv: [0, 0, 0] })); }
  else if (tl !== 'none') TP.add(cap([0, 0, 0], [0, 0, -R[2] * 0.55], R[1] * 0.55, R[1] * 0.3, c2, { k: 0.03, sc: [0.25, 1, 1], pv: [0, 0, 0] }));
  const tj = K.joint(pv, [0, by + 0.02, -R[2] * 1.12]); if (TP.shapes.length) K.add(tj, K.mesh(TP, 'small')); M.tails.push(tj);
  if (F.whisk) for (const sx of [-1, 1]) for (const k of [0, 1]) tailChain(K, M, pv, [sx * R[0] * 0.75, by - R[1] * 0.25, R[2] * 0.85], 3, R[1] * 0.35, R[1] * 0.06, K.dark, -1.2 - k * 0.5, -0.25, sx * 0.9, null, 0.5);
  M.tailBase = null;
  M.anchor = A;
  M.eyeCfg = { dir: F.eyeTop ? [0.42, 0.78, 0.47] : F.hammer ? [0.97, 0.12, 0.2] : F.flatHead ? [0.62, 0.45, 0.65] : [0.72, 0.22, 0.66], size: 0.5 * (F.eyeK || 1) * (F.hammer ? 0.7 : 1) };
  if (F.hammer) head.c = [0, by + R[1] * 0.1, R[2] * 0.85];
  M.faceCfg = { nose: false, blush: !F.jaw, mouthY: -R[1] * 0.25 };
  return head;
}
// アザラシ・セイウチ（地面にいる海獣）
function planSeal(K, M, pv, F) {
  const s = K.st, c1 = K.c1;
  const R = F.R.map(v => v * lerp(1.05, 1, s));
  const P = new Part([ell([0, R[1] * 0.95, 0], R, c1, { k: 0, rot: [-0.25, 0, 0] })]);
  P.add(cap([0, R[1] * 0.7, -R[2] * 0.5], [0, R[1] * 0.35, -R[2] * 1.15], R[1] * 0.55, R[1] * 0.25, c1, { k: 0.15 }));
  P.paint(ell([0, R[1] * 0.55, R[2] * 0.2], [R[0] * 0.8, R[1] * 0.6, R[2] * 0.8]), K.belly, 0.04);
  const A = { y: R[1], z0: R[2] * 0.3, z1: -R[2] * 0.7, w: R[0], top: topFn(P), neck: [0, R[1] * 1.6, R[2] * 0.4] };
  bodyPaints(K, P, A);
  M.body = K.add(pv, K.mesh(P, 'body'));
  const headR = R[0] * 0.78;
  const head = mammalHead(K, headR, { snout: 0.35 });
  if (F.stache) head.part.add(ell([0, -headR * 0.35, headR * 0.85], [headR * 0.75, headR * 0.35, headR * 0.35], mix(c1, WHITE, 0.25), { k: headR * 0.1 }));
  const hj = K.joint(pv, [0, R[1] * 1.55 + headR * 0.6, R[2] * 0.55]);
  K.add(hj, K.mesh(head.part, 'head'));
  head.node = hj; M.head = hj; M.headInfo = head;
  for (const sx of [-1, 1]) {
    const FP = new Part([ell([0, -R[1] * 0.35, R[0] * 0.15], [R[0] * 0.2, R[1] * 0.45, R[0] * 0.45], mix(c1, K.dark, 0.15), { k: 0 })]);
    const j = K.joint(pv, [sx * R[0] * 0.85, R[1] * 0.9, R[2] * 0.35], [0, 0, sx * 0.4]); K.add(j, K.mesh(FP, 'small'));
    j.r0 = j.rot.slice(); j.len = R[1] * 0.7; M.arms.push(j);
  }
  const TP = new Part(); for (const sx of [-1, 1]) TP.add(ell([sx * R[0] * 0.35, 0, -R[2] * 0.2], [R[0] * 0.32, R[1] * 0.08, R[0] * 0.45], mix(c1, K.dark, 0.15), { k: 0.03 }));
  const tj = K.joint(pv, [0, R[1] * 0.25, -R[2] * 1.15]); K.add(tj, K.mesh(TP, 'small')); M.tails.push(tj);
  if (F.tusks) { const TK = new Part(); for (const sx of [-1, 1]) TK.add(cap([sx * headR * 0.3, -headR * 0.5, headR * 0.85], [sx * headR * 0.32, -headR * 1.45, headR * 0.95], headR * 0.12, headR * 0.05, [1, 0.96, 0.86], { k: 0 })); K.add(hj, K.mesh(TK, 'small'), { mat: MAT.glossy }); }
  K.f.face = 'whiskers';
  M.tailBase = null; M.anchor = A;
  M.eyeCfg = { dir: [0.45, 0.25, 0.86], size: 0.58 };
  return head;
}

// ---------------- ヘビ・ウナギ・東洋の竜（ひと続きのなめらかな体） ----------------
function planSnake(K, M, pv, Sd) {
  const s = K.st, c1 = K.c1, c2 = K.c2;
  const n = Sd.n, base = Sd.r * lerp(1.05, 1, s);
  const Lt = n * base * Sd.gap;
  const pts = [], rad = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, r = base * lerp(1, 0.28, Math.pow(t, 1.3));
    let x, y, z = -t * Lt * 0.78;
    if (Sd.float) { x = Math.sin(t * Math.PI * 1.5) * Lt * 0.12; y = 1.0 + Math.sin(t * Math.PI * 2.2 + 0.6) * 0.22 - t * 0.2; }
    else { x = Math.sin(t * Math.PI * 1.7) * Lt * 0.16 * (Sd.coil ?? 1) * Math.min(1, t * 4); const lift = Math.max(0, 1 - t / 0.28); y = r + lift * lift * (Sd.rise || 0) * Lt * 0.35; }
    pts.push([x, y, z]); rad.push(r);
  }
  const P = new Part([sph(pts[0], rad[0], c1, { k: 0 })]);
  for (let i = 0; i < n; i++) {
    P.add(cap(pts[i], pts[i + 1], rad[i], rad[i + 1], c1, { k: rad[i] * 0.3 }));
    const bo = (p, r) => [p[0], p[1] - r * 0.55, p[2]];
    P.paint(cap(bo(pts[i], rad[i]), bo(pts[i + 1], rad[i + 1]), rad[i] * 0.78, rad[i + 1] * 0.78), K.belly, rad[i] * 0.12);
    if (Sd.coil && i % 2 === 0 && i > 0) P.paint(sph([pts[i][0], pts[i][1] + rad[i] * 0.75, pts[i][2]], rad[i] * 0.55), mix(c1, K.dark, 0.4), rad[i] * 0.08);
    if (K.ex.has('spots') && i % 2) for (const sx of [-1, 1]) P.paint(sph([pts[i][0] + sx * rad[i] * 0.6, pts[i][1] + rad[i] * 0.5, pts[i][2]], rad[i] * 0.3), mix(c2, WHITE, 0.2), rad[i] * 0.05);
    if (Sd.fins && i > 0 && i < n - 1) P.add(cap([pts[i][0], pts[i][1] + rad[i] * 0.7, pts[i][2] + rad[i] * 0.4], [pts[i][0], pts[i][1] + rad[i] * 1.45, pts[i][2] - rad[i] * 0.5], rad[i] * 0.45, rad[i] * 0.05, c2, { k: rad[i] * 0.15, sc: [0.3, 1, 1], pv: [pts[i][0], pts[i][1] + rad[i] * 0.7, pts[i][2]] }));
    if (Sd.mane && i < n - 1) P.add(cap([pts[i][0], pts[i][1] + rad[i] * 0.7, pts[i][2]], [pts[i][0], pts[i][1] + rad[i] * 1.55, pts[i][2] - rad[i] * 1.0], rad[i] * 0.36, rad[i] * 0.04, mix(c2, WHITE, 0.25), { k: rad[i] * 0.15, sc: [0.45, 1, 1], pv: [pts[i][0], pts[i][1] + rad[i] * 0.7, pts[i][2]] }));
  }
  if (K.f.tail === 'fin' || Sd.fins) { const e = pts[n]; for (const sy of [-1, 1]) P.add(cap(e, [e[0], e[1] + sy * base * 0.75, e[2] - base * 0.9], base * 0.36, base * 0.06, c2, { k: base * 0.1, sc: [0.28, 1, 1], pv: e })); }
  const A = { y: pts[2][1], z0: 0, z1: -Lt * 0.5, w: base, top: () => pts[1][1] + base, neck: [0, pts[0][1] + base, 0.1], wingZ: -0.2 };
  bodyPaints(K, P, A);
  M.body = K.add(pv, K.mesh(P, 'body'));
  // 頭
  const R = base * (Sd.float ? 1.35 : 1.25) * lerp(1.12, 1, s);
  const HP = new Part([ell([0, 0, 0], [R * 1.0, R * 0.82, R * 1.1], c1, { k: 0 })]);
  HP.add(ell([0, -R * 0.22, R * 0.6], [R * 0.72, R * 0.45, R * (Sd.float ? 1.05 : 0.8)], c1, { k: R * 0.3 }));
  HP.paint(ell([0, -R * 0.6, R * 0.45], [R * 0.72, R * 0.32, R * 0.95]), K.belly, R * 0.06);
  if (Sd.hood || K.ex.has('hood')) { HP.add(ell([0, -R * 0.45, -R * 0.7], [R * 1.8, R * 1.15, R * 0.26], c2, { k: R * 0.15 })); HP.paint(ell([0, -R * 0.45, -R * 0.5], [R * 0.8, R * 0.55, R * 0.2]), mix(c2, K.dark, 0.4), R * 0.05); }
  const head = { part: HP, R, c: [0, 0, 0] };
  const p0 = pts[0];
  const hj = K.joint(pv, [p0[0], p0[1] + rad[0] * 0.6 + R * 0.15, p0[2] + R * 0.75], [-0.1, 0, 0]);
  K.add(hj, K.mesh(HP, 'head'));
  head.node = hj; M.head = hj; M.headInfo = head;
  if (Sd.horns && !K.f.horn) { K.f.horn = 2; }
  if (Sd.legs4) {
    for (const [ii, sx] of [[2, -1], [2, 1], [Math.floor(n * 0.6), -1], [Math.floor(n * 0.6), 1]]) {
      const pp = pts[ii], rr = rad[ii];
      const LP = legPart(K, 0.36, 0.06, true, c1, { claws: 1 });
      const j = K.joint(pv, [pp[0] + sx * rr * 0.8, pp[1] - rr * 0.2, pp[2]], [0.3, 0, sx * 0.8]); K.add(j, K.mesh(LP, 'limb'));
    }
    if (!K.f.horn) K.f.horn = 2;
    K.f.hornStyle = 'antler';
    K.ex.add('whiskers');
  }
  M.tailBase = null;
  M.wiggle = true;
  M.anchor = A;
  M.eyeCfg = { dir: [0.6, 0.38, 0.7], size: 0.52 };
  M.faceCfg = { nose: false };
  M.noEars = !Sd.legs4;
  return head;
}
// ---------------- イモムシ・ミミズ・ツチノコ（節のある体） ----------------
const SRP = {
  caterpillar: { n: 5, r: .28, dr: .02, gap: 1.15, legs: 1, rise: 1, ring: 0 },
  worm: { n: 6, r: .26, dr: .02, gap: 1.1, ring: 1, rise: 1 },
  snake: { n: 8, r: .2, gap: 1.2, smooth: 1, rise: .35, coil: 1 },
  cobra: { n: 9, r: .24, gap: 1.2, smooth: 1, rise: .75, hood: 1, coil: 1 },
  eel: { n: 9, r: .2, gap: 1.3, smooth: 1, fins: 1, rise: .25, coil: .6 },
  tsuchinoko: { n: 3, r: .36, dr: .07, gap: 1.0, fat: 1, rise: 0 },
  eastdragon: { n: 12, r: .24, gap: 1.3, smooth: 1, legs4: 1, mane: 1, float: 1 },
  seaserpent: { n: 13, r: .27, gap: 1.3, smooth: 1, fins: 1, mane: 1, float: 1, horns: 1 },
};
function planSerpent(K, M, pv, Sd) {
  M.plan = 'serpent';
  const s = K.st, c1 = K.c1, c2 = K.c2;
  if (Sd.float) M.floating = true;
  if (Sd.smooth) return planSnake(K, M, pv, Sd);
  const n = Sd.n, base = Sd.r * lerp(1.05, 1, s);
  let z = 0;
  for (let i = 0; i < n; i++) {
    const r = Math.max(0.08, base - i * Sd.dr);
    const rise = Sd.rise && i < Sd.rise + 1 ? (Sd.rise + 1 - i) * r * 0.55 : 0;
    const y = (Sd.float ? 0.9 : r * (Sd.fat ? 0.95 : 1)) + rise + (Sd.float ? Math.sin(i * 0.9) * 0.18 : 0);
    const x = Sd.coil && i > 2 ? Math.sin(i * 0.9) * r * 0.9 : 0;
    const SP = new Part([Sd.fat ? ell([0, 0, 0], [r * 1.25, r * 1.05, r * 1.35], c1, { k: 0 }) : sph([0, 0, 0], r, i % 2 ? c1 : mix(c1, c2, 0.15), { k: 0 })]);
    SP.paint(ell([0, -r * 0.55, 0], [r * 0.95, r * 0.6, r * 1.15]), K.belly, r * 0.1);
    if (Sd.ring) SP.paint(tor([0, 0, 0], r * 0.95, r * 0.16, c2, { rot: [Math.PI / 2, 0, 0] }), mix(c1, K.dark, 0.35), r * 0.05);
    if (K.ex.has('stripes') || (Sd.coil && i % 2)) SP.paint(box([0, r * 0.6, 0], [r * 1.2, r * 0.3, r * 0.2], 0), mix(c1, K.dark, 0.45), r * 0.06);
    if (K.ex.has('spots') && i % 2 === 0) for (const sx of [-1, 1]) SP.paint(sph([sx * r * 0.6, r * 0.5, 0], r * 0.28), mix(c2, WHITE, 0.2), r * 0.04);
    if (Sd.mane) SP.add(cap([0, r * 0.75, 0], [0, r * 1.4, -r * 0.9], r * 0.32, r * 0.04, mix(c2, WHITE, 0.3), { k: r * 0.12, sc: [0.4, 1, 1], pv: [0, r * 0.75, 0] }));
    if (Sd.fins) SP.add(cap([0, r * 0.7, 0], [0, r * 1.25, -r * 0.6], r * 0.3, r * 0.04, c2, { k: r * 0.1, sc: [0.3, 1, 1], pv: [0, r * 0.7, 0] }));
    const j = K.joint(pv, [x, y, -z]);
    z += r * Sd.gap;
    K.add(j, K.mesh(SP, 'limb'));
    if (Sd.legs && i > 0 && i < n - 1) { const LP = new Part(); for (const sx of [-1, 1]) LP.add(sph([sx * r * 0.55, -r * 0.85, r * 0.1], r * 0.22, mix(c1, K.dark, 0.3), { k: 0 })); K.add(j, K.mesh(LP, 'tiny')); }
    j.base = j.pos.slice();
    M.segs.push(j);
  }
  M.body = M.segs[0];
  const R = base * (Sd.fat ? 1.0 : 1.15) * lerp(1.15, 1, s);
  const HP = new Part([ell([0, 0, 0], [R * 1.0, R * 0.85, R * 1.1], c1, { k: 0 })]);
  HP.add(ell([0, -R * 0.25, R * 0.55], [R * 0.75, R * 0.45, R * (Sd.mane ? 1.0 : 0.75)], c1, { k: R * 0.3 }));
  HP.add(sph([0, -R * 0.35, -R * 0.45], R * 0.55, c1, { k: R * 0.3 }));
  HP.paint(ell([0, -R * 0.62, R * 0.4], [R * 0.75, R * 0.35, R * 0.9]), K.belly, R * 0.06);
  if (Sd.hood || K.ex.has('hood')) { HP.add(ell([0, -R * 0.4, -R * 0.65], [R * 1.75, R * 1.1, R * 0.28], c2, { k: R * 0.15 })); HP.paint(ell([0, -R * 0.4, -R * 0.45], [R * 0.8, R * 0.55, R * 0.2]), mix(c2, K.dark, 0.4), R * 0.05); }
  const head = { part: HP, R, c: [0, 0, 0] };
  const p0 = M.segs[0].pos;
  const hj = K.joint(pv, [0, p0[1] + base * 0.9 + R * 0.4, R * 0.55], [-0.12, 0, 0]);
  K.add(hj, K.mesh(HP, 'head'));
  head.node = hj; M.head = hj; M.headInfo = head;
  if (Sd.legs4) {
    for (const [si, sx] of [[2, -1], [2, 1], [7, -1], [7, 1]]) {
      const seg = M.segs[Math.min(si, n - 1)];
      const LP = legPart(K, 0.38, 0.065, true, c1, { claws: 1 });
      const j = K.joint(seg, [sx * base * 0.8, -base * 0.3, 0], [0, 0, sx * 0.7]); K.add(j, K.mesh(LP, 'limb'));
    }
    if (!K.f.horn) K.f.horn = 2;
    K.f.hornStyle = 'antler';
    K.ex.add('whiskers');
  }
  M.tailBase = null;
  if (Sd.fins || K.f.tail === 'fin') { const TP = new Part(); for (const sy of [-1, 1]) TP.add(cap([0, 0, 0], [0, sy * base * 0.8, -base * 1.0], base * 0.4, base * 0.08, c2, { k: 0.03, sc: [0.28, 1, 1], pv: [0, 0, 0] })); const tj = K.joint(M.segs[n - 1], [0, 0, -base * 0.4]); K.add(tj, K.mesh(TP, 'small')); M.tails.push(tj); }
  M.anchor = { y: 0.4, z0: 0, z1: -z * 0.8, w: base, top: () => base * 2, neck: [0, p0[1] + base, 0.1], wingZ: -0.2 };
  M.eyeCfg = { dir: [0.6, 0.38, 0.7], size: Sd.legs || Sd.ring ? 0.62 : 0.55 };
  M.faceCfg = { nose: false };
  M.noEars = !Sd.legs4;
  return head;
}

// ---------------- 虫・カニ・サソリ ----------------
const BUG = {
  butterfly: { body: 'slim', wings: 'butterfly', legs: 6, antenna: 1, float: 1 },
  moth: { body: 'fluffy', wings: 'moth', legs: 6, antenna: 2, float: 1 },
  bee: { body: 'round', wings: 'small', legs: 6, antenna: 1, stinger: 1, float: 1, stripes: 1 },
  queenbee: { body: 'queen', wings: 'queen', legs: 6, antenna: 1, stinger: 1, float: 1, big: 1.0 },
  dragonfly: { body: 'long', wings: 'dragonfly', legs: 6, float: 1 },
  beetle: { body: 'dome', legs: 6, horn: 1 },
  dungbeetle: { body: 'dome', legs: 6, ball: 1 },
  stag: { body: 'dome', legs: 6, pincers: 1 },
  spider: { body: 'spider', legs: 8 },
  crab: { body: 'crab', legs: 6, claws: 1, stalks: 1 },
  scorpion: { body: 'flat', legs: 8, claws: 1, stingTail: 1 },
  widow: { body: 'spider', legs: 8, legScale: 1.75, widow: 1 },
  scorpionking: { body: 'flat', legs: 8, claws: 1.5, stingTail: 2, armor: 1, legScale: 1.25 },
};
function planBug(K, M, pv, Bg) {
  M.plan = 'bug';
  const s = K.st, c1 = K.c1, c2 = K.c2, big = Bg.big || 1;
  if (Bg.float) M.floating = true;
  const by = Bg.float ? 0.5 : 0.36;
  const P = new Part();
  let headZ = 0.36, headY = by + 0.12, R = lerp(0.29, 0.24, s), legY = by, legW = 0.17;
  const kind = Bg.body;
  if (kind === 'slim' || kind === 'long') {
    P.add(ell([0, by, 0.05], [0.14, 0.14, 0.2], c1, { k: 0 }));
    P.add(cap([0, by, -0.1], [0, by - 0.05, kind === 'long' ? -0.95 : -0.5], 0.14, 0.06, c2, { k: 0.08 }));
    if (kind === 'long') for (let i = 0; i < 6; i++) P.paint(box([0, by, -0.2 - i * 0.12], [0.3, 0.3, 0.02], 0), mix(c2, K.dark, 0.4), 0.01);
    headZ = 0.28; R *= 0.95;
  } else if (kind === 'fluffy') {
    P.add(ell([0, by, 0], [0.24, 0.24, 0.28], c1, { k: 0 }));
    P.add(cap([0, by, -0.15], [0, by - 0.08, -0.6], 0.2, 0.08, c2, { k: 0.1 }));
    P.add(tor([0, by + 0.05, 0.12], 0.2, 0.1, mix(c1, WHITE, 0.6), { k: 0.06, rot: [0.4, 0, 0] }));
  } else if (kind === 'round') {
    P.add(ell([0, by, -0.2], [0.3, 0.29, 0.36].map(v => v * big), c1, { k: 0 }));
    P.add(ell([0, by + 0.05, 0.12], [0.2, 0.2, 0.2].map(v => v * big), K.dark, { k: 0.06 }));
    headZ = 0.36 * big;
  } else if (kind === 'dome') {
    // 甲虫：つややかな半球の背中（中央に筋）
    P.add(ell([0, by + 0.04, -0.12], [0.36, 0.3, 0.44], c1, { k: 0 }));
    P.add(ell([0, by - 0.08, -0.1], [0.32, 0.14, 0.4], K.dark, { k: 0.05 }));
    P.add(ell([0, by + 0.02, 0.28], [0.24, 0.18, 0.16], mix(c1, K.dark, 0.35), { k: 0.05 }));
    P.paint(box([0, by + 0.3, -0.12], [0.012, 0.3, 0.5], 0), mix(c1, K.dark, 0.55), 0.008);
    P.paint(ell([0.12, by + 0.26, -0.05], [0.1, 0.06, 0.16]), mix(c1, WHITE, 0.45), 0.03);
    M.glossy = true;
    headZ = 0.46; legW = 0.24;
  } else if (kind === 'spider') {
    const wb = Bg.widow ? 1.4 : 1;
    P.add(ell([0, by + 0.12 * wb, -0.32 * wb], [0.36 * wb, 0.33 * wb, 0.4 * wb], c1, { k: 0 }));
    P.add(ell([0, by, 0.1], [0.22, 0.18, 0.22], mix(c1, K.dark, 0.3), { k: 0.06 }));
    if (Bg.widow) {
      // 背中の砂時計もようと とげ
      P.paint(cap([0, by + 0.58, -0.32], [0, by + 0.38, -0.7], 0.12, 0.02), [0.95, 0.15, 0.2], 0.02);
      P.paint(cap([0, by + 0.58, -0.32], [0, by + 0.5, 0.0], 0.12, 0.02), [0.95, 0.15, 0.2], 0.02);
      for (let i = 0; i < 5; i++) { const a = -0.6 + i * 0.3; P.add(cap([Math.sin(a) * 0.3, by + 0.55, -0.42 + Math.cos(a) * 0.1], [Math.sin(a) * 0.45, by + 0.85, -0.55], 0.05, 0.008, mix(c1, K.dark, 0.5), { k: 0.03 })); }
    } else P.paint(ell([0, by + 0.38, -0.32], [0.18, 0.12, 0.22]), c2, 0.03);
    headZ = 0.34;
  } else if (kind === 'crab') {
    P.add(ell([0, by + 0.05, 0], [0.48, 0.24, 0.36], c1, { k: 0 }));
    for (const sx of [-1, 1]) P.add(cap([sx * 0.3, by + 0.12, 0.2], [sx * 0.52, by + 0.1, 0.05], 0.06, 0.02, c1, { k: 0.05 }));
    P.paint(ell([0, by - 0.12, 0], [0.42, 0.12, 0.32]), K.belly, 0.03);
    headZ = 0.32; headY = by + 0.14; legW = 0.36;
  } else if (kind === 'flat') {
    P.add(ell([0, by - 0.04, 0], [0.26, 0.15, 0.38], c1, { k: 0 }));
    for (let i = 0; i < 3; i++) P.paint(box([0, by + 0.1, 0.15 - i * 0.15], [0.3, 0.06, 0.012], 0), mix(c1, K.dark, 0.4), 0.01);
    if (Bg.armor) for (let i = 0; i < 4; i++) P.add(ell([0, by + 0.08, 0.22 - i * 0.16], [0.3, 0.07, 0.09], mix(c1, K.metal, 0.5), { k: 0.03 }));
    headZ = 0.38; headY = by;
  } else if (kind === 'queen') {
    // 女王バチ：起き上がった胸、長い腹（しま）、白いえり
    P.add(ell([0, by + 0.22, 0.02], [0.24, 0.26, 0.22], mix(c1, K.dark, 0.15), { k: 0 }));
    P.add(cap([0, by + 0.05, -0.12], [0, by - 0.22, -0.72], 0.3, 0.1, c1, { k: 0.1 }));
    for (let i = 0; i < 4; i++) P.paint(tor([0, by - 0.02 - i * 0.07, -0.25 - i * 0.12], 0.27 - i * 0.04, 0.045, K.dark, { rot: [1.2, 0, 0] }), [0.16, 0.12, 0.1], 0.015);
    P.add(tor([0, by + 0.4, 0.04], 0.2, 0.08, [1, 0.97, 0.88], { k: 0.04 }));
    headZ = 0.12; headY = by + 0.62; R *= 1.1;
  }
  if (Bg.stripes) for (let i = 0; i < 3; i++) P.paint(box([0, by, -0.1 - i * 0.18 * big], [0.6, 0.6, 0.05 * big], 0), [0.16, 0.12, 0.1], 0.015);
  const A = { y: by, z0: 0.05, z1: -0.5, w: 0.28, top: topFn(P), neck: [0, by + 0.1, 0.2], wingZ: -0.02 };
  bodyPaints(K, P, A);
  M.body = K.add(pv, K.mesh(P, 'body'), M.glossy ? { mat: MAT.glossy } : {});
  // 脚
  const nL = Bg.legs, legLen = (Bg.float ? 0.3 : by + 0.05) * (Bg.legScale || 1);
  const LP = new Part([cap([0, 0, 0], [0, -legLen * 0.5, 0.06], 0.04, 0.032, K.dark, { k: 0 }), cap([0, -legLen * 0.5, 0.06], [0, -legLen, 0.12], 0.032, 0.02, K.dark, { k: 0.02 })]);
  const lg = K.mesh(LP, 'tiny');
  const zs = nL === 8 ? [0.18, 0.06, -0.06, -0.18] : [0.16, 0.02, -0.12];
  for (const sx of [-1, 1]) for (const z of zs) { const j = K.joint(pv, [sx * legW, legY, z + (kind === 'spider' ? 0.05 : 0)], [0, 0, sx * (kind === 'spider' || kind === 'crab' ? (Bg.legScale ? 0.85 : 1.15) : 0.9)]); K.add(j, lg); j.side = sx; M.legs.push(j); }
  if (Bg.widow) { const FP = new Part(); for (const sx of [-1, 1]) FP.add(cap([sx * 0.06, by - 0.05, 0.42], [sx * 0.04, by - 0.22, 0.48], 0.035, 0.006, [0.95, 0.92, 0.85], { k: 0.01 })); K.add(pv, K.mesh(FP, 'tiny'), { mat: MAT.glossy }); }
  // ハサミ（カニ・サソリ）
  if (Bg.claws) for (const sx of [-1, 1]) {
    const cs = lerp(1, 1.5, s) * (+Bg.claws || 1);
    const CP = new Part([cap([0, 0, 0], [sx * 0.12, 0.02, 0.22], 0.06, 0.05, c1, { k: 0 }), ell([sx * 0.16, 0.04, 0.36], [0.11 * cs, 0.09 * cs, 0.14 * cs], c1, { k: 0.05 })]);
    CP.add(cap([sx * 0.16, 0.08, 0.44], [sx * 0.12, 0.1, 0.6 * cs], 0.06 * cs, 0.015, c2, { k: 0.02 }));
    CP.add(cap([sx * 0.2, 0.0, 0.44], [sx * 0.2, -0.02, 0.56 * cs], 0.045 * cs, 0.012, c2, { k: 0.02 }));
    const j = K.joint(pv, [sx * (kind === 'crab' ? 0.38 : 0.18), by, kind === 'crab' ? 0.2 : 0.3], [0, sx * 0.35, 0]);
    K.add(j, K.mesh(CP, 'small'));
    (M.pincers = M.pincers || []).push(j);
  }
  // サソリの尾（背中にそり返る）
  if (Bg.stingTail) for (const yaw of Bg.stingTail > 1 ? [-0.35, 0.35] : [0]) { const tip = tailChain(K, M, pv, [yaw * 0.25, by + 0.05, -0.35], 5, 0.13 * (Bg.stingTail > 1 ? 1.15 : 1), 0.07, c1, 2.6, -0.5, yaw, null, 0.4); const SP = new Part([cap([0, 0, 0], [0, -0.05, 0.18], 0.07, 0.008, Bg.stingTail > 1 ? [0.85, 0.15, 0.25] : [0.3, 0.18, 0.32], { k: 0 })]); K.add(tip, K.mesh(SP, 'tiny'), { mat: MAT.glossy }); }
  // 頭
  const head = mammalHead(K, R, { snout: 0, cheeks: false, muzzle: false, col: kind === 'dome' ? mix(c1, K.dark, 0.3) : c1 });
  const hj = K.joint(pv, [0, headY, headZ]);
  K.add(hj, K.mesh(head.part, 'head'));
  head.node = hj; M.head = hj; M.headInfo = head;
  if (Bg.stalks) { const SPk = new Part(); for (const sx of [-1, 1]) SPk.add(cap([sx * R * 0.4, R * 0.5, R * 0.2], [sx * R * 0.55, R * 1.2, R * 0.3], R * 0.12, R * 0.12, c1, { k: R * 0.05 })); K.add(hj, K.mesh(SPk, 'tiny')); }
  if (Bg.horn && !K.f.horn) { K.f.horn = 1; K.f.hornStyle = s > 0.5 ? 'unicorn' : 'cone'; }
  if (Bg.pincers) K.f.face = 'pincers';
  if (Bg.antenna) K.ex.add(Bg.antenna === 2 ? 'feelers' : 'antenna');
  if (Bg.ball) { const bc = K.ex.has('sunball') ? null : [0.55, 0.4, 0.28]; if (bc) K.prim(pv, PRIM.sphereHi, bc, [0, 0.32, 0.95], [0.3], null, { outline: 0.8 }); }
  // 翼
  if (Bg.wings) addBugWings(K, M, pv, Bg.wings, kind === 'queen' ? by + 0.2 : by, s);
  M.tailBase = Bg.stinger ? (kind === 'queen' ? [0, by - 0.22, -0.78] : [0, by - 0.05, -0.55 * big]) : null;
  if (kind === 'queen') K.ex.add('crown');
  M.tailType = Bg.stinger ? 'stinger' : null;
  M.anchor = A;
  M.eyeCfg = { dir: [0.52, 0.2, 0.83], size: 0.66 };
  M.faceCfg = { nose: false, blush: K.cute };
  M.noEars = true;
  return head;
}
// 虫の羽（チョウ・ガ・トンボ・ハチ）
function addBugWings(K, M, pv, kind, by, s, at = [0, 0, -0.02], scl = 1) {
  for (const sx of [-1, 1]) {
    const j = K.joint(pv, [sx * 0.1 + at[0], by + 0.12 + at[1], at[2]]);
    if (scl !== 1) j.setScale(scl);
    const g = new GeoBuilder();
    const tri = (a, b, c, col) => { g.quad(a, b, c, c, col); g.quad(a, c, b, b, col); };
    const fan = (pts, colA, colB) => { for (let i = 0; i < pts.length - 1; i++) tri([0, 0, 0], pts[i], pts[i + 1], i % 2 ? colA : colB); };
    const W = lerp(0.8, 1.2, s);
    if (kind === 'butterfly' || kind === 'moth') {
      const cA = kind === 'moth' ? mix(K.c2, [0.6, 0.5, 0.4], 0.4) : K.c2, cB = mix(cA, WHITE, 0.35);
      const up = [], lo = [];
      for (let i = 0; i <= 8; i++) { const a = 0.15 + i / 8 * 1.3; up.push([sx * Math.cos(a - 0.5) * 0.75 * W, Math.sin(a) * 0.55 * W + 0.05, -0.05 - Math.sin(a * 0.6) * 0.1]); }
      for (let i = 0; i <= 6; i++) { const a = i / 6 * 1.2; lo.push([sx * Math.cos(a + 0.3) * 0.5 * W, -Math.sin(a + 0.2) * 0.38 * W, -0.25 - Math.sin(a) * 0.15]); }
      fan(up, cA, cB); fan(lo, cB, cA);
      const n = K.add(j, g.build(), { outline: 0.8, mat: MAT.decor }); n.doubleSide = true;
      // 目玉もよう
      K.prim(j, PRIM.sphereLo, mix(K.c1, K.dark, 0.2), [sx * 0.42 * W, 0.32 * W, -0.06], [0.09 * W, 0.09 * W, 0.02], null, { outline: 0 });
      K.prim(j, PRIM.sphereLo, WHITE, [sx * 0.42 * W, 0.32 * W, -0.05], [0.04 * W, 0.04 * W, 0.02], null, { outline: 0 });
    } else if (kind === 'dragonfly') {
      for (const [dz, a] of [[0.05, 0.12], [-0.12, -0.12]]) {
        const pts = [];
        for (let i = 0; i <= 8; i++) { const t = i / 8; pts.push([sx * t * 0.95 * W, 0.02 + Math.sin(t * Math.PI) * 0.03, dz + a * t + Math.sin(t * Math.PI) * 0.09]); }
        for (let i = 8; i >= 0; i--) { const t = i / 8; pts.push([sx * t * 0.95 * W, 0.02, dz + a * t - Math.sin(t * Math.PI) * 0.06]); }
        const g2 = new GeoBuilder(); const tri2 = (a2, b2, c2, col) => { g2.quad(a2, b2, c2, c2, col); g2.quad(a2, c2, b2, b2, col); };
        for (let i = 1; i < pts.length - 1; i++) tri2(pts[0], pts[i], pts[i + 1], [0.85, 0.95, 1]);
        const n = K.add(j, g2.build(), { alpha: 0.6, outline: 0.6 }); n.transparent = true; n.doubleSide = true;
      }
    } else if (kind === 'queen') {
      const P = new Part([ell([sx * 0.38, 0.32, -0.22], [0.42, 0.035, 0.18], [0.9, 0.97, 1], { k: 0, rot: [0, sx * 0.5, 0.7 * sx] }), ell([sx * 0.3, 0.12, -0.32], [0.3, 0.03, 0.13], [0.9, 0.97, 1], { k: 0.01, rot: [0, sx * 0.9, 0.4 * sx] })]);
      const n = K.add(j, K.mesh(P, 'small'), { alpha: 0.7, outline: 0.4 }); n.transparent = true;
    } else {
      const P = new Part([ell([sx * 0.22, 0.12, -0.08], [0.24, 0.03, 0.12], [0.9, 0.97, 1], { k: 0, rot: [0, sx * 0.3, 0.5 * sx] })]);
      const n = K.add(j, K.mesh(P, 'small'), { alpha: 0.7, outline: 0 }); n.transparent = true;
    }
    j.side = sx; M.wings.push(j);
  }
}

// ---------------- ふしぎな形（スライム・おばけ・星・宝石など） ----------------
const BLB = {
  puff: { shape: 'puff', float: 1 },
  star: { shape: 'star', float: 1 },
  slime: { shape: 'drop', ground: 1, glossy: 1 },
  ghost: { shape: 'ghost', float: 1 },
  wisp: { shape: 'wisp', float: 1 },
  shadow: { shape: 'shadow', float: 1 },
  jelly: { shape: 'jelly', float: 1 },
  clam: { shape: 'clam', ground: 1 },
  gem: { shape: 'gem', float: 1 },
  icecrystal: { shape: 'snowflake', float: 1 },
  lantern: { shape: 'lantern', float: 1 },
  cocoon: { shape: 'cocoon', float: 1 },
  mushroom: { shape: 'mushroom', ground: 1 },
  moss: { shape: 'moss', ground: 1 },
  queenjelly: { shape: 'queenjelly', float: 1 },
  sludge: { shape: 'sludge', ground: 1, glossy: 1 },
  chandelier: { shape: 'chandelier', float: 1 },
  oniwisp: { shape: 'oniwisp', float: 1 },
  conch: { shape: 'conch', ground: 1 },
};
function planBlob(K, M, pv, Bl) {
  M.plan = 'blob';
  const s = K.st, c1 = K.c1, c2 = K.c2;
  M.floating = !!Bl.float;
  const sh = Bl.shape;
  const by = 0.6;
  let R = 0.5 * lerp(0.95, 1.05, s);
  const P = new Part();
  let eyeDir = [0.36, 0.12, 0.92], eyeSize = 0.46, hc = [0, by + 0.05, 0], arms = true, mouthY = -R * 0.2, hr = 0;
  if (typeof sh === 'function') {
    const o = sh(K, M, pv, P, R, by) || {};
    if (o.hc) hc = o.hc; if (o.eyeDir) eyeDir = o.eyeDir; if (o.eyeSize) eyeSize = o.eyeSize; if (o.arms !== undefined) arms = o.arms; if (o.mouthY !== undefined) mouthY = o.mouthY; if (o.hr) hr = o.hr;
  } else if (sh === 'puff') {
    // わたあめのようなふわふわ
    P.add(sph([0, by, 0], R * 0.82, c1, { k: 0 }));
    for (let i = 0; i < 10; i++) { const a = i * 2.4, e = (i % 3 - 1) * 0.5; P.add(sph([Math.cos(a) * R * 0.62, by + e * R * 0.55, Math.sin(a) * R * 0.5 - R * 0.1], R * 0.42, i % 2 ? c1 : mix(c1, WHITE, 0.3), { k: R * 0.18 })); }
    eyeDir = [0.34, 0.08, 0.94];
  } else if (sh === 'star') {
    P.add(ell([0, by, 0], [R * 0.62, R * 0.62, R * 0.45], c1, { k: 0 }));
    for (let i = 0; i < 5; i++) { const a = Math.PI / 2 + i / 5 * Math.PI * 2; P.add(cap([0, by, 0], [Math.cos(a) * R * 1.15, by + Math.sin(a) * R * 1.15, 0], R * 0.38, R * 0.1, c1, { k: R * 0.15, sc: [1, 1, 0.6], pv: [0, by, 0] })); }
    P.paint(sph([0, by, R * 0.3], R * 0.5), mix(c1, WHITE, 0.4), R * 0.15);
    arms = false;
  } else if (sh === 'drop') {
    // しずく形（とんがり頭）のスライム
    P.add(ell([0, R * 0.62, 0], [R * 1.05, R * 0.62, R * 0.95], c1, { k: 0 }));
    P.add(cap([0, R * 0.8, 0], [0, R * 1.65, -R * 0.15], R * 0.65, R * 0.06, c1, { k: R * 0.25 }));
    P.add(ell([0, R * 0.1, 0], [R * 1.25, R * 0.14, R * 1.15], c1, { k: R * 0.2 }));
    hc = [0, R * 0.75, 0]; eyeDir = [0.35, 0.15, 0.92];
    arms = false; M.floating = false;
  } else if (sh === 'ghost') {
    // シーツおばけ（すそがひらひら）
    P.add(sph([0, by + R * 0.28, 0], R * 0.72, c1, { k: 0 }));
    P.add(cap([0, by + R * 0.2, 0], [0, by - R * 0.5, -R * 0.08], R * 0.72, R * 0.98, c1, { k: R * 0.18 }));
    for (let i = 0; i < 7; i++) { const a = i / 7 * Math.PI * 2 + 0.2; P.add(cap([Math.cos(a) * R * 0.78, by - R * 0.48, Math.sin(a) * R * 0.78 - R * 0.08], [Math.cos(a) * R * 1.0, by - R * 1.02, Math.sin(a) * R * 1.0 - R * 0.2], R * 0.24, R * 0.03, c1, { k: R * 0.05 })); }
    P.add({ ...sph([0, by - R * 1.05, -R * 0.08], R * 0.62), op: 'sub', k: R * 0.12 });
    hc = [0, by + R * 0.28, 0];
  } else if (sh === 'wisp') {
    // 火の玉（後ろにたなびく尾）
    P.add(sph([0, by, 0], R * 0.68, c1, { k: 0 }));
    P.add(cap([0, by + R * 0.1, -R * 0.2], [0, by + R * 0.9, -R * 1.3], R * 0.55, R * 0.06, c1, { k: R * 0.25 }));
    P.paint(sph([0, by - R * 0.1, R * 0.3], R * 0.5), mix(c1, WHITE, 0.45), R * 0.2);
    M.body_emis = K.glow.map(v => v * 0.35);
    arms = false;
  } else if (sh === 'shadow') {
    // かげ（ギザギザのふち・浮かぶ）
    P.add(sph([0, by, 0], R * 0.72, c1, { k: 0 }));
    for (let i = 0; i < 9; i++) { const a = i / 9 * Math.PI * 2; P.add(cap([Math.cos(a) * R * 0.5, by + Math.sin(a) * R * 0.5, -R * 0.1], [Math.cos(a) * R * 1.05, by + Math.sin(a) * R * 1.05, -R * 0.35], R * 0.25, R * 0.03, c1, { k: R * 0.12 })); }
    arms = false;
  } else if (sh === 'jelly') {
    P.add(ell([0, by + R * 0.25, 0], [R * 0.95, R * 0.72, R * 0.95], c1, { k: 0 }));
    P.add({ ...ell([0, by - R * 0.4, 0], [R * 1.1, R * 0.4, R * 1.1]), op: 'sub', k: R * 0.15 });
    P.add(tor([0, by - R * 0.05, 0], R * 0.82, R * 0.12, mix(c1, WHITE, 0.3), { k: R * 0.1 }));
    hc = [0, by + R * 0.2, 0]; eyeDir = [0.35, 0.0, 0.94];
    K.ex.add('tentacles');
    arms = false;
  } else if (sh === 'clam') {
    R *= 0.85;
    P.add(sph([0, R * 0.8, R * 0.1], R * 0.6, c1, { k: 0 }));
    hc = [0, R * 0.8, R * 0.1]; eyeDir = [0.4, 0.15, 0.9];
    K.f.back = 'clam';
    arms = false; M.floating = false;
  } else if (sh === 'gem') {
    // 多面体の宝石の体
    const g = mix(c1, WHITE, 0.15);
    P.add(box([0, by, 0], [R * 0.55, R * 0.55, R * 0.55], R * 0.12, g, { k: 0, rot: [0.6, 0.78, 0] }));
    P.add(cap([0, by + R * 0.3, 0], [0, by + R * 1.0, 0], R * 0.35, R * 0.04, g, { k: R * 0.1 }));
    P.add(cap([0, by - R * 0.3, 0], [0, by - R * 0.95, 0], R * 0.35, R * 0.04, g, { k: R * 0.1 }));
    M.glossy = true;
  } else if (sh === 'snowflake') {
    P.add(sph([0, by, 0], R * 0.55, c1, { k: 0 }));
    for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; const tip = [Math.cos(a) * R * 1.2, by + Math.sin(a) * R * 1.2, -R * 0.1]; P.add(cap([0, by, 0], tip, R * 0.14, R * 0.05, mix(c1, WHITE, 0.4), { k: R * 0.06 })); for (const sgn of [-1, 1]) { const m = [Math.cos(a) * R * 0.75, by + Math.sin(a) * R * 0.75, -R * 0.1]; P.add(cap(m, [m[0] + Math.cos(a + sgn * 0.8) * R * 0.32, m[1] + Math.sin(a + sgn * 0.8) * R * 0.32, m[2]], R * 0.07, R * 0.03, mix(c1, WHITE, 0.5), { k: R * 0.04 })); } }
    arms = false; M.glossy = true;
  } else if (sh === 'lantern') {
    // ちょうちんおばけ：縦長の提灯＋上下の黒いふち
    K.ex.delete('lantern');
    const warm = mix(c1, [1, 0.62, 0.25], 0.55);
    P.add(ell([0, by, 0], [R * 0.75, R * 0.85, R * 0.75], warm, { k: 0 }));
    for (let i = -2; i <= 2; i++) P.paint(tor([0, by + i * R * 0.28, 0], R * 0.75 * Math.cos(i * 0.33), R * 0.03, K.dark), mix(warm, [0.35, 0.12, 0.05], 0.55), R * 0.02);
    P.paint(sph([0, by - R * 0.05, R * 0.55], R * 0.45), mix(warm, [1, 0.95, 0.6], 0.55), R * 0.15);
    P.add(ell([0, by + R * 0.84, 0], [R * 0.36, R * 0.09, R * 0.36], [0.22, 0.16, 0.16], { k: R * 0.03 }));
    P.add(ell([0, by - R * 0.84, 0], [R * 0.36, R * 0.09, R * 0.36], [0.22, 0.16, 0.16], { k: R * 0.03 }));
    P.add(tor([0, by + R * 1.0, 0], R * 0.16, R * 0.035, [0.22, 0.16, 0.16], { k: R * 0.02, rot: [Math.PI / 2, 0, 0] }));
    M.body_emis = [0.42, 0.22, 0.06];
  } else if (sh === 'cocoon') {
    P.add(ell([0, by + 0.05, 0], [R * 0.62, R * 0.95, R * 0.62], c1, { k: 0 }));
    for (let i = 0; i < 5; i++) P.paint(tor([0, by - R * 0.6 + i * R * 0.3, 0], R * 0.6, R * 0.05, c2, { rot: [0.2 * (i % 2 ? 1 : -1), 0, 0.15] }), mix(c1, WHITE, 0.35), R * 0.03);
    P.add(cap([0, by + R * 0.9, 0], [0, by + R * 1.6, -R * 0.1], R * 0.06, R * 0.04, mix(c1, WHITE, 0.6), { k: R * 0.04 }));
    arms = false; eyeDir = [0.36, 0.2, 0.91]; eyeSize = 0.4;
  } else if (sh === 'mushroom') {
    // かさの下に顔がある大きなキノコ
    R *= 0.9;
    P.add(cap([0, 0.05, 0], [0, R * 0.95, 0], R * 0.58, R * 0.5, mix(c1, WHITE, 0.55), { k: 0 }));
    hc = [0, R * 0.55, 0]; eyeDir = [0.35, 0.05, 0.93];
    K.f.back = 'mushroom';
    M.floating = false;
  } else if (sh === 'queenjelly') {
    // 大きなかさ＋ひらひらのふち＋長い触手（女王）
    R *= 1.15;
    P.add(ell([0, by + R * 0.35, 0], [R * 1.0, R * 0.85, R * 1.0], c1, { k: 0 }));
    P.add({ ...ell([0, by - R * 0.3, 0], [R * 1.15, R * 0.42, R * 1.15]), op: 'sub', k: R * 0.15 });
    for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2; P.add(ell([Math.cos(a) * R * 0.95, by + R * 0.02, Math.sin(a) * R * 0.95], [R * 0.24, R * 0.12, R * 0.24], mix(c1, WHITE, 0.4), { k: R * 0.1 })); }
    P.paint(sph([0, by + R * 1.0, 0], R * 0.5), mix(c1, K.c2, 0.5), R * 0.15);
    for (let i = 0; i < 5; i++) { const a = i / 5 * Math.PI * 2; P.paint(sph([Math.cos(a) * R * 0.6, by + R * 0.75, Math.sin(a) * R * 0.6], R * 0.12), mix(K.c2, WHITE, 0.4), R * 0.03); }
    hc = [0, by + R * 0.3, 0]; eyeDir = [0.35, 0.0, 0.94]; eyeSize = 0.4;
    K.ex.add('tentacles'); M.longTentacles = true;
    arms = false;
  } else if (sh === 'sludge') {
    // ヘドロの大きなかたまり：たれる体・太い腕・あわ
    R *= 1.1;
    P.add(ell([0, R * 0.75, 0], [R * 1.1, R * 0.85, R * 0.95], c1, { k: 0 }));
    P.add(ell([0, R * 0.12, 0], [R * 1.45, R * 0.2, R * 1.3], c1, { k: R * 0.25 }));
    for (let i = 0; i < 7; i++) { const a = i / 7 * Math.PI * 2 + 0.3; P.add(cap([Math.cos(a) * R * 0.85, R * 0.6, Math.sin(a) * R * 0.75], [Math.cos(a) * R * 1.0, R * 0.08, Math.sin(a) * R * 0.95], R * 0.22, R * 0.15, c1, { k: R * 0.15 })); }
    P.add(cap([R * 0.2, R * 1.45, -R * 0.1], [R * 0.3, R * 1.75, -R * 0.15], R * 0.16, R * 0.07, c1, { k: R * 0.15 }));
    for (let i = 0; i < 6; i++) P.paint(sph([Math.cos(i * 2.2) * R * 0.8, R * (0.5 + (i % 3) * 0.3), Math.sin(i * 2.2) * R * 0.6], R * 0.12), mix(c1, K.c2, 0.6), R * 0.03);
    hc = [0, R * 0.95, R * 0.05]; eyeDir = [0.35, 0.15, 0.92];
    M.floating = false;
    for (const sx of [-1, 1]) { const AP = new Part([cap([0, 0, 0], [sx * R * 0.35, -R * 0.55, R * 0.25], R * 0.26, R * 0.32, c1, { k: 0 }), sph([sx * R * 0.38, -R * 0.65, R * 0.3], R * 0.34, c1, { k: R * 0.12 })]); const j = K.joint(pv, [sx * R * 1.05, R * 0.95, R * 0.1], [0, 0, sx * 0.25]); K.add(j, K.mesh(AP, 'limb'), { mat: MAT.glossy }); j.r0 = j.rot.slice(); M.arms.push(j); }
    arms = false;
  } else if (sh === 'chandelier') {
    // シャンデリアのおばけ：輪の上に炎がならぶ
    const gold = [0.95, 0.78, 0.3];
    P.add(ell([0, by + R * 0.1, 0], [R * 0.55, R * 0.6, R * 0.55], mix(c1, [1, 0.62, 0.25], 0.5), { k: 0 }));
    P.add(tor([0, by - R * 0.25, 0], R * 1.0, R * 0.08, gold, { k: R * 0.05 }));
    for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; P.add(cap([Math.cos(a) * R * 0.3, by, Math.sin(a) * R * 0.3], [Math.cos(a) * R * 1.0, by - R * 0.25, Math.sin(a) * R * 1.0], R * 0.05, R * 0.05, gold, { k: R * 0.04 })); P.add(cap([Math.cos(a) * R * 1.0, by - R * 0.25, Math.sin(a) * R * 1.0], [Math.cos(a) * R * 1.0, by - R * 0.02, Math.sin(a) * R * 1.0], R * 0.09, R * 0.08, [1, 0.97, 0.88], { k: R * 0.03 })); }
    P.add(cap([0, by + R * 0.6, 0], [0, by + R * 1.25, 0], R * 0.06, R * 0.06, gold, { k: R * 0.04 }));
    P.add(cap([0, by - R * 0.45, 0], [0, by - R * 0.9, 0], R * 0.18, R * 0.02, gold, { k: R * 0.08 }));
    M.chandelier = { by, R };
    M.body_emis = [0.3, 0.16, 0.05];
    hc = [0, by + R * 0.1, 0]; eyeDir = [0.35, 0.1, 0.93]; eyeSize = 0.4;
    arms = false; K.ex.delete('lantern');
  } else if (sh === 'oniwisp') {
    // 鬼火：角のある火の玉＋まわりを回る小さな火
    P.add(sph([0, by, 0], R * 0.72, c1, { k: 0 }));
    P.add(cap([0, by + R * 0.1, -R * 0.2], [0, by + R * 1.1, -R * 1.4], R * 0.6, R * 0.06, c1, { k: R * 0.25 }));
    for (const sx of [-1, 1]) P.add(cap([sx * R * 0.35, by + R * 0.5, R * 0.1], [sx * R * 0.6, by + R * 1.15, R * 0.05], R * 0.14, R * 0.02, [0.98, 0.92, 0.8], { k: R * 0.05 }));
    P.paint(sph([0, by - R * 0.1, R * 0.3], R * 0.5), mix(c1, WHITE, 0.4), R * 0.2);
    M.body_emis = K.glow.map(v => v * 0.45);
    M.orbitFlames = true;
    arms = false;
  } else if (sh === 'conch') {
    // 大きな巻き貝にすむ：らせんの貝がら＋顔と腕が出ている
    R *= 0.95;
    const shell = mix(K.c2, WHITE, 0.25);
    for (let i = 0; i < 6; i++) { const t = i / 5; P.add(tor([0, R * (0.55 + t * 1.1), -R * 0.25], R * (0.95 - t * 0.7), R * (0.32 - t * 0.2), i % 2 ? shell : mix(shell, K.c2, 0.4), { k: R * 0.12 })); }
    P.add(cap([0, R * 1.6, -R * 0.25], [0, R * 2.15, -R * 0.3], R * 0.18, R * 0.02, shell, { k: R * 0.1 }));
    P.add(sph([0, R * 0.62, R * 0.45], R * 0.5, c1, { k: R * 0.1 }));
    for (let i = 0; i < 4; i++) P.add(cap([Math.cos(i * 1.6) * R * 0.7, R * (0.7 + i * 0.25), -R * 0.25 + Math.sin(i * 1.6) * R * 0.6], [Math.cos(i * 1.6) * R * 1.05, R * (0.8 + i * 0.25), -R * 0.25 + Math.sin(i * 1.6) * R * 0.9], R * 0.08, R * 0.01, shell, { k: R * 0.05 }));
    hc = [0, R * 0.62, R * 0.45]; eyeDir = [0.4, 0.15, 0.9]; eyeSize = 0.55;
    M.floating = false;
    K.prim(pv, PRIM.sphereHi, [1, 0.97, 1], [0, R * 2.3, -R * 0.3], [R * 0.14], null, { mat: MAT.glossy, emis: [0.15, 0.15, 0.18], outline: 0.5 });
  } else if (sh === 'moss') {
    P.add(sph([0, R * 0.7, 0], R * 0.72, c1, { k: 0 }));
    for (let i = 0; i < 14; i++) { const a = i * 2.4, e = ((i * 37) % 10) / 10; P.add(sph([Math.cos(a) * R * 0.62 * Math.sqrt(1 - e * e), R * 0.7 + e * R * 0.62, Math.sin(a) * R * 0.62 * Math.sqrt(1 - e * e)], R * 0.2, i % 2 ? c1 : mix(c1, K.c2, 0.3), { k: R * 0.08 })); }
    hc = [0, R * 0.7, 0]; arms = false; M.floating = false;
    for (let i = 0; i < 3; i++) K.prim(pv, PRIM.leaf, [0.45, 0.82, 0.32], [Math.cos(i * 2.1) * R * 0.25, R * 1.42, Math.sin(i * 2.1) * R * 0.25], [R * 0.25], [0.3, i * 2.1, 0.4], { outline: 0.6 });
  }
  const A = { y: hc[1], z0: R * 0.3, z1: -R * 0.4, w: R * 0.8, top: topFn(P), neck: [0, hc[1] + R * 0.6, 0], wingZ: -R * 0.2 };
  if (!['clam', 'mushroom', 'conch', 'chandelier'].includes(sh)) backShapes(K, P, A);
  bodyPaints(K, P, A);
  const bj = K.joint(pv, [0, 0, 0]);
  M.body = K.add(bj, K.mesh(P, 'body'), { mat: M.glossy || Bl.glossy ? MAT.glossy : MAT.char, alpha: sh === 'jelly' || sh === 'slime' ? 0.88 : 1 });
  if (M.body_emis) M.body.emis = M.body_emis;
  if (sh === 'jelly' || sh === 'slime') M.body.transparent = true;
  const head = { part: P, R: hr || R * (sh === 'drop' ? 0.75 : sh === 'conch' ? 0.5 : sh === 'chandelier' ? 0.55 : 0.7), c: hc, node: bj };
  M.head = null; M.headInfo = head;
  if (arms) for (const sx of [-1, 1]) {
    const AP = new Part([ell([0, -0.08, 0], [R * 0.2, R * 0.32, R * 0.2], c1, { k: 0 })]);
    const j = K.joint(pv, [sx * R * 0.85, hc[1] - R * 0.12, R * 0.15], [0, 0, sx * 0.7]); K.add(j, K.mesh(AP, 'small'));
    j.r0 = j.rot.slice(); M.arms.push(j);
  }
  if (sh !== 'clam' && sh !== 'mushroom') backNodes(K, M, pv, A); else backNodes(K, M, pv, { ...A, top: () => sh === 'mushroom' ? R * 0.9 : R * 0.2, w: R * 0.75 });
  M.tailBase = ['ghost', 'conch', 'chandelier', 'sludge', 'queenjelly'].includes(sh) ? null : [0, hc[1] - R * 0.4, -R * 0.75];
  if (M.chandelier) { const C = M.chandelier; for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; addFlame(K, M, pv, [Math.cos(a) * C.R, C.by - C.R * 0.0, Math.sin(a) * C.R], 0.42, [0, 0, 0], K.T.includes('ghost')); } addFlame(K, M, pv, [0, C.by + C.R * 1.25, 0], 0.5, [0, 0, 0], true); }
  if (M.orbitFlames) { M.orbit = K.joint(pv, [0, by, 0]); for (let i = 0; i < 4; i++) { const a = i / 4 * Math.PI * 2; addFlame(K, M, M.orbit, [Math.cos(a) * R * 1.3, 0, Math.sin(a) * R * 1.3], 0.38, [0, 0, 0], true); } }
  M.tailType = sh === 'ghost' ? null : K.f.tail;
  M.anchor = A;
  M.eyeCfg = { dir: eyeDir, size: eyeSize };
  M.faceCfg = { nose: false, mouthY, noseY: 0 };
  M.noEars = !K.f.ears;
  return head;
}

// ---------------- 植物 ----------------
const PLT = {
  dandelion: { kind: 'dandelion' }, cactus: { kind: 'cactus' }, bud: { kind: 'bud' }, flower: { kind: 'flower' }, lily: { kind: 'lily' },
  parasol: { kind: 'parasol' }, cactusgiant: { kind: 'cactus', giant: 1 },
};
function planPlant(K, M, pv, Pl) {
  M.plan = 'plant';
  const s = K.st, c1 = K.c1, c2 = K.c2, kind = Pl.kind;
  const leaf = [0.42, 0.8, 0.32], stem = mix(leaf, [0.2, 0.4, 0.15], 0.3);
  const P = new Part();
  let headR = 0.32 * lerp(1.15, 1, s), hy, hz = 0.02, armsKind = 'leaf';
  if (kind === 'parasol') return planParasol(K, M, pv);
  if (kind === 'cactus') {
    // サボテン：縦長の柱＋腕（トゲつき）。大サボテンは 腕が2対で背が高い
    const h = lerp(0.75, 1.25, s) * (Pl.giant ? 1.6 : 1), r = lerp(0.3, 0.34, s) * (Pl.giant ? 1.05 : 1);
    P.add(cap([0, r * 0.8, 0], [0, h, 0], r * 1.05, r * 0.95, c1, { k: 0 }));
    P.add(ell([0, r * 0.35, 0], [r * 1.1, r * 0.4, r * 1.1], mix(c1, K.dark, 0.1), { k: 0.08 }));
    for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; P.paint(box([Math.cos(a) * r, h * 0.55, Math.sin(a) * r], [r * 0.05, h * 0.5, r * 0.05], 0, null, { rot: [0, -a, 0] }), mix(c1, K.dark, 0.25), r * 0.04); }
    P.add(box([0, -1, 0], [3, 1, 3], 0, null, { op: 'sub', k: 0.02 }));
    hy = h * 0.66; headR = r * 1.05; armsKind = 'cactus';
    const head = { part: P, R: headR, c: [0, hy, 0] };
    const bj = K.joint(pv, [0, 0, 0]);
    M.body = K.add(bj, K.mesh(P, 'body'));
    head.node = bj; M.head = null; M.headInfo = head;
    // 腕（L字）
    for (const sx of [-1, 1]) {
      const AP = new Part([cap([0, 0, 0], [sx * r * 0.85, 0, 0], r * 0.42, r * 0.4, c1, { k: 0 }), cap([sx * r * 0.85, 0, 0], [sx * r * 0.9, r * (sx > 0 ? 0.9 : 0.6), 0], r * 0.4, r * 0.36, c1, { k: r * 0.15 })]);
      const j = K.joint(pv, [sx * r * 0.85, h * (sx > 0 ? 0.55 : 0.45), 0], [0, 0, 0]); K.add(j, K.mesh(AP, 'limb'));
      j.r0 = j.rot.slice(); M.arms.push(j);
      if (Pl.giant) { const j2 = K.joint(pv, [sx * r * 0.85, h * (sx > 0 ? 0.32 : 0.75), 0], [0, 0, 0]); j2.setScale(0.75); K.add(j2, K.mesh(AP, 'limb')); }
    }
    // トゲ
    const SP = new Part(); const rr = mulberry32(K.sp.id);
    for (let i = 0; i < 14; i++) { const a = rr() * Math.PI * 2, y = r + rr() * (h - r); if (Math.abs(Math.cos(a)) < 0.35 && Math.sin(a) > 0 && y > hy - r * 0.6 && y < hy + r * 0.5) continue; const b = [Math.cos(a) * r * 1.0, y, Math.sin(a) * r * 1.0]; SP.add(cap(b, [b[0] * 1.35, y + 0.02, b[2] * 1.35], r * 0.04, r * 0.008, [1, 0.97, 0.85], { k: 0 })); }
    K.add(bj, K.mesh(SP, 'tiny'), { outline: 0.4 });
    if (K.ex.has('flowerhead')) { K.ex.delete('flowerhead'); const FP = new Part(); for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; FP.add(ell([Math.cos(a) * r * 0.32, 0, Math.sin(a) * r * 0.32], [r * 0.28, r * 0.08, r * 0.16], c2, { k: r * 0.05, rot: [0, -a, 0] })); } FP.add(sph([0, r * 0.05, 0], r * 0.14, [1, 0.88, 0.3], { k: r * 0.03 })); K.add(K.joint(pv, [r * 0.2, h + r * 0.85, 0]), K.mesh(FP, 'tiny')); }
    M.anchor = { y: hy, z0: 0.1, z1: -0.1, w: r, top: () => h, neck: [0, h, 0] };
    M.eyeCfg = { dir: [0.36, 0.0, 0.93], size: 0.55 };
    M.faceCfg = { nose: false, mouthY: -headR * 0.35 };
    M.tailBase = null; M.noEars = true;
    return head;
  }
  // 茎の脚＋ふくらんだ体
  const legH = kind === 'lily' ? 0.12 : lerp(0.22, 0.34, s);
  const bodyR = lerp(0.24, 0.27, s);
  const by = legH + bodyR * 0.8;
  P.add(ell([0, by, 0], [bodyR, bodyR * 1.05, bodyR * 0.95], kind === 'dandelion' ? leaf : c1, { k: 0 }));
  if (kind === 'lily') { P.add(ell([0, legH * 0.5 + 0.05, 0], [bodyR * 2.2, 0.05, bodyR * 2.2], [0.38, 0.76, 0.36], { k: 0.04 })); P.add({ ...box([bodyR * 1.3, legH * 0.5 + 0.05, bodyR * 1.3], [bodyR * 0.6, 0.2, bodyR * 0.08], 0, null, { rot: [0, Math.PI / 4, 0] }), op: 'sub', k: 0.01 }); }
  P.paint(ell([0, by - bodyR * 0.2, bodyR * 0.6], [bodyR * 0.7, bodyR * 0.65, bodyR * 0.5]), mix(c1, WHITE, 0.4), 0.03);
  hy = by + bodyR + headR * 0.75;
  P.add(cap([0, by + bodyR * 0.6, 0], [0, hy - headR * 0.6, 0], bodyR * 0.3, bodyR * 0.25, stem, { k: 0.06 }));
  const A = { y: by, z0: bodyR * 0.3, z1: -bodyR * 0.4, w: bodyR, top: () => by + bodyR, neck: [0, hy - headR, 0], wingZ: -bodyR * 0.3 };
  bodyPaints(K, P, A);
  M.body = K.add(pv, K.mesh(P, 'body'));
  if (kind !== 'lily') {
    const LP = new Part([cap([0, 0, 0], [0, -legH + 0.04, 0.01], 0.055, 0.045, stem, { k: 0 }), ell([0, -legH + 0.04, 0.05], [0.09, 0.05, 0.13], mix(stem, K.dark, 0.2), { k: 0.03 })]);
    const lg = K.mesh(LP, 'small');
    for (const sx of [-1, 1]) { const j = K.joint(pv, [sx * bodyR * 0.45, legH + 0.04, 0]); K.add(j, lg); j.len = legH; M.legs.push(j); }
  }
  for (const sx of [-1, 1]) {
    const AP = new Part([cap([0, 0, 0], [0, -0.12, 0.02], 0.035, 0.03, stem, { k: 0 }), ell([0, -0.25, 0.05], [0.13, 0.17, 0.035], leaf, { k: 0.03 })]);
    AP.paint(box([0, -0.25, 0.05], [0.008, 0.16, 0.06], 0), mix(leaf, K.dark, 0.25), 0.006);
    const j = K.joint(pv, [sx * bodyR * 0.95, by + bodyR * 0.2, 0.02], [-0.2, 0, sx * 0.55]); K.add(j, K.mesh(AP, 'small'));
    j.r0 = j.rot.slice(); j.len = 0.3; M.arms.push(j);
  }
  // 頭：種類ごとの花
  const HP = new Part([sph([0, 0, 0], headR, kind === 'dandelion' ? [1, 0.98, 0.9] : (kind === 'bud' ? c2 : mix(c2, [1, 0.9, 0.4], 0.5)), { k: 0 })]);
  if (kind === 'dandelion') {
    // わた毛：小さな白い玉を球状に
    for (let i = 0; i < 26; i++) { const y = 1 - (i + 0.5) / 26 * 2, rr = Math.sqrt(1 - y * y), a = i * 2.39996; if (y < -0.5 && Math.abs(Math.cos(a)) < 0.6) continue; HP.add(sph([Math.cos(a) * rr * headR * 1.25, y * headR * 1.25, Math.sin(a) * rr * headR * 1.25], headR * 0.3, WHITE, { k: headR * 0.12 })); }
    HP.paint(ell([0, -headR * 0.15, headR * 0.6], [headR * 0.75, headR * 0.65, headR * 0.5]), [1, 0.9, 0.72], headR * 0.1);
  } else if (kind === 'bud') {
    // つぼみ：先のとがった花びらで包まれた頭
    for (let i = 0; i < 5; i++) { const a = i / 5 * Math.PI * 2; HP.add(cap([Math.cos(a) * headR * 0.55, -headR * 0.3, Math.sin(a) * headR * 0.55 - headR * 0.1], [Math.cos(a) * headR * 0.2, headR * 1.45, Math.sin(a) * headR * 0.2 - headR * 0.15], headR * 0.42, headR * 0.04, i % 2 ? c2 : mix(c2, WHITE, 0.25), { k: headR * 0.12 })); }
    HP.paint(ell([0, -headR * 0.1, headR * 0.75], [headR * 0.7, headR * 0.6, headR * 0.4]), mix(c2, WHITE, 0.55), headR * 0.08);
  } else if (kind === 'flower' || kind === 'lily') {
    // ひらいた花の顔（花びらが顔のまわりに）
    for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; HP.add(ell([Math.cos(a) * headR * 1.15, Math.sin(a) * headR * 1.15, -headR * 0.35], [headR * 0.55, headR * 0.3, headR * 0.1], i % 2 ? c2 : mix(c2, WHITE, 0.3), { k: headR * 0.06, rot: [0, 0, a] })); }
    HP.paint(sph([0, 0, headR * 0.8], headR * 0.8), mix(c1, [1, 0.92, 0.6], 0.6), headR * 0.08);
  }
  K.ex.delete('flowerhead');
  const head = { part: HP, R: headR, c: [0, 0, 0] };
  const hj = K.joint(pv, [0, hy, hz]);
  K.add(hj, K.mesh(HP, 'head'));
  head.node = hj; M.head = hj; M.headInfo = head;
  backNodes(K, M, pv, { ...A, top: () => by + bodyR * 0.85, w: bodyR * 0.9 });
  M.tailBase = null; M.noEars = true;
  M.anchor = A;
  M.eyeCfg = { dir: [0.38, 0.1, 0.92], size: kind === 'dandelion' ? 0.5 : 0.56 };
  M.faceCfg = { nose: false, mouthY: -headR * 0.32 };
  return head;
}

// わた毛のパラシュート：大きなわた毛の傘に ぶらさがって 空を飛ぶ
function planParasol(K, M, pv) {
  M.plan = 'plant'; M.floating = true;
  const s = K.st, leaf = [0.42, 0.8, 0.32];
  const R = 0.62;
  const UP = new Part([ell([0, 1.45, 0], [R * 0.55, R * 0.3, R * 0.55], [1, 0.98, 0.92], { k: 0 })]);
  for (let i = 0; i < 40; i++) { const y = 1 - (i + 0.5) / 40, rr = Math.sqrt(1 - y * y), a = i * 2.39996; UP.add(sph([Math.cos(a) * rr * R, 1.45 + y * R * 0.65, Math.sin(a) * rr * R], R * 0.24, WHITE, { k: R * 0.1 })); }
  UP.add(cap([0, 1.42, 0], [0, 0.85, 0], 0.035, 0.03, mix(leaf, [0.3, 0.25, 0.1], 0.3), { k: 0.02 }));
  const uj = K.joint(pv, [0, 0, 0]); K.add(uj, K.mesh(UP, 'body')); M.parasol = uj;
  // ぶらさがる小さな体（顔つき）
  const bR = 0.3;
  const P = new Part([sph([0, 0.62, 0], bR, K.c1, { k: 0 })]);
  for (let i = 0; i < 5; i++) { const a = i / 5 * Math.PI * 2; P.add(ell([Math.cos(a) * bR * 0.6, 0.62 + bR * 0.75, Math.sin(a) * bR * 0.6], [bR * 0.35, bR * 0.18, bR * 0.35], mix(leaf, K.c1, 0.3), { k: bR * 0.1, rot: [0, -a, 0.5] })); }
  P.paint(ell([0, 0.55, bR * 0.6], [bR * 0.7, bR * 0.6, bR * 0.5]), mix(K.c1, WHITE, 0.45), 0.03);
  const bj = K.joint(pv, [0, 0, 0]);
  M.body = K.add(bj, K.mesh(P, 'body'));
  const head = { part: P, R: bR, c: [0, 0.62, 0], node: bj };
  M.head = null; M.headInfo = head;
  for (const sx of [-1, 1]) { const AP = new Part([cap([0, 0, 0], [sx * 0.08, 0.28, 0], 0.035, 0.03, leaf, { k: 0 }), ell([sx * 0.1, 0.32, 0], [0.07, 0.04, 0.05], leaf, { k: 0.02 })]); const j = K.joint(pv, [sx * bR * 0.9, 0.65, 0.02], [0, 0, sx * 0.1]); K.add(j, K.mesh(AP, 'small')); j.r0 = j.rot.slice(); M.arms.push(j); }
  M.tailBase = null; M.noEars = true;
  M.anchor = { y: 0.62, z0: 0.1, z1: -0.1, w: bR, top: () => 0.62 + bR, neck: [0, 0.9, 0] };
  M.eyeCfg = { dir: [0.36, 0.12, 0.92], size: 0.5 };
  M.faceCfg = { nose: false, mouthY: -bR * 0.32 };
  void s;
  return head;
}

// ---------------- 岩・結晶・石像 ----------------
const GLM = {
  boulder: { kind: 'boulder' }, rockman: { kind: 'golem', k: 1 }, giant: { kind: 'golem', k: 1.35 },
  shard: { kind: 'shard' }, crystalgolem: { kind: 'crystal' }, statue: { kind: 'statue' }, colossus: { kind: 'statue', big: 1 },
};
function planGolem(K, M, pv, Gl) {
  M.plan = 'golem';
  const s = K.st, c1 = K.c1, c2 = K.c2, kind = Gl.kind;
  const rock = mix(c1, [0.45, 0.4, 0.38], 0.2), rockD = mix(rock, K.dark, 0.35);
  const glow = K.T.includes('fire') ? [1, 0.55, 0.15] : K.glow;
  if (kind === 'boulder') {
    // ころころの岩（手だけ、目はくぼみの中）
    const R = 0.42;
    const P = new Part([sph([0, R * 0.95, 0], R, rock, { k: 0 })], { noise: 0.035, noiseF: 6 });
    P.add(ell([0, R * 0.95, R * 0.35], [R * 0.82, R * 0.62, R * 0.7], rock, { k: R * 0.2 }));
    if (K.ex.has('lava')) for (let i = 0; i < 6; i++) { const a = i * 1.7; P.paint(box([Math.cos(a) * R * 0.8, R * (0.5 + (i % 3) * 0.3), Math.sin(a) * R * 0.8], [R * 0.04, R * 0.4, R * 0.04], 0, null, { rot: [i, i * 2, 0.5] }), [1, 0.5, 0.1], R * 0.03); }
    M.body = K.add(pv, K.mesh(P, 'body'));
    const head = { part: P, R: R * 0.8, c: [0, R * 0.95, R * 0.1], node: pv };
    M.head = null; M.headInfo = head;
    for (const sx of [-1, 1]) { const AP = new Part([sph([0, -0.06, 0.04], R * 0.28, rockD, { k: 0 })], { noise: 0.02, noiseF: 8 }); const j = K.joint(pv, [sx * R * 1.0, R * 0.7, R * 0.2], [0, 0, sx * 0.3]); K.add(j, K.mesh(AP, 'small')); j.r0 = j.rot.slice(); M.arms.push(j); }
    M.tailBase = null; M.noEars = true;
    M.anchor = { y: R, z0: R * 0.4, z1: -R * 0.4, w: R * 0.8, top: () => R * 1.95, neck: [0, R * 1.6, 0] };
    M.eyeCfg = { dir: [0.38, 0.12, 0.92], size: 0.5 };
    M.faceCfg = { nose: false, mouthY: -R * 0.32 };
    return head;
  }
  if (kind === 'shard' || kind === 'crystal') {
    // 黒曜石：とがった結晶が集まった体
    M.floating = kind === 'shard';
    const sc = kind === 'crystal' ? 1.4 : 0.85, by = kind === 'crystal' ? 0.55 : 0.55;
    const P = new Part();
    const rr = mulberry32(K.sp.id * 7);
    P.add(box([0, by + 0.25 * sc, 0], [0.24 * sc, 0.32 * sc, 0.2 * sc], 0.04, c1, { k: 0, rot: [0, 0.4, 0.1] }));
    for (let i = 0; i < 7; i++) { const a = i / 7 * Math.PI * 2 + rr(); const b = [Math.cos(a) * 0.15 * sc, by + 0.1 * sc + rr() * 0.3 * sc, Math.sin(a) * 0.12 * sc]; P.add(cap(b, [b[0] * 2.4, b[1] + (0.25 + rr() * 0.35) * sc, b[2] * 2.2 - 0.05], 0.1 * sc, 0.02, i % 2 ? c1 : mix(c1, c2, 0.4), { k: 0.03 })); }
    if (kind === 'crystal') P.add(box([0, by - 0.15, 0], [0.2, 0.2, 0.18], 0.04, c1, { k: 0.08 }));
    M.glossy = true;
    M.body = K.add(pv, K.mesh(P, 'body'), { mat: MAT.glossy });
    const head = { part: P, R: 0.28 * sc, c: [0, by + 0.3 * sc, 0.02], node: pv };
    M.head = null; M.headInfo = head;
    for (const sx of [-1, 1]) { const AP = new Part([cap([0, 0, 0], [sx * 0.05, -0.32 * sc, 0.1], 0.07 * sc, 0.02, mix(c1, c2, 0.3), { k: 0 })]); const j = K.joint(pv, [sx * 0.3 * sc, by + 0.35 * sc, 0.02], [0, 0, sx * 0.35]); K.add(j, K.mesh(AP, 'small'), { mat: MAT.glossy }); j.r0 = j.rot.slice(); M.arms.push(j); }
    if (kind === 'crystal') { const LP = new Part([box([0, -0.25, 0], [0.1, 0.25, 0.1], 0.03, c1, { k: 0 })]); const lg = K.mesh(LP, 'limb'); for (const sx of [-1, 1]) { const j = K.joint(pv, [sx * 0.15, 0.5, 0]); K.add(j, lg); j.len = 0.5; M.legs.push(j); } }
    M.core = [0, by + 0.25 * sc, 0.2 * sc];
    K.prim(pv, PRIM.gem, glow, M.core, [0.07 * sc, 0.1 * sc, 0.07 * sc], [Math.PI / 2, 0, 0], { emis: glow.map(v => v * 0.7), mat: MAT.glossy, outline: 0.6 });
    M.tailBase = null; M.noEars = true;
    M.anchor = { y: by, z0: 0.1, z1: -0.2, w: 0.2 * sc, top: () => by + 0.6 * sc, neck: [0, by + 0.5 * sc, 0] };
    M.eyeCfg = { dir: [0.4, 0.3, 0.87], size: 0.42 };
    M.faceCfg = { nose: false, mouth: false };
    return head;
  }
  if (kind === 'statue') {
    // 古代の石像：積み重なった石の柱（光る紋様）
    const big = Gl.big ? 1.3 : 1;
    const P = new Part([], { noise: 0.008, noiseF: 10 });
    const w = 0.3 * big;
    P.add(box([0, w * 0.6, 0], [w * 1.05, w * 0.6, w * 0.9], w * 0.15, rock, { k: 0 }));
    P.add(box([0, w * 1.75, 0], [w * 0.95, w * 0.6, w * 0.82], w * 0.15, mix(rock, c2, 0.15), { k: w * 0.06 }));
    P.add(box([0, w * 2.85, 0], [w * 0.85, w * 0.52, w * 0.78], w * 0.18, rock, { k: w * 0.06 }));
    for (let i = 0; i < 3; i++) P.paint(box([0, w * (0.6 + i * 1.15), w * 0.85], [w * 0.5, w * 0.05, w * 0.1], 0), glow, w * 0.03);
    M.body = K.add(pv, K.mesh(P, 'body'), { emis: [0, 0, 0] });
    const head = { part: P, R: w * 0.9, c: [0, w * 2.85, 0], node: pv };
    M.head = null; M.headInfo = head;
    for (const sx of [-1, 1]) { const AP = new Part([box([0, -w * 0.5, 0], [w * 0.22, w * 0.6, w * 0.25], w * 0.08, rockD, { k: 0 })]); const j = K.joint(pv, [sx * w * 1.25, w * 2.0, 0], [0, 0, sx * 0.15]); K.add(j, K.mesh(AP, 'limb')); j.r0 = j.rot.slice(); M.arms.push(j); }
    if (Gl.big) for (let i = 0; i < 4; i++) K.prim(pv, PRIM.box, rockD, [Math.cos(i * 1.57) * w * 1.8, w * 3.4 + Math.sin(i) * 0.1, Math.sin(i * 1.57) * w * 1.8], [w * 0.25], [i, i, 0]);
    M.floating = !!Gl.big;
    M.tailBase = null; M.noEars = true;
    M.anchor = { y: w * 1.7, z0: w * 0.5, z1: -w * 0.5, w, top: () => w * 3.4, neck: [0, w * 3.2, 0] };
    M.eyeCfg = { dir: [0.35, 0.25, 0.9], size: 0.42 };
    M.faceCfg = { nose: false, mouth: false };
    return head;
  }
  // ゴーレム（岩人形）：大きな肩と腕、短い脚
  const k = Gl.k * lerp(0.9, 1.05, s);
  const hipY = 0.38 * k, tH = 0.62 * k, tw = 0.38 * k;
  const P = new Part([], { noise: 0.018, noiseF: 7 });
  P.add(box([0, hipY + tH * 0.4, 0], [tw * 0.85, tH * 0.45, tw * 0.7], tw * 0.35, rock, { k: 0 }));
  P.add(box([0, hipY + tH * 0.88, 0.02], [tw * 1.25, tH * 0.32, tw * 0.78], tw * 0.3, rock, { k: tw * 0.25 }));
  for (const sx of [-1, 1]) P.add(sph([sx * tw * 1.15, hipY + tH * 1.0, 0], tw * 0.55, rockD, { k: tw * 0.2 }));
  if (K.ex.has('lava')) for (let i = 0; i < 7; i++) P.paint(box([(i % 3 - 1) * tw * 0.5, hipY + tH * (0.3 + (i % 4) * 0.2), tw * 0.6], [tw * 0.04, tH * 0.18, tw * 0.3], 0, null, { rot: [0, 0, i * 0.7] }), [1, 0.5, 0.1], tw * 0.03);
  M.body = K.add(pv, K.mesh(P, 'body'));
  M.core = [0, hipY + tH * 0.6, tw * 0.72];
  K.prim(pv, PRIM.gem, glow, M.core, [tw * 0.2, tw * 0.28, tw * 0.2], [Math.PI / 2, 0, 0], { emis: glow.map(v => v * 0.7), mat: MAT.glossy, outline: 0.6 });
  const LP = new Part([box([0, -hipY * 0.45, 0], [tw * 0.32, hipY * 0.5, tw * 0.32], tw * 0.15, rockD, { k: 0 }), box([0, -hipY + tw * 0.12, tw * 0.1], [tw * 0.38, tw * 0.14, tw * 0.45], tw * 0.1, rockD, { k: tw * 0.08 })], { noise: 0.015, noiseF: 8 });
  const lg = K.mesh(LP, 'limb');
  for (const sx of [-1, 1]) { const j = K.joint(pv, [sx * tw * 0.5, hipY + 0.04, 0]); K.add(j, lg); j.len = hipY; M.legs.push(j); }
  const aL = 0.6 * k, ar = 0.13 * k;
  for (const sx of [-1, 1]) {
    const AP = new Part([box([0, -aL * 0.45, 0.02], [ar * 0.85, aL * 0.45, ar * 0.9], ar * 0.4, rock, { k: 0 }), box([0, -aL - ar * 0.2, 0.04], [ar * 1.35, ar * 1.0, ar * 1.3], ar * 0.5, rockD, { k: ar * 0.3 })], { noise: 0.015, noiseF: 8 });
    const j = K.joint(pv, [sx * tw * 1.2, hipY + tH * 0.95, 0.02], [-0.15, 0, sx * 0.25]); K.add(j, K.mesh(AP, 'limb'));
    j.r0 = j.rot.slice(); j.len = aL; M.arms.push(j);
  }
  const headR = 0.24 * k;
  const HP = new Part([box([0, 0, 0], [headR * 1.0, headR * 0.82, headR * 0.9], headR * 0.4, rock, { k: 0 })], { noise: 0.014, noiseF: 9 });
  HP.add(box([0, headR * 0.35, headR * 0.45], [headR * 0.95, headR * 0.18, headR * 0.4], headR * 0.12, rockD, { k: headR * 0.1 }));
  const head = { part: HP, R: headR, c: [0, 0, 0] };
  const hj = K.joint(pv, [0, hipY + tH * 1.05 + headR * 0.4, 0.06]);
  K.add(hj, K.mesh(HP, 'head'));
  head.node = hj; M.head = hj; M.headInfo = head;
  M.tailBase = null; M.noEars = true;
  M.anchor = { y: hipY + tH * 0.55, z0: tw * 0.2, z1: -tw * 0.5, w: tw, top: () => hipY + tH * 1.1, neck: [0, hipY + tH, 0] };
  M.eyeCfg = { dir: [0.45, 0.32, 0.84], size: 0.5 };
  M.faceCfg = { nose: false };
  return head;
}

// ---------------- 亀 ----------------
const TRT = { turtle: { k: 1 }, bigturtle: { k: 1.25, flat: 1 }, spiketurtle: { k: 1.15, spikes: 1 }, tortoise: { k: 1.05, dome: 1.45, tall: 1.5, neck: 1 } };
function planTurtle(K, M, pv, Tt) {
  M.plan = 'turtle';
  const s = K.st, k = Tt.k;
  const shellCol = Tt.rock ? mix(K.c1, [0.42, 0.36, 0.3], 0.35) : ['leaf', 'bush', 'tree'].includes(K.f.back) ? [0.6, 0.45, 0.28] : K.c2;
  const sw = lerp(0.44, 0.52, s) * k, sl = lerp(0.5, 0.62, s) * k, shY = lerp(0.4, 0.5, s) * (Tt.flat ? 1.1 : 1) * (Tt.tall || 1);
  const P = new Part([ell([0, shY + (Tt.dome ? 0.1 : 0), -0.04], [sw, lerp(0.28, 0.34, s) * (Tt.flat ? 0.85 : 1) * (Tt.dome || 1), sl], shellCol, { k: 0 })], Tt.rock ? { noise: 0.022, noiseF: 7 } : {});
  const shTop = shY + (Tt.dome ? 0.1 : 0) + lerp(0.28, 0.34, s) * (Tt.flat ? 0.85 : 1) * (Tt.dome || 1);
  if (Tt.split) P.add(ell([0, shTop + 0.02, -0.04], [sw * 0.62, 0.16 * k, sl * 0.62], null, { op: 'sub', k: 0.05 }));
  if (Tt.cracks) { const cc = mix(K.c2, WHITE, 0.1); for (let i = 0; i < 7; i++) { const a = i / 7 * Math.PI * 2 + 0.3; P.paint(box([Math.cos(a) * sw * 0.45, shTop - 0.1, -0.04 + Math.sin(a) * sl * 0.45], [0.022, 0.3, sw * 0.4], 0, null, { rot: [0, -a + (i % 2 ? 0.5 : -0.4), 0] }), cc, 0.012); } }
  P.add(tor([0, shY - 0.08, -0.04], sw * 0.92, 0.07, mix(shellCol, [0, 0, 0], 0.18), { k: 0.06, sc: [1, 1, sl / sw], pv: [0, shY - 0.08, -0.04] }));
  P.add(ell([0, shY - 0.14, 0.0], [sw * 0.86, 0.17, sl * 0.9], K.c1, { k: 0.06 }));
  for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; P.paint(ell([Math.cos(a) * sw * 0.55, shY + 0.22 * k, -0.04 + Math.sin(a) * sl * 0.5], [0.13 * k, 0.08, 0.15 * k]), mix(shellCol, [0, 0, 0], 0.22), 0.02); }
  P.paint(ell([0, shY + 0.32 * k, -0.04], [0.15 * k, 0.08, 0.17 * k]), mix(shellCol, [0, 0, 0], 0.22), 0.02);
  if (Tt.spikes || K.ex.has('spikes')) for (let i = 0; i < 7; i++) { const a = i / 7 * Math.PI * 2; const b = [Math.cos(a) * sw * 0.55, shY + 0.18 * k, -0.04 + Math.sin(a) * sl * 0.5]; P.add(cap(b, [b[0] * 1.25, b[1] + 0.32 * k, b[2] * 1.2], 0.09 * k, 0.012, K.hornCol, { k: 0.03 })); }
  const A = { y: shY, z0: 0.15, z1: -0.25, w: sw * 0.55, top: topFn(P), neck: [0, shY, sl * 0.8] };
  bodyPaints(K, P, A);
  M.body = K.add(pv, K.mesh(P, 'body'));
  const lr = 0.11 * k;
  const LP = new Part([sph([0, 0, 0], lr * 1.3, K.c1, { k: 0 }), cap([0, 0, 0], [0, -shY + 0.17, 0.04], lr * 1.15, lr * 1.1, K.c1, { k: lr * 0.4 }), ell([0, -shY + 0.12 + 0.06, 0.08], [lr * 1.3, lr * 0.75, lr * 1.5], K.c1, { k: lr * 0.4 })]);
  if (s > 0.8) for (const x of [-1, 0, 1]) LP.add(cap([x * lr * 0.6, -shY + 0.12, lr * 1.2], [x * lr * 0.7, -shY + 0.08, lr * 1.7], lr * 0.2, lr * 0.03, [0.98, 0.96, 0.9], { k: lr * 0.1 }));
  const lg = K.mesh(LP, 'limb');
  for (const [sx, sz] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) { const j = K.joint(pv, [sx * sw * 0.68, shY - 0.17, sz * sl * 0.55], [0, 0, sx * 0.15]); K.add(j, lg); j.len = shY - 0.17; M.legs.push(j); }
  const R = lerp(0.3, 0.24, s) * (Tt.flat ? 1.1 : 1);
  const head = mammalHead(K, R, { col: K.c1, snout: 0.35 + s * 0.3, brow: s > 0.7 });
  if (Tt.neck) K.add(pv, K.mesh(new Part([cap([0, shY - 0.08, sl * 0.55], [0, shY + 0.32, sl * 1.0], 0.14, 0.12, K.c1, { k: 0 })]), 'limb'));
  const hj = K.joint(pv, [0, shY + 0.02 + (Tt.neck ? 0.38 : 0), sl * 0.95 + R * 0.1 + (Tt.neck ? 0.18 : 0)]);
  K.add(hj, K.mesh(head.part, 'head'));
  head.node = hj; M.head = hj; M.headInfo = head;
  backNodes(K, M, pv, { ...A, top: (z) => A.top(z) - 0.03, w: sw * 0.5 });
  M.tailBase = [0, shY - 0.15, -sl * 0.95];
  M.tailType = K.f.tail;
  M.anchor = A;
  M.eyeCfg = { dir: [0.5, 0.18, 0.85], size: 0.6 };
  return head;
}

// ================= 第2部の 新種（図鑑201〜250）：1体ずつの 専用の 姿 =================
//  1〜200 の 姿と かぶらないように、骨格の 寸法を 変えた うえで、体の 形そのものを 作りたす。
const G2 = {};
const G2_LAVA = [1, 0.5, 0.12], G2_CHAR = [0.17, 0.14, 0.15], G2_CRYS = [0.82, 0.52, 1];
let G2_HEX = null;
const hexGeo = () => G2_HEX || (G2_HEX = new GeoBuilder().cylinder(1, 1, 1, '#ffffff', 0, 0, 0, 6).build());
// +Y を d の 向きへ 向ける 回転
function dirRot(d) { const l = Math.hypot(d[0], d[1], d[2]) || 1; return [Math.acos(clamp(d[1] / l, -1, 1)), Math.atan2(d[0], d[2]), 0]; }
function g2Spin(M, n, ax, sp) { n.spinAx = ax; n.spinSp = sp; (M.spin = M.spin || []).push(n); return n; }
function g2Bob(M, n, a, f, ph = 0) { n.bobY = n.pos[1]; n.bobA = a; n.bobF = f; n.bobPh = ph; (M.bob = M.bob || []).push(n); return n; }
function g2Glow(K, parent, geo, col, pos, scl, rot, k = 0.6, o = {}) { return K.prim(parent, geo, col, pos, scl, rot, { emis: col.map(v => v * k), mat: MAT.glossy, outline: 0.5, ...o }); }
// 結晶：base から dir の 向きへ 長さ len
function g2Gem(K, parent, col, base, dir, len, w, k = 0.5) {
  const l = Math.hypot(dir[0], dir[1], dir[2]) || 1, d = [dir[0] / l, dir[1] / l, dir[2] / l];
  return g2Glow(K, parent, PRIM.gem, col, [base[0] + d[0] * len * 0.45, base[1] + d[1] * len * 0.45, base[2] + d[2] * len * 0.45], [w, len * 0.55, w], dirRot(d), k);
}
// 両面の 板（中心 c から 点列 pts へ 扇形）
function g2Fan(K, parent, c, pts, colA, colB, o = {}) {
  const g = new GeoBuilder();
  for (let i = 0; i < pts.length - 1; i++) { const col = i % 2 ? colA : colB; g.quad(c, pts[i], pts[i + 1], pts[i + 1], col); g.quad(c, pts[i + 1], pts[i], pts[i], col); }
  const n = K.add(parent, g.build(), { outline: 0.8, mat: MAT.decor, ...o }); n.doubleSide = true; return n;
}
function g2Tail(K, M, pv, base, n, len, rad, col, rx0 = 2.0, curl = 0.15, yaw = 0, tipCol = null, taper = 0.55) { return tailChain(K, M, pv, base, n, len, rad, col, rx0, curl, yaw, tipCol, taper); }
const fishR = (K, R) => R.map((v, i) => v * (i === 2 ? lerp(0.85, 1.05, K.st) : lerp(1.05, 1, K.st)));
// 六角の 石の 柱（GeoBuilder にまとめて 1つの 形に）
function hexCols(K, parent, cols, o = {}) {
  const g = new GeoBuilder();
  for (const c of cols) {
    g.setMatrix(M4.fromTRS(c.p, c.rot || [0, c.ry || 0, 0], [1, 1, 1]));
    g.cylinder(c.r, c.r * 1.02, c.h, c.col, 0, 0, 0, 6, true, c.top || null);
  }
  g.setMatrix(null);
  return K.add(parent, g.build(), { outline: 0.9, ...o });
}

// 201 スミネズ：炭の とげを 背負った まんまるの 子ネズミ（とげの 先が 赤く 光る）
G2['スミネズ'] = (K, M, pv) => {
  K.ex.delete('shards');
  const head = planQuad(K, M, pv, { L: .3, legH: .13, chest: [.31, .3, .3], hip: [.34, .33, .34], lift: .02, neck: .03, neckA: 1.0, head: .37, snout: .45, legR: .062, ears: 'round', tail: 'thin' });
  const A = M.anchor, P = new Part(), zc = (A.z0 + A.z1) / 2;
  const G = new Part();
  for (let r = 0; r < 5; r++) for (let c = -3; c <= 3; c++) {
    const z = lerp(A.z0 + 0.06, A.z1 - 0.12, r / 4), x = c * A.w * 0.3 + (r % 2) * A.w * 0.15;
    if (Math.abs(x) > A.w * 1.0) continue;
    const y = A.top(z) - 0.06 - x * x * 1.4;
    const d = [x * 1.9, 0.75, (z - zc) * 1.2 - 0.55], l = Math.hypot(d[0], d[1], d[2]);
    const L = 0.24 + (r >= 1 && r <= 3 ? 0.08 : 0) + (Math.abs(c) <= 1 ? 0.04 : 0);
    const tip = [x + d[0] / l * L, y + d[1] / l * L, z + d[2] / l * L];
    P.add(cap([x, y, z], tip, 0.07, 0.014, G2_CHAR, { k: 0.025 }));
    G.add(cap([x + d[0] / l * L * 0.72, y + d[1] / l * L * 0.72, z + d[2] / l * L * 0.72], tip, 0.03, 0.012, G2_LAVA, { k: 0.005 }));
  }
  K.add(pv, K.mesh(P, 'small'));
  K.add(pv, K.mesh(G, 'tiny'), { emis: [0.8, 0.32, 0.04], outline: 0.3 });
  for (const s of [-1, 1]) g2Glow(K, M.head, PRIM.sphereLo, [1, 0.45, 0.15], headPoint(head, [s * 0.78, -0.32, 0.55]).p, [0.055, 0.035, 0.03], null, 0.7, { outline: 0 });
  const tip = g2Tail(K, M, pv, M.tailBase, 5, 0.09, 0.03, K.c1, 1.9, 0.25);
  addFlame(K, M, tip, [0, 0, 0], 0.4, [Math.PI, 0, 0]);
  M.tailBase = null;
  return head;
};

// 202 スミネズミ：背中に 燃える 炭の 板を 並べた 大ネズミ（板の すきまが 赤く 光る）
G2['スミネズミ'] = (K, M, pv) => {
  K.ex.delete('shards');
  const head = planQuad(K, M, pv, { L: .8, legH: .3, chest: [.3, .33, .34], hip: [.32, .33, .35], lift: .03, hump: .1, neck: .1, neckA: 1.15, head: .3, snout: .95, legR: .088, paw: 1.4, claws: 1, ears: 'side', tail: 'thin', brow: 1 });
  const A = M.anchor, P = new Part([], { noise: 0.01, noiseF: 9 }), G = new Part();
  const N = 6, zAt = (i) => lerp(A.z0 + 0.02, A.z1 - 0.02, i / (N - 1));
  for (let i = 0; i < N; i++) {
    const z = zAt(i), t = A.top(z), h = 0.13 + Math.sin(i / (N - 1) * Math.PI) * 0.13;
    P.add(box([0, t + h * 0.4, z], [0.04, h, 0.11], 0.025, G2_CHAR, { k: 0.02, rot: [0.4, 0, i % 2 ? 0.1 : -0.1] }));
    for (const s of [-1, 1]) P.add(box([s * A.w * 0.5, t - 0.03 + h * 0.2, z - 0.03], [0.035, h * 0.6, 0.09], 0.02, mix(G2_CHAR, K.c1, 0.35), { k: 0.02, rot: [0.4, 0, s * 0.55] }));
    if (i < N - 1) { const zm = (z + zAt(i + 1)) / 2, tm = A.top(zm); G.add(cap([0, tm - 0.02, zm], [0, tm + 0.08, zm - 0.02], 0.035, 0.015, G2_LAVA, { k: 0.01 })); for (const s of [-1, 1]) G.add(sph([s * A.w * 0.32, tm, zm], 0.03, G2_LAVA, { k: 0.01 })); }
  }
  K.add(pv, K.mesh(P, 'small'));
  K.add(pv, K.mesh(G, 'tiny'), { emis: [0.9, 0.38, 0.05], outline: 0 });
  const tip = g2Tail(K, M, pv, M.tailBase, 6, 0.13, 0.045, K.c1, 1.75, 0.12);
  addFlame(K, M, tip, [0, 0, 0], 0.6, [Math.PI, 0, 0]);
  M.tailBase = null;
  return head;
};

// 203 カレハムー：くるんと まるまった 枯れ葉を ずきんのように かぶった イモムシ（しっぽに 青い 火）
G2['カレハムー'] = (K, M, pv) => {
  const head = planSerpent(K, M, pv, { n: 4, r: .27, dr: .03, gap: 1.12, legs: 1, rise: 1 });
  const R = head.R, leafC = [0.95, 0.52, 0.16], leafD = [0.62, 0.24, 0.08];
  const L = new Part([ell([0, R * 0.66, -R * 0.4], [R * 1.25, R * 0.14, R * 1.7], leafC, { k: 0, rot: [0.3, 0, 0] })]);
  for (const s of [-1, 1]) L.add(ell([s * R * 0.92, R * 0.3, -R * 0.4], [R * 0.16, R * 0.5, R * 1.1], leafC, { k: R * 0.12, rot: [0.3, 0, s * 0.35] }));
  L.add(cap([0, R * 0.95, R * 0.75], [0, R * 1.35, R * 1.05], R * 0.2, R * 0.1, leafC, { k: R * 0.1 }));
  L.add(cap([0, R * 1.35, R * 1.05], [0, R * 1.62, R * 0.8], R * 0.1, R * 0.05, leafC, { k: R * 0.06 }));
  L.paint(box([0, R * 0.8, -R * 0.3], [R * 0.05, R * 0.4, R * 1.6], 0, null, { rot: [0.3, 0, 0] }), leafD, R * 0.03);
  for (const s of [-1, 1]) for (let i = 0; i < 3; i++) L.paint(box([s * R * 0.42, R * 0.75, R * 0.15 - i * R * 0.5], [R * 0.4, R * 0.4, R * 0.04], 0, null, { rot: [0.3, s * 0.7, 0] }), leafD, R * 0.025);
  L.add(sph([R * 0.75, R * 0.7, -R * 1.2], R * 0.22, null, { op: 'sub', k: R * 0.04 }));
  L.add(sph([-R * 0.4, R * 0.75, -R * 1.5], R * 0.16, null, { op: 'sub', k: R * 0.04 }));
  K.add(M.head, K.mesh(L, 'small'));
  const last = M.segs[M.segs.length - 1];
  addFlame(K, M, last, [0, 0.12, -0.12], 0.5, [-1.1, 0, 0], true);
  return head;
};

// 204 カレハマユ：小枝から 糸で ぶらさがる 枯れ葉の たば（すきまから 眠そうな 目）
G2['カレハマユ'] = (K, M, pv) => { K.ex.delete('shards'); return planBlob(K, M, pv, { float: 1, shape: (K, M, pv, P, R, by) => {
  const inner = mix(K.c1, [0.25, 0.15, 0.08], 0.35), cA = [0.64, 0.42, 0.2], cB = [0.48, 0.3, 0.14], cC = [0.75, 0.55, 0.28];
  P.add(ell([0, by - R * 0.05, 0], [R * 0.52, R * 0.95, R * 0.52], inner, { k: 0 }));
  for (let i = 0; i < 9; i++) {
    const a = -Math.PI / 2 + (i + 0.5) / 9 * Math.PI * 1.55 + Math.PI * 0.73;
    const rr = R * 0.42, x = Math.cos(a) * rr, z = Math.sin(a) * rr;
    const col = [cA, cB, cC][i % 3];
    P.add(ell([x, by - R * 0.05 + (i % 2) * R * 0.12, z], [R * 0.34, R * 0.98, R * 0.09], col, { k: R * 0.06, rot: [0, -a + Math.PI / 2, (i % 2 ? 0.18 : -0.18)] }));
    P.paint(box([x * 1.25, by, z * 1.25], [R * 0.025, R * 0.9, R * 0.025], 0), mix(col, [0.2, 0.1, 0.05], 0.5), R * 0.02);
  }
  for (let i = 0; i < 3; i++) { const a = i * 2.1 + 0.5; P.add(cap([Math.cos(a) * R * 0.2, by - R * 0.85, Math.sin(a) * R * 0.2], [Math.cos(a) * R * 0.3, by - R * 1.25, Math.sin(a) * R * 0.3], R * 0.12, R * 0.03, [cA, cB, cC][i], { k: R * 0.05 })); }
  // 小枝と 糸
  const T = new Part([cap([-R * 0.95, by + R * 1.45, -R * 0.1], [R * 0.95, by + R * 1.55, -R * 0.05], R * 0.06, R * 0.045, [0.38, 0.26, 0.16], { k: 0 })]);
  T.add(cap([R * 0.4, by + R * 1.52, -R * 0.06], [R * 0.6, by + R * 1.75, -R * 0.12], R * 0.04, R * 0.02, [0.38, 0.26, 0.16], { k: R * 0.02 }));
  T.add(cap([0, by + R * 0.85, 0], [0, by + R * 1.5, -R * 0.08], R * 0.025, R * 0.02, [0.92, 0.9, 0.85], { k: R * 0.02 }));
  K.add(pv, K.mesh(T, 'small'));
  K.prim(pv, PRIM.leaf, [0.55, 0.42, 0.2], [R * 0.6, by + R * 1.75, -R * 0.12], [R * 0.5], [0.4, 0.5, 0.8], { outline: 0.6 });
  for (let i = 0; i < 2; i++) g2Gem(K, pv, G2_CRYS, [(i ? -1 : 1) * R * 0.3, by + R * 0.45, -R * 0.3], [(i ? -1 : 1) * 0.6, 0.8, -0.4], R * 0.38, R * 0.07);
  return { hc: [0, by, R * 0.1], eyeDir: [0.3, 0.12, 0.95], eyeSize: 0.42, arms: false, mouthY: -R * 0.25 };
} }); };

// 205 カレハゴースト：やぶれた 枯れ葉の 羽を もつ 幽霊の ガ（体の 下は すけた 布のよう）
G2['カレハゴースト'] = (K, M, pv) => {
  const head = planBug(K, M, pv, { body: 'fluffy', legs: 6, antenna: 2, float: 1 });
  const by = 0.5, cols = [[0.66, 0.4, 0.18], [0.82, 0.55, 0.24], [0.52, 0.32, 0.16]];
  for (const sx of [-1, 1]) {
    const j = K.joint(pv, [sx * 0.12, by + 0.16, -0.05]);
    const rib = new Part();
    [[0.62, 0.95, 0.3], [0.08, 0.85, 0.26], [-0.48, 0.66, 0.2]].forEach(([ang, len, wd], k) => {
      const d = [sx * Math.cos(ang), Math.sin(ang)], pp = [-d[1], d[0]];
      const pts = [], N = 9;
      for (let i = 0; i <= N; i++) { const t = i / N, w = wd * Math.pow(Math.sin(Math.PI * Math.min(1, t * 0.97 + 0.02)), 0.8) * (i % 3 === 1 ? 0.62 : 1); pts.push([d[0] * len * t + pp[0] * w, d[1] * len * t + pp[1] * w, -0.06 * k - 0.12 * t]); }
      for (let i = N; i >= 0; i--) { const t = i / N, w = wd * Math.pow(Math.sin(Math.PI * Math.min(1, t * 0.97 + 0.02)), 0.8) * (i % 3 === 2 ? 0.55 : 1); pts.push([d[0] * len * t - pp[0] * w, d[1] * len * t - pp[1] * w, -0.06 * k - 0.12 * t]); }
      const col = cols[k];
      g2Fan(K, j, [0, 0, -0.06 * k], pts, col, mix(col, [0.3, 0.15, 0.08], 0.3));
      rib.add(cap([0, 0, -0.06 * k], [d[0] * len * 0.92, d[1] * len * 0.92, -0.06 * k - 0.11], 0.02, 0.008, [0.35, 0.2, 0.1], { k: 0.005 }));
    });
    K.add(j, K.mesh(rib, 'tiny'));
    j.side = sx; M.wings.push(j);
  }
  const S = new Part([cap([0, by - 0.05, -0.25], [0, by - 0.42, -0.62], 0.2, 0.04, [0.82, 0.78, 1], { k: 0 })]);
  for (const s of [-1, 0, 1]) S.add(cap([s * 0.1, by - 0.3, -0.45], [s * 0.16, by - 0.58, -0.6 - Math.abs(s) * 0.05], 0.06, 0.012, [0.82, 0.78, 1], { k: 0.04 }));
  const sn = K.add(pv, K.mesh(S, 'small'), { alpha: 0.6, emis: [0.12, 0.1, 0.22], outline: 0.3 }); sn.transparent = true;
  return head;
};

// 206 ホシクズ：おすわりした 子ギツネ。くるんと 上がった しっぽの 先に 星の 結晶、ひたいに 星、まわりに 小さな 星
G2['ホシクズ'] = (K, M, pv) => {
  K.ex.delete('shards');
  const head = planQuad(K, M, pv, { L: .38, legH: .25, chest: [.24, .27, .24], hip: [.28, .26, .28], lift: .2, neck: .14, neckA: .35, head: .4, snout: .55, legR: .058, ears: 'big', tail: 'none' });
  const tip = g2Tail(K, M, pv, M.tailBase, 5, 0.15, 0.1, K.c1, 2.6, 0.3, 0.75, K.c2);
  for (let i = 0; i < 5; i++) { const a = i / 5 * Math.PI * 2; g2Gem(K, tip, i % 2 ? G2_CRYS : [1, 0.85, 1], [0, 0.02, 0], [Math.cos(a) * 0.8, -1, Math.sin(a) * 0.8], 0.3, 0.07); }
  g2Gem(K, tip, [1, 0.95, 0.7], [0, 0, 0], [0, -1, 0], 0.42, 0.1, 0.75);
  const st = g2Glow(K, M.head, PRIM.star, [1, 0.92, 0.5], headPoint(head, [0, 0.55, 0.83]).p, [0.11], [-0.5, 0, 0], 0.7); st.doubleSide = true;
  M.orbit = K.joint(pv, [0, 0.75, -0.05]);
  for (let i = 0; i < 3; i++) { const a = i / 3 * Math.PI * 2 + 0.5; const n = g2Glow(K, M.orbit, PRIM.star, [1, 0.9, 1], [Math.cos(a) * 0.52, Math.sin(a * 2) * 0.1, Math.sin(a) * 0.52], [0.085], null, 0.8, { outline: 0.4 }); n.doubleSide = true; }
  M.tailBase = null;
  return head;
};

// 207 ホシクズリ：3本の しっぽ（先に 結晶）と ひたいの 結晶を もつ 星の キツネ
G2['ホシクズリ'] = (K, M, pv) => {
  K.ex.delete('shards');
  const head = planQuad(K, M, pv, { L: .66, legH: .44, chest: [.24, .26, .28], hip: [.22, .24, .25], lift: .08, neck: .3, neckA: .6, head: .3, snout: 1.0, legR: .064, ears: 'big', tail: 'none' });
  for (const yaw of [-0.6, 0, 0.6]) { const tip = g2Tail(K, M, pv, M.tailBase, 4, 0.16, 0.09, K.c1, yaw ? 2.05 : 2.4, 0.18, yaw, K.c2); g2Gem(K, tip, G2_CRYS, [0, 0, 0], [0, -1, 0], 0.28, 0.065, 0.6); }
  g2Gem(K, M.head, [1, 0.85, 1], headPoint(head, [0, 0.62, 0.72]).p, [0, 0.75, 0.6], 0.24, 0.055);
  M.tailBase = null;
  return head;
};

// 208 メテオクズリ：肩に 隕石の 岩と 結晶の よろいを まとった 星の 獣。しっぽは ほうき星
G2['メテオクズリ'] = (K, M, pv) => {
  K.ex.delete('shards');
  const head = planQuad(K, M, pv, { L: .95, legH: .6, chest: [.38, .43, .41], hip: [.25, .27, .28], lift: .16, neck: .3, neckA: .85, head: .3, snout: 1.15, legR: .1, paw: 1.25, claws: 1, ears: 'pointy', tail: 'none', brow: 1 });
  const A = M.anchor, n = A.neck, D = K.joint(pv, [0, 0, 0]);
  const rock = mix(K.c1, [0.22, 0.2, 0.26], 0.55);
  const P = new Part([], { noise: 0.03, noiseF: 7 });
  for (let i = 0; i < 7; i++) { const a = -1.35 + i / 6 * 2.7; P.add(sph([Math.sin(a) * A.w * 1.0, n[1] - 0.16 + Math.cos(a) * 0.1, n[2] - 0.12 - Math.cos(a) * 0.04], 0.14 + (i % 2) * 0.04, rock, { k: 0.07 })); }
  K.add(D, K.mesh(P, 'small'));
  for (let i = 0; i < 7; i++) { const a = -1.35 + i / 6 * 2.7; g2Gem(K, D, i % 2 ? [1, 0.78, 1] : G2_CRYS, [Math.sin(a) * A.w * 1.05, n[1] - 0.08 + Math.cos(a) * 0.1, n[2] - 0.16], [Math.sin(a) * 1.3, 0.85, -0.45], 0.36 + (i % 3) * 0.08, 0.075); }
  const tip = g2Tail(K, M, pv, M.tailBase, 6, 0.17, 0.095, K.c1, 2.0, 0.1, 0, K.c2);
  g2Gem(K, tip, [1, 0.95, 0.75], [0, 0, 0], [0, -1, 0], 0.42, 0.09, 0.8);
  for (let i = 0; i < 3; i++) { const t = M.chains[M.chains.length - 1][2 + i]; g2Gem(K, t, G2_CRYS, [0, -0.08, -0.06], [0, 0.2, -1], 0.2, 0.045); }
  M.seatSkip = [D];
  M.tailBase = null;
  return head;
};

// 209 ヒビガメ：高い 岩の こうらに ひびが 走り、てっぺんから 結晶が のぞく 子ガメ
G2['ヒビガメ'] = (K, M, pv) => {
  K.ex.delete('shards'); K.f.back = null;
  const head = planTurtle(K, M, pv, { k: .95, dome: 1.55, tall: 1.2, rock: 1, cracks: 1 });
  const t = M.anchor.top(-0.04);
  for (let i = 0; i < 3; i++) { const a = i * 2.1 + 0.4; g2Gem(K, pv, i === 1 ? [0.75, 0.95, 1] : mix(K.c2, WHITE, 0.3), [Math.cos(a) * 0.07, t - 0.06, -0.04 + Math.sin(a) * 0.07], [Math.cos(a) * 0.55, 1, Math.sin(a) * 0.55], 0.24 + i * 0.05, 0.055); }
  return head;
};

// 210 ヒビガメラ：こうらが 大きく 割れて、中から 結晶の 森（晶洞）が つき出た 大ガメ
G2['ヒビガメラ'] = (K, M, pv) => {
  K.ex.delete('shards'); K.ex.delete('spikes'); K.f.back = null;
  const head = planTurtle(K, M, pv, { k: 1.3, flat: 1, rock: 1, cracks: 1, split: 1 });
  const t = M.anchor.top(-0.04), rr = mulberry32(K.sp.id * 5 + 1);
  for (let i = 0; i < 10; i++) {
    const a = i / 10 * Math.PI * 2 + rr() * 0.3, r = i % 4 === 0 ? 0.02 : 0.12 + rr() * 0.14;
    g2Gem(K, pv, i % 3 === 0 ? [0.72, 0.95, 1] : i % 3 === 1 ? mix(K.c2, WHITE, 0.2) : [0.85, 0.75, 1], [Math.cos(a) * r, t - 0.14, -0.04 + Math.sin(a) * r * 1.2], [Math.cos(a) * r * 2.4, 1, Math.sin(a) * r * 2.4], 0.38 + rr() * 0.32 + (r < 0.05 ? 0.3 : 0), 0.07 + rr() * 0.04, 0.45);
  }
  const R2 = new Part([], { noise: 0.03, noiseF: 6 });
  for (let i = 0; i < 9; i++) { const a = i / 9 * Math.PI * 2; R2.add(box([Math.cos(a) * 0.4, t - 0.08, -0.04 + Math.sin(a) * 0.47], [0.1, 0.08, 0.07], 0.03, mix(K.c1, K.dark, 0.25), { k: 0.03, rot: [0.5 * Math.sin(a), -a, 0.6 * Math.cos(a)] })); }
  K.add(pv, K.mesh(R2, 'small'));
  return head;
};

// 211 ドロウオ：頭の 上に 目が とび出た 泥の 魚。背中に 大きな 帆の ひれ
G2['ドロウオ'] = (K, M, pv) => {
  const F = { R: [.22, .22, .5], tail: 'flow', eyeTop: 1 };
  const head = planFish(K, M, pv, F);
  const R = fishR(K, F.R), by = 0.6 + R[1] * 0.4;
  const pts = [];
  for (let i = 0; i <= 10; i++) { const a = 0.35 + i / 10 * 2.3; pts.push([0, by + R[1] * 0.55 + Math.sin(a) * R[1] * (1.25 + (i % 2) * 0.22), R[2] * 0.05 + Math.cos(a) * R[2] * 0.85]); }
  g2Fan(K, pv, [0, by + R[1] * 0.4, R[2] * 0.05], pts, K.c2, mix(K.c2, WHITE, 0.3));
  const SP = new Part();
  for (let i = 1; i < 10; i += 2) SP.add(cap([0, by + R[1] * 0.5, R[2] * 0.05], pts[i], R[1] * 0.04, R[1] * 0.02, mix(K.c2, K.dark, 0.4), { k: 0.005 }));
  K.add(pv, K.mesh(SP, 'tiny'));
  return head;
};

// 212 ドロウオーガ：大きな あごの 毒アンコウ。ひたいの ちょうちんが 光り、背中に 毒の とげ
G2['ドロウオーガ'] = (K, M, pv) => {
  K.ex.delete('shards'); K.f.back = null;
  const F = { R: [.42, .4, .55], tail: 'fan', bigJaw: 1 };
  const head = planFish(K, M, pv, F);
  const R = fishR(K, F.R), by = 0.6 + R[1] * 0.4;
  const tip = tailChain(K, M, pv, [0, by + R[1] * 0.85, R[2] * 0.5], 3, 0.15, 0.025, mix(K.c1, K.dark, 0.3), 3.05, 0.5, 0, null, 0.4);
  g2Glow(K, tip, PRIM.sphereHi, [0.85, 1, 0.45], [0, -0.05, 0], [0.085], null, 0.9);
  for (let i = 0; i < 7; i++) {
    const x = (i - 3) / 3 * R[0] * 0.62, z = R[2] * 1.02 - x * x * 1.6;
    K.prim(pv, PRIM.cone, [0.98, 0.96, 0.88], [x, by - R[1] * 0.08, z], [0.035, 0.1, 0.035], [Math.PI, 0, 0], { mat: MAT.glossy, outline: 0.6 });
    if (i % 2 === 0) K.prim(pv, PRIM.cone, [0.98, 0.96, 0.88], [x * 1.1, by - R[1] * 0.38, z + 0.02], [0.035, 0.12, 0.035], [0.2, 0, 0], { mat: MAT.glossy, outline: 0.6 });
  }
  const SP = new Part();
  for (let i = 0; i < 6; i++) { const z = lerp(R[2] * 0.15, -R[2] * 0.85, i / 5), y = by + Math.sqrt(Math.max(0, 1 - (z / (R[2] * 1.05)) ** 2)) * R[1] * 0.95; SP.add(cap([0, y - 0.03, z], [0, y + 0.18 - i * 0.015, z - 0.1], 0.05, 0.008, mix(K.c2, K.dark, 0.2), { k: 0.02 })); }
  K.add(pv, K.mesh(SP, 'small'));
  return head;
};

// 213 サビクラゲ：さびた 潜水かぶとの ような かさ（びょう・のぞき窓・バルブ）と 鎖の 触手
G2['サビクラゲ'] = (K, M, pv) => { K.ex.delete('shards'); return planBlob(K, M, pv, { float: 1, shape: (K, M, pv, P, R, by) => {
  const rust = K.c1, rustD = mix(K.c1, [0.25, 0.12, 0.05], 0.45), brass = [0.86, 0.66, 0.32];
  P.add(ell([0, by + R * 0.12, 0], [R * 0.82, R * 0.8, R * 0.82], rust, { k: 0 }));
  P.add(tor([0, by - R * 0.4, 0], R * 0.8, R * 0.11, rustD, { k: R * 0.05 }));
  P.add(box([0, by - R * 1.55, 0], [R * 2, R, R * 2], 0, null, { op: 'sub', k: R * 0.06 }));
  for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; P.add(sph([Math.cos(a) * R * 0.86, by - R * 0.24, Math.sin(a) * R * 0.86], R * 0.06, brass, { k: R * 0.02 })); }
  P.add(tor([0, by + R * 0.12, R * 0.74], R * 0.4, R * 0.07, brass, { k: R * 0.04, rot: [Math.PI / 2, 0, 0] }));
  P.paint(sph([0, by + R * 0.12, R * 0.86], R * 0.4), mix(K.c2, WHITE, 0.35), R * 0.03);
  for (let i = 0; i < 4; i++) { const a = i / 4 * Math.PI * 2 + 0.4; P.paint(box([Math.cos(a) * R * 0.5, by + R * 0.6, Math.sin(a) * R * 0.5], [R * 0.2, R * 0.25, R * 0.2], 0, null, { rot: [0, a, 0] }), mix(rust, [0.55, 0.3, 0.1], 0.5), R * 0.12); }
  P.add(cap([0, by + R * 0.85, 0], [0, by + R * 1.12, 0], R * 0.08, R * 0.07, brass, { k: R * 0.03 }));
  P.add(tor([0, by + R * 1.14, 0], R * 0.2, R * 0.045, [0.85, 0.3, 0.25], { k: R * 0.02 }));
  for (let i = 0; i < 5; i++) {
    const a = i / 5 * Math.PI * 2 + 0.3, b = [Math.cos(a) * R * 0.5, by - R * 0.45, Math.sin(a) * R * 0.5];
    const tip = tailChain(K, M, pv, b, 4, R * 0.24, R * 0.07, rustD, 0.28, 0.1, Math.atan2(-Math.cos(a), -Math.sin(a)), null, 0.35);
    K.prim(tip, hexGeo(), brass, [0, -R * 0.05, 0], [R * 0.09, R * 0.07, R * 0.09], null, { mat: MAT.glossy, outline: 0.6 });
  }
  return { hc: [0, by + R * 0.12, 0], eyeDir: [0.3, 0.06, 0.95], eyeSize: 0.4, arms: false, mouthY: -R * 0.25 };
} }); };

// 214 サビクラゲオン：3段に 重なった さびた 鐘の かさ。先に いかりの ついた 長い 鎖の 触手
G2['サビクラゲオン'] = (K, M, pv) => { K.ex.delete('shards'); return planBlob(K, M, pv, { float: 1, shape: (K, M, pv, P, R, by) => {
  const rust = K.c1, rustD = mix(K.c1, [0.25, 0.12, 0.05], 0.45), brass = [0.86, 0.66, 0.32], teal = mix(K.c2, WHITE, 0.2);
  const tiers = [[by, 1.0, 0.5], [by + R * 0.52, 0.74, 0.42], [by + R * 0.92, 0.5, 0.34]];
  tiers.forEach(([y, w, h], i) => {
    P.add(ell([0, y, 0], [R * w, R * h, R * w], i % 2 ? mix(rust, teal, 0.25) : rust, { k: i ? R * 0.06 : 0 }));
    P.add(tor([0, y - R * h * 0.55, 0], R * w * 0.98, R * 0.08, rustD, { k: R * 0.04 }));
    for (let j = 0; j < 10 - i * 2; j++) { const a = j / (10 - i * 2) * Math.PI * 2; P.add(sph([Math.cos(a) * R * w * 1.0, y - R * h * 0.45, Math.sin(a) * R * w * 1.0], R * 0.05, brass, { k: R * 0.02 })); }
  });
  P.add(box([0, by - R * 1.25, 0], [R * 2, R, R * 2], 0, null, { op: 'sub', k: R * 0.06 }));
  P.paint(sph([0, by + R * 0.05, R * 0.95], R * 0.42), mix(teal, WHITE, 0.3), R * 0.05);
  const AP = new Part([cap([0, 0, 0], [0, -R * 0.42, 0], R * 0.045, R * 0.045, brass, { k: 0 }), tor([0, R * 0.02, 0], R * 0.08, R * 0.025, brass, { k: R * 0.01, rot: [Math.PI / 2, 0, 0] })]);
  for (const s of [-1, 1]) { AP.add(cap([0, -R * 0.42, 0], [s * R * 0.2, -R * 0.32, 0], R * 0.045, R * 0.04, brass, { k: R * 0.03 })); AP.add(cap([s * R * 0.2, -R * 0.32, 0], [s * R * 0.24, -R * 0.15, 0], R * 0.04, R * 0.012, brass, { k: R * 0.02 })); }
  AP.add(cap([-R * 0.13, -R * 0.08, 0], [R * 0.13, -R * 0.08, 0], R * 0.03, R * 0.03, brass, { k: R * 0.01 }));
  const ag = K.mesh(AP, 'tiny');
  for (let i = 0; i < 6; i++) {
    const a = i / 6 * Math.PI * 2 + 0.25, b = [Math.cos(a) * R * 0.62, by - R * 0.35, Math.sin(a) * R * 0.62];
    const tip = tailChain(K, M, pv, b, 6, R * 0.22, R * 0.075, i % 2 ? rustD : mix(rustD, teal, 0.3), 0.22, 0.06, Math.atan2(-Math.cos(a), -Math.sin(a)), null, 0.3);
    K.add(tip, ag, { mat: MAT.glossy });
  }
  return { hc: [0, by + R * 0.05, 0], eyeDir: [0.3, 0.08, 0.95], eyeSize: 0.4, arms: false, mouthY: -R * 0.22 };
} }); };

// 215 カラカラス：ぼさぼさの とさかと 長い 2本の 尾羽の 子ガラス
G2['カラカラス'] = (K, M, pv) => {
  K.f.tail = 'none';
  const head = planBird(K, M, pv, { body: [.25, .27, .33], by: .42, head: .33, legL: .2, wing: 1.0, beak: .8, tilt: .32 });
  const R = head.R, C = new Part();
  for (let i = 0; i < 9; i++) { const a = -1.1 + i * 0.275, L = R * (1.35 - Math.abs(a) * 0.4); C.add(cap([Math.sin(a) * R * 0.25, R * 0.6, R * 0.1 - Math.abs(a) * R * 0.1], [Math.sin(a) * R * 0.85, R * 0.6 + L, -R * 0.45 - Math.abs(a) * R * 0.25], R * 0.16, R * 0.025, i % 2 ? K.c1 : mix(K.c1, K.c2, 0.55), { k: R * 0.06 })); }
  K.add(M.head, K.mesh(C, 'small'));
  for (const s of [-1, 1]) { const tip = tailChain(K, M, pv, M.tailBase, 5, 0.16, 0.05, K.c1, 1.95, -0.1, s * 0.3, null, 0.35); K.add(tip, K.mesh(new Part([ell([0, -0.08, 0], [0.07, 0.15, 0.015], K.c2, { k: 0 })]), 'tiny')); }
  M.tailBase = null;
  return head;
};

// 216 カラカラスオー：マントの ような 翼を まとった 背の 高い 大ガラス。長い くちばしと 結晶の かんむり
G2['カラカラスオー'] = (K, M, pv) => {
  M.rideBoost = 1.5;
  K.ex.delete('shards'); K.ex.delete('crest');
  const head = planBird(K, M, pv, { body: [.3, .5, .32], by: .78, head: .27, neck: .04, legL: .32, wing: 1.35, beak: 1.6, hook: 1, tilt: -.12, talon: 1, cape: 1, ruff: 1 });
  for (let i = 0; i < 5; i++) { const a = -0.8 + i * 0.4; g2Gem(K, M.head, [1, 0.32, 0.48], headPoint(head, [Math.sin(a) * 0.55, 0.82, -0.15]).p, [Math.sin(a) * 0.65, 1, -0.35], 0.22 + (i === 2 ? 0.12 : 0), 0.045); }
  const A = M.anchor, P = new Part();
  for (let i = 0; i < 6; i++) { const x = (i - 2.5) * A.w * 0.32; P.add(cap([x, A.y - 0.3, -A.w * 1.0], [x * 1.15, A.y - 0.62 - (i % 2) * 0.08, -A.w * 1.2], 0.07, 0.01, mix(K.c2, K.dark, 0.25), { k: 0.03 })); }
  K.add(pv, K.mesh(P, 'small'));
  return head;
};

// 217 ドクシズク：ソフトクリームのように 先が くるんと まがった 毒の しずく。足もとに 毒の 水たまり
G2['ドクシズク'] = (K, M, pv) => planBlob(K, M, pv, { ground: 1, glossy: 1, shape: (K, M, pv, P, R, by) => {
  const c1 = K.c1, c3 = mix(c1, K.c2, 0.45);
  P.add(ell([0, R * 0.52, 0], [R * 0.78, R * 0.55, R * 0.72], c1, { k: 0 }));
  P.add(cap([0, R * 0.75, -R * 0.05], [0, R * 1.22, -R * 0.08], R * 0.5, R * 0.24, c1, { k: R * 0.2 }));
  P.add(cap([0, R * 1.22, -R * 0.08], [R * 0.2, R * 1.48, R * 0.02], R * 0.24, R * 0.11, c1, { k: R * 0.1 }));
  P.add(cap([R * 0.2, R * 1.48, R * 0.02], [-R * 0.04, R * 1.62, R * 0.1], R * 0.11, R * 0.04, c1, { k: R * 0.06 }));
  P.add(ell([0, R * 0.05, 0], [R * 1.25, R * 0.07, R * 1.15], c3, { k: R * 0.15 }));
  P.paint(ell([-R * 0.32, R * 0.85, R * 0.35], [R * 0.16, R * 0.24, R * 0.12]), mix(c1, WHITE, 0.6), R * 0.06);
  for (let i = 0; i < 3; i++) { const a = i * 2.2 + 0.6; P.add(sph([Math.cos(a) * R * 0.95, R * 0.1, Math.sin(a) * R * 0.85], R * 0.12, c3, { k: R * 0.08 })); }
  return { hc: [0, R * 0.55, R * 0.05], eyeDir: [0.36, 0.08, 0.93], eyeSize: 0.5, arms: false, mouthY: -R * 0.22 };
} });

// 218 ドクシズクイン：キノコの 日がさを うかべた 毒の 女王（ドレスの すそから しずくが たれる）
G2['ドクシズクイン'] = (K, M, pv) => {
  K.ex.delete('shards');
  const B = { hipY: .46, tH: .44, tw: .2, sh: 1.0, waist: .64, head: .31, snout: .15, aL: .44, ar: .05, fist: 1.0, robe: 2.25, float: 1 };
  const head = planBiped(K, M, pv, B);
  const s = K.st, hipY = B.hipY * lerp(0.78, 1.03, s), tw = B.tw * lerp(0.96, 1.05, s), floor = hipY * 0.35, rr = tw * B.robe;
  const D = new Part();
  for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2, r = rr * 0.92; const L = 0.06 + (i % 3) * 0.04; D.add(cap([Math.cos(a) * r, floor + 0.05, Math.sin(a) * r], [Math.cos(a) * r * 1.02, floor - L, Math.sin(a) * r * 1.02], 0.03, 0.045, K.c2, { k: 0.02 })); }
  K.add(pv, K.mesh(D, 'small'), { mat: MAT.glossy });
  const hy = M.head.pos[1];
  const U = K.joint(pv, [0.12, hy + 0.55, -0.05], [0.08, 0, -0.12]);
  const C = new Part([ell([0, 0, 0], [0.48, 0.24, 0.48], K.c1, { k: 0 })]);
  C.add(ell([0, -0.1, 0], [0.42, 0.18, 0.42], null, { op: 'sub', k: 0.03 }));
  C.paint(ell([0, -0.08, 0], [0.42, 0.14, 0.42]), mix(K.c2, WHITE, 0.4), 0.02);
  for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2 + 0.3; C.paint(sph([Math.cos(a) * 0.3, 0.16, Math.sin(a) * 0.3], 0.07), mix(K.c2, WHITE, 0.55), 0.015); }
  for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2; C.add(cap([Math.cos(a) * 0.45, -0.06, Math.sin(a) * 0.45], [Math.cos(a) * 0.46, -0.14 - (i % 2) * 0.06, Math.sin(a) * 0.46], 0.025, 0.035, K.c2, { k: 0.02 })); }
  C.add(cap([0, 0, 0], [0, -0.55, 0], 0.025, 0.02, [0.95, 0.88, 0.95], { k: 0.01 }));
  K.add(U, K.mesh(C, 'small'), { mat: MAT.glossy });
  g2Bob(M, U, 0.04, 1.6);
  return head;
};

// 219 ミュータド：すけた 頭に 脳と 3つめの 目。おたまじゃくしの しっぽが のこった 変異ガエル
G2['ミュータド'] = (K, M, pv) => {
  K.ex.delete('shards');
  const head = planBiped(K, M, pv, { hipY: .15, tH: .4, tw: .3, sh: .95, waist: 1.15, head: .42, snout: 0, aL: .26, ar: .065, fist: 1.3, lr: .09, foot: 1.8, frog: 1 });
  const R = head.R, hd = M.head;
  const Bn = new Part([ell([0, R * 0.6, -R * 0.28], [R * 0.56, R * 0.36, R * 0.5], [1, 0.62, 0.86], { k: 0 })]);
  for (let i = 0; i < 4; i++) Bn.paint(tor([0, R * 0.6, -R * 0.28], R * (0.15 + i * 0.12), R * 0.025, WHITE, { rot: [0, 0, 0.15 * i] }), [0.85, 0.36, 0.62], R * 0.02);
  Bn.paint(box([0, R * 0.95, -R * 0.28], [R * 0.025, R * 0.3, R * 0.6], 0), [0.8, 0.3, 0.55], R * 0.02);
  K.add(hd, K.mesh(Bn, 'small'), { mat: MAT.glossy, emis: [0.12, 0.03, 0.1] });
  const gl = K.prim(hd, PRIM.sphereHi, [0.85, 0.97, 1], [0, R * 0.6, -R * 0.26], [R * 0.68, R * 0.5, R * 0.62], null, { alpha: 0.32, mat: MAT.glossy, outline: 0.35 }); gl.transparent = true; gl.noDepthWrite = true;
  const ep = headPoint(head, [0, 0.42, 0.9]).p;
  K.prim(hd, PRIM.sphereHi, WHITE, ep, [R * 0.17, R * 0.2, R * 0.1], null, { outline: 0.7 });
  g2Glow(K, hd, PRIM.sphereHi, [0.9, 0.3, 1], [ep[0], ep[1], ep[2] + R * 0.06], [R * 0.1, R * 0.13, R * 0.06], null, 0.6, { outline: 0 });
  K.prim(hd, PRIM.sphereLo, [0.05, 0.02, 0.08], [ep[0], ep[1], ep[2] + R * 0.11], [R * 0.035, R * 0.08, R * 0.02], null, { outline: 0 });
  M.tailBase = [0, M.anchor.belt + 0.06, -0.24]; M.tailType = 'fin';
  return head;
};

// 220 ミュータントード：頭に 4本の 目玉の くき、背中に 光る いぼと 結晶の 大ガエル
G2['ミュータントード'] = (K, M, pv) => {
  K.ex.delete('shards');
  const B = { hipY: .22, tH: .6, tw: .48, sh: 1.0, waist: 1.35, head: .42, snout: 0, aL: .46, ar: .1, fist: 1.4, lr: .12, foot: 1.7, frog: 1, belly: 1 };
  const head = planBiped(K, M, pv, B);
  const R = head.R, hd = M.head, s = K.st;
  const ST = new Part();
  [[-0.55, 0.15], [-0.2, -0.15], [0.2, -0.15], [0.55, 0.15]].forEach(([x, zz], i) => {
    const b = [x * R, R * 0.55, zz * R], t = [x * R * 1.5, R * (1.45 + (i % 2) * 0.3), zz * R + R * 0.15];
    ST.add(cap(b, t, R * 0.12, R * 0.08, K.c1, { k: R * 0.06 }));
    K.prim(hd, PRIM.sphereHi, WHITE, t, [R * 0.17], null, { outline: 0.7 });
    g2Glow(K, hd, PRIM.sphereHi, [1, 0.45, 1], [t[0], t[1], t[2] + R * 0.12], [R * 0.09, R * 0.09, R * 0.06], null, 0.8, { outline: 0 });
  });
  K.add(hd, K.mesh(ST, 'small'));
  const hipY = B.hipY * lerp(0.78, 1.03, s), tH = B.tH * lerp(0.86, 1.03, s), tw = B.tw * lerp(0.96, 1.05, s);
  const rr = mulberry32(K.sp.id);
  for (let i = 0; i < 9; i++) { const a = -1.1 + rr() * 2.2, y = hipY + tH * (0.3 + rr() * 0.6); g2Glow(K, pv, PRIM.sphereHi, [0.95, 0.5, 1], [Math.sin(a) * tw * 1.05, y, -Math.cos(a) * tw * 0.75], [0.05 + rr() * 0.035], null, 0.7, { outline: 0.4 }); }
  for (let i = 0; i < 4; i++) { const a = -0.6 + i * 0.4; g2Gem(K, pv, G2_CRYS, [Math.sin(a) * tw * 0.5, hipY + tH * 0.85, -tw * 0.62], [Math.sin(a) * 0.8, 0.8, -0.6], 0.3 + (i % 2) * 0.12, 0.06); }
  return head;
};

// 221 キノコガイ：切りかぶに 3本の 光る キノコが 生えた 子
G2['キノコガイ'] = (K, M, pv) => { K.f.back = null; return planBlob(K, M, pv, { ground: 1, shape: (K, M, pv, P, R, by) => {
  const bark = mix(K.c1, [0.42, 0.3, 0.2], 0.6), barkD = mix(bark, [0.12, 0.08, 0.06], 0.4), wood = [0.86, 0.72, 0.5];
  P.add(cap([0, R * 0.1, 0], [0, R * 0.95, 0], R * 0.7, R * 0.6, bark, { k: 0 }));
  P.add(box([0, R * 2.0, 0], [R * 2, R, R * 2], 0, null, { op: 'sub', k: R * 0.04 }));
  for (let i = 0; i < 5; i++) { const a = i / 5 * Math.PI * 2 + 0.6; P.add(cap([Math.cos(a) * R * 0.45, R * 0.35, Math.sin(a) * R * 0.45], [Math.cos(a) * R * 0.95, R * 0.04, Math.sin(a) * R * 0.95], R * 0.17, R * 0.07, bark, { k: R * 0.1 })); }
  P.paint(box([0, R * 1.0, 0], [R * 2, R * 0.05, R * 2], 0), wood, R * 0.03);
  for (let i = 1; i < 4; i++) P.paint(tor([0, R * 1.0, 0], R * 0.15 * i, R * 0.018, WHITE), mix(wood, [0.5, 0.35, 0.2], 0.5), R * 0.01);
  for (let i = 0; i < 9; i++) { const a = i / 9 * Math.PI * 2; if (Math.sin(a) > 0.55) continue; P.paint(box([Math.cos(a) * R * 0.7, R * 0.55, Math.sin(a) * R * 0.7], [R * 0.035, R * 0.42, R * 0.035], 0, null, { rot: [0, -a, 0] }), barkD, R * 0.02); }
  const S = new Part(), C = new Part();
  [[0, 0.95, -0.15, 0.62, 0.45], [-0.38, 0.95, 0.12, 0.38, 0.28], [0.36, 0.95, 0.1, 0.32, 0.24]].forEach(([x, y, z, h, cr], i) => {
    const b = [x * R, y * R, z * R], t = [x * R * 1.2, (y + h) * R, z * R];
    S.add(cap(b, t, R * cr * 0.32, R * cr * 0.26, [0.92, 0.88, 0.82], { k: R * 0.05 }));
    C.add(ell([t[0], t[1] + R * cr * 0.1, t[2]], [R * cr, R * cr * 0.55, R * cr], K.c1, { k: 0, rot: [0, 0, (x ? -x * 0.6 : 0)] }));
    for (let j = 0; j < 4; j++) { const a = j / 4 * Math.PI * 2 + i; C.paint(sph([t[0] + Math.cos(a) * R * cr * 0.55, t[1] + R * cr * 0.42, t[2] + Math.sin(a) * R * cr * 0.55], R * cr * 0.2), K.c2, R * 0.02); }
  });
  K.add(pv, K.mesh(S, 'small'));
  K.add(pv, K.mesh(C, 'small'), { emis: K.c2.map(v => v * 0.12) });
  return { hc: [0, R * 0.55, 0], eyeDir: [0.34, 0.06, 0.94], eyeSize: 0.44, arms: false, mouthY: -R * 0.18 };
} }); };

// 222 キノコロッサス：体に サルノコシカケが 段々に 生え、頭に 大きな 光る キノコの かさを かぶった 巨人
G2['キノコロッサス'] = (K, M, pv) => {
  K.ex.delete('shards'); K.f.back = null;
  const head = planGolem(K, M, pv, { kind: 'golem', k: 1.3 });
  const k = 1.3 * lerp(0.9, 1.05, K.st), hipY = 0.38 * k, tH = 0.62 * k, tw = 0.38 * k, hR = 0.24 * k;
  const C = new Part([ell([0, hR * 1.0, -hR * 0.1], [hR * 2.5, hR * 1.0, hR * 2.4], K.c1, { k: 0 })]);
  C.add(ell([0, hR * 0.55, -hR * 0.1], [hR * 2.3, hR * 0.55, hR * 2.2], null, { op: 'sub', k: hR * 0.1 }));
  C.paint(ell([0, hR * 0.6, -hR * 0.1], [hR * 2.4, hR * 0.25, hR * 2.3]), mix(K.c1, WHITE, 0.45), hR * 0.05);
  for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; C.paint(sph([Math.cos(a) * hR * 1.5, hR * 1.75, -hR * 0.1 + Math.sin(a) * hR * 1.4], hR * 0.3), K.c2, hR * 0.05); }
  K.add(M.head, K.mesh(C, 'small'), { emis: K.c2.map(v => v * 0.1) });
  K.add(M.head, K.mesh(new Part([cap([0, hR * 0.3, -hR * 0.1], [0, hR * 0.9, -hR * 0.1], hR * 0.45, hR * 0.4, [0.88, 0.84, 0.78], { k: 0 })]), 'small'));
  const shelf = mix(K.c2, [0.55, 0.45, 0.3], 0.55), Sh = new Part();
  for (const sx of [-1, 1]) for (let i = 0; i < 3; i++) { const y = hipY + tH * (0.25 + i * 0.22), w = tw * (0.52 - i * 0.08); Sh.add(ell([sx * tw * 0.95, y, tw * 0.1 - i * 0.05], [w, tw * 0.07, w * 0.75], i % 2 ? shelf : mix(shelf, WHITE, 0.2), { k: tw * 0.04 })); }
  for (let i = 0; i < 3; i++) Sh.add(ell([0, hipY + tH * (0.3 + i * 0.25), -tw * 0.78], [tw * (0.55 - i * 0.1), tw * 0.07, tw * 0.4], shelf, { k: tw * 0.04 }));
  K.add(pv, K.mesh(Sh, 'small'));
  for (const sx of [-1, 1]) for (let i = 0; i < 3; i++) {
    const b = [sx * tw * (1.0 + i * 0.25), hipY + tH * 1.25, (i - 1) * tw * 0.3], h = tw * (0.35 + (i === 1 ? 0.2 : 0));
    K.prim(pv, PRIM.cyl, [0.9, 0.86, 0.8], b, [tw * 0.06, h, tw * 0.06]);
    g2Glow(K, pv, PRIM.sphereHi, K.c2, [b[0], b[1] + h, b[2]], [tw * 0.16, tw * 0.09, tw * 0.16], null, 0.45);
  }
  return head;
};

// 223 ハイカゼ：長い 脚と 長い 尾羽で 灰の 原を 駆ける 鳥（後ろへ なびく とさか）
G2['ハイカゼ'] = (K, M, pv) => {
  K.f.tail = 'none';
  const head = planBird(K, M, pv, { body: [.2, .22, .38], by: .64, head: .25, neck: .14, legL: .44, wing: .9, beak: 1.35, tilt: .5 });
  const R = head.R, C = new Part();
  for (let i = 0; i < 3; i++) C.add(cap([0, R * 0.6, -R * 0.2 - i * R * 0.15], [0, R * (1.15 - i * 0.2), -R * (1.35 + i * 0.15)], R * 0.16, R * 0.02, i % 2 ? K.c2 : K.c1, { k: R * 0.08 }));
  K.add(M.head, K.mesh(C, 'small'));
  for (const yaw of [-0.18, 0, 0.18]) { const tip = tailChain(K, M, pv, M.tailBase, 4, 0.17, 0.045, K.c1, yaw ? 1.75 : 1.95, -0.06, yaw, null, 0.3); K.add(tip, K.mesh(new Part([ell([0, -0.07, 0], [0.05, 0.13, 0.014], K.c2, { k: 0 })]), 'tiny')); }
  M.tailBase = null;
  return head;
};

// 224 ハイカゼワシ：4枚の 翼を もつ 大ワシ。体の まわりを 灰の 渦が まわる
G2['ハイカゼワシ'] = (K, M, pv) => {
  M.rideBoost = 1.3;
  const head = planBird(K, M, pv, { body: [.34, .4, .5], by: .8, head: .23, neck: .2, legL: .3, wing: 1.85, beak: 1.2, hook: 1, crest: 1, tilt: .45, talon: 1, spread: 1 });
  const A = M.anchor;
  addWings(K, M, pv, { ...A, top: () => A.y - 0.08, wingZ: A.z1 * 0.85, w: A.w * 1.3 });
  const ring = K.joint(pv, [0, A.y - 0.15, -0.05]); g2Spin(M, ring, 1, 1.4);
  for (let i = 0; i < 2; i++) { const t = K.prim(ring, PRIM.torus, [0.82, 0.78, 0.72], [0, i * 0.2 - 0.12, 0], [0.85 + i * 0.15, 0.7, 0.85 + i * 0.15], [0.18 * (i ? 1 : -1), 0, 0.12], { alpha: 0.38, outline: 0 }); t.transparent = true; t.noDepthWrite = true; }
  return head;
};

// 225 デンジクモ：おなかの 上に テスラコイル（銅の 輪と 光る 玉）を 背負った 子グモ
G2['デンジクモ'] = (K, M, pv) => {
  K.ex.delete('shards');
  const head = planBug(K, M, pv, { body: 'spider', legs: 8 });
  const by = 0.36, top = [0, by + 0.44, -0.32], cu = [0.88, 0.52, 0.25];
  const C = new Part([cap([0, top[1] - 0.06, top[2]], [0, top[1] + 0.3, top[2]], 0.05, 0.04, [0.32, 0.32, 0.4], { k: 0 })]);
  for (let i = 0; i < 4; i++) C.add(tor([0, top[1] + 0.04 + i * 0.065, top[2]], 0.12 - i * 0.017, 0.024, cu, { k: 0.005 }));
  K.add(pv, K.mesh(C, 'small'), { mat: MAT.glossy });
  g2Glow(K, pv, PRIM.sphereHi, [0.6, 0.95, 1], [0, top[1] + 0.37, top[2]], [0.075], null, 0.9);
  for (const s of [-1, 1]) { const Z = new Part([cap([0, 0, 0], [s * 0.06, 0.07, 0], 0.012, 0.012, WHITE, { k: 0 }), cap([s * 0.06, 0.07, 0], [s * 0.02, 0.1, 0], 0.012, 0.012, WHITE, { k: 0 }), cap([s * 0.02, 0.1, 0], [s * 0.1, 0.19, 0], 0.012, 0.004, WHITE, { k: 0 })]); K.add(K.joint(pv, [s * 0.08, top[1] + 0.38, top[2]]), K.mesh(Z, 'tiny'), { emis: [0.7, 0.9, 1], outline: 0 }); }
  return head;
};

// 226 デンジグモン：背中に 光る 電磁の 巣（まわる 円盤）を ひろげた 長い 脚の 大グモ
G2['デンジグモン'] = (K, M, pv) => {
  K.ex.delete('shards');
  const head = planBug(K, M, pv, { body: 'spider', legs: 8, legScale: 1.55 });
  const W0 = K.joint(pv, [0, 1.02, -0.62], [-0.3, 0, 0]), W = K.joint(W0, [0, 0, 0]);
  g2Spin(M, W, 2, 0.6);
  const col = [0.55, 0.95, 1];
  for (const r of [0.62, 0.42, 0.22]) g2Glow(K, W, PRIM.torus, col, [0, 0, 0], [r, r, r * 0.6], [Math.PI / 2, 0, 0], 0.7, { outline: 0 });
  for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; g2Glow(K, W, PRIM.box, col, [Math.cos(a) * 0.32, Math.sin(a) * 0.32, 0], [0.64, 0.018, 0.018], [0, 0, a], 0.7, { outline: 0 }); }
  g2Glow(K, W, PRIM.sphereHi, [1, 0.95, 0.5], [0, 0, 0], [0.08], null, 0.9);
  K.prim(pv, PRIM.cyl, [0.3, 0.3, 0.38], [0, 0.72, -0.5], [0.03, 0.32, 0.03], [-0.3, 0, 0]);
  for (const s of [-1, 1]) g2Glow(K, pv, PRIM.cone, col, [s * 0.06, 0.32, 0.46], [0.03, 0.12, 0.03], [Math.PI - 0.3, 0, 0], 0.6);
  return head;
};

// 227 クラウドン：トゲトゲの 雷フグ。頭の 上に 小さな 雷雲、しっぽは いなずま形
G2['クラウドン'] = (K, M, pv) => {
  K.f.back = null;
  const F = { R: [.36, .35, .38], tail: 'none' };
  const head = planFish(K, M, pv, F);
  const R = fishR(K, F.R), by = 0.6 + R[1] * 0.4;
  const spike = mix(K.c2, WHITE, 0.15);
  for (let i = 0; i < 26; i++) {
    const a = i * 2.4, e = -0.75 + (i % 6) / 5 * 1.7;
    const d = [Math.cos(e) * Math.sin(a), Math.sin(e), Math.cos(e) * Math.cos(a)];
    if (d[2] > 0.55 && Math.abs(d[1]) < 0.55) continue;
    K.prim(pv, PRIM.cone, spike, [d[0] * R[0] * 0.92, by + d[1] * R[1] * 0.92, 0.04 + d[2] * R[2] * 0.92], [0.035, 0.13, 0.035], dirRot(d), { outline: 0.6 });
  }
  const cl = K.joint(pv, [0, by + R[1] * 1.45, -0.05]); g2Bob(M, cl, 0.04, 2.2);
  const CP = new Part();
  for (const [x, y, z, r] of [[0, 0, 0, 0.16], [-0.15, -0.03, 0.02, 0.12], [0.16, -0.02, -0.02, 0.13], [0.05, 0.08, -0.06, 0.12]]) CP.add(sph([x, y, z], r, [0.62, 0.62, 0.7], { k: 0.05 }));
  K.add(cl, K.mesh(CP, 'small'));
  const BP = new Part([cap([0, 0.06, 0], [0.06, -0.08, 0], 0.035, 0.03, K.c2, { k: 0 }), cap([0.06, -0.08, 0], [-0.04, -0.1, 0], 0.03, 0.03, K.c2, { k: 0 }), cap([-0.04, -0.1, 0], [0.02, -0.26, 0], 0.03, 0.006, K.c2, { k: 0 })]);
  K.add(cl, K.mesh(BP, 'tiny'), { emis: [0.6, 0.55, 0.1] });
  const TB = new Part([cap([0, 0, 0], [0, 0.22, -0.12], 0.07, 0.05, K.c2, { k: 0, sc: [0.35, 1, 1], pv: [0, 0, 0] }), cap([0, 0.22, -0.12], [0, 0.05, -0.2], 0.05, 0.05, K.c2, { k: 0, sc: [0.35, 1, 1], pv: [0, 0.22, -0.12] }), cap([0, 0.05, -0.2], [0, 0.32, -0.36], 0.05, 0.008, K.c2, { k: 0, sc: [0.35, 1, 1], pv: [0, 0.05, -0.2] })]);
  K.add(M.tails[0], K.mesh(TB, 'small'), { emis: [0.4, 0.36, 0.05] });
  return head;
};

// 228 クラウドラン：飛行船のような 雲クジラ。横に まわる プロペラ、背に 避雷針、おなかに 雷雲
G2['クラウドラン'] = (K, M, pv) => {
  K.ex.delete('shards'); K.f.back = null;
  const F = { R: [.4, .38, 1.05], tail: 'none' };
  const head = planFish(K, M, pv, F);
  const R = fishR(K, F.R), by = 0.6 + R[1] * 0.4, D = K.joint(pv, [0, 0, 0]);
  const FP = new Part();
  for (let i = 0; i < 4; i++) { const a = i / 4 * Math.PI * 2 + Math.PI / 4; FP.add(cap([0, 0, 0.12], [Math.cos(a) * R[0] * 1.2, Math.sin(a) * R[1] * 1.2, -R[2] * 0.42], R[1] * 0.42, R[1] * 0.1, i % 2 ? K.c2 : mix(K.c1, WHITE, 0.2), { k: 0.03, sc: [Math.abs(Math.sin(a)) * 0.75 + 0.25, Math.abs(Math.cos(a)) * 0.75 + 0.25, 1], pv: [0, 0, 0.12] })); }
  K.add(M.tails[0], K.mesh(FP, 'small'));
  for (const s of [-1, 1]) {
    const pod = K.joint(D, [s * R[0] * 1.08, by - R[1] * 0.2, R[2] * 0.05]);
    K.add(pod, K.mesh(new Part([cap([0, 0, 0.22], [0, 0, -0.22], 0.11, 0.08, [0.85, 0.85, 0.9], { k: 0 }), cap([-s * 0.11, 0, 0], [-s * 0.02, 0, 0], 0.05, 0.05, [0.6, 0.6, 0.68], { k: 0.02 })]), 'small'));
    const pr = K.joint(pod, [0, 0, 0.27]); g2Spin(M, pr, 2, 9);
    for (let b = 0; b < 3; b++) { const a = b / 3 * Math.PI * 2; K.prim(pr, PRIM.box, K.c2, [Math.cos(a) * 0.12, Math.sin(a) * 0.12, 0], [0.24, 0.05, 0.012], [0, 0, a], { outline: 0.6 }); }
  }
  K.prim(D, PRIM.cyl, [0.6, 0.6, 0.68], [0, by + R[1] * 0.9, R[2] * 0.45], [0.025, 0.42, 0.025]);
  g2Glow(K, D, PRIM.sphereHi, [1, 0.95, 0.4], [0, by + R[1] * 0.9 + 0.44, R[2] * 0.45], [0.06], null, 0.9);
  const CP = new Part();
  for (let i = 0; i < 7; i++) { const z = lerp(R[2] * 0.6, -R[2] * 0.7, i / 6); CP.add(sph([((i % 2) - 0.5) * R[0] * 0.5, by - R[1] * 0.92, z], R[0] * (0.38 + (i % 3) * 0.06), [0.6, 0.6, 0.68], { k: 0.06 })); }
  K.add(D, K.mesh(CP, 'small'));
  M.seatSkip = [D];
  return head;
};

// 229 ヨウガンボ：かたい 岩の からを かぶった 溶岩の かたまり。足もとに 溶岩が したたる
G2['ヨウガンボ'] = (K, M, pv) => { K.ex.delete('shards'); return planBlob(K, M, pv, { ground: 1, shape: (K, M, pv, P, R, by) => {
  const lava = [1, 0.42, 0.1];
  P.add(ell([0, R * 0.62, 0], [R * 0.78, R * 0.62, R * 0.74], lava, { k: 0 }));
  P.add(ell([0, R * 0.08, 0], [R * 1.0, R * 0.1, R * 0.95], mix(lava, [1, 0.75, 0.3], 0.3), { k: R * 0.2 }));
  P.paint(sph([0, R * 0.5, R * 0.62], R * 0.42), [1, 0.78, 0.32], R * 0.15);
  M.body_emis = [0.5, 0.17, 0.02];
  const crust = mix(K.c1, G2_CHAR, 0.4);
  const C = new Part([ell([0, R * 0.86, -R * 0.04], [R * 0.86, R * 0.56, R * 0.83], crust, { k: 0 })], { noise: 0.03, noiseF: 6 });
  C.add(ell([0, R * 0.4, R * 0.98], [R * 0.72, R * 0.42, R * 0.52], null, { op: 'sub', k: R * 0.06 }));
  C.add(ell([0, R * 0.2, 0], [R * 1.3, R * 0.4, R * 1.3], null, { op: 'sub', k: R * 0.04 }));
  for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2 + 0.4; C.add(box([Math.cos(a) * R * 0.6, R * 1.0, Math.sin(a) * R * 0.6], [R * 0.025, R * 0.5, R * 0.1], 0, null, { op: 'sub', k: R * 0.01, rot: [0, -a, 0.6] })); }
  K.add(pv, K.mesh(C, 'small'));
  for (let i = 0; i < 4; i++) { const a = i / 4 * Math.PI * 2 + 0.8; K.prim(pv, PRIM.drop, lava, [Math.cos(a) * R * 0.75, R * 0.25, Math.sin(a) * R * 0.72], [R * 0.08, R * 0.1, R * 0.08], [Math.PI, 0, 0], { emis: [0.6, 0.2, 0.02], outline: 0.5 }); }
  return { hc: [0, R * 0.5, R * 0.05], eyeDir: [0.36, 0.05, 0.93], eyeSize: 0.42, arms: true, mouthY: -R * 0.2 };
} }); };

// 230 ヨウガンボルグ：胴が 火山に なった 巨人。肩の 火口から 炎が ふきだし、溶岩が 流れる
G2['ヨウガンボルグ'] = (K, M, pv) => {
  K.ex.delete('shards'); K.ex.delete('spikes');
  const B = { hipY: .5, tH: .72, tw: .42, sh: 1.25, waist: .8, head: .22, snout: .2, aL: .7, ar: .15, fist: 2.1, lr: .16, foot: 1.5, hunch: .04, brow: 1 };
  const head = planBiped(K, M, pv, B);
  const s = K.st, hipY = B.hipY * lerp(0.78, 1.03, s), tH = B.tH * lerp(0.86, 1.03, s), tw = B.tw * lerp(0.96, 1.05, s);
  const rock = mix(K.c1, [0.3, 0.26, 0.24], 0.3);
  const yb = hipY - tH * 0.04, yt = hipY + tH * 1.12, rb = tw * 2.05, rt = tw * 0.95, rAt = (y) => lerp(rb, rt, (y - yb) / (yt - yb));
  const V = new Part([], { noise: 0.025, noiseF: 5 });
  for (let i = 0; i < 4; i++) { const y0 = lerp(yb, yt, i / 4), y1 = lerp(yb, yt, (i + 1) / 4); V.add(cap([0, y0, 0], [0, y1, 0.01], rAt(y0), rAt(y1), rock, { k: tw * 0.05 })); }
  V.add(box([0, yt + 1, 0], [2, 1, 2], 0, null, { op: 'sub', k: tw * 0.04 }));
  V.add(ell([0, yt + tH * 0.02, 0.01], [rt * 0.75, tH * 0.12, rt * 0.75], null, { op: 'sub', k: tw * 0.06 }));
  V.add(box([0, yb - 1, 0], [2, 1, 2], 0, null, { op: 'sub', k: 0.03 }));
  V.paint(ell([0, yt - tH * 0.02, 0.01], [rt * 0.85, tH * 0.08, rt * 0.85]), G2_LAVA, tw * 0.04);
  K.add(pv, K.mesh(V, 'body'));
  for (let i = 0; i < 8; i++) {
    const LV = new Part();
    let a = i / 8 * Math.PI * 2 + 0.2, prev = null; const yEnd = lerp(yb, yt, 0.12 + (i % 3) * 0.14);
    for (let k = 0; k <= 5; k++) { const y = lerp(yt - tH * 0.02, yEnd, k / 5); a += Math.sin(k * 1.7 + i) * 0.08; const r = rAt(y) * 1.15 + 0.02; const q = [Math.sin(a) * r, y, Math.cos(a) * r + 0.01]; if (prev) LV.add(cap(prev, q, tw * 0.07, tw * 0.055, G2_LAVA, { k: tw * 0.03 })); prev = q; }
    K.add(pv, K.mesh(LV, 'small'), { emis: [0.85, 0.32, 0.03], outline: 0.3 });
  }
  g2Glow(K, pv, PRIM.sphereHi, G2_LAVA, [0, yt - tH * 0.04, 0.01], [rt * 0.8, tH * 0.05, rt * 0.8], null, 0.9, { outline: 0 });
  for (const sx of [-1, 1]) {
    const b = [sx * tw * 1.05, hipY + tH * 0.72, -tw * 0.35];
    const VP = new Part([cap(b, [b[0] * 1.08, b[1] + tw * 0.45, b[2] - tw * 0.1], tw * 0.3, tw * 0.17, rock, { k: 0 })], { noise: 0.02, noiseF: 7 });
    VP.add(sph([b[0] * 1.08, b[1] + tw * 0.5, b[2] - tw * 0.1], tw * 0.13, null, { op: 'sub', k: tw * 0.04 }));
    K.add(pv, K.mesh(VP, 'small'));
    addFlame(K, M, pv, [b[0] * 1.08, b[1] + tw * 0.42, b[2] - tw * 0.1], 0.9);
  }
  return head;
};

// 231 ヒバチョウ：おしりが ランプのように 光る 火の粉の ホタル
G2['ヒバチョウ'] = (K, M, pv) => {
  K.f.back = null;
  const head = planBug(K, M, pv, { body: 'round', wings: 'small', legs: 6, antenna: 1, float: 1, big: .85 });
  g2Glow(K, pv, PRIM.sphereHi, [1, 0.86, 0.35], [0, 0.6, -0.52], [0.3, 0.27, 0.32], null, 0.95, { outline: 0.4 });
  K.prim(pv, PRIM.torus, K.dark, [0, 0.58, -0.32], [0.24, 0.3, 0.24], [Math.PI / 2 - 0.35, 0, 0]);
  M.orbit = K.joint(pv, [0, 0.5, -0.2]);
  for (let i = 0; i < 4; i++) { const a = i / 4 * Math.PI * 2; g2Glow(K, M.orbit, PRIM.sphereLo, [1, 0.65, 0.2], [Math.cos(a) * 0.5, Math.sin(a * 3) * 0.12, Math.sin(a) * 0.5], [0.03], null, 1, { outline: 0 }); }
  return head;
};

// 232 ヒバチョウガ：長い 燕尾の 先が 燃える 炎の アゲハ。羽の ふちにも 炎
G2['ヒバチョウガ'] = (K, M, pv) => {
  K.f.back = null;
  const head = planBug(K, M, pv, { body: 'slim', wings: 'butterfly', legs: 6, antenna: 1, float: 1 });
  const W = lerp(0.8, 1.2, K.st);
  for (const wj of M.wings) {
    const sx = wj.side;
    const tip = tailChain(K, M, wj, [sx * 0.2 * W, -0.36 * W, -0.32], 4, 0.15, 0.035, K.c2, 0.4, 0.16, sx * -0.35, null, 0.45);
    addFlame(K, M, tip, [0, 0, 0], 0.55, [Math.PI, 0, 0]);
    for (const a of [0.55, 0.9, 1.25]) addFlame(K, M, wj, [sx * Math.cos(a - 0.5) * 0.75 * W, Math.sin(a) * 0.55 * W + 0.06, -0.05 - Math.sin(a * 0.6) * 0.1], 0.32, [0, 0, -sx * (a - 0.4)]);
  }
  return head;
};

// 233 ボルカニ：小さな 火山の からを 背負った ヤドカリ（火口に 炎）
G2['ボルカニ'] = (K, M, pv) => {
  const head = planBug(K, M, pv, { body: 'crab', legs: 6, claws: 1, stalks: 1 });
  const by = 0.36, rock = [0.36, 0.3, 0.3];
  const V = new Part([cap([0, by + 0.08, -0.14], [0, by + 0.62, -0.24], 0.38, 0.13, rock, { k: 0 })], { noise: 0.03, noiseF: 6 });
  V.add(sph([0, by + 0.68, -0.24], 0.1, null, { op: 'sub', k: 0.03 }));
  for (let i = 0; i < 5; i++) { const a = i / 5 * Math.PI * 2; V.paint(cap([Math.sin(a) * 0.1, by + 0.6, -0.24 + Math.cos(a) * 0.1], [Math.sin(a + 0.2) * 0.3, by + 0.25, -0.18 + Math.cos(a + 0.2) * 0.3], 0.025, 0.02), G2_LAVA, 0.015); }
  K.add(pv, K.mesh(V, 'small'), { emis: [0.05, 0.015, 0] });
  g2Glow(K, pv, PRIM.sphereLo, G2_LAVA, [0, by + 0.6, -0.24], [0.08, 0.025, 0.08], null, 0.9, { outline: 0 });
  addFlame(K, M, pv, [0, by + 0.6, -0.24], 0.5);
  return head;
};

// 234 ボルカニング：背中に 湯けむりを 上げる 溶岩の 城を 背負った 大ガニの 王（右の ハサミだけ 大きい）
G2['ボルカニング'] = (K, M, pv) => {
  K.ex.delete('shards'); K.ex.delete('crown');
  const head = planBug(K, M, pv, { body: 'crab', legs: 6, claws: 1.25, stalks: 1 });
  const by = 0.36, rock = [0.3, 0.24, 0.24], rockL = [0.42, 0.34, 0.32], D = K.joint(pv, [0, 0, 0]);
  // 城の 土台と 城壁（でこぼこの 岩）
  const C = new Part([box([0, by + 0.32, -0.08], [0.36, 0.13, 0.27], 0.05, rock, { k: 0 })], { noise: 0.012, noiseF: 9 });
  for (let i = 0; i < 7; i++) { const x = -0.33 + i * 0.11; C.add(box([x, by + 0.48, 0.17], [0.035, 0.04, 0.035], 0.008, rockL, { k: 0.01 })); C.add(box([x, by + 0.48, -0.33], [0.035, 0.04, 0.035], 0.008, rockL, { k: 0.01 })); }
  for (const sx of [-1, 1]) for (let i = 0; i < 5; i++) C.add(box([sx * 0.35, by + 0.48, 0.13 - i * 0.11], [0.035, 0.04, 0.035], 0.008, rockL, { k: 0.01 }));
  // 天守（まんなかの 高い 塔）と 左右の 小さな 塔
  C.add(box([0, by + 0.62, -0.1], [0.15, 0.2, 0.13], 0.03, rockL, { k: 0.02 }));
  C.add(cap([0, by + 0.82, -0.1], [0, by + 1.02, -0.1], 0.16, 0.02, [0.62, 0.22, 0.16], { k: 0.01 }));
  for (const sx of [-1, 1]) { C.add(cap([sx * 0.27, by + 0.4, -0.22], [sx * 0.27, by + 0.66, -0.22], 0.075, 0.07, rockL, { k: 0.02 })); C.add(cap([sx * 0.27, by + 0.66, -0.22], [sx * 0.27, by + 0.8, -0.22], 0.09, 0.01, [0.62, 0.22, 0.16], { k: 0.01 })); }
  // 窓の 光（溶岩）
  for (const [x, y, z] of [[0, by + 0.62, 0.035], [-0.07, by + 0.36, 0.2], [0.07, by + 0.36, 0.2], [0.27, by + 0.56, -0.15], [-0.27, by + 0.56, -0.15]]) C.paint(box([x, y, z], [0.03, 0.045, 0.03], 0), [1, 0.62, 0.18], 0.012);
  K.add(D, K.mesh(C, 'small'), { emis: [0.06, 0.025, 0.01] });
  // 煙突と 湯けむり
  for (const [x, z, h] of [[0.18, -0.3, 0.36], [-0.16, -0.32, 0.3]]) {
    K.prim(D, PRIM.cyl, [0.22, 0.2, 0.22], [x, by + 0.4, z], [0.045, h, 0.045]);
    for (let k = 0; k < 3; k++) { const st = K.prim(D, PRIM.sphere, [0.95, 0.95, 0.98], [x + k * 0.03, by + 0.45 + h + k * 0.12, z - k * 0.02], [0.06 + k * 0.03], null, { alpha: 0.7 - k * 0.15, outline: 0 }); st.transparent = true; g2Bob(M, st, 0.03, 2 + k, k); }
  }
  // 城の 旗
  K.prim(D, PRIM.cyl, [0.5, 0.4, 0.3], [0, by + 1.0, -0.1], [0.012, 0.22, 0.012]);
  K.add(D, K.mesh(new Part([box([0.07, by + 1.17, -0.1], [0.07, 0.04, 0.008], 0.005, K.c1, { k: 0 })]), 'tiny'));
  // 右の ハサミだけ 大きく（王の ハサミ）
  if (M.pincers && M.pincers[1]) M.pincers[1].setScale(1.45);
  if (M.pincers && M.pincers[0]) M.pincers[0].setScale(0.9);
  // 足もとの 甲羅の ふちに 溶岩の すじ
  K.add(D, K.mesh(new Part([tor([0, by + 0.05, 0], 0.46, 0.025, G2_LAVA, { k: 0, sc: [1, 1, 0.75], pv: [0, by + 0.05, 0] })]), 'tiny'), { emis: [0.85, 0.32, 0.03], outline: 0.2 });
  return head;
};

// 235 メテオン：ころころの 小さな 隕石。うしろに ほうき星の 炎の しっぽ
G2['メテオン'] = (K, M, pv) => { K.ex.delete('shards'); return planBlob(K, M, pv, { float: 1, shape: (K, M, pv, P, R, by) => {
  P.noise = 0.045; P.noiseF = 4;
  P.add(sph([0, by, 0], R * 0.62, K.c1, { k: 0 }));
  for (const [x, y, z, r] of [[0.45, 0.35, -0.2, 0.17], [-0.5, 0.15, -0.15, 0.14], [0.1, 0.55, -0.35, 0.12], [-0.25, -0.45, 0.1, 0.13]]) P.add(sph([x * R, by + y * R, z * R], r * R, null, { op: 'sub', k: R * 0.05 }));
  for (let i = 0; i < 5; i++) { const a = i * 1.3; P.paint(box([Math.cos(a) * R * 0.45, by + Math.sin(a * 2) * R * 0.3, -R * 0.3 + Math.sin(a) * R * 0.3], [R * 0.025, R * 0.35, R * 0.025], 0, null, { rot: [a, a * 2, 0.5] }), mix(K.c2, WHITE, 0.25), R * 0.02); }
  addFlame(K, M, pv, [0, by + R * 0.3, -R * 0.4], 1.7, [-1.05, 0, 0]);
  addFlame(K, M, pv, [R * 0.35, by + R * 0.05, -R * 0.35], 1.2, [-1.2, 0.55, 0]);
  addFlame(K, M, pv, [-R * 0.35, by + R * 0.2, -R * 0.35], 1.2, [-1.0, -0.55, 0]);
  const tr = K.prim(pv, PRIM.cone, [1, 0.6, 0.25], [0, by, -R * 0.35], [R * 0.45, R * 1.6, R * 0.45], [-Math.PI / 2, 0, 0], { alpha: 0.35, emis: [0.5, 0.25, 0.05], outline: 0 }); tr.transparent = true; tr.noDepthWrite = true;
  return { hc: [0, by, 0], eyeDir: [0.34, 0.1, 0.93], eyeSize: 0.46, arms: false, mouthY: -R * 0.2 };
} }); };

// 236 メテオノイド：割れた 岩の からの すきまから 光る 核。まわりを 大きな 結晶の かけらが まわる
G2['メテオノイド'] = (K, M, pv) => { K.ex.delete('shards'); return planBlob(K, M, pv, { float: 1, shape: (K, M, pv, P, R, by) => {
  P.add(sph([0, by, 0], R * 0.42, mix(K.c2, WHITE, 0.25), { k: 0 }));
  M.body_emis = K.c2.map(v => v * 0.3);
  const rock = mix(K.c1, [0.25, 0.22, 0.3], 0.3);
  for (const sy of [-1, 1]) {
    const S = new Part([sph([0, by + sy * R * 0.18, -R * 0.05], R * 0.56, rock, { k: 0 })], { noise: 0.03, noiseF: 6 });
    S.add(box([0, by - sy * R * 0.62, 0], [R, R * 0.62, R], 0, null, { op: 'sub', k: R * 0.04 }));
    S.add(ell([0, by, R * 0.55], [R * 0.4, R * 0.35, R * 0.4], null, { op: 'sub', k: R * 0.05 }));
    K.add(pv, K.mesh(S, 'small'));
  }
  M.orbit = K.joint(pv, [0, by, 0]);
  for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2, y = (i % 2 ? 0.25 : -0.2) * R; g2Gem(K, M.orbit, i % 2 ? G2_CRYS : mix(K.c2, WHITE, 0.3), [Math.cos(a) * R * 0.95, y, Math.sin(a) * R * 0.95], [Math.cos(a), (i % 2 ? 0.6 : -0.4), Math.sin(a)], R * (0.55 + (i % 3) * 0.12), R * 0.12, 0.55); }
  for (const sx of [-1, 1]) {
    const j = K.joint(pv, [sx * R * 0.7, by - R * 0.05, R * 0.1], [0, 0, sx * 0.55]);
    for (let k = 0; k < 3; k++) g2Gem(K, j, G2_CRYS, [0, -R * 0.05 * k, 0], [sx * (k - 1) * 0.35, -1, 0.2], R * (0.45 - k * 0.08), R * 0.09);
    j.r0 = j.rot.slice(); M.arms.push(j);
  }
  return { hc: [0, by, 0], eyeDir: [0.3, 0.08, 0.95], eyeSize: 0.4, arms: false, mouthY: -R * 0.2, hr: R * 0.5 };
} }); };

// 237 メテオロード：土星のような まわる 輪を まとった 隕石の 王。肩に 大きな 結晶、頭に 結晶の かんむり
G2['メテオロード'] = (K, M, pv) => {
  K.ex.delete('shards');
  const head = planGolem(K, M, pv, { kind: 'golem', k: 1.35 });
  const k = 1.35 * lerp(0.9, 1.05, K.st), hipY = 0.38 * k, tH = 0.62 * k, tw = 0.38 * k;
  const ring = K.joint(pv, [0, hipY + tH * 0.55, 0], [0.3, 0, 0.16]), rj = K.joint(ring, [0, 0, 0]);
  g2Spin(M, rj, 1, 0.7);
  g2Glow(K, rj, PRIM.torus, mix(K.c2, [0.6, 0.3, 1], 0.4), [0, 0, 0], [tw * 2.0, tw * 0.22, tw * 2.0], null, 0.45);
  g2Glow(K, rj, PRIM.torus, mix(K.c2, WHITE, 0.2), [0, 0, 0], [tw * 1.7, tw * 0.14, tw * 1.7], null, 0.35);
  for (let i = 0; i < 5; i++) { const a = i / 5 * Math.PI * 2; K.prim(rj, PRIM.box, mix(K.c1, K.dark, 0.3), [Math.cos(a) * tw * 2.0, 0, Math.sin(a) * tw * 2.0], [tw * 0.14], [a, a * 2, 0.4], { outline: 0.6 }); }
  for (const sx of [-1, 1]) for (let i = 0; i < 4; i++) { const a = (i - 1.5) * 0.45; g2Gem(K, pv, i % 2 ? G2_CRYS : mix(K.c2, WHITE, 0.3), [sx * tw * 1.15, hipY + tH * 1.1, (i - 1.5) * tw * 0.25], [sx * (0.45 + Math.abs(a) * 0.5), 1, a * 0.6], tw * (0.9 + (i % 2) * 0.35), tw * 0.16); }
  const hR = 0.24 * k;
  for (let i = 0; i < 5; i++) { const a = (i - 2) * 0.42; g2Gem(K, M.head, i === 2 ? [1, 0.9, 0.5] : G2_CRYS, [Math.sin(a) * hR * 0.7, hR * 0.7, -hR * 0.1], [Math.sin(a), 1.4, -0.2], hR * (0.6 + (i === 2 ? 0.4 : 0)), hR * 0.13); }
  return head;
};

// 238 コスモドラ：星の 玉が ばらばらに つながって 飛ぶ 宇宙の 竜（玉ごとに 小さな 輪）
G2['コスモドラ'] = (K, M, pv) => {
  K.ex.delete('shards');
  const Sd = { n: 9, r: .23, dr: .013, gap: 1.75, float: 1, legs4: 1, mane: 1 };
  const head = planSerpent(K, M, pv, Sd);
  const base = Sd.r * lerp(1.05, 1, K.st);
  M.segs.forEach((sg, i) => { const r = Math.max(0.08, base - i * Sd.dr); if (i % 2 === 0) g2Glow(K, sg, PRIM.torus, mix(K.c2, [0.7, 0.5, 1], 0.3), [0, 0, 0], [r * 1.45, r * 0.45, r * 1.45], [0.7, i * 0.8, 0.35], 0.45, { outline: 0.3 }); });
  const st = g2Glow(K, M.segs[M.segs.length - 1], PRIM.star, [1, 0.95, 0.6], [0, 0.05, -0.18], [0.16], null, 0.8); st.doubleSide = true;
  return head;
};

// 239 ミュータイガ：6本足の 鋼の トラ。長い サーベルの キバと 刃の しっぽ、背中に 鋼の 板
G2['ミュータイガ'] = (K, M, pv) => {
  K.ex.delete('shards');
  const head = planQuad(K, M, pv, { L: 1.12, legH: .46, chest: [.33, .35, .37], hip: [.3, .31, .33], lift: .04, neck: .2, neckA: 1.0, head: .31, snout: .55, legR: .1, paw: 1.3, ears: 'round', tail: 'none', brow: 1, legs6: 1 });
  const R = head.R, A = M.anchor, steel = [0.8, 0.84, 0.92];
  const FP = new Part();
  for (const sx of [-1, 1]) { const p = headPoint(head, [sx * 0.3, -0.35, 0.9]).p; FP.add(cap(p, [p[0] + sx * R * 0.05, p[1] - R * 0.75, p[2] + R * 0.12], R * 0.1, R * 0.02, [0.98, 0.96, 0.9], { k: R * 0.03 })); }
  K.add(M.head, K.mesh(FP, 'tiny'), { mat: MAT.glossy });
  const D = K.joint(pv, [0, 0, 0]), SP = new Part();
  for (let i = 0; i < 5; i++) { if (i === 2) continue; const z = lerp(A.z0, A.z1, i / 4), t = A.top(z); SP.add(box([0, t + 0.06, z], [0.03, 0.12 + (i % 2) * 0.03, 0.12], 0.02, steel, { k: 0.02, rot: [0.45, 0, 0] })); }
  K.add(D, K.mesh(SP, 'small'), { mat: MAT.glossy });
  const tip = g2Tail(K, M, pv, M.tailBase, 5, 0.17, 0.07, K.c1, 1.95, 0.08, 0, K.c2);
  K.add(tip, K.mesh(new Part([cap([0, 0.02, 0], [0, -0.32, 0.04], 0.09, 0.008, steel, { k: 0, sc: [0.25, 1, 1], pv: [0, 0, 0] })]), 'small'), { mat: MAT.glossy });
  M.seatSkip = [D];
  M.tailBase = null;
  return head;
};

// 240 ゼログラビ：交差して まわる 3つの 輪（ジャイロ）の 中に 浮かぶ 魂。まわりに 小石が 浮く
G2['ゼログラビ'] = (K, M, pv) => { K.ex.delete('shards'); return planBlob(K, M, pv, { float: 1, shape: (K, M, pv, P, R, by) => {
  P.add(sph([0, by, 0], R * 0.5, K.c1, { k: 0 }));
  P.add(cap([0, by + R * 0.25, -R * 0.25], [R * 0.1, by + R * 1.05, -R * 0.6], R * 0.26, R * 0.02, K.c1, { k: R * 0.15 }));
  P.paint(sph([0, by - R * 0.05, R * 0.4], R * 0.32), mix(K.c1, K.c2, 0.35), R * 0.08);
  const col = K.c2;
  for (let i = 0; i < 3; i++) { const o = K.joint(pv, [0, by, 0], [i * 1.05 + 0.3, i * 0.9, 0]); const j = K.joint(o, [0, 0, 0]); g2Spin(M, j, 0, 0.9 + i * 0.5); g2Glow(K, j, PRIM.torus, i === 1 ? mix(col, [0.7, 0.4, 1], 0.5) : col, [0, 0, 0], [R * (0.8 + i * 0.13), R * 0.32, R * (0.8 + i * 0.13)], null, 0.6, { outline: 0.3 }); }
  M.orbit = K.joint(pv, [0, by, 0]);
  for (let i = 0; i < 5; i++) { const a = i / 5 * Math.PI * 2; K.prim(M.orbit, PRIM.box, [0.32, 0.3, 0.36], [Math.cos(a) * R * 1.35, Math.sin(a * 3) * R * 0.3, Math.sin(a) * R * 1.35], [R * (0.08 + (i % 2) * 0.04)], [a, a * 1.5, 0.3], { outline: 0.6 }); }
  return { hc: [0, by, 0], eyeDir: [0.32, 0.1, 0.94], eyeSize: 0.44, arms: false, mouthY: -R * 0.2, hr: R * 0.55 };
} }); };

// 241 バサルト：背中に 六角の 石の 柱が ならぶ 小さな センザンコウ（柱の 先が 赤く 光る）
G2['バサルト'] = (K, M, pv) => {
  K.ex.delete('shards');
  const head = planQuad(K, M, pv, { L: .58, legH: .2, chest: [.3, .27, .3], hip: [.32, .29, .32], neck: .05, neckA: 1.3, head: .27, snout: .85, legR: .07, claws: 1, ears: 'small', tail: 'thick', noseHorn: 1 });
  const A = M.anchor, cols = [], rr = mulberry32(K.sp.id), cA = [0.2, 0.2, 0.24], cB = [0.3, 0.29, 0.33];
  for (let r = 0; r < 4; r++) for (let c = -1; c <= 1; c++) {
    const z = lerp(A.z0 - 0.02, A.z1 + 0.02, r / 3) + (c ? 0.04 : 0), x = c * A.w * 0.5;
    const y = A.top(z) - 0.1 - Math.abs(c) * 0.06, h = 0.13 + rr() * 0.09 + (c ? 0 : 0.05);
    cols.push({ p: [x, y, z], r: 0.075, h, col: (r + c) % 2 ? cA : cB, top: rr() < 0.4 ? [1, 0.5, 0.15] : null, ry: rr() });
  }
  hexCols(K, pv, cols);
  return head;
};

// 242 バサルトン：頭の うしろに 玄武岩の 柱で できた 大きな えりかざり（盾）を もつ 大きな 獣
G2['バサルトン'] = (K, M, pv) => {
  K.ex.delete('shards');
  const head = planQuad(K, M, pv, { L: 1.05, legH: .5, chest: [.45, .46, .48], hip: [.4, .42, .44], lift: .04, neck: .14, neckA: 1.2, head: .34, snout: 1.0, legR: .16, hoof: 1, ears: 'small', tail: 'club', noseHorn: 1, brow: 1 });
  const A = M.anchor, n = A.neck, rr = mulberry32(K.sp.id), cA = [0.2, 0.2, 0.24], cB = [0.32, 0.31, 0.36];
  const D = K.joint(pv, [0, 0, 0]), cols = [];
  for (let i = -5; i <= 5; i++) {
    const a = i * 0.25, d = [Math.sin(a), Math.cos(a), -0.42], l = Math.hypot(d[0], d[1], d[2]);
    const len = 0.55 + (5 - Math.abs(i)) * 0.06 + rr() * 0.08;
    cols.push({ p: [n[0] + d[0] / l * 0.12, n[1] - 0.05 + d[1] / l * 0.05, n[2] - 0.05], rot: dirRot(d), r: 0.085, h: len, col: i % 2 ? cA : cB, top: (i + 5) % 3 === 0 ? [1, 0.5, 0.15] : null });
  }
  for (let r = 0; r < 2; r++) for (let c = -1; c <= 1; c++) { const z = lerp(A.z1 + 0.15, A.z1 - 0.05, r), y = A.top(z) - 0.12; cols.push({ p: [c * A.w * 0.45, y, z], r: 0.08, h: 0.2 + rr() * 0.12, col: (r + c) % 2 ? cA : cB, top: rr() < 0.4 ? [1, 0.5, 0.15] : null, ry: rr() }); }
  hexCols(K, D, cols);
  M.seatSkip = [D];
  return head;
};

// 243 ヒノコリュウ：首の まわりに 炎の えりまきを ひろげた 平たい 竜の 子
G2['ヒノコリュウ'] = (K, M, pv) => {
  const head = planQuad(K, M, pv, { L: .7, legH: .2, chest: [.27, .23, .3], hip: [.26, .22, .28], lift: .03, neck: .14, neckA: 1.0, head: .36, snout: .7, flat: .8, legR: .07, splay: .6, ears: 'none', tail: 'thick', horn: 1 });
  const R = head.R, pts = [];
  for (let i = 0; i <= 10; i++) { const th = -1.75 + i / 10 * 3.5; pts.push([Math.sin(th) * R * 1.55, Math.cos(th) * R * 1.35 - R * 0.1, -R * 0.55 - (i % 2) * R * 0.08]); }
  g2Fan(K, M.head, [0, -R * 0.1, -R * 0.35], pts, [1, 0.62, 0.2], [1, 0.45, 0.12], { emis: [0.2, 0.06, 0] });
  for (let i = 0; i < 7; i++) { const th = -1.5 + i / 6 * 3.0; addFlame(K, M, M.head, [Math.sin(th) * R * 1.35, Math.cos(th) * R * 1.15 - R * 0.1, -R * 0.55], 0.42, [-0.35, 0, -th]); }
  return head;
};

// 244 カザンリュウ：腰に 噴火する 火山を 背負った 岩の 翼の 竜（翼の 膜に 溶岩の すじ）
G2['カザンリュウ'] = (K, M, pv) => {
  K.ex.delete('shards'); K.f.back = null;
  const head = planQuad(K, M, pv, { L: 1.1, legH: .55, chest: [.44, .45, .47], hip: [.4, .4, .42], lift: .08, neck: .4, neckA: .85, head: .3, snout: 1.15, legR: .15, claws: 1, ears: 'none', tail: 'thick', horn: 2, brow: 1 });
  const A = M.anchor;
  addWings(K, M, pv, { ...A, mem: [0.28, 0.17, 0.15], memIn: [1, 0.42, 0.1], memEmis: [0.2, 0.06, 0.01] });
  const zv = lerp(A.z0, A.z1, 0.92), ty = A.top(zv), D = K.joint(pv, [0, 0, 0]), rock = [0.3, 0.22, 0.2];
  const V = new Part([cap([0, ty - 0.12, zv], [0, ty + 0.42, zv - 0.06], 0.36, 0.13, rock, { k: 0 })], { noise: 0.03, noiseF: 6 });
  V.add(sph([0, ty + 0.48, zv - 0.06], 0.1, null, { op: 'sub', k: 0.03 }));
  for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; V.paint(cap([Math.sin(a) * 0.1, ty + 0.4, zv - 0.06 + Math.cos(a) * 0.1], [Math.sin(a + 0.25) * 0.32, ty, zv + Math.cos(a + 0.25) * 0.32], 0.03, 0.02), G2_LAVA, 0.015); }
  K.add(D, K.mesh(V, 'small'), { emis: [0.06, 0.02, 0] });
  g2Glow(K, D, PRIM.sphereLo, G2_LAVA, [0, ty + 0.4, zv - 0.06], [0.085, 0.025, 0.085], null, 0.95, { outline: 0 });
  for (let i = 0; i < 3; i++) addFlame(K, M, D, [(i - 1) * 0.05, ty + 0.4, zv - 0.06], 0.8 - Math.abs(i - 1) * 0.25, [0, 0, (i - 1) * 0.3]);
  M.seatSkip = [D];
  return head;
};

// 245 マグマンタ：溶岩の すじが 光る 平たい エイ。頭に 角のような ひれ、長い むちの しっぽ
G2['マグマンタ'] = (K, M, pv) => {
  M.plan = 'fish'; M.floating = true;
  const c1 = K.c1, by = 0;
  // 体ごと 少し 前を 上げて ななめに（正面からも 平たい 背中が 見える）
  const T = K.joint(pv, [0, 0.78, 0], [0.3, 0, 0.12]);
  const P = new Part([ell([0, by, 0], [0.3, 0.17, 0.5], c1, { k: 0 })]);
  P.add(ell([0, by - 0.01, -0.02], [0.72, 0.07, 0.36], c1, { k: 0.14 }));
  for (const s of [-1, 1]) P.add(cap([s * 0.2, by, 0.4], [s * 0.26, by + 0.02, 0.7], 0.08, 0.035, c1, { k: 0.04, sc: [0.6, 1, 1], pv: [s * 0.2, by, 0.4] }));
  P.paint(ell([0, by - 0.1, 0], [0.7, 0.08, 0.45]), mix(K.c2, WHITE, 0.55), 0.03);
  const A = { y: by + 0.78, z0: 0.25, z1: -0.35, w: 0.3, top: topFn(P), neck: [0, by + 0.9, 0.38], wingZ: 0 };
  M.body = K.add(T, K.mesh(P, 'body'));
  for (let i = 0; i < 8; i++) { const a = -1.2 + i * 0.4; const LV = new Part([i < 7 ? cap([Math.sin(a) * 0.06, by + 0.165, 0.12], [Math.sin(a) * 0.55, by + 0.075, -0.02 - Math.cos(a) * 0.25], 0.03, 0.02, G2_LAVA, { k: 0.01 }) : cap([0, by + 0.175, 0.25], [0, by + 0.155, -0.4], 0.032, 0.02, G2_LAVA, { k: 0.01 })]); K.add(T, K.mesh(LV, 'tiny'), { emis: [0.85, 0.32, 0.03], outline: 0.2 }); }
  for (const s of [-1, 1]) {
    const j = K.joint(T, [s * 0.62, by, -0.04]);
    const FP = new Part([ell([s * 0.32, 0, -0.06], [0.38, 0.05, 0.26], c1, { k: 0, rot: [0, s * 0.45, 0] })]);
    FP.add(cap([s * 0.5, 0, -0.12], [s * 0.85, 0.04, -0.34], 0.065, 0.012, c1, { k: 0.04, sc: [1, 0.5, 1], pv: [s * 0.5, 0, -0.12] }));
    K.add(j, K.mesh(FP, 'small'));
    K.add(j, K.mesh(new Part([cap([s * 0.04, 0.05, 0], [s * 0.72, 0.05, -0.26], 0.02, 0.01, G2_LAVA, { k: 0 })]), 'tiny'), { emis: [0.85, 0.32, 0.03], outline: 0.2 });
    j.side = s; M.fins.push(j);
  }
  tailChain(K, M, T, [0, by, -0.48], 6, 0.17, 0.035, c1, 1.62, 0.02, 0, K.c2, 0.65);
  const head = { part: P, R: 0.22, c: [0, by + 0.02, 0.3], node: T };
  M.head = null; M.headInfo = head;
  M.anchor = A; M.tailBase = null; M.noEars = true;
  M.eyeCfg = { dir: [0.72, 0.4, 0.56], size: 0.55 };
  M.faceCfg = { nose: false, blush: false, mouthY: -0.07 };
  return head;
};

// 246 トキワタリ：懐中時計の 体の 時の 精。文字盤が 顔で、時計の 針の 腕・時を あらわす 光の 羽・
//   くさりの しっぽ（先に 小さな 砂時計）・まわりを 回る 砂時計と 歯車・ゆっくり 回る 時の 輪
G2['トキワタリ'] = (K, M, pv) => { K.ex.delete('runes'); K.ex.delete('gem'); K.ex.delete('halo'); return planBlob(K, M, pv, { float: 1, shape: (K, M, pv, P, R, by) => {
  const brass = mix(K.c1, [0.95, 0.74, 0.32], 0.45), brassL = mix(brass, WHITE, 0.3), brassD = mix(brass, [0.35, 0.22, 0.1], 0.45), cream = [1, 0.97, 0.88], cyan = K.c2, navy = [0.16, 0.2, 0.42];
  // 時計の 本体（前後に 厚みの ある 丸）と 文字盤
  P.add(ell([0, by, 0], [R * 0.64, R * 0.64, R * 0.34], brass, { k: 0 }));
  P.add(tor([0, by, R * 0.2], R * 0.6, R * 0.075, brassL, { k: R * 0.03, rot: [Math.PI / 2, 0, 0] }));
  P.add(tor([0, by, -R * 0.16], R * 0.58, R * 0.06, brassD, { k: R * 0.03, rot: [Math.PI / 2, 0, 0] }));
  P.paint(cap([0, by, R * 0.05], [0, by, R * 0.6], R * 0.52, R * 0.52), cream, R * 0.02);
  P.paint(cap([0, by, R * 0.05], [0, by, R * 0.6], R * 0.07, R * 0.07), brass, R * 0.01);
  for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2, big = i % 3 === 0; P.paint(box([Math.sin(a) * R * 0.44, by + Math.cos(a) * R * 0.44, R * 0.3], [R * (big ? 0.035 : 0.02), R * (big ? 0.07 : 0.04), R * 0.3], 0, null, { rot: [0, 0, -a] }), big ? navy : [0.5, 0.46, 0.55], R * 0.008); }
  for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2; P.add(sph([Math.sin(a) * R * 0.64, by + Math.cos(a) * R * 0.64, R * 0.02], R * 0.045, brassL, { k: R * 0.02 })); }
  // りゅうず（上の つまみ）と つり輪
  P.add(cap([0, by + R * 0.6, 0], [0, by + R * 0.76, 0], R * 0.08, R * 0.08, brassD, { k: R * 0.03 }));
  P.add(sph([0, by + R * 0.82, 0], R * 0.12, brass, { k: R * 0.03 }));
  for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; P.paint(box([Math.cos(a) * R * 0.12, by + R * 0.82, Math.sin(a) * R * 0.12], [R * 0.02, R * 0.12, R * 0.02], 0), brassD, R * 0.01); }
  P.add(tor([0, by + R * 1.04, 0], R * 0.16, R * 0.035, brassL, { k: R * 0.01, rot: [Math.PI / 2, 0, 0] }));
  for (const sx of [-1, 1]) P.add(cap([sx * R * 0.42, by + R * 0.45, 0], [sx * R * 0.52, by + R * 0.56, 0], R * 0.05, R * 0.05, brassD, { k: R * 0.02 }));
  // 文字盤の ガラス
  const gl = K.prim(pv, PRIM.sphereLo, WHITE, [-R * 0.26, by + R * 0.3, R * 0.27], [R * 0.09, R * 0.05, R * 0.02], [0, 0, 0.6], { alpha: 0.7, unlit: true, outline: 0 }); gl.transparent = true;
  // 時計の 針の 腕（長い 針と 短い 針）
  for (const [sx, L] of [[-1, 0.62], [1, 0.48]]) {
    const j = K.joint(pv, [sx * R * 0.6, by - R * 0.05, R * 0.05], [0, 0, sx * 0.85]);
    const AP = new Part([cap([0, 0, 0], [0, -R * L, 0], R * 0.045, R * 0.03, navy, { k: 0 }), sph([0, 0, 0], R * 0.075, brass, { k: R * 0.02 })]);
    AP.add(ell([0, -R * L * 0.7, 0], [R * 0.08, R * 0.12, R * 0.025], navy, { k: R * 0.02 }));
    K.add(j, K.mesh(AP, 'tiny'));
    K.prim(j, PRIM.gem, cyan, [0, -R * (L + 0.07), 0], [R * 0.07, R * 0.1, R * 0.03], null, { emis: cyan.map(v => v * 0.6), mat: MAT.glossy, outline: 0.5 });
    j.r0 = j.rot.slice(); M.arms.push(j);
  }
  // 時の 羽（すきとおった 光の 羽根）
  for (const sx of [-1, 1]) {
    const j = K.joint(pv, [sx * R * 0.3, by + R * 0.15, -R * 0.3]);
    for (const [k, ang, len] of [[0, 0.75, 0.95], [1, 0.3, 0.8], [2, -0.12, 0.6]]) {
      const d = [sx * Math.cos(ang), Math.sin(ang)], pp = [-d[1], d[0]], pts = [];
      for (let i = 0; i <= 8; i++) { const t = i / 8, w = R * 0.16 * Math.sin(Math.PI * Math.min(1, t * 0.95 + 0.04)); pts.push([d[0] * R * len * t + pp[0] * w, d[1] * R * len * t + pp[1] * w, -R * 0.1 * t - k * R * 0.04]); }
      for (let i = 8; i >= 0; i--) { const t = i / 8, w = R * 0.16 * Math.sin(Math.PI * Math.min(1, t * 0.95 + 0.04)); pts.push([d[0] * R * len * t - pp[0] * w, d[1] * R * len * t - pp[1] * w, -R * 0.1 * t - k * R * 0.04]); }
      const n = g2Fan(K, j, [0, 0, -k * R * 0.04], pts, mix(cyan, WHITE, 0.45), mix(cyan, WHITE, 0.2), { alpha: 0.72, emis: cyan.map(v => v * 0.25), outline: 0.5 }); n.transparent = true;
    }
    j.side = sx; M.wings.push(j);
  }
  // くさりの しっぽ（先に 小さな 砂時計）
  const tip = tailChain(K, M, pv, [0, by - R * 0.62, -R * 0.02], 5, R * 0.16, R * 0.03, brassD, 0.35, 0.22, 0, null, 0.2);
  M.chains[M.chains.length - 1].forEach((j, i) => K.prim(j, PRIM.torus, brassL, [0, -R * 0.08, 0], [R * 0.07, R * 0.07, R * 0.07], [0, i % 2 ? Math.PI / 2 : 0, Math.PI / 2], { mat: MAT.glossy, outline: 0.4 }));
  const hg = (parent, pos, s) => { const j = K.joint(parent, pos); K.prim(j, PRIM.cone, [0.85, 0.97, 1], [0, 0, 0], [s * 0.7, s, s * 0.7], null, { alpha: 0.5, outline: 0.4 }).transparent = true; K.prim(j, PRIM.cone, [0.85, 0.97, 1], [0, 0, 0], [s * 0.7, s, s * 0.7], [Math.PI, 0, 0], { alpha: 0.5, outline: 0.4 }).transparent = true; g2Glow(K, j, PRIM.cone, mix(cyan, WHITE, 0.3), [0, -s, 0], [s * 0.5, s * 0.55, s * 0.5], null, 0.5, { outline: 0 }); for (const y of [-1, 1]) K.prim(j, PRIM.cyl, brass, [0, y > 0 ? s : -s - s * 0.12, 0], [s * 0.8, s * 0.12, s * 0.8]); return j; };
  hg(tip, [0, -R * 0.12, 0], R * 0.1);
  // まわりを 回る 砂時計と 歯車
  M.orbit = K.joint(pv, [0, by, 0]);
  for (let i = 0; i < 2; i++) { const a = i * Math.PI + 0.6; hg(M.orbit, [Math.cos(a) * R * 1.2, (i ? 0.25 : -0.15) * R, Math.sin(a) * R * 1.2], R * 0.13); }
  const GP = new Part([tor([0, 0, 0], R * 0.14, R * 0.035, brass, { k: 0, rot: [Math.PI / 2, 0, 0] })]);
  for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; GP.add(box([Math.cos(a) * R * 0.19, Math.sin(a) * R * 0.19, 0], [R * 0.035, R * 0.035, R * 0.03], R * 0.008, brass, { k: R * 0.008, rot: [0, 0, a] })); }
  const gg = K.mesh(GP, 'tiny');
  for (let i = 0; i < 2; i++) { const a = i * Math.PI + 2.2; const g = K.joint(M.orbit, [Math.cos(a) * R * 1.15, (i ? -0.3 : 0.35) * R, Math.sin(a) * R * 1.15], [0, -a + Math.PI / 2, 0]); const sj = K.joint(g, [0, 0, 0]); g2Spin(M, sj, 2, i ? 2.2 : -2.2); K.add(sj, gg, { mat: MAT.glossy }); }
  // 時の 輪（12の しるしが ついた 光の 輪）
  const ring = K.joint(pv, [0, by - R * 0.05, 0], [0.32, 0, 0.18]), rj = K.joint(ring, [0, 0, 0]); g2Spin(M, rj, 1, 0.5);
  g2Glow(K, rj, PRIM.torus, cyan, [0, 0, 0], [R * 1.12, R * 0.06, R * 1.12], null, 0.55, { outline: 0 });
  for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; g2Glow(K, rj, PRIM.gem, i % 3 ? mix(cyan, WHITE, 0.5) : [1, 0.9, 0.5], [Math.cos(a) * R * 1.12, 0, Math.sin(a) * R * 1.12], [R * 0.035, R * (i % 3 ? 0.06 : 0.1), R * 0.035], null, 0.7, { outline: 0 }); }
  return { hc: [0, by, R * 0.05], eyeDir: [0.3, 0.1, 0.95], eyeSize: 0.46, arms: false, mouthY: -R * 0.22, hr: R * 0.62 };
} }); };

// 247 ゼノドラグ：2つの 頭を もつ 宇宙の 竜。背に 光る 結晶、長い しっぽの 先にも 結晶
G2['ゼノドラグ'] = (K, M, pv) => {
  K.ex.delete('shards');
  const head = planQuad(K, M, pv, { L: 1.05, legH: .62, chest: [.36, .4, .42], hip: [.3, .32, .34], lift: .16, neck: .55, neckA: .55, head: .27, snout: 1.25, legR: .11, claws: 1, ears: 'none', tail: 'none', horn: 2, wings: 1, brow: 1, back: 'crystal' });
  const A = M.anchor, D = K.joint(pv, [0, 0, 0]), hp = M.head.pos;
  const n0 = [-A.w * 0.45, A.neck[1] - 0.25, A.neck[2] - 0.05], n1 = [-0.42, hp[1] - 0.22, hp[2] - 0.12];
  K.add(D, K.mesh(new Part([cap(n0, n1, 0.13, 0.1, K.c1, { k: 0 })]), 'limb'));
  const R2 = head.R * 0.88;
  const h2 = mammalHead(K, R2, { snout: 1.1, brow: true });
  const hj2 = K.joint(D, [n1[0] - 0.05, n1[1] + R2 * 0.3, n1[2] + R2 * 0.3], [0.15, -0.35, 0.1]);
  K.add(hj2, K.mesh(h2.part, 'head'));
  h2.node = hj2;
  addEyes(K, M, h2, { dir: [0.55, 0.22, 0.8], size: 0.5, style: 'glow', glow: true, iris: K.glow });
  addHorns(K, h2, 2, 'sweep');
  const tip = g2Tail(K, M, pv, M.tailBase, 7, 0.17, 0.09, K.c1, 1.75, 0.08, 0, null);
  g2Gem(K, tip, G2_CRYS, [0, 0, 0], [0, -1, 0], 0.48, 0.1, 0.7);
  for (let i = 0; i < 6; i++) { const z = lerp(A.z0, A.z1, i / 5); for (const s of [-1, 1]) g2Glow(K, D, PRIM.sphereLo, K.c2, [s * A.w * 0.75, A.y + 0.05 - i * 0.01, z], [0.03], null, 0.9, { outline: 0 }); }
  M.seatSkip = [D];
  M.tailBase = null;
  return head;
};

// 248 ハザードン：毒の ドラム缶の 体（黄色と 黒の しま）、パイプの 腕、ガスマスクの 顔、もれる 毒
G2['ハザードン'] = (K, M, pv) => {
  K.ex.delete('shards'); K.ex.delete('spikes');
  const B = { hipY: .42, tH: .62, tw: .36, sh: 1.25, waist: 1.15, head: .27, snout: 0, aL: .55, ar: .1, fist: 1.7, lr: .12, foot: 1.4, visor: 1 };
  const head = planBiped(K, M, pv, B);
  const s = K.st, hipY = B.hipY * lerp(0.78, 1.03, s), tH = B.tH * lerp(0.86, 1.03, s), tw = B.tw * lerp(0.96, 1.05, s);
  const drum = mix(K.c1, [0.35, 0.4, 0.3], 0.2), y0 = hipY - 0.02, y1 = hipY + tH * 0.98, r = tw * 1.18;
  const P = new Part([cap([0, y0 - 0.1, 0], [0, y1 + 0.1, 0], r, r, drum, { k: 0 })]);
  P.add(box([0, y0 - 1, 0], [2, 1, 2], 0, null, { op: 'sub', k: 0.02 }));
  P.add(box([0, y1 + 1, 0], [2, 1, 2], 0, null, { op: 'sub', k: 0.02 }));
  for (const y of [y0 + 0.05, (y0 + y1) / 2, y1 - 0.05]) P.add(tor([0, y, 0], r * 1.0, 0.03, mix(drum, K.dark, 0.3), { k: 0.01 }));
  const ym = (y0 + y1) / 2;
  for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2; P.paint(box([Math.sin(a) * r, ym + (y1 - ym) * 0.48, Math.cos(a) * r], [0.06, 0.07, 0.09], 0, null, { rot: [0, a, 0.7] }), i % 2 ? [0.12, 0.12, 0.12] : [1, 0.85, 0.15], 0.006); }
  P.paint(sph([0, ym, r], 0.14), [1, 0.85, 0.15], 0.01);
  P.paint(cap([0, ym + 0.06, r], [0, ym - 0.06, r], 0.03, 0.02), [0.12, 0.12, 0.12], 0.005);
  K.add(pv, K.mesh(P, 'body'), { mat: MAT.glossy });
  const goo = mix(K.c2, WHITE, 0.1);
  for (const [a, h] of [[0.5, 0.35], [-0.9, 0.25], [2.4, 0.3]]) g2Glow(K, pv, PRIM.drop, goo, [Math.sin(a) * r * 1.02, y1 - h * 0.6, Math.cos(a) * r * 1.02], [0.05, h * 0.3, 0.05], [Math.PI, 0, 0], 0.6);
  g2Glow(K, pv, PRIM.disc, goo, [0, y1 + 0.005, 0], [r * 0.8], null, 0.5, { outline: 0 });
  const R = head.R;
  K.add(M.head, K.mesh(new Part([cap([0, -R * 0.45, R * 0.7], [0, -R * 0.65, R * 1.25], R * 0.32, R * 0.3, [0.35, 0.36, 0.38], { k: 0 }), tor([0, -R * 0.68, R * 1.28], R * 0.26, R * 0.05, K.c2, { k: R * 0.02, rot: [Math.PI / 2 - 0.35, 0, 0] })]), 'small'), { mat: MAT.glossy });
  for (const sx of [-1, 1]) tailChain(K, M, pv, [sx * r * 0.6, y1 - 0.02, -r * 0.55], 4, 0.14, 0.035, [0.45, 0.46, 0.5], 3.0, -0.35, sx * 0.4, null, 0.1);
  return head;
};

// 249 フェニクシア：うしろに 大きく ひろげた クジャクのような 炎の 尾羽（光る 目玉もよう）
G2['フェニクシア'] = (K, M, pv) => {
  M.rideBoost = 1.45;
  K.f.tail = 'none';
  const head = planBird(K, M, pv, { body: [.27, .33, .4], by: .7, head: .24, neck: .26, legL: .32, wing: 1.45, beak: .85, hook: 1, crest: 1, tilt: .3, talon: 1 });
  const F = K.joint(pv, M.tailBase, [-0.35, 0, 0]), P = new Part(), N = 11;
  for (let i = 0; i < N; i++) {
    const th = -1.4 + i / (N - 1) * 2.8, d = [Math.sin(th), Math.cos(th) * 0.95 + 0.1, -0.22], L = 1.45 - Math.abs(th) * 0.22;
    const e = [d[0] * L, d[1] * L, d[2] * L];
    P.add(cap([0, 0, 0], e, 0.025, 0.012, mix(K.c2, K.c1, 0.3), { k: 0.01 }));
    P.add(ell([e[0] * 0.8, e[1] * 0.8, e[2] * 0.8], [0.15, 0.3, 0.025], i % 2 ? K.c1 : mix(K.c1, [1, 0.3, 0.2], 0.35), { k: 0.03, rot: [0, 0, -th] }));
    P.paint(ell([e[0] * 0.84, e[1] * 0.84, e[2] * 0.84], [0.1, 0.15, 0.06], null, { rot: [0, 0, -th] }), [1, 0.85, 0.3], 0.02);
    g2Glow(K, F, PRIM.sphereLo, [0.35, 0.9, 1], [e[0] * 0.85, e[1] * 0.85, e[2] * 0.85 + 0.03], [0.065, 0.09, 0.02], [0, 0, -th], 0.7, { outline: 0.5 });
    if (i % 2 === 0) addFlame(K, M, F, [e[0] * 1.02, e[1] * 1.02, e[2] * 1.02], 0.45, [0, 0, -th]);
  }
  K.add(F, K.mesh(P, 'small'));
  const R = head.R, HP = new Part();
  for (let i = 0; i < 3; i++) { const a = (i - 1) * 0.35; const e = [Math.sin(a) * R * 0.6, R * 1.9, -R * 1.5]; HP.add(cap([0, R * 0.6, -R * 0.2], e, R * 0.07, R * 0.03, K.c2, { k: R * 0.04 })); HP.add(ell(e, [R * 0.14, R * 0.24, R * 0.06], mix(K.c1, [1, 0.3, 0.2], 0.3), { k: R * 0.04 })); }
  K.add(M.head, K.mesh(HP, 'small'));
  M.tailBase = null;
  return head;
};

// 姿の種類 → 作り方
const ARCH = {};
for (const [tbl, fn] of [[QA, planQuad], [BA, planBiped], [BRD, planBird], [FSH, planFish], [SRP, planSerpent], [BUG, planBug], [BLB, planBlob], [PLT, planPlant], [GLM, planGolem], [TRT, planTurtle]]) for (const k in tbl) ARCH[k] = { fn, p: tbl[k] };
// 設計表にない種の予備（体型ごと）
const ARCH_FALLBACK = { quad: 'cat', biped: 'kid', plant: 'bud', golem: 'rockman', bird: 'songbird', fish: 'goldfish', serpent: 'snake', bug: 'beetle', blob: 'puff', turtle: 'turtle', dragon: 'wyvern' };

// ---------------- 伝説：スカイドラゴン（蒼穹の竜） ----------------
//  細く しなやかな 体・長い 首・羽根の ふちどりが ある 大きな 翼・後ろへ 流れる 白い たてがみ・
//  金の 先を もつ 長い 角・長い しっぽの 先に 羽根の 扇と 風の 輪
function planSkyDragon(K, M, pv) {
  M.custom = true; M.dragon = true;
  const blue = K.c1, white = K.c2, deep = mix(blue, [0.03, 0.08, 0.3], 0.5), sky = mix(blue, [0.55, 0.9, 1], 0.45);
  const cyan = [0.5, 0.95, 1], ivory = [1, 0.97, 0.9], gold = [1, 0.84, 0.42];
  // 胴：むねを 張り、腰へ 細く しまる
  const P = new Part([ell([0, 1.2, 0.36], [0.4, 0.5, 0.5], blue, { k: 0, rot: [-0.38, 0, 0] })]);
  P.add(ell([0, 1.06, -0.18], [0.31, 0.36, 0.5], blue, { k: 0.28 }));
  P.add(ell([0, 1.03, -0.64], [0.35, 0.38, 0.4], blue, { k: 0.22 }));
  for (const s of [-1, 1]) { P.add(ell([s * 0.36, 1.24, 0.42], [0.22, 0.29, 0.27], blue, { k: 0.15 })); P.add(ell([s * 0.3, 1.04, -0.66], [0.22, 0.31, 0.29], blue, { k: 0.16 })); }
  // 首：長く S字に
  const NK = [[0, 1.42, 0.62], [0, 1.86, 0.88], [0, 2.22, 0.96], [0, 2.48, 1.12]];
  for (let i = 0; i < 3; i++) P.add(cap(NK[i], NK[i + 1], 0.28 - i * 0.05, 0.22 - i * 0.04, blue, { k: 0.14 }));
  // おなか・首の 前は 白い うろこ、背中は 濃い 青の すじ
  P.paint(ell([0, 0.82, 0.05], [0.28, 0.32, 0.95]), white, 0.04);
  P.paint(cap([0, 1.28, 0.86], [0, 2.4, 1.26], 0.17, 0.11), white, 0.04);
  for (let i = 0; i < 7; i++) P.paint(box([0, 0.74 + i * 0.012, 0.6 - i * 0.2], [0.42, 0.18, 0.01], 0, null, { rot: [0.5, 0, 0] }), mix(white, sky, 0.5), 0.01);
  P.paint(cap([0, 1.62, 0.35], [0, 1.4, -0.82], 0.2, 0.18), deep, 0.12);
  for (const s of [-1, 1]) for (let i = 0; i < 5; i++) P.paint(box([s * 0.3, 1.2 - i * 0.04, 0.3 - i * 0.24], [0.012, 0.16, 0.05], 0, null, { rot: [0.2, 0, s * 0.5] }), cyan, 0.012);
  M.body = K.add(pv, K.mesh(P, 'body'));
  // 背びれ：羽根のような 白い ひれ（首から しっぽの 付け根まで）
  const FN = new Part();
  const spine = [[0, 2.62, 1.12], [0, 2.38, 0.98], [0, 2.1, 0.9], [0, 1.82, 0.78], [0, 1.62, 0.5], [0, 1.52, 0.18], [0, 1.45, -0.14], [0, 1.4, -0.44], [0, 1.32, -0.72], [0, 1.2, -0.96]];
  spine.forEach((b, i) => { const L = 0.3 - Math.abs(i - 4.5) * 0.022; FN.add(cap([b[0], b[1] - 0.1, b[2]], [b[0], b[1] + L * 0.7, b[2] - L * 1.1], 0.13, 0.012, i % 2 ? white : sky, { k: 0.03, sc: [0.3, 1, 1], pv: b })); });
  K.add(pv, K.mesh(FN, 'small'));
  // 脚：すらりと 長く、手首に 羽毛、白い 爪
  const leg = (front) => {
    const len = front ? 0.98 : 0.92, lr = 0.14;
    const L = new Part([sph([0, 0, 0], lr * 1.65, blue, { k: 0 })]);
    L.add(ell([0, -len * 0.2, front ? 0.03 : -0.08], [lr * 1.45, len * 0.32, lr * 1.6], blue, { k: lr * 0.6 }));
    L.add(cap([0, -len * 0.38, front ? 0.05 : -0.12], [0, -len * 0.86, front ? 0.03 : -0.02], lr * 1.0, lr * 0.78, blue, { k: lr * 0.5 }));
    L.add(ell([0, -len + lr * 0.45, lr * 0.45], [lr * 1.2, lr * 0.55, lr * 1.6], deep, { k: lr * 0.5 }));
    for (const x of [-1, 0, 1]) L.add(cap([x * lr * 0.62, -len + lr * 0.38, lr * 1.5], [x * lr * 0.8, -len + lr * 0.02, lr * 2.45], lr * 0.26, lr * 0.02, ivory, { k: lr * 0.1 }));
    for (let i = 0; i < 4; i++) { const a = (i - 1.5) * 0.5; L.add(cap([Math.sin(a) * lr * 0.8, -len * 0.62, -lr * 0.5], [Math.sin(a) * lr * 1.5, -len * 0.8, -lr * 2.2], lr * 0.32, lr * 0.03, white, { k: lr * 0.12 })); }
    L.paint(box([0, -len * 0.5, 0], [1, 0.03, 1], 0), cyan, 0.01);
    return K.mesh(L, 'limb');
  };
  const gF = leg(true), gH = leg(false);
  for (const [sx, front] of [[-1, 1], [1, 1], [-1, 0], [1, 0]]) { const top = front ? 0.98 : 0.92; const j = K.joint(pv, [sx * (front ? 0.36 : 0.3), top, front ? 0.42 : -0.66]); K.add(j, front ? gF : gH); j.len = top; M.legs.push(j); }
  // 頭：細長く りりしい 顔・まゆの 骨・ほおの 白い ひれ
  const R = 0.34;
  const H = new Part([ell([0, 0, 0], [R * 0.86, R * 0.74, R * 1.0], blue, { k: 0 })]);
  H.add(ell([0, -R * 0.14, R * 1.12], [R * 0.52, R * 0.4, R * 1.05], blue, { k: R * 0.35 }));
  H.add(ell([0, -R * 0.5, R * 0.95], [R * 0.48, R * 0.2, R * 0.95], white, { k: R * 0.2 }));
  for (const s of [-1, 1]) {
    H.add(cap([s * R * 0.25, R * 0.38, R * 1.02], [s * R * 0.58, R * 0.5, R * 0.0], R * 0.15, R * 0.09, blue, { k: R * 0.1 }));
    for (let i = 0; i < 3; i++) H.add(cap([s * R * 0.62, -R * (0.15 + i * 0.22), R * 0.1], [s * R * (1.35 - i * 0.18), -R * (0.0 + i * 0.25), -R * (0.85 - i * 0.12)], R * (0.18 - i * 0.03), R * 0.02, i ? white : sky, { k: R * 0.08, sc: [1, 0.35, 1], pv: [s * R * 0.62, -R * (0.15 + i * 0.22), R * 0.1] }));
  }
  H.paint(ell([0, -R * 0.68, R * 0.9], [R * 0.44, R * 0.18, R * 0.85]), white, R * 0.06);
  for (const s of [-1, 1]) H.paint(sph([s * R * 0.18, R * 0.05, R * 2.12], R * 0.07), deep, R * 0.02);
  H.paint(cap([0, R * 0.62, R * 0.9], [0, R * 0.72, -R * 0.4], R * 0.08, R * 0.08), cyan, R * 0.02);
  const head = { part: H, R, c: [0, R * 0.05, R * 0.2] };
  const hj = K.joint(pv, [0, 2.62, 1.3], [0.16, 0, 0]);
  K.add(hj, K.mesh(H, 'head'));
  head.node = hj; M.head = hj; M.headInfo = head;
  // 角：後ろへ 長く 流れる 2本（先は 金）＋ その下に 2本 ＋ 鼻先の 小さな 角
  const HP = new Part();
  const sweep = (s, base, segs, len, rad, up, out) => { let prev = base; for (let i = 1; i <= segs; i++) { const t = i / segs; const p = [base[0] + s * out * len * t, base[1] + Math.sin(t * Math.PI * 0.5) * up * len - t * t * len * 0.12, base[2] - len * t]; HP.add(cap(prev, p, rad * (1 - (i - 1) / segs * 0.85), rad * (1 - i / segs * 0.93), i > segs - 3 ? gold : ivory, { k: rad * 0.2 })); prev = p; } };
  for (const s of [-1, 1]) { sweep(s, [s * R * 0.38, R * 0.56, -R * 0.05], 8, R * 3.9, R * 0.26, 0.55, 0.22); sweep(s, [s * R * 0.72, R * 0.18, -R * 0.15], 5, R * 2.0, R * 0.16, 0.25, 0.5); }
  HP.add(cap([0, R * 0.3, R * 1.75], [0, R * 0.7, R * 1.55], R * 0.12, R * 0.02, ivory, { k: R * 0.06 }));
  K.add(hj, K.mesh(HP, 'small'), { mat: MAT.glossy });
  // ひたいの 宝石（かんむり）
  K.prim(hj, PRIM.gem, cyan, [0, R * 0.72, R * 0.55], [R * 0.13, R * 0.22, R * 0.13], [Math.PI / 2 - 0.5, 0, 0], { emis: [0.25, 0.6, 0.75], mat: MAT.glossy, outline: 0.6 });
  // 目（光る）・キバ
  addEyes(K, M, head, { dir: [0.55, 0.38, 0.74], size: 0.42, style: 'sharp', iris: cyan, glow: true });
  const FP = new Part();
  for (const s of [-1, 1]) for (let i = 0; i < 2; i++) FP.add(cap([s * R * (0.36 - i * 0.08), -R * 0.36, R * (1.4 + i * 0.3)], [s * R * (0.36 - i * 0.08), -R * 0.72, R * (1.42 + i * 0.3)], R * 0.07, R * 0.01, WHITE, { k: 0.005 }));
  K.add(hj, K.mesh(FP, 'tiny'), { mat: MAT.glossy, outline: 0.5 });
  // たてがみ：頭の うしろから 首すじへ 流れる 白い 羽毛
  const MN = new Part();
  for (let i = 0; i < 6; i++) { const t = i / 5, b = [0, lerp(2.72, 1.75, t), lerp(1.08, 0.6, t)], L = 0.62 - t * 0.22; for (const s of [-1, 1]) MN.add(cap([s * 0.06, b[1], b[2]], [s * (0.22 - t * 0.08), b[1] - 0.04 - t * 0.04, b[2] - L], 0.11, 0.015, i % 2 ? mix(white, sky, 0.25) : white, { k: 0.05 })); }
  K.add(pv, K.mesh(MN, 'small'));
  // 翼：大きく 広げる（空色の 膜）＋ うしろの ふちに 白い 羽根
  const nw = M.wings.length;
  addWings(K, M, pv, { y: 1.5, z0: 0.45, z1: -0.3, w: 0.62, top: () => 1.58, wingZ: 0.22, mem: mix(blue, sky, 0.5), memIn: mix(white, sky, 0.35), memEmis: [0.03, 0.1, 0.16] });
  const w = 0.62 * 2.0;
  for (const j of M.wings.slice(nw)) {
    const s = j.side, WP = new Part();
    const tips = [[s * w * 1.45, w * 0.78, -w * 0.12], [s * w * 1.5, w * 0.28, -w * 0.55], [s * w * 1.18, -w * 0.05, -w * 0.88], [s * w * 0.72, -w * 0.12, -w * 1.0]];
    const wr = [s * w * 0.78, w * 0.52, -w * 0.2], sh0 = [0, 0, 0], back = [s * w * 0.12, -w * 0.08, -w * 0.62];
    const edges = [[tips[0], tips[1], wr], [tips[1], tips[2], wr], [tips[2], tips[3], wr], [tips[3], back, sh0]];
    edges.forEach(([a, b, to], e) => { const n = e === 3 ? 4 : 5; for (let k = 0; k < n; k++) {
      const t = (k + 0.5) / n, bow = Math.sin(t * Math.PI) * 0.28, q = [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
      const p = [q[0] + (to[0] - q[0]) * bow, q[1] + (to[1] - q[1]) * bow, q[2] + (to[2] - q[2]) * bow];
      const d = [p[0] - wr[0] * 0.7, p[1] - wr[1] * 0.7 - 0.25, p[2] - wr[2] * 0.7 - 0.2], l = Math.hypot(d[0], d[1], d[2]);
      const L = (e === 3 ? 0.3 : 0.42) * (1 - Math.abs(t - 0.5) * 0.3);
      WP.add(cap([p[0] - d[0] / l * 0.1, p[1] - d[1] / l * 0.1, p[2] - d[2] / l * 0.1], [p[0] + d[0] / l * L, p[1] + d[1] / l * L, p[2] + d[2] / l * L], 0.075, 0.03, (k + e) % 2 ? white : mix(white, sky, 0.4), { k: 0.025 }));
    } });
    K.add(j, K.mesh(WP, 'small'));
    K.prim(j, PRIM.gem, cyan, tips[0], [0.05, 0.1, 0.05], [0, 0, -s * 0.6], { emis: [0.25, 0.6, 0.75], mat: MAT.glossy, outline: 0.5 });
  }
  // しっぽ：長く しなやか。先に 羽根の 扇と 風の 輪
  const tip = tailChain(K, M, pv, [0, 1.08, -0.95], 9, 0.24, 0.24, blue, 1.95, 0.06, 0, null, 0.82);
  M.chains[M.chains.length - 1].forEach((j, i) => { if (i < 8) K.add(j, K.mesh(new Part([cap([0, -0.05, -0.04], [0, -0.16, -0.2 + i * 0.008], 0.07 - i * 0.005, 0.01, i % 2 ? white : sky, { k: 0.02, sc: [0.3, 1, 1], pv: [0, -0.05, -0.04] })]), 'tiny')); });
  const TF = new Part();
  for (let i = 0; i < 5; i++) { const a = (i - 2) * 0.32; TF.add(ell([Math.sin(a) * 0.3, -0.32 * Math.cos(a), 0], [0.09, 0.36, 0.03], i % 2 ? white : mix(white, sky, 0.4), { k: 0.03, rot: [0, 0, a] })); }
  TF.paint(sph([0, -0.6, 0], 0.18), sky, 0.05);
  K.add(tip, K.mesh(TF, 'small'));
  const ring = K.joint(tip, [0, -0.25, 0]); g2Spin(M, ring, 1, 2.2);
  for (let i = 0; i < 2; i++) { const n = K.prim(ring, PRIM.torus, [0.85, 0.97, 1], [0, -i * 0.12, 0], [0.32 - i * 0.08, 0.18, 0.32 - i * 0.08], [0, 0, 0.2], { alpha: 0.45, emis: [0.2, 0.35, 0.45], outline: 0 }); n.transparent = true; n.noDepthWrite = true; }
  // 体の まわりを 流れる 風の 帯
  // むねの 風の 宝玉
  M.orb = K.prim(pv, PRIM.gem, cyan, [0, 1.3, 0.84], [0.11, 0.17, 0.11], [Math.PI / 2, 0, 0], { emis: [0.3, 0.7, 0.85], mat: MAT.glossy, outline: 0.5 });
  M.anchor = { y: 1.15, z0: 0.55, z1: -0.7, w: 0.5, top: () => 1.58, neck: [0, 2.2, 1.0] };
  return head;
}

// ---------------- 伝説：エンテイオウ（炎の王竜） ----------------
//  胸を張った 王の姿勢・長い首・大きく広げた翼・金の鎧と 王冠のような角・首すじの炎
function planEnteiou(K, M, pv) {
  M.custom = true; M.dragon = true;
  const red = K.c1, gold = K.c2, dkred = mix(red, [0.12, 0.02, 0.04], 0.55), ivory = [1, 0.93, 0.74], horn = [0.2, 0.1, 0.1];
  const back = mix(red, [0.1, 0.02, 0.03], 0.62), goldDk = mix(gold, [0.6, 0.25, 0.05], 0.45);
  // 胴：胸が高く 腰が低い（前に のりだす 力強い 姿勢）
  const P = new Part([ell([0, 1.12, 0.38], [0.5, 0.58, 0.56], red, { k: 0, rot: [-0.32, 0, 0] })]);
  P.add(ell([0, 0.96, -0.16], [0.4, 0.44, 0.52], red, { k: 0.3 }));
  P.add(ell([0, 0.98, -0.66], [0.44, 0.46, 0.44], red, { k: 0.25 }));
  for (const s of [-1, 1]) { P.add(ell([s * 0.44, 1.2, 0.42], [0.27, 0.33, 0.31], red, { k: 0.16 })); P.add(ell([s * 0.38, 1.0, -0.68], [0.27, 0.35, 0.33], red, { k: 0.18 })); }
  // 首：長く 前上へ
  P.add(cap([0, 1.32, 0.62], [0, 1.95, 1.06], 0.32, 0.2, red, { k: 0.2 }));
  P.add(cap([0, 1.95, 1.06], [0, 2.24, 1.3], 0.2, 0.17, red, { k: 0.1 }));
  // 腹・首の前は 金の うろこ、背中は 黒っぽい うろこ
  P.paint(ell([0, 0.74, 0.1], [0.34, 0.36, 0.98]), gold, 0.04);
  P.paint(cap([0, 1.24, 0.86], [0, 2.2, 1.42], 0.2, 0.12), gold, 0.04);
  for (let i = 0; i < 7; i++) P.paint(box([0, 0.66 + i * 0.015, 0.62 - i * 0.2], [0.5, 0.2, 0.012], 0, null, { rot: [0.5, 0, 0] }), goldDk, 0.012);
  for (let i = 0; i < 6; i++) P.paint(box([0, 1.34 + i * 0.16, 0.98 + i * 0.08], [0.42, 0.012, 0.32], 0, null, { rot: [-0.9, 0, 0] }), goldDk, 0.01);
  P.paint(cap([0, 1.6, 0.45], [0, 1.42, -0.85], 0.24, 0.22), back, 0.1);
  // 背びれ（刃のような とげ）：首から しっぽの 付け根まで
  const spine = [[0, 2.34, 1.2], [0, 2.12, 1.0], [0, 1.88, 0.78], [0, 1.68, 0.48], [0, 1.6, 0.15], [0, 1.55, -0.15], [0, 1.48, -0.45], [0, 1.4, -0.74], [0, 1.28, -0.98]];
  spine.forEach((b, i) => { const L = 0.38 - Math.abs(i - 4) * 0.03; P.add(cap([b[0], b[1] - 0.12, b[2]], [b[0], b[1] + L, b[2] - L * 0.8], 0.15, 0.012, i % 2 ? gold : horn, { k: 0.04, sc: [0.34, 1, 1], pv: b })); });
  // 肩の 金の うろこ（よろいのように）
  for (const s of [-1, 1]) for (let k = 0; k < 3; k++) P.paint(ell([s * 0.5, 1.36 - k * 0.12, 0.46 - k * 0.04], [0.2 - k * 0.03, 0.05, 0.22 - k * 0.03], null, { rot: [0, 0, s * 0.55] }), k % 2 ? goldDk : gold, 0.02);
  M.body = K.add(pv, K.mesh(P, 'body'));
  // 脚：太く 長く、金の 腕輪と 白い 爪
  const leg = (front) => {
    const len = front ? 0.92 : 0.86, lr = 0.18;
    const L = new Part([sph([0, 0, 0], lr * 1.7, red, { k: 0 })]);
    L.add(ell([0, -len * 0.2, front ? 0.03 : -0.06], [lr * 1.55, len * 0.34, lr * 1.7], red, { k: lr * 0.6 }));
    L.add(cap([0, -len * 0.38, front ? 0.05 : -0.1], [0, -len * 0.84, front ? 0.02 : -0.02], lr * 1.1, lr * 0.92, red, { k: lr * 0.5 }));
    L.add(ell([0, -len + lr * 0.5, lr * 0.45], [lr * 1.4, lr * 0.62, lr * 1.7], dkred, { k: lr * 0.5 }));
    for (const x of [-1, 0, 1]) L.add(cap([x * lr * 0.72, -len + lr * 0.42, lr * 1.55], [x * lr * 0.9, -len + lr * 0.02, lr * 2.55], lr * 0.3, lr * 0.02, ivory, { k: lr * 0.12 }));
    L.paint(box([0, -len * 0.95, 0], [1, len * 0.16, 1], 0), dkred, 0.04);
    L.paint(box([0, -len * 0.6, 0], [1, 0.035, 1], 0), gold, 0.01);
    return K.mesh(L, 'limb');
  };
  const gF = leg(true), gH = leg(false);
  for (const [sx, front] of [[-1, 1], [1, 1], [-1, 0], [1, 0]]) { const top = front ? 0.92 : 0.86; const j = K.joint(pv, [sx * (front ? 0.42 : 0.36), top, front ? 0.45 : -0.66]); K.add(j, front ? gF : gH); j.len = top; M.legs.push(j); }
  // 頭：長い 鼻づら・きりっとした 眉の 骨・ほおの とげ
  const R = 0.34;
  const H = new Part([ell([0, 0, 0], [R * 0.92, R * 0.78, R * 1.0], red, { k: 0 })]);
  H.add(ell([0, -R * 0.12, R * 1.15], [R * 0.6, R * 0.46, R * 1.06], red, { k: R * 0.35 }));
  H.add(ell([0, -R * 0.56, R * 0.9], [R * 0.56, R * 0.25, R * 0.98], dkred, { k: R * 0.22 }));
  for (const s of [-1, 1]) {
    H.add(cap([s * R * 0.28, R * 0.4, R * 1.02], [s * R * 0.62, R * 0.56, R * 0.02], R * 0.17, R * 0.1, red, { k: R * 0.1 }));
    H.add(cap([s * R * 0.72, -R * 0.3, R * 0.15], [s * R * 1.45, -R * 0.1, -R * 0.7], R * 0.2, R * 0.02, gold, { k: R * 0.12 }));
    H.add(cap([s * R * 0.6, -R * 0.62, R * 0.2], [s * R * 1.08, -R * 0.78, -R * 0.38], R * 0.13, R * 0.02, gold, { k: R * 0.1 }));
  }
  H.paint(ell([0, -R * 0.72, R * 0.95], [R * 0.48, R * 0.2, R * 0.86]), gold, R * 0.06);
  for (const s of [-1, 1]) H.paint(sph([s * R * 0.2, R * 0.1, R * 2.18], R * 0.08), [0.15, 0.03, 0.03], R * 0.02);
  const head = { part: H, R, c: [0, R * 0.05, R * 0.2] };
  const hj = K.joint(pv, [0, 2.28, 1.42], [0.22, 0, 0]);
  K.add(hj, K.mesh(H, 'head'));
  head.node = hj; M.head = hj; M.headInfo = head;
  // 角：大きく 後ろへ 反る 2本（先は 金）＋ 横の 2本 ＋ 王冠の とげ 3本 ＋ 鼻先の 角
  const HP = new Part();
  const sweep = (s, base, segs, len, rad, up, out) => { let prev = base; for (let i = 1; i <= segs; i++) { const t = i / segs; const p = [base[0] + s * out * len * t, base[1] + Math.sin(t * Math.PI * 0.55) * up * len, base[2] - len * t]; HP.add(cap(prev, p, rad * (1 - (i - 1) / segs * 0.85), rad * (1 - i / segs * 0.92), i > segs - 3 ? gold : horn, { k: rad * 0.2 })); prev = p; } };
  for (const s of [-1, 1]) { sweep(s, [s * R * 0.42, R * 0.62, -R * 0.05], 7, R * 3.5, R * 0.34, 0.85, 0.36); sweep(s, [s * R * 0.8, R * 0.2, -R * 0.2], 4, R * 1.6, R * 0.2, 0.3, 0.62); }
  for (const [x, h] of [[0, 1], [-0.24, 0.72], [0.24, 0.72]]) HP.add(cap([x * R, R * 0.6, R * 0.28], [x * R * 1.35, R * (0.6 + 0.8 * h), -R * 0.12], R * 0.1, R * 0.015, gold, { k: R * 0.04 }));
  HP.add(cap([0, R * 0.25, R * 1.85], [0, R * 0.82, R * 1.72], R * 0.16, R * 0.02, ivory, { k: R * 0.08 }));
  K.add(hj, K.mesh(HP, 'small'), { mat: MAT.glossy });
  // 目（光る）・キバ
  addEyes(K, M, head, { dir: [0.55, 0.4, 0.72], size: 0.4, style: 'sharp', iris: [1, 0.62, 0.08], glow: true });
  const FP = new Part();
  for (const s of [-1, 1]) for (let i = 0; i < 3; i++) FP.add(cap([s * R * (0.42 - i * 0.08), -R * 0.42, R * (1.32 + i * 0.24)], [s * R * (0.42 - i * 0.08), -R * 0.8, R * (1.34 + i * 0.24)], R * 0.07, R * 0.01, WHITE, { k: 0.005 }));
  K.add(hj, K.mesh(FP, 'tiny'), { mat: MAT.glossy, outline: 0.5 });
  // 王冠の 宝石（角の あいだ）
  K.prim(hj, PRIM.gem, [1, 0.25, 0.2], [0, R * 0.95, R * 0.42], [R * 0.14, R * 0.22, R * 0.14], [Math.PI / 2 - 0.4, 0, 0], { emis: [0.55, 0.1, 0.05], mat: MAT.glossy, outline: 0.6 });
  // 首すじの 炎の たてがみ
  for (let i = 0; i < 9; i++) { const t = i / 8; addFlame(K, M, pv, [0, lerp(2.42, 1.62, t), lerp(1.18, 0.4, t)], 1.2 - t * 0.4, [-1.0 + t * 0.25, 0, (i % 2 ? 1 : -1) * 0.25]); }
  // 翼：大きく 広げる
  addWings(K, M, pv, { y: 1.5, z0: 0.5, z1: -0.3, w: 0.66, top: () => 1.62, wingZ: 0.25, mem: [0.92, 0.22, 0.1], memIn: [1, 0.55, 0.16], memEmis: [0.22, 0.07, 0.01] });
  // しっぽ：太く 長く、先に 大きな 炎
  const tip = tailChain(K, M, pv, [0, 1.0, -0.98], 7, 0.3, 0.24, red, 2.0, 0.1, 0, null, 0.78);
  addFlame(K, M, tip, [0, 0.05, 0], 2.8, [Math.PI, 0, 0]);
  // 胸の 炎の 宝玉
  M.orb = K.prim(pv, PRIM.gem, [1, 0.55, 0.15], [0, 1.24, 0.94], [0.12, 0.18, 0.12], [Math.PI / 2, 0, 0], { emis: [0.75, 0.35, 0.05], mat: MAT.glossy, outline: 0.5 });
  M.anchor = { y: 1.1, z0: 0.6, z1: -0.7, w: 0.55, top: () => 1.62, neck: [0, 2.1, 1.15] };
  return head;
}

// ---------------- 伝説：ナルメクシア（天海の龍） ----------------
//  1本に つながった しなやかな 体（しなっても すき間が できない）・水晶の 角・流れる たてがみ・
//  すきとおる 大きな ひれの 翼・まわりを まわる 光の 真珠
function planNarumexia(K, M, pv) {
  M.custom = true; M.floating = true; M.serpentine = true;
  const blue = K.c1, white = K.c2, cyan = [0.45, 0.95, 1], deep = mix(blue, [0.02, 0.05, 0.25], 0.5), pearl = [0.92, 0.97, 1];
  const finCol = mix(white, cyan, 0.45);
  const N = 16, SL = 0.25;
  // 体の 向き（絶対角）：首から 下へ → 上へ → 下へ の S字、左右にも 少し うねる
  const pa = [-0.8, -0.62, -0.3, 0.15, 0.55, 0.68, 0.45, 0.05, -0.32, -0.55, -0.45, -0.12, 0.18, 0.34, 0.24, 0.06];
  const ya = [0, 0.15, 0.25, 0.2, 0.05, -0.15, -0.26, -0.2, -0.05, 0.12, 0.2, 0.12, 0, -0.1, -0.12, -0.05];
  const rad = (i) => i < 2 ? 0.38 - i * 0.02 : lerp(0.36, 0.08, Math.pow((i - 1) / (N - 2), 1.35));
  M.ribbon = [];
  let parent = pv, pos = [0, 1.5, 0.55];
  for (let i = 0; i < N; i++) {
    const r = rad(i), r2 = rad(Math.min(N - 1, i + 1));
    const j = K.joint(parent, pos, [pa[i] - (i ? pa[i - 1] : 0), ya[i] - (i ? ya[i - 1] : 0), 0]);
    const SP = new Part([sph([0, 0, 0], r, blue, { k: 0 })]);
    SP.add(cap([0, 0, 0], [0, 0, -SL * 1.08], r, r2, blue, { k: r * 0.3 }));
    SP.paint(cap([0, -r * 0.62, 0], [0, -r2 * 0.62, -SL * 1.08], r * 0.74, r2 * 0.74), white, r * 0.08);
    // 背びれ（すきとおる 刃）
    if (i < N - 2) SP.add(cap([0, r * 0.7, -SL * 0.25], [0, r * 0.7 + 0.18 + r * 0.6, -SL * 1.15], r * 0.34, r * 0.02, finCol, { k: r * 0.1, sc: [0.3, 1, 1], pv: [0, r * 0.7, -SL * 0.25] }));
    SP.paint(sph([0, r * 0.6, -SL * 0.55], r * 0.22), deep, r * 0.05);
    K.add(j, K.mesh(SP, 'limb'));
    if (i % 3 === 1 && i < N - 2) for (const s of [-1, 1]) K.prim(j, PRIM.sphereLo, cyan, [s * r * 0.88, r * 0.05, -SL * 0.5], [r * 0.16], null, { emis: [0.3, 0.75, 0.9], unlit: true, outline: 0 });
    j.r0 = j.rot.slice(); M.ribbon.push(j);
    parent = j; pos = [0, 0, -SL];
  }
  M.body = M.ribbon[1];
  // 頭：長い 龍の 顔・眉の 骨・ほおの ひれ・流れる たてがみ
  const R = 0.38;
  const H = new Part([ell([0, 0, 0], [R * 0.92, R * 0.8, R * 1.0], blue, { k: 0 })]);
  H.add(ell([0, -R * 0.16, R * 1.05], [R * 0.58, R * 0.42, R * 1.0], blue, { k: R * 0.35 }));
  H.add(ell([0, -R * 0.5, R * 0.78], [R * 0.52, R * 0.22, R * 0.88], white, { k: R * 0.2 }));
  for (const s of [-1, 1]) {
    H.add(cap([s * R * 0.26, R * 0.36, R * 0.95], [s * R * 0.58, R * 0.48, R * 0.05], R * 0.15, R * 0.09, blue, { k: R * 0.1 }));
    H.add(cap([s * R * 0.7, -R * 0.15, R * 0.1], [s * R * 1.55, R * 0.05, -R * 0.75], R * 0.34, R * 0.03, finCol, { k: R * 0.1, sc: [1, 0.25, 1], pv: [s * R * 0.7, -R * 0.15, R * 0.1] }));
  }
  // たてがみ（後ろへ 長く 流れる 5本）
  for (const [x, y, l] of [[0, 0.45, 2.3], [-0.42, 0.32, 1.9], [0.42, 0.32, 1.9], [-0.7, 0.05, 1.5], [0.7, 0.05, 1.5]]) H.add(cap([x * R * 0.6, y * R, -R * 0.3], [x * R * 1.6, (y + 0.35) * R, -R * l], R * 0.3, R * 0.03, finCol, { k: R * 0.12, sc: [x ? 1 : 0.35, x ? 0.3 : 1, 1], pv: [x * R * 0.6, y * R, -R * 0.3] }));
  H.paint(ell([0, -R * 0.55, R * 0.9], [R * 0.45, R * 0.2, R * 0.8]), white, R * 0.05);
  const head = { part: H, R, c: [0, R * 0.05, R * 0.2] };
  const hj = K.joint(pv, [0, 1.82, 0.98], [-0.12, 0, 0]);
  K.add(hj, K.mesh(H, 'head'));
  head.node = hj; M.head = hj; M.headInfo = head;
  // 水晶の 角（枝分かれ・光る）
  const HP = new Part();
  const antler = (s) => {
    const b = [s * R * 0.4, R * 0.55, -R * 0.1], t1 = [s * R * 1.0, R * 2.2, -R * 1.0];
    HP.add(cap(b, t1, R * 0.14, R * 0.05, pearl, { k: R * 0.04 }));
    for (const [f, d] of [[0.35, [s * R * 1.5, R * 1.25, -R * 0.2]], [0.6, [s * R * 0.45, R * 2.05, -R * 0.2]], [0.8, [s * R * 1.6, R * 2.15, -R * 0.9]]]) {
      const m = [lerp(b[0], t1[0], f), lerp(b[1], t1[1], f), lerp(b[2], t1[2], f)];
      HP.add(cap(m, d, R * 0.08, R * 0.035, pearl, { k: R * 0.03 }));
    }
  };
  antler(-1); antler(1);
  K.add(hj, K.mesh(HP, 'small'), { mat: MAT.glossy, emis: [0.12, 0.28, 0.35] });
  // ひげ（長く なびく）
  for (const s of [-1, 1]) {
    const wj = K.joint(hj, [s * R * 0.42, -R * 0.25, R * 1.6], [0.2, s * 0.6, 0]);
    const W = new Part([cap([0, 0, 0], [s * R * 0.7, -R * 0.2, -R * 1.3], R * 0.06, R * 0.045, cyan, { k: 0 }), cap([s * R * 0.7, -R * 0.2, -R * 1.3], [s * R * 1.2, -R * 0.7, -R * 3.0], R * 0.045, R * 0.012, cyan, { k: R * 0.03 })]);
    K.add(wj, K.mesh(W, 'tiny'), { emis: [0.15, 0.35, 0.45] });
    wj.r0 = wj.rot.slice(); wj.side = s; M.ears.push(wj);
  }
  addEyes(K, M, head, { dir: [0.58, 0.4, 0.72], size: 0.4, style: 'sharp', iris: [0.3, 0.95, 1], glow: true });
  K.prim(hj, PRIM.gem, [0.5, 1, 1], [0, R * 0.62, R * 0.58], [R * 0.13, R * 0.2, R * 0.13], [Math.PI / 2 - 0.5, 0, 0], { emis: [0.25, 0.65, 0.75], mat: MAT.glossy, outline: 0.6 });
  // すきとおる ひれの 翼（2対・大きい）
  const finWing = (seg, s, span, lift) => {
    const j = K.joint(M.ribbon[seg], [s * 0.2, 0.08, -SL * 0.4], [0, 0, 0]);
    const w = span, rays = [[s * w * 1.0, w * (0.6 + lift), -w * 0.1], [s * w * 1.15, w * (0.25 + lift), -w * 0.5], [s * w * 0.95, w * (-0.02 + lift), -w * 0.85], [s * w * 0.5, -w * 0.12, -w * 0.95]];
    const B = new Part([sph([0, 0, 0], w * 0.08, blue, { k: 0 })]);
    for (const t of rays) B.add(cap([0, 0, 0], t, w * 0.045, w * 0.02, mix(cyan, WHITE, 0.45), { k: w * 0.02 }));
    K.add(j, K.mesh(B, 'tiny'));
    const g = new GeoBuilder();
    const tri = (a, b, c, col) => { g.quad(a, b, c, c, col); g.quad(a, c, b, b, col); };
    const o = [0, 0, 0];
    for (let i = 0; i < rays.length - 1; i++) {
      const a = rays[i], b = rays[i + 1];
      const mid = [(a[0] + b[0]) / 2 * 0.88, (a[1] + b[1]) / 2 * 0.88, (a[2] + b[2]) / 2 * 0.88];
      tri(o, a, mid, mix(cyan, white, 0.25)); tri(o, mid, b, mix(cyan, blue, 0.2));
    }
    const mem = K.add(j, g.build(), { alpha: 0.82, emis: [0.12, 0.28, 0.36], outline: 0 }); mem.doubleSide = true; mem.transparent = true;
    j.side = s; M.wings.push(j);
  };
  for (const s of [-1, 1]) { finWing(1, s, 1.5, 0.12); finWing(6, s, 0.95, 0); }
  // 尾びれ：大きく 流れる（リボンの ような 2本も）
  const TP = new Part();
  for (const sy of [-1, 1]) TP.add(cap([0, 0, 0], [sy * 0.08, sy * 0.62, -0.9], 0.24, 0.04, finCol, { k: 0.04, sc: [0.28, 1, 1], pv: [0, 0, 0] }));
  for (const sx of [-1, 1]) TP.add(cap([0, 0, 0], [sx * 0.35, -0.15, -1.5], 0.07, 0.015, cyan, { k: 0.03 }));
  const tj = K.joint(M.ribbon[N - 1], [0, 0, -SL]); K.add(tj, K.mesh(TP, 'small'), { emis: [0.08, 0.2, 0.26] }); M.tails.push(tj);
  // まわりを まわる 光の 真珠
  M.orbit = K.joint(pv, [0, 1.25, -0.6]);
  for (let i = 0; i < 3; i++) { const a = i / 3 * Math.PI * 2; K.prim(M.orbit, PRIM.sphere, i ? cyan : pearl, [Math.cos(a) * 1.45, Math.sin(a * 2) * 0.2, Math.sin(a) * 1.45], [0.16], null, { emis: [0.55, 0.9, 1], mat: MAT.glossy, outline: 0.4 }); }
  M.orb = K.prim(M.ribbon[0], PRIM.gem, cyan, [0, -0.22, -0.05], [0.09, 0.14, 0.09], [Math.PI / 2, 0, 0], { emis: [0.35, 0.75, 0.85], mat: MAT.glossy, outline: 0.5 });
  M.anchor = { y: 1.4, z0: 0.4, z1: -0.6, w: 0.36, top: () => 1.8, neck: [0, 1.75, 0.7] };
  return head;
}

// ---------------- 小物・特徴 ----------------
function headPoint(head, dir) { return head.part.surface(head.c, dir); }
function addExtras(K, M, head) {
  const ex = K.ex, f = K.f, R = head ? head.R : 0.3, A = M.anchor || { y: 0.7, z0: 0.2, z1: -0.3, w: 0.3, top: () => 1, neck: [0, 1, 0.2] };
  const pv = M.pivot;
  const hn = head && head.node;
  if (head && ex.has('crown')) {
    const t = headPoint(head, [0, 1, -0.15]).p;
    const P = new Part([tor([0, 0, 0], R * 0.42, R * 0.07, [1, 0.82, 0.22], { k: 0 })]);
    for (let i = 0; i < 5; i++) { const a = i / 5 * Math.PI * 2 + 0.3; P.add(cap([Math.cos(a) * R * 0.42, 0, Math.sin(a) * R * 0.42], [Math.cos(a) * R * 0.5, R * 0.42, Math.sin(a) * R * 0.5], R * 0.09, R * 0.015, [1, 0.82, 0.22], { k: R * 0.04 })); }
    const j = K.joint(hn, [t[0], t[1] - R * 0.05, t[2]], [-0.15, 0, 0]);
    K.add(j, K.mesh(P, 'tiny'), { mat: MAT.glossy, emis: [0.18, 0.12, 0] });
    K.prim(j, PRIM.gem, [1, 0.3, 0.4], [0, R * 0.12, R * 0.44], [R * 0.08, R * 0.12, R * 0.08], [Math.PI / 2, 0, 0], { mat: MAT.glossy, emis: [0.3, 0.05, 0.1], outline: 0.5 });
  }
  if (head && ex.has('halo')) { const t = headPoint(head, [0, 1, 0]).p; K.prim(hn, PRIM.torus, [1, 0.95, 0.55], [t[0], t[1] + R * 0.45, t[2]], [R * 0.55, R * 0.5, R * 0.55], null, { emis: [0.55, 0.5, 0.25], unlit: true, outline: 0 }); }
  if (head && ex.has('gem')) { const s = headPoint(head, [0, 0.55, 0.85]); K.prim(hn, PRIM.gem, [0.4, 0.9, 1], [s.p[0], s.p[1], s.p[2]], [R * 0.13, R * 0.18, R * 0.13], [Math.PI / 2 - 0.5, 0, 0], { emis: [0.12, 0.32, 0.45], mat: MAT.glossy, outline: 0.6 }); }
  if (head && ex.has('scar')) { const fr = decalFrame(head.part, head.c, [0.35, 0.45, 0.82]); decalNode(hn, head.part, fr, [{ ...line2([[-R * 0.1, R * 0.18], [R * 0.12, -R * 0.2]], R * 0.06), col: [0.65, 0.2, 0.22], off: 0.003 }]); }
  if (head && (ex.has('whiskers') || f.face === 'whiskers')) for (const s of [-1, 1]) for (const k of [-1, 1]) {
    const p = headPoint(head, [s * 0.5, -0.3, 0.8]).p;
    const P = new Part([cap([0, 0, 0], [s * R * 0.75, k * R * 0.1, -R * 0.1], R * 0.022, R * 0.01, mix(K.dark, EYE_DARK, 0.5), { k: 0 })]);
    K.add(K.joint(hn, p), K.mesh(P, 'tiny'), { outline: 0 });
  }
  if (head && f.face === 'tusks') for (const s of [-1, 1]) { const p = headPoint(head, [s * 0.35, -0.6, 0.75]).p; const P = new Part([cap([0, 0, 0], [s * R * 0.25, -R * 0.35, R * 0.45], R * 0.11, R * 0.015, [1, 0.97, 0.88], { k: 0 })]); K.add(K.joint(hn, p), K.mesh(P, 'tiny'), { mat: MAT.glossy }); }
  if (head && f.face === 'trunk') { const p = headPoint(head, [0, -0.3, 1]).p; const tj = K.joint(hn, p, [2.5, 0, 0]); const P = new Part([cap([0, 0, 0], [0, -R * 1.2, R * 0.2], R * 0.22, R * 0.12, K.c1, { k: 0 })]); K.add(tj, K.mesh(P, 'small')); M.trunk = tj; }
  if (head && f.face === 'pincers') for (const s of [-1, 1]) {
    const p = headPoint(head, [s * 0.8, -0.2, 0.55]).p;
    const pc = K.joint(hn, p, [0, s * 0.4, 0]);
    const P = new Part([cap([0, 0, 0], [0, 0, R * 0.6], R * 0.2, R * 0.24, K.c2, { k: 0 }), cap([0, R * 0.05, R * 0.6], [s * R * 0.08, R * 0.12, R * 1.1], R * 0.17, R * 0.03, K.c2, { k: R * 0.08 }), cap([0, -R * 0.08, R * 0.6], [-s * R * 0.05, -R * 0.12, R * 1.0], R * 0.13, R * 0.03, K.c2, { k: R * 0.06 })]);
    K.add(pc, K.mesh(P, 'small'));
    (M.pincers = M.pincers || []).push(pc);
  }
  if (head && ex.has('antenna')) for (const s of [-1, 1]) {
    const p = headPoint(head, [s * 0.35, 0.9, 0.2]).p;
    const a = K.joint(hn, p, [-0.35, 0, -s * 0.3]);
    const P = new Part([cap([0, 0, 0], [0, R * 0.95, R * 0.1], R * 0.035, R * 0.03, K.dark, { k: 0 }), sph([0, R * 1.0, R * 0.12], R * 0.11, K.c2, { k: R * 0.04 })]);
    K.add(a, K.mesh(P, 'tiny'));
    a.r0 = a.rot.slice(); a.side = s; M.ears.push(a);
  }
  if (head && ex.has('feelers')) for (const s of [-1, 1]) {
    // ガの羽毛のような触角
    const p = headPoint(head, [s * 0.35, 0.9, 0.2]).p;
    const a = K.joint(hn, p, [-0.5, 0, -s * 0.45]);
    const P = new Part([cap([0, 0, 0], [0, R * 1.1, R * 0.1], R * 0.035, R * 0.025, K.dark, { k: 0 })]);
    for (let i = 1; i <= 5; i++) { const y = R * 0.18 * i; for (const sx of [-1, 1]) P.add(cap([0, y, R * 0.02 * i], [sx * R * 0.22 * (1 - i * 0.12), y + R * 0.1, R * 0.02 * i], R * 0.03, R * 0.012, mix(K.c2, WHITE, 0.3), { k: R * 0.01 })); }
    K.add(a, K.mesh(P, 'tiny'));
    a.r0 = a.rot.slice(); a.side = s; M.ears.push(a);
  }
  if (head && ex.has('flowerhead')) {
    const P = new Part();
    for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; P.add(ell([Math.cos(a) * R * 0.95, Math.sin(a) * R * 0.95, 0], [R * 0.42, R * 0.24, R * 0.07], K.c2, { k: R * 0.05, rot: [0, 0, a] })); }
    K.add(K.joint(hn, [0, R * 0.08, -R * 0.45]), K.mesh(P, 'small'));
  }
  if (ex.has('scarf') && M.head) {
    // 首にまくマフラー（頭の付け根）
    const hp = M.head.pos, nb = [hp[0], hp[1] - R * 0.78, hp[2] - R * 0.1];
    const red = [0.92, 0.2, 0.26];
    const P = new Part([tor([0, 0, 0], R * 0.6, R * 0.17, red, { k: 0, rot: [0.3, 0, 0] })]);
    P.paint(tor([0, 0, 0], R * 0.6, R * 0.3, red, { rot: [0.3, 0, 0] }), red, 0);
    for (const k of [-1, 0, 1]) P.paint(tor([0, k * R * 0.09, 0], R * 0.6, R * 0.03, WHITE, { rot: [0.3, 0, 0] }), [1, 0.95, 0.9], R * 0.02);
    K.add(K.joint(pv, nb), K.mesh(P, 'small'));
    const tl = K.joint(pv, [nb[0] + R * 0.35, nb[1] - R * 0.05, nb[2] - R * 0.5], [0.6, 0, 0.3]);
    const T2 = new Part([cap([0, 0, 0], [0, -R * 1.3, -R * 0.2], R * 0.24, R * 0.22, red, { k: 0, sc: [1, 1, 0.3], pv: [0, 0, 0] })]);
    T2.paint(box([0, -R * 1.3, 0], [R, R * 0.12, R], 0), [1, 0.95, 0.9], R * 0.02);
    K.add(tl, K.mesh(T2, 'small')); M.scarf = tl;
  }
  if (ex.has('cape')) {
    const n = A.neck;
    const cp = K.joint(pv, [0, n[1] + A.w * 0.1, n[2] - A.w * 0.55], [0.25, 0, 0]);
    const th = Math.max(A.w * 0.12, 0.035);   // マントの 厚み（薄すぎると 形に ならず 消えてしまう）
    const P = new Part([box([0, -A.w * 1.3, -th], [A.w * 1.15, A.w * 1.3, th], th * 0.8, [0.78, 0.15, 0.25], { k: 0 })]);
    P.paint(box([0, -A.w * 1.3, th * 0.6], [A.w * 1.1, A.w * 1.25, th * 0.5], 0), [0.95, 0.82, 0.3], th * 0.5);
    K.add(cp, K.mesh(P, 'small')); M.cape = cp;
  }
  if (ex.has('star')) { const z = A.z0 + A.w * 0.5; K.prim(pv, PRIM.star, [1, 0.95, 0.4], [0, A.y, z + A.w * 0.55], [A.w * 0.35], null, { emis: [0.5, 0.45, 0.1], unlit: true, outline: 0 }).doubleSide = true; }
  if (ex.has('lantern')) { const t = A.top((A.z0 + A.z1) / 2); const j = K.joint(pv, [0, t + A.w * 0.1, (A.z0 + A.z1) / 2]); K.prim(j, PRIM.box, [0.3, 0.22, 0.18], [0, A.w * 0.6, 0], [A.w * 0.6, A.w * 0.12, A.w * 0.6]); K.prim(j, PRIM.sphereHi, [1, 0.78, 0.3], [0, A.w * 0.3, 0], [A.w * 0.32], null, { emis: [0.9, 0.5, 0.1], outline: 0.5 }); }
  if (ex.has('sunball')) { if (M.sunTop) { const sb = K.prim(pv, PRIM.sphereHi, [1, 0.65, 0.18], M.sunTop, [0.36], null, { emis: [0.95, 0.5, 0.08], outline: 0.6 }); for (let i = 0; i < 6; i++) addFlame(K, M, pv, [M.sunTop[0] + Math.cos(i) * 0.3, M.sunTop[1] + Math.sin(i) * 0.3, M.sunTop[2]], 0.55, [0, 0, -i + Math.PI / 2]); void sb; } else K.prim(pv, PRIM.sphereHi, [1, 0.65, 0.18], [0, A.y - A.w * 0.2, A.z0 + A.w * 1.2], [A.w * 0.6], null, { emis: [0.85, 0.4, 0.05], outline: 0.6 }); }
  if (ex.has('bubbles')) for (let i = 0; i < 5; i++) K.prim(pv, PRIM.sphereHi, [0.8, 0.95, 1], [Math.sin(i * 2) * A.w * 2, A.y + A.w * (0.5 + i * 0.4), Math.cos(i * 2) * A.w * 1.6], [A.w * (0.18 + (i % 3) * 0.06)], null, { alpha: 0.45, mat: MAT.glossy, outline: 0 }).noDepthWrite = true;
  if (ex.has('glow')) M.body && (M.body.emis = K.glow.map(v => v * 0.14));
  // 第2部の 新種：隕石の 結晶が 背中から 生えている（光る むらさき）
  if (ex.has('shards')) {
    const col = mix(K.glow, [0.78, 0.42, 1], 0.6);
    for (let i = 0; i < 5; i++) {
      const z = lerp(A.z0, A.z1, 0.12 + i * 0.19), sd = (i % 2 ? 1 : -1) * A.w * (0.18 + (i % 3) * 0.08);
      const t = A.top ? A.top(z) : A.y + A.w;
      K.prim(pv, PRIM.gem, col, [sd, t + A.w * 0.08, z], [A.w * 0.1, A.w * (0.26 + (i % 3) * 0.08), A.w * 0.1], [-0.25, 0, sd > 0 ? -0.45 : 0.45], { emis: col.map(v => v * 0.55), mat: MAT.glossy, outline: 0.6 });
    }
  }
  if (ex.has('tentacles')) { const nT = M.longTentacles ? 8 : 6; for (let i = 0; i < nT; i++) { const a = i / nT * Math.PI * 2; tailChain(K, M, pv, [Math.cos(a) * A.w * 0.85, A.y - A.w * 0.75, (A.z0 + A.z1) / 2 + Math.sin(a) * A.w * 0.85], M.longTentacles ? 5 : 3, A.w * 0.5, A.w * 0.13, K.c2, 0.25 * Math.cos(a), 0.18, 0, null, 0.6); } }
  const hand = M.arms[1];
  if (hand && ex.has('sword')) { const P = new Part([box([0, 0, R * 1.3], [R * 0.06, R * 0.14, R * 1.1], R * 0.03, [0.88, 0.92, 1], { k: 0 }), box([0, 0, R * 0.12], [R * 0.32, R * 0.08, R * 0.08], R * 0.03, [0.7, 0.5, 0.2], { k: 0.01 })]); K.add(K.joint(hand, [0, -hand.len - 0.04, 0.1]), K.mesh(P, 'tiny'), { mat: MAT.glossy, emis: [0.08, 0.1, 0.18] }); }
  if (hand && ex.has('hammer')) { const P = new Part([cap([0, 0, -R * 0.2], [0, 0, R * 1.2], R * 0.07, R * 0.07, [0.55, 0.38, 0.22], { k: 0 }), box([0, 0, R * 1.35], [R * 0.45, R * 0.38, R * 0.32], R * 0.1, [0.62, 0.62, 0.68], { k: 0.01 })]); K.add(K.joint(hand, [0, -hand.len - 0.04, 0.08]), K.mesh(P, 'small'), { mat: MAT.glossy }); }
  if (K.sp.legend) { const t = A.z0 + A.w * 0.6; M.orb = K.prim(pv, PRIM.gem, K.glow, [0, A.y + A.w * 0.1, t + A.w * 0.3], [A.w * 0.16, A.w * 0.26, A.w * 0.16], [Math.PI / 2, 0, 0], { emis: K.glow.map(v => v * 0.6), mat: MAT.glossy, outline: 0.5 }); }
}

// ---------------- 組み立て ----------------
const EYE_CFG = {
  quad: { dir: [0.47, 0.2, 0.86], size: 0.6 }, dragon: { dir: [0.5, 0.3, 0.8], size: 0.52 }, turtle: { dir: [0.5, 0.18, 0.85], size: 0.6 },
  biped: { dir: [0.45, 0.16, 0.88], size: 0.6 }, plant: { dir: [0.42, 0.1, 0.9], size: 0.62 }, golem: { dir: [0.45, 0.32, 0.84], size: 0.5 },
  bird: { dir: [0.62, 0.22, 0.75], size: 0.6 }, fish: { dir: [0.72, 0.22, 0.66], size: 0.52 }, serpent: { dir: [0.62, 0.38, 0.7], size: 0.56 },
  bug: { dir: [0.56, 0.18, 0.8], size: 0.68 }, blob: { dir: [0.36, 0.1, 0.93], size: 0.46 }, leviathan: { dir: [0.6, 0.35, 0.72], size: 0.42, glow: true },
};
function buildTemplate(spId, shiny, q) {
  const sp = SPECIES[spId];
  const D = DESIGN[sp.name] || {};
  const K = new Kit(sp, shiny, q, D);
  const root = new Node(), pivot = new Node(); root.add(pivot);
  const M = { root, pivot, legs: [], arms: [], wings: [], tails: [], fins: [], segs: [], chains: [], flames: [], eyes: [], ears: [], plan: sp.plan, sp, floating: false, height: 1, fierce: K.fierce, cute: K.cute };
  const f = K.f;
  const legendPlan = sp.name === 'エンテイオウ' ? planEnteiou : sp.name === 'ナルメクシア' ? planNarumexia : sp.name === 'スカイドラゴン' ? planSkyDragon : null;
  let head;
  const g2 = !legendPlan && G2[sp.name];
  if (legendPlan) head = legendPlan(K, M, pivot);
  else if (g2) head = g2(K, M, pivot);
  else {
    const ar = ARCH[D.a] || ARCH[ARCH_FALLBACK[sp.plan]] || ARCH.cat;
    head = ar.fn(K, M, pivot, ar.p);
  }
  if (head && !M.custom) {
    const ec = M.eyeCfg || EYE_CFG[M.plan] || EYE_CFG.quad;
    const style = K.eyeStyle;
    const glow = style === 'glow' || ec.glow;
    addEyes(K, M, head, { dir: ec.dir, size: ec.size, style, glow, iris: glow && (M.plan === 'golem' || M.core) ? K.glow : (style === 'glow' ? mix(K.glow, K.iris, 0.4) : K.iris) });
    if (M.beak) addBeak(K, M, head);
    addFace(K, M, head, M.faceCfg || {});
    if (!M.noEars) { const es = M.earStyle ?? f.ears; if (es && es !== 'none') addEars(K, M, head, es); }
    addHorns(K, head, f.horn || 0, f.hornStyle);
  }
  if (M.tailBase && !M.custom) addTail(K, M, pivot, M.tailBase, M.tailType ?? f.tail, 1);
  if (!M.custom) addExtras(K, M, head);
  // 大きさ：伝説はそのまま。ほかは設計表の大きさ（s）に合わせて全体を拡大縮小
  if (sp.legend && (legendPlan || M.custom)) M.size = sp.scale || 1;
  else {
    root.update(null);
    const b = treeBounds(root);
    const raw = Math.max(b[4], (b[5] - b[2]) * 0.62, (b[3] - b[0]) * 0.42, 0.3);
    M.size = (D.s || 1) * 1.25 / raw;
  }
  pivot.setScale(M.size);
  // 実際の高さ（カメラ・UI用）
  root.update(null);
  let top = 0;
  root.traverse(n => { if (!n.geo || n.transparent) return; const w = n.world, d = n.geo.data; for (let i = 0; i < d.length; i += 13 * 4) { const y = w[1] * d[i] + w[5] * d[i + 1] + w[9] * d[i + 2] + w[13]; if (y > top) top = y; } });
  M.height = Math.max(0.3, top + (M.floating ? 0.25 * M.size : 0));
  computeSeat(M, root, sp);
  M.bodyScale = D.s || 1;
  M.small = (D.s || 1) < 0.8 && !sp.legend;
  return M;
}

// ライド用：背中の 高さ（seatY）と 前後の 位置（seatZ）。
//  乗った人が 体に めりこんだり、宙に 浮いたり しないように、実際の 形から 背中の いちばん 高い 所を 調べる。
//  頭・翼・しっぽ・耳・炎は のぞく（4本足などは 胴の まんなか、2本足は 背中側）
function computeSeat(M, root, sp) {
  try {
    const skip = new Set();
    const mark = (n) => { if (n && n.traverse) n.traverse(c => skip.add(c)); };
    const upright = sp.plan === 'biped' || sp.plan === 'golem' || sp.plan === 'plant';
    // 2本足の子は 背中だと 頭と 重なるので、頭の 上に 乗る（肩車）。4本足などは 背中
    if (M.head && !upright && sp.plan !== 'fish' && sp.plan !== 'blob') mark(M.head);
    for (const k of ['wings', 'tails', 'flames', 'ears', 'seatSkip']) for (const n of (M[k] || [])) mark(n);
    let z0 = 1e9, z1 = -1e9, xm = 0;
    const pts = [];
    root.traverse(n => {
      if (!n.geo || n.transparent || skip.has(n)) return;
      const w = n.world, d = n.geo.data;
      for (let i = 0; i < d.length; i += 13 * 3) {
        const x = w[0] * d[i] + w[4] * d[i + 1] + w[8] * d[i + 2] + w[12], y = w[1] * d[i] + w[5] * d[i + 1] + w[9] * d[i + 2] + w[13], z = w[2] * d[i] + w[6] * d[i + 1] + w[10] * d[i + 2] + w[14];
        pts.push(x, y, z); if (z < z0) z0 = z; if (z > z1) z1 = z; if (Math.abs(x) > xm) xm = Math.abs(x);
      }
    });
    if (!pts.length) return;
    const L = Math.max(0.01, z1 - z0);
    const za = upright ? z0 : z0 + L * 0.3, zb = upright ? z1 : z0 + L * 0.62;
    const xr = Math.max(0.12, xm * 0.32);
    let top = -1e9, tz = (za + zb) / 2;
    for (let i = 0; i < pts.length; i += 3) { const x = pts[i], y = pts[i + 1], z = pts[i + 2]; if (Math.abs(x) <= xr && z >= za && z <= zb && y > top) { top = y; if (upright) tz = z; } }
    if (!(top > 0.05)) return;
    M.seatY = Math.min(top, M.height); M.seatZ = upright ? Math.max(z0, Math.min(z1, tz)) * 0.6 : (za + zb) / 2;
  } catch (e) { /* 失敗したら 今までの 目安を 使う */ }
}

// ---------------- アニメーション ----------------
//  state: idle / walk / run / fly / battle / attack / happy / roar / hurt
export function animateAnimon(M, dt, state = 'idle', speed = 1) {
  M.t += dt * speed;
  const t = M.t, p = M.pivot, S = M.size;
  const walk = state === 'walk' || state === 'run';
  const run = state === 'run';
  const battle = state === 'battle' || state === 'attack';
  const w = walk ? (run ? 14 : 9) : 0;
  const plan = M.plan;
  const upright = plan === 'biped' || plan === 'plant' || plan === 'golem';
  // 体の上下と伸び縮み（スクワッシュ＆ストレッチ）
  let bob = 0, sq = 0, lean = 0, yaw = 0;
  if (walk) { const s = Math.sin(t * w); bob = Math.abs(s) * (run ? 0.14 : 0.07) * S; sq = -Math.cos(t * w * 2) * (run ? 0.06 : 0.03); lean = run ? 0.2 : 0.08; }
  else if (battle) { const s = Math.sin(t * 4.6); bob = (s * 0.5 + 0.5) * 0.07 * S; sq = s * 0.05; lean = M.fierce ? 0.16 : 0.09; yaw = Math.sin(t * 1.3) * 0.05; }
  else { const s = Math.sin(t * 2.2); sq = s * 0.035; }
  // ときどき小さくジャンプ（進化前のアニモン）
  if (state === 'idle' && M.small && !M.floating) {
    M.hop -= dt * speed;
    if (M.hop < 0) { const k = -M.hop / 0.38; if (k >= 1) M.hop = 2.5 + Math.random() * 3.5; else { bob += Math.sin(k * Math.PI) * 0.28 * S; sq += Math.sin(k * Math.PI) * 0.07 - (k < 0.15 ? 0.07 : 0); } }
  }
  if (state === 'happy') { const k = (t * 2.2) % 1; bob = Math.sin(k * Math.PI) * 0.55 * S; sq = Math.sin(k * Math.PI) * 0.09 - (k < 0.12 || k > 0.9 ? 0.09 : 0); yaw = Math.sin(t * 2.2 * Math.PI) * 0.25; }
  if (state === 'roar') { lean = -0.28; sq = 0.07 + Math.sin(t * 30) * 0.015; }
  if (state === 'attack') { lean = 0.38; sq = -0.05; }
  if (state === 'hurt') { lean = -0.18; sq = -0.06; }
  p.rot[1] = yaw + (M.wiggle ? Math.sin(t * (walk ? 7 : battle ? 4 : 1.8)) * (walk ? 0.12 : 0.06) : 0);
  p.pos[1] = (M.floating ? 0.25 * S + Math.sin(t * 2) * 0.1 * S : 0) + bob;
  if (state === 'fly') p.pos[1] = 0.2 * S + Math.sin(t * 3) * 0.12 * S;
  p.scl[0] = S * (1 - sq * 0.6); p.scl[1] = S * (1 + sq); p.scl[2] = S * (1 - sq * 0.6);
  p.rot[0] = lean * (upright ? 1 : 0.6) + (state === 'fly' ? 0.12 : 0);
  // 脚
  M.legs.forEach((l, i) => {
    if (plan === 'bug') { l.rot[0] = walk ? Math.sin(t * w + i * 1.3) * 0.55 : Math.sin(t * 2 + i) * 0.06; return; }
    const ph = (plan === 'quad' || plan === 'dragon' || plan === 'turtle') ? ((i === 0 || i === 3) ? 0 : Math.PI) : i * Math.PI;
    l.rot[0] = walk ? Math.sin(t * w + ph) * (run ? 0.95 : 0.7) : battle ? Math.sin(t * 4.6 + ph) * 0.07 - (upright ? 0 : (i < 2 ? 0.12 : -0.1)) : 0;
    if (state === 'fly') l.rot[0] = 0.6;
    if (state === 'attack') l.rot[0] = i < 2 ? -0.5 : 0.45;
  });
  M.arms.forEach((a, i) => {
    const r0 = a.r0 || [0, 0, 0];
    if (walk) { a.rot[0] = r0[0] - Math.sin(t * w + i * Math.PI) * (run ? 0.95 : 0.6); a.rot[2] = r0[2]; }
    else if (state === 'attack') { a.rot[0] = r0[0] - (i ? 1.6 : 0.4); a.rot[2] = r0[2] * 0.6; }
    else if (battle) { a.rot[0] = r0[0] - 0.7 + Math.sin(t * 4.6 + i) * 0.14; a.rot[2] = r0[2] * 1.25; }
    else if (state === 'happy' || state === 'roar') { a.rot[0] = r0[0] - 2.4 + Math.sin(t * 10 + i) * 0.3; a.rot[2] = r0[2]; }
    else { a.rot[0] = r0[0] + Math.sin(t * 2.2 + i) * 0.1; a.rot[2] = r0[2]; }
  });
  // 翼
  const flapSp = state === 'fly' ? 8.5 : battle ? 6 : (plan === 'bird' || plan === 'bug' ? 3.5 : 2.2);
  const flapAmp = state === 'fly' ? 0.8 : battle ? 0.5 : (plan === 'bug' ? 0.45 : 0.22);
  const fold = plan === 'bird' && !M.floating && !M.spread && state !== 'fly' && !battle && state !== 'happy' && state !== 'roar';
  M.wings.forEach(wg => {
    if (fold) { wg.rot[2] = wg.side * (-1.05 + Math.sin(t * 2.2) * 0.05); wg.rot[1] = wg.side * 0.6; return; }
    wg.rot[2] = wg.side * (Math.sin(t * flapSp) * flapAmp + (plan === 'bird' ? -0.15 : 0.12)); wg.rot[1] = wg.side * Math.cos(t * flapSp) * 0.1;
  });
  M.fins.forEach(fn => { fn.rot[2] = fn.side * Math.sin(t * 4.5) * 0.35; });
  // 尻尾（しなる）
  const tf = walk ? (run ? 11 : 7) : battle ? 6 : state === 'happy' ? 12 : 2.6;
  const ta = walk ? 0.3 : battle ? 0.34 : state === 'happy' ? 0.5 : 0.24;
  M.tails.forEach((tl, i) => { tl.rot[1] = Math.sin(t * tf + i) * ta * 1.4; });
  for (const ch of M.chains) ch.forEach((j, i) => {
    j.rot[1] = j.r0[1] + Math.sin(t * tf - i * 0.75) * ta * (0.5 + i * 0.3);
    j.rot[0] = j.r0[0] + Math.sin(t * tf * 0.5 - i * 0.9) * 0.07 * (i + 1) + (run ? -0.12 * (i === 0 ? 2 : 0.5) : 0);
  });
  // 伝説の龍（1本に つながった 体）：ゆったり うねる
  if (M.ribbon) { const f = walk ? 5 : battle ? 3.2 : 1.8, amp = battle ? 0.09 : 0.07; M.ribbon.forEach((j, i) => { if (!i) return; j.rot[1] = j.r0[1] + Math.sin(t * f - i * 0.55) * amp; j.rot[0] = j.r0[0] + Math.sin(t * f * 0.7 - i * 0.5) * amp * 0.5; }); }
  // ヘビ型のうねり
  if (M.segs.length) M.segs.forEach((s, i) => { const b = s.base || s.pos; s.pos[0] = Math.sin(t * (walk ? 6 : battle ? 4 : 2) - i * 0.8) * 0.13 * (i + 1) * 0.5; s.pos[1] = b[1] + (plan === 'leviathan' ? Math.sin(t * 2 - i * 0.6) * 0.08 : 0); });
  // 頭（きょろきょろ・うなずき）
  if (M.head && M.head.rot) {
    M.head._r0 = M.head._r0 || M.head.rot.slice();
    const r0 = M.head._r0;
    M.head.rot[1] = r0[1] + (walk ? 0 : battle ? Math.sin(t * 0.9) * 0.08 : Math.sin(t * 0.8) * 0.2);
    M.head.rot[0] = r0[0] + (battle ? Math.sin(t * 4.6 + 0.6) * 0.05 + (M.fierce ? 0.12 : 0.04) : walk ? Math.sin(t * w * 2) * 0.04 : Math.sin(t * 1.3) * 0.04) + (state === 'roar' ? -0.5 : 0) + (state === 'attack' ? 0.2 : 0);
    M.head.rot[2] = r0[2] + (state === 'idle' ? Math.sin(t * 0.55) * 0.09 : 0);
  }
  // 耳ぴくぴく
  for (const e of M.ears) { const tw = Math.max(0, Math.sin(t * 1.7 + e.side * 1.3) - 0.85) * 4; e.rot[2] = e.r0[2] + (e.side || 1) * (tw * 0.25 + (walk ? Math.sin(t * w) * 0.08 : 0)); e.rot[0] = e.r0[0] - (run ? 0.35 : battle ? 0.15 : 0); }
  // まばたき
  M.blink -= dt;
  const bl = M.blink < 0 ? (M.blink < -0.14 ? (M.blink = 2 + Math.random() * 3.5, 1) : 0.12) : 1;
  for (const g of M.eyes) g.scl[1] = (g.base ? g.base[1] : 1) * (state === 'hurt' ? 0.15 : bl);
  // 炎のゆらめき
  for (const fl of M.flames) { const s = 1 + Math.sin(t * 15 + fl.s0 * 3) * 0.12; fl.setScale(s * (1 - Math.sin(t * 9) * 0.05), s * (1 + Math.sin(t * 11 + 1) * 0.16), s); fl.rot[2] = Math.sin(t * 7 + fl.s0) * 0.12; }
  if (M.scarf) M.scarf.rot[2] = 0.3 + Math.sin(t * (walk ? 10 : 3)) * 0.25;
  if (M.cape) M.cape.rot[0] = 0.25 + (walk ? 0.45 : battle ? 0.15 : 0) + Math.sin(t * (walk ? 9 : 2)) * 0.08;
  if (M.trunk) M.trunk.rot[0] = 2.5 + Math.sin(t * 2) * 0.2;
  if (M.clam) M.clam.rot[0] = 0.5 + Math.max(0, Math.sin(t * 1.2)) * 0.25;
  if (M.orb) M.orb.rot[1] += dt * 2;
  if (M.orbit) M.orbit.rot[1] += dt * 2.4;
  if (M.spin) for (const n of M.spin) n.rot[n.spinAx] += dt * n.spinSp;
  if (M.bob) for (const n of M.bob) n.pos[1] = n.bobY + Math.sin(t * n.bobF + n.bobPh) * n.bobA;
  if (M.pincers) M.pincers.forEach((pc, i) => { pc.rot[0] = Math.sin(t * (battle ? 6 : 2) + i) * 0.15; });
}



// ---------------- 人物（アニメ調・3頭身。なめらかな体と髪、表面に貼った瞳） ----------------
export const SKIN = ['#ffe3cf', '#f8cfae', '#e3ab80', '#bd7f56', '#8c5838', '#5e3b25', '#fff1e8', '#d9a070', '#3f2618'];
export const HAIR_COL = ['#2a1e1a', '#5a3a22', '#a8642a', '#e8c060', '#e8e8f0', '#d04040', '#3a6ad0', '#4ab070', '#d070c0', '#7a5ad0', '#9aa2ac', '#f4a6c8', '#f08a30', '#30b4a8', '#2a3c80', '#a8ecd0', '#c4aef4', '#8a2444'];
export const CLOTH = ['#e04848', '#3a7ae0', '#48b060', '#f0b030', '#9050d0', '#2a2a36', '#ffffff', '#f07ab0', '#30b0b0', '#8a5a3a', '#f08040', '#283c8c', '#7cc8f0', '#a4d84c', '#b8a074', '#8a8c96', '#8c2a3c', '#7fdcb4', '#f8e46a'];
export const HAIR_STYLES = ['short', 'spiky', 'long', 'ponytail', 'bob', 'buzz', 'twin', 'bun', 'wavy', 'braid', 'afro', 'mohawk'];
export const HAIR_JA = { short: 'ショート', spiky: 'ツンツン', long: 'ロング', ponytail: 'ポニーテール', bob: 'ボブ', buzz: 'ぼうず', twin: 'ツインテール', bun: 'おだんご', wavy: 'ふんわりロング', braid: 'みつあみ', afro: 'アフロ', mohawk: 'モヒカン' };
export const HATS = ['none', 'cap', 'beanie', 'hat', 'beret', 'ribbon', 'catears', 'flower', 'band', 'goggles', 'crown'];
export const HAT_JA = { none: 'なし', cap: 'キャップ', beanie: 'ニット帽', hat: 'ぼうし', beret: 'ベレー帽', ribbon: 'リボン', catears: 'ねこみみ', flower: '花かざり', band: 'ヘアバンド', goggles: 'ゴーグル', crown: 'おうかん' };
export const BOTTOMS = ['pants', 'shorts', 'skirt', 'longskirt'];
export const BOTTOM_JA = { pants: 'ズボン', shorts: '短パン', skirt: 'スカート', longskirt: 'ロングスカート' };
// 追加の 着せかえ（古い データには 無いので 無いときは ふつうの 見た目）
export const TOPS = ['tee', 'stripe', 'jacket', 'hoodie', 'sailor', 'vest'];
export const TOP_JA = { tee: 'Tシャツ', stripe: 'しましま', jacket: 'ジャケット', hoodie: 'パーカー', sailor: 'セーラー', vest: 'ベスト' };
export const ACCS = ['none', 'glasses', 'sunglasses', 'scarf', 'bandaid', 'star'];
export const ACC_JA = { none: 'なし', glasses: 'めがね', sunglasses: 'サングラス', scarf: 'マフラー', bandaid: 'ばんそうこう', star: 'ほっぺの星' };
export const BAGS = ['backpack', 'none', 'pochette'];
export const BAG_JA = { backpack: 'リュック', none: 'なし', pochette: 'ポシェット' };
export const EYE_COL = [null, '#3a2a20', '#2a5ad0', '#2a9a60', '#c03050', '#8a50d0', '#d09020', '#40b0c0', '#555a66'];   // 0 = 髪の色に あわせる
export const HEIGHTS = [0.9, 1, 1.1];
export const HEIGHT_JA = ['小さめ', 'ふつう', '大きめ'];
// 髪を 押さえる（髪の てっぺんを 低くする）ぼうし
const HAT_COVER = new Set(['cap', 'beanie', 'hat', 'beret', 'crown']);

export function defaultLook() {
  return { skin: 0, hair: 'short', hairCol: 0, shirt: 0, pants: 5, shoes: 6, hat: 'cap', hatCol: 0, bottom: 'pants', top: 'tee', subCol: 6, acc: 'none', bag: 'backpack', eyeCol: 0, height: 1 };
}
const HTPL = new Map();
const HQ = [];   // あとで作る人（遠くの人は近づいてから組み立てる）
export function buildHuman(look, opts = {}) {
  initPrims();
  const key = JSON.stringify(look) + (defaultLod === 'hi' ? 'h' : 'm');
  let T = HTPL.get(key);
  if (!T && opts.lazy) {
    const stub = { root: new Node(), lazy: look, t: Math.random() * 10, blink: 2, legs: [], arms: [], eyes: [] };
    HQ.push(stub);
    return stub;
  }
  if (!T) { T = buildHumanTemplate(look, defaultLod === 'hi' ? 1 : 1.4); HTPL.set(key, T); if (HTPL.size > 40) HTPL.delete(HTPL.keys().next().value); }
  const H = cloneRig(T);
  H.t = Math.random() * 10; H.blink = 1 + Math.random() * 3;
  return H;
}
function buildHumanTemplate(look, q) {
  const skin = hexToRgb(SKIN[look.skin] || SKIN[0]);
  const hairC = sat(hexToRgb(HAIR_COL[look.hairCol] || HAIR_COL[0]), 0.06);
  const shirt = sat(hexToRgb(CLOTH[look.shirt] ?? CLOTH[0]), 0.1);
  const pants = sat(hexToRgb(CLOTH[look.pants] ?? CLOTH[5]), 0.05);
  const shoes = hexToRgb(CLOTH[look.shoes] ?? CLOTH[6]);
  const hatC = sat(hexToRgb(CLOTH[look.hatCol ?? look.shirt] ?? CLOTH[0]), 0.08);
  const sub = sat(hexToRgb(CLOTH[look.subCol ?? 6] ?? CLOTH[6]), 0.08);
  const top = look.top || 'tee', acc = look.acc || 'none', bag = look.bag || 'backpack';
  const covers = HAT_COVER.has(look.hat);
  const skirtish = look.bottom === 'skirt' || look.bottom === 'longskirt';
  const trim = lum(shirt) > 0.75 ? [0.3, 0.45, 0.85] : mix(shirt, WHITE, 0.6);
  const root = new Node(), pivot = new Node(); root.add(pivot);
  const H = { root, pivot, legs: [], arms: [], t: 0, eyes: [], blink: 2 };
  const K = { q, add: Kit.prototype.add, joint: Kit.prototype.joint, prim: Kit.prototype.prim, mesh(part, cell) { return part.mesh(cell * q); } };
  const hipY = 0.72;
  // 脚（太もも・すね・くつ）
  const LP = new Part([sph([0, 0, 0], 0.13, pants, { k: 0 })]);
  LP.add(cap([0, 0, 0], [0, -0.34, 0.02], 0.12, 0.1, look.bottom === 'pants' || look.bottom === 'shorts' ? pants : skin, { k: 0.05 }));
  LP.add(cap([0, -0.34, 0.02], [0, -0.62, 0], 0.095, 0.08, look.bottom === 'pants' ? pants : skin, { k: 0.04 }));
  LP.add(ell([0, -0.66, 0.06], [0.11, 0.08, 0.17], shoes, { k: 0.04 }));
  if (look.bottom === 'shorts') LP.paint(box([0, -0.36, 0], [0.3, 0.13, 0.3], 0), skin, 0.02);
  LP.paint(box([0, -0.72, 0.06], [0.3, 0.035, 0.3], 0), mix(shoes, [0, 0, 0], 0.4), 0.01);
  LP.paint(box([0, -0.645, 0.2], [0.05, 0.03, 0.04], 0), mix(shoes, WHITE, 0.7), 0.01);
  const lg = LP.mesh(0.03 * q);
  for (const s of [-1, 1]) { const j = K.joint(pivot, [s * 0.12, hipY, 0]); K.add(j, lg); j.len = 0.66; H.legs.push(j); }
  // 体（シャツ・えり・ベルト）
  const B = new Part([ell([0, hipY + 0.3, 0], [0.24, 0.32, 0.18], shirt, { k: 0 })]);
  B.add(ell([0, hipY + 0.48, 0], [0.27, 0.16, 0.18], shirt, { k: 0.08 }));
  B.add(cap([0, hipY + 0.55, 0], [0, hipY + 0.68, 0.01], 0.08, 0.075, skin, { k: 0.03 }));
  if (look.bottom === 'skirt') {
    B.add(cap([0, hipY + 0.16, 0], [0, hipY - 0.12, 0], 0.2, 0.33, pants, { k: 0.05, sc: [1, 1, 0.8], pv: [0, hipY, 0] }));
    B.add(box([0, hipY - 0.55, 0], [1, 0.33, 1], 0, null, { op: 'sub', k: 0.02 }));
    B.paint(box([0, hipY - 0.2, 0], [0.5, 0.035, 0.5], 0), mix(pants, WHITE, 0.55), 0.008);
  }
  else if (look.bottom === 'longskirt') {
    B.add(cap([0, hipY + 0.16, 0], [0, hipY - 0.46, 0], 0.2, 0.36, pants, { k: 0.05, sc: [1, 1, 0.82], pv: [0, hipY, 0] }));
    B.add(box([0, hipY - 0.86, 0], [1, 0.33, 1], 0, null, { op: 'sub', k: 0.02 }));
    B.paint(box([0, hipY - 0.5, 0], [0.6, 0.035, 0.6], 0), mix(pants, WHITE, 0.55), 0.008);
  }
  else B.add(ell([0, hipY + 0.04, 0], [0.23, 0.13, 0.17], pants, { k: 0.05 }));
  B.paint(tor([0, hipY + 0.6, 0.02], 0.12, 0.035, trim, { rot: [0.25, 0, 0] }), trim, 0.01);
  if (look.bottom !== 'skirt') B.paint(tor([0, hipY + 0.12, 0], 0.235, 0.03, [0.3, 0.2, 0.15]), [0.32, 0.22, 0.16], 0.01);
  // 上の服の 形・模様
  if (top === 'stripe') for (const y of [0.1, 0.22, 0.34, 0.46]) B.paint(box([0, hipY + y, 0], [0.5, 0.032, 0.5], 0), sub, 0.006);
  if (top === 'jacket') {
    B.paint(box([0, hipY + 0.3, 0.2], [0.075, 0.3, 0.12], 0.02), sub, 0.006);   // 中の シャツ
    for (const s of [-1, 1]) B.add(cap([s * 0.06, hipY + 0.6, 0.14], [s * 0.13, hipY + 0.36, 0.17], 0.035, 0.02, mix(shirt, [0, 0, 0], 0.15), { k: 0.02 }));   // えり
  }
  if (top === 'hoodie') {
    B.add(ell([0, hipY + 0.6, -0.15], [0.21, 0.13, 0.11], shirt, { k: 0.05 }));   // フード
    B.paint(box([0, hipY + 0.14, 0.18], [0.14, 0.08, 0.06], 0.02), mix(shirt, [0, 0, 0], 0.18), 0.006);   // ポケット
    for (const s of [-1, 1]) B.add(cap([s * 0.05, hipY + 0.56, 0.16], [s * 0.055, hipY + 0.38, 0.19], 0.012, 0.012, sub, { k: 0.01 }));   // ひも
  }
  if (top === 'sailor') {
    B.paint(box([0, hipY + 0.56, -0.12], [0.3, 0.1, 0.12], 0.02), sub, 0.006);   // えり（後ろ）
    for (const sx of [-1, 1]) B.paint(cap([sx * 0.19, hipY + 0.6, 0.1], [0, hipY + 0.36, 0.19], 0.04, 0.03), sub, 0.004);   // えり（前の V）
    B.add(sph([0, hipY + 0.37, 0.19], 0.05, [0.92, 0.25, 0.35], { k: 0.02 }));   // スカーフの むすび目
  }
  if (top === 'vest') {
    B.paint(ell([0, hipY + 0.3, 0], [0.26, 0.3, 0.2]), sub, 0.006);
    B.paint(box([0, hipY + 0.32, 0.2], [0.06, 0.3, 0.1], 0.02), shirt, 0.006);
  }
  // かばん
  if (bag === 'backpack') {
    B.add(box([0, hipY + 0.34, -0.22], [0.17, 0.2, 0.08], 0.06, [0.62, 0.4, 0.24], { k: 0.02 }));
    B.paint(box([0, hipY + 0.27, -0.3], [0.13, 0.06, 0.03], 0.02), [0.78, 0.55, 0.32], 0.01);
  } else if (bag === 'pochette') {
    for (const [a, b] of [[[-0.2, hipY + 0.55, 0.11], [0, hipY + 0.34, 0.19]], [[0, hipY + 0.34, 0.19], [0.22, hipY + 0.1, 0.12]]]) B.paint(cap(a, b, 0.032, 0.032), [0.45, 0.28, 0.18], 0.004);
    B.add(ell([0.25, hipY + 0.06, 0.06], [0.085, 0.075, 0.045], sub, { k: 0.02 }));
  }
  // マフラー
  if (acc === 'scarf') {
    B.add(tor([0, hipY + 0.64, 0.01], 0.12, 0.065, sub, { k: 0.02 }));
    B.add(cap([0.07, hipY + 0.6, 0.12], [0.11, hipY + 0.34, 0.17], 0.05, 0.04, sub, { k: 0.02 }));
  }
  K.add(pivot, B.mesh(0.03 * q));
  // 腕（そで・手）
  for (const s of [-1, 1]) {
    const AP = new Part([sph([0, 0, 0], 0.085, shirt, { k: 0 })]);
    AP.add(cap([0, 0, 0], [0, -0.24, 0.01], 0.075, 0.062, shirt, { k: 0.03 }));
    AP.add(cap([0, -0.24, 0.01], [0, -0.46, 0.03], 0.058, 0.052, skin, { k: 0.02 }));
    AP.add(sph([0, -0.5, 0.035], 0.065, skin, { k: 0.02 }));
    AP.paint(tor([0, -0.22, 0.01], 0.07, 0.02, trim), trim, 0.008);
    const j = K.joint(pivot, [s * 0.29, hipY + 0.5, 0], [0, 0, s * 0.14]);
    K.add(j, AP.mesh(0.024 * q));
    H.arms.push(j);
  }
  // 頭（大きめ・ほっぺの丸み）
  const R = 0.36;
  const HP = new Part([ell([0, 0, 0], [R, R * 0.97, R * 0.95], skin, { k: 0 })]);
  HP.add(ell([0, -R * 0.35, R * 0.18], [R * 0.78, R * 0.6, R * 0.72], skin, { k: R * 0.3 }));
  for (const s of [-1, 1]) HP.add(ell([s * R * 0.96, -R * 0.05, -R * 0.05], [R * 0.12, R * 0.18, R * 0.12], skin, { k: R * 0.1 }));
  const head = { part: HP, R, c: [0, 0, 0] };
  const hj = K.joint(pivot, [0, hipY + 0.98, 0.02]);
  K.add(hj, HP.mesh(0.021 * q));
  head.node = hj; H.head = hj;
  // 目・口・ほっぺ
  const iris = look.eyeCol > 0 && EYE_COL[look.eyeCol] ? hexToRgb(EYE_COL[look.eyeCol]) : mix(hairC, [0.15, 0.32, 0.75], 0.45);
  const fakeK = { slit: false, dark: [0.2, 0.12, 0.1], c1: skin, cute: true };
  for (const s of [-1, 1]) {
    const fr = decalFrame(HP, head.c, [s * 0.36, -0.06, 0.93]);
    const E = R * 0.42;
    const L = [];
    let o = 0.0012; const nx = () => (o += 0.0012);
    L.push({ pts: ellipse2(0, -0.03 * E, 0.4 * E, 0.62 * E, 26), col: WHITE, off: nx() });
    L.push({ pts: ellipse2(0, -0.08 * E, 0.34 * E, 0.55 * E, 26), col: iris, off: nx() });
    const top = []; for (let i = 0; i <= 14; i++) { const a = i / 14 * Math.PI; top.push([Math.cos(a) * 0.34 * E, -0.08 * E + Math.sin(a) * 0.55 * E]); } for (let i = 1; i < 6; i++) { const t = i / 6; top.push([lerp(-0.34, 0.34, t) * E, -0.02 * E - Math.sin(t * Math.PI) * 0.08 * E]); }
    L.push({ pts: top.reverse(), col: mix(iris, [0, 0, 0.08], 0.55), off: nx() });
    L.push({ pts: ellipse2(0, -0.1 * E, 0.15 * E, 0.3 * E, 16), col: mix(iris, [0, 0, 0.05], 0.88), off: nx() });
    L.push({ pts: ellipse2(-0.12 * E, 0.16 * E, 0.11 * E, 0.15 * E, 14, 0.4), col: WHITE, off: nx() });
    L.push({ pts: ellipse2(0.12 * E, -0.3 * E, 0.05 * E, 0.05 * E, 10), col: WHITE, off: o });
    L.push({ ...arc2(0, -0.03 * E, 0.42 * E, 0.64 * E, Math.PI * (s > 0 ? 0.98 : 0.02), Math.PI * (s > 0 ? 0.06 : 0.94), 0.14 * E, 14, (t) => 0.6 + 0.4 * Math.sin(Math.PI * t) + (t > 0.85 ? 0.35 : 0)), col: EYE_DARK, off: nx() });
    L.push({ ...line2([[s * 0.34 * E, 0.38 * E], [s * 0.5 * E, 0.5 * E]], 0.08 * E, (t) => 1 - t * 0.8), col: EYE_DARK, off: o });
    // まゆ
    L.push({ ...line2([[-0.32 * E, 0.88 * E], [0, 0.98 * E], [0.32 * E, 0.9 * E]], 0.08 * E, (t) => 0.7 + 0.3 * Math.sin(Math.PI * t)), col: mix(hairC, [0, 0, 0], 0.35), off: o });
    const g = new Node(); g.setPos(fr.p[0], fr.p[1], fr.p[2]); const e = eulerFrom(fr.u, fr.v, fr.n); g.setRot(e[0], e[1], e[2]); hj.add(g);
    g.add(new Node(decalGeo(HP, fr, L), { mat: MAT.flat, outline: 0 }));
    g.base = g.scl.slice(); H.eyes.push(g);
    const bf = decalFrame(HP, head.c, [s * 0.62, -0.4, 0.68]);
    decalNode(hj, HP, bf, [{ pts: ellipse2(0, 0, R * 0.13, R * 0.07, 14), col: mix(skin, [1, 0.45, 0.5], 0.5), off: 0.002 }]);
  }
  void fakeK;
  const mfr = decalFrame(HP, head.c, [0, -0.62, 0.8]);
  decalNode(hj, HP, mfr, [{ ...arc2(0, R * 0.03, R * 0.07, R * 0.05, Math.PI * 1.1, Math.PI * 1.9, R * 0.03, 10, () => 1), col: MOUTH, off: 0.002 }]);
  // ほっぺの ばんそうこう・星
  if (acc === 'bandaid') { const f = decalFrame(HP, head.c, [0.62, -0.32, 0.7]); decalNode(hj, HP, f, [{ pts: [[-R * 0.16, -R * 0.06], [R * 0.16, -R * 0.06], [R * 0.16, R * 0.06], [-R * 0.16, R * 0.06]], col: [0.98, 0.86, 0.68], off: 0.003 }, { pts: [[-R * 0.05, -R * 0.04], [R * 0.05, -R * 0.04], [R * 0.05, R * 0.04], [-R * 0.05, R * 0.04]], col: [0.92, 0.72, 0.55], off: 0.004 }]); }
  if (acc === 'star') { const f = decalFrame(HP, head.c, [-0.6, -0.26, 0.72]); const pts = []; for (let i = 0; i < 10; i++) { const a = Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? R * 0.045 : R * 0.11; pts.push([Math.cos(a) * r, Math.sin(a) * r]); } decalNode(hj, HP, f, [{ pts, col: [1, 0.82, 0.25], off: 0.003 }]); }
  // めがね・サングラス
  if (acc === 'glasses' || acc === 'sunglasses') {
    const fc = acc === 'sunglasses' ? [0.12, 0.12, 0.16] : [0.25, 0.22, 0.3];
    const GP = new Part([]);
    for (const s of [-1, 1]) {
      GP.add(tor([s * R * 0.37, -R * 0.08, R * 0.95], R * 0.19, R * 0.035, fc, { rot: [Math.PI / 2, 0, 0], k: 0 }));
      if (acc === 'sunglasses') GP.add(ell([s * R * 0.37, -R * 0.08, R * 0.96], [R * 0.19, R * 0.17, R * 0.03], [0.1, 0.12, 0.2], { k: 0.01 }));
      GP.add(cap([s * R * 0.56, -R * 0.06, R * 0.86], [s * R * 0.95, -R * 0.02, R * 0.1], R * 0.025, R * 0.025, fc, { k: 0.01 }));
    }
    GP.add(cap([-R * 0.18, -R * 0.06, R * 0.98], [R * 0.18, -R * 0.06, R * 0.98], R * 0.025, R * 0.025, fc, { k: 0.01 }));
    K.add(hj, GP.mesh(0.012 * q), { mat: MAT.glossy });
  }
  // 髪
  const hs = look.hair;
  const HR = new Part([]);
  if (hs === 'buzz') HR.add(ell([0, R * 0.16, -R * 0.06], [R * 1.04, R * 0.86, R * 1.02], hairC, { k: 0 }));
  else {
    HR.add(ell([0, R * 0.2, -R * 0.08], covers ? [R * 1.06, R * 0.82, R * 1.04] : [R * 1.1, R * 0.95, R * 1.08], hairC, { k: 0 }));
    // 前髪の房
    const by = covers ? R * 0.5 : R * 0.75;
    for (let i = -2; i <= 2; i++) { const x = i * R * 0.3; HR.add(cap([x * 0.9, by, R * 0.55], [x * 1.05 + (i ? Math.sign(i) * R * 0.08 : 0), R * (0.28 + Math.abs(i) * 0.06), R * (0.95 - Math.abs(i) * 0.1)], R * 0.2, R * 0.03, hairC, { k: R * 0.12 })); }
    // もみあげ
    for (const s of [-1, 1]) HR.add(cap([s * R * 0.92, R * 0.3, R * 0.1], [s * R * 0.95, -R * 0.42, R * 0.25], R * 0.18, R * 0.04, hairC, { k: R * 0.12 }));
  }
  if (hs === 'spiky') for (let i = 0; i < 7; i++) { const a = Math.PI * (0.05 + i / 6 * 0.9); const cx = Math.cos(a), sz = Math.sin(a); HR.add(cap([cx * R * 0.45, R * 0.75, -sz * R * 0.1], [cx * R * 1.15, R * (1.05 + sz * 0.35), -R * (0.35 + sz * 0.55)], R * 0.34, R * 0.03, hairC, { k: R * 0.14 })); }
  if (hs === 'short') HR.add(cap([R * 0.1, R * 0.95, R * 0.1], [R * 0.25, R * 1.3, R * 0.25], R * 0.08, R * 0.01, hairC, { k: R * 0.05 }));
  if (hs === 'long') { HR.add(cap([0, R * 0.2, -R * 0.5], [0, -R * 1.5, -R * 0.55], R * 0.95, R * 0.7, hairC, { k: R * 0.2, sc: [1, 1, 0.6], pv: [0, 0, -R * 0.5] })); for (const s of [-1, 1]) HR.add(cap([s * R * 0.85, 0, R * 0.05], [s * R * 0.8, -R * 1.25, R * 0.05], R * 0.22, R * 0.12, hairC, { k: R * 0.1 })); }
  if (hs === 'bob') HR.add(ell([0, -R * 0.08, -R * 0.24], [R * 1.18, R * 0.85, R * 1.0], hairC, { k: R * 0.15 }));
  if (hs === 'wavy') { HR.add(cap([0, R * 0.2, -R * 0.5], [0, -R * 1.35, -R * 0.6], R * 1.05, R * 0.85, hairC, { k: R * 0.22, sc: [1, 1, 0.62], pv: [0, 0, -R * 0.5] })); for (const s of [-1, 1]) for (let i = 0; i < 3; i++) HR.add(sph([s * R * (0.92 + (i % 2) * 0.12), -R * (0.35 + i * 0.4), -R * 0.15], R * 0.3, hairC, { k: R * 0.15 })); }
  if (hs === 'bun') HR.add(sph([0, R * 1.0, -R * 0.45], R * 0.36, hairC, { k: R * 0.1 }));
  if (hs === 'braid') for (let i = 0; i < 6; i++) HR.add(sph([Math.sin(i * 1.6) * R * 0.05, -R * (0.15 + i * 0.27), -R * (1.0 + i * 0.04)], R * (0.2 - i * 0.012), hairC, { k: R * 0.04 }));
  if (hs === 'afro') HR.add(ell([0, R * 0.45, -R * 0.3], [R * 1.3, R * 1.15, R * 1.15], hairC, { k: R * 0.1 }));
  if (hs === 'mohawk') { HR.shapes = []; HR.add(ell([0, R * 0.16, -R * 0.06], [R * 1.03, R * 0.84, R * 1.01], mix(hairC, skin, 0.55), { k: 0 })); for (let i = 0; i < 5; i++) { const z = R * (0.55 - i * 0.38); HR.add(cap([0, R * 0.7, z], [0, R * (1.35 - Math.abs(i - 1.5) * 0.08), z - R * 0.12], R * 0.16, R * 0.04, hairC, { k: R * 0.1 })); } }
  if (covers) HR.shapes = HR.shapes.filter((sh, k) => k === 0 || sh.c?.[1] < R * 0.9 || sh.a?.[1] < R * 0.9);
  K.add(hj, HR.mesh(0.022 * q));
  if (hs === 'ponytail') {
    const pt = K.joint(hj, [0, R * 0.25, -R * 1.02], [0.45, 0, 0]);
    const PP = new Part([sph([0, 0, 0], R * 0.18, hairC, { k: 0 }), cap([0, 0, -R * 0.05], [0, -R * 1.1, -R * 0.2], R * 0.28, R * 0.06, hairC, { k: R * 0.1 })]);
    PP.paint(sph([0, 0, 0], R * 0.2), mix(hatC, [1, 0.3, 0.4], 0.5), R * 0.02);
    K.add(pt, PP.mesh(0.024 * q));
    H.pony = pt;
  }
  if (hs === 'twin') {
    const PP = new Part([sph([0, 0, 0], R * 0.17, hairC, { k: 0 }), cap([0, -R * 0.05, -R * 0.02], [0, -R * 1.55, -R * 0.18], R * 0.3, R * 0.07, hairC, { k: R * 0.12 })]);
    PP.paint(sph([0, 0, 0], R * 0.19), mix(hatC, [1, 0.3, 0.4], 0.5), R * 0.02);
    const pm = PP.mesh(0.024 * q);
    for (const s of [-1, 1]) { const pt = K.joint(hj, [s * R * 1.0, R * 0.42, -R * 0.2], [0.2, 0, s * 0.42]); K.add(pt, pm); if (s < 0) H.pony = pt; else H.pony2 = pt; }
  }
  // 帽子
  if (look.hat === 'cap') {
    const CP = new Part([ell([0, R * 0.42, -R * 0.04], [R * 1.12, R * 0.72, R * 1.1], hatC, { k: 0 })]);
    CP.add(ell([0, R * 0.38, R * 0.95], [R * 0.72, R * 0.07, R * 0.5], hatC, { k: R * 0.08 }));
    CP.paint(ell([0, R * 0.8, R * 0.75], [R * 0.24, R * 0.2, R * 0.2]), lum(hatC) > 0.7 ? [0.9, 0.3, 0.3] : WHITE, R * 0.02);
    CP.paint(sph([0, R * 1.12, 0], R * 0.1), mix(hatC, WHITE, 0.4), R * 0.02);
    K.add(hj, CP.mesh(0.022 * q));
  }
  if (look.hat === 'beanie') {
    const CP = new Part([ell([0, R * 0.45, -R * 0.04], [R * 1.1, R * 0.82, R * 1.08], hatC, { k: 0 }), sph([0, R * 1.3, -R * 0.06], R * 0.24, WHITE, { k: R * 0.05 })]);
    CP.paint(tor([0, R * 0.1, -R * 0.04], R * 1.05, R * 0.14), mix(hatC, WHITE, 0.3), R * 0.02);
    K.add(hj, CP.mesh(0.022 * q));
  }
  if (look.hat === 'beret') {
    const CP = new Part([ell([R * 0.12, R * 0.72, -R * 0.06], [R * 1.05, R * 0.3, R * 1.0], hatC, { k: 0 }), sph([R * 0.12, R * 1.0, -R * 0.06], R * 0.08, hatC, { k: R * 0.03 })]);
    K.add(hj, CP.mesh(0.022 * q));
  }
  if (look.hat === 'ribbon') {
    const c = [R * 0.5, R * 1.05, -R * 0.1];
    const CP = new Part([sph(c, R * 0.13, hatC, { k: 0 })]);
    for (const s of [-1, 1]) CP.add(ell([c[0] + s * R * 0.3, c[1] + R * 0.05, c[2]], [R * 0.28, R * 0.19, R * 0.1], hatC, { k: R * 0.07, rot: [0, 0, s * 0.4] }));
    K.add(hj, CP.mesh(0.018 * q));
  }
  if (look.hat === 'catears') {
    const CP = new Part([]);
    for (const s of [-1, 1]) CP.add(cap([s * R * 0.52, R * 0.72, -R * 0.05], [s * R * 0.7, R * 1.42, -R * 0.1], R * 0.27, R * 0.03, hatC, { k: R * 0.05 }));
    for (const s of [-1, 1]) CP.paint(cap([s * R * 0.54, R * 0.85, R * 0.12], [s * R * 0.68, R * 1.3, R * 0.05], R * 0.14, R * 0.02), [1, 0.7, 0.78], R * 0.02);
    K.add(hj, CP.mesh(0.018 * q));
  }
  if (look.hat === 'flower') {
    const c = [R * 1.0, R * 0.55, R * 0.35];
    const CP = new Part([sph(c, R * 0.1, [1, 0.85, 0.25], { k: 0 })]);
    for (let i = 0; i < 5; i++) { const a = i / 5 * Math.PI * 2; CP.add(sph([c[0] + Math.cos(a) * R * 0.04, c[1] + Math.sin(a) * R * 0.17, c[2] + Math.cos(a) * R * 0.15], R * 0.1, hatC, { k: R * 0.04 })); }
    K.add(hj, CP.mesh(0.016 * q));
  }
  if (look.hat === 'band' || look.hat === 'goggles') {
    const CP = new Part([tor([0, R * 0.48, -R * 0.02], R * 1.02, R * 0.08, hatC, { rot: [-0.3, 0, 0], k: 0 })]);
    if (look.hat === 'goggles') for (const s of [-1, 1]) { CP.add(cap([s * R * 0.32, R * 0.72, R * 0.78], [s * R * 0.34, R * 0.84, R * 0.98], R * 0.2, R * 0.2, [0.3, 0.3, 0.35], { k: R * 0.03 })); CP.paint(sph([s * R * 0.34, R * 0.86, R * 1.02], R * 0.17), [0.55, 0.85, 1], R * 0.02); }
    K.add(hj, CP.mesh(0.018 * q));
  }
  if (look.hat === 'crown') {
    const gold = [1, 0.8, 0.25];
    const cy = R * 0.78, cz = -R * 0.06, rr = R * 0.66;
    const CP = new Part([tor([0, cy, cz], rr, R * 0.1, gold, { k: 0 })]);
    for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; CP.add(cap([Math.sin(a) * rr, cy + R * 0.05, cz + Math.cos(a) * rr], [Math.sin(a) * rr * 1.04, cy + R * 0.42, cz + Math.cos(a) * rr * 1.04], R * 0.13, R * 0.025, gold, { k: R * 0.04 })); }
    CP.paint(sph([0, cy, cz + rr + R * 0.08], R * 0.1), [0.9, 0.2, 0.35], R * 0.02);
    K.add(hj, CP.mesh(0.018 * q), { mat: MAT.glossy });
  }
  if (look.hat === 'hat') {
    const CP = new Part([ell([0, R * 0.5, 0], [R * 1.6, R * 0.11, R * 1.6], hatC, { k: 0 }), cap([0, R * 0.5, 0], [0, R * 1.15, 0], R * 0.98, R * 0.9, hatC, { k: R * 0.08 })]);
    CP.paint(box([0, R * 0.64, 0], [R * 1.2, R * 0.09, R * 1.2], 0), [0.9, 0.25, 0.25], R * 0.02);
    K.add(hj, CP.mesh(0.024 * q));
  }
  pivot.setScale(1.05 * (HEIGHTS[look.height ?? 1] || 1));
  return H;
}

// 近い順に、少しずつ組み立てる（1フレームに1人まで）
export function pumpHumans(px, pz, range = 95) {
  if (!HQ.length) return;
  for (let i = HQ.length - 1; i >= 0; i--) if (!HQ[i].root.parent) HQ.splice(i, 1);
  let best = -1, bd = range * range;
  for (let i = 0; i < HQ.length; i++) {
    const w = HQ[i].root.pos, dx = w[0] - px, dz = w[2] - pz, d = dx * dx + dz * dz;
    if (d < bd) { bd = d; best = i; }
  }
  if (best < 0) return;
  const s = HQ.splice(best, 1)[0];
  const H = buildHuman(s.lazy);
  for (const c of H.root.children.slice()) s.root.add(c);
  for (const k of ['pivot', 'legs', 'arms', 'head', 'eyes', 'pony', 'pony2']) s[k] = H[k];
  delete s.lazy;
}
export function animateHuman(H, dt, state = 'idle', speed = 1) {
  if (!H.pivot) return;
  H.t += dt * speed;
  const t = H.t;
  const run = state === 'run', walk = state === 'walk' || run;
  const f = run ? 13 : 9, amp = run ? 1.0 : 0.65;
  H.legs.forEach((l, i) => { l.rot[0] = walk ? Math.sin(t * f + i * Math.PI) * amp : 0; });
  H.arms.forEach((a, i) => { a.rot[0] = walk ? -Math.sin(t * f + i * Math.PI) * amp * 0.95 : Math.sin(t * 1.8 + i) * 0.05; });
  H.pivot.pos[1] = walk ? Math.abs(Math.sin(t * f)) * (run ? 0.12 : 0.06) : Math.sin(t * 2) * 0.012;
  H.pivot.rot[0] = run ? 0.18 : walk ? 0.06 : 0;
  if (state === 'ride') { H.legs.forEach((l, i) => { l.rot[0] = -1.3; l.rot[2] = (i ? 1 : -1) * 0.35; }); H.arms.forEach(a => { a.rot[0] = -0.6; }); H.pivot.pos[1] = 0; H.pivot.rot[0] = 0.15; }
  else H.legs.forEach(l => { l.rot[2] = 0; });
  if (state === 'wave') { H.arms[1].rot[2] = 2.6 + Math.sin(t * 8) * 0.3; H.arms[1].rot[0] = 0; } else if (H.arms[1]) H.arms[1].rot[2] = 0.14;
  if (H.arms[0] && state !== 'cheer') H.arms[0].rot[2] = -0.14;
  if (state === 'cheer') { H.arms.forEach((a, i) => { a.rot[2] = (i ? 1 : -1) * (2.7 + Math.sin(t * 10) * 0.2); a.rot[0] = 0; }); H.pivot.pos[1] = Math.abs(Math.sin(t * 6)) * 0.25; }
  if (H.pony) H.pony.rot[0] = 0.3 + (walk ? Math.sin(t * f) * 0.15 + (run ? 0.22 : 0) : Math.sin(t * 1.5) * 0.04);
  if (H.pony2) H.pony2.rot[0] = 0.25 + (walk ? Math.sin(t * f + 1) * 0.15 + (run ? 0.22 : 0) : Math.sin(t * 1.5 + 1) * 0.04);
  if (H.head) H.head.rot[1] = walk ? 0 : Math.sin(t * 0.7) * 0.12;
  H.blink -= dt;
  const bl = H.blink < 0 ? (H.blink < -0.13 ? (H.blink = 2.5 + Math.random() * 3, 1) : 0.12) : 1;
  for (const g of H.eyes) g.scl[1] = g.base[1] * bl;
}

export function randomLook(r) {
  // 町の人・トレーナー（元からの 10色・6種類を 中心に、たまに 新しい 服や 小物）
  const L = {
    skin: Math.floor(r() * 4), hair: HAIR_STYLES[Math.floor(r() * 6)], hairCol: Math.floor(r() * 10),
    shirt: Math.floor(r() * 10), pants: Math.floor(r() * 10), shoes: Math.floor(r() * 10),
    hat: r() < 0.6 ? 'none' : HATS[1 + Math.floor(r() * 3)], hatCol: Math.floor(r() * 10), bottom: BOTTOMS[Math.floor(r() * 3)],
  };
  const x = r();
  if (x < 0.25) L.top = TOPS[1 + Math.floor(r() * (TOPS.length - 1))];
  if (x > 0.85) L.acc = ['glasses', 'scarf'][Math.floor(r() * 2)];
  if (x > 0.4 && x < 0.55) L.hair = HAIR_STYLES[6 + Math.floor(r() * 6)];
  return L;
}
