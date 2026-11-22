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
  pirata: { capHex: 0x1b1b1f, baseHex: 0x6a2a2a, gloveHex: 0x2a1f1a, bootHex: 0x2a1f1a, face: 'pirata', hat: 'pirata', hatColor: 11, boots: 'botas', hook: true, blade: 'sabre' },
};

export function makeEnemyPill(type) {
  const look = LOOKS[type] || LOOKS.melee;
  const pill = makePill({ npc: true, ...look });
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
  animatePill(mesh.userData.pill, speed, dt, pose, progress);
}
