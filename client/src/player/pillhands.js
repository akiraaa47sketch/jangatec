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
    } else if (key === 'L' && ud.leftCurl != null) { c = ud.leftCurl; th = [0.3, -0.3, 0.2]; }
    else if (key === 'L' && ud.armed === 'long') { c = 0.8; th = [0.3, -0.3, 0.2]; }
    else if (ud.pose === 'swim' || ud.pose === 'climb' || ud.pose === 'leap') c = 0.15; // mão aberta nadando/escalando
    h.curl += (c - h.curl) * k;
    h.idx = h.idx == null ? h.curl : h.idx + ((idx ?? c) - h.idx) * k;
    h.setPose([h.idx, h.curl, h.curl, h.curl], th, jm);
  }
  void _q;
}

// ================= ARMA EM 3ª PESSOA: pulso, mão de apoio e recarga =================
// Os braços da pílula são peças rígidas que giram no ombro; sozinhos eles deixavam a pistola
// apontando para o chão, o rifle apontando para trás e a mão esquerda solta no ar. Depois da pose:
//  1) o PULSO direito gira para o cano apontar para onde deve (baixo-pronto, mira, recarga);
//  2) o BRAÇO esquerdo mira na pegada de apoio da arma (gripL, a mesma da 1ª pessoa) e estica ou
//     encolhe um pouco para a mão chegar lá; a mão gira para encaixar;
//  3) na RECARGA a mão esquerda vai ao carregador, ao cinto, volta e (pistola) puxa o ferrolho;
//     o carregador/ferrolho/tambor/bomba do modelo se mexem junto.
const _m1 = new THREE.Matrix4(), _m2 = new THREE.Matrix4(), _qa = new THREE.Quaternion(), _qb = new THREE.Quaternion();
const _p1 = new THREE.Vector3(), _p2 = new THREE.Vector3(), _s1 = new THREE.Vector3();
const ramp = (x, a, b) => Math.min(1, Math.max(0, (x - a) / (b - a)));
const smooth = (x) => x * x * (3 - 2 * x);
const eQ = (r) => new THREE.Quaternion().setFromEuler(new THREE.Euler(r[0], r[1], r[2]));

// quaternion da arma (espaço da pílula) com o cano (-Z) em `dir` e o topo (+Y) perto de `up`
function gunBasis(dir, up) {
  const z = dir.clone().negate().normalize(), x = new THREE.Vector3().crossVectors(up, z).normalize(), y = new THREE.Vector3().crossVectors(z, x);
  return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
}
function restHolder(h) {
  const u = h.holder.userData;
  if (!u.restQ) { u.restQ = h.holder.quaternion.clone(); u.restS = h.holder.scale.x; }
  return u;
}
// Posição e giro da raiz da mão numa pegada (grip.p/r/off) da arma, no mundo.
function gripWorld(gun, grip, h, delta) {
  const q = grip.q ? grip.q.clone() : eQ(grip.r);
  const off = grip.off || (h.gripOff ? [-h.gripOff[0], h.gripOff[1], h.gripOff[2]] : [0, 0.03, 0.07]);
  const pos = new THREE.Vector3(...off).applyQuaternion(q).add(_p1.set(...grip.p));
  if (delta) pos.add(delta);
  const m = new THREE.Matrix4().compose(pos, q, _s1.set(1, 1, 1));
  return m.premultiply(gun.matrixWorld);
}
// Coloca a mão (holder) para a raiz ficar em `target` (matriz mundo); devolve a posição do pulso.
function holderFor(h, target) {
  h.root.updateMatrix();
  _m1.copy(h.root.matrix).invert();
  return new THREE.Matrix4().multiplyMatrices(target, _m1);
}

const OVER_SLIDE = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI).multiply(eQ([0, -1.5708, 3.1416]));

// Linha do tempo da mão esquerda na recarga (u 0..1) → { at: 'grip'|'well'|'belt'|'below'|'slide'|'pulled'|'drum'|'port', k }
function reloadKeys(kind, slide, plan) {
  if (kind === 'shotgun' && plan) { // um ciclo cinto → janela por cartucho que falta; bomba só se estava vazia
    const T = plan.total, k = [[0, 'grip'], [plan.intro / T, 'belt']];
    for (let i = 0; i < plan.n; i++) {
      const t0 = plan.intro + i * plan.per;
      k.push([(t0 + 0.42 * plan.per) / T, 'port'], [(t0 + 0.6 * plan.per) / T, 'port'], [(t0 + plan.per) / T, i === plan.n - 1 ? 'grip' : 'belt']);
    }
    const o = plan.intro + plan.n * plan.per;
    if (plan.pump) k.push([(o + 0.5 * plan.outro) / T, 'pumpBack'], [(o + 0.95 * plan.outro) / T, 'grip']);
    else k.push([1, 'grip']);
    return k;
  }
  if (kind === 'revolver') return [[0, 'grip'], [0.12, 'drum'], [0.45, 'drum'], [0.56, 'belt'], [0.7, 'drum'], [0.84, 'drum'], [0.95, 'grip']];
  if (kind === 'shotgun') return [[0, 'grip'], [0.1, 'belt'], [0.2, 'port'], [0.28, 'belt'], [0.38, 'port'], [0.46, 'belt'], [0.56, 'port'], [0.66, 'grip'], [0.74, 'pumpBack'], [0.8, 'grip']];
  if (slide) return [[0, 'grip'], [0.12, 'well'], [0.2, 'well'], [0.34, 'belt'], [0.44, 'below'], [0.56, 'well'], [0.62, 'well'], [0.68, 'slide'], [0.74, 'slide'], [0.8, 'pulled'], [0.84, 'letgo'], [0.95, 'grip']];
  return [[0, 'grip'], [0.14, 'well'], [0.22, 'well'], [0.38, 'belt'], [0.5, 'below'], [0.64, 'well'], [0.72, 'well'], [0.86, 'grip']];
}
function sampleKeys(keys, u) {
  for (let i = 0; i < keys.length - 1; i++) {
    if (u < keys[i + 1][0]) return { a: keys[i][1], b: keys[i + 1][1], k: smooth(ramp(u, keys[i][0], keys[i + 1][0])) };
  }
  const last = keys[keys.length - 1][1]; return { a: last, b: last, k: 0 };
}
// Peças do modelo na recarga (3ª pessoa): carregador cai e volta, ferrolho/tambor/bomba.
function reloadParts(spec, u, on, plan) {
  const p = spec.parts || {}, kind = spec.reload;
  if (p.mag) {
    if (!on) { p.mag.visible = !spec.magHidden; p.mag.position.set(0, 0, 0); p.mag.rotation.set(0, 0, 0); }
    else {
      const sl = !!spec.slideGrab, d0 = sl ? 0.2 : 0.22, d1 = sl ? 0.32 : 0.36, i0 = sl ? 0.5 : 0.56, i1 = sl ? 0.58 : 0.66;
      if (u < i0) { const d = smooth(ramp(u, d0, d1)); p.mag.visible = u < d1; p.mag.position.set(0, -0.3 * d, 0.04 * d); p.mag.rotation.set(0.8 * d, 0, 0.4 * d); }
      else { const k = smooth(ramp(u, i0, i1)); p.mag.visible = !(spec.magHidden && u > i1 + 0.02); p.mag.position.set(0, -0.12 * (1 - k), 0); p.mag.rotation.set(0, 0, 0); }
    }
  }
  if (p.slide) p.slide.position.z = on && spec.slideGrab ? (u < 0.74 ? 0 : u < 0.8 ? smooth(ramp(u, 0.74, 0.8)) : 1 - ramp(u, 0.8, 0.815)) * 0.045 : 0;
  if (p.drum) { const o = on && kind === 'revolver' ? smooth(ramp(u, 0.1, 0.2)) - smooth(ramp(u, 0.84, 0.92)) : 0; p.drum.position.x = -0.045 * o; p.drum.rotation.z = o * Math.PI * 3; }
  if (p.pump) {
    let b = 0;
    if (on && kind === 'shotgun') {
      if (plan) { const o = (plan.intro + plan.n * plan.per) / plan.total; b = plan.pump ? Math.sin(Math.PI * ramp(u, o + 0.1 * plan.outro / plan.total, 1)) : 0; }
      else b = Math.sin(Math.PI * ramp(u, 0.66, 0.8));
    }
    p.pump.position.z = b * 0.1;
  }
}

export function poseWeaponHands(pill, dt) {
  const ud = pill.userData, parts = ud.parts, hands = parts && parts.realHands, spec = ud.weaponSpec;
  if (!hands || !hands.R) return;
  const hR = hands.R, hL = hands.L, armL = parts.armL, uR = restHolder(hR), uL = hL ? restHolder(hL) : null;
  // tudo de volta ao normal (a pose de cada quadro parte daqui)
  hR.holder.quaternion.copy(uR.restQ);
  if (hL) { hL.holder.quaternion.copy(uL.restQ); hL.holder.scale.setScalar(uL.restS); hL.holder.position.copy(uL.restP || (uL.restP = hL.holder.position.clone())); }
  if (armL.scale.x !== 1) armL.scale.setScalar(1);
  ud.leftCurl = null;
  const pose = ud.pose, gun = spec && spec.type !== 'melee' && spec.muzzle && (ud.armed === 'pistol' || ud.armed === 'long');
  const active = gun && (pose === 'walk' || pose === 'aim' || pose === 'reload');
  if (spec && spec.parts) reloadParts(spec, ud.poseP || 0, active && pose === 'reload', ud.shellPlan);
  if (!active) { ud.gunW = 0; return; }
  const long = ud.armed === 'long', u = pose === 'reload' ? Math.min(1, ud.poseP || 0) : 0;
  ud.gunW = Math.min(1, (ud.gunW || 0) + dt * 8);

  // ---- 1) pulso direito: direção do cano ----
  let dir, up = new THREE.Vector3(0, 1, 0);
  if (pose === 'aim') { const e = ud.aimPitch || 0; dir = new THREE.Vector3(0, Math.sin(e), Math.cos(e)); }
  else if (pose === 'reload') {
    const tilt = smooth(ramp(u, 0, 0.12)) - smooth(ramp(u, 0.9, 1));
    dir = new THREE.Vector3(long ? 0.55 : 0.4, -0.35 + 0.65 * tilt, 1).normalize();
    up.set(-0.55 * tilt, 1, 0).normalize(); // deita a arma para a esquerda: carregador de frente para a outra mão
  } else dir = long ? new THREE.Vector3(0.55, -0.38, 1) : new THREE.Vector3(0.18, -0.5, 1); // baixo-pronto
  dir.normalize();
  if (!ud.gunDir) ud.gunDir = dir.clone();
  ud.gunDir.lerp(dir, Math.min(1, dt * 14)).normalize();
  pill.updateMatrixWorld(true);
  const gunObj = spec.group;
  const pillQ = pill.getWorldQuaternion(_qa);
  const gunTarget = pillQ.clone().multiply(gunBasis(ud.gunDir, up));
  const holderW = hR.holder.getWorldQuaternion(new THREE.Quaternion());
  const gunW = gunObj.getWorldQuaternion(_qb);
  const gunInHolder = holderW.clone().invert().multiply(gunW);
  const wantHolderW = gunTarget.multiply(gunInHolder.invert());
  const parentW = hR.holder.parent.getWorldQuaternion(new THREE.Quaternion());
  const q = parentW.invert().multiply(wantHolderW);
  hR.holder.quaternion.copy(uR.restQ).slerp(q, ud.gunW);
  hR.holder.updateMatrixWorld(true);

  // ---- 2/3) mão esquerda ----
  if (!hL || !spec.gripL) return;
  const twoHands = long || pose === 'aim' || pose === 'reload';
  if (!twoHands) return;
  const support = { p: spec.gripL.p, r: spec.gripL.r, off: spec.gripL.off };
  const at = (name) => {
    if (name === 'grip' || name === 'pumpBack') return gripWorld(gunObj, support, hL, name === 'pumpBack' ? _p2.set(0, 0, 0.1) : null);
    const open = { q: eQ([0.2, 0, 1.0]) };
    if (name === 'slide' || name === 'pulled' || name === 'letgo') {
      const d = name === 'slide' ? null : name === 'pulled' ? _p2.set(0, 0, 0.045) : _p2.set(-0.01, 0.05, 0.06);
      return gripWorld(gunObj, { p: spec.slideGrab, q: OVER_SLIDE }, hL, d);
    }
    if (name === 'belt') { // no cinto: abaixo do ombro esquerdo, na altura do quadril, um pouco à frente
      const m = new THREE.Matrix4().compose(_p1.copy(armL.position).add(_p2.set(0.1, -0.66, 0.16)), eQ([0.2, 0, 0.3]), _s1.set(1, 1, 1));
      return m.premultiply(armL.parent.matrixWorld);
    }
    const mp = spec.magPoint || [0, -0.08, 0];
    const dy = name === 'well' ? -0.05 : name === 'below' ? -0.18 : name === 'drum' ? -0.06 : -0.03;
    return gripWorld(gunObj, { p: [mp[0], mp[1] + dy, mp[2] + 0.03], q: open.q, off: [0, 0, 0] }, hL, null);
  };
  let target;
  if (pose === 'reload') {
    const s = sampleKeys(reloadKeys(spec.reload, !!spec.slideGrab, ud.shellPlan), u), A = at(s.a), B = at(s.b);
    const pa = new THREE.Vector3(), qa = new THREE.Quaternion(), pb = new THREE.Vector3(), qb2 = new THREE.Quaternion(), sc = new THREE.Vector3();
    A.decompose(pa, qa, sc); B.decompose(pb, qb2, sc);
    target = new THREE.Matrix4().compose(pa.lerp(pb, s.k), qa.slerp(qb2, s.k), sc);
    const grab = (n) => (n === 'grip' || n === 'pumpBack' ? 0.8 : n === 'slide' || n === 'pulled' || n === 'well' || n === 'below' || n === 'drum' ? 0.85 : 0.35);
    ud.leftCurl = grab(s.a) + (grab(s.b) - grab(s.a)) * s.k;
  } else { target = at('grip'); ud.leftCurl = 0.8; }
  const hw = holderFor(hL, target); // onde o pulso (holder) tem que ficar, no mundo
  const wristW = new THREE.Vector3(), wristQ = new THREE.Quaternion(); hw.decompose(wristW, wristQ, _s1);
  // braço esquerdo mira no pulso e estica/encolhe (0,75–1,25×) para chegar; a mão fica do mesmo tamanho
  const par = armL.parent; par.updateMatrixWorld(true);
  const tLocal = par.worldToLocal(wristW.clone()).sub(armL.position);
  const rest = uL.restP.clone(), restLen = rest.length(), dist = tLocal.length();
  const qArm = new THREE.Quaternion().setFromUnitVectors(rest.clone().normalize(), tLocal.normalize());
  const w = ud.gunW;
  armL.quaternion.slerp(qArm, w);
  const f = 1 + (Math.min(1.25, Math.max(0.75, dist / restLen)) - 1) * w;
  armL.scale.setScalar(f); hL.holder.scale.setScalar(uL.restS / f);
  armL.updateMatrixWorld(true);
  const armW = armL.getWorldQuaternion(new THREE.Quaternion());
  hL.holder.quaternion.copy(uL.restQ).slerp(armW.invert().multiply(wristQ), w);
}
