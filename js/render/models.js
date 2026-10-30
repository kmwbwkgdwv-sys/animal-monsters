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
    for (const s of [-1, 1]) {
      const sf = head.part.surface(head.c, [s * 0.7, 0.55, -0.1]);
      const b = sf.p; let prev = b;
      for (let i = 1; i <= 7; i++) {
        const a = i / 7 * Math.PI * 1.5, rr = R * (0.42 - i * 0.03);
        const p = [b[0] + s * (R * 0.12 + Math.sin(a) * rr * 0.4), b[1] + Math.sin(a) * rr * 0.9, b[2] - (1 - Math.cos(a)) * rr * 0.9];
        P.add(cap(prev, p, R * (0.17 - i * 0.015), R * (0.155 - i * 0.015), hc, { k: 0.02 }));
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
      const memCol = bat ? K.dark : (plan === 'leviathan' ? mix(K.c2, [0.6, 0.9, 1], 0.4) : mix(K.c1, K.c2, 0.35));
      const memIn = mix(memCol, WHITE, 0.18);
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
      const mn = K.add(j, g.build(), { outline: 0.9, emis: plan === 'leviathan' ? [0.04, 0.1, 0.18] : [0, 0, 0], mat: MAT.decor }); mn.doubleSide = true;
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
  if (Q.tusks && (s > 0.4 || K.f.face === 'tusks')) for (const sx of [-1, 1]) { const p = head.part.surface([0, -headR * 0.3, 0], [sx * 0.45, -0.45, 0.8]).p; const TP = new Part(); let prev = p; for (let i = 1; i <= 4; i++) { const a = i / 4; const q = [p[0] + sx * headR * 0.25 * a, p[1] - headR * 0.75 * Math.sin(a * 1.4) + headR * 0.55 * a * a, p[2] + headR * 0.9 * a]; TP.add(cap(prev, q, headR * (0.15 - a * 0.025), headR * (0.13 - a * 0.025), [1, 0.96, 0.86], { k: headR * 0.03 })); prev = q; } K.add(hj, K.mesh(TP, 'small'), { mat: MAT.glossy }); }
  const ears = K.f.ears === 'none' ? 'none' : (Q.ears ?? K.f.ears);
  M.earStyle = ears;
  if (Q.horn && !K.f.horn) K.f.horn = s > 0.5 ? Q.horn : 1;
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
      if (B.blades) AP.add(cap([0, -aL * 0.55, 0.05], [0, -aL * 1.05, ar * 3.5], ar * 0.6, ar * 0.05, K.hornCol, { k: ar * 0.2, sc: [0.35, 1, 1], pv: [0, -aL * 0.55, 0.05] }));
      else if (B.fist) AP.add(sph([0, -aL - ar * 0.3 * B.fist, 0.08], ar * 0.85 * B.fist, K.T.includes('fighting') || B.fist > 1.7 ? c2 : c1, { k: ar * 0.5 }));
      if (B.armor) AP.paint(cap([0, -aL * 0.5, 0.03], [0, -aL, 0.07], ar * 1.2, ar * 1.1), K.metal, ar * 0.1);
      if (B.claws || K.ex.has('claws')) for (const x of [-1, 0, 1]) AP.add(cap([x * ar * 0.6, -aL - ar * 0.7 * B.fist, ar * 0.9], [x * ar * 0.7, -aL - ar * 1.6 * B.fist, ar * 1.5], ar * 0.28, ar * 0.04, [0.98, 0.96, 0.9], { k: ar * 0.15 }));
    }
    const j = K.joint(pv, [sx * tw * sh * (B.penguin ? 1.0 : 0.98), yC + tH * (B.penguin ? 0.05 : 0.16), fz], [B.zombie ? -1.35 : -0.2, 0, sx * (B.penguin ? 0.35 : 0.28)]);
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
    head = { part: HP, R, c: [0, 0, 0] };
    M.eyeCfg = { dir: [0.32, 0.15, 0.94], size: 0.45 };
    M.faceCfg = { nose: false, mouth: false, blush: false };
    M.noEars = true;
  } else {
    head = mammalHead(K, headR, { snout: (B.snout ?? 0.3) * lerp(0.7, 1, s), brow: B.brow && s > 0.4 });
    if (K.ex.has('wraps') || B.zombie) for (let i = 0; i < 3; i++) head.part.paint(tor([0, headR * (0.45 - i * 0.4), 0], headR * 1.0, headR * 0.09, WHITE, { rot: [0.2 * (i % 2 ? 1 : -1), 0, 0.1] }), [0.95, 0.92, 0.82], headR * 0.03);
    M.eyeCfg = { dir: [0.45, 0.16, 0.88], size: 0.6 };
  }
  const hj = K.joint(pv, [0, hy, hz]);
  K.add(hj, K.mesh(head.part, 'head'));
  head.node = hj; M.head = hj; M.headInfo = head;
  if (B.frog) M.noEars = true;
  backNodes(K, M, pv, { ...A, z0: -tw * 0.3, z1: -tw * 0.55, wingZ: -tw * 0.45, top: () => hipY + tH * 0.95, w: tw * 0.9 });
  M.tailBase = [0, hipY + 0.14, -tw * 0.62];
  M.tailType = K.f.tail;
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
  if (F.flatHead) P.add(ell([0, by - R[1] * 0.1, R[2] * 0.55], [R[0] * 1.25, R[1] * 0.75, R[2] * 0.45], c1, { k: R[1] * 0.3 }));
  if (F.jaw) P.add(ell([0, by - R[1] * 0.35, R[2] * 0.6], [R[0] * 0.75, R[1] * 0.45, R[2] * 0.4], c1, { k: R[1] * 0.25 }));
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
  else TP.add(cap([0, 0, 0], [0, 0, -R[2] * 0.55], R[1] * 0.55, R[1] * 0.3, c2, { k: 0.03, sc: [0.25, 1, 1], pv: [0, 0, 0] }));
  const tj = K.joint(pv, [0, by + 0.02, -R[2] * 1.12]); K.add(tj, K.mesh(TP, 'small')); M.tails.push(tj);
  if (F.whisk) for (const sx of [-1, 1]) for (const k of [0, 1]) tailChain(K, M, pv, [sx * R[0] * 0.75, by - R[1] * 0.25, R[2] * 0.85], 3, R[1] * 0.35, R[1] * 0.06, K.dark, -1.2 - k * 0.5, -0.25, sx * 0.9, null, 0.5);
  M.tailBase = null;
  M.anchor = A;
  M.eyeCfg = { dir: F.flatHead ? [0.62, 0.45, 0.65] : [0.72, 0.22, 0.66], size: 0.5 * (F.eyeK || 1) };
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
  queenbee: { body: 'round', wings: 'small', legs: 6, antenna: 1, stinger: 1, float: 1, stripes: 1, big: 1.25 },
  dragonfly: { body: 'long', wings: 'dragonfly', legs: 6, float: 1 },
  beetle: { body: 'dome', legs: 6, horn: 1 },
  dungbeetle: { body: 'dome', legs: 6, ball: 1 },
  stag: { body: 'dome', legs: 6, pincers: 1 },
  spider: { body: 'spider', legs: 8 },
  crab: { body: 'crab', legs: 6, claws: 1, stalks: 1 },
  scorpion: { body: 'flat', legs: 8, claws: 1, stingTail: 1 },
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
    P.add(ell([0, by + 0.12, -0.32], [0.36, 0.33, 0.4], c1, { k: 0 }));
    P.add(ell([0, by, 0.1], [0.22, 0.18, 0.22], mix(c1, K.dark, 0.3), { k: 0.06 }));
    P.paint(ell([0, by + 0.38, -0.32], [0.18, 0.12, 0.22]), c2, 0.03);
    headZ = 0.34;
  } else if (kind === 'crab') {
    P.add(ell([0, by + 0.05, 0], [0.48, 0.24, 0.36], c1, { k: 0 }));
    for (const sx of [-1, 1]) P.add(cap([sx * 0.3, by + 0.12, 0.2], [sx * 0.52, by + 0.1, 0.05], 0.06, 0.02, c1, { k: 0.05 }));
    P.paint(ell([0, by - 0.12, 0], [0.42, 0.12, 0.32]), K.belly, 0.03);
    headZ = 0.32; headY = by + 0.14; legW = 0.36;
  } else if (kind === 'flat') {
    P.add(ell([0, by - 0.04, 0], [0.26, 0.15, 0.38], c1, { k: 0 }));
    for (let i = 0; i < 3; i++) P.paint(box([0, by + 0.1, 0.15 - i * 0.15], [0.3, 0.06, 0.012], 0), mix(c1, K.dark, 0.4), 0.01);
    headZ = 0.38; headY = by;
  }
  if (Bg.stripes) for (let i = 0; i < 3; i++) P.paint(box([0, by, -0.1 - i * 0.18 * big], [0.6, 0.6, 0.05 * big], 0), [0.16, 0.12, 0.1], 0.015);
  const A = { y: by, z0: 0.05, z1: -0.5, w: 0.28, top: topFn(P), neck: [0, by + 0.1, 0.2], wingZ: -0.02 };
  bodyPaints(K, P, A);
  M.body = K.add(pv, K.mesh(P, 'body'), M.glossy ? { mat: MAT.glossy } : {});
  // 脚
  const nL = Bg.legs, legLen = Bg.float ? 0.3 : by + 0.05;
  const LP = new Part([cap([0, 0, 0], [0, -legLen * 0.5, 0.06], 0.04, 0.032, K.dark, { k: 0 }), cap([0, -legLen * 0.5, 0.06], [0, -legLen, 0.12], 0.032, 0.02, K.dark, { k: 0.02 })]);
  const lg = K.mesh(LP, 'tiny');
  const zs = nL === 8 ? [0.18, 0.06, -0.06, -0.18] : [0.16, 0.02, -0.12];
  for (const sx of [-1, 1]) for (const z of zs) { const j = K.joint(pv, [sx * legW, legY, z + (kind === 'spider' ? 0.05 : 0)], [0, 0, sx * (kind === 'spider' || kind === 'crab' ? 1.15 : 0.9)]); K.add(j, lg); j.side = sx; M.legs.push(j); }
  // ハサミ（カニ・サソリ）
  if (Bg.claws) for (const sx of [-1, 1]) {
    const cs = lerp(1, 1.5, s);
    const CP = new Part([cap([0, 0, 0], [sx * 0.12, 0.02, 0.22], 0.06, 0.05, c1, { k: 0 }), ell([sx * 0.16, 0.04, 0.36], [0.11 * cs, 0.09 * cs, 0.14 * cs], c1, { k: 0.05 })]);
    CP.add(cap([sx * 0.16, 0.08, 0.44], [sx * 0.12, 0.1, 0.6 * cs], 0.06 * cs, 0.015, c2, { k: 0.02 }));
    CP.add(cap([sx * 0.2, 0.0, 0.44], [sx * 0.2, -0.02, 0.56 * cs], 0.045 * cs, 0.012, c2, { k: 0.02 }));
    const j = K.joint(pv, [sx * (kind === 'crab' ? 0.38 : 0.18), by, kind === 'crab' ? 0.2 : 0.3], [0, sx * 0.35, 0]);
    K.add(j, K.mesh(CP, 'small'));
    (M.pincers = M.pincers || []).push(j);
  }
  // サソリの尾（背中にそり返る）
  if (Bg.stingTail) { const tip = tailChain(K, M, pv, [0, by + 0.05, -0.35], 5, 0.13, 0.07, c1, 2.6, -0.5, 0, null, 0.4); const SP = new Part([cap([0, 0, 0], [0, -0.05, 0.18], 0.07, 0.008, [0.3, 0.18, 0.32], { k: 0 })]); K.add(tip, K.mesh(SP, 'tiny'), { mat: MAT.glossy }); }
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
  if (Bg.wings) addBugWings(K, M, pv, Bg.wings, by, s);
  M.tailBase = Bg.stinger ? [0, by - 0.05, -0.55 * big] : null;
  M.tailType = Bg.stinger ? 'stinger' : null;
  M.anchor = A;
  M.eyeCfg = { dir: [0.52, 0.2, 0.83], size: 0.66 };
  M.faceCfg = { nose: false, blush: K.cute };
  M.noEars = true;
  return head;
}
// 虫の羽（チョウ・ガ・トンボ・ハチ）
function addBugWings(K, M, pv, kind, by, s) {
  for (const sx of [-1, 1]) {
    const j = K.joint(pv, [sx * 0.1, by + 0.12, -0.02]);
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
};
function planBlob(K, M, pv, Bl) {
  M.plan = 'blob';
  const s = K.st, c1 = K.c1, c2 = K.c2;
  M.floating = !!Bl.float;
  const sh = Bl.shape;
  const by = 0.6;
  let R = 0.5 * lerp(0.95, 1.05, s);
  const P = new Part();
  let eyeDir = [0.36, 0.12, 0.92], eyeSize = 0.46, hc = [0, by + 0.05, 0], arms = true, mouthY = -R * 0.2;
  if (sh === 'puff') {
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
  } else if (sh === 'moss') {
    P.add(sph([0, R * 0.7, 0], R * 0.72, c1, { k: 0 }));
    for (let i = 0; i < 14; i++) { const a = i * 2.4, e = ((i * 37) % 10) / 10; P.add(sph([Math.cos(a) * R * 0.62 * Math.sqrt(1 - e * e), R * 0.7 + e * R * 0.62, Math.sin(a) * R * 0.62 * Math.sqrt(1 - e * e)], R * 0.2, i % 2 ? c1 : mix(c1, K.c2, 0.3), { k: R * 0.08 })); }
    hc = [0, R * 0.7, 0]; arms = false; M.floating = false;
    for (let i = 0; i < 3; i++) K.prim(pv, PRIM.leaf, [0.45, 0.82, 0.32], [Math.cos(i * 2.1) * R * 0.25, R * 1.42, Math.sin(i * 2.1) * R * 0.25], [R * 0.25], [0.3, i * 2.1, 0.4], { outline: 0.6 });
  }
  const A = { y: hc[1], z0: R * 0.3, z1: -R * 0.4, w: R * 0.8, top: topFn(P), neck: [0, hc[1] + R * 0.6, 0], wingZ: -R * 0.2 };
  if (sh !== 'clam' && sh !== 'mushroom') backShapes(K, P, A);
  bodyPaints(K, P, A);
  const bj = K.joint(pv, [0, 0, 0]);
  M.body = K.add(bj, K.mesh(P, 'body'), { mat: M.glossy || Bl.glossy ? MAT.glossy : MAT.char, alpha: sh === 'jelly' || sh === 'slime' ? 0.88 : 1 });
  if (M.body_emis) M.body.emis = M.body_emis;
  if (sh === 'jelly' || sh === 'slime') M.body.transparent = true;
  const head = { part: P, R: R * (sh === 'drop' ? 0.75 : 0.7), c: hc, node: bj };
  M.head = null; M.headInfo = head;
  if (arms) for (const sx of [-1, 1]) {
    const AP = new Part([ell([0, -0.08, 0], [R * 0.2, R * 0.32, R * 0.2], c1, { k: 0 })]);
    const j = K.joint(pv, [sx * R * 0.85, hc[1] - R * 0.12, R * 0.15], [0, 0, sx * 0.7]); K.add(j, K.mesh(AP, 'small'));
    j.r0 = j.rot.slice(); M.arms.push(j);
  }
  if (sh !== 'clam' && sh !== 'mushroom') backNodes(K, M, pv, A); else backNodes(K, M, pv, { ...A, top: () => sh === 'mushroom' ? R * 0.9 : R * 0.2, w: R * 0.75 });
  M.tailBase = sh === 'ghost' ? null : [0, hc[1] - R * 0.4, -R * 0.75];
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
};
function planPlant(K, M, pv, Pl) {
  M.plan = 'plant';
  const s = K.st, c1 = K.c1, c2 = K.c2, kind = Pl.kind;
  const leaf = [0.42, 0.8, 0.32], stem = mix(leaf, [0.2, 0.4, 0.15], 0.3);
  const P = new Part();
  let headR = 0.32 * lerp(1.15, 1, s), hy, hz = 0.02, armsKind = 'leaf';
  if (kind === 'cactus') {
    // サボテン：縦長の柱＋腕（トゲつき）
    const h = lerp(0.75, 1.25, s), r = lerp(0.3, 0.34, s);
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
const TRT = { turtle: { k: 1 }, bigturtle: { k: 1.25, flat: 1 }, spiketurtle: { k: 1.15, spikes: 1 } };
function planTurtle(K, M, pv, Tt) {
  M.plan = 'turtle';
  const s = K.st, k = Tt.k;
  const shellCol = ['leaf', 'bush', 'tree'].includes(K.f.back) ? [0.6, 0.45, 0.28] : K.c2;
  const sw = lerp(0.44, 0.52, s) * k, sl = lerp(0.5, 0.62, s) * k, shY = lerp(0.4, 0.5, s) * (Tt.flat ? 1.1 : 1);
  const P = new Part([ell([0, shY, -0.04], [sw, lerp(0.28, 0.34, s) * (Tt.flat ? 0.85 : 1), sl], shellCol, { k: 0 })]);
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
  const hj = K.joint(pv, [0, shY + 0.02, sl * 0.95 + R * 0.1]);
  K.add(hj, K.mesh(head.part, 'head'));
  head.node = hj; M.head = hj; M.headInfo = head;
  backNodes(K, M, pv, { ...A, top: (z) => A.top(z) - 0.03, w: sw * 0.5 });
  M.tailBase = [0, shY - 0.15, -sl * 0.95];
  M.tailType = K.f.tail;
  M.anchor = A;
  M.eyeCfg = { dir: [0.5, 0.18, 0.85], size: 0.6 };
  return head;
}

// 姿の種類 → 作り方
const ARCH = {};
for (const [tbl, fn] of [[QA, planQuad], [BA, planBiped], [BRD, planBird], [FSH, planFish], [SRP, planSerpent], [BUG, planBug], [BLB, planBlob], [PLT, planPlant], [GLM, planGolem], [TRT, planTurtle]]) for (const k in tbl) ARCH[k] = { fn, p: tbl[k] };
// 設計表にない種の予備（体型ごと）
const ARCH_FALLBACK = { quad: 'cat', biped: 'kid', plant: 'bud', golem: 'rockman', bird: 'songbird', fish: 'goldfish', serpent: 'snake', bug: 'beetle', blob: 'puff', turtle: 'turtle', dragon: 'wyvern' };

// ---------------- 伝説：エンテイオウ（炎の王竜） ----------------
function planEnteiou(K, M, pv) {
  M.custom = true; M.dragon = true;
  const red = K.c1, gold = K.c2, dkred = mix(red, [0.12, 0.02, 0.04], 0.55), ivory = [1, 0.93, 0.74], horn = [0.28, 0.16, 0.14];
  const P = new Part([ell([0, 1.0, 0.32], [0.52, 0.56, 0.56], red, { k: 0, rot: [-0.18, 0, 0] })]);
  P.add(ell([0, 0.86, -0.45], [0.42, 0.45, 0.48], red, { k: 0.3 }));
  for (const s of [-1, 1]) P.add(ell([s * 0.42, 1.08, 0.32], [0.26, 0.32, 0.3], red, { k: 0.18 }));
  P.add(cap([0, 1.2, 0.55], [0, 1.52, 0.98], 0.34, 0.25, red, { k: 0.2 }));
  // 腹の金の鱗（帯）
  P.paint(ell([0, 0.7, 0.1], [0.36, 0.38, 0.85]), gold, 0.04);
  P.paint(cap([0, 1.05, 0.78], [0, 1.42, 1.05], 0.2, 0.15), gold, 0.04);
  for (let i = 0; i < 6; i++) P.paint(box([0, 0.62 + i * 0.02, 0.55 - i * 0.2], [0.5, 0.25, 0.012], 0, null, { rot: [0.5, 0, 0] }), mix(gold, [0.6, 0.25, 0.05], 0.45), 0.012);
  // 背中のトゲ
  const spine = [[0, 1.6, 0.85], [0, 1.52, 0.55], [0, 1.5, 0.2], [0, 1.4, -0.15], [0, 1.28, -0.45], [0, 1.15, -0.75]];
  spine.forEach((b, i) => { const L = 0.42 - Math.abs(i - 2) * 0.05; P.add(cap([b[0], b[1] - 0.15, b[2]], [b[0], b[1] + L, b[2] - L * 0.6], 0.13, 0.015, i % 2 ? horn : dkred, { k: 0.05 })); });
  // 肩の金の鎧
  for (const s of [-1, 1]) { P.add(ell([s * 0.5, 1.22, 0.36], [0.24, 0.16, 0.26], gold, { k: 0.04, rot: [0, 0, s * 0.5] })); P.add(cap([s * 0.58, 1.3, 0.36], [s * 0.82, 1.5, 0.28], 0.08, 0.01, ivory, { k: 0.03 })); }
  M.body = K.add(pv, K.mesh(P, 'body'));
  // 脚（太く・爪つき）
  const leg = (front) => {
    const len = front ? 0.82 : 0.72, lr = 0.17;
    const L = new Part([sph([0, 0, 0], lr * 1.6, red, { k: 0 })]);
    L.add(ell([0, -len * 0.22, front ? 0.02 : -0.04], [lr * 1.5, len * 0.32, lr * 1.6], red, { k: lr * 0.6 }));
    L.add(cap([0, -len * 0.35, 0.03], [0, -len * 0.82, front ? 0.02 : -0.06], lr * 1.15, lr * 0.95, red, { k: lr * 0.5 }));
    L.add(ell([0, -len + lr * 0.5, lr * 0.4], [lr * 1.35, lr * 0.62, lr * 1.6], dkred, { k: lr * 0.5 }));
    for (const x of [-1, 0, 1]) L.add(cap([x * lr * 0.7, -len + lr * 0.4, lr * 1.5], [x * lr * 0.85, -len + lr * 0.05, lr * 2.35], lr * 0.28, lr * 0.02, ivory, { k: lr * 0.12 }));
    L.paint(box([0, -len * 0.95, 0], [1, len * 0.15, 1], 0), dkred, 0.04);
    return K.mesh(L, 'limb');
  };
  const gF = leg(true), gH = leg(false);
  for (const [sx, front] of [[-1, 1], [1, 1], [-1, 0], [1, 0]]) { const top = front ? 0.82 : 0.72; const j = K.joint(pv, [sx * (front ? 0.4 : 0.34), top, front ? 0.42 : -0.5]); K.add(j, front ? gF : gH); j.len = top; M.legs.push(j); }
  // 頭（竜の顔・大きな角）
  const R = 0.3;
  const H = new Part([ell([0, 0, 0], [R * 1.0, R * 0.9, R * 1.1], red, { k: 0 })]);
  H.add(ell([0, -R * 0.2, R * 1.05], [R * 0.68, R * 0.55, R * 1.0], red, { k: R * 0.4 }));
  H.add(ell([0, -R * 0.62, R * 0.8], [R * 0.6, R * 0.32, R * 0.95], dkred, { k: R * 0.25 }));
  for (const s of [-1, 1]) {
    H.add(ell([s * R * 0.5, R * 0.38, R * 0.55], [R * 0.42, R * 0.2, R * 0.55], red, { k: R * 0.22, rot: [0, 0, s * 0.35] }));
    H.add(cap([s * R * 0.7, -R * 0.35, R * 0.1], [s * R * 1.25, -R * 0.2, -R * 0.55], R * 0.2, R * 0.02, gold, { k: R * 0.12 }));
  }
  H.paint(ell([0, -R * 0.75, R * 0.9], [R * 0.5, R * 0.2, R * 0.85]), gold, R * 0.06);
  for (const s of [-1, 1]) H.paint(sph([s * R * 0.22, R * 0.08, R * 2.0], R * 0.08), [0.2, 0.05, 0.05], R * 0.02);
  const head = { part: H, R, c: [0, R * 0.05, R * 0.2] };
  const hj = K.joint(pv, [0, 1.62, 1.12], [0.12, 0, 0]);
  K.add(hj, K.mesh(H, 'head'));
  head.node = hj; M.head = hj; M.headInfo = head;
  // 角：後ろへ大きく反る2本＋小さい2本＋鼻先の角
  const HP = new Part();
  const sweep = (s, base, segs, len, rad, up, out) => { let prev = base; for (let i = 1; i <= segs; i++) { const t = i / segs; const p = [base[0] + s * out * len * t, base[1] + Math.sin(t * Math.PI * 0.55) * up * len, base[2] - len * t]; HP.add(cap(prev, p, rad * (1 - (i - 1) / segs * 0.85), rad * (1 - i / segs * 0.92), i > segs - 2 ? ivory : horn, { k: rad * 0.2 })); prev = p; } };
  for (const s of [-1, 1]) { sweep(s, [s * R * 0.45, R * 0.6, -R * 0.1], 6, R * 3.0, R * 0.32, 0.75, 0.3); sweep(s, [s * R * 0.78, R * 0.12, -R * 0.15], 4, R * 1.5, R * 0.2, 0.25, 0.55); }
  HP.add(cap([0, R * 0.2, R * 1.75], [0, R * 0.75, R * 1.65], R * 0.16, R * 0.02, ivory, { k: R * 0.08 }));
  K.add(hj, K.mesh(HP, 'small'), { mat: MAT.glossy });
  // 目（光る）・キバ
  addEyes(K, M, head, { dir: [0.55, 0.42, 0.72], size: 0.42, style: 'sharp', iris: [1, 0.62, 0.08], glow: true });
  const FP = new Part();
  for (const s of [-1, 1]) for (let i = 0; i < 3; i++) FP.add(cap([s * R * (0.42 - i * 0.08), -R * 0.42, R * (1.3 + i * 0.22)], [s * R * (0.42 - i * 0.08), -R * 0.78, R * (1.32 + i * 0.22)], R * 0.07, R * 0.01, WHITE, { k: 0.005 }));
  K.add(hj, K.mesh(FP, 'tiny'), { mat: MAT.glossy, outline: 0.5 });
  // 王冠（角の間）
  K.prim(hj, PRIM.gem, [1, 0.25, 0.2], [0, R * 0.95, R * 0.35], [R * 0.13, R * 0.2, R * 0.13], [Math.PI / 2 - 0.4, 0, 0], { emis: [0.5, 0.08, 0.05], mat: MAT.glossy, outline: 0.6 });
  // 炎のたてがみ
  for (let i = 0; i < 9; i++) { const a = (i / 8 - 0.5) * Math.PI * 1.1; addFlame(K, M, pv, [Math.sin(a) * 0.36, 1.48 + Math.cos(a) * 0.16, 0.78 - Math.abs(a) * 0.12], 1.25 - Math.abs(a) * 0.25, [-0.9, 0, -a * 0.9]); }
  // 翼
  addWings(K, M, pv, { y: 1.3, z0: 0.4, z1: -0.4, w: 0.42, top: () => 1.45, wingZ: 0.15 });
  // 尻尾（太く、先に炎）
  const tip = tailChain(K, M, pv, [0, 0.95, -0.85], 5, 0.27, 0.2, red, 2.0, 0.12, 0, null, 0.7);
  addFlame(K, M, tip, [0, 0.05, 0], 2.4, [Math.PI, 0, 0]);
  M.orb = K.prim(pv, PRIM.gem, [1, 0.55, 0.15], [0, 1.18, 0.9], [0.09, 0.14, 0.09], [Math.PI / 2, 0, 0], { emis: [0.6, 0.3, 0.05], mat: MAT.glossy, outline: 0.5 });
  M.anchor = { y: 1.0, z0: 0.6, z1: -0.6, w: 0.5, top: () => 1.5, neck: [0, 1.4, 0.85] };
  return head;
}

// ---------------- 伝説：ナルメクシア（天海の龍） ----------------
function planNarumexia(K, M, pv) {
  M.custom = true; M.floating = true; M.serpentine = true;
  const blue = K.c1, white = K.c2, cyan = [0.45, 0.95, 1], deep = mix(blue, [0.02, 0.05, 0.25], 0.45);
  const N = 14;
  const pt = (t) => [Math.sin(t * Math.PI * 2.1) * 0.35, 1.55 - t * 0.6 + Math.sin(t * Math.PI * 2.6) * 0.32, 0.55 - t * 3.6];
  const finCol = mix(white, cyan, 0.45);
  const pts = [], rads = [];
  for (let i = 0; i < N; i++) { const t = i / (N - 1); pts.push(pt(t)); rads.push(lerp(0.36, 0.09, Math.pow(t, 0.85))); }
  for (let i = 0; i < N; i++) {
    const r = rads[i], p = pts[i];
    const SP = new Part([sph([0, 0, 0], r, blue, { k: 0 })]);
    if (i < N - 1) {
      const q = pts[i + 1], d = [q[0] - p[0], q[1] - p[1], q[2] - p[2]], r2 = rads[i + 1];
      SP.add(cap([0, 0, 0], d, r, r2, blue, { k: r * 0.3 }));
      SP.paint(cap([0, -r * 0.62, 0], [d[0], d[1] - r2 * 0.62, d[2]], r * 0.72, r2 * 0.72), white, r * 0.08);
      SP.add(cap([d[0] * 0.5, d[1] * 0.5 + r * 0.7, d[2] * 0.5], [d[0] * 0.5, d[1] * 0.5 + r * 1.7, d[2] * 0.5 - r * 1.1], r * 0.38, r * 0.02, finCol, { k: r * 0.12, sc: [0.3, 1, 1], pv: [d[0] * 0.5, d[1] * 0.5 + r * 0.7, d[2] * 0.5] }));
      for (let k = 1; k < 3; k++) SP.paint(sph([d[0] * k / 3, d[1] * k / 3 + r * 0.55, d[2] * k / 3], r * 0.2), mix(blue, deep, 0.5), r * 0.05);
    } else SP.paint(ell([0, -r * 0.55, 0], [r * 0.95, r * 0.6, r * 1.2]), white, r * 0.08);
    const j = K.joint(pv, p);
    K.add(j, K.mesh(SP, 'limb'));
    if (i % 3 === 1) for (const s of [-1, 1]) K.prim(j, PRIM.sphereLo, cyan, [s * r * 0.86, r * 0.1, 0], [r * 0.18], null, { emis: [0.3, 0.7, 0.85], unlit: true, outline: 0 });
    j.base = j.pos.slice(); M.segs.push(j);
  }
  M.body = M.segs[1];
  // 頭：長い龍の顔・枝分かれした角・長いひげ
  const R = 0.36;
  const H = new Part([ell([0, 0, 0], [R * 0.95, R * 0.82, R * 1.05], blue, { k: 0 })]);
  H.add(ell([0, -R * 0.18, R * 1.0], [R * 0.6, R * 0.42, R * 0.95], blue, { k: R * 0.35 }));
  H.add(ell([0, -R * 0.5, R * 0.75], [R * 0.52, R * 0.22, R * 0.85], white, { k: R * 0.2 }));
  for (const s of [-1, 1]) H.add(ell([s * R * 0.42, R * 0.32, R * 0.6], [R * 0.36, R * 0.16, R * 0.5], blue, { k: R * 0.2, rot: [0, 0, s * 0.3] }));
  // 後頭部のひれ（流れるたてがみ）
  for (const s of [-1, 0, 1]) H.add(cap([s * R * 0.45, R * 0.25, -R * 0.4], [s * R * 1.1, R * 0.55, -R * 1.6], R * 0.35, R * 0.04, finCol, { k: R * 0.15, sc: [s ? 1 : 0.35, s ? 0.3 : 1, 1], pv: [s * R * 0.45, R * 0.25, -R * 0.4] }));
  H.paint(ell([0, -R * 0.55, R * 0.9], [R * 0.45, R * 0.2, R * 0.8]), white, R * 0.05);
  const head = { part: H, R, c: [0, R * 0.05, R * 0.2] };
  const p0 = pt(0);
  const hj = K.joint(pv, [p0[0], p0[1] + 0.32, p0[2] + 0.48], [-0.1, 0, 0]);
  K.add(hj, K.mesh(H, 'head'));
  head.node = hj; M.head = hj; M.headInfo = head;
  const HP = new Part();
  const antler = (s) => {
    const b = [s * R * 0.4, R * 0.55, -R * 0.1], t1 = [s * R * 0.9, R * 1.9, -R * 0.9];
    HP.add(cap(b, t1, R * 0.13, R * 0.06, [0.92, 0.97, 1], { k: R * 0.04 }));
    const m = [lerp(b[0], t1[0], 0.45), lerp(b[1], t1[1], 0.45), lerp(b[2], t1[2], 0.45)];
    HP.add(cap(m, [s * R * 1.35, R * 1.3, -R * 0.25], R * 0.08, R * 0.04, [0.92, 0.97, 1], { k: R * 0.03 }));
    HP.add(cap([lerp(b[0], t1[0], 0.75), lerp(b[1], t1[1], 0.75), lerp(b[2], t1[2], 0.75)], [s * R * 0.55, R * 2.05, -R * 0.35], R * 0.07, R * 0.04, [0.92, 0.97, 1], { k: R * 0.03 }));
  };
  antler(-1); antler(1);
  K.add(hj, K.mesh(HP, 'tiny'), { mat: MAT.glossy, emis: [0.05, 0.1, 0.15] });
  // ひげ（長くなびく）
  for (const s of [-1, 1]) {
    const wj = K.joint(hj, [s * R * 0.45, -R * 0.25, R * 1.55], [0.2, s * 0.6, 0]);
    const W = new Part([cap([0, 0, 0], [s * R * 0.6, -R * 0.2, -R * 1.2], R * 0.06, R * 0.04, cyan, { k: 0 }), cap([s * R * 0.6, -R * 0.2, -R * 1.2], [s * R * 1.0, -R * 0.6, -R * 2.6], R * 0.04, R * 0.012, cyan, { k: R * 0.03 })]);
    K.add(wj, K.mesh(W, 'tiny'), { emis: [0.15, 0.35, 0.45] });
    wj.r0 = wj.rot.slice(); wj.side = s; M.ears.push(wj);
  }
  addEyes(K, M, head, { dir: [0.58, 0.42, 0.72], size: 0.4, style: 'sharp', iris: [0.3, 0.95, 1], glow: true });
  K.prim(hj, PRIM.gem, [0.5, 1, 1], [0, R * 0.62, R * 0.55], [R * 0.12, R * 0.18, R * 0.12], [Math.PI / 2 - 0.5, 0, 0], { emis: [0.2, 0.6, 0.7], mat: MAT.glossy, outline: 0.6 });
  // ひれの翼（2対）
  const finWing = (seg, s, span, lift) => {
    const j = K.joint(M.segs[seg], [s * 0.2, 0.08, 0], [0, 0, 0]);
    const w = span, rays = [[s * w * 1.0, w * (0.55 + lift), -w * 0.15], [s * w * 1.1, w * (0.2 + lift), -w * 0.55], [s * w * 0.85, w * (-0.05 + lift), -w * 0.85], [s * w * 0.45, -w * 0.12, -w * 0.85]];
    const B = new Part([sph([0, 0, 0], w * 0.08, blue, { k: 0 })]);
    for (const t of rays) B.add(cap([0, 0, 0], t, w * 0.045, w * 0.022, mix(cyan, WHITE, 0.4), { k: w * 0.02 }));
    K.add(j, K.mesh(B, 'tiny'));
    const g = new GeoBuilder();
    const tri = (a, b, c, col) => { g.quad(a, b, c, c, col); g.quad(a, c, b, b, col); };
    const o = [0, 0, 0];
    for (let i = 0; i < rays.length - 1; i++) {
      const a = rays[i], b = rays[i + 1];
      const mid = [(a[0] + b[0]) / 2 * 0.86, (a[1] + b[1]) / 2 * 0.86, (a[2] + b[2]) / 2 * 0.86];
      tri(o, a, mid, mix(cyan, white, 0.2)); tri(o, mid, b, mix(cyan, blue, 0.25));
    }
    const mem = K.add(j, g.build(), { alpha: 0.9, emis: [0.1, 0.24, 0.32], outline: 0 }); mem.doubleSide = true; mem.transparent = true;
    j.side = s; M.wings.push(j);
  };
  for (const s of [-1, 1]) { finWing(1, s, 1.25, 0.1); finWing(5, s, 0.8, 0); }
  // 尾びれ
  const TP = new Part();
  for (const sy of [-1, 1]) TP.add(cap([0, 0, 0], [sy * 0.18, sy * 0.5, -0.75], 0.2, 0.04, finCol, { k: 0.04, sc: [0.3, 1, 1], pv: [0, 0, 0] }));
  const tj = K.joint(M.segs[N - 1], [0, 0, -0.1]); K.add(tj, K.mesh(TP, 'small'), { emis: [0.05, 0.14, 0.2] }); M.tails.push(tj);
  M.orb = K.prim(pv, PRIM.gem, cyan, [p0[0], p0[1] - 0.1, p0[2] + 0.3], [0.08, 0.13, 0.08], [Math.PI / 2, 0, 0], { emis: [0.3, 0.7, 0.8], mat: MAT.glossy, outline: 0.5 });
  M.anchor = { y: 1.3, z0: 0.4, z1: -0.6, w: 0.36, top: () => 1.7, neck: [0, 1.6, 0.6] };
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
    const P = new Part([box([0, -A.w * 1.3, -A.w * 0.05], [A.w * 1.15, A.w * 1.3, A.w * 0.05], A.w * 0.04, [0.78, 0.15, 0.25], { k: 0 })]);
    P.paint(box([0, -A.w * 1.3, A.w * 0.03], [A.w * 1.1, A.w * 1.25, A.w * 0.03], 0), [0.95, 0.82, 0.3], A.w * 0.03);
    K.add(cp, K.mesh(P, 'small')); M.cape = cp;
  }
  if (ex.has('star')) { const z = A.z0 + A.w * 0.5; K.prim(pv, PRIM.star, [1, 0.95, 0.4], [0, A.y, z + A.w * 0.55], [A.w * 0.35], null, { emis: [0.5, 0.45, 0.1], unlit: true, outline: 0 }).doubleSide = true; }
  if (ex.has('lantern')) { const t = A.top((A.z0 + A.z1) / 2); const j = K.joint(pv, [0, t + A.w * 0.1, (A.z0 + A.z1) / 2]); K.prim(j, PRIM.box, [0.3, 0.22, 0.18], [0, A.w * 0.6, 0], [A.w * 0.6, A.w * 0.12, A.w * 0.6]); K.prim(j, PRIM.sphereHi, [1, 0.78, 0.3], [0, A.w * 0.3, 0], [A.w * 0.32], null, { emis: [0.9, 0.5, 0.1], outline: 0.5 }); }
  if (ex.has('sunball')) K.prim(pv, PRIM.sphereHi, [1, 0.65, 0.18], [0, A.y - A.w * 0.2, A.z0 + A.w * 1.2], [A.w * 0.6], null, { emis: [0.85, 0.4, 0.05], outline: 0.6 });
  if (ex.has('bubbles')) for (let i = 0; i < 5; i++) K.prim(pv, PRIM.sphereHi, [0.8, 0.95, 1], [Math.sin(i * 2) * A.w * 2, A.y + A.w * (0.5 + i * 0.4), Math.cos(i * 2) * A.w * 1.6], [A.w * (0.18 + (i % 3) * 0.06)], null, { alpha: 0.45, mat: MAT.glossy, outline: 0 }).noDepthWrite = true;
  if (ex.has('glow')) M.body && (M.body.emis = K.glow.map(v => v * 0.14));
  if (ex.has('tentacles')) for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; tailChain(K, M, pv, [Math.cos(a) * A.w * 0.85, A.y - A.w * 0.75, (A.z0 + A.z1) / 2 + Math.sin(a) * A.w * 0.85], 3, A.w * 0.5, A.w * 0.13, K.c2, 0.25 * Math.cos(a), 0.18, 0, null, 0.6); }
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
  const legendPlan = sp.name === 'エンテイオウ' ? planEnteiou : sp.name === 'ナルメクシア' ? planNarumexia : null;
  let head;
  if (legendPlan) head = legendPlan(K, M, pivot);
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
  if (sp.legend) M.size = sp.scale || 1;
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
  M.bodyScale = D.s || 1;
  M.small = (D.s || 1) < 0.8 && !sp.legend;
  return M;
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
  const fold = plan === 'bird' && !M.floating && state !== 'fly' && !battle && state !== 'happy' && state !== 'roar';
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
  if (M.pincers) M.pincers.forEach((pc, i) => { pc.rot[0] = Math.sin(t * (battle ? 6 : 2) + i) * 0.15; });
}



// ---------------- 人物（アニメ調・3頭身。なめらかな体と髪、表面に貼った瞳） ----------------
export const SKIN = ['#ffe3cf', '#f8cfae', '#e3ab80', '#bd7f56', '#8c5838', '#5e3b25'];
export const HAIR_COL = ['#2a1e1a', '#5a3a22', '#a8642a', '#e8c060', '#e8e8f0', '#d04040', '#3a6ad0', '#4ab070', '#d070c0', '#7a5ad0'];
export const CLOTH = ['#e04848', '#3a7ae0', '#48b060', '#f0b030', '#9050d0', '#2a2a36', '#ffffff', '#f07ab0', '#30b0b0', '#8a5a3a'];
export const HAIR_STYLES = ['short', 'spiky', 'long', 'ponytail', 'bob', 'buzz'];
export const HAIR_JA = { short: 'ショート', spiky: 'ツンツン', long: 'ロング', ponytail: 'ポニーテール', bob: 'ボブ', buzz: 'ぼうず' };
export const HATS = ['none', 'cap', 'beanie', 'hat'];
export const HAT_JA = { none: 'なし', cap: 'キャップ', beanie: 'ニット帽', hat: 'ぼうし' };
export const BOTTOMS = ['pants', 'shorts', 'skirt'];
export const BOTTOM_JA = { pants: 'ズボン', shorts: '短パン', skirt: 'スカート' };

export function defaultLook() {
  return { skin: 0, hair: 'short', hairCol: 0, shirt: 0, pants: 5, shoes: 6, hat: 'cap', hatCol: 0, bottom: 'pants' };
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
  const trim = lum(shirt) > 0.75 ? [0.3, 0.45, 0.85] : mix(shirt, WHITE, 0.6);
  const root = new Node(), pivot = new Node(); root.add(pivot);
  const H = { root, pivot, legs: [], arms: [], t: 0, eyes: [], blink: 2 };
  const K = { q, add: Kit.prototype.add, joint: Kit.prototype.joint, prim: Kit.prototype.prim, mesh(part, cell) { return part.mesh(cell * q); } };
  const hipY = 0.72;
  // 脚（太もも・すね・くつ）
  const LP = new Part([sph([0, 0, 0], 0.13, pants, { k: 0 })]);
  LP.add(cap([0, 0, 0], [0, -0.34, 0.02], 0.12, 0.1, look.bottom === 'pants' ? pants : (look.bottom === 'shorts' ? pants : skin), { k: 0.05 }));
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
  else B.add(ell([0, hipY + 0.04, 0], [0.23, 0.13, 0.17], pants, { k: 0.05 }));
  B.paint(tor([0, hipY + 0.6, 0.02], 0.12, 0.035, trim, { rot: [0.25, 0, 0] }), trim, 0.01);
  if (look.bottom !== 'skirt') B.paint(tor([0, hipY + 0.12, 0], 0.235, 0.03, [0.3, 0.2, 0.15]), [0.32, 0.22, 0.16], 0.01);
  // リュック
  B.add(box([0, hipY + 0.34, -0.22], [0.17, 0.2, 0.08], 0.06, [0.62, 0.4, 0.24], { k: 0.02 }));
  B.paint(box([0, hipY + 0.27, -0.3], [0.13, 0.06, 0.03], 0.02), [0.78, 0.55, 0.32], 0.01);
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
  const iris = mix(hairC, [0.15, 0.32, 0.75], 0.45);
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
  // 髪
  const hs = look.hair;
  const HR = new Part([]);
  if (hs === 'buzz') HR.add(ell([0, R * 0.16, -R * 0.06], [R * 1.04, R * 0.86, R * 1.02], hairC, { k: 0 }));
  else {
    HR.add(ell([0, R * 0.2, -R * 0.08], look.hat !== 'none' ? [R * 1.06, R * 0.82, R * 1.04] : [R * 1.1, R * 0.95, R * 1.08], hairC, { k: 0 }));
    // 前髪の房
    const by = look.hat !== 'none' ? R * 0.5 : R * 0.75;
    for (let i = -2; i <= 2; i++) { const x = i * R * 0.3; HR.add(cap([x * 0.9, by, R * 0.55], [x * 1.05 + (i ? Math.sign(i) * R * 0.08 : 0), R * (0.28 + Math.abs(i) * 0.06), R * (0.95 - Math.abs(i) * 0.1)], R * 0.2, R * 0.03, hairC, { k: R * 0.12 })); }
    // もみあげ
    for (const s of [-1, 1]) HR.add(cap([s * R * 0.92, R * 0.3, R * 0.1], [s * R * 0.95, -R * 0.42, R * 0.25], R * 0.18, R * 0.04, hairC, { k: R * 0.12 }));
  }
  if (hs === 'spiky') for (let i = 0; i < 7; i++) { const a = Math.PI * (0.05 + i / 6 * 0.9); const cx = Math.cos(a), sz = Math.sin(a); HR.add(cap([cx * R * 0.45, R * 0.75, -sz * R * 0.1], [cx * R * 1.15, R * (1.05 + sz * 0.35), -R * (0.35 + sz * 0.55)], R * 0.34, R * 0.03, hairC, { k: R * 0.14 })); }
  if (hs === 'short') HR.add(cap([R * 0.1, R * 0.95, R * 0.1], [R * 0.25, R * 1.3, R * 0.25], R * 0.08, R * 0.01, hairC, { k: R * 0.05 }));
  if (hs === 'long') { HR.add(cap([0, R * 0.2, -R * 0.5], [0, -R * 1.5, -R * 0.55], R * 0.95, R * 0.7, hairC, { k: R * 0.2, sc: [1, 1, 0.6], pv: [0, 0, -R * 0.5] })); for (const s of [-1, 1]) HR.add(cap([s * R * 0.85, 0, R * 0.05], [s * R * 0.8, -R * 1.25, R * 0.05], R * 0.22, R * 0.12, hairC, { k: R * 0.1 })); }
  if (hs === 'bob') HR.add(ell([0, -R * 0.08, -R * 0.24], [R * 1.18, R * 0.85, R * 1.0], hairC, { k: R * 0.15 }));
  if (look.hat !== 'none') HR.shapes = HR.shapes.filter((sh, k) => k === 0 || sh.c?.[1] < R * 0.9 || sh.a?.[1] < R * 0.9);
  K.add(hj, HR.mesh(0.022 * q));
  if (hs === 'ponytail') {
    const pt = K.joint(hj, [0, R * 0.25, -R * 1.02], [0.45, 0, 0]);
    const PP = new Part([sph([0, 0, 0], R * 0.18, hairC, { k: 0 }), cap([0, 0, -R * 0.05], [0, -R * 1.1, -R * 0.2], R * 0.28, R * 0.06, hairC, { k: R * 0.1 })]);
    PP.paint(sph([0, 0, 0], R * 0.2), mix(hatC, [1, 0.3, 0.4], 0.5), R * 0.02);
    K.add(pt, PP.mesh(0.024 * q));
    H.pony = pt;
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
  if (look.hat === 'hat') {
    const CP = new Part([ell([0, R * 0.5, 0], [R * 1.6, R * 0.11, R * 1.6], hatC, { k: 0 }), cap([0, R * 0.5, 0], [0, R * 1.15, 0], R * 0.98, R * 0.9, hatC, { k: R * 0.08 })]);
    CP.paint(box([0, R * 0.64, 0], [R * 1.2, R * 0.09, R * 1.2], 0), [0.9, 0.25, 0.25], R * 0.02);
    K.add(hj, CP.mesh(0.024 * q));
  }
  pivot.setScale(1.05);
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
  for (const k of ['pivot', 'legs', 'arms', 'head', 'eyes', 'pony']) s[k] = H[k];
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
  if (H.head) H.head.rot[1] = walk ? 0 : Math.sin(t * 0.7) * 0.12;
  H.blink -= dt;
  const bl = H.blink < 0 ? (H.blink < -0.13 ? (H.blink = 2.5 + Math.random() * 3, 1) : 0.12) : 1;
  for (const g of H.eyes) g.scl[1] = g.base[1] * bl;
}

export function randomLook(r) {
  return {
    skin: Math.floor(r() * 4), hair: HAIR_STYLES[Math.floor(r() * HAIR_STYLES.length)], hairCol: Math.floor(r() * HAIR_COL.length),
    shirt: Math.floor(r() * CLOTH.length), pants: Math.floor(r() * CLOTH.length), shoes: Math.floor(r() * CLOTH.length),
    hat: r() < 0.6 ? 'none' : HATS[1 + Math.floor(r() * 3)], hatCol: Math.floor(r() * CLOTH.length), bottom: BOTTOMS[Math.floor(r() * 3)],
  };
}
