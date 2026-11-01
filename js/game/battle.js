// =============================================================
//  バトルエンジン（決定論的：同じシードと同じ入力なら同じ結果）
//  シングル / ダブル（2対2）両対応。フレンド対戦でも使用。
// =============================================================
import { SPECIES } from '../data/species.js';
import { MOVES } from '../data/moves.js';
import { ITEMS } from '../data/items.js';
import { ABILITIES } from '../data/abilities.js';
import { typeEff, TYPE_JA } from '../data/types.js';
import { calcStats, monName, addExp } from './mon.js';
import { mulberry32 } from '../engine/util.js';

const STAT_JA = { atk: '攻撃', def: '防御', spe: '素早さ', acc: '命中率' };
// 伝説の 特性の 強さ（調整用）
//  （ver1.4：強い 通常の アニモンでも 1対1で 3割くらい 勝てるように 弱めた。もとは 0.8 / 1.2 / 1/10）
export const TUNE = { haouGuard: 0.95, haouFire: 1.1, sotenRegen: 20 };
const STATUS_JA = { brn: 'やけど', psn: 'どく', par: 'まひ', slp: 'ねむり', frz: 'こおり' };
const STRUGGLE = { id: 'struggle', name: 'わるあがき', type: 'normal', power: 50, acc: null, pp: 1, tier: 1, pri: 0, e: [], crit: 0, drain: 0, recoil: 0.25, heal: 0 };
const BITE = new Set(['burnfang', 'shockfang', 'frostfang', 'bite', 'crunch']);

class BMon {
  constructor(m, side, idx, lvo) {
    this.m = m; this.side = side; this.idx = idx; this.lvo = lvo;
    this.reset();
  }
  get sp() { return SPECIES[this.m.sp]; }
  get lv() { return this.lvo || this.m.lv; }
  get stats() { return calcStats(this.m, this.lvo); }
  get maxhp() { return this.stats.hp; }
  get alive() { return this.m.hp > 0; }
  get types() { return this.sp.types; }
  get ab() { return this.sp.ability; }
  get item() { return this.m.item; }
  reset() {
    this.st = { atk: 0, def: 0, spe: 0, acc: 0 };
    this.protectCount = 0; this.protecting = false; this.flinch = false; this.locked = null; this.flash = false;
    this.disguise = this.ab === 'disguise'; this.helped = false; this.redirect = false; this.acted = false; this.slot = -1;
  }
}

export class Battle {
  /**
   * cfg = { sides:[{name, team:[mon], ai:'player'|'wild'|'trainer'|'boss'|'remote'}, ...], format:'single'|'double',
   *         seed, kind:'wild'|'trainer'|'pvp', lvOverride, postGame, trainerExpBonus }
   */
  constructor(cfg) {
    this.cfg = cfg;
    this.rng = mulberry32(cfg.seed >>> 0);
    this.kind = cfg.kind;
    this.n = cfg.format === 'double' ? 2 : 1;
    this.sides = cfg.sides.map((s, i) => ({
      i, name: s.name, ai: s.ai, team: s.team.map((m, k) => new BMon(m, i, k, cfg.lvOverride || null)),
      active: new Array(this.n).fill(null), choices: null, runTries: 0,
    }));
    this.turn = 0; this.over = false; this.result = null; this.ev = [];
    this.phase = 'start'; this.pendingMoves = []; this.evos = []; this.caught = null; this.expLog = [];
    this.expQ = [];   // 経験値は バトルが 終わってから まとめて もらう（たおした相手・なつかせた相手の ぶん）
  }
  r() { return this.rng(); }
  emit(e) { this.ev.push(e); }
  msg(s) { this.emit({ t: 'msg', s }); }
  nm(b) {
    const s = this.sides[b.side];
    const base = monName(b.m);
    if (s.ai === 'player') return base;
    if (s.ai === 'wild') return '野生の ' + base;
    return '相手の ' + base;
  }

  // ---------- 開始 ----------
  start() {
    this.ev = [];
    for (const s of [this.sides[1], this.sides[0]]) {
      for (let k = 0; k < this.n; k++) {
        const b = s.team.find(x => x.alive && x.slot < 0);
        if (b) this._sendIn(s, k, b, true);
      }
    }
    for (const s of this.sides) for (const b of s.active) if (b) this._entry(b);
    this.phase = 'move';
    return this._flush();
  }
  _flush() { const e = this.ev; this.ev = []; return e; }

  _sendIn(s, slot, b, initial = false) {
    s.active[slot] = b; b.slot = slot; b.reset(); b.slot = slot;
    if (s.ai === 'player') this.msg(`ゆけっ！ ${monName(b.m)}！`);
    else if (s.ai === 'wild') { if (initial) { this.msg(`野生の ${monName(b.m)} が あらわれた！`); if (SPECIES[b.m.sp].rarity >= 4 && !this.cfg?.boss) this.msg('めずらしい アニモンだ！ 逃がさないように しよう！'); } }
    else this.msg(`${s.name} は ${monName(b.m)} を くりだした！`);
    this.emit({ t: 'send', side: s.i, slot, idx: b.idx, hp: b.m.hp, max: b.maxhp, status: b.m.status || null, lv: b.lv });
  }
  _entry(b) {
    if (b.ab === 'glare') {
      this.msg(`${this.nm(b)} の にらみつけ！`);
      for (const f of this.foesOf(b)) this._stat(f, 'atk', -1, b);
    }
  }
  foesOf(b) { return this.sides[1 - b.side].active.filter(x => x && x.alive); }
  allyOf(b) { return this.sides[b.side].active.find(x => x && x !== b && x.alive) || null; }

  // ---------- 入力要求 ----------
  needs() {
    if (this.over) return [null, null];
    return this.sides.map(s => {
      if (this.phase === 'move') {
        const slots = s.active.map((b, k) => b && b.alive ? k : -1).filter(k => k >= 0);
        return slots.length ? { kind: 'move', slots } : null;
      }
      if (this.phase === 'switch') {
        const bench = s.team.filter(b => b.alive && b.slot < 0).length;
        const slots = s.active.map((b, k) => (!b || !b.alive) ? k : -1).filter(k => k >= 0).slice(0, bench);
        return slots.length && bench ? { kind: 'switch', slots } : null;
      }
      return null;
    });
  }
  submit(sideI, choices) { this.sides[sideI].choices = choices; }
  ready() { const n = this.needs(); return n.every((x, i) => !x || this.sides[i].choices); }

  resolve() {
    this.ev = [];
    const n = this.needs();
    for (let i = 0; i < 2; i++) if (n[i] && !this.sides[i].choices && this.sides[i].ai !== 'player' && this.sides[i].ai !== 'remote') this.sides[i].choices = this.aiChoose(i, n[i]);
    if (this.phase === 'switch') this._doSwitchPhase(n);
    else this._doTurn(n);
    for (const s of this.sides) s.choices = null;
    if (!this.over) this._nextPhase();
    return this._flush();
  }

  _nextPhase() {
    // 決着チェック
    for (const s of this.sides) {
      if (!s.team.some(b => b.alive)) {
        this.over = true;
        const win = 1 - s.i;
        this.result = { winner: win, kind: this.sides[win].ai === 'player' || (this.kind === 'pvp' && win === 0) ? 'win' : 'lose' };
        if (this.kind === 'pvp') this.result.kind = 'end';
        this.emit({ t: 'end', result: this.result });
        return;
      }
    }
    const needSwitch = this.sides.some(s => s.active.some(b => !b || !b.alive) && s.team.some(b => b.alive && b.slot < 0));
    this.phase = needSwitch ? 'switch' : 'move';
  }

  _doSwitchPhase(n) {
    for (const s of this.sides) {
      if (!n[s.i]) continue;
      const ch = s.choices || [];
      n[s.i].slots.forEach((slot, k) => {
        let idx = ch[k]?.idx;
        let b = s.team[idx];
        if (!b || !b.alive || b.slot >= 0) b = s.team.find(x => x.alive && x.slot < 0);
        if (b) {
          const old = s.active[slot]; if (old) old.slot = -1;
          this._sendIn(s, slot, b);
        }
      });
    }
    for (const s of this.sides) if (n[s.i]) for (const slot of n[s.i].slots) { const b = s.active[slot]; if (b) this._entry(b); }
  }

  // ---------- 実効素早さ ----------
  speed(b) {
    let s = b.stats.spe * this._mult(b.st.spe);
    if (b.m.status === 'par') s *= 0.5;
    if (b.ab === 'quickfeet' && b.m.status) s *= 1.5 / (b.m.status === 'par' ? 0.5 : 1);
    if (b.item === 'h_shoes') s *= 1.5;
    if (b.item === 'h_heavy') s *= 0.8;
    return s;
  }
  _mult(st) { return st >= 0 ? (2 + st) / 2 : 2 / (2 - st); }

  // ---------- ターン処理 ----------
  _doTurn(n) {
    this.turn++;
    const acts = [];
    for (const s of this.sides) {
      if (!n[s.i]) continue;
      const ch = s.choices || [];
      n[s.i].slots.forEach((slot, k) => {
        const b = s.active[slot]; if (!b) return;
        const c = ch[k] || { type: 'move', move: 0 };
        acts.push({ ...c, b, side: s.i, slot });
      });
    }
    // 先に：逃げる・捕まえる・道具・交代
    const first = acts.filter(a => a.type !== 'move');
    first.sort((x, y) => x.side - y.side);
    for (const a of first) {
      if (this.over) return;
      if (a.type === 'run') { if (this._tryRun(a)) return; }
      else if (a.type === 'catch') { if (this._tryCatch(a)) return; }
      else if (a.type === 'item' && this.kind !== 'pvp') this._useItem(a);   // フレンド対戦では 道具を 使えない
      else if (a.type === 'switch') this._switch(a);
      else if (a.type === 'forfeit') { this.over = true; this.result = { winner: 1 - a.side, kind: 'forfeit', by: a.side }; this.msg(`${this.sides[a.side].name} は 降参した！`); this.emit({ t: 'end', result: this.result }); return; }
    }
    // 技の順番
    let moves = acts.filter(a => a.type === 'move' && a.b.alive && this.sides[a.side].active[a.slot] === a.b);
    for (const a of moves) {
      a.mv = this._moveFor(a.b, a.move);
      a.pri = a.mv.pri + (a.b.ab === 'prankster' && a.mv.power === 0 ? 1 : 0);
      a.spd = this.speed(a.b) + this.r() * 0.01; // 同速はランダム
      if (a.b.item === 'h_claw' && this.r() < 0.2) { a.spd += 1e6; a.claw = true; }
    }
    const brackets = [...new Set(moves.map(a => a.pri))].sort((x, y) => y - x);
    const order = [];
    for (const p of brackets) {
      const g = moves.filter(a => a.pri === p);
      if (this.n === 2) {
        // ダブル：速い順。ただし同じチームが連続しないよう交互に行動
        const A = g.filter(a => a.side === 0).sort((x, y) => y.spd - x.spd), B = g.filter(a => a.side === 1).sort((x, y) => y.spd - x.spd);
        let turnSide = (A[0]?.spd ?? -1) >= (B[0]?.spd ?? -1) ? 0 : 1;
        while (A.length || B.length) {
          const q = turnSide === 0 ? A : B; const o = turnSide === 0 ? B : A;
          if (q.length) order.push(q.shift()); else if (o.length) order.push(o.shift());
          turnSide = 1 - turnSide;
        }
      } else order.push(...g.sort((x, y) => y.spd - x.spd));
    }
    // 先制で動く技（まもる・おとり・エール）
    for (const a of order) {
      if (this.over) return;
      if (!a.b.alive || this.sides[a.side].active[a.slot] !== a.b) continue;
      if (a.claw) this.msg(`${this.nm(a.b)} は はやわざのツメで 先に動いた！`);
      this._execMove(a);
      a.b.acted = true;
      this._checkFaints();
      if (this.over) return;
    }
    this._endTurn();
  }

  _moveFor(b, i) {
    const all0 = b.m.moves.every(x => x.pp <= 0);
    if (all0) return STRUGGLE;
    let mm = b.m.moves[i] || b.m.moves[0];
    if (b.locked && (b.item === 'h_band' || b.item === 'h_shoes')) { const lk = b.m.moves.find(x => x.id === b.locked && x.pp > 0); if (lk) mm = lk; }
    if (mm.pp <= 0) mm = b.m.moves.find(x => x.pp > 0) || mm;
    return MOVES[mm.id];
  }

  _execMove(a) {
    const b = a.b, mv = a.mv;
    // 状態異常で動けないか
    if (b.m.status === 'frz') {
      if (this.r() < 0.2 || mv.type === 'fire') { b.m.status = null; this.msg(`${this.nm(b)} の こおりが とけた！`); this.emit({ t: 'status', side: b.side, slot: b.slot, status: null }); }
      else { this.msg(`${this.nm(b)} は こおって 動けない！`); return; }
    }
    if (b.m.status === 'slp') {
      b.m.slp--;
      if (b.m.slp <= 0 || b.ab === 'earlybird') { b.m.status = null; this.msg(`${this.nm(b)} は 目を さました！`); this.emit({ t: 'status', side: b.side, slot: b.slot, status: null }); }
      else { this.msg(`${this.nm(b)} は ぐうぐう 眠っている。`); return; }
    }
    if (b.flinch) { this.msg(`${this.nm(b)} は ひるんで 動けない！`); if (b.ab === 'steadfast') this._stat(b, 'spe', 1, b); return; }
    if (b.m.status === 'par' && this.r() < 0.25) { this.msg(`${this.nm(b)} は からだが しびれて 動けない！`); return; }

    // PP消費
    const slotMove = b.m.moves.find(x => x.id === mv.id);
    if (slotMove) slotMove.pp = Math.max(0, slotMove.pp - 1);
    if ((b.item === 'h_band' || b.item === 'h_shoes') && !b.locked && mv.id !== 'struggle') b.locked = mv.id;
    this.msg(`${this.nm(b)} の ${mv.name}！`);

    if (mv.protect) {
      const ok = this.r() < 1 / Math.pow(3, b.protectCount);
      if (ok) { b.protecting = true; b.protectCount++; this.msg(`${this.nm(b)} は まもりの 態勢に 入った！`); this.emit({ t: 'protect', side: b.side, slot: b.slot }); }
      else { b.protectCount = 0; this.msg('しかし うまく 決まらなかった！'); }
      return;
    }
    b.protectCount = 0;
    if (mv.redirect) {
      if (this.n === 2) { b.redirect = true; this.msg(`${this.nm(b)} は 注目の 的に なった！`); } else this.msg('しかし うまく 決まらなかった！');
      return;
    }
    if (mv.help) {
      const al = this.allyOf(b);
      if (al && !al.acted) { al.helped = true; this.msg(`${this.nm(b)} は ${this.nm(al)} に エールを 送った！`); } else this.msg('しかし うまく 決まらなかった！');
      return;
    }
    if (mv.power === 0) {
      this.emit({ t: 'move', side: b.side, slot: b.slot, move: mv.id, type: mv.type, tside: b.side, tslot: b.slot, status: true });
      if (mv.heal) {
        const hp0 = b.m.hp; b.m.hp = Math.min(b.maxhp, b.m.hp + Math.floor(b.maxhp * mv.heal));
        if (b.m.hp === hp0) this.msg('しかし HPは まんたんだ！');
        else { this.msg(`${this.nm(b)} の HPが 回復した！`); this.emit({ t: 'heal', side: b.side, slot: b.slot, hp: b.m.hp, max: b.maxhp, amount: b.m.hp - hp0 }); }
        return;
      }
      const needsFoe = mv.e.some(e => e[2] === 'foe' || ['brn', 'psn', 'par', 'slp', 'frz'].includes(e[0]));
      let t = null;
      if (needsFoe) {
        t = this._target(b, a.target);
        if (!t) { this.msg('しかし 相手が いない！'); return; }
        if (t.protecting) { this.msg(`${this.nm(t)} は 攻撃から 身を守った！`); return; }
        if (mv.acc && this.r() * 100 >= mv.acc * this._mult(b.st.acc) * (b.ab === 'keeneye' ? 1.3 : 1)) { this.msg(`${this.nm(t)} には 当たらなかった！`); return; }
      }
      let any = false;
      for (const e of mv.e) {
        if (['brn', 'psn', 'par', 'slp', 'frz'].includes(e[0])) { if (this._status(t, e[0], b, true)) any = true; }
        else { const who = e[2] === 'self' ? b : t; if (who && this._stat(who, e[0], e[1], b)) any = true; }
      }
      if (!any) this.msg('しかし うまく 決まらなかった！');
      return;
    }
    // ---- 攻撃技 ----
    const t = this._target(b, a.target);
    if (!t) { this.msg('しかし 相手が いない！'); return; }
    this.emit({ t: 'move', side: b.side, slot: b.slot, move: mv.id, type: mv.type, tside: t.side, tslot: t.slot, status: false });
    if (t.protecting) { this.msg(`${this.nm(t)} は 攻撃から 身を守った！`); return; }
    // 命中判定（素早さが高い相手ほど避けやすい）
    if (mv.acc) {
      let acc = mv.acc * this._mult(b.st.acc);
      if (b.ab === 'keeneye') acc *= 1.3;
      if (b.ab === 'hustle') acc *= 0.8;
      if (b.item === 'h_scope') acc *= 1.1;
      if (t.item === 'h_bright') acc *= 0.9;
      const ratio = this.speed(t) / Math.max(1, this.speed(b));
      const dodge = Math.min(0.12, Math.max(0, (ratio - 1) * 0.1));
      acc *= (1 - dodge);
      if (this.r() * 100 >= acc) { this.msg(ratio > 1.15 ? `${this.nm(t)} は すばやく 攻撃を かわした！` : `${this.nm(t)} には 当たらなかった！`); this.emit({ t: 'miss', side: t.side, slot: t.slot }); return; }
    }
    // 無効化特性
    const ta = t.ab;
    if (mv.type === 'ground' && ta === 'levitate') { this.msg(`${this.nm(t)} は ふわふわ浮いている！ 効果がない！`); return; }
    if (mv.type === 'fire' && ta === 'flashfire') { t.flash = true; this.msg(`${this.nm(t)} は 炎を 吸収して パワーアップした！`); return; }
    if (mv.type === 'water' && ta === 'waterabsorb') { this._healFrac(t, 0.25, 'みずすい'); return; }
    if (mv.type === 'electric' && ta === 'voltabsorb') { this._healFrac(t, 0.25, 'でんきすい'); return; }
    if (mv.type === 'grass' && ta === 'sapsipper') { this.msg(`${this.nm(t)} は 草を 食べた！`); this._stat(t, 'atk', 1, t); return; }
    const eff = typeEff(mv.type, t.types);
    if (eff === 0) { this.msg(`${this.nm(t)} には 効果が ないようだ…`); return; }
    if (t.disguise) { t.disguise = false; this.msg(`${this.nm(t)} の みがわりにんぎょうが 攻撃を 受け止めた！`); this.emit({ t: 'dmg', side: t.side, slot: t.slot, hp: t.m.hp, max: t.maxhp, eff: 1 }); return; }

    let { dmg, crit } = this._damage(b, t, mv, eff);
    // ばつぐんよけの実：効果バツグンの 攻撃を 1度だけ 半分に
    let weakB = false;
    if (eff > 1 && t.item === 'h_weakberry') { dmg = Math.max(1, Math.floor(dmg / 2)); t.m.item = null; weakB = true; }
    const full = t.m.hp === t.maxhp;
    let endured = false;
    if (dmg >= t.m.hp && full && t.maxhp > 1) {
      if (ta === 'sturdy') { dmg = t.m.hp - 1; endured = 'ふんばり'; }
      else if (t.item === 'h_charm') { dmg = t.m.hp - 1; endured = 'いのちのお守り'; t.m.item = null; }
    }
    // ふんばりのハチマキ：12%で HP1で 耐える（何度でも）
    if (!endured && dmg >= t.m.hp && t.m.hp > 1 && t.item === 'h_band2' && this.r() < 0.12) { dmg = t.m.hp - 1; endured = 'ふんばりのハチマキ'; }
    if (weakB) this.msg(`${this.nm(t)} は ばつぐんよけの実で ダメージを へらした！`);
    const hpBefore = t.m.hp;
    t.m.hp = Math.max(0, t.m.hp - dmg);
    this.emit({ t: 'dmg', side: t.side, slot: t.slot, hp: t.m.hp, max: t.maxhp, eff, crit, amount: hpBefore - t.m.hp });
    if (crit) this.msg('急所に 当たった！');
    if (eff > 1) this.msg('効果は バツグンだ！'); else if (eff < 1) this.msg('効果は いまひとつの ようだ…');
    if (endured) this.msg(`${this.nm(t)} は ${endured}で もちこたえた！`);
    // 吸収・反動
    if (mv.drain && dmg > 0) this._healAmt(b, Math.max(1, Math.floor(dmg * mv.drain)), `${this.nm(t)} から 体力を 吸い取った！`);
    if (mv.recoil && dmg > 0 && b.ab !== 'rockhead' && b.ab !== 'magicguard') this._hurt(b, Math.max(1, Math.floor(dmg * mv.recoil)), `${this.nm(b)} は 反動を 受けた！`);
    if (b.item === 'h_orb' && b.ab !== 'magicguard') this._hurt(b, Math.max(1, Math.floor(b.maxhp / 10)), `${this.nm(b)} は ちからの宝珠で 体力が 削られた！`);
    if (b.item === 'h_shell' && dmg > 0 && b.alive) this._healAmt(b, Math.max(1, Math.floor(dmg / 8)), `${this.nm(b)} は かいがらの鈴で 少し 回復した！`);
    // 追加効果（ぼうごのマントを 持っていると 受けない）
    if (t.alive && ta !== 'shielddust' && t.item !== 'h_covert') {
      for (const e of mv.e) {
        const chance = (e[3] ?? e[1]) * (b.ab === 'serenegrace' ? 2 : 1);
        if (e[0] === 'flinch') { if (!t.acted && ta !== 'innerfocus' && this.r() * 100 < chance) t.flinch = true; }
        else if (['brn', 'psn', 'par', 'slp', 'frz'].includes(e[0])) { if (this.r() * 100 < e[1] * (b.ab === 'serenegrace' ? 2 : 1)) this._status(t, e[0], b); }
        else if (e[2] === 'foe') { if (this.r() * 100 < chance) this._stat(t, e[0], e[1], b); }
      }
    }
    for (const e of mv.e) if (e[2] === 'self' && b.alive) { const chance = (e[3] ?? 100) * (b.ab === 'serenegrace' && e[3] < 100 ? 2 : 1); if (this.r() * 100 < chance) this._stat(b, e[0], e[1], b); }
    if (b.ab === 'swiftswim' && mv.type === 'water' && b.alive) this._stat(b, 'spe', 1, b);
    // 接触系の特性・道具
    if (b.alive && dmg > 0) {
      if (ta === 'poisonbody' && this.r() < 0.3) this._status(b, 'psn', t);
      if (ta === 'staticbody' && this.r() < 0.3) this._status(b, 'par', t);
      if (ta === 'flamebody' && this.r() < 0.3) this._status(b, 'brn', t);
      if (ta === 'icebody' && this.r() < 0.1) this._status(b, 'frz', t);
      if (t.item === 'h_spike' && b.ab !== 'magicguard') this._hurt(b, Math.max(1, Math.floor(b.maxhp / 6)), `${this.nm(b)} は トゲトゲよろいで 傷ついた！`);
    }
    // ふっかつの実
    if (t.alive && t.item === 'h_berry' && t.m.hp <= t.maxhp / 2) { t.m.item = null; this._healAmt(t, Math.floor(t.maxhp / 4), `${this.nm(t)} は ふっかつの実を 食べて 回復した！`); }
    if (t.alive && t.item === 'h_sitrus2' && t.m.hp <= t.maxhp / 4) { t.m.item = null; this._healAmt(t, Math.floor(t.maxhp / 3), `${this.nm(t)} は まんぷくの実を 食べて 回復した！`); }
    if (!t.alive && b.alive && b.ab === 'moxie') { t._moxie = b; }
  }

  _target(b, tgt) {
    const foes = this.foesOf(b);
    if (!foes.length) return null;
    // おとりのさけび
    const red = foes.find(f => f.redirect);
    if (red) return red;
    if (tgt && tgt.side !== undefined) {
      const t = this.sides[tgt.side].active[tgt.slot];
      if (t && t.alive && t.side !== b.side) return t;
    }
    return foes[0];
  }

  _damage(b, t, mv, eff) {
    let power = mv.power;
    const ab = b.ab;
    if (ab === 'technician' && power <= 60) power *= 1.5;
    if (ab === 'reckless' && mv.recoil) power *= 1.2;
    if (ab === 'strongjaw' && BITE.has(mv.id)) power *= 1.5;
    if (ab && ab.startsWith('soul_') && ab === 'soul_' + mv.type && b.m.hp <= b.maxhp / 3) power *= 1.5;
    if (b.flash && mv.type === 'fire') power *= 1.5;
    if (ab === 'haou' && mv.type === 'fire') power *= TUNE.haouFire;
    if (b.helped) { power *= 1.5; b.helped = false; }
    const ally = this.allyOf(b);
    if (ally && ally.ab === 'powerspot') power *= 1.3;
    let A = b.stats.atk * this._mult(b.st.atk);
    if (ab === 'hugepower') A *= 1.3;
    if (ab === 'hustle') A *= 1.5;
    if (ab === 'guts' && b.m.status) A *= 1.5;
    if ((ab === 'plus' && ally?.ab === 'minus') || (ab === 'minus' && ally?.ab === 'plus')) A *= 1.5;
    if (b.item === 'h_band') A *= 1.5;
    if (b.item === 'h_power') A *= 1.1;
    if (b.m.status === 'brn' && ab !== 'guts') A *= 0.5;
    let crit = false;
    const critRate = (mv.crit ? 1 / 8 : 1 / 16) * (ab === 'lucky' ? 2 : 1) * (b.item === 'h_scope' ? 2 : 1);
    if (this.r() < critRate) crit = true;
    if (t.item === 'h_guard') crit = false;   // まもりのたて：急所に 当たらない
    let D = t.stats.def * this._mult(crit ? Math.min(0, t.st.def) : t.st.def);
    if (crit) A = Math.max(A, b.stats.atk * (ab === 'hugepower' ? 1.3 : 1));
    if (t.item === 'h_vest') D *= 1.5;
    if (t.item === 'h_belt' && t.sp.evoTo) D *= 1.5;
    if (t.item === 'h_heavy') D *= 1.3;
    let d = Math.floor(Math.floor((2 * b.lv / 5 + 2) * power * A / Math.max(1, D)) / 50) + 2;
    let stab = b.types.includes(mv.type) ? (ab === 'adapt' ? 1.8 : 1.5) : 1;
    d *= stab * eff;
    if (crit) d *= ab === 'sniper' ? 2.25 : 1.5;
    d *= 0.85 + this.r() * 0.15;
    const it = ITEMS[b.item];
    if (it && it.boost === mv.type) d *= 1.2;
    if (b.item === 'h_orb') d *= 1.3;
    if (b.item === 'h_glass' && eff > 1) d *= 1.2;
    const ta = t.ab;
    const tit = ITEMS[t.item];
    if (tit && tit.resist === mv.type) d *= 0.7;   // 〇〇よけの 持ち物：そのタイプの ダメージ 3割減
    if (ta === 'multiscale' && t.m.hp === t.maxhp) d *= 0.5;
    if (ta === 'solidshell' && eff > 1) d *= 0.75;
    if (ta === 'thickfat' && (mv.type === 'fire' || mv.type === 'ice')) d *= 0.5;
    if (ta === 'haou') d *= TUNE.haouGuard;
    const tAlly = this.allyOf(t);
    if (tAlly && tAlly.ab === 'friendguard') d *= 0.75;
    return { dmg: Math.max(1, Math.floor(d)), crit };
  }

  _stat(b, stat, delta, src) {
    if (!b || !b.alive) return false;
    if (delta < 0 && src && src.side !== b.side && b.ab === 'clearbody') { this.msg(`${this.nm(b)} の クリアボディで 能力は 下がらない！`); return false; }
    if (delta < 0 && src && src.side !== b.side && b.item === 'h_clearamulet') { this.msg(`${this.nm(b)} は クリアのお守りで 能力が 下がらない！`); return false; }
    const old = b.st[stat];
    b.st[stat] = Math.max(-6, Math.min(6, old + delta));
    const d = b.st[stat] - old;
    if (d === 0) { this.msg(`${this.nm(b)} の ${STAT_JA[stat]}は もう ${delta > 0 ? '上がらない' : '下がらない'}！`); return false; }
    const w = Math.abs(d) >= 2 ? (d > 0 ? 'ぐーんと 上がった' : 'がくっと 下がった') : (d > 0 ? '上がった' : '下がった');
    this.msg(`${this.nm(b)} の ${STAT_JA[stat]}が ${w}！`);
    this.emit({ t: 'stat', side: b.side, slot: b.slot, stat, delta: d });
    if (d < 0 && src && src.side !== b.side && b.ab === 'defiant') { this.msg(`${this.nm(b)} の まけんきが 発動！`); this._stat(b, 'atk', 2, b); }
    return true;
  }

  _status(t, st, src, verbose = false) {
    if (!t || !t.alive) return false;
    if (t.m.status) { if (verbose) this.msg(`${this.nm(t)} は すでに 状態異常だ！`); return false; }
    const ty = t.types;
    if ((st === 'brn' && (ty.includes('fire') || t.ab === 'haou')) || (st === 'psn' && (ty.includes('poison') || ty.includes('steel') || t.ab === 'immunity')) ||
      (st === 'par' && ty.includes('electric')) || (st === 'frz' && ty.includes('ice')) || t.ab === 'soten') {
      if (verbose) this.msg(`${this.nm(t)} には 効果が ないようだ…`); return false;
    }
    t.m.status = st;
    if (st === 'slp') t.m.slp = 1 + Math.floor(this.r() * 3);
    const txt = { brn: 'やけどを 負った', psn: '毒を あびた', par: 'まひして 技が 出にくくなった', slp: '眠って しまった', frz: 'こおりついた' }[st];
    this.msg(`${this.nm(t)} は ${txt}！`);
    this.emit({ t: 'status', side: t.side, slot: t.slot, status: st });
    if (t.item === 'h_clear') { t.m.item = null; t.m.status = null; this.msg(`${this.nm(t)} は すっきりの実で 状態異常が 治った！`); this.emit({ t: 'status', side: t.side, slot: t.slot, status: null }); return true; }
    if (src && src.side !== t.side && t.ab === 'synchro' && ['brn', 'psn', 'par'].includes(st)) this._status(src, st, null);
    return true;
  }

  _healAmt(b, amt, text) {
    if (!b.alive) return;
    const h0 = b.m.hp; b.m.hp = Math.min(b.maxhp, b.m.hp + amt);
    if (b.m.hp !== h0) { if (text) this.msg(text); this.emit({ t: 'heal', side: b.side, slot: b.slot, hp: b.m.hp, max: b.maxhp, amount: b.m.hp - h0 }); }
  }
  _healFrac(b, f, abName) { this.msg(`${this.nm(b)} の ${abName}！`); this._healAmt(b, Math.floor(b.maxhp * f), `${this.nm(b)} の HPが 回復した！`); }
  _hurt(b, amt, text) {
    if (!b.alive) return;
    const h0 = b.m.hp;
    b.m.hp = Math.max(0, b.m.hp - amt);
    if (text) this.msg(text);
    this.emit({ t: 'dmg', side: b.side, slot: b.slot, hp: b.m.hp, max: b.maxhp, eff: 1, chip: true, amount: h0 - b.m.hp });
  }

  _checkFaints() {
    for (const s of this.sides) for (const b of s.active) {
      if (b && !b.alive && !b._fainted) {
        b._fainted = true;
        this.msg(`${this.nm(b)} は たおれた！`);
        this.emit({ t: 'faint', side: b.side, slot: b.slot, idx: b.idx });
        if (b._moxie && b._moxie.alive) { this._stat(b._moxie, 'atk', 1, b._moxie); b._moxie = null; }
        if (this.sides[b.side].ai !== 'player' && this.kind !== 'pvp') this._queueExp(b, 1);
      }
    }
    for (const s of this.sides) {
      if (!s.team.some(b => b.alive)) {
        this.over = true;
        const win = 1 - s.i;
        this.result = { winner: win, kind: this.kind === 'pvp' ? 'end' : (this.sides[win].ai === 'player' ? 'win' : 'lose') };
        this.emit({ t: 'end', result: this.result });
        return;
      }
    }
  }

  // ---------- 経験値 ----------
  //  ・たおした相手：全部　・なつかせた（つかまえた）相手：4分の1
  //  ・バトルの 途中では もらえない。バトルが 終わってから まとめて 手持ち全員に 入る（applyExp）
  //  ・負けたときは、それまでに たおした ぶんの 5分の1 だけ（applyExp(0.2)）
  expFor(foe) {
    const mult = (this.kind === 'trainer' ? 1.5 : 1) * (this.cfg.postGame ? 2 : 1);
    return Math.max(1, Math.floor(foe.sp.baseExp * foe.lv / 7 * mult));
  }
  _queueExp(foe, frac = 1) {
    if (!this.sides.some(s => s.ai === 'player') || this.kind === 'pvp') return;
    if (this.expQ.some(q => q.b === foe)) return;
    const full = this.expFor(foe);
    this.expQ.push({ b: foe, sp: foe.m.sp, lv: foe.lv, frac, amount: Math.max(1, Math.floor(full * frac)) });
  }
  expTotal(mult = 1) { const t = this.expQ.reduce((a, q) => a + q.amount, 0); return t > 0 ? Math.max(1, Math.floor(t * mult)) : 0; }
  // バトルの あとで 呼ぶ：手持ち全員に 経験値を 入れる。返り値：[{ m, amount, lvups, learned, pending, evolve }]
  applyExp(mult = 1) {
    const ps = this.sides.find(s => s.ai === 'player');
    const total = this.expTotal(mult);
    if (!ps || !total || this.expApplied) return [];
    this.expApplied = true;
    const out = [];
    for (const b of ps.team) {
      const r = addExp(b.m, total);
      this.expLog.push({ uid: b.m.uid, amount: total });
      for (const id of r.pending) this.pendingMoves.push({ uid: b.m.uid, move: id });
      if (r.evolve && !this.evos.includes(b.m.uid)) this.evos.push(b.m.uid);
      out.push({ m: b.m, amount: total, ...r });
    }
    return out;
  }

  _endTurn() {
    for (const s of this.sides) for (const b of s.active) {
      if (!b || !b.alive) continue;
      const mg = b.ab === 'magicguard';
      const goggle = b.item === 'h_safety';
      if (b.m.status === 'brn' && !mg && !goggle) this._hurt(b, Math.max(1, Math.floor(b.maxhp / 16)), `${this.nm(b)} は やけどの ダメージを 受けている！`);
      if (b.m.status === 'psn') {
        if (b.ab === 'poisonheal') this._healAmt(b, Math.max(1, Math.floor(b.maxhp / 8)), `${this.nm(b)} は どくぐすりで 回復した！`);
        else if (!mg && !goggle) this._hurt(b, Math.max(1, Math.floor(b.maxhp / 8)), `${this.nm(b)} は 毒の ダメージを 受けている！`);
      }
      if (!b.alive) continue;
      if (b.item === 'h_bread') this._healAmt(b, Math.max(1, Math.floor(b.maxhp / 16)), `${this.nm(b)} は めぐみのパンで 少し 回復した。`);
      if (b.ab === 'sunbask') this._healAmt(b, Math.max(1, Math.floor(b.maxhp / 16)), `${this.nm(b)} は ひなたぼっこで 少し 回復した。`);
      if (b.ab === 'soten') this._healAmt(b, Math.max(1, Math.floor(b.maxhp / TUNE.sotenRegen)), `${this.nm(b)} は 蒼天の守護で 回復した。`);
      if (b.ab === 'speedboost') this._stat(b, 'spe', 1, b);
      if (b.ab === 'shedskin' && b.m.status && this.r() < 0.3) { b.m.status = null; this.msg(`${this.nm(b)} は だっぴして 状態異常が 治った！`); this.emit({ t: 'status', side: b.side, slot: b.slot, status: null }); }
      if (b.alive && b.item === 'h_berry' && b.m.hp <= b.maxhp / 2) { b.m.item = null; this._healAmt(b, Math.floor(b.maxhp / 4), `${this.nm(b)} は ふっかつの実を 食べて 回復した！`); }
      if (b.alive && b.item === 'h_sitrus2' && b.m.hp <= b.maxhp / 4) { b.m.item = null; this._healAmt(b, Math.floor(b.maxhp / 3), `${this.nm(b)} は まんぷくの実を 食べて 回復した！`); }
      if (b.alive && b.item === 'h_regen' && b.m.status && this.r() < 0.25) { b.m.status = null; b.m.slp = 0; this.msg(`${this.nm(b)} は いやしのすずの 音色で 状態異常が 治った！`); this.emit({ t: 'status', side: b.side, slot: b.slot, status: null }); }
    }
    this._checkFaints();
    for (const s of this.sides) for (const b of s.team) { b.protecting = false; b.flinch = false; b.redirect = false; b.helped = false; b.acted = false; }
  }

  // ---------- 交代・道具・逃走・捕獲 ----------
  _switch(a) {
    const s = this.sides[a.side];
    const nb = s.team[a.idx];
    if (!nb || !nb.alive || nb.slot >= 0) return;
    const old = s.active[a.slot];
    if (old) {
      if (old.ab === 'regen' && old.alive) old.m.hp = Math.min(old.maxhp, old.m.hp + Math.floor(old.maxhp / 3));
      if (old.ab === 'naturalcure') old.m.status = null;
      old.slot = -1;
      this.msg(s.ai === 'player' ? `もどれ！ ${monName(old.m)}！` : `${s.name} は ${monName(old.m)} を ひっこめた！`);
      this.emit({ t: 'withdraw', side: s.i, slot: a.slot });
    }
    this._sendIn(s, a.slot, nb);
    this._entry(nb);
  }
  _useItem(a) {
    const s = this.sides[a.side], it = ITEMS[a.item], b = s.team[a.idx];
    if (!it || !b) return;
    this.msg(`${s.ai === 'player' ? 'あなた' : s.name} は ${it.name} を 使った！`);
    const m = b.m, max = b.maxhp;
    if (it.cat === 'heal' && m.hp > 0) { m.hp = Math.min(max, m.hp + it.hp); this.msg(`${monName(m)} の HPが 回復した！`); }
    else if (it.cat === 'revive' && m.hp <= 0) { m.hp = Math.max(1, Math.floor(max * it.rev)); b._fainted = false; this.msg(`${monName(m)} は 元気を とりもどした！`); }
    else if (it.cat === 'status') { m.status = null; m.slp = 0; this.msg(`${monName(m)} の 状態異常が 治った！`); }
    else if (it.cat === 'pp') { for (const x of m.moves) x.pp = Math.min(MOVES[x.id].pp, x.pp + it.pp); this.msg(`${monName(m)} の 技の 回数が 回復した！`); }
    else this.msg('しかし 効果が なかった…');
    if (b.slot >= 0) this.emit({ t: 'heal', side: b.side, slot: b.slot, hp: m.hp, max, status: m.status || null });
    this.emit({ t: 'team', side: b.side, idx: b.idx, hp: m.hp });
  }
  _tryRun(a) {
    const s = this.sides[a.side];
    if (this.kind === 'pvp') { this.msg('対戦の 途中で 逃げることは できない！'); return false; }
    if (this.cfg.noRun) { this.msg('この 勝負からは 逃げられない！'); return false; }
    // トレーナーとの 勝負は いつでも 切り上げて 逃げられる（勝ったことには ならない）
    if (this.kind === 'trainer') {
      this.msg('勝負を 切り上げて 逃げだした！');
      this.over = true; this.result = { kind: 'run' }; this.emit({ t: 'end', result: this.result });
      return true;
    }
    const me = a.b, foe = this.foesOf(me)[0];
    s.runTries++;
    const p = Math.max(0.05, Math.min(1, 0.55 + (this.speed(me) - this.speed(foe)) / (2 * this.speed(foe)) - (foe.lv - me.lv) * 0.04 + (s.runTries - 1) * 0.1));
    if (this.r() < p) {
      this.msg('うまく 逃げきれた！');
      this.over = true; this.result = { kind: 'run' }; this.emit({ t: 'end', result: this.result });
      return true;
    }
    this.msg(foe.lv > me.lv + 5 ? '相手が 強すぎて 逃げられない！' : '逃げられなかった！');
    return false;
  }
  // 野生の アニモンだけ なつかせられる（トレーナー・サイドストーリーの ぬし・フレンドの アニモンは だめ）
  canCatch(foe) {
    if (!foe || this.kind !== 'wild' || this.cfg.noCatch) return false;
    if (this.sides[foe.side].ai !== 'wild') return false;
    if (foe.m.trainer) return false;
    return !foe.sp.legend;
  }
  catchChance(foodId, me, foe) {
    const it = ITEMS[foodId];
    if (!it || !this.canCatch(foe)) return 0;
    if (it.mult >= 999) return 1;
    const hpF = 1 - 0.66 * foe.m.hp / foe.maxhp;
    const stF = ['slp', 'frz'].includes(foe.m.status) ? 2 : foe.m.status ? 1.5 : 1;
    // ダンジョンの主は なつきにくい種でも 一定の確率は残す
    const rate = foe.m.boss ? Math.max(foe.sp.catchRate, 45) : foe.sp.catchRate;
    let p = Math.min(1, (rate / 255) * it.mult * hpF * stF * 1.1);
    // レベル差：戦っている子 と パーティーの 平均レベル の、差が 大きい ほうで 判定
    //  （1匹だけ 強い子を 育てて、強い 野生を つかまえる…が できないように）
    const gap = this.catchGap(me, foe);
    if (gap > 15) p *= 0.003; else if (gap > 10) p *= 0.05; else if (gap > 5) p *= 0.4;
    return Math.max(0, Math.min(1, p));
  }
  // パーティー（手持ち 全員）の 平均レベル
  partyAvgLv() {
    const ps = this.sides.find(s => s.ai === 'player'); if (!ps || !ps.team.length) return 1;
    return ps.team.reduce((a, b) => a + b.lv, 0) / ps.team.length;
  }
  catchGap(me, foe) { return Math.max(foe.lv - (me ? me.lv : 0), foe.lv - this.partyAvgLv()); }
  _tryCatch(a) {
    const foe = this.foesOf(a.b)[0];
    if (!this.canCatch(foe)) { this.msg(this.kind === 'wild' ? 'この アニモンは なつかせられない！' : 'ほかの人の アニモンは 捕まえられない！'); return false; }
    const it = ITEMS[a.item];
    this.msg(`${it.name} を あげた！`);
    const p = this.catchChance(a.item, a.b, foe);
    const each = Math.pow(p, 1 / 3);
    let shakes = 0;
    for (let i = 0; i < 3; i++) { if (this.r() < each) shakes++; else break; }
    const ok = shakes === 3;
    this.emit({ t: 'catch', item: a.item, shakes, ok, side: foe.side, slot: foe.slot });
    if (ok) {
      this.msg(`やった！ ${monName(foe.m)} が なついた！`);
      this.caught = foe.m; this.over = true; this.result = { kind: 'caught' };
      // なつかせた相手の 経験値は 4分の1（バトルが 終わってから もらえる）
      this._queueExp(foe, 0.25);
      this.emit({ t: 'end', result: this.result });
      return true;
    }
    this.msg(['しかし ぷいっと そっぽを 向かれた！', 'あとちょっと だったのに…！', 'おしい！ もう少しで なつきそうだった！'][Math.min(2, shakes)]);
    if (this.catchGap(a.b, foe) > 10) this.msg(foe.lv - a.b.lv > 10 ? 'レベルの差が 大きすぎて 全然 なついてくれない…' : `パーティーの 平均レベル（Lv${Math.round(this.partyAvgLv())}）より ずっと 強くて なついてくれない…`);
    return false;
  }

  // ---------- AI ----------
  aiChoose(sideI, need) {
    const s = this.sides[sideI];
    if (need.kind === 'switch') {
      const used = new Set();
      return need.slots.map(() => {
        const foes = this.sides[1 - sideI].active.filter(x => x && x.alive);
        let best = null, bs = -1e9;
        for (const b of s.team) {
          if (!b.alive || b.slot >= 0 || used.has(b.idx)) continue;
          let sc = b.m.hp / b.maxhp * 10;
          if (s.ai === 'boss' || s.ai === 'trainer') for (const f of foes) { sc += this._bestMoveScore(b, f).score / 40; sc -= Math.max(...f.types.map(t2 => typeEff(t2, b.types))) * 3; }
          if (sc > bs) { bs = sc; best = b; }
        }
        if (best) used.add(best.idx);
        return { type: 'switch', idx: best ? best.idx : 0 };
      });
    }
    return need.slots.map(slot => {
      const b = s.active[slot];
      const foes = this.foesOf(b);
      if (!foes.length) return { type: 'move', move: 0 };
      const wild = s.ai === 'wild';
      // ボスはピンチで回復
      if (s.ai === 'boss' && b.m.hp < b.maxhp * 0.3 && this.r() < 0.5) {
        const hi = b.m.moves.findIndex(x => MOVES[x.id].heal && x.pp > 0);
        if (hi >= 0) return { type: 'move', move: hi };
      }
      let best = { score: -1, mi: 0, t: foes[0] };
      const cand = [];
      for (const f of foes) {
        b.m.moves.forEach((mm, mi) => {
          if (mm.pp <= 0) return;
          if (b.locked && mm.id !== b.locked && (b.item === 'h_band' || b.item === 'h_shoes')) return;
          const mv = MOVES[mm.id];
          let sc;
          if (mv.power === 0) {
            if (b.item === 'h_vest') return;
            sc = (this.turn <= 1 && b.m.hp > b.maxhp * 0.7) ? 45 : 12;
            if (mv.heal) sc = b.m.hp < b.maxhp * 0.5 ? 70 : 2;
            if (mv.protect) sc = 8;
            if (mv.redirect || mv.help) sc = this.n === 2 ? 30 : 0;
            if (mv.e.some(e => ['brn', 'psn', 'par', 'slp', 'frz'].includes(e[0])) && f.m.status) sc = 0;
            if (mv.e.some(e => e[2] === 'self' && e[1] > 0) && b.st[mv.e[0][0]] >= 2) sc = 0;
          } else sc = this._moveScore(b, f, mv);
          cand.push({ mi, t: f, score: sc });
          if (sc > best.score) best = { mi, t: f, score: sc };
        });
      }
      let pickC = best;
      if (wild || (s.ai === 'trainer' && this.r() < 0.25)) {
        const tot = cand.reduce((a2, c) => a2 + Math.max(1, c.score), 0);
        let x = this.r() * tot;
        for (const c of cand) { x -= Math.max(1, c.score); if (x <= 0) { pickC = c; break; } }
      }
      return { type: 'move', move: pickC.mi, target: { side: pickC.t.side, slot: pickC.t.slot } };
    });
  }
  _moveScore(b, f, mv) {
    const eff = typeEff(mv.type, f.types);
    if (eff === 0) return 0;
    if ((mv.type === 'ground' && f.ab === 'levitate') || (mv.type === 'fire' && f.ab === 'flashfire') || (mv.type === 'water' && f.ab === 'waterabsorb') || (mv.type === 'electric' && f.ab === 'voltabsorb') || (mv.type === 'grass' && f.ab === 'sapsipper')) return 0;
    const stab = b.types.includes(mv.type) ? 1.5 : 1;
    let sc = mv.power * eff * stab * (mv.acc ? mv.acc / 100 : 1);
    if (mv.recoil) sc *= 0.9;
    if (mv.pri > 0 && f.m.hp < f.maxhp * 0.25) sc *= 1.6;
    return sc;
  }
  _bestMoveScore(b, f) {
    let best = { score: 0 };
    for (const mm of b.m.moves) { const mv = MOVES[mm.id]; if (mv.power > 0) { const sc = this._moveScore(b, f, mv); if (sc > best.score) best = { score: sc, id: mm.id }; } }
    return best;
  }

  // UI用：その場の状態を取得
  active(side, slot) { return this.sides[side].active[slot]; }
}

export { STATUS_JA, STAT_JA, TYPE_JA };
