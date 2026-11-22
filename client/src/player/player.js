// Personagem em terceira pessoa: andar/correr/pular, nado, parkour (vault + agarrar/subir
// bordas com a mesma mecânica de "mantle") e câmera com colisão.
import * as THREE from '../three.js';
import { rot, clamp, lerp, lerpAngle } from '../core/util.js';
import { CFG } from '../config.js';
import { waveHeight } from '../world/ocean.js';
import { makeHumanoid, animateHumanoid } from './model.js';
import { makePill, animatePill, disposePill, PILL_DEFAULT, PILL_HEIGHT } from './pill.js';

const PILL_SCALE = 1.75 / PILL_HEIGHT;

const _v = new THREE.Vector3(), _d = new THREE.Vector3();
const smoothstep = (value) => {
  const t = clamp(value, 0, 1);
  return t * t * (3 - 2 * t);
};

export class Player {
  constructor(G) {
    this.G = G;
    this.body = {
      pos: new THREE.Vector3(0, 1.5, -1), vel: new THREE.Vector3(), radius: 0.35, height: 1.7,
      grounded: false, groundSet: null, carrier: null, landVel: 0,
    };
    this.yaw = 0; this.camYaw = Math.PI; this.camPitch = 0.3; this.camDist = 5.2;
    this.camTarget = new THREE.Vector3(0, 2, 0);
    this.swimming = false; this.mantle = null; this.dead = false; this.aboard = false;
    this.downed = false; // multiplayer: caído, se arrastando até ser reanimado
    // 1ª pessoa por padrão; [F] alterna. O corpo some só para o próprio jogador.
    this.firstPerson = true; this.fovSens = 1; this.eyeHeight = 1.6;
    this.zoom = 5.2;          // distância da câmera em 3ª pessoa ([I] aproxima, [O] afasta)
    this.aimHold = 0;         // depois de um tiro "do quadril", segura a pose de mira um instante
    this.kick = 0;            // recuo visual dos braços em 3ª pessoa
    this.flashT = 0;
    this.mesh = makeHumanoid(0xb49b7b, 0xb97251);
    this.proceduralRig = this.mesh.userData.parts.rig;
    this.pillVisual = null;
    this.appearance = { character: 'pilula', pill: { ...PILL_DEFAULT } }; // a pílula é o personagem do jogo
    this.mesh.rotation.order = 'YXZ';
    // Arma em 3ª pessoa: o MESMO modelo detalhado da 1ª pessoa (viewmodel-parts), trocado em combat.equip.
    this.weaponMesh = new THREE.Group();
    this.weaponMesh.visible = false;
    G.scene.add(this.mesh);
    this.ray = new THREE.Raycaster();
    this.applyAppearance();
  }

  setFirstPerson(on) {
    this.firstPerson = !!on;
    this.camTarget.set(this.body.pos.x, this.body.pos.y + 1.6, this.body.pos.z);
    if (this.firstPerson) this.camDist = 0;
    else this.camPitch = clamp(this.camPitch, -0.45, 1.3);
    if (this.G.hud) this.G.hud.msg(this.firstPerson ? 'Câmera em primeira pessoa' : 'Câmera em terceira pessoa');
  }

  setAppearance(appearance) {
    this.appearance = { ...this.appearance, ...appearance };
    this.applyAppearance();
  }

  applyAppearance() {
    if (this.pillVisual) {
      if (this.weaponMesh.parent) this.weaponMesh.parent.remove(this.weaponMesh);
      this.mesh.remove(this.pillVisual);
      disposePill(this.pillVisual.children[0]);
      this.pillVisual = null;
    }
    const pill = makePill(this.appearance.pill);
    this.pillVisual = new THREE.Group();
    this.pillVisual.add(pill);
    this.pillVisual.scale.setScalar(PILL_SCALE);
    this.mesh.add(this.pillVisual);
    this.proceduralRig.visible = false;
    pill.userData.parts.hand.add(this.weaponMesh);
    this.weaponMesh.position.set(0, 0, 0);
    this.weaponMesh.rotation.set(-Math.PI / 2, 0, Math.PI); // cano (-Z) segue o braço; topo para cima ao mirar
    this.weaponMesh.scale.setScalar(1.5 / PILL_SCALE); // arma "de desenho": um pouco maior
    if (this.G.viewmodel) this.G.viewmodel.setGloveColor(this.appearance.pill);
  }

  // Tiro em 3ª pessoa: tranco nos braços, clarão na boca do cano e pose de mira por um instante.
  onShot() { this.aimHold = 0.8; this.kick = 1; this.flashT = 0.06; }

  forward() { return [-Math.sin(this.camYaw), -Math.cos(this.camYaw)]; }

  update(dt, t) {
    const G = this.G, inp = G.input, b = this.body, p = b.pos;
    const rotatingBuild = G.build && G.build.rotating;
    // Câmera: mouse + setas.
    if (!rotatingBuild || (G.build.cameraDragging && inp.mouse.right)) {
      // Em 1ª pessoa a sensibilidade acompanha o zoom da mira (luneta não "foge" do alvo).
      const sens = this.firstPerson ? this.fovSens : 1;
      this.camYaw -= (inp.mouse.dx * 0.0025 + ((inp.down('ArrowRight') ? 1 : 0) - (inp.down('ArrowLeft') ? 1 : 0)) * 1.8 * dt) * sens;
      const pitchMin = this.firstPerson ? -1.5 : -0.45, pitchMax = this.firstPerson ? 1.5 : 1.3;
      this.camPitch = clamp(this.camPitch + (inp.mouse.dy * 0.0025 + ((inp.down('ArrowDown') ? 1 : 0) - (inp.down('ArrowUp') ? 1 : 0)) * 1.2 * dt) * sens, pitchMin, pitchMax);
    }

    if (this.dead) { this.syncMesh(0, dt); return; }
    if ((G.interact && G.interact.lootOpen) || (G.gfxMenu && G.gfxMenu.open) || (G.tools && G.tools.menuOpen)) {
      b.vel.x = b.vel.z = 0;
      this.syncMesh(0, dt);
      return;
    }
    if (this.mantle) { this.updateMantle(dt); this.syncMesh(0, dt); return; }
    if (G.naval && G.naval.manning) { G.naval.holdPlayer(b); this.syncMesh(0, dt); return; } // no canhão

    const aiming = G.combat.aiming;
    const fwd = (inp.down('KeyW') ? 1 : 0) - (inp.down('KeyS') ? 1 : 0);
    const side = (inp.down('KeyD') ? 1 : 0) - (inp.down('KeyA') ? 1 : 0);
    const [fx, fz] = this.forward();
    const rx = Math.cos(this.camYaw), rz = -Math.sin(this.camYaw);
    let dx = fx * fwd + rx * side, dz = fz * fwd + rz * side;
    const len = Math.hypot(dx, dz), moving = len > 0;
    if (moving) { dx /= len; dz /= len; }
    let speed = this.swimming ? CFG.swim : inp.down('ShiftLeft') ? CFG.run : CFG.walk;
    if (this.downed) speed = this.swimming ? CFG.swim * 0.6 : 0.9; // caído: só se arrasta
    if (aiming) speed = Math.min(speed, 3);
    speed *= this.speedMul || 1; // bloqueando/carregando golpe anda devagar
    const k = Math.min(1, (b.grounded ? 14 : this.swimming ? 6 : 3.5) * dt);
    b.vel.x += (dx * speed - b.vel.x) * k;
    b.vel.z += (dz * speed - b.vel.z) * k;
    if (this.dash) { b.vel.x = this.dash.vx; b.vel.z = this.dash.vz; } // esquiva [Q]
    if (this.yank) { b.vel.x = this.yank.vx; b.vel.z = this.yank.vz; if (this.swimming) b.pos.y += 3.5 * dt; } // puxado pelo gancho
    if (this.firstPerson) this.yaw = Math.atan2(fx, fz);
    else if (aiming || this.aimHold > 0) this.yaw = lerpAngle(this.yaw, Math.atan2(fx, fz), Math.min(1, 16 * dt));
    else if (moving) this.yaw = lerpAngle(this.yaw, Math.atan2(dx, dz), Math.min(1, 12 * dt));

    if (inp.hit('Space') && !this.downed) {
      const dir = moving ? [dx, dz] : [Math.sin(this.yaw), Math.cos(this.yaw)];
      if (!this.tryMantle(dir[0], dir[1]) && b.grounded) { b.vel.y = CFG.jumpSpeed; b.grounded = false; }
    }

    const prevY = p.y;
    const wh = waveHeight(p.x, p.z, t);
    if (this.swimming) { b.vel.y = 0; p.y += (wh - 1.15 - p.y) * Math.min(1, 6 * dt); }
    else { b.vel.y = Math.max(b.vel.y - CFG.gravity * dt, -20); p.y += b.vel.y * dt; }
    p.x += b.vel.x * dt; p.z += b.vel.z * dt;
    G.colliders.resolve(b, prevY);

    if (this.swimming && !this.wasSwimming && G.gfx) G.gfx.wetLens(0.5); // mergulho
    if (!this.swimming && this.wasSwimming && G.gfx) G.gfx.wetLens(1);  // saiu da água: lente molhada
    this.wasSwimming = this.swimming;
    if (b.grounded) {
      this.swimming = false;
      b.carrier = b.groundSet;
      if (b.landVel < -13) G.survival.damage((-b.landVel - 13) * 5, 'Queda');
    } else if (!this.swimming && p.y < wh - 1.0) {
      this.swimming = true; b.carrier = null; b.vel.y = 0;
    } else if (b.carrier) {
      // No ar: continua sendo carregado enquanto estiver sobre o barco.
      const c = b.carrier;
      if (Math.hypot(p.x - c.x, p.z - c.z) > c.radius + 2.5) b.carrier = null;
    }
    this.syncMesh(Math.hypot(b.vel.x, b.vel.z), dt);
  }

  // Procura uma superfície à frente para subir (vault baixo, borda alta ou sair da água).
  tryMantle(dx, dz) {
    const b = this.body, p = b.pos, reach = this.swimming ? 2.7 : 2.4;
    for (const d of [b.radius + 0.15, b.radius + 0.45, b.radius + 0.8]) {
      const qx = p.x + dx * d, qz = p.z + dz * d;
      const h = this.G.colliders.probe(qx, qz, p.y + reach);
      if (!h || h.top < p.y + CFG.step + 0.05) continue;
      const s = h.set;
      const [flx, flz] = rot(p.x - s.x, p.z - s.z, -s.yaw);
      const [tlx, tlz] = rot(qx - s.x, qz - s.z, -s.yaw);
      const height = h.top - p.y;
      const vault = height <= 0.75;
      this.mantle = {
        set: s, fx: flx, fz: flz, fy: p.y - s.y, tx: tlx, tz: tlz, ty: h.top - s.y,
        height, vault, t: 0,
        dur: vault
          ? 0.42 + clamp((height - 0.35) / 0.4, 0, 1) * 0.08
          : 0.62 + clamp((height - 0.75) / 1.65, 0, 1) * 0.18,
      };
      return true;
    }
    return false;
  }
  updateMantle(dt) {
    const m = this.mantle, b = this.body, s = m.set;
    m.t += dt / m.dur;
    const u = Math.min(1, m.t);
    const travel = smoothstep((u - 0.12) / 0.88);
    const heightFactor = clamp((m.height - 0.35) / 1.9, 0, 1);
    const riseDuration = m.vault ? 0.48 + heightFactor * 0.08 : 0.58 + heightFactor * 0.2;
    const rise = smoothstep((u - 0.08) / riseDuration);
    const [wx, wz] = rot(lerp(m.fx, m.tx, travel), lerp(m.fz, m.tz, travel), s.yaw);
    const arc = Math.sin(Math.PI * u) * (0.08 + heightFactor * 0.06);
    b.pos.set(s.x + wx, s.y + lerp(m.fy, m.ty, rise) + arc, s.z + wz);
    b.vel.set(0, 0, 0);
    if (u >= 1) { this.mantle = null; b.grounded = true; b.groundSet = b.carrier = s; this.swimming = false; }
  }

  // Posiciona o modelo. A bordo ele vira filho do barco: acompanha balanço e inclinação.
  syncMesh(speed, dt) {
    const G = this.G, b = this.body, boat = G.boat, set = boat.set;
    const onBoat = !this.swimming && (b.carrier === set || (this.mantle && this.mantle.set === set));
    this.aboard = onBoat;
    if (onBoat) {
      if (this.mesh.parent !== boat.group) boat.group.add(this.mesh);
      const [lx, lz] = boat.toLocal(b.pos.x, b.pos.z);
      this.mesh.position.set(lx, b.pos.y - set.y, lz);
      this.mesh.rotation.y = this.yaw - boat.yaw;
    } else {
      if (this.mesh.parent !== G.scene) G.scene.add(this.mesh);
      this.mesh.position.copy(b.pos);
      this.mesh.rotation.y = this.yaw;
    }
    this.mesh.rotation.x = this.dead ? -Math.PI / 2 : 0;
    this.mesh.visible = !(this.firstPerson && G.started) || !!(G.naval && G.naval.manning); // só o dono não vê o próprio corpo
    let pose = this.swimming ? 'swim' : G.combat.aiming ? 'aim' : 'walk';
    let progress = 0;
    if (this.mantle) {
      pose = this.mantle.vault ? 'vault' : 'climb';
      progress = this.mantle.t;
    } else if (G.combat.swing > 0) {
      pose = 'attack';
      progress = 1 - G.combat.swing / G.combat.swingDuration;
    } else if (!b.grounded && !this.swimming) {
      pose = 'jump';
    }
    animateHumanoid(this.mesh, this.swimming ? speed + 1.5 : speed, dt, pose, progress,
      this.mantle ? this.mantle.height : 0);
    if (this.pillVisual) {
      this.proceduralRig.visible = false;
      // arma de fogo: mira (ou acabou de atirar) = braços apontando para onde a câmera olha
      const w = G.combat.weapon, gun = w && w.ammo, m = G.melee;
      if (m) { // corpo a corpo: esquiva, guarda, carga do pesado e pancada pesada
        if (this.downed && !this.swimming) pose = 'crawl';
        else if (m.dodge) { pose = m.dodge.anim; progress = m.dodge.t / 0.34; this.pillVisual.children[0].userData.rollDir = m.dodge.dir; }
        else if (m.parryAnim) { pose = 'parry'; progress = m.parryAnim.t / m.parryAnim.dur; }
        else if (m.stunT > 0) pose = 'stagger';
        else if (m.blocking) pose = 'guard';
        else if (m.charging) { pose = 'windup'; progress = Math.min(1, m.holdT / 0.5); }
        else if (m.swingPose) { pose = m.swingPose.pose; progress = m.swingPose.t / m.swingPose.dur; }
      }
      if (gun && this.aimHold > 0 && pose === 'walk') pose = 'aim';
      this.aimHold = Math.max(0, this.aimHold - dt);
      this.kick = Math.max(0, this.kick - dt * 7);
      const pd = this.pillVisual.children[0].userData;
      pd.aimPitch = this.firstPerson ? 0 : -this.camPitch * 0.9; pd.kick = this.kick;
      if (this.flashMesh) {
        this.flashT -= dt; this.flashMesh.visible = this.flashT > 0;
        if (this.flashMesh.visible) { this.flashMesh.rotation.z = Math.random() * 6.28; this.flashMesh.scale.setScalar(2.2 + Math.random()); }
      }
      const pillPose = pose === 'climb' || pose === 'vault' ? 'jump' : pose;
      animatePill(this.pillVisual.children[0], speed, dt, pillPose, progress);
      return;
    }
  }

  // Câmera nos olhos. O viewmodel dá o FOV de mira e um pequeno balanço/tranco.
  updateFirstPersonCamera(dt, t) {
    const G = this.G, cam = G.camera, vm = G.viewmodel;
    this.mesh.updateWorldMatrix(true, false);
    this.mesh.getWorldPosition(_v);
    this.eyeHeight += ((this.dead ? 0.35 : this.downed ? 0.5 : 1.6) - this.eyeHeight) * Math.min(1, 6 * dt);
    _v.y += this.eyeHeight + (vm ? vm.camOff.y : 0);
    this.camTarget.copy(_v);
    this.camDist = 0;
    const fovTarget = vm ? vm.fovTarget : 75;
    cam.fov = lerp(cam.fov, fovTarget, Math.min(1, 14 * dt));
    cam.updateProjectionMatrix();
    this.fovSens = clamp(Math.tan(cam.fov * Math.PI / 360) / Math.tan(75 * Math.PI / 360), 0.15, 1);
    cam.position.copy(_v);
    const wy = waveHeight(cam.position.x, cam.position.z, t) + 0.3;
    if (cam.position.y < wy) cam.position.y = wy;
    const pitch = this.camPitch - (vm ? vm.camOff.pitch : 0);
    const cp = Math.cos(pitch);
    _d.set(-Math.sin(this.camYaw) * cp, -Math.sin(pitch), -Math.cos(this.camYaw) * cp);
    cam.up.set(0, 1, 0);
    cam.lookAt(_v.copy(cam.position).add(_d));
    // esquiva em 1ª pessoa: a câmera abaixa e inclina para o lado do movimento
    const dg = G.melee && G.melee.dodge;
    let dodgeRoll = 0;
    if (dg) {
      const k = Math.sin(Math.min(1, dg.t / 0.34) * Math.PI);
      cam.position.y -= (dg.anim === 'roll' ? 0.55 : 0.3) * k;
      dodgeRoll = dg.anim === 'sidestep' ? -Math.sign(dg.side || 1) * 0.18 * k : 0;
    }
    const roll = (vm ? vm.camOff.roll : 0) + dodgeRoll + (this.dead ? (1.6 - this.eyeHeight) * 0.6 : 0);
    if (roll) cam.rotateZ(roll);
  }

  updateCamera(dt, t) {
    // retícula: anel "sobre o ombro" em 3ª pessoa, abre com o recuo e fecha ao mirar
    const xh = this._xh || (this._xh = document.getElementById('crosshair'));
    if (xh) {
      const tp = !this.firstPerson, w = this.G.combat.weapon;
      xh.classList.toggle('tp', tp);
      if (tp) xh.classList.remove('ads'); // a classe de mira da 1ª pessoa não pode ficar presa na 3ª
      xh.classList.toggle('melee', !!(tp && w && w.melee));
      if (tp) xh.style.setProperty('--s', (1 + (this.G.combat.bloom || 0) * 0.9 - (this.aimBlend || 0) * 0.3).toFixed(3));
    }
    if (this.G.naval && this.G.naval.manning && this.G.naval.updateCamera(this.G.camera, dt, t)) return;
    if (this.firstPerson) { this.updateFirstPersonCamera(dt, t); return; }
    const G = this.G, cam = G.camera, aiming = G.combat.aiming;
    this.mesh.updateWorldMatrix(true, false);
    this.mesh.getWorldPosition(_v); _v.y += this.downed ? 0.7 : 1.6;
    this.camTarget.lerp(_v, 1 - Math.exp(-20 * dt));
    // zoom da 3ª pessoa: [I] aproxima, [O] afasta (mira sempre puxa para perto do ombro)
    const typing = G.tools && G.tools.menuOpen;
    if (!typing && G.input.hit('KeyI')) this.zoom = clamp(this.zoom - 0.8, 1.8, 10);
    if (!typing && G.input.hit('KeyO')) this.zoom = clamp(this.zoom + 0.8, 1.8, 10);
    this.aimBlend = lerp(this.aimBlend || 0, aiming ? 1 : 0, Math.min(1, 12 * dt));
    this.camDist = lerp(this.camDist, aiming ? Math.min(this.zoom, 1.9) : this.zoom, Math.min(1, 10 * dt));
    cam.fov = lerp(cam.fov, aiming ? 48 : 68, Math.min(1, 10 * dt));
    cam.updateProjectionMatrix();
    // Câmera sobre o ombro direito (o personagem não tapa a mira).
    const rx = Math.cos(this.camYaw), rz = -Math.sin(this.camYaw);
    // sobre o ombro: mais para a direita e um pouco mais baixo quando mira
    const sh = 0.6 + this.aimBlend * 0.25;
    const origin = _v.copy(this.camTarget); origin.x += rx * sh; origin.z += rz * sh; origin.y -= this.aimBlend * 0.15;
    const cp = Math.cos(this.camPitch);
    _d.set(Math.sin(this.camYaw) * cp, Math.sin(this.camPitch), Math.cos(this.camYaw) * cp);
    let dist = this.camDist;
    this.ray.set(origin, _d); this.ray.far = dist + 0.3;
    const hit = this.ray.intersectObjects(G.solids, false)[0];
    if (hit) dist = Math.max(0.5, hit.distance - 0.3);
    cam.position.copy(origin).addScaledVector(_d, dist);
    const wy = waveHeight(cam.position.x, cam.position.z, t) + 0.3;
    if (cam.position.y < wy) cam.position.y = wy;
    cam.lookAt(origin);
  }

  respawn() {
    const G = this.G, b = this.body;
    const spawn = G.startup.spawnPosition();
    b.pos.set(spawn.x, spawn.y, spawn.z); b.vel.set(0, 0, 0);
    b.carrier = spawn.groundSet; b.groundSet = spawn.groundSet; b.grounded = !!spawn.groundSet;
    this.camTarget.set(b.pos.x, b.pos.y + 1.6, b.pos.z);
    this.swimming = false; this.mantle = null; this.dead = false; this.downed = false;
  }
}
