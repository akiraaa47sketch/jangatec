// Vida e inventário simples (contadores por item).
import { clamp } from '../core/util.js';
import { WEAPONS } from './combat.js';
import { sfx } from '../core/sfx.js';

export const ITEM_NAMES = {
  metal: 'Metal', bandagem: 'Bandagem', barra_proteina: 'Barra de proteína', energetico: 'Energético', chocolate: 'Chocolate',
  kit: 'Kit médico', municao: 'Munição', cartucho: 'Cartuchos',
  canhao: 'Canhão improvisado', gancho: 'Torreta-gancho', bala_canhao: 'Balas de canhão',
};
// Comidas: buffs temporários (4 min). Comer de novo renova o tempo.
export const BUFFS = {
  forca:   { nome: 'Força', icon: '💪', food: 'barra_proteina', dur: 240, desc: '+25% de dano' },
  energia: { nome: 'Energia', icon: '⚡', food: 'energetico', dur: 240, desc: 'gasta metade da estamina' },
  regen:   { nome: 'Regeneração', icon: '🍫', food: 'chocolate', dur: 240, desc: 'recupera vida aos poucos' },
};
const eat = (s, buff, msg) => { s.buffs[buff] = BUFFS[buff].dur; sfx.pickup(); return msg; };
const USE = {
  bandagem: (s) => { s.vida = clamp(s.vida + 30, 0, 100); return 'Bandagem aplicada'; },
  kit:      (s) => { s.vida = 100; return 'Kit médico usado'; },
  barra_proteina: (s) => eat(s, 'forca', 'Barra de proteína: +25% de dano por 4 min'),
  energetico: (s) => eat(s, 'energia', 'Energético: estamina gasta pela metade por 4 min'),
  chocolate: (s) => eat(s, 'regen', 'Chocolate: vida regenerando por 4 min'),
};
const FOODS = ['barra_proteina', 'energetico', 'chocolate'];

export class Survival {
  static BLEED = 45; // segundos caído até morrer sem ajuda
  constructor(G) {
    this.G = G;
    this.vida = 100;
    this.inv = { metal: 0, bandagem: 0, kit: 0, municao: 0, cartucho: 0, canhao: 0, gancho: 0, bala_canhao: 0, barra_proteina: 0, energetico: 0, chocolate: 0 };
    this.buffs = {}; // nome → segundos restantes
    this.deadTimer = 0;
  }
  add(loot) {
    const parts = [];
    if (Object.keys(loot).length) sfx.pickup();
    if (loot.arma_gancho) { loot = { ...loot, gancho: (loot.gancho || 0) + loot.arma_gancho }; delete loot.arma_gancho; } // o gancho virou torreta
    for (const k in loot) {
      if (k === 'madeira' || k === 'pano') continue; // não existem mais (saves/caixotes antigos)
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
    if (!FOODS.includes(item)) this.G.player.onUse(item);
    this.G.hud.msg(USE[item](this));
    this.G.hud.flash('heal');
  }
  damage(n, source) {
    if (this.G.player.dead) return;
    if (this.G.player.downed) { this.bleed -= n * 0.15; return; } // apanhar caído encurta o tempo
    this.vida -= n;
    if (n >= 3) sfx.hurt();
    if (this.G.viewmodel) this.G.viewmodel.onHurt(n);
    this.G.player.onHurt(n);
    if (this.G.events) this.G.events.shake = Math.max(this.G.events.shake, Math.min(0.55, n / 50)); // tranco ao levar dano
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
  // multiplicadores dos buffs (usados no combate)
  get dmgMul() { return this.buffs.forca > 0 ? 1.25 : 1; }
  get staminaMul() { return this.buffs.energia > 0 ? 0.5 : 1; }
  update(dt) {
    const pl = this.G.player;
    for (const k in this.buffs) { this.buffs[k] -= dt; if (this.buffs[k] <= 0) { delete this.buffs[k]; this.G.hud.msg(`${BUFFS[k].nome} acabou`); } }
    if (this.buffs.regen > 0 && !pl.dead && !pl.downed && this.vida < 100) this.vida = Math.min(100, this.vida + 0.4 * dt); // ~96 de vida em 4 min
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
