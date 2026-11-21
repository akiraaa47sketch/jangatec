import * as THREE from '../three.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js';
// Náufrago: modelo Meshy com rig Mixamo; textura de cor gerada a partir da arte de referência.
import modelUrl from '../../assets/castaway-survivor.glb?url';

const skinColor = new THREE.Color(0xb97251);
const shirtColor = new THREE.Color(0xb49b7b);
const pantsColor = new THREE.Color(0x45413a);
const bootColor = new THREE.Color(0x30231e);
const hairColor = new THREE.Color(0x39251d);

export async function loadCastawayModel() {
  return new GLTFLoader().loadAsync(modelUrl);
}

function colorModel(model) {
  model.traverse((part) => {
    if (!part.isMesh) return;
    // Modelo já texturizado: só ajusta o material e liga as sombras.
    if (part.material && part.material.map) {
      part.material = part.material.clone();
      part.material.roughness = 0.9;
      part.material.metalness = 0;
      part.castShadow = true;
      part.receiveShadow = true;
      return;
    }

    const geometry = part.geometry.clone();
    const positions = geometry.attributes.position;
    if (!geometry.attributes.normal) geometry.computeVertexNormals();
    const colors = new Float32Array(positions.count * 3);
    for (let i = 0; i < positions.count; i++) {
      const x = positions.getX(i);
      const y = positions.getY(i);
      const color = y < 0.16
        ? bootColor
        : y < 0.48
          ? pantsColor
          : y < 1.38 && Math.abs(x) > 0.18
            ? skinColor
            : y < 1.38
              ? shirtColor
              : y > 1.58
                ? hairColor
                : skinColor;
      color.toArray(colors, i * 3);
    }

    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    part.geometry = geometry;
    part.material = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.92,
      flatShading: true,
    });
    part.castShadow = true;
    part.receiveShadow = true;
  });
}

function addGlasses(parent, style) {
  if (style === 'nenhum') return;

  const isGoggles = style === 'goggles';
  const frame = new THREE.MeshStandardMaterial({
    color: isGoggles ? 0x2d2924 : 0x9b7541,
    metalness: isGoggles ? 0.05 : 0.62,
    roughness: 0.4,
  });
  const lens = new THREE.MeshStandardMaterial({
    color: isGoggles ? 0x587a82 : 0x273b4a,
    metalness: 0.15,
    roughness: 0.22,
    transparent: true,
    opacity: 0.78,
    depthWrite: false,
  });

  for (const x of [-0.067, 0.067]) {
    const glass = new THREE.Mesh(
      isGoggles
        ? new THREE.BoxGeometry(0.12, 0.075, 0.025)
        : new THREE.CircleGeometry(0.055, 16),
      lens,
    );
    glass.position.set(x, 0.025, 0.1);
    parent.add(glass);

    const rim = new THREE.Mesh(
      isGoggles
        ? new THREE.BoxGeometry(0.13, 0.085, 0.018)
        : new THREE.TorusGeometry(0.057, 0.009, 5, 16),
      frame,
    );
    rim.position.set(x, 0.025, 0.115);
    parent.add(rim);
  }

  const bridge = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.012, 0.018), frame);
  bridge.position.set(0, 0.025, 0.115);
  parent.add(bridge);
  for (const x of [-0.13, 0.13]) {
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.16, 5), frame);
    arm.position.set(x, 0.025, 0.025);
    arm.rotation.x = Math.PI / 2;
    parent.add(arm);
  }
}

function addBeard(parent, style) {
  if (style === 'nenhuma') return;

  const beard = new THREE.MeshStandardMaterial({ color: 0x402a21, roughness: 0.98, flatShading: true });
  const chin = new THREE.Mesh(
    new THREE.SphereGeometry(style === 'cheia' ? 0.105 : 0.075, 10, 7),
    beard,
  );
  chin.position.set(0, style === 'cheia' ? -0.07 : -0.045, 0.09);
  chin.scale.set(1, style === 'cheia' ? 0.78 : 0.52, 0.55);
  parent.add(chin);

  if (style === 'cheia') {
    for (const x of [-0.105, 0.105]) {
      const side = new THREE.Mesh(new THREE.SphereGeometry(0.055, 8, 6), beard);
      side.position.set(x, -0.035, 0.07);
      side.scale.set(0.7, 1, 0.65);
      parent.add(side);
    }
  }
}

export function createCastawayVisual(gltf, options = {}) {
  const model = cloneSkeleton(gltf.scene);
  colorModel(model);

  const bounds = new THREE.Box3().setFromObject(model);
  const size = bounds.getSize(new THREE.Vector3());
  const scale = 1.72 / size.y;
  const content = new THREE.Group();
  content.add(model);
  content.scale.setScalar(scale);
  content.position.y = -bounds.min.y * scale;
  const head = model.getObjectByName('mixamorigHead');
  const accessories = new THREE.Group();
  (head || content).add(accessories);
  addGlasses(accessories, options.glasses || 'nenhum');
  addBeard(accessories, options.beard || 'nenhuma');

  const boneNames = new Set();
  model.traverse((part) => {
    if (part.isBone) boneNames.add(part.name);
  });
  const clips = gltf.animations.map((clip) => {
    const compatible = clip.clone();
    compatible.tracks = compatible.tracks.filter((track) => {
      const target = track.name.slice(0, track.name.lastIndexOf('.'));
      return boneNames.has(target);
    });
    return compatible;
  });

  const visual = new THREE.Group();
  visual.add(content);
  const mixer = new THREE.AnimationMixer(model);
  const actions = new Map(clips.map((clip) => [clip.name, mixer.clipAction(clip)]));
  visual.userData.mixer = mixer;
  visual.userData.actions = actions;
  visual.userData.accessories = accessories;
  visual.userData.weaponAnchor = model.getObjectByName('mixamorigRightHand');
  visual.userData.activeClip = null;
  return visual;
}

export function animateCastaway(visual, speed, dt, pose) {
  if (!visual) return;
  const moving = THREE.MathUtils.clamp(speed / 6.8, 0, 1);
  const actions = visual.userData.actions;
  const clip = {
    attack: 'Attack',
    climb: 'Walking',
    jump: 'Run_03',
    vault: 'Run_03',
  }[pose] || (speed > 4.7 ? 'Running' : 'Walking');
  let action = actions.get(clip);
  if (!action) action = actions.get('Walking');

  if (action) {
    const previous = visual.userData.activeAction;
    if (visual.userData.activeClip !== action.getClip().name) {
      if (previous) previous.fadeOut(0.18);
      action.reset();
      const oneShot = action.getClip().name === 'Attack';
      action.setLoop(oneShot ? THREE.LoopOnce : THREE.LoopRepeat, oneShot ? 1 : Infinity);
      action.clampWhenFinished = oneShot;
      action.fadeIn(0.18).play();
      visual.userData.activeClip = action.getClip().name;
      visual.userData.activeAction = action;
    }
    const scale = pose === 'jump' || pose === 'vault'
      ? 0.9
      : action.getClip().name === 'Attack'
        ? 1.8
        : moving < 0.05 ? 0.12 : THREE.MathUtils.clamp(speed / 4, 0.65, 1.3);
    action.setEffectiveTimeScale(scale);
  }
  visual.userData.mixer.update(dt);
}
