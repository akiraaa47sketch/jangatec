// Vida e inventário simples (contadores por item).
import { clamp } from '../core/util.js';
import { WEAPONS, parseWeaponKey, rollRarity, MAX_RAR } from './combat.js';
import { sfx } from '../core/sfx.js';

export const ITEM_NAMES = {
  metal: 'Metal', peixe: 'Peixe', bandagem: 'Bandagem', barra_proteina: 'Barra de proteína', energetico: 'Energético', chocolate: 'Chocolate',
  kit: 'Kit médico', municao: 'Munição', cartucho: 'Cartuchos', colete: 'Colete balístico',
  canhao: 'Canhão improvisado', canhao_ferro: 'Canhão de ferro', gancho: 'Torreta-arpão', bala_canhao: 'Balas de canhão',
};
// Comidas: buffs temporários (4 min). Comer de novo renova o tempo.
export const BUFFS = {
  forca:   { nome: 'Força', icon: '💪', food: 'barra_proteina', dur: 240, desc: '+25% de dano' },
  energia: { nome: 'Energia', icon: '⚡', food: 'energetico', dur: 240, desc: 'gasta metade da estamina' },
  regen:   { nome: 'Regeneração', icon: '🍫', food: 'chocolate', dur: 240, desc: 'recupera vida aos poucos' },
  // efeito ruim (habilidade do escafandrista): lento e queimando
  agua_viva: { nome: 'Queimadura de água-viva', icon: '🪼', dur: 4, desc: 'lento e perdendo 4 de vida por segundo', debuff: true },
};
const eat = (s, buff, msg) => { s.buffs[buff] = BUFFS[buff].dur; sfx.pickup(); return msg; };
const USE = {
  bandagem: (s) => { s.vida = clamp(s.vida + 30, 0, 100); return 'Bandagem aplicada'; },
  kit:      (s) => { s.vida = 100; return 'Kit médico usado'; },
  barra_proteina: (s) => eat(s, 'forca', 'Barra de proteína: +25% de dano por 4 min'),
  energetico: (s) => eat(s, 'energia', 'Energético: estamina gasta pela metade por 4 min'),
  chocolate: (s) => eat(s, 'regen', 'Chocolate: vida regenerando por 4 min'),
  peixe: (s) => { s.vida = clamp(s.vida + 20, 0, 100); sfx.pickup(); return 'Peixe: +20 de vida'; },
};
const FOODS = ['barra_proteina', 'energetico', 'chocolate'];
// COLETE BALÍSTICO (Zona Militar, um por ilha): vestido, corta METADE do dano de TIROS (só projéteis —
// explosões, canhão, golpes e mordidas passam normal). Não tem durabilidade: vestiu, fica.
export const ARMOR = { absorb: 0.5, max: 100 };

export class Survival {
  static BLEED = 45; // segundos caído até morrer sem ajuda
  constructor(G) {
    this.G = G;
    this.vida = 100;
    this.inv = { colete: 0, metal: 0, bandagem: 0, kit: 0, municao: 0, cartucho: 0, canhao: 0, canhao_ferro: 0, gancho: 0, bala_canhao: 0, barra_proteina: 0, energetico: 0, chocolate: 0, peixe: 0 };
    this.buffs = {}; // nome → segundos restantes
    this.armor = 0;  // colete vestido: 0 = sem colete … ARMOR.max = novo
    this.deadTimer = 0;
  }
  add(loot) {
    const parts = [];
    if (Object.keys(loot).length) sfx.pickup();
    if (loot.arma_gancho) { loot = { ...loot, gancho: (loot.gancho || 0) + loot.arma_gancho }; delete loot.arma_gancho; } // o gancho virou torreta
    for (const k in loot) {
      if (k === 'madeira' || k === 'pano') continue; // não existem mais (saves/caixotes antigos)
      if (k.startsWith('arma_')) {
        const pk = parseWeaponKey(k), id = pk.id, c = this.G.combat;
        const wd = WEAPONS.find((entry) => entry.id === id);
        // sem estrelas na chave (recompensas, inimigos): sorteia pela zona; minigun é sempre 4★
        const rar = wd && wd.noReload ? MAX_RAR : pk.rar || rollRarity(this.G.world.difficulty(this.G.player.body.pos.x, this.G.player.body.pos.z));
        const result = c.unlockWeapon(id, rar);
        if (wd && wd.noReload) { // minigun: a quantidade é o número de balas que ainda tem
          const n = Math.max(1, Math.min(wd.mag, Math.floor(loot[k]) || wd.mag));
          c.mags[id] = result === 'owned' ? Math.min(wd.mag, (c.mags[id] || 0) + n) : n;
          parts.push(`${wd.nome} (${c.mags[id]} balas)`);
          continue;
        }
        if (result === true) parts.push(wd ? `${wd.nome} ${'★'.repeat(rar)} adquirido` : 'Arma adquirida');
        else if (result === 'upgrade') parts.push(`${wd.nome} melhorou para ${'★'.repeat(rar)}!`);
        else if (wd && !wd.noReload) parts.push(`${wd.nome} ${'★'.repeat(rar)} (você já tem uma ${'★'.repeat(c.rarOf(id))})`);
        continue;
      }
      if (k === 'gancho' || k === 'canhao' || k === 'canhao_ferro') { // torreta e canhões não vão para a mochila: aparecem na sua frente para carregar e soldar
        const pl = this.G.player, [fx, fz] = pl.forward(), p = pl.body.pos, prop = k === 'gancho' ? 'torreta' : k;
        for (let i = 0; i < loot[k]; i++) this.G.world.spawnProp(prop, p.x + fx * (1.8 + i * 1.4), p.y + 0.8, p.z + fz * (1.8 + i * 1.4));
        parts.push(`${ITEM_NAMES[k]} (carregue e solde na jangada)`);
        continue;
      }
      this.inv[k] = (this.inv[k] || 0) + loot[k];
      parts.push(`+${loot[k]} ${ITEM_NAMES[k] || k}`);
    }
    if (loot.colete && this.armor <= 0) this.wearVest(); // achou colete sem estar vestido: veste na hora
    return parts.join('  ');
  }
  // Tira itens da mochila (para largar). Retorna quantos saíram.
  take(item, n) {
    const have = this.inv[item] || 0, k = Math.min(have, Math.max(0, Math.floor(n)));
    if (k) this.inv[item] = have - k;
    return k;
  }
  // veste um colete da mochila (troca o gasto por um novo)
  wearVest() {
    if (!this.inv.colete || this.G.player.dead) return false;
    if (this.armor > 0) { this.G.hud.msg('Você já está de colete'); return false; }
    this.inv.colete--; this.armor = ARMOR.max; sfx.pickup();
    this.G.hud.msg('Colete balístico vestido: tiros tiram metade do dano');
    if (this.G.player.setVest) this.G.player.setVest(true);
    return true;
  }
  use(item) {
    if (item === 'colete') { this.wearVest(); return; }
    if (!USE[item] || !this.inv[item] || this.G.player.dead) return;
    if (this.G.player.downed) { this.G.hud.msg('Caído você não consegue se curar — espere um aliado'); return; }
    this.inv[item]--;
    if (this.G.viewmodel) this.G.viewmodel.onUse(item);
    if (!FOODS.includes(item)) this.G.player.onUse(item);
    this.G.hud.msg(USE[item](this));
    this.G.hud.flash('heal');
  }
  damage(n, source, kind = null) {
    if (this.G.player.dead) return;
    if (kind === 'bala' && this.armor > 0 && n > 0) { // colete segura parte do tiro
      n -= n * ARMOR.absorb;
      if (this.G.melee && Math.random() < 0.35) this.G.melee.say(this.G.player.body.pos, 'COLETE', '#c8d2a0');
    }
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
    if (this.buffs.agua_viva > 0 && !pl.dead && !pl.downed) { // 4 de vida por segundo (em pulsos de 0,5 s)
      this.stingAcc = (this.stingAcc || 0) + dt;
      if (this.stingAcc >= 0.5) { this.stingAcc -= 0.5; this.damage(2, 'Água-viva'); }
    } else this.stingAcc = 0;
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
