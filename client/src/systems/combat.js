// Armas com raridade, atributos e munição (não quebram) + ferramentas (martelo, banjo, gancho).
import { buildWeapon } from '../player/viewmodel-parts.js';
import * as THREE from '../three.js';
import { sfx } from '../core/sfx.js';

export const WEAPONS = [
  { id: 'tabua_prego', nome: 'Tábua com prego', stars: 1, melee: true, dmg: 22, range: 2.1, rate: 0.62, durability: 55, color: 0x8a623a, scale: [0.8, 1, 1.4] },
  { id: 'cano', nome: 'Cano improvisado', stars: 1, melee: true, dmg: 26, range: 2.2, rate: 0.78, durability: 72, color: 0x737e83, scale: [0.65, 0.65, 1.6] },
  { id: 'faca_manteiga', nome: 'Faca de manteiga', stars: 1, melee: true, dmg: 16, range: 1.7, rate: 0.34, durability: 38, color: 0xa5a9a8, scale: [0.4, 0.45, 0.9] },
  { id: 'bastao', nome: 'Bastão', stars: 1, melee: true, dmg: 19, range: 2.5, rate: 0.48, durability: 65, color: 0x74502e, scale: [0.55, 0.65, 1.65] },
  { id: 'facao', nome: 'Facão reforçado', stars: 2, melee: true, dmg: 38, range: 2.6, rate: 0.42, durability: 120, color: 0x555c60, scale: [0.55, 0.55, 1.35] },
  { id: 'sabre', nome: 'Sabre pirata', stars: 3, melee: true, dmg: 34, range: 2.5, rate: 0.4, durability: 150, color: 0xb58d4a, scale: [0.5, 0.5, 1.5] },
  { id: 'revolver', nome: 'Revólver', stars: 2, dmg: 26, mag: 6, rate: 0.38, spread: 0.028, range: 60, reload: 1.55, recoil: 0.026, pellets: 1, ammo: 'municao', durability: 90, color: 0x514b45, scale: [0.8, 0.75, 0.95] },
  { id: 'pistola', nome: 'Pistola', stars: 3, dmg: 30, mag: 12, rate: 0.24, spread: 0.009, range: 100, reload: 1.5, recoil: 0.02, pellets: 1, ammo: 'municao', durability: 140, color: 0x33383c, scale: [0.9, 0.85, 0.9], automatic: true },
  { id: 'escopeta', nome: 'Escopeta', stars: 4, dmg: 12, mag: 5, rate: 0.8, spread: 0.07, range: 32, reload: 1.9, recoil: 0.04, pellets: 8, ammo: 'cartucho', durability: 110, color: 0x4c3525, scale: [1, 1, 1.7] },
  { id: 'rifle', nome: 'Rifle', stars: 4, dmg: 38, mag: 20, rate: 0.12, spread: 0.006, range: 140, reload: 2, recoil: 0.018, pellets: 1, ammo: 'municao', durability: 190, color: 0x454239, scale: [0.8, 0.8, 1.8], automatic: true },
  // ferramentas: martelo conserta peças da jangada (e ainda bate), banjo toca e cura aliados,
  // gancho puxa caixotes boiando e jogadores
  { id: 'martelo', nome: 'Martelo', stars: 2, melee: true, tool: 'martelo', dmg: 14, range: 2.2, rate: 0.5, color: 0x6b4a2e, scale: [0.6, 0.6, 1.2] },
  { id: 'banjo', nome: 'Banjo', stars: 3, tool: 'banjo', rate: 0.2, color: 0xc49a5a, scale: [1, 1, 1] },
  { id: 'gancho', nome: 'Gancho', stars: 3, tool: 'gancho', rate: 0.6, color: 0x6d7479, scale: [1, 1, 1] },
  // Minigun: só cai do chefe das bases militares. 140 balas e acabou (não recarrega); gira antes de atirar.
  { id: 'minigun', nome: 'Minigun', stars: 5, dmg: 15, mag: 140, rate: 0.065, spread: 0.04, range: 90, reload: 0, recoil: 0.007, pellets: 1, noReload: true, spinUp: 0.45, automatic: true, durability: 999, color: 0x24282c, scale: [1, 1, 1.6] },
  { id: 'rifle_precisao', nome: 'Rifle de precisão', stars: 5, dmg: 70, mag: 5, rate: 0.9, spread: 0.001, range: 240, reload: 2.6, recoil: 0.07, pellets: 1, ammo: 'municao', durability: 240, color: 0x292f33, scale: [0.75, 0.8, 2] },
];

// RARIDADE de cada arma achada: 1★ comum … 4★ épica. Mesma arma, mais estrelas = um pouco mais forte
// (dano) e mais precisa. A raridade vem na chave do item: arma_pistola_r3. Sem sufixo = sorteada pela zona.
export const MAX_RAR = 4;
export const RAR_DMG = [1, 1, 1.1, 1.2, 1.32];
export const RAR_SPREAD = [1, 1, 0.93, 0.86, 0.78];
export const RAR_NAME = ['', 'Comum', 'Incomum', 'Rara', 'Épica'];
export const starsTxt = (r) => '★'.repeat(r) + '☆'.repeat(Math.max(0, MAX_RAR - r));
export function parseWeaponKey(k) {
  const m = /^arma_(.+?)(?:_r([1-4]))?$/.exec(k);
  return m ? { id: m[1], rar: m[2] ? Number(m[2]) : 0 } : null;
}
export { rollRarity } from './loot.js'; // chance de cada raridade por zona (fica no loot.js: o servidor também usa)

// recuo por arma: [sobe (rad), lado (rad)]
const RECOIL = { minigun: [0.012, 0.012], pistola: [0.075, 0.024], revolver: [0.08, 0.02], escopeta: [0.12, 0.035], rifle: [0.03, 0.016], rifle_precisao: [0.15, 0.025] };
const GUN_SOUND = { minigun: 'rifle', pistola: 'pistol', revolver: 'revolver', escopeta: 'shotgun', rifle: 'rifle', rifle_precisao: 'sniper' };
const STARTER_WEAPONS = ['tabua_prego', 'cano', 'faca_manteiga', 'bastao'];
const _o = new THREE.Vector3(), _dir = new THREE.Vector3(), _m = new THREE.Vector3(), _mw = new THREE.Vector3();
const stars = (count) => '★'.repeat(count);

export class Combat {
  constructor(G) {
    this.G = G;
    this.weaponId = null;
    this.hotbar = [null, null, null, null, null, null];
    this.owned = new Set();
    this.durability = {};
    this.rarity = {}; // id da arma -> 1..4 estrelas
    this.cooldown = 0;
    this.reloading = 0;
    this.aiming = false;
    this.swing = 0;
    this.swingDuration = 0.34;
    this.buildMode = false;
    this.mags = Object.fromEntries(WEAPONS.filter((w) => w.ammo || w.noReload).map((w) => [w.id, 0]));
    this.spin = 0; // minigun: giro dos canos (0..1)
    this.ray = new THREE.Raycaster();
    this.tracers = [];
    this.pendingStrike = null; // golpe corpo a corpo em 1ª pessoa: o dano cai quando a animação acerta
  }

  get weapon() { return WEAPONS.find((w) => w.id === this.weaponId) || null; }
  rarOf(id) { return this.rarity[id] || 1; }
  dmgOf(w) { return w.dmg * RAR_DMG[this.rarOf(w.id)]; }

  startWithRandomImprovisedWeapon() {
    this.weaponId = null;
    this.hotbar.fill(null);
    this.owned.clear();
    this.durability = {}; this.rarity = {};
    for (const id of Object.keys(this.mags)) this.mags[id] = 0;
    const id = STARTER_WEAPONS[Math.floor(Math.random() * STARTER_WEAPONS.length)];
    this.unlockWeapon(id);
    this.equip(id);
    return id;
  }

  // rar = estrelas da arma achada. Já tem essa arma? Fica com a de mais estrelas ('upgrade').
  unlockWeapon(id, rar = 1) {
    const weapon = WEAPONS.find((w) => w.id === id);
    if (!weapon) return false;
    rar = Math.max(1, Math.min(MAX_RAR, rar | 0 || 1));
    if (this.owned.has(id)) {
      if (rar > this.rarOf(id)) { this.rarity[id] = rar; return 'upgrade'; }
      return 'owned';
    }
    this.rarity[id] = rar;
    this.owned.add(id);
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
    const mesh = this.G.player.weaponMesh, chest = this.G.player.chestMount;
    for (const old of mesh.children.slice()) mesh.remove(old);
    if (chest) for (const old of chest.children.slice()) chest.remove(old);
    const model = buildWeapon(id);
    if (model) { model.flashMesh.visible = false; (id === 'banjo' && chest ? chest : mesh).add(model.group); }
    this.G.player.flashMesh = model && model.muzzle ? model.flashMesh : null;
    this.G.player.weaponSpec = id === 'banjo' ? null : model; // pegada da 3ª pessoa = pegada da 1ª
    this.G.player.fitWeapon3P();
    mesh.visible = !this.buildMode;
    return true;
  }

  // Sem arma na mão (largou a última)
  unequip() {
    this.weaponId = null; this.cooldown = 0; this.reloading = 0;
    const pl = this.G.player, mesh = pl.weaponMesh, chest = pl.chestMount;
    if (mesh) for (const old of mesh.children.slice()) mesh.remove(old);
    if (chest) for (const old of chest.children.slice()) chest.remove(old);
    pl.flashMesh = null; pl.weaponSpec = null;
    if (pl.fitWeapon3P) pl.fitWeapon3P();
  }

  // Tira a arma do inventário (para largar). A munição no pente volta para a mochila.
  removeWeapon(id) {
    if (!this.owned.has(id)) return false;
    const w = WEAPONS.find((e) => e.id === id), inv = this.G.survival.inv;
    if (w && w.ammo && this.mags[id]) { inv[w.ammo] = (inv[w.ammo] || 0) + this.mags[id]; this.mags[id] = 0; }
    this.owned.delete(id); delete this.rarity[id];
    const i = this.hotbar.indexOf(id);
    if (i >= 0) this.hotbar[i] = null;
    if (this.weaponId === id) {
      const next = this.hotbar.find(Boolean) || [...this.owned][0];
      if (next) this.equip(next); else this.unequip();
    }
    return true;
  }

  // Organização da barra rápida: põe a arma no slot (troca de lugar se ele já estiver ocupado)
  assignSlot(id, slot) {
    if (!this.owned.has(id) || slot < 0 || slot >= this.hotbar.length) return;
    const from = this.hotbar.indexOf(id), there = this.hotbar[slot];
    if (from >= 0) this.hotbar[from] = there; // troca de lugar com o que estava lá
    this.hotbar[slot] = id;
  }
  // tira da barra rápida (fica só na mochila)
  unassign(id) { const i = this.hotbar.indexOf(id); if (i >= 0) this.hotbar[i] = null; }

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
    if (!w || !w.ammo || w.noReload || this.reloading > 0 || this.mags[w.id] >= w.mag) return;
    if (!inv[w.ammo]) { this.G.hud.msg('Sem munição'); return; }
    this.reloading = w.reload;
    const pp = this.G.player.body.pos;
    this.reloadSample = sfx.reload(pp, w.id); // pistola: som gravado da recarga inteira
    if (this.reloadSample) return;
    if (w.id === 'escopeta' || w.id === 'revolver') sfx.shell(pp); else sfx.click(pp, 0.85); // tira o carregador / abre
  }

  tracer(from, to, color = 0xfff2a0) {
    const geo = new THREE.BufferGeometry().setFromPoints([from, to]);
    const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color, transparent: true }));
    this.G.scene.add(line);
    this.tracers.push({ line, life: 0.09 });
  }

  _useDurability() { /* armas não quebram mais */ }

  // Aplica o dano do golpe nos inimigos à frente. Retorna quantos foram atingidos.
  meleeStrike(w) {
    const G = this.G;
    G.player.mesh.getWorldPosition(_m); _m.y += 1.3;
    const [fx, fz] = G.player.forward();
    let hits = 0;
    for (const e of G.enemies.list) {
      const dx = e.body.pos.x - _m.x, dz = e.body.pos.z - _m.z, d = Math.hypot(dx, dz);
      if (d - (e.def.hitR || 0) < w.range && (d < 0.8 || (dx * fx + dz * fz) / d > 0.2) && Math.abs(e.body.pos.y - (_m.y - 1.3)) < 2) {
        G.enemies.damage(e, Math.round(this.dmgOf(w)));
        hits++;
      }
    }
    return hits;
  }

  fire() {
    const G = this.G, w = this.weapon, cam = G.camera;
    if (!w) return;
    const vm = G.player.firstPerson ? G.viewmodel : null;
    if (w.tool && !w.melee) { this.cooldown = w.rate; if (G.tools) G.tools.use(w); return; }
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
      if (w.noReload) { this.emptyMinigun(w); return; }
      this.startReload();
      if (this.reloading <= 0) sfx.dry();
      if (vm && this.reloading <= 0) vm.onDry();
      return;
    }
    this.mags[w.id]--;
    sfx.gun(G.player.body.pos, GUN_SOUND[w.id] || 'pistol');
    if (w.id === 'rifle_precisao' || w.id === 'escopeta') setTimeout(() => (w.id === 'escopeta' ? sfx.shell(G.player.body.pos) : sfx.bolt(G.player.body.pos)), 330); // ferrolho / bomba
    if (vm) vm.onFire(w);
    else G.player.onShot();
    this.bloom = Math.min(1, (this.bloom || 0) + 0.45 + w.recoil * 8); // retícula abre com o recuo
    // 1ª pessoa: o rastro sai da boca da arma na tela; 3ª pessoa: da boca do cano do modelo
    let origin = vm ? vm.muzzleWorld(_mw) : _m;
    if (!vm && G.player.flashMesh) origin = G.player.flashMesh.getWorldPosition(_mw);
    const spread = w.spread * RAR_SPREAD[this.rarOf(w.id)] * (this.aiming ? 0.4 : 1);
    cam.getWorldPosition(_o);
    const targets = G.enemies.hitMeshes.concat(G.solids), ends = [];
    for (let i = 0; i < w.pellets; i++) {
      cam.getWorldDirection(_dir);
      _dir.x += (Math.random() - 0.5) * 2 * spread; _dir.y += (Math.random() - 0.5) * 2 * spread; _dir.z += (Math.random() - 0.5) * 2 * spread;
      _dir.normalize();
      this.ray.set(_o, _dir);
      this.ray.near = G.player.camDist * 0.7;
      this.ray.far = w.range + G.player.camDist;
      const hit = this.ray.intersectObjects(targets, false)[0];
      const end = hit ? hit.point.clone() : _o.clone().addScaledVector(_dir, w.range);
      if (hit && hit.object.userData.enemy) G.enemies.damage(hit.object.userData.enemy, Math.round(this.dmgOf(w) * G.survival.dmgMul));
      this.tracer(origin.clone(), end); ends.push(end);
    }
    if (G.enemyNet) G.enemyNet.playerShot(origin, ends, w.id, GUN_SOUND[w.id] || 'pistol'); // os aliados veem e ouvem o tiro
    this._useDurability(w);
    // recuo: a mira sobe e puxa para o lado; volta só uma parte (automáticas acumulam)
    const rk = RECOIL[w.id] || [w.recoil * 3, w.recoil];
    const aimK = this.aiming ? 0.7 : 1;
    G.player.addRecoil(rk[0] * aimK * (0.85 + Math.random() * 0.3), rk[1] * aimK * (Math.random() * 2 - 0.6));
    if (this.mags[w.id] <= 0) { if (w.noReload) this.emptyMinigun(w); else this.startReload(); }
  }

  // Minigun sem balas: não tem recarga — ela é descartada.
  emptyMinigun(w) {
    sfx.dry();
    this.G.hud.msg(`A ${w.nome} esvaziou — sem recarga, você a largou.`);
    this.removeWeapon(w.id);
  }

  update(dt) {
    const G = this.G, inp = G.input, w = this.weapon;
    const building = G.build.active || !!(G.naval && G.naval.manning) || !!(G.tools && G.tools.menuOpen), looting = G.interact.lootOpen;
    this.cooldown -= dt;
    this.bloom = Math.max(0, (this.bloom || 0) - dt * 2.5);
    this.aiming = !!w && !building && !looting && !!w.ammo && !w.noReload && inp.mouse.right && !G.player.dead && !G.player.downed && !G.player.swimming;
    if (this.reloading > 0 && w) {
      this.reloading -= dt;
      if (this.reloading <= 0) {
        const inv = G.survival.inv, count = Math.min(w.mag - this.mags[w.id], inv[w.ammo]);
        this.mags[w.id] += count; inv[w.ammo] -= count;
        if (!this.reloadSample) sfx.click(G.player.body.pos, 1.1); // encaixa e trava
      }
    }
    if (!building && !looting && !G.player.dead && !G.player.downed && !G.player.mantle && !this.buildMode && w) {
      if (inp.act('reload')) this.startReload();
      let trigger = inp.mouse.leftPressed || (w.automatic && inp.mouse.left);
      if (w.spinUp) { // minigun: os canos precisam girar antes de sair o primeiro tiro
        const want = inp.mouse.left && !G.player.swimming ? 1 : 0;
        this.spin = Math.max(0, Math.min(1, this.spin + (want ? dt / w.spinUp : -dt / 0.8)));
        if (want && this.spin < 1 && Math.random() < dt * 20) sfx.click(G.player.body.pos, 0.5 + this.spin);
        trigger = want && this.spin >= 1;
      } else this.spin = 0;
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
