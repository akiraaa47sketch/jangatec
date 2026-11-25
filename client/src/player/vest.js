// Colete balístico (visual): cinta verde-oliva em volta do corpo da pílula, com bolsos na frente,
// alças nos ombros e placa no peito. Fica abaixo do rosto. Medidas no espaço da pílula (raio 0,5).
import * as THREE from '../three.js';

let MATS = null;
function mats() {
  return MATS || (MATS = {
    cloth: new THREE.MeshStandardMaterial({ color: 0x4f5a34, roughness: 0.95, side: THREE.DoubleSide }),
    dark: new THREE.MeshStandardMaterial({ color: 0x353d22, roughness: 0.95 }),
    strap: new THREE.MeshStandardMaterial({ color: 0x2b2f1c, roughness: 0.9 }),
    buckle: new THREE.MeshStandardMaterial({ color: 0x8a8f94, metalness: 0.7, roughness: 0.4 }),
  });
}
export function makeVest() {
  const M = mats(), g = new THREE.Group();
  g.name = 'vest';
  const band = new THREE.Mesh(new THREE.CylinderGeometry(0.545, 0.555, 0.66, 24, 1, true), M.cloth); band.position.y = -0.22; g.add(band);
  for (const y of [0.1, -0.54]) { const rim = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.025, 6, 24), M.dark); rim.rotation.x = Math.PI / 2; rim.position.y = y; g.add(rim); }
  const plate = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.38, 0.06), M.dark); plate.position.set(0, -0.12, 0.54); g.add(plate); // placa no peito
  for (const x of [-0.26, 0, 0.26]) { // bolsos (porta-carregador)
    const pouch = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.18, 0.1), M.cloth); pouch.position.set(x, -0.42, 0.56); g.add(pouch);
    const flap = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.05, 0.11), M.dark); flap.position.set(x, -0.33, 0.57); g.add(flap);
  }
  for (const x of [-0.25, 0.25]) { // alças subindo para os ombros (por baixo do rosto, nas laterais)
    const s = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.32, 0.04), M.strap); s.position.set(x * 1.6, 0.2, 0.0); s.rotation.z = x > 0 ? -0.35 : 0.35; g.add(s);
  }
  const buckle = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.06, 0.02), M.buckle); buckle.position.set(0.16, -0.02, 0.58); g.add(buckle);
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.userData.sharedGeo = true; } }); // materiais compartilhados: disposePill não apaga
  return g;
}
// liga/desliga o colete numa pílula (parts.body)
export function setPillVest(pill, on) {
  const body = pill && pill.userData && pill.userData.parts && pill.userData.parts.body;
  if (!body) return;
  const cur = body.getObjectByName('vest');
  if (on && !cur) body.add(makeVest());
  else if (!on && cur) body.remove(cur);
}
