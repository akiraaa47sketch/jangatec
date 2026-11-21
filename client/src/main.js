// Ponto de entrada: monta a cena, cria os sistemas e roda o loop principal.
// G é o contexto compartilhado entre os módulos (cada sistema fica no seu arquivo).
import * as THREE from './three.js';
import { DEFAULT_SERVER } from './config.js';
import { Input } from './core/input.js';
import { Colliders } from './world/colliders.js';
import { Ocean, sea } from './world/ocean.js';
import { Atmosphere } from './world/atmosphere.js';
import { SunVisual } from './world/sun.js';
import { World } from './world/world.js';
import { Physics } from './world/physics.js';
import { Boat } from './boat/boat.js';
import { Player } from './player/player.js';
import { ViewModel } from './player/viewmodel.js';
import { Build } from './build/build.js';
import { Survival } from './systems/survival.js';
import { Startup } from './systems/startup.js';
import { Combat } from './systems/combat.js';
import { Enemies } from './systems/enemies.js';
import { Interact } from './systems/interact.js';
import { Events } from './systems/events.js';
import { Net } from './net/net.js';
import { Hud } from './ui/hud.js';
import { CharacterMenu } from './ui/character.js';
import { TouchControls, isTouchDevice } from './ui/touch.js';
import { Graphics } from './core/graphics.js';
import { GfxMenu } from './ui/gfxmenu.js';
import { Benchmark } from './systems/benchmark.js';

const $ = (id) => document.getElementById(id);
const canvas = $('c');

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
const MOBILE = isTouchDevice();
renderer.setPixelRatio(Math.min(devicePixelRatio, MOBILE ? 1.25 : 2)); // celular: menos pixels, mais FPS
renderer.toneMapping = THREE.NeutralToneMapping; // realces suaves, cores preservadas
renderer.toneMappingExposure = 1.0;
const scene = new THREE.Scene();
const SKY = 0xbfe5ff;
scene.background = new THREE.Color(SKY);
scene.fog = new THREE.Fog(SKY, 90, 260);
const camera = new THREE.PerspectiveCamera(68, 1, 0.1, 600);
const hemisphere = new THREE.HemisphereLight(0xffffff, 0x3a6a8a, 1.15);
scene.add(hemisphere);
const sun = new THREE.DirectionalLight(0xfff1d0, 1.7);
sun.position.set(80, 95, -170); // ~27° de elevação: sombras legíveis, luz de fim de tarde
scene.add(sun);
const sunVisual = new SunVisual(scene, sun.position.clone().sub(sun.target.position));

function resize() {
  renderer.setSize(innerWidth, innerHeight, false);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  if (window.G && window.G.gfx) window.G.gfx.resize();
}
addEventListener('resize', resize);
resize();

const G = { scene, camera, renderer, solids: [], started: false };
G.sunVisual = sunVisual;
G.input = new Input(canvas);
G.colliders = new Colliders();
G.hud = new Hud(G);
G.net = new Net(G);
G.survival = new Survival(G);
G.combat = new Combat(G);
G.enemies = new Enemies(G);
G.events = new Events(G);
G.physics = new Physics(G);
G.world = new World(G, 1);
G.colliders.groundFn = (x, z) => { // fundo do mar só vira chão com pouca água por cima
  const gh = G.world.seabedHeight(x, z);
  return sea.level > gh + 1.2 ? -Infinity : gh;
};
G.boat = new Boat(G);
G.player = new Player(G);
G.viewmodel = new ViewModel(G, { sun, hemisphere }); // braços/arma em 1ª pessoa (só o jogador local vê)
G.startup = new Startup(G, { sun, hemisphere });
G.build = new Build(G);     // Sistema unificado de posicionamento físico
G.interact = new Interact(G);
const atmo = new Atmosphere(renderer, scene, { sun, hemisphere }); // céu, IBL e sombras
const ocean = new Ocean(scene, atmo);
ocean.islandSource = () => G.world.islands;
G.atmosphere = atmo;
G.ocean = ocean;
G.viewmodel.scene.environment = scene.environment; // metais da 1ª pessoa também refletem o céu
G.viewmodel.scene.environmentIntensity = scene.environmentIntensity;
window.G = G; // útil para depurar no console
G.gfx = new Graphics(G, { renderer, scene, camera, sun, mobile: MOBILE }); // pipeline + opções gráficas
G.gfxMenu = new GfxMenu(G);
if (MOBILE) G.touch = new TouchControls(G);

canvas.addEventListener('mousedown', (e) => {
  if (!G.build.active) {
    if (e.button === 0) {
      const target = G.build.updatePickupTarget();
      if (target && G.build.tryPickup(target)) {
        e.preventDefault();
        G.input.mouse.left = G.input.mouse.leftPressed = false;
      }
    }
    return;
  }
  e.preventDefault();
  if (e.button === 0) {
    if (G.build.rotating) {
      if (G.build.cameraDragging) {
        G.input.mouse.left = G.input.mouse.leftPressed = false;
        return;
      }
      G.build.beginGizmoDrag();
      return;
    }
    G.input.mouse.left = G.input.mouse.leftPressed = false;
  } else if (e.button === 2) {
    if (G.build.rotating) {
      G.build.beginCameraDrag();
      return;
    }
    G.build.cancel();
    G.input.mouse.right = G.input.mouse.rightPressed = false;
  }
});
addEventListener('mouseup', (e) => {
  if (e.button === 2) G.build.endCameraDrag();
});
addEventListener('keydown', (e) => {
  if (e.code === 'KeyR' && !e.repeat && G.input.enabled && G.build.active) {
    e.preventDefault();
    G.build.toggleRotationMode();
    return;
  }
  if (e.code === 'KeyQ' && G.input.enabled && G.build.active) {
    e.preventDefault();
    G.build.place();
    return;
  }
  if (e.code === 'Escape' && G.input.enabled && G.build.active) {
    G.build.cancel();
    e.preventDefault();
    return;
  }
  if (e.code === 'Escape' && G.input.enabled && G.interact.lootOpen) {
    G.interact.closeCrate();
    e.preventDefault();
  }
});

// ---------- Menu ----------
$('server').value = DEFAULT_SERVER;
const status = (s) => { $('menuStatus').textContent = s; };
const charMenu = new CharacterMenu((appearance) => G.player.setAppearance(appearance));
window.__charMenu = charMenu; // depuração
const characterAppearance = () => charMenu.appearance;
G.player.setAppearance(characterAppearance());


function start(seed, welcome) {
  G.player.setAppearance(characterAppearance());
  if (G.world && G.world.farSeabed) scene.remove(G.world.farSeabed); // o mundo do menu sai de cena
  G.world = new World(G, seed);
  if (welcome) {
    for (const placed of welcome.placed || []) G.world.placedStates.set(placed.id, placed);
    for (const welded of welcome.welded || []) G.world.weldedStates.set(welded.physObjId, welded);
    for (const crate of welcome.crates || []) G.world.crateStates.set(crate.id, crate);
    for (const id of welcome.removed || []) G.boat.removePiece(id);
    for (const p of welcome.added || []) G.boat.addPiece(p);
    for (const id of welcome.collected || []) G.world.collected.add(id);
    if (welcome.event) G.events.receive(welcome.event);
    if (welcome.boat) { const b = welcome.boat; Object.assign(G.boat, { x: b.x, z: b.z, yaw: b.yaw, speed: b.speed, sailUp: b.up, sailAngle: b.angle }); }
  }
  G.world.ensureStarterIsland();
  G.world.update(0, now());
  const starterIsland = G.world.chunks.get('0,1').island;
  G.startup.begin(starterIsland, welcome && welcome.start);
  G.boat.update(0, now());
  G.player.respawn();
  const dx = G.boat.x - G.player.body.pos.x;
  const dz = G.boat.z - G.player.body.pos.z;
  G.player.camYaw = Math.atan2(-dx, -dz);
  G.player.yaw = Math.atan2(dx, dz);
  G.player.camPitch = 0.08;
  G.player.syncMesh(0, 0);
  G.player.updateCamera(0, now());
  G.combat.startWithRandomImprovisedWeapon();
  G.combat.setBuildMode(false);
  G.started = true;
  G.input.enabled = true;
  $('menu').hidden = true;
  G.hud.show();
  G.hud.msg(`${G.combat.weapon.nome} ${'★'.repeat(G.combat.weapon.stars)} equipada · complete a jangada e procure as caixas`);
  G.input.requestLock();
}
$('btnSolo').onclick = () => {
  const s = parseInt($('seed').value, 10);
  start(Number.isFinite(s) ? s : Math.floor(Math.random() * 1e9));
};
$('btnMulti').onclick = () => {
  status('Conectando… (o Render grátis pode levar até 1 min para acordar)');
  G.net.connect($('server').value.trim(), $('name').value.trim() || 'Náufrago', $('room').value.trim() || 'publica')
    .then((m) => start(m.seed, m))
    .catch((e) => status(`${e.message}. Confira o endereço do servidor ou jogue solo.`));
};
$('help').onclick = () => { $('help').hidden = true; };
// Benchmark: mundo fixo (seed 4242), câmera roteirizada e relatório de FPS no fim.
const startBenchmark = () => { start(4242); G.bench = new Benchmark(G); };
$('btnBench').onclick = startBenchmark;
try { if (sessionStorage.getItem('mare-alta-bench')) { sessionStorage.removeItem('mare-alta-bench'); setTimeout(startBenchmark, 600); } } catch { /* ok */ }

// ---------- Loop ----------
let last = performance.now();
const now = () => (Date.now() / 1000) % 100000; // relógio comum: ondas parecidas entre clientes

function hotkeys() {
  const inp = G.input;
  if (inp.hit('KeyH')) $('help').hidden = !$('help').hidden;
  if (inp.hit('KeyF')) G.player.setFirstPerson(!G.player.firstPerson);
  if (G.build.active || G.interact.lootOpen || G.gfxMenu.open) return;
  for (let i = 0; i < 3; i++) if (inp.hit('Digit' + (i + 1))) G.combat.select(i);
  if (inp.mouse.wheel) G.combat.cycle(Math.sign(inp.mouse.wheel));
  if (inp.hit('Digit4')) G.survival.use('bandagem');
  if (inp.hit('Digit5')) G.survival.use('kit');
}

function frame() {
  requestAnimationFrame(frame);
  const ms = performance.now(), dt = Math.min((ms - last) / 1000, 1 / 30), t = now();
  last = ms;
  const { boat, player } = G;
  if (G.started) G.startup.update(dt, t);
  boat.update(dt, t);
  if (!G.started) {
    // Fundo do menu: câmera orbitando a jangada.
    const a = t * 0.1;
    camera.position.set(Math.sin(a) * 13, 5, Math.cos(a) * 13);
    camera.lookAt(0, 1.5, 0);
    atmo.update(dt, camera);
    ocean.update(t, 0, 0);
    sunVisual.update(camera, t, true);
    G.gfx.render(dt);
    charMenu.update(dt, true);
    G.gfxMenu.update();
    return;
  }
  // Quem está a bordo (mesmo no ar) acompanha o barco antes de se mover.
  if (player.body.carrier === boat.set && !player.mantle) {
    const dyaw = boat.carry(player.body);
    player.yaw += dyaw; player.camYaw += dyaw;
  }
  hotkeys();
  player.update(dt, t);
  G.viewmodel.update(dt, t);
  player.updateCamera(dt, t);
  G.events.applyShake(camera, dt);
  G.build.update();
  G.world.update(dt, t);
  G.world.updateFloodLevel(G.startup.waterLevel);
  G.physics.update(dt, t);
  G.enemies.update(dt);
  G.events.update(dt, t);
  if (G.bench) G.bench.update(dt);
  G.interact.update(dt);
  G.combat.update(dt);
  G.survival.update(dt);
  G.net.update(dt);
  atmo.update(dt, camera);
  ocean.update(t, camera.position.x, camera.position.z);
  G.hud.update(dt);
  if (G.touch) G.touch.update();
  sunVisual.update(camera, t);
  G.gfx.render(dt);
  G.gfxMenu.update();
  G.viewmodel.render(renderer); // 2º passe: braços e arma por cima do mundo
  G.input.endFrame();
}
frame();
