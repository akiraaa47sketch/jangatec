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

  const out = { rooms, crateSpots: [], fire: null, yard: [ctx.cx, ctx.cz] };
  const site = { x: ctx.cx, z: ctx.cz, yaw: ctx.yaw };
  if (type === 'hut') {
    // cabana atrás, fogueira no pátio da frente
    const [hx, hz] = P(0, -2.2);
    const c = cabin({ x: hx, z: hz, yaw: ctx.yaw });
    out.crateSpots.push(c.inside);
    barrel(site, 2.6, -0.4); barrel(site, 2.9, 0.25); crateStack(site, -2.7, -0.2);
    flag(site, -2.9, 0.9, 3.4);
    out.yard = P(0, 1.6); out.fire = out.yard;
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
    // torres de vigia nos cantos da frente
    for (const sx of [-1, 1]) {
      const tx = sx * (S - 0.9), tz = S - 0.9;
      for (const ox of [-0.7, 0.7]) for (const oz of [-0.7, 0.7]) decor(site, cylY(0.1, 4.2, m.log, 7), tx + ox, 2.1, tz + oz);
      const plat = new THREE.Mesh(boxGeo(1.9, 0.14, 1.9), m.floor); decor(site, plat, tx, 2.75, tz);
      for (const [ox, oz, w, l] of [[0, 0.92, 1.9, 0.08], [0, -0.92, 1.9, 0.08], [0.92, 0, 0.08, 1.9], [-0.92, 0, 0.08, 1.9]]) {
        const rail = new THREE.Mesh(boxGeo(w, 0.5, l), m.plank); decor(site, rail, tx + ox, 3.08, tz + oz);
      }
      const roof = new THREE.Mesh(new THREE.ConeGeometry(1.55, 0.9, 4), m.thatch); roof.rotation.y = Math.PI / 4; decor(site, roof, tx, 4.6, tz);
      // escada encostada
      const ladder = new THREE.Group();
      for (const lx2 of [-0.22, 0.22]) { const rail = new THREE.Mesh(boxGeo(0.07, 3.0, 0.07), m.log); rail.position.x = lx2; ladder.add(rail); }
      for (let i = 0; i < 7; i++) { const rung = new THREE.Mesh(boxGeo(0.44, 0.05, 0.05), m.log); rung.position.y = -1.3 + i * 0.42; ladder.add(rung); }
      ladder.rotation.x = -0.25;
      decor(site, ladder, tx - sx * 0.2, 1.45, tz - 1.15);
      blocker(site, tx, 0, tz, 1.5, 0.6, 1.5); // base da torre (não atravessa os postes)
    }
    // cabana no fundo, fogueira no centro, barris e caixotes nas paredes
    const [hx, hz] = P(0, -S + 2.35);
    const c = cabin({ x: hx, z: hz, yaw: ctx.yaw }, 4.2, 3.2, 2.2);
    out.crateSpots.push(c.inside);
    barrel(site, -S + 0.7, 0.6); barrel(site, -S + 0.75, 1.3); barrel(site, S - 0.7, -0.4);
    crateStack(site, S - 0.8, 0.6); crateStack(site, -S + 0.8, -1.6);
    rooms.push({ ...roomOf(site, S, S), door: [P(0, S - 1.2), P(0, S + 1.4)], fort: true });
    out.yard = P(0, 0.8); out.fire = out.yard;
  }
  return out;
}

// Dentro de um cômodo (retângulo girado)?
export function inRoom(room, x, z, pad = 0) {
  const [lx, lz] = rot(x - room.x, z - room.z, -room.yaw);
  return Math.abs(lx) < room.hw + pad && Math.abs(lz) < room.hd + pad;
}
