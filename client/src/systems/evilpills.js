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
  lanceiro: { capHex: 0x8a6a3a, baseHex: 0x4a3a2a, gloveHex: 0x3a2a1c, bootHex: 0x2a1a12, face: 'malvado', hat: 'palha', hatColor: 9, boots: 'chinelo', blade: 'bastao' },
  esquivo: { capHex: 0x2f6a4a, baseHex: 0x2a2f2a, gloveHex: 0x1c1c1f, bootHex: 0x1c1c1f, face: 'louco', hat: 'bandana', hatColor: 0x2a5a3a, boots: 'tenis', blade: 'facao' },
  duelista: { capHex: 0x7a1e2a, baseHex: 0xd8cfc0, gloveHex: 0x2a1f1a, bootHex: 0x2a1f1a, face: 'pirata', hat: 'pirata', hatColor: 0, boots: 'botas', blade: 'sabre' },
  pistoleiro: { capHex: 0x2b2420, baseHex: 0x6a4a2a, gloveHex: 0x2a1f1a, bootHex: 0x2a1f1a, face: 'pirata', hat: 'pirata', hatColor: 11, boots: 'botas', gun: 'revolver' },
  bombardeiro: { capHex: 0x2a2a2a, baseHex: 0x7a6a4a, gloveHex: 0x4a2a1a, bootHex: 0x2a1f1a, face: 'louco', hat: 'bandana', hatColor: 0x8b1d1d, boots: 'botas' },
  escopeteiro: { capHex: 0x4b5530, baseHex: 0x3a3f2a, gloveHex: 0x1f2219, bootHex: 0x1f1c18, face: 'bravo', hat: 'militar', boots: 'botas', gun: 'escopeta' },
  elite: { capHex: 0x3f4a2a, baseHex: 0x5a5a40, gloveHex: 0x1f2219, bootHex: 0x1f1c18, face: 'bravo', hat: 'bone', hatColor: 7, boots: 'botas', gun: 'rifle_precisao' },
  fantasma: { capHex: 0x2a4a44, baseHex: 0x6a8a84, gloveHex: 0x2a3a38, bootHex: 0x2a3a38, face: 'pirata', hat: 'pirata', hatColor: 8, boots: 'botas', blade: 'sabre' },
  pirata: { capHex: 0x1b1b1f, baseHex: 0x6a2a2a, gloveHex: 0x2a1f1a, bootHex: 0x2a1f1a, face: 'pirata', hat: 'pirata', hatColor: 11, boots: 'botas', hook: true, blade: 'sabre' },
};

export function makeEnemyPill(type) {
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
