// Acampamento de SUCATA: muro de chapas onduladas enferrujadas com portão, um contêiner virado
// "casa" (porta e janela recortadas, puxadinho de chapa), um barraco de chapas e TORRES de
// andaime com plataforma blindada e um morteiro em cima. As torres podem ser derrubadas a tiro
// de canhão (veja systems/siege.js): ficam num grupo próprio, com os colisores guardados.
import * as THREE from '../three.js';
import { rot } from '../core/util.js';

// ---------- texturas (canvas) ----------
const texCache = {};
function canvasTex(key, draw, w = 256, h = 256) {
  if (texCache[key]) return texCache[key];
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return (texCache[key] = t);
}
// chapa ondulada: listras verticais (ondas) + manchas de ferrugem e escorridos
function corrugated(base, seed) {
  return canvasTex('corr' + base + seed, (g, W, H) => {
    let s = seed * 9301 + 49297; const r = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
    g.fillStyle = base; g.fillRect(0, 0, W, H);
    for (let x = 0; x < W; x += 16) {
      const gr = g.createLinearGradient(x, 0, x + 16, 0);
      gr.addColorStop(0, 'rgba(0,0,0,0.28)'); gr.addColorStop(0.45, 'rgba(255,255,255,0.16)'); gr.addColorStop(1, 'rgba(0,0,0,0.28)');
      g.fillStyle = gr; g.fillRect(x, 0, 16, H);
    }
    for (let i = 0; i < 40; i++) { // ferrugem
      const x = r() * W, y = r() * H, rad = 8 + r() * 40;
      const rg = g.createRadialGradient(x, y, 0, x, y, rad);
      rg.addColorStop(0, `rgba(${120 + r() * 50 | 0},${50 + r() * 30 | 0},20,0.75)`); rg.addColorStop(1, 'rgba(110,50,20,0)');
      g.fillStyle = rg; g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
    }
    for (let i = 0; i < 18; i++) { // escorridos
      const x = r() * W, y = r() * H * 0.5;
      g.fillStyle = `rgba(90,40,15,${0.25 + r() * 0.3})`; g.fillRect(x, y, 2 + r() * 3, 30 + r() * 120);
    }
    for (let i = 0; i < 12; i++) { g.fillStyle = 'rgba(40,40,40,0.8)'; g.beginPath(); g.arc(r() * W, (r() < 0.5 ? 6 : H - 6), 2.5, 0, 6.3); g.fill(); } // rebites
  });
}
function rustTex() {
  return canvasTex('rust', (g, W, H) => {
    g.fillStyle = '#5a4234'; g.fillRect(0, 0, W, H);
    for (let i = 0; i < 2600; i++) { g.fillStyle = `rgba(${90 + Math.random() * 80 | 0},${40 + Math.random() * 40 | 0},${20 + Math.random() * 20 | 0},0.5)`; g.fillRect(Math.random() * W, Math.random() * H, 2 + Math.random() * 3, 2 + Math.random() * 3); }
  });
}

let M = null;
export function mats() {
  if (M) return M;
  const std = (o) => new THREE.MeshStandardMaterial({ roughness: 0.78, metalness: 0.35, ...o });
  M = {
    sheets: ['#7a7f82', '#5f7f8f', '#8a4a32', '#6e7d56', '#9a8a5a'].map((c, i) => std({ map: corrugated(c, i + 1), bumpMap: corrugated('#808080', 9), bumpScale: 1.2, side: THREE.DoubleSide })),
    container: std({ map: corrugated('#2f5f7a', 21), bumpMap: corrugated('#808080', 9), bumpScale: 1.4 }),
    containerRed: std({ map: corrugated('#8a3226', 23), bumpMap: corrugated('#808080', 9), bumpScale: 1.4 }),
    rust: std({ map: rustTex(), roughness: 0.9, metalness: 0.4 }),
    pipe: std({ color: 0x6d5a4c, roughness: 0.6, metalness: 0.6, map: rustTex() }),
    dark: std({ color: 0x202224, roughness: 0.5, metalness: 0.7 }),
    tire: std({ color: 0x1a1a1a, roughness: 0.95, metalness: 0 }),
    drumBlue: std({ color: 0x2d5f8a, map: rustTex(), roughness: 0.7 }),
    drumRed: std({ color: 0x9a2e22, map: rustTex(), roughness: 0.7 }),
    plank: new THREE.MeshStandardMaterial({ color: 0x7a5a3a, roughness: 0.9 }),
    glow: new THREE.MeshStandardMaterial({ color: 0xffb060, emissive: 0xff8a30, emissiveIntensity: 2.5 }),
  };
  return M;
}

// ctx: { group, set, addSolid, TOP, cx, cz, yaw, r, id }
export function buildScrapCamp(ctx) {
  const m = mats(), { group, set, TOP, r } = ctx;
  const P = (lx, lz) => { const [x, z] = rot(lx, lz, ctx.yaw); return [ctx.cx + x, ctx.cz + z]; };
  const rooms = [], towers = [], spawns = [];
  const pick = (list) => list[(r() * list.length) | 0];
  const boxG = (w, h, l) => new THREE.BoxGeometry(w, h, l);
  // sólido visível + colisor (bloqueia tiro e visão)
  const solid = (lx, y0, lz, w, h, l, mat, yaw = 0, into = group, list = null) => {
    const [x, z] = P(lx, lz), Y = ctx.yaw + yaw;
    const mesh = new THREE.Mesh(boxG(w, h, l), mat);
    mesh.position.set(x, TOP + y0 + h / 2, z); mesh.rotation.y = Y; mesh.castShadow = mesh.receiveShadow = true;
    if (into === group) ctx.addSolid(mesh); else into.add(mesh);
    const item = { type: 'box', x, y: TOP + y0 + h / 2, z, hx: w / 2, hy: h / 2, hz: l / 2, yaw: Y };
    set.items.push(item); if (list) list.push(item);
    return mesh;
  };
  const decor = (mesh, lx, y, lz, yaw = 0) => {
    const [x, z] = P(lx, lz); mesh.rotation.order = 'YXZ';
    mesh.position.set(x, TOP + y, z); mesh.rotation.y += ctx.yaw + yaw; mesh.castShadow = true; group.add(mesh); return mesh;
  };
  const drum = (lx, lz, mat = pick([m.drumBlue, m.drumRed])) => {
    const g = new THREE.Mesh(new THREE.CylinderGeometry(0.29, 0.29, 0.88, 12), mat);
    for (const y of [-0.22, 0.22]) { const rib = new THREE.Mesh(new THREE.TorusGeometry(0.29, 0.015, 4, 16), m.dark); rib.rotation.x = Math.PI / 2; rib.position.y = y; g.add(rib); }
    decor(g, lx, 0.44, lz, r() * 6);
    const [x, z] = P(lx, lz); set.items.push({ type: 'cyl', x, y: TOP + 0.44, z, hx: 0.3, hy: 0.44, hz: 0.3 });
  };
  const tires = (lx, lz) => {
    const n = 2 + ((r() * 3) | 0);
    for (let i = 0; i < n; i++) { const t = new THREE.Mesh(new THREE.TorusGeometry(0.36, 0.14, 8, 16), m.tire); t.rotation.x = Math.PI / 2; decor(t, lx + (r() - 0.5) * 0.1, 0.14 + i * 0.26, lz + (r() - 0.5) * 0.1); }
    const [x, z] = P(lx, lz); set.items.push({ type: 'cyl', x, y: TOP + n * 0.13 + 0.05, z, hx: 0.48, hy: n * 0.13 + 0.05, hz: 0.48 });
  };

  // ---------- muro de chapas (octógono) com portão na frente e brecha atrás ----------
  const RW = 7.2, sides = 8;
  for (let i = 0; i < sides; i++) {
    const a0 = (i / sides) * Math.PI * 2 + Math.PI / sides, a1 = ((i + 1) / sides) * Math.PI * 2 + Math.PI / sides;
    const x0 = Math.sin(a0) * RW, z0 = Math.cos(a0) * RW, x1 = Math.sin(a1) * RW, z1 = Math.cos(a1) * RW;
    const len = Math.hypot(x1 - x0, z1 - z0), yaw = Math.atan2(x1 - x0, z1 - z0) - Math.PI / 2;
    const mid = (a0 + a1) / 2, front = Math.abs(((mid + Math.PI) % (Math.PI * 2)) - Math.PI) < 0.3, back = Math.abs(mid - Math.PI) < 0.3;
    // chapas individuais (decoração, levemente tortas e de alturas diferentes)
    const nS = Math.round(len / 1.15);
    for (let k = 0; k < nS; k++) {
      const t = (k + 0.5) / nS, lx = x0 + (x1 - x0) * t, lz = z0 + (z1 - z0) * t;
      if (front && Math.abs(t - 0.5) < 0.3) continue;   // portão
      if (back && Math.abs(t - 0.5) < 0.16) continue;   // brecha dos fundos
      const h = 2.1 + r() * 0.6, sheet = new THREE.Mesh(boxG(len / nS + 0.12, h, 0.05), pick(m.sheets));
      sheet.rotation.z = (r() - 0.5) * 0.08; sheet.rotation.x = (r() - 0.5) * 0.06;
      decor(sheet, lx, h / 2 - 0.05, lz, yaw);
    }
    // postes e travessa
    for (const t of [0, 1]) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 2.7, 6), m.pipe); decor(p, t ? x1 : x0, 1.35, t ? z1 : z0); }
    // colisor(es) do lado
    const seg = (t0, t1) => {
      const ax = x0 + (x1 - x0) * t0, az = z0 + (z1 - z0) * t0, bx = x0 + (x1 - x0) * t1, bz = z0 + (z1 - z0) * t1;
      const [wx, wz] = P((ax + bx) / 2, (az + bz) / 2), l2 = Math.hypot(bx - ax, bz - az);
      const blocker = new THREE.Mesh(boxG(l2, 2.3, 0.2), m.rust); blocker.visible = false;
      blocker.position.set(wx, TOP + 1.15, wz); blocker.rotation.y = ctx.yaw + yaw; ctx.addSolid(blocker);
      set.items.push({ type: 'box', x: wx, y: TOP + 1.15, z: wz, hx: l2 / 2, hy: 1.15, hz: 0.1, yaw: ctx.yaw + yaw });
    };
    if (front) { seg(0, 0.2); seg(0.8, 1); } else if (back) { seg(0, 0.34); seg(0.66, 1); } else seg(0, 1);
  }
  // portão: dois postes grossos com pneus e uma placa de "não entre"
  for (const sx of [-1, 1]) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, 3.3, 8), m.pipe); decor(p, sx * 1.6, 1.65, RW * Math.cos(Math.PI / 8) + 0.05); }
  const sign = new THREE.Mesh(boxG(3.6, 0.5, 0.06), m.sheets[2]); decor(sign, 0, 3.0, RW * Math.cos(Math.PI / 8) + 0.05);
  rooms.push({ x: ctx.cx, z: ctx.cz, yaw: ctx.yaw, hw: RW * 0.92, hd: RW * 0.92, door: [P(0, RW - 1.4), P(0, RW + 1.6)], fort: true });

  // ---------- contêiner-casa (fundo à esquerda) ----------
  {
    const cx = -2.6, cz = -3.6, W = 5.6, D = 2.45, H = 2.55, T = 0.08, mat = r() < 0.5 ? m.container : m.containerRed;
    const fr = { yaw: 0.0 }; void fr;
    // frente (para o pátio, +Z local) com porta e janela; o resto inteiro
    const wall = (x0, x1, y0, y1, z, side) => {
      const w = x1 - x0, h = y1 - y0; if (w < 0.05 || h < 0.05) return;
      if (side) solid(cx + z, y0, cz + (x0 + x1) / 2, T, h, w, mat); else solid(cx + (x0 + x1) / 2, y0, cz + z, w, h, T, mat);
    };
    const hw = W / 2, hd = D / 2;
    wall(-hw, -0.2, 0, H, hd); wall(-0.2, 0.9, 2.0, H, hd); wall(0.9, 1.5, 0, H, hd); wall(1.5, 2.3, 0, 1.0, hd); wall(1.5, 2.3, 1.7, H, hd); wall(2.3, hw, 0, H, hd);
    wall(-hw, hw, 0, H, -hd); wall(-hd, hd, 0, H, -hw, true); wall(-hd, hd, 0, H, hw, true);
    solid(cx, H, cz, W + 0.06, 0.08, D + 0.06, mat); // teto
    solid(cx, 0, cz, W, 0.1, D, m.rust);              // piso
    // porta arrancada encostada e puxadinho de chapa na frente
    const door = new THREE.Mesh(boxG(1.1, 2.0, 0.05), mat); door.rotation.z = 0.2; decor(door, cx - 1.1, 1.0, cz + hd + 0.5, 0.3);
    const lean = new THREE.Mesh(boxG(W, 0.04, 2.2), m.sheets[0]); lean.rotation.x = 0.22; decor(lean, cx, 2.35, cz + hd + 1.05);
    for (const sx of [-hw + 0.2, hw - 0.2]) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.1, 6), m.pipe); decor(p, cx + sx, 1.05, cz + hd + 2.0); }
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 6), m.glow); decor(lamp, cx + 0.35, 2.25, cz + hd + 0.2);
    const [rx, rz] = P(cx, cz);
    rooms.push({ x: rx, z: rz, yaw: ctx.yaw, hw, hd, door: [P(cx + 0.35, cz + hd - 0.7), P(cx + 0.35, cz + hd + 1.2)] });
    spawns.push(P(cx - 1.4, cz), P(cx + 1.6, cz - 0.3));
  }
  // ---------- barraco de chapas (fundo à direita) ----------
  {
    const cx = 3.4, cz = -3.2, W = 3.2, D = 2.8, H = 2.3, T = 0.06;
    const wall = (x0, x1, y0, y1, z, side, mat = pick(m.sheets)) => {
      const w = x1 - x0, h = y1 - y0; if (w < 0.05 || h < 0.05) return;
      if (side) solid(cx + z, y0, cz + (x0 + x1) / 2, T, h, w, mat); else solid(cx + (x0 + x1) / 2, y0, cz + z, w, h, T, mat);
    };
    const hw = W / 2, hd = D / 2;
    wall(-hw, -0.5, 0, H, hd); wall(0.5, hw, 0, H, hd); wall(-0.5, 0.5, 1.95, H, hd);
    wall(-hw, hw, 0, H, -hd); wall(-hd, -0.3, 0, H, -hw, true); wall(0.3, hd, 0, H, -hw, true); wall(-0.3, 0.3, 0, 1.0, -hw, true); wall(-0.3, 0.3, 1.6, H, -hw, true);
    wall(-hd, hd, 0, H, hw, true);
    const roof = new THREE.Mesh(boxG(W + 0.6, 0.04, D + 0.7), pick(m.sheets)); roof.rotation.x = -0.12; decor(roof, cx, H + 0.2, cz);
    for (let i = 0; i < 3; i++) { const t = new THREE.Mesh(new THREE.TorusGeometry(0.33, 0.13, 6, 12), m.tire); t.rotation.x = Math.PI / 2; decor(t, cx - 0.8 + i * 0.8, H + 0.36, cz); } // pneus segurando o teto
    const [rx, rz] = P(cx, cz);
    rooms.push({ x: rx, z: rz, yaw: ctx.yaw, hw, hd, door: [P(cx, cz + hd - 0.7), P(cx, cz + hd + 1.2)] });
    spawns.push(P(cx, cz - 0.3));
  }
  // ---------- torres de andaime com morteiro (cantos da frente) ----------
  const towerSpots = r() < 0.5 ? [[-4.6, 3.6]] : [[-4.6, 3.6], [4.6, 3.6]];
  towerSpots.forEach(([lx, lz], ti) => {
    const id = `${ctx.id}t${ti}`;
    if (ctx.destroyed && ctx.destroyed.has(id)) { // já derrubada: só destroços no chão
      for (let i = 0; i < 6; i++) { const d = new THREE.Mesh(boxG(1 + r(), 0.05, 0.8 + r() * 0.6), pick(m.sheets)); d.rotation.set(r() * 0.4, r() * 6, r() * 0.4); decor(d, lx + (r() - 0.5) * 3, 0.1, lz + (r() - 0.5) * 3); }
      return;
    }
    const tg = new THREE.Group(); tg.userData.noBake = true;
    const [wx, wz] = P(lx, lz); tg.position.set(wx, TOP, wz); tg.rotation.y = ctx.yaw;
    group.add(tg);
    const items = [], meshes = [];
    const S = 0.95, LEVELS = 3, LH = 2.2, top = LEVELS * LH;
    const part = (mesh, x, y, z) => { mesh.position.set(x, y, z); mesh.castShadow = true; tg.add(mesh); meshes.push(mesh); return mesh; };
    for (const sx of [-S, S]) for (const sz of [-S, S]) part(new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, top + 0.1, 7), m.pipe), sx, (top + 0.1) / 2, sz);
    for (let L = 0; L < LEVELS; L++) { // travamento em X e anéis horizontais
      const y0 = L * LH;
      for (const [ax, az, len, ry] of [[0, -S, 2 * S, 0], [0, S, 2 * S, 0], [-S, 0, 2 * S, Math.PI / 2], [S, 0, 2 * S, Math.PI / 2]]) {
        const ring = part(new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, len, 5), m.pipe), ax, y0 + LH, az); ring.rotation.set(0, ry, Math.PI / 2);
        const dlen = Math.hypot(len, LH);
        for (const s of [-1, 1]) { const br = part(new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, dlen, 5), m.pipe), ax, y0 + LH / 2, az); br.rotation.set(0, ry, s * Math.atan2(len, LH)); }
      }
    }
    // plataforma e parapeito blindado de chapas
    part(new THREE.Mesh(boxG(2 * S + 0.6, 0.12, 2 * S + 0.6), m.rust), 0, top + 0.06, 0);
    for (const [px, pz, w, l] of [[0, S + 0.28, 2 * S + 0.6, 0.06], [0, -S - 0.28, 2 * S + 0.6, 0.06], [S + 0.28, 0, 0.06, 2 * S + 0.6], [-S - 0.28, 0, 0.06, 2 * S + 0.6]]) {
      part(new THREE.Mesh(boxG(w, 0.95, l), pick(m.sheets)), px, top + 0.6, pz);
    }
    // morteiro: tubo inclinado sobre base
    const mortar = new THREE.Group();
    const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.09, 0.9, 10), m.dark); tube.rotation.x = -0.75; tube.position.set(0, 0.32, 0.12); mortar.add(tube);
    const base = new THREE.Mesh(boxG(0.4, 0.06, 0.4), m.dark); mortar.add(base);
    for (const s of [-1, 1]) { const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.5, 5), m.dark); leg.position.set(s * 0.13, 0.2, 0.38); leg.rotation.x = 0.5; mortar.add(leg); }
    mortar.position.set(0.35, top + 0.12, 0.2); tg.add(mortar); meshes.push(mortar);
    // escada (decorativa) e caixa de munição
    const ammo = part(new THREE.Mesh(boxG(0.5, 0.3, 0.35), m.containerRed), -0.5, top + 0.27, -0.45); void ammo;
    for (let i = 0; i < 9; i++) part(new THREE.Mesh(boxG(0.5, 0.04, 0.04), m.pipe), 0, 0.4 + i * 0.7, -S - 0.05);
    // colisores: pernas, plataforma e parapeitos (no espaço da ilha)
    const add = (lx2, y, lz2, hx, hy, hz, type = 'box') => {
      const [ox, oz] = rot(lx2, lz2, ctx.yaw), it = { type, x: wx + ox, y: TOP + y, z: wz + oz, hx, hy, hz, yaw: ctx.yaw };
      set.items.push(it); items.push(it);
    };
    for (const sx of [-S, S]) for (const sz of [-S, S]) add(sx, (top + 0.1) / 2, sz, 0.09, (top + 0.1) / 2, 0.09, 'cyl');
    add(0, top + 0.06, 0, S + 0.3, 0.06, S + 0.3);
    add(0, top + 0.6, S + 0.28, S + 0.3, 0.48, 0.05); add(0, top + 0.6, -S - 0.28, S + 0.3, 0.48, 0.05);
    add(S + 0.28, top + 0.6, 0, 0.05, 0.48, S + 0.3); add(-S - 0.28, top + 0.6, 0, 0.05, 0.48, S + 0.3);
    // pernas também servem de alvo para os tiros (raycast)
    const solids = [];
    for (const mesh of meshes) mesh.traverse((o) => { if (o.isMesh) { ctx.solidOnly(o); solids.push(o); } });
    towers.push({ id, group: tg, items, meshes, solids, top, hp: 100, lx: wx, lz: wz, r: S + 0.4 });
  });
  // ---------- tralha: tambores, pneus, sucata ----------
  drum(5.2, 0.6); drum(5.6, -0.1); drum(-5.4, -0.4); tires(-5.1, 1.2); tires(1.8, -5.5);
  for (let i = 0; i < 5; i++) { const junk = new THREE.Mesh(boxG(0.6 + r(), 0.05, 0.5 + r()), pick(m.sheets)); junk.rotation.set(r() * 0.5, r() * 6, r() * 0.5); decor(junk, (r() - 0.5) * 9, 0.08, (r() - 0.5) * 8); }
  return { rooms, towers, spawns, crateSpots: [P(-2.6 - 2.0, -3.6)], yard: P(0, 1.2), fire: P(0, 1.2) };
}
