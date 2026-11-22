// Martelo do Tripo (PBR) para o jogo: decima (~2 mi → ~16 mil triângulos), comprime as texturas e
// gira/escala para a convenção das armas brancas: cabo ao longo de -Z (cabeça em -Z), ponto da
// pegada perto da origem, eixo da cabeça (as duas faces) em ±Y.
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTMeshoptCompression } from '@gltf-transform/extensions';
import { weld, simplify, textureCompress, quantize, meshopt, prune, dedup } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptDecoder, MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';
await MeshoptEncoder.ready; await MeshoptDecoder.ready; await MeshoptSimplifier.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });
const doc = await io.read(process.argv[2]);
const S = +(process.argv[4] || 0.45), GRIP_Y = +(process.argv[5] || -0.38);
const prim = doc.getRoot().listMeshes()[0].listPrimitives()[0];
const P = prim.getAttribute('POSITION'), N = prim.getAttribute('NORMAL');
const pa = P.getArray().slice(), na = N.getArray().slice();
for (let i = 0; i < pa.length; i += 3) {
  const x = pa[i], y = pa[i + 1], z = pa[i + 2];
  pa[i] = x * S; pa[i + 1] = z * S; pa[i + 2] = -(y - GRIP_Y) * S + 0.04;          // (x, y, z) → (x, z, -y)
  const nx = na[i], ny = na[i + 1], nz = na[i + 2]; na[i] = nx; na[i + 1] = nz; na[i + 2] = -ny;
}
P.setArray(new Float32Array(pa)); N.setArray(new Float32Array(na));
doc.getRoot().listNodes()[0].setName('martelo');
await doc.transform(
  weld({ tolerance: 0.0001 }),
  simplify({ simplifier: MeshoptSimplifier, ratio: +(process.argv[6] || 0.008), error: 0.002 }),
  textureCompress({ encoder: sharp, targetFormat: 'jpeg', quality: 88, resize: [1024, 1024], slots: /^baseColor/ }),
  textureCompress({ encoder: sharp, targetFormat: 'jpeg', quality: 90, resize: [1024, 1024], slots: /^(normal|metallicRoughness)/ }),
  prune(), dedup(),
);
let tris = 0; for (const m of doc.getRoot().listMeshes()) for (const p of m.listPrimitives()) tris += p.getIndices().getCount() / 3;
doc.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.QUANTIZE });
await doc.transform(quantize(), meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
await io.write(process.argv[3], doc);
const pos = doc.getRoot().listMeshes()[0].listPrimitives()[0].getAttribute('POSITION');
console.log('tris', tris, 'head z', (-(0.42 - GRIP_Y) * S + 0.04).toFixed(3), 'butt z', (-(-0.491 - GRIP_Y) * S + 0.04).toFixed(3));
