// =============================================================
//  アニマルモンスター  起動・タイトル・メインループ
// =============================================================
import { Renderer, Scene, Camera, Node, PRIM, initPrims, GeoBuilder, MAT, mixRgb, norm3 } from './engine/gl3d.js';
import { mulberry32, fbm } from './engine/util.js';
import { SkyRig } from './render/sky.js';
import { Ambient } from './render/ambient.js';
import { getFlora, getSmallFlora, instanceNodes, stamp } from './render/flora.js';
import { LOGO_SVG } from './ui/logo.js';
import { buildAnimon, animateAnimon, setModelDetail } from './render/models.js';
import { G, save } from './game/state.js';
import { loadSettings, saveSettings, hasSave, loadGame, newState, deleteGame, writeGame } from './game/save.js';
import { initInput, Input } from './input.js';
import { audio } from './audio.js';
import { $, el, esc, UI, openScreen, toast, confirmBox, say, ask, loadingProgress, hideLoading, advance, topScreen, fade, closeAllScreens } from './ui/ui.js';
import { OW, buildOverworld, updateOverworld, runFlow, buildBarriers, refreshActors, resetCamera, tickRepel, repelLeft } from './game/overworld.js';
import { showNewNewsOnce, openNewsList, refreshNewsBadges, linkOnboarding, hookTouchLayout, startGiftWatch } from './ui/extras.js';
import { resetInput } from './input.js';
import { initMinimap, updateMinimap } from './ui/minimap.js';
import { initCoop, updateCoop, startInviteWatch } from './game/coop.js';
import * as SE from './game/storyEngine.js';
import * as MENU from './ui/menus.js';
import { SPECIES } from './data/species.js';
import { BUILD } from './version.js';
import * as BATTLE from './ui/battleUI.js';
import { createMon, maxHp } from './game/mon.js';

const canvas = $('#game');
let title = null, last = performance.now(), saveTimer = 0;

function pixelRatio() { const dpr = window.devicePixelRatio || 1; return G.settings.light ? Math.min(1, dpr * 0.75) : Math.min(1.75, dpr); }
// 3D の描画サイズは「画面に実際に表示されているキャンバスの大きさ」に合わせる
// （スマホ横画面でツールバーの分だけ縦がつぶれて、横に引き伸ばされたように見えるのを防ぐ）
function resize() {
  if (!G.renderer) return;
  const r = canvas.getBoundingClientRect();
  const w = Math.round(r.width) || window.innerWidth, h = Math.round(r.height) || window.innerHeight;
  G.renderer.setSize(w, h, pixelRatio());
}

async function boot() {
  { const lg = $('#loading .logo'); if (lg) lg.innerHTML = LOGO_SVG; }
  G.settings = loadSettings();
  setModelDetail(!!G.settings.light);
  UI.textSpeed = G.settings.textSpeed;
  audio.configure(G.settings.bgm, G.settings.sfx);
  try { G.renderer = new Renderer(canvas, { antialias: !G.settings.light, shadowSize: G.settings.light ? 0 : 1024 }); }
  catch (e) { $('#loading .msg').textContent = 'この端末では 3D表示（WebGL）が 使えません。'; return; }
  initPrims();
  resize();
  window.addEventListener('resize', resize);
  // 画面を回したとき、端末によっては 大きさが 少しずつ 変わるので 何回か 合わせなおす
  window.addEventListener('orientationchange', () => { canvas.style.height = ''; canvas.style.width = ''; for (const ms of [60, 200, 450, 800, 1300, 2000]) setTimeout(() => { if (window.scrollY) window.scrollTo(0, 0); resize(); }, ms); });
  if (screen.orientation && screen.orientation.addEventListener) screen.orientation.addEventListener('change', () => { for (const ms of [60, 300, 900, 1600]) setTimeout(resize, ms); });
  // 3D表示が こわれた（WebGL のコンテキスト消失）ときは、セーブして 自動で 読み込みなおす
  canvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    if (G.ctxLost) return; G.ctxLost = true;
    try { if (G.save && G.state !== 'title') { save(); sessionStorage.setItem('animon_autocont', '1'); } } catch (er) { /* */ }
    const o = document.createElement('div'); o.id = 'ctxlost'; o.innerHTML = '<div>画面を 復元しています…</div>'; document.body.appendChild(o);
    setTimeout(() => location.reload(), 1200);
  }, false);
  if (window.visualViewport) window.visualViewport.addEventListener('resize', () => requestAnimationFrame(resize));
  if (window.ResizeObserver) new ResizeObserver(() => resize()).observe(canvas);
  initInput();
  hookTouchLayout();   // ボタンの 配置・大きさ（設定で 変えたもの）
  // 最初の操作で音を有効化（iOSは ambient にして他の音楽を止めない）
  const unlock = () => { audio.unlock(); };
  window.addEventListener('pointerdown', unlock, { capture: true });
  window.addEventListener('keydown', unlock, { capture: true });
  // 会話送り
  window.addEventListener('pointerdown', (e) => { if (e.target.closest('button, input, select, .screen')) return; advance(); });
  window.addEventListener('keydown', (e) => { if (['Space', 'Enter', 'KeyZ', 'KeyE'].includes(e.code)) advance(); });
  // HUDボタン（押した指が 少しずれて 離れても 反応するように：押した場所から 45px 以内で 離せば OK）
  const tap = (node, fn) => {
    if (!node) return;
    let down = null, fired = 0;
    node.addEventListener('pointerdown', (e) => { e.stopPropagation(); down = { id: e.pointerId, x: e.clientX, y: e.clientY }; try { node.setPointerCapture(e.pointerId); } catch (er) { /* */ } });
    node.addEventListener('pointerup', (e) => { if (!down || e.pointerId !== down.id) return; const ok = Math.hypot(e.clientX - down.x, e.clientY - down.y) < 45; down = null; if (ok) { fired = performance.now(); fn(e); } });
    node.addEventListener('pointercancel', () => { down = null; });
    node.addEventListener('click', (e) => { e.stopPropagation(); if (performance.now() - fired < 700) return; fn(e); });
  };
  tap($('#btnMenu'), () => { if (G.state === 'world') runFlow(() => MENU.openMainMenu()); });
  tap($('#btnMap'), () => { if (G.state === 'world') runFlow(() => MENU.openMap()); });
  // 左上の「目的」を押すと ストーリー・サイドストーリー・おつかいの 一覧
  tap($('#objective'), () => { if (G.state === 'world' && !G.busy) runFlow(() => MENU.openJournal()); });
  tap($('#btnCam'), () => { if (G.state === 'world') { resetCamera(); toast('視点を 元に戻しました（北が上）'); } });
  initMinimap();
  initCoop();
  // アプリを閉じる・切り替えるときはクラウドにも保存。戻ってきたら、ほかの端末で進めていないか確認
  let hiddenAt = 0;
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { hiddenAt = Date.now(); if (G.save && G.state === 'world') { save(); import('./online.js').then(m => m.pushSave(true)); } return; }
    if (Date.now() - hiddenAt > 3000) cloudResume();
    checkUpdate();
  });
  // 新しい 版が 公開されたら、遊んでいる 人の 画面も 更新する（3分ごと・アプリに 戻ってきたとき）
  setInterval(checkUpdate, 180000);
  setTimeout(checkUpdate, 20000);
  G.onDupFixed = (mv) => toast(`パーティーに 同じ アニモンが いたので ${mv.map(x => x.nick || SPECIES[x.sp]?.name || '').join('・')} を ボックスに 送りました`, 4200);
  G.onSaved = () => { import('./online.js').then(m => { m.scheduleCloudSave(); m.publishRanking(); }); };
  import('./online.js').then(m => { m.Online.onConflict = () => cloudResume(); });
  // 時の扉・第2部の はじまりで 読みこみ なおした ときは、タイトルを とばして すぐ 続きから
  let fast = false; try { fast = sessionStorage.getItem('animon_fastcont') === '1'; sessionStorage.removeItem('animon_fastcont'); } catch (e) { /* */ }
  if (fast && hasSave()) {
    loadingProgress(1, ''); hideLoading();
    requestAnimationFrame(loop); startWatchdog();
    await startGame(loadGame(), false);
    return;
  }
  // タイトルの3D（風景とアニモン）を読み込み画面のあいだに作る
  title = await buildTitleScene((p) => loadingProgress(0.1 + p * 0.9, 'タイトルを 準備中…'));
  loadingProgress(1, '');
  hideLoading();
  showTitle();
  requestAnimationFrame(loop);
  startWatchdog();
  // ほかの端末のデータを読み込んで再起動したときは、そのまま続きから
  try { if (sessionStorage.getItem('animon_autocont')) { sessionStorage.removeItem('animon_autocont'); setTimeout(() => $('#title .cont')?.click(), 900); } } catch (e) { /* */ }
}

// ---------- 新しい 版の 確認 ----------
//  version.json の 番号が この 画面の 番号（js/version.js）と ちがえば、セーブして 読みこみ なおす
let updBusy = false;
async function checkUpdate() {
  if (updBusy || document.hidden) return;
  updBusy = true;
  try {
    const r = await fetch('version.json?t=' + Date.now(), { cache: 'no-store' });
    if (!r.ok) return;
    const v = await r.json();
    if (!v || !v.build || v.build === BUILD) return;
    // 一度 読みこみ なおしても 古い まま（ブラウザの キャッシュ）なら くり返さない
    let tried = ''; try { tried = sessionStorage.getItem('animon_upd') || ''; } catch (e) { /* */ }
    if (tried === v.build) return;
    const reload = async (cont) => {
      try { sessionStorage.setItem('animon_upd', v.build); if (cont) sessionStorage.setItem('animon_autocont', '1'); } catch (e) { /* */ }
      location.reload();
    };
    if (G.state === 'title' && !topScreen()) { toast('新しい バージョンに 更新します'); setTimeout(() => reload(false), 1200); return; }
    if (G.state !== 'world' || G.busy || topScreen() || !G.save) return;   // バトル中・メニュー中は あとで
    runFlow(async () => {
      await say(['|📢 ゲームが 新しい バージョンに なりました。', '|データを 保存して 更新します。']);
      save();
      try { const ON = await import('./online.js'); if (ON.isConfigured() && G.save.pid) await Promise.race([ON.pushSave(true), new Promise(res => setTimeout(res, 5000))]); } catch (e) { /* */ }
      await reload(true);
    });
  } catch (e) { /* オフラインなど */ } finally { updBusy = false; }
}

// ---------- クラウドセーブ（スマホ・パソコンで同じデータ） ----------
const fmtTime = (sec) => `${Math.floor(sec / 3600)}時間${Math.floor(sec / 60) % 60}分`;
const fmtAt = (ms) => { if (!ms) return '―'; const d = new Date(ms); return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`; };
// 両方の端末で別々に進めたとき、どちらを使うか選んでもらう
async function chooseConflict(local, r) {
  const ON = await import('./online.js');
  const a = ON.cloudSummary(local), b = ON.cloudSummary(r.data);
  const k = await ask(`ほかの端末でも 別に進めた データが あります。\nどちらを 使いますか？\n📱 この端末：${fmtTime(a.playTime)}・図鑑${a.dex}・紋章${a.crests}（${fmtAt(a.saved)}）\n☁️ ほかの端末：${fmtTime(b.playTime)}・図鑑${b.dex}・紋章${b.crests}（${fmtAt(r.rec.at || b.saved)}）`,
    ['☁️ ほかの端末のデータを使う', '📱 この端末のデータを使う（ほかの端末の進みは消えます）']);
  if (k === 1) { await ON.forceUseLocal(local); return local; }
  writeGame(r.data);
  return r.data;
}
// 続きから始める前に、クラウドのほうが新しくないか確認
async function cloudBeforeStart(st) {
  if (!st || !st.pid) return st;
  const ON = await import('./online.js');
  if (!ON.isConfigured()) return st;
  toast('☁️ クラウドのデータを 確認中…');
  const r = await Promise.race([ON.checkCloud(st), new Promise(res => setTimeout(() => res({ status: 'timeout' }), 8000))]);
  if (r.status === 'newer') { writeGame(r.data); toast('☁️ ほかの端末で 進めたデータを 読み込みました'); return r.data; }
  if (r.status === 'conflict') return await chooseConflict(st, r);
  if (r.status === 'unlinked') toast('この端末は データ連携が 解除されています（タイトルの「データ連携」から 連携しなおせます）');
  return st;
}
// 遊んでいる途中（アプリに戻ってきたとき・ほかの端末が先にセーブしたとき）
let resuming = false;
async function cloudResume() {
  if (resuming || !G.save || !G.save.pid || G.state !== 'world' || G.busy) return;
  const ON = await import('./online.js');
  if (!ON.isConfigured() || !ON.Online.ready) return;
  resuming = true;
  try {
    const r = await ON.checkCloud();
    if (G.state !== 'world' || G.busy) return;
    const reload = (st) => { writeGame(st); try { sessionStorage.setItem('animon_autocont', '1'); } catch (e) { /* */ } location.reload(); };
    if (r.status === 'newer') runFlow(async () => { await say(['|☁️ ほかの端末で 進めた データが あります。', '|新しい データを 読み込みます。']); reload(r.data); });
    else if (r.status === 'conflict') runFlow(async () => { const st = await chooseConflict(G.save, r); if (st !== G.save) reload(st); else toast('☁️ この端末の データを クラウドに 保存しました'); });
  } finally { resuming = false; }
}

// ---------- タイトル ----------
//  夕方の光に照らされた丘。手前に御三家、まわりにアニモンたち、奥の丘には炎の王竜、空には天海の龍。
async function buildTitleScene(progress) {
  const light = !!G.settings.light;
  const S = new Scene();
  S.lightDir = norm3([0.62, 0.5, 0.42]);
  S.sun = [0.98, 0.86, 0.7]; S.shadowC = [0.38, 0.32, 0.55];
  S.fogNear = 50; S.fogFar = 170; S.wind = [0.8, 0.5, 0.6];
  S.outlineDist = 140;
  S.cloudShadow = [light ? 0 : 0.25, 0.02, 0, 0];
  const sky = new SkyRig(S, { light, clouds: light ? 7 : 14, cloudR: 150, cloudY: 26, mountR: 240, dome: 420, theme: 'morning' });
  S.fogColor = S.horizon.slice(); S.bg = S.horizon.slice();
  S.shadow = light ? null : { center: [0, 0, -4], radius: 22, strength: 0.7, bias: 0.08 };
  // 丘（手前はなだらか、奥はせり上がる）
  const hAt = (x, z) => {
    let h = Math.max(0, -z - 6) * 0.12 + smoothstep(14, 60, Math.hypot(x, z + 10)) * 12 + (fbm(x / 20, z / 20, 3, 4) - 0.5) * 3;
    h += Math.max(0, 1 - Math.hypot(x + 15, z + 23) / 9) * 6;   // 王竜の丘
    h += Math.max(0, 1 - Math.hypot(x - 2, z - 5) / 7) * 0.9;     // 手前の小さな丘
    return h;
  };
  const g = new GeoBuilder();
  const R = 140, NR = 30, NA = 56, rows = [];
  for (let i = 0; i <= NR; i++) {
    const rr = R * Math.pow(i / NR, 1.6), row = [];
    for (let k = 0; k <= NA; k++) {
      const a = k / NA * Math.PI * 2, x = Math.cos(a) * rr, z = Math.sin(a) * rr - 6, h = hAt(x, z), e = 0.5;
      const nx = hAt(x - e, z) - hAt(x + e, z), nz = hAt(x, z - e) - hAt(x, z + e), l = Math.hypot(nx, 2 * e, nz);
      const n = fbm(x / 9, z / 9, 2, 11);
      const c = mixRgb(mixRgb([0.38, 0.7, 0.28], [0.66, 0.84, 0.34], smoothstep(0.35, 0.7, n)), [0.62, 0.72, 0.5], smoothstep(8, 20, h) * 0.5);
      row.push(g._push(x, h, z, nx / l, 2 * e / l, nz / l, c));
    }
    rows.push(row);
  }
  for (let i = 0; i < NR; i++) for (let k = 0; k < NA; k++) { const a = rows[i][k], b = rows[i][k + 1], c = rows[i + 1][k], d = rows[i + 1][k + 1]; g.tri(a, b, c); g.tri(b, d, c); }
  S.add(new Node(g.build(), { mat: MAT.terrain, outline: 0, kind: 4, castShadow: false }));
  // 木・しげみ・花・草
  const F = getFlora(light), SM = getSmallFlora(light), r = mulberry32(5);
  const items = [];
  const put = (list, x, z, s, tint) => { if (Math.abs(x) < 15 && z > -4 && z < 10) return; if (x < -2 && x > -11 && z > 1 && z < 9) return; items.push({ proto: list[Math.floor(r() * list.length)], x, y: hAt(x, z) - 0.15, z, ry: r() * 6.28, s, tint }); };
  for (let i = 0; i < (light ? 26 : 60); i++) { const a = r() * Math.PI * 2, d = 16 + r() * 60, x = Math.cos(a) * d, z = Math.sin(a) * d - 14; if (z > -8 && Math.abs(x) < 24) continue; put(r() < 0.35 ? F.blossom : F.round, x, z, 1.1 + r() * 0.9); }
  for (let i = 0; i < (light ? 12 : 28); i++) { const a = r() * Math.PI * 2, d = 10 + r() * 26, x = Math.cos(a) * d, z = Math.sin(a) * d - 6; put(F.bush, x, z, 0.9 + r() * 0.5); }
  for (let i = 0; i < (light ? 6 : 12); i++) { const a = r() * Math.PI * 2, d = 12 + r() * 30; put(F.rock, Math.cos(a) * d, Math.sin(a) * d - 8, 0.6 + r() * 0.8); }
  const fcols = [[1, 0.42, 0.55], [1, 0.86, 0.3], [1, 1, 1], [0.75, 0.5, 1], [1, 0.62, 0.85]];
  for (let i = 0; i < (light ? 60 : 200); i++) { const x = (r() - 0.5) * 50, z = 10 - r() * 40; items.push({ proto: SM.flower[Math.floor(r() * 3)], x, y: hAt(x, z), z, ry: r() * 6.28, s: 1 + r() * 0.3, tint: fcols[Math.floor(r() * fcols.length)] }); }
  for (let i = 0; i < (light ? 100 : 360); i++) { const x = (r() - 0.5) * 60, z = 9 - r() * 42; items.push({ proto: SM.tuft[Math.floor(r() * 2)], x, y: hAt(x, z), z, ry: r() * 6.28, s: 0.7 + r() * 0.6, tint: [0.5, 0.86, 0.34] }); }
  for (const [geo, gp] of instanceNodes(items)) {
    const a = gp.arr, n = a.length / 8; let ms = 0; for (let i = 0; i < a.length; i += 8) ms = Math.max(ms, a[i + 4]);
    if (G.renderer.inst) { const nd = new Node(geo, { mat: gp.mat || MAT.decor, outline: geo.data.length / 13 < 200 ? 0 : 1, castShadow: geo.data.length / 13 >= 200 }); nd.inst = { data: new Float32Array(a), count: n, center: [0, 0, -10], radius: 160, maxS: ms }; nd.cull = false; S.add(nd); }
    else { const gb = new GeoBuilder(); for (let i = 0; i < a.length; i += 8) stamp(gb, { parts: [geo] }, a[i], a[i + 1], a[i + 2], a[i + 3], a[i + 4], [a[i + 5], a[i + 6], a[i + 7]]); S.add(new Node(gb.build(), { mat: gp.mat || MAT.decor, outline: 0 })); }
  }
  // アニモン（1体ずつ作り、そのたびに読み込みバーを進める）
  const mons = [];
  let built = 0;
  const yieldUI = async () => { built++; if (progress) { progress(built / 12); await new Promise(r => setTimeout(r, 0)); } };
  const add = (id, x, z, ry, state, o = {}) => { const M = buildAnimon(id, !!o.shiny, { lod: o.lod || 'hi' }); M.root.setPos(x, hAt(x, z) + (o.y || 0), z); M.root.rot[1] = ry; if (o.s) M.root.setScale(o.s); S.add(M.root); const m = { M, x, z, ry, state, ...o }; mons.push(m); return m; };
  // 左手前：御三家 ／ 右手前〜奥：仲間たち ／ 左奥の丘：炎の王竜 ／ 右の空：天海の龍
  add(1, -7.4, 4.2, 0.65, 'idle'); await yieldUI(); add(4, -5.6, 5.4, 0.45, 'happy'); await yieldUI(); add(7, -3.9, 3.8, 0.3, 'idle'); await yieldUI();
  const walkers = [10, 16, 46, 109, 160, 22, 31];
  for (let i = 0; i < walkers.length; i++) { add(walkers[i], 0, 0, 0, 'walk', { lod: 'mid', walker: true, a: i / walkers.length * Math.PI * 2, rad: 5 + (i % 3) * 2, cx: 9, cz: 0, spd: 0.13 + (i % 2) * 0.05, shiny: i === 3 }); await yieldUI(); }
  const L1 = add(199, -16.5, -27, 0.62, 'battle', { s: 1.45, y: -2.4 }); await yieldUI();
  const L2 = add(200, 15, -27, -1.2, 'fly', { y: 4.7, s: 1.5, flyer: true }); await yieldUI();
  const C = new Camera(38);
  return { S, C, mons, sky, amb: (() => { const a = new Ambient(S, { light, count: light ? 14 : 36, radius: 13, height: 9 }); a.setKind('petals'); return a; })(), t: 0, L: [L1, L2] };
}
function smoothstep(a, b, x) { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); }
async function showTitle() {
  G.state = 'title';
  if (!title) title = await buildTitleScene();
  audio.playBgm('title');
  closeAllScreens();
  const s = el('div', 'screen clear'); s.id = 'title';
  const has = hasSave();
  s.innerHTML = `<div class="rays"></div><div class="tbg"></div><div class="tin"><div class="brand"><div class="logo">${LOGO_SVG}</div><div class="sub">〜 異世界の動物たちと 旅にでよう 〜</div></div>
    <div class="menu">
      <button class="btn pri new"><span class="ic">✨</span>最初から始める</button>
      <button class="btn cont" ${has ? '' : 'disabled'}><span class="ic">▶</span>続きから始める</button>
      <button class="btn trans"><span class="ic">🔑</span>引き継ぎコードの発行・アカウント引き継ぎ</button>
      <button class="btn set"><span class="ic">⚙️</span>設定</button>
    </div></div><button class="btn newsbtn">📢 お知らせ<b class="nbadge" data-newsbadge style="display:none"></b></button><div class="copy">© アニマルモンスター</div><div class="ver">ver 1.4　PC・スマホ（横画面）対応</div>`;
  $('#screens').appendChild(s);
  s.querySelector('.new').onclick = async () => {
    audio.sfx('select');
    if (hasSave() && !await confirmBox('セーブデータが あります。最初から始めると 上書きされます。よろしいですか？')) return;
    tryFullscreen();
    s.remove(); characterCreate();
  };
  s.querySelector('.cont').onclick = async (e) => {
    const b = e.currentTarget; if (b.disabled) return; b.disabled = true;
    audio.sfx('select'); tryFullscreen();
    const st = await cloudBeforeStart(loadGame());
    s.remove(); await startGame(st, false);
  };
  s.querySelector('.trans').onclick = async () => {
    audio.sfx('select');
    if (!G.save && hasSave()) G.save = loadGame();
    (await import('./ui/onlineUI.js')).openTransfer(true);
  };
  s.querySelector('.set').onclick = () => { audio.sfx('select'); MENU.openSettings(true); };
  s.querySelector('.newsbtn').onclick = () => { audio.sfx('select'); openNewsList(); };
  // アプリを 開いたときに、まだ 見ていない お知らせを 1回だけ 出す
  setTimeout(() => { if (G.state === 'title') showNewNewsOnce().catch(() => { }).finally(() => refreshNewsBadges()); }, 600);
}
function updateTitle(dt) {
  const T = title; T.t += dt;
  const t = T.t;
  // カメラ：ゆっくり横にすべりながら、少し上下
  const a = Math.sin(t * 0.08) * 0.22;
  T.C.pos = [Math.sin(a) * 14, 5.6 + Math.sin(t * 0.13) * 0.35, 4 + Math.cos(a) * 13];
  T.C.target = [Math.sin(a) * 3, 3.4, -6];
  for (const m of T.mons) {
    if (m.walker) {
      m.a += dt * m.spd; const x = m.cx + Math.cos(m.a) * m.rad, z = m.cz + Math.sin(m.a) * m.rad * 0.6;
      const nx = m.cx + Math.cos(m.a + 0.05) * m.rad, nz = m.cz + Math.sin(m.a + 0.05) * m.rad * 0.6;
      m.M.root.setPos(x, 0, z); m.M.root.pos[1] = titleH(x, z); m.M.root.rot[1] = Math.atan2(nx - x, nz - z);
      animateAnimon(m.M, dt, 'walk');
    } else if (m.flyer) {
      m.M.root.pos[0] = m.x + Math.sin(t * 0.3) * 3; m.M.root.pos[1] = (m.y ?? 8) + Math.sin(t * 0.5) * 1.0; m.M.root.rot[1] = m.ry + Math.sin(t * 0.3) * 0.2;
      animateAnimon(m.M, dt, 'fly');
    } else {
      // 御三家：ときどき跳ねたり、ほえたり
      const ph = (t * 0.25 + m.x * 0.1) % 1;
      const st = m.M.sp.legend ? (ph > 0.82 ? 'roar' : 'battle') : (ph > 0.86 ? 'happy' : m.state);
      animateAnimon(m.M, dt, st);
    }
  }
  T.sky.update(dt, T.C);
  T.amb.update(dt, [T.C.target[0], 1.5, -6], T.S.wind);
  G.renderer.render(T.S, T.C);
}
function titleH(x, z) {
  let h = Math.max(0, -z - 6) * 0.12 + smoothstep(14, 60, Math.hypot(x, z + 10)) * 12 + (fbm(x / 20, z / 20, 3, 4) - 0.5) * 3;
  h += Math.max(0, 1 - Math.hypot(x + 15, z + 23) / 9) * 6;
  h += Math.max(0, 1 - Math.hypot(x - 2, z - 5) / 7) * 0.9;
  return h;
}
function tryFullscreen() {
  if (!Input.touch) return;
  const de = document.documentElement;
  try { if (de.requestFullscreen && !document.fullscreenElement) de.requestFullscreen().then(() => screen.orientation?.lock?.('landscape').catch(() => { })).catch(() => { }); } catch (e) { /* */ }
}

// ---------- キャラクター作成（js/ui/charamake.js：ゲーム中も メニューから いつでも 変えられる） ----------
async function characterCreate() {
  const { openCharaMake } = await import('./ui/charamake.js');
  const r = await openCharaMake({ isNew: true });
  if (!r) { showTitle(); return; }
  deleteGame();
  await startGame(newState(r.name, { ...r.look }), true);
}

// ---------- ゲーム開始 ----------
async function startGame(state, isNew) {
  if (!state) { toast('セーブデータが 読み込めませんでした'); showTitle(); return; }
  G.save = state;
  // 第2部：隕石の あとの 大陸（現在）か、過去（第1部の 大陸）か
  { const W = await import('./data/world.js'); W.applyEra(state.era === 'now'); if (!W.STONES.some(s => s.id === state.lastHospital)) state.lastHospital = 't_start'; }
  // 旧データ互換
  state.cleared ||= {}; state.quests ||= {}; state.items ||= {};
  // パーティーに 同じ アニモンが 2匹 いる（前の 版で 進化して 重なった）ときは 片方を ボックスへ
  { const { fixPartyDup } = await import('./game/state.js'); const mv = fixPartyDup(); if (mv.length) setTimeout(() => G.onDupFixed(mv), 3000); }
  // 「ふしぎなアメ」は 1種類に まとめた（昔の rarecandy → candy）
  if (state.bag && state.bag.rarecandy) { state.bag.candy = (state.bag.candy || 0) + state.bag.rarecandy; delete state.bag.rarecandy; }
  state.errands ||= {}; state.crowns ||= {};
  { const { naturalMetAt } = await import('./data/world.js'); for (const m of [...(state.party || []), ...(state.box || [])]) naturalMetAt(m); }
  for (const m of [...(state.party || []), ...(state.box || [])]) {
    if (!m.iv) continue;
    // 個体値は 1〜15（古いデータの 0 は 1 に）。能力の計算式が変わったので HP は上限に合わせる
    for (const k of ['atk', 'def', 'hp', 'spe']) if (!(m.iv[k] >= 1)) m.iv[k] = 1;
    try { const mx = maxHp(m); if (m.hp > mx) m.hp = mx; } catch (e) { /* */ }
    if (!SPECIES[m.sp]?.legend) continue;
    let h = 0; for (const ch of String(m.uid)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    for (const k of ['atk', 'def', 'hp', 'spe']) { h = (h * 1103515245 + 12345) >>> 0; if (m.iv[k] < 10) m.iv[k] = 10 + (h >>> 8) % 6; }
  }
  UI.vars = { P: state.name, S: state.story.starter != null ? SPECIES[[1, 4, 7][state.story.starter]].name : '相棒', L: state.story.legend ? SPECIES[state.story.legend].name : '伝説' };
  const ld = el('div', ''); ld.id = 'loading'; ld.innerHTML = `<div class="logo">${LOGO_SVG}</div><div class="bar"><i></i></div><div class="msg">冒険の準備中…</div>`;
  document.body.appendChild(ld);
  await new Promise(r => setTimeout(r, 50));
  await buildOverworld((p, m) => loadingProgress(p, m));
  loadingProgress(1, '');
  title = null;
  G.scene = OW.scene;
  G.state = 'world';
  hideLoading();
  $('#hud').classList.remove('hidden');
  if (Input.touch) $('#touch').classList.remove('hidden');
  OW.cam.pos = [OW.player.x, 30, OW.player.z + 24]; OW.cam.target = [OW.player.x, 0, OW.player.z];
  updateHud(true);
  if (isNew) {
    state.needLink = true;
    save();
    runFlow(async () => {
      // はじめて 遊ぶときは まず 連携コードの 発行・保存・同期（なくさないための 準備）
      try { await linkOnboarding(); } catch (e) { console.warn(e); }
      await SE.runScene('prologue');
    });
  } else {
    // 連携コードの 準備が まだ 終わっていない データは、もう一度 案内する
    if (state.needLink) setTimeout(() => runFlow(async () => { try { await linkOnboarding(); } catch (e) { console.warn(e); } }), 1500);
    audio.playBgm('field');
    // 第2部：時の扉・隕石の あとに 読みこみ なおした ときは その 続きの ムービー／ストーリー
    const pend = state.pendingScene; delete state.pendingScene;
    if (pend) setTimeout(() => runFlow(async () => { await SE.runScene(pend); save(); if (!(await SE.checkEraStep())) { /* */ } }), 700);
    else { toast(`おかえりなさい、${state.name}さん！`); setTimeout(() => runFlow(() => SE.checkEraStep()), 2000); }
    // すでに 条件を 満たしている データには 王冠を あとから わたす（1つずつだけ）
    setTimeout(async () => {
      if ((state.story.crests || 0) >= SE.CROWN_SILVER_CRESTS) await SE.grantCrown('s', true);
      if (state.postGame) await SE.grantCrown('g', true);
    }, 2500);
  }
  // 視点操作の案内（最初の1回だけ）
  if (!G.settings.camHint) {
    const hint = () => { if (G.state !== 'world') return; if (G.busy) { setTimeout(hint, 3000); return; } toast(Input.touch ? '👆 画面を指で なぞると 視点を 回せます（2本指で ズーム）' : '🖱 マウスで ドラッグ（または Q / E キー）で 視点を 回せます　C：元に戻す'); G.settings.camHint = true; saveSettings(G.settings); };
    setTimeout(hint, 5000);
  }
  // オンラインが使える設定なら、裏でランキングに自分の成績を載せておく
  setTimeout(() => import('./online.js').then(m => { if (m.isConfigured()) m.ensurePlayer().then(() => { m.publishRanking(true); startInviteWatch(); startGiftWatch(); }).catch(() => {}); }), 4000);
}

// ---------- HUD ----------
let hudCache = '';
function updateHud(force = false) {
  if (!G.save) return;
  const o = SE.objective();
  const key = o.ch + o.txt + o.quest + G.save.money;
  if (!force && key === hudCache) return;
  hudCache = key;
  const ob = $('#objective');
  ob.querySelector('.ch').textContent = o.ch;
  ob.querySelector('.txt').textContent = '目的：' + UI.fmt(o.txt);
  ob.querySelector('.quest').textContent = o.quest ? UI.fmt(o.quest) : '';
  $('#money').textContent = '¥' + G.save.money.toLocaleString();
}
// むしよけスプレーの のこり時間（画面の 上に 出す）
let repelShown = '';
function updateRepelChip() {
  const left = repelLeft();
  let txt = '';
  if (left > 0) { const sec = Math.ceil(left), h = Math.floor(sec / 3600), m = Math.floor(sec / 60) % 60, ss = sec % 60; txt = `🧴 むしよけ ${h ? h + ':' + String(m).padStart(2, '0') : m}:${String(ss).padStart(2, '0')}`; }
  if (txt === repelShown) return;
  repelShown = txt;
  const c = $('#repelChip'); if (!c) return;
  c.textContent = txt; c.classList.toggle('on', !!txt); c.classList.toggle('low', left > 0 && left < 60);
}

// ---------- ループ ----------
let sizeChk = 0;
function loop(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  const R = G.renderer;
  if (G.ctxLost) { requestAnimationFrame(loop); return; }
  // 表示の大きさと 描画の大きさが ずれていたら 合わせる（画面の回転で 下が黒くなるのを防ぐ）
  sizeChk -= dt;
  if (sizeChk <= 0) {
    sizeChk = 0.5;
    let r = canvas.getBoundingClientRect();
    // iPhone：画面を回したあと キャンバスが 画面の下まで 届いていなければ、高さを 直接 合わせる（下に 色の帯が 出たままに ならないように）
    const vv = window.visualViewport, needW = Math.max(window.innerWidth, vv ? vv.width + vv.offsetLeft : 0), needH = Math.max(window.innerHeight, vv ? vv.height + vv.offsetTop : 0, document.documentElement.clientHeight);
    if (r.bottom < needH - 2 || r.right < needW - 2) { canvas.style.height = Math.ceil(needH) + 'px'; canvas.style.width = Math.ceil(needW) + 'px'; r = canvas.getBoundingClientRect(); }
    else if (canvas.style.height && r.bottom > needH + 120) { canvas.style.height = ''; canvas.style.width = ''; r = canvas.getBoundingClientRect(); }
    if (Math.abs(Math.round(r.width) - R.cssW) > 1 || Math.abs(Math.round(r.height) - R.cssH) > 1) resize();
  }
  R.time += dt;
  try {
    if (G.state === 'title' && title) {
      updateTitle(dt);
    } else if (G.state === 'battle' && G.battleView) {
      G.battleView.update(dt);
      R.render(G.battleView.scene, G.battleView.cam);
    } else if (G.save && OW.scene) {
      if (G.state === 'world') { G.save.playTime += dt; saveTimer += dt; if (saveTimer > 60 && !G.busy) { saveTimer = 0; save(); } tickRepel(dt); }
      // メニューを開いているときは移動しない
      const busyBefore = G.busy;
      if (topScreen() && !busyBefore) G.busy = true;
      updateOverworld(dt);
      if (topScreen() && !busyBefore) G.busy = false;
      if (OW.shake > 0) { OW.shake -= dt; OW.cam.pos[0] += (Math.random() - 0.5) * OW.shake; OW.cam.pos[1] += (Math.random() - 0.5) * OW.shake; }
      updateMinimap(dt);
      try { updateCoop(dt); } catch (e) { console.warn(e); }
      R.render(OW.dungeon ? OW.dscene : OW.scene, OW.cam);
      updateHud(); updateRepelChip();
    }
  } catch (e) { console.error(e); }
  requestAnimationFrame(loop);
}

// ---------- 固まったときの 自動復旧 ----------
//  ・バトルが 終わっているのに バトル画面の 状態のまま → フィールドに もどす
//  ・会話も メニューも 出ていないのに 動けない（処理中の しるしが 残った）状態が 12秒 つづいた → 動けるように もどす
//  ・暗転が 残ったまま → 明るく もどす
function startWatchdog() {
  let busyFor = 0, fadeFor = 0;
  setInterval(() => {
    try {
      if (!G.save || G.state === 'title') { busyFor = fadeFor = 0; return; }
      if (G.state === 'battle' && !G.battleView && !BATTLE.battleActive()) {
        console.warn('[watchdog] バトル状態を もとに もどしました');
        G.state = 'world';
        $('#hud').classList.remove('hidden'); if (Input.touch) $('#touch').classList.remove('hidden');
        $('#screens').style.display = ''; $('#labels').style.display = '';
        document.getElementById('battleUI')?.remove(); document.getElementById('bwipe')?.remove();
      }
      const dlg = !$('#dialog').classList.contains('hidden');
      const blocking = dlg || !!document.querySelector('#screens .screen, .learnov, .dexreg, #battleUI, #loading, #touchEdit') || $('#narr').classList.contains('on') || $('#letterbox').classList.contains('on') || BATTLE.battleActive() || G.state !== 'world';
      if (G.busy && !blocking) {
        if (++busyFor >= 12) { console.warn('[watchdog] 動けない状態を もとに もどしました'); G.busy = false; busyFor = 0; resetInput(); OW.encCool = 2; }
      } else busyFor = 0;
      const f = $('#fade');
      if (!G.busy && G.state === 'world' && f && +getComputedStyle(f).opacity > 0.5) { if (++fadeFor >= 4) { f.style.transitionDuration = '300ms'; f.style.opacity = 0; fadeFor = 0; } } else fadeFor = 0;
    } catch (e) { /* */ }
  }, 1000);
}

// デバッグ用（ブラウザのコンソールから確認できます）
window.ANIMON = { G, OW, SE, MENU, BATTLE, createMon, runFlow, buildBarriers, refreshActors, titleCam: () => title && title.C, titleScene: () => title };  // titleCam：アイコン作成ツール用
boot();
