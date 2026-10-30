// 大陸の地図画像（マップ・ミニマップ共通）。地形の高さと地域から1度だけ作る
import { G } from '../game/state.js';
import { WORLD } from '../data/world.js';

let img = null;
const COLS = { start: [140, 200, 110], plains: [130, 200, 100], forest: [60, 140, 60], lake: [120, 190, 110], desert: [230, 205, 140], canyon: [200, 120, 80], snow: [235, 240, 250], swamp: [100, 115, 75], highland: [150, 210, 120], volcano: [90, 75, 75], sanctuary: [210, 200, 150], inner: [200, 185, 235], sea: [60, 120, 200] };
const RID = ['start', 'plains', 'forest', 'lake', 'desert', 'canyon', 'snow', 'swamp', 'highland', 'volcano', 'sanctuary', 'inner', 'sea'];

export function getMapImage() {
  if (img) return img;
  const W = G.world, N = WORLD.n;
  const oc = document.createElement('canvas'); oc.width = N; oc.height = N;
  const g = oc.getContext('2d');
  const im = g.createImageData(N, N);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const k = j * N + i;
    const h = W.H[j * (N + 1) + i];
    let c = COLS[RID[W.REG[k]]] || [0, 0, 0];
    if (h < -0.4) c = h < -5 ? [40, 90, 170] : [70, 140, 215];
    else {
      // 東西方向の傾きで陰影をつけて、起伏が見えるように
      const hx = W.H[j * (N + 1) + Math.min(N, i + 1)] - h;
      const sh = Math.max(0.68, Math.min(1.28, 0.86 + h / 60 - hx * 0.05));
      c = c.map(v => Math.min(255, v * sh));
      if (W.ROAD[k]) c = [222, 198, 148];
    }
    im.data[k * 4] = c[0]; im.data[k * 4 + 1] = c[1]; im.data[k * 4 + 2] = c[2]; im.data[k * 4 + 3] = 255;
  }
  g.putImageData(im, 0, 0);
  img = oc;
  return img;
}
// 世界の座標 → 地図画像の座標（0〜N）
export const worldToImg = (x, z) => [(x + WORLD.half) / (WORLD.half * 2) * WORLD.n, (z + WORLD.half) / (WORLD.half * 2) * WORLD.n];
export const IMG_PER_UNIT = WORLD.n / (WORLD.half * 2);
