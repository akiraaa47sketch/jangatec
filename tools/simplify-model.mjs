import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { weld, simplify, dedup, prune, dequantize } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptSimplifier } from 'meshoptimizer';
await MeshoptDecoder.ready; await MeshoptSimplifier.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
const doc = await io.read(process.argv[2]);
await doc.transform(dequantize(), weld({ tolerance: 0.0002 }), simplify({ simplifier: MeshoptSimplifier, ratio: Number(process.argv[4]), error: 0.002 }), dedup(), prune());
for (const ext of doc.getRoot().listExtensionsUsed()) ext.dispose();
for (const m of doc.getRoot().listMeshes()) for (const p of m.listPrimitives()) {
  const pos = p.getAttribute('POSITION'), idx = p.getIndices();
  console.log('verts', pos.getCount(), 'tris', idx.getCount() / 3);
}
await io.write(process.argv[3], doc);
