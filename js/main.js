// =============================================================
//  アニマルモンスター  起動・タイトル・メインループ
// =============================================================
import { Renderer, Scene, Camera, Node, PRIM, initPrims, GeoBuilder } from './engine/gl3d.js';
import { mulberry32 } from './engine/util.js';
import { buildAnimon, animateAnimon, defaultLook, SKIN, HAIR_COL, CLOTH, HAIR_STYLES, HAIR_JA, HATS, HAT_JA, BOTTOMS, BOTTOM_JA } from './render/models.js';
import { HumanPreview } from './render/portrait.js';
import { G, save } from './game/state.js';
import { loadSettings, saveSettings, hasSave, loadGame, newState, deleteGame } from './game/save.js';
import { initInput, Input } from './input.js';
import { audio } from './audio.js';
import { $, el, esc, UI, openScreen, toast, confirmBox, say, loadingProgress, hideLoading, advance, topScreen, fade, closeAllScreens } from './ui/ui.js';
import { OW, buildOverworld, updateOverworld, runFlow, buildBarriers, refreshActors } from './game/overworld.js';
import * as SE from './game/storyEngine.js';
import * as MENU from './ui/menus.js';
import { SPECIES } from './data/species.js';
import * as BATTLE from './ui/battleUI.js';
import { createMon } from './game/mon.js';

const canvas = $('#game');
let title = null, last = performance.now(), saveTimer = 0;

function pixelRatio() { const dpr = window.devicePixelRatio || 1; return G.settings.light ? Math.min(1, dpr * 0.75) : Math.min(1.75, dpr); }
function resize() { G.renderer.setSize(window.innerWidth, window.innerHeight, pixelRatio()); }

async function boot() {
  G.settings = loadSettings();
  UI.textSpeed = G.settings.textSpeed;
  audio.configure(G.settings.bgm, G.settings.sfx);
  try { G.renderer = new Renderer(canvas, { antialias: !G.settings.light }); }
  catch (e) { $('#loading .msg').textContent = 'この端末では 3D表示（WebGL）が 使えません。'; return; }
  initPrims();
  resize();
  window.addEventListener('resize', resize);
  initInput();
  // 最初の操作で音を有効化（iOSは ambient にして他の音楽を止めない）
  const unlock = () => { audio.unlock(); };
  window.addEventListener('pointerdown', unlock, { capture: true });
  window.addEventListener('keydown', unlock, { capture: true });
  // 会話送り
  window.addEventListener('pointerdown', (e) => { if (e.target.closest('button, input, select, .screen')) return; advance(); });
  window.addEventListener('keydown', (e) => { if (['Space', 'Enter', 'KeyZ', 'KeyE'].includes(e.code)) advance(); });
  // HUDボタン
  $('#btnMenu').onclick = () => { if (G.state === 'world') runFlow(() => MENU.openMainMenu()); };
  $('#btnMap').onclick = () => { if (G.state === 'world') runFlow(() => MENU.openMap()); };
  document.addEventListener('visibilitychange', () => { if (document.hidden && G.save && G.state === 'world') { save(); import('./online.js').then(m => m.syncTransferSave(true)); } });
  G.onSaved = () => { import('./online.js').then(m => m.syncTransferSave()); };
  loadingProgress(1, '');
  hideLoading();
  showTitle();
  requestAnimationFrame(loop);
}

// ---------- タイトル ----------
function buildTitleScene() {
  const S = new Scene();
  S.bg = [0.45, 0.68, 0.95]; S.fogColor = [0.62, 0.8, 0.98]; S.fogNear = 30; S.fogFar = 90;
  const g = new Node(PRIM.disc, { color: [0.45, 0.75, 0.35] }); g.setScale(120, 1, 120); S.add(g);
  const gb = new GeoBuilder(); const r = mulberry32(5);
  for (let i = 0; i < 60; i++) { const a = r() * Math.PI * 2, d = 18 + r() * 40, x = Math.cos(a) * d, z = Math.sin(a) * d; gb.cylinder(0.3, 0.4, 2.2, [0.45, 0.3, 0.18], x, 0, z, 6); gb.sphere(1.7, [0.25 + r() * 0.1, 0.6, 0.22], x, 3.4, z, 7, 5); }
  for (let i = 0; i < 200; i++) { const x = (r() - 0.5) * 60, z = (r() - 0.5) * 60; gb.cylinder(0.03, 0.03, 0.5, [0.3, 0.6, 0.25], x, 0, z, 3, false); gb.sphere(0.16, [[1, 0.5, 0.5], [1, 0.9, 0.3], [0.8, 0.6, 1], [1, 1, 1]][i % 4], x, 0.55, z, 5, 3); }
  S.add(new Node(gb.build()));
  const mons = [];
  const ids = [1, 4, 7, 10, 16, 46, 109, 160];
  ids.forEach((id, i) => { const M = buildAnimon(id, i === 5); const a = i / ids.length * Math.PI * 2; M.root.setPos(Math.cos(a) * 7, 0, Math.sin(a) * 7); M.root.rot[1] = -a; S.add(M.root); mons.push({ M, a, r: 7 + (i % 2) * 2.5 }); });
  const L1 = buildAnimon(199, false); L1.root.setPos(-14, 0, -18); L1.root.rot[1] = 0.5; S.add(L1.root);
  const L2 = buildAnimon(200, false); L2.root.setPos(14, 3, -18); L2.root.rot[1] = -0.5; S.add(L2.root);
  const C = new Camera(42);
  return { S, C, mons, L: [L1, L2], t: 0 };
}
function showTitle() {
  G.state = 'title';
  title = buildTitleScene();
  audio.playBgm('title');
  closeAllScreens();
  const s = el('div', 'screen clear'); s.id = 'title';
  const has = hasSave();
  s.innerHTML = `<div class="logo">アニマル<br>モンスター</div><div class="sub">〜 異世界の動物たちと 旅にでよう 〜</div>
    <div class="menu">
      <button class="btn pri new">最初から始める</button>
      <button class="btn cont" ${has ? '' : 'disabled'}>続きから始める</button>
      <button class="btn trans">引き継ぎコードの発行・アカウント引き継ぎ</button>
      <button class="btn set">設定</button>
    </div><div class="ver">ver 1.0　PC・スマホ（横画面）対応</div>`;
  $('#screens').appendChild(s);
  s.querySelector('.new').onclick = async () => {
    audio.sfx('select');
    if (hasSave() && !await confirmBox('セーブデータが あります。最初から始めると 上書きされます。よろしいですか？')) return;
    tryFullscreen();
    s.remove(); characterCreate();
  };
  s.querySelector('.cont').onclick = async () => { audio.sfx('select'); tryFullscreen(); s.remove(); await startGame(loadGame(), false); };
  s.querySelector('.trans').onclick = async () => {
    audio.sfx('select');
    if (!G.save && hasSave()) G.save = loadGame();
    (await import('./ui/onlineUI.js')).openTransfer(true);
  };
  s.querySelector('.set').onclick = () => { audio.sfx('select'); MENU.openSettings(true); };
}
function tryFullscreen() {
  if (!Input.touch) return;
  const de = document.documentElement;
  try { if (de.requestFullscreen && !document.fullscreenElement) de.requestFullscreen().then(() => screen.orientation?.lock?.('landscape').catch(() => { })).catch(() => { }); } catch (e) { /* */ }
}

// ---------- キャラクター作成 ----------
function characterCreate() {
  const look = { ...defaultLook() };
  const s = openScreen('主人公を つくろう', { noClose: true });
  s.body.innerHTML = `<div class="create"><div class="preview"><canvas></canvas></div><div style="overflow:auto">
    <div class="opt"><label>なまえ</label><input class="textin name" maxlength="8" placeholder="なまえ（8文字まで）" value=""></div>
    <div class="opts"></div>
    <div class="row" style="margin-top:.8em;justify-content:flex-end"><button class="btn rnd">おまかせ</button><button class="btn pri go">この姿で はじめる！</button></div></div></div>`;
  const prev = new HumanPreview(s.body.querySelector('canvas'));
  const OPTS = [
    ['肌の色', 'skin', SKIN.map((c, i) => i), (v) => `<span class="sw" style="background:${SKIN[v]}"></span>`],
    ['髪型', 'hair', HAIR_STYLES, (v) => HAIR_JA[v]],
    ['髪の色', 'hairCol', HAIR_COL.map((c, i) => i), (v) => `<span class="sw" style="background:${HAIR_COL[v]}"></span>`],
    ['服の色', 'shirt', CLOTH.map((c, i) => i), (v) => `<span class="sw" style="background:${CLOTH[v]}"></span>`],
    ['下', 'bottom', BOTTOMS, (v) => BOTTOM_JA[v]],
    ['下の色', 'pants', CLOTH.map((c, i) => i), (v) => `<span class="sw" style="background:${CLOTH[v]}"></span>`],
    ['くつの色', 'shoes', CLOTH.map((c, i) => i), (v) => `<span class="sw" style="background:${CLOTH[v]}"></span>`],
    ['ぼうし', 'hat', HATS, (v) => HAT_JA[v]],
    ['ぼうしの色', 'hatCol', CLOTH.map((c, i) => i), (v) => `<span class="sw" style="background:${CLOTH[v]}"></span>`],
  ];
  const box = s.body.querySelector('.opts');
  const render = () => {
    box.innerHTML = '';
    for (const [lab, key, vals, fmt] of OPTS) {
      const row = el('div', 'opt', `<label>${lab}</label><button class="btn sm l">◀</button><div class="val">${fmt(look[key])}</div><button class="btn sm r">▶</button>`);
      const step = (d) => { const i = vals.indexOf(look[key]); look[key] = vals[(i + d + vals.length) % vals.length]; audio.sfx('select'); prev.setLook(look); render(); };
      row.querySelector('.l').onclick = () => step(-1); row.querySelector('.r').onclick = () => step(1);
      box.appendChild(row);
    }
  };
  render(); prev.setLook(look);
  const nameIn = s.body.querySelector('.name');
  nameIn.onkeydown = (e) => e.stopPropagation();
  s.body.querySelector('.rnd').onclick = () => {
    const r = Math.random;
    for (const [, key, vals] of OPTS) look[key] = vals[Math.floor(r() * vals.length)];
    prev.setLook(look); render();
  };
  s.body.querySelector('.go').onclick = async () => {
    const nm = nameIn.value.trim();
    if (!nm) { toast('なまえを 入れてね'); nameIn.focus(); return; }
    audio.sfx('select');
    if (!await confirmBox(`「${nm}」で 冒険を はじめますか？`)) return;
    prev.dispose(); s.close();
    deleteGame();
    await startGame(newState(nm, { ...look }), true);
  };
}

// ---------- ゲーム開始 ----------
async function startGame(state, isNew) {
  if (!state) { toast('セーブデータが 読み込めませんでした'); showTitle(); return; }
  G.save = state;
  // 旧データ互換
  state.cleared ||= {}; state.quests ||= {}; state.items ||= {};
  UI.vars = { P: state.name, S: state.story.starter != null ? SPECIES[[1, 4, 7][state.story.starter]].name : '相棒', L: state.story.legend ? SPECIES[state.story.legend].name : '伝説' };
  const ld = el('div', ''); ld.id = 'loading'; ld.innerHTML = `<div class="logo">アニマルモンスター</div><div class="bar"><i></i></div><div class="msg">冒険の準備中…</div>`;
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
    save();
    runFlow(async () => { await SE.runScene('prologue'); });
  } else {
    audio.playBgm('field');
    toast(`おかえりなさい、${state.name}さん！`);
  }
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

// ---------- ループ ----------
function loop(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  const R = G.renderer;
  R.time += dt;
  try {
    if (G.state === 'title' && title) {
      title.t += dt;
      const a = title.t * 0.12;
      title.C.pos = [Math.cos(a) * 17, 7.5, Math.sin(a) * 17]; title.C.target = [0, 1.6, 0];
      for (const m of title.mons) { m.a += dt * 0.15; m.M.root.setPos(Math.cos(m.a) * m.r, 0, Math.sin(m.a) * m.r); m.M.root.rot[1] = -m.a + Math.PI; animateAnimon(m.M, dt, 'walk'); }
      for (const L of title.L) animateAnimon(L, dt, 'fly');
      R.render(title.S, title.C);
    } else if (G.state === 'battle' && G.battleView) {
      G.battleView.update(dt);
      R.render(G.battleView.scene, G.battleView.cam);
    } else if (G.save && OW.scene) {
      if (G.state === 'world') { G.save.playTime += dt; saveTimer += dt; if (saveTimer > 60 && !G.busy) { saveTimer = 0; save(); } }
      // メニューを開いているときは移動しない
      const busyBefore = G.busy;
      if (topScreen() && !busyBefore) G.busy = true;
      updateOverworld(dt);
      if (topScreen() && !busyBefore) G.busy = false;
      if (OW.shake > 0) { OW.shake -= dt; OW.cam.pos[0] += (Math.random() - 0.5) * OW.shake; OW.cam.pos[1] += (Math.random() - 0.5) * OW.shake; }
      R.render(OW.dungeon ? OW.dscene : OW.scene, OW.cam);
      updateHud();
    }
  } catch (e) { console.error(e); }
  requestAnimationFrame(loop);
}

// デバッグ用（ブラウザのコンソールから確認できます）
window.ANIMON = { G, OW, SE, MENU, BATTLE, createMon, runFlow, buildBarriers, refreshActors };
boot();
