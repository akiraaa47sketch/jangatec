// Fundo do mar: terreno contínuo (dunas, valas) que sobe em encosta até a base das ilhas.
// Fica sob a água na maré cheia; na seca total vira chão firme por onde se anda.
// seabedHeight é determinístico (seed) e é a MESMA função usada na malha, na colisão do
// jogador, no encalhe da jangada e na física dos destroços.
import * as THREE from '../three.js';
import { mulberry32, hash2 } from '../core/util.js';
import { WORLD_LOOT_PARAMS } from '../systems/loot.js';
import { sandTexture, sandBump, repeated } from './textures.js';
import { makeRock } from './models.js';

const S = WORLD_LOOT_PARAMS.chunkSize;
// Redemoinho do furacão: o funil d'água desce bem mais fundo que o fundo do mar. Para o centro
// nunca ficar "seco", o fundo (e pedras/algas) afunda junto, só debaixo do funil (no shader).
const VORTEX_U = { uSbVortex: { value: new THREE.Vector4(0, 0, 70, 9) }, uSbVortexK: { value: 0 } };
export function setSeabedVortex(v) {
  VORTEX_U.uSbVortex.value.set(v.x, v.z, v.R, v.depth); VORTEX_U.uSbVortexK.value = v.k || 0;
}
export function patchVortexDip(material) {
  if (!material || material.userData.vortexDip) return;
  material.userData.vortexDip = true;
  const prev = material.onBeforeCompile;
  material.onBeforeCompile = (shader, r) => {
    if (prev) prev(shader, r);
    Object.assign(shader.uniforms, VORTEX_U);
    shader.vertexShader = 'uniform vec4 uSbVortex; uniform float uSbVortexK;\n' + shader.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      if (uSbVortexK > 0.0) {
        vec4 vwp = modelMatrix * vec4(transformed, 1.0);
        float vq = length(vwp.xz - uSbVortex.xy) / uSbVortex.z;
        transformed.y -= uSbVortexK * (uSbVortex.w * 2.0 + 4.0) * exp(-vq * vq * 1.4);
      }`);
  };
  material.needsUpdate = true;
}

// islandEdge bem abaixo da quilha (0,9 m): perto das ilhas o fundo não encalha mais a jangada com o mar cheio
export const SEABED = { base: -4.6, min: -6.4, islandEdge: -1.9, starterEdge: -2.0, slope: 22 };

// Ilha do chunk (mesma ordem de RNG de World.makeChunk/makeIsland).
const islandCache = new Map();
function chunkIsland(seed, cx, cz) {
  const key = `${seed}:${cx},${cz}`;
  if (islandCache.has(key)) return islandCache.get(key);
  let isl = null;
  if (cx !== 0 || cz !== 0) {
    const r = mulberry32(hash2(seed, cx, cz)), roll = r(), starter = cx === 0 && cz === 1;
    // só a ilha inicial ainda levanta o fundo em volta (as outras têm o próprio morro: World.seabedHeight)
    if (starter) {
      const x = cx * S + (r() - 0.5) * 30, z = cz * S + (r() - 0.5) * 30;
      const R = starter ? 15 + r() * 3 : 9 + r() * 6;
      isl = { x, z, R: R + (starter ? 7.5 : 2.2), edge: starter ? SEABED.starterEdge : SEABED.islandEdge };
    }
  }
  if (islandCache.size > 4000) islandCache.clear();
  islandCache.set(key, isl);
  return isl;
}

const smooth = (x) => { x = Math.max(0, Math.min(1, x)); return x * x * (3 - 2 * x); };

export function seabedHeight(seed, x, z) {
  const ph = (seed % 1000) * 0.0137;
  let h = SEABED.base +
    0.85 * Math.sin(x * 0.043 + ph) * Math.cos(z * 0.037 - ph * 1.3) +
    0.45 * Math.sin((x + z) * 0.087 + ph * 2.1) +
    0.22 * Math.sin(x * 0.21 - z * 0.17 + ph * 3.7) +
    0.12 * Math.cos(x * 0.47 + z * 0.39);
  // valas longas e rasas
  h -= 0.7 * Math.max(0, Math.sin(x * 0.011 + z * 0.019 + ph) - 0.75) * 4;
  const cx = Math.round(x / S), cz = Math.round(z / S);
  for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
    const isl = chunkIsland(seed, cx + i, cz + j);
    if (!isl) continue;
    const d = Math.hypot(x - isl.x, z - isl.z) - isl.R;
    const k = smooth(1 - d / SEABED.slope);
    if (k > 0) h = h + (isl.edge - h) * k;
  }
  return Math.max(SEABED.min, h);
}

const WEED = new THREE.MeshStandardMaterial({ color: 0x5b6b45, roughness: 0.95, side: THREE.DoubleSide }); // alga seca, cor apagada
const SHELL_COLORS = [0xe0643c, 0xd94f6a, 0xf0a13c, 0xefe3cf];
let starGeo = null;
function starGeometry() {
  if (starGeo) return starGeo;
  const shape = new THREE.Shape();
  for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2, rr = i % 2 ? 0.07 : 0.17; shape[i ? 'lineTo' : 'moveTo'](Math.sin(a) * rr, Math.cos(a) * rr); }
  starGeo = new THREE.ExtrudeGeometry(shape, { depth: 0.03, bevelEnabled: false });
  return starGeo;
}

// Malha de um chunk (90 m) + decoração. Bordas usam a mesma função: sem emendas.
export function makeSeabedChunk(seed, cx, cz) {
  const group = new THREE.Group();
  const N = 45, geo = new THREE.PlaneGeometry(S, S, N, N);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position, col = new Float32Array(pos.count * 3);
  const deep = new THREE.Color(0xa08e69), mid = new THREE.Color(0xc8b487), high = new THREE.Color(0xdfcd99), c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const wx = pos.getX(i) + cx * S, wz = pos.getZ(i) + cz * S, h = seabedHeight(seed, wx, wz);
    pos.setY(i, h);
    const t = (h - SEABED.min) / (SEABED.islandEdge - SEABED.min);
    c.copy(deep).lerp(mid, Math.min(1, t * 1.6)).lerp(high, Math.max(0, t * 1.6 - 0.6));
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
    vertexColors: true, roughness: 0.95,
    map: repeated(sandTexture(), S / 7), bumpMap: repeated(sandBump(), S / 7), bumpScale: 0.6, // textura mais calma (menos ruído visual na seca)
  }));
  mesh.position.set(cx * S, 0, cz * S);
  mesh.receiveShadow = true;
  group.add(mesh);
  // decoração esparsa (a seca ficava poluída): poucas pedras, tufos de alga e uma ou outra estrela
  const r = mulberry32(hash2(seed ^ 0x2b1d, cx, cz));
  const at = (x, z) => [cx * S + x, seabedHeight(seed, cx * S + x, cz * S + z), cz * S + z];
  for (let i = 0; i < 4; i++) {
    const [x, y, z] = at((r() - 0.5) * S, (r() - 0.5) * S);
    if (y > SEABED.islandEdge - 0.3) continue;
    const rock = makeRock(r, 0.3 + r() * 0.9); rock.position.set(x, y - 0.1, z); group.add(rock);
  }
  for (let i = 0; i < 7; i++) {
    const [x, y, z] = at((r() - 0.5) * S, (r() - 0.5) * S);
    if (y > SEABED.islandEdge - 0.3) continue;
    const w = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.6 + r() * 0.8), WEED);
    w.geometry.translate(0, 0.35, 0);
    w.position.set(x, y, z); w.rotation.set(0, r() * 3, (r() - 0.5) * 0.5); group.add(w);
  }
  for (let i = 0; i < 2; i++) {
    const [x, y, z] = at((r() - 0.5) * S, (r() - 0.5) * S);
    const st = new THREE.Mesh(starGeometry(), new THREE.MeshStandardMaterial({ color: new THREE.Color(SHELL_COLORS[i % 4]).lerp(new THREE.Color(0xb8a27a), 0.45), roughness: 0.8 }));
    st.rotation.set(-Math.PI / 2, 0, r() * 6); st.position.set(x, y + 0.02, z); st.userData.sharedGeo = true; group.add(st);
  }
  return group;
}

// Chão "infinito" bem embaixo: no horizonte da seca não aparece buraco.
export function makeFarSeabed() {
  // malha subdividida (quadrados de 50 m): um disco com triângulos de 900 m falha no recorte
  // pelo plano próximo da câmera e cobre a tela
  const m = new THREE.Mesh(new THREE.PlaneGeometry(1100, 1100, 22, 22), new THREE.MeshStandardMaterial({ color: 0xa08e69, roughness: 1 }));
  m.rotation.x = -Math.PI / 2; m.position.y = SEABED.min - 0.3;
  m.userData.noShadow = true;
  return m;
}
