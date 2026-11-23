// Chefes da SECA (quando o mar seca e dá para andar no fundo):
//   • Escafandrista amaldiçoado (miniboss do começo): um mergulhador antigo de capacete de latão que
//     anda pelo fundo seco guardando os naufrágios. Bate forte e devagar. Se a água voltar ele se
//     AFOGA (sem loot); se você matar, larga um saco com loot.
//   • Caranguejo-Rei (chefe, a partir de ~40% da run): carapaça blindada — o golpe só entra direito
//     depois que ele ataca (recuperando), quando está atordoado (parry/chute) ou nas lâminas cruzadas.
//     Quando a água volta ele se enterra e some. Derrotado, larga um saco com loot raro.
// Só o host sorteia e simula (os outros recebem réplicas como qualquer inimigo).
import { sea } from '../world/ocean.js';
import { TIDE } from './tide.js';
import { ENEMY_TYPES } from './enemies.js';

export const BOSSES = {
  runLength: 1280,      // m até a dificuldade máxima (world.difficulty chega a 4)
  crabFrom: 0.4,        // fração da run a partir da qual o Caranguejo-Rei pode aparecer
  crabChance: 0.65,     // por seca (depois de 40%)
  miniChance: 0.8,      // por seca (antes do caranguejo, ou quando ele não vier)
  miniMaxProgress: 0.7, // depois disso o escafandrista não aparece mais
  dist: [26, 40],       // m da jangada até onde o chefe surge
};

export class Bosses {
  constructor(G) { this.G = G; this.cycle = null; }

  progress() { const b = this.G.boat; return Math.min(1, Math.hypot(b.x, b.z) / BOSSES.runLength); }

  update(dt, t) {
    const G = this.G, E = G.enemies;
    if (!G.started || !G.startup.departed) return;
    // água voltando: quem é do fundo seco se afoga (escafandrista) ou se enterra (caranguejo)
    if (E.auth) for (const e of E.list) {
      if (!e.seabedBoss || e.state === 'dead' || e.replica) continue;
      const ground = G.world.seabedHeight(e.body.pos.x, e.body.pos.z);
      if (sea.level > ground + 0.9) {
        if (e.def.boss === 'crab') { E.killSilently(e, 'O Caranguejo-Rei se enterrou na areia quando a água voltou…'); e.burrow = true; }
        else E.killSilently(e, 'A água voltou e o escafandrista se afogou dentro do capacete.');
      }
    }
    if (!E.auth) return;
    const st = G.startup.tide.state;
    if (!st || st.phase.id !== 'seco' || st.changing || st.nextIn < 40) return;
    const cycle = Math.floor(t / TIDE.period);
    if (this.cycle === cycle) return;
    this.cycle = cycle; // uma tentativa por seca
    if (G.events.current || (G.naval && G.naval.active)) return;
    const prog = this.progress();
    if (prog >= BOSSES.crabFrom && Math.random() < BOSSES.crabChance) this.spawn('caranguejo', cycle);
    else if (prog < BOSSES.miniMaxProgress && Math.random() < BOSSES.miniChance) this.spawn('escafandrista', cycle);
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
    e.seabedBoss = true; e.max = ENEMY_TYPES[type].hp;
    e.body.pos.y = gy + 0.2; e.state = 'chase'; e.timer = 0; e.yaw = Math.atan2(boat.x - x, boat.z - z);
    const crab = type === 'caranguejo';
    G.hud.msg(crab ? 'A areia está tremendo… o CARANGUEJO-REI saiu da toca!' : 'Um vulto de capacete de latão anda pelo fundo seco…');
    if (G.enemyNet) G.enemyNet.banner(crab ? 'CARANGUEJO-REI' : 'ESCAFANDRISTA AMALDIÇOADO',
      crab ? 'O casco segura quase tudo: bata depois que ele atacar, ou atordoe com parry e chute. A água volta e ele foge!' : 'Mate antes que a água volte — ele larga um saco de loot.', crab ? 'pirate' : 'storm');
    return e;
  }
}
