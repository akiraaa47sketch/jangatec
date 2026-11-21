// Eventos aleatórios em alto-mar (só depois da partida):
//   • Onda gigante (tsunami): uma frente de água atravessa o mar. Baixe a vela e segure-se
//     perto do mastro; com a vela cheia a jangada é arremessada e todos se machucam.
//   • Furacão: o olho passa ao lado da rota e puxa a jangada. Levante a vela e gire-a para o
//     lado OPOSTO ao olho para não ser sugado.
// O host sorteia e anuncia o evento pela rede; todos os clientes derivam o estado do mesmo
// relógio comum (clock), então ondas e funil aparecem iguais para todos. Só o host move o barco.
import * as THREE from '../three.js';
import { clamp, clock } from '../core/util.js';
import { sea } from '../world/ocean.js';

export const EVENT_BALANCE = {
  first: [95, 135],          // s depois da partida até o primeiro evento
  interval: [120, 190],      // s entre o fim de um evento e o próximo
  tsunami: { speed: 15, startDist: 235, A: 4.6, sigma: 11, damage: 22, knock: 8.5 },
  furacao: { dur: 58, pull: 2.5, eyeR: 13, ahead: 45, side: 64, damage: 30 },
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
    return e.kind === 'tsunami' ? 0.34 : 0.18;
  }
  // Quanto o evento escurece o céu / engrossa o mar (0..1).
  stormBoost(t) {
    const e = this.current;
    if (!e) return 0;
    const u = t - e.t0, inK = smooth(u / 10), outK = 1 - smooth((u - e.dur + 8) / 8);
    return (e.kind === 'furacao' ? 1 : 0.7) * inK * outK;
  }

  // ---------- agendamento (host) ----------
  _isHost() { const n = this.G.net; return !n.online || n.isHost; }

  _schedule(dt, t) {
    const G = this.G;
    if (!G.startup.departed || this.current) return;
    this.timer -= dt;
    if (this.timer > 0) return;
    if (G.enemies.list.some((e) => e.pirate && e.state !== 'dead')) { this.timer = 15; return; }
    const tide = G.startup.tide.state; // só com o mar cheio e longe da próxima seca
    if (G.startup.waterLevel < 0.5 || (tide && (tide.phase.id === 'seco' || tide.nextIn < 75))) { this.timer = 15; return; }
    const kind = this.lastKind === 'tsunami' ? (Math.random() < 0.7 ? 'furacao' : 'tsunami')
      : this.lastKind === 'furacao' ? (Math.random() < 0.7 ? 'tsunami' : 'furacao')
        : (Math.random() < 0.5 ? 'tsunami' : 'furacao');
    this.begin(kind === 'tsunami' ? this._makeTsunami(t) : this._makeHurricane(t), true);
  }

  _makeTsunami(t) {
    const B = EVENT_BALANCE.tsunami, boat = this.G.boat;
    // Vem de qualquer lado, menos exatamente por trás (assim dá para ver a parede chegando).
    const rel = (Math.random() < 0.5 ? 1 : -1) * (0.35 + Math.random() * 2.1);
    const a = boat.yaw + Math.PI + rel; // direção de onde a onda vem
    const sx = Math.sin(a), sz = Math.cos(a);
    return {
      id: `ev${Math.floor(t * 10)}`, kind: 'tsunami', t0: t, dur: (B.startDist + 170) / B.speed,
      ox: boat.x + sx * B.startDist, oz: boat.z + sz * B.startDist, dx: -sx, dz: -sz,
      speed: B.speed, A: B.A, sigma: B.sigma,
    };
  }

  _makeHurricane(t) {
    const B = EVENT_BALANCE.furacao, boat = this.G.boat;
    const fx = Math.sin(boat.yaw), fz = Math.cos(boat.yaw), lx = fz, lz = -fx; // lx,lz = local +X
    const side = Math.random() < 0.5 ? 1 : -1;
    // O olho anda ao lado da rota, acompanhando a jangada: começa à frente e termina atrás
    // (passa lado a lado no meio do evento). Baixar a vela não deixa o furacão "passar".
    return {
      id: `ev${Math.floor(t * 10)}`, kind: 'furacao', t0: t, dur: B.dur,
      cx: boat.x, cz: boat.z, fx, fz, lat: side * B.side, latV: -side * 0.45, ahead: B.ahead,
    };
  }

  // ---------- início / fim (todos os clientes) ----------
  begin(e, announce = false) {
    if (!e || (this.current && this.current.id === e.id)) { if (e && this.current) Object.assign(this.current, e); return; }
    this.current = e;
    this.impacted = false;
    this.sucked = false;
    this.lastKind = e.kind;
    this._ensureVisuals();
    const hud = this.G.hud;
    if (e.kind === 'tsunami') {
      hud.msg('🌊 Uma ONDA GIGANTE se aproxima! Baixe a vela e segure no mastro.');
    } else {
      hud.msg('🌀 Um FURACÃO se formou ao lado da rota! Gire a vela para o lado oposto ao olho.');
    }
    if (announce && this.G.net.online) this.G.net.send({ t: 'event', e });
  }

  receive(e) {
    if (!e || typeof e.kind !== 'string') return;
    if (e.end) { if (this.current && this.current.id === e.id) this._end(); return; }
    if (clock() > e.t0 + e.dur) return;
    this.begin(e);
  }

  _end() {
    this.current = null;
    sea.surge.A = 0;
    sea.vortex.k = 0;
    this.timer = between(EVENT_BALANCE.interval);
    const enemies = this.G.enemies;
    enemies.pirateSpawnTimer = Math.max(enemies.pirateSpawnTimer, 45); // folga antes de piratas
    if (this.visuals) this._hideVisuals();
    this.G.hud.setEvent(null);
  }

  // ---------- loop ----------
  update(dt, t) {
    const G = this.G;
    if (!G.started) return;
    if (this._isHost()) this._schedule(dt, t);
    const e = this.current;
    if (e) {
      if (t > e.t0 + e.dur) this._end();
      else if (e.kind === 'tsunami') this._updateTsunami(e, dt, t);
      else this._updateHurricane(e, dt, t);
    }
    // relâmpagos durante o furacão
    if (this.flash > 0) this.flash = Math.max(0, this.flash - dt * 3);
    if (e && e.kind === 'furacao' && Math.random() < dt * 0.35 * this.stormBoost(t)) {
      this.flash = 1;
      G.hud.flash('lightning');
    }
    G.startup.hemisphere.intensity += this.flash * 2.2;
  }

  applyShake(camera, dt) {
    if (this.shake <= 0) return;
    const s = this.shake * 0.18;
    camera.position.x += (Math.random() - 0.5) * s;
    camera.position.y += (Math.random() - 0.5) * s;
    camera.position.z += (Math.random() - 0.5) * s;
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
    if (sd > 0 && !this.impacted) {
      const secs = Math.ceil(sd / e.speed), rel = this._relativeDir(boat.x - e.dx * 50, boat.z - e.dz * 50);
      const holding = this._holdingMast();
      const advice = boat.sailUp ? 'BAIXE A VELA [E no mastro]' : holding ? 'Segure firme no mastro!' : 'Corra para perto do mastro!';
      G.hud.setEvent({
        kind: 'tsunami', title: `🌊 ONDA GIGANTE ${rel.label} — ${secs}s`,
        text: advice, arrow: rel.ang, meter: clamp(1 - sd / B.startDist, 0, 1), good: !boat.sailUp && holding,
      });
    } else if (!this.impacted && sd <= 0) {
      this.impacted = true;
      this._tsunamiImpact(e);
    } else if (this.impacted && sd < -40) {
      G.hud.setEvent(null);
    }
    this._updateSpray(e, front, ramp, t);
  }

  _tsunamiImpact(e) {
    const G = this.G, boat = G.boat, B = EVENT_BALANCE.tsunami, player = G.player, b = player.body;
    const sailUp = boat.sailUp;
    this.shake = 1;
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
    G.hud.setEvent({ kind: 'tsunami', title: '🌊 IMPACTO!', text: holding ? 'Segurou firme!' : 'Volte para a jangada!', meter: 1, good: holding && !sailUp });
  }

  _updateHurricane(e, dt, t) {
    const G = this.G, boat = G.boat, B = EVENT_BALANCE.furacao, u = t - e.t0;
    const k = smooth(u / 9) * (1 - smooth((u - e.dur + 9) / 9));
    const lx0 = e.fz, lz0 = -e.fx; // eixo lateral (+X local no início)
    const along = (boat.x - e.cx) * e.fx + (boat.z - e.cz) * e.fz + e.ahead * (1 - 2 * u / e.dur);
    const lat = e.lat + e.latV * u;
    const cx = e.cx + e.fx * along + lx0 * lat, cz = e.cz + e.fz * along + lz0 * lat;
    Object.assign(sea.vortex, { k, x: cx, z: cz, R: 24, depth: 2.4 });
    this._updateFunnel(cx, cz, k, dt, t);

    const dx = cx - boat.x, dz = cz - boat.z, d = Math.hypot(dx, dz) || 1;
    const [lx] = boat.toLocal(cx, cz);
    const side = lx >= 0 ? 1 : -1;                // olho à esquerda (+X local) ou à direita
    const away = clamp(-side * boat.sailAngle / 0.6, -1, 1); // 1 = vela toda para o lado oposto
    const factor = boat.sailUp ? (away >= 0 ? 1 - 0.85 * away : 1 - 0.5 * away) : 0.9;
    const reach = clamp(1 - (d - B.eyeR) / 120, 0, 1);
    const pull = B.pull * reach * k * factor;

    if (this._isHost() && !this.sucked && G.startup.departed) {
      boat.x += (dx / d) * pull * dt;
      boat.z += (dz / d) * pull * dt;
    }
    if (!this.sucked && d < B.eyeR + 2 && k > 0.3) {
      this.sucked = true;
      this._hurricaneSucked(e, dx / d, dz / d);
    }
    if (this.sucked) {
      G.hud.setEvent({ kind: 'furacao', title: '🌀 SUGADO PELO FURACÃO!', text: 'Segure-se! A jangada foi cuspida para fora.', meter: 1, good: false });
      return;
    }
    const key = -side > 0 ? 'C' : 'Z';
    const sideName = side > 0 ? 'bombordo (esquerda)' : 'estibordo (direita)';
    const rel = this._relativeDir(cx, cz);
    const text = !boat.sailUp
      ? `Levante a vela e gire-a com [${key}] para fugir do olho`
      : away > 0.6 ? 'Vela contra o vento — está escapando!' : `Gire a vela para o lado oposto: segure [${key}] no mastro`;
    G.hud.setEvent({
      kind: 'furacao', title: `🌀 FURACÃO a ${Math.round(d)} m — ${sideName}`,
      text, arrow: rel.ang, meter: clamp(pull / B.pull, 0, 1), good: boat.sailUp && away > 0.6, meterLabel: 'puxão',
    });
    if (G.player.aboard) this.shake = Math.max(this.shake, 0.25 * k * reach);
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
    V.spray = new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xdfe8ee, size: 0.9, map: softDot(), transparent: true, opacity: 0, depthWrite: false }));
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

  _updateFunnel(cx, cz, k, dt, t) {
    const V = this.visuals;
    V.funnel.visible = V.spray.visible = V.debris.visible = k > 0.01;
    if (!V.funnel.visible) return;
    V.funnel.position.set(cx, sea.level - 3, cz);
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
    V.sprayData.forEach((p, i) => {
      p.a += dt * (2.2 + 18 / p.r) * p.s;
      p.h = (p.h + dt * 0.25 * p.s) % 1;
      const r = p.r * (1 + p.h * 0.6);
      sp[i * 3] = cx + Math.cos(p.a) * r;
      sp[i * 3 + 1] = sea.level + p.h * 14;
      sp[i * 3 + 2] = cz + Math.sin(p.a) * r;
    });
    V.spray.geometry.attributes.position.needsUpdate = true;
    V.spray.material.opacity = k * 0.5;
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e3 = new THREE.Euler(), one = new THREE.Vector3(1, 1, 1), pv = new THREE.Vector3();
    V.debrisData.forEach((d, i) => {
      d.a += dt * (1.4 + 25 / d.r);
      d.y += dt * 1.5; if (d.y > 60) d.y = 2;
      const r = d.r + d.y * 0.25;
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
