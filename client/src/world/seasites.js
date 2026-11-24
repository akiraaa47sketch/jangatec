// Estruturas no MEIO DO MAR (sem ilha), sorteadas por chunk em systems/loot.js (seaSiteFor):
//   • TORRE DE SUCATA: pontão enferrujado sobre estacas fincadas no fundo, com uma torre de andaime
//     e um artilheiro de morteiro em cima. Dá para subir pelas escadas; a bala de canhão derruba
//     a torre (systems/siege.js), como nos fortes.
//   • PRÉDIO INCLINADO: prédio afundado e tombado. A fachada torta vira uma rampa que sai da água
//     (ou do fundo seco) até o andar de cima, que ficou nivelado sobre os escombros: lá dentro
//     tem caixote, peças para a jangada e às vezes inimigos.
// Tudo é montado no formato de uma "ilha" (set de colisores com y = piso - 0.55, rooms, towers,
// spawnSpots…) para a IA dos inimigos, o cerco e o loot funcionarem sem casos especiais.
import * as THREE from '../three.js';
import { rot } from '../core/util.js';
import { mats as scrapMats } from './scrap.js';

const TOP = 0.55;
const texCache = {};
function canvasTex(key, draw, w = 256, h = 256) {
  if (texCache[key]) return texCache[key];
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return (texCache[key] = t);
}
// fachada de concreto: janelas em grade (algumas quebradas), manchas de limo e escorridos
function facadeTex() {
  return canvasTex('facade', (g, W, H) => {
    let s = 7; const r = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
    g.fillStyle = '#8d8a82'; g.fillRect(0, 0, W, H);
    for (let i = 0; i < 900; i++) { g.fillStyle = `rgba(${60 + r() * 60 | 0},${60 + r() * 60 | 0},${55 + r() * 50 | 0},0.25)`; g.fillRect(r() * W, r() * H, 2 + r() * 5, 2 + r() * 5); }
    for (let y = 0; y < 4; y++) for (let x = 0; x < 3; x++) {
      const X = 14 + x * 80, Y = 14 + y * 62;
      g.fillStyle = r() < 0.3 ? '#1b2224' : '#3a4a52'; g.fillRect(X, Y, 56, 38);
      g.strokeStyle = '#5c5850'; g.lineWidth = 3; g.strokeRect(X, Y, 56, 38);
      if (r() < 0.5) { g.strokeStyle = 'rgba(200,220,230,0.35)'; g.lineWidth = 1; g.beginPath(); g.moveTo(X + r() * 56, Y); g.lineTo(X + r() * 56, Y + 38); g.stroke(); }
    }
    for (let i = 0; i < 14; i++) { g.fillStyle = `rgba(60,85,50,${0.2 + r() * 0.25})`; g.fillRect(r() * W, r() * H * 0.4 + H * 0.6, 20 + r() * 50, 8 + r() * 30); } // limo
    for (let i = 0; i < 20; i++) { g.fillStyle = 'rgba(70,60,50,0.25)'; g.fillRect(r() * W, r() * H, 2, 20 + r() * 60); }
  });
}
function concreteTex() {
  return canvasTex('concrete', (g, W, H) => {
    g.fillStyle = '#7e7b74'; g.fillRect(0, 0, W, H);
    for (let i = 0; i < 2200; i++) { const v = 90 + Math.random() * 60 | 0; g.fillStyle = `rgba(${v},${v - 3},${v - 8},0.35)`; g.fillRect(Math.random() * W, Math.random() * H, 2 + Math.random() * 3, 2 + Math.random() * 3); }
    for (let i = 0; i < 6; i++) { g.strokeStyle = 'rgba(40,40,40,0.5)'; g.lineWidth = 1.5; g.beginPath(); let x = Math.random() * W, y = Math.random() * H; g.moveTo(x, y); for (let k = 0; k < 6; k++) { x += (Math.random() - 0.5) * 50; y += Math.random() * 30; g.lineTo(x, y); } g.stroke(); }
  });
}
let CM = null;
function cmats() {
  if (CM) return CM;
  const rep = (t, x, y) => { const c = t.clone(); c.needsUpdate = true; c.repeat.set(x, y); return c; };
  CM = {
    facade: new THREE.MeshStandardMaterial({ map: rep(facadeTex(), 2, 7), roughness: 0.95 }),
    concrete: new THREE.MeshStandardMaterial({ map: rep(concreteTex(), 2, 2), roughness: 0.95 }),
    rebar: new THREE.MeshStandardMaterial({ color: 0x5a3e2c, roughness: 0.7, metalness: 0.5 }),
    glass: new THREE.MeshStandardMaterial({ color: 0x9fc3d0, roughness: 0.15, metalness: 0.2, transparent: true, opacity: 0.45 }),
  };
  return CM;
}

// ctx: { x, z, yaw, r, id, destroyed, seabed(x,z) } → partes da "ilha" (grupo, set, …)
function base(ctx, floorY) {
  const group = new THREE.Group(); group.position.set(ctx.x, floorY - TOP, ctx.z);
  const set = { x: ctx.x, z: ctx.z, yaw: 0, y: floorY - TOP, radius: 30, items: [] };
  const solids = [];
  const P = (lx, lz) => rot(lx, lz, ctx.yaw);
  // sólido visível + colisor; y0 = base em relação ao piso (TOP)
  const solid = (lx, y0, lz, w, h, l, mat, { pitch = 0, yaw = 0, collide = true, visible = true } = {}) => {
    const [x, z] = P(lx, lz), Y = ctx.yaw + yaw;
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, l), mat);
    mesh.rotation.order = 'YXZ'; mesh.rotation.set(pitch, Y, 0);
    mesh.position.set(x, TOP + y0 + h / 2, z); mesh.castShadow = mesh.receiveShadow = true; mesh.visible = visible;
    group.add(mesh); solids.push(mesh);
    if (collide) set.items.push({ type: 'box', x, y: TOP + y0 + h / 2, z, hx: w / 2, hy: h / 2, hz: l / 2, yaw: Y });
    return mesh;
  };
  const decor = (mesh, lx, y, lz, yaw = 0) => {
    const [x, z] = P(lx, lz); mesh.rotation.order = 'YXZ';
    mesh.position.set(x, TOP + y, z); mesh.rotation.y += ctx.yaw + yaw; mesh.castShadow = true; group.add(mesh); return mesh;
  };
  return { group, set, solids, P, solid, decor };
}

// ---------- torre de sucata sobre um pontão ----------
export const SEA_TOWER = { deck: 2.0, half: 2.6 };
export function buildSeaTower(ctx) {
  const m = scrapMats(), r = ctx.r, deckY = SEA_TOWER.deck, H = SEA_TOWER.half;
  const B = base(ctx, deckY), { group, set, solids, P, solid, decor } = B;
  const bedY = ctx.seabed(ctx.x, ctx.z) - deckY; // fundo, relativo ao piso
  const ladders = [], towers = [];
  // pontão: chapa grossa enferrujada + borda; estacas até o fundo
  solid(0, -0.35, 0, 2 * H, 0.35, 2 * H, m.rust);
  for (const [px, pz, w, l] of [[0, H, 2 * H, 0.08], [0, -H, 2 * H, 0.08], [H, 0, 0.08, 2 * H], [-H, 0, 0.08, 2 * H]]) {
    const lip = new THREE.Mesh(new THREE.BoxGeometry(w, 0.18, l), m.pipe); decor(lip, px, 0.09, pz);
  }
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const len = -bedY + 0.4, pile = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, len, 8), m.pipe);
    decor(pile, sx * (H - 0.3), -len / 2, sz * (H - 0.3));
    const [x, z] = P(sx * (H - 0.3), sz * (H - 0.3));
    set.items.push({ type: 'cyl', x, y: TOP - len / 2, z, hx: 0.2, hy: len / 2, hz: 0.2 });
  }
  // travamento das estacas e tambores-boia amarrados
  for (const sz of [-1, 1]) { const br = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, Math.hypot(2 * H, -bedY), 5), m.pipe); br.rotation.z = Math.atan2(2 * H, -bedY); decor(br, 0, bedY / 2, sz * (H - 0.3)); }
  for (let i = 0; i < 4; i++) {
    const a = r() * 6.28, d = H + 0.4, drum = new THREE.Mesh(new THREE.CylinderGeometry(0.29, 0.29, 0.88, 12), r() < 0.5 ? m.drumBlue : m.drumRed);
    drum.rotation.z = Math.PI / 2; decor(drum, Math.cos(a) * d, -1.15, Math.sin(a) * d, a);
  }
  // escada do mar até o pontão (lado -z)
  for (let y = bedY + 0.3; y < 0; y += 0.4) { const rung = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.04, 0.04), m.pipe); decor(rung, 0, y, -H - 0.08); }
  for (const sx of [-0.3, 0.3]) { const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, -bedY + 0.9, 5), m.pipe); decor(rail, sx, (bedY + 0.9) / 2, -H - 0.08); }
  { const [x, z] = P(0, -H - 0.35); ladders.push({ x: ctx.x + x, z: ctx.z + z, y0: deckY + bedY, top: deckY + 0.05, yaw: ctx.yaw, dir: -1 }); }
  // tralha no pontão
  for (const [lx, lz] of [[1.7, 1.6], [-1.8, 1.4]]) {
    const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.29, 0.29, 0.88, 12), m.drumRed); decor(drum, lx, 0.44, lz);
    const [x, z] = P(lx, lz); set.items.push({ type: 'cyl', x, y: TOP + 0.44, z, hx: 0.3, hy: 0.44, hz: 0.3 });
  }
  // a torre de andaime (derrubável)
  const id = `${ctx.id}t0`;
  if (ctx.destroyed && ctx.destroyed.has(id)) {
    for (let i = 0; i < 5; i++) { const d = new THREE.Mesh(new THREE.BoxGeometry(1 + r(), 0.05, 0.8 + r() * 0.6), m.sheets[(r() * m.sheets.length) | 0]); d.rotation.set(r() * 0.4, r() * 6, r() * 0.4); decor(d, (r() - 0.5) * 3, 0.06, (r() - 0.5) * 3); }
  } else {
    const tg = new THREE.Group(); tg.userData.noBake = true;
    tg.position.set(0, TOP, 0); tg.rotation.y = ctx.yaw; group.add(tg);
    const items = [], meshes = [];
    const S = 0.95, LEVELS = 3, LH = 2.2, top = LEVELS * LH;
    const part = (mesh, x, y, z) => { mesh.position.set(x, y, z); mesh.castShadow = true; tg.add(mesh); meshes.push(mesh); return mesh; };
    for (const sx of [-S, S]) for (const sz of [-S, S]) part(new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, top + 0.1, 7), m.pipe), sx, (top + 0.1) / 2, sz);
    for (let L = 0; L < LEVELS; L++) {
      const y0 = L * LH;
      for (const [ax, az, len, ry] of [[0, -S, 2 * S, 0], [0, S, 2 * S, 0], [-S, 0, 2 * S, Math.PI / 2], [S, 0, 2 * S, Math.PI / 2]]) {
        const ring = part(new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, len, 5), m.pipe), ax, y0 + LH, az); ring.rotation.set(0, ry, Math.PI / 2);
        if (az === -S) continue; // lado da escada: sem X (o jogador sobe por ali)
        const dlen = Math.hypot(len, LH);
        for (const s of [-1, 1]) { const br = part(new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, dlen, 5), m.pipe), ax, y0 + LH / 2, az); br.rotation.set(0, ry, s * Math.atan2(len, LH)); }
      }
    }
    part(new THREE.Mesh(new THREE.BoxGeometry(2 * S + 0.6, 0.12, 2 * S + 0.6), m.rust), 0, top + 0.06, 0);
    // parapeito blindado; do lado da escada fica um vão
    const W2 = 2 * S + 0.6, gap = 0.8, sideW = (W2 - gap) / 2;
    for (const [px, pz, w, l] of [[0, S + 0.28, W2, 0.06], [S + 0.28, 0, 0.06, W2], [-S - 0.28, 0, 0.06, W2], [-(gap + sideW) / 2, -S - 0.28, sideW, 0.06], [(gap + sideW) / 2, -S - 0.28, sideW, 0.06]]) {
      part(new THREE.Mesh(new THREE.BoxGeometry(w, 0.95, l), m.sheets[(r() * m.sheets.length) | 0]), px, top + 0.6, pz);
    }
    const mortar = new THREE.Group();
    const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.09, 0.9, 10), m.dark); tube.rotation.x = -0.75; tube.position.set(0, 0.32, 0.12); mortar.add(tube);
    mortar.add(new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.06, 0.4), m.dark));
    mortar.position.set(0.35, top + 0.12, 0.35); tg.add(mortar); meshes.push(mortar);
    for (let i = 0; i < 9; i++) part(new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.04, 0.04), m.pipe), 0, 0.4 + i * 0.7, -S - 0.05);
    const add = (lx2, y, lz2, hx, hy, hz, type = 'box') => {
      const [ox, oz] = rot(lx2, lz2, ctx.yaw), it = { type, x: ox, y: TOP + y, z: oz, hx, hy, hz, yaw: ctx.yaw };
      set.items.push(it); items.push(it);
    };
    for (const sx of [-S, S]) for (const sz of [-S, S]) add(sx, (top + 0.1) / 2, sz, 0.09, (top + 0.1) / 2, 0.09, 'cyl');
    add(0, top + 0.06, 0, S + 0.3, 0.06, S + 0.3);
    add(0, top + 0.6, S + 0.28, S + 0.3, 0.48, 0.05);
    add(S + 0.28, top + 0.6, 0, 0.05, 0.48, S + 0.3); add(-S - 0.28, top + 0.6, 0, 0.05, 0.48, S + 0.3);
    add(-(gap + sideW) / 2, top + 0.6, -S - 0.28, sideW / 2, 0.48, 0.05); add((gap + sideW) / 2, top + 0.6, -S - 0.28, sideW / 2, 0.48, 0.05);
    const tsol = [];
    for (const mesh of meshes) mesh.traverse((o) => { if (o.isMesh) { solids.push(o); tsol.push(o); } });
    towers.push({ id, group: tg, items, meshes, solids: tsol, top, hp: 100, lx: 0, lz: 0, r: S + 0.4 });
    const [lx, lz] = P(0, -S - 0.3);
    ladders.push({ x: ctx.x + lx, z: ctx.z + lz, y0: deckY, top: deckY + top + 0.14, yaw: ctx.yaw, dir: -1, towerId: id });
  }
  const spawns = [P(1.6, -1.4), P(-1.6, -1.4)].map(([x, z]) => ({ x, z, y: 0, high: false }));
  return {
    ...B, kind: 'torre', floorY: deckY, R: H - 0.3, ladders, towers, spawnSpots: spawns, rooms: [], crateSpots: [], debrisSpots: [],
    block: { x: ctx.x, z: ctx.z, yaw: ctx.yaw, hx: H + 0.1, hz: H + 0.4 },
  };
}

// ---------- prédio afundado e inclinado ----------
export const LEANING = { run: 22, low: -5.9, high: 7.0, width: 7, depth: 6, room: 6.4 };
export function buildLeaningBuilding(ctx) {
  const c = cmats(), m = scrapMats(), r = ctx.r, Lc = LEANING;
  const floorY = Lc.high;
  const B = base(ctx, floorY), { group, set, P, solid, decor } = B;
  // eixos locais: z cresce de baixo (na água) para cima (sala). A sala fica em z ∈ [hz, hz + room].
  const hz = Lc.run / 2, rise = Lc.high - Lc.low, hy = rise / 2, alpha = Math.atan2(rise, Lc.run);
  const slopeMidY = (Lc.low + Lc.high) / 2 - floorY; // relativo ao piso
  const W = Lc.width, T = Lc.depth, len = Math.hypot(rise, Lc.run);
  // o prédio tombado: caixa girada com a fachada (face de cima) no plano da rampa
  {
    const [x, z] = P(0, Math.sin(alpha) * T / 2);
    const bld = new THREE.Mesh(new THREE.BoxGeometry(W, T, len), [c.concrete, c.concrete, c.facade, c.concrete, c.concrete, c.concrete]);
    bld.rotation.order = 'YXZ'; bld.rotation.set(-alpha, ctx.yaw, 0);
    bld.position.set(x, TOP + slopeMidY - Math.cos(alpha) * T / 2, z); bld.castShadow = bld.receiveShadow = true;
    group.add(bld); B.solids.push(bld);
    const [rx, rz] = P(0, 0);
    set.items.push({ type: 'ramp', x: rx, y: TOP + slopeMidY, z: rz, hx: W / 2, hy, hz, yaw: ctx.yaw });
  }
  // parapeitos de janela saindo da fachada (degrauzinhos para não escorregar na subida) e vergalhões
  for (let k = 1; k < 8; k++) {
    const t = k / 8, zz = -hz + t * Lc.run, yy = Lc.low + t * rise - floorY;
    const ledge = new THREE.Mesh(new THREE.BoxGeometry(W * 0.9, 0.08, 0.18), c.concrete); ledge.rotation.x = -alpha; decor(ledge, 0, yy + 0.04, zz);
  }
  for (let i = 0; i < 6; i++) {
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.8 + r() * 0.8, 4), c.rebar);
    bar.rotation.set(r() - 0.5, 0, r() - 0.5); decor(bar, (r() < 0.5 ? -1 : 1) * (W / 2 - 0.1), 0.2 - r() * 6, hz - r() * 8);
  }
  // escombros sob a sala (do fundo até o piso) e a laje do andar que ficou nivelado
  const bedY = ctx.seabed(...(() => { const [x, z] = P(0, hz + Lc.room / 2); return [ctx.x + x, ctx.z + z]; })()) - floorY;
  const zc = hz + Lc.room / 2;
  solid(0, bedY - 0.5, zc, W + 0.4, -bedY + 0.5 - 0.3, Lc.room, c.concrete);
  solid(0, -0.3, zc, W + 0.4, 0.3, Lc.room + 0.2, c.concrete);
  for (let i = 0; i < 7; i++) { // blocos de entulho em volta
    const s = 0.8 + r() * 1.4, blk = new THREE.Mesh(new THREE.BoxGeometry(s, s * 0.7, s), c.concrete);
    blk.rotation.set(r(), r() * 6, r()); decor(blk, (r() - 0.5) * (W + 3), bedY + s * 0.3 + r() * 2, zc + (r() - 0.5) * (Lc.room + 2));
  }
  // paredes da sala: frente (para a rampa) com vão de porta largo, laterais com janelas, fundo inteiro
  const HW = W / 2 + 0.05, z0 = hz + 0.1, z1 = hz + Lc.room, WH = 2.7, WT = 0.2;
  const wallZ = (x0, x1, y0, y1, zz) => { if (x1 - x0 > 0.05 && y1 - y0 > 0.05) solid((x0 + x1) / 2, y0, zz, x1 - x0, y1 - y0, WT, c.concrete); };
  const wallX = (z0w, z1w, y0, y1, xx) => { if (z1w - z0w > 0.05 && y1 - y0 > 0.05) solid(xx, y0, (z0w + z1w) / 2, WT, y1 - y0, z1w - z0w, c.concrete); };
  wallZ(-HW, -1.3, 0, WH, z0); wallZ(1.3, HW, 0, WH, z0); wallZ(-1.3, 1.3, 2.2, WH, z0);
  wallZ(-HW, HW, 0, 1.0, z1); wallZ(-HW, HW, 2.0, WH, z1); wallZ(-HW, -1.6, 1.0, 2.0, z1); wallZ(1.6, HW, 1.0, 2.0, z1); wallZ(-0.3, 0.3, 1.0, 2.0, z1);
  for (const sx of [-1, 1]) { wallX(z0, z1, 0, 1.0, sx * HW); wallX(z0, z1, 2.0, WH, sx * HW); wallX(z0, z0 + 1.6, 1.0, 2.0, sx * HW); wallX(z1 - 1.6, z1, 1.0, 2.0, sx * HW); }
  // teto só no fundo (metade desabou) com vergalhões pendurados
  solid(0, WH, z0 + Lc.room * 0.45, W + 0.4, 0.22, Lc.room * 0.55 + 0.1, c.concrete);
  for (let i = 0; i < 5; i++) { const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.9, 4), c.rebar); bar.rotation.set(0.3 - r() * 0.6, 0, 0.3 - r() * 0.6); decor(bar, (r() - 0.5) * W, WH - 0.4, z0 + Lc.room * 0.2); }
  // mesa tombada e armário (cobertura)
  solid(-1.8, 0, z1 - 1.1, 1.4, 0.8, 0.7, m.plank, { yaw: 0.3 });
  solid(2.6, 0, z1 - 0.9, 0.9, 1.8, 0.5, m.containerRed);
  // as salas usam coordenadas locais da ilha (como nos acampamentos)
  const [rcx, rcz] = P(0, zc);
  const rooms = [{ x: rcx, z: rcz, yaw: ctx.yaw, hw: W / 2, hd: Lc.room / 2, door: [P(0, z0 + 0.9), P(0, z0 - 1.6)] }];
  const spawnSpots = [P(-2, zc - 0.6), P(2, zc + 0.6), P(0, zc + 1.6)].map(([x, z]) => ({ x, z, y: 0, high: false }));
  const crateSpots = [P(-2.4, z1 - 2.4), P(2.3, z0 + 1.2)];
  const debrisSpots = [P(-1.2, zc + 0.4), P(1.4, zc - 1.2), P(0.2, zc + 1.8)].map(([x, z]) => [ctx.x + x, ctx.z + z]);
  // a jangada encosta na parte da rampa fora d'água (e não atravessa a sala)
  const bz0 = -hz + Lc.run * ((0.9 - Lc.low) / rise), bz1 = z1;
  const [bx, bzw] = P(0, (bz0 + bz1) / 2);
  return {
    ...B, kind: 'predio', floorY, R: Math.min(W / 2, Lc.room / 2) - 0.2, center: [rcx, rcz], ladders: [], towers: [], spawnSpots, rooms, crateSpots, debrisSpots,
    block: { x: ctx.x + bx, z: ctx.z + bzw, yaw: ctx.yaw, hx: W / 2 + 0.2, hz: (bz1 - bz0) / 2 },
  };
}
