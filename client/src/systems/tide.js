// Ciclo do mar depois da partida: só dois estados, MAR CHEIO e MAR SECO.
// A troca é uma transição rápida (o mar seca / volta a encher); não há marés intermediárias.
// Deriva só do relógio comum, então todos os jogadores veem o mesmo sem tráfego de rede.
// Durante uma batalha naval a maré é segurada no cheio (Naval.holdK).
// Na seca a água desce abaixo do fundo do mar (world/seabed.js) e dá para andar por ele.
import { clamp } from '../core/util.js';

export const TIDE = {
  period: 200,          // segundos por ciclo (cheio + seco)
  full: 0.9,            // nível com o mar cheio (o mesmo da inundação inicial)
  dry: -7.2,            // nível com o mar seco: abaixo de todo o fundo (mín. -6,4)
  dryShare: 0.4,        // fração do ciclo com o mar seco (80 s); o resto é mar cheio (120 s)
  transition: 14,       // segundos que o mar leva para secar ou encher
  blendIn: 6,           // s para entrar no ciclo depois da partida
};
export const TIDE_STATES = {
  cheio: { id: 'cheio', nome: 'Mar cheio' },
  seco: { id: 'seco', nome: 'Mar seco' },
};
const smooth = (x) => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); };

// t = segundos desde a PARTIDA (não o relógio absoluto). O ciclo começa já com o mar cheio
// (pula a transição "seco → cheio" do início), então a primeira seca só vem depois do cheio inteiro.
export function tideAt(t) {
  const P = TIDE.period, fullDur = P * (1 - TIDE.dryShare), tr = TIDE.transition;
  t = Math.max(0, t) + tr;
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
    changing: into < tr, nextIn: dur - into, cycle: Math.floor(t / P),
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
    // batalha naval: o mar fica segurado no CHEIO (a seca só acontece fora de combate)
    const hold = this.G.naval ? this.G.naval.holdK : 0;
    if (hold > 0) {
      const st = this.state, lvl = st.level + (TIDE.full - st.level) * hold;
      this.state = { ...st, level: lvl, norm: (lvl - TIDE.dry) / (TIDE.full - TIDE.dry), ...(hold > 0.5 ? { phase: TIDE_STATES.cheio, changing: false } : {}) };
    }
    const id = this.state.phase.id;
    if (this.lastPhase !== id) {
      if (this.lastPhase !== null) this.G.hud.msg(MESSAGES[id]);
      this.lastPhase = id;
    }
    const k = smooth(this.departT / TIDE.blendIn);
    return floodLevel + (this.state.level - floodLevel) * k;
  }
}
