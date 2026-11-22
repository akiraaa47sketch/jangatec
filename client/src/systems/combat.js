// Armas com raridade, atributos, munição e durabilidade usados pelo combate.
import { buildWeapon } from '../player/viewmodel-parts.js';
import * as THREE from '../three.js';

export const WEAPONS = [
  { id: 'tabua_prego', nome: 'Tábua com prego', stars: 1, melee: true, dmg: 22, range: 2.1, rate: 0.62, durability: 55, color: 0x8a623a, scale: [0.8, 1, 1.4] },
  { id: 'cano', nome: 'Cano improvisado', stars: 1, melee: true, dmg: 26, range: 2.2, rate: 0.78, durability: 72, color: 0x737e83, scale: [0.65, 0.65, 1.6] },
  { id: 'faca_manteiga', nome: 'Faca de manteiga', stars: 1, melee: true, dmg: 16, range: 1.7, rate: 0.34, durability: 38, color: 0xa5a9a8, scale: [0.4, 0.45, 0.9] },
  { id: 'bastao', nome: 'Bastão', stars: 1, melee: true, dmg: 19, range: 2.5, rate: 0.48, durability: 65, color: 0x74502e, scale: [0.55, 0.65, 1.65] },
  { id: 'facao', nome: 'Facão reforçado', stars: 2, melee: true, dmg: 38, range: 2.6, rate: 0.42, durability: 120, color: 0x555c60, scale: [0.55, 0.55, 1.35] },
  { id: 'revolver', nome: 'Revólver', stars: 2, dmg: 26, mag: 6, rate: 0.38, spread: 0.028, range: 60, reload: 1.55, recoil: 0.026, pellets: 1, ammo: 'municao', durability: 90, color: 0x514b45, scale: [0.8, 0.75, 0.95] },
  { id: 'pistola', nome: 'Pistola', stars: 3, dmg: 30, mag: 12, rate: 0.24, spread: 0.009, range: 100, reload: 1.1, recoil: 0.01, pellets: 1, ammo: 'municao', durability: 140, color: 0x33383c, scale: [0.9, 0.85, 0.9], automatic: true },
  { id: 'escopeta', nome: 'Escopeta', stars: 4, dmg: 12, mag: 5, rate: 0.8, spread: 0.07, range: 32, reload: 1.9, recoil: 0.04, pellets: 8, ammo: 'cartucho', durability: 110, color: 0x4c3525, scale: [1, 1, 1.7] },
  { id: 'rifle', nome: 'Rifle', stars: 4, dmg: 38, mag: 20, rate: 0.12, spread: 0.006, range: 140, reload: 2, recoil: 0.018, pellets: 1, ammo: 'municao', durability: 190, color: 0x454239, scale: [0.8, 0.8, 1.8], automatic: true },
  { id: 'rifle_precisao', nome: 'Rifle de precisão', stars: 5, dmg: 70, mag: 5, rate: 0.9, spread: 0.001, range: 240, reload: 2.6, recoil: 0.07, pellets: 1, ammo: 'municao', durability: 240, color: 0x292f33, scale: [0.75, 0.8, 2] },
];

const STARTER_WEAPONS = ['tabua_prego', 'cano', 'faca_manteiga', 'bastao'];
const _o = new THREE.Vector3(), _dir = new THREE.Vector3(), _m = new THREE.Vector3(), _mw = new THREE.Vector3();
const stars = (count) => '★'.repeat(count);

export class Combat {
  constructor(G) {
    this.G = G;
    this.weaponId = null;
    this.hotbar = [null, null, null];
    this.owned = new Set();
    this.durability = {};
    this.cooldown = 0;
    this.reloading = 0;
    this.aiming = false;
    this.swing = 0;
    this.swingDuration = 0.34;
    this.buildMode = false;
    this.mags = Object.fromEntries(WEAPONS.filter((w) => w.ammo).map((w) => [w.id, 0]));
    this.ray = new THREE.Raycaster();
    this.tracers = [];
    this.pendingStrike = null; // golpe corpo a corpo em 1ª pessoa: o dano cai quando a animação acerta
  }

  get weapon() { return WEAPONS.find((w) => w.id === this.weaponId) || null; }

  startWithRandomImprovisedWeapon() {
    this.weaponId = null;
    this.hotbar.fill(null);
    this.owned.clear();
    this.durability = {};
    for (const id of Object.keys(this.mags)) this.mags[id] = 0;
    const id = STARTER_WEAPONS[Math.floor(Math.random() * STARTER_WEAPONS.length)];
    this.unlockWeapon(id);
    this.equip(id);
    return id;
  }

  unlockWeapon(id) {
    const weapon = WEAPONS.find((w) => w.id === id);
    if (!weapon) return false;
    if (this.owned.has(id)) {
      this.durability[id] = Math.min(weapon.durability, this.durability[id] + Math.ceil(weapon.durability * 0.3));
      return 'repaired';
    }
    this.owned.add(id);
    this.durability[id] = weapon.durability;
    const slot = this.hotbar.indexOf(null);
    if (slot >= 0) this.hotbar[slot] = id;
    if (!this.weaponId) this.equip(id);
    return true;
  }

  equip(id) {
    if (!this.owned.has(id)) return false;
    const weapon = WEAPONS.find((w) => w.id === id);
    if (!weapon) return false;
    this.weaponId = id;
    this.cooldown = 0;
    this.reloading = 0;
    // 3ª pessoa: o mesmo modelo detalhado usado na 1ª pessoa
    const mesh = this.G.player.weaponMesh;
    for (const old of mesh.children.slice()) mesh.remove(old);
    const model = buildWeapon(id);
    if (model) { model.flashMesh.visible = false; mesh.add(model.group); }
    this.G.player.flashMesh = model && model.muzzle ? model.flashMesh : null;
    mesh.visible = !this.buildMode;
    return true;
  }

  select(slot) {
    if (this.buildMode) return;
    const id = this.hotbar[slot];
    if (!id) { this.G.hud.msg(`Slot ${slot + 1} vazio`); return; }
    this.equip(id);
  }

  cycle(direction) {
    if (this.buildMode || this.owned.size < 2) return;
    const weapons = [...this.owned];
    const index = weapons.indexOf(this.weaponId);
    this.equip(weapons[(index + direction + weapons.length) % weapons.length]);
  }

  setBuildMode(active) {
    this.buildMode = active;
    this.aiming = false;
    if (this.G.player.weaponMesh) this.G.player.weaponMesh.visible = !active && !!this.weapon;
  }

  startReload() {
    const w = this.weapon, inv = this.G.survival.inv;
    if (!w || !w.ammo || this.reloading > 0 || this.mags[w.id] >= w.mag) return;
    if (!inv[w.ammo]) { this.G.hud.msg('Sem munição'); return; }
    this.reloading = w.reload;
  }

  tracer(from, to, color = 0xfff2a0) {
    const geo = new THREE.BufferGeometry().setFromPoints([from, to]);
    const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color, transparent: true }));
    this.G.scene.add(line);
    this.tracers.push({ line, life: 0.09 });
  }

  _useDurability(weapon) {
    this.durability[weapon.id] = Math.max(0, this.durability[weapon.id] - 1);
    if (this.durability[weapon.id] === 0) this.G.hud.msg(`${weapon.nome} quebrou`);
  }

  // Aplica o dano do golpe nos inimigos à frente. Retorna quantos foram atingidos.
  meleeStrike(w) {
    const G = this.G;
    G.player.mesh.getWorldPosition(_m); _m.y += 1.3;
    const [fx, fz] = G.player.forward();
    let hits = 0;
    for (const e of G.enemies.list) {
      const dx = e.body.pos.x - _m.x, dz = e.body.pos.z - _m.z, d = Math.hypot(dx, dz);
      if (d < w.range && (d < 0.8 || (dx * fx + dz * fz) / d > 0.2) && Math.abs(e.body.pos.y - (_m.y - 1.3)) < 2) {
        G.enemies.damage(e, w.dmg);
        hits++;
      }
    }
    return hits;
  }

  fire() {
    const G = this.G, w = this.weapon, cam = G.camera;
    if (!w) return;
    const vm = G.player.firstPerson ? G.viewmodel : null;
    if (this.durability[w.id] <= 0) {
      this.cooldown = 0.35;
      G.hud.msg(`${w.nome} está quebrada`);
      if (vm) vm.onDry();
      return;
    }
    this.cooldown = w.rate;
    G.player.mesh.getWorldPosition(_m); _m.y += 1.3;
    if (w.melee) {
      this.swing = this.swingDuration;
      const [fx, fz] = G.player.forward();
      G.player.yaw = Math.atan2(fx, fz);
      if (vm) this.pendingStrike = { w, t: vm.onSwing(w) * vm.strikeFraction(w) };
      else this.meleeStrike(w);
      this._useDurability(w);
      return;
    }
    if (this.mags[w.id] <= 0) {
      this.startReload();
      if (vm && this.reloading <= 0) vm.onDry();
      return;
    }
    this.mags[w.id]--;
    if (vm) vm.onFire(w);
    else G.player.onShot();
    this.bloom = Math.min(1, (this.bloom || 0) + 0.45 + w.recoil * 8); // retícula abre com o recuo
    // 1ª pessoa: o rastro sai da boca da arma na tela; 3ª pessoa: da boca do cano do modelo
    let origin = vm ? vm.muzzleWorld(_mw) : _m;
    if (!vm && G.player.flashMesh) origin = G.player.flashMesh.getWorldPosition(_mw);
    const spread = w.spread * (this.aiming ? 0.4 : 1);
    cam.getWorldPosition(_o);
    const targets = G.enemies.hitMeshes.concat(G.solids);
    for (let i = 0; i < w.pellets; i++) {
      cam.getWorldDirection(_dir);
      _dir.x += (Math.random() - 0.5) * 2 * spread; _dir.y += (Math.random() - 0.5) * 2 * spread; _dir.z += (Math.random() - 0.5) * 2 * spread;
      _dir.normalize();
      this.ray.set(_o, _dir);
      this.ray.near = G.player.camDist * 0.7;
      this.ray.far = w.range + G.player.camDist;
      const hit = this.ray.intersectObjects(targets, false)[0];
      const end = hit ? hit.point.clone() : _o.clone().addScaledVector(_dir, w.range);
      if (hit && hit.object.userData.enemy) G.enemies.damage(hit.object.userData.enemy, w.dmg);
      this.tracer(origin.clone(), end);
    }
    this._useDurability(w);
    G.player.camPitch -= w.recoil;
    if (this.mags[w.id] <= 0) this.startReload();
  }

  update(dt) {
    const G = this.G, inp = G.input, w = this.weapon;
    const building = G.build.active || !!(G.naval && G.naval.manning), looting = G.interact.lootOpen;
    this.cooldown -= dt;
    this.bloom = Math.max(0, (this.bloom || 0) - dt * 2.5);
    this.aiming = !!w && !building && !looting && !!w.ammo && inp.mouse.right && !G.player.dead && !G.player.downed && !G.player.swimming;
    if (this.reloading > 0 && w) {
      this.reloading -= dt;
      if (this.reloading <= 0) {
        const inv = G.survival.inv, count = Math.min(w.mag - this.mags[w.id], inv[w.ammo]);
        this.mags[w.id] += count; inv[w.ammo] -= count;
      }
    }
    if (!building && !looting && !G.player.dead && !G.player.downed && !G.player.mantle && !this.buildMode && w) {
      if (inp.hit('KeyR')) this.startReload();
      const trigger = inp.mouse.leftPressed || (w.automatic && inp.mouse.left);
      const drawing = G.player.firstPerson && G.viewmodel && G.viewmodel.lowerEquip > 0.35; // arma ainda sendo sacada
      // corpo a corpo (leve/pesado/bloqueio/esquiva) fica no sistema Melee
      if (trigger && !w.melee && this.cooldown <= 0 && this.reloading <= 0 && !G.player.swimming && !drawing) this.fire();
    }
    if (this.pendingStrike) {
      const s = this.pendingStrike;
      s.t -= dt;
      if (G.player.dead || this.weaponId !== s.w.id) this.pendingStrike = null;
      else if (s.t <= 0) {
        this.pendingStrike = null;
        if (this.meleeStrike(s.w) > 0 && G.viewmodel) G.viewmodel.onMeleeHit();
      }
    }
    if (this.swing > 0) this.swing = Math.max(0, this.swing - dt);
    for (let i = this.tracers.length - 1; i >= 0; i--) {
      const t = this.tracers[i];
      t.life -= dt; t.line.material.opacity = Math.max(0, t.life / 0.09);
      if (t.life <= 0) { G.scene.remove(t.line); t.line.geometry.dispose(); t.line.material.dispose(); this.tracers.splice(i, 1); }
    }
  }
}
