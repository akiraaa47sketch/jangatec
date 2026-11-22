// Menu de teclas: lista todas as ações por categoria; clique numa tecla e aperte a nova (teclado ou
// mouse). Se a tecla já era usada por outra ação no mesmo contexto, as duas trocam de lugar.
// Aparece na aba "Controles" do menu inicial e no painel de opções durante o jogo.
import { setSfxVolume, sfxVolume, sfx } from '../core/sfx.js';
import { ACTIONS, CATS, binds, keyName, setBind, resetBinds, onBindsChange, RESERVED } from '../core/keybinds.js';

const $ = (id) => document.getElementById(id);

export class KeysMenu {
  constructor(G) {
    this.G = G; this.lists = [];
    this.waiting = null; // { id, btn }
    for (const [listId, noteId] of [['keysList', 'keysNote'], ['keysListGame', 'keysNoteGame']]) {
      const el = $(listId);
      if (el) { this.lists.push({ el, note: $(noteId) }); }
    }
    for (const id of ['keysReset', 'keysResetGame']) if ($(id)) $(id).onclick = () => { resetBinds(); this.render(); this.say('Teclas padrão restauradas.'); };
    if ($('keysOpen')) $('keysOpen').onclick = () => this.toggle(true);
    if ($('keysClose')) $('keysClose').onclick = () => this.toggle(false);
    onBindsChange(() => this.render());
    // volume dos efeitos (menu e painel do jogo)
    for (const id of ['sfxVol', 'sfxVolGame']) {
      const el = $(id); if (!el) continue;
      el.value = Math.round(sfxVolume() * 100);
      el.oninput = () => { setSfxVolume(Number(el.value) / 100); for (const o of ['sfxVol', 'sfxVolGame']) if ($(o)) $(o).value = el.value; };
      el.onchange = () => sfx.ui();
    }
    // captura da nova tecla (fase de captura: chega antes do jogo)
    const take = (code, e) => {
      if (!this.waiting) return;
      e.preventDefault(); e.stopPropagation();
      const { id } = this.waiting; this.waiting = null; this.G.input.capture = false;
      if (code === 'Escape') { this.render(); this.say('Troca cancelada.'); return; }
      if (RESERVED.includes(code)) { this.render(); return; }
      const swapped = setBind(id, code);
      const a = ACTIONS.find((x) => x.id === id);
      this.say(swapped.length
        ? `“${a.label}” agora é ${keyName(code)}. ${swapped.map((s) => `“${s.label}”`).join(', ')} ficou com ${keyName(binds[swapped[0].id])}.`
        : `“${a.label}” agora é ${keyName(code)}.`);
      this.render();
    };
    addEventListener('keydown', (e) => take(e.code, e), true);
    addEventListener('mousedown', (e) => { if (this.waiting && !e.target.closest('.key-btn')) take('Mouse' + e.button, e); }, true);
    addEventListener('keydown', (e) => { if (e.code === 'Escape' && this.open && !this.waiting) this.toggle(false); });
    addEventListener('contextmenu', (e) => { if (this.waiting) e.preventDefault(); }, true);
    this.render();
  }

  toggle(on) {
    this.open = on;
    $('keysPanel').hidden = !on;
    if (on && this.G.gfxMenu && this.G.gfxMenu.open) this.G.gfxMenu.toggle(false);
    if (this.G.started) this.G.input.setCursorMode(on);
    if (!on) { this.waiting = null; this.G.input.capture = false; }
    this.render();
  }

  say(text) { for (const l of this.lists) if (l.note) l.note.textContent = text; }

  render() {
    const k = (id) => `<kbd>${keyName(binds[id])}</kbd>`, hint = $('hint');
    if (hint) hint.innerHTML = `${k('help')} controles · ${k('gfx')} gráficos · ${k('fps')} FPS · ${k('zoomIn')}/${k('zoomOut')} zoom (3ª pessoa)`;
    for (const { el } of this.lists) {
      el.replaceChildren();
      for (const [cat, title] of CATS) {
        const sec = document.createElement('div'); sec.className = 'keys-sec';
        const h = document.createElement('h3'); h.textContent = title; sec.appendChild(h);
        for (const a of ACTIONS.filter((x) => x.cat === cat)) {
          const row = document.createElement('div'); row.className = 'key-row';
          const name = document.createElement('span'); name.textContent = a.label;
          const btn = document.createElement('button'); btn.type = 'button'; btn.className = 'key-btn';
          const wait = this.waiting && this.waiting.id === a.id;
          btn.classList.toggle('wait', !!wait);
          btn.textContent = wait ? 'Aperte…' : keyName(binds[a.id]);
          if (binds[a.id] !== a.def && !wait) btn.classList.add('changed');
          btn.title = 'Clique e aperte uma tecla ou botão do mouse (Esc cancela). Clique direito volta ao padrão.';
          btn.onclick = (e) => {
            e.stopPropagation();
            this.waiting = { id: a.id }; this.G.input.capture = true;
            this.say(`Aperte a nova tecla para “${a.label}” (Esc cancela).`);
            this.render();
          };
          btn.oncontextmenu = (e) => { e.preventDefault(); if (this.waiting) return; setBind(a.id, a.def); this.say(`“${a.label}” voltou para ${keyName(a.def)}.`); };
          row.append(name, btn); sec.appendChild(row);
        }
        el.appendChild(sec);
      }
    }
  }
}
