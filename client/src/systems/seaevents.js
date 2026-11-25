// Eventos do mar com criaturas e raios (sorteados pelo host em events.js, simulados em cada cliente):
//   • Kraken: tentáculos saem da água em volta da jangada, batem no convés e AGARRAM peças (dano
//     contínuo). Corte/atire nos tentáculos; de tempos em tempos a cabeça emerge — acerte o OLHO.
//     Olho destruído (ou todos os tentáculos) = o kraken foge e deixa caixotes de loot.
//   • Tubarões: rodeiam a jangada, mordem quem cair na água e às vezes dão trombadas no casco.
//   • Peixes voadores: um cardume cruza a jangada; quem estiver no caminho leva uma pancada. Acertar
//     um peixe no ar pega ele (comida); os que caem no convés ficam se debatendo — pegue com [E].
//   • Tempestade de raios: o raio avisa (anel brilhando) antes de cair. Vela levantada atrai raios
//     para o mastro; raio na água eletrocuta tubarões e piratas por perto (e você, se estiver nadando).
// Rede: o evento (com a semente) vem do host; cada cliente anima as criaturas e cuida do próprio
// jogador. Dano nas peças da jangada só o host aplica (e avisa a sala).
import * as THREE from '../three.js';
import { clamp, clock, mulberry32, rot } from '../core/util.js';
import { sea, waveHeight } from '../world/ocean.js';
import { sfx } from '../core/sfx.js';

export const SEA_KINDS = ['kraken', 'tubaroes', 'peixes', 'raios'];
export const SEA_BALANCE = {
  kraken: { dur: 110, tentacles: [4, 6], tentHp: [70, 120], eyeHp: [200, 320], slam: 16, grabDps: 14, playerDmg: 14 },
  tubaroes: { dur: 85, count: [3, 5], hp: 60, bite: 12, ram: 12 },
  peixes: { dur: 28 },
  raios: { dur: 70, every: [2.2, 4.2], warn: 1.25, dmg: 24, mastDmg: 16, waterR: 8 },
};
const smooth = (x) => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); };
const _v = new THREE.Vector3(), _w = new THREE.Vector3();

// ---------------- modelos ----------------
const SEG = 12, SEG_L = 0.55, BEND = 8 / SEG; // BEND: a dobra por junta é calibrada para 8 juntas
// Pele do kraken: roxo-avermelhado manchado (textura de manchas compartilhada)
let krakenTex = null;
function krakenSkin() {
  if (krakenTex) return krakenTex;
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, 256, 256);
  let s = 7; const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 220; i++) { // manchas escuras e sardas claras
    const x = rnd() * 256, y = rnd() * 256, r = 2 + rnd() * 10;
    g.fillStyle = rnd() < 0.7 ? `rgba(60,10,40,${0.25 + rnd() * 0.35})` : `rgba(255,220,230,${0.2 + rnd() * 0.25})`;
    g.beginPath(); g.ellipse(x, y, r, r * (0.6 + rnd() * 0.6), rnd() * 3, 0, Math.PI * 2); g.fill();
  }
  krakenTex = new THREE.CanvasTexture(c); krakenTex.wrapS = krakenTex.wrapT = THREE.RepeatWrapping;
  return krakenTex;
}
// Cilindro com cor por vértice: dorso escuro, parte de dentro (ventosas, +Z) rosada
function skinCylinder(r1, r0, h) {
  const geo = new THREE.CylinderGeometry(r1, r0, h, 16, 2), pos = geo.attributes.position, col = new Float32Array(pos.count * 3);
  const top = new THREE.Color(0x5e1f45), under = new THREE.Color(0xe7a4a0), c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i), r = Math.hypot(x, z) || 1, k = Math.max(0, z / r);
    c.copy(top).lerp(under, Math.pow(k, 1.6) * 0.85);
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return geo;
}
function makeTentacle() {
  const map = krakenSkin().clone(); map.needsUpdate = true; map.repeat.set(1, 0.5);
  const skin = new THREE.MeshStandardMaterial({ vertexColors: true, map, roughness: 0.38, metalness: 0.05 });
  const sucker = new THREE.MeshStandardMaterial({ color: 0xf2c4bd, roughness: 0.55 });
  const cup = new THREE.MeshStandardMaterial({ color: 0x8a3a52, roughness: 0.7 });
  const root = new THREE.Group(), segs = [];
  let parent = root;
  const rad = (i) => 0.52 * Math.pow(1 - i / SEG, 0.85) + 0.04;
  for (let i = 0; i < SEG; i++) {
    const r0 = rad(i), r1 = rad(i + 1);
    const g = new THREE.Group();
    const m = new THREE.Mesh(skinCylinder(r1, r0, SEG_L), skin); m.position.y = SEG_L / 2; g.add(m);
    const joint = new THREE.Mesh(new THREE.SphereGeometry(r0 * 0.98, 16, 10), skin); g.add(joint); // esconde a emenda entre os pedaços
    for (let k = 0; k < 2; k++) { // ventosas em fila na parte de dentro
      const rr = r0 * (0.42 - k * 0.06), y = SEG_L * (0.28 + k * 0.45);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(rr, rr * 0.32, 6, 14), sucker); ring.position.set(0, y, r0 * 0.88 - k * 0.02); g.add(ring);
      const hole = new THREE.Mesh(new THREE.CircleGeometry(rr * 0.75, 12), cup); hole.position.set(0, y, r0 * 0.9 - k * 0.02 + 0.005); g.add(hole);
    }
    if (i) g.position.y = SEG_L;
    parent.add(g); segs.push(g); parent = g;
  }
  // ponta fina e curvada
  const tipGlow = new THREE.MeshStandardMaterial({ color: 0x6a2048, emissive: 0xff3020, emissiveIntensity: 0, roughness: 0.4 });
  const tip = new THREE.Mesh(new THREE.ConeGeometry(rad(SEG) + 0.02, 0.55, 12), tipGlow); tip.position.y = SEG_L + 0.25; segs[SEG - 1].add(tip);
  root.userData = { segs, skin, tipGlow };
  return root;
}
// Cabeça: manto bulboso e irregular, dois olhos dourados com pupila em fenda e pálpebras, e
// tentáculos curtos se mexendo na base.
function makeKrakenHead() {
  const g = new THREE.Group();
  const map = krakenSkin().clone(); map.needsUpdate = true; map.repeat.set(2, 2);
  const skin = new THREE.MeshStandardMaterial({ color: 0x7a2a58, map, roughness: 0.35, metalness: 0.05 });
  const geo = new THREE.SphereGeometry(2.6, 40, 28), pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) { // manto alongado para trás, com rugas
    let x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const n = 1 + 0.05 * Math.sin(x * 2.1 + y * 1.3) + 0.04 * Math.sin(z * 2.7 - y * 1.9);
    y *= 1.35; z -= Math.max(0, y) * 0.35; // inclina o "capuz" para trás
    pos.setXYZ(i, x * n, y * n, z * n);
  }
  geo.computeVertexNormals();
  const mantle = new THREE.Mesh(geo, skin); mantle.position.y = 0.8; g.add(mantle);
  const iris = new THREE.MeshStandardMaterial({ color: 0xf2c23a, emissive: 0x8a5a00, emissiveIntensity: 0.7, roughness: 0.2 });
  const slit = new THREE.MeshStandardMaterial({ color: 0x0a0505, roughness: 0.1 });
  const lidM = new THREE.MeshStandardMaterial({ color: 0x5a1c40, map, roughness: 0.4 });
  const eyes = [], lids = [];
  for (const s of [-1, 1]) {
    const socket = new THREE.Group(); socket.position.set(s * 1.45, 0.1, 1.85); socket.rotation.y = s * 0.45; g.add(socket);
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.62, 22, 16), iris); socket.add(eye);
    const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.4, 14, 10), slit); pupil.scale.set(1.25, 0.28, 0.5); pupil.position.z = 0.42; eye.add(pupil);
    const lid = new THREE.Mesh(new THREE.SphereGeometry(0.68, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.5), lidM); lid.rotation.x = -0.35; socket.add(lid);
    const brow = new THREE.Mesh(new THREE.TorusGeometry(0.66, 0.12, 8, 18, Math.PI), skin); brow.rotation.set(0, 0, 0); brow.position.y = 0.08; socket.add(brow);
    eyes.push(eye); lids.push(lid);
  }
  const stubs = [];
  for (let i = 0; i < 8; i++) { // tentáculos curtos em volta da base
    const a = i / 8 * Math.PI * 2, st = new THREE.Group(); st.position.set(Math.cos(a) * 1.9, -1.4, Math.sin(a) * 1.9); st.rotation.y = -a + Math.PI / 2; g.add(st);
    let par = st;
    for (let k = 0; k < 4; k++) {
      const r = 0.42 - k * 0.09, seg = new THREE.Group(); if (k) seg.position.y = 0.5; par.add(seg);
      const m = new THREE.Mesh(skinCylinder(r - 0.08, r, 0.55), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.4 })); m.position.y = 0.27; seg.add(m);
      seg.add(new THREE.Mesh(new THREE.SphereGeometry(r, 10, 8), skin)); par = seg; stubs.push({ seg, k, i });
    }
  }
  g.userData = { eye: eyes[0], eyes, lids, stubs, skin, t: Math.random() * 10 };
  return g;
}
function animateKrakenHead(m, dt) {
  const u = m.userData; u.t += dt;
  const blink = (u.t % 4.3) < 0.18 ? 1 : 0; // pisca de vez em quando
  u.lids.forEach((l) => { l.rotation.x += ((blink ? 0.55 : -0.35) - l.rotation.x) * Math.min(1, dt * 20); });
  u.stubs.forEach((s) => { s.seg.rotation.x = Math.sin(u.t * 2 + s.i * 0.8 + s.k * 0.6) * 0.35 + 0.25; });
}
function makeShark() {
  const g = new THREE.Group(), body = new THREE.Group();
  const grey = new THREE.MeshStandardMaterial({ color: 0x5d6b78, roughness: 0.55 });
  const white = new THREE.MeshStandardMaterial({ color: 0xd8dde0, roughness: 0.6 });
  const b = new THREE.Mesh(new THREE.SphereGeometry(0.5, 16, 10), grey); b.scale.set(0.75, 0.62, 2.6); body.add(b);
  const bl = new THREE.Mesh(new THREE.SphereGeometry(0.48, 14, 8), white); bl.scale.set(0.68, 0.4, 2.3); bl.position.y = -0.13; body.add(bl);
  const fin = new THREE.Mesh(new THREE.ConeGeometry(0.42, 0.9, 4), grey); fin.scale.set(0.18, 1, 1); fin.position.set(0, 0.62, -0.1); fin.rotation.x = -0.35; body.add(fin);
  const tail = new THREE.Group(); tail.position.z = -1.25; body.add(tail);
  const t1 = new THREE.Mesh(new THREE.ConeGeometry(0.4, 0.9, 4), grey); t1.scale.set(0.15, 1, 0.6); t1.position.set(0, 0.32, -0.25); t1.rotation.x = -0.7; tail.add(t1);
  const t2 = t1.clone(); t2.position.y = -0.22; t2.rotation.x = -2.3; tail.add(t2);
  for (const s of [-1, 1]) { const p = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.7, 4), grey); p.scale.set(0.15, 1, 0.5); p.position.set(s * 0.42, -0.15, 0.35); p.rotation.set(0.4, 0, s * 1.2); body.add(p); }
  const eyeM = new THREE.MeshBasicMaterial({ color: 0x050505 });
  for (const s of [-1, 1]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 4), eyeM); e.position.set(s * 0.3, 0.1, 0.95); body.add(e); }
  g.add(body); g.userData = { body, tail };
  return g;
}
// Peixe-voador: corpo afinando até a cauda (dorso azul-escuro, barriga prateada), olhão,
// "asas" (nadadeiras peitorais enormes) translúcidas com raios, nadadeiras pélvicas e cauda
// bifurcada com o lobo de baixo maior — como o peixe de verdade. Geometrias/materiais compartilhados.
let FISH = null;
function fishParts() {
  if (FISH) return FISH;
  // corpo: esfera esticada e afinada para trás, com cor por vértice (dorso → barriga)
  const body = new THREE.SphereGeometry(0.1, 20, 14);
  const pos = body.attributes.position, col = [], back = new THREE.Color(0x1d4f86), mid = new THREE.Color(0x4aa6d8), belly = new THREE.Color(0xe6eef2);
  for (let i = 0; i < pos.count; i++) {
    let x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i) * 2.9;      // comprimento
    const u = (z / 0.29 + 1) / 2;                                    // 0 = cauda, 1 = focinho
    const taper = 0.35 + 0.65 * Math.sin(Math.min(1, u * 1.25) * Math.PI / 2); // afina para a cauda
    x *= taper * 0.85; y *= taper;
    if (u > 0.85) y -= (u - 0.85) * 0.06;                            // focinho levemente para baixo
    pos.setXYZ(i, x, y, z);
    const k = THREE.MathUtils.clamp((y / (0.1 * taper) + 1) / 2, 0, 1); // 0 = barriga, 1 = dorso
    const c = k > 0.55 ? mid.clone().lerp(back, (k - 0.55) / 0.45) : belly.clone().lerp(mid, k / 0.55);
    col.push(c.r, c.g, c.b);
  }
  body.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  body.computeVertexNormals();
  // textura das nadadeiras: membrana azulada com raios
  const cv = document.createElement('canvas'); cv.width = 128; cv.height = 64;
  const g = cv.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 128, 0); grad.addColorStop(0, 'rgba(120,190,235,0.85)'); grad.addColorStop(1, 'rgba(200,235,255,0.55)');
  g.fillStyle = grad; g.fillRect(0, 0, 128, 64);
  g.strokeStyle = 'rgba(30,70,120,0.75)'; g.lineWidth = 2;
  for (let i = 0; i < 10; i++) { g.beginPath(); g.moveTo(0, 32); g.lineTo(128, 4 + i * 6.2); g.stroke(); }
  const finTex = new THREE.CanvasTexture(cv);
  const finMat = new THREE.MeshStandardMaterial({ map: finTex, transparent: true, side: THREE.DoubleSide, roughness: 0.4, metalness: 0.1, depthWrite: false });
  const shapeGeo = (pts) => { const sh = new THREE.Shape(); sh.moveTo(pts[0][0], pts[0][1]); for (const [a, b] of pts.slice(1)) sh.lineTo(a, b); return fitUV(new THREE.ShapeGeometry(sh)); };
  const fitUV = (geo) => { // UV pela caixa (a textura cobre a nadadeira inteira)
    geo.computeBoundingBox(); const bb = geo.boundingBox, p = geo.attributes.position, uv = [];
    for (let i = 0; i < p.count; i++) uv.push((p.getX(i) - bb.min.x) / (bb.max.x - bb.min.x || 1), (p.getY(i) - bb.min.y) / (bb.max.y - bb.min.y || 1));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); return geo;
  };
  // asa (peitoral): presa na raiz (x=0), longa e com a ponta arredondada para trás
  const wing = shapeGeo([[0, 0.03], [0.12, 0.07], [0.3, 0.06], [0.44, 0.0], [0.46, -0.06], [0.38, -0.12], [0.2, -0.13], [0.05, -0.07], [0, -0.03]]);
  const pelvic = shapeGeo([[0, 0.01], [0.1, 0.02], [0.16, -0.03], [0.08, -0.06], [0, -0.02]]);
  // cauda bifurcada (x = para trás), lobo de baixo maior
  const tail = shapeGeo([[0, 0.02], [0.14, 0.1], [0.18, 0.11], [0.1, 0.0], [0.24, -0.15], [0.2, -0.16], [0, -0.02]]);
  const dorsal = shapeGeo([[0, 0], [0.04, 0.06], [0.14, 0.05], [0.16, 0]]);
  FISH = {
    body, wing, pelvic, tail, dorsal, finMat,
    bodyMat: new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.55, roughness: 0.28 }),
    eyeW: new THREE.SphereGeometry(0.026, 10, 8), eyeB: new THREE.SphereGeometry(0.016, 8, 6),
    whiteMat: new THREE.MeshStandardMaterial({ color: 0xf4f1e6, roughness: 0.3 }), blackMat: new THREE.MeshBasicMaterial({ color: 0x050608 }),
  };
  return FISH;
}
function makeFish() {
  const F = fishParts(), g = new THREE.Group();
  const body = new THREE.Mesh(F.body, F.bodyMat); g.add(body);
  for (const s of [-1, 1]) { // olhos
    const w = new THREE.Mesh(F.eyeW, F.whiteMat); w.position.set(s * 0.052, 0.022, 0.2); g.add(w);
    const b = new THREE.Mesh(F.eyeB, F.blackMat); b.position.set(s * 0.068, 0.024, 0.208); g.add(b);
  }
  const wings = [];
  for (const s of [-1, 1]) { // asas: pivô na lateral, abertas para fora e um pouco para trás
    const piv = new THREE.Group(); piv.position.set(s * 0.06, 0.015, 0.1);
    const m = new THREE.Mesh(F.wing, F.finMat); m.rotation.set(-Math.PI / 2, 0, 0); m.scale.x = s; piv.add(m);
    piv.rotation.y = -s * 0.35; g.add(piv); wings.push(piv);
    const pv = new THREE.Mesh(F.pelvic, F.finMat); pv.rotation.set(-Math.PI / 2, 0, 0); pv.scale.x = s; // pélvicas
    pv.position.set(s * 0.03, -0.035, -0.1); pv.rotation.y = -s * 0.5; g.add(pv);
  }
  const tail = new THREE.Mesh(F.tail, F.finMat); tail.rotation.y = Math.PI / 2; tail.position.z = -0.27; g.add(tail);
  const dorsal = new THREE.Mesh(F.dorsal, F.finMat); dorsal.rotation.y = Math.PI / 2; dorsal.position.set(0, 0.055, -0.08); g.add(dorsal);
  g.scale.setScalar(1.15);
  g.userData = { wings, tail };
  return g;
}

export class SeaEvents {
  constructor(G) {
    this.G = G; this.e = null; this.fishOnDeck = [];
    this.bolts = []; this.warnings = [];
    this.light = new THREE.PointLight(0xcfe0ff, 0, 90, 1.5); G.scene.add(this.light);
  }
  _host() { return this.G.naval._isHost(); }
  _diff() { const b = this.G.boat; return this.G.world.difficulty(b.x, b.z); }

  // ---------- ciclo ----------
  // O estado de cada criatura fica num objeto próprio que herda os campos do evento (id, t0, dur,
  // seed...) — assim o evento que vai pela rede continua limpo.
  begin(ev) {
    this.end(); // limpa o anterior
    const e = Object.create(ev);
    this.e = e; e.r = mulberry32(ev.seed | 0); e.u = 0;
    const G = this.G;
    if (e.kind === 'kraken') this._krakenBegin(e);
    else if (e.kind === 'tubaroes') this._sharksBegin(e);
    else if (e.kind === 'peixes') { e.fish = []; e.nextFish = 1.5; G.hud.msg('Um cardume de peixes voadores vem na direção da jangada!'); }
    else if (e.kind === 'raios') { e.next = 4; G.hud.msg('O céu está carregado de raios — a vela levantada atrai raios para o mastro!'); if (G.hud.banner) G.hud.banner('TEMPESTADE DE RAIOS', 'Fuja dos anéis brilhando. Baixe a vela para o mastro não atrair raios.', 'storm', 6); }
  }
  end() {
    const e = this.e;
    if (!e) return;
    for (const c of e.creatures || []) this._killMesh(c);
    if (e.head) this._killMesh(e.head);
    for (const f of e.fish || []) this._killMesh(f);
    for (const w of this.warnings) this.G.scene.remove(w.mesh);
    this.warnings = [];
    this.e = null;
  }
  _killMesh(c) {
    this.G.scene.remove(c.mesh);
    if (this.G.enemies.list.includes(c)) this.G.enemies.remove(c);
  }
  // fim natural do evento (tempo acabou)
  finish(e) {
    const G = this.G;
    if (e.kind === 'kraken' && !e.defeated) G.hud.msg('O kraken afundou de volta para as profundezas.');
    if (e.kind === 'tubaroes') G.hud.msg('Os tubarões perderam o interesse.');
    this.end();
  }

  update(ev, dt, t) {
    if (!this.e || this.e.id !== ev.id) this.begin(ev);
    const e = this.e;
    e.u = t - e.t0;
    if (e.kind === 'kraken') this._krakenUpdate(e, dt, t);
    else if (e.kind === 'tubaroes') { if (this.G.player.swimming && !e.warned) { e.warned = true; this.G.hud.msg('Os tubarões sentiram você na água — volte para a jangada!'); } }
    else if (e.kind === 'peixes') this._fishUpdate(e, dt, t);
    else if (e.kind === 'raios') this._lightningUpdate(e, dt, t);
  }
  // roda sempre (peixes no convés, raios e luz)
  tick(dt, t) {
    this._deckFish(dt, t);
    this._updateBolts(dt);
  }

  // ======================= KRAKEN =======================
  _krakenBegin(e) {
    const G = this.G, B = SEA_BALANCE.kraken, r = e.r, diff = this._diff();
    const n = B.tentacles[0] + Math.floor(r() * (B.tentacles[1] - B.tentacles[0] + 1));
    e.creatures = [];
    const a0 = r() * Math.PI * 2;
    for (let i = 0; i < n; i++) {
      const ang = a0 + (i / n) * Math.PI * 2 + (r() - 0.5) * 0.5;
      const mesh = makeTentacle(); G.scene.add(mesh);
      const hp = (B.tentHp[0] + (B.tentHp[1] - B.tentHp[0]) * diff / 4) * G.enemies.partyMul();
      const c = G.enemies.addCreature({
        id: `${e.id}-t${i}`, mesh, hp, max: hp, def: { nome: 'Tentáculo' },
        body: { pos: new THREE.Vector3() }, ang, st: 'under', stT: 1 + i * 0.9 + r() * 1.5, rise: 0, ph: r() * 6, bend: 0, tilt: 0, cd: 0,
        ai: { update: (c2, dt2) => this._tentacle(e, c2, dt2), onHit: (c2) => { if (c2.st === 'grab') { c2.st = 'recoil'; c2.stT = 0.6; this._release(c2); } }, onDeath: (c2) => this._tentacleDead(e, c2) },
      });
      e.creatures.push(c);
    }
    e.headT = 22; e.alive = n;
    const eyeHp = (B.eyeHp[0] + (B.eyeHp[1] - B.eyeHp[0]) * diff / 4) * G.enemies.partyMul(true);
    const hm = makeKrakenHead(); hm.visible = false; hm.position.y = -80; G.scene.add(hm);
    e.head = G.enemies.addCreature({ id: `${e.id}-eye`, mesh: hm, hp: eyeHp, max: eyeHp, def: { nome: 'Olho do kraken' }, body: { pos: new THREE.Vector3(0, -50, 0) },
      up: 0, side: r() < 0.5 ? 1 : -1, immune: true,
      ai: { onHit: (h, n2) => { this.G.melee && this.G.melee.num(h.body.pos, n2, '#ffd166', h.hp < h.max * 0.3 ? 'OLHO!' : null); }, onDeath: () => this._krakenDefeated(e) } });
    G.hud.msg('Algo enorme se mexe debaixo da jangada...');
    if (G.hud.banner) G.hud.banner('KRAKEN', 'Corte os tentáculos antes que arranquem as peças. Atire no olho quando ele subir!', 'storm', 7);
    G.events.shake = Math.max(G.events.shake, 0.6);
  }

  _anchor(c) {
    const boat = this.G.boat, R = Math.max(2.6, boat.set.radius + 0.5);
    const [x, z] = boat.toWorld(Math.sin(c.ang) * R, Math.cos(c.ang) * R);
    return { x, z, y: sea.level - 0.6, yaw: boat.yaw + c.ang + Math.PI }; // yaw: virado para o centro da jangada
  }
  // posição das juntas (no plano do tentáculo): retorna [ [d, y], ... ] relativos à base
  _fk(tilt, bend, n = SEG) {
    const out = []; let a = tilt, d = 0, y = 0;
    for (let i = 0; i < n; i++) { d += Math.sin(a) * SEG_L; y += Math.cos(a) * SEG_L; out.push([d, y]); a += bend * BEND; }
    return out;
  }
  _tentacle(e, c, dt) {
    const G = this.G, B = SEA_BALANCE.kraken, boat = G.boat, A = this._anchor(c), t = e.u;
    c.stT -= dt; c.cd -= dt;
    const deckY = boat.set.y + 0.35 - A.y;
    let tilt = 0.25, bend = 0.12, k = 1;
    switch (c.st) {
      case 'under': k = 0; if (c.stT <= 0) { c.st = 'rise'; c.stT = 1.6; sfx.splash(new THREE.Vector3(A.x, sea.level, A.z), true); } break;
      case 'rise': k = smooth(1 - c.stT / 1.6); if (c.stT <= 0) { c.st = 'sway'; c.stT = 2 + e.r() * 3; } break;
      case 'sway': tilt = 0.2 + Math.sin(t * 1.3 + c.ph) * 0.18; bend = 0.1 + Math.sin(t * 0.9 + c.ph) * 0.08;
        if (c.stT <= 0) this._pickSlam(e, c, A, deckY); break;
      case 'windup': { // ergue alto, ponta brilhando vermelho (aviso)
        const u = smooth(1 - c.stT / 1.0); tilt = -0.25 * u + 0.2 * (1 - u); bend = 0.04;
        c.mesh.userData.tipGlow.emissiveIntensity = 2 * u * (0.6 + 0.4 * Math.sin(t * 30));
        if (c.stT <= 0) { c.st = 'slam'; c.stT = 0.28; } break;
      }
      case 'slam': { const u = smooth(1 - c.stT / 0.28); tilt = -0.25 + (c.tTilt + 0.25) * u; bend = 0.04 + (c.tBend - 0.04) * u;
        if (c.stT <= 0) { this._slamHit(e, c); c.st = 'grab'; c.stT = 4.5; } break; }
      case 'grab': tilt = c.tTilt; bend = c.tBend;
        c.mesh.userData.tipGlow.emissiveIntensity = 0;
        if (this._host() && c.target) { c.acc = (c.acc || 0) + dt; if (c.acc > 0.5) { c.acc = 0; G.naval.damagePiece(c.target, B.grabDps * 0.5); } }
        if (c.stT <= 0 || (c.target && !boat.pieces.get(c.target))) { c.st = 'recoil'; c.stT = 0.8; this._release(c); }
        break;
      case 'recoil': { const u = smooth(1 - c.stT / 0.8); tilt = (c.tTilt || 0.6) * (1 - u) + 0.25 * u; bend = (c.tBend || 0.2) * (1 - u) + 0.12 * u;
        c.mesh.userData.tipGlow.emissiveIntensity = 0;
        if (c.stT <= 0) { c.st = 'sway'; c.stT = 3 + e.r() * 4; } break; }
      case 'retreat': k = Math.max(0, c.stT / 2); tilt = 0.1; bend = 0.05; c.mesh.userData.tipGlow.emissiveIntensity = 0; if (c.stT <= 0) { this._killMesh(c); c.gone = true; } break;
    }
    if (c.gone) return;
    c.tilt += (tilt - c.tilt) * Math.min(1, dt * (c.st === 'slam' ? 30 : 6));
    c.bend += (bend - c.bend) * Math.min(1, dt * (c.st === 'slam' ? 30 : 6));
    // pose: base na água, gira de frente para a jangada; cada junta dobra para dentro
    const m = c.mesh;
    m.position.set(A.x, A.y - (1 - k) * 7, A.z);
    m.rotation.set(0, A.yaw, 0);
    const segs = m.userData.segs, wig = c.st === 'grab' ? 0.02 : 0.06;
    segs.forEach((s, i) => { s.rotation.set((i === 0 ? c.tilt : c.bend * BEND) + Math.sin(t * 2.4 + i * 0.7 + c.ph) * wig * BEND, 0, Math.sin(t * 1.7 + i * 0.5 + c.ph) * wig * 0.6 * BEND); });
    // ponto acertável: a junta mais perto da altura do peito do jogador
    m.updateMatrixWorld(true);
    const pp = G.player.body.pos; let best = 1e9;
    for (const s of segs) { s.getWorldPosition(_v); const d = Math.abs(_v.y - (pp.y + 1)) + Math.hypot(_v.x - pp.x, _v.z - pp.z) * 0.3; if (d < best) { best = d; c.body.pos.copy(_v); } }
    c.body.pos.y -= 1; // "pés" do alvo (o corpo a corpo compara com os pés do jogador)
    c.yaw = A.yaw;
  }
  _pickSlam(e, c, A, deckY) {
    const G = this.G, boat = G.boat;
    // alvo: uma peça da jangada (mesmo sorteio em todos os jogadores; quem estiver perto leva a pancada)
    let tx = 0, tz = 0, target = null;
    const [ax, az] = boat.toLocal(A.x, A.z);
    const pieces = [...boat.pieces.values()].filter((p) => G.naval.destructible(p) && Math.hypot(p.x - ax, p.z - az) < 6).sort((a, b) => (a.id < b.id ? -1 : 1));
    const roll = e.r();
    if (pieces.length) { const p = pieces[(roll * pieces.length) | 0]; tx = p.x; tz = p.z; target = p.id; }
    const D = clamp(Math.hypot(tx - ax, tz - az), 1.2, 5.6);
    // procura a pose (inclinação da base + dobra) cuja ponta cai mais perto do alvo
    let bestErr = 1e9;
    for (let ti = 0; ti <= 14; ti++) for (let bi = 0; bi <= 12; bi++) {
      const tl = ti * 0.09, bd = bi * 0.04, tip = this._fk(tl, bd)[SEG - 1];
      const err = Math.hypot(tip[0] - D, tip[1] - deckY);
      if (err < bestErr) { bestErr = err; c.tTilt = tl; c.tBend = bd; }
    }
    c.target = target; c.st = 'windup'; c.stT = 1.0;
    c.slamLocal = [tx, tz];
  }
  _slamHit(e, c) {
    const G = this.G, B = SEA_BALANCE.kraken, boat = G.boat;
    const segs = c.mesh.userData.segs; segs[SEG - 1].getWorldPosition(_v);
    sfx.kick(_v); sfx.splash(_v, true);
    G.events.shake = Math.max(G.events.shake, 0.55);
    if (this._host()) {
      const [lx, lz] = boat.toLocal(_v.x, _v.z);
      for (const p of [...boat.pieces.values()]) if (G.naval.destructible(p) && Math.hypot(p.x - lx, p.z - lz) < 1.6) G.naval.damagePiece(p.id, B.slam);
    }
    const pl = G.player, pp = pl.body.pos, d = Math.hypot(pp.x - _v.x, pp.z - _v.z);
    if (!pl.dead && d < 1.8 && Math.abs(pp.y - _v.y) < 2.5 && !(G.melee && G.melee.iframes > 0)) {
      G.survival.damage(B.playerDmg, 'Kraken');
      const k = 6 / Math.max(0.5, d); pl.body.vel.x += (pp.x - _v.x) * k; pl.body.vel.z += (pp.z - _v.z) * k; pl.body.vel.y = 5; pl.body.grounded = false;
    }
    if (c.target) G.hud.msg('Um tentáculo agarrou a jangada! Corte ele antes que arranque a peça');
  }
  _release() { /* a peça para de levar dano quando o tentáculo solta (estado muda) */ }
  _tentacleDead(e, c) {
    const G = this.G;
    sfx.enemyDown(c.body.pos);
    if (G.melee) G.melee.say(c.body.pos, 'CORTADO!', '#ffd166', true);
    c.st = 'retreat'; c.stT = 2; // afunda pelo loop normal (a criatura morta continua animando)
    e.alive--;
    if (e.alive <= 0) this._krakenDefeated(e);
    else if (e.headT > 6) e.headT = 3; // dói: a cabeça sobe para ver
  }
  _krakenUpdate(e, dt, t) {
    const G = this.G, h = e.head, boat = G.boat;
    if (e.defeated) return;
    // cabeça: sobe ao lado da jangada por ~8 s, de tempos em tempos
    e.headT -= dt;
    if (e.headT <= 0 && !h.upping) { h.upping = 8; h.mesh.visible = true; h.side = -h.side; G.hud.msg('A cabeça do kraken emergiu — mire no olho!'); sfx.splash(h.body.pos, true); }
    if (h.upping) {
      h.upping -= dt; h.immune = false;
      const u = h.upping > 6.8 ? smooth((8 - h.upping) / 1.2) : h.upping < 1.2 ? smooth(h.upping / 1.2) : 1;
      const [x, z] = boat.toWorld(h.side * (boat.set.radius + 7), 0);
      h.mesh.position.set(x, sea.level - 4.2 + u * 4.6 + Math.sin(t * 1.4) * 0.15, z);
      h.mesh.rotation.y = Math.atan2(boat.x - x, boat.z - z);
      animateKrakenHead(h.mesh, dt);
      // tinta: a cabeça incha (aviso) e espirra tinta na jangada — quem está a bordo e de frente fica no escuro
      if (h.upping < 5.4 && h.upping > 4.4) { const s = 1 + (5.4 - h.upping) * 0.12; h.mesh.scale.setScalar(s); }
      if (h.upping <= 4.4 && !h.inked) {
        h.inked = true; h.mesh.scale.setScalar(1); sfx.splash(h.body.pos, true);
        const pl = G.player, pp = pl.body.pos, hx = h.mesh.position.x - pp.x, hz = h.mesh.position.z - pp.z, l = Math.hypot(hx, hz) || 1;
        const [fx, fz] = pl.forward(), facing = (hx * fx + hz * fz) / l > -0.2;
        if (pl.aboard && !pl.dead && facing && !(G.melee && G.melee.iframes > 0) && G.bossSkills) { G.bossSkills.blind(2.5, 'tinta'); G.hud.msg('Tinta do kraken! Vire de costas quando a cabeça inchar'); }
      }
      h.mesh.userData.eye.getWorldPosition(h.body.pos); h.body.pos.y -= 1;
      if (h.upping <= 0) { h.upping = 0; h.inked = false; h.immune = true; h.mesh.visible = false; h.mesh.position.y = -80; h.body.pos.y = -80; e.headT = 14 + e.r() * 6; }
    }
    if (G.player.aboard) G.events.shake = Math.max(G.events.shake, 0.08);
  }
  _krakenDefeated(e) {
    const G = this.G;
    if (e.defeated) return;
    e.defeated = true;
    for (const c of e.creatures) if (c.st !== 'retreat') { c.state = 'dead'; c.st = 'retreat'; c.stT = 2; c.immune = true; }
    if (e.head) { e.head.immune = true; e.head.mesh.visible = false; e.head.mesh.position.y = -80; }
    G.hud.msg('O kraken foi derrotado e afundou! Destroços boiando por perto');
    if (G.hud.banner) G.hud.banner('KRAKEN DERROTADO', 'Pegue os caixotes que ficaram boiando.', 'good', 5);
    if (this._host()) this.spawnLoot(G.boat.x, G.boat.z, 3, 'kraken');
    if (this._host()) { const ev = G.events.current; if (ev && ev.id === e.id) { ev.dur = Math.min(ev.dur, clock() - ev.t0 + 6); if (G.net.online) G.net.send({ t: 'event', e: ev }); } }
  }

  // caixotes de loot boiando (usa os caixotes do sistema naval: [E] ou gancho)
  spawnLoot(x, z, n, kind) {
    const naval = this.G.naval, W = ['escopeta', 'rifle', 'pistola', 'rifle_precisao', 'sabre'];
    for (let i = 0; i < n; i++) {
      const a = Math.random() * 6.28, d = 4 + Math.random() * 6;
      let loot;
      if (kind === 'naufragio' && i === 0) loot = { ['arma_' + W[(Math.random() * (Math.random() < 0.15 ? 5 : 4)) | 0]]: 1, municao: 14, cartucho: 4 };
      else if (i === 0) loot = { kit: 1, municao: 12, bandagem: 1 };
      else loot = Math.random() < 0.5 ? { barra_proteina: 1, energetico: 1, chocolate: 1, peixe: 2 } : { cartucho: 6, municao: 10, bala_canhao: 4 };
      naval._spawnCrate({ id: `crate-${kind}-${Date.now().toString(36)}-${i}`, x: x + Math.cos(a) * d, z: z + Math.sin(a) * d, vx: Math.cos(a), vz: Math.sin(a), loot });
    }
    naval._sendCrates();
  }

  // ======================= TUBARÕES =======================
  _sharksBegin(e) {
    const G = this.G, B = SEA_BALANCE.tubaroes, r = e.r, n = B.count[0] + Math.floor(r() * (B.count[1] - B.count[0] + 1));
    e.creatures = [];
    for (let i = 0; i < n; i++) {
      const mesh = makeShark(); G.scene.add(mesh);
      const c = G.enemies.addCreature({
        id: `${e.id}-s${i}`, mesh, hp: B.hp * G.enemies.partyMul(), max: B.hp * G.enemies.partyMul(), def: { nome: 'Tubarão' }, body: { pos: new THREE.Vector3() },
        a: r() * 6.28, R: 9 + r() * 6, spd: 0.25 + r() * 0.15, dir: r() < 0.5 ? 1 : -1, st: 'circle', stT: 6 + r() * 8, x: 0, z: 0, dive: 0, bite: 0,
        ai: { update: (c2, dt2) => this._shark(e, c2, dt2), onDeath: (c2, by) => this._sharkDead(e, c2, by) },
      });
      const [x, z] = [G.boat.x + Math.cos(c.a) * (c.R + 20), G.boat.z + Math.sin(c.a) * (c.R + 20)]; c.x = x; c.z = z;
      e.creatures.push(c);
    }
    G.hud.msg(`Barbatanas em volta da jangada — ${n} tubarões! Não caia na água.`);
    if (G.hud.banner) G.hud.banner('TUBARÕES', 'Eles mordem quem estiver nadando e dão trombadas no casco.', 'pirate', 6);
  }
  _shark(e, c, dt) {
    const G = this.G, B = SEA_BALANCE.tubaroes, boat = G.boat, t = e.u, pl = G.player, pp = pl.body.pos;
    if (c.dying != null) {
      c.dying += dt; c.mesh.rotation.z = Math.min(Math.PI, c.dying * 3); c.mesh.position.y -= dt * 0.5;
      if (c.dying > 3) this._killMesh(c);
      return;
    }
    c.stT -= dt; c.bite -= dt;
    let tx, tz, speed = 4.2;
    const swimmer = pl.swimming && !pl.dead && Math.hypot(pp.x - boat.x, pp.z - boat.z) < 40;
    if (swimmer && c.st !== 'ram') c.st = 'hunt';
    else if (c.st === 'hunt' && !swimmer) { c.st = 'circle'; c.stT = 4; }
    if (c.st === 'circle') {
      c.a += c.dir * c.spd * dt * 1.6;
      tx = boat.x + Math.cos(c.a) * c.R; tz = boat.z + Math.sin(c.a) * c.R;
      if (c.stT <= 0) { c.st = 'ram'; c.stT = 6; }
    } else if (c.st === 'hunt') { tx = pp.x; tz = pp.z; speed = 6.2; }
    else { // trombada: vai até a borda da jangada e volta
      tx = boat.x; tz = boat.z; speed = 7;
      if (Math.hypot(c.x - boat.x, c.z - boat.z) < boat.set.radius + 1.3 || c.stT <= 0) {
        if (c.stT > 0) this._sharkRam(c);
        c.st = 'circle'; c.stT = 8 + e.r() * 10; c.a = Math.atan2(c.z - boat.z, c.x - boat.x);
      }
    }
    const dx = tx - c.x, dz = tz - c.z, d = Math.hypot(dx, dz) || 1;
    const want = Math.atan2(dx, dz);
    c.yaw += Math.atan2(Math.sin(want - c.yaw), Math.cos(want - c.yaw)) * Math.min(1, dt * 3);
    const sp = Math.min(speed, d * 2);
    c.x += Math.sin(c.yaw) * sp * dt; c.z += Math.cos(c.yaw) * sp * dt;
    // mordida em quem está nadando
    if (c.st === 'hunt' && c.bite <= 0 && Math.hypot(pp.x - c.x, pp.z - c.z) < 1.5) {
      c.bite = 2; G.survival.damage(B.bite, 'Tubarão'); sfx.hit(pp, true); G.hud.flash('hurt');
      if (G.melee) G.melee.say(pp, 'MORDIDA!', '#ff6b5a', true);
    }
    const y = waveHeight(c.x, c.z, clock()) - 0.45 + Math.sin(t * 2 + c.a) * 0.05;
    c.mesh.position.set(c.x, y, c.z); c.mesh.rotation.set(0, c.yaw, Math.sin(t * 3 + c.a) * 0.06);
    c.mesh.userData.tail.rotation.y = Math.sin(t * (c.st === 'circle' ? 6 : 11) + c.a) * 0.45;
    c.body.pos.set(c.x, Math.max(y, boat.set.y - 0.6), c.z);
  }
  _sharkRam(c) {
    const G = this.G, boat = G.boat;
    G.events.shake = Math.max(G.events.shake, 0.4); sfx.kick(c.body.pos); sfx.splash(c.body.pos, false);
    if (this._host()) {
      const [lx, lz] = boat.toLocal(c.x, c.z); let best = null, bd = 1e9;
      for (const p of boat.pieces.values()) { if (!G.naval.destructible(p)) continue; const d = Math.hypot(p.x - lx, p.z - lz); if (d < bd) { bd = d; best = p; } }
      if (best) G.naval.damagePiece(best.id, SEA_BALANCE.tubaroes.ram);
    }
  }
  _sharkDead(e, c, by) {
    const G = this.G;
    sfx.enemyDown(c.body.pos); if (G.melee) G.melee.say(c.body.pos, 'TUBARÃO ABATIDO', '#ffd166', true);
    c.dying = 0; // barriga para cima e afunda (no loop normal)
    if (by === 'L' && Math.random() < 0.6) G.hud.msg(G.survival.add({ peixe: 1 }) + ' (carne de tubarão)');
    if (e.creatures.every((x) => x.state === 'dead')) G.hud.msg('Os tubarões se foram!');
  }

  // ======================= PEIXES VOADORES =======================
  _fishUpdate(e, dt, t) {
    const G = this.G, boat = G.boat, pl = G.player, pp = pl.body.pos;
    e.nextFish -= dt;
    if (e.u < e.dur - 5 && e.nextFish <= 0) {
      e.nextFish = 0.12 + e.r() * 0.35;
      if (!e.dir) e.dir = e.r() * Math.PI * 2;
      const a = e.dir + (e.r() - 0.5) * 0.5, lat = (e.r() - 0.5) * (boat.set.radius * 2 + 4);
      const fx = Math.sin(a), fz = Math.cos(a), sx = fz, sz = -fx;
      const ox = boat.x - fx * 26 + sx * lat, oz = boat.z - fz * 26 + sz * lat;
      const mesh = makeFish(); G.scene.add(mesh);
      const f = G.enemies.addCreature({
        id: `${e.id}-f${(e.fish.length)}`, mesh, hp: 1, max: 1, def: { nome: 'Peixe voador' }, body: { pos: new THREE.Vector3() },
        ox, oz, fx, fz, T: 52, v: 15 + e.r() * 4, s: 0, peak: 1.4 + e.r() * 2.2, lane: e.r(), land: e.r() < 0.2,
        ai: { update: (f2, dt2) => this._fish(e, f2, dt2), onDeath: (f2, by) => { if (by === 'L') { G.hud.msg('Pegou um peixe no ar!  ' + G.survival.add({ peixe: 1 })); sfx.pickup(); } this._killMesh(f2); f2.gone = true; } },
      });
      e.fish.push(f);
    }
    for (let i = e.fish.length - 1; i >= 0; i--) if (e.fish[i].gone) e.fish.splice(i, 1);
    void pp;
  }
  _fish(e, f, dt) {
    const G = this.G, pl = G.player, pp = pl.body.pos;
    f.s += f.v * dt;
    const u = f.s / f.T;
    if (u >= 1) { this._killMesh(f); f.gone = true; f.state = 'dead'; return; }
    const x = f.ox + f.fx * f.s, z = f.oz + f.fz * f.s;
    const base = sea.level + 0.2, y = base + Math.sin(u * Math.PI) * (G.boat.set.y - sea.level + f.peak);
    f.mesh.position.set(x, y, z);
    f.mesh.rotation.set(-Math.cos(u * Math.PI) * 0.5, Math.atan2(f.fx, f.fz), 0);
    f.mesh.userData.wings.forEach((w, i) => { w.rotation.z = (i ? 1 : -1) * (0.12 + Math.sin(e.u * 40 + f.lane * 9) * 0.18); }); // planando, asas tremendo
    f.mesh.userData.tail.rotation.x = Math.sin(e.u * 30 + f.lane * 5) * 0.35 * (1 - Math.sin(u * Math.PI)); // bate a cauda ao sair e ao voltar para a água
    f.body.pos.set(x, y - 1, z);
    // pancada em quem estiver no caminho
    if (!f.hitP && !pl.dead && Math.hypot(pp.x - x, pp.z - z) < 0.6 && Math.abs(pp.y + 1.1 - y) < 0.7) {
      f.hitP = true; G.survival.damage(3, 'Peixe voador'); pl.body.vel.x += f.fx * 3; pl.body.vel.z += f.fz * 3;
      if (G.melee) G.melee.say(pp, 'PLAFT!', '#bfe6ff');
      this._landFish(x, z, f); f.gone = true; f.state = 'dead'; return;
    }
    // alguns caem no convés
    if (!f.checked && u > 0.4 && G.player.aboard !== undefined) {
      f.checked = true;
      const [lx, lz] = G.boat.toLocal(x, z);
      if (Math.hypot(lx, lz) < G.boat.set.radius - 0.5 && f.land) { this._landFish(x, z, f); f.gone = true; f.state = 'dead'; }
    }
  }
  _landFish(x, z, f) {
    const G = this.G, boat = G.boat;
    this._killMesh(f);
    if (this.fishOnDeck.length > 12) return;
    const [lx, lz] = boat.toLocal(x, z);
    if (Math.hypot(lx, lz) > boat.set.radius + 0.3) return; // caiu na água
    const mesh = makeFish(); G.scene.add(mesh);
    this.fishOnDeck.push({ id: f.id, mesh, lx, lz, t: Math.random() * 5, age: 0 });
  }
  _deckFish(dt, t) {
    const boat = this.G.boat;
    for (let i = this.fishOnDeck.length - 1; i >= 0; i--) {
      const f = this.fishOnDeck[i]; f.t += dt; f.age += dt;
      const [x, z] = boat.toWorld(f.lx, f.lz), flop = Math.max(0, Math.sin(f.t * 7)) * 0.18 * Math.max(0, 1 - f.age / 40);
      f.mesh.position.set(x, boat.set.y + 0.62 + flop, z);
      f.mesh.rotation.set(0, boat.yaw + f.t * 0.3, Math.PI / 2 + Math.sin(f.t * 9) * 0.4 * Math.max(0, 1 - f.age / 40));
      if (f.age > 90) { this.G.scene.remove(f.mesh); this.fishOnDeck.splice(i, 1); }
    }
  }
  nearestFish() {
    const pp = this.G.player.body.pos, boat = this.G.boat;
    let best = null, bd = 1.8;
    for (const f of this.fishOnDeck) { const [x, z] = boat.toWorld(f.lx, f.lz), d = Math.hypot(x - pp.x, z - pp.z); if (d < bd) { bd = d; best = f; } }
    return best;
  }
  takeFish(f) {
    const i = this.fishOnDeck.indexOf(f); if (i < 0) return;
    this.G.scene.remove(f.mesh); this.fishOnDeck.splice(i, 1);
    this.G.hud.msg(this.G.survival.add({ peixe: 1 }));
    if (this.G.net.online) this.G.net.send({ t: 'fishtake', id: f.id }); // some para os outros também
  }
  removeFish(id) {
    const i = this.fishOnDeck.findIndex((f) => f.id === id); if (i < 0) return;
    this.G.scene.remove(this.fishOnDeck[i].mesh); this.fishOnDeck.splice(i, 1);
  }

  // ======================= RAIOS =======================
  _lightningUpdate(e, dt, t) {
    const G = this.G, B = SEA_BALANCE.raios, boat = G.boat;
    e.next -= dt;
    if (e.u < e.dur - 6 && e.next <= 0) {
      e.next = B.every[0] + e.r() * (B.every[1] - B.every[0]);
      const roll = e.r();
      let target;
      if (boat.sailUp && roll < 0.5) target = { mast: true };
      else if (roll < 0.75) { const a = e.r() * 6.28, d = e.r() * (boat.set.radius + 1); target = { lx: Math.cos(a) * d, lz: Math.sin(a) * d }; }
      else { const a = e.r() * 6.28, d = 7 + e.r() * 24; target = { lx: Math.cos(a) * d, lz: Math.sin(a) * d }; }
      // às vezes mira em quem está nadando (cada cliente cuida do próprio jogador)
      const rr = e.r(); // sorteio sempre consumido (todos os jogadores seguem a mesma sequência)
      if (G.player.swimming && rr < 0.35) { const [lx, lz] = boat.toLocal(G.player.body.pos.x, G.player.body.pos.z); target = { lx, lz, mine: true }; }
      this._warn(target);
    }
    for (let i = this.warnings.length - 1; i >= 0; i--) {
      const w = this.warnings[i]; w.t -= dt;
      const [x, z] = w.mast ? boat.mastWorld() : boat.toWorld(w.lx, w.lz);
      const onRaft = w.mast || Math.hypot(w.lx, w.lz) < boat.set.radius + 0.4;
      const y = onRaft ? boat.set.y + 0.45 : waveHeight(x, z, t) + 0.05;
      w.mesh.position.set(x, w.mast ? boat.set.y + 6.2 : y, z);
      const u = 1 - w.t / SEA_BALANCE.raios.warn;
      w.mesh.scale.setScalar(w.mast ? 1 : 1.6 - u * 0.8);
      w.mesh.material.opacity = 0.35 + 0.5 * Math.abs(Math.sin(u * u * 30));
      if (w.t <= 0) { G.scene.remove(w.mesh); this.warnings.splice(i, 1); this._strike(x, y, z, w.mast, onRaft); }
    }
  }
  _warn(target) {
    const G = this.G;
    const mesh = new THREE.Mesh(new THREE.RingGeometry(1.4, 2.1, 36).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0xbfd8ff, transparent: true, opacity: 0.6, depthWrite: false, side: THREE.DoubleSide }));
    if (target.mast) { mesh.geometry = new THREE.SphereGeometry(0.45, 12, 8); mesh.material.color.setHex(0xe8f0ff); }
    G.scene.add(mesh);
    this.warnings.push({ ...target, mesh, t: SEA_BALANCE.raios.warn });
    sfx.click(null, 2.2);
  }
  _strike(x, y, z, mast, onRaft) {
    const G = this.G, B = SEA_BALANCE.raios, boat = G.boat, pl = G.player, pp = pl.body.pos;
    this._bolt(x, y, z);
    G.events.flash = 1; G.hud.flash('lightning'); sfx.thunder(0.02, 1);
    const dc = Math.hypot(G.camera.position.x - x, G.camera.position.z - z);
    G.events.shake = Math.max(G.events.shake, 0.8 * clamp(1 - dc / 40, 0.2, 1));
    const iframes = G.melee && G.melee.iframes > 0;
    if (mast) {
      if (!pl.dead && pl.aboard && Math.hypot(pp.x - x, pp.z - z) < 2.8 && !iframes) { G.survival.damage(B.mastDmg, 'Raio no mastro'); G.hud.msg('O raio desceu pelo mastro! Baixe a vela para não atrair mais.'); }
      if (this._host()) { const [mx, mz] = boat.toLocal(x, z); for (const p of [...boat.pieces.values()]) if (G.naval.destructible(p) && Math.hypot(p.x - mx, p.z - mz) < 2.4) G.naval.damagePiece(p.id, 18); }
    } else {
      const d = Math.hypot(pp.x - x, pp.z - z);
      if (!pl.dead && d < 2.4 && Math.abs(pp.y - y) < 3 && !iframes) {
        G.survival.damage(B.dmg, 'Raio');
        pl.body.vel.x += (pp.x - x) * 3; pl.body.vel.z += (pp.z - z) * 3; pl.body.vel.y = 5; pl.body.grounded = false;
      }
      if (onRaft && this._host()) { const [lx, lz] = boat.toLocal(x, z); for (const p of [...boat.pieces.values()]) if (G.naval.destructible(p) && Math.hypot(p.x - lx, p.z - lz) < 1.5) G.naval.damagePiece(p.id, 22); }
      if (!onRaft) { // na água: a eletricidade se espalha
        sfx.splash(new THREE.Vector3(x, y, z), true);
        if (pl.swimming && d < B.waterR && !iframes) { G.survival.damage(B.dmg * 0.8, 'Choque na água'); G.hud.msg('Choque! Saia da água durante os raios.'); }
        let fried = 0;
        for (const en of [...G.enemies.list]) {
          if (en.state === 'dead') continue;
          const inWater = en.creature ? en.def.nome === 'Tubarão' : en.pirate && en.state === 'approach';
          if (inWater && Math.hypot(en.body.pos.x - x, en.body.pos.z - z) < B.waterR) { G.enemies.damage(en, 999); fried++; }
        }
        if (fried && G.melee) G.melee.say(new THREE.Vector3(x, y + 1, z), 'ELETROCUTADO!', '#bfe6ff', true);
      }
    }
  }
  // Raio: tronco em zigue-zague com 3 camadas (núcleo branco, brilho azul, halo largo), 3–5 galhos,
  // clarão na nuvem lá em cima e no ponto de impacto, e 2–3 "re-descargas" (pisca como raio de verdade).
  _bolt(x, y, z) {
    const G = this.G, top = y + 75, meshes = [];
    const zig = (from, to, n, jit) => { // caminho em zigue-zague de from até to
      const pts = [from.clone()];
      for (let i = 1; i < n; i++) {
        const u = i / n, p = from.clone().lerp(to, u);
        p.x += (Math.random() - 0.5) * jit * (1 - u * 0.6); p.z += (Math.random() - 0.5) * jit * (1 - u * 0.6); p.y += (Math.random() - 0.5) * jit * 0.25;
        pts.push(p);
      }
      pts.push(to.clone());
      return new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.02);
    };
    const tube = (curve, r, color, op, add = true) => {
      const m = new THREE.Mesh(new THREE.TubeGeometry(curve, Math.max(20, curve.points.length * 6), r, 6),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: op, blending: add ? THREE.AdditiveBlending : THREE.NormalBlending, depthWrite: false, fog: false }));
      m.userData.base = op; m.userData.noShadow = true; m.frustumCulled = false; G.scene.add(m); meshes.push(m); return m;
    };
    const start = new THREE.Vector3(x + (Math.random() - 0.5) * 16, top, z + (Math.random() - 0.5) * 16), end = new THREE.Vector3(x, y, z);
    const main = zig(start, end, 26, 7);
    tube(main, 0.2, 0xffffff, 1, false);   // núcleo
    tube(main, 0.7, 0xa8ccff, 0.65);       // brilho
    tube(main, 2.2, 0x5f8dff, 0.22);       // halo
    for (let k = 0, n = 3 + ((Math.random() * 3) | 0); k < n; k++) { // galhos
      const u = 0.15 + Math.random() * 0.55, from = main.getPoint(u);
      const a = Math.random() * 6.28, len = 8 + Math.random() * 16;
      const to = from.clone().add(new THREE.Vector3(Math.cos(a) * len * 0.7, -len, Math.sin(a) * len * 0.7));
      const br = zig(from, to, 10, 4);
      tube(br, 0.09, 0xffffff, 0.9, false); tube(br, 0.4, 0xa8ccff, 0.45);
    }
    // clarão na nuvem e no impacto
    const glow = (pos, r, color, op) => { const m = new THREE.Mesh(new THREE.SphereGeometry(r, 16, 12), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: op, blending: THREE.AdditiveBlending, depthWrite: false, fog: false })); m.position.copy(pos); m.userData.base = op; m.userData.grow = true; m.userData.noShadow = true; G.scene.add(m); meshes.push(m); return m; };
    glow(start, 14, 0x9fbfff, 0.35);
    glow(end.clone().setY(y + 0.6), 2.2, 0xdfeaff, 0.85);
    if (G.vfx) { G.vfx.ring(end, { color: 0x9fd0ff, from: 0.5, to: 7, life: 0.5 }); G.vfx.sparks({ x, y: y + 0.4, z }, 26, 0xcfe4ff, 9, 0.5); }
    this.light.position.set(x, y + 6, z); this.light.intensity = 420;
    // 2–3 re-descargas: tempos dos clarões dentro da vida do raio
    const pulses = [0, 0.09 + Math.random() * 0.05, Math.random() < 0.6 ? 0.22 + Math.random() * 0.08 : -1];
    this.bolts.push({ meshes, t: 0.55, life: 0.55, pulses });
  }
  _updateBolts(dt) {
    for (let i = this.bolts.length - 1; i >= 0; i--) {
      const b = this.bolts[i]; b.t -= dt;
      const age = b.life - b.t;
      // brilho = soma de pulsos curtos (re-descargas) + resto decaindo
      let k = 0;
      for (const p0 of b.pulses) if (p0 >= 0 && age >= p0) k = Math.max(k, Math.exp(-(age - p0) * 22));
      k = Math.max(k, 0.25 * Math.max(0, b.t / b.life)) * (0.85 + 0.15 * Math.sin(age * 120));
      for (const m of b.meshes) {
        m.material.opacity = m.userData.base * k;
        if (m.userData.grow) m.scale.setScalar(1 + age * 3);
      }
      if (b.pulses.some((p0) => p0 > 0 && Math.abs(age - p0) < dt)) { this.light.intensity = 300; if (this.G.events) this.G.events.flash = 1; }
      if (b.t <= 0) { for (const m of b.meshes) { this.G.scene.remove(m); m.geometry.dispose(); m.material.dispose(); } this.bolts.splice(i, 1); }
    }
    this.light.intensity = Math.max(0, this.light.intensity - dt * 900);
  }
}
