// Cerco aos fortes de sucata:
//   • TORRES de andaime com um inimigo de MORTEIRO em cima. A bala de canhão que acerta a torre
//     tira vida dela; zerou, a torre tomba para o lado do tiro, bate no chão e se desmancha em
//     chapas voando (o morteiro cai junto). Fica derrubada para sempre (marcada como coletada).
//   • MORTEIRO: dispara granadas em arco alto contra o jogador (mira onde a jangada VAI estar),
//     com um anel vermelho no chão/água avisando onde vai cair e o assobio da descida.
//     A explosão machuca quem estiver perto e danifica as peças da jangada.
import * as THREE from '../three.js';
import { waveHeight } from '../world/ocean.js';
import { sfx } from '../core/sfx.js';

export const SIEGE = {
  towerHp: 100,
  ballDmg: [34, 44],          // dano de cada bala de canhão na torre (3 acertos derrubam)
  splashTower: 2.6,           // bala que explode perto da torre também machuca (metade)
  mortar: { range: 80, minRange: 18, cd: [5.5, 8], flight: [2.6, 4.2], scatter: 3.2, radius: 3.6, dmg: 30 },
};

const _v = new THREE.Vector3(), _a = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0);

export class Siege {
  constructor(G) {
    this.G = G;
    this.towers = new Map();       // id → torre
    this.falling = [];             // torres tombando
    this.debris = [];              // chapas voando depois da queda
    this.shells = [];              // granadas de morteiro
    this.shellGeo = new THREE.SphereGeometry(0.13, 10, 8);
    this.shellMat = new THREE.MeshStandardMaterial({ color: 0x2a2a20, metalness: 0.5, roughness: 0.5 });
    this.ringGeo = new THREE.RingGeometry(0.75, 1, 40).rotateX(-Math.PI / 2);
  }

  // ---------- torres ----------
  addTowers(isl) {
    for (const t of isl.towers) { t.isl = isl; t.hp = SIEGE.towerHp; this.towers.set(t.id, t); }
  }
  removeIsland(isl) {
    for (const t of isl.towers || []) this.towers.delete(t.id);
    this.falling = this.falling.filter((f) => f.t.isl !== isl);
  }
  // ponto (mundo) está dentro de alguma torre de pé?
  hitTower(p) {
    for (const t of this.towers.values()) {
      if (t.down) continue;
      const isl = t.isl, x = isl.x + t.lx, z = isl.z + t.lz, y0 = isl.set.y + 0.55;
      if (p.y < y0 - 0.2 || p.y > y0 + t.top + 1.3) continue;
      if (Math.hypot(p.x - x, p.z - z) < t.r + 0.2) return t;
    }
    return null;
  }
  towerTop(t) { return new THREE.Vector3(t.isl.x + t.lx, t.isl.set.y + 0.55 + t.top + 0.2, t.isl.z + t.lz); }

  // explosão de bala de canhão em (p): acerto direto (t) ou estilhaços nas torres próximas
  cannonImpact(p, vel, direct) {
    const list = direct ? [[direct, 1]] : [];
    if (!direct) for (const t of this.towers.values()) {
      if (t.down) continue;
      const d = Math.hypot(p.x - (t.isl.x + t.lx), p.z - (t.isl.z + t.lz));
      if (d < t.r + SIEGE.splashTower) list.push([t, 0.5]);
    }
    for (const [t, k] of list) {
      const dmg = Math.round((SIEGE.ballDmg[0] + Math.random() * (SIEGE.ballDmg[1] - SIEGE.ballDmg[0])) * k);
      const dir = [Math.round((vel ? vel.x : 0) * 10) / 10, Math.round((vel ? vel.z : 1) * 10) / 10];
      this.damageTower(t.id, dmg, dir);
      this.G.net.send({ t: 'naval', k: 'tower', id: t.id, dmg, dir });
    }
  }
  receive(m) { if (typeof m.id === 'string' && Number.isFinite(m.dmg)) this.damageTower(m.id, m.dmg, Array.isArray(m.dir) ? m.dir : [0, 1]); }

  damageTower(id, dmg, dir) {
    const t = this.towers.get(id); if (!t || t.down) return;
    t.hp -= dmg;
    sfx.metalHit(this.towerTop(t));
    // a torre balança com o impacto
    t.wobble = (t.wobble || 0) + 0.06;
    const G = this.G;
    if (G.melee) G.melee.num(this.towerTop(t), Math.max(0, Math.round(t.hp)) + '%', t.hp > 0 ? '#ffd166' : '#ff6a3a', t.hp > 0 ? 'TORRE' : 'DESABOU');
    if (t.hp <= 0) this.collapse(t, dir);
  }

  collapse(t, dir) {
    const G = this.G, isl = t.isl;
    t.down = true;
    // colisores somem (do conjunto da ilha, da lista usada pela maré e da física)
    const drop = (arr) => { for (const it of t.items) { const i = arr.indexOf(it); if (i >= 0) arr.splice(i, 1); } };
    drop(isl.set.items); drop(isl.allItems);
    G.physics.removeStaticSet(isl.set); G.physics.addStaticSet(isl.set);
    for (const m of t.solids) { let i = G.solids.indexOf(m); if (i >= 0) G.solids.splice(i, 1); i = isl.solids.indexOf(m); if (i >= 0) isl.solids.splice(i, 1); }
    G.world.collected.add(t.id); G.net.send({ t: 'collect', id: t.id });
    // tomba para o lado em que o tiro empurrou (eixo de giro horizontal, na base)
    let dx = dir[0], dz = dir[1]; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
    const axis = new THREE.Vector3(dz, 0, -dx).normalize();
    const g = t.group;
    g.updateMatrixWorld(true);
    // o pivô do grupo já é a base da torre
    this.falling.push({ t, axis, q0: g.quaternion.clone(), ang: 0.02, w: 0.25, dx, dz });
    // o artilheiro do morteiro cai junto
    for (const e of G.enemies.list) {
      if (e.tower === t && e.state !== 'dead') {
        e.body.vel.set(dx * 7, 4, dz * 7); e.flung = { vx: dx * 6, vz: dz * 6, vy: 5 };
        G.enemies.damage(e, 9999);
      }
    }
    sfx.collapse(this.towerTop(t));
    G.hud.msg('Torre de sucata derrubada!');
  }

  _updateFalling(dt) {
    const G = this.G;
    for (const f of this.falling.slice()) {
      const g = f.t.group, h = f.t.top;
      // pêndulo invertido: aceleração cresce com o seno do ângulo
      f.w += (3 * 9.8 / (2 * h)) * Math.sin(f.ang) * dt; f.ang += f.w * dt;
      g.quaternion.copy(f.q0).premultiply(new THREE.Quaternion().setFromAxisAngle(f.axis, Math.min(f.ang, Math.PI / 2)));
      if (f.ang >= Math.PI / 2 - 0.05) {
        this.falling.splice(this.falling.indexOf(f), 1);
        this._shatter(f);
      }
    }
    // chapas e canos voando depois da queda
    for (const d of this.debris.slice()) {
      d.t += dt;
      d.v.y -= 9.8 * dt; d.m.position.addScaledVector(d.v, dt);
      d.m.rotateOnAxis(d.ax, d.spin * dt);
      if (d.m.position.y < d.floor) { d.m.position.y = d.floor; d.v.multiplyScalar(0.3); d.v.y = Math.abs(d.v.y) * 0.25; d.spin *= 0.4; }
      if (d.t > 5) { d.m.position.y -= dt * 0.4; if (d.t > 7) { d.m.parent && d.m.parent.remove(d.m); this.debris.splice(this.debris.indexOf(d), 1); } }
    }
    void G;
  }

  _shatter(f) {
    const G = this.G, t = f.t, g = t.group, isl = t.isl, floor = isl.set.y + 0.6;
    g.updateMatrixWorld(true);
    const center = new THREE.Vector3(isl.x + t.lx + f.dx * t.top * 0.6, floor, isl.z + t.lz + f.dz * t.top * 0.6);
    // poeira, faíscas e estrondo onde a torre bateu
    if (G.naval) {
      G.naval.boom.spawn(center, 1.1);
      for (let i = 0; i < 40; i++) {
        const k = Math.random() * t.top;
        G.naval.smoke.emit(isl.x + t.lx + f.dx * k, floor + 0.3, isl.z + t.lz + f.dz * k, (Math.random() - 0.5) * 3, 0.6 + Math.random() * 1.6, (Math.random() - 0.5) * 3, 2.5 + Math.random() * 2, 1.6, -0.1, 2.5);
      }
    }
    sfx.explosion(center, 0.8);
    if (G.events) G.events.shake = Math.max(G.events.shake, Math.max(0, 0.5 - G.camera.position.distanceTo(center) / 120));
    // cada pedaço sai voando do lugar onde estava
    const parts = [];
    g.traverse((o) => { if (o.isMesh) parts.push(o); });
    for (const o of parts) {
      const wp = o.getWorldPosition(new THREE.Vector3()), wq = o.getWorldQuaternion(new THREE.Quaternion());
      G.scene.add(o); o.position.copy(wp); o.quaternion.copy(wq);
      this.debris.push({
        m: o, t: Math.random() * 0.5, floor: floor + 0.05,
        v: new THREE.Vector3(f.dx * (2 + Math.random() * 3) + (Math.random() - 0.5) * 4, 2 + Math.random() * 5, f.dz * (2 + Math.random() * 3) + (Math.random() - 0.5) * 4),
        ax: new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize(), spin: (Math.random() - 0.5) * 9,
      });
    }
    g.parent && g.parent.remove(g);
  }

  // ---------- morteiro ----------
  // e = inimigo morteiro; atira na posição prevista do jogador
  mortarShot(e) {
    const G = this.G, pl = G.player, M = SIEGE.mortar;
    const o = e.body.pos.clone(); o.y += 1.4;
    const pp = pl.body.pos, d = Math.hypot(pp.x - o.x, pp.z - o.z);
    const T = M.flight[0] + (M.flight[1] - M.flight[0]) * Math.min(1, d / M.range);
    // mira à frente: onde a jangada vai estar quando a granada cair
    const target = new THREE.Vector3(pp.x, pp.y, pp.z);
    if (pl.aboard || pl.body.carrier === G.boat.set) { target.x += Math.sin(G.boat.yaw) * G.boat.speed * T; target.z += Math.cos(G.boat.yaw) * G.boat.speed * T; }
    const sc = M.scatter * (0.4 + Math.random() * 0.8), a = Math.random() * 6.28;
    target.x += Math.cos(a) * sc; target.z += Math.sin(a) * sc;
    target.y = Math.max(target.y, waveHeight(target.x, target.z, G.naval ? G.naval.t || 0 : 0));
    const v = new THREE.Vector3((target.x - o.x) / T, (target.y - o.y) / T + 0.5 * 9.8 * T, (target.z - o.z) / T);
    const mesh = new THREE.Mesh(this.shellGeo, this.shellMat); mesh.position.copy(o); G.scene.add(mesh);
    const ring = new THREE.Mesh(this.ringGeo, new THREE.MeshBasicMaterial({ color: 0xff3b2b, transparent: true, opacity: 0.0, depthWrite: false, side: THREE.DoubleSide }));
    ring.scale.setScalar(M.radius); ring.position.copy(target); ring.position.y += 0.15; G.scene.add(ring);
    this.shells.push({ pos: o.clone(), vel: v, t: 0, T, mesh, ring, target, whistled: false });
    sfx.mortar(o);
    if (G.naval) for (let i = 0; i < 10; i++) G.naval.smoke.emit(o.x, o.y + 0.5, o.z, (Math.random() - 0.5), 1 + Math.random() * 1.5, (Math.random() - 0.5), 1.8, 0.9, -0.2, 2);
    e.swing = 0.3;
  }

  _updateShells(dt, t) {
    const G = this.G, M = SIEGE.mortar;
    for (const s of this.shells.slice()) {
      s.t += dt;
      const prev = _a.copy(s.pos);
      s.vel.y -= 9.8 * dt; s.pos.addScaledVector(s.vel, dt);
      s.mesh.position.copy(s.pos);
      // anel de aviso pulsando cada vez mais forte
      const k = Math.min(1, s.t / s.T);
      s.ring.material.opacity = 0.25 + 0.6 * k * (0.6 + 0.4 * Math.sin(s.t * 18));
      s.ring.position.y = s.target.y + 0.15;
      if (!s.whistled && s.T - s.t < 1.5) { s.whistled = true; sfx.whistle(s.target, Math.max(0.4, s.T - s.t)); }
      if (G.naval && Math.random() < 0.5) G.naval.smoke.emit(s.pos.x, s.pos.y, s.pos.z, 0, 0.2, 0, 0.5, 0.25, 0, 1.2);
      const descending = s.vel.y < 0;
      let hit = s.t > s.T + 3;
      if (descending && G.naval && G.naval._hitRaft(s.pos)) hit = true;
      if (!hit && descending && G.colliders.segmentBlocked(prev.x, prev.y, prev.z, s.pos.x, s.pos.y, s.pos.z, 0)) hit = true;
      if (!hit && s.pos.y < waveHeight(s.pos.x, s.pos.z, t)) hit = true;
      if (hit) this._explode(s, M);
    }
  }
  _explode(s, M) {
    const G = this.G, p = s.pos;
    G.scene.remove(s.mesh); G.scene.remove(s.ring); s.ring.material.dispose();
    this.shells.splice(this.shells.indexOf(s), 1);
    const water = p.y <= waveHeight(p.x, p.z, G.naval ? G.naval.t || 0 : 0) + 0.2 && !G.naval._hitRaft(p);
    if (water) { sfx.splash(p, true); if (G.naval) for (let i = 0; i < 22; i++) { const a = Math.random() * 6.28, r = Math.random(); G.naval.splash.emit(p.x, p.y, p.z, Math.cos(a) * 2 * r, 5 + Math.random() * 6, Math.sin(a) * 2 * r, 1, 0.5, 14); } }
    else { G.naval.boom.spawn(p, 0.8); sfx.explosion(p, 0.75); }
    const pl = G.player, pp = pl.body.pos, d = Math.hypot(pp.x - p.x, pp.y + 0.9 - p.y, pp.z - p.z);
    if (!pl.dead && d < M.radius) {
      G.survival.damage(M.dmg * (1 - 0.65 * d / M.radius), 'Morteiro');
      const kx = (pp.x - p.x) / Math.max(0.5, d), kz = (pp.z - p.z) / Math.max(0.5, d);
      pl.body.vel.x += kx * 6; pl.body.vel.z += kz * 6; pl.body.vel.y = 4.5; pl.body.grounded = false;
    }
    if (d < 25) G.events.shake = Math.max(G.events.shake, 0.45 * (1 - d / 25));
    // jangada: o dono da partida aplica o dano nas peças
    if (!water && G.naval && G.naval._isHost()) { const piece = G.naval._hitRaft(p); G.naval._damageRaftAt(p, piece); }
  }

  update(dt, t) {
    this._updateFalling(dt);
    this._updateShells(dt, t);
    // torres balançando depois de levar tiro
    for (const tw of this.towers.values()) {
      if (tw.down || !tw.wobble) continue;
      tw.wobble *= Math.exp(-3 * dt); tw.wph = (tw.wph || 0) + dt * 14;
      tw.group.rotation.z = Math.sin(tw.wph) * tw.wobble * 0.5; tw.group.rotation.x = Math.cos(tw.wph * 0.8) * tw.wobble * 0.3;
      if (tw.wobble < 0.002) { tw.wobble = 0; tw.group.rotation.x = tw.group.rotation.z = 0; }
    }
    void UP; void _v;
  }
}
