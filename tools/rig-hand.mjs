// Rig automático da mão (Tripo): mesh estático de 2 mãos abertas → 1 mão DIREITA com esqueleto
// (punho + 4 dedos × 3 juntas + polegar × 2) e pesos de pele, na convenção do jogo:
// origem no punho, dedos para -Z, palma para -Y, polegar em -X. A esquerda é a direita espelhada.
import { NodeIO, Document } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { textureCompress } from '@gltf-transform/functions';
import sharp from 'sharp';
import * as THREE from 'three';

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const src = await io.read(process.argv[2]);
const prim = src.getRoot().listMeshes()[0].listPrimitives()[0];
const P = prim.getAttribute('POSITION').getArray(), N = prim.getAttribute('NORMAL').getArray();
const UV = prim.getAttribute('TEXCOORD_0').getArray(), I = prim.getIndices().getArray();
const mat0 = prim.getMaterial();

// ---------- componentes (as duas mãos) ----------
const nv = P.length / 3, par = new Int32Array(nv).map((_, i) => i);
const find = (a) => { while (par[a] !== a) { par[a] = par[par[a]]; a = par[a]; } return a; };
// junta também vértices na mesma posição (costuras de UV) para não partir a mão
const key = new Map();
for (let i = 0; i < nv; i++) { const k = `${P[i * 3].toFixed(5)},${P[i * 3 + 1].toFixed(5)},${P[i * 3 + 2].toFixed(5)}`; if (key.has(k)) par[find(i)] = find(key.get(k)); else key.set(k, i); }
for (let t = 0; t < I.length; t += 3) { const a = find(I[t]); par[find(I[t + 1])] = a; par[find(I[t + 2])] = a; }
const groups = new Map();
for (let t = 0; t < I.length; t += 3) { const r = find(I[t]); if (!groups.has(r)) groups.set(r, []); groups.get(r).push(t); }
const comps = [...groups.values()].sort((a, b) => b.length - a.length).slice(0, 2);

const v3 = (i) => new THREE.Vector3(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]);
function analyze(tris) {
  const ids = [...new Set(tris.flatMap((t) => [I[t], I[t + 1], I[t + 2]]))];
  const c = new THREE.Vector3(); for (const i of ids) c.add(v3(i)); c.divideScalar(ids.length);
  // PCA (matriz de covariância 3×3, autovetores por iteração de potência)
  const C = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (const i of ids) { const d = v3(i).sub(c).toArray(); for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) C[a][b] += d[a] * d[b]; }
  const mul = (M, v) => new THREE.Vector3(M[0][0] * v.x + M[0][1] * v.y + M[0][2] * v.z, M[1][0] * v.x + M[1][1] * v.y + M[1][2] * v.z, M[2][0] * v.x + M[2][1] * v.y + M[2][2] * v.z);
  const eig = (M, ortho = []) => { let v = new THREE.Vector3(0.3, 0.6, 0.7).normalize(); for (let k = 0; k < 200; k++) { v = mul(M, v); for (const o of ortho) v.addScaledVector(o, -v.dot(o)); v.normalize(); } return v; };
  const e1 = eig(C), e2 = eig(C, [e1]), e3 = new THREE.Vector3().crossVectors(e1, e2).normalize();
  const proj = (i, e) => v3(i).sub(c).dot(e);
  const s1 = ids.map((i) => proj(i, e1)), lo = Math.min(...s1), hi = Math.max(...s1), L = hi - lo;
  const spread = (sel) => { const xs = sel.map((i) => proj(i, e2)); return Math.max(...xs) - Math.min(...xs); };
  const endA = ids.filter((i) => proj(i, e1) < lo + L * 0.18), endB = ids.filter((i) => proj(i, e1) > hi - L * 0.18);
  const F = spread(endB) > spread(endA) ? e1.clone() : e1.clone().negate(); // dedos = ponta mais "aberta"
  const along = (i) => v3(i).sub(c).dot(F), aMin = Math.min(...ids.map(along)), aMax = Math.max(...ids.map(along));
  const tips = ids.filter((i) => along(i) > aMax - (aMax - aMin) * 0.12), mid = ids.filter((i) => Math.abs(along(i) - (aMin + aMax) / 2) < (aMax - aMin) * 0.1);
  const mean = (sel, e) => sel.reduce((s, i) => s + v3(i).sub(c).dot(e), 0) / sel.length;
  const Pn = mean(tips, e3) > mean(mid, e3) ? e3.clone() : e3.clone().negate();     // lado da palma (dedos curvam para lá)
  const band = ids.filter((i) => { const a = (along(i) - aMin) / (aMax - aMin); return a > 0.3 && a < 0.75; });
  const xs = band.map((i) => v3(i).sub(c).dot(e2)).sort((a, b) => a - b), med = xs[xs.length >> 1];
  const T = (xs[xs.length - 1] - med) > (med - xs[0]) ? e2.clone() : e2.clone().negate(); // lado do polegar
  const conf = Math.abs((xs[xs.length - 1] - med) - (med - xs[0])) / (xs[xs.length - 1] - xs[0]); // quão claro é o lado do polegar
  const wrist = new THREE.Vector3(); const wr = ids.filter((i) => along(i) < aMin + (aMax - aMin) * 0.04); for (const i of wr) wrist.add(v3(i)); wrist.divideScalar(wr.length);
  // direita: X(-T) = Y(-P) × Z(-F)  ⇔  (P × F)·(-T) > 0
  const right = new THREE.Vector3().crossVectors(Pn, F).dot(T) < 0;
  return { ids, F, Pn, T, wrist, len: aMax - aMin, right, conf };
}
const A = comps.map(analyze);
for (const a of A) console.log('wrist', a.wrist.toArray().map((v) => v.toFixed(2)).join(','), 'F', a.F.toArray().map((v) => v.toFixed(2)).join(','), 'P', a.Pn.toArray().map((v) => v.toFixed(2)).join(','), 'T', a.T.toArray().map((v) => v.toFixed(2)).join(','), 'right', a.right);
// as duas mãos são espelhadas: confia na que tem o polegar mais claro e a outra é o oposto
const sure = A[0].conf >= A[1].conf ? 0 : 1, other = 1 - sure;
if (A[other].right === A[sure].right) { A[other].T.negate(); A[other].right = !A[sure].right; }
console.log('confiança', A.map((a) => a.conf.toFixed(2)).join(' '));
const hi = A.findIndex((a) => a.right);
if (hi < 0) throw new Error('nenhuma mão direita detectada');
const H = A[hi], tris = comps[hi];
console.log('mãos:', A.map((a) => (a.right ? 'direita' : 'esquerda')).join(', '));

// ---------- para a convenção do jogo (2 passadas: a 2ª usa a linha dos nós dos dedos) ----------
function pass(X, Y, Z, W0, SCALE) {
const ids = [...new Set(tris.flatMap((t) => [I[t], I[t + 1], I[t + 2]]))], remap = new Map(ids.map((i, k) => [i, k]));
const pos = new Float32Array(ids.length * 3), nor = new Float32Array(ids.length * 3), uv = new Float32Array(ids.length * 2);
ids.forEach((i, k) => {
  const d = v3(i).sub(W0);
  pos.set([d.dot(X) * SCALE, d.dot(Y) * SCALE, d.dot(Z) * SCALE + 0.012], k * 3);
  const n = new THREE.Vector3(N[i * 3], N[i * 3 + 1], N[i * 3 + 2]);
  nor.set([n.dot(X), n.dot(Y), n.dot(Z)], k * 3);
  uv.set([UV[i * 2], UV[i * 2 + 1]], k * 2);
});
const idx = new Uint32Array(tris.length * 3); tris.forEach((t, k) => { idx[k * 3] = remap.get(I[t]); idx[k * 3 + 1] = remap.get(I[t + 1]); idx[k * 3 + 2] = remap.get(I[t + 2]); });
const n = ids.length, pv = (k) => new THREE.Vector3(pos[k * 3], pos[k * 3 + 1], pos[k * 3 + 2]);
let zmin = 0; for (let k = 0; k < n; k++) zmin = Math.min(zmin, pos[k * 3 + 2]);

// ---------- dedos: 4 grupos em X na parte de cima da mão; polegar = o que sobra no lado -X ----------
const zK = zmin * 0.52;                                    // linha dos nós dos dedos
const distal = []; for (let k = 0; k < n; k++) if (pos[k * 3 + 2] < zmin * 0.72) distal.push(k);
let cx = [-0.03, -0.01, 0.01, 0.03];                       // k-means 1D em X
for (let it = 0; it < 30; it++) {
  const s = [0, 0, 0, 0], c = [0, 0, 0, 0];
  for (const k of distal) { const x = pos[k * 3]; let b = 0; for (let j = 1; j < 4; j++) if (Math.abs(x - cx[j]) < Math.abs(x - cx[b])) b = j; s[b] += x; c[b]++; }
  cx = cx.map((v, j) => (c[j] ? s[j] / c[j] : v));
}
cx.sort((a, b) => a - b);
const fingerOf = (k) => { const x = pos[k * 3]; let b = 0; for (let j = 1; j < 4; j++) if (Math.abs(x - cx[j]) < Math.abs(x - cx[b])) b = j; return b; };
const xThumb = cx[0] - 0.012;
const isThumb = (k) => pos[k * 3] < xThumb && pos[k * 3 + 2] > zmin * 0.8 && pos[k * 3 + 2] < -0.025;
// cadeia de cada dedo: centroides em faixas de Z do nó até a ponta
function chain(sel, zA) {
  const tip = sel.reduce((a, k) => (pos[k * 3 + 2] < pos[a * 3 + 2] ? k : a), sel[0]);
  const zt = pos[tip * 3 + 2], pts = [];
  for (const f of [0, 0.45, 0.75, 1]) {
    const z = zA + (zt - zA) * f, w = Math.abs(zt - zA) * 0.08 + 0.003;
    const near = sel.filter((k) => Math.abs(pos[k * 3 + 2] - z) < w);
    const c = new THREE.Vector3(); for (const k of near) c.add(pv(k)); c.divideScalar(Math.max(1, near.length));
    if (!near.length) c.copy(pv(tip));
    pts.push(c);
  }
  return pts;
}
const fingerSets = [[], [], [], []], thumbSet = [];
for (let k = 0; k < n; k++) {
  if (isThumb(k)) thumbSet.push(k);
  else if (pos[k * 3 + 2] < zK + 0.004) fingerSets[fingerOf(k)].push(k);
}
const chains = fingerSets.map((s) => chain(s, zK));
// polegar: da base (perto da palma) até a ponta (mais longe da base)
const palmC = new THREE.Vector3(0, 0, zK * 0.6);
const tb = thumbSet.slice().sort((a, b) => pv(a).distanceTo(palmC) - pv(b).distanceTo(palmC));
const tBase = new THREE.Vector3(); for (const k of tb.slice(0, Math.max(1, tb.length * 0.15 | 0))) tBase.add(pv(k)); tBase.divideScalar(Math.max(1, tb.length * 0.15 | 0));
const tTip = pv(tb[tb.length - 1]);
const thumbChain = [tBase, tBase.clone().lerp(tTip, 0.5), tTip];
console.log('dedos x:', cx.map((v) => v.toFixed(3)).join(' '), 'zK', zK.toFixed(3), 'zmin', zmin.toFixed(3), 'polegar verts', thumbSet.length);

  return { pos, nor, uv, idx, n, pv, zmin, zK, cx, fingerOf, isThumb, chains, thumbChain };
}
let X = H.F.clone().negate(), Y0 = H.Pn.clone().negate(), Zb = X; // placeholder
{ const Z = H.F.clone().negate(), Y = H.Pn.clone().negate(); Y.addScaledVector(Z, -Y.dot(Z)).normalize(); X = new THREE.Vector3().crossVectors(Y, Z); Y0 = Y; Zb = Z; }
let SCALE = 0.185 / H.len;
let R = pass(X, Y0, Zb, H.wrist, SCALE);
{ // nova base: dedos = punho → nó do dedo médio; lateral = nó do indicador → nó do mindinho
  const toModel = (v) => H.wrist.clone().addScaledVector(X, v.x / SCALE).addScaledVector(Y0, v.y / SCALE).addScaledVector(Zb, (v.z - 0.012) / SCALE);
  const k0 = toModel(R.chains[0][0]), k1 = toModel(R.chains[1][0]), k2 = toModel(R.chains[2][0]), k3 = toModel(R.chains[3][0]);
  const kmid = k1.clone().add(k2).multiplyScalar(0.5);
  const Zn = H.wrist.clone().sub(kmid).normalize();             // +Z aponta para o punho (dedos em -Z)
  const Xn = k3.clone().sub(k0); Xn.addScaledVector(Zn, -Xn.dot(Zn)).normalize(); // indicador em -X
  const Yn = new THREE.Vector3().crossVectors(Zn, Xn);           // dorso +Y, palma -Y
  if (Yn.dot(Y0) < 0) console.warn('atenção: palma invertida na 2ª passada');
  X = Xn; Y0 = Yn; Zb = Zn;
  SCALE = 0.095 / H.wrist.distanceTo(kmid);                      // punho → nós = 9,5 cm (como a luva)
  R = pass(X, Y0, Zb, H.wrist, SCALE);
}
const { pos, nor, uv, idx, n, pv, zmin, zK, cx, fingerOf, isThumb, chains, thumbChain } = R;
// raio do antebraço (para o punho da luva)
const rs = []; for (let k = 0; k < n; k++) if (pos[k * 3 + 2] > -0.005 && pos[k * 3 + 2] < 0.03) rs.push(Math.hypot(pos[k * 3], pos[k * 3 + 1]));
rs.sort((a, b) => a - b);
const cuffR = rs.length ? rs[Math.floor(rs.length * 0.85)] : 0.03;
console.log('raio do punho', cuffR.toFixed(3));

// ---------- ossos ----------
// cada osso: -Z ao longo do segmento, -Y para a palma
const bones = []; // { name, parent, world: Matrix4 }
const frame = (a, b) => {
  const z = new THREE.Vector3().subVectors(a, b).normalize(); // -Z aponta de a para b
  let y = new THREE.Vector3(0, 1, 0); y.addScaledVector(z, -y.dot(z)); if (y.lengthSq() < 1e-6) y.set(1, 0, 0); y.normalize();
  const x = new THREE.Vector3().crossVectors(y, z);
  return new THREE.Matrix4().makeBasis(x, y, z).setPosition(a);
};
bones.push({ name: 'punho', parent: -1, world: new THREE.Matrix4() });
chains.forEach((c, f) => {
  for (let j = 0; j < 3; j++) bones.push({ name: `d${f}_${j}`, parent: j === 0 ? 0 : bones.length - 1, world: frame(c[j], c[j + 1]) });
});
bones.push({ name: 'pol_0', parent: 0, world: frame(thumbChain[0], thumbChain[1]) });
bones.push({ name: 'pol_1', parent: bones.length - 1, world: frame(thumbChain[1], thumbChain[2]) });
// quanto cada junta JÁ está dobrada no modelo (ângulo em torno do X do osso, em relação ao anterior)
const restBend = bones.map((b, i) => {
  if (!/^d\d_/.test(b.name)) return 0;
  const dir = new THREE.Vector3(0, 0, -1).transformDirection(b.world);
  const par = b.parent === 0 ? new THREE.Vector3(0, 0, -1) : new THREE.Vector3(0, 0, -1).transformDirection(bones[b.parent].world);
  const ax = new THREE.Vector3(1, 0, 0).transformDirection(b.world);
  return Math.atan2(new THREE.Vector3().crossVectors(par, dir).dot(ax), par.dot(dir));
});
console.log('dobras de repouso (graus):', restBend.map((a) => Math.round(a * 57.3)).join(' '));
const segs = []; // segmento de cada osso (para pesos)
chains.forEach((c, f) => { for (let j = 0; j < 3; j++) segs[1 + f * 3 + j] = [c[j], c[j + 1]]; });
segs[13] = [thumbChain[0], thumbChain[1]]; segs[14] = [thumbChain[1], thumbChain[2]];

// ---------- pesos ----------
const segDist = (p, [a, b]) => { const ab = b.clone().sub(a), t = THREE.MathUtils.clamp(p.clone().sub(a).dot(ab) / ab.lengthSq(), 0, 1); return { d: p.distanceTo(a.clone().addScaledVector(ab, t)), t }; };
const joints = new Uint16Array(n * 4), weights = new Float32Array(n * 4);
for (let k = 0; k < n; k++) {
  const p = pv(k), z = p.z;
  let cands = [];
  if (isThumb(k)) cands = [13, 14];
  else if (z < zK + 0.012) { const f = fingerOf(k); cands = [1 + f * 3, 2 + f * 3, 3 + f * 3]; }
  if (!cands.length) { joints[k * 4] = 0; weights[k * 4] = 1; continue; }
  // peso do osso mais perto, com transição suave perto das juntas (e da palma na base)
  const ds = cands.map((b) => ({ b, ...segDist(p, segs[b]) })).sort((a, b) => a.d - b.d);
  const best = ds[0], out = [];
  const first = best.b === cands[0];
  if (first && best.t < 0.25) { const w = 0.5 + 2 * best.t; out.push([best.b, w], [0, 1 - w]); }          // base do dedo ↔ palma
  else if (best.t < 0.2 && !first) { const w = 0.5 + 2.5 * best.t; out.push([best.b, w], [best.b - 1, 1 - w]); }
  else if (best.t > 0.8 && best.b !== cands[cands.length - 1]) { const w = 0.5 + 2.5 * (1 - best.t); out.push([best.b, w], [best.b + 1, 1 - w]); }
  else out.push([best.b, 1]);
  // mistura com a palma para os vértices bem na base (zK..zK+12mm)
  if (!isThumb(k) && z > zK - 0.004) { const m = THREE.MathUtils.clamp((z - (zK - 0.004)) / 0.016, 0, 1); for (const o of out) o[1] *= 1 - m; out.push([0, m]); }
  const tot = out.reduce((s, o) => s + o[1], 0);
  out.slice(0, 4).forEach(([b, w], j) => { joints[k * 4 + j] = b; weights[k * 4 + j] = w / tot; });
}

// ---------- grava GLB com pele ----------
const doc = new Document(), buf = doc.createBuffer(), scene = doc.createScene('mao');
const acc = (type, arr) => doc.createAccessor().setType(type).setArray(arr).setBuffer(buf);
const tex = (t) => { if (!t) return null; return doc.createTexture(t.getName()).setImage(t.getImage()).setMimeType(t.getMimeType()); };
const mat = doc.createMaterial('pele').setBaseColorTexture(tex(mat0.getBaseColorTexture())).setNormalTexture(tex(mat0.getNormalTexture()))
  .setMetallicRoughnessTexture(tex(mat0.getMetallicRoughnessTexture())).setMetallicFactor(0).setRoughnessFactor(1);
const p2 = doc.createPrimitive().setAttribute('POSITION', acc('VEC3', pos)).setAttribute('NORMAL', acc('VEC3', nor)).setAttribute('TEXCOORD_0', acc('VEC2', uv))
  .setAttribute('JOINTS_0', acc('VEC4', joints)).setAttribute('WEIGHTS_0', acc('VEC4', weights)).setIndices(acc('SCALAR', idx)).setMaterial(mat);
const mesh = doc.createMesh('mao').addPrimitive(p2);
const nodes = bones.map((b) => doc.createNode(b.name));
const local = bones.map((b) => (b.parent < 0 ? b.world.clone() : new THREE.Matrix4().copy(bones[b.parent].world).invert().multiply(b.world)));
bones.forEach((b, i) => {
  const t = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3(); local[i].decompose(t, q, s);
  nodes[i].setTranslation(t.toArray()).setRotation(q.toArray()).setExtras({ bend: restBend[i] });
  if (b.parent >= 0) nodes[b.parent].addChild(nodes[i]);
});
const ibm = new Float32Array(bones.length * 16); bones.forEach((b, i) => ibm.set(new THREE.Matrix4().copy(b.world).invert().toArray(), i * 16));
const skin = doc.createSkin('mao').setSkeleton(nodes[0]).setInverseBindMatrices(acc('MAT4', ibm));
for (const nd of nodes) skin.addJoint(nd);
const meshNode = doc.createNode('pele').setMesh(mesh).setSkin(skin).setExtras({ cuffR });
scene.addChild(nodes[0]).addChild(meshNode);
await doc.transform(
  textureCompress({ encoder: sharp, targetFormat: 'jpeg', quality: 88, resize: [2048, 2048], slots: /^baseColor/ }),
  textureCompress({ encoder: sharp, targetFormat: 'jpeg', quality: 90, resize: [1024, 1024], slots: /^(normal|metallicRoughness)/ }),
);
await io.write(process.argv[3], doc);
console.log('verts', n, 'tris', idx.length / 3, 'ossos', bones.length);
