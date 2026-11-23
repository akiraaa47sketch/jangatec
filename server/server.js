// Servidor multiplayer (Render). Guarda o estado compartilhado de cada sala:
// seed, host, peças construídas, detritos coletados, barco e posições dos jogadores.
import http from 'http';
import crypto from 'crypto';
import { WebSocketServer } from 'ws';
import { difficultyForCrateId, generateCrateLoot, isGeneratedCrate, WORLD_LOOT_PARAMS } from '../client/src/systems/loot.js';

const PORT = process.env.PORT || 3001;
const MAX_PLAYERS = 6;
const rooms = new Map();
let nextId = 1;

const server = http.createServer((req, res) => {
  // Rota de health-check usada pelo Render.
  res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
  res.end(JSON.stringify({ ok: true, rooms: rooms.size }));
});
const wss = new WebSocketServer({ server, maxPayload: 16 * 1024 });

const hashPw = (room, pw) => crypto.createHash('sha256').update(room + '|' + String(pw)).digest('hex');
const roomId = (title) => String(title || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 24);

// Lista de salas para o navegador de servidores do menu.
function roomList() {
  return [...rooms.values()].filter((r) => r.players.size > 0).map((r) => {
    const host = r.players.get(r.hostId);
    return {
      id: r.name, title: r.title || r.name, players: r.players.size, max: r.max || MAX_PLAYERS,
      locked: !!r.passHash, host: host ? host.name : '', phase: r.start ? r.start.phase : 'build',
      dist: r.boat ? Math.round(Math.hypot(r.boat.x || 0, r.boat.z || 0)) : 0, age: Math.round((Date.now() - (r.created || Date.now())) / 1000),
    };
  }).sort((a, b) => b.players - a.players || a.age - b.age).slice(0, 60);
}

function getRoom(name, meta = {}) {
  let r = rooms.get(name);
  if (!r) {
    r = {
      name, title: meta.title || name, passHash: meta.password ? hashPw(name, meta.password) : null,
      max: meta.max || MAX_PLAYERS, created: Date.now(),
      seed: Number.isFinite(meta.seed) ? Math.floor(Math.abs(meta.seed)) % 1e9 : Math.floor(Math.random() * 1e9), players: new Map(), hostId: null,
      added: [], removed: [], collected: [], placed: new Map(), welded: new Map(),
      crates: new Map(), drops: new Map(), props: [], boat: null, start: null,
    };
    rooms.set(name, r);
  }
  return r;
}
const send = (ws, m) => { if (ws.readyState === 1) ws.send(JSON.stringify(m)); };
function broadcast(room, m, except) {
  const s = JSON.stringify(m);
  for (const p of room.players.values()) if (p.ws !== except && p.ws.readyState === 1) p.ws.send(s);
}
function placementState(id, state) {
  if (typeof id !== 'string' || id.length > 80 || !state ||
      !Array.isArray(state.p) || state.p.length !== 3 ||
      !Array.isArray(state.q) || state.q.length !== 4 ||
      !state.p.concat(state.q).every(Number.isFinite)) return null;
  return { id, p: state.p, q: state.q, placed: true, water: !!state.water };
}

const ITEM_RE = /^(metal|bandagem|kit|municao|cartucho|canhao|gancho|bala_canhao|barra_proteina|energetico|chocolate|peixe|arma_[a-z0-9_]+)$/;
function cleanDrop(d) {
  if (!d || typeof d.id !== 'string' || d.id.length > 64 || !Array.isArray(d.p) || d.p.length !== 3 || !d.p.every(Number.isFinite) || !d.loot || typeof d.loot !== 'object') return null;
  const loot = {};
  for (const [k, v] of Object.entries(d.loot).slice(0, 12)) if (ITEM_RE.test(k) && Number.isFinite(v) && v >= 1) loot[k] = Math.min(999, Math.floor(v));
  if (!Object.keys(loot).length) return null;
  return { id: d.id, loot, p: d.p.map((v) => Math.round(v * 100) / 100), ab: d.ab ? 1 : 0, w: d.w ? 1 : 0 };
}

function cleanLoot(l) {
  if (!l || typeof l !== 'object') return null;
  const out = {};
  for (const [k, v] of Object.entries(l).slice(0, 8)) if (ITEM_RE.test(k) && Number.isFinite(v) && v >= 1) out[k] = Math.min(99, Math.floor(v));
  return Object.keys(out).length ? out : null;
}

function canReachMast(room, ws) {
  const player = room.players.get(ws.id);
  const state = player && player.state;
  if (!state || state.dead || !Array.isArray(state.p) || state.p.length !== 3 || !room.boat) return false;
  let x = state.p[0], z = state.p[2];
  if (state.ab) return Math.hypot(x, z - 1) <= 3.2;
  const mastX = room.boat.x + Math.sin(room.boat.yaw || 0);
  const mastZ = room.boat.z + Math.cos(room.boat.yaw || 0);
  return Math.hypot(x - mastX, z - mastZ) <= 3.2;
}

function validCrateId(id, seed, message) {
  const match = typeof id === 'string' && /^[ibs](-?\d+),(-?\d+)c(\d+)$/.exec(id);
  if (!match || Number(match[3]) > 6 || !isGeneratedCrate(seed, id)) return false;
  const cx = Number(match[1]), cz = Number(match[2]);
  return Number.isFinite(message.x) && Number.isFinite(message.z) &&
    Math.abs(message.x - cx * WORLD_LOOT_PARAMS.chunkSize) <= 32 &&
    Math.abs(message.z - cz * WORLD_LOOT_PARAMS.chunkSize) <= 32;
}

function canReachCrate(room, ws, message) {
  const player = room.players.get(ws.id);
  const state = player && player.state;
  if (!state || state.dead || !Array.isArray(state.p) || state.p.length !== 3 ||
      !Number.isFinite(message.x) || !Number.isFinite(message.z)) return false;
  let x = state.p[0], z = state.p[2];
  if (state.ab && room.boat) {
    const c = Math.cos(room.boat.yaw), s = Math.sin(room.boat.yaw);
    const worldX = x * c + z * s;
    const worldZ = -x * s + z * c;
    x = room.boat.x + worldX;
    z = room.boat.z + worldZ;
  }
  return Math.hypot(message.x - x, message.z - z) <= 3.2;
}

function leave(ws) {
  const room = ws.room;
  if (!room) return;
  room.players.delete(ws.id);
  ws.room = null;
  if (room.players.size === 0) { rooms.delete(room.name); return; }
  if (room.hostId === ws.id) room.hostId = room.players.keys().next().value; // migração de host
  broadcast(room, { t: 'msg', text: `${ws.name} saiu` });
}

function handle(ws, m) {
  if (m.t === 'list') { send(ws, { t: 'rooms', rooms: roomList(), online: wss.clients.size }); return; }
  if (m.t === 'join') {
    if (ws.room) return;
    const id = roomId(m.room) || 'publica';
    const exists = rooms.has(id) && rooms.get(id).players.size > 0;
    if (m.create && exists) { send(ws, { t: 'join-error', reason: 'Já existe uma sala com esse nome' }); return; }
    if (!m.create && !exists && m.mustExist) { send(ws, { t: 'join-error', reason: 'Essa sala não existe mais' }); return; }
    if (!exists) rooms.delete(id); // sala vazia antiga: recria com as opções novas
    const max = Math.max(1, Math.min(MAX_PLAYERS, m.max | 0 || MAX_PLAYERS));
    const room = getRoom(id, m.create ? {
      title: String(m.title || m.room).slice(0, 28), password: m.password ? String(m.password).slice(0, 32) : '', max,
      seed: Number(m.seed),
    } : { title: String(m.room || 'Pública').slice(0, 28) });
    if (room.passHash && hashPw(id, m.password || '') !== room.passHash) { send(ws, { t: 'join-error', reason: 'Senha incorreta', needPassword: true }); return; }
    if (room.players.size >= (room.max || MAX_PLAYERS)) { send(ws, { t: 'full' }); ws.close(); return; }
    ws.name = String(m.name || 'Náufrago').slice(0, 16);
    ws.room = room;
    room.players.set(ws.id, { ws, name: ws.name, state: null });
    if (!room.hostId) room.hostId = ws.id;
    send(ws, {
      t: 'welcome', id: ws.id, seed: room.seed, host: room.hostId, room: { id: room.name, title: room.title, locked: !!room.passHash, max: room.max },
      added: room.added, removed: room.removed, collected: room.collected,
      placed: [...room.placed.values()], welded: [...room.welded.values()],
      crates: [...room.crates.values()], drops: [...room.drops.values()], props: room.props, boat: room.boat, start: room.start, event: room.event || null,
    });
    broadcast(room, { t: 'msg', text: `${ws.name} entrou` }, ws);
    return;
  }
  const room = ws.room;
  if (!room) return;
  switch (m.t) {
    case 'state': room.players.get(ws.id).state = m.s; break;
    case 'boat': if (room.hostId === ws.id) room.boat = m.b; break;
    case 'sail': broadcast(room, { t: 'sail', up: !!m.up, angle: +m.angle || 0 }); break;
    case 'start': {
      if (room.hostId !== ws.id || !m.state) break;
      const state = m.state;
      if (!['build', 'install', 'calm', 'storm', 'flood', 'board', 'depart'].includes(state.phase) ||
          !Number.isFinite(state.elapsed) || !Number.isFinite(state.waterLevel) ||
          !Array.isArray(state.anchor) || state.anchor.length !== 2 ||
          !state.anchor.every(Number.isFinite)) break;
      room.start = {
        phase: state.phase,
        elapsed: Math.max(0, Math.min(120, state.elapsed)),
        waterLevel: Math.max(0, Math.min(2, state.waterLevel)),
        sailInstalled: !!state.sailInstalled,
        sailUp: !!state.sailUp,
        anchor: state.anchor,
      };
      broadcast(room, { t: 'start', state: room.start }, ws);
      break;
    }
    case 'sail-install':
      if (room.start && room.start.phase === 'install' && canReachMast(room, ws) &&
          [...room.welded.values()].some((piece) => piece.startSlotId === 'deck-main')) {
        broadcast(room, { t: 'sail-install' });
      }
      break;
    case 'add':
      if (!m.piece || room.added.length > 3000) break;
      room.added.push(m.piece);
      broadcast(room, { t: 'add', piece: m.piece }, ws);
      break;
    case 'remove': {
      const i = room.added.findIndex((p) => p.id === m.id);
      if (i >= 0) room.added.splice(i, 1); else room.removed.push(m.id);
      broadcast(room, { t: 'remove', id: m.id }, ws);
      break;
    }
    case 'collect':
      if (room.collected.length < 20000) room.collected.push(m.id);
      broadcast(room, { t: 'collect', id: m.id }, ws);
      break;
    case 'crate:open': {
      if (!validCrateId(m.id, room.seed, m) || !canReachCrate(room, ws, m) || room.collected.includes(m.id)) {
        send(ws, { t: 'crate:error', id: m.id });
        break;
      }
      let crate = room.crates.get(m.id);
      if (!crate) {
        if (room.crates.size >= 5000) { send(ws, { t: 'crate:error', id: m.id }); break; }
        crate = {
          id: m.id,
          opened: true,
          loot: generateCrateLoot(room.seed, m.id, difficultyForCrateId(m.id), room.players.size),
        };
        room.crates.set(m.id, crate);
      }
      ws.openedCrates.add(m.id);
      broadcast(room, { t: 'crate:state', id: crate.id, loot: crate.loot });
      break;
    }
    // Inimigos sincronizados (o host simula): fotos, acertos, mortes, dano em jogadores e efeitos.
    case 'ens': if (room.hostId === ws.id && Array.isArray(m.l) && m.l.length <= 80) broadcast(room, { t: 'ens', l: m.l }, ws); break;
    case 'ehit': case 'emod': case 'chit': case 'fishtake': case 'fx': {
      if (typeof m.id !== 'undefined' && (typeof m.id !== 'string' || m.id.length > 80)) break;
      const s = JSON.stringify({ ...m, from: ws.id });
      if (s.length > 4000) break;
      for (const p of room.players.values()) if (p.ws !== ws && p.ws.readyState === 1) p.ws.send(s);
      break;
    }
    case 'edie': if (room.hostId === ws.id && typeof m.id === 'string') broadcast(room, { t: 'edie', id: m.id.slice(0, 80), side: m.side === -1 ? -1 : 1, to: typeof m.to === 'string' ? m.to : null, loot: cleanLoot(m.loot) }, ws); break;
    case 'pdmg': { // dano do inimigo (no host) num aliado: vai só para ele
      if (room.hostId !== ws.id) break;
      const target = room.players.get(m.to);
      if (target) send(target.ws, { t: 'pdmg', to: m.to, dmg: Math.min(200, +m.dmg || 0), src: String(m.src || '').slice(0, 30), eid: typeof m.eid === 'string' ? m.eid.slice(0, 80) : null, ex: +m.ex || 0, ez: +m.ez || 0, k: m.k === 'kick' || m.k === 'melee' ? m.k : 'shot', h: m.h ? 1 : 0 });
      break;
    }
    case 'prop': { // prop do loot (torreta-arpão) criado por um jogador: todos criam igual
      if (typeof m.id !== 'string' || m.id.length > 64 || m.k !== 'torreta' || !Array.isArray(m.p) || m.p.length !== 3 || !m.p.every(Number.isFinite)) break;
      if (room.props.length < 60) room.props.push({ id: m.id, k: m.k, p: m.p });
      broadcast(room, { t: 'prop', id: m.id, k: m.k, p: m.p }, ws);
      break;
    }
    case 'drop:add': { // jogador largou itens no mundo (saquinho)
      const d = cleanDrop(m.d);
      if (!d || room.drops.has(d.id)) break;
      if (room.drops.size >= 80) room.drops.delete(room.drops.keys().next().value); // some o mais antigo
      room.drops.set(d.id, d);
      broadcast(room, { t: 'drop:add', d }, ws);
      break;
    }
    case 'drop:take': { // o primeiro que pedir leva
      const d = typeof m.id === 'string' && room.drops.get(m.id);
      if (!d) break;
      room.drops.delete(d.id);
      send(ws, { t: 'drop:got', loot: d.loot });
      broadcast(room, { t: 'drop:remove', id: d.id });
      break;
    }
    case 'crate:take': {
      const crate = room.crates.get(m.id);
      if (!validCrateId(m.id, room.seed, m) || !ws.openedCrates.has(m.id) || !crate ||
          !canReachCrate(room, ws, m) || typeof m.item !== 'string' ||
          !/^(metal|bandagem|kit|municao|cartucho|canhao|gancho|bala_canhao|barra_proteina|energetico|chocolate|peixe|arma_[a-z0-9_]+)$/.test(m.item)) {
        send(ws, { t: 'crate:error', id: m.id });
        break;
      }
      const available = crate.loot[m.item] || 0;
      const amount = Math.min(available, Math.max(0, Math.floor(m.amount)));
      if (!amount) {
        send(ws, { t: 'crate:state', id: crate.id, loot: crate.loot });
        break;
      }
      crate.loot[m.item] -= amount;
      if (!crate.loot[m.item]) delete crate.loot[m.item];
      send(ws, { t: 'crate:loot', id: m.id, loot: { [m.item]: amount } });
      if (!Object.values(crate.loot).some((count) => count > 0) && !room.collected.includes(m.id)) {
        room.collected.push(m.id);
      }
      broadcast(room, { t: 'crate:state', id: crate.id, loot: crate.loot });
      break;
    }
    case 'drag': { // peça sendo arrastada: posição/rotação para os outros (não guarda estado)
      if (typeof m.id !== 'string' || m.id.length > 80 || !Array.isArray(m.p) || m.p.length !== 3 ||
          !Array.isArray(m.q) || m.q.length !== 4 || ![...m.p, ...m.q].every(Number.isFinite)) break;
      const now = Date.now(); if (now - (ws.lastDrag || 0) < 40) break; ws.lastDrag = now; // anti-spam
      broadcast(room, { t: 'drag', id: m.id, p: m.p, q: m.q, from: ws.id }, ws);
      break;
    }
    case 'carry': {
      const by = m.by ? ws.id : null;
      const state = !by && placementState(m.id, m.state);
      if (by) room.placed.delete(m.id);
      else if (state) room.placed.set(state.id, state);
      broadcast(room, { t: 'carry', id: m.id, by, state: state || null }, ws);
      break;
    }
    case 'place': {
      const state = placementState(m.id, m.state);
      if (!state || (room.placed.size >= 2000 && !room.placed.has(state.id))) break;
      room.placed.set(state.id, state);
      broadcast(room, { t: 'place', id: state.id, state }, ws);
      break;
    }
    case 'weld': {
      const piece = m.piece;
      if (!piece || typeof m.physId !== 'string' || m.physId.length > 80 ||
          typeof piece.id !== 'string' || piece.id.length > 80 ||
          typeof piece.type !== 'string' || piece.type.length > 32 ||
          ![piece.x, piece.y, piece.z, piece.yaw, piece.rotX || 0, piece.rotZ || 0].every(Number.isFinite) ||
          !Array.isArray(piece.physSize) || piece.physSize.length !== 3 ||
          !piece.physSize.every((value) => Number.isFinite(value) && value > 0)) break;
      const startSlotId = typeof piece.startSlotId === 'string' &&
        /^(?:deck-main|deck-(?:nw|ne|sw|se))$/.test(piece.startSlotId) ? piece.startSlotId : null;
      if (startSlotId && [...room.welded.values()].some((entry) => entry.startSlotId === startSlotId)) break;
      const state = {
        id: piece.id, type: piece.type, x: piece.x, y: piece.y, z: piece.z,
        yaw: piece.yaw, rotX: piece.rotX || 0, rotZ: piece.rotZ || 0,
        physObjId: m.physId, physSize: piece.physSize,
        ...(startSlotId ? { startSlotId } : {}),
      };
      room.placed.delete(m.physId);
      room.welded.set(state.id, state);
      broadcast(room, { t: 'weld', physId: m.physId, piece: state }, ws);
      break;
    }
    case 'unweld': {
      const state = placementState(m.physId, m.state);
      room.welded.delete(m.pieceId);
      if (state) room.placed.set(state.id, state);
      broadcast(room, m, ws);
      break;
    }
    case 'revive': {
      // um jogador reanimou um aliado caído: avisa a sala (o alvo se levanta)
      if (typeof m.id !== 'string' || m.id.length > 20 || !room.players.has(m.id) || m.id === ws.id) break;
      broadcast(room, { t: 'revive', id: m.id, by: ws.name });
      break;
    }
    case 'event': {
      // Eventos do mar sorteados pelo host (onda, furacão, tempestade, kraken, tubarões, peixes, raios,
      // navio-fantasma): valida e repassa a todos.
      const e = m.e;
      if (room.hostId !== ws.id || !e || !['tsunami', 'furacao', 'tempestade', 'kraken', 'tubaroes', 'peixes', 'raios', 'fantasma'].includes(e.kind) ||
          typeof e.id !== 'string' || e.id.length > 40) break;
      const keys = ['t0', 'dur', 'ox', 'oz', 'dx', 'dz', 'speed', 'A', 'sigma', 'cx', 'cz', 'fx', 'fz', 'lat', 'latV', 'ahead', 'R', 'depth', 'spin', 'seed', 'n', 'gap'];
      const clean = { id: e.id, kind: e.kind, end: !!e.end };
      for (const key of keys) {
        if (e[key] === undefined) continue;
        if (!Number.isFinite(e[key])) return;
        clean[key] = e[key];
      }
      if (!Number.isFinite(clean.t0) || !Number.isFinite(clean.dur) || clean.dur > 300) break;
      room.event = clean.end ? null : clean;
      broadcast(room, { t: 'event', e: clean }, ws);
      break;
    }
    case 'naval': {
      // Batalha naval: o host manda navios/dano/estado; qualquer um pode disparar, mirar e consertar.
      const HOST = ['ships', 'php', 'sunk', 'boom', 'crates', 'took'], ANY = ['fire', 'aim', 'repair', 'take', 'pull', 'tower'];
      if (typeof m.k !== 'string' || !(HOST.includes(m.k) || ANY.includes(m.k))) break;
      if (HOST.includes(m.k) && room.hostId !== ws.id) break;
      if (JSON.stringify(m).length > 6000) break;
      m.from = ws.id; // quem mandou (pegar/puxar caixote)
      broadcast(room, m, ws);
      break;
    }
    case 'music': {
      // nota do banjo: repassa para a sala (todos ouvem, mais baixo de longe)
      if (!Number.isFinite(m.n)) break;
      const now = Date.now();
      if (now - (ws.lastNote || 0) < 40) break; // anti-spam
      ws.lastNote = now;
      broadcast(room, { t: 'music', id: ws.id, n: Math.max(30, Math.min(100, m.n | 0)) }, ws);
      break;
    }
    case 'yank': {
      // gancho fisgou um jogador: avisa a sala (só o alvo reage)
      if (typeof m.id !== 'string' || !room.players.has(m.id) || m.id === ws.id || ![m.x, m.y, m.z].every(Number.isFinite)) break;
      broadcast(room, { t: 'yank', id: m.id, x: m.x, y: m.y, z: m.z, by: ws.name });
      break;
    }
    case 'rtc': {
      // sinalização do chat de voz (WebRTC): repassa oferta/resposta/ICE só para o destinatário
      const to = typeof m.to === 'string' && room.players.get(m.to);
      if (!to || m.to === ws.id || JSON.stringify(m).length > 12000) break;
      send(to.ws, { t: 'rtc', from: ws.id, sdp: m.sdp || null, ice: m.ice || null, bye: !!m.bye });
      break;
    }
    case 'physics': {
      if (room.hostId !== ws.id || !Array.isArray(m.bodies)) break;
      const bodies = m.bodies.slice(0, 48).filter((body) =>
        body && typeof body.id === 'string' && body.id.length <= 80 &&
        Array.isArray(body.p) && body.p.length === 3 &&
        Array.isArray(body.q) && body.q.length === 4 &&
        Array.isArray(body.v) && body.v.length === 3 &&
        Array.isArray(body.w) && body.w.length === 3 &&
        body.p.concat(body.q, body.v, body.w).every(Number.isFinite)
      );
      broadcast(room, { t: 'physics', bodies }, ws);
      break;
    }
  }
}

wss.on('connection', (ws) => {
  ws.id = 'p' + nextId++;
  ws.room = null;
  ws.openedCrates = new Set();
  ws.alive = true;
  ws.on('pong', () => { ws.alive = true; });
  ws.on('message', (raw) => {
    let m;
    try { m = JSON.parse(raw); } catch { return; }
    if (m && typeof m.t === 'string') handle(ws, m);
  });
  ws.on('close', () => leave(ws));
  ws.on('error', () => {});
});

// Snapshot ~15 Hz com jogadores + barco.
setInterval(() => {
  for (const room of rooms.values()) {
    const players = {};
    for (const [id, p] of room.players) if (p.state) players[id] = { n: p.name, ...p.state };
    broadcast(room, { t: 'snap', host: room.hostId, boat: room.boat, players });
  }
}, 66);

// Derruba conexões mortas.
setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.alive) { ws.terminate(); continue; }
    ws.alive = false;
    ws.ping();
  }
}, 30000);

server.listen(PORT, () => console.log(`Servidor Maré Alta na porta ${PORT}`));
