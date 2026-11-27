// Painel de opções gráficas (menu inicial, tecla O ou botão ⚙ no celular) e contador de FPS (F3).
import { GFX_PRESETS, GFX_LABELS, fsrModeOf } from '../core/graphics.js';
import { binds } from '../core/keybinds.js';

const $ = (id) => document.getElementById(id);

export class GfxMenu {
  constructor(G) {
    this.G = G; this.open = false;
    const gfx = G.gfx, s = gfx.settings;
    const opts = (id, map) => { $(id).replaceChildren(...Object.entries(map).map(([v, t]) => new Option(t, v))); };
    opts('gPreset', GFX_LABELS.preset); opts('gUpscaler', GFX_LABELS.upscaler); opts('gShadows', GFX_LABELS.shadows);
    opts('gDof', GFX_LABELS.dof); opts('gFsr', GFX_LABELS.fsr);
    $('gFsr').onchange = (e) => { if (e.target.value !== 'custom') gfx.setFsrMode(e.target.value); this.sync(); };
    opts('gMsaa', GFX_LABELS.msaa); opts('gReflect', GFX_LABELS.reflect); opts('gView', GFX_LABELS.view); opts('gWater', GFX_LABELS.water); opts('gPixel', GFX_LABELS.pixelCap);
    const num = (v) => (Number.isNaN(Number(v)) ? v : Number(v));
    $('gPreset').onchange = (e) => { if (e.target.value in GFX_PRESETS) gfx.setPreset(e.target.value); this.sync(); };
    const bind = (id, key, conv = num) => { $(id).onchange = (e) => { gfx.set(key, conv(e.target.type === 'checkbox' ? e.target.checked : e.target.value)); this.sync(); }; };
    bind('gUpscaler', 'upscaler', String); bind('gShadows', 'shadows', String); bind('gMsaa', 'msaa'); bind('gView', 'view');
    bind('gWater', 'water', String); bind('gPixel', 'pixelCap'); bind('gBloom', 'bloom', Boolean); bind('gGrade', 'grade', Boolean);
    bind('gFps', 'showFps', Boolean); bind('gAutoRes', 'autoRes', Boolean);
    bind('gReflect', 'reflect', String); bind('gWetRaft', 'wetRaft', Boolean);
    bind('gDof', 'dof', String); bind('gMotion', 'motion', Boolean); bind('gBob', 'bob', Boolean);
    bind('gWet', 'wet', Boolean); bind('gLowHp', 'lowHp', Boolean); bind('gGrain', 'grain', Boolean);
    $('gShake').oninput = (e) => { gfx.set('shake', Number(e.target.value) / 100); this.sync(); };
    $('gScale').oninput = (e) => { gfx.set('scale', Number(e.target.value) / 100); this.sync(); };
    // nitidez: 0 (suave) … 100 (máxima) ↔ RCAS em stops 2 … 0
    $('gSharp').oninput = (e) => { gfx.set('sharpness', 2 - Number(e.target.value) / 50); this.sync(); };
    $('gfxClose').onclick = () => this.toggle(false);
    $('btnGfx').onclick = () => this.toggle(true);
    addEventListener('keydown', (e) => {
      if (e.code === binds.fps) { e.preventDefault(); gfx.set('showFps', !gfx.settings.showFps); this.sync(); }
      if (e.code === binds.gfx && G.started && !G.build.active && !G.interact.lootOpen && !(G.tools && G.tools.menuOpen)) this.toggle(!this.open);
      if (e.code === 'Escape' && this.open) this.toggle(false);
    });
    this.sync();
    void s;
  }

  toggle(on) {
    this.open = on;
    $('gfxPanel').hidden = !on;
    if (this.G.started) this.G.input.setCursorMode(on);
    this.sync();
  }

  sync() {
    const s = this.G.gfx.settings, g = this.G.gfx;
    $('gPreset').value = s.preset; $('gUpscaler').value = s.upscaler; $('gShadows').value = s.shadows;
    $('gMsaa').value = String(s.msaa); $('gView').value = String(s.view); $('gWater').value = s.water; $('gPixel').value = String(s.pixelCap);
    $('gReflect').value = s.reflect; $('gWetRaft').checked = s.wetRaft !== false;
    $('gBloom').checked = s.bloom; $('gGrade').checked = s.grade; $('gFps').checked = s.showFps; $('gAutoRes').checked = s.autoRes !== false;
    $('gDof').value = s.dof; $('gMotion').checked = s.motion; $('gBob').checked = s.bob;
    $('gWet').checked = s.wet; $('gLowHp').checked = s.lowHp; $('gGrain').checked = s.grain;
    $('gShake').value = Math.round(s.shake * 100); $('gShakeVal').textContent = s.shake > 0 ? `${Math.round(s.shake * 100)}%` : 'desligado';
    $('gFsr').value = fsrModeOf(s.scale);
    $('gScale').value = Math.round(s.scale * 100);
    $('gScaleVal').textContent = `${Math.round(s.scale * 100)}% · ${g.inSize.x}×${g.inSize.y} → ${g.outSize.x}×${g.outSize.y}`;
    $('gSharp').value = Math.round((2 - s.sharpness) * 50);
    $('gSharpVal').textContent = `${Math.round((2 - s.sharpness) * 50)}%`;
    $('gSharp').disabled = s.upscaler !== 'fsr';
  }

  update() {
    const g = this.G.gfx, s = g.settings, el = $('fps');
    el.hidden = !s.showFps;
    if (!s.showFps) return;
    const f = g.fps, cls = f.value >= 55 ? 'good' : f.value >= 30 ? 'ok' : 'bad';
    const text = `<b class="${cls}">${f.value}</b> FPS · ${f.ms.toFixed(1)} ms<br><span>${g.inSize.x}×${g.inSize.y} → ${g.outSize.x}×${g.outSize.y}` +
      `${s.upscaler === 'fsr' && g.scaleNow < 1 ? ' · FSR' : ''}${g.dyn < 0.999 ? ' · auto' : ''}</span>`;
    if (text !== this._t) { el.innerHTML = text; this._t = text; }
  }
}
