// HUD em DOM, enxuto: vitais, arma, hotbar, objetivo curto, avisos e prompts.
import { ITEM_NAMES } from '../systems/survival.js';
import { WEAPONS } from '../systems/combat.js';
import { keyOf } from '../core/keybinds.js';

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
    const G = this.G, s = G.survival, inv = s.inv, c = G.combat, w = c.weapon;
    if (!this.hintAt) this.hintAt = performance.now();
    if (performance.now() - this.hintAt > 25000) $('hint').classList.add('gone');
    // Vida: boia salva-vidas + barra
    const vida = Math.max(0, Math.round(s.vida));
    $('vida').style.width = vida + '%';
    const down = !!G.player.downed;
    document.body.classList.toggle('downed', down);
    $('downed').hidden = !down;
    if (down) {
      const left = Math.max(0, G.survival.bleed);
      $('bleedFill').style.width = `${(left / 45) * 100}%`;
      $('downedText').textContent = `Arraste-se até um aliado — ele te reanima segurando E (${Math.ceil(left)} s)`;
    }
    if (G.melee) { const st = G.melee.stamina; $('stamina').style.width = st + '%'; $('stamina').classList.toggle('low', st < 25); }
    $('vidaNum').textContent = vida;
    $('lifeArc').style.strokeDashoffset = String(157 * (1 - vida / 100));
    $('lifeRing').classList.toggle('low', vida <= 30);
    $('objective').textContent = G.startup.objective;
    const chip = (icon, label, n) => n ? `<span class="chip" title="${label}"><i>${icon}</i>${n}</span>` : '';
    const invHtml = chip('✚', 'Bandagens [4]', inv.bandagem) + chip('♥', 'Kits médicos [5]', inv.kit) +
      chip('•', 'Munição', inv.municao) + chip('▮', 'Cartuchos', inv.cartucho || 0) +
      chip('⊛', 'Canhão improvisado (instale com E a bordo)', inv.canhao || 0);
    if (invHtml !== this._inv) { $('inv').innerHTML = invHtml; this._inv = invHtml; }
    // Arma equipada
    const weaponHtml = w
      ? `<div class="wname">${w.nome}</div><div class="stars">${'★'.repeat(w.stars)}${'☆'.repeat(5 - w.stars)}</div>` +
        (w.ammo ? `<div class="ammo">${c.reloading > 0 ? '<small>recarregando…</small>' : c.mags[w.id]} <small>/ ${inv[w.ammo]}</small></div>` : '')
      : '<div class="wname">Mãos vazias</div>';
    if (weaponHtml !== this._weapon) { $('weapon').innerHTML = weaponHtml; this._weapon = weaponHtml; }
    // Hotbar em tábuas
    let hot = '';
    for (let i = 0; i < c.hotbar.length; i++) {
      const id = c.hotbar[i], weapon = id && WEAPONS.find((entry) => entry.id === id);
      if (i >= 3 && !id) continue; // slots extras (6–8) só aparecem quando ocupados
      hot += `<span class="hotbar-slot${id === c.weaponId ? ' active' : ''}${weapon ? '' : ' empty'}"><span class="n">${i < 3 ? i + 1 : i + 3}</span>` +
        (weapon ? `${weapon.nome}<span class="s">${'★'.repeat(weapon.stars)}</span>` : '—') + '</span>';
    }
    if (hot !== this._hot) { $('hotbar').innerHTML = hot; this._hot = hot; }

    const build = G.build;
    const crosshair = $('crosshair');
    crosshair.classList.toggle('build', build.active);
    crosshair.style.display = G.naval && G.naval.manning ? 'none' : '';
    const carryText = !build.active ? '' : build.rotating
      ? `${build.held.def.nome} · arraste anel · botão direito: câmera · [${keyOf('gizmo')}] voltar · [${keyOf('weld')}] solda · Esc cancela`
      : `${build.held.def.nome} · roda gira · [${keyOf('straighten')}] endireita · [${keyOf('resetPos')}] reposiciona · [${keyOf('place')}] solta · [${keyOf('gizmo')}] gizmo · [${keyOf('weld')}] solda · [${keyOf('assist')}] encaixe · Esc cancela`;

    const it = G.interact.current;
    const pickupText = build.pickupTarget
      ? `Clique esquerdo para pegar ${build.pickupTarget.def.nome}`
      : '';
    const touch = document.body.classList.contains('touch');
    const promptText = G.player.dead ? '' : carryText || (pickupText && touch ? 'Toque em atacar para pegar ' + build.pickupTarget.def.nome : pickupText) ||
      (it ? `${it.remove ? '' : `[${keyOf('interact')}]` + ' '}${it.label}` : G.player.swimming ? `[${keyOf('jump')}] subir em uma borda` : '');
    // [X] vira tecla desenhada
    const esc = (t) => t.replace(/[&<>]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[ch]));
    const promptHtml = esc(promptText).replace(/\[([^\]]{1,12})\]/g, '<kbd>$1</kbd>');
    if (promptHtml !== this._prompt) { $('prompt').innerHTML = promptHtml; this._prompt = promptHtml; }
  }
}
