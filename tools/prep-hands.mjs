import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { weld, simplify, dedup, prune, dequantize, textureCompress } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';
await MeshoptDecoder.ready; await MeshoptSimplifier.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
const doc = await io.read(process.argv[2]);
await doc.transform(
  dequantize(), weld({ tolerance: 0.0001 }), simplify({ simplifier: MeshoptSimplifier, ratio: 0.016, error: 0.0015 }), dedup(),
  textureCompress({ encoder: sharp, targetFormat: 'jpeg', resize: [2048, 2048], slots: /^baseColor/ }),
  textureCompress({ encoder: sharp, targetFormat: 'png', resize: [1024, 1024], slots: /^(normal|metallicRoughness|occlusion)/ }),
  prune(),
);
for (const ext of doc.getRoot().listExtensionsUsed()) if (/meshopt|quantization/.test(ext.extensionName)) ext.dispose();
const mt = doc.getRoot().listMaterials()[0];
for (const [k, t] of [['base', mt.getBaseColorTexture()], ['normal', mt.getNormalTexture()], ['mr', mt.getMetallicRoughnessTexture()]]) console.log(k, t ? t.getMimeType() + ' ' + t.getSize() + ' ' + (t.getImage().byteLength / 1024).toFixed(0) + 'KB' : '-');
console.log('metal', mt.getMetallicFactor(), 'rough', mt.getRoughnessFactor());
for (const m of doc.getRoot().listMeshes()) for (const p of m.listPrimitives()) console.log('verts', p.getAttribute('POSITION').getCount(), 'tris', p.getIndices().getCount() / 3);
await io.write(process.argv[3], doc);
