// Barco: um "set" de colisores que se move. A flutuação é calculada a partir das ondas e
// suavizada (inclinação limitada), então o barco nunca vira. Quem está a bordo é carregado
// pelo deslocamento do barco (carry), inclusive durante o pulo.
// NOVO: navegação LINEAR durante a aventura, controle 360° só na batalha final.
// NOVO: se todos os jogadores saírem, as velas baixam e o barco para.
import * as THREE from '../three.js';
import { rot, clamp, lerpAngle } from '../core/util.js';
import { CFG } from '../config.js';
import { orientedBox } from '../world/colliders.js';
import { sea, waveHeight } from '../world/ocean.js';
import { PIECES, STARTER_PLATFORM_SIZE, makePieceMesh } from './pieces.js';
import { woodTexture, woodBump, metalTexture, clothTexture, repeated } from '../world/textures.js';
// Leme pesado: gain = quanto do desvio vira giro desejado (rad/s por rad), max = giro máximo (rad/s,
// ~8°/s), accel = quão rápido o giro aumenta/diminui (rad/s²).
export const BOAT_TURN = { gain: 0.35, max: 0.14, accel: 0.1 };
import { Navigation, NAV_MODE } from './navigation.js';

export const DECK_BOTTOM = 0.15; // base dos pisos iniciais (local ao barco)
const KEEL = 0.9; // distância do fundo dos barris até a linha d'água do convés
const MAST = { x: 0, z: 1 };
const STARTER_DECK_OVERLAP = 0.25;
const STARTER_SLOT_POSITIONS = [
  { id: 'deck-main', x: 0, z: -(STARTER_PLATFORM_SIZE - STARTER_DECK_OVERLAP), size: STARTER_PLATFORM_SIZE, radius: 0.85 },
];

export class Boat {
  constructor(G) {
    this.G = G;
    this.group = new THREE.Group();
    this.group.rotation.order = 'YXZ';
    G.scene.add(this.group);
    this.set = G.colliders.addSet({ x: 0, z: 0, yaw: 0, y: 0, radius: 6, items: [] });
    this.pieces = new Map();
    this.x = 0; this.z = 0; this.yaw = 0; this.speed = 0;
    this.sailUp = false; this.sailInstalled = false; this.sailAngle = 0; this.sailT = 0;
    this.bob = 0; this.pitch = 0; this.roll = 0;
    this.prev = { x: 0, z: 0, yaw: 0, y: 0 };
    this.netTarget = null;

    // Sistema de navegação
    this.nav = new Navigation(G);

    // Plataforma central fixa e um encaixe para a plataforma principal.
    this.deckSlots = STARTER_SLOT_POSITIONS;
    this.addPiece({
      id: 'starter-platform', type: 'plataforma', x: 0, y: DECK_BOTTOM, z: 0,
      yaw: 0, locked: true, indestructible: true,
    });
    this.addPiece({
      id: 'mastro', type: 'mastro', x: MAST.x, y: 0.35 + 2.5, z: MAST.z,
      yaw: 0, locked: true, indestructible: true,
    });
    this._makeDeckSlotMarkers();

    // Flutuadores: barris de madeira com cintas de ferro, presos por cordas.
    const barrelGeo = new THREE.CylinderGeometry(0.45, 0.45, 1.4, 16, 6);
    { // barriga do barril
      const p = barrelGeo.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const y = p.getY(i) / 0.7, k = 1 + 0.12 * (1 - y * y);
        p.setX(i, p.getX(i) * k); p.setZ(i, p.getZ(i) * k);
      }
      barrelGeo.computeVertexNormals();
    }
    const barrelMat = new THREE.MeshStandardMaterial({ color: 0x8a6239, map: repeated(woodTexture(), 1.2, 0.8), bumpMap: repeated(woodBump(), 1.2, 0.8), bumpScale: 1.5, roughness: 0.9 });
    const hoopMat = new THREE.MeshStandardMaterial({ color: 0x4a4a50, map: metalTexture(), metalness: 0.65, roughness: 0.5 });
    const ropeMat = new THREE.MeshStandardMaterial({ color: 0xb59b6a, roughness: 1 });
    for (const [fx, fz] of [[-2.2, -2.2], [2.2, -2.2], [-2.2, 2.2], [2.2, 2.2]]) {
      const f = new THREE.Group();
      f.add(new THREE.Mesh(barrelGeo, barrelMat));
      for (const y of [-0.5, 0, 0.5]) {
        const hoop = new THREE.Mesh(new THREE.TorusGeometry(0.45 * (1 + 0.12 * (1 - (y / 0.7) ** 2)) + 0.01, 0.025, 6, 20), hoopMat);
        hoop.rotation.x = Math.PI / 2; hoop.position.y = y; f.add(hoop);
      }
      f.rotation.x = Math.PI / 2; f.position.set(fx, -0.4, fz); // logo abaixo do convés
      this.group.add(f);
    }
    // Vela.
    this.sailGroup = new THREE.Group();
    this.sailGroup.position.set(MAST.x, 0, MAST.z);
    const spar = new THREE.MeshStandardMaterial({ color: 0x6d4f2e, map: repeated(woodTexture(), 0.3, 1.5), roughness: 0.85 });
    const yard = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 3.5, 10), spar);
    yard.rotation.z = Math.PI / 2; yard.position.set(0, 5, 0.2);
    for (const x of [-1.65, 1.65]) { // ponteiras amarradas
      const tip = new THREE.Mesh(new THREE.TorusGeometry(0.085, 0.022, 5, 10), ropeMat);
      tip.rotation.y = Math.PI / 2; tip.position.set(x, 5, 0.2); this.sailGroup.add(tip);
    }
    this.cloth = new THREE.Mesh(
      new THREE.PlaneGeometry(3.2, 3, 20, 20),
      new THREE.MeshStandardMaterial({ color: 0xffffff, map: clothTexture(), side: THREE.DoubleSide, roughness: 0.95 })
    );
    this.cloth.position.z = 0.5;
    this.sailBase = this.cloth.geometry.attributes.position.array.slice();
    this.sailGroup.add(yard, this.cloth);
    // Cordame fixo: estais do topo do mastro até os cantos da plataforma central.
    const top = new THREE.Vector3(MAST.x, 5.3, MAST.z);
    for (const [cx, cz] of [[-2.8, -1.8], [2.8, -1.8], [-2.8, 2.8], [2.8, 2.8]]) {
      const end = new THREE.Vector3(cx, DECK_BOTTOM + 0.35, cz), dir = end.clone().sub(top);
      const stay = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, dir.length(), 4), ropeMat);
      stay.position.copy(top).add(end).multiplyScalar(0.5);
      stay.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
      this.group.add(stay);
    }
    // Bandeira no topo do mastro (tremula com o vento em update).
    this.flag = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.5, 10, 2),
      new THREE.MeshStandardMaterial({ color: 0xd9452e, side: THREE.DoubleSide, roughness: 0.9 }));
    this.flag.geometry.translate(0.45, 0, 0);
    this.flag.position.set(MAST.x, 5.75, MAST.z);
    this.flagBase = this.flag.geometry.attributes.position.array.slice();
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.8, 5), spar);
    pole.position.set(MAST.x, 5.6, MAST.z);
    this.group.add(this.flag, pole);
    this.group.add(this.sailGroup);
    this.sailGroup.visible = false;
  }

  addPiece(p) {
    if (!p || typeof p.id !== 'string' || this.pieces.has(p.id) || !PIECES[p.type]) return;
    if (p.startSlotId && [...this.pieces.values()].some((piece) => piece.startSlotId === p.startSlotId)) return;
    const def = PIECES[p.type], [w, h, l] = def.size;
    const mesh = makePieceMesh(p.type);
    mesh.position.set(p.x, p.y, p.z);
    mesh.rotation.order = 'YXZ';
    mesh.rotation.set(p.rotX || 0, p.yaw, p.rotZ || 0);
    this.group.add(mesh);
    const col = orientedBox(p.x, p.y, p.z, w / 2, h / 2, l / 2, p.yaw, p.rotX || 0, p.rotZ || 0, def.col || 'box');
    this.set.items.push(col);
    const piece = {
      ...p, mesh, col,
      locked: !!p.locked || p.id === 'starter-platform' || p.id === 'mastro' || p.id.startsWith('starter-deck-'),
      indestructible: !!p.indestructible || p.id === 'starter-platform',
    };
    mesh.traverse((o) => { if (o.isMesh) { o.buildPiece = piece; this.G.solids.push(o); } });
    this.pieces.set(p.id, piece);
    this.group.updateMatrixWorld(true);
    this.G.physics.addRaftPiece(p.id, mesh, def.size, piece);
    this.recalcRadius();
  }
  removePiece(id) {
    const piece = this.pieces.get(id);
    if (!piece || piece.locked || piece.indestructible) return null;
    this.group.remove(piece.mesh);
    this.G.physics.removeRaftPiece(id);
    piece.mesh.traverse((o) => { if (o.isMesh) { const i = this.G.solids.indexOf(o); if (i >= 0) this.G.solids.splice(i, 1); o.geometry.dispose(); } });
    this.set.items.splice(this.set.items.indexOf(piece.col), 1);
    this.pieces.delete(id);
    this.recalcRadius();
    return piece;
  }
  recalcRadius() {
    let r = 3;
    for (const c of this.set.items) r = Math.max(r, Math.hypot(c.x, c.z) + Math.hypot(c.hx, c.hz));
    this.set.radius = r;
  }

  _makeDeckSlotMarkers() {
    const material = new THREE.LineBasicMaterial({
      color: 0xf3c45f, transparent: true, opacity: 0.75, depthWrite: false,
    });
    this.deckSlotMarkers = new Map();
    for (const slot of this.deckSlots) {
      const geometry = new THREE.EdgesGeometry(new THREE.BoxGeometry(slot.size, 0.04, slot.size));
      const marker = new THREE.LineSegments(geometry, material);
      marker.position.set(slot.x, DECK_BOTTOM + 0.13, slot.z);
      marker.visible = false;
      this.group.add(marker);
      this.deckSlotMarkers.set(slot.id, marker);
    }
  }

  get buildProgress() {
    return this.deckSlots.filter((slot) =>
      [...this.pieces.values()].some((piece) => piece.startSlotId === slot.id)
    ).length;
  }

  get isComplete() { return this.buildProgress === this.deckSlots.length; }

  matchDeckSlot(worldPosition, pieceType, radius = 1.35) {
    if (pieceType !== 'piso' || !this.G.startup || this.G.startup.phase !== 'build') return null;
    this.group.updateMatrixWorld(true);
    const local = this.group.worldToLocal(worldPosition.clone());
    let best = null, bestDistance = Infinity;
    for (const slot of this.deckSlots) {
      if ([...this.pieces.values()].some((piece) => piece.startSlotId === slot.id)) continue;
      const distance = Math.hypot(local.x - slot.x, local.z - slot.z);
      if (distance <= Math.min(radius, slot.radius) && Math.abs(local.y - DECK_BOTTOM) <= 0.65) {
        best = slot;
        bestDistance = distance;
      }
    }
    return best;
  }

  setSailInstalled(installed) {
    this.sailInstalled = !!installed;
    this.sailGroup.visible = this.sailInstalled;
    if (this.sailInstalled && this.sailT < 0.12) this.sailT = 0.12;
  }

  // Gira com inércia: a velocidade de giro vai até a desejada devagar e nunca passa do limite.
  // Com a jangada lenta o leme quase não pega.
  turn(wantRate, dt) {
    const grip = 0.3 + 0.7 * Math.min(1, this.speed / CFG.boatSpeed);
    const want = Math.max(-BOAT_TURN.max, Math.min(BOAT_TURN.max, wantRate)) * grip;
    const step = BOAT_TURN.accel * dt;
    this.yawRate = (this.yawRate || 0) + Math.max(-step, Math.min(step, want - (this.yawRate || 0)));
    this.yaw += this.yawRate * dt;
  }
  toLocal(x, z) { return rot(x - this.x, z - this.z, -this.yaw); }
  toWorld(lx, lz) { const [x, z] = rot(lx, lz, this.yaw); return [x + this.x, z + this.z]; }
  mastWorld() { return this.toWorld(MAST.x, MAST.z); }

  // Conta quantos jogadores estão a bordo (local + remotos)
  countPlayersAboard() {
    const G = this.G;
    let count = G.player && G.player.aboard ? 1 : 0;
    for (const r of G.net.remotes.values()) {
      if (r.aboard) count++;
    }
    return count;
  }

  // Pedidos de vela passam pela rede quando não somos o host.
  setSail(up, angle) {
    if (up && !this.sailInstalled) return false;
    angle = clamp(angle, -0.6, 0.6);
    const net = this.G.net;
    if (net.online && !net.isHost) net.send({ t: 'sail', up, angle });
    else { this.sailUp = up; this.sailAngle = angle; }
    return true;
  }

  update(dt, t) {
    const pv = this.prev;
    pv.x = this.x; pv.z = this.z; pv.yaw = this.yaw; pv.y = this.set.y;
    const net = this.G.net;
    const startup = this.G.startup;
    const anchored = !!(startup && startup.anchor && !startup.departed);

    if (this.G.started && startup.departed && net.isHost) {
      const aboard = this.countPlayersAboard();
      if (aboard === 0 && this.sailUp) {
        this.sailUp = false;
        net.send({ t: 'sail', up: false, angle: this.sailAngle });
        this.G.hud && this.G.hud.msg('Ninguém a bordo — vela baixou automaticamente.');
      }
    }

    if (anchored) {
      this.x = startup.anchor.x;
      this.z = startup.anchor.z;
      this.yaw = 0;
      this.speed = 0;
      this.sailUp = false;
    } else if (net.online && !net.isHost && this.netTarget) {
      const n = this.netTarget, k = Math.min(1, 8 * dt);
      this.x += (n.x - this.x) * k; this.z += (n.z - this.z) * k;
      this.yaw = lerpAngle(this.yaw, n.yaw, k);
      this.speed = n.speed; this.sailUp = n.up; this.sailAngle = n.angle;
    } else {
      // Rajadas aumentam a força da vela; baixá-la continua deixando o barco desacelerar.
      const storm = clamp((sea.amp - 1) / 1.8, 0, 1);
      const gust = 1 + Math.sin(t * 0.17) * 0.07 + storm * (0.06 + Math.sin(t * 0.53) * 0.12);
      const trim = 1 - Math.abs(this.sailAngle) * 0.08;
      const target = this.sailUp
        ? CFG.boatSpeed * clamp(gust * trim, 0.85, 1.25)
        : 0;
      const acceleration = this.sailUp ? 0.45 : 0.6;
      this.speed += (target - this.speed) * Math.min(1, acceleration * dt);
      // Oceano seco: a jangada encalha na areia até a água voltar.
      const wasStranded = this.stranded;
      this.stranded = !!(startup && startup.departed) && this.G.world.seabedHeight(this.x, this.z) + KEEL > sea.level + 0.1;
      if (this.stranded) {
        this.speed = 0;
        if (!wasStranded) this.G.hud && this.G.hud.msg('A jangada encalhou na areia — explore o fundo do mar até a água voltar.');
      } else if (wasStranded) this.G.hud && this.G.hud.msg('A água voltou: a jangada está flutuando de novo!');

      // Atualiza o segmento da rota de acordo com a posição Z do barco
      this.nav.updateSegment(this.z);

      if (this.stranded) {
        // parada na areia (só eventos ainda podem arrastá-la)
      } else if (this.nav.isLinear) {
        // Modo LINEAR: yaw segue a rota; sailAngle só adiciona pequeno desvio lateral
        const targetYaw = this.nav.getTargetYaw(dt, this.sailAngle);
        // Direção pesada: o leme acelera o giro aos poucos e tem um limite (jangada não vira na hora)
        const diff = Math.atan2(Math.sin(targetYaw - this.yaw), Math.cos(targetYaw - this.yaw));
        this.turn(diff * BOAT_TURN.gain, dt);
        // Mantém o barco avançando na direção da rota
        this.x += Math.sin(this.yaw) * this.speed * dt;
        this.z += Math.cos(this.yaw) * this.speed * dt;
      } else {
        // Modo LIVRE (batalha final): comportamento original
        this.turn(this.sailAngle * 0.35 * (this.speed / CFG.boatSpeed), dt);
        this.x += Math.sin(this.yaw) * this.speed * dt;
        this.z += Math.cos(this.yaw) * this.speed * dt;
      }

      // Eventos: arremesso (onda gigante / cuspido do furacão) e giro descontrolado.
      if (this.fling) {
        const f = this.fling, k = f.t / f.T;
        this.x += f.vx * k * dt; this.z += f.vz * k * dt;
        f.t -= dt; if (f.t <= 0) this.fling = null;
      }
      if (this.spin) {
        this.yaw += this.spin.rate * dt;
        this.spin.t -= dt; if (this.spin.t <= 0) this.spin = null;
      }
      if (startup && startup.departed) this.G.world.pushBoat(this, dt);
    }

    this.sailT += ((this.sailUp ? 1 : 0) - this.sailT) * (1 - Math.exp(-3.2 * dt));
    if (this.sailInstalled && !this.sailUp) this.sailT = Math.max(0.12, this.sailT);
    const s = Math.max(0.06, this.sailT);
    this.cloth.scale.y = s;
    this.cloth.position.y = 5 - 1.5 * s;
    this.sailGroup.rotation.y = this.sailAngle;
    const storm = clamp((sea.amp - 1) / 1.8, 0, 1);
    const gust = 1 + Math.sin(t * 0.17) * 0.07 + storm * (0.06 + Math.sin(t * 0.53) * 0.12);
    const clothPositions = this.cloth.geometry.attributes.position;
    const cloth = clothPositions.array;
    for (let i = 0; i < cloth.length; i += 3) {
      const x = this.sailBase[i];
      const y = this.sailBase[i + 1];
      const edge = 1 - Math.abs(x) / 1.6;
      // barriga da vela (cheia de vento quando levantada) + tremulação nas bordas
      const belly = (1 - (x / 1.6) ** 2) * (1 - (y / 1.5) ** 2 * 0.6) * this.sailT * (0.55 + storm * 0.25);
      cloth[i + 2] = this.sailBase[i + 2] + Math.max(0, belly) +
        Math.sin(t * (1.7 + storm * 0.9) + y * 1.25 + x * 0.55 + this.sailAngle) *
        0.24 * edge * s * gust * (1.15 - this.sailT * 0.6) +
        Math.sin(t * 9 + x * 4 + y * 3) * 0.025 * edge * (0.4 + storm);
    }
    clothPositions.needsUpdate = true;
    this.cloth.geometry.computeVertexNormals();
    // Bandeira: aponta a favor do vento (oposto à proa) e ondula mais na ponta.
    {
      const fp = this.flag.geometry.attributes.position, fa = fp.array, fb = this.flagBase;
      for (let i = 0; i < fp.count; i++) {
        const x = fb[i * 3];
        fa[i * 3 + 2] = Math.sin(t * (6 + storm * 5) - x * 5) * 0.09 * x * (1 + storm);
        fa[i * 3 + 1] = fb[i * 3 + 1] + Math.sin(t * 4 - x * 3) * 0.03 * x;
      }
      fp.needsUpdate = true;
      this.flag.geometry.computeVertexNormals();
      this.flag.rotation.y = Math.PI / 2 + Math.sin(t * 0.7) * 0.15;
    }
    for (const slot of this.deckSlots) {
      const filled = [...this.pieces.values()].some((piece) => piece.startSlotId === slot.id);
      const marker = this.deckSlotMarkers.get(slot.id);
      if (marker) marker.visible = !!(startup && startup.phase === 'build' && !filled);
    }

    // Flutuação: amostras mais densas para um mar mais estável e menos "deformado".
    const R = Math.min(this.set.radius, 6) * 0.7;
    // Flutua nas ondas; sem água, apoia os barris no fundo do mar (inclina com o terreno).
    const sample = (lx, lz) => {
      const [wx, wz] = this.toWorld(lx, lz);
      return Math.max(waveHeight(wx, wz, t), this.G.world.seabedHeight(wx, wz) + KEEL);
    };
    if (anchored && sea.level <= 0.55) {
      this.bob = this.pitch = this.roll = 0;
    } else {
      const points = [
        [0, R], [0, -R], [-R, 0], [R, 0],
        [-R * 0.7, R * 0.7], [R * 0.7, R * 0.7],
        [-R * 0.7, -R * 0.7], [R * 0.7, -R * 0.7],
      ];
      const he = points.map(([lx, lz]) => sample(lx, lz));
      const avg = he.reduce((sum, value) => sum + value, 0) / he.length;
      const tilt = this.G.events ? this.G.events.tiltMax : 0.12;
      const pitchTarget = clamp(-Math.atan2(sample(0, R) - sample(0, -R), 2 * R) * (tilt > 0.12 ? 1.6 : 1), -tilt, tilt);
      const rollTarget = clamp(Math.atan2(sample(R, 0) - sample(-R, 0), 2 * R) * (tilt > 0.12 ? 1.6 : 1), -tilt, tilt);
      const k = Math.min(1, (tilt > 0.12 ? 5 : 3) * dt);
      this.bob += ((avg - sea.level) - this.bob) * k;
      this.pitch += (pitchTarget - this.pitch) * k;
      this.roll += (rollTarget - this.roll) * k;
    }

    const raftLevel = anchored ? Math.max(0.55, sea.level) : sea.level;
    this.set.x = this.x; this.set.z = this.z; this.set.yaw = this.yaw; this.set.y = raftLevel + this.bob;
    this.group.position.set(this.x, this.set.y, this.z);
    this.group.rotation.set(this.pitch, this.yaw, this.roll);
    this.group.updateMatrixWorld(true);
    this.G.physics.setRaftPose(
      this.group.getWorldPosition(new THREE.Vector3()),
      this.group.getWorldQuaternion(new THREE.Quaternion()),
      dt
    );
  }

  // Aplica o deslocamento do barco neste frame a um corpo a bordo. Retorna o giro (yaw).
  carry(body) {
    const pv = this.prev;
    const [lx, lz] = rot(body.pos.x - pv.x, body.pos.z - pv.z, -pv.yaw);
    const [wx, wz] = rot(lx, lz, this.yaw);
    body.pos.x = this.x + wx; body.pos.z = this.z + wz;
    body.pos.y += this.set.y - pv.y;
    return this.yaw - pv.yaw;
  }
}
