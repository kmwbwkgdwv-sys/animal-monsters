// アニモンの顔写真（アイコン）を小さなキャンバスに描いて画像化
import { Renderer, Scene, Camera, Node, PRIM, initPrims } from '../engine/gl3d.js';
import { buildAnimon, animateAnimon, buildHuman, animateHuman } from './models.js';

let R = null, cv = null;
const cache = new Map();
const queue = [];
let busy = false;

function ensure() {
  if (R) return;
  initPrims();
  cv = document.createElement('canvas'); cv.width = 192; cv.height = 192;
  R = new Renderer(cv, { alpha: true, preserve: true, antialias: true });
  R.setSize(192, 192, 1);
}
function render(spId, shiny, sil) {
  ensure();
  const S = new Scene(); S.bg = [0, 0, 0]; S.bgAlpha = 0; S.fogNear = 900; S.fogFar = 1000;
  const M = buildAnimon(spId, shiny);
  animateAnimon(M, 0.4, 'idle');
  M.root.rot[1] = 0.55;
  if (sil) M.root.traverse(n => { if (n.geo) { n.color = [0.08, 0.1, 0.18, 1]; n.unlit = true; n.emis = [0, 0, 0]; } });
  S.add(M.root);
  const C = new Camera(30);
  const h = M.height;
  const w = M.plan === 'serpent' || M.plan === 'leviathan' || M.plan === 'dragon' ? 1.25 : 1;
  const d = Math.max(h, 1.2 * M.size * w) * 2.3 + 0.6;
  C.pos = [0, h * 0.65 + d * 0.22, d]; C.target = [0, h * 0.42, -0.1 * M.size];
  R.render(S, C);
  return cv.toDataURL('image/png');
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
export const BLANK = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

// 人物のプレビュー（キャラ作成用）
export class HumanPreview {
  constructor(canvas) {
    initPrims();
    this.cv = canvas; this.R = new Renderer(canvas, { alpha: true });
    this.S = new Scene(); this.S.bg = [0, 0, 0]; this.S.bgAlpha = 0; this.S.fogNear = 500; this.S.fogFar = 600;
    const g = new Node(PRIM.disc, { color: [0.3, 0.5, 0.85] }); g.setScale(1.6, 1, 1.6); this.S.add(g);
    this.C = new Camera(30); this.C.pos = [0, 1.6, 6.2]; this.C.target = [0, 1.05, 0];
    this.H = null; this.ry = 0; this.alive = true;
    const loop = () => { if (!this.alive) return; this.frame(); requestAnimationFrame(loop); };
    requestAnimationFrame(loop);
  }
  setLook(look) { if (this.H) this.S.root.remove(this.H.root); this.H = buildHuman(look); this.S.add(this.H.root); }
  frame() {
    const r = this.cv.getBoundingClientRect();
    if (!r.width) return;
    this.R.setSize(r.width, r.height, Math.min(2, window.devicePixelRatio || 1));
    this.ry += 0.012; if (this.H) { this.H.root.rot[1] = Math.sin(this.ry) * 0.9; animateHuman(this.H, 1 / 60, 'idle'); }
    this.R.render(this.S, this.C);
  }
  dispose() { this.alive = false; const ext = this.R.gl.getExtension('WEBGL_lose_context'); if (ext) ext.loseContext(); }
}
