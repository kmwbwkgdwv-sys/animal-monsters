// =============================================================
//  アニモン お知らせ管理（管理者だけ）
//   ・Firebase Authentication の「メール / パスワード」で ログイン
//   ・Realtime Database の admins/{UID} = true の 人だけ お知らせを 書ける（ルールで 守る）
//   ・ゲームは announcements を 読んで、まだ 見ていない お知らせを 1回だけ 表示する
//   ・テスト用：ストーリーの 途中から 始まる アカウントを 作って 引き継ぎコードを 出す（スマホからでも OK）
//  ※ ゲーム本体の ログイン（匿名）と まざらないよう、別の 名前の Firebase アプリで ログインする
// =============================================================
import { firebaseConfig, FIREBASE_SDK_VERSION, firebaseReady } from '../js/firebase-config.js';

const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const toast = (t, ms = 2600) => { const d = document.createElement('div'); d.textContent = t; $('#toast').appendChild(d); setTimeout(() => d.remove(), ms); };
const show = (sel, on) => document.querySelectorAll(sel).forEach(e => e.classList.toggle('hidden', !on));

let A, D, app, auth, db, user = null, isAdmin = false, list = [], editing = null;

const AUTH_ERR = {
  'auth/invalid-credential': 'メールアドレスか パスワードが ちがいます。', 'auth/wrong-password': 'パスワードが ちがいます。', 'auth/user-not-found': 'その メールアドレスの 管理者は 登録されていません。',
  'auth/invalid-email': 'メールアドレスの 形が ちがいます。', 'auth/too-many-requests': '失敗が 続いたので しばらく 待ってから ためしてください。',
  'auth/operation-not-allowed': 'Firebase コンソールで「メール / パスワード」の ログインが 有効に なっていません。', 'auth/network-request-failed': 'ネットに つながりませんでした。',
};
const errText = (e) => AUTH_ERR[e && e.code] || (/PERMISSION_DENIED|permission/i.test(String(e && (e.code || e.message))) ? '書きこむ 権限が ありません（admins への 登録と、新しい ルールの 公開を 確認してください）。' : (e && (e.message || e.code)) || String(e));

async function boot() {
  if (!firebaseReady()) { $('.loading').innerHTML = '<p class="ng">js/firebase-config.js の 設定が ありません。</p>'; return; }
  const base = `https://www.gstatic.com/firebasejs/${FIREBASE_SDK_VERSION}`;
  const [mApp, mAuth, mDb] = await Promise.all([import(`${base}/firebase-app.js`), import(`${base}/firebase-auth.js`), import(`${base}/firebase-database.js`)]);
  A = mAuth; D = mDb;
  app = mApp.getApps().find(a => a.name === 'animon-admin') || mApp.initializeApp(firebaseConfig, 'animon-admin');
  auth = A.getAuth(app);
  db = D.getDatabase(app, firebaseConfig.databaseURL);
  A.onAuthStateChanged(auth, async (u) => {
    user = u && !u.isAnonymous ? u : null;
    show('.loading', false);
    if (!user) { isAdmin = false; render(); return; }
    try { const s = await D.get(D.ref(db, 'admins/' + user.uid)); isAdmin = s.exists() && s.val() === true; } catch (e) { isAdmin = false; }
    render();
    if (isAdmin) loadList();
  });
}

function render() {
  show('.login', !user);
  show('.logout', !!user);
  $('.who').textContent = user ? (user.email || user.uid) + (isAdmin ? '（管理者）' : '') : '';
  show('.notadmin', !!user && !isAdmin);
  if (user) $('.myuid').textContent = user.uid;
  show('.compose', isAdmin); show('.listcard', isAdmin); show('.makeacct', isAdmin); show('.giftcard', isAdmin);
  preview();
}

// ---------- ログイン ----------
$('.dologin').onclick = async () => {
  const em = $('.email').value.trim(), pw = $('.pass').value;
  if (!em || !pw) { $('.lmsg').textContent = 'メールアドレスと パスワードを 入れてください'; return; }
  $('.dologin').disabled = true; $('.lmsg').textContent = '';
  try { await A.signInWithEmailAndPassword(auth, em, pw); } catch (e) { $('.lmsg').textContent = errText(e); }
  $('.dologin').disabled = false;
};
$('.pass').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('.dologin').click(); });
$('.logout').onclick = async () => { await A.signOut(auth); toast('ログアウトしました'); };
$('.copyuid').onclick = () => { navigator.clipboard?.writeText(user.uid).then(() => toast('UID を コピーしました')); };

// ---------- 送信フォーム ----------
const today = () => { const d = new Date(); return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`; };
$('.date').value = today();
function preview() {
  $('.pt').textContent = $('.title').value.trim() || 'タイトル';
  $('.pd').textContent = $('.date').value.trim();
  $('.pb').textContent = $('.body').value;
  $('.bcount').textContent = $('.body').value.length;
}
for (const s of ['.title', '.body', '.date']) $(s).addEventListener('input', preview);
// 新しい お知らせの キー（時刻順に 並ぶ・毎回 ちがう）
function newKey() {
  const d = new Date(), p = (n) => String(n).padStart(2, '0');
  return `n${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}-${Math.random().toString(36).slice(2, 5)}`;
}
function setEditing(n) {
  editing = n;
  $('.compose').classList.toggle('editing', !!n);
  $('.ctitle').textContent = n ? '✏️ お知らせを 直す' : '✏️ 新しい お知らせを 送る';
  $('.send').textContent = n ? '💾 保存する' : '📢 送信する';
  show('.cancel', !!n);
  $('.send-note').textContent = n ? '直しても、もう見た人には もう一度は 表示されません（もう一度 見せたいときは 一覧の「もう一度 全員に 表示」）。' : '送信すると、次に アプリを 開いた人に 1回だけ 表示されます（その後は 📢 お知らせ ボタンで いつでも 見られます）。';
  if (n) { $('.title').value = n.title || ''; $('.body').value = n.body || ''; $('.date').value = n.date || ''; window.scrollTo({ top: 0, behavior: 'smooth' }); }
  else { $('.title').value = ''; $('.body').value = ''; $('.date').value = today(); }
  preview();
}
$('.cancel').onclick = () => setEditing(null);
$('.send').onclick = async () => {
  const title = $('.title').value.trim(), body = $('.body').value.replace(/\s+$/, ''), date = $('.date').value.trim();
  if (!title) { toast('タイトルを 入れてください'); $('.title').focus(); return; }
  if (!body) { toast('本文を 入れてください'); $('.body').focus(); return; }
  if (!editing && !confirm(`「${title}」を 送信しますか？\n次に アプリを 開いた 全員に 表示されます。`)) return;
  $('.send').disabled = true; $('.smsg').textContent = '送信中……';
  try {
    if (editing) await D.update(D.ref(db, 'announcements/' + editing.id), { title, body, date, editedAt: D.serverTimestamp() });
    else await D.set(D.ref(db, 'announcements/' + newKey()), { title, body, date, at: D.serverTimestamp(), by: user.email || user.uid });
    toast(editing ? '保存しました' : '📢 送信しました！ 次に アプリを 開いた人に 表示されます', 3500);
    setEditing(null);
    await loadList();
    $('.smsg').textContent = '';
  } catch (e) { $('.smsg').innerHTML = `<span class="ng">${esc(errText(e))}</span>`; }
  $('.send').disabled = false;
};

// ---------- 一覧 ----------
async function loadList() {
  $('.list').innerHTML = '<p class="muted">読み込み中……</p>';
  try {
    const s = await D.get(D.ref(db, 'announcements'));
    const v = s.val() || {};
    list = Object.entries(v).map(([id, n]) => ({ id, ...n })).sort((a, b) => ((+b.at || 0) - (+a.at || 0)) || (a.id < b.id ? 1 : -1));
  } catch (e) { $('.list').innerHTML = `<p class="ng">${esc(errText(e))}</p>`; return; }
  $('.lcount').textContent = `（${list.length}件・表示中 ${list.filter(n => !n.hidden).length}件）`;
  const box = $('.list'); box.innerHTML = list.length ? '' : '<p class="muted">まだ お知らせは ありません。</p>';
  for (const n of list) {
    const d = document.createElement('div'); d.className = 'item' + (n.hidden ? ' hid' : '');
    const when = n.at ? new Date(+n.at).toLocaleString('ja-JP') : '';
    d.innerHTML = `<div class="newsitem"><div class="nh"><b>${esc(n.title)}</b><span class="nd">${esc(n.date || '')}</span></div><div class="nb">${esc(n.body || '')}</div></div>
      <div class="ops"><span class="state ${n.hidden ? 'off' : 'on'}">${n.hidden ? '非表示' : '表示中'}</span><span class="key">${esc(n.id)}${when ? '・' + esc(when) : ''}</span><span class="grow"></span>
        <button class="sm ed">✏️ 直す</button><button class="sm tg">${n.hidden ? '👁 表示する' : '🙈 非表示にする'}</button><button class="sm rp">🔁 もう一度 全員に 表示</button><button class="sm red del">🗑 削除</button></div>`;
    d.querySelector('.ed').onclick = () => setEditing(n);
    d.querySelector('.tg').onclick = async () => { try { await D.update(D.ref(db, 'announcements/' + n.id), { hidden: !n.hidden }); await loadList(); } catch (e) { toast(errText(e), 4000); } };
    d.querySelector('.rp').onclick = async () => {
      if (!confirm(`「${n.title}」を 新しい お知らせとして 送りなおしますか？\nもう見た人にも、次に アプリを 開いたときに もう一度 表示されます（前のものは 非表示に します）。`)) return;
      try {
        await D.set(D.ref(db, 'announcements/' + newKey()), { title: n.title, body: n.body || '', date: today(), at: D.serverTimestamp(), by: user.email || user.uid });
        await D.update(D.ref(db, 'announcements/' + n.id), { hidden: true });
        toast('送りなおしました'); await loadList();
      } catch (e) { toast(errText(e), 4000); }
    };
    d.querySelector('.del').onclick = async () => {
      if (!confirm(`「${n.title}」を 削除しますか？（元に もどせません）`)) return;
      try { await D.remove(D.ref(db, 'announcements/' + n.id)); toast('削除しました'); await loadList(); } catch (e) { toast(errText(e), 4000); }
    };
    box.appendChild(d);
  }
}
$('.reload').onclick = () => loadList();

// ---------- テスト用：ストーリーの 途中から 始まる アカウントを 作る ----------
//  ゲームと 同じ しくみ（js/online.js）で 新しい アカウントを 登録して、引き継ぎコード（データ連携コード）を 出す。
//  この ブラウザの ゲームの セーブデータは さわらない（作業の あと もとに もどす）。
// 選んだ 章の 中身（紋章・手持ち・場所）を 先に 見せる
async function mkPreview() {
  const n = +$('.mkch').value;
  $('.mklgrow').classList.toggle('hidden', n < 11);
  try {
    const [{ buildStorySave }, { SPECIES }, { STONES }] = await Promise.all([import('../js/game/devsave.js'), import('../js/data/species.js'), import('../js/data/world.js')]);
    const S = buildStorySave('preview', n, { starter: +$('.mkst').value, legend: +$('.mklg').value });
    if (+$('.mkch').value !== n) return;
    const lvs = S.party.map(m => m.lv), town = STONES.find(x => x.id === S.lastHospital)?.name || '';
    const lulu = S.story.lulu ? '（ルルは クロギリ団に さらわれ中）' : S.story.luluUid ? '・ルルあり' : '';
    $('.mkinfo').innerHTML = `${n >= 21 ? '第2部 全クリア' : n >= 12 ? `第2部（隕石の あとの 大陸）・${n === 12 ? '第2部 第1章から' : `第2部 第${n - 11}章が 始まる ところ`}` : n >= 11 ? 'ストーリー 全クリア（クリア後の 世界）' : `第${n + 1}章が 始まる ところ`}・紋章 ${S.story.crests}個・手持ち ${S.party.length}匹 Lv${Math.min(...lvs)}〜${Math.max(...lvs)}・ボックス ${S.box.length}匹${lulu}<br>スタート：${esc(town)}　手持ち：${S.party.map(m => esc(m.nick || SPECIES[m.sp].name)).join('・')}`;
  } catch (e) { $('.mkinfo').textContent = ''; console.error(e); }
}
const onSetting = () => { mkPreview(); if (draft) { buildDraft(); toast('設定を 変えたので 中身を 作りなおしました'); } };
$('.mkch').onchange = onSetting; $('.mkst').onchange = onSetting; $('.mklg').onchange = onSetting;
mkPreview();

// ---------- 中身を 調整する（お金・図鑑・アニモン） ----------
let draft = null, ME = null;
const loadME = async () => (ME ||= await import('./moneditor.js'));
async function buildDraft() {
  const [{ buildStorySave, chapterPool }] = await Promise.all([import('../js/game/devsave.js'), loadME()]);
  const name = $('.mkname').value.trim() || 'nekojita';
  const ch = Math.max(1, Math.min(21, +$('.mkch').value || 4));
  draft = buildStorySave(name, ch, { starter: +$('.mkst').value, legend: +$('.mklg').value });
  draftPool = chapterPool(ch, +$('.mkst').value);
  $('.dmoney').value = draft.money;
  const L = ME.dexLimits(draft, draftPool);
  $('.dreg').value = L.min; $('.dcatch').value = L.ownCount;
  draftApplied = L.min + '/' + L.ownCount;
  ME.applyDexCatch(draft, L.min, L.ownCount, draftPool);
  showDraft();
}
let draftPool = null, draftApplied = '';
const regV = () => +$('.dreg').value || 0, catchV = () => +$('.dcatch').value || 0;
function updDexNote() {
  const L = ME.dexLimits(draft, draftPool);
  if (regV() < L.min) $('.dreg').value = L.min;
  if (regV() > L.regMax) $('.dreg').value = L.regMax;
  const cmin = ME.catchMin(L, regV());
  if (catchV() < cmin) $('.dcatch').value = cmin;
  if (catchV() > L.cap) $('.dcatch').value = L.cap;
  $('.dreg').min = L.min; $('.dreg').max = L.regMax; $('.dcatch').min = cmin; $('.dcatch').max = L.cap;
  const pending = draftApplied !== regV() + '/' + catchV();
  $('.ddex').innerHTML = `<b>図鑑登録数</b>＝捕まえた ことが ある 種類の 数（${L.min}〜${L.regMax}）。<b>捕まえた数</b>＝捕まえた アニモンの 匹数で、同じ 種類を 何匹も 捕まえる ことも あるので 図鑑登録数 以上に なります（${cmin}〜${L.cap}匹・持てる数まで）。<br>
    足りない 種類は この章までに 出会える アニモンから、捕まえた 子は 図鑑登録した 種類の 中から、<b>出やすい アニモンほど 多く</b> ランダムに 選んで ボックスに 入れます（レベルは 出会う 場所に 合わせます）。${pending ? '<br><b style="color:var(--acc)">「🎲 この数で 図鑑と ボックスに 入れる」を 押すと 反映します（押さなくても 作るときに 反映されます）。</b>' : ''}`;
}
function applyDex() {
  const r = ME.applyDexCatch(draft, regV(), catchV(), draftPool);
  $('.dreg').value = r.N; $('.dcatch').value = r.M;
  draftApplied = r.N + '/' + r.M;
  showDraft();
  return r;
}
function showDraft() {
  $('.drafted').classList.remove('hidden');
  const S = draft, st = S.story;
  const lock = (m) => { if (m.uid === st.luluUid || m.uid === st.legendUid) { alert('ルルと 伝説は ストーリーで 使うので 外せません（✏️ で 直すことは できます）'); return false; } return true; };
  const sameSp = (list, m, skipUid) => list.some(x => x.sp === m.sp && x.uid !== skipUid);
  const common = { ot: S.name, metAt: '', canRemove: lock, onChange: updDexNote };
  let partyL = null, boxL = null;
  partyL = ME.monList($('.dparty'), S.party, { ...common, title: '🐾 手持ち（6匹まで・同じ 種類は 1匹）', max: 6,
    accept: (m) => { if (sameSp(S.party, m)) { alert('同じ 種類は 手持ちに 1匹までです（ボックスに 追加してください）'); return false; } },
    other: { label: '📦へ', move: (m) => { if (S.party.length <= 1) { alert('手持ちは 1匹 以上 必要です'); return false; } S.box.unshift(m); boxL.redraw(); } } });
  boxL = ME.monList($('.dbox'), S.box, { ...common, title: '📦 ボックス', max: 600, multiAdd: true,
    other: { label: '🐾へ', move: (m) => { if (S.party.length >= 6) { alert('手持ちが いっぱいです'); return false; } if (sameSp(S.party, m)) { alert('同じ 種類が もう 手持ちに います'); return false; } S.party.push(m); partyL.redraw(); } } });
  updDexNote();
}
$('.draft').onclick = async () => { $('.draft').disabled = true; try { await buildDraft(); toast('中身を 作りました。下で 調整してください'); } catch (e) { console.error(e); toast('作れませんでした：' + e.message); } $('.draft').disabled = false; };
$('.dreg').onchange = updDexNote; $('.dcatch').onchange = updDexNote;
$('.dapply').onclick = () => { if (!draft) return; const r = applyDex(); toast(`図鑑登録 ${r.N}種類・捕まえた ${r.M}匹（ボックスに ${r.added}匹 追加）`); };


$('.domake').onclick = async () => {
  if (!isAdmin) return;
  const name = $('.mkname').value.trim() || 'nekojita';
  const ch = Math.max(1, Math.min(21, +$('.mkch').value || 4));
  const out = $('.mkout');
  if (!confirm(`「${name}」の アカウント（${ch >= 12 ? (ch >= 21 ? '第2部 全クリア' : ch === 12 ? '第2部の はじめ' : `第2部 第${ch - 12}章まで クリア`) : ch >= 11 ? 'ストーリー 全クリア' : `第${ch}章まで クリア／第${ch + 1}章の はじめ`}）を 作りますか？`)) return;
  $('.domake').disabled = true; out.innerHTML = '<p class="muted">作成中……（サーバーに 接続しています）</p>';
  const KEY = 'animon_save_v1', keep = localStorage.getItem(KEY);
  try {
    const [{ G }, SV, { buildStorySave, CLEAR_JA }, ON] = await Promise.all([import('../js/game/state.js'), import('../js/game/save.js'), import('../js/game/devsave.js'), import('../js/online.js')]);
    G.settings = SV.loadSettings();
    if (draft) {
      // 調整した 中身を 使う（なまえを 変えていたら 合わせる）
      const old = draft.name;
      draft.name = name;
      for (const m of [...draft.party, ...draft.box, ...(draft.story.lulu ? [draft.story.lulu] : [])]) if (!m.ot || m.ot === old) m.ot = name;
      draft.money = Math.max(0, Math.min(9999999, Math.round(+$('.dmoney').value || 0)));
      if (draftApplied !== regV() + '/' + catchV()) applyDex();
      ME.stripGen(draft);
      draft.created = Date.now() - 86400000; draft.saved = Date.now();
      G.save = JSON.parse(JSON.stringify(draft));
    } else G.save = buildStorySave(name, ch, { starter: +$('.mkst').value, legend: +$('.mklg').value });
    const code = await ON.issueTransferCode();
    try { await ON.publishRanking(true); } catch (e) { /* */ }
    const S = G.save;
    out.innerHTML = `<p class="okc">✅ アカウント「${esc(S.name)}」を 作りました。</p><p class="muted">${esc(CLEAR_JA(ch))}</p><p>引き継ぎコード：</p>
      <p style="font-size:1.9em;font-weight:900;letter-spacing:.1em;color:var(--acc);user-select:all;margin:.2em 0">${esc(code)}</p>
      <div class="row"><button class="sm cpc">📋 コピー</button></div>
      <p class="muted">ゲームの タイトル画面 →「🔑 引き継ぎコードの発行・アカウント引き継ぎ」→「コードを入力して 連携する」に 入力すると、この データで 遊べます。<br>パーティー ${S.party.length}匹・ボックス ${S.box.length}匹・所持金 ¥${S.money.toLocaleString()}・紋章 ${S.story.crests}個・図鑑登録 ${Object.keys(S.dex.seen).length}・捕まえた ${Object.keys(S.dex.caught).length}</p>
      <p class="muted">このコードを 知っている人は この データで 遊べます。ほかの人には 教えないでください。</p>`;
    out.querySelector('.cpc').onclick = () => navigator.clipboard?.writeText(code).then(() => toast('コピーしました'));
  } catch (e) {
    console.error(e);
    out.innerHTML = `<p class="ng">作れませんでした：${esc(errText(e))}</p><p class="muted">Firebase の「匿名」ログインが 有効か、ルールが 公開されているか 確認してください。</p>`;
  } finally {
    if (keep === null) localStorage.removeItem(KEY); else localStorage.setItem(KEY, keep);
    $('.domake').disabled = false;
  }
};

// ---------- 今ある アカウントに プレゼント（お金・アニモン）を 送る ----------
//  gifts/{pid}/{id} に 書くと、その人の ゲームが 受け取って 追加する（セーブを 直接 書きかえない）
let giftPid = null, giftName = '';
const giftMons = [];
let giftL = null;
async function findAccount(raw) {
  raw = raw.trim().toUpperCase();
  const al = raw.replace(/[^0-9A-Z]/g, '');
  if (/^\d{8}$/.test(al)) { const s = await D.get(D.ref(db, 'codes/' + al)); return s.exists() ? s.val().pid : null; }
  if (al.length === 12) { const code = al.slice(0, 4) + '-' + al.slice(4, 8) + '-' + al.slice(8); const s = await D.get(D.ref(db, 'transfers/' + code)); return s.exists() ? s.val().pid : null; }
  throw new Error('コードの 形が ちがいます（引き継ぎコードは 12文字、フレンドコードは 数字8けた）');
}
const ITEM_JA = { crown_g: '金の王冠', crown_s: '銀の王冠', candy: 'ふしぎなアメ', rarecandy: 'ふしぎなアメ', scroll: 'おもいだしの巻物' };
const itemText = (it) => Object.entries(it || {}).filter(([, n]) => +n).map(([id, n]) => `${ITEM_JA[id] || id}×${n} `).join('');
const gmode = () => (document.querySelector('input[name="gmode"]:checked') || {}).value || 'one';
function ensureGiftList() {
  if (giftL) { giftL.redraw(); return; }
  loadME().then(ME2 => { giftL = ME2.monList($('.glist'), giftMons, { title: '🎁 送る アニモン', max: 30, ot: '', metAt: '', multiAdd: true }); });
}
{ const d = new Date(Date.now() + 30 * 86400000), p2 = (n) => String(n).padStart(2, '0'); $('.guntil').value = `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`; }
function onMode() {
  const all = gmode() === 'all';
  $('.gone').classList.toggle('hidden', all); $('.gall').classList.toggle('hidden', !all); $('.gstory').classList.toggle('hidden', all);
  $('.gform').classList.toggle('hidden', !(all || giftPid));
  if (all || giftPid) { ensureGiftList(); loadPending(); }
}
document.querySelectorAll('input[name="gmode"]').forEach(r => r.onchange = onMode);
$('.gch').onchange = () => $('.glg').classList.toggle('hidden', !(+$('.gch').value >= 11));
const fmtDay = (t) => { const d = new Date(+t); return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`; };
async function loadPending() {
  const el = $('.gpend');
  const all = gmode() === 'all';
  if (!all && !giftPid) { el.innerHTML = ''; return; }
  const path = all ? 'giftsAll' : 'gifts/' + giftPid;
  try {
    const s = await D.get(D.ref(db, path));
    const v = s.exists() ? s.val() : {};
    const ids = Object.keys(v).sort((a, b) => (+v[b].at || 0) - (+v[a].at || 0));
    el.innerHTML = all ? (ids.length ? `<b>全員への プレゼント（${ids.length}）</b>` : '<span class="muted">全員への プレゼントは まだ ありません</span>')
      : (ids.length ? `<b>まだ 受け取られていない プレゼント（${ids.length}）</b>` : '<span class="muted">まだ 受け取られていない プレゼントは ありません</span>');
    for (const id of ids) {
      const g = v[id]; let n = 0; try { n = JSON.parse(g.mons || '[]').length; } catch (e) { /* */ }
      const end = +g.until && Date.now() > +g.until;
      const row = document.createElement('div'); row.className = 'gpitem';
      row.innerHTML = `<span class="grow">${g.money ? '¥' + (+g.money).toLocaleString() + ' ' : ''}${itemText(g.items)}${n ? 'アニモン ' + n + '匹 ' : ''}${g.story ? `📖${+g.story.cleared >= 12 ? (+g.story.cleared === 12 ? '第2部の はじめ' : `第2部 第${g.story.cleared - 12}章まで クリア`) : `第${g.story.cleared}章まで クリア`}に 直す ` : ''}${g.note ? '「' + esc(g.note) + '」' : ''}${all ? `<br><small class="muted">${g.at ? fmtDay(g.at) + ' 送信' : ''}${+g.until ? '・' + fmtDay(g.until) + ' まで' : ''}${g.newOk === false ? '・送った 時点の プレイヤーだけ' : ''}${end ? '・<b class="ng">期限切れ</b>' : ''}</small>` : ''}</span><button class="sm red">${all ? '終わらせる' : '取り消す'}</button>`;
      row.querySelector('button').onclick = async () => {
        if (!confirm(all ? 'この プレゼントを 終わらせますか？（まだ 受け取っていない 人は 受け取れなく なります）' : 'この プレゼントを 取り消しますか？')) return;
        await D.remove(D.ref(db, `${path}/${id}`)); toast(all ? '終わらせました' : '取り消しました'); loadPending();
      };
      el.appendChild(row);
    }
  } catch (e) { el.innerHTML = `<span class="ng">読めませんでした：${esc(errText(e))}（新しい ルールを 公開してください）</span>`; }
}
$('.gfind').onclick = async () => {
  const w = $('.gwho');
  $('.gform').classList.add('hidden'); giftPid = null;
  w.innerHTML = '<span class="muted">さがしています……</span>';
  try {
    const pid = await findAccount($('.gcode').value);
    if (!pid) { w.innerHTML = '<span class="ng">見つかりません（コードを 発行しなおした 場合は 新しい コードを 入れてください）</span>'; return; }
    const pl = (await D.get(D.ref(db, 'players/' + pid))).val() || {};
    let sum = '';
    try { const sv = await D.get(D.ref(db, 'saves/' + pid)); if (sv.exists()) { const v = sv.val(); sum = `図鑑 ${v.dex ?? '?'}・紋章 ${v.crests ?? '?'}・プレイ ${Math.floor((v.playTime || 0) / 3600)}時間${Math.floor((v.playTime || 0) / 60) % 60}分`; } } catch (e) { sum = '（セーブの 中身は ルールを 公開すると 見られます）'; }
    giftPid = pid; giftName = pl.name || '';
    w.innerHTML = `<span class="okc">✅ 見つかりました：${esc(giftName || '（なまえ なし）')}</span> <span class="muted">${esc(sum)}</span>`;
    // いまの ストーリーの 進み具合
    $('.gnow').textContent = '';
    try { const sv = await D.get(D.ref(db, 'saves/' + pid)); if (sv.exists() && sv.val().data) { const S = JSON.parse(sv.val().data); const { progressText } = await import('../js/game/devsave.js'); $('.gnow').textContent = 'いま：' + progressText(S) + `（紋章 ${S.story?.crests ?? 0}個${S.story?.lulu ? '・ルルは さらわれ中' : ''}）`; } } catch (e) { $('.gnow').textContent = '（いまの 進み具合は 新しい ルールを 公開すると 見られます）'; }
    onMode();
  } catch (e) { w.innerHTML = `<span class="ng">${esc(errText(e))}</span>`; }
};
$('.gcode').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('.gfind').click(); });
$('.gsend').onclick = async () => {
  const all = gmode() === 'all';
  if (!all && !giftPid) return;
  const money = Math.round(+$('.gmoney').value || 0), note = $('.gnote').value.trim().slice(0, 200), toBox = $('.gtobox').checked;
  const storyCh = all ? 0 : +$('.gch').value || 0;
  const items = {}; document.querySelectorAll('.gi').forEach(i => { const n = Math.max(0, Math.min(99, Math.round(+i.value || 0))); if (n) items[i.dataset.id] = n; });
  if (!money && !giftMons.length && !Object.keys(items).length && !storyCh) { alert('お金・道具・アニモン・ストーリーの 進み具合の どれかを 入れてください'); return; }
  let until = 0;
  if (all) {
    const v = $('.guntil').value;
    until = v ? new Date(v + 'T23:59:59').getTime() : 0;
    if (until && until < Date.now()) { alert('期限が もう すぎています'); return; }
  }
  const what = `${money ? '¥' + money.toLocaleString() + ' ' : ''}${itemText(items)}${giftMons.length ? 'アニモン ' + giftMons.length + '匹 ' : ''}${storyCh ? `ストーリーを 第${storyCh}章まで クリアに 直す ` : ''}`;
  if (!confirm(all ? `【全員】すべての プレイヤーに ${what}を 送りますか？${until ? `\n（${fmtDay(until)} まで 受け取れます）` : ''}` : `${giftName || 'この人'} に ${what}を 送りますか？`)) return;
  $('.gsend').disabled = true;
  try {
    const gid = 'g' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const mons = giftMons.map(m => ({ sp: m.sp, lv: m.lv, iv: m.iv, shiny: !!m.shiny, nick: m.nick || '', moves: m.moves.map(x => x.id), item: m.item || null, toBox }));
    const data = { at: D.serverTimestamp(), by: user.uid, money, note, mons: JSON.stringify(mons) };
    if (Object.keys(items).length) data.items = items;
    if (storyCh) data.story = { cleared: storyCh, legend: +$('.glg').value || 199 };
    if (all) { if (until) data.until = until; data.newOk = $('.gnew').checked; }
    await D.set(D.ref(db, all ? `giftsAll/${gid}` : `gifts/${giftPid}/${gid}`), data);
    toast(all ? '🎁 全員に 送りました！ ゲームを 開いた 人から 順に 届きます' : '🎁 送りました！ その人が ゲームを 開くと 届きます');
    giftMons.length = 0; giftL && giftL.redraw(); $('.gmoney').value = 0; $('.gnote').value = ''; document.querySelectorAll('.gi').forEach(i => { i.value = 0; }); $('.gch').value = ''; $('.glg').classList.add('hidden');
    loadPending();
  } catch (e) { alert('送れませんでした：' + errText(e) + '\n（新しい ルールを 公開してください）'); }
  $('.gsend').disabled = false;
};

boot().catch(e => { $('.loading').innerHTML = `<p class="ng">読み込めませんでした：${esc(errText(e))}</p>`; });
