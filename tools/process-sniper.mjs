// Rifle de precisão (FBX do Tripo, sem textura) para o jogo: pinta por vértice (metal no cano,
// ferrolho e luneta; madeira na coronha), oclusão por raios, escala e posiciona na convenção das
// armas (cano -Z, cima +Y, punho perto da origem) e grava GLB com meshopt + COLOR_0 + _SURF.
import fs from 'fs';
import { NodeIO, Document } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTMeshoptCompression } from '@gltf-transform/extensions';
import { meshopt, quantize } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer';
import * as THREE from 'three';
import { MeshBVH } from 'three-mesh-bvh';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
globalThis.self = globalThis; globalThis.window = globalThis;
globalThis.document = { createElementNS: () => ({ style: {} }), createElement: () => ({ style: {}, getContext: () => null }) };
const { FBXLoader } = await import('three/examples/jsm/loaders/FBXLoader.js');

await MeshoptEncoder.ready; await MeshoptDecoder.ready;
const buf = fs.readFileSync(process.argv[2]);
const root = new FBXLoader().parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length), '');
root.updateMatrixWorld(true);
let mesh; root.traverse((o) => { if (o.isMesh) mesh = o; });
let geo = mesh.geometry.clone().applyMatrix4(mesh.matrixWorld);
geo.deleteAttribute('normal');
geo = mergeVertices(geo, 1e-5);
geo.computeVertexNormals();
const P = geo.attributes.position.array, Nn = geo.attributes.normal.array, I = geo.index.array, nv = P.length / 3;
const X = (i) => P[i * 3], Y = (i) => P[i * 3 + 1], Z = (i) => P[i * 3 + 2];

// medidas: cano (frente, z mínimo), luneta (topo do meio), punho
let zmin = 1e9, zmax = -1e9, ymin = 1e9, ymax = -1e9;
for (let i = 0; i < nv; i++) { zmin = Math.min(zmin, Z(i)); zmax = Math.max(zmax, Z(i)); ymin = Math.min(ymin, Y(i)); ymax = Math.max(ymax, Y(i)); }
const L = zmax - zmin;
const mean = (f) => { let s = 0, n = 0; for (let i = 0; i < nv; i++) if (f(i)) { s += Y(i); n++; } return n ? s / n : NaN; };
const barrelY = mean((i) => Z(i) < zmin + L * 0.03);
// luneta: no trecho do meio, a faixa mais alta
let scopeTop = -1e9; for (let i = 0; i < nv; i++) if (Z(i) > zmin + L * 0.45 && Z(i) < zmin + L * 0.7) scopeTop = Math.max(scopeTop, Y(i));
const scopeY = mean((i) => Z(i) > zmin + L * 0.5 && Z(i) < zmin + L * 0.62 && Y(i) > scopeTop - 0.05);
console.log('L', L.toFixed(3), 'barrelY', barrelY.toFixed(3), 'scopeTop', scopeTop.toFixed(3), 'scopeY(mean top band)', scopeY.toFixed(3), 'ymin', ymin.toFixed(3));

// curvatura e oclusão
const curv = new Float32Array(nv), cnt = new Float32Array(nv);
for (let t = 0; t < I.length; t += 3) for (let k = 0; k < 3; k++) {
  const i = I[t + k];
  for (let m = 1; m < 3; m++) {
    const j = I[t + (k + m) % 3], dx = X(j) - X(i), dy = Y(j) - Y(i), dz = Z(j) - Z(i), l = Math.hypot(dx, dy, dz) || 1;
    curv[i] += (Nn[i * 3] * dx + Nn[i * 3 + 1] * dy + Nn[i * 3 + 2] * dz) / l; cnt[i]++;
  }
}
for (let i = 0; i < nv; i++) if (cnt[i]) curv[i] /= cnt[i];
geo.boundsTree = new MeshBVH(geo);
const ao = new Float32Array(nv).fill(1), RAYS = 24, RANGE = 0.08;
const ray = new THREE.Ray(), nrm = new THREE.Vector3(), dir = new THREE.Vector3(), t1 = new THREE.Vector3(), t2 = new THREE.Vector3();
for (let i = 0; i < nv; i++) {
  nrm.fromArray(Nn, i * 3);
  t1.set(Math.abs(nrm.x) < 0.9 ? 1 : 0, Math.abs(nrm.x) < 0.9 ? 0 : 1, 0).cross(nrm).normalize(); t2.crossVectors(nrm, t1);
  let hits = 0;
  for (let r = 0; r < RAYS; r++) {
    const u = (r + 0.5) / RAYS, a = r * 2.39996, s = Math.sqrt(u);
    dir.copy(nrm).multiplyScalar(Math.sqrt(1 - u)).addScaledVector(t1, Math.cos(a) * s).addScaledVector(t2, Math.sin(a) * s);
    ray.origin.fromArray(P, i * 3).addScaledVector(nrm, 0.0015); ray.direction.copy(dir);
    const h = geo.boundsTree.raycastFirst(ray, THREE.DoubleSide);
    if (h && h.distance < RANGE) hits += 1 - h.distance / RANGE;
  }
  ao[i] = 1 - Math.min(1, hits / RAYS * 1.6);
}

// regiões: metal em cima (cano, caixa da culatra, luneta) e na frente; madeira embaixo/atrás
const col = (h) => new THREE.Color(h);
const C = { blued: col(0x2f3438), scope: col(0x16181b), wood: col(0x6b4325), woodDark: col(0x4a2c17), worn: col(0xaab0b6) };
const WOOD_Y = +(process.argv[4] || -0.005);
const color = new Float32Array(nv * 3), surf = new Float32Array(nv * 2), c = new THREE.Color();
for (let i = 0; i < nv; i++) {
  const z = Z(i), y = Y(i), front = z < zmin + L * 0.3;
  let base, metal, rough;
  if (!front && y < WOOD_Y) { base = (Math.sin(z * 90 + y * 30) > 0.6 ? C.woodDark : C.wood); metal = 0; rough = 0.62; }
  else if (y > scopeTop - 0.06 && z > zmin + L * 0.4 && z < zmin + L * 0.78) { base = C.scope; metal = 0.6; rough = 0.45; }
  else { base = C.blued; metal = 0.9; rough = 0.34; }
  const wear = THREE.MathUtils.smoothstep(-curv[i], 0.04, 0.3), cav = THREE.MathUtils.smoothstep(curv[i], 0.04, 0.3);
  c.copy(base);
  if (metal > 0.5) c.lerp(C.worn, wear * 0.5); else c.multiplyScalar(1 + wear * 0.5);
  c.multiplyScalar((0.32 + 0.68 * ao[i]) * (1 - 0.3 * cav));
  color.set([c.r, c.g, c.b], i * 3);
  surf.set([metal, Math.max(0.15, rough - (metal > 0.5 ? wear * 0.12 : 0))], i * 2);
}

// transformação para o jogo: comprimento LEN, punho (gx, gy do modelo) → (0, -0.07, 0.075)
const LEN = 1.22, S = LEN / L;
const GZ = +(process.argv[5] || 0.29), GY = +(process.argv[6] || -0.08);
const tf = (i) => [X(i) * S, (Y(i) - GY) * S - 0.07, (Z(i) - GZ) * S + 0.075];
const info = { S, muzzle: [0, (barrelY - GY) * S - 0.07, (zmin - GZ) * S + 0.075], sightY: (scopeY - GY) * S - 0.07, scopeFrontZ: (zmin + L * 0.45 - GZ) * S + 0.075 };
console.log(JSON.stringify(info));

const out = new Document(), b = out.createBuffer(), scene = out.createScene('rifle');
const pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3);
for (let i = 0; i < nv; i++) { pos.set(tf(i), i * 3); nor.set([Nn[i * 3], Nn[i * 3 + 1], Nn[i * 3 + 2]], i * 3); }
const acc = (type, arr) => out.createAccessor().setType(type).setArray(arr).setBuffer(b);
const prim = out.createPrimitive().setAttribute('POSITION', acc('VEC3', pos)).setAttribute('NORMAL', acc('VEC3', nor))
  .setAttribute('COLOR_0', acc('VEC3', color)).setAttribute('_SURF', acc('VEC2', surf)).setIndices(acc('SCALAR', new Uint32Array(I)))
  .setMaterial(out.createMaterial('rifle').setMetallicFactor(1).setRoughnessFactor(1));
scene.addChild(out.createNode('corpo').setMesh(out.createMesh('corpo').addPrimitive(prim)).setExtras(info));
out.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.QUANTIZE });
await out.transform(quantize(), meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });
await io.write(process.argv[3], out);
console.log('verts', nv, 'tris', I.length / 3, 'bytes', fs.statSync(process.argv[3]).size);
