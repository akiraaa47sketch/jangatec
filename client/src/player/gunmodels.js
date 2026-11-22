// Modelos de arma feitos fora (GLB) que substituem os procedurais quando terminam de carregar.
// O GLB já vem "pintado" por vértice: COLOR_0 = cor (com quinas gastas e oclusão) e
// _SURF = (metalicidade, aspereza). Aqui só se monta o material que lê esses dados.
import * as THREE from '../three.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

const cache = {};
let material = null;

function gunMaterial() {
  if (material) return material;
  material = new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 1, roughness: 1, envMapIntensity: 1.1 });
  material.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec2 _surf;\nvarying vec2 vSurf;\nvarying vec3 vObj;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSurf = _surf;\nvObj = position;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vSurf;\nvarying vec3 vObj;\nfloat gh(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }')
      // microdetalhe: leve variação de aspereza (marcas de uso) sem precisar de textura com UV
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nfloat micro = gh(floor(vObj * 900.0));\nroughnessFactor = clamp(vSurf.y * (0.88 + 0.24 * micro), 0.08, 1.0);')
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor = vSurf.x;');
  };
  return material;
}

// Carrega uma vez (fica pronto em segundo plano). Retorna a Promise.
export function preloadGun(id, url) {
  if (cache[id]) return cache[id].promise;
  const loader = new GLTFLoader(); loader.setMeshoptDecoder(MeshoptDecoder);
  const entry = { scene: null };
  entry.promise = loader.loadAsync(url).then((gltf) => {
    gltf.scene.traverse((o) => { if (o.isMesh) { o.material = gunMaterial(); o.castShadow = true; } });
    entry.scene = gltf.scene;
    return entry.scene;
  }).catch((e) => { console.warn('Modelo de arma não carregou:', id, e); return null; });
  cache[id] = entry;
  return entry.promise;
}

// Cópia pronta para usar (null se ainda não carregou): { group, parts: { corpo, ferrolho } }
export function gunModel(id) {
  const e = cache[id];
  if (!e || !e.scene) return null;
  const group = e.scene.clone(true), parts = {};
  group.traverse((o) => { if (o.name) parts[o.name] = o; });
  return { group, parts };
}
