// Combate corpo a corpo entre jogador e inimigos.
// Jogador: golpe leve (clique, combo de 3), pesado (segurar o clique e soltar), bloqueio (botão
// direito), parry (bloquear no instante do golpe), esquiva [Q] com invencibilidade e estamina.
// Inimigos: avisam antes de bater (luva brilhando + "!"/"!!"), golpeiam e ficam vulneráveis;
// alguns defendem, todos podem ficar atordoados; rodeiam o jogador e no máximo 2 atacam por vez.
import * as THREE from '../three.js';
import { clamp } from '../core/util.js';

export const MELEE = {
  stamina: { max: 100, regen: 30, delay: 0.7 },
  light: { cost: 8, combo: [1, 1.15, 1.6], window: 0.7, knock: [2.4, 2.8, 6] },
  heavy: { cost: 22, minHold: 0.24, maxCharge: 0.7, mult: [1.7, 2.6], knock: 8 },
  block: { mult: 0.2, heavyMult: 0.5, cost: 14, parry: 0.18, arc: 0.3 },
  dodge: { cost: 20, speed: 11.5, dur: 0.34, iframes: 0.3, cd: 0.45 },
  enemy: { recover: 0.32, heavyRecover: 0.6, lunge: 3.6, evade: 0.16 }, // ritmo dos inimigos
  crit: 2.2,
  tokens: 2,                                  // quantos inimigos podem atacar ao mesmo tempo
};

// Repertório por tipo: wind = aviso (s), hits = golpes seguidos, heavy = pancada pesada.
const MOVES = {
  melee: [{ wind: 0.36, mult: 1, w: 3 }, { wind: 0.3, mult: 0.85, hits: 2, w: 2 }, { wind: 0.62, mult: 1.9, heavy: true, w: 1 }],
  rapido: [{ wind: 0.24, mult: 0.8, hits: 3, w: 3 }, { wind: 0.36, mult: 1.3, w: 1 }],
  pesado: [{ wind: 0.75, mult: 1.6, heavy: true, aoe: 3.0, w: 2 }, { wind: 0.42, mult: 0.9, w: 1 }],
  pirata: [{ wind: 0.32, mult: 1, hits: 2, w: 2 }, { wind: 0.6, mult: 1.8, heavy: true, w: 1 }],
};
const LIGHT_POSES = ['slashR', 'slashL', 'thrust', 'uppercut'];
const GUARD_CHANCE = { melee: 0.3, pesado: 0.45, pirata: 0.25, rapido: 0.1 };
const EVADE_CHANCE = { melee: 0.12, pesado: 0, pirata: 0.18, rapido: 0.3 }; // desviam do seu golpe

let bangTex = {}, starTex = null;
function bang(text, color) {
  const key = text + color;
  if (bangTex[key]) return bangTex[key];
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  g.font = 'bold 100px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineWidth = 12; g.strokeStyle = '#1a0a05'; g.strokeText(text, 64, 70);
  g.fillStyle = color; g.fillText(text, 64, 70);
  return (bangTex[key] = new THREE.CanvasTexture(c));
}
function star() {
  if (starTex) return starTex;
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'); g.fillStyle = '#ffe14d'; g.strokeStyle = '#7a5a00'; g.lineWidth = 4;
  g.beginPath();
  for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2 - Math.PI / 2, r = i % 2 ? 12 : 28; g[i ? 'lineTo' : 'moveTo'](32 + Math.cos(a) * r, 32 + Math.sin(a) * r); }
  g.closePath(); g.fill(); g.stroke();
  return (starTex = new THREE.CanvasTexture(c));
}

export class Melee {
  constructor(G) {
    this.G = G;
    this.stamina = MELEE.stamina.max; this.stamDelay = 0;
    this.combo = 0; this.comboT = 0;
    this.holdT = -1; this.charging = false;
    this.blocking = false; this.blockT = 0;
    this.dodge = null; this.iframes = 0; this.dodgeCd = 0;
    this.stunT = 0;
    this.pending = null;          // golpe do jogador esperando o momento do impacto
    this.swingPose = null;        // pose de 3ª pessoa do golpe atual
    this.tokens = new Set();
    this.nums = [];
    this.numLayer = document.getElementById('dmgNums');
  }

  get weapon() { const w = this.G.combat.weapon; return w && w.melee ? w : null; }
  spend(n) { this.stamina = Math.max(0, this.stamina - n); this.stamDelay = MELEE.stamina.delay; }

  // ---------- jogador ----------
  update(dt) {
    const G = this.G, inp = G.input, pl = G.player, w = this.weapon;
    if (this.stamDelay > 0) this.stamDelay -= dt;
    else this.stamina = Math.min(MELEE.stamina.max, this.stamina + MELEE.stamina.regen * dt * (this.blocking ? 0.35 : 1));
    this.comboT -= dt; if (this.comboT <= 0) this.combo = 0;
    this.iframes = Math.max(0, this.iframes - dt);
    this.dodgeCd = Math.max(0, this.dodgeCd - dt);
    this.stunT = Math.max(0, this.stunT - dt);
    if (this.dodge) { this.dodge.t += dt; if (this.dodge.t >= MELEE.dodge.dur) this.dodge = null; }
    this.updateNums(dt);

    const free = !G.build.active && !G.interact.lootOpen && !pl.dead && !pl.downed && !pl.mantle && !pl.swimming && !(G.gfxMenu && G.gfxMenu.open) && !G.bench;
    // esquiva [Q] (com qualquer arma)
    if (free && inp.hit('KeyQ') && !this.dodge && this.dodgeCd <= 0 && this.stunT <= 0 && this.stamina >= MELEE.dodge.cost * 0.5) {
      this.spend(MELEE.dodge.cost);
      const [fx, fz] = pl.forward(), rx = Math.cos(pl.camYaw), rz = -Math.sin(pl.camYaw);
      const f = (inp.down('KeyW') ? 1 : 0) - (inp.down('KeyS') ? 1 : 0), sd = (inp.down('KeyD') ? 1 : 0) - (inp.down('KeyA') ? 1 : 0);
      let dx = fx * f + rx * sd, dz = fz * f + rz * sd;
      if (!dx && !dz) { dx = -fx; dz = -fz; } // parado: pula para trás
      const l = Math.hypot(dx, dz); dx /= l; dz /= l;
      // cambalhota para frente/trás, passo lateral para os lados
      const along = dx * fx + dz * fz, side = dx * rx + dz * rz;
      const anim = Math.abs(along) >= Math.abs(side) ? 'roll' : 'sidestep';
      this.dodge = { vx: dx * MELEE.dodge.speed, vz: dz * MELEE.dodge.speed, t: 0, anim, dir: anim === 'roll' ? Math.sign(along) || -1 : -Math.sign(side) || 1, side };
      this.iframes = MELEE.dodge.iframes; this.dodgeCd = MELEE.dodge.cd;
      this.cancelCharge();
      if (G.viewmodel && pl.firstPerson) G.viewmodel.springs.kickRx.kick(1.5);
    }
    pl.dash = this.dodge;

    // pancada do jogador no momento certo da animação
    if (this.pending) {
      this.pending.t -= dt;
      if (this.pending.t <= 0) { const p = this.pending; this.pending = null; this.strike(p); }
    }
    if (this.swingPose) { this.swingPose.t += dt; if (this.swingPose.t >= this.swingPose.dur) this.swingPose = null; }
    this.updateSparks(dt);

    if (!w || !free || this.stunT > 0) { this.blocking = false; this.cancelCharge(); pl.speedMul = this.stunT > 0 ? 0.3 : 1; return; }
    // bloqueio (segurar o botão direito)
    const wantBlock = inp.mouse.right && !this.dodge && this.stamina > 0;
    if (wantBlock && !this.blocking) this.blockT = 0;
    this.blocking = wantBlock;
    if (this.blocking) { this.blockT += dt; this.cancelCharge(); }
    // ataque: toque = leve; segurar = carrega o pesado
    const busy = this.pending || this.dodge || G.combat.cooldown > 0;
    if (!this.blocking && inp.mouse.leftPressed && !busy) { this.holdT = 0; this.charging = false; }
    if (this.holdT >= 0) {
      if (inp.mouse.left) {
        this.holdT += dt;
        if (this.holdT >= MELEE.heavy.minHold && !this.charging && this.stamina >= MELEE.heavy.cost * 0.6) this.charging = true;
      } else {
        const t = this.holdT; this.holdT = -1;
        if (this.charging) { this.charging = false; this.attack(true, clamp((t - MELEE.heavy.minHold) / MELEE.heavy.maxCharge, 0, 1)); }
        else this.attack(false, 0);
      }
    }
    pl.speedMul = this.blocking ? 0.45 : this.charging ? 0.55 : 1;
  }

  cancelCharge() { this.holdT = -1; this.charging = false; }

  attack(heavy, charge) {
    const G = this.G, w = this.weapon, pl = G.player;
    if (!w || G.combat.durability[w.id] <= 0) { if (w) G.hud.msg(`${w.nome} está quebrada`); return; }
    const cfg = heavy ? MELEE.heavy : MELEE.light;
    if (this.stamina < cfg.cost * 0.4) { this.say(pl, 'SEM FÔLEGO', '#9fb4c8'); return; }
    this.spend(cfg.cost);
    const step = heavy ? 0 : this.combo;
    const mult = heavy ? MELEE.heavy.mult[0] + (MELEE.heavy.mult[1] - MELEE.heavy.mult[0]) * charge : MELEE.light.combo[step];
    const finisher = !heavy && step === 2;
    this.combo = heavy ? 0 : (step + 1) % 3; this.comboT = MELEE.light.window;
    // golpes rápidos; o combo alterna corte direita/revés e fecha com um final variado
    const dur = heavy ? clamp(w.rate * 0.95, 0.38, 0.55) : clamp(w.rate * (finisher ? 0.7 : 0.58), 0.2, 0.38);
    G.combat.cooldown = dur * (heavy ? 1.0 : 0.82);
    G.combat.swing = G.combat.swingDuration = dur;
    const [fx, fz] = pl.forward(); pl.yaw = Math.atan2(fx, fz);
    const pick = (l) => l[(Math.random() * l.length) | 0];
    const pose = heavy ? pick(['slam', 'spin']) : finisher ? pick(['thrust', 'uppercut', 'spin']) : step === 0 ? 'slashR' : 'slashL';
    const style = heavy ? (pose === 'spin' ? 'slashA' : 'overhead') : finisher ? (pose === 'thrust' ? 'stab' : 'overhead') : step === 0 ? 'slashA' : 'slashB';
    let impact = dur * (pose === 'spin' ? 0.55 : 0.4);
    if (pl.firstPerson && G.viewmodel) impact = G.viewmodel.onSwing(w, style, dur) * G.viewmodel.strikeFraction(w);
    this.swingPose = { heavy, pose, t: 0, dur };
    if (!heavy) { const [lx, lz] = pl.forward(); pl.body.vel.x += lx * 2.2; pl.body.vel.z += lz * 2.2; } // passinho à frente no golpe
    this.pending = { w, heavy, mult, finisher, t: impact, knock: heavy ? MELEE.heavy.knock : MELEE.light.knock[step] };
    G.combat._useDurability(w);
  }

  // Aplica o golpe do jogador nos inimigos no arco à frente.
  strike({ w, heavy, mult, finisher, knock }) {
    const G = this.G, pl = G.player, p = pl.body.pos;
    const [fx, fz] = pl.forward();
    const spin = this.swingPose && this.swingPose.pose === 'spin';
    const range = w.range * (heavy ? 1.2 : finisher ? 1.1 : 1), arc = spin ? -1.01 : heavy ? -0.1 : 0.25;
    let hits = 0;
    for (const e of G.enemies.list) {
      if (e.state === 'dead') continue;
      const dx = e.body.pos.x - p.x, dz = e.body.pos.z - p.z, d = Math.hypot(dx, dz) || 1;
      if (d > range + 0.3 || Math.abs(e.body.pos.y - p.y) > 2 || (d > 0.8 && (dx * fx + dz * fz) / d < arc)) continue;
      const ms = e.m || (e.m = { state: 'idle', t: 0 });
      if (ms.state === 'evade') { this.say(e.body.pos, 'DESVIOU', '#c8d2da'); continue; }
      hits++;
      let dmg = w.dmg * mult, label = null, color = '#ffffff';
      const front = ((p.x - e.body.pos.x) * Math.sin(e.yaw) + (p.z - e.body.pos.z) * Math.cos(e.yaw)) / d > 0.3;
      if (ms.state === 'stagger') { dmg *= MELEE.crit; label = 'CRÍTICO'; color = '#ffb347'; }
      else if (ms.state === 'guard' && front) {
        if (heavy) { this.staggerEnemy(e, 1.1); label = 'GUARDA QUEBRADA'; color = '#ffd166'; dmg *= 0.8; }
        else { dmg *= 0.15; label = 'DEFENDEU'; color = '#8fd3ff'; knock *= 0.3; }
      } else if ((heavy || finisher) && (ms.state === 'windup')) { this.staggerEnemy(e, 0.7); label = 'INTERROMPIDO'; color = '#ffd166'; }
      G.enemies.damage(e, Math.round(dmg));
      e.knock = { x: dx / d * knock, z: dz / d * knock };
      this.num(e.body.pos, Math.round(dmg), color, label);
    }
    if (hits) {
      G.hitStop = heavy ? 0.1 : finisher ? 0.08 : 0.045;
      if (G.events) G.events.shake = Math.max(G.events.shake, heavy ? 0.35 : 0.12);
      if (G.viewmodel && pl.firstPerson) G.viewmodel.onMeleeHit();
    }
    return hits;
  }

  // ---------- inimigos ----------
  staggerEnemy(e, dur) {
    const ms = e.m || (e.m = {});
    if (ms.token) { this.tokens.delete(e); ms.token = false; }
    Object.assign(ms, { state: 'stagger', t: dur, move: null });
    this.setTell(e, null);
  }

  // Chamado a cada quadro para inimigos de corpo a corpo próximos do jogador.
  // Retorna { pose, progress, hold } — hold = parar de andar.
  enemyTick(e, dt, dist) {
    const G = this.G, ms = e.m || (e.m = { state: 'idle', t: 0 }), def = e.def;
    if (e.knock) {
      e.body.pos.x += e.knock.x * dt; e.body.pos.z += e.knock.z * dt;
      const k = Math.exp(-7 * dt); e.knock.x *= k; e.knock.z *= k;
      if (Math.abs(e.knock.x) + Math.abs(e.knock.z) < 0.05) e.knock = null;
    }
    this.updateStars(e, dt, ms.state === 'stagger');
    ms.t -= dt;
    switch (ms.state) {
      case 'stagger':
        if (ms.t <= 0) ms.state = 'idle';
        return { pose: 'stagger', hold: true };
      case 'guard':
        if (ms.t <= 0) { ms.state = 'idle'; e.cd = Math.min(e.cd, 0.2); }
        return { pose: 'guard', hold: true };
      case 'windup': {
        const p = 1 - ms.t / ms.move.wind;
        this.setTell(e, ms.move, p);
        if (ms.t <= 0) {
          ms.state = 'strike'; ms.t = 0.16; ms.hit = ms.hit || ms.move.hits || 1;
          ms.anim = ms.move.heavy ? 'slam' : LIGHT_POSES[(Math.random() * LIGHT_POSES.length) | 0];
          // investida: o golpe avança em direção ao jogador (recuar um passo não basta)
          const pp = G.player.body.pos, dx = pp.x - e.body.pos.x, dz = pp.z - e.body.pos.z, l = Math.hypot(dx, dz) || 1;
          if (l > 1.1) e.knock = { x: dx / l * MELEE.enemy.lunge, z: dz / l * MELEE.enemy.lunge };
          this.enemyHit(e, ms.move, dist);
        }
        return { pose: ms.move.heavy ? 'heavyWindup' : 'windup', progress: p, hold: true };
      }
      case 'strike': {
        const p = 1 - ms.t / 0.16;
        if (ms.t <= 0) {
          ms.hit--;
          if (ms.hit > 0) { ms.state = 'windup'; ms.t = 0.16; ms.move = { ...ms.move, wind: 0.16 }; } // combo: próximo golpe quase sem aviso
          else { ms.state = 'recover'; ms.hit = 0; ms.t = ms.move.heavy ? MELEE.enemy.heavyRecover : MELEE.enemy.recover; this.setTell(e, null); }
        }
        return { pose: ms.anim || 'slashR', progress: p, hold: true };
      }
      case 'evade':
        if (ms.t <= 0) ms.state = 'idle';
        return { pose: 'sidestep', progress: 1 - ms.t / 0.3, hold: true };
      case 'recover':
        if (ms.t <= 0) {
          ms.state = 'idle'; e.cd = def.cd * (0.45 + Math.random() * 0.45);
          if (ms.token) { this.tokens.delete(e); ms.token = false; }
        }
        return { pose: 'walk', hold: true };
      default: break;
    }
    // ocioso: defende quando o jogador carrega um pesado ou ataca de perto
    const pl = G.player;
    if (dist < 3.2 && (this.charging || (G.combat.swing > 0 && this.pending)) && !ms.guardTried) {
      ms.guardTried = true;
      if (Math.random() < (GUARD_CHANCE[e.type] || 0)) { ms.state = 'guard'; ms.t = 0.8 + Math.random() * 0.5; return { pose: 'guard', hold: true }; }
    }
    if (!this.pending && !this.charging) ms.guardTried = false;
    // desvia do seu golpe que está vindo (pulo lateral)
    if (this.pending && dist < 2.8 && !ms.evadeTried) {
      ms.evadeTried = true;
      if (Math.random() < (EVADE_CHANCE[e.type] || 0)) {
        const pp = pl.body.pos, dx = pp.x - e.body.pos.x, dz = pp.z - e.body.pos.z, l = Math.hypot(dx, dz) || 1, sd = Math.random() < 0.5 ? 1 : -1;
        e.knock = { x: -dz / l * 7 * sd - dx / l * 2, z: dx / l * 7 * sd - dz / l * 2 };
        e.mesh.userData.pill && (e.mesh.userData.pill.userData.rollDir = sd);
        ms.state = 'evade'; ms.t = 0.3;
        return { pose: 'sidestep', progress: 0, hold: true };
      }
    }
    if (!this.pending) ms.evadeTried = false;
    // começa um ataque se estiver perto, sem recarga e com "vaga" (no máximo N atacando juntos)
    if (!pl.dead && !pl.downed && dist < def.range + 0.4 && e.cd <= 0 && (this.tokens.size < MELEE.tokens || ms.token)) {
      const moves = MOVES[e.type] || MOVES.melee, total = moves.reduce((s, m) => s + m.w, 0);
      let r = Math.random() * total, move = moves[0];
      for (const m of moves) { r -= m.w; if (r <= 0) { move = m; break; } }
      ms.state = 'windup'; ms.t = move.wind; ms.move = move; ms.hit = 0; ms.token = true; this.tokens.add(e);
      return { pose: move.heavy ? 'heavyWindup' : 'windup', progress: 0, hold: true };
    }
    return null; // segue a IA normal (perseguir/rodear)
  }

  enemyHit(e, move, dist) {
    const G = this.G, pl = G.player, pp = pl.body.pos, p = e.body.pos;
    const d = Math.hypot(pp.x - p.x, pp.z - p.z);
    const reach = move.aoe || e.def.range + 0.5;
    if (pl.dead || pl.downed || d > reach || Math.abs(pp.y - p.y) > 1.8) { this.say(e.body.pos, 'ERROU', '#c8d2da'); return; }
    // golpe direcional: só acerta quem está na frente (exceto a pancada em área)
    if (!move.aoe && d > 0.6 && ((pp.x - p.x) * Math.sin(e.yaw) + (pp.z - p.z) * Math.cos(e.yaw)) / d < 0.25) { this.say(e.body.pos, 'ERROU', '#c8d2da'); return; }
    this.incoming(e.def.dmg * move.mult, e.def.nome, e, !!move.heavy);
  }

  // Dano corpo a corpo chegando no jogador: esquiva, parry, bloqueio ou dano cheio.
  incoming(dmg, source, attacker, heavy) {
    const G = this.G, pl = G.player, pp = pl.body.pos;
    if (this.iframes > 0) { this.say(pp, 'ESQUIVOU', '#8fffb0'); return; }
    if (this.blocking && attacker) {
      const [fx, fz] = pl.forward(), ax = attacker.body.pos.x - pp.x, az = attacker.body.pos.z - pp.z, l = Math.hypot(ax, az) || 1;
      if ((ax * fx + az * fz) / l > MELEE.block.arc) {
        if (this.blockT <= MELEE.block.parry * (heavy ? 0.7 : 1)) { // PARRY
          this.staggerEnemy(attacker, heavy ? 1.8 : 1.4);
          attacker.knock = { x: ax / l * 4, z: az / l * 4 };
          this.stamina = Math.min(MELEE.stamina.max, this.stamina + 15);
          this.say(attacker.body.pos, 'PARRY!', '#ffe14d', true);
          G.hitStop = 0.16;
          this.parryAnim = { t: 0, dur: 0.3 };
          this.sparks(new THREE.Vector3((pp.x + attacker.body.pos.x) / 2, pp.y + 1.3, (pp.z + attacker.body.pos.z) / 2), 26);
          if (G.viewmodel && pl.firstPerson && this.weapon) G.viewmodel.onSwing(this.weapon, 'parry', 0.28);
          return;
        }
        this.spend(MELEE.block.cost * (heavy ? 2 : 1));
        if (this.stamina <= 0) { // guarda quebrada: atordoado e toma metade
          this.stunT = 0.9; this.blocking = false;
          this.say(pp, 'GUARDA QUEBRADA', '#ff8a5c', true);
          G.survival.damage(dmg * 0.5, source);
          return;
        }
        this.say(pp, 'BLOQUEOU', '#8fd3ff');
        this.sparks(new THREE.Vector3(pp.x + ax / l * 0.6, pp.y + 1.3, pp.z + az / l * 0.6), 10);
        G.survival.damage(dmg * (heavy ? MELEE.block.heavyMult : MELEE.block.mult), source);
        G.hitStop = 0.05;
        return;
      }
    }
    G.survival.damage(dmg, source);
    if (heavy) { // pancada pesada empurra o jogador
      const ax = pp.x - attacker.body.pos.x, az = pp.z - attacker.body.pos.z, l = Math.hypot(ax, az) || 1;
      pl.body.vel.x += ax / l * 6; pl.body.vel.z += az / l * 6; pl.body.vel.y = 4; pl.body.grounded = false;
    }
  }

  // Aviso do golpe: luva brilhando (vermelho = leve, amarelo = pesado) + "!" sobre a cabeça.
  setTell(e, move, p = 0) {
    const pill = e.mesh.userData.pill;
    if (!e.tell) {
      e.tell = new THREE.Sprite(new THREE.SpriteMaterial({ map: bang('!', '#ff3b2b'), depthTest: false, transparent: true }));
      e.tell.scale.setScalar(0.3); e.tell.position.y = 2.2; e.tell.renderOrder = 10; e.mesh.add(e.tell);
      e.gloveMats = pill && pill.userData.parts.gloveMat ? [pill.userData.parts.gloveMat] : [];
    }
    if (!move) { e.tell.visible = false; for (const m of e.gloveMats) m.emissive && m.emissive.setRGB(0, 0, 0); return; }
    e.tell.visible = true;
    e.tell.material.map = bang(move.heavy ? '!!' : '!', move.heavy ? '#ffd23f' : '#ff3b2b');
    e.tell.scale.setScalar(0.26 + p * 0.1 + Math.sin(p * 30) * 0.02); // ícone discreto
    const k = 0.3 + p * 0.9;
    for (const m of e.gloveMats) if (m.emissive) m.emissive.setRGB(k, move.heavy ? k * 0.75 : k * 0.08, 0);
  }

  updateStars(e, dt, on) {
    if (!on && !e.stars) return;
    if (!e.stars) {
      e.stars = new THREE.Group(); e.stars.position.y = 2.25;
      for (let i = 0; i < 3; i++) {
        const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: star(), depthTest: false, transparent: true }));
        s.scale.setScalar(0.28); s.renderOrder = 10; e.stars.add(s);
      }
      e.mesh.add(e.stars);
    }
    e.stars.visible = on;
    if (!on) return;
    e.starA = (e.starA || 0) + dt * 5;
    e.stars.children.forEach((s, i) => { const a = e.starA + i * 2.094; s.position.set(Math.cos(a) * 0.45, Math.sin(a * 2) * 0.05, Math.sin(a) * 0.45); });
  }

  // ---------- faíscas (parry/bloqueio) ----------
  sparks(pos, n) {
    if (!this.sparkPts) {
      const N = 64, g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
      this.sparkPts = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xffd27a, size: 0.09, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
      this.sparkPts.frustumCulled = false; this.G.scene.add(this.sparkPts);
      this.sparkData = Array.from({ length: N }, () => ({ p: new THREE.Vector3(0, -999, 0), v: new THREE.Vector3(), life: 0 }));
      this.sparkI = 0;
    }
    for (let i = 0; i < n; i++) {
      const s = this.sparkData[this.sparkI++ % this.sparkData.length];
      s.p.copy(pos); s.v.set((Math.random() - 0.5) * 9, Math.random() * 6, (Math.random() - 0.5) * 9); s.life = 0.25 + Math.random() * 0.2;
    }
  }
  updateSparks(dt) {
    if (this.parryAnim) { this.parryAnim.t += dt; if (this.parryAnim.t >= this.parryAnim.dur) this.parryAnim = null; }
    if (!this.sparkPts) return;
    const a = this.sparkPts.geometry.attributes.position.array;
    this.sparkData.forEach((s, i) => {
      if (s.life > 0) { s.life -= dt; s.v.y -= 18 * dt; s.p.addScaledVector(s.v, dt); if (s.life <= 0) s.p.y = -999; }
      a[i * 3] = s.p.x; a[i * 3 + 1] = s.p.y; a[i * 3 + 2] = s.p.z;
    });
    this.sparkPts.geometry.attributes.position.needsUpdate = true;
  }

  // ---------- números de dano / avisos ----------
  num(pos, value, color, label) { this.say(pos, label ? `${value} ${label}` : String(value), color, !!label); }
  say(pos, text, color, big = false) {
    if (!this.numLayer) return;
    const el = document.createElement('div');
    el.className = 'dmg' + (big ? ' big' : ''); el.textContent = text; el.style.color = color;
    this.numLayer.appendChild(el);
    // empilha avisos que saem quase juntos no mesmo lugar (não se sobrepõem)
    const near = this.nums.filter((n) => n.t < 0.5 && Math.abs(n.pos.x - pos.x) + Math.abs(n.pos.z - pos.z) < 1.5).length;
    this.nums.push({ el, pos: new THREE.Vector3(pos.x + (Math.random() - 0.5) * 0.5, pos.y + 2.1 + near * 0.42, pos.z), t: 0 });
    while (this.nums.length > 24) this.nums.shift().el.remove();
  }
  updateNums(dt) {
    const cam = this.G.camera, v = new THREE.Vector3();
    for (let i = this.nums.length - 1; i >= 0; i--) {
      const n = this.nums[i]; n.t += dt; n.pos.y += dt * 0.9;
      v.copy(n.pos).project(cam);
      const show = v.z < 1 && n.t < 1.1;
      n.el.style.display = show ? '' : 'none';
      if (show) {
        n.el.style.transform = `translate(${(v.x * 0.5 + 0.5) * innerWidth}px, ${(-v.y * 0.5 + 0.5) * innerHeight}px) translate(-50%, -50%) scale(${1 + Math.max(0, 0.25 - n.t) * 2})`;
        n.el.style.opacity = String(Math.min(1, (1.1 - n.t) * 3));
      }
      if (n.t >= 1.1) { n.el.remove(); this.nums.splice(i, 1); }
    }
  }
}

