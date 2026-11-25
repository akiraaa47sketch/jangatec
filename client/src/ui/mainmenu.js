// Menu principal em abas: Jogar · Servidores (lista ao vivo, criar sala com senha) · Personagem ·
// Opções (gráficos e chat de voz) · Controles. O fundo é a cena 3D da jangada girando.
import { Net } from '../net/net.js';
import { DEFAULT_SERVER } from '../config.js';
import { serverNow } from '../core/util.js';
import { renderPatchNotes, NEWS_VERSION } from './patchnotes.js';

const $ = (id) => document.getElementById(id);
const esc = (t) => String(t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const PHASE = { lobby: 'no lobby, esperando o capitão', build: 'montando a jangada', install: 'instalando a vela', calm: 'calmaria', storm: 'tempestade chegando', flood: 'inundação', board: 'embarcando', depart: 'navegando' };
const NAME_KEY = 'jangatec-nome', SERVER_KEY = 'jangatec-servidor';
const NEWS_KEY = 'jangatec-novidades-vistas'; // selo "NOVO" some depois de abrir a versão atual (ui/patchnotes.js)

export class MainMenu {
  // actions: { solo(seed), multi(welcome), bench() }
  constructor(G, actions) {
    this.G = G; this.actions = actions;
    this.tab = 'play'; this.rooms = []; this.busy = false; this.pollT = null;
    try { $('name').value = localStorage.getItem(NAME_KEY) || ''; $('server').value = localStorage.getItem(SERVER_KEY) || DEFAULT_SERVER; }
    catch { $('server').value = DEFAULT_SERVER; }
    $('name').onchange = () => { try { localStorage.setItem(NAME_KEY, $('name').value.trim()); } catch { /* ok */ } };
    $('server').onchange = () => { try { localStorage.setItem(SERVER_KEY, $('server').value.trim()); } catch { /* ok */ } this.refresh(); };
    for (const b of document.querySelectorAll('.menu-nav [data-tab], [data-goto]')) b.onclick = () => this.show(b.dataset.tab || b.dataset.goto);
    // jogar
    $('btnSolo').onclick = () => { const s = parseInt($('seed').value, 10); this.actions.solo(Number.isFinite(s) ? s : Math.floor(Math.random() * 1e9)); };
    $('btnBench').onclick = () => this.actions.bench();
    $('btnQuick').onclick = () => this.join('publica', { title: 'Pública' });
    // servidores
    $('srvRefresh').onclick = () => this.refresh(true);
    $('srvSearch').oninput = () => this.render();
    $('srvNew').onclick = () => { $('srvCreate').hidden = false; $('newTitle').focus(); };
    $('srvCancel').onclick = () => { $('srvCreate').hidden = true; };
    $('srvCreate').onsubmit = (e) => {
      e.preventDefault();
      const title = $('newTitle').value.trim(); if (!title) return;
      const seed = parseInt($('newSeed').value, 10);
      this.join(title, { create: true, title, password: $('newPass').value, max: +$('newMax').value, ...(Number.isFinite(seed) ? { seed } : {}) });
    };
    $('btnMulti').onclick = () => { const r = $('room').value.trim(); if (r) this.join(r, { title: r }); };
    $('srvList').onclick = (e) => {
      const b = e.target.closest('button[data-room]'); if (!b) return;
      const room = this.rooms.find((r) => r.id === b.dataset.room); if (!room) return;
      if (room.locked) this.askPassword(room); else this.join(room.id, { mustExist: true });
    };
    // lobby
    $('lobbyLeave').onclick = () => this.leaveLobby();
    $('lobbyStart').onclick = () => { if (this.G.net.isHost) { $('lobbyStart').disabled = true; this.G.net.send({ t: 'lobby:start' }); } };
    // senha
    $('pwCancel').onclick = () => { $('pwModal').hidden = true; };
    $('pwForm').onsubmit = (e) => { e.preventDefault(); const r = this.pwRoom; if (r) this.join(r.id, { password: $('pwInput').value, mustExist: true }, true); };
    // opções
    $('btnGfx').onclick = () => G.gfxMenu.toggle(true);
    $('btnHelp').onclick = () => { $('help').hidden = false; };
    this.bindVoice();
    // notas de atualização + selo "NOVO" na aba Novidades até o jogador abrir a aba desta versão
    renderPatchNotes($('patchNotes'));
    let seen = null; try { seen = localStorage.getItem(NEWS_KEY); } catch { /* ok */ }
    $('newsBadge').hidden = seen === NEWS_VERSION;
  }

  status(t) { $('menuStatus').textContent = t || ''; }
  name() { return $('name').value.trim() || 'Náufrago'; }
  url() { return $('server').value.trim() || DEFAULT_SERVER; }

  show(tab) {
    this.tab = tab;
    for (const b of document.querySelectorAll('.menu-nav [data-tab]')) b.classList.toggle('on', b.dataset.tab === tab);
    for (const s of document.querySelectorAll('.tab')) s.classList.toggle('on', s.dataset.tab === tab);
    clearInterval(this.pollT);
    if (tab === 'news') { $('newsBadge').hidden = true; try { localStorage.setItem(NEWS_KEY, NEWS_VERSION); } catch { /* ok */ } }
    if (tab === 'servers') { this.refresh(true); this.pollT = setInterval(() => this.refresh(), 4000); }
    if (tab === 'options') this.meterLoop();
  }

  // ---------- lista de salas ----------
  async refresh(manual = false) {
    if (this.listing) return;
    this.listing = true;
    const live = $('liveState');
    if (manual || !this.rooms.length) { live.className = 'live'; live.querySelector('b').textContent = 'conectando… (o servidor grátis pode levar até 1 min para acordar)'; }
    try {
      const res = await Net.listRooms(this.url());
      this.rooms = res.rooms || [];
      live.className = 'live ok';
      live.querySelector('b').textContent = `ao vivo · ${res.online || 0} conectado${res.online === 1 ? '' : 's'}`;
      const badge = $('liveCount'); badge.hidden = !this.rooms.length; badge.textContent = this.rooms.length;
    } catch (e) {
      live.className = 'live err'; live.querySelector('b').textContent = e.message || 'sem conexão';
    }
    this.listing = false;
    this.render();
  }
  render() {
    const q = $('srvSearch').value.trim().toLowerCase();
    const list = this.rooms.filter((r) => !q || r.title.toLowerCase().includes(q) || (r.host || '').toLowerCase().includes(q));
    const el = $('srvList');
    if (!list.length) {
      el.innerHTML = `<div class="srv-empty"><b>${this.rooms.length ? 'Nada encontrado' : 'Nenhuma sala aberta'}</b>${this.rooms.length ? 'Tente outro nome.' : 'Crie a sua e chame a tripulação!'}</div>`;
      return;
    }
    const sig = JSON.stringify(list);
    if (sig === this._sig) return; // sem mudança: não redesenha (evita piscar)
    this._sig = sig;
    el.innerHTML = list.map((r, i) => {
      const full = r.players >= r.max;
      const slots = Array.from({ length: r.max }, (_, k) => `<i class="${k < r.players ? 'f' : ''}"></i>`).join('');
      const where = r.phase === 'depart' ? `navegando · ${r.dist} m` : PHASE[r.phase] || r.phase;
      return `<div class="srv${full ? ' full' : ''}" style="animation-delay:${i * 40}ms">
        <div><div class="nm">${esc(r.title)}${r.locked ? '<span class="tag">senha</span>' : ''}</div><div class="meta">${r.host ? 'capitão ' + esc(r.host) + ' · ' : ''}${esc(where)}</div></div>
        <div class="slots" title="${r.players}/${r.max} jogadores">${slots}</div>
        <button type="button" class="primary small" data-room="${esc(r.id)}"${full ? ' disabled' : ''}>${full ? 'Cheia' : 'Entrar'}</button>
      </div>`;
    }).join('');
  }
  askPassword(room) {
    this.pwRoom = room;
    $('pwRoom').textContent = room.title; $('pwErr').textContent = ''; $('pwInput').value = '';
    $('pwModal').hidden = false; $('pwInput').focus();
  }

  // ---------- entrar ----------
  join(room, opts = {}, fromModal = false) {
    if (this.busy) return;
    this.busy = true;
    this.status('Conectando… (o servidor grátis pode levar até 1 min para acordar)');
    this.G.net.connect(this.url(), this.name(), room, { ...opts, ap: this.G.net.localLook() })
      .then((m) => {
        this.busy = false; clearInterval(this.pollT); $('pwModal').hidden = true; this.status('');
        if (m.lobby) this.openLobby(m); else this.actions.multi(m);
      })
      .catch((e) => {
        this.busy = false;
        if (e.needPassword) {
          if (fromModal) { $('pwErr').textContent = e.message; $('pwInput').select(); }
          else this.askPassword(this.rooms.find((r) => r.id === room) || { id: room, title: room });
          this.status('');
          return;
        }
        this.status(`${e.message}. Confira o servidor ou jogue solo.`);
        if (fromModal) $('pwErr').textContent = e.message;
        this.refresh();
      });
  }

  // ---------- lobby (sala criada: espera todo mundo e o capitão inicia) ----------
  openLobby(welcome) {
    const net = this.G.net;
    this.lobby = { welcome, going: false };
    $('lobbyTitle').textContent = (welcome.room && welcome.room.title) || 'Sala';
    $('lobbyStart').disabled = false;
    $('lobbyModal').hidden = false;
    this.renderLobby(welcome.lobby);
    net.onLobby = (m) => {
      if (!this.lobby || this.lobby.going) return;
      if (m.t === 'closed') { this.lobby = null; $('lobbyModal').hidden = true; this.status('A conexão com a sala caiu. Tente entrar de novo.'); return; }
      if (m.t === 'lobby') { this.renderLobby(m.lobby); return; }
      // lobby:go — todos entram na cutscene no mesmo instante marcado pelo servidor
      this.lobby.going = true;
      this.renderLobby(m.lobby);
      $('lobbyStart').hidden = true;
      $('lobbyLeave').disabled = true;
      $('lobbyTip').textContent = 'Decolando…';
      const wait = Math.max(0, Math.min(5000, m.at - serverNow()));
      setTimeout(() => {
        $('lobbyModal').hidden = true; $('lobbyLeave').disabled = false; net.onLobby = null;
        net.lobbyPlayers = m.lobby.players.filter((p) => p.id !== net.id); // passageiros da cutscene
        this.lobby = null;
        this.actions.multi(welcome);
      }, wait);
    };
  }
  renderLobby(info) {
    if (!info) return;
    const net = this.G.net;
    net.isHost = info.host === net.id;
    $('lobbyCount').textContent = `${info.players.length}/${info.max}`;
    const rows = info.players.map((p) => `<li>${esc(p.name)}${p.id === net.id ? ' <span class="you">(você)</span>' : ''}${p.id === info.host ? '<span class="cap">capitão</span>' : ''}</li>`);
    for (let i = info.players.length; i < info.max; i++) rows.push('<li class="empty">vaga livre</li>');
    $('lobbyList').innerHTML = rows.join('');
    if (this.lobby && this.lobby.going) return;
    $('lobbyStart').hidden = !net.isHost;
    $('lobbyTip').textContent = net.isHost
      ? (info.players.length > 1 ? 'Todo mundo pronto? Aperte iniciar — a cutscene começa para todos juntos.' : 'Chame a tripulação ou inicie sozinho. A cutscene começa para todos juntos.')
      : 'Aguardando o capitão iniciar a partida…';
  }
  leaveLobby() {
    if (!this.lobby || this.lobby.going) return;
    this.lobby = null;
    this.G.net.disconnect();
    $('lobbyModal').hidden = true;
    this.refresh(true);
    if (this.tab === 'servers') { clearInterval(this.pollT); this.pollT = setInterval(() => this.refresh(), 4000); }
  }

  // ---------- chat de voz ----------
  bindVoice() {
    const V = this.G.voice, s = V.settings;
    $('vListen').checked = s.listen; $('vMode').value = s.mode; $('vRange').value = s.range;
    $('vVol').value = Math.round(s.vol * 100); $('vGain').value = Math.round(s.gain * 100);
    $('vListen').onchange = (e) => V.set('listen', e.target.checked);
    $('vMode').onchange = (e) => V.set('mode', e.target.value);
    $('vRange').onchange = (e) => V.set('range', e.target.value);
    $('vVol').oninput = (e) => V.set('vol', +e.target.value / 100);
    $('vGain').oninput = (e) => V.set('gain', +e.target.value / 100);
    $('vMic').onchange = async (e) => {
      const tip = $('vTip');
      try {
        await V.enableMic(e.target.checked);
        tip.textContent = e.target.checked ? (V.settings.mode === 'ptt' ? 'Microfone pronto — no jogo, segure V para falar.' : 'Microfone pronto — fale e veja o medidor.') : 'Microfone desligado.';
      } catch (err) { e.target.checked = false; tip.textContent = 'Não deu para usar o microfone: ' + (err.message || err.name); }
    };
  }
  meterLoop() {
    if (this.tab !== 'options' || this.G.started) return;
    const V = this.G.voice, lvl = V.micLevel();
    $('vMeter').style.width = `${Math.min(100, lvl * 900)}%`;
    requestAnimationFrame(() => this.meterLoop());
  }
}
