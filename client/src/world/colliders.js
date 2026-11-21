// Colisão "gameplay-first": personagens são cilindros cinemáticos e o mundo é feito de
// conjuntos (sets) de colisores simples. Cada set tem posição/rotação própria — o barco é
// um set que se move; ilhas são sets fixos.
//   set:      { x, z, yaw, y, radius, items: [] }
//   colisor:  { type: 'box' | 'ramp' | 'cyl', x, y, z (centro, local ao set), hx, hy, hz, yaw }
//   rampa:    cunha sólida; topo vai de (y-hy) em z=-hz até (y+hy) em z=+hz.
import { rot, clamp } from '../core/util.js';
import { CFG } from '../config.js';

export class Colliders {
  constructor() { this.sets = []; }
  addSet(set) { this.sets.push(set); return set; }
  removeSet(set) { const i = this.sets.indexOf(set); if (i >= 0) this.sets.splice(i, 1); }

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
