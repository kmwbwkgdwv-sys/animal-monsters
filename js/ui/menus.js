// =============================================================
//  メニュー画面いろいろ
// =============================================================
import { SPECIES, DEX_COUNT, REGION_JA } from '../data/species.js';
import { MOVES } from '../data/moves.js';
import { ITEMS, CAT_JA } from '../data/items.js';
import { ABILITIES } from '../data/abilities.js';
import { TYPES, TYPE_JA, TYPE_COLOR, typeBadge } from '../data/types.js';
import { TOWNS, STONES, DUNGEONS, REGIONS, RING, howToGet, hiddenInDex, WORLD, START_POS } from '../data/world.js';
import { CREST_JA } from '../data/story.js';
import { G, PARTY_MAX, partyHasSpecies, itemCount, addItem, useItem, addMoney, save, healParty, crests, isUnlocked, dexCounts, findMon } from '../game/state.js';
import { calcStats, monName, ivTotal, ivRank, expProgress, expToNext, healMon, maxHp, addExp, expForLevel } from '../game/mon.js';
import { $, el, esc, openScreen, toast, ask, confirmBox, inputText, say, fade, hpClass, closeAllScreens } from './ui.js';
import { portrait, portraitAsync, BLANK } from '../render/portrait.js';
import { audio } from '../audio.js';
import { STATUS_JA } from '../game/battle.js';
import { saveSettings } from '../game/save.js';
import { learnMove, evolveScene } from './battleUI.js';

const waitClose = (s) => new Promise(r => { s.onClose = r; });
const STAT_JA = { hp: 'HP（体力）', atk: '攻撃', def: '防御', spe: '素早さ' };

// ---------- メインメニュー ----------
export async function openMainMenu() {
  const s = openScreen('メニュー');
  const ov = await import('../game/overworld.js');
  const c = dexCounts();
  const mins = Math.floor(G.save.playTime / 60);
  s.body.innerHTML = `
  <div class="card" style="margin-bottom:.8em"><div class="row"><div class="grow"><b style="font-size:1.15em">${esc(G.save.name)}</b>　<span class="muted">プレイ時間 ${Math.floor(mins / 60)}時間${mins % 60}分</span></div><b style="color:var(--acc)">¥${G.save.money.toLocaleString()}</b></div>
  <div class="row muted" style="margin-top:.3em">図鑑 ${c.caught}/${DEX_COUNT}（見つけた ${c.seen}）　紋章 ${crests()}/8 ${G.save.postGame ? '　<span style="color:var(--acc)">★クリア済み（経験値2倍）</span>' : ''}</div>
  <div class="row" style="margin-top:.3em;gap:.3em">${CREST_JA.map((n, i) => `<span title="${n}" style="font-size:1.2em;opacity:${i < crests() ? 1 : .2}">${['🌳', '💧', '🏜️', '⛰️', '❄️', '🌫️', '☁️', '🌋'][i]}</span>`).join('')}</div></div>
  <div class="boxgrid" style="grid-template-columns:repeat(auto-fill,minmax(8.5em,1fr))"></div>`;
  const grid = s.body.querySelector('.boxgrid');
  const items = [['🐾', 'パーティー', () => openParty()], ['📦', 'ボックス', () => openBox()], ['📖', '図鑑', () => openDex()], ['🎒', 'バッグ', () => openBag()],
    ['🗺️', 'マップ', () => openMap()], ['🐎', 'ライド', () => openRide()], ['🤝', 'フレンド', async () => (await import('./onlineUI.js')).openFriends()],
    ['💾', 'セーブ', async () => { save(); toast('セーブしました！'); }], ['⚙️', '設定', () => openSettings(false)], ['🏠', 'タイトルへ', async () => { if (await confirmBox('セーブして タイトル画面に 戻りますか？')) { save(); location.reload(); } }]];
  for (const [ic, nm, fn] of items) {
    const b = el('button', 'bcell', `<div style="font-size:1.8em">${ic}</div><div style="font-weight:800;font-size:.9em">${nm}</div>`);
    b.style.aspectRatio = '1.3';
    b.onclick = async () => { audio.sfx('select'); await fn(); };
    grid.appendChild(b);
  }
  void ov;
  await waitClose(s);
}

// ---------- 小さい部品 ----------
function monCardHtml(m, extra = '') {
  const mx = maxHp(m), r = m.hp / mx;
  return `<img src="${portrait(m.sp, m.shiny)}"><div class="info"><div class="nm">${m.shiny ? '<span class="shiny">✨</span>' : ''}${esc(monName(m))} <span class="lv">Lv${m.lv}</span>${m.status ? `<span class="st ${m.status}">${STATUS_JA[m.status]}</span>` : ''}${m.hp <= 0 ? '<span class="st fnt">ひんし</span>' : ''}</div>
  <div style="font-size:.75em">${SPECIES[m.sp].types.map(typeBadge).join('')}${m.item ? ` <span class="muted">🎁${esc(ITEMS[m.item]?.name || '')}</span>` : ''}</div>
  <div class="hpbar"><i class="${hpClass(r)}" style="width:${Math.max(0, r * 100)}%"></i></div><div class="muted" style="font-size:.78em">HP ${m.hp}/${mx}${extra}</div></div>`;
}

// ---------- パーティー ----------
export async function openParty() {
  const s = openScreen('パーティー', { extra: '<span class="muted">同じアニモンは1匹まで・最大6匹</span>' });
  const render = () => {
    s.body.innerHTML = '<div class="mlist"></div>';
    const list = s.body.querySelector('.mlist');
    G.save.party.forEach((m, i) => {
      const c = el('button', 'mcard' + (m.hp <= 0 ? ' fnt' : ''), monCardHtml(m, i === 0 ? '　<b style="color:var(--acc)">先頭</b>' : ''));
      c.onclick = async () => { audio.sfx('select'); await monDetail(m, 'party'); render(); };
      list.appendChild(c);
    });
  };
  render();
  await waitClose(s);
  (await import('../game/overworld.js')).refreshFollower();
}

// ---------- 詳細 ----------
export async function monDetail(m, where) {
  const s = openScreen(monName(m));
  const render = () => {
    const sp = SPECIES[m.sp], st = calcStats(m), ab = ABILITIES[sp.ability];
    const ivr = ivRank(m);
    const statRow = (k) => `<div class="statrow"><span>${STAT_JA[k]}</span><b>${st[k]}</b><div class="bar"><i style="width:${Math.min(100, st[k] / (k === 'hp' ? 3.6 : 2.6))}%"></i></div></div>`;
    const ivRow = (k) => `<div class="statrow ivrow"><span>${STAT_JA[k].replace(/（.*）/, '')}</span><b>${m.iv[k]}</b><div class="bar"><i style="width:${m.iv[k] / 15 * 100}%"></i></div></div>`;
    s.head.querySelector('h2').textContent = monName(m);
    s.body.innerHTML = `<div class="detail"><div><img class="bigpic" src="${portrait(m.sp, m.shiny)}">
      <div style="text-align:center;margin-top:.4em">${m.shiny ? '<span class="shiny">✨色違い</span> ' : ''}${m.fav ? '★お気に入り' : ''}</div>
      <div class="muted" style="text-align:center;font-size:.8em">No.${String(sp.id).padStart(3, '0')} ${esc(sp.name)}<br>おや：${esc(m.ot || G.save.name)}　${esc(m.metAt || '')}</div></div>
      <div>
        <div class="row"><b style="font-size:1.2em">${esc(monName(m))}</b><span class="lv" style="color:var(--acc);font-weight:800">Lv${m.lv}</span>${sp.types.map(typeBadge).join('')}</div>
        <div class="muted" style="font-size:.85em">次のレベルまで ${expToNext(m).toLocaleString()} EXP</div><div class="expbar"><i style="width:${expProgress(m) * 100}%"></i></div>
        <div class="card" style="margin:.5em 0;padding:.5em"><b>特殊能力：${esc(ab?.name || '')}</b><div class="muted">${esc(ab?.desc || '')}</div></div>
        <div class="card" style="padding:.5em">持ち物：<b>${m.item ? esc(ITEMS[m.item].name) : 'なし'}</b>${m.item ? `<div class="muted">${esc(ITEMS[m.item].desc)}</div>` : ''}</div>
        <h4 style="margin:.6em 0 .2em">能力</h4>${['hp', 'atk', 'def', 'spe'].map(statRow).join('')}
        <h4 style="margin:.6em 0 .2em">個体値 <span style="color:${ivr.c}">（${ivr.s}・合計${ivTotal(m)}/60）</span></h4>${['atk', 'def', 'hp', 'spe'].map(ivRow).join('')}
        <h4 style="margin:.6em 0 .2em">技</h4>${m.moves.map(x => { const mv = MOVES[x.id]; return `<div class="movechip" style="border-left-color:${TYPE_COLOR[mv.type]}"><span><b>${esc(mv.name)}</b> <span class="muted">${TYPE_JA[mv.type]}・${mv.power ? '威力' + mv.power : '変化'}${mv.acc ? '・命中' + mv.acc : ''}</span></span><span class="pp">PP ${x.pp}/${mv.pp}</span></div>`; }).join('')}
        <div class="row" style="margin-top:.7em" id="acts"></div>
      </div></div>`;
    const acts = s.body.querySelector('#acts');
    const btn = (t, fn, cls = '') => { const b = el('button', 'btn sm ' + cls, t); b.onclick = async () => { audio.sfx('select'); await fn(); render(); }; acts.appendChild(b); };
    const pi = G.save.party.indexOf(m), bi = G.save.box.indexOf(m);
    if (pi > 0) btn('先頭にする', () => { G.save.party.splice(pi, 1); G.save.party.unshift(m); toast('先頭にしました'); });
    if (pi >= 0) btn('ボックスへ預ける', () => {
      if (G.save.party.length <= 1) { toast('パーティーが 0匹に なってしまう！'); return; }
      G.save.party.splice(pi, 1); G.save.box.unshift(m); toast('ボックスに 預けました'); s.close();
    });
    if (bi >= 0) btn('パーティーに入れる', async () => {
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
    btn('ニックネーム', async () => { const nm = await inputText('ニックネーム（空欄で元の名前）', m.nick || sp.name, 10); if (nm !== null) m.nick = nm === sp.name ? '' : nm; });
    if (itemCount('scroll')) btn('巻物で技を覚える', () => scrollLearn(m));
    if (bi >= 0) btn(m.fav ? '★を外す' : '★お気に入り', () => { m.fav = !m.fav; });
    if (bi >= 0) btn('逃がす', async () => {
      if (m.uid === G.save.story.luluUid || m.uid === G.save.story.legendUid || SPECIES[m.sp].legend) { toast('この子は 逃がせない！'); return; }
      if (await confirmBox(`本当に ${monName(m)} を 逃がしますか？（もどせません）`)) { G.save.box.splice(G.save.box.indexOf(m), 1); toast(`${monName(m)} は 元気に 帰っていった……`); s.close(); }
    }, 'red');
    save();
  };
  render();
  await waitClose(s);
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
  const k = await ask('おもいだしの巻物：どの技を 覚えさせる？', [...cand.map(id => `${MOVES[id].name}（${TYPE_JA[MOVES[id].type]}・${MOVES[id].power || '変化'}）`), 'やめる']);
  if (k >= cand.length) return;
  useItem('scroll');
  await learnMove(m, cand[k]);
}

// ---------- ボックス（しぼりこみ付き） ----------
export async function openBox(opts = {}) {
  const s = openScreen('ボックス');
  const f = G.boxFilter ||= { q: '', type: '', sort: 'new', shiny: false, fav: false, iv: 0 };
  s.body.innerHTML = `<div class="filters">
    <input class="q" placeholder="名前で検索" value="${esc(f.q)}">
    <select class="type"><option value="">すべてのタイプ</option>${TYPES.map(t => `<option value="${t}" ${f.type === t ? 'selected' : ''}>${TYPE_JA[t]}</option>`).join('')}</select>
    <select class="sort">${[['new', '新しい順'], ['dex', '図鑑番号順'], ['lv', 'レベルが高い順'], ['iv', '個体値が高い順'], ['name', '名前順']].map(([v, n]) => `<option value="${v}" ${f.sort === v ? 'selected' : ''}>${n}</option>`).join('')}</select>
    <select class="iv">${[[0, '個体値：すべて'], [30, '個体値合計30以上'], [45, '個体値合計45以上'], [55, '個体値合計55以上']].map(([v, n]) => `<option value="${v}" ${+f.iv === v ? 'selected' : ''}>${n}</option>`).join('')}</select>
    <button class="tog shiny ${f.shiny ? 'on' : ''}">✨色違い</button><button class="tog fav ${f.fav ? 'on' : ''}">★お気に入り</button>
    <span class="muted cnt"></span></div><div class="boxgrid"></div>`;
  const grid = s.body.querySelector('.boxgrid');
  const render = () => {
    let list = G.save.box.slice();
    if (f.q) list = list.filter(m => monName(m).includes(f.q) || SPECIES[m.sp].name.includes(f.q));
    if (f.type) list = list.filter(m => SPECIES[m.sp].types.includes(f.type));
    if (f.shiny) list = list.filter(m => m.shiny);
    if (f.fav) list = list.filter(m => m.fav);
    if (+f.iv) list = list.filter(m => ivTotal(m) >= +f.iv);
    const cmp = { new: (a, b) => b.caughtAt - a.caughtAt, dex: (a, b) => a.sp - b.sp || b.lv - a.lv, lv: (a, b) => b.lv - a.lv, iv: (a, b) => ivTotal(b) - ivTotal(a), name: (a, b) => monName(a).localeCompare(monName(b), 'ja') }[f.sort];
    if (f.sort !== 'new') list.sort(cmp); else list.sort(cmp);
    s.body.querySelector('.cnt').textContent = `${list.length}匹 / 全${G.save.box.length}匹`;
    grid.innerHTML = '';
    if (!list.length) grid.innerHTML = '<p class="muted">アニモンが いません。</p>';
    for (const m of list) {
      const c = el('button', 'bcell', `<img src="${BLANK}"><div class="lv">Lv${m.lv}</div>${m.shiny ? '<span class="shiny-mark">✨</span>' : ''}${m.fav ? '<span class="fav">★</span>' : ''}`);
      c.title = monName(m);
      portraitAsync(m.sp, m.shiny, false, (u) => { c.querySelector('img').src = u; });
      c.onclick = async () => { audio.sfx('select'); await monDetail(m, 'box'); render(); };
      grid.appendChild(c);
    }
  };
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
export function pickFromAll(title, filterFn, multi = 0) {
  return new Promise(res => {
    const s = openScreen(title);
    const all = [...G.save.party, ...G.save.box].filter(filterFn || (() => true));
    const sel = [];
    s.body.innerHTML = `<div class="row" style="margin-bottom:.5em"><span class="muted grow">${multi ? `${multi}匹 選んでください（同じアニモンは1匹まで）` : '1匹 選んでください'}</span>${multi ? '<button class="btn pri ok">けってい</button>' : ''}</div><div class="boxgrid"></div>`;
    const grid = s.body.querySelector('.boxgrid');
    const okB = s.body.querySelector('.ok');
    const upd = () => { if (okB) { okB.disabled = sel.length !== multi; okB.textContent = `けってい（${sel.length}/${multi}）`; } };
    for (const m of all) {
      const c = el('button', 'bcell', `<img src="${BLANK}"><div class="lv">${esc(monName(m))} Lv${m.lv}</div>${m.shiny ? '<span class="shiny-mark">✨</span>' : ''}`);
      portraitAsync(m.sp, m.shiny, false, (u) => { c.querySelector('img').src = u; });
      c.onclick = async () => {
        if (!multi) { s.onClose = null; s.close(); res(m); return; }
        const i = sel.indexOf(m);
        if (i >= 0) { sel.splice(i, 1); c.style.borderColor = ''; }
        else {
          if (sel.length >= multi) return;
          if (sel.some(x => x.sp === m.sp)) { toast('同じアニモンは 1匹まで！'); return; }
          sel.push(m); c.style.borderColor = 'var(--acc)';
        }
        upd();
      };
      grid.appendChild(c);
    }
    upd();
    if (okB) okB.onclick = () => { s.onClose = null; s.close(); res(sel.slice()); };
    s.onClose = () => res(null);
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
    <h4 style="margin:.6em 0 .2em">種族値</h4>${['hp', 'atk', 'def', 'spe'].map(k => `<div class="statrow"><span>${STAT_JA[k]}</span><b>${base[k]}</b><div class="bar"><i style="width:${base[k] / 1.4}%"></i></div></div>`).join('')}
    <h4 style="margin:.6em 0 .2em">覚える技（8種類）</h4>${sp.moves.map(x => { const mv = MOVES[x.id]; return `<div class="movechip" style="border-left-color:${TYPE_COLOR[mv.type]}"><span><b>${esc(mv.name)}</b> <span class="muted">${TYPE_JA[mv.type]}・${mv.power ? '威力' + mv.power : '変化'}${mv.sig ? '・<span style="color:var(--acc)">特別技</span>' : ''}</span></span><span class="pp">Lv${x.lv}</span></div>`; }).join('')}
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
  const cats = { heal: ['heal', 'revive', 'status', 'pp', 'candy'], food: ['food'], held: ['held'], scroll: ['scroll'] };
  const tabJa = { heal: '回復', food: 'エサ', held: '持ち物', scroll: 'その他' };
  const render = () => {
    s.body.innerHTML = `<div class="tabs">${Object.keys(cats).map(k => `<button class="tab ${k === tab ? 'on' : ''}" data-k="${k}">${tabJa[k]}</button>`).join('')}</div><div class="list"></div>`;
    s.body.querySelectorAll('.tab').forEach(b => b.onclick = () => { tab = b.dataset.k; render(); });
    const list = s.body.querySelector('.list');
    const items = Object.values(ITEMS).filter(i => cats[tab].includes(i.cat) && itemCount(i.id) > 0);
    if (!items.length) list.innerHTML = '<p class="muted">何も 持っていない。</p>';
    for (const it of items) {
      const r = el('div', 'itemrow', `<div class="grow"><div class="nm">${esc(it.name)}</div><div class="ds">${esc(it.desc)}</div></div><div class="cnt">×${itemCount(it.id)}</div>`);
      if (['heal', 'revive', 'status', 'pp', 'candy', 'held', 'scroll'].includes(it.cat)) {
        const b = el('button', 'btn sm pri', it.cat === 'held' ? '持たせる' : '使う');
        b.onclick = async () => { audio.sfx('select'); await useOnMon(it); render(); };
        r.appendChild(b);
      }
      list.appendChild(r);
    }
  };
  render();
  await waitClose(s);
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
    if (r.evolve) await evolveScene(m);
    save(); return;
  }
  useItem(it.id); audio.sfx('heal'); toast(`${monName(m)} に ${it.name} を 使った！`); save();
}

// ---------- ショップ・病院 ----------
export function shopList() {
  const c = crests(), post = G.save.postGame;
  const L = ['food1', 'herb', 'cureall'];
  if (c >= 1) L.push('food2', 'goodherb', 'revive', 'ppdrop');
  if (c >= 2) L.push('scroll');
  if (c >= 3) L.push('food3', 'superherb', 'h_berry', 'h_clear');
  if (c >= 4) L.push('h_charm', 'h_bread');
  if (c >= 5) L.push('fullmed', 'ppspring', 'h_glass', 'h_belt');
  if (c >= 6) L.push('food4', 'h_spike', 'h_claw', 'h_vest');
  if (post) L.push('h_band', 'h_shoes', 'h_orb');
  return L;
}
const TOWN_BOOST = { start: ['b_normal'], forest: ['b_grass', 'b_bug'], lake: ['b_water', 'b_electric'], desert: ['b_ground', 'b_poison'], canyon: ['b_rock', 'b_fighting', 'b_steel'], snow: ['b_ice', 'b_flying'], swamp: ['b_ghost', 'b_dark', 'b_poison'], highland: ['b_fairy', 'b_psychic', 'b_flying'], volcano: ['b_fire', 'b_dragon'], sanctuary: ['b_dragon', 'b_psychic', 'b_dark', 'b_fairy'] };
export async function openShop(townId) {
  const s = openScreen('ショップ', { extra: `<b class="money" style="color:var(--acc)"></b>` });
  const list = [...shopList(), ...(crests() >= 3 ? (TOWN_BOOST[townId] || []) : [])];
  const render = () => {
    s.head.querySelector('.money').textContent = '所持金 ¥' + G.save.money.toLocaleString();
    s.body.innerHTML = '';
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
    if (crests() < 6) s.body.appendChild(el('p', 'muted', '※ 紋章を集めると、より レア度の高いエサや 道具が 買えるようになります。'));
  };
  render();
  await waitClose(s);
}
export function healAll() { healParty(); }
export async function openHospital(townId) {
  G.save.lastHospital = 't_' + townId;
  while (true) {
    const k = await ask('アニモン病院へ ようこそ！ ご用件は？', ['アニモンを 回復する（HP・技・状態）', '買い物をする', 'パーティーを 変更する', 'やめる'], '受付');
    if (k === 0) {
      await say(['受付|おあずかりします……']);
      await fade(true, 400); healParty(); audio.sfx('heal'); await new Promise(r => setTimeout(r, 500)); await fade(false, 400);
      await say(['受付|お待たせしました！ アニモンたちは 元気いっぱいです！', '受付|技の 使用回数も 全て 回復しましたよ。']);
      save();
    } else if (k === 1) await openShop(townId);
    else if (k === 2) await openBox();
    else break;
  }
  (await import('../game/overworld.js')).refreshFollower();
}

// ---------- ファストトラベル ----------
export async function openTravel(fromId) {
  const s = openScreen('ファストトラベル', { extra: '<span class="muted">登録した岩へ ワープ</span>' });
  const reg = STONES.filter(x => G.save.stones[x.id] && x.id !== fromId);
  if (!reg.length) s.body.innerHTML = '<p class="muted">ほかに 登録した岩が ありません。大陸の各地の 光る岩に さわって 登録しよう！</p>';
  let chosen = null;
  for (const st of reg) {
    const r = el('div', 'itemrow', `<div class="grow"><div class="nm">${st.town ? '🏥 ' : '💎 '}${esc(st.name)}</div><div class="ds">${st.town ? '病院のある町' : ''}</div></div>`);
    const b = el('button', 'btn sm pri', 'ワープ'); b.onclick = () => { chosen = st.id; s.close(); };
    r.appendChild(b); s.body.appendChild(r);
  }
  await waitClose(s);
  if (chosen) await (await import('../game/overworld.js')).warpTo(chosen);
}

// ---------- ライド ----------
export async function toggleRide() {
  const ov = await import('../game/overworld.js');
  if (ov.OW.player.rideM) { if (ov.stopRide()) toast('降りた'); return; }
  return openRide();
}
export async function openRide() {
  const ov = await import('../game/overworld.js');
  if (ov.OW.player.rideM) { if (ov.stopRide()) toast('降りた'); return; }
  const cands = G.save.party.filter(m => SPECIES[m.sp].ride);
  if (!cands.length) { await say(['|パーティーに 乗れる アニモンが いない……', '|（ポニカ・ドンガメ・チュピランサーなど、一部のアニモンに 乗れます）']); return; }
  const k = await ask('どの アニモンに 乗る？', [...cands.map(m => `${monName(m)}（${{ land: '陸を走る', swim: '水を泳ぐ', fly: '空を飛ぶ' }[SPECIES[m.sp].ride]}）`), 'やめる']);
  if (k >= cands.length) return;
  if (cands[k].hp <= 0) { toast('ひんしの アニモンには 乗れない！'); return; }
  ov.startRide(cands[k]);
}

// ---------- マップ ----------
let mapImg = null;
export async function openMap() {
  const s = openScreen('大陸マップ');
  s.body.style.display = 'flex'; s.body.style.flexDirection = 'column';
  s.body.innerHTML = `<div class="mapwrap"><canvas width="768" height="768"></canvas></div><div class="legend"><span>🏠 町</span><span><b style="color:#5ef">◆</b> 登録済みの岩</span><span><b style="color:#999">◆</b> 未登録の岩</span><span>⛩ ダンジョン</span><span><b style="color:#f44">▲</b> 現在地</span><span>🔒 まだ行けない地域</span></div>`;
  const cv = s.body.querySelector('canvas');
  const g = cv.getContext('2d');
  const W = G.world;
  const N = WORLD.n;
  if (!mapImg) {
    const im = g.createImageData(N, N);
    const cols = { start: [140, 200, 110], plains: [130, 200, 100], forest: [60, 140, 60], lake: [120, 190, 110], desert: [230, 205, 140], canyon: [200, 120, 80], snow: [235, 240, 250], swamp: [100, 115, 75], highland: [150, 210, 120], volcano: [90, 75, 75], sanctuary: [210, 200, 150], inner: [200, 185, 235], sea: [60, 120, 200] };
    const RID = ['start', 'plains', 'forest', 'lake', 'desert', 'canyon', 'snow', 'swamp', 'highland', 'volcano', 'sanctuary', 'inner', 'sea'];
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const k = j * N + i;
      const h = W.H[j * (N + 1) + i];
      let c = cols[RID[W.REG[k]]] || [0, 0, 0];
      if (h < -0.4) c = h < -5 ? [40, 90, 170] : [70, 140, 215];
      else { const sh = Math.max(0.7, Math.min(1.25, 0.85 + h / 60)); c = c.map(v => Math.min(255, v * sh)); if (W.ROAD[k]) c = [215, 190, 140]; }
      im.data.set([c[0], c[1], c[2], 255], k * 4);
    }
    const oc = document.createElement('canvas'); oc.width = N; oc.height = N; oc.getContext('2d').putImageData(im, 0, 0);
    mapImg = oc;
  }
  const toC = (x, z) => [(x + WORLD.half) / (WORLD.half * 2) * 768, (z + WORLD.half) / (WORLD.half * 2) * 768];
  const draw = () => {
    g.imageSmoothingEnabled = false;
    g.drawImage(mapImg, 0, 0, 768, 768);
    // 未解放の地域を暗く
    g.save();
    for (const id of RING) {
      if (isUnlocked(id)) continue;
      const a0 = (REGIONS[id].ang - 20) * Math.PI / 180, a1 = (REGIONS[id].ang + 20) * Math.PI / 180;
      g.beginPath(); const c = toC(0, 0); g.moveTo(c[0] + Math.cos(a0) * 105, c[1] + Math.sin(a0) * 105); g.arc(c[0], c[1], 380, a0, a1); g.arc(c[0], c[1], 105, a1, a0, true); g.closePath();
      g.fillStyle = 'rgba(10,10,30,.55)'; g.fill();
      const m = toC(Math.cos((a0 + a1) / 2) * 450, Math.sin((a0 + a1) / 2) * 450); g.font = '28px sans-serif'; g.textAlign = 'center'; g.fillText('🔒', m[0], m[1]);
    }
    if (!isUnlocked('sanctuary')) { const c = toC(0, 0); g.beginPath(); g.arc(c[0], c[1], 103, 0, Math.PI * 2); g.fillStyle = 'rgba(10,10,30,.55)'; g.fill(); g.font = '30px sans-serif'; g.textAlign = 'center'; g.fillText('🔒', c[0], c[1] + 10); }
    g.restore();
    g.font = 'bold 15px sans-serif'; g.textAlign = 'center';
    // 地域名
    for (const id of RING) { const a = REGIONS[id].ang * Math.PI / 180; const p = toC(Math.cos(a) * 560, Math.sin(a) * 560); g.fillStyle = 'rgba(0,0,0,.55)'; g.fillText(REGIONS[id].name, p[0] + 1, p[1] + 1); g.fillStyle = '#fff'; g.fillText(REGIONS[id].name, p[0], p[1]); }
    for (const t of TOWNS) { const p = toC(t.pos[0], t.pos[1]); g.font = '18px sans-serif'; g.fillText('🏠', p[0], p[1] + 6); g.font = 'bold 12px sans-serif'; g.fillStyle = '#000'; g.fillText(t.name, p[0] + 1, p[1] + 21); g.fillStyle = '#ffe680'; g.fillText(t.name, p[0], p[1] + 20); g.fillStyle = '#fff'; }
    for (const st of STONES) { if (st.town) continue; const p = toC(st.pos[0], st.pos[1]); g.fillStyle = G.save.stones[st.id] ? '#55eeff' : '#999'; g.font = 'bold 16px sans-serif'; g.fillText('◆', p[0], p[1] + 5); }
    for (const [id, d] of Object.entries(DUNGEONS)) { const p = toC(d.pos[0], d.pos[1]); g.font = '16px sans-serif'; g.fillText('⛩', p[0], p[1] + 5); }
    const P = ov.OW.player; const p = toC(P.x, P.z);
    g.save(); g.translate(p[0], p[1]); g.rotate(-P.ry + Math.PI); g.fillStyle = '#ff3344'; g.strokeStyle = '#fff'; g.lineWidth = 2; g.beginPath(); g.moveTo(0, -10); g.lineTo(7, 8); g.lineTo(-7, 8); g.closePath(); g.fill(); g.stroke(); g.restore();
  };
  const ov = await import('../game/overworld.js');
  draw();
  await waitClose(s);
}

// ---------- 設定 ----------
export async function openSettings(fromTitle) {
  const s = openScreen('設定');
  const st = G.settings;
  const render = () => {
    const row = (label, key, desc, opts = [['ON', true], ['OFF', false]]) => `<div class="itemrow"><div class="grow"><div class="nm">${label}</div><div class="ds">${desc}</div></div>${opts.map(([t, v]) => `<button class="tog ${st[key] === v ? 'on' : ''}" data-k="${key}" data-v='${JSON.stringify(v)}'>${t}</button>`).join('')}</div>`;
    s.body.innerHTML = row('BGM', 'bgm', 'ゲームの音楽。他のアプリで流している音楽と一緒に聞くこともできます。') +
      row('効果音', 'sfx', 'ボタンやバトルの効果音。') +
      row('軽量モード', 'light', '描画を軽くして、古いスマホでも動きやすくします（切り替え後に再読み込み）。') +
      row('ムービーを自動スキップ', 'autoSkip', 'ストーリーの会話・ムービーを自動で飛ばします（会話中の「スキップ」ボタンでも飛ばせます）。') +
      row('文字の速さ', 'textSpeed', 'メッセージを表示する速さ。', [['おそい', 0], ['ふつう', 1], ['はやい', 2]]) +
      `<div class="itemrow"><div class="grow"><div class="nm">操作方法</div><div class="ds">PC：移動 WASD/矢印　決定・話す Space/Enter　ダッシュ Shift　メニュー Esc　マップ M　ライド R　ズーム マウスホイール<br>スマホ：左のスティックで移動、A で決定、B でダッシュ切替、2本指でズーム</div></div></div>` +
      (fromTitle ? `<div class="itemrow"><div class="grow"><div class="nm" style="color:var(--ng)">セーブデータを消す</div><div class="ds">この端末のセーブデータを削除します。元に戻せません。</div></div><button class="btn sm red del">削除</button></div>` : '') +
      `<p class="muted">アニマルモンスター ver 1.0</p>`;
    s.body.querySelectorAll('.tog').forEach(b => b.onclick = () => {
      const k = b.dataset.k, v = JSON.parse(b.dataset.v);
      const before = st[k];
      st[k] = v; saveSettings(st); audio.configure(st.bgm, st.sfx);
      if (k === 'bgm' && v) audio.unlock();
      if (k === 'light' && before !== v) toast('再読み込み後に 反映されます');
      audio.sfx('select'); render();
    });
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
    s.body.innerHTML = '<div class="pickrow"></div><p style="text-align:center;color:var(--acc);font-weight:800">⚠ 選べるのは 1匹だけ。選んだあとは 変更できません。</p>';
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
