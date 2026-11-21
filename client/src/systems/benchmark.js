// Modo benchmark: percurso de câmera de ~1 min com os efeitos mais pesados do jogo — mar e
// ondas, tempestade com chuva, onda gigante, furacão, explosões e o mar secando — medindo o
// tempo de cada quadro. No fim mostra FPS médio, 1% mínimo, pior quadro, engasgos e uma nota.
import * as THREE from '../three.js';
import { clock } from '../core/util.js';
import { Explosions } from '../world/explosions.js';
import { TIDE } from './tide.js';

const STAGES = [
  { id: 'mar', nome: 'Oceano e ondas', dur: 9 },
  { id: 'tempestade', nome: 'Tempestade e chuva', dur: 8 },
  { id: 'onda', nome: 'Onda gigante', dur: 9 },
  { id: 'furacao', nome: 'Furacão', dur: 10 },
  { id: 'explosoes', nome: 'Explosões', dur: 9 },
  { id: 'seca', nome: 'Mar secando', dur: 10 },
];
const $ = (id) => document.getElementById(id);
const smooth = (x) => { x = Math.max(0, Math.min(1, x)); return x * x * (3 - 2 * x); };

export class Benchmark {
  constructor(G) {
    this.G = G;
    this.stage = -1; this.stageT = 0; this.total = STAGES.reduce((s, st) => s + st.dur, 0);
    this.elapsed = 0; this.frames = []; this.last = performance.now(); this.done = false;
    this.water = TIDE.full; this.boom = 0;
    this.explosions = new Explosions(G.scene);
    this.setup();
  }

  setup() {
    const G = this.G, st = G.startup;
    G.input.enabled = false;
    G.survival.damage = () => {};                  // ninguém se machuca durante o teste
    st.waterLevel = TIDE.full; G.boat.setSailInstalled(true);
    st._transition('depart'); st.departT = 60;
    G.boat.sailUp = true; G.boat.sailAngle = 0;
    G.player.respawn(); G.player.setFirstPerson(false);
    const tide = st.tide, orig = tide.level.bind(tide);
    tide.departT = 100;
    tide.level = (t, dt, f) => { orig(t, dt, f); return this.water; };
    G.events.timer = 1e9; G.enemies.pirateSpawnTimer = 1e9;
    G.benchStorm = 0;
    this.center = new THREE.Vector3();
    G.player.updateCamera = () => this.camera();
    $('hud').hidden = true;
    $('benchOverlay').hidden = false;
    // algumas balsas piratas ao redor para ter personagens em cena
    for (let i = 0; i < 4; i++) {
      const a = i / 4 * Math.PI * 2 + 0.4;
      const e = G.enemies.spawnPirate(`bench-${i}`, G.boat.x + Math.cos(a) * 30, G.boat.z + Math.sin(a) * 30);
      e.def = { ...e.def, raftSpeed: 0.6 };
    }
    this.next();
  }

  next() {
    const G = this.G, t = clock();
    this.stage++; this.stageT = 0;
    if (this.stage >= STAGES.length) { this.finish(); return; }
    const s = STAGES[this.stage];
    $('benchStage').textContent = `${this.stage + 1}/${STAGES.length} · ${s.nome}`;
    if (G.events.current) G.events._end();
    G.events.timer = 1e9;
    if (s.id === 'onda') {
      const e = G.events._makeTsunami(t);
      e.t0 = t - (e.speed ? (235 - 85) / e.speed : 10); // a 85 m: chega em ~5 s
      G.events.begin(e);
    }
    if (s.id === 'furacao') {
      const e = G.events._makeHurricane(t); e.t0 -= 12; e.lat *= 1.15; G.events.begin(e);
    }
  }

  // Câmera roteirizada por cena (sem input do jogador).
  camera() {
    const G = this.G, cam = G.camera, b = G.boat, s = STAGES[this.stage] || STAGES[STAGES.length - 1];
    const p = Math.min(1, this.stageT / s.dur), c = this.center.set(b.x, b.set.y + 1, b.z);
    let a, r, h, look = c.clone();
    switch (s.id) {
      case 'mar': a = p * 1.8; r = 13; h = 3.2; break;
      case 'tempestade': a = 1.8 + p * 1.2; r = 8; h = 2.2; break;
      case 'onda': {
        const ev = G.events.current;
        const dir = ev && ev.dx !== undefined ? Math.atan2(-ev.dx, -ev.dz) : 0;
        a = dir + Math.PI + 0.5 - p * 0.6; r = 16; h = 4 + p * 3; break;
      }
      case 'furacao': {
        const fun = G.events.visuals && G.events.visuals.funnel.position;
        if (fun) look.lerp(new THREE.Vector3(fun.x, 25, fun.z), 0.55);
        a = (fun ? Math.atan2(c.x - fun.x, c.z - fun.z) : 0) + 0.3 - p * 0.5; r = 22; h = 6; break;
      }
      case 'explosoes': a = p * 2.4 + 3; r = 26; h = 9; break;
      default: a = p * 1.5 + 5; r = 18 + p * 25; h = 5 + p * 22; look.y -= p * 4; break;
    }
    cam.position.set(c.x + Math.sin(a) * r, c.y + h, c.z + Math.cos(a) * r);
    const wy = (G.startup.waterLevel ?? 0) + 0.6;
    if (cam.position.y < wy) cam.position.y = wy;
    cam.fov = 62; cam.updateProjectionMatrix();
    cam.lookAt(look);
  }

  update(dt) {
    if (this.done) return;
    const now = performance.now(), ft = now - this.last; this.last = now;
    const s = STAGES[this.stage];
    this.stageT += ft / 1000; this.elapsed += ft / 1000;
    if (this.elapsed > 1.5) this.frames.push(ft); // ignora o aquecimento (compilação de shaders)
    const G = this.G;
    // efeitos por cena
    G.benchStorm = s.id === 'tempestade' ? smooth(this.stageT / 2) : s.id === 'explosoes' ? 0.25 : 0;
    if (s.id === 'explosoes') {
      this.boom -= ft / 1000;
      if (this.boom <= 0) {
        this.boom = 0.45 + Math.random() * 0.35;
        const a = Math.random() * Math.PI * 2, d = 8 + Math.random() * 16;
        this.explosions.spawn(new THREE.Vector3(G.boat.x + Math.cos(a) * d, G.startup.waterLevel + 0.3, G.boat.z + Math.sin(a) * d), 0.8 + Math.random() * 0.8);
      }
    }
    if (s.id === 'seca') this.water = TIDE.full + (TIDE.dry - TIDE.full) * smooth((this.stageT - 1) / 6);
    this.explosions.update(ft / 1000);
    $('benchFill').style.width = `${Math.min(100, (this.elapsed / this.total) * 100)}%`;
    const f = G.gfx.fps;
    $('benchFps').innerHTML = `<b>${f.value}</b> FPS <small>${f.ms.toFixed(1)} ms</small>`;
    if (this.stageT >= s.dur) this.next();
  }

  finish() {
    this.done = true;
    const fr = this.frames.slice().sort((a, b) => b - a), n = fr.length || 1;
    const totalMs = this.frames.reduce((s, v) => s + v, 0) || 1;
    const avg = (n * 1000) / totalMs;
    const worst1 = fr.slice(0, Math.max(1, Math.floor(n * 0.01)));
    const low1 = 1000 / (worst1.reduce((s, v) => s + v, 0) / worst1.length);
    const worst = fr[0] || 0, stutters = this.frames.filter((v) => v > 50).length;
    const grade = avg >= 58 && low1 >= 45 ? ['Excelente', 'Liso como o mar calmo.', 'good']
      : avg >= 45 && low1 >= 30 ? ['Suave', 'Roda bem; poucas quedas.', 'good']
        : avg >= 30 ? ['Jogável', 'Dá para jogar, mas com quedas nas cenas pesadas.', 'ok']
          : ['Pesado', 'Os efeitos estão acima do que este aparelho aguenta.', 'bad'];
    const gfx = this.G.gfx.settings;
    let tip = '';
    if (grade[2] !== 'good') tip = gfx.scale > 0.7
      ? 'Dica: abra as opções gráficas e baixe a escala de renderização para 70% com FSR — costuma dar +40% de FPS.'
      : 'Dica: use a predefinição Baixo ou desligue sombras e brilho (bloom).';
    else if (gfx.preset !== 'ultra') tip = 'Sobrou desempenho: experimente a predefinição Ultra.';
    $('benchOverlay').hidden = true;
    $('benchResults').hidden = false;
    $('benchResults').innerHTML = `
      <h2>Resultado do benchmark</h2>
      <div class="bench-grade ${grade[2]}">${grade[0]}</div><p>${grade[1]}</p>
      <div class="bench-grid">
        <div><b>${avg.toFixed(0)}</b><span>FPS médio</span></div>
        <div><b>${low1.toFixed(0)}</b><span>1% mínimo</span></div>
        <div><b>${worst.toFixed(0)} ms</b><span>pior quadro</span></div>
        <div><b>${stutters}</b><span>engasgos (&gt;50 ms)</span></div>
      </div>
      <p class="bench-cfg">Gráficos: ${gfx.preset} · escala ${Math.round(gfx.scale * 100)}% · ${gfx.upscaler === 'fsr' ? 'FSR' : 'bilinear'} ·
        sombras ${gfx.shadows} · MSAA ${gfx.msaa || 'off'} · ${this.G.gfx.outSize.x}×${this.G.gfx.outSize.y}</p>
      ${tip ? `<p class="bench-tip">${tip}</p>` : ''}
      <button id="benchAgain" type="button">Rodar de novo</button>
      <button id="benchBack" type="button" class="alt">Voltar ao menu</button>`;
    $('benchAgain').onclick = () => { try { sessionStorage.setItem('mare-alta-bench', '1'); } catch { /* ok */ } location.reload(); };
    $('benchBack').onclick = () => location.reload();
  }
}
