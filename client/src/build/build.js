// Construção física: pegar destroços, carregar, girar, soltar e soldar na jangada.
//   • A peça carregada fica na mira a uma DISTÂNCIA que a roda do mouse controla (aproxima/afasta);
//     se houver uma superfície antes disso, ela assenta na superfície.
//   • O giro é guardado RELATIVO à jangada (gira junto com ela): Shift+roda ou [girar] = 15° no
//     vertical, [inclinar] = 15° de lado; o gizmo ([R]) gira em qualquer eixo.
//   • Solda em grafo (weldgraph.js): a peça solda nas peças que ela toca; se a jangada partir, a
//     fatia solta continua inteira.
import * as THREE from '../three.js';
import { clamp } from '../core/util.js';
import { keyOf } from '../core/keybinds.js';
import { orientedBoxes } from '../world/colliders.js';
import { sea } from '../world/ocean.js';
import { BuildSnap } from './snap.js';
import { obb, touchesRaft, orphanGroups } from './weldgraph.js';

const PICKUP_DISTANCE = 2.8;   // alcance (m) do peito do jogador até o ponto mirado da peça
const BUILD_DISTANCE = 7;      // a peça carregada nunca fica mais longe que isso do jogador
const MIN_HOLD = 1.1;          // distância mínima da peça (à frente do corpo)
const WHEEL_STEP = 0.45;       // metros por "clique" da roda
const ROTATION_STEP = Math.PI / 12;
const UP = new THREE.Vector3(0, 1, 0);
const _v = new THREE.Vector3(), _q = new THREE.Quaternion();

export class Build {
  constructor(G) {
    this.G = G;
    this.active = false;
    this.rotationMode = false;
    this.held = null;
    this.original = null;
    this.qLocal = new THREE.Quaternion();  // giro da peça em relação à jangada (só o yaw do barco)
    this.rotationAnchor = null;
    this.rotationWater = false;
    this.rotationDrag = null;
    this.cameraDragging = false;
    this.pendingDeckSlot = null;
    this.candidate = null;
    this.holdDist = 3;                     // distância da peça até o corpo, ao longo da mira
    this.consumeInteraction = false;
    this.pickupTarget = null;
    this.pickupOutline = null;
    this.pickupProxyGeometry = new THREE.BoxGeometry(1, 1, 1);
    this.pickupProxyMaterial = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false, side: THREE.DoubleSide });
    this.pickupProxies = new WeakMap();
    this.nearSolids = []; this._nearT = 0;
    this.ray = new THREE.Raycaster();
    this.ndc = new THREE.Vector2();
    this.gizmo = this._makeRotationGizmo();
    G.scene.add(this.gizmo);
    // contorno verde da peça mirada: caixa ORIENTADA (gira com a peça; antes era a caixa alinhada ao
    // mundo, que ficava enorme e torta quando a peça estava girada)
    this.outline = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1)),
      new THREE.LineBasicMaterial({ color: 0x43f06b, depthTest: false, depthWrite: false, transparent: true, opacity: 0.9 }));
    this.outline.renderOrder = 999; this.outline.visible = false; this.outline.userData.noShadow = true;
    G.scene.add(this.outline);
    this.snap = new BuildSnap(G); // build assistida (pontos de encaixe)
  }

  toggleAssist() {
    const on = this.snap.toggle();
    this.G.hud.msg(on ? `Build assistida LIGADA — a peça gruda nos pontos (bolinhas) · [${keyOf('assist')}] desliga` : `Build assistida desligada · [${keyOf('assist')}] liga`);
    this._syncAssistBadge();
  }
  _syncAssistBadge() {
    const el = document.getElementById('buildAssist');
    if (!el) return;
    el.hidden = !this.active;
    el.classList.toggle('on', this.snap.on);
    el.innerHTML = `<kbd>${keyOf('assist')}</kbd> Build assistida: <b>${this.snap.on ? 'LIGADA' : 'desligada'}</b>`;
  }

  get rotating() { return this.active && this.rotationMode; }

  // ---------- giro relativo à jangada ----------
  _boatQ(out = new THREE.Quaternion()) { return out.setFromAxisAngle(UP, this.G.boat.yaw); }
  _worldQuat(out = new THREE.Quaternion()) { return this._boatQ(out).multiply(this.qLocal); }
  _setFromWorld(q) { this.qLocal.copy(this._boatQ(_q).invert().multiply(q)).normalize(); }
  // gira qLocal em volta de um eixo LOCAL da jangada
  _rotateLocal(axis, angle) { this.qLocal.premultiply(_q.setFromAxisAngle(axis, angle)).normalize(); }

  // ---------- caixa física (mundo) de um objeto ----------
  _physicsSize(obj) { return new THREE.Vector3(...(obj.physicsSize || obj.def.size || [1, 1, 1])); }
  _physicsOffset(obj) { return new THREE.Vector3(...(obj.physicsOffset || [0, 0, 0])); }
  _bodyPose(obj) {
    const b = obj.body;
    if (!b) return { p: obj.mesh.getWorldPosition(new THREE.Vector3()), q: obj.mesh.getWorldQuaternion(new THREE.Quaternion()) };
    return { p: new THREE.Vector3(b.position.x, b.position.y, b.position.z), q: new THREE.Quaternion(b.quaternion.x, b.quaternion.y, b.quaternion.z, b.quaternion.w) };
  }
  _worldBox(obj, pose = this._bodyPose(obj)) { return obb(pose.p, pose.q, obj.physicsSize || obj.def.size || [1, 1, 1], obj.physicsOffset || [0, 0, 0]); }
  // distância de um ponto até a caixa da peça (0 = dentro)
  _distToObj(obj, point) {
    const B = this._worldBox(obj), d = _v.subVectors(point, B.c);
    let s = 0;
    for (let i = 0; i < 3; i++) { const e = Math.max(0, Math.abs(d.dot(B.ax[i])) - B.h[i]); s += e * e; }
    return Math.sqrt(s);
  }
  _chest() { const p = this.G.player.body.pos; return new THREE.Vector3(p.x, p.y + 1.0, p.z); }

  // ---------- mira para pegar ----------
  _setPickupTarget(obj) {
    this.pickupTarget = obj;
    if (!obj) { this.outline.visible = false; return; }
    const pose = this._bodyPose(obj), size = this._physicsSize(obj);
    this.outline.position.copy(this._physicsOffset(obj).applyQuaternion(pose.q).add(pose.p));
    this.outline.quaternion.copy(pose.q);
    this.outline.scale.set(size.x + 0.04, size.y + 0.04, size.z + 0.04);
    this.outline.visible = true;
  }

  // Sólidos perto do jogador (o raio só testa esses; antes testava todas as malhas das ilhas por quadro)
  _refreshNearSolids(force = false) {
    const now = performance.now();
    if (!force && now - this._nearT < 250) return;
    this._nearT = now;
    const G = this.G, pp = G.player.body.pos, R = BUILD_DISTANCE + (G.player.camDist || 0) + 4, out = [];
    for (const m of G.solids) {
      if (!m || !m.visible) continue;
      const g = m.geometry; if (!g) { out.push(m); continue; }
      if (!g.boundingSphere) g.computeBoundingSphere();
      _v.copy(g.boundingSphere.center).applyMatrix4(m.matrixWorld);
      const r = g.boundingSphere.radius * Math.max(m.scale.x, m.scale.y, m.scale.z) + R;
      if (_v.distanceToSquared(pp) < r * r || g.boundingSphere.radius > 40) out.push(m);
    }
    this.nearSolids = out;
  }

  updatePickupTarget() {
    const G = this.G;
    if (this.active || G.player.dead || G.player.downed || !G.started) { this._setPickupTarget(null); return null; }
    this._refreshNearSolids();
    this._setRayFromCursor();
    const camOff = G.player.firstPerson ? 0 : G.camera.position.distanceTo(this._chest());
    this.ray.far = camOff + PICKUP_DISTANCE + 2;
    // 1) caixas de pegar (orientadas, com folga) dos destroços ao alcance
    const pp = G.player.body.pos, reach2 = (PICKUP_DISTANCE + 6) ** 2, boxes = [];
    for (const obj of G.world.physObjects) {
      if (obj.welded || obj.carriedBy || !obj.mesh.visible || !obj.body) continue;
      const b = obj.body.position;
      if ((b.x - pp.x) ** 2 + (b.z - pp.z) ** 2 > reach2) continue;
      boxes.push(this._pickupHitbox(obj));
    }
    let target = null;
    const hit = boxes.length ? this.ray.intersectObjects(boxes, false)[0] : null;
    if (hit) {
      target = hit.object.userData.pickupObject;
      // 2) algo sólido (parede, ilha, jangada) na frente? então não pega através dele
      this.ray.far = hit.distance;
      const block = this.ray.intersectObjects(this.nearSolids, false)[0];
      if (block && block.distance < hit.distance - 0.15) target = null;
      // alcance até a PEÇA (qualquer ponto dela), não até o centro: peça grande se pega pela borda
      else if (this._distToObj(target, this._chest()) > PICKUP_DISTANCE) target = null;
    }
    this._setPickupTarget(target);
    return target;
  }

  _pickupHitbox(obj) {
    let hitbox = this.pickupProxies.get(obj);
    if (!hitbox) {
      hitbox = new THREE.Mesh(this.pickupProxyGeometry, this.pickupProxyMaterial);
      hitbox.userData.pickupObject = obj;
      this.pickupProxies.set(obj, hitbox);
    }
    const pose = this._bodyPose(obj), size = this._physicsSize(obj);
    hitbox.position.copy(this._physicsOffset(obj).applyQuaternion(pose.q).add(pose.p));
    hitbox.quaternion.copy(pose.q);
    // peças finas ganham espessura para mirar fácil
    hitbox.scale.set(Math.max(0.35, size.x + 0.12), Math.max(0.35, size.y + 0.12), Math.max(0.35, size.z + 0.12));
    hitbox.updateMatrixWorld(true);
    return hitbox;
  }

  // Anéis visíveis finos + anéis de "pegada" grossos e invisíveis (fáceis de clicar).
  _makeRotationGizmo() {
    const group = new THREE.Group();
    group.visible = false;
    this.gizmoRings = [];
    for (const [axis, color] of [['x', 0xff5a5a], ['y', 0x6ef08c], ['z', 0x5aa0ff]]) {
      const material = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.6, depthTest: false, depthWrite: false });
      const ring = new THREE.Mesh(new THREE.TorusGeometry(1, 0.035, 8, 72), material);
      const hit = new THREE.Mesh(new THREE.TorusGeometry(1, 0.17, 6, 40),
        new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthTest: false, depthWrite: false, colorWrite: false }));
      for (const m of [ring, hit]) {
        if (axis === 'x') m.rotation.y = Math.PI / 2;
        if (axis === 'y') m.rotation.x = Math.PI / 2;
        m.userData.rotationAxis = axis;
      }
      ring.renderOrder = 1000; hit.userData.visual = ring;
      group.add(ring, hit);
      this.gizmoRings.push(hit);
    }
    return group;
  }

  tryPickup(obj = null) {
    if (this.active) return false;
    const target = obj || this.updatePickupTarget();
    if (!target || target.welded || target.carriedBy || !target.mesh.visible) return false;
    if (this._distToObj(target, this._chest()) > PICKUP_DISTANCE + 0.3) return false;
    this._begin(target);
    return true;
  }

  _begin(obj) {
    const G = this.G, mesh = obj.mesh;
    const position = mesh.getWorldPosition(new THREE.Vector3());
    const quaternion = mesh.getWorldQuaternion(new THREE.Quaternion());
    const scale = mesh.getWorldScale(new THREE.Vector3());
    this.original = {
      position, quaternion, scale,
      placed: !!obj.placed,
      placedOnWater: !!obj.placedOnWater,
      visible: mesh.visible,
      velocity: obj.body ? [obj.body.velocity.x, obj.body.velocity.y, obj.body.velocity.z] : [0, 0, 0],
      angularVelocity: obj.body ? [obj.body.angularVelocity.x, obj.body.angularVelocity.y, obj.body.angularVelocity.z] : [0, 0, 0],
    };
    if (G.physics.isLinked(obj)) G.hud.msg(`${obj.def.nome} arrancado da fatia solta`);
    G.physics.unlinkObject(obj); // pegar uma peça de uma fatia solta quebra a solda dela
    this.held = obj;
    this._setPickupTarget(null);
    obj.carriedBy = G.net.id;
    obj.placed = false;
    obj.placedOnWater = false;

    this._setFromWorld(quaternion);
    this.active = true;
    // começa na distância em que a peça estava (medida do corpo, ao longo da mira)
    this.holdDist = clamp(this._chest().distanceTo(position), MIN_HOLD + 0.4, 4);
    document.body.classList.add('build-mode');
    if (G.input.cursorMode) G.input.setCursorMode(false);
    G.combat.setBuildMode(true);
    G.physics.setHoldTarget(obj, position, quaternion);
    this._refreshNearSolids(true);
    this._updateHeldTarget();
    G.net.send({ t: 'carry', id: obj.id, by: G.net.id, state: this.original.placed ? this._state(obj, this.original) : null });
    G.hud.msg(`Segurando ${obj.def.nome} — roda aproxima/afasta · Shift+roda ou [${keyOf('turn')}] gira · [${keyOf('tilt')}] inclina · [${keyOf('place')}] solta · [${keyOf('weld')}] solda`);
    this._syncAssistBadge();
  }

  _setRayFromCursor() {
    const G = this.G, rect = G.renderer.domElement.getBoundingClientRect();
    const cursor = G.input.cursor;
    const cameraCenterRay = !G.input.cursorMode && (G.input.locked || G.input.freeLook);
    const cursorX = cameraCenterRay ? rect.left + rect.width / 2 : cursor.x;
    const cursorY = cameraCenterRay ? rect.top + rect.height / 2 : cursor.y;
    this.ndc.set(((cursorX - rect.left) / rect.width) * 2 - 1, -((cursorY - rect.top) / rect.height) * 2 + 1);
    G.camera.updateMatrixWorld(true);
    this.ray.setFromCamera(this.ndc, G.camera);
  }

  // Superfície na mira até `far` (sólidos por perto + destroços soltos + plano da água).
  _surfaceAtCursor(far) {
    const G = this.G;
    this._setRayFromCursor();
    this.ray.far = far;
    const targets = this.nearSolids.slice(), pp = G.player.body.pos;
    for (const obj of G.world.physObjects) {
      if (obj === this.held || obj.carriedBy || obj.welded || !obj.mesh.visible || !obj.body) continue;
      const b = obj.body.position;
      if ((b.x - pp.x) ** 2 + (b.z - pp.z) ** 2 > (BUILD_DISTANCE + 8) ** 2) continue;
      targets.push(this._pickupHitbox(obj));
    }
    const heldMesh = this.held && this.held.mesh;
    const hits = this.ray.intersectObjects(targets, true);
    for (const hit of hits) {
      let n = hit.object, mine = false;
      while (n) { if (n === heldMesh) { mine = true; break; } n = n.parent; }
      if (mine) continue;
      return { ...hit, isWater: false };
    }
    // chão (fundo do mar / morros das ilhas) e água (plano no nível do mar; antes o raio testava a
    // malha inteira do oceano, ~20 mil vértices, todo quadro)
    let best = this._terrainHit(far);
    const level = sea.level ?? 0, ground = (x, z) => (G.world.seabedHeight ? G.world.seabedHeight(x, z) : -Infinity);
    const point = this.ray.ray.intersectPlane(new THREE.Plane(UP, -level), new THREE.Vector3());
    if (point && ground(point.x, point.z) < level) {
      const distance = this.ray.ray.origin.distanceTo(point);
      if (distance <= far && (!best || distance < best.distance)) best = { point, distance, object: null, face: { normal: UP }, isWater: true };
    }
    return best;
  }

  // raio contra o terreno (altura do fundo do mar): passos de 0,3 m e refino por bissecção
  _terrainHit(far) {
    const W = this.G.world; if (!W || !W.seabedHeight) return null;
    const o = this.ray.ray.origin, d = this.ray.ray.direction, at = (t) => o.y + d.y * t - W.seabedHeight(o.x + d.x * t, o.z + d.z * t);
    let prev = 0, prevV = at(0);
    if (prevV < 0) return null;
    for (let t = 0.3; t <= far + 1e-6; t += 0.3) {
      const v = at(t);
      if (v < 0) {
        let a = prev, b = t;
        for (let i = 0; i < 6; i++) { const m = (a + b) / 2; if (at(m) < 0) b = m; else a = m; }
        const point = o.clone().addScaledVector(d, b), e = 0.25;
        const n = new THREE.Vector3(W.seabedHeight(point.x - e, point.z) - W.seabedHeight(point.x + e, point.z), 2 * e, W.seabedHeight(point.x, point.z - e) - W.seabedHeight(point.x, point.z + e)).normalize();
        return { point, distance: b, object: null, face: { normal: n }, isWater: false };
      }
      prev = t; prevV = v;
    }
    return null;
  }

  _surfaceNormal(hit) {
    const normal = hit.face && hit.face.normal && hit.object
      ? hit.face.normal.clone().transformDirection(hit.object.matrixWorld)
      : hit.face && hit.face.normal ? hit.face.normal.clone() : this.ray.ray.direction.clone().negate();
    if (normal.dot(this.ray.ray.direction) > 0) normal.negate();
    return normal.normalize();
  }

  _supportExtent(size, quaternion, normal) {
    const x = new THREE.Vector3(1, 0, 0).applyQuaternion(quaternion);
    const y = new THREE.Vector3(0, 1, 0).applyQuaternion(quaternion);
    const z = new THREE.Vector3(0, 0, 1).applyQuaternion(quaternion);
    return Math.abs(normal.dot(x)) * size.x / 2 + Math.abs(normal.dot(y)) * size.y / 2 + Math.abs(normal.dot(z)) * size.z / 2;
  }

  _positionOnSurface(point, normal, size, quaternion, offset) {
    return point.clone()
      .addScaledVector(normal, this._supportExtent(size, quaternion, normal))
      .sub(offset.clone().applyQuaternion(quaternion));
  }

  // distância da câmera até o corpo, ao longo da mira (0 em 1ª pessoa)
  _camOffset() {
    const G = this.G;
    if (G.player.firstPerson) return 0;
    this._setRayFromCursor();
    return Math.max(0, this._chest().sub(this.ray.ray.origin).dot(this.ray.ray.direction));
  }

  // Calcula onde a peça carregada deve ficar: na mira, a holdDist do corpo, ou assentada na
  // primeira superfície antes disso.
  _computeTarget() {
    const G = this.G, size = this._physicsSize(this.held), offset = this._physicsOffset(this.held);
    const quaternion = this._worldQuat();
    if (this.rotationMode && this.rotationAnchor) return { position: this.rotationAnchor.clone(), quaternion, isWater: this.rotationWater };
    const camOff = this._camOffset();
    const far = camOff + this.holdDist;
    const hit = this._surfaceAtCursor(far + Math.max(size.x, size.y, size.z) * 0.5);
    let position, isWater = false;
    // centro da peça "livre" na mira; se uma superfície estiver antes da frente da peça, assenta nela
    const free = this.ray.ray.origin.clone().addScaledVector(this.ray.ray.direction, far).sub(offset.clone().applyQuaternion(quaternion));
    if (hit) {
      const normal = this._surfaceNormal(hit);
      if (hit.distance <= far + 0.25) { // superfície antes do ponto livre: assenta nela (não atravessa)
        position = this._positionOnSurface(hit.point, normal, size, quaternion, offset);
        isWater = hit.isWater;
      }
    }
    if (!position) position = free;
    const pp = G.player.body.pos, d = position.clone().sub(pp), len = d.length();
    if (len > BUILD_DISTANCE) position.copy(pp).addScaledVector(d, BUILD_DISTANCE / len);
    return { position, quaternion, isWater };
  }

  _updateHeldTarget() {
    if (!this.active || !this.held) return;
    const { position, quaternion, isWater } = this._computeTarget();
    // build assistida: alinha e gruda nos pontos das peças vizinhas (não mexe durante o gizmo)
    this._setRayFromCursor();
    const ray = this.ray.ray.clone(), reach = this._camOffset() + BUILD_DISTANCE + 1;
    const snapped = !this.rotationMode && this.snap.apply(position, quaternion, this._physicsSize(this.held), this._physicsOffset(this.held), ray, reach);
    if (this.rotationMode) this.snap.hide();
    this.candidate = { position: position.clone(), quaternion: quaternion.clone(), isWater, valid: true, snapped };
    // mirou numa bolinha: a peça vai DIRETO para o encaixe e fica travada (sem mola, sem tremer)
    if (snapped && this.snap.result && this.snap.result.aim) this.G.physics.placeObject(this.held, position, quaternion);
    this.G.physics.setHoldTarget(this.held, position, quaternion);
  }

  resetHeldPosition() {
    if (!this.active || !this.held) return false;
    const G = this.G;
    this.holdDist = 2.6;
    const { position, quaternion, isWater } = this._computeTarget();
    this.candidate = { position: position.clone(), quaternion, isWater, valid: true };
    if (this.rotationMode) { this.rotationAnchor = position.clone(); this.rotationWater = isWater; }
    G.physics.placeObject(this.held, position, quaternion);
    G.physics.setHoldTarget(this.held, position, quaternion);
    G.hud.msg('Peça reposicionada na mira');
    return true;
  }

  _updateRotationGizmo() {
    if (!this.active || !this.held || !this.rotating) { this.gizmo.visible = false; return; }
    if (this.candidate) this.gizmo.position.copy(this.candidate.position);
    else { this.held.mesh.updateWorldMatrix(true, false); this.held.mesh.getWorldPosition(this.gizmo.position); }
    // eixos alinhados à jangada (só o giro em Y do barco): direções previsíveis, não giram com a peça
    this._boatQ(this.gizmo.quaternion);
    const size = this._physicsSize(this.held);
    const camD = this.G.camera.position.distanceTo(this.gizmo.position);
    this.gizmo.scale.setScalar(clamp(Math.max(size.x, size.y, size.z) * 0.75, 0.6, Math.max(0.6, camD * 0.32)));
    this.gizmo.visible = true;
    let hover = this.rotationDrag ? this.rotationDrag.axisName : null;
    if (!hover && !this.cameraDragging) {
      this._setRayFromCursor(); this.ray.far = 100; this.gizmo.updateMatrixWorld(true);
      const h = this.ray.intersectObjects(this.gizmoRings, false)[0];
      hover = h ? h.object.userData.rotationAxis : null;
    }
    for (const r of this.gizmoRings) {
      const on = r.userData.rotationAxis === hover;
      r.userData.visual.material.opacity = on ? 1 : 0.55;
      r.userData.visual.scale.setScalar(on ? 1.04 : 1);
    }
  }

  toggleRotationMode() {
    if (!this.active || !this.held) return false;
    if (this.rotationMode) {
      this.rotationMode = false; this.rotationDrag = null; this.rotationAnchor = null; this.cameraDragging = false;
      this.G.input.setCursorMode(false);
      this.G.hud.msg('Modo de rotação encerrado');
      return true;
    }
    const candidate = this.candidate;
    this.rotationAnchor = candidate ? candidate.position.clone() : this.held.mesh.getWorldPosition(new THREE.Vector3());
    this.rotationWater = !!(candidate && candidate.isWater);
    if (candidate) this._setFromWorld(candidate.quaternion); // começa do giro já encaixado
    this.rotationMode = true; this.rotationDrag = null; this.cameraDragging = false;
    this.G.input.setCursorMode(true);
    this._updateRotationGizmo();
    this.G.hud.msg(`Gizmo ativo — arraste um anel para girar (Shift = de 15 em 15°) · [${keyOf('gizmo')}] voltar`);
    return true;
  }

  // Arrasto em espaço de TELA: gira em volta do centro do gizmo; se o anel estiver de lado para a
  // câmera (quase uma linha), vira arrasto linear ao longo do anel — sem saltos.
  _screen(v) {
    const rect = this.G.renderer.domElement.getBoundingClientRect(), p = v.clone().project(this.G.camera);
    return new THREE.Vector2(rect.left + (p.x * 0.5 + 0.5) * rect.width, rect.top + (-p.y * 0.5 + 0.5) * rect.height);
  }
  beginGizmoDrag() {
    if (!this.rotating || !this.gizmo.visible) return false;
    this._updateRotationGizmo();
    this._setRayFromCursor();
    this.ray.far = 100;
    this.gizmo.updateMatrixWorld(true);
    const hit = this.ray.intersectObjects(this.gizmoRings, false)[0];
    if (!hit) return false;
    const axisName = hit.object.userData.rotationAxis;
    const localAxis = new THREE.Vector3(axisName === 'x' ? 1 : 0, axisName === 'y' ? 1 : 0, axisName === 'z' ? 1 : 0);
    const axis = localAxis.clone().applyQuaternion(this.gizmo.quaternion).normalize();
    const center = this.gizmo.position.clone(), cam = this.G.camera.position;
    const toCam = cam.clone().sub(center).normalize(), facing = axis.dot(toCam);
    const c2 = this._screen(center), cur = new THREE.Vector2(this.G.input.cursor.x, this.G.input.cursor.y);
    const drag = { axis, localAxis, axisName, center: c2, prev: cur.clone(), accumulatedAngle: 0, appliedAngle: 0 };
    if (Math.abs(facing) > 0.3) { drag.mode = 'circle'; drag.sign = facing > 0 ? 1 : -1; drag.prevAngle = Math.atan2(cur.y - c2.y, cur.x - c2.x); }
    else {
      const r = hit.point.clone().sub(center); r.addScaledVector(axis, -r.dot(axis));
      const tangent = new THREE.Vector3().crossVectors(axis, r).normalize();
      const t2 = this._screen(center.clone().add(r).addScaledVector(tangent, 0.5)).sub(this._screen(center.clone().add(r)));
      drag.mode = 'linear'; drag.tangent = t2.lengthSq() > 1e-6 ? t2.normalize() : new THREE.Vector2(1, 0);
    }
    this.rotationDrag = drag;
    return true;
  }

  beginCameraDrag() {
    if (!this.rotating || this.cameraDragging) return false;
    this.cameraDragging = true;
    this.rotationDrag = null;
    this.G.input.cursor.dx = this.G.input.cursor.dy = 0;
    this.G.input.setCursorMode(false);
    return true;
  }

  endCameraDrag() {
    if (!this.cameraDragging) return false;
    this.cameraDragging = false;
    this.G.input.mouse.dx = this.G.input.mouse.dy = 0;
    if (this.rotating) this.G.input.setCursorMode(true);
    return true;
  }

  _updateGizmoDrag() {
    const drag = this.rotationDrag;
    if (!drag) return;
    if (!this.G.input.mouse.left) { this.rotationDrag = null; return; }
    const cur = new THREE.Vector2(this.G.input.cursor.x, this.G.input.cursor.y);
    let d = 0;
    if (drag.mode === 'circle') {
      const a = Math.atan2(cur.y - drag.center.y, cur.x - drag.center.x);
      let da = a - drag.prevAngle;
      if (da > Math.PI) da -= Math.PI * 2; if (da < -Math.PI) da += Math.PI * 2;
      if (cur.distanceTo(drag.center) > 8) d = -da * drag.sign; // tela com y para baixo: anti-horário = ângulo negativo
      drag.prevAngle = a;
    } else {
      d = ((cur.x - drag.prev.x) * drag.tangent.x + (cur.y - drag.prev.y) * drag.tangent.y) * 0.012;
    }
    drag.prev.copy(cur);
    drag.accumulatedAngle += d;
    const targetAngle = this.G.input.held('fine') ? Math.round(drag.accumulatedAngle / ROTATION_STEP) * ROTATION_STEP : drag.accumulatedAngle;
    const deltaAngle = targetAngle - drag.appliedAngle;
    if (Math.abs(deltaAngle) > 1e-6) { this._rotateLocal(drag.localAxis, deltaAngle); drag.appliedAngle = targetAngle; }
  }

  // Inclinar: em volta do eixo da jangada (X ou Z) que fica mais "de lado" para a câmera.
  _tiltAxis() {
    const G = this.G, f = new THREE.Vector3();
    G.camera.getWorldDirection(f);
    f.applyQuaternion(this._boatQ(_q).invert()); // direção da câmera no espaço da jangada
    return Math.abs(f.x) > Math.abs(f.z) ? new THREE.Vector3(0, 0, Math.sign(f.x) || 1) : new THREE.Vector3(-(Math.sign(f.z) || 1), 0, 0);
  }
  // endireita: tira a inclinação e arredonda o giro para múltiplos de 90° da jangada
  _straighten() {
    const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(this.qLocal);
    let yaw = Math.atan2(fwd.x, fwd.z);
    if (Math.abs(fwd.y) > 0.9) { const r = new THREE.Vector3(1, 0, 0).applyQuaternion(this.qLocal); yaw = Math.atan2(r.x, r.z) - Math.PI / 2; }
    yaw = Math.round(yaw / (Math.PI / 2)) * (Math.PI / 2);
    this.qLocal.setFromAxisAngle(UP, yaw);
  }

  _state(obj, transform) {
    const position = transform ? transform.position : obj.mesh.getWorldPosition(new THREE.Vector3());
    const quaternion = transform ? transform.quaternion : obj.mesh.getWorldQuaternion(new THREE.Quaternion());
    return { id: obj.id, p: position.toArray(), q: quaternion.toArray(), placed: true, water: transform ? transform.placedOnWater : !!obj.placedOnWater };
  }

  _endMode() {
    this.active = false;
    this.rotationMode = false;
    this.rotationDrag = null;
    this.cameraDragging = false;
    this.rotationAnchor = null;
    this.candidate = null;
    this.held = null;
    this.original = null;
    this.gizmo.visible = false;
    this.snap.hide();
    document.body.classList.remove('build-mode');
    this._syncAssistBadge();
    if (this.G.input.cursorMode) this.G.input.setCursorMode(false);
    this.G.combat.setBuildMode(false);
  }

  place() {
    if (!this.active || !this.held) return false;
    if (this.rotationMode) return false;
    this._updateHeldTarget();
    if (!this.candidate || !this.candidate.valid) { this.G.hud.msg('Muito longe para soltar a peça'); return false; }
    const G = this.G, obj = this.held, candidate = this.candidate;
    const body = obj.body;
    const transform = {
      position: new THREE.Vector3(body.position.x, body.position.y, body.position.z),
      quaternion: new THREE.Quaternion(body.quaternion.x, body.quaternion.y, body.quaternion.z, body.quaternion.w),
      velocity: [body.velocity.x * 0.3, body.velocity.y * 0.3, body.velocity.z * 0.3],
      angularVelocity: [0, 0, 0],
    };
    obj.mesh.position.copy(transform.position);
    obj.mesh.quaternion.copy(transform.quaternion);
    obj.mesh.visible = true;
    obj.carriedBy = null;
    obj.placed = true;
    obj.placedOnWater = candidate.isWater;
    G.physics.releaseHold(obj);
    obj.x = transform.position.x;
    obj.z = transform.position.z;
    const state = this._state(obj);
    G.world.applyPlacedState(obj.id, state);
    G.physics.releaseHold(obj, transform);
    this._endMode();
    G.net.send({ t: 'place', id: obj.id, state });
    G.hud.msg(`${obj.def.nome} solto — aponte e clique para pegar ou mover`);
    return true;
  }

  cancel() {
    if (!this.active || !this.held || !this.original) return false;
    const G = this.G, obj = this.held, original = this.original;
    if (obj.mesh.parent) obj.mesh.parent.remove(obj.mesh);
    G.scene.add(obj.mesh);
    obj.mesh.position.copy(original.position);
    obj.mesh.quaternion.copy(original.quaternion);
    obj.mesh.scale.copy(original.scale);
    obj.mesh.visible = original.visible;
    obj.carriedBy = null;
    obj.placed = original.placed;
    obj.placedOnWater = original.placedOnWater;
    G.physics.releaseHold(obj, original);
    if (original.placed) {
      const state = this._state(obj);
      G.world.applyPlacedState(obj.id, state);
      G.physics.releaseHold(obj, original);
      G.net.send({ t: 'carry', id: obj.id, by: null, state });
    } else {
      G.net.send({ t: 'carry', id: obj.id, by: null, state: null });
    }
    this._endMode();
    G.hud.msg('Construção cancelada');
    return true;
  }

  // Pode soldar se a peça ENCOSTA numa peça da jangada: contato da física OU (mais confiável) as
  // caixas se tocando — na pose atual ou no encaixe da build assistida. Antes só valia o contato da
  // física, que some quando a peça fica exatamente rente (encaixe perfeito = "sem contato").
  canWeld(obj) {
    if (!obj || !this.active || obj !== this.held || obj.welded || !obj.body) return false;
    const G = this.G, boat = G.boat;
    this.pendingDeckSlot = null;
    const pose = this._bodyPose(obj), c = this.candidate;
    const touching = G.physics.hasRaftContact(obj) || touchesRaft(boat, this._worldBox(obj, pose)) ||
      (c && c.snapped && touchesRaft(boat, this._worldBox(obj, { p: c.position, q: c.quaternion })));
    if (!touching) return false;
    const size = this._physicsSize(obj);
    const deckSlot = boat.matchDeckSlot(pose.p, obj.def.pieceType, 0.85);
    if (deckSlot && (size.x < deckSlot.size - 0.01 || size.z < deckSlot.size - 0.01)) return false;
    this.pendingDeckSlot = deckSlot;
    return true;
  }

  weld(obj) {
    if (!this.canWeld(obj)) {
      this.G.hud.msg('A peça precisa estar encostada numa peça da jangada');
      return false;
    }
    const G = this.G, boat = G.boat, mesh = obj.mesh;
    const slot = this.pendingDeckSlot;
    let { p: position, q: quaternion } = this._bodyPose(obj);
    // build assistida: solda exatamente no encaixe (a física deixa a peça a milímetros dele)
    const c = this.candidate;
    if (c && c.snapped && c.position.distanceTo(position) < 0.45) { position = c.position.clone(); quaternion = c.quaternion.clone(); }
    mesh.position.copy(position);
    mesh.quaternion.copy(quaternion);
    G.physics.releaseHold(obj, { position, quaternion });
    boat.group.updateMatrixWorld(true);
    const localPosition = boat.group.worldToLocal(position.clone());
    const localQuaternion = boat.group.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(quaternion);
    const localRotation = new THREE.Euler().setFromQuaternion(localQuaternion, 'YXZ');
    const size = this._physicsSize(obj).toArray();
    const physOffset = this._physicsOffset(obj).toArray();
    const piece = {
      id: G.net.nextId(),
      type: obj.def.pieceType || 'tabua',
      x: localPosition.x, y: localPosition.y, z: localPosition.z,
      yaw: localRotation.y, rotX: localRotation.x, rotZ: localRotation.z,
      physObjId: obj.id, physSize: size, physOffset,
      ...(slot ? { startSlotId: slot.id } : {}),
    };
    const networkPiece = {
      id: piece.id, type: piece.type, x: piece.x, y: piece.y, z: piece.z,
      yaw: piece.yaw, rotX: piece.rotX, rotZ: piece.rotZ,
      physObjId: piece.physObjId, physSize: piece.physSize, physOffset: piece.physOffset,
      ...(piece.startSlotId ? { startSlotId: piece.startSlotId } : {}),
    };
    this.pendingDeckSlot = null;
    this._attachWelded(obj, piece);
    G.net.send({ t: 'weld', physId: obj.id, piece: networkPiece });
    this.consumeInteraction = true;
    this._endMode();
    G.hud.msg(`${obj.def.nome} soldado na jangada`);
    return true;
  }

  _attachWelded(obj, piece) {
    const G = this.G, boat = G.boat;
    G.physics.releaseHold(obj);
    if (obj.mesh.parent) obj.mesh.parent.remove(obj.mesh);
    boat.group.add(obj.mesh);
    obj.mesh.position.set(piece.x, piece.y, piece.z);
    obj.mesh.rotation.set(piece.rotX || 0, piece.yaw, piece.rotZ || 0, 'YXZ');
    obj.mesh.visible = true;
    const size = piece.physSize || obj.physicsSize || obj.def.size || [1, 1, 1];
    const offset = new THREE.Vector3(...(piece.physOffset || obj.physicsOffset || [0, 0, 0])).applyQuaternion(obj.mesh.quaternion);
    // hitbox acompanha o giro em todos os eixos: peça inclinada vira fatias justas (não uma caixa enorme)
    const cols = orientedBoxes(
      piece.x + offset.x, piece.y + offset.y, piece.z + offset.z,
      size[0] / 2, size[1] / 2, size[2] / 2,
      piece.yaw, piece.rotX || 0, piece.rotZ || 0,
      obj.def && obj.def.col === 'ramp' ? 'ramp' : 'box' // rampa: colisão inclinada (sobe para +Z)
    );
    boat.set.items.push(...cols);
    obj.mesh.traverse((child) => { if (child.isMesh) { child.buildPiece = piece; G.solids.push(child); } });
    piece.mesh = obj.mesh;
    piece.col = cols[0];
    piece.cols = cols;
    piece.physObj = obj;
    obj.buildPiece = piece;
    G.world.weldedStates.set(obj.id, {
      id: piece.id, type: piece.type, x: piece.x, y: piece.y, z: piece.z,
      yaw: piece.yaw, rotX: piece.rotX, rotZ: piece.rotZ,
      physObjId: obj.id, physSize: piece.physSize, physOffset: piece.physOffset,
      ...(piece.startSlotId ? { startSlotId: piece.startSlotId } : {}),
    });
    G.physics.attachWeldedObject(obj, piece);
    boat.pieces.set(piece.id, piece);
    boat.recalcRadius();
    obj.welded = true;
    obj.weldedPieceId = piece.id;
    obj.placed = false;
    obj.placedOnWater = false;
    obj.carriedBy = null;
    G.world.placedStates.delete(obj.id);
    G.world.remoteCarries.delete(obj.id);
    const index = G.world.physObjects.indexOf(obj);
    if (index >= 0) G.world.physObjects.splice(index, 1);
    this._nearT = 0;
  }

  applyRemoteWeld(message) {
    const G = this.G;
    if (message.piece && message.physId) G.world.weldedStates.set(message.physId, message.piece);
    const obj = G.world.physObjects.find((item) => item.id === message.physId);
    if (!obj || obj.welded) return;
    this._attachWelded(obj, message.piece);
  }

  tryRemoveWelded(pieceId, broadcast = true, quiet = false) {
    const G = this.G, boat = G.boat;
    const piece = boat.pieces.get(pieceId);
    if (!piece || !piece.physObj || piece.type === 'mastro' || piece.indestructible ||
        (piece.startSlotId && !G.startup.departed)) {
      if (!quiet) G.hud.msg('Essa peça não pode ser removida');
      return false;
    }
    const obj = piece.physObj, position = piece.mesh.getWorldPosition(new THREE.Vector3());
    const quaternion = piece.mesh.getWorldQuaternion(new THREE.Quaternion());
    G.physics.detachWeldedObject(obj, pieceId, position, quaternion);
    boat.group.remove(piece.mesh);
    piece.mesh.traverse((child) => {
      if (child.isMesh) {
        const index = G.solids.indexOf(child);
        if (index >= 0) G.solids.splice(index, 1);
        delete child.buildPiece;
      }
    });
    for (const col of piece.cols || [piece.col]) { const i = boat.set.items.indexOf(col); if (i >= 0) boat.set.items.splice(i, 1); }
    boat.pieces.delete(pieceId);
    boat.recalcRadius();

    G.scene.add(obj.mesh);
    obj.mesh.position.copy(position);
    obj.mesh.quaternion.copy(quaternion);
    obj.mesh.visible = true;
    obj.welded = false;
    obj.weldedPieceId = null;
    obj.carriedBy = null;
    obj.placed = false;          // solta: boia / cai na água em vez de ficar congelada no ar
    obj.placedOnWater = false;
    obj.x = position.x;
    obj.z = position.z;
    G.world.physObjects.push(obj);
    if (!G.world.debris.includes(obj)) G.world.debris.push(obj);
    G.world.weldedStates.delete(obj.id);
    const state = { ...this._state(obj), placed: false };
    G.world.placedStates.delete(obj.id);
    if (broadcast) G.net.send({ t: 'unweld', pieceId, state, physId: obj.id });
    this._nearT = 0;
    return true;
  }

  // Depois de uma peça sair da jangada (quebrou / dessoldada): as peças que ficaram sem ligação
  // com o núcleo se soltam JUNTAS — cada fatia continua soldada entre si e boia separada.
  splitOrphans() {
    const G = this.G, boat = G.boat;
    boat.group.updateMatrixWorld(true);
    const groups = orphanGroups(boat);
    if (!groups.length) return 0;
    let n = 0;
    for (const g of groups) {
      const objs = new Map();
      for (const piece of g.pieces) {
        const obj = piece.physObj;
        if (obj && this.tryRemoveWelded(piece.id, true, true)) { objs.set(piece, obj); n++; }
      }
      for (const [a, b] of g.links) { const oa = objs.get(a), ob = objs.get(b); if (oa && ob) G.physics.linkObjects(oa, ob); }
      for (const obj of objs.values()) if (obj.body) { obj.body.velocity.y += 0.6; obj.body.wakeUp(); }
    }
    if (n) G.hud.msg(n === 1 ? 'Uma peça perdeu a ligação com a jangada e se soltou!' : `A jangada partiu: uma fatia de ${n} peças se soltou!`);
    return n;
  }

  update() {
    const G = this.G, inp = G.input;
    if (this.active && this.held && this.held.body) { // multiplayer: posição da peça carregada (~12×/s)
      const now = performance.now();
      if (now - (this._dragSent || 0) > 80) {
        this._dragSent = now;
        const b = this.held.body, r = (v) => Math.round(v * 100) / 100, rq = (v) => Math.round(v * 1000) / 1000;
        G.net.send({ t: 'drag', id: this.held.id, p: [r(b.position.x), r(b.position.y), r(b.position.z)], q: [rq(b.quaternion.x), rq(b.quaternion.y), rq(b.quaternion.z), rq(b.quaternion.w)] });
      }
    }
    if (this.active) {
      if (inp.hit('Escape')) { this.cancel(); return; }
      if (inp.act('place')) { this.place(); return; }
      if (inp.act('assist')) this.toggleAssist();
      if (inp.act('gizmo')) this.toggleRotationMode();
      if (this.cameraDragging && !inp.mouse.right) this.endCameraDrag();
      if (this.rotationMode) this._updateGizmoDrag();
      this._refreshNearSolids();
      // roda: aproxima/afasta a peça · Shift+roda: gira 15° no vertical
      if (inp.mouse.wheel) {
        const s = Math.sign(inp.mouse.wheel);
        if (inp.held('fine')) this._rotateLocal(UP, -s * ROTATION_STEP);
        else if (!this.rotationMode) this.holdDist = clamp(this.holdDist - s * WHEEL_STEP, MIN_HOLD, BUILD_DISTANCE);
      }
      if (inp.act('turn')) this._rotateLocal(UP, (inp.held('fine') ? -1 : 1) * ROTATION_STEP);
      if (inp.act('tilt')) this._rotateLocal(this._tiltAxis(), (inp.held('fine') ? -1 : 1) * ROTATION_STEP);
      if (inp.act('straighten')) this._straighten();
      if (inp.act('resetPos')) this.resetHeldPosition();
      else this._updateHeldTarget();
      this._updateRotationGizmo();
      if (inp.act('weld')) this.weld(this.held);
      return;
    }
    this.updatePickupTarget();
  }
}
