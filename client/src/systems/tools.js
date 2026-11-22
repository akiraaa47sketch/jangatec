// Ferramentas que não são armas:
//   • BANJO — clique com ele na mão toca/para uma música pronta (domínio público); [B] ou botão
//     direito abre o painel para tocar NOTA POR NOTA (teclado ou clique). Enquanto alguém toca,
//     os aliados por perto recuperam vida devagar (e o músico um pouco também). As notas vão pela
//     rede: todo mundo ouve, mais baixo quanto mais longe.
//   • GANCHO — clique arremessa o gancho com corda (com gravidade). Pega CAIXOTE BOIANDO e puxa até
//     você; pega um JOGADOR e puxa ele (resgate de quem está nadando ou caído). Clique de novo solta.
// O som é sintetizado (Karplus–Strong: corda dedilhada), sem arquivos de áudio.
import * as THREE from '../three.js';
import { clamp } from '../core/util.js';
import { waveHeight } from '../world/ocean.js';
import { buildWeapon } from '../player/viewmodel-parts.js';
import { keyOf } from '../core/keybinds.js';

export const MUSIC = { healAllies: 1.6, healSelf: 0.5, radius: 12, hearing: 45 };
export const HOOK = { speed: 30, range: 30, pull: 13 };

// ---------- áudio ----------
let ctx = null, master = null;
const buffers = new Map();
function audio() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain(); master.gain.value = 0.55;
    const comp = ctx.createDynamicsCompressor();
    master.connect(comp); comp.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}
const freqOf = (midi) => 440 * Math.pow(2, (midi - 69) / 12);
// Corda dedilhada: ruído filtrado circulando num atraso do tamanho do período (Karplus–Strong).
function pluck(midi) {
  if (buffers.has(midi)) return buffers.get(midi);
  const ac = ctx, sr = ac.sampleRate, f = freqOf(midi), N = Math.max(2, Math.round(sr / f));
  const len = Math.floor(sr * 1.5), buf = ac.createBuffer(1, len, sr), y = buf.getChannelData(0);
  for (let i = 0; i < N; i++) y[i] = (Math.random() * 2 - 1) * (0.7 + 0.3 * Math.sin(i / N * Math.PI * 7)); // palhetada
  const decay = 0.9935 - Math.max(0, midi - 60) * 0.00022; // banjo: som curto e brilhante
  for (let i = N; i < len; i++) y[i] = decay * 0.5 * (y[i - N] + y[i - N + 1 < i ? i - N + 1 : i - N]);
  for (let i = 0; i < 64; i++) y[i] *= i / 64;
  buffers.set(midi, buf);
  return buf;
}
export function playNote(midi, vol = 1) {
  const ac = audio(); if (!ac || vol <= 0.01) return;
  const src = ac.createBufferSource(); src.buffer = pluck(midi);
  const body = ac.createBiquadFilter(); body.type = 'peaking'; body.frequency.value = 2300; body.gain.value = 7; body.Q.value = 1.2; // pele do banjo
  const hp = ac.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 110;
  const g = ac.createGain(); g.gain.value = 0.5 * vol;
  src.connect(body); body.connect(hp); hp.connect(g); g.connect(master);
  src.start();
}

// ---------- teclado do painel (sol maior, duas oitavas; Shift = sustenido) ----------
const NAMES = ['Dó', 'Dó#', 'Ré', 'Ré#', 'Mi', 'Fá', 'Fá#', 'Sol', 'Sol#', 'Lá', 'Lá#', 'Si'];
const noteName = (m) => NAMES[m % 12] + (Math.floor(m / 12) - 1);
const KEYS = [
  ['KeyA', 55], ['KeyS', 57], ['KeyD', 59], ['KeyF', 60], ['KeyG', 62], ['KeyH', 64], ['KeyJ', 66], ['KeyK', 67], ['KeyL', 69], ['Semicolon', 71],
  ['KeyQ', 72], ['KeyW', 74], ['KeyE', 76], ['KeyR', 78], ['KeyT', 79], ['KeyY', 81], ['KeyU', 83], ['KeyI', 84], ['KeyO', 86], ['KeyP', 88],
];
const KEY_LABEL = { Semicolon: 'Ç' };

// ---------- músicas prontas (domínio público) — [nota MIDI, tempos] ----------
const G4 = 67, A4 = 69, B4 = 71, C5 = 72, D5 = 74, E5 = 76, D4 = 62, E4 = 64, F4 = 65, C4 = 60, G3 = 55;
const SONGS = [
  { nome: 'Oh! Susanna', bpm: 168, chord: [G3, 59, D4], notes: [
    [G4, .5], [A4, .5], [B4, 1], [D5, 1], [D5, .75], [E5, .25], [D5, 1], [B4, 1], [G4, .75], [A4, .25], [B4, 1], [B4, 1], [A4, 1], [G4, 1], [A4, 2],
    [G4, .5], [A4, .5], [B4, 1], [D5, 1], [D5, .75], [E5, .25], [D5, 1], [B4, 1], [G4, .75], [A4, .25], [B4, 1], [B4, 1], [A4, 1], [A4, 1], [G4, 3], [0, 1],
    [C5, 2], [C5, 1], [E5, 1.5], [E5, .5], [D5, 1], [D5, 1], [B4, 1], [G4, 1], [A4, 3], [0, 1],
    [G4, .5], [A4, .5], [B4, 1], [D5, 1], [D5, .75], [E5, .25], [D5, 1], [B4, 1], [G4, .75], [A4, .25], [B4, 1], [B4, 1], [A4, 1], [A4, 1], [G4, 3], [0, 2],
  ] },
  { nome: 'Drunken Sailor', bpm: 200, chord: [50, 57, D4], notes: [
    [A4, 1], [A4, .5], [A4, .5], [A4, 1], [A4, .5], [A4, .5], [A4, 1], [D4, 1], [F4, 1], [A4, 1],
    [G4, 1], [G4, .5], [G4, .5], [G4, 1], [G4, .5], [G4, .5], [G4, 1], [C4, 1], [E4, 1], [G4, 1],
    [A4, 1], [A4, .5], [A4, .5], [A4, 1], [A4, .5], [A4, .5], [A4, 1], [B4, 1], [C5, 1], [D5, 1],
    [C5, 1], [A4, 1], [G4, 1], [E4, 1], [D4, 2], [D4, 2],
    [A4, 3], [A4, 1], [D4, 1], [F4, 1], [A4, 2], [G4, 3], [G4, 1], [C4, 1], [E4, 1], [G4, 2],
    [A4, 3], [A4, 1], [B4, 1], [C5, 1], [D5, 2], [C5, 1], [A4, 1], [G4, 1], [E4, 1], [D4, 2], [D4, 2], [0, 2],
  ] },
  { nome: 'Camptown Races', bpm: 180, chord: [G3, 59, D4], notes: [
    [D5, .5], [D5, .5], [B4, .5], [D5, .5], [E5, .5], [D5, .5], [B4, 1], [B4, .5], [A4, 1.5], [B4, .5], [A4, 1.5],
    [D5, .5], [D5, .5], [B4, .5], [D5, .5], [E5, .5], [D5, .5], [B4, 1], [A4, .5], [A4, .5], [B4, .5], [A4, .5], [G4, 2],
    [D5, .5], [D5, .5], [B4, .5], [D5, .5], [E5, .5], [D5, .5], [B4, 1], [B4, .5], [A4, 1.5], [B4, .5], [A4, 1.5],
    [D5, .5], [D5, .5], [B4, .5], [D5, .5], [E5, .5], [D5, .5], [B4, 1], [A4, .5], [A4, .5], [B4, .5], [A4, .5], [G4, 2], [0, 2],
  ] },
];

// sprite de nota musical subindo (visual da música para todos)
let noteTex = null;
function noteTexture() {
  if (noteTex) return noteTex;
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const x = c.getContext('2d');
  x.font = 'bold 52px serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.lineWidth = 5; x.strokeStyle = 'rgba(20,40,30,0.8)'; x.strokeText('♪', 32, 34);
  x.fillStyle = '#9dffb8'; x.fillText('♪', 32, 34);
  return (noteTex = new THREE.CanvasTexture(c));
}

export class Tools {
  constructor(G) {
    this.G = G;
    this.menuOpen = false;
    this.song = null; this.songIdx = 0; this.playT = 0; // playT > 0: tocando (para a cura)
    this.healMsgT = 0; this.sprites = [];
    this.hook = null; this.yank = null;
    this.rope = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]),
      new THREE.LineBasicMaterial({ color: 0xc8b27a }));
    this.rope.frustumCulled = false; this.rope.visible = false; G.scene.add(this.rope);
    const hm = buildWeapon('gancho');
    this.hookMesh = hm ? hm.group : new THREE.Mesh(new THREE.SphereGeometry(0.1), new THREE.MeshStandardMaterial());
    this.hookMesh.scale.setScalar(2.2); this.hookMesh.visible = false; G.scene.add(this.hookMesh);
    this._buildPanel();
  }

  // ---------- painel do banjo ----------
  _buildPanel() {
    const el = document.getElementById('banjoPanel'); if (!el) return;
    this.panel = el;
    const row = (from, to) => KEYS.slice(from, to).map(([code, m]) =>
      `<button type="button" data-note="${m}" data-code="${code}"><kbd>${KEY_LABEL[code] || code.slice(3)}</kbd><span>${noteName(m)}</span></button>`).join('');
    el.querySelector('.frets').innerHTML = `<div class="row hi">${row(10, 20)}</div><div class="row lo">${row(0, 10)}</div>`;
    el.querySelector('.songs').innerHTML = SONGS.map((s, i) => `<button type="button" data-song="${i}">▶ ${s.nome}</button>`).join('') +
      '<button type="button" data-stop="1">■ Parar</button>';
    el.addEventListener('pointerdown', (e) => {
      const b = e.target.closest('button'); if (!b) return;
      e.preventDefault();
      if (b.dataset.note) this.strum(+b.dataset.note + (e.shiftKey ? 1 : 0));
      else if (b.dataset.song) this.startSong(+b.dataset.song);
      else if (b.dataset.stop) this.stopSong();
      else if (b.dataset.close) this.toggleMenu(false);
    });
  }
  toggleMenu(open) {
    if (!this.panel) return;
    this.menuOpen = open;
    this.panel.hidden = !open;
    this.G.input.setCursorMode(open);
  }

  strum(midi, vol = 1, broadcast = true) {
    playNote(midi, vol);
    this.playT = 1.6;
    this.G.player.onStrum();
    if (broadcast) this.G.net.send({ t: 'music', n: midi });
    const G = this.G;
    if (G.player.firstPerson && G.viewmodel && G.viewmodel.springs) G.viewmodel.springs.kickRz.kick(0.25 * (Math.random() < 0.5 ? 1 : -1));
    else G.player.kick = 0.6;
    if (Math.random() < 0.35) this._noteSprite(G.player.mesh);
    const k = this.panel && this.panel.querySelector(`[data-note="${midi}"],[data-note="${midi - 1}"]`);
    if (k) { k.classList.add('on'); setTimeout(() => k.classList.remove('on'), 140); }
  }
  startSong(i) {
    this.songIdx = i % SONGS.length;
    const s = SONGS[this.songIdx];
    this.song = { s, i: 0, t: 0, beat: 60 / s.bpm, chordT: 0 };
    this.G.hud.msg(`♪ Tocando: ${s.nome}`);
  }
  stopSong() { if (this.song) this.G.hud.msg('♪ Música parada'); this.song = null; }
  _updateSong(dt) {
    const sg = this.song; if (!sg) return;
    sg.t -= dt;
    // acompanhamento: "rolo" de banjo no acorde em cada tempo, bem baixinho
    sg.chordT -= dt;
    if (sg.chordT <= 0) { sg.chordT = sg.beat; const c = sg.s.chord; playNote(c[(Math.random() * c.length) | 0] + 12, 0.28); }
    while (sg.t <= 0) {
      if (sg.i >= sg.s.notes.length) { sg.i = 0; } // repete em loop até parar
      const [m, beats] = sg.s.notes[sg.i++];
      if (m) this.strum(m, 0.9);
      else this.playT = Math.max(this.playT, 1);
      sg.t += beats * sg.beat;
    }
  }

  _noteSprite(obj) {
    if (!obj) return;
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: noteTexture(), transparent: true, depthWrite: false }));
    obj.getWorldPosition(sp.position); sp.position.y += 2; sp.position.x += (Math.random() - 0.5) * 0.6;
    sp.scale.setScalar(0.45);
    this.G.scene.add(sp);
    this.sprites.push({ sp, t: 0, dx: (Math.random() - 0.5) * 0.5 });
  }

  // nota vinda de outro jogador: toca mais baixo conforme a distância
  receiveNote(m) {
    const r = this.G.net.remotes.get(m.id); if (!r || !Number.isFinite(m.n)) return;
    const wp = r.mesh.getWorldPosition(new THREE.Vector3());
    const d = wp.distanceTo(this.G.camera.position);
    if (d > MUSIC.hearing) return;
    playNote(clamp(m.n | 0, 40, 96), clamp(1 - d / MUSIC.hearing, 0, 1) ** 1.5);
    if (Math.random() < 0.35) this._noteSprite(r.mesh);
  }

  // ---------- gancho ----------
  _hand(out) {
    const G = this.G, pl = G.player;
    if (pl.firstPerson) {
      const cam = G.camera; cam.getWorldDirection(out);
      const right = new THREE.Vector3().crossVectors(out, cam.up).normalize();
      return out.multiplyScalar(0.6).add(cam.position).addScaledVector(right, 0.25).add(new THREE.Vector3(0, -0.25, 0));
    }
    return pl.weaponMesh.getWorldPosition(out);
  }
  throwHook() {
    const G = this.G, cam = G.camera, dir = new THREE.Vector3();
    cam.getWorldDirection(dir);
    const pos = this._hand(new THREE.Vector3()).addScaledVector(dir, 0.4);
    G.player.onThrow();
    this.hook = { state: 'fly', pos, vel: dir.multiplyScalar(HOOK.speed).add(new THREE.Vector3(0, 2.5, 0)), t: 0, crate: null };
    this.hookMesh.visible = this.rope.visible = true;
    if (G.player.weaponMesh) G.player.weaponMesh.visible = false;
  }
  _endHook() {
    this.hook = null; this.hookMesh.visible = this.rope.visible = false;
    const G = this.G; if (G.player.weaponMesh) G.player.weaponMesh.visible = !G.combat.buildMode && !!G.combat.weapon;
  }
  _updateHook(dt, t) {
    const h = this.hook; if (!h) return;
    const G = this.G, hand = this._hand(new THREE.Vector3()), pp = G.player.body.pos;
    h.t += dt;
    if (h.state === 'fly') {
      const prev = h.pos.clone();
      h.vel.y -= 9.8 * dt; h.pos.addScaledVector(h.vel, dt);
      // caixote boiando?
      const naval = G.naval;
      if (naval) for (const c of naval.crates.values()) {
        if (c.mesh.position.distanceTo(h.pos) < 1.4) { h.state = 'crate'; h.crate = c.id; G.hud.msg('Gancho preso no caixote — puxando!'); break; }
      }
      // jogador?
      if (h.state === 'fly') for (const [id, r] of G.net.remotes) {
        const wp = r.mesh.getWorldPosition(new THREE.Vector3()); wp.y += 0.9;
        if (wp.distanceTo(h.pos) < 1.2) {
          G.net.send({ t: 'yank', id, x: Math.round(pp.x * 10) / 10, y: Math.round(pp.y * 10) / 10, z: Math.round(pp.z * 10) / 10 });
          G.hud.msg(`Puxando ${r.s.n || 'aliado'}!`);
          h.state = 'player'; h.player = id; h.t = 0; break;
        }
      }
      if (h.state === 'fly') {
        const ray = this._ray || (this._ray = new THREE.Raycaster());
        const seg = h.pos.clone().sub(prev), len = seg.length();
        ray.set(prev, seg.normalize()); ray.far = len;
        const hit = len > 0 && ray.intersectObjects(G.solids, false)[0];
        if (hit) { h.pos.copy(hit.point); h.state = 'back'; }
        else if (h.pos.y < waveHeight(h.pos.x, h.pos.z, t)) { h.state = 'back'; if (G.naval) for (let i = 0; i < 8; i++) G.naval.splash.emit(h.pos.x, h.pos.y, h.pos.z, (Math.random() - 0.5) * 2, 3 + Math.random() * 2, (Math.random() - 0.5) * 2, 0.7, 0.4, 12); }
        else if (h.pos.distanceTo(hand) > HOOK.range) h.state = 'back';
      }
    } else if (h.state === 'crate') {
      const c = G.naval && G.naval.crates.get(h.crate);
      if (!c || h.t > 14) h.state = 'back';
      else {
        h.pos.copy(c.mesh.position); h.pos.y += 0.45;
        if (!G.naval.pullCrate(c.id, pp.x, pp.z)) { G.hud.msg(`Caixote ao alcance — [${keyOf('interact')}] para abrir`); h.state = 'back'; }
      }
    } else if (h.state === 'player') {
      const r = G.net.remotes.get(h.player);
      if (!r || h.t > 1.4) h.state = 'back';
      else { r.mesh.getWorldPosition(h.pos); h.pos.y += 0.9; }
    }
    if (h.state === 'back') {
      const d = hand.clone().sub(h.pos), len = d.length();
      if (len < 0.8) { this._endHook(); return; }
      h.pos.addScaledVector(d, Math.min(1, 40 * dt / len));
    }
    this.hookMesh.position.copy(h.pos);
    this.hookMesh.lookAt(hand); // garras (-Z) para longe da corda
    const a = this.rope.geometry.attributes.position;
    a.setXYZ(0, hand.x, hand.y, hand.z); a.setXYZ(1, h.pos.x, h.pos.y, h.pos.z); a.needsUpdate = true;
  }
  // alguém nos fisgou: somos puxados até perto dele
  receiveYank(m) {
    if (m.id !== this.G.net.id || ![m.x, m.y, m.z].every(Number.isFinite)) return;
    const pl = this.G.player;
    if (pl.dead) return;
    this.yank = { x: m.x, y: m.y, z: m.z, t: 1.4 };
    pl.swimming = false; pl.body.vel.y = 6.5; pl.body.grounded = false; pl.body.carrier = null;
    this.G.hud.msg(`${m.by || 'Um aliado'} te puxou com o gancho!`);
  }
  _updateYank(dt) {
    const y = this.yank, pl = this.G.player; if (!y) { pl.yank = null; return; }
    y.t -= dt;
    const p = pl.body.pos, dx = y.x - p.x, dz = y.z - p.z, d = Math.hypot(dx, dz);
    if (y.t <= 0 || d < 2) { this.yank = null; pl.yank = null; return; }
    pl.yank = { vx: dx / d * HOOK.pull, vz: dz / d * HOOK.pull };
    if (p.y < y.y + 0.5) pl.body.vel.y = Math.max(pl.body.vel.y, 3);
  }

  // ---------- uso (clique) ----------
  use(w) {
    if (w.tool === 'banjo') { if (this.song) this.stopSong(); else this.startSong(this.songIdx++); }
    else if (w.tool === 'gancho') { if (this.hook) this.hook.state = 'back'; else this.throwHook(); }
  }

  update(dt, t) {
    const G = this.G, inp = G.input, w = G.combat.weapon;
    if (!G.started) return;
    const banjo = w && w.tool === 'banjo' && !G.player.dead && !G.player.downed;
    if (!banjo) { if (this.menuOpen) this.toggleMenu(false); if (this.song) this.stopSong(); }
    if (banjo && !G.build.active && !G.interact.lootOpen && !(G.naval && G.naval.manning)) {
      if (inp.act('banjoMenu') || (!this.menuOpen && inp.mouse.rightPressed)) this.toggleMenu(!this.menuOpen);
      else if (this.menuOpen && inp.hit('Escape')) this.toggleMenu(false);
      if (this.menuOpen) for (const [code, m] of KEYS) if (inp.hit(code)) this.strum(m + (inp.down('ShiftLeft') || inp.down('ShiftRight') ? 1 : 0));
    }
    this._updateSong(dt);
    this.playT = Math.max(0, this.playT - dt);
    if (w && w.tool !== 'gancho' && this.hook) this._endHook();
    this._updateHook(dt, t);
    this._updateYank(dt);
    // cura pela música: aliados tocando por perto curam você; quem toca se cura um pouco
    const pl = G.player, s = G.survival;
    if (!pl.dead && !pl.downed && s.vida < 100) {
      let rate = this.playT > 0 ? MUSIC.healSelf : 0;
      const pp = pl.body.pos, v = new THREE.Vector3();
      for (const r of G.net.remotes.values()) {
        if (!r.s || !r.s.mu) continue;
        if (r.mesh.getWorldPosition(v).distanceTo(pp) < MUSIC.radius) rate += MUSIC.healAllies;
      }
      if (rate > 0) {
        s.vida = Math.min(100, s.vida + rate * dt);
        this.healMsgT -= dt;
        if (this.healMsgT <= 0 && rate >= MUSIC.healAllies) { this.healMsgT = 12; G.hud.msg('♪ A música do banjo está te curando'); }
      }
    }
    for (const n of this.sprites.slice()) {
      n.t += dt; n.sp.position.y += dt * 0.9; n.sp.position.x += n.dx * dt;
      n.sp.material.opacity = 1 - n.t / 1.6;
      if (n.t > 1.6) { G.scene.remove(n.sp); n.sp.material.dispose(); this.sprites.splice(this.sprites.indexOf(n), 1); }
    }
  }
}
