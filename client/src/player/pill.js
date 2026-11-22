// Personagem "Pílula": modelo procedural personalizável (cápsula, rostos, luvas, calçados e
// chapéus) + animação própria. Altura do modelo ≈ 3,24 unidades; o jogo escala para ~1,75 m.
import * as THREE from '../three.js';
import { attachRealHands, animateRealHands } from './pillhands.js';

// ---------- opções de personalização ----------
const C = (nome, hex) => ({ nome, hex });
export const PILL_COLORS = [
  C('Vermelho', 0xd3202b), C('Azul', 0x2d6cdf), C('Verde', 0x2e9e4f), C('Amarelo', 0xf2c230),
  C('Roxo', 0x7b3fc4), C('Laranja', 0xf07a22), C('Rosa', 0xee5f9e), C('Preto', 0x2a2a2e),
  C('Branco', 0xf4f1ea), C('Marrom', 0x7a4a2a), C('Turquesa', 0x1fb5b0), C('Dourado', 0xc9a03a),
];
export const PILL_BASE_COLORS = [
  C('Creme', 0xefe6da), C('Branco', 0xfafafa), C('Cinza', 0xa9adb3), C('Amarelo', 0xf6e7a1),
  C('Azul-claro', 0xbfe1f5), C('Rosa-claro', 0xf6cfd9), C('Verde-claro', 0xcdeccf), C('Grafite', 0x45454c),
];
export const PILL_FACES = [
  { id: 'tedio', nome: 'Entediado' }, { id: 'feliz', nome: 'Feliz' }, { id: 'bravo', nome: 'Bravo' },
  { id: 'surpreso', nome: 'Surpreso' }, { id: 'sono', nome: 'Com sono' }, { id: 'piscada', nome: 'Piscando' },
  { id: 'oculos', nome: 'Óculos escuros' },
];
export const PILL_BOOTS = [
  { id: 'tenis', nome: 'Tênis' }, { id: 'botas', nome: 'Botas' }, { id: 'galochas', nome: 'Galochas' },
  { id: 'nadadeiras', nome: 'Nadadeiras' }, { id: 'chinelo', nome: 'Chinelo' },
];
export const PILL_HATS = [
  { id: 'nenhum', nome: 'Nenhum' }, { id: 'pirata', nome: 'Pirata' }, { id: 'palha', nome: 'Palha' },
  { id: 'bone', nome: 'Boné' }, { id: 'cartola', nome: 'Cartola' }, { id: 'capitao', nome: 'Capitão' },
  { id: 'coroa', nome: 'Coroa' }, { id: 'gorro', nome: 'Gorro' },
];
export const PILL_DEFAULT = { cap: 0, base: 0, gloves: 0, face: 'tedio', boots: 'tenis', bootColor: 0, hat: 'nenhum', hatColor: 1 };

// Garante índices/ids válidos (aparência vinda da rede ou do localStorage).
export function sanitizePill(o = {}) {
  const idx = (v, list, d) => (Number.isInteger(v) && v >= 0 && v < list.length ? v : d);
  const id = (v, list, d) => (list.some((x) => x.id === v) ? v : d);
  return {
    cap: idx(o.cap, PILL_COLORS, PILL_DEFAULT.cap), base: idx(o.base, PILL_BASE_COLORS, PILL_DEFAULT.base),
    gloves: idx(o.gloves, PILL_COLORS, PILL_DEFAULT.gloves), face: id(o.face, PILL_FACES, PILL_DEFAULT.face),
    boots: id(o.boots, PILL_BOOTS, PILL_DEFAULT.boots), bootColor: idx(o.bootColor, PILL_COLORS, PILL_DEFAULT.bootColor),
    hat: id(o.hat, PILL_HATS, PILL_DEFAULT.hat), hatColor: idx(o.hatColor, PILL_COLORS, PILL_DEFAULT.hatColor),
  };
}
export function randomPill() {
  const pick = (n) => Math.floor(Math.random() * n), pickId = (l) => l[pick(l.length)].id;
  return {
    cap: pick(PILL_COLORS.length), base: pick(PILL_BASE_COLORS.length), gloves: pick(PILL_COLORS.length),
    face: pickId(PILL_FACES), boots: pickId(PILL_BOOTS), bootColor: pick(PILL_COLORS.length),
    hat: pickId(PILL_HATS), hatColor: pick(PILL_COLORS.length),
  };
}
// Código curto para a rede: "cap.base.gloves.face.boots.bootColor.hat.hatColor"
export function encodePill(o) {
  const p = sanitizePill(o);
  return [p.cap, p.base, p.gloves, PILL_FACES.findIndex((f) => f.id === p.face), PILL_BOOTS.findIndex((b) => b.id === p.boots),
    p.bootColor, PILL_HATS.findIndex((h) => h.id === p.hat), p.hatColor].join('.');
}
export function decodePill(code) {
  const n = String(code || '').split('.').map((v) => parseInt(v, 10));
  return sanitizePill({
    cap: n[0], base: n[1], gloves: n[2], face: PILL_FACES[n[3]]?.id, boots: PILL_BOOTS[n[4]]?.id,
    bootColor: n[5], hat: PILL_HATS[n[6]]?.id, hatColor: n[7],
  });
}

// ---------- materiais ----------
const plastic = (color, map = null) => new THREE.MeshPhysicalMaterial({
  color, map, roughness: 0.38, clearcoat: 0.6, clearcoatRoughness: 0.35,
});
const matte = (color, roughness = 0.8) => new THREE.MeshStandardMaterial({ color, roughness });
const hex = (h) => '#' + h.toString(16).padStart(6, '0');

// ---------- rostos (desenhados na faixa logo abaixo da emenda) ----------
// px = pixels por metro; cx = frente; top = linha da emenda no canvas.
const FACE_DRAW = {
  tedio(g, cx, top, px) {
    for (const s of [-1, 1]) lidEye(g, cx + s * 0.2 * px, top, 0.175 * px, 0.17 * px, -0.22);
    mouthLine(g, cx, top + 0.24 * px, 0.08 * px);
  },
  feliz(g, cx, top, px) {
    for (const s of [-1, 1]) roundEye(g, cx + s * 0.19 * px, top + 0.13 * px, 0.1 * px, 0.12 * px, 0, 0.05);
    g.strokeStyle = '#151515'; g.lineWidth = 6; g.lineCap = 'round';
    g.beginPath(); g.arc(cx, top + 0.22 * px, 0.09 * px, 0.15 * Math.PI, 0.85 * Math.PI); g.stroke();
    blush(g, cx, top + 0.24 * px, px);
  },
  bravo(g, cx, top, px) {
    for (const s of [-1, 1]) {
      const ex = cx + s * 0.19 * px;
      roundEye(g, ex, top + 0.15 * px, 0.11 * px, 0.1 * px, 0, 0.1);
      g.fillStyle = hex(0x151515); g.beginPath(); // sobrancelha inclinada para dentro
      g.moveTo(ex - s * 0.15 * px, top + 0.02 * px); g.lineTo(ex + s * 0.13 * px, top + 0.11 * px);
      g.lineTo(ex + s * 0.13 * px, top + 0.15 * px); g.lineTo(ex - s * 0.15 * px, top + 0.06 * px); g.fill();
    }
    g.strokeStyle = '#151515'; g.lineWidth = 6; g.lineCap = 'round';
    g.beginPath(); g.arc(cx, top + 0.36 * px, 0.08 * px, 1.2 * Math.PI, 1.8 * Math.PI); g.stroke();
  },
  surpreso(g, cx, top, px) {
    for (const s of [-1, 1]) roundEye(g, cx + s * 0.19 * px, top + 0.14 * px, 0.12 * px, 0.14 * px, 0, 0, 0.3);
    g.fillStyle = '#151515'; g.beginPath(); g.ellipse(cx, top + 0.33 * px, 0.035 * px, 0.05 * px, 0, 0, Math.PI * 2); g.fill();
  },
  sono(g, cx, top, px) {
    g.strokeStyle = '#151515'; g.lineWidth = 7; g.lineCap = 'round';
    for (const s of [-1, 1]) { g.beginPath(); g.arc(cx + s * 0.19 * px, top + 0.08 * px, 0.1 * px, 0.15 * Math.PI, 0.85 * Math.PI); g.stroke(); }
    mouthLine(g, cx, top + 0.26 * px, 0.05 * px);
    g.fillStyle = '#151515'; g.font = `bold ${Math.round(0.11 * px)}px sans-serif`; g.fillText('z', cx + 0.3 * px, top + 0.1 * px);
  },
  piscada(g, cx, top, px) {
    roundEye(g, cx - 0.19 * px, top + 0.13 * px, 0.1 * px, 0.12 * px, 0.02, 0.03);
    g.strokeStyle = '#151515'; g.lineWidth = 7; g.lineCap = 'round';
    g.beginPath(); g.moveTo(cx + 0.1 * px, top + 0.14 * px); g.lineTo(cx + 0.19 * px, top + 0.09 * px); g.lineTo(cx + 0.28 * px, top + 0.14 * px); g.stroke();
    g.beginPath(); g.arc(cx + 0.02 * px, top + 0.2 * px, 0.08 * px, 0.1 * Math.PI, 0.7 * Math.PI); g.stroke();
  },
  // ---- rostos dos inimigos ----
  malvado(g, cx, top, px) {
    for (const sd of [-1, 1]) {
      const ex = cx + sd * 0.19 * px;
      roundEye(g, ex, top + 0.15 * px, 0.11 * px, 0.08 * px, -sd * 0.01, 0.02, 0.45);
      g.fillStyle = '#d4141f'; g.beginPath(); g.ellipse(ex - sd * 0.02 * px, top + 0.16 * px, 0.045 * px, 0.045 * px, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#111'; g.beginPath(); // sobrancelha em V
      g.moveTo(ex - sd * 0.17 * px, top + 0.0 * px); g.lineTo(ex + sd * 0.14 * px, top + 0.12 * px);
      g.lineTo(ex + sd * 0.14 * px, top + 0.17 * px); g.lineTo(ex - sd * 0.17 * px, top + 0.06 * px); g.fill();
    }
    evilGrin(g, cx, top + 0.3 * px, px);
  },
  louco(g, cx, top, px) {
    roundEye(g, cx - 0.19 * px, top + 0.15 * px, 0.13 * px, 0.14 * px, 0.02, -0.02, 0.22);
    roundEye(g, cx + 0.19 * px, top + 0.15 * px, 0.08 * px, 0.08 * px, -0.01, 0.01, 0.4);
    for (const e of [[-0.19, 0.022], [0.19, 0.014]]) { g.fillStyle = '#d4141f'; g.beginPath(); g.arc(cx + e[0] * px, top + 0.15 * px, e[1] * px, 0, Math.PI * 2); g.fill(); }
    evilGrin(g, cx, top + 0.33 * px, px, 0.14);
  },
  pirata(g, cx, top, px) {
    roundEye(g, cx + 0.19 * px, top + 0.15 * px, 0.1 * px, 0.08 * px, -0.01, 0.02, 0.45);
    g.fillStyle = '#d4141f'; g.beginPath(); g.arc(cx + 0.18 * px, top + 0.16 * px, 0.04 * px, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#111'; g.beginPath(); g.ellipse(cx - 0.19 * px, top + 0.15 * px, 0.12 * px, 0.1 * px, 0, 0, Math.PI * 2); g.fill(); // tapa-olho
    g.fillRect(cx - 0.5 * px, top + 0.02 * px, px, 0.025 * px);                                                              // tira
    g.fillRect(cx + 0.07 * px, top + 0.02 * px, 0.24 * px, 0.035 * px);
    evilGrin(g, cx, top + 0.3 * px, px, 0.1, true);
  },
  oculos(g, cx, top, px) {
    g.fillStyle = '#121212';
    for (const s of [-1, 1]) {
      g.beginPath(); g.moveTo(cx + s * 0.05 * px, top + 0.05 * px); g.lineTo(cx + s * 0.34 * px, top + 0.05 * px);
      g.quadraticCurveTo(cx + s * 0.33 * px, top + 0.22 * px, cx + s * 0.19 * px, top + 0.22 * px);
      g.quadraticCurveTo(cx + s * 0.06 * px, top + 0.2 * px, cx + s * 0.05 * px, top + 0.05 * px); g.fill();
      g.fillStyle = 'rgba(255,255,255,0.55)'; g.fillRect(cx + s * 0.27 * px - 6, top + 0.08 * px, 10, 5); g.fillStyle = '#121212';
    }
    g.fillRect(cx - 0.36 * px, top + 0.05 * px, 0.72 * px, 8);
    g.strokeStyle = '#151515'; g.lineWidth = 6; g.lineCap = 'round';
    g.beginPath(); g.moveTo(cx - 0.06 * px, top + 0.33 * px); g.quadraticCurveTo(cx + 0.03 * px, top + 0.35 * px, cx + 0.09 * px, top + 0.29 * px); g.stroke();
  },
};
function lidEye(g, ex, top, ew, eh, look) {
  g.fillStyle = '#fbfaf6'; g.strokeStyle = '#111'; g.lineWidth = 5;
  g.beginPath(); g.moveTo(ex - ew, top); g.lineTo(ex + ew, top); g.ellipse(ex, top, ew, eh, 0, 0, Math.PI); g.closePath(); g.fill(); g.stroke();
  g.save(); g.beginPath(); g.ellipse(ex, top, ew, eh, 0, 0, Math.PI); g.clip();
  g.fillStyle = '#121212'; g.beginPath(); g.ellipse(ex + look * ew, top + eh * 0.12, ew * 0.4, eh * 0.66, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = 'rgba(255,255,255,0.85)'; g.beginPath(); g.arc(ex + (look - 0.14) * ew, top + eh * 0.42, ew * 0.07, 0, Math.PI * 2); g.fill();
  g.restore();
  g.fillStyle = '#111'; g.fillRect(ex - ew - 4, top - 2, ew * 2 + 8, 9);
}
function roundEye(g, ex, ey, ew, eh, lookX, lookY, pupil = 0.5) {
  g.fillStyle = '#fbfaf6'; g.strokeStyle = '#111'; g.lineWidth = 5;
  g.beginPath(); g.ellipse(ex, ey, ew, eh, 0, 0, Math.PI * 2); g.fill(); g.stroke();
  g.fillStyle = '#121212'; g.beginPath(); g.ellipse(ex + lookX * ew * 4, ey + lookY * eh * 4, ew * pupil, eh * pupil, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = 'rgba(255,255,255,0.9)'; g.beginPath(); g.arc(ex - ew * 0.18, ey - eh * 0.2, ew * 0.14, 0, Math.PI * 2); g.fill();
}
const mouthLine = (g, x, y, w) => { g.fillStyle = '#222'; g.fillRect(x - w / 2, y, w, 4); };
// sorriso malvado com dentes serrilhados (gold = um dente de ouro)
function evilGrin(g, cx, y, px, w = 0.12, gold = false) {
  const hw = w * px, h = 0.07 * px;
  g.fillStyle = '#1a0d0d'; g.beginPath(); g.moveTo(cx - hw, y - h * 0.3); g.quadraticCurveTo(cx, y + h * 1.4, cx + hw, y - h * 0.3);
  g.quadraticCurveTo(cx, y + h * 0.3, cx - hw, y - h * 0.3); g.fill();
  const n = 6;
  for (let i = 0; i < n; i++) {
    const x0 = cx - hw * 0.8 + (i / n) * hw * 1.6, x1 = x0 + hw * 1.6 / n;
    g.fillStyle = gold && i === 2 ? '#e0b23a' : '#f3efe3';
    g.beginPath(); g.moveTo(x0, y - h * 0.05 + (Math.abs(i - 2.5) * h * 0.08)); g.lineTo(x1, y - h * 0.05 + (Math.abs(i - 2.5) * h * 0.08)); g.lineTo((x0 + x1) / 2, y + h * 0.4); g.fill();
  }
}
function blush(g, cx, y, px) {
  for (const s of [-1, 1]) {
    const gr = g.createRadialGradient(cx + s * 0.3 * px, y, 0, cx + s * 0.3 * px, y, 0.07 * px);
    gr.addColorStop(0, 'rgba(240,110,120,0.55)'); gr.addColorStop(1, 'rgba(240,110,120,0)');
    g.fillStyle = gr; g.fillRect(cx + s * 0.3 * px - 0.07 * px, y - 0.07 * px, 0.14 * px, 0.14 * px);
  }
}

// ---------- rosto animado ----------
// O rosto fica numa camada própria logo à frente da cápsula, com 6 quadros prontos por estilo
// (olhos abertos/fechados × boca fechada/meio aberta/aberta), compartilhados por todas as pílulas.
const FACE_PX = 1024 / Math.PI, FACE_W = 256, FACE_H = 168;
const FACE_EYES = {
  tedio: [[-0.2, 0.085, 0.2, 0.12], [0.2, 0.085, 0.2, 0.12]], feliz: [[-0.19, 0.13, 0.12, 0.14], [0.19, 0.13, 0.12, 0.14]],
  bravo: [[-0.19, 0.15, 0.13, 0.1], [0.19, 0.15, 0.13, 0.1]], surpreso: [[-0.19, 0.14, 0.14, 0.16], [0.19, 0.14, 0.14, 0.16]],
  piscada: [[-0.19, 0.13, 0.12, 0.14]], malvado: [[-0.19, 0.15, 0.13, 0.1], [0.19, 0.15, 0.13, 0.1]],
  louco: [[-0.19, 0.15, 0.15, 0.16], [0.19, 0.15, 0.1, 0.1]], pirata: [[0.19, 0.15, 0.12, 0.1]],
};
const FACE_MOUTH = { tedio: [0.245, 0.1], feliz: [0.27, 0.12], bravo: [0.31, 0.11], surpreso: [0.33, 0.08], sono: [0.26, 0.08], piscada: [0.24, 0.1], oculos: [0.32, 0.11] };
const faceCache = new Map();
function faceFrames(id) {
  if (faceCache.has(id)) return faceCache.get(id);
  const frames = [];
  for (const closed of [0, 1]) for (const mouth of [0, 1, 2]) {
    const c = document.createElement('canvas'); c.width = FACE_W; c.height = FACE_H;
    const g = c.getContext('2d'), cx = FACE_W / 2, top = 2, px = FACE_PX;
    FACE_DRAW[id](g, cx, top, px);
    if (closed && FACE_EYES[id]) for (const [ex, ey, rx, ry] of FACE_EYES[id]) {
      g.save(); g.globalCompositeOperation = 'destination-out';
      g.beginPath(); g.ellipse(cx + ex * px, top + ey * px, rx * px, ry * px, 0, 0, Math.PI * 2); g.fill(); g.restore();
      g.strokeStyle = '#151515'; g.lineWidth = 6; g.lineCap = 'round'; // olho fechado: arquinho com cílio
      g.beginPath(); g.arc(cx + ex * px, top + (ey - 0.03) * px, rx * px * 0.7, 0.2 * Math.PI, 0.8 * Math.PI); g.stroke();
    }
    if (mouth && FACE_MOUTH[id]) {
      const [my, mw] = FACE_MOUTH[id], x = cx, y = top + my * px, w = mw * px;
      g.save(); g.globalCompositeOperation = 'destination-out';
      g.fillRect(x - w * 1.25, y - 0.05 * px, w * 2.5, 0.12 * px); g.restore();
      const hw = w * (0.55 + 0.25 * mouth), hh = (0.018 + 0.03 * mouth) * px;
      g.fillStyle = '#2a0c0c'; g.beginPath(); g.ellipse(x, y + hh * 0.4, hw, hh, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#d4505a'; g.beginPath(); g.ellipse(x, y + hh * 0.95, hw * 0.55, hh * 0.45, 0, 0, Math.PI * 2); g.fill();
      g.strokeStyle = '#151515'; g.lineWidth = 4; g.beginPath(); g.ellipse(x, y + hh * 0.4, hw, hh, 0, 0, Math.PI * 2); g.stroke();
    }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
    frames.push(t);
  }
  faceCache.set(id, frames);
  return frames;
}
function makeFaceLayer(id) {
  if (!id || !FACE_DRAW[id]) return null;
  const frames = faceFrames(id);
  const span = FACE_W / FACE_PX / R, hgt = FACE_H / FACE_PX, y1 = L / 2 - 0.07, y0 = y1 - hgt; // na "cabeça": parte de cima da cápsula, acima da emenda
  // centrado em φ = 0 (frente, +Z), para onde o personagem olha
  const geo = new THREE.LatheGeometry([new THREE.Vector2(R + 0.004, y0), new THREE.Vector2(R + 0.004, y1)], 24, -span / 2, span);
  const mat = new THREE.MeshStandardMaterial({ map: frames[0], transparent: true, roughness: 0.35, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
  const mesh = new THREE.Mesh(geo, mat); mesh.renderOrder = 1;
  return { mesh, frames, cur: 0 };
}

// Plástico com arranhões/manchas na cor dada; com rosto quando face != null.
function bodyTexture(color, H, face, seed) {
  const W = 1024, c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  g.fillStyle = hex(color); g.fillRect(0, 0, W, H);
  let s = seed; const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 26; i++) {
    const x = r() * W, y = r() * H, n = 3 + (r() * 5) | 0;
    g.strokeStyle = `rgba(60,45,40,${0.1 + r() * 0.16})`; g.lineWidth = 0.8 + r();
    for (let k = 0; k < n; k++) { g.beginPath(); g.moveTo(x + r() * 10, y + r() * 10); g.lineTo(x + r() * 26 - 8, y + r() * 26 - 8); g.stroke(); }
  }
  for (let i = 0; i < 60; i++) {
    const x = r() * W, y = r() * H, rad = 10 + r() * 40, gr = g.createRadialGradient(x, y, 0, x, y, rad);
    gr.addColorStop(0, `rgba(90,75,65,${0.04 + r() * 0.05})`); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
  if (face && FACE_DRAW[face]) FACE_DRAW[face](g, W / 2, 2, W / Math.PI);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}

// Parte do perfil da cápsula entre os comprimentos de arco `from` e `to` (de baixo para cima).
function capsuleLathe(R, L, from, to) {
  const pts = [], N = 64, arcCap = Math.PI / 2 * R;
  for (let i = 0; i <= N; i++) {
    const s = from + (to - from) * (i / N);
    let x, y;
    if (s < arcCap) { const a = -Math.PI / 2 + s / R; x = Math.cos(a) * R; y = -L / 2 + Math.sin(a) * R; }
    else if (s < arcCap + L) { x = R; y = -L / 2 + (s - arcCap); }
    else { const a = (s - arcCap - L) / R; x = Math.cos(a) * R; y = L / 2 + Math.sin(a) * R; }
    pts.push(new THREE.Vector2(Math.max(x, 1e-4), y));
  }
  return new THREE.LatheGeometry(pts, 64, Math.PI, Math.PI * 2); // u = 0,5 fica na frente (+Z)
}

const limb = (points, mat, radius = 0.032) =>
  new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 24, radius, 10), mat);

function glove(mat) {
  const g = new THREE.Group();
  const fist = new THREE.Mesh(new THREE.SphereGeometry(0.2, 28, 20), mat); fist.scale.set(1.05, 1, 1.1); g.add(fist);
  const thumb = new THREE.Mesh(new THREE.CapsuleGeometry(0.055, 0.09, 6, 12), mat);
  thumb.scale.setScalar(1.25); thumb.position.set(-0.13, 0.04, 0.1); thumb.rotation.set(0.35, 0, 0.5); g.add(thumb);
  const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, 0.14, 20), mat); cuff.position.y = 0.2; g.add(cuff);
  const lip = new THREE.Mesh(new THREE.TorusGeometry(0.115, 0.022, 8, 24), mat); lip.rotation.x = Math.PI / 2; lip.position.y = 0.27; lip.scale.setScalar(1.1); g.add(lip);
  return g;
}

// ---------- calçados (origem no chão, frente +Z) ----------
const SOLE = 0x3a2420;
const BOOTS = {
  tenis(mat) {
    const g = new THREE.Group();
    const upper = new THREE.Mesh(new THREE.SphereGeometry(0.2, 24, 16, 0, Math.PI * 2, 0, Math.PI / 2), mat);
    upper.scale.set(1.2, 1.05, 1.6); upper.position.set(0, 0.05, 0.1); g.add(upper);
    const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.13, 0.16, 18), mat); collar.position.set(0, 0.22, -0.02); g.add(collar);
    const sole = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.07, 24), matte(SOLE, 0.85));
    sole.scale.set(1, 1, 1.55); sole.position.set(0, 0.035, 0.1); g.add(sole);
    return g;
  },
  botas(mat) {
    const g = BOOTS.tenis(mat);
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, 0.34, 18), mat); shaft.position.set(0, 0.36, -0.02); g.add(shaft);
    const lace = matte(0xece6d6, 0.9);
    for (let i = 0; i < 4; i++) {
      const l = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.018, 0.02), lace);
      l.position.set(0, 0.2 + i * 0.07, 0.12 - i * 0.005); l.rotation.z = i % 2 ? 0.35 : -0.35; g.add(l);
    }
    const cuff = new THREE.Mesh(new THREE.TorusGeometry(0.125, 0.025, 8, 20), mat); cuff.rotation.x = Math.PI / 2; cuff.position.set(0, 0.53, -0.02); g.add(cuff);
    return g;
  },
  galochas(mat) {
    const g = new THREE.Group();
    const foot = new THREE.Mesh(new THREE.CapsuleGeometry(0.15, 0.22, 8, 16), mat);
    foot.rotation.x = Math.PI / 2; foot.scale.set(1.15, 1, 0.75); foot.position.set(0, 0.12, 0.08); g.add(foot);
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.15, 0.5, 20, 1, true), mat); shaft.position.set(0, 0.36, -0.03); g.add(shaft);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.025, 8, 24), mat); rim.rotation.x = Math.PI / 2; rim.position.set(0, 0.61, -0.03); g.add(rim);
    const sole = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.05, 0.5), matte(SOLE, 0.85)); sole.position.set(0, 0.025, 0.08); g.add(sole);
    return g;
  },
  nadadeiras(mat) {
    const g = new THREE.Group();
    const shape = new THREE.Shape();
    shape.moveTo(-0.14, -0.1); shape.lineTo(0.14, -0.1); shape.lineTo(0.3, 0.55);
    shape.quadraticCurveTo(0.15, 0.48, 0, 0.58); shape.quadraticCurveTo(-0.15, 0.48, -0.3, 0.55); shape.closePath();
    const fin = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: 0.03, bevelEnabled: true, bevelSize: 0.01, bevelThickness: 0.01, bevelSegments: 2 }), mat);
    fin.rotation.x = Math.PI / 2; fin.position.set(0, 0.05, 0); g.add(fin);
    const pocket = new THREE.Mesh(new THREE.SphereGeometry(0.15, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), mat);
    pocket.scale.set(1, 0.9, 1.3); pocket.position.set(0, 0.06, 0); g.add(pocket);
    const strap = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.025, 8, 20), matte(0x222222, 0.7)); strap.position.set(0, 0.16, -0.08); g.add(strap);
    return g;
  },
  chinelo(mat) {
    const g = new THREE.Group();
    const sole = new THREE.Mesh(new THREE.CapsuleGeometry(0.13, 0.26, 6, 16), mat);
    sole.rotation.x = Math.PI / 2; sole.scale.set(1.2, 1, 0.22); sole.position.set(0, 0.03, 0.08); g.add(sole);
    const foot = new THREE.Mesh(new THREE.SphereGeometry(0.13, 18, 12), matte(0x2b2220, 0.6));
    foot.scale.set(1, 0.55, 1.5); foot.position.set(0, 0.1, 0.08); g.add(foot);
    const strapMat = matte(0xf4f1ea, 0.6);
    for (const s of [-1, 1]) {
      const st = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.22, 6), strapMat);
      st.position.set(s * 0.07, 0.12, 0.14); st.rotation.set(0.9, 0, s * 0.9); g.add(st);
    }
    return g;
  },
};

// ---------- chapéus (origem no topo da cápsula) ----------
const HATS = {
  nenhum: () => null,
  bandana(color) {
    const g = new THREE.Group(), m = matte(typeof color === 'number' && color > 64 ? color : 0x8b1d1d, 0.85);
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.49, 28, 14, 0, Math.PI * 2, 0, Math.PI / 2), m); cap.scale.y = 0.62; cap.position.y = -0.24; g.add(cap);
    const knot = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), m); knot.position.set(0, -0.14, -0.48); g.add(knot);
    for (const sd of [-1, 1]) { const tail = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.32, 0.03), m); tail.position.set(sd * 0.07, -0.3, -0.5); tail.rotation.set(0.3, 0, sd * 0.25); g.add(tail); }
    return g;
  },
  capacete() { // capacete de ferro com chifres
    const g = new THREE.Group(), iron = new THREE.MeshStandardMaterial({ color: 0x5a5e63, metalness: 0.75, roughness: 0.4 });
    const dome = new THREE.Mesh(new THREE.SphereGeometry(0.52, 28, 14, 0, Math.PI * 2, 0, Math.PI / 2), iron); dome.position.y = -0.26; g.add(dome);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.52, 0.04, 8, 32), iron); rim.rotation.x = Math.PI / 2; rim.position.y = -0.25; g.add(rim);
    const horn = matte(0xe8dcc0, 0.6);
    for (const sd of [-1, 1]) {
      const h = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.45, 12), horn);
      h.position.set(sd * 0.46, 0.02, 0); h.rotation.z = -sd * 0.9; g.add(h);
    }
    for (let i = 0; i < 6; i++) { const rv = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 6), iron); const a = i / 6 * Math.PI * 2; rv.position.set(Math.sin(a) * 0.53, -0.22, Math.cos(a) * 0.53); g.add(rv); }
    return g;
  },
  pirata(color) {
    // Tricórnio: aba com três pontas (uma para a frente) e laterais viradas para cima.
    const g = new THREE.Group(), felt = matte(0x2a1f1a, 0.9);
    const brimGeo = new THREE.CylinderGeometry(1, 1, 0.05, 72, 1);
    const pos = brimGeo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i), rad = Math.hypot(x, z);
      if (rad < 1e-3) continue;
      const th = Math.atan2(x, z), corner = Math.pow(Math.max(0, Math.cos(3 * th)), 2);
      const r = 0.48 + 0.16 * corner;
      pos.setX(i, x / rad * r); pos.setZ(i, z / rad * r);
      pos.setY(i, pos.getY(i) + 0.2 * (1 - Math.pow(Math.max(0, Math.cos(3 * th)), 0.6)));
    }
    brimGeo.computeVertexNormals();
    const brim = new THREE.Mesh(brimGeo, felt); brim.position.y = -0.04; g.add(brim);
    const crown = new THREE.Mesh(new THREE.SphereGeometry(0.33, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), felt);
    crown.scale.y = 0.8; crown.position.y = -0.02; g.add(crown);
    const trim = new THREE.Mesh(new THREE.TorusGeometry(0.335, 0.018, 6, 32), matte(PILL_COLORS[color].hex, 0.5));
    trim.rotation.x = Math.PI / 2; trim.position.y = 0.0; g.add(trim);
    const skull = new THREE.Mesh(new THREE.CircleGeometry(0.06, 16), matte(0xf2ede0, 0.6));
    skull.position.set(0, 0.12, 0.31); skull.rotation.x = -0.5; g.add(skull);
    for (const s of [-1, 1]) { // ossos cruzados
      const bone = new THREE.Mesh(new THREE.CapsuleGeometry(0.012, 0.1, 4, 6), matte(0xf2ede0, 0.6));
      bone.position.set(0, 0.06, 0.32); bone.rotation.set(-0.5, 0, s * 0.9); g.add(bone);
    }
    return g;
  },
  palha(color) {
    const g = new THREE.Group(), straw = matte(0xd9b66a, 0.95);
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.72, 0.75, 0.04, 40), straw); brim.position.y = -0.03; g.add(brim);
    const crown = new THREE.Mesh(new THREE.SphereGeometry(0.33, 28, 14, 0, Math.PI * 2, 0, Math.PI / 2), straw); crown.scale.y = 0.75; g.add(crown);
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.335, 0.335, 0.07, 32, 1, true), matte(PILL_COLORS[color].hex, 0.6)); band.position.y = 0.04; g.add(band);
    return g;
  },
  bone(color) {
    const g = new THREE.Group(), m = matte(PILL_COLORS[color].hex, 0.75);
    const crown = new THREE.Mesh(new THREE.SphereGeometry(0.4, 28, 14, 0, Math.PI * 2, 0, Math.PI / 2), m); crown.scale.y = 0.7; crown.position.y = -0.12; g.add(crown);
    const bill = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.035, 24, 1, false, -Math.PI / 2, Math.PI), m);
    bill.scale.set(1, 1, 0.9); bill.position.set(0, -0.12, 0.33); bill.rotation.x = 0.12; g.add(bill);
    const button = new THREE.Mesh(new THREE.SphereGeometry(0.04, 10, 8), m); button.position.y = 0.16; g.add(button);
    return g;
  },
  cartola(color) {
    const g = new THREE.Group(), m = matte(0x1d1d22, 0.55);
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.04, 32), m); brim.position.y = -0.02; g.add(brim);
    const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.28, 0.6, 32), m); crown.position.y = 0.3; g.add(crown);
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.285, 0.285, 0.09, 32, 1, true), matte(PILL_COLORS[color].hex, 0.6)); band.position.y = 0.06; g.add(band);
    return g;
  },
  capitao() {
    const g = new THREE.Group();
    const top = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.36, 0.14, 32), matte(0xf5f3ee, 0.6)); top.position.y = 0.12; g.add(top);
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.12, 32), matte(0x1b2333, 0.7)); band.position.y = 0.0; g.add(band);
    const bill = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.03, 24, 1, false, -Math.PI / 2, Math.PI), matte(0x111111, 0.3));
    bill.position.set(0, -0.05, 0.28); bill.rotation.x = 0.25; g.add(bill);
    const badge = new THREE.Mesh(new THREE.CircleGeometry(0.06, 16), new THREE.MeshStandardMaterial({ color: 0xd8b04a, metalness: 0.8, roughness: 0.3 }));
    badge.position.set(0, 0.02, 0.365); g.add(badge);
    return g;
  },
  coroa() {
    const g = new THREE.Group(), gold = new THREE.MeshStandardMaterial({ color: 0xe0b23a, metalness: 0.85, roughness: 0.25 });
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.14, 32, 1, true), gold); ring.material.side = THREE.DoubleSide; ring.position.y = 0.02; g.add(ring);
    for (let i = 0; i < 6; i++) {
      const a = i / 6 * Math.PI * 2, spike = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.16, 8), gold);
      spike.position.set(Math.sin(a) * 0.29, 0.16, Math.cos(a) * 0.29); g.add(spike);
      const gem = new THREE.Mesh(new THREE.SphereGeometry(0.03, 10, 8), new THREE.MeshPhysicalMaterial({ color: [0xd3202b, 0x2d6cdf, 0x2e9e4f][i % 3], roughness: 0.1, clearcoat: 1 }));
      gem.position.set(Math.sin(a) * 0.305, 0.03, Math.cos(a) * 0.305); g.add(gem);
    }
    g.position.y = -0.03;
    return g;
  },
  gorro(color) {
    const g = new THREE.Group(), m = matte(PILL_COLORS[color].hex, 0.95);
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.47, 28, 16, 0, Math.PI * 2, 0, Math.PI / 2), m); cap.scale.y = 0.85; cap.position.y = -0.2; g.add(cap);
    const fold = new THREE.Mesh(new THREE.TorusGeometry(0.47, 0.06, 10, 32), m); fold.rotation.x = Math.PI / 2; fold.position.y = -0.18; g.add(fold);
    const pom = new THREE.Mesh(new THREE.IcosahedronGeometry(0.11, 1), matte(0xf4f1ea, 1)); pom.position.y = 0.24; g.add(pom);
    return g;
  },
};

// ---------- montagem ----------
// Cápsula mais curta (antes L = 1,55: o personagem ficava comprido demais) e personagem de 1,45 m.
const LEG = 0.785;
const R = 0.5, L = 1.1, ARC = Math.PI / 2 * R, TOTAL = 2 * ARC + L, SPLIT = ARC + L * 0.58, BODY_Y = LEG + L / 2 + R * 0.8;
export const PILL_HEIGHT = BODY_Y + L / 2 + R; // sola no chão (y = 0) até o topo da cápsula
export const CHAR_HEIGHT = 1.45;                // altura do personagem no mundo (m)
export const PILL_SCALE = CHAR_HEIGHT / PILL_HEIGHT;
const SEAM_Y = -L / 2 + (SPLIT - ARC), TOP_Y = L / 2 + R;

// options.npc (inimigos): aceita cores em hex (capHex, baseHex, gloveHex, bootHex), rostos e
// chapéus extras, luvas com espinhos (spikes) e gancho no lugar da mão esquerda (hook).
export function makePill(options = {}) {
  const o = options.npc ? { ...PILL_DEFAULT, ...options } : sanitizePill(options);
  const capHex = o.capHex ?? PILL_COLORS[o.cap].hex, baseHex = o.baseHex ?? PILL_BASE_COLORS[o.base].hex;
  const root = new THREE.Group();
  const body = new THREE.Group(); body.position.y = BODY_Y; root.add(body);
  const pxPerM = 1024 / (Math.PI * 2 * R);
  const white = new THREE.Mesh(capsuleLathe(R, L, 0, SPLIT), plastic(0xffffff, bodyTexture(baseHex, Math.round(SPLIT * pxPerM), null, 7)));
  const red = new THREE.Mesh(capsuleLathe(R, L, SPLIT, TOTAL), plastic(0xffffff, bodyTexture(capHex, Math.round((TOTAL - SPLIT) * pxPerM), null, 3)));
  body.add(white, red);
  const face = makeFaceLayer(o.face); if (face) body.add(face.mesh);
  const seam = new THREE.Mesh(new THREE.TorusGeometry(R + 0.004, 0.008, 6, 64), plastic(capHex));
  seam.rotation.x = Math.PI / 2; seam.position.y = SEAM_Y; body.add(seam);

  const limbMat = matte(0x2b2220, 0.6), gloveMat = plastic(o.gloveHex ?? PILL_COLORS[o.gloves].hex), bootMat = plastic(o.bootHex ?? PILL_COLORS[o.bootColor].hex);
  const parts = { body, gloveMat }; // gloveMat: usado no brilho de aviso dos inimigos
  for (const side of [-1, 1]) {
    const shoulder = new THREE.Group(); shoulder.position.set(side * (R - 0.03), SEAM_Y - 0.12, 0); body.add(shoulder);
    shoulder.add(limb([new THREE.Vector3(0, 0, 0), new THREE.Vector3(side * 0.12, -0.15, 0), new THREE.Vector3(side * 0.16, -0.42, 0.02), new THREE.Vector3(side * 0.15, -0.62, 0.04)], limbMat));
    const gl = glove(gloveMat); gl.position.set(side * 0.15, -0.84, 0.05); gl.rotation.z = side * 0.1; shoulder.add(gl);
    gl.userData.wrist = new THREE.Vector3(side * 0.15, -0.6, 0.04); // fim do braço: onde entra o pulso da mão 3D
    (parts.gloves || (parts.gloves = {}))[side < 0 ? 'R' : 'L'] = gl;
    if (side < 0) gl.scale.x = -1;
    if (o.spikes) { // luva com cravos
      const spikeMat = new THREE.MeshStandardMaterial({ color: 0xc9ccd0, metalness: 0.8, roughness: 0.3 });
      for (let k = 0; k < 4; k++) {
        const sp = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.12, 8), spikeMat);
        sp.position.set(-0.09 + k * 0.06, 0.06, 0.2); sp.rotation.x = Math.PI / 2; gl.add(sp);
      }
    }
    if (o.hook && side > 0) { // gancho de pirata na mão esquerda
      gl.clear(); gl.userData.hook = true;
      const steel = new THREE.MeshStandardMaterial({ color: 0xb8bcc0, metalness: 0.9, roughness: 0.25 });
      const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.13, 0.16, 16), matte(0x3a2a1c, 0.8)); cup.position.y = 0.12; gl.add(cup);
      const hk = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.025, 8, 20, Math.PI * 1.3), steel); hk.position.set(0, -0.06, 0.05); hk.rotation.set(0, Math.PI / 2, 0.3); gl.add(hk);
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.14, 8), steel); shaft.position.y = 0.0; gl.add(shaft);
    }
    const hip = new THREE.Group(); hip.position.set(side * 0.2, -L / 2 - R * 0.8, 0); body.add(hip);
    hip.add(limb([new THREE.Vector3(0, 0.1, 0), new THREE.Vector3(0, -0.2, 0), new THREE.Vector3(side * 0.01, -0.5, 0)], limbMat, 0.035));
    const shoe = BOOTS[o.boots](bootMat); shoe.position.set(side * 0.03, -0.78, 0); hip.add(shoe);
    // lado esquerdo do personagem = -X (de frente para +Z, a direita fica em -X)
    parts[side < 0 ? 'armR' : 'armL'] = shoulder; parts[side < 0 ? 'legR' : 'legL'] = hip;
    if (side < 0) { // âncora da arma no punho direito, apontando para a frente
      const hand = new THREE.Group(); hand.position.copy(gl.position).add(new THREE.Vector3(0, -0.02, 0.12));
      shoulder.add(hand); parts.hand = hand;
    }
  }
  const hat = (HATS[o.hat] || HATS.nenhum)(o.hatColor);
  if (hat) { hat.scale.setScalar(1.3); hat.position.y = TOP_Y - 0.08; body.add(hat); parts.hat = hat; }
  root.userData.parts = parts; root.userData.phase = 0; root.userData.pill = o; root.userData.face = face;
  root.userData.blinkT = 1 + Math.random() * 3;
  root.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
  if (!options.npc) attachRealHands(root, 1 / PILL_SCALE); // jogadores: mãos 3D (iguais às da 1ª pessoa)
  return root;
}

export function disposePill(pill) {
  const face = pill.userData.face && pill.userData.face.mesh;
  pill.traverse((m) => {
    if (!m.isMesh || m.userData.sharedGeo) return; // mão 3D: geometria compartilhada com as outras
    m.geometry.dispose();
    if (m === face) { m.material.dispose(); return; } // quadros do rosto são compartilhados
    if (m.material.map) m.material.map.dispose();
    m.material.dispose();
  });
}

// poses: walk | attack | aim | reload | use | throw | strum | hammer | climb | vault | swim | jump | row | leap
//        | windup | heavyWindup | slam | guard | stagger | dodge | slashR | slashL | thrust | uppercut | spin
//        | parry | roll | sidestep | crawl | kick | clash
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const smooth01 = (x) => { x = Math.max(0, Math.min(1, x)); return x * x * (3 - 2 * x); };
// Partes animadas: a pose calcula o ALVO e animatePill mistura suavemente do quadro anterior para
// ele (sem "estalos" ao trocar de pose). Ângulos misturados pelo caminho mais curto (giros de 360°).
const BLEND_PARTS = ['body', 'armL', 'armR', 'legL', 'legR'];
const _snap = new Float32Array(BLEND_PARTS.length * 3 + 2);
const wrapPi = (a) => { a = (a + Math.PI) % (Math.PI * 2); return (a < 0 ? a + Math.PI * 2 : a) - Math.PI; };
export function animatePill(pill, speed, dt, pose = 'walk', progress = 0) {
  const p = pill.userData.parts;
  const first = !pill.userData.blended; pill.userData.blended = true;
  BLEND_PARTS.forEach((n, i) => { const r = p[n].rotation; _snap[i * 3] = r.x; _snap[i * 3 + 1] = r.y; _snap[i * 3 + 2] = r.z; });
  _snap[15] = p.body.position.y; _snap[16] = p.body.position.z;
  poseTargets(pill, speed, dt, pose, progress);
  if (first) return;
  // poses de ação (golpes/esquiva) respondem mais rápido que andar/parar
  const rate = ['walk', 'swim', 'row', 'aim', 'strum', 'guard'].includes(pose) ? 14 : ['reload', 'use'].includes(pose) ? 20 : 30, k = 1 - Math.exp(-rate * dt);
  BLEND_PARTS.forEach((n, i) => {
    const r = p[n].rotation;
    r.x = _snap[i * 3] + wrapPi(r.x - _snap[i * 3]) * k;
    r.y = _snap[i * 3 + 1] + wrapPi(r.y - _snap[i * 3 + 1]) * k;
    r.z = _snap[i * 3 + 2] + wrapPi(r.z - _snap[i * 3 + 2]) * k;
  });
  p.body.position.y = _snap[15] + (p.body.position.y - _snap[15]) * k;
  p.body.position.z = _snap[16] + (p.body.position.z - _snap[16]) * k;
  animateFace(pill.userData, dt);
  pill.userData.pose = pose;
  animateRealHands(pill, dt);
}

// Pisca de vez em quando; a boca abre conforme o volume da voz (userData.talk 0..1, chat de voz).
function animateFace(ud, dt) {
  const f = ud.face; if (!f) return;
  ud.blinkT -= dt;
  if (ud.blinkT < -0.13) ud.blinkT = 2 + Math.random() * 4 * (Math.random() < 0.2 ? 0.15 : 1); // às vezes pisca duas vezes
  const closed = ud.blinkT < 0 ? 1 : 0;
  const talk = ud.talk || 0;
  ud.mouthT = (ud.mouthT || 0) + dt * 14;
  const mouth = talk > 0.05 ? (talk * (0.6 + 0.4 * Math.sin(ud.mouthT)) > 0.45 ? 2 : 1) : 0;
  const key = closed * 3 + mouth;
  if (key !== f.cur) { f.cur = key; f.mesh.material.map = f.frames[key]; }
}

// userData lido aqui (o jogador preenche): mf/ms = direção do movimento relativa ao corpo (frente/lado),
// armed = 'none' | 'melee' | 'pistol' | 'long' | 'tool', vy = velocidade vertical, reloadKind, useItem,
// vaultSide, aimPitch, kick, strum, hurt (0..1, tranco de dano) e squash (0..1, aterrissagem).
function poseTargets(pill, speed, dt, pose, progress) {
  const ud = pill.userData, p = ud.parts;
  const run = Math.min(1, Math.max(0, (speed - 4.6) / 2.2));          // 0 andando … 1 correndo
  const k = Math.min(1, speed / 4);
  ud.phase += dt * (pose === 'swim' ? (speed > 0.5 ? 4.2 : 2.6) : 2 + speed * (2.1 - run * 0.35));
  const ph = ud.phase, c = Math.sin(ph), mf = ud.mf ?? 1, ms = ud.ms ?? 0, armed = ud.armed || 'none';
  const back = mf < -0.3 ? 1 : 0, side = Math.abs(ms) > 0.5 && Math.abs(mf) < 0.5 ? Math.sign(ms) : 0;
  ud.idleT = speed < 0.3 ? (ud.idleT || 0) + dt : 0;
  // ---------- locomoção base: parado (respira, olha em volta) / andar / correr / lateral / de costas ----------
  const breathe = Math.sin(ph * 0.5) * (1 - k);
  const look = ud.idleT > 3 ? Math.sin(ud.idleT * 0.7) * 0.25 * Math.min(1, (ud.idleT - 3) * 0.5) : 0;
  p.body.position.y = BODY_Y + Math.abs(Math.cos(ph)) * (0.06 + run * 0.08) * k + breathe * 0.015;
  p.body.position.z = 0;
  // inclina para dentro da curva e para a frente/trás ao acelerar/frear (ud.turn, ud.accel vêm do jogador);
  // parado, troca o peso de um pé para o outro devagar
  const turn = clamp(ud.turn || 0, -3, 3), acc = clamp(ud.accel || 0, -8, 8), sway = Math.sin((ud.idleT || 0) * 0.8) * 0.035 * (1 - k);
  p.body.rotation.set((0.05 + run * 0.2) * k - back * 0.12 + acc * 0.012, look + c * (0.07 + run * 0.03) * k, c * (0.06 + run * 0.03) * k + side * 0.12 * k - turn * 0.045 * k + sway);
  const stride = (0.55 + run * 0.35) * k * (back ? 0.8 : 1);
  if (side) { // passo lateral: pernas abrem e fecham
    p.legL.rotation.set(0, 0, Math.max(0, c) * 0.45 * k); p.legR.rotation.set(0, 0, -Math.max(0, -c) * 0.45 * k);
  } else { p.legL.rotation.set(c * stride * (back ? -1 : 1), 0, 0.02); p.legR.rotation.set(-c * stride * (back ? -1 : 1), 0, -0.02); }
  const swing = (0.7 + run * 0.5) * k;
  p.armL.rotation.set(-c * swing - run * 0.25, 0, 0.06 + run * 0.12 + breathe * 0.04);
  p.armR.rotation.set(c * swing - run * 0.25, 0, -0.06 - run * 0.12 - breathe * 0.04);
  // carregando algo: postura da arma por cima do balanço
  if (armed === 'pistol') { p.armR.rotation.set(-0.55 - run * 0.2, 0.15, -0.05); p.armL.rotation.x *= 0.6; }
  else if (armed === 'long') { p.armR.rotation.set(-0.75 - run * 0.15, 0.35, 0.05); p.armL.rotation.set(-0.85 - run * 0.1, -0.55, 0.35); p.body.rotation.y += -0.2; }
  else if (armed === 'melee') { p.armR.rotation.set(-0.35 + c * swing * 0.4, 0.1, -0.2 - run * 0.1); }
  else if (armed === 'tool') { p.armR.rotation.set(-0.45 + c * swing * 0.3, 0.2, -0.05); }
  if (p.hat) p.hat.rotation.z = -c * 0.03 * k;

  if (pose === 'attack') { // jab de direita com giro do corpo
    const jab = Math.sin(Math.min(1, progress) * Math.PI);
    p.armR.rotation.set(-1.55 * jab, 0, -0.05 - 0.25 * jab);
    p.armL.rotation.set(-0.5, 0, 0.2);
    p.body.rotation.y = -0.35 * jab; p.body.rotation.x = 0.12 * jab;
  } else if (pose === 'aim') {
    // mira: braços seguem a câmera, corpo de lado (arma longa) ou de frente (pistola, duas mãos)
    const ap = ud.aimPitch || 0, kk = ud.kick || 0, long = (ud.gunType || 'pistol') === 'long';
    if (long) {
      p.armR.rotation.set(-1.45 - ap - kk * 0.45, 0.35, -0.05); p.armL.rotation.set(-1.5 - ap - kk * 0.35, -0.6, 0.55);
      p.body.rotation.set(0.05 - kk * 0.12, -0.35, 0); p.body.position.z = -kk * 0.06;
    } else {
      p.armR.rotation.set(-1.52 - ap - kk * 0.7, 0.18, 0.08); p.armL.rotation.set(-1.45 - ap - kk * 0.6, -0.42, -0.1);
      p.body.rotation.set(0.04 - kk * 0.1, -0.08, 0);
    }
    p.legL.rotation.x *= 0.5; p.legR.rotation.x *= 0.5;
    p.legL.rotation.z = 0.12; p.legR.rotation.z = -0.12; // base aberta
  } else if (pose === 'reload') {
    // recarga em 3ª pessoa: abaixa a arma, mão esquerda pega o pente no cinto, encaixa e dá o tapa
    const u = Math.min(1, progress), kind = ud.reloadKind || 'mag', long = (ud.gunType || 'pistol') === 'long';
    const low = Math.sin(u * Math.PI);
    p.armR.rotation.set(-0.9 + low * 0.25, 0.35 + low * 0.25, 0.15 + low * 0.2);
    p.body.rotation.set(0.12 * low, -0.15, 0);
    if (kind === 'shotgun') { // bomba repetida: braço esquerdo vai e volta
      const pump = Math.sin(u * Math.PI * 6);
      p.armL.rotation.set(-1.05 - pump * 0.25, -0.55, 0.45);
    } else if (kind === 'revolver') { // gira o tambor, cartuchos com a esquerda
      p.armR.rotation.z += Math.sin(u * Math.PI) * 0.6;
      p.armL.rotation.set(-0.7 - Math.sin(u * Math.PI * 4) * 0.2, -0.5, -0.2);
    } else {
      const a = u < 0.35 ? u / 0.35 : u < 0.7 ? 1 : 1 - (u - 0.7) / 0.3; // desce → pega → sobe
      p.armL.rotation.set(-0.2 - (1 - a) * 0.9, -0.3 - (1 - a) * 0.3, 0.25 + a * 0.15);
      if (u > 0.82) { const sl = Math.sin((u - 0.82) / 0.18 * Math.PI); p.armL.rotation.x -= sl * 0.35; p.body.rotation.x += sl * 0.06; }
    }
    if (long) p.body.rotation.y -= 0.2;
  } else if (pose === 'use') { // bandagem enrolando no braço / kit na altura do peito
    const u = Math.min(1, progress), wrap = Math.sin(u * Math.PI * 5);
    if (ud.useItem === 'kit') {
      p.armR.rotation.set(-1.1, 0.4, 0.5); p.armL.rotation.set(-1.1 - wrap * 0.15, -0.4, -0.5);
      p.body.rotation.set(0.25, 0, 0); p.body.position.y = BODY_Y - 0.12;
    } else {
      p.armL.rotation.set(-1.0, 0, -0.45); // braço esquerdo esticado
      p.armR.rotation.set(-1.15 + wrap * 0.25, 0.5 + wrap * 0.3, 0.55);
      p.body.rotation.set(0.15, 0.2, 0);
    }
    p.legL.rotation.x *= 0.3; p.legR.rotation.x *= 0.3;
  } else if (pose === 'throw') { // arremesso do gancho: puxa para trás e lança
    const u = Math.min(1, progress), wind = u < 0.4 ? smooth01(u / 0.4) : 1 - smooth01((u - 0.4) / 0.25);
    const rel = u < 0.4 ? 0 : Math.sin(Math.min(1, (u - 0.4) / 0.6) * Math.PI);
    p.armR.rotation.set(-2.6 * wind - 1.4 * rel, 0.3 * wind, -0.4 * wind); p.armL.rotation.set(-1.2 * rel - 0.3, -0.3, 0.3);
    p.body.rotation.set(-0.15 * wind + 0.3 * rel, 0.5 * wind - 0.4 * rel, 0);
    p.legL.rotation.set(-0.5 * rel, 0, 0); p.legR.rotation.set(0.4 * wind, 0, 0);
  } else if (pose === 'strum') { // tocando banjo: esquerda no braço do banjo, direita dedilhando
    const st = ud.strum || 0, sway = Math.sin(ph * 0.9);
    p.armL.rotation.set(-1.25, -0.2, -0.75); p.armR.rotation.set(-0.85 - st * 0.35, 0.25, 0.65 + st * 0.15);
    p.body.rotation.set(0.05, 0.1 + sway * 0.08, sway * 0.07); p.body.position.y += Math.abs(sway) * 0.03;
    p.legL.rotation.x = Math.max(0, Math.sin(ph * 1.8)) * 0.25; // bate o pé no ritmo
  } else if (pose === 'hammer') { // martelada de cima para baixo com uma mão
    const u = Math.min(1, progress), up = u < 0.45 ? smooth01(u / 0.45) : 1 - smooth01((u - 0.45) / 0.2);
    p.armR.rotation.set(-2.7 * up - 0.5 * (1 - up), 0.1, -0.2); p.armL.rotation.set(-0.6, -0.2, 0.3);
    p.body.rotation.set(-0.1 * up + 0.3 * (1 - up) * (u > 0.45 ? 1 : 0), -0.15, 0); p.body.position.y = BODY_Y - 0.08 * (u > 0.45 ? 1 : 0);
  } else if (pose === 'windup') { // puxa o braço para trás (aviso do golpe / carga do pesado)
    const k2 = smooth01(progress), tr = Math.sin(ph * 9) * 0.03 * k2; // treme de força
    p.armR.rotation.set(0.9 * k2 + tr, 0, -0.35 - 0.4 * k2); p.armL.rotation.set(-0.9 * k2, 0, 0.35);
    p.body.rotation.set(-0.1 * k2, 0.45 * k2, 0.04 * k2); p.body.position.y = BODY_Y - 0.1 * k2;
    p.legL.rotation.set(-0.45 * k2, 0, 0.1); p.legR.rotation.set(0.35 * k2, 0, -0.1);
  } else if (pose === 'heavyWindup') { // os dois braços para o alto
    const k2 = smooth01(progress);
    p.armR.rotation.set(-2.9 * k2, 0, -0.25 * k2); p.armL.rotation.set(-2.9 * k2, 0, 0.25 * k2);
    p.body.rotation.set(-0.22 * k2, 0, 0); p.body.position.y = BODY_Y + 0.12 * k2;
  } else if (pose === 'slam') { // pancada de cima para baixo
    const k2 = Math.sin(Math.min(1, progress) * Math.PI * 0.5);
    p.armR.rotation.set(-2.9 + 2.2 * k2, 0, -0.25); p.armL.rotation.set(-2.9 + 2.2 * k2, 0, 0.25);
    p.body.rotation.set(-0.22 + 0.55 * k2, 0, 0); p.body.position.y = BODY_Y - 0.16 * k2;
    p.legL.rotation.set(-0.6 * k2, 0, 0.1); p.legR.rotation.set(0.45 * k2, 0, -0.1);
  } else if (pose === 'guard') { // guarda: luvas na frente do rosto, joelhos flexionados, balança
    const bob = Math.sin(ph * 1.5) * 0.02;
    p.armR.rotation.set(-1.9, 0.5, -0.9); p.armL.rotation.set(-1.9, -0.5, 0.9);
    p.body.rotation.set(0.14, -0.1, 0); p.body.position.y = BODY_Y - 0.1 + bob;
    p.legL.rotation.set(-0.3, 0, 0.12); p.legR.rotation.set(0.25, 0, -0.12);
  } else if (pose === 'stagger') { // atordoado: cambaleia
    const ph2 = ud.phase * 2.2;
    p.body.rotation.set(-0.18 + Math.sin(ph2) * 0.12, Math.sin(ph2 * 0.7) * 0.3, Math.sin(ph2) * 0.22);
    p.armR.rotation.set(0.3, 0, -0.9 + Math.sin(ph2) * 0.3); p.armL.rotation.set(0.3, 0, 0.9 + Math.cos(ph2) * 0.3);
    p.legL.rotation.set(Math.sin(ph2) * 0.3, 0, 0.15); p.legR.rotation.set(-Math.sin(ph2) * 0.3, 0, -0.15);
  } else if (pose === 'dodge') { // esquiva: abaixa e inclina
    const k2 = Math.sin(Math.min(1, progress) * Math.PI);
    p.body.position.y = BODY_Y - 0.5 * k2; p.body.rotation.set(0.5 * k2, 0, 0);
    p.armR.rotation.set(-0.6 * k2, 0, -0.6 * k2); p.armL.rotation.set(-0.6 * k2, 0, 0.6 * k2);
    p.legL.rotation.set(-1.0 * k2, 0, 0); p.legR.rotation.set(0.6 * k2, 0, 0);
  } else if (pose === 'slashR') { // corte horizontal da direita para a esquerda, com passo à frente
    const a = smooth01(progress), sw = Math.sin(Math.min(1, progress) * Math.PI);
    p.armR.rotation.set(-1.45, -1.3 + 2.4 * a, -0.4 + 0.3 * sw); p.armL.rotation.set(-0.6 + 0.3 * sw, 0, 0.5 + 0.3 * a);
    p.body.rotation.set(0.1 + 0.1 * sw, 0.6 - 1.3 * a, -0.08 * sw); p.body.position.z = 0.12 * sw; p.body.position.y = BODY_Y - 0.08 * sw;
    p.legL.rotation.set(-0.5 * sw - 0.1, 0, 0.05); p.legR.rotation.set(0.35, 0, -0.05);
  } else if (pose === 'slashL') { // revés da esquerda para a direita
    const a = smooth01(progress), sw = Math.sin(Math.min(1, progress) * Math.PI);
    p.armR.rotation.set(-1.35, 1.1 - 2.3 * a, -0.2); p.armL.rotation.set(-0.4, 0, 0.45 + 0.3 * sw);
    p.body.rotation.set(0.1 + 0.1 * sw, -0.65 + 1.3 * a, 0.08 * sw); p.body.position.z = 0.12 * sw; p.body.position.y = BODY_Y - 0.08 * sw;
    p.legL.rotation.set(0.35, 0, 0.05); p.legR.rotation.set(-0.5 * sw - 0.1, 0, -0.05);
  } else if (pose === 'thrust') { // estocada com avanço
    const a = Math.sin(Math.min(1, progress) * Math.PI);
    p.armR.rotation.set(-1.6, 0, -0.1); p.armL.rotation.set(0.5 * a, 0, 0.3);
    p.body.position.z = 0.35 * a; p.body.rotation.set(0.35 * a, -0.25 * a, 0);
    p.legL.rotation.set(-0.7 * a, 0, 0); p.legR.rotation.set(0.5 * a, 0, 0);
  } else if (pose === 'uppercut') { // golpe de baixo para cima
    const a = smooth01(progress);
    p.armR.rotation.set(0.6 - 3.0 * a, 0, -0.25); p.armL.rotation.set(-0.5, 0, 0.4);
    p.body.position.y = BODY_Y - 0.15 + 0.3 * a; p.body.rotation.set(0.3 - 0.5 * a, -0.2, 0);
    p.legL.rotation.set(-0.3 * (1 - a), 0, 0); p.legR.rotation.set(0.3 * (1 - a), 0, 0);
  } else if (pose === 'spin') { // giro de 360° (golpe final)
    const a = smooth01(progress);
    p.armR.rotation.set(-1.5, 0, -1.2); p.armL.rotation.set(-1.5, 0, 1.2);
    p.body.rotation.set(0.1, -a * Math.PI * 2, 0); p.body.position.y = BODY_Y + Math.sin(a * Math.PI) * 0.15;
  } else if (pose === 'kick') { // chute frontal: levanta o joelho, estica a perna e volta
    const u = Math.min(1, progress), up = u < 0.3 ? smooth01(u / 0.3) : u < 0.6 ? 1 : 1 - smooth01((u - 0.6) / 0.4);
    const ext = u < 0.25 ? 0 : u < 0.5 ? smooth01((u - 0.25) / 0.25) : 1 - smooth01((u - 0.55) / 0.3);
    p.legR.rotation.set(-0.9 * up - 0.75 * ext, 0, -0.05); p.legL.rotation.set(0.15 * up, 0, 0.08);
    p.body.rotation.set(-0.28 * up, 0.12 * up, 0); p.body.position.z = -0.12 * up + 0.12 * ext; p.body.position.y = BODY_Y + 0.04 * up;
    p.armR.rotation.set(-0.9, 0.3, -0.7 * up - 0.2); p.armL.rotation.set(-0.7, -0.2, 0.8 * up + 0.2);
  } else if (pose === 'clash') { // espadas se chocaram: o braço é jogado para trás
    const a = Math.sin(Math.min(1, progress) * Math.PI);
    p.armR.rotation.set(-1.6 + 1.1 * a, 0.5 * a, -0.4 - 0.5 * a); p.armL.rotation.set(-0.5, 0, 0.5 + 0.4 * a);
    p.body.rotation.set(-0.25 * a, 0.35 * a, 0); p.body.position.z = -0.18 * a;
    p.legL.rotation.set(0.25 * a, 0, 0.05); p.legR.rotation.set(-0.15 * a, 0, -0.05);
  } else if (pose === 'parry') { // desvia o golpe com um tapa da arma para fora
    const a = Math.sin(Math.min(1, progress) * Math.PI);
    p.armR.rotation.set(-2.0, -0.9 * a, -0.4 - 0.8 * a); p.armL.rotation.set(-1.0, 0.4, 0.6);
    p.body.rotation.set(-0.15 * a, 0.5 * a, 0.08 * a); p.body.position.z = -0.2 * a;
  } else if (pose === 'roll') { // cambalhota (esquiva para frente/trás)
    const a = smooth01(progress), dir = ud.rollDir || 1;
    p.body.rotation.set(dir * a * Math.PI * 2, 0, 0);
    p.body.position.y = BODY_Y - 0.75 * Math.sin(a * Math.PI);
    p.armR.rotation.set(-2.2, 0, -0.5); p.armL.rotation.set(-2.2, 0, 0.5);
    p.legL.rotation.set(-1.4, 0, 0); p.legR.rotation.set(-1.4, 0, 0);
  } else if (pose === 'sidestep') { // esquiva lateral: inclina e abre as pernas
    const a = Math.sin(Math.min(1, progress) * Math.PI), sd = ud.rollDir || 1;
    p.body.rotation.set(0.15 * a, 0, -0.55 * a * sd); p.body.position.y = BODY_Y - 0.35 * a;
    p.legL.rotation.set(0, 0, 0.5 * a); p.legR.rotation.set(0, 0, -0.5 * a);
    p.armR.rotation.set(-0.8, 0, -1.0 * a); p.armL.rotation.set(-0.8, 0, 1.0 * a);
  } else if (pose === 'crawl') { // caído: deitado de bruços, se arrastando
    const cw = Math.sin(ud.phase * 1.6), mv = Math.min(1, speed / 0.8);
    p.body.rotation.set(1.45, 0, cw * 0.08 * mv); p.body.position.y = 0.55; p.body.position.z = -0.6;
    p.armR.rotation.set(-2.6 + cw * 0.6 * mv, 0, -0.5); p.armL.rotation.set(-2.6 - cw * 0.6 * mv, 0, 0.5);
    p.legL.rotation.set(0.2 + cw * 0.3 * mv, 0, 0.15); p.legR.rotation.set(0.2 - cw * 0.3 * mv, 0, -0.15);
  } else if (pose === 'jump') { // subindo: encolhe e estica os braços; caindo: braços abertos se equilibrando
    const vy = ud.vy ?? 2, rise = Math.max(0, Math.min(1, vy / 6)), fall = Math.max(0, Math.min(1, -vy / 8));
    const flail = Math.sin(ph * 6) * 0.25 * fall;
    p.armL.rotation.set(-2.4 * rise - 0.9 * fall + flail, 0, 0.5 + 0.9 * fall); p.armR.rotation.set(-2.4 * rise - 0.9 * fall - flail, 0, -0.5 - 0.9 * fall);
    p.legL.rotation.set(-0.9 * rise - 0.2 * fall, 0, 0.05 + 0.1 * fall); p.legR.rotation.set(0.35 * rise + 0.25 * fall, 0, -0.05 - 0.1 * fall);
    p.body.rotation.set(0.12 * rise - 0.08 * fall, 0, 0);
  } else if (pose === 'climb') { // escalar borda: estica e agarra → puxa o corpo → sobe o joelho → fica de pé
    const u = Math.min(1, progress);
    const reach = u < 0.3 ? smooth01(u / 0.3) : 1, pull = u < 0.3 ? 0 : smooth01((u - 0.3) / 0.45), stand = u < 0.75 ? 0 : smooth01((u - 0.75) / 0.25);
    p.armR.rotation.set(-2.95 * reach + 2.2 * pull - 0.3 * stand, 0, -0.25 + 0.15 * pull); p.armL.rotation.set(-2.95 * reach + 2.2 * pull - 0.3 * stand, 0, 0.25 - 0.15 * pull);
    p.body.rotation.set((0.55 * pull) * (1 - stand), 0, 0); p.body.position.y = BODY_Y + 0.12 * reach * (1 - pull) - 0.15 * pull * (1 - stand);
    p.legR.rotation.set(-1.5 * pull * (1 - stand) + 0.15 * (1 - reach), 0, 0); p.legL.rotation.set(0.3 * (1 - stand) * reach, 0, 0);
  } else if (pose === 'vault') { // pular obstáculo baixo: apoia uma mão e passa as pernas de lado
    const u = Math.min(1, progress), a = Math.sin(u * Math.PI), sd = ud.vaultSide || 1;
    p.armL.rotation.set(-0.9 - 0.6 * a, 0, -0.2 * sd); p.armR.rotation.set(-1.8 * a, 0, -0.8 * a);
    p.body.rotation.set(0.3 * a, 0.3 * a * sd, 0.45 * a * sd); p.body.position.y = BODY_Y + 0.1 * a;
    p.legL.rotation.set(-1.3 * a, 0, 0.4 * a * sd); p.legR.rotation.set(-1.1 * a, 0, 0.4 * a * sd);
  } else if (pose === 'row') { // sentado na balsa, remando (progress = fase da remada)
    const st = Math.sin(progress * Math.PI * 2);
    p.body.position.y = BODY_Y - 0.55; p.body.rotation.set(0.15 + st * 0.12, 0, 0);
    p.legL.rotation.set(-1.4, 0, 0.1); p.legR.rotation.set(-1.4, 0, -0.1);
    p.armL.rotation.set(-1.2 - st * 0.6, 0, 0.25); p.armR.rotation.set(-1.2 - st * 0.6, 0, -0.25);
  } else if (pose === 'leap') { // pendurado na corda do gancho
    const tuck = Math.sin(Math.min(1, progress) * Math.PI);
    p.armL.rotation.set(-2.8, 0, 0.3); p.armR.rotation.set(-2.9, 0, -0.3);
    p.legL.rotation.set(-0.9 * tuck, 0, 0); p.legR.rotation.set(-0.6 * tuck, 0, 0);
  } else if (pose === 'swim') {
    if (speed > 0.5) { // crawl: corpo deitado que rola, braços em moinho, pernas batendo rápido
      const roll = Math.sin(ph) * 0.35;
      p.body.position.y = BODY_Y - 0.71 + Math.sin(ph * 2) * 0.03; p.body.position.z = -0.4;
      p.body.rotation.set(1.3, 0, roll);
      p.armL.rotation.set(-((ph % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2), 0, 0.25);
      p.armR.rotation.set(-((ph + Math.PI) % (Math.PI * 2)), 0, -0.25);
      p.legL.rotation.set(Math.sin(ph * 4) * 0.35, 0, 0.05); p.legR.rotation.set(-Math.sin(ph * 4) * 0.35, 0, -0.05);
    } else { // boiando em pé: braços remando para os lados, pernas pedalando
      const sc = Math.sin(ph * 1.4);
      p.body.position.y = BODY_Y - 0.4 + Math.sin(ph * 0.9) * 0.05; p.body.rotation.set(0.12, 0, sc * 0.05);
      p.armL.rotation.set(-0.55 + sc * 0.25, sc * 0.4, 0.95); p.armR.rotation.set(-0.55 - sc * 0.25, -sc * 0.4, -0.95);
      p.legL.rotation.set(Math.sin(ph * 1.6) * 0.6, 0, 0.1); p.legR.rotation.set(-Math.sin(ph * 1.6) * 0.6, 0, -0.1);
    }
  }
  // ---------- camadas por cima: tranco de dano e "amassada" ao aterrissar ----------
  const hurt = ud.hurt || 0;
  if (hurt > 0.01) {
    p.body.rotation.x -= 0.35 * hurt; p.body.rotation.z += 0.12 * hurt * (ud.hurtSide || 1);
    p.armL.rotation.z += 0.5 * hurt; p.armR.rotation.z -= 0.5 * hurt;
  }
  const sq = ud.squash || 0;
  p.body.scale.set(1 + sq * 0.12, 1 - sq * 0.16, 1 + sq * 0.12);
  p.body.position.y -= sq * 0.22;
}
