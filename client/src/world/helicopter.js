// Helicóptero de resgate (procedural): o mesmo modelo serve para a cutscene de abertura (inteiro,
// voando, com os náufragos sentados na cabine de portas abertas) e para os destroços que ficam na
// ilha inicial (amassado, queimado, rotor torto, cauda partida, fumaça e fogo).
// Eixos locais: +Z = nariz, y = 0 = base dos esquis.
import * as THREE from '../three.js';
import { mulberry32 } from '../core/util.js';
import { metalTexture } from './textures.js';

const FLOOR_Y = 0.93; // topo do piso da cabine

function mats(wrecked) {
  const k = wrecked ? 0.78 : 1;
  const c = (hex) => new THREE.Color(hex).multiplyScalar(k);
  const metal = metalTexture();
  return {
    body: new THREE.MeshStandardMaterial({ color: c(0xe9e6df), map: null, metalness: 0.35, roughness: wrecked ? 0.9 : 0.45 }),
    stripe: new THREE.MeshStandardMaterial({ color: c(0xc8382a), metalness: 0.3, roughness: wrecked ? 0.95 : 0.6 }),
    dark: new THREE.MeshStandardMaterial({ color: c(0x2c3035), map: wrecked ? metal : null, metalness: 0.6, roughness: 0.6 }),
    floor: new THREE.MeshStandardMaterial({ color: c(0x4a4f55), metalness: 0.4, roughness: 0.8 }),
    seat: new THREE.MeshStandardMaterial({ color: c(0x5b6a3a), roughness: 0.95 }),
    glass: new THREE.MeshStandardMaterial({
      color: wrecked ? 0x2a3338 : 0x8fb6c9, metalness: 0.8, roughness: wrecked ? 0.5 : 0.08,
      transparent: true, opacity: wrecked ? 0.35 : 0.42, depthWrite: false,
    }),
    soot: new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 1, transparent: true, opacity: 0.85, depthWrite: false }),
  };
}

const boxM = (w, h, l, m) => new THREE.Mesh(new THREE.BoxGeometry(w, h, l), m);

// Retorna o grupo com userData: { rotor, tailRotor, tail, body, seats[], pilotSeat, engine, hub }
export function makeHelicopter({ wrecked = false, seed = 7 } = {}) {
  const M = mats(wrecked), r = mulberry32(seed);
  const root = new THREE.Group();
  const body = new THREE.Group(); root.add(body);
  const add = (m, x, y, z, parent = body) => { m.position.set(x, y, z); parent.add(m); return m; };

  // ---- esquis ----
  for (const sx of [-1.15, 1.15]) {
    const skid = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 4.2, 8), M.dark);
    skid.rotation.x = Math.PI / 2; add(skid, sx, 0.07, 0.1);
    const tip = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.5, 8), M.dark);
    tip.rotation.x = Math.PI / 2 - 0.7; add(tip, sx, 0.2, 2.35);
    for (const sz of [-1.0, 1.1]) {
      const strut = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.95, 6), M.dark);
      strut.rotation.z = sx > 0 ? 0.35 : -0.35; add(strut, sx * 0.85, 0.5, sz);
    }
  }
  // ---- cabine (portas laterais abertas) ----
  add(boxM(2.3, 0.2, 3.5, M.floor), 0, FLOOR_Y - 0.1, 0.15);
  add(boxM(2.36, 0.22, 3.5, M.body), 0, FLOOR_Y - 0.3, 0.15);            // barriga
  for (const sx of [-1, 1]) add(boxM(0.04, 0.14, 3.5, M.stripe), sx * 1.19, FLOOR_Y - 0.3, 0.15); // faixa vermelha
  add(boxM(2.3, 0.16, 2.9, M.body), 0, 2.42, -0.05);                     // teto
  add(boxM(2.3, 1.55, 0.14, M.body), 0, 1.65, -1.55);                    // parede de trás
  add(boxM(1.3, 0.6, 2.4, M.body), 0, 2.78, -0.7);                       // carenagem do motor
  const engine = add(boxM(0.9, 0.35, 0.7, M.dark), 0, 2.85, -1.75);      // escape
  for (const sx of [-1.1, 1.1]) for (const sz of [-1.45, 1.05]) add(boxM(0.1, 1.5, 0.1, M.body), sx, 1.65, sz); // colunas das portas
  // portas de correr (abertas, encostadas atrás)
  for (const sx of [-1.22, 1.22]) add(boxM(0.05, 1.35, 1.2, M.body), sx, 1.62, -2.05);
  // bancos no meio, costas com costas (cada lado olha para fora)
  add(boxM(0.5, 0.42, 2.4, M.seat), 0, FLOOR_Y + 0.21, -0.2);
  add(boxM(0.14, 0.9, 2.4, M.seat), 0, FLOOR_Y + 0.65, -0.2);
  // ---- nariz e cockpit ----
  const nose = new THREE.Mesh(new THREE.SphereGeometry(1.2, 20, 14, 0, Math.PI * 2, Math.PI * 0.5, Math.PI * 0.5), M.body);
  nose.scale.set(0.98, 0.75, 1.1); add(nose, 0, 1.25, 1.85);
  const glass = new THREE.Mesh(new THREE.SphereGeometry(1.2, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.5), M.glass);
  glass.scale.set(0.98, 0.95, 1.1); add(glass, 0, 1.25, 1.85);
  add(boxM(2.0, 0.08, 0.08, M.dark), 0, 2.3, 1.62);
  const pilotSeat = new THREE.Vector3(0.45, FLOOR_Y, 1.7);
  add(boxM(0.55, 0.5, 0.5, M.seat), 0.45, FLOOR_Y + 0.25, 1.55);
  add(boxM(0.55, 0.5, 0.5, M.seat), -0.45, FLOOR_Y + 0.25, 1.55);
  // ---- cauda ----
  const tail = new THREE.Group(); tail.position.set(0, 2.25, -1.6); body.add(tail);
  const boom = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.42, 5.2, 12), M.body);
  boom.rotation.x = -Math.PI / 2; boom.position.z = -2.6; tail.add(boom);
  const stripe = new THREE.Mesh(new THREE.CylinderGeometry(0.27, 0.3, 0.35, 12), M.stripe);
  stripe.rotation.x = -Math.PI / 2; stripe.position.z = -3.6; tail.add(stripe);
  const fin = boxM(0.1, 1.5, 0.9, M.body); fin.position.set(0, 0.55, -5.1); fin.rotation.x = 0.35; tail.add(fin);
  const stab = boxM(1.5, 0.06, 0.45, M.body); stab.position.set(0, 0, -4.4); tail.add(stab);
  const tailRotor = new THREE.Group(); tailRotor.position.set(0.14, 0.75, -5.25); tail.add(tailRotor);
  for (let i = 0; i < 2; i++) {
    const b = boxM(0.03, 1.2, 0.12, M.dark); b.rotation.x = i * Math.PI / 2; tailRotor.add(b);
  }
  // ---- rotor principal ----
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.6, 8), M.dark); add(mast, 0, 3.35, -0.3);
  const rotor = new THREE.Group(); rotor.position.set(0, 3.68, -0.3); body.add(rotor);
  rotor.add(new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.16, 10), M.dark));
  const blades = [];
  for (let i = 0; i < 2; i++) {
    const arm = new THREE.Group(); arm.rotation.y = i * Math.PI; rotor.add(arm);
    const blade = boxM(0.34, 0.05, 5.6, M.dark); blade.position.z = 2.9; arm.add(blade);
    blades.push(arm);
  }
  const hub = new THREE.Vector3(0, 3.7, -0.3);

  // assentos dos passageiros: 3 de cada lado, sentados no piso com as pernas para fora da porta
  const seats = [];
  for (const side of [-1, 1]) for (const z of [0.55, -0.2, -0.95]) {
    seats.push({ pos: new THREE.Vector3(side * 0.42, FLOOR_Y + 0.02, z), yaw: side * Math.PI / 2 });
  }

  if (wrecked) {
    // pás tortas (uma partida), vidro estilhaçado, fuligem e lataria amassada
    blades[0].rotation.x = 0.28; blades[0].rotation.z = 0.15;
    blades[1].children[0].scale.z = 0.45; blades[1].children[0].position.z = 1.3; blades[1].rotation.x = -0.5;
    rotor.rotation.y = 0.7;
    glass.scale.y = 0.7; glass.rotation.z = 0.2;
    tailRotor.children[1].visible = false;
    for (let i = 0; i < 9; i++) {
      const s = new THREE.Mesh(new THREE.PlaneGeometry(0.6 + r() * 1.2, 0.4 + r() * 0.9), M.soot);
      const side = r() < 0.5 ? -1 : 1;
      s.position.set(side * 1.21, 1.2 + r() * 1.2, -1.4 + r() * 2.8); s.rotation.y = side * Math.PI / 2;
      body.add(s);
    }
    const dents = [[0.9, 2.3, 1.2], [-0.6, 2.5, -0.9], [1.1, 1.4, -1.3]];
    for (const [x, y, z] of dents) add(boxM(0.6, 0.12, 0.5, M.dark), x, y, z).rotation.set(r(), r(), r());
  }

  root.userData = { rotor, tailRotor, tail, body, seats, pilotSeat, engine, hub, blades };
  root.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return root;
}

// ---- fumaça (sprites que sobem, crescem e somem) ----
let smokeTex = null;
function smokeTexture() {
  if (smokeTex) return smokeTex;
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'), grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,0.9)'); grad.addColorStop(0.5, 'rgba(255,255,255,0.4)'); grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad; g.fillRect(0, 0, 64, 64);
  smokeTex = new THREE.CanvasTexture(c);
  return smokeTex;
}

export class Smoke {
  // parent: onde os sprites vivem (cena = rastro no mundo; grupo = coluna presa ao objeto)
  constructor(parent, { count = 28, color = 0x2b2b2b, size = [1.2, 5], life = 4, rise = 2.2, opacity = 0.7 } = {}) {
    this.parent = parent; this.cfg = { size, life, rise, opacity };
    this.list = [];
    for (let i = 0; i < count; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: smokeTexture(), color, transparent: true, opacity: 0, depthWrite: false, fog: true }));
      s.visible = false; s.userData.noShadow = true;
      parent.add(s);
      this.list.push({ s, age: Infinity, vx: 0, vy: 0, vz: 0, rot: 0 });
    }
    this.i = 0; this.acc = 0; this.rate = count / life;
  }
  emit(x, y, z, vx = 0, vy = 0, vz = 0) {
    const p = this.list[this.i = (this.i + 1) % this.list.length];
    p.age = 0; p.s.visible = true; p.s.position.set(x, y, z);
    p.vx = vx + (Math.random() - 0.5) * 0.6; p.vy = vy + this.cfg.rise * (0.7 + Math.random() * 0.6); p.vz = vz + (Math.random() - 0.5) * 0.6;
    p.s.material.rotation = Math.random() * 6.28;
  }
  // emitir continuamente de um ponto (src = função que devolve [x, y, z])
  update(dt, src = null, wind = [0.6, 0.25]) {
    if (src) {
      this.acc += dt * this.rate;
      while (this.acc >= 1) { this.acc -= 1; const [x, y, z] = src(); this.emit(x, y, z); }
    }
    const { size, life, opacity } = this.cfg;
    for (const p of this.list) {
      if (p.age >= life) { if (p.s.visible) p.s.visible = false; continue; }
      p.age += dt;
      const u = p.age / life;
      p.s.position.x += (p.vx + wind[0] * u) * dt; p.s.position.y += p.vy * dt * (1 - u * 0.5); p.s.position.z += (p.vz + wind[1] * u) * dt;
      p.s.scale.setScalar(size[0] + (size[1] - size[0]) * u);
      p.s.material.opacity = opacity * Math.min(1, u * 6) * (1 - u);
    }
  }
}

// ---- destroços na ilha inicial ----
// Lugar fixo (sai do raio da ilha): todos os jogadores veem o mesmo. Fica na beira sudeste,
// longe do encaixe da jangada no centro, das caixas iniciais e dos pontos de nascer.
export function wreckSpot(R) {
  const a = -Math.PI / 4, d = R * 0.86;
  return { x: Math.cos(a) * d, z: Math.sin(a) * d, yaw: a + Math.PI / 2 + 0.25 };
}

// Monta os destroços no grupo da ilha (coords locais) e devolve { group, items, update(dt) }.
// items = colisores locais da ilha (lataria e cauda) para ninguém atravessar o helicóptero.
export function buildHeliWreck(R, TOP) {
  const spot = wreckSpot(R);
  const group = new THREE.Group();
  group.position.set(spot.x, TOP, spot.z); group.rotation.y = spot.yaw;
  group.userData.noBake = true;
  const heli = makeHelicopter({ wrecked: true, seed: 11 });
  const u = heli.userData;
  // tombado de lado, meio enterrado na areia, nariz para baixo
  heli.position.set(0, -0.35, 0); heli.rotation.set(0.12, 0, 0.42);
  // a cauda partiu e rolou praia abaixo até a água (longe da plataforma inicial e das caixas)
  const TAIL = { x: 0.9, z: 3.0, yaw: Math.PI + 0.9 };
  u.body.remove(u.tail);
  u.tail.rotation.order = 'YXZ';
  u.tail.position.set(TAIL.x, 0.3, TAIL.z); u.tail.rotation.set(-0.24, TAIL.yaw, -1.1);
  group.add(heli, u.tail);
  // pedaços espalhados: porta, placas e uma pá do rotor
  const M = mats(true);
  const bits = [[2.2, 0.05, 1.9, 0.05, 1.35, 1.1, M.body], [-2.4, 0.04, 2.6, 0.9, 0.04, 0.7, M.dark], [3.1, 0.05, -1.8, 0.7, 0.05, 0.5, M.body], [-0.5, 0.06, 4.6, 0.34, 0.05, 3.2, M.dark]];
  for (const [x, y, z, w, h, l, m] of bits) {
    const b = boxM(w, h, l, m); b.position.set(x, y + h / 2, z); b.rotation.set(h > 1 ? 1.45 : 0, x * 1.7, 0.08); group.add(b);
  }
  // marca de queimado no chão
  const scorch = new THREE.Mesh(new THREE.CircleGeometry(3.6, 24), new THREE.MeshBasicMaterial({ color: 0x14110e, transparent: true, opacity: 0.55, depthWrite: false }));
  scorch.rotation.x = -Math.PI / 2; scorch.position.y = 0.07; scorch.scale.set(1.3, 1, 1); scorch.userData.noShadow = true;
  group.add(scorch);
  // fogo pequeno no motor
  const fire = new THREE.Group(); fire.position.set(0.55, 2.05, -1.3);
  [[0xff4d1a, 0.32, 0.9, 0.85], [0xff8a2a, 0.22, 0.7, 0.8], [0xffd36a, 0.12, 0.45, 0.95]].forEach(([c, rr, hh, op]) => {
    const fl = new THREE.Mesh(new THREE.ConeGeometry(rr, hh, 7, 1, true),
      new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: op, depthWrite: false, side: THREE.DoubleSide }));
    fl.geometry.translate(0, hh / 2, 0); fl.userData.noShadow = true; fire.add(fl);
  });
  group.add(fire);
  group.traverse((o) => { if (o.isMesh && o.material.transparent) o.castShadow = false; });
  const smoke = new Smoke(group, { count: 26, size: [1, 4.5], life: 5, rise: 1.6, opacity: 0.55 });
  // colisores (coordenadas locais da ilha; mesma convenção de giro do three: rotation.y)
  const toIsl = (x, z) => [spot.x + x * Math.cos(spot.yaw) + z * Math.sin(spot.yaw), spot.z - x * Math.sin(spot.yaw) + z * Math.cos(spot.yaw)];
  const tYaw = spot.yaw + TAIL.yaw, [tx, tz] = toIsl(TAIL.x, TAIL.z);
  const items = [
    { type: 'box', x: spot.x, y: TOP + 1.1, z: spot.z, hx: 1.4, hy: 1.1, hz: 2.4, yaw: spot.yaw },
    { type: 'box', x: tx - Math.sin(tYaw) * 2.4, y: TOP - 0.1, z: tz - Math.cos(tYaw) * 2.4, hx: 0.45, hy: 0.55, hz: 2.5, yaw: tYaw },
  ];
  let t = 0;
  return {
    group, items, spot, heli,
    // level = nível da água: debaixo d'água o fogo apaga e a fumaça para
    update(dt, level = 0) {
      t += dt;
      const lit = level < TOP + 1.6;
      fire.visible = lit;
      if (lit) fire.children.forEach((f, i) => {
        const s = 0.8 + Math.sin(t * (10 + i * 3.3) + i) * 0.15 + Math.sin(t * 27 + i * 5) * 0.08;
        f.scale.set(1 - (s - 1) * 0.5, s, 1 - (s - 1) * 0.5); f.rotation.y = t * (1.5 + i);
      });
      smoke.update(dt, lit ? () => [0.55 + (Math.random() - 0.5) * 0.4, 2.6, -1.3 + (Math.random() - 0.5) * 0.4] : null, [0.5, 0.2]);
    },
  };
}
