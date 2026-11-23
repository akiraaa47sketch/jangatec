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
  const flag = (frame, lx, lz, h) => {
    const pole = cylY(0.05, h, m.log, 6); decor(frame, pole, lx, h / 2, lz);
    const c = document.createElement('canvas'); c.width = 128; c.height = 80;
    const g = c.getContext('2d'); g.fillStyle = '#141416'; g.fillRect(0, 0, 128, 80);
    g.fillStyle = '#eee'; g.beginPath(); g.arc(64, 32, 16, 0, 6.3); g.fill(); g.fillRect(55, 40, 18, 12);
    g.fillStyle = '#141416'; g.beginPath(); g.arc(58, 32, 4.5, 0, 6.3); g.arc(70, 32, 4.5, 0, 6.3); g.fill();
    g.strokeStyle = '#eee'; g.lineWidth = 6; g.beginPath(); g.moveTo(36, 56); g.lineTo(92, 74); g.moveTo(92, 56); g.lineTo(36, 74); g.stroke();
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
  } else if (type === 'militar') {
    // base militar: muro de sacos de areia com portão, arame farpado, duas torres de soldado,
    // alojamento de concreto, tenda de comando, caixas de munição e mastro com bandeira
    const S = 8;
    sandbags(site, -S, -S, S, -S, 4); sandbags(site, -S, -S, -S, S, 4); sandbags(site, S, -S, S, S, 4);
    sandbags(site, -S, S, -1.6, S, 4); sandbags(site, 1.6, S, S, S, 4);
    barbed(site, -S - 0.8, S + 0.8, -1.8, S + 0.8); barbed(site, 1.8, S + 0.8, S + 0.8, S + 0.8);
    watchTower(site, -S + 1.3, S - 1.3, 5, m.olive, m.canvas, 0.9); watchTower(site, S - 1.3, -S + 1.3, 5, m.olive, m.canvas, 0.9);
    const bar = concrete({ x: P(-2, -S + 2.6)[0], z: P(-2, -S + 2.6)[1], yaw: ctx.yaw }, 7, 3.6, 2.8);
    out.crateSpots.push(bar.inside);
    tent(site, S - 2.6, 2.2, -Math.PI / 2, m.canvas, 3.6, 2.8, 2.1);
    for (const [x, z] of [[3.2, -4.6], [4.2, -4.4], [3.6, -3.6], [-5.4, 2.2], [-5.4, 3.0]]) ammoCrate(site, x, z);
    for (const [x, z] of [[5.6, -5.6], [6.3, -5.2]]) barrel(site, x, z);
    flag(site, 0, 0, 5.4);
    out.yard = P(0, 2); out.fire = P(-2.4, 3.2);
    for (const [x, z] of [[-4, 5.5], [4, 5.5], [0, 4.2], [-6, -1], [6, 3.5], [2.5, -2], [-1.5, 1.2], [5, -1]]) spot(site, x, z);
    rooms.push({ x: ctx.cx, z: ctx.cz, yaw: ctx.yaw, hw: S * 0.95, hd: S * 0.95, door: [P(0, S - 1.4), P(0, S + 1.6)], fort: true });
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
