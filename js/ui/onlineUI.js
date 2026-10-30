// フレンド・トレード・対戦・引き継ぎの画面
import * as ON from '../online.js';
import { G, save, giveMon, registerDex } from '../game/state.js';
import { SPECIES } from '../data/species.js';
import { typeBadge } from '../data/types.js';
import { calcStats, monName, ivTotal, cloneMon, healMon } from '../game/mon.js';
import { $, el, esc, openScreen, toast, ask, confirmBox, inputText, say } from './ui.js';
import { portrait } from '../render/portrait.js';
import { pickFromAll } from './menus.js';
import { startPvpBattle } from './battleUI.js';
import { audio } from '../audio.js';
import { writeGame } from '../game/save.js';

const waitClose = (s) => new Promise(r => { s.onClose = r; });
const notReady = () => `<div class="card"><b>オンライン機能が まだ使えません</b><p class="muted">${esc(ON.Online.error || '')}</p><p class="muted">ゲームの作者の方へ：Firebase コンソールで Authentication の「匿名」ログインを有効にし、Realtime Database の「ルール」に database.rules.json の内容を貼り付けて公開してください。詳しくは README.md を参照してください。</p></div>`;

// ---------- フレンド ----------
export async function openFriends() {
  const s = openScreen('フレンド');
  s.body.innerHTML = '<p class="muted">サーバーに 接続中……</p>';
  let me;
  try { me = await ON.ensurePlayer(); } catch (e) { s.body.innerHTML = notReady() + `<p class="muted">${esc(e.message)}</p>`; await waitClose(s); return; }
  s.body.innerHTML = `
    <div class="card" style="margin-bottom:.6em"><div class="row"><div class="grow">あなたのフレンドコード：<b style="font-size:1.4em;letter-spacing:.12em;color:var(--acc)">${esc(me.code.replace(/(\d{4})(\d{4})/, '$1-$2'))}</b><div class="muted">このコードを 友だちに 教えてね</div></div><button class="btn sm copy">コピー</button></div></div>
    <div class="row" style="margin-bottom:.6em"><input class="textin grow" placeholder="友だちのフレンドコード（8けた）" inputmode="numeric" style="max-width:20em"><button class="btn pri add">申請する</button></div>
    <div class="inv"></div><div class="req"></div><h3 style="margin:.4em 0">フレンド</h3><div class="fr"><p class="muted">読み込み中…</p></div>`;
  s.body.querySelector('.copy').onclick = () => { navigator.clipboard?.writeText(me.code).then(() => toast('コピーしました')); };
  const inp = s.body.querySelector('input'); inp.onkeydown = (e) => e.stopPropagation();
  s.body.querySelector('.add').onclick = async () => {
    try { const nm = await ON.sendFriendRequest(inp.value); toast(`${nm || '相手'} に フレンド申請を 送りました！`); inp.value = ''; } catch (e) { toast(e.message); }
  };
  ON.watchSocial((st) => {
    const inv = s.body.querySelector('.inv'), req = s.body.querySelector('.req'), fr = s.body.querySelector('.fr');
    inv.innerHTML = st.invites.length ? '<h3 style="margin:.4em 0">招待が 届いています</h3>' : '';
    for (const i of st.invites) {
      const set = i.settings || {};
      const r = el('div', 'itemrow', `<div class="grow"><div class="nm">${esc(i.fromName)} から ${i.type === 'battle' ? '対戦' : 'トレード'}の 招待</div><div class="ds">${i.type === 'battle' ? `${set.format === 'double' ? 'ダブル（2対2）' : 'シングル'}・${set.count}匹・${set.lv99 ? 'レベル99固定' : 'レベルそのまま'}` : ''}</div></div>`);
      const ok = el('button', 'btn sm pri', '参加する'); ok.onclick = async () => { ON.stopWatch(); s.close(); await (i.type === 'battle' ? battleRoom(i.id, 'guest') : tradeRoom(i.id, 'guest')); };
      const ng = el('button', 'btn sm', 'ことわる'); ng.onclick = () => ON.declineInvite(i.id);
      r.append(ok, ng); inv.appendChild(r);
    }
    req.innerHTML = st.requests.length ? '<h3 style="margin:.4em 0">フレンド申請</h3>' : '';
    for (const q of st.requests) {
      const r = el('div', 'itemrow', `<div class="grow"><div class="nm">${esc(q.name)}</div><div class="ds">フレンドになりたいようです</div></div>`);
      const ok = el('button', 'btn sm pri', '承認'); ok.onclick = async () => { await ON.acceptRequest(q.pid, q.name); toast(`${q.name} と フレンドに なった！`); };
      const ng = el('button', 'btn sm', '拒否'); ng.onclick = () => ON.declineRequest(q.pid);
      r.append(ok, ng); req.appendChild(r);
    }
    fr.innerHTML = st.friends.length ? '' : '<p class="muted">まだ フレンドが いません。フレンドコードで 申請してみよう！</p>';
    for (const f of st.friends) {
      const r = el('div', 'itemrow', `<div class="grow"><div class="nm">${esc(f.name)}</div></div>`);
      const b1 = el('button', 'btn sm pri', '⚔ 対戦'); b1.onclick = async () => { const set = await battleSettings(); if (!set) return; ON.stopWatch(); s.close(); const id = await ON.createRoom(f.pid, f.name, 'battle', set); await battleRoom(id, 'host'); };
      const b2 = el('button', 'btn sm grn', '🔄 トレード'); b2.onclick = async () => { ON.stopWatch(); s.close(); const id = await ON.createRoom(f.pid, f.name, 'trade', {}); await tradeRoom(id, 'host'); };
      const b3 = el('button', 'btn sm', '削除'); b3.onclick = async () => { if (await confirmBox(`${f.name} を フレンドから 削除しますか？`)) ON.removeFriend(f.pid); };
      r.append(b1, b2, b3); fr.appendChild(r);
    }
  });
  await waitClose(s);
  ON.stopWatch();
}

async function battleSettings() {
  const f = await ask('対戦の形式は？', ['シングル（1対1）', 'ダブル（2対2）', 'やめる']); if (f === 2) return null;
  const c = await ask('何匹で 戦う？', ['3匹', '6匹', 'やめる']); if (c === 2) return null;
  const l = await ask('レベルは？', ['そのままのレベル', '全員レベル99に固定', 'やめる']); if (l === 2) return null;
  return { format: f === 1 ? 'double' : 'single', count: c === 0 ? 3 : 6, lv99: l === 1 };
}
function waitingScreen(title, text) {
  const s = openScreen(title, { noClose: true, extra: '<button class="btn sm red leave">やめる</button>' });
  s.body.innerHTML = `<div class="card" style="margin:2em auto;max-width:30em;text-align:center"><p class="st2">${esc(text)}</p><p class="muted">⏳</p></div>`;
  return s;
}
function teamPayload(mons) {
  return mons.map(m => { const c = cloneMon(m); healMon(c); return c; });
}

// ---------- 対戦ルーム ----------
async function battleRoom(id, role) {
  if (role === 'guest') await ON.joinRoom(id);
  let room = null;
  const w = waitingScreen('フレンド対戦', role === 'host' ? '相手の 参加を 待っています……' : '準備中……');
  let leave = false;
  w.head.querySelector('.leave').onclick = () => { leave = true; ON.closeRoom(id, 'abandoned'); w.close(); };
  const un = ON.watchRoom(id, (r) => { room = r; });
  const until = async (fn, ms = 10 * 60 * 1000) => { const t0 = Date.now(); while (!leave && !(room && fn(room))) { if (Date.now() - t0 > ms) return false; if (room && (room.status === 'declined' || room.status === 'abandoned')) return false; await new Promise(r => setTimeout(r, 300)); } return !leave; };
  try {
    if (!await until(r => r.status === 'select' || r.status === 'ready')) { if (!leave) { w.close(); await say(['|相手が 参加しなかったようだ……']); } return; }
    const set = room.settings;
    w.body.querySelector('.st2').textContent = `${set.format === 'double' ? 'ダブル' : 'シングル'}・${set.count}匹・${set.lv99 ? 'Lv99固定' : 'レベルそのまま'}　チームを 選んでください`;
    const all = [...G.save.party, ...G.save.box];
    const uniq = new Set(all.map(m => m.sp));
    if (uniq.size < set.count) { await say([`|${set.count}種類 以上の アニモンが 必要です。`]); ON.closeRoom(id, 'abandoned'); w.close(); return; }
    const team = await pickFromAll(`対戦に 出す ${set.count}匹を 選ぶ`, null, set.count);
    if (!team) { ON.closeRoom(id, 'abandoned'); w.close(); return; }
    await ON.updateRoom(id, { [role + 'Team']: JSON.stringify(teamPayload(team)) });
    w.body.querySelector('.st2').textContent = '相手の チーム選びを 待っています……';
    if (!await until(r => r.hostTeam && r.guestTeam)) { if (!leave) { w.close(); await say(['|対戦が 中止されました。']); } return; }
    w.onClose = null; w.close();
    const hostTeam = JSON.parse(room.hostTeam), guestTeam = JSON.parse(room.guestTeam);
    const lvo = set.lv99 ? 99 : null;
    for (const m of [...hostTeam, ...guestTeam]) { m.hp = calcStats(m, lvo).hp; registerDex(m.sp, false); }
    const mySide = role === 'host' ? 0 : 1;
    const remote = ON.remoteFor(id, role);
    const res = await startPvpBattle({
      mySide, remote, format: set.format, seed: room.seed, lvOverride: lvo, biome: 'arena',
      sides: [{ name: room.hostName, team: hostTeam, ai: role === 'host' ? 'player' : 'remote' }, { name: room.guestName, team: guestTeam, ai: role === 'guest' ? 'player' : 'remote' }],
    });
    remote.close();
    const won = res && ((res.kind === 'forfeit' && res.by !== mySide) || (res.kind !== 'forfeit' && res.winner === mySide));
    audio.playBgm('town');
    if (won) audio.jingle('victory');
    await say([won ? '|対戦に 勝った！ おめでとう！' : '|対戦に 負けてしまった…… でも いい勝負だった！', '|（フレンド対戦では アニモンの HPや経験値は 変化しません）']);
    ON.closeRoom(id, 'done');
  } finally { un(); }
}

// ---------- トレードルーム ----------
async function tradeRoom(id, role) {
  if (role === 'guest') await ON.joinRoom(id);
  const other = role === 'host' ? 'guest' : 'host';
  let room = null, myOffer = null, finished = false;
  const s = openScreen('フレンドとトレード', { noClose: true, extra: '<button class="btn sm red leave">やめる</button>' });
  const un = ON.watchRoom(id, (r) => { room = r; render(); });
  s.head.querySelector('.leave').onclick = () => { ON.closeRoom(id, 'abandoned'); un(); s.close(); };
  const card = (m) => m ? `<img class="portrait" style="width:6em;height:6em" src="${portrait(m.sp, m.shiny)}"><div><b>${m.shiny ? '✨' : ''}${esc(monName(m))}</b> Lv${m.lv}<div>${SPECIES[m.sp].types.map(typeBadge).join('')}</div><div class="muted">個体値 攻${m.iv.atk} 防${m.iv.def} 体${m.iv.hp} 速${m.iv.spe}（合計${ivTotal(m)}）</div><div class="muted">おや：${esc(m.ot || '')}</div></div>` : '<p class="muted">まだ 選ばれていません</p>';
  const render = () => {
    if (!room || finished) return;
    if (room.status === 'abandoned' || room.status === 'declined') { finished = true; un(); s.close(); say(['|トレードは 中止されました。']); return; }
    if (room.status === 'invited') { s.body.innerHTML = '<p class="muted" style="text-align:center;margin-top:2em">相手の 参加を 待っています……</p>'; return; }
    const mine = room['offer_' + role] ? JSON.parse(room['offer_' + role]) : null;
    const theirs = room['offer_' + other] ? JSON.parse(room['offer_' + other]) : null;
    s.body.innerHTML = `<div class="detail" style="grid-template-columns:1fr 1fr"><div class="card"><h3 style="margin-top:0">あなたが 出す</h3><div class="row">${card(mine)}</div><div class="row" style="margin-top:.6em"><button class="btn sel">アニモンを 選ぶ</button><button class="btn pri ok" ${mine && theirs ? '' : 'disabled'}>${room['ok_' + role] ? 'OK済み' : 'これでOK'}</button></div></div>
      <div class="card"><h3 style="margin-top:0">${esc(role === 'host' ? room.guestName : room.hostName)} が 出す</h3><div class="row">${card(theirs)}</div><p class="muted">${room['ok_' + other] ? '相手は OKしました' : ''}</p></div></div>
      <p class="muted">※ 伝説のアニモンと ルルは トレードできません。</p>`;
    s.body.querySelector('.sel').onclick = async () => {
      const m = await pickFromAll('トレードに 出す アニモン', (x) => !SPECIES[x.sp].legend && x.uid !== G.save.story.luluUid && !(G.save.party.length === 1 && G.save.party[0] === x));
      if (!m) return;
      myOffer = m;
      await ON.updateRoom(id, { ['offer_' + role]: JSON.stringify(m), ok_host: false, ok_guest: false });
    };
    s.body.querySelector('.ok').onclick = async () => { await ON.updateRoom(id, { ['ok_' + role]: true }); };
    // 両方OKで交換
    if (room.ok_host && room.ok_guest && mine && theirs && !room['done_' + role]) {
      finished = true;
      const uid = mine.uid;
      for (const arr of [G.save.party, G.save.box]) { const i = arr.findIndex(x => x.uid === uid); if (i >= 0) arr.splice(i, 1); }
      if (!G.save.party.length && G.save.box.length) G.save.party.push(G.save.box.shift());
      theirs.uid = theirs.uid + '_t' + Date.now().toString(36);
      giveMon(theirs);
      save();
      ON.updateRoom(id, { ['done_' + role]: true });
      un(); s.close();
      audio.sfx('evolve');
      if (theirs.shiny) { audio.sfx('shiny'); toast(`✨ ${monName(theirs)} が キラキラと 光っている！`, 3500); }
      say([`|${monName(mine)} と ${monName(theirs)} を 交換した！`, ...(theirs.shiny ? [`|✨ なんと 色違いの ${monName(theirs)} だ！`] : []), `|${monName(theirs)} を 大切に してあげてね！`]).then(() => ON.closeRoom(id, 'done'));
    }
  };
  await waitClose(s);
}

// ---------- データ連携（スマホ・パソコンで同じデータ）・引き継ぎ ----------
export async function openTransfer(fromTitle) {
  const s = openScreen('データ連携（スマホ・パソコン共通）・引き継ぎ');
  const synced = ON.Online.lastSync ? `（最後の同期 ${new Date(ON.Online.lastSync).toLocaleTimeString().slice(0, 5)}）` : '';
  s.body.innerHTML = `
  <div class="card linkhow" style="margin-bottom:.8em"><b>☁️ しくみ</b><p class="muted" style="margin:.3em 0 0">1つの端末で「連携コード」を発行して、もう1つの端末で入力すると、<b style="color:var(--acc)">両方の端末で 同じデータ</b>を 遊べます。セーブは 自動で クラウドに 保存され、アプリを開いたときに 新しいほうが 読み込まれます（何台でもOK）。</p>
  ${G.save && G.save.pid ? `<p style="margin:.4em 0 0">この端末のデータ：<b>${esc(G.save.name)}</b>　<span class="muted">${synced}</span> <button class="btn sm syncnow">🔄 今すぐ同期</button></p>` : ''}</div>
  <div class="card" style="margin-bottom:.8em"><h3 style="margin-top:0">📤 この端末のデータを ほかの端末でも 使う</h3><p class="muted">連携コードを 発行します。ほかの端末の タイトル画面 →「データ連携」で 入力してください。コードは 何回でも 使えます（発行しなおすと 前のコードは 使えなくなります）。</p>
  <button class="btn pri issue" ${G.save ? '' : 'disabled'}>連携コードを発行する</button>${G.save ? '' : '<p class="muted">（この端末に セーブデータが ありません）</p>'}<div class="out"></div></div>
  <div class="card"><h3 style="margin-top:0">📥 コードを入力して 連携する</h3><p class="muted">ほかの端末で 発行した 連携コードを 入力すると、その データで 遊べるようになります。以後は 自動で 同期されます。<b style="color:var(--ng)">この端末の 今のデータは 置き換わります。</b></p>
  <div class="row"><input class="textin code grow" placeholder="XXXX-XXXX-XXXX" style="max-width:16em;text-transform:uppercase" autocomplete="off" autocapitalize="characters"><button class="btn red redeem">連携する</button></div></div>`;
  const out = s.body.querySelector('.out');
  const inp = s.body.querySelector('.code'); inp.onkeydown = (e) => e.stopPropagation();
  const sn = s.body.querySelector('.syncnow');
  if (sn) sn.onclick = async () => {
    sn.disabled = true;
    try {
      const r = await ON.checkCloud();
      if (r.status === 'newer' || r.status === 'conflict') toast('☁️ ほかの端末の 新しいデータが あります。「続きから始める」で 読み込まれます');
      else if (r.status === 'same' || r.status === 'pushed') toast('☁️ 同期しました');
      else toast(r.error || '同期できませんでした');
    } catch (e) { toast(e.message); }
    sn.disabled = false;
  };
  s.body.querySelector('.issue').onclick = async () => {
    out.innerHTML = '<p class="muted">発行中……</p>';
    try {
      const code = await ON.issueTransferCode();
      out.innerHTML = `<p>連携コード：</p><p style="font-size:1.8em;font-weight:800;letter-spacing:.1em;color:var(--acc);user-select:text;-webkit-user-select:text">${esc(code)}</p><button class="btn sm copy">コピー</button><p class="muted">このコードを知っている人は あなたのデータで 遊べてしまいます。<b>他の人には 教えないでください。</b></p>`;
      out.querySelector('.copy').onclick = () => navigator.clipboard?.writeText(code).then(() => toast('コピーしました'));
    } catch (e) { out.innerHTML = notReady() + `<p class="muted">${esc(e.message)}</p>`; }
  };
  s.body.querySelector('.redeem').onclick = async () => {
    if (!inp.value.trim()) return;
    if (G.save && !await confirmBox('この端末の 今のデータは 置き換わります。よろしいですか？')) return;
    try {
      const data = await ON.redeemTransferCode(inp.value);
      writeGame(data);
      await say([`|${data.name} さんの データと 連携しました！`, '|これからは この端末と 同じデータで 遊べます（自動で 同期されます）。']);
      try { sessionStorage.setItem('animon_autocont', '1'); } catch (e) { /* */ }
      location.reload();
    } catch (e) { toast(e.message || 'エラー'); }
  };
  await waitClose(s);
}

// ---------- ランキング（図鑑登録数） ----------
const MEDAL = ['🥇', '🥈', '🥉'];
export async function openRanking() {
  const s = openScreen('ランキング', { extra: '<button class="btn sm reload">🔄 更新</button>' });
  const load = async () => {
    s.body.innerHTML = '<p class="muted">ランキングを 読み込み中……</p>';
    let R;
    try { R = window.__ANIMON_MOCK_RANK ? await window.__ANIMON_MOCK_RANK() : await ON.fetchRanking(50); } catch (e) { s.body.innerHTML = notReady() + `<p class="muted">${esc(e.message)}</p>`; return; }
    const me = R.me;
    s.body.innerHTML = `
      <div class="rankme card"><div class="rk">${R.myRank ? R.myRank + '<small>位</small>' : '―'}</div>
        <div class="grow"><div class="nm">${esc(me.name)}<span class="muted">（あなた）</span></div>
        <div class="muted">図鑑登録 <b>${me.dex}</b>匹　✨色違い ${me.shiny}　💎個体値MAX ${me.ivMax}${R.total ? `　／ 参加 ${R.total}人` : ''}</div></div></div>
      <p class="muted" style="margin:.4em 0">図鑑に登録した（なつかせた）アニモンの数で 順位が決まります。名前を押すと、その人のパーティーや記録が 見られます。</p>
      <div class="ranklist"></div>`;
    const list = s.body.querySelector('.ranklist');
    if (!R.rows.length) list.innerHTML = '<p class="muted">まだ だれも 登録されていません。</p>';
    const top = Math.max(1, R.rows[0]?.dex || 1);
    for (const r of R.rows) {
      const mine = r.pid === G.save.pid;
      const row = el('button', 'rankrow' + (mine ? ' mine' : '') + (r.rank <= 3 ? ' top' + r.rank : ''), `
        <div class="rk">${r.rank <= 3 ? MEDAL[r.rank - 1] : r.rank}</div>
        <img class="lead" src="">
        <div class="grow"><div class="nm">${esc(r.name || '???')}${r.clear ? ' <span class="clr">★</span>' : ''}</div>
          <div class="bar"><i style="width:${Math.round(r.dex / top * 100)}%"></i></div></div>
        <div class="num"><b>${r.dex}</b><small>匹</small></div>`);
      const lead = r.party && r.party[0];
      const img = row.querySelector('img');
      if (lead && SPECIES[lead.sp]) portraitAsyncSafe(lead.sp, lead.shiny, img); else img.style.visibility = 'hidden';
      row.onclick = () => { audio.sfx('select'); openProfile(r); };
      list.appendChild(row);
    }
  };
  s.head.querySelector('.reload').onclick = () => { audio.sfx('select'); load(); };
  await load();
  await waitClose(s);
}
function portraitAsyncSafe(sp, shiny, img) {
  import('../render/portrait.js').then(m => m.portraitAsync(sp, shiny, false, (url) => { img.src = url; }));
}
// プレイヤーの記録（パーティー・色違い・個体値MAX・図鑑）
async function openProfile(r) {
  const s = openScreen(`${r.name || '???'} の 記録`);
  const party = (r.party || []).filter(m => SPECIES[m.sp]);
  s.body.innerHTML = `
    <div class="profstats">
      <div class="st"><div class="v">${r.rank ? r.rank + '<small>位</small>' : '―'}</div><div class="k">順位</div></div>
      <div class="st"><div class="v">${r.dex}<small>/200</small></div><div class="k">📖 図鑑登録数</div></div>
      <div class="st"><div class="v">${r.shiny ?? 0}</div><div class="k">✨ 色違い 獲得数</div></div>
      <div class="st"><div class="v">${r.ivMax ?? 0}</div><div class="k">💎 個体値MAX 所持数</div></div>
      <div class="st"><div class="v">${r.seen ?? '―'}</div><div class="k">👀 見つけた数</div></div>
      <div class="st"><div class="v">${r.crests ?? 0}<small>/8</small></div><div class="k">🏅 紋章</div></div>
    </div>
    <p class="muted" style="margin:.3em 0 .5em">${r.clear ? '★ ストーリークリア済み　' : ''}${r.owned != null ? `持っているアニモン ${r.owned}匹　` : ''}${r.hours != null ? `プレイ時間 ${r.hours}時間以上` : ''}</p>
    <h3 style="margin:.2em 0 .4em">パーティー編成</h3>
    <div class="profparty">${party.length ? '' : '<p class="muted">パーティーの情報が ありません</p>'}</div>`;
  const pp = s.body.querySelector('.profparty');
  for (const m of party) {
    const sp = SPECIES[m.sp];
    const c = el('div', 'pcard' + (m.shiny ? ' shiny' : ''), `<img src="">
      <div class="nm">${m.shiny ? '<span class="shiny">✨</span>' : ''}${esc(m.nick || sp.name)}</div>
      <div class="muted">${m.nick ? esc(sp.name) + '　' : ''}Lv${m.lv}</div>
      <div>${sp.types.map(typeBadge).join('')}</div>
      <div class="ivbar" title="個体値の合計"><i style="width:${Math.round((m.iv || 0) / 60 * 100)}%"></i><span>個体値 ${m.iv ?? '?'}/60${m.iv >= 60 ? ' 💎MAX' : ''}</span></div>`);
    portraitAsyncSafe(m.sp, m.shiny, c.querySelector('img'));
    pp.appendChild(c);
  }
  await waitClose(s);
}
