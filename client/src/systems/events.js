// Eventos aleatórios em alto-mar (só depois da partida):
//   • Onda gigante (tsunami): uma frente de água atravessa o mar. Baixe a vela e segure-se
//     perto do mastro; com a vela cheia a jangada é arremessada e todos se machucam.
//   • Furacão: o mar se abre num REDEMOINHO gigante ao lado da rota que gira e vai sugando a
//     jangada aos poucos. Levante a vela e gire-a para o lado OPOSTO ao redemoinho para escapar.
//   • Tempestade forte: céu fecha, raios e uma SÉRIE de ondas gigantes vindas de lados diferentes que
//     chacoalham a jangada (segure no mastro!).
//   • No furacão o vento/giro EMPURRA quem está a bordo para fora: ande em direção ao redemoinho ou
//     você escorrega e cai da jangada.
// Nada é anunciado: os eventos são raros, chegam do nada e cada um sai um pouco diferente.
// O host sorteia e anuncia o evento pela rede; todos os clientes derivam o estado do mesmo
// relógio comum (clock), então ondas e funil aparecem iguais para todos. Só o host move o barco.
import * as THREE from '../three.js';
import { clamp, clock, mulberry32 } from '../core/util.js';
import { sea, eventHeight } from '../world/ocean.js';
import { sfx, ambience } from '../core/sfx.js';
import { SEA_KINDS, SEA_BALANCE } from './seaevents.js';

export const EVENT_BALANCE = {
  first: [200, 320],         // s depois da partida até o primeiro evento
  interval: [260, 460],      // s entre o fim de um evento e o próximo
  tsunami: { speed: [13, 18], startDist: 235, A: [3.6, 5.6], sigma: [9, 13], damage: 22, knock: 8.5 },
  // R = raio do redemoinho, depth = fundura do funil d'água, pull = puxão (m/s), swirl = giro (m/s)
  tempestade: { dur: [75, 100], waves: [5, 8], A: [2.6, 4.3], speed: [12, 16], sigma: [7, 10], start: 120, knock: 6 },
  furacao: { push: 2.6, dur: [55, 75], pull: 1.55, swirl: 2.2, R: [60, 85], depth: [7, 11], ahead: 40, damage: 30 },
};
const between = ([a, b]) => a + Math.random() * (b - a);
const smooth = (x) => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); };

let dotTex = null;
function softDot() {
  if (dotTex) return dotTex;
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'), grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)'); grad.addColorStop(0.45, 'rgba(255,255,255,0.55)'); grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad; g.fillRect(0, 0, 64, 64);
  dotTex = new THREE.CanvasTexture(c);
  return dotTex;
}

// Faixas de vento/nuvem para o funil (alfa em tiras inclinadas).
function streakTexture(seed) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 512;
  const g = c.getContext('2d');
  let s = seed;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  g.clearRect(0, 0, 256, 512);
  for (let i = 0; i < 120; i++) {
    const x = rnd() * 256, w = 4 + rnd() * 22, a = 0.1 + rnd() * 0.35, l = 0.7 + rnd() * 0.3;
    g.strokeStyle = `rgba(255,255,255,${a})`; g.lineWidth = w; g.lineCap = 'round';
    const top = 512 * (1 - l);
    g.beginPath(); g.moveTo(x, 512); g.bezierCurveTo(x + 30, 340, x - 20, 180, x + 50, top); g.stroke();
    g.beginPath(); g.moveTo(x - 256, 512); g.bezierCurveTo(x - 226, 340, x - 276, 180, x - 206, top); g.stroke();
  }
  // some nas pontas (topo some na nuvem, base no mar de espuma)
  const fade = g.createLinearGradient(0, 0, 0, 512);
  fade.addColorStop(0, 'rgba(0,0,0,1)'); fade.addColorStop(0.12, 'rgba(0,0,0,0)');
  fade.addColorStop(0.93, 'rgba(0,0,0,0)'); fade.addColorStop(1, 'rgba(0,0,0,0.6)');
  g.globalCompositeOperation = 'destination-out'; g.fillStyle = fade; g.fillRect(0, 0, 256, 512);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.RepeatWrapping; t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

// Braços em espiral da nuvem do furacão, com o olho vazio no meio.
function spiralTexture() {
  const S = 512, c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d'), cx = S / 2;
  for (let arm = 0; arm < 4; arm++) {
    for (let i = 0; i < 260; i++) {
      const u = i / 260, ang = arm * Math.PI / 2 + u * 7.5, r = 22 + u * (S / 2 - 30);
      const x = cx + Math.cos(ang) * r, y = cx + Math.sin(ang) * r, rad = 10 + u * 46;
      const grad = g.createRadialGradient(x, y, 0, x, y, rad);
      grad.addColorStop(0, `rgba(255,255,255,${0.16 * (1 - u * 0.5)})`); grad.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = grad; g.beginPath(); g.arc(x, y, rad, 0, Math.PI * 2); g.fill();
    }
  }
  const base = g.createRadialGradient(cx, cx, 18, cx, cx, cx);
  base.addColorStop(0, 'rgba(255,255,255,0)'); base.addColorStop(0.12, 'rgba(255,255,255,0.35)');
  base.addColorStop(0.75, 'rgba(255,255,255,0.3)'); base.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = base; g.fillRect(0, 0, S, S);
  return new THREE.CanvasTexture(c);
}

export class Events {
  constructor(G) {
    this.G = G;
    this.current = null;
    this.timer = between(EVENT_BALANCE.first);
    this.lastKind = null;
    this.shake = 0;
    this.flash = 0;
    this.impacted = false;
    this.sucked = false;
    this.visuals = null;
  }

  get active() { return !!this.current; }
  // Inclinação máxima permitida ao barco (onda gigante e furacão balançam bem mais).
  get tiltMax() {
    const e = this.current;
    if (!e) return 0.12;
    return e.kind === 'tsunami' ? 0.34 : e.kind === 'tempestade' ? 0.3 : e.kind === 'kraken' ? 0.24 : 0.18;
  }
  // Quanto o evento escurece o céu / engrossa o mar (0..1).
  stormBoost(t) {
    const e = this.current;
    if (!e) return 0;
    const u = t - e.t0, inK = smooth(u / 10), outK = 1 - smooth((u - e.dur + 8) / 8);
    const k = { tsunami: 0.7, kraken: 0.55, tubaroes: 0.15, peixes: 0, raios: 1, fantasma: 0.6 }[e.kind] ?? 1;
    return k * inK * outK;
  }
  // névoa verde do navio-fantasma (0..1)
  ghostFog(t) {
    const e = this.current;
    if (!e || e.kind !== 'fantasma') return 0;
    const u = t - e.t0;
    return smooth(u / 12) * (1 - smooth((u - e.dur + 10) / 10));
  }

  // ---------- agendamento (host) ----------
  _isHost() { const n = this.G.net; return !n.online || n.isHost; }

  _schedule(dt, t) {
    const G = this.G;
    if (!G.startup.departed || this.current) return;
    this.timer -= dt;
    if (this.timer > 0) return;
    if (G.enemies.list.some((e) => e.pirate && e.state !== 'dead')) { this.timer = 15; return; }
    if (G.naval && G.naval.active) { this.timer = 30; return; } // nada de onda/furacão no meio da batalha naval
    const tide = G.startup.tide.state; // só com o mar cheio e longe da próxima seca
    if (G.startup.waterLevel < 0.5 || (tide && (tide.phase.id === 'seco' || tide.nextIn < 75))) { this.timer = 15; return; }
    // quase nunca repete o mesmo tipo em seguida; às vezes o mar simplesmente fica quieto
    if (Math.random() < 0.18) { this.timer = between([90, 200]); return; }
    const kinds = ['tsunami', 'furacao', 'tempestade', ...SEA_KINDS, 'fantasma'], others = kinds.filter((k) => k !== this.lastKind);
    const kind = Math.random() < 0.88 ? others[(Math.random() * others.length) | 0] : kinds[(Math.random() * kinds.length) | 0];
    this.begin(this.make(kind, t), true);
  }
  make(kind, t) {
    if (kind === 'tsunami') return this._makeTsunami(t);
    if (kind === 'furacao') return this._makeHurricane(t);
    if (kind === 'tempestade') return this._makeStorm(t);
    const dur = kind === 'fantasma' ? 240 : SEA_BALANCE[kind].dur;
    return { id: `ev${Math.floor(t * 10)}`, kind, t0: t, dur, seed: Math.floor(Math.random() * 1e9) };
  }

  // Tempestade: a série de ondas sai de uma seed (todos os clientes calculam igual).
  _makeStorm(t) {
    const B = EVENT_BALANCE.tempestade, boat = this.G.boat;
    return {
      id: `ev${Math.floor(t * 10)}`, kind: 'tempestade', t0: t, dur: between(B.dur),
      seed: Math.floor(Math.random() * 1e9), n: Math.round(between(B.waves)), cx: boat.x, cz: boat.z, fx: Math.sin(boat.yaw), fz: Math.cos(boat.yaw),
    };
  }
  _stormWaves(e) {
    if (e._waves) return e._waves;
    const B = EVENT_BALANCE.tempestade, r = mulberry32(e.seed | 0), list = [];
    let at = 12 + r() * 6;
    for (let i = 0; i < e.n && at < e.dur - 14; i++) {
      const rel = (r() - 0.5) * Math.PI * 1.7, a = Math.atan2(e.fx, e.fz) + Math.PI + rel; // de onde vem (raramente por trás)
      list.push({ at, ang: a, A: B.A[0] + r() * (B.A[1] - B.A[0]), speed: B.speed[0] + r() * (B.speed[1] - B.speed[0]), sigma: B.sigma[0] + r() * (B.sigma[1] - B.sigma[0]), hit: false });
      at += 8 + r() * 7;
    }
    return (e._waves = list);
  }

  _makeTsunami(t) {
    const B = EVENT_BALANCE.tsunami, boat = this.G.boat;
    // Vem de qualquer lado, menos exatamente por trás (assim dá para ver a parede chegando).
    const rel = (Math.random() < 0.5 ? 1 : -1) * (0.35 + Math.random() * 2.1);
    const a = boat.yaw + Math.PI + rel; // direção de onde a onda vem
    const sx = Math.sin(a), sz = Math.cos(a), speed = between(B.speed);
    return {
      id: `ev${Math.floor(t * 10)}`, kind: 'tsunami', t0: t, dur: (B.startDist + 170) / speed,
      ox: boat.x + sx * B.startDist, oz: boat.z + sz * B.startDist, dx: -sx, dz: -sz,
      speed, A: between(B.A), sigma: between(B.sigma),
    };
  }

  _makeHurricane(t) {
    const B = EVENT_BALANCE.furacao, boat = this.G.boat;
    const fx = Math.sin(boat.yaw), fz = Math.cos(boat.yaw), lx = fz, lz = -fx; // lx,lz = local +X
    const side = Math.random() < 0.5 ? 1 : -1, R = between(B.R);
    // O redemoinho se abre ao lado da rota (a jangada já começa na borda dele) e acompanha a
    // jangada: começa um pouco à frente e termina atrás. Baixar a vela não faz ele "passar".
    return {
      id: `ev${Math.floor(t * 10)}`, kind: 'furacao', t0: t, dur: between(B.dur),
      cx: boat.x, cz: boat.z, fx, fz, lat: side * R * (0.92 + Math.random() * 0.18), latV: -side * (0.15 + Math.random() * 0.15),
      ahead: B.ahead * (0.6 + Math.random() * 0.8), R, depth: between(B.depth), spin: Math.random() < 0.5 ? 1 : -1,
    };
  }

  // ---------- início / fim (todos os clientes) ----------
  begin(e, announce = false) {
    if (!e || (this.current && this.current.id === e.id)) { if (e && this.current) Object.assign(this.current, e); return; }
    this.current = e;
    this.impacted = false;
    this.sucked = false; this.pushWarned = false; this.stormWarned = false;
    this.lastKind = e.kind;
    this._ensureVisuals();
    if (announce && this.G.net.online) this.G.net.send({ t: 'event', e });
    if (e.kind === 'fantasma') {
      if (announce && this._isHost()) this.G.naval.startGhost();
      this.G.hud.msg('Uma névoa estranha e esverdeada cobre o mar...');
    }
  }

  receive(e) {
    if (!e || typeof e.kind !== 'string') return;
    if (e.end) { if (this.current && this.current.id === e.id) this._end(); return; }
    if (clock() > e.t0 + e.dur) return;
    this.begin(e);
  }

  _end() {
    const old = this.current;
    this.current = null;
    if (old && SEA_KINDS.includes(old.kind) && this.G.seaEvents) this.G.seaEvents.finish(old);
    if (old && old.kind === 'furacao') { // o redemoinho fecha e deixa um naufrágio raro no centro
      this.G.hud.msg('O redemoinho se fechou e trouxe à tona destroços de um naufrágio!');
      if (this._isHost() && this.lastCx != null && this.G.seaEvents) this.G.seaEvents.spawnLoot(this.lastCx, this.lastCz, 3, 'naufragio');
    }
    sea.surge.A = 0;
    sea.vortex.k = 0;
    this.timer = between(EVENT_BALANCE.interval);
    const enemies = this.G.enemies;
    enemies.pirateSpawnTimer = Math.max(enemies.pirateSpawnTimer, 45); // folga antes de piratas
    if (this.visuals) this._hideVisuals();
  }

  // ---------- loop ----------
  update(dt, t) {
    const G = this.G;
    if (!G.started) return;
    if (this._isHost()) this._schedule(dt, t);
    const e = this.current;
    // som ambiente: mar e vento (mais forte na tempestade e no furacão)
    const amb = !e ? 0 : e.kind === 'tempestade' || e.kind === 'raios' ? 1 : e.kind === 'furacao' ? 0.85 : e.kind === 'peixes' ? 0.1 : 0.35;
    this.ambK = (this.ambK || 0) + (amb - (this.ambK || 0)) * Math.min(1, dt * 0.5);
    ambience(this.ambK, G.startup && G.startup.waterLevel < 0.5 ? 0.15 : 1);
    if (e) {
      if (t > e.t0 + e.dur) this._end();
      else if (e.kind === 'tsunami') this._updateTsunami(e, dt, t);
      else if (e.kind === 'tempestade') this._updateStorm(e, dt, t);
      else if (e.kind === 'furacao') this._updateHurricane(e, dt, t);
      else if (SEA_KINDS.includes(e.kind)) G.seaEvents.update(e, dt, t);
      else if (e.kind === 'fantasma' && this._isHost() && t - e.t0 > 15 && ![...G.naval.ships.values()].some((s) => s.ghost && s.sinkT <= 0 && !s.retreat)) {
        e.dur = Math.min(e.dur, t - e.t0 + 8); // navio afundou (ou fugiu): a névoa se dissipa
        if (G.net.online) G.net.send({ t: 'event', e });
      }
    }
    if (!e || e.kind !== 'furacao') G.player.drift = null;
    if (e && e.kind === 'tempestade' && Math.random() < dt * 0.6 * this.stormBoost(t)) {
      this.flash = 1; G.hud.flash('lightning'); this.shake = Math.max(this.shake, 0.15);
      sfx.thunder(0.2 + Math.random() * 1.2, Math.random());
    }
    // relâmpagos durante o furacão
    if (this.flash > 0) this.flash = Math.max(0, this.flash - dt * 3);
    if (e && e.kind === 'furacao' && Math.random() < dt * 0.35 * this.stormBoost(t)) {
      this.flash = 1;
      G.hud.flash('lightning');
      sfx.thunder(0.3 + Math.random() * 1.5, Math.random() * 0.7);
    }
    G.startup.hemisphere.intensity += this.flash * 2.2;
  }

  applyShake(camera, dt) {
    if (this.shake <= 0) return;
    const mul = this.G.gfx ? this.G.gfx.shakeMul : 1; // menu Gráficos → Imersão → Tremor
    this.shakeT = (this.shakeT || 0) + dt;
    if (mul > 0) {
      // tremor suave (ruído de senos) em vez de pulos aleatórios: posição + um pouco de rotação
      const s = this.shake * 0.16 * mul, t = this.shakeT * 31;
      const n = (a, b) => Math.sin(t * a + b) * 0.6 + Math.sin(t * a * 2.3 + b * 1.7) * 0.4;
      camera.position.x += n(1.0, 0.3) * s; camera.position.y += n(1.3, 2.1) * s; camera.position.z += n(0.9, 4.2) * s;
      camera.rotateX(n(1.1, 1.2) * s * 0.05); camera.rotateZ(n(0.8, 3.3) * s * 0.07);
    }
    this.shake = Math.max(0, this.shake - dt * 0.9);
  }

  _relativeDir(x, z) {
    // Direção relativa à câmera do jogador local ("à frente", "à esquerda"...)
    const p = this.G.player, pp = p.body.pos;
    const dx = x - pp.x, dz = z - pp.z, len = Math.hypot(dx, dz) || 1;
    const fx = -Math.sin(p.camYaw), fz = -Math.cos(p.camYaw), rx = Math.cos(p.camYaw), rz = -Math.sin(p.camYaw);
    const f = (dx * fx + dz * fz) / len, r = (dx * rx + dz * rz) / len;
    const ang = Math.atan2(r, f);
    const label = Math.abs(f) > Math.abs(r) ? (f > 0 ? 'à frente' : 'atrás') : (r > 0 ? 'à direita' : 'à esquerda');
    return { ang, label };
  }

  // Jogador local se segura no mastro se estiver perto dele (a bordo).
  _holdingMast() {
    const G = this.G, pp = G.player.body.pos, [mx, mz] = G.boat.mastWorld();
    return G.player.aboard && Math.hypot(pp.x - mx, pp.z - mz) < 2.6;
  }

  _updateTsunami(e, dt, t) {
    const G = this.G, boat = G.boat, B = EVENT_BALANCE.tsunami, u = t - e.t0;
    const ramp = smooth(u / 3) * (1 - smooth((u - e.dur + 4) / 4));
    const front = e.speed * u;
    Object.assign(sea.surge, { A: e.A * ramp, ox: e.ox, oz: e.oz, dx: e.dx, dz: e.dz, front, sigma: e.sigma });

    const sd = (boat.x - e.ox) * e.dx + (boat.z - e.oz) * e.dz - front; // >0: onda ainda não chegou
    if (!this.impacted && sd <= 0) {
      this.impacted = true;
      this._tsunamiImpact(e);
    }
    this._updateSpray(e, front, ramp, t);
  }

  // Ondas da tempestade: cada uma passa pela jangada e dá um tranco (menor que a onda gigante).
  _updateStorm(e, dt, t) {
    const G = this.G, boat = G.boat, B = EVENT_BALANCE.tempestade, u = t - e.t0;
    let cur = null;
    for (const w of this._stormWaves(e)) {
      const wu = u - w.at; if (wu < 0) continue;
      const front = w.speed * wu;
      if (front > B.start + 90) continue;
      cur = w;
      // centro da tempestade acompanha a jangada (as ondas sempre chegam até ela)
      const ox = boat.x + Math.sin(w.ang) * B.start, oz = boat.z + Math.cos(w.ang) * B.start;
      if (!w.o) w.o = { x: ox, z: oz, dx: -Math.sin(w.ang), dz: -Math.cos(w.ang) };
      const ramp = smooth(wu / 2) * (1 - smooth((front - B.start - 50) / 40));
      Object.assign(sea.surge, { A: w.A * ramp, ox: w.o.x, oz: w.o.z, dx: w.o.dx, dz: w.o.dz, front, sigma: w.sigma });
      const sd = (boat.x - w.o.x) * w.o.dx + (boat.z - w.o.z) * w.o.dz - front;
      if (!w.hit && sd <= 0) { w.hit = true; this._stormImpact(w); }
      this._updateSpray({ ox: w.o.x, oz: w.o.z, dx: w.o.dx, dz: w.o.dz, A: w.A }, front, ramp, t);
    }
    if (!cur) { sea.surge.A *= Math.max(0, 1 - dt * 2); if (this.visuals) this.visuals.crest.visible = false; }
    if (G.player.aboard) this.shake = Math.max(this.shake, 0.12 * this.stormBoost(t)); // jangada sempre chacoalhando
  }
  _stormImpact(w) {
    const G = this.G, boat = G.boat, B = EVENT_BALANCE.tempestade, player = G.player, b = player.body;
    this.shake = Math.max(this.shake, 0.85);
    if (G.gfx && player.aboard) G.gfx.wetLens(0.9);
    if (this._isHost()) {
      const push = (boat.sailUp ? 5 : 2.5) * (w.A / 3.5);
      boat.fling = { vx: w.o.dx * push, vz: w.o.dz * push, t: 1.6, T: 1.6 };
      boat.spin = { rate: (Math.random() < 0.5 ? 1 : -1) * (0.5 + Math.random() * 0.6), t: 0.9 };
    }
    if (player.dead || !player.aboard) return;
    if (!this._holdingMast()) {
      const k = B.knock * (w.A / 3.5);
      b.vel.x += w.o.dx * k; b.vel.z += w.o.dz * k; b.vel.y = 4.5; b.grounded = false;
      if (!this.stormWarned) { this.stormWarned = true; G.hud.msg('Segure-se no mastro! As ondas estão jogando a jangada.'); }
    }
  }

  _tsunamiImpact(e) {
    const G = this.G, boat = G.boat, B = EVENT_BALANCE.tsunami, player = G.player, b = player.body;
    const sailUp = boat.sailUp;
    this.shake = 1;
    if (G.gfx && G.player.aboard) G.gfx.wetLens(1);
    if (this._isHost()) {
      const push = sailUp ? 9 : 3.5;
      boat.fling = { vx: e.dx * push, vz: e.dz * push, t: 2.2, T: 2.2 };
      if (sailUp) {
        boat.spin = { rate: (Math.random() < 0.5 ? 1 : -1) * 1.4, t: 1.6 };
        boat.setSail(false, boat.sailAngle);
      }
    }
    if (player.dead) return;
    const holding = this._holdingMast();
    if (player.aboard) {
      if (sailUp) G.survival.damage(B.damage, 'Onda gigante');
      if (!holding) {
        b.vel.x += e.dx * B.knock; b.vel.z += e.dz * B.knock; b.vel.y = 6.5; b.grounded = false;
        G.hud.msg(sailUp ? 'A vela cheia virou a jangada de lado — você foi arremessado!' : 'A onda te arrastou pelo convés!');
      } else {
        G.hud.msg(sailUp ? 'Você se segurou no mastro, mas a vela rasgou a jangada de lado!' : 'Você se segurou no mastro. A jangada aguentou a onda!');
      }
    } else if (player.swimming) {
      b.vel.x += e.dx * 6; b.vel.z += e.dz * 6;
      G.survival.damage(10, 'Onda gigante');
      G.hud.msg('A onda te engoliu!');
    }
  }

  _updateHurricane(e, dt, t) {
    const G = this.G, boat = G.boat, B = EVENT_BALANCE.furacao, u = t - e.t0;
    const R = e.R || 70, depth = e.depth || 9, spin = e.spin || 1, eyeR = R * 0.17;
    // o redemoinho "abre" devagar (~14 s) e fecha no fim
    const k = smooth(u / 14) * (1 - smooth((u - e.dur + 10) / 10));
    const lx0 = e.fz, lz0 = -e.fx; // eixo lateral (+X local no início)
    const along = (boat.x - e.cx) * e.fx + (boat.z - e.cz) * e.fz + e.ahead * (1 - 2 * u / e.dur);
    const lat = e.lat + e.latV * u;
    const cx = e.cx + e.fx * along + lx0 * lat, cz = e.cz + e.fz * along + lz0 * lat;
    Object.assign(sea.vortex, { k, x: cx, z: cz, R, depth, spin }); this.lastCx = cx; this.lastCz = cz;
    this._updateFunnel(cx, cz, k, dt, t, R, spin);

    const dx = cx - boat.x, dz = cz - boat.z, d = Math.hypot(dx, dz) || 1;
    const [lx] = boat.toLocal(cx, cz);
    const side = lx >= 0 ? 1 : -1;                // redemoinho à esquerda (+X local) ou à direita
    const away = clamp(-side * boat.sailAngle / 0.6, -1, 1); // 1 = vela toda para o lado oposto
    const factor = boat.sailUp ? (away >= 0 ? 1 - 0.85 * away : 1 - 0.5 * away) : 0.9;
    const q = d / R, reach = clamp(1.35 - q, 0, 1);          // fora de ~1.35 R não puxa
    // puxão cresce aos poucos com o tempo e com a proximidade do centro
    const grow = smooth(u / 30) * 0.6 + 0.4;
    const pull = B.pull * reach * k * factor * grow * (0.55 + 0.9 * clamp(1 - q, 0, 1));
    const swirl = B.swirl * reach * k * (0.4 + 0.6 * clamp(1 - q, 0, 1));

    if (this._isHost() && !this.sucked && G.startup.departed) {
      const ux = dx / d, uz = dz / d;
      boat.x += (ux * pull + -uz * swirl * spin) * dt;
      boat.z += (uz * pull + ux * swirl * spin) * dt;
      boat.yaw += swirl * spin * dt / Math.max(d, 10) * 0.6; // a jangada gira junto com a água
    }
    if (!this.sucked && d < eyeR + 2 && k > 0.5) {
      this.sucked = true;
      this._hurricaneSucked(e, dx / d, dz / d);
    }
    if (G.player.aboard && !this.sucked) this.shake = Math.max(this.shake, 0.22 * k * reach * (1.2 - q * 0.6));
    // força do giro: quem está a bordo é empurrado para FORA (para longe do centro). Ande em direção
    // ao redemoinho para ficar na jangada; segurar no mastro ajuda. Na água, o redemoinho te puxa.
    const pl = G.player, pp = pl.body.pos, pdx = cx - pp.x, pdz = cz - pp.z, pd = Math.hypot(pdx, pdz) || 1;
    if (!this.sucked && !pl.dead && k * reach > 0.05) {
      if (pl.aboard) {
        const hold = this._holdingMast() ? 0.45 : 1;
        const push = B.push * k * reach * grow * hold;
        pl.drift = { x: -pdx / pd * push - pdz / pd * spin * push * 0.35, z: -pdz / pd * push + pdx / pd * spin * push * 0.35 };
        if (!this.pushWarned && push > 1) { this.pushWarned = true; G.hud.msg('O vento do redemoinho está te jogando para fora — ande contra ele (na direção do redemoinho) para se firmar!'); }
      } else if (pl.swimming) {
        const pull = 1.6 * k * clamp(1.3 - pd / R, 0, 1);
        pl.drift = { x: pdx / pd * pull - pdz / pd * spin * pull, z: pdz / pd * pull + pdx / pd * spin * pull };
      } else pl.drift = null;
    } else pl.drift = null;
    if (G.gfx && G.player.aboard && k * reach > 0.5 && Math.random() < dt * 0.4) G.gfx.wetLens(0.55); // spray do redemoinho
  }

  _hurricaneSucked(e, ux, uz) {
    const G = this.G, boat = G.boat, B = EVENT_BALANCE.furacao, player = G.player, b = player.body;
    this.shake = 1.2;
    if (this._isHost()) {
      // gira em volta do olho e é cuspido para o lado oposto
      boat.fling = { vx: -ux * 15, vz: -uz * 15, t: 2.8, T: 2.8 };
      boat.spin = { rate: 3.2, t: 2.2 };
      boat.setSail(false, 0);
      e.dur = Math.min(e.dur, clock() - e.t0 + 9);
      if (G.net.online) G.net.send({ t: 'event', e });
    }
    if (player.dead) return;
    if (player.aboard) {
      G.survival.damage(B.damage, 'Furacão');
      if (!this._holdingMast()) { b.vel.x += -uz * 7; b.vel.z += ux * 7; b.vel.y = 7; b.grounded = false; }
    } else if (player.swimming) G.survival.damage(B.damage * 0.6, 'Furacão');
    G.hud.msg('O furacão sugou a jangada!');
  }

  // ---------- visuais ----------
  _ensureVisuals() {
    if (this.visuals) return;
    const scene = this.G.scene, V = {};
    // Funil: três camadas de "torno" com faixas girando em velocidades diferentes.
    V.funnel = new THREE.Group();
    const profile = [];
    for (let i = 0; i <= 24; i++) { const y = (i / 24) * 150; profile.push(new THREE.Vector2(5 + 0.08 * y + 0.0022 * y * y, y)); }
    const lathe = new THREE.LatheGeometry(profile, 48);
    V.layers = [];
    [[0x7d868e, 1.0, 0.55, 11], [0xa3abb2, 1.15, -0.35, 23], [0x50585f, 0.85, 0.9, 37]].forEach(([color, scale, speed, seed]) => {
      const map = streakTexture(seed); map.repeat.set(3, 1);
      const m = new THREE.MeshBasicMaterial({ color, map, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide, fog: false });
      const mesh = new THREE.Mesh(lathe, m);
      mesh.scale.set(scale, 1, scale);
      mesh.frustumCulled = false;
      V.funnel.add(mesh);
      V.layers.push({ mesh, speed, map });
    });
    // Nuvem em espiral no topo.
    V.cloud = new THREE.Mesh(new THREE.CircleGeometry(260, 64),
      new THREE.MeshBasicMaterial({ color: 0x3c434a, map: spiralTexture(), transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide, fog: false }));
    V.cloud.rotation.x = -Math.PI / 2; V.cloud.position.y = 95;
    V.funnel.add(V.cloud);
    // Spray na base + destroços orbitando.
    const N = 700, pos = new Float32Array(N * 3);
    V.sprayData = Array.from({ length: N }, () => ({ r: 7 + Math.random() * 34, a: Math.random() * 6.28, h: Math.random(), s: 0.6 + Math.random() }));
    const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    V.spray = new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xdfe8ee, size: 1.3, map: softDot(), transparent: true, opacity: 0, depthWrite: false }));
    V.spray.frustumCulled = false;
    const plank = new THREE.BoxGeometry(0.35, 0.08, 1.6);
    V.debris = new THREE.InstancedMesh(plank, new THREE.MeshStandardMaterial({ color: 0x6d5234, roughness: 1 }), 36);
    V.debrisData = Array.from({ length: 36 }, () => ({ r: 9 + Math.random() * 30, a: Math.random() * 6.28, y: 2 + Math.random() * 55, s: Math.random() * 6 }));
    V.debris.frustumCulled = false;
    // Spray da crista da onda gigante.
    const M = 520, tpos = new Float32Array(M * 3);
    V.crestData = Array.from({ length: M }, () => ({ u: (Math.random() - 0.5) * 200, ph: Math.random(), f: (Math.random() - 0.5) * 6 }));
    const tg = new THREE.BufferGeometry(); tg.setAttribute('position', new THREE.BufferAttribute(tpos, 3));
    V.crest = new THREE.Points(tg, new THREE.PointsMaterial({ color: 0xf2f8ff, size: 0.7, map: softDot(), transparent: true, opacity: 0, depthWrite: false }));
    V.crest.frustumCulled = false;
    scene.add(V.funnel, V.spray, V.debris, V.crest);
    this.visuals = V;
    this._hideVisuals();
  }

  _hideVisuals() {
    const V = this.visuals;
    V.funnel.visible = V.spray.visible = V.debris.visible = V.crest.visible = false;
  }

  _updateFunnel(cx, cz, k, dt, t, R = 70, spin = 1) {
    const V = this.visuals;
    V.funnel.visible = V.spray.visible = V.debris.visible = k > 0.01;
    if (!V.funnel.visible) return;
    V.funnel.position.set(cx, sea.level - sea.vortex.depth * 1.5, cz);
    // o funil se inclina e serpenteia um pouco
    V.funnel.rotation.z = Math.sin(t * 0.21) * 0.07;
    V.funnel.rotation.x = Math.cos(t * 0.17) * 0.06;
    for (const L of V.layers) {
      L.map.offset.x = (L.map.offset.x + dt * L.speed * 0.12) % 1;
      L.mesh.material.opacity = k * 0.85;
    }
    V.cloud.rotation.z += dt * 0.05;
    V.cloud.material.opacity = k * 0.9;
    const sp = V.spray.geometry.attributes.position.array;
    // espuma girando na parede do redemoinho, descendo em espiral para o centro
    const sc = R / 41;
    V.sprayData.forEach((p, i) => {
      p.a += dt * (0.5 + 9 / p.r) * p.s * spin;
      p.h = (p.h + dt * 0.08 * p.s) % 1;
      const r = Math.max(3, p.r * sc * (1.15 - p.h * 0.95));
      const x = cx + Math.cos(p.a) * r, z = cz + Math.sin(p.a) * r;
      sp[i * 3] = x;
      sp[i * 3 + 1] = sea.level + eventHeight(x, z, t) + 0.35 + (i % 5 === 0 ? (1 - p.h) * 3 : 0);
      sp[i * 3 + 2] = z;
    });
    V.spray.geometry.attributes.position.needsUpdate = true;
    V.spray.material.opacity = k * 0.7;
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e3 = new THREE.Euler(), one = new THREE.Vector3(1, 1, 1), pv = new THREE.Vector3();
    V.debrisData.forEach((d, i) => {
      d.a += dt * (0.6 + 14 / d.r) * spin;
      d.y += dt * 1.5; if (d.y > 60) d.y = 2;
      const r = (d.r + d.y * 0.25) * sc * 0.8;
      e3.set(t * 2 + d.s, t * 1.3 + d.s, t * 1.7);
      m.compose(pv.set(cx + Math.cos(d.a) * r, sea.level + d.y, cz + Math.sin(d.a) * r), q.setFromEuler(e3), one.setScalar(k));
      V.debris.setMatrixAt(i, m);
    });
    V.debris.instanceMatrix.needsUpdate = true;
  }

  _updateSpray(e, front, ramp, t) {
    const V = this.visuals, pp = this.G.player.body.pos;
    V.crest.visible = ramp > 0.02;
    if (!V.crest.visible) return;
    const px = -e.dz, pz = e.dx; // perpendicular à frente
    const lat = (pp.x - e.ox) * px + (pp.z - e.oz) * pz;
    const a = e.A * ramp, arr = V.crest.geometry.attributes.position.array;
    V.crestData.forEach((c, i) => {
      c.ph = (c.ph + 0.012 + (i % 7) * 0.001) % 1;
      const along = front + c.f + c.ph * 4;          // espirra para frente da crista
      const u = lat + c.u;
      arr[i * 3] = e.ox + e.dx * along + px * u;
      arr[i * 3 + 1] = sea.level + a * (0.85 + Math.sin(c.ph * Math.PI) * 0.7);
      arr[i * 3 + 2] = e.oz + e.dz * along + pz * u;
    });
    V.crest.geometry.attributes.position.needsUpdate = true;
    V.crest.material.opacity = 0.55 * ramp;
  }
}
