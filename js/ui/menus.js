// =============================================================
//  メニュー画面いろいろ
// =============================================================
import { SPECIES, DEX_COUNT, REGION_JA, RARITY_JA, RARITY_COL, rarityStars } from '../data/species.js';
import { MOVES, moveEffects, moveEffectText } from '../data/moves.js';
import { ITEMS, CAT_JA, SHOP_FOODS, FOOD_STARS } from '../data/items.js';
import { ABILITIES } from '../data/abilities.js';
import { TYPES, TYPE_JA, TYPE_COLOR, typeBadge } from '../data/types.js';
import { TOWNS, STONES, DUNGEONS, REGIONS, RING, howToGet, hiddenInDex, WORLD, START_POS } from '../data/world.js';
import { CREST_JA } from '../data/story.js';
import { G, PARTY_MAX, partyHasSpecies, itemCount, addItem, useItem, addMoney, save, healParty, crests, isUnlocked, dexCounts, findMon } from '../game/state.js';
import { calcStats, adjBase, ivMul, monName, ivTotal, ivRank, expProgress, expToNext, healMon, maxHp, addExp, expForLevel } from '../game/mon.js';
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
        <div class="mstats"><span>📖 図鑑 <b>${c.caught}</b>/${DEX_COUNT}</span><span>👀 見つけた <b>${c.seen}</b></span><span>🏅 紋章 <b>${crests()}</b>/8</span>${G.save.postGame ? '<span class="clear">★クリア済み（経験値2倍）</span>' : ''}</div>
        <div class="mcrests">${CREST_JA.map((n, i) => `<span title="${n}" class="${i < crests() ? 'on' : ''}">${['🌳', '💧', '🏜️', '⛰️', '❄️', '🌫️', '☁️', '🌋'][i]}</span>`).join('')}</div>
        ${goal ? `<div class="mgoal"><b>⭐ 次の目的</b><span>${esc(goal)}</span></div>` : ''}
      </div>
      <div class="mparty">${party}</div>
    </div>
    <div class="mtiles"></div>`;
    const grid = s.body.querySelector('.mtiles');
    const items = [
      ['🐾', 'パーティー', `${G.save.party.length}/${PARTY_MAX}匹`, '#ff8a5c', () => openParty()],
      ['📦', 'ボックス', `${G.save.box.length}匹`, '#c08a4a', () => openBox()],
      ['📖', '図鑑', `${c.caught}/${DEX_COUNT}`, '#e05a7a', () => openDex()],
      ['🎒', 'バッグ', `${bagN}こ`, '#f0a830', () => openBag()],
      ['📜', 'ストーリー', SE.currentStep().ch <= 11 ? `第${SE.currentStep().ch}章・サイド` : 'クリア後・サイド', '#d98c3a', () => openJournal()],
      ['🗺️', 'マップ', '行き先を見る', '#3cb371', () => openMap()],
      ['🐎', 'ライド', '乗って移動', '#8a6adf', () => openRide()],
      ['🧺', 'おつかい', `${ER_active()}/${5}件 引き受け中`, '#ff7aa8', () => openErrands()],
      ['🤝', 'フレンド', '交換・対戦', '#36a9e1', async () => (await import('./onlineUI.js')).openFriends()],
      ['🏆', 'ランキング', '図鑑の数で勝負', '#e6b422', async () => (await import('./onlineUI.js')).openRanking()],
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
    const chips = Object.entries(SE.CHAPTERS).map(([n, nm]) => { n = +n; const st = n < si.ch || si.end ? 'done' : n === si.ch ? 'now' : 'lock'; return `<span class="chchip ${st}" title="${esc(nm)}">${st === 'done' ? '✔' : st === 'now' ? '▶' : '🔒'} ${n}章</span>`; }).join('');
    const qs = SE.QUESTS.map(q => ({ q, i: SE.questInfo(q) }));
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
        <div class="jch">${si.end ? 'ストーリー クリア！' : `第${si.ch}章「${esc(si.chName)}」`}</div>
        <div class="jobj"><b>目的</b>${fm(si.obj)}</div>
        ${si.dest ? `<div class="jdest"><b>目的地</b>${esc(si.dest)}${si.dist != null ? `<span class="muted">（ここから ${si.dist}m）</span>` : ''}</div>` : ''}
        <div class="row" style="gap:.5em;margin-top:.5em">${si.pos ? '<button class="btn sm pri smap">🗺️ 地図で 目的地を 見る</button>' : ''}</div>
        <div class="chchips">${chips}</div>
        <div class="crownrow"><span class="${G.save.crowns?.s ? 'got' : ''}">👑 銀の王冠：第6章クリア（4つ目の紋章）${G.save.crowns?.s ? ' ✔' : ''}</span><span class="g ${G.save.crowns?.g ? 'got' : ''}">👑 金の王冠：ストーリー クリア${G.save.crowns?.g ? ' ✔' : ''}</span></div>
      </div>
      <h4 style="margin:.8em 0 .3em">サイドストーリー <span class="muted" style="font-size:.8em;font-weight:400">クリア ${qs.filter(x => x.i.state === 'done').length}/${qs.length}</span></h4>
      ${qs.map(qrow).join('')}
      <h4 style="margin:.8em 0 .3em">おつかい <span class="muted" style="font-size:.8em;font-weight:400">${act.length}件 引き受け中・完了 ${G.save.errandsDone || 0}回</span></h4>
      ${act.map(e => { const pr = ERM.reqProgress(e.g, e.s, e.req); return `<div class="qrow"><div class="grow"><div class="nm">${esc(ERM.reqSummary(e.req))}</div><div class="ds">${esc(ERM.TOWN_NAME[e.g.town])}の ${esc(e.g.name)}　${pr.ok ? '✅ 報告できる' : esc(pr.txt)}</div></div></div>`; }).join('') || '<p class="muted">町の 人の 頭の上に 🧺 が 出ていたら 話しかけてみよう。</p>'}
      <div class="row" style="margin-top:.4em"><button class="btn sm errs">🧺 おつかいの 画面を 開く</button></div>`;
    const sm = s.body.querySelector('.smap');
    if (sm) sm.onclick = () => openMap({ x: si.pos[0], z: si.pos[1], label: si.dest, obj: si.obj, title: 'ストーリーの 目的地' });
    s.body.querySelectorAll('.qmap').forEach(b => b.onclick = () => { const { q, i } = qs[+b.dataset.k]; openMap({ x: i.pos[0], z: i.pos[1], label: q.name, obj: `${q.name}：${i.obj}`, title: 'サイドストーリー' }); });
    s.body.querySelector('.errs').onclick = async () => { await openErrands(); if (!s.closed) render(); };
  };
  render();
  await waitClose(s);
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
      <div class="muted" style="text-align:center;font-size:.8em">No.${String(sp.id).padStart(3, '0')} ${esc(sp.name)}<br>おや：${esc(m.ot || G.save.name)}　${esc(m.metAt || '')}</div></div>
      <div>
        <div class="row"><b style="font-size:1.2em">${esc(monName(m))}</b><span class="lv" style="color:var(--acc);font-weight:800">Lv${m.lv}</span>${sp.types.map(typeBadge).join('')}</div>
        <div class="muted" style="font-size:.85em">次のレベルまで ${expToNext(m).toLocaleString()} EXP</div><div class="expbar"><i style="width:${expProgress(m) * 100}%"></i></div>
        <div class="card" style="margin:.5em 0;padding:.5em"><b>特殊能力：${esc(ab?.name || '')}</b><div class="muted">${esc(ab?.desc || '')}</div></div>
        <div class="card" style="padding:.5em">持ち物：<b>${m.item ? esc(ITEMS[m.item].name) : 'なし'}</b>${m.item ? `<div class="muted">${esc(ITEMS[m.item].desc)}</div>` : ''}</div>
        <h4 style="margin:.6em 0 .2em">能力 <span class="muted" style="font-size:.78em;font-weight:400">個体値 <b style="color:${ivr.c}">${ivr.s}・合計${ivTotal(m)}/60</b></span></h4>
        <div class="sttable"><div class="sttr hd"><span class="k"></span><span class="b">種族値</span><span class="iv">個体値</span><span class="a">調整後</span><span class="v">Lv${m.lv}</span><span class="bar"></span></div>${['hp', 'atk', 'def', 'spe'].map(statRow).join('')}
        <div class="stnote">個体値 7.5 が基準。15 なら 種族値 +9%、1 なら −7.8%（1ごとに 1.2%）</div></div>
        <h4 style="margin:.6em 0 .2em">技</h4>${m.moves.map(x => { const mv = MOVES[x.id]; return `<div class="movechip" style="border-left-color:${TYPE_COLOR[mv.type]}"><span><b>${esc(mv.name)}</b> <span class="muted">${TYPE_JA[mv.type]}・${mv.power ? '威力' + mv.power : '変化'}${mv.acc ? '・命中' + mv.acc : ''}</span><span class="mvdesc">${esc(mv.desc)}${moveEffects(mv).length ? `<em>${esc(moveEffectText(mv))}</em>` : ''}</span></span><span class="pp">PP ${x.pp}/${mv.pp}</span></div>`; }).join('')}
        <div class="row" style="margin-top:.7em" id="acts"></div>
      </div></div>`;
    const acts = s.body.querySelector('#acts');
    if (opts.readOnly) return;   // トレード相手の アニモンなど：見るだけ
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
  const k = await ask('おもいだしの巻物：どの技を 覚えさせる？', [...cand.map(id => `${MOVES[id].name}（${TYPE_JA[MOVES[id].type]}・${MOVES[id].power ? '威力' + MOVES[id].power : '変化'}${moveEffects(MOVES[id]).length ? '・' + moveEffectText(MOVES[id]) : ''}）`), 'やめる']);
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
    if (!all.length) grid.outerHTML = '<p class="muted" style="margin:1em 0">えらべる アニモンが いません。（伝説・ルル・パーティーに 1匹だけの子は 出せません）</p>';
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
  const cats = { heal: ['heal', 'revive', 'status', 'pp', 'candy'], food: ['food'], held: ['held'], mat: ['mat'], scroll: ['crown', 'scroll'] };
  const tabJa = { heal: '回復', food: 'エサ', held: '持ち物', mat: '素材', scroll: 'その他' };
  const render = () => {
    s.body.innerHTML = `<div class="tabs">${Object.keys(cats).map(k => `<button class="tab ${k === tab ? 'on' : ''}" data-k="${k}">${tabJa[k]}</button>`).join('')}</div><div class="list"></div>`;
    s.body.querySelectorAll('.tab').forEach(b => b.onclick = () => { tab = b.dataset.k; render(); });
    const list = s.body.querySelector('.list');
    const items = Object.values(ITEMS).filter(i => cats[tab].includes(i.cat) && itemCount(i.id) > 0);
    if (!items.length) list.innerHTML = '<p class="muted">何も 持っていない。</p>';
    for (const it of items) {
      const r = el('div', 'itemrow' + (it.cat === 'crown' ? ' crown ' + it.id : ''), `<div class="grow"><div class="nm">${it.icon && (it.cat === 'mat' || it.cat === 'crown') ? `<span class="ic">${it.icon}</span> ` : ''}${esc(it.name)}</div><div class="ds">${esc(it.desc)}</div></div><div class="cnt">×${itemCount(it.id)}</div>`);
      if (['heal', 'revive', 'status', 'pp', 'candy', 'held', 'scroll', 'crown'].includes(it.cat)) {
        const b = el('button', 'btn sm pri', it.cat === 'held' ? '持たせる' : '使う');
        b.onclick = async () => { audio.sfx('select'); await (it.cat === 'crown' ? useCrown(it) : useOnMon(it)); render(); };
        r.appendChild(b);
      }
      list.appendChild(r);
    }
  };
  render();
  await waitClose(s);
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
    if (r.evolve) await evolveScene(m);
    save(); return;
  }
  useItem(it.id); audio.sfx('heal'); toast(`${monName(m)} に ${it.name} を 使った！`); save();
}

// ---------- ショップ・病院 ----------
export function shopList() {
  const c = crests(), post = G.save.postGame;
  const L = ['herb', 'cureall'];
  if (c >= 1) L.push('goodherb', 'revive', 'ppdrop');
  if (c >= 2) L.push('scroll');
  if (c >= 3) L.push('superherb', 'h_berry', 'h_clear');
  if (c >= 4) L.push('h_charm', 'h_bread');
  if (c >= 5) L.push('fullmed', 'ppspring', 'h_glass', 'h_belt');
  if (c >= 6) L.push('h_spike', 'h_claw', 'h_vest');
  if (post) L.push('h_band', 'h_shoes', 'h_orb');
  return L;
}
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
    if (crests() < 6) s.body.appendChild(el('p', 'muted', '※ 紋章を集めると、より レア度の高いエサや 道具が 買えるようになります。'));
  };
  render();
  for (const id of fresh) seen.push(id);
  save();
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

// ---------- マップ（全体）：画面に合わせて表示・ドラッグで移動・ピンチ／ホイール／ボタンで拡大 ----------
export async function openMap(focus = null) {
  const ov = await import('../game/overworld.js');
  const SE = await import('../game/storyEngine.js');
  const { getMapImage, worldToImg } = await import('./mapimage.js');
  const s = openScreen('大陸マップ', { cls: 'mapscreen' });
  // focus：ストーリー一覧の「地図で見る」から来たときの 行き先 { x, z, label, obj }
  const tgt = focus || SE.navTarget();
  s.body.innerHTML = `<div class="mapview"><canvas></canvas>
      <div class="mapbtns"><button class="btn sm zin">＋</button><button class="btn sm zout">－</button><button class="btn sm here">📍現在地</button>${tgt ? '<button class="btn sm pri goal">⭐行き先</button>' : ''}<button class="btn sm all">全体</button></div></div>
    <div class="mapside">
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
    for (const st of STONES) { if (st.town) continue; const p = toSw(st.pos[0], st.pos[1]); text('◆', p[0], p[1], Math.max(12, 16 * us), G.save.stones[st.id] ? '#55eeff' : '#aaa'); }
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
  const up = (e) => { pts.delete(e.pointerId); if (pts.size < 2) pinch = null; };
  cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
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
}
const UI_fmt = (t) => t.replace(/\{P\}/g, G.save.name);

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
