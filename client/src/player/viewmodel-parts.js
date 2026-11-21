// Peças visuais da 1ª pessoa: mãos articuladas, braços com IK de dois ossos e os modelos
// detalhados de cada arma. Tudo aqui vive na cena do viewmodel (só o jogador local vê).
//
// Convenção dos modelos de arma: origem perto da empunhadura, cano apontando para -Z,
// +Y para cima, +X para a direita do atirador.
import * as THREE from '../three.js';

const std = (color, roughness = 0.9, metalness = 0) =>
  new THREE.MeshStandardMaterial({ color, roughness, metalness, flatShading: true });

export const MAT = {
  skin: std(0xb97251, 0.86),
  skinDark: std(0x9c5b3e, 0.9),
  nail: std(0xd8b79c, 0.7),
  strap: std(0x583a28, 0.92),
  wrap: std(0xd0b99a, 0.97),
  cloth: std(0x8a7a5a, 0.98),
  wood: std(0x79552f, 0.95),
  woodDark: std(0x4c3525, 0.95),
  woodLight: std(0x9a7444, 0.95),
  steel: std(0xb4b8b6, 0.42, 0.55),
  iron: std(0x747b7e, 0.55, 0.4),
  black: std(0x2b2f33, 0.5, 0.35),
  blued: std(0x3a4046, 0.45, 0.45),
  rust: std(0x7a5238, 0.95, 0.1),
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
  const g = new THREE.CylinderGeometry(rBack, rFront, len, seg);
  g.rotateX(Math.PI / 2);
  const m = new THREE.Mesh(g, mat);
  m.position.set(x, y, z);
  return m;
};
const cylY = (r, len, mat, x = 0, y = 0, z = 0, seg = 8) => {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, seg), mat);
  m.position.set(x, y, z);
  return m;
};
// Silhueta lateral extrudada. pontos = [[frente, cima], ...]; espessura em X.
function profile(points, depth, mat, x = 0, y = 0, z = 0) {
  const shape = new THREE.Shape(points.map(([u, v]) => new THREE.Vector2(u, v)));
  const geo = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, steps: 1 });
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

// Origem da mão = punho. Dedos apontam para -Z, palma para -Y, polegar em -X (mão direita).
// A mão esquerda é a mesma malha espelhada em X.
export function buildHand(mirror = false) {
  const root = new THREE.Group();
  const inner = new THREE.Group();
  if (mirror) inner.scale.x = -1;
  root.add(inner);

  const palm = box(0.088, 0.03, 0.09, MAT.skin, 0, 0, -0.045);
  inner.add(palm);
  inner.add(box(0.08, 0.022, 0.03, MAT.skinDark, 0, -0.002, -0.095)); // base dos dedos
  inner.add(box(0.07, 0.012, 0.05, MAT.skin, 0, 0.018, -0.045));      // dorso levemente elevado

  const fingers = FINGERS.map((f) => {
    const base = new THREE.Group();
    base.position.set(f.x, -0.002, -0.09);
    const s1 = capsuleZ(f.r, f.len[0], MAT.skin);
    base.add(s1);
    const j2 = new THREE.Group(); j2.position.z = -f.len[0]; base.add(j2);
    j2.add(capsuleZ(f.r * 0.96, f.len[1], MAT.skin));
    const j3 = new THREE.Group(); j3.position.z = -f.len[1]; j2.add(j3);
    j3.add(capsuleZ(f.r * 0.9, f.len[2], MAT.skin));
    const tip = box(f.r * 1.2, f.r * 0.5, 0.008, MAT.nail, 0, f.r * 0.5, -f.len[2] + 0.004);
    j3.add(tip);
    inner.add(base);
    return { base, j2, j3 };
  });

  const tBase = new THREE.Group();
  tBase.position.set(-0.04, -0.004, -0.03);
  tBase.add(capsuleZ(0.0125, 0.045, MAT.skin));
  const tJ = new THREE.Group(); tJ.position.z = -0.045; tBase.add(tJ);
  tJ.add(capsuleZ(0.011, 0.034, MAT.skin));
  tJ.add(box(0.014, 0.006, 0.008, MAT.nail, 0, 0.009, -0.03));
  inner.add(tBase);

  // pose: { c: [ind, med, anel, mindinho] 0..1, t: [giro, inclinação, dobra] }
  const setPose = (c, t) => {
    for (let i = 0; i < 4; i++) {
      const k = c[i], f = fingers[i];
      f.base.rotation.x = -k * 1.2;
      f.j2.rotation.x = -k * 1.45;
      f.j3.rotation.x = -k * 0.95;
    }
    tBase.rotation.set(t[1], t[0], 0);
    tJ.rotation.x = -t[2];
  };
  setPose([0.3, 0.3, 0.3, 0.3], [0.5, -0.2, 0.3]);
  return { root, setPose };
}

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
  const upper = limb(0.040, 0.048, MAT.skin);
  const fore = limb(0.029, 0.040, MAT.skin);
  const elbow = new THREE.Mesh(new THREE.SphereGeometry(0.042, 8, 6), MAT.skin);
  const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.036, 0.05, 8), MAT.strap);
  const sleeve = limb(0.052, 0.058, MAT.cloth, 8);
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

// ----- corpo a corpo -----
SPECS.tabua_prego = () => {
  const g = new THREE.Group();
  add(g, box(0.09, 0.026, 0.64, MAT.woodLight, 0, 0, -0.22));
  add(g, box(0.07, 0.02, 0.1, MAT.wood, 0.012, 0.004, -0.56)); // ponta lascada
  add(g, box(0.095, 0.034, 0.13, MAT.wrap, 0, 0, 0.02));       // pano na empunhadura
  add(g, box(0.097, 0.036, 0.012, MAT.cloth, 0, 0, -0.045));
  for (const [x, z] of [[-0.022, -0.4], [0.02, -0.42], [-0.01, -0.5], [0.024, -0.52]]) {
    add(g, cylY(0.006, 0.075, MAT.iron, x, 0.04, z, 5));
    add(g, cylY(0.012, 0.006, MAT.iron, x, 0.016, z, 6));
  }
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
  add(g, cylZ(0.028, 0.028, 0.15, MAT.wrap, 0, 0, 0.04, 9));
  add(g, cylZ(0.031, 0.031, 0.012, MAT.strap, 0, 0, -0.04, 9));
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
  add(g, cylZ(0.026, 0.032, 0.66, MAT.wood, 0, 0, -0.26, 9));
  add(g, cylZ(0.035, 0.035, 0.17, MAT.strap, 0, 0, 0.04, 9));
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
  add(g, drum);
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
