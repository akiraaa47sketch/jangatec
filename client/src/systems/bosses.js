// Chefe da SECA (quando o mar seca e dá para andar no fundo):
//   • Escafandrista amaldiçoado (miniboss do começo): um mergulhador antigo de capacete de latão que
//     anda pelo fundo seco guardando os naufrágios. Bate forte e devagar. Se a água voltar ele se
//     AFOGA (sem loot); se você matar, larga um saco com loot.
// Só o host sorteia e simula (os outros recebem réplicas como qualquer inimigo).
import { sea } from '../world/ocean.js';
import { WORLD_LOOT_PARAMS } from './loot.js';

export const BOSSES = {
  runLength: 4 * WORLD_LOOT_PARAMS.diffStep, // m até a dificuldade máxima (world.difficulty chega a 4)
  miniChance: 0.38,     // por seca: nem toda seca (para não ficar previsível)
  miniMaxProgress: 0.6, // miniboss fraco: até ~60% da rota
  dist: [26, 40],       // m da jangada até onde o chefe surge
};

export class Bosses {
  constructor(G) { this.G = G; this.cycle = null; }

  progress() { const b = this.G.boat; return Math.min(1, Math.hypot(b.x, b.z) / BOSSES.runLength); }

  update(dt, t) {
    const G = this.G, E = G.enemies;
    if (!G.started || !G.startup.departed) return;
    // água voltando: o escafandrista se afoga (sem loot)
    if (E.auth) for (const e of E.list) {
      if (!e.seabedBoss || e.state === 'dead' || e.replica) continue;
      const ground = G.world.seabedHeight(e.body.pos.x, e.body.pos.z);
      if (sea.level > ground + 0.9) {
        E.killSilently(e, 'A água voltou e o escafandrista se afogou dentro do capacete.');
      }
    }
    if (!E.auth) return;
    const st = G.startup.tide.state;
    if (!st || st.phase.id !== 'seco' || st.changing || st.nextIn < 40) return;
    const cycle = st.cycle;
    if (this.cycle === cycle) return;
    this.cycle = cycle; // uma tentativa por seca
    if (G.events.current || (G.naval && G.naval.active)) return;
    const prog = this.progress();
    if (prog < BOSSES.miniMaxProgress && Math.random() < BOSSES.miniChance) this.spawn('escafandrista', cycle);
  }

  // Surge no fundo seco a uns 30 m da jangada (fora das ilhas). isl = "arena" de areia para a IA.
  spawn(type, cycle, near = null) {
    const G = this.G, boat = G.boat, base = near || boat;
    let x = 0, z = 0, gy = 0, ok = false;
    for (let k = 0; k < 16 && !ok; k++) {
      const a = Math.random() * Math.PI * 2, d = BOSSES.dist[0] + Math.random() * (BOSSES.dist[1] - BOSSES.dist[0]);
      x = base.x + Math.cos(a) * d; z = base.z + Math.sin(a) * d; gy = G.world.seabedHeight(x, z);
      ok = gy < -3.6; // longe das encostas das ilhas
    }
    if (!ok) return null;
    const isl = { id: `sb${cycle}`, x, z, R: 34, rooms: [], enemies: [], minY: gy - 6, set: { y: gy - 0.6 } };
    const e = G.enemies.spawn(`boss-${type}-${cycle}`, type, isl, x, z);
    e.seabedBoss = true;
    e.body.pos.y = gy + 0.2; e.state = 'chase'; e.timer = 0; e.yaw = Math.atan2(boat.x - x, boat.z - z);
    G.hud.msg('Um vulto de capacete de latão anda pelo fundo seco…');
    if (G.enemyNet) G.enemyNet.banner('ESCAFANDRISTA AMALDIÇOADO', 'Mate antes que a água volte — ele larga um saco de loot.', 'storm');
    return e;
  }
}
