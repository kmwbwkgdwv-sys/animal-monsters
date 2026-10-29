// =============================================================
//  BGM・効果音（Web Audioで生成）
//  ・バックグラウンドで流している音楽を止めないよう、
//    iOS/Safari では audioSession を "ambient"（他の音と混ぜる）に設定
//  ・BGM/効果音がOFFのときは AudioContext 自体を作らない
// =============================================================
const NOTE = { C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, F: 5, 'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11 };
const CHORD = { C: [0, 4, 7], Cm: [0, 3, 7], D: [2, 6, 9], Dm: [2, 5, 9], E: [4, 8, 11], Em: [4, 7, 11], F: [5, 9, 0], G: [7, 11, 2], A: [9, 1, 4], Am: [9, 0, 4], Bb: [10, 2, 5], B: [11, 3, 6] };
function midi(n) { const m = n.match(/^([A-G][#b]?)(\d)$/); return m ? 12 * (+m[2] + 1) + NOTE[m[1]] : null; }
const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);

const SONGS = {
  title: { tempo: 96, chords: ['C', 'G', 'Am', 'F', 'C', 'G', 'F', 'C'], drums: 1, mel: ['E5:4 G5:4 C6:6 B5:2', 'A5:4 G5:4 D5:8', 'C5:4 E5:4 A5:6 G5:2', 'F5:4 E5:4 C5:8', 'E5:4 G5:4 C6:4 D6:4', 'B5:4 A5:4 G5:8', 'A5:4 G5:4 F5:4 E5:4', 'C5:12 -:4'] },
  town: { tempo: 88, chords: ['F', 'C', 'Dm', 'Bb', 'F', 'C', 'Bb', 'C'], drums: 0, mel: ['A4:2 C5:2 F5:4 E5:2 F5:2 A5:4', 'G5:4 E5:4 C5:8', 'D5:2 F5:2 A5:4 G5:2 F5:2 D5:4', 'F5:6 D5:2 Bb4:8', 'A4:2 C5:2 F5:4 G5:2 A5:2 C6:4', 'Bb5:4 G5:4 E5:8', 'D5:4 F5:4 Bb5:4 A5:4', 'G5:8 C5:4 -:4'] },
  field: { tempo: 120, chords: ['G', 'D', 'Em', 'C', 'G', 'D', 'C', 'D'], drums: 1, mel: ['D5:2 G5:2 B5:4 A5:2 G5:2 D5:4', 'F#5:4 A5:4 D6:6 -:2', 'E5:2 G5:2 B5:4 A5:2 G5:2 E5:4', 'C5:4 E5:4 G5:6 -:2', 'B5:2 A5:2 G5:4 B5:2 D6:2 B5:4', 'A5:4 F#5:4 D5:6 -:2', 'E5:2 G5:2 C6:4 B5:2 A5:2 G5:4', 'F#5:4 A5:4 D5:8'] },
  battle: { tempo: 150, chords: ['Am', 'Am', 'F', 'G', 'Am', 'Am', 'F', 'E'], drums: 2, mel: ['A5:2 -:1 A5:1 E5:2 A5:2 C6:2 B5:2 A5:2 E5:2', 'G5:2 A5:2 -:2 E5:2 G5:4 A5:4', 'F5:2 A5:2 C6:2 A5:2 F5:2 A5:2 C6:2 D6:2', 'D6:4 B5:4 G5:4 D5:4', 'A5:2 -:1 A5:1 E5:2 A5:2 C6:2 B5:2 A5:2 E5:2', 'C6:2 B5:2 A5:2 G5:2 A5:4 E5:4', 'F5:2 G5:2 A5:2 C6:2 F6:4 E6:4', 'E6:4 D6:2 C6:2 B5:4 G#5:4'] },
  boss: { tempo: 160, chords: ['Dm', 'Dm', 'Bb', 'C', 'Dm', 'Dm', 'Bb', 'A'], drums: 2, mel: ['D5:2 F5:2 A5:2 D6:2 C6:2 A5:2 F5:2 A5:2', 'D6:4 -:2 A5:2 C6:4 D6:4', 'Bb5:2 A5:2 F5:2 D5:2 F5:2 A5:2 Bb5:4', 'C6:4 E6:4 G6:4 E6:4', 'D6:2 C6:2 A5:2 F5:2 D5:2 F5:2 A5:2 C6:2', 'D6:6 F6:2 E6:4 D6:4', 'F6:4 D6:4 Bb5:4 F5:4', 'E6:4 C#6:4 A5:4 E5:4'] },
  legend: { tempo: 72, chords: ['Am', 'F', 'C', 'G', 'Am', 'F', 'E', 'E'], drums: 0, mel: ['A4:8 E5:8', 'F5:8 C5:8', 'E5:6 G5:2 C6:8', 'B5:8 D5:8', 'C6:6 B5:2 A5:8', 'A5:6 G5:2 F5:8', 'E5:8 G#5:8', 'B5:16'] },
  sad: { tempo: 66, chords: ['Am', 'F', 'C', 'G', 'F', 'G', 'Am', 'E'], drums: 0, mel: ['E5:6 D5:2 C5:4 B4:4', 'A4:8 C5:4 F5:4', 'E5:6 D5:2 E5:4 G5:4', 'D5:12 -:4', 'C5:4 A5:4 G5:4 F5:4', 'E5:4 D5:4 G5:8', 'C5:6 B4:2 A4:8', 'G#4:12 -:4'] },
  danger: { tempo: 130, chords: ['Am', 'Bb', 'Am', 'E', 'Am', 'Bb', 'Dm', 'E'], drums: 2, mel: ['A4:2 A4:2 -:2 C5:2 A4:2 -:2 E5:4', 'D5:2 D5:2 -:2 F5:2 Bb4:2 -:2 D5:4', 'A4:2 A4:2 -:2 C5:2 E5:2 -:2 A5:4', 'G#5:4 E5:4 B4:4 G#4:4', 'A4:2 A4:2 -:2 C5:2 A4:2 -:2 E5:4', 'D5:2 D5:2 -:2 F5:2 Bb4:2 -:2 D5:4', 'F5:2 A5:2 D6:4 C6:2 A5:2 F5:4', 'E5:4 G#5:4 B5:8'] },
  ending: { tempo: 80, chords: ['C', 'G', 'Am', 'Em', 'F', 'C', 'F', 'G'], drums: 0, mel: ['E5:4 G5:4 C6:8', 'D6:4 B5:4 G5:8', 'C6:4 A5:4 E5:8', 'G5:4 E5:4 B4:8', 'A5:4 C6:4 F6:8', 'E6:4 C6:4 G5:8', 'A5:4 G5:4 F5:4 A5:4', 'G5:12 -:4'] },
  dungeon: { tempo: 90, chords: ['Em', 'C', 'Em', 'B', 'Em', 'C', 'Am', 'B'], drums: 1, mel: ['E5:4 -:2 G5:2 B5:4 -:4', 'C6:4 -:2 B5:2 G5:4 -:4', 'E5:4 F#5:2 G5:2 A5:4 G5:4', 'F#5:8 D#5:8', 'B5:4 -:2 A5:2 G5:4 E5:4', 'G5:4 -:2 E5:2 C5:4 -:4', 'A4:4 C5:4 E5:4 A5:4', 'B5:12 -:4'] },
  victory: { tempo: 140, chords: ['C', 'F', 'G', 'C'], drums: 1, once: true, mel: ['G5:2 G5:2 G5:2 C6:10', 'A5:2 A5:2 A5:2 F6:10', 'G5:2 B5:2 D6:2 G6:10', 'C6:16'] },
};

class GameAudio {
  constructor() { this.ctx = null; this.bgmOn = true; this.sfxOn = true; this.cur = null; this.want = null; this.timer = null; }
  configure(bgm, sfx) {
    this.bgmOn = bgm; this.sfxOn = sfx;
    if (!bgm) this.stopBgm(); else if (this.want && this.ctx) this.playBgm(this.want, true);
    if (!bgm && !sfx && this.ctx) { this.ctx.suspend(); }
  }
  // ユーザー操作後に呼ぶ
  unlock() {
    if (!this.bgmOn && !this.sfxOn) return;
    try {
      if (navigator.audioSession) navigator.audioSession.type = 'ambient'; // 他アプリの音楽と共存
    } catch (e) { /* 非対応 */ }
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain(); this.master.gain.value = 0.5; this.master.connect(this.ctx.destination);
      this.bgmBus = this.ctx.createGain(); this.bgmBus.gain.value = 0.16; this.bgmBus.connect(this.master);
      this.sfxBus = this.ctx.createGain(); this.sfxBus.gain.value = 0.35; this.sfxBus.connect(this.master);
      const len = this.ctx.sampleRate * 0.5; const b = this.ctx.createBuffer(1, len, this.ctx.sampleRate); const d = b.getChannelData(0); for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1; this.noiseBuf = b;
      document.addEventListener('visibilitychange', () => { if (!this.ctx) return; if (document.hidden) this.ctx.suspend(); else if (this.bgmOn || this.sfxOn) this.ctx.resume(); });
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    if (this.want && this.bgmOn && this.cur !== this.want) this.playBgm(this.want, true);
  }
  playBgm(name, force = false) {
    this.want = name;
    if (!this.bgmOn || !this.ctx) return;
    if (this.cur === name && !force) return;
    this.stopBgm(true);
    const S = SONGS[name]; if (!S) return;
    this.cur = name;
    const sixteenth = 60 / S.tempo / 4;
    // 楽譜を展開
    const notes = []; let t = 0;
    S.mel.forEach((bar) => { for (const tok of bar.split(/\s+/)) { const [n, d] = tok.split(':'); const dur = +d; if (n !== '-') notes.push({ t, d: dur, m: midi(n) }); t += dur; } });
    const total = S.chords.length * 16;
    this.song = { S, notes, total, sixteenth, start: this.ctx.currentTime + 0.08, pos: 0 };
    this._sched();
  }
  _sched() {
    if (!this.song) return;
    const { S, notes, total, sixteenth } = this.song;
    const ctx = this.ctx, ahead = ctx.currentTime + 0.5;
    while (this.song.start + this.song.pos * sixteenth < ahead) {
      const step = this.song.pos % total, loopBase = this.song.start + (this.song.pos - step) * sixteenth;
      const when = this.song.start + this.song.pos * sixteenth;
      // メロディ
      for (const n of notes) if (n.t === step) this._tone(hz(n.m), loopBase + n.t * sixteenth, n.d * sixteenth * 0.92, 'square', 0.12, this.bgmBus, 2600);
      // ベースと和音
      const bar = Math.floor(step / 16), inBar = step % 16;
      const ch = CHORD[S.chords[bar]];
      if (ch) {
        const root = 36 + ch[0] + (ch[0] > 6 ? -12 : 0) + 12;
        if (S.drums === 2) { if (inBar % 2 === 0) this._tone(hz(root + (inBar % 4 === 2 ? 12 : 0)), when, sixteenth * 1.6, 'triangle', 0.28, this.bgmBus); }
        else if (inBar % 4 === 0) this._tone(hz(root + (inBar === 8 ? 7 : 0)), when, sixteenth * 3.6, 'triangle', 0.3, this.bgmBus);
        if (inBar % 2 === 0) { const k = ch[(inBar / 2) % 3]; this._tone(hz(60 + k), when, sixteenth * 1.8, 'sine', 0.05, this.bgmBus); }
      }
      // ドラム
      if (S.drums) {
        if (inBar % 8 === 0) this._kick(when);
        if (inBar % 8 === 4) this._noise(when, 0.08, 0.16, 1800);
        if (S.drums === 2 && inBar % 2 === 1) this._noise(when, 0.03, 0.06, 7000);
        if (S.drums === 1 && inBar % 4 === 2) this._noise(when, 0.03, 0.05, 7000);
      }
      this.song.pos++;
      if (S.once && this.song.pos >= total) { const back = this.prev; this.song = null; this.cur = null; if (back) setTimeout(() => this.playBgm(back), 600); return; }
    }
    this.timer = setTimeout(() => this._sched(), 120);
  }
  stopBgm(keepWant = false) {
    if (this.timer) clearTimeout(this.timer); this.timer = null;
    this.song = null; this.cur = null;
    if (!keepWant) this.want = null;
  }
  jingle(name) { this.prev = this.want; this.playBgm(name, true); this.want = this.prev; }
  _tone(f, when, dur, type, vol, bus, lp = 0) {
    const ctx = this.ctx; const o = ctx.createOscillator(); const g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(f, when);
    g.gain.setValueAtTime(0, when); g.gain.linearRampToValueAtTime(vol, when + 0.01); g.gain.setValueAtTime(vol, when + Math.max(0.02, dur - 0.04)); g.gain.linearRampToValueAtTime(0, when + dur);
    let node = o;
    if (lp) { const fl = ctx.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = lp; o.connect(fl); node = fl; }
    node.connect(g); g.connect(bus); o.start(when); o.stop(when + dur + 0.02);
  }
  _noise(when, dur, vol, hp) {
    const ctx = this.ctx; const s = ctx.createBufferSource(); s.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = hp;
    const g = ctx.createGain(); g.gain.setValueAtTime(vol, when); g.gain.exponentialRampToValueAtTime(0.001, when + dur);
    s.connect(f); f.connect(g); g.connect(this.bgmBus); s.start(when); s.stop(when + dur + 0.01);
  }
  _kick(when) {
    const ctx = this.ctx; const o = ctx.createOscillator(); const g = ctx.createGain();
    o.frequency.setValueAtTime(140, when); o.frequency.exponentialRampToValueAtTime(40, when + 0.12);
    g.gain.setValueAtTime(0.5, when); g.gain.exponentialRampToValueAtTime(0.001, when + 0.15);
    o.connect(g); g.connect(this.bgmBus); o.start(when); o.stop(when + 0.16);
  }
  sfx(name) {
    if (!this.sfxOn || !this.ctx) return;
    const t = this.ctx.currentTime + 0.01, B = this.sfxBus;
    const seq = (arr, type = 'square', step = 0.06, vol = 0.25) => arr.forEach((m, i) => this._tone(hz(m), t + i * step, step * 1.1, type, vol, B));
    switch (name) {
      case 'select': seq([84], 'square', 0.05, 0.15); break;
      case 'cancel': seq([72, 67], 'square', 0.05, 0.15); break;
      case 'hit': { const s = this.ctx.createBufferSource(); s.buffer = this.noiseBuf; const g = this.ctx.createGain(); g.gain.setValueAtTime(0.5, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.18); s.connect(g); g.connect(B); s.start(t); s.stop(t + 0.2); break; }
      case 'super': seq([60, 72, 84], 'sawtooth', 0.04, 0.2); this.sfx('hit'); break;
      case 'heal': seq([72, 76, 79, 84], 'sine', 0.07, 0.25); break;
      case 'lvup': seq([72, 76, 79, 84, 79, 84], 'square', 0.08, 0.2); break;
      case 'catch': seq([79, 84, 88, 91, 96], 'square', 0.07, 0.2); break;
      case 'fail': seq([67, 64, 60], 'triangle', 0.1, 0.3); break;
      case 'encounter': seq([60, 63, 66, 69, 72, 75, 78, 81], 'square', 0.035, 0.2); break;
      case 'warp': seq([60, 67, 72, 79, 84, 91], 'sine', 0.05, 0.25); break;
      case 'evolve': seq([60, 64, 67, 72, 76, 79, 84, 88, 91, 96], 'triangle', 0.09, 0.3); break;
      case 'item': seq([76, 81, 88], 'square', 0.07, 0.18); break;
      case 'shiny': seq([96, 100, 103, 108], 'sine', 0.05, 0.2); break;
      case 'faint': seq([67, 64, 60, 55], 'triangle', 0.12, 0.3); break;
      case 'stat': seq([72, 79], 'sine', 0.06, 0.2); break;
      case 'bump': seq([48], 'triangle', 0.05, 0.2); break;
    }
  }
}
export const audio = new GameAudio();
