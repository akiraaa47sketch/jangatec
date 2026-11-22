// Pipeline gráfico + opções.
//   cena (resolução reduzida, HDR linear, MSAA opcional) → bloom opcional
//   → EASU-lite: upscale bicúbico Catmull-Rom com anti-ringing (inspirado no FSR 1 da AMD)
//      + tone mapping (Neutral) + gradação de cor + vinheta, na resolução da tela
//   → RCAS (o afiador adaptativo do FSR 1) direto na tela.
// O viewmodel (braços/arma) é desenhado depois, em resolução cheia.
// IMERSÃO (opcional, menu Gráficos → Imersão): profundidade de campo com foco automático no centro
// da tela, desfoque de movimento da câmera (só rotação), granulado + aberração cromática, efeitos de
// vida baixa, água na lente e tremor/balanço da câmera. Ficam fora das predefinições.
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
export const IMMERSION_DEFAULTS = (mobile) => ({ shake: 1, bob: true, dof: mobile ? 'off' : 'suave', motion: !mobile, grain: false, lowHp: true, wet: true });
export const IMMERSION_KEYS = ['shake', 'bob', 'dof', 'motion', 'grain', 'lowHp', 'wet'];
GFX_LABELS.dof = { off: 'Desligada', suave: 'Suave', forte: 'Forte (cinema)' };
const SHADOW = { off: null, baixa: [1024, 52, false], media: [2048, 52, false], alta: [2048, 60, true], ultra: [4096, 85, true] };
const KEY = 'mare-alta-graficos';

// Tone mapping Neutral (Khronos) + gradação + vinheta; upscale Catmull-Rom com anti-ringing.
const EASU_FRAG = /* glsl */`
uniform sampler2D tInput; uniform vec2 uInSize; uniform float uExposure; uniform float uGrade; uniform float uBicubic;
uniform float uGrain; uniform float uTime; uniform float uLowHp; uniform float uPulse; uniform float uWet; uniform float uAspect;
varying vec2 vUv;
float h21(vec2 p) { vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
// gotas d'água na lente: células com uma gota cada, que escorrem e somem (deslocam a imagem)
vec2 wetOffset(vec2 uv, out float mask) {
  mask = 0.0;
  if (uWet <= 0.001) return vec2(0.0);
  vec2 off = vec2(0.0);
  for (int l = 0; l < 2; l++) {
    float sc = l == 0 ? 9.0 : 15.0;
    vec2 g = vec2(uv.x * uAspect, uv.y) * sc;
    vec2 id = floor(g), f = fract(g) - 0.5;
    float r = h21(id + float(l) * 17.0);
    if (r > 0.35 + 0.5 * (1.0 - uWet)) continue;
    float slide = fract(uTime * (0.05 + r * 0.12) + r);
    vec2 c = vec2((h21(id + 3.1) - 0.5) * 0.6, 0.35 - slide * 0.9);
    float rad = 0.12 + 0.16 * h21(id + 7.7);
    vec2 d = f - c; d.y *= 1.0 + 0.6 * slide;
    float dd = length(d);
    float drop = smoothstep(rad, rad * 0.6, dd) * uWet;
    float trail = smoothstep(0.05, 0.0, abs(f.x - c.x)) * step(c.y, f.y) * smoothstep(0.5, c.y, f.y) * 0.35 * uWet;
    off += d * drop * 0.09 / sc * 9.0 - vec2(0.0, trail * 0.004);
    mask = max(mask, drop);
  }
  return off;
}
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
  float wetMask; vec2 uv = vUv + wetOffset(vUv, wetMask);
  if (uBicubic > 0.5) {
    c = catmullRom(uv);
    // anti-ringing (como no EASU): limita ao intervalo dos 4 texels mais próximos
    vec2 px = 1.0 / uInSize, b = (floor(uv * uInSize - 0.5) + 0.5) * px;
    vec3 a0 = tap(b), a1 = tap(b + vec2(px.x, 0.0)), a2 = tap(b + vec2(0.0, px.y)), a3 = tap(b + px);
    c = clamp(c, min(min(a0, a1), min(a2, a3)), max(max(a0, a1), max(a2, a3)));
  } else c = tap(uv);
  if (uGrain > 0.5) { // aberração cromática leve nas bordas
    vec2 q = uv - 0.5, ca = q * dot(q, q) * 0.012;
    c.r = mix(c.r, tap(uv + ca).r, 0.85); c.b = mix(c.b, tap(uv - ca).b, 0.85);
  }
  c = neutral(max(c, 0.0));
  c += wetMask * 0.04; // brilho da gota
  if (uGrade > 0.5) {
    float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
    float sat = max(c.r, max(c.g, c.b)) - min(c.r, min(c.g, c.b));
    c = mix(vec3(l), c, 1.0 + 0.22 * (1.0 - sat));          // vibrância (realça cores apagadas)
    c = (c - 0.5) * 1.06 + 0.5;                                // contraste leve
    c *= vec3(1.02, 1.0, 0.97);                                // calor de fim de tarde
    vec2 q = vUv - 0.5; c *= 1.0 - dot(q, q) * 0.55;          // vinheta
  }
  if (uLowHp > 0.001) { // vida baixa: some a cor, bordas vermelhas pulsando com o coração
    float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
    c = mix(c, vec3(l), uLowHp * 0.65);
    vec2 q = vUv - 0.5; float v = smoothstep(0.18, 0.75, length(q * vec2(uAspect, 1.0)) / max(1.0, uAspect * 0.8));
    c = mix(c, vec3(0.35, 0.02, 0.02), v * uLowHp * (0.45 + 0.35 * uPulse));
  }
  if (uGrain > 0.5) c += (h21(vUv * uInSize * 1.7 + fract(uTime * 13.0) * 300.0) - 0.5) * 0.045;
  gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
}`;

// Profundidade de campo (foco automático) + desfoque de movimento da câmera, na resolução da cena.
const FX_FRAG = /* glsl */`
uniform sampler2D tColor; uniform sampler2D tDepth; uniform sampler2D tFocus;
uniform vec2 uSize; uniform float uNear; uniform float uFar; uniform float uDof; uniform float uMaxR; uniform float uAperture;
uniform float uMotion; uniform mat4 uInvProj; uniform mat4 uInvView; uniform mat4 uPrevViewProj;
varying vec2 vUv;
float lin(float d) { float z = d * 2.0 - 1.0; return 2.0 * uNear * uFar / (uFar + uNear - z * (uFar - uNear)); }
float coc(float depth, float focus) { return clamp(uAperture * abs(1.0 - focus / max(depth, 0.01)), 0.0, 1.0); }
void main() {
  vec3 col = texture2D(tColor, vUv).rgb;
  float d = texture2D(tDepth, vUv).r, depth = lin(d);
  if (uDof > 0.5) {
    float focus = texture2D(tFocus, vec2(0.5)).r;
    float c0 = coc(depth, focus), r0 = c0 * uMaxR;
    if (r0 > 0.5) {
      vec3 acc = col; float wsum = 1.0;
      const float GA = 2.39996323;
      for (int i = 1; i < 30; i++) {
        float fi = float(i), rr = sqrt(fi / 30.0) * r0, a = fi * GA;
        vec2 o = vec2(cos(a), sin(a)) * rr / uSize;
        float ds = lin(texture2D(tDepth, vUv + o).r);
        float cs = coc(ds, focus) * uMaxR;
        // amostra só conta se o círculo dela cobre este pixel (evita o fundo borrar o que está em foco)
        float w = clamp(cs - rr + 1.0, 0.0, 1.0) * (ds > depth ? 1.0 : clamp(cs / max(r0, 0.001), 0.0, 1.0));
        acc += texture2D(tColor, vUv + o).rgb * w; wsum += w;
      }
      col = acc / wsum;
    }
  }
  if (uMotion > 0.001) {
    vec4 ndc = vec4(vUv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0);
    vec4 vp = uInvProj * ndc; vp /= vp.w;
    vec4 wp = uInvView * vp;
    vec4 pc = uPrevViewProj * wp; vec2 puv = pc.xy / pc.w * 0.5 + 0.5;
    vec2 vel = (vUv - puv) * uMotion;
    float L = length(vel);
    if (L > 0.0008) {
      vel *= min(1.0, 0.05 / L);
      vec3 acc = col;
      for (int i = 1; i < 9; i++) acc += texture2D(tColor, vUv - vel * (float(i) / 8.0 - 0.5)).rgb;
      col = acc / 9.0;
    }
  }
  gl_FragColor = vec4(col, 1.0);
}`;
// Foco automático: média da profundidade no centro, suavizada no tempo (1×1 em ping-pong).
const FOCUS_FRAG = /* glsl */`
uniform sampler2D tDepth; uniform sampler2D tPrev; uniform float uNear; uniform float uFar; uniform float uRate; uniform float uMin; uniform float uFixed;
varying vec2 vUv;
float lin(float d) { float z = d * 2.0 - 1.0; return 2.0 * uNear * uFar / (uFar + uNear - z * (uFar - uNear)); }
void main() {
  float f = 0.0;
  for (int x = -2; x <= 2; x++) for (int y = -2; y <= 2; y++) f += min(lin(texture2D(tDepth, vec2(0.5) + vec2(float(x), float(y)) * 0.012).r), 120.0);
  f = uFixed > 0.0 ? uFixed : max(f / 25.0, uMin); // 3ª pessoa: foco no personagem
  float prev = texture2D(tPrev, vec2(0.5)).r;
  gl_FragColor = vec4(prev < 0.001 ? f : mix(prev, f, uRate), 0.0, 0.0, 1.0);
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

const clamp01 = (x) => Math.min(1, Math.max(0, x));

export class Graphics {
  constructor(G, { renderer, scene, camera, sun, mobile }) {
    Object.assign(this, { G, renderer, scene, camera, sun, mobile });
    this.settings = this.load();
    this.fps = { frames: 0, acc: 0, value: 0, ms: 0 };
    this.fullRT = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, depthBuffer: false });
    this.easu = new FullScreenQuad(new THREE.ShaderMaterial({
      uniforms: { tInput: { value: null }, uInSize: { value: new THREE.Vector2() }, uExposure: { value: 1 }, uGrade: { value: 1 }, uBicubic: { value: 1 },
        uGrain: { value: 0 }, uTime: { value: 0 }, uLowHp: { value: 0 }, uPulse: { value: 0 }, uWet: { value: 0 }, uAspect: { value: 1 } },
      vertexShader: VERT, fragmentShader: EASU_FRAG, depthTest: false, depthWrite: false, toneMapped: false,
    }));
    this.rcas = new FullScreenQuad(new THREE.ShaderMaterial({
      uniforms: { tInput: { value: this.fullRT.texture }, uSize: { value: new THREE.Vector2() }, uSharp: { value: 0.3 }, uEnabled: { value: 1 } },
      vertexShader: VERT, fragmentShader: RCAS_FRAG, depthTest: false, depthWrite: false, toneMapped: false,
    }));
    this.fxRT = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, depthBuffer: false });
    const fRT = () => new THREE.WebGLRenderTarget(1, 1, { type: THREE.FloatType, depthBuffer: false, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter });
    this.focusRT = [fRT(), fRT()];
    this.fx = new FullScreenQuad(new THREE.ShaderMaterial({
      uniforms: {
        tColor: { value: null }, tDepth: { value: null }, tFocus: { value: null }, uSize: { value: new THREE.Vector2() },
        uNear: { value: 0.1 }, uFar: { value: 600 }, uDof: { value: 0 }, uMaxR: { value: 4 }, uAperture: { value: 1 },
        uMotion: { value: 0 }, uInvProj: { value: new THREE.Matrix4() }, uInvView: { value: new THREE.Matrix4() }, uPrevViewProj: { value: new THREE.Matrix4() },
      },
      vertexShader: VERT, fragmentShader: FX_FRAG, depthTest: false, depthWrite: false, toneMapped: false,
    }));
    this.focus = new FullScreenQuad(new THREE.ShaderMaterial({
      uniforms: { tDepth: { value: null }, tPrev: { value: null }, uNear: { value: 0.1 }, uFar: { value: 600 }, uRate: { value: 0.1 }, uMin: { value: 1.5 }, uFixed: { value: 0 } },
      vertexShader: VERT, fragmentShader: FOCUS_FRAG, depthTest: false, depthWrite: false, toneMapped: false,
    }));
    this.prevQuat = new THREE.Quaternion(); this.prevPos = new THREE.Vector3(); this.wet = 0; this.time = 0;
    this.buildComposer();
    this.apply();
  }

  // ---------- imersão (efeitos de câmera) ----------
  get shakeMul() { return this.settings.shake; }
  wetLens(amount = 1) { if (this.settings.wet) this.wet = Math.max(this.wet, amount); }

  // ---------- configurações ----------
  defaults() { return { preset: this.mobile ? 'medio' : 'alto', ...GFX_PRESETS[this.mobile ? 'medio' : 'alto'], showFps: false, ...IMMERSION_DEFAULTS(this.mobile) }; }
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
      shake: pick('shake', (v) => Number.isFinite(v) && v >= 0 && v <= 1),
      bob: pick('bob', (v) => typeof v === 'boolean'),
      dof: pick('dof', (v) => v in GFX_LABELS.dof),
      motion: pick('motion', (v) => typeof v === 'boolean'),
      grain: pick('grain', (v) => typeof v === 'boolean'),
      lowHp: pick('lowHp', (v) => typeof v === 'boolean'),
      wet: pick('wet', (v) => typeof v === 'boolean'),
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
    if (key !== 'showFps' && !IMMERSION_KEYS.includes(key)) this.settings.preset = 'custom'; // imersão não mexe na predefinição
    this.apply(key); this.save();
  }

  // ---------- aplicação ----------
  buildComposer() {
    if (this.composer) { this.composer.dispose(); }
    const samples = Math.min(this.settings.msaa, this.renderer.capabilities.maxSamples || 0);
    const rt = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples });
    rt.depthTexture = new THREE.DepthTexture(1, 1); // profundidade para foco/desfoque
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
    this.fxRT.setSize(w, h);
    this.fx.material.uniforms.uSize.value.set(w, h);
    this.easu.material.uniforms.uAspect.value = size.x / Math.max(1, size.y);
    const eu = this.easu.material.uniforms, ru = this.rcas.material.uniforms;
    eu.uInSize.value.copy(this.inSize);
    eu.uBicubic.value = s.upscaler === 'fsr' && s.scale < 0.999 ? 1 : 0;
    eu.uGrade.value = s.grade ? 1 : 0;
    ru.uSize.value.copy(size);
    ru.uSharp.value = s.sharpness;
    ru.uEnabled.value = s.upscaler === 'fsr' ? 1 : 0;
  }

  render(dt) {
    const r = this.renderer, s = this.settings, cam = this.camera, G = this.G;
    this.time += dt;
    this.composer.render(dt);
    const eu = this.easu.material.uniforms;
    let src = this.composer.readBuffer.texture;
    const playing = G.started && !G.bench;
    const dof = playing && s.dof !== 'off', motion = playing && s.motion;
    const depthTex = this.composer.readBuffer.depthTexture;
    if ((dof || motion) && depthTex) {
      const fu = this.fx.material.uniforms;
      if (dof) { // foco automático no que está no centro da tela
        const [a, b] = this.focusRT, qu = this.focus.material.uniforms;
        qu.tDepth.value = depthTex; qu.tPrev.value = a.texture; qu.uNear.value = cam.near; qu.uFar.value = cam.far;
        qu.uRate.value = 1 - Math.exp(-dt * 5);
        const pl = G.player, tp = pl && !pl.firstPerson && !(G.combat && G.combat.aiming) && !(G.naval && G.naval.manning);
        qu.uFixed.value = tp ? pl.camDist + 0.6 : 0; // em 3ª pessoa foca o personagem; mirando/1ª pessoa, o centro
        r.setRenderTarget(b); this.focus.render(r);
        this.focusRT = [b, a]; fu.tFocus.value = b.texture;
      }
      const k = this.inSize.y / 720;
      fu.uDof.value = dof ? 1 : 0;
      fu.uMaxR.value = (s.dof === 'forte' ? 7 : 3.5) * Math.max(0.6, k);
      fu.uAperture.value = s.dof === 'forte' ? 0.55 : 0.3;
      fu.tColor.value = src; fu.tDepth.value = depthTex; fu.uNear.value = cam.near; fu.uFar.value = cam.far;
      // desfoque só da ROTAÇÃO da câmera (andar de barco não borra a jangada)
      cam.updateMatrixWorld();
      fu.uInvProj.value.copy(cam.projectionMatrixInverse); fu.uInvView.value.copy(cam.matrixWorld);
      const prev = new THREE.Matrix4().compose(cam.position, this.prevQuat, new THREE.Vector3(1, 1, 1)).invert();
      fu.uPrevViewProj.value.multiplyMatrices(cam.projectionMatrix, prev);
      fu.uMotion.value = motion ? clamp01((1 / 60) / Math.max(dt, 1e-3)) * 0.55 : 0;
      r.setRenderTarget(this.fxRT); this.fx.render(r);
      src = this.fxRT.texture;
    }
    this.prevQuat.copy(cam.quaternion);
    eu.tInput.value = src;
    eu.uGrain.value = s.grain ? 1 : 0; eu.uTime.value = this.time;
    // vida baixa: abaixo de 35 de vida (pulso de coração)
    const vida = G.survival ? G.survival.vida : 100, low = playing && s.lowHp && !G.player.dead ? clamp01((35 - vida) / 30) : 0;
    eu.uLowHp.value += (low - eu.uLowHp.value) * Math.min(1, dt * 4);
    const beat = (this.time * (1 + low * 0.8)) % 1;
    eu.uPulse.value = Math.exp(-beat * 9) + 0.6 * Math.exp(-Math.max(0, beat - 0.22) * 12) * (beat > 0.22 ? 1 : 0);
    this.wet = Math.max(0, this.wet - dt / 5);
    eu.uWet.value = s.wet ? this.wet : 0;
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
