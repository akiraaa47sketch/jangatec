// Itens largados no mundo: um saquinho com o que o jogador soltou (armas, munição, comida...).
// Largado a bordo, o saco anda junto com a jangada; na água ele boia; em terra fica no chão.
// Qualquer jogador pega com [E]. No multiplayer o servidor guarda os sacos e garante que só um pega.
import * as THREE from '../three.js';
import { ITEM_NAMES } from './survival.js';
import { WEAPONS } from './combat.js';
import { waveHeight } from '../world/ocean.js';
import { clock } from '../core/util.js';
import { sfx } from '../core/sfx.js';
import { makeItemModel } from '../world/itemmodels.js';

export const lootLabel = (loot) => Object.entries(loot).map(([k, n]) => {
  if (k.startsWith('arma_')) { const w = WEAPONS.find((e) => e.id === k.slice(5)); return w ? w.nome : 'Arma'; }
  return `${n > 1 ? n + ' ' : ''}${ITEM_NAMES[k] || k}`;
}).join(', ');

let sackGeo = null, neckGeo = null, ringGeo = null;
function makeSack(hasWeapon) {
  if (!sackGeo) {
    sackGeo = new THREE.SphereGeometry(0.24, 14, 10); sackGeo.scale(1, 0.85, 1); sackGeo.translate(0, 0.2, 0);
    neckGeo = new THREE.CylinderGeometry(0.06, 0.1, 0.14, 10); neckGeo.translate(0, 0.44, 0);
    ringGeo = new THREE.RingGeometry(0.36, 0.42, 32); ringGeo.rotateX(-Math.PI / 2); ringGeo.translate(0, 0.02, 0);
  }
  const g = new THREE.Group();
  const cloth = new THREE.MeshStandardMaterial({ color: hasWeapon ? 0x8a6a3a : 0xa88a5a, roughness: 1 });
  const rope = new THREE.MeshStandardMaterial({ color: 0x5a4126, roughness: 1 });
  const ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0xf3cf7e, transparent: true, opacity: 0.55, depthWrite: false }));
  g.add(new THREE.Mesh(sackGeo, cloth), new THREE.Mesh(neckGeo, rope), ring);
  g.userData.ring = ring;
  return g;
}

export class Drops {
  constructor(G) { this.G = G; this.list = new Map(); this.seq = 0; }

  clear() { for (const id of [...this.list.keys()]) this.remove(id); }

  // Solta itens na frente do jogador. loot = { bandagem: 2, arma_pistola: 1, ... }
  drop(loot) {
    const G = this.G, pl = G.player, p = pl.body.pos, boat = G.boat;
    if (!Object.keys(loot).length) return;
    const [fx, fz] = pl.forward(), x = p.x + fx * 0.9, z = p.z + fz * 0.9;
    const d = { id: `${G.net.online ? G.net.id : 's'}-${Date.now().toString(36)}-${(this.seq++).toString(36)}`, loot };
    if (pl.aboard) { const [lx, lz] = boat.toLocal(x, z); d.ab = 1; d.p = [lx, p.y - boat.set.y, lz]; }
    else d.p = [x, p.y, z];
    d.w = pl.swimming ? 1 : 0;
    this.spawn(d);
    sfx.pickup();
    G.hud.msg(`Largou: ${lootLabel(loot)}`);
    if (G.net.online) G.net.send({ t: 'drop:add', d });
  }

  // Saco num ponto do mundo (loot de chefe). No multiplayer só quem cria (o host) chama.
  dropAt(pos, loot) {
    const G = this.G, d = { id: `b-${Date.now().toString(36)}-${(this.seq++).toString(36)}`, loot, p: [pos.x, pos.y, pos.z], w: 0 };
    this.spawn(d);
    if (G.net.online) G.net.send({ t: 'drop:add', d });
  }

  spawn(d) {
    if (!d || this.list.has(d.id)) return;
    // o item aparece com o modelo dele (arma, bandagem, kit, colete...) — não mais um saquinho
    let mesh, glint = null;
    try { const m = makeItemModel(d.loot); mesh = m.group; glint = m.glint; } catch (e) { mesh = makeSack(Object.keys(d.loot).some((k) => k.startsWith('arma_'))); }
    mesh.userData.glint = glint;
    this.G.scene.add(mesh);
    this.list.set(d.id, { ...d, mesh, t: Math.random() * 6 });
    this.place(this.list.get(d.id), 0);
  }

  remove(id) {
    const d = this.list.get(id);
    if (!d) return;
    this.G.scene.remove(d.mesh); // (materiais/geometrias são compartilhados com as armas na mão: não descarta)
    this.list.delete(id);
  }

  worldPos(d) {
    const boat = this.G.boat;
    if (d.ab) { const [x, z] = boat.toWorld(d.p[0], d.p[2]); return [x, boat.set.y + d.p[1], z]; }
    return d.p;
  }

  nearest(maxDist = 2.2) {
    const pp = this.G.player.body.pos;
    let best = null, bd = maxDist;
    for (const d of this.list.values()) {
      const [x, y, z] = this.worldPos(d), dist = Math.hypot(x - pp.x, z - pp.z);
      if (dist < bd && Math.abs(y - pp.y) < 2.2) { bd = dist; best = d; }
    }
    return best;
  }

  take(d) {
    const G = this.G;
    if (G.net.online) { G.net.send({ t: 'drop:take', id: d.id }); return; }
    this.remove(d.id);
    G.hud.msg(G.survival.add(d.loot) || 'Pegou');
  }

  // resposta do servidor: o saco é seu
  got(loot) { const m = this.G.survival.add(loot || {}); if (m) this.G.hud.msg(m); }

  place(d, dt) {
    const G = this.G, m = d.mesh;
    d.t += dt;
    let [x, y, z] = this.worldPos(d);
    if (!d.ab && (d.w || y < G.startup.waterLevel + 0.2)) { // na água: boia junto com as ondas
      const h = Math.max(waveHeight(x, z, clock()), G.world.seabedHeight(x, z) + 0.05);
      y = h - 0.12;
    }
    m.position.set(x, y, z);
    m.rotation.y = (d.ab ? G.boat.yaw : 0) + (d.yaw0 ??= Math.random() * 6.28); // parado, deitado no chão
    if (m.userData.ring) m.userData.ring.material.opacity = 0.35 + Math.sin(d.t * 3) * 0.2;
    const gl = m.userData.glint; // brilho branco que pisca de vez em quando
    if (gl) { const ph = (d.t * 0.45 + (d.yaw0 || 0)) % 1; gl.material.opacity = ph < 0.12 ? Math.sin(ph / 0.12 * Math.PI) * 0.9 : 0; gl.material.rotation = d.t; }
  }

  update(dt) { for (const d of this.list.values()) this.place(d, dt); }
}
