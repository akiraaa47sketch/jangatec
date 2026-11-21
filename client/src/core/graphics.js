// Pipeline gráfico + opções.
//   cena (resolução reduzida, HDR linear, MSAA opcional) → bloom opcional
//   → EASU-lite: upscale bicúbico Catmull-Rom com anti-ringing (inspirado no FSR 1 da AMD)
//      + tone mapping (Neutral) + gradação de cor + vinheta, na resolução da tela
//   → RCAS (o afiador adaptativo do FSR 1) direto na tela.
// O viewmodel (braços/arma) é desenhado depois, em resolução cheia.
import * as THREE from '../three.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';

export const GFX_PRESETS = {
  baixo: { scale: 0.6, upscaler: 'fsr', sharpness: 0.45, shadows: 'off', msaa: 0, bloom: false, view: 1, water: 'baixa', grade: false, pixelCap: 1 },
  medio: { scale: 0.75, upscaler: 'fsr', sharpness: 0.35, shadows: 'baixa', msaa: 0, bloom: false, view: 2, water: 'media', grade: true, pixelCap: 1.5 },
  alto: { scale: 1, upscaler: 'fsr', sharpness: 0.2, shadows: 'alta', msaa: 4, bloom: true, view: 2, water: 'alta', grade: true, pixelCap: 2 },
  ultra: { scale: 1, upscaler: 'fsr', sharpness: 0.25, shadows: 'ultra', msaa: 8, bloom: true, view: 3, water: 'ultra', grade: true, pixelCap: 2 },
};
export const GFX_LABELS = {
  preset: { baixo: 'Baixo', medio: 'Médio', alto: 'Alto', ultra: 'Ultra (no talo)', custom: 'Personalizado' },
  upscaler: { fsr: 'FSR 1 (EASU + RCAS)', bilinear: 'Bilinear simples' },
  shadows: { off: 'Desligadas', baixa: 'Baixas (1024)', media: 'Médias (2048)', alta: 'Altas (2048, suaves)', ultra: 'Ultra (4096, suaves, longe)' },
  msaa: { 0: 'Desligado', 4: 'MSAA 4x', 8: 'MSAA 8x' },
  view: { 1: 'Curta', 2: 'Média', 3: 'Longa' },
  water: { baixa: 'Baixa', media: 'Média', alta: 'Alta', ultra: 'Ultra' },
  pixelCap: { 1: '1x', 1.5: '1,5x', 2: '2x (retina)' },
};
const SHADOW = { off: null, baixa: [1024, 52, false], media: [2048, 52, false], alta: [2048, 60, true], ultra: [4096, 85, true] };
const KEY = 'mare-alta-graficos';

// Tone mapping Neutral (Khronos) + gradação + vinheta; upscale Catmull-Rom com anti-ringing.
const EASU_FRAG = /* glsl */`
uniform sampler2D tInput; uniform vec2 uInSize; uniform float uExposure; uniform float uGrade; uniform float uBicubic;
varying vec2 vUv;
vec3 neutral(vec3 c) {
  c *= uExposure;
  float x = min(c.r, min(c.g, c.b)), off = x < 0.08 ? x - 6.25 * x * x : 0.04;
  c -= off;
  float peak = max(c.r, max(c.g, c.b));
  const float SC = 0.76, D = 0.15;
  if (peak < SC) return c;
  float d = 1.0 - SC, np = 1.0 - d * d / (peak + d - SC);
  c *= np / peak;
  return mix(c, vec3(np), 1.0 - 1.0 / (D * (peak - np) + 1.0));
}
vec3 tap(vec2 uv) { return texture2D(tInput, uv).rgb; }
// Catmull-Rom em 9 leituras bilineares (bicúbico nítido).
vec3 catmullRom(vec2 uv) {
  vec2 sp = uv * uInSize, tc = floor(sp - 0.5) + 0.5, f = sp - tc;
  vec2 w0 = f * (-0.5 + f * (1.0 - 0.5 * f)), w1 = 1.0 + f * f * (-2.5 + 1.5 * f);
  vec2 w2 = f * (0.5 + f * (2.0 - 1.5 * f)), w3 = f * f * (-0.5 + 0.5 * f);
  vec2 w12 = w1 + w2, o12 = w2 / w12;
  vec2 t0 = (tc - 1.0) / uInSize, t3 = (tc + 2.0) / uInSize, t12 = (tc + o12) / uInSize;
  vec3 r = vec3(0.0);
  r += tap(vec2(t0.x, t0.y)) * w0.x * w0.y + tap(vec2(t12.x, t0.y)) * w12.x * w0.y + tap(vec2(t3.x, t0.y)) * w3.x * w0.y;
  r += tap(vec2(t0.x, t12.y)) * w0.x * w12.y + tap(vec2(t12.x, t12.y)) * w12.x * w12.y + tap(vec2(t3.x, t12.y)) * w3.x * w12.y;
  r += tap(vec2(t0.x, t3.y)) * w0.x * w3.y + tap(vec2(t12.x, t3.y)) * w12.x * w3.y + tap(vec2(t3.x, t3.y)) * w3.x * w3.y;
  return r;
}
void main() {
  vec3 c;
  if (uBicubic > 0.5) {
    c = catmullRom(vUv);
    // anti-ringing (como no EASU): limita ao intervalo dos 4 texels mais próximos
    vec2 px = 1.0 / uInSize, b = (floor(vUv * uInSize - 0.5) + 0.5) * px;
    vec3 a0 = tap(b), a1 = tap(b + vec2(px.x, 0.0)), a2 = tap(b + vec2(0.0, px.y)), a3 = tap(b + px);
    c = clamp(c, min(min(a0, a1), min(a2, a3)), max(max(a0, a1), max(a2, a3)));
  } else c = tap(vUv);
  c = neutral(max(c, 0.0));
  if (uGrade > 0.5) {
    float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
    float sat = max(c.r, max(c.g, c.b)) - min(c.r, min(c.g, c.b));
    c = mix(vec3(l), c, 1.0 + 0.22 * (1.0 - sat));          // vibrância (realça cores apagadas)
    c = (c - 0.5) * 1.06 + 0.5;                                // contraste leve
    c *= vec3(1.02, 1.0, 0.97);                                // calor de fim de tarde
    vec2 q = vUv - 0.5; c *= 1.0 - dot(q, q) * 0.55;          // vinheta
  }
  gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
}`;

// RCAS — Robust Contrast Adaptive Sharpening (FSR 1). sharpness: 0 = máximo, 2 = suave (em stops).
const RCAS_FRAG = /* glsl */`
uniform sampler2D tInput; uniform vec2 uSize; uniform float uSharp; uniform float uEnabled;
varying vec2 vUv;
void main() {
  vec2 px = 1.0 / uSize;
  vec3 e = texture2D(tInput, vUv).rgb;
  if (uEnabled > 0.5) {
    vec3 b = texture2D(tInput, vUv + vec2(0.0, -px.y)).rgb, h = texture2D(tInput, vUv + vec2(0.0, px.y)).rgb;
    vec3 d = texture2D(tInput, vUv + vec2(-px.x, 0.0)).rgb, f = texture2D(tInput, vUv + vec2(px.x, 0.0)).rgb;
    vec3 mn4 = min(min(b, d), min(f, h)), mx4 = max(max(b, d), max(f, h));
    vec3 hitMin = mn4 / (4.0 * mx4 + 1e-5), hitMax = (1.0 - mx4) / (4.0 * mn4 - 4.0 - 1e-5);
    vec3 lobeRGB = max(-hitMin, hitMax);
    float lobe = max(-0.1875, min(max(lobeRGB.r, max(lobeRGB.g, lobeRGB.b)), 0.0)) * exp2(-uSharp);
    e = (lobe * (b + d + h + f) + e) / (4.0 * lobe + 1.0);
  }
  gl_FragColor = vec4(clamp(e, 0.0, 1.0), 1.0);
  #include <colorspace_fragment>
}`;
const VERT = 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';

export class Graphics {
  constructor(G, { renderer, scene, camera, sun, mobile }) {
    Object.assign(this, { G, renderer, scene, camera, sun, mobile });
    this.settings = this.load();
    this.fps = { frames: 0, acc: 0, value: 0, ms: 0 };
    this.fullRT = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, depthBuffer: false });
    this.easu = new FullScreenQuad(new THREE.ShaderMaterial({
      uniforms: { tInput: { value: null }, uInSize: { value: new THREE.Vector2() }, uExposure: { value: 1 }, uGrade: { value: 1 }, uBicubic: { value: 1 } },
      vertexShader: VERT, fragmentShader: EASU_FRAG, depthTest: false, depthWrite: false, toneMapped: false,
    }));
    this.rcas = new FullScreenQuad(new THREE.ShaderMaterial({
      uniforms: { tInput: { value: this.fullRT.texture }, uSize: { value: new THREE.Vector2() }, uSharp: { value: 0.3 }, uEnabled: { value: 1 } },
      vertexShader: VERT, fragmentShader: RCAS_FRAG, depthTest: false, depthWrite: false, toneMapped: false,
    }));
    this.buildComposer();
    this.apply();
  }

  // ---------- configurações ----------
  defaults() { return { preset: this.mobile ? 'medio' : 'alto', ...GFX_PRESETS[this.mobile ? 'medio' : 'alto'], showFps: false }; }
  load() {
    let s = null;
    try { s = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { s = null; }
    const d = this.defaults();
    if (!s || typeof s !== 'object') return d;
    const pick = (k, ok) => (ok(s[k]) ? s[k] : d[k]);
    return {
      preset: pick('preset', (v) => v in GFX_PRESETS || v === 'custom'),
      scale: pick('scale', (v) => Number.isFinite(v) && v >= 0.5 && v <= 1),
      upscaler: pick('upscaler', (v) => v in GFX_LABELS.upscaler),
      sharpness: pick('sharpness', (v) => Number.isFinite(v) && v >= 0 && v <= 2),
      shadows: pick('shadows', (v) => v in SHADOW),
      msaa: pick('msaa', (v) => [0, 4, 8].includes(v)),
      bloom: pick('bloom', (v) => typeof v === 'boolean'),
      view: pick('view', (v) => [1, 2, 3].includes(v)),
      water: pick('water', (v) => v in GFX_LABELS.water),
      grade: pick('grade', (v) => typeof v === 'boolean'),
      pixelCap: pick('pixelCap', (v) => [1, 1.5, 2].includes(v)),
      showFps: pick('showFps', (v) => typeof v === 'boolean'),
    };
  }
  save() { try { localStorage.setItem(KEY, JSON.stringify(this.settings)); } catch { /* sem armazenamento */ } }

  setPreset(name) {
    if (!GFX_PRESETS[name]) return;
    Object.assign(this.settings, GFX_PRESETS[name], { preset: name });
    this.apply(); this.save();
  }
  set(key, value) {
    this.settings[key] = value;
    if (key !== 'showFps') this.settings.preset = 'custom';
    this.apply(key); this.save();
  }

  // ---------- aplicação ----------
  buildComposer() {
    if (this.composer) { this.composer.dispose(); }
    const samples = Math.min(this.settings.msaa, this.renderer.capabilities.maxSamples || 0);
    const rt = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples });
    this.composer = new EffectComposer(this.renderer, rt);
    this.composer.renderToScreen = false;
    this.composer.setPixelRatio(1);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.32, 0.45, 0.92);
    this.bloom.enabled = this.settings.bloom;
    this.composer.addPass(this.bloom);
    this._msaa = this.settings.msaa;
  }

  apply(changed) {
    const s = this.settings, r = this.renderer, G = this.G;
    if (s.msaa !== this._msaa) this.buildComposer();
    this.bloom.enabled = s.bloom;
    r.setPixelRatio(Math.min(devicePixelRatio, s.pixelCap));
    // sombras
    const sh = SHADOW[s.shadows], wasOn = r.shadowMap.enabled;
    r.shadowMap.enabled = !!sh;
    if (sh) {
      // PCFSoftShadowMap saiu do three r18x: PCF + raio de filtro dá a borda suave.
      const [size, area, soft] = sh, type = THREE.PCFShadowMap;
      const typeChanged = r.shadowMap.type !== type;
      r.shadowMap.type = type;
      this.sun.shadow.radius = soft ? 3 : 1;
      if (this.sun.shadow.mapSize.x !== size) {
        this.sun.shadow.mapSize.set(size, size);
        if (this.sun.shadow.map) { this.sun.shadow.map.dispose(); this.sun.shadow.map = null; }
      }
      if (G.atmosphere) {
        G.atmosphere.shadowSize = area;
        const c = this.sun.shadow.camera; c.left = c.bottom = -area; c.right = c.top = area; c.updateProjectionMatrix();
      }
      if (typeChanged || !wasOn) this.recompile();
    } else if (wasOn) this.recompile();
    // distância de visão (chunks carregados + neblina)
    G.viewScale = { 1: 0.7, 2: 1, 3: 1.35 }[s.view];
    G.loadRadius = s.view;
    if (G.ocean && (changed === undefined || changed === 'water')) G.ocean.setQuality(s.water);
    this.resize();
  }

  recompile() { this.scene.traverse((o) => { if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => { m.needsUpdate = true; }); }); }

  resize() {
    const r = this.renderer, size = r.getDrawingBufferSize(new THREE.Vector2());
    const s = this.settings, w = Math.max(1, Math.round(size.x * s.scale)), h = Math.max(1, Math.round(size.y * s.scale));
    this.inSize = new THREE.Vector2(w, h); this.outSize = size.clone();
    this.composer.setSize(w, h);
    this.bloom.setSize(Math.max(1, w >> 1), Math.max(1, h >> 1));
    this.fullRT.setSize(size.x, size.y);
    const eu = this.easu.material.uniforms, ru = this.rcas.material.uniforms;
    eu.uInSize.value.copy(this.inSize);
    eu.uBicubic.value = s.upscaler === 'fsr' && s.scale < 0.999 ? 1 : 0;
    eu.uGrade.value = s.grade ? 1 : 0;
    ru.uSize.value.copy(size);
    ru.uSharp.value = s.sharpness;
    ru.uEnabled.value = s.upscaler === 'fsr' ? 1 : 0;
  }

  render(dt) {
    const r = this.renderer;
    this.composer.render(dt);
    const eu = this.easu.material.uniforms;
    eu.tInput.value = this.composer.readBuffer.texture;
    eu.uExposure.value = r.toneMappingExposure;
    r.setRenderTarget(this.fullRT); this.easu.render(r);
    r.setRenderTarget(null); this.rcas.render(r);
    this.tick();
  }

  // FPS pelo relógio real (o dt do jogo é limitado a 1/30 s).
  tick() {
    const f = this.fps, now = performance.now(), dt = f.last ? (now - f.last) / 1000 : 0;
    f.last = now; f.frames++; f.acc += dt;
    if (f.acc >= 0.5) { f.value = Math.round(f.frames / f.acc); f.ms = (f.acc / f.frames) * 1000; f.frames = 0; f.acc = 0; }
  }
}
