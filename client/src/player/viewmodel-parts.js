// Peças visuais da 1ª pessoa: mãos articuladas, braços com IK de dois ossos e os modelos
// detalhados de cada arma. Tudo aqui vive na cena do viewmodel (só o jogador local vê).
//
// Convenção dos modelos de arma: origem perto da empunhadura, cano apontando para -Z,
// +Y para cima, +X para a direita do atirador.
import * as THREE from '../three.js';
import { woodTexture, woodBump, metalTexture, repeated } from '../world/textures.js';
import { gunModel } from './gunmodels.js';

const std = (color, roughness = 0.9, metalness = 0, extra = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness, metalness, ...extra });
// madeira com veios e relevo; metal com leve desgaste
const woodMat = (color) => std(color, 0.82, 0, { map: repeated(woodTexture(), 4), bumpMap: repeated(woodBump(), 4), bumpScale: 0.6 });
const metalMat = (color, roughness, metalness) => std(color, roughness, metalness, { map: repeated(metalTexture(), 3) });

export const MAT = {
  skin: std(0xb97251, 0.86),
  glove: new THREE.MeshPhysicalMaterial({ color: 0xd3202b, roughness: 0.38, clearcoat: 0.6, clearcoatRoughness: 0.35 }),
  tube: new THREE.MeshStandardMaterial({ color: 0x2b2220, roughness: 0.6 }),
  gloveSeam: new THREE.MeshStandardMaterial({ color: 0x821319, roughness: 0.7 }),
  rdGlass: new THREE.MeshStandardMaterial({ color: 0xbfe8ff, roughness: 0.02, metalness: 0.5, transparent: true, opacity: 0.06, depthWrite: false, side: THREE.DoubleSide }),
  rdCoat: new THREE.ShaderMaterial({ // tom azul/âmbar só nas bordas do vidro (como lente com tratamento)
    transparent: true, depthWrite: false,
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'varying vec2 vUv; void main() { vec2 q = abs(vUv - 0.5) * 2.0; float e = smoothstep(0.72, 1.0, max(q.x, q.y)); gl_FragColor = vec4(mix(vec3(0.35, 0.75, 1.0), vec3(1.0, 0.7, 0.3), vUv.y), e * 0.22); }',
  }),
  rdDot: new THREE.MeshBasicMaterial({ color: 0xff2414, toneMapped: false, depthTest: false, depthWrite: false, transparent: true }),
  rdGlow: new THREE.MeshBasicMaterial({ color: 0xff3a20, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthTest: false, depthWrite: false, toneMapped: false }),
  rdHalo: new THREE.MeshBasicMaterial({ color: 0xff4a2a, transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthTest: false, depthWrite: false, toneMapped: false }),
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

// Mão enluvada da pílula: formato humano, mas gordinha e arredondada (luva de desenho animado),
// na cor das luvas escolhidas. Mesma articulação da mão antiga: origem no punho, dedos para -Z,
// palma para -Y, polegar em -X (mão direita); setPose(c, t) dobra dedos e polegar.
const GLOVE_FINGERS = [
  { x: -0.03, len: [0.036, 0.026, 0.022], r: 0.0148 },
  { x: -0.0095, len: [0.04, 0.028, 0.022], r: 0.0152 },
  { x: 0.011, len: [0.037, 0.026, 0.02], r: 0.0148 },
  { x: 0.031, len: [0.03, 0.021, 0.018], r: 0.0138 },
];
const roundZ = (r, len, mat) => {
  const g = new THREE.CapsuleGeometry(r, Math.max(0.001, len - r * 2), 6, 14);
  g.rotateX(Math.PI / 2); g.translate(0, 0, -len / 2);
  return new THREE.Mesh(g, mat);
};
export function buildHand(mirror = false) {
  const root = new THREE.Group();
  const inner = new THREE.Group();
  if (mirror) inner.scale.x = -1;
  root.add(inner);
  // palma = esfera achatada (dorso redondo), base dos dedos e o punho da luva
  const palm = new THREE.Mesh(new THREE.SphereGeometry(0.05, 24, 16), MAT.glove);
  palm.scale.set(1.0, 0.52, 1.0); palm.position.set(0, 0.002, -0.05);
  const knuckles = new THREE.Mesh(new THREE.CapsuleGeometry(0.017, 0.06, 6, 14), MAT.glove);
  knuckles.rotation.z = Math.PI / 2; knuckles.position.set(0, 0.0, -0.088);
  const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.046, 0.042, 22), MAT.glove);
  cuff.rotation.x = Math.PI / 2; cuff.position.z = 0.004;
  const roll = new THREE.Mesh(new THREE.TorusGeometry(0.044, 0.009, 8, 24), MAT.glove); roll.position.z = 0.026;
  for (const x of [-0.016, 0, 0.016]) { // costuras no dorso
    const seam = new THREE.Mesh(new THREE.CapsuleGeometry(0.0022, 0.03, 2, 6), MAT.gloveSeam);
    seam.rotation.x = Math.PI / 2; seam.position.set(x, 0.026, -0.05); inner.add(seam);
  }
  add(inner, palm, knuckles, cuff, roll);
  const fingers = GLOVE_FINGERS.map((f) => {
    const base = new THREE.Group(); base.position.set(f.x, -0.002, -0.09);
    base.add(roundZ(f.r, f.len[0], MAT.glove));
    const j2 = new THREE.Group(); j2.position.z = -f.len[0]; base.add(j2);
    j2.add(roundZ(f.r * 0.97, f.len[1], MAT.glove));
    const j3 = new THREE.Group(); j3.position.z = -f.len[1]; j2.add(j3);
    j3.add(roundZ(f.r * 0.95, f.len[2], MAT.glove));
    inner.add(base);
    return { base, j2, j3 };
  });
  const tBase = new THREE.Group(); tBase.position.set(-0.042, -0.006, -0.035);
  tBase.add(roundZ(0.0165, 0.042, MAT.glove));
  const tJ = new THREE.Group(); tJ.position.z = -0.042; tBase.add(tJ);
  tJ.add(roundZ(0.0155, 0.032, MAT.glove));
  inner.add(tBase);
  const setPose = (c, t) => {
    for (let i = 0; i < 4; i++) {
      const k = c[i], f = fingers[i];
      f.base.rotation.x = -k * 1.2; f.j2.rotation.x = -k * 1.4; f.j3.rotation.x = -k * 0.9;
    }
    tBase.rotation.set(t[1], t[0], 0); tJ.rotation.x = -t[2];
  };
  setPose([0.3, 0.3, 0.3, 0.3], [0.5, -0.2, 0.3]);
  return { root, setPose };
}

// Cor da luva (vem da personalização da pílula).
export function setGloveColor(hex) {
  MAT.glove.color.setHex(hex);
  MAT.gloveSeam.color.setHex(hex).multiplyScalar(0.62); // costura um tom mais escuro
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
  // bracinhos de tubo da pílula (finos e escuros); manga e punho somem dentro da luva
  const upper = limb(0.019, 0.019, MAT.tube, 12);
  const fore = limb(0.018, 0.019, MAT.tube, 12);
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
// Mira red dot estilo "mini reflex" de FPS moderno: janela larga e baixa com moldura fina,
// vidro quase transparente (leve tom azulado nas bordas) e um ponto nítido com brilho suave que
// é desenhado sempre por cima — na mira o ponto fica no centro da tela e a cena aparece limpa.
// Retorna a altura do ponto (sightY).
const RD = { w: 0.046, h: 0.036, wall: 0.0032, depth: 0.03, riser: 0.017 };
function roundRect(shape, w, h, r) {
  const x = -w / 2, y = -h / 2;
  shape.moveTo(x + r, y); shape.lineTo(x + w - r, y); shape.quadraticCurveTo(x + w, y, x + w, y + r);
  shape.lineTo(x + w, y + h - r); shape.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  shape.lineTo(x + r, y + h); shape.quadraticCurveTo(x, y + h, x, y + h - r);
  shape.lineTo(x, y + r); shape.quadraticCurveTo(x, y, x + r, y);
  return shape;
}
function redDot(g, y0, z) {
  const { w, h, wall, depth, riser } = RD, cy = y0 + riser + h / 2 + wall;
  add(g, box(0.024, 0.008, 0.05, MAT.black, 0, y0 + 0.004, z + 0.004));                  // trava no trilho
  add(g, box(w * 0.7, riser, depth * 0.9, MAT.black, 0, y0 + riser / 2 + 0.004, z));     // riser (sobe a mira acima do corpo)
  add(g, box(0.007, 0.007, 0.016, MAT.black, w / 2 + 0.002, y0 + riser * 0.6, z + 0.01)); // alavanca da trava
  const outer = roundRect(new THREE.Shape(), w + wall * 2, h + wall * 2, 0.009);
  outer.holes.push(roundRect(new THREE.Path(), w, h, 0.007));
  const hoodGeo = new THREE.ExtrudeGeometry(outer, { depth, bevelEnabled: false, curveSegments: 6 });
  hoodGeo.translate(0, 0, -depth / 2);
  const hood = new THREE.Mesh(hoodGeo, MAT.black); hood.position.set(0, cy, z); add(g, hood);
  add(g, box(0.008, 0.006, 0.012, MAT.black, w * 0.32, cy + h / 2 + wall + 0.002, z + 0.006)); // botões de brilho
  add(g, box(0.008, 0.006, 0.012, MAT.black, -w * 0.32, cy + h / 2 + wall + 0.002, z + 0.006));
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(w, h), MAT.rdGlass); glass.position.set(0, cy, z - depth / 2 + 0.002); add(g, glass);
  const coat = new THREE.Mesh(new THREE.PlaneGeometry(w, h), MAT.rdCoat); coat.position.set(0, cy, z - depth / 2 + 0.0025); add(g, coat);
  // ponto + brilho, sempre visíveis (sem teste de profundidade)
  for (const [r, mat] of [[0.0036, MAT.rdHalo], [0.0016, MAT.rdGlow], [0.00068, MAT.rdDot]]) {
    const m = new THREE.Mesh(new THREE.CircleGeometry(r, 20), mat);
    m.position.set(0, cy, z - depth / 2 + 0.003); m.renderOrder = 20; add(g, m);
  }
  return cy;
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
  const rdY = redDot(g, 0.074, 0.005);
  const muzzle = new THREE.Vector3(0, 0.046, -0.255);
  return {
    group: g, type: 'pistol', reload: 'revolver', muzzle, sightY: rdY, adsDist: 0.27, adsFov: 64, flash: 1.1,
    hold: { p: [0.17, -0.11, -0.46], r: [0.08, 0.06, 0] },
    gripR: { p: [0, -0.08, 0.085], r: [0, 0, -1.55], c: 0.9, idx: 0.3, th: [-0.35, -0.2, 0.2] },
    gripL: { p: [0, -0.115, 0.085], r: [0, 0, 1.55], c: 0.85, th: [-0.2, 0.0, 0.2] },
    magPoint: [0, -0.02, -0.02],
    parts: { drum },
  };
};

const proceduralPistola = () => {
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
  const rdY = redDot(slide, 0.058, 0.03); // red dot preso no ferrolho (recua junto)
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
    group: g, type: 'pistol', reload: 'mag', muzzle, sightY: rdY, adsDist: 0.27, adsFov: 64, flash: 1.0,
    eject: new THREE.Vector3(0.02, 0.045, -0.02),
    hold: { p: [0.16, -0.1, -0.46], r: [0.08, 0.05, 0] },
    gripR: { p: [0, -0.065, 0.065], r: [0, 0, -1.55], c: 0.9, idx: 0.3, th: [-0.35, -0.2, 0.2] },
    gripL: { p: [0, -0.108, 0.065], r: [0, 0, 1.55], c: 0.85, th: [-0.2, 0.0, 0.2] },
    magPoint: [0, -0.1, -0.045],
    parts: { slide, mag },
  };
};

// Pistola com o modelo 3D importado (Tripo, otimizado e pintado). Enquanto o GLB não carrega,
// usa a procedural. O ferrolho é uma malha separada (recua no tiro) e leva a red dot junto.
SPECS.pistola = () => {
  const m = gunModel('pistola');
  if (!m) return proceduralPistola();
  const g = new THREE.Group(), slide = new THREE.Group();
  g.add(m.group);
  // o nó do GLB vem com escala/deslocamento da quantização: o ferrolho vai dentro de um grupo
  // "limpo", que é o que recua no tiro e onde a red dot é presa
  const node = m.parts.ferrolho;
  if (node) { node.parent.add(slide); slide.add(node); }
  const rdY = redDot(slide, 0.056, 0.012);
  trigger(g, 0.02, -0.035);
  const mag = new THREE.Group(); // carregador escondido dentro do punho (aparece na recarga)
  add(mag, box(0.026, 0.1, 0.045, MAT.iron, 0, -0.06, 0.06));
  add(mag, box(0.03, 0.012, 0.05, MAT.black, 0, -0.112, 0.06));
  g.add(mag);
  const muzzle = new THREE.Vector3(0, 0.03, -0.25);
  return {
    group: g, type: 'pistol', reload: 'mag', muzzle, sightY: rdY, adsDist: 0.27, adsFov: 64, flash: 1.1,
    eject: new THREE.Vector3(0.03, 0.04, 0.0),
    hold: { p: [0.15, -0.1, -0.44], r: [0.08, 0.05, 0] },
    gripR: { p: [0, -0.06, 0.075], r: [0, 0, -1.55], c: 0.9, idx: 0.3, th: [-0.35, -0.2, 0.2] },
    gripL: { p: [0, -0.1, 0.075], r: [0, 0, 1.55], c: 0.85, th: [-0.2, 0.0, 0.2] },
    magPoint: [0, -0.1, 0.06],
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
  const rdY = redDot(g, 0.062, -0.05);
  const muzzle = new THREE.Vector3(0, 0.04, -0.7);
  return {
    group: g, type: 'long', reload: 'shotgun', muzzle, sightY: rdY, adsDist: 0.2, adsFov: 62, flash: 1.6,
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
  const rdY = redDot(g, 0.079, -0.17);
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
    group: g, type: 'long', reload: 'mag', muzzle, sightY: rdY, adsDist: 0.1, adsFov: 58, flash: 1.3,
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

// ----- ferramentas -----
SPECS.martelo = () => {
  const g = new THREE.Group();
  add(g, cylZ(0.016, 0.02, 0.36, MAT.woodLight, 0, 0, -0.12, 12));   // cabo
  tape(g, 0.05, 0.021, 3, 0.022);                                       // empunhadura
  add(g, box(0.042, 0.05, 0.046, MAT.iron, 0, 0, -0.32));              // cabeça
  add(g, cylY(0.024, 0.05, MAT.steel, 0, 0.045, -0.32, 14));           // face de bater
  add(g, cylY(0.027, 0.008, MAT.steel, 0, 0.072, -0.32, 14));
  for (const x of [-0.009, 0.009]) {                                    // unha (tira prego)
    const c = box(0.011, 0.075, 0.02, MAT.iron, x, -0.055, -0.312); c.rotation.x = 0.45; add(g, c);
  }
  add(g, box(0.003, 0.03, 0.02, MAT.black, 0, -0.07, -0.3));           // fenda da unha
  return {
    group: g, type: 'melee', muzzle: null, swing: ['overhead', 'overhead'],
    hold: { p: [0.22, -0.1, -0.4], r: [0.8, 0.25, -0.1] },
    gripR: { p: [0, 0, 0.04], r: [0, 1.55, -0.55], c: 0.95 },
  };
};

SPECS.banjo = () => {
  const g = new THREE.Group(), b = new THREE.Group();
  add(b, cylZ(0.13, 0.13, 0.05, MAT.woodDark, 0, 0, 0, 28));           // aro
  add(b, cylZ(0.137, 0.137, 0.02, MAT.wood, 0, 0, -0.034, 28));        // ressonador
  const head = new THREE.Mesh(new THREE.CircleGeometry(0.122, 32), MAT.white); head.position.z = 0.026; add(b, head);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.125, 0.006, 6, 32), MAT.brass); ring.position.z = 0.027; add(b, ring);
  for (let i = 0; i < 16; i++) {                                         // ganchos de tensão
    const a = (i / 16) * Math.PI * 2;
    add(b, box(0.008, 0.008, 0.05, MAT.steel, Math.cos(a) * 0.134, Math.sin(a) * 0.134, 0.004));
  }
  add(b, box(0.5, 0.026, 0.022, MAT.wood, -0.37, 0, 0.02));            // braço
  add(b, box(0.5, 0.024, 0.005, MAT.woodDark, -0.37, 0, 0.033));       // escala
  for (let i = 1; i < 12; i++) add(b, box(0.002, 0.026, 0.002, MAT.steel, -0.13 - i * 0.04 + i * i * 0.0006, 0, 0.037)); // trastes
  add(b, box(0.1, 0.045, 0.016, MAT.woodDark, -0.67, 0.004, 0.02));    // mão (cabeça) do banjo
  for (const [x, y] of [[-0.64, 0.028], [-0.69, 0.028], [-0.64, -0.022], [-0.69, -0.022], [-0.36, -0.02]]) add(b, cylY(0.006, 0.022, MAT.steel, x, y, 0.02, 8)); // tarraxas
  for (let i = 0; i < 5; i++) {                                         // 5 cordas
    const len = i === 4 ? 0.48 : 0.76, x0 = 0.1, cx = x0 - len / 2;
    add(b, box(len, 0.0012, 0.0012, MAT.steel, cx, -0.01 + i * 0.005, 0.04));
  }
  add(b, box(0.008, 0.03, 0.01, MAT.woodLight, 0.04, 0.0, 0.034));     // cavalete
  add(b, box(0.05, 0.02, 0.006, MAT.brass, 0.11, 0, 0.03));            // estandarte
  // a pele (+Z do modelo) fica virada para FRENTE, longe de quem toca: gira 180° no eixo do braço
  const flip = new THREE.Group(); flip.rotation.x = Math.PI;
  for (const c of [...b.children]) flip.add(c);
  b.add(flip);
  b.rotation.z = -0.7; b.scale.setScalar(0.8);                         // braço subindo para a esquerda
  add(g, b);
  return {
    group: g, type: 'melee', muzzle: null, swing: ['slashShort', 'slashShort'],
    hold: { p: [0.1, -0.21, -0.5], r: [0.2, 0.4, 0.05] }, // quase de lado: pele para frente, como quem olha o próprio banjo
    gripR: { p: [0.07, -0.07, -0.05], r: [0.4, 1.2, -1.1], c: 0.55 },
    gripL: { p: [-0.22, 0.19, -0.03], r: [0, -1.4, 2.6], c: 0.7, th: [0.3, -0.3, 0.2] },
  };
};

SPECS.gancho = () => {
  const g = new THREE.Group();
  add(g, cylZ(0.011, 0.012, 0.28, MAT.iron, 0, 0, -0.12, 10));          // haste
  const eye = new THREE.Mesh(new THREE.TorusGeometry(0.018, 0.005, 6, 14), MAT.iron); eye.position.z = 0.035; eye.rotation.y = Math.PI / 2; add(g, eye);
  for (let i = 0; i < 3; i++) {                                         // três garras curvas
    const arm = new THREE.Group(); arm.rotation.z = (i / 3) * Math.PI * 2; arm.position.z = -0.25;
    // garra curva: sai da ponta da haste, abre para fora e volta para trás (+Z)
    const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0, 0.01), new THREE.Vector3(0, 0.03, -0.025), new THREE.Vector3(0, 0.068, -0.01), new THREE.Vector3(0, 0.082, 0.035)]);
    arm.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 14, 0.0075, 6), MAT.steel));
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.0095, 0.028, 6), MAT.steel);
    tip.position.set(0, 0.08, 0.052); tip.rotation.x = Math.PI / 2 + 0.25; arm.add(tip);
    g.add(arm);
  }
  add(g, cylZ(0.016, 0.016, 0.02, MAT.iron, 0, 0, -0.26, 10));
  const coil = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.012, 6, 18), MAT.wrap); coil.position.set(0.03, -0.03, 0.06); coil.rotation.y = 0.4; add(g, coil);
  return {
    group: g, type: 'melee', muzzle: null, swing: ['slashShort', 'slashShort'],
    hold: { p: [0.2, -0.12, -0.38], r: [0.5, 0.25, -0.1] },
    gripR: { p: [0, 0, 0.0], r: [0, 1.55, -0.55], c: 0.95 },
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
