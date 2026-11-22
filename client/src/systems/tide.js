// Ciclo do mar depois da partida: só dois estados, MAR CHEIO e MAR SECO.
// A troca é uma transição rápida (o mar seca / volta a encher); não há marés intermediárias.
// Deriva só do relógio comum, então todos os jogadores veem o mesmo sem tráfego de rede.
// Na seca a água desce abaixo do fundo do mar (world/seabed.js) e dá para andar por ele.
import { clamp } from '../core/util.js';

export const TIDE = {
  period: 360,          // segundos por ciclo (cheio + seco)
  full: 0.9,            // nível com o mar cheio (o mesmo da inundação inicial)
  dry: -7.2,            // nível com o mar seco: abaixo de todo o fundo (mín. -6,4)
  dryShare: 0.4,        // fração do ciclo com o mar seco (≈ 2 min 24 s); o resto é mar cheio
  transition: 16,       // segundos que o mar leva para secar ou encher
  blendIn: 20,          // s para entrar no ciclo depois da partida
};
export const TIDE_STATES = {
  cheio: { id: 'cheio', nome: 'Mar cheio' },
  seco: { id: 'seco', nome: 'Mar seco' },
};
const smooth = (x) => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); };

export function tideAt(t) {
  const P = TIDE.period, fullDur = P * (1 - TIDE.dryShare), tr = TIDE.transition;
  const s = ((t % P) + P) % P;
  const dry = s >= fullDur;
  const into = dry ? s - fullDur : s;                    // segundos dentro do estado atual
  const dur = dry ? P - fullDur : fullDur;
  // o começo de cada estado é a transição vinda do outro
  const k = smooth(into / tr);
  const level = dry ? TIDE.full + (TIDE.dry - TIDE.full) * k : TIDE.dry + (TIDE.full - TIDE.dry) * k;
  const phase = dry ? TIDE_STATES.seco : TIDE_STATES.cheio;
  return {
    phase, next: dry ? TIDE_STATES.cheio : TIDE_STATES.seco,
    level, norm: (level - TIDE.dry) / (TIDE.full - TIDE.dry),
    changing: into < tr, nextIn: dur - into,
  };
}

const MESSAGES = {
  seco: 'A água está baixando…',
  cheio: 'O mar está voltando — volte para a jangada!',
};

export class Tide {
  constructor(G) { this.G = G; this.state = null; this.lastPhase = null; this.departT = 0; }

  level(t, dt, floodLevel) {
    this.departT += dt;
    this.state = tideAt(t);
    const id = this.state.phase.id;
    if (this.lastPhase !== id) {
      if (this.lastPhase !== null) this.G.hud.msg(MESSAGES[id]);
      this.lastPhase = id;
    }
    const k = smooth(this.departT / TIDE.blendIn);
    return floodLevel + (this.state.level - floodLevel) * k;
  }
}
