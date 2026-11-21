// Texturas procedurais (sem arquivos): tábuas de madeira em tons de cinza; a cor da peça
// tinge a textura (material.color × map).
import * as THREE from '../three.js';
import { mulberry32 } from '../core/util.js';

let wood = null;
export function woodTexture() {
  if (wood) return wood;
  const r = mulberry32(7), S = 256, P = 64;
  const c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d');
  for (let i = 0; i < S / P; i++) {
    const b = 205 + (r() * 50) | 0;
    g.fillStyle = `rgb(${b},${b},${b})`; g.fillRect(i * P, 0, P, S);
    for (let k = 0; k < 22; k++) { // veios
      const x = i * P + 4 + r() * (P - 8), a = 0.05 + r() * 0.12;
      g.strokeStyle = `rgba(60,40,20,${a})`; g.lineWidth = 0.6 + r() * 1.2;
      g.beginPath(); g.moveTo(x, 0);
      for (let y = 0; y <= S; y += 32) g.lineTo(x + Math.sin(y * 0.05 + k) * 2.2, y);
      g.stroke();
    }
    if (r() < 0.6) { // nó
      const kx = i * P + 14 + r() * (P - 28), ky = r() * S;
      g.fillStyle = 'rgba(70,45,25,0.45)'; g.beginPath(); g.ellipse(kx, ky, 4, 7, 0, 0, Math.PI * 2); g.fill();
    }
    g.fillStyle = 'rgba(40,28,16,0.6)'; g.fillRect(i * P, 0, 2, S); // junta entre tábuas
  }
  wood = new THREE.CanvasTexture(c);
  wood.wrapS = wood.wrapT = THREE.RepeatWrapping;
  wood.colorSpace = THREE.SRGBColorSpace;
  wood.anisotropy = 4;
  return wood;
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
