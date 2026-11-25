import { hash2, mulberry32 } from '../core/util.js';

// diffStep = metros por nível de dificuldade (0–4): progressão lenta, mar grande e vazio entre ilhas
export const WORLD_LOOT_PARAMS = { chunkSize: 90, islandChance: 0.04, wreckChance: 0.22, diffStep: 850 };

// Ilha no chunk? (mesma regra/ordem de RNG que World.makeChunk)
export function chunkHasIsland(seed, cx, cz) {
  if (cx === 0 && cz === 0) return false;
  if (cx === 0 && cz === 1) return true;
  return mulberry32(hash2(seed, cx, cz))() < WORLD_LOOT_PARAMS.islandChance;
}

// Naufrágio no fundo do mar (explorável quando o oceano seca) com 1–2 baús e destroços.
// RNG próprio: não altera a geração antiga do mundo.
export function wreckFor(seed, cx, cz) {
  if (Math.abs(cx) + Math.abs(cz) <= 1 || chunkHasIsland(seed, cx, cz)) return null;
  const r = mulberry32(hash2(seed ^ 0x5a17c3, cx, cz));
  if (r() >= WORLD_LOOT_PARAMS.wreckChance) return null;
  const S = WORLD_LOOT_PARAMS.chunkSize;
  return {
    cx, cz, x: cx * S + (r() - 0.5) * 50, z: cz * S + (r() - 0.5) * 50, yaw: r() * Math.PI * 2,
    crates: (r(), 1), debris: 1 + ((r() * 2) | 0), rng: r, // 1 baú e poucos destroços (era 1–2 / 3–5)
  };
}

// Caixotes de suprimento espalhados no fundo do mar (só dá para abrir com o mar seco).
// ids s<cx>,<cz>c<n>; RNG próprio (não mexe no resto do mundo).
export function seabedCratesFor(seed, cx, cz) {
  if (Math.abs(cx) + Math.abs(cz) <= 1 || chunkHasIsland(seed, cx, cz)) return [];
  const r = mulberry32(hash2(seed ^ 0x3c6ef372, cx, cz)), S = WORLD_LOOT_PARAMS.chunkSize, out = [];
  const n = r() < 0.18 ? 1 : 0; // seca com poucos caixotes (antes ~0,6 por chunk, agora ~0,18)
  for (let i = 0; i < n; i++) out.push({ x: cx * S + (r() - 0.5) * (S - 34), z: cz * S + (r() - 0.5) * (S - 34), yaw: r() * 6.28 }); // dentro do alcance que o servidor aceita (±32 m do centro)
  return out;
}

// CANHÕES E ARPÕES NO FUNDO DO MAR: ficam jogados no chão da seca (meio enterrados) e se pegam com E
// quando o mar baixa. Canhão improvisado em qualquer lugar; canhão de ferro do meio da rota em diante
// (região 2+); torreta-arpão a partir da região 1. Por chunk de 90 m (fora de ilhas e da largada).
export const SEABED_FINDS = { canhao: 0.1, canhao_ferro: 0.06, gancho: 0.06 };
export function seabedFindsFor(seed, cx, cz) {
  if (Math.abs(cx) + Math.abs(cz) <= 1 || chunkHasIsland(seed, cx, cz)) return [];
  const r = mulberry32(hash2(seed ^ 0x5be0cd19, cx, cz)), S = WORLD_LOOT_PARAMS.chunkSize, out = [];
  const diff = Math.min(4, Math.floor(Math.hypot(cx * S, cz * S) / WORLD_LOOT_PARAMS.diffStep));
  const spot = (kind) => out.push({ kind, x: cx * S + (r() - 0.5) * (S - 20), z: cz * S + (r() - 0.5) * (S - 20), yaw: r() * 6.28, tilt: (r() - 0.5) * 0.5 });
  if (r() < SEABED_FINDS.canhao) spot('canhao');
  if (r() < (diff >= 2 ? SEABED_FINDS.canhao_ferro : 0)) spot('canhao_ferro');
  if (r() < (diff >= 1 ? SEABED_FINDS.gancho : SEABED_FINDS.gancho * 0.4)) spot('gancho');
  return out;
}

// Estruturas no MEIO DO MAR (sem ilha): torre de sucata com morteiro (derrubável a canhão) ou
// prédio afundado e inclinado (sobe pela face torta; às vezes tem inimigos; caixotes p<cx>,<cz>c<n>).
// RNG próprio; nunca no mesmo chunk de ilha ou naufrágio.
// mar mais vazio; na ZONA PIRATA (dif. 0–1) aparecem as tralhas: torre de tralha e barraco de sucata
export const SEA_SITES = { predio: 0.035, torre: 0.02, torrePerDiff: 0.006, tralha: 0.05, barraco: 0.045 };
export function seaSiteFor(seed, cx, cz) {
  if (Math.abs(cx) + Math.abs(cz) <= 2 || chunkHasIsland(seed, cx, cz) || wreckFor(seed, cx, cz)) return null;
  const r = mulberry32(hash2(seed ^ 0x2f6b91d3, cx, cz)), S = WORLD_LOOT_PARAMS.chunkSize;
  const diff = Math.min(4, Math.floor(Math.hypot(cx * S, cz * S) / WORLD_LOOT_PARAMS.diffStep)), roll = r();
  let kind = null, acc = SEA_SITES.predio;
  if (roll < acc) kind = 'predio';
  else if (diff >= 1 && roll < (acc += SEA_SITES.torre + diff * SEA_SITES.torrePerDiff)) kind = 'torre';
  else if (diff <= 1 && roll < (acc += SEA_SITES.tralha)) kind = 'tralha';
  else if (diff <= 1 && roll < (acc += SEA_SITES.barraco)) kind = 'barraco';
  if (!kind) return null;
  return {
    kind, cx, cz, diff, x: cx * S + (r() - 0.5) * 36, z: cz * S + (r() - 0.5) * 36, yaw: r() * Math.PI * 2,
    crates: kind === 'predio' ? (r() < 0.4 ? 2 : 1) : kind === 'torre' ? 0 : 1, rng: r,
  };
}

export const LOOT_CONFIG = {
  starterCache: {
    id: 'i0,1c0',
    pistolAmmo: 12,
    bandageBase: 1,
    bandagesPerPlayer: 1,
  },
  crateTypes: {
    supply: { resourceRolls: [1, 2], weaponChance: [0.08, 0.18, 0.32, 0.5, 0.68] },
    danger: { resourceRolls: [2, 3], weaponChance: [0.18, 0.3, 0.48, 0.68, 0.82] },
  },
  regions: [
    {
      rarity: [0.76, 0.24, 0, 0, 0],
      resources: [
        ['municao', 3, 5, 3], ['bandagem', 1, 1, 1], ['barra_proteina', 1, 1, 1], ['chocolate', 1, 1, 1], ['energetico', 1, 1, 1],
      ],
    },
    {
      rarity: [0.45, 0.43, 0.12, 0, 0],
      resources: [
        ['municao', 3, 6, 3], ['cartucho', 2, 3, 1], ['bandagem', 1, 1, 1], ['barra_proteina', 1, 1, 1], ['chocolate', 1, 2, 1], ['energetico', 1, 1, 1],
      ],
    },
    {
      rarity: [0.2, 0.43, 0.3, 0.065, 0.005],
      resources: [
        ['municao', 4, 7, 3], ['cartucho', 2, 4, 2], ['bandagem', 1, 1, 1], ['kit', 1, 1, 1], ['barra_proteina', 1, 2, 1], ['chocolate', 1, 2, 1], ['energetico', 1, 2, 1],
      ],
    },
    {
      rarity: [0.07, 0.27, 0.42, 0.21, 0.03],
      resources: [
        ['municao', 5, 9, 3], ['cartucho', 3, 5, 2], ['bandagem', 1, 1, 1], ['kit', 1, 1, 1], ['barra_proteina', 1, 1, 1], ['chocolate', 1, 1, 1], ['energetico', 1, 1, 1],
      ],
    },
    {
      rarity: [0.01, 0.1, 0.31, 0.43, 0.15],
      resources: [
        ['municao', 6, 12, 3], ['cartucho', 3, 6, 2], ['bandagem', 1, 2, 1], ['kit', 1, 1, 2], ['barra_proteina', 1, 2, 1], ['chocolate', 1, 2, 1], ['energetico', 1, 2, 1],
      ],
    },
  ],
  weaponsByStar: {
    1: ['tabua_prego', 'cano', 'faca_manteiga', 'bastao'],
    2: ['facao', 'revolver'],
    3: ['pistola'],
    4: ['escopeta', 'rifle'],
    5: ['rifle_precisao'],
  },
};

function seededRandom(seed, id) {
  let state = seed >>> 0;
  for (let i = 0; i < id.length; i++) {
    state = Math.imul(state ^ id.charCodeAt(i), 16777619) >>> 0;
  }
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function chooseWeighted(random, entries, weightIndex = 3) {
  const total = entries.reduce((sum, entry) => sum + entry[weightIndex], 0);
  let roll = random() * total;
  for (const entry of entries) {
    roll -= entry[weightIndex];
    if (roll < 0) return entry;
  }
  return entries[entries.length - 1];
}

export function generateCrateLoot(seed, id, difficulty, playerCount = 1) {
  if (id === LOOT_CONFIG.starterCache.id) {
    return {
      arma_pistola: 1,
      arma_martelo: 1, // conserta a jangada (única forma de reparo)
      bandagem: LOOT_CONFIG.starterCache.bandageBase +
        Math.max(1, playerCount) * LOOT_CONFIG.starterCache.bandagesPerPlayer,
      municao: LOOT_CONFIG.starterCache.pistolAmmo,
    };
  }

  const regionIndex = Math.max(0, Math.min(4, Math.floor(difficulty)));
  if (id.startsWith('s')) { // caixote da seca: só o básico (curativo, munição, comida)
    const random = seededRandom(seed, id), loot = {}, add = (k, n) => { loot[k] = (loot[k] || 0) + n; };
    if (random() < 0.25) add('bandagem', 1);
    add('municao', 3 + Math.floor(random() * 4) + regionIndex);
    if (random() < 0.3) add('cartucho', 2 + Math.floor(random() * 2));
    const foods = ['barra_proteina', 'energetico', 'chocolate'];
    if (random() < 0.7) add(foods[Math.floor(random() * 3)], 1);
    if (regionIndex >= 2 && random() < 0.1) add('kit', 1);
    random(); // (antes: canhão no caixote — agora canhões e arpões ficam soltos no fundo, ver seabedFindsFor)
    return loot;
  }
  const region = LOOT_CONFIG.regions[regionIndex];
  const type = LOOT_CONFIG.crateTypes[regionIndex >= 3 ? 'danger' : 'supply'];
  const random = seededRandom(seed, id);
  const loot = {};
  const add = (item, amount) => { loot[item] = (loot[item] || 0) + amount; };
  const rolls = type.resourceRolls[0] +
    Math.floor(random() * (type.resourceRolls[1] - type.resourceRolls[0] + 1));

  for (let i = 0; i < rolls; i++) {
    const [item, min, max] = chooseWeighted(random, region.resources);
    add(item, min + Math.floor(random() * (max - min + 1)));
  }

  const weaponChance = type.weaponChance[regionIndex];
  if (random() < weaponChance) {
    const roll = random();
    let cumulative = 0, stars = 1;
    for (let i = 0; i < region.rarity.length; i++) {
      cumulative += region.rarity[i];
      if (roll < cumulative) { stars = i + 1; break; }
    }
    const pool = LOOT_CONFIG.weaponsByStar[stars];
    const weapon = pool[Math.floor(random() * pool.length)];
    add(`arma_${weapon}`, 1);
    if (weapon === 'revolver') add('municao', 4 + Math.floor(random() * 4));
    else if (weapon === 'pistola') add('municao', 5 + Math.floor(random() * 5));
    else if (weapon === 'escopeta') add('cartucho', 3 + Math.floor(random() * 3));
    else if (weapon === 'rifle') add('municao', 6 + Math.floor(random() * 6));
    else if (weapon === 'rifle_precisao') add('municao', 3 + Math.floor(random() * 4));
  }

  const wreck = id.startsWith('b');
  // Canhão improvisado (galão d'água): já no começo da jornada (região 0), mais comum em naufrágios e
  // mais longe na rota. As balas são infinitas (o canhão só tem recarga longa).
  // Canhões e torreta-arpão NÃO saem mais de caixas: ficam jogados no fundo do mar e são achados
  // na seca, como os outros objetos (seabedFindsFor). Os sorteios continuam aqui só para o resto do
  // loot sair igual ao de antes.
  random(); if (regionIndex >= 2) random(); random();
  // Ferramentas: BANJO e martelo extra em caixas.
  if (random() < (wreck ? 0.15 : regionIndex >= 1 ? 0.08 : 0.03)) add('arma_banjo', 1);
  if (regionIndex >= 1 && random() < 0.05) add('arma_martelo', 1);

  // COLETE BALÍSTICO: só na Zona Militar (região 2) e UM por ilha (sempre na 1ª caixa dela)
  if (regionIndex === 2 && /^i-?\d+,-?\d+c0$/.test(id)) add('colete', 1);
  if (random() < 0.12 + regionIndex * 0.05) { // curativo extra: raro (antes saía demais)
    add(regionIndex >= 2 && random() < 0.25 ? 'kit' : 'bandagem', 1);
  }
  return loot;
}

export function difficultyForCrateId(id) {
  const match = /^[ibsp](-?\d+),(-?\d+)c\d+$/.exec(id);
  if (!match) return 0;
  const x = Number(match[1]) * WORLD_LOOT_PARAMS.chunkSize;
  const z = Number(match[2]) * WORLD_LOOT_PARAMS.chunkSize;
  return Math.min(4, Math.floor(Math.hypot(x, z) / WORLD_LOOT_PARAMS.diffStep));
}

export function isGeneratedCrate(seed, id) {
  const wreck = /^b(-?\d+),(-?\d+)c(\d+)$/.exec(id);
  if (wreck) { const w = wreckFor(seed, Number(wreck[1]), Number(wreck[2])); return !!w && Number(wreck[3]) < w.crates; }
  const sea = /^s(-?\d+),(-?\d+)c(\d+)$/.exec(id);
  if (sea) return Number(sea[3]) < seabedCratesFor(seed, Number(sea[1]), Number(sea[2])).length;
  const site = /^p(-?\d+),(-?\d+)c(\d+)$/.exec(id);
  if (site) { const st = seaSiteFor(seed, Number(site[1]), Number(site[2])); return !!st && Number(site[3]) < st.crates; }
  const match = /^i(-?\d+),(-?\d+)c(\d+)$/.exec(id);
  if (!match) return false;
  const cx = Number(match[1]), cz = Number(match[2]), crateIndex = Number(match[3]);
  if (cx === 0 && cz === 0) return false;
  if (cx === 0 && cz === 1) return crateIndex < 3; // ilha inicial
  // ilha existe neste chunk; os caixotes dela (ruínas + acampamento) são no máximo 6
  return chunkHasIsland(seed, cx, cz) && crateIndex < 6;
}
