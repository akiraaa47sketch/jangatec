// Servidor multiplayer (Render). Guarda o estado compartilhado de cada sala:
// seed, host, peças construídas, detritos coletados, barco e posições dos jogadores.
import http from 'http';
import { WebSocketServer } from 'ws';
import { difficultyForCrateId, generateCrateLoot, isGeneratedCrate, WORLD_LOOT_PARAMS } from '../client/src/systems/loot.js';

const PORT = process.env.PORT || 3001;
const MAX_PLAYERS = 4;
const rooms = new Map();
let nextId = 1;

const server = http.createServer((req, res) => {
  // Rota de health-check usada pelo Render.
  res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
  res.end(JSON.stringify({ ok: true, rooms: rooms.size }));
});
const wss = new WebSocketServer({ server, maxPayload: 16 * 1024 });

function getRoom(name) {
  let r = rooms.get(name);
  if (!r) {
    r = {
      name, seed: Math.floor(Math.random() * 1e9), players: new Map(), hostId: null,
      added: [], removed: [], collected: [], placed: new Map(), welded: new Map(),
      crates: new Map(), boat: null, start: null,
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
  const match = typeof id === 'string' && /^[ib](-?\d+),(-?\d+)c(\d+)$/.exec(id);
  if (!match || Number(match[3]) > 2 || !isGeneratedCrate(seed, id)) return false;
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
  if (m.t === 'join') {
    if (ws.room) return;
    const room = getRoom(String(m.room || 'publica').slice(0, 24));
    if (room.players.size >= MAX_PLAYERS) { send(ws, { t: 'full' }); ws.close(); return; }
    ws.name = String(m.name || 'Náufrago').slice(0, 16);
    ws.room = room;
    room.players.set(ws.id, { ws, name: ws.name, state: null });
    if (!room.hostId) room.hostId = ws.id;
    send(ws, {
      t: 'welcome', id: ws.id, seed: room.seed, host: room.hostId,
      added: room.added, removed: room.removed, collected: room.collected,
      placed: [...room.placed.values()], welded: [...room.welded.values()],
      crates: [...room.crates.values()], boat: room.boat, start: room.start, event: room.event || null,
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
    case 'crate:take': {
      const crate = room.crates.get(m.id);
      if (!validCrateId(m.id, room.seed, m) || !ws.openedCrates.has(m.id) || !crate ||
          !canReachCrate(room, ws, m) || typeof m.item !== 'string' ||
          !/^(madeira|metal|pano|bandagem|kit|municao|cartucho|arma_[a-z0-9_]+)$/.test(m.item)) {
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
      // Onda gigante / furacão sorteados pelo host: valida e repassa a todos.
      const e = m.e;
      if (room.hostId !== ws.id || !e || !['tsunami', 'furacao'].includes(e.kind) ||
          typeof e.id !== 'string' || e.id.length > 40) break;
      const keys = ['t0', 'dur', 'ox', 'oz', 'dx', 'dz', 'speed', 'A', 'sigma', 'cx', 'cz', 'fx', 'fz', 'lat', 'latV', 'ahead'];
      const clean = { id: e.id, kind: e.kind, end: !!e.end };
      for (const key of keys) {
        if (e[key] === undefined) continue;
        if (!Number.isFinite(e[key])) return;
        clean[key] = e[key];
      }
      if (!Number.isFinite(clean.t0) || !Number.isFinite(clean.dur) || clean.dur > 120) break;
      room.event = clean.end ? null : clean;
      broadcast(room, { t: 'event', e: clean }, ws);
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
