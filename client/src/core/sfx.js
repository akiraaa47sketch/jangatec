// Sons de combate sintetizados na hora (WebAudio, sem arquivos): espadas se chocando, cortes no ar,
// pancadas, chutes, parry e guarda quebrando. Posicionais simples: volume cai com a distância.
let ctx = null, out = null, noiseBuf = null;
function ac() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    out = ctx.createGain(); out.gain.value = 0.5;
    const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -14;
    out.connect(comp); comp.connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
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
function bus(pos, vol = 1) {
  if (!ac()) return null;
  let v = vol;
  if (pos && listener) { const d = listener.position.distanceTo(pos); v *= Math.max(0, 1 - d / 40) ** 1.5; }
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
};
