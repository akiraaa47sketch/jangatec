// PAINEL DE ADMIN (testes): aperte L + Z juntos. Dá armas (com as estrelas escolhidas), munição,
// itens, canhões/torreta para soldar, cura e modo imortal. Só funciona no modo SOLO — numa sala
// online seria trapaça contra os outros jogadores.
import { WEAPONS, RAR_NAME } from '../systems/combat.js';
import { ITEM_NAMES } from '../systems/survival.js';

const ITEMS = ['bandagem', 'kit', 'barra_proteina', 'energetico', 'chocolate', 'peixe', 'colete', 'metal'];
const AMMO = [['municao', 30], ['cartucho', 20], ['bala_canhao', 10]];
const PROPS = [['canhao', 'Canhão improvisado'], ['canhao_ferro', 'Canhão de ferro'], ['gancho', 'Torreta-arpão']];

export class AdminPanel {
  constructor(G) {
    this.G = G; this.open = false; this.god = false; this.stars = 4; this.faceAtL = null;
    const el = this.el = document.createElement('div');
    el.id = 'adminPanel'; el.hidden = true;
    document.body.appendChild(el);
    el.addEventListener('click', (e) => { const b = e.target.closest('button[data-a]'); if (b) this.act(b.dataset.a, b.dataset.v); });
    // L + Z: a segunda tecla é "engolida" (não chega no jogo); se o L veio primeiro, desfaz o "travar corpo"
    const held = new Set();
    addEventListener('keydown', (e) => {
      if (e.code === 'KeyL' && !held.has('KeyL') && G.player) this.faceAtL = !!G.player.faceCam; // estado antes do L
      if ((e.code === 'KeyL' && held.has('KeyZ')) || (e.code === 'KeyZ' && held.has('KeyL'))) {
        e.preventDefault(); e.stopImmediatePropagation();
        const first = e.code === 'KeyZ' ? 'KeyL' : 'KeyZ';
        G.input.pressed.delete(first); // o jogo ainda não leu a 1ª tecla: cancela
        if (first === 'KeyL' && G.player && this.faceAtL != null) G.player.faceCam = this.faceAtL; // já leu: volta como estava
        if (!e.repeat) this.toggle(!this.open);
        held.add(e.code); return;
      }
      held.add(e.code);
      if (e.code === 'Escape' && this.open) this.toggle(false);
    }, true);
    addEventListener('keyup', (e) => held.delete(e.code), true);
    addEventListener('blur', () => held.clear());
  }

  toggle(on) {
    const G = this.G;
    if (on && !G.started) return;
    if (on && G.net && G.net.online) { G.hud.msg('Painel de admin: só no modo solo'); return; }
    this.open = on; this.el.hidden = !on;
    G.input.setCursorMode(on);
    if (on) this.render();
  }

  msg(t) { this.G.hud.msg(`[admin] ${t}`); this.render(); }

  act(a, v) {
    const G = this.G, c = G.combat, s = G.survival, inv = s.inv;
    if (a === 'stars') { this.stars = Number(v); this.render(); return; }
    if (a === 'weapon') {
      const w = WEAPONS.find((x) => x.id === v); if (!w) return;
      if (c.owned.has(v)) c.rarity[v] = this.stars; // já tem: troca as estrelas
      else s.add({ [`arma_${v}_r${this.stars}`]: w.noReload ? w.mag : 1 });
      c.rarity[v] = w.noReload ? 4 : this.stars;
      if (w.mag) c.mags[v] = w.mag; // já vem com o pente cheio
      c.equip(v);
      this.msg(`${w.nome} ${'★'.repeat(c.rarOf(v))}`); return;
    }
    if (a === 'allWeapons') { for (const w of WEAPONS) if (!w.tool || w.tool === 'martelo') { if (!c.owned.has(w.id)) s.add({ [`arma_${w.id}_r${this.stars}`]: w.noReload ? w.mag : 1 }); c.rarity[w.id] = w.noReload ? 4 : this.stars; if (w.mag) c.mags[w.id] = w.mag; } this.msg('Todas as armas'); return; }
    if (a === 'ammo') { const [k, n] = AMMO.find(([x]) => x === v); inv[k] = (inv[k] || 0) + n; this.msg(`+${n} ${ITEM_NAMES[k] || k}`); return; }
    if (a === 'fillMags') { for (const id of c.owned) { const w = WEAPONS.find((x) => x.id === id); if (w && w.mag) c.mags[id] = w.mag; } c.reloading = 0; c.reloadPlan = null; this.msg('Pentes cheios'); return; }
    if (a === 'item') { const n = Number(String(v).split(':')[1]), k = String(v).split(':')[0]; s.add({ [k]: n }); this.msg(`+${n} ${ITEM_NAMES[k] || k}`); return; }
    if (a === 'prop') { s.add({ [v]: 1 }); this.toggle(false); G.hud.msg('[admin] Prop na sua frente — carregue e solde'); return; }
    if (a === 'heal') { s.vida = 100; if (G.player.downed && s.revive) s.revive(); this.msg('Vida cheia'); return; }
    if (a === 'god') { this.god = !this.god; this.msg(this.god ? 'Imortal: LIGADO' : 'Imortal: desligado'); return; }
    if (a === 'clear') { for (const k of Object.keys(inv)) inv[k] = 0; this.msg('Mochila esvaziada'); return; }
  }

  render() {
    if (!this.open) return;
    const c = this.G.combat, inv = this.G.survival.inv;
    const btn = (a, v, label, cls = '') => `<button type="button" class="${cls}" data-a="${a}" data-v="${v}">${label}</button>`;
    const weapons = WEAPONS.filter((w) => !w.tool || w.tool === 'martelo').sort((a, b) => a.stars - b.stars)
      .map((w) => btn('weapon', w.id, `${w.nome}${c.owned.has(w.id) ? ` <small>${'★'.repeat(c.rarOf(w.id))}</small>` : ''}`, c.owned.has(w.id) ? 'own' : '')).join('');
    const stars = [1, 2, 3, 4].map((n) => btn('stars', n, `${'★'.repeat(n)} <small>${RAR_NAME[n]}</small>`, this.stars === n ? 'on' : '')).join('');
    this.el.innerHTML = `
      <div class="adm-head"><b>Painel de admin</b><span>L + Z ou Esc para fechar · só no solo</span></div>
      <section><h4>Armas <small>(clique para pegar; se já tiver, troca as estrelas)</small></h4>
        <div class="adm-row stars">${stars}</div><div class="adm-grid">${weapons}</div>
        <div class="adm-row">${btn('allWeapons', '', 'Pegar todas')}${btn('fillMags', '', 'Encher todos os pentes')}</div></section>
      <section><h4>Munição</h4><div class="adm-row">${AMMO.map(([k, n]) => btn('ammo', k, `+${n} ${ITEM_NAMES[k] || k} <small>(${inv[k] || 0})</small>`)).join('')}</div></section>
      <section><h4>Itens</h4><div class="adm-grid">${ITEMS.map((k) => btn('item', `${k}:${k === 'metal' ? 10 : k === 'colete' ? 1 : 5}`, `+${k === 'metal' ? 10 : k === 'colete' ? 1 : 5} ${ITEM_NAMES[k] || k} <small>(${inv[k] || 0})</small>`)).join('')}</div></section>
      <section><h4>Props para soldar</h4><div class="adm-row">${PROPS.map(([k, n]) => btn('prop', k, n)).join('')}</div></section>
      <section><h4>Jogador</h4><div class="adm-row">${btn('heal', '', 'Vida cheia')}${btn('god', '', this.god ? 'Imortal: LIGADO' : 'Imortal: desligado', this.god ? 'on' : '')}${btn('clear', '', 'Esvaziar mochila', 'warn')}</div></section>`;
  }
}
