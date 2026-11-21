// Vida e inventário simples (contadores por item).
import { clamp } from '../core/util.js';
import { WEAPONS } from './combat.js';

export const ITEM_NAMES = {
  madeira: 'Madeira', metal: 'Metal', pano: 'Pano', bandagem: 'Bandagem',
  kit: 'Kit médico', municao: 'Munição', cartucho: 'Cartuchos',
};
const USE = {
  bandagem: (s) => { s.vida = clamp(s.vida + 30, 0, 100); return 'Bandagem aplicada'; },
  kit:      (s) => { s.vida = 100; return 'Kit médico usado'; },
};

export class Survival {
  constructor(G) {
    this.G = G;
    this.vida = 100;
    this.inv = { madeira: 0, metal: 0, pano: 0, bandagem: 0, kit: 0, municao: 0, cartucho: 0 };
    this.deadTimer = 0;
  }
  add(loot) {
    const parts = [];
    for (const k in loot) {
      if (k.startsWith('arma_')) {
        const id = k.slice(5);
        const result = this.G.combat.unlockWeapon(id);
        if (result === true) {
          const weapon = WEAPONS.find((entry) => entry.id === id);
          parts.push(weapon ? `${weapon.nome} ${'★'.repeat(weapon.stars)} adquirido` : 'Arma adquirida');
        } else if (result === 'repaired') {
          const weapon = WEAPONS.find((entry) => entry.id === id);
          parts.push(`${weapon ? weapon.nome : id} reparado`);
        }
        continue;
      }
      this.inv[k] = (this.inv[k] || 0) + loot[k];
      parts.push(`+${loot[k]} ${ITEM_NAMES[k] || k}`);
    }
    return parts.join('  ');
  }
  use(item) {
    if (!USE[item] || !this.inv[item] || this.G.player.dead) return;
    this.inv[item]--;
    if (this.G.viewmodel) this.G.viewmodel.onUse(item);
    this.G.hud.msg(USE[item](this));
    this.G.hud.flash('heal');
  }
  damage(n, source) {
    if (this.G.player.dead) return;
    this.vida -= n;
    if (this.G.viewmodel) this.G.viewmodel.onHurt(n);
    this.G.hud.flash('hurt');
    if (this.vida <= 0) {
      this.vida = 0; this.G.player.dead = true; this.deadTimer = 4;
      this.G.hud.msg(`Você caiu (${source}). Voltando ao barco...`);
    }
  }
  update(dt) {
    if (this.G.player.dead) {
      this.deadTimer -= dt;
      if (this.deadTimer <= 0) { this.vida = 60; this.G.player.respawn(); }
      return;
    }
  }
}
