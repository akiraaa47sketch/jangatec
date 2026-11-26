// Build assistida: pontos de encaixe ("bolinhas") nos centros, meios das bordas e cantos das peças
// da jangada. A peça carregada gira para alinhar com a peça vizinha (múltiplos de 90°) e seus
// próprios pontos grudam no ponto livre mais próximo — em cima (empilhar) ou do lado (encostar).
// MIRAR NUMA BOLINHA: a peça se teleporta encaixada exatamente nela (em cima ou ao lado) e fica
// travada ali, pronta para soldar — sem precisar arrastar até grudar.
import * as THREE from '../three.js';

const SNAP_RADIUS = 0.6;     // distância máxima para grudar
const SHOW_RANGE = 5;        // mostra os pontos das peças até essa distância da peça carregada
const MAX_DOTS = 600;
const AXES = [new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1)];
const _v = new THREE.Vector3(), _q = new THREE.Quaternion(), _m = new THREE.Matrix4();

// Caixa orientada: centro, três eixos (mundo) e meias medidas.
function boxOf(center, quat, half) {
  return { c: center, ax: AXES.map((a) => a.clone().applyQuaternion(quat)), h: half, q: quat.clone() };
}
// Face cuja normal aponta mais para "dir" → { n, i (eixo), s (sinal) }
function faceToward(box, dir) {
  let best = null;
  box.ax.forEach((a, i) => { for (const s of [1, -1]) { const d = a.dot(dir) * s; if (!best || d > best.d) best = { d, i, s }; } });
  best.n = box.ax[best.i].clone().multiplyScalar(best.s);
  return best;
}
// Pontos de uma face: centro (c), meios das bordas (e) e cantos (k)
function facePoints(box, f) {
  const [u, v] = [0, 1, 2].filter((i) => i !== f.i), out = [];
  const fc = box.c.clone().addScaledVector(f.n, box.h[f.i]);
  const U = box.ax[u].clone().multiplyScalar(box.h[u]), V = box.ax[v].clone().multiplyScalar(box.h[v]);
  out.push({ p: fc.clone(), k: 'c' });
  for (const s of [1, -1]) { out.push({ p: fc.clone().addScaledVector(U, s), k: 'e' }); out.push({ p: fc.clone().addScaledVector(V, s), k: 'e' }); }
  for (const a of [1, -1]) for (const b of [1, -1]) out.push({ p: fc.clone().addScaledVector(U, a).addScaledVector(V, b), k: 'k' });
  return out;
}
// Faces laterais (perpendiculares à de cima): centro + os dois cantos de baixo, com a normal
function sidePoints(box, up) {
  const top = faceToward(box, up), out = [];
  const down = box.ax[top.i].clone().multiplyScalar(-top.s * box.h[top.i]);
  for (const i of [0, 1, 2]) {
    if (i === top.i) continue;
    const o = [0, 1, 2].find((j) => j !== i && j !== top.i), W = box.ax[o].clone().multiplyScalar(box.h[o]);
    for (const s of [1, -1]) {
      const n = box.ax[i].clone().multiplyScalar(s), fc = box.c.clone().addScaledVector(n, box.h[i]);
      out.push({ p: fc.clone(), k: 's', n });
      for (const w of [1, -1]) out.push({ p: fc.clone().add(down).addScaledVector(W, w), k: 'sk', n });
    }
  }
  return out;
}

export class BuildSnap {
  constructor(G) {
    this.G = G;
    try { this.on = localStorage.getItem('jangatec-build-assist') !== '0'; } catch { this.on = true; }
    const geo = new THREE.SphereGeometry(1, 10, 8);
    const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, depthTest: false, depthWrite: false });
    this.dots = new THREE.InstancedMesh(geo, mat, MAX_DOTS);
    this.dots.frustumCulled = false; this.dots.renderOrder = 20; this.dots.count = 0;
    this.dots.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.dots.setColorAt(0, new THREE.Color());
    G.scene.add(this.dots);
    this.result = null;
  }

  toggle() {
    this.on = !this.on;
    try { localStorage.setItem('jangatec-build-assist', this.on ? '1' : '0'); } catch { /* ok */ }
    if (!this.on) this.hide();
    return this.on;
  }
  hide() { this.dots.count = 0; this.result = null; this.last = null; }

  // Caixas das peças da jangada (pela malha + medida física; a plataforma inicial pelo colisor)
  targets(near) {
    const boat = this.G.boat, out = [];
    boat.group.updateMatrixWorld(true);
    const bq = boat.group.getWorldQuaternion(new THREE.Quaternion());
    for (const piece of boat.pieces.values()) {
      if (piece.type === 'mastro') continue;
      let box = null;
      if (piece.mesh && piece.physSize) {
        const q = piece.mesh.getWorldQuaternion(new THREE.Quaternion());
        const c = piece.mesh.localToWorld(new THREE.Vector3(...(piece.physOffset || [0, 0, 0])));
        box = boxOf(c, q, piece.physSize.map((v) => v / 2));
      } else if (piece.col && piece.col.type === 'box') {
        const col = piece.col, q = bq.clone().multiply(_q.setFromAxisAngle(AXES[1], col.yaw || 0));
        box = boxOf(boat.group.localToWorld(new THREE.Vector3(col.x, col.y, col.z)), q, [col.hx, col.hy, col.hz]);
      }
      if (box && box.c.distanceTo(near) < SHOW_RANGE + Math.max(...box.h) * 2) out.push(box);
    }
    return out;
  }

  // Encaixes do convés ainda vazios (início da partida): a peça assenta DENTRO deles (pela face de baixo)
  slots() {
    const boat = this.G.boat, G = this.G, out = [];
    if (!G.startup || G.startup.phase !== 'build') return out;
    const base = boat.pieces.get('starter-platform'), col = base && base.col;
    if (!col) return out;
    const bq = boat.group.getWorldQuaternion(new THREE.Quaternion());
    for (const slot of boat.deckSlots) {
      if ([...boat.pieces.values()].some((p) => p.startSlotId === slot.id)) continue;
      out.push(boxOf(boat.group.localToWorld(new THREE.Vector3(slot.x, col.y, slot.z)), bq, [slot.size / 2, col.hy, slot.size / 2]));
    }
    return out;
  }

  // Ajusta { position, quaternion } da peça carregada. Retorna true se grudou.
  apply(position, quaternion, size, offset, ray = null, maxDist = 6) {
    this.result = null;
    if (!this.on) { this.dots.count = 0; this.last = null; return false; }
    const up = AXES[1];
    const center = () => position.clone().add(offset.clone().applyQuaternion(quaternion));
    const slotBoxes = this.slots();
    const boxes = this.targets(center()).concat(slotBoxes);
    // 1) alinha o giro com a peça mais próxima (múltiplos de 90° em torno do vertical), se a peça estiver "deitada reta"
    let nearest = null, nd = Infinity;
    for (const b of boxes) { const d = b.c.distanceTo(center()); if (d < nd) { nd = d; nearest = b; } }
    let held = boxOf(center(), quaternion, size.toArray().map((v) => v / 2));
    if (nearest) {
      const hb = faceToward(held, up.clone().negate()), tb = faceToward(nearest, up);
      if (hb.d > 0.9 && tb.d > 0.9) {
        // eixo "horizontal" de cada uma projetado no plano: diferença de ângulo arredondada a 90°
        const ha = held.ax[(hb.i + 1) % 3], ta = nearest.ax[(tb.i + 1) % 3];
        const a1 = Math.atan2(ha.x, ha.z), a2 = Math.atan2(ta.x, ta.z);
        let d = a2 - a1; d -= Math.round(d / (Math.PI / 2)) * (Math.PI / 2);
        if (Math.abs(d) > 1e-4) {
          const pivot = center();
          quaternion.premultiply(_q.setFromAxisAngle(up, d)).normalize();
          position.sub(pivot).applyAxisAngle(up, d).add(pivot);
        }
        held = boxOf(center(), quaternion, size.toArray().map((v) => v / 2));
      }
    }
    // 2) pontos da peça carregada e das peças da jangada
    const hBottom = facePoints(held, faceToward(held, up.clone().negate()));
    const hSide = sidePoints(held, up);
    const tTop = [], tSide = [];
    for (const b of boxes) {
      if (slotBoxes.includes(b)) { tTop.push(...facePoints(b, faceToward(b, up.clone().negate())).map((t) => ({ ...t, slot: true }))); continue; }
      tTop.push(...facePoints(b, faceToward(b, up))); tSide.push(...sidePoints(b, up));
    }
    // histerese: o encaixe atual "segura" mais (raio maior e vantagem), então a peça não fica pulando
    // entre dois pontos vizinhos enquanto a mira treme
    const last = this.last, sticky = (t) => last && t.p.distanceToSquared(last) < 0.0025;
    const score = (d, t) => d - (sticky(t) ? 0.2 : 0), radius = (t) => (sticky(t) ? SNAP_RADIUS * 1.5 : SNAP_RADIUS);
    let best = null;
    // a) MIRA: a bolinha mais perto da linha da mira (com tolerância que cresce com a distância)
    if (ray) {
      let aim = null;
      const consider = (t, side) => {
        const v = t.p.clone().sub(ray.origin), along = v.dot(ray.direction);
        if (along < 0.3 || along > maxDist) return;
        const perp = v.addScaledVector(ray.direction, -along).length(), tol = 0.14 + along * 0.025;
        if (perp > tol) return;
        const sc = perp / along - (sticky(t) ? 0.02 : 0);
        if (!aim || sc < aim.sc) aim = { t, side, sc };
      };
      for (const t of tTop) consider(t, false);
      for (const t of tSide) if (t.k === 's') consider(t, true);
      if (aim) {
        const t = aim.t, cands = aim.side ? hSide.filter((h) => h.k === 's' && h.n.dot(t.n) < -0.85) : hBottom.filter((h) => h.k === t.k);
        let hb = null, hd = Infinity;
        for (const h of cands) { const d = h.p.distanceToSquared(t.p); if (d < hd) { hd = d; hb = h; } }
        if (hb) best = { d: 0, s: -1, h: hb, t, aim: true };
      }
    }
    if (!best) for (const h of hBottom) for (const t of tTop) {
      if (h.k !== t.k) continue;
      const d = h.p.distanceTo(t.p), sc = score(d, t); if (d < radius(t) && (!best || sc < best.s)) best = { d, s: sc, h, t };
    }
    if (!best || !best.aim) for (const h of hSide) for (const t of tSide) {
      if (h.k !== t.k || h.n.dot(t.n) > -0.85) continue;
      const d = h.p.distanceTo(t.p), sc = score(d, t) + 0.02; if (d < radius(t) && (!best || sc < best.s)) best = { d, s: sc, h, t };
    }
    this.last = best ? best.t.p.clone() : null;
    if (best) {
      const delta = best.t.p.clone().sub(best.h.p);
      position.add(delta);
      for (const h of hBottom) h.p.add(delta);
      for (const h of hSide) h.p.add(delta);
      this.result = { target: best.t.p.clone(), aim: !!best.aim };
    }
    // 3) bolinhas: pontos livres das peças (amarelos), da peça carregada (azuis) e o encaixe (verde)
    const dots = this.dots, col = new THREE.Color();
    let n = 0;
    const put = (p, r, hex) => {
      if (n >= MAX_DOTS) return;
      const camD = this.G.camera.position.distanceTo(p), s = r * Math.max(1, camD / 6);
      _m.compose(p, _q.identity(), _v.set(s, s, s)); dots.setMatrixAt(n, _m); dots.setColorAt(n, col.setHex(hex)); n++;
    };
    const hc = center();
    for (const t of tTop) if (t.p.distanceTo(hc) < SHOW_RANGE + (t.slot ? 4 : 0)) put(t.p, t.k === 'c' ? 0.05 : 0.038, t.slot ? 0xf3c45f : t.k === 'k' ? 0xffb347 : 0xffe28a);
    for (const t of tSide) if (t.k === 's' && t.p.distanceTo(hc) < SHOW_RANGE) put(t.p, 0.034, 0xf6f0d8);
    for (const h of hBottom) put(h.p, 0.03, 0x6fd6f5);
    for (const h of hSide) if (h.k === 's') put(h.p, 0.026, 0x6fd6f5);
    if (best) put(best.t.p, 0.085, 0x3dff7a);
    dots.count = n;
    dots.instanceMatrix.needsUpdate = true;
    if (dots.instanceColor) dots.instanceColor.needsUpdate = true;
    return !!best;
  }
}
