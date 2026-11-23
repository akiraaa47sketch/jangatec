// Inimigos no estilo pílula, com visual malvado: cores escuras, olhos vermelhos, sorriso de
// dentes serrilhados e acessórios por tipo. Mantém a interface antiga (userData.parts com
// torso/cabeça/braços/pernas) usada pelas animações de dano e morte em enemies.js.
import * as THREE from '../three.js';
import { makePill, animatePill, PILL_SCALE } from '../player/pill.js';
import { buildWeapon } from '../player/viewmodel-parts.js';

const LOOKS = {
  melee: { capHex: 0x7a1414, baseHex: 0x3a3a40, gloveHex: 0x1c1c1f, bootHex: 0x2a1a12, face: 'malvado', hat: 'bandana', hatColor: 0x8b1d1d, boots: 'botas', spikes: true, blade: 'facao' },
  atirador: { capHex: 0x4a5a2a, baseHex: 0x2f3328, gloveHex: 0x23261d, bootHex: 0x2a2a22, face: 'malvado', hat: 'bone', hatColor: 7, boots: 'botas', gun: 'revolver' },
  pesado: { capHex: 0x3a1a4a, baseHex: 0x29292e, gloveHex: 0x5a1010, bootHex: 0x1c1c1c, face: 'malvado', hat: 'capacete', boots: 'galochas', spikes: true, blade: 'cano' },
  rapido: { capHex: 0xc2410c, baseHex: 0x3b2f2a, gloveHex: 0x7a1414, bootHex: 0x7a1414, face: 'louco', hat: 'nenhum', boots: 'tenis', blade: 'faca_manteiga' },
  soldado: { capHex: 0x4b5530, baseHex: 0x3a3f2a, gloveHex: 0x1f2219, bootHex: 0x1f1c18, face: 'bravo', hat: 'militar', boots: 'botas', gun: 'rifle' },
  escafandrista: { capHex: 0x4d5d62, baseHex: 0x2f3b3f, gloveHex: 0xb08a3a, bootHex: 0x3a3226, face: 'malvado', hat: 'nenhum', boots: 'botas', blade: 'cano', diver: true },
  metralhador: { capHex: 0x6b7a3e, baseHex: 0x8a8a6a, gloveHex: 0x2a2a22, bootHex: 0x2a2622, face: 'bravo', hat: 'militar', boots: 'botas', gun: 'minigun' },
  fantasma: { capHex: 0x2a4a44, baseHex: 0x6a8a84, gloveHex: 0x2a3a38, bootHex: 0x2a3a38, face: 'pirata', hat: 'pirata', hatColor: 8, boots: 'botas', blade: 'sabre' },
  pirata: { capHex: 0x1b1b1f, baseHex: 0x6a2a2a, gloveHex: 0x2a1f1a, bootHex: 0x2a1f1a, face: 'pirata', hat: 'pirata', hatColor: 11, boots: 'botas', hook: true, blade: 'sabre' },
};

export function makeEnemyPill(type) {
  if (type === 'caranguejo' || type === 'siri') return makeCrab();
  const look = LOOKS[type] || LOOKS.melee;
  const pill = makePill({ npc: true, ...look });
  if (look.diver) addDiverHelmet(pill.userData.parts.body);
  const holder = new THREE.Group();
  holder.add(pill);
  holder.scale.setScalar(PILL_SCALE);
  const g = new THREE.Group();
  g.add(holder);
  const pp = pill.userData.parts;
  const held = look.gun || look.blade;
  if (held) { // arma na luva direita, apontando para a frente
    const w = buildWeapon(held);
    if (w) {
      // materiais próprios: brilho de dano/sumiço na morte não podem afetar a arma do jogador
      w.group.traverse((m) => { if (m.isMesh) m.material = m.material.clone(); });
      w.group.rotation.set(-Math.PI / 2, 0, Math.PI); w.group.scale.setScalar(2.4); pp.hand.add(w.group);
      g.userData.gunParts = w.parts || null; // minigun: canos que giram
    }
  }
  // partes "humanas" esperadas pelas animações antigas (dano/morte)
  const dummy = () => new THREE.Group();
  g.userData.parts = {
    torso: pp.body, head: new THREE.Group(), pelvis: dummy(), rig: holder,
    armL: pp.armL, armR: pp.armR, legL: pp.legL, legR: pp.legR,
    kneeL: dummy(), kneeR: dummy(), ankleL: dummy(), ankleR: dummy(), elbowL: dummy(), elbowR: dummy(), phase: 0,
  };
  g.userData.pill = pill;
  g.userData.blade = look.blade || null;
  return g;
}

export function animateEnemy(mesh, speed, dt, pose = 'walk', progress = 0) {
  if (mesh.userData.animate) { mesh.userData.animate(mesh, speed, dt, pose, progress); return; }
  animatePill(mesh.userData.pill, speed, dt, pose, progress);
}

// Capacete de escafandro: bola de latão com vigias de vidro esverdeado, parafusos e mangueira.
function addDiverHelmet(body) {
  const brass = new THREE.MeshStandardMaterial({ color: 0xb8893a, metalness: 0.85, roughness: 0.35 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x3a2e1a, metalness: 0.6, roughness: 0.5 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x1f3b36, emissive: 0x2aff9a, emissiveIntensity: 0.35, metalness: 0.2, roughness: 0.1, transparent: true, opacity: 0.85 });
  const g = new THREE.Group(); g.position.y = 0.62;
  const dome = new THREE.Mesh(new THREE.SphereGeometry(0.64, 22, 16), brass); g.add(dome);
  const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.7, 0.18, 22), dark); collar.position.y = -0.5; g.add(collar);
  const port = (x, z, ry, r) => {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(r, 0.05, 8, 20), brass); ring.position.set(x, 0.02, z); ring.rotation.y = ry; g.add(ring);
    const win = new THREE.Mesh(new THREE.CircleGeometry(r, 18), glass); win.position.set(x * 0.98, 0.02, z * 0.98); win.rotation.y = ry; g.add(win);
    for (let k = 0; k < 4; k++) { const b = new THREE.Mesh(new THREE.SphereGeometry(0.035, 6, 4), dark); const a = k * Math.PI / 2 + Math.PI / 4; b.position.set(x + Math.cos(ry) * Math.cos(a) * (r + 0.06), 0.02 + Math.sin(a) * (r + 0.06), z - Math.sin(ry) * Math.cos(a) * (r + 0.06)); g.add(b); }
  };
  port(0, 0.62, 0, 0.27); port(0.58, 0.18, Math.PI / 2 - 0.25, 0.16); port(-0.58, 0.18, -Math.PI / 2 + 0.25, 0.16);
  const hose = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.06, 8, 16, Math.PI * 1.2), dark); hose.position.set(0, 0.25, -0.55); hose.rotation.y = Math.PI / 2; g.add(hose);
  body.add(g);
}

// ---------------- Caranguejo-Rei (chefe da seca) ----------------
// Modelo próprio (não é pílula): carapaça larga com cracas, 8 patas, 2 pinças grandes e olhos em
// pedúnculos. Usa as mesmas poses do corpo a corpo (aviso/golpe/guarda/atordoado) do resto dos inimigos.
function makeCrab() {
  const shell = new THREE.MeshStandardMaterial({ color: 0xb2401f, roughness: 0.55, metalness: 0.05 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x6e2410, roughness: 0.7 });
  const belly = new THREE.MeshStandardMaterial({ color: 0xe8c79a, roughness: 0.8 });
  const barnacle = new THREE.MeshStandardMaterial({ color: 0xd8d2c0, roughness: 1 });
  const g = new THREE.Group(), rig = new THREE.Group(); g.add(rig);
  const body = new THREE.Group(); body.position.y = 1.1; rig.add(body);
  const cara = new THREE.Mesh(new THREE.SphereGeometry(1.25, 28, 18), shell); cara.scale.set(1.35, 0.55, 1); body.add(cara);
  const under = new THREE.Mesh(new THREE.SphereGeometry(1.15, 24, 14), belly); under.scale.set(1.25, 0.35, 0.9); under.position.y = -0.18; body.add(under);
  for (let i = 0; i < 9; i++) { // espinhos na borda da frente
    const sp = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.32, 6), dark); const a = -0.9 + i * 0.225;
    sp.position.set(Math.sin(a) * 1.62, 0.05, Math.cos(a) * 1.18); sp.rotation.set(Math.PI / 2, 0, -a); body.add(sp);
  }
  for (let i = 0; i < 14; i++) { // cracas nas costas
    const b = new THREE.Mesh(new THREE.ConeGeometry(0.08 + (i % 3) * 0.04, 0.12, 7), barnacle);
    const a = i * 2.4, r = 0.3 + (i % 5) * 0.18; b.position.set(Math.cos(a) * r * 1.3, 0.55 - r * 0.18, Math.sin(a) * r * 0.9 - 0.2); body.add(b);
  }
  const eyes = [];
  for (const s of [-1, 1]) {
    const stalk = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 0.5, 8), dark); stalk.position.set(s * 0.32, 0.55, 0.95); stalk.rotation.x = 0.3; body.add(stalk);
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 8), new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0x401010, roughness: 0.2 }));
    eye.position.set(s * 0.32, 0.82, 1.03); body.add(eye); eyes.push(eye);
  }
  // pinças: braço (2 segmentos) + garra fixa + dedo móvel
  const claws = {};
  for (const s of [-1, 1]) {
    const shoulder = new THREE.Group(); shoulder.position.set(s * 1.25, 0.05, 0.75); body.add(shoulder);
    const up = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 1.0, 10), shell); up.rotation.z = Math.PI / 2; up.position.x = s * 0.45; shoulder.add(up);
    const elbow = new THREE.Group(); elbow.position.x = s * 0.95; shoulder.add(elbow);
    const fore = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.24, 0.9, 10), shell); fore.rotation.x = Math.PI / 2; fore.position.z = 0.42; elbow.add(fore);
    const hand = new THREE.Group(); hand.position.z = 0.9; elbow.add(hand);
    const palm = new THREE.Mesh(new THREE.SphereGeometry(0.42, 16, 12), shell); palm.scale.set(0.75, 0.6, 1.1); hand.add(palm);
    const fixed = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.9, 10), dark); fixed.rotation.x = Math.PI / 2; fixed.position.set(-s * 0.06, -0.08, 0.72); hand.add(fixed);
    const finger = new THREE.Group(); finger.position.set(s * 0.1, 0.14, 0.32); hand.add(finger);
    const fm = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.8, 10), dark); fm.rotation.x = Math.PI / 2; fm.position.z = 0.38; finger.add(fm);
    claws[s] = { shoulder, elbow, hand, finger };
  }
  // patas: 4 de cada lado, com joelho
  const legs = [];
  for (const s of [-1, 1]) for (let i = 0; i < 4; i++) {
    const hip = new THREE.Group(); hip.position.set(s * 1.15, -0.1, 0.45 - i * 0.42); body.add(hip);
    const thigh = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.11, 0.9, 8), shell); thigh.rotation.z = Math.PI / 2; thigh.position.x = s * 0.42; hip.add(thigh);
    const knee = new THREE.Group(); knee.position.x = s * 0.85; hip.add(knee);
    const shin = new THREE.Mesh(new THREE.ConeGeometry(0.08, 1.05, 8), dark); shin.position.y = -0.5; shin.rotation.x = Math.PI; knee.add(shin);
    hip.rotation.y = s * (i - 1.5) * -0.25;
    legs.push({ hip, knee, s, i });
  }
  // partes "humanas" esperadas pelas animações antigas (dano/morte) — aqui viram balanço do corpo
  const dummy = () => new THREE.Group();
  g.userData.parts = { torso: body, head: dummy(), pelvis: dummy(), rig, armL: dummy(), armR: dummy(), legL: dummy(), legR: dummy(), kneeL: dummy(), kneeR: dummy(), ankleL: dummy(), ankleR: dummy(), elbowL: dummy(), elbowR: dummy(), phase: 0 };
  g.userData.crab = { body, claws, legs, eyes, ph: 0 };
  g.userData.tellY = 3.0;
  g.userData.animate = animateCrab;
  return g;
}

function animateCrab(mesh, speed, dt, pose, progress) {
  const c = mesh.userData.crab, p = Math.min(1, progress || 0);
  c.ph += dt * (2 + speed * 2.2);
  const walk = Math.min(1, speed / 2);
  c.legs.forEach((l) => {
    const ph = c.ph + l.i * 1.6 + (l.s > 0 ? Math.PI : 0);
    l.hip.rotation.z = l.s * (0.25 + Math.max(0, Math.sin(ph)) * 0.35 * walk);
    l.knee.rotation.z = l.s * (-0.55 + Math.cos(ph) * 0.2 * walk);
  });
  const sm = (x) => x * x * (3 - 2 * x);
  let bodyY = 1.1 + Math.sin(c.ph * 2) * 0.03 * walk, pitch = 0, roll = 0;
  // pinças: [ombro.x (subir), ombro.y (abrir), cotovelo.y, abertura do dedo] por lado
  const pose2 = { [-1]: [0, 0.35, -0.6, 0.15], [1]: [0, -0.35, 0.6, 0.15] };
  const set = (s, a, b, c2, f) => { pose2[s] = [a, b, c2, f]; };
  if (pose === 'windup' || pose === 'heavyWindup' || pose === 'kick') { // aviso: ergue a(s) pinça(s) e abre
    const k = sm(p), both = pose !== 'windup';
    set(-1, -1.1 * k, 0.6, -0.4, 0.15 + 0.6 * k);
    if (both) set(1, -1.1 * k, -0.6, 0.4, 0.15 + 0.6 * k);
    pitch = -0.15 * k;
  } else if (pose === 'slam') { // as duas pinças batem no chão
    const k = Math.sin(p * Math.PI * 0.5);
    set(-1, -1.1 + 1.9 * k, 0.6, -0.4, 0.75 - 0.6 * k); set(1, -1.1 + 1.9 * k, -0.6, 0.4, 0.75 - 0.6 * k);
    pitch = 0.25 * k; bodyY -= 0.25 * k;
  } else if (['slashR', 'slashL', 'thrust', 'uppercut', 'attack'].includes(pose)) { // beliscão
    const s = pose === 'slashL' ? 1 : -1, k = Math.sin(p * Math.PI);
    set(s, -0.4 + 0.5 * k, s * -0.35 + s * 0.5 * k, s * 0.6 - s * 0.9 * k, 0.7 * (1 - k));
    pitch = 0.08 * k;
  } else if (pose === 'guard') { set(-1, -0.6, -0.2, 0.9, 0); set(1, -0.6, 0.2, -0.9, 0); bodyY -= 0.15; }
  else if (pose === 'stagger' || pose === 'clash') { roll = Math.sin(c.ph * 3) * 0.18; pitch = 0.2; set(-1, 0.5, 0.9, -0.2, 0.5); set(1, 0.5, -0.9, 0.2, 0.5); bodyY -= 0.2; }
  else { // andando: pinças balançam e "estalam"
    const snap = Math.max(0, Math.sin(c.ph * 0.7)) * 0.3;
    set(-1, Math.sin(c.ph * 0.5) * 0.1, 0.35, -0.6, 0.15 + snap); set(1, Math.cos(c.ph * 0.5) * 0.1, -0.35, 0.6, 0.15 + snap);
  }
  for (const s of [-1, 1]) {
    const cl = c.claws[s], [a, b, el, f] = pose2[s], kk = Math.min(1, dt * 14);
    cl.shoulder.rotation.x += (a - cl.shoulder.rotation.x) * kk; cl.shoulder.rotation.y += (b - cl.shoulder.rotation.y) * kk;
    cl.elbow.rotation.y += (el - cl.elbow.rotation.y) * kk; cl.finger.rotation.x += (-f - cl.finger.rotation.x) * kk;
  }
  c.body.position.y += (bodyY - c.body.position.y) * Math.min(1, dt * 10);
  c.body.rotation.x += (pitch - c.body.rotation.x) * Math.min(1, dt * 10);
  c.body.rotation.z += (roll - c.body.rotation.z) * Math.min(1, dt * 10);
  for (const e of c.eyes) e.scale.y = 1 + Math.sin(c.ph * 1.3) * 0.08;
}
