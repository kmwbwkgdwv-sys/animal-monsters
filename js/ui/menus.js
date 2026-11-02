// =============================================================
//  メニュー画面いろいろ
// =============================================================
import { SPECIES, DEX_COUNT, REGION_JA, RARITY_JA, RARITY_COL, rarityStars } from '../data/species.js';
import { MOVES, moveEffects, moveEffectText } from '../data/moves.js';
import { ITEMS, CAT_JA, SHOP_FOODS, FOOD_STARS, SHOP_HELD } from '../data/items.js';
import { ABILITIES } from '../data/abilities.js';
import { TYPES, TYPE_JA, TYPE_COLOR, typeBadge } from '../data/types.js';
import { TOWNS, STONES, DUNGEONS, REGIONS, RING, howToGet, hiddenInDex, WORLD, START_POS, naturalMetAt } from '../data/world.js';
import { CREST_JA, chLabel } from '../data/story.js';
import { G, PARTY_MAX, partyHasSpecies, itemCount, addItem, useItem, addMoney, save, healParty, crests, isUnlocked, dexCounts, findMon, monCap, monCount, monFull, canRelease } from '../game/state.js';
import { calcStats, adjBase, ivMul, monName, ivTotal, ivRank, expProgress, expToNext, healMon, maxHp, addExp, expForLevel, MAX_LV, noEvoHeld } from '../game/mon.js';
import { $, el, esc, openScreen, toast, ask, confirmBox, inputText, say, fade, hpClass, closeAllScreens } from './ui.js';
import { portrait, portraitAsync, BLANK } from '../render/portrait.js';
import { audio } from '../audio.js';
import { Input } from '../input.js';
import { STATUS_JA } from '../game/battle.js';
import { saveSettings } from '../game/save.js';
import { learnMove, evolveScene, evoStopMsg, moveCardHtml } from './battleUI.js';

const waitClose = (s) => new Promise(r => { s.onClose = r; });
const STAT_JA = { hp: 'HP（体力）', atk: '攻撃', def: '防御', spe: '素早さ' };

// ---------- メインメニュー ----------
export async function openMainMenu() {
  const s = openScreen('メニュー');
  const SE = await import('../game/storyEngine.js');
  const draw = () => {
    const c = dexCounts();
    const mins = Math.floor(G.save.playTime / 60);
    let goal = '';
    try { goal = UI_fmt(SE.objective().txt || ''); } catch (e) { /* */ }
    const bagN = Object.values(G.save.bag).reduce((a, b) => a + b, 0);
    const party = G.save.party.map(m => {
      const r = Math.max(0, m.hp / maxHp(m));
      return `<div class="mpm${m.hp <= 0 ? ' down' : ''}"><img src="${portrait(m.sp, m.shiny)}"><span class="lv">Lv${m.lv}</span><div class="hpbar"><i class="${hpClass(r)}" style="width:${r * 100}%"></i></div></div>`;
    }).join('') + Array.from({ length: Math.max(0, PARTY_MAX - G.save.party.length) }, () => '<div class="mpm empty"></div>').join('');
    s.body.innerHTML = `
    <div class="mhead">
      <div class="mprof">
        <div class="row"><b class="pname">${esc(G.save.name)}</b><span class="muted">⏱ ${Math.floor(mins / 60)}時間${mins % 60}分</span><span class="grow"></span><b class="money">¥${G.save.money.toLocaleString()}</b></div>
        <div class="mstats"><span>📖 図鑑 <b>${c.caught}</b>/${DEX_COUNT}</span><span>👀 見つけた <b>${c.seen}</b></span><span>🏅 紋章 <b>${crests()}</b>/8</span>${G.save.story?.flags?.p2clear ? '<span class="clear">★第2部クリア（経験値2倍）</span>' : G.save.postGame ? '<span class="clear">★クリア済み</span>' : ''}</div>
        <div class="mcrests">${CREST_JA.map((n, i) => `<span title="${n}" class="${i < crests() ? 'on' : ''}">${['🌳', '💧', '🏜️', '⛰️', '❄️', '🌫️', '☁️', '🌋'][i]}</span>`).join('')}</div>
        ${goal ? `<div class="mgoal"><b>⭐ 次の目的</b><span>${esc(goal)}</span></div>` : ''}
      </div>
      <div class="mparty">${party}</div>
    </div>
    <div class="mtiles"></div>`;
    const grid = s.body.querySelector('.mtiles');
    const items = [
      ['🐾', 'パーティー', `${G.save.party.length}/${PARTY_MAX}匹`, '#ff8a5c', () => openParty()],
      ['📦', 'ボックス', `所持 ${monCount()}/${monCap()}`, '#c08a4a', () => openBox()],
      ['📖', '図鑑', `${c.caught}/${DEX_COUNT}`, '#e05a7a', () => openDex()],
      ['🎒', 'バッグ', `${bagN}こ`, '#f0a830', () => openBag()],
      ['📜', 'ストーリー', `${chLabel(SE.currentStep().ch)}・サイド`, '#d98c3a', () => openJournal()],
      ['🗺️', 'マップ', '行き先を見る', '#3cb371', () => openMap()],
      ['🐎', 'ライド', '乗って移動', '#8a6adf', () => openRide()],
      ['👕', 'キャラメイク', '見た目・なまえ', '#e07ab8', async () => (await import('./charamake.js')).charaMakeInGame()],
      ['🧺', 'おつかい', `${ER_active()}/${5}件 引き受け中`, '#ff7aa8', () => openErrands()],
      ['🤝', 'フレンド', '交換・対戦', '#36a9e1', async () => (await import('./onlineUI.js')).openFriends()],
      ['🏆', 'ランキング', '図鑑の数で勝負', '#e6b422', async () => (await import('./onlineUI.js')).openRanking()],
      ['📢', 'お知らせ', '<span class="nbadge2" data-newsbadge style="display:none"></span>運営から', '#e0607a', async () => (await import('./extras.js')).openNewsList()],
      ['💾', 'セーブ', '記録する', '#4c8df0', async () => { save(); toast('セーブしました！'); try { const ON = await import('../online.js'); if (G.save.pid && ON.isConfigured() && await ON.pushSave(true)) toast('☁️ クラウドにも 保存しました（連携した端末と 共有）'); } catch (e) { /* */ } }],
      ['⚙️', '設定', '音・操作など', '#7b8aa8', () => openSettings(false)],
      ['🏠', 'タイトルへ', 'セーブして戻る', '#9a7bb5', async () => { if (await confirmBox('セーブして タイトル画面に 戻りますか？')) { save(); location.reload(); } }]];
    for (const [ic, nm, sub, col, fn] of items) {
      const b = el('button', 'mtile', `<span class="ic">${ic}</span><span class="nm">${nm}</span><span class="sub">${sub}</span>`);
      b.style.setProperty('--c', col);
      b.onclick = async () => { audio.sfx('select'); await fn(); if (!s.closed) draw(); };
      grid.appendChild(b);
    }
  };
  draw();
  import('./extras.js').then(m => m.refreshNewsBadges()).catch(() => { });
  await waitClose(s);
}

// ---------- ストーリー一覧（左上の「目的」を押すと開く） ----------
export async function openJournal() {
  const SE = await import('../game/storyEngine.js');
  ERM = await import('../game/errands.js');
  const s = openScreen('ストーリー');
  const fm = (t) => esc(UI_fmt(t || ''));
  const render = () => {
    const si = SE.storyInfo();
    // 第1部（1〜11章）と、第2部が 始まっていれば 第2部（2-1〜2-9）
    const chips = Object.entries(SE.CHAPTERS).map(([n, nm]) => +n).sort((a, b) => a - b).filter(n => n <= 11 || si.ch >= 13).map(n => { const nm = SE.CHAPTERS[n]; const st = n < si.ch || si.ch === 22 ? 'done' : n === si.ch ? 'now' : 'lock'; return `<span class="chchip ${st}" title="${esc(nm)}">${st === 'done' ? '✔' : st === 'now' ? '▶' : '🔒'} ${n <= 11 ? n : '2-' + (n - 12)}章</span>`; }).join('');
    const qs = SE.QUESTS.filter(q => !q.hidden || G.save.quests[q.id]).map(q => ({ q, i: SE.questInfo(q) }));
    const order = { active: 0, new: 1, done: 2, locked: 3 };
    qs.sort((a, b) => order[a.i.state] - order[b.i.state]);
    const badge = { active: '<span class="qbadge act">進行中</span>', new: '<span class="qbadge new">まだ 受けていない</span>', done: '<span class="qbadge done">クリア</span>', locked: '<span class="qbadge lock">？？？</span>' };
    const qrow = ({ q, i }, k) => `<div class="qrow ${i.state}"><div class="grow">
        <div class="nm">${i.state === 'locked' ? '？？？' : esc(q.name)} ${badge[i.state]}${i.state === 'active' ? `<span class="muted"> ${i.stage + 1}/${i.total}</span>` : ''}</div>
        ${i.state !== 'done' ? `<div class="ob">${i.state === 'active' ? '目的：' : ''}${fm(i.obj)}</div>` : ''}
        ${i.dest ? `<div class="ds">📍 目的地：${esc(i.dest)}</div>` : ''}</div>
        ${i.pos ? `<button class="btn sm qmap" data-k="${k}">🗺️ 地図</button>` : ''}</div>`;
    const act = ERM.activeErrands();
    s.body.innerHTML = `
      <div class="jmain">
        <div class="jch">${si.ch === 12 ? 'ストーリー クリア！' : si.ch === 22 ? '第2部 クリア！' : esc(chLabel(si.ch, true))}</div>
        <div class="jobj"><b>目的</b>${fm(si.obj)}</div>
        ${si.dest ? `<div class="jdest"><b>目的地</b>${esc(si.dest)}${si.dist != null ? `<span class="muted">（ここから ${si.dist}m）</span>` : ''}</div>` : ''}
        <div class="row" style="gap:.5em;margin-top:.5em;flex-wrap:wrap">${SE.pendingHere() ? '<button class="btn sm pri gostory">📖 ここで イベントを 始める</button>' : ''}${si.pos ? `<button class="btn sm ${SE.pendingHere() ? '' : 'pri'} smap">🗺️ 地図で 目的地を 見る</button>` : ''}</div>
        <div class="chchips">${chips}</div>
        <div class="crownrow"><span class="${G.save.crowns?.s ? 'got' : ''}">👑 銀の王冠：第6章クリア（4つ目の紋章）${G.save.crowns?.s ? ' ✔' : ''}</span><span class="g ${G.save.crowns?.g ? 'got' : ''}">👑 金の王冠：ストーリー クリア${G.save.crowns?.g ? ' ✔' : ''}</span></div>
      </div>
      <h4 style="margin:.8em 0 .3em">サイドストーリー <span class="muted" style="font-size:.8em;font-weight:400">クリア ${qs.filter(x => x.i.state === 'done').length}/${qs.length}</span></h4>
      ${qs.map(qrow).join('')}
      <h4 style="margin:.8em 0 .3em">ダンジョン <span class="muted" style="font-size:.8em;font-weight:400">何度でも 周回できる（入るたびに 形が 変わり、主と 宝箱が 復活）</span></h4>
      ${Object.entries(DUNGEONS).map(([id, d]) => { const open = isUnlocked(d.region) && (!d.post || G.save.postGame); const n = (G.save.runs || {})[id] || (G.save.cleared[id] ? 1 : 0); return `<div class="qrow ${open ? (n ? 'done2' : '') : 'locked'}"><div class="grow"><div class="nm">${open ? esc(d.name) : '？？？'} <span class="muted" style="font-size:.8em">推奨Lv${d.rec + Math.min(10, ((G.save.runs || {})[id] || 0) * 2)}</span></div><div class="ds">${open ? (n ? `クリア ${n}回${(G.save.bossCaught || {})[id] ? '・主を なつかせた' : ''}` : 'まだ クリアしていない') : 'ストーリーを 進めると 行けるようになる'}</div></div>${open ? `<button class="btn sm dmap" data-id="${id}">🗺️ 地図</button>` : ''}</div>`; }).join('')}
      <h4 style="margin:.8em 0 .3em">おつかい <span class="muted" style="font-size:.8em;font-weight:400">${act.length}件 引き受け中・完了 ${G.save.errandsDone || 0}回</span></h4>
      ${act.map(e => { const pr = ERM.reqProgress(e.g, e.s, e.req); return `<div class="qrow"><div class="grow"><div class="nm">${esc(ERM.reqSummary(e.req))}</div><div class="ds">${esc(ERM.TOWN_NAME[e.g.town])}の ${esc(e.g.name)}　${pr.ok ? '✅ 報告できる' : esc(pr.txt)}</div></div></div>`; }).join('') || '<p class="muted">町の 人の 頭の上に 🧺 が 出ていたら 話しかけてみよう。</p>'}
      <div class="row" style="margin-top:.4em"><button class="btn sm errs">🧺 おつかいの 画面を 開く</button></div>`;
    const sm = s.body.querySelector('.smap');
    if (sm) sm.onclick = () => openMap({ x: si.pos[0], z: si.pos[1], label: si.dest, obj: si.obj, title: 'ストーリーの 目的地' });
    const gs = s.body.querySelector('.gostory');
    if (gs) gs.onclick = () => { audio.sfx('select'); goStory = true; s.close(); };
    s.body.querySelectorAll('.qmap').forEach(b => b.onclick = () => { const { q, i } = qs[+b.dataset.k]; openMap({ x: i.pos[0], z: i.pos[1], label: q.name, obj: `${q.name}：${i.obj}`, title: 'サイドストーリー' }); });
    s.body.querySelector('.errs').onclick = async () => { await openErrands(); if (!s.closed) render(); };
    s.body.querySelectorAll('.dmap').forEach(b => b.onclick = () => { const d = DUNGEONS[b.dataset.id]; openMap({ x: d.pos[0], z: d.pos[1], label: d.name, obj: `${d.name}（推奨Lv${d.rec}）`, title: 'ダンジョン' }); });
  };
  let goStory = false;
  render();
  await waitClose(s);
  if (goStory) { closeAllScreens(); await SE.startPendingHere(); }
}

// ---------- おつかい ----------
let ERM = null;
const ER_active = () => { try { return ERM ? ERM.activeErrands().length : Object.values(G.save.errands || {}).filter(x => x.st === 'active').length; } catch (e) { return 0; } };
export async function openErrands() {
  ERM = await import('../game/errands.js');
  const { MATS, errandReward, ERRAND_MAX, GIVER_BY_ID } = await import('../data/errands.js');
  const s = openScreen('おつかい', { extra: `<span class="muted">完了 ${G.save.errandsDone || 0}回</span>` });
  const render = () => {
    const act = ERM.activeErrands();
    const rows = act.map(e => {
      const pr = ERM.reqProgress(e.g, e.s, e.req), money = errandReward(e.req, e.g.town);
      const where = e.req.t === 'deliver' ? `とどけ先：${ERM.TOWN_NAME[GIVER_BY_ID[e.req.to].town]}の ${GIVER_BY_ID[e.req.to].name}` : `たのんだ人：${ERM.TOWN_NAME[e.g.town]}の ${e.g.name}`;
      return `<div class="errow${pr.ok ? ' ok' : ''}"><div class="grow"><div class="nm">${esc(ERM.reqSummary(e.req))}</div>
        <div class="ds">${esc(where)}</div></div>
        <div class="prog">${pr.ok ? '✅ 報告できる' : esc(pr.txt)}</div><div class="money">¥${money}</div>
        <button class="btn sm cancel" data-id="${e.g.id}">やめる</button></div>`;
    }).join('');
    const mats = Object.values(MATS).map(M => `<span class="matc"><b>${M.icon}</b>${M.name} <em>${itemCount(M.item)}</em></span>`).join('');
    s.body.innerHTML = `
      <div class="card errhelp">町の 住民や 通行人の 頭の上の <b>🧺</b> は お願いの しるし。話しかけると おつかいを たのまれる。<br>
      <b>💰</b> は 報告できる、<b>📦</b> は 届け物の あいて。同時に 引き受けられるのは ${ERRAND_MAX}つまで。</div>
      <h4 style="margin:.6em 0 .3em">引き受け中（${act.length}/${ERRAND_MAX}）</h4>
      ${rows || '<p class="muted">いまは 何も 引き受けていない。町の 人に 話しかけてみよう！</p>'}
      <h4 style="margin:.8em 0 .3em">素材 <span class="muted" style="font-size:.8em;font-weight:400">フィールドの 木・岩・しげみ などの 前で A（Space）</span></h4>
      <div class="matlist">${mats}</div>`;
    s.body.querySelectorAll('.cancel').forEach(b => b.onclick = async () => {
      if (!(await confirmBox('この おつかいを やめますか？'))) return;
      ERM.cancelErrand(b.dataset.id); toast('おつかいを やめた'); render();
    });
  };
  render();
  await waitClose(s);
}

// ---------- 小さい部品 ----------
// ライドできる アニモンの しるし（陸・水・空）
export const RIDE_JA = { land: '陸を走る', swim: '水を泳ぐ', fly: '空を飛ぶ' };
export const RIDE_IC = { land: '🐎', swim: '🌊', fly: '🕊️' };
export function rideBadge(sp, short = false) { const r = SPECIES[sp]?.ride; return r ? `<span class="ridebadge ${r}" title="ライドできる（${RIDE_JA[r]}）">${RIDE_IC[r]}${short ? '' : 'ライド'}</span>` : ''; }
function monCardHtml(m, extra = '') {
  const mx = maxHp(m), r = m.hp / mx;
  return `<img src="${portrait(m.sp, m.shiny)}"><div class="info"><div class="nm">${m.shiny ? '<span class="shiny">✨</span>' : ''}${esc(monName(m))} <span class="lv">Lv${m.lv}</span>${rideBadge(m.sp, true)}${m.status ? `<span class="st ${m.status}">${STATUS_JA[m.status]}</span>` : ''}${m.hp <= 0 ? '<span class="st fnt">ひんし</span>' : ''}</div>
  <div style="font-size:.75em">${SPECIES[m.sp].types.map(typeBadge).join('')}${m.item ? ` <span class="muted">🎁${esc(ITEMS[m.item]?.name || '')}</span>` : ''}</div>
  <div class="hpbar"><i class="${hpClass(r)}" style="width:${Math.max(0, r * 100)}%"></i></div><div class="muted" style="font-size:.78em">HP ${m.hp}/${mx}${extra}</div></div>`;
}

// ボックスから パーティーに 入れるのは 病院（アニモン病院の 受付）で だけ。並べかえ・預けるのは いつでも
let atHospital = false;
export const canWithdraw = () => atHospital;
const NEED_HOSPITAL = '📦 ボックスから パーティーに 入れるのは アニモン病院で できます（受付で「パーティーを 変更する」）';

// 並べかえ（パーティー・ボックス 共通）
const SORT_OPTS = [['new', '新しい順'], ['lvd', 'レベルが 高い順'], ['lva', 'レベルが 低い順'], ['dex', '図鑑番号順'], ['type', 'タイプ順'], ['iv', '個体値が 高い順'], ['hp', 'HPが 多い順'], ['name', '名前順']];
const TYPE_ORDER = Object.keys(TYPE_JA);
const MON_SORT = {
  new: (a, b) => (b.caughtAt || 0) - (a.caughtAt || 0),
  lvd: (a, b) => b.lv - a.lv || a.sp - b.sp, lva: (a, b) => a.lv - b.lv || a.sp - b.sp,
  dex: (a, b) => a.sp - b.sp || b.lv - a.lv,
  type: (a, b) => TYPE_ORDER.indexOf(SPECIES[a.sp].types[0]) - TYPE_ORDER.indexOf(SPECIES[b.sp].types[0]) || TYPE_ORDER.indexOf(SPECIES[a.sp].types[1] || '') - TYPE_ORDER.indexOf(SPECIES[b.sp].types[1] || '') || a.sp - b.sp,
  iv: (a, b) => ivTotal(b) - ivTotal(a), hp: (a, b) => maxHp(b) - maxHp(a),
  name: (a, b) => monName(a).localeCompare(monName(b), 'ja'),
};
// ボックスの 小さい カード用：タイプ（色つきの 短い 札）と 持ち物の しるし
const TYPE_SHORT = { normal: 'ノ', fire: '炎', water: '水', grass: '草', steel: '鋼', poison: '毒', electric: '電', ice: '氷', fighting: '闘', ground: '地', flying: '飛', psychic: 'エ', bug: '虫', rock: '岩', ghost: 'ゴ', dragon: '竜', dark: '悪', fairy: 'フ' };
export function typeDots(sp) { return `<div class="tdotrow">${SPECIES[sp].types.map(t => `<span class="tdot" style="background:${TYPE_COLOR[t]}" title="${TYPE_JA[t]}">${TYPE_SHORT[t]}</span>`).join('')}</div>`; }
export function heldMark(m) { const it = m.item && ITEMS[m.item]; return it ? `<span class="heldmark" title="持ち物：${esc(it.name)}">${it.icon || '🎁'}</span><div class="heldnm">${esc(it.name)}</div>` : ''; }

// ---------- パーティー ----------
export async function openParty() {
  const s = openScreen('パーティー', { extra: '<span class="muted">長押しして ドラッグで 入れかえ</span>' });
  let q = '';
  G.ptBoxSort ||= 'new';
  const P = () => G.save.party, B = () => G.save.box;
  const renderBox = () => {
    const box = s.body.querySelector('.ptbox'); if (!box) return;
    box.innerHTML = '';
    const list = B().map((m, i) => ({ m, i })).filter(({ m }) => !q || monName(m).includes(q) || SPECIES[m.sp].name.includes(q));
    const cmp = MON_SORT[G.ptBoxSort]; if (cmp) list.sort((a, b) => cmp(a.m, b.m));
    if (!list.length) box.innerHTML = `<p class="muted" style="margin:.6em">${B().length ? '見つかりません' : 'ボックスは からっぽ。ここに パーティーの アニモンを 落とすと 預けられます'}</p>`;
    for (const { m, i } of list) {
      const c = el('button', 'bxcard' + (partyHasSpecies(m.sp) ? ' dup' : ''), `<img src="${BLANK}" draggable="false">${heldMark(m)}<div class="nm">${m.shiny ? '✨' : ''}${esc(monName(m))}</div><div class="lv">Lv${m.lv}${rideBadge(m.sp, true)}</div>${typeDots(m.sp)}`);
      c.dataset.drag = 'box'; c.dataset.i = i;
      portraitAsync(m.sp, m.shiny, false, (u) => { const im = c.querySelector('img'); if (im) im.src = u; });
      c.onclick = async () => { if (justDragged()) return; audio.sfx('select'); await monDetail(m, 'box'); render(); };
      box.appendChild(c);
    }
  };
  const render = () => {
    s.body.innerHTML = `<div class="pttools"><button class="btn sm psort">↕ パーティーを 並べかえ</button><button class="btn sm ppreset">💾 パーティーの 保存・呼び出し</button></div><div class="ptgrid"></div>
      <div class="pthint">👆 アニモンを <b>長押し</b>（PCは そのまま ドラッグ）して ほかの アニモンに 重ねると 順番が 入れかわります。下の ボックスに 落とすと 預けます。${atHospital ? 'ボックスの 子を 上に 落とすと パーティーに 入ります。' : '<b class="hosp">🏥 ボックスの 子を パーティーに 入れるのは アニモン病院で できます。</b>'}</div>
      <div class="ptboxhd"><b>📦 ボックス</b><span class="muted">${B().length}匹・持てる数 ${monCount()}/${monCap()}</span><span class="grow"></span><select class="bsort">${SORT_OPTS.map(([v, n]) => `<option value="${v}" ${G.ptBoxSort === v ? 'selected' : ''}>${n}</option>`).join('')}</select><input class="textin q" placeholder="名前で さがす" value="${esc(q)}"></div>
      <div class="ptbox" data-drop="box"></div>`;
    const grid = s.body.querySelector('.ptgrid');
    for (let i = 0; i < PARTY_MAX; i++) {
      const m = P()[i];
      if (m) {
        const c = el('button', 'mcard ptcard' + (m.hp <= 0 ? ' fnt' : ''), `<span class="ptno">${i + 1}</span>` + monCardHtml(m, i === 0 ? '　<b style="color:var(--acc)">先頭</b>' : ''));
        c.dataset.drag = 'party'; c.dataset.drop = 'party'; c.dataset.i = i;
        c.querySelectorAll('img').forEach(im => { im.draggable = false; });
        c.onclick = async () => { if (justDragged()) return; audio.sfx('select'); await monDetail(m, 'party'); render(); };
        grid.appendChild(c);
      } else {
        const c = el('div', 'ptslot', '<span>＋ 空き</span><small>ボックスから ここへ</small>');
        c.dataset.drop = 'party'; c.dataset.i = i;
        grid.appendChild(c);
      }
    }
    const inp = s.body.querySelector('.q');
    inp.onkeydown = (e) => e.stopPropagation();
    inp.oninput = () => { q = inp.value.trim(); renderBox(); };
    s.body.querySelector('.bsort').onchange = (e) => { G.ptBoxSort = e.target.value; renderBox(); };
    s.body.querySelector('.psort').onclick = async () => {
      audio.sfx('select');
      const opts = SORT_OPTS.filter(([v]) => v !== 'new');
      const k = await ask('パーティーを どの 順番に 並べる？（いちばん 前が 先頭で 戦う）', [...opts.map(o => o[1]), 'やめる']);
      if (k >= opts.length) return;
      P().sort(MON_SORT[opts[k][0]]); save(); toast(`${opts[k][1]}に 並べかえた！（先頭：${monName(P()[0])}）`); render();
    };
    s.body.querySelector('.ppreset').onclick = async () => { audio.sfx('select'); await openPresets(); render(); };
    renderBox();
  };

  // ---- ドラッグ（指で スライド）----
  let drag = null, dragEnd = 0;
  const justDragged = () => performance.now() - dragEnd < 350;
  const begin = (d) => {
    if (d.active) return;
    if (s.closed || !s.body.isConnected) { drag = null; return; }
    d.active = true;
    const src = d.zone === 'party' ? P()[d.i] : B()[d.i]; if (!src) { drag = null; return; }
    d.mon = src;
    const g = el('div', 'dragghost', `<img src="${portrait(src.sp, src.shiny)}"><b>${esc(monName(src))}</b>`);
    document.body.appendChild(g); d.ghost = g;
    d.el.classList.add('dragging');
    s.body.classList.add('isdrag');
    // つかんだまま 画面の 上下の 端に 近づけると 自動で スクロール（ボックスが 縦に 長くても パーティーまで 運べる）
    const edge = () => {
      if (drag !== d || !d.active) return;
      const r = s.body.getBoundingClientRect(), zone = Math.min(70, r.height * 0.18);
      const v = d.y < r.top + zone ? -(r.top + zone - d.y) : d.y > r.bottom - zone ? d.y - (r.bottom - zone) : 0;
      if (v) { s.body.scrollTop += Math.max(-18, Math.min(18, v * 0.35)); move(d.x, d.y); }
      d.raf = requestAnimationFrame(edge);
    };
    d.raf = requestAnimationFrame(edge);
    try { navigator.vibrate && navigator.vibrate(12); } catch (e) { /* */ }
    audio.sfx('select');
    move(d.x, d.y);
  };
  const targetAt = (x, y) => { const e = document.elementFromPoint(x, y); return e && e.closest && e.closest('[data-drop]'); };
  const move = (x, y) => {
    const d = drag; if (!d || !d.active) return;
    d.ghost.style.left = x + 'px'; d.ghost.style.top = y + 'px';
    const t = targetAt(x, y);
    if (d.hover !== t) { if (d.hover) d.hover.classList.remove('dropon'); d.hover = t; if (t && t !== d.el) t.classList.add('dropon'); }
  };
  const finish = (x, y) => {
    const d = drag; drag = null;
    if (!d) return;
    clearTimeout(d.timer);
    if (!d.active) return;
    cancelAnimationFrame(d.raf);
    dragEnd = performance.now();
    d.ghost.remove(); d.el.classList.remove('dragging'); s.body.classList.remove('isdrag');
    if (d.hover) d.hover.classList.remove('dropon');
    const t = targetAt(x, y);
    if (!t) return;
    drop(d, t.dataset.drop, +t.dataset.i);
  };
  const drop = (d, zone, j) => {
    const party = P(), box = B();
    const species = (m) => SPECIES[m.sp].name;
    if (d.zone === 'party' && zone === 'party') {
      if (j === d.i) return;
      if (j >= party.length) { const [m] = party.splice(d.i, 1); party.push(m); toast(`${monName(m)} を うしろへ`); }
      else { [party[d.i], party[j]] = [party[j], party[d.i]]; toast(j === 0 || d.i === 0 ? `${monName(party[0])} が 先頭に なった！` : '入れかえました'); }
    } else if (d.zone === 'party' && zone === 'box') {
      if (party.length <= 1) { toast('パーティーが 0匹に なってしまう！'); return; }
      const [m] = party.splice(d.i, 1); box.unshift(m); toast(`${monName(m)} を ボックスに 預けた`);
    } else if (d.zone === 'box' && zone === 'party') {
      if (!atHospital) { toast(NEED_HOSPITAL, 3600); return; }
      const m = box[d.i]; if (!m) return;
      if (j < party.length) {
        const out = party[j];
        if (party.some((x, k) => k !== j && x.sp === m.sp)) { toast(`${species(m)} は もう パーティーに いる！（同じアニモンは 1匹まで）`); return; }
        party[j] = m; box.splice(d.i, 1); box.unshift(out);
        toast(`${monName(m)} と ${monName(out)} を 入れかえた！`);
      } else {
        if (party.length >= PARTY_MAX) { toast('パーティーが いっぱい！'); return; }
        if (partyHasSpecies(m.sp)) { toast(`${species(m)} は もう パーティーに いる！（同じアニモンは 1匹まで）`); return; }
        box.splice(d.i, 1); party.push(m); toast(`${monName(m)} を パーティーに 入れた！`);
      }
    } else return;
    audio.sfx('item'); save(); render();
  };
  const onDown = (e) => {
    const c = e.target.closest && e.target.closest('[data-drag]'); if (!c || !s.body.contains(c)) return;
    if (e.button !== undefined && e.button > 0) return;
    drag = { zone: c.dataset.drag, i: +c.dataset.i, el: c, x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY, id: e.pointerId, type: e.pointerType, active: false };
    // 指は 長押しで つかむ（ふつうに なぞると スクロール）、マウスは 少し 動かせば つかむ
    if (e.pointerType !== 'mouse') { const d = drag; d.timer = setTimeout(() => { if (drag === d) begin(d); }, 260); }
  };
  const onMove = (e) => {
    const d = drag; if (!d || e.pointerId !== d.id) return;
    d.x = e.clientX; d.y = e.clientY;
    const far = Math.hypot(d.x - d.x0, d.y - d.y0);
    if (!d.active) {
      if (d.type === 'mouse' && far > 6) begin(d);
      else if (d.type !== 'mouse' && far > 12) { clearTimeout(d.timer); drag = null; }   // 長押し前に 動いた ＝ スクロール
      return;
    }
    move(d.x, d.y);
  };
  const onUp = (e) => { if (drag && e.pointerId === drag.id) finish(e.clientX, e.clientY); };
  // スマホ：つかんだ あとで 指を 上下に 動かすと、ブラウザが スクロールと 思って pointercancel を 出すことが ある。
  //  そのときは タッチの 動き（touchmove / touchend）で ドラッグを 続ける
  const onCancel = (e) => { if (drag && e.pointerId === drag.id) { const d = drag; if (d.active) { if (d.type !== 'mouse') return; finish(d.x, d.y); } else { clearTimeout(d.timer); drag = null; } } };
  // つかんでいる あいだは 画面が スクロールしないように（指の 位置で ドラッグを 動かす）
  const noScroll = (e) => {
    if (!drag || !drag.active) return;
    if (e.cancelable) e.preventDefault();
    const t = e.touches && e.touches[0]; if (!t) return;
    drag.x = t.clientX; drag.y = t.clientY; move(drag.x, drag.y);
  };
  const onTouchEnd = (e) => { if (drag && drag.active && drag.type !== 'mouse') { const t = e.changedTouches && e.changedTouches[0]; finish(t ? t.clientX : drag.x, t ? t.clientY : drag.y); } };
  s.body.addEventListener('pointerdown', onDown);
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
  window.addEventListener('pointercancel', onCancel);
  document.addEventListener('touchmove', noScroll, { passive: false });
  document.addEventListener('touchend', onTouchEnd); document.addEventListener('touchcancel', onTouchEnd);
  s.body.addEventListener('contextmenu', (e) => e.preventDefault());
  // 画面を 閉じたら（つかんでいる 途中でも）ドラッグを すぐ 片付ける
  const cleanupDrag = () => {
    if (drag) { clearTimeout(drag.timer); cancelAnimationFrame(drag.raf); if (drag.ghost) drag.ghost.remove(); if (drag.el) drag.el.classList.remove('dragging'); drag = null; }
    document.querySelectorAll('.dragghost').forEach(g => g.remove());
    document.body.classList.remove('isdrag');
  };
  render();
  await waitClose(s);
  cleanupDrag();
  window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp); window.removeEventListener('pointercancel', onCancel);
  document.removeEventListener('touchmove', noScroll);
  document.removeEventListener('touchend', onTouchEnd); document.removeEventListener('touchcancel', onTouchEnd);
  (await import('../game/overworld.js')).refreshFollower();
}

// ---------- 詳細 ----------
export async function monDetail(m, where, opts = {}) {
  const s = openScreen(monName(m), opts.readOnly ? { extra: `<span class="muted">${esc(opts.note || '見るだけ')}</span>` } : {});
  const render = () => {
    const sp = SPECIES[m.sp], st = calcStats(m), ab = ABILITIES[sp.ability];
    const ivr = ivRank(m);
    const ab2 = adjBase(m);
    // 種族値 → 個体値で調整 → いまのレベルでの能力
    const statRow = (k) => {
      const b = sp.base[k], a = ab2[k], pct = (ivMul(m.iv[k]) - 1) * 100, iv = m.iv[k];
      const cls = pct > 0.05 ? 'up' : pct < -0.05 ? 'dn' : '';
      return `<div class="sttr"><span class="k">${STAT_JA[k].replace(/（.*）/, '')}</span><span class="b">${b}</span>
        <span class="iv"><i style="width:${iv / 15 * 100}%"></i><em>${iv}</em></span>
        <span class="a ${cls}">${a.toFixed(1)}<small>${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%</small></span>
        <span class="v">${st[k]}</span><span class="bar"><i style="width:${Math.min(100, st[k] / (k === 'hp' ? 3.6 : 2.6))}%"></i></span></div>`;
    };
    s.head.querySelector('h2').textContent = monName(m);
    s.body.innerHTML = `<div class="detail"><div><img class="bigpic" src="${portrait(m.sp, m.shiny)}">
      <div style="text-align:center;margin-top:.4em">${m.shiny ? '<span class="shiny">✨色違い</span> ' : ''}${m.fav ? '★お気に入り' : ''}</div>
      <div class="muted" style="text-align:center;font-size:.8em">No.${String(sp.id).padStart(3, '0')} ${esc(sp.name)}<br>おや：${esc(m.ot || G.save.name)}　${esc(naturalMetAt(m))}</div></div>
      <div>
        <div class="row"><b style="font-size:1.2em">${esc(monName(m))}</b>${opts.readOnly ? '' : '<button class="btn sm nickbtn" title="ニックネームを 変える">✏️ 名前</button>'}<span class="lv" style="color:var(--acc);font-weight:800">Lv${m.lv}</span>${sp.types.map(typeBadge).join('')}${rideBadge(m.sp)}</div>
        ${sp.ride ? `<div class="ridenote">🐎 この子には ライドできる（${RIDE_JA[sp.ride]}）。メニューの「ライド」か ライドボタンで 乗れます${opts.readOnly ? '' : '（ボックスに いても OK）'}。</div>` : ''}
        <div class="muted" style="font-size:.85em">次のレベルまで ${expToNext(m).toLocaleString()} EXP</div><div class="expbar"><i style="width:${expProgress(m) * 100}%"></i></div>
        <div class="card" style="margin:.5em 0;padding:.5em"><b>特殊能力：${esc(ab?.name || '')}</b><div class="muted">${esc(ab?.desc || '')}</div></div>
        <div class="card" style="padding:.5em">持ち物：<b>${m.item ? `${ITEMS[m.item].icon && ITEMS[m.item].noEvo ? ITEMS[m.item].icon + ' ' : ''}${esc(ITEMS[m.item].name)}` : 'なし'}</b>${m.item ? `<div class="muted">${esc(ITEMS[m.item].desc)}</div>` : ''}</div>
        ${sp.evoTo ? `<div class="evonote${noEvoHeld(m) ? ' stop' : ''}">${noEvoHeld(m) ? `🧿 ${esc(ITEMS[m.item].name)}を 持っているので 進化しない（ふつうは Lv${sp.evoLv}で 進化）` : m.lv >= sp.evoLv ? `✨ 次に 経験値が 入ると 進化する（Lv${sp.evoLv}〜）` : `Lv${sp.evoLv}で 進化する`}</div>` : ''}
        <h4 style="margin:.6em 0 .2em">能力 <span class="muted" style="font-size:.78em;font-weight:400">個体値 <b style="color:${ivr.c}">${ivr.s}・合計${ivTotal(m)}/60</b></span></h4>
        <div class="sttable"><div class="sttr hd"><span class="k"></span><span class="b">種族値</span><span class="iv">個体値</span><span class="a">調整後</span><span class="v">Lv${m.lv}</span><span class="bar"></span></div>${['hp', 'atk', 'def', 'spe'].map(statRow).join('')}
        <div class="stnote">個体値 7.5 が基準。15 なら 種族値 +9%、1 なら −7.8%（1ごとに 1.2%）</div></div>
        <h4 style="margin:.6em 0 .2em">技</h4>${m.moves.map(x => { const mv = MOVES[x.id]; return `<div class="movechip" style="border-left-color:${TYPE_COLOR[mv.type]}"><span><b>${esc(mv.name)}</b> <span class="muted">${TYPE_JA[mv.type]}・${mv.power ? '威力' + mv.power : '変化'}${mv.acc ? '・命中' + mv.acc : ''}</span><span class="mvdesc">${esc(mv.desc)}${moveEffects(mv).length ? `<em>${esc(moveEffectText(mv))}</em>` : ''}</span></span><span class="pp">PP ${x.pp}/${mv.pp}</span></div>`; }).join('')}
        <div class="row" style="margin-top:.7em" id="acts"></div>
      </div></div>`;
    const acts = s.body.querySelector('#acts');
    if (opts.readOnly) return;   // トレード相手の アニモンなど：見るだけ
    const nb = s.body.querySelector('.nickbtn');
    if (nb) nb.onclick = async () => { audio.sfx('select'); if (await renameMon(m)) render(); };
    const btn = (t, fn, cls = '') => { const b = el('button', 'btn sm ' + cls, t); b.onclick = async () => { audio.sfx('select'); await fn(); render(); }; acts.appendChild(b); };
    const pi = G.save.party.indexOf(m), bi = G.save.box.indexOf(m);
    if (pi > 0) btn('先頭にする', () => { G.save.party.splice(pi, 1); G.save.party.unshift(m); toast('先頭にしました'); });
    if (pi >= 0) btn('ボックスへ預ける', () => {
      if (G.save.party.length <= 1) { toast('パーティーが 0匹に なってしまう！'); return; }
      G.save.party.splice(pi, 1); G.save.box.unshift(m); toast('ボックスに 預けました'); s.close();
    });
    if (bi >= 0) btn(atHospital ? 'パーティーに入れる' : '🏥 パーティーに入れる', async () => {
      if (!atHospital) { toast(NEED_HOSPITAL, 3600); return; }
      if (partyHasSpecies(m.sp)) { toast('同じアニモンが すでに パーティーにいる！'); return; }
      if (G.save.party.length >= PARTY_MAX) {
        const k = await ask('パーティーが いっぱいです。だれと 入れかえる？', [...G.save.party.map(x => monName(x)), 'やめる']);
        if (k >= G.save.party.length) return;
        const out = G.save.party[k];
        if (G.save.party.some((x, i) => i !== k && x.sp === m.sp)) { toast('同じアニモンが パーティーにいる！'); return; }
        G.save.party[k] = m; G.save.box.splice(G.save.box.indexOf(m), 1); G.save.box.unshift(out);
      } else { G.save.box.splice(bi, 1); G.save.party.push(m); }
      toast('パーティーに 入れました'); s.close();
    }, 'pri');
    btn('持ち物', () => pickHeld(m));
    btn('ニックネーム', () => renameMon(m));
    if (sp.ride && !opts.readOnly) btn(`📌 ${RIDE_SHORT[sp.ride]}の ライドに 登録`, () => { rideSet()[sp.ride] = m.uid; save(); audio.sfx('item'); toast(`${RIDE_IC[sp.ride]} ${RIDE_SHORT[sp.ride]}の ライドに ${monName(m)} を 登録した！`); });
    if (sp.ride) btn(`${RIDE_IC[sp.ride]} この子に 乗る`, async () => { const ov = await import('../game/overworld.js'); if (ov.OW.dungeon && sp.ride === 'fly') { toast('ダンジョンの中では 空を飛べない！'); return; } closeAllScreens(); ov.startRide(m); });
    if (itemCount('scroll')) btn('巻物で技を覚える', () => scrollLearn(m));
    if (bi >= 0) btn(m.fav ? '★を外す' : '★お気に入り', () => { m.fav = !m.fav; });
    if (bi >= 0 || (pi >= 0 && G.save.party.length > 1)) btn('🌿 逃がす', async () => {
      if (await releaseMons([m])) s.close();
    }, 'red');
    save();
  };
  render();
  await waitClose(s);
}
// ニックネーム（パーティー・ボックス どちらの 子でも）
export async function renameMon(m) {
  const sp = SPECIES[m.sp];
  const nm = await inputText('ニックネーム（10文字まで・空欄で 元の名前）', m.nick || sp.name, 10);
  if (nm === null) return false;
  m.nick = !nm || nm === sp.name ? '' : nm;
  toast(m.nick ? `「${m.nick}」に なった！` : `名前を ${sp.name} に もどした`);
  save();
  return true;
}
async function pickHeld(m) {
  const held = Object.values(ITEMS).filter(i => i.cat === 'held' && itemCount(i.id) > 0);
  const opts = [...held.map(i => `${i.name}（×${itemCount(i.id)}）`)];
  if (m.item) opts.unshift(`${ITEMS[m.item].name} を外す`);
  opts.push('やめる');
  if (opts.length === 1) { toast('持たせる道具が ない'); return; }
  const k = await ask('どれを 持たせる？（持ち物は1つまで）', opts);
  if (k === opts.length - 1) return;
  if (m.item && k === 0) { addItem(m.item, 1); toast(`${ITEMS[m.item].name} を バッグに 戻した`); m.item = null; return; }
  const it = held[m.item ? k - 1 : k];
  if (m.item) addItem(m.item, 1);
  useItem(it.id); m.item = it.id; toast(`${it.name} を 持たせた！`);
}
async function scrollLearn(m) {
  const sp = SPECIES[m.sp];
  const cand = sp.moves.map(x => x.id).filter(id => !m.moves.find(y => y.id === id));
  if (!cand.length) { toast('覚えられる技は 全部 覚えている！'); return; }
  // 技の くわしい 説明（タイプ・威力・命中・PP・説明・効果）を カードで 全部 見せて 選ぶ
  const id = await new Promise(res => {
    const ov = el('div', 'learnov scrollov');
    ov.innerHTML = `<div class="lbox"><div class="lttl lhead"><span class="grow">📜 おもいだしの巻物：${esc(monName(m))} に どの技を 覚えさせる？</span><button class="btn sm red cancel2">✕ もどる</button></div>
      <div class="lq">覚えられる 技（${cand.length}）</div><div class="lmlist cand"></div>
      <div class="lq" style="color:#cfe0ff">いま 覚えている 技</div><div class="lmlist now"></div>
      <div class="row lbtns"><button class="btn cancel">やめる</button></div></div>`;
    const lc = ov.querySelector('.cand'), ln = ov.querySelector('.now');
    for (const cid of cand) {
      const mv = MOVES[cid];
      const c = el('div', 'lmcard', moveCardHtml(mv));
      const b = el('button', 'btn sm pri', 'この技を 覚える');
      b.onclick = (e) => { e.stopPropagation(); audio.sfx('select'); ov.remove(); res(cid); };
      c.appendChild(b); lc.appendChild(c);
    }
    for (const x of m.moves) ln.appendChild(el('div', 'lmcard cur', moveCardHtml(MOVES[x.id], x.pp)));
    const cancel = (e) => { if (e) e.stopPropagation(); audio.sfx('cancel'); ov.remove(); window.removeEventListener('keydown', onKey, true); res(null); };
    const onKey = (e) => { if (e.key === 'Escape' || e.key === 'Backspace') { e.preventDefault(); cancel(); } };
    ov.querySelector('.cancel').onclick = cancel; ov.querySelector('.cancel2').onclick = cancel;
    window.addEventListener('keydown', onKey, true);
    $('#ui').appendChild(ov);
  });
  if (!id) return;
  useItem('scroll');
  await learnMove(m, id);
}

// ---------- ボックス（しぼりこみ付き） ----------
// ---------- 逃がす（1匹・まとめて 共通） ----------
//  ルルは 逃がせない（伝説は もう一度 確認）。パーティーは 最低1匹 残す。持たせていた 道具は バッグに もどる
export async function releaseMons(list) {
  const ok = list.filter(m => canRelease(m));
  const ng = list.length - ok.length;
  if (!ok.length) { toast('この子は 逃がせない！（ルル）'); return false; }
  const inParty = ok.filter(m => G.save.party.includes(m));
  if (inParty.length && inParty.length >= G.save.party.length) { toast('パーティーが 0匹に なってしまう！'); return false; }
  const shiny = ok.filter(m => m.shiny).length, high = ok.filter(m => ivTotal(m) >= 50).length, fav = ok.filter(m => m.fav).length;
  const warn = [shiny ? `✨色違い ${shiny}匹` : '', high ? `💎個体値の高い子 ${high}匹` : '', fav ? `★お気に入り ${fav}匹` : ''].filter(Boolean).join('・');
  const head = ok.length === 1 ? `${monName(ok[0])}（Lv${ok[0].lv}）を 逃がしますか？` : `${ok.length}匹を まとめて 逃がしますか？`;
  if (!(await confirmBox(`${head}${warn ? `\n⚠ ${warn} が ふくまれています` : ''}${ng ? `\n（ルルは 逃がせないので 残ります）` : ''}\n逃がした アニモンは もどってきません。`, '逃がす', 'やめる'))) return false;
  if (ok.length >= 10 && !(await confirmBox(`ほんとうに ${ok.length}匹を 逃がしますか？`, '逃がす', 'やめる'))) return false;
  // 伝説は もう 手に 入らないので、もう一度 確認
  const legs = ok.filter(m => SPECIES[m.sp]?.legend);
  if (legs.length && !(await confirmBox(`⚠ 伝説の アニモン（${legs.map(m => monName(m)).join('・')}）が ふくまれています。\n逃がすと もう 二度と 手に入りません。\nほんとうに 逃がしますか？`, '逃がす', 'やめる'))) return false;
  const st = G.save.story || {};
  if (legs.some(m => m.uid === st.legendUid)) st.legendReleased = true;
  let items = 0;
  for (const m of ok) {
    if (m.item) { addItem(m.item, 1); items++; m.item = null; }
    for (const arr of [G.save.party, G.save.box]) { const i = arr.indexOf(m); if (i >= 0) arr.splice(i, 1); }
  }
  audio.sfx('cancel');
  toast(ok.length === 1 ? `${monName(ok[0])} は 元気に 帰っていった……` : `${ok.length}匹が 元気に 帰っていった……`, 2800);
  if (items) toast(`持たせていた 道具 ${items}個は バッグに もどした`, 2800);
  save();
  return true;
}

export async function openBox(opts = {}) {
  const s = openScreen('ボックス');
  const f = G.boxFilter ||= { q: '', type: '', sort: 'new', shiny: false, fav: false, iv: 0 };
  s.body.innerHTML = `<div class="filters">
    <input class="q" placeholder="名前で検索" value="${esc(f.q)}">
    <select class="type"><option value="">すべてのタイプ</option>${TYPES.map(t => `<option value="${t}" ${f.type === t ? 'selected' : ''}>${TYPE_JA[t]}</option>`).join('')}</select>
    <select class="sort">${[['new', '新しい順'], ['dex', '図鑑番号順'], ['lv', 'レベルが高い順'], ['iv', '個体値が高い順'], ['name', '名前順']].map(([v, n]) => `<option value="${v}" ${f.sort === v ? 'selected' : ''}>${n}</option>`).join('')}</select>
    <select class="iv">${[[0, '個体値：すべて'], [30, '個体値合計30以上'], [45, '個体値合計45以上'], [55, '個体値合計55以上']].map(([v, n]) => `<option value="${v}" ${+f.iv === v ? 'selected' : ''}>${n}</option>`).join('')}</select>
    <button class="tog shiny ${f.shiny ? 'on' : ''}">✨色違い</button><button class="tog fav ${f.fav ? 'on' : ''}">★お気に入り</button>
    <button class="btn sm red bulk">🌿 まとめて逃がす</button>
    <button class="btn sm nickmode">✏️ ニックネーム</button>
    <span class="muted cnt"></span></div>
    <div class="nickbar"><span>✏️ 名前を 変えたい アニモンを 押してください</span><button class="btn sm stopnick">おわる</button></div>
    <div class="relbar"><span class="t"></span><button class="btn sm allsel">表示中を 全部 選ぶ</button><button class="btn sm red go">🌿 逃がす</button><button class="btn sm stop">やめる</button></div>
    <div class="boxgrid"></div>`;
  const grid = s.body.querySelector('.boxgrid');
  // まとめて逃がす モード：押した子を 選んで、まとめて 逃がす
  let bulk = false, shown = [], nickMode = false;
  const nickbar = s.body.querySelector('.nickbar');
  const setNick = (on) => { nickMode = on; nickbar.classList.toggle('on', on); s.body.querySelector('.nickmode').classList.toggle('pri', on); grid.classList.toggle('nickmode', on); };
  s.body.querySelector('.nickmode').onclick = () => { audio.sfx('select'); if (bulk) return; setNick(!nickMode); };
  nickbar.querySelector('.stopnick').onclick = () => { audio.sfx('cancel'); setNick(false); };
  const picked = new Set();
  const relbar = s.body.querySelector('.relbar');
  const updBar = () => {
    relbar.classList.toggle('on', bulk);
    s.body.querySelector('.bulk').style.display = bulk ? 'none' : '';
    relbar.querySelector('.t').textContent = `${picked.size}匹 選択中（ルルは 選べません）`;
    relbar.querySelector('.go').disabled = !picked.size;
  };
  s.body.querySelector('.bulk').onclick = () => { audio.sfx('select'); setNick(false); bulk = true; picked.clear(); updBar(); render(); };
  relbar.querySelector('.stop').onclick = () => { audio.sfx('cancel'); bulk = false; picked.clear(); updBar(); render(); };
  relbar.querySelector('.allsel').onclick = () => { audio.sfx('select'); const all = shown.filter(m => canRelease(m)); const every = all.every(m => picked.has(m)); for (const m of all) every ? picked.delete(m) : picked.add(m); updBar(); render(); };
  relbar.querySelector('.go').onclick = async () => { if (await releaseMons([...picked])) { bulk = false; picked.clear(); updBar(); render(); } };
  const render = () => {
    let list = G.save.box.slice();
    if (f.q) list = list.filter(m => monName(m).includes(f.q) || SPECIES[m.sp].name.includes(f.q));
    if (f.type) list = list.filter(m => SPECIES[m.sp].types.includes(f.type));
    if (f.shiny) list = list.filter(m => m.shiny);
    if (f.fav) list = list.filter(m => m.fav);
    if (+f.iv) list = list.filter(m => ivTotal(m) >= +f.iv);
    const cmp = { new: (a, b) => b.caughtAt - a.caughtAt, dex: (a, b) => a.sp - b.sp || b.lv - a.lv, lv: (a, b) => b.lv - a.lv, iv: (a, b) => ivTotal(b) - ivTotal(a), name: (a, b) => monName(a).localeCompare(monName(b), 'ja') }[f.sort];
    if (f.sort !== 'new') list.sort(cmp); else list.sort(cmp);
    shown = list;
    s.body.querySelector('.cnt').innerHTML = `${list.length}匹 / ボックス${G.save.box.length}匹　<b class="${monFull() ? 'capfull' : ''}">📦 持てる数 ${monCount()}/${monCap()}</b>`;
    grid.innerHTML = '';
    grid.classList.toggle('bulkmode', bulk);
    if (!list.length) grid.innerHTML = '<p class="muted">アニモンが いません。</p>';
    for (const m of list) {
      const c = el('button', 'bcell' + (picked.has(m) ? ' picked' : '') + (bulk && !canRelease(m) ? ' locked' : ''), `<img src="${BLANK}"><div class="bnm">${esc(monName(m))}</div><div class="lv">Lv${m.lv}</div>${typeDots(m.sp)}${heldMark(m)}${m.shiny ? '<span class="shiny-mark">✨</span>' : ''}${m.fav ? '<span class="fav">★</span>' : ''}${SPECIES[m.sp].ride ? `<span class="ride-mark" title="ライドできる">${RIDE_IC[SPECIES[m.sp].ride]}</span>` : ''}${bulk ? `<span class="chk">${picked.has(m) ? '✔' : ''}</span>` : ''}`);
      c.title = monName(m);
      portraitAsync(m.sp, m.shiny, false, (u) => { c.querySelector('img').src = u; });
      c.onclick = async () => {
        if (bulk) {
          if (!canRelease(m)) { toast('この子は 逃がせない！'); return; }
          picked.has(m) ? picked.delete(m) : picked.add(m);
          c.classList.toggle('picked', picked.has(m)); c.querySelector('.chk').textContent = picked.has(m) ? '✔' : '';
          audio.sfx('select'); updBar(); return;
        }
        audio.sfx('select');
        if (nickMode) { if (await renameMon(m)) render(); return; }
        await monDetail(m, 'box'); render();
      };
      grid.appendChild(c);
    }
  };
  updBar();
  const q = s.body.querySelector('.q');
  q.oninput = () => { f.q = q.value.trim(); render(); };
  q.onkeydown = (e) => e.stopPropagation();
  s.body.querySelector('.type').onchange = (e) => { f.type = e.target.value; render(); };
  s.body.querySelector('.sort').onchange = (e) => { f.sort = e.target.value; render(); };
  s.body.querySelector('.iv').onchange = (e) => { f.iv = e.target.value; render(); };
  s.body.querySelector('.tog.shiny').onclick = (e) => { f.shiny = !f.shiny; e.target.classList.toggle('on', f.shiny); render(); };
  s.body.querySelector('.tog.fav').onclick = (e) => { f.fav = !f.fav; e.target.classList.toggle('on', f.fav); render(); };
  render();
  await waitClose(s);
  (await import('../game/overworld.js')).refreshFollower();
}
// 選択用（トレード・対戦チーム）
export function pickFromAll(title, filterFn, multi = 0, pre = [], opts = {}) {
  return new Promise(res => {
    const s = openScreen(title);
    const all = [...G.save.party, ...G.save.box].filter(filterFn || (() => true));
    const sel = [];
    s.body.innerHTML = `<div class="row" style="margin-bottom:.5em"><span class="muted grow">${multi ? `${multi}匹 選んでください（同じアニモンは1匹まで・選んだ 順に 出ます）` : '1匹 選んでください'}</span>${multi ? '<button class="btn sm clr">選びなおす</button><button class="btn pri ok">けってい</button>' : ''}</div><div class="boxgrid"></div>`;
    const grid = s.body.querySelector('.boxgrid');
    if (!all.length) grid.outerHTML = '<p class="muted" style="margin:1em 0">えらべる アニモンが いません。（伝説・ルル・パーティーに 1匹だけの子は 出せません）</p>';
    const okB = s.body.querySelector('.ok');
    const cells = new Map();
    const upd = () => {
      if (okB) { okB.disabled = sel.length !== multi; okB.textContent = `けってい（${sel.length}/${multi}）`; }
      for (const [m, c] of cells) { const k = sel.indexOf(m); c.classList.toggle('picked2', k >= 0); c.querySelector('.selno').textContent = k >= 0 ? k + 1 : ''; }
    };
    for (const m of all) {
      const c = el('button', 'bcell', `<img src="${BLANK}"><div class="bnm">${esc(monName(m))}</div><div class="lv">Lv${m.lv}${opts.iv ? `・個体値${ivTotal(m)}` : ''}</div>${typeDots(m.sp)}${heldMark(m)}${m.shiny ? '<span class="shiny-mark">✨</span>' : ''}<span class="selno"></span>`);
      portraitAsync(m.sp, m.shiny, false, (u) => { c.querySelector('img').src = u; });
      cells.set(m, c);
      c.onclick = async () => {
        if (!multi) { s.onClose = null; s.close(); res(m); return; }
        const i = sel.indexOf(m);
        if (i >= 0) sel.splice(i, 1);
        else {
          if (sel.length >= multi) { toast(`${multi}匹 まで！（外したい 子を 押してください）`); return; }
          if (sel.some(x => x.sp === m.sp)) { toast('同じアニモンは 1匹まで！'); return; }
          sel.push(m);
        }
        audio.sfx('select'); upd();
      };
      grid.appendChild(c);
    }
    // 保存した パーティーから 選んだ ときは、その 子たちを 先に 選んでおく
    for (const m of pre || []) { if (multi && sel.length < multi && all.includes(m) && !sel.some(x => x.sp === m.sp)) sel.push(m); }
    upd();
    const clr = s.body.querySelector('.clr'); if (clr) clr.onclick = () => { sel.length = 0; upd(); };
    if (okB) okB.onclick = () => { s.onClose = null; s.close(); res(sel.slice()); };
    s.onClose = () => res(null);
  });
}

// ---------- パーティーの 保存（1〜10）：いつでも 呼び出せる・名前を 変えられる・フレンド対戦でも 使える ----------
export const PRESET_N = 10;
export function presets() {
  const S = G.save;
  if (!Array.isArray(S.presets)) S.presets = [];
  for (let i = 0; i < PRESET_N; i++) if (!S.presets[i] || typeof S.presets[i] !== 'object') S.presets[i] = { name: `パーティー${i + 1}`, uids: [] };
  S.presets.length = PRESET_N;
  for (const p of S.presets) if (!Array.isArray(p.uids)) p.uids = [];
  return S.presets;
}
export function presetMons(p) { const all = [...G.save.party, ...G.save.box]; return (p?.uids || []).map(u => all.find(m => m.uid === u)).filter(Boolean); }
// 保存した パーティーごとの 持ち物：p.items = { uid: 道具の id（なしは ''） }（保存した ときの 持ち物）
//  古い 保存（p.items が ない）や、あとから 入れた 子は 今の 持ち物の まま
export function presetWant(p, m) {
  if (!p || !p.items || !Object.prototype.hasOwnProperty.call(p.items, m.uid)) return m.item || null;
  const w = p.items[m.uid]; return w && ITEMS[w] ? w : null;
}
const presetItemsMatch = (p, mons) => mons.every(m => (m.item || null) === presetWant(p, m));
// 呼び出す ときに 持ち物も 入れかえる：①ちがう 物を 持っている 子は バッグへ もどす ②バッグから 持たせる
//  バッグに なければ、パーティーから 外れる 子・ボックスの 子が 持っている ものを 外して 持たせる
function applyPresetItems(p, team) {
  const r = { missing: [], took: [] };
  if (!p.items) return r;
  for (const m of team) { const w = presetWant(p, m); if (m.item && m.item !== w) { addItem(m.item, 1); m.item = null; } }
  for (const m of team) {
    const w = presetWant(p, m); if (!w || m.item === w) continue;
    if (itemCount(w) > 0) { useItem(w); m.item = w; continue; }
    const donor = [...G.save.party, ...G.save.box].find(x => !team.includes(x) && x.item === w);
    if (donor) { donor.item = null; m.item = w; r.took.push(`${monName(donor)}の ${ITEMS[w].name}`); continue; }
    r.missing.push(`${monName(m)}の ${ITEMS[w].name}`);
  }
  return r;
}
function loadPreset(p) {
  const team = [], seen = new Set();
  // いまの パーティーの 子だけで できる（並べかえ・預ける）なら いつでも OK。ボックスの 子が 入るなら 病院で
  if (!atHospital && presetMons(p).some(m => G.save.box.includes(m))) { toast(NEED_HOSPITAL, 3600); return false; }
  for (const m of presetMons(p)) { if (team.length >= PARTY_MAX || seen.has(m.sp)) continue; seen.add(m.sp); team.push(m); }
  if (!team.length) { toast('この パーティーの アニモンが もう いません'); return false; }
  const items = applyPresetItems(p, team);
  const out = G.save.party.filter(m => !team.includes(m));
  G.save.box = G.save.box.filter(m => !team.includes(m));
  G.save.party = team;
  G.save.box.unshift(...out);
  save();
  return items;
}
// opts.pick：フレンド対戦用（パーティーを 1つ 選んで 返す）
export function openPresets(opts = {}) {
  return new Promise(res => {
    const s = openScreen(opts.pick ? '保存した パーティーから 選ぶ' : 'パーティーの 保存・呼び出し');
    let picked = null;
    const render = () => {
      const ps = presets();
      s.body.innerHTML = `<p class="muted" style="margin:.1em 0 .5em">${opts.pick ? '対戦に 使う パーティーを 選んでください（このあと 出す 子を 確認・変更 できます。持ち物は 保存した ときの もので 出ます）' : '「保存」で いまの パーティーと 持ち物を 記録、「呼び出す」で その メンバー・持ち物に 入れかえ（ほかの 子は ボックスへ）。持ち物を 変えたら もう一度「保存」で 上書きしてください。✏️ で 名前を 変えられます。'}</p><div class="pslist"></div>`;
      const list = s.body.querySelector('.pslist');
      ps.forEach((p, i) => {
        const mons = presetMons(p), lost = p.uids.length - mons.length;
        const sameMembers = mons.length && mons.length === G.save.party.length && mons.every((m, k) => G.save.party[k] === m);
        const isNow = sameMembers && presetItemsMatch(p, mons);
        const itemTag = (m) => { const w = presetWant(p, m), it = w && ITEMS[w]; return it ? `<i class="psi" title="${esc(it.name)}">${it.icon || '🎁'}</i><em class="psin">${esc(it.name)}</em>` : '<em class="psin none">―</em>'; };
        const row = el('div', 'psrow' + (isNow ? ' now' : ''), `<div class="psno">${i + 1}</div><div class="psmain"><div class="psname"><b>${esc(p.name)}</b>${opts.pick ? '' : '<button class="btn sm rn" title="名前を 変える">✏️</button>'}${isNow ? '<span class="pstag">いまの パーティー</span>' : sameMembers && !opts.pick ? '<span class="pstag diff">持ち物が ちがう</span>' : ''}</div>
          <div class="psmons">${mons.length ? mons.map(m => `<span class="psm" title="${esc(monName(m))} Lv${m.lv}">${itemTag(m)}<img src="${portrait(m.sp, m.shiny)}"><small>Lv${m.lv}</small></span>`).join('') : '<span class="muted">（まだ 保存していない）</span>'}${lost > 0 ? `<span class="muted" style="font-size:.75em">　いない子 ${lost}匹</span>` : ''}</div></div><div class="psbtns"></div>`);
        const bt = row.querySelector('.psbtns');
        const add = (label, cls, fn, dis = false) => { const b = el('button', 'btn sm ' + cls, label); b.disabled = dis; b.onclick = async () => { if (b.__busy) return; b.__busy = true; try { await fn(); } finally { b.__busy = false; } }; bt.appendChild(b); };
        if (opts.pick) add('このパーティーで 出る', 'pri', () => { picked = p; s.onClose = null; s.close(); res(p); }, !mons.length);
        else {
          add('💾 保存', 'pri', async () => {
            if (p.uids.length && !(await confirmBox(`「${p.name}」に いまの パーティーと 持ち物を 上書きして 保存しますか？`))) return;
            p.uids = G.save.party.map(m => m.uid); p.items = Object.fromEntries(G.save.party.map(m => [m.uid, m.item || ''])); save(); audio.sfx('item'); toast(`いまの パーティーと 持ち物を「${p.name}」に 保存した！`); render();
          });
          add('呼び出す', '', async () => {
            const r = loadPreset(p); if (!r) return;
            audio.sfx('item'); toast(`「${p.name}」に 入れかえた！`);
            if (r.took.length) toast(`持ち物を 移した：${r.took.join('、')}`, 4200);
            if (r.missing.length) toast(`道具が 足りず 持たせられなかった：${r.missing.join('、')}`, 5000);
            render();
          }, !mons.length || isNow);
          add('消す', 'red', async () => { if (await confirmBox(`「${p.name}」の 保存を 消しますか？（アニモンは 消えません）`)) { p.uids = []; delete p.items; save(); render(); } }, !p.uids.length);
          row.querySelector('.rn').onclick = async () => { const nm = await inputText('パーティーの 名前（12文字まで）', p.name, 12); if (nm && nm.trim()) { p.name = nm.trim().slice(0, 12); save(); render(); } };
        }
        list.appendChild(row);
      });
    };
    render();
    s.onClose = () => res(picked);
  });
}

// ---------- 図鑑 ----------
export async function openDex() {
  const c = dexCounts();
  const s = openScreen('アニモン図鑑', { extra: `<span class="muted">つかまえた ${c.caught} / 見つけた ${c.seen} / 全${DEX_COUNT}</span>` });
  s.body.innerHTML = '<div class="dexgrid"></div>';
  const grid = s.body.querySelector('.dexgrid');
  for (let id = 1; id <= DEX_COUNT; id++) {
    const sp = SPECIES[id];
    const caught = G.save.dex.caught[id], seen = G.save.dex.seen[id];
    const c2 = el('button', 'dexcell' + (caught ? ' caught' : ''), `<img src="${BLANK}"><div class="no">No.${String(id).padStart(3, '0')}</div><div>${caught || seen ? esc(sp.name) : '？？？'}</div>`);
    if (caught || seen) portraitAsync(id, false, !caught, (u) => { c2.querySelector('img').src = u; });
    c2.onclick = () => { audio.sfx('select'); dexDetail(id); };
    grid.appendChild(c2);
  }
  await waitClose(s);
}
export async function dexDetail(id) {
  const sp = SPECIES[id];
  const caught = G.save.dex.caught[id], seen = G.save.dex.seen[id];
  const s = openScreen(`No.${String(id).padStart(3, '0')} ${caught || seen ? sp.name : '？？？'}`);
  if (!caught) {
    const hidden = hiddenInDex(sp) && !seen;
    s.body.innerHTML = `<div class="detail"><div>${seen ? `<img class="bigpic" src="${portrait(id, false, true)}">` : '<div class="bigpic" style="display:grid;place-items:center;font-size:4em">？</div>'}</div><div>
      <p class="muted">まだ つかまえていない アニモンです。</p>
      ${hidden ? '<div class="card"><b>生息地・入手方法</b><p>？？？</p></div>' : `<div class="card"><b>生息地・入手方法</b>${howToGet(sp).map(t => `<p style="margin:.3em 0">${esc(t)}</p>`).join('')}</div>`}
      </div></div>`;
    await waitClose(s); return;
  }
  const ab = ABILITIES[sp.ability];
  const base = sp.base;
  const evo = [];
  let b = sp; while (b.evoFrom) b = SPECIES[b.evoFrom];
  while (b) { evo.push(b); b = b.evoTo ? SPECIES[b.evoTo] : null; }
  s.body.innerHTML = `<div class="detail"><div><img class="bigpic" src="${portrait(id)}"><div class="row" style="justify-content:center;margin-top:.4em"><button class="btn sm shinyBtn">✨色違いを見る</button></div></div><div>
    <div class="row">${sp.types.map(typeBadge).join('')}${sp.legend ? '<span class="tbadge" style="background:#b8860b">伝説</span>' : ''}${sp.ride ? `<span class="tbadge" style="background:#2a7f62">ライド：${{ land: '陸', swim: '水', fly: '空' }[sp.ride]}</span>` : ''}</div>
    <p>${esc(sp.desc)}</p>
    <div class="card" style="padding:.5em"><b>特殊能力：${esc(ab.name)}</b><div class="muted">${esc(ab.desc)}</div></div>
    <div class="rarity" style="--rc:${RARITY_COL[sp.rarity]}"><b>出現しやすさ</b><span class="rst">${sp.rarity >= 5 ? '★★★★★' : rarityStars(sp.rarity)}</span><span>${RARITY_JA[sp.rarity]}</span><span class="muted">（種族値の合計 ${sp.bst}${sp.rarity >= 5 ? '' : '・強いほど 出にくい'}）</span></div>
    <h4 style="margin:.6em 0 .2em">種族値 <span class="muted" style="font-size:.78em;font-weight:400">個体値 1〜15 で ±8% ほど 変わる</span></h4>${['hp', 'atk', 'def', 'spe'].map(k => `<div class="statrow"><span>${STAT_JA[k]}</span><b>${base[k]}</b><div class="bar"><i style="width:${base[k] / 1.4}%"></i></div></div>`).join('')}
    <h4 style="margin:.6em 0 .2em">覚える技（8種類）</h4>${sp.moves.map(x => { const mv = MOVES[x.id]; return `<div class="movechip" style="border-left-color:${TYPE_COLOR[mv.type]}"><span><b>${esc(mv.name)}</b> <span class="muted">${TYPE_JA[mv.type]}・${mv.power ? '威力' + mv.power : '変化'}${mv.sig ? '・<span style="color:var(--acc)">特別技</span>' : ''}</span><span class="mvdesc">${esc(mv.desc)}${moveEffects(mv).length ? `<em>${esc(moveEffectText(mv))}</em>` : ''}</span></span><span class="pp">Lv${x.lv}</span></div>`; }).join('')}
    <h4 style="margin:.6em 0 .2em">進化</h4><div class="row">${evo.map((e, i) => `${i ? '→ ' : ''}<span>${G.save.dex.seen[e.id] ? esc(e.name) : '？？？'}${e.evoLv && e.evoTo ? `<span class="muted">（Lv${e.evoLv}）</span>` : ''}</span>`).join(' ')}${evo.length === 1 ? '<span class="muted">進化しない</span>' : ''}</div>
    <h4 style="margin:.6em 0 .2em">生息地・入手方法</h4>${howToGet(sp).map(t => `<p class="muted" style="margin:.2em 0">${esc(t)}</p>`).join('')}
  </div></div>`;
  const sb = s.body.querySelector('.shinyBtn');
  if (sp.legend) sb.remove();
  else sb.onclick = () => { const img = s.body.querySelector('.bigpic'); const on = sb.classList.toggle('pri'); img.src = portrait(id, on); };
  await waitClose(s);
}

// ---------- バッグ ----------
export async function openBag() {
  const s = openScreen('バッグ');
  let tab = 'heal';
  const cats = { heal: ['heal', 'revive', 'status', 'pp'], field: ['field', 'candy'], food: ['food'], held: ['held'], mat: ['mat'], scroll: ['crown', 'scroll'] };
  const tabJa = { heal: '回復', field: 'どうぐ', food: 'エサ', held: '持ち物', mat: '素材', scroll: 'その他' };
  const render = () => {
    s.body.innerHTML = `<div class="tabs">${Object.keys(cats).map(k => `<button class="tab ${k === tab ? 'on' : ''}" data-k="${k}">${tabJa[k]}</button>`).join('')}</div><div class="list"></div>`;
    s.body.querySelectorAll('.tab').forEach(b => b.onclick = () => { tab = b.dataset.k; render(); });
    const list = s.body.querySelector('.list');
    const items = Object.values(ITEMS).filter(i => cats[tab].includes(i.cat) && itemCount(i.id) > 0);
    if (!items.length) list.innerHTML = '<p class="muted">何も 持っていない。</p>';
    for (const it of items) {
      const r = el('div', 'itemrow' + (it.cat === 'crown' ? ' crown ' + it.id : ''), `<div class="grow"><div class="nm">${it.icon && (it.cat === 'mat' || it.cat === 'crown' || it.cat === 'field' || it.cat === 'candy') ? `<span class="ic">${it.icon}</span> ` : ''}${esc(it.name)}${it.id === 'repel' && G.save.repel > 0 ? ` <span class="repelnow">効果中 のこり ${fmtRepel(G.save.repel)}</span>` : ''}</div><div class="ds">${esc(it.desc)}</div></div><div class="cnt">×${itemCount(it.id)}</div>`);
      if (['heal', 'revive', 'status', 'pp', 'candy', 'held', 'scroll', 'crown', 'field'].includes(it.cat)) {
        const b = el('button', 'btn sm pri', it.cat === 'held' ? '持たせる' : '使う');
        b.onclick = async () => { audio.sfx('select'); await (it.cat === 'crown' ? useCrown(it) : it.cat === 'field' ? useRepel(it) : it.cat === 'candy' ? useCandy(it) : useOnMon(it)); render(); };
        r.appendChild(b);
      }
      list.appendChild(r);
    }
  };
  render();
  await waitClose(s);
}
// むしよけスプレー：何個でも まとめて 使える（1個 10分）
export const fmtRepel = (sec) => { sec = Math.ceil(sec); const h = Math.floor(sec / 3600), m = Math.floor(sec / 60) % 60, ss = sec % 60; return h ? `${h}:${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')}` : `${m}:${String(ss).padStart(2, '0')}`; };
async function useRepel(it) {
  const have = itemCount(it.id); if (!have) return;
  const opts = [1, 2, 3, 5, 10].filter(n => n <= have);
  if (have > 10 && !opts.includes(have)) opts.push(have);
  const now = G.save.repel || 0;
  const k = await ask(`${it.name}を いくつ 使う？（1個で 10分。いま ${now > 0 ? 'のこり ' + fmtRepel(now) : '効果なし'}）`, [...opts.map(n => `${n}個（+${n * 10}分）`), 'やめる']);
  if (k >= opts.length) return;
  const n = opts[k];
  addItem(it.id, -n);
  G.save.repel = now + n * (it.repelSec || 600);
  audio.sfx('heal');
  toast(`🧴 ${it.name}を ${n}個 使った！ のこり ${fmtRepel(G.save.repel)} の あいだ、野生の アニモンと 出会わない`, 3600);
  save();
}
// ふしぎなアメ・レベルアメ：パーティーでも ボックスの 子でも。続けて 使える
async function useCandy(it) {
  while (itemCount(it.id) > 0) {
    const m = await pickFromAll(`${it.name}を だれに 使う？（のこり ${itemCount(it.id)}個）`, (x) => x.lv < MAX_LV);
    if (!m) return;
    // 何個 使うか（1・3・5・10・Lv99まで）
    const have = itemCount(it.id), room = MAX_LV - m.lv;
    const opts = [...new Set([1, 3, 5, 10, Math.min(have, room)])].filter(n => n >= 1 && n <= have && n <= room).sort((a, b) => a - b);
    const k = opts.length === 1 ? 0 : await ask(`${monName(m)}（Lv${m.lv}）に ${it.name}を いくつ 使う？（のこり ${have}個）`, [...opts.map(n => `${n}個（Lv${m.lv + n}まで）${n === room ? '・最大' : n === have ? '・ぜんぶ' : ''}`), 'やめる']);
    if (k >= opts.length) continue;
    const n = opts[k], lv0 = m.lv;
    const learned = [], pending = [];
    let evolve = false, stopped = false;
    for (let i = 0; i < n && m.lv < MAX_LV; i++) {
      if (!useItem(it.id)) break;
      const r = addExp(m, expForLevel(m.lv + 1) - m.exp);
      learned.push(...r.learned); pending.push(...r.pending);
      if (r.evolve) evolve = true; if (r.evoStopped) stopped = true;
    }
    audio.sfx('lvup');
    save();
    await say([`|${monName(m)} は レベル ${m.lv} に 上がった！${m.lv - lv0 > 1 ? `（Lv${lv0} → Lv${m.lv}・${it.name} ${m.lv - lv0}個）` : ''}`]);
    for (const id of learned) await say([`|${monName(m)} は ${MOVES[id].name} を 覚えた！`]);
    for (const id of pending) { await learnMove(m, id); save(); }
    if (stopped) await evoStopMsg({ evoStopped: true, m });
    // 進化（まとめて 上げて 2段階 進化できる ときも 順に）
    for (let t = 0; t < 2 && evolve && !noEvoHeld(m); t++) {
      const sp = SPECIES[m.sp]; if (!sp.evoTo || m.lv < sp.evoLv) break;
      await evolveScene(m); save();
    }
    if (!itemCount(it.id) || !(await confirmBox(`${it.name}を ほかの 子にも 使いますか？（のこり ${itemCount(it.id)}個）`))) return;
  }
}
// 王冠：銀＝個体値を 1つ 最大に／金＝4つとも 最大に（ボックスの子にも 使える）
const IV_JA = { hp: 'HP（体力）', atk: '攻撃', def: '防御', spe: '素早さ' };
async function useCrown(it) {
  const all = it.crown === 'all';
  const notMax = (m) => ['hp', 'atk', 'def', 'spe'].some(k => (m.iv?.[k] ?? 0) < 15);
  if (![...G.save.party, ...G.save.box].some(notMax)) { toast('個体値が 最大でない アニモンが いない'); return; }
  const m = await pickFromAll(`${it.name}を だれに 使う？（個体値が 最大の子は 出てきません）`, notMax);
  if (!m) return;
  let keys;
  if (all) keys = ['hp', 'atk', 'def', 'spe'];
  else {
    const cand = ['hp', 'atk', 'def', 'spe'].filter(k => m.iv[k] < 15);
    const k = await ask(`${monName(m)}の どの 個体値を 最大に する？`, [...cand.map(k => `${IV_JA[k]}（いま ${m.iv[k]} → 15）`), 'やめる']);
    if (k >= cand.length) return;
    keys = [cand[k]];
  }
  const what = keys.map(k => `${IV_JA[k]} ${m.iv[k]}→15`).join('、');
  if (!(await confirmBox(`${monName(m)}に ${it.name}を 使いますか？\n${what}\n（${it.name}は 1つしか 手に入らず、使うと なくなります）`))) return;
  const before = maxHp(m);
  for (const k of keys) m.iv[k] = 15;
  m.hp = Math.max(1, Math.min(maxHp(m), m.hp + (maxHp(m) - before)));
  useItem(it.id);
  audio.sfx('kiran');
  const { glintAt } = await import('./ui.js');
  glintAt(innerWidth / 2, innerHeight * 0.42, '👑 MAX！');
  save();
  await say([`|${monName(m)}の ${keys.length === 4 ? '個体値が ぜんぶ' : IV_JA[keys[0]] + 'の 個体値が'} 最大（15）に なった！`]);
}
async function useOnMon(it) {
  const party = G.save.party;
  const k = await ask(`${it.name} を だれに 使う？`, [...party.map(m => `${monName(m)} Lv${m.lv}（HP ${m.hp}/${maxHp(m)}）`), 'やめる']);
  if (k >= party.length) return;
  const m = party[k];
  const mx = maxHp(m);
  if (it.cat === 'held') { if (m.item) addItem(m.item, 1); useItem(it.id); m.item = it.id; toast(`${it.name} を 持たせた！`); return; }
  if (it.cat === 'scroll') { await scrollLearn(m); return; }
  if (it.cat === 'heal') { if (m.hp <= 0 || m.hp >= mx) { toast('使っても 効果がない'); return; } m.hp = Math.min(mx, m.hp + it.hp); }
  else if (it.cat === 'revive') { if (m.hp > 0) { toast('使っても 効果がない'); return; } m.hp = Math.max(1, Math.floor(mx * it.rev)); }
  else if (it.cat === 'status') { if (!m.status) { toast('使っても 効果がない'); return; } m.status = null; m.slp = 0; }
  else if (it.cat === 'pp') { for (const x of m.moves) x.pp = Math.min(MOVES[x.id].pp, x.pp + it.pp); }
  else if (it.cat === 'candy') {
    if (m.lv >= 99) { toast('これ以上 上がらない'); return; }
    useItem(it.id);
    const r = addExp(m, expForLevel(m.lv + 1) - m.exp);
    audio.sfx('lvup');
    await say([`|${monName(m)} は レベル ${m.lv} に 上がった！`]);
    for (const id of r.learned) await say([`|${monName(m)} は ${MOVES[id].name} を 覚えた！`]);
    for (const id of r.pending) await learnMove(m, id);
    await evoStopMsg({ ...r, m });
    if (r.evolve) await evolveScene(m);
    save(); return;
  }
  useItem(it.id); audio.sfx('heal'); toast(`${monName(m)} に ${it.name} を 使った！`); save();
}

// ---------- ショップ・病院 ----------
export function shopList() {
  const c = crests(), post = G.save.postGame;
  const L = ['repel', 'herb', 'cureall', 'h_curse', 'scroll'];
  if (c >= 1) L.push('goodherb', 'revive', 'ppdrop');
  if (c >= 3) L.push('superherb', 'h_berry', 'h_clear');
  if (c >= 4) L.push('h_charm', 'h_bread');
  if (c >= 5) L.push('fullmed', 'ppspring', 'h_glass', 'h_belt');
  if (c >= 6) L.push('h_spike', 'h_claw', 'h_vest');
  if (post) L.push('h_band', 'h_shoes', 'h_orb');
  return L;
}
// ストーリーの 進み具合（紋章の数）で 入荷する 持ち物（守り・耐える 系 30種）
export function shopHeld() { return SHOP_HELD.filter(id => crests() >= ITEMS[id].unlock || G.save.postGame); }
// いま買えるエサ（ストーリーの進み具合で増える）
export function shopFoods() { return SHOP_FOODS.filter(id => crests() >= ITEMS[id].unlock || G.save.postGame); }
const TOWN_BOOST = { start: ['b_normal'], forest: ['b_grass', 'b_bug'], lake: ['b_water', 'b_electric'], desert: ['b_ground', 'b_poison'], canyon: ['b_rock', 'b_fighting', 'b_steel'], snow: ['b_ice', 'b_flying'], swamp: ['b_ghost', 'b_dark', 'b_poison'], highland: ['b_fairy', 'b_psychic', 'b_flying'], volcano: ['b_fire', 'b_dragon'], sanctuary: ['b_dragon', 'b_psychic', 'b_dark', 'b_fairy'] };
export async function openShop(townId) {
  const s = openScreen('ショップ', { extra: `<b class="money" style="color:var(--acc)"></b>` });
  const list = [...shopList(), ...(crests() >= 3 ? (TOWN_BOOST[townId] || []) : [])];
  const seen = G.save.seenFoods || (G.save.seenFoods = ['food1']);
  const fresh = shopFoods().filter(id => !seen.includes(id));
  const render = () => {
    s.head.querySelector('.money').textContent = '所持金 ¥' + G.save.money.toLocaleString();
    s.body.innerHTML = '';
    // エサ（4種類）：まだ入荷していないものも、何個目の紋章で並ぶかを見せる
    s.body.appendChild(el('div', 'shophead', '🍖 エサ（なつきやすさ）'));
    const avail = shopFoods();
    for (const id of SHOP_FOODS) {
      const it = ITEMS[id];
      if (!avail.includes(id)) { s.body.appendChild(el('div', 'itemrow locked', `<div class="grow"><div class="nm">${it.icon} ？？？ <span class="stars">${FOOD_STARS(id)}</span></div><div class="ds">紋章を ${it.unlock}個 集めると 入荷します（ストーリーを進めよう）</div></div>`)); continue; }
      const r = el('div', 'itemrow food', `<div class="grow"><div class="nm">${it.icon} ${esc(it.name)} <span class="stars">${FOOD_STARS(id)}</span>${fresh.includes(id) ? '<span class="newtag">NEW</span>' : ''} <span style="color:var(--acc)">¥${it.price.toLocaleString()}</span></div><div class="ds">${esc(it.desc)}</div></div><div class="cnt">所持 ${itemCount(id)}</div>`);
      for (const n of [1, 5, 10]) {
        const b = el('button', 'btn sm' + (n === 1 ? ' pri' : ''), `×${n}`);
        b.disabled = G.save.money < it.price * n;
        b.onclick = () => { if (G.save.money < it.price * n) return; addMoney(-it.price * n); addItem(id, n); audio.sfx('item'); toast(`${it.name} を ${n}個 買った！`); render(); save(); };
        r.appendChild(b);
      }
      s.body.appendChild(r);
    }
    s.body.appendChild(el('div', 'shophead', '🧰 どうぐ'));
    for (const id of list) {
      const it = ITEMS[id];
      const r = el('div', 'itemrow', `<div class="grow"><div class="nm">${esc(it.name)} <span style="color:var(--acc)">¥${it.price.toLocaleString()}</span></div><div class="ds">${esc(it.desc)}</div></div><div class="cnt">所持 ${itemCount(id)}</div>`);
      for (const n of [1, 5, 10]) {
        const b = el('button', 'btn sm' + (n === 1 ? ' pri' : ''), `×${n}`);
        b.disabled = G.save.money < it.price * n;
        b.onclick = () => { if (G.save.money < it.price * n) return; addMoney(-it.price * n); addItem(id, n); audio.sfx('item'); toast(`${it.name} を ${n}個 買った！`); render(); save(); };
        r.appendChild(b);
      }
      s.body.appendChild(r);
    }
    // 持ち物（守り・耐える 系）：紋章を 集めるごとに 入荷
    const hv = shopHeld();
    s.body.appendChild(el('div', 'shophead', `🎁 持ち物（守り・耐える）<span class="muted" style="font-weight:400;font-size:.8em">　入荷 ${hv.length}/${SHOP_HELD.length}種　紋章を 集めるごとに 増える</span>`));
    for (const id of SHOP_HELD) {
      const it = ITEMS[id];
      if (!hv.includes(id)) { s.body.appendChild(el('div', 'itemrow locked', `<div class="grow"><div class="nm">🎁 ？？？</div><div class="ds">紋章を ${it.unlock}個 集めると 入荷します</div></div>`)); continue; }
      const r = el('div', 'itemrow', `<div class="grow"><div class="nm">🎁 ${esc(it.name)}${freshHeld.includes(id) ? '<span class="newtag">NEW</span>' : ''} <span style="color:var(--acc)">¥${it.price.toLocaleString()}</span></div><div class="ds">${esc(it.desc)}</div></div><div class="cnt">所持 ${itemCount(id)}</div>`);
      for (const n of [1, 5]) {
        const b = el('button', 'btn sm' + (n === 1 ? ' pri' : ''), `×${n}`);
        b.disabled = G.save.money < it.price * n;
        b.onclick = () => { if (G.save.money < it.price * n) return; addMoney(-it.price * n); addItem(id, n); audio.sfx('item'); toast(`${it.name} を ${n}個 買った！`); render(); save(); };
        r.appendChild(b);
      }
      s.body.appendChild(r);
    }
    if (crests() < 8 && !G.save.postGame) s.body.appendChild(el('p', 'muted', '※ 紋章を集めると、より レア度の高いエサや 道具・持ち物が 買えるようになります。'));
  };
  const seenH = G.save.seenHeld || (G.save.seenHeld = []);
  const freshHeld = shopHeld().filter(id => !seenH.includes(id));
  render();
  for (const id of fresh) seen.push(id);
  for (const id of freshHeld) seenH.push(id);
  save();
  await waitClose(s);
}
export function healAll() { healParty(); }
export async function openHospital(townId) {
  G.save.lastHospital = 't_' + townId;
  atHospital = true;
  try {
  while (true) {
    const k = await ask('アニモン病院へ ようこそ！ ご用件は？', ['アニモンを 回復する（HP・技・状態）', '買い物をする', 'パーティーを 変更する', 'やめる'], '受付');
    if (k === 0) {
      await say(['受付|おあずかりします……']);
      await fade(true, 400); healParty(); audio.sfx('heal'); await new Promise(r => setTimeout(r, 500)); await fade(false, 400);
      await say(['受付|お待たせしました！ アニモンたちは 元気いっぱいです！', '受付|技の 使用回数も 全て 回復しましたよ。']);
      save();
    } else if (k === 1) await openShop(townId);
    else if (k === 2) await openParty();
    else break;
  }
  } finally { atHospital = false; }
  (await import('../game/overworld.js')).refreshFollower();
}

// ---------- ファストトラベル ----------
// 光る岩に さわったとき：地図が 出て、行きたい 岩を 押して ワープ
export async function openTravel(fromId) {
  return openMap(null, { warp: { from: fromId } });
}

// ---------- ライド ----------
export async function toggleRide() {
  const ov = await import('../game/overworld.js');
  if (ov.OW.player.rideM) { if (ov.stopRide()) toast('降りた'); return; }
  return openRide();
}
// ライドの 登録（陸・水・空 1匹ずつ）：G.save.rideSet = { land: uid, swim: uid, fly: uid }
//  パーティーと ボックス どちらの 子でも・ひんしでも 乗れる
export const RIDE_KINDS = ['land', 'swim', 'fly'];
const RIDE_SHORT = { land: '陸', swim: '水', fly: '空' };
function rideSet() { const S = G.save; if (!S.rideSet || typeof S.rideSet !== 'object') S.rideSet = {}; return S.rideSet; }
const rideAll = (kind) => [...G.save.party, ...G.save.box].filter(m => SPECIES[m.sp].ride && (!kind || SPECIES[m.sp].ride === kind));
export function rideMon(kind) {
  const uid = rideSet()[kind]; if (!uid) return null;
  const m = [...G.save.party, ...G.save.box].find(x => x.uid === uid);
  return m && SPECIES[m.sp].ride === kind ? m : null;   // 逃がした・進化して 乗り方が 変わった ときは 未登録
}
const noRideMsg = async () => {
  const kinds = SPECIES.filter(x => x && x.ride && !x.legend).slice(0, 6).map(x => x.name).join('・');
  await say(['|ライドできる アニモンを 持っていない……', `|（${kinds} など、図鑑や ボックスで 🐎🌊🕊️ の しるしが ついた アニモンに 乗れます）`]);
};
// 大きな カード（ライドの 画面・登録の 画面）
function rideBigCard(kind, m, sub = '') {
  const c = el('button', `ridebig ${kind}${m ? '' : ' empty'}`, `<div class="rbk"><span class="rbi">${RIDE_IC[kind]}</span>${RIDE_SHORT[kind]}<small>${RIDE_JA[kind]}</small></div>
    ${m ? `<img src="${BLANK}"><div class="rbn">${m.shiny ? '<span class="shiny">✨</span>' : ''}${esc(monName(m))}</div><div class="rbl">Lv${m.lv}${m.hp <= 0 ? '・ひんし' : ''}</div>` : `<div class="rbe">＋</div><div class="rbn">未登録</div>`}
    ${sub ? `<div class="rbs">${sub}</div>` : ''}`);
  if (m) portraitAsync(m.sp, m.shiny, false, (u) => { const im = c.querySelector('img'); if (im) im.src = u; });
  return c;
}
// 乗る 子を 1匹 選ぶ（登録用・大きく 表示）
function pickRideMon(kind) {
  return new Promise(res => {
    const list = rideAll(kind);
    const s = openScreen(`${RIDE_IC[kind]} ${RIDE_SHORT[kind]}の ライドに 登録する 子`, { cls: 'ridepick' });
    let chosen = null;
    const party = new Set(G.save.party), now = rideSet()[kind];
    list.sort((a, b) => (party.has(b) - party.has(a)) || b.lv - a.lv);
    s.body.innerHTML = `<p class="muted" style="margin:.2em 0 .6em">${list.length ? `${RIDE_JA[kind]} ことが できる 子です。押すと 登録します。` : `${RIDE_JA[kind]} ことが できる 子を まだ 持っていない……`}</p><div class="ridegrid"></div>`;
    const g = s.body.querySelector('.ridegrid');
    for (const m of list) {
      const c = el('button', 'ridepc' + (m.uid === now ? ' on' : ''), `<img src="${BLANK}"><div class="rbn">${m.shiny ? '<span class="shiny">✨</span>' : ''}${esc(monName(m))}</div><div class="rbl">Lv${m.lv}・${party.has(m) ? 'パーティー' : 'ボックス'}${m.hp <= 0 ? '・ひんし' : ''}</div>${m.uid === now ? '<div class="rbs">登録中</div>' : ''}`);
      portraitAsync(m.sp, m.shiny, false, (u) => { const im = c.querySelector('img'); if (im) im.src = u; });
      c.onclick = () => { audio.sfx('select'); chosen = m; s.close(); };
      g.appendChild(c);
    }
    s.onClose = () => res(chosen);
  });
}
async function registerRide(kind) {
  const m = await pickRideMon(kind);
  if (!m) return null;
  rideSet()[kind] = m.uid; save(); toast(`${RIDE_IC[kind]} ${RIDE_SHORT[kind]}の ライドに ${monName(m)} を 登録した！`);
  return m;
}
// 設定 →「ライドの 登録」
export async function openRideSettings() {
  const s = openScreen('ライドの 登録', { cls: 'ridescr' });
  const render = () => {
    s.body.innerHTML = `<p class="muted" style="margin:.2em 0 .6em">陸・水・空で 乗る 子を 1匹ずつ 登録します。ライドボタンを 押すと、ここで 登録した 子だけが 大きく 出ます。</p><div class="ride3"></div>`;
    const box = s.body.querySelector('.ride3');
    for (const kind of RIDE_KINDS) {
      const m = rideMon(kind), n = rideAll(kind).length;
      const wrap = el('div', 'ridecol');
      const c = rideBigCard(kind, m, n ? (m ? '押して 変える' : '押して 登録') : '乗れる 子が いない');
      c.onclick = async () => { audio.sfx('select'); if (!n) { toast(`${RIDE_JA[kind]} ことが できる 子を まだ 持っていない`); return; } await registerRide(kind); render(); };
      wrap.appendChild(c);
      if (m) { const off = el('button', 'btn sm rideoff', '登録を 外す'); off.onclick = () => { delete rideSet()[kind]; save(); render(); }; wrap.appendChild(off); }
      box.appendChild(wrap);
    }
  };
  render();
  await waitClose(s);
}
// ライドボタン：登録した 陸・水・空の 3匹だけを 大きく 出す
export async function openRide() {
  const ov = await import('../game/overworld.js');
  if (ov.OW.player.rideM) { if (ov.stopRide()) toast('降りた'); return; }
  if (!rideAll().length) { await noRideMsg(); return; }
  const inDg = !!ov.OW.dungeon;
  const s = openScreen('ライド', { cls: 'ridescr' });
  let chosen = null;
  const render = () => {
    const any = RIDE_KINDS.some(k => rideMon(k));
    s.body.innerHTML = `<p class="muted" style="margin:.2em 0 .6em">${any ? '乗る 子を 押してください。' : 'まだ ライドの 登録が ありません。押して 陸・水・空の 子を 登録しよう！'}${inDg ? '<br>※ ダンジョンの 中では 空は 飛べません。' : ''}</p><div class="ride3"></div>
      <div class="row" style="justify-content:center;margin-top:.7em"><button class="btn rideset">⚙ ライドの 登録を 変える</button></div>`;
    const box = s.body.querySelector('.ride3');
    for (const kind of RIDE_KINDS) {
      const m = rideMon(kind), n = rideAll(kind).length;
      const ng = inDg && kind === 'fly';
      const c = rideBigCard(kind, m, ng ? 'ダンジョンでは 飛べない' : m ? '' : n ? '押して 登録' : '乗れる 子が いない');
      if (ng || (!m && !n)) c.classList.add('fnt');
      c.onclick = async () => {
        if (ng) { toast('ダンジョンの 中では 空を 飛べない！'); return; }
        if (!m) { if (!n) { toast(`${RIDE_JA[kind]} ことが できる 子を まだ 持っていない`); return; } if (await registerRide(kind)) render(); return; }
        audio.sfx('select'); chosen = m; s.close();
      };
      box.appendChild(c);
    }
    s.body.querySelector('.rideset').onclick = async () => { audio.sfx('select'); await openRideSettings(); render(); };
  };
  render();
  await waitClose(s);
  if (chosen) ov.startRide(chosen);
}

// ---------- マップ（全体）：画面に合わせて表示・ドラッグで移動・ピンチ／ホイール／ボタンで拡大 ----------
export async function openMap(focus = null, opts = {}) {
  const ov = await import('../game/overworld.js');
  const SE = await import('../game/storyEngine.js');
  const { getMapImage, worldToImg } = await import('./mapimage.js');
  // opts.warp = { from: 岩のid }：光る岩に さわったとき。地図の 岩を 押して ワープ
  const warp = opts.warp || null;
  const s = openScreen(warp ? 'ファストトラベル' : '大陸マップ', { cls: 'mapscreen' + (warp ? ' warpmap' : '') });
  // focus：ストーリー一覧の「地図で見る」から来たときの 行き先 { x, z, label, obj }
  const tgt = focus || SE.navTarget();
  const dests = warp ? STONES.filter(x => G.save.stones[x.id] && x.id !== warp.from) : [];
  let sel = null, chosen = null;
  s.body.innerHTML = `<div class="mapview"><canvas></canvas>${warp ? '<div class="warppop"><div class="nm"></div><button class="btn pri go">💎 ワープ！</button></div>' : ''}
      <div class="mapbtns"><button class="btn sm zin">＋</button><button class="btn sm zout">－</button><button class="btn sm here">📍現在地</button>${tgt ? '<button class="btn sm pri goal">⭐行き先</button>' : ''}<button class="btn sm all">全体</button></div></div>
    <div class="mapside">
      ${warp ? `<div class="mapgoal warpinfo"><b>💎 光っている 岩を 押して ワープ</b><div>${dests.length ? '地図の 💎（病院のある町は 🏥）を 押すと、そこへ ワープできます。' : 'ほかに 登録した岩が ありません。大陸の各地の 光る岩に さわって 登録しよう！'}</div></div>
        <div class="warplist">${dests.map(d => `<button class="btn sm wdest" data-id="${d.id}">${d.town ? '🏥' : '💎'} ${esc(d.name)}</button>`).join('')}</div>` : ''}
      ${tgt ? `<div class="mapgoal"><b>⭐ ${focus ? esc(focus.title || '行き先') : '次の行き先'}</b><div>${esc(UI_fmt(focus ? (focus.obj || focus.label || '') : SE.objective().txt))}</div></div>` : ''}
      <div class="legend"><span>🏠 町</span><span><b style="color:#5ef">◆</b> 登録済みの岩</span><span><b style="color:#999">◆</b> 未登録の岩</span><span>⛩ ダンジョン</span><span><b style="color:#f44">▲</b> 現在地</span><span>⭐ 行き先</span><span>🔒 まだ行けない</span></div>
      <p class="muted maphint">ドラッグで移動・2本指／ホイールで拡大縮小</p>
    </div>`;
  const view = s.body.querySelector('.mapview'), cv = view.querySelector('canvas'), g = cv.getContext('2d');
  const img = getMapImage(), N = img.width;
  const P = ov.OW.player;
  // 表示：中心（地図画像の座標）と 1ピクセルあたりの倍率
  const V = { cx: N / 2, cy: N / 2, k: 1 };
  let cw = 0, ch = 0, dpr = 1;
  const fitAll = () => { V.cx = N / 2; V.cy = N / 2; V.k = Math.min(cw, ch) / N * 0.98; };
  const clampV = () => { const mn = Math.min(cw, ch) / N * 0.7; V.k = Math.max(mn, Math.min(V.k, 14)); V.cx = Math.max(0, Math.min(N, V.cx)); V.cy = Math.max(0, Math.min(N, V.cy)); };
  const toS = (ix, iy) => [(ix - V.cx) * V.k + cw / 2, (iy - V.cy) * V.k + ch / 2];
  const toSw = (x, z) => { const q = worldToImg(x, z); return toS(q[0], q[1]); };
  const icon = (t, x, y, sz) => { g.font = `${sz}px sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(t, x, y); };
  const text = (t, x, y, sz, col) => { g.font = `bold ${sz}px sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineWidth = 3; g.strokeStyle = 'rgba(0,0,0,.65)'; g.strokeText(t, x, y); g.fillStyle = col; g.fillText(t, x, y); };
  const draw = () => {
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = '#2a5fae'; g.fillRect(0, 0, cw, ch);
    g.imageSmoothingEnabled = V.k < 2;
    const o = toS(0, 0); g.drawImage(img, o[0], o[1], N * V.k, N * V.k);
    const us = V.k * N / 768;  // 768px 表示のときを 1 とした大きさ
    // 未解放の地域を暗く
    const c0 = toSw(0, 0), rr = (r) => r * V.k * N / (WORLD.half * 2);
    for (const id of RING) {
      if (isUnlocked(id)) continue;
      const a0 = (REGIONS[id].ang - 20) * Math.PI / 180, a1 = (REGIONS[id].ang + 20) * Math.PI / 180;
      g.beginPath(); g.arc(c0[0], c0[1], rr(760), a0, a1); g.arc(c0[0], c0[1], rr(210), a1, a0, true); g.closePath();
      g.fillStyle = 'rgba(10,10,30,.55)'; g.fill();
      const m = toSw(Math.cos((a0 + a1) / 2) * 450, Math.sin((a0 + a1) / 2) * 450); icon('🔒', m[0], m[1], Math.max(14, 26 * us));
    }
    if (!isUnlocked('sanctuary')) { g.beginPath(); g.arc(c0[0], c0[1], rr(206), 0, Math.PI * 2); g.fillStyle = 'rgba(10,10,30,.55)'; g.fill(); icon('🔒', c0[0], c0[1], Math.max(14, 28 * us)); }
    const fs = Math.max(11, Math.min(20, 14 * us));
    for (const id of RING) { const a = REGIONS[id].ang * Math.PI / 180; const p = toSw(Math.cos(a) * 560, Math.sin(a) * 560); text(REGIONS[id].name, p[0], p[1], fs, '#fff'); }
    for (const t of TOWNS) { const p = toSw(t.pos[0], t.pos[1]); icon('🏠', p[0], p[1], Math.max(14, 18 * us)); text(t.name, p[0], p[1] + Math.max(14, 18 * us), Math.max(10, 12 * us), '#ffe680'); }
    if (!warp) for (const st of STONES) { if (st.town) continue; const p = toSw(st.pos[0], st.pos[1]); text('◆', p[0], p[1], Math.max(12, 16 * us), G.save.stones[st.id] ? '#55eeff' : '#aaa'); }
    for (const d of Object.values(DUNGEONS)) { const p = toSw(d.pos[0], d.pos[1]); icon('⛩', p[0], p[1], Math.max(13, 16 * us)); }
    // 行き先（光る星と、現在地からの点線）
    const pp = toSw(P.x, P.z);
    if (tgt) {
      const q = toSw(tgt.x, tgt.z);
      g.save(); g.setLineDash([6, 6]); g.lineWidth = 2.5; g.strokeStyle = 'rgba(255,230,80,.9)'; g.beginPath(); g.moveTo(pp[0], pp[1]); g.lineTo(q[0], q[1]); g.stroke(); g.restore();
      const pulse = 1 + Math.sin(performance.now() / 250) * 0.12;
      g.save(); g.shadowColor = '#ffd23f'; g.shadowBlur = 14; icon('⭐', q[0], q[1], Math.max(20, 24 * us) * pulse); g.restore();
      // 町そのものが行き先なら 町の名前と重なるので 星だけにする
      if (!TOWNS.some(t => Math.hypot(t.pos[0] - tgt.x, t.pos[1] - tgt.z) < t.r + 6)) text(tgt.label, q[0], q[1] - Math.max(18, 22 * us), Math.max(11, 13 * us), '#ffe14d');
    }
    // ワープ先の 岩（押せる 岩は 光る）
    if (warp) {
      const t = performance.now() / 1000, R0 = Math.max(11, 13 * Math.min(1.6, us));
      for (const st of STONES) {
        const p = toSw(st.pos[0], st.pos[1]), on = !!G.save.stones[st.id], here = st.id === warp.from, isSel = sel && sel.id === st.id;
        if (!on) { if (!st.town) text('◆', p[0], p[1], Math.max(12, 15 * us), '#9aa'); continue; }
        const R = R0 * (isSel ? 1.35 : 1) * (here ? 1 : 1 + Math.sin(t * 3 + st.pos[0]) * 0.08);
        g.save(); g.shadowColor = here ? '#ff6b6b' : '#5ef'; g.shadowBlur = isSel ? 22 : 12;
        g.fillStyle = here ? 'rgba(255,110,110,.9)' : isSel ? 'rgba(255,230,90,.95)' : 'rgba(80,220,255,.88)'; g.strokeStyle = '#fff'; g.lineWidth = 2.5;
        g.beginPath(); g.arc(p[0], p[1], R, 0, Math.PI * 2); g.fill(); g.stroke(); g.restore();
        icon(st.town ? '🏥' : '💎', p[0], p[1] + 1, R * 1.05);
        if (here) text('いまここ', p[0], p[1] - R - 9, Math.max(11, 12 * us), '#ffb0b0');
        else if (!st.town && us > 0.9) text(st.name, p[0], p[1] + R + 10, Math.max(10, 11 * us), '#bff6ff');
      }
      // 選んだ 岩の 吹き出しを ついていかせる
      const pop = view.querySelector('.warppop');
      if (sel) { const q = toSw(sel.pos[0], sel.pos[1]); pop.style.left = q[0] + 'px'; pop.style.top = q[1] + 'px'; pop.classList.add('on'); } else pop.classList.remove('on');
    }
    // 現在地（向きつきの三角）
    g.save(); g.translate(pp[0], pp[1]); g.rotate(-P.ry + Math.PI); const z = Math.max(1, Math.min(1.6, us));
    g.fillStyle = '#ff3344'; g.strokeStyle = '#fff'; g.lineWidth = 2; g.beginPath(); g.moveTo(0, -11 * z); g.lineTo(8 * z, 9 * z); g.lineTo(-8 * z, 9 * z); g.closePath(); g.fill(); g.stroke(); g.restore();
  };
  const resize = () => {
    const r = view.getBoundingClientRect();
    dpr = Math.min(2, window.devicePixelRatio || 1);
    const first = !cw;
    cw = Math.max(50, r.width); ch = Math.max(50, r.height);
    cv.width = Math.round(cw * dpr); cv.height = Math.round(ch * dpr);
    if (first) { fitAll(); if (focus) { const q = worldToImg(focus.x, focus.z); V.cx = q[0]; V.cy = q[1]; V.k = Math.min(cw, ch) / N * 2.2; } }
    clampV();
  };
  // ドラッグ・ピンチ
  const pts = new Map(); let pinch = null;
  cv.addEventListener('pointerdown', (e) => { cv.setPointerCapture(e.pointerId); pts.set(e.pointerId, [e.clientX, e.clientY]); if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch = { d: Math.hypot(a[0] - b[0], a[1] - b[1]), k: V.k }; } });
  cv.addEventListener('pointermove', (e) => {
    const p = pts.get(e.pointerId); if (!p) return;
    if (pts.size === 1) { V.cx -= (e.clientX - p[0]) / V.k; V.cy -= (e.clientY - p[1]) / V.k; }
    pts.set(e.pointerId, [e.clientX, e.clientY]);
    if (pts.size === 2 && pinch) { const [a, b] = [...pts.values()]; V.k = pinch.k * Math.hypot(a[0] - b[0], a[1] - b[1]) / Math.max(1, pinch.d); }
    clampV();
  });
  // 押しただけ（ほとんど 動かさない）なら 岩を 選ぶ
  let tap0 = null;
  cv.addEventListener('pointerdown', (e) => { tap0 = pts.size === 1 ? { x: e.clientX, y: e.clientY, id: e.pointerId } : null; });
  const pick = (cx, cy) => {
    if (!warp) return;
    const r = cv.getBoundingClientRect(), x = cx - r.left, y = cy - r.top;
    const us = V.k * N / 768, lim = Math.max(28, 22 * Math.min(1.6, us));
    let best = null, bd = lim;
    for (const d of dests) { const p = toSw(d.pos[0], d.pos[1]); const dd = Math.hypot(p[0] - x, p[1] - y); if (dd < bd) { bd = dd; best = d; } }
    sel = best;
    if (best) { audio.sfx('select'); view.querySelector('.warppop .nm').textContent = `${best.town ? '🏥' : '💎'} ${best.name}`; }
  };
  const up = (e) => {
    if (tap0 && e.pointerId === tap0.id && e.type === 'pointerup' && Math.hypot(e.clientX - tap0.x, e.clientY - tap0.y) < 10) pick(e.clientX, e.clientY);
    tap0 = null;
    pts.delete(e.pointerId); if (pts.size < 2) pinch = null;
  };
  cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
  if (warp) {
    const goB = view.querySelector('.warppop .go');
    goB.onclick = (e) => { e.stopPropagation(); if (!sel) return; chosen = sel.id; s.close(); };
    s.body.querySelectorAll('.wdest').forEach(b => b.onclick = () => {
      const d = STONES.find(x => x.id === b.dataset.id); sel = d;
      view.querySelector('.warppop .nm').textContent = `${d.town ? '🏥' : '💎'} ${d.name}`;
      go(d.pos[0], d.pos[1], 1.6); audio.sfx('select');
    });
  }
  cv.addEventListener('wheel', (e) => { e.preventDefault(); V.k *= e.deltaY < 0 ? 1.2 : 1 / 1.2; clampV(); }, { passive: false });
  const go = (x, z, k) => { const q = worldToImg(x, z); V.cx = q[0]; V.cy = q[1]; if (k) V.k = Math.max(V.k, Math.min(cw, ch) / N * k); clampV(); };
  s.body.querySelector('.zin').onclick = () => { V.k *= 1.4; clampV(); };
  s.body.querySelector('.zout').onclick = () => { V.k /= 1.4; clampV(); };
  s.body.querySelector('.here').onclick = () => go(P.x, P.z, 3);
  s.body.querySelector('.all').onclick = () => { fitAll(); };
  const gb = s.body.querySelector('.goal'); if (gb) gb.onclick = () => go(tgt.x, tgt.z, 3);
  const ro = new ResizeObserver(() => resize()); ro.observe(view);
  resize();
  let alive = true;
  const frame = () => { if (!alive) return; draw(); requestAnimationFrame(frame); };
  requestAnimationFrame(frame);
  await waitClose(s);
  alive = false; ro.disconnect();
  if (chosen) await ov.warpTo(chosen);
}
const UI_fmt = (t) => t.replace(/\{P\}/g, G.save.name);

// ---------- 設定 ----------
export async function openSettings(fromTitle) {
  const s = openScreen('設定');
  const st = G.settings;
  const render = () => {
    // スライダー（0.3〜2.5倍・ふつう＝1）
    const slider = (label, key, desc, min = 0.3, max = 2.5) => { const v = st[key] ?? 1; return `<div class="itemrow sens"><div class="grow"><div class="nm">${label} <b class="sv" data-k="${key}">${v.toFixed(1)}倍</b></div><div class="ds">${desc}</div><input type="range" class="srange" data-k="${key}" min="${min}" max="${max}" step="0.1" value="${v}"><div class="sscale"><span>おそい</span><span class="mid" style="left:${((1 - min) / (max - min) * 100).toFixed(1)}%">▲ふつう</span><span>はやい</span></div></div></div>`; };
    const row = (label, key, desc, opts = [['ON', true], ['OFF', false]]) => `<div class="itemrow"><div class="grow"><div class="nm">${label}</div><div class="ds">${desc}</div></div>${opts.map(([t, v]) => `<button class="tog ${st[key] === v ? 'on' : ''}" data-k="${key}" data-v='${JSON.stringify(v)}'>${t}</button>`).join('')}</div>`;
    s.body.innerHTML = row('BGM', 'bgm', 'ゲームの音楽。他のアプリで流している音楽と一緒に聞くこともできます。') +
      row('効果音', 'sfx', 'ボタンやバトルの効果音。') +
      row('軽量モード', 'light', '描画を軽くして、古いスマホでも動きやすくします（切り替え後に再読み込み）。') +
      row('ムービーを自動スキップ', 'autoSkip', 'ストーリーの会話・ムービーを自動で飛ばします（会話中の「スキップ」ボタンでも飛ばせます）。') +
      row('文字の速さ', 'textSpeed', 'メッセージを表示する速さ。', [['おそい', 0], ['ふつう', 1], ['はやい', 2]]) +
      `<h4 class="sethd">🎮 操作の感度</h4>` +
      slider('視点を回す 速さ（左右）', 'camSens', '画面を なぞる（PCは ドラッグ・Q/E）ときの 回りやすさ。') +
      slider('視点を回す 速さ（上下）', 'camSensY', '見下ろす角度の 変わりやすさ。') +
      row('左右を 反転', 'camInvX', 'なぞった方向と 逆に 回します。') +
      row('上下を 反転', 'camInvY', '上下の 動きを 逆に します。') +
      (Input.touch ? slider('スティックの 感度', 'stickSens', '高いほど 少し たおすだけで 速く 動きます。', 0.5, 2) : '') +
      slider('ズームの 速さ', 'zoomSens', '2本指（PCは ホイール）で 拡大・縮小するときの 速さ。', 0.3, 2.5) +
      `<div class="itemrow"><div class="grow"><div class="nm">感度を もとに もどす</div></div><button class="btn sm resetsens">ふつうに もどす</button></div>` +
      (G.save && !fromTitle ? `<div class="itemrow"><div class="grow"><div class="nm">🐎 ライドの 登録</div><div class="ds">陸・水・空で 乗る 子を 1匹ずつ 登録します。ライドボタンを 押すと その 3匹だけが 大きく 出ます。（${RIDE_KINDS.map(k => { const m = rideMon(k); return `${RIDE_IC[k]}${m ? esc(monName(m)) : '未登録'}`; }).join('　')}）</div></div><button class="btn sm pri rideset">登録する</button></div>` : '') +
      `<div class="itemrow"><div class="grow"><div class="nm">📖 アニモン図鑑 まとめサイト</div><div class="ds">アニモンの 種類・入手場所・技・タイプ相性・道具を 画像つきで まとめた ページを 開きます（べつの タブ）。</div></div><a class="btn sm" href="wiki/" target="_blank" rel="noopener">開く</a></div>` +
      `<div class="itemrow"><div class="grow"><div class="nm">🎮 ボタンの 配置・大きさ</div><div class="ds">スティック・A・B（ダッシュ）・ライドの ボタンを、ドラッグで 好きな 位置に 動かしたり、大きさを 変えたり できます（スマホ・タブレット）。${st.touchLayout ? '<b style="color:var(--acc)">（変更中）</b>' : ''}</div></div><button class="btn sm pri tlayout">調整する</button></div>` +
      `<div class="itemrow"><div class="grow"><div class="nm">操作方法</div><div class="ds">PC：移動 WASD/矢印　決定・話す Space/Enter　ダッシュ Shift　メニュー Esc　マップ M　ライド R　視点 ドラッグ・Q/E（C でもとに戻す）　ズーム マウスホイール<br>スマホ：左のスティックで移動、画面をなぞって視点を回す、A で決定、B でダッシュ切替、2本指でズーム</div></div></div>` +
      (fromTitle ? `<div class="itemrow"><div class="grow"><div class="nm" style="color:var(--ng)">セーブデータを消す</div><div class="ds">この端末のセーブデータを削除します。元に戻せません。</div></div><button class="btn sm red del">削除</button></div>` : '') +
      `<h4 class="sethd">👤 アカウント</h4><div class="itemrow"><div class="grow"><div class="nm" style="color:var(--ng)">🗑 アカウントを 削除する</div><div class="ds">この端末と クラウドの セーブデータ・ランキングの 記録・フレンド・連携コードを すべて 削除します（ランキングからも 消えます）。元に もどせません。</div></div><button class="btn sm red delacct">削除</button></div>` +
      `<p class="muted">アニマルモンスター ver 1.4</p>`;
    s.body.querySelectorAll('.tog').forEach(b => b.onclick = () => {
      const k = b.dataset.k, v = JSON.parse(b.dataset.v);
      const before = st[k];
      st[k] = v; saveSettings(st); audio.configure(st.bgm, st.sfx);
      if (k === 'bgm' && v) audio.unlock();
      if (k === 'light' && before !== v) toast('再読み込み後に 反映されます');
      audio.sfx('select'); render();
    });
    s.body.querySelectorAll('.srange').forEach(r => {
      r.oninput = () => { const k = r.dataset.k; st[k] = Math.round(+r.value * 10) / 10; s.body.querySelector(`.sv[data-k="${k}"]`).textContent = st[k].toFixed(1) + '倍'; };
      r.onchange = () => { saveSettings(st); audio.sfx('select'); };
      r.onkeydown = (e) => e.stopPropagation();
    });
    const rs = s.body.querySelector('.resetsens');
    if (rs) rs.onclick = () => { Object.assign(st, { camSens: 1, camSensY: 1, camInvX: false, camInvY: false, stickSens: 1, zoomSens: 1 }); saveSettings(st); audio.sfx('select'); toast('感度を ふつうに もどしました'); render(); };
    const rsb = s.body.querySelector('.rideset'); if (rsb) rsb.onclick = async () => { audio.sfx('select'); await openRideSettings(); render(); };
    s.body.querySelector('.tlayout').onclick = async () => { audio.sfx('select'); const { openTouchEditor } = await import('./extras.js'); await openTouchEditor(); render(); };
    s.body.querySelector('.delacct').onclick = async () => { audio.sfx('select'); const { deleteAccountFlow } = await import('./extras.js'); await deleteAccountFlow(); };
    const del = s.body.querySelector('.del');
    if (del) del.onclick = async () => { if (await confirmBox('本当に セーブデータを 削除しますか？') && await confirmBox('本当の本当に？ 元に戻せません。')) { (await import('../game/save.js')).deleteGame(); location.reload(); } };
  };
  render();
  await waitClose(s);
}

// ---------- 最初の相棒・伝説の選択 ----------
export function chooseStarter() {
  return new Promise(res => {
    const s = openScreen('最初の 相棒を 選ぼう', { noClose: true });
    const data = [[1, '炎タイプのセリック', 'すばやく攻撃的。しっぽの炎で 気持ちを 表す 子ネコ。'], [4, '水タイプのシドー', 'バランス型。川で 遊ぶのが 大好きな 子カワウソ。'], [7, '草タイプのモーラ', '打たれ強い。甲羅で 若葉を 育てる おっとりした 子ガメ。']];
    s.body.innerHTML = '<div class="pickrow"></div><p class="muted" style="text-align:center">3匹とも 2回 進化して、どんどん 強くなるよ。</p>';
    const row = s.body.querySelector('.pickrow');
    data.forEach(([sp, nm, ds], i) => {
      const c = el('div', 'pick', `<img src="${portrait(sp)}"><h3>${esc(SPECIES[sp].name)}</h3>${SPECIES[sp].types.map(typeBadge).join('')}<p>${esc(ds)}</p>`);
      const b = el('button', 'btn pri', 'この子にする');
      b.onclick = async () => { audio.sfx('select'); if (await confirmBox(`${nm} に しますか？`)) { s.onClose = null; s.close(); res(i); } };
      c.appendChild(b); row.appendChild(c);
    });
  });
}
export function chooseLegend() {
  return new Promise(res => {
    const s = openScreen('心を つなぐ 伝説を 選んでください', { noClose: true });
    const ids = [199, 200];
    s.body.innerHTML = '<div class="pickrow"></div><p style="text-align:center;color:var(--acc);font-weight:800">⚠ 選べるのは 1匹だけ。選んだあとは 変更できません。<br><span style="font-size:.85em;color:var(--sub)">個体値は 4つとも 10以上（10〜15）のランダムで、受け取った瞬間に 決まります。</span></p>';
    const row = s.body.querySelector('.pickrow');
    for (const id of ids) {
      const sp = SPECIES[id];
      const c = el('div', 'pick big', `<img src="${portrait(id)}"><h3>${esc(sp.name)}</h3>${sp.types.map(typeBadge).join('')}<p>${esc(sp.desc)}</p>
        ${['hp', 'atk', 'def', 'spe'].map(k => `<div class="statrow"><span>${STAT_JA[k]}</span><b>${sp.base[k]}</b><div class="bar"><i style="width:${sp.base[k] / 1.4}%"></i></div></div>`).join('')}
        <p class="muted">特殊能力：${esc(ABILITIES[sp.ability].name)}<br>特別技：${esc(MOVES[sp.sig].name)}</p>`);
      const b = el('button', 'btn pri', `${sp.name} を 選ぶ`);
      b.onclick = async () => { audio.sfx('select'); if (await confirmBox(`${sp.name} と 心を つなぎますか？（もう一方とは 会えなくなります）`)) { s.onClose = null; s.close(); res(id); } };
      c.appendChild(b); row.appendChild(c);
    }
  });
}
export { STAT_JA };

// ---------- 納品：1匹ずつ スライドして 見くらべ、わたす 子を 決める ----------
//  mons：候補（同じ種類の 子を ぜんぶ）  okFn：条件を みたすか  cond：条件の 説明
export function slidePick({ title, mons, okFn, cond, need = null, okLabel = 'この子を 納品する' }) {
  return new Promise(res => {
    const s = openScreen(title, { cls: 'slidepick' });
    const list = mons.slice().sort((a, b) => (okFn(b) - okFn(a)) || (ivTotal(b) - ivTotal(a)) || (b.lv - a.lv));
    let i = 0, done = false;
    s.body.innerHTML = `<div class="sp-cond">📦 条件：${esc(cond)}</div>
      <div class="sp-stage"><button class="sp-nav prev" aria-label="まえ">‹</button><div class="sp-view"><div class="sp-card"></div></div><button class="sp-nav next" aria-label="つぎ">›</button></div>
      <div class="sp-count"></div>
      <input type="range" class="sp-range" min="0" max="${Math.max(0, list.length - 1)}" step="1" value="0" ${list.length < 2 ? 'disabled' : ''}>
      <div class="sp-hint muted">← → や スワイプで 1匹ずつ 見られます</div>
      <div class="row sp-btns"><button class="btn sp-cancel">やめる</button><button class="btn pri sp-ok">${esc(okLabel)}</button></div>`;
    const card = s.body.querySelector('.sp-card'), range = s.body.querySelector('.sp-range'), cnt = s.body.querySelector('.sp-count'), okB = s.body.querySelector('.sp-ok');
    const ST = [['hp', 'HP'], ['atk', '攻撃'], ['def', '防御'], ['spe', '素早さ']];
    const inParty = (m) => G.save.party.includes(m);
    const draw = (dir = 0) => {
      const m = list[i]; if (!m) return;
      const tot = ivTotal(m), ok = okFn(m);
      card.innerHTML = `<div class="sp-pic"><img src="${BLANK}">${m.shiny ? '<span class="sp-shiny">✨</span>' : ''}</div>
        <div class="sp-info"><div class="sp-name">${esc(monName(m))} <small>Lv${m.lv}</small></div>
        <div class="sp-where">${inParty(m) ? 'パーティー' : 'ボックス'}${m.item ? `・${esc(ITEMS[m.item]?.name || '')}を 持っている` : ''}</div>
        ${ST.map(([k, n]) => `<div class="sp-iv"><span class="k">${n}</span><span class="b"><i style="width:${(m.iv[k] / 15 * 100).toFixed(0)}%"></i></span><span class="v">${m.iv[k]}</span></div>`).join('')}
        <div class="sp-tot ${ok ? 'ok' : 'ng'}">個体値の 合計 <b>${tot}</b> / 60　${ok ? '✓ 条件クリア' : `✗ ${need != null && tot < need ? `あと ${need - tot} たりない` : 'わたせない'}`}</div></div>`;
      portraitAsync(m.sp, m.shiny, false, (u) => { const im = card.querySelector('img'); if (im) im.src = u; });
      if (dir) { card.classList.remove('in-l', 'in-r'); void card.offsetWidth; card.classList.add(dir > 0 ? 'in-r' : 'in-l'); }
      cnt.textContent = `${i + 1} / ${list.length}`;
      range.value = i;
      okB.disabled = !ok;
      s.body.querySelector('.prev').disabled = i <= 0; s.body.querySelector('.next').disabled = i >= list.length - 1;
    };
    const go = (d) => { const j = Math.max(0, Math.min(list.length - 1, i + d)); if (j === i) return; i = j; audio.sfx('select'); draw(d); };
    s.body.querySelector('.prev').onclick = () => go(-1);
    s.body.querySelector('.next').onclick = () => go(1);
    range.oninput = () => { const j = +range.value; if (j !== i) { const d = j > i ? 1 : -1; i = j; draw(d); } };
    // スワイプ
    let sx = null, dx = 0;
    const view = s.body.querySelector('.sp-view');
    view.addEventListener('pointerdown', (e) => { sx = e.clientX; dx = 0; card.style.transition = 'none'; try { view.setPointerCapture(e.pointerId); } catch (er) { /* */ } });
    view.addEventListener('pointermove', (e) => { if (sx == null) return; dx = e.clientX - sx; card.style.transform = `translateX(${dx}px) rotate(${dx / 40}deg)`; });
    const up = () => { if (sx == null) return; sx = null; card.style.transition = ''; card.style.transform = ''; if (dx < -45) go(1); else if (dx > 45) go(-1); };
    view.addEventListener('pointerup', up); view.addEventListener('pointercancel', up);
    const key = (e) => { if (s.closed) return; if (e.key === 'ArrowLeft') { go(-1); e.preventDefault(); e.stopPropagation(); } else if (e.key === 'ArrowRight') { go(1); e.preventDefault(); e.stopPropagation(); } else if (e.key === 'Enter' && !okB.disabled) { e.preventDefault(); okB.click(); } };
    window.addEventListener('keydown', key, true);
    const fin = (v) => { if (done) return; done = true; window.removeEventListener('keydown', key, true); s.onClose = null; s.close(); res(v); };
    okB.onclick = () => { if (okB.disabled) return; audio.sfx('select'); fin(list[i]); };
    s.body.querySelector('.sp-cancel').onclick = () => { audio.sfx('cancel'); fin(null); };
    s.onClose = () => { if (!done) { done = true; window.removeEventListener('keydown', key, true); res(null); } };
    draw();
  });
}
