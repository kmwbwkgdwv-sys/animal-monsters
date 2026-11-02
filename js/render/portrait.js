// アニモンの顔写真（アイコン）を小さなキャンバスに描いて画像化
import { Renderer, Scene, Camera, Node, PRIM, initPrims, treeBounds } from '../engine/gl3d.js';
import { buildAnimon, animateAnimon, buildHuman, animateHuman } from './models.js';

let R = null, cv = null;
const cache = new Map();
const queue = [];
let busy = false;

function ensure() {
  if (R) return;
  initPrims();
  cv = document.createElement('canvas'); cv.width = 192; cv.height = 192;
  R = new Renderer(cv, { alpha: true, preserve: true, antialias: true, shadowSize: 0 });
  R.setSize(192, 192, 1);
}
function render(spId, shiny, sil) {
  ensure();
  const S = new Scene(); S.bg = [0, 0, 0]; S.bgAlpha = 0; S.fogNear = 900; S.fogFar = 1000;
  const M = buildAnimon(spId, shiny, { lod: 'mid', noCache: true });
  animateAnimon(M, 0.4, 'idle');
  M.root.rot[1] = 0.55;
  if (sil) M.root.traverse(n => { if (n.geo) { n.color = [0.08, 0.1, 0.18, 1]; n.unlit = true; n.emis = [0, 0, 0]; } });
  S.add(M.root);
  const C = new Camera(30);
  // 実際の形の外接箱から、はみ出さないように写す（翼・しっぽ・宙に浮く種も）
  const b = treeBounds(M.root);
  const cx = (b[0] + b[3]) / 2, cy = (b[1] + b[4]) / 2, cz = (b[2] + b[5]) / 2;
  const ext = Math.max(b[4] - b[1], (b[3] - b[0]) * 0.86, 0.6);
  const d = ext * 0.5 / Math.tan(15 * Math.PI / 180) * 1.04 + (b[5] - b[2]) * 0.5;
  C.pos = [cx, cy + d * 0.2, cz + d]; C.target = [cx, cy - ext * 0.02, cz];
  R.render(S, C);
  return cv.toDataURL('image/png');
}
// ムービー用の大きな絵（512px）
let R2 = null, cv2 = null;
const bigCache = new Map();
export function bigPortrait(spId, state = 'idle') {
  const k = spId + state;
  if (bigCache.has(k)) return bigCache.get(k);
  initPrims();
  if (!R2) { cv2 = document.createElement('canvas'); cv2.width = cv2.height = 512; R2 = new Renderer(cv2, { alpha: true, preserve: true, antialias: true, shadowSize: 0 }); R2.setSize(512, 512, 1); }
  const S = new Scene(); S.bg = [0, 0, 0]; S.bgAlpha = 0; S.fogNear = 900; S.fogFar = 1000;
  const M = buildAnimon(spId, false, { noCache: true });
  animateAnimon(M, 0.5, state);
  M.root.rot[1] = 0.6;
  S.add(M.root);
  const C = new Camera(30);
  const b = treeBounds(M.root);
  const cx = (b[0] + b[3]) / 2, cy = (b[1] + b[4]) / 2, cz = (b[2] + b[5]) / 2;
  const ext = Math.max(b[4] - b[1], (b[3] - b[0]) * 0.86, 0.6);
  const d = ext * 0.5 / Math.tan(15 * Math.PI / 180) * 1.02 + (b[5] - b[2]) * 0.5;
  C.pos = [cx, cy + d * 0.12, cz + d]; C.target = [cx, cy, cz];
  R2.render(S, C);
  const url = cv2.toDataURL('image/png');
  bigCache.set(k, url);
  return url;
}
export function portrait(spId, shiny = false, sil = false) {
  const k = spId + (shiny ? 's' : '') + (sil ? 'x' : '');
  if (cache.has(k)) return cache.get(k);
  const url = render(spId, shiny, sil);
  cache.set(k, url);
  return url;
}
// 非同期で順番に作る（一覧画面用）
export function portraitAsync(spId, shiny, sil, cb) {
  const k = spId + (shiny ? 's' : '') + (sil ? 'x' : '');
  if (cache.has(k)) { cb(cache.get(k)); return; }
  queue.push({ spId, shiny, sil, cb });
  if (!busy) pump();
}
function pump() {
  busy = true;
  const t0 = performance.now();
  while (queue.length && performance.now() - t0 < 24) { const q = queue.shift(); q.cb(portrait(q.spId, q.shiny, q.sil)); }
  if (queue.length) requestAnimationFrame(pump); else busy = false;
}
export function clearPortraitQueue() { queue.length = 0; }
export function clearPortraitCache() { cache.clear(); bigCache.clear(); }
export const BLANK = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

// 人物のプレビュー（キャラ作成用）
export class HumanPreview {
  constructor(canvas) {
    initPrims();
    this.cv = canvas; this.R = new Renderer(canvas, { alpha: true, shadowSize: 0 });
    this.S = new Scene(); this.S.bg = [0, 0, 0]; this.S.bgAlpha = 0; this.S.fogNear = 500; this.S.fogFar = 600;
    const g = new Node(PRIM.disc, { color: [0.3, 0.5, 0.85] }); g.setScale(1.6, 1, 1.6); this.S.add(g);
    this.C = new Camera(30); this.C.pos = [0, 1.6, 6.2]; this.C.target = [0, 1.05, 0];
    this.H = null; this.ry = 0; this.yaw = 0; this.alive = true;
    const loop = () => { if (!this.alive) return; this.frame(); requestAnimationFrame(loop); };
    requestAnimationFrame(loop);
  }
  setLook(look) { if (this.H) this.S.root.remove(this.H.root); this.H = buildHuman(look); this.S.add(this.H.root); }
  frame() {
    const r = this.cv.getBoundingClientRect();
    if (!r.width) return;
    this.R.setSize(r.width, r.height, Math.min(2, window.devicePixelRatio || 1));
    this.ry += 0.012; if (this.H) { this.H.root.rot[1] = Math.sin(this.ry) * 0.6 + this.yaw; animateHuman(this.H, 1 / 60, 'idle'); }
    this.R.render(this.S, this.C);
  }
  dispose() { this.alive = false; const ext = this.R.gl.getExtension('WEBGL_lose_context'); if (ext) ext.loseContext(); }
}
