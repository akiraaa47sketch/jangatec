// Peças visuais da 1ª pessoa: mãos articuladas, braços com IK de dois ossos e os modelos
// detalhados de cada arma. Tudo aqui vive na cena do viewmodel (só o jogador local vê).
//
// Convenção dos modelos de arma: origem perto da empunhadura, cano apontando para -Z,
// +Y para cima, +X para a direita do atirador.
import * as THREE from '../three.js';
import { woodTexture, woodBump, metalTexture, repeated } from '../world/textures.js';

const std = (color, roughness = 0.9, metalness = 0, extra = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness, metalness, ...extra });
// madeira com veios e relevo; metal com leve desgaste
const woodMat = (color) => std(color, 0.82, 0, { map: repeated(woodTexture(), 4), bumpMap: repeated(woodBump(), 4), bumpScale: 0.6 });
const metalMat = (color, roughness, metalness) => std(color, roughness, metalness, { map: repeated(metalTexture(), 3) });

export const MAT = {
  skin: std(0xb97251, 0.86),
  glove: new THREE.MeshPhysicalMaterial({ color: 0xd3202b, roughness: 0.38, clearcoat: 0.6, clearcoatRoughness: 0.35 }),
  tube: new THREE.MeshStandardMaterial({ color: 0x2b2220, roughness: 0.6 }),
  skinDark: std(0x9c5b3e, 0.9),
  nail: std(0xd8b79c, 0.7),
  strap: std(0x583a28, 0.92),
  wrap: std(0xd0b99a, 0.97),
  cloth: std(0x8a7a5a, 0.98),
  wood: woodMat(0x8a6236),
  woodDark: woodMat(0x5a3d26),
  woodLight: woodMat(0xb08a55),
  steel: std(0xc4c8c6, 0.32, 0.75),
  iron: metalMat(0x8a9093, 0.5, 0.55),
  black: std(0x24282c, 0.42, 0.45),
  blued: std(0x353d47, 0.35, 0.6),
  rust: metalMat(0x8a5a3a, 0.9, 0.2),
  tape: std(0x9a9a98, 0.75, 0.05),
  red2: std(0xc0392b, 0.6),
  brass: std(0xb58d4a, 0.5, 0.5),
  red: std(0xb03a2e, 0.8),
  white: std(0xe8e4da, 0.9),
  glass: new THREE.MeshStandardMaterial({ color: 0x6fa0b5, roughness: 0.15, metalness: 0.2, transparent: true, opacity: 0.55 }),
};

// ---------- helpers de geometria ----------
const box = (w, h, d, mat, x = 0, y = 0, z = 0) => {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  return m;
};
// Cilindro com eixo em Z. rFront = raio da ponta -Z, rBack = raio da ponta +Z.
const cylZ = (rFront, rBack, len, mat, x = 0, y = 0, z = 0, seg = 8) => {
  const g = new THREE.CylinderGeometry(rBack, rFront, len, Math.max(seg, 16));
  g.rotateX(Math.PI / 2);
  const m = new THREE.Mesh(g, mat);
  m.position.set(x, y, z);
  return m;
};
const cylY = (r, len, mat, x = 0, y = 0, z = 0, seg = 8) => {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, Math.max(seg, 12)), mat);
  m.position.set(x, y, z);
  return m;
};
// Silhueta lateral extrudada. pontos = [[frente, cima], ...]; espessura em X.
function profile(points, depth, mat, x = 0, y = 0, z = 0) {
  const shape = new THREE.Shape(points.map(([u, v]) => new THREE.Vector2(u, v)));
  const bev = Math.min(0.003, depth * 0.18); // cantos chanfrados: pegam luz e parecem peças de verdade
  const geo = new THREE.ExtrudeGeometry(shape, { depth: depth - bev * 2, bevelEnabled: true, bevelThickness: bev, bevelSize: bev, bevelSegments: 2, steps: 1 });
  geo.translate(0, 0, bev);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const sx = pos.getX(i), sy = pos.getY(i), sz = pos.getZ(i);
    pos.setXYZ(i, sz - depth / 2, sy, -sx); // u -> -Z, extrusão -> X (rotação própria)
  }
  geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  return m;
}
const add = (parent, ...children) => { for (const c of children) parent.add(c); return parent; };

// ---------- mão ----------
const FINGERS = [
  { x: -0.032, len: [0.040, 0.028, 0.022], r: 0.0105 }, // indicador (lado do polegar = -X)
  { x: -0.011, len: [0.044, 0.030, 0.022], r: 0.0108 },
  { x: 0.011, len: [0.040, 0.028, 0.020], r: 0.0104 },
  { x: 0.032, len: [0.032, 0.022, 0.018], r: 0.0098 },
];
const capsuleZ = (r, len, mat) => {
  const g = new THREE.CapsuleGeometry(r, Math.max(0.001, len - r * 2), 2, 6);
  g.rotateX(Math.PI / 2);
  g.translate(0, 0, -len / 2);
  return new THREE.Mesh(g, mat);
};

// Mão da pílula = luva de boxe. Mesma API da antiga mão articulada ({ root, setPose }):
// origem no punho, "dedos" para -Z, palma para -Y, polegar em -X (mão direita).
// setPose(c, t): c = fechamento (0..1) achata/aperta a luva; t[0] gira o polegar.
export function buildHand(mirror = false) {
  const root = new THREE.Group();
  const inner = new THREE.Group();
  if (mirror) inner.scale.x = -1;
  root.add(inner);
  const fist = new THREE.Mesh(new THREE.SphereGeometry(0.062, 24, 18), MAT.glove);
  fist.scale.set(1.08, 0.92, 1.18); fist.position.set(0, 0.004, -0.07);
  const knuckle = new THREE.Mesh(new THREE.SphereGeometry(0.045, 18, 12), MAT.glove);
  knuckle.scale.set(1.35, 0.8, 0.8); knuckle.position.set(0, 0.018, -0.115);
  const thumbPivot = new THREE.Group(); thumbPivot.position.set(-0.052, -0.006, -0.05);
  const thumb = new THREE.Mesh(new THREE.CapsuleGeometry(0.02, 0.036, 6, 12), MAT.glove);
  thumb.rotation.set(Math.PI / 2 - 0.4, 0, 0.35); thumb.position.z = -0.018; thumbPivot.add(thumb);
  const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.044, 0.05, 0.05, 20), MAT.glove);
  cuff.rotation.x = Math.PI / 2; cuff.position.z = -0.005;
  const lip = new THREE.Mesh(new THREE.TorusGeometry(0.046, 0.009, 8, 22), MAT.glove);
  lip.position.z = 0.02;
  const lace = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.006, 0.05), MAT.white); lace.position.set(0, 0.05, -0.002);
  add(inner, fist, knuckle, thumbPivot, cuff, lip, lace);
  const setPose = (c, t) => {
    const k = (c[0] + c[1] + c[2] + c[3]) / 4;            // mão fechada = luva mais compacta
    fist.scale.set(1.08, 0.92 - k * 0.08, 1.18 - k * 0.16);
    knuckle.position.z = -0.115 + k * 0.02;
    thumbPivot.rotation.set(t[1] * 0.5, t[0] * 0.6, 0);
  };
  setPose([0.3, 0.3, 0.3, 0.3], [0.5, -0.2, 0.3]);
  return { root, setPose };
}

// Cor da luva (vem da personalização da pílula).
export function setGloveColor(hex) { MAT.glove.color.setHex(hex); }

// ---------- braço com IK de dois ossos ----------
const ARM = { upper: 0.36, fore: 0.33 };
const _d = new THREE.Vector3(), _dir = new THREE.Vector3(), _pp = new THREE.Vector3();
const _e = new THREE.Vector3(), _z = new THREE.Vector3(0, 0, 1), _y = new THREE.Vector3(0, 1, 0);

function limb(rTop, rBottom, mat, seg = 7) {
  const g = new THREE.CylinderGeometry(rTop, rBottom, 1, seg);
  g.rotateX(Math.PI / 2);      // topo -> +Z
  g.translate(0, 0, 0.5);      // ocupa z de 0 a 1
  return new THREE.Mesh(g, mat);
}
function place(mesh, from, to) {
  _d.subVectors(to, from);
  const len = Math.max(1e-4, _d.length());
  mesh.position.copy(from);
  mesh.quaternion.setFromUnitVectors(_z, _d.multiplyScalar(1 / len));
  mesh.scale.set(1, 1, len);
}

export function buildArm() {
  const root = new THREE.Group();
  // bracinhos de tubo da pílula (finos e escuros); manga e punho somem dentro da luva
  const upper = limb(0.017, 0.017, MAT.tube, 10);
  const fore = limb(0.016, 0.017, MAT.tube, 10);
  const elbow = new THREE.Mesh(new THREE.SphereGeometry(0.018, 10, 8), MAT.tube);
  const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.001, 0.001, 0.001, 3), MAT.tube); cuff.visible = false;
  const sleeve = limb(0.001, 0.001, MAT.tube, 3); sleeve.visible = false;
  add(root, upper, fore, elbow, cuff, sleeve);

  // S = ombro, W = punho (ambos no espaço do viewmodel), pole = para onde o cotovelo aponta
  function solve(S, W, pole) {
    _dir.subVectors(W, S);
    const dist = _dir.length();
    _dir.multiplyScalar(1 / Math.max(dist, 1e-4));
    const a = ARM.upper, b = ARM.fore;
    const L = THREE.MathUtils.clamp(dist, Math.abs(a - b) + 0.01, a + b - 0.004);
    const x = (a * a - b * b + L * L) / (2 * L);
    const h = Math.sqrt(Math.max(a * a - x * x, 0));
    _pp.copy(pole).addScaledVector(_dir, -pole.dot(_dir));
    if (_pp.lengthSq() < 1e-6) _pp.set(0, -1, 0);
    _pp.normalize();
    _e.copy(S).addScaledVector(_dir, x).addScaledVector(_pp, h);
    place(upper, S, _e);
    place(fore, _e, W);
    elbow.position.copy(_e);
    // manga da camisa cobrindo o ombro e punho enfaixado
    _d.subVectors(_e, S).multiplyScalar(0.55).add(S);
    place(sleeve, S, _d);
    _d.subVectors(W, _e).normalize();
    cuff.position.copy(W).addScaledVector(_d, -0.03);
    cuff.quaternion.setFromUnitVectors(_y, _d);
  }
  return { root, solve };
}

// ---------- armas ----------
function muzzleFlash() {
  const g = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({
    color: 0xffd27a, transparent: true, opacity: 0.95, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
  const star = new THREE.Shape();
  const n = 8;
  for (let i = 0; i < n * 2; i++) {
    const r = i % 2 ? 0.018 : 0.07;
    const a = (i / (n * 2)) * Math.PI * 2;
    i ? star.lineTo(Math.cos(a) * r, Math.sin(a) * r) : star.moveTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  const geo = new THREE.ShapeGeometry(star);
  const a = new THREE.Mesh(geo, mat);
  const b = new THREE.Mesh(geo, mat);
  b.rotation.y = Math.PI / 2;
  const cone = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.14, 6, 1, true), mat);
  cone.rotation.x = -Math.PI / 2; cone.position.z = -0.07;
  add(g, a, b, cone);
  g.visible = false;
  return g;
}

const SPECS = {};

// Gatilho + guarda-mato (todas as armas de fogo).
function trigger(g, z = 0.0, y = -0.04) {
  const guard = new THREE.Mesh(new THREE.TorusGeometry(0.022, 0.004, 6, 16, Math.PI), MAT.black);
  guard.rotation.set(0, Math.PI / 2, Math.PI); guard.position.set(0, y + 0.004, z);
  const tr = box(0.006, 0.022, 0.006, MAT.steel, 0, y + 0.004, z + 0.004); tr.rotation.x = 0.35;
  add(g, guard, tr);
}
// Fita adesiva enrolada (anéis levemente tortos).
function tape(g, z, r, n = 3, along = 0.022) {
  for (let i = 0; i < n; i++) {
    const t = cylZ(r, r, along, MAT.tape, 0, 0, z - i * along * 0.9, 16);
    t.rotation.z = (i % 2 ? 0.08 : -0.06); add(g, t);
  }
}

// ----- corpo a corpo -----
SPECS.tabua_prego = () => {
  const g = new THREE.Group();
  add(g, box(0.09, 0.026, 0.64, MAT.woodLight, 0, 0, -0.22));
  add(g, box(0.07, 0.02, 0.1, MAT.wood, 0.012, 0.004, -0.56)); // ponta lascada
  add(g, box(0.095, 0.034, 0.13, MAT.wrap, 0, 0, 0.02));       // pano na empunhadura
  add(g, box(0.097, 0.036, 0.012, MAT.cloth, 0, 0, -0.045));
  for (const [x, z, bend] of [[-0.022, -0.4, 0], [0.02, -0.42, 0.3], [-0.01, -0.5, -0.25], [0.024, -0.52, 0.1], [0.0, -0.33, -0.15]]) {
    const nail = cylY(0.005, 0.075, MAT.iron, x, 0.04, z, 6); nail.rotation.z = bend; add(g, nail);
    add(g, cylY(0.011, 0.005, MAT.iron, x, 0.016, z, 8));
  }
  for (const [x, z, r] of [[-0.03, -0.6, 0.3], [0.025, -0.59, -0.2]]) { // lascas na ponta quebrada
    const sh = new THREE.Mesh(new THREE.ConeGeometry(0.012, 0.06, 4), MAT.woodLight);
    sh.rotation.set(-Math.PI / 2, 0, r); sh.position.set(x, 0.0, z); add(g, sh);
  }
  add(g, box(0.092, 0.03, 0.03, MAT.tape, 0, 0, -0.12)); // remendo de fita
  return {
    group: g, type: 'melee', muzzle: null, swing: ['overhead', 'slashB'],
    hold: { p: [0.22, -0.1, -0.4], r: [0.85, 0.3, -0.12] },
    gripR: { p: [0, 0, 0.02], r: [0, 1.55, -0.55], c: 0.95 },
  };
};

SPECS.cano = () => {
  const g = new THREE.Group();
  add(g, cylZ(0.024, 0.024, 0.66, MAT.iron, 0, 0, -0.25, 9));
  add(g, cylZ(0.04, 0.04, 0.028, MAT.rust, 0, 0, -0.56, 9));
  add(g, cylZ(0.03, 0.03, 0.02, MAT.rust, 0, 0, -0.3, 9));
  tape(g, 0.1, 0.029, 6, 0.024);
  add(g, cylZ(0.031, 0.031, 0.012, MAT.strap, 0, 0, -0.04, 9));
  const tee = cylY(0.032, 0.11, MAT.rust, 0, 0, -0.6); add(g, tee);       // conexão em T na ponta
  for (const yy of [-0.055, 0.055]) add(g, cylY(0.036, 0.016, MAT.iron, 0, yy, -0.6));
  return {
    group: g, type: 'melee', muzzle: null, swing: ['slashA', 'slashB'],
    hold: { p: [0.22, -0.1, -0.4], r: [0.8, 0.25, -0.1] },
    gripR: { p: [0, 0, 0.04], r: [0, 1.55, -0.55], c: 0.95 },
  };
};

SPECS.faca_manteiga = () => {
  const g = new THREE.Group();
  // lâmina larga e arredondada, bem de "faca de manteiga"
  add(g, profile([[0, 0.014], [0.14, 0.016], [0.185, 0.011], [0.205, 0], [0.185, -0.012], [0.0, -0.015]], 0.004, MAT.steel, 0, 0, -0.01));
  add(g, cylZ(0.013, 0.016, 0.115, MAT.steel, 0, 0, 0.05, 8));
  add(g, box(0.03, 0.024, 0.02, MAT.steel, 0, 0, -0.006));
  return {
    group: g, type: 'melee', muzzle: null, swing: ['stab', 'slashShort'],
    hold: { p: [0.22, -0.1, -0.4], r: [0.55, 0.28, -0.1] },
    gripR: { p: [0, 0, 0.05], r: [0, 1.55, -0.55], c: 0.9 },
  };
};

SPECS.bastao = () => {
  const g = new THREE.Group();
  add(g, cylZ(0.042, 0.024, 0.66, MAT.wood, 0, 0, -0.26, 16)); // taco: grosso na ponta
  add(g, new THREE.Mesh(new THREE.SphereGeometry(0.042, 16, 10), MAT.wood).translateZ(-0.59));
  tape(g, 0.12, 0.028, 6, 0.026);
  for (const [z, a] of [[-0.45, 0.6], [-0.38, 2.4]]) { const sc = box(0.002, 0.03, 0.05, MAT.woodDark, Math.cos(a) * 0.035, Math.sin(a) * 0.035, z); sc.rotation.z = a; add(g, sc); }
  add(g, cylZ(0.034, 0.034, 0.012, MAT.black, 0, 0, 0.13, 9));
  add(g, cylZ(0.029, 0.029, 0.02, MAT.woodDark, 0, 0, -0.57, 9));
  return {
    group: g, type: 'melee', muzzle: null, swing: ['slashA', 'slashB'],
    hold: { p: [0.22, -0.1, -0.4], r: [0.8, 0.25, -0.1] },
    gripR: { p: [0, 0, 0.04], r: [0, 1.55, -0.55], c: 0.95 },
  };
};

SPECS.facao = () => {
  const g = new THREE.Group();
  add(g, profile([[0, 0.03], [0.30, 0.032], [0.42, 0.042], [0.5, 0.03], [0.51, 0.008], [0.44, -0.028], [0.2, -0.03], [0, -0.028]], 0.008, MAT.steel, 0, 0, -0.03));
  add(g, box(0.0105, 0.007, 0.34, MAT.iron, 0, 0.012, -0.22)); // canal
  add(g, cylZ(0.017, 0.02, 0.125, MAT.black, 0, -0.002, 0.06, 7));
  add(g, box(0.026, 0.036, 0.02, MAT.black, 0, 0, 0.13));
  add(g, box(0.034, 0.012, 0.016, MAT.brass, 0, 0.012, -0.034));
  for (const z of [0.03, 0.08]) add(g, box(0.026, 0.008, 0.008, MAT.brass, 0, 0.0, z));
  return {
    group: g, type: 'melee', muzzle: null, swing: ['slashA', 'slashB', 'stab'],
    hold: { p: [0.22, -0.1, -0.4], r: [0.75, 0.28, -0.1] },
    gripR: { p: [0, 0, 0.035], r: [0, 1.55, -0.55], c: 0.95 },
  };
};

// ----- armas de fogo -----
SPECS.revolver = () => {
  const g = new THREE.Group();
  const frame = profile([
    [0.06, 0.064], [-0.05, 0.064], [-0.075, 0.045], [-0.105, 0.0], [-0.125, -0.05], [-0.115, -0.14],
    [-0.055, -0.14], [-0.04, -0.06], [-0.02, -0.035], [0.012, -0.03], [0.02, -0.045], [0.0, -0.05],
    [0.04, -0.05], [0.06, -0.01],
  ], 0.026, MAT.blued);
  add(g, frame);
  // placas de madeira da empunhadura
  add(g, profile([[-0.07, -0.015], [-0.11, -0.04], [-0.12, -0.05], [-0.112, -0.135], [-0.058, -0.135], [-0.045, -0.07]], 0.036, MAT.wood));
  const drum = cylZ(0.034, 0.034, 0.06, MAT.iron, 0, 0.032, -0.02, 6);
  for (let i = 0; i < 6; i++) { // estrias do tambor
    const a = i / 6 * Math.PI * 2 + Math.PI / 6, fl = box(0.008, 0.008, 0.05, MAT.black, Math.cos(a) * 0.031, Math.sin(a) * 0.031, 0);
    fl.rotation.z = a; drum.add(fl);
  }
  add(g, drum);
  add(g, cylZ(0.005, 0.005, 0.13, MAT.steel, 0, 0.018, -0.12, 8)); // vareta do extrator
  trigger(g, 0.0, -0.045);
  add(g, cylZ(0.015, 0.015, 0.2, MAT.blued, 0, 0.046, -0.15, 8));
  add(g, box(0.014, 0.012, 0.2, MAT.black, 0, 0.066, -0.15));
  add(g, box(0.008, 0.014, 0.01, MAT.black, 0, 0.075, -0.235)); // massa de mira
  add(g, box(0.014, 0.014, 0.02, MAT.black, 0, 0.073, 0.052));  // alça
  const hammer = box(0.012, 0.03, 0.02, MAT.iron, 0, 0.075, 0.07); hammer.rotation.x = -0.5;
  add(g, hammer);
  const muzzle = new THREE.Vector3(0, 0.046, -0.255);
  return {
    group: g, type: 'pistol', reload: 'revolver', muzzle, sightY: 0.074, adsDist: 0.38, adsFov: 62, flash: 1.1,
    hold: { p: [0.17, -0.11, -0.46], r: [0.08, 0.06, 0] },
    gripR: { p: [0, -0.08, 0.085], r: [0, 0, -1.55], c: 0.9, idx: 0.3, th: [-0.35, -0.2, 0.2] },
    gripL: { p: [0, -0.115, 0.085], r: [0, 0, 1.55], c: 0.85, th: [-0.2, 0.0, 0.2] },
    magPoint: [0, -0.02, -0.02],
    parts: { drum },
  };
};

SPECS.pistola = () => {
  const g = new THREE.Group();
  add(g, profile([
    [0.09, 0.02], [-0.09, 0.02], [-0.095, -0.012], [-0.075, -0.015], [-0.095, -0.135], [-0.035, -0.135],
    [-0.012, -0.045], [0.015, -0.035], [0.05, -0.036], [0.058, -0.012], [0.09, -0.012],
  ], 0.03, MAT.black));
  // ferrolho (slide) com serrilha, janela de ejeção e mira
  const slide = new THREE.Group();
  add(slide, box(0.032, 0.036, 0.2, MAT.blued, 0, 0.04, 0));
  for (let i = 0; i < 5; i++) add(slide, box(0.034, 0.03, 0.004, MAT.black, 0, 0.04, 0.09 - i * 0.012));
  add(slide, box(0.01, 0.01, 0.014, MAT.black, 0, 0.063, 0.087));   // alça
  add(slide, box(0.006, 0.012, 0.01, MAT.black, 0, 0.063, -0.092));  // massa
  add(slide, box(0.002, 0.016, 0.05, MAT.brass, 0.017, 0.044, -0.02)); // janela de ejeção
  g.add(slide);
  for (let i = 0; i < 4; i++) add(g, box(0.034, 0.006, 0.008, MAT.black, 0, -0.016, -0.045 - i * 0.012)); // trilho
  trigger(g, 0.02, -0.04);
  // carregador (desce pelo punho)
  const mag = new THREE.Group();
  add(mag, box(0.024, 0.1, 0.05, MAT.iron, 0, -0.085, -0.045));
  add(mag, box(0.028, 0.012, 0.056, MAT.black, 0, -0.14, -0.045));
  mag.rotation.x = -0.1;
  g.add(mag);
  const muzzle = new THREE.Vector3(0, 0.04, -0.105);
  return {
    group: g, type: 'pistol', reload: 'mag', muzzle, sightY: 0.066, adsDist: 0.38, adsFov: 62, flash: 1.0,
    eject: new THREE.Vector3(0.02, 0.045, -0.02),
    hold: { p: [0.16, -0.1, -0.46], r: [0.08, 0.05, 0] },
    gripR: { p: [0, -0.065, 0.065], r: [0, 0, -1.55], c: 0.9, idx: 0.3, th: [-0.35, -0.2, 0.2] },
    gripL: { p: [0, -0.108, 0.065], r: [0, 0, 1.55], c: 0.85, th: [-0.2, 0.0, 0.2] },
    magPoint: [0, -0.1, -0.045],
    parts: { slide, mag },
  };
};

SPECS.escopeta = () => {
  const g = new THREE.Group();
  add(g, box(0.048, 0.08, 0.22, MAT.black, 0, 0.012, -0.03));                  // caixa da culatra
  add(g, box(0.052, 0.012, 0.1, MAT.iron, 0, 0.056, -0.04));
  add(g, cylZ(0.019, 0.019, 0.6, MAT.blued, 0, 0.04, -0.4, 9));                 // cano
  add(g, cylZ(0.016, 0.016, 0.46, MAT.black, 0, 0.0, -0.34, 8));                // tubo do carregador
  add(g, box(0.012, 0.01, 0.55, MAT.black, 0, 0.066, -0.37));                   // alça de mira (rib)
  add(g, box(0.008, 0.016, 0.008, MAT.brass, 0, 0.074, -0.68));                 // massa
  add(g, cylZ(0.022, 0.022, 0.012, MAT.black, 0, 0.0, -0.64, 8));
  const pump = new THREE.Group();
  add(pump, box(0.058, 0.05, 0.2, MAT.wood, 0, 0.0, -0.3));
  for (let i = 0; i < 6; i++) add(pump, box(0.06, 0.054, 0.006, MAT.woodDark, 0, 0.0, -0.22 - i * 0.03));
  g.add(pump);
  add(g, profile([[0.0, 0.05], [-0.1, 0.05], [-0.22, 0.042], [-0.26, -0.06], [-0.2, -0.06], [-0.14, -0.03],
    [-0.1, -0.12], [-0.045, -0.12], [-0.03, -0.03], [0.02, -0.03]], 0.05, MAT.wood));
  for (let i = 0; i < 4; i++) { // cartuchos presos na coronha
    const sh = cylY(0.0095, 0.045, MAT.red2, 0.03, -0.015, 0.1 + i * 0.024); add(g, sh);
    add(g, cylY(0.0098, 0.012, MAT.brass, 0.03, -0.042, 0.1 + i * 0.024));
  }
  trigger(g, 0.0, -0.04);
  const muzzle = new THREE.Vector3(0, 0.04, -0.7);
  return {
    group: g, type: 'long', reload: 'shotgun', muzzle, sightY: 0.075, adsDist: 0.42, adsFov: 60, flash: 1.6,
    eject: new THREE.Vector3(0.026, 0.03, -0.02),
    hold: { p: [0.15, -0.12, -0.46], r: [0.03, 0.09, 0] },
    gripR: { p: [0, -0.075, 0.07], r: [0, 0, -1.55], c: 0.9, idx: 0.3, th: [-0.35, -0.2, 0.2] },
    gripL: { p: [0, -0.005, -0.3], r: [0, -1.5708, 3.1416], c: 0.8, th: [0.3, -0.3, 0.2] },
    magPoint: [0.0, -0.045, -0.06],
    parts: { pump },
  };
};

SPECS.rifle = () => {
  const g = new THREE.Group();
  add(g, box(0.05, 0.09, 0.3, MAT.black, 0, 0.015, -0.04));                     // receptor
  add(g, box(0.052, 0.014, 0.28, MAT.blued, 0, 0.066, -0.03));                  // tampa
  add(g, box(0.056, 0.062, 0.3, MAT.woodDark, 0, 0.005, -0.34));                // guarda-mão
  add(g, box(0.058, 0.014, 0.3, MAT.black, 0, 0.044, -0.34));
  add(g, cylZ(0.0115, 0.0115, 0.42, MAT.blued, 0, 0.034, -0.66, 8));             // cano
  add(g, box(0.02, 0.016, 0.04, MAT.black, 0, 0.034, -0.88));                   // quebra-chamas
  for (const z of [-0.87, -0.89]) add(g, box(0.026, 0.004, 0.004, MAT.iron, 0, 0.034, z));
  for (let i = 0; i < 5; i++) add(g, box(0.022, 0.006, 0.01, MAT.black, 0, 0.076, -0.12 - i * 0.03)); // trilho superior
  trigger(g, 0.0, -0.04);
  add(g, box(0.008, 0.03, 0.008, MAT.black, 0, 0.066, -0.82));                  // massa
  add(g, box(0.02, 0.016, 0.014, MAT.black, 0, 0.082, 0.07));                   // alça
  add(g, profile([[0.0, 0.05], [-0.1, 0.05], [-0.22, 0.04], [-0.25, -0.05], [-0.2, -0.055], [-0.14, -0.03], [-0.08, -0.04]], 0.045, MAT.woodDark));
  add(g, profile([[-0.03, -0.01], [-0.085, -0.01], [-0.115, -0.125], [-0.06, -0.125]], 0.034, MAT.woodDark)); // punho
  const mag = new THREE.Group();
  const mb = box(0.034, 0.15, 0.06, MAT.iron, 0, -0.1, 0);
  mb.rotation.x = 0.18;
  add(mag, mb);
  mag.position.set(0, -0.015, -0.12);
  g.add(mag);
  const bolt = box(0.012, 0.016, 0.03, MAT.steel, 0.03, 0.038, -0.08); // manete do ferrolho
  g.add(bolt);
  const muzzle = new THREE.Vector3(0, 0.034, -0.9);
  return {
    group: g, type: 'long', reload: 'mag', muzzle, sightY: 0.09, adsDist: 0.42, adsFov: 54, flash: 1.3,
    eject: new THREE.Vector3(0.03, 0.045, -0.06),
    hold: { p: [0.15, -0.12, -0.46], r: [0.03, 0.09, 0] },
    gripR: { p: [0, -0.07, 0.075], r: [0, 0, -1.55], c: 0.9, idx: 0.3, th: [-0.35, -0.2, 0.2] },
    gripL: { p: [0, -0.002, -0.34], r: [0, -1.5708, 3.1416], c: 0.8, th: [0.3, -0.3, 0.2] },
    magPoint: [0, -0.1, -0.12],
    parts: { mag, bolt },
  };
};

SPECS.rifle_precisao = () => {
  const g = new THREE.Group();
  add(g, box(0.046, 0.075, 0.28, MAT.blued, 0, 0.012, -0.06));
  add(g, cylZ(0.0135, 0.0135, 0.78, MAT.black, 0, 0.034, -0.66, 9));
  add(g, cylZ(0.0195, 0.0195, 0.07, MAT.black, 0, 0.034, -1.02, 9));
  add(g, box(0.05, 0.05, 0.36, MAT.woodDark, 0, -0.006, -0.42));
  add(g, profile([[0.0, 0.05], [-0.1, 0.05], [-0.22, 0.04], [-0.25, -0.05], [-0.2, -0.055], [-0.14, -0.035], [-0.08, -0.04]], 0.046, MAT.woodDark));
  add(g, profile([[-0.03, -0.01], [-0.09, -0.01], [-0.12, -0.13], [-0.06, -0.125]], 0.034, MAT.woodDark));
  // luneta
  add(g, cylZ(0.021, 0.021, 0.3, MAT.black, 0, 0.098, -0.1, 12));
  add(g, cylZ(0.03, 0.025, 0.07, MAT.black, 0, 0.098, -0.27, 12));
  add(g, cylZ(0.026, 0.03, 0.06, MAT.black, 0, 0.098, 0.07, 12));
  add(g, cylZ(0.0285, 0.0285, 0.004, MAT.glass, 0, 0.098, -0.307, 12));
  add(g, box(0.02, 0.028, 0.012, MAT.black, 0, 0.06, -0.04));
  add(g, box(0.02, 0.028, 0.012, MAT.black, 0, 0.06, -0.2));
  const bolt = new THREE.Group();
  add(bolt, cylY(0.007, 0.05, MAT.steel, 0.045, 0.012, 0.03, 6).rotateZ(1.2));
  add(bolt, new THREE.Mesh(new THREE.SphereGeometry(0.013, 6, 5), MAT.black).translateX(0.075).translateY(-0.004).translateZ(0.03));
  g.add(bolt);
  for (const sd of [-1, 1]) { // bipé dobrado
    const leg = cylZ(0.005, 0.005, 0.2, MAT.black, sd * 0.02, -0.035, -0.5, 8); leg.rotation.y = sd * 0.05; add(g, leg);
    add(g, new THREE.Mesh(new THREE.SphereGeometry(0.008, 8, 6), MAT.black).translateX(sd * 0.02).translateY(-0.035).translateZ(-0.4));
  }
  trigger(g, 0.0, -0.04);
  const mag = new THREE.Group();
  add(mag, box(0.03, 0.05, 0.06, MAT.black, 0, -0.065, -0.06));
  g.add(mag);
  const muzzle = new THREE.Vector3(0, 0.034, -1.06);
  return {
    group: g, type: 'long', reload: 'mag', muzzle, sightY: 0.098, adsDist: 0.42, adsFov: 18, scope: true, flash: 1.5,
    eject: new THREE.Vector3(0.035, 0.04, -0.03),
    boltAction: true,
    hold: { p: [0.15, -0.13, -0.46], r: [0.03, 0.09, 0] },
    gripR: { p: [0, -0.07, 0.075], r: [0, 0, -1.55], c: 0.9, idx: 0.3, th: [-0.35, -0.2, 0.2] },
    gripL: { p: [0, -0.002, -0.42], r: [0, -1.5708, 3.1416], c: 0.8, th: [0.3, -0.3, 0.2] },
    magPoint: [0, -0.08, -0.06],
    parts: { mag, bolt },
  };
};

// Cria o modelo + metadados de uma arma. Retorna null para ids desconhecidos.
export function buildWeapon(id) {
  const make = SPECS[id];
  if (!make) return null;
  const spec = make();
  const flash = muzzleFlash();
  if (spec.muzzle) {
    flash.position.copy(spec.muzzle);
    spec.group.add(flash);
  }
  spec.flashMesh = flash;
  spec.id = id;
  return spec;
}

// ---------- itens de cura ----------
export function buildBandage() {
  const g = new THREE.Group();
  const roll = cylY(0.03, 0.05, MAT.wrap, 0, 0, 0, 10);
  roll.rotation.z = Math.PI / 2;
  g.add(roll);
  const stripe = cylY(0.0305, 0.012, MAT.red, 0, 0, 0, 10);
  stripe.rotation.z = Math.PI / 2;
  g.add(stripe);
  const tail = box(0.05, 0.002, 0.04, MAT.wrap, 0.0, -0.03, 0.025);
  tail.rotation.x = 0.4;
  g.add(tail);
  return g;
}
export function buildMedkit() {
  const g = new THREE.Group();
  g.add(box(0.16, 0.1, 0.06, MAT.white));
  g.add(box(0.168, 0.012, 0.064, MAT.red, 0, 0.0, 0));
  g.add(box(0.04, 0.012, 0.062, MAT.red, 0, 0.0, 0).translateY(0.02));
  const plus1 = box(0.05, 0.016, 0.004, MAT.red, 0, 0.0, 0.031);
  const plus2 = box(0.016, 0.05, 0.004, MAT.red, 0, 0.0, 0.031);
  g.add(plus1, plus2);
  g.add(box(0.05, 0.012, 0.05, MAT.iron, 0, 0.056, 0));
  return g;
}
export function buildShell(color = 0xb03a2e) {
  const g = new THREE.Group();
  const body = cylZ(0.0095, 0.0095, 0.045, std(color, 0.7), 0, 0, 0, 8);
  g.add(body, cylZ(0.0098, 0.0098, 0.014, MAT.brass, 0, 0, 0.026, 8));
  return g;
}
export function buildCartridgeCase() {
  return cylZ(0.0045, 0.0045, 0.02, MAT.brass, 0, 0, 0, 6);
}
