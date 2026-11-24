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
  // chefes da Leviatã (acessórios próprios em addBossGear)
  soldador: { capHex: 0x8a4a1a, baseHex: 0x3a3430, gloveHex: 0x6a3a1a, bootHex: 0x2a1f1a, face: 'bravo', hat: 'nenhum', boots: 'botas', blade: 'cano', gear: 'solda' },
  quimico: { capHex: 0x4a6a2a, baseHex: 0xd8d4c0, gloveHex: 0x2f5a2a, bootHex: 0x2a2a22, face: 'louco', hat: 'nenhum', boots: 'galochas', blade: 'faca_manteiga', gear: 'gas' },
  perfurador: { capHex: 0x6a4a2a, baseHex: 0x3a3a3a, gloveHex: 0x2a2a2a, bootHex: 0x1c1c1c, face: 'malvado', hat: 'capacete', boots: 'botas', spikes: true, gear: 'broca' },
  faisca: { capHex: 0x1f3a8a, baseHex: 0x1a1f2a, gloveHex: 0x4ab0ff, bootHex: 0x1a1f2a, face: 'louco', hat: 'nenhum', boots: 'tenis', blade: 'sabre', gear: 'raio' },
  fantasma: { capHex: 0x2a4a44, baseHex: 0x6a8a84, gloveHex: 0x2a3a38, bootHex: 0x2a3a38, face: 'pirata', hat: 'pirata', hatColor: 8, boots: 'botas', blade: 'sabre' },
  pirata: { capHex: 0x1b1b1f, baseHex: 0x6a2a2a, gloveHex: 0x2a1f1a, bootHex: 0x2a1f1a, face: 'pirata', hat: 'pirata', hatColor: 11, boots: 'botas', hook: true, blade: 'sabre' },
};

export function makeEnemyPill(type) {
  const look = LOOKS[type] || LOOKS.melee;
  const pill = makePill({ npc: true, ...look });
  if (look.diver) addDiverHelmet(pill.userData.parts.body);
  if (look.gear) addBossGear(look.gear, pill.userData.parts);
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

// Acessórios dos chefes da Leviatã: deixam cada um reconhecível de longe.
function addBossGear(kind, pp) {
  const body = pp.body, M = (c, e = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.5, ...e });
  const glow = (c, i = 2.5) => M(c, { emissive: c, emissiveIntensity: i });
  const add = (parent, mesh, x, y, z) => { mesh.position.set(x, y, z); parent.add(mesh); return mesh; };
  if (kind === 'solda') { // máscara de solda + tanque de acetileno + bico do maçarico aceso
    const mask = add(body, new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.5, 0.1), M(0x2a2a2a, { metalness: 0.4 })), 0, 0.55, 0.5);
    add(mask, new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.12, 0.04), glow(0x3aff6a, 1.4)), 0, 0.06, 0.05);
    const tank = add(body, new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.8, 12), M(0xc23a1a)), 0, 0.05, -0.55);
    add(tank, new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), M(0xc23a1a)), 0, 0.4, 0);
    add(pp.hand, new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.25, 8), glow(0x5ab8ff, 3)), 0, -0.35, 0).rotation.x = Math.PI;
  } else if (kind === 'gas') { // máscara de gás com filtros, óculos verdes e tanque nas costas
    const mask = add(body, new THREE.Mesh(new THREE.SphereGeometry(0.3, 14, 10), M(0x2a2f2a)), 0, 0.45, 0.42); mask.scale.set(1, 0.8, 0.6);
    for (const sx of [-1, 1]) {
      const f = add(body, new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.16, 12), M(0x6a6a5a)), sx * 0.22, 0.36, 0.55); f.rotation.x = Math.PI / 2;
      add(body, new THREE.Mesh(new THREE.CircleGeometry(0.1, 14), glow(0x7aff5a, 1.5)), sx * 0.16, 0.66, 0.565);
    }
    const tank = add(body, new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.75, 12), glow(0x4a8a2a, 0.5)), 0, 0.05, -0.56);
    add(tank, new THREE.Mesh(new THREE.TorusGeometry(0.23, 0.03, 6, 14), M(0xe8d02a)), 0, 0.2, 0).rotation.x = Math.PI / 2;
  } else if (kind === 'broca') { // broca gigante no braço direito
    const drill = new THREE.Group();
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.9, 10), M(0x9a9a9a, { metalness: 0.8, roughness: 0.3 })); cone.rotation.x = Math.PI; cone.position.y = -0.55; drill.add(cone);
    for (let i = 0; i < 4; i++) { const t = new THREE.Mesh(new THREE.TorusGeometry(0.16 - i * 0.035, 0.025, 4, 12), M(0x5a5a5a, { metalness: 0.8 })); t.rotation.x = Math.PI / 2; t.position.y = -0.3 - i * 0.18; drill.add(t); }
    const motor = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.3, 12), M(0xd8a72a)); motor.position.y = -0.12; drill.add(motor);
    pp.hand.add(drill); pp.drill = drill;
  } else if (kind === 'raio') { // bobina de Tesla nas costas e brilho azul
    const coil = add(body, new THREE.Group(), 0, 0.3, -0.55);
    coil.add(new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 0.9, 8), M(0x8a8a8a, { metalness: 0.8 })));
    for (let i = 0; i < 4; i++) { const ring = new THREE.Mesh(new THREE.TorusGeometry(0.14 + i * 0.01, 0.03, 6, 16), glow(0x4ab0ff, 2)); ring.rotation.x = Math.PI / 2; ring.position.y = -0.3 + i * 0.18; coil.add(ring); }
    add(coil, new THREE.Mesh(new THREE.SphereGeometry(0.14, 12, 8), glow(0xbfe4ff, 4)), 0, 0.52, 0);
    const visor = add(body, new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.1, 0.06), glow(0x4ab0ff, 3)), 0, 0.66, 0.5); void visor;
  }
}
