// =============================================================
//  追加の画面いろいろ
//   ・お知らせ（Firebase の announcements に 書いた 文章を、アプリを 開いたときに 1回だけ 表示／一覧ボタン）
//   ・ボタンの 配置・大きさ（スティック・A・B・ライド）
//   ・データ連携コードの 発行（はじめて 遊ぶときは 必須）
//   ・アカウント削除（ランキングからも 消える）
// =============================================================
import { G, save } from '../game/state.js';
import { saveSettings, deleteGame, loadGame, hasSave } from '../game/save.js';
import { firebaseConfig, firebaseReady } from '../firebase-config.js';
import { $, el, esc, openScreen, toast, confirmBox, say } from './ui.js';
import { audio } from '../audio.js';

const waitClose = (s) => new Promise(r => { s.onClose = r; });

// ---------------------------------------------------------------
//  お知らせ
//   Realtime Database の announcements/{キー} に { title, body, date, at } を 書くと 表示される。
//   ・まだ 見ていない キーの お知らせは、アプリを 開いたとき（タイトル画面）に 1回だけ 出る
//   ・見たかどうかは この端末に 記録（2回目からは 出ない）。📢 お知らせ ボタンで いつでも 全部 見られる
//   ・新しい お知らせは「新しい キー」で 追加する（同じ キーの 文章を 書きかえても もう一度は 出ない）
// ---------------------------------------------------------------
const NEWS_SEEN = 'animon_news_seen_v1';
let newsCache = null, newsAt = 0;
function seenSet() { try { return new Set(JSON.parse(localStorage.getItem(NEWS_SEEN) || '[]')); } catch (e) { return new Set(); } }
function markSeen(ids) { const s = seenSet(); for (const id of ids) s.add(id); try { localStorage.setItem(NEWS_SEEN, JSON.stringify([...s])); } catch (e) { /* */ } }
const newsTime = (n) => +n.at || Date.parse(String(n.date || '').replace(/\./g, '/')) || 0;
export async function fetchNews(force = false) {
  if (!firebaseReady()) return [];
  if (newsCache && !force && Date.now() - newsAt < 60000) return newsCache;
  const url = firebaseConfig.databaseURL.replace(/\/$/, '') + '/announcements.json';
  const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const to = setTimeout(() => ctl && ctl.abort(), 7000);
  try {
    const r = await fetch(url, { cache: 'no-store', signal: ctl ? ctl.signal : undefined });
    if (!r.ok) return newsCache || [];
    const obj = await r.json() || {};
    const list = Object.entries(obj).filter(([, v]) => v && typeof v === 'object' && !v.hidden && (v.title || v.body))
      .map(([id, v]) => ({ id, title: String(v.title || 'お知らせ'), body: String(v.body || ''), date: String(v.date || ''), at: newsTime(v) }));
    list.sort((a, b) => (b.at - a.at) || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0));
    newsCache = list; newsAt = Date.now();
    return list;
  } catch (e) { return newsCache || []; } finally { clearTimeout(to); }
}
export async function unseenNewsCount() { const L = await fetchNews(); const s = seenSet(); return L.filter(n => !s.has(n.id)).length; }
const fmtDate = (n) => n.date || (n.at ? new Date(n.at).toLocaleDateString('ja-JP') : '');
function newsHtml(list, seen) {
  if (!list.length) return '<p class="muted" style="text-align:center;margin:2em 0">お知らせは まだ ありません。</p>';
  return list.map(n => `<div class="newsitem${seen.has(n.id) ? '' : ' new'}"><div class="nh">${seen.has(n.id) ? '' : '<span class="newtag">NEW</span>'}<b>${esc(n.title)}</b><span class="muted nd">${esc(fmtDate(n))}</span></div><div class="nb">${esc(n.body).replace(/\n/g, '<br>')}</div></div>`).join('');
}
// アプリを 開いたときに 1回だけ（まだ 見ていない お知らせが あるときだけ）
export async function showNewNewsOnce() {
  try { if (sessionStorage.getItem('animon_news_shown')) return; sessionStorage.setItem('animon_news_shown', '1'); } catch (e) { /* */ }
  const L = await fetchNews(true);
  const seen = seenSet();
  const fresh = L.filter(n => !seen.has(n.id));
  if (!fresh.length) return;
  const s = openScreen('📢 お知らせ', { cls: 'newsscr' });
  s.body.innerHTML = `<div class="newslist">${newsHtml(fresh, seen)}</div><div class="row" style="justify-content:center;margin-top:.8em"><button class="btn pri ok">とじる</button></div><p class="muted" style="text-align:center;font-size:.8em">これまでの お知らせは 📢 お知らせ ボタンで いつでも 見られます</p>`;
  s.body.querySelector('.ok').onclick = () => { audio.sfx('select'); s.close(); };
  markSeen(fresh.map(n => n.id));
  await waitClose(s);
  refreshNewsBadges();
}
// すべての お知らせ（📢 ボタン）
export async function openNewsList() {
  const s = openScreen('📢 お知らせ', { cls: 'newsscr' });
  s.body.innerHTML = '<p class="muted">読み込み中……</p>';
  const L = await fetchNews(true);
  const seen = seenSet();
  if (!firebaseReady()) s.body.innerHTML = '<p class="muted">オンライン機能が 使えないため、お知らせを 読み込めません。</p>';
  else s.body.innerHTML = `<div class="newslist">${newsHtml(L, seen)}</div>`;
  markSeen(L.map(n => n.id));
  await waitClose(s);
  refreshNewsBadges();
}
export async function refreshNewsBadges() {
  const n = await unseenNewsCount().catch(() => 0);
  document.querySelectorAll('[data-newsbadge]').forEach(b => { b.textContent = n ? String(n) : ''; b.style.display = n ? '' : 'none'; });
}

// ---------------------------------------------------------------
//  ボタンの 配置・大きさ（スマホ・タブレットの スティック・A・B・ライド）
//   G.settings.touchLayout = { stick:{x,y,s}, tA:{…}, tB:{…}, tRide:{…} }
//   x・y は 画面の 横・縦に 対する 中心の 位置（0〜1）、s は 大きさの 倍率（0.5〜2）
// ---------------------------------------------------------------
export const TOUCH_CTRL = [['stick', 'スティック'], ['tA', 'A ボタン'], ['tB', 'B（ダッシュ）'], ['tRide', 'ライド']];
function uiSize() { const u = $('#ui'); const r = u.getBoundingClientRect(); return { W: r.width || innerWidth, H: r.height || innerHeight }; }
function baseSize(id, H) { const vh = H / 100; return id === 'stick' ? Math.min(34 * vh, 180) : id === 'tRide' ? Math.min(11 * vh, 60) : Math.min(15 * vh, 80); }
// いまの（ふつうの）配置を 割合で
export function defaultLayout() {
  const { W, H } = uiSize(), vw = W / 100, vh = H / 100;
  const st = baseSize('stick', H), a = baseSize('tA', H), r = baseSize('tRide', H);
  const bw = Math.min(40 * vh, 210), bh = Math.min(34 * vh, 180);
  const right = W - 4 * vw, bottom = H - 6 * vh;
  const L = {
    stick: { x: 4 * vw + st / 2, y: bottom - st / 2 },
    tA: { x: right - a / 2, y: bottom - bh + a / 2 },
    tB: { x: right - 0.42 * bw - a / 2, y: bottom - a / 2 },
    tRide: { x: right - bw + r / 2, y: bottom - bh + r / 2 },
  };
  for (const k in L) L[k] = { x: L[k].x / W, y: L[k].y / H, s: 1 };
  return L;
}
export function applyTouchLayout() {
  const L = G.settings && G.settings.touchLayout;
  const tb = $('#tbtns'); if (!tb) return;
  const ids = TOUCH_CTRL.map(c => c[0]);
  if (!L || !ids.some(k => L[k])) {
    tb.removeAttribute('style'); tb.classList.remove('cust');
    for (const id of ids) { const e = document.getElementById(id); if (e) { e.removeAttribute('style'); e.classList.remove('cust'); } }
    return;
  }
  const { H } = uiSize();
  const D = defaultLayout();
  tb.classList.add('cust');
  tb.style.cssText = 'left:0;top:0;right:0;bottom:0;width:auto;height:auto;pointer-events:none;';
  for (const id of ids) {
    const e = document.getElementById(id); if (!e) continue;
    const c = L[id] || D[id];
    const sz = baseSize(id, H) * Math.max(0.5, Math.min(2, c.s || 1));
    e.classList.add('cust');
    e.style.cssText = `position:absolute;left:calc(${(c.x * 100).toFixed(2)}% - ${(sz / 2).toFixed(1)}px);top:calc(${(c.y * 100).toFixed(2)}% - ${(sz / 2).toFixed(1)}px);right:auto;bottom:auto;width:${sz.toFixed(1)}px;height:${sz.toFixed(1)}px;--ts:${(c.s || 1).toFixed(2)};pointer-events:auto;`;
  }
}
let layoutHooked = false;
export function hookTouchLayout() {
  if (layoutHooked) return; layoutHooked = true;
  const re = () => applyTouchLayout();
  window.addEventListener('resize', re);
  window.addEventListener('orientationchange', () => { for (const ms of [100, 400, 1000]) setTimeout(re, ms); });
  applyTouchLayout();
}
// 配置の 編集画面：さわって 動かす・大きさは スライダー
export function openTouchEditor() {
  return new Promise(res => {
    const cur = G.settings.touchLayout && Object.keys(G.settings.touchLayout).length ? JSON.parse(JSON.stringify(G.settings.touchLayout)) : defaultLayout();
    const D = defaultLayout();
    for (const [id] of TOUCH_CTRL) if (!cur[id]) cur[id] = D[id];
    const ov = el('div', ''); ov.id = 'touchEdit';
    ov.innerHTML = `<div class="tehint">ボタンを <b>ドラッグ</b>して 好きな 位置へ。押して 選んだ ボタンの 大きさは 下の スライダーで 変えられます。</div>
      <div class="teprev"></div>
      <div class="tepanel"><div class="tesel"><b class="nm"></b> の 大きさ <b class="pct"></b></div>
        <input type="range" class="tesize" min="0.5" max="2" step="0.05">
        <div class="row tebtns"><button class="btn sm reset">ふつうに もどす</button><button class="btn sm cancel">やめる</button><button class="btn sm pri ok">保存する</button></div></div>`;
    $('#ui').appendChild(ov);
    const prev = ov.querySelector('.teprev');
    let sel = 'tA';
    const nodes = {};
    const { H } = uiSize();
    const draw = () => {
      for (const [id, nm] of TOUCH_CTRL) {
        const c = cur[id], sz = baseSize(id, H) * c.s;
        let n = nodes[id];
        if (!n) { n = el('div', 'tectl ' + id, `<span>${id === 'stick' ? '🕹️' : id === 'tA' ? 'A' : id === 'tB' ? 'B' : 'ライド'}</span><small>${esc(nm)}</small>`); prev.appendChild(n); nodes[id] = n; bindDrag(n, id); }
        n.style.left = `calc(${(c.x * 100).toFixed(2)}% - ${sz / 2}px)`; n.style.top = `calc(${(c.y * 100).toFixed(2)}% - ${sz / 2}px)`;
        n.style.width = n.style.height = sz + 'px';
        n.classList.toggle('sel', id === sel);
      }
      const nm = TOUCH_CTRL.find(c => c[0] === sel)[1];
      ov.querySelector('.tesel .nm').textContent = nm;
      ov.querySelector('.tesel .pct').textContent = Math.round(cur[sel].s * 100) + '%';
      ov.querySelector('.tesize').value = cur[sel].s;
    };
    function bindDrag(n, id) {
      let d = null;
      n.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); sel = id; const r = prev.getBoundingClientRect(); d = { id: e.pointerId, r }; try { n.setPointerCapture(e.pointerId); } catch (er) { /* */ } draw(); });
      n.addEventListener('pointermove', (e) => {
        if (!d || e.pointerId !== d.id) return;
        const x = (e.clientX - d.r.left) / d.r.width, y = (e.clientY - d.r.top) / d.r.height;
        cur[id].x = Math.max(0.03, Math.min(0.97, x)); cur[id].y = Math.max(0.05, Math.min(0.97, y)); draw();
      });
      const up = () => { d = null; };
      n.addEventListener('pointerup', up); n.addEventListener('pointercancel', up); n.addEventListener('lostpointercapture', up);
    }
    const sz = ov.querySelector('.tesize');
    sz.oninput = () => { cur[sel].s = Math.round(+sz.value * 100) / 100; draw(); };
    sz.onkeydown = (e) => e.stopPropagation();
    const close = (v) => { ov.remove(); res(v); };
    ov.querySelector('.reset').onclick = () => { audio.sfx('select'); const d0 = defaultLayout(); for (const [id] of TOUCH_CTRL) cur[id] = d0[id]; draw(); toast('ふつうの 配置に もどしました（保存すると 反映）'); };
    ov.querySelector('.cancel').onclick = () => { audio.sfx('cancel'); close(false); };
    ov.querySelector('.ok').onclick = () => {
      audio.sfx('select');
      const d0 = defaultLayout();
      const same = TOUCH_CTRL.every(([id]) => Math.abs(cur[id].x - d0[id].x) < 0.005 && Math.abs(cur[id].y - d0[id].y) < 0.005 && Math.abs(cur[id].s - 1) < 0.01);
      G.settings.touchLayout = same ? null : cur;
      saveSettings(G.settings); applyTouchLayout();
      toast('ボタンの 配置を 保存しました'); close(true);
    };
    draw();
  });
}

// ---------------------------------------------------------------
//  データ連携コード（はじめて 遊ぶときは 必須）
//   ① コードを 発行 → ② コードを 保存（コピー・メモ）→ ③ 同期ボタンを 押す
//   どれかが 終わっていないと「冒険を はじめる」が 押せない。つながらない ときは 次に 開いたとき もう一度。
// ---------------------------------------------------------------
export async function linkOnboarding() {
  const S = G.save; if (!S) return;
  const ON = await import('../online.js');
  if (!ON.isConfigured()) { S.needLink = false; return; }
  const s = openScreen('データ連携コードの 発行（はじめに 1回）', { noClose: true, cls: 'linkob' });
  let code = S.transferCode || '', saved = false, synced = false, fails = 0, note = '', noteNg = false;
  const render = () => {
    s.body.innerHTML = `<div class="card obhead"><b>🔑 なくさないための 大切な 準備です</b><p class="muted" style="margin:.3em 0 0">「連携コード」が あれば、スマホを 変えたときや アプリを 消してしまったときも、ほかの 端末で 同じ データの 続きが 遊べます。<br>次の 3つを 順番に 終わらせてください。</p></div>
      <div class="obstep ${code ? 'done' : 'now'}"><div class="no">1</div><div class="grow"><b>連携コードを 発行する</b>
        ${code ? `<div class="obcode">${esc(code)}</div>` : '<p class="muted">ボタンを 押すと あなた専用の コードが 作られます。</p>'}</div>
        ${code ? '<span class="ok">✔</span>' : '<button class="btn pri issue">発行する</button>'}</div>
      <div class="obstep ${!code ? 'lock' : saved ? 'done' : 'now'}"><div class="no">2</div><div class="grow"><b>コードを 保存する</b>
        <p class="muted">コピーして メモアプリに 貼る・スクリーンショットを とる・紙に 書く など。<b style="color:var(--ng)">ほかの人には 教えないでください。</b></p>
        ${code ? `<div class="row"><button class="btn sm copy">📋 コピーする</button><label class="obchk"><input type="checkbox" class="chk" ${saved ? 'checked' : ''}> コードを 保存しました</label></div>` : ''}</div>
        ${saved ? '<span class="ok">✔</span>' : ''}</div>
      <div class="obstep ${!saved ? 'lock' : synced ? 'done' : 'now'}"><div class="no">3</div><div class="grow"><b>同期ボタンを 押す</b><p class="muted">今の データを クラウドに 保存します。</p></div>
        ${synced ? '<span class="ok">✔</span>' : `<button class="btn pri sync" ${saved ? '' : 'disabled'}>🔄 同期する</button>`}</div>
      <div class="obmsg" style="${noteNg ? 'color:var(--ng)' : ''}">${esc(note)}</div>
      <div class="row" style="justify-content:center;margin-top:.6em"><button class="btn pri go" ${synced ? '' : 'disabled'}>✨ 冒険を はじめる</button>${fails >= 2 && !synced ? '<button class="btn sm later">つながらないので あとで（次に 開いたとき もう一度）</button>' : ''}</div>`;
    const msg = (t, ng) => { note = t; noteNg = !!ng; const m = s.body.querySelector('.obmsg'); if (m) { m.textContent = t; m.style.color = ng ? 'var(--ng)' : ''; } };
    const iss = s.body.querySelector('.issue');
    if (iss) iss.onclick = async () => {
      iss.disabled = true; msg('発行中……');
      try { code = await ON.issueTransferCode(); audio.sfx('item'); note = ''; render(); }
      catch (e) { fails++; msg('サーバーに つながりませんでした。電波の よい 場所で もう一度 押してください。（' + (e.message || e) + '）', true); iss.disabled = false; render(); }
    };
    const cp = s.body.querySelector('.copy');
    if (cp) cp.onclick = () => { try { navigator.clipboard?.writeText(code).then(() => toast('📋 コピーしました。メモアプリなどに 貼って 保存してね'), () => toast('コピーできませんでした。画面の コードを 書き写してください')); } catch (e) { toast('コピーできませんでした。画面の コードを 書き写してください'); } };
    const ck = s.body.querySelector('.chk');
    if (ck) ck.onchange = () => { saved = ck.checked; if (saved) { S.transferSavedAt = Date.now(); save(); } render(); };
    const sy = s.body.querySelector('.sync');
    if (sy) sy.onclick = async () => {
      sy.disabled = true; msg('同期中……');
      try {
        save();
        let ok = await ON.pushSave(true);
        if (!ok) { const r = await ON.checkCloud(); ok = r.status === 'same' || r.status === 'pushed'; }
        if (!ok) throw new Error('同期できませんでした');
        synced = true; audio.sfx('lvup'); note = '☁️ 同期しました！ これで 準備は おしまいです。'; noteNg = false; render();
      } catch (e) { fails++; msg('同期できませんでした。もう一度 押してください。（' + (e.message || e) + '）', true); render(); }
    };
    const go = s.body.querySelector('.go');
    go.onclick = () => { if (!synced) return; audio.sfx('select'); S.needLink = false; S.linkDoneAt = Date.now(); save(); s.close(); };
    const lt = s.body.querySelector('.later');
    if (lt) lt.onclick = async () => { if (await confirmBox('連携コードの 準備を あとに しますか？（次に アプリを 開いたとき もう一度 出ます）')) { S.needLink = true; save(); s.close(); } };
    s.body.querySelectorAll('input').forEach(i => { i.onkeydown = (e) => e.stopPropagation(); });
  };
  render();
  await waitClose(s);
}

// ---------------------------------------------------------------
//  アカウント削除（クラウドの データ・ランキング・フレンド・連携コードも 消す）
// ---------------------------------------------------------------
export async function deleteAccountFlow() {
  if (!G.save && hasSave()) G.save = loadGame();
  const S = G.save;
  if (!S) { toast('削除する データが ありません'); return false; }
  if (!(await confirmBox(`アカウント「${S.name}」を 削除しますか？\n・この端末の セーブデータ\n・クラウドの セーブデータ（連携した ほかの端末とも 共有している データ）\n・ランキングの 記録・フレンド・連携コード\nが すべて 消えます。元には もどせません。`, '削除へ進む', 'やめる'))) return false;
  if (!(await confirmBox('本当に 削除しますか？ アニモンも 図鑑も すべて なくなります。', '削除する', 'やめる'))) return false;
  const ON = await import('../online.js');
  if (S.pid && ON.isConfigured()) {
    const w = openScreen('アカウント削除', { noClose: true });
    w.body.innerHTML = '<p class="muted" style="text-align:center;margin-top:2em">サーバーの データを 削除しています……</p>';
    try { await ON.deleteAccount(); w.close(); }
    catch (e) {
      w.close();
      if (e && e.unlinked) {
        if (!(await confirmBox('この端末は このアカウントの 連携が 外れているため、サーバーの データ（ランキングなど）は 消せませんでした。\nこの端末の データだけ 削除しますか？', '端末の データだけ 削除', 'やめる'))) return false;
      } else { await say([`|削除できませんでした。電波の よい 場所で もう一度 ためしてください。（${(e && e.message) || e}）`]); return false; }
    }
  }
  deleteGame();
  G.save = null;   // 画面を 閉じるときの 自動セーブで 書き戻されないように
  try { sessionStorage.removeItem('animon_autocont'); } catch (e) { /* */ }
  await say(['|アカウントを 削除しました。ランキングからも 消えました。', '|遊んでくれて ありがとう！']);
  location.reload();
  return true;
}

// ---------------------------------------------------------------
//  運営からの プレゼント（管理サイトの「🎁 プレゼントを 送る」）
//   ・ゲーム中（フィールドで 何もしていない とき）に 受け取って、お金・アニモンを 追加する
//   ・受け取った しるしを セーブに 残してから サーバーの 分を 消す（2回 もらわない）
// ---------------------------------------------------------------
let giftBusy = false;
function cleanGiftMon(raw, S, M, SP, MV, IT) {
  const sp = SP.SPECIES[+raw.sp]; if (!sp) return null;
  const lv = Math.max(1, Math.min(99, Math.round(+raw.lv || 5)));
  const iv = {}; for (const k of ['atk', 'def', 'hp', 'spe']) iv[k] = Math.max(1, Math.min(15, Math.round(+raw.iv?.[k] || 8)));
  let moves = Array.isArray(raw.moves) ? raw.moves.map(x => (typeof x === 'string' ? x : x?.id)).filter(id => MV.MOVES[id]) : [];
  moves = [...new Set(moves)].slice(0, 4);
  const m = M.createMon(sp.id, lv, { iv, shiny: !!raw.shiny && !sp.legend, ot: S.name, metAt: '運営からの プレゼント', nick: String(raw.nick || '').slice(0, 10), moves: moves.length ? moves : undefined, item: raw.item && IT.ITEMS[raw.item]?.cat === 'held' ? raw.item : null });
  return m;
}
export async function checkGifts() {
  if (giftBusy || !G.save || G.state !== 'world' || G.busy) return;
  giftBusy = true;
  try {
    const ON = await import('../online.js');
    if (!ON.Online.ready || !ON.Online.pid) return;
    const list = await ON.fetchGifts();
    let all = []; try { all = await ON.fetchGiftsAll(); } catch (e) { /* ルールが 古い */ }
    const got = G.save.giftsGot || (G.save.giftsGot = {});
    const created = +G.save.created || 0, now = Date.now();
    // 全員への プレゼント：期限内・まだ 受け取っていない・（送った あとに 始めた 人も OK の ときだけ）新しい 人にも
    const allFresh = all.filter(g => !got[g.id] && !(+g.until && now > +g.until) && !(g.newOk === false && created && +g.at && created > +g.at));
    const fresh = [...list.filter(g => !got[g.id]), ...allFresh];
    // サーバーに 残っている 受け取りずみの 分（自分あて）は 消しておく
    for (const g of list) if (got[g.id]) { try { await ON.removeGift(g.id); } catch (e) { /* */ } }
    if (!fresh.length) return;
    const live = new Set([...list, ...all].map(g => g.id));
    const [M, SP, MV, IT, ST, OW] = await Promise.all([import('../game/mon.js'), import('../data/species.js'), import('../data/moves.js'), import('../data/items.js'), import('../game/state.js'), import('../game/overworld.js')]);
    await OW.runFlow(async () => {
      for (const g of fresh) {
        if (got[g.id]) continue;
        const lines = [g.all ? '|🎁 運営から みんなへ プレゼントが 届いた！' : '|🎁 運営から プレゼントが 届いた！'];
        if (g.note) lines.push('|「' + String(g.note).slice(0, 200) + '」');
        const money = Math.round(+g.money || 0);
        if (money) { ST.addMoney(money); lines.push(`|${money > 0 ? '' : '（'}${Math.abs(money).toLocaleString()}円 ${money > 0 ? 'を 受け取った！' : '減った）'}`); }
        let mons = []; try { mons = JSON.parse(g.mons || '[]'); } catch (e) { mons = []; }
        for (const raw of Array.isArray(mons) ? mons : []) {
          const m = cleanGiftMon(raw, G.save, M, SP, MV, IT); if (!m) continue;
          const where = ST.giveMon(m, !!raw.toBox);
          lines.push(`|${m.shiny ? '✨' : ''}${M.monName(m)}（Lv${m.lv}）が なかまに 加わった！${where === 'box' ? '（ボックスへ）' : ''}`);
        }
        for (const [id, n] of Object.entries(g.items || {})) if (IT.ITEMS[id] && +n) { ST.addItem(id, Math.round(+n)); lines.push(`|${IT.ITEMS[id].name} ×${Math.round(+n)} を 受け取った！`); }
        got[g.id] = Date.now();
        save();
        audio.sfx('kiran');
        await say(lines);
        if (!g.all) { try { await ON.removeGift(g.id); } catch (e) { /* 次に 消す */ } }
      }
      // 受け取りの しるし：まだ サーバーに ある 分は ずっと 残す（2回 もらわない）。ほかは 新しい 100件まで
      const ids = Object.keys(got).filter(id => !live.has(id)).sort((a, b) => got[b] - got[a]); for (const id of ids.slice(100)) delete got[id];
      save();
      try { OW.refreshFollower(); } catch (e) { /* */ }
    });
  } catch (e) { console.warn('gifts', e); } finally { giftBusy = false; }
}
export function startGiftWatch() {
  if (startGiftWatch.on) return; startGiftWatch.on = true;
  setTimeout(() => checkGifts(), 9000);
  setInterval(() => checkGifts(), 60000);
}
