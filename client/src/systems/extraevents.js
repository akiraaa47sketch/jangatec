// Eventos novos (sorteados pelo host em events.js e simulados em cada cliente, como os outros):
//   No mar (mar cheio):
//   • Neblina: a visão cai para ~20 m e pedras escondidas aparecem no caminho — bater numa estraga
//     a jangada. No meio da neblina boia um saco com loot raro.
//   • Águas-vivas: o céu escurece e dezenas de águas-vivas bioluminescentes cercam a jangada, com o
//     mar cintilando. Lindo — mas quem cair na água leva queimadura (lento + dano).
//   • Acampamento abandonado: numa ilha à frente, um acampamento vazio com loot à vista… cheio de
//     armadilhas (placas de dardo e de espinhos) e um baú que é um MÍMICO.
//   Na seca (sorteados quando a água termina de baixar, no máximo um por seca):
//   • Galeão antigo: um navio enorme enterrado na areia; entre pelo rombo do casco, passe pelas
//     armadilhas e pelos piratas-fantasma que acordam e pegue o tesouro antes de a água voltar.
//   • Desembarque militar (Zona Militar em diante): um helicóptero deixa soldados no fundo do mar para
//     cercar a jangada encalhada — aguente até a água voltar (ou derrube todos).
//   • Tempestade de areia: vento forte, areia no ar e visão curta; o vento empurra e desenterra sacos
//     de loot pela seca.
import * as THREE from '../three.js';
import { clamp, mulberry32 } from '../core/util.js';
import { sea, waveHeight } from '../world/ocean.js';
import { sfx, heliRotor } from '../core/sfx.js';
import { makeHelicopter } from '../world/helicopter.js';
import { ghostify } from './enemies.js';
import { woodTexture, repeated } from '../world/textures.js';
let _wt = null;
const woodTex = () => _wt || (_wt = repeated(woodTexture(), 2, 2));

export const EXTRA_SEA = ['neblina', 'aguasvivas', 'acampamento'];
export const EXTRA_DRY = ['galeao', 'desembarque', 'areia'];
export const EXTRA_KINDS = [...EXTRA_SEA, ...EXTRA_DRY];
export const EXTRA_BALANCE = {
  neblina: { dur: [70, 95], rocks: 11, rockDmg: 45 },
  aguasvivas: { dur: [70, 90], n: 70, sting: 4 },
  acampamento: { dur: 210, reach: 150 },
  dry: { galeao: 0.32, desembarque: 0.3, areia: 0.28 }, // chance por seca (um evento no máximo)
  desembarque: { soldiers: [3, 5] },
};
const smooth = (x) => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); };
const between = (r, [a, b]) => a + r() * (b - a);
const M = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.85, ...extra });
const box = (w, h, l, m) => new THREE.Mesh(new THREE.BoxGeometry(w, h, l), m);
const RARE = [
  { kit: 1, municao: 20, arma_rifle_precisao: 1 }, { bandagem: 3, cartucho: 10, arma_escopeta: 1 },
  { kit: 1, energetico: 2, barra_proteina: 2, municao: 15 }, { bala_canhao: 8, municao: 20, chocolate: 2 },
];

export class ExtraEvents {
  constructor(G) { this.G = G; this.e = null; this.lastDryCycle = -1; this._sand = null; }
  _host() { const n = this.G.net; return !n.online || n.isHost; }

  // ---------- criação (host) ----------
  make(kind, t) {
    const G = this.G, boat = G.boat, seed = Math.floor(Math.random() * 1e9), r = mulberry32(seed);
    const base = { id: `ev${Math.floor(t * 10)}`, kind, t0: t, seed, cx: boat.x, cz: boat.z, fx: Math.sin(boat.yaw), fz: Math.cos(boat.yaw) };
    if (kind === 'neblina') return { ...base, dur: between(r, EXTRA_BALANCE.neblina.dur) };
    if (kind === 'aguasvivas') return { ...base, dur: between(r, EXTRA_BALANCE.aguasvivas.dur) };
    if (kind === 'acampamento') { const s = this.campSpot(); if (!s) return null; return { ...base, dur: EXTRA_BALANCE.acampamento.dur, x: s.x, z: s.z, yaw: r() * 6.28 }; }
    const left = Math.max(15, (G.startup.tide.state ? G.startup.tide.state.nextIn : 40) - 1);
    if (kind === 'galeao') { const a = Math.atan2(base.fx, base.fz) + (r() - 0.5) * 1.6, d = 34 + r() * 12; return { ...base, dur: left, x: boat.x + Math.sin(a) * d, z: boat.z + Math.cos(a) * d, yaw: r() * 6.28 }; }
    if (kind === 'desembarque' || kind === 'areia') return { ...base, dur: left };
    return null;
  }
  // ilha à frente, sem inimigos vivos, para o acampamento abandonado
  campSpot() {
    const G = this.G, boat = G.boat, fx = Math.sin(boat.yaw), fz = Math.cos(boat.yaw);
    let best = null, bd = Infinity;
    for (const isl of G.world.islands) {
      if (isl.starter || isl.seaSite || !isl.set) continue;
      const dx = isl.x - boat.x, dz = isl.z - boat.z, d = Math.hypot(dx, dz);
      if (d > EXTRA_BALANCE.acampamento.reach || d < 25 || (dx * fx + dz * fz) / d < 0.2) continue;
      if (isl.enemies && isl.enemies.some((e) => e.state !== 'dead')) continue;
      if (d < bd) { bd = d; best = isl; }
    }
    if (!best) return null;
    // na beira da ilha, do lado de onde a jangada chega (longe das construções do meio)
    const a = Math.atan2(boat.z - best.z, boat.x - best.x) + (Math.random() - 0.5) * 0.6, rr = best.R * 0.72;
    return { x: best.x + Math.cos(a) * rr, z: best.z + Math.sin(a) * rr };
  }
  // Na seca: quando a água termina de baixar, no máximo um evento (host).
  scheduleDry(dt, t) {
    const G = this.G, ev = G.events, st = G.startup, tide = st.tide.state;
    if (!this._host() || !st.departed || !tide || ev.current) return;
    if (tide.phase.id !== 'seco' || tide.changing || tide.cycle === this.lastDryCycle || tide.nextIn < 25) return;
    this.lastDryCycle = tide.cycle;
    if (G.naval && G.naval.active) return;
    const B = EXTRA_BALANCE.dry, diff = G.world.difficulty(G.boat.x, G.boat.z), roll = Math.random();
    let kind = null;
    if (roll < B.galeao) kind = 'galeao';
    else if (roll < B.galeao + B.areia) kind = 'areia';
    else if (diff >= 2 && roll < B.galeao + B.areia + B.desembarque) kind = 'desembarque';
    if (!kind) return;
    const e = this.make(kind, t);
    if (e) ev.begin(e, true);
  }

  // ---------- ciclo ----------
  begin(ev) {
    this.end();
    const e = Object.create(ev); e.r = mulberry32(ev.seed | 0); e.u = 0; e.objs = []; e.traps = [];
    this.e = e;
    const G = this.G, add = (o) => { G.scene.add(o); e.objs.push(o); return o; };
    e.add = add;
    if (e.kind === 'neblina') this._fogBegin(e);
    else if (e.kind === 'aguasvivas') this._jellyBegin(e);
    else if (e.kind === 'acampamento') this._campBegin(e);
    else if (e.kind === 'galeao') this._galleonBegin(e);
    else if (e.kind === 'desembarque') this._dropBegin(e);
    else if (e.kind === 'areia') this._sandBegin(e);
  }
  end() {
    const e = this.e; if (!e) return;
    const G = this.G;
    for (const o of e.objs) { G.scene.remove(o); o.traverse && o.traverse((c) => { if (c.geometry && !c.userData.shared) c.geometry.dispose(); }); }
    if (e.set) { G.colliders.removeSet(e.set); G.physics.removeStaticSet(e.set); }
    if (e.mimic && G.enemies.list.includes(e.mimic)) G.enemies.remove(e.mimic);
    if (e.kind === 'areia' || e.kind === 'desembarque') G.player.drift = null;
    if (e.heli) heliRotor(0);
    this.e = null;
  }
  finish(ev) {
    const G = this.G, e = this.e;
    if (e && e.id === ev.id) {
      if (e.kind === 'neblina') G.hud.msg('A neblina se dissipou.');
      if (e.kind === 'aguasvivas') G.hud.msg('As águas-vivas afundam devagar, apagando uma a uma…');
      if (EXTRA_DRY.includes(e.kind) && e.kind !== 'areia') { // água voltou: o que estava na areia afunda
        for (const en of [...G.enemies.list]) if (en.extraId === e.id && en.state !== 'dead') G.enemies.killSilently(en, null);
      }
    }
    this.end();
  }
  update(ev, dt, t) {
    if (!this.e || this.e.id !== ev.id) this.begin(ev);
    const e = this.e; e.u = t - e.t0;
    e.k = smooth(e.u / 6) * (1 - smooth((e.u - e.dur + 6) / 6)); // entra e sai devagar
    if (e.kind === 'neblina') this._fogUpdate(e, dt, t);
    else if (e.kind === 'aguasvivas') this._jellyUpdate(e, dt, t);
    else if (e.kind === 'acampamento') this._campUpdate(e, dt, t);
    else if (e.kind === 'galeao') this._galleonUpdate(e, dt, t);
    else if (e.kind === 'desembarque') this._dropUpdate(e, dt, t);
    else if (e.kind === 'areia') this._sandUpdate(e, dt, t);
    this._traps(e, dt);
  }
  // quanto escurece o céu (usado por events.stormBoost)
  storminess(kind) { return { neblina: 0.3, aguasvivas: 0, acampamento: 0, galeao: 0, desembarque: 0.15, areia: 0.25 }[kind] ?? 0; }

  // Céu/neblina de cada evento (chamado no fim do clima em startup.js)
  applyWeather(t) {
    const e = this.e, G = this.G, fog = G.scene.fog;
    if (!e || !fog || !(e.k > 0)) return;
    const k = e.k, bg = G.scene.background && G.scene.background.isColor ? G.scene.background : null;
    const tint = (hex, a, near, far, sun, hemi) => {
      const c = this._c || (this._c = new THREE.Color()); c.setHex(hex);
      fog.color.lerp(c, a * k); if (bg) bg.lerp(c, a * k * 0.9);
      if (near != null) { fog.near += (near - fog.near) * k; fog.far += (far - fog.far) * k; }
      G.startup.sun.intensity *= 1 - sun * k; G.startup.hemisphere.intensity *= 1 - hemi * k;
    };
    if (e.kind === 'neblina') tint(0xaab6bd, 0.9, 2, 26, 0.35, 0.1);
    else if (e.kind === 'areia') tint(0xc2a06a, 0.9, 2, 24, 0.4, 0.15);
    else if (e.kind === 'aguasvivas') tint(0x081630, 0.85, null, null, 0.82, 0.62);
  }

  // ======================= NEBLINA =======================
  _fogBegin(e) {
    const G = this.G, r = e.r, B = EXTRA_BALANCE.neblina;
    G.hud.msg('Uma neblina densa engole o mar… cuidado com as pedras.');
    if (G.hud.banner) G.hud.banner('NEBLINA', 'Visão curta e pedras escondidas no caminho. Use a vela para desviar.', 'storm', 5);
    const rockMat = M(0x3b3f44, { flatShading: true, roughness: 1 }), mossMat = M(0x2f4a36, { flatShading: true });
    e.rocks = [];
    for (let i = 0; i < B.rocks; i++) { // pedras ao longo da rota, espalhadas para os lados
      const ahead = 35 + i * 14 + r() * 8, lat = (r() - 0.5) * 22;
      const x = e.cx + e.fx * ahead + e.fz * lat, z = e.cz + e.fz * ahead - e.fx * lat, R = 1.2 + r() * 1.6;
      const g = new THREE.Group();
      const geo = new THREE.DodecahedronGeometry(R, 1), p = geo.attributes.position;
      for (let k = 0; k < p.count; k++) { const s = 0.75 + r() * 0.5; p.setXYZ(k, p.getX(k) * s, p.getY(k) * (0.9 + r() * 0.6), p.getZ(k) * s); }
      geo.computeVertexNormals();
      const rock = new THREE.Mesh(geo, rockMat); g.add(rock);
      const moss = new THREE.Mesh(new THREE.TorusGeometry(R * 0.85, 0.25, 6, 14), mossMat); moss.rotation.x = Math.PI / 2; moss.position.y = -0.2; g.add(moss);
      g.position.set(x, sea.level - R * 0.35, z); g.rotation.y = r() * 6.28;
      e.add(g); e.rocks.push({ x, z, R, g, hit: false });
    }
    if (this._host() && G.drops) { // saco raro boiando no meio da neblina
      const ahead = 60 + r() * 40, lat = (r() < 0.5 ? -1 : 1) * (6 + r() * 6);
      const x = e.cx + e.fx * ahead + e.fz * lat, z = e.cz + e.fz * ahead - e.fx * lat;
      G.drops.dropAt({ x, y: sea.level + 0.1, z }, RARE[(r() * RARE.length) | 0]); // na água o saco boia sozinho
    }
  }
  _fogUpdate(e, dt, t) {
    const G = this.G, boat = G.boat;
    for (const rk of e.rocks) {
      rk.g.position.y = waveHeight(rk.x, rk.z, t) * 0.25 + sea.level * 0.75 - rk.R * 0.35;
      const d = Math.hypot(boat.x - rk.x, boat.z - rk.z);
      if (!rk.hit && d < boat.set.radius * 0.75 + rk.R * 0.8) {
        rk.hit = true;
        G.events.shake = Math.max(G.events.shake, 0.7); sfx.collapse ? sfx.collapse(new THREE.Vector3(rk.x, sea.level, rk.z)) : sfx.kick(null);
        G.hud.msg('CRAAACK! A jangada bateu numa pedra escondida na neblina!');
        if (this._host()) {
          const ux = (boat.x - rk.x) / (d || 1), uz = (boat.z - rk.z) / (d || 1);
          boat.fling = { vx: ux * 4, vz: uz * 4, t: 1.2, T: 1.2 }; boat.speed *= 0.3;
          const [lx, lz] = boat.toLocal(rk.x, rk.z); let best = null, bd = Infinity;
          for (const p of boat.pieces.values()) if (G.naval.destructible(p)) { const dd = Math.hypot(p.x - lx, p.z - lz); if (dd < bd) { bd = dd; best = p; } }
          if (best) G.naval.damagePiece(best.id, EXTRA_BALANCE.neblina.rockDmg);
        }
        const pl = G.player; if (pl.aboard && !pl.dead) { pl.body.vel.y = 3.5; pl.body.grounded = false; }
      }
    }
  }

  // ======================= ÁGUAS-VIVAS =======================
  _jellyBegin(e) {
    const G = this.G, r = e.r, B = EXTRA_BALANCE.aguasvivas;
    G.hud.msg('O céu escurece… e o mar começa a brilhar em volta da jangada.');
    if (G.hud.banner) G.hud.banner('ÁGUAS-VIVAS', 'Um enxame bioluminescente cerca a jangada. Lindo — mas não caia na água!', 'good', 6);
    const cols = [0x6ef3ff, 0xff6ad5, 0x9b7bff, 0x7dffb0, 0xffd36e];
    const glowTex = glowTexture();
    e.jellies = [];
    for (let i = 0; i < B.n; i++) {
      const a = r() * 6.28, d = 4.5 + Math.pow(r(), 0.7) * 30, col = cols[(r() * cols.length) | 0], s = 0.6 + r() * 1.1;
      const j = makeGlowJelly(col, glowTex, r);
      j.scale.setScalar(s);
      e.add(j);
      e.jellies.push({ j, a, d, s, ph: r() * 6.28, sp: (0.03 + r() * 0.05) * (r() < 0.5 ? 1 : -1), bob: 0.6 + r() * 0.8, col });
    }
    // plâncton cintilando na superfície em volta
    const N = 900, pos = new Float32Array(N * 3), colArr = new Float32Array(N * 3), c = new THREE.Color();
    e.plank = [];
    for (let i = 0; i < N; i++) { const a = r() * 6.28, d = 3 + Math.sqrt(r()) * 36; e.plank.push({ a, d, ph: r() * 6.28, f: 1 + r() * 3 }); c.setHex(cols[(r() * 3) | 0]); colArr.set([c.r, c.g, c.b], i * 3); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(colArr, 3));
    e.points = e.add(new THREE.Points(g, new THREE.PointsMaterial({ size: 0.28, map: glowTex, vertexColors: true, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false })));
    e.points.frustumCulled = false;
  }
  _jellyUpdate(e, dt, t) {
    const G = this.G, boat = G.boat, pl = G.player, pp = pl.body.pos, k = e.k;
    for (const J of e.jellies) {
      J.a += J.sp * dt; J.ph += dt * J.bob * 2.2;
      const x = boat.x + Math.cos(J.a) * J.d, z = boat.z + Math.sin(J.a) * J.d;
      const pulse = Math.sin(J.ph);
      J.j.position.set(x, waveHeight(x, z, t) - 0.12 + pulse * 0.06, z);
      const u = J.j.userData;
      u.bell.scale.set(1 + pulse * 0.12, 0.82 - pulse * 0.14, 1 + pulse * 0.12); // pulsa como água-viva de verdade
      for (const tc of u.tentacles) tc.rotation.x = 0.25 + Math.sin(J.ph * 1.3 + tc.userData.k) * 0.35;
      u.glowMat.opacity = (0.55 + 0.35 * (0.5 + 0.5 * pulse)) * k;
      u.bellMat.opacity = 0.75 * k + 0.05; u.bellMat.emissiveIntensity = (1.1 + 0.8 * (0.5 + 0.5 * pulse)) * k;
      J.j.visible = k > 0.02;
      // queimadura em quem está nadando perto
      if (pl.swimming && !pl.dead && Math.hypot(pp.x - x, pp.z - z) < 1.3 * J.s) {
        const sv = G.survival, was = sv.buffs.agua_viva > 0; sv.buffs.agua_viva = EXTRA_BALANCE.aguasvivas.sting;
        if (!was) { G.hud.flash('hurt'); if (!e.stungMsg) { e.stungMsg = true; G.hud.msg('Água-viva! Saia da água — você está lento e queimando.'); } }
      }
    }
    const arr = e.points.geometry.attributes.position.array;
    e.plank.forEach((P, i) => {
      const x = boat.x + Math.cos(P.a) * P.d, z = boat.z + Math.sin(P.a) * P.d;
      arr[i * 3] = x; arr[i * 3 + 1] = waveHeight(x, z, t) + 0.04; arr[i * 3 + 2] = z;
    });
    e.points.geometry.attributes.position.needsUpdate = true;
    e.points.material.opacity = k * (0.65 + 0.35 * Math.sin(t * 2.3));
  }

  // ======================= ARMADILHAS (acampamento e galeão) =======================
  // placa no chão; quem pisa (cada jogador cuida do próprio corpo) dispara dardo ou espinhos
  _trap(e, x, y, z, kind) {
    const g = new THREE.Group(); g.position.set(x, y, z);
    const plate = box(0.9, 0.06, 0.9, M(0x6b5a3e)); plate.position.y = 0.03; g.add(plate);
    const spikes = new THREE.Group(); spikes.visible = false;
    if (kind === 'espinhos') for (let i = 0; i < 9; i++) { const s = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.55, 5), M(0x8b8f94, { metalness: 0.7, roughness: 0.4 })); s.position.set(((i % 3) - 1) * 0.28, 0.27, (((i / 3) | 0) - 1) * 0.28); spikes.add(s); }
    g.add(spikes);
    e.add(g);
    e.traps.push({ x, y, z, kind, g, plate, spikes, armed: true, t: 0 });
  }
  _traps(e, dt) {
    const G = this.G, pl = G.player, pp = pl.body.pos;
    for (const T of e.traps) {
      if (T.t > 0) { T.t -= dt; if (T.t <= 0) { T.armed = true; T.spikes.visible = false; T.plate.position.y = 0.03; } continue; }
      if (!T.armed || pl.dead || Math.hypot(pp.x - T.x, pp.z - T.z) > 0.6 || Math.abs(pp.y - T.y) > 0.8) continue;
      T.armed = false; T.t = 3; T.plate.position.y = -0.01; sfx.click(null, 1.6);
      if (T.kind === 'espinhos') {
        T.spikes.visible = true; G.survival.damage(16, 'Armadilha de espinhos'); G.hud.msg('Espinhos saíram do chão!');
        pl.body.vel.y = 3; pl.body.grounded = false;
      } else { // dardo vindo de um lado
        const a = Math.random() * 6.28, from = new THREE.Vector3(pp.x + Math.cos(a) * 6, pp.y + 1.1, pp.z + Math.sin(a) * 6), to = new THREE.Vector3(pp.x, pp.y + 1.1, pp.z);
        if (G.combat && G.combat.tracer) G.combat.tracer(from, to, 0xc8b080);
        setTimeout(() => { if (!pl.dead) { G.survival.damage(11, 'Dardo envenenado'); G.hud.msg('Um dardo saiu da parede!'); } }, 120);
      }
    }
  }

  // ======================= ACAMPAMENTO ABANDONADO =======================
  _ground(x, z, guess) {
    const hits = this.G.colliders.probe ? this.G.colliders.probe(x, z, guess + 30) : null;
    if (Array.isArray(hits) && hits.length) return Math.max(...hits.map((h) => h.top));
    if (hits && hits.top != null) return hits.top;
    return guess;
  }
  _campBegin(e) {
    const G = this.G, r = e.r;
    const isl = G.world.islands.reduce((b, i) => (Math.hypot(i.x - e.x, i.z - e.z) < (b ? Math.hypot(b.x - e.x, b.z - e.z) : Infinity) ? i : b), null);
    const gy = this._ground(e.x, e.z, isl ? isl.set.y + 0.6 : 3);
    e.gy = gy;
    G.hud.msg('Um acampamento abandonado numa ilha à frente… com coisas boas largadas no chão.');
    if (G.hud.banner) G.hud.banner('ACAMPAMENTO ABANDONADO', 'Ninguém à vista. Loot no chão. Desconfie de tudo.', 'pirate', 5);
    const cloth = M(0x8c6b45, { side: THREE.DoubleSide, roughness: 1 }), wood = M(0x6a4b2c);
    const tent = new THREE.Mesh(new THREE.ConeGeometry(1.6, 2.1, 4, 1, true), cloth); tent.position.set(e.x + 2.4, gy + 1.05, e.z - 1.5); tent.rotation.y = 0.8; e.add(tent);
    const fire = new THREE.Group(); fire.position.set(e.x, gy, e.z);
    for (let i = 0; i < 7; i++) { const s = new THREE.Mesh(new THREE.DodecahedronGeometry(0.12, 0), M(0x5d5a55)); s.position.set(Math.cos(i * 0.9) * 0.4, 0.06, Math.sin(i * 0.9) * 0.4); fire.add(s); }
    for (let i = 0; i < 3; i++) { const l = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.7, 6), M(0x2a2420)); l.rotation.set(Math.PI / 2 - 0.25, i * 2.1, 0); l.position.y = 0.1; fire.add(l); }
    e.add(fire);
    const crate = box(0.8, 0.5, 0.6, wood); crate.position.set(e.x - 1.8, gy + 0.25, e.z + 1.2); e.add(crate);
    // loot à vista (sacos) — o host cria
    if (this._host() && G.drops) {
      G.drops.dropAt({ x: e.x + 1.2, y: gy, z: e.z + 1.6 }, RARE[(r() * RARE.length) | 0]);
      G.drops.dropAt({ x: e.x - 1.5, y: gy, z: e.z - 1.4 }, { kit: 1, municao: 12 });
    }
    // armadilhas em volta do loot
    const spots = [[1.2, 0.6], [-0.9, 1.0], [0.4, -1.1], [-1.6, -0.3], [2.0, 1.5], [-0.2, 2.1]];
    spots.forEach(([dx, dz], i) => this._trap(e, e.x + dx, this._ground(e.x + dx, e.z + dz, gy), e.z + dz, i % 2 ? 'dardo' : 'espinhos'));
    // o baú mais bonito é um MÍMICO
    this._mimic(e, e.x + 0.2, gy, e.z - 2.4);
  }
  _campUpdate(e) {
    const G = this.G;
    const cur = G.events.current; // a jangada já passou longe: o evento acaba
    if (this._host() && cur && cur.id === e.id && !e.closing && Math.hypot(G.boat.x - e.x, G.boat.z - e.z) > 260) {
      e.closing = true; cur.dur = Math.min(cur.dur, e.u + 1); if (G.net.online) G.net.send({ t: 'event', e: stripEvent(cur) });
    }
  }
  _mimic(e, x, y, z) {
    const G = this.G, g = new THREE.Group(), wood = M(0x8a5a2a), gold = M(0xd9a441, { metalness: 0.8, roughness: 0.35 });
    const base = box(1.0, 0.55, 0.7, wood); base.position.y = 0.28; g.add(base);
    const lid = new THREE.Group(); lid.position.set(0, 0.55, -0.35);
    const top = box(1.04, 0.22, 0.74, wood); top.position.set(0, 0.11, 0.35); lid.add(top);
    const band = box(1.06, 0.06, 0.76, gold); band.position.set(0, 0.12, 0.35); lid.add(band);
    const teeth = new THREE.Group();
    for (let i = 0; i < 8; i++) { const tth = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.16, 4), M(0xf1ead8)); tth.position.set(-0.42 + i * 0.12, -0.02, 0.69); tth.rotation.x = Math.PI; teeth.add(tth); }
    lid.add(teeth);
    const tongue = box(0.3, 0.05, 0.5, M(0xc0384a)); tongue.position.set(0, 0.5, 0.05); g.add(tongue); tongue.visible = false;
    for (const s of [-1, 1]) { const ey = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffd040 })); ey.position.set(s * 0.25, 0.5, 0.36); ey.visible = false; g.add(ey); g.userData['eye' + s] = ey; }
    g.add(lid);
    g.position.set(x, y, z);
    G.scene.add(g);
    const m = G.enemies.addCreature({
      id: `${e.id}-mim`, mesh: g, hp: 110, max: 110, def: { nome: 'Baú mímico', hitR: 0.6 }, body: { pos: new THREE.Vector3(x, y, z) },
      awake: false, cd: 0, hop: 0,
      ai: {
        update: (c, dt) => this._mimicTick(c, dt, lid, tongue, g),
        onHit: (c) => { c.awake = true; },
        onDeath: (c, by) => {
          sfx.enemyDown(c.body.pos); G.scene.remove(g);
          if (by === 'L') G.hud.msg('Mímico derrotado! ' + G.survival.add({ kit: 1, municao: 18, energetico: 1 }));
        },
      },
    });
    e.mimic = m;
  }
  _mimicTick(c, dt, lid, tongue, g) {
    const G = this.G, pl = G.player, pp = pl.body.pos, p = c.body.pos;
    const d = Math.hypot(pp.x - p.x, pp.z - p.z);
    if (!c.awake && d < 2.2 && !pl.dead) { c.awake = true; sfx.crate(); G.hud.msg('O BAÚ ABRIU A BOCA — é um MÍMICO!'); if (G.events) G.events.shake = Math.max(G.events.shake, 0.3); }
    if (!c.awake) { lid.rotation.x = 0; return; }
    g.userData['eye-1'].visible = g.userData.eye1.visible = tongue.visible = true;
    c.cd -= dt; c.hop += dt * 6;
    const chomp = 0.5 + 0.5 * Math.sin(c.hop * 2);
    lid.rotation.x = -0.25 - chomp * 0.7;
    if (d > 1.3 && d < 25) { // pulinhos até você
      const sp = 2.6 * dt; p.x += (pp.x - p.x) / d * sp; p.z += (pp.z - p.z) / d * sp;
      g.rotation.y = Math.atan2(pp.x - p.x, pp.z - p.z);
    }
    g.position.set(p.x, p.y + Math.abs(Math.sin(c.hop)) * 0.35, p.z);
    if (d < 1.6 && c.cd <= 0 && !pl.dead) { c.cd = 1.1; G.survival.damage(10, 'Mordida do mímico'); sfx.hit(p, true); lid.rotation.x = 0; }
  }

  // ======================= GALEÃO ANTIGO (seca) =======================
  _galleonBegin(e) {
    const G = this.G, r = e.r;
    const gy = G.world.seabedHeight(e.x, e.z);
    e.gy = gy;
    G.hud.msg('A seca revelou um GALEÃO antigo enterrado na areia!');
    if (G.hud.banner) G.hud.banner('GALEÃO ANTIGO', 'Entre pelo rombo do casco e pegue o tesouro antes de a água voltar.', 'pirate', 6);
    const L = 22, W = 7, H = 5.2, T = 0.3;
    const wood = M(0x8a6440, { roughness: 1, map: woodTex() }), dark = M(0x5e4430, { roughness: 1, map: woodTex() }), deckM = M(0x9a7550, { map: woodTex() });
    const grp = new THREE.Group(); grp.position.set(e.x, gy - 1.2, e.z); grp.rotation.set(0, e.yaw, 0.08);
    const set = { x: e.x, z: e.z, yaw: e.yaw, y: gy - 1.2, radius: L * 0.6 + 2, items: [] };
    const part = (w, h, l, x, y, z, m = wood, solid = true) => {
      const b = box(w, h, l, m); b.position.set(x, y, z); grp.add(b);
      if (solid) set.items.push({ type: 'box', x, y, z, hx: w / 2, hy: h / 2, hz: l / 2, yaw: 0 });
      return b;
    };
    // casco: fundo, laterais (a de +X tem um ROMBO para entrar), proa/popa, convés com buracos
    part(W, T, L, 0, 0.9, 0, deckM);                                   // piso do porão
    part(T, H, L * 0.38, -W / 2, H / 2 + 0.9, -L * 0.31); part(T, H, L * 0.38, -W / 2, H / 2 + 0.9, L * 0.31); part(T, H, L * 0.24, -W / 2, H / 2 + 0.9, 0);
    part(T, H, L * 0.4, W / 2, H / 2 + 0.9, -L * 0.3); part(T, H, L * 0.4, W / 2, H / 2 + 0.9, L * 0.3);
    part(T, H - 2.6, L * 0.2, W / 2, H - 0.4 + 0.9, 0);                // rombo embaixo (2,6 m de altura) no meio de +X
    part(W, H, T, 0, H / 2 + 0.9, -L / 2); part(W * 0.7, H, T, 0, H / 2 + 0.9, L / 2, dark);
    part(W, T, L * 0.35, 0, H + 0.9, -L * 0.32, deckM); part(W, T, L * 0.3, 0, H + 0.9, L * 0.35, deckM); // convés (buraco no meio = luz)
    // anteparas internas com porta (3 cômodos)
    for (const zz of [-L * 0.17, L * 0.17]) { part(W * 0.34, H, T, -W * 0.33, H / 2 + 0.9, zz, dark); part(W * 0.34, H, T, W * 0.33, H / 2 + 0.9, zz, dark); part(W * 0.32, H - 2.3, T, 0, H - 0.25 + 0.9, zz, dark); }
    // mastro quebrado, proa e detalhes (sem colisão)
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.32, 7, 8), dark); mast.position.set(0.5, H + 4, -2); mast.rotation.z = 0.6; grp.add(mast);
    const bow = new THREE.Mesh(new THREE.ConeGeometry(W / 2, 4, 4, 1, true), wood); bow.rotation.set(Math.PI / 2, Math.PI / 4, 0); bow.position.set(0, H / 2 + 0.9, L / 2 + 2); bow.scale.set(1, 1, 0.7); grp.add(bow);
    for (let i = 0; i < 6; i++) { const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), new THREE.MeshBasicMaterial({ color: 0x9fffcf })); lamp.position.set((i % 2 ? 1 : -1) * (W / 2 - 0.4), 3.2, -L * 0.4 + i * L * 0.16); grp.add(lamp); } // lanternas fantasmas
    grp.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    e.add(grp); e.grp = grp;
    G.colliders.addSet(set); G.physics.addStaticSet(set); e.set = set;
    // posições locais → mundo
    const W2 = (lx, lz) => { const c = Math.cos(e.yaw), s = Math.sin(e.yaw); return [e.x + lx * c + lz * s, e.z - lx * s + lz * c]; };
    const floorY = gy - 1.2 + 0.9 + T / 2;
    e.floorY = floorY;
    // armadilhas no corredor do meio e na sala do tesouro
    for (const [lx, lz, k] of [[1.2, -1.5, 'dardo'], [-1.0, 1.0, 'espinhos'], [0.8, -L * 0.25, 'espinhos'], [-1.2, -L * 0.3, 'dardo'], [0.3, -L * 0.36, 'espinhos']]) { const [x, z] = W2(lx, lz); this._trap(e, x, floorY, z, k); }
    // tesouro na sala do fundo (-Z): baú dourado e o loot no chão
    const [tx, tz] = W2(0, -L * 0.4);
    const chest = box(1.1, 0.7, 0.7, M(0xb8862e, { metalness: 0.6, roughness: 0.4 })); chest.position.set(tx, floorY + 0.35, tz); e.add(chest);
    if (this._host()) {
      if (G.drops) { G.drops.dropAt({ x: tx + 0.8, y: floorY, z: tz }, RARE[(r() * RARE.length) | 0]); G.drops.dropAt({ x: tx - 0.8, y: floorY, z: tz }, { kit: 1, bala_canhao: 6, chocolate: 2 }); }
      // piratas-fantasma acordam nos cômodos
      const n = 3 + ((r() * 3) | 0);
      for (let i = 0; i < n; i++) {
        const [x, z] = W2((r() - 0.5) * 3, -L * 0.35 + i * (L * 0.7 / n));
        this._spawnWalker(e, `${e.id}-g${i}`, 'fantasma', x, z, floorY, true);
      }
    }
  }
  _galleonUpdate(e) {
    const G = this.G, st = G.startup;
    // água voltando: o galeão some devagar (afunda na areia)
    if (st.waterLevel > e.gy + 0.5 && e.grp) e.grp.position.y = Math.max(e.gy - 9, e.grp.position.y - 0.03);
  }

  // inimigo a pé (fundo do mar) que pertence ao evento
  _spawnWalker(e, id, type, x, z, y, ghost = false) {
    const G = this.G, E = G.enemies;
    if (!E.auth) return null;
    const en = E.spawn(id, type, null, x, z);
    E.toLand(en, x, z);
    en.pirate = false; en.extraId = e.id;
    en.body.pos.y = y + 0.1;
    if (en.isl) { en.isl.R = 40; en.isl.minY = y - 4; en.isl.set = { y: y - 0.4 }; }
    if (ghost) ghostify(en);
    return en;
  }

  // ======================= DESEMBARQUE MILITAR (seca) =======================
  _dropBegin(e) {
    const G = this.G, r = e.r, boat = G.boat;
    G.hud.msg('Hélices ao longe… um helicóptero militar vem na direção da jangada encalhada!');
    if (G.hud.banner) G.hud.banner('DESEMBARQUE MILITAR', 'Soldados vão descer de rapel na seca. Aguente até a água voltar!', 'pirate', 6);
    const h = makeHelicopter({ seed: 9 });
    h.traverse((o) => { if (o.isMesh && o.material && o.material.color) { o.material = o.material.clone(); const c = o.material.color; if (c.r > 0.7 && c.g > 0.7) c.setHex(0x4b5530); else if (c.r > 0.6) c.setHex(0x2d331c); } });
    h.scale.setScalar(1.15);
    e.heli = e.add(h);
    const a = r() * 6.28;
    e.from = new THREE.Vector3(boat.x + Math.sin(a) * 220, 45, boat.z + Math.cos(a) * 220);
    e.hover = new THREE.Vector3(
      boat.x + Math.sin(a) * 24, G.world.seabedHeight(boat.x + Math.sin(a) * 24, boat.z + Math.cos(a) * 24) + 9, boat.z + Math.cos(a) * 24);
    e.ropes = []; e.dropped = 0; e.nSold = Math.round(between(r, EXTRA_BALANCE.desembarque.soldiers));
    e.spin = 0;
  }
  _dropUpdate(e, dt) {
    const G = this.G, h = e.heli, u = e.u, cam = G.camera.position;
    // chega (0–9 s), paira soltando soldados (9–17 s) e vai embora
    let pos;
    if (u < 9) pos = e.from.clone().lerp(e.hover, smooth(u / 9));
    else if (u < 17) pos = e.hover.clone().add(new THREE.Vector3(Math.sin(u * 0.8) * 0.6, Math.sin(u * 1.3) * 0.3, 0));
    else pos = e.hover.clone().lerp(e.from.clone().setY(60), smooth((u - 17) / 10));
    h.position.copy(pos);
    const dir = u < 9 ? e.hover.clone().sub(e.from) : u > 17 ? e.from.clone().sub(e.hover) : new THREE.Vector3(G.boat.x - pos.x, 0, G.boat.z - pos.z);
    h.rotation.set(u < 9 || u > 17 ? 0.15 : 0.02, Math.atan2(dir.x, dir.z), 0, 'YXZ');
    h.visible = u < 27;
    e.spin += dt * 30; h.userData.rotor.rotation.y = e.spin; h.userData.tailRotor.rotation.x = e.spin * 2;
    const dist = pos.distanceTo(cam);
    heliRotor(h.visible ? clamp(1 - dist / 220, 0, 1) : 0, 9);
    if (u > 10 && e.dropped < e.nSold && u > 10 + e.dropped * 1.4) { // um soldado por vez, de rapel
      const i = e.dropped++, off = (i - (e.nSold - 1) / 2) * 1.6;
      const x = pos.x + Math.cos(h.rotation.y) * off, z = pos.z - Math.sin(h.rotation.y) * off, gy = G.world.seabedHeight(x, z);
      const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, pos.y - gy, 4), M(0x2a2a20)); rope.position.set(x, (pos.y + gy) / 2, z); e.add(rope); e.ropes.push({ rope, t: 3 });
      if (this._host()) { const type = ['soldado', 'escopeteiro', 'soldado', 'pesado', 'elite'][i % 5]; this._spawnWalker(e, `${e.id}-s${i}`, type, x, z, gy); }
      sfx.click(null, 0.8);
    }
    for (const R of e.ropes) { R.t -= dt; R.rope.visible = R.t > 0; }
  }

  // ======================= TEMPESTADE DE AREIA (seca) =======================
  _sandBegin(e) {
    const G = this.G, r = e.r;
    G.hud.msg('O vento levanta a areia do fundo do mar — tempestade de areia!');
    if (G.hud.banner) G.hud.banner('TEMPESTADE DE AREIA', 'Visão curta e vento forte. O vento desenterra coisas pela seca.', 'storm', 5);
    e.windA = r() * 6.28;
    // poeira em riscos horizontais em volta da câmera
    const N = 1400, pos = new Float32Array(N * 6), col = new Float32Array(N * 6);
    for (let i = 0; i < N; i++) col.set([0.86, 0.74, 0.52, 0.55, 0.45, 0.3], i * 6);
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    e.dust = e.add(new THREE.LineSegments(g, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0, depthWrite: false })));
    e.dust.frustumCulled = false;
    e.dp = Array.from({ length: N }, () => ({ x: (r() - 0.5) * 60, y: r() * 10, z: (r() - 0.5) * 60, v: 10 + r() * 10 }));
    // o vento desenterra sacos de loot pela seca (host)
    if (this._host() && G.drops) {
      const b = G.boat;
      for (let i = 0; i < 4; i++) {
        const a = r() * 6.28, d = 14 + r() * 40, x = b.x + Math.cos(a) * d, z = b.z + Math.sin(a) * d;
        G.drops.dropAt({ x, y: G.world.seabedHeight(x, z), z }, i === 0 ? RARE[(r() * RARE.length) | 0] : [{ municao: 10, bandagem: 1 }, { barra_proteina: 1, chocolate: 1, cartucho: 4 }, { bala_canhao: 4, energetico: 1 }][i - 1]);
      }
    }
  }
  _sandUpdate(e, dt) {
    const G = this.G, cam = G.camera.position, k = e.k, pl = G.player;
    e.windA += dt * 0.05;
    const wx = Math.cos(e.windA), wz = Math.sin(e.windA);
    const arr = e.dust.geometry.attributes.position.array;
    e.dp.forEach((d, i) => {
      d.x += wx * d.v * dt; d.z += wz * d.v * dt;
      if (Math.abs(d.x) > 30 || Math.abs(d.z) > 30) { d.x = -wx * 28 + (Math.random() - 0.5) * 50 * Math.abs(wz); d.z = -wz * 28 + (Math.random() - 0.5) * 50 * Math.abs(wx); }
      const x = cam.x + d.x, y = cam.y - 3 + d.y, z = cam.z + d.z, L = 0.06 * d.v;
      arr.set([x, y, z, x - wx * L, y, z - wz * L], i * 6);
    });
    e.dust.geometry.attributes.position.needsUpdate = true;
    e.dust.material.opacity = 0.55 * k;
    // o vento empurra quem está a pé
    if (!pl.aboard && !pl.dead) pl.drift = { x: wx * 1.6 * k, z: wz * 1.6 * k }; else pl.drift = null;
    if (G.gfx && Math.random() < dt * 0.3 * k) G.gfx.wetLens(0.25);
  }
}

// evento "limpo" para mandar pela rede (sem os campos internos)
function stripEvent(e) { const o = {}; for (const k of ['id', 'kind', 't0', 'dur', 'seed', 'cx', 'cz', 'fx', 'fz', 'x', 'z', 'yaw']) if (e[k] !== undefined) o[k] = e[k]; return o; }

// ---------- visuais compartilhados ----------
let _glow = null;
function glowTexture() {
  if (_glow) return _glow;
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'), grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)'); grad.addColorStop(0.35, 'rgba(255,255,255,0.45)'); grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad; g.fillRect(0, 0, 64, 64);
  return (_glow = new THREE.CanvasTexture(c));
}
// água-viva bioluminescente: sino translúcido que brilha, miolo claro, halo e tentáculos em fita
function makeGlowJelly(color, glowTex, r) {
  const g = new THREE.Group();
  const bellMat = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 1.4, transparent: true, opacity: 0.8, roughness: 0.15, side: THREE.DoubleSide, depthWrite: false });
  const bell = new THREE.Mesh(new THREE.SphereGeometry(0.45, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.55), bellMat);
  bell.position.y = 0.15; g.add(bell);
  const core = new THREE.Mesh(new THREE.SphereGeometry(0.18, 12, 8), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }));
  core.position.y = 0.3; bell.add(core);
  const glowMat = new THREE.SpriteMaterial({ map: glowTex, color, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
  const halo = new THREE.Sprite(glowMat); halo.scale.setScalar(2.6); halo.position.y = 0.2; g.add(halo);
  const tm = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  const tentacles = [];
  for (let i = 0; i < 8; i++) {
    const a = i / 8 * Math.PI * 2, piv = new THREE.Group();
    piv.position.set(Math.cos(a) * 0.3, 0.12, Math.sin(a) * 0.3); piv.rotation.y = -a; piv.userData.k = i + r() * 3;
    const len = 0.8 + r() * 0.9;
    const t = new THREE.Mesh(new THREE.PlaneGeometry(0.06, len, 1, 4), tm); t.position.y = -len / 2; piv.add(t);
    g.add(piv); tentacles.push(piv);
  }
  g.traverse((o) => { o.userData.noShadow = true; });
  g.userData = { bell, bellMat, glowMat, tentacles };
  return g;
}
