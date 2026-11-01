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
//   saves/{pid}              セーブデータ（連携したすべての端末で共有・自動同期）
//   transfers/{連携コード}     → { pid }（ほかの端末をこのデータに連携するためのコード）
//   rankings/{pid}           ランキング用の公開成績
//   worlds/{ホストpid}         フレンドと 同じワールドで あそぶ（meta と members/{pid} に 位置など）
//
//  1つのデータ（pid）に 複数の端末（匿名ログインの uid）を登録できる：players/{pid}/devices/{uid} = true
// =============================================================
import { firebaseConfig, FIREBASE_SDK_VERSION, firebaseReady } from './firebase-config.js';
import { G, save } from './game/state.js';
import { writeGame } from './game/save.js';
import { STEPS } from './data/story.js';

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
    app = mApp.getApps().find(a => a.name === '[DEFAULT]') || mApp.initializeApp(firebaseConfig);
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

const isMember = (p) => !!p && (p.owner === Online.uid || !!(p.devices && p.devices[Online.uid]));
// プレイヤー登録（この端末のセーブに pid とフレンドコードを持たせる）
//  fork: この端末がそのデータに連携されていないとき、新しいデータとして登録しなおす
export async function ensurePlayer(opts = {}) {
  if (!await initOnline()) throw new Error(Online.error);
  const S = G.save;
  if (S.pid) {
    const data = await val('players', S.pid);
    if (data && isMember(data)) {
      const up = {};
      if (data.name !== S.name) { up.name = String(S.name).slice(0, 20); up.updatedAt = now(); }
      if (!data.devices || !data.devices[Online.uid]) up['devices/' + Online.uid] = true;
      if (Object.keys(up).length) await R.update(ref('players', S.pid), up);
      Online.pid = S.pid; S.friendCode = data.code; return data;
    }
    if (data && !opts.fork) { const e = new Error('この端末は このデータに 連携されていません。ほかの端末で「データ連携コード」を発行して 入力してください。'); e.unlinked = true; throw e; }
  }
  // 新規作成
  const pid = rnd(16);
  let code;
  for (let i = 0; i < 5; i++) { code = friendCode(); if (!await val('codes', code)) break; }
  await R.set(ref('players', pid), { owner: Online.uid, name: String(S.name).slice(0, 20), code, devices: { [Online.uid]: true }, createdAt: now(), updatedAt: now() });
  await R.set(ref('codes', code), { pid });
  S.pid = pid; S.friendCode = code; S.cloudRev = 0; S.cloudDirty = true; save();
  Online.pid = pid;
  return { name: S.name, code };
}

// ---------------- データ連携（スマホ・パソコンで同じデータ）と クラウドセーブ ----------------
//  ・連携コードを発行した端末と、コードを入力した端末は、同じセーブデータを共有する
//  ・セーブするたびにクラウド（saves/{pid}）へ送り、起動時・アプリに戻ったときに新しい方を読み込む
//  ・rev（版の番号）で「どちらが新しいか」を判断。両方で別々に進めたときは どちらを使うか選んでもらう
const dexOf = (S) => Object.keys(S?.dex?.caught || {}).length;
// 「進み具合」の指紋：歩いた位置やプレイ時間だけの違いは 変更とみなさない
const VOLATILE = new Set(['saved', 'playTime', 'pos', 'ry', 'cloudRev', 'cloudDirty', 'cloudHash', 'transferCode', 'friendCode']);
export function progressHash(S) {
  const str = JSON.stringify(S, (k, v) => (VOLATILE.has(k) ? undefined : v));
  let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(36) + ':' + str.length;
}
const changedSinceSync = (S) => !!S.cloudDirty && progressHash(S) !== S.cloudHash;
export function cloudSummary(S) { return { playTime: S.playTime || 0, dex: dexOf(S), crests: S.story?.crests || 0, name: S.name, saved: S.saved || 0 }; }
let pushing = false, pushAgain = false, pushTimer = null, lastPush = 0, saveSeq = 0;
// セーブのたびに呼ばれる：少しまとめてから送る
export function scheduleCloudSave() {
  saveSeq++;
  if (!Online.ready || !G.save?.pid || Online.pid !== G.save.pid) return;
  clearTimeout(pushTimer);
  pushTimer = setTimeout(() => pushSave(), Math.max(1500, 12000 - (Date.now() - lastPush)));
}
export async function pushSave(force = false) {
  const S = G.save;
  if (!S || !S.pid) return false;
  if (!Online.ready) { if (!force || !isConfigured()) return false; try { await ensurePlayer(); } catch (e) { return false; } }
  if (Online.pid !== S.pid) return false;
  if (pushing) { pushAgain = true; return false; }
  pushing = true; clearTimeout(pushTimer);
  const prevRev = S.cloudRev || 0, prevDirty = S.cloudDirty, prevHash = S.cloudHash, seq = saveSeq;
  try {
    const cur = (await val('saves', S.pid, 'rev')) || 0;
    if (cur > prevRev) {
      // ほかの端末が先に新しいデータを送っている → 上書きせずに知らせる
      Online.conflict = true;
      if (Online.onConflict) Online.onConflict();
      return false;
    }
    const rev = cur + 1;
    S.cloudRev = rev; S.cloudDirty = false; S.cloudHash = progressHash(S);
    const sum = cloudSummary(S);
    await R.set(ref('saves', S.pid), { data: JSON.stringify(S), rev, at: now(), by: Online.uid, ...sum });
    lastPush = Date.now();
    if (seq !== saveSeq) S.cloudDirty = true;
    writeGame(S);
    Online.lastSync = Date.now();
    return true;
  } catch (e) {
    console.warn(e); S.cloudRev = prevRev; S.cloudDirty = prevDirty || true; S.cloudHash = prevHash; return false;
  } finally {
    pushing = false;
    if (pushAgain) { pushAgain = false; scheduleCloudSave(); }
  }
}
// クラウドの状態を調べる
//  返り値 status: 'off'（未設定・未連携） / 'same' / 'pushed'（こちらが新しかったので送った） / 'newer'（クラウドが新しい→data） / 'conflict'（両方で進めた→data） / 'unlinked' / 'error'
export async function checkCloud(local) {
  const S = local || G.save;
  if (!S || !S.pid || !isConfigured()) return { status: 'off' };
  const keep = G.save; G.save = S;
  try {
    await ensurePlayer();
    const rev = (await val('saves', S.pid, 'rev')) || 0;
    const mine = S.cloudRev || 0;
    if (rev <= mine) {
      if (S.cloudDirty || rev < mine || !rev) { S.cloudRev = rev; await pushSave(true); return { status: 'pushed' }; }
      return { status: 'same' };
    }
    const rec = await val('saves', S.pid);
    const data = JSON.parse(rec.data);
    data.cloudRev = rec.rev; data.cloudDirty = false; data.pid = S.pid; data.cloudHash = progressHash(data);
    return { status: changedSinceSync(S) ? 'conflict' : 'newer', data, rec };
  } catch (e) {
    console.warn(e);
    return { status: e.unlinked ? 'unlinked' : 'error', error: e.message };
  } finally { G.save = keep || G.save; }
}
// 衝突したとき「この端末のデータを使う」：クラウドを上書きする
export async function forceUseLocal(S) {
  const rev = (await val('saves', S.pid, 'rev')) || 0;
  S.cloudRev = rev; S.cloudDirty = true;
  const keep = G.save; G.save = S;
  try { return await pushSave(true); } finally { G.save = keep || S; }
}

// 連携コードの発行（何回でも使える。発行しなおすと前のコードは無効）
export async function issueTransferCode() {
  await ensurePlayer({ fork: true });
  const S = G.save;
  // いちばん新しいデータをクラウドに置いてから
  const st = await checkCloud(S);
  if (st.status === 'newer' || st.status === 'conflict') await forceUseLocal(S);
  else await pushSave(true);
  if (S.transferCode) { try { await R.remove(ref('transfers', S.transferCode)); } catch (e) { /* 既に無い */ } }
  const code = rnd(4) + '-' + rnd(4) + '-' + rnd(4);
  S.transferCode = code;
  writeGame(S);
  await R.set(ref('transfers', code), { pid: S.pid, at: now() });
  return code;
}
// 昔の版との互換（セーブ時の呼び出し）
export async function syncTransferSave(force = false) { if (force) return pushSave(true); scheduleCloudSave(); }
// コードを入力して連携：この端末をそのデータの端末として登録し、クラウドのセーブを読み込む
export async function redeemTransferCode(code) {
  if (!await initOnline()) throw new Error(Online.error);
  code = code.trim().toUpperCase().replace(/[^0-9A-Z]/g, '');
  if (code.length !== 12) throw new Error('コードは 12文字（4文字×3）です。');
  code = code.slice(0, 4) + '-' + code.slice(4, 8) + '-' + code.slice(8);
  const t = await val('transfers', code);
  if (!t) throw new Error('連携コードが 見つかりません。（発行しなおした場合は 新しいコードを 入力してください）');
  await R.update(ref('players', t.pid), { ['devices/' + Online.uid]: true, claimCode: code, updatedAt: now() });
  const rec = await val('saves', t.pid);
  let data;
  if (rec && rec.data) { data = JSON.parse(rec.data); data.cloudRev = rec.rev; }
  else if (t.save) { data = JSON.parse(t.save); data.cloudRev = 0; }   // 古い版で発行したコード
  else throw new Error('クラウドに セーブデータが ありません。発行した端末で 一度セーブしてください。');
  data.pid = t.pid; data.cloudDirty = false; data.transferCode = null; data.cloudHash = progressHash(data);
  Online.pid = t.pid;
  return data;
}

// ---------------- アカウント削除 ----------------
//  サーバーに ある この人の データを すべて 消す（ランキング・フレンド・連携コード・クラウドセーブ・プレイヤー登録）
//  ルール（database.rules.json）が「players/{pid} の 持ち主・連携した端末」を 見て 判断するので、players は 最後に 消す
export async function deleteAccount() {
  const S = G.save;
  if (!S || !S.pid) return true;
  await ensurePlayer();          // この端末が その データの 持ち主（連携ずみ）か 確かめる（ちがうと e.unlinked）
  const pid = S.pid;
  const tryRm = async (...p) => { try { await R.remove(ref(...p)); } catch (e) { console.warn('remove', p.join('/'), e); } };
  try { await leaveWorld(); } catch (e) { /* */ }
  try { await R.remove(wref(pid, 'members')); } catch (e) { /* */ }
  try { await R.remove(wref(pid, 'meta')); } catch (e) { /* */ }
  const fr = (await val('friends', pid)) || {};
  for (const f of Object.keys(fr)) { await tryRm('friends', f, pid); await tryRm('friends', pid, f); }
  for (const k of Object.keys((await val('requests', pid)) || {})) await tryRm('requests', pid, k);
  for (const k of Object.keys((await val('invites', pid)) || {})) await tryRm('invites', pid, k);
  // ランキング（これは 必ず 消す：失敗したら エラー）
  await R.remove(ref('rankings', pid));
  if (S.transferCode) await tryRm('transfers', S.transferCode);
  await R.remove(ref('saves', pid));
  const p = await val('players', pid);
  if (p && p.code) await tryRm('codes', p.code);
  await R.remove(ref('players', pid));
  stopWatch();
  Online.pid = null;
  S.pid = null; S.transferCode = null; S.friendCode = null;
  return true;
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
    // ストーリーの 進み具合（第何章か。12 = クリア）
    ch: S.postGame ? 12 : (STEPS[Math.min(S.story?.step || 0, STEPS.length - 1)]?.ch || 1),
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

// ---------------- いっしょのワールド（フレンドと 同じ大陸を 歩く） ----------------
//  worlds/{hostPid}/meta            = { host, hostName, open, at }
//  worlds/{hostPid}/members/{pid}   = { name, look, x, z, ry, st, mode, ride, lead, shiny, dg, t, emo, emoAt }
//  ・ホストが ワールドを ひらいて フレンドを 招待 → フレンドが 参加
//  ・それぞれの セーブデータ（ストーリー・アニモン）は そのまま。おたがいの すがたが 見える
export const World = { host: null, hostName: '', members: {}, open: false, unsubs: [], onChange: null, onClosed: null };
const wref = (...p) => ref('worlds', ...p);
function worldUnsub() { while (World.unsubs.length) { try { World.unsubs.pop()(); } catch (e) { /* */ } } }
export function inWorld() { return !!World.host; }
export async function hostWorld() {
  await ensurePlayer();
  if (World.host === Online.pid) return;
  if (World.host) await leaveWorld();
  await R.set(wref(Online.pid, 'meta'), { host: Online.pid, hostName: String(G.save.name).slice(0, 20), open: true, at: now() });
  await enterWorld(Online.pid, G.save.name);
}
export async function inviteToWorld(friendPid) {
  if (!World.host) await hostWorld();
  await R.set(ref('invites', friendPid, 'w_' + World.host), { from: Online.pid, fromName: String(G.save.name).slice(0, 20), type: 'world', world: World.host, worldName: World.hostName, at: now() });
}
export async function joinWorld(hostPid) {
  await ensurePlayer();
  try { await R.remove(ref('invites', Online.pid, 'w_' + hostPid)); } catch (e) { /* */ }
  const meta = await val('worlds', hostPid, 'meta');
  if (!meta || !meta.open) throw new Error('その ワールドは もう 閉じられています。');
  if (World.host && World.host !== hostPid) await leaveWorld();
  await enterWorld(hostPid, meta.hostName || '');
}
async function enterWorld(hostPid, hostName) {
  worldUnsub();
  World.host = hostPid; World.hostName = hostName; World.members = {}; World.open = true;
  const me = wref(hostPid, 'members', Online.pid);
  await R.set(me, { name: String(G.save.name).slice(0, 20), look: G.save.look || {}, x: 0, z: 0, ry: 0, st: 'idle', mode: 'walk', t: now() });
  // 通信が 切れたら 自動で 退出（本物の Firebase のみ）
  try { if (R.onDisconnect) R.onDisconnect(me).remove(); } catch (e) { /* */ }
  World.unsubs.push(R.onValue(wref(hostPid, 'members'), (snap) => { World.members = snap.val() || {}; World.onChange && World.onChange(); }, () => {}));
  World.unsubs.push(R.onValue(wref(hostPid, 'meta'), (snap) => {
    const m = snap.val();
    if (World.host === hostPid && (!m || !m.open) && hostPid !== Online.pid) { const nm = World.hostName; worldUnsub(); World.host = null; World.members = {}; World.onClosed && World.onClosed(nm); }
  }, () => {}));
  World.onChange && World.onChange();
}
export async function publishWorld(data) {
  if (!World.host || !R) return;
  try { await R.update(wref(World.host, 'members', Online.pid), { ...data, t: now() }); } catch (e) { /* */ }
}
export async function leaveWorld() {
  if (!World.host) return;
  const host = World.host;
  worldUnsub();
  World.host = null; World.members = {};
  try { await R.remove(wref(host, 'members', Online.pid)); } catch (e) { /* */ }
  if (host === Online.pid) { try { await R.set(wref(host, 'meta'), { host, hostName: String(G.save.name).slice(0, 20), open: false, at: now() }); await R.remove(wref(host, 'members')); } catch (e) { /* */ } }
  World.onChange && World.onChange();
}
// 招待（対戦・トレード・ワールド）を ゲーム中 いつでも 受け取る
let invUn = null;
export function watchInvitesAlways(cb) {
  if (invUn) { try { invUn(); } catch (e) { /* */ } }
  invUn = R.onValue(ref('invites', Online.pid), s => cb(list(s.val(), 'id').filter(i => !i.at || Date.now() - i.at < 30 * 60 * 1000)), () => {});
  return invUn;
}
export async function declineWorldInvite(id) { try { await R.remove(ref('invites', Online.pid, id)); } catch (e) { /* */ } }
