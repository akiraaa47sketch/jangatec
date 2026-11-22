// Revólver do Tripo (PBR) para o jogo: mantém UV e texturas, separa o TAMBOR (gira na recarga,
// com o pivô no próprio eixo), gira/escala/posiciona na convenção das armas (cano -Z, cima +Y,
// punho perto da origem) e grava GLB com meshopt.
import { NodeIO, Document } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTMeshoptCompression } from '@gltf-transform/extensions';
import { meshopt, quantize, textureCompress } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer';
import sharp from 'sharp';

await MeshoptEncoder.ready; await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });
const src = await io.read(process.argv[2]);
const prim = src.getRoot().listMeshes()[0].listPrimitives()[0];
const P = prim.getAttribute('POSITION').getArray(), N = prim.getAttribute('NORMAL').getArray();
const UV = prim.getAttribute('TEXCOORD_0').getArray(), I = prim.getIndices().getArray(), mat0 = prim.getMaterial();
const nv = P.length / 3;
const X = (i) => P[i * 3], Y = (i) => P[i * 3 + 1], Z = (i) => P[i * 3 + 2];

// ---------- eixo do cano e punho ----------
let xmin = 1e9, xmax = -1e9, ymin = 1e9, ymax = -1e9;
for (let i = 0; i < nv; i++) { xmin = Math.min(xmin, X(i)); xmax = Math.max(xmax, X(i)); ymin = Math.min(ymin, Y(i)); ymax = Math.max(ymax, Y(i)); }
const L = xmax - xmin;
let by = 0, bz = 0, bn = 0; // eixo do cano: centro da ponta da frente
for (let i = 0; i < nv; i++) if (X(i) < xmin + L * 0.03) { by += Y(i); bz += Z(i); bn++; }
by /= bn; bz /= bn;
let gx = 0, gn = 0; // punho: parte de baixo
for (let i = 0; i < nv; i++) if (Y(i) < ymin + (ymax - ymin) * 0.3) { gx += X(i); gn++; }
gx /= gn;

// ---------- tambor: a faixa ao longo do comprimento onde a arma é mais larga (em Z) ----------
const slices = 60, w = new Array(slices).fill(0).map(() => [1e9, -1e9]);
for (let i = 0; i < nv; i++) {
  if (Y(i) < by - 0.25 * (ymax - ymin)) continue;       // ignora o punho
  const s = Math.min(slices - 1, Math.floor((X(i) - xmin) / L * slices));
  w[s][0] = Math.min(w[s][0], Z(i)); w[s][1] = Math.max(w[s][1], Z(i));
}
const width = w.map(([a, b]) => (b > a ? b - a : 0)), wmax = Math.max(...width);
const wide = width.map((v, s) => [v, s]).filter(([v]) => v > wmax * 0.82).map(([, s]) => s);
const dx0 = xmin + (Math.min(...wide) / slices) * L - 0.004, dx1 = xmin + ((Math.max(...wide) + 1) / slices) * L + 0.004;
let cy = 0, cz = 0, cn = 0, R = 0;
for (let i = 0; i < nv; i++) if (X(i) > dx0 && X(i) < dx1 && Math.abs(Z(i) - bz) > wmax * 0.35) { cy += Y(i); cz += Z(i); cn++; }
cy /= cn; cz = bz; // o eixo do tambor fica no plano do cano
for (let i = 0; i < nv; i++) if (X(i) > dx0 && X(i) < dx1) { const d = Math.hypot(Z(i) - cz, Y(i) - cy); if (Math.abs(Z(i) - cz) > wmax * 0.4) R = Math.max(R, d); }
const inDrum = (i) => X(i) > dx0 && X(i) < dx1 && Math.hypot(Z(i) - cz, Y(i) - cy) < R * 1.02;
console.log('tambor x', dx0.toFixed(3), dx1.toFixed(3), 'centro y', cy.toFixed(3), 'raio', R.toFixed(3), '| cano y', by.toFixed(3));

// ---------- transformação (igual à pistola: gira -90° em Y) ----------
const S = 0.34 / L;
const tf = (x, y, z) => [-(z - bz) * S, (y - by) * S + 0.046, (x - gx) * S + 0.085];
const drumC = tf((dx0 + dx1) / 2, cy, cz);
console.log('escala', S.toFixed(4), 'cano z', tf(xmin, by, bz)[2].toFixed(3), 'tambor (jogo)', drumC.map((v) => v.toFixed(3)).join(','), 'topo y', tf(0, ymax, 0)[1].toFixed(3), 'base y', tf(0, ymin, 0)[1].toFixed(3));

// ---------- duas malhas: corpo e tambor (pivô no eixo) ----------
const out = new Document(), buf = out.createBuffer(), scene = out.createScene('revolver');
const tex = (t) => (t ? out.createTexture(t.getName()).setImage(t.getImage()).setMimeType(t.getMimeType()) : null);
const mat = out.createMaterial('revolver').setBaseColorTexture(tex(mat0.getBaseColorTexture())).setNormalTexture(tex(mat0.getNormalTexture()))
  .setMetallicRoughnessTexture(tex(mat0.getMetallicRoughnessTexture())).setMetallicFactor(1).setRoughnessFactor(1);
for (const [name, drum] of [['corpo', false], ['tambor', true]]) {
  const map = new Map(), pos = [], nor = [], uv = [], ix = [];
  for (let t = 0; t < I.length; t += 3) {
    const a = I[t], b = I[t + 1], c = I[t + 2];
    if ((inDrum(a) && inDrum(b) && inDrum(c)) !== drum) continue;
    for (const i of [a, b, c]) {
      if (!map.has(i)) {
        map.set(i, pos.length / 3);
        const p = tf(X(i), Y(i), Z(i));
        if (drum) { p[0] -= drumC[0]; p[1] -= drumC[1]; p[2] -= drumC[2]; }
        pos.push(...p); nor.push(-N[i * 3 + 2], N[i * 3 + 1], N[i * 3]); uv.push(UV[i * 2], UV[i * 2 + 1]);
      }
      ix.push(map.get(i));
    }
  }
  const acc = (type, arr) => out.createAccessor().setType(type).setArray(arr).setBuffer(buf);
  const p2 = out.createPrimitive().setAttribute('POSITION', acc('VEC3', new Float32Array(pos))).setAttribute('NORMAL', acc('VEC3', new Float32Array(nor)))
    .setAttribute('TEXCOORD_0', acc('VEC2', new Float32Array(uv))).setIndices(acc('SCALAR', new Uint32Array(ix))).setMaterial(mat);
  const node = out.createNode(name).setMesh(out.createMesh(name).addPrimitive(p2));
  if (drum) node.setTranslation(drumC).setExtras({ pivot: drumC }); // eixo do tambor (o loader põe em userData)
  scene.addChild(node);
  console.log(name, 'verts', pos.length / 3, 'tris', ix.length / 3);
}
out.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.QUANTIZE });
await out.transform(
  textureCompress({ encoder: sharp, targetFormat: 'jpeg', quality: 88, resize: [2048, 2048], slots: /^baseColor/ }),
  textureCompress({ encoder: sharp, targetFormat: 'jpeg', quality: 90, resize: [1024, 1024], slots: /^(normal|metallicRoughness)/ }),
  quantize(), meshopt({ encoder: MeshoptEncoder, level: 'medium' }),
);
await io.write(process.argv[3], out);
