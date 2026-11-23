// Habilidades especiais dos chefes (o host decide quando; o efeito chega a todos por 'fx' e cada
// jogador sofre o efeito no próprio corpo). Todas têm AVISO antes e dá para escapar:
//   Escafandrista  • Jato d'água: mira a mangueira (borbulha), solta um jato que voa até onde você
//                    ESTAVA — saia do lugar. Acertou: tela azul e cego por 4 s (bloqueando de frente: 1,5 s).
//                  • Pisão de chumbo: bate as botas e uma onda de choque corre pelo chão — PULE por cima.
//   Caranguejo-Rei • Espuma: cospe bolhas que viram poças; dentro delas você fica lento.
//                  • Mergulho: some na areia, um monte de areia marca onde vai sair (2 s) — saia de cima.
//                  • Siris: com metade da vida chama 3 siris pequenos (uma vez).
//   Metralhador    • Granada: se você se esconde atrás da cobertura, ele joga uma granada (anel vermelho
//                    no chão, explode em 1,6 s).
// (O kraken solta tinta pela cabeça — ver seaevents.js.)
import * as THREE from '../three.js';
import { sea } from '../world/ocean.js';
import { sfx } from '../core/sfx.js';

export const SKILLS = {
  jet: { cd: [11, 15], range: [4, 15], wind: 0.9, speed: 24, radius: 1.2, blind: 4, blindBlocked: 1.5 },
  stomp: { cd: [9, 12], range: 7, wind: 0.7, speed: 9, maxR: 10, width: 0.7, dmg: 14 },
  foam: { cd: [10, 13], range: [3, 16], wind: 0.6, blobs: 5, spread: 2.6, puddleR: 1.7, life: 7, slow: 0.5 },
  burrow: { cd: [15, 20], warn: 2.0, radius: 3.2, dmg: 22 },
  adds: { hpFrac: 0.5, count: 3 },
  grenade: { cd: [7, 10], hiddenFor: 1.5, fuse: 1.6, radius: 3.6, dmg: 28 },
};
const between = ([a, b]) => a + Math.random() * (b - a);
const r1 = (x) => Math.round(x * 10) / 10;
const V = (a) => new THREE.Vector3(a[0], a[1], a[2]);

export class BossSkills {
  constructor(G) {
    this.G = G; this.active = [];
    const el = document.createElement('div'); el.id = 'blind'; el.hidden = true;
    document.getElementById('hud').appendChild(el); this.blindEl = el;
  }

  // ---------- host: decide ----------
  think(dt) {
    const G = this.G, E = G.enemies;
    if (!E.auth) return;
    for (const e of E.list) {
      if (!e.def.boss || e.replica || e.state === 'dead' || e.creature) continue;
      const T = e.tgt; if (!T || T.dead || T.downed || !T.pos) continue;
      const sk = e.sk || (e.sk = { jet: between([4, 7]), stomp: between([3, 6]), foam: between([3, 6]), burrow: between([8, 12]), grenade: 3, hidden: 0 });
      for (const k in sk) if (typeof sk[k] === 'number' && k !== 'hidden') sk[k] -= dt;
      if (e.skillHold > 0 || (e.m && ['windup', 'strike', 'stagger'].includes(e.m.state))) continue;
      const p = e.body.pos, d = Math.hypot(T.pos.x - p.x, T.pos.z - p.z);
      if (d > 30) continue;
      const kind = e.def.boss;
      if (kind === 'mini') {
        if (sk.stomp <= 0 && d < SKILLS.stomp.range) { sk.stomp = between(SKILLS.stomp.cd); this.cast('stomp', e, T); }
        else if (sk.jet <= 0 && d > SKILLS.jet.range[0] && d < SKILLS.jet.range[1] && e.los !== false) { sk.jet = between(SKILLS.jet.cd); this.cast('jet', e, T); }
      } else if (kind === 'crab') {
        if (!sk.adds && e.hp < e.max * SKILLS.adds.hpFrac) { sk.adds = true; this.spawnAdds(e); }
        else if (sk.burrow <= 0 && (d > 6 || Math.random() < 0.3)) { sk.burrow = between(SKILLS.burrow.cd); this.cast('burrow', e, T); }
        else if (sk.foam <= 0 && d > SKILLS.foam.range[0] && d < SKILLS.foam.range[1]) { sk.foam = between(SKILLS.foam.cd); this.cast('foam', e, T); }
      } else if (kind === 'minigun') {
        sk.hidden = e.los === false ? sk.hidden + dt : 0; // escondido atrás da cobertura?
        if (sk.grenade <= 0 && sk.hidden > SKILLS.grenade.hiddenFor && d < 24) { sk.grenade = between(SKILLS.grenade.cd); this.cast('grenade', e, T); }
      }
    }
  }

  cast(s, e, T) {
    const G = this.G, p = e.body.pos;
    const m = { t: 'fx', k: 'skill', s, id: e.id, o: [r1(p.x), r1(p.y), r1(p.z)], tg: [r1(T.pos.x), r1(T.pos.y), r1(T.pos.z)], seed: Math.floor(Math.random() * 1e6) };
    if (s === 'burrow') { e.immune = true; e.skillHold = SKILLS.burrow.warn + 1.2; e.burrowTo = T.pos.clone(); }
    else e.skillHold = (SKILLS[s].wind || 0.6) + 0.3;
    e.skillPose = s === 'stomp' ? 'heavyWindup' : s === 'jet' || s === 'grenade' ? 'aim' : s === 'foam' ? 'windup' : null;
    this.start(m);
    if (G.net.online) G.net.send(m);
  }

  spawnAdds(e) {
    const G = this.G;
    G.hud.msg('O Caranguejo-Rei chamou os filhotes!');
    for (let i = 0; i < SKILLS.adds.count; i++) {
      const a = i / SKILLS.adds.count * Math.PI * 2, p = e.body.pos;
      const s = G.enemies.spawn(`${e.id}-siri${i}`, 'siri', e.isl, p.x + Math.cos(a) * 2.5, p.z + Math.sin(a) * 2.5);
      s.body.pos.y = p.y + 0.3; s.state = 'chase'; s.seabedBoss = true;
    }
  }

  // ---------- todos: efeito ----------
  start(m) {
    const G = this.G, o = V(m.o), tg = V(m.tg), S = SKILLS[m.s]; if (!S) return;
    const fx = { ...m, o, tg, t: 0, objs: [] };
    const add = (obj) => { G.scene.add(obj); fx.objs.push(obj); return obj; };
    if (m.s === 'jet') { fx.stream = add(new THREE.Group()); for (let i = 0; i < 14; i++) fx.stream.add(new THREE.Mesh(new THREE.SphereGeometry(0.16 + Math.random() * 0.1, 8, 6), new THREE.MeshBasicMaterial({ color: 0xbfe8ff, transparent: true, opacity: 0.85 }))); fx.stream.visible = false; sfx.splash(o, false); }
    if (m.s === 'stomp') { fx.ring = add(new THREE.Mesh(new THREE.RingGeometry(0.85, 1, 48).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xe8d2a0, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false }))); fx.ring.visible = false; }
    if (m.s === 'foam') {
      const rnd = mulberry(m.seed);
      fx.blobs = [];
      for (let i = 0; i < S.blobs; i++) {
        const a = rnd() * 6.28, r = rnd() * S.spread, to = tg.clone().add(new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r));
        to.y = this._ground(to.x, to.z, tg.y);
        const mesh = add(new THREE.Mesh(new THREE.SphereGeometry(0.25, 10, 8), new THREE.MeshStandardMaterial({ color: 0xf4f8f6, roughness: 0.3, transparent: true, opacity: 0.9 })));
        mesh.visible = false; fx.blobs.push({ to, mesh, landed: false, puddle: null, delay: i * 0.08 });
      }
    }
    if (m.s === 'burrow' || m.s === 'grenade') { // marca no chão
      const col = m.s === 'burrow' ? 0xc8a868 : 0xff3b2b, R = S.radius;
      fx.mark = add(new THREE.Mesh(new THREE.RingGeometry(R * 0.92, R, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.6, side: THREE.DoubleSide, depthWrite: false })));
      fx.mark.position.set(tg.x, this._ground(tg.x, tg.z, tg.y) + 0.06, tg.z);
      if (m.s === 'burrow') { fx.mound = add(new THREE.Mesh(new THREE.SphereGeometry(1, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xc8b082, roughness: 1 }))); fx.mound.position.copy(fx.mark.position); fx.mound.scale.set(1.2, 0.05, 1.2); }
      if (m.s === 'grenade') { fx.nade = add(new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 8), new THREE.MeshStandardMaterial({ color: 0x3a4226, roughness: 0.6 }))); fx.nade.position.copy(o).setY(o.y + 2); }
    }
    if (m.s === 'burrow') G.hud.msg('O Caranguejo-Rei mergulhou na areia — saia de cima do monte!');
    this.active.push(fx);
  }

  _ground(x, z, fallback) {
    const G = this.G, gy = G.world.seabedHeight(x, z);
    return sea.level > gy + 0.5 ? Math.max(sea.level, fallback - 0.1) : Math.max(gy, fallback - 1.2);
  }
  _me() { const pl = this.G.player; return pl.dead ? null : pl; }
  _hit(dmg, src, from, up = 5) {
    const G = this.G, pl = this._me(); if (!pl) return false;
    if (G.melee && G.melee.iframes > 0) { G.melee.say(pl.body.pos, 'ESQUIVOU', '#8fffb0'); return false; }
    G.survival.damage(dmg, src);
    const p = pl.body.pos, dx = p.x - from.x, dz = p.z - from.z, l = Math.hypot(dx, dz) || 1;
    pl.body.vel.x += dx / l * 5; pl.body.vel.z += dz / l * 5; pl.body.vel.y = up; pl.body.grounded = false;
    return true;
  }
  blind(seconds, kind = 'agua') {
    const pl = this.G.player;
    pl.blindT = Math.max(pl.blindT || 0, seconds); pl.blindMax = pl.blindT; this.blindEl.className = kind;
  }

  update(dt) {
    const G = this.G;
    this.think(dt);
    const pl = G.player, pp = pl.body.pos;
    for (let i = this.active.length - 1; i >= 0; i--) {
      const f = this.active[i], S = SKILLS[f.s]; f.t += dt;
      let done = false;
      if (f.s === 'jet') {
        const fly = f.t - S.wind, len = f.o.distanceTo(f.tg) + 2, head = fly * S.speed;
        if (fly > 0) {
          f.stream.visible = true;
          const dir = f.tg.clone().sub(f.o).normalize(), o = f.o.clone().setY(f.o.y + 1.9);
          f.stream.children.forEach((b, k) => { const d = Math.max(0, Math.min(len, head - k * 0.35)); b.position.copy(o).addScaledVector(dir, d); b.position.y += Math.sin(d / len * Math.PI) * 0.3 - d * 0.04; b.visible = head - k * 0.35 > 0; });
          if (!f.checked && head >= len - 2) {
            f.checked = true; sfx.splash(f.tg, true);
            const me = this._me();
            if (me && Math.hypot(pp.x - f.tg.x, pp.z - f.tg.z) < S.radius && Math.abs(pp.y - f.tg.y) < 2.2 && !(G.melee && G.melee.iframes > 0)) {
              const [fx, fz] = pl.forward(), ax = f.o.x - pp.x, az = f.o.z - pp.z, l = Math.hypot(ax, az) || 1;
              const blocked = G.melee && G.melee.blocking && (ax * fx + az * fz) / l > 0.3;
              this.blind(blocked ? S.blindBlocked : S.blind, 'agua');
              G.hud.msg(blocked ? 'Você segurou o jato com a arma — quase não molhou a vista' : 'Jato d\'água na cara! Você está cego');
              if (G.gfx) G.gfx.wetLens(1);
            }
          }
          if (fly > len / S.speed + 0.6) done = true;
        } else if (Math.random() < dt * 20) sfx.click(f.o, 0.4); // borbulhando
      } else if (f.s === 'stomp') {
        const go = f.t - S.wind;
        if (go > 0) {
          if (!f.bang) { f.bang = true; sfx.kick(f.o); G.events.shake = Math.max(G.events.shake, 0.4); }
          const R = 1 + go * S.speed; f.ring.visible = true;
          f.ring.position.set(f.o.x, this._ground(f.o.x, f.o.z, f.o.y) + 0.08, f.o.z); f.ring.scale.setScalar(R);
          f.ring.material.opacity = 0.9 * (1 - R / S.maxR);
          const me = this._me(), dp = Math.hypot(pp.x - f.o.x, pp.z - f.o.z);
          if (me && !f.hitMe && Math.abs(dp - R) < S.width && pl.body.grounded && Math.abs(pp.y - f.o.y) < 1.6) {
            f.hitMe = true; if (this._hit(S.dmg, 'Pisão de chumbo', f.o, 6)) G.hud.msg('Pule por cima da onda de choque!');
          }
          if (R > S.maxR) done = true;
        }
      } else if (f.s === 'foam') {
        for (const b of f.blobs) {
          const u = (f.t - S.wind - b.delay) / 0.8;
          if (u < 0) continue;
          if (!b.landed) {
            b.mesh.visible = true;
            const o = f.o.clone().setY(f.o.y + 1.4);
            b.mesh.position.lerpVectors(o, b.to, Math.min(1, u)); b.mesh.position.y += Math.sin(Math.min(1, u) * Math.PI) * 3;
            if (u >= 1) { b.landed = true; b.mesh.visible = false; b.puddle = new THREE.Mesh(new THREE.CircleGeometry(S.puddleR, 24).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xf4f8f6, roughness: 0.25, transparent: true, opacity: 0.85 })); b.puddle.position.copy(b.to).setY(b.to.y + 0.05); G.scene.add(b.puddle); f.objs.push(b.puddle); sfx.splash(b.to, false); }
          } else {
            const age = f.t - S.wind - b.delay - 0.8;
            b.puddle.material.opacity = 0.85 * Math.min(1, (S.life - age) / 1.5);
            b.puddle.scale.setScalar(1 + Math.sin(age * 3) * 0.03);
            if (this._me() && Math.hypot(pp.x - b.to.x, pp.z - b.to.z) < S.puddleR && Math.abs(pp.y - b.to.y) < 1.2) pl.slowT = Math.max(pl.slowT || 0, 0.25);
          }
        }
        if (f.t > S.wind + 1.5 + S.life) done = true;
      } else if (f.s === 'burrow') {
        const u = f.t / S.warn;
        f.mound.scale.set(1.2 + u * 0.8, 0.05 + Math.min(1, u) * 0.4, 1.2 + u * 0.8);
        f.mark.material.opacity = 0.35 + 0.35 * Math.abs(Math.sin(f.t * 8));
        const boss = G.enemies.byId(f.id);
        if (boss && G.enemies.auth && boss.state !== 'dead') { // some na areia e reaparece no monte
          const g0 = this._ground(f.o.x, f.o.z, f.o.y);
          if (f.t < 0.8) boss.burrowY = g0 - f.t * 4;
          else if (!f.moved) { f.moved = true; boss.body.pos.set(f.tg.x, boss.body.pos.y, f.tg.z); boss.burrowY = this._ground(f.tg.x, f.tg.z, f.tg.y) - 3.5; }
        }
        if (f.t >= S.warn && !f.erupted) {
          f.erupted = true; sfx.explosion(f.tg, 0.6); G.events.shake = Math.max(G.events.shake, 0.6);
          if (this._me() && Math.hypot(pp.x - f.tg.x, pp.z - f.tg.z) < S.radius) this._hit(S.dmg, 'Caranguejo-Rei', f.tg, 7);
          if (boss && G.enemies.auth && boss.state !== 'dead') { boss.burrowY = null; boss.body.pos.y = this._ground(f.tg.x, f.tg.z, f.tg.y) + 0.3; boss.immune = false; boss.body.vel.y = 6; }
          if (G.naval) for (let k = 0; k < 24; k++) G.naval.splash.emit(f.tg.x, f.tg.y, f.tg.z, (Math.random() - 0.5) * 6, 4 + Math.random() * 5, (Math.random() - 0.5) * 6, 1, 0.6, 12);
        }
        if (f.t > S.warn + 0.6) done = true;
      } else if (f.s === 'grenade') {
        const u = Math.min(1, f.t / 0.9);
        f.nade.position.lerpVectors(f.o.clone().setY(f.o.y + 2), f.mark.position, u); f.nade.position.y += Math.sin(u * Math.PI) * 4;
        f.mark.material.opacity = 0.4 + 0.5 * Math.abs(Math.sin(f.t * (6 + f.t * 6)));
        if (f.t >= S.fuse) {
          if (G.naval) G.naval.boom.spawn(f.mark.position, 1); sfx.explosion(f.mark.position, 1);
          const me = this._me(), d = Math.hypot(pp.x - f.tg.x, pp.z - f.tg.z);
          if (me && d < S.radius) this._hit(S.dmg * (1 - 0.5 * d / S.radius), 'Granada', f.mark.position, 6);
          done = true;
        }
      }
      if (done) { for (const o of f.objs) G.scene.remove(o); this.active.splice(i, 1); }
    }
    // cegueira (tela azul de água / preta de tinta) e lentidão
    if (pl.blindT > 0) {
      pl.blindT -= dt;
      const k = Math.min(1, pl.blindT / 1.5); // some nos últimos 1,5 s
      this.blindEl.hidden = false; this.blindEl.style.opacity = String(k);
    } else if (!this.blindEl.hidden) this.blindEl.hidden = true;
    if (pl.slowT > 0) pl.slowT -= dt;
  }
}

function mulberry(seed) { let a = seed >>> 0; return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
