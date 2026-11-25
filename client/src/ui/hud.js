// HUD em DOM, enxuto: vitais, arma, hotbar, objetivo curto, avisos e prompts.
import { ITEM_NAMES, BUFFS } from '../systems/survival.js';
import { WEAPONS } from '../systems/combat.js';
import { keyOf } from '../core/keybinds.js';

const $ = (id) => document.getElementById(id);
const LIFE_C = 2 * Math.PI * 27, STAM_C = 2 * Math.PI * 21; // circunferências dos anéis (r=27 e r=21)
// consumíveis da barra: item, ação (tecla configurável), ícone, nome
const CONSUMABLES = [
  ['bandagem', 'bandage', '✚', 'Bandagem — +30 de vida'],
  ['kit', 'medkit', '♥', 'Kit médico — vida cheia'],
  ['barra_proteina', 'food1', '🥜', 'Barra de proteína — +25% de dano por 4 min'],
  ['energetico', 'food2', '🥤', 'Energético — estamina gasta pela metade por 4 min'],
  ['chocolate', 'food3', '🍫', 'Chocolate — regenera vida por 4 min'],
  ['peixe', 'food4', '🐟', 'Peixe — +20 de vida'],
];
const RARITY = ['', '#b9c0c4', '#6fdc8c', '#5fb4ff', '#c58bff', '#ffc94d'];
const short = (nome) => nome.replace(/ (com|de|improvisado|reforçado|pirata).*$/i, '').replace(/^Rifle de precisão$/, 'Precisão');
const isTouch = () => document.body.classList.contains('touch');
// no celular não existem teclas: tira os "[E]" dos textos
const stripKeys = (t) => t.replace(/\[[^\]]{1,14}\]\s*/g, '').replace(/\s*—\s*$/, '');

export class Hud {
  constructor(G) {
    this.G = G; this.msgs = []; this.acc = 0;
    // Remove o painel de construção legacy do DOM (não existe mais seletor de peças)
    const bp = $('buildPanel');
    if (bp) bp.hidden = true;
    // barra de inventário: clicar/tocar num slot equipa a arma ou usa o item
    const bar = $('hotbar');
    const pick = (ev) => {
      const el = ev.target.closest('[data-slot],[data-use]');
      if (!el) return;
      ev.preventDefault(); ev.stopPropagation();
      if (G.build.active || G.player.dead) return;
      if (el.dataset.slot != null) G.combat.select(+el.dataset.slot);
      else G.survival.use(el.dataset.use);
      this._hot = null;
    };
    bar.addEventListener('touchstart', pick, { passive: false });
    bar.addEventListener('mousedown', pick);
  }
  show() { $('hud').hidden = false; }
  msg(text) {
    if (!text) return;
    const el = document.createElement('div');
    el.textContent = isTouch() ? stripKeys(text) : text;
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
    // Vida: só o anel (sem painel); estamina no anel de dentro
    const vida = Math.max(0, Math.round(s.vida));
    const down = !!G.player.downed;
    document.body.classList.toggle('downed', down);
    $('downed').hidden = !down;
    if (down) {
      const left = Math.max(0, G.survival.bleed);
      $('bleedFill').style.width = `${(left / 45) * 100}%`;
      $('downedText').textContent = `Arraste-se até um aliado — ele te reanima segurando ${isTouch() ? 'o botão de usar' : 'E'} (${Math.ceil(left)} s)`;
    }
    const st = G.melee ? G.melee.stamina : 100;
    $('stamArc').style.strokeDashoffset = String(STAM_C * (1 - st / 100));
    $('lifeRing').classList.toggle('tired', st < 25);
    $('lifeRing').classList.toggle('fullStam', st >= 99.5);
    $('vidaNum').textContent = vida;
    $('lifeArc').style.strokeDashoffset = String(LIFE_C * (1 - vida / 100));
    $('lifeRing').classList.toggle('low', vida <= 30);
    $('lockTag').hidden = !G.player.faceCam || G.player.firstPerson;
    $('objective').textContent = G.startup.objective;
    // barra de vida do chefe mais perto (escafandrista / Metralhador)
    const pp = G.player.body.pos;
    const boss = G.enemies.list.filter((e) => e.def.boss && e.state !== 'dead' && Math.hypot(e.body.pos.x - pp.x, e.body.pos.z - pp.z) < 70 && Math.abs(e.body.pos.y - pp.y) < 5) // mesmo andar
      .sort((a, b) => Math.hypot(a.body.pos.x - pp.x, a.body.pos.z - pp.z) - Math.hypot(b.body.pos.x - pp.x, b.body.pos.z - pp.z))[0];
    $('bossBar').hidden = !boss; document.body.classList.toggle('bossfight', !!boss);
    if (boss) { $('bossName').textContent = boss.def.nome; $('bossFill').style.width = `${Math.max(0, Math.min(100, boss.hp / (boss.max || boss.def.hp) * 100))}%`; $('bossBar').className = boss.def.boss; }
    // itens de instalar (sem tecla): fichinhas discretas acima da barra
    const chip = (icon, label, n) => n ? `<span class="chip" title="${label}"><i>${icon}</i>${n}</span>` : '';
    const invHtml = chip('⊛', 'Canhão improvisado (instale a bordo)', inv.canhao || 0) +
      chip('●', 'Balas de canhão', inv.bala_canhao || 0);
    if (invHtml !== this._inv) { $('inv').innerHTML = invHtml; this._inv = invHtml; }
    // buffs ativos com o tempo que falta
    const bf = G.survival.buffs, buffHtml = Object.keys(bf).map((k) => {
      const t = Math.ceil(bf[k]), b = BUFFS[k];
      return `<span class="buff${b.debuff ? ' debuff' : t <= 20 ? ' low' : ''}" title="${b.nome}: ${b.desc}"><i>${b.icon}</i>${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}</span>`;
    }).join('');
    if (buffHtml !== this._buffs) { $('buffs').innerHTML = buffHtml; this._buffs = buffHtml; }
    // Arma equipada: só texto, sem painel
    const weaponHtml = w
      ? `<div class="wname" style="--rar:${RARITY[w.stars]}">${w.nome}</div>` +
        (w.noReload ? `<div class="ammo">${c.mags[w.id]}<small> sem recarga</small></div>` : w.ammo ? `<div class="ammo">${c.reloading > 0 ? '<small>recarregando…</small>' : `${c.mags[w.id]}<small> / ${inv[w.ammo]}</small>`}</div>` : '')
      : '<div class="wname">Mãos vazias</div>';
    if (weaponHtml !== this._weapon) { $('weapon').innerHTML = weaponHtml; this._weapon = weaponHtml; }
    // Barra de inventário: armas (slots) | consumíveis — cada um mostra a tecla configurada
    const touch = isTouch();
    let hot = '';
    for (let i = 0; i < c.hotbar.length; i++) {
      const id = c.hotbar[i], weapon = id && WEAPONS.find((entry) => entry.id === id);
      if ((i >= 3 || touch) && !id) continue; // slots extras e (no celular) vazios só quando ocupados
      const k = keyOf('slot' + (i + 1));
      const ammo = weapon && (weapon.ammo || weapon.noReload) ? `<em>${c.mags[id]}</em>` : '';
      hot += `<button type="button" data-slot="${i}" class="slot wpn${id === c.weaponId ? ' active' : ''}${weapon ? '' : ' empty'}"` +
        `${weapon ? ` title="${weapon.nome} ${'★'.repeat(weapon.stars)}" style="--rar:${RARITY[weapon.stars]}"` : ''}>` +
        `<kbd>${k}</kbd><span class="nm">${weapon ? short(weapon.nome) : ''}</span>${ammo}</button>`;
    }
    hot += '<i class="sep"></i>';
    for (const [item, act, icon, label] of CONSUMABLES) {
      const n = inv[item] || 0;
      if (touch && !n) continue;
      hot += `<button type="button" data-use="${item}" class="slot use${n ? '' : ' empty'}" title="${label}">` +
        `<kbd>${keyOf(act)}</kbd><span class="ic">${icon}</span><em>${n}</em></button>`;
    }
    if (hot !== this._hot) { $('hotbar').innerHTML = hot; this._hot = hot; }

    const build = G.build;
    $('invBar').classList.toggle('dim', !!build.active);
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
    const promptText = G.player.dead ? '' : carryText || (pickupText && touch ? 'Toque em atacar para pegar ' + build.pickupTarget.def.nome : pickupText) ||
      (it ? `${it.remove ? '' : `[${keyOf('interact')}]` + ' '}${it.label}` : G.player.swimming ? `[${keyOf('jump')}] subir em uma borda` : '');
    // [X] vira tecla desenhada
    const esc = (t) => t.replace(/[&<>]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[ch]));
    const promptHtml = esc(touch ? stripKeys(promptText) : promptText).replace(/\[([^\]]{1,12})\]/g, '<kbd>$1</kbd>');
    if (promptHtml !== this._prompt) { $('prompt').innerHTML = promptHtml; this._prompt = promptHtml; }
  }
}
