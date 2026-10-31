// セーブデータ（端末内 localStorage ＋ 引き継ぎ時はFirebase）
import { START_POS } from '../data/world.js';

export const SAVE_KEY = 'animon_save_v1';
export const SETTINGS_KEY = 'animon_settings_v1';

// 感度（1 = ふつう）：camSens 視点の左右・camSensY 視点の上下・stickSens スティック・zoomSens ズーム、camInvX/camInvY 反転
export function defaultSettings() { return { bgm: true, sfx: true, light: false, autoSkip: false, textSpeed: 1, camSens: 1, camSensY: 1, camInvX: false, camInvY: false, stickSens: 1, zoomSens: 1 }; }
export function loadSettings() {
  try { return { ...defaultSettings(), ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') }; } catch (e) { return defaultSettings(); }
}
export function saveSettings(s) { try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); } catch (e) { /* 容量不足など */ } }

export function newState(name, look) {
  return {
    v: 1, name, look, money: 3000,
    pos: [-18, START_POS[1] + 22], ry: Math.PI,
    party: [], box: [],
    bag: { herb: 3 },
    dex: { seen: {}, caught: {} },
    story: { step: 0, crests: 0, starter: null, legend: null, luluUid: null, lulu: null, flags: {} },
    quests: {}, defeated: {}, stones: { t_start: true }, items: {}, cleared: {},
    unlocked: ['start'], lastHospital: 't_start',
    postGame: false, playTime: 0, created: Date.now(), saved: Date.now(),
    pid: null, transferCode: null,
  };
}
export function hasSave() { try { return !!localStorage.getItem(SAVE_KEY); } catch (e) { return false; } }
export function loadGame() {
  try { const s = JSON.parse(localStorage.getItem(SAVE_KEY)); return s && s.v ? s : null; } catch (e) { return null; }
}
export function writeGame(st) {
  st.saved = Date.now();
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(st)); return true; } catch (e) { return false; }
}
export function deleteGame() { try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* */ } }
