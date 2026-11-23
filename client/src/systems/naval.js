// Batalhas navais (só depois de conseguir um CANHÃO IMPROVISADO — longe na rota).
//   • Canhão: item de loot; instalado no convés com [E]. Sentado nele, o mouse gira/levanta o
//     cano, a retícula em círculo marca onde a bala vai cair (trajetória prevista) e o clique
//     dispara uma bala com física (gravidade + velocidade da jangada). Balas infinitas, mas a
//     recarga é longa (nada de metralhar).
//   • Navios piratas grandes aparecem como evento aleatório, emparelham de lado e disparam
//     bordadas. Têm vida, pegam fogo, inclinam e AFUNDAM depois de alguns acertos.
//   • Cada peça da jangada tem vida própria: bala que acerta danifica a peça (e as vizinhas um
//     pouco). Peça destruída se solta da jangada. Só a plataforma do mastro é indestrutível.
//     Peças danificadas são consertadas martelando com o MARTELO (sem gastar material).
//   • Navio afundado solta CAIXOTES DE LOOT que boiam (pegue com [E] ou puxe com o gancho).
//   • Durante a batalha o mar NÃO seca (a maré fica segurada no cheio); a seca só volta depois.
// Rede: o host simula navios e dano e manda o estado; todos simulam as balas para o visual.
import * as THREE from '../three.js';
import { clamp, lerpAngle, rot } from '../core/util.js';
import { sea, waveHeight } from '../world/ocean.js';
import { Explosions } from '../world/explosions.js';
import { makeWarship, drawShipHp, shipHalfWidth, SHIP } from '../world/navalmodels.js';
import { PIECES } from '../boat/pieces.js';
import { keyOf } from '../core/keybinds.js';
import { sfx } from '../core/sfx.js';

export const NAVAL = {
  first: [150, 300],          // s (com canhão instalado e mar cheio) até a 1ª batalha
  interval: [380, 650],       // s entre batalhas
  muzzle: 44,                 // m/s
  gravity: 9.8,
  reload: 7,                  // s entre disparos do jogador (balas infinitas)
  dmg: { ship: 24, piece: 42, splashR: 2.4, player: 30 },
  ship: { hp: [110, 140, 170, 200, 240], orbit: [40, 58], fireCd: [3.6, 5.6], spread: [0.085, 0.05], range: 120 },
  maxDuration: 330,           // depois disso os navios restantes fogem
};
export const GHOST = { hpMult: 1.9, ballMult: 0.35 }; // navio-fantasma: mais vida, tiro bem mais fraco
export const HOOK_TURRET = { speed: 34, range: 34 };
export const PIECE_HP = { piso: 240, plataforma: 240, tabua: 70, bloco: 130, rampa: 110, escada: 100, parede: 120, suporte: 60, chapa: 230, canhao: 160, gancho: 140, parede_plastico: 35, parede_ferro: 330 };
const between = ([a, b]) => a + Math.random() * (b - a);
const CHAR = new THREE.Color(0x2a1d14);
const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _q = new THREE.Quaternion();

// Partículas com alfa e tamanho por partícula (fogo, fumaça, espirro d'água).
class Particles {
  constructor(scene, { color, additive = false, max = 400, opacity = 1 }) {
    this.max = max; this.n = 0; this.list = [];
    const g = new THREE.BufferGeometry();
    this.pos = new Float32Array(max * 3); this.alpha = new Float32Array(max); this.size = new Float32Array(max);
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    g.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1));
    g.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1));
    this.mesh = new THREE.Points(g, new THREE.ShaderMaterial({
      uniforms: { uColor: { value: new THREE.Color(color) }, uOpacity: { value: opacity } },
      vertexShader: `attribute float aAlpha; attribute float aSize; varying float vA;
        void main() { vA = aAlpha; vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = aSize * 320.0 / max(1.0, -mv.z); gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `uniform vec3 uColor; uniform float uOpacity; varying float vA;
        void main() { float d = length(gl_PointCoord - 0.5); if (d > 0.5) discard;
          gl_FragColor = vec4(uColor, vA * uOpacity * smoothstep(0.5, 0.1, d)); }`,
      transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    }));
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
  }
  emit(x, y, z, vx, vy, vz, life, size, grav = 0, grow = 0) {
    if (this.list.length >= this.max) this.list.shift();
    this.list.push({ x, y, z, vx, vy, vz, life, t: 0, size, grav, grow });
  }
  update(dt) {
    let n = 0;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const p = this.list[i]; p.t += dt;
      if (p.t >= p.life) { this.list.splice(i, 1); continue; }
      p.vy -= p.grav * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      const u = p.t / p.life;
      this.pos[n * 3] = p.x; this.pos[n * 3 + 1] = p.y; this.pos[n * 3 + 2] = p.z;
      this.alpha[n] = Math.min(1, (1 - u) * 1.6) * Math.min(1, p.t * 12);
      this.size[n] = p.size * (1 + p.grow * u);
      n++;
    }
    const g = this.mesh.geometry;
    g.setDrawRange(0, n);
    g.attributes.position.needsUpdate = g.attributes.aAlpha.needsUpdate = g.attributes.aSize.needsUpdate = true;
  }
}

export class Naval {
  constructor(G) {
    this.G = G;
    this.balls = []; this.ships = new Map();
    this.manning = null; this.aimYaw = 0; this.aimElev = 0.1; this.reload = 0;
    this.timer = between(NAVAL.first); this.active = false; this.holdK = 0; this.wave = 0;
    this.pieceHp = new Map(); this.crates = new Map(); this.crateAcc = 0; this.sendAcc = 0; this.aimAcc = 0; this.battleT = 0;
    const s = G.scene;
    this.boom = new Explosions(s);
    this.flames = new Particles(s, { color: 0xff8a2a, additive: true, max: 500 });
    this.smoke = new Particles(s, { color: 0x3a3634, max: 600, opacity: 0.55 });
    this.splash = new Particles(s, { color: 0xeaf6ff, max: 700, opacity: 0.9 });
    this.ballGeo = new THREE.SphereGeometry(0.17, 12, 8);
    this.ballMat = new THREE.MeshStandardMaterial({ color: 0x1b1b1d, metalness: 0.6, roughness: 0.4 });
    // trajetória prevista (pontilhada) + anel no ponto de impacto
    this.pathGeo = new THREE.BufferGeometry().setFromPoints(Array.from({ length: 90 }, () => new THREE.Vector3()));
    this.path = new THREE.Line(this.pathGeo, new THREE.LineDashedMaterial({ color: 0xf3cf7e, dashSize: 0.7, gapSize: 0.5, transparent: true, opacity: 0.75, depthWrite: false }));
    this.path.frustumCulled = false; this.path.visible = false; s.add(this.path);
    this.ring = new THREE.Mesh(new THREE.RingGeometry(1.5, 1.85, 40).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0xf3cf7e, transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide }));
    this.ring.visible = false; s.add(this.ring);
    this.reticle = document.getElementById('cannonReticle');
  }

  // ---------- canhões na jangada ----------
  get cannons() { return [...this.G.boat.pieces.values()].filter((p) => p.type === 'canhao'); }
  get turrets() { return [...this.G.boat.pieces.values()].filter((p) => p.type === 'canhao' || p.type === 'gancho'); }
  maxHp(piece) {
    if (piece.type === 'canhao') return PIECE_HP.canhao;
    const size = piece.physSize || (PIECES[piece.type] && PIECES[piece.type].size) || [1, 1, 1];
    const base = PIECE_HP[piece.type] || 90;
    const wall = String(piece.type).startsWith('parede') || piece.type === 'escada'; // paredes: conta a face (largura × altura)
    return Math.round(base * clamp(Math.sqrt(size[0] * (wall ? size[1] : size[2])) / 1.6, 0.6, 1.6)); // peça maior aguenta mais
  }
  hpOf(piece) { return this.pieceHp.has(piece.id) ? this.pieceHp.get(piece.id) : this.maxHp(piece); }
  destructible(piece) { return !(piece.indestructible || piece.id === 'starter-platform' || piece.id === 'mastro' || piece.type === 'mastro'); }

  canInstallHere(kind = 'canhao') {
    const G = this.G, p = G.player.body.pos, boat = G.boat;
    if (!G.player.aboard || (G.survival.inv[kind] || 0) <= 0) return null;
    const [fx, fz] = G.player.forward();
    const [lx, lz] = boat.toLocal(p.x + fx * 1.1, p.z + fz * 1.1);
    const [mx, mz] = boat.toLocal(...boat.mastWorld());
    if (Math.hypot(lx - mx, lz - mz) < 1.4) return null;
    if (this.turrets.some((c) => Math.hypot(c.x - lx, c.z - lz) < 1.7)) return null;
    if (Math.hypot(lx, lz) > boat.set.radius) return null;
    return { lx, lz };
  }

  install(kind = 'canhao') {
    const G = this.G, spot = this.canInstallHere(kind), nome = kind === 'gancho' ? 'a torreta-gancho' : 'o canhão';
    if (!spot) { G.hud.msg(`Não dá para instalar ${nome} aqui`); return; }
    const p = G.player.body.pos;
    const piece = {
      id: (kind === 'gancho' ? 'hook-' : 'cannon-') + G.net.nextId(), type: kind, x: spot.lx, y: p.y - G.boat.set.y + (kind === 'gancho' ? 0.4 : 0.45), z: spot.lz,
      yaw: G.player.camYaw + Math.PI - G.boat.yaw, // cano para onde a câmera olha
    };
    G.survival.inv[kind]--;
    G.boat.addPiece(piece);
    G.net.send({ t: 'add', piece });
    G.hud.msg(kind === 'gancho' ? `Torreta-gancho instalada! [${keyOf('interact')}] nela para usar — fisga caixotes, aliados e inimigos` : `Canhão instalado! [${keyOf('interact')}] nele para usar`);
  }

  man(piece) {
    if (!piece || this.manning) return;
    this.manning = piece.id; this.manKind = piece.type; this.aimYaw = 0; this.aimElev = piece.type === 'gancho' ? 0.05 : 0.1;
    this.wasFirstPerson = this.G.player.firstPerson; this._camInit = false;
    if (this.reticle) this.reticle.hidden = false;
  }
  leave() {
    if (!this.manning) return;
    const G = this.G, piece = G.boat.pieces.get(this.manning);
    this.manning = null;
    this.path.visible = this.ring.visible = false;
    if (this.reticle) this.reticle.hidden = true;
    if (piece) G.player.camYaw = G.boat.yaw + piece.yaw + this.aimYaw + Math.PI;
  }
  // segura o jogador atrás do canhão (ele é carregado pela jangada)
  holdPlayer(b) {
    const G = this.G, piece = G.boat.pieces.get(this.manning);
    if (!piece) { this.leave(); return; }
    const [ox, oz] = rot(0, -1.05, piece.yaw + this.aimYaw);
    const [wx, wz] = G.boat.toWorld(piece.x + ox, piece.z + oz);
    b.pos.set(wx, G.boat.set.y + piece.y - 0.45, wz); b.vel.set(0, 0, 0);
    b.grounded = true; b.carrier = b.groundSet = G.boat.set;
    G.player.yaw = G.boat.yaw + piece.yaw + this.aimYaw;
  }

  _nodes(piece) { return piece && piece.mesh && piece.mesh.userData.cannon; }
  _setAim(piece, yaw, elev) {
    const c = this._nodes(piece); if (!c) return;
    c.yawNode.rotation.y = yaw; c.pitchNode.rotation.x = -elev;
    piece.aim = { yaw, elev };
  }
  _muzzle(piece, outPos, outVel, speed = NAVAL.muzzle) {
    const c = this._nodes(piece), G = this.G;
    piece.mesh.updateWorldMatrix(true, true);
    c.muzzle.getWorldPosition(outPos);
    c.pitchNode.getWorldPosition(_w);
    const dir = _v.copy(outPos).sub(_w).normalize();
    outVel.copy(dir).multiplyScalar(speed);
    // a bala herda a velocidade da jangada
    outVel.x += Math.sin(G.boat.yaw) * G.boat.speed; outVel.z += Math.cos(G.boat.yaw) * G.boat.speed;
  }

  // ---------- balas ----------
  spawnBall(o, v, by, mult = 1) {
    const ghost = mult < 1; // bala do navio-fantasma: fraca e brilhando verde
    if (ghost && !this.ghostBallMat) this.ghostBallMat = new THREE.MeshStandardMaterial({ color: 0x9ff5e4, emissive: 0x3affc8, emissiveIntensity: 1.4, transparent: true, opacity: 0.8 });
    const mesh = new THREE.Mesh(this.ballGeo, ghost ? this.ghostBallMat : this.ballMat);
    mesh.position.copy(o); this.G.scene.add(mesh);
    this.balls.push({ pos: o.clone(), vel: v.clone(), by, mesh, t: 0, mult });
    // fumaça e clarão na boca
    for (let i = 0; i < 14; i++) {
      const s = Math.random();
      this.smoke.emit(o.x, o.y, o.z, v.x * 0.03 * s + (Math.random() - 0.5), v.y * 0.03 * s + Math.random() * 0.8, v.z * 0.03 * s + (Math.random() - 0.5), 1.6 + Math.random(), 1.2, -0.3, 2.2);
      this.flames.emit(o.x, o.y, o.z, v.x * 0.06 * s, v.y * 0.06 * s, v.z * 0.06 * s, 0.18, 1.1, 0, 1);
    }
    sfx.cannon(o);
    const d = this.G.camera.position.distanceTo(o);
    if (d < 25) this.G.events.shake = Math.max(this.G.events.shake, 0.35 * (1 - d / 25));
  }

  fire() {
    const G = this.G, piece = G.boat.pieces.get(this.manning);
    if (!piece) return;
    if (piece.type === 'gancho') { this.fireHook(piece); return; }
    if (this.reload > 0) return;
    this.reload = NAVAL.reload;
    const o = new THREE.Vector3(), v = new THREE.Vector3();
    this._muzzle(piece, o, v);
    this.spawnBall(o, v, 'p');
    this.balls[this.balls.length - 1].mine = true; // só quem atirou conta o dano nas torres
    const c = this._nodes(piece); if (c) c.recoil = 1;
    const r = (x) => Math.round(x * 100) / 100;
    G.net.send({ t: 'naval', k: 'fire', o: o.toArray().map(r), v: v.toArray().map(r), by: 'p', id: piece.id });
  }

  // há algo fisgável perto de p? (caixote boiando, aliado, inimigo)
  hookTargetNear(p) {
    const G = this.G;
    for (const c of this.crates.values()) if (c.mesh.position.distanceTo(p) < 1.4) return true;
    for (const e of G.enemies.list) if (e.state !== 'dead' && Math.hypot(e.body.pos.x - p.x, e.body.pos.y + 0.9 - p.y, e.body.pos.z - p.z) < 1.2) return true;
    for (const r of G.net.remotes.values()) { const wp = r.mesh.getWorldPosition(_w); if (Math.abs(wp.x - p.x) + Math.abs(wp.y + 0.9 - p.y) + Math.abs(wp.z - p.z) < 1.8) return true; }
    return false;
  }

  // torreta-gancho: dispara o gancho da boca do lançador (clique de novo recolhe)
  fireHook(piece) {
    const G = this.G, tools = G.tools; if (!tools) return;
    if (tools.hook) { tools.hook.state = 'back'; return; }
    const o = new THREE.Vector3(), v = new THREE.Vector3(), c = this._nodes(piece);
    this._muzzle(piece, o, v, HOOK_TURRET.speed);
    tools.throwHook({ pos: o, vel: v, origin: (out) => (c ? c.muzzle.getWorldPosition(out) : out.copy(o)), turret: c });
    if (c) { c.recoil = 1; if (c.hookTip) c.hookTip.visible = false; }
  }

  _impact(b, point, kind, target) {
    const G = this.G;
    this._removeBall(b);
    if (kind === 'water') {
      sfx.splash(point, true);
      if (G.gfx && G.camera.position.distanceTo(point) < 9) G.gfx.wetLens(0.9); // espirro na cara
      for (let i = 0; i < 26; i++) {
        const a = Math.random() * 6.28, s = Math.random();
        this.splash.emit(point.x, point.y, point.z, Math.cos(a) * 2.2 * s, 6 + Math.random() * 7, Math.sin(a) * 2.2 * s, 1.1 + Math.random() * 0.5, 0.55 + Math.random() * 0.5, 14);
      }
      return;
    }
    this.boom.spawn(point, kind === 'ship' ? 1.3 : 0.9);
    sfx.explosion(point, kind === 'ship' ? 1.2 : 0.9);
    for (let i = 0; i < 10; i++) this.smoke.emit(point.x, point.y, point.z, (Math.random() - 0.5) * 2, 1 + Math.random() * 2, (Math.random() - 0.5) * 2, 2.5, 1.4, -0.2, 2);
    // jogador local perto da explosão
    const pl = G.player, pp = pl.body.pos;
    const d = Math.hypot(pp.x - point.x, pp.y + 0.9 - point.y, pp.z - point.z);
    if (!pl.dead && d < NAVAL.dmg.splashR + 0.6) {
      G.survival.damage(NAVAL.dmg.player * (b.mult || 1) * (1 - 0.6 * d / (NAVAL.dmg.splashR + 0.6)), b.mult < 1 ? 'Bala fantasma' : 'Bala de canhão');
      const k = 5 / Math.max(0.6, d);
      pl.body.vel.x += (pp.x - point.x) * k; pl.body.vel.z += (pp.z - point.z) * k; pl.body.vel.y = 5; pl.body.grounded = false;
      if (this.manning) this.leave();
    }
    if (d < 30) G.events.shake = Math.max(G.events.shake, 0.6 * (1 - d / 30));
    // torres de sucata: quem atirou avisa a sala (acerto direto ou estilhaços por perto)
    if ((kind === 'tower' || kind === 'ground') && b.by === 'p' && b.mine && G.siege) G.siege.cannonImpact(point, b.vel, kind === 'tower' ? target : null);
    if (!this._isHost()) return;
    if (kind === 'ship') this._damageShip(target, NAVAL.dmg.ship * (0.85 + Math.random() * 0.3), point);
    else if (kind === 'raft') this._damageRaftAt(point, target, b.mult || 1);
  }

  _removeBall(b) {
    this.G.scene.remove(b.mesh);
    const i = this.balls.indexOf(b); if (i >= 0) this.balls.splice(i, 1);
  }

  // teste de colisão da bala contra navios inimigos (bala do jogador) e contra a jangada (bala do navio)
  _hitShip(p) {
    for (const s of this.ships.values()) {
      if (s.sinkT > 6) continue;
      const [lx, lz] = rot(p.x - s.x, p.z - s.z, -s.yaw), ly = p.y - s.y;
      if (ly < SHIP.keel - 0.3 || ly > SHIP.deck + 2.2) continue;
      if (Math.abs(lx) < shipHalfWidth(lz) + 0.25 || (Math.abs(lx) < 1 && ly > SHIP.deck && Math.abs(lz) < SHIP.L / 2)) return s;
    }
    return null;
  }
  _hitRaft(p) {
    const boat = this.G.boat;
    const [lx, lz] = boat.toLocal(p.x, p.z), ly = p.y - boat.set.y;
    if (Math.hypot(lx, lz) > boat.set.radius + 1 || ly < -1.4 || ly > 6.5) return null;
    let best = null;
    for (const piece of boat.pieces.values()) {
      const c = piece.col; if (!c) continue;
      const [px, pz] = rot(lx - c.x, lz - c.z, -(c.yaw || 0));
      if (Math.abs(px) < c.hx + 0.22 && Math.abs(ly - c.y) < c.hy + 0.22 && Math.abs(pz) < c.hz + 0.22) { best = piece; break; }
    }
    // barris flutuadores / casco: conta como acerto na peça mais próxima
    if (!best && ly < 0.2 && Math.hypot(lx, lz) < boat.set.radius * 0.9) {
      let bd = Infinity;
      for (const piece of boat.pieces.values()) { const d = Math.hypot(piece.x - lx, piece.z - lz); if (d < bd) { bd = d; best = piece; } }
    }
    return best;
  }

  updateBalls(dt) {
    const steps = 3, h = dt / steps, G = this.G;
    for (const b of this.balls.slice()) {
      b.t += dt;
      if (b.t > 9) { this._removeBall(b); continue; }
      for (let i = 0; i < steps; i++) {
        const px = b.pos.x, py = b.pos.y, pz = b.pos.z;
        b.vel.y -= NAVAL.gravity * h;
        b.pos.addScaledVector(b.vel, h);
        const p = b.pos;
        if (b.by !== 's') { const s = this._hitShip(p); if (s) { this._impact(b, p.clone(), 'ship', s); break; } }
        // ilhas: torres de sucata (derrubam), paredes e terreno (explode)
        if (b.by === 'p' && G.siege) { const tw = G.siege.hitTower(p); if (tw) { this._impact(b, p.clone(), 'tower', tw); break; } }
        if (b.by === 'p' && G.colliders.segmentBlocked(px, py, pz, p.x, p.y, p.z, 0) && !this._hitRaft(p)) { this._impact(b, p.clone(), 'ground'); break; }
        if (b.by === 's') { const piece = this._hitRaft(p); if (piece) { this._impact(b, p.clone(), 'raft', piece); break; } }
        if (p.y < waveHeight(p.x, p.z, this.t)) { p.y = waveHeight(p.x, p.z, this.t); this._impact(b, p.clone(), 'water'); break; }
      }
      b.mesh.position.copy(b.pos);
      if (Math.random() < 0.6) this.smoke.emit(b.pos.x, b.pos.y, b.pos.z, 0, 0.2, 0, 0.6, 0.35, 0, 1.5);
    }
  }

  // ---------- dano nas peças da jangada (host) ----------
  _damageRaftAt(point, primary, mult = 1) {
    const boat = this.G.boat;
    const [lx, lz] = boat.toLocal(point.x, point.z);
    for (const piece of [...boat.pieces.values()]) {
      if (!this.destructible(piece)) continue;
      if (piece === primary) { this.damagePiece(piece.id, NAVAL.dmg.piece * mult); continue; }
      const d = Math.hypot(piece.x - lx, piece.z - lz);
      if (d < NAVAL.dmg.splashR) this.damagePiece(piece.id, NAVAL.dmg.piece * mult * 0.45 * (1 - d / NAVAL.dmg.splashR));
    }
  }
  damagePiece(id, dmg) {
    const piece = this.G.boat.pieces.get(id);
    if (!piece || !this.destructible(piece)) return;
    const hp = Math.max(0, this.hpOf(piece) - dmg);
    this.setPieceHp(id, hp);
    this.G.net.send({ t: 'naval', k: 'php', id, hp: Math.round(hp) });
    if (hp <= 0) this.breakPiece(id);
  }
  setPieceHp(id, hp) {
    const piece = this.G.boat.pieces.get(id); if (!piece) return;
    this.pieceHp.set(id, hp);
    const frac = clamp(hp / this.maxHp(piece), 0, 1);
    piece.mesh.traverse((o) => {
      if (!o.isMesh || !o.material || !o.material.color) return;
      if (!o.userData.hpMat) { o.material = o.material.clone(); o.userData.hpMat = o.material.color.clone(); }
      o.material.color.copy(o.userData.hpMat).lerp(CHAR, (1 - frac) * 0.8);
    });
  }
  breakPiece(id) {
    const G = this.G, piece = G.boat.pieces.get(id); if (!piece) return;
    const wp = piece.mesh.getWorldPosition(new THREE.Vector3());
    this.pieceHp.delete(id);
    if (this.manning === id) this.leave();
    if (piece.physObj) {
      const obj = piece.physObj;
      G.build.tryRemoveWelded(id); // vira destroço solto (avisando a sala)
      if (obj.body) { obj.body.velocity.set((Math.random() - 0.5) * 4, 4, (Math.random() - 0.5) * 4); obj.body.angularVelocity.set(Math.random() * 3, Math.random() * 3, Math.random() * 3); }
    } else {
      G.boat.removePiece(id);
      G.net.send({ t: 'remove', id });
    }
    this.G.hud.msg('Uma peça da jangada foi destruída!');
    this.boom.spawn(wp, 0.7);
  }
  // Martelada: a peça da jangada na mira (até ~3 m) recupera vida. Retorna true se acertou uma peça.
  hammer() {
    const G = this.G, cam = G.camera, ray = this._ray || (this._ray = new THREE.Raycaster());
    cam.getWorldDirection(_v); ray.set(cam.position, _v); ray.far = (G.player.firstPerson ? 0 : G.player.camDist) + 3.2;
    const hit = ray.intersectObjects(G.solids, false).find((h) => h.object.buildPiece);
    const piece = hit && hit.object.buildPiece;
    if (!piece || !G.boat.pieces.has(piece.id)) return false;
    for (let i = 0; i < 8; i++) this.flames.emit(hit.point.x, hit.point.y, hit.point.z, (Math.random() - 0.5) * 3, Math.random() * 3, (Math.random() - 0.5) * 3, 0.25, 0.25, 9);
    sfx.hammer(hit.point);
    if (!this.destructible(piece)) return true;
    const max = this.maxHp(piece), hp = this.hpOf(piece);
    if (hp >= max - 0.5) { G.hud.msg('Essa peça já está inteira'); return true; }
    if (this._isHost()) this._applyRepair(piece.id);
    else { G.net.send({ t: 'naval', k: 'repair', id: piece.id }); this.setPieceHp(piece.id, Math.min(max, hp + max * 0.2)); }
    if (G.melee) G.melee.num(hit.point, `+${Math.round(Math.min(max - hp, max * 0.2))}`, '#62ee91', `${Math.round(100 * Math.min(max, hp + max * 0.2) / max)}%`);
    return true;
  }
  _applyRepair(id) {
    const piece = this.G.boat.pieces.get(id); if (!piece) return;
    const max = this.maxHp(piece), hp = Math.min(max, this.hpOf(piece) + max * 0.2);
    this.setPieceHp(id, hp);
    this.G.net.send({ t: 'naval', k: 'php', id, hp: Math.round(hp) });
  }

  // ---------- navios ----------
  _isHost() { const n = this.G.net; return !n.online || n.isHost; }

  _spawnShip(st) {
    const mesh = makeWarship();
    mesh.rotation.order = 'YXZ';
    this.G.scene.add(mesh);
    const s = {
      id: st.id, mesh, data: mesh.userData.ship, x: st.x, z: st.z, yaw: st.yaw, y: sea.level,
      hp: st.hp, max: st.max, sinkT: st.sink || 0, side: st.side || 1, R: st.R || 48, phase: Math.random() * 6,
      speed: 0, fireCd: between(NAVAL.ship.fireCd) + 3, roll: 0, pitch: 0, fires: [], scorch: 0,
      net: { x: st.x, z: st.z, yaw: st.yaw }, diff: st.diff || 0, retreat: false,
      boarder: !!st.b, boardT: 0, ghost: !!st.g,
    };
    if (s.ghost) { // navio-fantasma: casco translúcido esverdeado, velas rasgadas brilhando
      mesh.traverse((o) => {
        if (!o.isMesh || o.isSprite || !o.material || !o.material.color) return;
        o.material = o.material.clone();
        o.material.transparent = true; o.material.opacity = 0.5; o.material.depthWrite = false;
        o.material.color.lerp(new THREE.Color(0x9ff5e4), 0.6);
        if (o.material.emissive) { o.material.emissive.setHex(0x0f4a3e); o.material.emissiveIntensity = 1; }
      });
    }
    drawShipHp(s.data, s.hp / s.max);
    this.ships.set(s.id, s);
    return s;
  }
  _removeShip(s) {
    this.G.scene.remove(s.mesh);
    s.mesh.traverse((o) => { if (o.isMesh) o.geometry.dispose(); });
    this.ships.delete(s.id);
  }
  _damageShip(s, dmg, point) {
    if (s.sinkT > 0) return;
    s.hp = Math.max(0, s.hp - dmg);
    this._shipHitFx(s, point);
    if (s.hp <= 0) {
      s.sinkT = 0.01;
      this.G.net.send({ t: 'naval', k: 'sunk', id: s.id });
      this._onSunk(s);
      this._dropCrates(s);
    }
    this._sendShips();
  }
  _shipHitFx(s, point) {
    drawShipHp(s.data, s.hp / s.max);
    if (!point) return;
    // marca de queimado no casco + foco de incêndio (ponto local)
    const [lx, lz] = rot(point.x - s.x, point.z - s.z, -s.yaw);
    if (s.fires.length < 4 && s.hp / s.max < 0.75) s.fires.push(new THREE.Vector3(clamp(lx, -2, 2), SHIP.deck + 0.3, clamp(lz, -7, 7)));
    const scorch = new THREE.Mesh(new THREE.CircleGeometry(0.6 + Math.random() * 0.4, 12), new THREE.MeshBasicMaterial({ color: 0x120c08, transparent: true, opacity: 0.8, depthWrite: false }));
    const side = lx >= 0 ? 1 : -1, ly = clamp(point.y - s.y, SHIP.keel + 0.5, SHIP.deck - 0.3);
    scorch.position.set(side * (shipHalfWidth(clamp(lz, -8.5, 8.5)) * (0.42 + 0.58 * Math.sqrt(clamp((ly - SHIP.keel) / (SHIP.deck - SHIP.keel), 0, 1))) + 0.03), ly, clamp(lz, -8.5, 8.5));
    scorch.rotation.y = side * Math.PI / 2;
    s.mesh.add(scorch);
  }
  _onSunk() {
    const G = this.G;
    G.hud.msg('Navio pirata afundando! Caixotes de loot boiando por perto');
    const alive = [...this.ships.values()].filter((x) => x.sinkT <= 0).length;
    if (!alive) G.hud.msg('⚓ Vitória naval!');
  }

  startBattle() {
    const G = this.G, boat = G.boat, wave = this.wave++;
    const diff = G.world.difficulty(boat.x, boat.z);
    const count = wave === 0 ? 1 : Math.random() < 0.35 + diff * 0.08 ? 2 : 1;
    const fx = Math.sin(boat.yaw), fz = Math.cos(boat.yaw), rx = fz, rz = -fx;
    const flank = Math.random() < 0.5 ? 1 : -1;
    for (let i = 0; i < count; i++) {
      const side = count === 2 ? (i === 0 ? flank : -flank) : flank;
      const ahead = 120 + Math.random() * 50, lat = side * (70 + Math.random() * 40);
      const hp = G.enemies.partyMul() * NAVAL.ship.hp[Math.min(4, diff)] * (0.9 + Math.random() * 0.2);
      this._spawnShip({
        id: `ship-${Date.now().toString(36)}-${i}`, x: boat.x + fx * ahead + rx * lat, z: boat.z + fz * ahead + rz * lat,
        yaw: boat.yaw + Math.PI + side * 0.4, hp, max: hp, side, R: between(NAVAL.ship.orbit), diff,
      });
    }
    this.active = true; this.battleT = 0;
    G.hud.msg(count === 1 ? '⚓ Um navio pirata no horizonte — às armas!' : '⚓ Dois navios piratas no horizonte — às armas!');
    this._sendShips();
  }

  // Invasão por abordagem: navio(s) surgem longe, vêm atirando, encostam e os piratas pulam a bordo.
  // Não precisa ter canhão (é a ameaça que obriga a defender o convés).
  startBoarding() {
    const G = this.G, boat = G.boat, diff = G.world.difficulty(boat.x, boat.z);
    const count = diff >= 3 && Math.random() < 0.5 ? 2 : 1;
    const fx = Math.sin(boat.yaw), fz = Math.cos(boat.yaw), rx = fz, rz = -fx, flank = Math.random() < 0.5 ? 1 : -1;
    for (let i = 0; i < count; i++) {
      const side = i === 0 ? flank : -flank, ahead = 60 + Math.random() * 60, lat = side * (110 + Math.random() * 30);
      const hp = G.enemies.partyMul() * NAVAL.ship.hp[Math.min(4, diff)] * 0.75;
      this._spawnShip({
        id: `board-${Date.now().toString(36)}-${i}`, x: boat.x + fx * ahead + rx * lat, z: boat.z + fz * ahead + rz * lat,
        yaw: Math.atan2(-rx * side, -rz * side), hp, max: hp, side, R: 9, diff, b: 1,
      });
    }
    this.active = true; this.battleT = 0;
    G.hud.msg(count === 1 ? '☠ Navio de abordagem! Vai atirar e encostar na jangada' : '☠ Dois navios de abordagem cercando a jangada!');
    if (G.hud.banner) G.hud.banner('☠ ABORDAGEM', 'Um navio pirata vem bombardeando e vai invadir o convés!', 'pirate', 6);
    this._sendShips();
  }

  // Navio-fantasma (evento da névoa): fraco no tiro e na tripulação, mas aguenta bem mais que um
  // navio comum. Vem atirando e encosta para a tripulação fantasma abordar.
  startGhost() {
    const G = this.G, boat = G.boat, diff = G.world.difficulty(boat.x, boat.z);
    const fx = Math.sin(boat.yaw), fz = Math.cos(boat.yaw), rx = fz, rz = -fx, side = Math.random() < 0.5 ? 1 : -1;
    const ahead = 50 + Math.random() * 30, lat = side * (70 + Math.random() * 20);
    const hp = G.enemies.partyMul() * NAVAL.ship.hp[Math.min(4, diff)] * GHOST.hpMult;
    this._spawnShip({
      id: `ghost-${Date.now().toString(36)}`, x: boat.x + fx * ahead + rx * lat, z: boat.z + fz * ahead + rz * lat,
      yaw: Math.atan2(-rx * side, -rz * side), hp, max: hp, side, R: 9, diff, b: 1, g: 1,
    });
    this.active = true; this.battleT = 0;
    G.hud.msg('Um navio-fantasma surgiu da névoa!');
    if (G.hud.banner) G.hud.banner('NAVIO-FANTASMA', 'Tiros fracos, mas o casco aguenta muito. A tripulação fantasma vai abordar.', 'pirate', 7);
    this._sendShips();
  }

  _sendShips() {
    if (!this.G.net.online || !this._isHost()) return;
    const r = (x) => Math.round(x * 10) / 10;
    this.G.net.send({
      t: 'naval', k: 'ships', on: this.active ? 1 : 0,
      s: [...this.ships.values()].map((s) => ({ id: s.id, x: r(s.x), z: r(s.z), yaw: Math.round(s.yaw * 100) / 100, hp: Math.round(s.hp), max: Math.round(s.max), sink: r(s.sinkT), side: s.side, R: r(s.R), diff: s.diff, b: s.boarder ? 1 : 0, g: s.ghost ? 1 : 0 })),
    });
  }

  // IA do navio (host): emparelha ao lado da jangada e dispara a bordada que está virada para ela.
  _shipAI(s, dt) {
    const G = this.G, boat = G.boat;
    const fx = Math.sin(boat.yaw), fz = Math.cos(boat.yaw), rx = fz, rz = -fx;
    let tx, tz;
    if (s.retreat) { tx = s.x + Math.sin(s.yaw) * 100; tz = s.z + Math.cos(s.yaw) * 100; }
    else {
      const along = s.boarder ? 0 : Math.sin(this.t * 0.045 + s.phase) * 18; // abordagem: vem direto para o costado
      tx = boat.x + rx * s.side * s.R + fx * along; tz = boat.z + rz * s.side * s.R + fz * along;
    }
    const dx = tx - s.x, dz = tz - s.z, d = Math.hypot(dx, dz);
    // perto do ponto: navega paralelo à jangada (bordada virada para ela); longe: vai até lá
    const desired = d > 14 ? Math.atan2(dx, dz) : lerpAngle(boat.yaw, Math.atan2(dx, dz), d / 14);
    if (s.boarder && !s.retreat) { // abordagem: encosta e acompanha a jangada; foge quando a tripulação morre
      s.boardT += dt;
      const crew = G.enemies.list.filter((e) => e.ship === s && e.state !== 'dead').length;
      if (s.spawned && crew === 0 && s.boardT > 6) { s.retreat = true; G.hud.msg('O navio de abordagem está fugindo!'); }
    }
    s.yaw = lerpAngle(s.yaw, desired, Math.min(1, 0.32 * dt));
    const want = s.retreat ? 7 : clamp(boat.speed + d * (s.boarder ? 0.14 : 0.09), 1.2, boat.speed + (s.boarder ? 7 : 5));
    s.speed += (want - s.speed) * Math.min(1, 0.4 * dt);
    s.x += Math.sin(s.yaw) * s.speed * dt; s.z += Math.cos(s.yaw) * s.speed * dt;
    // não encostar na jangada
    const bx = s.x - boat.x, bz = s.z - boat.z, bd = Math.hypot(bx, bz);
    const minD = s.boarder && !s.retreat ? 8.5 : 22;
    if (bd < minD) { s.x += (bx / bd) * (minD - bd) * 0.5 * dt * 4; s.z += (bz / bd) * (minD - bd) * 0.5 * dt * 4; }
    // tiro
    s.fireCd -= dt;
    if (!s.retreat && s.fireCd <= 0 && bd < NAVAL.ship.range && G.startup.departed && !(s.boarder && bd < 26)) { // abordagem: para de atirar ao encostar
      const n = [...this.ships.values()].filter((x) => x.sinkT <= 0).length;
      s.fireCd = between(NAVAL.ship.fireCd) * (n > 1 ? 1.35 : 1) * (s.boarder ? 0.85 : 1);
      const [lx] = rot(boat.x - s.x, boat.z - s.z, -s.yaw);
      const ports = lx > 0 ? s.data.ports.left : s.data.ports.right;
      const salvo = 1 + (Math.random() < 0.35 + s.diff * 0.1 ? 1 : 0);
      for (let k = 0; k < salvo; k++) this._shipFire(s, ports[(Math.random() * ports.length) | 0], k * 0.18);
    }
  }
  _shipFire(s, port, delay) {
    const G = this.G, boat = G.boat;
    s.mesh.updateWorldMatrix(true, false);
    const o = port.clone().applyMatrix4(s.mesh.matrixWorld);
    // alvo: um ponto da jangada (com antecipação do movimento) + erro
    const tx0 = boat.x + (Math.random() - 0.5) * 4, tz0 = boat.z + (Math.random() - 0.5) * 4, ty = boat.set.y + 0.6;
    const V = NAVAL.muzzle * 0.82, g = NAVAL.gravity;
    let D = Math.hypot(tx0 - o.x, tz0 - o.z), tof = D / V;
    const tx = tx0 + Math.sin(boat.yaw) * boat.speed * tof, tz = tz0 + Math.cos(boat.yaw) * boat.speed * tof;
    D = Math.hypot(tx - o.x, tz - o.z);
    const dy = ty - o.y, disc = V ** 4 - g * (g * D * D + 2 * dy * V * V);
    if (disc < 0) return;
    const spread = NAVAL.ship.spread[0] + (NAVAL.ship.spread[1] - NAVAL.ship.spread[0]) * (s.diff / 4);
    const ang = Math.atan((V * V - Math.sqrt(disc)) / (g * D)) + (Math.random() - 0.5) * spread;
    const head = Math.atan2(tx - o.x, tz - o.z) + (Math.random() - 0.5) * spread;
    const v = new THREE.Vector3(Math.sin(head) * Math.cos(ang) * V, Math.sin(ang) * V, Math.cos(head) * Math.cos(ang) * V);
    const mult = s.ghost ? GHOST.ballMult : 1;
    const go = () => {
      this.spawnBall(o, v, 's', mult);
      const r = (x) => Math.round(x * 100) / 100;
      G.net.send({ t: 'naval', k: 'fire', o: o.toArray().map(r), v: v.toArray().map(r), by: 's', gm: mult });
    };
    if (delay > 0) setTimeout(go, delay * 1000); else go();
  }

  // visual dos navios (todos os clientes): boia nas ondas, balanço, fogo, afundamento
  _shipVisual(s, dt, t) {
    if (!this._isHost()) {
      const k = Math.min(1, 3 * dt);
      s.x += (s.net.x - s.x) * k; s.z += (s.net.z - s.z) * k; s.yaw = lerpAngle(s.yaw, s.net.yaw, k);
    }
    const fx = Math.sin(s.yaw), fz = Math.cos(s.yaw);
    const hB = waveHeight(s.x + fx * 7, s.z + fz * 7, t), hS = waveHeight(s.x - fx * 7, s.z - fz * 7, t);
    const hL = waveHeight(s.x + fz * 2.5, s.z - fx * 2.5, t), hR = waveHeight(s.x - fz * 2.5, s.z + fx * 2.5, t);
    const dmg = 1 - s.hp / s.max;
    let y = (hB + hS + hL + hR) / 4 + 0.55 - dmg * 0.8, pitch = clamp((hS - hB) / 14, -0.12, 0.12), roll = clamp((hL - hR) / 5, -0.15, 0.15) + dmg * 0.06 * s.side;
    if (s.sinkT > 0) {
      s.sinkT += dt;
      const u = Math.min(1, s.sinkT / 16);
      y -= u * u * 14; pitch += u * 0.45; roll += u * 0.35 * s.side;
      if (Math.random() < dt * 30) this.splash.emit(s.x + (Math.random() - 0.5) * 6, sea.level + 0.2, s.z + (Math.random() - 0.5) * 12, 0, 1.5 + Math.random() * 2, 0, 1, 0.8, 4);
    }
    s.y = y; s.pitch += (pitch - s.pitch) * Math.min(1, 2 * dt); s.roll += (roll - s.roll) * Math.min(1, 2 * dt);
    s.mesh.position.set(s.x, s.y, s.z);
    s.mesh.rotation.set(s.pitch, s.yaw, s.roll);
    // fogo e fumaça nos pontos atingidos
    s.mesh.updateWorldMatrix(true, false);
    for (const f of s.fires) {
      if (Math.random() > dt * 22) continue;
      _v.copy(f).applyMatrix4(s.mesh.matrixWorld);
      this.flames.emit(_v.x + (Math.random() - 0.5) * 0.6, _v.y, _v.z + (Math.random() - 0.5) * 0.6, (Math.random() - 0.5) * 0.4, 2 + Math.random() * 1.5, (Math.random() - 0.5) * 0.4, 0.6, 1.0, 0, -0.5);
      this.smoke.emit(_v.x, _v.y + 1, _v.z, (Math.random() - 0.5) * 0.6, 2.4, (Math.random() - 0.5) * 0.6, 3.2, 1.6, -0.1, 2.5);
    }
    // bandeira e tripulação
    const fp = s.data.flag.geometry.attributes.position, fa = fp.array, fb = s.data.flagBase;
    for (let i = 0; i < fp.count; i++) fa[i * 3 + 2] = Math.sin(t * 6 - fb[i * 3] * 4) * 0.12 * fb[i * 3];
    fp.needsUpdate = true;
    s.data.crew.forEach((c, i) => { c.position.y = SHIP.deck + Math.abs(Math.sin(t * 3 + i)) * 0.05; });
    s.data.hpSprite.visible = s.sinkT <= 0;
  }

  // ---------- caixotes de loot boiando ----------
  _crateMesh() {
    const g = new THREE.Group();
    const wood = this._crateMat || (this._crateMat = new THREE.MeshStandardMaterial({ color: 0xa57a45, roughness: 0.9 }));
    const dark = this._crateDark || (this._crateDark = new THREE.MeshStandardMaterial({ color: 0x5e4126, roughness: 0.95 }));
    g.add(new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.7, 0.9), wood));
    for (const y of [-0.3, 0, 0.3]) for (const s of [-1, 1]) {
      const plank = new THREE.Mesh(new THREE.BoxGeometry(0.94, 0.08, 0.04), dark); plank.position.set(0, y, s * 0.46); g.add(plank);
      const p2 = plank.clone(); p2.rotation.y = Math.PI / 2; p2.position.set(s * 0.46, y, 0); g.add(p2);
    }
    const buoy = new THREE.Mesh(new THREE.SphereGeometry(0.17, 10, 8), new THREE.MeshStandardMaterial({ color: 0xf07a1e, roughness: 0.6, emissive: 0x401800 }));
    buoy.position.set(0.55, 0.15, 0.55); g.add(buoy);
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.2), new THREE.MeshBasicMaterial({ color: 0xffd23a, side: THREE.DoubleSide }));
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.9, 5), dark); pole.position.set(0.55, 0.6, 0.55);
    flag.position.set(0.7, 0.95, 0.55); g.add(pole, flag);
    this.G.scene.add(g);
    return g;
  }
  _spawnCrate(st) {
    const c = { id: st.id, x: st.x, z: st.z, vx: st.vx || 0, vz: st.vz || 0, loot: st.loot || null, mesh: this._crateMesh(), age: 0, net: { x: st.x, z: st.z }, pull: null };
    this.crates.set(c.id, c);
    return c;
  }
  _removeCrate(id) { const c = this.crates.get(id); if (!c) return; this.G.scene.remove(c.mesh); this.crates.delete(id); }
  _dropCrates(s) {
    const n = 2 + (Math.random() < 0.4 ? 1 : 0), diff = s.diff || 0;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * 6.28, d = 3 + Math.random() * 5;
      const loot = i === 0
        ? { metal: 2 + ((Math.random() * 3) | 0), municao: 8 + diff * 2, bandagem: 1 }
        : Math.random() < 0.5 ? { cartucho: 4, barra_proteina: 1, chocolate: 1 } : { kit: 1, municao: 6, energetico: 1 };
      this._spawnCrate({ id: `crate-${s.id}-${i}`, x: s.x + Math.cos(a) * d, z: s.z + Math.sin(a) * d, vx: Math.cos(a) * 1.5, vz: Math.sin(a) * 1.5, loot });
    }
    this._sendCrates();
  }
  _sendCrates() {
    if (!this.G.net.online || !this._isHost()) return;
    const r = (x) => Math.round(x * 10) / 10;
    this.G.net.send({ t: 'naval', k: 'crates', c: [...this.crates.values()].map((c) => ({ id: c.id, x: r(c.x), z: r(c.z) })) });
  }
  _applyCrates(list) {
    const seen = new Set();
    for (const st of list) {
      seen.add(st.id);
      const c = this.crates.get(st.id) || this._spawnCrate(st);
      c.net = { x: st.x, z: st.z };
    }
    for (const id of [...this.crates.keys()]) if (!seen.has(id)) this._removeCrate(id);
  }
  // o caixote mais perto do jogador (para [E])
  nearestCrate(range = 2.8) {
    const p = this.G.player.body.pos;
    let best = null, bd = range;
    for (const c of this.crates.values()) { const d = Math.hypot(c.x - p.x, c.z - p.z); if (d < bd && Math.abs(c.mesh.position.y - p.y) < 3.2) { bd = d; best = c; } }
    return best;
  }
  takeCrate(c) {
    if (this._isHost()) this._giveCrate(c.id, this.G.net.id);
    else this.G.net.send({ t: 'naval', k: 'take', id: c.id });
  }
  _giveCrate(id, to) {
    const G = this.G, c = this.crates.get(id);
    if (!c) return;
    const loot = c.loot || { metal: 2, municao: 6 };
    this._removeCrate(id);
    if (!G.net.online || to === G.net.id) G.hud.msg('Caixote aberto:  ' + G.survival.add(loot));
    G.net.send({ t: 'naval', k: 'took', id, to, loot });
    this._sendCrates();
  }
  // gancho: arrasta o caixote até (x, z)
  pullCrate(id, x, z) {
    const c = this.crates.get(id); if (!c) return false;
    c.pull = { x, z, t: 0.5 };
    if (!this._isHost()) {
      this.pullAcc = (this.pullAcc || 0) + 1;
      if (this.pullAcc % 6 === 0) this.G.net.send({ t: 'naval', k: 'pull', id, x: Math.round(x * 10) / 10, z: Math.round(z * 10) / 10 });
    }
    return Math.hypot(c.x - x, c.z - z) > 2.2;
  }
  _updateCrates(dt, t) {
    const host = this._isHost();
    for (const c of [...this.crates.values()]) {
      c.age += dt;
      if (c.pull) {
        c.pull.t -= dt;
        const dx = c.pull.x - c.x, dz = c.pull.z - c.z, d = Math.hypot(dx, dz);
        if (d > 2) { c.vx += (dx / d * 7 - c.vx) * Math.min(1, 4 * dt); c.vz += (dz / d * 7 - c.vz) * Math.min(1, 4 * dt); }
        else { c.vx *= 0.8; c.vz *= 0.8; }
        if (c.pull.t <= 0) c.pull = null;
      } else { c.vx *= 1 - Math.min(1, 0.4 * dt); c.vz *= 1 - Math.min(1, 0.4 * dt); }
      c.x += c.vx * dt; c.z += c.vz * dt;
      if (!host && !c.pull) { const k = Math.min(1, 2 * dt); c.x += (c.net.x - c.x) * k; c.z += (c.net.z - c.z) * k; }
      // boia nas ondas (balança e inclina um pouco); no seco fica no fundo
      const h = Math.max(waveHeight(c.x, c.z, t), this.G.world.seabedHeight(c.x, c.z) + 0.35);
      c.mesh.position.set(c.x, h + 0.08 + Math.sin(t * 2 + c.age) * 0.05, c.z);
      c.mesh.rotation.set(Math.sin(t * 1.3 + c.age) * 0.12, c.age * 0.1, Math.cos(t * 1.1 + c.age) * 0.12);
      if (host && c.age > 420) this._removeCrate(c.id);
    }
    if (host && this.crates.size) { this.crateAcc += dt; if (this.crateAcc > 0.25) { this.crateAcc = 0; this._sendCrates(); } }
  }

  // ---------- rede ----------
  receive(m) {
    if (m.k === 'tower') { if (this.G.siege) this.G.siege.receive(m); return; }
    const G = this.G;
    switch (m.k) {
      case 'fire': {
        if (!Array.isArray(m.o) || !Array.isArray(m.v)) return;
        const o = new THREE.Vector3().fromArray(m.o), v = new THREE.Vector3().fromArray(m.v);
        this.spawnBall(o, v, m.by === 's' ? 's' : 'r', Number.isFinite(m.gm) ? clamp(m.gm, 0.1, 1) : 1);
        const piece = m.id && G.boat.pieces.get(m.id), c = this._nodes(piece); if (c) c.recoil = 1;
        break;
      }
      case 'aim': { const piece = G.boat.pieces.get(m.id); if (piece && this.manning !== m.id) this._setAim(piece, +m.y || 0, +m.e || 0); break; }
      case 'repair': if (this._isHost() && typeof m.id === 'string') this._applyRepair(m.id); break;
      case 'php': if (typeof m.id === 'string' && Number.isFinite(m.hp)) this.setPieceHp(m.id, m.hp); break;
      case 'sunk': { const s = this.ships.get(m.id); if (s && s.sinkT <= 0) { s.sinkT = 0.01; s.hp = 0; drawShipHp(s.data, 0); } this._onSunk(); break; }
      case 'crates': if (!this._isHost()) this._applyCrates(m.c || []); break;
      case 'take': if (this._isHost() && typeof m.id === 'string') this._giveCrate(m.id, m.from); break;
      case 'took': {
        this._removeCrate(m.id);
        if (m.to === G.net.id && m.loot) G.hud.msg('Caixote aberto:  ' + G.survival.add(m.loot));
        break;
      }
      case 'pull': { const c = this.crates.get(m.id); if (c && this._isHost() && Number.isFinite(m.x) && Number.isFinite(m.z)) c.pull = { x: m.x, z: m.z, t: 0.5 }; break; }
      case 'ships': {
        if (this._isHost()) return;
        const seen = new Set();
        for (const st of m.s || []) {
          seen.add(st.id);
          let s = this.ships.get(st.id);
          if (!s) s = this._spawnShip(st);
          s.net = { x: st.x, z: st.z, yaw: st.yaw };
          if (st.hp < s.hp) this._shipHitFx(s, null);
          s.hp = st.hp; s.max = st.max; s.side = st.side;
          if (st.sink > 0 && s.sinkT <= 0) s.sinkT = st.sink;
          drawShipHp(s.data, s.hp / s.max);
        }
        for (const s of [...this.ships.values()]) if (!seen.has(s.id)) this._removeShip(s);
        if (m.on && !this.active) G.hud.msg('⚓ Navios piratas no horizonte — às armas!');
        this.active = !!m.on;
        break;
      }
    }
  }

  // ---------- agendamento (host) ----------
  _schedule(dt) {
    const G = this.G;
    if (this.active || !G.startup.departed || !this.cannons.length) return;
    const tide = G.startup.tide.state;
    const ok = !G.events.current && !G.boat.stranded && G.startup.waterLevel > 0.5 &&
      !(tide && (tide.phase.id === 'seco' || tide.changing || tide.nextIn < 45)) &&
      !G.enemies.list.some((e) => e.pirate && e.state !== 'dead');
    if (!ok) return;
    this.timer -= dt;
    if (this.timer <= 0) this.startBattle();
  }

  // ---------- loop ----------
  update(dt, t) {
    const G = this.G;
    this.t = t;
    if (!G.started) return;
    const host = this._isHost();
    if (host) this._schedule(dt);
    // maré segurada no cheio durante a batalha (sobe rápido, solta devagar)
    this.holdK = clamp(this.holdK + (this.active ? dt / 4 : -dt / 12), 0, 1);

    if (host && this.active) {
      this.battleT += dt;
      if (this.battleT > NAVAL.maxDuration) for (const s of this.ships.values()) if (!s.retreat) { s.retreat = true; G.hud.msg('Os piratas estão fugindo!'); }
      for (const s of this.ships.values()) if (s.sinkT <= 0) this._shipAI(s, dt);
      for (const s of [...this.ships.values()]) {
        const far = Math.hypot(s.x - G.boat.x, s.z - G.boat.z) > 260;
        if (s.sinkT > 17 || (s.retreat && far)) this._removeShip(s);
      }
      if (!this.ships.size) { this.active = false; this.timer = between(NAVAL.interval); this._sendShips(); }
      this.sendAcc += dt;
      if (this.sendAcc > 0.2) { this.sendAcc = 0; this._sendShips(); }
    }
    for (const s of this.ships.values()) {
      this._shipVisual(s, dt, t);
      if (s.boarder && !s.spawned && s.sinkT <= 0 && !s.retreat && Math.hypot(s.x - G.boat.x, s.z - G.boat.z) < 14) {
        s.spawned = true; G.enemies.spawnBoarders(s);
      }
    }
    this.updateBalls(dt);
    this._updateCrates(dt, t);
    this.reload = Math.max(0, this.reload - dt);

    // recuo dos canhões
    for (const piece of this.cannons) {
      const c = this._nodes(piece); if (!c) continue;
      if (c.recoil > 0) c.recoil = Math.max(0, c.recoil - dt * 3);
      c.barrel.position.z = 0.62 - c.recoil * 0.25;
    }
    if (this.manning) this._updateManning(dt);
    this.flames.update(dt); this.smoke.update(dt); this.splash.update(dt); this.boom.update(dt);
  }

  _updateManning(dt) {
    const G = this.G, inp = G.input, piece = G.boat.pieces.get(this.manning);
    if (!piece || G.player.dead || G.player.downed || !G.player.aboard && !G.player.body.carrier) { this.leave(); return; }
    const hookT = piece.type === 'gancho';
    // mira: mouse/setas giram o cano (limitado) e levantam/abaixam
    const keysYaw = ((inp.held('left') || inp.held('camLeft')) ? 1 : 0) - ((inp.held('right') || inp.held('camRight')) ? 1 : 0);
    const keysEl = ((inp.held('forward') || inp.held('camUp')) ? 1 : 0) - ((inp.held('back') || inp.held('camDown')) ? 1 : 0);
    this.aimYaw = clamp(this.aimYaw - inp.mouse.dx * 0.0022 + keysYaw * 0.9 * dt, -1.3, 1.3);
    this.aimElev = clamp(this.aimElev - inp.mouse.dy * 0.0016 + keysEl * 0.35 * dt, hookT ? -0.35 : -0.06, hookT ? 0.9 : 0.62);
    this._setAim(piece, this.aimYaw, this.aimElev);
    if (inp.mouse.leftPressed) this.fire();
    this.aimAcc += dt;
    if (this.aimAcc > 0.1) { this.aimAcc = 0; G.net.send({ t: 'naval', k: 'aim', id: piece.id, y: Math.round(this.aimYaw * 100) / 100, e: Math.round(this.aimElev * 100) / 100 }); }
    // trajetória prevista
    const o = new THREE.Vector3(), v = new THREE.Vector3();
    this._muzzle(piece, o, v, hookT ? HOOK_TURRET.speed : NAVAL.muzzle);
    const pts = this.pathGeo.attributes.position, p = o.clone(), vel = v.clone(), step = hookT ? 0.035 : 0.06;
    let hit = null, n = 0;
    for (; n < pts.count; n++) {
      pts.setXYZ(n, p.x, p.y, p.z);
      for (let k = 0; k < 2 && !hit; k++) {
        vel.y -= NAVAL.gravity * step / 2; p.addScaledVector(vel, step / 2);
        if (hookT && p.distanceTo(o) > HOOK_TURRET.range) hit = { p: p.clone(), ship: false, far: true };
        else if (hookT && this.hookTargetNear(p)) hit = { p: p.clone(), ship: true };
        else if (!hookT && (this._hitShip(p) || (G.siege && G.siege.hitTower(p)))) hit = { p: p.clone(), ship: true };
        else if (p.y < waveHeight(p.x, p.z, this.t)) hit = { p: p.clone(), ship: false };
        else if (n > 3 && G.colliders.segmentBlocked(p.x, p.y - 0.15, p.z, p.x, p.y + 0.15, p.z, 0) && !this._hitRaft(p)) hit = { p: p.clone(), ship: false };
      }
      if (hit) { n++; break; }
    }
    for (let i = n; i < pts.count; i++) pts.setXYZ(i, p.x, p.y, p.z);
    pts.needsUpdate = true; this.path.computeLineDistances();
    this.path.visible = true;
    const reticle = this.reticle;
    if (hit) {
      this.ring.visible = !hit.ship; this.ring.position.set(hit.p.x, hit.p.y + 0.12, hit.p.z);
      this.ring.material.color.set(hit.ship ? 0xff5a3a : 0xf3cf7e);
      if (reticle) {
        const sp = hit.p.clone().project(G.camera), on = sp.z < 1 && Math.abs(sp.x) < 1.1 && Math.abs(sp.y) < 1.1;
        reticle.hidden = !on;
        reticle.style.left = `${(sp.x * 0.5 + 0.5) * innerWidth}px`;
        reticle.style.top = `${(-sp.y * 0.5 + 0.5) * innerHeight}px`;
        reticle.classList.toggle('lock', hit.ship);
      }
    } else { this.ring.visible = false; if (reticle) reticle.hidden = true; }
    if (reticle) {
      if (hookT) {
        const busy = !!(G.tools && G.tools.hook);
        reticle.style.setProperty('--r', busy ? '0' : '1');
        reticle.dataset.ammo = busy ? 'clique: recolher' : 'GANCHO PRONTO';
        reticle.classList.toggle('ready', !busy);
      } else {
        reticle.style.setProperty('--r', (1 - this.reload / NAVAL.reload).toFixed(3));
        reticle.dataset.ammo = this.reload > 0 ? `recarregando ${Math.ceil(this.reload)}s` : 'PRONTO';
        reticle.classList.toggle('ready', this.reload <= 0);
      }
    }
  }

  // câmera de artilheiro: atrás e acima do canhão, olhando para onde o cano aponta
  updateCamera(cam, dt, t) {
    const G = this.G, piece = G.boat.pieces.get(this.manning); if (!piece) return false;
    const c = this._nodes(piece);
    piece.mesh.updateWorldMatrix(true, true);
    c.pitchNode.getWorldPosition(_w);
    const yaw = G.boat.yaw + piece.yaw + this.aimYaw, fx = Math.sin(yaw), fz = Math.cos(yaw);
    // sobre o ombro direito do artilheiro (o personagem não tapa a mira)
    const back = 5.2, up = 2.6 + this.aimElev * 3, side = 1.25, rx = Math.cos(yaw), rz = -Math.sin(yaw);
    const target = _v.set(_w.x - fx * back - rx * side, _w.y + up, _w.z - fz * back - rz * side);
    if (!this._camInit) { cam.position.copy(target); this._camInit = true; }
    cam.position.lerp(target, Math.min(1, 10 * dt));
    const wy = waveHeight(cam.position.x, cam.position.z, t) + 0.4;
    if (cam.position.y < wy) cam.position.y = wy;
    cam.fov += (60 - cam.fov) * Math.min(1, 8 * dt); cam.updateProjectionMatrix();
    cam.up.set(0, 1, 0);
    cam.lookAt(_w.x + fx * 30, _w.y + 1.2 + this.aimElev * 10, _w.z + fz * 30);
    return true;
  }
}
