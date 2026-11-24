// Efeitos visuais gerais (G.vfx): partículas com COR POR PARTÍCULA (um pool aditivo para brilhos —
// faíscas, eletricidade, brasas — e um pool normal para lascas, poeira e respingos), anéis de choque
// que se espalham e clarões. Tudo em poucos draw calls; nada aloca por quadro.
import * as THREE from '../three.js';

class Pool {
  constructor(scene, max, additive) {
    this.max = max; this.list = [];
    const g = new THREE.BufferGeometry();
    this.pos = new Float32Array(max * 3); this.col = new Float32Array(max * 3); this.alpha = new Float32Array(max); this.size = new Float32Array(max);
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    g.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1));
    g.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1));
    this.mesh = new THREE.Points(g, new THREE.ShaderMaterial({
      vertexShader: `attribute float aAlpha; attribute float aSize; attribute vec3 color; varying float vA; varying vec3 vC;
        void main() { vA = aAlpha; vC = color; vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = aSize * 320.0 / max(1.0, -mv.z); gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `varying float vA; varying vec3 vC;
        void main() { float d = length(gl_PointCoord - 0.5); if (d > 0.5) discard;
          gl_FragColor = vec4(vC, vA * smoothstep(0.5, ${additive ? '0.0' : '0.25'}, d)); }`,
      transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    }));
    this.mesh.frustumCulled = false; this.mesh.userData.noShadow = true;
    scene.add(this.mesh);
  }
  emit(x, y, z, vx, vy, vz, life, size, color, grav = 0, drag = 0, grow = 0) {
    if (this.list.length >= this.max) this.list.shift();
    const c = _c.set(color);
    this.list.push({ x, y, z, vx, vy, vz, life, t: 0, size, r: c.r, g: c.g, b: c.b, grav, drag, grow });
  }
  update(dt) {
    let n = 0;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const p = this.list[i]; p.t += dt;
      if (p.t >= p.life) { this.list.splice(i, 1); continue; }
      const k = Math.exp(-p.drag * dt); p.vx *= k; p.vz *= k; p.vy = p.vy * k - p.grav * dt;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
    }
    for (const p of this.list) {
      const u = p.t / p.life;
      this.pos[n * 3] = p.x; this.pos[n * 3 + 1] = p.y; this.pos[n * 3 + 2] = p.z;
      this.col[n * 3] = p.r; this.col[n * 3 + 1] = p.g; this.col[n * 3 + 2] = p.b;
      this.alpha[n] = (1 - u) * (u < 0.1 ? u / 0.1 : 1); this.size[n] = p.size * (1 + p.grow * u);
      n++;
    }
    const g = this.mesh.geometry; g.setDrawRange(0, n);
    for (const a of ['position', 'color', 'aAlpha', 'aSize']) g.attributes[a].needsUpdate = true;
  }
}
const _c = new THREE.Color();
const RING = new THREE.RingGeometry(0.82, 1, 48).rotateX(-Math.PI / 2);
const BALL = new THREE.IcosahedronGeometry(1, 2);

export class VFX {
  constructor(scene) {
    this.scene = scene;
    this.glow = new Pool(scene, 900, true);   // faíscas, brasas, eletricidade
    this.flat = new Pool(scene, 700, false);  // lascas, poeira, respingos
    this.fx = [];                              // anéis e clarões
  }
  // faíscas brilhantes espalhando (acerto, metal com metal, eletricidade)
  sparks(p, n = 12, color = 0xffe2a0, speed = 6, life = 0.45) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * 6.28, e = (Math.random() - 0.3) * 1.6, s = speed * (0.4 + Math.random() * 0.8);
      this.glow.emit(p.x, p.y, p.z, Math.cos(a) * Math.cos(e) * s, Math.sin(e) * s + 1.5, Math.sin(a) * Math.cos(e) * s, life * (0.6 + Math.random() * 0.6), 0.09 + Math.random() * 0.08, color, 9, 1.5);
    }
  }
  // lascas coloridas que caem (pedaços do inimigo acertado, madeira, terra)
  chips(p, n = 10, color = 0xffffff, speed = 4, dir = null) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * 6.28, s = speed * (0.4 + Math.random() * 0.8);
      const vx = Math.cos(a) * s + (dir ? dir.x * speed : 0), vz = Math.sin(a) * s + (dir ? dir.z * speed : 0);
      const c = _c.set(color).offsetHSL(0, 0, (Math.random() - 0.5) * 0.2).getHex();
      this.flat.emit(p.x, p.y, p.z, vx, 2 + Math.random() * 4, vz, 0.6 + Math.random() * 0.5, 0.1 + Math.random() * 0.1, c, 14, 0.5);
    }
  }
  // poeira baixa que se espalha (aterrissagem, esquiva, pisão)
  dust(p, n = 10, color = 0xcbbf9e, speed = 2.5) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * 6.28, s = speed * (0.5 + Math.random() * 0.7);
      this.flat.emit(p.x + Math.cos(a) * 0.2, p.y + 0.08, p.z + Math.sin(a) * 0.2, Math.cos(a) * s, 0.3 + Math.random() * 0.6, Math.sin(a) * s, 0.7 + Math.random() * 0.5, 0.35 + Math.random() * 0.3, color, 0.5, 2.5, 1.6);
    }
  }
  // brasas que sobem (fogo, maçarico, solda)
  embers(p, n = 6, color = 0xff8a2a, spread = 0.6) {
    for (let i = 0; i < n; i++) this.glow.emit(p.x + (Math.random() - 0.5) * spread, p.y, p.z + (Math.random() - 0.5) * spread, (Math.random() - 0.5) * 1.2, 1.5 + Math.random() * 2.5, (Math.random() - 0.5) * 1.2, 0.8 + Math.random() * 0.8, 0.08 + Math.random() * 0.08, color, -0.5, 0.8);
  }
  // anel de choque no chão que se espalha
  ring(p, { color = 0xffffff, from = 0.4, to = 4, life = 0.5, opacity = 0.85, additive = true, y = 0.06 } = {}) {
    const m = new THREE.Mesh(RING, new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending }));
    m.position.set(p.x, p.y + y, p.z); m.scale.setScalar(from); m.userData.noShadow = true; this.scene.add(m);
    this.fx.push({ m, t: 0, life, from, to, opacity, kind: 'ring' });
  }
  // clarão esférico rápido
  flash(p, { color = 0xfff0c0, size = 1.2, life = 0.18 } = {}) {
    const m = new THREE.Mesh(BALL, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending }));
    m.position.copy(p); m.scale.setScalar(size * 0.4); m.userData.noShadow = true; this.scene.add(m);
    this.fx.push({ m, t: 0, life, from: size * 0.4, to: size, opacity: 0.9, kind: 'flash' });
  }
  // ---- combos prontos ----
  hit(p, color, heavy = false) { // acerto num inimigo: faíscas + pedacinhos da cor dele
    this.sparks(p, heavy ? 16 : 9, 0xfff0c8, heavy ? 8 : 5.5, 0.35);
    this.chips(p, heavy ? 12 : 6, color, heavy ? 4.5 : 3);
    if (heavy) this.flash(p, { size: 0.9, life: 0.12 });
  }
  death(p, color) { // inimigo caindo: estouro de pedaços, faíscas e anel
    this.chips(p, 26, color, 6);
    this.sparks(p, 18, 0xffe2a0, 7, 0.5);
    this.flash(p, { color: 0xffffff, size: 1.4, life: 0.2 });
    this.ring({ x: p.x, y: p.y - 0.9, z: p.z }, { color, from: 0.3, to: 3.2, life: 0.45, opacity: 0.7, additive: false });
  }
  zap(p, color = 0x8fd0ff) { // eletricidade
    this.sparks(p, 18, color, 9, 0.3); this.flash(p, { color, size: 1.6, life: 0.14 });
  }
  shock(p, color = 0xe8d2a0, to = 6) { // impacto no chão
    this.dust(p, 16); this.ring(p, { color, from: 0.5, to, life: 0.55, opacity: 0.8, additive: false });
  }
  update(dt) {
    this.glow.update(dt); this.flat.update(dt);
    for (let i = this.fx.length - 1; i >= 0; i--) {
      const f = this.fx[i]; f.t += dt;
      const u = f.t / f.life;
      if (u >= 1) { this.scene.remove(f.m); f.m.material.dispose(); this.fx.splice(i, 1); continue; }
      const e = 1 - (1 - u) * (1 - u);
      f.m.scale.setScalar(f.from + (f.to - f.from) * e);
      f.m.material.opacity = f.opacity * (1 - u) * (f.kind === 'flash' ? 1 - u : 1);
    }
  }
}
