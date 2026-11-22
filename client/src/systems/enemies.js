// IA de inimigos com máquina de estados reutilizável:
// idle -> patrulha -> (percepção) perseguição -> ataque / recuo -> procura -> morte.
// Só "pensam" a 5 Hz e apenas quando o jogador está por perto (ativação por distância).
import * as THREE from '../three.js';
import { mulberry32, hash2, lerpAngle, rot, clamp, clock } from '../core/util.js';
import { waveHeight } from '../world/ocean.js';
import { woodTexture, woodBump, repeated, scaleBoxUVs } from '../world/textures.js';
import { CFG } from '../config.js';
import { makeEnemyPill, animateEnemy } from './evilpills.js';
import { inRoom } from '../world/camp.js';
import { sfx } from '../core/sfx.js';

export const ENEMY_TYPES = {
  melee:    { nome: 'Saqueador', hp: 60,  speed: 3.2, dmg: 10, range: 1.8, cd: 1.0, cor: 0xa83a32, scale: 1 },
  atirador: { nome: 'Atirador',  hp: 45,  speed: 2.4, dmg: 7,  range: 22,  cd: 1.7, cor: 0x7a6a2a, scale: 1, ranged: true },
  pesado:   { nome: 'Brutamontes', hp: 160, speed: 1.9, dmg: 22, range: 2.2, cd: 1.6, cor: 0x4a2a5a, scale: 1.3 },
  rapido:   { nome: 'Corredor',  hp: 35,  speed: 5.2, dmg: 6,  range: 1.6, cd: 0.6, cor: 0xc56a1e, scale: 0.85 },
  pirata:   { nome: 'Pirata', hp: 75, speed: 5.4, dmg: 13, range: 1.8, cd: 1.2, cor: 0x553b2d, scale: 1.05, raftSpeed: 7.2 },
};
const BY_DIFF = [['melee'], ['melee', 'rapido'], ['melee', 'rapido', 'atirador'], ['melee', 'atirador', 'pesado', 'rapido'], ['atirador', 'pesado', 'rapido', 'pesado']];
const SIGHT = 22, LOSE = 36, ACTIVE = 75;
// Invasões piratas: raras e anunciadas. Intervalo em segundos depois da partida.
export const PIRATE_BALANCE = {
  firstWave: [150, 210],   // primeira invasão
  interval: [210, 330],    // entre invasões (conta só depois que a anterior acabou)
  spawnDistance: 42,       // as balsas aparecem longe o bastante para serem vistas
};
const between = ([a, b]) => a + Math.random() * (b - a);

export class Enemies {
  constructor(G) {
    this.G = G; this.list = []; this.hitMeshes = []; this.tick = 0;
    this.pirateSpawnTimer = between(PIRATE_BALANCE.firstWave); this.pirateWave = 0;
  }

  spawnForIsland(isl, _r) {
    if (isl.starter) return;
    const G = this.G, r = mulberry32(hash2(G.world.seed, Math.round(isl.x) + 9, Math.round(isl.z) - 9));
    const pool = BY_DIFF[isl.diff];
    const baseCount = isl.diff === 0 ? (r() < 0.5 ? 1 : 0) : 1 + isl.diff + ((r() * 2) | 0);
    const n = Math.max(isl.siteType === 'fort' ? 3 : 2, baseCount);
    // não nasce dentro de parede/móvel (tenta alguns pontos em volta do pátio)
    const blocked = (lx, lz) => isl.set.items.some((c) => c.type === 'box' && c.hy > 0.15 && c.y - c.hy < 1.5 && (() => {
      let [x, z] = [lx - c.x, lz - c.z]; if (c.yaw) [x, z] = rot(x, z, -c.yaw);
      return Math.abs(x) < c.hx + 0.5 && Math.abs(z) < c.hz + 0.5;
    })());
    for (let i = 0; i < n; i++) {
      const id = `${isl.id}e${i}`, type = pool[(r() * pool.length) | 0];
      let lx = isl.siteCenter[0], lz = isl.siteCenter[1];
      for (let k = 0; k < 12; k++) {
        const a = r() * 6.28, d = 0.9 + r() * (isl.siteType === 'fort' ? 2.6 : 1.8);
        const cx = isl.siteCenter[0] + Math.cos(a) * d, cz = isl.siteCenter[1] + Math.sin(a) * d;
        if (!blocked(cx, cz)) { lx = cx; lz = cz; break; }
      }
      if (G.world.collected.has(id)) continue;
      this.spawn(id, type, isl, isl.x + lx, isl.z + lz);
    }
  }
  spawn(id, type, isl, x, z) {
    const def = ENEMY_TYPES[type];
    const mesh = makeEnemyPill(type); // pílula malvada (visual por tipo)
    mesh.scale.setScalar(def.scale);
    mesh.rotation.order = 'YXZ';
    const e = {
      id, type, def, isl, mesh, hp: def.hp, state: 'idle', timer: 1 + Math.random() * 3, cd: 0, yaw: 0, goal: null, moving: false,
      pirate: false,
      body: { pos: new THREE.Vector3(x, isl ? isl.set.y + 1.2 : 1.2, z), vel: new THREE.Vector3(), radius: 0.35, height: 1.7 * def.scale, grounded: false, groundSet: null },
    };
    e.mats = new Set();
    mesh.traverse((o) => { if (o.isMesh) { o.userData.enemy = e; this.hitMeshes.push(o); e.mats.add(o.material); } });
    e.hitT = 0; e.deathT = 0; e.deathSide = Math.random() < 0.5 ? 1 : -1;
    mesh.position.copy(e.body.pos);
    this.G.scene.add(mesh);
    this.list.push(e);
    if (isl) isl.enemies.push(e);
    return e;
  }
  remove(e) {
    if (this.G.melee) this.G.melee.tokens.delete(e);
    this.G.scene.remove(e.mesh);
    this._removeHook(e);
    this._removeRaft(e);
    e.mesh.traverse((o) => { if (o.isMesh) { const i = this.hitMeshes.indexOf(o); if (i >= 0) this.hitMeshes.splice(i, 1); } });
    const i = this.list.indexOf(e); if (i >= 0) this.list.splice(i, 1);
    if (e.isl) {
      const j = e.isl.enemies.indexOf(e);
      if (j >= 0) e.isl.enemies.splice(j, 1);
    }
  }
  removeIsland(isl) { for (const e of isl.enemies.slice()) this.remove(e); isl.enemies.length = 0; }

  damage(e, n) {
    if (e.state === 'dead') return;
    e.hp -= n;
    e.hitT = 0.22;
    if (!e.pirate && e.state !== 'chase' && e.state !== 'attack') e.state = 'chase'; // levou tiro: percebe o jogador
    if (e.hp <= 0) {
      e.state = 'dead'; e.timer = 5; e.deathT = 0;
      sfx.enemyDown(e.body.pos);
      if (this.G.melee) { this.G.melee.tokens.delete(e); this.G.melee.setTell(e, null); this.G.melee.updateStars(e, 0, false); }
      this.G.world.collected.add(e.id);
      const r = Math.random();
      const loot = r < 0.4 ? { municao: 6 } : r < 0.75 ? { bandagem: 1 } : r < 0.85 ? { cartucho: 4 } : null;
      this.G.hud.msg(`${e.def.nome} derrotado` + (loot ? '  ' + this.G.survival.add(loot) : ''));
      // piratas (e às vezes saqueadores) largam o sabre
      const dropChance = e.type === 'pirata' ? 0.45 : e.type === 'melee' ? 0.12 : 0;
      if (dropChance && Math.random() < dropChance && !this.G.combat.owned.has('sabre') && this.G.combat.unlockWeapon('sabre') === true) this.G.hud.msg('Você pegou um Sabre pirata ★★★!');
    }
  }

  updatePirateWaves(dt) {
    const G = this.G;
    if (!G.startup.departed) return;
    this.pirateSpawnTimer -= dt;
    if (this.pirateSpawnTimer > 0) return;
    if (G.startup.waterLevel < 0.5) { this.pirateSpawnTimer = 20; return; } // oceano seco: sem balsas
    // Nunca junto com uma onda gigante/furacão, nem com outra invasão em andamento.
    if ((G.events && G.events.active) || (G.naval && G.naval.active) || this.list.some((e) => e.pirate && e.state !== 'dead')) {
      this.pirateSpawnTimer = 20;
      return;
    }
    const wave = this.pirateWave++;
    const count = wave === 0 ? 1 : wave < 3 ? 2 : 2 + (Math.random() < 0.4 ? 1 : 0);
    const forwardX = Math.sin(G.boat.yaw), forwardZ = Math.cos(G.boat.yaw);
    const sideX = forwardZ, sideZ = -forwardX;
    const flank = Math.random() < 0.5 ? 1 : -1, D = PIRATE_BALANCE.spawnDistance;
    for (let i = 0; i < count; i++) {
      const id = `pirate-${G.world.seed}-${wave}-${i}`;
      if (G.world.collected.has(id)) continue;
      const side = (i - (count - 1) / 2) * 4;
      this.spawnPirate(id,
        G.boat.x - forwardX * D * 0.55 + sideX * (flank * D * 0.8 + side),
        G.boat.z - forwardZ * D * 0.55 + sideZ * (flank * D * 0.8 + side));
    }
    G.hud.msg(count === 1 ? 'Uma balsa pirata se aproxima!' : `${count} balsas piratas se aproximam — prepare-se para o gancho!`);
    if (G.hud.banner) G.hud.banner('☠ PIRATAS', 'Balsas a ' + (flank > 0 ? 'bombordo' : 'estibordo') + ' — defenda a jangada!', 'pirate', 5);
    this.pirateSpawnTimer = between(PIRATE_BALANCE.interval);
  }

  spawnPirate(id, x, z) {
    const e = this.spawn(id, 'pirata', null, x, z);
    e.pirate = true;
    e.state = 'approach';
    e.body.pos.y = this.G.startup.waterLevel + 0.55;
    e.mesh.position.copy(e.body.pos);
    e.raft = this._makePirateRaft();
    this.G.scene.add(e.raft);
    return e;
  }

  _makePirateRaft() {
    const raft = new THREE.Group();
    const wood = new THREE.MeshStandardMaterial({ color: 0x6e5034, map: woodTexture(), bumpMap: woodBump(), bumpScale: 1.5, roughness: 0.95 });
    const float = new THREE.MeshStandardMaterial({ color: 0x4a3828, map: repeated(woodTexture(), 0.5, 2), roughness: 1 });
    for (const x of [-0.58, 0, 0.58]) {
      const plank = new THREE.Mesh(scaleBoxUVs(new THREE.BoxGeometry(0.52, 0.14, 3.5), 0.52, 0.14, 3.5), wood);
      plank.position.set(x, 0.24, 0);
      raft.add(plank);
    }
    for (const x of [-0.82, 0.82]) {
      const log = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 3.7, 8), float);
      log.rotation.x = Math.PI / 2;
      log.position.set(x, 0.08, 0);
      raft.add(log);
    }
    const rope = new THREE.MeshStandardMaterial({ color: 0xa48b5c, roughness: 1 });
    for (const z of [-1.3, 0, 1.3]) {
      const lash = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.05, 0.08), rope);
      lash.position.set(0, 0.32, z);
      raft.add(lash);
    }
    // Bandeirinha pirata num mastro curto.
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.035, 1.6, 6), float);
    pole.position.set(-0.6, 1.1, -1.4);
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.38, 6, 1),
      new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 1, side: THREE.DoubleSide }));
    flag.position.set(-0.3, 1.7, -1.4);
    const skull = new THREE.Mesh(new THREE.CircleGeometry(0.07, 8), new THREE.MeshBasicMaterial({ color: 0xe8e2d0, side: THREE.DoubleSide }));
    skull.position.set(0, 0, 0.002);
    flag.add(skull);
    raft.add(pole, flag);
    raft.userData.flag = flag;
    raft.userData.flagBase = flag.geometry.attributes.position.array.slice();
    // Remo: gira em volta do pirata enquanto ele rema.
    const oar = new THREE.Group();
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 2.2, 6), wood);
    shaft.rotation.z = Math.PI / 2;
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.03, 0.2), wood);
    blade.position.x = 1.15;
    oar.add(shaft, blade);
    oar.position.set(0, 1.0, 0.3);
    raft.add(oar);
    raft.userData.oar = oar;
    return raft;
  }

  // Balsa acompanha as ondas (altura + inclinação) e o pirata rema ajoelhado.
  _rideRaft(e, dt) {
    const p = e.body.pos, t = clock();
    const fx = Math.sin(e.yaw), fz = Math.cos(e.yaw);
    const h = Math.max(waveHeight(p.x, p.z, t), this.G.world.seabedHeight(p.x, p.z) + 0.15); // no seco a balsa fica na areia
    const hf = waveHeight(p.x + fx * 1.6, p.z + fz * 1.6, t), hb = waveHeight(p.x - fx * 1.6, p.z - fz * 1.6, t);
    const hr = waveHeight(p.x + fz * 0.9, p.z - fx * 0.9, t), hl = waveHeight(p.x - fz * 0.9, p.z + fx * 0.9, t);
    p.y = h + 0.3;
    if (e.raft) {
      const raft = e.raft;
      raft.rotation.order = 'YXZ';
      raft.position.set(p.x, h - 0.12, p.z);
      raft.rotation.set(-Math.atan2(hf - hb, 3.2) * 0.9, e.yaw, Math.atan2(hr - hl, 1.8) * 0.9);
      const oar = raft.userData.oar;
      e.rowT = (e.rowT || 0) + dt * 3.4;
      if (oar) {
        oar.rotation.y = Math.sin(e.rowT) * 0.7;
        oar.rotation.z = 0.25 + Math.cos(e.rowT) * 0.2;
      }
      const flag = raft.userData.flag;
      if (flag) {
        const a = flag.geometry.attributes.position, b = raft.userData.flagBase;
        for (let i = 0; i < a.count; i++) {
          const x = b[i * 3] + 0.3;
          a.array[i * 3 + 2] = Math.sin(t * 7 + x * 9) * 0.06 * x;
        }
        a.needsUpdate = true;
      }
      e.mesh.rotation.order = 'YXZ';
      e.mesh.rotation.x = raft.rotation.x;
      e.mesh.rotation.z = raft.rotation.z;
    }
    e.mesh.position.copy(p);
    e.mesh.rotation.y = e.yaw;
    animateEnemy(e.mesh, 0, dt, 'row', (e.rowT % (Math.PI * 2)) / (Math.PI * 2));
  }

  // Reação a dano: tranco para trás + brilho vermelho rápido.
  _animateHit(e, dt) {
    if (e.hitT <= 0 && !e.hitGlow) return;
    e.hitT = Math.max(0, e.hitT - dt);
    const k = e.hitT / 0.22;
    for (const m of e.mats) if (m.emissive) { m.emissive.setRGB(0.9 * k, 0.1 * k, 0.05 * k); }
    e.hitGlow = k > 0;
    const parts = e.mesh.userData.parts;
    if (parts) { parts.torso.rotation.x -= Math.sin(k * Math.PI) * 0.45; parts.head.rotation.x -= Math.sin(k * Math.PI) * 0.3; }
  }

  // Morte: tomba de lado com quique, afunda e some aos poucos.
  _animateDeath(e, dt) {
    e.deathT += dt;
    const t = e.deathT, fall = Math.min(1, t / 0.55);
    const ease = 1 - Math.pow(1 - fall, 3), bounce = fall >= 1 ? Math.sin(Math.min(1, (t - 0.55) / 0.35) * Math.PI) * 0.12 : 0;
    e.mesh.rotation.x = (-Math.PI / 2 + bounce) * ease;
    e.mesh.rotation.z = e.deathSide * 0.25 * ease;
    const parts = e.mesh.userData.parts;
    if (parts && t < 0.6) {
      parts.armL.rotation.x = parts.armR.rotation.x = -2.2 * ease;
      parts.legL.rotation.x = -0.3 * ease; parts.legR.rotation.x = 0.2 * ease;
      parts.kneeL.rotation.x = parts.kneeR.rotation.x = 0.4 * ease;
    }
    if (t > 3.2) {
      const fade = Math.max(0, 1 - (t - 3.2) / 1.6);
      e.mesh.position.y -= dt * 0.35;
      for (const m of e.mats) { m.transparent = true; m.opacity = fade; }
    }
    if (e.raft) {
      e.raft.position.y -= dt * 0.25;
      e.raft.rotation.z += dt * 0.15 * e.deathSide;
    }
    e.timer -= dt;
    if (e.timer <= 0) this.remove(e);
  }

  _findPirateLanding(p, boat) {
    const [px, pz] = boat.toLocal(p.x, p.z);
    let best = null, bestDistance = Infinity;
    for (const collider of boat.set.items) {
      if (collider.type === 'cyl' && collider.hy > 1.5) continue;
      const yaw = collider.yaw || 0;
      const [dx, dz] = rot(px - collider.x, pz - collider.z, -yaw);
      let qx, qz;
      if (collider.type === 'cyl') {
        const distance = Math.hypot(dx, dz);
        const radius = Math.max(0.05, collider.hx - 0.18);
        const scale = distance > collider.hx ? radius / distance : 1;
        qx = dx * scale; qz = dz * scale;
      } else {
        qx = clamp(dx, -collider.hx, collider.hx);
        qz = clamp(dz, -collider.hz, collider.hz);
        if (Math.abs(dx) > collider.hx || Math.abs(dz) > collider.hz) {
          const distance = Math.hypot(qx, qz);
          const inset = Math.min(0.25, collider.hx * 0.4, collider.hz * 0.4);
          if (distance > 1e-5) {
            qx *= (distance - inset) / distance;
            qz *= (distance - inset) / distance;
          }
        }
      }
      const [ox, oz] = rot(qx, qz, yaw);
      const x = collider.x + ox, z = collider.z + oz;
      const distance = Math.hypot(px - x, pz - z);
      if (distance >= bestDistance) continue;
      let y = collider.y + collider.hy;
      if (collider.type === 'ramp') {
        y = collider.y - collider.hy +
          ((clamp(qz, -collider.hz, collider.hz) + collider.hz) / (2 * collider.hz)) * 2 * collider.hy;
      }
      best = { x, z, y: y + 0.04, distance };
      bestDistance = distance;
    }
    return best;
  }

  _startPirateGrapple(e, landing = this._findPirateLanding(e.body.pos, this.G.boat)) {
    const boat = this.G.boat, p = e.body.pos;
    const [lx, lz] = boat.toLocal(p.x, p.z);
    const length = Math.hypot(lx, lz) || 1;
    const targetRadius = Math.max(1.7, Math.min(boat.set.radius - 0.65, 3.8));
    e.grapple = {
      from: p.clone(),
      local: landing
        ? { x: landing.x, z: landing.z, y: landing.y }
        : { x: lx / length * targetRadius, z: lz / length * targetRadius, y: 0.3 },
      elapsed: 0,
      duration: 0.72,
    };
    e.state = 'grapple';

    const positions = new Float32Array(6);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const line = new THREE.Line(geometry, new THREE.LineBasicMaterial({ color: 0x59462f }));
    line.frustumCulled = false;
    const hook = new THREE.Group();
    const metal = new THREE.MeshStandardMaterial({ color: 0x969da0, metalness: 0.7, roughness: 0.4 });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.035, 6, 10, Math.PI * 1.55), metal);
    ring.rotation.x = Math.PI / 2;
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.28, 6), metal);
    stem.rotation.z = Math.PI / 2;
    hook.add(ring, stem);
    this.G.scene.add(line, hook);
    e.hookVisual = { line, hook };
  }

  _updateHookVisual(e, progress) {
    if (!e.hookVisual) return;
    const p = e.body.pos, boat = this.G.boat, local = e.grapple.local;
    const start = new THREE.Vector3(
      p.x + Math.cos(e.yaw) * 0.3, p.y + 1.25, p.z - Math.sin(e.yaw) * 0.3
    );
    const [x, z] = boat.toWorld(local.x, local.z);
    const target = new THREE.Vector3(x, boat.set.y + local.y, z);
    e.hookVisual.hook.position.lerpVectors(start, target, Math.min(1, progress * 1.8));
    const positions = e.hookVisual.line.geometry.attributes.position;
    positions.setXYZ(0, start.x, start.y, start.z);
    positions.setXYZ(1, e.hookVisual.hook.position.x, e.hookVisual.hook.position.y, e.hookVisual.hook.position.z);
    positions.needsUpdate = true;
    e.hookVisual.line.geometry.computeBoundingSphere();
  }

  _removeHook(e) {
    if (!e.hookVisual) return;
    const { line, hook } = e.hookVisual;
    this.G.scene.remove(line, hook);
    line.geometry.dispose();
    line.material.dispose();
    hook.traverse((o) => {
      if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); }
    });
    e.hookVisual = null;
  }

  _removeRaft(e) {
    if (!e.raft) return;
    this.G.scene.remove(e.raft);
    e.raft.traverse((o) => {
      if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); }
    });
    e.raft = null;
  }

  updatePirate(e, dt) {
    const G = this.G, boat = G.boat, b = e.body, p = b.pos, pp = G.player.body.pos;
    if (e.state === 'dead') { this._animateDeath(e, dt); return; }
    e.cd -= dt;
    if (e.state === 'approach') {
      const dx = boat.x - p.x, dz = boat.z - p.z, centerDistance = Math.hypot(dx, dz) || 1;
      const landing = this._findPirateLanding(p, boat);
      const distance = landing ? landing.distance : centerDistance;
      e.yaw = lerpAngle(e.yaw, Math.atan2(dx, dz), Math.min(1, 8 * dt));
      if (distance <= 8) {
        this._startPirateGrapple(e, landing);
        return;
      }
      const speed = e.def.raftSpeed || e.def.speed;
      p.x += dx / centerDistance * speed * dt;
      p.z += dz / centerDistance * speed * dt;
      this._rideRaft(e, dt);
      return;
    }
    if (e.state === 'grapple') {
      const action = e.grapple;
      action.elapsed += dt;
      const progress = Math.min(1, action.elapsed / action.duration);
      const [x, z] = boat.toWorld(action.local.x, action.local.z);
      const targetY = boat.set.y + action.local.y;
      p.set(
        action.from.x + (x - action.from.x) * progress,
        action.from.y + (targetY - action.from.y) * progress + Math.sin(progress * Math.PI) * 2.4,
        action.from.z + (z - action.from.z) * progress
      );
      this._updateHookVisual(e, progress);
      e.mesh.position.copy(p);
      e.mesh.rotation.y = e.yaw;
      e.mesh.rotation.x = -Math.sin(progress * Math.PI) * 0.35;
      e.mesh.rotation.z = 0;
      animateEnemy(e.mesh, 0, dt, 'leap', progress);
      if (progress >= 1) {
        e.mesh.rotation.x = 0;
        p.set(x, targetY, z);
        e.local = { ...action.local };
        e.body.vel.set(0, 0, 0);
        e.body.grounded = true;
        e.body.groundSet = boat.set;
        e.state = 'boarded';
        this._removeHook(e);
        this._removeRaft(e);
      }
      return;
    }
    if (e.state !== 'boarded') return;

    const [playerX, playerZ] = boat.toLocal(pp.x, pp.z);
    const dx = playerX - e.local.x, dz = playerZ - e.local.z, distance = Math.hypot(dx, dz);
    let moved = 0;
    const mres = G.melee ? G.melee.enemyTick(e, dt, Math.hypot(pp.x - p.x, pp.z - p.z)) : null; // aviso/golpe/guarda
    if (e.knock) [e.local.x, e.local.z] = boat.toLocal(p.x, p.z);
    if (!G.player.dead && !G.player.downed && distance > e.def.range * 0.7 && !(mres && mres.hold)) {
      moved = Math.min(distance - e.def.range * 0.7, e.def.speed * dt);
      e.local.x += dx / distance * moved;
      e.local.z += dz / distance * moved;
      const radius = Math.max(1.5, Math.min(boat.set.radius - 0.75, 3.8));
      const localLength = Math.hypot(e.local.x, e.local.z);
      if (localLength > radius) {
        e.local.x *= radius / localLength;
        e.local.z *= radius / localLength;
      }
    }
    const [x, z] = boat.toWorld(e.local.x, e.local.z);
    const previousY = p.y;
    p.set(x, boat.set.y + e.local.y, z);
    b.vel.y = Math.max(b.vel.y - CFG.gravity * dt, -20);
    p.y += b.vel.y * dt;
    G.colliders.resolve(b, previousY);
    [e.local.x, e.local.z] = boat.toLocal(p.x, p.z);
    e.local.y = p.y - boat.set.y;
    if (p.y < boat.set.y - 0.5) {
      e.state = 'approach';
      p.y = G.startup.waterLevel + 0.55;
      b.vel.set(0, 0, 0);
      b.grounded = false;
      b.groundSet = null;
      e.raft = this._makePirateRaft();
      G.scene.add(e.raft);
      this._rideRaft(e, 0);
      return;
    }
    const pdx = pp.x - p.x, pdz = pp.z - p.z, playerDistance = Math.hypot(pdx, pdz);
    e.yaw = lerpAngle(e.yaw, Math.atan2(pdx, pdz), Math.min(1, 8 * dt));
    void playerDistance;
    e.mesh.position.copy(p);
    e.mesh.rotation.y = e.yaw;
    animateEnemy(e.mesh, dt > 0 ? moved / dt : 0, dt, mres ? mres.pose : 'walk', mres ? mres.progress || 0 : 0);
    this._animateHit(e, dt);
    if (e.swing > 0) e.swing = Math.max(0, e.swing - dt);
  }

  // Linha de visão do olho do inimigo até o peito do jogador (paredes, troncos, terreno bloqueiam)
  hasLos(e, h = 1.35) {
    const p = e.body.pos, pp = this.G.player.body.pos;
    return !this.G.colliders.segmentBlocked(p.x, p.y + h * e.def.scale, p.z, pp.x, pp.y + 1.15, pp.z);
  }

  // Próximo ponto do caminho até (tx, tz): sai pelos cômodos onde está (do menor para o maior) e
  // entra pelos cômodos do alvo (do maior para o menor), sempre pela porta/portão.
  route(e, tx, tz) {
    const isl = e.isl, p = e.body.pos;
    if (!isl || !isl.rooms || !isl.rooms.length) return [tx, tz];
    const W = (pt) => [pt[0] + isl.x, pt[1] + isl.z];
    const rooms = isl.rooms.map((rm) => ({ rm, w: { ...rm, x: rm.x + isl.x, z: rm.z + isl.z }, size: rm.hw * rm.hd }));
    const exits = rooms.filter((o) => inRoom(o.w, p.x, p.z) && !inRoom(o.w, tx, tz)).sort((a, b) => a.size - b.size);
    const entries = rooms.filter((o) => !inRoom(o.w, p.x, p.z) && inRoom(o.w, tx, tz)).sort((a, b) => b.size - a.size);
    const go = exits[0] ? { o: exits[0], out: true } : entries[0] ? { o: entries[0], out: false } : null;
    if (!go) return [tx, tz];
    const [inner, outer] = go.o.rm.door.map(W), near = go.out ? inner : outer, far = go.out ? outer : inner;
    return Math.hypot(p.x - near[0], p.z - near[1]) < 1.0 ? far : near;
  }

  think(e, dist, pdx, pdz) {
    const def = e.def, alive = !this.G.player.dead && !this.G.player.downed; // caído: inimigos perdem o interesse
    e.los = dist < SIGHT + 4 ? this.hasLos(e) : false;
    switch (e.state) {
      case 'idle': case 'patrol': case 'search':
        if (alive && dist < SIGHT && (e.los || dist < 5)) { e.state = 'chase'; break; }
        if (e.state === 'patrol') { if (!e.goal || Math.hypot(e.goal[0] - e.body.pos.x, e.goal[1] - e.body.pos.z) < 1) { e.state = 'idle'; e.timer = 2 + Math.random() * 3; } }
        else if (e.timer <= 0) {
          const a = Math.random() * 6.28, d = Math.random() * (e.isl.R - 2);
          e.goal = [e.isl.x + Math.cos(a) * d, e.isl.z + Math.sin(a) * d]; e.state = 'patrol';
        }
        break;
      case 'chase': case 'attack': case 'retreat':
        if (!alive || dist > LOSE) { e.state = 'search'; e.timer = 3; e.goal = null; break; }
        if (def.ranged && dist < 6 && e.los) { e.state = 'retreat'; e.goal = [e.body.pos.x - pdx * 6, e.body.pos.z - pdz * 6]; }
        else if (dist < def.range && e.los) e.state = 'attack';
        else { e.state = 'chase'; e.goal = this.route(e, this.G.player.body.pos.x, this.G.player.body.pos.z); }
        break;
    }
  }

  update(dt) {
    const G = this.G, pp = G.player.body.pos;
    this.updatePirateWaves(dt);
    this.tick += dt;
    const thinkNow = this.tick > 0.2;
    if (thinkNow) this.tick = 0;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const e = this.list[i], b = e.body, p = b.pos;
      if (e.pirate) {
        this.updatePirate(e, dt);
        continue;
      }
      let pdx = pp.x - p.x, pdz = pp.z - p.z;
      const dist = Math.hypot(pdx, pdz) || 1;
      if (dist > ACTIVE) continue; // longe: dormindo
      pdx /= dist; pdz /= dist;
      if (e.state === 'dead') { this._animateDeath(e, dt); continue; }
      e.timer -= dt; e.cd -= dt;
      if (thinkNow) this.think(e, dist, pdx, pdz);

      let mx = 0, mz = 0;
      if ((e.state === 'chase' || e.state === 'patrol' || e.state === 'retreat') && e.goal) {
        const gx = e.goal[0] - p.x, gz = e.goal[1] - p.z, gl = Math.hypot(gx, gz);
        if (gl > 0.3) { const sp = e.state === 'patrol' ? e.def.speed * 0.4 : e.def.speed; mx = (gx / gl) * sp; mz = (gz / gl) * sp; }
        // Preso atrás de uma parede? Contorna de lado por um instante (sem pathfinding ainda).
        if (thinkNow && e.state === 'chase') {
          e.stuck = Math.hypot(p.x - (e.lx ?? p.x), p.z - (e.lz ?? p.z)) < 0.15 ? (e.stuck || 0) + 1 : 0;
          e.lx = p.x; e.lz = p.z;
          if (e.stuck >= 3) { e.stuck = 0; e.sideT = 1.3; e.sideDir = Math.random() < 0.5 ? 1 : -1; }
        }
        if (e.sideT > 0) { e.sideT -= dt; const t2 = mx; mx = -mz * e.sideDir; mz = t2 * e.sideDir; }
      }
      // corpo a corpo: aviso -> golpe -> recuperação, guarda, atordoamento (sistema Melee)
      let mres = null;
      if (!e.def.ranged && dist < 7 && G.melee) mres = G.melee.enemyTick(e, dt, dist);
      if (e.state === 'chase' && e.goal && e.los === false && thinkNow) e.goal = this.route(e, pp.x, pp.z);
      if (mres && mres.hold) { mx = 0; mz = 0; }
      else if (!e.def.ranged && dist < 3.6 && e.los !== false && (e.state === 'chase' || e.state === 'attack')) {
        // esperando a vez: rodeia o jogador mantendo distância
        e.strafeDir = e.strafeDir || (Math.random() < 0.5 ? 1 : -1);
        if (thinkNow && Math.random() < 0.08) e.strafeDir *= -1;
        const sp = e.def.speed * 0.42, radial = (dist - 2.0) * 1.6;
        mx = -pdz * e.strafeDir * sp + pdx * radial; mz = pdx * e.strafeDir * sp + pdz * radial;
      }
      if (e.state === 'attack' && e.cd <= 0 && e.def.ranged && e.los) {
        e.cd = e.def.cd;
        const hit = Math.random() < 0.6 - dist * 0.015;
        G.combat.tracer(new THREE.Vector3(p.x, p.y + 1.3, p.z), new THREE.Vector3(pp.x + (hit ? 0 : 1.2), pp.y + 1.2, pp.z), 0xffb060);
        if (hit) G.survival.damage(e.def.dmg, e.def.nome);
        e.swing = 0.25;
      }
      // Movimento + colisão (o mesmo resolvedor do jogador). Não saem da ilha.
      const prevY = p.y;
      b.vel.y = Math.max(b.vel.y - CFG.gravity * dt, -20);
      p.x += mx * dt; p.z += mz * dt; p.y += b.vel.y * dt;
      const ix = p.x - e.isl.x, iz = p.z - e.isl.z, il = Math.hypot(ix, iz), maxR = e.isl.R - 0.6;
      if (il > maxR) { p.x = e.isl.x + (ix / il) * maxR; p.z = e.isl.z + (iz / il) * maxR; }
      G.colliders.resolve(b, prevY);
      if (p.y < -3) { p.y = 1.5; b.vel.y = 0; }

      const facePlayer = e.state === 'chase' || e.state === 'attack' || e.state === 'retreat';
      if (facePlayer) e.yaw = lerpAngle(e.yaw, Math.atan2(pdx, pdz), Math.min(1, 8 * dt));
      else if (mx || mz) e.yaw = lerpAngle(e.yaw, Math.atan2(mx, mz), Math.min(1, 8 * dt));
      e.mesh.position.copy(p);
      e.mesh.rotation.y = e.yaw;
      const pose = mres ? mres.pose : e.swing > 0 ? 'attack' : e.def.ranged && facePlayer ? 'aim' : 'walk';
      const swingProgress = mres ? mres.progress || 0 : e.swing > 0 ? 1 - e.swing / 0.25 : 0;
      animateEnemy(e.mesh, Math.hypot(mx, mz), dt, pose, swingProgress);
      this._animateHit(e, dt);
      if (e.swing > 0) e.swing = Math.max(0, e.swing - dt);
    }
  }
}
