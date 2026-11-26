// Escopeta do Tripo (PBR) para o jogo: parte de um GLB já simplificado (simplify-model.mjs, ~39 mil
// triângulos), separa a BOMBA de madeira (desliza no cano ao bombear), gira 180° (cano para -Z),
// alinha o cano em y = 0,04 e o pescoço da coronha (onde a mão direita segura) em z ≈ 0,075, reduz as
// texturas e grava GLB com meshopt.
// uso: node process-shotgun.mjs entrada_simplificada.glb saida.glb
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
const X = (i) => P[i * 3], Y = (i) => P[i * 3 + 1], Z = (i) => P[i * 3 + 2];

// medidas do modelo original (cano em +Z): cano de cima centrado em y 0,075; tubo do carregador em
// y 0,048; bomba de madeira em z 0,03…0,27 em volta dos tubos; pescoço da coronha em z ≈ -0,23
const BARREL_Y = 0.075, TUBE_Y = 0.048, TUBE_R = 0.016, PUMP = [0.03, 0.272], WRIST_Z = -0.23;
const tf = (x, y, z) => [-x, y - BARREL_Y + 0.04, -(z - WRIST_Z) + 0.075];
const outside = (i) => Math.hypot(X(i), Y(i) - BARREL_Y) > TUBE_R && Math.hypot(X(i), Y(i) - TUBE_Y) > TUBE_R;
const inPump = (i) => Z(i) > PUMP[0] && Z(i) < PUMP[1] && outside(i);

const out = new Document(), buf = out.createBuffer(), scene = out.createScene('escopeta');
const tex = (t) => (t ? out.createTexture(t.getName()).setImage(t.getImage()).setMimeType(t.getMimeType()) : null);
const mat = out.createMaterial('escopeta').setBaseColorTexture(tex(mat0.getBaseColorTexture())).setNormalTexture(tex(mat0.getNormalTexture()))
  .setMetallicRoughnessTexture(tex(mat0.getMetallicRoughnessTexture())).setOcclusionTexture(tex(mat0.getOcclusionTexture())).setMetallicFactor(1).setRoughnessFactor(1);
for (const [name, pump] of [['corpo', false], ['bomba', true]]) {
  const map = new Map(), pos = [], nor = [], uv = [], ix = [];
  for (let t = 0; t < I.length; t += 3) {
    const a = I[t], b = I[t + 1], c = I[t + 2];
    if ((inPump(a) && inPump(b) && inPump(c)) !== pump) continue;
    for (const i of [a, b, c]) {
      if (!map.has(i)) {
        map.set(i, pos.length / 3);
        pos.push(...tf(X(i), Y(i), Z(i))); nor.push(-N[i * 3], N[i * 3 + 1], -N[i * 3 + 2]); uv.push(UV[i * 2], UV[i * 2 + 1]);
      }
      ix.push(map.get(i));
    }
  }
  const acc = (type, arr) => out.createAccessor().setType(type).setArray(arr).setBuffer(buf);
  const p2 = out.createPrimitive().setAttribute('POSITION', acc('VEC3', new Float32Array(pos))).setAttribute('NORMAL', acc('VEC3', new Float32Array(nor)))
    .setAttribute('TEXCOORD_0', acc('VEC2', new Float32Array(uv))).setIndices(acc('SCALAR', new Uint32Array(ix))).setMaterial(mat);
  scene.addChild(out.createNode(name).setMesh(out.createMesh(name).addPrimitive(p2)));
  console.log(name, 'verts', pos.length / 3, 'tris', ix.length / 3);
}
console.log('cano (boca)', tf(0, BARREL_Y, 0.491).map((v) => v.toFixed(3)).join(', '), '| bomba z (jogo)', tf(0, 0, PUMP[1])[2].toFixed(3), '…', tf(0, 0, PUMP[0])[2].toFixed(3));
out.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.QUANTIZE });
await out.transform(
  textureCompress({ encoder: sharp, targetFormat: 'jpeg', quality: 86, resize: [2048, 2048], slots: /^baseColor/ }),
  textureCompress({ encoder: sharp, targetFormat: 'jpeg', quality: 88, resize: [1024, 1024], slots: /^(normal|metallicRoughness|occlusion)/ }),
  quantize(), meshopt({ encoder: MeshoptEncoder, level: 'medium' }),
);
await io.write(process.argv[3], out);
