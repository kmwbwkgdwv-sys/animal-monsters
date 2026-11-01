// 入力（キーボード・タッチ）
import { $ } from './ui/ui.js';

export const Input = {
  mx: 0, mz: 0, run: false, runToggle: false, keys: new Set(), pressed: new Set(), touch: false,
  wheel: 0,
  camDX: 0, camDY: 0, // 視点を回す量（ドラッグした距離）
  edge(k) { if (this.pressed.has(k)) { this.pressed.delete(k); return true; } return false; },
  clearEdges() { this.pressed.clear(); },
};
const MAP = { KeyW: 'up', ArrowUp: 'up', KeyS: 'down', ArrowDown: 'down', KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right', ShiftLeft: 'run', ShiftRight: 'run', Space: 'a', Enter: 'a', KeyZ: 'a', KeyX: 'b', Backspace: 'b', Escape: 'menu', KeyM: 'map', Tab: 'menu', KeyR: 'ride', KeyQ: 'camL', KeyE: 'camR', KeyC: 'camReset', PageUp: 'camUp', PageDown: 'camDown' };

// 押しっぱなしの キーを ぜんぶ はなした ことにする（キーを はなした 合図を 取りこぼしても 歩きつづけないように）
let stickReset = null;
export function resetInput() {
  Input.keys.clear(); Input.pressed.clear(); Input.mx = Input.mz = 0;
  Input.tmx = Input.tmz = 0; Input.tmag = 0; Input.camDX = Input.camDY = 0;
  keyDownAt.clear();
  if (stickReset) stickReset();
}
const keyDownAt = new Map();   // キー → 最後に 押された（くり返し入力を ふくむ）時刻
const MOVE_KEYS = new Set(['up', 'down', 'left', 'right', 'run', 'camL', 'camR', 'camUp', 'camDown']);
const isField = (t) => t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
export function initInput() {
  window.addEventListener('keydown', (e) => {
    if (isField(e.target)) return;
    // 日本語入力（IME）の 変換中の キーは 移動に 使わない
    if (e.isComposing || e.keyCode === 229) return;
    // Mac の ⌘ を 押しながらの キーは はなした合図が 来ないので 移動に 使わない
    if (e.metaKey || e.ctrlKey || e.altKey) { if (MAP[e.code] && MOVE_KEYS.has(MAP[e.code])) return; }
    const k = MAP[e.code]; if (!k) return;
    if (!Input.keys.has(k)) Input.pressed.add(k);
    Input.keys.add(k); keyDownAt.set(k, performance.now());
    if (e.code === 'Tab' || e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
  });
  window.addEventListener('keyup', (e) => {
    const k = MAP[e.code]; if (k) { Input.keys.delete(k); keyDownAt.delete(k); }
    // ⌘・Ctrl・Alt を はなしたときは 念のため 移動キーを ぜんぶ はなす
    if (['MetaLeft', 'MetaRight', 'ControlLeft', 'ControlRight', 'AltLeft', 'AltRight', 'OSLeft', 'OSRight'].includes(e.code) || e.key === 'Meta') { for (const m of MOVE_KEYS) Input.keys.delete(m); }
  });
  window.addEventListener('blur', () => resetInput());
  document.addEventListener('visibilitychange', () => { if (document.hidden) resetInput(); });
  document.addEventListener('compositionstart', () => { for (const m of MOVE_KEYS) Input.keys.delete(m); });
  // 入力欄に 移ったら 移動キーは はなす
  document.addEventListener('focusin', (e) => { if (isField(e.target)) for (const m of MOVE_KEYS) Input.keys.delete(m); });
  // 念のため：ページが フォーカスを 失っているのに キーが 押されたままなら はなす
  setInterval(() => {
    if (!Input.keys.size) return;
    const now = performance.now();
    if (!document.hasFocus()) { for (const m of MOVE_KEYS) Input.keys.delete(m); return; }
    // 10秒以上 何の キー入力（くり返しを ふくむ）も 来ないまま 押されたまま なら はなした ことにする
    let last = 0; for (const t of keyDownAt.values()) last = Math.max(last, t);
    if (now - last > 10000) for (const m of MOVE_KEYS) Input.keys.delete(m);
  }, 500);
  window.addEventListener('wheel', (e) => { Input.wheel += Math.sign(e.deltaY); }, { passive: true });
  // マウスで画面をドラッグ → 視点を回す（左・右どちらのボタンでも）
  const game = $('#game');
  let mDrag = null;
  game.addEventListener('pointerdown', (e) => { if (e.pointerType === 'mouse') mDrag = { x: e.clientX, y: e.clientY }; });
  window.addEventListener('pointermove', (e) => {
    if (!mDrag || e.pointerType !== 'mouse') return;
    if (!e.buttons) { mDrag = null; return; }
    Input.camDX += e.clientX - mDrag.x; Input.camDY += e.clientY - mDrag.y; mDrag.x = e.clientX; mDrag.y = e.clientY;
  });
  window.addEventListener('pointerup', (e) => { if (e.pointerType === 'mouse') mDrag = null; });
  game.addEventListener('contextmenu', (e) => e.preventDefault());

  // タッチのジョイスティック
  const stick = $('#stick'), knob = $('#knob');
  // Rv：つまみが 動く はんい（見た目）／ R：最高速に なる たおし量（感度で 変わる）
  let sid = null, cx = 0, cy = 0, R = 60, Rv = 60, dead = 6;
  const set = (x, y) => {
    let dx = x - cx, dy = y - cy; const l = Math.hypot(dx, dy);
    const kv = l > Rv ? Rv / l : 1;
    knob.style.transform = `translate(${dx * kv}px, ${dy * kv}px)`;
    const m = Math.min(1, l / R);
    Input.tmx = l > dead ? dx / l * m : 0; Input.tmz = l > dead ? dy / l * m : 0; Input.tmag = l > dead ? m : 0;
  };
  stick.addEventListener('pointerdown', (e) => {
    Input.touch = true; sid = e.pointerId; stick.setPointerCapture(sid);
    // スティックの感度：高いほど 少し たおすだけで 速く 動く（あそびも 小さく）
    const k = Math.max(0.5, Math.min(2, (window.ANIMON && window.ANIMON.G.settings && window.ANIMON.G.settings.stickSens) || 1));
    const r = stick.getBoundingClientRect(); cx = r.left + r.width / 2; cy = r.top + r.height / 2; Rv = r.width * 0.42; R = Rv / k; dead = 6 / k; set(e.clientX, e.clientY);
  });
  stick.addEventListener('pointermove', (e) => { if (e.pointerId === sid) set(e.clientX, e.clientY); });
  const end = (e) => { if (e.pointerId !== sid) return; sid = null; knob.style.transform = ''; Input.tmx = Input.tmz = 0; Input.tmag = 0; };
  stick.addEventListener('pointerup', end); stick.addEventListener('pointercancel', end);
  // 指を はなした 合図を 取りこぼしたとき（バトルが 始まって スティックが 消えた など）も 止める
  stick.addEventListener('lostpointercapture', end);
  stickReset = () => { sid = null; knob.style.transform = ''; Input.tmx = Input.tmz = 0; Input.tmag = 0; };
  const btn = (id, k, hold = false) => {
    const b = $(id);
    b.addEventListener('pointerdown', (e) => { e.preventDefault(); Input.touch = true; Input.pressed.add(k); if (hold) Input.keys.add(k); });
    const up = () => { if (hold) Input.keys.delete(k); };
    b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up); b.addEventListener('pointerleave', up);
  };
  btn('#tA', 'a'); btn('#tRide', 'ride');
  // 会話が 出ているときは A ボタンでも 会話を 送れる
  $('#tA').addEventListener('pointerdown', () => { import('./ui/ui.js').then(m => { if (m.advance()) Input.pressed.delete('a'); }); });
  // ダッシュはタップで切り替え
  $('#tB').addEventListener('pointerdown', (e) => { e.preventDefault(); Input.runToggle = !Input.runToggle; $('#tB').classList.toggle('on', Input.runToggle); Input.pressed.add('b'); });
  // ピンチでズーム
  //  ・2本の指が両方とも「画面（3D表示）」に触れているときだけ反応する
  //    （スティックを動かしながら画面をタップしたときに、ズームしてしまわないように）
  //  ・すばやいタップの連打ではズームしない（指が一定時間・一定距離動いたときだけ）
  const onCanvas = new Map(); // identifier → {x, y}
  let pinch = null;
  const pinchDist = () => { const p = [...onCanvas.values()]; return Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y); };
  window.addEventListener('touchstart', (e) => {
    for (const t of e.changedTouches) if (t.target && t.target.id === 'game') onCanvas.set(t.identifier, { x: t.clientX, y: t.clientY, t0: performance.now() });
    pinch = onCanvas.size === 2 ? { d: pinchDist(), t0: performance.now(), moved: 0 } : null;
  }, { passive: true });
  window.addEventListener('touchmove', (e) => {
    for (const t of e.changedTouches) {
      const p = onCanvas.get(t.identifier); if (!p) continue;
      // 1本の指で画面をなぞる → 視点を回す
      if (onCanvas.size === 1) { Input.camDX += t.clientX - p.x; Input.camDY += t.clientY - p.y; }
      p.x = t.clientX; p.y = t.clientY;
    }
    if (!pinch || onCanvas.size !== 2) return;
    const d = pinchDist();
    // 指を置いてすぐ（連打）は無視。0.15秒以上かけて 40px 以上広げた・縮めたときだけ
    if (performance.now() - pinch.t0 < 150) { pinch.d = d; return; }
    if (Math.abs(d - pinch.d) > 40) { Input.wheel += d < pinch.d ? 1 : -1; pinch.d = d; }
  }, { passive: true });
  const tend = (e) => { for (const t of e.changedTouches) onCanvas.delete(t.identifier); if (onCanvas.size !== 2) pinch = null; };
  window.addEventListener('touchend', tend, { passive: true });
  window.addEventListener('touchcancel', tend, { passive: true });
  if ('ontouchstart' in window || navigator.maxTouchPoints > 0) Input.touch = true;
  guardZoom();
  fitViewport();
}

// ---------- スマホでの拡大・ずれ防止 ----------
// 連打（ダブルタップ）やピンチでブラウザごと拡大されないようにする
function guardZoom() {
  const isField = (t) => t && t.closest && t.closest('input, textarea, select');
  const isScroll = (t) => t && t.closest && t.closest('.screen, .body, .dexreg, .scrolly, .cmds, .tgt, #dialog .choices');
  const zoomed = () => window.visualViewport && window.visualViewport.scale > 1.01;
  let lastEnd = 0, lastX = 0, lastY = 0;
  document.addEventListener('touchend', (e) => {
    const now = performance.now();
    const t = e.changedTouches[0];
    const x = t ? t.clientX : 0, y = t ? t.clientY : 0;
    // 素早い2回目のタップ（ダブルタップ拡大）を止める。
    // ボタンの上でも止め、そのかわりにクリックをこちらで発生させて「連打」がちゃんと効くようにする
    if (!zoomed() && now - lastEnd < 400 && Math.hypot(x - lastX, y - lastY) < 40 && !isField(e.target) && e.cancelable) {
      e.preventDefault();
      const b = e.target.closest && e.target.closest('button, .mcard, .bcell, .dexcell, .tab, .tog, [data-tap]');
      if (b && !b.disabled) b.click();
    }
    lastEnd = now; lastX = x; lastY = y;
  }, { passive: false });
  document.addEventListener('dblclick', (e) => { if (!isField(e.target)) e.preventDefault(); }, { passive: false });
  // iOS Safari のピンチ拡大（もし拡大されてしまったら、元に戻すためのピンチは許可する）
  for (const ev of ['gesturestart', 'gesturechange', 'gestureend']) document.addEventListener(ev, (e) => { if (!zoomed()) e.preventDefault(); }, { passive: false });
  document.addEventListener('touchmove', (e) => {
    if (zoomed()) return;
    if (e.touches.length > 1) { e.preventDefault(); return; }
    // スクロールできない場所でページ全体が引っ張られないように
    if (!isScroll(e.target) && !isField(e.target)) e.preventDefault();
  }, { passive: false });
}

// 表示領域（キーボード表示時・ツールバーの出し入れ）に UI を合わせる
export function fitViewport() {
  const root = document.documentElement;
  const apply = () => {
    const vv = window.visualViewport;
    const h = vv ? Math.round(vv.height * (vv.scale || 1)) : window.innerHeight;
    root.style.setProperty('--app-h', Math.min(h, window.innerHeight) + 'px');
    root.style.setProperty('--app-top', (vv && vv.scale <= 1.01 ? Math.max(0, Math.round(vv.offsetTop)) : 0) + 'px');
    // 入力欄からフォーカスが外れたらページのずれを戻す
    if (!document.activeElement || !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) {
      if (window.scrollX || window.scrollY) window.scrollTo(0, 0);
    }
    // もし拡大されてしまったら元に戻す
    if (vv && vv.scale > 1.02) resetZoom();
  };
  apply();
  window.addEventListener('resize', apply);
  window.addEventListener('orientationchange', () => { for (const ms of [60, 300, 800, 1500]) setTimeout(apply, ms); });
  // 回転のあと 値が 古いまま 残ることがあるので、ときどき 確かめる
  setInterval(apply, 1000);
  if (window.visualViewport) { window.visualViewport.addEventListener('resize', apply); window.visualViewport.addEventListener('scroll', apply); }
  document.addEventListener('focusout', () => setTimeout(apply, 120));
}
let resetting = false;
function resetZoom() {
  if (resetting) return; resetting = true;
  const m = document.querySelector('meta[name=viewport]');
  if (!m) return;
  const base = 'width=device-width,initial-scale=1,viewport-fit=cover';
  m.setAttribute('content', base + ',maximum-scale=1.0001');
  setTimeout(() => { m.setAttribute('content', base + ',maximum-scale=1,user-scalable=no'); resetting = false; }, 60);
}
export function readMove() {
  let x = 0, z = 0;
  if (Input.keys.has('left')) x -= 1; if (Input.keys.has('right')) x += 1;
  if (Input.keys.has('up')) z -= 1; if (Input.keys.has('down')) z += 1;
  let mag = 1;
  if (!x && !z && (Input.tmx || Input.tmz)) { x = Input.tmx; z = Input.tmz; mag = Input.tmag; }
  const l = Math.hypot(x, z);
  if (l > 0) { x /= l; z /= l; }
  Input.mx = x; Input.mz = z;
  Input.run = Input.keys.has('run') || Input.runToggle;
  return { x, z, mag: l > 0 ? mag : 0 };
}
