// Controles de toque (celular/tablet): joystick à esquerda, arrastar a metade direita gira a
// câmera e botões contextuais à direita. Os botões disparam os MESMOS eventos de teclado/mouse
// do computador, então nenhum sistema do jogo precisa saber que está no celular.
import { binds } from '../core/keybinds.js';

export const isTouchDevice = () =>
  (('ontouchstart' in window) || navigator.maxTouchPoints > 0) && matchMedia('(pointer: coarse)').matches;

const key = (type, code) => dispatchEvent(new KeyboardEvent(type, { code, bubbles: true }));

const ICON = {
  jump: '<svg viewBox="0 0 24 24"><path d="M12 4l7 8h-4v8H9v-8H5z"/></svg>',
  attack: '<svg viewBox="0 0 24 24"><path d="M4 20l9-9 2 2-9 9H4zm9.5-11.5l3-3 4 1-1 4-3 3z"/></svg>',
  use: '<svg viewBox="0 0 24 24"><path d="M9 11V5.5a1.5 1.5 0 0 1 3 0V10h.5V3.5a1.5 1.5 0 0 1 3 0V10h.5V5a1.5 1.5 0 0 1 3 0v9.5c0 4-2.7 7-6.5 7-2.6 0-4.3-1.2-5.6-3.3L4.2 13.6a1.4 1.4 0 0 1 2.3-1.6L9 14.8z"/></svg>',
  aim: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="7" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="2"/></svg>',
  reload: '<svg viewBox="0 0 24 24"><path d="M12 5a7 7 0 1 0 7 7h-2.5A4.5 4.5 0 1 1 12 7.5V11l5-5-5-5z"/></svg>',
  bag: '<svg viewBox="0 0 24 24"><path d="M9 6V5a3 3 0 0 1 6 0v1h3l1 15H5L6 6zm2 0h2V5a1 1 0 0 0-2 0zM9 10a3 3 0 0 0 6 0h-2a1 1 0 0 1-2 0z"/></svg>',
  drop: '<svg viewBox="0 0 24 24"><path d="M11 3h2v10l3.5-3.5L18 11l-6 6-6-6 1.5-1.5L11 13zM5 19h14v2H5z"/></svg>',
  lock: '<svg viewBox="0 0 24 24"><path d="M12 2l3 4h-2v3.1A7 7 0 0 1 19 15h3l-4 3-4-3h2a4 4 0 0 0-8 0h2l-4 3-4-3h3a7 7 0 0 1 6-5.9V6H9z"/></svg>',
  cam: '<svg viewBox="0 0 24 24"><path d="M12 5C6 5 2 12 2 12s4 7 10 7 10-7 10-7-4-7-10-7zm0 11a4 4 0 1 1 0-8 4 4 0 0 1 0 8z"/></svg>',
  gear: '<svg viewBox="0 0 24 24"><path d="M19.4 13a7.6 7.6 0 0 0 0-2l2.1-1.6-2-3.5-2.5 1a7.4 7.4 0 0 0-1.7-1L15 3h-4l-.4 2.9a7.4 7.4 0 0 0-1.7 1l-2.5-1-2 3.5L6.5 11a7.6 7.6 0 0 0 0 2l-2.1 1.6 2 3.5 2.5-1a7.4 7.4 0 0 0 1.7 1L11 21h4l.4-2.9a7.4 7.4 0 0 0 1.7-1l2.5 1 2-3.5zM13 15.5A3.5 3.5 0 1 1 13 8.5a3.5 3.5 0 0 1 0 7z"/></svg>',
  full: '<svg viewBox="0 0 24 24"><path d="M4 4h6v2H6v4H4zm10 0h6v6h-2V6h-4zM4 14h2v4h4v2H4zm14 0h2v6h-6v-2h4z"/></svg>',
};

export class TouchControls {
  constructor(G) {
    this.G = G;
    this.root = document.createElement('div');
    this.root.id = 'touch';
    this.root.innerHTML = `
      <div id="tLook"></div>
      <div id="tStick"><div id="tKnob"></div></div>
      <div class="tTop">
        <button data-act="cam" title="1ª/3ª pessoa">${ICON.cam}</button>
        <button data-act="full" title="Tela cheia">${ICON.full}</button>
        <button data-act="gfx" title="Gráficos">${ICON.gear}</button>
        <button data-act="mic" title="Segure para falar">🎙</button>
      </div>
      <div class="tSide">
        <button data-act="inv" title="Inventário">${ICON.bag}</button>
        <button data-act="drop" title="Largar a arma da mão">${ICON.drop}</button>
        <button data-act="lock" title="Travar o corpo na câmera">${ICON.lock}</button>
      </div>
      <div class="tPad">
        <button class="big" data-act="attack" title="Atacar / pegar">${ICON.attack}</button>
        <button data-act="jump" title="Pular">${ICON.jump}</button>
        <button data-act="use" title="Interagir / usar">${ICON.use}</button>
        <button data-act="aim" title="Mirar / bloquear">${ICON.aim}</button>
        <button data-act="dodge" title="Esquivar">${ICON.jump.replace('M12 4l7 8h-4v8H9v-8H5z', 'M4 12l7-7v4h9v6h-9v4z')}</button>
        <button data-act="reload" title="Recarregar">${ICON.reload}</button>
      </div>
      <div class="tCtx" id="tBuild">
        <button data-bact="place">Soltar</button><button data-bact="weld">Soldar</button>
        <button data-bact="resetPos">Mover p/ mira</button><button data-bact="assist">Encaixe</button><button data-key="Escape">Cancelar</button>
      </div>
      <div class="tCtx" id="tSail">
        <button data-bact="sailLeft">◀ Vela</button><button data-bact="sailRight">Vela ▶</button>
      </div>`;
    this.root.hidden = true; // só aparece durante a partida (não cobre o menu)
    document.body.appendChild(this.root);
    document.body.classList.add('touch');
    G.input.freeLook = true;     // sem pointer lock no celular
    // toques no canvas não viram cliques de mouse (evita ataques/tiros acidentais)
    G.input.canvas.addEventListener('touchstart', (e) => e.preventDefault(), { passive: false });
    this.stick = { id: null, ox: 0, oy: 0, x: 0, y: 0 };
    this.look = { id: null, x: 0, y: 0 };
    this.held = new Set();
    this.bind();
  }

  setKeys(down) {
    for (const [act, code] of ['forward', 'left', 'back', 'right', 'sprint'].map((a) => [a, binds[a]])) {
      const want = down.has(act), has = this.held.has(code);
      if (want && !has) { key('keydown', code); this.held.add(code); }
      if (!want && has) { key('keyup', code); this.held.delete(code); }
    }
  }

  bind() {
    const G = this.G, inp = G.input, $ = (id) => document.getElementById(id);
    const stickEl = $('tStick'), knob = $('tKnob'), lookEl = $('tLook');
    const R = 52;
    const moveStick = (t) => {
      const s = this.stick;
      let dx = t.clientX - s.ox, dy = t.clientY - s.oy;
      const len = Math.hypot(dx, dy);
      if (len > R) { dx *= R / len; dy *= R / len; }
      knob.style.transform = `translate(${dx}px, ${dy}px)`;
      const nx = dx / R, ny = dy / R, keys = new Set(), dead = 0.28;
      if (ny < -dead) keys.add('forward'); if (ny > dead) keys.add('back');
      if (nx < -dead) keys.add('left'); if (nx > dead) keys.add('right');
      if (Math.hypot(nx, ny) > 0.92 && ny < 0) keys.add('sprint'); // empurrar até o fim = correr
      this.setKeys(keys);
    };
    stickEl.addEventListener('touchstart', (e) => {
      e.preventDefault();
      const t = e.changedTouches[0], r = stickEl.getBoundingClientRect();
      Object.assign(this.stick, { id: t.identifier, ox: r.left + r.width / 2, oy: r.top + r.height / 2 });
      moveStick(t);
    }, { passive: false });
    lookEl.addEventListener('touchstart', (e) => {
      e.preventDefault();
      const t = e.changedTouches[0];
      Object.assign(this.look, { id: t.identifier, x: t.clientX, y: t.clientY });
      // no modo de rotação da construção, arrastar = girar a peça pelo gizmo
      if (inp.cursorMode) {
        inp.cursor.x = t.clientX; inp.cursor.y = t.clientY;
        if (G.build.rotating) { inp.mouse.left = inp.mouse.leftPressed = true; G.build.beginGizmoDrag(); }
      }
    }, { passive: false });
    addEventListener('touchmove', (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === this.stick.id) moveStick(t);
        else if (t.identifier === this.look.id) {
          const dx = t.clientX - this.look.x, dy = t.clientY - this.look.y;
          this.look.x = t.clientX; this.look.y = t.clientY;
          if (inp.cursorMode) { inp.cursor.dx += dx; inp.cursor.dy += dy; inp.cursor.x = t.clientX; inp.cursor.y = t.clientY; }
          else { inp.mouse.dx += dx * 1.7; inp.mouse.dy += dy * 1.7; }
        }
      }
    }, { passive: true });
    const end = (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === this.stick.id) { this.stick.id = null; knob.style.transform = ''; this.setKeys(new Set()); }
        if (t.identifier === this.look.id) { this.look.id = null; if (inp.cursorMode) inp.mouse.left = false; }
      }
    };
    addEventListener('touchend', end); addEventListener('touchcancel', end);

    const press = (el, down, up) => {
      el.addEventListener('touchstart', (e) => { e.preventDefault(); e.stopPropagation(); el.classList.add('on'); down(); }, { passive: false });
      const release = (e) => { e.preventDefault(); el.classList.remove('on'); up && up(); };
      el.addEventListener('touchend', release); el.addEventListener('touchcancel', release);
    };
    for (const el of this.root.querySelectorAll('[data-act]')) {
      const act = el.dataset.act;
      if (act === 'attack') press(el, () => {
        // mesmo comportamento do clique: pega a peça contornada de verde; senão, ataca
        if (!G.build.active) {
          const target = G.build.updatePickupTarget();
          if (target && G.build.tryPickup(target)) return;
        }
        inp.mouse.left = inp.mouse.leftPressed = true;
      }, () => { inp.mouse.left = false; });
      else if (act === 'aim') press(el, () => {
        inp.mouse.right = !inp.mouse.right; if (inp.mouse.right) inp.mouse.rightPressed = true;
        el.classList.toggle('lock', inp.mouse.right);
      });
      else if (act === 'dodge') press(el, () => key('keydown', binds.dodge), () => key('keyup', binds.dodge));
      else if (act === 'jump') press(el, () => key('keydown', binds.jump), () => key('keyup', binds.jump));
      else if (act === 'use') press(el, () => key('keydown', binds.interact), () => key('keyup', binds.interact));
      else if (act === 'reload') press(el, () => key('keydown', binds.reload), () => key('keyup', binds.reload));
      else if (act === 'inv') press(el, () => G.inventory.toggle(!G.inventory.open));
      else if (act === 'drop') press(el, () => G.inventory.quickDrop());
      else if (act === 'lock') press(el, () => { key('keydown', binds.lockCam); key('keyup', binds.lockCam); });
      else if (act === 'cam') press(el, () => { key('keydown', binds.camera); key('keyup', binds.camera); });
      else if (act === 'gfx') press(el, () => G.gfxMenu.toggle(!G.gfxMenu.open));
      else if (act === 'mic') press(el, () => { G.voice.touchTalk = true; }, () => { G.voice.touchTalk = false; });
      else if (act === 'full') press(el, () => {
        const d = document.documentElement;
        if (document.fullscreenElement) document.exitFullscreen?.();
        else (d.requestFullscreen || d.webkitRequestFullscreen)?.call(d).then?.(() => screen.orientation?.lock?.('landscape').catch(() => {})).catch?.(() => {});
      });
    }
    for (const el of this.root.querySelectorAll('[data-key]')) press(el, () => key('keydown', el.dataset.key), () => key('keyup', el.dataset.key));
    for (const el of this.root.querySelectorAll('[data-hold]')) press(el, () => key('keydown', el.dataset.hold), () => key('keyup', el.dataset.hold));
    // botões ligados a ações: usam a tecla configurada no momento
    for (const el of this.root.querySelectorAll("[data-bact]")) press(el, () => key("keydown", binds[el.dataset.bact]), () => key("keyup", binds[el.dataset.bact]));
  }

  // Mostra os botões que fazem sentido agora (construção, vela no mastro, arma de fogo).
  update() {
    const G = this.G, $ = (id) => document.getElementById(id);
    this.root.hidden = !G.started || G.interact.lootOpen || (G.gfxMenu && G.gfxMenu.open) || (G.keysMenu && G.keysMenu.open) || !!G.bench;
    if (this.root.hidden) return;
    $('tBuild').classList.toggle('show', !!G.build.active);
    const cur = G.interact.current;
    $('tSail').classList.toggle('show', !G.build.active && !!(cur && cur.mast && G.startup.departed));
    const w = G.combat.weapon;
    this.root.querySelector('[data-act="aim"]').style.display = w ? '' : 'none'; // arma branca: bloquear
    this.root.querySelector('[data-act="reload"]').style.display = w && w.ammo ? '' : 'none';
    this.root.querySelector('[data-act="use"]').classList.toggle('pulse', !!cur);
    this.root.querySelector('[data-act="lock"]').classList.toggle('lock', !!G.player.faceCam);
    this.root.querySelector('[data-act="mic"]').style.display = G.voice && G.voice.on && G.voice.settings.mic ? '' : 'none';
  }
}
