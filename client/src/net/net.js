// Cliente multiplayer (WebSocket). Sem servidor o jogo roda igual em modo solo.
// Host (primeiro da sala) simula o barco; os outros interpolam. Posições a bordo são
// enviadas em coordenadas locais do barco, então ninguém "escorrega" no convés alheio.
import * as THREE from '../three.js';
import { lerpAngle, setClockOffset } from '../core/util.js';
import { makeHumanoid, animateHumanoid } from '../player/model.js';
import { makePill, animatePill, disposePill, decodePill, encodePill, PILL_SCALE } from '../player/pill.js';

const COLORS = [0xd1a02f, 0x3fae5a, 0xb84fc9, 0xd1552f, 0x2f8fd1, 0xd12f8a];

export class Net {
  constructor(G) {
    this.G = G;
    this.online = false; this.isHost = true; this.id = 'local';
    this.remotes = new Map(); this.acc = 0; this.physicsAcc = 0; this.n = 0; this.ws = null;
  }
  nextId() { return `${this.id}-${Date.now().toString(36)}-${this.n++}`; }
  send(m) { if (this.online && this.ws.readyState === 1) this.ws.send(JSON.stringify(m)); }

  // Consulta rápida da lista de salas (navegador de servidores do menu). Resolve com { rooms, online }.
  static listRooms(url, timeout = 45000) {
    return new Promise((resolve, reject) => {
      let ws, done = false;
      const end = (fn, v) => { if (done) return; done = true; clearTimeout(t); try { ws.close(); } catch { /* ok */ } fn(v); };
      const t = setTimeout(() => end(reject, new Error('Tempo esgotado')), timeout);
      try { ws = new WebSocket(url); } catch { end(reject, new Error('URL inválida')); return; }
      ws.onopen = () => ws.send(JSON.stringify({ t: 'list' }));
      ws.onerror = () => end(reject, new Error('Servidor fora do ar'));
      ws.onmessage = (ev) => { let m; try { m = JSON.parse(ev.data); } catch { return; } if (m.t === 'rooms') end(resolve, m); };
    });
  }

  // opts: { password, create, title, max, seed, mustExist }
  connect(url, name, room, opts = {}) {
    return new Promise((resolve, reject) => {
      let done = false;
      const fail = (why) => { if (!done) { done = true; reject(new Error(why)); } };
      let ws;
      try { ws = new WebSocket(url); } catch { fail('URL inválida ou conexão bloqueada'); return; }
      this.ws = ws;
      const timer = setTimeout(() => { fail('Tempo esgotado'); ws.close(); }, 60000);
      ws.onopen = () => ws.send(JSON.stringify({ t: 'join', name, room, ...opts }));
      ws.onerror = () => fail('Não foi possível conectar');
      ws.onclose = () => {
        clearTimeout(timer); fail('Conexão fechada');
        if (this.online) {
          this.online = false; this.isHost = true;
          for (const r of this.remotes.values()) r.mesh.parent && r.mesh.parent.remove(r.mesh);
          this.remotes.clear();
          this.G.hud.msg('Desconectado do servidor — continuando solo');
        }
      };
      ws.onmessage = (ev) => {
        let m; try { m = JSON.parse(ev.data); } catch { return; }
        if (m.t === 'time') { this._timeReply(m); return; }
        if (m.t === 'welcome') { clearTimeout(timer); done = true; this.id = m.id; this.isHost = m.host === m.id; this.online = true; this._startTimeSync(); resolve(m); }
        else if (m.t === 'full') fail('Sala cheia');
        else if (m.t === 'join-error') { const e = new Error(m.reason || 'Não foi possível entrar'); e.needPassword = !!m.needPassword; if (!done) { done = true; reject(e); } ws.close(); }
        else if (this.G.started) this.handle(m);
      };
    });
  }

  // Acerto de relógio com o servidor (estilo NTP): manda a hora local, o servidor devolve a dele;
  // a amostra com o menor ping é a mais confiável. Repete de tempos em tempos.
  _startTimeSync() {
    this.timeSamples = [];
    clearInterval(this._timeTimer);
    let burst = 0;
    const ping = () => this.send({ t: 'time', c: Date.now() });
    ping();
    this._timeTimer = setInterval(() => {
      if (!this.online) { clearInterval(this._timeTimer); return; }
      if (burst < 6 || (burst % 25) === 0) ping(); // 6 rápidas no começo, depois 1 a cada ~10 s
      burst++;
    }, 400);
  }
  _timeReply(m) {
    const now = Date.now();
    if (!Number.isFinite(m.c) || !Number.isFinite(m.s) || m.c > now) return;
    const rtt = now - m.c, offset = m.s + rtt / 2 - now;
    this.timeSamples = (this.timeSamples || []).concat({ rtt, offset }).slice(-8);
    const best = this.timeSamples.reduce((a, b) => (b.rtt < a.rtt ? b : a));
    this.rtt = best.rtt;
    setClockOffset(best.offset);
  }

  handle(m) {
    const G = this.G;
    switch (m.t) {
      case 'snap': {
        const wasHost = this.isHost;
        this.isHost = m.host === this.id;
        if (this.isHost && !wasHost) G.hud.msg('Você agora é o host');
        if (!this.isHost && m.boat) { G.boat.netTarget = m.boat; G.boat.netAt = performance.now(); }
        for (const id in m.players) {
          if (id === this.id) continue;
          let r = this.remotes.get(id);
          if (!r) {
            const mesh = makeHumanoid(COLORS[this.remotes.size % COLORS.length]);
            r = { mesh, s: m.players[id], yaw: 0, first: true, aboard: false };
            this.remotes.set(id, r); G.scene.add(mesh);
          }
          r.s = m.players[id];
          r.aboard = !!m.players[id].ab; // sincroniza estado "a bordo"
          const ap = typeof r.s.ap === 'string' ? r.s.ap.slice(0, 40) : '';
          if (ap !== (r.ap || '')) this.setRemoteLook(r, ap);
        }
        for (const [id, r] of this.remotes) if (!(id in m.players)) { r.mesh.parent && r.mesh.parent.remove(r.mesh); this.remotes.delete(id); if (G.voice) G.voice.drop(id); }
        break;
      }
      case 'add': G.boat.addPiece(m.piece); break;
      case 'remove': G.boat.removePiece(m.id); break;
      case 'collect': G.world.markCollected(m.id); break;
      case 'crate:state': G.interact.setCrateState(m.id, m.loot || {}); break;
      case 'crate:loot': G.interact.receiveLoot(m.loot || {}); break;
      case 'crate:error':
        if (G.interact.openCrateId === m.id) {
          G.hud.msg('Não foi possível acessar essa caixa');
          G.interact.closeCrate();
        }
        break;
      case 'sail': if (this.isHost) { G.boat.sailUp = m.up; G.boat.sailAngle = m.angle; } break;
      case 'sail-install': G.startup.installSail(); break;
      case 'start': G.startup.applyState(m.state); break;
      case 'msg': G.hud.msg(m.text); break;
      case 'event': G.events.receive(m.e); break;
      case 'naval': if (G.naval) G.naval.receive(m); break;
      case 'music': if (G.tools) G.tools.receiveNote(m); break;
      case 'yank': if (G.tools) G.tools.receiveYank(m); break;
      case 'rtc': if (G.voice) G.voice.signal(m); break;
      case 'revive': if (m.id === this.id) G.survival.revive(m.by); break;
      case 'drag': G.world.applyDrag(m); break;
      case 'ens': case 'ehit': case 'emod': case 'edie': case 'pdmg': case 'chit': case 'fishtake': case 'fx': G.enemyNet.handle(m); break;
      case 'drop:add': G.drops.spawn(m.d); break;
      case 'prop': if (Array.isArray(m.p)) G.world.spawnProp(m.k, m.p[0], m.p[1], m.p[2], m.id, false); break;
      case 'drop:remove': G.drops.remove(m.id); break;
      case 'drop:got': G.drops.got(m.loot); break;
      case 'carry': {
        G.world.applyCarryState(m.id, m.by, m.state);
        break;
      }
      case 'place': {
        G.world.applyPlacedState(m.id, m.state);
        break;
      }
      case 'physics': {
        if (!this.isHost) G.physics.applySnapshot(m.bodies);
        break;
      }
      case 'weld': {
        G.build.applyRemoteWeld(m);
        break;
      }
      case 'unweld': {
        G.build.tryRemoveWelded(m.pieceId, false);
        if (m.state && m.physId) G.world.applyPlacedState(m.physId, m.state);
        break;
      }
    }
  }

  // Aparência dos aliados: "p:<código>" = pílula personalizada; vazio = náufrago padrão.
  setRemoteLook(r, ap) {
    r.ap = ap;
    if (r.pill) { r.mesh.remove(r.pill); disposePill(r.pill.children[0]); r.pill = null; }
    const rig = r.mesh.userData.parts.rig;
    if (ap.startsWith('p:')) {
      const pill = makePill(decodePill(ap.slice(2))), holder = new THREE.Group();
      holder.add(pill); holder.scale.setScalar(PILL_SCALE);
      r.mesh.add(holder); r.pill = holder; rig.visible = false;
    } else rig.visible = true;
  }

  // Código de aparência enviado junto com o estado do jogador local.
  localLook() {
    const a = this.G.player.appearance;
    return a.character === 'pilula' ? 'p:' + encodePill(a.pill) : '';
  }

  update(dt) {
    if (!this.online) return;
    const G = this.G, pl = G.player, boat = G.boat, b = pl.body;
    G.world.updateRemoteDrags(dt);
    this.acc += dt;
    this.physicsAcc += dt;
    if (this.isHost && this.physicsAcc >= 0.1) {
      this.physicsAcc %= 0.1;
      this.send({ t: 'physics', bodies: G.physics.snapshot() });
    }
    if (this.acc > 0.066) {
      this.acc = 0;
      let x = b.pos.x, y = b.pos.y, z = b.pos.z, yaw = pl.yaw;
      if (pl.aboard) { [x, z] = boat.toLocal(x, z); y -= boat.set.y; yaw -= boat.yaw; }
      const r2 = (v) => Math.round(v * 100) / 100;
      this.send({ t: 'state', s: { p: [r2(x), r2(y), r2(z)], yaw: r2(yaw), ab: pl.aboard ? 1 : 0, sw: pl.swimming ? 1 : 0, sp: r2(Math.hypot(b.vel.x, b.vel.z)), dead: pl.dead ? 1 : 0, dn: pl.downed ? 1 : 0, mu: G.tools && G.tools.playT > 0 ? 1 : 0, vc: G.voice && G.voice.on ? 1 : 0, po: pl.anim ? pl.anim.pose : 'walk', pp: pl.anim ? Math.round(pl.anim.progress * 100) / 100 : 0, ar: pl.anim ? pl.anim.armed : 'none', tk: G.voice && G.voice.talking ? 1 : 0, ap: this.localLook() } });
      if (this.isHost) this.send({ t: 'boat', b: { x: r2(boat.x), z: r2(boat.z), yaw: Math.round(boat.yaw * 1000) / 1000, speed: r2(boat.speed), up: boat.sailUp, angle: boat.sailAngle } });
    }
    // Interpola os aliados.
    const k = Math.min(1, 12 * dt);
    for (const [id, r] of this.remotes) {
      const s = r.s, parent = s.ab ? boat.group : G.scene, mesh = r.mesh;
      if (mesh.parent !== parent) { parent.add(mesh); r.first = true; }
      if (r.first) { mesh.position.set(s.p[0], s.p[1], s.p[2]); r.yaw = s.yaw; r.first = false; }
      mesh.position.x += (s.p[0] - mesh.position.x) * k;
      mesh.position.y += (s.p[1] - mesh.position.y) * k;
      mesh.position.z += (s.p[2] - mesh.position.z) * k;
      r.yaw = lerpAngle(r.yaw, s.yaw, k);
      mesh.rotation.order = 'YXZ';
      mesh.rotation.y = r.yaw;
      mesh.rotation.x = s.dead ? -Math.PI / 2 : s.sw ? 0.9 : 0;
      if (r.pill) {
        mesh.rotation.x = s.dead ? -Math.PI / 2 : 0;
        const pd = r.pill.children[0].userData;
        const vp = G.voice && G.voice.peers.get(id);
        pd.talk = vp && vp.speaking > 0 ? Math.min(1, (vp.level || 0) * 30) : s.tk ? 0.6 : 0; // boca no ritmo da voz
        pd.armed = typeof s.ar === 'string' ? s.ar : 'none'; pd.gunType = pd.armed === 'long' ? 'long' : 'pistol';
        const remotePose = s.sw ? 'swim' : s.dn ? 'crawl' : typeof s.po === 'string' ? s.po : 'walk';
        animatePill(r.pill.children[0], s.sp, dt, remotePose, +s.pp || 0); // mesma animação que o jogador vê
      } else animateHumanoid(mesh, s.sp, dt, s.sw ? 'swim' : 'walk');
    }
  }
}
