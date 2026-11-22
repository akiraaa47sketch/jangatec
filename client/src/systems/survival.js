// Vida e inventário simples (contadores por item).
import { clamp } from '../core/util.js';
import { WEAPONS } from './combat.js';

export const ITEM_NAMES = {
  madeira: 'Madeira', metal: 'Metal', pano: 'Pano', bandagem: 'Bandagem',
  kit: 'Kit médico', municao: 'Munição', cartucho: 'Cartuchos',
  canhao: 'Canhão improvisado', bala_canhao: 'Balas de canhão',
};
const USE = {
  bandagem: (s) => { s.vida = clamp(s.vida + 30, 0, 100); return 'Bandagem aplicada'; },
  kit:      (s) => { s.vida = 100; return 'Kit médico usado'; },
};

export class Survival {
  static BLEED = 45; // segundos caído até morrer sem ajuda
  constructor(G) {
    this.G = G;
    this.vida = 100;
    this.inv = { madeira: 0, metal: 0, pano: 0, bandagem: 0, kit: 0, municao: 0, cartucho: 0, canhao: 0, bala_canhao: 0 };
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
    if (this.G.player.downed) { this.G.hud.msg('Caído você não consegue se curar — espere um aliado'); return; }
    this.inv[item]--;
    if (this.G.viewmodel) this.G.viewmodel.onUse(item);
    this.G.hud.msg(USE[item](this));
    this.G.hud.flash('heal');
  }
  damage(n, source) {
    if (this.G.player.dead) return;
    if (this.G.player.downed) { this.bleed -= n * 0.15; return; } // apanhar caído encurta o tempo
    this.vida -= n;
    if (this.G.viewmodel) this.G.viewmodel.onHurt(n);
    this.G.hud.flash('hurt');
    if (this.vida <= 0) {
      this.vida = 0;
      const net = this.G.net;
      if (net.online && net.remotes.size > 0) {
        // multiplayer: fica CAÍDO, se arrastando, até um aliado reanimar (ou sangrar até o fim)
        this.G.player.downed = true; this.bleed = Survival.BLEED;
        this.G.hud.msg(`Você caiu (${source})! Um aliado pode te reanimar: segure E perto de você.`);
        return;
      }
      this.G.player.dead = true; this.deadTimer = 4;
      this.G.hud.msg(`Você caiu (${source}). Voltando ao barco...`);
    }
  }
  revive(by) {
    const pl = this.G.player;
    if (!pl.downed) return;
    pl.downed = false; this.vida = 35;
    this.G.hud.msg(`${by || 'Um aliado'} te reanimou!`);
    this.G.hud.flash('heal');
  }
  update(dt) {
    const pl = this.G.player;
    if (pl.downed) {
      this.bleed -= dt;
      // ninguém sobrou de pé para ajudar (ou o tempo acabou): morre e volta ao barco
      if (this.bleed <= 0 || !this.G.net.online || this.G.net.remotes.size === 0) {
        pl.downed = false; pl.dead = true; this.deadTimer = 4;
        this.G.hud.msg('Você não resistiu. Voltando ao barco...');
      }
      return;
    }
    if (this.G.player.dead) {
      this.deadTimer -= dt;
      if (this.deadTimer <= 0) { this.vida = 60; this.G.player.respawn(); }
      return;
    }
  }
}
