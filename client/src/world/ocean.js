import * as THREE from '../three.js';
import { SKY_GLSL, skyUniformDefs } from './atmosphere.js';

// Estado do mar. "level" = maré/enchente, "amp" = tempestade (escala a altura das ondas).
// surge = onda gigante (frente plana que viaja), vortex = olho do furacão (depressão + espiral).
// Ambos entram em waveHeight E no shader: o barco sente exatamente o que se vê.
export const sea = {
  level: 0, amp: 1,
  surge: { A: 0, ox: 0, oz: 0, dx: 1, dz: 0, front: 0, sigma: 10 },
  vortex: { k: 0, x: 0, z: 0, R: 70, depth: 9, spin: 1 },
};

const sstep = (a, b, x) => { const u = Math.min(1, Math.max(0, (x - a) / (b - a))); return u * u * (3 - 2 * u); };
// Altura extra dos eventos. Mesma fórmula em EVENTS_GLSL logo abaixo.
export function eventHeight(x, z, t) {
  let h = 0;
  const s = sea.surge;
  if (s.A > 0) {
    const d = (x - s.ox) * s.dx + (z - s.oz) * s.dz - s.front;
    // parede íngreme na frente (d > 0: água que a onda ainda vai alcançar), encosta longa atrás
    // e uma cava depois dela (a água "puxada" pela onda)
    const a = d / (s.sigma * (d > 0 ? 0.55 : 1.35)), b = (d + s.sigma * 2.6) / (s.sigma * 1.6);
    h += s.A * (Math.exp(-a * a) - 0.28 * Math.exp(-b * b));
  }
  const v = sea.vortex;
  if (v.k > 0) {
    // redemoinho: bacia larga + garganta funda no centro + braços em espiral que giram
    const dx = x - v.x, dz = z - v.z, r = Math.hypot(dx, dz), q = r / v.R;
    if (q < 2.2) {
      const tq = r / (v.R * 0.14);
      const ph = 5 * Math.atan2(dz, dx) - v.spin * (r * 0.24 + t * 2.0);
      const env = sstep(0.06, 0.3, q) * Math.exp(-q * q * 0.9);
      h += v.k * (-v.depth * Math.exp(-q * q * 1.8) - v.depth * 0.7 * Math.exp(-tq * tq) + Math.sin(ph) * (0.35 + v.depth * 0.05) * env);
    }
  }
  return h;
}

// ---- Ondas ----
// UMA tabela alimenta a física (JS) e o shader (GLSL): o que você vê é o que o barco sente.
// Ondas direcionais com dispersão de águas profundas (ω = √(g·k)) e cristas mais agudas.
// TODAS vêm do NORTE (+Z) e andam para o sul (−Z), abertas em leque de no máximo ~25°:
// marulho com cristas longas em vez de um mar picado vindo de todos os lados.
// [direção x, direção z, comprimento (m), amplitude (m)]
const WAVES = [
  [0.10, -1.0, 46, 0.16],
  [-0.30, -1.0, 31, 0.12],
  [0.35, -1.0, 19, 0.07],
  [-0.18, -1.0, 11, 0.045],
  [0.45, -1.0, 6.5, 0.025],
  [-0.42, -1.0, 3.8, 0.012],
].map(([dx, dz, L, A], i) => {
  const n = Math.hypot(dx, dz), k = (2 * Math.PI) / L;
  return { kx: (dx / n) * k, kz: (dz / n) * k, w: Math.sqrt(9.8 * k), A, ph: i * 1.7 };
});

// h(φ) = A·(2u² − 0.75), u = ½ + ½·sin φ  → cristas agudas e cavas largas.
export function waveHeight(x, z, t) {
  let h = 0;
  for (const w of WAVES) {
    const u = 0.5 + 0.5 * Math.sin(w.kx * x + w.kz * z - w.w * t + w.ph);
    h += w.A * (2 * u * u - 0.75);
  }
  return sea.level + sea.amp * h * shoreDamp(x, z) + eventHeight(x, z, t);
}

// Perto das ilhas a água fica rasa e as ondas perdem força (mesma conta em SHORE_GLSL).
// SHORE guarda as mesmas ilhas que o shader recebe em uIsl (x, z, raio da praia), atualizadas
// em Ocean.update: física e visual sempre concordam.
export const SHORE = Array.from({ length: 6 }, () => [0, 0, -1e4]);
export const SHORE_MIN = 0.3;
export function shoreDamp(x, z) {
  let k = 1;
  for (const s of SHORE) {
    if (s[2] < 0) continue;
    const d = Math.hypot(x - s[0], z - s[1]) - s[2];
    if (d < 10) k = Math.min(k, SHORE_MIN + (1 - SHORE_MIN) * sstep(-8, 10, d));
  }
  return k;
}

const f = (v) => v.toFixed(6);
const WAVES_GLSL = `
const int NW = ${WAVES.length};
const vec4 WV[NW] = vec4[](${WAVES.map((w) => `vec4(${f(w.kx)}, ${f(w.kz)}, ${f(w.w)}, ${f(w.A)})`).join(', ')});
const float WP[NW] = float[](${WAVES.map((w) => f(w.ph)).join(', ')});
// x = altura, yz = gradiente (para a normal analítica)
vec3 waves(vec2 p, float t) {
  float h = 0.0; vec2 g = vec2(0.0);
  for (int i = 0; i < NW; i++) {
    vec4 w = WV[i];
    float ph = dot(w.xy, p) - w.z * t + WP[i];
    float u = 0.5 + 0.5 * sin(ph);
    h += w.w * (2.0 * u * u - 0.75);
    g += w.xy * (w.w * 2.0 * u * cos(ph));
  }
  return vec3(h, g);
}`;

const EVENTS_GLSL = `
uniform vec4 uSurge;  // ox, oz, dx, dz
uniform vec3 uSurge2; // A, sigma, front
uniform vec4 uVortex; // x, z, R, depth
uniform float uVortexK; uniform float uVortexS;
float vortexStripe = 0.0, vortexDeep = 0.0;
float eventH(vec2 p, float t) {
  float h = 0.0;
  if (uSurge2.x > 0.0) {
    float d = dot(p - uSurge.xy, uSurge.zw) - uSurge2.z;
    float a = d / (uSurge2.y * (d > 0.0 ? 0.55 : 1.35)), b = (d + uSurge2.y * 2.6) / (uSurge2.y * 1.6);
    h += uSurge2.x * (exp(-a * a) - 0.28 * exp(-b * b));
  }
  if (uVortexK > 0.0) {
    vec2 dv = p - uVortex.xy; float r = length(dv), q = r / uVortex.z;
    if (q < 2.2) {
      float tq = r / (uVortex.z * 0.14);
      float ph = 5.0 * atan(dv.y, dv.x) - uVortexS * (r * 0.24 + t * 2.0);
      float env = smoothstep(0.06, 0.3, q) * exp(-q * q * 0.9);
      float sp = sin(ph);
      h += uVortexK * (-uVortex.w * exp(-q * q * 1.8) - uVortex.w * 0.7 * exp(-tq * tq) + sp * (0.35 + uVortex.w * 0.05) * env);
      vortexStripe = uVortexK * smoothstep(0.78, 1.0, sp) * env * 1.2;
      vortexDeep = uVortexK * exp(-q * q * 1.8);
    }
  }
  return h;
}`;

const VERT = /* glsl */`
uniform float uTime; uniform float uAmp; uniform float uLevel;
uniform vec3 uIsl[6];
varying vec3 vWorld; varying vec3 vN; varying float vHn; varying float vEv; varying vec2 vVx;
#include <fog_pars_vertex>
${WAVES_GLSL}
${EVENTS_GLSL}
float shoreDamp(vec2 p) {
  float k = 1.0;
  for (int i = 0; i < 6; i++) {
    if (uIsl[i].z < 0.0) continue;
    float d = length(p - uIsl[i].xy) - uIsl[i].z;
    k = min(k, mix(${SHORE_MIN.toFixed(3)}, 1.0, smoothstep(-8.0, 10.0, d)));
  }
  return k;
}
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vec3 w = waves(wp.xz, uTime) * shoreDamp(wp.xz);
  float e = eventH(wp.xz, uTime);
  vVx = vec2(vortexStripe, vortexDeep);
  vec2 eg = vec2(0.0);
  if (uSurge2.x > 0.0 || uVortexK > 0.0) {
    eg = vec2(eventH(wp.xz + vec2(0.6, 0.0), uTime) - e, eventH(wp.xz + vec2(0.0, 0.6), uTime) - e) / 0.6;
  }
  wp.y = uLevel + uAmp * w.x + e;
  vHn = w.x;
  // espuma do evento: crista da onda gigante e bordas da espiral do furacão
  vEv = clamp(length(eg) * 0.9 + max(e, 0.0) * 0.12, 0.0, 1.0);
  vN = normalize(vec3(-uAmp * w.y - eg.x, 1.0, -uAmp * w.z - eg.y));
  vWorld = wp.xyz;
  vec4 mvPosition = viewMatrix * wp;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;

const FRAG = /* glsl */`
uniform float uTime; uniform float uLight;
uniform vec3 uDeep; uniform vec3 uShallow;
uniform vec3 uIsl[6];
varying vec3 vWorld; varying vec3 vN; varying float vHn; varying float vEv; varying vec2 vVx;
#include <fog_pars_fragment>
${SKY_GLSL}
float hash(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
}
#ifdef ULTRA
// gradiente analítico do ruído de valor (para a normal das marolas)
vec2 nGrad(vec2 p) {
  vec2 i = floor(p), f = fract(p), u = f * f * (3.0 - 2.0 * f), du = 6.0 * f * (1.0 - f);
  float a = hash(i), b = hash(i + vec2(1, 0)), c = hash(i + vec2(0, 1)), d = hash(i + vec2(1, 1));
  return du * vec2(b - a + (a - b - c + d) * u.y, c - a + (a - b - c + d) * u.x);
}
#endif
void main() {
  vec3 toCam = cameraPosition - vWorld;
  float dist = length(toCam);
  vec3 V = toCam / dist;
  vec2 q = vWorld.xz;

  // marolas finas por cima da normal das ondas (somem com a distância para não cintilar)
  float fade = 1.0 - smoothstep(25.0, 140.0, dist);
  vec2 r1 = vec2(sin(q.x * 1.7 + q.y * 1.1 + uTime * 1.3), cos(q.y * 1.9 - q.x * 0.8 + uTime * 1.1));
  vec2 r2 = vec2(sin(q.x * 4.1 - q.y * 3.3 - uTime * 2.1), cos(q.y * 3.7 + q.x * 4.6 + uTime * 1.9));
  // inclinação exagerada só no SOMBREAMENTO (a física usa as ondas reais): dá leitura às ondas
  vec3 N = vec3(vN.x * 2.2, vN.y, vN.z * 2.2);
  N.xz += (r1 * 0.06 + r2 * 0.035) * fade * (0.7 + 0.9 * uStorm);
#ifdef ULTRA
  // ULTRA: 4 camadas de ondulação fina (ruído em movimento, direções diferentes) até mais longe
  float fadeU = 1.0 - smoothstep(30.0, 260.0, dist);
  vec2 dU = nGrad(q * 0.55 + vec2(uTime * 0.22, uTime * 0.13)) * 0.050
          + nGrad(q * 1.30 - vec2(uTime * 0.31, -uTime * 0.17)) * 0.034
          + nGrad(q * 3.10 + vec2(-uTime * 0.45, uTime * 0.38)) * 0.020
          + nGrad(q * 7.30 + vec2(uTime * 0.70, uTime * 0.55)) * 0.010 * (1.0 - smoothstep(10.0, 60.0, dist));
  N.xz -= dU * fadeU * (0.85 + 1.1 * uStorm);
#endif
  N = normalize(N);

  // perto das ilhas a água é rasa: mais clara, mais transparente, com espuma na orla
  float shallow = 0.0, shore = 0.0;
  for (int i = 0; i < 6; i++) {
    float d = length(q - uIsl[i].xy) - uIsl[i].z;
    shallow = max(shallow, 1.0 - smoothstep(0.0, 11.0, d));
    float band = (1.0 - smoothstep(0.0, 2.4, abs(d - 0.4))) * step(-0.3, d);
    shore = max(shore, band * (0.55 + 0.45 * sin(d * 3.0 - uTime * 1.4 + vnoise(q * 0.5) * 5.0)));
  }

  float NdotV = clamp(dot(N, V), 0.0, 1.0);
#ifdef ULTRA
  float F = clamp(0.02 + 0.98 * pow(1.0 - NdotV, 5.0), 0.0, 0.93); // Fresnel físico (água: F0 = 0,02)
#else
  float F = clamp(0.02 + 0.98 * pow(1.0 - NdotV, 5.0), 0.0, 1.0) * 0.85;
#endif
  vec3 R = reflect(-V, N); R.y = abs(R.y) + 0.02;
  vec3 refl = skyColor(normalize(R));

  vec3 L = normalize(uSunDir);
  float hn = vHn;
  vec3 body = mix(uDeep, uShallow, clamp(0.40 + hn * 1.1, 0.0, 1.0));
  body = mix(body, vec3(0.06, 0.50, 0.46), shallow * 0.75);
  body *= (0.30 + 0.70 * uLight) * (0.70 + 0.65 * clamp(dot(N, L), 0.0, 1.0));
  float sss = pow(clamp(dot(V, -normalize(L + N * 0.4)), 0.0, 1.0), 3.0) * smoothstep(-0.05, 0.4, hn);
  body += vec3(0.05, 0.34, 0.30) * sss * uSunColor * 0.9;
#ifdef ULTRA
  // cavas mais escuras e cristas translúcidas (luz atravessando a água contra o sol)
  body *= 0.82 + 0.3 * smoothstep(-0.25, 0.35, hn);
  float thin = pow(clamp(dot(V, -L) * 0.5 + 0.5, 0.0, 1.0), 2.0) * smoothstep(0.0, 0.45, hn);
  body += vec3(0.04, 0.42, 0.36) * thin * uSunColor * 0.7 * uLight;
#endif

  vec3 col = mix(body, refl, F);
  vec3 H = normalize(L + V); float ns = max(dot(N, H), 0.0);
  col += uSunColor * (pow(ns, 260.0) * 2.6 + pow(ns, 38.0) * 0.10) * (1.0 - uStorm * 0.7);
#ifdef ULTRA
  // faíscas do sol: pontinhos brilhando no caminho de luz
  float glit = step(0.86, vnoise(q * 9.0 + vec2(uTime * 1.7, -uTime * 1.3))) * pow(ns, 70.0);
  col += uSunColor * glit * 3.5 * (1.0 - uStorm) * (1.0 - smoothstep(20.0, 160.0, dist));
#endif

  // espuma: cristas (mais com tempestade) + orla das ilhas
  float n1 = vnoise(q * 0.9 + vec2(uTime * 0.15, 0.0));
  float n2 = vnoise(q * 3.1 - vec2(0.0, uTime * 0.3));
  float crest = smoothstep(0.30 - uStorm * 0.09, 0.50, hn + (n1 - 0.5) * 0.16);
  float foam = crest * (0.5 + 0.5 * n2) * (1.0 - smoothstep(150.0, 300.0, dist));
#ifdef ULTRA
  // espuma em listras (rastro da crista arrastado pelo vento) em vez de manchas
  float streak = vnoise(vec2(q.x * 0.35 + q.y * 0.9, q.y * 0.35 - q.x * 0.9) * vec2(0.6, 3.2) + vec2(uTime * 0.2, 0.0));
  foam *= 0.55 + 0.9 * smoothstep(0.45, 0.8, streak);
#endif
  foam = max(foam * 0.9, shore * (0.6 + 0.4 * n2));
  foam = max(foam, smoothstep(0.25, 0.85, vEv + (n2 - 0.5) * 0.35));
  // redemoinho: água escura e funda no centro + faixas de espuma girando
  col *= 1.0 - 0.45 * vVx.y;
  foam = max(foam, clamp(vVx.x * smoothstep(0.25, 0.8, n2 + n1 * 0.4), 0.0, 0.8));
  col = mix(col, vec3(0.92, 0.97, 1.0) * (0.45 + 0.55 * uLight), clamp(foam, 0.0, 1.0));

  gl_FragColor = vec4(col, max(mix(0.94, 0.55, shallow), foam));
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}`;

const DEEP = [new THREE.Color(0x0b4f7c), new THREE.Color(0x1a3040)];
const SHALLOW = [new THREE.Color(0x1fa3c4), new THREE.Color(0x3a5a66)];

// Malha polar centrada na câmera: bem densa perto, rala longe (≈20 mil vértices).
function polarGrid(rings, sectors, r0, r1) {
  const pos = new Float32Array((rings + 1) * sectors * 3), idx = [];
  for (let i = 0; i <= rings; i++) {
    const r = r0 * Math.pow(r1 / r0, i / rings);
    for (let j = 0; j < sectors; j++) {
      const a = (j / sectors) * Math.PI * 2, k = (i * sectors + j) * 3;
      pos[k] = Math.cos(a) * r; pos[k + 1] = 0; pos[k + 2] = Math.sin(a) * r;
    }
  }
  for (let i = 0; i < rings; i++) for (let j = 0; j < sectors; j++) {
    const a = i * sectors + j, b = i * sectors + ((j + 1) % sectors), c = (i + 1) * sectors + j, d = (i + 1) * sectors + ((j + 1) % sectors);
    idx.push(a, b, c, b, d, c); // normal para CIMA (senão o culling descarta a água)
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setIndex(idx);
  return g;
}

export class Ocean {
  constructor(scene, atmosphere) {
    this.atmo = atmosphere;
    this.islandSource = null; // () => lista de ilhas {x, z, R}
    const uniforms = THREE.UniformsUtils.merge([THREE.UniformsLib.fog, skyUniformDefs()]);
    Object.assign(uniforms, {
      uTime: { value: 0 }, uAmp: { value: 1 }, uLevel: { value: 0 }, uLight: { value: 1 },
      uDeep: { value: new THREE.Color() }, uShallow: { value: new THREE.Color() },
      uIsl: { value: Array.from({ length: 6 }, () => new THREE.Vector3(0, 0, -1e4)) },
      uSurge: { value: new THREE.Vector4(0, 0, 1, 0) }, uSurge2: { value: new THREE.Vector3(0, 10, 0) },
      uVortex: { value: new THREE.Vector4(0, 0, 70, 9) }, uVortexK: { value: 0 }, uVortexS: { value: 1 },
    });
    this.material = new THREE.ShaderMaterial({
      uniforms, vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: true, fog: true,
    });
    this.mesh = new THREE.Mesh(polarGrid(110, 180, 0.4, 420), this.material);
    this.mesh.frustumCulled = false; this.mesh.userData.noShadow = true;
    scene.add(this.mesh);
  }

  // Qualidade da água = densidade da malha (mais anéis/setores = ondas mais suaves).
  setQuality(q) {
    const [rings, sectors] = { baixa: [60, 100], media: [90, 150], alta: [110, 180], ultra: [170, 280] }[q] || [110, 180];
    if (this._q === q) return;
    this._q = q;
    // ULTRA liga o caminho caro do shader (marolas em camadas, Fresnel físico, faíscas, espuma em listras)
    this.material.defines = q === 'ultra' ? { ULTRA: '' } : {};
    this.material.needsUpdate = true;
    this.mesh.geometry.dispose();
    this.mesh.geometry = polarGrid(rings, sectors, 0.4, 420);
  }

  update(t, cx, cz) {
    this.mesh.position.set(cx, 0, cz);
    const u = this.material.uniforms, st = this.atmo.state;
    u.uTime.value = t; u.uAmp.value = sea.amp; u.uLevel.value = sea.level; u.uLight.value = st.light;
    const sg = sea.surge, vx = sea.vortex;
    u.uSurge.value.set(sg.ox, sg.oz, sg.dx, sg.dz); u.uSurge2.value.set(sg.A, sg.sigma, sg.front);
    u.uVortex.value.set(vx.x, vx.z, vx.R, vx.depth); u.uVortexK.value = vx.k; u.uVortexS.value = vx.spin || 1;
    u.uDeep.value.copy(DEEP[0]).lerp(DEEP[1], st.storm);
    u.uShallow.value.copy(SHALLOW[0]).lerp(SHALLOW[1], st.storm);
    this.atmo.applySky(u);

    // as 6 ilhas mais próximas alimentam a água rasa e a espuma da orla
    const list = this.islandSource ? this.islandSource() : [];
    const near = list.map((i) => ({ i, d: Math.hypot(i.x - cx, i.z - cz) })).filter((o) => o.d < 260)
      .sort((a, b) => a.d - b.d).slice(0, 6);
    for (let k = 0; k < 6; k++) {
      const s = near[k];
      if (s) u.uIsl.value[k].set(s.i.x, s.i.z, s.i.R + 7.5); else u.uIsl.value[k].set(0, 0, -1e4);
      const v = u.uIsl.value[k]; SHORE[k][0] = v.x; SHORE[k][1] = v.y; SHORE[k][2] = v.z;
    }
  }
}
