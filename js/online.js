// =============================================================
//  オンライン機能（Firebase Authentication + Realtime Database）
//   ・匿名ログイン
//   ・フレンド（フレンドコードで申請 → 承認）
//   ・トレード / 対戦（rooms でリアルタイム同期）
//   ・引き継ぎコードの発行・アカウント引き継ぎ
//   ・ランキング（図鑑登録数）
//
//  データの置き場所（Realtime Database）
//   players/{pid}            プレイヤー（持ち主の uid・名前・フレンドコード）
//   friends/{pid}/{相手pid}   フレンド一覧
//   requests/{pid}/{相手pid}  届いたフレンド申請
//   invites/{pid}/{roomId}   届いた対戦・トレードの招待
//   codes/{フレンドコード}     → { pid }
//   rooms/{roomId}           対戦・トレードのルーム
//   transfers/{引き継ぎコード}  引き継ぎ用セーブ
//   rankings/{pid}           ランキング用の公開成績
// =============================================================
import { firebaseConfig, FIREBASE_SDK_VERSION, firebaseReady } from './firebase-config.js';
import { G, save } from './game/state.js';

let A = null, R = null, app = null, auth = null, db = null;
const unsubs = [];
export const Online = { ready: false, uid: null, pid: null, error: null };

const CODE_CH = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
function rnd(n, ch = CODE_CH) { const a = new Uint32Array(n); crypto.getRandomValues(a); return [...a].map(v => ch[v % ch.length]).join(''); }
function friendCode() { return rnd(8, '0123456789'); }

export function isConfigured() { return firebaseReady(); }

export async function initOnline() {
  if (Online.ready) return true;
  if (!firebaseReady()) { Online.error = 'Firebaseの設定（js/firebase-config.js）が まだ完了していません。'; return false; }
  try {
    const base = `https://www.gstatic.com/firebasejs/${FIREBASE_SDK_VERSION}`;
    const [mApp, mAuth, mDb] = await Promise.all([import(`${base}/firebase-app.js`), import(`${base}/firebase-auth.js`), import(`${base}/firebase-database.js`)]);
    A = mAuth; R = mDb;
    app = mApp.getApps().length ? mApp.getApp() : mApp.initializeApp(firebaseConfig);
    auth = A.getAuth(app);
    db = R.getDatabase(app, firebaseConfig.databaseURL);
    if (!auth.currentUser) await A.signInAnonymously(auth);
    await new Promise(res => { const u = A.onAuthStateChanged(auth, (user) => { if (user) { u(); res(); } }); });
    Online.uid = auth.currentUser.uid;
    Online.ready = true;
    return true;
  } catch (e) {
    console.error(e);
    Online.error = 'サーバーに 接続できませんでした：' + (e.code || e.message);
    return false;
  }
}

// パス → 参照
const ref = (...p) => R.ref(db, p.join('/'));
const now = () => R.serverTimestamp();
async function val(...p) { const s = await R.get(ref(...p)); return s.exists() ? s.val() : null; }
const list = (obj, key = 'pid') => Object.entries(obj || {}).map(([k, v]) => ({ [key]: k, ...v }));
// 配列は Realtime Database だと {0:…,1:…} で返ることがあるので配列に戻す
const arr = (v) => Array.isArray(v) ? v.filter(Boolean) : Object.values(v || {});

// プレイヤー登録（この端末のセーブに pid とフレンドコードを持たせる）
export async function ensurePlayer() {
  if (!await initOnline()) throw new Error(Online.error);
  const S = G.save;
  if (S.pid) {
    const data = await val('players', S.pid);
    if (data) {
      if (data.owner !== Online.uid) throw new Error('このデータは 別の端末に 引き継がれています。');
      if (data.name !== S.name) await R.update(ref('players', S.pid), { name: String(S.name).slice(0, 20), updatedAt: now() });
      Online.pid = S.pid; S.friendCode = data.code; return data;
    }
  }
  // 新規作成
  const pid = rnd(16);
  let code;
  for (let i = 0; i < 5; i++) { code = friendCode(); if (!await val('codes', code)) break; }
  await R.set(ref('players', pid), { owner: Online.uid, name: String(S.name).slice(0, 20), code, createdAt: now(), updatedAt: now() });
  await R.set(ref('codes', code), { pid });
  S.pid = pid; S.friendCode = code; save();
  Online.pid = pid;
  return { name: S.name, code };
}

// ---------------- 引き継ぎ ----------------
export async function issueTransferCode() {
  await ensurePlayer();
  const S = G.save;
  if (S.transferCode) { try { await R.remove(ref('transfers', S.transferCode)); } catch (e) { /* 既に無い */ } }
  const code = rnd(4) + '-' + rnd(4) + '-' + rnd(4);
  S.transferCode = code;
  save();
  await R.set(ref('transfers', code), { pid: S.pid, save: JSON.stringify(S), at: now() });
  return code;
}
// セーブ時に引き継ぎデータも最新にする（コード発行済みのときだけ）
let lastUp = 0;
export async function syncTransferSave(force = false) {
  const S = G.save;
  if (!Online.ready || !S || !S.transferCode || !S.pid) return;
  if (!force && Date.now() - lastUp < 60000) return;
  lastUp = Date.now();
  try { await R.set(ref('transfers', S.transferCode), { pid: S.pid, save: JSON.stringify(S), at: now() }); } catch (e) { console.warn(e); }
}
export async function redeemTransferCode(code) {
  if (!await initOnline()) throw new Error(Online.error);
  code = code.trim().toUpperCase().replace(/[^0-9A-Z]/g, '');
  if (code.length !== 12) throw new Error('コードは 12文字（4文字×3）です。');
  code = code.slice(0, 4) + '-' + code.slice(4, 8) + '-' + code.slice(8);
  const t = await val('transfers', code);
  if (!t) throw new Error('引き継ぎコードが 見つかりません。');
  const data = JSON.parse(t.save);
  // アカウントの持ち主をこの端末に変更（ルールで「有効な引き継ぎコードを持つ人だけ」許可）
  await R.update(ref('players', t.pid), { owner: Online.uid, claimCode: code, updatedAt: now() });
  await R.remove(ref('transfers', code));
  try { const rk = await val('rankings', t.pid); if (rk) await R.update(ref('rankings', t.pid), { owner: Online.uid }); } catch (e) { /* */ }
  data.transferCode = null; data.pid = t.pid;
  return data;
}

// ---------------- ランキング（図鑑登録数） ----------------
//  rankings/{pid} に公開してよい成績だけを置く（セーブ本体は送らない）
const IVK = ['hp', 'atk', 'def', 'spe'];
export function profileSummary() {
  const S = G.save;
  const all = [...(S.party || []), ...(S.box || [])];
  return {
    name: String(S.name || '').slice(0, 20),
    dex: Object.keys(S.dex?.caught || {}).length,
    seen: Object.keys(S.dex?.seen || {}).length,
    shiny: all.filter(m => m.shiny).length,
    ivMax: all.filter(m => m.iv && IVK.every(k => m.iv[k] >= 15)).length,
    owned: all.length,
    crests: S.story?.crests || 0,
    clear: !!S.postGame,
    hours: Math.floor((S.playTime || 0) / 3600),
    party: (S.party || []).slice(0, 6).map(m => ({ sp: m.sp, lv: m.lv, shiny: !!m.shiny, nick: String(m.nick || '').slice(0, 12), iv: IVK.reduce((a, k) => a + (m.iv?.[k] || 0), 0) })),
  };
}
let lastRank = 0, lastRankKey = '';
export async function publishRanking(force = false) {
  const S = G.save;
  if (!Online.ready || !S || !S.pid || Online.pid !== S.pid) return;
  const p = profileSummary();
  const key = JSON.stringify(p);
  if (!force && (key === lastRankKey || Date.now() - lastRank < 90000)) return;
  lastRank = Date.now(); lastRankKey = key;
  try { await R.set(ref('rankings', S.pid), { owner: Online.uid, ...p, updatedAt: now() }); } catch (e) { console.warn(e); }
}
// 上位 n 人と自分の順位（同じ数なら同じ順位）
export async function fetchRanking(n = 50) {
  await ensurePlayer();
  await publishRanking(true);
  const snap = await R.get(R.query(ref('rankings'), R.orderByChild('dex'), R.limitToLast(n)));
  const rows = [];
  snap.forEach(c => { const v = c.val() || {}; rows.push({ pid: c.key, ...v, dex: +v.dex || 0, party: arr(v.party) }); });
  rows.sort((a, b) => (b.dex || 0) - (a.dex || 0));
  let prev = -1, rank = 0;
  rows.forEach((r, i) => { if (r.dex !== prev) { rank = i + 1; prev = r.dex; } r.rank = rank; });
  const me = profileSummary();
  let myRank = rows.find(r => r.pid === G.save.pid)?.rank || 0;
  if (!myRank) {
    try { const up = await R.get(R.query(ref('rankings'), R.orderByChild('dex'), R.startAt(me.dex + 1))); myRank = up.size + 1; } catch (e) { /* */ }
  }
  return { rows, myRank, total: rows.length < n ? rows.length : 0, me };
}
export async function fetchProfile(pid) {
  await ensurePlayer();
  const v = await val('rankings', pid);
  return v ? { pid, ...v, party: arr(v.party) } : null;
}

// ---------------- フレンド ----------------
export async function sendFriendRequest(code) {
  await ensurePlayer();
  code = code.replace(/\D/g, '');
  const c = await val('codes', code);
  if (!c) throw new Error('そのフレンドコードは 見つかりません。');
  const pid = c.pid;
  if (pid === Online.pid) throw new Error('自分のコードです。');
  await R.set(ref('requests', pid, Online.pid), { name: String(G.save.name).slice(0, 20), at: now() });
  const p = await val('players', pid);
  return p ? p.name : '';
}
export async function acceptRequest(fromPid, fromName) {
  await R.set(ref('friends', Online.pid, fromPid), { name: fromName, at: now() });
  await R.set(ref('friends', fromPid, Online.pid), { name: String(G.save.name).slice(0, 20), at: now() });
  await R.remove(ref('requests', Online.pid, fromPid));
}
export async function declineRequest(fromPid) { await R.remove(ref('requests', Online.pid, fromPid)); }
export async function removeFriend(pid) {
  await R.remove(ref('friends', Online.pid, pid));
  try { await R.remove(ref('friends', pid, Online.pid)); } catch (e) { /* */ }
}
export function watchSocial(cb) {
  stopWatch();
  const state = { friends: [], requests: [], invites: [] };
  const fire = () => cb(state);
  unsubs.push(R.onValue(ref('friends', Online.pid), s => { state.friends = list(s.val()); fire(); }, () => {}));
  unsubs.push(R.onValue(ref('requests', Online.pid), s => { state.requests = list(s.val()); fire(); }, () => {}));
  unsubs.push(R.onValue(ref('invites', Online.pid), s => { state.invites = list(s.val(), 'id').filter(i => !i.at || Date.now() - i.at < 30 * 60 * 1000); fire(); }, () => {}));
}
export function stopWatch() { while (unsubs.length) { try { unsubs.pop()(); } catch (e) { /* */ } } }

// ---------------- ルーム（トレード・対戦） ----------------
export async function createRoom(friendPid, friendName, type, settings) {
  const id = rnd(20);
  const seed = Math.floor(Math.random() * 2 ** 31);
  await R.set(ref('rooms', id), { type, host: Online.pid, guest: friendPid, hostUid: Online.uid, hostName: G.save.name, guestName: friendName, settings: settings || {}, seed, status: 'invited', createdAt: now() });
  await R.set(ref('invites', friendPid, id), { from: Online.pid, fromName: G.save.name, type, settings: settings || {}, at: now() });
  return id;
}
export async function joinRoom(id) {
  await R.update(ref('rooms', id), { guestUid: Online.uid, status: 'select' });
  try { await R.remove(ref('invites', Online.pid, id)); } catch (e) { /* */ }
}
export async function declineInvite(id) {
  try { await R.update(ref('rooms', id), { status: 'declined' }); } catch (e) { /* */ }
  try { await R.remove(ref('invites', Online.pid, id)); } catch (e) { /* */ }
}
export function watchRoom(id, cb) { return R.onValue(ref('rooms', id), s => cb(s.exists() ? s.val() : null), () => cb(null)); }
export async function updateRoom(id, data) { await R.update(ref('rooms', id), data); }
export async function closeRoom(id, status = 'done') { try { await R.update(ref('rooms', id), { status }); } catch (e) { /* */ } }

// 対戦の行動を送る・待つ
export function remoteFor(roomId, role) {
  const other = role === 'host' ? 'guest' : 'host';
  let latest = null;
  const waiters = [];
  const un = watchRoom(roomId, (r) => { latest = r; for (const w of waiters.slice()) w(); });
  return {
    async submit(phase, choices) { await R.update(ref('rooms', roomId), { [`acts/p${phase}_${role}`]: JSON.stringify(choices ?? 'none') }); },
    wait(phase) {
      return new Promise((res) => {
        const key = `p${phase}_${other}`;
        const check = () => {
          if (!latest) return;
          if (latest.status === 'abandoned') { cleanup(); res({ forfeit: true }); return; }
          const v = latest.acts && latest.acts[key];
          if (v !== undefined) { cleanup(); const p = JSON.parse(v); res(p === 'none' ? null : p); }
        };
        const cleanup = () => { const i = waiters.indexOf(check); if (i >= 0) waiters.splice(i, 1); clearTimeout(to); };
        const to = setTimeout(() => { cleanup(); res({ forfeit: true }); }, 5 * 60 * 1000);
        waiters.push(check); check();
      });
    },
    close() { un(); },
  };
}
