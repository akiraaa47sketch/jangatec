export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const lerp = (a, b, t) => a + (b - a) * t;

// Rotação em Y (mesma convenção do Three: local -> mundo com +ângulo).
export function rot(x, z, a) {
  const c = Math.cos(a), s = Math.sin(a);
  return [x * c + z * s, -x * s + z * c];
}
export function lerpAngle(a, b, t) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

// RNG determinístico (seed).
export function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function hash2(seed, x, y) {
  let h = seed ^ Math.imul(x, 374761393) ^ Math.imul(y, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (h ^ (h >>> 16)) >>> 0;
}

// Relógio comum a todos os clientes (ondas, maré, eventos). Online ele é acertado pelo relógio do
// servidor (Net mede a diferença): antes cada um usava o relógio do próprio PC, e um PC com o
// relógio 2 s adiantado via as ondas e a onda gigante em outro lugar — a jangada parecia
// fora de sincronia com o mar.
let clockOffsetMs = 0;
export function setClockOffset(ms) { clockOffsetMs = Number.isFinite(ms) ? ms : 0; }
export const serverNow = () => Date.now() + clockOffsetMs; // hora do servidor em ms
export const clock = () => ((Date.now() + clockOffsetMs) / 1000) % 100000;
