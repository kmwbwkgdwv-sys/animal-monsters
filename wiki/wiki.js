// アニモン図鑑 まとめサイト
//  ゲームの データ（js/data）を そのまま 読みこんで 作るので、ゲームを 更新すると ここも 新しくなる
import { SPECIES, BY_NAME, RARITY_JA, rarityStars, REGION_JA } from '../js/data/species.js';
import { MOVES, moveEffects } from '../js/data/moves.js';
import { ABILITIES } from '../js/data/abilities.js';
import { ITEMS, CAT_JA } from '../js/data/items.js';
import { TYPES, TYPE_JA, TYPE_COLOR, typeEff } from '../js/data/types.js';
import { REGIONS, ORDER, PAST_DUNGEONS, DUNGEON_BOSS, encounterTable, howToGet, hiddenInDex, RUINED, RUIN_NAMES, NEW_REGIONS, NEW_DUNGEONS } from '../js/data/world.js';
const DUNGEONS = { ...PAST_DUNGEONS, ...NEW_DUNGEONS };
import { portraitAsync, clearPortraitQueue, BLANK } from '../js/render/portrait.js';

// ---------------- 下ごしらえ ----------------
const MONS = SPECIES.filter(Boolean);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const kata = (s) => String(s || '').replace(/[ぁ-ゖ]/g, c => String.fromCharCode(c.charCodeAt(0) + 0x60));
const no3 = (n) => 'No.' + String(n).padStart(3, '0');
const tb = (t) => `<span class="tb" style="background:${TYPE_COLOR[t]}">${TYPE_JA[t]}</span>`;
const img = (sp, shiny = false, alt = '') => `<img data-sp="${sp}"${shiny ? ' data-sh="1"' : ''} src="${BLANK}" alt="${esc(alt || SPECIES[sp]?.name || '')}">`;
const RIDE = { land: ['🐎', '陸を 走れる'], swim: ['🌊', '水を 泳げる'], fly: ['🕊️', '空を 飛べる'] };
const STAT = [['hp', 'HP'], ['atk', '攻撃'], ['def', '防御'], ['spe', '素早さ']];
const BOSS_OF = {};   // 種類 → [ダンジョン, Lv]
for (const [did, [nm, lv]] of Object.entries({ ...DUNGEON_BOSS, meteor: ['ゼノドラグ', 99] })) if (BY_NAME[nm]) BOSS_OF[BY_NAME[nm].id] = [did, lv];

function tagsOf(s) {
  const t = [];
  if (s.legend) t.push(['legend', '伝説']);
  if (BOSS_OF[s.id]) t.push(['boss', 'ダンジョンの主']);
  if (s.starter) t.push(['starter', '最初の相棒']);
  if (s.story) t.push(['story', 'ストーリー']);
  if (s.side) t.push(['side', 'サイドストーリー']);
  if (s.rare && !s.legend) t.push(['rare', 'めずらしい']);
  if (s.ride) t.push(['ride', `${RIDE[s.ride][0]} ライド`]);
  if (s.gen2 && !s.legend) t.push(['gen2', '第2部']);
  return t;
}
const tagHtml = (s) => tagsOf(s).map(([k, v]) => `<span class="tag ${k}">${v}</span>`).join('');

// 場所ごとの 出現（陸・水上・ダンジョン）
//  era：past＝第1部の 大陸（隕石の 前・時の扉の 向こう）／ now＝第2部（隕石の あと）
const SEA_W = encounterTable('sea', true, false);
const PLACES = [];
for (const rid of ORDER) {
  const R = REGIONS[rid]; if (!R) continue;
  const tables = [];
  const land = encounterTable(rid, false, false); if (land.length) tables.push(['草むら・陸', land]);
  const water = encounterTable(rid, true, false); if (water.length && water !== SEA_W) tables.push(['水上', water]);
  PLACES.push({ id: rid, era: 'past', name: REGION_JA[rid], kind: 'region', lv: R.lv, tables, ruined: RUINED.has(rid) });
}
PLACES.push({ id: 'sea', era: 'past', name: REGION_JA.sea, kind: 'region', lv: REGIONS.sea.lv, tables: [['水上', SEA_W]] });
for (const [did, D] of Object.entries(PAST_DUNGEONS)) {
  PLACES.push({ id: did, era: 'past', name: D.name, kind: 'dungeon', lv: D.lv, post: !!D.post, near: REGION_JA[D.region], tables: [['ダンジョンの 中', encounterTable(did, false, false)]], boss: DUNGEON_BOSS[did], ruined: did === 'ruins' });
}
// 第2部：隕石の あと（こわれた 地域・新しい 場所）
for (const rid of [...RUINED, ...Object.keys(NEW_REGIONS)]) {
  const R = REGIONS[rid] || NEW_REGIONS[rid];
  const tables = [];
  const land = encounterTable(rid, false, true); if (land.length) tables.push(['草むら・陸', land]);
  const water = encounterTable(rid, true, true); if (water.length) tables.push(['水上', water]);
  PLACES.push({ id: 'now_' + rid, era: 'now', name: RUIN_NAMES[rid] || R.name, kind: 'region', lv: R.lv, tables, was: RUIN_NAMES[rid] ? REGION_JA[rid] : '' });
}
for (const [did, D] of Object.entries(NEW_DUNGEONS)) {
  PLACES.push({ id: did, era: 'now', name: D.name, kind: 'dungeon', lv: D.lv, near: NEW_REGIONS[D.region]?.name, tables: [['ダンジョンの 中', encounterTable(did, false, true)]], boss: ['ゼノドラグ', 99], post: true });
}
const PLACE = Object.fromEntries(PLACES.map(p => [p.id, p]));
// 出現の 一覧（出現率・レベル）と 種類ごとの 生息地
const WHERE = new Map();
for (const p of PLACES) {
  p.rows = [];
  for (const [label, tbl] of p.tables) {
    const sum = tbl.reduce((a, e) => a + e.w, 0) || 1;
    const rows = tbl.map(e => ({ sp: e.sp, rate: e.w / sum * 100, lv: [Math.max(p.lv[0], e.minLv), Math.max(p.lv[1], e.minLv)], label })).sort((a, b) => b.rate - a.rate);
    p.rows.push([label, rows]);
    for (const r of rows) { if (!WHERE.has(r.sp)) WHERE.set(r.sp, []); WHERE.get(r.sp).push({ place: p, ...r }); }
  }
}
// 技 → 覚える アニモン
const LEARN = new Map();
for (const s of MONS) for (const x of s.moves) { if (!LEARN.has(x.id)) LEARN.set(x.id, []); LEARN.get(x.id).push({ sp: s.id, lv: x.lv }); }
const pct = (r) => r >= 10 ? Math.round(r) + '%' : r >= 1 ? r.toFixed(1) + '%' : r.toFixed(2) + '%';
const lvTxt = (lv) => lv[0] === lv[1] ? `Lv${lv[0]}` : `Lv${lv[0]}〜${lv[1]}`;

// ネタバレ防止（伝説・かくれた アニモン）
let spoilHide = false;
try { spoilHide = localStorage.getItem('animon_wiki_hide') === '1'; } catch (e) { /* */ }
const isHidden = (s) => spoilHide && hiddenInDex(s);

// ---------------- 画像（画面に 見えた ものから 順に 作る） ----------------
let io = null;
function loadImgs(root) {
  if (io) io.disconnect();
  io = new IntersectionObserver((ents) => {
    for (const e of ents) {
      if (!e.isIntersecting) continue;
      const im = e.target; io.unobserve(im);
      portraitAsync(+im.dataset.sp, im.dataset.sh === '1', false, (u) => { im.src = u; });
    }
  }, { rootMargin: '300px 0px' });
  root.querySelectorAll('img[data-sp]').forEach(im => io.observe(im));
}

// ---------------- 画面 ----------------
const app = document.getElementById('app');
const state = { mons: { q: '', type: '', place: '', tag: '', sort: 'no' }, moves: { q: '', type: '', cat: '', sort: 'type' }, scroll: {} };

function viewMons() {
  const f = state.mons;
  app.innerHTML = `<h2>アニモン 一覧</h2>
    <div class="filters">
      <input type="search" class="q" placeholder="名前で さがす（ひらがなでも OK）" value="${esc(f.q)}">
      <select class="type"><option value="">すべての タイプ</option>${TYPES.map(t => `<option value="${t}" ${f.type === t ? 'selected' : ''}>${TYPE_JA[t]}</option>`).join('')}</select>
      <select class="place"><option value="">すべての 場所</option>${PLACES.map(p => `<option value="${p.id}" ${f.place === p.id ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select>
      <select class="tag"><option value="">しぼりこみ なし</option>${[['gen2', '第2部の 新しい アニモン'], ['legend', '伝説'], ['boss', 'ダンジョンの主'], ['starter', '最初の相棒'], ['ride', 'ライドできる'], ['rare', 'めずらしい'], ['side', 'サイドストーリー'], ['final', '最終進化'], ['noevo', '進化しない']].map(([k, v]) => `<option value="${k}" ${f.tag === k ? 'selected' : ''}>${v}</option>`).join('')}</select>
      <select class="sort">${[['no', '図鑑番号順'], ['bst', '能力の 合計が 高い順'], ['hp', 'HPが 高い順'], ['atk', '攻撃が 高い順'], ['def', '防御が 高い順'], ['spe', '素早さが 高い順'], ['name', '名前順']].map(([k, v]) => `<option value="${k}" ${f.sort === k ? 'selected' : ''}>${v}</option>`).join('')}</select>
      <label><input type="checkbox" class="hide" ${spoilHide ? 'checked' : ''}> ネタバレ防止（伝説・かくれた アニモンを かくす）</label>
    </div><div class="count"></div><div class="mgrid"></div>`;
  const grid = app.querySelector('.mgrid'), cnt = app.querySelector('.count');
  const draw = () => {
    const q = kata(f.q.trim());
    const inPlace = f.place ? new Set((PLACE[f.place]?.rows || []).flatMap(([, rows]) => rows.map(r => r.sp)).concat(PLACE[f.place]?.boss && BY_NAME[PLACE[f.place].boss[0]] ? [BY_NAME[PLACE[f.place].boss[0]].id] : [])) : null;
    let list = MONS.filter(s => (!q || kata(s.name).includes(q) || String(s.id) === q) && (!f.type || s.types.includes(f.type)) && (!inPlace || inPlace.has(s.id))
      && (!f.tag || (f.tag === 'final' ? !s.evoTo && s.stages > 1 : f.tag === 'noevo' ? s.stages === 1 : tagsOf(s).some(([k]) => k === f.tag))));
    const hidden = list.filter(isHidden).length;
    list = list.filter(s => !isHidden(s));
    const st = (s, k) => k === 'bst' ? s.bst : s.base[k];
    if (f.sort === 'name') list.sort((a, b) => a.name.localeCompare(b.name, 'ja'));
    else if (f.sort !== 'no') list.sort((a, b) => st(b, f.sort) - st(a, f.sort) || a.id - b.id);
    cnt.textContent = `${list.length}匹${hidden ? `（ネタバレ防止で ${hidden}匹 かくしています）` : ''}`;
    grid.innerHTML = list.length ? list.map(s => `<a class="mc" href="#/mon/${s.id}">${img(s.id)}<div class="no">${no3(s.id)}</div><div class="nm">${esc(s.name)}</div><div class="ty">${s.types.map(tb).join('')}</div><div class="ds">${esc(s.desc)}</div><div class="tags">${tagHtml(s)}</div></a>`).join('') : '<p class="empty">見つかりません</p>';
    loadImgs(grid);
  };
  const on = (sel, ev, fn) => app.querySelector(sel).addEventListener(ev, fn);
  on('.q', 'input', (e) => { f.q = e.target.value; draw(); });
  for (const k of ['type', 'place', 'tag', 'sort']) on('.' + k, 'change', (e) => { f[k] = e.target.value; draw(); });
  on('.hide', 'change', (e) => { spoilHide = e.target.checked; try { localStorage.setItem('animon_wiki_hide', spoilHide ? '1' : '0'); } catch (er) { /* */ } draw(); });
  draw();
}

function viewMon(id) {
  const s = SPECIES[+id];
  if (!s) { app.innerHTML = '<p class="empty">見つかりません</p>'; return; }
  const ab = ABILITIES[s.ability];
  // 進化の ながれ
  let b = s; while (b.evoFrom) b = SPECIES[b.evoFrom];
  const chain = []; for (let x = b; x; x = x.evoTo ? SPECIES[x.evoTo] : null) chain.push(x);
  const evoHtml = chain.length > 1 ? `<div class="evo">${chain.map((x, i) => `${i ? `<div class="ar">→<br>Lv${chain[i - 1].evoLv}</div>` : ''}<a href="#/mon/${x.id}" class="${x.id === s.id ? 'on' : ''}">${img(x.id)}<b>${esc(x.name)}</b><span class="small muted">${no3(x.id)}</span></a>`).join('')}</div>` : '<p class="muted">進化しない アニモンです。</p>';
  // 生息地
  const where = (WHERE.get(s.id) || []).slice().sort((a, b2) => (a.place.kind === b2.place.kind ? 0 : a.place.kind === 'region' ? -1 : 1) || a.lv[0] - b2.lv[0]);
  const boss = BOSS_OF[s.id];
  const get = howToGet(s).filter(t => !t.startsWith('生息地：') && t !== '？？？');
  const whereHtml = (where.length ? `<div class="tw"><table><tr><th>場所</th><th>どこで</th><th>レベル</th><th>出現率</th></tr>${where.map(w => `<tr class="link" data-go="#/place/${w.place.id}"><td><b>${esc(w.place.name)}</b>${w.place.era === 'now' ? ' <span class="tag gen2">第2部</span>' : ''}${w.place.post ? ' <span class="tag">クリア後</span>' : ''}</td><td>${esc(w.label)}</td><td class="n">${lvTxt(w.lv)}</td><td class="n">${pct(w.rate)}</td></tr>`).join('')}</table></div>` : '')
    + (boss ? `<p>👑 <a href="#/place/${boss[0]}"><b>${esc(DUNGEONS[boss[0]].name)}</b></a> の ダンジョンの主（Lv${boss[1]}）として 待ちかまえている。</p>` : '')
    + (get.length ? `<ul>${get.map(t => `<li>${esc(t)}</li>`).join('')}</ul>` : '')
    + (!where.length && !boss && !get.length ? '<p class="muted">野生では 出てこない。</p>' : '');
  // 覚える 技
  const mvRows = s.moves.slice().sort((a, c) => a.lv - c.lv).map(x => {
    const mv = MOVES[x.id]; if (!mv) return '';
    const e = moveEffects(mv);
    return `<a class="lrow" href="#/move/${mv.id}" style="border-left-color:${TYPE_COLOR[mv.type]}"><div class="l1"><span class="lv">Lv${x.lv}</span><b class="mvn">${esc(mv.name)}</b>${tb(mv.type)}${mv.sig ? '<span class="sig">特別技</span>' : ''}<span class="num">威力 <b>${mv.power || '—'}</b>・命中 <b>${mv.acc >= 999 || !mv.acc ? '—' : mv.acc}</b>・PP <b>${mv.pp}</b></span></div><div class="ds">${esc(mv.desc)}${e.length ? `<div class="eff">${esc(e.join('・'))}</div>` : ''}</div></a>`;
  }).join('');
  // タイプ相性（受ける ダメージ）
  const groups = { 4: [], 2: [], 0.5: [], 0.25: [], 0: [] };
  for (const t of TYPES) { const m = typeEff(t, s.types); if (groups[m]) groups[m].push(t); }
  const weak = [['4', '×4 ばつぐん'], ['2', '×2 ばつぐん'], ['0.5', '×½ いまひとつ'], ['0.25', '×¼ いまひとつ'], ['0', '×0 効かない']].filter(([k]) => groups[k].length).map(([k, v]) => `<div><b>${v}</b>${groups[k].map(tb).join('')}</div>`).join('');
  const prev = SPECIES[s.id - 1], next = SPECIES[s.id + 1];
  app.innerHTML = `<a class="back" href="#/mons">← アニモン 一覧</a>
    <div class="dhead">
      <div class="pic">${img(s.id, false)}<div><div class="seg"><button class="on" data-sh="0">通常</button><button data-sh="1" ${s.legend ? 'disabled title="伝説に 色違いは いません"' : ''}>✨ 色違い</button></div></div></div>
      <div>
        <div class="dno">${no3(s.id)}</div>
        <h1 class="dname">${esc(s.name)}</h1>
        <div style="margin:.3em 0">${s.types.map(tb).join('')} ${tagHtml(s)}</div>
        <p class="desc">${esc(s.desc)}</p>
        <dl class="kv">
          <dt>特殊能力</dt><dd><b>${esc(ab?.name || '—')}</b><div class="small muted">${esc(ab?.desc || '')}</div></dd>
          <dt>出現しやすさ</dt><dd>${s.rarity >= 5 ? '★★★★★' : rarityStars(s.rarity)} ${RARITY_JA[s.rarity] || ''}</dd>
          ${s.ride ? `<dt>ライド</dt><dd>${RIDE[s.ride][0]} ${RIDE[s.ride][1]}</dd>` : ''}
        </dl>
        <div class="card">
          ${STAT.map(([k, n]) => `<div class="stat"><span>${n}</span><b>${s.base[k]}</b><span class="bar"><i style="width:${Math.min(100, s.base[k] / 1.5)}%"></i></span></div>`).join('')}
          <div class="small muted" style="text-align:right">種族値の 合計 <b style="color:var(--txt)">${s.bst}</b>（個体値 1〜15 で ±8% ほど 変わる）</div>
        </div>
      </div>
    </div>
    <h3>進化</h3>${evoHtml}
    <h3>入手場所・入手方法</h3>${whereHtml}
    <h3>覚える 技（${s.moves.length}）</h3><div class="lset">${mvRows}</div>
    <h3>タイプ相性（受ける ダメージ）</h3><div class="card weak">${weak || '<div class="muted">とくに なし</div>'}</div>
    <div class="filters" style="justify-content:space-between;margin-top:1.2em">${prev ? `<a class="back" href="#/mon/${prev.id}">← ${no3(prev.id)} ${esc(prev.name)}</a>` : '<span></span>'}${next ? `<a class="back" href="#/mon/${next.id}">${no3(next.id)} ${esc(next.name)} →</a>` : ''}</div>`;
  app.querySelectorAll('.seg button').forEach(bt => bt.onclick = () => {
    app.querySelectorAll('.seg button').forEach(x => x.classList.toggle('on', x === bt));
    const im = app.querySelector('.pic img'); im.dataset.sh = bt.dataset.sh;
    portraitAsync(s.id, bt.dataset.sh === '1', false, (u) => { im.src = u; });
  });
  loadImgs(app);
}

function moveCatOk(mv, c) { return !c || (c === 'atk' ? mv.power > 0 : c === 'status' ? !mv.power : !!mv.sig); }
function viewMoves() {
  const f = state.moves;
  const all = Object.values(MOVES);
  app.innerHTML = `<h2>技 一覧</h2>
    <div class="filters">
      <input type="search" class="q" placeholder="技の 名前で さがす" value="${esc(f.q)}">
      <select class="type"><option value="">すべての タイプ</option>${TYPES.map(t => `<option value="${t}" ${f.type === t ? 'selected' : ''}>${TYPE_JA[t]}</option>`).join('')}</select>
      <select class="cat">${[['', '攻撃・変化 すべて'], ['atk', '攻撃する 技'], ['status', '変化技'], ['sig', '特別技（専用）']].map(([k, v]) => `<option value="${k}" ${f.cat === k ? 'selected' : ''}>${v}</option>`).join('')}</select>
      <select class="sort">${[['type', 'タイプ順'], ['power', '威力が 高い順'], ['name', '名前順']].map(([k, v]) => `<option value="${k}" ${f.sort === k ? 'selected' : ''}>${v}</option>`).join('')}</select>
    </div><div class="count"></div><div class="mvlist"></div>`;
  const box = app.querySelector('.mvlist'), cnt = app.querySelector('.count');
  const draw = () => {
    const q = kata(f.q.trim());
    let list = all.filter(mv => (!q || kata(mv.name).includes(q)) && (!f.type || mv.type === f.type) && moveCatOk(mv, f.cat));
    if (f.sort === 'name') list.sort((a, b) => a.name.localeCompare(b.name, 'ja'));
    else if (f.sort === 'power') list.sort((a, b) => (b.power || 0) - (a.power || 0) || TYPES.indexOf(a.type) - TYPES.indexOf(b.type));
    else list.sort((a, b) => TYPES.indexOf(a.type) - TYPES.indexOf(b.type) || (a.power || 0) - (b.power || 0));
    cnt.textContent = `${list.length}種類`;
    box.innerHTML = list.length ? list.map(mv => { const e = moveEffects(mv); return `<a class="mv" href="#/move/${mv.id}" style="border-left-color:${TYPE_COLOR[mv.type]}"><div class="top"><span class="nm">${esc(mv.name)}</span>${tb(mv.type)}${mv.sig ? '<span class="sig">特別技</span>' : ''}</div>
      <div class="num">威力 <b>${mv.power || '—'}</b>　命中 <b>${mv.acc >= 999 || !mv.acc ? '—' : mv.acc}</b>　PP <b>${mv.pp}</b>　覚える アニモン <b>${(LEARN.get(mv.id) || []).length}</b></div>
      <div class="ds">${esc(mv.desc)}</div>${e.length ? `<div class="eff">${esc(e.join('・'))}</div>` : ''}</a>`; }).join('') : '<p class="empty">見つかりません</p>';
  };
  const on = (sel, ev, fn) => app.querySelector(sel).addEventListener(ev, fn);
  on('.q', 'input', (e) => { f.q = e.target.value; draw(); });
  for (const k of ['type', 'cat', 'sort']) on('.' + k, 'change', (e) => { f[k] = e.target.value; draw(); });
  draw();
}

function viewMove(id) {
  const mv = MOVES[id];
  if (!mv) { app.innerHTML = '<p class="empty">見つかりません</p>'; return; }
  const e = moveEffects(mv);
  const ls = (LEARN.get(mv.id) || []).slice().sort((a, b) => a.sp - b.sp);
  const shown = ls.filter(x => !isHidden(SPECIES[x.sp]));
  app.innerHTML = `<a class="back" href="#/moves">← 技 一覧</a>
    <h1 class="dname">${esc(mv.name)}</h1>
    <div style="margin:.4em 0">${tb(mv.type)} ${mv.sig ? `<span class="sig">特別技（${esc(mv.sig)}だけが 使える）</span>` : ''}</div>
    <div class="card"><dl class="kv">
      <dt>分類</dt><dd>${mv.power ? '攻撃する 技' : '変化技'}</dd>
      <dt>威力</dt><dd>${mv.power || '—'}</dd>
      <dt>命中</dt><dd>${mv.acc >= 999 || !mv.acc ? '—（かならず 当たる）' : mv.acc}</dd>
      <dt>PP</dt><dd>${mv.pp}（使える 回数）</dd>
      ${mv.pri > 0 ? '<dt>先制</dt><dd>先に 出せる</dd>' : ''}
      <dt>説明</dt><dd>${esc(mv.desc)}</dd>
      <dt>効果</dt><dd>${e.length ? esc(e.join('・')) : (mv.power ? '追加効果なし' : '—')}</dd>
    </dl></div>
    <h3>この 技を 覚える アニモン（${shown.length}匹${shown.length < ls.length ? `・ネタバレ防止で ${ls.length - shown.length}匹 かくしています` : ''}）</h3>
    <div>${shown.map(x => `<a class="mini" href="#/mon/${x.sp}">${img(x.sp)}${esc(SPECIES[x.sp].name)} <small>Lv${x.lv}</small></a>`).join('') || '<p class="muted">いません</p>'}</div>`;
  loadImgs(app);
}

function viewPlaces() {
  const card = (p) => {
    const faces = p.rows.flatMap(([, rows]) => rows).sort((a, b) => b.rate - a.rate).filter(r => !isHidden(SPECIES[r.sp])).slice(0, 8);
    const n = new Set(p.rows.flatMap(([, rows]) => rows.map(r => r.sp))).size;
    return `<a class="pl" href="#/place/${p.id}"><div class="nm">${p.kind === 'dungeon' ? '⛩ ' : p.era === 'now' ? '☄️ ' : '🌿 '}${esc(p.name)}${p.post ? ' <span class="tag">クリア後</span>' : ''}${p.ruined ? ' <span class="tag">第2部では こわれる</span>' : ''}${p.was ? ` <span class="small muted">（もとの ${esc(p.was)}）</span>` : ''}</div>
      <div class="small muted">${lvTxt(p.lv)}・${n}種類${p.near ? `・${esc(p.near)}の 近く` : ''}${p.boss ? `・主 ${esc(p.boss[0])}` : ''}</div>
      <div class="faces">${[...new Map(faces.map(r => [r.sp, r])).values()].map(r => img(r.sp)).join('')}</div></a>`;
  };
  app.innerHTML = `<h2>入手場所</h2><p class="muted small">場所を 押すと、そこに 出る アニモンと 出現率・レベルが 見られます（出現率は 目安。レベルが 足りない 進化後の アニモンは 出ない ことも あります）。</p>
    <h3>第2部：隕石の あとの 大陸（現在）</h3><p class="muted small">こわれた 地域と 新しい 場所には、隕石の あとに 生まれた 新しい アニモン だけが 出ます（レベルは もとの 場所と 同じくらい）。こわれていない 地域（砂漠・渓谷・氷山・聖域など）は 第1部と 同じです。</p>
    <div class="plist">${PLACES.filter(p => p.era === 'now').map(card).join('')}</div>
    <h3>第1部の 大陸（第2部では 時の扉で 行ける「過去」）</h3><div class="plist">${PLACES.filter(p => p.era === 'past' && p.kind === 'region').map(card).join('')}</div>
    <h3>ダンジョン（第1部）</h3><div class="plist">${PLACES.filter(p => p.era === 'past' && p.kind === 'dungeon').map(card).join('')}</div>`;
  loadImgs(app);
}

function viewPlace(id) {
  const p = PLACE[id];
  if (!p) { app.innerHTML = '<p class="empty">見つかりません</p>'; return; }
  const bossSp = p.boss && BY_NAME[p.boss[0]];
  let hid = 0;
  const sec = p.rows.map(([label, rows]) => {
    const vis = rows.filter(r => { const h = isHidden(SPECIES[r.sp]); if (h) hid++; return !h; });
    return `<h3>${esc(label)}（${vis.length}種類）</h3><div class="enc">${vis.map(r => `<a href="#/mon/${r.sp}">${img(r.sp)}<div class="nm">${esc(SPECIES[r.sp].name)}</div><div>${SPECIES[r.sp].types.map(tb).join('')}</div><div class="rt">出現率 ${pct(r.rate)}</div><div class="lv">${lvTxt(r.lv)}</div></a>`).join('')}</div>`;
  }).join('');
  app.innerHTML = `<a class="back" href="#/places">← 入手場所</a>
    <h1 class="dname">${p.kind === 'dungeon' ? '⛩ ' : '🌿 '}${esc(p.name)}</h1>
    <p class="muted">${p.era === 'now' ? '第2部（隕石の あと）・' : ''}野生の レベル ${lvTxt(p.lv)}${p.near ? `・${esc(p.near)}の 近くに ある ダンジョン` : ''}${p.post ? (p.era === 'now' ? '・第2部 クリア後に 入れる' : '・ストーリー クリア後に 入れる') : ''}${p.ruined ? '・第2部では こわれて 新しい アニモンの 場所に なる（時の扉で 過去へ 行けば 会える）' : ''}${hid ? `（ネタバレ防止で ${hid}種類 かくしています）` : ''}</p>
    ${bossSp && !isHidden(bossSp) ? `<h3>👑 ダンジョンの主</h3><div class="enc"><a href="#/mon/${bossSp.id}">${img(bossSp.id)}<div class="nm">${esc(bossSp.name)}</div><div>${bossSp.types.map(tb).join('')}</div><div class="rt">Lv${p.boss[1]}</div></a></div>` : ''}
    ${sec || '<p class="muted">野生の アニモンは 出ない。</p>'}`;
  loadImgs(app);
}

function viewTypes() {
  const mark = (m) => m >= 2 ? ['x2', '◎'] : m === 0 ? ['x0', '×'] : m < 1 ? ['x05', '△'] : ['', ''];
  const sel = state.typeSel || 'fire';
  const one = (t) => {
    const atk = { 2: [], 0.5: [], 0: [] }, def = { 2: [], 0.5: [], 0: [] };
    for (const d of TYPES) { const m = typeEff(t, [d]); if (atk[m]) atk[m].push(d); const m2 = typeEff(d, [t]); if (def[m2]) def[m2].push(d); }
    const row = (lbl, arr) => arr.length ? `<div><b>${lbl}</b>${arr.map(tb).join('')}</div>` : '';
    return `<div class="card weak"><div style="font-weight:900">${tb(t)} で 攻撃する とき</div>${row('◎ ×2', atk[2])}${row('△ ×½', atk[0.5])}${row('× ×0', atk[0])}
      <div style="font-weight:900;margin-top:.4em">${tb(t)} が 攻撃を 受ける とき</div>${row('◎ ×2', def[2])}${row('△ ×½', def[0.5])}${row('× ×0', def[0])}</div>`;
  };
  app.innerHTML = `<h2>タイプ相性</h2>
    <div class="filters"><label>タイプを 選ぶ <select class="tsel">${TYPES.map(t => `<option value="${t}" ${sel === t ? 'selected' : ''}>${TYPE_JA[t]}</option>`).join('')}</select></label></div>
    <div class="one">${one(sel)}</div>
    <h3>相性表（左：攻撃する 技の タイプ ／ 上：受ける アニモンの タイプ）</h3>
    <div class="legend"><span><i style="background:#d8452e"></i>◎ ×2 ばつぐん</span><span><i style="background:#3b5ea8"></i>△ ×½ いまひとつ</span><span><i style="background:#222"></i>× 効かない</span></div>
    <div class="tw" style="padding:.4em"><table class="chart"><tr><th></th>${TYPES.map(t => `<th class="ch" style="color:${TYPE_COLOR[t]}">${TYPE_JA[t]}</th>`).join('')}</tr>
      ${TYPES.map(a => `<tr><th class="rh">${tb(a)}</th>${TYPES.map(d => { const [c, s] = mark(typeEff(a, [d])); return `<td class="${c}" title="${TYPE_JA[a]}→${TYPE_JA[d]}">${s}</td>`; }).join('')}</tr>`).join('')}</table></div>
    <p class="muted small">タイプが 2つ ある アニモンには、それぞれの 倍率を かけ算します（例：×2 と ×2 で ×4）。</p>`;
  app.querySelector('.tsel').onchange = (e) => { state.typeSel = e.target.value; app.querySelector('.one').innerHTML = one(e.target.value); };
}

function viewItems() {
  const cats = Object.keys(CAT_JA);
  const all = Object.values(ITEMS);
  const price = (it) => it.price > 0 ? `¥${it.price.toLocaleString()}${it.unlock > 0 ? `（紋章 ${it.unlock}個で 入荷）` : ''}` : '非売品';
  app.innerHTML = `<h2>道具</h2>` + cats.map(c => {
    const list = all.filter(it => it.cat === c);
    if (!list.length) return '';
    return `<h3>${esc(CAT_JA[c])}（${list.length}）</h3><div class="ilist">${list.map(it => `<div class="it"><div class="ic">${it.icon || ({ heal: '🧪', revive: '💊', status: '🩹', pp: '💧', food: '🍙', held: '🎁', scroll: '📜', candy: '🍬', mat: '🪨', crown: '👑', field: '🧰' }[c] || '🎒')}</div><div><div class="nm">${esc(it.name)}</div><div class="pr">${price(it)}</div><div class="ds">${esc(it.desc || '')}</div></div></div>`).join('')}</div>`;
  }).join('');
}

// ---------------- 行き先（#/mons・#/mon/12・#/moves・#/move/id・#/places・#/place/id・#/types・#/items） ----------------
const VIEWS = { mons: viewMons, mon: viewMon, moves: viewMoves, move: viewMove, places: viewPlaces, place: viewPlace, types: viewTypes, items: viewItems };
const TAB_OF = { mon: 'mons', move: 'moves', place: 'places' };
let cur = '';
function route() {
  if (cur && !cur.includes('/', 2)) state.scroll[cur] = window.scrollY;   // 一覧の 位置を おぼえる
  const h = location.hash || '#/mons';
  const [, a = 'mons', b = ''] = h.split('/');
  const v = VIEWS[a] || viewMons;
  clearPortraitQueue();
  v(decodeURIComponent(b));
  const tab = TAB_OF[a] || a;
  document.querySelectorAll('nav.tabs a').forEach(x => x.classList.toggle('on', x.dataset.t === tab));
  cur = '#/' + a + (b ? '/' + b : '');
  const y = b ? 0 : (state.scroll[cur] || 0);
  requestAnimationFrame(() => window.scrollTo(0, y));
  document.title = (app.querySelector('.dname')?.textContent || { mons: 'アニモン 一覧', moves: '技 一覧', places: '入手場所', types: 'タイプ相性', items: '道具' }[a] || '') + '｜アニモン図鑑 まとめ';
}
app.addEventListener('click', (e) => { const tr = e.target.closest('tr[data-go]'); if (tr && !e.target.closest('a')) location.hash = tr.dataset.go; });
window.addEventListener('hashchange', route);
const topBtn = document.querySelector('.top-btn');
window.addEventListener('scroll', () => topBtn.classList.toggle('on', window.scrollY > 600), { passive: true });
topBtn.onclick = () => window.scrollTo({ top: 0, behavior: 'smooth' });
route();
