// Ponto de entrada: monta a cena, cria os sistemas e roda o loop principal.
// G é o contexto compartilhado entre os módulos (cada sistema fica no seu arquivo).
import * as THREE from './three.js';
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
import { KeysMenu } from './ui/keysmenu.js';
import { Benchmark } from './systems/benchmark.js';
import { Melee } from './systems/melee.js';
import { Voice } from './net/voice.js';
import { MainMenu } from './ui/mainmenu.js';
import { preloadGun, preloadHand, buildRealHand } from './player/gunmodels.js';
import { upgradeWaitingPills } from './player/pillhands.js';
import { Naval } from './systems/naval.js';
import { Tools } from './systems/tools.js';
import { Siege } from './systems/siege.js';
import { Drops } from './systems/drops.js';
import { EnemyNet } from './systems/enemynet.js';
import { Bosses } from './systems/bosses.js';
import { BossSkills } from './systems/bossskills.js';
import { SeaEvents } from './systems/seaevents.js';
import { VFX } from './core/vfx.js';
import { Zones } from './systems/zones.js';
import { Sos } from './systems/sos.js';
import { Endgame } from './systems/endgame.js';
import { Inventory } from './ui/inventory.js';
import { clock } from './core/util.js';
import { Intro } from './systems/intro.js';
import { Reflections } from './core/reflections.js';
import { ExtraEvents } from './systems/extraevents.js';
import { ZoneTitle } from './ui/zonetitle.js';

const $ = (id) => document.getElementById(id);
const canvas = $('c');

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
const MOBILE = isTouchDevice();
renderer.setPixelRatio(Math.min(devicePixelRatio, MOBILE ? 1.25 : 2)); // celular: menos pixels, mais FPS
renderer.toneMapping = THREE.NeutralToneMapping; // realces suaves, cores preservadas
// Sem checagem de erro de shader: ela obriga a esperar cada compilação terminar (engasgo). Os shaders do
// jogo já são testados; em desenvolvimento dá para religar com ?shaderdebug na URL.
renderer.debug.checkShaderErrors = /[?&]shaderdebug/.test(location.search);
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
G.voice = new Voice(G); // chat de voz (WebRTC, proximidade 3D)
G.survival = new Survival(G);
G.combat = new Combat(G);
G.enemies = new Enemies(G);
G.events = new Events(G);
G.melee = new Melee(G); // corpo a corpo: combos, pesado, bloqueio, parry, esquiva
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
G.naval = new Naval(G);     // canhões, navios piratas e dano por peça
G.siege = new Siege(G);   // torres de sucata (derrubar com canhão) e morteiros
G.tools = new Tools(G);     // banjo (música que cura) e gancho
G.drops = new Drops(G);     // itens largados no mundo
G.bossSkills = new BossSkills(G); // habilidades especiais dos chefes
G.vfx = new VFX(scene); // faíscas, lascas, poeira, anéis de choque e clarões
G.zones = new Zones(G); // zona pirata / militar / Zona 51 (aviso, HUD e tom do céu)
G.bosses = new Bosses(G);   // chefe da seca (escafandrista)
G.enemyNet = new EnemyNet(G); // inimigos sincronizados (host simula, os outros veem réplicas)
G.seaEvents = new SeaEvents(G); // kraken, tubarões, peixes voadores e raios
G.sos = new Sos(G); // plataforma de petróleo do SOS (fim da jornada)
G.endgame = new Endgame(G); // coordenadas do abrigo, navegação 360° e os Twins
G.inventory = new Inventory(G); // tela de inventário (Tab)
G.extra = new ExtraEvents(G); // neblina, águas-vivas, acampamento, galeão, desembarque, tempestade de areia
G.zoneTitle = new ZoneTitle(G); // nome da zona ao entrar numa zona nova
const atmo = new Atmosphere(renderer, scene, { sun, hemisphere }); // céu, IBL e sombras
const ocean = new Ocean(scene, atmo);
ocean.islandSource = () => G.world.islands.filter((i) => !i.seaSite); // estruturas do mar não têm água rasa
G.atmosphere = atmo;
G.ocean = ocean;
G.viewmodel.scene.environment = scene.environment; // metais da 1ª pessoa também refletem o céu
G.viewmodel.scene.environmentIntensity = scene.environmentIntensity;
window.G = G; // útil para depurar no console
G.gfx = new Graphics(G, { renderer, scene, camera, sun, mobile: MOBILE }); // pipeline + opções gráficas
G.gfxMenu = new GfxMenu(G);
G.reflections = new Reflections(G); // reflexos (metais, jangada molhada na chuva) — menu Gráficos
G.keysMenu = new KeysMenu(G);
if (MOBILE) G.touch = new TouchControls(G);

canvas.addEventListener('mousedown', (e) => {
  if (!G.build.active) {
    if (e.button === 0 && !G.naval.manning) {
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
const charMenu = new CharacterMenu((appearance) => G.player.setAppearance(appearance));
window.__charMenu = charMenu; // depuração
const characterAppearance = () => charMenu.appearance;
G.player.setAppearance(characterAppearance());


function start(seed, welcome, opts = {}) {
  G.player.setAppearance(characterAppearance());
  if (G.world && G.world.farSeabed) scene.remove(G.world.farSeabed); // o mundo do menu sai de cena
  G.world = new World(G, seed);
  G.drops.clear();
  for (const e of [...G.enemies.list]) G.enemies.remove(e); // inimigos do mundo do menu não entram na partida
  G.seaEvents.end();
  if (G.extra) G.extra.end();
  if (welcome) {
    for (const d of welcome.drops || []) G.drops.spawn(d);
    G.world.pendingProps = welcome.props || [];
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
  for (const pr of G.world.pendingProps || []) G.world.spawnProp(pr.k, pr.p[0], pr.p[1], pr.p[2], pr.id, false); // torretas que já existiam na sala
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
  G.zoneTitle.current = null;
  $('menu').hidden = true;
  if (G.cutscene) G.cutscene.finish();
  const play = () => {
    G.input.enabled = true;
    G.hud.show();
    G.hud.msg(`${G.combat.weapon.nome} ${'★'.repeat(G.combat.weapon.stars)} equipada · complete a jangada e procure as caixas`);
  };
  // Cutscene de abertura (helicóptero → raio → queda → acordar na ilha) só no começo da partida.
  if (opts.intro && G.startup.phase === 'build' && starterIsland) {
    G.input.enabled = false;
    G.cutscene = new Intro(G, starterIsland, () => { G.cutscene = null; play(); });
  } else play();
  G.input.requestLock();
}
// Benchmark: mundo fixo (seed 4242), câmera roteirizada e relatório de FPS no fim.
const startBenchmark = () => { start(4242); G.bench = new Benchmark(G); };
// mãos 3D realistas da 1ª pessoa (com esqueleto): trocam as luvas quando carregam
preloadHand('./models/mao.glb').then((ok) => { if (ok) G.viewmodel.upgradeHands(buildRealHand); });
preloadHand('./models/mao_3p.glb', '3p').then((ok) => { if (ok) upgradeWaitingPills(); }); // mãos das pílulas (3ª pessoa)
// modelo 3D da pistola: carrega em segundo plano e troca o procedural quando ficar pronto
for (const [id, url] of [['pistola', './models/pistola.glb'], ['revolver', './models/revolver.glb'], ['sniper', './models/sniper.glb'], ['martelo', './models/martelo.glb']]) {
  preloadGun(id, url).then((ok) => {
    const wid = id === 'sniper' ? 'rifle_precisao' : id;
    if (ok) G.viewmodel.specs.delete(wid);
    if (ok && G.started && G.combat.weaponId === wid) { G.combat.equip(wid); if (G.viewmodel.shownId === wid) G.viewmodel.showWeapon(wid); }
  });
}
G.mainMenu = new MainMenu(G, { solo: (seed) => start(seed, null, { intro: true }), multi: (welcome) => start(welcome.seed, welcome, { intro: true }), bench: startBenchmark });
$('help').onclick = () => { $('help').hidden = true; };
try { if (sessionStorage.getItem('mare-alta-bench')) { sessionStorage.removeItem('mare-alta-bench'); setTimeout(startBenchmark, 600); } } catch { /* ok */ }

// ---------- Loop ----------
let last = performance.now();
const now = clock; // relógio comum (acertado pelo servidor quando online): ondas iguais entre clientes

function hotkeys() {
  const inp = G.input;
  if (!G.tools.menuOpen) { // com o painel do banjo aberto as letras viram notas
    if (inp.act('help')) $('help').hidden = !$('help').hidden;
    if (inp.act('camera')) G.player.setFirstPerson(!G.player.firstPerson);
  }
  if (inp.act('lockCam') && !G.build.active && !G.interact.lootOpen) {
    G.player.faceCam = !G.player.faceCam;
    G.hud.msg(G.player.faceCam ? 'Corpo travado na direção da câmera' : 'Corpo livre (vira para onde anda)');
  }
  if (G.build.active || G.interact.lootOpen || G.gfxMenu.open || G.keysMenu.open || G.naval.manning || G.tools.menuOpen) return;
  for (let i = 0; i < 6; i++) if (inp.act('slot' + (i + 1))) G.combat.select(i);
  if (inp.mouse.wheel) G.combat.cycle(Math.sign(inp.mouse.wheel));
  if (inp.act('bandage')) G.survival.use('bandagem');
  if (inp.act('medkit')) G.survival.use('kit');
  if (inp.act('food1')) G.survival.use('barra_proteina');
  if (inp.act('food2')) G.survival.use('energetico');
  if (inp.act('food3')) G.survival.use('chocolate');
  if (inp.act('food4')) G.survival.use('peixe');
}

function frame() {
  requestAnimationFrame(frame);
  const ms = performance.now(), t = now();
  let dt = Math.min((ms - last) / 1000, 1 / 30);
  // hit-stop: o mundo quase congela por um instante quando um golpe conecta
  if (G.hitStop > 0) { G.hitStop -= dt; dt *= 0.08; }
  last = ms;
  const { boat, player } = G;
  if (G.started) { G.startup.update(dt, t); G.zones.update(dt); }
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
  const cut = G.cutscene; // durante a cutscene o jogador fica parado e a câmera é dela
  if (!cut) {
    G.inventory.update();
    hotkeys();
    player.update(dt, t);
    G.viewmodel.update(dt, t);
    player.updateCamera(dt, t);
    G.events.applyShake(camera, dt);
    G.build.update();
  }
  G.world.update(dt, t);
  G.world.updateFloodLevel(G.startup.waterLevel);
  G.physics.update(dt, t);
  G.enemies.update(dt);
  G.bosses.update(dt, t);
  G.bossSkills.update(dt);
  G.events.update(dt, t);
  G.naval.update(dt, t);
  G.siege.update(dt, t);
  G.tools.update(dt, t);
  G.drops.update(dt);
  G.vfx.update(dt);
  G.seaEvents.tick(dt, t);
  G.sos.update(dt, t);
  G.endgame.update(dt, t);
  if (G.bench) G.bench.update(dt);
  if (!cut) {
    G.interact.update(dt);
    G.combat.update(dt);
    G.melee.update(dt);
    G.survival.update(dt);
  }
  G.net.update(dt);
  G.enemyNet.update(dt);
  G.voice.update(dt);
  if (cut) cut.update(dt, t);
  atmo.update(dt, camera);
  ocean.update(t, camera.position.x, camera.position.z);
  G.hud.update(dt);
  G.zoneTitle.update(dt);
  if (G.touch && !cut) G.touch.update();
  sunVisual.update(camera, t);
  G.reflections.update(dt); // jangada molhada/secando + câmera de reflexo
  G.gfx.render(dt);
  G.gfxMenu.update();
  if (!cut) G.viewmodel.render(renderer); // 2º passe: braços e arma por cima do mundo
  G.input.endFrame();
}
frame();
