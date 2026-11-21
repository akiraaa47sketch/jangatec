// Catálogo de peças modulares. Para criar uma peça nova basta adicionar uma entrada aqui.
// size = [largura X, altura Y, comprimento Z]; col = tipo de colisor.
import * as THREE from '../three.js';
import { woodTexture, scaleBoxUVs } from '../world/textures.js';

export const STARTER_PLATFORM_SIZE = 6;

export const PIECES = {
  piso:       { nome: 'Piso',        size: [STARTER_PLATFORM_SIZE, 0.2, STARTER_PLATFORM_SIZE], custo: { madeira: 2 }, cor: 0x9b7242 },
  tabua:      { nome: 'Tábua',       size: [0.6, 0.12, 3],  custo: { madeira: 1 }, cor: 0xb08a55 },
  bloco:      { nome: 'Bloco',       size: [1, 1, 2],       custo: { madeira: 3 }, cor: 0x80603a },
  rampa:      { nome: 'Rampa',       size: [1.5, 1, 2.5],   custo: { madeira: 3 }, cor: 0x8d6a3f, col: 'ramp' },
  escada:     { nome: 'Escada',      size: [1.2, 2, 2.4],   custo: { madeira: 4 }, cor: 0x8d6a3f, col: 'ramp', stairs: true },
  plataforma: { nome: 'Plataforma',  size: [STARTER_PLATFORM_SIZE, 0.3, STARTER_PLATFORM_SIZE], custo: { madeira: 4 }, cor: 0xa57c4a },
  parede:     { nome: 'Parede',      size: [2, 2, 0.2],     custo: { madeira: 2 }, cor: 0x7a5c38 },
  suporte:    { nome: 'Suporte',     size: [0.3, 2, 0.3],   custo: { madeira: 1 }, cor: 0x6b4f30 },
  chapa:      { nome: 'Chapa',       size: [2, 0.1, 2],     custo: { metal: 2 },   cor: 0x8f979c, metal: true },
  mastro:     { nome: 'Mastro',      size: [0.3, 5, 0.3],   custo: {}, cor: 0x5d4428, col: 'cyl', fixed: true, hidden: true },
};
export const BUILD_LIST = Object.keys(PIECES).filter((k) => !PIECES[k].hidden);

function wedgeGeometry(w, h, l) {
  const x = w / 2, y = h / 2, z = l / 2;
  const A = [-x, -y, -z], B = [x, -y, -z], C = [-x, -y, z], D = [x, -y, z], E = [-x, y, z], F = [x, y, z];
  const tris = [A, B, D, A, D, C, C, D, F, C, F, E, A, E, F, A, F, B, A, C, E, B, F, D];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(tris.flat(), 3));
  // UV planar em escala de mundo (tábuas correm ao longo de Z)
  g.setAttribute('uv', new THREE.Float32BufferAttribute(tris.flatMap(([px, py, pz]) => [px, pz + py * 0.5]), 2));
  g.computeVertexNormals();
  return g;
}

export function makePieceMesh(type, ghost = false) {
  const def = PIECES[type], [w, h, l] = def.size;
  const wood = !ghost && !def.metal;
  const mat = ghost
    ? new THREE.MeshBasicMaterial({ color: 0x55ff88, transparent: true, opacity: 0.45, depthWrite: false, side: THREE.DoubleSide })
    : new THREE.MeshStandardMaterial({ color: def.cor, map: wood ? woodTexture() : null, roughness: def.metal ? 0.5 : 0.9, metalness: def.metal ? 0.6 : 0, side: THREE.DoubleSide });
  const boxGeo = (bw, bh, bl) => { const bg = new THREE.BoxGeometry(bw, bh, bl); return wood ? scaleBoxUVs(bg, bw, bh, bl) : bg; };
  const g = new THREE.Group();
  if (def.stairs) {
    const n = 6;
    for (let i = 0; i < n; i++) {
      const sh = (h / n) * (i + 1);
      const m = new THREE.Mesh(boxGeo(w, sh, l / n), mat);
      m.position.set(0, -h / 2 + sh / 2, -l / 2 + (l / n) * (i + 0.5));
      g.add(m);
    }
  } else if (def.col === 'ramp') g.add(new THREE.Mesh(wedgeGeometry(w, h, l), mat));
  else if (def.col === 'cyl') g.add(new THREE.Mesh(new THREE.CylinderGeometry(w / 2, w / 2, h, 10), mat));
  else g.add(new THREE.Mesh(boxGeo(w, h, l), mat));
  return g;
}
