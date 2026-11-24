// Terreno das ilhas como um MORRO contínuo (no lugar dos discos empilhados): um platô plano onde
// ficam as construções e uma encosta suave que desce até o fundo do mar. A encosta entra no chão
// do fundo (World.seabedHeight), então na SECA dá para subir a pé da areia até o topo da ilha.
// O contorno não é um círculo: alongamento, lóbulos e ondulações deixam cada ilha com um formato.
//   forma: { x, z, R, top, bed, W, e, ea, la, lk, lp, wa, wp }
//     R  = raio mínimo do platô (as construções cabem nele)   top = altura do platô (mundo)
//     W  = largura da encosta (até chegar em `bed`)          e/ea = alongamento e direção
//     la/lk/lp = lóbulos (amplitude, quantidade, fase)        wa/wp = ondulação fina da costa
import * as THREE from '../three.js';
import { sandBump, repeated } from './textures.js';

const smooth = (u) => u * u * (3 - 2 * u);
const invSmooth = (y) => 0.5 - Math.sin(Math.asin(Math.max(-1, Math.min(1, 1 - 2 * y))) / 3); // inversa de smooth

export class IslandHill {
  constructor(o) {
    Object.assign(this, { bed: -7, e: 0, ea: 0, la: 0, lk: 3, lp: 0, wa: 0.05, wp: 0, mA: 0, mk: 3, mp: 0 }, o);
    this.maxR = this.R * (1 + this.e + this.la + this.wa) + this.W + 0.5;
  }
  // raio do platô na direção a (sempre >= R: o que foi posicionado dentro de R continua em terra)
  plateau(a) {
    const c = Math.cos(a - this.ea);
    return this.R * (1 + this.e * c * c + this.la * (0.5 + 0.5 * Math.sin(this.lk * a + this.lp))
      + this.wa * (0.5 + 0.25 * Math.sin(7 * a + this.wp) + 0.25 * Math.sin(13 * a - this.wp * 1.7)));
  }
  // altura do terreno no ponto (mundo); -Infinity fora do morro
  height(x, z) {
    const dx = x - this.x, dz = z - this.z, d2 = dx * dx + dz * dz;
    if (d2 > this.maxR * this.maxR) return -Infinity;
    const d = Math.sqrt(d2), a = Math.atan2(dz, dx), rp = this.plateau(a);
    return (d <= rp ? this.top : this.slope(d - rp)) + this.mound(a, d, rp);
  }
  // morrinhos/dunas na beira do platô (fora do raio R das construções), somem na descida da encosta
  mound(a, d, rp) {
    if (!this.mA || d < this.R * 0.9) return 0;
    const s1 = 0.5 + 0.5 * Math.sin(this.mk * a + this.mp), s2 = 0.5 + 0.5 * Math.sin((this.mk + 2) * a - this.mp * 1.3);
    const amp = this.mA * (s1 * s1 * 0.75 + s2 * 0.25);
    const rise = smooth(Math.min(1, (d - this.R * 0.9) / Math.max(0.8, rp - this.R * 0.9 + this.W * 0.06)));
    const fall = d > rp ? 1 - smooth(Math.min(1, (d - rp) / (this.W * 0.32))) : 1;
    return amp * rise * fall;
  }
  // altura da encosta a s metros da beira do platô (prof = perfil em linha [[s, y], ...], senão suave)
  slope(s) {
    if (s >= this.W) return this.bed;
    if (s <= 0) return this.top;
    const p = this.prof;
    if (p) { for (let i = 1; i < p.length; i++) if (s <= p[i][0]) { const k = (s - p[i - 1][0]) / (p[i][0] - p[i - 1][0]); return p[i - 1][1] + (p[i][1] - p[i - 1][1]) * k; } return this.bed; }
    return this.top - (this.top - this.bed) * smooth(s / this.W);
  }
  // distância do centro, na direção a, em que o terreno fica na altura y
  radiusAt(a, y) {
    if (y >= this.top) return this.plateau(a);
    if (y <= this.bed) return this.plateau(a) + this.W;
    if (!this.prof) return this.plateau(a) + this.W * invSmooth((this.top - y) / (this.top - this.bed));
    let lo = 0, hi = this.W;
    for (let i = 0; i < 14; i++) { const m = (lo + hi) / 2; if (this.slope(m) > y) lo = m; else hi = m; }
    return this.plateau(a) + (lo + hi) / 2;
  }
}

// Malha do morro: anéis polares com cor por vértice (grama no alto, areia seca, areia molhada perto
// da água e areia de fundo lá embaixo; nas ilhas rochosas a encosta vira pedra).
// pal: { grass, sand, wet, deep, rock }   opts: { grassK, rocky, gy (altura do grupo) }
export function makeHillMesh(h, pal, { grassK = 0.65, rocky = 0, gy = 0, seed = 1 } = {}) {
  const N = 84, PL = [0, 0.3, 0.55, 0.75, 0.88, 0.95, 1], BR = 18;
  const rows = PL.length + BR, pos = [], col = [], uv = [], idx = [];
  const C = (hex) => new THREE.Color(hex);
  const cg = C(pal.grass), cs = C(pal.sand), cw = C(pal.wet), cd = C(pal.deep), cr = C(pal.rock), c = new THREE.Color(), t = new THREE.Color();
  // ruído por posição (x, z): sem "raios" saindo do centro da malha polar
  const nx = (x, z, f = 1) => Math.sin(x * 0.31 * f + seed * 1.3) * Math.cos(z * 0.27 * f - seed) * 0.6 + Math.sin((x + z) * 0.53 * f + seed * 2.1) * 0.4;
  const n1 = (a, s) => Math.sin(a * 3 + seed * 1.7 + s) * 0.5 + Math.sin(a * 7 - seed * 0.9 + s * 2) * 0.3 + Math.sin(a * 17 + seed) * 0.2;
  for (let j = 0; j < N; j++) {
    const a = (j / N) * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a), rp = h.plateau(a);
    for (let i = 0; i < rows; i++) {
      let d, y;
      if (i < PL.length) { d = rp * PL[i]; y = h.top; } else {
        const u = Math.pow((i - PL.length + 1) / BR, 1.15); d = rp + h.W * u; y = h.slope(h.W * u);
      }
      y += h.mound(a, d, rp);
      // a beira do platô ganha um leve arredondado (sem quina)
      if (i === PL.length - 1) y -= 0.04;
      const x = ca * d, z = sa * d;
      pos.push(x, y - gy, z); uv.push(x * 0.16, z * 0.16);
      // cor
      const gEdge = rp * (grassK + 0.12 * n1(a, 0));
      if (y >= h.top - 0.25 && d < gEdge) {
        c.copy(cg).lerp(cs, Math.max(0, Math.min(1, (d - gEdge + 2.2) / 2.2)) * 0.85);
        c.offsetHSL(0.01 * nx(x, z, 1.3), 0.04 * nx(z, x, 0.7), nx(x, z, 2.1) * 0.04);
        const patch = nx(x + 17, z - 9, 0.8); // manchas de terra no meio da grama
        if (patch > 0.5) c.lerp(t.copy(cs).offsetHSL(0, -0.05, -0.08), Math.min(0.5, (patch - 0.5) * 2));
      } else if (y > 1.4) c.copy(cs).offsetHSL(0, 0, nx(x, z, 0.6) * 0.03);
      else if (y > -0.6) c.copy(cw).lerp(cs, Math.max(0, (y + 0.6) / 2) * 0.6);
      else c.copy(cw).lerp(cd, Math.min(1, (-0.6 - y) / 3));
      if (rocky > 0 && i >= PL.length) { // faixas de pedra na encosta (mais no meio dela)
        const u = (i - PL.length + 1) / BR, k = rocky * Math.max(0, n1(a * 1.3, 4) + 0.35) * Math.sin(Math.min(1, u * 1.4) * Math.PI);
        c.lerp(t.copy(cr).offsetHSL(0, 0, n1(a * 5, u * 9) * 0.05), Math.min(0.9, k));
      }
      col.push(c.r, c.g, c.b);
    }
  }
  for (let j = 0; j < N; j++) {
    const j2 = (j + 1) % N;
    for (let i = 0; i < rows - 1; i++) {
      const a = j * rows + i, b = j2 * rows + i, a1 = a + 1, b1 = b + 1;
      if (i === 0) { idx.push(a, b1, a1); continue; } // centro: leque (faces para cima)
      idx.push(a, b1, a1, a, b, b1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.96, bumpMap: repeated(sandBump(), 1), bumpScale: 1.2 });
  const m = new THREE.Mesh(g, mat); m.receiveShadow = true; m.castShadow = false;
  return m;
}
