// Modelos procedurais de vegetação e rochas (baixo-poli com cor por vértice).
// Tudo é determinístico: recebe um gerador `rng` e só consome números dele.
import * as THREE from '../three.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const C = (hex) => new THREE.Color(hex);
const mat = (extra) => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, ...extra });
const TRUNK_MAT = mat({ flatShading: true });
const LEAF_MAT = mat({ side: THREE.DoubleSide, roughness: 0.75, flatShading: true });
const COCO_MAT = new THREE.MeshStandardMaterial({ color: 0x5b3a1e, roughness: 0.7, flatShading: true });
const ROCK_MAT = mat({ flatShading: true, roughness: 0.97 });
const BUSH_MAT = mat({ flatShading: true, roughness: 0.9 });
const GRASS_MAT = mat({ side: THREE.DoubleSide, roughness: 1 });

function paint(geo, fn) {
  const p = geo.attributes.position, a = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) { const c = fn(p.getX(i), p.getY(i), p.getZ(i), i); a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
  geo.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return geo;
}
const lerpC = (a, b, t) => a.clone().lerp(b, Math.min(1, Math.max(0, t)));

// ---------- palmeira ----------
const RING_A = C(0x8b6b45), RING_B = C(0x6b5035);
function trunkGeo(h, bx, bz, rBase, rTop) {
  const rings = 12, seg = 7, pos = [], col = [], idx = [];
  for (let i = 0; i <= rings; i++) {
    const s = i / rings, cx = bx * s * s, cz = bz * s * s, y = h * s;
    const rad = (rBase + (rTop - rBase) * s + (s < 0.1 ? 0.07 * (1 - s / 0.1) : 0)) * (i % 2 ? 1.06 : 1);
    const c = i % 2 ? RING_A : RING_B;
    for (let j = 0; j < seg; j++) {
      const a = (j / seg) * Math.PI * 2;
      pos.push(cx + Math.cos(a) * rad, y, cz + Math.sin(a) * rad); col.push(c.r, c.g, c.b);
    }
  }
  for (let i = 0; i < rings; i++) for (let j = 0; j < seg; j++) {
    const a = i * seg + j, b = i * seg + ((j + 1) % seg), c = (i + 1) * seg + j, d = (i + 1) * seg + ((j + 1) % seg);
    idx.push(a, c, b, b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}

// Folha de palmeira ao longo de +X: sobe um pouco e cai (droop); bordas serrilhadas e
// dobra em V no meio.
const LEAF_BASE = C(0x2c6a2a), LEAF_TIP = C(0x78b84f);
function frondGeo(len, wmax, droop) {
  const n = 8, pos = [], col = [], idx = [];
  for (let j = 0; j <= n; j++) {
    const s = j / n, x = len * s, y = len * (0.34 * s - 0.6 * droop * s * s);
    const w = wmax * Math.pow(Math.sin(Math.PI * Math.min(1, s * 0.92 + 0.04)), 0.8) * (j % 2 ? 0.78 : 1);
    const c = lerpC(LEAF_BASE, LEAF_TIP, s), rib = lerpC(c, C(0xa6d36b), 0.35);
    pos.push(x, y - 0.3 * w, -w, x, y, 0, x, y - 0.3 * w, w);
    col.push(c.r, c.g, c.b, rib.r, rib.g, rib.b, c.r, c.g, c.b);
  }
  for (let j = 0; j < n; j++) {
    const a = j * 3, b = (j + 1) * 3;
    idx.push(a, b, a + 1, a + 1, b, b + 1, a + 1, b + 1, a + 2, a + 2, b + 1, b + 2);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}

// Origem na base do tronco, +Y para cima. userData: trunk (colisão/raycast), crown (balanço),
// phase (defasagem do vento).
export function makePalm(h, rng) {
  const g = new THREE.Group();
  const a = rng() * Math.PI * 2, bend = 0.4 + rng() * 0.9;
  const bx = Math.cos(a) * bend, bz = Math.sin(a) * bend;
  const trunk = new THREE.Mesh(trunkGeo(h, bx, bz, 0.23, 0.13), TRUNK_MAT);
  g.add(trunk);
  const crown = new THREE.Group(); crown.position.set(bx, h, bz); g.add(crown);

  const parts = [], n = 9 + ((rng() * 3) | 0);
  for (let i = 0; i < n; i++) {
    const f = frondGeo(1.9 + rng() * 0.8, 0.34 + rng() * 0.08, 0.8 + rng() * 0.5);
    const rotY = new THREE.Matrix4().makeRotationY((i / n) * Math.PI * 2 + rng() * 0.4);
    const tilt = new THREE.Matrix4().makeRotationZ(-0.15 + rng() * 0.5);
    f.applyMatrix4(rotY.multiply(tilt));
    parts.push(f);
  }
  crown.add(new THREE.Mesh(mergeGeometries(parts), LEAF_MAT));
  const cocos = [];
  for (let i = 0; i < 3; i++) {
    const s = new THREE.SphereGeometry(0.11, 6, 5);
    const ang = (i / 3) * Math.PI * 2 + rng();
    s.translate(Math.cos(ang) * 0.17, -0.16, Math.sin(ang) * 0.17);
    cocos.push(s);
  }
  crown.add(new THREE.Mesh(mergeGeometries(cocos), COCO_MAT));
  g.userData = { trunk, crown, phase: rng() * Math.PI * 2 };
  return g;
}

// ---------- rocha ----------
export function makeRock(rng, size) {
  const geo = new THREE.IcosahedronGeometry(1, 1);
  const s1 = rng() * 10, s2 = rng() * 10, s3 = rng() * 10;
  const base = lerpC(C(0x8a8579), C(0x6c675d), rng()), moss = C(0x5d7a3a);
  const mossy = rng() < 0.3;
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const k = 1 + 0.22 * Math.sin(x * 3.7 + s1) * Math.cos(z * 3.1 + s2) + 0.12 * Math.sin(y * 5.3 + s3);
    p.setXYZ(i, x * k, Math.max(y * k * 0.62, -0.25), z * k);
  }
  geo.computeVertexNormals();
  paint(geo, (x, y, z) => {
    const c = lerpC(base.clone().multiplyScalar(0.7), base, (y + 0.3) * 1.4);
    return mossy && y > 0.25 ? lerpC(c, moss, 0.55) : c;
  });
  const m = new THREE.Mesh(geo, ROCK_MAT);
  m.scale.set(size * (0.8 + rng() * 0.5), size * (0.6 + rng() * 0.3), size * (0.9 + rng() * 0.3));
  m.rotation.y = rng() * Math.PI * 2;
  return m;
}

// ---------- arbusto ----------
export function makeBush(rng, radius) {
  const parts = [], dark = C(0x2f5f2a), light = C(0x5f9a3e);
  for (let i = 0; i < 4; i++) {
    const r = radius * (0.55 + rng() * 0.4), g = new THREE.IcosahedronGeometry(r, 1);
    g.translate((rng() - 0.5) * radius * 1.1, r * 0.55 + rng() * 0.15, (rng() - 0.5) * radius * 1.1);
    paint(g, (x, y) => lerpC(dark, light, y / (radius * 1.2) + rng() * 0.12));
    parts.push(g);
  }
  return new THREE.Mesh(mergeGeometries(parts), BUSH_MAT);
}

// ---------- tufos de grama (instanciados: 1 draw call por ilha) ----------
let tuftGeo = null;
function getTuftGeo() {
  if (tuftGeo) return tuftGeo;
  const dark = C(0x35692b), tip = C(0x95c25a), parts = [];
  for (let b = 0; b < 4; b++) {
    const h = 0.3 + b * 0.05, w = 0.06;
    const g = new THREE.BufferGeometry();
    // lâmina: base larga, meio, ponta (levemente curva)
    const v = [-w, 0, 0, w, 0, 0, -w * 0.6, h * 0.55, 0.03, w * 0.6, h * 0.55, 0.03, 0, h, 0.09];
    g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
    g.setIndex([0, 1, 2, 1, 3, 2, 2, 3, 4]);
    paint(g, (x, y) => lerpC(dark, tip, y / h));
    g.rotateY((b / 4) * Math.PI + b * 0.3);
    g.translate((b % 2 ? 1 : -1) * 0.03, 0, (b < 2 ? 1 : -1) * 0.025);
    parts.push(g);
  }
  tuftGeo = mergeGeometries(parts);
  return tuftGeo;
}
// pontos = [[x, y, z], ...] em coordenadas locais do grupo da ilha.
export function makeGrassTufts(rng, pontos) {
  const mesh = new THREE.InstancedMesh(getTuftGeo(), GRASS_MAT, pontos.length);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  pontos.forEach(([x, y, z], i) => {
    q.setFromAxisAngle(up, rng() * Math.PI * 2);
    const k = 1.1 + rng() * 1.0;
    m.compose(p.set(x, y, z), q, s.set(k, k * (0.8 + rng() * 0.6), k));
    mesh.setMatrixAt(i, m);
    mesh.setColorAt(i, new THREE.Color().setScalar(0.8 + rng() * 0.4));
  });
  mesh.userData.noShadow = true; // pequenos demais: sombra só gasta GPU
  return mesh;
}
