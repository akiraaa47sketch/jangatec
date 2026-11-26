// Solda em GRAFO: cada peça soldada está presa às peças que ela toca (não "ao barco inteiro").
// Quando uma peça quebra ou é dessoldada, as peças que perderam o caminho até o núcleo da jangada
// (plataforma inicial, mastro, convés inicial) se soltam — e continuam soldadas ENTRE SI, formando
// uma fatia separada que boia sozinha.
import * as THREE from '../three.js';
import { PIECES } from '../boat/pieces.js';

const _q = new THREE.Quaternion();
export const WELD_MARGIN = 0.12; // folga (m) para duas peças contarem como encostadas

// Caixa orientada { c, ax[3], h[3] } de uma peça, no espaço LOCAL do barco.
export function pieceBox(piece) {
  const mesh = piece.mesh; if (!mesh) return null;
  let size, offset;
  if (piece.physObj) { size = piece.physSize || piece.physObj.physicsSize || piece.physObj.def.size; offset = piece.physOffset || piece.physObj.physicsOffset || [0, 0, 0]; }
  else { const def = PIECES[piece.type]; if (!def) return null; size = def.size; offset = [0, 0, 0]; }
  return obb(mesh.position, mesh.quaternion, size, offset);
}
export function obb(position, quaternion, size, offset = [0, 0, 0]) {
  const ax = [new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1)].map((a) => a.applyQuaternion(quaternion));
  const c = new THREE.Vector3(...offset).applyQuaternion(quaternion).add(position);
  return { c, ax, h: [size[0] / 2, size[1] / 2, size[2] / 2] };
}

// Teste de separação por eixos (15 eixos) com folga: true se as caixas se tocam/encostam.
const _t = new THREE.Vector3(), _axis = new THREE.Vector3();
export function boxesTouch(A, B, margin = WELD_MARGIN) {
  _t.subVectors(B.c, A.c);
  const test = (L) => {
    const len = L.length(); if (len < 1e-6) return true;
    const ra = A.h[0] * Math.abs(A.ax[0].dot(L)) + A.h[1] * Math.abs(A.ax[1].dot(L)) + A.h[2] * Math.abs(A.ax[2].dot(L));
    const rb = B.h[0] * Math.abs(B.ax[0].dot(L)) + B.h[1] * Math.abs(B.ax[1].dot(L)) + B.h[2] * Math.abs(B.ax[2].dot(L));
    return Math.abs(_t.dot(L)) <= ra + rb + margin * len;
  };
  for (let i = 0; i < 3; i++) if (!test(A.ax[i]) || !test(B.ax[i])) return false;
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) if (!test(_axis.crossVectors(A.ax[i], B.ax[j]))) return false;
  return true;
}

// Núcleo: o que nunca se solta (plataforma inicial, mastro, convés inicial) e peças sem objeto
// físico (canhões instalados etc. — ficam presos no barco como antes).
const isRoot = (p) => p.locked || p.indestructible || !p.physObj;

// Peças soldadas que ficaram sem caminho até o núcleo, agrupadas por fatia: [[piece, ...], ...]
export function orphanGroups(boat) {
  const nodes = [...boat.pieces.values()].filter((p) => p.mesh);
  const boxes = new Map();
  for (const p of nodes) { const b = pieceBox(p); if (b) boxes.set(p, b); }
  const list = [...boxes.keys()];
  const adj = new Map(list.map((p) => [p, []]));
  for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
    const a = list[i], b = list[j], A = boxes.get(a), B = boxes.get(b);
    const reach = A.h[0] + A.h[1] + A.h[2] + B.h[0] + B.h[1] + B.h[2] + WELD_MARGIN;
    if (A.c.distanceToSquared(B.c) > reach * reach) continue;
    if (boxesTouch(A, B)) { adj.get(a).push(b); adj.get(b).push(a); }
  }
  const seen = new Set(), queue = list.filter(isRoot);
  for (const r of queue) seen.add(r);
  while (queue.length) { const p = queue.pop(); for (const n of adj.get(p)) if (!seen.has(n)) { seen.add(n); queue.push(n); } }
  const groups = [];
  for (const p of list) {
    if (seen.has(p)) continue;
    const g = [], st = [p]; seen.add(p);
    while (st.length) { const q = st.pop(); g.push(q); for (const n of adj.get(q)) if (!seen.has(n) && !isRoot(n)) { seen.add(n); st.push(n); } }
    groups.push({ pieces: g, links: g.flatMap((a) => adj.get(a).filter((b) => g.includes(b) && a.id < b.id).map((b) => [a, b])) });
  }
  return groups;
}

// A peça (caixa em coordenadas de MUNDO) encosta em alguma peça da jangada?
export function touchesRaft(boat, worldBox) {
  boat.group.updateMatrixWorld(true);
  const bq = boat.group.getWorldQuaternion(_q);
  for (const p of boat.pieces.values()) {
    const b = pieceBox(p); if (!b) continue;
    const W = { c: boat.group.localToWorld(b.c.clone()), ax: b.ax.map((a) => a.clone().applyQuaternion(bq)), h: b.h };
    if (boxesTouch(worldBox, W, 0.06)) return true;
  }
  return false;
}
