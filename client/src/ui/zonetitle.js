// Nome da zona: quando o jogador entra numa zona nova (Zona Pirata, Zona Militar, Zona 51 — ver
// systems/zones.js), o nome aparece no meio da tela, na fonte do logo do Jangatec, com fade in →
// pausa → fade out. Não existe indicador fixo de zona. Também aparece ao acordar na cutscene.
import { zoneOf, ZONES } from '../systems/zones.js';

const HOLD = 0.7; // s que o jogador precisa ficar na zona nova antes do nome aparecer (evita pisca-pisca na divisa)

export class ZoneTitle {
  constructor(G) {
    this.G = G;
    this.current = null; this.pending = null; this.pendingT = 0;
    const el = document.createElement('div');
    el.id = 'zoneTitle';
    el.innerHTML = '<span class="zt-line"></span><b class="zt-name"></b><small class="zt-sub"></small>';
    document.body.appendChild(el);
    this.el = el; this.nameEl = el.querySelector('.zt-name'); this.subEl = el.querySelector('.zt-sub');
  }

  // zona em que o jogador está agora: { id, name, sub }. A ilha inicial fica na Zona Pirata.
  zoneAt() {
    const G = this.G, p = G.player.body.pos;
    const z = G.world && G.world.difficulty ? zoneOf(G.world.difficulty(p.x, p.z)) : ZONES.pirata;
    return { id: z.id, name: z.nome, sub: z.nivel ? `dificuldade ${z.nivel.toLowerCase()}` : '' };
  }

  show(name, sub = '') {
    this.nameEl.textContent = name;
    this.subEl.textContent = sub;
    this.el.classList.remove('on'); void this.el.offsetWidth; // reinicia a animação
    this.el.classList.add('on');
  }

  // marca a zona atual como "já vista" (sem mostrar), ex.: logo depois da cutscene
  sync() { this.current = this.zoneAt().id; this.pending = null; }

  update(dt) {
    const G = this.G;
    if (!G.started || G.cutscene) return;
    const z = this.zoneAt();
    if (z.id === this.current) { this.pending = null; return; }
    if (!this.pending || this.pending.id !== z.id) { this.pending = z; this.pendingT = 0; }
    this.pendingT += dt;
    if (this.pendingT >= HOLD) {
      this.current = z.id; this.pending = null;
      this.show(z.name, z.sub);
    }
  }
}
