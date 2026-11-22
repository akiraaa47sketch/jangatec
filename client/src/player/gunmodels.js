// Modelos de arma feitos fora (GLB) que substituem os procedurais quando terminam de carregar.
// O GLB já vem "pintado" por vértice: COLOR_0 = cor (com quinas gastas e oclusão) e
// _SURF = (metalicidade, aspereza). Aqui só se monta o material que lê esses dados.
import * as THREE from '../three.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';

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
    // GLB "pintado" por vértice usa o material especial; GLB com texturas PBR mantém o material dele
    gltf.scene.traverse((o) => { if (o.isMesh) { if (o.geometry.attributes._surf) o.material = gunMaterial(); o.castShadow = true; } });
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

// ---------- mãos realistas (GLB com esqueleto) ----------
// Mesma API das mãos procedurais: { root, setPose(c[4] = dobra de cada dedo, t[3] = polegar) }.
// Origem no punho, dedos para -Z, palma para -Y, polegar em -X; a esquerda é a direita espelhada.
let handScene = null;
export function preloadHand(url) {
  const loader = new GLTFLoader(); loader.setMeshoptDecoder(MeshoptDecoder);
  return loader.loadAsync(url).then((gltf) => { handScene = gltf.scene; return true; })
    .catch((e) => { console.warn('Mãos 3D não carregaram:', e); return false; });
}
const _q = new THREE.Quaternion(), _e = new THREE.Euler(), X = new THREE.Vector3(1, 0, 0);
export function buildRealHand(mirror = false, gloveMat = null) {
  if (!handScene) return null;
  const root = new THREE.Group(), inner = cloneSkinned(handScene);
  inner.scale.setScalar(1.2); // luva "gordinha", na proporção das armas
  if (mirror) inner.scale.x = -1.2;
  root.add(inner);
  const bones = {};
  let skin = null, cuffR = 0.03;
  inner.traverse((o) => {
    if (o.isBone) { bones[o.name] = o; o.userData.q0 = o.quaternion.clone(); o.userData.rest = o.userData.bend || 0; }
    if (o.isMesh) { o.frustumCulled = false; o.castShadow = false; skin = o; if (o.userData.cuffR) cuffR = o.userData.cuffR; }
  });
  // luva: o mesmo formato da mão, na cor das luvas da pílula, com o relevo (rugas) do modelo
  if (skin && gloveMat) {
    if (!gloveMat.normalMap && skin.material.normalMap) { gloveMat.normalMap = skin.material.normalMap; gloveMat.normalScale.set(0.9, 0.9); gloveMat.needsUpdate = true; }
    // punho da luva: a parte do pulso (z > 0 no modelo) fica num couro mais escuro, com uma costura
    if (!gloveMat.userData.cuffed) {
      gloveMat.userData.cuffed = true;
      gloveMat.onBeforeCompile = (sh) => {
        sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying float vCuffZ;')
          .replace('#include <begin_vertex>', '#include <begin_vertex>\nvCuffZ = position.z;');
        sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vCuffZ;')
          .replace('#include <color_fragment>', `#include <color_fragment>
            float cuff = smoothstep(-0.012, -0.004, vCuffZ);
            float seam = 1.0 - 0.45 * smoothstep(0.0016, 0.0, abs(vCuffZ + 0.007));
            diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.42, 0.3, 0.26), cuff) * seam;`);
      };
      gloveMat.needsUpdate = true;
    }
    skin.material = gloveMat;
    // tampa do punho (o modelo termina aberto no pulso)
    const r = Math.max(0.021, cuffR * 1.12);
    const capMat = gloveMat.clone(); capMat.onBeforeCompile = () => {}; capMat.color.multiply(new THREE.Color(0.42, 0.3, 0.26));
    const cuff = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 1.1, 0.05, 24, 1, false), capMat);
    cuff.rotation.x = Math.PI / 2; cuff.position.z = 0.022;
    inner.add(cuff);
    if (!gloveMat.userData.caps) gloveMat.userData.caps = [];
    gloveMat.userData.caps.push(capMat);
  }
  const fingers = [0, 1, 2, 3].map((f) => [0, 1, 2].map((j) => bones[`d${f}_${j}`]));
  const BEND = [1.2, 1.4, 0.9];
  // pose ABSOLUTA: dobra 0 = dedo reto (desfaz a dobra que o modelo já tinha), como a luva antiga
  const setPose = (c, t) => {
    fingers.forEach((chain, f) => chain.forEach((b, j) => {
      if (b) b.quaternion.copy(b.userData.q0).multiply(_q.setFromAxisAngle(X, -b.userData.rest - c[f] * BEND[j]));
    }));
    const t0 = bones.pol_0, t1 = bones.pol_1;
    if (t0) t0.quaternion.copy(t0.userData.q0).multiply(_q.setFromEuler(_e.set(t[1] * 0.8, t[0] * 0.8, 0)));
    if (t1) t1.quaternion.copy(t1.userData.q0).multiply(_q.setFromAxisAngle(X, -t[2]));
  };
  // ponto de pegada: o "buraco" do punho fechado (entre a palma sob o nó do dedo médio e a ponta
  // do dedo médio dobrado). As armas encaixam o cabo aqui, como faziam com a luva de desenho.
  setPose([0.95, 0.95, 0.95, 0.95], [0.5, -0.2, 0.3]);
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert(), wp = (o) => o.getWorldPosition(new THREE.Vector3()).applyMatrix4(inv);
  let gripOff = [0, 0.03, 0.07];
  if (bones.d1_0 && bones.d1_2) {
    const knuckle = wp(bones.d1_0), tip = wp(bones.d1_2), palm = knuckle.clone(); palm.y -= 0.018;
    const hole = palm.lerp(tip, 0.5);
    gripOff = [-hole.x, -hole.y, -hole.z];
  }
  setPose([0.3, 0.3, 0.3, 0.3], [0.5, -0.2, 0.3]);
  return { root, setPose, real: true, gripOff };
}
