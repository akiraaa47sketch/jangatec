// Explosões (barris, benchmark): bola de fogo aditiva, fumaça que sobe, faíscas, destroços com
// gravidade, onda de choque no chão/água e um clarão de luz. Geometrias/materiais compartilhados.
import * as THREE from '../three.js';

const SPHERE = new THREE.IcosahedronGeometry(1, 2);
const RING = new THREE.RingGeometry(0.8, 1, 48).rotateX(-Math.PI / 2);
const CHUNK = new THREE.BoxGeometry(0.16, 0.1, 0.24);
let dotTex = null;
function dot() {
  if (dotTex) return dotTex;
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.4, 'rgba(255,220,150,0.6)'); gr.addColorStop(1, 'rgba(255,160,60,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  dotTex = new THREE.CanvasTexture(c); return dotTex;
}

export class Explosions {
  constructor(scene) {
    this.scene = scene; this.list = [];
    this.light = new THREE.PointLight(0xffa640, 0, 40, 1.6);
    scene.add(this.light);
  }

  spawn(pos, size = 1) {
    const g = new THREE.Group(); g.position.copy(pos);
    const fire = [], smoke = [], debris = [];
    for (let i = 0; i < 7; i++) {
      const m = new THREE.Mesh(SPHERE, new THREE.MeshBasicMaterial({ color: i < 3 ? 0xfff0b0 : 0xff7a1a, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false }));
      const d = new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.8, Math.random() - 0.5).multiplyScalar(size * 0.9);
      m.position.copy(d); m.userData.v = d.clone().multiplyScalar(1.5); m.userData.s = size * (0.5 + Math.random() * 0.6);
      g.add(m); fire.push(m);
    }
    for (let i = 0; i < 10; i++) {
      const m = new THREE.Mesh(SPHERE, new THREE.MeshStandardMaterial({ color: 0x2f2a27, roughness: 1, transparent: true, opacity: 0, depthWrite: false }));
      m.position.set((Math.random() - 0.5) * size, Math.random() * size * 0.6, (Math.random() - 0.5) * size);
      m.userData.v = new THREE.Vector3((Math.random() - 0.5) * 1.2, 1.6 + Math.random() * 1.6, (Math.random() - 0.5) * 1.2).multiplyScalar(size);
      m.userData.s = size * (0.4 + Math.random() * 0.5);
      g.add(m); smoke.push(m);
    }
    const wood = new THREE.MeshStandardMaterial({ color: 0x5a3b22, roughness: 0.9 });
    for (let i = 0; i < 14; i++) {
      const m = new THREE.Mesh(CHUNK, wood);
      const a = Math.random() * Math.PI * 2, sp = (4 + Math.random() * 7) * size;
      m.userData.v = new THREE.Vector3(Math.cos(a) * sp, (5 + Math.random() * 7) * size, Math.sin(a) * sp);
      m.userData.w = new THREE.Vector3(Math.random() * 9, Math.random() * 9, Math.random() * 9);
      m.scale.setScalar(size * (0.6 + Math.random()));
      g.add(m); debris.push(m);
    }
    const sparkPos = new Float32Array(60 * 3), sparkVel = [];
    for (let i = 0; i < 60; i++) sparkVel.push(new THREE.Vector3((Math.random() - 0.5) * 16, Math.random() * 14, (Math.random() - 0.5) * 16).multiplyScalar(size));
    const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(sparkPos, 3));
    const sparks = new THREE.Points(sg, new THREE.PointsMaterial({ map: dot(), size: 0.45 * size, color: 0xffc060, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    sparks.frustumCulled = false; g.add(sparks);
    const ring = new THREE.Mesh(RING, new THREE.MeshBasicMaterial({ color: 0xfff1d0, transparent: true, opacity: 0.8, depthWrite: false, side: THREE.DoubleSide }));
    ring.position.y = 0.1; g.add(ring);
    this.scene.add(g);
    this.list.push({ g, fire, smoke, debris, sparks, sparkVel, ring, t: 0, size, pos: pos.clone() });
    this.light.position.copy(pos).add(new THREE.Vector3(0, 1.5 * size, 0));
    this.light.intensity = 260 * size;
  }

  update(dt) {
    this.light.intensity = Math.max(0, this.light.intensity - dt * 900);
    for (let i = this.list.length - 1; i >= 0; i--) {
      const e = this.list[i]; e.t += dt; const t = e.t;
      for (const m of e.fire) {
        m.position.addScaledVector(m.userData.v, dt); m.userData.v.multiplyScalar(0.92);
        m.scale.setScalar(m.userData.s * (0.4 + Math.min(1, t * 5) * 1.3));
        m.material.opacity = Math.max(0, 1 - t / 0.7);
      }
      for (const m of e.smoke) {
        m.position.addScaledVector(m.userData.v, dt); m.userData.v.multiplyScalar(0.985);
        m.scale.setScalar(m.userData.s * (0.6 + t * 1.1));
        m.material.opacity = Math.min(0.75, t * 3) * Math.max(0, 1 - t / 4.5);
      }
      for (const m of e.debris) {
        m.userData.v.y -= 18 * dt; m.position.addScaledVector(m.userData.v, dt);
        m.rotation.x += m.userData.w.x * dt; m.rotation.y += m.userData.w.y * dt;
        if (m.position.y < -0.2) { m.position.y = -0.2; m.userData.v.set(0, 0, 0); m.userData.w.set(0, 0, 0); }
      }
      const sp = e.sparks.geometry.attributes.position.array;
      e.sparkVel.forEach((v, k) => { v.y -= 14 * dt; sp[k * 3] += v.x * dt; sp[k * 3 + 1] += v.y * dt; sp[k * 3 + 2] += v.z * dt; });
      e.sparks.geometry.attributes.position.needsUpdate = true;
      e.sparks.material.opacity = Math.max(0, 1 - t / 1.4);
      e.ring.scale.setScalar(1 + t * 22 * e.size); e.ring.material.opacity = Math.max(0, 0.8 - t * 1.6);
      if (t > 5) {
        this.scene.remove(e.g);
        e.g.traverse((o) => { if (o.material && o.geometry !== SPHERE) {} if (o.material) o.material.dispose(); });
        e.sparks.geometry.dispose();
        this.list.splice(i, 1);
      }
    }
  }
}
