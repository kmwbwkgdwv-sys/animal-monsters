// =============================================================
//  ミニマップ（右上の丸い地図）と「次の行き先」の案内
//   ・見ている方向が上になるように回る（N の印が北）
//   ・町・岩・ダンジョン・野生のアニモン・話しかける人（！）
//   ・次の行き先は ⭐。地図の外にあるときは ふちに矢印と距離
//   ・3D の世界にも 行き先に 光の柱を立てる
//   ・押すと 大陸マップを開く
// =============================================================
import { G } from '../game/state.js';
import { OW, runFlow } from '../game/overworld.js';
import { TOWNS, STONES, DUNGEONS } from '../data/world.js';
import { SPECIES } from '../data/species.js';
import { navTarget } from '../game/storyEngine.js';
import { errandMark } from '../game/errands.js';
import { getMapImage, worldToImg, IMG_PER_UNIT } from './mapimage.js';
import { Node, PRIM } from '../engine/gl3d.js';
import * as MENU from './menus.js';

const VIEW = 75; // ミニマップの半径（世界の単位）
let cv = null, ctx = null, wrap = null, navEl = null, acc = 0, tgt = null, tgtT = 0, beacon = null;

export function initMinimap() {
  wrap = document.getElementById('minimap');
  navEl = document.getElementById('navline');
  if (!wrap) return;
  cv = wrap.querySelector('canvas'); ctx = cv.getContext('2d');
  // 押して 少しずれて 離しても 開くように（カメラの ⟲ ボタンは べつ）
  let down = null, fired = 0;
  const open = () => { if (G.state === 'world') runFlow(() => MENU.openMap()); };
  wrap.addEventListener('pointerdown', (e) => { if (e.target.closest('#btnCam')) return; e.stopPropagation(); down = { id: e.pointerId, x: e.clientX, y: e.clientY }; try { wrap.setPointerCapture(e.pointerId); } catch (er) { /* */ } });
  wrap.addEventListener('pointerup', (e) => { if (!down || e.pointerId !== down.id) return; const ok = Math.hypot(e.clientX - down.x, e.clientY - down.y) < 45; down = null; if (ok) { fired = performance.now(); open(); } });
  wrap.addEventListener('pointercancel', () => { down = null; });
  wrap.addEventListener('click', (e) => { if (e.target.closest('#btnCam') || performance.now() - fired < 700) return; open(); });
}

function ensureBeacon() {
  if (beacon || !OW.scene) return;
  beacon = new Node();
  const col = new Node(PRIM.cyl, { color: [1, 0.86, 0.3], alpha: 0.32, unlit: true, outline: 0, castShadow: false, receiveShadow: false, noFog: true });
  col.noDepthWrite = true; col.cull = false; col.setScale(0.9, 60, 0.9);
  const core = new Node(PRIM.cyl, { color: [1, 1, 0.85], alpha: 0.55, unlit: true, outline: 0, castShadow: false, receiveShadow: false, noFog: true });
  core.noDepthWrite = true; core.cull = false; core.setScale(0.3, 60, 0.3);
  const ring = new Node(PRIM.torus, { color: [1, 0.85, 0.25], alpha: 0.85, unlit: true, outline: 0, castShadow: false, receiveShadow: false });
  ring.noDepthWrite = true; ring.setScale(2.2, 0.6, 2.2); ring.setPos(0, 0.3, 0);
  beacon.add(col, core, ring); beacon.ring = ring; beacon.col = col;
  OW.scene.add(beacon);
}

export function updateMinimap(dt) {
  if (!wrap) return;
  const on = G.state === 'world' && !!OW.player && !OW.dungeon;
  wrap.style.display = on ? '' : 'none';
  if (navEl) navEl.style.display = on && tgt ? '' : 'none';
  if (!on) { if (beacon) beacon.visible = false; return; }
  const P = OW.player;
  // 行き先は 0.5秒ごとに調べなおす
  tgtT -= dt;
  if (tgtT <= 0) { tgtT = 0.5; try { tgt = navTarget(); } catch (e) { tgt = null; } }
  // 光の柱
  ensureBeacon();
  if (beacon) {
    const d = tgt ? Math.hypot(tgt.x - P.x, tgt.z - P.z) : 0;
    beacon.visible = !!tgt && d > 6 && !G.busy;
    if (beacon.visible) {
      beacon.setPos(tgt.x, G.world.groundAt(tgt.x, tgt.z), tgt.z);
      const t = performance.now() / 1000;
      beacon.ring.setScale(2.2 + Math.sin(t * 3) * 0.4, 0.6, 2.2 + Math.sin(t * 3) * 0.4);
      beacon.col.color[3] = 0.22 + Math.sin(t * 2) * 0.08 + Math.min(0.15, d / 600);
    }
  }
  const yaw = OW.camYawS || 0;
  const cy = Math.cos(yaw), sy = Math.sin(yaw);
  // 世界の向き → 画面の向き（見ている方向が上）
  const rot = (dx, dz) => [dx * cy - dz * sy, dx * sy + dz * cy];
  // HUD の案内（矢印と距離）
  if (navEl && tgt) {
    const r = rot(tgt.x - P.x, tgt.z - P.z), d = Math.hypot(r[0], r[1]);
    const a = Math.atan2(r[0], -r[1]) * 180 / Math.PI;
    const arrow = navEl.querySelector('.arr'); if (arrow) arrow.style.transform = `rotate(${a.toFixed(0)}deg)`;
    const dist = navEl.querySelector('.dist'); if (dist) dist.textContent = d < 8 ? 'もうすぐ！' : `${Math.round(d)}m`;
    const lab = navEl.querySelector('.lab'); if (lab && lab.textContent !== tgt.label) lab.textContent = tgt.label;
    navEl.classList.toggle('quest', tgt.kind === 'quest');
  }
  // 描くのは 1秒に12回まで
  acc += dt; if (acc < 1 / 12) return; acc = 0;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const size = wrap.clientWidth || 120;
  if (cv.width !== Math.round(size * dpr)) { cv.width = cv.height = Math.round(size * dpr); }
  const g = ctx, R = size / 2, k = (R - 3) / VIEW;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, size, size);
  g.save();
  g.beginPath(); g.arc(R, R, R - 2, 0, Math.PI * 2); g.clip();
  g.fillStyle = '#2a5fae'; g.fillRect(0, 0, size, size);
  // 地図（回して、現在地を中心に）
  g.save();
  g.translate(R, R); g.rotate(yaw); g.scale(k / IMG_PER_UNIT, k / IMG_PER_UNIT);
  const q = worldToImg(P.x, P.z);
  g.imageSmoothingEnabled = true;
  g.drawImage(getMapImage(), -q[0], -q[1]);
  g.restore();
  // 印
  const at = (x, z) => { const r = rot(x - P.x, z - P.z); return [R + r[0] * k, R + r[1] * k, Math.hypot(r[0], r[1]) * k]; };
  const inside = (p) => p[2] < R - 6;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  for (const t of TOWNS) { const p = at(t.pos[0], t.pos[1]); if (p[2] > R + 20) continue; g.fillStyle = 'rgba(255,240,200,.85)'; g.strokeStyle = '#6b4a20'; g.lineWidth = 1.5; g.beginPath(); g.arc(p[0], p[1], Math.max(5, t.r * k * 0.55), 0, Math.PI * 2); g.fill(); g.stroke(); g.font = `${Math.round(R * 0.2)}px sans-serif`; g.fillText('🏠', p[0], p[1]); }
  for (const st of STONES) { if (st.town) continue; const p = at(st.pos[0], st.pos[1]); if (!inside(p)) continue; g.font = `bold ${Math.round(R * 0.17)}px sans-serif`; g.fillStyle = G.save.stones[st.id] ? '#55eeff' : '#ccc'; g.fillText('◆', p[0], p[1]); }
  for (const d of Object.values(DUNGEONS)) { const p = at(d.pos[0], d.pos[1]); if (!inside(p)) continue; g.font = `${Math.round(R * 0.18)}px sans-serif`; g.fillText('⛩', p[0], p[1]); }
  for (const w of OW.wilds) {
    const p = at(w.x, w.z); if (!inside(p)) continue;
    const rare = SPECIES[w.mon.sp]?.rarity >= 4;
    g.fillStyle = w.mon.shiny ? '#ffe14d' : rare ? '#c77dff' : '#ff6b5a';
    g.beginPath(); g.arc(p[0], p[1], 2.4 + Math.min(2.5, (w.big || 1)), 0, Math.PI * 2); g.fill();
    if (rare || w.mon.shiny) { g.strokeStyle = '#fff'; g.lineWidth = 1.2; g.stroke(); }
  }
  for (const n of OW.npcs) { if (n.kind !== 'trainer' || G.save.defeated[n.id]) continue; const p = at(n.x, n.z); if (!inside(p)) continue; g.fillStyle = '#ffffff'; g.strokeStyle = '#d33'; g.lineWidth = 1.5; g.beginPath(); g.arc(p[0], p[1], 3.5, 0, Math.PI * 2); g.fill(); g.stroke(); }
  // おつかい（🧺 お願い・💰 報告・📦 届け物）
  g.font = `${Math.round(R * 0.15)}px sans-serif`;
  for (const n of OW.npcs) { if (n.kind !== 'errand') continue; const p = at(n.x, n.z); if (!inside(p)) continue; const mk = errandMark(n); if (mk) g.fillText(mk, p[0], p[1]); }
  // 行き先
  if (tgt) {
    const p = at(tgt.x, tgt.z);
    const pulse = 1 + Math.sin(performance.now() / 220) * 0.15;
    if (inside(p)) { g.save(); g.shadowColor = '#ffd23f'; g.shadowBlur = 8; g.font = `${Math.round(R * 0.28 * pulse)}px sans-serif`; g.fillText('⭐', p[0], p[1]); g.restore(); }
    else {
      // ふちに矢印
      const a = Math.atan2(p[1] - R, p[0] - R), e = R - 11;
      const ex = R + Math.cos(a) * e, ey = R + Math.sin(a) * e;
      g.save(); g.translate(ex, ey); g.rotate(a); g.scale(pulse, pulse);
      g.fillStyle = tgt.kind === 'quest' ? '#5ad1ff' : '#ffd23f'; g.strokeStyle = '#3a2400'; g.lineWidth = 1.5;
      g.beginPath(); g.moveTo(9, 0); g.lineTo(-6, -7); g.lineTo(-3, 0); g.lineTo(-6, 7); g.closePath(); g.fill(); g.stroke(); g.restore();
    }
  }
  // 自分（中心の三角：向いている方向）
  const f = rot(Math.sin(P.ry), Math.cos(P.ry)), fa = Math.atan2(f[1], f[0]);
  g.save(); g.translate(R, R); g.rotate(fa + Math.PI / 2);
  g.fillStyle = '#ff3344'; g.strokeStyle = '#fff'; g.lineWidth = 2; g.beginPath(); g.moveTo(0, -8); g.lineTo(6, 6); g.lineTo(0, 3); g.lineTo(-6, 6); g.closePath(); g.fill(); g.stroke();
  g.restore();
  // 見えている範囲（うすい扇形）
  g.save(); g.translate(R, R); g.fillStyle = 'rgba(255,255,255,.12)'; g.beginPath(); g.moveTo(0, 0); g.arc(0, 0, R, -Math.PI / 2 - 0.55, -Math.PI / 2 + 0.55); g.closePath(); g.fill(); g.restore();
  g.restore();
  // 北の印
  const nx = R + Math.sin(yaw) * (R - 9), ny = R - Math.cos(yaw) * (R - 9);
  g.fillStyle = '#e8303f'; g.beginPath(); g.arc(nx, ny, 7.5, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#fff'; g.font = 'bold 10px sans-serif'; g.fillText('N', nx, ny + 0.5);
}
