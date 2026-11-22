// Mãos 3D nas pílulas (3ª pessoa): a mesma mão da 1ª pessoa (versão leve) no lugar da luva de
// desenho. O pulso continua o braço da pílula; os dedos fecham devagar quando há algo na mão e
// a arma é presa usando os MESMOS dados de pegada da 1ª pessoa (ponto do cabo, ângulo e dedos),
// então a mão segura igual nas duas câmeras.
import * as THREE from '../three.js';
import { buildRealHand, handReady } from './gunmodels.js';

export const HAND_3P_SCALE = 1.6;              // um pouco maior que a real (personagem de desenho)
const waiting = new Set();                       // pílulas criadas antes do modelo carregar
const _q = new THREE.Quaternion(), _v = new THREE.Vector3();

// Orientação da mão pendurada no fim do braço: dedos para baixo, palma para o corpo, polegar à frente.
function handBasis(left) {
  const X = left ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(0, 0, -1);
  const Y = left ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(-1, 0, 0);
  const Z = new THREE.Vector3(0, 1, 0);
  return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(X, Y, Z));
}

// Troca as luvas da pílula pelas mãos 3D (ou espera o modelo carregar). scale = 1 / PILL_SCALE.
export function attachRealHands(pill, scale) {
  const p = pill.userData.parts;
  if (!p || p.realHands || !p.gloves) return;
  if (!handReady('3p')) { pill.userData.handScale = scale; waiting.add(pill); return; }
  const hands = {};
  for (const [side, key] of [[-1, 'R'], [1, 'L']]) {
    const g = p.gloves[key];
    if (!g || g.userData.hook) continue;          // pirata com gancho continua com o gancho
    const h = buildRealHand(side > 0, p.gloveMat, '3p');
    if (!h) return;
    h.root.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.userData.sharedGeo = true; } });
    const holder = new THREE.Group();
    holder.position.copy(g.userData.wrist);
    holder.quaternion.copy(handBasis(side > 0));
    holder.scale.setScalar(HAND_3P_SCALE * scale);
    holder.add(h.root);
    g.parent.add(holder);
    g.visible = false;                            // a luva antiga fica escondida (volta se precisar)
    hands[key] = { ...h, holder, curl: 0.4, target: 0.4 };
  }
  p.realHands = hands;
  // a âncora da arma passa a ser a própria mão direita (em metros, como na 1ª pessoa)
  if (hands.R) {
    const mount = new THREE.Group(); hands.R.root.add(mount);
    for (const c of p.hand.children.slice()) mount.add(c);
    p.hand = mount;
  }
  if (pill.userData.onHands) pill.userData.onHands();
}
export function upgradeWaitingPills() {
  for (const pill of waiting) attachRealHands(pill, pill.userData.handScale);
  waiting.clear();
}

// Posiciona a arma na mão 3D a partir da pegada da 1ª pessoa (spec.gripR). Retorna false se a
// pílula ainda usa a luva de desenho (aí quem chamou usa o encaixe antigo).
export function fitWeaponToHand(pill, mesh, spec) {
  const p = pill && pill.userData.parts, h = p && p.realHands && p.realHands.R;
  if (!h) return false;
  const grip = spec && spec.gripR;
  if (!grip) { mesh.position.set(0, 0, 0); mesh.quaternion.identity(); mesh.scale.setScalar(1); return true; }
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(...grip.r, grip.order || 'XYZ'));
  const rootPos = new THREE.Vector3(...(grip.off || h.gripOff)).applyQuaternion(q).add(_v.set(...grip.p));
  if (grip.nudge) rootPos.add(_v.set(...grip.nudge));
  const qi = q.clone().invert();
  mesh.quaternion.copy(qi);
  mesh.position.copy(rootPos).applyQuaternion(qi).negate();
  mesh.scale.setScalar(1);
  h.grip = { c: grip.c ?? 0.9, idx: grip.idx, th: grip.th, jm: grip.jm };
  return true;
}
export function clearWeaponGrip(pill) { const h = pill && pill.userData.parts.realHands && pill.userData.parts.realHands.R; if (h) h.grip = null; }

// Dedos a cada quadro: fecham na pegada da arma; sem arma, mão meio fechada e relaxada.
export function animateRealHands(pill, dt) {
  const ud = pill.userData, hands = ud.parts.realHands; if (!hands) return;
  const armed = ud.armed && ud.armed !== 'none', k = 1 - Math.exp(-10 * dt);
  for (const key of ['R', 'L']) {
    const h = hands[key]; if (!h) continue;
    let jm = null, c = 0.4 + 0.08 * Math.sin((ud.phase || 0) + (key === 'L' ? Math.PI : 0)), idx = null, th = [0.25, -0.15, 0.25]; // relaxa no balanço do braço
    if (key === 'R' && armed) {
      const g = h.grip || { c: 0.9, idx: ud.armed === 'pistol' || ud.armed === 'long' ? 0.3 : undefined };
      c = g.c; idx = g.idx; th = g.th || [0.5, -0.2, 0.3]; jm = g.jm || null;
    } else if (key === 'L' && ud.armed === 'long') { c = 0.8; th = [0.3, -0.3, 0.2]; }
    else if (ud.pose === 'swim' || ud.pose === 'climb' || ud.pose === 'leap') c = 0.15; // mão aberta nadando/escalando
    h.curl += (c - h.curl) * k;
    h.idx = h.idx == null ? h.curl : h.idx + ((idx ?? c) - h.idx) * k;
    h.setPose([h.idx, h.curl, h.curl, h.curl], th, jm);
  }
  void _q;
}
