// Combate corpo a corpo entre jogador e inimigos.
// Jogador: golpe leve (sai no clique, combo de 3, cliques guardados emendam), pesado (segurar o clique
// depois do leve e soltar), bloqueio (botão direito; bloquear antes do impacto = finta), parry
// (bloquear no instante do golpe), chute que quebra a guarda, esquiva com invencibilidade.
// Espada com espada: acertar enquanto o inimigo também está golpeando faz as lâminas se chocarem.
// Inimigos: avisam antes de bater (luva brilhando + "!"/"!!"), golpeiam e ficam vulneráveis;
// alguns defendem, todos podem ficar atordoados; rodeiam o jogador, só 1 ataca por vez e os demais esperam a vez mais afastados.
import * as THREE from '../three.js';
import { clamp } from '../core/util.js';
import { sfx, setListener } from '../core/sfx.js';

export const MELEE = {
  stamina: { max: 100, regen: 30, delay: 0.7 },
  light: { cost: 11, combo: [1, 1.15, 1.6], window: 0.8, knock: [1.3, 1.5, 3.2], recover: 0.14, finisherRecover: 0.32 }, // recover: respiro depois do golpe (sem spam)
  heavy: { cost: 22, minHold: 0.24, maxCharge: 0.7, mult: [1.7, 2.6], knock: 4.2 },
  block: { mult: 0.2, heavyMult: 0.5, cost: 14, parry: 0.18, arc: 0.3 },
  dodge: { cost: 20, speed: 10, dur: 0.34, iframes: 0.28, cd: 0.5 }, // arranque que desacelera (~1,9 m)
  kick: { cost: 14, dur: 0.42, range: 1.8, dmg: 5, knock: 4, breakStun: 1.3 }, // chute quebra-guarda
  clash: { window: 0.14, recover: 0.42, guard: [1.4, 2.4] }, // depois do choque o inimigo fica em guarda (s)
  guardBreak: 4,                              // pesado na guarda: atordoado esse tempo (s)     // espadas se chocando: janela antes do golpe dele e recuo
  enemy: { recover: 0.32, heavyRecover: 0.6, lunge: 3.6, evade: 0.16 }, // ritmo dos inimigos
  crit: 2.2,
  swim: { drain: 5, idle: 2.5, dps: 4 },        // nadando: estamina/s (nadando / boiando parado) e vida/s sem fôlego
  tokens: 1,                                  // quantos inimigos podem atacar ao mesmo tempo
  tokenGap: [0.35, 0.8],                      // respiro (s) depois de um ataque antes do próximo inimigo começar
};

// Repertório por tipo: wind = aviso (s), hits = golpes seguidos, heavy = pancada pesada.
const MOVES = {
  melee: [{ wind: 0.36, mult: 1, w: 3 }, { wind: 0.3, mult: 0.85, hits: 2, w: 2 }, { wind: 0.62, mult: 1.9, heavy: true, w: 1 }, { wind: 0.42, mult: 0.5, kick: true, w: 1 }],
  rapido: [{ wind: 0.24, mult: 0.8, hits: 3, w: 3 }, { wind: 0.36, mult: 1.3, w: 1 }],
  pesado: [{ wind: 0.75, mult: 1.6, heavy: true, aoe: 3.0, w: 2 }, { wind: 0.42, mult: 0.9, w: 1 }, { wind: 0.5, mult: 0.6, kick: true, w: 1 }],
  escafandrista: [{ wind: 0.75, mult: 1.5, heavy: true, aoe: 3.2, w: 2 }, { wind: 0.45, mult: 0.9, hits: 2, w: 2 }, { wind: 0.5, mult: 0.6, kick: true, w: 1 }],
  lanceiro: [{ wind: 0.45, mult: 1, w: 3 }, { wind: 0.35, mult: 0.8, hits: 2, w: 2 }, { wind: 0.7, mult: 1.6, heavy: true, w: 1 }], // estocadas de longe
  esquivo: [{ wind: 0.26, mult: 0.9, hits: 2, w: 3 }, { wind: 0.4, mult: 0.5, kick: true, w: 1 }],
  duelista: [{ wind: 0.3, mult: 1, hits: 2, w: 3 }, { wind: 0.26, mult: 0.9, hits: 3, w: 2 }, { wind: 0.55, mult: 1.6, heavy: true, w: 1 }],
  pirata: [{ wind: 0.32, mult: 1, hits: 2, w: 3 }, { wind: 0.28, mult: 0.9, hits: 3, w: 1 }, { wind: 0.6, mult: 1.8, heavy: true, w: 1 }, { wind: 0.4, mult: 0.5, kick: true, w: 1.5 }],
};
const LIGHT_POSES = ['slashR', 'slashL', 'thrust', 'uppercut'];
const GUARD_CHANCE = { lanceiro: 0.3, esquivo: 0.1, duelista: 0.45, melee: 0.4, pesado: 0.45, pirata: 0.5, rapido: 0.15, fantasma: 0.35, escafandrista: 0.35 };
const RIPOSTE_CHANCE = { lanceiro: 0.2, esquivo: 0.3, duelista: 0.7, melee: 0.3, pesado: 0.15, pirata: 0.55, rapido: 0.2, escafandrista: 0.2 }; // contra-ataque depois de defender
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
    this.holdT = 0; this.charging = false; this.holdArmed = false;
    this.buffer = 0;              // clique guardado: sai assim que o golpe atual terminar
    this.blocking = false; this.blockT = 0;
    this.dodge = null; this.iframes = 0; this.dodgeCd = 0;
    this.stunT = 0;
    this.pending = null;          // golpe do jogador esperando o momento do impacto
    this.swingPose = null;        // pose de 3ª pessoa do golpe atual
    this.tokens = new Set();
    this.nums = [];
    this.numLayer = document.getElementById('dmgNums');
    setListener(G.camera);
  }

  get weapon() { const w = this.G.combat.weapon; return w && w.melee ? w : null; }
  spend(n) { this.stamina = Math.max(0, this.stamina - n * (this.G.survival ? this.G.survival.staminaMul : 1)); this.stamDelay = MELEE.stamina.delay; }

  // Nadar cansa: a estamina desce (e não volta) enquanto está na água. Sem fôlego, a vida cai aos
  // poucos (afogamento) — cair da jangada é perigoso de verdade.
  swimTick(dt) {
    const G = this.G, pl = G.player, S = MELEE.swim;
    if (!G.started || !pl.swimming || pl.dead || pl.downed) { this.drownT = 0; this.swimWarn = 0; return; }
    const moving = Math.hypot(pl.body.vel.x, pl.body.vel.z) > 0.6;
    this.stamina = Math.max(0, this.stamina - (moving ? S.drain : S.idle) * (G.survival ? G.survival.staminaMul : 1) * dt);
    this.stamDelay = Math.max(this.stamDelay, 0.5); // não recupera dentro d'água
    if (this.stamina < 35 && this.swimWarn < 1) { this.swimWarn = 1; G.hud.msg('Você está cansando na água — volte para a jangada!'); }
    if (this.stamina > 0) { this.drownT = 0; return; }
    if (this.swimWarn < 2) { this.swimWarn = 2; G.hud.msg('Sem fôlego! Você está se afogando'); }
    this.drownT = (this.drownT || 0) + dt;
    if (this.drownT >= 1) { this.drownT -= 1; G.survival.damage(S.dps, 'Afogamento'); }
  }

  // ---------- jogador ----------
  update(dt) {
    const G = this.G, inp = G.input, pl = G.player, w = this.weapon;
    if (this.stamDelay > 0) this.stamDelay -= dt;
    else this.stamina = Math.min(MELEE.stamina.max, this.stamina + MELEE.stamina.regen * dt * (this.blocking ? 0.35 : 1));
    this.swimTick(dt);
    this.comboT -= dt; if (this.comboT <= 0) this.combo = 0;
    this.iframes = Math.max(0, this.iframes - dt);
    this.dodgeCd = Math.max(0, this.dodgeCd - dt);
    this.stunT = Math.max(0, this.stunT - dt);
    this.buffer = Math.max(0, this.buffer - dt);
    if (this.dodge) { this.dodge.t += dt; if (this.dodge.t >= MELEE.dodge.dur) this.dodge = null; }
    this.updateNums(dt);

    const free = !G.build.active && !(G.naval && G.naval.manning) && !(G.tools && G.tools.menuOpen) && !G.interact.lootOpen && !pl.dead && !pl.downed && !pl.mantle && !pl.swimming && !(G.gfxMenu && G.gfxMenu.open) && !(G.keysMenu && G.keysMenu.open) && !G.bench;
    // esquiva (com qualquer arma) — cancela o golpe que ainda não acertou (finta) e a recuperação
    if (free && inp.act('dodge') && !this.dodge && this.dodgeCd <= 0 && this.stunT <= 0 && this.stamina >= MELEE.dodge.cost * 0.5) {
      this.spend(MELEE.dodge.cost);
      const [fx, fz] = pl.forward(), rx = Math.cos(pl.camYaw), rz = -Math.sin(pl.camYaw);
      const f = (inp.held('forward') ? 1 : 0) - (inp.held('back') ? 1 : 0), sd = (inp.held('right') ? 1 : 0) - (inp.held('left') ? 1 : 0);
      let dx = fx * f + rx * sd, dz = fz * f + rz * sd;
      if (!dx && !dz) { dx = -fx; dz = -fz; } // parado: pula para trás
      const l = Math.hypot(dx, dz); dx /= l; dz /= l;
      // cambalhota para frente/trás, passo lateral para os lados
      const along = dx * fx + dz * fz, side = dx * rx + dz * rz;
      const anim = Math.abs(along) >= Math.abs(side) ? 'roll' : 'sidestep';
      this.dodge = { vx: dx * MELEE.dodge.speed, vz: dz * MELEE.dodge.speed, t: 0, dur: MELEE.dodge.dur, anim, dir: anim === 'roll' ? Math.sign(along) || -1 : -Math.sign(side) || 1, side };
      this.iframes = MELEE.dodge.iframes; this.dodgeCd = MELEE.dodge.cd;
      this.cancelCharge(); this.pending = null; G.combat.cooldown = 0; this.buffer = 0;
      if (G.viewmodel && pl.firstPerson) G.viewmodel.springs.kickRx.kick(1.5);
    }
    pl.dash = this.dodge;
    // carga máxima do pesado: brilho de faíscas na arma + som curto (solta agora!)
    if (this.charging && !this.chargeFull && this.holdT >= MELEE.heavy.maxCharge) {
      this.chargeFull = true;
      const [fx, fz] = pl.forward(), p = pl.body.pos;
      const at = new THREE.Vector3(p.x + fx * 0.35 + fz * 0.25, p.y + 1.75, p.z + fz * 0.35 - fx * 0.25);
      sfx.block(at);
      if (pl.firstPerson) { if (G.viewmodel) G.viewmodel.springs.kickRx.kick(-0.8); } // em 1ª pessoa as faíscas ficariam na cara da câmera
      else this.sparks(at, 10);
      if (G.events) G.events.shake = Math.max(G.events.shake, 0.06);
    }
    if (!this.charging) this.chargeFull = false;

    // pancada do jogador no momento certo da animação
    if (this.pending) {
      this.pending.t -= dt;
      if (this.pending.t <= 0) { const p = this.pending; this.pending = null; if (p.kick) this.kickStrike(); else this.strike(p); }
    }
    if (this.swingPose) { this.swingPose.t += dt; if (this.swingPose.t >= this.swingPose.dur) this.swingPose = null; }
    this.updateSparks(dt);

    if (!w || !free || this.stunT > 0) { this.blocking = false; this.cancelCharge(); pl.speedMul = this.stunT > 0 ? 0.3 : G.combat.weaponId === 'minigun' ? 0.72 : 1; return; } // minigun é pesada
    const ready = !this.pending && !this.dodge && G.combat.cooldown <= 0;
    // bloqueio (segurar mirar/bloquear). Bloquear antes do impacto cancela o próprio golpe (finta).
    const wantBlock = inp.mouse.right && !this.dodge && this.stamina > 0;
    if (wantBlock && this.pending && !this.pending.kick && this.pending.t > 0.03) {
      this.pending = null; this.swingPose = null; G.combat.cooldown = 0.12; this.spend(5);
      if (G.viewmodel) G.viewmodel.swingDur = 0;
      this.say(pl.body.pos, 'FINTA', '#c8d2da');
    }
    if (wantBlock && !this.blocking) this.blockT = 0;
    this.blocking = wantBlock && !this.pending;
    if (this.blocking) { this.blockT += dt; this.cancelCharge(); this.buffer = 0; }
    // chute: quebra a guarda de quem está defendendo
    if (!this.blocking && inp.act('kick') && ready) this.kick();
    // ataque: o clique já golpeia (sem esperar soltar). Clicar durante um golpe guarda o próximo
    // do combo. Segurar o botão depois do golpe leve carrega o pesado; soltar descarrega.
    if (!this.blocking) {
      if (inp.mouse.leftPressed) this.buffer = 0.34;
      if (this.charging) {
        this.holdT += dt;
        if (!inp.mouse.left) { this.charging = false; this.attack(true, clamp(this.holdT / MELEE.heavy.maxCharge, 0, 1)); this.holdT = 0; }
      } else if (this.buffer > 0 && ready) {
        this.buffer = 0; this.attack(false, 0);
        this.holdArmed = inp.mouse.left; this.holdT = 0;
      } else if (this.holdArmed) {
        if (!inp.mouse.left) this.holdArmed = false;
        else if ((this.holdT += dt) >= MELEE.heavy.minHold && ready && this.stamina >= MELEE.heavy.cost * 0.6) {
          this.holdArmed = false; this.charging = true; this.holdT = 0;
        }
      }
    }
    pl.speedMul = this.blocking ? 0.45 : this.charging ? 0.55 : 1;
  }

  cancelCharge() { this.holdT = 0; this.charging = false; this.holdArmed = false; }

  attack(heavy, charge) {
    const G = this.G, w = this.weapon, pl = G.player;
    if (!w) return;
    const cfg = heavy ? MELEE.heavy : MELEE.light;
    if (this.stamina < cfg.cost * 0.4) { this.say(pl.body.pos, 'SEM FÔLEGO', '#9fb4c8'); return; }
    this.spend(cfg.cost);
    const step = heavy ? 0 : this.combo;
    const mult = heavy ? MELEE.heavy.mult[0] + (MELEE.heavy.mult[1] - MELEE.heavy.mult[0]) * charge : MELEE.light.combo[step];
    const finisher = !heavy && step === 2;
    this.combo = heavy ? 0 : (step + 1) % 3; this.comboT = MELEE.light.window;
    // golpes rápidos; o combo alterna corte direita/revés e fecha com um final variado
    // golpe com um leve atraso (peso da arma): o leve leva ~0,3 s e o impacto vem perto da metade
    const dur = heavy ? clamp(w.rate * 1.05, 0.42, 0.6) : clamp(w.rate * (finisher ? 0.82 : 0.68), 0.27, 0.44);
    const pick = (l) => l[(Math.random() * l.length) | 0];
    let pose = heavy ? 'heavyStrike' : finisher ? pick(['thrust', 'uppercut', 'spin']) : step === 0 ? 'slashR' : 'slashL';
    if (w.tool === 'martelo') pose = heavy ? 'slam' : 'hammer'; // martelo: marteladas de cima para baixo
    const style = heavy ? (pose === 'slam' ? 'overhead' : 'heavy') : finisher ? (pose === 'thrust' ? 'stab' : 'overhead') : step === 0 ? 'slashA' : 'slashB';
    let impact = dur * (pose === 'spin' ? 0.55 : pose === 'heavyStrike' ? 0.42 : 0.4);
    if (pl.firstPerson && G.viewmodel) impact = G.viewmodel.onSwing(w, style, dur) * G.viewmodel.strikeFraction(w);
    G.combat.swing = G.combat.swingDuration = dur;
    // pode emendar o próximo golpe logo depois do impacto (o resto da animação é cancelável)
    // o próximo golpe só sai depois da animação inteira + um respiro (o final do combo segura mais)
    G.combat.cooldown = heavy ? Math.max(impact + 0.06, dur * 0.9) : dur * 0.95 + (finisher ? MELEE.light.finisherRecover : MELEE.light.recover);
    const [fx, fz] = pl.forward(); pl.yaw = Math.atan2(fx, fz);
    this.swingPose = { heavy, pose, t: 0, dur };
    if (!heavy) { pl.body.vel.x += fx * 2.2; pl.body.vel.z += fz * 2.2; } // passinho à frente no golpe
    else { pl.body.vel.x += fx * 3.5; pl.body.vel.z += fz * 3.5; }
    this.pending = { w, heavy, mult, finisher, t: impact, knock: heavy ? MELEE.heavy.knock : MELEE.light.knock[step] };
    sfx.swing(pl.body.pos, heavy);
    G.combat._useDurability(w);
  }

  kick() {
    const G = this.G, pl = G.player, k = MELEE.kick;
    if (this.stamina < k.cost * 0.5) { this.say(pl.body.pos, 'SEM FÔLEGO', '#9fb4c8'); return; }
    this.spend(k.cost); this.cancelCharge(); this.buffer = 0;
    const [fx, fz] = pl.forward(); pl.yaw = Math.atan2(fx, fz);
    this.swingPose = { pose: 'kick', t: 0, dur: k.dur };
    this.pending = { kick: true, t: k.dur * 0.42 };
    G.combat.cooldown = k.dur * 0.85;
    pl.body.vel.x += fx * 1.5; pl.body.vel.z += fz * 1.5;
    if (G.viewmodel && pl.firstPerson) G.viewmodel.onKick(k.dur);
  }

  // Alvos no arco à frente do jogador.
  targets(range, arc) {
    const G = this.G, p = G.player.body.pos, [fx, fz] = G.player.forward(), out = [];
    for (const e of G.enemies.list) {
      if (e.state === 'dead') continue;
      const dx = e.body.pos.x - p.x, dz = e.body.pos.z - p.z, d = Math.hypot(dx, dz) || 1;
      if (d - (e.def.hitR || 0) > range + 0.3 || Math.abs(e.body.pos.y - p.y) > 2.4 || (d > 0.8 && (dx * fx + dz * fz) / d < arc)) continue;
      if (G.colliders.segmentBlocked(p.x, p.y + 1.0, p.z, e.body.pos.x, e.body.pos.y + 1.0, e.body.pos.z)) continue; // não bate através da parede
      const front = ((p.x - e.body.pos.x) * Math.sin(e.yaw) + (p.z - e.body.pos.z) * Math.cos(e.yaw)) / d > 0.3;
      out.push({ e, dx, dz, d, front, ms: e.m || (e.m = { state: 'idle', t: 0 }) });
    }
    return out;
  }

  kickStrike() {
    const G = this.G, k = MELEE.kick;
    let hits = 0;
    for (const { e, dx, dz, d, front, ms } of this.targets(k.range, 0.3)) {
      hits++;
      let label = 'CHUTE', color = '#ffd166', dmg = k.dmg;
      if (ms.state === 'guard' && front) { this.staggerEnemy(e, k.breakStun); label = 'GUARDA QUEBRADA'; color = '#ffb347'; sfx.guardBreak(e.body.pos); }
      else if (ms.state === 'windup') { this.staggerEnemy(e, 0.6); label = 'INTERROMPIDO'; sfx.kick(e.body.pos); }
      else { if (ms.state !== 'stagger') this.staggerEnemy(e, 0.35); sfx.kick(e.body.pos); }
      G.enemies.damage(e, dmg);
      this.knockEnemy(e, dx / d * k.knock, dz / d * k.knock);
      this.num(e.body.pos, dmg, color, label);
    }
    if (hits) { G.hitStop = 0.07; if (G.events) G.events.shake = Math.max(G.events.shake, 0.2); }
    else sfx.whiff(G.player.body.pos);
  }

  // Aplica o golpe do jogador nos inimigos no arco à frente.
  strike({ w, heavy, mult, finisher, knock }) {
    const G = this.G, pl = G.player, p = pl.body.pos;
    const spin = this.swingPose && this.swingPose.pose === 'spin';
    const range = w.range * (heavy ? 1.2 : finisher ? 1.1 : 1), arc = spin ? -1.01 : heavy ? -0.1 : 0.25;
    let hits = 0, clashed = false;
    for (const t of this.targets(range, arc)) {
      const { e, dx, dz, d, front, ms } = t;
      if (ms.state === 'evade') { this.say(e.body.pos, 'DESVIOU', '#c8d2da'); continue; }
      hits++;
      // espada com espada: bater (leve) enquanto ele está atacando → as lâminas se chocam e ele se defende
      const late = ms.state === 'strike' || (ms.state === 'windup' && ms.move && !ms.move.kick);
      if (late && front && !heavy) {
        clashed = true;
        this.clashEnemy(e, dx / d, dz / d);
        continue;
      }
      let dmg = w.dmg * mult * G.survival.dmgMul, label = null, color = '#ffffff', sound = 'hit';
      if (ms.state === 'stagger') { dmg *= MELEE.crit; label = 'CRÍTICO'; color = '#ffb347'; }
      else if (ms.state === 'clashed') { dmg *= 1.4; label = 'ABERTO'; color = '#ffe9a8'; }
      else if (ms.state === 'guard' && front) {
        if (heavy) { this.staggerEnemy(e, MELEE.guardBreak); label = 'GUARDA QUEBRADA'; color = '#ffd166'; dmg *= 0.8; sound = 'break'; } // ataque potente abre a guarda por ~4 s
        else {
          dmg *= 0.1; label = 'DEFENDEU'; color = '#8fd3ff'; knock *= 0.3; sound = 'block';
          // pirata que defende responde rápido (riposta) — use o chute para abrir a guarda
          if (Math.random() < (RIPOSTE_CHANCE[e.type] || 0)) { ms.riposte = true; ms.t = Math.min(ms.t, 0.12); }
          else ms.t = Math.max(ms.t, 0.5); // e segura a guarda mais um pouco
        }
      } else if (ms.state === 'windup' && (heavy || finisher || (ms.move && ms.move.kick) || ms.t > (ms.move ? ms.move.wind * 0.5 : 0))) {
        this.staggerEnemy(e, heavy ? 0.9 : 0.45); label = 'INTERROMPIDO'; color = '#ffd166';
      } else if (ms.state === 'idle' || ms.state === 'recover') {
        ms.flinch = 0.16; // leve tranco: o golpe "pega" e ele perde o tempo do próximo ataque
        e.cd = Math.max(e.cd, 0.35);
      }
      const at = new THREE.Vector3(e.body.pos.x - dx / d * 0.3, e.body.pos.y + 1.2, e.body.pos.z - dz / d * 0.3);
      if (sound === 'block') { sfx.block(at); this.sparks(at, 8); }
      else if (sound === 'break') sfx.guardBreak(at);
      else sfx.hit(at, heavy || finisher);
      G.enemies.damage(e, Math.round(dmg));
      this.knockEnemy(e, dx / d * knock, dz / d * knock);
      this.num(e.body.pos, Math.round(dmg), color, label);
    }
    // martelo: martelar uma peça da jangada conserta ela
    if (w.tool === 'martelo' && G.naval && G.naval.hammer()) hits++;
    if (clashed) {
      // o jogador também é empurrado e perde o combo, mas pode emendar logo (ritmo de duelo)
      const [fx, fz] = pl.forward();
      pl.body.vel.x -= fx * 4; pl.body.vel.z -= fz * 4;
      this.combo = 0; G.combat.cooldown = Math.min(G.combat.cooldown, 0.12);
      G.hitStop = 0.09;
      if (G.viewmodel && pl.firstPerson) G.viewmodel.onClash();
      this.swingPose = { pose: 'clash', t: 0, dur: 0.3 };
    } else if (hits) {
      G.hitStop = heavy ? 0.1 : finisher ? 0.08 : 0.045;
      if (G.events) G.events.shake = Math.max(G.events.shake, heavy ? 0.35 : 0.12);
      if (G.viewmodel && pl.firstPerson) G.viewmodel.onMeleeHit();
    }
    return hits;
  }

  clashEnemy(e, nx, nz) {
    const ms = e.m, pp = this.G.player.body.pos;
    if (e.replica) this.G.net.send({ t: 'emod', id: e.id, cl: [Math.round(nx * 100) / 100, Math.round(nz * 100) / 100] });
    if (ms.token) { this.tokens.delete(e); ms.token = false; }
    Object.assign(ms, { state: 'clashed', t: MELEE.clash.recover, move: null, hit: 0 });
    this.setTell(e, null);
    e.knock = { x: nx * 2.8, z: nz * 2.8 };
    const at = new THREE.Vector3((pp.x + e.body.pos.x) / 2, pp.y + 1.35, (pp.z + e.body.pos.z) / 2);
    this.sparks(at, 22); sfx.clash(at);
    this.say(e.body.pos, 'CLANG!', '#ffe9a8', true);
  }

  // ---------- inimigos ----------
  // Empurrão causado pelo jogador local: num inimigo-réplica (multiplayer) o host é que aplica.
  knockEnemy(e, x, z) {
    e.knock = { x, z };
    if (e.replica) this.G.net.send({ t: 'emod', id: e.id, kn: [Math.round(x * 10) / 10, Math.round(z * 10) / 10] });
  }
  // devolve a vez de atacar: o próximo só começa depois de um respiro curto
  releaseToken(e) {
    this.tokens.delete(e); if (e.m) e.m.token = false;
    const [a, b] = MELEE.tokenGap;
    this.gapUntil = performance.now() + (a + Math.random() * (b - a)) * 1000;
  }
  staggerEnemy(e, dur) {
    const ms = e.m || (e.m = {});
    if (e.replica) this.G.net.send({ t: 'emod', id: e.id, st: Math.round(dur * 100) / 100 });
    if (ms.token) { this.tokens.delete(e); ms.token = false; }
    Object.assign(ms, { state: 'stagger', t: dur, move: null, riposte: false, flinch: 0 });
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
        if (ms.t <= 0) {
          ms.state = 'idle'; e.cd = Math.min(e.cd, 0.2);
          if (ms.riposte) { // riposta: devolve o golpe logo depois de defender
            ms.riposte = false;
            ms.state = 'windup'; ms.move = { wind: 0.22, mult: 0.9 }; ms.t = 0.22; ms.hit = 0;
            if (!ms.token) { ms.token = true; this.tokens.add(e); }
            return { pose: 'windup', progress: 0, hold: true };
          }
        }
        return { pose: 'guard', hold: true };
      case 'clashed': // lâminas se chocaram: braço jogado para trás, vulnerável por um instante
        if (ms.t <= 0) { // se recompõe e fecha a guarda: agora só um golpe pesado (ou chute) abre
          const [a, b] = MELEE.clash.guard;
          ms.state = 'guard'; ms.t = a + Math.random() * (b - a); e.cd = Math.max(e.cd, 0.3);
          return { pose: 'guard', hold: true };
        }
        return { pose: 'clash', progress: 1 - ms.t / MELEE.clash.recover, hold: true };
      case 'windup': {
        const p = 1 - ms.t / ms.move.wind;
        this.setTell(e, ms.move, p);
        if (ms.t <= 0) {
          ms.state = 'strike'; ms.t = 0.16; ms.hit = ms.hit || ms.move.hits || 1;
          ms.anim = ms.move.kick ? 'kick' : ms.move.heavy ? 'slam' : LIGHT_POSES[(Math.random() * LIGHT_POSES.length) | 0];
          if (!ms.move.kick) sfx.swing(e.body.pos, !!ms.move.heavy);
          // investida: o golpe avança em direção ao jogador (recuar um passo não basta)
          const pp = (e.tgt && e.tgt.pos) || G.player.body.pos, dx = pp.x - e.body.pos.x, dz = pp.z - e.body.pos.z, l = Math.hypot(dx, dz) || 1;
          if (l > 1.1) e.knock = { x: dx / l * MELEE.enemy.lunge, z: dz / l * MELEE.enemy.lunge };
          this.enemyHit(e, ms.move, dist);
        }
        return ms.move.kick ? { pose: 'kick', progress: p * 0.28, hold: true } : { pose: ms.move.heavy ? 'heavyWindup' : 'windup', progress: p, hold: true };
      }
      case 'strike': {
        const p = 1 - ms.t / 0.16;
        if (ms.anim === 'kick') { // o chute tem a animação inteira dentro do "golpe"
          if (ms.t <= 0) { ms.state = 'recover'; ms.hit = 0; ms.t = MELEE.enemy.recover; this.setTell(e, null); }
          return { pose: 'kick', progress: 0.3 + p * 0.5, hold: true };
        }
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
          if (ms.token) { this.releaseToken(e); }
        }
        return { pose: 'walk', hold: true };
      default: break;
    }
    if (ms.flinch > 0) { ms.flinch -= dt; return { pose: 'stagger', hold: true }; }
    // ocioso: defende quando o jogador carrega um pesado ou ataca de perto
    // alvo do inimigo (jogador local ou aliado); as reações ao seu golpe só valem contra o jogador local
    const pl = e.tgt || G.enemies.localT, mine = pl.local !== false;
    if (mine && dist < 3.2 && (this.charging || (G.combat.swing > 0 && this.pending)) && !ms.guardTried) {
      ms.guardTried = true;
      if (Math.random() < (GUARD_CHANCE[e.type] || 0)) { ms.state = 'guard'; ms.t = 0.8 + Math.random() * 0.5; return { pose: 'guard', hold: true }; }
    }
    if (!this.pending && !this.charging) ms.guardTried = false;
    // desvia do seu golpe que está vindo (pulo lateral)
    if (mine && this.pending && dist < 2.8 && !ms.evadeTried) {
      ms.evadeTried = true;
      const dg = def.dodge, ready = !dg || performance.now() >= (e.dodgeAt || 0); // esquivos: chance alta, mas com recarga
      if (ready && Math.random() < (dg ? dg.chance : EVADE_CHANCE[e.type] || 0)) {
        if (dg) e.dodgeAt = performance.now() + dg.cd * 1000;
        const pp = pl.pos || G.player.body.pos, dx = pp.x - e.body.pos.x, dz = pp.z - e.body.pos.z, l = Math.hypot(dx, dz) || 1, sd = Math.random() < 0.5 ? 1 : -1;
        e.knock = { x: -dz / l * 7 * sd - dx / l * 2, z: dx / l * 7 * sd - dz / l * 2 };
        e.mesh.userData.pill && (e.mesh.userData.pill.userData.rollDir = sd);
        ms.state = 'evade'; ms.t = 0.3;
        return { pose: 'sidestep', progress: 0, hold: true };
      }
    }
    if (!this.pending) ms.evadeTried = false;
    // começa um ataque se estiver perto, sem recarga e com "vaga" (no máximo N atacando juntos)
    // e só quem o diretor de combate deixou chegar perto (os outros esperam a vez mais afastados)
    // vagas contadas por jogador alvo: cada aliado também só apanha de 1 por vez
    const key = pl.key || 'L', busy = [...this.tokens].filter((x) => ((x.tgt && x.tgt.key) || 'L') === key).length;
    // ataque em conjunto (diretor de combate): por um instante 2 podem atacar juntos, sem o respiro entre eles
    const gang = this.gang && performance.now() < (this.gang[key] || 0);
    const free = ms.token || (gang ? busy < 2 : busy < MELEE.tokens && performance.now() >= (this.gapUntil || 0));
    if (!pl.dead && !pl.downed && dist < def.range + 0.4 && e.cd <= 0 && e.los !== false && e.engaged !== false && free) {
      // contra quem fica só defendendo, o chute fica bem mais provável
      const moves = MOVES[e.type] || MOVES.melee, wOf = (m) => m.w * (m.kick && (mine ? this.blocking : pl.guard) ? 4 : 1), total = moves.reduce((s, m) => s + wOf(m), 0);
      let r = Math.random() * total, move = moves[0];
      for (const m of moves) { r -= wOf(m); if (r <= 0) { move = m; break; } }
      ms.state = 'windup'; ms.t = move.wind; ms.move = move; ms.hit = 0; ms.token = true; this.tokens.add(e);
      return { pose: move.heavy ? 'heavyWindup' : move.kick ? 'kick' : 'windup', progress: 0, hold: true };
    }
    return null; // segue a IA normal (perseguir/rodear)
  }

  enemyHit(e, move, dist) {
    const G = this.G, T = e.tgt || G.enemies.localT, pl = T, pp = T.pos || G.player.body.pos, p = e.body.pos;
    const d = Math.hypot(pp.x - p.x, pp.z - p.z);
    const reach = move.aoe || e.def.range + 0.5;
    if (pl.dead || pl.downed || d > reach || Math.abs(pp.y - p.y) > 1.8) { this.say(e.body.pos, 'ERROU', '#c8d2da'); return; }
    if (G.colliders.segmentBlocked(p.x, p.y + 1.0, p.z, pp.x, pp.y + 1.0, pp.z)) { this.say(e.body.pos, 'ERROU', '#c8d2da'); return; } // parede no meio
    // golpe direcional: só acerta quem está na frente (exceto a pancada em área)
    if (!move.aoe && d > 0.6 && ((pp.x - p.x) * Math.sin(e.yaw) + (pp.z - p.z) * Math.cos(e.yaw)) / d < 0.25) { this.say(e.body.pos, 'ERROU', '#c8d2da'); return; }
    if (T.local === false) { // aliado: ele recebe o golpe e se defende (bloqueio/parry/esquiva) do lado dele
      G.enemies.hurt(T, e.def.dmg * move.mult, e.def.nome, e, { k: move.kick ? 'kick' : 'melee', h: move.heavy ? 1 : 0 });
      return;
    }
    if (move.kick) { this.incomingKick(e, e.def.dmg * move.mult); return; }
    this.incoming(e.def.dmg * move.mult, e.def.nome, e, !!move.heavy);
  }

  // Chute do inimigo: atravessa o bloqueio e quebra a guarda. Esquive ou bata nele antes.
  incomingKick(e, dmg) {
    const G = this.G, pl = G.player, pp = pl.body.pos;
    if (this.iframes > 0) { this.say(pp, 'ESQUIVOU', '#8fffb0'); return; }
    const ax = pp.x - e.body.pos.x, az = pp.z - e.body.pos.z, l = Math.hypot(ax, az) || 1;
    if (this.blocking) {
      this.stunT = 0.75; this.blocking = false; this.spend(25);
      this.say(pp, 'GUARDA QUEBRADA', '#ff8a5c', true);
      sfx.guardBreak(pp);
      G.survival.damage(dmg * 0.5, e.def.nome);
    } else { sfx.kick(pp); G.survival.damage(dmg, e.def.nome); }
    pl.body.vel.x += ax / l * 6; pl.body.vel.z += az / l * 6; pl.body.vel.y = 2.5; pl.body.grounded = false;
    G.hitStop = 0.06;
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
          this.knockEnemy(attacker, ax / l * 2.4, az / l * 2.4);
          this.stamina = Math.min(MELEE.stamina.max, this.stamina + 15);
          this.say(attacker.body.pos, 'PARRY!', '#ffe14d', true);
          sfx.parry(pp);
          G.hitStop = 0.16;
          this.parryAnim = { t: 0, dur: 0.42 };
          G.hud.flash('parry'); // borda dourada rápida
          if (G.events) G.events.shake = Math.max(G.events.shake, 0.25);
          this.sparks(new THREE.Vector3((pp.x + attacker.body.pos.x) / 2, pp.y + 1.3, (pp.z + attacker.body.pos.z) / 2), 26);
          if (G.viewmodel && pl.firstPerson && this.weapon) G.viewmodel.onSwing(this.weapon, 'parry', 0.28);
          return;
        }
        this.spend(MELEE.block.cost * (heavy ? 2 : 1));
        if (this.stamina <= 0) { // guarda quebrada: atordoado e toma metade
          this.stunT = 0.9; this.blocking = false;
          this.say(pp, 'GUARDA QUEBRADA', '#ff8a5c', true);
          sfx.guardBreak(pp);
          G.survival.damage(dmg * 0.5, source);
          return;
        }
        this.say(pp, 'BLOQUEOU', '#8fd3ff');
        sfx.block(pp);
        this.sparks(new THREE.Vector3(pp.x + ax / l * 0.6, pp.y + 1.3, pp.z + az / l * 0.6), heavy ? 18 : 10);
        G.survival.damage(dmg * (heavy ? MELEE.block.heavyMult : MELEE.block.mult), source);
        G.hitStop = 0.05;
        // tranco da defesa: a arma é empurrada contra você e você escorrega um passo para trás
        this.blockHit = { t: 0, dur: heavy ? 0.38 : 0.26, heavy: !!heavy };
        pl.body.vel.x -= ax / l * (heavy ? 4.5 : 2.2); pl.body.vel.z -= az / l * (heavy ? 4.5 : 2.2);
        if (G.viewmodel && pl.firstPerson) G.viewmodel.onBlockHit(heavy);
        if (G.events) G.events.shake = Math.max(G.events.shake, heavy ? 0.3 : 0.12);
        return;
      }
    }
    G.survival.damage(dmg, source);
    sfx.hit(pp, heavy);
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
      e.tell.scale.setScalar(0.3); e.tell.position.y = e.mesh.userData.tellY || 2.2; e.tell.renderOrder = 10; e.mesh.add(e.tell);
      e.gloveMats = pill && pill.userData.parts.gloveMat ? [pill.userData.parts.gloveMat] : [];
    }
    if (!move) { e.tell.visible = false; for (const m of e.gloveMats) m.emissive && m.emissive.setRGB(0, 0, 0); return; }
    e.tell.visible = true;
    e.tell.material.map = move.kick ? bang('✋', '#5cc8ff') : bang(move.heavy ? '!!' : '!', move.heavy ? '#ffd23f' : '#ff3b2b');
    e.tell.scale.setScalar(0.26 + p * 0.1 + Math.sin(p * 30) * 0.02); // ícone discreto
    const k = 0.3 + p * 0.9;
    for (const m of e.gloveMats) if (m.emissive) { if (move.kick) m.emissive.setRGB(0, k * 0.5, k); else m.emissive.setRGB(k, move.heavy ? k * 0.75 : k * 0.08, 0); }
  }

  updateStars(e, dt, on) {
    if (!on && !e.stars) return;
    if (!e.stars) {
      e.stars = new THREE.Group(); e.stars.position.y = (e.mesh.userData.tellY || 2.2) + 0.05;
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
    if (this.blockHit) { this.blockHit.t += dt; if (this.blockHit.t >= this.blockHit.dur) this.blockHit = null; }
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

