// =============================================================
//  キャラメイク（主人公の 見た目）
//   ・はじめるとき（なまえ＋見た目）と、ゲーム中 いつでも（メニュー →「👕 キャラメイク」）
//   ・からだ／かみ／ふく／こもの の タブで、色は パレットから、形は ボタンから えらぶ
// =============================================================
import { G, save } from '../game/state.js';
import { HumanPreview } from '../render/portrait.js';
import { defaultLook, SKIN, HAIR_COL, CLOTH, HAIR_STYLES, HAIR_JA, HATS, HAT_JA, BOTTOMS, BOTTOM_JA, TOPS, TOP_JA, ACCS, ACC_JA, BAGS, BAG_JA, EYE_COL, HEIGHT_JA } from '../render/models.js';
import { $, el, esc, openScreen, toast, confirmBox, UI } from './ui.js';
import { audio } from '../audio.js';

// [ラベル, キー, 種類, 候補, 表示]
const idx = (arr) => arr.map((c, i) => i);
const TABS = {
  body: ['からだ', [
    ['肌の色', 'skin', 'color', idx(SKIN), (v) => SKIN[v]],
    ['身長', 'height', 'chip', [0, 1, 2], (v) => HEIGHT_JA[v]],
    ['目の色', 'eyeCol', 'color', idx(EYE_COL), (v) => EYE_COL[v] || 'auto'],
  ]],
  hair: ['かみ', [
    ['髪型', 'hair', 'chip', HAIR_STYLES, (v) => HAIR_JA[v]],
    ['髪の色', 'hairCol', 'color', idx(HAIR_COL), (v) => HAIR_COL[v]],
  ]],
  wear: ['ふく', [
    ['上の服', 'top', 'chip', TOPS, (v) => TOP_JA[v]],
    ['服の色', 'shirt', 'color', idx(CLOTH), (v) => CLOTH[v]],
    ['服の色2', 'subCol', 'color', idx(CLOTH), (v) => CLOTH[v], 'しましま・中のシャツ・フード・えり・マフラー・ポシェットの色'],
    ['下', 'bottom', 'chip', BOTTOMS, (v) => BOTTOM_JA[v]],
    ['下の色', 'pants', 'color', idx(CLOTH), (v) => CLOTH[v]],
    ['くつの色', 'shoes', 'color', idx(CLOTH), (v) => CLOTH[v]],
  ]],
  goods: ['こもの', [
    ['ぼうし・髪かざり', 'hat', 'chip', HATS, (v) => HAT_JA[v]],
    ['ぼうしの色', 'hatCol', 'color', idx(CLOTH), (v) => CLOTH[v]],
    ['アクセサリー', 'acc', 'chip', ACCS, (v) => ACC_JA[v]],
    ['かばん', 'bag', 'chip', BAGS, (v) => BAG_JA[v]],
  ]],
};
const ALL = Object.values(TABS).flatMap(t => t[1]);
// 古い データ（新しい 項目が ない）も ふつうの 値で そろえる
export function fullLook(look) { return { ...defaultLook(), ...(look || {}) }; }
function randomize(look) {
  const r = Math.random;
  for (const [, key, , vals] of ALL) look[key] = vals[Math.floor(r() * vals.length)];
  // 小物は ひかえめに
  if (r() < 0.5) look.hat = 'none';
  if (r() < 0.6) look.acc = 'none';
  if (r() < 0.6) look.top = 'tee';
  if (r() < 0.5) look.eyeCol = 0;
  look.height = r() < 0.6 ? 1 : look.height;
}

// opts: { isNew, look, name }  →  { name, look } または null（やめる）
export function openCharaMake(opts = {}) {
  return new Promise(res => {
    const look = fullLook(opts.look);
    const before = JSON.stringify(look), name0 = opts.name || '';
    const s = openScreen(opts.isNew ? '主人公を つくろう' : '👕 キャラメイク（見た目を かえる）', { noClose: true, cls: 'cmscr' });
    s.body.innerHTML = `<div class="cm"><div class="cmprev"><canvas></canvas><div class="cmturn"><button class="btn sm tl">↺</button><button class="btn sm tr">↻</button></div></div>
      <div class="cmside">
        <div class="opt cmname"><label>なまえ</label><input class="textin name" maxlength="8" placeholder="なまえ（8文字まで）" value="${esc(name0)}"></div>
        <div class="tabs cmtabs">${Object.entries(TABS).map(([k, t], i) => `<button class="tab ${i ? '' : 'on'}" data-k="${k}">${t[0]}</button>`).join('')}</div>
        <div class="cmopts"></div>
        <div class="row actions cmact"><button class="btn rnd">🎲 おまかせ</button>${opts.isNew ? '' : '<button class="btn back">やめる</button>'}<button class="btn pri go">${opts.isNew ? 'この姿で はじめる！' : '✔ これに きめる'}</button></div>
      </div></div>`;
    const prev = new HumanPreview(s.body.querySelector('canvas'));
    s.body.querySelector('.tl').onclick = () => { prev.yaw -= Math.PI / 2; };
    s.body.querySelector('.tr').onclick = () => { prev.yaw += Math.PI / 2; };
    let tab = 'body';
    const box = s.body.querySelector('.cmopts');
    const render = () => {
      box.innerHTML = '';
      for (const [lab, key, kind, vals, fmt, hint] of TABS[tab][1]) {
        const row = el('div', 'cmrow', `<div class="cmlab">${lab}${hint ? `<small>${esc(hint)}</small>` : ''}</div><div class="cmvals ${kind}"></div>`);
        const wrap = row.querySelector('.cmvals');
        for (const v of vals) {
          const on = look[key] === v;
          const shown = fmt(v);
          const b = el('button', kind === 'color' ? 'cmsw' + (on ? ' on' : '') : 'cmchip' + (on ? ' on' : ''), kind === 'color' ? (shown === 'auto' ? '<span>髪と<br>同じ</span>' : '') : esc(shown));
          if (kind === 'color' && shown !== 'auto') b.style.background = shown;
          if (kind === 'color') b.title = shown === 'auto' ? '髪の色に あわせる' : shown;
          b.onclick = () => { look[key] = v; audio.sfx('select'); prev.setLook(look); render(); };
          wrap.appendChild(b);
        }
        box.appendChild(row);
      }
    };
    s.body.querySelectorAll('.cmtabs .tab').forEach(b => b.onclick = () => { tab = b.dataset.k; s.body.querySelectorAll('.cmtabs .tab').forEach(x => x.classList.toggle('on', x === b)); audio.sfx('select'); render(); box.scrollTop = 0; });
    render(); prev.setLook(look);
    const nameIn = s.body.querySelector('.name');
    nameIn.onkeydown = (e) => e.stopPropagation();
    s.body.querySelector('.rnd').onclick = () => { randomize(look); audio.sfx('select'); prev.setLook(look); render(); };
    const finish = (v) => { prev.dispose(); s.close(); res(v); };
    const back = s.body.querySelector('.back');
    if (back) back.onclick = async () => {
      if ((JSON.stringify(look) !== before || nameIn.value.trim() !== name0) && !(await confirmBox('変えた ところは 保存されません。やめますか？', 'やめる', 'つづける'))) return;
      audio.sfx('cancel'); finish(null);
    };
    s.body.querySelector('.go').onclick = async () => {
      const nm = nameIn.value.trim();
      if (!nm) { toast('なまえを 入れてね'); nameIn.focus(); return; }
      audio.sfx('select');
      if (opts.isNew && !await confirmBox(`「${nm}」で 冒険を はじめますか？`)) return;
      finish({ name: nm, look: { ...look } });
    };
  });
}

// ゲーム中に 見た目を かえる（メニューから）
export async function charaMakeInGame() {
  const r = await openCharaMake({ isNew: false, look: G.save.look, name: G.save.name });
  if (!r) return false;
  const renamed = r.name !== G.save.name;
  G.save.look = r.look;
  if (renamed) { G.save.name = r.name; UI.vars.P = r.name; }
  const ov = await import('../game/overworld.js');
  ov.applyPlayerLook();
  save();
  // オンライン（いっしょのワールド・ランキング）にも 反映
  try {
    const ON = await import('../online.js');
    if (ON.inWorld()) ON.publishWorld({ look: r.look, name: String(r.name).slice(0, 20) });
    if (renamed && G.save.pid && ON.Online.ready) { ON.ensurePlayer().then(() => ON.publishRanking(true)).catch(() => { }); }
  } catch (e) { /* */ }
  toast(renamed ? `見た目と なまえ（${r.name}）を かえました！` : '見た目を かえました！', 2600);
  return true;
}
