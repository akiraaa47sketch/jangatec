// PLATAFORMA DE PETRÓLEO "LEVIATÃ" (evento SOS do fim da jornada — systems/sos.js).
// Uma torre industrial de 48 × 48 m com QUATRO andares empilhados, cada um com um chefe:
//   1. Convés de carga (contêineres, guindaste)     → O SOLDADOR   (fogo)
//   2. Refinaria (tanques, tubulação, válvulas)     → DR. GÁS      (gás tóxico)
//   3. Casa de perfuração (mesa rotativa, tubos)    → O PERFURADOR (broca e tremores)
//   4. Heliporto no topo (sala de rádio, queimador) → FAÍSCA       (eletricidade)
// Cada andar tem 8 m de pé-direito, lados abertos com guarda-corpo e um portão na escada para o
// próximo andar que só abre quando o chefe do andar cai. Cais + escada na frente (sobe do cais ou do
// fundo seco). Formato de "ilha" para a IA dos inimigos e a jangada.
import * as THREE from '../three.js';
import { rot } from '../core/util.js';
import { mats as scrapMats } from './scrap.js';

const TOP = 0.55;
export const RIG = { deck: 8, half: 24, floorH: 8, floors: 4 };

export function buildOilRig(ctx) {
  const m = scrapMats(), r = ctx.r, deckY = RIG.deck, H = RIG.half, FH = RIG.floorH;
  const group = new THREE.Group(); group.position.set(ctx.x, deckY - TOP, ctx.z);
  const set = { x: ctx.x, z: ctx.z, yaw: 0, y: deckY - TOP, radius: 40, items: [] };
  const solids = [], ladders = [];
  const P = (lx, lz) => rot(lx, lz, ctx.yaw);
  const M = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.6, ...extra });
  const steel = M(0x6f767a, { metalness: 0.55, roughness: 0.55 }), dark = M(0x3a3e42, { metalness: 0.5 });
  const yellow = M(0xd8a72a, { metalness: 0.3 }), red = M(0xa8321f), white = M(0xd9d6cc, { roughness: 0.8 });
  const deckMat = M(0x8c8f8a, { roughness: 0.85, emissive: 0x2c2e2b, emissiveIntensity: 1 }); // piso claro (andares cobertos)
  const lamp = M(0xfff2cc, { emissive: 0xffe9b0, emissiveIntensity: 2.4 });
  const greenGlow = M(0x9cff7a, { emissive: 0x5cff3a, emissiveIntensity: 1.6 });
  // sólido visível + colisor; y0 = base em relação ao piso do 1º andar
  const solid = (lx, y0, lz, w, h, l, mat, yaw = 0, collide = true) => {
    const [x, z] = P(lx, lz), Y = ctx.yaw + yaw;
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, l), mat);
    mesh.position.set(x, TOP + y0 + h / 2, z); mesh.rotation.y = Y; mesh.castShadow = mesh.receiveShadow = true;
    group.add(mesh); solids.push(mesh);
    const it = collide ? { type: 'box', x, y: TOP + y0 + h / 2, z, hx: w / 2, hy: h / 2, hz: l / 2, yaw: Y } : null;
    if (it) set.items.push(it);
    return { mesh, it };
  };
  const decor = (mesh, lx, y, lz, yaw = 0) => {
    const [x, z] = P(lx, lz); mesh.rotation.order = 'YXZ';
    mesh.position.set(x, TOP + y, z); mesh.rotation.y += ctx.yaw + yaw; mesh.castShadow = true; group.add(mesh); return mesh;
  };
  const cylC = (lx, lz, rad, y0, h) => { const [x, z] = P(lx, lz); const it = { type: 'cyl', x, y: TOP + y0 + h / 2, z, hx: rad, hy: h / 2, hz: rad }; set.items.push(it); return it; };
  const tank = (lx, lz, rad, y0, h, mat) => { const t = new THREE.Mesh(new THREE.CylinderGeometry(rad, rad, h, 20), mat); decor(t, lx, y0 + h / 2, lz); solids.push(t); cylC(lx, lz, rad, y0, h); return t; };
  const rail = (along, at, u0, u1, y0, gaps = []) => { // guarda-corpo 1,1 m
    const cuts = [u0, u1]; for (const [a, b] of gaps) cuts.push(a, b);
    const us = [...new Set(cuts)].sort((a, b) => a - b);
    for (let i = 0; i < us.length - 1; i++) {
      const a = us[i], b = us[i + 1], mid = (a + b) / 2; if (b - a < 0.05 || gaps.some(([g0, g1]) => mid > g0 && mid < g1)) continue;
      if (along === 'x') solid((a + b) / 2, y0, at, b - a, 1.1, 0.08, yellow); else solid(at, y0, (a + b) / 2, 0.08, 1.1, b - a, yellow);
    }
  };
  const bedY = ctx.seabed(ctx.x, ctx.z) - deckY; // fundo, relativo ao 1º andar
  const zoneOf = (lx, lz, hw, hd) => { const [x, z] = P(lx, lz); return { x, z, yaw: ctx.yaw, hw, hd }; };
  const spot = (lx, lz, y) => { const [x, z] = P(lx, lz); return { x, z, y }; };

  // ---------- pernas colossais (passam por todos os andares) e travamento ----------
  const LEG = H - 4.5;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const len = -bedY + 3 * FH + 1, leg = new THREE.Mesh(new THREE.CylinderGeometry(2.3, 2.7, len, 20), yellow);
    decor(leg, sx * LEG, bedY + len / 2, sz * LEG); solids.push(leg); cylC(sx * LEG, sz * LEG, 2.5, bedY, len);
    for (let y = -1.6; y > bedY + 1; y -= 2.4) { const ring = new THREE.Mesh(new THREE.TorusGeometry(2.65, 0.12, 6, 22), steel); ring.rotation.x = Math.PI / 2; decor(ring, sx * LEG, y, sz * LEG); }
  }
  for (const [ax, az, ry] of [[0, -LEG, Math.PI / 2], [0, LEG, Math.PI / 2], [-LEG, 0, 0], [LEG, 0, 0]]) {
    const len = 2 * LEG;
    for (const y of [-2.2, -5.4]) { const br = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, len, 8), steel); br.rotation.x = Math.PI / 2; decor(br, ax, y, az, ry); }
    for (const s of [-1, 1]) { const dl = Math.hypot(len, 3.2), x2 = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, dl, 6), steel); x2.rotation.x = Math.atan2(len, 3.2) * s; decor(x2, ax, -3.8, az, ry); }
  }

  // ---------- lajes dos andares (com o vão da escada de cada um) ----------
  // escada f liga o andar f ao f+1: lados alternados; sobe ao longo de z
  const STAIRS = [
    { x: -H + 3.3, z0: 14, z1: -2 },  // 1 → 2 (esquerda, sobe para -z)
    { x: H - 3.3, z0: -14, z1: 2 },   // 2 → 3 (direita, sobe para +z)
    { x: -H + 3.3, z0: 14, z1: -2 },  // 3 → topo (esquerda)
  ];
  const slab = (y, hole, mat) => {
    const T = 0.6, parts = [];
    if (!hole) parts.push([-H, H, -H, H]);
    else {
      const { x0, x1, z0, z1 } = hole;
      parts.push([-H, x0, -H, H], [x1, H, -H, H], [x0, x1, -H, z0], [x0, x1, z1, H]);
    }
    for (const [a, b, c, d] of parts) if (b - a > 0.05 && d - c > 0.05) solid((a + b) / 2, y - T, (c + d) / 2, b - a, T, d - c, mat);
  };
  slab(0, null, m.rust);
  for (let f = 1; f <= 3; f++) {
    const st = STAIRS[f - 1];
    const up = st.z1 > st.z0; // vão sobre a escada (o topo dela encosta na laje)
    slab(f * FH, { x0: st.x - 1.9, x1: st.x + 1.9, z0: up ? st.z0 - 1 : st.z1, z1: up ? st.z1 : st.z0 + 1 }, f === 3 ? m.rust : deckMat);
  }
  // vigas de borda e luminárias embaixo de cada laje
  for (let f = 1; f <= 3; f++) {
    for (const s of [-1, 1]) { decor(new THREE.Mesh(new THREE.BoxGeometry(2 * H + 0.4, 1.0, 0.4), yellow), 0, f * FH - 1.1, s * H); decor(new THREE.Mesh(new THREE.BoxGeometry(0.4, 1.0, 2 * H + 0.4), yellow), s * H, f * FH - 1.1, 0); }
    for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++) if ((i + j) % 2 === 0) decor(new THREE.Mesh(new THREE.BoxGeometry(3, 0.12, 0.5), lamp), i * 9, f * FH - 0.68, j * 9);
  }
  // guarda-corpos (com vãos: escada do cais na frente do 1º andar)
  for (let f = 0; f <= 3; f++) {
    const y = f * FH;
    rail('x', H - 0.1, -H, H, y, f === 0 ? [[-1, 1]] : []);
    rail('x', -H + 0.1, -H, H, y);
    rail('z', -H + 0.1, -H, H, y);
    rail('z', H - 0.1, -H, H, y);
  }
  // escadas entre andares + portão (abre quando o chefe do andar cai)
  const gates = [];
  STAIRS.forEach((st, f) => {
    const y0 = f * FH, y1 = y0 + FH, len = Math.abs(st.z1 - st.z0), up = st.z1 > st.z0 ? 1 : -1, zc = (st.z0 + st.z1) / 2;
    const [x, z] = P(st.x, zc);
    set.items.push({ type: 'ramp', x, y: TOP + (y0 + y1) / 2, z, hx: 1.6, hy: FH / 2, hz: len / 2, yaw: ctx.yaw + (up > 0 ? 0 : Math.PI) });
    const steps = Math.round(len / 0.42);
    for (let i = 0; i < steps; i++) {
      const s = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.12, len / steps + 0.02), i % 2 ? steel : dark);
      decor(s, st.x, y0 + FH * (i + 0.5) / steps, st.z0 + up * (i + 0.5) * len / steps); solids.push(s);
    }
    for (const s of [-1, 1]) { const rl = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, Math.hypot(len, FH)), yellow); rl.rotation.x = -up * Math.atan2(FH, len); decor(rl, st.x + s * 1.65, (y0 + y1) / 2 + 1, zc); }
    // poço da escada: paredes dos dois lados (só se entra pela base, onde fica o portão)
    for (const s of [-1, 1]) solid(st.x + s * 1.85, y0, zc, 0.2, FH - 0.6, len, dark);
    // portão de aço listrado na base da escada
    const gz = st.z0 - up * 1.0;
    const g = solid(st.x, y0, gz, 3.6, 4, 0.3, red);
    const stripes = [];
    for (let k = 0; k < 4; k++) { const sp = new THREE.Mesh(new THREE.BoxGeometry(3.62, 0.35, 0.32), M(0x1a1a1a)); decor(sp, st.x, y0 + 0.5 + k, gz); stripes.push(sp); }
    const light = new THREE.Mesh(new THREE.SphereGeometry(0.18, 10, 8), M(0xff2a1a, { emissive: 0xff2010, emissiveIntensity: 3 }));
    light.userData.noBake = true; decor(light, st.x, y0 + 4.4, gz); stripes.push(light);
    g.mesh.userData.noBake = true; for (const sp of stripes) sp.userData.noBake = true;
    gates.push({ item: g.it, meshes: [g.mesh, ...stripes], open: false });
  });

  // ---------- cais flutuante + escada até o 1º andar ----------
  { const dockTop = 0.9 + 0.45 - deckY;
    solid(0, dockTop - 0.45, H + 2.4, 5, 0.45, 4, m.plank);
    for (const sx of [-2.2, 2.2]) for (const sz of [H + 0.8, H + 4]) { const post = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, -bedY + dockTop, 6), steel); decor(post, sx, (bedY + dockTop) / 2, sz); }
    for (let y = bedY + 0.4; y < 0; y += 0.38) decor(new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.05, 0.05), steel), 0, y, H + 0.12);
    for (const sx of [-0.32, 0.32]) decor(new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, -bedY + 1.2, 5), steel), sx, (bedY + 1.2) / 2, H + 0.12);
    const [x, z] = P(0, H + 0.4); ladders.push({ x: ctx.x + x, z: ctx.z + z, y0: deckY + bedY, top: deckY + 0.05, yaw: ctx.yaw, dir: 1 });
  }

  // ---------- painéis de fechamento (lados parcialmente fechados) ----------
  const panelMat = M(0x5d6a70, { metalness: 0.4 });
  for (let f = 0; f < 3; f++) for (const [ax, az, w, l] of [[-H + 0.25, -10, 0.2, 18], [H - 0.25, 10, 0.2, 18], [-8, -H + 0.25, 20, 0.2]]) solid(ax, f * FH + 1.1, az, w, FH - 2.6, l, panelMat);

  // ========== ANDAR 1: CONVÉS DE CARGA ==========
  const contMat = [m.container, m.containerRed];
  for (const [x, z, ry, n] of [[-12, -14, 0, 2], [-6, -14, 0, 1], [9, -15, Math.PI / 2, 2], [14, 6, 0, 1], [-14, 8, Math.PI / 2, 1], [5, 15, Math.PI / 2, 2], [-4, 6, 0.3, 1]]) {
    for (let k = 0; k < n; k++) solid(x, k * 2.6, z, 2.4, 2.6, 6, contMat[(k + (x > 0 ? 1 : 0)) % 2], ry);
  }
  // guindaste: base, torre e lança treliçada
  { const base = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.9, 1.2, 16), yellow); decor(base, 16, 0.6, -6); solids.push(base); cylC(16, -6, 1.8, 0, 1.2);
    const tower = new THREE.Mesh(new THREE.BoxGeometry(1.6, 6.2, 1.6), yellow); decor(tower, 16, 4.3, -6); solids.push(tower); cylC(16, -6, 0.9, 1.2, 6.2);
    const boom = new THREE.Group();
    for (const s of [-1, 1]) { const ch = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.15, 18), yellow); ch.position.x = s * 0.45; boom.add(ch); }
    for (let i = 0; i < 12; i++) { const d = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.08, 0.08), yellow); d.position.z = -9 + i * 1.5; boom.add(d); }
    boom.rotation.x = -0.12; decor(boom, 16, 7.2, 2, -0.6);
    const hook = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 5, 4), dark); decor(hook, 11, 4.5, 9);
  }
  // empilhadeira e paletes
  solid(-17, 0, 0, 1.4, 1.6, 2.6, yellow); solid(6, 0, -4, 1.4, 0.9, 1.2, m.plank); solid(-8, 0, -4, 1.4, 0.9, 1.2, m.plank);

  // ========== ANDAR 2: REFINARIA ==========
  const y2 = FH;
  for (const [x, z, rad] of [[-12, -12, 3.2], [12, -12, 3.2], [-12, 12, 2.6], [12, 12, 2.6]]) {
    tank(x, z, rad, y2, 5.6, white);
    const band = new THREE.Mesh(new THREE.TorusGeometry(rad + 0.03, 0.08, 6, 24), red); band.rotation.x = Math.PI / 2; decor(band, x, y2 + 4.2, z);
  }
  for (const [x, z, len, ry] of [[0, -6, 16, Math.PI / 2], [0, 7, 12, Math.PI / 2], [-6, 0, 8, 0], [7, 1, 8, 0]]) { // racks de tubos (cobertura)
    solid(x, y2, z, ry ? len : 1.4, 1.1, ry ? 1.4 : len, dark, 0);
    for (const dy of [0.35, 0.8]) { const pp = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, len, 10), m.pipe); pp.rotation.set(ry ? 0 : Math.PI / 2, 0, ry ? Math.PI / 2 : 0); decor(pp, x, y2 + dy + 0.3, z); }
  }
  for (const [x, z] of [[-4, -16], [5, 16], [17, 0], [-17, -2]]) { const v = new THREE.Mesh(new THREE.TorusGeometry(0.45, 0.08, 6, 14), red); decor(v, x, y2 + 1.4, z); const vp = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 1.3, 6), dark); decor(vp, x, y2 + 0.65, z); }
  for (const [x, z] of [[-12, -12], [12, -12]]) decor(new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 0.06), greenGlow), x, y2 + 2.2, z + 3.25); // mostradores verdes

  // ========== ANDAR 3: CASA DE PERFURAÇÃO ==========
  const y3 = 2 * FH;
  solid(0, y3, 0, 10, 0.8, 10, dark); // piso da sonda (mesa rotativa no meio)
  { const rt = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.4, 0.3, 20), M(0x9a8a5a, { metalness: 0.6 })); decor(rt, 0, y3 + 0.95, 0);
    const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, FH - 1.6, 10), steel); decor(pipe, 0, y3 + 0.8 + (FH - 1.6) / 2, 0); cylC(0, 0, 0.35, y3 + 0.8, FH - 1.6); }
  for (const [x, z] of [[-4.6, -4.6], [4.6, -4.6], [-4.6, 4.6], [4.6, 4.6]]) { const col = new THREE.Mesh(new THREE.BoxGeometry(0.5, FH - 0.8, 0.5), yellow); decor(col, x, y3 + 0.8 + (FH - 0.8) / 2, z); solids.push(col); cylC(x, z, 0.3, y3 + 0.8, FH - 0.8); }
  for (const [x, z, ry] of [[-14, 10, 0], [14, -10, 0], [-10, -15, Math.PI / 2], [10, 15, Math.PI / 2]]) { // pilhas de tubos de perfuração
    solid(x, y3, z, 2.4, 1.2, 8, m.rust, ry);
    for (let i = 0; i < 4; i++) { const tp = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 8, 8), steel); tp.rotation.set(Math.PI / 2, 0, 0); decor(tp, x + (i - 1.5) * 0.55 * (ry ? 0 : 1), y3 + 1.45, z + (i - 1.5) * 0.55 * (ry ? 1 : 0), ry); }
  }
  for (const [x, z] of [[14, 8], [-14, -8]]) solid(x, y3, z, 5, 1.4, 4, M(0x4a3a2a)); // tanques de lama

  // ========== TOPO: HELIPORTO, SALA DE RÁDIO, TORRE E QUEIMADOR ==========
  const y4 = 3 * FH;
  { const pad = new THREE.Mesh(new THREE.CylinderGeometry(7, 7, 0.06, 40), M(0x2f3a36, { roughness: 0.9 })); decor(pad, 6, y4 + 0.03, 4);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(6.4, 0.12, 4, 48), yellow); ring.rotation.x = Math.PI / 2; decor(ring, 6, y4 + 0.08, 4);
    for (const [w, l, x] of [[0.6, 4.2, -1.3], [0.6, 4.2, 1.3], [2.6, 0.6, 0]]) decor(new THREE.Mesh(new THREE.BoxGeometry(w, 0.03, l), white), 6 + x, y4 + 0.09, 4); }
  const radio = { x0: -16, x1: -8, z0: -18, z1: -12 };
  for (const [ax, az, w, l, door] of [[-12, -18, 8, 0.25, false], [-12, -12, 8, 0.25, true], [-16, -15, 0.25, 6, false], [-8, -15, 0.25, 6, false]]) {
    if (door) { solid(-14.5, y4, -12, 3, 3, 0.25, white); solid(-9.5, y4, -12, 3, 3, 0.25, white); solid(-12, y4 + 2.4, -12, 2, 0.6, 0.25, white); }
    else solid(ax, y4, az, w, 3, l, white);
  }
  solid(-12, y4 + 3, -15, 8.4, 0.25, 6.4, m.rust); solid(-12, y4, -17.2, 4, 1.0, 0.8, dark); // teto e console do rádio
  const radioLight = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.12, 0.05), M(0xff3020, { emissive: 0xff2010, emissiveIntensity: 3 }));
  decor(radioLight, -12, y4 + 1.15, -16.78);
  const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.08, 8, 6), steel); decor(antenna, -9, y4 + 3.2 + 4, -17);
  // torre de perfuração gigante no canto de trás
  { const dx = 13, dz = -13, Ht = 34, w = 5, g = new THREE.Group();
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) { const lg = new THREE.Mesh(new THREE.BoxGeometry(0.3, Ht, 0.3), steel); lg.position.set(sx * w / 2 * 0.6, Ht / 2, sz * w / 2 * 0.6); g.add(lg); }
    for (let y = 1.5; y < Ht; y += 2.2) { const s = 1 - y / Ht * 0.5; for (const [ax, az, ry] of [[0, -1, 0], [0, 1, 0], [-1, 0, Math.PI / 2], [1, 0, Math.PI / 2]]) { const br = new THREE.Mesh(new THREE.BoxGeometry(w * 0.6 * s, 0.12, 0.12), steel); br.position.set(ax * w / 2 * 0.6 * s, y, az * w / 2 * 0.6 * s); br.rotation.y = ry; g.add(br); } }
    const cap = new THREE.Mesh(new THREE.BoxGeometry(3, 0.8, 3), yellow); cap.position.y = Ht; g.add(cap);
    decor(g, dx, y4, dz, 0.3); cylC(dx, dz, 1.8, y4, Ht);
    solid(dx, y4, dz, 5.4, 0.8, 5.4, m.rust); }
  // queimador: braço para fora do convés com a chama
  const flame = new THREE.Mesh(new THREE.ConeGeometry(1.4, 5, 12), M(0xffa030, { emissive: 0xff6a10, emissiveIntensity: 3, transparent: true, opacity: 0.85 }));
  flame.userData.noShadow = true; flame.userData.noBake = true;
  { const boom = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.7, 20), steel); boom.rotation.x = -0.32; decor(boom, H + 6, y4 + 3.4, 12, Math.PI / 2); decor(flame, H + 15.5, y4 + 7, 12); }
  const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.55, 10, 8), M(0xff2010, { emissive: 0xff1a0a, emissiveIntensity: 4 }));
  beacon.userData.noBake = true; decor(beacon, 13, y4 + 34.9, -13);
  // covers no topo
  for (const [x, z, w, l] of [[-3, 8, 3, 1], [14, 12, 1, 3], [-6, -4, 1, 3], [2, -8, 3, 1], [-16, 10, 2.4, 1.2], [18, -2, 1.2, 2.4]]) solid(x, y4, z, w, 1.3, l, m.containerRed);

  // ---------- inimigos: chefe no meio de cada andar + capangas espalhados ----------
  const FLOORS = [
    { boss: 'soldador', y: 0, at: [0, -2], minions: [[-16, -6], [12, -2], [-4, 14], [10, 9]] },
    { boss: 'quimico', y: FH, at: [0, 0], minions: [[-17, 6], [16, -4], [-4, -17], [6, 17]] },
    { boss: 'perfurador', y: 2 * FH, at: [0, 8], minions: [[-16, -4], [16, 4], [-6, -16], [4, -10]] },
    { boss: 'faisca', y: 3 * FH, at: [2, 0], minions: [[-14, 6], [16, 10], [-2, -12]] },
  ].map((F) => ({
    ...F, bossSpot: spot(F.at[0], F.at[1], F.y), zone: zoneOf(0, 0, H - 1.5, H - 1.5),
    minionSpots: F.minions.map(([x, z]) => spot(x, z, F.y)),
  }));
  void r;

  return {
    group, set, solids, ladders, flame, beacon, radioLight, gates, floors: FLOORS,
    radio: (() => { const [x, z] = P(-12, -15); return { x, z, y: y4 }; })(),
    R: H * 1.42, block: { x: ctx.x, z: ctx.z, yaw: ctx.yaw, hx: H + 1, hz: H + 5 },
  };
}
