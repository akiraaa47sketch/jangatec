import * as THREE from '../three.js';

const sphere = (radius, segments = 12) => new THREE.SphereGeometry(radius, segments, Math.max(8, segments - 2));
const capsule = (radius, length, segments = 10) => new THREE.CapsuleGeometry(radius, length, 4, segments);

function mesh(parent, geometry, material, position, scale = null) {
  const part = new THREE.Mesh(geometry, material);
  part.position.set(...position);
  if (scale) part.scale.set(...scale);
  parent.add(part);
  return part;
}

function addStrapSegment(parent, start, end, width, material) {
  const from = new THREE.Vector3(...start);
  const to = new THREE.Vector3(...end);
  const direction = to.clone().sub(from);
  const strap = new THREE.Mesh(new THREE.BoxGeometry(width, direction.length(), 0.025), material);
  strap.position.copy(from).add(to).multiplyScalar(0.5);
  strap.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
  parent.add(strap);
  return strap;
}

export function makeHumanoid(color = 0xb49b7b, skin = 0xb97251, variant = 'survivor') {
  const g = new THREE.Group();
  const rig = new THREE.Group();
  g.add(rig);
  const makeMaterial = (tint, roughness = 0.88, metalness = 0) => new THREE.MeshStandardMaterial({
    color: tint, roughness, metalness, flatShading: true,
  });
  const shirtMat = makeMaterial(color, 0.95);
  const skinMat = makeMaterial(skin, 0.86);
  const shortsMat = makeMaterial(0x35343a, 0.98);
  const hairMat = makeMaterial(0x40241b);
  const darkMat = makeMaterial(0x221b19);
  const leatherMat = makeMaterial(0x583a28);
  const strapMat = makeMaterial(0x65462f);
  const soleMat = makeMaterial(0x30231e);
  const bandageMat = makeMaterial(0xd0b99a);
  const brassMat = makeMaterial(0xa98249, 0.7, 0.18);
  const logoMat = makeMaterial(0x77705a);
  const gearMat = makeMaterial(variant === 'pesado' ? 0x403b31 : 0x565343);

  const torso = new THREE.Group();
  torso.position.y = 0.98;
  const torsoContents = new THREE.Group();
  torsoContents.position.y = -0.98;
  torso.add(torsoContents);
  mesh(torsoContents, capsule(0.19, 0.32, 12), shirtMat, [0, 1.21, 0], [1.08, 1, 0.84]);
  mesh(torsoContents, capsule(0.105, 0.13, 10), shirtMat, [-0.29, 1.39, 0], [1, 1, 0.92]);
  mesh(torsoContents, capsule(0.105, 0.13, 10), shirtMat, [0.29, 1.39, 0], [1, 1, 0.92]);

  const hem = mesh(torsoContents, new THREE.CylinderGeometry(0.19, 0.2, 0.055, 10), shirtMat, [0, 0.98, 0]);
  hem.scale.z = 0.82;
  const collar = mesh(torsoContents, new THREE.TorusGeometry(0.075, 0.018, 6, 12), leatherMat, [0, 1.49, 0]);
  collar.rotation.x = Math.PI / 2;

  if (variant === 'survivor') {
    mesh(torsoContents, new THREE.CylinderGeometry(0.007, 0.007, 0.09, 5), logoMat, [0.08, 1.22, 0.163]);
    for (const [x, y, angle] of [[0.04, 1.29, -0.75], [0.09, 1.31, 0], [0.14, 1.29, 0.75]]) {
      const leaf = mesh(torsoContents, new THREE.BoxGeometry(0.075, 0.012, 0.009), logoMat, [x, y, 0.163]);
      leaf.rotation.z = angle;
    }
  }

  const straps = new THREE.Group();
  const points = [
    [-0.25, 1.48, 0.13],
    [-0.17, 1.34, 0.18],
    [-0.02, 1.15, 0.185],
    [0.14, 0.99, 0.15],
  ];
  for (let i = 0; i < points.length - 1; i++) {
    addStrapSegment(straps, points[i], points[i + 1], 0.075, strapMat);
  }
  const buckle = mesh(straps, new THREE.BoxGeometry(0.095, 0.105, 0.035), brassMat, [-0.21, 1.42, 0.19]);
  buckle.rotation.z = -0.42;
  const buckleInset = mesh(straps, new THREE.BoxGeometry(0.047, 0.06, 0.039), strapMat, [-0.21, 1.42, 0.211]);
  buckleInset.rotation.z = -0.42;
  torsoContents.add(straps);

  const pouch = mesh(torsoContents, new THREE.BoxGeometry(0.22, 0.23, 0.14), leatherMat, [0.21, 0.91, -0.015]);
  pouch.rotation.z = -0.12;
  mesh(torsoContents, new THREE.BoxGeometry(0.17, 0.045, 0.15), strapMat, [0.21, 1.035, -0.005]);

  const pelvis = mesh(rig, sphere(1, 12), shortsMat, [0, 0.82, 0], [0.205, 0.16, 0.145]);
  const belt = mesh(rig, new THREE.TorusGeometry(0.177, 0.026, 6, 16), leatherMat, [0, 0.91, 0]);
  belt.rotation.x = Math.PI / 2;
  belt.scale.z = 0.78;
  mesh(rig, new THREE.BoxGeometry(0.07, 0.055, 0.025), brassMat, [0, 0.91, 0.177]);

  const head = new THREE.Group();
  head.position.y = 0.7;
  mesh(head, sphere(0.17, 12), skinMat, [0, 0.02, 0], [0.91, 1.12, 0.9]);
  mesh(torsoContents, capsule(0.065, 0.1, 10), skinMat, [0, 1.49, 0]);

  const hairCap = new THREE.Mesh(new THREE.SphereGeometry(0.185, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.66), hairMat);
  hairCap.position.set(0, 0.09, -0.005);
  hairCap.scale.set(1.02, 0.9, 1.02);
  head.add(hairCap);
  for (const [x, y, z, rotation] of [
    [-0.12, 0.12, -0.04, -0.7], [-0.06, 0.18, -0.045, -0.45],
    [0.02, 0.19, -0.035, -0.55], [0.1, 0.15, -0.04, -0.8],
    [0.15, 0.1, -0.015, -1.05], [-0.15, 0.05, -0.01, -1.2],
  ]) {
    const tuft = mesh(head, new THREE.ConeGeometry(0.075, 0.17, 5), hairMat, [x, y, z]);
    tuft.rotation.x = rotation;
    tuft.rotation.z = x * -2;
  }
  mesh(head, new THREE.ConeGeometry(0.07, 0.14, 5), hairMat, [0, 0.08, 0.145]).rotation.x = 0.75;

  const eyeMat = makeMaterial(0x241d1c, 0.65);
  for (const x of [-0.052, 0.052]) {
    mesh(head, sphere(0.015, 8), eyeMat, [x, 0.03, 0.145], [1, 0.85, 0.7]);
    const brow = mesh(head, new THREE.BoxGeometry(0.055, 0.014, 0.018), hairMat, [x, 0.058, 0.145]);
    brow.rotation.z = x < 0 ? 0.14 : -0.14;
  }
  mesh(head, new THREE.ConeGeometry(0.022, 0.07, 5), skinMat, [0, -0.015, 0.16]).rotation.x = Math.PI / 2;
  mesh(head, new THREE.BoxGeometry(0.045, 0.008, 0.012), darkMat, [0, -0.065, 0.147]);
  for (const x of [-0.16, 0.16]) {
    mesh(head, sphere(0.035, 8), skinMat, [x, 0.015, -0.005], [0.55, 1, 0.6]);
  }
  torso.add(head);

  const backpack = new THREE.Group();
  mesh(backpack, new THREE.BoxGeometry(0.34, 0.38, 0.16), gearMat, [0, 1.13, -0.19]);
  mesh(backpack, new THREE.BoxGeometry(0.24, 0.12, 0.18), leatherMat, [0, 1.37, -0.18]);
  mesh(backpack, new THREE.BoxGeometry(0.2, 0.14, 0.035), strapMat, [0, 1.05, -0.285]);
  backpack.visible = variant === 'pesado';
  rig.add(backpack);

  const leg = (x) => {
    const hip = new THREE.Group();
    hip.position.set(x, 0.77, 0);
    mesh(hip, new THREE.CylinderGeometry(0.125, 0.11, 0.39, 9), shortsMat, [0, -0.17, 0]);
    mesh(hip, capsule(0.073, 0.18, 9), skinMat, [0, -0.25, 0], [1, 1, 0.95]);
    const knee = new THREE.Group();
    knee.position.y = -0.36;
    mesh(knee, sphere(0.073, 9), skinMat, [0, -0.015, 0], [1, 0.9, 0.95]);
    mesh(knee, capsule(0.07, 0.26, 9), skinMat, [0, -0.19, 0], [1, 1, 0.95]);
    const ankle = new THREE.Group();
    ankle.position.y = -0.38;
    mesh(ankle, sphere(0.095, 10), skinMat, [0, -0.01, 0.035], [0.88, 0.48, 1.45]);
    mesh(ankle, new THREE.BoxGeometry(0.18, 0.045, 0.29), soleMat, [0, -0.04, 0.045]);
    const strapA = mesh(ankle, new THREE.BoxGeometry(0.16, 0.027, 0.026), leatherMat, [0, -0.01, 0.12]);
    strapA.rotation.y = -0.22;
    const strapB = mesh(ankle, new THREE.BoxGeometry(0.16, 0.027, 0.026), leatherMat, [0, -0.015, -0.01]);
    strapB.rotation.y = 0.22;
    const ankleStrap = mesh(ankle, new THREE.TorusGeometry(0.071, 0.013, 5, 10), leatherMat, [0, 0.015, 0]);
    ankleStrap.rotation.x = Math.PI / 2;
    const shortHem = mesh(hip, new THREE.TorusGeometry(0.112, 0.012, 5, 10), shortsMat, [0, -0.36, 0]);
    shortHem.rotation.x = Math.PI / 2;
    shortHem.scale.z = 0.88;
    knee.add(ankle);
    hip.add(knee);
    rig.add(hip);
    return { hip, knee, ankle };
  };
  const legL = leg(-0.12), legR = leg(0.12);

  const arm = (x, isRight) => {
    const pivot = new THREE.Group();
    pivot.position.set(x, 0.39, 0);
    const sleeve = mesh(pivot, capsule(0.09, 0.17, 9), shirtMat, [0, -0.11, 0], [1, 1, 0.95]);
    sleeve.rotation.z = x < 0 ? -0.12 : 0.12;
    const elbow = new THREE.Group();
    elbow.position.y = -0.21;
    mesh(elbow, sphere(0.06, 8), skinMat, [0, -0.01, 0], [1, 1, 0.9]);
    mesh(elbow, capsule(0.061, 0.25, 9), skinMat, [0, -0.17, 0], [1, 1, 0.9]);
    mesh(elbow, sphere(0.058, 9), skinMat, [0, -0.35, 0.015], [1, 0.9, 0.8]);
    if (isRight) {
      for (const y of [-0.13, -0.18, -0.23]) {
        const wrap = mesh(elbow, new THREE.TorusGeometry(0.059, 0.012, 5, 10), bandageMat, [0, y, 0]);
        wrap.rotation.x = Math.PI / 2;
      }
    }
    pivot.add(elbow);
    torso.add(pivot);
    return { shoulder: pivot, elbow };
  };
  const armL = arm(-0.34, false), armR = arm(0.34, true);

  if (variant === 'rapido') {
    const bandana = mesh(head, new THREE.BoxGeometry(0.29, 0.065, 0.2), brassMat, [0, -0.035, -0.01]);
    bandana.rotation.x = -0.12;
  }
  if (variant === 'melee') {
    const scarf = mesh(rig, new THREE.TorusGeometry(0.085, 0.035, 6, 12), makeMaterial(0x79352e), [0, 1.48, 0]);
    scarf.rotation.x = Math.PI / 2;
  }
  if (variant === 'atirador') {
    addStrapSegment(rig, [0.24, 1.45, 0.12], [-0.19, 0.98, 0.14], 0.055, strapMat);
  }
  if (variant === 'pesado') {
    mesh(rig, new THREE.BoxGeometry(0.23, 0.14, 0.2), leatherMat, [0.29, 1.39, 0]);
  }

  rig.add(torso);
  g.userData.parts = {
    legL: legL.hip, legR: legR.hip, kneeL: legL.knee, kneeR: legR.knee,
    ankleL: legL.ankle, ankleR: legR.ankle,
    armL: armL.shoulder, armR: armR.shoulder, elbowL: armL.elbow, elbowR: armR.elbow,
    torso, pelvis, head, rig, phase: 0,
  };
  return g;
}

export function animateHumanoid(g, speed, dt, pose = 'walk', progress = 0, obstacleHeight = 0) {
  const p = g.userData.parts;
  const moving = THREE.MathUtils.clamp(speed / 6.8, 0, 1);
  const run = THREE.MathUtils.clamp((speed - 4.7) / 2.1, 0, 1);
  p.phase += dt * (speed > 0.15 ? 6.5 + speed * 0.75 : 2);
  const cycle = Math.sin(p.phase);
  const stride = cycle * moving * (0.4 + run * 0.25);
  const sway = Math.sin(p.phase * 0.7) * 0.045;
  const action = THREE.MathUtils.clamp(progress, 0, 1);
  const reach = Math.sin(action * Math.PI);
  const height = THREE.MathUtils.clamp((obstacleHeight - 0.35) / 1.9, 0, 1);
  const phase = (start, end) => {
    const t = THREE.MathUtils.clamp((action - start) / (end - start), 0, 1);
    return t * t * (3 - 2 * t);
  };

  p.rig.position.y = pose === 'walk' ? Math.abs(Math.sin(p.phase * 2)) * moving * (0.014 + run * 0.024) : 0;
  p.pelvis.rotation.x = pose === 'walk' ? cycle * moving * 0.035 : 0;
  p.pelvis.rotation.y = pose === 'walk' ? Math.sin(p.phase) * run * 0.025 : 0;
  p.torso.rotation.z = pose === 'climb' || pose === 'vault' ? -0.025 : sway * moving;
  p.torso.rotation.x = pose === 'climb' ? 0.24 : pose === 'vault' ? 0.04 : pose === 'swim' ? -0.18 : pose === 'attack' ? 0.08 : moving * (0.015 + run * 0.08);
  p.head.rotation.z = -p.torso.rotation.z * 0.35;
  p.head.rotation.x = -p.torso.rotation.x * 0.3;

  if (pose === 'vault') {
    const reachUp = phase(0.02, 0.24);
    const clear = phase(0.32, 0.66);
    const recover = phase(0.72, 1);
    const follow = phase(0.3, 0.65);
    const brace = phase(0.02, 0.2);
    p.torso.rotation.x = 0.34 * brace - 0.34 * recover;
    p.armL.rotation.x = -0.15 - reachUp * (1 + height * 0.22) + clear * 0.2 + recover * (0.95 + height * 0.22);
    p.armR.rotation.x = -0.2 - reachUp * (1.4 + height * 0.2) + clear * 0.35 + recover * (1.25 + height * 0.2);
    p.elbowL.rotation.x = -0.12 - reachUp * 0.25 + recover * 0.37;
    p.elbowR.rotation.x = -0.18 - reachUp * 0.45 + recover * 0.63;
    p.legL.rotation.x = -0.08 - reachUp * 0.2 - clear * (0.5 + height * 0.35) + recover * (0.78 + height * 0.35);
    p.legR.rotation.x = 0.08 - follow * (0.4 + height * 0.25) + recover * (0.32 + height * 0.25);
    p.kneeL.rotation.x = 0.04 - clear * (0.4 + height * 0.25) + recover * (0.36 + height * 0.25);
    p.kneeR.rotation.x = 0.04 - follow * (0.5 + height * 0.25) + recover * (0.46 + height * 0.25);
    p.ankleL.rotation.x = -p.kneeL.rotation.x * 0.35;
    p.ankleR.rotation.x = -p.kneeR.rotation.x * 0.35;
  } else if (pose === 'climb') {
    const reachUp = phase(0.02, 0.24);
    const pull = phase(0.22, 0.55);
    const clear = phase(0.48, 0.74);
    const recover = phase(0.78, 1);
    const pullReach = 1.75 + height * 0.45;
    p.torso.rotation.x = 0.08 + reachUp * 0.15 + pull * 0.12 - recover * 0.35;
    p.armL.rotation.x = -0.3 - reachUp * pullReach + pull * 0.7 + clear * 0.6 + recover * (0.75 + height * 0.45);
    p.armR.rotation.x = -0.42 - reachUp * (pullReach - 0.15) + pull * 0.65 + clear * 0.58 + recover * (0.79 + height * 0.45);
    p.elbowL.rotation.x = -0.08 - pull * (0.6 + height * 0.15) + clear * 0.08 + recover * (0.6 + height * 0.15);
    p.elbowR.rotation.x = -0.1 - pull * (0.65 + height * 0.15) + clear * 0.12 + recover * (0.63 + height * 0.15);
    p.legL.rotation.x = -0.08 - reachUp * 0.25 - clear * (0.55 + height * 0.25) + recover * (0.88 + height * 0.25);
    p.legR.rotation.x = 0.1 - pull * (0.45 + height * 0.1) - clear * 0.25 + recover * (0.6 + height * 0.1);
    p.kneeL.rotation.x = 0.04 - pull * (0.4 + height * 0.1) - clear * 0.32 + recover * (0.68 + height * 0.1);
    p.kneeR.rotation.x = 0.04 - pull * (0.62 + height * 0.1) - clear * 0.08 + recover * (0.66 + height * 0.1);
    p.ankleL.rotation.x = -p.kneeL.rotation.x * 0.35;
    p.ankleR.rotation.x = -p.kneeR.rotation.x * 0.35;
  } else if (pose === 'attack') {
    p.legL.rotation.x = -0.12;
    p.legR.rotation.x = 0.12;
    p.kneeL.rotation.x = p.kneeR.rotation.x = 0.12;
    p.ankleL.rotation.x = p.ankleR.rotation.x = 0;
    p.armR.rotation.x = -0.55 - reach * 1.75;
    p.armL.rotation.x = -0.35;
    p.elbowR.rotation.x = -0.18 - reach * 0.65;
    p.elbowL.rotation.x = -0.35;
  } else if (pose === 'aim') {
    p.legL.rotation.x = p.legR.rotation.x = 0;
    p.kneeL.rotation.x = p.kneeR.rotation.x = 0;
    p.ankleL.rotation.x = p.ankleR.rotation.x = 0;
    p.armR.rotation.x = -1.3;
    p.armL.rotation.x = -1.08;
    p.elbowR.rotation.x = -0.45;
    p.elbowL.rotation.x = -0.72;
  } else if (pose === 'row') {
    // Ajoelhado na balsa, puxando o remo em ciclos (progress = fase da remada 0..1).
    const stroke = Math.sin(action * Math.PI * 2), pull = Math.cos(action * Math.PI * 2);
    p.rig.position.y = -0.36;
    p.torso.rotation.x = 0.28 + stroke * 0.22;
    p.torso.rotation.z = pull * 0.08;
    p.legL.rotation.x = -1.45; p.legR.rotation.x = -0.25;
    p.kneeL.rotation.x = 1.5; p.kneeR.rotation.x = 1.75;
    p.ankleL.rotation.x = p.ankleR.rotation.x = -0.3;
    p.armL.rotation.x = -1.1 - stroke * 0.55;
    p.armR.rotation.x = -1.0 - stroke * 0.6;
    p.elbowL.rotation.x = -0.5 - Math.max(0, pull) * 0.6;
    p.elbowR.rotation.x = -0.45 - Math.max(0, pull) * 0.6;
  } else if (pose === 'leap') {
    // Balançando na corda do gancho: braços para cima, pernas encolhidas, aterrissagem.
    const tuck = Math.sin(action * Math.PI), land = phase(0.8, 1);
    p.torso.rotation.x = -0.15 + tuck * 0.3;
    p.armL.rotation.x = -2.7 + land * 1.6; p.armR.rotation.x = -2.9 + land * 1.8;
    p.elbowL.rotation.x = p.elbowR.rotation.x = -0.3;
    p.legL.rotation.x = -0.9 * tuck - 0.2; p.legR.rotation.x = -0.6 * tuck;
    p.kneeL.rotation.x = 1.2 * tuck; p.kneeR.rotation.x = 1.0 * tuck + 0.1;
    p.ankleL.rotation.x = p.ankleR.rotation.x = -0.2 * tuck;
  } else if (pose === 'swim') {
    p.legL.rotation.x = stride;
    p.legR.rotation.x = -stride;
    p.kneeL.rotation.x = Math.max(0, stride) * 0.55;
    p.kneeR.rotation.x = Math.max(0, -stride) * 0.55;
    p.ankleL.rotation.x = -p.kneeL.rotation.x * 0.45;
    p.ankleR.rotation.x = -p.kneeR.rotation.x * 0.45;
    p.armL.rotation.x = -2 + stride * 0.4;
    p.armR.rotation.x = -2 - stride * 0.4;
    p.elbowL.rotation.x = -0.42;
    p.elbowR.rotation.x = -0.42;
  } else {
    const swingL = Math.max(0, -cycle), swingR = Math.max(0, cycle);
    p.legL.rotation.x = stride;
    p.legR.rotation.x = -stride;
    p.kneeL.rotation.x = -swingL * moving * (0.18 + run * 0.48);
    p.kneeR.rotation.x = -swingR * moving * (0.18 + run * 0.48);
    p.ankleL.rotation.x = -p.kneeL.rotation.x * 0.35;
    p.ankleR.rotation.x = -p.kneeR.rotation.x * 0.35;
    p.armL.rotation.x = -stride * (0.8 + run * 0.28);
    p.armR.rotation.x = stride * (0.8 + run * 0.28);
    p.elbowL.rotation.x = -0.12 - swingL * moving * run * 0.32;
    p.elbowR.rotation.x = -0.12 - swingR * moving * run * 0.32;
    // Parado: respiração e leve troca de apoio para não parecer uma estátua.
    const idle = 1 - moving;
    {
      const breath = Math.sin(p.phase * 1.3), shift = Math.sin(p.phase * 0.35);
      p.torso.rotation.x += breath * 0.025 * idle;
      p.head.rotation.x += Math.sin(p.phase * 1.3 + 0.6) * 0.03 * idle;
      p.head.rotation.y = shift * 0.18 * idle;
      p.armL.rotation.z = (-0.06 - breath * 0.025) * idle;
      p.armR.rotation.z = (0.06 + breath * 0.025) * idle;
      p.pelvis.rotation.z = shift * 0.03 * idle;
      p.legL.rotation.z = -shift * 0.03 * idle; p.legR.rotation.z = -shift * 0.03 * idle;
    }
  }
  if (pose !== 'walk') { p.head.rotation.y = 0; p.armL.rotation.z = p.armR.rotation.z = 0; p.pelvis.rotation.z = 0; p.legL.rotation.z = p.legR.rotation.z = 0; }
}
