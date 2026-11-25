// Texturas procedurais (sem arquivos), geradas em canvas uma única vez e reaproveitadas.
// Ficam em tons claros/cinza: a cor do material tinge a textura (material.color × map).
// Cada textura tem um par em escala de cinza usado como bumpMap (relevo sem custo de geometria).
import * as THREE from '../three.js';
import { mulberry32 } from '../core/util.js';

const cache = new Map();
function canvas(S, H = S) { const c = document.createElement('canvas'); c.width = S; c.height = H; return [c, c.getContext('2d')]; }
function toTex(c, srgb = true) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}
function once(key, make) { if (!cache.has(key)) cache.set(key, make()); return cache.get(key); }

// Ruído de valor simples para canvas (tileável no período P).
function noiseField(r, S, P) {
  const grid = Array.from({ length: P * P }, () => r());
  const at = (x, y) => grid[((y % P + P) % P) * P + ((x % P + P) % P)];
  return (x, y) => {
    const fx = (x / S) * P, fy = (y / S) * P, ix = Math.floor(fx), iy = Math.floor(fy);
    let u = fx - ix, v = fy - iy; u = u * u * (3 - 2 * u); v = v * v * (3 - 2 * v);
    const a = at(ix, iy), b = at(ix + 1, iy), c = at(ix, iy + 1), d = at(ix + 1, iy + 1);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };
}

// ---------- tábuas ----------
function drawPlanks(g, r, S, P, bump) {
  for (let i = 0; i < S / P; i++) {
    const shade = r(), b = bump ? 190 : (195 + shade * 55) | 0;
    g.fillStyle = `rgb(${b},${b},${b})`; g.fillRect(i * P, 0, P, S);
    // emenda de topo em altura aleatória
    const cut = r() * S;
    for (let k = 0; k < 34; k++) { // veios ondulados
      const x = i * P + 3 + r() * (P - 6), a = bump ? 0.18 + r() * 0.25 : 0.05 + r() * 0.14;
      g.strokeStyle = bump ? `rgba(90,90,90,${a})` : `rgba(60,38,18,${a})`; g.lineWidth = 0.5 + r() * 1.4;
      g.beginPath(); g.moveTo(x, 0);
      const f = 0.02 + r() * 0.03, amp = 1 + r() * 2.5;
      for (let y = 0; y <= S; y += 16) g.lineTo(x + Math.sin(y * f + k) * amp, y);
      g.stroke();
    }
    if (r() < 0.7) { // nó com anéis
      const kx = i * P + 16 + r() * (P - 32), ky = r() * S;
      for (let ring = 4; ring >= 0; ring--) {
        g.fillStyle = bump ? `rgba(60,60,60,${0.18 + ring * 0.05})` : `rgba(70,42,20,${0.12 + (4 - ring) * 0.08})`;
        g.beginPath(); g.ellipse(kx, ky, 2 + ring * 1.6, 4 + ring * 3, 0, 0, Math.PI * 2); g.fill();
      }
    }
    // junta escura entre tábuas e emenda
    g.fillStyle = bump ? 'rgb(20,20,20)' : 'rgba(35,22,12,0.75)';
    g.fillRect(i * P, 0, 3, S); g.fillRect(i * P, cut, P, 2);
    // pregos
    g.fillStyle = bump ? 'rgb(255,255,255)' : 'rgba(55,55,60,0.9)';
    for (const y of [cut - 9, cut + 11]) for (const dx of [10, P - 12]) {
      g.beginPath(); g.arc(i * P + dx, (y + S) % S, 2.2, 0, Math.PI * 2); g.fill();
    }
  }
}
export function woodTexture() {
  return once('wood', () => {
    const S = 512, P = 128;
    const [c, g] = canvas(S); drawPlanks(g, mulberry32(7), S, P, false);
    return toTex(c);
  });
}
export function woodBump() {
  return once('woodBump', () => {
    const S = 512, P = 128;
    const [c, g] = canvas(S); drawPlanks(g, mulberry32(7), S, P, true);
    return toTex(c, false);
  });
}

// ---------- areia ----------
function drawSand(g, S, bump) {
  const r = mulberry32(31), n1 = noiseField(r, S, 8), n2 = noiseField(r, S, 32);
  const img = g.createImageData(S, S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const ripple = Math.sin((x + n1(x, y) * 60) * 0.09 + y * 0.025) * 0.5 + 0.5;
    const v = 0.72 + n1(x, y) * 0.18 + n2(x, y) * 0.1 + (r() - 0.5) * 0.22 + ripple * 0.06;
    const k = (y * S + x) * 4, c = bump ? (ripple * 0.6 + n2(x, y) * 0.4 + (r() - 0.5) * 0.3) * 255 : Math.min(255, v * 255);
    img.data[k] = img.data[k + 1] = img.data[k + 2] = c; img.data[k + 3] = 255;
    if (!bump && r() < 0.012) { img.data[k] *= 0.6; img.data[k + 1] *= 0.6; img.data[k + 2] *= 0.6; } // grãos escuros
  }
  g.putImageData(img, 0, 0);
}
export function sandTexture() { return once('sand', () => { const [c, g] = canvas(256); drawSand(g, 256, false); return toTex(c); }); }
export function sandBump() { return once('sandBump', () => { const [c, g] = canvas(256); drawSand(g, 256, true); return toTex(c, false); }); }

// ---------- grama ----------
export function grassTexture() {
  return once('grass', () => {
    const S = 256, [c, g] = canvas(S), r = mulberry32(53), n = noiseField(r, S, 16);
    const img = g.createImageData(S, S);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const v = 0.7 + n(x, y) * 0.3 + (r() - 0.5) * 0.25, k = (y * S + x) * 4;
      img.data[k] = v * 210; img.data[k + 1] = v * 240; img.data[k + 2] = v * 190; img.data[k + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    return toTex(c);
  });
}

// ---------- lona da vela (trama + costuras + remendos) ----------
export function clothTexture() {
  return once('cloth', () => {
    const S = 512, [c, g] = canvas(S), r = mulberry32(91);
    g.fillStyle = '#efe6d2'; g.fillRect(0, 0, S, S);
    for (let y = 0; y < S; y += 2) { g.fillStyle = `rgba(120,100,70,${0.03 + r() * 0.04})`; g.fillRect(0, y, S, 1); }
    for (let x = 0; x < S; x += 2) { g.fillStyle = `rgba(120,100,70,${0.025 + r() * 0.03})`; g.fillRect(x, 0, 1, S); }
    // faixas costuradas
    for (let x = S / 4; x < S; x += S / 4) {
      g.fillStyle = 'rgba(110,90,60,0.25)'; g.fillRect(x - 2, 0, 4, S);
      g.strokeStyle = 'rgba(90,70,45,0.6)'; g.setLineDash([5, 5]); g.lineWidth = 1;
      g.beginPath(); g.moveTo(x - 5, 0); g.lineTo(x - 5, S); g.moveTo(x + 5, 0); g.lineTo(x + 5, S); g.stroke();
    }
    g.setLineDash([]);
    // remendos
    for (let i = 0; i < 3; i++) {
      const w = 50 + r() * 60, h = 40 + r() * 50, x = r() * (S - w), y = r() * (S - h);
      g.fillStyle = ['#d8c9a6', '#c9b48c', '#e0d4bb'][i]; g.fillRect(x, y, w, h);
      g.strokeStyle = 'rgba(80,60,40,0.7)'; g.setLineDash([4, 4]); g.strokeRect(x + 3, y + 3, w - 6, h - 6); g.setLineDash([]);
    }
    // manchas de sal/sujeira
    for (let i = 0; i < 40; i++) {
      const x = r() * S, y = r() * S, rad = 8 + r() * 40, grad = g.createRadialGradient(x, y, 0, x, y, rad);
      grad.addColorStop(0, `rgba(110,90,60,${0.05 + r() * 0.08})`); grad.addColorStop(1, 'rgba(110,90,60,0)');
      g.fillStyle = grad; g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
    }
    // bainha reforçada na borda
    g.fillStyle = 'rgba(100,80,55,0.35)'; g.fillRect(0, 0, S, 10); g.fillRect(0, S - 10, S, 10); g.fillRect(0, 0, 10, S); g.fillRect(S - 10, 0, 10, S);
    const t = toTex(c); t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
    return t;
  });
}

// ---------- palha (telhado das cabanas) ----------
export function thatchTexture() {
  return once('thatch', () => {
    const S = 256, [c, g] = canvas(S), r = mulberry32(17);
    g.fillStyle = '#b39a64'; g.fillRect(0, 0, S, S);
    for (let row = 0; row < 8; row++) {
      const y0 = row * 32;
      for (let i = 0; i < 160; i++) {
        const x = r() * S, len = 22 + r() * 18, a = 0.25 + r() * 0.45;
        g.strokeStyle = r() < 0.5 ? `rgba(70,52,24,${a})` : `rgba(230,210,150,${a * 0.6})`;
        g.lineWidth = 0.8 + r() * 1.2;
        g.beginPath(); g.moveTo(x, y0); g.lineTo(x + (r() - 0.5) * 6, y0 + len); g.stroke();
      }
      g.fillStyle = 'rgba(50,35,15,0.35)'; g.fillRect(0, y0 + 30, S, 3);
    }
    return toTex(c);
  });
}

// ---------- troncos verticais (paliçada dos fortes) ----------
export function logWallTexture() {
  return once('logs', () => {
    const S = 256, P = 32, [c, g] = canvas(S), r = mulberry32(61);
    for (let i = 0; i < S / P; i++) {
      const x = i * P, grad = g.createLinearGradient(x, 0, x + P, 0);
      const b = 170 + (r() * 50) | 0;
      grad.addColorStop(0, 'rgb(60,45,30)'); grad.addColorStop(0.25, `rgb(${b},${b - 20},${b - 45})`);
      grad.addColorStop(0.6, `rgb(${b - 15},${b - 35},${b - 60})`); grad.addColorStop(1, 'rgb(50,36,24)');
      g.fillStyle = grad; g.fillRect(x, 0, P, S);
      for (let k = 0; k < 10; k++) {
        g.strokeStyle = `rgba(50,32,16,${0.15 + r() * 0.2})`; g.lineWidth = 1;
        const lx = x + 6 + r() * (P - 12);
        g.beginPath(); g.moveTo(lx, 0); g.lineTo(lx + (r() - 0.5) * 4, S); g.stroke();
      }
    }
    return toTex(c);
  });
}

// ---------- metal enferrujado ----------
export function metalTexture() {
  return once('metal', () => {
    const S = 256, [c, g] = canvas(S), r = mulberry32(83), n = noiseField(r, S, 8);
    const img = g.createImageData(S, S);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const rust = Math.max(0, n(x, y) - 0.55) * 2.2, v = 0.75 + (r() - 0.5) * 0.12 + Math.sin(x * 0.8) * 0.02, k = (y * S + x) * 4;
      img.data[k] = (v * (1 - rust) + rust * 0.62) * 255;
      img.data[k + 1] = (v * (1 - rust) + rust * 0.36) * 255;
      img.data[k + 2] = (v * (1 - rust) + rust * 0.2) * 255; img.data[k + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    return toTex(c);
  });
}

// Clona a textura com repetição própria (o canvas/imagem continua compartilhado).
export function repeated(tex, rx, ry = rx) {
  const t = tex.clone(); t.repeat.set(rx, ry); t.needsUpdate = true; return t;
}

// UVs de um BoxGeometry em escala de mundo (1 repetição = 1 m): as tábuas ficam do mesmo
// tamanho em qualquer peça e correm ao longo do comprimento (Z) nos pisos.
export function scaleBoxUVs(geo, w, h, l) {
  const uv = geo.attributes.uv, dims = [[l, h], [l, h], [w, l], [w, l], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) for (let k = 0; k < 4; k++) {
    const i = f * 4 + k;
    uv.setXY(i, uv.getX(i) * dims[f][0], uv.getY(i) * dims[f][1]);
  }
  uv.needsUpdate = true;
  return geo;
}

// Pano da vela: lona clara com painéis costurados, faixa vermelha com emblema (sol sobre ondas),
// linha de rizo com os pontinhos de amarração, reforços nos cantos e corda de borda escura.
export function sailTexture() {
  return once('sail', () => {
    const S = 512, [c, g] = canvas(S), r = mulberry32(57);
    g.fillStyle = '#f1e9d6'; g.fillRect(0, 0, S, S);
    for (let y = 0; y < S; y += 2) { g.fillStyle = `rgba(120,100,70,${0.025 + r() * 0.035})`; g.fillRect(0, y, S, 1); }
    for (let x = 0; x < S; x += 2) { g.fillStyle = `rgba(120,100,70,${0.02 + r() * 0.03})`; g.fillRect(x, 0, 1, S); }
    // painéis verticais costurados
    for (let x = S / 6; x < S - 4; x += S / 6) {
      g.fillStyle = 'rgba(110,90,60,0.18)'; g.fillRect(x - 3, 0, 6, S);
      g.strokeStyle = 'rgba(90,70,45,0.55)'; g.setLineDash([5, 4]); g.lineWidth = 1;
      g.beginPath(); g.moveTo(x - 6, 0); g.lineTo(x - 6, S); g.moveTo(x + 6, 0); g.lineTo(x + 6, S); g.stroke();
    }
    g.setLineDash([]);
    // faixa vermelha e emblema
    const by = S * 0.56;
    g.fillStyle = '#b23a2a'; g.fillRect(0, by, S, S * 0.09);
    g.fillStyle = 'rgba(255,255,255,0.12)'; g.fillRect(0, by + 4, S, 3);
    g.save(); g.translate(S / 2, S * 0.36);
    g.fillStyle = '#c7462f'; g.beginPath(); g.arc(0, 0, S * 0.12, 0, Math.PI * 2); g.fill();          // sol
    g.strokeStyle = '#c7462f'; g.lineWidth = 6;
    for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; g.beginPath(); g.moveTo(Math.cos(a) * S * 0.15, Math.sin(a) * S * 0.15); g.lineTo(Math.cos(a) * S * 0.19, Math.sin(a) * S * 0.19); g.stroke(); }
    g.strokeStyle = '#f1e9d6'; g.lineWidth = 7;                                                         // ondas cortando o sol
    for (const yy of [S * 0.03, S * 0.075]) { g.beginPath(); for (let x = -S * 0.16; x <= S * 0.16; x += 4) g.lineTo(x, yy + Math.sin(x / 14) * 5); g.stroke(); }
    g.restore();
    // linha de rizo com pontos de amarração
    const ry = S * 0.78;
    g.strokeStyle = 'rgba(90,70,45,0.6)'; g.lineWidth = 2; g.beginPath(); g.moveTo(0, ry); g.lineTo(S, ry); g.stroke();
    for (let x = S / 16; x < S; x += S / 8) { g.fillStyle = '#5a4126'; g.beginPath(); g.arc(x, ry, 4, 0, Math.PI * 2); g.fill(); g.fillRect(x - 1, ry, 2, 16); }
    // reforços nos cantos e manchas de sal
    g.fillStyle = 'rgba(200,185,150,0.85)';
    for (const [x, y, sx, sy] of [[0, 0, 1, 1], [S, 0, -1, 1], [0, S, 1, -1], [S, S, -1, -1]]) { g.beginPath(); g.moveTo(x, y); g.lineTo(x + sx * 70, y); g.lineTo(x, y + sy * 70); g.fill(); }
    for (let i = 0; i < 30; i++) {
      const x = r() * S, y = r() * S, rad = 10 + r() * 40, grad = g.createRadialGradient(x, y, 0, x, y, rad);
      grad.addColorStop(0, `rgba(110,90,60,${0.04 + r() * 0.06})`); grad.addColorStop(1, 'rgba(110,90,60,0)');
      g.fillStyle = grad; g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
    }
    // corda de borda
    g.strokeStyle = '#6b5235'; g.lineWidth = 10; g.strokeRect(5, 5, S - 10, S - 10);
    g.strokeStyle = 'rgba(255,255,255,0.15)'; g.lineWidth = 2; g.strokeRect(8, 8, S - 16, S - 16);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
    return t;
  });
}
