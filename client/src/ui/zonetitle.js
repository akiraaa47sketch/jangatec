// Nome da zona: quando o jogador entra numa zona nova, o nome aparece no meio da tela, na fonte do
// logo do Jangatec, com fade in → pausa → fade out. Não existe indicador fixo de zona.
// Zonas: cada ilha/estrutura (pelo tipo de acampamento), a plataforma do SOS, o leito seco do mar
// na maré baixa e o mar aberto, que muda de nome conforme a distância da origem (dificuldade).
import { WORLD_LOOT_PARAMS } from '../systems/loot.js';

const SITE_NAMES = {
  starter: ['Ilha do Naufrágio', 'onde o voo 47 caiu'],
  hut: ['Ilha da Cabana', 'sobreviventes'],
  tendas: ['Acampamento das Tendas', 'sobreviventes'],
  fort: ['Forte de Troncos', 'território hostil'],
  vigia: ['Ilha da Vigia', 'território hostil'],
  bunker: ['Bunker Abandonado', 'soldados'],
  militar: ['Complexo Militar', 'soldados'],
  scrap: ['Forte de Sucata', 'sucateiros'],
  predio: ['Prédio Afundado', 'ruínas'],
  seatower: ['Torre de Sucata', 'sucateiros'],
};
const SEA_NAMES = ['Águas Rasas', 'Mar Aberto', 'Mar das Correntes', 'Águas Profundas', 'Abismo do Norte'];

const HOLD = 0.7; // s que o jogador precisa ficar na zona nova antes do nome aparecer (evita pisca-pisca na borda)

export class ZoneTitle {
  constructor(G) {
    this.G = G;
    this.current = null; this.pending = null; this.pendingT = 0; this.enabled = true;
    const el = document.createElement('div');
    el.id = 'zoneTitle';
    el.innerHTML = '<span class="zt-line"></span><b class="zt-name"></b><small class="zt-sub"></small>';
    document.body.appendChild(el);
    this.el = el; this.nameEl = el.querySelector('.zt-name'); this.subEl = el.querySelector('.zt-sub');
  }

  // zona em que o jogador está agora: { id, name, sub }
  zoneAt() {
    const G = this.G, p = G.player.body.pos;
    const rig = G.sos && G.sos.rig && G.sos.rig.isl;
    if (rig && Math.hypot(p.x - rig.x, p.z - rig.z) < (rig.R || 30) + 4) return { id: 'sos', name: 'Plataforma de Petróleo', sub: 'pedido de socorro' };
    for (const isl of G.world.islands) {
      const cx = isl.cx ?? isl.x, cz = isl.cz ?? isl.z;
      if (Math.hypot(p.x - cx, p.z - cz) > isl.R + 3) continue;
      const key = isl.starter ? 'starter' : isl.siteType;
      const [name, sub] = SITE_NAMES[key] || ['Ilha Desconhecida', ''];
      return { id: 'isl:' + isl.id, name, sub };
    }
    const seaDry = G.startup && G.startup.departed && G.startup.waterLevel < -2 && !G.player.aboard && !G.player.swimming;
    if (seaDry) return { id: 'seco', name: 'Leito Seco', sub: 'o mar recuou' };
    const d = Math.min(SEA_NAMES.length - 1, Math.floor(Math.hypot(p.x, p.z) / WORLD_LOOT_PARAMS.diffStep));
    return { id: 'mar:' + d, name: SEA_NAMES[d], sub: 'mar' };
  }

  show(name, sub = '') {
    this.nameEl.textContent = name;
    this.subEl.textContent = sub;
    this.el.classList.remove('on'); void this.el.offsetWidth; // reinicia a animação
    this.el.classList.add('on');
  }

  // marca a zona atual como "já vista" (sem mostrar), ex.: logo depois da cutscene
  sync() { const z = this.zoneAt(); this.current = z.id; this.pending = null; }

  update(dt) {
    const G = this.G;
    if (!G.started || !this.enabled || G.cutscene) return;
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
