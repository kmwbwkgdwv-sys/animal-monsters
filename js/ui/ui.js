// UIの基本部品（会話・選択肢・トースト・画面）
import { audio } from '../audio.js';
import { bigPortrait } from '../render/portrait.js';

export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];
export function el(tag, cls = '', html = '') { const e = document.createElement(tag); if (cls) e.className = cls; if (html) e.innerHTML = html; return e; }
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const UI = {
  skipping: false, textSpeed: 1, vars: {}, inputLock: 0,
  fmt(s) { return String(s).replace(/\{(\w)\}/g, (m, k) => this.vars[k] ?? m); },
};

// ---- 会話 ----
let advanceFn = null;
export function advance() { if (advanceFn) { const f = advanceFn; f(); return true; } return false; }
export function sayLine(name, text) {
  return new Promise(res => {
    const d = $('#dialog');
    d.classList.remove('hidden');
    d.querySelector('.name').textContent = UI.fmt(name || '');
    const tEl = d.querySelector('.text');
    const full = UI.fmt(text);
    d.querySelector('.next').style.visibility = 'hidden';
    if (UI.skipping) { res(); return; }
    let i = 0, done = false;
    const speed = UI.textSpeed >= 2 ? 6 : UI.textSpeed === 0 ? 45 : 22;
    tEl.textContent = '';
    const timer = setInterval(() => {
      if (UI.skipping) { finish(); return; }
      i += 1; tEl.textContent = full.slice(0, i);
      if (i >= full.length) { clearInterval(timer); done = true; d.querySelector('.next').style.visibility = 'visible'; }
    }, speed);
    const finish = () => { clearInterval(timer); tEl.textContent = full; advanceFn = null; res(); };
    advanceFn = () => {
      if (!done) { clearInterval(timer); tEl.textContent = full; done = true; d.querySelector('.next').style.visibility = 'visible'; return; }
      audio.sfx('select'); finish();
    };
  });
}
export function hideDialog() { $('#dialog').classList.add('hidden'); advanceFn = null; }
export async function say(lines) {
  if (typeof lines === 'string') lines = [lines];
  for (const l of lines) {
    if (UI.skipping) break;
    const [n, t] = l.includes('|') ? l.split('|') : ['', l];
    await sayLine(n, t);
  }
  hideDialog();
}
// 選択肢付きの質問
export function ask(text, options, name = '') {
  return new Promise(res => {
    const d = $('#dialog');
    d.classList.remove('hidden');
    d.querySelector('.name').textContent = UI.fmt(name);
    d.querySelector('.text').textContent = UI.fmt(text);
    d.querySelector('.next').style.visibility = 'hidden';
    const box = el('div', 'choices');
    options.forEach((o, i) => {
      const b = el('button', 'btn' + (i === 0 ? ' pri' : ''), esc(o));
      b.onclick = (e) => { e.stopPropagation(); audio.sfx('select'); box.remove(); hideDialog(); res(i); };
      box.appendChild(b);
    });
    d.appendChild(box);
    advanceFn = null;
  });
}
export const confirmBox = async (text, yes = 'はい', no = 'いいえ') => (await ask(text, [yes, no])) === 0;

export function toast(text, ms = 2200) {
  const t = el('div', '', esc(text));
  $('#toast').appendChild(t);
  setTimeout(() => t.remove(), ms);
}
export function inputText(title, def = '', max = 10) {
  return new Promise(res => {
    const s = openScreen(title, { noClose: true, cls: 'inputscr' });
    // 画面上部に入力欄とボタンを並べる（スマホのキーボードで隠れないように）
    s.body.innerHTML = `<div class="card inputcard"><input class="textin" maxlength="${max}" value="${esc(def)}" enterkeyhint="done" autocomplete="off"><div class="row btns"><button class="btn cancel">やめる</button><button class="btn pri ok">けってい</button></div><div class="muted hint">キーボードの「完了」を押したあと「けってい」を押してください</div></div>`;
    const inp = s.body.querySelector('input');
    // スマホではキーボードを自動で出さない（タップしたときに出す）
    if (!matchMedia('(pointer: coarse)').matches) setTimeout(() => { inp.focus(); inp.select(); }, 50);
    let fin = false;
    const done = (v) => { if (fin) return; fin = true; inp.blur(); window.scrollTo(0, 0); s.close(); res(v); };
    s.body.querySelector('.ok').onclick = () => done(inp.value.trim());
    s.body.querySelector('.cancel').onclick = () => done(null);
    inp.onkeydown = (e) => { e.stopPropagation(); if (e.key === 'Enter') done(inp.value.trim()); };
    inp.addEventListener('blur', () => setTimeout(() => window.scrollTo(0, 0), 60));
  });
}

// ---- 全画面パネル ----
const stack = [];
export function openScreen(title, opts = {}) {
  const s = el('div', 'screen' + (opts.cls ? ' ' + opts.cls : ''));
  s.innerHTML = `<div class="head"><h2>${esc(title)}</h2>${opts.extra || ''}${opts.noClose ? '' : '<button class="close">とじる</button>'}</div><div class="body"></div>`;
  $('#screens').appendChild(s);
  const api = { el: s, body: s.querySelector('.body'), head: s.querySelector('.head'), closed: false, onClose: null };
  api.close = () => { if (api.closed) return; api.closed = true; s.remove(); const i = stack.indexOf(api); if (i >= 0) stack.splice(i, 1); if (api.onClose) api.onClose(); };
  const cb = s.querySelector('.close'); if (cb) cb.onclick = () => { audio.sfx('cancel'); api.close(); };
  stack.push(api);
  return api;
}
export function topScreen() { return stack[stack.length - 1] || null; }
export function screenCount() { return stack.length; }
export function closeAllScreens() { while (stack.length) stack[stack.length - 1].close(); }

// ---- 演出 ----
export function fade(on, ms = 500) { const f = $('#fade'); f.style.transitionDuration = ms + 'ms'; f.style.opacity = on ? 1 : 0; return new Promise(r => setTimeout(r, ms)); }
export function flash(ms = 250) { const f = $('#flash'); f.style.transitionDuration = '0ms'; f.style.opacity = 1; requestAnimationFrame(() => { f.style.transitionDuration = ms + 'ms'; f.style.opacity = 0; }); return new Promise(r => setTimeout(r, ms)); }
export function letterbox(on) { $('#letterbox').classList.toggle('on', on); }
export function narrate(text, pics = null, mood = '') {
  return new Promise(res => {
    const n = $('#narr'); n.querySelector('.t').textContent = UI.fmt(text);
    // 挿し絵（伝説のアニモンなど）を文章の上に出す
    const pc = n.querySelector('.pics');
    if (pc) { pc.innerHTML = pics ? pics.map((id, i) => `<img src="${bigPortrait(id, 'roar')}" style="animation-delay:${i * 0.25}s">`).join('') : ''; }
    n.className = 'on' + (mood ? ' ' + mood : '');
    if (UI.skipping) { n.classList.remove('on'); res(); return; }
    let done = false;
    const fin = () => { if (done) return; done = true; n.classList.remove('on'); advanceFn = null; setTimeout(res, 400); };
    const timer = setTimeout(fin, 2200 + text.length * 90 + (pics ? 800 : 0));
    advanceFn = () => { clearTimeout(timer); fin(); };
  });
}
export function chapterTitle(text) {
  return new Promise(res => {
    const t = el('div', '', `<div style="position:absolute;inset:0;display:grid;place-items:center;z-index:44;pointer-events:none"><div style="font-size:2em;font-weight:800;color:#fff;text-shadow:0 3px 10px #000,0 0 3px #000;letter-spacing:.12em;animation:pop .6s">${esc(text)}</div></div>`);
    $('#ui').appendChild(t);
    setTimeout(() => { t.remove(); res(); }, UI.skipping ? 10 : 2000);
  });
}
// 読み込み画面（消えかけのものは除いて探す：続けて次の読み込み画面を出しても取り違えないように）
const curLoading = () => document.querySelector('#loading:not([data-closing])');
export function loadingProgress(p, msg) { const l = curLoading(); if (!l) return; l.querySelector('.bar i').style.width = Math.round(p * 100) + '%'; if (msg) l.querySelector('.msg').textContent = msg; }
export function hideLoading() { const l = curLoading(); if (l) { l.dataset.closing = '1'; l.classList.add('off'); setTimeout(() => l.remove(), 600); } }

export function hpClass(r) { return r > 0.5 ? '' : r > 0.2 ? 'mid' : 'low'; }
