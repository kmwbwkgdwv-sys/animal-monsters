// =============================================================
//  オンライン機能（Firebase Authentication + Cloud Firestore）
//   ・匿名ログイン
//   ・フレンド（フレンドコードで申請 → 承認）
//   ・トレード / 対戦（rooms コレクションでリアルタイム同期）
//   ・引き継ぎコードの発行・アカウント引き継ぎ
// =============================================================
import { firebaseConfig, FIREBASE_SDK_VERSION, firebaseReady } from './firebase-config.js';
import { G, save } from './game/state.js';

let A = null, F = null, app = null, auth = null, db = null;
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
    const [mApp, mAuth, mFs] = await Promise.all([import(`${base}/firebase-app.js`), import(`${base}/firebase-auth.js`), import(`${base}/firebase-firestore.js`)]);
    A = mAuth; F = mFs;
    app = mApp.getApps().length ? mApp.getApp() : mApp.initializeApp(firebaseConfig);
    auth = A.getAuth(app);
    db = F.getFirestore(app);
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

const d = (...p) => F.doc(db, ...p);
const col = (...p) => F.collection(db, ...p);

// プレイヤー登録（この端末のセーブに pid とフレンドコードを持たせる）
export async function ensurePlayer() {
  if (!await initOnline()) throw new Error(Online.error);
  const S = G.save;
  if (S.pid) {
    const snap = await F.getDoc(d('players', S.pid));
    if (snap.exists()) {
      const data = snap.data();
      if (data.owner !== Online.uid) throw new Error('このデータは 別の端末に 引き継がれています。');
      if (data.name !== S.name) await F.updateDoc(d('players', S.pid), { name: S.name, updatedAt: F.serverTimestamp() });
      Online.pid = S.pid; S.friendCode = data.code; return data;
    }
  }
  // 新規作成
  const pid = rnd(16);
  let code;
  for (let i = 0; i < 5; i++) { code = friendCode(); const c = await F.getDoc(d('codes', code)); if (!c.exists()) break; }
  await F.setDoc(d('players', pid), { owner: Online.uid, name: S.name, code, createdAt: F.serverTimestamp(), updatedAt: F.serverTimestamp() });
  await F.setDoc(d('codes', code), { pid });
  S.pid = pid; S.friendCode = code; save();
  Online.pid = pid;
  return { name: S.name, code };
}

// ---------------- 引き継ぎ ----------------
export async function issueTransferCode() {
  await ensurePlayer();
  const S = G.save;
  if (S.transferCode) { try { await F.deleteDoc(d('transfers', S.transferCode)); } catch (e) { /* 既に無い */ } }
  const code = rnd(4) + '-' + rnd(4) + '-' + rnd(4);
  S.transferCode = code;
  save();
  await F.setDoc(d('transfers', code), { pid: S.pid, save: JSON.stringify(S), at: F.serverTimestamp() });
  return code;
}
// セーブ時に引き継ぎデータも最新にする（コード発行済みのときだけ）
let lastUp = 0;
export async function syncTransferSave(force = false) {
  const S = G.save;
  if (!Online.ready || !S || !S.transferCode || !S.pid) return;
  if (!force && Date.now() - lastUp < 60000) return;
  lastUp = Date.now();
  try { await F.setDoc(d('transfers', S.transferCode), { pid: S.pid, save: JSON.stringify(S), at: F.serverTimestamp() }); } catch (e) { console.warn(e); }
}
export async function redeemTransferCode(code) {
  if (!await initOnline()) throw new Error(Online.error);
  code = code.trim().toUpperCase().replace(/[^0-9A-Z]/g, '');
  if (code.length !== 12) throw new Error('コードは 12文字（4文字×3）です。');
  code = code.slice(0, 4) + '-' + code.slice(4, 8) + '-' + code.slice(8);
  const snap = await F.getDoc(d('transfers', code));
  if (!snap.exists()) throw new Error('引き継ぎコードが 見つかりません。');
  const t = snap.data();
  const data = JSON.parse(t.save);
  // アカウントの持ち主をこの端末に変更
  await F.updateDoc(d('players', t.pid), { owner: Online.uid, claimCode: code, updatedAt: F.serverTimestamp() });
  await F.deleteDoc(d('transfers', code));
  data.transferCode = null; data.pid = t.pid;
  return data;
}

// ---------------- フレンド ----------------
export async function sendFriendRequest(code) {
  await ensurePlayer();
  code = code.replace(/\D/g, '');
  const c = await F.getDoc(d('codes', code));
  if (!c.exists()) throw new Error('そのフレンドコードは 見つかりません。');
  const pid = c.data().pid;
  if (pid === Online.pid) throw new Error('自分のコードです。');
  await F.setDoc(d('players', pid, 'requests', Online.pid), { name: G.save.name, at: F.serverTimestamp() });
  const p = await F.getDoc(d('players', pid));
  return p.exists() ? p.data().name : '';
}
export async function acceptRequest(fromPid, fromName) {
  await F.setDoc(d('players', Online.pid, 'friends', fromPid), { name: fromName, at: F.serverTimestamp() });
  await F.setDoc(d('players', fromPid, 'friends', Online.pid), { name: G.save.name, at: F.serverTimestamp() });
  await F.deleteDoc(d('players', Online.pid, 'requests', fromPid));
}
export async function declineRequest(fromPid) { await F.deleteDoc(d('players', Online.pid, 'requests', fromPid)); }
export async function removeFriend(pid) {
  await F.deleteDoc(d('players', Online.pid, 'friends', pid));
  try { await F.deleteDoc(d('players', pid, 'friends', Online.pid)); } catch (e) { /* */ }
}
export function watchSocial(cb) {
  stopWatch();
  const state = { friends: [], requests: [], invites: [] };
  const fire = () => cb(state);
  unsubs.push(F.onSnapshot(col('players', Online.pid, 'friends'), s => { state.friends = s.docs.map(x => ({ pid: x.id, ...x.data() })); fire(); }));
  unsubs.push(F.onSnapshot(col('players', Online.pid, 'requests'), s => { state.requests = s.docs.map(x => ({ pid: x.id, ...x.data() })); fire(); }));
  unsubs.push(F.onSnapshot(col('players', Online.pid, 'invites'), s => { state.invites = s.docs.map(x => ({ id: x.id, ...x.data() })).filter(i => !i.at || Date.now() - (i.at.toMillis ? i.at.toMillis() : 0) < 30 * 60 * 1000); fire(); }));
}
export function stopWatch() { while (unsubs.length) { try { unsubs.pop()(); } catch (e) { /* */ } } }

// ---------------- ルーム（トレード・対戦） ----------------
export async function createRoom(friendPid, friendName, type, settings) {
  const id = rnd(20);
  const seed = Math.floor(Math.random() * 2 ** 31);
  await F.setDoc(d('rooms', id), { type, host: Online.pid, guest: friendPid, hostUid: Online.uid, guestUid: null, hostName: G.save.name, guestName: friendName, settings: settings || {}, seed, status: 'invited', acts: {}, createdAt: F.serverTimestamp() });
  await F.setDoc(d('players', friendPid, 'invites', id), { from: Online.pid, fromName: G.save.name, type, settings: settings || {}, at: F.serverTimestamp() });
  return id;
}
export async function joinRoom(id) {
  await F.updateDoc(d('rooms', id), { guestUid: Online.uid, status: 'select' });
  try { await F.deleteDoc(d('players', Online.pid, 'invites', id)); } catch (e) { /* */ }
}
export async function declineInvite(id) {
  try { await F.updateDoc(d('rooms', id), { status: 'declined' }); } catch (e) { /* */ }
  try { await F.deleteDoc(d('players', Online.pid, 'invites', id)); } catch (e) { /* */ }
}
export function watchRoom(id, cb) { return F.onSnapshot(d('rooms', id), s => cb(s.exists() ? s.data() : null)); }
export async function updateRoom(id, data) { await F.updateDoc(d('rooms', id), data); }
export async function closeRoom(id, status = 'done') { try { await F.updateDoc(d('rooms', id), { status }); } catch (e) { /* */ } }

// 対戦の行動を送る・待つ
export function remoteFor(roomId, role) {
  const other = role === 'host' ? 'guest' : 'host';
  let latest = null;
  const waiters = [];
  const un = watchRoom(roomId, (r) => { latest = r; for (const w of waiters.slice()) w(); });
  return {
    async submit(phase, choices) { await F.updateDoc(d('rooms', roomId), { [`acts.p${phase}_${role}`]: JSON.stringify(choices ?? 'none') }); },
    wait(phase) {
      return new Promise((res, rej) => {
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
