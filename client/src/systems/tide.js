// Ciclo de maré depois da partida: SECA → ENCHENTE → CHEIA → VAZANTE.
// Deriva só do relógio comum, então todos os jogadores veem a mesma maré sem tráfego de rede.
// O nível alimenta sea.level (via Startup). Na seca o oceano esvazia de verdade: a água desce
// abaixo do fundo do mar (world/seabed.js) e dá para andar por ele até a água voltar.
import { clamp } from '../core/util.js';

export const TIDE = {
  period: 360,          // segundos por ciclo completo
  low: -7.2,            // nível na seca: abaixo de todo o fundo do mar (mín. -6,4) = oceano seco
  high: 2.35,           // nível na cheia (as 4 faixas externas das ilhas ficam submersas)
  // frações do ciclo: seca, enchente, cheia, vazante
  phases: [
    { id: 'seca', nome: 'Oceano seco', dur: 0.3 },
    { id: 'enchente', nome: 'Água voltando', dur: 0.2 },
    { id: 'cheia', nome: 'Maré cheia', dur: 0.28 },
    { id: 'vazante', nome: 'Água baixando', dur: 0.22 },
  ],
  blendIn: 25,          // s para sair do nível da inundação inicial e entrar no ciclo
};
const smooth = (x) => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); };

export function tideAt(t) {
  const u = (((t / TIDE.period) % 1) + 1) % 1;
  let acc = 0;
  for (let i = 0; i < TIDE.phases.length; i++) {
    const ph = TIDE.phases[i];
    if (u < acc + ph.dur || i === TIDE.phases.length - 1) {
      const p = clamp((u - acc) / ph.dur, 0, 1);
      const k = ph.id === 'seca' ? 0 : ph.id === 'cheia' ? 1 : ph.id === 'enchente' ? smooth(p) : 1 - smooth(p);
      return {
        phase: ph, index: i, progress: p,
        level: TIDE.low + (TIDE.high - TIDE.low) * k,
        norm: k, nextIn: (1 - p) * ph.dur * TIDE.period,
        next: TIDE.phases[(i + 1) % TIDE.phases.length],
      };
    }
    acc += ph.dur;
  }
  return null;
}

const MESSAGES = {
  seca: 'O OCEANO SECOU! Explore o fundo do mar: destroços e naufrágios com loot. A água vai voltar…',
  enchente: 'A água está voltando — corra de volta para a jangada!',
  cheia: 'Maré cheia: as praias estão submersas e a jangada flutua de novo.',
  vazante: 'A água está baixando… o fundo do mar vai aparecer. A jangada vai encalhar na areia.',
};

export class Tide {
  constructor(G) { this.G = G; this.state = null; this.lastPhase = null; this.departT = 0; }

  // Nível do mar depois da partida (mistura suave a partir do nível da inundação inicial).
  level(t, dt, floodLevel) {
    this.departT += dt;
    this.state = tideAt(t);
    const k = smooth(this.departT / TIDE.blendIn);
    const id = this.state.phase.id;
    if (this.lastPhase !== id) {
      if (this.lastPhase !== null) this.G.hud.msg(MESSAGES[id]);
      this.lastPhase = id;
    }
    return floodLevel + (this.state.level - floodLevel) * k;
  }
}
