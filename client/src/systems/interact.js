// Interação com [E]: caixas de loot, mastro e reanimar aliados caídos; [X]: peças soldadas.
import { keyOf } from '../core/keybinds.js';
import { sfx } from '../core/sfx.js';
import { lootLabel } from './drops.js';
const REVIVE_TIME = 2.5;
export class Interact {
  constructor(G) {
    this.G = G;
    this.current = null;
    this.openCrateId = null;
    this._lootOpen = false;
  }
  // "tela aberta": baú aberto OU inventário aberto (todo o resto do jogo pausa a entrada com isso)
  get lootOpen() { return this._lootOpen || !!(this.G.inventory && this.G.inventory.open); }
  set lootOpen(v) { this._lootOpen = v; }

  find() {
    const G = this.G, p = G.player.body.pos;
    if (G.build.active) return null;
    let best = null, bd = Infinity;
    const consider = (d, o) => { if (d < bd) { bd = d; best = o; } };
    const naval = G.naval;
    if (naval && naval.manning) return { cannon: true, label: naval.manKind === 'gancho' ? 'Sair da torreta · clique dispara/recolhe o gancho · mouse mira' : 'Sair do canhão · clique dispara · mouse mira', run: () => naval.leave() };

    // Aliado caído por perto: segurar E reanima
    for (const [id, r] of G.net.remotes) {
      if (!r.s || !r.s.dn) continue;
      const wp = r.mesh.getWorldPosition(this._v || (this._v = p.clone()));
      const d = Math.hypot(wp.x - p.x, wp.z - p.z);
      if (d < 2.4 && Math.abs(wp.y - p.y) < 2) consider(d - 1, { revive: id, name: r.s.n || 'aliado', label: `Reanimar ${r.s.n || 'aliado'} (segure)` });
    }

    // Canhões e arpões jogados no fundo do mar (só na seca)
    for (const f of G.world.finds || []) {
      if (f.submerged) continue;
      const dist = Math.hypot(f.x - p.x, f.z - p.z);
      if (dist < 2.4 && Math.abs(p.y - f.y) < 2) consider(dist - 0.2, { label: f.kind === 'gancho' ? 'Pegar torreta-arpão' : f.kind === 'canhao_ferro' ? 'Pegar canhão de ferro' : 'Pegar canhão', run: () => G.world.takeFind(f) });
    }
    // Caixas de loot
    for (const c of G.world.crates) {
      if (c.submerged) continue; // baú do banco de areia debaixo d'água
      const dist = Math.hypot(c.x - p.x, c.z - p.z);
      if (dist < 2.4 && Math.abs(p.y - c.y) < 2) {
        consider(dist, { label: c.opened ? 'Ver caixa' : 'Abrir caixa', run: () => this.openCrate(c) });
      }
    }

    // O mastro é um ponto fixo de instalação durante o início e de controle após a partida.
    if (G.startup.phase === 'install' && G.boat.isComplete) {
      const [mx, mz] = G.boat.mastWorld(), dist = Math.hypot(mx - p.x, mz - p.z);
      if (dist < 3.2) consider(dist + 0.5, {
        mast: true, installSail: true, label: 'Instalar vela no mastro', run: () => G.startup.requestSailInstall(),
      });
    } else if (G.startup.departed && G.player.aboard) {
      const [mx, mz] = G.boat.mastWorld(), dist = Math.hypot(mx - p.x, mz - p.z);
      if (dist < 2.6) consider(dist + 0.5, { mast: true, label: (G.boat.sailUp ? 'Baixar vela' : 'Levantar vela') + `   [${keyOf('sailLeft')}] [${keyOf('sailRight')}] girar vela`, run: () => G.boat.setSail(!G.boat.sailUp, G.boat.sailAngle) });
    }

    // Canhões: usar, instalar (com o item no inventário) e consertar peças danificadas
    if (naval && G.player.aboard) {
      const boat = G.boat, [plx, plz] = boat.toLocal(p.x, p.z);
      for (const c of naval.turrets) {
        const d = Math.hypot(c.x - plx, c.z - plz);
        if (d < 1.9) consider(d + 0.2, { label: c.type === 'gancho' ? 'Usar torreta-arpão' : c.type === 'canhao_ferro' ? 'Usar canhão de ferro' : 'Usar canhão', run: () => naval.man(c) });
      }
      if (G.survival.inv.canhao > 0 && naval.canInstallHere('canhao')) consider(1.6, { label: 'Instalar canhão aqui', run: () => naval.install('canhao') });
      if (G.survival.inv.canhao_ferro > 0 && naval.canInstallHere('canhao_ferro')) consider(1.55, { label: 'Instalar canhão de ferro aqui', run: () => naval.install('canhao_ferro') });
      let dmg = null, dd = 2.2;
      for (const piece of boat.pieces.values()) {
        if (!naval.destructible(piece)) continue;
        const max = naval.maxHp(piece), hp = naval.hpOf(piece), d = Math.hypot(piece.x - plx, piece.z - plz);
        if (hp < max - 0.5 && d < dd) { dd = d; dmg = { piece, pct: Math.round(100 * hp / max) }; }
      }
      if (dmg) { // dica: o conserto é com o martelo
        const nome = dmg.piece.physObj ? dmg.piece.physObj.def.nome : (dmg.piece.type === 'canhao' ? 'canhão' : dmg.piece.type === 'canhao_ferro' ? 'canhão de ferro' : 'peça');
        const hammer = G.combat.weaponId === 'martelo';
        consider(dd + 0.6, { label: `${nome} ${dmg.pct}% — ${hammer ? 'martele para consertar' : 'use o martelo para consertar'}` });
      }
    }
    // peixes voadores que caíram no convés
    if (G.seaEvents && G.player.aboard) {
      const f = G.seaEvents.nearestFish();
      if (f) consider(0.35, { label: 'Pegar peixe', run: () => G.seaEvents.takeFish(f) });
    }
    // itens largados (saquinhos)
    if (G.drops) {
      const d = G.drops.nearest();
      if (d) consider(0.4, { label: `Pegar ${lootLabel(d.loot)}`, run: () => G.drops.take(d) });
    }
    // caixotes de loot boiando (navios afundados)
    if (naval) {
      const crate = naval.nearestCrate();
      if (crate) consider(0.5, { label: 'Abrir caixote boiando', run: () => naval.takeCrate(crate) });
    }

    // Peças soldadas próximas que podem ser removidas
    if (G.player.aboard) {
      const boat = G.boat;
      const [plx, plz] = boat.toLocal(p.x, p.z);
      for (const [id, piece] of boat.pieces) {
        if (!piece.physObj) continue; // só peças físicas soldadas
        if (piece.startSlotId && !G.startup.departed) continue;
        const d = Math.hypot(piece.x - plx, piece.z - plz);
        if (d < 2.0) {
          consider(d + 0.3, { remove: id, label: `[${keyOf('unweld')}] Dessoldar ${piece.physObj.def.nome}` });
          break; // apenas a mais próxima
        }
      }
    }

    return best;
  }

  openCrate(crate) {
    sfx.crate();
    const G = this.G;
    this.openCrateId = crate.id;
    this.lootOpen = true;
    G.input.setCursorMode(true);
    G.world.animateCrateOpen(crate.id);
    if (!crate.opened || !crate._fx) { // primeira abertura: a tampa estoura com poeira e brilho dourado
      crate._fx = true;
      const p = { x: crate.x, y: crate.y + 0.6, z: crate.z };
      if (G.vfx) { G.vfx.dust({ x: crate.x, y: crate.y + 0.1, z: crate.z }, 10, 0xcbb894, 2.2); G.vfx.sparks(p, 22, 0xffd36e, 3.5, 0.7); G.vfx.ring({ x: crate.x, y: crate.y, z: crate.z }, { color: 0xffd36e, from: 0.3, to: 2.2, life: 0.45 }); }
      if (G.events) G.events.shake = Math.max(G.events.shake, 0.12);
    }

    if (G.net.online) {
      G.hud.openLoot(crate.id === 'i0,1c0' ? 'Cache inicial' : 'Caixa de suprimentos', {}, null, () => this.closeCrate(), true);
      G.net.send({ t: 'crate:open', id: crate.id, x: crate.x, z: crate.z });
      return;
    }

    const state = G.world.openCrate(crate.id, 1);
    if (!state) { this.closeCrate(); return; }
    // a janela aparece depois que a tampa abre (antecipação)
    G.hud.openLoot(crate.id === 'i0,1c0' ? 'Cache inicial' : 'Caixa de suprimentos', {}, null, () => this.closeCrate(), true);
    setTimeout(() => { if (this.openCrateId === crate.id) this.setCrateState(crate.id, state.loot); }, 380);
  }

  setCrateState(id, loot) {
    const G = this.G;
    G.world.applyCrateState(id, loot);
    if (this.openCrateId === id) {
      G.hud.openLoot(id === 'i0,1c0' ? 'Cache inicial' : 'Caixa de suprimentos', loot,
        (item, amount) => this.takeLoot(item, amount), () => this.closeCrate());
    }
  }

  takeLoot(item, amount) {
    const G = this.G, id = this.openCrateId;
    if (!id) return;
    if (G.net.online) {
      const crate = G.world.crates.find((entry) => entry.id === id);
      if (crate) G.net.send({ t: 'crate:take', id, item, amount, x: crate.x, z: crate.z });
      return;
    }
    const state = G.world.crateStates.get(id);
    const available = state && state.loot[item] || 0;
    const count = Math.min(available, Math.max(0, Math.floor(amount)));
    if (!count) return;
    const loot = { ...state.loot, [item]: available - count };
    if (!loot[item]) delete loot[item];
    G.hud.msg(G.survival.add({ [item]: count }));
    this.setCrateState(id, loot);
  }

  receiveLoot(loot) {
    const message = this.G.survival.add(loot);
    this.G.hud.msg(message);
  }

  closeCrate() {
    if (!this._lootOpen) return;
    this.openCrateId = null;
    this.lootOpen = false;
    this.G.hud.closeLoot();
    this.G.input.setCursorMode(false);
  }

  update(dt) {
    const G = this.G, inp = G.input;
    if (this.lootOpen || (G.tools && G.tools.menuOpen)) { this.current = null; return; }
    if (G.build.active) { this.current = null; return; }
    if (G.build.consumeInteraction) {
      G.build.consumeInteraction = false;
      this.current = null;
      return;
    }
    this.current = G.player.dead || G.player.downed ? null : this.find();
    const c = this.current;
    if (!c || !c.revive) this.reviveT = 0;
    if (!c) return;
    if (c.revive) { // segurar E por REVIVE_TIME segundos
      if (inp.held('interact')) {
        this.reviveT = (this.reviveT || 0) + dt;
        c.label = `Reanimando ${c.name}… ${Math.min(100, Math.round(this.reviveT / REVIVE_TIME * 100))}%`;
        if (this.reviveT >= REVIVE_TIME) {
          this.reviveT = 0;
          G.net.send({ t: 'revive', id: c.revive });
          G.hud.msg(`Você reanimou ${c.name}!`);
        }
      } else this.reviveT = 0;
      return;
    }
    if (c.remove && inp.act('unweld')) G.build.tryRemoveWelded(c.remove);
    else if (inp.act('interact') && c.run) { c.run(); if (G.viewmodel) G.viewmodel.onInteract(); }
    if (c.mast && !c.installSail) {
      const turn = (inp.held('sailLeft') ? 1 : 0) - (inp.held('sailRight') ? 1 : 0); // + = vira para a esquerda (+X)
      if (turn) G.boat.setSail(G.boat.sailUp, G.boat.sailAngle + turn * 0.8 * dt);
    }
  }
}
