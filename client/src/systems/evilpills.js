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
  escafandrista: { capHex: 0x4d5d62, baseHex: 0x2f3b3f, gloveHex: 0xb08a3a, bootHex: 0x3a3226, face: 'malvado', hat: 'nenhum', boots: 'botas', blade: 'cano', diver: true, gearMore: 'mergulho' },
  metralhador: { capHex: 0x6b7a3e, baseHex: 0x8a8a6a, gloveHex: 0x2a2a22, bootHex: 0x2a2622, face: 'bravo', hat: 'militar', boots: 'botas', gun: 'minigun', outfit: 'colete', outfitHex: 0x3a4226, gearMore: 'municao' },
  lanceiro: { capHex: 0x8a6a3a, baseHex: 0x4a3a2a, gloveHex: 0x3a2a1c, bootHex: 0x2a1a12, face: 'malvado', hat: 'palha', hatColor: 9, boots: 'chinelo', blade: 'bastao' },
  esquivo: { capHex: 0x2f6a4a, baseHex: 0x2a2f2a, gloveHex: 0x1c1c1f, bootHex: 0x1c1c1f, face: 'louco', hat: 'bandana', hatColor: 0x2a5a3a, boots: 'tenis', blade: 'facao' },
  duelista: { capHex: 0x7a1e2a, baseHex: 0xd8cfc0, gloveHex: 0x2a1f1a, bootHex: 0x2a1f1a, face: 'pirata', hat: 'pirata', hatColor: 0, boots: 'botas', blade: 'sabre' },
  pistoleiro: { capHex: 0x2b2420, baseHex: 0x6a4a2a, gloveHex: 0x2a1f1a, bootHex: 0x2a1f1a, face: 'pirata', hat: 'pirata', hatColor: 11, boots: 'botas', gun: 'revolver' },
  bombardeiro: { capHex: 0x2a2a2a, baseHex: 0x7a6a4a, gloveHex: 0x4a2a1a, bootHex: 0x2a1f1a, face: 'louco', hat: 'bandana', hatColor: 0x8b1d1d, boots: 'botas' },
  escopeteiro: { capHex: 0x4b5530, baseHex: 0x3a3f2a, gloveHex: 0x1f2219, bootHex: 0x1f1c18, face: 'bravo', hat: 'militar', boots: 'botas', gun: 'escopeta' },
  elite: { capHex: 0x3f4a2a, baseHex: 0x5a5a40, gloveHex: 0x1f2219, bootHex: 0x1f1c18, face: 'bravo', hat: 'bone', hatColor: 7, boots: 'botas', gun: 'rifle_precisao' },
  // chefes da Leviatã (acessórios próprios em addBossGear)
  soldador: { capHex: 0x8a4a1a, baseHex: 0x3a3430, gloveHex: 0x6a3a1a, bootHex: 0x2a1f1a, face: 'bravo', hat: 'nenhum', boots: 'botas', blade: 'cano', gear: 'solda', outfit: 'jaleco', outfitHex: 0x5a3a1a },
  quimico: { capHex: 0x4a6a2a, baseHex: 0xd8d4c0, gloveHex: 0x2f5a2a, bootHex: 0x2a2a22, face: 'louco', hat: 'nenhum', boots: 'galochas', blade: 'faca_manteiga', gear: 'gas', outfit: 'jaleco', outfitHex: 0xe8e4d6 },
  perfurador: { capHex: 0x6a4a2a, baseHex: 0x3a3a3a, gloveHex: 0x2a2a2a, bootHex: 0x1c1c1c, face: 'malvado', hat: 'capacete', boots: 'botas', spikes: true, gear: 'broca', outfit: 'colete', outfitHex: 0xe8b020 },
  faisca: { capHex: 0x1f3a8a, baseHex: 0x1a1f2a, gloveHex: 0x4ab0ff, bootHex: 0x1a1f2a, face: 'louco', hat: 'nenhum', boots: 'tenis', blade: 'sabre', gear: 'raio', outfit: 'casaco', outfitHex: 0x161a24 },
  fantasma: { capHex: 0x2a4a44, baseHex: 0x6a8a84, gloveHex: 0x2a3a38, bootHex: 0x2a3a38, face: 'pirata', hat: 'pirata', hatColor: 8, boots: 'botas', blade: 'sabre' },
  pirata: { capHex: 0x1b1b1f, baseHex: 0x6a2a2a, gloveHex: 0x2a1f1a, bootHex: 0x2a1f1a, face: 'pirata', hat: 'pirata', hatColor: 11, boots: 'botas', hook: true, blade: 'sabre' },
};

// VARIAÇÕES temáticas por tipo (roupa, chapéu, acessório nas costas): cada inimigo sorteia uma
// pela semente do id (todos os jogadores veem a mesma). Cores em hex; chapéus de paleta usam índice.
const V = (name, o) => ({ name, ...o });
const VARIANTS = {
  melee: [V('saqueador de praia', { hat: 'palha', hatColor: 9, back: 'bandoleira', backHex: 0x4a3a2a }), V('náufrago selvagem', { hat: 'bandana', hatColor: 0x8b1d1d, outfit: 'moletom', outfitHex: 0x4a3a2a }), V('catador', { hat: 'gorro', hatColor: 9, outfit: 'casaco', outfitHex: 0x5a4a3a, back: 'mochila', backHex: 0x4a3a2a, face: 'louco' })],
  atirador: [V('caçador', { hat: 'bone', hatColor: 7, outfit: 'colete', outfitHex: 0x6a5a2a }), V('tocaia', { hat: 'capuz', hatColor: 0x3a3a2a, outfit: 'casaco', outfitHex: 0x3a4a2a, back: 'bandoleira', backHex: 0x3a2a1a }), V('explorador', { hat: 'palha', hatColor: 9, back: 'explorador', backHex: 0x6a5030 })],
  pesado: [V('açougueiro', { hat: 'capacete', outfit: 'jaleco', outfitHex: 0x5a2a2a }), V('estivador', { hat: 'gorro', hatColor: 7, outfit: 'casaco', outfitHex: 0x2a2a30, back: 'mochila', backHex: 0x3a2a2a }), V('marujo bruto', { hat: 'nenhum', outfit: 'marinheiro', outfitHex: 0x3a2a4a, face: 'louco' })],
  rapido: [V('pivete', { hat: 'bandana', hatColor: 0xc2410c }), V('sombra', { hat: 'capuz', hatColor: 0x2a2a2a, outfit: 'moletom', outfitHex: 0x2a2a2a }), V('surfista', { hat: 'bone', hatColor: 5, back: 'boia', backHex: 0xf07a1e })],
  lanceiro: [V('pescador', { hat: 'palha', hatColor: 9 }), V('peregrino', { hat: 'capuz', hatColor: 0x6a5a3a, outfit: 'casaco', outfitHex: 0x6a5a3a }), V('guerreiro', { hat: 'bandana', hatColor: 0x3a6a2a, back: 'bandoleira', backHex: 0x4a3a2a })],
  esquivo: [V('ágil', { hat: 'bandana', hatColor: 0x2a5a3a }), V('ninja da praia', { hat: 'capuz', hatColor: 0x1f3a2a, outfit: 'moletom', outfitHex: 0x1f3a2a }), V('coletinho', { hat: 'nenhum', outfit: 'colete', outfitHex: 0x2a5a3a })],
  duelista: [V('espadachim', { hat: 'pirata', hatColor: 0, outfit: 'pirata', outfitHex: 0x7a1e2a }), V('cavalheiro', { hat: 'cartola', hatColor: 7, outfit: 'pirata', outfitHex: 0x2a1a3a, face: 'pirata' }), V('corsário', { hat: 'bandana', hatColor: 0x7a1e2a, outfit: 'marinheiro', outfitHex: 0x7a1e2a, back: 'capa', backHex: 0x5a0f1a })],
  pistoleiro: [V('atirador do convés', { hat: 'pirata', hatColor: 11, outfit: 'pirata', outfitHex: 0x3b2a1d, back: 'bandoleira', backHex: 0x2a1a10 }), V('imediato', { hat: 'capitao', outfit: 'pirata', outfitHex: 0x1a2a4a }), V('contrabandista', { hat: 'bandana', hatColor: 0x2a2a2a, outfit: 'casaco', outfitHex: 0x4a3a2a, back: 'papagaio' })],
  pirata: [V('bucaneiro', { hat: 'pirata', hatColor: 11, back: 'papagaio' }), V('grumete', { hat: 'bandana', hatColor: 0x8b1d1d, outfit: 'marinheiro', outfitHex: 0x2a3a6a }), V('marujo', { hat: 'gorro', hatColor: 0, outfit: 'marinheiro', outfitHex: 0x8b1d1d, back: 'boia', backHex: 0xf07a1e }), V('lobo do mar', { hat: 'pirata', hatColor: 7, outfit: 'pirata', outfitHex: 0x553b2d, back: 'capa', backHex: 0x2a1a1a })],
  bombardeiro: [V('artilheiro', { hat: 'bandana', hatColor: 0x8b1d1d, back: 'bandoleira', backHex: 0x2a1a10 }), V('pólvora', { hat: 'gorro', hatColor: 7, outfit: 'casaco', outfitHex: 0x3a2a1a, back: 'mochila', backHex: 0x2a2a2a })],
  soldado: [V('infante', { hat: 'militar', back: 'mochila', backHex: 0x4b5530 }), V('fuzileiro', { hat: 'boina', hatColor: 0x2a4a1a, outfit: 'colete', outfitHex: 0x4b5530 }), V('patrulheiro', { hat: 'militar', outfit: 'casaco', outfitHex: 0x3f4a2a, back: 'explorador', backHex: 0x3f4a2a }), V('boina vermelha', { hat: 'boina', hatColor: 0x7a1414, outfit: 'colete', outfitHex: 0x2a2a2a })],
  escopeteiro: [V('assalto', { hat: 'militar', outfit: 'colete', outfitHex: 0x4b5530 }), V('guarda', { hat: 'bone', hatColor: 7, outfit: 'casaco', outfitHex: 0x2a2a2a, back: 'mochila', backHex: 0x2a2a2a }), V('comando', { hat: 'boina', hatColor: 0x1a1a1a })],
  elite: [V('atirador', { hat: 'bone', hatColor: 7 }), V('camuflado', { hat: 'capuz', hatColor: 0x3a4a2a, outfit: 'casaco', outfitHex: 0x3a4a2a, back: 'capa', backHex: 0x3a4a2a }), V('oficial', { hat: 'boina', hatColor: 0x2a3a5a, outfit: 'colete', outfitHex: 0x2a2a2a })],
  fantasma: [V('afogado', { hat: 'pirata', hatColor: 8 }), V('espectro', { hat: 'capuz', hatColor: 0x6a8a84, outfit: 'pirata', outfitHex: 0x6a8a84, back: 'capa', backHex: 0x4a6a64 }), V('marujo perdido', { hat: 'bandana', hatColor: 0x6a8a84, outfit: 'marinheiro', outfitHex: 0x6a8a84 })],
};

export function makeEnemyPill(type, seed = 0) {
  const vs = VARIANTS[type], variant = vs ? vs[Math.abs(seed | 0) % vs.length] : null;
  const look = { ...(LOOKS[type] || LOOKS.melee), ...(variant || {}) };
  const pill = makePill({ npc: true, ...look });
  if (look.diver) addDiverHelmet(pill.userData.parts.body);
  if (look.gear) addBossGear(look.gear, pill.userData.parts);
  if (look.gearMore) addBossGear(look.gearMore, pill.userData.parts);
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
  const ga = mesh.userData.pill && mesh.userData.pill.userData.parts.gearAnim; // partes animadas dos chefes
  if (ga) for (const f of ga) f(dt);
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
  const anim = pp.gearAnim || (pp.gearAnim = []); // animações por quadro (vfx via window.G)
  const W = () => (typeof window !== 'undefined' ? window.G : null), wp = new THREE.Vector3();
  const pads = (color) => { for (const sx of [-1, 1]) { const pd = new THREE.Mesh(new THREE.SphereGeometry(0.22, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), M(color, { metalness: 0.6, roughness: 0.35 })); pd.scale.set(1, 0.6, 1); pd.position.set(sx * 0.48, 0.32, 0); pd.rotation.z = -sx * 0.5; body.add(pd); } };
  const glow = (c, i = 2.5) => M(c, { emissive: c, emissiveIntensity: i });
  const add = (parent, mesh, x, y, z) => { mesh.position.set(x, y, z); parent.add(mesh); return mesh; };
  if (kind === 'solda') { // máscara de solda + tanque de acetileno + bico do maçarico aceso
    const mask = add(body, new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.5, 0.1), M(0x2a2a2a, { metalness: 0.4 })), 0, 0.55, 0.5);
    add(mask, new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.12, 0.04), glow(0x3aff6a, 1.4)), 0, 0.06, 0.05);
    const tank = add(body, new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.8, 12), M(0xc23a1a)), 0, 0.05, -0.55);
    add(tank, new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), M(0xc23a1a)), 0, 0.4, 0);
    const tip = add(pp.hand, new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.25, 8), glow(0x5ab8ff, 3)), 0, -0.35, 0); tip.rotation.x = Math.PI;
    pads(0x5a3a1a);
    const hose = add(body, new THREE.Mesh(new THREE.TorusGeometry(0.35, 0.03, 6, 16, Math.PI * 1.1), M(0x2a2a2a)), 0.25, 0.05, -0.38); hose.rotation.set(0, Math.PI / 2, 0.4);
    anim.push((dt) => { // bico do maçarico tremulando e soltando faíscas
      tip.scale.setScalar(0.85 + Math.random() * 0.4); const G = W();
      if (G && G.vfx && Math.random() < dt * 9) { tip.getWorldPosition(wp); G.vfx.sparks(wp, 2, 0xbfe4ff, 3, 0.3); }
    });
  } else if (kind === 'gas') { // máscara de gás com filtros, óculos verdes e tanque nas costas
    const mask = add(body, new THREE.Mesh(new THREE.SphereGeometry(0.3, 14, 10), M(0x2a2f2a)), 0, 0.45, 0.42); mask.scale.set(1, 0.8, 0.6);
    for (const sx of [-1, 1]) {
      const f = add(body, new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.16, 12), M(0x6a6a5a)), sx * 0.22, 0.36, 0.55); f.rotation.x = Math.PI / 2;
      add(body, new THREE.Mesh(new THREE.CircleGeometry(0.1, 14), glow(0x7aff5a, 1.5)), sx * 0.16, 0.66, 0.565);
    }
    const tank = add(body, new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.75, 12), glow(0x4a8a2a, 0.5)), 0, 0.05, -0.56);
    add(tank, new THREE.Mesh(new THREE.TorusGeometry(0.23, 0.03, 6, 14), M(0xe8d02a)), 0, 0.2, 0).rotation.x = Math.PI / 2;
    for (let k = 0; k < 3; k++) { const vial = add(body, new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.16, 8), glow([0x7aff5a, 0xffd23a, 0xff5ad0][k], 1.4)), -0.3 + k * 0.15, -0.28, 0.5); vial.rotation.x = 0.2; }
    anim.push((dt) => { // vazamento de gás do tanque
      const G = W(); if (G && G.vfx && Math.random() < dt * 5) { tank.getWorldPosition(wp); wp.y += 0.4; G.vfx.flat.emit(wp.x, wp.y, wp.z, (Math.random() - 0.5) * 0.4, 0.6, (Math.random() - 0.5) * 0.4, 1.4, 0.35, 0x9adf6a, -0.2, 0.8, 2); }
    });
  } else if (kind === 'broca') { // broca gigante no braço direito
    const drill = new THREE.Group();
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.9, 10), M(0x9a9a9a, { metalness: 0.8, roughness: 0.3 })); cone.rotation.x = Math.PI; cone.position.y = -0.55; drill.add(cone);
    for (let i = 0; i < 4; i++) { const t = new THREE.Mesh(new THREE.TorusGeometry(0.16 - i * 0.035, 0.025, 4, 12), M(0x5a5a5a, { metalness: 0.8 })); t.rotation.x = Math.PI / 2; t.position.y = -0.3 - i * 0.18; drill.add(t); }
    const motor = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.3, 12), M(0xd8a72a)); motor.position.y = -0.12; drill.add(motor);
    pp.hand.add(drill); pp.drill = drill;
    pads(0xd8a72a);
    const pipes = []; for (const sx of [-1, 1]) { const ex = add(body, new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.6, 8), M(0x3a3a3a, { metalness: 0.7 })), sx * 0.22, 0.45, -0.5); pipes.push(ex); }
    anim.push((dt) => { // broca girando + fumaça do escapamento
      drill.rotation.y += dt * 18; const G = W();
      if (G && G.vfx && Math.random() < dt * 4) { const pi = pipes[(Math.random() * 2) | 0]; pi.getWorldPosition(wp); wp.y += 0.35; G.vfx.flat.emit(wp.x, wp.y, wp.z, 0, 1.2, 0, 1.2, 0.3, 0x3a3634, -0.3, 0.6, 2.2); }
    });
  } else if (kind === 'raio') { // bobina de Tesla nas costas e brilho azul
    const coil = add(body, new THREE.Group(), 0, 0.3, -0.55);
    coil.add(new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 0.9, 8), M(0x8a8a8a, { metalness: 0.8 })));
    for (let i = 0; i < 4; i++) { const ring = new THREE.Mesh(new THREE.TorusGeometry(0.14 + i * 0.01, 0.03, 6, 16), glow(0x4ab0ff, 2)); ring.rotation.x = Math.PI / 2; ring.position.y = -0.3 + i * 0.18; coil.add(ring); }
    add(coil, new THREE.Mesh(new THREE.SphereGeometry(0.14, 12, 8), glow(0xbfe4ff, 4)), 0, 0.52, 0);
    const visor = add(body, new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.1, 0.06), glow(0x4ab0ff, 3)), 0, 0.66, 0.5);
    const orb = coil.children[coil.children.length - 1];
    anim.push((dt) => { // arcos elétricos na bobina e visor piscando
      visor.material.emissiveIntensity = 2 + Math.random() * 2.5; const G = W();
      if (G && G.vfx && Math.random() < dt * 10) { orb.getWorldPosition(wp); G.vfx.sparks(wp, 3, 0x8fd0ff, 4, 0.25); }
    });
  } else if (kind === 'municao') { // metralhador: caixa de munição nas costas com fita até a arma, ombreiras
    const box = add(body, new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.55, 0.35), M(0x3a4226, { metalness: 0.3 })), 0, 0.1, -0.62);
    add(box, new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.06, 0.04), M(0xd8b04a)), 0, 0.12, -0.18);
    for (let i = 0; i < 9; i++) { const b = add(body, new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.1, 6), M(0xc9a03a, { metalness: 0.8, roughness: 0.3 })), -0.3 + i * 0.04, 0.0 - i * 0.03, -0.5 + i * 0.07); b.rotation.z = Math.PI / 2; }
    pads(0x3a4226);
  } else if (kind === 'mergulho') { // escafandrista: cilindros de ar e cinto de chumbo
    for (const sx of [-1, 1]) { const cyl = add(body, new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.7, 12), M(0xb8893a, { metalness: 0.85, roughness: 0.35 })), sx * 0.17, 0.05, -0.55); add(cyl, new THREE.Mesh(new THREE.SphereGeometry(0.14, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), M(0xb8893a, { metalness: 0.85 })), 0, 0.35, 0); }
    const belt = add(body, new THREE.Mesh(new THREE.TorusGeometry(0.52, 0.05, 6, 28), M(0x2a2a2a)), 0, -0.3, 0); belt.rotation.x = Math.PI / 2;
    for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2, w = add(body, new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.12, 0.08), M(0x5a5a5a, { metalness: 0.6 })), Math.sin(a) * 0.53, -0.3, Math.cos(a) * 0.53); w.rotation.y = a; }
    anim.push((dt) => { const G = W(); if (G && G.vfx && Math.random() < dt * 3) { body.getWorldPosition(wp); wp.y += 1.2; G.vfx.flat.emit(wp.x, wp.y, wp.z, (Math.random() - 0.5) * 0.3, 0.9, (Math.random() - 0.5) * 0.3, 1.6, 0.18, 0xcfe8f2, -0.6, 0.4, 0.5); } }); // bolhas
  }
}
