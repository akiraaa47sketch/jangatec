// Sistema de navegação: linear durante a aventura, livre na batalha final.
// O barco segue uma rota principal com desvios controlados pelo jogador.
// Na batalha final, o controle 360° é desbloqueado.

export const NAV_MODE = { LINEAR: 'linear', FREE: 'free' };

// Pontos de rota. Cada ponto tem uma direção principal (yaw) e uma "fase" do jogo.
// A distância total é ~2200 m — uma jornada longa pelo oceano.
export const ROUTE = [
  { z: 0,    phase: 'start' },
  { z: 300,  phase: 'early' },
  { z: 600,  phase: 'mid' },
  { z: 900,  phase: 'storm' },
  { z: 1200, phase: 'archipelago' },
  { z: 1500, phase: 'deep' },
  { z: 1800, phase: 'approach' },
  { z: 2100, phase: 'boss' },   // Batalha final começa aqui
];

// yaw alvo da rota: sempre seguindo ~+Z (norte), com pequenas variações por trecho
const ROUTE_YAWS = [0, 0.05, -0.03, 0.08, -0.06, 0.04, -0.02, 0];

export class Navigation {
  constructor(G) {
    this.G = G;
    this.mode = NAV_MODE.LINEAR;
    // Desvio lateral controlado pelo jogador (-1 a +1)
    this.steerInput = 0;
    // Yaw-alvo da rota para o trecho atual
    this.routeYaw = 0;
    // Índice do trecho atual
    this.segment = 0;
    // Avança automaticamente na rota baseado na distância percorrida
  }

  get isLinear() { return this.mode === NAV_MODE.LINEAR; }
  get isFree()   { return this.mode === NAV_MODE.FREE; }

  // Chamado quando a batalha final começa
  unlockFree() {
    if (this.mode === NAV_MODE.FREE) return;
    this.mode = NAV_MODE.FREE;
    this.G.hud.msg('⚓ CONTROLE LIVRE DESBLOQUEADO — Enfrente o chefe!');
  }

  // Atualiza o segmento da rota com base na posição do barco
  updateSegment(boatZ) {
    for (let i = ROUTE.length - 1; i >= 0; i--) {
      if (boatZ >= ROUTE[i].z) {
        this.segment = i;
        this.routeYaw = ROUTE_YAWS[i] || 0;
        // Batalha final: segmento boss
        if (ROUTE[i].phase === 'boss' && this.mode !== NAV_MODE.FREE) {
          this.unlockFree();
        }
        break;
      }
    }
  }

  // Retorna o yaw-alvo para o barco neste frame, dado o input do jogador
  // maxSteer: amplitude máxima de desvio lateral (rad)
  getTargetYaw(dt, sailAngle) {
    if (this.mode === NAV_MODE.FREE) {
      // Controle total: ângulo da vela vira o barco livremente
      return null; // null = boat.js usa sua própria lógica
    }
    // Modo linear: o barco quer ir para routeYaw; sailAngle adiciona desvio pequeno
    const MAX_STEER = 0.18; // ~10°
    const target = this.routeYaw + sailAngle * MAX_STEER;
    return target;
  }

  // Fase do trecho atual
  get phase() {
    return this.segment < ROUTE.length ? ROUTE[this.segment].phase : 'boss';
  }

  // Distância total percorrida na rota (em metros, aprox.)
  progress(boatZ) {
    const total = ROUTE[ROUTE.length - 1].z;
    return Math.min(1, Math.max(0, boatZ / total));
  }
}
