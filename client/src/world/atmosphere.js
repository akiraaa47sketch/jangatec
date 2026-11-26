// Atmosfera: céu em gradiente (domo), mapa de ambiente (IBL), sombras do sol que seguem a
// câmera e marcação automática de quem projeta/recebe sombra. O clima (startup.js) continua
// mandando em cor do fundo/neblina e intensidade do sol; aqui só lemos esses valores.
import * as THREE from '../three.js';

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

// Trecho GLSL compartilhado por céu e água (a água reflete exatamente o céu que se vê).
export const SKY_GLSL = /* glsl */`
uniform vec3 uSkyHorizon;
uniform vec3 uSkyZenith;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform float uStorm;
vec3 skyColor(vec3 d) {
  float h = clamp(d.y, 0.0, 1.0);
  vec3 c = mix(uSkyHorizon, uSkyZenith, pow(h, 0.42));
  float sd = max(dot(d, uSunDir), 0.0);
  float clear = 1.0 - uStorm * 0.85;
  c += uSunColor * (pow(sd, 5.0) * 0.07 + pow(sd, 70.0) * 0.30) * clear;
  vec2 hd = normalize(d.xz + vec2(1e-4)), sz = normalize(uSunDir.xz + vec2(1e-4));
  c += vec3(1.0, 0.52, 0.22) * pow(max(dot(hd, sz), 0.0), 4.0) * exp(-h * 7.0) * 0.16 * clear;
  return c;
}`;

export const skyUniformDefs = () => ({
  uSkyHorizon: { value: new THREE.Color() },
  uSkyZenith: { value: new THREE.Color() },
  uSunDir: { value: new THREE.Vector3(0, 1, 0) },
  uSunColor: { value: new THREE.Color() },
  uStorm: { value: 0 },
});

const CLEAR_ZENITH = new THREE.Color(0x2f78cf);

export class Atmosphere {
  constructor(renderer, scene, { sun, hemisphere }) {
    this.renderer = renderer; this.scene = scene; this.sun = sun; this.hemisphere = hemisphere;
    this.sunDir = sun.position.clone().sub(sun.target.position).normalize();
    this.shadowSize = 52;
    this.shadowTimer = 0;
    // estado lido pela água
    this.state = {
      horizon: new THREE.Color(), zenith: new THREE.Color(), sunColor: new THREE.Color(),
      sunDir: this.sunDir, storm: 0, light: 1,
    };

    // ---- sombras ----
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const c = sun.shadow.camera;
    c.left = -this.shadowSize; c.right = this.shadowSize; c.top = this.shadowSize; c.bottom = -this.shadowSize;
    c.near = 1; c.far = 320;
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.05;
    scene.add(sun.target);

    // ---- domo do céu ----
    this.skyUniforms = skyUniformDefs();
    this.skyMat = new THREE.ShaderMaterial({
      uniforms: this.skyUniforms, side: THREE.BackSide, depthWrite: false, fog: false,
      vertexShader: /* glsl */`
        varying vec3 vDir;
        void main() { vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */`
        varying vec3 vDir;
        ${SKY_GLSL}
        void main() {
          gl_FragColor = vec4(skyColor(normalize(vDir)), 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    this.dome = new THREE.Mesh(new THREE.SphereGeometry(420, 32, 16), this.skyMat);
    this.dome.frustumCulled = false; this.dome.renderOrder = -1000; this.dome.userData.noShadow = true;
    scene.add(this.dome);

    this._computeState();
    this._pushSky(this.skyUniforms);
    this._buildEnvironment();
  }

  // Mapa de ambiente estático do céu limpo: dá brilho real a metais e reflexos suaves.
  _buildEnvironment() {
    const envScene = new THREE.Scene();
    const mat = this.skyMat.clone();
    mat.uniforms = THREE.UniformsUtils.clone(this.skyUniforms);
    this._pushSky(mat.uniforms);
    const dome = new THREE.Mesh(new THREE.SphereGeometry(420, 32, 16), mat);
    envScene.add(dome);
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    const rt = pmrem.fromScene(envScene, 0, 0.1, 1000);
    this.scene.environment = rt.texture;
    this.scene.environmentIntensity = 0.32;
    pmrem.dispose();
    mat.dispose();
  }

  _computeState() {
    const s = this.state, sc = this.scene, sun = this.sun;
    const horizon = sc.fog ? sc.fog.color : (sc.background && sc.background.isColor ? sc.background : s.horizon);
    s.horizon.copy(horizon);
    s.storm = clamp((1.7 - sun.intensity) / 0.95, 0, 1);
    s.zenith.copy(CLEAR_ZENITH).lerp(horizon.clone().multiplyScalar(0.78), s.storm);
    s.sunColor.copy(sun.color).multiplyScalar(clamp(sun.intensity / 1.7, 0, 1));
    s.light = clamp(this.hemisphere.intensity / 1.15, 0.2, 1.2);
  }
  _pushSky(u) {
    const s = this.state;
    u.uSkyHorizon.value.copy(s.horizon); u.uSkyZenith.value.copy(s.zenith);
    u.uSunDir.value.copy(s.sunDir); u.uSunColor.value.copy(s.sunColor); u.uStorm.value = s.storm;
  }
  // A água chama isto para receber as mesmas cores do céu.
  applySky(uniforms) { this._pushSky(uniforms); }

  update(dt, camera) {
    this._computeState();
    this._pushSky(this.skyUniforms);
    this.dome.position.copy(camera.position);

    // Sombra do sol segue a câmera (um pouco à frente) e "gruda" na grade de texels:
    // sem isso a sombra treme quando o jogador anda.
    const fwd = new THREE.Vector3(); camera.getWorldDirection(fwd);
    const focus = camera.position.clone().addScaledVector(fwd, 18);
    const d = this.sunDir;
    const right = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), d).normalize();
    const up = new THREE.Vector3().crossVectors(d, right).normalize();
    const texel = (this.shadowSize * 2) / this.sun.shadow.mapSize.x;
    const x = Math.round(focus.dot(right) / texel) * texel, y = Math.round(focus.dot(up) / texel) * texel, z = focus.dot(d);
    focus.set(0, 0, 0).addScaledVector(right, x).addScaledVector(up, y).addScaledVector(d, z);
    this.sun.target.position.copy(focus);
    this.sun.position.copy(focus).addScaledVector(d, 150);
    this.sun.target.updateMatrixWorld();

    this.shadowTimer -= dt;
    if (this.shadowTimer <= 0) { this.shadowTimer = 0.5; this.markShadows(); } // procura objetos novos 2×/s
  }

  // Tudo que é malha opaca projeta e recebe sombra, exceto água/céu/transparentes/marcados.
  markShadows() {
    this.scene.traverse((o) => {
      if (!o.isMesh || o.userData._sh) return;
      o.userData._sh = true;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      if (o.userData.noShadow || mats.some((m) => !m || m.isShaderMaterial || m.transparent || m.isMeshBasicMaterial)) return;
      o.castShadow = true; o.receiveShadow = true;
      // receiveShadow muda o programa do material — mas só precisa avisar UMA vez por material (antes
      // cada objeto novo forçava recompilar materiais compartilhados por centenas de objetos)
      for (const m of mats) if (!m.userData._shReady) { m.userData._shReady = true; m.needsUpdate = true; }
    });
  }
}
