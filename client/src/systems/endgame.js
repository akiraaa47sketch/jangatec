// FIM DE JOGO: depois de derrubar os quatro chefes da plataforma Leviatã, o rádio do topo capta as
// COORDENADAS DE UM ABRIGO (uma ilha de resgate a ~1,5 km). A jangada ganha controle 360° (a vela vira
// o leme) e um marcador no HUD aponta o caminho. Perto do abrigo, OS TWINS (naval.js) fecham o
// caminho; afundando os dois, dá para atracar na ilha de resgate.
// Tudo deriva da semente do evento SOS (todos os clientes calculam o mesmo abrigo); os Twins são do host.
import * as THREE from '../three.js';
import { mulberry32 } from '../core/util.js';
import { keyOf } from '../core/keybinds.js';

export const ENDGAME = { dist: 1500, twinsAt: 650, arriveR: 26, R: 22 };

export class Endgame {
  constructor(G) {
    this.G = G; this.shelter = null; this.twinsStarted = false; this.arrived = false; this.warnT = 0;
    const el = document.createElement('div'); el.id = 'shelterMark'; el.hidden = true;
    el.innerHTML = '<b class="arrow">▲</b><span class="lbl">Abrigo</span><span class="dist"></span>';
    document.getElementById('hud').appendChild(el); this.el = el;
  }

  // rádio do topo da Leviatã: revela o abrigo (idempotente, todos os clientes)
  reveal(rig) {
    if (this.shelter) return;
    const G = this.G, e = rig.e, r = mulberry32((e.seed || 7) ^ 0xab12);
    const out = Math.atan2(e.x, e.z) + (r() - 0.5) * 1.2; // continua para longe da origem, com desvio
    const x = e.x + Math.sin(out) * ENDGAME.dist, z = e.z + Math.cos(out) * ENDGAME.dist;
    this.shelter = { x, z };
    this._build(x, z, r);
    G.boat.nav.unlockFree();
    G.hud.msg(`📻 Coordenadas de um ABRIGO no rádio! Navegação livre: gire a vela no mastro com [${keyOf('sailLeft')}] [${keyOf('sailRight')}] para virar a jangada.`);
    if (G.hud.banner) G.hud.banner('COORDENADAS DO ABRIGO', 'Siga o marcador no topo da tela. Algo lendário guarda o caminho...', 'good', 7);
  }

  // ilha de resgate: praia, farol listrado com luz girando, posto de resgate, heliporto e cais
  _build(x, z, r) {
    const G = this.G, R = ENDGAME.R, group = new THREE.Group(); group.position.set(x, 0, z);
    const M = (c, e = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.8, ...e });
    const set = { x, z, yaw: 0, y: 0, radius: R + 10, items: [] }, solids = [];
    const add = (mesh, lx, y, lz) => { mesh.position.set(lx, y, lz); mesh.castShadow = mesh.receiveShadow = true; group.add(mesh); return mesh; };
    const box = (lx, y0, lz, w, h, l, mat) => { const m = add(new THREE.Mesh(new THREE.BoxGeometry(w, h, l), mat), lx, y0 + h / 2, lz); solids.push(m); set.items.push({ type: 'box', x: lx, y: y0 + h / 2, z: lz, hx: w / 2, hy: h / 2, hz: l / 2, yaw: 0 }); return m; };
    const TOPY = 2.4;
    add(new THREE.Mesh(new THREE.CylinderGeometry(R + 3, R + 6, TOPY + 8, 40), M(0xcdb986)), 0, (TOPY - 8) / 2, 0);
    set.items.push({ type: 'cyl', x: 0, y: (TOPY - 8) / 2, z: 0, hx: R + 3, hy: (TOPY + 8) / 2, hz: R + 3 });
    add(new THREE.Mesh(new THREE.CylinderGeometry(R * 0.75, R * 0.8, 0.1, 32), M(0x6f9d4c)), 0, TOPY + 0.03, 0);
    // farol
    const stripes = [0xf2efe6, 0xc23a2a];
    for (let i = 0; i < 6; i++) add(new THREE.Mesh(new THREE.CylinderGeometry(1.9 - i * 0.12, 2 - i * 0.12, 3, 20), M(stripes[i % 2])), -8, TOPY + 1.5 + i * 3, -6);
    set.items.push({ type: 'cyl', x: -8, y: TOPY + 9, z: -6, hx: 2, hy: 9, hz: 2 });
    const lamp = add(new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 1.6, 16), M(0xfff2b0, { emissive: 0xffd86a, emissiveIntensity: 3 })), -8, TOPY + 19, -6);
    add(new THREE.Mesh(new THREE.ConeGeometry(1.6, 1.4, 16), M(0x2a2a2a)), -8, TOPY + 20.5, -6);
    const beam = new THREE.Mesh(new THREE.ConeGeometry(4, 40, 16, 1, true), new THREE.MeshBasicMaterial({ color: 0xfff2b0, transparent: true, opacity: 0.14, depthWrite: false, side: THREE.DoubleSide }));
    beam.geometry.translate(0, -20, 0); beam.rotation.z = Math.PI / 2; const pivot = add(new THREE.Group(), -8, TOPY + 19, -6); pivot.add(beam); beam.userData.noShadow = true;
    // posto de resgate (cruz vermelha no telhado), heliporto, cais, bandeira
    box(6, TOPY, -6, 9, 3.2, 6, M(0xe8e4da)); box(6, TOPY + 3.2, -6, 9.6, 0.3, 6.6, M(0xc23a2a));
    add(new THREE.Mesh(new THREE.BoxGeometry(3, 0.05, 0.9), M(0xffffff)), 6, TOPY + 3.55, -6); add(new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.05, 3), M(0xffffff)), 6, TOPY + 3.56, -6);
    const pad = add(new THREE.Mesh(new THREE.CylinderGeometry(5, 5, 0.06, 32), M(0x2f3a36)), 4, TOPY + 0.05, 7);
    add(new THREE.Mesh(new THREE.TorusGeometry(4.5, 0.1, 4, 40), M(0xf3cf4a, { emissive: 0x6a5a10 })), 4, TOPY + 0.1, 7).rotation.x = Math.PI / 2; void pad;
    box(0, 0.6, R + 4, 4, 0.4, 10, M(0x7a5a3a)); // cais até a água
    add(new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 7, 6), M(0x888888)), -2, TOPY + 3.5, 10);
    const flag = add(new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1), M(0x2a8a3a, { side: THREE.DoubleSide })), -1.2, TOPY + 6.4, 10); void flag;
    G.scene.add(group); group.updateMatrixWorld(true);
    G.colliders.addSet(set); G.physics.addStaticSet(set); G.solids.push(...solids);
    const isl = { id: 'abrigo', x, z, R: R + 3, diff: 0, group, set, solids, crates: [], enemies: [], palms: [], rooms: [], towers: [], spawnSpots: [], ladders: [], siteType: 'abrigo',
      landLayers: [], allItems: set.items.slice(), maxGround: Infinity, floodTier: null, minY: -3 };
    G.world.islands.push(isl);
    this.parts = { pivot, lamp, group, isl }; void r;
  }

  update(dt, t) {
    const G = this.G, s = this.shelter;
    if (!s) { this.el.hidden = true; return; }
    if (this.parts) { this.parts.pivot.rotation.y = t * 0.9; this.parts.lamp.material.emissiveIntensity = 2.5 + Math.sin(t * 6) * 0.5; }
    const boat = G.boat, d = Math.hypot(s.x - boat.x, s.z - boat.z);
    // marcador: seta relativa à câmera + distância
    const pl = G.player, fx = -Math.sin(pl.camYaw), fz = -Math.cos(pl.camYaw), pp = pl.body.pos;
    const bx = s.x - pp.x, bz = s.z - pp.z, rel = Math.atan2(fx * bz - fz * bx, fx * bx + fz * bz);
    this.el.hidden = this.arrived;
    this.el.querySelector('.arrow').style.transform = `rotate(${(-rel * 180 / Math.PI).toFixed(1)}deg)`;
    this.el.querySelector('.dist').textContent = d > 1000 ? `${(d / 1000).toFixed(2).replace('.', ',')} km` : `${Math.round(d)} m`;
    // os Twins aparecem no caminho, perto do abrigo (host)
    const host = !G.net.online || G.net.isHost;
    if (host && !this.twinsStarted && d < ENDGAME.twinsAt && G.startup.waterLevel > 0.5) { this.twinsStarted = true; G.naval.startTwins(s.x, s.z); }
    // chegada
    this.warnT -= dt;
    if (!this.arrived && d < ENDGAME.R + ENDGAME.arriveR) {
      const twinsAlive = [...G.naval.ships.values()].some((x) => x.twin && x.sinkT <= 0);
      if (twinsAlive) { if (this.warnT <= 0) { this.warnT = 12; G.hud.msg('Os Twins não deixam atracar — afunde os dois!'); } }
      else {
        this.arrived = true;
        G.hud.msg('🏝 Você chegou ao abrigo! Fim da jornada (por enquanto).');
        if (G.hud.banner) G.hud.banner('ABRIGO ALCANÇADO', 'Você sobreviveu ao mar. Fim da jornada — por enquanto.', 'good', 8);
      }
    }
  }
}
