// 18タイプと相性表
export const TYPES = ['normal', 'fire', 'water', 'grass', 'steel', 'poison', 'electric', 'ice', 'fighting', 'ground', 'flying', 'psychic', 'bug', 'rock', 'ghost', 'dragon', 'dark', 'fairy'];
export const TYPE_JA = {
  normal: 'ノーマル', fire: '炎', water: '水', grass: '草', steel: '鋼', poison: '毒', electric: '電気', ice: '氷', fighting: '格闘',
  ground: '地面', flying: '飛行', psychic: 'エスパー', bug: 'むし', rock: '岩', ghost: 'ゴースト', dragon: 'ドラゴン', dark: '悪', fairy: 'フェアリー',
};
export const TYPE_COLOR = {
  normal: '#c9b98f', fire: '#f06a2a', water: '#3a8ee6', grass: '#4fb043', steel: '#8f9cab', poison: '#9d5ccf', electric: '#f2c21b', ice: '#7fd6ea', fighting: '#c84a3a',
  ground: '#c0904e', flying: '#8fb5f5', psychic: '#f0609e', bug: '#94b52a', rock: '#a8925f', ghost: '#6a5aa8', dragon: '#5a62e0', dark: '#4a4256', fairy: '#f19ad0',
};
// 体色（アニモン本体用：タイプ色より少し柔らかい）
export const TYPE_BODY = {
  normal: ['#e3d3ad', '#8b7556'], fire: ['#f2733a', '#ffd25a'], water: ['#4a9cf0', '#d2efff'], grass: ['#62c254', '#d6f07a'], steel: ['#a5b2c0', '#5d6b78'],
  poison: ['#a568d6', '#e7b9f6'], electric: ['#f7d43e', '#3c3a40'], ice: ['#b2ecf7', '#ffffff'], fighting: ['#d25a46', '#f4d6a6'], ground: ['#c4955a', '#6e4c2c'],
  flying: ['#a7c8ff', '#ffffff'], psychic: ['#f278b4', '#ffe0ef'], bug: ['#a6c635', '#4b5a1b'], rock: ['#a8987a', '#5c503c'], ghost: ['#7565b8', '#2b2152'],
  dragon: ['#6270ec', '#eacb60'], dark: ['#4a4558', '#d65050'], fairy: ['#f9b4dc', '#ffffff'],
};

const W = 2, H = 0.5, N = 0; // 抜群 / いまひとつ / 無効
const C = {
  normal: { rock: H, ghost: N, steel: H },
  fire: { fire: H, water: H, grass: W, ice: W, bug: W, rock: H, dragon: H, steel: W },
  water: { fire: W, water: H, grass: H, ground: W, rock: W, dragon: H },
  electric: { water: W, electric: H, grass: H, ground: N, flying: W, dragon: H },
  grass: { fire: H, water: W, grass: H, poison: H, ground: W, flying: H, bug: H, rock: W, dragon: H, steel: H },
  ice: { fire: H, water: H, grass: W, ice: H, ground: W, flying: W, dragon: W, steel: H },
  fighting: { normal: W, ice: W, poison: H, flying: H, psychic: H, bug: H, rock: W, ghost: N, dark: W, steel: W, fairy: H },
  poison: { grass: W, poison: H, ground: H, rock: H, ghost: H, steel: N, fairy: W },
  ground: { fire: W, electric: W, grass: H, poison: W, flying: N, bug: H, rock: W, steel: W },
  flying: { electric: H, grass: W, fighting: W, bug: W, rock: H, steel: H },
  psychic: { fighting: W, poison: W, psychic: H, dark: N, steel: H },
  bug: { fire: H, grass: W, fighting: H, poison: H, flying: H, psychic: W, ghost: H, dark: W, steel: H, fairy: H },
  rock: { fire: W, ice: W, fighting: H, ground: H, flying: W, bug: W, steel: H },
  ghost: { normal: N, psychic: W, ghost: W, dark: H },
  dragon: { dragon: W, steel: H, fairy: N },
  dark: { fighting: H, psychic: W, ghost: W, dark: H, fairy: H },
  steel: { fire: H, water: H, electric: H, ice: W, rock: W, steel: H, fairy: W },
  fairy: { fire: H, fighting: W, poison: H, dragon: W, dark: W, steel: H },
};
export function typeEff(atk, defTypes) {
  let m = 1;
  for (const d of defTypes) { const v = C[atk]?.[d]; if (v !== undefined) m *= v; }
  return m;
}
export function typeBadge(t) {
  return `<span class="tbadge" style="background:${TYPE_COLOR[t]}">${TYPE_JA[t]}</span>`;
}
