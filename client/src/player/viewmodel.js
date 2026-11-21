// Viewmodel em 1ª pessoa: braços, mãos e arma do JOGADOR LOCAL.
//
// - Vive numa cena e câmera próprias, desenhadas por cima do mundo (depth limpo), então a
//   arma nunca atravessa paredes e o FOV de mira não deforma os braços.
// - Nada daqui é enviado pela rede nem entra em G.scene: os outros jogadores só enxergam o
//   modelo de 3ª pessoa. As animações de mão existem apenas para quem joga em 1ª pessoa.
// - Tudo é procedural (molas + keyframes), sem depender de clipes de animação.
import { PILL_COLORS, sanitizePill } from './pill.js';
import * as THREE from '../three.js';
import { clamp, lerp } from '../core/util.js';
import { CFG } from '../config.js';
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

// Keyframes [tempo, [px, py, pz, rx, ry, rz]] relativos à pose de empunhadura.
const SWINGS = {
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

const BELT = V(-0.13, -0.52, -0.2);            // "cinto": fora da tela, embaixo à esquerda
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
    this.heldShell = buildShell(0xb03a2e); this.heldShell.position.set(0.0, -0.035, -0.05);
    this.heldShell.rotation.set(0, 1.4, 0);
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
    this.swingDur = dur || clamp(w.rate * 0.88, 0.3, 0.55);
    this.swingT = 0;
    return this.swingDur;
  }
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
      if (p.mag) { p.mag.visible = true; p.mag.position.set(0, 0, 0); p.mag.rotation.set(0, 0, 0); }
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
  gripHand(grip, extra) {
    const q = eulerQ(grip.r, grip.order || 'XYZ');
    const wq = this.weaponRoot.quaternion;
    const p = V(...(grip.off || [0, 0.03, 0.07])).applyQuaternion(q).add(V(...grip.p));
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
    this.group.visible = this.active && !pl.dead;
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
    else if (w && w.reload && cb.reloading > 0 && shownIsCurrent) reloadP = clamp(1 - cb.reloading / w.reload, 0, 1);
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

    // corpo a corpo: guarda (arma atravessada na frente) e carga do golpe pesado (puxa para trás)
    const mel = this.G.melee;
    this.blockW = approach(this.blockW || 0, mel && mel.blocking ? 1 : 0, dt * 12);
    this.chargeW = approach(this.chargeW || 0, mel && mel.charging ? Math.min(1, mel.holdT / 0.6) : 0, dt * 8);
    if (spec && spec.type === 'melee') {
      const bw = this.blockW, cw = this.chargeW;
      P[0] += -0.16 * bw; P[1] += 0.12 * bw; P[2] += 0.05 * bw; R[0] += 0.25 * bw; R[1] += 0.85 * bw; R[2] += 1.3 * bw;
      P[0] += 0.04 * cw; P[1] += 0.08 * cw; P[2] += 0.14 * cw; R[0] += 0.75 * cw; R[2] -= 0.35 * cw;
      if (cw > 0.95) { P[0] += (Math.random() - 0.5) * 0.004; P[1] += (Math.random() - 0.5) * 0.004; } // tremor de força
    }
    this.weaponRoot.position.set(P[0], P[1], P[2]);
    this.weaponRoot.rotation.set(R[0], R[1], R[2]);

    // peças móveis (ferrolho, bomba, tambor, carregador)
    const parts = spec ? spec.parts || {} : {};
    if (parts.slide) parts.slide.position.z = clamp(slide, 0, 1) * 0.035;
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
    } else {
      const r = REST_R;
      hands[0].p = r.p.clone().add(V(restBob, -Math.abs(Math.cos(bp)) * 0.012 * walk, 0));
      hands[0].q = eulerQ(r.r); hands[0].c = r.c.slice(); hands[0].t = r.t.slice();
    }
    // mão esquerda
    if (spec && spec.gripL) {
      let extra = null;
      if (parts.pump) extra = V(0, 0, parts.pump.position.z);
      const g = this.gripHand(spec.gripL, extra);
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
      hand.setPose(h.c, h.t);
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
    this.camOff.y = -Math.abs(Math.cos(bp)) * 0.025 * this.bobAmp * (1 - adsEff * 0.8) + land * 0.06;
    this.camOff.roll = Math.sin(bp) * 0.006 * this.bobAmp * (1 - adsEff * 0.8) + shakeR * 0.03;
    this.camOff.pitch = shake * 0.02 + land * 0.02;
    const baseFov = this.sprint > 0.01 ? 75 + 5 * this.sprint : 75;
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
  // Deslocamento da arma durante a recarga (relativo à empunhadura).
  reloadPose(spec, p) {
    const roll = smooth(ramp(p, 0, 0.16)) - smooth(ramp(p, 0.86, 1));
    const off = [0, 0, 0, 0, 0, 0];
    if (spec.reload === 'mag') {
      off[0] = -0.07 * roll; off[1] = 0.03 * roll; off[2] = 0.03 * roll;
      off[3] = 0.28 * roll; off[4] = 0.25 * roll; off[5] = -0.55 * roll;
      // empurrão ao encaixar
      const ins = Math.sin(Math.PI * ramp(p, 0.66, 0.76));
      off[1] += -0.012 * ins; off[3] += -0.05 * ins;
    } else if (spec.reload === 'revolver') {
      off[0] = -0.07 * roll; off[1] = 0.03 * roll; off[2] = 0.03 * roll;
      off[3] = 0.28 * roll; off[4] = 0.25 * roll; off[5] = -0.75 * roll;
      const dump = smooth(ramp(p, 0.26, 0.4)) - smooth(ramp(p, 0.5, 0.58));
      off[3] += 0.55 * dump; off[5] += Math.sin(p * 60) * 0.06 * dump;
    } else if (spec.reload === 'shotgun') {
      off[0] = -0.06 * roll; off[1] = 0.05 * roll; off[2] = 0.06 * roll;
      off[3] = 0.38 * roll; off[4] = 0.3 * roll; off[5] = -0.6 * roll;
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
    const grip = this.gripHand(spec.gripL);
    const gripPose = { p: grip.p, q: grip.q, c: [spec.gripL.c, spec.gripL.c, spec.gripL.c, spec.gripL.c] };

    if (spec.reload === 'mag') {
      const well = mk(rest(V(0, -0.04, 0.03)), qOpen, grab);
      const below = mk(rest(V(0, -0.16, 0.03)), qOpen, grab);
      const up = mk(rest(V(0, -0.015, 0.03)), qOpen, grab);
      const beltPose = mk(belt, qOpen, open);
      if (p < 0.14) return gripPose;
      if (p < 0.3) return mixH(gripPose, well, smooth(ramp(p, 0.14, 0.3)));
      if (p < 0.34) return well;
      if (p < 0.5) return mixH(well, beltPose, smooth(ramp(p, 0.34, 0.5)));
      if (p < 0.62) return mixH(beltPose, below, smooth(ramp(p, 0.5, 0.62)));
      if (p < 0.76) return mixH(below, up, smooth(ramp(p, 0.62, 0.76)));
      if (p < 0.8) return up;
      return mixH(up, gripPose, smooth(ramp(p, 0.8, 0.92)));
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
    // shotgun: 3 ciclos belt -> porta -> belt, depois bombeia
    const port = mk(this.weaponPoint(spec.magPoint, V(0, -0.02, 0.0)), qOpen, grab);
    const beltPose = mk(belt, qOpen, open);
    if (p < 0.1) return mixH(gripPose, beltPose, smooth(ramp(p, 0.0, 0.1)));
    if (p < 0.82) {
      const u = ((p - 0.1) / 0.72) * 3;
      const f = u - Math.floor(u);
      if (f < 0.4) return mixH(beltPose, port, smooth(ramp(f, 0, 0.4)));
      if (f < 0.6) return port;
      return mixH(port, beltPose, smooth(ramp(f, 0.6, 1)));
    }
    return mixH(beltPose, gripPose, smooth(ramp(p, 0.82, 0.96)));
  }
  applyReloadParts(spec, parts, p, weight) {
    if (spec.reload === 'mag' && parts.mag) {
      // carregador: cai (0.3–0.42), some, reaparece entrando (0.62–0.78)
      const drop = smooth(ramp(p, 0.3, 0.46));
      const ins = smooth(ramp(p, 0.62, 0.77));
      const m = parts.mag;
      if (p < 0.62) { m.visible = p < 0.46 && weight > 0.01; m.position.set(0.0, -0.32 * drop, 0.05 * drop); m.rotation.set(0.9 * drop, 0, 0.5 * drop); }
      else { m.visible = true; m.position.set(0, -0.14 * (1 - ins), 0); m.rotation.set(0, 0, 0); }
      if (parts.slide && spec.id === 'pistola') {
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
      const sl = ramp(p, 0.84, 0.98);
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
    if (spec.reload === 'mag' && p > 0.5 && p < 0.77) this.heldMag.visible = true;
    else if (spec.reload === 'revolver' && p > 0.64 && p < 0.84) this.heldLoader.visible = true;
    else if (spec.reload === 'shotgun' && p > 0.1 && p < 0.82) {
      const u = ((p - 0.1) / 0.72) * 3, f = u - Math.floor(u);
      this.heldShell.visible = f > 0.12 && f < 0.5;
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
    // nadando: braçadas alternadas
    if (wt.swim > 0.001) {
      this.swimPhase += dt * 3.2;
      for (let i = 0; i < 2; i++) {
        const ph = this.swimPhase + i * Math.PI, sd = i === 0 ? 1 : -1;
        const reach = Math.sin(ph), lift = Math.max(0, Math.cos(ph));
        const p = V(sd * (0.12 + 0.02 * reach), -0.08 + 0.05 * lift, -0.38 - 0.06 * reach);
        const rr = [-0.6 - 0.35 * lift, sd * -0.1, -sd * 0.15 - 0.2 * sd];
        mix(hands[i], p, eulerQ(i === 0 ? rr : mirrorEuler(rr)), [0.12, 0.12, 0.12, 0.12], wt.swim);
      }
    }
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
  setGloveColor(pill) {
    setGloveColor(PILL_COLORS[sanitizePill(pill).gloves].hex);
  }

  // ---------- desenho ----------
  render(renderer) {
    if (!this.active || this.G.player.dead) return;
    const r = renderer;
    r.autoClear = false;
    r.clearDepth();
    r.render(this.scene, this.camera);
    r.autoClear = true;
  }
}
