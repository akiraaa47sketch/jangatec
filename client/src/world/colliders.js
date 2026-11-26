// Colisão "gameplay-first": personagens são cilindros cinemáticos e o mundo é feito de
// conjuntos (sets) de colisores simples. Cada set tem posição/rotação própria — o barco é
// um set que se move; ilhas são sets fixos.
//   set:      { x, z, yaw, y, radius, items: [] }
//   colisor:  { type: 'box' | 'ramp' | 'cyl', x, y, z (centro, local ao set), hx, hy, hz, yaw }
//   rampa:    cunha sólida; topo vai de (y-hy) em z=-hz até (y+hy) em z=+hz.
import { rot, clamp } from '../core/util.js';
import { CFG } from '../config.js';

export class Colliders {
  constructor() { this.sets = []; this.groundFn = null; } // groundFn(x, z): chão do fundo do mar (ou -Infinity)
  addSet(set) { this.sets.push(set); return set; }
  removeSet(set) { const i = this.sets.indexOf(set); if (i >= 0) this.sets.splice(i, 1); }

  // Linha de visão: o segmento a→b passa por dentro de algum colisor? (paredes, troncos, peças da
  // jangada, terreno). Usado para inimigos não atirarem/baterem através de paredes.
  segmentBlocked(ax, ay, az, bx, by, bz, shrink = 0.03) {
    const dx = bx - ax, dy = by - ay, dz = bz - az, len2 = dx * dx + dz * dz;
    for (const set of this.sets) {
      // descarta conjuntos longe do segmento (distância do centro do conjunto à reta, no plano)
      const t = len2 > 0 ? clamp(((set.x - ax) * dx + (set.z - az) * dz) / len2, 0, 1) : 0;
      const qx = ax + dx * t - set.x, qz = az + dz * t - set.z, br = set.radius + 1;
      if (qx * qx + qz * qz > br * br) continue;
      const [sax, saz] = rot(ax - set.x, az - set.z, -set.yaw), [sbx, sbz] = rot(bx - set.x, bz - set.z, -set.yaw);
      const say = ay - set.y, sby = by - set.y;
      for (const c of set.items) {
        if (c.noLos) continue;
        let [p0x, p0z] = [sax - c.x, saz - c.z], [p1x, p1z] = [sbx - c.x, sbz - c.z];
        if (c.yaw) { [p0x, p0z] = rot(p0x, p0z, -c.yaw); [p1x, p1z] = rot(p1x, p1z, -c.yaw); }
        const p0y = say - c.y, p1y = sby - c.y, ux = p1x - p0x, uy = p1y - p0y, uz = p1z - p0z;
        let t0 = 0, t1 = 1;
        const slab = (p, u, h) => { // recorta [t0, t1] pela faixa -h..h
          if (Math.abs(u) < 1e-9) return Math.abs(p) <= h;
          let ta = (-h - p) / u, tb = (h - p) / u;
          if (ta > tb) [ta, tb] = [tb, ta];
          t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
          return t0 <= t1;
        };
        if (!slab(p0y, uy, c.hy - shrink)) continue;
        if (c.type === 'cyl') { // cilindro vertical: interseção do segmento com o círculo
          const R = c.hx - shrink, A = ux * ux + uz * uz, B = 2 * (p0x * ux + p0z * uz), C = p0x * p0x + p0z * p0z - R * R;
          if (A < 1e-12) { if (C <= 0) return true; continue; }
          const disc = B * B - 4 * A * C;
          if (disc < 0) continue;
          const sq = Math.sqrt(disc), ca = (-B - sq) / (2 * A), cb = (-B + sq) / (2 * A);
          if (Math.max(t0, ca) <= Math.min(t1, cb)) return true;
          continue;
        }
        if (slab(p0x, ux, c.hx - shrink) && slab(p0z, uz, c.hz - shrink)) return true;
      }
    }
    return false;
  }

  // Resolve o corpo contra o mundo. body: { pos, vel, radius, height, grounded, groundSet }
  resolve(body, prevY) {
    const p = body.pos, r = body.radius, h = body.height;
    let ground = -Infinity, gset = null;
    for (const set of this.sets) {
      const ddx = p.x - set.x, ddz = p.z - set.z, br = set.radius + 2;
      if (ddx * ddx + ddz * ddz > br * br) continue;
      const sy = p.y - set.y, psy = prevY - set.y;
      let [sx, sz] = rot(ddx, ddz, -set.yaw);
      for (const c of set.items) {
        let lx = sx - c.x, lz = sz - c.z;
        if (c.yaw) [lx, lz] = rot(lx, lz, -c.yaw);
        let d, nx = 0, nz = 0, inside, cz = 0;
        if (c.type === 'cyl') {
          const d0 = Math.hypot(lx, lz);
          inside = d0 <= c.hx;
          d = Math.max(0, d0 - c.hx);
          if (d0 > 1e-6) { nx = lx / d0; nz = lz / d0; } else nx = 1;
        } else {
          const cx = clamp(lx, -c.hx, c.hx);
          cz = clamp(lz, -c.hz, c.hz);
          const ex = lx - cx, ez = lz - cz;
          d = Math.hypot(ex, ez);
          inside = d === 0;
          if (!inside) { nx = ex / d; nz = ez / d; }
        }
        if (d >= r) continue;
        const bottom = c.y - c.hy;
        let top = c.y + c.hy;
        if (c.type === 'ramp') top = bottom + ((cz + c.hz) / (2 * c.hz)) * 2 * c.hy;

        // Chão: pés perto do topo (ou cruzaram o topo neste frame).
        if (d < r * 0.5 && Math.max(sy, psy) >= top - CFG.step && sy <= top + (body.grounded ? 0.25 : 0.02)) {
          if (set.y + top > ground) { ground = set.y + top; gset = set; }
          continue;
        }
        if (Math.max(sy, psy) >= top - CFG.step) continue; // na borda de algo pisável: sem empurrão
        if (sy + h <= bottom) continue;                    // passa por baixo
        // Cabeça batendo por baixo.
        if (body.vel.y > 0 && d < r * 0.5 && psy + h <= bottom + 0.05) {
          p.y = set.y + bottom - h; body.vel.y = 0;
          continue;
        }
        // Parede: empurra para fora na horizontal.
        let ux, uz;
        if (inside && c.type !== 'cyl') {
          const px = c.hx - Math.abs(lx), pz = c.hz - Math.abs(lz);
          if (px < pz) { ux = Math.sign(lx || 1) * (px + r); uz = 0; }
          else { ux = 0; uz = Math.sign(lz || 1) * (pz + r); }
        } else if (inside) {
          const push = c.hx - Math.hypot(lx, lz) + r; ux = nx * push; uz = nz * push;
        } else { ux = nx * (r - d); uz = nz * (r - d); }
        if (c.yaw) [ux, uz] = rot(ux, uz, c.yaw);
        sx += ux; sz += uz;
        const [wx, wz] = rot(ux, uz, set.yaw);
        p.x += wx; p.z += wz;
      }
    }
    // Fundo do mar (terreno contínuo): pisável quando a água está rasa ou seca.
    if (this.groundFn) {
      const gh = this.groundFn(p.x, p.z);
      if (gh > ground && p.y < gh + (body.grounded ? 0.3 : 0.02) && Math.max(p.y, prevY) >= gh - 1.2) { ground = gh; gset = null; }
    }
    if (ground > -Infinity && body.vel.y <= 0) {
      body.landVel = body.grounded ? 0 : body.vel.y;
      p.y = ground; body.vel.y = 0; body.grounded = true; body.groundSet = gset;
    } else { body.grounded = false; body.groundSet = null; body.landVel = 0; }
  }

  // Superfície mais alta (<= maxY) no ponto, com espaço livre acima. Usado no parkour.
  probe(x, z, maxY) {
    const hits = [];
    for (const set of this.sets) {
      const ddx = x - set.x, ddz = z - set.z, br = set.radius + 2;
      if (ddx * ddx + ddz * ddz > br * br) continue;
      const [sx, sz] = rot(ddx, ddz, -set.yaw);
      for (const c of set.items) {
        let lx = sx - c.x, lz = sz - c.z;
        if (c.yaw) [lx, lz] = rot(lx, lz, -c.yaw);
        if (c.type === 'cyl') { if (Math.hypot(lx, lz) > c.hx) continue; }
        else if (Math.abs(lx) > c.hx || Math.abs(lz) > c.hz) continue;
        const bottom = c.y - c.hy;
        let top = c.y + c.hy;
        if (c.type === 'ramp') top = bottom + ((lz + c.hz) / (2 * c.hz)) * 2 * c.hy;
        hits.push({ top: set.y + top, bottom: set.y + bottom, set });
      }
    }
    let best = null;
    for (const hh of hits) if (hh.top <= maxY && (!best || hh.top > best.top)) best = hh;
    if (!best) return null;
    for (const hh of hits) if (hh !== best && hh.bottom < best.top + 1.6 && hh.top > best.top + 0.05) return null;
    return best;
  }
}

// Sobreposição de duas caixas orientadas em Y (SAT no plano XZ + intervalo em Y).
export function boxesOverlap(a, b, m = 0) {
  if (Math.abs(a.y - b.y) > a.hy + b.hy + m) return false;
  const dx = b.x - a.x, dz = b.z - a.z;
  const axes = [rot(1, 0, a.yaw || 0), rot(0, 1, a.yaw || 0), rot(1, 0, b.yaw || 0), rot(0, 1, b.yaw || 0)];
  for (const [ax, az] of axes) {
    const dist = Math.abs(dx * ax + dz * az);
    const ra = a.hx * Math.abs(axes[0][0] * ax + axes[0][1] * az) + a.hz * Math.abs(axes[1][0] * ax + axes[1][1] * az);
    const rb = b.hx * Math.abs(axes[2][0] * ax + axes[2][1] * az) + b.hz * Math.abs(axes[3][0] * ax + axes[3][1] * az);
    if (dist > ra + rb + m) return false;
  }
  return true;
}

// Colisor de uma caixa girada em QUALQUER eixo (Euler 'YXZ': yaw, rotX, rotZ — a mesma ordem das
// peças). Os colisores só giram em Y, então uma peça tombada (parede deitada, tábua em pé…) vira a
// caixa alinhada ao seu eixo mais vertical que a envolve. Sem inclinação, devolve a caixa original.
export function orientedBox(x, y, z, hx, hy, hz, yaw = 0, rotX = 0, rotZ = 0, type = 'box') {
  const tilt = (a) => { const m = Math.abs(a) % Math.PI; return Math.min(m, Math.PI - m); };
  if (tilt(rotX) < 0.02 && tilt(rotZ) < 0.02 && (type !== 'ramp' || (Math.abs(rotX) < 0.02 && Math.abs(rotZ) < 0.02))) {
    // 180° em X/Z (de cabeça para baixo) mantém a mesma caixa; rampa só sem giro
    return { type: type === 'cyl' ? 'cyl' : type, x, y, z, hx, hy, hz, yaw };
  }
  // eixos locais da caixa no espaço do pai: R = Ry(yaw)·Rx(rotX)·Rz(rotZ)
  const cy = Math.cos(yaw), sy = Math.sin(yaw), cx = Math.cos(rotX), sx = Math.sin(rotX), cz = Math.cos(rotZ), sz = Math.sin(rotZ);
  const R = [
    [cy * cz + sy * sx * sz, -cy * sz + sy * sx * cz, sy * cx],
    [cx * sz, cx * cz, -sx],
    [-sy * cz + cy * sx * sz, sy * sz + cy * sx * cz, cy * cx],
  ];
  const axes = [0, 1, 2].map((i) => [R[0][i], R[1][i], R[2][i]]);
  const half = [hx, hy, hz];
  // eixo mais vertical = "altura"; dos outros dois, o de maior projeção horizontal define o yaw
  let up = 0; for (let i = 1; i < 3; i++) if (Math.abs(axes[i][1]) > Math.abs(axes[up][1])) up = i;
  let ref = -1, best = -1;
  for (let i = 0; i < 3; i++) {
    if (i === up) continue;
    const hl = Math.hypot(axes[i][0], axes[i][2]) * half[i];
    if (hl > best) { best = hl; ref = i; }
  }
  const a = Math.atan2(-axes[ref][2], axes[ref][0]); // eixo local X do colisor = (cos a, -sin a)
  const ex = [Math.cos(a), 0, -Math.sin(a)], ez = [Math.sin(a), 0, Math.cos(a)];
  const proj = (e) => axes.reduce((acc, v, i) => acc + Math.abs(v[0] * e[0] + v[1] * e[1] + v[2] * e[2]) * half[i], 0);
  return { type: 'box', x, y, z, hx: proj(ex), hy: proj([0, 1, 0]), hz: proj(ez), yaw: a };
}

// Peça INCLINADA vira várias fatias horizontais (cada uma = caixa justa daquele trecho), em vez de
// uma caixa única que engloba tudo (antes uma parede tombada ou tábua em rampa ganhava uma caixa
// enorme e invisível). Sem inclinação devolve a caixa simples de orientedBox.
export function orientedBoxes(x, y, z, hx, hy, hz, yaw = 0, rotX = 0, rotZ = 0, type = 'box') {
  const single = orientedBox(x, y, z, hx, hy, hz, yaw, rotX, rotZ, type);
  if (single.type !== 'box' || !(rotX || rotZ) || type === 'ramp' || type === 'cyl') return [single];
  const tilt = (a) => { const m = Math.abs(a) % Math.PI; return Math.min(m, Math.PI - m); };
  if (tilt(rotX) < 0.02 && tilt(rotZ) < 0.02) return [single];
  const cy = Math.cos(yaw), sy = Math.sin(yaw), cx = Math.cos(rotX), sx = Math.sin(rotX), cz = Math.cos(rotZ), sz = Math.sin(rotZ);
  const R = [
    [cy * cz + sy * sx * sz, -cy * sz + sy * sx * cz, sy * cx],
    [cx * sz, cx * cz, -sx],
    [-sy * cz + cy * sx * sz, sy * sz + cy * sx * cz, cy * cx],
  ];
  const half = [hx, hy, hz], corners = [];
  for (let i = 0; i < 8; i++) {
    const s = [i & 1 ? 1 : -1, i & 2 ? 1 : -1, i & 4 ? 1 : -1];
    corners.push([0, 1, 2].map((r) => [x, y, z][r] + R[r][0] * s[0] * half[0] + R[r][1] * s[1] * half[1] + R[r][2] * s[2] * half[2]));
  }
  const edges = [];
  for (let i = 0; i < 8; i++) for (const b of [1, 2, 4]) if (!(i & b)) edges.push([corners[i], corners[i | b]]);
  let y0 = Infinity, y1 = -Infinity;
  for (const c of corners) { y0 = Math.min(y0, c[1]); y1 = Math.max(y1, c[1]); }
  const a = single.yaw, ex = [Math.cos(a), -Math.sin(a)], ez = [Math.sin(a), Math.cos(a)];
  const n = clamp(Math.ceil((y1 - y0) / 0.28), 1, 10), dh = (y1 - y0) / n, out = [];
  for (let k = 0; k < n; k++) {
    const lo = y0 + dh * k, hi = lo + dh, pts = [];
    for (const c of corners) if (c[1] >= lo - 1e-6 && c[1] <= hi + 1e-6) pts.push(c);
    for (const [p, q] of edges) for (const h of [lo, hi]) {
      if ((p[1] - h) * (q[1] - h) > 0 || Math.abs(q[1] - p[1]) < 1e-9) continue;
      const t = (h - p[1]) / (q[1] - p[1]); pts.push([p[0] + (q[0] - p[0]) * t, h, p[2] + (q[2] - p[2]) * t]);
    }
    if (pts.length < 2) continue;
    let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
    for (const p of pts) {
      const u = p[0] * ex[0] + p[2] * ex[1], v = p[0] * ez[0] + p[2] * ez[1];
      u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, v); v1 = Math.max(v1, v);
    }
    const uc = (u0 + u1) / 2, vc = (v0 + v1) / 2;
    out.push({ type: 'box', x: ex[0] * uc + ez[0] * vc, y: (lo + hi) / 2, z: ex[1] * uc + ez[1] * vc,
      hx: Math.max(0.03, (u1 - u0) / 2), hy: dh / 2, hz: Math.max(0.03, (v1 - v0) / 2), yaw: a });
  }
  return out.length ? out : [single];
}
