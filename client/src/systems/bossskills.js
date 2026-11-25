// Habilidades especiais dos chefes (o host decide quando; o efeito chega a todos por 'fx' e cada
// jogador sofre o efeito no próprio corpo). Todas têm AVISO antes e dá para escapar:
//   Escafandrista  • Jato d'água: mira a mangueira (borbulha), solta um jato que voa até onde você
//                    ESTAVA — saia do lugar. Acertou: tela azul e cego por 4 s (bloqueando de frente: 1,5 s).
//                  • Pisão de chumbo: bate as botas e uma onda de choque corre pelo chão — PULE por cima.
//                  • Águas-vivas: arremessa 3 águas-vivas (5 furioso) onde você está; elas ficam no chão
//                    ~7 s. Encostou: fica lento e perde 4 de vida por segundo por 4 s.
//   Metralhador    • Granada: se você se esconde atrás da cobertura, ele joga uma granada (anel vermelho
//                    no chão, explode em 1,6 s).
//   Chefes da plataforma Leviatã (evento SOS), um por andar:
//   Soldador   • Maçarico: cone laranja no chão e depois fogo nele por 1,5 s — saia do cone.
//              • Respingo de solda: 3 bolas de metal derretido viram poças que queimam — não pise.
//   Dr. Gás    • Nuvem tóxica: lata de gás cai onde você está; a nuvem verde dói e embaça a vista.
//              • Válvulas: três faixas no chão brilham e soltam jatos de gás — fique entre elas.
//   Perfurador • Investida da broca: faixa vermelha à frente dele e ele dispara por ela — saia da faixa.
//              • Tremor triplo: três ondas de choque seguidas pelo chão — pule cada uma.
//   Faísca     • Arco elétrico: anéis azuis em você e perto; raios caem neles — saia do anel.
//              • Salto relâmpago: some num clarão e reaparece nas suas costas com um choque — esquive.
// (O kraken solta tinta pela cabeça — ver seaevents.js.)
import * as THREE from '../three.js';
import { sea } from '../world/ocean.js';
import { sfx } from '../core/sfx.js';

export const SKILLS = {
  jet: { cd: [11, 15], range: [4, 15], wind: 0.9, speed: 24, radius: 1.2, blind: 4, blindBlocked: 1.5 },
  jelly: { cd: [9, 13], range: [3, 16], wind: 0.6, fly: 0.85, n: 3, radius: 1.2, life: 7, sting: 4 },
  stomp: { cd: [9, 12], range: 7, wind: 0.7, speed: 9, maxR: 10, width: 0.7, dmg: 14 },
  grenade: { cd: [7, 10], hiddenFor: 1.5, fuse: 1.6, radius: 3.6, dmg: 28 },
  // inimigos comuns: bombardeiro (bomba de pólvora) e atirador de elite (mira laser, saia da linha)
  bomb: { cd: [5, 8], range: [4, 17], wind: 0.5, fuse: 1.4, radius: 2.8, dmg: 18 },
  snipe: { cd: [5, 7.5], range: [8, 45], wind: 1.3, dmg: 30, radius: 1.0 },
  // chefes da Leviatã
  flame: { cd: [8, 11], range: [0, 7.5], wind: 0.85, dur: 1.5, arc: 0.55, reach: 7.5, dmg: 9, tick: 0.3 },
  slag: { cd: [10, 14], range: [3, 16], wind: 0.55, fly: 0.7, n: 3, radius: 1.5, life: 6, dmg: 7, tick: 0.45 },
  cloud: { cd: [9, 12], range: [3, 18], wind: 0.55, fuse: 1.0, radius: 3.4, life: 7, dmg: 5, tick: 0.5 },
  vent: { cd: [11, 15], range: [0, 20], wind: 1.25, n: 3, len: 22, width: 1.2, gap: 4.2, dmg: 22, burst: 0.9 },
  charge: { cd: [8, 11], range: [5, 18], wind: 0.9, speed: 17, len: 18, width: 1.5, dmg: 30 },
  quake: { cd: [10, 13], range: 9, wind: 0.8, rings: 3, gap: 0.7, speed: 8, maxR: 11, width: 0.7, dmg: 16 },
  zap: { cd: [7, 10], range: [2, 22], wind: 1.2, n: 3, radius: 1.8, dmg: 24 },
  blink: { cd: [9, 13], range: [5, 25], wind: 0.55, radius: 2.1, dmg: 18 },
};
const BOSS_SKILLS = { solda: ['flame', 'slag'], gas: ['cloud', 'vent'], broca: ['quake', 'charge'], raio: ['zap', 'blink'] };
const POSE = { jelly: 'throw', flame: 'aim', slag: 'throw', cloud: 'throw', vent: 'heavyWindup', charge: 'heavyWindup', quake: 'heavyWindup', zap: 'aim', blink: 'aim', stomp: 'heavyWindup', bomb: 'throw' };
// pseudo-aleatório determinístico (a mesma semente gera os mesmos pontos em todos os clientes)
const rngOf = (seed) => { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t ^= t + Math.imul(t ^ (t >>> 7), 61 | t); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
const between = ([a, b]) => a + Math.random() * (b - a);
const r1 = (x) => Math.round(x * 10) / 10;
const V = (a) => new THREE.Vector3(a[0], a[1], a[2]);

// Água-viva: sino translúcido rosa que brilha + tentáculos.
function makeJellyfish() {
  const g = new THREE.Group(), tentacles = [];
  const bell = new THREE.Mesh(new THREE.SphereGeometry(0.42, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.55),
    new THREE.MeshStandardMaterial({ color: 0xff8ad8, emissive: 0xd23aa8, emissiveIntensity: 0.6, transparent: true, opacity: 0.72, roughness: 0.2, side: THREE.DoubleSide, depthWrite: false }));
  bell.scale.y = 0.8; bell.position.y = 0.32; g.add(bell);
  const inner = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 8), new THREE.MeshBasicMaterial({ color: 0xffd0f2, transparent: true, opacity: 0.8 }));
  inner.position.y = 0.42; g.add(inner);
  const tm = new THREE.MeshBasicMaterial({ color: 0xffa8e6, transparent: true, opacity: 0.7 });
  for (let i = 0; i < 7; i++) {
    const a = i / 7 * Math.PI * 2, piv = new THREE.Group();
    piv.position.set(Math.cos(a) * 0.28, 0.34, Math.sin(a) * 0.28); piv.rotation.y = -a; piv.userData.k = i;
    const t = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.008, 0.55, 4), tm); t.position.y = -0.27; piv.add(t);
    g.add(piv); tentacles.push(piv);
  }
  g.userData.tentacles = tentacles;
  return g;
}

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
      if (!(e.def.boss || e.def.skill) || e.replica || e.state === 'dead' || e.creature) continue;
      const T = e.tgt; if (!T || T.dead || T.downed || !T.pos) continue;
      const sk = e.sk || (e.sk = { jet: between([4, 7]), jelly: between([3, 6]), stomp: between([3, 6]), grenade: 3, bomb: between([2, 4]), snipe: between([2, 4]), hidden: 0,
        flame: between([2, 4]), slag: between([4, 7]), cloud: between([2, 4]), vent: between([5, 8]), charge: between([3, 5]), quake: between([4, 7]), zap: between([2, 4]), blink: between([5, 8]) });
      for (const k in sk) if (typeof sk[k] === 'number' && k !== 'hidden') sk[k] -= dt;
      if (e.skillHold > 0 || (e.m && ['windup', 'strike', 'stagger'].includes(e.m.state))) continue;
      const p = e.body.pos, d = Math.hypot(T.pos.x - p.x, T.pos.z - p.z);
      const kind = e.def.boss || e.def.skill;
      if (d > (kind === 'snipe' ? SKILLS.snipe.range[1] : 30)) continue;
      if (kind === 'bomb' || kind === 'snipe') { // inimigos comuns com habilidade
        const S = SKILLS[kind];
        if (sk[kind] <= 0 && d > S.range[0] && d < S.range[1] && (kind === 'bomb' || e.los !== false)) { sk[kind] = between(S.cd); this.cast(kind, e, T); }
        continue;
      }
      if (e.def.boss) this._enrage(e, G);
      if (BOSS_SKILLS[kind]) { // chefes da Leviatã: a primeira habilidade pronta e no alcance sai
        if (Math.abs(T.pos.y - p.y) > 3.5) continue; // jogador em outro andar
        for (const k of BOSS_SKILLS[kind]) {
          const S = SKILLS[k], [lo, hi] = Array.isArray(S.range) ? S.range : [0, S.range];
          if (sk[k] <= 0 && d >= lo && d <= hi && (k !== 'charge' || e.los !== false)) {
            sk[k] = between(S.cd) * (e.enraged ? 0.65 : 1);
            // furioso: emenda a outra habilidade logo depois (combo); calmo: dá um respiro entre elas
            for (const o of BOSS_SKILLS[kind]) if (o !== k) sk[o] = e.enraged ? Math.min(sk[o], S.wind + 1.4) : Math.max(sk[o], 2.5);
            if (e.enraged && (k === 'charge' || k === 'blink') && !e.again) { e.again = true; sk[k] = S.wind + 1.1; } else e.again = false; // investida/salto em dobro
            this.cast(k, e, T); break;
          }
        }
        continue;
      }
      if (kind === 'mini') {
        const J = SKILLS.jet, JL = SKILLS.jelly;
        const canJet = sk.jet <= 0 && d > J.range[0] && d < J.range[1] && e.los !== false;
        const canJelly = sk.jelly <= 0 && d > JL.range[0] && d < JL.range[1];
        if (sk.stomp <= 0 && d < SKILLS.stomp.range) { sk.stomp = between(SKILLS.stomp.cd); this.cast('stomp', e, T); }
        else if (canJelly && (!canJet || Math.random() < 0.5)) { sk.jelly = between(JL.cd) * (e.enraged ? 0.7 : 1); sk.jet = Math.max(sk.jet, 2.5); this.cast('jelly', e, T); }
        else if (canJet) { sk.jet = between(J.cd); sk.jelly = Math.max(sk.jelly, 2.5); this.cast('jet', e, T); }
      } else if (kind === 'minigun') {
        sk.hidden = e.los === false ? sk.hidden + dt : 0; // escondido atrás da cobertura?
        if (sk.grenade <= 0 && sk.hidden > SKILLS.grenade.hiddenFor && d < 24) { sk.grenade = between(SKILLS.grenade.cd); this.cast('grenade', e, T); }
      }
    }
  }

  // Fúria: abaixo de 50% de vida o chefe fica mais rápido nas habilidades e ganha versões mais fortes.
  _enrage(e, G) {
    if (e.maxHp == null) e.maxHp = e.hp;
    if (e.enraged || e.hp > e.maxHp * 0.5) return;
    e.enraged = true;
    if (G.enemyNet) G.enemyNet.banner(`${e.def.nome.toUpperCase()} ENFURECIDO`, 'Ataques mais fortes e em sequência — fique esperto!', 'pirate');
    if (G.vfx) { const p = e.body.pos; G.vfx.flash({ x: p.x, y: p.y + 1.2, z: p.z }, { color: 0xff4a2a, size: 3, life: 0.35 }); G.vfx.ring(p, { color: 0xff4a2a, from: 0.5, to: 7, life: 0.6 }); }
  }
  cast(s, e, T) {
    const G = this.G, p = e.body.pos;
    // mira preditiva: onde você VAI estar quando o ataque chegar (limitado a 6 m de antecipação)
    const LEAD = { jelly: 0.8, jet: 1.3, slag: 1.1, cloud: 0.9, zap: 0.8, charge: 0.45, bomb: 0.9, grenade: 0.9, vent: 0.9, snipe: 0.5 }[s] || 0;
    const v = T.vel || { x: 0, z: 0 }, lx = Math.max(-6, Math.min(6, (v.x || 0) * LEAD)), lz = Math.max(-6, Math.min(6, (v.z || 0) * LEAD));
    const m = { t: 'fx', k: 'skill', s, id: e.id, o: [r1(p.x), r1(p.y), r1(p.z)], tg: [r1(T.pos.x + lx), r1(T.pos.y), r1(T.pos.z + lz)], seed: Math.floor(Math.random() * 1e6), en: e.enraged ? 1 : 0 };
    const S = SKILLS[s];
    e.skillHold = (S.wind || 0.6) + 0.3 + (s === 'flame' ? S.dur : s === 'quake' ? S.gap * (S.rings - 1) : 0);
    e.skillPose = POSE[s] || 'aim';
    if (s === 'charge' || s === 'blink') e.skillHold = S.wind + 0.1; // o movimento vem depois (host)
    this.start(m);
    if (G.net.online) G.net.send(m);
  }

  // ---------- todos: efeito ----------
  start(m) {
    const G = this.G, o = V(m.o), tg = V(m.tg), S = SKILLS[m.s]; if (!S) return;
    const fx = { ...m, o, tg, t: 0, objs: [] };
    const add = (obj) => { G.scene.add(obj); fx.objs.push(obj); return obj; };
    if (m.s === 'jet') { fx.stream = add(new THREE.Group()); for (let i = 0; i < 14; i++) fx.stream.add(new THREE.Mesh(new THREE.SphereGeometry(0.16 + Math.random() * 0.1, 8, 6), new THREE.MeshBasicMaterial({ color: 0xbfe8ff, transparent: true, opacity: 0.85 }))); fx.stream.visible = false; sfx.splash(o, false); }
    if (m.s === 'jelly') {
      const n = S.n + (m.en ? 2 : 0), rnd = rngOf(m.seed || 1);
      fx.pts = Array.from({ length: n }, (_, k) => { const a = rnd() * 6.28, d = k === 0 ? 0 : 2 + rnd() * 2.2; const q = new THREE.Vector3(tg.x + Math.cos(a) * d, 0, tg.z + Math.sin(a) * d); q.y = this._ground(q.x, q.z, tg.y) + 0.05; return q; });
      fx.marks = fx.pts.map((q) => { const mk = add(new THREE.Mesh(new THREE.RingGeometry(S.radius * 0.85, S.radius, 28).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xff7ad9, transparent: true, opacity: 0.6, side: THREE.DoubleSide, depthWrite: false }))); mk.position.copy(q); return mk; });
      fx.jellies = fx.pts.map(() => { const j = add(makeJellyfish()); j.position.copy(o).setY(o.y + 2); return j; });
      fx.stung = 0;
    }
    if (m.s === 'stomp') { fx.ring = add(new THREE.Mesh(new THREE.RingGeometry(0.85, 1, 48).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xe8d2a0, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false }))); fx.ring.visible = false; }
    if (m.s === 'snipe') { // laser vermelho até onde você estava
      const geo = new THREE.BufferGeometry().setFromPoints([o.clone().setY(o.y + 1.5), tg.clone().setY(tg.y + 1.1)]);
      fx.laser = add(new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xff2a1a, transparent: true, opacity: 0.8 })));
      fx.dot = add(new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff2a1a }))); fx.dot.position.copy(tg).setY(tg.y + 1.1);
    }
    if (m.s === 'grenade' || m.s === 'bomb') { // marca no chão
      const col = 0xff3b2b, R = S.radius;
      fx.mark = add(new THREE.Mesh(new THREE.RingGeometry(R * 0.92, R, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.6, side: THREE.DoubleSide, depthWrite: false })));
      fx.mark.position.set(tg.x, this._ground(tg.x, tg.z, tg.y) + 0.06, tg.z);
      { fx.nade = add(new THREE.Mesh(new THREE.SphereGeometry(m.s === 'bomb' ? 0.18 : 0.13, 10, 8), new THREE.MeshStandardMaterial({ color: m.s === 'bomb' ? 0x1a1a1a : 0x3a4226, roughness: 0.6, emissive: m.s === 'bomb' ? 0x401000 : 0 }))); fx.nade.position.copy(o).setY(o.y + 2); }
    }
    this._startBoss(m, fx, add, o, tg, S);
    this.active.push(fx);
  }

  // ---------- chefes da Leviatã: montagem dos efeitos ----------
  _startBoss(m, fx, add, o, tg, S) {
    if (!Object.values(BOSS_SKILLS).some((l) => l.includes(m.s))) return; // só os chefes da Leviatã
    if (m.en) S = { ...S, n: (S.n || 0) + 2, rings: (S.rings || 0) + 1, dur: (S.dur || 0) * 1.4, gap: (S.gap || 0) * (m.s === 'vent' ? 0.85 : 0.8), radius: (S.radius || 0) * 1.2 }; // fúria
    fx.P = S; fx.sweep = m.en && m.s === 'flame' ? (rngOf(m.seed + 3)() < 0.5 ? 1 : -1) * 1.0 : 0; // maçarico que varre
    const G = this.G, rnd = rngOf(m.seed || 1), gy = (x, z, y) => this._ground(x, z, y) + 0.07;
    const decal = (geo, color, op = 0.55) => add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: op, side: THREE.DoubleSide, depthWrite: false })));
    const dir = new THREE.Vector3(tg.x - o.x, 0, tg.z - o.z); if (dir.lengthSq() < 1e-4) dir.set(0, 0, 1); dir.normalize();
    fx.dir = dir;
    if (m.s === 'flame') {
      fx.cone = decal(new THREE.CircleGeometry(S.reach, 24, -S.arc, 2 * S.arc).rotateX(-Math.PI / 2), 0xff7a1a, 0.35);
      fx.cone.position.set(o.x, gy(o.x, o.z, o.y), o.z); fx.cone.rotation.y = Math.atan2(-dir.z, dir.x);
    } else if (m.s === 'slag') {
      fx.pts = Array.from({ length: S.n }, (_, k) => { const a = rnd() * 6.28, d = k === 0 ? 0 : 1.8 + rnd() * 2.5; return new THREE.Vector3(tg.x + Math.cos(a) * d, 0, tg.z + Math.sin(a) * d); });
      fx.blobs = fx.pts.map(() => add(new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), new THREE.MeshStandardMaterial({ color: 0xff8a2a, emissive: 0xff5a10, emissiveIntensity: 3 }))));
      fx.pools = fx.pts.map((q) => { const d = decal(new THREE.CircleGeometry(S.radius, 24).rotateX(-Math.PI / 2), 0xff5a10, 0.0); q.y = gy(q.x, q.z, tg.y); d.position.copy(q); return d; });
      fx.marks = fx.pts.map((q) => { const d = decal(new THREE.RingGeometry(S.radius * 0.9, S.radius, 28).rotateX(-Math.PI / 2), 0xffb040, 0.7); d.position.copy(q); return d; });
      for (const b of fx.blobs) b.position.copy(o).setY(o.y + 2);
    } else if (m.s === 'cloud') {
      fx.mark = decal(new THREE.RingGeometry(S.radius * 0.92, S.radius, 40).rotateX(-Math.PI / 2), 0x7aff3a, 0.6);
      fx.mark.position.set(tg.x, gy(tg.x, tg.z, tg.y), tg.z);
      fx.nade = add(new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.35, 10), new THREE.MeshStandardMaterial({ color: 0x5a8a2a, emissive: 0x204a10 }))); fx.nade.position.copy(o).setY(o.y + 2);
      fx.puffs = Array.from({ length: 7 }, () => { const p = add(new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8), new THREE.MeshBasicMaterial({ color: 0x8adf4a, transparent: true, opacity: 0, depthWrite: false }))); p.userData.o = [rnd() - 0.5, rnd(), rnd() - 0.5, 0.6 + rnd() * 0.7]; p.visible = false; return p; });
    } else if (m.s === 'vent') {
      const side = new THREE.Vector3(-dir.z, 0, dir.x);
      fx.lines = Array.from({ length: S.n }, (_, k) => {
        const c = tg.clone().addScaledVector(dir, (k - (S.n - 1) / 2) * S.gap), d = decal(new THREE.PlaneGeometry(S.len, S.width).rotateX(-Math.PI / 2), 0xd6ff3a, 0.35);
        d.position.set(c.x, gy(c.x, c.z, tg.y), c.z); d.rotation.y = Math.atan2(-side.z, side.x);
        return { c, side, mesh: d };
      });
      fx.jets = [];
    } else if (m.s === 'charge') {
      fx.lane = decal(new THREE.PlaneGeometry(S.len, S.width).rotateX(-Math.PI / 2), 0xff2a1a, 0.4);
      const mid = o.clone().addScaledVector(dir, S.len / 2);
      fx.lane.position.set(mid.x, gy(mid.x, mid.z, o.y), mid.z); fx.lane.rotation.y = Math.atan2(-dir.z, dir.x);
    } else if (m.s === 'quake') {
      fx.rings = Array.from({ length: S.rings }, () => { const r2 = decal(new THREE.RingGeometry(0.85, 1, 48).rotateX(-Math.PI / 2), 0xe8b060, 0.9); r2.visible = false; return r2; });
      fx.hitRing = [];
    } else if (m.s === 'zap') {
      fx.pts = Array.from({ length: S.n }, (_, k) => { const a = rnd() * 6.28, d = k === 0 ? 0 : 3 + rnd() * 3; const q = new THREE.Vector3(tg.x + Math.cos(a) * d, 0, tg.z + Math.sin(a) * d); q.y = gy(q.x, q.z, tg.y); return q; });
      fx.rings = fx.pts.map((q) => { const d = decal(new THREE.RingGeometry(S.radius * 0.85, S.radius, 32).rotateX(-Math.PI / 2), 0x4ab0ff, 0.7); d.position.copy(q); return d; });
    } else if (m.s === 'blink') {
      const back = tg.clone().addScaledVector(dir, 1.7); // atrás de você (do lado oposto ao chefe)
      fx.land = back; fx.land.y = tg.y;
      fx.flashA = add(new THREE.Mesh(new THREE.SphereGeometry(1.2, 14, 10), new THREE.MeshBasicMaterial({ color: 0x9fd8ff, transparent: true, opacity: 0.8, depthWrite: false })));
      fx.flashA.position.copy(o).setY(o.y + 1);
      fx.mark = decal(new THREE.RingGeometry(S.radius * 0.9, S.radius, 32).rotateX(-Math.PI / 2), 0x4ab0ff, 0.5);
      fx.mark.position.set(back.x, gy(back.x, back.z, tg.y), back.z);
      sfx.click(o, 2.4);
    }
    if (['vent', 'quake', 'charge'].includes(m.s)) G.events.shake = Math.max(G.events.shake, 0.12);
  }
  // raio (linha em zigue-zague do céu até o ponto)
  _bolt(q, color = 0xbfe4ff) {
    const pts = [], top = q.y + 14;
    for (let i = 0; i <= 10; i++) { const u = i / 10; pts.push(new THREE.Vector3(q.x + (i && i < 10 ? (Math.random() - 0.5) * 1.4 : 0), top + (q.y - top) * u, q.z + (i && i < 10 ? (Math.random() - 0.5) * 1.4 : 0))); }
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color, transparent: true, opacity: 1 }));
    this.G.scene.add(line); setTimeout(() => this.G.scene.remove(line), 180);
  }
  // o jogador local está dentro do círculo (x,z) e na mesma altura?
  _inside(q, rad, pp, dy = 2) { return Math.hypot(pp.x - q.x, pp.z - q.z) < rad && Math.abs(pp.y - q.y) < dy; }

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
  // ---------- chefes da Leviatã: a cada quadro (todos os clientes) ----------
  _updateBoss(f, S, dt, pl, pp) {
    const G = this.G, me = this._me(), E = G.enemies, boss = E.byId(f.id), flames = G.naval && G.naval.flames;
    const tick = (key, every) => { f[key] = (f[key] || 0) - dt; if (f[key] > 0) return false; f[key] = every; return true; };
    if (f.s === 'flame') {
      const on = f.t - S.wind;
      if (f.sweep) { // furioso: o cone varre de um lado a outro enquanto queima
        const a0 = Math.atan2(f.dir0 ? f.dir0.z : f.dir.z, f.dir0 ? f.dir0.x : f.dir.x); if (!f.dir0) f.dir0 = f.dir.clone();
        const a = a0 + f.sweep * (Math.max(0, Math.min(1, on / S.dur)) - 0.5); f.dir.set(Math.cos(a), 0, Math.sin(a)); f.cone.rotation.y = Math.atan2(-f.dir.z, f.dir.x);
      }
      f.cone.material.opacity = on < 0 ? 0.2 + 0.3 * Math.abs(Math.sin(f.t * 14)) : 0.15;
      if (on >= 0) {
        if (!f.lit) { f.lit = true; sfx.explosion(f.o, 0.35); if (G.vfx) G.vfx.flash({ x: f.o.x + f.dir.x, y: f.o.y + 1.2, z: f.o.z + f.dir.z }, { color: 0xffa040, size: 1.6 }); }
        if (G.vfx && Math.random() < dt * 20) { const d2 = Math.random() * S.reach; G.vfx.embers({ x: f.o.x + f.dir.x * d2, y: f.o.y + 0.3, z: f.o.z + f.dir.z * d2 }, 2); }
        for (let k = 0; k < 6 && flames; k++) { // labaredas saindo do maçarico ao longo do cone
          const a = Math.atan2(f.dir.z, f.dir.x) + (Math.random() - 0.5) * 2 * S.arc, sp = 6 + Math.random() * 6;
          flames.emit(f.o.x + f.dir.x * 0.8, f.o.y + 1.2, f.o.z + f.dir.z * 0.8, Math.cos(a) * sp, 0.6 + Math.random(), Math.sin(a) * sp, 0.55, 1.1 + Math.random() * 0.6, 0, 1.4);
        }
        if (me && tick('tk', S.tick)) {
          const dx = pp.x - f.o.x, dz = pp.z - f.o.z, d = Math.hypot(dx, dz);
          if (d < S.reach && d > 0.2 && Math.abs(pp.y - f.o.y) < 2 && (dx * f.dir.x + dz * f.dir.z) / d > Math.cos(S.arc)) { G.survival.damage(S.dmg, 'Maçarico'); G.hud.flash('hurt'); }
        }
        if (on > S.dur) return true;
      }
    } else if (f.s === 'slag') {
      const u = Math.min(1, Math.max(0, (f.t - S.wind) / S.fly));
      f.blobs.forEach((b, k) => { const q = f.pts[k]; b.position.lerpVectors(f.o.clone().setY(f.o.y + 2), q, u); b.position.y += Math.sin(u * Math.PI) * 3; b.visible = u < 1; });
      if (u >= 1) {
        if (!f.landed) { f.landed = true; sfx.splash(f.pts[0], false); for (const mk of f.marks) mk.visible = false; if (G.vfx) for (const q of f.pts) { G.vfx.embers(q, 10, 0xffb040, 1.2); G.vfx.ring(q, { color: 0xff7a1a, from: 0.3, to: S.radius * 1.4, life: 0.4 }); } }
        const left = S.wind + S.fly + S.life - f.t;
        for (const pool of f.pools) pool.material.opacity = 0.65 * Math.min(1, left / 1.5) * (0.85 + 0.15 * Math.sin(f.t * 9));
        if (flames && Math.random() < dt * 8) { const q = f.pts[(Math.random() * f.pts.length) | 0]; flames.emit(q.x + (Math.random() - 0.5), q.y, q.z + (Math.random() - 0.5), 0, 1.2, 0, 0.5, 0.6, 0, 0.5); }
        if (me && pl.body.grounded && tick('tk', S.tick) && f.pts.some((q) => this._inside(q, S.radius, pp, 1.2))) { G.survival.damage(S.dmg, 'Solda derretida'); G.hud.flash('hurt'); }
        if (left <= 0) return true;
      }
    } else if (f.s === 'cloud') {
      const u = Math.min(1, f.t / 0.8);
      f.nade.position.lerpVectors(f.o.clone().setY(f.o.y + 2), f.mark.position, u); f.nade.position.y += Math.sin(u * Math.PI) * 3.5;
      f.mark.material.opacity = 0.35 + 0.4 * Math.abs(Math.sin(f.t * 8));
      const on = f.t - S.fuse;
      if (on >= 0) {
        if (!f.popped) { f.popped = true; sfx.splash(f.mark.position, false); f.nade.visible = false; if (G.vfx) { G.vfx.ring(f.mark.position, { color: 0x8adf4a, from: 0.4, to: S.radius * 1.3, life: 0.6, additive: false }); G.vfx.chips(f.mark.position, 14, 0x7acf3a, 4); } }
        const grow = Math.min(1, on / 1.2), fade = Math.min(1, (S.life - on) / 1.5), c = f.mark.position;
        f.puffs.forEach((p, k) => { const [a, b, cc, s2] = p.userData.o; p.visible = true; p.position.set(c.x + a * S.radius * 1.2 + Math.sin(f.t * 0.7 + k) * 0.4, c.y + 0.6 + b * 1.6, c.z + cc * S.radius * 1.2); p.scale.setScalar(S.radius * 0.55 * s2 * (0.4 + 0.6 * grow)); p.material.opacity = 0.32 * fade; });
        if (me && tick('tk', S.tick) && this._inside(c, S.radius, pp, 2.4)) { G.survival.damage(S.dmg, 'Gás tóxico'); this.blind(0.9, 'gas'); }
        if (on > S.life) return true;
      }
    } else if (f.s === 'vent') {
      const on = f.t - S.wind;
      for (const L of f.lines) L.mesh.material.opacity = on < 0 ? 0.2 + 0.4 * Math.abs(Math.sin(f.t * (6 + f.t * 6))) : 0.15;
      if (on >= 0) {
        if (!f.burst) {
          f.burst = true; sfx.explosion(f.tg, 0.5); G.events.shake = Math.max(G.events.shake, 0.25);
          if (G.vfx) for (const L of f.lines) for (let k = -3; k <= 3; k++) { const q = L.c.clone().addScaledVector(L.side, k * S.len / 7); q.y = L.mesh.position.y; G.vfx.dust(q, 4, 0xa8e07a, 3); }
          for (const L of f.lines) for (let k = -4; k <= 4; k++) { // jatos de gás ao longo da faixa
            const jet = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.5, 3.2, 8, 1, true), new THREE.MeshBasicMaterial({ color: 0xb6ff5a, transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide }));
            jet.position.copy(L.c).addScaledVector(L.side, k * S.len / 9); jet.position.y = L.mesh.position.y + 1.6; G.scene.add(jet); f.objs.push(jet); f.jets.push(jet);
          }
          if (me) {
            const hit = f.lines.some((L) => { const dx = pp.x - L.c.x, dz = pp.z - L.c.z, along = dx * L.side.x + dz * L.side.z, across = dx * f.dir.x + dz * f.dir.z; return Math.abs(along) < S.len / 2 && Math.abs(across) < S.width / 2 + 0.3 && Math.abs(pp.y - f.tg.y) < 2.2; });
            if (hit) this._hit(S.dmg, 'Jato de gás', f.tg, 7);
          }
        }
        for (const j of f.jets) { j.scale.y = 1 + on * 0.6; j.material.opacity = 0.55 * (1 - on / S.burst); }
        if (on > S.burst) return true;
      }
    } else if (f.s === 'charge') {
      const go = f.t - S.wind;
      f.lane.material.opacity = go < 0 ? 0.25 + 0.4 * Math.abs(Math.sin(f.t * (8 + f.t * 8))) : 0.18;
      if (go >= 0) {
        if (!f.started) {
          f.started = true; sfx.kick(f.o); G.events.shake = Math.max(G.events.shake, 0.3); if (G.vfx) G.vfx.shock(f.o, 0xd8b070, 4);
          if (E.auth && boss && boss.state !== 'dead') { boss.dashV = { x: f.dir.x * S.speed, z: f.dir.z * S.speed, t: S.len / S.speed }; boss.skillPose = 'leap'; boss.skillHold = S.len / S.speed; }
        }
        const head = f.o.clone().addScaledVector(f.dir, Math.min(S.len, go * S.speed));
        if (G.vfx && go * S.speed < S.len && Math.random() < dt * 30) { G.vfx.dust(head, 3, 0xbfae8a, 2.5); G.vfx.sparks({ x: head.x, y: head.y + 0.6, z: head.z }, 2, 0xffd27a, 4, 0.25); }
        if (me && !f.hitMe && this._inside(head, S.width + 0.4, pp, 2.2) && !(G.melee && G.melee.iframes > 0)) { f.hitMe = true; if (this._hit(S.dmg, 'Broca', head, 7)) { G.hud.msg('Saia da faixa vermelha antes da investida!'); if (G.melee) G.melee.stunT = Math.max(G.melee.stunT, 0.5); } }
        if (go * S.speed > S.len + 1) return true;
      }
    } else if (f.s === 'quake') {
      let all = true;
      f.rings.forEach((ring, k) => {
        const go = f.t - S.wind - k * S.gap;
        if (go < 0) { all = false; return; }
        if (!ring.userData.bang) { ring.userData.bang = true; sfx.kick(f.o); G.events.shake = Math.max(G.events.shake, 0.35); if (boss) boss.skillPose = 'heavyWindup'; if (G.vfx) G.vfx.shock(f.o, 0xe8b060, 5); }
        const R2 = 1 + go * S.speed; if (R2 > S.maxR) { ring.visible = false; return; }
        all = false; ring.visible = true; ring.position.set(f.o.x, this._ground(f.o.x, f.o.z, f.o.y) + 0.08, f.o.z); ring.scale.setScalar(R2); ring.material.opacity = 0.9 * (1 - R2 / S.maxR);
        const dp = Math.hypot(pp.x - f.o.x, pp.z - f.o.z);
        if (me && !f.hitRing[k] && Math.abs(dp - R2) < S.width && pl.body.grounded && Math.abs(pp.y - f.o.y) < 1.6) { f.hitRing[k] = true; if (this._hit(S.dmg, 'Tremor', f.o, 6) && k === 0) G.hud.msg('Pule cada onda do tremor!'); }
      });
      if (all) return true;
    } else if (f.s === 'zap') {
      const on = f.t - S.wind;
      for (const r2 of f.rings) r2.material.opacity = on < 0 ? 0.35 + 0.5 * Math.abs(Math.sin(f.t * (8 + f.t * 10))) : 0.0;
      if (on >= 0 && !f.struck) {
        f.struck = true; sfx.thunder(0.1, 0); G.hud.flash('lightning');
        for (const q of f.pts) { this._bolt(q); if (G.vfx) { G.vfx.zap({ x: q.x, y: q.y + 0.3, z: q.z }); G.vfx.ring(q, { color: 0x6ac0ff, from: 0.3, to: S.radius * 1.6, life: 0.35 }); } }
        if (me && f.pts.some((q) => this._inside(q, S.radius, pp, 2.4)) && !(G.melee && G.melee.iframes > 0)) { this._hit(S.dmg, 'Arco elétrico', f.pts[0], 5); if (G.melee) G.melee.stunT = Math.max(G.melee.stunT, 0.6); }
      }
      if (on > 0.35) return true;
    } else if (f.s === 'blink') {
      const on = f.t - S.wind;
      f.flashA.material.opacity = Math.max(0, 0.8 - f.t * 1.2); f.flashA.scale.setScalar(1 + f.t * 2);
      f.mark.material.opacity = 0.3 + 0.5 * Math.abs(Math.sin(f.t * 16));
      if (on >= 0 && !f.jumped) {
        f.jumped = true; sfx.thunder(0.1, 0); this._bolt(f.land, 0x9fd8ff);
        if (G.vfx) { G.vfx.zap({ x: f.o.x, y: f.o.y + 1, z: f.o.z }); G.vfx.zap({ x: f.land.x, y: f.land.y + 1, z: f.land.z }); G.vfx.ring(f.land, { color: 0x6ac0ff, from: 0.3, to: S.radius * 1.8, life: 0.35 }); }
        if (E.auth && boss && boss.state !== 'dead') { boss.body.pos.x = f.land.x; boss.body.pos.z = f.land.z; boss.body.pos.y = Math.max(boss.body.pos.y, f.land.y); boss.skillPose = 'slashR'; boss.skillHold = 0.35; }
      }
      if (on >= 0.15 && !f.shocked) {
        f.shocked = true;
        if (me && this._inside(f.land, S.radius, pp, 2.4) && !(G.melee && G.melee.iframes > 0)) this._hit(S.dmg, 'Salto relâmpago', f.land, 4);
      }
      if (on > 0.5) return true;
    }
    return false;
  }

  blind(seconds, kind = 'agua') {
    const pl = this.G.player;
    pl.blindT = Math.max(pl.blindT || 0, seconds); pl.blindMax = pl.blindT; this.blindEl.className = kind;
  }

  update(dt) {
    const G = this.G;
    this.think(dt);
    // aura vermelha dos chefes enfurecidos (todos os clientes; réplica estima pela vida)
    if (G.vfx) for (const e of G.enemies.list) {
      if (!e.def.boss || e.state === 'dead') continue;
      if (e.maxHp == null) e.maxHp = e.hp;
      if ((e.enraged || e.hp < e.maxHp * 0.5) && Math.random() < dt * 14) { const p = e.body.pos, a = Math.random() * 6.28; G.vfx.glow.emit(p.x + Math.cos(a) * 0.6, p.y + 0.2 + Math.random() * 1.6, p.z + Math.sin(a) * 0.6, 0, 1.6, 0, 0.6, 0.18, 0xff4a2a, -0.5, 0.5); }
    }
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
          // Acerta em QUALQUER ponto do caminho do jato (antes só valia o ponto final, para onde ele
          // mirou prevendo seu movimento: o jato passava por você, molhava a tela e não cegava).
          const me = this._me(), hd = Math.min(len, head), prevHd = Math.min(len, Math.max(0, head - S.speed * dt - 0.4));
          const dl = Math.hypot(dir.x, dir.z) || 1, ux = dir.x / dl, uz = dir.z / dl, tx = pp.x - o.x, tz = pp.z - o.z, along = tx * ux + tz * uz;
          const across = Math.hypot(tx - ux * along, tz - uz * along), jetY = o.y + Math.sin(Math.max(0, along) / len * Math.PI) * 0.3 - Math.max(0, along) * 0.04;
          const onPath = me && !f.hitMe && along >= prevHd - 0.6 && along <= hd + 0.4 && across < S.radius && jetY > pp.y + 0.2 && jetY < pp.y + 2.4;
          if (!f.checked && head >= len - 2) { f.checked = true; sfx.splash(f.tg, true); }
          if (onPath) {
            f.hitMe = true; sfx.splash(pp, true);
            if (!(G.melee && G.melee.iframes > 0)) {
              const [fx, fz] = pl.forward(), ax = f.o.x - pp.x, az = f.o.z - pp.z, l = Math.hypot(ax, az) || 1;
              const blocked = G.melee && G.melee.blocking && (ax * fx + az * fz) / l > 0.3;
              this.blind(blocked ? S.blindBlocked : S.blind, 'agua');
              G.hud.msg(blocked ? 'Você segurou o jato com a arma — quase não molhou a vista' : 'Jato d\'água na cara! Você está cego');
              if (G.gfx) G.gfx.wetLens(1);
              pl.body.vel.x += dir.x * 3; pl.body.vel.z += dir.z * 3; // o jato empurra
            }
          }
          if (fly > len / S.speed + 0.6) done = true;
        } else if (Math.random() < dt * 20) sfx.click(f.o, 0.4); // borbulhando
      } else if (f.s === 'jelly') {
        const u = Math.min(1, Math.max(0, (f.t - S.wind) / S.fly));
        f.jellies.forEach((j, k) => {
          const q = f.pts[k];
          if (u < 1) {
            j.position.lerpVectors(f.o.clone().setY(f.o.y + 2), q, u); j.position.y += Math.sin(u * Math.PI) * 3.2;
            j.rotation.x = u * 6; j.rotation.z = u * 4 * (k % 2 ? 1 : -1);
          } else { // no chão: pulsa (encolhe e estica) e balança os tentáculos
            const ph = f.t * 3 + k;
            j.position.copy(q); j.rotation.set(0, ph * 0.3, 0);
            j.scale.set(1 + Math.sin(ph) * 0.12, 1 - Math.sin(ph) * 0.15, 1 + Math.sin(ph) * 0.12);
            for (const tc of j.userData.tentacles) tc.rotation.z = Math.sin(ph * 1.7 + tc.userData.k) * 0.5;
          }
        });
        for (const mk of f.marks) mk.material.opacity = u < 1 ? 0.35 + 0.4 * Math.abs(Math.sin(f.t * 12)) : 0;
        if (u >= 1) {
          if (!f.landed) { f.landed = true; for (const q of f.pts) sfx.splash(q, false); if (G.vfx) for (const q of f.pts) G.vfx.ring(q, { color: 0xff7ad9, from: 0.2, to: S.radius * 1.3, life: 0.35 }); }
          const left = S.wind + S.fly + S.life - f.t;
          if (left < 1.2) for (const j of f.jellies) { const s2 = Math.max(0.01, left / 1.2); j.scale.multiplyScalar(s2); }
          const me = this._me();
          if (me && f.pts.some((q) => this._inside(q, S.radius, pp, 1.6))) {
            const sv = G.survival, was = sv.buffs.agua_viva > 0;
            sv.buffs.agua_viva = S.sting; // encostou de novo: renova os 4 s
            if (!was) {
              G.hud.flash('hurt'); sfx.hurt && sfx.hurt();
              if (f.stung++ === 0) G.hud.msg('Água-viva! Você está lento e queimando — saia de perto delas.');
            }
          }
          if (left <= 0) done = true;
        }
      } else if (f.s === 'stomp') {
        const go = f.t - S.wind;
        if (go > 0) {
          if (!f.bang) { f.bang = true; sfx.kick(f.o); G.events.shake = Math.max(G.events.shake, 0.4); if (G.vfx) G.vfx.shock(f.o, 0xe8d2a0, 5); }
          const R = 1 + go * S.speed; f.ring.visible = true;
          f.ring.position.set(f.o.x, this._ground(f.o.x, f.o.z, f.o.y) + 0.08, f.o.z); f.ring.scale.setScalar(R);
          f.ring.material.opacity = 0.9 * (1 - R / S.maxR);
          const me = this._me(), dp = Math.hypot(pp.x - f.o.x, pp.z - f.o.z);
          if (me && !f.hitMe && Math.abs(dp - R) < S.width && pl.body.grounded && Math.abs(pp.y - f.o.y) < 1.6) {
            f.hitMe = true; if (this._hit(S.dmg, 'Pisão de chumbo', f.o, 6)) G.hud.msg('Pule por cima da onda de choque!');
          }
          if (R > S.maxR) done = true;
        }
      } else if (f.s === 'snipe') {
        f.laser.material.opacity = 0.4 + 0.5 * Math.abs(Math.sin(f.t * (8 + f.t * 10)));
        if (f.t >= S.wind) {
          const from = f.o.clone().setY(f.o.y + 1.5), to = f.tg.clone().setY(f.tg.y + 1.1);
          G.combat.tracer(from, to, 0xffb060); sfx.gun(f.o, 'sniper');
          const me = this._me();
          // a bala para na parede: escondido atrás de algo, você não é atingido
          const blocked = me && G.colliders.segmentBlocked(from.x, from.y, from.z, pp.x, pp.y + 1.1, pp.z);
          if (me && !blocked && Math.hypot(pp.x - f.tg.x, pp.z - f.tg.z) < S.radius && Math.abs(pp.y - f.tg.y) < 2 && !(G.melee && G.melee.iframes > 0)) {
            G.survival.damage(S.dmg, 'Atirador de elite'); sfx.hit(pp, true);
          }
          done = true;
        }
      } else if (f.s === 'grenade' || f.s === 'bomb') {
        const u = Math.min(1, f.t / 0.9);
        f.nade.position.lerpVectors(f.o.clone().setY(f.o.y + 2), f.mark.position, u); f.nade.position.y += Math.sin(u * Math.PI) * 4;
        f.mark.material.opacity = 0.4 + 0.5 * Math.abs(Math.sin(f.t * (6 + f.t * 6)));
        if (f.t >= S.fuse) {
          if (G.naval) G.naval.boom.spawn(f.mark.position, 1); sfx.explosion(f.mark.position, 1);
          const me = this._me(), d = Math.hypot(pp.x - f.tg.x, pp.z - f.tg.z);
          if (me && d < S.radius) this._hit(S.dmg * (1 - 0.5 * d / S.radius), f.s === 'bomb' ? 'Bomba' : 'Granada', f.mark.position, 6);
          done = true;
        }
      }
      if (!done && f.dir) done = this._updateBoss(f, f.P || S, dt, pl, pp);
      if (done) { for (const o of f.objs) G.scene.remove(o); this.active.splice(i, 1); }
    }
    // cegueira (tela azul de água / preta de tinta)
    if (pl.blindT > 0) {
      pl.blindT -= dt;
      const k = Math.min(1, pl.blindT / 1.5); // some nos últimos 1,5 s
      this.blindEl.hidden = false; this.blindEl.style.opacity = String(k);
    } else if (!this.blindEl.hidden) this.blindEl.hidden = true;
  }
}

