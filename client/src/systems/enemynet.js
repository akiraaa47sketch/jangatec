// Multiplayer dos inimigos: o HOST simula todos (IA, golpes, tiros) e manda "fotos" 10x por segundo;
// os outros jogadores desenham RÉPLICAS (posição, pose do golpe, aviso "!", estrelinhas, balsa).
//   • Acerto de um cliente numa réplica → 'ehit' para o host (que aplica dano, alerta o grupo).
//   • Empurrão/atordoamento/choque de lâminas causados pelo cliente → 'emod' (o host aplica).
//   • Golpe/tiro do inimigo num aliado → 'pdmg' para ELE (que bloqueia/apara/esquiva do lado dele).
//   • Morte → 'edie' para todos; o loot vai só para quem matou.
//   • Tiros (traçante + som) dos jogadores e dos inimigos, e granadas de morteiro → 'fx' para todos.
//   • Criaturas dos eventos do mar são simuladas em todos (mesma semente); o dano vai por 'chit'.
// Se o host sair, o novo host "adota" as réplicas e continua a simulação.
import * as THREE from '../three.js';
import { lerpAngle } from '../core/util.js';
import { animateEnemy } from './evilpills.js';
import { ghostify } from './enemies.js';
import { sfx } from '../core/sfx.js';

const MS = ['idle', 'windup', 'strike', 'recover', 'guard', 'stagger', 'clashed', 'evade'];
const POSES = ['walk', 'aim', 'attack', 'windup', 'heavyWindup', 'kick', 'slashR', 'slashL', 'thrust', 'uppercut', 'slam', 'guard', 'stagger', 'clash', 'sidestep', 'row', 'leap', 'throw'];
const r1 = (x) => Math.round(x * 10) / 10, r2 = (x) => Math.round(x * 100) / 100;
const SEND_EVERY = 0.1, RANGE = 140;

export class EnemyNet {
  constructor(G) { this.G = G; this.acc = 0; }

  // ---------- host: fotos ----------
  update(dt) {
    const G = this.G, net = G.net;
    if (!net.online || !net.isHost || !G.started) return;
    const now = performance.now(); // relógio real: o ritmo da rede não depende do FPS
    if (now - this.acc < SEND_EVERY * 1000) return;
    this.acc = now;
    const P = G.enemies.P, boat = G.boat, l = [];
    for (const e of G.enemies.list) {
      if (e.creature || e.replica || e.state === 'dead') continue;
      const p = e.body.pos;
      if (!P.some((T) => T.pos && Math.hypot(T.pos.x - p.x, T.pos.z - p.z) < RANGE)) continue;
      // a bordo: posição relativa à jangada (não treme com a jangada andando)
      const ab = e.pirate && e.state === 'boarded';
      let x = p.x, z = p.z, y = p.y, yaw = e.yaw;
      if (ab) { [x, z] = boat.toLocal(x, z); y -= boat.set.y; yaw -= boat.yaw; }
      const ms = e.m || {}, mv = ms.move || {};
      const flags = (e.pirate ? 1 : 0) | (e.state === 'approach' ? 2 : 0) | (e.ghost ? 4 : 0) | (ab ? 8 : 0) | (e.spinning > 0 ? 16 : 0) | (e.burstLeft > 0 ? 32 : 0) | (e.heat > 0.5 ? 64 : 0);
      const wind = ms.state === 'windup' && mv.wind ? r2(1 - ms.t / mv.wind) : 0;
      l.push([e.id, e.type, r1(x), r2(y), r1(z), r2(yaw), Math.max(0, POSES.indexOf(e.netPose || 'walk')), r2(e.netProg || 0), r1(e.netSpd || 0),
        Math.round(e.hp), flags, Math.max(0, MS.indexOf(ms.state || 'idle')), (mv.heavy ? 1 : 0) | (mv.kick ? 2 : 0), wind, r2(Math.max(0, ms.t || 0)), Math.round(e.max || e.hp)]);
    }
    net.send({ t: 'ens', l });
  }

  // ---------- clientes: aplica fotos ----------
  apply(list) {
    const G = this.G, E = G.enemies, now = performance.now();
    if (E.auth) return;
    for (const a of list || []) {
      const [id, type, x, y, z, yaw, pose, prog, spd, hp, flags, msi, mvf, wind, mst, max] = a;
      let e = E.byId(id);
      if (e && e.state === 'dead') continue;
      if (!e) {
        if (G.world.collected.has(id)) continue;
        const isl = G.world.islands.find((i) => id.startsWith(i.id + 'e') || id.startsWith(i.id + 't'));
        e = E.spawn(id, type, null, x, z);
        e.replica = true; e.isl = isl || null;
        if (isl) isl.enemies.push(e);
        e.body.pos.set(x, y, z); e.yaw = yaw;
        if (flags & 4) ghostify(e);
      }
      e.net = { x, y, z, yaw, ab: !!(flags & 8) };
      e.netPose = POSES[pose] || 'walk'; e.netProg = prog; e.netSpd = spd;
      e.hp = hp; e.max = max || e.max; e.pirate = !!(flags & 1); e.seen = now;
      const ms = e.m || (e.m = {});
      ms.state = MS[msi] || 'idle'; ms.t = mst; ms.move = { heavy: !!(mvf & 1), kick: !!(mvf & 2), wind: 0.3 }; ms.wind = wind;
      if (flags & 2) { if (!e.raft) { e.raft = E._makePirateRaft(); G.scene.add(e.raft); } }
      else if (e.raft) E._removeRaft(e);
      e.rafting = !!(flags & 2); e.spinFlag = !!(flags & 16); e.fireFlag = !!(flags & 32); if (flags & 64) e.heat = Math.max(e.heat || 0, 0.8);
    }
  }

  // anima uma réplica (chamado pela lista de inimigos)
  animate(e, dt) {
    const G = this.G, E = G.enemies, boat = G.boat, n = e.net;
    if (e.state === 'dead') { E._animateDeath(e, dt); return; }
    if (!n) return;
    if (performance.now() - (e.seen || 0) > 1500) { E.remove(e); return; } // saiu do alcance do host
    let x = n.x, y = n.y, z = n.z, yaw = n.yaw;
    if (n.ab) { [x, z] = boat.toWorld(n.x, n.z); y = boat.set.y + n.y; yaw = n.yaw + boat.yaw; }
    const p = e.body.pos, k = Math.min(1, dt * 12);
    if (p.distanceTo(_v.set(x, y, z)) > 6) p.set(x, y, z); else { p.x += (x - p.x) * k; p.y += (y - p.y) * k; p.z += (z - p.z) * k; }
    e.yaw = lerpAngle(e.yaw, yaw, k);
    if (e.rafting && e.raft) { E._rideRaft(e, dt); }
    else {
      e.mesh.position.copy(p); e.mesh.rotation.set(0, e.yaw, 0);
      animateEnemy(e.mesh, e.netSpd || 0, dt, e.netPose || 'walk', e.netProg || 0);
    }
    // aviso do golpe ("!"), luva brilhando e estrelinhas de atordoado — iguais aos do host
    const M = G.melee, ms = e.m || {};
    if (e.def.spinUp) E.spinGun(e, dt, e.spinFlag || e.fireFlag);
    if (M) {
      if (ms.state === 'windup') M.setTell(e, ms.move, ms.wind || 0); else if (e.spinFlag) M.setTell(e, { heavy: true }, 0.6); else M.setTell(e, null);
      M.updateStars(e, dt, ms.state === 'stagger');
    }
    E._animateHit(e, dt);
  }

  // o host saiu e você virou host: as réplicas viram inimigos de verdade (ou somem, se não der)
  adopt(e) {
    e.replica = false;
    if (!e.pirate && !e.isl) { this.G.enemies.remove(e); return false; }
    if (e.pirate) e.state = e.rafting ? 'approach' : 'boarded';
    else e.state = 'chase';
    if (e.state === 'boarded') { const [lx, lz] = this.G.boat.toLocal(e.body.pos.x, e.body.pos.z); e.local = { x: lx, z: lz, y: e.body.pos.y - this.G.boat.set.y }; e.body.groundSet = this.G.boat.set; }
    e.m = { state: 'idle', t: 0 }; e.timer = 0; e.cd = 0.5;
    return true;
  }

  // ---------- efeitos para todos ----------
  banner(title, text, kind) { // aviso grande (chefe apareceu / caiu) para todos
    const G = this.G;
    if (G.hud.banner) G.hud.banner(title, text, kind, 6);
    if (G.net.online) G.net.send({ t: 'fx', k: 'banner', ti: String(title).slice(0, 40), tx: String(text).slice(0, 160), kd: kind });
  }
  shotFx(from, to, kind) { // tiro de inimigo (host)
    if (!this.G.net.online) return;
    this.G.net.send({ t: 'fx', k: 'eshot', o: [r1(from.x), r1(from.y), r1(from.z)], e: [r1(to.x), r1(to.y), r1(to.z)], g: kind });
  }
  playerShot(origin, ends, weaponId, sound) { // tiro do jogador local
    if (!this.G.net.online) return;
    this.G.net.send({ t: 'fx', k: 'pshot', o: [r1(origin.x), r1(origin.y), r1(origin.z)], e: ends.map((v) => [r1(v.x), r1(v.y), r1(v.z)]), w: weaponId, s: sound });
  }

  // ---------- mensagens ----------
  handle(m) {
    const G = this.G, E = G.enemies, me = G.net.id;
    switch (m.t) {
      case 'ens': this.apply(m.l); break;
      case 'ehit': { // host: um aliado acertou um inimigo
        if (!E.auth) return;
        const e = E.byId(m.id); if (!e || e.creature) return;
        if (Number.isFinite(m.n) && m.n > 0) E.damage(e, Math.min(400, m.n), m.from || 'remote');
        break;
      }
      case 'emod': { // host: empurrão / atordoado / choque de lâminas causado por um aliado
        if (!E.auth) return;
        const e = E.byId(m.id); if (!e || e.state === 'dead' || e.creature) return;
        if (Array.isArray(m.kn)) e.knock = { x: +m.kn[0] || 0, z: +m.kn[1] || 0 };
        if (Number.isFinite(m.st)) G.melee.staggerEnemy(e, Math.min(2.5, m.st));
        if (Array.isArray(m.cl)) G.melee.clashEnemy(e, +m.cl[0] || 0, +m.cl[1] || 0);
        break;
      }
      case 'edie': {
        const e = E.byId(m.id);
        if (e && !E.auth && e.state !== 'dead') {
          e.state = 'dead'; e.timer = 5; e.deathT = 0; e.deathSide = m.side || 1;
          sfx.enemyDown(e.body.pos);
          if (G.melee) { G.melee.setTell(e, null); G.melee.updateStars(e, 0, false); }
          if (m.to !== me) G.hud.msg(`${e.def.nome} derrotado`);
        }
        G.world.collected.add(m.id);
        if (m.to === me && m.loot) { // você matou: o loot é seu
          const nome = e ? e.def.nome : 'Inimigo';
          G.hud.msg(`${nome} derrotado  ` + G.survival.add(m.loot));
        }
        break;
      }
      case 'pdmg': { // um inimigo (no host) te acertou
        if (m.to !== me || G.player.dead) return;
        const dmg = Math.min(200, +m.dmg || 0), src = String(m.src || 'Inimigo').slice(0, 30);
        const att = E.byId(m.eid) || { body: { pos: new THREE.Vector3(+m.ex || 0, G.player.body.pos.y, +m.ez || 0) }, def: { nome: src }, yaw: 0, m: {} };
        if (m.k === 'kick') G.melee.incomingKick(att, dmg);
        else if (m.k === 'melee') G.melee.incoming(dmg, src, att, !!m.h);
        else G.survival.damage(dmg, src);
        break;
      }
      case 'chit': { // dano numa criatura do mar (todos aplicam)
        const e = E.byId(m.id);
        if (e && e.creature && Number.isFinite(m.n)) E.damage(e, m.n, m.from || 'remote', true);
        break;
      }
      case 'fishtake': if (G.seaEvents) G.seaEvents.removeFish(m.id); break;
      case 'fx': this.fx(m); break;
    }
  }

  fx(m) {
    const G = this.G, V = (a) => (Array.isArray(a) && a.length === 3 && a.every(Number.isFinite) ? new THREE.Vector3(a[0], a[1], a[2]) : null);
    if (m.k === 'eshot' || m.k === 'pshot') {
      const o = V(m.o); if (!o) return;
      const ends = m.k === 'eshot' ? [V(m.e)] : (Array.isArray(m.e) ? m.e.slice(0, 10).map(V) : []);
      for (const end of ends) if (end) G.combat.tracer(o.clone(), end, m.k === 'eshot' ? 0xffb060 : 0xfff2a0);
      sfx.gun(o, typeof m.g === 'string' ? m.g : typeof m.s === 'string' ? m.s : 'pistol');
    } else if (m.k === 'banner') {
      if (G.hud.banner) G.hud.banner(String(m.ti || '').slice(0, 40), String(m.tx || '').slice(0, 160), ['pirate', 'storm', 'good'].includes(m.kd) ? m.kd : '', 6);
    } else if (m.k === 'mortar' && G.siege) {
      const o = V(m.o), v = V(m.v), tg = V(m.tg);
      if (o && v && tg && Number.isFinite(m.T)) G.siege.spawnShell(o, v, Math.min(8, m.T), tg);
    }
  }
}
const _v = new THREE.Vector3();
