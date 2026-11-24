// Sons do jogo sintetizados na hora (WebAudio, sem arquivos): combate corpo a corpo, tiros por tipo
// de arma, recarga, canhão, explosões, água, passos, trovão, caixotes, itens, morteiro e o ambiente
// (mar e vento, que aumenta na tempestade). Posicionais simples: volume cai com a distância.
let ctx = null, out = null, noiseBuf = null, volume = 1;
try { const v = parseFloat(localStorage.getItem('jangatec-sfx')); if (Number.isFinite(v)) volume = v; } catch { /* ok */ }
export function setSfxVolume(v) { volume = v; try { localStorage.setItem('jangatec-sfx', String(v)); } catch { /* ok */ } if (out) out.gain.value = 0.5 * v; }
export const sfxVolume = () => volume;
function ac() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    out = ctx.createGain(); out.gain.value = 0.5 * volume;
    const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -14;
    out.connect(comp); comp.connect(ctx.destination);
    loadSamples();
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}
// Sons gravados (arquivos em public/sounds). Carregam quando o áudio liga; até lá usa o sintetizado.
const SAMPLE_URLS = { sniper: './sounds/sniper.mp3', pistolReload: './sounds/pistol-reload.mp3' };
const samples = {};
function loadSamples() {
  for (const [k, url] of Object.entries(SAMPLE_URLS)) {
    fetch(url).then((r) => r.arrayBuffer()).then((data) => ctx.decodeAudioData(data))
      .then((buf) => { samples[k] = buf; }).catch(() => { /* sem arquivo: fica o sintetizado */ });
  }
}
function playSample(name, dest, rate = 1) {
  const buf = samples[name]; if (!buf) return false;
  const s = ctx.createBufferSource(); s.buffer = buf; s.playbackRate.value = rate;
  s.connect(dest); s.start();
  return true;
}
const env = (g, t, a, peak, dec) => { g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + dec); };
function noise(t, dur, type, f0, f1, q, peak, dest) {
  const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.playbackRate.value = 0.8 + Math.random() * 0.4;
  const f = ctx.createBiquadFilter(); f.type = type; f.Q.value = q;
  f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(f1, t + dur);
  const g = ctx.createGain(); env(g, t, Math.min(0.02, dur * 0.3), peak, dur);
  s.connect(f); f.connect(g); g.connect(dest); s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.05);
}
function tone(t, freq, dur, peak, dest, type = 'sine', bend = 1) {
  const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t);
  if (bend !== 1) o.frequency.exponentialRampToValueAtTime(freq * bend, t + dur);
  const g = ctx.createGain(); env(g, t, 0.003, peak, dur);
  o.connect(g); g.connect(dest); o.start(t); o.stop(t + dur + 0.05);
}
// volume pela distância até a câmera
let listener = null;
export function setListener(obj) { listener = obj; }
function bus(pos, vol = 1, range = 40) {
  if (!ac() || volume <= 0) return null;
  let v = vol;
  if (pos && listener) { const d = listener.position.distanceTo(pos); v *= Math.max(0, 1 - d / range) ** 1.5; }
  if (v < 0.02) return null;
  const g = ctx.createGain(); g.gain.value = v; g.connect(out);
  return g;
}

// metal com metal: parciais inarmônicos com decaimento + estalo de ruído
function metal(pos, base, vol, ring) {
  const b = bus(pos, vol); if (!b) return;
  const t = ctx.currentTime, f = base * (0.94 + Math.random() * 0.12);
  for (const [m, a] of [[1, 0.35], [2.76, 0.22], [5.4, 0.14], [8.93, 0.08]]) tone(t, f * m, ring * (1.2 - m * 0.08), a, b, 'sine', 0.995);
  noise(t, 0.08, 'highpass', 3000, 6000, 0.7, 0.5, b);
  noise(t, 0.05, 'bandpass', 1800, 900, 1.5, 0.35, b);
}
export const sfx = {
  swing(pos, heavy = false) { // corte no ar
    const b = bus(pos, heavy ? 0.55 : 0.4); if (!b) return;
    const t = ctx.currentTime, d = heavy ? 0.32 : 0.2;
    noise(t, d, 'bandpass', heavy ? 500 : 900, heavy ? 2200 : 3600, 2.2, 0.7, b);
  },
  clash(pos) { metal(pos, 920, 0.9, 0.9); },          // espada com espada
  parry(pos) { metal(pos, 1300, 1, 1.4); tone(ctx.currentTime, 2600, 0.6, 0.06, bus(pos, 1) || out); },
  block(pos) { metal(pos, 640, 0.7, 0.35); },
  hit(pos, heavy = false) { // lâmina na carne / pancada
    const b = bus(pos, heavy ? 0.9 : 0.65); if (!b) return;
    const t = ctx.currentTime;
    tone(t, heavy ? 95 : 130, heavy ? 0.22 : 0.14, 0.7, b, 'sine', 0.5);
    noise(t, heavy ? 0.16 : 0.1, 'lowpass', 2400, 500, 0.8, 0.55, b);
  },
  kick(pos) { // chute: baque surdo
    const b = bus(pos, 0.8); if (!b) return;
    const t = ctx.currentTime;
    tone(t, 75, 0.2, 0.9, b, 'sine', 0.55); noise(t, 0.09, 'lowpass', 900, 200, 0.7, 0.6, b);
  },
  guardBreak(pos) { // guarda quebrando: pancada + metal desafinando
    const b = bus(pos, 1); if (!b) return;
    const t = ctx.currentTime;
    tone(t, 70, 0.3, 0.8, b, 'sine', 0.5);
    tone(t, 520, 0.45, 0.18, b, 'sawtooth', 0.55);
    noise(t, 0.2, 'bandpass', 1500, 400, 1.2, 0.6, b);
  },
  whiff(pos) { const b = bus(pos, 0.25); if (!b) return; noise(ctx.currentTime, 0.14, 'bandpass', 1400, 2600, 3, 0.5, b); },
  // ---------- armas de fogo ----------
  gun(pos, kind = 'pistol') {
    const big = { pistol: 0.75, revolver: 0.95, rifle: 0.9, shotgun: 1.15, sniper: 1.25 }[kind] || 0.8;
    const b = bus(pos, big, 120); if (!b) return;
    if (kind === 'sniper' && playSample('sniper', b, 0.97 + Math.random() * 0.06)) return; // tiro gravado (já tem eco)
    const t = ctx.currentTime;
    noise(t, 0.05, 'highpass', 2500, 1200, 0.7, 0.9, b);                     // estalo
    noise(t, 0.12 + big * 0.18, 'lowpass', 4200 * big, 260, 0.8, 0.9, b);   // corpo do tiro
    tone(t, kind === 'shotgun' ? 70 : 105, 0.16 + big * 0.1, 0.8, b, 'sine', 0.45); // pancada grave
    // cauda (eco do mar/ilha)
    const d = ctx.createDelay(); d.delayTime.value = 0.09 + big * 0.05; const fb = ctx.createGain(); fb.gain.value = 0.32;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1400;
    const g = ctx.createGain(); g.gain.value = 0.4; b.connect(d); d.connect(lp); lp.connect(fb); fb.connect(d); lp.connect(g); g.connect(out);
    setTimeout(() => { try { b.disconnect(d); } catch { /* ok */ } }, 1600);
  },
  dry() { const b = bus(null, 0.5); if (!b) return; tone(ctx.currentTime, 2400, 0.03, 0.4, b, 'square', 0.6); },
  click(pos, f = 1) { // pecinhas de metal da recarga (sai, entra, trava)
    const b = bus(pos, 0.55); if (!b) return; const t = ctx.currentTime;
    noise(t, 0.035, 'bandpass', 3200 * f, 2200 * f, 3, 0.8, b); tone(t, 1300 * f, 0.05, 0.25, b, 'triangle', 0.7);
  },
  // recarga gravada (tira o carregador, põe o novo, puxa o ferrolho); false = arquivo não carregou
  reload(pos, kind) {
    if (kind !== 'pistola') return false;
    const b = bus(pos, 0.8); if (!b) return true;
    return playSample('pistolReload', b);
  },
  bolt(pos) { const t0 = ctx && ctx.currentTime; this.click(pos, 0.8); setTimeout(() => this.click(pos, 1.1), 180); void t0; },
  shell(pos) { this.click(pos, 0.6); setTimeout(() => this.click(pos, 0.9), 90); },
  casing(pos) { // cápsula caindo
    const b = bus(pos, 0.2); if (!b) return; const t = ctx.currentTime;
    for (let i = 0; i < 3; i++) tone(t + i * 0.07 + Math.random() * 0.02, 4200 + Math.random() * 900, 0.05, 0.12 / (i + 1), b, 'sine', 0.98);
  },
  // ---------- canhão, morteiro e explosões ----------
  cannon(pos) {
    const b = bus(pos, 1.3, 160); if (!b) return; const t = ctx.currentTime;
    tone(t, 55, 0.7, 1, b, 'sine', 0.5); noise(t, 0.9, 'lowpass', 1800, 120, 0.7, 1, b); noise(t, 0.06, 'highpass', 2000, 900, 0.7, 0.7, b);
  },
  explosion(pos, size = 1) {
    const b = bus(pos, 1.2 * size, 180); if (!b) return; const t = ctx.currentTime;
    tone(t, 48, 1.1, 1, b, 'sine', 0.45); noise(t, 1.4 * size, 'lowpass', 2400, 90, 0.6, 1, b);
    noise(t + 0.05, 0.6, 'bandpass', 900, 300, 1, 0.5, b); // estilhaços
  },
  whistle(pos, dur = 1.6) { // projétil do morteiro caindo
    const b = bus(pos, 0.35, 90); if (!b) return; const t = ctx.currentTime;
    const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(1700, t); o.frequency.exponentialRampToValueAtTime(420, t + dur);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.35, t + dur * 0.8); g.gain.linearRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(b); o.start(t); o.stop(t + dur + 0.05);
  },
  mortar(pos) { const b = bus(pos, 1, 150); if (!b) return; const t = ctx.currentTime; tone(t, 90, 0.4, 1, b, 'sine', 0.5); noise(t, 0.35, 'lowpass', 900, 150, 0.8, 0.8, b); },
  collapse(pos) { // torre de sucata desabando: metal rangendo + pancadas
    const b = bus(pos, 1.2, 200); if (!b) return; const t = ctx.currentTime;
    tone(t, 160, 1.4, 0.3, b, 'sawtooth', 0.4);
    for (let i = 0; i < 7; i++) { const tt = t + 0.25 + i * 0.22 + Math.random() * 0.1; tone(tt, 60 + Math.random() * 40, 0.4, 0.7, b, 'sine', 0.5); noise(tt, 0.3, 'bandpass', 700 + Math.random() * 900, 300, 1.5, 0.6, b); }
  },
  metalHit(pos) { metal(pos, 420, 0.8, 0.5); },
  // ---------- água e mundo ----------
  splash(pos, big = false) {
    const b = bus(pos, big ? 0.9 : 0.45, 70); if (!b) return; const t = ctx.currentTime;
    noise(t, big ? 0.9 : 0.35, 'bandpass', 1800, 500, 0.9, 0.9, b); noise(t, big ? 0.5 : 0.2, 'lowpass', 600, 150, 0.7, 0.6, b);
  },
  step(surface = 'sand', run = false) {
    const b = bus(null, run ? 0.16 : 0.11); if (!b) return; const t = ctx.currentTime;
    if (surface === 'wood') { tone(t, 140 + Math.random() * 30, 0.08, 0.6, b, 'sine', 0.7); noise(t, 0.05, 'bandpass', 900, 600, 2, 0.4, b); }
    else if (surface === 'metal') { metal(null, 300 + Math.random() * 80, 0.16, 0.15); }
    else if (surface === 'water') noise(t, 0.18, 'bandpass', 1200, 500, 1, 0.6, b);
    else noise(t, 0.09, 'bandpass', surface === 'grass' ? 2600 : 1500, 800, 1.2, 0.7, b);
  },
  land(heavy = 0.5) { const b = bus(null, 0.25 + heavy * 0.4); if (!b) return; const t = ctx.currentTime; tone(t, 80, 0.15, 0.7, b, 'sine', 0.6); noise(t, 0.12, 'lowpass', 900, 200, 0.8, 0.6, b); },
  thunder(delay = 0.4, near = 0.6) {
    if (!ac()) return; const b = bus(null, 0.6 + near * 0.6); if (!b) return; const t = ctx.currentTime + delay;
    noise(t, 0.12, 'highpass', 1500, 600, 0.7, near * 0.8, b);
    noise(t + 0.05, 2.8, 'lowpass', 500, 60, 0.6, 1, b); tone(t + 0.05, 42, 2.2, 0.6, b, 'sine', 0.7);
  },
  crate() { const b = bus(null, 0.45); if (!b) return; const t = ctx.currentTime; tone(t, 220, 0.4, 0.25, b, 'sawtooth', 1.6); noise(t, 0.25, 'bandpass', 700, 1100, 3, 0.5, b); tone(t + 0.3, 110, 0.12, 0.5, b, 'sine', 0.6); },
  pickup() { const b = bus(null, 0.35); if (!b) return; const t = ctx.currentTime; tone(t, 880, 0.12, 0.35, b, 'triangle'); tone(t + 0.08, 1320, 0.2, 0.3, b, 'triangle'); },
  hammer(pos) { const b = bus(pos, 0.6); if (!b) return; const t = ctx.currentTime; tone(t, 180, 0.1, 0.8, b, 'square', 0.5); noise(t, 0.08, 'bandpass', 1200, 700, 2, 0.6, b); },
  hurt() { const b = bus(null, 0.5); if (!b) return; const t = ctx.currentTime; tone(t, 120, 0.18, 0.7, b, 'sine', 0.6); noise(t, 0.08, 'lowpass', 1200, 300, 0.8, 0.5, b); },
  enemyDown(pos) { const b = bus(pos, 0.6); if (!b) return; const t = ctx.currentTime; tone(t, 300, 0.35, 0.3, b, 'triangle', 0.35); noise(t + 0.1, 0.25, 'lowpass', 1500, 200, 0.7, 0.5, b); },
  hookThrow(pos) { const b = bus(pos, 0.5); if (!b) return; noise(ctx.currentTime, 0.35, 'bandpass', 600, 2400, 2.5, 0.6, b); },
  hookHit(pos) { metal(pos, 760, 0.6, 0.3); },
  winch(pos, dur = 0.8) { // catraca do guincho puxando
    const b = bus(pos, 0.35); if (!b) return; const t = ctx.currentTime;
    for (let i = 0; i < dur / 0.06; i++) noise(t + i * 0.06, 0.02, 'bandpass', 2600, 2000, 4, 0.5, b);
  },
  ui() { const b = bus(null, 0.25); if (!b) return; tone(ctx.currentTime, 660, 0.06, 0.3, b, 'triangle'); },
};

// ---------- ambiente: mar (ondas) e vento; a tempestade aumenta tudo ----------
let amb = null;
export function ambience(strength = 0, sea = 1) {
  if (!ac() || volume <= 0) return;
  if (!amb) {
    const mk = (type, f, q) => {
      const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
      const fl = ctx.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q;
      const g = ctx.createGain(); g.gain.value = 0; s.connect(fl); fl.connect(g); g.connect(out); s.start();
      return { fl, g };
    };
    amb = { sea: mk('lowpass', 420, 0.6), wind: mk('bandpass', 700, 0.8), t: 0 };
  }
  amb.t += 0.016;
  const surge = 0.6 + 0.4 * Math.sin(amb.t * 0.7) * Math.sin(amb.t * 0.23 + 1); // ondas indo e vindo
  const now = ctx.currentTime;
  amb.sea.g.gain.setTargetAtTime((0.05 + 0.06 * strength) * sea * surge, now, 0.3);
  amb.sea.fl.frequency.setTargetAtTime(320 + 300 * surge + 400 * strength, now, 0.3);
  amb.wind.g.gain.setTargetAtTime(0.012 + 0.07 * strength, now, 0.5);
  amb.wind.fl.frequency.setTargetAtTime(500 + 500 * Math.sin(amb.t * 0.31) ** 2 + 600 * strength, now, 0.5);
}
