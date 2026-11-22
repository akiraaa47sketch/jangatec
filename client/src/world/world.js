// Mundo procedural por seed, gerado em chunks ao redor do barco: detritos flutuantes e
// ilhas com ruínas, caixotes e inimigos. A mesma seed gera sempre o mesmo mundo.
// NOVO: detritos são objetos físicos que podem ser pegados, carregados e soldados no barco.
import * as THREE from '../three.js';
import { mulberry32, hash2, rot } from '../core/util.js';
import { CFG } from '../config.js';
import { LOOT_CONFIG, generateCrateLoot, wreckFor } from '../systems/loot.js';
import { seabedHeight, makeSeabedChunk, makeFarSeabed } from './seabed.js';
import { bakeStatic } from '../core/bake.js';
import { buildCamp } from './camp.js';
import { buildScrapCamp } from './scrap.js';
import { makePieceMesh, PIECES } from '../boat/pieces.js';
import { makePalm, makeRock, makeBush, makeGrassTufts } from './models.js';
import { woodTexture, woodBump, sandTexture, sandBump, grassTexture, thatchTexture, logWallTexture, metalTexture, clothTexture as clothTex, repeated, scaleBoxUVs } from './textures.js';

const M = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.9, ...extra });
const WOOD = [0x9b7242, 0x86623a, 0xb08a55, 0x6f5231];
// Areia em gradiente: molhada/escura perto da água, seca/clara no alto (chave = dr do patamar).
const SAND = { 7.5: 0x9a8d68, 6: 0xab9c72, 4.5: 0xbcab7c, 3: 0xcdb986, 1.5: 0xd8c48e, 0.5: 0xe0cc96, 0: 0xdcc891 };
// UVs em escala de mundo: texturas mantêm o mesmo tamanho em qualquer caixa.
const box = (w, h, l, mat) => new THREE.Mesh(scaleBoxUVs(new THREE.BoxGeometry(w, h, l), w, h, l), mat);
let SHARED = null; // materiais texturizados compartilhados pelas ilhas
function shared() {
  if (SHARED) return SHARED;
  SHARED = {
    plaster: M(0xc9b89a, { map: sandTexture(), bumpMap: sandBump(), bumpScale: 1.2 }),
    logs: M(0x8a6a44, { map: repeated(logWallTexture(), 0.4, 0.45), bumpMap: repeated(logWallTexture(), 0.4, 0.45), bumpScale: 2 }),
    thatch: M(0xc4a874, { map: repeated(thatchTexture(), 0.8), bumpMap: repeated(thatchTexture(), 0.8), bumpScale: 2.5 }),
    crate: M(0xb08a55, { map: repeated(woodTexture(), 1.2), bumpMap: repeated(woodBump(), 1.2), bumpScale: 1.5 }),
    crateLid: M(0xc49a60, { map: repeated(woodTexture(), 1.2), bumpMap: repeated(woodBump(), 1.2), bumpScale: 1.5 }),
    iron: M(0x4a4a52, { map: metalTexture(), metalness: 0.6, roughness: 0.55 }),
  };
  return SHARED;
}
const STARTER_BUILD_CLEAR_RADIUS = 9.75;
const STARTER_FLOOR_LOCAL_Z = -9;

function inStarterBuildClearance(x, z, padding = 0) {
  const halfX = PIECES.piso.size[0] / 2 + padding;
  const halfZ = PIECES.piso.size[2] / 2 + padding;
  return Math.hypot(x, z) < STARTER_BUILD_CLEAR_RADIUS + padding ||
    (Math.abs(x) < halfX && Math.abs(z - STARTER_FLOOR_LOCAL_Z) < halfZ);
}

// Tipos de detrito físico: nome, dimensões para colisão, modelo visual e loot legado.
// sinks: pesado demais para boiar — fica no fundo do mar (aparece quando o mar seca).
// size: [w, h, l] — usado para colisor quando soldado.
// pieceType: o tipo de peça mais próximo (para fallback de colisão).
export const DEBRIS = [
  { nome: 'Tábua',           w: 5, size: [0.4, 0.1, 1.8],  pieceType: 'tabua',      make: (r) => box(0.4, 0.08, 1.6 + r() * 1.2, M(WOOD[(r() * 4) | 0])), loot: () => ({ madeira: 1 }) },
  { nome: 'Pedaço de madeira',w:4, size: [0.6, 0.15, 1.0], pieceType: 'tabua',      make: (r) => { const g = new THREE.Group(); const a = box(0.3, 0.12, 0.9, M(WOOD[1])); const b = box(0.25, 0.1, 0.6, M(WOOD[3])); b.position.set(0.2, 0.05, 0.3); b.rotation.y = 0.7; g.add(a, b); return g; }, loot: () => ({ madeira: 1 }) },
  { nome: 'Viga',             w: 3, size: [0.3, 0.3, 2.8],  pieceType: 'tabua',      make: (r) => box(0.25, 0.25, 2.6 + r(), M(WOOD[3])), loot: () => ({ madeira: 2 }) },
  { nome: 'Placa metálica',   w: 3, sinks: true, size: [1.4, 0.1, 1.2],  pieceType: 'chapa',      make: (r) => { const m = box(1.2 + r() * 0.6, 0.05, 1 + r() * 0.5, M(0x8f979c, { metalness: 0.6, roughness: 0.5 })); m.rotation.z = 0.08; return m; }, loot: () => ({ metal: 2 }) },
  { nome: 'Calha',            w: 2, sinks: true, size: [2.4, 0.4, 0.4],  pieceType: 'tabua',      make: () => { const m = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 2.4, 8, 1, true, 0, Math.PI), M(0x7b858b, { metalness: 0.5, side: THREE.DoubleSide })); m.rotation.z = Math.PI / 2; m.rotation.y = Math.PI / 2; return m; }, loot: () => ({ metal: 1 }) },
  { nome: 'Pedaço triangular',w: 2, size: [1.8, 0.1, 1.8],  pieceType: 'piso',       make: () => { const m = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 0.1, 3), M(WOOD[0])); return m; }, loot: () => ({ madeira: 2 }) },
  { nome: 'Porta',            w: 2, size: [0.9, 2.0, 0.1],  pieceType: 'parede',     make: () => { const g = new THREE.Group(); g.add(box(0.9, 0.08, 2, M(0x6e4b2a))); const k = box(0.08, 0.1, 0.08, M(0xd4b24a, { metalness: 0.8 })); k.position.set(0.32, 0.08, 0); g.add(k); return g; }, loot: () => ({ madeira: 3 }) },
  { nome: 'Escada quebrada',  w: 1, size: [0.6, 2.2, 0.1],  pieceType: 'escada',     make: () => { const g = new THREE.Group(); const m = M(WOOD[2]); const a = box(0.08, 0.08, 2.2, m), b = box(0.08, 0.08, 2.2, m); a.position.x = -0.25; b.position.x = 0.25; g.add(a, b); for (let i = -2; i <= 2; i++) { const s = box(0.5, 0.06, 0.08, m); s.position.z = i * 0.45; g.add(s); } return g; }, loot: () => ({ madeira: 2 }) },
  { nome: 'Pedaço de telhado',w: 2, size: [2.6, 0.1, 1.8],  pieceType: 'piso',       make: () => { const g = new THREE.Group(); const m = M(0xa3432f); const a = box(1.3, 0.08, 1.8, m), b = box(1.3, 0.08, 1.8, m); a.rotation.z = 0.5; a.position.x = -0.55; b.rotation.z = -0.5; b.position.x = 0.55; g.add(a, b); g.position.y = 0.2; const w = new THREE.Group(); w.add(g); return w; }, loot: () => ({ madeira: 3, metal: 1 }) },
  { nome: 'Pedaço de casa',   w: 2, sinks: true, size: [2.2, 0.15, 1.6], pieceType: 'piso',       make: () => { const g = new THREE.Group(); const m = M(0xc9b89a); const a = box(2.2, 0.15, 0.6, m), b = box(0.6, 0.15, 1.4, m), c = box(0.6, 0.15, 1.4, m); a.position.z = -0.7; b.position.set(-0.8, 0, 0.3); c.position.set(0.8, 0, 0.3); g.add(a, b, c); return g; }, loot: () => ({ madeira: 5 }) },
  { nome: 'Parte de barco',   w: 1, size: [1.3, 0.6, 2.2],  pieceType: 'bloco',      make: () => { const m = new THREE.Mesh(new THREE.SphereGeometry(1.1, 10, 6, 0, Math.PI, 0, Math.PI / 2), M(0x4f6b7a, { side: THREE.DoubleSide })); m.scale.set(0.6, 0.5, 1.3); m.rotation.x = Math.PI; m.position.y = 0.3; const g = new THREE.Group(); g.add(m); return g; }, loot: () => ({ madeira: 4, pano: 1 }) },
  { nome: 'Sucata',           w: 3, sinks: true, size: [0.8, 0.5, 0.8],  pieceType: 'chapa',      make: (r) => { const g = new THREE.Group(); for (let i = 0; i < 4; i++) { const s = box(0.2 + r() * 0.5, 0.1 + r() * 0.3, 0.2 + r() * 0.5, M(0x6d7479, { metalness: 0.7, roughness: 0.4 })); s.position.set(r() - 0.5, r() * 0.2, r() - 0.5); s.rotation.set(r(), r(), r()); g.add(s); } return g; }, loot: () => ({ metal: 3 }) },
  { nome: 'Barril',           w: 2, size: [1.0, 0.8, 1.0],  pieceType: 'bloco',      make: () => { const m = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 1, 10), M(0x7a4f2a)); m.rotation.z = Math.PI / 2; return m; }, loot: () => ({ madeira: 1 }) },
  { nome: 'Caixote',          w: 3, size: [0.8, 0.8, 0.8],  pieceType: 'bloco',      make: () => { const m = box(0.8, 0.8, 0.8, M(0xb5894e)); m.rotation.set(0.2, 0.4, 0.1); return m; }, loot: (r) => [{ municao: 8 }, { bandagem: 1 }, { municao: 5 }][(r() * 3) | 0] },
  { nome: 'Lona',             w: 1, size: [1.4, 0.05, 1.0], pieceType: 'piso',       make: () => box(1.4, 0.03, 1, M(0xdcd3bd)), loot: () => ({ pano: 2 }) },
  // --- mais variedade para montar a jangada ---
  { nome: 'Palete',           w: 3, size: [1.2, 0.16, 1.0], pieceType: 'piso',       make: (r) => { const g = new THREE.Group(), m = M(WOOD[(r() * 4) | 0]); for (let i = -2; i <= 2; i++) { const s = box(1.2, 0.03, 0.15, m); s.position.set(0, 0.065, i * 0.21); g.add(s); } for (const x of [-0.5, 0, 0.5]) { const run = box(0.1, 0.1, 1.0, M(WOOD[3])); run.position.set(x, -0.03, 0); g.add(run); } return g; }, loot: () => ({ madeira: 2 }) },
  { nome: 'Guarda-corpo',     w: 2, size: [2.0, 0.9, 0.1],  pieceType: 'parede',     make: () => { const g = new THREE.Group(), m = M(WOOD[2]); for (const x of [-0.95, 0, 0.95]) { const p = box(0.08, 0.9, 0.08, m); p.position.x = x; g.add(p); } for (const y of [0.4, 0]) { const rl = box(2.0, 0.06, 0.06, m); rl.position.y = y; g.add(rl); } return g; }, loot: () => ({ madeira: 2 }) },
  { nome: 'Cerca',            w: 2, size: [1.8, 1.0, 0.1],  pieceType: 'parede',     make: (r) => { const g = new THREE.Group(), m = M(0xd9cbb0); for (let i = 0; i < 7; i++) { const h = 0.85 + r() * 0.15; const p = box(0.16, h, 0.04, m); p.position.set(-0.78 + i * 0.26, (h - 1) / 2, 0); g.add(p); } for (const y of [0.25, -0.25]) { const rl = box(1.8, 0.07, 0.05, M(WOOD[1])); rl.position.set(0, y, -0.045); g.add(rl); } return g; }, loot: () => ({ madeira: 2 }) },
  { nome: 'Escotilha',        w: 2, size: [1.0, 0.12, 1.0], pieceType: 'piso',       make: () => { const g = new THREE.Group(); g.add(box(1.0, 0.08, 1.0, M(0x5d4129))); for (const [x, z, w, l] of [[0, 0.46, 1.0, 0.08], [0, -0.46, 1.0, 0.08], [0.46, 0, 0.08, 1.0], [-0.46, 0, 0.08, 1.0]]) { const f = box(w, 0.12, l, M(0x3e2b1a)); f.position.set(x, 0.01, z); g.add(f); } const h = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.02, 6, 14), M(0x9aa0a4, { metalness: 0.8, roughness: 0.4 })); h.rotation.x = Math.PI / 2; h.position.y = 0.06; g.add(h); return g; }, loot: () => ({ madeira: 2, metal: 1 }) },
  { nome: 'Tambor de metal',  w: 2, sinks: true, size: [0.7, 1.0, 0.7], pieceType: 'bloco', make: (r) => { const g = new THREE.Group(), c = [0x2f5fa0, 0xb03a2e, 0x3e7a44][(r() * 3) | 0]; g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.33, 0.33, 1.0, 16), M(c, { metalness: 0.5, roughness: 0.45 }))); for (const y of [-0.3, 0.3]) { const rb = new THREE.Mesh(new THREE.TorusGeometry(0.335, 0.02, 4, 18), M(0x5b6166, { metalness: 0.7 })); rb.rotation.x = Math.PI / 2; rb.position.y = y; g.add(rb); } return g; }, loot: () => ({ metal: 3 }) },
  { nome: 'Boia',             w: 2, size: [0.8, 0.8, 0.8],  pieceType: 'bloco',      make: () => { const g = new THREE.Group(); const b = new THREE.Mesh(new THREE.SphereGeometry(0.4, 14, 10), M(0xf07a1e, { roughness: 0.6 })); g.add(b); const band = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.035, 6, 20), M(0xf3efe6)); band.rotation.x = Math.PI / 2; g.add(band); return g; }, loot: () => ({ pano: 1 }) },
  { nome: 'Telha ondulada',   w: 2, sinks: true, size: [1.8, 0.1, 1.0], pieceType: 'chapa', make: () => { const geo = new THREE.PlaneGeometry(1.8, 1.0, 36, 1); geo.rotateX(-Math.PI / 2); const pa = geo.attributes.position; for (let i = 0; i < pa.count; i++) pa.setY(i, Math.sin(pa.getX(i) * 17) * 0.035); geo.computeVertexNormals(); return new THREE.Mesh(geo, M(0x9aa3a8, { metalness: 0.55, roughness: 0.5, side: THREE.DoubleSide })); }, loot: () => ({ metal: 2 }) },
  { nome: 'Poste',            w: 2, size: [0.24, 0.24, 3.2], pieceType: 'tabua',      make: () => { const m = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.13, 3.2, 9), M(WOOD[3])); m.rotation.x = Math.PI / 2; return m; }, loot: () => ({ madeira: 2 }) },
  { nome: 'Remo',             w: 1, size: [0.26, 0.06, 2.0], pieceType: 'tabua',      make: () => { const g = new THREE.Group(), m = M(WOOD[0]); const sh = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 1.4, 6), m); sh.rotation.x = Math.PI / 2; sh.position.z = -0.3; const bl = box(0.26, 0.03, 0.6, m); bl.position.z = 0.7; g.add(sh, bl); return g; }, loot: () => ({ madeira: 1 }) },
  { nome: 'Caixa térmica',    w: 1, size: [0.9, 0.55, 0.55], pieceType: 'bloco',     make: () => { const g = new THREE.Group(); const b = box(0.9, 0.45, 0.55, M(0xeeeeea, { roughness: 0.6 })); b.position.y = -0.05; const l = box(0.92, 0.1, 0.57, M(0x2f6fb0, { roughness: 0.6 })); l.position.y = 0.22; g.add(b, l); return g; }, loot: (r) => (r() < 0.5 ? { bandagem: 1 } : { pano: 1 }) },
  { nome: 'Pneu',             w: 1, size: [0.9, 0.3, 0.9],  pieceType: 'bloco',      make: () => { const m = new THREE.Mesh(new THREE.TorusGeometry(0.33, 0.13, 8, 18), M(0x232425, { roughness: 0.95 })); m.rotation.x = Math.PI / 2; return m; }, loot: () => ({ pano: 1 }) },
  { nome: 'Tampa de mesa',    w: 2, size: [1.6, 0.08, 0.9], pieceType: 'piso',       make: (r) => box(1.6, 0.06, 0.9, M(WOOD[(r() * 4) | 0])), loot: () => ({ madeira: 2 }) },
];
const DEBRIS_W = DEBRIS.reduce((s, d) => s + d.w, 0);

export class World {
  constructor(G, seed) {
    this.G = G; this.seed = seed;
    this.chunks = new Map();
    this.collected = new Set(); // ids de detritos coletados / caixotes abertos / inimigos mortos
    this.debris = []; this.islands = []; this.crates = []; this.wrecks = [];
    this.farSeabed = makeFarSeabed(); G.scene.add(this.farSeabed);
    this.crateStates = new Map();
    // Objetos físicos e posições de peças colocadas, inclusive em chunks já descarregados.
    this.physObjects = [];
    this.placedStates = new Map();
    this.remoteCarries = new Map();
    this.weldedStates = new Map();
  }

  updateFloodLevel(level) {
    // Baús dos naufrágios só abrem fora d'água.
    for (const w of this.wrecks) for (const c of w.crates) c.submerged = level > c.y + 0.3;
    for (const island of this.islands) {
      for (const layer of island.landLayers) layer.mesh.visible = level < layer.top;
      const tier = island.allItems.filter((item) => item.floodTop == null || item.floodTop > level);
      const changed = island.floodTier !== tier.length;
      island.flooded = level >= island.maxGround;
      if (!changed) continue;
      this.G.physics.removeStaticSet(island.set);
      island.set.items = tier;
      island.floodTier = tier.length;
      this.G.physics.addStaticSet(island.set);
    }
  }
  seabedHeight(x, z) { return seabedHeight(this.seed, x, z); }
  difficulty(x, z) { return Math.min(4, Math.floor(Math.hypot(x, z) / 320)); }

  ensureStarterIsland() {
    const key = '0,1';
    if (!this.chunks.has(key)) this.chunks.set(key, this.makeChunk(0, 1));
    return this.chunks.get(key).island;
  }

  update(dt, t) {
    const G = this.G, S = CFG.chunk, R = G.loadRadius || CFG.loadRadius; // distância de visão (opções gráficas)
    for (const crate of this.crates) {
      // mola amortecida: a tampa abre com um tranco e quica um pouco
      crate.openV = (crate.openV || 0) + (((crate.opened ? 1 : 0) - crate.openT) * 110 - crate.openV * 11) * dt;
      crate.openT += crate.openV * dt;
      crate.lid.rotation.x = -1.25 * Math.max(-0.02, crate.openT);
    }
    // Fogueiras dos acampamentos tremulam.
    for (const isl of this.islands) if (isl.fire) {
      const f = isl.fire;
      f.children.forEach((flame, i) => {
        const s = 0.85 + Math.sin(t * (9 + i * 3.1) + i) * 0.12 + Math.sin(t * 23 + i * 5) * 0.06;
        flame.scale.set(1 - (s - 1) * 0.5, s, 1 - (s - 1) * 0.5);
        flame.rotation.y = t * (1.5 + i);
      });
    }
    // Vento: a copa das palmeiras balança de leve (defasada por palmeira).
    for (const isl of this.islands) for (const p of isl.palms || []) {
      const u = p.userData;
      u.crown.rotation.z = Math.sin(t * 0.9 + u.phase) * 0.035 + Math.sin(t * 2.3 + u.phase * 1.7) * 0.012;
      u.crown.rotation.x = Math.cos(t * 0.8 + u.phase) * 0.03;
    }
    // Carrega em volta da jangada E do jogador (no fundo seco dá para se afastar a pé).
    const pp = G.player ? G.player.body.pos : G.boat;
    const centers = [[Math.round(G.boat.x / S), Math.round(G.boat.z / S)], [Math.round(pp.x / S), Math.round(pp.z / S)]];
    // no máximo 1 chunk novo por quadro (o mais perto primeiro): sem engasgos ao navegar
    let best = null, bd = Infinity;
    for (const [ccx, ccz] of centers) for (let i = -R; i <= R; i++) for (let j = -R; j <= R; j++) {
      const key = `${ccx + i},${ccz + j}`;
      if (this.chunks.has(key)) continue;
      const d = i * i + j * j;
      if (d < bd) { bd = d; best = [key, ccx + i, ccz + j]; }
    }
    if (best) this.chunks.set(best[0], this.makeChunk(best[1], best[2]));
    this.farSeabed.position.set(pp.x, this.farSeabed.position.y, pp.z);
    this.farSeabed.visible = (G.startup ? G.startup.waterLevel : 1) < -3; // só faz falta com o mar seco
    for (const [key, ch] of this.chunks) {
      const carryingDebris = ch.debris.some((obj) => obj.carriedBy);
      const far = centers.every(([ccx, ccz]) => Math.abs(ch.cx - ccx) > R + 1 || Math.abs(ch.cz - ccz) > R + 1);
      if (!carryingDebris && far) {
        this.dropChunk(ch);
        this.chunks.delete(key);
      }
    }
  }

  makeChunk(cx, cz) {
    const G = this.G, S = CFG.chunk, r = mulberry32(hash2(this.seed, cx, cz));
    const ch = { cx, cz, debris: [], island: null };
    const ox = cx * S, oz = cz * S;
    if (cx !== 0 || cz !== 0) {
      const islandRoll = r();
      const starterIsland = cx === 0 && cz === 1;
      if (starterIsland || islandRoll < CFG.islandChance) {
        ch.island = this.makeIsland(
          `i${cx},${cz}`, ox + (r() - 0.5) * 30, oz + (r() - 0.5) * 30, r, starterIsland
        );
        if (starterIsland) this.addStarterDeckParts(ch);
      }
    }
    const n = 4 + ((r() * 4) | 0);
    ch.seabed = makeSeabedChunk(this.seed, cx, cz);
    { const terrain = ch.seabed.children[0]; bakeStatic(ch.seabed, { keep: (o) => o === terrain }); }
    G.scene.add(ch.seabed);
    const wreck = wreckFor(this.seed, cx, cz);
    if (wreck) ch.wreck = this.makeWreck(ch, wreck);
    for (let i = 0; i < n; i++) {
      // Sempre consome o RNG na mesma ordem para manter o determinismo.
      const x = ox + (r() - 0.5) * S, z = oz + (r() - 0.5) * S;
      let pick = r() * DEBRIS_W, def = DEBRIS[0];
      for (const d of DEBRIS) { pick -= d.w; if (pick <= 0) { def = d; break; } }
      const lr = mulberry32(hash2(this.seed, cx * 131 + i, cz * 17 + 7));
      const id = `d${cx},${cz},${i}`;
      if (ch.island && Math.hypot(x - ch.island.x, z - ch.island.z) < ch.island.R + 9) continue;
      this.spawnDebris(ch, id, def, x, z, lr);
    }
    return ch;
  }

  // Detrito físico (pode ser pego, carregado e soldado). y = altura inicial (0 = flutuando).
  spawnDebris(ch, id, def, x, z, lr, y = 0) {
    const G = this.G;
    {
      if (this.collected.has(id)) return;
      const existing = this.physObjects.find((item) => item.id === id);
      if (existing) { ch.debris.push(existing); return; }
      const welded = this.weldedStates.get(id);
      if (welded && G.boat.pieces.has(welded.id)) return;
      const mesh = def.make(lr);
      if (!mesh.isMesh) bakeStatic(mesh); // peça feita de várias caixinhas vira 1 malha por material
      mesh.scale.setScalar(1.4);
      if (def.sinks && !y) y = this.seabedHeight(x, z) + 0.3; // afundados já começam no fundo
      mesh.position.set(x, y, z); mesh.rotation.y = lr() * 6.28;
      G.scene.add(mesh);
      const tilt = (lr() - 0.5) * 0.25;
      const loot = def.loot(lr);
      // Objeto físico: pode ser pegado, carregado e soldado
      const obj = { id, def, mesh, x, z, tilt, loot, welded: false, carriedBy: null, placed: false, placedOnWater: false };
      ch.debris.push(obj); this.debris.push(obj); this.physObjects.push(obj);
      G.physics.addFloatingObject(obj);
      if (welded) {
        G.build.applyRemoteWeld({ physId: id, piece: welded });
        return;
      }
      const placed = this.placedStates.get(id);
      if (placed) this.applyPlacedState(id, placed);
      const carrier = this.remoteCarries.get(id);
      if (carrier) {
        obj.carriedBy = carrier; obj.mesh.visible = false;
        G.physics.suspendObject(obj);
      }
    }
  }

  applyPlacedState(id, state) {
    if (!state || !Array.isArray(state.p) || state.p.length !== 3 ||
        !Array.isArray(state.q) || state.q.length !== 4 ||
        !state.p.concat(state.q).every(Number.isFinite)) return;
    this.placedStates.set(id, state);
    this.remoteCarries.delete(id);
    this.weldedStates.delete(id);
    const obj = this.physObjects.find((item) => item.id === id);
    if (!obj) return;
    obj.mesh.position.fromArray(state.p);
    obj.mesh.quaternion.fromArray(state.q);
    obj.mesh.visible = true;
    obj.carriedBy = null;
    obj.placed = state.placed !== false;
    obj.placedOnWater = !!state.water;
    obj.x = state.p[0];
    obj.z = state.p[2];
    const piece = obj.buildPiece || {};
    Object.assign(piece, {
      id, type: obj.def.pieceType, mesh: obj.mesh,
      physSize: obj.physicsSize || obj.def.size,
      physOffset: obj.physicsOffset || [0, 0, 0],
    });
    obj.buildPiece = piece;
    obj.mesh.traverse((child) => { if (child.isMesh) child.buildPiece = piece; });
    this.G.physics.placeObject(obj, state.p, state.q);
  }

  applyCarryState(id, by, state) {
    const obj = this.physObjects.find((item) => item.id === id);
    if (by) {
      this.placedStates.delete(id);
      this.remoteCarries.set(id, by);
      if (obj) {
        obj.carriedBy = by; obj.mesh.visible = false;
        this.G.physics.suspendObject(obj);
      }
      return;
    }
    this.remoteCarries.delete(id);
    if (state) this.applyPlacedState(id, state);
    else {
      this.placedStates.delete(id);
      if (obj) {
        obj.carriedBy = null; obj.placed = false; obj.mesh.visible = true;
        this.G.physics.resumeObject(obj);
      }
    }
  }

  makeIsland(id, x, z, r, starterIsland = false) {
    const G = this.G, R = starterIsland ? 15 + r() * 3 : 9 + r() * 6, diff = this.difficulty(x, z);
    const islandElevation = starterIsland ? 0 : 2.7;
    // acampamento: forte de troncos, cabana, ou (ilhas grandes) forte de SUCATA com torres de morteiro
    const siteRoll = r();
    const siteType = starterIsland ? null : R >= 11.5 && siteRoll < 0.4 ? 'scrap' : siteRoll < 0.62 ? 'fort' : 'hut';
    const group = new THREE.Group(); group.position.set(x, islandElevation, z);
    const set = { x, z, yaw: 0, y: islandElevation, radius: R + 8, items: [] };
    const solids = [];
    const addSolid = (m) => { group.add(m); solids.push(m); };
    const landLayers = [];
    // O terreno é composto por patamares baixos que podem desaparecer sob a maré.
    for (const [dr, top] of [[7.5, -1.55], [6, -1.2], [4.5, -0.85], [3, -0.5], [1.5, -0.15], [0.5, 0.2], [0, 0.55]]) {
      const worldTop = islandElevation + top;
      const radius = R + dr, thickness = 0.35;
      const sand = new THREE.Mesh(
        new THREE.CylinderGeometry(radius, radius, thickness, 40),
        M(SAND[dr], { map: repeated(sandTexture(), radius * 0.45), bumpMap: repeated(sandBump(), radius * 0.45), bumpScale: 1.4 })
      );
      sand.position.y = top - thickness / 2;
      addSolid(sand);
      const collider = {
        type: 'cyl', x: 0, y: top - thickness / 2, z: 0,
        hx: radius, hy: thickness / 2, hz: radius, floodTop: worldTop,
      };
      set.items.push(collider);
      landLayers.push({ mesh: sand, top: worldTop, dr });
    }
    const grass = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.7, R * 0.72, 0.06, 32), M(0x6f9d4c, { map: repeated(grassTexture(), R * 0.35) }));
    grass.position.y = 0.58; group.add(grass);
    const TOP = 0.55;
    landLayers.push({ mesh: grass, top: islandElevation + 0.61 });
    const addBox = (lx, lz, w, h, l, yaw, mat) => {
      const m = box(w, h, l, mat); m.position.set(lx, TOP + h / 2, lz); m.rotation.y = yaw; addSolid(m);
      set.items.push({ type: 'box', x: lx, y: TOP + h / 2, z: lz, hx: w / 2, hy: h / 2, hz: l / 2, yaw });
    };
    // Ruínas de casas montadas com módulos de parede (algumas faltando).
    const starterCratePositions = starterIsland
      ? [[-R * 0.78, 0], [R * 0.78, -R * 0.22], [0, R * 0.78]]
      : [];
    // acampamento (cabana ou forte) perto do meio; ruínas ficam longe dele
    const campR = siteType === 'scrap' ? 8.6 : siteType === 'fort' ? 7.9 : 5;
    const campA = r() * 6.28, campD = r() * Math.max(0, R - (siteType === 'scrap' ? 10.5 : siteType === 'fort' ? 9 : 6.5));
    const campC = [Math.cos(campA) * campD, Math.sin(campA) * campD];
    const nearCamp = (lx, lz, pad = 0) => !starterIsland && Math.hypot(lx - campC[0], lz - campC[1]) < campR + pad;
    const houses = r() < 0.6 ? 1 : 0, wallMat = shared().plaster, crates = [];
    const houseCenters = [];
    for (let hI = 0; hI < houses; hI++) {
      let hx, hz;
      if (starterIsland) continue; // ilha inicial limpa: só areia, palmeiras e caixas
      if (starterIsland) {
        let found = false;
        for (let attempt = 0; attempt < 24; attempt++) {
          const a = r() * 6.28, dist = R * (0.78 + r() * 0.12);
          const candidateX = Math.cos(a) * dist, candidateZ = Math.sin(a) * dist;
          if (inStarterBuildClearance(candidateX, candidateZ, 3.2)) continue;
          if (starterCratePositions.some(([cx, cz]) => Math.hypot(candidateX - cx, candidateZ - cz) < 4.5)) continue;
          if (houseCenters.some(([cx, cz]) => Math.hypot(candidateX - cx, candidateZ - cz) < 7)) continue;
          hx = candidateX; hz = candidateZ; found = true; break;
        }
        if (!found) continue;
      } else {
        let found = false;
        for (let attempt = 0; attempt < 10 && !found; attempt++) {
          const a = r() * 6.28, dist = r() * (R - 4);
          hx = Math.cos(a) * dist; hz = Math.sin(a) * dist;
          found = !nearCamp(hx, hz, 3);
        }
        if (!found) continue;
      }
      const yaw = r() * 6.28;
      houseCenters.push([hx, hz]);
      const wall = (lx, lz, w, h, extraYaw) => {
        const [px, pz] = rot(lx, lz, yaw);
        const wallX = hx + px, wallZ = hz + pz;
        if (starterIsland && inStarterBuildClearance(wallX, wallZ, Math.hypot(w / 2, 0.125) + 0.25)) return;
        addBox(wallX, wallZ, w, h, 0.25, yaw + extraYaw, wallMat);
      };
      if (r() > 0.25) wall(0, -2, 4, 2.4, 0);
      if (r() > 0.25) wall(-2, 0, 4, 1.2 + r() * 1.2, Math.PI / 2);
      if (r() > 0.25) wall(2, 0, 4, 2.4, Math.PI / 2);
      wall(-1.4, 2, 1.2, 2.4, 0); wall(1.4, 2, 1.2, 1.4 + r(), 0); // vão da porta no meio
      crates.push([hx, hz]);
    }
    if (r() < 0.6) { const a = r() * 6.28, cx = Math.cos(a) * (R - 2.5), cz = Math.sin(a) * (R - 2.5); if (!nearCamp(cx, cz, 0.6)) crates.push([cx, cz]); }
    if (starterIsland) {
      crates.splice(0, crates.length, ...starterCratePositions);
    }
    // Palmeiras.
    const palms = 2 + ((r() * 3) | 0);
    const palmList = []; // palmeiras que balançam com o vento (ver update)
    const palmCenters = [];
    for (let i = 0; i < palms; i++) {
      let px, pz;
      if (starterIsland) {
        let found = false;
        for (let attempt = 0; attempt < 24; attempt++) {
          const a = r() * 6.28, d = R * (0.68 + r() * 0.24);
          const candidateX = Math.cos(a) * d, candidateZ = Math.sin(a) * d;
          if (inStarterBuildClearance(candidateX, candidateZ, 1.8)) continue;
          if (starterCratePositions.some(([cx, cz]) => Math.hypot(candidateX - cx, candidateZ - cz) < 3.8)) continue;
          if (houseCenters.some(([cx, cz]) => Math.hypot(candidateX - cx, candidateZ - cz) < 4.5)) continue;
          if (palmCenters.some(([cx, cz]) => Math.hypot(candidateX - cx, candidateZ - cz) < 4.5)) continue;
          px = candidateX; pz = candidateZ; found = true; break;
        }
        if (!found) continue;
      } else {
        const a = r() * 6.28, d = R * (0.5 + r() * 0.4);
        px = Math.cos(a) * d; pz = Math.sin(a) * d;
        if (nearCamp(px, pz, 0.5)) continue;
      }
      palmCenters.push([px, pz]);
      const h = 3.5 + r() * 2;
      // Visual próprio (RNG derivado): não altera o layout gerado pelo `r` da ilha.
      const palm = makePalm(h, mulberry32(hash2(this.seed, Math.round(px * 37 + x), Math.round(pz * 41 + z))));
      palm.position.set(px, TOP, pz); palm.rotation.y = 0; group.add(palm);
      solids.push(palm.userData.trunk); palmList.push(palm);
      set.items.push({ type: 'cyl', x: px, y: TOP + h / 2, z: pz, hx: 0.2, hy: h / 2, hz: 0.2 });
    }
    // Decoração visual (sem colisão): rochas, arbustos e tufos de grama.
    {
      const dec = mulberry32(hash2(this.seed, Math.round(x * 7), Math.round(z * 13)));
      const free = (lx, lz, pad) =>
        !(starterIsland && inStarterBuildClearance(lx, lz, pad)) &&
        !palmCenters.some(([cx, cz]) => Math.hypot(lx - cx, lz - cz) < 1.3) &&
        !starterCratePositions.some(([cx, cz]) => Math.hypot(lx - cx, lz - cz) < 1.6) &&
        !houseCenters.some(([cx, cz]) => Math.hypot(lx - cx, lz - cz) < 3.6) && !nearCamp(lx, lz, pad);
      for (let i = 0, n = 6 + ((dec() * 5) | 0); i < n; i++) {
        const a = dec() * 6.283, d = R * (0.76 + dec() * 0.22), lx = Math.cos(a) * d, lz = Math.sin(a) * d, sz = 0.28 + dec() * 0.5;
        if (!free(lx, lz, 0.6)) continue;
        const rock = makeRock(dec, sz); rock.position.set(lx, TOP + 0.02, lz); group.add(rock);
      }
      for (let i = 0, n = 2 + ((dec() * 3) | 0); i < n; i++) {
        const a = dec() * 6.283, d = R * (0.3 + dec() * 0.4), lx = Math.cos(a) * d, lz = Math.sin(a) * d, rad = 0.35 + dec() * 0.3;
        if (!free(lx, lz, 1.2)) continue;
        const bush = makeBush(dec, rad); bush.position.set(lx, TOP + 0.05, lz); bush.rotation.y = dec() * 6.28; group.add(bush);
      }
      const tufts = [];
      for (let i = 0, n = Math.round(R * R * 0.8); i < n; i++) {
        const a = dec() * 6.283, d = Math.sqrt(dec()) * R * 0.68, lx = Math.cos(a) * d, lz = Math.sin(a) * d;
        if (free(lx, lz, 0.5)) tufts.push([lx, TOP + 0.06, lz]);
      }
      if (tufts.length) group.add(makeGrassTufts(dec, tufts));
    }
    let siteCenter = [0, 0], rooms = [], towers = [], spawnSpots = [];
    let fireRef = null;
    if (!starterIsland) {
      const campCtx = { group, set, addSolid, solidOnly: (m) => solids.push(m), TOP, cx: campC[0], cz: campC[1], yaw: r() * 6.28, r, shared: shared(), id, destroyed: this.collected };
      const camp = siteType === 'scrap' ? buildScrapCamp(campCtx) : buildCamp(siteType, campCtx);
      siteCenter = camp.yard; rooms = camp.rooms; towers = camp.towers || []; spawnSpots = camp.spawns || [];
      for (const spot of camp.crateSpots) crates.push(spot);
      // Fogueira: pedras em anel, lenha cruzada e chamas em camadas (animadas em update).
      const campfire = new THREE.Group();
      campfire.position.set(camp.fire[0], TOP, camp.fire[1]);
      const stoneMat = M(0x6f6a62, { flatShading: true });
      for (let i = 0; i < 8; i++) {
        const st = new THREE.Mesh(new THREE.DodecahedronGeometry(0.12, 0), stoneMat);
        st.position.set(Math.cos(i / 8 * 6.28) * 0.42, 0.06, Math.sin(i / 8 * 6.28) * 0.42);
        st.rotation.set(i, i * 2, 0); campfire.add(st);
      }
      for (let i = 0; i < 3; i++) {
        const log = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.7, 6), M(0x3e2a18));
        log.rotation.set(Math.PI / 2 - 0.25, i * 2.1, 0); log.position.y = 0.1; campfire.add(log);
      }
      const flames = new THREE.Group();
      [[0xff4d1a, 0.26, 0.62, 0.9], [0xff8a2a, 0.19, 0.5, 0.85], [0xffd36a, 0.11, 0.36, 0.95]].forEach(([c, rr, hh, op]) => {
        const fl = new THREE.Mesh(new THREE.ConeGeometry(rr, hh, 7, 1, true),
          new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: op, depthWrite: false, side: THREE.DoubleSide }));
        fl.geometry.translate(0, hh / 2, 0); fl.position.y = 0.08; flames.add(fl);
      });
      campfire.add(flames);
      group.add(campfire);
      fireRef = flames;
    }
    const isl = {
      id, x, z, R, diff, group, set, solids, crates: [], enemies: [], palms: palmList,
      starter: starterIsland, siteType, siteCenter, rooms, towers, spawnSpots, landLayers, allItems: set.items.slice(),
      maxGround: islandElevation + 0.61, floodTier: null,
      fire: fireRef,
    };
    crates.forEach(([cx2, cz2], i) => {
      const cid = `${id}c${i}`;
      if (this.collected.has(cid)) return;
      const m = new THREE.Group();
      const S = shared();
      const base = box(0.8, 0.46, 0.8, S.crate);
      // cantoneiras de ferro
      for (const [ex, ez] of [[-0.39, -0.39], [0.39, -0.39], [-0.39, 0.39], [0.39, 0.39]]) {
        const edge = box(0.06, 0.48, 0.06, S.iron); edge.position.set(ex, 0.23, ez); m.add(edge);
      }
      base.position.y = 0.23;
      const lid = new THREE.Group();
      lid.position.set(0, 0.46, -0.36);
      const top = box(0.84, 0.14, 0.84, S.crateLid);
      top.position.set(0, 0.07, 0.36);
      lid.add(top);
      const strap = box(0.12, 0.12, 0.86, S.iron);
      strap.position.set(0, 0.08, 0.36);
      lid.add(strap);
      m.add(base, lid);
      m.scale.setScalar(1.4);
      m.position.set(cx2, TOP, cz2);
      m.rotation.y = r() * 3;
      group.add(m);
      const saved = this.crateStates.get(cid);
      const c = {
        id: cid, mesh: m, lid, x: x + cx2, z: z + cz2, y: islandElevation + TOP, diff,
        starter: cid === LOOT_CONFIG.starterCache.id,
        opened: !!(saved && saved.opened), openT: saved && saved.opened ? 1 : 0,
      };
      lid.rotation.x = -1.25 * c.openT;
      isl.crates.push(c); this.crates.push(c);
    });
    { // junta as malhas paradas da ilha (menos draw calls); fica de fora o que anima ou colide
      const solidSet = new Set(solids), palmSet = new Set(palmList), crateSet = new Set(isl.crates.map((c) => c.mesh));
      bakeStatic(group, { keep: (o) => solidSet.has(o) || o.userData.noBake || palmSet.has(o) || crateSet.has(o) || o === fireRef || (fireRef && o === fireRef.parent && o !== group) });
    }
    G.scene.add(group);
    group.updateMatrixWorld(true);
    G.colliders.addSet(set);
    G.physics.addStaticSet(set);
    G.solids.push(...solids);
    this.islands.push(isl);
    if (towers.length && G.siege) G.siege.addTowers(isl);
    if (!starterIsland) G.enemies.spawnForIsland(isl, r);
    return isl;
  }

  addStarterDeckParts(ch) {
    const G = this.G, island = ch.island;
    const def = { nome: 'Plataforma de madeira', size: PIECES.piso.size, pieceType: 'piso' };
    const positions = [[0, STARTER_FLOOR_LOCAL_Z]];
    positions.forEach(([x, z], index) => {
      const id = `starter-floor-${index}`;
      if (this.collected.has(id)) return;
      const existing = this.physObjects.find((item) => item.id === id);
      if (existing) { ch.debris.push(existing); return; }
      const mesh = makePieceMesh('piso');
      mesh.position.set(island.x + x, 0.65, island.z + z);
      G.scene.add(mesh);
      const obj = {
        id, def, mesh, x: island.x + x, z: island.z + z, tilt: 0,
        loot: {}, welded: false, carriedBy: null, placed: false, placedOnWater: false,
        starterPart: true,
      };
      ch.debris.push(obj);
      this.debris.push(obj);
      this.physObjects.push(obj);
      G.physics.addFloatingObject(obj);
      const welded = this.weldedStates.get(id);
      if (welded) G.build.applyRemoteWeld({ physId: id, piece: welded });
      else {
        const placed = this.placedStates.get(id);
        if (placed) this.applyPlacedState(id, placed);
      }
    });
  }

  // Naufrágio no fundo do mar: casco tombado e meio enterrado, com 1–2 baús dentro
  // (ids b<cx>,<cz>c<n>, validados pelo servidor) e destroços para montar a jangada em volta.
  makeWreck(ch, w) {
    const G = this.G, r = w.rng, S = shared();
    const gy = this.seabedHeight(w.x, w.z);
    const group = new THREE.Group(); group.position.set(w.x, gy, w.z); group.rotation.y = w.yaw;
    const set = { x: w.x, z: w.z, yaw: w.yaw, y: gy, radius: 9, items: [] };
    const hullMat = M(0x5e4630, { map: woodTexture(), bumpMap: woodBump(), bumpScale: 1.6 });
    const darkMat = M(0x3b2c1f, { map: woodTexture() });
    const L = 9, W = 3.2, Hh = 2.2, tilt = 0.32;
    const hull = new THREE.Group(); hull.rotation.z = tilt; hull.position.y = -0.35; group.add(hull);
    // Costado esquerdo (mais alto, por causa da inclinação) e direito quebrado, popa inteira.
    for (const side of [-1, 1]) {
      for (let k = 0; k < 5; k++) {
        const len = side > 0 && k > 2 ? L * (0.45 + r() * 0.2) : L * (0.92 - k * 0.04);
        const plank = box(0.12, 0.42, len, hullMat);
        plank.position.set(side * (W / 2 - k * 0.12 * (1 - k * 0.1)), 0.25 + k * 0.42, (L - len) / 2 * (side > 0 ? 1 : 0));
        plank.rotation.z = -side * (0.18 + k * 0.05);
        hull.add(plank);
      }
    }
    const keel = box(W * 0.6, 0.18, L * 0.95, darkMat); keel.position.y = 0.05; hull.add(keel);
    const stern = box(W, Hh, 0.18, hullMat); stern.position.set(0, Hh / 2, -L / 2); hull.add(stern);
    for (let i = 0; i < 6; i++) { // cavernas (costelas) aparecendo
      const rib = new THREE.Mesh(new THREE.TorusGeometry(W / 2, 0.08, 6, 14, Math.PI), darkMat);
      rib.rotation.set(0, 0, Math.PI); rib.position.set(0, Hh * 0.9, -L / 2 + 1 + i * 1.4); rib.scale.y = 1.2; hull.add(rib);
    }
    const deck = box(W * 0.8, 0.1, L * 0.35, hullMat); deck.position.set(0, Hh * 0.75, L / 2 - L * 0.2); // convés só na proa: baús à vista na popa deck.rotation.x = 0.05; hull.add(deck);
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.18, 6, 10), darkMat);
    mast.position.set(-1.6, 1.6, 0.8); mast.rotation.set(0.2, 0, 1.25); group.add(mast);
    const sail = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 2.2, 6, 4), M(0xcfc3a5, { side: THREE.DoubleSide, map: clothTex() }));
    sail.position.set(-3.6, 0.35, 1.2); sail.rotation.set(-Math.PI / 2 + 0.15, 0, 0.6); group.add(sail);
    // Colisão: paredes do casco (entra-se pela proa quebrada) e a popa.
    const wallY = 1.0;
    set.items.push({ type: 'box', x: -W / 2 + 0.1, y: wallY, z: 0, hx: 0.25, hy: 1.1, hz: L * 0.46, yaw: 0 });
    set.items.push({ type: 'box', x: W / 2 - 0.1, y: wallY * 0.6, z: -L * 0.2, hx: 0.25, hy: 0.7, hz: L * 0.25, yaw: 0 });
    set.items.push({ type: 'box', x: 0, y: wallY, z: -L / 2, hx: W / 2, hy: 1.1, hz: 0.2, yaw: 0 });
    // Baús dentro do casco.
    const crates = [];
    for (let n = 0; n < w.crates; n++) {
      const id = `b${w.cx},${w.cz}c${n}`;
      const lx = (n ? 0.5 : -0.4), lz = -L / 2 + 1.4 + n * 2.6;
      if (this.collected.has(id)) continue;
      const chest = new THREE.Group();
      const base = box(0.9, 0.5, 0.6, S.crate); base.position.y = 0.25; chest.add(base);
      for (const x of [-0.42, 0.42]) { const band = box(0.06, 0.52, 0.62, S.iron); band.position.set(x, 0.25, 0); chest.add(band); }
      const lid = new THREE.Group(); lid.position.set(0, 0.5, -0.3);
      const dome = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.9, 16, 1, false, 0, Math.PI), S.crateLid);
      dome.rotation.z = Math.PI / 2; dome.position.set(0, 0, 0.3); lid.add(dome);
      const lock = box(0.1, 0.14, 0.05, M(0xd8b04a, { metalness: 0.8, roughness: 0.3 })); lock.position.set(0, 0, 0.6); lid.add(lock);
      chest.add(lid);
      chest.position.set(lx, 0, lz); chest.rotation.set(0, (r() - 0.5) * 0.6, 0.05);
      group.add(chest);
      const [wx, wz] = rot(lx, lz, w.yaw);
      const saved = this.crateStates.get(id);
      const c = {
        id, mesh: chest, lid, x: w.x + wx, z: w.z + wz, y: gy, diff: this.difficulty(w.x, w.z), starter: false,
        opened: !!(saved && saved.opened), openT: saved && saved.opened ? 1 : 0, submerged: false,
      };
      lid.rotation.x = -1.25 * c.openT;
      crates.push(c); this.crates.push(c);
    }
    group.traverse((o) => { if (o.isMesh) { o.receiveShadow = true; o.castShadow = true; } });
    { const chests = new Set(crates.map((c) => c.mesh)); bakeStatic(group, { keep: (o) => chests.has(o) }); }
    G.scene.add(group);
    G.colliders.addSet(set);
    G.physics.addStaticSet(set);
    // Destroços para construir espalhados em volta (ficam no chão na seca, flutuam na cheia).
    for (let i = 0; i < w.debris; i++) {
      const a = r() * Math.PI * 2, d = 5 + r() * 9;
      const x = w.x + Math.cos(a) * d, z = w.z + Math.sin(a) * d;
      let pick = r() * DEBRIS_W, def = DEBRIS[0];
      for (const dd of DEBRIS) { pick -= dd.w; if (pick <= 0) { def = dd; break; } }
      this.spawnDebris(ch, `w${w.cx},${w.cz},${i}`, def, x, z, mulberry32(hash2(this.seed ^ 0x77, w.cx * 31 + i, w.cz)), this.seabedHeight(x, z) + 0.4);
    }
    const wreck = { x: w.x, z: w.z, group, set, crates };
    this.wrecks.push(wreck);
    return wreck;
  }

  dropChunk(ch) {
    const G = this.G;
    if (ch.seabed) {
      G.scene.remove(ch.seabed);
      ch.seabed.traverse((o) => { if (o.isMesh && !o.userData.sharedGeo) o.geometry.dispose(); });
      ch.seabed.children[0].material.dispose();
    }
    if (ch.wreck) {
      const w = ch.wreck;
      G.physics.removeStaticSet(w.set); G.colliders.removeSet(w.set); G.scene.remove(w.group);
      for (const c of w.crates) { const i = this.crates.indexOf(c); if (i >= 0) this.crates.splice(i, 1); }
      this.wrecks.splice(this.wrecks.indexOf(w), 1);
    }
    for (const d of ch.debris) {
      if (d.placed) continue;
      G.physics.removeObject(d);
      if (!d.welded && !d.carriedBy) G.scene.remove(d.mesh);
      const i = this.debris.indexOf(d); if (i >= 0) this.debris.splice(i, 1);
      const j = this.physObjects.indexOf(d); if (j >= 0) this.physObjects.splice(j, 1);
    }
    const isl = ch.island;
    if (!isl) return;
    G.physics.removeStaticSet(isl.set);
    G.scene.remove(isl.group);
    G.colliders.removeSet(isl.set);
    for (const m of isl.solids) { const i = G.solids.indexOf(m); if (i >= 0) G.solids.splice(i, 1); }
    for (const c of isl.crates) { const i = this.crates.indexOf(c); if (i >= 0) this.crates.splice(i, 1); }
    this.islands.splice(this.islands.indexOf(isl), 1);
    G.enemies.removeIsland(isl);
    if (G.siege) G.siege.removeIsland(isl);
  }

  // Marca como coletado (loot legado — ainda funciona para caixotes).
  markCollected(id) {
    this.collected.add(id);
    // Detritos físicos NÃO são removidos ao "coletar" — devem ser carregados manualmente.
    // Apenas caixotes são removidos ao abrir.
    let i = this.crates.findIndex((c) => c.id === id);
    if (i >= 0) {
      const c = this.crates[i]; c.mesh.parent.remove(c.mesh); this.crates.splice(i, 1);
      for (const isl of this.islands) { const j = isl.crates.indexOf(c); if (j >= 0) isl.crates.splice(j, 1); }
    }
  }

  applyCrateState(id, loot) {
    const inventory = { ...loot };
    const state = { id, opened: true, loot: inventory };
    this.crateStates.set(id, state);
    const crate = this.crates.find((item) => item.id === id);
    if (crate) crate.opened = true;
    if (!Object.values(inventory).some((amount) => amount > 0)) this.markCollected(id);
  }

  animateCrateOpen(id) {
    const crate = this.crates.find((item) => item.id === id);
    if (crate) crate.opened = true;
  }

  openCrate(id, playerCount = 1) {
    let state = this.crateStates.get(id);
    if (!state) {
      const crate = this.crates.find((item) => item.id === id);
      if (!crate) return null;
      state = {
        id, opened: true,
        loot: generateCrateLoot(this.seed, id, crate.diff, playerCount),
      };
      this.crateStates.set(id, state);
    }
    this.animateCrateOpen(id);
    return state;
  }

  // O barco encalha na parte rasa em vez de atravessar a ilha.
  pushBoat(boat) {
    const level = this.G.startup.waterLevel, boatR = Math.min(boat.set.radius, 7) * 0.75;
    for (const isl of this.islands) {
      if (isl.flooded) continue;
      const dx = boat.x - isl.x, dz = boat.z - isl.z, d = Math.hypot(dx, dz) || 1;
      // Faixas ainda fora d'água definem até onde a jangada chega (maré cheia = chega mais perto).
      let reach = 0;
      for (const [i, layer] of isl.landLayers.entries()) if (layer.top > level && layer.dr != null) reach = Math.max(reach, layer.dr);
      const min = isl.R + Math.min(2.5, reach * 0.45 + 0.5) + boatR;
      if (d < min) { boat.x = isl.x + (dx / d) * min; boat.z = isl.z + (dz / d) * min; boat.speed *= 0.9; }
    }
  }

  nearestIsland(x, z) {
    let best = null, bd = Infinity;
    for (const isl of this.islands) { const d = Math.hypot(isl.x - x, isl.z - z); if (d < bd) { bd = d; best = isl; } }
    return best ? { isl: best, dist: bd } : null;
  }
}
