// Acampamentos dos inimigos nas ilhas:
//   • cabana — casinha de tábuas com piso, porta, janelas com postigos, telhado de palha em "A"
//     com oitões, viga de cumeeira, lanterna, barris e caixotes na varanda;
//   • forte — paliçada de troncos pontudos com portão, duas torres de vigia na frente e uma
//     cabana encostada no fundo.
// As paredes são sólidas de verdade (colisão + raycast de tiro + linha de visão dos inimigos).
// Cada construção também registra "cômodos" com a porta, para os inimigos saberem sair/entrar.
import * as THREE from '../three.js';
import { rot } from '../core/util.js';
import { woodTexture, woodBump, repeated, logWallTexture, scaleBoxUVs } from './textures.js';

let MATS = null;
function mats(shared) {
  if (MATS) return MATS;
  const M = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.88, ...extra });
  MATS = {
    plank: M(0x9b7448, { map: repeated(woodTexture(), 0.6, 0.9), bumpMap: repeated(woodBump(), 0.6, 0.9), bumpScale: 1.4 }),
    plankDark: M(0x6e4f30, { map: repeated(woodTexture(), 0.6, 0.9), bumpMap: repeated(woodBump(), 0.6, 0.9), bumpScale: 1.4 }),
    floor: M(0x7d5a36, { map: repeated(woodTexture(), 1.2), bumpMap: repeated(woodBump(), 1.2), bumpScale: 1.2 }),
    log: M(0x7a5a3a, { map: repeated(logWallTexture(), 0.25, 1), bumpMap: repeated(logWallTexture(), 0.25, 1), bumpScale: 2 }),
    logEnd: M(0xb08a5c),
    thatch: shared.thatch,
    iron: shared.iron,
    rope: M(0xb59b6a),
    cloth: M(0x1b1b1f, { side: THREE.DoubleSide }),
    glow: new THREE.MeshStandardMaterial({ color: 0xffc46b, emissive: 0xffa040, emissiveIntensity: 2.2, roughness: 0.4 }),
    glass: new THREE.MeshStandardMaterial({ color: 0x3a2a12, roughness: 0.3, metalness: 0.4 }),
    sandbag: M(0xb3a073, { roughness: 0.95 }),
    sandbagDark: M(0x9a875c, { roughness: 0.95 }),
    concrete: M(0x9a9c97, { roughness: 0.95 }),
    concreteDark: M(0x6e706c, { roughness: 0.9 }),
    canvas: M(0x5f6b3e, { side: THREE.DoubleSide, roughness: 0.95 }),
    canvasTan: M(0x9c8a5e, { side: THREE.DoubleSide, roughness: 0.95 }),
    olive: M(0x4b5530, { roughness: 0.7 }),
    steel: new THREE.MeshStandardMaterial({ color: 0x6d757b, metalness: 0.6, roughness: 0.45 }),
    wire: new THREE.MeshStandardMaterial({ color: 0x8a8f93, metalness: 0.7, roughness: 0.4 }),
  };
  return MATS;
}

// materiais dos acampamentos novos (modelos de ilha)
let XM = null;
function canvasMap(draw, w = 64, h = 256) { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; return t; }
function extraMats() {
  if (XM) return XM;
  const M = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.85, ...extra });
  const E = (color, emissive, k = 2) => new THREE.MeshStandardMaterial({ color, emissive, emissiveIntensity: k, roughness: 0.4 });
  XM = {
    rock: M(0x7a7368, { flatShading: true, roughness: 0.95 }), rockDark: M(0x4f4b45, { flatShading: true, roughness: 0.95 }), rockPale: M(0xb9ae94, { flatShading: true, roughness: 0.95 }),
    dirt: M(0x7a6244, { roughness: 1 }), white: M(0xe6e7e2, { side: THREE.DoubleSide, roughness: 0.55 }), whiteCanvas: M(0xeeeeea, { side: THREE.DoubleSide, roughness: 0.95 }),
    concreteDS: M(0xa3a49e, { side: THREE.DoubleSide, roughness: 0.95 }),
    yellow: M(0xe8b828, { roughness: 0.6 }), orange: M(0xf07a22, { roughness: 0.8 }), black: M(0x0b0b0e, { roughness: 0.3, metalness: 0.4 }),
    redRoof: M(0xa8342a, { roughness: 0.7 }), bottle: M(0x2f6a34, { roughness: 0.2, metalness: 0.2 }), sailcloth: M(0xd9cfb3, { side: THREE.DoubleSide, roughness: 1 }),
    contRed: M(0x9a3b2a, { metalness: 0.4, roughness: 0.6 }), contBlue: M(0x2f5a86, { metalness: 0.4, roughness: 0.6 }), contGreen: M(0x3f6a3c, { metalness: 0.4, roughness: 0.6 }),
    heliOlive: M(0x55603a, { metalness: 0.3, roughness: 0.6 }), gunmetal: M(0x2c3034, { metalness: 0.7, roughness: 0.4 }), rubber: M(0x1d1d1f, { roughness: 0.9 }),
    brass: M(0xb08a3a, { metalness: 0.7, roughness: 0.35 }),
    glassDark: new THREE.MeshStandardMaterial({ color: 0x1a2a33, roughness: 0.1, metalness: 0.5 }),
    glass: new THREE.MeshStandardMaterial({ color: 0xbfe8ff, transparent: true, opacity: 0.28, roughness: 0.05, side: THREE.DoubleSide, depthWrite: false }),
    plastic: new THREE.MeshStandardMaterial({ color: 0xdfe8ea, transparent: true, opacity: 0.35, roughness: 0.2, side: THREE.DoubleSide, depthWrite: false }),
    glowG: E(0x9cff7a, 0x5cff3a, 2.4), glowGdim: E(0x7dff8a, 0x5cff3a, 0.6), glowB: E(0x9fe6ff, 0x3ab8ff, 2), glowR: E(0xff5a4a, 0xff2010, 3), glowY: E(0xffe08a, 0xffb040, 2.2),
    frozen: M(0x5a6a7a, { roughness: 0.6 }),
    liquidB: new THREE.MeshStandardMaterial({ color: 0x6ad8ff, emissive: 0x2a8ac0, emissiveIntensity: 1.1, transparent: true, opacity: 0.55, depthWrite: false }),
    liquidG: new THREE.MeshStandardMaterial({ color: 0x7dff7a, emissive: 0x2acc3a, emissiveIntensity: 1.6, transparent: true, opacity: 0.8 }),
    ufoHull: new THREE.MeshStandardMaterial({ color: 0xa8b0b8, metalness: 0.9, roughness: 0.25 }),
    ufoDome: new THREE.MeshStandardMaterial({ color: 0x8affc0, emissive: 0x2a8a5a, emissiveIntensity: 1, transparent: true, opacity: 0.7 }),
    scorch: new THREE.MeshBasicMaterial({ color: 0x1b1a17, transparent: true, opacity: 0.8, depthWrite: false }),
    cropRing: new THREE.MeshBasicMaterial({ color: 0x2c3322, transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide }),
    camo: new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, transparent: true, alphaTest: 0.4, roughness: 1, map: canvasMap((g, w, h) => {
      for (let i = 0; i < 260; i++) { g.fillStyle = ['#4b5530', '#5f6b3e', '#3b4026', '#7a7444'][i % 4]; g.beginPath(); g.arc(Math.random() * w, Math.random() * h, 4 + Math.random() * 10, 0, 6.3); g.fill(); }
    }, 128, 128) }),
    stripe: new THREE.MeshStandardMaterial({ roughness: 0.6, map: canvasMap((g, w, h) => { for (let i = 0; i < 6; i++) { g.fillStyle = i % 2 ? '#f1efe8' : '#c0392b'; g.fillRect(0, i * h / 6, w, h / 6); } }) }),
    helipad: new THREE.MeshStandardMaterial({ roughness: 0.9, map: canvasMap((g, w, h) => {
      g.fillStyle = '#5b5e5a'; g.fillRect(0, 0, w, h); g.strokeStyle = '#e8e3cf'; g.lineWidth = 10; g.beginPath(); g.arc(w / 2, h / 2, w * 0.4, 0, 6.3); g.stroke();
      g.fillStyle = '#e8e3cf'; g.fillRect(w * 0.33, h * 0.28, w * 0.08, h * 0.44); g.fillRect(w * 0.59, h * 0.28, w * 0.08, h * 0.44); g.fillRect(w * 0.33, h * 0.46, w * 0.34, h * 0.08);
    }, 256, 256) }),
  };
  return XM;
}

const boxGeo = (w, h, l) => scaleBoxUVs(new THREE.BoxGeometry(w, h, l), w, h, l);

// ctx: { group, set, addSolid(mesh), TOP, cx, cz, yaw, r, shared }
export function buildCamp(type, ctx) {
  const m = mats(ctx.shared), { group, set, TOP, r } = ctx;
  const rooms = [];
  // coordenadas locais do acampamento → locais da ilha
  const P = (lx, lz, yaw = ctx.yaw, ox = ctx.cx, oz = ctx.cz) => { const [x, z] = rot(lx, lz, yaw); return [ox + x, oz + z]; };
  // parede/peça sólida (visível, colide e bloqueia tiros/visão)
  const solid = (frame, lx, y0, lz, w, h, l, mat, extraYaw = 0) => {
    const [x, z] = P(lx, lz, frame.yaw, frame.x, frame.z), yaw = frame.yaw + extraYaw;
    const mesh = new THREE.Mesh(boxGeo(w, h, l), mat);
    mesh.position.set(x, TOP + y0 + h / 2, z); mesh.rotation.y = yaw; mesh.castShadow = mesh.receiveShadow = true;
    ctx.addSolid(mesh);
    set.items.push({ type: 'box', x, y: TOP + y0 + h / 2, z, hx: w / 2, hy: h / 2, hz: l / 2, yaw });
    return mesh;
  };
  // colisor invisível (a parte visível é decoração "assada" junto com o resto da ilha)
  const blocker = (frame, lx, y0, lz, w, h, l) => {
    const [x, z] = P(lx, lz, frame.yaw, frame.x, frame.z);
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, l), m.plank);
    mesh.position.set(x, TOP + y0 + h / 2, z); mesh.rotation.y = frame.yaw; mesh.visible = false;
    ctx.addSolid(mesh);
    set.items.push({ type: 'box', x, y: TOP + y0 + h / 2, z, hx: w / 2, hy: h / 2, hz: l / 2, yaw: frame.yaw });
  };
  const decor = (frame, mesh, lx, y, lz, extraYaw = 0) => {
    const [x, z] = P(lx, lz, frame.yaw, frame.x, frame.z);
    mesh.rotation.order = 'YXZ'; mesh.position.set(x, TOP + y, z); mesh.rotation.y += frame.yaw + extraYaw; mesh.castShadow = true;
    group.add(mesh); return mesh;
  };
  const cylY = (rad, h, mat, seg = 8) => new THREE.Mesh(new THREE.CylinderGeometry(rad * 0.92, rad, h, seg), mat);
  const barrel = (frame, lx, lz) => {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.86, 12), m.plankDark); body.position.y = 0.43;
    const bulge = new THREE.Mesh(new THREE.CylinderGeometry(0.335, 0.335, 0.42, 12), m.plankDark); bulge.position.y = 0.43;
    g.add(body, bulge);
    for (const y of [0.14, 0.72]) { const hoop = new THREE.Mesh(new THREE.CylinderGeometry(0.322, 0.322, 0.05, 12), m.iron); hoop.position.y = y; g.add(hoop); }
    decor(frame, g, lx, 0, lz, r() * 3);
    const [x, z] = P(lx, lz, frame.yaw, frame.x, frame.z);
    set.items.push({ type: 'cyl', x, y: TOP + 0.43, z, hx: 0.33, hy: 0.43, hz: 0.33 });
  };
  const crateStack = (frame, lx, lz) => {
    const n = 1 + ((r() * 2) | 0);
    for (let i = 0; i < n; i++) {
      const s = 0.55 - i * 0.08, c = new THREE.Mesh(boxGeo(s, s, s), m.plank);
      decor(frame, c, lx + (r() - 0.5) * 0.1, i * 0.55 + s / 2 - (i ? 0.02 : 0), lz + (r() - 0.5) * 0.1, r() * 0.6);
    }
    const [x, z] = P(lx, lz, frame.yaw, frame.x, frame.z);
    set.items.push({ type: 'box', x, y: TOP + 0.3, z, hx: 0.3, hy: 0.3, hz: 0.3, yaw: frame.yaw });
  };
  const lantern = (frame, lx, y, lz) => {
    const g = new THREE.Group();
    const cage = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, 0.2, 6), m.iron);
    const glow = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.06, 0.15, 6), m.glow);
    const cap = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.08, 6), m.iron); cap.position.y = 0.14;
    g.add(cage, glow, cap);
    decor(frame, g, lx, y, lz);
  };
  const flag = (frame, lx, lz, h, style = 'pirate') => { // pirate (caveira) | mil (estrela) | z51 (alienígena)
    const pole = cylY(0.05, h, style === 'pirate' ? m.log : m.steel, 6); decor(frame, pole, lx, h / 2, lz);
    const c = document.createElement('canvas'); c.width = 128; c.height = 80;
    const g = c.getContext('2d');
    if (style === 'mil') {
      g.fillStyle = '#4b5530'; g.fillRect(0, 0, 128, 80); g.fillStyle = '#e8c341'; g.beginPath();
      for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? 9 : 22; g.lineTo(64 + Math.cos(a) * rr, 40 + Math.sin(a) * rr); }
      g.fill();
    } else if (style === 'z51') {
      g.fillStyle = '#101418'; g.fillRect(0, 0, 128, 80); g.fillStyle = '#7dff8a'; g.beginPath(); g.ellipse(64, 38, 18, 24, 0, 0, 6.3); g.fill();
      g.fillStyle = '#101418'; g.beginPath(); g.ellipse(56, 36, 6, 9, 0.5, 0, 6.3); g.ellipse(72, 36, 6, 9, -0.5, 0, 6.3); g.fill();
    } else {
      g.fillStyle = '#141416'; g.fillRect(0, 0, 128, 80);
      g.fillStyle = '#eee'; g.beginPath(); g.arc(64, 32, 16, 0, 6.3); g.fill(); g.fillRect(55, 40, 18, 12);
      g.fillStyle = '#141416'; g.beginPath(); g.arc(58, 32, 4.5, 0, 6.3); g.arc(70, 32, 4.5, 0, 6.3); g.fill();
      g.strokeStyle = '#eee'; g.lineWidth = 6; g.beginPath(); g.moveTo(36, 56); g.lineTo(92, 74); g.moveTo(92, 56); g.lineTo(36, 74); g.stroke();
    }
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    const cloth = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.56, 6, 1), new THREE.MeshStandardMaterial({ map: tex, side: THREE.DoubleSide, roughness: 0.9 }));
    const pos = cloth.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) pos.setZ(i, Math.sin((pos.getX(i) + 0.45) * 5) * 0.05 * (pos.getX(i) + 0.45));
    cloth.geometry.computeVertexNormals();
    cloth.geometry.translate(0.45, 0, 0);
    decor(frame, cloth, lx + 0.05, h - 0.35, lz);
  };

  // ---------- cabana ----------
  // frame: { x, z, yaw } no espaço da ilha; a frente (porta) fica em +Z local.
  const cabin = (frame, W = 4.4, D = 3.6, H = 2.3) => {
    const T = 0.14, F = 0.18; // espessura das paredes e altura do piso
    // piso de tábuas sobre pilotis
    solid(frame, 0, 0, 0, W + 0.5, F, D + 0.5, m.floor);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) decor(frame, cylY(0.12, 0.3, m.log), sx * (W / 2 + 0.1), 0.05, sz * (D / 2 + 0.1));
    // degrau na porta
    solid(frame, 0, 0, D / 2 + 0.5, 1.3, 0.1, 0.45, m.plankDark);
    const wall = (x0, x1, y0, y1, z, side = false) => { // parede entre x0..x1 (ou z0..z1 nas laterais)
      const w = x1 - x0, h = y1 - y0;
      if (w <= 0.02 || h <= 0.02) return;
      if (side) solid(frame, z, F + y0, (x0 + x1) / 2, T, h, w, m.plank);
      else solid(frame, (x0 + x1) / 2, F + y0, z, w, h, T, m.plank);
    };
    const hw = W / 2, hd = D / 2;
    // frente: porta no meio (1,1 m) e janela à direita
    wall(-hw, -0.55, 0, H, hd); wall(-0.55, 0.55, 1.95, H, hd);
    wall(0.55, 0.95, 0, H, hd); wall(0.95, 1.65, 0, 0.95, hd); wall(0.95, 1.65, 1.6, H, hd); wall(1.65, hw, 0, H, hd);
    // fundos: inteiro
    wall(-hw, hw, 0, H, -hd);
    // laterais: janela no meio da esquerda; direita inteira
    wall(-hd, -0.4, 0, H, -hw, true); wall(-0.4, 0.4, 0, 0.95, -hw, true); wall(-0.4, 0.4, 1.6, H, -hw, true); wall(0.4, hd, 0, H, -hw, true);
    wall(-hd, hd, 0, H, hw, true);
    // postes dos cantos e travessas
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) decor(frame, cylY(0.11, H + 0.2, m.log), sx * (hw + 0.02), F + (H + 0.2) / 2, sz * (hd + 0.02));
    const beam = (len) => { const b = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, len, 7), m.log); b.rotation.z = Math.PI / 2; return b; };
    for (const sz of [-1, 1]) decor(frame, beam(W + 0.5), 0, F + H + 0.05, sz * (hd + 0.04));
    // telhado em "A" (cumeeira ao longo de X), com beiral
    const rise = 1.25, over = 0.45, ridgeY = F + H + rise;
    const run = hd + over, slope = Math.atan2(rise + 0.1, run), len = Math.hypot(run, rise + 0.1) + 0.1;
    for (const s of [-1, 1]) {
      const slab = new THREE.Mesh(boxGeo(W + 0.9, 0.16, len), m.thatch);
      slab.rotation.x = s * slope;
      decor(frame, slab, 0, ridgeY - (rise + 0.1) / 2 + 0.02, s * run / 2);
      // franja de palha na ponta do beiral
      const fringe = new THREE.Mesh(boxGeo(W + 0.92, 0.22, 0.12), m.thatch);
      decor(frame, fringe, 0, F + H - 0.14, s * (run - 0.02));
    }
    const ridge = beam(W + 1.1); decor(frame, ridge, 0, ridgeY + 0.08, 0);
    // oitões (triângulos de tábua nas pontas)
    const tri = new THREE.Shape([new THREE.Vector2(-hd, 0), new THREE.Vector2(hd, 0), new THREE.Vector2(0, rise)]);
    const gableGeo = new THREE.ExtrudeGeometry(tri, { depth: T, bevelEnabled: false });
    gableGeo.translate(0, 0, -T / 2); gableGeo.rotateY(Math.PI / 2);
    for (const sx of [-1, 1]) decor(frame, new THREE.Mesh(gableGeo, m.plank), sx * hw, F + H, 0);
    blocker(frame, 0, F + H, 0, W, rise * 0.6, D * 0.7); // o telhado também tapa a visão por cima
    // porta aberta (dobradiça à esquerda) e postigos das janelas
    const door = new THREE.Mesh(boxGeo(1.05, 1.9, 0.06), m.plankDark);
    door.geometry.translate(0.52, 0, 0);
    decor(frame, door, -0.55, F + 0.95, hd + 0.05, -1.9);
    for (const [lx, lz, ry] of [[0.95, hd + 0.06, -0.4], [1.65, hd + 0.06, 0.4]]) {
      const sh = new THREE.Mesh(boxGeo(0.36, 0.66, 0.04), m.plankDark); sh.geometry.translate(lx < 1.3 ? -0.18 : 0.18, 0, 0);
      decor(frame, sh, lx, F + 1.27, lz, ry);
    }
    const sh2 = new THREE.Mesh(boxGeo(0.04, 0.66, 0.8), m.plankDark); decor(frame, sh2, -hw - 0.1, F + 1.27, 0, 0.0);
    lantern(frame, 0.75, F + 2.0, hd + 0.12);
    // dentro: mesa, banquinho e rede
    solid(frame, -1.2, F, -0.9, 1.1, 0.75, 0.7, m.plankDark);
    decor(frame, cylY(0.18, 0.45, m.log), -0.35, F + 0.22, -0.9);
    const hammock = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 1.8, 10, 1, true, Math.PI * 0.6, Math.PI * 0.8), m.rope);
    hammock.rotation.z = Math.PI / 2; hammock.material.side = THREE.DoubleSide;
    decor(frame, hammock, 0.9, F + 1.45, -1.0);
    rooms.push({ ...roomOf(frame, hw, hd), door: [P(0, hd - 0.7, frame.yaw, frame.x, frame.z), P(0, hd + 1.1, frame.yaw, frame.x, frame.z)] });
    return { inside: P(0.6, -0.9, frame.yaw, frame.x, frame.z) };
  };
  const roomOf = (frame, hw, hd) => ({ x: frame.x, z: frame.z, yaw: frame.yaw, hw, hd });

  const out = { rooms, crateSpots: [], fire: null, yard: [ctx.cx, ctx.cz], spawns: [], ladders: [] };
  // ponto de posição de inimigo: [x, z] na ilha + altura (no alto de torre) e se é posto de atirador
  const spot = (frame, lx, lz, y = 0, high = false) => { const [x, z] = P(lx, lz, frame.yaw, frame.x, frame.z); out.spawns.push({ x, z, y, high }); };

  // ---------- peças das bases novas ----------
  // fileira de sacos de areia de (x0,z0) a (x1,z1), 'rows' camadas; colisor na altura da cobertura
  const sandbags = (frame, x0, z0, x1, z1, rows = 3) => {
    const len = Math.hypot(x1 - x0, z1 - z0), yaw = Math.atan2(x1 - x0, z1 - z0), n = Math.max(1, Math.round(len / 0.62));
    for (let row = 0; row < rows; row++) for (let i = 0; i < n - (row % 2 ? 1 : 0); i++) {
      const t = (i + 0.5 + (row % 2 ? 0.5 : 0)) / n, bag = new THREE.Mesh(new THREE.CapsuleGeometry(0.16, 0.36, 4, 8), (i + row) % 3 ? m.sandbag : m.sandbagDark);
      bag.rotation.z = Math.PI / 2; bag.scale.set(1, 1, 0.75);
      const g = new THREE.Group(); g.add(bag);
      decor(frame, g, x0 + (x1 - x0) * t, 0.15 + row * 0.27, z0 + (z1 - z0) * t, yaw + Math.PI / 2 + (r() - 0.5) * 0.1);
    }
    const [cx, cz] = P((x0 + x1) / 2, (z0 + z1) / 2, frame.yaw, frame.x, frame.z);
    const blockMesh = new THREE.Mesh(new THREE.BoxGeometry(0.5, rows * 0.27 + 0.1, len), m.sandbag); blockMesh.visible = false;
    const h = rows * 0.27 + 0.1; blockMesh.position.set(cx, TOP + h / 2, cz); blockMesh.rotation.y = frame.yaw + yaw; ctx.addSolid(blockMesh);
    set.items.push({ type: 'box', x: cx, y: TOP + h / 2, z: cz, hx: 0.25, hy: h / 2, hz: len / 2, yaw: frame.yaw + yaw });
  };
  // torre de vigia com plataforma onde dá para ficar em pé (colisores), parapeito e teto
  // dir = lado da escada (+1 frente / -1 fundo do acampamento); a escada sobe de verdade (W) e o
  // parapeito tem uma abertura desse lado para entrar na plataforma
  const watchTower = (frame, lx, lz, H = 4.2, mat = m.log, roofMat = m.thatch, wide = 1.0, dir = 1) => {
    for (const ox of [-wide, wide]) for (const oz of [-wide, wide]) {
      decor(frame, cylY(0.1, H + 0.2, mat, 7), lx + ox, (H + 0.2) / 2, lz + oz);
      const [x, z] = P(lx + ox, lz + oz, frame.yaw, frame.x, frame.z); set.items.push({ type: 'cyl', x, y: TOP + H / 2, z, hx: 0.12, hy: H / 2, hz: 0.12 });
    }
    for (const y of [H * 0.35, H * 0.7]) for (const [ax, az, len, ry] of [[0, -wide, 2 * wide, Math.PI / 2], [0, wide, 2 * wide, Math.PI / 2], [-wide, 0, 2 * wide, 0], [wide, 0, 2 * wide, 0]]) {
      const b = new THREE.Mesh(boxGeo(0.08, 0.1, len), mat); decor(frame, b, lx + ax, y, lz + az, ry);
    }
    solid(frame, lx, H, lz, 2 * wide + 0.5, 0.14, 2 * wide + 0.5, m.floor);
    for (const [ox, oz, w, l] of [[0, -dir * (wide + 0.22), 2 * wide + 0.5, 0.08], [wide + 0.22, 0, 0.08, 2 * wide + 0.5], [-wide - 0.22, 0, 0.08, 2 * wide + 0.5]]) {
      solid(frame, lx + ox, H + 0.14, lz + oz, w, 0.8, l, m.plank);
    }
    const seg = (2 * wide + 0.5 - 0.75) / 2; // lado da escada: dois pedaços com vão no meio
    for (const sx of [-1, 1]) solid(frame, lx + sx * (0.375 + seg / 2), H + 0.14, lz + dir * (wide + 0.22), seg, 0.8, 0.08, m.plank);
    for (const ox of [-wide - 0.2, wide + 0.2]) for (const oz of [-wide - 0.2, wide + 0.2]) decor(frame, cylY(0.06, 1.5, mat, 6), lx + ox, H + 0.85, lz + oz);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(wide * 1.75, 0.9, 4), roofMat); roof.rotation.y = Math.PI / 4; decor(frame, roof, lx, H + 2.0, lz);
    const ladder = new THREE.Group();
    for (const x2 of [-0.22, 0.22]) { const rail = new THREE.Mesh(boxGeo(0.07, H + 0.4, 0.07), mat); rail.position.x = x2; ladder.add(rail); }
    for (let i = 0; i < Math.floor(H / 0.42); i++) { const rung = new THREE.Mesh(boxGeo(0.44, 0.05, 0.05), mat); rung.position.y = -H / 2 + 0.3 + i * 0.42; ladder.add(rung); }
    ladder.rotation.x = -0.18 * dir; decor(frame, ladder, lx, H / 2, lz + dir * (wide + 0.55));
    { const [x, z] = P(lx, lz + dir * (wide + 0.45), frame.yaw, frame.x, frame.z); out.ladders.push({ x, z, top: H + 0.14, yaw: frame.yaw, dir }); }
    spot(frame, lx, lz, H + 0.2, true);
  };
  // barraca (lona em A) com colisor baixo
  const tent = (frame, lx, lz, yawOff = 0, mat = m.canvas, L = 3, W = 2.2, H = 1.7) => {
    const g = new THREE.Group();
    // prisma de lona (triângulo W × H estendido ao longo de L) com a entrada escura na frente
    const tri = new THREE.Shape([new THREE.Vector2(-W / 2, 0), new THREE.Vector2(W / 2, 0), new THREE.Vector2(0, H)]);
    const body = new THREE.Mesh(new THREE.ExtrudeGeometry(tri, { depth: L, bevelEnabled: false }), mat); body.position.z = -L / 2; g.add(body);
    const door = new THREE.Mesh(new THREE.ShapeGeometry(new THREE.Shape([new THREE.Vector2(-W * 0.22, 0), new THREE.Vector2(W * 0.22, 0), new THREE.Vector2(0, H * 0.7)])), new THREE.MeshBasicMaterial({ color: 0x1a1a14 }));
    door.position.z = L / 2 + 0.01; g.add(door);
    for (const s2 of [-1, 1]) { const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 1.4, 4), m.rope); rope.position.set(s2 * (W / 2 + 0.35), 0.45, L / 2 - 0.2); rope.rotation.z = s2 * 0.9; g.add(rope); }
    const pole = cylY(0.04, L + 0.2, m.log, 6); pole.rotation.x = Math.PI / 2; pole.position.y = H; g.add(pole);
    g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    decor(frame, g, lx, 0, lz, yawOff);
    const [x, z] = P(lx, lz, frame.yaw, frame.x, frame.z);
    set.items.push({ type: 'box', x, y: TOP + 0.5, z, hx: W / 2 - 0.2, hy: 0.5, hz: L / 2 - 0.4, yaw: frame.yaw + yawOff });
    spot(frame, lx + Math.sin(yawOff) * (L / 2 + 0.8), lz + Math.cos(yawOff) * (L / 2 + 0.8));
  };
  // prédio de concreto: porta na frente (+Z), janelas nas laterais, laje com borda; registra cômodo
  const concrete = (frame, W, D, H = 2.6) => {
    const T = 0.22, hw = W / 2, hd = D / 2;
    const wall = (x0, x1, y0, y1, z, side) => { const w = x1 - x0, h = y1 - y0; if (w < 0.05 || h < 0.05) return;
      if (side) solid(frame, z, y0, (x0 + x1) / 2, T, h, w, m.concrete); else solid(frame, (x0 + x1) / 2, y0, z, w, h, T, m.concrete); };
    wall(-hw, -0.55, 0, H, hd); wall(0.55, hw, 0, H, hd); wall(-0.55, 0.55, 2.05, H, hd);
    wall(-hw, hw, 0, H, -hd);
    for (const sx of [-1, 1]) { wall(-hd, -0.5, 0, H, sx * hw, true); wall(0.5, hd, 0, H, sx * hw, true); wall(-0.5, 0.5, 0, 1.2, sx * hw, true); wall(-0.5, 0.5, 1.75, H, sx * hw, true); }
    solid(frame, 0, H, 0, W + 0.3, 0.2, D + 0.3, m.concreteDark);
    for (const [ox, oz, w, l] of [[0, hd + 0.1, W + 0.3, 0.12], [0, -hd - 0.1, W + 0.3, 0.12], [hw + 0.1, 0, 0.12, D + 0.3], [-hw - 0.1, 0, 0.12, D + 0.3]]) decor(frame, new THREE.Mesh(boxGeo(w, 0.25, l), m.concreteDark), ox, H + 0.32, oz);
    const doorG = new THREE.Mesh(boxGeo(1.05, 2.0, 0.06), m.steel); doorG.geometry.translate(0.52, 0, 0); decor(frame, doorG, -0.55, 1.0, hd + 0.13, -1.6);
    const [rx, rz] = P(0, 0, frame.yaw, frame.x, frame.z);
    rooms.push({ x: rx, z: rz, yaw: frame.yaw, hw, hd, door: [P(0, hd - 0.7, frame.yaw, frame.x, frame.z), P(0, hd + 1.2, frame.yaw, frame.x, frame.z)] });
    for (const sx of [-1, 1]) spot(frame, sx * hw * 0.45, -hd * 0.3);
    return { inside: P(hw * 0.5, -hd * 0.5, frame.yaw, frame.x, frame.z) };
  };
  const ammoCrate = (frame, lx, lz) => { const c = new THREE.Mesh(boxGeo(0.9, 0.45, 0.5), m.olive); decor(frame, c, lx, 0.225, lz, r() * 0.6);
    const [x, z] = P(lx, lz, frame.yaw, frame.x, frame.z); set.items.push({ type: 'box', x, y: TOP + 0.22, z, hx: 0.45, hy: 0.23, hz: 0.25, yaw: frame.yaw }); };
  const barbed = (frame, x0, z0, x1, z1) => { // arame farpado (decoração, sem colisão)
    const pts = [], len = Math.hypot(x1 - x0, z1 - z0), n = Math.round(len * 8);
    for (let i = 0; i <= n; i++) { const t = i / n, a = t * len * 7; pts.push(new THREE.Vector3(Math.cos(a) * 0.25, 0.3 + Math.sin(a) * 0.25, 0).add(new THREE.Vector3(0, 0, 0))); pts[i].x += 0; pts[i].z = t * len; }
    const g = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), n * 2, 0.012, 4), m.wire);
    decor(frame, g, x0, 0, z0, Math.atan2(x1 - x0, z1 - z0));
  };
  // ---------- peças dos acampamentos novos (modelos de ilha) ----------
  const X = extraMats();
  const sub = (lx, lz, yo = 0) => { const [x, z] = P(lx, lz); return { x, z, yaw: ctx.yaw + yo }; };
  // parede reta de (x0,z0) a (x1,z1) no frame
  const seg = (frame, x0, z0, x1, z1, h, mat, T = 0.22, y0 = 0) => solid(frame, (x0 + x1) / 2, y0, (z0 + z1) / 2, T, h, Math.hypot(x1 - x0, z1 - z0), mat, Math.atan2(x1 - x0, z1 - z0));
  const cylSolid = (frame, lx, lz, rad, h, mat, y0 = 0, n = 14) => {
    decor(frame, new THREE.Mesh(new THREE.CylinderGeometry(rad, rad, h, n), mat), lx, y0 + h / 2, lz);
    const [x, z] = P(lx, lz, frame.yaw, frame.x, frame.z); set.items.push({ type: 'cyl', x, y: TOP + y0 + h / 2, z, hx: rad, hy: h / 2, hz: rad });
  };
  const hidden = (frame, lx, y0, lz, w, h, l, extraYaw = 0) => { solid(frame, lx, y0, lz, w, h, l, m.steel, extraYaw).visible = false; };
  const boulder = (frame, lx, lz, s, mat = X.rock) => {
    const g = new THREE.Mesh(new THREE.DodecahedronGeometry(s, 1), mat); g.scale.set(1, 0.72, 0.9);
    decor(frame, g, lx, s * 0.42, lz, r() * 3); g.rotation.x = (r() - 0.5) * 0.5;
    const [x, z] = P(lx, lz, frame.yaw, frame.x, frame.z); set.items.push({ type: 'cyl', x, y: TOP + s * 0.55, z, hx: s * 0.85, hy: s * 0.55, hz: s * 0.85 });
  };
  // contêiner de carga: aberto na frente (+Z) vira um cômodo
  const container = (frame, L = 6, W = 2.4, H = 2.5, mat = X.contRed, open = true) => {
    const T = 0.1, hw = W / 2, hl = L / 2;
    for (const sx of [-1, 1]) solid(frame, sx * (hw - T / 2), 0, 0, T, H, L, mat);
    solid(frame, 0, 0, -hl + T / 2, W, H, T, mat);
    solid(frame, 0, H, 0, W + 0.06, 0.12, L + 0.06, mat);
    for (const sx of [-1, 1]) for (let i = 0; i <= Math.floor((L - 0.3) / 0.6); i++) decor(frame, new THREE.Mesh(boxGeo(0.06, H - 0.12, 0.14), mat), sx * (hw + 0.02), H / 2, -hl + 0.15 + i * 0.6);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) decor(frame, new THREE.Mesh(boxGeo(0.14, H + 0.12, 0.14), m.steel), sx * hw, H / 2, sz * hl);
    if (!open) { solid(frame, 0, 0, hl - T / 2, W, H, T, mat); return null; }
    for (const sx of [-1, 1]) { const d = new THREE.Mesh(boxGeo(hw, H - 0.12, 0.06), mat); d.geometry.translate(-sx * hw / 2, 0, 0); decor(frame, d, sx * hw, H / 2, hl + 0.04, sx * 1.95); }
    rooms.push({ ...roomOf(frame, hw, hl), door: [P(0, hl - 0.8, frame.yaw, frame.x, frame.z), P(0, hl + 1.3, frame.yaw, frame.x, frame.z)] });
    spot(frame, 0, -hl + 0.8);
    return { inside: P(0, -hl * 0.4, frame.yaw, frame.x, frame.z) };
  };
  // antena parabólica sobre pedestal (tilt inclina a boca para +Z do frame)
  const dish = (frame, lx, lz, R = 2, tilt = 0.9, face = 0) => {
    cylSolid(frame, lx, lz, 0.35, 1.6, m.concrete);
    const g = new THREE.Group();
    const geo = new THREE.SphereGeometry(R, 22, 8, 0, Math.PI * 2, 0, 0.75); geo.rotateX(Math.PI); geo.translate(0, R, 0);
    g.add(new THREE.Mesh(geo, X.white));
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, R * 0.62, 5), m.steel); rod.position.y = R * 0.31; g.add(rod);
    const horn = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.25, 8), m.steel); horn.position.y = R * 0.62; horn.rotation.x = Math.PI; g.add(horn);
    g.rotation.x = tilt; decor(frame, g, lx, 1.7, lz, face);
  };
  const ufo = (frame, lx, y, lz, s = 1, rz = 0.32, ry = 0.6) => {
    const g = new THREE.Group();
    const disc = new THREE.Mesh(new THREE.SphereGeometry(2.4, 28, 12), X.ufoHull); disc.scale.y = 0.22; g.add(disc);
    const dome = new THREE.Mesh(new THREE.SphereGeometry(0.95, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), X.ufoDome); dome.position.y = 0.4; g.add(dome);
    for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2, l = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 6), i % 2 ? X.glowG : X.glowGdim); l.position.set(Math.cos(a) * 2.25, -0.05, Math.sin(a) * 2.25); g.add(l); }
    g.scale.setScalar(s); g.rotation.z = rz; g.rotation.x = -0.12; decor(frame, g, lx, y, lz, ry);
  };
  const floodlight = (frame, lx, lz, h = 3.6, toward = 0) => {
    decor(frame, cylY(0.07, h, m.steel, 6), lx, h / 2, lz);
    const lamp = new THREE.Mesh(boxGeo(0.6, 0.32, 0.3), X.glowY); lamp.rotation.x = 0.5; decor(frame, lamp, lx, h, lz, toward);
  };
  const sign = (frame, lx, lz, mat = X.yellow) => {
    decor(frame, cylY(0.04, 1.4, m.steel, 5), lx, 0.7, lz);
    const s = new THREE.Mesh(new THREE.CircleGeometry(0.4, 3), mat); s.rotation.z = Math.PI / 2; s.material.side = THREE.DoubleSide; decor(frame, s, lx, 1.6, lz);
  };
  const drum = (frame, lx, lz, mat = X.contRed, glow = null) => {
    cylSolid(frame, lx, lz, 0.3, 0.88, mat, 0, 12);
    if (glow) decor(frame, new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.03, 12), glow), lx, 0.9, lz);
  };
  const jeep = (frame, lx, lz, yo = 0, mat = m.olive) => {
    const g = new THREE.Group();
    const body = new THREE.Mesh(boxGeo(1.6, 0.7, 3.0), mat); body.position.y = 0.75; g.add(body);
    const hood = new THREE.Mesh(boxGeo(1.5, 0.25, 1.0), mat); hood.position.set(0, 1.2, 1.0); g.add(hood);
    const shield = new THREE.Mesh(boxGeo(1.5, 0.55, 0.05), X.glassDark); shield.position.set(0, 1.45, 0.45); shield.rotation.x = -0.25; g.add(shield);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) { const w = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.28, 14), X.rubber); w.rotation.z = Math.PI / 2; w.position.set(sx * 0.82, 0.36, sz * 1.0); g.add(w); }
    const spare = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.22, 14), X.rubber); spare.rotation.x = Math.PI / 2; spare.position.set(0, 0.95, -1.62); g.add(spare);
    decor(frame, g, lx, 0, lz, yo);
    hidden(frame, lx, 0, lz, 1.7, 1.3, 3.2, yo);
  };
  const site = { x: ctx.cx, z: ctx.cz, yaw: ctx.yaw };
  if (type === 'hut') {
    // cabana atrás, fogueira no pátio da frente
    const [hx, hz] = P(0, -2.2);
    const c = cabin({ x: hx, z: hz, yaw: ctx.yaw });
    out.crateSpots.push(c.inside);
    barrel(site, 2.6, -0.4); barrel(site, 2.9, 0.25); crateStack(site, -2.7, -0.2);
    flag(site, -2.9, 0.9, 3.4);
    out.yard = P(0, 1.6); out.fire = out.yard;
    spot(site, -0.8, -2.6); spot(site, 1.2, 1.9); spot(site, -1.6, 1.4); spot(site, 2.2, 0.8);
  } else if (type === 'tendas') {
    // acampamento de barracas em volta da fogueira
    for (let i = 0; i < 4; i++) { const a = i / 4 * Math.PI * 2 + 0.4; tent(site, Math.sin(a) * 4, Math.cos(a) * 4, a + Math.PI, i % 2 ? m.canvas : m.canvasTan); }
    crateStack(site, 1.6, 1.4); barrel(site, -1.7, -1.3); flag(site, 0, -2.2, 3.2);
    out.crateSpots.push(P(-1.4, 1.6)); out.yard = P(0, 0); out.fire = P(0, 0);
    spot(site, 1.2, -0.4); spot(site, -1.1, 0.6);
  } else if (type === 'vigia') {
    // posto de vigia: duas torres altas com atiradores e uma barraca de apoio
    watchTower(site, -3, -1.2, 4.6); watchTower(site, 3, 1.2, 4.2);
    tent(site, 0.5, -3.2, 0.3, m.canvasTan);
    crateStack(site, -0.6, 1.8); barrel(site, 1.6, -1.2);
    out.crateSpots.push(P(0.4, 1.4)); out.yard = P(0, 0.3); out.fire = P(0.2, 0.5);
    spot(site, -1.2, 0.2); spot(site, 1.0, 2.4);
  } else if (type === 'bunker') {
    // posto com anel de sacos de areia (abertura na frente) e bunker de concreto no fundo
    const RR = 5;
    for (let i = 0; i < 9; i++) {
      const a0 = (i / 10) * Math.PI * 2 + Math.PI / 10, a1 = ((i + 1) / 10) * Math.PI * 2 + Math.PI / 10;
      sandbags(site, Math.sin(a0) * RR, Math.cos(a0) * RR, Math.sin(a1) * RR, Math.cos(a1) * RR, 3);
    }
    const b = concrete({ x: P(0, -2.2)[0], z: P(0, -2.2)[1], yaw: ctx.yaw }, 3.4, 2.6, 2.3);
    out.crateSpots.push(b.inside);
    ammoCrate(site, 2.4, 1.2); ammoCrate(site, -2.6, 0.9); barrel(site, 2.9, -1.4);
    flag(site, -3.2, -1.4, 3.6);
    out.yard = P(0, 1.6); out.fire = P(0.2, 1.9);
    spot(site, -1.8, 2.4); spot(site, 1.8, 2.6); spot(site, 0, 3.6); spot(site, -3.3, 0); spot(site, 3.3, 0);
    rooms.push({ x: ctx.cx, z: ctx.cz, yaw: ctx.yaw, hw: RR * 0.9, hd: RR * 0.9, door: [P(0, RR - 1.2), P(0, RR + 1.4)], fort: true });
  } else if (type === 'lab') {
    // ZONA 51: laboratório secreto cercado — prédio de concreto com janelas verdes, radome, tanques de
    // contenção com líquido brilhando (e algo boiando dentro), um OVNI caído meio enterrado, placas de
    // aviso, holofotes e cerca de arame com portão.
    const S = 7.2, gate = 1.6;
    const steelM = m.steel, glowG = new THREE.MeshStandardMaterial({ color: 0x9cff7a, emissive: 0x5cff3a, emissiveIntensity: 2 });
    const wireM = new THREE.MeshStandardMaterial({ color: 0x9aa0a4, metalness: 0.7, roughness: 0.4, transparent: true, opacity: 0.45, side: THREE.DoubleSide, wireframe: true });
    const fence = (x0, z0, x1, z1) => {
      const len = Math.hypot(x1 - x0, z1 - z0), yaw = Math.atan2(x1 - x0, z1 - z0);
      const panel = new THREE.Mesh(new THREE.PlaneGeometry(len, 2.2, Math.round(len * 4), 9), wireM); panel.rotation.y = Math.PI / 2;
      const g2 = new THREE.Group(); g2.add(panel); decor(site, g2, (x0 + x1) / 2, 1.1, (z0 + z1) / 2, yaw);
      for (let i = 0; i <= Math.round(len / 2.4); i++) { const t = i / Math.round(len / 2.4); decor(site, cylY(0.05, 2.5, steelM, 6), x0 + (x1 - x0) * t, 1.25, z0 + (z1 - z0) * t); }
      blocker(site, (x0 + x1) / 2, 0, (z0 + z1) / 2, Math.abs(x1 - x0) + 0.1, 2.2, Math.abs(z1 - z0) + 0.1);
    };
    fence(-S, -S, S, -S); fence(-S, -S, -S, S); fence(S, -S, S, S); fence(-S, S, -gate, S); fence(gate, S, S, S);
    const lab = concrete({ x: P(0, -3.4)[0], z: P(0, -3.4)[1], yaw: ctx.yaw }, 6.4, 4.2, 3.0);
    out.crateSpots.push(lab.inside);
    for (const [lx, lz, ry] of [[-3.25, -3.4, Math.PI / 2], [3.25, -3.4, Math.PI / 2]]) decor(site, new THREE.Mesh(boxGeo(0.06, 0.6, 1.0), glowG), lx, 1.6, lz, ry); // janelas verdes
    decor(site, new THREE.Mesh(boxGeo(1.6, 0.4, 0.05), new THREE.MeshStandardMaterial({ color: 0xd8b04a, emissive: 0x5a4a10 })), 0, 2.6, -1.25); // placa "ÁREA RESTRITA"
    // radome pequeno
    { const base = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.15, 1.2, 18), m.concrete); decor(site, base, -5, 0.6, -4.6); solid(site, -5, 0, -4.6, 2.2, 1.2, 2.2, m.concrete);
      const dome = new THREE.Mesh(new THREE.IcosahedronGeometry(1.5, 2), new THREE.MeshStandardMaterial({ color: 0xf2f2ee, roughness: 0.55, flatShading: true })); decor(site, dome, -5, 2.4, -4.6); }
    // tanques de contenção com algo boiando
    for (const [lx, lz] of [[4.6, 2.6], [5.4, 0.4]]) {
      const glass = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 2.2, 18, 1, true), new THREE.MeshStandardMaterial({ color: 0xbfffd0, transparent: true, opacity: 0.25, roughness: 0.05, side: THREE.DoubleSide, depthWrite: false }));
      decor(site, glass, lx, 1.3, lz);
      decor(site, new THREE.Mesh(new THREE.CylinderGeometry(0.56, 0.56, 1.7, 18), new THREE.MeshStandardMaterial({ color: 0x5aff6a, emissive: 0x2aaa3a, emissiveIntensity: 1.2, transparent: true, opacity: 0.55, depthWrite: false })), lx, 1.1, lz);
      decor(site, new THREE.Mesh(new THREE.SphereGeometry(0.28, 12, 10), new THREE.MeshStandardMaterial({ color: 0x2a3a2a, roughness: 0.6 })), lx, 1.3, lz);
      for (const y of [0.15, 2.45]) decor(site, cylY(0.66, 0.2, steelM, 18), lx, y, lz);
      const [x, z] = P(lx, lz); set.items.push({ type: 'cyl', x, y: TOP + 1.25, z, hx: 0.66, hy: 1.25, hz: 0.66 });
    }
    // OVNI caído, meio enterrado e inclinado
    { const ufo = new THREE.Group();
      const disc = new THREE.Mesh(new THREE.SphereGeometry(2.4, 28, 12), new THREE.MeshStandardMaterial({ color: 0xa8b0b8, metalness: 0.9, roughness: 0.25 })); disc.scale.y = 0.22; ufo.add(disc);
      const dome = new THREE.Mesh(new THREE.SphereGeometry(0.95, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x8affc0, emissive: 0x2a8a5a, emissiveIntensity: 1, transparent: true, opacity: 0.7 })); dome.position.y = 0.4; ufo.add(dome);
      for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2, l = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 6), new THREE.MeshStandardMaterial({ color: 0x7dff8a, emissive: 0x5cff3a, emissiveIntensity: i % 2 ? 3 : 0.6 })); l.position.set(Math.cos(a) * 2.25, -0.05, Math.sin(a) * 2.25); ufo.add(l); }
      ufo.rotation.z = 0.32; ufo.rotation.x = -0.12; decor(site, ufo, -3.6, 0.35, 3.4, 0.6);
      solid(site, -3.6, 0, 3.4, 3.2, 1.1, 3.2, m.concreteDark, 0.6).visible = false;
      for (let i = 0; i < 6; i++) { const ch = new THREE.Mesh(boxGeo(0.4 + r() * 0.4, 0.15, 0.3), m.concreteDark); decor(site, ch, -3.6 + (r() - 0.5) * 5, 0.07, 3.4 + (r() - 0.5) * 5, r() * 3); } // terra revirada
    }
    // placas de aviso e holofotes
    for (const [lx, lz] of [[-2.4, S - 0.2], [2.4, S - 0.2], [S - 0.2, -2]]) {
      const sign = new THREE.Mesh(new THREE.CircleGeometry(0.4, 3), new THREE.MeshStandardMaterial({ color: 0xf2c230, side: THREE.DoubleSide })); sign.rotation.z = Math.PI / 2;
      decor(site, cylY(0.04, 1.4, steelM, 5), lx, 0.7, lz); decor(site, sign, lx, 1.6, lz);
    }
    for (const [lx, lz] of [[-S + 0.4, -S + 0.4], [S - 0.4, S - 0.4]]) { decor(site, cylY(0.07, 4, steelM, 6), lx, 2, lz); decor(site, new THREE.Mesh(boxGeo(0.6, 0.3, 0.3), glowG), lx, 4, lz); }
    out.yard = P(0, 3); out.fire = P(1.6, 4.6);
    for (const [x, z] of [[-1.5, 1.5], [2.2, 2.4], [-5, 0.5], [5, -2.6], [0, 5], [-2.4, -5.2]]) spot(site, x, z);
    rooms.push({ ...roomOf(site, S, S), door: [P(0, S - 1.2), P(0, S + 1.4)], fort: true });
  } else if (type === 'militar') {
    // BASE MILITAR: prédio de concreto fechado de 2 andares (16 × 12 m) com garagem (jipe e portão
    // largo), saguão com escada até o 1º andar, arsenal e alojamento no térreo; corredor e cinco
    // salas em cima. Pátio na frente com sacos de areia, caixas de munição e a bandeira.
    // Inimigos ficam espalhados pelas salas (os de cima ficam de posto e atiram pelas janelas).
    const B = { x: P(-17, 15)[0], z: P(-17, 15)[1], yaw: ctx.yaw }; // prédio de 2 andares (frente = +Z), canto da frente
    const HW = 8, HD = 6, T = 0.3, FH = 3.0, SL = 0.25, UP = FH + SL, TOPY = 2 * FH + SL;
    // parede ao longo de u (u0..u1) na altura y0..y1, com vãos [a, b, lo, hi] (porta/janela)
    const wallF = (F, along, at, u0, u1, y0, y1, holes = [], mat = m.concrete, t = T) => {
      const B = F;
      const cuts = [u0, u1]; for (const [a, b] of holes) cuts.push(a, b);
      const us = [...new Set(cuts)].sort((a, b) => a - b);
      const box = (ua, ub, ya, yb) => {
        if (ub - ua < 0.02 || yb - ya < 0.02) return;
        if (along === 'x') solid(B, (ua + ub) / 2, ya, at, ub - ua, yb - ya, t, mat);
        else solid(B, at, ya, (ua + ub) / 2, t, yb - ya, ub - ua, mat);
      };
      for (let i = 0; i < us.length - 1; i++) {
        const ua = us[i], ub = us[i + 1], mid = (ua + ub) / 2;
        const h = holes.find(([a, b]) => mid > a && mid < b);
        if (!h) box(ua, ub, y0, y1);
        else { box(ua, ub, y0, Math.max(y0, h[2])); box(ua, ub, Math.min(y1, h[3]), y1); }
      }
    };
    const wall = (...a) => wallF(B, ...a);
    // piso do térreo (só visual: o chão é o da ilha) e faixas de garagem
    decor(B, new THREE.Mesh(boxGeo(2 * HW, 0.04, 2 * HD), m.concreteDark), 0, 0.02, 0);
    for (const x of [-6.2, -3.8]) decor(B, new THREE.Mesh(boxGeo(0.1, 0.01, 5), m.sandbag), x, 0.045, 2);
    // paredes externas (os dois andares de uma vez) com portão, porta e janelas
    const winG = (a, b) => [a, b, 1.2, 2.2], winU = (a, b) => [a, b, UP + 1.0, UP + 2.0];
    wall('x', HD, -HW, HW, 0, TOPY, [[-7.2, -2.8, 0, 2.9], [0.8, 2.2, 0, 2.3], winG(3.4, 4.8), winU(-6.5, -5), winU(-3, -1.5), winU(1, 2.5), winU(3.5, 5), winU(6.4, 7.4)]);
    wall('x', -HD, -HW, HW, 0, TOPY, [winG(0, 1.4), winG(5, 6.4), winU(-6, -4.6), winU(-0.7, 0.7), winU(4.6, 6)]);
    wall('z', -HW, -HD, HD, 0, TOPY, [winG(-3, -1.6), winU(-4.5, -3.1), winU(2, 3.4)]);
    wall('z', HW, -HD, HD, 0, TOPY, [winG(-3.5, -2.1), winU(-4.5, -3.1), winU(-1, 0)]);
    // térreo: garagem | saguão (frente) + arsenal e alojamento (fundos)
    wall('z', -2, -HD, HD, 0, FH, [[2.2, 3.4, 0, 2.3]], m.concrete, 0.22);
    wall('x', 0, -2, HW, 0, FH, [[-0.2, 1.0, 0, 2.3], [4.4, 5.4, 0, 2.3]], m.concrete, 0.22);
    wall('z', 3, -HD, 0, 0, FH, [], m.concrete, 0.22);
    // laje do 1º andar com o vão da escada (x 5,8..8 / z 0,15..6)
    solid(B, (-HW + 5.8) / 2, FH, 0, 5.8 + HW, SL, 2 * HD, m.concreteDark);
    solid(B, (5.8 + HW) / 2, FH, (-HD + 0.15) / 2, HW - 5.8, SL, HD + 0.15, m.concreteDark);
    // escada (rampa sólida com degraus) subindo de z 4,6 (térreo) até z 0,15 (1º andar)
    {
      const sx = 6.9, sw = 1.8, z0 = 4.6, z1 = 0.15, run = z0 - z1, hy = UP / 2, steps = 13; // patamar de 1,2 m antes do 1º degrau
      const [x, z] = P(sx, (z0 + z1) / 2, B.yaw, B.x, B.z);
      set.items.push({ type: 'ramp', x, y: TOP + hy, z, hx: sw / 2, hy, hz: run / 2, yaw: B.yaw + Math.PI });
      for (let i = 0; i < steps; i++) {
        const h = UP * (i + 1) / steps, d = run / steps, st = new THREE.Mesh(boxGeo(sw, h, d), i % 2 ? m.concrete : m.concreteDark);
        const [mx, mz] = P(sx, z0 - d * (i + 0.5), B.yaw, B.x, B.z);
        st.position.set(mx, TOP + h / 2, mz); st.rotation.y = B.yaw; st.castShadow = st.receiveShadow = true; ctx.addSolid(st);
      }
      // guarda-corpo do vão no 1º andar
      wall('z', 5.8, 0.35, HD, UP, UP + 1.0, [], m.steel, 0.08);
    }
    // 1º andar: corredor no meio, três salas no fundo, duas na frente
    wall('x', -1.5, -HW, HW, UP, TOPY - SL, [[-6, -5, 0, UP + 2.2], [-0.5, 0.5, 0, UP + 2.2], [4.5, 5.5, 0, UP + 2.2]], m.concrete, 0.22);
    wall('z', -2.7, -HD, -1.5, UP, TOPY - SL, [], m.concrete, 0.22); wall('z', 2.7, -HD, -1.5, UP, TOPY - SL, [], m.concrete, 0.22);
    wall('x', 0.6, -HW, 5.8, UP, TOPY - SL, [[-5, -4, 0, UP + 2.2], [1, 2, 0, UP + 2.2]], m.concrete, 0.22);
    wall('z', -1, 0.6, HD, UP, TOPY - SL, [], m.concrete, 0.22);
    // teto e platibanda
    solid(B, 0, TOPY - SL, 0, 2 * HW + 0.3, SL, 2 * HD + 0.3, m.concreteDark);
    for (const [ox, oz, w, l] of [[0, HD + 0.1, 2 * HW + 0.3, 0.2], [0, -HD - 0.1, 2 * HW + 0.3, 0.2], [HW + 0.1, 0, 0.2, 2 * HD + 0.3], [-HW - 0.1, 0, 0.2, 2 * HD + 0.3]]) decor(B, new THREE.Mesh(boxGeo(w, 0.6, l), m.concreteDark), ox, TOPY + 0.3, oz);
    // placa e luzes na fachada
    decor(B, new THREE.Mesh(boxGeo(3.2, 0.6, 0.08), m.olive), 1.5, 2.75, HD + 0.2);
    for (const lx of [-5, 1.5]) lantern(B, lx, 2.6, HD + 0.25);
    // garagem: jipe militar (sólido), tambores, prateleira
    {
      const jeep = new THREE.Group();
      const body = new THREE.Mesh(boxGeo(1.9, 0.8, 3.6), m.olive); body.position.y = 0.75; jeep.add(body);
      const cab = new THREE.Mesh(boxGeo(1.8, 0.7, 1.6), m.olive); cab.position.set(0, 1.5, -0.4); jeep.add(cab);
      const glass = new THREE.Mesh(boxGeo(1.6, 0.5, 0.05), m.glass); glass.position.set(0, 1.55, 0.42); jeep.add(glass);
      for (const wx of [-0.95, 0.95]) for (const wz of [-1.2, 1.2]) { const w = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.38, 0.3, 12), m.cloth); w.rotation.z = Math.PI / 2; w.position.set(wx, 0.38, wz); jeep.add(w); }
      decor(B, jeep, -5, 0, 1.2);
      const [x, z] = P(-5, 1.2, B.yaw, B.x, B.z);
      set.items.push({ type: 'box', x, y: TOP + 0.9, z, hx: 0.95, hy: 0.9, hz: 1.8, yaw: B.yaw });
      barrel(B, -7.4, -5.3); barrel(B, -6.7, -5.4); barrel(B, -7.4, -4.6);
      solid(B, -2.6, 0, -4, 0.6, 1.8, 2.6, m.steel); // prateleira
    }
    // móveis: arsenal (caixas de munição), alojamento (beliches), salas de cima (mesas)
    for (const [x, z] of [[-1.2, -5.2], [-0.1, -5.3], [2.2, -4.8]]) ammoCrate(B, x, z);
    for (const x of [4.2, 6.8]) solid(B, x, 0, -4.6, 0.9, 1.6, 2.0, m.olive);
    for (const [x, z] of [[-5.4, -5.1], [0, -5.1], [5.4, -5.1], [-4.5, 5.2], [2.5, 5.2]]) {
      const desk = new THREE.Mesh(boxGeo(1.4, 0.78, 0.7), m.plankDark); decor(B, desk, x, UP + 0.39, z);
    }
    // ======== TORRE-ESPIRAL com a ESFERA no alto (arena do chefe da minigun) ========
    // Prédio fechado de 26 × 26 m. Por dentro, um corredor de 5,5 m dá duas voltas em espiral em
    // volta de um núcleo maciço: cada lado é uma RAMPA (sala) e cada canto um PATAMAR (antessala),
    // separados por paredes com porta. A última rampa sai no teto, dentro do radome gigante.
    const solidify = (mesh) => { mesh.traverse((o) => { if (o.isMesh) ctx.solidOnly(o); }); return mesh; };
    const TW = { x: P(0, -8)[0], z: P(0, -8)[1], yaw: ctx.yaw };
    const S = 13, K = 7.5, C = S - K, Mc = K + C / 2, h = 2.3, Ht = 8 * h, OW = 0.5;
    // concreto de dentro com um leve brilho próprio: o prédio é fechado e sem isso fica um breu
    const inMat = new THREE.MeshStandardMaterial({ color: 0xb4b6b0, roughness: 0.9, emissive: 0x4a4c48, emissiveIntensity: 1 });
    const inDark = new THREE.MeshStandardMaterial({ color: 0x8a8c87, roughness: 0.9, emissive: 0x34362f, emissiveIntensity: 1 });
    const lamp = new THREE.MeshStandardMaterial({ color: 0xfff2cc, emissive: 0xffe9b0, emissiveIntensity: 2.5 });
    const tp = (lx, lz) => P(lx, lz, TW.yaw, TW.x, TW.z);
    const CORNER = [[-Mc, Mc], [-Mc, -Mc], [Mc, -Mc], [Mc, Mc]]; // FL, BL, BR, FR
    // lado i liga o canto i ao i+1: centro, direção da subida e yaw do colisor de rampa
    const SIDE = [
      { c: [-Mc, 0], dir: [0, -1], yaw: Math.PI, along: 'z', at: -Mc },
      { c: [0, -Mc], dir: [1, 0], yaw: Math.PI / 2, along: 'x', at: -Mc },
      { c: [Mc, 0], dir: [0, 1], yaw: 0, along: 'z', at: Mc },
      { c: [0, Mc], dir: [-1, 0], yaw: -Math.PI / 2, along: 'x', at: Mc },
    ];
    // núcleo maciço
    solid(TW, 0, 0, 0, 2 * K, Ht, 2 * K, inDark);
    // paredes externas (sobem até a platibanda do teto) com a entrada no canto da frente-esquerda
    const winS = [];
    for (let L = 0; L < 2; L++) for (let i = 0; i < 4; i++) winS.push({ i, y: (4 * L + i + 0.5) * h + 1.3 });
    const holesFor = (i) => winS.filter((w) => w.i === i).flatMap((w) => [[-3.5, -2, w.y, w.y + 1], [2, 3.5, w.y, w.y + 1]]);
    wallF(TW, 'z', -S, -S, S, 0, Ht + 1.3, holesFor(0), m.concrete, OW);
    wallF(TW, 'x', -S, -S, S, 0, Ht + 1.3, holesFor(1), m.concrete, OW);
    wallF(TW, 'z', S, -S, S, 0, Ht + 1.3, holesFor(2), m.concrete, OW);
    wallF(TW, 'x', S, -S, S, 0, Ht + 1.3, [[-11.4, -9.2, 0, 2.7], ...holesFor(3)], m.concrete, OW);
    // contrafortes por fora
    for (const k of [-S, -S / 3, S / 3, S]) for (const [ax, az, ry] of [[k, -S, 0], [k, S, 0], [-S, k, Math.PI / 2], [S, k, Math.PI / 2]]) {
      const but = new THREE.Mesh(boxGeo(1.4, Ht * 0.85, 1.0), m.concreteDark); decor(TW, but, ax, Ht * 0.42, az, ry);
    }
    // rampas e patamares das duas voltas
    const rampMat = inMat, ceilMat = inDark;
    for (let L = 0; L < 2; L++) for (let i = 0; i < 4; i++) {
      const sd = SIDE[i], h0 = (4 * L + i) * h, h1 = h0 + h;
      const [cx, cz] = tp(sd.c[0], sd.c[1]);
      set.items.push({ type: 'ramp', x: cx, y: TOP + (h0 + h1) / 2, z: cz, hx: C / 2, hy: h / 2, hz: K, yaw: TW.yaw + sd.yaw });
      const len = Math.hypot(2 * K, h), slab = new THREE.Mesh(boxGeo(C, 0.25, len), rampMat);
      slab.rotation.order = 'YXZ'; slab.rotation.set(-Math.atan2(h, 2 * K), TW.yaw + sd.yaw, 0);
      slab.position.set(cx, TOP + (h0 + h1) / 2 - 0.12, cz); slab.castShadow = slab.receiveShadow = true; ctx.addSolid(slab);
      if (L === 0 && h0 > 0.01) solid(TW, sd.c[0], 0, sd.c[1], C, h0, 2 * K, ceilMat, sd.yaw); // 1ª volta: maciço embaixo da rampa
      else if (h0 > 0.01) { const ceil = new THREE.Mesh(boxGeo(C, 0.3, 2 * K), ceilMat); decor(TW, ceil, sd.c[0], h0 - 0.15, sd.c[1], sd.yaw); }
      // faixas amarelas no piso e luminárias
      // luminárias no núcleo ao longo da sala
      for (const t of [-0.5, 0, 0.5]) { const lx = sd.c[0] + sd.dir[0] * t * 2 * K - Math.sign(sd.c[0]) * (C / 2 - 0.08) * (sd.dir[0] ? 0 : 1), lz = sd.c[1] + sd.dir[1] * t * 2 * K - Math.sign(sd.c[1]) * (C / 2 - 0.08) * (sd.dir[1] ? 0 : 1);
        const strip = new THREE.Mesh(boxGeo(sd.dir[0] ? 1.4 : 0.08, 0.12, sd.dir[1] ? 1.4 : 0.08), lamp); decor(TW, strip, lx, h0 + (t + 0.5) * h + 2.6, lz); }
      // patamar no canto onde esta rampa começa (o do térreo é o chão)
      const [kx, kz] = CORNER[i];
      if (h0 > 0.01) solid(TW, kx, L === 0 ? 0 : h0 - 0.3, kz, C, L === 0 ? h0 : 0.3, C, ceilMat);
      lantern(TW, kx, h0 + 2.6, kz);
    }
    // teto: cobre tudo menos o trecho final (rampa da frente da 2ª volta + canto FR), que fica
    // aberto dentro da esfera; o canto FL do teto é onde a espiral chega
    solid(TW, 0, Ht - 0.3, (-S + K) / 2, 2 * S, 0.3, S + K, inDark);
    solid(TW, -Mc, Ht - 0.3, Mc, C, 0.3, C, inDark);
    wallF(TW, 'x', K, -K, S, Ht, Ht + 1.1, [], m.steel, 0.1); // guarda-corpo do vão
    // divisórias com porta entre cada sala (rampa) e antessala (canto)
    const DOOR = 1.9;
    for (let L = 0; L < 2; L++) for (let i = 0; i < 4; i++) {
      const sd = SIDE[i];
      for (const end of [0, 1]) { // 0 = saída do canto i, 1 = chegada no canto i+1
        const Hc = (4 * L + i + end) * h;
        const open = L === 1 && (i === 3 || (i === 2 && end === 1));
        const top = L === 0 ? Hc + 4 * h - 0.3 : open ? Hc + 3.2 : Ht - 0.3;
        const k = (end ? 1 : -1) * K * (sd.dir[0] || sd.dir[1]); // posição da divisória ao longo do lado
        if (sd.along === 'z') wallF(TW, 'x', k, sd.at - C / 2, sd.at + C / 2, Hc, top, [[sd.at - DOOR / 2, sd.at + DOOR / 2, Hc, Hc + 2.5]], inMat, 0.3);
        else wallF(TW, 'z', k, sd.at - C / 2, sd.at + C / 2, Hc, top, [[sd.at - DOOR / 2, sd.at + DOOR / 2, Hc, Hc + 2.5]], inMat, 0.3);
      }
    }
    // a ESFERA: radome geodésico gigante em cima do prédio (não faz sombra, para a arena ficar clara)
    {
      const RD = 19, up = 5, sph = new THREE.Mesh(new THREE.SphereGeometry(RD, 28, 18, 0, Math.PI * 2, 0, Math.acos(-up / RD)),
        new THREE.MeshStandardMaterial({ color: 0xf2f2ee, roughness: 0.6, flatShading: true, side: THREE.DoubleSide }));
      sph.userData.noShadow = true; sph.userData.noBake = true; decor(TW, sph, 0, Ht + up, 0);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(Math.sqrt(RD * RD - up * up), 0.35, 6, 48), m.concreteDark); ring.rotation.x = Math.PI / 2; decor(TW, ring, 0, Ht + 0.1, 0);
    }
    // arena do chefe no teto: covers de concreto, sacos de areia e caixotes
    for (const [x, z, w, l] of [[-6, -6, 2.6, 0.8], [6, -6, 2.6, 0.8], [0, -1, 3.2, 0.8], [-9, 1, 0.8, 2.6], [9, 1, 0.8, 2.6], [-3, -10.5, 2.2, 0.8], [3, -10.5, 2.2, 0.8], [-10, -9, 0.8, 2.2], [10, -9, 0.8, 2.2], [-4, 3.5, 2.4, 0.8]]) {
      solid(TW, x, Ht, z, w, 1.25, l, m.concrete);
    }
    for (const [x, z] of [[-2.5, -5], [3, 2.5], [-7, -2.5], [7.5, -3]]) { const c = new THREE.Mesh(boxGeo(1.1, 1.1, 1.1), m.olive); decor(TW, c, x, Ht + 0.55, z, r()); solidify(c); const [wx, wz] = tp(x, z); set.items.push({ type: 'box', x: wx, y: TOP + Ht + 0.55, z: wz, hx: 0.55, hy: 0.55, hz: 0.55, yaw: TW.yaw }); }
    { const [x, z] = tp(0, -8); out.bossSpot = { x, z, y: Ht }; }
    out.towerFrame = { ...TW, S, K, Ht };
    // inimigos: 1–3 em cada sala (rampa), 0–1 em cada antessala; ficam na própria sala
    const zoneOf = (lx, lz, hw, hd, yaw) => { const [x, z] = tp(lx, lz); return { x, z, yaw: TW.yaw + yaw, hw, hd }; };
    for (let L = 0; L < 2; L++) for (let i = 0; i < 4; i++) {
      const sd = SIDE[i], h0 = (4 * L + i) * h, n = 1 + ((r() * 3) | 0), zone = zoneOf(sd.c[0], sd.c[1], C / 2 - 0.6, K - 0.6, sd.yaw);
      for (let k = 0; k < n; k++) {
        const t = (k + 1) / (n + 1), off = (r() - 0.5) * (C - 1.6);
        const lx = sd.c[0] + sd.dir[0] * (t - 0.5) * 2 * K + (sd.dir[0] ? 0 : off), lz = sd.c[1] + sd.dir[1] * (t - 0.5) * 2 * K + (sd.dir[1] ? 0 : off);
        const [x, z] = tp(lx, lz); out.spawns.push({ x, z, y: h0 + t * h, keep: true, zone });
      }
      if ((L || i) && r() < 0.45) { const [kx, kz] = CORNER[i], [x, z] = tp(kx, kz); out.spawns.push({ x, z, y: h0, keep: true, zone: zoneOf(kx, kz, C / 2 - 0.6, C / 2 - 0.6, 0) }); }
    }
    for (const [x, z] of [[-9, -9], [9, -9]]) { const [wx, wz] = tp(x, z); out.spawns.push({ x: wx, z: wz, y: Ht, keep: true, zone: zoneOf(x, z, 3, 3, 0) }); } // guardas do chefe

    // ======== COMPLEXO: muralha com torres redondas, radomes, antenas, parabólicas, contêineres ========
    const cyl = (frame, lx, lz, rad, y0, hh) => { const [x, z] = P(lx, lz, frame.yaw, frame.x, frame.z); set.items.push({ type: 'cyl', x, y: TOP + y0 + hh / 2, z, hx: rad, hy: hh / 2, hz: rad }); };
    const W = 30, WH = 5, WT = 1.0, GATE = 3.6;
    const bigWall = (x0, z0, x1, z1) => {
      const len = Math.hypot(x1 - x0, z1 - z0), yaw = Math.atan2(x1 - x0, z1 - z0);
      solid(site, (x0 + x1) / 2, 0, (z0 + z1) / 2, WT, WH, len, m.concrete, yaw);
      const n = Math.floor(len / 1.6);
      for (let i = 0; i < n; i++) { const t = (i + 0.5) / n, merlon = new THREE.Mesh(boxGeo(WT + 0.1, 0.6, 0.8), m.concreteDark); decor(site, merlon, x0 + (x1 - x0) * t, WH + 0.3, z0 + (z1 - z0) * t, yaw); }
      for (let i = 1; i < len / 4; i++) { const t = i / Math.ceil(len / 4), but = new THREE.Mesh(boxGeo(1.6, WH * 0.8, 0.7), m.concreteDark); decor(site, but, x0 + (x1 - x0) * t, WH * 0.4, z0 + (z1 - z0) * t, yaw + Math.PI / 2); }
    };
    bigWall(-W, -W, W, -W); bigWall(-W, -W, -W, W); bigWall(W, -W, W, W);
    bigWall(-W, W, -GATE, W); bigWall(GATE, W, W, W);
    for (const sx of [-1, 1]) { const leaf = new THREE.Mesh(boxGeo(GATE - 0.1, WH - 0.6, 0.15), m.steel); leaf.geometry.translate(-sx * (GATE - 0.1) / 2, 0, 0); decor(site, leaf, sx * GATE, (WH - 0.6) / 2, W + 0.2, sx * 1.2); }
    { const arch = new THREE.Mesh(boxGeo(2 * GATE + 2, 1.0, WT + 0.4), m.concreteDark); decor(site, arch, 0, WH + 0.6, W); solidify(arch); }
    const roundTower = (lx, lz, rad = 2.6, H = 9.5) => {
      const body = new THREE.Mesh(new THREE.CylinderGeometry(rad * 0.95, rad, H, 20), m.concrete); decor(site, body, lx, H / 2, lz); solidify(body);
      cyl(site, lx, lz, rad, 0, H);
      for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2, rib = new THREE.Mesh(boxGeo(0.5, H * 0.85, 0.7), m.concreteDark); decor(site, rib, lx + Math.cos(a) * rad, H * 0.42, lz + Math.sin(a) * rad, -a); }
      const rim = new THREE.Mesh(new THREE.TorusGeometry(rad * 0.98, 0.18, 6, 24), m.concreteDark); rim.rotation.x = Math.PI / 2; decor(site, rim, lx, H + 0.2, lz);
      for (let i = 0; i < 4; i++) { const slit = new THREE.Mesh(boxGeo(0.25, 1.0, 0.1), m.cloth); const a = i / 4 * Math.PI * 2 + 0.4; decor(site, slit, lx + Math.cos(a) * (rad + 0.02), H * 0.6, lz + Math.sin(a) * (rad + 0.02), Math.PI / 2 - a); }
      const d = Math.hypot(lx, lz) || 1, ux = -lx / d, uz = -lz / d, ax = lx + ux * (rad + 0.45), az = lz + uz * (rad + 0.45);
      const lyaw = Math.atan2(-ux, -uz), ladder = new THREE.Group();
      for (const x2 of [-0.22, 0.22]) { const rail = new THREE.Mesh(boxGeo(0.07, H + 0.6, 0.07), m.steel); rail.position.set(x2, 0, 0); ladder.add(rail); }
      for (let i = 0; i < Math.floor(H / 0.42); i++) { const rung = new THREE.Mesh(boxGeo(0.44, 0.05, 0.05), m.steel); rung.position.y = -H / 2 + 0.3 + i * 0.42; ladder.add(rung); }
      decor(site, ladder, lx + ux * (rad + 0.12), H / 2 + 0.2, lz + uz * (rad + 0.12), lyaw);
      { const [x, z] = P(ax, az); out.ladders.push({ x, z, top: H + 0.05, yaw: ctx.yaw + lyaw, dir: -1 }); } // sobe para dentro da torre
      spot(site, lx, lz, H, true);
    };
    for (const [x, z] of [[-W, -W], [W, -W], [-W, W], [W, W], [-W, 0], [W, 0], [0, -W]]) roundTower(x, z);
    const dome = new THREE.MeshStandardMaterial({ color: 0xf2f2ee, roughness: 0.55, flatShading: true });
    const radome = (lx, lz, baseR, baseH, R) => {
      const base = new THREE.Mesh(new THREE.CylinderGeometry(baseR, baseR * 1.03, baseH, 28), m.concrete); decor(site, base, lx, baseH / 2, lz); solidify(base);
      const door = new THREE.Mesh(boxGeo(1.2, 2.2, 0.12), m.steel); decor(site, door, lx, 1.1, lz + baseR, 0);
      const sph = new THREE.Mesh(new THREE.IcosahedronGeometry(R, 3), dome); decor(site, sph, lx, baseH + R * 0.82, lz); solidify(sph);
      cyl(site, lx, lz, baseR, 0, baseH); cyl(site, lx, lz, R * 0.9, baseH, R * 1.7);
    };
    radome(-22, -21, 4.2, 5, 5.8); radome(22, 14, 2.6, 3.2, 3.6); radome(24, -20, 1.8, 2.6, 2.4);
    const lattice = (lx, lz, H, w = 1.4) => {
      const g = new THREE.Group(), legGeo = boxGeo(0.12, H, 0.12);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) { const leg = new THREE.Mesh(legGeo, m.steel); leg.position.set(sx * w / 2, H / 2, sz * w / 2); g.add(leg); }
      for (let y = 1.2; y < H; y += 1.6) for (const [ax, az, ry] of [[0, -w / 2, 0], [0, w / 2, 0], [-w / 2, 0, Math.PI / 2], [w / 2, 0, Math.PI / 2]]) {
        const br = new THREE.Mesh(boxGeo(w, 0.06, 0.06), m.steel); br.position.set(ax, y, az); br.rotation.y = ry; g.add(br);
        const dg = new THREE.Mesh(boxGeo(Math.hypot(w, 1.6), 0.05, 0.05), m.steel); dg.position.set(ax, y - 0.8, az); dg.rotation.set(0, ry, Math.atan2(1.6, w)); g.add(dg);
      }
      const dish = new THREE.Mesh(new THREE.SphereGeometry(1.4, 16, 8, 0, Math.PI * 2, 0, 0.9), new THREE.MeshStandardMaterial({ color: 0xd8d8d2, side: THREE.DoubleSide, roughness: 0.6 }));
      dish.rotation.x = -1.2; dish.position.set(0, H + 0.6, 0.4); g.add(dish);
      const light = new THREE.Mesh(new THREE.SphereGeometry(0.15, 8, 6), new THREE.MeshStandardMaterial({ color: 0xff3020, emissive: 0xff2010, emissiveIntensity: 3 })); light.position.y = H + 0.2; g.add(light);
      decor(site, g, lx, 0, lz, r() * 6);
      cyl(site, lx, lz, w * 0.6, 0, H);
    };
    lattice(23, -9, 16); lattice(25.5, 3, 12, 1.1); lattice(-26, -8, 13, 1.1);
    const dishStand = (lx, lz, size, aim) => {
      const g = new THREE.Group();
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.35, 2.2, 10), m.concreteDark); post.position.y = 1.1; g.add(post);
      const dsh = new THREE.Mesh(new THREE.SphereGeometry(size, 20, 10, 0, Math.PI * 2, 0, 0.85), new THREE.MeshStandardMaterial({ color: 0x9a8f7c, side: THREE.DoubleSide, roughness: 0.7 }));
      dsh.rotation.x = -1.0; dsh.position.set(0, 2.2 + size * 0.5, 0); g.add(dsh);
      decor(site, g, lx, 0, lz, aim); solidify(dsh);
      cyl(site, lx, lz, 0.4, 0, 2.2);
    };
    dishStand(17, -26, 2.4, 0.6); dishStand(25, 24, 1.8, 2.2);
    const ribbed = (() => { const c = document.createElement('canvas'); c.width = 64; c.height = 16; const g = c.getContext('2d'); g.fillStyle = '#8f2d1d'; g.fillRect(0, 0, 64, 16); g.fillStyle = '#6b1f13'; for (let x = 0; x < 64; x += 4) g.fillRect(x, 0, 2, 16); const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(3, 1); t.colorSpace = THREE.SRGBColorSpace; return t; })();
    const contMat = new THREE.MeshStandardMaterial({ map: ribbed, roughness: 0.7, metalness: 0.2 });
    const container = (lx, lz, y0 = 0, yaw = 0) => solid(site, lx, y0, lz, 2.4, 2.6, 6, contMat, yaw);
    container(-26, 6); container(-26, 6, 2.6); container(-22.8, 6.6, 0, 0.08); container(18, 26, 0, Math.PI / 2); container(11, 26.5, 0, Math.PI / 2);
    out.crateSpots.push(P(-24.4, 10.2));
    for (const [x, z] of [[16, -14], [17, -14], [18, -14]]) {
      const st = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 4, 10), m.steel); decor(site, st, x, 2, z); solidify(st); cyl(site, x, z, 0.42, 0, 4);
    }
    const pad = new THREE.Mesh(new THREE.CylinderGeometry(4, 4, 0.06, 32), m.concreteDark); decor(site, pad, 17, 0.03, 14);
    for (const [w, l, x] of [[0.35, 2.4, -0.7], [0.35, 2.4, 0.7], [1.4, 0.35, 0]]) { const hh = new THREE.Mesh(boxGeo(w, 0.02, l), m.sandbag); decor(site, hh, 17 + x, 0.08, 14); }
    sandbags(site, -9, 23.5, -5, 25.5, 3); sandbags(site, 5, 25.5, 9, 23.5, 3); sandbags(site, -3, 12, 3, 12, 3);
    for (const [x, z] of [[-6, 9], [-5, 8.4], [8, 9]]) ammoCrate(site, x, z);
    barrel(site, 4, 20); barrel(site, 4.6, 20.6); barrel(site, 22, -2);
    flag(site, 9, 9, 8.5);
    out.yard = P(0, 16); out.fire = P(-4, 18);
    // caixotes: arsenal e garagem (térreo)
    out.crateSpots.push(P(1.2, -4.6, B.yaw, B.x, B.z), P(-6.9, -3.6, B.yaw, B.x, B.z));
    // cômodos do térreo (para a IA achar as portas) — o andar de cima é de "posto"
    const room = (cx, cz, hw, hd, din, dout) => rooms.push({ x: P(cx, cz, B.yaw, B.x, B.z)[0], z: P(cx, cz, B.yaw, B.x, B.z)[1], yaw: B.yaw, hw, hd,
      door: [P(din[0], din[1], B.yaw, B.x, B.z), P(dout[0], dout[1], B.yaw, B.x, B.z)] });
    room(-5, 0, 3, HD, [-5, 4.6], [-5, 7.6]);       // garagem (portão largo na frente)
    room(3, 3, 5, 3, [1.5, 5.0], [1.5, 7.6]);       // saguão
    room(0.5, -3, 2.5, 3, [0.4, -0.9], [0.4, 1.1]); // arsenal
    room(5.5, -3, 2.5, 3, [4.9, -0.9], [4.9, 1.1]); // alojamento
    // pontos de inimigo: térreo (andam) e 1º andar (posto, atiram pela janela/porta)
    for (const [x, z] of [[-5.5, -3], [-3.2, 4.2], [-0.4, 2], [4, 3.6], [0.8, -2.6], [5.6, -2.4]]) spot(B, x, z);
    for (const [x, z] of [[-5.4, -3.6], [0, -3.6], [5.4, -3.6], [-4.5, 3.2], [2.5, 3.6], [-3, -0.45]]) spot(B, x, z, UP, true);
    for (const [x, z] of [[-6, 22], [6, 22], [0, 14], [14, 6], [-10, 8], [20, -4]]) spot(site, x, z);
  } else if (type === 'farol') {
    // FAROL: torre listrada alta com galeria lá em cima (escada por fora), lanterna acesa no topo e a
    // casinha do faroleiro do lado; boias, barris e cordas no pátio
    const H = 7.4, tz = -1.4;
    decor(site, new THREE.Mesh(new THREE.CylinderGeometry(0.85, 1.12, H, 20), X.stripe), 0, H / 2, tz);
    { const [x, z] = P(0, tz); set.items.push({ type: 'cyl', x, y: TOP + (H - 0.3) / 2, z, hx: 1.12, hy: (H - 0.3) / 2, hz: 1.12 }); }
    watchTower(site, 0, tz, H, m.steel, X.redRoof, 1.25, 1);
    decor(site, new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 1.1, 14, 1, true), X.glass), 0, H + 0.7, tz);
    decor(site, new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 10), X.glowY), 0, H + 0.75, tz);
    { const [x, z] = P(0, tz); set.items.push({ type: 'cyl', x, y: TOP + H + 0.7, z, hx: 0.52, hy: 0.56, hz: 0.52 }); }
    const keeper = cabin(sub(3.4, 2.4, -0.6), 3.6, 3.0, 2.2);
    out.crateSpots.push(keeper.inside);
    barrel(site, -2.4, 0.9); barrel(site, -2.8, 1.6); crateStack(site, 1.6, 1.2);
    for (const [lx, lz] of [[-1.8, 2.8], [-3.2, -2.6]]) { const buoy = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.1, 8, 16), X.redRoof); buoy.rotation.x = Math.PI / 2; decor(site, buoy, lx, 0.1, lz); }
    flag(site, -3.4, -0.6, 3.2);
    out.yard = P(-1.2, 3.4); out.fire = P(-1.6, 3.8);
    spot(site, -2.2, 2.2); spot(site, 2.0, 4.6);
  } else if (type === 'naufragio') {
    // NAVIO ENCALHADO: casco de madeira cravado na areia (entra pelo rombo do costado), convés quebrado
    // por cima da popa, costelas expostas na proa, mastro caído com a vela rasgada e carga espalhada
    const hull = sub(0, -0.6, 0.35), B2 = 2.2, Hh = 2.3, sz0 = -4.4, sz1 = 2.0, bow = 5.0, W2 = m.plankDark;
    seg(hull, -B2, sz0, B2, sz0, Hh + 0.5, W2, 0.24);
    seg(hull, -B2, sz0, -B2, sz1, Hh, W2, 0.24);
    seg(hull, B2, sz0, B2, -1.3, Hh, W2, 0.24); seg(hull, B2, 0.3, B2, sz1, Hh, W2, 0.24);
    seg(hull, B2, -1.3, B2, 0.3, Hh - 1.9, W2, 0.24, 1.9); // verga do rombo
    seg(hull, -B2, sz1, -0.25, bow, Hh, W2, 0.24); seg(hull, B2, sz1, 0.25, bow, Hh * 0.6, W2, 0.24);
    solid(hull, 0, 0, -1.2, 2 * B2 - 0.1, 0.12, 6.2, m.floor);
    solid(hull, 0, Hh, -3.0, 2 * B2 + 0.25, 0.16, 3.0, m.floor); // convés da popa (o resto desabou)
    for (const sx of [-1, 1]) for (const y of [0.45, 1.15, 1.85]) decor(hull, new THREE.Mesh(boxGeo(0.06, 0.14, 6.5), m.plank), sx * (B2 + 0.14), y, -1.2);
    for (const [bx, bz, h] of [[-1.7, 2.8, 3.1], [1.4, 3.0, 2.0], [-1.0, 3.8, 2.8], [0.7, 4.0, 1.6]]) { const rib = new THREE.Mesh(boxGeo(0.16, h, 0.16), m.log); rib.rotation.z = bx > 0 ? -0.18 : 0.18; decor(hull, rib, bx, h / 2, bz); }
    const bowsprit = cylY(0.1, 3.2, m.log, 7); bowsprit.rotation.x = 1.1; decor(hull, bowsprit, 0, Hh + 0.4, bow + 0.6);
    const mast = cylY(0.18, 7.2, m.log, 8); mast.rotation.z = Math.PI / 2 - 0.08; decor(site, mast, -4.2, 0.3, 0.8, 0.25);
    { const sail = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 2.2, 6, 4), X.sailcloth); const p = sail.geometry.attributes.position; for (let i = 0; i < p.count; i++) p.setZ(i, Math.sin(p.getX(i) * 1.7) * 0.25 + (r() - 0.5) * 0.12); sail.geometry.computeVertexNormals(); sail.rotation.x = -1.35; decor(site, sail, -3.8, 0.25, 2.4, 0.3); }
    { const anchor = new THREE.Group(); const shank = cylY(0.07, 1.6, m.iron, 6); shank.position.y = 0.8; anchor.add(shank); const arm = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.07, 6, 12, Math.PI), m.iron); arm.rotation.z = Math.PI; arm.position.y = 0.3; anchor.add(arm); anchor.rotation.z = 1.2; decor(site, anchor, 4.2, 0.25, -2.6); }
    barrel(site, 3.6, 2.6); barrel(site, 4.4, 3.0); crateStack(site, -3.4, -2.4); crateStack(site, 3.2, -1.0);
    const [rx, rz] = P(0, -1.2, hull.yaw, hull.x, hull.z);
    rooms.push({ x: rx, z: rz, yaw: hull.yaw, hw: B2, hd: 3.2, door: [P(B2 - 0.7, -0.5, hull.yaw, hull.x, hull.z), P(B2 + 1.3, -0.5, hull.yaw, hull.x, hull.z)] });
    out.crateSpots.push(P(-1.1, -3.4, hull.yaw, hull.x, hull.z));
    spot(hull, 0, -2.2); spot(hull, -0.8, 0.8); spot(site, 4.4, 0.6); spot(site, -3.0, 3.6);
    out.yard = P(4.4, 2.0); out.fire = P(4.6, 1.4);
  } else if (type === 'taverna') {
    // TAVERNA: casarão de tábuas grande (balcão com garrafas lá dentro), mesas e bancos no terreiro,
    // pirâmide de barris de rum, placa pendurada e lanternas em postes
    const hall = sub(0, -1.8), Wt = 6.6, Dt = 4.6;
    const c = cabin(hall, Wt, Dt, 2.6);
    out.crateSpots.push(c.inside);
    solid(hall, 2.3, 0.18, -1.7, 1.6, 1.0, 0.5, m.plankDark);
    for (let i = 0; i < 5; i++) decor(hall, new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.3, 6), X.bottle), 1.7 + i * 0.28, 1.33, -1.7);
    spot(hall, -2.2, 0.8);
    for (const sx of [-1, 1]) {
      solid(site, sx * 2.0, 0, 2.7, 1.1, 0.75, 0.75, m.plankDark);
      for (const sz of [-1, 1]) decor(site, new THREE.Mesh(boxGeo(1.0, 0.08, 0.3), m.plank), sx * 2.0, 0.42, 2.7 + sz * 0.62);
      decor(site, new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.06, 0.16, 8), m.plank), sx * 2.0 + 0.2, 0.83, 2.7);
      decor(site, cylY(0.06, 2.2, m.log, 6), sx * 3.4, 1.1, 3.6); lantern(site, sx * 3.4, 2.25, 3.6);
    }
    barrel(site, 3.9, 0.4); barrel(site, 3.9, 1.1); barrel(site, 4.5, 0.75);
    decor(site, cylY(0.07, 2.6, m.log, 6), -3.6, 1.3, 1.0);
    { const board = new THREE.Mesh(boxGeo(1.1, 0.6, 0.06), m.plank); board.geometry.translate(0.6, 0, 0); decor(site, board, -3.6, 2.2, 1.0, 0.3); }
    out.yard = P(0, 4.0); out.fire = P(0, 4.6);
    spot(site, -1.0, 2.0); spot(site, 1.2, 3.6);
  } else if (type === 'vila') {
    // VILA: três casebres de tamanhos diferentes virados para a fogueira, poço de pedra, varal com
    // roupas, canoa na areia e tocos de lenha
    const huts = [[0.2, 4.6, 4.2, 3.4, 2.3], [2.3, 4.4, 3.4, 3.0, 2.1], [4.2, 4.5, 3.2, 2.8, 2.0]];
    huts.forEach(([a, d, W, D, H], i) => { const c = cabin(sub(Math.sin(a) * d, Math.cos(a) * d, a + Math.PI), W, D, H); if (i < 2) out.crateSpots.push(c.inside); });
    { const wx = Math.sin(3.25) * 3.3, wz = Math.cos(3.25) * 3.3; cylSolid(site, wx, wz, 0.7, 0.8, X.rock, 0, 12);
      for (const sx of [-1, 1]) decor(site, cylY(0.06, 1.6, m.log, 6), wx + sx * 0.6, 0.8, wz);
      const roof = new THREE.Mesh(new THREE.ConeGeometry(0.95, 0.5, 4), m.thatch); roof.rotation.y = Math.PI / 4; decor(site, roof, wx, 1.85, wz); }
    { const ax = Math.sin(5.25) * 3.8, az = Math.cos(5.25) * 3.8;
      for (const s of [-1.2, 1.2]) decor(site, cylY(0.05, 1.8, m.log, 6), ax + s * 0.6, 0.9, az + s * 0.9);
      const line = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 3.0, 4), m.rope); line.rotation.z = Math.PI / 2; decor(site, line, ax, 1.7, az, -Math.atan2(0.9, 0.6) + Math.PI / 2);
      [0xc94b3a, 0xe0d6b8, 0x3f6f9a].forEach((col, k) => { const cl = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.6), new THREE.MeshStandardMaterial({ color: col, side: THREE.DoubleSide, roughness: 0.95 })); decor(site, cl, ax + (k - 1) * 0.36, 1.38, az + (k - 1) * 0.54, Math.atan2(0.6, 0.9)); }); }
    { const canoe = new THREE.Mesh(new THREE.CapsuleGeometry(0.4, 2.6, 4, 10), m.plankDark); canoe.rotation.x = Math.PI / 2; canoe.scale.set(1, 1, 0.5); decor(site, canoe, Math.sin(1.25) * 5.2, 0.18, Math.cos(1.25) * 5.2, 1.25); }
    for (let i = 0; i < 3; i++) decor(site, cylY(0.22, 0.4, m.log, 8), 1.8 + i * 0.5, 0.2, -1.2 + (i % 2) * 0.4);
    out.yard = P(0, 0); out.fire = P(0, 0);
    spot(site, 1.5, -1.0); spot(site, -1.6, 0.8); spot(site, 0.6, 1.8);
  } else if (type === 'tesouro') {
    // ILHA DA CAVEIRA: rocha enorme em forma de caveira, anel de pedras em volta da cova do tesouro,
    // totens de tiki, pá fincada na terra e a barraquinha dos escavadores
    const skull = new THREE.Group();
    const head = new THREE.Mesh(new THREE.IcosahedronGeometry(2.0, 1), X.rockPale); head.scale.set(1, 0.95, 0.9); skull.add(head);
    const brow = new THREE.Mesh(boxGeo(2.4, 0.35, 0.5), X.rockPale); brow.position.set(0, 0.62, 1.25); skull.add(brow);
    const jaw = new THREE.Mesh(boxGeo(2.2, 0.9, 1.6), X.rockPale); jaw.position.set(0, -1.3, 0.55); skull.add(jaw);
    for (const sx of [-1, 1]) { const eye = new THREE.Mesh(new THREE.SphereGeometry(0.48, 12, 10), X.black); eye.position.set(sx * 0.72, 0.1, 1.5); eye.scale.z = 0.6; skull.add(eye); }
    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.25, 0.5, 3), X.black); nose.position.set(0, -0.55, 1.66); nose.rotation.x = Math.PI; skull.add(nose);
    for (let i = 0; i < 4; i++) { const t = new THREE.Mesh(boxGeo(0.34, 0.4, 0.2), X.rockPale); t.position.set(-0.6 + i * 0.4, -1.0, 1.36); skull.add(t); }
    decor(site, skull, 0, 1.95, -3.6);
    { const [x, z] = P(0, -3.6); set.items.push({ type: 'cyl', x, y: TOP + 1.9, z, hx: 2.0, hy: 1.9, hz: 2.0 }); }
    for (const a of [0.9, 1.7, 2.5, 3.8, 4.6, 5.4]) boulder(site, Math.sin(a) * 3.1, 1.0 + Math.cos(a) * 3.1, 0.5 + r() * 0.35);
    decor(site, new THREE.Mesh(new THREE.CircleGeometry(1.3, 20).rotateX(-Math.PI / 2), X.scorch), 0, 0.03, 1.0);
    for (const sx of [-1, 1]) { const mound = new THREE.Mesh(new THREE.SphereGeometry(0.7, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), X.dirt); mound.scale.y = 0.5; decor(site, mound, sx * 1.9, 0, 1.4); }
    for (const sx of [-1, 1]) {
      const tx = sx * 2.4, tz = -1.3;
      for (let k = 0; k < 2; k++) decor(site, cylY(0.32, 1.0, k ? m.plankDark : m.log, 8), tx, 0.5 + k, tz);
      for (let k = 0; k < 2; k++) { for (const ex of [-0.12, 0.12]) decor(site, new THREE.Mesh(boxGeo(0.1, 0.12, 0.06), X.black), tx + ex, 0.7 + k, tz + 0.31); decor(site, new THREE.Mesh(boxGeo(0.34, 0.08, 0.06), X.redRoof), tx, 0.42 + k, tz + 0.31); }
      decor(site, new THREE.Mesh(new THREE.ConeGeometry(0.4, 0.5, 8), m.thatch), tx, 2.25, tz);
      const [x, z] = P(tx, tz); set.items.push({ type: 'cyl', x, y: TOP + 1, z, hx: 0.34, hy: 1, hz: 0.34 });
    }
    { const shovel = new THREE.Group(); const h = cylY(0.03, 1.2, m.log, 5); h.position.y = 0.6; shovel.add(h); const blade = new THREE.Mesh(boxGeo(0.26, 0.32, 0.03), m.iron); shovel.add(blade); shovel.rotation.z = 0.3; decor(site, shovel, 1.2, 0.1, 2.4); }
    tent(site, 3.8, 2.6, -0.9, m.canvasTan, 2.6, 2.0, 1.5);
    flag(site, -3.4, 3.0, 3.4);
    out.crateSpots.push(P(0, 1.0));
    out.yard = P(-1.6, 4.2); out.fire = P(-2.2, 4.0);
    spot(site, 1.5, 3.8); spot(site, -1.8, -1.0); spot(site, 2.6, -0.4);
  } else if (type === 'canhoneira') {
    // BATERIA DE CANHÕES: muro baixo de troncos em arco virado para o mar, três canhões antigos em
    // carretas de madeira, pirâmides de balas, barris de pólvora, paiol e bandeira
    const RR = 5.2;
    for (let i = 0; i < 6; i++) { const a0 = -1.15 + i * 0.383, a1 = a0 + 0.383; seg(site, Math.sin(a0) * RR, Math.cos(a0) * RR, Math.sin(a1) * RR, Math.cos(a1) * RR, 0.9, m.log, 0.42); }
    for (let a = -1.15; a <= 1.15; a += 0.085) decor(site, cylY(0.2, 1.15 + r() * 0.2, m.log, 7), Math.sin(a) * (RR + 0.05), 0.55, Math.cos(a) * (RR + 0.05));
    const cannon = (lx, lz, yo) => {
      const g = new THREE.Group();
      const carriage = new THREE.Mesh(boxGeo(0.9, 0.45, 1.4), m.plankDark); carriage.position.y = 0.42; g.add(carriage);
      for (const sx of [-1, 1]) for (const sz of [-0.45, 0.45]) { const w = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.12, 12), m.plankDark); w.rotation.z = Math.PI / 2; w.position.set(sx * 0.5, 0.28, sz); g.add(w); }
      const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.24, 2.0, 12), m.iron); tube.rotation.x = Math.PI / 2 - 0.1; tube.position.set(0, 0.86, 0.45); g.add(tube);
      const lip = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.05, 6, 12), m.iron); lip.position.set(0, 0.96, 1.44); g.add(lip);
      decor(site, g, lx, 0, lz, yo);
      const [x, z] = P(lx, lz); set.items.push({ type: 'box', x, y: TOP + 0.5, z, hx: 0.5, hy: 0.5, hz: 0.75, yaw: ctx.yaw + yo });
    };
    for (const a of [-0.65, 0, 0.65]) cannon(Math.sin(a) * (RR - 2.0), Math.cos(a) * (RR - 2.0), a);
    for (const [px, pz] of [[-1.6, 1.4], [1.6, 1.5]]) {
      for (let k = 0; k < 4; k++) decor(site, new THREE.Mesh(new THREE.SphereGeometry(0.14, 10, 8), m.iron), px + (k % 2 - 0.5) * 0.29, 0.14, pz + ((k >> 1) - 0.5) * 0.29);
      decor(site, new THREE.Mesh(new THREE.SphereGeometry(0.14, 10, 8), m.iron), px, 0.36, pz);
    }
    const shed = cabin(sub(0, -2.8), 3.4, 2.8, 2.1); out.crateSpots.push(shed.inside);
    barrel(site, 2.6, -1.2); barrel(site, -2.6, -1.0); barrel(site, -2.9, -0.4);
    flag(site, 3.0, -2.8, 4.0);
    out.yard = P(0, 0.6); out.fire = P(2.4, 0.4);
    for (const a of [-0.65, 0, 0.65]) spot(site, Math.sin(a) * (RR - 3.3), Math.cos(a) * (RR - 3.3));
  } else if (type === 'radar') {
    // ESTAÇÃO DE RADAR: parabólica grande sobre pedestal, sala de controle de concreto, gerador com
    // escapamento, mastros com luz vermelha e meia-lua de sacos de areia na frente
    decor(site, new THREE.Mesh(new THREE.CylinderGeometry(3.4, 3.5, 0.08, 24), m.concreteDark), 0, 0.04, 1.6);
    dish(site, 0, 1.6, 2.3, 0.75, 0);
    const ctrl = concrete(sub(0, -2.8), 4.4, 3.0, 2.4); out.crateSpots.push(ctrl.inside);
    solid(site, 3.1, 0, -2.6, 1.4, 1.0, 0.9, m.olive);
    decor(site, cylY(0.06, 1.2, m.steel, 6), 3.4, 1.6, -2.4);
    for (const [lx, lz, h] of [[-2.7, -0.9, 5.5], [2.8, -0.5, 4.2]]) { decor(site, cylY(0.05, h, m.steel, 6), lx, h / 2, lz); decor(site, new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), X.glowR), lx, h + 0.05, lz); }
    for (let i = 0; i < 4; i++) { const a0 = -0.95 + i * 0.48, a1 = a0 + 0.48, RR = 5; sandbags(site, Math.sin(a0) * RR, Math.cos(a0) * RR + 1, Math.sin(a1) * RR, Math.cos(a1) * RR + 1, 3); }
    ammoCrate(site, -3.3, 2.4); ammoCrate(site, 3.5, 2.2);
    flag(site, -3.6, -2.6, 4.0, 'mil');
    out.yard = P(1.6, 4.0); out.fire = P(2.4, 4.2);
    spot(site, -2.2, 4.4); spot(site, 1.2, 5.0); spot(site, -3.8, 0.8);
  } else if (type === 'heliponto') {
    // HELIPONTO: plataforma com o "H", helicóptero de transporte estacionado, hangar de concreto,
    // tambores de combustível, biruta e sacos de areia
    decor(site, new THREE.Mesh(new THREE.CylinderGeometry(3.4, 3.4, 0.06, 28), [m.concreteDark, X.helipad, m.concreteDark]), 0, 0.03, 1.4);
    const heli = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.85, 2.4, 6, 12), X.heliOlive); body.rotation.x = Math.PI / 2; body.position.y = 1.35; heli.add(body);
    const nose = new THREE.Mesh(new THREE.SphereGeometry(0.72, 14, 10), X.glassDark); nose.scale.set(1, 0.8, 0.9); nose.position.set(0, 1.45, 1.7); heli.add(nose);
    const tail = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.32, 3.4, 8), X.heliOlive); tail.rotation.x = Math.PI / 2; tail.position.set(0, 1.7, -3.2); heli.add(tail);
    const fin = new THREE.Mesh(boxGeo(0.08, 0.9, 0.6), X.heliOlive); fin.position.set(0, 2.15, -4.8); heli.add(fin);
    for (let k = 0; k < 2; k++) { const tb = new THREE.Mesh(boxGeo(0.03, 0.12, 1.1), m.steel); tb.rotation.x = k * Math.PI / 2; tb.position.set(0.12, 2.15, -4.85); heli.add(tb); }
    const mastH = cylY(0.1, 0.4, m.steel, 8); mastH.position.y = 2.35; heli.add(mastH);
    for (let k = 0; k < 4; k++) { const bl = new THREE.Mesh(boxGeo(0.25, 0.04, 4.6), m.steel); bl.rotation.y = k * Math.PI / 2 + 0.4; bl.position.y = 2.56; heli.add(bl); }
    for (const sx of [-1, 1]) { const sk = new THREE.Mesh(boxGeo(0.08, 0.08, 3.2), m.steel); sk.position.set(sx * 0.85, 0.08, 0.2); heli.add(sk); for (const sz of [-0.6, 1.0]) { const st = new THREE.Mesh(boxGeo(0.06, 0.6, 0.06), m.steel); st.position.set(sx * 0.75, 0.4, sz); heli.add(st); } }
    const hf = sub(0.2, 1.4, Math.PI + 0.4);
    decor(hf, heli, 0, 0, 0);
    hidden(hf, 0, 0.2, 0, 1.8, 2.0, 3.6); hidden(hf, 0, 1.4, -3.2, 0.5, 0.6, 3.0);
    const hangar = concrete(sub(-0.6, -4.0), 5.0, 3.2, 2.7); out.crateSpots.push(hangar.inside);
    for (let i = 0; i < 3; i++) drum(site, 4.0, -1.4 + i * 0.7, X.contRed);
    decor(site, cylY(0.05, 3.2, m.steel, 6), -3.8, 1.6, 3.4);
    { const sock = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.9, 10, 1, true), X.orange); sock.rotation.z = Math.PI / 2; sock.material.side = THREE.DoubleSide; decor(site, sock, -3.4, 3.0, 3.4, 0.6); }
    sandbags(site, 2.0, -2.0, 3.2, -2.0, 2); sandbags(site, -3.4, -2.1, -4.2, -1.0, 2);
    out.yard = P(-2.8, 1.0); out.fire = P(-3.2, 0.4);
    spot(site, -2.4, 2.6); spot(site, 2.8, 2.2); spot(site, 1.0, -1.8);
  } else if (type === 'quartel') {
    // QUARTEL: alojamento comprido de concreto (beliches lá dentro), escritório separado, mastro com a
    // bandeira, sacos de areia na porta e um jipe estacionado
    const barr = sub(0, -2.2), BD = 3.8;
    const b = concrete(barr, 8.4, BD, 2.7); out.crateSpots.push(b.inside);
    for (const bx of [-3.2, -0.3]) {
      solid(barr, bx, 0, -BD / 2 + 0.55, 1.9, 0.5, 0.85, m.olive);
      decor(barr, new THREE.Mesh(boxGeo(1.9, 0.12, 0.85), m.olive), bx, 1.35, -BD / 2 + 0.55);
      for (const sx of [-1, 1]) decor(barr, new THREE.Mesh(boxGeo(0.06, 1.5, 0.06), m.steel), bx + sx * 0.92, 0.75, -BD / 2 + 0.95);
    }
    const office = concrete(sub(-3.8, 2.7, Math.PI / 2), 3.0, 2.6, 2.4); out.crateSpots.push(office.inside);
    flag(site, 2.6, 3.6, 5.0, 'mil');
    jeep(site, 3.4, 0.8, 0.3);
    sandbags(site, -2.3, 0.4, -1.0, 0.4, 2); sandbags(site, 1.0, 0.4, 2.3, 0.4, 2);
    out.yard = P(0.4, 2.6); out.fire = P(0.9, 3.4);
    spot(site, -0.6, 1.6); spot(site, 1.8, 2.2); spot(site, 0, 4.2);
  } else if (type === 'deposito') {
    // DEPÓSITO DE MUNIÇÃO: contêineres de carga (dois abertos com loot e inimigos dentro, um fechado
    // atrás), empilhadeira, paletes de caixas de munição e arame farpado
    const c1 = container(sub(-1.7, -0.6), 6, 2.4, 2.5, X.contRed), c2 = container(sub(1.7, -1.0), 6, 2.4, 2.5, X.contBlue);
    out.crateSpots.push(c1.inside, c2.inside);
    container(sub(0, -5.4, Math.PI / 2), 6, 2.4, 2.5, X.contGreen, false);
    { const fl = new THREE.Group(); const b2 = new THREE.Mesh(boxGeo(1.1, 1.0, 1.6), X.yellow); b2.position.y = 0.8; fl.add(b2);
      const cab = new THREE.Mesh(boxGeo(1.0, 0.08, 1.0), m.steel); cab.position.set(0, 2.1, -0.1); fl.add(cab);
      for (const sx of [-1, 1]) { const p2 = new THREE.Mesh(boxGeo(0.06, 1.8, 0.06), m.steel); p2.position.set(sx * 0.45, 1.2, -0.55); fl.add(p2); const ms = new THREE.Mesh(boxGeo(0.08, 2.2, 0.08), m.steel); ms.position.set(sx * 0.3, 1.1, 0.85); fl.add(ms); const fk = new THREE.Mesh(boxGeo(0.1, 0.05, 1.0), m.steel); fk.position.set(sx * 0.3, 0.12, 1.4); fl.add(fk); }
      for (const sx of [-1, 1]) for (const sz of [-0.5, 0.5]) { const w = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.2, 12), X.rubber); w.rotation.z = Math.PI / 2; w.position.set(sx * 0.58, 0.28, sz); fl.add(w); }
      decor(site, fl, 4.0, 0, 2.4, -0.5); hidden(site, 4.0, 0, 2.4, 1.2, 1.6, 2.2, -0.5); }
    for (const [px, pz] of [[-3.9, 2.4], [-3.6, 3.4]]) { decor(site, new THREE.Mesh(boxGeo(1.2, 0.14, 1.0), m.plank), px, 0.07, pz); }
    ammoCrate(site, -3.9, 2.4); ammoCrate(site, -3.6, 3.4);
    barbed(site, -4.6, 4.4, 4.6, 4.4);
    flag(site, 4.4, -2.6, 4.2, 'mil');
    out.yard = P(0, 3.4); out.fire = P(-0.8, 3.8);
    spot(site, 0, 2.6); spot(site, -3.6, 0.2); spot(site, 3.7, 0.4);
  } else if (type === 'trincheira') {
    // TRINCHEIRAS: sacos de areia em zigue-zague virados para o mar, ninho de metralhadora fechado,
    // duas barracas de lona atrás, arame farpado e caixas de munição
    const zz = [[-5.4, 1.2], [-2.7, 3.0], [0, 1.4], [2.7, 3.0], [5.4, 1.2]];
    for (let i = 0; i < zz.length - 1; i++) sandbags(site, zz[i][0], zz[i][1], zz[i + 1][0], zz[i + 1][1], 4);
    const NR = 1.7, nz = -1.4;
    for (let i = 0; i < 8; i++) { if (i === 4) continue; const a0 = i * Math.PI / 4 - Math.PI / 8, a1 = a0 + Math.PI / 4; sandbags(site, Math.sin(a0) * NR, nz + Math.cos(a0) * NR, Math.sin(a1) * NR, nz + Math.cos(a1) * NR, 4); }
    { const mg = new THREE.Group(); for (let k = 0; k < 3; k++) { const leg = new THREE.Mesh(boxGeo(0.04, 1.0, 0.04), m.steel); leg.position.set(Math.sin(k * 2.1) * 0.25, 0.45, Math.cos(k * 2.1) * 0.25); leg.rotation.set(Math.cos(k * 2.1) * 0.4, 0, -Math.sin(k * 2.1) * 0.4); mg.add(leg); }
      const gun = new THREE.Mesh(boxGeo(0.14, 0.18, 1.0), X.gunmetal); gun.position.y = 1.0; mg.add(gun); const bar = cylY(0.035, 0.8, X.gunmetal, 6); bar.rotation.x = Math.PI / 2; bar.position.set(0, 1.02, 0.85); mg.add(bar);
      decor(site, mg, 0, 0, nz + 0.8); }
    rooms.push({ ...roomOf(sub(0, nz), NR * 0.9, NR * 0.9), door: [P(0, nz - NR + 0.8), P(0, nz - NR - 1.2)], fort: true });
    tent(site, -3.6, -3.8, 0, m.canvas, 3, 2.2, 1.7); tent(site, 3.6, -4.0, 0.2, m.canvasTan, 3, 2.2, 1.7);
    barbed(site, -5, 4.6, 5, 4.6);
    ammoCrate(site, -1.8, 0.2); ammoCrate(site, 1.9, 0.4);
    flag(site, 5.0, -1.6, 3.8, 'mil');
    out.crateSpots.push(P(0, nz - 0.4));
    out.yard = P(0, -4.0); out.fire = P(0, -4.4);
    spot(site, -2.7, 2.1); spot(site, 2.7, 2.1); spot(site, -5.0, 0.4); spot(site, 5.0, 0.4); spot(site, 0.5, nz + 0.1);
  } else if (type === 'artilharia') {
    // ARTILHARIA: obuseiro pesado (cano longo apontado para o mar) dentro de um anel de sacos de areia,
    // rede de camuflagem por cima, pilhas de granadas de latão e paiol de concreto atrás
    const RR = 4.2;
    for (let i = 0; i < 10; i++) { if (i === 5) continue; const a0 = i / 10 * Math.PI * 2 - Math.PI / 10, a1 = a0 + Math.PI / 5; sandbags(site, Math.sin(a0) * RR, Math.cos(a0) * RR, Math.sin(a1) * RR, Math.cos(a1) * RR, 3); }
    { const gun = new THREE.Group();
      for (const sx of [-1, 1]) { const trail = new THREE.Mesh(boxGeo(0.2, 0.2, 2.4), m.olive); trail.position.set(sx * 0.5, 0.25, -1.3); trail.rotation.y = sx * 0.25; gun.add(trail);
        const w = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.28, 16), X.rubber); w.rotation.z = Math.PI / 2; w.position.set(sx * 0.95, 0.55, 0.1); gun.add(w); }
      const cradle = new THREE.Mesh(boxGeo(1.4, 0.5, 1.4), m.olive); cradle.position.y = 0.9; gun.add(cradle);
      const shieldP = new THREE.Mesh(boxGeo(2.0, 1.1, 0.08), m.olive); shieldP.position.set(0, 1.25, 0.75); shieldP.rotation.x = -0.15; gun.add(shieldP);
      const barrelG = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.2, 4.4, 12), X.gunmetal); barrelG.geometry.translate(0, 2.2, 0); barrelG.rotation.x = Math.PI / 2 - 0.35; barrelG.position.set(0, 1.15, -0.2); gun.add(barrelG);
      const brake = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.4, 10), X.gunmetal); brake.rotation.x = Math.PI / 2 - 0.35; brake.position.set(0, 1.15 + Math.cos(Math.PI / 2 - 0.35) * 4.3, -0.2 + Math.sin(Math.PI / 2 - 0.35) * 4.3); gun.add(brake);
      decor(site, gun, 0, 0, 0.2); hidden(site, 0, 0, 0, 2.0, 1.5, 2.6); }
    { const net = new THREE.Mesh(new THREE.PlaneGeometry(6.4, 6.4, 8, 8), X.camo); const p = net.geometry.attributes.position; for (let i = 0; i < p.count; i++) p.setZ(i, -0.25 * (1 - (p.getX(i) / 3.2) ** 2) * (1 - (p.getY(i) / 3.2) ** 2)); net.geometry.computeVertexNormals(); net.rotation.x = -Math.PI / 2; decor(site, net, 0, 2.9, 0);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) decor(site, cylY(0.05, 2.9, m.log, 6), sx * 2.9, 1.45, sz * 2.9); }
    for (const [px, pz] of [[-2.2, -1.6], [2.3, -1.4]]) for (let k = 0; k < 6; k++) decor(site, cylY(0.09, 0.55, X.brass, 8), px + (k % 3) * 0.2, 0.28, pz + ((k / 3) | 0) * 0.2);
    const shed = concrete(sub(0, -5.6), 3.4, 2.6, 2.3); out.crateSpots.push(shed.inside);
    ammoCrate(site, 2.6, 1.0);
    flag(site, -3.0, -4.8, 4.0, 'mil');
    rooms.push({ ...roomOf(site, RR * 0.9, RR * 0.9), door: [P(0, -RR + 1.2), P(0, -RR - 1.4)], fort: true });
    out.yard = P(0, -1.8); out.fire = P(1.2, -2.6);
    spot(site, -1.9, 1.4); spot(site, 1.9, 1.6); spot(site, -0.6, -2.4);
  } else if (type === 'comunicacoes') {
    // TORRE DE COMUNICAÇÕES: torre de aço com plataforma (atirador lá em cima), mastro de antena com
    // luz vermelha no alto, parabólica pequena, casa de rádio, gerador e bobina de cabo
    const H = 6.2;
    watchTower(site, 0, -0.8, H, m.steel, m.steel, 1.0, 1);
    decor(site, cylY(0.07, 6.0, m.steel, 6), 0, H + 2.4 + 3.0, -0.8);
    decor(site, new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), X.glowR), 0, H + 8.5, -0.8);
    for (const y of [H + 3.6, H + 5.4]) { const arm = new THREE.Mesh(boxGeo(1.4, 0.05, 0.05), m.steel); decor(site, arm, 0, y, -0.8); }
    for (const sx of [-1, 1]) { const d2 = new THREE.Mesh(new THREE.SphereGeometry(0.4, 12, 6, 0, Math.PI * 2, 0, 0.9), X.white); d2.rotation.z = sx * 1.3; decor(site, d2, sx * 0.4, H + 4.4, -0.8); }
    const hut = concrete(sub(3.6, 1.4, -Math.PI / 2), 3.6, 2.8, 2.4); out.crateSpots.push(hut.inside);
    solid(site, -3.0, 0, 1.0, 1.4, 1.0, 0.9, m.olive);
    cylSolid(site, -2.8, -2.8, 0.6, 0.9, m.plankDark, 0, 12);
    dish(site, -3.3, 3.2, 1.2, 0.5, 0.8);
    flag(site, 2.8, -3.0, 3.8, 'mil');
    out.yard = P(-0.6, 3.0); out.fire = P(0.2, 3.6);
    spot(site, -1.6, 1.8); spot(site, 1.0, 3.8);
  } else if (type === 'ovni') {
    // CRATERA DO OVNI: disco voador enorme cravado no meio de uma cratera chamuscada, pedaços
    // brilhando espalhados, barracas brancas de quarentena, holofotes e fita de isolamento
    decor(site, new THREE.Mesh(new THREE.CircleGeometry(5.6, 32).rotateX(-Math.PI / 2), X.scorch), 0, 0.03, 0.4);
    for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2 + r() * 0.3, d = 5.2 + r() * 0.5, s = 0.8 + r() * 0.5; const mound = new THREE.Mesh(new THREE.SphereGeometry(s, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), X.rockDark); mound.scale.y = 0.45; decor(site, mound, Math.sin(a) * d, 0, 0.4 + Math.cos(a) * d, r() * 3); }
    ufo(site, 0, 0.6, 0.4, 1.55, 0.38, 0.4);
    hidden(site, 0, 0, 0.4, 5.6, 1.9, 5.6);
    for (let i = 0; i < 8; i++) { const a = r() * 6.28, d = 3.4 + r() * 1.6, sh = new THREE.Mesh(new THREE.TetrahedronGeometry(0.2 + r() * 0.25), X.glowG); sh.rotation.set(r() * 3, 0, r() * 3); decor(site, sh, Math.sin(a) * d, 0.12, 0.4 + Math.cos(a) * d); }
    tent(site, -4.8, -4.0, 0.9, X.whiteCanvas, 3.2, 2.4, 1.9); tent(site, 4.8, -4.2, -0.9, X.whiteCanvas, 3.2, 2.4, 1.9);
    for (const [lx, lz] of [[-4.6, 4.8], [4.8, 4.4], [0, -6.0]]) floodlight(site, lx, lz, 3.6, Math.atan2(-lx, 0.4 - lz));
    for (let i = 0; i < 6; i++) { const a0 = 0.5 + i * 0.5, a1 = a0 + 0.5, d = 6.6; const len = 2 * d * Math.sin(0.25); const tape = new THREE.Mesh(boxGeo(0.02, 0.08, len), X.yellow); decor(site, tape, Math.sin(a0 + 0.25) * d * Math.cos(0.25), 1.0, 0.4 + Math.cos(a0 + 0.25) * d * Math.cos(0.25), a0 + 0.25 + Math.PI / 2); decor(site, cylY(0.04, 1.1, m.steel, 5), Math.sin(a1) * d, 0.55, 0.4 + Math.cos(a1) * d); }
    out.crateSpots.push(P(-4.0, -1.4), P(3.6, 3.8));
    out.yard = P(-2.0, 5.8); out.fire = P(-2.6, 6.0);
    spot(site, -3.6, 3.4); spot(site, 3.8, -1.2); spot(site, -1.6, -4.4);
  } else if (type === 'domo') {
    // OBSERVATÓRIO: sala redonda de concreto (octógono) com a cúpula branca e a fresta aberta, um
    // telescópio enorme lá dentro, painel de controle e uma parabólica do lado de fora
    const OR = 3.4, oc = -0.6, WHt = 2.7;
    for (let i = 0; i < 8; i++) {
      const a0 = (i - 0.5) / 8 * Math.PI * 2, a1 = (i + 0.5) / 8 * Math.PI * 2;
      const p0 = [Math.sin(a0) * OR, oc + Math.cos(a0) * OR], p1 = [Math.sin(a1) * OR, oc + Math.cos(a1) * OR];
      if (i === 0) {
        const L = (t) => [p0[0] + (p1[0] - p0[0]) * t, p0[1] + (p1[1] - p0[1]) * t], q0 = L(0.27), q1 = L(0.73);
        seg(site, p0[0], p0[1], q0[0], q0[1], WHt, m.concrete); seg(site, q1[0], q1[1], p1[0], p1[1], WHt, m.concrete);
        seg(site, q0[0], q0[1], q1[0], q1[1], WHt - 2.1, m.concrete, 0.22, 2.1);
      } else seg(site, p0[0], p0[1], p1[0], p1[1], WHt, m.concrete);
    }
    decor(site, new THREE.Mesh(new THREE.SphereGeometry(OR + 0.15, 28, 12, 0, Math.PI * 2, 0, Math.PI / 2), X.white), 0, WHt, oc);
    { const slit = new THREE.Mesh(boxGeo(0.8, 0.06, 2.4), X.black); slit.rotation.x = -0.75; decor(site, slit, 0, WHt + OR * 0.68, oc + OR * 0.6); }
    blocker(site, 0, WHt, oc, OR * 1.4, 1.6, OR * 1.4);
    cylSolid(site, 0, oc - 0.6, 0.45, 1.2, m.steel);
    { const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.45, 3.0, 14), X.brass); tube.rotation.x = 0.85; decor(site, tube, 0, 1.9, oc - 0.1); }
    solid(site, -1.9, 0, oc - 1.2, 1.2, 0.9, 0.5, m.steel, 0.6);
    decor(site, new THREE.Mesh(boxGeo(0.9, 0.5, 0.05), X.glowB), -1.95, 1.2, oc - 1.3, 0.6);
    rooms.push({ x: P(0, oc)[0], z: P(0, oc)[1], yaw: ctx.yaw, hw: OR * 0.72, hd: OR * 0.72, door: [P(0, oc + OR - 0.9), P(0, oc + OR + 1.3)] });
    out.crateSpots.push(P(1.6, oc - 1.0));
    dish(site, 4.6, 2.8, 1.4, 0.6, -0.4);
    sign(site, -1.6, 3.6); sign(site, 1.6, 3.6);
    spot(site, -1.3, oc + 1.0); spot(site, 2.6, 4.4); spot(site, -3.4, 3.6);
    out.yard = P(0, 4.4); out.fire = P(-1.0, 4.8);
  } else if (type === 'criogenia') {
    // CRIOGENIA: laboratório comprido com uma fileira de cápsulas de vidro (gente congelada lá dentro,
    // luz azul), tanques de nitrogênio deitados lá fora, canos e placas de perigo
    const labF = sub(0, -1.6), LD = 4.0;
    const lab = concrete(labF, 8.0, LD, 2.9); out.crateSpots.push(lab.inside);
    for (const px of [-3.0, -1.4, 0.2]) {
      decor(labF, new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 2.0, 16, 1, true), X.glass), px, 1.15, -1.4);
      decor(labF, new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 1.9, 16), X.liquidB), px, 1.1, -1.4);
      decor(labF, new THREE.Mesh(new THREE.CapsuleGeometry(0.17, 0.9, 4, 8), X.frozen), px, 1.1, -1.4);
      for (const y of [0.08, 2.2]) decor(labF, cylY(0.5, 0.16, m.steel, 16), px, y, -1.4);
      const [x, z] = P(px, -1.4, labF.yaw, labF.x, labF.z); set.items.push({ type: 'cyl', x, y: TOP + 1.15, z, hx: 0.5, hy: 1.15, hz: 0.5 });
    }
    for (const sx of [-1, 1]) {
      const tank = new THREE.Mesh(new THREE.CapsuleGeometry(0.7, 1.8, 6, 14), X.white); tank.rotation.z = Math.PI / 2; decor(site, tank, sx * 3.2, 1.05, 2.4);
      for (const k of [-0.7, 0.7]) decor(site, new THREE.Mesh(boxGeo(0.2, 0.5, 1.2), m.steel), sx * 3.2 + k, 0.25, 2.4);
      decor(site, new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), X.glowB), sx * 3.2, 1.85, 2.4);
      hidden(site, sx * 3.2, 0, 2.4, 3.1, 1.8, 1.5);
      const pipe = cylY(0.07, 2.4, m.steel, 6); pipe.rotation.x = Math.PI / 2; decor(site, pipe, sx * 2.4, 0.4, 1.0);
    }
    sign(site, -0.9, 0.9); sign(site, 0.9, 0.9, X.glowB);
    out.yard = P(0, 3.2); out.fire = P(0, 4.2);
    spot(site, -1.0, 2.2); spot(site, 1.4, 4.0); spot(site, 4.7, -1.0);
  } else if (type === 'antenas') {
    // CAMPO DE ANTENAS: três parabólicas grandes apontadas para o mesmo ponto do céu, bandejas de cabo
    // até a casa de controle, gerador e placas
    for (const [lx, lz, R2] of [[-4.0, -1.4, 1.9], [0, -3.8, 2.3], [4.0, -1.4, 1.9]]) {
      dish(site, lx, lz, R2, 0.45, 0.3);
      const len = Math.hypot(lx, lz - 2.6) - 2.2, tray = new THREE.Mesh(boxGeo(0.3, 0.08, len), m.steel); decor(site, tray, lx * 0.5, 0.06, (lz + 2.6) * 0.5 - 0.4, Math.atan2(lx, lz - 2.6));
    }
    const hut = concrete(sub(0, 2.6, Math.PI), 3.8, 2.8, 2.4); out.crateSpots.push(hut.inside);
    solid(site, 3.2, 0, 2.8, 1.4, 1.0, 0.9, m.steel);
    sign(site, -3.2, 3.4); sign(site, -2.2, 4.2);
    flag(site, 3.6, 4.0, 3.8, 'z51');
    out.yard = P(0, -0.6); out.fire = P(1.4, 0.4);
    spot(site, -2.2, 0.4); spot(site, 2.4, -0.2); spot(site, -4.2, 2.2);
  } else if (type === 'reator') {
    // REATOR EXPERIMENTAL: núcleo cilíndrico brilhando verde com anéis de contenção, duas torres de
    // resfriamento, sala de controle, barris radioativos e placas de perigo
    const rz = -0.6;
    cylSolid(site, 0, rz, 1.9, 0.8, m.concreteDark, 0, 20);
    decor(site, new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 3.2, 20), X.liquidG), 0, 2.4, rz);
    for (const y of [1.3, 2.4, 3.5]) { const ring = new THREE.Mesh(new THREE.TorusGeometry(1.22, 0.12, 8, 24), m.steel); ring.rotation.x = Math.PI / 2; decor(site, ring, 0, y, rz); }
    for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2 + 0.4, post = new THREE.Mesh(boxGeo(0.12, 3.3, 0.12), m.steel); decor(site, post, Math.sin(a) * 1.24, 2.45, rz + Math.cos(a) * 1.24); }
    decor(site, cylY(1.35, 0.3, m.steel, 20), 0, 4.15, rz);
    { const [x, z] = P(0, rz); set.items.push({ type: 'cyl', x, y: TOP + 2.5, z, hx: 1.3, hy: 1.7, hz: 1.3 }); }
    const towerGeo = new THREE.LatheGeometry([new THREE.Vector2(1.7, 0), new THREE.Vector2(1.35, 1.5), new THREE.Vector2(1.12, 3.0), new THREE.Vector2(1.22, 4.2), new THREE.Vector2(1.4, 4.9)], 22);
    for (const [lx, lz] of [[-4.2, -2.6], [4.2, -2.8]]) {
      const t = new THREE.Mesh(towerGeo, X.concreteDS); decor(site, t, lx, 0, lz);
      const [x, z] = P(lx, lz); set.items.push({ type: 'cyl', x, y: TOP + 2.45, z, hx: 1.55, hy: 2.45, hz: 1.55 });
    }
    const control = concrete(sub(0, 3.6, Math.PI), 3.8, 2.8, 2.4); out.crateSpots.push(control.inside);
    for (const [lx, lz] of [[2.6, 1.6], [3.1, 2.2], [-2.8, 1.8]]) drum(site, lx, lz, X.yellow, X.glowG);
    sign(site, -1.8, 1.6); sign(site, 1.8, -3.4);
    out.yard = P(-2.6, 2.4); out.fire = P(-3.4, 2.8);
    spot(site, 2.4, 0.6); spot(site, -2.2, 0.8); spot(site, 0, -3.4);
  } else if (type === 'quarentena') {
    // ZONA DE QUARENTENA: barracas brancas de isolamento, contêiner de descontaminação (dá para entrar),
    // macas, cortinas de plástico, barris de risco biológico e fita de isolamento
    tent(site, -4.2, -2.0, 0.5, X.whiteCanvas, 3.4, 2.6, 2.0); tent(site, 0, -4.2, 0, X.whiteCanvas, 3.4, 2.6, 2.0); tent(site, 4.2, -2.0, -0.5, X.whiteCanvas, 3.4, 2.6, 2.0);
    const dc = container(sub(0, 3.0, Math.PI / 2), 5, 2.4, 2.5, X.white); out.crateSpots.push(dc.inside);
    for (const sx of [-1, 1]) {
      decor(site, new THREE.Mesh(boxGeo(0.7, 0.08, 1.9), X.whiteCanvas), sx * 1.6, 0.62, -0.4, sx * 0.2);
      for (const k of [-0.8, 0.8]) decor(site, new THREE.Mesh(boxGeo(0.6, 0.6, 0.05), m.steel), sx * 1.6 + Math.sin(sx * 0.2) * k, 0.3, -0.4 + Math.cos(sx * 0.2) * k, sx * 0.2);
      hidden(site, sx * 1.6, 0, -0.4, 0.7, 0.66, 1.9, sx * 0.2);
      const curtain = new THREE.Mesh(new THREE.PlaneGeometry(2.0, 2.0), X.plastic); decor(site, curtain, sx * 2.8, 1.0, -0.2, sx * 1.1);
    }
    for (const [lx, lz] of [[3.6, 1.4], [4.2, 1.9], [-3.8, 1.6]]) drum(site, lx, lz, X.yellow);
    for (const [lx, lz] of [[-5.6, 0.2], [5.6, 0.2], [-5.6, 4.6], [5.6, 4.6]]) decor(site, cylY(0.04, 1.1, m.steel, 5), lx, 0.55, lz);
    for (const [lx, lz, len, yo] of [[0, 4.6, 11.2, Math.PI / 2], [-5.6, 2.4, 4.4, 0], [5.6, 2.4, 4.4, 0]]) decor(site, new THREE.Mesh(boxGeo(0.02, 0.08, len), X.yellow), lx, 1.0, lz, yo);
    out.crateSpots.push(P(-1.4, -2.0));
    out.yard = P(0, 0.9); out.fire = P(1.0, 1.2);
    spot(site, -2.3, 0.8); spot(site, 2.4, -0.2);
  } else if (type === 'monolito') {
    // CAMPO DO MONÓLITO: círculos marcados na grama (agroglifo) em volta de um monólito preto que brilha
    // nas bordas, a van dos agentes, mesa com equipamento, holofotes e uma barraca
    for (const [r0, r1] of [[1.6, 1.9], [3.0, 3.35], [4.6, 5.0]]) decor(site, new THREE.Mesh(new THREE.RingGeometry(r0, r1, 40).rotateX(-Math.PI / 2), X.cropRing), 0, 0.03, 0);
    for (let k = 0; k < 6; k++) { const line = new THREE.Mesh(boxGeo(0.18, 0.01, 3.0), X.cropRing); decor(site, line, Math.sin(k * 1.047) * 3.4, 0.035, Math.cos(k * 1.047) * 3.4, k * 1.047); }
    solid(site, 0, 0, 0, 1.1, 4.4, 0.4, X.black);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) decor(site, new THREE.Mesh(boxGeo(0.05, 4.42, 0.05), X.glowG), sx * 0.55, 2.2, sz * 0.2);
    decor(site, new THREE.Mesh(boxGeo(1.14, 0.05, 0.44), X.glowG), 0, 4.42, 0);
    { const van = new THREE.Group(); const vb = new THREE.Mesh(boxGeo(2.0, 1.9, 4.4), X.white); vb.position.y = 1.3; van.add(vb);
      const ws = new THREE.Mesh(boxGeo(1.8, 0.7, 0.05), X.glassDark); ws.position.set(0, 1.75, 2.21); van.add(ws);
      for (const sx of [-1, 1]) for (const sz of [-1.4, 1.4]) { const w = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.38, 0.26, 14), X.rubber); w.rotation.z = Math.PI / 2; w.position.set(sx * 1.0, 0.38, sz); van.add(w); }
      const vd = new THREE.Mesh(new THREE.SphereGeometry(0.5, 12, 6, 0, Math.PI * 2, 0, 0.9), X.white); vd.rotation.x = 0.6; vd.position.set(0, 2.4, -1.2); van.add(vd);
      decor(site, van, -4.2, 0, -2.0, 0.5); hidden(site, -4.2, 0, -2.0, 2.1, 2.3, 4.5, 0.5); }
    solid(site, 3.2, 0, -2.4, 1.6, 0.8, 0.8, m.steel);
    decor(site, new THREE.Mesh(boxGeo(0.4, 0.03, 0.3), X.gunmetal), 3.1, 0.82, -2.4); { const scr = new THREE.Mesh(boxGeo(0.4, 0.28, 0.02), X.glowB); scr.rotation.x = -0.3; decor(site, scr, 3.1, 0.98, -2.55); }
    floodlight(site, 4.4, 1.6, 3.4, Math.atan2(-4.4, -1.6)); floodlight(site, -3.4, 3.4, 3.4, Math.atan2(3.4, -3.4));
    tent(site, 3.8, 3.2, -2.4, m.canvasTan, 2.8, 2.2, 1.7);
    out.crateSpots.push(P(-2.6, 2.6));
    out.yard = P(1.4, 2.4); out.fire = P(1.8, 4.8);
    spot(site, -1.8, -1.6); spot(site, 1.6, 1.4); spot(site, -1.2, 3.2);
  } else {
    // paliçada quadrada com portão na frente (+Z)
    const S = 5.4, gate = 1.4;
    const logsOnLine = (x0, z0, x1, z1) => {
      const len = Math.hypot(x1 - x0, z1 - z0), n = Math.max(1, Math.round(len / 0.31));
      for (let i = 0; i <= n; i++) {
        const t = i / n, lx = x0 + (x1 - x0) * t, lz = z0 + (z1 - z0) * t, h = 2.5 + r() * 0.35, rad = 0.14 + r() * 0.03;
        decor(site, cylY(rad, h, m.log, 7), lx, h / 2, lz, r() * 6);
        const tip = new THREE.Mesh(new THREE.ConeGeometry(rad, 0.38, 7), m.logEnd);
        decor(site, tip, lx, h + 0.19, lz);
      }
    };
    logsOnLine(-S, -S, S, -S); logsOnLine(-S, -S, -S, S); logsOnLine(S, -S, S, S);
    logsOnLine(-S, S, -gate, S); logsOnLine(gate, S, S, S);
    // travessas por dentro (reforço) e colisores das 4 paredes
    for (const [x0, z0, x1, z1] of [[-S, -S + 0.25, S, -S + 0.25], [-S + 0.25, -S, -S + 0.25, S], [S - 0.25, -S, S - 0.25, S]]) {
      const len = Math.hypot(x1 - x0, z1 - z0), b = new THREE.Mesh(boxGeo(0.12, 0.18, len), m.plankDark);
      decor(site, b, (x0 + x1) / 2, 1.9, (z0 + z1) / 2, Math.atan2(x1 - x0, z1 - z0));
    }
    blocker(site, 0, 0, -S, 2 * S + 0.3, 2.6, 0.34);
    blocker(site, -S, 0, 0, 0.34, 2.6, 2 * S + 0.3);
    blocker(site, S, 0, 0, 0.34, 2.6, 2 * S + 0.3);
    blocker(site, -(S + gate) / 2, 0, S, S - gate + 0.15, 2.6, 0.34);
    blocker(site, (S + gate) / 2, 0, S, S - gate + 0.15, 2.6, 0.34);
    // portão: postes grossos, arco com a bandeira e as duas folhas abertas para dentro
    for (const sx of [-1, 1]) decor(site, cylY(0.2, 3.3, m.log, 8), sx * (gate + 0.05), 1.65, S);
    const arch = new THREE.Mesh(boxGeo(2 * gate + 0.7, 0.26, 0.3), m.plankDark); decor(site, arch, 0, 3.0, S);
    for (const sx of [-1, 1]) {
      const leaf = new THREE.Mesh(boxGeo(gate - 0.05, 2.2, 0.12), m.plankDark);
      leaf.geometry.translate(-sx * (gate - 0.05) / 2, 0, 0);
      decor(site, leaf, sx * gate, 1.15, S - 0.05, sx * 1.35);
    }
    flag(site, 0, S + 0.05, 4.4);
    // torres de vigia nos cantos da frente (com colisão e escada por dentro do forte)
    for (const sx of [-1, 1]) watchTower(site, sx * (S - 0.9), S - 0.9, 2.75, m.log, m.thatch, 0.75, -1);
    // cabana no fundo, fogueira no centro, barris e caixotes nas paredes
    const [hx, hz] = P(0, -S + 2.35);
    const c = cabin({ x: hx, z: hz, yaw: ctx.yaw }, 4.2, 3.2, 2.2);
    out.crateSpots.push(c.inside);
    barrel(site, -S + 0.7, 0.6); barrel(site, -S + 0.75, 1.3); barrel(site, S - 0.7, -0.4);
    crateStack(site, S - 0.8, 0.6); crateStack(site, -S + 0.8, -1.6);
    rooms.push({ ...roomOf(site, S, S), door: [P(0, S - 1.2), P(0, S + 1.4)], fort: true });
    out.yard = P(0, 0.8); out.fire = out.yard;
    for (const [x, z] of [[-3, -1.6], [3, -1.2], [-2.6, 2.6], [2.8, 2.4], [0, 3.6], [-1, -3.8]]) spot(site, x, z);
  }
  return out;
}

// Dentro de um cômodo (retângulo girado)?
export function inRoom(room, x, z, pad = 0) {
  const [lx, lz] = rot(x - room.x, z - room.z, -room.yaw);
  return Math.abs(lx) < room.hw + pad && Math.abs(lz) < room.hd + pad;
}
