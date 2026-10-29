// 入力（キーボード・タッチ）
import { $ } from './ui/ui.js';

export const Input = {
  mx: 0, mz: 0, run: false, runToggle: false, keys: new Set(), pressed: new Set(), touch: false,
  wheel: 0,
  edge(k) { if (this.pressed.has(k)) { this.pressed.delete(k); return true; } return false; },
  clearEdges() { this.pressed.clear(); },
};
const MAP = { KeyW: 'up', ArrowUp: 'up', KeyS: 'down', ArrowDown: 'down', KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right', ShiftLeft: 'run', ShiftRight: 'run', Space: 'a', Enter: 'a', KeyZ: 'a', KeyE: 'a', KeyX: 'b', Backspace: 'b', Escape: 'menu', KeyM: 'map', Tab: 'menu', KeyR: 'ride', KeyQ: 'menu' };

export function initInput() {
  window.addEventListener('keydown', (e) => {
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA')) return;
    const k = MAP[e.code]; if (!k) return;
    if (!Input.keys.has(k)) Input.pressed.add(k);
    Input.keys.add(k);
    if (e.code === 'Tab' || e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
  });
  window.addEventListener('keyup', (e) => { const k = MAP[e.code]; if (k) Input.keys.delete(k); });
  window.addEventListener('blur', () => { Input.keys.clear(); Input.mx = Input.mz = 0; });
  window.addEventListener('wheel', (e) => { Input.wheel += Math.sign(e.deltaY); }, { passive: true });

  // タッチのジョイスティック
  const stick = $('#stick'), knob = $('#knob');
  let sid = null, cx = 0, cy = 0, R = 60;
  const set = (x, y) => {
    let dx = x - cx, dy = y - cy; const l = Math.hypot(dx, dy);
    if (l > R) { dx = dx / l * R; dy = dy / l * R; }
    knob.style.transform = `translate(${dx}px, ${dy}px)`;
    const m = Math.min(1, l / R);
    Input.tmx = l > 6 ? dx / R : 0; Input.tmz = l > 6 ? dy / R : 0; Input.tmag = m;
  };
  stick.addEventListener('pointerdown', (e) => {
    Input.touch = true; sid = e.pointerId; stick.setPointerCapture(sid);
    const r = stick.getBoundingClientRect(); cx = r.left + r.width / 2; cy = r.top + r.height / 2; R = r.width * 0.42; set(e.clientX, e.clientY);
  });
  stick.addEventListener('pointermove', (e) => { if (e.pointerId === sid) set(e.clientX, e.clientY); });
  const end = (e) => { if (e.pointerId !== sid) return; sid = null; knob.style.transform = ''; Input.tmx = Input.tmz = 0; Input.tmag = 0; };
  stick.addEventListener('pointerup', end); stick.addEventListener('pointercancel', end);
  const btn = (id, k, hold = false) => {
    const b = $(id);
    b.addEventListener('pointerdown', (e) => { e.preventDefault(); Input.touch = true; Input.pressed.add(k); if (hold) Input.keys.add(k); });
    const up = () => { if (hold) Input.keys.delete(k); };
    b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up); b.addEventListener('pointerleave', up);
  };
  btn('#tA', 'a'); btn('#tRide', 'ride');
  // ダッシュはタップで切り替え
  $('#tB').addEventListener('pointerdown', (e) => { e.preventDefault(); Input.runToggle = !Input.runToggle; $('#tB').classList.toggle('on', Input.runToggle); Input.pressed.add('b'); });
  // ピンチでズーム
  let pinch = null;
  window.addEventListener('touchstart', (e) => { if (e.touches.length === 2 && e.target.id === 'game') pinch = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY); }, { passive: true });
  window.addEventListener('touchmove', (e) => { if (pinch && e.touches.length === 2) { const d = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY); if (Math.abs(d - pinch) > 30) { Input.wheel += d < pinch ? 1 : -1; pinch = d; } } }, { passive: true });
  window.addEventListener('touchend', () => { pinch = null; }, { passive: true });
  if ('ontouchstart' in window || navigator.maxTouchPoints > 0) Input.touch = true;
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
