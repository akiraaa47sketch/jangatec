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
export const SEABED_FINDS = { canhao: 0.14, canhao_ferro: 0.06, gancho: 0.06 };
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

// CAIXAS — cada caixa tem uma BASE fixa (munição + comida) e o resto escala com a zona. Antes o sorteio
// era tudo-ou-nada: na zona pirata uma caixa podia ter só 3 balas e a do lado uma arma, e da zona 2
// para a 3 o tipo de caixa mudava de uma vez (o loot quase dobrava). Agora a curva é suave.
export const LOOT_CONFIG = {
  starterCache: { id: 'i0,1c0', crates: 5 },
  regions: [ // r = índice da zona (0 pirata … 4 fim da rota)
    // ammo: [mín, máx] de munição; shellK: chance de vir cartucho no lugar de parte da munição
    // heal: chance de curativo; kitK: chance do curativo ser kit; extras: sorteios extras da tabela
    // weapon: chance de arma; rarity: estrelas da arma (1★…5★)
    { ammo: [5, 8], shellK: 0, heal: 0.4, kitK: 0, extras: 0, foodN: 1, weapon: 0.22, rarity: [0.7, 0.3, 0, 0, 0] },
    { ammo: [6, 9], shellK: 0.3, heal: 0.42, kitK: 0, extras: 1, foodN: 1, weapon: 0.28, rarity: [0.42, 0.45, 0.13, 0, 0] },
    { ammo: [7, 11], shellK: 0.35, heal: 0.45, kitK: 0.3, extras: 1, foodN: 1, weapon: 0.34, rarity: [0.18, 0.42, 0.32, 0.075, 0.005] },
    { ammo: [8, 12], shellK: 0.4, heal: 0.5, kitK: 0.35, extras: 1, foodN: 2, weapon: 0.44, rarity: [0.06, 0.26, 0.42, 0.23, 0.03] },
    { ammo: [9, 14], shellK: 0.4, heal: 0.55, kitK: 0.4, extras: 2, foodN: 2, weapon: 0.54, rarity: [0.01, 0.1, 0.31, 0.43, 0.15] },
  ],
  // sorteio extra: [item, mín, máx, peso]
  extras: [['municao', 3, 5, 3], ['cartucho', 2, 3, 2], ['bandagem', 1, 1, 2], ['barra_proteina', 1, 1, 1], ['chocolate', 1, 1, 1], ['energetico', 1, 1, 1]],
  weaponsByStar: {
    1: ['tabua_prego', 'cano', 'faca_manteiga', 'bastao'],
    2: ['facao', 'revolver'],
    3: ['pistola'],
    4: ['escopeta', 'rifle'],
    5: ['rifle_precisao'],
  },
};
const FOODS = ['barra_proteina', 'energetico', 'chocolate'];
// munição que já vem com a arma achada
const WEAPON_AMMO = { revolver: ['municao', 5, 8], pistola: ['municao', 6, 10], escopeta: ['cartucho', 4, 6], rifle: ['municao', 8, 12], rifle_precisao: ['municao', 4, 7] };

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

// ILHA INICIAL: 5 caixas espalhadas em volta da ilha, o kit de começo DIVIDIDO entre elas (antes vinha
// tudo numa caixa só e as outras duas eram sorteio — às vezes quase vazias).
function starterLoot(random, index, players) {
  const p = Math.max(1, players), food = () => FOODS[Math.floor(random() * 3)];
  const out = {}, add = (k, n) => { out[k] = (out[k] || 0) + n; };
  switch (index) {
    case 0: // cache inicial: pistola OU revólver (sorteado); com 4+ jogadores vêm os dois
      if (p >= 4) { add('arma_pistola', 1); add('arma_revolver', 1); add('municao', 20); }
      else { add(random() < 0.5 ? 'arma_pistola' : 'arma_revolver', 1); add('municao', 12); }
      break;
    case 1: add('arma_martelo', 1); add('bandagem', 1 + p); break;                    // conserta a jangada
    case 2: add('municao', 6); add('barra_proteina', p); add('energetico', 1); break;
    case 3: add('bandagem', 1); add('chocolate', p); add(food(), 1); add('municao', 4); break;
    default: add('energetico', 1); add(food(), 1); add('municao', 4);
  }
  return out;
}

export function generateCrateLoot(seed, id, difficulty, playerCount = 1) {
  const st = /^i0,1c(\d+)$/.exec(id);
  if (st) return starterLoot(seededRandom(seed, id), Number(st[1]), playerCount);

  const regionIndex = Math.max(0, Math.min(4, Math.floor(difficulty)));
  const random = seededRandom(seed, id), loot = {};
  const add = (item, amount) => { if (amount > 0) loot[item] = (loot[item] || 0) + amount; };
  const between = (a, b) => a + Math.floor(random() * (b - a + 1));
  if (id.startsWith('s')) { // caixote da seca: só o básico (munição, comida, às vezes curativo)
    add('municao', between(4, 6) + regionIndex);
    if (regionIndex >= 1 && random() < 0.3) add('cartucho', between(2, 3));
    add(FOODS[Math.floor(random() * 3)], 1);
    if (random() < 0.3) add(regionIndex >= 2 && random() < 0.25 ? 'kit' : 'bandagem', 1);
    return loot;
  }
  const R = LOOT_CONFIG.regions[regionIndex], wreck = id.startsWith('b');

  // 1) BASE: toda caixa tem munição e comida
  let ammo = between(R.ammo[0], R.ammo[1]);
  if (random() < R.shellK) { const sh = between(2, 3) + (regionIndex >> 1); add('cartucho', sh); ammo = Math.max(3, ammo - sh * 2); }
  add('municao', ammo);
  for (let i = 0; i < R.foodN; i++) add(FOODS[Math.floor(random() * 3)], 1);
  // 2) curativo
  if (random() < R.heal) add(random() < R.kitK ? 'kit' : 'bandagem', 1);
  // 3) sorteios extras (mais nas zonas avançadas)
  for (let i = 0; i < R.extras; i++) { const [item, mn, mx] = chooseWeighted(random, LOOT_CONFIG.extras); add(item, between(mn, mx)); }
  // 4) arma (naufrágio tem um pouco mais de chance)
  if (random() < R.weapon + (wreck ? 0.08 : 0)) {
    const roll = random();
    let cumulative = 0, stars = 1;
    for (let i = 0; i < R.rarity.length; i++) { cumulative += R.rarity[i]; if (roll < cumulative) { stars = i + 1; break; } }
    const pool = LOOT_CONFIG.weaponsByStar[stars];
    // ZONA PIRATA (zonas 0–1): metade das armas é arma de fogo simples (pistola ou revólver)
    const simpleGun = regionIndex <= 1 && random() < 0.5;
    const weapon = simpleGun ? (random() < 0.5 ? 'pistola' : 'revolver') : pool[Math.floor(random() * pool.length)];
    add(`arma_${weapon}`, 1);
    const wa = WEAPON_AMMO[weapon]; if (wa) add(wa[0], between(wa[1], wa[2]));
  }
  // 5) ferramentas e equipamento
  if (random() < (wreck ? 0.12 : regionIndex >= 1 ? 0.06 : 0.03)) add('arma_banjo', 1);
  if (regionIndex >= 1 && random() < 0.04) add('arma_martelo', 1);
  // COLETE BALÍSTICO: só na Zona Militar (região 2) e UM por ilha (sempre na 1ª caixa dela)
  if (regionIndex === 2 && /^i-?\d+,-?\d+c0$/.test(id)) add('colete', 1);
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
  if (cx === 0 && cz === 1) return crateIndex < LOOT_CONFIG.starterCache.crates; // ilha inicial
  // ilha existe neste chunk; os caixotes dela (ruínas + acampamento) são no máximo 6
  return chunkHasIsland(seed, cx, cz) && crateIndex < 6;
}
