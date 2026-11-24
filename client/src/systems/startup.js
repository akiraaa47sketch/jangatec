import * as THREE from '../three.js';
import { clamp, mulberry32, clock } from '../core/util.js';
import { sea } from '../world/ocean.js';
const GHOST_FOG = new THREE.Color(0x6f9a8e);
import { Tide } from './tide.js';

const PHASES = new Set(['build', 'install', 'calm', 'storm', 'flood', 'board', 'depart']);
const CALM_DURATION = 7;
const STORM_DURATION = 13;
const FLOOD_DURATION = 34;
const FLOOD_LEVEL = 0.9;
const CLOCK_WRAP = 100000;
// Marulho: de vez em quando (~45% das janelas de 40 s) as ondas crescem e baixam de novo em ~20 s.
// Deriva só do relógio comum: todos os jogadores veem as mesmas ondas.
export const SWELL = { slot: 35, chance: 0.62, A: [0.7, 1.6] }; // mar ensolarado mais vivo: ondulação maior e mais frequente
export function swellAt(t) {
  const k = Math.floor(t / SWELL.slot), u = t / SWELL.slot - k, h = mulberry32(k * 7919 + 13)();
  if (h > SWELL.chance) return 0;
  const A = SWELL.A[0] + (SWELL.A[1] - SWELL.A[0]) * (h / SWELL.chance);
  return A * Math.sin(Math.PI * u) ** 2;
}
const clockNow = clock; // o mesmo relógio comum de main.js

export class Startup {
  constructor(G, { sun, hemisphere }) {
    this.G = G;
    this.sun = sun;
    this.hemisphere = hemisphere;
    this.phase = 'build';
    this.elapsed = 0;
    this.waterLevel = 0;
    this.anchor = null;
    this.island = null;
    this.syncTimer = 0;
    this.floodTier = null;
    this.departT = 0;
    this.departAt = null; // relógio comum no momento da partida (a maré conta a partir dele)
    this.tide = new Tide(G);
    this.clearSky = new THREE.Color(0x9fd3ee);
    this.stormSky = new THREE.Color(0x536273);
    this.clearSun = new THREE.Color(0xfff1d0);
    this.stormSun = new THREE.Color(0x8795a3);
    this.clouds = this._makeClouds();
    this.rain = this._makeRain();
  }

  get departed() { return this.phase === 'depart'; }

  // segundos desde a partida no relógio comum (que dá a volta em 100000 s)
  sinceDepart(t) {
    if (this.departAt === null) return 0;
    return (((t - this.departAt) % CLOCK_WRAP) + CLOCK_WRAP) % CLOCK_WRAP;
  }

  _makeClouds() {
    const material = new THREE.MeshStandardMaterial({
      color: 0x87919b, roughness: 1, transparent: true, opacity: 0, depthWrite: false,
    });
    const geometry = new THREE.SphereGeometry(1, 8, 6);
    const clouds = [];
    for (let i = 0; i < 9; i++) {
      const group = new THREE.Group();
      for (let j = 0; j < 4; j++) {
        const puff = new THREE.Mesh(geometry, material);
        puff.position.set((j - 1.5) * 2.1, Math.sin(j * 2.3) * 0.35, Math.cos(j) * 0.55);
        puff.scale.set(2.4 + (j % 2), 1.1 + (j % 3) * 0.2, 1.8);
        group.add(puff);
      }
      this.G.scene.add(group);
      clouds.push(group);
    }
    return clouds;
  }

  _makeRain() {
    const count = 420, positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 36;
      positions[i * 3 + 1] = Math.random() * 22;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 36;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const material = new THREE.PointsMaterial({
      color: 0xc3d3de, size: 0.075, transparent: true, opacity: 0, depthWrite: false,
    });
    const rain = new THREE.Points(geometry, material);
    rain.visible = false;
    this.G.scene.add(rain);
    return rain;
  }

  begin(island, savedState = null) {
    this.island = island || null;
    this.anchor = savedState && Array.isArray(savedState.anchor)
      ? { x: savedState.anchor[0], z: savedState.anchor[1] }
      : island ? { x: island.x, z: island.z } : { x: 0, z: 0 };
    this.netWater = null;
    if (savedState) this.applyState(savedState);
    else {
      this.phase = 'build';
      this.elapsed = 0;
      this.waterLevel = 0;
      this.G.boat.setSailInstalled(false);
    }
    if (!this.departed) {
      this.G.boat.x = this.anchor.x;
      this.G.boat.z = this.anchor.z;
      this.G.boat.yaw = 0;
      this.G.boat.speed = 0;
    }
    sea.level = this.waterLevel;
    this.G.world.updateFloodLevel(this.waterLevel);
    this._updateWeather(0, 0);
  }

  _transition(phase, message) {
    if (this.phase === phase) return;
    this.phase = phase;
    this.elapsed = 0;
    if (phase === 'depart') this.departAt = clockNow();
    if (message) this.G.hud.msg(message);
  }

  requestSailInstall() {
    const net = this.G.net;
    if (net.online && !net.isHost) {
      net.send({ t: 'sail-install' });
      return true;
    }
    return this.installSail();
  }

  installSail() {
    if (this.phase !== 'install' || !this.G.boat.isComplete) return false;
    this.G.boat.setSailInstalled(true);
    this._transition('calm', 'Vela instalada no mastro. Aproveitem a calmaria para se preparar.');
    this._sync(true);
    return true;
  }

  applyState(state) {
    if (!state || !PHASES.has(state.phase)) return;
    this.phase = state.phase;
    this.elapsed = Number.isFinite(state.elapsed) ? Math.max(0, state.elapsed) : 0;
    if (Number.isFinite(state.departAt)) this.departAt = state.departAt;
    // Depois da partida cada cliente calcula a maré pelo relógio comum: o nível do host não vale.
    // Antes disso o nível do host vira um ALVO (netWater) que a água persegue suavemente; aplicar
    // direto fazia a água pular a cada pacote (e de uma vez quando um pacote atrasava).
    if (state.phase !== 'depart') {
      const lvl = Number.isFinite(state.waterLevel) ? clamp(state.waterLevel, 0, FLOOD_LEVEL) : 0;
      this.netWater = lvl;
      if (!this.G.started || Math.abs(lvl - this.waterLevel) > 0.35) this.waterLevel = lvl; // entrada na sala: encaixa
    }
    if (Array.isArray(state.anchor) && state.anchor.length === 2 &&
        state.anchor.every(Number.isFinite)) {
      this.anchor = { x: state.anchor[0], z: state.anchor[1] };
    }
    this.G.boat.setSailInstalled(!!state.sailInstalled);
    this.G.boat.sailUp = !!state.sailUp && this.G.boat.sailInstalled;
    if (!this.departed && this.anchor) {
      this.G.boat.x = this.anchor.x;
      this.G.boat.z = this.anchor.z;
      this.G.boat.speed = 0;
    }
    sea.level = this.waterLevel;
    this.G.world.updateFloodLevel(this.waterLevel);
  }

  snapshot() {
    return {
      phase: this.phase,
      elapsed: this.elapsed,
      waterLevel: this.waterLevel,
      departAt: this.departAt,
      sailInstalled: this.G.boat.sailInstalled,
      sailUp: this.G.boat.sailUp,
      anchor: this.anchor ? [this.anchor.x, this.anchor.z] : [0, 0],
    };
  }

  _sync(force = false) {
    if (!this.G.net.online || !this.G.net.isHost) return;
    if (!force && this.syncTimer < 0.1) return;
    this.syncTimer = 0;
    this.G.net.send({ t: 'start', state: this.snapshot() });
  }

  _allPlayersAboard() {
    const G = this.G;
    if (!G.player.aboard) return false;
    for (const remote of G.net.remotes.values()) {
      if (!remote.s.dead && !remote.aboard) return false;
    }
    return true;
  }

  update(dt, t) {
    if (!this.G.started) return;
    const isHost = !this.G.net.online || this.G.net.isHost;
    if (isHost) {
      this.syncTimer += dt;
      if (['calm', 'storm', 'flood'].includes(this.phase)) this.elapsed += dt;
      if (this.phase === 'build' && this.G.boat.isComplete) {
        this._transition('install', 'Estrutura pronta — instale a vela no mastro.');
      } else if (this.phase === 'calm' && this.elapsed >= CALM_DURATION) {
        this._transition('storm', 'O vento aumenta. A tempestade está chegando.');
      } else if (this.phase === 'storm' && this.elapsed >= STORM_DURATION) {
        this._transition('flood', 'A inundação global começou — suba na jangada!');
      } else if (this.phase === 'flood') {
        // sobe devagar no começo, mais rápido no meio e assenta no fim (sem degrau na chegada)
        const u = clamp(this.elapsed / FLOOD_DURATION, 0, 1);
        this.waterLevel = FLOOD_LEVEL * u * u * (3 - 2 * u);
        if (this.elapsed >= FLOOD_DURATION) {
          this.waterLevel = FLOOD_LEVEL;
          this._transition('board', 'A terra foi inundada. Embarque para partir.');
        }
      } else if (this.phase === 'board' && this._allPlayersAboard()) {
        this.G.boat.sailUp = true;
        this.G.boat.sailAngle = 0;
        this._transition('depart', 'A jangada parte para o oceano. A aventura começou!');
      }
      this._sync();
    }

    // Quem não é host: a água persegue o nível que o host mandou (a ~10 Hz), sem degraus.
    if (!isHost && !this.departed && Number.isFinite(this.netWater)) {
      this.waterLevel += (this.netWater - this.waterLevel) * (1 - Math.exp(-6 * dt));
    }
    // Depois da partida a maré segue o ciclo (calculado localmente pelo relógio comum).
    if (this.departed) {
      if (this.departAt === null) this.departAt = t;
      this.waterLevel = this.tide.level(this.sinceDepart(t), dt, FLOOD_LEVEL);
    }
    sea.level = this.waterLevel;
    this.G.world.updateFloodLevel(this.waterLevel);
    // Depois da partida o céu abre aos poucos (mar mais calmo = eventos se destacam).
    if (this.departed) this.departT += dt;
    const boost = this.G.events ? this.G.events.stormBoost(t) : 0;
    const storm = this.phase === 'storm'
      ? clamp(this.elapsed / STORM_DURATION, 0, 1)
      : this.departed ? Math.max(1 - 0.7 * clamp(this.departT / 45, 0, 1), boost, this.G.benchStorm || 0)
        : ['flood', 'board'].includes(this.phase) ? 1 : 0;
    // cutscene de abertura: ela decide o céu (tempestade no voo, limpo no despertar)
    const cut = this.G.cutscene && this.G.cutscene.active ? this.G.cutscene.storm : null;
    this._updateWeather(cut ?? storm, t, dt);
  }

  _updateWeather(storm, t, dt = 0) {
    const G = this.G;
    const sky = this.clearSky.clone().lerp(this.stormSky, storm);
    if (G.scene.background && G.scene.background.isColor) G.scene.background.copy(sky);
    if (G.scene.fog) {
      G.scene.fog.color.copy(sky);
      const view = G.viewScale || 1; // distância de visão (opções gráficas)
      G.scene.fog.near = (120 - storm * 65) * view;
      G.scene.fog.far = (330 - storm * 180) * view;
      const gf = G.events && G.events.ghostFog ? G.events.ghostFog(t) : 0; // névoa verde do navio-fantasma
      if (gf > 0) {
        G.scene.fog.color.lerp(GHOST_FOG, gf * 0.75);
        if (G.scene.background && G.scene.background.isColor) G.scene.background.lerp(GHOST_FOG, gf * 0.6);
        G.scene.fog.near *= 1 - 0.75 * gf; G.scene.fog.far *= 1 - 0.55 * gf;
      }
    }
    this.sun.color.copy(this.clearSun).lerp(this.stormSun, storm);
    this.sun.intensity = 1.7 - storm * 0.95;
    this.hemisphere.intensity = 1.15 - storm * 0.55;
    if (G.sunVisual) G.sunVisual.setStorm(storm);
    const swell = this.departed && this.waterLevel > 0.5 ? swellAt(t) : 0;
    if (swell > 0.35 && !this.swellOn) G.hud.msg('Ondas grandes chegando — segure-se!');
    this.swellOn = swell > 0.35 ? true : swell < 0.1 ? false : this.swellOn;
    sea.amp = 1 + storm * 0.7 + swell + (this.departed ? 0.3 : 0); // depois da partida o mar nunca fica liso
    if (G.boat.sailInstalled) G.boat.sailGroup.rotation.z = Math.sin(t * 6) * storm * 0.045;

    // chuva e nuvens em volta de quem está olhando (na cutscene a câmera está longe do jogador)
    const player = G.cutscene && G.cutscene.active ? G.camera.position : G.player.body.pos;
    // ângulo ACUMULADO (antes era relógio × velocidade: quando a tempestade mudava a velocidade, o
    // relógio enorme multiplicava a diferença e as nuvens giravam muito rápido no céu)
    this.cloudAngle = (this.cloudAngle || 0) + dt * (0.006 + storm * 0.018);
    for (let i = 0; i < this.clouds.length; i++) {
      const cloud = this.clouds[i], angle = this.cloudAngle + i * 0.7;
      cloud.visible = storm > 0.03;
      cloud.position.set(
        player.x + Math.cos(angle) * (22 + (i % 3) * 7),
        19 + (i % 4) * 1.7,
        player.z + Math.sin(angle) * (22 + (i % 3) * 7)
      );
      cloud.rotation.y = angle * 0.2;
      cloud.children[0].material.opacity = storm * 0.78;
    }

    const rainOpacity = clamp((storm - 0.38) * 1.35, 0, 0.72);
    this.rain.visible = rainOpacity > 0.01;
    this.rain.material.opacity = rainOpacity;
    this.rain.position.set(player.x, player.y - 7, player.z);
    const positions = this.rain.geometry.attributes.position.array;
    for (let i = 0; i < positions.length; i += 3) {
      positions[i] += (1.5 + storm * 8) * dt;
      positions[i + 1] -= (12 + storm * 12) * dt;
      if (positions[i + 1] < -7) {
        positions[i] = (Math.random() - 0.5) * 36;
        positions[i + 1] = 15 + Math.random() * 14;
        positions[i + 2] = (Math.random() - 0.5) * 36;
      }
    }
    this.rain.geometry.attributes.position.needsUpdate = true;
  }

  spawnPosition() {
    const G = this.G;
    if (this.phase === 'flood' || this.phase === 'board' || this.departed ||
        (this.island && this.island.flooded)) {
      const [x, z] = G.boat.toWorld(0, -1.4);
      return { x, y: G.boat.set.y + 1.2, z, groundSet: G.boat.set };
    }
    const match = /^p(\d+)$/.exec(G.net.id);
    const spawnIndex = match ? (Number(match[1]) - 1) % 4 : 0;
    const island = this.island;
    if (!island) {
      return { x: this.anchor.x, y: 1.2, z: this.anchor.z, groundSet: null };
    }

    const body = G.player.body;
    const groundY = island.set.y + 0.55;
    const baseAngle = -Math.PI / 2 + spawnIndex * Math.PI / 2;
    const angleOffsets = [0, 1, -1, 2, -2, 3, -3, 4, -4].map((step) => step * Math.PI / 18);
    const blocked = (x, z) => {
      const intersectsCollider = island.set.items.some((collider) => {
        if (collider.floodTop != null) return false;
        const bottom = island.set.y + collider.y - collider.hy;
        const top = island.set.y + collider.y + collider.hy;
        if (top <= groundY + 0.05 || bottom >= groundY + body.height) return false;
        let dx = x - island.x - collider.x, dz = z - island.z - collider.z;
        if (collider.yaw) {
          const cos = Math.cos(collider.yaw), sin = Math.sin(collider.yaw);
          [dx, dz] = [dx * cos + dz * sin, -dx * sin + dz * cos];
        }
        const clearance = body.radius + 0.35;
        if (collider.type === 'cyl') {
          return Math.hypot(dx, dz) < collider.hx + clearance;
        }
        return Math.abs(dx) < collider.hx + clearance &&
          Math.abs(dz) < collider.hz + clearance;
      });
      if (intersectsCollider) return true;

      const intersectsStarterPart = G.world.physObjects.some((obj) => {
        if (!obj.starterPart || !obj.mesh.visible) return false;
        const size = obj.def.size || [2, 0.2, 2];
        const radius = Math.hypot(size[0], size[2]) / 2 + body.radius + 0.2;
        return Math.hypot(x - obj.x, z - obj.z) < radius;
      });
      if (intersectsStarterPart) return true;
      return G.world.crates.some((crate) => Math.hypot(x - crate.x, z - crate.z) < 1.8);
    };

    for (const radius of [island.R * 0.55, island.R * 0.63]) {
      for (const offset of angleOffsets) {
        const angle = baseAngle + offset;
        const x = island.x + Math.cos(angle) * radius;
        const z = island.z + Math.sin(angle) * radius;
        if (!blocked(x, z)) {
          return { x, y: groundY + 0.05, z, groundSet: island.set };
        }
      }
    }

    const x = island.x + Math.cos(baseAngle) * island.R * 0.55;
    const z = island.z + Math.sin(baseAngle) * island.R * 0.55;
    return {
      x, y: groundY + 0.05, z, groundSet: island.set,
    };
  }

  get objective() {
    const G = this.G;
    switch (this.phase) {
      case 'build': return `Monte o barco — ${G.boat.buildProgress}/${G.boat.deckSlots.length} encaixes`;
      case 'install': return 'Instale a vela — aproxime-se do mastro e pressione E';
      case 'calm': return 'Calmaria — prepare-se para zarpar';
      case 'storm': return 'A tempestade se aproxima';
      case 'flood': return 'Inundação — embarque na jangada';
      case 'board': return 'A terra foi inundada — todos a bordo';
      default: return '';
    }
  }
}
