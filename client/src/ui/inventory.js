// Tela de inventário: barra rápida (6 slots de arma, com a tecla de cada um) + mochila (armas fora da
// barra e todos os itens). Arraste para organizar: arma na barra, troca de slot, tira da barra; arraste
// para a faixa "Largar" (ou para fora do painel) para soltar no chão. Clique num item para ver detalhes
// e usar/equipar/largar. Funciona com mouse e toque (pointer events). Abre com [Tab].
import { WEAPONS } from '../systems/combat.js';
import { ITEM_NAMES } from '../systems/survival.js';
import { keyOf } from '../core/keybinds.js';

const $ = (id) => document.getElementById(id);
const RARITY = ['', '#b9c0c4', '#6fdc8c', '#5fb4ff', '#c58bff', '#ffc94d'];
const ICON = { bandagem: '✚', kit: '♥', municao: '•', cartucho: '▮', bala_canhao: '●', canhao: '⊛', gancho: '⚓', barra_proteina: 'P', energetico: 'E', chocolate: 'C', peixe: '~', metal: '▤' };
const DESC = {
  bandagem: 'Recupera 30 de vida.', kit: 'Recupera toda a vida.', municao: 'Munição de pistola, revólver e rifles.',
  cartucho: 'Cartuchos de escopeta.', bala_canhao: 'Munição dos canhões da jangada.', canhao: 'Instale a bordo, num ponto livre.',
  gancho: 'Torreta-gancho: instale a bordo.', barra_proteina: '+25% de dano por 4 min.', energetico: 'Estamina gasta pela metade por 4 min.',
  chocolate: 'Regenera vida por 4 min.', peixe: 'Recupera 20 de vida.', metal: 'Material.',
};
const USABLE = { bandagem: 'bandage', kit: 'medkit', barra_proteina: 'food1', energetico: 'food2', chocolate: 'food3', peixe: 'food4' };
const ORDER = ['bandagem', 'kit', 'peixe', 'barra_proteina', 'energetico', 'chocolate', 'municao', 'cartucho', 'bala_canhao', 'canhao', 'gancho', 'metal'];
const wOf = (id) => WEAPONS.find((w) => w.id === id);
const short = (nome) => nome.replace(/ (com|de|improvisado|reforçado|pirata).*$/i, '').replace(/^Rifle de precisão$/, 'Precisão');

export class Inventory {
  constructor(G) {
    this.G = G; this.open = false; this.sel = null; this.drag = null;
    $('invClose').onclick = () => this.toggle(false);
    $('invPanel').addEventListener('pointerdown', (e) => this.down(e));
    addEventListener('pointermove', (e) => this.move(e));
    addEventListener('pointerup', (e) => this.up(e));
    addEventListener('pointercancel', () => this.cancelDrag());
    addEventListener('keydown', (e) => { if (this.open && e.code === 'Escape') { e.preventDefault(); this.toggle(false); } });
    $('invPanel').addEventListener('click', (e) => { if (e.target === $('invPanel') && !this.justDragged) this.toggle(false); }); // clicar fora fecha
  }

  canOpen() {
    const G = this.G;
    return G.started && !G.player.dead && !G.build.active && !G.interact.openCrateId && !(G.naval && G.naval.manning) && !(G.tools && G.tools.menuOpen) && !G.gfxMenu.open && !G.keysMenu.open;
  }
  toggle(on) {
    if (on && !this.canOpen()) return;
    if (on === this.open) return;
    this.open = on;
    $('invPanel').hidden = !on;
    this.G.input.setCursorMode(on);
    if (on) { if (this.G.melee) this.G.melee.cancelCharge(); this.sel = null; this.render(); }
    else this.cancelDrag();
  }

  // ---------- dados ----------
  bagWeapons() { const c = this.G.combat; return [...c.owned].filter((id) => !c.hotbar.includes(id)); }
  bagItems() {
    const inv = this.G.survival.inv;
    const keys = [...ORDER, ...Object.keys(inv).filter((k) => !ORDER.includes(k))];
    return keys.filter((k) => (inv[k] || 0) > 0);
  }

  // ---------- desenho ----------
  cell(kind, id, extra = '') {
    const c = this.G.combat, inv = this.G.survival.inv;
    if (kind === 'w') {
      const w = wOf(id), ammo = w.ammo ? `<em>${c.mags[id] || 0}</em>` : '';
      return `<div class="inv-item w${id === c.weaponId ? ' eq' : ''}${this.sel && this.sel.id === id ? ' sel' : ''}" data-kind="w" data-id="${id}" style="--rar:${RARITY[w.stars]}" ${extra}>` +
        `<span class="nm">${short(w.nome)}</span><span class="st">${'★'.repeat(w.stars)}</span>${ammo}</div>`;
    }
    return `<div class="inv-item i${this.sel && this.sel.id === id ? ' sel' : ''}" data-kind="i" data-id="${id}" ${extra}>` +
      `<span class="ic">${ICON[id] || '■'}</span><span class="nm">${ITEM_NAMES[id] || id}</span><em>${inv[id]}</em></div>`;
  }

  render() {
    if (!this.open) return;
    const c = this.G.combat;
    $('invHot').innerHTML = c.hotbar.map((id, i) => `<div class="inv-slot" data-slot="${i}"><kbd>${keyOf('slot' + (i + 1))}</kbd>${id ? this.cell('w', id) : '<span class="empty">vazio</span>'}</div>`).join('');
    const bag = this.bagWeapons().map((id) => this.cell('w', id)).concat(this.bagItems().map((id) => this.cell('i', id)));
    $('invBag').innerHTML = bag.join('') || '<p class="inv-none">Mochila vazia.</p>';
    this.renderDetail();
  }

  renderDetail() {
    const box = $('invDetail'), s = this.sel, c = this.G.combat, inv = this.G.survival.inv;
    if (!s || (s.kind === 'w' ? !c.owned.has(s.id) : !(inv[s.id] > 0))) { this.sel = null; box.innerHTML = '<p class="inv-tip">Clique num item para ver detalhes. Arraste para organizar a barra rápida, ou para a faixa abaixo para largar no chão.</p>'; return; }
    let html;
    if (s.kind === 'w') {
      const w = wOf(s.id), stats = w.ammo ? `Dano ${w.dmg}${w.pellets > 1 ? '×' + w.pellets : ''} · pente ${w.mag} · ${ITEM_NAMES[w.ammo]}` : w.tool ? 'Ferramenta' : `Corpo a corpo · dano ${w.dmg}`;
      html = `<div class="inv-dh"><b style="color:${RARITY[w.stars]}">${w.nome}</b><span>${'★'.repeat(w.stars)}</span></div><p>${stats}</p>` +
        `<div class="inv-btns">${s.id === c.weaponId ? '' : '<button type="button" data-do="equip">Equipar</button>'}<button type="button" data-do="drop">Largar</button></div>`;
    } else {
      const n = inv[s.id];
      html = `<div class="inv-dh"><b>${ITEM_NAMES[s.id] || s.id}</b><span>× ${n}</span></div><p>${DESC[s.id] || ''}${USABLE[s.id] ? ` Tecla: <kbd>${keyOf(USABLE[s.id])}</kbd>` : ''}</p>` +
        `<div class="inv-btns">${USABLE[s.id] ? '<button type="button" data-do="use">Usar</button>' : ''}<button type="button" data-do="drop1">Largar 1</button>${n > 1 ? '<button type="button" data-do="dropAll">Largar tudo</button>' : ''}</div>`;
    }
    box.innerHTML = html;
    for (const b of box.querySelectorAll('[data-do]')) b.onclick = () => this.action(b.dataset.do);
  }

  action(what) {
    const G = this.G, s = this.sel;
    if (!s) return;
    if (what === 'equip') G.combat.equip(s.id);
    else if (what === 'use') G.survival.use(s.id);
    else if (what === 'drop') this.dropWeapon(s.id);
    else if (what === 'drop1') this.dropItem(s.id, 1);
    else if (what === 'dropAll') this.dropItem(s.id, Infinity);
    this.render();
  }

  // ---------- largar ----------
  dropWeapon(id) {
    const G = this.G;
    if (G.combat.removeWeapon(id)) G.drops.drop({ ['arma_' + id]: 1 });
  }
  dropItem(id, n) {
    const k = this.G.survival.take(id, n);
    if (k) this.G.drops.drop({ [id]: k });
  }
  // tecla/botão de largar: solta a arma que está na mão
  quickDrop() {
    const G = this.G, id = G.combat.weaponId;
    if (!id) { G.hud.msg('Nada na mão para largar'); return; }
    if (G.melee && (G.melee.pending || G.melee.charging)) return;
    this.dropWeapon(id);
  }

  // ---------- arrastar ----------
  down(e) {
    const it = e.target.closest('.inv-item');
    if (!it || e.button > 0) return;
    e.preventDefault();
    this.drag = { kind: it.dataset.kind, id: it.dataset.id, x: e.clientX, y: e.clientY, el: it, moved: false, pid: e.pointerId };
  }
  move(e) {
    const d = this.drag;
    if (!d || e.pointerId !== d.pid) return;
    if (!d.moved && Math.hypot(e.clientX - d.x, e.clientY - d.y) < 6) return;
    if (!d.moved) {
      d.moved = true;
      d.ghost = d.el.cloneNode(true); d.ghost.classList.add('ghost');
      document.body.appendChild(d.ghost); d.el.classList.add('dragging');
      $('invPanel').classList.add('dragging');
    }
    d.ghost.style.transform = `translate(${e.clientX - 40}px, ${e.clientY - 24}px)`;
    const t = this.targetAt(e.clientX, e.clientY);
    for (const el of document.querySelectorAll('#invPanel .over')) el.classList.remove('over');
    if (t && t.el) t.el.classList.add('over');
  }
  targetAt(x, y) {
    const el = document.elementFromPoint(x, y);
    if (!el) return { drop: true };
    const slot = el.closest('[data-slot]'); if (slot) return { slot: +slot.dataset.slot, el: slot };
    const drop = el.closest('#invDrop'); if (drop) return { drop: true, el: drop };
    const bag = el.closest('#invBag'); if (bag) return { bag: true, el: bag };
    if (!el.closest('.inv-card')) return { drop: true }; // soltou fora do painel: larga no chão
    return null;
  }
  up(e) {
    const d = this.drag;
    if (!d || e.pointerId !== d.pid) return;
    if (!d.moved) { // clique: seleciona
      this.drag = null;
      this.sel = { kind: d.kind, id: d.id };
      this.render();
      return;
    }
    const t = this.targetAt(e.clientX, e.clientY), c = this.G.combat;
    this.cancelDrag();
    this.justDragged = true; setTimeout(() => { this.justDragged = false; }, 0);
    if (!t) return;
    if (t.drop) { if (d.kind === 'w') this.dropWeapon(d.id); else this.dropItem(d.id, Infinity); }
    else if (t.slot != null && d.kind === 'w') c.assignSlot(d.id, t.slot);
    else if (t.bag && d.kind === 'w') c.unassign(d.id);
    this.render();
  }
  cancelDrag() {
    const d = this.drag;
    if (d && d.ghost) d.ghost.remove();
    if (d && d.el) d.el.classList.remove('dragging');
    $('invPanel').classList.remove('dragging');
    for (const el of document.querySelectorAll('#invPanel .over')) el.classList.remove('over');
    this.drag = null;
  }

  update() {
    const G = this.G, inp = G.input;
    if (inp.act('inventory')) this.toggle(!this.open);
    else if (!this.open && inp.act('drop') && this.canOpen() && !G.player.downed) this.quickDrop();
    if (this.open) {
      if (!this.canOpen()) { this.toggle(false); return; }
      // redesenha quando algo muda (munição gasta, item pego...) sem atrapalhar o arrasto
      const sig = JSON.stringify([G.combat.hotbar, [...G.combat.owned], G.combat.weaponId, G.survival.inv, G.combat.mags]);
      if (sig !== this._sig && !this.drag) { this._sig = sig; this.render(); }
    }
  }
}
