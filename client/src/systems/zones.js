// ZONAS do mar (pela dificuldade = distância percorrida, world.difficulty 0–4):
//   • ZONA PIRATA  (fácil,   dif. 0–1, até ~1,7 km): ilhas tropicais com cabanas, tendas e fortes de
//     tronco; piratas, duelistas, pistoleiros e bombardeiros.
//   • ZONA MILITAR (médio,   dif. 2, ~1,7–2,55 km): ilhas secas com vigias, bunkers e base militar;
//     soldados, escopeteiros, atiradores de elite e brutamontes.
//   • ZONA 51      (difícil, dif. 3–4, ~2,55 km+): ilhas cinzentas sem palmeiras com laboratórios
//     secretos (OVNI caído, tanques de contenção); agentes, cientistas, mutantes e ciborgues. É onde a
//     plataforma Leviatã (SOS) aparece.
// O HUD mostra a zona atual e um aviso grande ao entrar numa nova; o céu/neblina ganha um tom próprio.
import * as THREE from '../three.js';

export const ZONES = {
  pirata: { id: 'pirata', nome: 'Zona Pirata', nivel: 'Fácil', cor: '#e0ac4c', fog: null, tint: 0,
    grass: 0x6f9d4c, sand: 1, palms: 1, bushes: 1, tufts: 1,
    sites: [['hut', 1], ['tendas', 1], ['fort', 1.2]],
    enemies: ['pirata', 'pirata', 'duelista', 'pistoleiro', 'bombardeiro'], high: ['pistoleiro'] },
  militar: { id: 'militar', nome: 'Zona Militar', nivel: 'Médio', cor: '#9fb46a', fog: 0x8a9478, tint: 0.18,
    grass: 0x8a8f55, sand: 0.9, palms: 0.5, bushes: 0.5, tufts: 0.45,
    sites: [['vigia', 1], ['bunker', 1.3], ['militar', 0.7]],
    enemies: null, high: null }, // soldados (SOLDIERS em enemies.js)
  z51: { id: 'z51', nome: 'Zona 51', nivel: 'Difícil', cor: '#7dff8a', fog: 0x6f8f7a, tint: 0.32,
    grass: 0x46483f, sand: 0.62, palms: 0, bushes: 0, tufts: 0,
    sites: [['lab', 2.2], ['militar', 0.6], ['bunker', 0.5]],
    enemies: ['agente', 'agente', 'cientista', 'mutante', 'ciborgue'], high: ['agente'] },
};
export function zoneOf(diff) { return diff <= 1 ? ZONES.pirata : diff === 2 ? ZONES.militar : ZONES.z51; }

export class Zones {
  constructor(G) {
    this.G = G; this.cur = null; this.tintK = 0; this.fogCol = new THREE.Color();
    const el = document.createElement('div'); el.id = 'zoneTag'; el.hidden = true;
    document.getElementById('hud').appendChild(el); this.el = el;
  }
  get zone() { return this.cur || ZONES.pirata; }
  update(dt) {
    const G = this.G;
    if (!G.started || !G.startup.departed) { this.el.hidden = true; return; }
    const z = zoneOf(G.world.difficulty(G.boat.x, G.boat.z));
    if (z !== this.cur) {
      const first = !this.cur; this.cur = z;
      this.el.innerHTML = `<b style="color:${z.cor}">${z.nome}</b><span>${z.nivel}</span>`;
      if (!first || z !== ZONES.pirata) {
        if (G.hud.banner) G.hud.banner(z.nome.toUpperCase(), z.id === 'pirata' ? 'Mar dos piratas — ilhas tropicais. Dificuldade: fácil.'
          : z.id === 'militar' ? 'Território militar — bunkers, vigias e soldados. Dificuldade: média.'
            : 'Área restrita — laboratórios secretos, agentes e criaturas estranhas. Dificuldade: difícil.', z.id === 'z51' ? 'storm' : 'pirate', 7);
      }
    }
    this.el.hidden = false;
    // tom do céu/neblina da zona (sobe aos poucos ao entrar)
    const want = z.fog ? z.tint : 0;
    this.tintK += (want - this.tintK) * Math.min(1, dt * 0.25);
    if (z.fog) this.fogCol.setHex(z.fog);
    if (this.tintK > 0.005 && G.scene.fog) {
      G.scene.fog.color.lerp(this.fogCol, this.tintK);
      if (G.scene.background && G.scene.background.isColor) G.scene.background.lerp(this.fogCol, this.tintK * 0.6);
    }
  }
}
