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
  show('.compose', isAdmin); show('.listcard', isAdmin); show('.makeacct', isAdmin);
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
  $('.mklgrow').classList.toggle('hidden', n !== 11);
  try {
    const [{ buildStorySave }, { SPECIES }, { STONES }] = await Promise.all([import('../js/game/devsave.js'), import('../js/data/species.js'), import('../js/data/world.js')]);
    const S = buildStorySave('preview', n, { starter: +$('.mkst').value, legend: +$('.mklg').value });
    if (+$('.mkch').value !== n) return;
    const lvs = S.party.map(m => m.lv), town = STONES.find(x => x.id === S.lastHospital)?.name || '';
    const lulu = S.story.lulu ? '（ルルは クロギリ団に さらわれ中）' : S.story.luluUid ? '・ルルあり' : '';
    $('.mkinfo').innerHTML = `${n >= 11 ? 'ストーリー 全クリア（クリア後の 世界）' : `第${n + 1}章が 始まる ところ`}・紋章 ${S.story.crests}個・手持ち ${S.party.length}匹 Lv${Math.min(...lvs)}〜${Math.max(...lvs)}・ボックス ${S.box.length}匹${lulu}<br>スタート：${esc(town)}　手持ち：${S.party.map(m => esc(m.nick || SPECIES[m.sp].name)).join('・')}`;
  } catch (e) { $('.mkinfo').textContent = ''; console.error(e); }
}
$('.mkch').onchange = mkPreview; $('.mkst').onchange = mkPreview; $('.mklg').onchange = mkPreview;
mkPreview();

$('.domake').onclick = async () => {
  if (!isAdmin) return;
  const name = $('.mkname').value.trim() || 'nekojita';
  const ch = Math.max(1, Math.min(11, +$('.mkch').value || 4));
  const out = $('.mkout');
  if (!confirm(`「${name}」の アカウント（${ch >= 11 ? 'ストーリー 全クリア' : `第${ch}章まで クリア／第${ch + 1}章の はじめ`}）を 作りますか？`)) return;
  $('.domake').disabled = true; out.innerHTML = '<p class="muted">作成中……（サーバーに 接続しています）</p>';
  const KEY = 'animon_save_v1', keep = localStorage.getItem(KEY);
  try {
    const [{ G }, SV, { buildStorySave, CLEAR_JA }, ON] = await Promise.all([import('../js/game/state.js'), import('../js/game/save.js'), import('../js/game/devsave.js'), import('../js/online.js')]);
    G.settings = SV.loadSettings();
    G.save = buildStorySave(name, ch, { starter: +$('.mkst').value, legend: +$('.mklg').value });
    const code = await ON.issueTransferCode();
    try { await ON.publishRanking(true); } catch (e) { /* */ }
    const S = G.save;
    out.innerHTML = `<p class="okc">✅ アカウント「${esc(S.name)}」を 作りました。</p><p class="muted">${esc(CLEAR_JA(ch))}</p><p>引き継ぎコード：</p>
      <p style="font-size:1.9em;font-weight:900;letter-spacing:.1em;color:var(--acc);user-select:all;margin:.2em 0">${esc(code)}</p>
      <div class="row"><button class="sm cpc">📋 コピー</button></div>
      <p class="muted">ゲームの タイトル画面 →「🔑 引き継ぎコードの発行・アカウント引き継ぎ」→「コードを入力して 連携する」に 入力すると、この データで 遊べます。<br>パーティー ${S.party.length}匹・ボックス ${S.box.length}匹・所持金 ¥${S.money.toLocaleString()}・紋章 ${S.story.crests}個</p>
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

boot().catch(e => { $('.loading').innerHTML = `<p class="ng">読み込めませんでした：${esc(errText(e))}</p>`; });
