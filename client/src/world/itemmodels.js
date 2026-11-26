// Modelos dos itens largados no mundo (no lugar do saquinho): a arma de verdade, a bandagem, o kit,
// a caixa de munição, cartuchos, balas de canhão, comida, peixe, colete, canhão... deitados no chão.
// O primeiro item "mais importante" do saque dá o modelo; havendo outros, um saquinho pequeno fica ao lado.
import * as THREE from '../three.js';
import { buildWeapon, buildBandage, buildMedkit, buildShell } from '../player/viewmodel-parts.js';
import { makePieceMesh, PIECES } from '../boat/pieces.js';
import { makeVest } from '../player/vest.js';
import { makeFish } from '../systems/seaevents.js';
import { PILL_SCALE } from '../player/pill.js';

const std = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.7, ...extra });
const box = (w, h, d, m, x = 0, y = 0, z = 0) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(x, y, z); return b; };
const PRIORITY = ['colete', 'canhao_ferro', 'canhao', 'gancho', 'kit', 'bala_canhao', 'bandagem', 'cartucho', 'municao', 'peixe', 'energetico', 'barra_proteina', 'chocolate', 'metal'];

function ammoBox() {
  const g = new THREE.Group(), olive = std(0x4b5530, { roughness: 0.8 }), brass = std(0xc9a24a, { metalness: 0.8, roughness: 0.3 });
  g.add(box(0.3, 0.14, 0.18, olive, 0, 0.07, 0));
  g.add(box(0.31, 0.03, 0.19, std(0x3a4224), 0, 0.15, 0));
  g.add(box(0.06, 0.02, 0.04, std(0x2a2a2a), 0, 0.17, 0));
  for (let i = 0; i < 6; i++) { const c = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.07, 8), brass); c.rotation.z = Math.PI / 2; c.position.set(-0.08 + (i % 3) * 0.08, 0.012, 0.13 + ((i / 3) | 0) * 0.03); g.add(c); }
  return g;
}
function shells() { const g = new THREE.Group(); for (let i = 0; i < 4; i++) { const s = buildShell(); s.scale.setScalar(2.4); s.rotation.y = i * 0.9; s.position.set((i % 2) * 0.07 - 0.03, 0.025, ((i / 2) | 0) * 0.08 - 0.04); g.add(s); } return g; }
function cannonballs() { const g = new THREE.Group(), iron = std(0x2b2d30, { metalness: 0.7, roughness: 0.45 }); for (const [x, y, z] of [[-0.12, 0.11, 0], [0.12, 0.11, 0], [0, 0.11, 0.2], [0, 0.29, 0.07]]) { const b = new THREE.Mesh(new THREE.SphereGeometry(0.11, 14, 10), iron); b.position.set(x, y, z); g.add(b); } return g; }
function proteinBar() { const g = new THREE.Group(); g.add(box(0.2, 0.035, 0.07, std(0x2f6fb5, { roughness: 0.4, metalness: 0.3 }), 0, 0.02, 0)); g.add(box(0.08, 0.037, 0.072, std(0xf2e9d0), 0, 0.02, 0)); return g; }
function energyCan() { const g = new THREE.Group(); const can = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.12, 14), std(0x1fbf5a, { metalness: 0.8, roughness: 0.25 })); can.rotation.z = Math.PI / 2; can.position.y = 0.035; g.add(can); const band = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.036, 0.03, 14), std(0x111111, { metalness: 0.6 })); band.rotation.z = Math.PI / 2; band.position.y = 0.035; g.add(band); return g; }
function chocolate() { const g = new THREE.Group(), choc = std(0x4a2a16, { roughness: 0.5 }); g.add(box(0.16, 0.02, 0.08, choc, 0, 0.01, 0)); for (let i = 0; i < 4; i++) for (let j = 0; j < 2; j++) g.add(box(0.035, 0.012, 0.035, choc, -0.06 + i * 0.04, 0.025, -0.02 + j * 0.04)); g.add(box(0.08, 0.024, 0.082, std(0xb02a2a, { roughness: 0.4 }), 0.05, 0.012, 0)); return g; }
function scrap() { const g = new THREE.Group(), m = std(0x7d858b, { metalness: 0.7, roughness: 0.5 }); const a = box(0.3, 0.02, 0.22, m, 0, 0.01, 0); a.rotation.y = 0.3; g.add(a); const b = box(0.2, 0.02, 0.16, m, 0.05, 0.03, 0.04); b.rotation.set(0.1, -0.5, 0.05); g.add(b); return g; }
function smallSack() {
  const g = new THREE.Group(), cloth = std(0xa88a5a, { roughness: 1 });
  const s = new THREE.Mesh(new THREE.SphereGeometry(0.11, 12, 8), cloth); s.scale.y = 0.85; s.position.y = 0.09; g.add(s);
  const n = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.05, 0.07, 8), std(0x5a4126)); n.position.y = 0.2; g.add(n);
  return g;
}

function modelFor(key) {
  if (key.startsWith('arma_')) {
    const spec = buildWeapon(key.slice(5).replace(/_r[1-4]$/, ''));
    if (!spec) return null;
    if (spec.flashMesh) spec.flashMesh.visible = false;
    const g = new THREE.Group(), w = spec.group;
    w.scale.setScalar(1.5); w.rotation.set(0, 0, Math.PI / 2); // deitada de lado no chão
    g.add(w); return g;
  }
  switch (key) {
    case 'bandagem': { const b = buildBandage(); b.scale.setScalar(2.4); const g = new THREE.Group(); g.add(b); return g; }
    case 'kit': { const k = buildMedkit(); k.scale.setScalar(2); k.rotation.x = -Math.PI / 2; const g = new THREE.Group(); g.add(k); return g; }
    case 'municao': return ammoBox();
    case 'cartucho': return shells();
    case 'bala_canhao': return cannonballs();
    case 'barra_proteina': return proteinBar();
    case 'energetico': return energyCan();
    case 'chocolate': return chocolate();
    case 'metal': return scrap();
    case 'peixe': { const f = makeFish(); f.scale.setScalar(1.5); f.rotation.z = Math.PI / 2; const g = new THREE.Group(); g.add(f); return g; }
    case 'colete': { const v = makeVest(); v.scale.setScalar(PILL_SCALE * 0.95); v.rotation.x = -Math.PI / 2; const g = new THREE.Group(); g.add(v); return g; }
    case 'canhao': case 'canhao_ferro': case 'gancho': { if (!PIECES[key]) return null; const m = makePieceMesh(key); m.scale.setScalar(0.75); const g = new THREE.Group(); g.add(m); return g; }
    default: return null;
  }
}

// Monta o modelo do saque, apoiado no chão (y = 0 é o chão). Devolve { group, glint }.
export function makeItemModel(loot) {
  const keys = Object.keys(loot || {}).filter((k) => loot[k] > 0);
  const main = keys.find((k) => k.startsWith('arma_')) || PRIORITY.find((k) => keys.includes(k)) || keys[0];
  const g = new THREE.Group();
  let model = main ? modelFor(main) : null;
  if (!model) model = smallSack();
  g.add(model);
  if (keys.length > 1) { const s = smallSack(); s.position.set(0.35, 0, 0.25); g.add(s); } // tem mais coisa junto
  // apoia no chão: o ponto mais baixo do modelo fica em y = 0,02
  g.updateMatrixWorld(true);
  const bb = new THREE.Box3().setFromObject(g);
  if (Number.isFinite(bb.min.y)) for (const c of g.children) c.position.y -= bb.min.y - 0.02;
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  // brilho discreto (pisca de vez em quando, branco) para dar para achar no chão
  const glint = new THREE.Sprite(new THREE.SpriteMaterial({ map: glintTex(), color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
  glint.scale.setScalar(0.35); glint.position.set(0, Math.max(0.15, bb.max.y - bb.min.y) + 0.05, 0); glint.userData.noShadow = true;
  g.add(glint);
  return { group: g, glint };
}
let _gt = null;
function glintTex() {
  if (_gt) return _gt;
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const x = c.getContext('2d'), gr = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.2, 'rgba(255,255,255,0.5)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = gr; x.fillRect(0, 0, 64, 64);
  x.fillStyle = 'rgba(255,255,255,0.9)'; x.fillRect(31, 4, 2, 56); x.fillRect(4, 31, 56, 2); // estrelinha
  return (_gt = new THREE.CanvasTexture(c));
}
