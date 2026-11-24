// Roupas e acessórios da pílula. Tudo procedural e "vestido" sobre a cápsula (R = 0,5, cilindro
// de y = -0,55 a 0,55, frente em +Z): o tronco é uma casca de lathe um pouco maior que o corpo,
// com abertura na frente para casacos; as mangas são tubos presos ao ombro (balançam com o braço).
// O rosto fica na parte de cima, então nada passa da altura da emenda (y ≈ 0,09) na frente.
import * as THREE from '../three.js';

export const PILL_OUTFITS = [
  { id: 'nenhuma', nome: 'Nenhuma' }, { id: 'casaco', nome: 'Casaco' }, { id: 'jaleco', nome: 'Jaleco' },
  { id: 'pirata', nome: 'Casaco de pirata' }, { id: 'colete', nome: 'Colete salva-vidas' },
  { id: 'marinheiro', nome: 'Camisa de marinheiro' }, { id: 'moletom', nome: 'Moletom com capuz' },
];
export const PILL_BACKS = [
  { id: 'nenhum', nome: 'Nenhum' }, { id: 'mochila', nome: 'Mochila' }, { id: 'explorador', nome: 'Mochila de explorador' },
  { id: 'boia', nome: 'Boia' }, { id: 'capa', nome: 'Capa' }, { id: 'bandoleira', nome: 'Bandoleira' }, { id: 'papagaio', nome: 'Papagaio' },
];

const R = 0.5, L = 1.1, TOP = 0.07;   // TOP: borda de cima das roupas (logo abaixo da emenda)
const V2 = (x, y) => new THREE.Vector2(x, y), V3 = (x, y, z) => new THREE.Vector3(x, y, z);

// ---------- texturas de tecido ----------
const texCache = new Map();
function canvasTex(key, w, h, draw, repeat = [1, 1]) {
  const k = key + repeat.join('x');
  if (texCache.has(k)) return texCache.get(k);
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(...repeat); t.anisotropy = 4;
  texCache.set(k, t); return t;
}
const weave = () => canvasTex('weave', 128, 128, (g, W, H) => { // trama clara (multiplica a cor)
  g.fillStyle = '#e8e8e8'; g.fillRect(0, 0, W, H);
  for (let y = 0; y < H; y += 2) { g.fillStyle = `rgba(0,0,0,${0.04 + Math.random() * 0.05})`; g.fillRect(0, y, W, 1); }
  for (let x = 0; x < W; x += 2) { g.fillStyle = `rgba(255,255,255,${0.04 + Math.random() * 0.05})`; g.fillRect(x, 0, 1, H); }
  for (let i = 0; i < 90; i++) { g.fillStyle = `rgba(0,0,0,${Math.random() * 0.05})`; g.fillRect(Math.random() * W, Math.random() * H, 3, 3); }
}, [6, 4]);
const stripes = (hexA, hexB) => canvasTex('str' + hexA + hexB, 32, 256, (g, W, H) => {
  for (let y = 0; y < H; y += 32) { g.fillStyle = hexA; g.fillRect(0, y, W, 18); g.fillStyle = hexB; g.fillRect(0, y + 18, W, 14); }
}, [1, 3]);
const quilt = () => canvasTex('quilt', 64, 128, (g, W, H) => { // colete: gomos estofados
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, W, H);
  for (let y = 0; y < H; y += 32) { const gr = g.createLinearGradient(0, y, 0, y + 32); gr.addColorStop(0, 'rgba(0,0,0,0.28)'); gr.addColorStop(0.25, 'rgba(0,0,0,0)'); gr.addColorStop(0.85, 'rgba(0,0,0,0.05)'); gr.addColorStop(1, 'rgba(0,0,0,0.3)'); g.fillStyle = gr; g.fillRect(0, y, W, 32); }
}, [1, 2]);

const fabric = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.9, map: weave(), side: THREE.DoubleSide, ...extra });
const metal = (color) => new THREE.MeshStandardMaterial({ color, roughness: 0.35, metalness: 0.85 });
const plasticM = (color) => new THREE.MeshStandardMaterial({ color, roughness: 0.45, metalness: 0.05 });
const leather = (color = 0x5a3a20) => new THREE.MeshStandardMaterial({ color, roughness: 0.7 });
// gola que sobe só nas costas e nos lados (abertura de ~200° na frente, longe do rosto)
function backCollar(r, h, mat) {
  return new THREE.Mesh(new THREE.LatheGeometry([V2(r, TOP - 0.02), V2(r + h * 0.35, TOP + h * 0.6), V2(r + h * 0.55, TOP + h)], 32, Math.PI - 1.15, 2.3), mat);
}
// tubo ao longo da barra (aro horizontal com a abertura da frente)
function hemTube(r, y, gap, rad, mat) {
  const pts = []; for (let i = 0; i <= 48; i++) { const phi = gap / 2 + (i / 48) * (Math.PI * 2 - gap); pts.push(V3(Math.sin(phi) * r, y, Math.cos(phi) * r)); }
  return new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 64, rad, 6), mat);
}
const shade = (hexv, k) => new THREE.Color(hexv).multiplyScalar(k).getHex();

// ---------- tronco ----------
// Perfil da casca: segue a cápsula afastado `t`; com `skirt`, desce reto e abre um pouco (casacos longos).
function shellProfile(t, yBottom, yTop = TOP, skirt = null) {
  const pts = [], r = R + t;
  if (skirt) { // de baixo para cima: barra aberta → quadril → lado reto do corpo
    pts.push(V2(r + skirt.flare, skirt.y), V2(r + skirt.flare * 0.5, skirt.y + (-L / 2 - skirt.y) * 0.5), V2(r + 0.01, -L / 2 + 0.02), V2(r, -L / 2 + 0.12));
  } else {
    const a0 = Math.asin(Math.max(-1, Math.min(0, (yBottom + L / 2) / r)));
    for (let i = 0; i <= 10; i++) { const a = a0 * (1 - i / 10); pts.push(V2(Math.cos(a) * r, -L / 2 + Math.sin(a) * r)); }
  }
  pts.push(V2(r, yTop - 0.02), V2(r - 0.008, yTop), V2(r - 0.03, yTop + 0.006)); // borda dobrada para dentro
  return pts;
}
// phiGap = largura da abertura na frente (rad); 0 = fechado
function shell(pts, mat, phiGap = 0, seg = 48) {
  const g = new THREE.LatheGeometry(pts, seg, phiGap / 2, Math.PI * 2 - phiGap);
  const m = new THREE.Mesh(g, mat); m.castShadow = true; m.receiveShadow = true; return m;
}
// ponto na superfície a um ângulo phi (0 = frente, +X = esquerda do personagem) e raio r
const onSurf = (phi, y, r) => V3(Math.sin(phi) * r, y, Math.cos(phi) * r);
// coisa achatada colada na superfície, virada para fora
function patch(geo, mat, phi, y, r, tiltX = 0) {
  const m = new THREE.Mesh(geo, mat); m.position.copy(onSurf(phi, y, r)); m.rotation.set(tiltX, phi, 0, 'YXZ'); m.castShadow = true; return m;
}
// tubo seguindo a borda da abertura (dá espessura ao tecido / acabamento dourado)
function edgeTube(pts, phi, rad, mat) {
  const path = new THREE.CatmullRomCurve3(pts.map((p) => V3(Math.sin(phi) * p.x, p.y, Math.cos(phi) * p.x)));
  return new THREE.Mesh(new THREE.TubeGeometry(path, 32, rad, 6), mat);
}
function band(y, h, r, mat, phiGap = 0) { // faixa (cinto, barra)
  return shell([V2(r, y - h / 2), V2(r + 0.006, y), V2(r, y + h / 2)], mat, phiGap, 40);
}
function buttons(list, mat, rad = 0.022) {
  const g = new THREE.Group();
  for (const [phi, y, r] of list) { const b = new THREE.Mesh(new THREE.SphereGeometry(rad, 10, 8), mat); b.scale.z = 0.5; b.position.copy(onSurf(phi, y, r)); b.rotation.y = phi; g.add(b); }
  return g;
}

// ---------- mangas (no espaço do ombro; side = -1 direito, +1 esquerdo) ----------
const LIMB = (s) => [V3(0, 0, 0), V3(s * 0.12, -0.15, 0), V3(s * 0.16, -0.42, 0.02), V3(s * 0.15, -0.6, 0.04)];
function sleeve(side, mat, { length = 'long', rad = 0.07, cuff = null, cuffRad = 0.085 } = {}) {
  const g = new THREE.Group(), pts = LIMB(side);
  const curve = new THREE.CatmullRomCurve3(length === 'short' ? [pts[0], pts[1], pts[1].clone().lerp(pts[2], 0.35)] : [pts[0], pts[1], pts[2], pts[2].clone().lerp(pts[3], 0.65)]);
  const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 20, rad, 10, false), mat); tube.castShadow = true; g.add(tube);
  const sh = new THREE.Mesh(new THREE.SphereGeometry(rad * 1.35, 14, 10), mat); sh.position.set(side * 0.02, -0.01, 0); g.add(sh); // ombro
  const end = curve.getPoint(1), dir = curve.getTangent(1);
  const c = new THREE.Mesh(new THREE.CylinderGeometry(cuffRad, cuffRad * 1.04, length === 'short' ? 0.04 : 0.07, 14, 1, true), cuff || mat);
  c.material.side = THREE.DoubleSide;
  c.position.copy(end); c.quaternion.setFromUnitVectors(V3(0, 1, 0), dir); g.add(c);
  return g;
}

// ---------- roupas ----------
// Retorna { body: Group (no corpo), sleeves: { R, L } (nos ombros) } ou null.
export function makeOutfit(id, color, tint = false) { // tint: inimigos — até o colete usa a cor dada (vira colete tático)
  const body = new THREE.Group(), sl = {};
  const both = (fn) => { sl.R = fn(-1); sl.L = fn(1); };
  if (id === 'casaco') {
    const mat = fabric(color), dark = fabric(shade(color, 0.6)), gap = 0.55;
    const pts = shellProfile(0.03, -0.72);
    body.add(shell(pts, mat, gap));
    for (const s of [1, -1]) body.add(edgeTube(pts, s * gap / 2, 0.012, dark));
    body.add(backCollar(R + 0.03, 0.07, mat)); // gola (só atrás)
    body.add(buttons([0, 1, 2, 3].map((i) => [-(gap / 2 + 0.07), -0.05 - i * 0.16, R + 0.035]), plasticM(0x2a2018)));
    for (const s of [1, -1]) body.add(patch(new THREE.BoxGeometry(0.2, 0.05, 0.015), dark, s * 0.95, -0.42, R + 0.035)); // lapelas dos bolsos
    both((s) => sleeve(s, mat, { cuff: dark }));
  } else if (id === 'jaleco') {
    const white = fabric(0xf4f4f0), gap = 0.42;
    const pts = shellProfile(0.025, 0, TOP, { y: -1.0, flare: 0.08 });
    body.add(shell(pts, white, gap));
    for (const s of [1, -1]) {
      body.add(edgeTube(pts, s * gap / 2, 0.01, white));
      const lapel = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.34, 0.016), white); // lapela dobrada
      lapel.position.copy(onSurf(s * (gap / 2 + 0.1), -0.08, R + 0.04)); lapel.rotation.set(0, s * (gap / 2 + 0.1), s * 0.35, 'YXZ'); body.add(lapel);
    }
    body.add(buttons([0, 1, 2].map((i) => [-(gap / 2 + 0.05), -0.32 - i * 0.18, R + 0.03]), plasticM(0xdedad0), 0.018));
    body.add(patch(new THREE.BoxGeometry(0.17, 0.15, 0.014), white, 0.78, -0.22, R + 0.034)); // bolso do peito
    for (const [k, c] of [[-0.04, 0x2d6cdf], [0.0, 0xd3202b], [0.045, 0x2a2a2e]]) { // canetas
      const pen = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.14, 8), plasticM(c));
      pen.position.copy(onSurf(0.78 + k, -0.13, R + 0.05)); body.add(pen);
    }
    const badge = patch(new THREE.BoxGeometry(0.12, 0.06, 0.008), plasticM(0x2d6cdf), -0.8, -0.18, R + 0.033); body.add(badge); // crachá
    both((s) => sleeve(s, white, { cuffRad: 0.08 }));
  } else if (id === 'pirata') {
    const main = fabric(shade(color, 0.85)), gold = metal(0xc9a03a), gap = 0.5;
    const pts = shellProfile(0.035, 0, TOP, { y: -1.03, flare: 0.13 });
    body.add(shell(pts, main, gap));
    for (const s of [1, -1]) body.add(edgeTube(pts, s * gap / 2, 0.016, gold));                         // acabamento dourado
    body.add(hemTube(R + 0.035 + 0.13, -1.03, gap, 0.014, gold)); // barra dourada
    body.add(backCollar(R + 0.035, 0.11, main)); // gola alta (só atrás)
    for (const s of [1, -1]) body.add(buttons([0, 1, 2].map((i) => [s * (gap / 2 + 0.1), -0.05 - i * 0.12, R + 0.04]), gold, 0.026));
    body.add(band(-0.33, 0.12, R + 0.055, leather(0x3e2715)));                                               // cinto largo
    const buckle = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.016, 6, 4), gold); buckle.rotation.z = Math.PI / 4; buckle.position.set(0, -0.33, R + 0.07); body.add(buckle);
    for (let i = 0; i < 3; i++) { // jabô de babados
      const fr = new THREE.Mesh(new THREE.ConeGeometry(0.07 - i * 0.008, 0.08, 10, 1, true), fabric(0xf6f2e6));
      fr.position.set(0, 0.0 - i * 0.07, R + 0.03); fr.rotation.x = -0.25; body.add(fr);
    }
    both((s) => { const g = sleeve(s, main, { cuffRad: 0.11, cuff: main }); const trim = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.012, 6, 20), gold); const c = g.children.at(-1); trim.position.copy(c.position); trim.quaternion.copy(c.quaternion).multiply(new THREE.Quaternion().setFromAxisAngle(V3(1, 0, 0), Math.PI / 2)); g.add(trim); return g; });
  } else if (id === 'colete') {
    const orange = new THREE.MeshStandardMaterial({ color: tint ? color : 0xf26a1b, roughness: 0.6, map: quilt(), side: THREE.DoubleSide }), gap = 0.32;
    const pts = shellProfile(0.07, -0.55);
    body.add(shell(pts, orange, gap));
    for (const s of [1, -1]) body.add(edgeTube(pts, s * gap / 2, 0.035, orange));
    const strap = new THREE.MeshStandardMaterial({ color: 0x1c1c1e, roughness: 0.8 });
    for (const y of [-0.16, -0.38]) {
      body.add(band(y, 0.045, R + 0.085, strap));
      const bk = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.06, 0.03), plasticM(0x2a2a2e)); bk.position.set(0, y, R + 0.09); body.add(bk);
    }
    body.add(band(-0.02, 0.03, R + 0.074, new THREE.MeshStandardMaterial({ color: 0xe8eef0, roughness: 0.3, metalness: 0.4 }), gap)); // faixa refletiva
    const pillow = new THREE.Mesh(new THREE.TorusGeometry(0.38, 0.075, 10, 24, Math.PI * 1.1), orange); // gola de boia atrás
    pillow.rotation.set(Math.PI / 2, 0, Math.PI - Math.PI * 0.55); pillow.position.y = TOP + 0.03; body.add(pillow);
  } else if (id === 'marinheiro') {
    const shirt = new THREE.MeshStandardMaterial({ map: stripes('#f4f2ea', '#' + new THREE.Color(color).getHexString()), roughness: 0.85, side: THREE.DoubleSide });
    body.add(shell(shellProfile(0.016, -0.68), shirt));
    const navy = fabric(shade(color, 0.7));
    const flap = shell([V2(R + 0.03, -0.3), V2(R + 0.032, -0.1), V2(R + 0.028, TOP + 0.01)], navy, 0, 24); // gola quadrada nas costas
    flap.geometry.dispose(); flap.geometry = new THREE.LatheGeometry([V2(R + 0.03, -0.3), V2(R + 0.032, -0.1), V2(R + 0.028, TOP + 0.01)], 24, Math.PI - 0.95, 1.9);
    body.add(flap);
    for (const s of [1, -1]) { // pontas da gola em V na frente
      const v = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.36, 0.01), navy);
      v.position.copy(onSurf(s * 0.38, -0.08, R + 0.03)); v.rotation.set(0, s * 0.38, -s * 0.55, 'YXZ'); body.add(v);
    }
    const knot = new THREE.Mesh(new THREE.SphereGeometry(0.04, 10, 8), fabric(0xd3202b)); knot.position.set(0, -0.2, R + 0.04); body.add(knot); // lenço
    for (const s of [1, -1]) { const tail = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.16, 8), fabric(0xd3202b)); tail.position.set(s * 0.03, -0.3, R + 0.04); tail.rotation.set(Math.PI, 0, s * 0.3); body.add(tail); }
    both((s) => sleeve(s, shirt, { length: 'short', rad: 0.075, cuff: navy, cuffRad: 0.08 }));
  } else if (id === 'moletom') {
    const mat = fabric(color), rib = fabric(shade(color, 0.75));
    body.add(shell(shellProfile(0.035, -0.75), mat));
    body.add(band(-0.9 + 0.17, 0.08, R + 0.04, rib));                                                         // barra canelada
    const pocket = new THREE.LatheGeometry([V2(R + 0.05, -0.62), V2(R + 0.055, -0.45), V2(R + 0.048, -0.32)], 16, -0.62, 1.24);
    body.add(new THREE.Mesh(pocket, rib));                                                                     // bolso canguru
    const hood = new THREE.Mesh(new THREE.SphereGeometry(0.33, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.55), mat); // capuz caído nas costas
    hood.scale.set(1.15, 0.7, 0.6); hood.rotation.x = Math.PI * 0.62; hood.position.set(0, TOP - 0.05, -(R + 0.13)); body.add(hood);
    for (const s of [1, -1]) { // cordões
      const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.007, 0.22, 6), fabric(0xf4f2ea));
      cord.position.copy(onSurf(s * 0.22, -0.06, R + 0.045)); body.add(cord);
      const tip = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.03, 6), metal(0xb8bcc0)); tip.position.copy(cord.position); tip.position.y -= 0.12; body.add(tip);
    }
    both((s) => sleeve(s, mat, { cuff: rib, cuffRad: 0.072 }));
  } else return null;
  body.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return { body, sleeves: sl };
}

// ---------- acessórios ----------
// Retorna { body: Group, shoulderL?: Group, anim?: (dt, speed, ph) => void } ou null.
// depth = quanto a roupa engrossa o tronco (a mochila não entra no casaco)
export function makeBack(id, color, depth = 0) {
  const body = new THREE.Group(), r = R + depth + 0.02;
  // alças: descem das costas, contornam o lado e cruzam a frente
  const straps = (mat, yBack = -0.05, yFront = -0.45) => {
    for (const s of [1, -1]) { // costas → por cima do ombro (perto da emenda) → frente, ao lado do braço
      const ctrl = [onSurf(s * (Math.PI - 0.32), yBack, r + 0.012), onSurf(s * (Math.PI - 0.75), TOP - 0.01, r + 0.02),
        onSurf(s * 1.45, TOP - 0.005, r + 0.025), onSurf(s * 0.82, TOP - 0.06, r + 0.02), onSurf(s * 0.62, yFront, r + 0.012)];
      body.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(ctrl), 32, 0.022, 6), mat));
    }
  };
  let anim = null, shoulderL = null;
  if (id === 'mochila' || id === 'explorador') {
    const big = id === 'explorador', canvas = fabric(big ? 0x6b5a3a : 0x5f6b3a), dark = fabric(big ? 0x4a3d26 : 0x434c28), w = big ? 0.6 : 0.52, h = big ? 0.82 : 0.6, d = big ? 0.32 : 0.24;
    const pack = new THREE.Mesh(new THREE.CapsuleGeometry(d / 2, h - d, 6, 14), canvas); pack.scale.x = w / d; pack.position.set(0, -0.18, -(r + d / 2)); body.add(pack);
    const flap = new THREE.Mesh(new THREE.SphereGeometry(w / 2, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), dark); flap.scale.set(1, 0.35, d / w); flap.position.set(0, -0.18 + h / 2 - d / 2 + 0.02, -(r + d / 2)); body.add(flap);
    const pocket = new THREE.Mesh(new THREE.CapsuleGeometry(0.07, 0.12, 4, 10), dark); pocket.scale.x = 2.2; pocket.position.set(0, -0.3, -(r + d + 0.02)); body.add(pocket);
    for (const s of [1, -1]) { const bk = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.02), metal(0x9a9da0)); bk.position.set(s * 0.12, -0.1, -(r + d + 0.005)); body.add(bk); }
    straps(dark);
    if (big) { // colchonete enrolado em cima e cantil do lado
      const roll = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, w + 0.08, 16), fabric(0xa83a2c)); roll.rotation.z = Math.PI / 2; roll.position.set(0, -0.18 + h / 2 + 0.08, -(r + d / 2)); body.add(roll);
      for (const s of [-0.18, 0.18]) { const tie = new THREE.Mesh(new THREE.TorusGeometry(0.115, 0.012, 6, 16), leather()); tie.rotation.y = Math.PI / 2; tie.position.copy(roll.position); tie.position.x = s; body.add(tie); }
      const can = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.18, 12), metal(0x6a7d6a)); can.position.set(w / 2 + 0.06, -0.3, -(r + d / 2)); body.add(can);
    }
  } else if (id === 'boia') {
    const white = plasticM(0xf4f4f0), red = plasticM(0xd3202b);
    const ring = new THREE.Group();
    for (let i = 0; i < 8; i++) { const seg = new THREE.Mesh(new THREE.TorusGeometry(0.33, 0.09, 10, 8, Math.PI / 4 + 0.01), i % 2 ? red : white); seg.rotation.z = i * Math.PI / 4; ring.add(seg); }
    const rope = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.01, 4, 32), leather(0xc9b48a)); ring.add(rope);
    ring.position.set(0, -0.15, -(r + 0.1)); ring.rotation.x = 0.12; body.add(ring);
    straps(leather(0xc9b48a), 0.05, -0.35);
  } else if (id === 'capa') {
    const mat = fabric(color);
    const cape = new THREE.Group(); cape.position.set(0, TOP, -0.1); body.add(cape);
    const geo = new THREE.LatheGeometry([V2(R + 0.04, 0), V2(R + 0.08, -0.4), V2(R + 0.16, -0.9), V2(R + 0.22, -1.25)], 28, Math.PI - 1.25, 2.5);
    const cloth = new THREE.Mesh(geo, mat); cloth.position.z = 0.1; cape.add(cloth);
    const clasp = new THREE.Mesh(new THREE.TorusGeometry(R + 0.04, 0.02, 6, 40, Math.PI * 1.3), metal(0xc9a03a)); clasp.rotation.set(Math.PI / 2, 0, Math.PI / 2 + Math.PI * 0.35); clasp.position.set(0, 0, 0.1); cape.add(clasp);
    anim = (dt, speed, ph) => { const k = Math.min(1, speed / 6); cape.rotation.x = -0.55 * k - 0.05 + Math.sin(ph * 1.7) * (0.04 + 0.08 * k); };
  } else if (id === 'bandoleira') {
    const belt = leather(0x4a2e18), brass = metal(0xc9a03a), pts = [];
    for (let i = 0; i <= 40; i++) { const phi = (i / 40) * Math.PI * 2; pts.push(onSurf(phi, -0.3 + 0.2 * Math.sin(phi), r + 0.02)); }
    body.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, true), 64, 0.032, 6, true), belt));
    for (let i = -5; i <= 5; i++) { // balas na parte da frente
      const phi = i * 0.13, b = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.09, 8), brass);
      b.position.copy(onSurf(phi, -0.3 + 0.2 * Math.sin(phi), r + 0.05)); b.rotation.z = Math.atan(0.2 * Math.cos(phi) * 2); body.add(b);
    }
  } else if (id === 'papagaio') {
    // empoleirado no ombro esquerdo (acompanha o braço); a cabeça olha em volta e as asas batem às vezes
    const green = plasticM(0x2fa84f), red = plasticM(0xd3202b), blue = plasticM(0x2d6cdf), yellow = plasticM(0xf2c230);
    const bird = new THREE.Group(); shoulderL = new THREE.Group(); shoulderL.add(bird); bird.position.set(0.07, 0.1, -0.02);
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.075, 14, 10), green); b.scale.set(0.85, 1.25, 0.9); b.position.y = 0.09; bird.add(b);
    const head = new THREE.Group(); head.position.set(0, 0.2, 0.02); bird.add(head);
    head.add(new THREE.Mesh(new THREE.SphereGeometry(0.058, 14, 10), green));
    const beak = new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.06, 8), yellow); beak.rotation.x = Math.PI / 2 + 0.6; beak.position.set(0, -0.012, 0.06); head.add(beak);
    for (const s of [1, -1]) { const eye = new THREE.Mesh(new THREE.SphereGeometry(0.012, 8, 6), plasticM(0x111111)); eye.position.set(s * 0.04, 0.012, 0.035); head.add(eye); }
    const tail = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.2, 6), red); tail.rotation.x = -2.6; tail.position.set(0, 0.0, -0.08); bird.add(tail);
    const wings = [1, -1].map((s) => { const w = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), s > 0 ? blue : red); w.scale.set(0.35, 1.1, 0.8); w.position.set(s * 0.065, 0.09, -0.01); bird.add(w); return w; });
    for (const s of [1, -1]) { const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.04, 5), yellow); foot.position.set(s * 0.025, -0.01, 0.01); bird.add(foot); }
    let flap = 0, look = 0, lt = 1;
    anim = (dt) => {
      lt -= dt; if (lt <= 0) { lt = 1 + Math.random() * 2.5; look = (Math.random() - 0.5) * 1.6; if (Math.random() < 0.3) flap = 0.6; }
      head.rotation.y += (look - head.rotation.y) * Math.min(1, dt * 8);
      flap = Math.max(0, flap - dt); const f = flap > 0 ? Math.sin(flap * 40) * 0.8 : 0;
      wings[0].rotation.z = -0.15 - Math.abs(f); wings[1].rotation.z = 0.15 + Math.abs(f);
      bird.position.y = 0.1 + Math.abs(f) * 0.02;
    };
  } else return null;
  body.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return { body, shoulderL, anim };
}
export const OUTFIT_DEPTH = { casaco: 0.035, jaleco: 0.03, pirata: 0.05, colete: 0.08, marinheiro: 0.02, moletom: 0.04 };
