// Modelos da batalha naval:
//   • Canhão improvisado: um galão d'água azul preso com fita e corda num carrinho de madeira,
//     com um cano de ferro na frente. Gira (yawNode) e levanta o cano (pitchNode).
//   • Navio pirata: casco grande destrutível com dois mastros, velas negras com caveira,
//     portinholas de canhão nos dois bordos, castelo de popa e tripulação de pílulas malvadas.
import * as THREE from '../three.js';
import { woodTexture, woodBump, metalTexture, clothTexture, repeated } from './textures.js';
import { makeEnemyPill } from '../systems/evilpills.js';

const std = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.85, ...extra });

// ---------- canhão improvisado ----------
export function makeCannonMesh() {
  const g = new THREE.Group();
  const wood = std(0x7a5532, { map: repeated(woodTexture(), 0.6, 0.6), bumpMap: repeated(woodBump(), 0.6, 0.6), bumpScale: 1.4 });
  const dark = std(0x4b3420, { map: repeated(woodTexture(), 0.5, 0.5) });
  const iron = std(0x4b4f55, { map: metalTexture(), metalness: 0.7, roughness: 0.45 });
  const plastic = new THREE.MeshPhysicalMaterial({ color: 0x3f8fd8, roughness: 0.25, metalness: 0, transmission: 0.25, thickness: 0.3, clearcoat: 0.6, transparent: true, opacity: 0.92 });
  const tape = std(0x9a9a9a, { roughness: 0.55, metalness: 0.2 });
  const rope = std(0xb59b6a, { roughness: 1 });

  // carrinho (fica parado, preso no convés)
  const sled = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.16, 1.35), wood);
  sled.position.y = -0.37; g.add(sled);
  for (const x of [-0.5, 0.5]) for (const z of [-0.42, 0.42]) {
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.08, 14), dark);
    wheel.rotation.z = Math.PI / 2; wheel.position.set(x, -0.33, z); g.add(wheel);
  }
  // giro horizontal
  const yawNode = new THREE.Group(); yawNode.position.y = -0.27; g.add(yawNode);
  yawNode.add(Object.assign(new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.45, 0.06, 20), iron), {}));
  for (const x of [-0.33, 0.33]) {
    const cheek = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.5, 0.62), wood);
    cheek.position.set(x, 0.26, -0.02); yawNode.add(cheek);
  }
  // elevação do cano (eixo nas bochechas)
  const pitchNode = new THREE.Group(); pitchNode.position.set(0, 0.42, 0); yawNode.add(pitchNode);
  // galão d'água (perfil com ombro e gargalo), deitado com o gargalo para frente (+Z)
  const prof = [[0, 0], [0.24, 0.01], [0.27, 0.06], [0.27, 0.4], [0.22, 0.5], [0.1, 0.56], [0.075, 0.6], [0.075, 0.67], [0, 0.67]]
    .map(([x, y]) => new THREE.Vector2(x, y));
  const jug = new THREE.Mesh(new THREE.LatheGeometry(prof, 22), plastic);
  jug.rotation.x = Math.PI / 2; jug.position.z = -0.52; pitchNode.add(jug);
  const label = new THREE.Mesh(new THREE.CylinderGeometry(0.272, 0.272, 0.16, 22, 1, true), std(0xf2f2f2, { side: THREE.DoubleSide }));
  label.rotation.x = Math.PI / 2; label.position.z = -0.3; pitchNode.add(label);
  for (const z of [-0.44, -0.12]) { // fita silver tape segurando
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.275, 0.022, 6, 24), tape);
    band.position.z = z; pitchNode.add(band);
  }
  // cano de ferro + junta enrolada em fita
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.1, 1.05, 14), iron);
  barrel.rotation.x = Math.PI / 2; barrel.position.z = 0.62; pitchNode.add(barrel);
  const joint = new THREE.Mesh(new THREE.CylinderGeometry(0.115, 0.115, 0.16, 14), tape);
  joint.rotation.x = Math.PI / 2; joint.position.z = 0.16; pitchNode.add(joint);
  const lip = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.028, 6, 16), iron);
  lip.position.z = 1.14; pitchNode.add(lip);
  const bore = new THREE.Mesh(new THREE.CircleGeometry(0.07, 12), new THREE.MeshBasicMaterial({ color: 0x050505 }));
  bore.position.z = 1.15; pitchNode.add(bore);
  // amarras de corda do galão até as bochechas
  for (const x of [-1, 1]) {
    const r = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.42, 4), rope);
    r.position.set(x * 0.29, -0.06, -0.3); r.rotation.z = x * 0.5; pitchNode.add(r);
  }
  // pavio
  const fuse = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.16, 4), std(0x222222));
  fuse.position.set(0, 0.3, -0.62); fuse.rotation.x = -0.4; pitchNode.add(fuse);
  const muzzle = new THREE.Object3D(); muzzle.position.z = 1.2; pitchNode.add(muzzle);
  g.userData.cannon = { yawNode, pitchNode, muzzle, barrel, recoil: 0 };
  return g;
}

// ---------- navio pirata ----------
export const SHIP = { L: 18, W: 6.2, keel: -1.7, deck: 1.7 };
// meia largura do casco ao longo do comprimento (popa reta, proa afilada)
export function shipHalfWidth(z) {
  const { L, W } = SHIP, h = W / 2, s = -L / 2;
  if (z < s || z > L / 2) return 0;
  if (z < s + 3) return h * (0.82 + 0.18 * (z - s) / 3);
  if (z < 3) return h;
  const u = (z - 3) / (L / 2 - 3);
  return h * Math.sqrt(Math.max(0, 1 - u * u));
}

let skullTex = null;
function skullTexture() {
  if (skullTex) return skullTex;
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const x = c.getContext('2d');
  x.fillStyle = '#1d1b1d'; x.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 900; i++) { x.fillStyle = `rgba(255,255,255,${Math.random() * 0.04})`; x.fillRect(Math.random() * 256, Math.random() * 256, 3, 3); }
  x.fillStyle = '#e9e4d6'; x.strokeStyle = '#e9e4d6'; x.lineCap = 'round';
  x.lineWidth = 22; // ossos cruzados
  x.beginPath(); x.moveTo(62, 178); x.lineTo(194, 228); x.moveTo(194, 178); x.lineTo(62, 228); x.stroke();
  for (const [px, py] of [[56, 174], [200, 174], [56, 232], [200, 232]]) { x.beginPath(); x.arc(px, py, 14, 0, 7); x.fill(); }
  x.beginPath(); x.ellipse(128, 104, 62, 66, 0, 0, 7); x.fill(); // crânio
  x.fillRect(96, 140, 64, 34);
  x.fillStyle = '#1d1b1d';
  x.beginPath(); x.ellipse(104, 104, 18, 21, 0.2, 0, 7); x.ellipse(152, 104, 18, 21, -0.2, 0, 7); x.fill();
  x.beginPath(); x.moveTo(128, 124); x.lineTo(118, 142); x.lineTo(138, 142); x.fill();
  for (let i = 0; i < 4; i++) x.fillRect(104 + i * 14, 150, 6, 20);
  skullTex = new THREE.CanvasTexture(c); skullTex.colorSpace = THREE.SRGBColorSpace;
  return skullTex;
}

function hullGeometry(scaleW = 1, top = SHIP.deck, bottom = SHIP.keel) {
  const { L } = SHIP, N = 28, shape = new THREE.Shape();
  const pts = [];
  for (let i = 0; i <= N; i++) { const z = -L / 2 + (L * i) / N; pts.push([shipHalfWidth(z) * scaleW, z]); }
  // shape no plano XY com y = -z (vira +Z depois da rotação)
  shape.moveTo(-pts[0][0], -pts[0][1]);
  for (const [w, z] of pts) shape.lineTo(w, -z);
  for (let i = pts.length - 1; i >= 0; i--) shape.lineTo(-pts[i][0], -pts[i][1]);
  const h = top - bottom;
  const geo = new THREE.ExtrudeGeometry(shape, { depth: h, bevelEnabled: false, curveSegments: 4 });
  geo.rotateX(-Math.PI / 2); // extrusão vira altura (+Y), y do shape vira -Z
  geo.translate(0, bottom, 0);
  // afina para a quilha (casco em "V" arredondado)
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const u = (p.getY(i) - bottom) / h, k = 0.42 + 0.58 * Math.sqrt(Math.max(0, u));
    p.setX(i, p.getX(i) * k);
  }
  geo.computeVertexNormals();
  return geo;
}

export function makeWarship() {
  const { L, W, deck } = SHIP, g = new THREE.Group();
  const hullMat = std(0x6b4630, { map: repeated(woodTexture(), 0.25, 0.5), bumpMap: repeated(woodBump(), 0.25, 0.5), bumpScale: 2 });
  const deckMat = std(0xa17c50, { map: repeated(woodTexture(), 0.35, 0.35), bumpMap: repeated(woodBump(), 0.35, 0.35), bumpScale: 1.4 });
  const trim = std(0x8f2a1c, { roughness: 0.7 });
  const gold = std(0xc49a3a, { metalness: 0.6, roughness: 0.4 });
  const iron = std(0x2b2d31, { map: metalTexture(), metalness: 0.7, roughness: 0.5 });
  const spar = std(0x3d2a1a, { map: repeated(woodTexture(), 0.2, 1.5) });
  const hull = new THREE.Mesh(hullGeometry(), hullMat); g.add(hull);
  const wale = new THREE.Mesh(hullGeometry(1.015, 1.25, 0.85), trim); g.add(wale); // faixa vermelha
  const deckMesh = new THREE.Mesh(hullGeometry(0.93, deck + 0.02, deck - 0.1), deckMat); g.add(deckMesh);
  // amurada
  for (const s of [-1, 1]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.7, L * 0.62), hullMat);
    rail.position.set(s * (W / 2 - 0.12), deck + 0.35, -1.2); g.add(rail);
    const cap = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.06, L * 0.62), gold);
    cap.position.set(s * (W / 2 - 0.12), deck + 0.72, -1.2); g.add(cap);
  }
  // castelo de popa com janelas acesas
  const castle = new THREE.Mesh(new THREE.BoxGeometry(W * 0.86, 1.8, 4.2), hullMat);
  castle.position.set(0, deck + 0.9, -L / 2 + 2.2); g.add(castle);
  const castleTop = new THREE.Mesh(new THREE.BoxGeometry(W * 0.9, 0.12, 4.4), deckMat);
  castleTop.position.set(0, deck + 1.85, -L / 2 + 2.2); g.add(castleTop);
  const glow = new THREE.MeshStandardMaterial({ color: 0xffc46b, emissive: 0xff9a2e, emissiveIntensity: 1.6 });
  for (let i = -1; i <= 1; i++) {
    const win = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.42, 0.05), glow);
    win.position.set(i * 1.3, deck + 1.0, -L / 2 + 0.08); g.add(win);
  }
  const lantern = new THREE.Mesh(new THREE.SphereGeometry(0.18, 10, 8), glow);
  lantern.position.set(0, deck + 2.5, -L / 2 + 0.4); g.add(lantern);
  // gurupés
  const bowsprit = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.16, 6, 8), spar);
  bowsprit.rotation.x = Math.PI / 2 - 0.3; bowsprit.position.set(0, deck + 0.9, L / 2 + 1.4); g.add(bowsprit);
  // portinholas + canhões nos dois bordos
  const ports = { left: [], right: [] }, portMat = new THREE.MeshBasicMaterial({ color: 0x0b0806 });
  for (const z of [-4.2, -1.6, 1.0, 3.4]) {
    for (const s of [-1, 1]) {
      const hw = shipHalfWidth(z);
      const port = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.55, 0.7), portMat);
      port.position.set(s * (hw + 0.01), 0.75, z); g.add(port);
      const gun = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 1.1, 10), iron);
      gun.rotation.z = Math.PI / 2; gun.position.set(s * (hw + 0.25), 0.75, z); g.add(gun);
      (s > 0 ? ports.left : ports.right).push(new THREE.Vector3(s * (hw + 0.8), 0.75, z));
    }
  }
  // mastros, vergas e velas negras
  const sailMat = new THREE.MeshStandardMaterial({ color: 0x3a3638, map: clothTexture(), roughness: 0.95, side: THREE.DoubleSide });
  const skullMat = new THREE.MeshStandardMaterial({ map: skullTexture(), roughness: 0.95, side: THREE.DoubleSide });
  const sails = [];
  const mast = (z, h, sw, skull) => {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.22, h, 10), spar);
    m.position.set(0, deck + h / 2, z); g.add(m);
    for (const [y, w, sh, mat] of [[deck + h * 0.42, sw, h * 0.3, skull ? skullMat : sailMat], [deck + h * 0.78, sw * 0.75, h * 0.22, sailMat]]) {
      const yard = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, w + 0.6, 8), spar);
      yard.rotation.z = Math.PI / 2; yard.position.set(0, y + sh / 2, z + 0.12); g.add(yard);
      const geo = new THREE.PlaneGeometry(w, sh, 10, 8), pa = geo.attributes.position;
      for (let i = 0; i < pa.count; i++) { const x = pa.getX(i) / (w / 2), yy = pa.getY(i) / (sh / 2); pa.setZ(i, (1 - x * x) * (1 - yy * yy * 0.4) * 0.7); }
      geo.computeVertexNormals();
      const sail = new THREE.Mesh(geo, mat); sail.position.set(0, y, z + 0.25); g.add(sail); sails.push(sail);
    }
    return m;
  };
  mast(2.6, 12, 6.4, true);
  mast(-3.6, 10, 5.4, false);
  // bandeira preta
  const flag = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1, 8, 2), new THREE.MeshStandardMaterial({ map: skullTexture(), side: THREE.DoubleSide, roughness: 0.9 }));
  flag.geometry.translate(0.8, 0, 0); flag.position.set(0, deck + 12.3, 2.6); g.add(flag);
  const flagBase = flag.geometry.attributes.position.array.slice();
  // tripulação
  const crew = [];
  for (const [x, z] of [[1.2, 4.5], [-1.4, 0.2], [1.6, -2.6], [-0.6, -6.5]]) {
    const pill = makeEnemyPill('pirata'); pill.position.set(x, deck, z); pill.rotation.y = x > 0 ? Math.PI / 2 : -Math.PI / 2;
    g.add(pill); crew.push(pill);
  }
  // barra de vida (sprite sempre virado para a câmera)
  const hc = document.createElement('canvas'); hc.width = 128; hc.height = 16;
  const htex = new THREE.CanvasTexture(hc);
  const hp = new THREE.Sprite(new THREE.SpriteMaterial({ map: htex, depthTest: false, transparent: true }));
  hp.scale.set(5, 0.62, 1); hp.position.set(0, deck + 14.2, 0); hp.renderOrder = 999; g.add(hp);
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; } });
  g.userData.ship = { ports, sails, flag, flagBase, crew, hpCanvas: hc, hpTex: htex, hpSprite: hp, scorchParent: g };
  return g;
}

export function drawShipHp(ship, frac) {
  const c = ship.hpCanvas, x = c.getContext('2d');
  x.clearRect(0, 0, 128, 16);
  x.fillStyle = 'rgba(0,0,0,0.6)'; x.fillRect(0, 0, 128, 16);
  x.fillStyle = frac > 0.5 ? '#e0ac4c' : frac > 0.25 ? '#ff8a3a' : '#ff3b2b';
  x.fillRect(2, 2, 124 * Math.max(0, frac), 12);
  ship.hpTex.needsUpdate = true;
}
