// "Assa" malhas estáticas: junta os filhos de um grupo que usam o mesmo material numa malha só.
// Muito menos draw calls (ilhas, fundo do mar, naufrágios e destroços eram centenas de caixinhas).
// keep(obj) → true preserva o objeto (e tudo dentro dele) sem mexer: animados, interativos,
// colisões por raycast etc. Malhas com escala espelhada também ficam como estão.
import * as THREE from '../three.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const sig = (m) => [m.type, m.color && m.color.getHex(), m.map && m.map.uuid, m.bumpMap && m.bumpMap.uuid, m.normalMap && m.normalMap.uuid,
  m.roughness, m.metalness, m.emissive && m.emissive.getHex(), m.transparent, m.opacity, m.side, m.flatShading, m.vertexColors, m.alphaTest].join('|');
const attrSig = (g) => Object.keys(g.attributes).sort().join(',') + (g.index ? '#i' : '#n');
const _inv = new THREE.Matrix4(), _m = new THREE.Matrix4();

export function bakeStatic(root, { keep = () => false } = {}) {
  root.updateMatrixWorld(true);
  _inv.copy(root.matrixWorld).invert();
  const buckets = new Map();
  root.traverse((o) => {
    if (!o.isMesh || o === root || o.isInstancedMesh || o.isSkinnedMesh || Array.isArray(o.material)) return;
    for (let p = o; p && p !== root; p = p.parent) if (keep(p) || !p.visible) return;
    _m.multiplyMatrices(_inv, o.matrixWorld);
    if (_m.determinant() < 0) return;
    const key = sig(o.material) + '/' + attrSig(o.geometry) + '/' + o.castShadow + o.receiveShadow + o.renderOrder;
    let b = buckets.get(key);
    if (!b) buckets.set(key, (b = { mat: o.material, list: [], cast: o.castShadow, receive: o.receiveShadow, order: o.renderOrder }));
    b.list.push({ o, m: _m.clone() });
  });
  let merged = 0;
  for (const b of buckets.values()) {
    if (b.list.length < 2) continue;
    const geos = b.list.map(({ o, m }) => o.geometry.clone().applyMatrix4(m));
    const geo = mergeGeometries(geos, false);
    for (const g of geos) g.dispose();
    if (!geo) continue;
    const mesh = new THREE.Mesh(geo, b.mat);
    mesh.castShadow = b.cast; mesh.receiveShadow = b.receive; mesh.renderOrder = b.order;
    root.add(mesh);
    for (const { o } of b.list) {
      o.parent.remove(o);
      if (!o.userData.sharedGeo) o.geometry.dispose();
    }
    merged += b.list.length - 1;
  }
  return merged;
}
