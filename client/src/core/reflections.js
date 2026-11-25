// Reflexos (menu Gráficos → Reflexos):
//   • off   — como antes (só a luz ambiente fraca do céu).
//   • ceu   — metais refletem o céu de verdade (mapa de ambiente com intensidade alta).
//   • alta  — além disso, uma "câmera de reflexo" (CubeCamera) em cima da jangada fotografa a cena em
//             volta (mar, céu, ilhas, navios, raios) a cada ~0,8 s: metais e a jangada MOLHADA refletem
//             o que está ao redor. ultra = mais nítido e atualiza ~4×/s.
// Jangada molhada (opção à parte): a chuva molha a madeira aos poucos (escurece, fica lisa e
// brilhante, aparecem poças no convés que refletem o céu) e o sol seca tudo com o tempo.
import * as THREE from '../three.js';
import { PIECES } from '../boat/pieces.js';

const PROBE = { alta: { size: 128, every: 0.8 }, ultra: { size: 256, every: 0.25 } };
const METAL = 0.35;          // metalness a partir da qual o material conta como metal
const SKY_I = 0.32;          // intensidade padrão do céu (atmosphere.js) — madeira seca fica igual a antes

export class Reflections {
  constructor(G) {
    this.G = G;
    this.wet = 0;              // 0 seco … 1 encharcado
    this.probe = null; this.probeT = 0; this.mode = null;
    this.raftMats = new Set(); // materiais (clonados) das peças da jangada
    this.puddles = []; this._pieceN = -1; this._scanT = 0;
    // partes fixas da jangada (barris, cordas, vela, bandeira) — o resto que entra no grupo do
    // barco (jogadores a bordo, saquinhos) não é "jangada" e não molha
    this.raftRoots = new Set(G.boat.group.children);
  }

  get settings() { return this.G.gfx ? this.G.gfx.settings : { reflect: 'ceu', wetRaft: true }; }

  // ---------- câmera de reflexo ----------
  _ensureProbe(mode) {
    const cfg = PROBE[mode];
    if (!cfg) { if (this.probe) { this.probe.rt.dispose(); this.probe = null; } return; }
    if (this.probe && this.probe.size === cfg.size) return;
    if (this.probe) this.probe.rt.dispose();
    const rt = new THREE.WebGLCubeRenderTarget(cfg.size, { type: THREE.HalfFloatType, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter });
    const cam = new THREE.CubeCamera(0.4, 420, rt);
    this.probe = { rt, cam, size: cfg.size };
    this.probeT = 0;
  }
  _renderProbe() {
    const G = this.G, r = G.renderer, p = this.probe, boat = G.boat;
    p.cam.position.set(boat.x, boat.set.y + 1.6, boat.z);
    // a jangada e o jogador não aparecem no próprio reflexo
    const hide = [boat.group, G.player.mesh], was = hide.map((o) => o.visible);
    hide.forEach((o) => { o.visible = false; });
    const shadowUp = r.shadowMap.needsUpdate; r.shadowMap.needsUpdate = false;
    p.cam.update(r, G.scene);
    r.shadowMap.needsUpdate = shadowUp;
    hide.forEach((o, i) => { o.visible = was[i]; });
    p.rt.texture.needsPMREMUpdate = true; // o three refaz os níveis de rugosidade a partir do cubo
  }
  envFor() { // mapa de ambiente para a jangada e os metais
    const mode = this.settings.reflect;
    if (mode === 'off') return null;
    if (this.probe) return this.probe.rt.texture;
    return this.G.scene.environment;
  }

  // ---------- materiais ----------
  // Metais: com reflexo ligado, recebem o mapa de ambiente com intensidade alta (refletem de verdade).
  _tuneMetals(env, near) {
    const scan = (root, local) => root.traverse((o) => {
      if (!o.isMesh || !o.material) return;
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
        if (!m.isMeshStandardMaterial || m.userData.raftMat || (m.metalness || 0) < METAL) continue;
        const ud = m.userData;
        if (ud.reflBase === undefined) ud.reflBase = { env: m.envMap, i: m.envMapIntensity };
        const want = env ? (local && near ? near : (this.G.scene.environment || env)) : ud.reflBase.env;
        if (m.envMap !== want) { m.envMap = want; m.needsUpdate = true; }
        m.envMapIntensity = env ? 0.9 + 0.6 * m.metalness : ud.reflBase.i;
      }
    });
    scan(this.G.scene, false);
    for (const p of this.G.boat.pieces.values()) if (p.mesh) scan(p.mesh, true);
    if (this.G.viewmodel && this.G.viewmodel.scene) scan(this.G.viewmodel.scene, true); // arma na mão
  }
  // Peças da jangada ganham material próprio (clonado) para poder molhar sem molhar o mundo todo.
  _collectRaft() {
    const boat = this.G.boat, roots = [...this.raftRoots, ...[...boat.pieces.values()].map((p) => p.mesh).filter(Boolean)];
    for (const root of roots) root.traverse((o) => {
      if (!o.isMesh || !o.material || o.userData.puddle) return;
      const list = Array.isArray(o.material) ? o.material : [o.material];
      const out = list.map((m) => {
        if (!m.isMeshStandardMaterial || m.transparent) return m;
        if (m.userData.raftMat) return m;
        const c = m.clone();
        c.userData = { raftMat: true, base: { r: c.roughness, col: c.color.clone(), i: c.envMapIntensity, env: c.envMap, metal: c.metalness } };
        this.raftMats.add(c);
        return c;
      });
      o.material = Array.isArray(o.material) ? out : out[0];
    });
  }
  // Poças no convés: manchas lisas e escuras que refletem o céu; aparecem com a jangada molhada.
  _makePuddles() {
    const G = this.G, boat = G.boat;
    for (const p of this.puddles) { p.parent && p.parent.remove(p); p.geometry.dispose(); }
    this.puddles = [];
    const floors = [...boat.pieces.values()].filter((p) => ['plataforma', 'piso'].includes(p.type) || (p.physObj && /Plataforma|Chão|piso/i.test(p.physObj.def && p.physObj.def.nome || '')));
    const mat = this.puddleMat || (this.puddleMat = new THREE.MeshStandardMaterial({
      color: 0x1d2a33, roughness: 0.03, metalness: 0.35, transparent: true, opacity: 0, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    }));
    mat.userData.raftMat = true; mat.userData.puddleMat = true;
    let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (const f of floors) {
      const size = (PIECES[f.type] && PIECES[f.type].size) || (f.physObj && f.physObj.def && f.physObj.def.size) || [4, 0.3, 4];
      const top = f.y + (size[1] || 0.3) / 2 + 0.012;
      for (let k = 0; k < 3; k++) {
        const n = 14, pts = [];
        const rad = 0.35 + rnd() * 0.5;
        for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2, rr = rad * (0.7 + rnd() * 0.5); pts.push(new THREE.Vector2(Math.cos(a) * rr, Math.sin(a) * rr * (0.6 + rnd() * 0.5))); }
        const geo = new THREE.ShapeGeometry(new THREE.Shape(pts)); geo.rotateX(-Math.PI / 2);
        const m = new THREE.Mesh(geo, mat);
        const lx = (rnd() - 0.5) * (size[0] - 1), lz = (rnd() - 0.5) * (size[2] - 1);
        const [ox, oz] = [lx * Math.cos(f.yaw || 0) + lz * Math.sin(f.yaw || 0), -lx * Math.sin(f.yaw || 0) + lz * Math.cos(f.yaw || 0)];
        m.position.set(f.x + ox, top, f.z + oz); m.rotation.y = rnd() * 6.28;
        m.userData.puddle = true; m.userData.noShadow = true; m.renderOrder = 1;
        boat.group.add(m); this.puddles.push(m);
      }
    }
  }
  _applyWet(env) {
    const on = this.settings.wetRaft !== false, w = on ? this.wet : 0, mode = this.settings.reflect;
    for (const m of this.raftMats) {
      const b = m.userData.base;
      m.roughness = b.r + (Math.min(b.r, 0.14) - b.r) * (0.9 * w);      // madeira molhada fica lisa
      m.color.copy(b.col).multiplyScalar(1 - 0.32 * w);                  // e mais escura
      const isMetal = (b.metal || 0) >= METAL;
      const want = env && (w > 0.02 || isMetal) ? env : b.env;
      if (m.envMap !== want) { m.envMap = want; m.needsUpdate = true; }
      m.envMapIntensity = want === b.env ? b.i : isMetal ? 0.9 + 0.6 * b.metal : SKY_I / 0.32 * (0.32 + (mode === 'off' ? 0 : 1.0) * w);
    }
    if (this.puddleMat) {
      const pm = this.puddleMat, want = env || this.G.scene.environment;
      if (pm.envMap !== want) { pm.envMap = want; pm.needsUpdate = true; }
      pm.envMapIntensity = 1.6;
      pm.opacity = Math.max(0, (w - 0.25) / 0.75) * 0.8;
      for (const p of this.puddles) p.visible = pm.opacity > 0.01;
    }
  }

  // ---------- loop ----------
  update(dt) {
    const G = this.G, s = this.settings, st = G.startup;
    if (!G.started) return;
    // molha com a chuva (encharca em ~10 s de chuva forte); seca no sol (~40 s) e devagar no nublado
    const rainK = st ? st.rainK || 0 : 0, sun = st ? 1 - (st.stormK || 0) : 1;
    if (rainK > 0.02) this.wet = Math.min(1, this.wet + dt * rainK / 10);
    else this.wet = Math.max(0, this.wet - dt * (0.006 + 0.022 * sun));
    // câmera de reflexo conforme a qualidade
    if (s.reflect !== this.mode) { this.mode = s.reflect; this._ensureProbe(s.reflect); this._scanT = 0; }
    if (this.probe) {
      this.probeT -= dt;
      if (this.probeT <= 0) { this.probeT = PROBE[this.mode].every; this._renderProbe(); }
    }
    const env = this.envFor();
    // de vez em quando procura peças novas na jangada e materiais metálicos novos no mundo
    this._scanT -= dt;
    if (this._scanT <= 0) {
      this._scanT = 1.5;
      this._collectRaft();
      if (G.boat.pieces.size !== this._pieceN) { this._pieceN = G.boat.pieces.size; this._makePuddles(); }
      this._tuneMetals(env, env);
    }
    this._applyWet(env);
  }
}
