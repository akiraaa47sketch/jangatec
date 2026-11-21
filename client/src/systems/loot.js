import { hash2, mulberry32 } from '../core/util.js';

export const WORLD_LOOT_PARAMS = { chunkSize: 90, islandChance: 0.07, wreckChance: 0.3 };

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
    crates: r() < 0.5 ? 2 : 1, debris: 3 + ((r() * 3) | 0), rng: r,
  };
}

export const LOOT_CONFIG = {
  starterCache: {
    id: 'i0,1c0',
    pistolAmmo: 12,
    bandageBase: 1,
    bandagesPerPlayer: 2,
  },
  crateTypes: {
    supply: { resourceRolls: [2, 3], weaponChance: [0.08, 0.18, 0.32, 0.5, 0.68] },
    danger: { resourceRolls: [3, 4], weaponChance: [0.18, 0.3, 0.48, 0.68, 0.82] },
  },
  regions: [
    {
      rarity: [0.76, 0.24, 0, 0, 0],
      resources: [
        ['madeira', 2, 5, 5], ['pano', 1, 2, 2], ['bandagem', 1, 2, 1],
      ],
    },
    {
      rarity: [0.45, 0.43, 0.12, 0, 0],
      resources: [
        ['madeira', 2, 5, 3], ['metal', 1, 3, 3], ['pano', 1, 3, 2], ['bandagem', 1, 2, 2],
      ],
    },
    {
      rarity: [0.2, 0.43, 0.3, 0.065, 0.005],
      resources: [
        ['metal', 2, 5, 4], ['pano', 1, 3, 2], ['bandagem', 1, 3, 2], ['kit', 1, 1, 1],
      ],
    },
    {
      rarity: [0.07, 0.27, 0.42, 0.21, 0.03],
      resources: [
        ['metal', 3, 7, 4], ['pano', 2, 5, 2], ['bandagem', 2, 4, 2], ['kit', 1, 2, 1],
      ],
    },
    {
      rarity: [0.01, 0.1, 0.31, 0.43, 0.15],
      resources: [
        ['metal', 4, 9, 4], ['pano', 3, 6, 2], ['bandagem', 2, 5, 2], ['kit', 1, 2, 2],
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
      bandagem: LOOT_CONFIG.starterCache.bandageBase +
        Math.max(1, playerCount) * LOOT_CONFIG.starterCache.bandagesPerPlayer,
      municao: LOOT_CONFIG.starterCache.pistolAmmo,
    };
  }

  const regionIndex = Math.max(0, Math.min(4, Math.floor(difficulty)));
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
    if (weapon === 'revolver') add('municao', 6 + Math.floor(random() * 7));
    else if (weapon === 'pistola') add('municao', 8 + Math.floor(random() * 9));
    else if (weapon === 'escopeta') add('cartucho', 4 + Math.floor(random() * 7));
    else if (weapon === 'rifle') add('municao', 10 + Math.floor(random() * 11));
    else if (weapon === 'rifle_precisao') add('municao', 5 + Math.floor(random() * 6));
  }

  if (random() < 0.25 + regionIndex * 0.08) {
    add(regionIndex >= 2 && random() < 0.16 ? 'kit' : 'bandagem', 1 + (random() < 0.35 ? 1 : 0));
  }
  return loot;
}

export function difficultyForCrateId(id) {
  const match = /^[ib](-?\d+),(-?\d+)c\d+$/.exec(id);
  if (!match) return 0;
  const x = Number(match[1]) * WORLD_LOOT_PARAMS.chunkSize;
  const z = Number(match[2]) * WORLD_LOOT_PARAMS.chunkSize;
  return Math.min(4, Math.floor(Math.hypot(x, z) / 320));
}

export function isGeneratedCrate(seed, id) {
  const wreck = /^b(-?\d+),(-?\d+)c(\d+)$/.exec(id);
  if (wreck) { const w = wreckFor(seed, Number(wreck[1]), Number(wreck[2])); return !!w && Number(wreck[3]) < w.crates; }
  const match = /^i(-?\d+),(-?\d+)c(\d+)$/.exec(id);
  if (!match) return false;
  const cx = Number(match[1]), cz = Number(match[2]), crateIndex = Number(match[3]);
  if (cx === 0 && cz === 0) return false;
  const starterIsland = cx === 0 && cz === 1;
  const random = mulberry32(hash2(seed, cx, cz));
  if (!starterIsland && random() >= WORLD_LOOT_PARAMS.islandChance) return false;
  if (starterIsland) return crateIndex < 3;

  random(); // Island X offset.
  random(); // Island Z offset.
  random(); // Island radius.
  const houses = 1 + ((random() * 2) | 0);
  let crateCount = 0;
  for (let i = 0; i < houses; i++) {
    random(); // House angle.
    random(); // House distance.
    random(); // House rotation.
    random(); // First wall.
    if (random() > 0.25) random(); // Optional wall height.
    random(); // Third wall.
    random(); // Door-wall height.
    crateCount++;
  }
  if (random() < 0.6) {
    random();
    random();
    crateCount++;
  }
  return crateIndex < crateCount;
}
