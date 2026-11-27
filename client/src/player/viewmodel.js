// Viewmodel em 1ª pessoa: braços, mãos e arma do JOGADOR LOCAL.
//
// - Vive numa cena e câmera próprias, desenhadas por cima do mundo (depth limpo), então a
//   arma nunca atravessa paredes e o FOV de mira não deforma os braços.
// - Nada daqui é enviado pela rede nem entra em G.scene: os outros jogadores só enxergam o
//   modelo de 3ª pessoa. As animações de mão existem apenas para quem joga em 1ª pessoa.
// - Tudo é procedural (molas + keyframes), sem depender de clipes de animação.
import { PILL_COLORS, sanitizePill } from './pill.js';
import * as THREE from '../three.js';
import { cam as camSet } from '../core/camsettings.js';
import { clamp, lerp } from '../core/util.js';
import { CFG } from '../config.js';
import { SHELL } from '../systems/combat.js';
import {
  MAT, buildHand, buildArm, buildWeapon, buildBandage, buildMedkit, buildShell, buildCartridgeCase, setGloveColor,
} from './viewmodel-parts.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const smooth = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
const ramp = (p, a, b) => clamp((p - a) / (b - a), 0, 1);
const approach = (v, target, step) => (v < target ? Math.min(target, v + step) : Math.max(target, v - step));
const lerpArr = (a, b, t) => a.map((v, i) => lerp(v, b[i], t));
const eulerQ = (r, order = 'XYZ') => new THREE.Quaternion().setFromEuler(new THREE.Euler(r[0], r[1], r[2], order));
// Espelha uma rotação em X (usada para derivar a pose da mão esquerda a partir da direita).
const mirrorEuler = (r) => [r[0], -r[1], -r[2]];

class Spring {
  constructor(k = 150, c = 14) { this.k = k; this.c = c; this.x = 0; this.v = 0; }
  kick(v) { this.v += v; }
  step(dt) {
    const n = Math.ceil(dt / 0.008);
    const h = dt / n;
    for (let i = 0; i < n; i++) {
      this.v += (-this.k * this.x - this.c * this.v) * h;
      this.x += this.v * h;
    }
    return this.x;
  }
}

// Nado de peito (mão direita; a esquerda é espelhada): deslize com as mãos juntas à frente →
// abre para os lados com as palmas para fora → puxa para baixo/trás → recolhe sob o queixo →
// estica de novo. [tempo, [x, y, z, rx, ry, rz]] no espaço do viewmodel.
const SWIM_STROKE = [
  [0, [0.07, -0.13, -0.56, 0.05, 0, 0.15]],
  [0.18, [0.09, -0.13, -0.57, 0.05, 0, 0.3]],     // deslize (segura um pouco)
  [0.4, [0.34, -0.17, -0.47, 0.0, 0, 1.1]],       // abre, palma para fora
  [0.6, [0.25, -0.34, -0.27, -1.1, 0, 0.6]],      // puxa: palma para trás, dedos para baixo
  [0.78, [0.07, -0.25, -0.3, 0.25, 0, -1.25]],    // recolhe sob o queixo, palmas juntas
  [0.9, [0.06, -0.17, -0.47, 0.1, 0, -0.5]],      // estica para a frente
  [1, [0.07, -0.13, -0.56, 0.05, 0, 0.15]],
];
// dedos: esticados no deslize, um pouco fechados na puxada
const sampleCurl = (u) => (u > 0.4 && u < 0.78 ? 0.08 + 0.12 * Math.sin((u - 0.4) / 0.38 * Math.PI) : 0.05);

// Keyframes [tempo, [px, py, pz, rx, ry, rz]] relativos à pose de empunhadura.
const SWINGS = {
  parry: [ // recolhe um instante e chicoteia a arma para fora, desviando o golpe; segura e volta
    [0, [0, 0, 0, 0, 0, 0]],
    [0.12, [-0.07, 0.06, 0.04, 0.18, 0.45, 0.55]],
    [0.3, [0.24, 0.17, -0.12, 0.42, -1.0, -1.2]],
    [0.52, [0.27, 0.13, -0.1, 0.34, -1.08, -1.25]],
    [1, [0, 0, 0, 0, 0, 0]],
  ],
  slashA: [ // do alto-direita para baixo-esquerda
    [0, [0, 0, 0, 0, 0, 0]],
    [0.26, [0.1, 0.1, 0.06, 0.4, -0.3, -0.6]],
    [0.52, [-0.3, -0.13, -0.24, -0.6, 1.05, 0.65]],
    [0.74, [-0.34, -0.14, -0.17, -0.7, 1.2, 0.72]],
    [1, [0, 0, 0, 0, 0, 0]],
  ],
  slashB: [ // revés, da esquerda para a direita
    [0, [0, 0, 0, 0, 0, 0]],
    [0.26, [-0.26, 0.03, 0.08, 0.15, 1.0, 0.55]],
    [0.52, [0.18, -0.12, -0.24, -0.35, -0.85, -0.75]],
    [0.74, [0.2, -0.13, -0.18, -0.4, -0.95, -0.8]],
    [1, [0, 0, 0, 0, 0, 0]],
  ],
  slashShort: [
    [0, [0, 0, 0, 0, 0, 0]],
    [0.28, [-0.12, 0.02, 0.07, 0.1, 0.7, 0.4]],
    [0.55, [0.1, -0.06, -0.14, -0.2, -0.6, -0.55]],
    [1, [0, 0, 0, 0, 0, 0]],
  ],
  overhead: [ // golpe de cima para baixo
    [0, [0, 0, 0, 0, 0, 0]],
    [0.3, [0.03, 0.34, 0.16, 1.0, -0.1, -0.15]],
    [0.54, [-0.04, -0.26, -0.28, -0.75, 0.1, 0.1]],
    [0.76, [-0.04, -0.28, -0.22, -0.8, 0.1, 0.1]],
    [1, [0, 0, 0, 0, 0, 0]],
  ],
  heavy: [ // pesado carregado: começa da arma armada por cima do ombro e desce na diagonal
    [0, [0.1, 0.24, 0.2, 1.15, -0.3, -0.55]],
    [0.16, [0.12, 0.28, 0.24, 1.25, -0.36, -0.62]],
    [0.42, [-0.3, -0.22, -0.34, -0.85, 0.95, 0.72]],
    [0.7, [-0.34, -0.27, -0.27, -0.92, 1.05, 0.78]],
    [1, [0, 0, 0, 0, 0, 0]],
  ],
  stab: [ // estocada
    [0, [0, 0, 0, 0, 0, 0]],
    [0.3, [0.05, 0.02, 0.1, 0.12, -0.1, -0.1]],
    [0.5, [-0.08, 0.04, -0.34, 0.0, 0.18, 0.05]],
    [0.72, [-0.08, 0.04, -0.3, 0.0, 0.18, 0.05]],
    [1, [0, 0, 0, 0, 0, 0]],
  ],
};
function sampleKeys(keys, p) {
  p = clamp(p, 0, 1);
  for (let i = 1; i < keys.length; i++) {
    if (p <= keys[i][0]) {
      const [t0, a] = keys[i - 1], [t1, b] = keys[i];
      return lerpArr(a, b, smooth((p - t0) / (t1 - t0)));
    }
  }
  return keys[keys.length - 1][1];
}

// fase da recarga cartucho a cartucho: 'in' (levanta), 'shell' (i-ésimo cartucho), 'out' (fecha/bombeia)
function shellPhase(pl) {
  const t = pl.t;
  if (t < pl.intro) return { k: 'in', f: t / pl.intro, pump: pl.pump };
  const s = (t - pl.intro) / pl.per;
  if (s < pl.n) return { k: 'shell', i: Math.floor(s), f: s - Math.floor(s), last: Math.floor(s) === pl.n - 1, pump: pl.pump };
  return { k: 'out', f: Math.min(1, (t - pl.intro - pl.n * pl.per) / pl.outro), pump: pl.pump };
}
const BELT = V(-0.13, -0.52, -0.2);
// Escopeta: o cartucho fica deitado na palma, alinhado com os dedos (mão 3D: dedos -Z, palma -Y).
const SHELL_IN_HAND = V(0.004, -0.03, -0.118); // na ponta dos dedos: metade do cartucho fica à mostra
// Caminho do cartucho até o tubo, no espaço da ARMA (x direita, y topo, z para trás); a janela de
// carregar fica embaixo da culatra. A mão vai por baixo, de palma para cima, e empurra para a frente.
const SHELL_PATH = { below: [0, -0.115, -0.05], port: [0, -0.052, -0.095], inside: [0, -0.03, -0.15] };
const Q_PORT = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.22, 0, Math.PI)); // palma para cima, dedos para a frente            // "cinto": fora da tela, embaixo à esquerda
const SHOULDER = { R: V(0.2, -0.27, 0.2), L: V(-0.2, -0.27, 0.2) };
const POLE = { R: V(0.75, -0.8, 0.35), L: V(-0.75, -0.8, 0.35) };
const REST_R = { p: V(0.23, -0.35, -0.36), r: [0.55, -0.15, -0.35], c: [0.55, 0.55, 0.55, 0.55], t: [0.2, -0.2, 0.3] };

export class ViewModel {
  constructor(G, { sun, hemisphere }) {
    this.G = G;
    this.mainSun = sun;
    this.mainHemi = hemisphere;
    this.debug = {};

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(62, 1, 0.02, 10);
    this.hemi = new THREE.HemisphereLight(0xffffff, 0x3a6a8a, 1.1);
    this.sun = new THREE.DirectionalLight(0xfff1d0, 1.5);
    this.flashLight = new THREE.PointLight(0xffb866, 0, 2.2, 2);
    this.scene.add(this.hemi, this.sun, this.sun.target, this.flashLight);

    // raiz do que o jogador vê; some inteira quando não está em 1ª pessoa
    this.group = new THREE.Group();
    this.scene.add(this.group);
    this.weaponRoot = new THREE.Group();
    this.weaponRoot.rotation.order = 'YXZ';
    this.group.add(this.weaponRoot);

    this.hands = [buildHand(false), buildHand(true)]; // 0 = direita, 1 = esquerda
    if (G.player) this.setGloveColor(G.player.appearance.pill);
    this.arms = [buildArm(), buildArm()];
    for (let i = 0; i < 2; i++) this.group.add(this.hands[i].root, this.arms[i].root);

    // itens que aparecem na mão esquerda (carregador / cartucho / bandagem / kit / speedloader)
    this.heldMag = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.1, 0.05), MAT.iron);
    this.heldMag.position.set(0, -0.045, -0.04);
    this.heldShell = buildShell(0xb03a2e); this.heldShell.position.copy(SHELL_IN_HAND); // na palma, ponta para os dedos
    this.heldBandage = buildBandage(); this.heldBandage.position.set(0, 0.04, -0.05);
    this.heldKit = buildMedkit(); this.heldKit.position.set(0, 0.07, -0.06);
    this.heldLoader = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.035, 6), MAT.brass);
    this.heldLoader.position.set(0, -0.045, -0.04);
    this.heldItems = [this.heldMag, this.heldShell, this.heldBandage, this.heldKit, this.heldLoader];
    for (const item of this.heldItems) { item.visible = false; this.hands[1].root.add(item); }

    this.cases = []; // cartuchos ejetados
    this.shownId = undefined;
    this.spec = null;
    this.specs = new Map();

    // estado de animação
    this.lowerEquip = 1;
    this.bobPhase = 0; this.bobAmp = 0; this.sprint = 0; this.adsT = 0;
    this.sway = { x: 0, y: 0 };
    this.springs = {
      kickZ: new Spring(170, 15), kickY: new Spring(170, 15), kickRx: new Spring(150, 13),
      kickRy: new Spring(150, 13), kickRz: new Spring(150, 13), land: new Spring(120, 11),
      slide: new Spring(420, 28), shake: new Spring(110, 9), shakeR: new Spring(110, 9), hit: new Spring(140, 12),
    };
    this.flashT = 0;
    this.swingT = 0; this.swingDur = 0; this.swingStyle = 'slashA'; this.combo = 0;
    this.cycle = null;        // { t, dur, kind }
    this.w = { carry: 0, swim: 0, mantle: 0, heal: 0, reach: 0, reload: 0 };
    this.swimPhase = 0; this.mantleU = 0;
    this.heal = null;         // { item, t, dur }
    this.reachT = -1;
    this.prevGrounded = true; this.prevVy = 0;
    this.camOff = { y: 0, pitch: 0, roll: 0 };
    this.fov = 75; this.fovTarget = 75; this.scoped = false; this.active = false;
    this.time = 0;

    // moldura de luneta (só o rifle de precisão)
    this.scopeEl = document.createElement('div');
    this.scopeEl.id = 'scopeOverlay';
    this.scopeEl.hidden = true;
    document.body.appendChild(this.scopeEl);
    this.crosshair = document.getElementById('crosshair');
  }

  // ---------- ganchos chamados pelos outros sistemas ----------
  strikeFraction() { return 0.42; }

  onSwing(w, style = null, dur = null) {
    const styles = (this.spec && this.spec.swing) || ['slashA', 'slashB'];
    this.swingStyle = style || styles[this.combo++ % styles.length];
    if (this.swingStyle === 'heavy') this.chargeW = 0; // a pose armada passa a ser o 1º quadro do golpe
    this.swingDur = dur || clamp(w.rate * 0.88, 0.3, 0.55);
    this.swingT = 0;
    return this.swingDur;
  }
  // chute em 1ª pessoa: a bota sobe de baixo da tela, acerta e volta (as mãos abrem para o lado)
  onKick(dur = 0.42) {
    if (!this.boot) {
      const b = new THREE.Group(), leather = new THREE.MeshStandardMaterial({ color: 0x3a2416, roughness: 0.75 });
      const shin = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.065, 0.4, 14), leather); shin.position.y = 0.2;
      const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.088, 0.082, 0.07, 14), leather); cuff.position.y = 0.38;
      const foot = new THREE.Mesh(new THREE.CapsuleGeometry(0.068, 0.14, 4, 10), leather); foot.rotation.x = Math.PI / 2; foot.position.set(0, 0.0, -0.08);
      const sole = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.025, 0.28), new THREE.MeshStandardMaterial({ color: 0x1a120c, roughness: 0.9 })); sole.position.set(0, -0.06, -0.08);
      b.add(shin, cuff, foot, sole); b.visible = false;
      this.boot = b; this.group.add(b);
    }
    this.kickT = 0; this.kickDur = dur;
    this.springs.kickRx.kick(-1.2);
  }
  onClash() { this.springs.kickZ.kick(3.5); this.springs.kickRx.kick(4); this.springs.shakeR.kick((Math.random() - 0.5) * 3); }
  onMeleeHit() {
    this.springs.hit.kick(-1.1);
    this.springs.shake.kick(-0.5 + Math.random() * 0.1);
    this.springs.shakeR.kick((Math.random() - 0.5) * 0.9);
  }
  onFire(w) {
    const s = this.springs, rec = w.recoil || 0.01;
    const zk = 0.012 + rec * 0.9, rk = 0.03 + rec * 3.5;
    s.kickZ.kick(zk * 14);
    s.kickY.kick(-zk * 4 * 14 * (Math.random() * 0.5 + 0.5) * 0.25);
    s.kickRx.kick(rk * 14);
    s.kickRy.kick((Math.random() - 0.5) * rk * 5);
    s.kickRz.kick((Math.random() - 0.5) * rk * 7);
    s.slide.kick(2.4);
    s.shake.kick(rec * 6);
    this.flashT = 0.055;
    const spec = this.spec;
    if (spec && spec.flashMesh) {
      spec.flashMesh.scale.setScalar((spec.flash || 1) * (0.8 + Math.random() * 0.5));
      spec.flashMesh.rotation.z = Math.random() * Math.PI * 2;
    }
    if (!spec) return;
    if (spec.reload === 'shotgun') this.cycle = { t: -0.22, dur: 0.5, kind: 'pump', ejected: false };
    else if (spec.boltAction) this.cycle = { t: -0.3, dur: 0.55, kind: 'bolt', ejected: false };
    else if (spec.eject) this.spawnCase(spec);
    if (spec.type === 'pistol' || spec.type === 'long') this.reachT = -1;
  }
  // golpe bloqueado: a arma é empurrada contra você (tranco + tremor)
  onBlockHit(heavy) {
    const s = this.springs, k = heavy ? 1.8 : 1;
    s.kickZ.kick(6 * k); s.kickY.kick(-1.5 * k); s.kickRx.kick(-2.2 * k);
    s.kickRz.kick((Math.random() - 0.5) * 3 * k); s.shake.kick(1.6 * k);
  }
  onDry() { this.springs.kickZ.kick(0.5); this.springs.kickRx.kick(1.2); }
  onUse(item) {
    this.heal = { item, t: 0, dur: item === 'kit' ? 1.5 : 1.15 };
  }
  onInteract() { this.reachT = 0; }
  onHurt(n) {
    const k = clamp(n / 20, 0.3, 2);
    this.springs.shake.kick(-1.4 * k);
    this.springs.shakeR.kick((Math.random() - 0.5) * 2 * k);
    this.springs.kickZ.kick(0.5 * k);
    this.springs.kickRx.kick(1.4 * k);
  }

  // Ponto da boca do cano no MUNDO, projetado de forma que o rastro de tiro nasça onde a
  // boca da arma aparece na tela (o FOV do viewmodel é diferente do FOV do mundo).
  muzzleWorld(out) {
    const spec = this.spec, cam = this.G.camera;
    if (!spec || !spec.muzzle) return out.copy(cam.position);
    this.weaponRoot.updateMatrixWorld(true);
    const m = spec.muzzle.clone().applyMatrix4(this.weaponRoot.matrixWorld);
    m.project(this.camera);
    cam.updateMatrixWorld(true);
    const a = new THREE.Vector3(m.x, m.y, 0).unproject(cam);
    const dir = a.sub(cam.position).normalize();
    return out.copy(cam.position).addScaledVector(dir, 0.9);
  }

  // ---------- utilidades internas ----------
  specFor(id) {
    if (!id) return null;
    if (!this.specs.has(id)) this.specs.set(id, buildWeapon(id));
    return this.specs.get(id);
  }
  showWeapon(id) {
    if (this.spec) this.weaponRoot.remove(this.spec.group);
    this.shownId = id;
    this.spec = this.specFor(id);
    if (this.spec) {
      this.weaponRoot.add(this.spec.group);
      const p = this.spec.parts || {};
      if (p.mag) { p.mag.visible = !this.spec.magHidden; p.mag.position.set(0, 0, 0); p.mag.rotation.set(0, 0, 0); }
      if (p.pump) p.pump.position.z = 0;
      if (p.slide) p.slide.position.z = 0;
    }
    this.cycle = null; this.swingDur = 0;
    for (const s of Object.values(this.springs)) { s.x = 0; s.v = 0; }
    this.springs.kickRx.kick(-1.2); // pequeno "tranco" ao sacar
  }
  spawnCase(spec, shell = false) {
    const mesh = shell ? buildShell(0xb03a2e) : buildCartridgeCase();
    this.weaponRoot.updateMatrixWorld(true);
    const pos = spec.eject.clone().applyMatrix4(this.weaponRoot.matrixWorld);
    mesh.position.copy(pos);
    this.group.add(mesh);
    this.cases.push({
      mesh, life: 0.9,
      vel: V(0.9 + Math.random() * 0.5, 0.7 + Math.random() * 0.4, 0.5 + Math.random() * 0.4),
      spin: V(Math.random() * 14, Math.random() * 14, Math.random() * 14),
    });
  }

  // Pose de uma mão presa à arma: posição no espaço do viewmodel + rotação + dedos.
  // grip.p é um ponto NO EIXO do cabo; a origem da mão (punho) fica deslocada pela geometria
  // dos dedos: palma ~3 cm acima do eixo e punho ~7 cm atrás do ponto de curvatura.
  gripHand(grip, extra, hand = 0) {
    const q = grip.q ? grip.q.clone() : eulerQ(grip.r, grip.order || 'XYZ');
    const wq = this.weaponRoot.quaternion;
    // cada modelo de mão tem o seu ponto de pegada (a mão 3D mede o buraco do punho fechado)
    const h = this.hands[hand], ho = h && h.gripOff ? (hand === 1 ? [-h.gripOff[0], h.gripOff[1], h.gripOff[2]] : h.gripOff) : null;
    const p = V(...(grip.off || ho || [0, 0.03, 0.07])).applyQuaternion(q).add(V(...grip.p));
    if (grip.nudge) p.add(V(...grip.nudge)); // ajuste fino do cabo dentro da mão (espaço da arma)
    if (extra) p.add(extra);
    p.applyMatrix4(this.weaponRoot.matrixWorld);
    return { p, q: wq.clone().multiply(q) };
  }
  weaponPoint(arr, extra) {
    const p = V(...arr);
    if (extra) p.add(extra);
    return p.applyMatrix4(this.weaponRoot.matrixWorld);
  }

  // ---------- atualização por quadro ----------
  update(dt, t) {
    const G = this.G, pl = G.player, cb = G.combat, inp = G.input, b = pl.body;
    this.active = !!(pl.firstPerson && G.started);
    this.group.visible = this.active && !pl.dead && !pl.downed;
    if (!this.active) { this.scopeEl.hidden = true; this.fovTarget = 68; return; }
    this.time += dt;
    const S = this.springs;

    // luz e câmera do viewmodel acompanham o mundo (tempestade, pôr do sol…)
    this.hemi.color.copy(this.mainHemi.color); this.hemi.groundColor.copy(this.mainHemi.groundColor);
    this.hemi.intensity = this.mainHemi.intensity;
    this.sun.color.copy(this.mainSun.color); this.sun.intensity = this.mainSun.intensity * 0.9;
    const dirW = this.mainSun.position.clone().sub(this.mainSun.target.position).normalize();
    G.camera.updateMatrixWorld(true);
    this.sun.position.copy(dirW.applyQuaternion(G.camera.quaternion.clone().invert())).multiplyScalar(5);
    this.camera.aspect = G.camera.aspect;
    this.camera.updateProjectionMatrix();

    // ---- estado do jogador ----
    const speed = Math.hypot(b.vel.x, b.vel.z);
    this.speedNow = speed;
    const grounded = b.grounded && !pl.swimming;
    const w = cb.weapon;
    const shownIsCurrent = this.shownId === cb.weaponId;
    const spec = this.spec;
    const aimingNow = !!cb.aiming && !!spec && spec.type !== 'melee' && shownIsCurrent;
    const sprintTarget = (inp.down('ShiftLeft') && speed > CFG.walk + 0.6 && grounded && !aimingNow && !pl.mantle) ? 1 : 0;

    // ---- sacar / guardar ----
    if (this.shownId !== cb.weaponId) {
      if (this.lowerEquip > 0.96) { this.showWeapon(cb.weaponId); }
    }
    const lowerTarget = this.shownId !== cb.weaponId ? 1 : 0;
    this.lowerEquip = approach(this.lowerEquip, lowerTarget, dt * (lowerTarget ? 8.5 : 5));

    // ---- pesos dos "overrides" de mão ----
    const wt = this.w, wrate = dt * 7;
    wt.carry = approach(wt.carry, (this.debug.carry != null ? this.debug.carry : G.build.active) ? 1 : 0, wrate);
    wt.swim = approach(wt.swim, (this.debug.swim != null ? this.debug.swim : pl.swimming && !pl.mantle) ? 1 : 0, wrate);
    wt.mantle = approach(wt.mantle, (this.debug.mantleU != null || pl.mantle) ? 1 : 0, dt * 10);
    if (pl.mantle) this.mantleU = clamp(pl.mantle.t, 0, 1);
    if (this.debug.mantleU != null) this.mantleU = this.debug.mantleU;
    if (this.heal) {
      this.heal.t += dt;
      if (this.heal.t >= this.heal.dur) this.heal = null;
    }
    wt.heal = approach(wt.heal, this.heal ? 1 : 0, dt * (this.heal ? 6 : 5));
    if (this.reachT >= 0) { this.reachT += dt / 0.5; if (this.reachT >= 1) this.reachT = -1; }
    wt.reach = this.reachT >= 0 ? Math.sin(Math.PI * this.reachT) : approach(wt.reach, 0, dt * 6);

    // ---- recarga ----
    let reloadP = -1;
    if (this.debug.reloadP != null) reloadP = this.debug.reloadP;
    else if (w && w.reload && cb.reloading > 0 && shownIsCurrent) reloadP = cb.reloadFrac();
    // escopeta: fase da recarga cartucho a cartucho (para o debug, um plano de 3 cartuchos com bomba)
    let plan = cb.reloading > 0 && shownIsCurrent ? cb.reloadPlan : null;
    if (this.debug.reloadP != null && spec && spec.reload === 'shotgun') { plan = { n: 3, intro: SHELL.intro, per: SHELL.per, outro: SHELL.pump, pump: true }; plan.total = plan.intro + 3 * plan.per + plan.outro; plan.t = this.debug.reloadP * plan.total; }
    this.shot = plan ? shellPhase(plan) : null;
    wt.reload = approach(wt.reload, reloadP >= 0 ? 1 : 0, dt * 8);

    // ---- mira ----
    let adsTarget = aimingNow ? 1 : 0;
    if (this.debug.ads != null) adsTarget = this.debug.ads;
    this.adsT = approach(this.adsT, adsTarget, dt * 9);
    const adsEff = this.adsT * (1 - wt.reload) * (1 - Math.max(wt.swim, wt.mantle, wt.heal, wt.carry));
    this.sprint = approach(this.sprint, this.debug.sprint != null ? this.debug.sprint : sprintTarget * (1 - wt.reload), dt * 6);

    // ---- bob de caminhada / respiração / balanço do mouse ----
    const bobTarget = grounded && !pl.mantle ? clamp(speed / CFG.run, 0, 1) : 0;
    this.bobAmp += (bobTarget - this.bobAmp) * Math.min(1, 9 * dt);
    this.bobPhase += speed * dt * (this.sprint > 0.5 ? 1.55 : 1.9) * (grounded ? 1 : 0.2);
    const bp = this.bobPhase;
    const swayTx = clamp(-inp.mouse.dx * 0.0011, -0.045, 0.045);
    const swayTy = clamp(inp.mouse.dy * 0.0011, -0.03, 0.03);
    const sk = 1 - Math.exp(-12 * dt);
    this.sway.x += (swayTx - this.sway.x) * sk;
    this.sway.y += (swayTy - this.sway.y) * sk;

    // ---- pulo / aterrissagem ----
    if (!this.prevGrounded && b.grounded && this.prevVy < -3) S.land.kick(clamp(this.prevVy * 0.07, -1.6, 0));
    if (this.prevGrounded && !b.grounded && b.vel.y > 2) S.land.kick(0.35);
    this.prevGrounded = b.grounded; this.prevVy = b.vel.y;

    // ---- molas ----
    const kickZ = S.kickZ.step(dt), kickY = S.kickY.step(dt), kRx = S.kickRx.step(dt);
    const kRy = S.kickRy.step(dt), kRz = S.kickRz.step(dt), land = S.land.step(dt);
    const slide = S.slide.step(dt), shake = S.shake.step(dt), shakeR = S.shakeR.step(dt), hit = S.hit.step(dt);

    // ================= pose da arma =================
    let P, R;
    const hold = spec ? spec.hold : { p: [0.22, -0.3, -0.4], r: [0.2, 0, 0] };
    if (spec && spec.type !== 'melee') {
      P = lerpArr(hold.p, [0, -spec.sightY, -spec.adsDist], adsEff);
      R = lerpArr(hold.r, [0, 0, 0], adsEff);
    } else { P = hold.p.slice(); R = hold.r.slice(); }
    const calm = 1 - adsEff * 0.85;
    const walk = this.bobAmp * calm * (1 - wt.swim);
    P[0] += Math.sin(bp) * 0.011 * walk + this.sway.x * (1 - adsEff * 0.7);
    P[1] += -Math.abs(Math.cos(bp)) * 0.014 * walk + Math.sin(this.time * 1.7) * 0.0022 * calm + this.sway.y * (1 - adsEff * 0.7);
    R[2] += Math.sin(bp) * 0.025 * walk;
    R[1] += this.sway.x * 1.5 * (1 - adsEff * 0.7);
    R[0] += Math.sin(this.time * 1.7) * 0.003 * calm - this.sway.y * 0.8 * (1 - adsEff * 0.7);

    // sprint: arma abaixada e inclinada
    const sp = this.sprint;
    const melee = !spec || spec.type === 'melee';
    P[0] += -0.05 * sp; P[1] += -0.1 * sp; P[2] += 0.03 * sp;
    R[0] += (melee ? -0.35 : -0.75) * sp; R[1] += (melee ? 0.3 : 0.7) * sp; R[2] += -0.12 * sp;
    P[1] += Math.sin(bp * 2) * 0.01 * sp * this.bobAmp;

    // molas: recuo / tranco / aterrissagem
    P[2] += kickZ + hit * 0.05; P[1] += kickY + land * 0.05 - hit * 0.02;
    R[0] += kRx + hit * 0.25; R[1] += kRy; R[2] += kRz;

    // sacar/guardar e overrides que abaixam a arma
    const lower = Math.max(this.lowerEquip, wt.swim, wt.mantle * 0.9, wt.heal, wt.carry, wt.reach * 0.35);
    P[1] -= lower * 0.34; P[2] += lower * 0.06; R[0] -= lower * 0.9; R[1] += lower * 0.25;

    // ---- recarga: deslocamentos da arma + posição da mão esquerda ----
    let reload = null;
    if (spec && reloadP >= 0) reload = this.reloadPose(spec, reloadP);
    if (reload) { for (let i = 0; i < 6; i++) { const k = reload.off[i] * wt.reload; if (i < 3) P[i] += k; else R[i - 3] += k; } }

    // ---- golpe corpo a corpo ----
    let swingP = -1;
    if (this.debug.swingP != null) { swingP = this.debug.swingP; this.swingStyle = this.debug.swingStyle || this.swingStyle; }
    else if (this.swingDur > 0) {
      this.swingT += dt;
      swingP = this.swingT / this.swingDur;
      if (swingP >= 1) { this.swingDur = 0; swingP = -1; }
    }
    let swingOff = null;
    if (swingP >= 0 && spec && spec.type === 'melee') {
      swingOff = sampleKeys(SWINGS[this.swingStyle] || SWINGS.slashA, swingP);
      for (let i = 0; i < 6; i++) { if (i < 3) P[i] += swingOff[i]; else R[i - 3] += swingOff[i]; }
    }

    // chute: bota de baixo para a frente; a arma abre para o lado durante o chute
    if (this.kickDur > 0 && this.boot) {
      this.kickT += dt;
      const u = this.kickT / this.kickDur, out = u < 0.4 ? smooth(u / 0.4) : 1 - smooth((u - 0.55) / 0.45);
      const k = clamp(out, 0, 1);
      this.boot.visible = u < 1;
      this.boot.position.set(0.06, -0.95 + 0.5 * k, -0.15 - 0.45 * k);
      this.boot.rotation.set(-1.25 * k - 0.2, 0, 0.1);
      P[0] += 0.08 * k; P[1] -= 0.06 * k; R[2] -= 0.3 * k;
      if (u >= 1) { this.kickDur = 0; this.boot.visible = false; }
    }
    // corpo a corpo: guarda (arma atravessada na frente) e carga do golpe pesado (puxa para trás)
    const mel = this.G.melee;
    this.blockW = approach(this.blockW || 0, mel && mel.blocking ? 1 : 0, dt * 12);
    this.chargeW = approach(this.chargeW || 0, mel && mel.charging ? Math.min(1, mel.holdT / 0.7) : 0, dt * 8);
    if (spec && spec.type === 'melee') {
      const bw = this.blockW, cw = this.chargeW;
      // guarda: arma atravessada na frente do rosto, segura com firmeza (respira de leve)
      const br = Math.sin(performance.now() * 0.004) * 0.006 * bw;
      P[0] += -0.17 * bw; P[1] += 0.14 * bw + br; P[2] += 0.08 * bw; R[0] += 0.3 * bw; R[1] += 0.9 * bw; R[2] += 1.35 * bw;
      // carga: arma sobe por cima do ombro e vai para trás (= 1º quadro do golpe pesado)
      const ck = SWINGS.heavy[0][1], e = cw * cw * (3 - 2 * cw);
      for (let i = 0; i < 6; i++) { if (i < 3) P[i] += ck[i] * e; else R[i - 3] += ck[i] * e; }
      const full = mel.charging && mel.holdT >= 0.7, amp = (0.0015 + (full ? 0.005 : 0)) * e; // tremor de força
      P[0] += (Math.random() - 0.5) * amp; P[1] += (Math.random() - 0.5) * amp; R[2] += (Math.random() - 0.5) * amp * 4;
    }
    this.weaponRoot.position.set(P[0], P[1], P[2]);
    this.weaponRoot.rotation.set(R[0], R[1], R[2]);

    // peças móveis (ferrolho, bomba, tambor, carregador)
    const parts = spec ? spec.parts || {} : {};
    if (parts.slide) parts.slide.position.z = clamp(slide, 0, 1) * 0.035;
    if (parts.spin) { // minigun: canos giram com o gatilho
      const sp = (this.G.combat.spin || 0) * 32;
      this.spinV = (this.spinV || 0) + (sp - (this.spinV || 0)) * Math.min(1, dt * 4);
      parts.spin.rotation.z += this.spinV * dt;
    }
    this.updateCycle(dt, spec, parts);
    if (reload) this.applyReloadParts(spec, parts, reloadP, wt.reload);
    this.weaponRoot.updateMatrixWorld(true);

    // brilho do disparo
    this.flashT = Math.max(0, this.flashT - dt);
    if (spec && spec.flashMesh) spec.flashMesh.visible = this.flashT > 0;
    if (spec && spec.muzzle && this.flashT > 0) {
      this.flashLight.position.copy(spec.muzzle).applyMatrix4(this.weaponRoot.matrixWorld);
      this.flashLight.intensity = 3.2 * (this.flashT / 0.055);
    } else this.flashLight.intensity = 0;

    // ================= mãos =================
    const hands = [
      { p: null, q: null, c: [0.5, 0.5, 0.5, 0.5], t: [0.4, -0.2, 0.3] },
      { p: null, q: null, c: [0.4, 0.4, 0.4, 0.4], t: [0.4, -0.2, 0.3] },
    ];
    const restBob = Math.sin(bp) * 0.01 * walk;
    // mão direita
    if (spec && spec.gripR) {
      const g = this.gripHand(spec.gripR);
      hands[0].p = g.p; hands[0].q = g.q;
      const gr = spec.gripR;
      const trigger = this.flashT > 0 ? 0.65 : (gr.idx != null ? gr.idx : gr.c);
      hands[0].c = [trigger, gr.c, gr.c, gr.c];
      if (gr.th) hands[0].t = gr.th.slice();
      if (gr.jm && this.hands[0].real) hands[0].jm = gr.jm; // dobra por junta (só a mão 3D)
    } else {
      const r = REST_R;
      hands[0].p = r.p.clone().add(V(restBob, -Math.abs(Math.cos(bp)) * 0.012 * walk, 0));
      hands[0].q = eulerQ(r.r); hands[0].c = r.c.slice(); hands[0].t = r.t.slice();
    }
    // mão esquerda
    if (spec && spec.gripL) {
      let extra = null;
      if (parts.pump) extra = V(0, 0, parts.pump.position.z);
      const g = this.gripHand(spec.gripL, extra, 1);
      hands[1].p = g.p; hands[1].q = g.q;
      const gl = spec.gripL;
      hands[1].c = [gl.c, gl.c, gl.c, gl.c];
      if (gl.th) hands[1].t = gl.th.slice();
      if (reload) {
        const rp = this.reloadHand(spec, reloadP);
        if (rp) {
          const k = wt.reload;
          hands[1].p = hands[1].p.lerp(rp.p, k);
          hands[1].q = hands[1].q.slerp(rp.q, k);
          hands[1].c = lerpArr(hands[1].c, rp.c, k);
        }
      }
    } else {
      // mão livre: relaxada, balançando com o corpo e acompanhando o golpe
      const sw = swingOff ? swingOff : [0, 0, 0, 0, 0, 0];
      const lp = V(-0.23 + this.sway.x * 0.6 - restBob - sw[0] * 0.55, -0.36 - Math.abs(Math.cos(bp + 1)) * 0.012 * walk + this.sway.y * 0.5 - sw[1] * 0.35, -0.36 - sw[2] * 0.3 + kickZ * 0.5);
      lp.y -= lower * 0.18; lp.y += sp * -0.05;
      hands[1].p = lp;
      hands[1].q = eulerQ(mirrorEuler(REST_R.r)).multiply(eulerQ([0, sw[4] * 0.3, sw[5] * -0.4]));
      hands[1].c = [0.5, 0.5, 0.5, 0.5];
    }
    // mão livre no corpo a corpo durante a recarga não existe; guardado por reload só p/ armas de fogo.

    // ---- overrides ----
    this.applyOverrides(hands, dt, t, spec);

    // aplicar mãos e braços
    for (let i = 0; i < 2; i++) {
      const h = hands[i], hand = this.hands[i];
      hand.root.position.copy(h.p);
      hand.root.quaternion.copy(h.q);
      const busy = Math.max(this.w.carry, this.w.swim, this.w.mantle, this.w.heal) > 0.5;
      hand.setPose(h.c, h.t, busy ? null : h.jm);
      this.arms[i].solve(i === 0 ? SHOULDER.R : SHOULDER.L, h.p, i === 0 ? POLE.R : POLE.L);
    }

    // ---- visibilidade da arma ----
    const hideWeapon = lower > 0.97 || wt.carry > 0.5 || wt.swim > 0.5 || wt.heal > 0.5;
    this.weaponRoot.visible = !!spec && !hideWeapon;

    // ---- itens na mão esquerda ----
    this.updateHeldItems(spec, reloadP, wt);

    // ---- cartuchos ejetados ----
    for (let i = this.cases.length - 1; i >= 0; i--) {
      const c = this.cases[i];
      c.life -= dt;
      c.vel.y -= 4.5 * dt;
      c.mesh.position.addScaledVector(c.vel, dt);
      c.mesh.rotation.x += c.spin.x * dt; c.mesh.rotation.y += c.spin.y * dt; c.mesh.rotation.z += c.spin.z * dt;
      if (c.life <= 0) { this.group.remove(c.mesh); this.cases.splice(i, 1); }
    }

    // ---- câmera: bob, tranco, FOV ----
    const gs = this.G.gfx ? this.G.gfx.settings : null, bobK = gs && !gs.bob ? 0 : 1, shk = gs ? gs.shake : 1;
    this.camOff.y = (-Math.abs(Math.cos(bp)) * 0.025 * this.bobAmp * (1 - adsEff * 0.8) + land * 0.06) * bobK;
    this.camOff.roll = Math.sin(bp) * 0.006 * this.bobAmp * (1 - adsEff * 0.8) * bobK + shakeR * 0.03 * shk;
    this.camOff.pitch = shake * 0.02 * shk + land * 0.02 * bobK;
    if (this.swimCam) { this.camOff.y += this.swimCam.y; this.camOff.pitch += this.swimCam.pitch; this.camOff.roll += this.swimCam.roll; }
    const baseFov = camSet.fov1p + 5 * this.sprint;
    this.fovTarget = spec && spec.type !== 'melee' ? lerp(baseFov, spec.adsFov, adsEff) : baseFov;

    // luneta e mira
    const scoped = !!(spec && spec.scope && adsEff > 0.88);
    this.scoped = scoped;
    this.scopeEl.hidden = !scoped;
    if (scoped) this.weaponRoot.visible = false;
    if (scoped) for (const h of this.hands) h.root.visible = false;
    else for (const h of this.hands) h.root.visible = true;
    if (scoped) for (const a of this.arms) a.root.visible = false;
    else for (const a of this.arms) a.root.visible = true;
    // !!: com toggle(classe, undefined) o navegador INVERTE a classe a cada quadro (a retícula piscava)
    if (this.crosshair) this.crosshair.classList.toggle('ads', !!(adsEff > 0.6 || scoped));
  }

  updateCycle(dt, spec, parts) {
    const c = this.cycle;
    if (!c || !spec) { if (parts.pump) parts.pump.position.z = 0; return; }
    c.t += dt;
    if (c.t < 0) return;
    const u = clamp(c.t / c.dur, 0, 1);
    if (c.kind === 'pump' && parts.pump) {
      // para trás (0–0.45), expulsa o cartucho, e volta (0.5–1)
      const back = smooth(ramp(u, 0, 0.42)) - smooth(ramp(u, 0.55, 1));
      parts.pump.position.z = back * 0.1;
      if (u > 0.4 && !c.ejected) { c.ejected = true; this.spawnCase(spec, true); }
    } else if (c.kind === 'bolt' && parts.bolt) {
      const up = smooth(ramp(u, 0, 0.2)) - smooth(ramp(u, 0.8, 1));
      const back = smooth(ramp(u, 0.2, 0.5)) - smooth(ramp(u, 0.55, 0.8));
      parts.bolt.rotation.z = -up * 1.2;
      parts.bolt.position.z = back * 0.07;
      parts.bolt.position.y = up * 0.012;
      if (u > 0.5 && !c.ejected) { c.ejected = true; this.spawnCase(spec); }
    }
    if (u >= 1) {
      this.cycle = null;
      if (parts.pump) parts.pump.position.z = 0;
      if (parts.bolt) { parts.bolt.rotation.z = 0; parts.bolt.position.set(0, 0, 0); }
    }
  }

  // ---------- recarga ----------
  // Linha do tempo da recarga com carregador (fração 0..1). A pistola termina ENGATILHANDO: a mão
  // esquerda passa por cima do ferrolho, puxa para trás e solta (ele bate para a frente).
  magTimeline(spec) {
    if (spec.slideGrab) return { grab: [0.1, 0.22], drop: [0.22, 0.36], belt: [0.26, 0.4], below: [0.4, 0.5], ins: [0.5, 0.62], reach: [0.64, 0.72], pull: [0.72, 0.8], release: [0.8, 0.83], back: [0.84, 0.96], held: [0.38, 0.6] };
    return { grab: [0.14, 0.3], drop: [0.3, 0.46], belt: [0.34, 0.5], below: [0.5, 0.62], ins: [0.62, 0.76], back: [0.8, 0.92], held: [0.5, 0.77] };
  }
  // Deslocamento da arma durante a recarga (relativo à empunhadura).
  reloadPose(spec, p) {
    const roll = smooth(ramp(p, 0, 0.16)) - smooth(ramp(p, 0.86, 1));
    const off = [0, 0, 0, 0, 0, 0];
    if (spec.reload === 'mag') {
      off[0] = -0.07 * roll; off[1] = 0.03 * roll; off[2] = 0.03 * roll;
      off[3] = 0.28 * roll; off[4] = 0.25 * roll; off[5] = -0.55 * roll;
      // empurrão ao encaixar
      const T = this.magTimeline(spec);
      const ins = Math.sin(Math.PI * ramp(p, T.ins[0] + 0.04, T.ins[1]));
      off[1] += -0.012 * ins; off[3] += -0.05 * ins;
      if (T.pull) { // engatilhar: a arma vem um pouco para perto e o ferrolho batendo dá um tranco para cima
        const rk = smooth(ramp(p, T.reach[0], T.reach[1])) - smooth(ramp(p, T.back[0], T.back[1]));
        // a pistola vira com o topo para a ESQUERDA (na direção da mão que engatilha) e vem para o meio;
        // antes ficava inclinada para a direita e o braço esquerdo tinha que cruzar por cima dela
        off[0] -= 0.05 * rk; off[1] -= 0.02 * rk; off[2] += 0.03 * rk; off[3] -= 0.2 * rk; off[4] -= 0.2 * rk; off[5] += 0.8 * rk;
        const slam = Math.sin(Math.PI * ramp(p, T.release[0], T.release[1] + 0.05));
        off[3] -= 0.07 * slam; off[1] += 0.006 * slam;
      }
    } else if (spec.reload === 'revolver') {
      off[0] = -0.07 * roll; off[1] = 0.03 * roll; off[2] = 0.03 * roll;
      off[3] = 0.28 * roll; off[4] = 0.25 * roll; off[5] = -0.75 * roll;
      const dump = smooth(ramp(p, 0.26, 0.4)) - smooth(ramp(p, 0.5, 0.58));
      off[3] += 0.55 * dump; off[5] += Math.sin(p * 60) * 0.06 * dump;
    } else if (spec.reload === 'shotgun') {
      // deita a escopeta de lado (barriga para a esquerda): a janela de carregar fica de frente
      // para a câmera e para a mão esquerda; volta a ficar de pé antes de bombear
      const st = this.shot;
      const lay = st ? (st.k === 'in' ? smooth(st.f) : st.k === 'shell' ? 1 : 1 - smooth(ramp(st.f, 0, 0.45))) : roll;
      off[0] = -0.02 * lay; off[1] = -0.01 * lay; off[2] = -0.07 * lay;
      off[3] = 0.0 * lay; off[4] = 0.62 * lay; off[5] = 0.55 * lay;
      if (st && st.k === 'shell') { // empurrão do cartucho entrando (a arma cede um pouco)
        const push = Math.sin(Math.PI * ramp(st.f, 0.5, 0.68));
        off[2] -= 0.008 * push; off[3] -= 0.025 * push;
      }
    }
    return { off };
  }
  // Onde a mão esquerda deve estar durante a recarga (espaço do viewmodel).
  reloadHand(spec, p) {
    const qOpen = eulerQ([0.2, 0.0, 1.0]);
    const open = [0.35, 0.35, 0.35, 0.35];
    const grab = [0.75, 0.75, 0.75, 0.75];
    const rest = (extra) => this.weaponPoint(spec.magPoint, extra);
    const belt = BELT.clone();
    const mk = (pos, q = qOpen, c = open) => ({ p: pos, q, c });
    const mixH = (a, b, u) => ({ p: a.p.clone().lerp(b.p, u), q: a.q.clone().slerp(b.q, u), c: lerpArr(a.c, b.c, u) });
    const grip = this.gripHand(spec.gripL, null, 1);
    const gripPose = { p: grip.p, q: grip.q, c: [spec.gripL.c, spec.gripL.c, spec.gripL.c, spec.gripL.c] };

    if (spec.reload === 'mag') {
      const T = this.magTimeline(spec);
      const well = mk(rest(V(0, -0.04, 0.03)), qOpen, grab);
      const below = mk(rest(V(0, -0.16, 0.03)), qOpen, grab);
      const up = mk(rest(V(0, -0.015, 0.03)), qOpen, grab);
      const beltPose = mk(belt, qOpen, open);
      const seg = (a, b, r) => mixH(a, b, smooth(ramp(p, r[0], r[1])));
      if (p < T.grab[0]) return gripPose;
      if (p < T.grab[1]) return seg(gripPose, well, T.grab);
      if (p < T.belt[0]) return well;
      if (p < T.belt[1]) return seg(well, beltPose, T.belt);
      if (p < T.below[1]) return seg(beltPose, below, T.below);
      if (p < T.ins[1]) return seg(below, up, T.ins);
      if (T.pull) { // ENGATILHAR: por cima do ferrolho → puxa para trás → solta → volta para a empunhadura
        // mão por cima do ferrolho: a pegada de apoio de arma longa (buraco do punho ao longo do cano),
        // virada de cabeça para baixo — palma em cima do ferrolho, dedos fechando dos lados
        // Eixos da mão 3D: pulso na origem, dedos para -Z, palma para -Y. Girada -80° no eixo vertical da
        // arma: palma em cima do ferrolho, dedos para a DIREITA e o pulso à esquerda — o antebraço vai
        // direto para o ombro esquerdo (antes a mão chegava pela direita e o braço cruzava a arma).
        const sg = spec.slideGrab, qOver = eulerQ([0, -1.4, 0.25]);
        const at = (d, c) => { const h = this.gripHand({ p: sg, q: qOver }, d, 1); return { p: h.p, q: h.q, c }; };
        const shut = [0.82, 0.88, 0.88, 0.85];
        const over = at(V(0, 0.05, 0.01), open);
        const grabS = at(V(0, 0, 0), shut);
        const pulled = at(V(0, 0, 0.045), shut);
        const letGo = at(V(-0.01, 0.05, 0.06), open);
        if (p < T.reach[0]) return up;
        if (p < T.reach[1]) { const u = smooth(ramp(p, T.reach[0], T.reach[1])); return u < 0.6 ? mixH(up, over, u / 0.6) : mixH(over, grabS, (u - 0.6) / 0.4); }
        if (p < T.pull[1]) return seg(grabS, pulled, T.pull);
        if (p < T.release[1]) return seg(pulled, letGo, T.release);
        if (p < T.back[0]) return letGo;
        return seg(letGo, gripPose, T.back);
      }
      if (p < T.back[0]) return up;
      return seg(up, gripPose, T.back);
    }
    if (spec.reload === 'revolver') {
      const drum = mk(rest(V(0, -0.075, 0.0)), qOpen, grab);
      const beltPose = mk(belt, qOpen, open);
      if (p < 0.12) return gripPose;
      if (p < 0.26) return mixH(gripPose, drum, smooth(ramp(p, 0.12, 0.26)));
      if (p < 0.5) return drum;
      if (p < 0.62) return mixH(drum, beltPose, smooth(ramp(p, 0.5, 0.62)));
      if (p < 0.78) return mixH(beltPose, drum, smooth(ramp(p, 0.62, 0.78)));
      if (p < 0.86) return drum;
      return mixH(drum, gripPose, smooth(ramp(p, 0.86, 0.96)));
    }
    // shotgun: por cartucho → cinto, por baixo da janela, encaixa e empurra para dentro do tubo, volta
    // (o último vai direto à bomba). A mão segue o CARTUCHO: a posição da raiz sai do ponto em que o
    // cartucho tem que estar (espaço da arma).
    const beltPose = mk(belt, qOpen, open);
    const pz = spec.parts && spec.parts.pump ? spec.parts.pump.position.z : 0;
    const onPump = this.gripHand(spec.gripL, V(0, 0, pz), 1), pumpPose = { p: onPump.p, q: onPump.q, c: gripPose.c };
    const hq = this.weaponRoot.quaternion.clone().multiply(Q_PORT);
    const holdShell = [0.22, 0.28, 0.4, 0.45]; // pinça leve: polegar e dedos seguram o cartucho pela base
    const shellAt = (pt) => {
      const target = this.weaponPoint(pt);
      return { p: target.sub(SHELL_IN_HAND.clone().applyQuaternion(hq)), q: hq.clone(), c: holdShell };
    };
    const lerp3 = (a, b, u) => [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u];
    const st = this.shot;
    if (!st) return mixH(beltPose, pumpPose, smooth(ramp(p, 0.74, 0.85)));
    if (st.k === 'in') return mixH(gripPose, beltPose, smooth(st.f));
    if (st.k === 'shell') {
      const f = st.f, P = SHELL_PATH;
      if (f < 0.34) return mixH(beltPose, shellAt(P.below), smooth(ramp(f, 0, 0.34)));            // pega no cinto e traz
      if (f < 0.5) return shellAt(lerp3(P.below, P.port, smooth(ramp(f, 0.34, 0.5))));           // encosta na janela
      if (f < 0.66) { const k = smooth(ramp(f, 0.5, 0.66)); const h = shellAt(lerp3(P.port, P.inside, k)); h.c = [0.3, 0.35, 0.4, 0.4]; return h; } // polegar empurra para dentro
      const done = shellAt(P.inside); done.c = [0.3, 0.35, 0.4, 0.4];
      return mixH(done, st.last ? pumpPose : beltPose, smooth(ramp(f, 0.66, 1)));
    }
    return pumpPose; // fechando: mão na bomba (e bombeia junto se estava vazia)
  }
  applyReloadParts(spec, parts, p, weight) {
    if (spec.reload === 'mag' && parts.mag) {
      // carregador: cai, some, reaparece entrando
      const T = this.magTimeline(spec);
      const drop = smooth(ramp(p, T.drop[0], T.drop[1]));
      const ins = smooth(ramp(p, T.ins[0], T.ins[1] + 0.01));
      const m = parts.mag;
      if (p < T.ins[0]) { m.visible = p < T.drop[1] && weight > 0.01; m.position.set(0.0, -0.32 * drop, 0.05 * drop); m.rotation.set(0.9 * drop, 0, 0.5 * drop); }
      else { m.visible = !(spec.magHidden && p > T.ins[1] + 0.02); m.position.set(0, -0.14 * (1 - ins), 0); m.rotation.set(0, 0, 0); }
      if (parts.slide && T.pull) { // ferrolho acompanha a mão para trás e bate para a frente ao soltar
        const back = p < T.pull[0] ? 0 : p < T.pull[1] ? smooth(ramp(p, T.pull[0], T.pull[1])) : 1 - ramp(p, T.release[0], T.release[0] + 0.012);
        parts.slide.position.z = Math.max(parts.slide.position.z, back * 0.045 * weight);
      } else if (parts.slide && spec.id === 'pistola') {
        const sl = Math.sin(Math.PI * ramp(p, 0.8, 0.92));
        parts.slide.position.z = Math.max(parts.slide.position.z, sl * 0.04);
      }
      if (parts.bolt && spec.boltAction && p > 0.78 && p < 0.96 && !this.cycle) {
        const u = ramp(p, 0.78, 0.96);
        const up = smooth(ramp(u, 0, 0.25)) - smooth(ramp(u, 0.75, 1));
        const back = smooth(ramp(u, 0.25, 0.5)) - smooth(ramp(u, 0.5, 0.75));
        parts.bolt.rotation.z = -up * 1.2; parts.bolt.position.z = back * 0.07; parts.bolt.position.y = up * 0.012;
      }
    } else if (spec.reload === 'revolver' && parts.drum) {
      const open = smooth(ramp(p, 0.2, 0.3)) - smooth(ramp(p, 0.8, 0.9));
      parts.drum.rotation.z = open * Math.PI * 2 * 1.5 + (p > 0.3 && p < 0.5 ? (p - 0.3) * 40 : 0);
      parts.drum.position.x = -0.045 * open;
    } else if (spec.reload === 'shotgun' && parts.pump) {
      const st = this.shot, sl = st ? (st.k === 'out' && st.pump ? ramp(st.f, 0.45, 0.98) : 0) : ramp(p, 0.86, 0.98);
      const back = smooth(ramp(sl, 0, 0.45)) - smooth(ramp(sl, 0.5, 1));
      parts.pump.position.z = back * 0.1;
    }
  }

  updateHeldItems(spec, reloadP, wt) {
    for (const item of this.heldItems) item.visible = false;
    if (this.heal && wt.heal > 0.3) {
      (this.heal.item === 'kit' ? this.heldKit : this.heldBandage).visible = true;
    }
    if (!spec || reloadP < 0 || wt.reload < 0.1) return;
    const p = reloadP;
    if (spec.reload === 'mag') { const T = this.magTimeline(spec); if (p > T.held[0] && p < T.held[1]) this.heldMag.visible = true; }
    else if (spec.reload === 'revolver' && p > 0.64 && p < 0.84) this.heldLoader.visible = true;
    else if (spec.reload === 'shotgun' && this.shot && this.shot.k === 'shell') {
      this.heldShell.visible = this.shot.f > 0.06 && this.shot.f < 0.62; // cartucho na mão até sumir dentro do tubo
    }
  }

  // ---------- poses que substituem as mãos ----------
  applyOverrides(hands, dt, t, spec) {
    const wt = this.w;
    const mix = (h, p, q, c, k) => {
      if (k <= 0.001) return;
      h.p = h.p.clone().lerp(p, k); h.q = h.q.clone().slerp(q, k);
      if (c) h.c = lerpArr(h.c, c, k);
    };
    const bob = Math.sin(this.bobPhase) * 0.01 * this.bobAmp;

    // carregando uma peça (construção): duas mãos à frente
    if (wt.carry > 0.001) {
      const sway = this.sway.x * 0.5;
      mix(hands[0], V(0.2 + bob + sway, -0.13, -0.4), eulerQ([-0.15, 0.25, -0.5]), [0.65, 0.65, 0.65, 0.65], wt.carry);
      mix(hands[1], V(-0.2 + bob + sway, -0.13, -0.4), eulerQ(mirrorEuler([-0.15, 0.25, -0.5])), [0.65, 0.65, 0.65, 0.65], wt.carry);
    }
    // nadando: nado de peito andando, "pedalando a água" parado (mistura pela velocidade)
    if (wt.swim > 0.001) {
      const sp = clamp((this.speedNow || 0) / CFG.swim, 0, 1);
      this.swimMove = approach(this.swimMove || 0, sp > 0.25 ? 1 : 0, dt * 2.5);
      const m = this.swimMove;
      this.swimPhase = (this.swimPhase + dt * (0.45 + 0.4 * sp) * (m > 0.05 ? 1 : 0)) % 1;   // ciclos por segundo
      this.treadT = (this.treadT || 0) + dt;
      const u = this.swimPhase, tt = this.treadT;
      for (let i = 0; i < 2; i++) {
        const sd = i === 0 ? 1 : -1;
        // braçada (mão direita): [x, y, z, rx, ry, rz]; a esquerda é espelhada
        const st = sampleKeys(SWIM_STROKE, (u + i * 0.02) % 1);
        // pedalando: mãos baixas na frente, abanando de leve com as palmas para baixo
        const sc = Math.sin(tt * 2.4 + i * 0.6);
        const tr = [0.2 + 0.05 * sc, -0.26 + 0.015 * Math.cos(tt * 4.8), -0.46, -0.2, 0, 0.45 * sc];
        const f = lerpArr(tr, st, m);
        const rr = [f[3], f[4], f[5]];
        const curl = lerp(0.12, sampleCurl(u), m);
        mix(hands[i], V(sd * f[0], f[1], f[2]), eulerQ(i === 0 ? rr : mirrorEuler(rr)), [curl, curl, curl, curl], wt.swim);
      }
      // cabeça sobe na puxada e afunda um pouco no deslize; boia de leve quando parado
      const pull = Math.sin(clamp((u - 0.28) / 0.5, 0, 1) * Math.PI);
      this.swimCam = {
        y: lerp(0.018 * Math.sin(tt * 2.1), 0.07 * pull - 0.03, m) * wt.swim,
        pitch: lerp(0.01 * Math.sin(tt * 2.1 + 1), -0.05 * pull + 0.025, m) * wt.swim,
        roll: lerp(0.012 * Math.sin(tt * 1.3), 0.008 * Math.sin(u * Math.PI * 2), m) * wt.swim,
      };
    } else this.swimCam = null;
    // escalando / pulando uma borda
    if (wt.mantle > 0.001) {
      const u = this.mantleU;
      const reach = smooth(ramp(u, 0, 0.35)), push = smooth(ramp(u, 0.35, 0.95));
      for (let i = 0; i < 2; i++) {
        const sd = i === 0 ? 1 : -1;
        const off = i === 0 ? 0 : 0.06; // mãos levemente defasadas
        const y = lerp(-0.2, 0.0, reach) + (-0.5 - 0.0) * push + off * 0;
        const z = lerp(-0.4, -0.55, reach) + 0.28 * push;
        const rr = [lerp(0.2, 1.35, reach) - push * 0.9, sd * -0.12, sd * 0.1];
        mix(hands[i], V(sd * 0.2, y, z), eulerQ(i === 0 ? rr : mirrorEuler(rr)), [0.2, 0.25, 0.25, 0.25], wt.mantle);
      }
    }
    // usando bandagem / kit médico
    if (wt.heal > 0.001 && this.heal) {
      const ph = this.heal.t, k = wt.heal;
      const kit = this.heal.item === 'kit';
      const circle = ph * (kit ? 7 : 12);
      mix(hands[1], V(-0.085, -0.2 + Math.sin(ph * 5) * 0.004, -0.36), eulerQ([0.7, 0.4, 0.75]), [0.5, 0.5, 0.5, 0.5], k);
      const rp = kit
        ? V(0.05 + Math.sin(circle) * 0.012, -0.2 + Math.cos(circle * 0.5) * 0.02, -0.34)
        : V(0.06 + Math.sin(circle) * 0.045, -0.22 + Math.cos(circle) * 0.02, -0.36 - Math.cos(circle) * 0.015);
      mix(hands[0], rp, eulerQ([0.6, -0.5, -0.9]), [0.5, 0.55, 0.55, 0.55], k);
    }
    // alcançando (abrir caixa / mastro)
    if (wt.reach > 0.001) {
      const k = wt.reach;
      mix(hands[0], V(0.1, -0.1, -0.5), eulerQ([0.1, 0.1, -0.1]), [0.1, 0.1, 0.1, 0.1], k);
    }
  }

  // Luvas da 1ª pessoa com a cor escolhida para a pílula.
  // Troca as mãos de luva pelas mãos 3D realistas (quando o GLB termina de carregar).
  upgradeHands(build) {
    for (let i = 0; i < 2; i++) {
      const old = this.hands[i], nh = build(i === 1, MAT.gloveReal);
      if (!nh) return;
      for (const item of this.heldItems) if (item.parent === old.root) nh.root.add(item);
      nh.root.position.copy(old.root.position); nh.root.quaternion.copy(old.root.quaternion);
      this.group.remove(old.root); this.group.add(nh.root);
      this.hands[i] = nh;
    }
  }
  setGloveColor(pill) {
    setGloveColor(PILL_COLORS[sanitizePill(pill).gloves].hex);
  }

  // ---------- desenho ----------
  render(renderer) {
    if (!this.active || this.G.player.dead || (this.G.naval && this.G.naval.manning)) return;
    const r = renderer;
    r.autoClear = false;
    r.clearDepth();
    r.render(this.scene, this.camera);
    r.autoClear = true;
  }
}
