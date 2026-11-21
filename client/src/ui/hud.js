// HUD em DOM: barras, inventário, arma, barco, bússola de ilha, avisos e status de construção física.
import { ITEM_NAMES } from '../systems/survival.js';
import { WEAPONS } from '../systems/combat.js';

const $ = (id) => document.getElementById(id);

export class Hud {
  constructor(G) {
    this.G = G; this.msgs = []; this.acc = 0;
    // Remove o painel de construção legacy do DOM (não existe mais seletor de peças)
    const bp = $('buildPanel');
    if (bp) bp.hidden = true;
  }
  show() { $('hud').hidden = false; }
  msg(text) {
    if (!text) return;
    const el = document.createElement('div');
    el.textContent = text;
    $('msgs').prepend(el);
    setTimeout(() => el.remove(), 4000);
    while ($('msgs').children.length > 5) $('msgs').lastChild.remove();
  }
  flash(kind) {
    const v = $('vignette');
    v.className = ''; void v.offsetWidth; v.className = kind;
  }
  // Painel de evento persistente (atualizado pelo sistema de eventos a cada frame).
  setEvent(ev) { this.event = ev; this.eventUntil = 0; if (!ev) this._renderEvent(); }
  // Aviso temporário no mesmo painel (ex.: piratas).
  banner(title, text, kind, seconds = 4) {
    if (this.event && this.eventUntil === 0) return; // evento climático tem prioridade
    this.event = { title, text, kind };
    this.eventUntil = performance.now() + seconds * 1000;
    this._renderEvent();
  }
  _renderEvent() {
    const ev = this.event, box = $('eventBox');
    if (!ev) { box.hidden = true; return; }
    box.hidden = false;
    box.className = `${ev.kind || ''}${ev.good ? ' good' : ''}`;
    $('eventTitle').textContent = ev.title;
    $('eventText').textContent = ev.text || '';
    $('eventArrow').style.visibility = ev.arrow == null ? 'hidden' : 'visible';
    if (ev.arrow != null) $('eventArrow').style.transform = `rotate(${ev.arrow}rad)`;
    $('eventMeter').style.display = ev.meter == null ? 'none' : 'flex';
    if (ev.meter != null) {
      $('eventMeterLabel').textContent = ev.meterLabel || 'impacto';
      $('eventMeterFill').style.width = `${Math.round(ev.meter * 100)}%`;
    }
  }
  setBuild(on) {
    // Legacy — não faz nada no novo sistema
  }

  openLoot(title, loot, onTake, onClose, pending = false) {
    $('lootTitle').textContent = title;
    $('lootPanel').hidden = false;
    this.renderLoot(loot, onTake, pending);
    $('lootClose').onclick = onClose;
  }

  renderLoot(loot, onTake, pending = false) {
    const list = $('lootItems');
    list.replaceChildren();
    const items = Object.entries(loot || {}).filter(([, amount]) => amount > 0);
    if (pending) {
      $('lootStatus').textContent = 'Carregando inventário da caixa…';
      return;
    }
    $('lootStatus').textContent = items.length ? 'Selecione um item para coletar' : 'Esta caixa está vazia';
    for (const [id, amount] of items) {
      const weapon = id.startsWith('arma_') && WEAPONS.find((entry) => entry.id === id.slice(5));
      const label = weapon
        ? `${weapon.nome} ${'★'.repeat(weapon.stars)}`
        : ITEM_NAMES[id] || id;
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = `${label}  × ${amount}  ·  Pegar`;
      button.onclick = () => onTake && onTake(id, amount);
      list.append(button);
    }
  }

  closeLoot() {
    $('lootPanel').hidden = true;
    $('lootItems').replaceChildren();
  }

  update(dt) {
    this.acc += dt;
    if (this.eventUntil && performance.now() > this.eventUntil) { this.event = null; this.eventUntil = 0; this._renderEvent(); }
    if (this.acc < 0.1) return; // 10 Hz basta para o HUD
    this._renderEvent();
    this.acc = 0;
    const G = this.G, s = G.survival, inv = s.inv, boat = G.boat, c = G.combat, w = c.weapon;
    $('vida').style.width = s.vida + '%';
    $('objective').textContent = G.startup.objective;
    const owned = [...c.owned].map((id) => {
      const weapon = WEAPONS.find((entry) => entry.id === id);
      return weapon ? `${weapon.nome} ${'★'.repeat(weapon.stars)}` : '';
    }).filter(Boolean).join(' · ');
    $('inv').textContent =
      `Bandagem ${inv.bandagem}  ·  Kit ${inv.kit}\n` +
      `Munição ${inv.municao}  ·  Cartuchos ${inv.cartucho || 0}\n` +
      `Armas: ${owned || 'nenhuma'}`;
    $('weapon').textContent = w
      ? `${'★'.repeat(w.stars)} ${w.nome}  ·  ${c.durability[w.id]}/${w.durability}` +
        (w.ammo ? `  ·  ${c.reloading > 0 ? 'recarregando…' : c.mags[w.id]} / ${inv[w.ammo]}` : '')
      : 'Sem arma';
    const hotbar = $('hotbar');
    hotbar.replaceChildren();
    for (let i = 0; i < c.hotbar.length; i++) {
      const id = c.hotbar[i], weapon = id && WEAPONS.find((entry) => entry.id === id);
      const slot = document.createElement('span');
      slot.className = `hotbar-slot${id === c.weaponId ? ' active' : ''}`;
      slot.textContent = `${i + 1}  ${weapon ? `${'★'.repeat(weapon.stars)} ${weapon.nome}` : '—'}`;
      hotbar.append(slot);
    }

    // Maré (só depois da partida)
    const tide = G.startup.departed && G.startup.tide.state;
    $('tideBox').hidden = !tide;
    if (tide) {
      const icon = { seca: '🏝', enchente: '⬆', cheia: '🌊', vazante: '⬇' }[tide.phase.id];
      const secs = Math.ceil(tide.nextIn), mm = Math.floor(secs / 60), ss = String(secs % 60).padStart(2, '0');
      $('tideBox').className = tide.phase.id;
      $('tideName').textContent = `${icon} ${tide.phase.nome}`;
      $('tideNext').textContent = `${tide.next.nome} em ${mm}:${ss}`;
      $('tideFill').style.height = `${Math.round(12 + tide.norm * 88)}%`;
    }

    // Info de navegação
    const nav = boat.nav;
    const navMode = nav.isFree ? '🔥 CONTROLE LIVRE — Batalha Final!' : `Rota — fase: ${nav.phase}`;
    const progress = nav.isLinear ? ` · progresso ${(nav.progress(boat.z) * 100).toFixed(0)}%` : '';

    const near = G.world.nearestIsland(boat.x, boat.z);
    let isl = 'Nenhuma ilha à vista';
    if (near) {
      const ang = Math.atan2(near.isl.x - G.player.body.pos.x, near.isl.z - G.player.body.pos.z) - (G.player.camYaw + Math.PI);
      $('arrow').style.transform = `rotate(${-ang}rad)`;
      isl = `Ilha: ${Math.round(near.dist)} m`;
    }
    $('arrow').style.visibility = near ? 'visible' : 'hidden';
    $('boatInfo').textContent =
      `Vela ${boat.sailUp ? 'levantada' : 'baixada'}  ·  ${boat.speed.toFixed(1)} m/s  ·  ${navMode}${progress}\n${isl}  ·  Zona ${G.world.difficulty(boat.x, boat.z) + 1}/5  ·  seed ${G.world.seed}` +
      (G.net.online ? `  ·  online (${G.net.remotes.size + 1})` : '  ·  solo');

    const build = G.build;
    const crosshair = $('crosshair');
    crosshair.classList.toggle('build', build.active);
    const carryText = !build.active ? '' : build.rotating
      ? `${build.held.def.nome} · arraste anel · botão direito: câmera · [R] voltar · [Z] solda · Esc cancela`
      : `${build.held.def.nome} · WASD anda · mouse/câmera move · [V] reposiciona · [Q] solta · [R] gizmo · [Z] solda · Esc cancela`;

    const it = G.interact.current;
    const pickupText = build.pickupTarget
      ? `Clique esquerdo para pegar ${build.pickupTarget.def.nome}`
      : '';
    $('prompt').textContent = G.player.dead ? '' : carryText || pickupText || (it ? `[E] ${it.label}` : G.player.swimming ? '[Espaço] subir em uma borda' : '');
  }
}
