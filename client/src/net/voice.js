// Chat de voz (VOIP) entre os jogadores da sala, por WebRTC (áudio P2P em malha, até 4 pessoas).
//   • A sinalização (oferta/resposta/ICE) passa pelo servidor do jogo (mensagem 'rtc').
//   • Voz por PROXIMIDADE em 3D: o som vem da posição do aliado e some com a distância (~40 m);
//     opção de ouvir todo mundo igual ("rádio").
//   • Microfone: aperte-para-falar [V] (padrão) ou voz aberta com detecção de fala.
//   • Quem está falando aparece no HUD (e o ícone acende acima do personagem).
// Só o servidor STUN público é usado (descobre o IP); redes muito restritas podem não conectar.
import * as THREE from '../three.js';
import { keyOf } from '../core/keybinds.js';

const ICE = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }];
const KEY = 'jangatec-voz';
export const VOICE_DEFAULTS = { listen: true, mic: false, mode: 'ptt', range: 'prox', vol: 1, gain: 1, key: 'KeyV' };

export class Voice {
  constructor(G) {
    this.G = G;
    this.settings = this.load();
    this.peers = new Map();       // id → { pc, init, chain, queue, speaking }
    this.stream = null; this.track = null; this.talking = false; this.level = 0; this.hang = 0;
    this.touchTalk = false;
    this.hud = document.getElementById('voiceHud');
    this._v = new THREE.Vector3(); this._f = new THREE.Vector3();
  }
  load() {
    let s = null; try { s = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { s = null; }
    return { ...VOICE_DEFAULTS, ...(s && typeof s === 'object' ? s : {}), mic: false }; // mic pede permissão de novo a cada sessão
  }
  save() { try { localStorage.setItem(KEY, JSON.stringify({ ...this.settings, mic: false })); } catch { /* ok */ } }
  set(key, value) { this.settings[key] = value; this.save(); if (key === 'gain' && this.micGainNode) this.micGainNode.gain.value = value; }

  get on() { return this.G.net.online && this.settings.listen; }
  ctx() {
    if (!this.ac) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      this.ac = new AC();
      this.master = this.ac.createGain(); this.master.connect(this.ac.destination);
    }
    if (this.ac.state === 'suspended') this.ac.resume();
    this.master.gain.value = this.settings.vol;
    return this.ac;
  }

  // ---------- microfone ----------
  async enableMic(on) {
    if (!on) {
      if (this.stream) for (const t of this.stream.getTracks()) t.stop();
      this.stream = this.track = null; this.settings.mic = false; this.talking = false;
      for (const p of this.peers.values()) p.sender && p.sender.replaceTrack(null);
      return true;
    }
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw new Error('Este navegador não permite microfone (precisa de HTTPS)');
    const raw = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    const ac = this.ctx();
    // ganho do microfone + medidor de nível (detecção de fala)
    const src = ac.createMediaStreamSource(raw);
    this.micGainNode = ac.createGain(); this.micGainNode.gain.value = this.settings.gain;
    this.micAnalyser = ac.createAnalyser(); this.micAnalyser.fftSize = 512;
    const dest = ac.createMediaStreamDestination();
    src.connect(this.micGainNode); this.micGainNode.connect(this.micAnalyser); this.micGainNode.connect(dest);
    this.rawStream = raw; this.stream = dest.stream; this.track = dest.stream.getAudioTracks()[0];
    this.track.enabled = false;
    this.settings.mic = true;
    for (const p of this.peers.values()) if (p.sender) p.sender.replaceTrack(this.track);
    return true;
  }
  micLevel() {
    if (!this.micAnalyser) return 0;
    const a = this._buf || (this._buf = new Float32Array(512));
    this.micAnalyser.getFloatTimeDomainData(a);
    let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * a[i];
    return Math.sqrt(s / a.length);
  }

  // ---------- conexões ----------
  _send(to, extra) { this.G.net.send({ t: 'rtc', to, ...extra }); }
  _peer(id, init) {
    if (this.peers.has(id)) return this.peers.get(id);
    const pc = new RTCPeerConnection({ iceServers: ICE });
    // quem oferece cria o canal de áudio; quem responde usa o canal que vem na oferta
    const tr = init ? pc.addTransceiver('audio', { direction: 'sendrecv' }) : null;
    const p = { pc, init, sender: tr ? tr.sender : null, queue: [], chain: null, speaking: 0, t: 0 };
    if (tr && this.track) tr.sender.replaceTrack(this.track);
    pc.onicecandidate = (e) => { if (e.candidate) this._send(id, { ice: e.candidate.toJSON() }); };
    pc.ontrack = (e) => this._attach(p, e.streams[0] || new MediaStream([e.track]));
    pc.onconnectionstatechange = () => { if (['failed', 'closed'].includes(pc.connectionState)) this.drop(id, false); };
    this.peers.set(id, p);
    if (init) {
      pc.createOffer().then((o) => pc.setLocalDescription(o)).then(() => this._send(id, { sdp: pc.localDescription.toJSON() }))
        .catch(() => this.drop(id));
    }
    return p;
  }
  _attach(p, stream) {
    const ac = this.ctx(); if (!ac || p.chain) return;
    // Chrome só toca áudio remoto do WebRTC no WebAudio se houver um <audio> ligado ao stream
    const el = new Audio(); el.srcObject = stream; el.muted = true; el.play().catch(() => {});
    const src = ac.createMediaStreamSource(stream);
    const an = ac.createAnalyser(); an.fftSize = 512;
    const gain = ac.createGain();
    const pan = ac.createPanner();
    Object.assign(pan, { panningModel: 'HRTF', distanceModel: 'inverse', refDistance: 3, maxDistance: 60, rolloffFactor: 1.4 });
    src.connect(an); an.connect(gain); gain.connect(pan); pan.connect(this.master);
    p.chain = { el, src, an, gain, pan, buf: new Float32Array(512) };
  }
  async signal(m) {
    if (!this.on || typeof m.from !== 'string') return;
    if (m.bye) { this.drop(m.from, false); return; }
    let p = this.peers.get(m.from);
    try {
      if (m.sdp && m.sdp.type === 'offer') {
        if (p && p.init) this.drop(m.from, false); // colisão: quem tem o id menor oferece
        p = this._peer(m.from, false);
        await p.pc.setRemoteDescription(m.sdp);
        const tr = p.pc.getTransceivers()[0];
        if (tr) { tr.direction = 'sendrecv'; p.sender = tr.sender; if (this.track) await tr.sender.replaceTrack(this.track); }
        const ans = await p.pc.createAnswer(); await p.pc.setLocalDescription(ans);
        this._send(m.from, { sdp: p.pc.localDescription.toJSON() });
        for (const c of p.queue.splice(0)) await p.pc.addIceCandidate(c);
      } else if (m.sdp && m.sdp.type === 'answer' && p) {
        await p.pc.setRemoteDescription(m.sdp);
        for (const c of p.queue.splice(0)) await p.pc.addIceCandidate(c);
      } else if (m.ice && p) {
        if (p.pc.remoteDescription) await p.pc.addIceCandidate(m.ice); else p.queue.push(m.ice);
      }
    } catch { /* negociação falhou: tenta de novo depois */ }
  }
  drop(id, notify = true) {
    const p = this.peers.get(id); if (!p) return;
    this.peers.delete(id);
    try { p.pc.close(); } catch { /* ok */ }
    if (p.chain) { try { p.chain.src.disconnect(); p.chain.pan.disconnect(); } catch { /* ok */ } p.chain.el.srcObject = null; }
    if (notify && this.G.net.online) this._send(id, { bye: true });
  }
  dropAll() { for (const id of [...this.peers.keys()]) this.drop(id); }

  // ---------- loop ----------
  update(dt) {
    const G = this.G, net = G.net;
    if (!this.on) { if (this.peers.size) this.dropAll(); this.talking = false; this._hud(); return; }
    // conecta com quem também está com a voz ligada (o id "menor" faz a oferta)
    for (const [id, r] of net.remotes) {
      const p = this.peers.get(id);
      if (r.s && r.s.vc && !p && net.id < id) this._peer(id, true);
      if (p && r.s && !r.s.vc) this.drop(id, false);
      if (p) { p.t += dt; if (p.init && p.t > 25 && !['connected', 'connecting'].includes(p.pc.connectionState)) this.drop(id, false); } // refaz se travou
    }
    // microfone: aperte-para-falar ou voz aberta
    if (this.track) {
      const inp = G.input, typing = (G.tools && G.tools.menuOpen) || G.build.active || !G.started;
      let talk = false;
      if (this.settings.mode === 'ptt') talk = this.touchTalk || (!typing && inp.held('ptt'));
      else {
        this.level = this.micLevel();
        if (this.level > 0.02) this.hang = 0.35; else this.hang -= dt;
        talk = this.hang > 0;
      }
      this.talking = talk && !G.player.dead;
      if (this.settings.mode === 'ptt') this.level = this.talking ? this.micLevel() : 0;
      this.track.enabled = this.talking;
    } else this.talking = false;
    // posição 3D de cada voz
    const ac = this.ac;
    if (ac) {
      const cam = G.camera, L = ac.listener, f = cam.getWorldDirection(this._f), pos = cam.position;
      if (L.positionX) {
        L.positionX.value = pos.x; L.positionY.value = pos.y; L.positionZ.value = pos.z;
        L.forwardX.value = f.x; L.forwardY.value = f.y; L.forwardZ.value = f.z; L.upX.value = 0; L.upY.value = 1; L.upZ.value = 0;
      } else if (L.setPosition) { L.setPosition(pos.x, pos.y, pos.z); L.setOrientation(f.x, f.y, f.z, 0, 1, 0); }
      this.master.gain.value = this.settings.vol;
      for (const [id, p] of this.peers) {
        const c = p.chain, r = net.remotes.get(id); if (!c || !r) continue;
        const wp = r.mesh.getWorldPosition(this._v); wp.y += 1.5;
        if (this.settings.range === 'all') { c.pan.positionX.value = pos.x + f.x; c.pan.positionY.value = pos.y; c.pan.positionZ.value = pos.z + f.z; }
        else { c.pan.positionX.value = wp.x; c.pan.positionY.value = wp.y; c.pan.positionZ.value = wp.z; }
        c.an.getFloatTimeDomainData(c.buf);
        let s = 0; for (let i = 0; i < c.buf.length; i += 4) s += c.buf[i] * c.buf[i];
        p.level = Math.sqrt(s / (c.buf.length / 4));
        p.speaking = p.level > 0.012 ? 0.4 : Math.max(0, p.speaking - dt);
      }
    }
    this._hud();
  }

  _hud() {
    const el = this.hud; if (!el) return;
    const G = this.G, rows = [];
    if (this.on && this.settings.mic) rows.push(`<div class="me${this.talking ? ' on' : ''}"><i>🎙</i>${this.talking ? 'Falando' : this.settings.mode === 'ptt' ? `Segure <kbd>${keyOf('ptt')}</kbd> para falar` : 'Microfone aberto'}</div>`);
    if (this.on) for (const [id, r] of G.net.remotes) {
      const p = this.peers.get(id);
      if ((p && p.speaking > 0) || (r.s && r.s.tk)) rows.push(`<div class="on"><i>🔊</i>${(r.s && r.s.n) || 'Aliado'}</div>`);
    }
    const html = rows.join('');
    if (html !== this._html) { el.innerHTML = html; this._html = html; }
  }
}
