import * as THREE from '../three.js';

function makeSunGlowTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 512;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Não foi possível criar a textura do sol');

  const center = 256;
  context.translate(center, center);
  const glow = context.createRadialGradient(0, 0, 20, 0, 0, 250);
  glow.addColorStop(0, 'rgba(255, 222, 170, 0.3)');
  glow.addColorStop(0.28, 'rgba(255, 197, 130, 0.16)');
  glow.addColorStop(0.68, 'rgba(255, 180, 120, 0.045)');
  glow.addColorStop(1, 'rgba(255, 180, 100, 0)');
  context.fillStyle = glow;
  context.fillRect(-center, -center, canvas.width, canvas.height);

  for (let i = 0; i < 8; i++) {
    context.rotate(Math.PI / 8);
    context.beginPath();
    context.moveTo(-8, -42);
    context.lineTo(-24, -205);
    context.lineTo(0, -166);
    context.lineTo(24, -205);
    context.lineTo(8, -42);
    context.closePath();
    const ray = context.createLinearGradient(0, -42, 0, -205);
    ray.addColorStop(0, 'rgba(255, 230, 180, 0.045)');
    ray.addColorStop(0.62, 'rgba(255, 220, 165, 0.018)');
    ray.addColorStop(1, 'rgba(255, 210, 150, 0)');
    context.fillStyle = ray;
    context.fill();
  }

  const disc = context.createRadialGradient(0, 0, 0, 0, 0, 38);
  disc.addColorStop(0, 'rgba(255, 250, 225, 0.98)');
  disc.addColorStop(0.62, 'rgba(255, 226, 170, 0.95)');
  disc.addColorStop(0.9, 'rgba(255, 196, 120, 0.8)');
  disc.addColorStop(1, 'rgba(255, 184, 110, 0)');
  context.fillStyle = disc;
  context.beginPath();
  context.arc(0, 0, 38, 0, Math.PI * 2);
  context.fill();

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export class SunVisual {
  constructor(scene, direction) {
    this.direction = direction.clone().normalize();
    this.cameraForward = new THREE.Vector3();
    this.cameraRight = new THREE.Vector3();
    this.cameraUp = new THREE.Vector3();
    this.group = new THREE.Group();

    this.glowMaterial = new THREE.MeshBasicMaterial({
      map: makeSunGlowTexture(),
      color: 0xffc36b,
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
      fog: false,
      toneMapped: false,
    });
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(96, 96), this.glowMaterial);
    glow.position.z = -1;
    this.glow = glow;
    this.group.add(glow);

    scene.add(this.group);
  }

  update(camera, t, cameraRelative = false) {
    if (cameraRelative) {
      this.cameraForward.set(0, 0, -1).applyQuaternion(camera.quaternion);
      this.cameraRight.set(1, 0, 0).applyQuaternion(camera.quaternion);
      this.cameraUp.set(0, 1, 0).applyQuaternion(camera.quaternion);
      this.group.position.copy(camera.position)
        .addScaledVector(this.cameraForward, 240)
        .addScaledVector(this.cameraRight, 120)
        .addScaledVector(this.cameraUp, 80);
    } else {
      this.group.position.copy(camera.position).addScaledVector(this.direction, 240);
    }
    this.group.quaternion.copy(camera.quaternion);
    this.glow.rotation.z = t * 0.012;
  }

  setStorm(amount) {
    const storm = THREE.MathUtils.clamp(amount, 0, 1);
    this.glowMaterial.opacity = 0.85 * (1 - storm * 0.82);
  }
}
