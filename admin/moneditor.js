// =============================================================
//  管理サイト：アニモンの 選択・編集（アカウント作成・プレゼントで 共通）
//   pickSpecies()        … 画像と 名前の 一覧から 種類を 選ぶ（伝説・ダンジョンの主 などの 札つき）
//   editMon(mon|null)    … レベル・色違い・個体値・ニックネーム・持ち物・（望むときだけ）技構成を 決める
//   monList(el, list, o) … 手持ち・ボックスの 一覧（編集・移動・削除）
// =============================================================
import { SPECIES } from '../js/data/species.js';
import { MOVES, moveEffects } from '../js/data/moves.js';
import { ITEMS } from '../js/data/items.js';
import { TYPE_JA, TYPE_COLOR, TYPES } from '../js/data/types.js';
import { DUNGEON_BOSS, DUNGEONS, SIDE_JA } from '../js/data/world.js';
import { createMon, movesAtLevel, calcStats, expForLevel } from '../js/game/mon.js';
import { portraitAsync, portrait } from '../js/render/portrait.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const h = (tag, cls, html = '') => { const e = document.createElement(tag); if (cls) e.className = cls; e.innerHTML = html; return e; };
const IVK = [['hp', 'HP'], ['atk', '攻撃'], ['def', '防御'], ['spe', '素早さ']];
const tb = (t) => `<span class="tb" style="background:${TYPE_COLOR[t]}">${TYPE_JA[t]}</span>`;
// 技の くわしい 説明（タイプ・威力・命中・PP・優先度・説明・追加効果）
export function moveCard(id, extra = '') {
  const mv = MOVES[id]; if (!mv) return '';
  const fx = moveEffects(mv);
  const pri = mv.pri > 0 ? `<span class="mtag">先制+${mv.pri}</span>` : mv.pri < 0 ? '<span class="mtag">後攻</span>' : '';
  return `<div class="mcard2" style="--tc:${TYPE_COLOR[mv.type]}"><div class="mch"><b>${esc(mv.name)}</b>${tb(mv.type)}${mv.sig ? '<span class="mtag sig">特別技</span>' : ''}${pri}${extra}</div>
    <div class="mcs"><span>${mv.power ? `威力 <b>${mv.power}</b>` : '<b>変化技</b>'}</span><span>命中 <b>${mv.acc ? mv.acc : '必中'}</b></span><span>PP <b>${mv.pp}</b></span></div>
    ${mv.desc ? `<div class="mcd">${esc(mv.desc)}</div>` : ''}<div class="mcf">${fx.length ? '効果：' + esc(fx.join('・')) : (mv.power ? '効果：追加効果なし' : '')}</div></div>`;
}

// 種類の 札（伝説・ダンジョンの主・サイドの主・最初の相棒 など）
const BOSS_OF = {};
for (const [d, [nm]] of Object.entries(DUNGEON_BOSS)) { const s = SPECIES.find(x => x && x.name === nm); if (s) (BOSS_OF[s.id] ||= []).push(DUNGEONS[d]?.name || d); }
export function speciesTags(sp) {
  const s = SPECIES[sp], out = [];
  if (!s) return out;
  if (s.legend) out.push(['legend', '伝説']);
  if (BOSS_OF[sp]) out.push(['boss', `ダンジョンの主（${BOSS_OF[sp].join('・')}）`]);
  if (s.side) out.push(['side', `サイドストーリー（${SIDE_JA[s.side] || s.side}）`]);
  if (s.story) out.push(['story', 'ストーリー（ルル）']);
  if (s.starter) out.push(['starter', '最初の相棒']);
  if (s.rare && !s.legend) out.push(['rare', 'めずらしい']);
  return out;
}
const tagHtml = (sp) => speciesTags(sp).map(([k, t]) => `<span class="stag ${k}">${esc(t)}</span>`).join('');

// ---------- モーダル ----------
function modal(title) {
  const bg = h('div', 'mdl');
  bg.innerHTML = `<div class="mbox"><div class="mhead"><b>${esc(title)}</b><span class="grow"></span><button class="sm mclose">とじる</button></div><div class="mbody"></div></div>`;
  document.body.appendChild(bg);
  document.body.classList.add('mdlopen');
  const api = { el: bg, body: bg.querySelector('.mbody'), head: bg.querySelector('.mhead'), onClose: null };
  api.close = (v) => { bg.remove(); if (!document.querySelector('.mdl')) document.body.classList.remove('mdlopen'); if (api.onClose) api.onClose(v); };
  bg.querySelector('.mclose').onclick = () => api.close(null);
  return api;
}

// ---------- 種類を 選ぶ ----------
let lastQ = '', lastType = '', lastTag = '';
export function pickSpecies(title = 'アニモンを 選ぶ') {
  lastType = ''; lastTag = '';   // しぼりこみは 毎回 はじめから（名前の 検索だけ 残す）
  return new Promise(res => {
    const m = modal(title);
    m.onClose = (v) => res(v ?? null);
    m.body.innerHTML = `<div class="row pfil"><input type="text" class="pq" placeholder="名前で さがす" value="${esc(lastQ)}">
      <select class="pt"><option value="">すべての タイプ</option>${TYPES.map(t => `<option value="${t}" ${lastType === t ? 'selected' : ''}>${TYPE_JA[t]}</option>`).join('')}</select>
      <select class="pg"><option value="">すべて</option><option value="boss" ${lastTag === 'boss' ? 'selected' : ''}>ダンジョンの主</option><option value="legend" ${lastTag === 'legend' ? 'selected' : ''}>伝説</option><option value="side" ${lastTag === 'side' ? 'selected' : ''}>サイドストーリー</option><option value="rare" ${lastTag === 'rare' ? 'selected' : ''}>めずらしい</option><option value="starter" ${lastTag === 'starter' ? 'selected' : ''}>最初の相棒</option></select></div>
      <div class="spgrid"></div>`;
    const grid = m.body.querySelector('.spgrid');
    const draw = () => {
      lastQ = m.body.querySelector('.pq').value.trim(); lastType = m.body.querySelector('.pt').value; lastTag = m.body.querySelector('.pg').value;
      grid.innerHTML = '';
      const list = SPECIES.filter(s => s && (!lastQ || s.name.includes(lastQ) || String(s.id) === lastQ) && (!lastType || s.types.includes(lastType)) && (!lastTag || speciesTags(s.id).some(([k]) => k === lastTag)));
      if (!list.length) grid.innerHTML = '<p class="muted">見つかりません</p>';
      for (const s of list) {
        const c = h('button', 'spcell', `<img alt=""><div class="no">No.${String(s.id).padStart(3, '0')}</div><div class="nm">${esc(s.name)}</div><div class="tys">${s.types.map(tb).join('')}</div><div class="tags">${tagHtml(s.id)}</div>`);
        portraitAsync(s.id, false, false, (u) => { const im = c.querySelector('img'); if (im) im.src = u; });
        c.onclick = () => m.close(s.id);
        grid.appendChild(c);
      }
    };
    for (const s of ['.pq']) m.body.querySelector(s).addEventListener('input', draw);
    for (const s of ['.pt', '.pg']) m.body.querySelector(s).addEventListener('change', draw);
    draw();
  });
}

// ---------- 1匹を 作る・直す ----------
//  init: 既存の アニモン（直す）または null（新しく 作る：先に 種類を 選ぶ）
//  返り値：アニモン（createMon と 同じ 形）または null
export async function editMon(init = null, o = {}) {
  let sp = init ? init.sp : await pickSpecies(o.title || '追加する アニモンを 選ぶ');
  if (!sp) return null;
  return new Promise(res => {
    const m = modal(init ? 'アニモンを 直す' : 'アニモンの 中身を 決める');
    m.onClose = (v) => res(v ?? null);
    const st = {
      lv: init ? init.lv : (o.lv || 30), shiny: init ? !!init.shiny : false, nick: init ? init.nick || '' : '',
      iv: init ? { ...init.iv } : { hp: 10, atk: 10, def: 10, spe: 10 }, item: init ? init.item || '' : '',
      custom: init ? !!init.customMoves : false, moves: init ? init.moves.map(x => x.id) : [],
    };
    const S = () => SPECIES[sp];
    const learn = () => [...new Set(S().moves.map(x => x.id))];
    const draw = () => {
      const s = S();
      if (s.legend) st.shiny = false;
      if (!st.custom) st.moves = movesAtLevel(sp, st.lv);
      const stats = calcStats({ sp, lv: st.lv, iv: st.iv }, st.lv);
      const heldOpts = Object.values(ITEMS).filter(i => i.cat === 'held');
      m.body.innerHTML = `<div class="ed">
        <div class="edl"><img class="edimg" src="${portrait(sp, st.shiny)}"><div class="nm">No.${String(sp).padStart(3, '0')} <b>${esc(s.name)}</b></div><div class="tys">${s.types.map(tb).join('')}</div><div class="tags">${tagHtml(sp)}</div>
          <button class="sm chsp">種類を 変える</button>
          <div class="stbox">${[['HP', stats.hp], ['攻撃', stats.atk], ['防御', stats.def], ['素早さ', stats.spe]].map(([k, v]) => `<div><span>${k}</span><b>${v}</b></div>`).join('')}</div></div>
        <div class="edr">
          <label>レベル <small>1〜99</small></label><div class="row"><input type="range" class="lvr" min="1" max="99" value="${st.lv}"><input type="number" class="lvn" min="1" max="99" value="${st.lv}" style="width:5em"></div>
          <label>見た目</label><div class="row seg"><button class="sm shn ${!st.shiny ? 'on' : ''}" data-v="0">通常</button><button class="sm shn ${st.shiny ? 'on' : ''}" data-v="1" ${s.legend ? 'disabled title="伝説は 色違いに できません"' : ''}>✨ 色違い</button></div>
          <label>個体値 <small>1〜15（15が 最高）</small></label>
          <div class="ivbox">${IVK.map(([k, n]) => `<div class="ivr"><span>${n}</span><input type="range" min="1" max="15" class="iv" data-k="${k}" value="${st.iv[k]}"><b>${st.iv[k]}</b></div>`).join('')}</div>
          <div class="row" style="margin-top:.3em"><button class="sm ivmax">ぜんぶ 15</button><button class="sm ivrnd">ランダム</button><span class="muted">合計 ${IVK.reduce((a, [k]) => a + st.iv[k], 0)}/60</span></div>
          <label>ニックネーム <small>10文字まで・空なら 種類の 名前</small></label><input type="text" class="nick" maxlength="10" value="${esc(st.nick)}">
          <label>持ち物</label><select class="held"><option value="">なし</option>${heldOpts.map(i => `<option value="${i.id}" ${st.item === i.id ? 'selected' : ''}>${esc(i.name)}</option>`).join('')}</select>
          <label class="chk"><input type="checkbox" class="cust" ${st.custom ? 'checked' : ''}> 技構成を 自分で 決める <small>（オフ：レベルで 自動）</small></label>
          <div class="mvs">${[0, 1, 2, 3].map(i => `<select class="mv" data-i="${i}" ${st.custom ? '' : 'disabled'}><option value="">（なし）</option>${learn().map(id => { const mv = MOVES[id]; const lvL = s.moves.find(x => x.id === id)?.lv; return `<option value="${id}" ${st.moves[i] === id ? 'selected' : ''}>${esc(mv.name)}（${TYPE_JA[mv.type]}・${mv.power ? '威力' + mv.power : '変化'}・Lv${lvL}）</option>`; }).join('')}</select>`).join('')}</div>
          <div class="mvdet">${st.moves.filter(id => MOVES[id]).map(id => moveCard(id)).join('')}</div>
          <details class="alllearn" ${st.showAll ? 'open' : ''}><summary>この アニモンが 覚えられる 技を 全部 見る（${learn().length}）</summary>
            <div class="mvdet">${learn().map(id => moveCard(id, `<span class="mtag">Lv${s.moves.find(x => x.id === id)?.lv ?? '?'}で 覚える</span>${st.moves.includes(id) ? '<span class="mtag on">選択中</span>' : ''}`)).join('')}</div></details>
          <p class="edmsg ng"></p>
          <div class="row" style="justify-content:flex-end;margin-top:.6em"><button class="cancel">やめる</button><button class="pri ok">${init ? 'これで 直す' : 'これで 追加'}</button></div>
        </div></div>`;
      const q = (s) => m.body.querySelector(s);
      q('.chsp').onclick = async () => { const n = await pickSpecies('種類を 変える'); if (n) { sp = n; st.custom = false; draw(); } };
      // 入力欄の change（フォーカスが 外れる とき）の 途中で 画面を 作りなおすと エラーに なるので 少し あとで
      const later = () => setTimeout(draw, 0);
      const setLv = (v) => { st.lv = Math.max(1, Math.min(99, Math.round(+v || 1))); later(); };
      q('.lvr').onchange = (e) => setLv(e.target.value); q('.lvr').oninput = (e) => { q('.lvn').value = e.target.value; };
      q('.lvn').onchange = (e) => setLv(e.target.value);
      m.body.querySelectorAll('.shn').forEach(b => b.onclick = () => { st.shiny = b.dataset.v === '1'; later(); });
      m.body.querySelectorAll('.iv').forEach(r => { r.oninput = () => { r.nextElementSibling.textContent = r.value; }; r.onchange = () => { st.iv[r.dataset.k] = +r.value; later(); }; });
      q('.ivmax').onclick = () => { for (const [k] of IVK) st.iv[k] = 15; draw(); };
      q('.ivrnd').onclick = () => { for (const [k] of IVK) st.iv[k] = 1 + Math.floor(Math.random() * 15); draw(); };
      q('.nick').oninput = (e) => { st.nick = e.target.value; };
      q('.held').onchange = (e) => { st.item = e.target.value; };
      q('.alllearn').ontoggle = (e) => { st.showAll = e.target.open; };
      q('.cust').onchange = (e) => { st.custom = e.target.checked; if (st.custom && !st.moves.length) st.moves = movesAtLevel(sp, st.lv); later(); };
      m.body.querySelectorAll('.mv').forEach(sel => sel.onchange = () => {
        // 同じ 技を 2つ 選んだら、もう一方と 入れかえる
        const i = +sel.dataset.i, prev = [0, 1, 2, 3].map(k => st.moves[k] || '');
        const a = [...m.body.querySelectorAll('.mv')].map(x => x.value);
        for (let j = 0; j < 4; j++) if (j !== i && a[i] && a[j] === a[i]) a[j] = prev[i];
        st.moves = a; later();
      });
      q('.cancel').onclick = () => m.close(null);
      q('.ok').onclick = () => {
        const moves = [...new Set(st.moves.filter(id => MOVES[id]))].slice(0, 4);
        if (!moves.length) { q('.edmsg').textContent = '技を 1つ以上 選んでください'; return; }
        const mon = createMon(sp, st.lv, { iv: { ...st.iv }, shiny: st.shiny, nick: st.nick.trim().slice(0, 10), moves, item: st.item || null, ot: init?.ot || o.ot || '', metAt: init?.metAt || o.metAt || '' });
        if (init) { mon.uid = init.uid; mon.caughtAt = init.caughtAt; mon.fav = !!init.fav; mon.gift = !!init.gift; mon.metLv = init.metLv || mon.metLv; }
        if (st.custom) mon.customMoves = true;
        mon.exp = expForLevel(st.lv);
        m.close(mon);
      };
    };
    draw();
  });
}

// ---------- 一覧（手持ち・ボックス） ----------
//  o: { title, max, onChange, other: { label, move(mon) }, canRemove(mon) }
export function monList(el, list, o = {}) {
  const draw = () => {
    el.innerHTML = `<div class="mlhead"><b>${esc(o.title || '')}</b><span class="muted">${list.length}${o.max ? '/' + o.max : ''}匹</span><span class="grow"></span>${o.noAdd ? '' : '<button class="sm add">＋ アニモンを 追加</button>'}</div><div class="mlgrid"></div>`;
    const g = el.querySelector('.mlgrid');
    if (!list.length) g.innerHTML = '<p class="muted" style="margin:.3em 0">（なし）</p>';
    list.forEach((mon, i) => {
      const s = SPECIES[mon.sp];
      const ivs = IVK.reduce((a, [k]) => a + (mon.iv?.[k] || 0), 0);
      const c = h('div', 'mlcell', `<img alt=""><div class="nm">${mon.shiny ? '✨' : ''}${esc(mon.nick || s.name)}</div><div class="sub">Lv${mon.lv}・個体値${ivs}${mon.item && ITEMS[mon.item] ? '・🎁' : ''}</div><div class="tys">${s.types.map(tb).join('')}</div><div class="tags">${tagHtml(mon.sp)}</div>
        <div class="ops"><button class="sm ed">✏️</button>${o.other ? `<button class="sm mv">${esc(o.other.label)}</button>` : ''}<button class="sm red rm">🗑</button></div>`);
      portraitAsync(mon.sp, mon.shiny, false, (u) => { const im = c.querySelector('img'); if (im) im.src = u; });
      c.querySelector('.ed').onclick = async () => { const n = await editMon(mon, { ot: o.ot, metAt: o.metAt }); if (n) { list[i] = n; changed(); } };
      if (o.other) c.querySelector('.mv').onclick = () => { if (o.other.move(mon) !== false) { list.splice(i, 1); changed(); } };
      c.querySelector('.rm').onclick = () => {
        if (o.canRemove && !o.canRemove(mon)) return;
        if (!confirm(`${mon.nick || s.name}（Lv${mon.lv}）を 外しますか？`)) return;
        list.splice(i, 1); changed();
      };
      g.appendChild(c);
    });
    const add = el.querySelector('.add');
    if (add) add.onclick = async () => {
      if (o.max && list.length >= o.max) { alert(`${o.max}匹までです`); return; }
      const n = await editMon(null, { ot: o.ot, metAt: o.metAt });
      if (!n) return;
      if (o.accept && o.accept(n) === false) return;
      list.push(n); changed();
    };
  };
  const changed = () => { draw(); if (o.onChange) o.onChange(); };
  draw();
  return { redraw: draw };
}

// ---------- 図鑑登録数・捕まえた数 ----------
//  図鑑登録数 N ＝ 捕まえた ことの ある 種類の 数（図鑑に のる）
//  捕まえた数 M ＝ 捕まえた アニモンの 数（同じ 種類を 何匹も 捕まえることも ある ので N 以上）
//  ・N に 足りない 種類は、その章で 出会える アニモンから 出やすい 子ほど 選ばれやすく ランダムに
//  ・登録した 種類は 1匹ずつ 必ず 持っていて、残りは 登録した 種類の 中から 出やすい 子ほど 多く 入手（ボックスへ）
export const ownedMons = (S) => [...S.party, ...S.box.filter(m => !m._gen), ...(S.story?.lulu ? [S.story.lulu] : [])];
export function monCapOf(S) { return S.postGame ? 800 : Math.min(800, 100 + (S.story?.crests || 0) * 75); }
export function dexLimits(S, pool) {
  const own = ownedMons(S), owned = new Set(own.map(m => m.sp));
  const regMax = new Set([...owned, ...(pool ? pool.catchable : SPECIES.filter(Boolean).map(s => s.id))]).size;
  return { min: owned.size, regMax, owned, ownCount: own.length, cap: monCapOf(S) };
}
export const catchMin = (L, N) => L.ownCount + Math.max(0, N - L.min);
function pickW(list, wOf, rnd) { let tot = 0; for (const x of list) tot += wOf(x); let r = rnd() * tot; for (const x of list) { r -= wOf(x); if (r <= 0) return x; } return list[list.length - 1]; }
export function applyDexCatch(S, N, M, pool, rnd = Math.random) {
  S.box = S.box.filter(m => !m._gen);          // 前に 作った ぶんは 作りなおす
  const L = dexLimits(S, pool);
  N = Math.max(L.min, Math.min(L.regMax, Math.round(+N || 0)));
  M = Math.max(catchMin(L, N), Math.min(L.cap, Math.round(+M || 0)));
  const info = pool?.info || new Map();
  const wOf = (sp) => (info.get(sp)?.w || 0.002);
  // 図鑑に 登録する 種類
  const reg = new Set(L.owned);
  const cand = [...(pool ? pool.catchable : SPECIES.filter(Boolean).map(s => s.id))].filter(sp => !reg.has(sp) && SPECIES[sp]);
  while (reg.size < N && cand.length) { const sp = pickW(cand, wOf, rnd); reg.add(sp); cand.splice(cand.indexOf(sp), 1); }
  const seen = { ...(S.dex.seen || {}) }, caught = {};
  for (const sp of reg) { caught[sp] = true; seen[sp] = true; }
  S.dex = { seen, caught };
  // 実際に 持つ アニモン
  const mk = (sp) => {
    const o = info.get(sp);
    const lv0 = o?.lv || [5, 10], lv = Math.max(1, Math.min(99, lv0[0] + Math.floor(rnd() * (lv0[1] - lv0[0] + 1))));
    const m = createMon(sp, lv, { ot: S.name, metAt: o?.where || '' });
    m.caughtAt = Date.now() - Math.floor(rnd() * Math.max(1, S.playTime || 3600) * 1000);
    m._gen = true;
    return m;
  };
  const add = [];
  for (const sp of reg) if (!L.owned.has(sp)) add.push(mk(sp));
  const regList = [...reg];
  while (L.ownCount + add.length < M) add.push(mk(pickW(regList, wOf, rnd)));
  add.sort((a, b) => b.caughtAt - a.caughtAt);
  S.box.push(...add);
  return { N, M, added: add.length };
}
export function stripGen(S) { for (const m of S.box) delete m._gen; }
