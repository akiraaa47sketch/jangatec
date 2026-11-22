// Menu de personalização da pílula (o personagem do jogo): cores, rosto, calçado e chapéu,
// prévia 3D girando (arraste para girar) e aparência salva no navegador.
import * as THREE from '../three.js';
import {
  makePill, animatePill, disposePill, sanitizePill, randomPill,
  PILL_COLORS, PILL_BASE_COLORS, PILL_FACES, PILL_BOOTS, PILL_HATS, PILL_DEFAULT, PILL_SCALE,
} from '../player/pill.js';

const KEY = 'mare-alta-aparencia';
const $ = (id) => document.getElementById(id);
const hex = (h) => '#' + h.toString(16).padStart(6, '0');

export class CharacterMenu {
  constructor(onChange) {
    this.onChange = onChange;
    this.state = this.load();
    this.buildControls();
    this.setupPreview();
    this.syncControls();
  }

  load() {
    let saved = null;
    try { saved = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { saved = null; }
    const s = saved && typeof saved === 'object' ? saved : {};
    return {
      character: 'pilula', // a pílula é o único personagem
      pill: sanitizePill(s.pill || PILL_DEFAULT),
    };
  }
  save() { try { localStorage.setItem(KEY, JSON.stringify(this.state)); } catch { /* sem armazenamento: tudo bem */ } }

  get appearance() { return { ...this.state, pill: { ...this.state.pill } }; }

  changed() {
    this.save();
    this.syncControls();
    this.rebuildPreview();
    this.onChange(this.appearance);
  }

  buildControls() {
    const fill = (id, list) => { $(id).replaceChildren(...list.map((o) => new Option(o.nome, o.id))); };
    fill('pillFace', PILL_FACES); fill('pillBoots', PILL_BOOTS); fill('pillHat', PILL_HATS);
    for (const box of document.querySelectorAll('.swatches')) {
      const key = box.dataset.key, list = key === 'base' ? PILL_BASE_COLORS : PILL_COLORS;
      box.replaceChildren(...list.map((c, i) => {
        const b = document.createElement('button');
        b.type = 'button'; b.title = c.nome; b.setAttribute('aria-label', c.nome);
        b.style.background = hex(c.hex);
        b.onclick = () => { this.state.pill[key] = i; this.changed(); };
        return b;
      }));
    }
    $('pillFace').onchange = (e) => { this.state.pill.face = e.target.value; this.changed(); };
    $('pillBoots').onchange = (e) => { this.state.pill.boots = e.target.value; this.changed(); };
    $('pillHat').onchange = (e) => { this.state.pill.hat = e.target.value; this.changed(); };
    $('pillRandom').onclick = () => { this.state.pill = randomPill(); this.changed(); };
  }

  syncControls() {
    const s = this.state;
    $('pillFace').value = s.pill.face; $('pillBoots').value = s.pill.boots; $('pillHat').value = s.pill.hat;
    for (const box of document.querySelectorAll('.swatches')) {
      [...box.children].forEach((b, i) => b.classList.toggle('sel', i === s.pill[box.dataset.key]));
    }
  }

  // ---------- prévia 3D ----------
  setupPreview() {
    const canvas = $('charPreview');
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.setSize(170, 210, false);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.scene = new THREE.Scene();
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x334455, 1.3));
    const key = new THREE.DirectionalLight(0xfff2e6, 2.4); key.position.set(3, 5, 5); this.scene.add(key);
    const rim = new THREE.DirectionalLight(0xbcd2ff, 1.2); rim.position.set(-4, 3, -4); this.scene.add(rim);
    this.camera = new THREE.PerspectiveCamera(30, 170 / 210, 0.1, 50);
    this.camera.position.set(0, 1.2, 4.9); this.camera.lookAt(0, 0.95, 0);
    this.holder = new THREE.Group(); this.scene.add(this.holder);
    this.spin = 0.5; this.drag = null;
    canvas.addEventListener('pointerdown', (e) => { this.drag = e.clientX; canvas.setPointerCapture(e.pointerId); });
    canvas.addEventListener('pointermove', (e) => { if (this.drag != null) { this.spin += (e.clientX - this.drag) * 0.02; this.drag = e.clientX; } });
    canvas.addEventListener('pointerup', () => { this.drag = null; });
    this.rebuildPreview();
  }

  rebuildPreview() {
    if (!this.holder) return;
    for (const c of this.holder.children.slice()) {
      this.holder.remove(c);
      if (c.userData.isPill) disposePill(c.children[0]);
    }
    this.pill = null;
    const g = new THREE.Group(); g.userData.isPill = true;
    this.pill = makePill(this.state.pill); g.add(this.pill); g.scale.setScalar(PILL_SCALE);
    this.holder.add(g);
  }

  update(dt, visible) {
    if (!visible || !this.renderer) return;
    if (this.drag == null) this.spin += dt * 0.6;
    this.holder.rotation.y = this.spin;
    if (this.pill) animatePill(this.pill, 0, dt, 'walk');
    this.renderer.render(this.scene, this.camera);
  }
}
