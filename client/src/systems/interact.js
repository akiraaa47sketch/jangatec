// Interação com [E]: caixas de loot e mastro; [X]: peças soldadas.
export class Interact {
  constructor(G) {
    this.G = G;
    this.current = null;
    this.openCrateId = null;
    this.lootOpen = false;
  }

  find() {
    const G = this.G, p = G.player.body.pos;
    if (G.build.active) return null;
    let best = null, bd = Infinity;
    const consider = (d, o) => { if (d < bd) { bd = d; best = o; } };

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
      if (dist < 2.6) consider(dist + 0.5, { mast: true, label: (G.boat.sailUp ? 'Baixar vela' : 'Levantar vela') + '   [Z] [C] girar vela', run: () => G.boat.setSail(!G.boat.sailUp, G.boat.sailAngle) });
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
          consider(d + 0.3, { remove: id, label: `[X] Dessoldar ${piece.physObj.def.nome}` });
          break; // apenas a mais próxima
        }
      }
    }

    return best;
  }

  openCrate(crate) {
    const G = this.G;
    this.openCrateId = crate.id;
    this.lootOpen = true;
    G.input.setCursorMode(true);
    G.world.animateCrateOpen(crate.id);

    if (G.net.online) {
      G.hud.openLoot(crate.id === 'i0,1c0' ? 'Cache inicial' : 'Caixa de suprimentos', {}, null, () => this.closeCrate(), true);
      G.net.send({ t: 'crate:open', id: crate.id, x: crate.x, z: crate.z });
      return;
    }

    const state = G.world.openCrate(crate.id, 1);
    if (!state) { this.closeCrate(); return; }
    this.setCrateState(crate.id, state.loot);
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
    if (!this.lootOpen) return;
    this.openCrateId = null;
    this.lootOpen = false;
    this.G.hud.closeLoot();
    this.G.input.setCursorMode(false);
  }

  update(dt) {
    const G = this.G, inp = G.input;
    if (this.lootOpen) { this.current = null; return; }
    if (G.build.active) { this.current = null; return; }
    if (G.build.consumeInteraction) {
      G.build.consumeInteraction = false;
      this.current = null;
      return;
    }
    this.current = G.player.dead ? null : this.find();
    const c = this.current;
    if (!c) return;
    if (c.remove && inp.hit('KeyX')) G.build.tryRemoveWelded(c.remove);
    else if (inp.hit('KeyE') && c.run) { c.run(); if (G.viewmodel) G.viewmodel.onInteract(); }
    if (c.mast && !c.installSail) {
      const turn = (inp.down('KeyC') ? 1 : 0) - (inp.down('KeyZ') ? 1 : 0);
      if (turn) G.boat.setSail(G.boat.sailUp, G.boat.sailAngle + turn * 0.8 * dt);
    }
  }
}
