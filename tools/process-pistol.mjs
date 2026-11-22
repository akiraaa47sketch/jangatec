// Prepara a pistola do Tripo para o jogo:
//  - fica só com a peça principal (tira o pedaço solto que flutuava ao lado)
//  - separa o FERROLHO (parte de cima) do corpo, para recuar no tiro
//  - "pinta" por vértice: ferrolho em gunmetal, cano em aço, corpo em polímero preto, painéis do punho
//    em areia; quinas gastas (metal claro), cantos escuros e oclusão de ambiente por raios (BVH)
//  - gira/escala/posiciona: cano para -Z, cima +Y, punho perto da origem (convenção das armas)
//  - grava GLB com meshopt (+ COLOR_0 e _SURF = metal/aspereza)
import { NodeIO, Document } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTMeshoptCompression } from '@gltf-transform/extensions';
import { meshopt, quantize } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer';
import * as THREE from 'three';
import { MeshBVH } from 'three-mesh-bvh';

await MeshoptEncoder.ready; await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });
const src = await io.read(process.argv[2]);
const prim = src.getRoot().listMeshes()[0].listPrimitives()[0];
const P = prim.getAttribute('POSITION').getArray(), N0 = prim.getAttribute('NORMAL').getArray(), I = prim.getIndices().getArray();

// ---------- 1. só a peça principal ----------
const nv = P.length / 3, par = new Int32Array(nv).map((_, i) => i);
const find = (a) => { while (par[a] !== a) { par[a] = par[par[a]]; a = par[a]; } return a; };
for (let t = 0; t < I.length; t += 3) { const a = find(I[t]); par[find(I[t + 1])] = a; par[find(I[t + 2])] = a; }
const count = new Map();
for (let t = 0; t < I.length; t += 3) { const r = find(I[t]); count.set(r, (count.get(r) || 0) + 1); }
const main = [...count.entries()].sort((a, b) => b[1] - a[1])[0][0];
const tris = [];
for (let t = 0; t < I.length; t += 3) if (find(I[t]) === main) tris.push(I[t], I[t + 1], I[t + 2]);

// ---------- 2. normais e curvatura (quinas convexas = gastas, côncavas = sujeira) ----------
const geo = new THREE.BufferGeometry();
geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(P), 3));
geo.setIndex(tris);
geo.computeVertexNormals();
const Nn = geo.attributes.normal.array;
const curv = new Float32Array(nv), cnt = new Float32Array(nv);
for (let t = 0; t < tris.length; t += 3) for (let k = 0; k < 3; k++) {
  const i = tris[t + k];
  for (let m = 1; m < 3; m++) {
    const j = tris[t + (k + m) % 3];
    const dx = P[j * 3] - P[i * 3], dy = P[j * 3 + 1] - P[i * 3 + 1], dz = P[j * 3 + 2] - P[i * 3 + 2], l = Math.hypot(dx, dy, dz) || 1;
    curv[i] += (Nn[i * 3] * dx + Nn[i * 3 + 1] * dy + Nn[i * 3 + 2] * dz) / l; cnt[i]++;
  }
}
for (let i = 0; i < nv; i++) if (cnt[i]) curv[i] /= cnt[i];

// ---------- 3. oclusão de ambiente (raios no hemisfério de cada vértice) ----------
geo.boundsTree = new MeshBVH(geo);
const ao = new Float32Array(nv).fill(1), RAYS = 24, RANGE = 0.12;
const ray = new THREE.Ray(), nrm = new THREE.Vector3(), dir = new THREE.Vector3(), t1 = new THREE.Vector3(), t2 = new THREE.Vector3();
const used = new Uint8Array(nv); for (const i of tris) used[i] = 1;
for (let i = 0; i < nv; i++) {
  if (!used[i]) continue;
  nrm.fromArray(Nn, i * 3);
  t1.set(Math.abs(nrm.x) < 0.9 ? 1 : 0, Math.abs(nrm.x) < 0.9 ? 0 : 1, 0).cross(nrm).normalize(); t2.crossVectors(nrm, t1);
  let hits = 0;
  for (let r = 0; r < RAYS; r++) {
    const u = (r + 0.5) / RAYS, a = r * 2.39996, s = Math.sqrt(u);
    dir.copy(nrm).multiplyScalar(Math.sqrt(1 - u)).addScaledVector(t1, Math.cos(a) * s).addScaledVector(t2, Math.sin(a) * s);
    ray.origin.fromArray(P, i * 3).addScaledVector(nrm, 0.002); ray.direction.copy(dir);
    const h = geo.boundsTree.raycastFirst(ray, THREE.DoubleSide);
    if (h && h.distance < RANGE) hits += 1 - h.distance / RANGE;
  }
  ao[i] = 1 - Math.min(1, hits / RAYS * 1.6);
}

// ---------- 4. regiões e cores (coordenadas do modelo: cano em -X, punho em +X/baixo) ----------
const SLIDE_Y = 0.055;
const col = (h) => new THREE.Color(h);
const C = { slide: col(0x3b4149), barrel: col(0x2b2e33), poly: col(0x1d1f22), panel: col(0x8a7a5a), wornMetal: col(0xb7bcc2) };
const triRegion = new Uint8Array(tris.length / 3); // 1 = ferrolho
for (let t = 0, k = 0; t < tris.length; t += 3, k++) {
  const cy = (P[tris[t] * 3 + 1] + P[tris[t + 1] * 3 + 1] + P[tris[t + 2] * 3 + 1]) / 3;
  triRegion[k] = cy > SLIDE_Y ? 1 : 0;
}
const color = new Float32Array(nv * 3), surf = new Float32Array(nv * 2), c = new THREE.Color();
for (let i = 0; i < nv; i++) {
  const x = P[i * 3], y = P[i * 3 + 1], nz = Math.abs(Nn[i * 3 + 2]);
  let base, metal, rough;
  if (y > SLIDE_Y) { if (x < -0.3) { base = C.barrel; metal = 0.9; rough = 0.3; } else { base = C.slide; metal = 0.85; rough = 0.38; } }
  else if (x > 0.2 && y < -0.06 && nz > 0.6) { base = C.panel; metal = 0; rough = 0.82; }   // painéis laterais do punho
  else { base = C.poly; metal = 0.05; rough = 0.7; }
  const wear = THREE.MathUtils.smoothstep(-curv[i], 0.04, 0.3), cav = THREE.MathUtils.smoothstep(curv[i], 0.04, 0.3);
  c.copy(base);
  if (metal > 0.5) c.lerp(C.wornMetal, wear * 0.55); else c.multiplyScalar(1 + wear * 0.6);
  c.multiplyScalar((0.3 + 0.7 * ao[i]) * (1 - 0.35 * cav));
  color.set([c.r, c.g, c.b], i * 3);
  surf.set([metal > 0.5 ? Math.min(1, metal + wear * 0.1) : metal, Math.max(0.15, rough - (metal > 0.5 ? wear * 0.15 : 0))], i * 2);
}

// ---------- 5. transformação para a convenção das armas ----------
// gira -90° em Y (cano -X → -Z), escala para 17,5 cm de altura e alinha punho/topo
const mainIdx = new Set(tris);
let ymin = 1e9, ymax = -1e9, xmin = 1e9, xmax = -1e9, zmin = 1e9, zmax = -1e9;
const ys = [];
for (const i of mainIdx) { const x = P[i * 3], y = P[i * 3 + 1], z = P[i * 3 + 2]; ymin = Math.min(ymin, y); ymax = Math.max(ymax, y); xmin = Math.min(xmin, x); xmax = Math.max(xmax, x); zmin = Math.min(zmin, z); zmax = Math.max(zmax, z); ys.push(y); }
ys.sort((a, b) => a - b);
const yTop = ys[Math.floor(ys.length * 0.985)];
const S = 0.175 / (yTop - ymin);
let gz = 0, gn = 0; // centro do punho (parte de baixo) no eixo do comprimento
for (const i of mainIdx) if (P[i * 3 + 1] < ymin + (yTop - ymin) * 0.3) { gz += P[i * 3]; gn++; }
gz /= gn;
const zc = (zmin + zmax) / 2;
const xf = (i) => { // modelo → jogo
  const x = P[i * 3], y = P[i * 3 + 1], z = P[i * 3 + 2];
  return [-(z - zc) * S, (y - yTop) * S + 0.058, (x - gz) * S + 0.065];
};
const nf = (i) => [-Nn[i * 3 + 2], Nn[i * 3 + 1], Nn[i * 3]];
console.log('scale', S.toFixed(4), 'length(m)', ((xmax - xmin) * S).toFixed(3), 'thick', ((zmax - zmin) * S).toFixed(3), 'muzzle z', ((xmin - gz) * S + 0.065).toFixed(3), 'slide bottom y', ((SLIDE_Y - yTop) * S + 0.058).toFixed(3));

// ---------- 6. duas malhas (corpo e ferrolho) com vértices próprios ----------
const out = new Document(), buf = out.createBuffer();
const scene = out.createScene('pistola');
for (const [name, region] of [['corpo', 0], ['ferrolho', 1]]) {
  const map = new Map(), pos = [], nor = [], co = [], su = [], ix = [];
  for (let t = 0, k = 0; t < tris.length; t += 3, k++) {
    if (triRegion[k] !== region) continue;
    for (let m = 0; m < 3; m++) {
      const i = tris[t + m];
      if (!map.has(i)) { map.set(i, pos.length / 3); pos.push(...xf(i)); nor.push(...nf(i)); co.push(color[i * 3], color[i * 3 + 1], color[i * 3 + 2]); su.push(surf[i * 2], surf[i * 2 + 1]); }
      ix.push(map.get(i));
    }
  }
  const p2 = out.createPrimitive()
    .setAttribute('POSITION', out.createAccessor().setType('VEC3').setArray(new Float32Array(pos)).setBuffer(buf))
    .setAttribute('NORMAL', out.createAccessor().setType('VEC3').setArray(new Float32Array(nor)).setBuffer(buf))
    .setAttribute('COLOR_0', out.createAccessor().setType('VEC3').setArray(new Float32Array(co)).setBuffer(buf))
    .setAttribute('_SURF', out.createAccessor().setType('VEC2').setArray(new Float32Array(su)).setBuffer(buf))
    .setIndices(out.createAccessor().setType('SCALAR').setArray(new Uint32Array(ix)).setBuffer(buf))
    .setMaterial(out.createMaterial(name).setMetallicFactor(1).setRoughnessFactor(1));
  scene.addChild(out.createNode(name).setMesh(out.createMesh(name).addPrimitive(p2)));
  console.log(name, 'verts', pos.length / 3, 'tris', ix.length / 3);
}
out.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.QUANTIZE });
await out.transform(quantize(), meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
await io.write(process.argv[3], out);
