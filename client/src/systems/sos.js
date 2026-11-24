// EVENTO "SOS" (fim da jornada, progresso ≥ 70%): o rádio capta um pedido de socorro e uma
// PLATAFORMA DE PETRÓLEO ABANDONADA aparece à frente da rota (world/oilrig.js). Era uma isca:
// está tomada por soldados, sala por sala, com o chefe da minigun no teto ao lado da sala de rádio.
// Limpar a plataforma inteira solta sacos de loot pesado na sala de rádio. A plataforma some
// quando a jangada se afasta (> 650 m).
// Rede: o host sorteia o evento (events.js) com posição e semente; todos montam a mesma plataforma;
// inimigos e loot são do host (réplicas/sacos chegam pela rede como sempre).
import { mulberry32 } from '../core/util.js';
import { buildOilRig, RIG } from '../world/oilrig.js';
import { bakeStatic } from '../core/bake.js';
import { sfx } from '../core/sfx.js';

export const SOS = { minProgress: 0.7, ahead: 190, side: 70, keepDist: 650 };
const TYPES = [['soldado', 4], ['escopeteiro', 2], ['elite', 2], ['pesado', 1], ['melee', 1]];
const pickType = (r) => { let x = r() * 10; for (const [t, w] of TYPES) { x -= w; if (x <= 0) return t; } return 'soldado'; };

export class Sos {
  constructor(G) { this.G = G; this.rig = null; this.done = 0; this.msgT = 0; }

  // host: onde colocar a plataforma (à frente, desviada para o lado, longe de ilhas)
  pickSpot() {
    const G = this.G, b = G.boat, fx = Math.sin(b.yaw), fz = Math.cos(b.yaw);
    for (let k = 0; k < 12; k++) {
      const side = (k % 2 ? 1 : -1) * (SOS.side + k * 8), ahead = SOS.ahead + k * 12;
      const x = b.x + fx * ahead + fz * side, z = b.z + fz * ahead - fx * side;
      if (G.world.islands.every((i) => Math.hypot(i.x - x, i.z - z) > (i.R || 20) + 45)) return { x, z, yaw: Math.random() * 6.28 };
    }
    return null;
  }

  start(e) {
    const G = this.G;
    if (this.rig && this.rig.id === e.id) return;
    if (this.rig) this.remove();
    const id = `sos${e.id}`, r = mulberry32(e.seed || 1);
    const b = buildOilRig({ x: e.x, z: e.z, yaw: e.yaw, r, seabed: (x, z) => G.world.seabedHeight(x, z) });
    const { group, set, solids } = b;
    const isl = {
      id, x: e.x, z: e.z, R: b.R, diff: 4, group, set, solids, crates: [], enemies: [], palms: [],
      seaSite: 'rig', siteType: 'rig', siteCenter: [0, 0], rooms: [], towers: [], spawnSpots: b.spawnSpots, ladders: b.ladders,
      landLayers: [], allItems: set.items.slice(), maxGround: Infinity, floodTier: null, minY: set.y - 2.5, block: b.block,
    };
    const keep = new Set([...solids, b.flame, b.beacon, b.radioLight]);
    bakeStatic(group, { keep: (o) => keep.has(o) || o.userData.noBake });
    G.scene.add(group); group.updateMatrixWorld(true);
    G.colliders.addSet(set); G.physics.addStaticSet(set); G.solids.push(...solids);
    G.world.islands.push(isl);
    this.rig = { id, e, isl, b, rewarded: false, spawned: false, t: 0 };
    if (G.enemies.auth) this._spawnEnemies();
    G.hud.msg('📻 Pedido de SOS captado: uma plataforma de petróleo à frente. Pode ser uma armadilha...');
    sfx.click(null, 2.2);
  }

  _spawnEnemies() {
    const G = this.G, E = G.enemies, rig = this.rig, isl = rig.isl, r = mulberry32((rig.e.seed || 1) ^ 0x5a5a);
    isl.spawnSpots.forEach((sp, i) => {
      const e = E.spawn(`${isl.id}e${i}`, pickType(r), isl, isl.x + sp.x, isl.z + sp.z);
      e.body.pos.y = isl.set.y + 0.55 + sp.y + 0.3; e.yaw = r() * 6.28;
      e.zone = { ...sp.zone, x: isl.x + sp.zone.x, z: isl.z + sp.zone.z };
    });
    const bs = rig.b.boss, boss = E.spawn(`${isl.id}boss`, 'metralhador', isl, isl.x + bs.x, isl.z + bs.z);
    boss.body.pos.y = isl.set.y + 0.55 + bs.y + 0.3; boss.yaw = r() * 6.28;
    boss.zone = { x: isl.x + bs.x, z: isl.z + bs.z, yaw: 0, hw: 6, hd: 4 };
    for (const e of isl.enemies) { e.mesh.position.copy(e.body.pos); e.mesh.rotation.y = e.yaw; }
    rig.spawned = true;
  }

  remove() {
    const G = this.G, rig = this.rig; if (!rig) return;
    const isl = rig.isl;
    G.physics.removeStaticSet(isl.set); G.colliders.removeSet(isl.set); G.scene.remove(isl.group);
    for (const m of isl.solids) { const i = G.solids.indexOf(m); if (i >= 0) G.solids.splice(i, 1); }
    const i = G.world.islands.indexOf(isl); if (i >= 0) G.world.islands.splice(i, 1);
    G.enemies.removeIsland(isl);
    this.rig = null;
  }

  update(dt, t) {
    const G = this.G, rig = this.rig; if (!rig) return;
    rig.t += dt;
    const b = rig.b;
    // chama do queimador tremulando, luz vermelha piscando, luz do rádio
    b.flame.scale.set(1 + Math.sin(t * 13) * 0.08, 1 + Math.sin(t * 7.3) * 0.18 + Math.sin(t * 17) * 0.06, 1 + Math.cos(t * 11) * 0.08);
    b.beacon.visible = (t % 1.2) < 0.6;
    b.radioLight.visible = (t % 0.5) < 0.3;
    const d = Math.hypot(G.boat.x - rig.isl.x, G.boat.z - rig.isl.z);
    // lembrete de onde fica enquanto ninguém chegou perto
    this.msgT -= dt;
    if (!rig.visited && d < 60) rig.visited = true;
    if (!rig.visited && this.msgT <= 0) { this.msgT = 35; G.hud.msg(`📻 SOS: plataforma a ${Math.round(d)} m (procure a luz vermelha e a chama)`); }
    // tudo limpo: recompensa na sala de rádio (host cria os sacos, a rede espalha)
    if (G.enemies.auth && rig.spawned && !rig.rewarded && rig.isl.enemies.every((e) => e.state === 'dead')) {
      rig.rewarded = true; this.done++;
      const p = rig.b.radio, base = { x: rig.isl.x + p.x, y: rig.isl.set.y + 0.55 + p.y + 0.2, z: rig.isl.z + p.z };
      const loots = [
        { arma_rifle_precisao: 1, municao: 25 },
        { arma_escopeta: 1, cartucho: 16, kit: 2 },
        { canhao: 1, bandagem: 3, energetico: 2 },
      ];
      loots.forEach((loot, k) => G.drops.dropAt({ x: base.x + (k - 1) * 0.9, y: base.y, z: base.z }, loot));
      G.hud.msg('📻 Plataforma limpa! O "SOS" era isca — mas o estoque deles ficou na sala de rádio.');
      if (G.net.online) G.net.send({ t: 'event', e: { ...rig.e, cleared: 1 } });
    }
    if (d > SOS.keepDist) this.remove();
  }
}
export { RIG };
