// Chuva: gotas como RISCOS (não pontinhos — pareciam neve). Cada gota é um traço comprido que cai
// rápido, inclinado pelo vento, com a cauda sumindo; ao bater na água ou no convés vira um respingo
// (anel que abre e some). Tudo em volta da câmera; a quantidade cresce com a força da chuva.
import * as THREE from '../three.js';
import { waveHeight } from './ocean.js';
import { clock } from '../core/util.js';

const N = 2200;          // gotas no máximo
const RADIUS = 30;       // raio em volta da câmera
const TOP = 24, BOTTOM = -12;
const SPLASHES = 160;

export class Rain {
  constructor(G) {
    this.G = G;
    this.x = new Float32Array(N); this.y = new Float32Array(N); this.z = new Float32Array(N);
    this.v = new Float32Array(N); this.len = new Float32Array(N);
    const pos = new Float32Array(N * 6), col = new Float32Array(N * 6);
    for (let i = 0; i < N; i++) {
      this._spawn(i, 0, 0, 0, true);
      // cabeça clara, cauda escura (some no céu cinza)
      col.set([0.62, 0.69, 0.76, 0.26, 0.31, 0.37], i * 6);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    this.lines = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0, depthWrite: false, fog: true }));
    this.lines.frustumCulled = false; this.lines.visible = false; this.lines.userData.noShadow = true;
    G.scene.add(this.lines);

    // respingos: anéis achatados que abrem e somem (cor vai a preto = some, com mistura aditiva)
    const ring = new THREE.RingGeometry(0.05, 0.11, 14); ring.rotateX(-Math.PI / 2);
    this.splash = new THREE.InstancedMesh(ring, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, fog: true }), SPLASHES);
    this.splash.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.splash.frustumCulled = false; this.splash.visible = false; this.splash.userData.noShadow = true;
    this.sp = Array.from({ length: SPLASHES }, () => ({ x: 0, y: -1e4, z: 0, t: 1 }));
    this.spi = 0;
    const black = new THREE.Color(0, 0, 0);
    for (let i = 0; i < SPLASHES; i++) this.splash.setColorAt(i, black);
    G.scene.add(this.splash);
    this._m = new THREE.Matrix4(); this._c = new THREE.Color(); this._q = new THREE.Quaternion(); this._s = new THREE.Vector3(); this._p = new THREE.Vector3();
  }

  _spawn(i, cx, cy, cz, anyHeight = false) {
    const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * RADIUS;
    this.x[i] = cx + Math.cos(a) * r; this.z[i] = cz + Math.sin(a) * r;
    this.y[i] = cy + (anyHeight ? BOTTOM + Math.random() * (TOP - BOTTOM) : TOP - Math.random() * 6);
    this.v[i] = 17 + Math.random() * 9;
    this.len[i] = 0.035 + Math.random() * 0.025; // comprimento do risco = velocidade × isto (s)
  }

  _addSplash(x, y, z) {
    const s = this.sp[this.spi = (this.spi + 1) % SPLASHES];
    s.x = x; s.y = y + 0.03; s.z = z; s.t = 0;
  }

  // strength 0..1 (força da chuva), storm 0..1 (vento)
  update(dt, strength, storm) {
    const on = strength > 0.01;
    this.lines.visible = this.splash.visible = on;
    if (!on) return;
    const G = this.G, cam = G.camera.position, boat = G.boat, t = clock();
    const count = Math.round(N * (0.25 + 0.75 * strength));
    this.lines.geometry.setDrawRange(0, count * 2);
    this.lines.material.opacity = 0.22 + 0.3 * strength;
    const wx = 2 + storm * 9, wz = 0.8 + storm * 3;      // vento inclina a chuva
    const pos = this.lines.geometry.attributes.position.array;
    const level = G.startup ? G.startup.waterLevel : 0;
    const onRaftR = boat.set.radius - 0.3, deckY = boat.set.y + 0.36;
    let splashBudget = Math.ceil(dt * 260 * strength);
    for (let i = 0; i < count; i++) {
      const v = this.v[i];
      this.x[i] += wx * dt; this.z[i] += wz * dt; this.y[i] -= v * dt;
      // saiu da área em volta da câmera (ela andou ou o vento levou): volta do outro lado
      const dx = this.x[i] - cam.x, dz = this.z[i] - cam.z;
      if (dx * dx + dz * dz > RADIUS * RADIUS * 1.2) { this._spawn(i, cam.x, cam.y, cam.z, true); continue; }
      // chegou na água (ou no convés): respingo e recomeça lá em cima
      let floor = cam.y + BOTTOM;
      if (this.y[i] < cam.y + 4) {
        const lx = this.x[i] - boat.x, lz = this.z[i] - boat.z;
        floor = Math.max(floor, lx * lx + lz * lz < onRaftR * onRaftR ? deckY : level - 0.3);
      }
      if (this.y[i] < floor) {
        if (splashBudget > 0 && dx * dx + dz * dz < 18 * 18) {
          splashBudget--;
          const lx = this.x[i] - boat.x, lz = this.z[i] - boat.z;
          const y = lx * lx + lz * lz < onRaftR * onRaftR ? deckY : waveHeight(this.x[i], this.z[i], t);
          this._addSplash(this.x[i], y, this.z[i]);
        }
        this._spawn(i, cam.x, cam.y, cam.z);
      }
      const k = this.len[i], o = i * 6;
      pos[o] = this.x[i]; pos[o + 1] = this.y[i]; pos[o + 2] = this.z[i];
      pos[o + 3] = this.x[i] - wx * k; pos[o + 4] = this.y[i] + v * k; pos[o + 5] = this.z[i] - wz * k;
    }
    this.lines.geometry.attributes.position.needsUpdate = true;

    // respingos abrindo e sumindo (~0,28 s)
    const m = this._m, c = this._c, q = this._q, s = this._s, p = this._p;
    for (let i = 0; i < SPLASHES; i++) {
      const sp = this.sp[i];
      if (sp.t < 1) sp.t = Math.min(1, sp.t + dt / 0.28);
      const u = sp.t;
      s.setScalar(u >= 1 ? 0.0001 : 0.6 + u * 2.6);
      m.compose(p.set(sp.x, sp.y, sp.z), q, s);
      this.splash.setMatrixAt(i, m);
      c.setScalar(u >= 1 ? 0 : (1 - u) * 0.9);
      this.splash.setColorAt(i, c);
    }
    this.splash.instanceMatrix.needsUpdate = true;
    if (this.splash.instanceColor) this.splash.instanceColor.needsUpdate = true;
  }
}
