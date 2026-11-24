// Cutscene de abertura (roda no próprio motor, ~21 s, dá para pular):
//   A  helicóptero de resgate voando na tempestade, com TODOS os jogadores da sala sentados na cabine
//   B  dentro da cabine: turbulência, relâmpagos lá fora
//   C  um raio acerta o rotor: clarão, faíscas, fumaça, o motor morre
//   D  o helicóptero gira e cai; os náufragos são jogados para fora e despencam na ilha
//   E  impacto → tela preta (a tempestade passa)
//   F  1ª pessoa: o jogador acorda deitado na areia ao lado dos destroços (que ficam na ilha inicial),
//      pisca, a vista desembaça, senta, olha o helicóptero estourado, levanta e vê a jangada → jogo
// O mundo continua rodando por baixo (rede, ondas, física); só o jogador fica parado e sem controle.
import * as THREE from '../three.js';
import { clamp, lerp } from '../core/util.js';
import { makeHelicopter, Smoke } from '../world/helicopter.js';
import { Explosions } from '../world/explosions.js';
import { makePill, animatePill, disposePill, decodePill, PILL_SCALE, randomPill } from '../player/pill.js';
import { makeHumanoid } from '../player/model.js';
import { sfx, heliRotor, earRing, heliCrash } from '../core/sfx.js';

// roteiro (segundos)
const T = { B: 4.5, strike: 7.2, C2: 8.8, eject: 8.9, crash: 12.0, wake: 13.8, sit: 16.3, look: 17.6, stand: 18.8, hold: 20.0, end: 21.2 };
const SPEED = 30, STRIKE_DIST = 100, ALT = 50;
const smooth = (x) => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); };
const seg = (t, a, b) => smooth((t - a) / (b - a));
const wrapPi = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const lerpAng = (a, b, k) => a + wrapPi(b - a) * k;

const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _q = new THREE.Quaternion();

export class Intro {
  constructor(G, island, onDone) {
    this.G = G; this.island = island; this.onDone = onDone;
    this.active = true; this.t = 0; this.storm = 1; this.done = false;
    const wr = island && island.wreck;
    // ponto da queda = destroços na ilha (mundo)
    this.W = new THREE.Vector3(island.x + (wr ? wr.spot.x : 6), island.set.y + 0.55, island.z + (wr ? wr.spot.z : -6));
    this.a = 0.3; // rumo do voo (vem do sul-sudoeste, contra o vento norte)
    this.D = new THREE.Vector3(Math.sin(this.a), 0, Math.cos(this.a));
    this.P = new THREE.Vector3(this.D.z, 0, -this.D.x); // lateral
    this.S = this.W.clone().addScaledVector(this.D, -STRIKE_DIST); this.S.y = ALT;
    if (wr) wr.group.visible = false; // os destroços só aparecem depois da queda

    // helicóptero voando
    this.heli = makeHelicopter({ seed: 3 });
    G.scene.add(this.heli);
    this.rotorSpin = 0; this.rotorRate = 28;
    this.trail = new Smoke(G.scene, { count: 60, color: 0x1e1e1e, size: [1.5, 7], life: 3.2, rise: 0.4, opacity: 0.8 });
    this.sparks = this._makeSparks();
    this.bolt = null;

    // passageiros: você + todos os jogadores da sala (os que chegarem nos primeiros segundos também entram)
    this.riders = new Map();
    this._addRider('local', this._lookLocal(), 'Você');
    this._syncRiders();
    // piloto
    this.pilot = this._figure('p', randomPill());
    this.pilot.obj.position.copy(this.heli.userData.pilotSeat);
    this.heli.add(this.pilot.obj);

    // o jogador e os aliados reais (já na ilha) ficam escondidos até o despertar
    G.player.mesh.visible = false;
    this.flashes = [5.3, 6.35, T.strike];

    this._makeOverlay();
    this._onKey = (e) => { if (['Space', 'Enter', 'Escape'].includes(e.code)) { e.preventDefault(); this.skip(); } };
    this._onClick = () => this.skip();
    addEventListener('keydown', this._onKey, true);
    G.renderer.domElement.addEventListener('mousedown', this._onClick);
    addEventListener('touchstart', this._onClick, { passive: true });
    this.prevFov = G.camera.fov;
  }

  // ---------- passageiros ----------
  _lookLocal() {
    const a = this.G.player.appearance;
    return a && a.character === 'pilula' ? 'p:' + JSON.stringify(a.pill) : '';
  }
  _figure(kind, pillOpts) {
    if (kind === 'p') {
      const pill = makePill(pillOpts), obj = new THREE.Group();
      obj.add(pill); obj.scale.setScalar(PILL_SCALE);
      return { obj, pill };
    }
    return { obj: makeHumanoid(0xb49b7b), pill: null };
  }
  _addRider(id, look, name) {
    if (this.riders.has(id) || this.riders.size >= this.heli.userData.seats.length) return;
    let fig;
    if (look.startsWith('p:')) {
      let opts = null;
      try { opts = id === 'local' ? JSON.parse(look.slice(2)) : decodePill(look.slice(2)); } catch { opts = null; }
      fig = this._figure('p', opts || randomPill());
    } else fig = this._figure('h');
    const seat = this.heli.userData.seats[this.riders.size];
    fig.obj.position.copy(seat.pos); fig.obj.rotation.set(0, seat.yaw, 0);
    this.heli.add(fig.obj);
    this.riders.set(id, { ...fig, id, name, seat, falling: null });
  }
  _syncRiders() {
    for (const [id, r] of this.G.net.remotes) {
      if (this.riders.has(id)) continue;
      const ap = typeof r.s.ap === 'string' ? r.s.ap : '';
      this._addRider(id, ap, typeof r.s.n === 'string' ? r.s.n.slice(0, 16) : 'Náufrago');
    }
  }
  _names() {
    const n = [...this.riders.values()].map((r) => r.name);
    if (n.length === 1) return 'Você';
    return n.slice(0, -1).join(', ') + ' e ' + n[n.length - 1];
  }
  // joga todo mundo para fora: cada um cai no lugar em que vai acordar
  _eject() {
    const G = this.G, isl = this.island;
    let i = 0;
    for (const r of this.riders.values()) {
      r.obj.getWorldPosition(_v); r.obj.getWorldQuaternion(_q);
      this.heli.remove(r.obj); G.scene.add(r.obj);
      r.obj.position.copy(_v); r.obj.quaternion.copy(_q);
      let target;
      if (r.id === 'local') target = G.player.body.pos.clone();
      else {
        const rem = G.net.remotes.get(r.id);
        if (rem && rem.mesh.parent) target = rem.mesh.getWorldPosition(new THREE.Vector3());
        else { const ang = i * 1.9 + 0.7; target = new THREE.Vector3(isl.x + Math.cos(ang) * isl.R * 0.5, isl.set.y + 0.6, isl.z + Math.sin(ang) * isl.R * 0.5); }
      }
      const dur = T.crash - T.eject + 0.25 + i * 0.12;
      const vy = (target.y - _v.y + 4.9 * dur * dur) / dur;
      r.falling = { p0: _v.clone(), target, dur, vy, t: 0, spin: new THREE.Vector3((Math.random() - 0.5) * 6, (Math.random() - 0.5) * 4, (Math.random() - 0.5) * 6) };
      i++;
    }
  }

  // ---------- efeitos ----------
  _makeSparks() {
    const N = 90, pos = new Float32Array(N * 3);
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const pts = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xffd27a, size: 0.35, transparent: true, opacity: 0, depthWrite: false }));
    pts.frustumCulled = false; pts.userData.noShadow = true;
    this.G.scene.add(pts);
    return { pts, vel: Array.from({ length: N }, () => new THREE.Vector3()), life: 0 };
  }
  _burstSparks(at) {
    const s = this.sparks, arr = s.pts.geometry.attributes.position.array;
    s.vel.forEach((v, i) => {
      v.set((Math.random() - 0.5) * 18, Math.random() * 10 - 2, (Math.random() - 0.5) * 18);
      arr[i * 3] = at.x; arr[i * 3 + 1] = at.y; arr[i * 3 + 2] = at.z;
    });
    s.life = 1;
  }
  _updateSparks(dt) {
    const s = this.sparks; if (s.life <= 0) { s.pts.visible = false; return; }
    s.pts.visible = true; s.life -= dt * 0.8;
    const arr = s.pts.geometry.attributes.position.array;
    s.vel.forEach((v, i) => { v.y -= 14 * dt; arr[i * 3] += v.x * dt; arr[i * 3 + 1] += v.y * dt; arr[i * 3 + 2] += v.z * dt; });
    s.pts.geometry.attributes.position.needsUpdate = true;
    s.pts.material.opacity = Math.max(0, s.life);
  }
  // raio: tubo em zigue-zague do céu até o rotor (núcleo branco + brilho azulado)
  _makeBolt(to) {
    const pts = [], from = to.clone().add(new THREE.Vector3((Math.random() - 0.5) * 30, 90, (Math.random() - 0.5) * 30));
    for (let i = 0; i <= 14; i++) {
      const u = i / 14, p = from.clone().lerp(to, u);
      if (i > 0 && i < 14) p.add(new THREE.Vector3((Math.random() - 0.5) * 7, (Math.random() - 0.5) * 3, (Math.random() - 0.5) * 7));
      pts.push(p);
    }
    const curve = new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.05);
    const g = new THREE.Group();
    g.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 80, 0.22, 5), new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false })));
    g.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 80, 1.1, 6), new THREE.MeshBasicMaterial({ color: 0x9fc4ff, transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending, fog: false })));
    g.traverse((o) => { o.userData.noShadow = true; });
    this.G.scene.add(g);
    return { g, t: 0 };
  }
  _lightning(near = 0.6) {
    this.flashK = 1;
    if (this.G.events) this.G.events.flash = 1;
    sfx.thunder(0.15 + (1 - near) * 1.2, near);
  }

  // ---------- trajetória do helicóptero ----------
  _heliPose(t) {
    const h = this.heli, u = h.userData;
    if (t < T.strike) {
      const p = this.S.clone().addScaledVector(this.D, -SPEED * (T.strike - t));
      p.y = ALT + Math.sin(t * 0.9) * 0.6 + (t > T.B ? Math.sin(t * 7.3) * 0.15 : 0);
      h.position.copy(p);
      const turb = t > T.B ? Math.sin(t * 5.1) * 0.05 + Math.sin(t * 8.7) * 0.03 : 0;
      h.rotation.set(0.08 + turb * 0.5, this.a + Math.sin(t * 0.5) * 0.03, Math.sin(t * 0.7) * 0.05 + turb, 'YXZ');
    } else if (t < T.crash) {
      const k = (t - T.strike) / (T.crash - T.strike);
      const f = 1 - Math.pow(1 - k, 1.5);
      const p = this.S.clone().addScaledVector(this.D, STRIKE_DIST * f);
      p.y = this.W.y + (ALT - this.W.y) * (1 - Math.pow(k, 2.1));
      h.position.copy(p);
      const ts = t - T.strike, spin = 0.5 * 1.5 * ts * ts;
      h.rotation.set(0.08 + 0.35 * k, this.a + spin, Math.sin(ts * 3) * 0.25 + 0.3 * k, 'YXZ');
    }
    // rotor: a todo vapor até o raio, depois morre devagar
    this.rotorRate = t < T.strike ? 28 : lerp(28, 5, smooth((t - T.strike) / 2.5));
    this.rotorSpin += this.rotorRate * this.dt;
    u.rotor.rotation.y = this.rotorSpin;
    u.tailRotor.rotation.x = this.rotorSpin * (t < T.strike ? 2.2 : 0.6);
  }

  // ---------- câmera ----------
  _camLook(pos, target, fov, roll = 0) {
    const cam = this.G.camera;
    cam.position.copy(pos);
    cam.up.set(0, 1, 0);
    cam.lookAt(target);
    if (roll) cam.rotateZ(roll);
    if (Math.abs(cam.fov - fov) > 0.01) { cam.fov = fov; cam.updateProjectionMatrix(); }
  }
  _shake(s) {
    const cam = this.G.camera, k = this.t * 31;
    cam.position.x += Math.sin(k * 1.1) * s; cam.position.y += Math.sin(k * 1.37 + 2) * s; cam.position.z += Math.sin(k * 0.93 + 4) * s;
    cam.rotateZ(Math.sin(k * 0.8 + 1) * s * 0.06);
  }
  _camera(t) {
    const h = this.heli;
    h.updateMatrixWorld(true);
    if (t < T.B) {
      // A: perseguição lateral, aproximando aos poucos
      const k = seg(t, 0, T.B);
      _v.set(lerp(-11, -7, k), lerp(3.2, 1.6, k), lerp(-9, 2.5, k)).applyMatrix4(h.matrixWorld);
      _w.set(0, 1.6, 0.5).applyMatrix4(h.matrixWorld);
      this._camLook(_v, _w, 55);
      this._shake(0.04);
    } else if (t < T.strike) {
      // B: dentro da cabine, olhando para trás (os náufragos sentados)
      _v.set(0.05, 2.05, 1.45).applyMatrix4(h.matrixWorld);
      _w.set(0, 1.35, -1.1).applyMatrix4(h.matrixWorld);
      this._camLook(_v, _w, 78);
      this._shake(0.05 + 0.04 * seg(t, T.B, T.strike));
    } else if (t < T.C2) {
      // C: plano aberto de frente — o raio acerta o rotor
      _v.copy(this.S).addScaledVector(this.D, 30).addScaledVector(this.P, 20); _v.y = ALT + 4;
      _w.copy(h.position); _w.y += 2;
      this._camLook(_v, _w, 50);
      this._shake(0.25 * (1 - seg(t, T.strike, T.strike + 1.2)));
    } else {
      // D: da ilha, acompanhando a queda (a mira segue o helicóptero com atraso)
      _v.copy(this.W).addScaledVector(this.D, 14).addScaledVector(this.P, -30); _v.y = this.W.y + 9;
      this.camTarget = this.camTarget || h.position.clone();
      this.camTarget.lerp(h.position, 1 - Math.exp(-4 * this.dt));
      const k = seg(t, T.C2, T.crash);
      this._camLook(_v, this.camTarget, lerp(28, 60, k)); // teleobjetiva que abre conforme ele se aproxima
      if (t > T.crash - 0.05) this._shake(0.4);
    }
  }

  // 1ª pessoa: acordando no chão
  _wakeCamera(t) {
    const G = this.G, cam = G.camera, pos = G.player.body.pos;
    const toYaw = (x, z) => Math.atan2(-(x - pos.x), -(z - pos.z));
    const wreckYaw = toYaw(this.W.x, this.W.z);
    const boatYaw = toYaw(G.boat.x, G.boat.z);
    const upYaw = wreckYaw + 1.1;
    const sit = seg(t, T.sit, T.look), stand = seg(t, T.stand, T.hold);
    const eye = 0.26 + (0.85 - 0.26) * sit + (1.38 - 0.85) * stand;
    // deitado olhando o céu → vira a cabeça para os destroços → senta olhando → levanta e procura a jangada
    let pitch = lerp(1.25, 0.85, seg(t, T.wake + 1.7, T.sit));
    pitch = lerp(pitch, -0.05, sit);
    pitch = lerp(pitch, 0.02, stand);
    let yaw = lerpAng(upYaw, wreckYaw + 0.35, seg(t, T.wake + 1.7, T.sit));
    yaw = lerpAng(yaw, wreckYaw, sit);
    yaw = lerpAng(yaw, boatYaw, seg(t, T.stand + 0.3, T.hold + 0.4));
    const roll = lerp(0.35, 0, sit) + Math.sin(t * 1.3) * 0.03 * (1 - stand);
    const sway = (1 - stand * 0.7) * 0.04;
    cam.position.set(pos.x + Math.sin(t * 0.9) * sway, pos.y + eye + Math.sin(t * 1.7) * 0.02, pos.z);
    cam.rotation.set(pitch + Math.sin(t * 0.8) * sway * 0.5, yaw, roll, 'YXZ');
    const fov = 72;
    if (Math.abs(cam.fov - fov) > 0.01) { cam.fov = fov; cam.updateProjectionMatrix(); }
    this.endYaw = yaw;
  }

  // ---------- overlay (faixas de cinema, legendas, piscar, clarões) ----------
  _makeOverlay() {
    const el = document.createElement('div');
    el.id = 'cutscene';
    el.innerHTML = `
      <div class="cs-bar top"></div><div class="cs-bar bottom"></div>
      <div class="cs-lid top"></div><div class="cs-lid bottom"></div>
      <div class="cs-flash"></div><div class="cs-fade"></div>
      <div class="cs-title"></div><div class="cs-sub"></div>
      <div class="cs-skip">Espaço / clique — pular</div>`;
    document.body.appendChild(el);
    const q = (s) => el.querySelector(s);
    this.ui = { el, bars: [q('.cs-bar.top'), q('.cs-bar.bottom')], lids: [q('.cs-lid.top'), q('.cs-lid.bottom')], flash: q('.cs-flash'), fade: q('.cs-fade'), title: q('.cs-title'), sub: q('.cs-sub') };
    this.flashK = 0; this.subText = '';
  }
  _sub(text) {
    if (text === this.subText) return;
    this.subText = text;
    this.ui.sub.textContent = text;
    this.ui.sub.classList.toggle('on', !!text);
  }
  _subtitles(t) {
    const multi = this.riders.size > 1;
    const lines = [
      [0.8, 4.2, `Voo de resgate 47 — a bordo: ${this._names()}`],
      [4.7, 6.2, 'Piloto: Segurem-se! A tempestade está piorando!'],
      [6.3, 7.15, 'Piloto: Vou tentar passar por cima dela...'],
      [7.5, 9.4, 'Piloto: MAYDAY! MAYDAY! Perdemos o rotor!'],
      [9.5, 11.6, 'Piloto: Vamos cair! Pulem!'],
      [16.6, 17.9, 'Ugh... onde eu estou?'],
      [18.0, 19.4, multi ? 'O helicóptero... cadê os outros?' : 'O helicóptero... caiu.'],
      [19.6, T.end - 0.3, 'Uma jangada! Preciso sair desta ilha.'],
    ];
    const line = lines.find(([a, b]) => t >= a && t < b);
    this._sub(line ? line[2] : '');
    const title = t > 0.3 && t < 3.6 ? 'Jangatec' : t > T.crash + 0.4 && t < T.wake - 0.2 ? '...' : '';
    if (this.ui.title.textContent !== title) this.ui.title.textContent = title;
    this.ui.title.classList.toggle('on', !!title);
  }
  _overlay(t, dt) {
    const ui = this.ui;
    // faixas de cinema somem no despertar (1ª pessoa)
    const bars = t < T.crash ? 1 : t < T.wake ? 1 : 1 - seg(t, T.wake, T.wake + 0.8);
    ui.bars[0].style.transform = `translateY(${-100 * (1 - bars)}%)`;
    ui.bars[1].style.transform = `translateY(${100 * (1 - bars)}%)`;
    // pálpebras: 1 = fechadas
    let lid = 0;
    if (t >= T.wake) {
      const w = t - T.wake;
      lid = w < 0.4 ? 1 : w < 1.6 ? 1 - 0.55 * smooth((w - 0.4) / 1.2) : w < 1.9 ? 0.45 + 0.55 * smooth((w - 1.6) / 0.3)
        : w < 2.9 ? 1 - smooth((w - 1.9) / 1.0) * 0.9 : w < 3.15 ? 0.1 + 0.9 * smooth((w - 2.9) / 0.15) : 1 - smooth((w - 3.15) / 0.5);
      if (t > T.look + 0.6 && t < T.look + 0.85) lid = Math.max(lid, Math.sin((t - T.look - 0.6) / 0.25 * Math.PI)); // piscada
    }
    ui.lids[0].style.transform = `translateY(${-100 + lid * 100}%)`;
    ui.lids[1].style.transform = `translateY(${100 - lid * 100}%)`;
    // vista embaçada ao acordar
    const blur = t >= T.wake ? 9 * (1 - seg(t, T.wake + 0.5, T.look + 0.4)) : 0;
    const canvas = this.G.renderer.domElement;
    const f = blur > 0.05 ? `blur(${blur.toFixed(2)}px) saturate(${(0.6 + 0.4 * (1 - blur / 9)).toFixed(2)})` : '';
    if (canvas.style.filter !== f) canvas.style.filter = f;
    // clarão (raio branco; impacto laranja) e preto
    this.flashK = Math.max(0, this.flashK - dt * 3.2);
    ui.flash.style.opacity = this.flashK.toFixed(3);
    let fade = 0;
    if (t >= T.crash && t < T.wake) fade = t < T.crash + 0.08 ? 0 : 1;
    if (t >= T.wake) fade = 0;
    if (t > T.end - 0.35) fade = seg(t, T.end - 0.35, T.end);
    if (t < 0.6) fade = 1 - seg(t, 0, 0.6);
    ui.fade.style.opacity = fade.toFixed(3);
    this._subtitles(t);
  }

  // ---------- loop ----------
  update(dt, t) {
    if (!this.active) return;
    const G = this.G;
    this.dt = dt; this.t += dt;
    const ct = this.t;
    if (ct >= T.end) { this.finish(); return; }
    if (ct < T.strike) this._syncRiders();
    // céu fechado e mar bravo durante o voo; depois da queda amanhece limpo
    this.storm = ct < T.crash ? 1 : 0;
    // os aliados de verdade (já na ilha) só aparecem no despertar
    const showReal = ct >= T.wake;
    for (const r of G.net.remotes.values()) if (r.mesh.visible !== showReal) r.mesh.visible = showReal;
    G.player.mesh.visible = false;

    if (ct < T.crash) {
      this._heliPose(ct);
      // relâmpagos de fundo e o raio que derruba
      if (this.flashes.length && ct >= this.flashes[0]) {
        const at = this.flashes.shift();
        if (at === T.strike) {
          this.heli.updateMatrixWorld(true);
          const hub = this.heli.userData.hub.clone().applyMatrix4(this.heli.matrixWorld);
          this.bolt = this._makeBolt(hub);
          this._burstSparks(hub);
          this._lightning(1);
          this.ui.flash.style.background = '#eef3ff';
          this.flashK = 1.4;
        } else this._lightning(0.4);
      }
      if (ct > T.strike) {
        this.heli.updateMatrixWorld(true);
        const e = this.heli.userData.engine.getWorldPosition(_v);
        this.trail.update(dt, () => [e.x, e.y + 0.3, e.z], [0, 0]);
      } else this.trail.update(dt);
      if (ct >= T.eject && !this.ejected) { this.ejected = true; this._eject(); }
      heliRotor(ct < T.strike ? 1 : 0.9 * (1 - seg(ct, T.strike, T.crash)), this.rotorRate * 0.32);
    } else {
      if (!this.crashed) this._crash();
      this.trail.update(dt);
    }
    if (this.bolt) {
      this.bolt.t += dt;
      this.bolt.g.visible = Math.sin(this.bolt.t * 60) > -0.3;
      if (this.bolt.t > 0.45) { this._disposeObj(this.bolt.g); this.bolt = null; }
    }
    this._updateSparks(dt);
    if (this.boom) this.boom.update(dt);

    // poses: sentados / caindo
    for (const r of this.riders.values()) {
      if (r.falling) {
        const f = r.falling; f.t += dt;
        const k = Math.min(1, f.t / f.dur);
        r.obj.position.set(lerp(f.p0.x, f.target.x, k), f.p0.y + f.vy * Math.min(f.t, f.dur) - 4.9 * Math.min(f.t, f.dur) ** 2, lerp(f.p0.z, f.target.z, k));
        r.obj.rotation.x += f.spin.x * dt; r.obj.rotation.y += f.spin.y * dt; r.obj.rotation.z += f.spin.z * dt;
        r.obj.visible = k < 1 && ct < T.crash;
        if (r.pill) { r.pill.userData.vy = -10; animatePill(r.pill, 0, dt, 'jump'); }
      } else if (r.pill) animatePill(r.pill, 0, dt, 'row', ct > T.B ? 0.25 + Math.sin(ct * 9) * 0.05 : 0);
    }
    if (this.pilot.pill) animatePill(this.pilot.pill, 0, dt, 'row', 0.25);

    if (ct < T.crash) this._camera(ct);
    else this._wakeCamera(ct);
    this._overlay(ct, dt);
  }

  _crash() {
    const G = this.G;
    this.crashed = true;
    heliRotor(0);
    heliCrash();
    this.boom = new Explosions(G.scene); // própria (a da batalha naval só anima durante a batalha)
    this.boom.spawn(this.W.clone().add(new THREE.Vector3(0, 1, 0)), 2.6);
    this.ui.flash.style.background = '#ffb35a'; this.flashK = 1;
    this.heli.visible = false;
    for (const r of this.riders.values()) r.obj.visible = false;
    if (this.island.wreck) this.island.wreck.group.visible = true;
    setTimeout(() => { if (this.active) earRing(6); }, (T.wake - T.crash - 0.6) * 1000);
  }

  skip() {
    if (!this.active || this.t < 0.6) return;
    if (this.t >= T.end - 0.4) return;
    this.t = T.end - 0.35; // fecha com o mesmo fade do fim
    if (!this.crashed) { this.crashed = true; heliRotor(0); this.heli.visible = false; if (this.island.wreck) this.island.wreck.group.visible = true; }
    for (const r of this.riders.values()) r.obj.visible = false;
    this._wakeCamera(T.end);
  }

  // só para o que esta cutscene criou do zero (helicóptero, raio, faíscas, fumaça)
  _disposeObj(o) {
    if (o.parent) o.parent.remove(o);
    o.traverse((c) => {
      if (c.geometry) c.geometry.dispose();
      if (c.material) (Array.isArray(c.material) ? c.material : [c.material]).forEach((m) => m.dispose());
    });
  }
  // bonecos: a pílula sabe liberar o que é dela (materiais compartilhados ficam)
  _disposeFigure(f) {
    if (f.obj.parent) f.obj.parent.remove(f.obj);
    if (f.pill) disposePill(f.pill);
  }

  finish() {
    if (!this.active) return;
    const G = this.G;
    this.active = false;
    heliRotor(0);
    removeEventListener('keydown', this._onKey, true);
    G.renderer.domElement.removeEventListener('mousedown', this._onClick);
    removeEventListener('touchstart', this._onClick);
    G.renderer.domElement.style.filter = '';
    if (this.island.wreck) this.island.wreck.group.visible = true;
    for (const r of G.net.remotes.values()) r.mesh.visible = true;
    G.player.mesh.visible = true;
    // continua olhando para onde o despertar terminou (a jangada)
    if (Number.isFinite(this.endYaw)) { G.player.camYaw = this.endYaw; G.player.yaw = this.endYaw + Math.PI; }
    G.player.camPitch = 0.08;
    G.camera.fov = this.prevFov; G.camera.updateProjectionMatrix();
    for (const r of this.riders.values()) this._disposeFigure(r);
    this._disposeFigure(this.pilot);
    this.heli.remove(this.pilot.obj);
    this._disposeObj(this.heli);
    this._disposeObj(this.sparks.pts);
    for (const p of this.trail.list) this._disposeObj(p.s);
    if (this.bolt) this._disposeObj(this.bolt.g);
    if (this.boom) { this.boom.update(10); G.scene.remove(this.boom.light); }
    // o preto some devagar já com o jogo rodando
    const ui = this.ui;
    ui.el.classList.add('out');
    ui.fade.style.opacity = '1';
    requestAnimationFrame(() => { ui.fade.style.transition = 'opacity 0.6s'; ui.fade.style.opacity = '0'; });
    setTimeout(() => ui.el.remove(), 800);
    if (this.onDone) this.onDone();
  }
}
