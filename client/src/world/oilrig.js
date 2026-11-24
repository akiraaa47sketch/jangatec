// PLATAFORMA DE PETRÓLEO ABANDONADA (evento "SOS" do fim da jornada — systems/sos.js).
// Convés de aço de 32 × 32 m a 7 m da água sobre quatro pernas fincadas no fundo, com:
//   • cais flutuante na frente + escada até o convés (sobe do cais ou do fundo seco);
//   • MÓDULO DE ALOJAMENTO de 2 andares (28 × 11 m): corredor + 4 salas em cada andar, ligados
//     por escadas externas de chapa (esquerda: convés → 1º andar; direita: 1º andar → teto);
//   • no TETO: sala de rádio (a origem do SOS) e o heliporto — o chefe espera lá em cima;
//   • torre de perfuração treliçada com o braço do queimador (chama) e luz vermelha piscando,
//     contêineres, tanques e tubulação no convés (covers).
// Formato de "ilha" (set de colisores, spawnSpots com zona por sala, ladders, block) para a IA e a
// jangada funcionarem sem casos especiais.
import * as THREE from '../three.js';
import { rot } from '../core/util.js';
import { mats as scrapMats } from './scrap.js';

const TOP = 0.55;
export const RIG = { deck: 7.6, half: 16 };

export function buildOilRig(ctx) {
  const m = scrapMats(), r = ctx.r, deckY = RIG.deck, H = RIG.half;
  const group = new THREE.Group(); group.position.set(ctx.x, deckY - TOP, ctx.z);
  const set = { x: ctx.x, z: ctx.z, yaw: 0, y: deckY - TOP, radius: 30, items: [] };
  const solids = [], spawns = [], ladders = [];
  const P = (lx, lz) => rot(lx, lz, ctx.yaw);
  const steel = new THREE.MeshStandardMaterial({ color: 0x6f767a, metalness: 0.55, roughness: 0.55 });
  const yellow = new THREE.MeshStandardMaterial({ color: 0xd8a72a, roughness: 0.6, metalness: 0.3 });
  const white = new THREE.MeshStandardMaterial({ color: 0xd9d6cc, roughness: 0.8 });
  const inside = new THREE.MeshStandardMaterial({ color: 0xb9bcb6, roughness: 0.9, emissive: 0x3c3e3a, emissiveIntensity: 1 });
  const lamp = new THREE.MeshStandardMaterial({ color: 0xfff2cc, emissive: 0xffe9b0, emissiveIntensity: 2.5 });
  // sólido visível + colisor; y0 = base em relação ao convés
  const solid = (lx, y0, lz, w, h, l, mat, yaw = 0, collide = true) => {
    const [x, z] = P(lx, lz), Y = ctx.yaw + yaw;
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, l), mat);
    mesh.position.set(x, TOP + y0 + h / 2, z); mesh.rotation.y = Y; mesh.castShadow = mesh.receiveShadow = true;
    group.add(mesh); solids.push(mesh);
    if (collide) set.items.push({ type: 'box', x, y: TOP + y0 + h / 2, z, hx: w / 2, hy: h / 2, hz: l / 2, yaw: Y });
    return mesh;
  };
  const decor = (mesh, lx, y, lz, yaw = 0) => {
    const [x, z] = P(lx, lz); mesh.rotation.order = 'YXZ';
    mesh.position.set(x, TOP + y, z); mesh.rotation.y += ctx.yaw + yaw; mesh.castShadow = true; group.add(mesh); return mesh;
  };
  const cylC = (lx, lz, rad, y0, h) => { const [x, z] = P(lx, lz); set.items.push({ type: 'cyl', x, y: TOP + y0 + h / 2, z, hx: rad, hy: h / 2, hz: rad }); };
  // parede com vãos [a, b, lo, hi] ao longo de x (along 'x', em z = at) ou de z (em x = at)
  const wall = (along, at, u0, u1, y0, y1, holes = [], mat = white, t = 0.25) => {
    const cuts = [u0, u1]; for (const [a, b] of holes) cuts.push(a, b);
    const us = [...new Set(cuts)].sort((a, b) => a - b);
    const box = (ua, ub, ya, yb) => {
      if (ub - ua < 0.02 || yb - ya < 0.02) return;
      if (along === 'x') solid((ua + ub) / 2, ya, at, ub - ua, yb - ya, t, mat);
      else solid(at, ya, (ua + ub) / 2, t, yb - ya, ub - ua, mat);
    };
    for (let i = 0; i < us.length - 1; i++) {
      const ua = us[i], ub = us[i + 1], mid = (ua + ub) / 2, h = holes.find(([a, b]) => mid > a && mid < b);
      if (!h) box(ua, ub, y0, y1); else { box(ua, ub, y0, Math.max(y0, h[2])); box(ua, ub, Math.min(y1, h[3]), y1); }
    }
  };
  const bedY = ctx.seabed(ctx.x, ctx.z) - deckY; // fundo, relativo ao convés

  // ---------- pernas, travamento e convés ----------
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const len = -bedY + 0.2, leg = new THREE.Mesh(new THREE.CylinderGeometry(1.3, 1.5, len, 16), yellow);
    decor(leg, sx * (H - 3), -len / 2, sz * (H - 3)); solids.push(leg); cylC(sx * (H - 3), sz * (H - 3), 1.4, bedY, len);
    for (let y = -1.8; y > bedY + 1; y -= 2.6) { const ring = new THREE.Mesh(new THREE.TorusGeometry(1.45, 0.08, 6, 18), steel); ring.rotation.x = Math.PI / 2; decor(ring, sx * (H - 3), y, sz * (H - 3)); }
  }
  for (const [ax, az, len, ry] of [[0, -(H - 3), 2 * (H - 3), Math.PI / 2], [0, H - 3, 2 * (H - 3), Math.PI / 2], [-(H - 3), 0, 2 * (H - 3), 0], [H - 3, 0, 2 * (H - 3), 0]]) {
    for (const y of [-2.4, -5.2]) { const br = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, len, 8), steel); br.rotation.x = Math.PI / 2; decor(br, ax, y, az, ry); }
    const dl = Math.hypot(len, 2.8);
    for (const s of [-1, 1]) { const x2 = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, dl, 6), steel); x2.rotation.set(Math.atan2(len, 2.8) * s, 0, 0); decor(x2, ax, -3.8, az, ry); }
  }
  solid(0, -0.5, 0, 2 * H, 0.5, 2 * H, m.rust);                                    // convés
  for (const sx of [-1, 1]) decor(new THREE.Mesh(new THREE.BoxGeometry(2 * H + 0.4, 1.4, 0.3), yellow), 0, -1.2, sx * H); // viga de borda
  // guarda-corpo do convés (vão na frente para a escada do cais)
  wall('x', -H + 0.1, -H, H, 0, 1.1, [], steel, 0.08);
  wall('z', -H + 0.1, -H, H, 0, 1.1, [], steel, 0.08);
  wall('z', H - 0.1, -H, H, 0, 1.1, [], steel, 0.08);
  wall('x', H - 0.1, -H, H, 0, 1.1, [[-0.8, 0.8, 0, 1.1]], steel, 0.08);
  // cais flutuante e escada (do cais — ou do fundo seco — até o convés)
  { const dockTop = 0.9 + 0.45 - deckY; // nível do mar cheio + borda
    solid(0, dockTop - 0.45, H + 2.2, 4.5, 0.45, 3.6, m.plank);
    for (const sx of [-2, 2]) for (const sz of [H + 0.8, H + 3.6]) { const post = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, -bedY + dockTop, 6), steel); decor(post, sx, (bedY + dockTop) / 2, sz); }
    for (let y = bedY + 0.4; y < 0; y += 0.38) decor(new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.05, 0.05), steel), 0, y, H + 0.12);
    for (const sx of [-0.32, 0.32]) decor(new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, -bedY + 1.2, 5), steel), sx, (bedY + 1.2) / 2, H + 0.12);
    const [x, z] = P(0, H + 0.4); ladders.push({ x: ctx.x + x, z: ctx.z + z, y0: deckY + bedY, top: deckY + 0.05, yaw: ctx.yaw, dir: 1 });
  }

  // ---------- módulo de alojamento (2 andares) ----------
  const X0 = -14, X1 = 14, Z0 = -14, Z1 = -3, F = 3.6, ROOF = 2 * F;
  const CZ = -5.5; // corredor: z CZ..Z1
  const rooms = [[-14, -7], [-7, 0], [0, 7], [7, 14]];
  decor(new THREE.Mesh(new THREE.BoxGeometry(X1 - X0, 0.04, Z1 - Z0), inside), 0, 0.02, (Z0 + Z1) / 2); // piso claro do térreo
  for (let fl = 0; fl < 2; fl++) {
    const y0 = fl * F, y1 = y0 + F - (fl ? 0.25 : 0);
    // paredes de fora
    const winF = fl ? [[-12, -9.5, y0 + 1.1, y0 + 2.2], [9.5, 12, y0 + 1.1, y0 + 2.2]] : [[-11, -9.4, y0, y0 + 2.4], [9.4, 11, y0, y0 + 2.4], [-3, -1, y0 + 1.1, y0 + 2.2], [1, 3, y0 + 1.1, y0 + 2.2]];
    wall('x', Z1, X0, X1, y0, y1, winF, white);
    wall('x', Z0, X0, X1, y0, y1, rooms.map(([a, b]) => [(a + b) / 2 - 0.9, (a + b) / 2 + 0.9, y0 + 1.1, y0 + 2.1]), white);
    wall('z', X0, Z0, Z1, y0, y1, fl ? [[-13.4, -11.6, y0, y0 + 2.4]] : [[-10, -8.6, y0 + 1.1, y0 + 2.1]], white);
    wall('z', X1, Z0, Z1, y0, y1, fl ? [[-13.4, -11.6, y0, y0 + 2.4]] : [[-10, -8.6, y0 + 1.1, y0 + 2.1]], white);
    // salas (portas para o corredor) e divisórias
    wall('x', CZ, X0, X1, y0, y1, rooms.map(([a, b]) => [(a + b) / 2 - 0.85, (a + b) / 2 + 0.85, y0, y0 + 2.4]), inside, 0.2);
    for (const x of [-7, 0, 7]) wall('z', x, Z0, CZ, y0, y1, [], inside, 0.2);
    // laje (piso do 1º andar / teto)
    solid(0, y0 + F - 0.25, (Z0 + Z1) / 2, X1 - X0 + 0.3, 0.25, Z1 - Z0 + 0.3, fl ? m.rust : inside);
    // luzes
    for (const [a, b] of rooms) decor(new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.08, 0.3), lamp), (a + b) / 2, y0 + F - 0.32, (Z0 + CZ) / 2);
    for (const x of [-10, 0, 10]) decor(new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.08, 0.25), lamp), x, y0 + F - 0.32, (CZ + Z1) / 2);
    // móveis (beliches, mesas, armários) — também são covers
    for (const [a, b] of rooms) {
      const c = (a + b) / 2;
      solid(c - 2, y0, Z0 + 1.2, 1.9, 1.5, 0.9, fl ? m.containerRed : m.container);
      solid(c + 1.6, y0, (Z0 + CZ) / 2, 1.3, 0.8, 0.8, m.plank);
    }
    // inimigos: 1–3 por sala + 1 no corredor
    for (const [a, b] of rooms) {
      const n = 1 + ((r() * 3) | 0), cx = (a + b) / 2, cz = (Z0 + CZ) / 2;
      const zone = zoneOf(cx, cz, (b - a) / 2 - 0.7, (CZ - Z0) / 2 - 0.7);
      for (let k = 0; k < n; k++) spawns.push(spot(cx + (k - (n - 1) / 2) * 1.6, cz + (r() - 0.5) * 2, y0, zone));
    }
    spawns.push(spot((r() - 0.5) * 16, (CZ + Z1) / 2, y0, zoneOf(0, (CZ + Z1) / 2, 13.2, 0.8)));
  }
  // escadas externas: esquerda (convés → 1º andar, sobe para -z) e direita (1º andar → teto, sobe para +z)
  const stair = (sx, zLow, zHigh, yLow, yHigh) => {
    const zc = (zLow + zHigh) / 2, len = Math.abs(zHigh - zLow), rise = yHigh - yLow, up = zHigh > zLow ? 1 : -1;
    const [x, z] = P(sx, zc);
    set.items.push({ type: 'ramp', x, y: TOP + (yLow + yHigh) / 2, z, hx: 0.85, hy: rise / 2, hz: len / 2, yaw: ctx.yaw + (up > 0 ? 0 : Math.PI) });
    const steps = Math.round(len / 0.45);
    for (let i = 0; i < steps; i++) {
      const st = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.08, len / steps), steel);
      decor(st, sx, yLow + rise * (i + 0.5) / steps, zLow + up * (i + 0.5) * len / steps); solids.push(st);
    }
    for (const s of [-1, 1]) { const rail = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, Math.hypot(len, rise)), yellow); rail.rotation.x = -up * Math.atan2(rise, len); decor(rail, sx + s * 0.85, (yLow + yHigh) / 2 + 1, zc); }
  };
  stair(-15.1, -1.2, -12.5, 0, F);          // sobe até a porta do lado esquerdo do 1º andar
  solid(-15.1, F - 0.25, -12.5, 1.8, 0.25, 1.8, steel); // patamar
  stair(15.1, -12.5, -1.2, F, ROOF);        // do 1º andar (porta direita) ao teto
  solid(15.1, ROOF - 0.25, -0.9, 1.8, 0.25, 1.0, steel); solid(13.75, ROOF - 0.25, -2.0, 1.0, 0.25, 3.2, steel); // passarela do topo da escada até o teto (sem invadir a escada)

  // ---------- teto: sala de rádio, heliporto e a arena do chefe ----------
  wall('x', Z1 + 0.05, X0, X1, ROOF, ROOF + 1.0, [[12, 14, ROOF, ROOF + 1]], steel, 0.08);
  wall('x', Z0 - 0.05, X0, X1, ROOF, ROOF + 1.0, [], steel, 0.08);
  wall('z', X0 - 0.05, Z0, Z1, ROOF, ROOF + 1.0, [], steel, 0.08);
  const radio = { x0: -6, x1: 0, z0: -13, z1: -8.5 };
  wall('x', radio.z1, radio.x0, radio.x1, ROOF, ROOF + 2.6, [[-3.6, -2.4, ROOF, ROOF + 2.2]], white);
  wall('x', radio.z0, radio.x0, radio.x1, ROOF, ROOF + 2.6, [], white);
  wall('z', radio.x0, radio.z0, radio.z1, ROOF, ROOF + 2.6, [[-11.5, -10, ROOF + 1.2, ROOF + 2.1]], white);
  wall('z', radio.x1, radio.z0, radio.z1, ROOF, ROOF + 2.6, [[-11.5, -10, ROOF + 1.2, ROOF + 2.1]], white);
  solid((radio.x0 + radio.x1) / 2, ROOF + 2.6, (radio.z0 + radio.z1) / 2, 6.4, 0.2, 4.9, m.rust);
  solid(-3, ROOF, -12.3, 3.2, 1.0, 0.8, m.dark); // console do rádio
  const radioLight = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.12, 0.05), new THREE.MeshStandardMaterial({ color: 0xff3020, emissive: 0xff2010, emissiveIntensity: 3 }));
  decor(radioLight, -3, ROOF + 1.15, -11.88);
  const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.06, 5, 6), steel); decor(antenna, -1, ROOF + 2.8 + 2.5, -12);
  // heliporto pintado e covers no teto
  { const pad = new THREE.Mesh(new THREE.CylinderGeometry(4.2, 4.2, 0.04, 32), new THREE.MeshStandardMaterial({ color: 0x2f3a36, roughness: 0.9 })); decor(pad, 8, ROOF + 0.02, -8.5);
    for (const [w, l, x] of [[0.4, 2.6, -0.8], [0.4, 2.6, 0.8], [1.6, 0.4, 0]]) decor(new THREE.Mesh(new THREE.BoxGeometry(w, 0.02, l), white), 8 + x, ROOF + 0.05, -8.5); }
  for (const [x, z, w, l] of [[3, -6, 2.4, 0.9], [-9, -6.5, 0.9, 2.4], [11.5, -12, 1.8, 0.9], [4, -12.4, 1.2, 1.2]]) solid(x, ROOF, z, w, 1.2, l, m.containerRed);
  const boss = (() => { const [x, z] = P(4.5, -9); return { x, z, y: ROOF }; })();
  for (const [x, z] of [[-10, -9], [10, -5.5]]) spawns.push(spot(x, z, ROOF, zoneOf(0, -8.5, 13, 4.5)));
  spawns.push(spot(-3, -10.5, ROOF, zoneOf(-3, -10.75, 2.4, 1.6)));     // operador do rádio

  // ---------- convés da frente: torre de perfuração, contêineres, tanques, tubos ----------
  {
    const dx = 8, dz = 7, Ht = 24, g = new THREE.Group(), w = 4;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.22, Ht, 0.22), steel); leg.position.set(sx * w / 2 * 0.55, Ht / 2, sz * w / 2 * 0.55);
      leg.scale.set(1, 1, 1); g.add(leg);
    }
    for (let y = 1.5; y < Ht; y += 2) {
      const s = 1 - y / Ht * 0.45;
      for (const [ax, az, ry] of [[0, -1, 0], [0, 1, 0], [-1, 0, Math.PI / 2], [1, 0, Math.PI / 2]]) {
        const br = new THREE.Mesh(new THREE.BoxGeometry(w * 0.55 * s, 0.1, 0.1), steel); br.position.set(ax * w / 2 * 0.55 * s, y, az * w / 2 * 0.55 * s); br.rotation.y = ry; g.add(br);
      }
    }
    const top = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.6, 2.4), yellow); top.position.y = Ht; g.add(top);
    decor(g, dx, 0, dz, 0.3);
    cylC(dx, dz, 1.3, 0, Ht);
    solid(dx, 0, dz, 4.2, 0.6, 4.2, m.rust); // base
  }
  // braço do queimador para fora do convés, com a chama
  const flame = new THREE.Mesh(new THREE.ConeGeometry(0.9, 3.2, 10), new THREE.MeshStandardMaterial({ color: 0xffa030, emissive: 0xff6a10, emissiveIntensity: 3, transparent: true, opacity: 0.85 }));
  flame.userData.noShadow = true; flame.userData.noBake = true;
  { const boom = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 14), steel); boom.rotation.x = -0.35; decor(boom, H + 3, 4.5, -6, Math.PI / 2); decor(flame, H + 9.5, 7.9, -6); }
  const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.4, 10, 8), new THREE.MeshStandardMaterial({ color: 0xff2010, emissive: 0xff1a0a, emissiveIntensity: 4 }));
  beacon.userData.noBake = true; decor(beacon, 8, 24.8, 7);
  // contêineres, tanques e tubos (covers no convés)
  for (const [x, z, ry, y0] of [[-11, 6, 0, 0], [-11, 6, 0, 2.6], [-6.5, 11.5, Math.PI / 2, 0], [2, 1, 0.1, 0]]) solid(x, y0, z, 2.4, 2.6, 6, y0 ? m.containerRed : m.container, ry);
  for (const [x, z] of [[-2, 9], [1, 12]]) { const t = new THREE.Mesh(new THREE.CylinderGeometry(1.3, 1.3, 3, 16), white); decor(t, x, 1.5, z); solids.push(t); cylC(x, z, 1.3, 0, 3); }
  for (const z of [-0.5, 0.3]) { const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 22, 10), m.pipe); pipe.rotation.z = Math.PI / 2; decor(pipe, 2, 0.4, z); }
  set.items.push({ type: 'box', x: P(2, -0.1)[0], y: TOP + 0.4, z: P(2, -0.1)[1], hx: 11, hy: 0.4, hz: 0.7, yaw: ctx.yaw });
  for (const [x, z] of [[-6, 3], [6, 12.5], [12, 2], [-13, 13]]) spawns.push(spot(x, z, 0, zoneOf(0, 6, H - 1.5, 8.5))); // guardas do convés

  function spot(lx, lz, y, zone) { const [x, z] = P(lx, lz); return { x, z, y, keep: true, zone }; }
  function zoneOf(lx, lz, hw, hd) { const [x, z] = P(lx, lz); return { x, z, yaw: ctx.yaw, hw, hd }; }

  return {
    group, set, solids, ladders, spawnSpots: spawns, boss, flame, beacon, radioLight,
    radio: (() => { const [x, z] = P(-3, -11); return { x, z, y: ROOF }; })(),
    R: H * 1.42, block: { x: ctx.x, z: ctx.z, yaw: ctx.yaw, hx: H + 1, hz: H + 4 }, // inclui o cais: a jangada encosta nele
  };
}
