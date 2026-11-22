// Personalização da pílula (o personagem do jogo), organizada por categoria: Corpo, Rosto, Chapéu,
// Roupa, Calçado e Acessório. Cada categoria mostra as opções em botões e as cores ligadas a ela;
// a prévia 3D aproxima a câmera da parte que está sendo editada. A aparência fica salva no navegador.
import * as THREE from '../three.js';
import {
  makePill, animatePill, disposePill, sanitizePill, randomPill,
  PILL_COLORS, PILL_BASE_COLORS, PILL_FACES, PILL_BOOTS, PILL_HATS, PILL_DEFAULT, PILL_SCALE, PILL_OUTFITS, PILL_BACKS,
} from '../player/pill.js';

const KEY = 'mare-alta-aparencia';
const $ = (id) => document.getElementById(id);
const hex = (h) => '#' + h.toString(16).padStart(6, '0');

// view: enquadramento da câmera da prévia ([posição], [alvo]); turn: gira o boneco (acessório nas costas)
const VIEWS = {
  full: { pos: [0, 1.05, 4.7], look: [0, 0.88, 0] },
  head: { pos: [0, 1.45, 3.1], look: [0, 1.26, 0] },
  body: { pos: [0, 1.1, 3.1], look: [0, 0.95, 0] },
  feet: { pos: [0, 0.6, 2.4], look: [0, 0.28, 0] },
};
const CATS = [
  { id: 'corpo', nome: 'Corpo', view: 'full', colors: [['cap', 'Cápsula', PILL_COLORS], ['base', 'Base', PILL_BASE_COLORS], ['gloves', 'Luvas', PILL_COLORS]] },
  { id: 'rosto', nome: 'Rosto', view: 'head', options: ['face', PILL_FACES] },
  { id: 'chapeu', nome: 'Chapéu', view: 'head', options: ['hat', PILL_HATS], colors: [['hatColor', 'Cor', PILL_COLORS]] },
  { id: 'roupa', nome: 'Roupa', view: 'body', options: ['outfit', PILL_OUTFITS], colors: [['outfitColor', 'Cor', PILL_COLORS]] },
  { id: 'calcado', nome: 'Calçado', view: 'feet', options: ['boots', PILL_BOOTS], colors: [['bootColor', 'Cor', PILL_COLORS]] },
  { id: 'acessorio', nome: 'Acessório', view: 'body', turn: true, options: ['back', PILL_BACKS] },
];

export class CharacterMenu {
  constructor(onChange) {
    this.onChange = onChange;
    this.state = this.load();
    this.cat = CATS[0];
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
    const cats = $('charCats');
    cats.replaceChildren(...CATS.map((c) => {
      const b = document.createElement('button');
      b.type = 'button'; b.textContent = c.nome; b.dataset.cat = c.id; b.setAttribute('role', 'tab');
      b.onclick = () => this.showCat(c);
      return b;
    }));
    $('pillRandom').onclick = () => { this.state.pill = randomPill(); this.changed(); };
    $('pillReset').onclick = () => { this.state.pill = sanitizePill(PILL_DEFAULT); this.changed(); };
    this.showCat(this.cat);
  }

  showCat(cat) {
    this.cat = cat;
    if (cat.turn) this.spinTarget = Math.PI + 0.5; else this.spinTarget = null;
    const panel = $('charPanel'), parts = [];
    if (cat.options) {
      const [key, list] = cat.options;
      const grid = document.createElement('div'); grid.className = 'char-opts';
      grid.replaceChildren(...list.map((o) => {
        const b = document.createElement('button');
        b.type = 'button'; b.textContent = o.nome; b.dataset.key = key; b.dataset.val = o.id;
        b.onclick = () => { this.state.pill[key] = o.id; this.changed(); };
        return b;
      }));
      parts.push(grid);
    }
    for (const [key, label, list] of cat.colors || []) {
      const row = document.createElement('div'); row.className = 'char-colors';
      const name = document.createElement('span'); name.className = 'char-label';
      const sw = document.createElement('div'); sw.className = 'swatches'; sw.dataset.key = key;
      sw.replaceChildren(...list.map((c, i) => {
        const b = document.createElement('button');
        b.type = 'button'; b.title = c.nome; b.setAttribute('aria-label', `${label}: ${c.nome}`);
        b.style.setProperty('--c', hex(c.hex));
        b.onclick = () => { this.state.pill[key] = i; this.changed(); };
        return b;
      }));
      row.append(name, sw); row.dataset.label = label;
      parts.push(row);
    }
    panel.replaceChildren(...parts);
    this.syncControls();
  }

  syncControls() {
    const s = this.state.pill;
    for (const b of document.querySelectorAll('#charCats button')) b.classList.toggle('on', b.dataset.cat === this.cat.id);
    for (const b of document.querySelectorAll('#charPanel .char-opts button')) b.classList.toggle('sel', s[b.dataset.key] === b.dataset.val);
    for (const row of document.querySelectorAll('#charPanel .char-colors')) {
      const box = row.querySelector('.swatches'), key = box.dataset.key, list = key === 'base' ? PILL_BASE_COLORS : PILL_COLORS;
      [...box.children].forEach((b, i) => b.classList.toggle('sel', i === s[key]));
      row.querySelector('.char-label').innerHTML = `${row.dataset.label} <em>${list[s[key]] ? list[s[key]].nome : ''}</em>`;
    }
  }

  // ---------- prévia 3D ----------
  setupPreview() {
    const canvas = $('charPreview');
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.scene = new THREE.Scene();
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x334455, 1.3));
    const key = new THREE.DirectionalLight(0xfff2e6, 2.4); key.position.set(3, 5, 5); this.scene.add(key);
    const rim = new THREE.DirectionalLight(0xbcd2ff, 1.4); rim.position.set(-4, 3, -4); this.scene.add(rim);
    // chão: disco escuro com sombra suave embaixo do boneco
    const shadow = new THREE.Mesh(new THREE.CircleGeometry(0.36, 32), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.22 }));
    shadow.rotation.x = -Math.PI / 2; shadow.position.y = 0.005; this.scene.add(shadow);
    this.camera = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
    this.camPos = new THREE.Vector3(...VIEWS.full.pos); this.camLook = new THREE.Vector3(...VIEWS.full.look);
    this.holder = new THREE.Group(); this.scene.add(this.holder);
    this.spin = 0.5; this.drag = null; this.idle = 0;
    canvas.addEventListener('pointerdown', (e) => { this.drag = e.clientX; this.spinTarget = null; canvas.setPointerCapture(e.pointerId); });
    canvas.addEventListener('pointermove', (e) => { if (this.drag != null) { this.spin += (e.clientX - this.drag) * 0.02; this.drag = e.clientX; } });
    canvas.addEventListener('pointerup', () => { this.drag = null; this.idle = 0; });
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
    // acompanha o tamanho do canvas (layout responsivo)
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
    if (w && h && (w !== this._w || h !== this._h)) {
      this._w = w; this._h = h;
      this.renderer.setSize(w, h, false);
      this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
    }
    // gira sozinho; numa categoria de costas, vira para mostrar o acessório
    if (this.drag == null) {
      if (this.spinTarget != null) {
        const d = Math.atan2(Math.sin(this.spinTarget - this.spin), Math.cos(this.spinTarget - this.spin));
        this.spin += d * Math.min(1, dt * 4);
      } else if ((this.idle += dt) > 1.5) this.spin += dt * 0.45;
    }
    this.holder.rotation.y = this.spin;
    // câmera desliza até o enquadramento da categoria (mais longe em telas estreitas)
    const v = VIEWS[this.cat.view] || VIEWS.full, k = Math.min(1, dt * 5), narrow = this.camera.aspect < 0.7 ? 1.2 : 1;
    this.camPos.lerp(new THREE.Vector3(v.pos[0], v.pos[1], v.pos[2] * narrow), k);
    this.camLook.lerp(new THREE.Vector3(...v.look), k);
    this.camera.position.copy(this.camPos); this.camera.lookAt(this.camLook);
    if (this.pill) animatePill(this.pill, 0, dt, 'walk');
    this.renderer.render(this.scene, this.camera);
  }
}
