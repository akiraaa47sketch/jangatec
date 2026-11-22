import * as THREE from '../three.js';
import { clamp } from '../core/util.js';
import { keyOf } from '../core/keybinds.js';
import { BuildSnap } from './snap.js';

const PICKUP_DISTANCE = 2.8;
const BUILD_DISTANCE = 7;
const DEFAULT_DRAG_DISTANCE = 3.5;
const ROTATION_STEP = Math.PI / 12;
const UP = new THREE.Vector3(0, 1, 0);

export class Build {
  constructor(G) {
    this.G = G;
    this.active = false;
    this.rotationMode = false;
    this.held = null;
    this.original = null;
    this.rotation = new THREE.Euler(0, 0, 0, 'YXZ');
    this.rotationQuaternion = new THREE.Quaternion();
    this.rotationAnchor = null;
    this.rotationWater = false;
    this.rotationDrag = null;
    this.cameraDragging = false;
    this.pendingDeckSlot = null;
    this.candidate = null;
    this.dragDistance = DEFAULT_DRAG_DISTANCE;
    this.consumeInteraction = false;
    this.pickupTarget = null;
    this.pickupOutline = null;
    this.pickupProxyGeometry = new THREE.BoxGeometry(1, 1, 1);
    this.pickupProxyMaterial = new THREE.MeshBasicMaterial({
      colorWrite: false,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.pickupProxies = new WeakMap();
    this.ray = new THREE.Raycaster();
    this.ndc = new THREE.Vector2();
    this.gizmo = this._makeRotationGizmo();
    G.scene.add(this.gizmo);
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

  _setPickupTarget(obj) {
    if (this.pickupTarget === obj) {
      if (this.pickupOutline) this.pickupOutline.update();
      return;
    }
    if (this.pickupOutline) {
      this.G.scene.remove(this.pickupOutline);
      this.pickupOutline.geometry.dispose();
      this.pickupOutline.material.dispose();
      this.pickupOutline = null;
    }
    this.pickupTarget = obj;
    if (!obj) return;

    this.pickupOutline = new THREE.BoxHelper(obj.mesh, 0x43f06b);
    this.pickupOutline.material.depthTest = false;
    this.pickupOutline.material.depthWrite = false;
    this.pickupOutline.renderOrder = 999;
    this.G.scene.add(this.pickupOutline);
  }

  updatePickupTarget() {
    if (this.active || this.G.player.dead || this.G.player.downed || !this.G.started) {
      this._setPickupTarget(null);
      return null;
    }

    const G = this.G;
    const targets = this._rayTargets(true);
    this._setRayFromCursor();
    this.ray.far = PICKUP_DISTANCE + 6;
    const hit = this.ray.intersectObjects(targets, true)[0];
    let target = null;
    if (hit) {
      target = hit.object.userData.pickupObject || G.world.physObjects.find((obj) => {
        if (obj.welded || obj.carriedBy || !obj.mesh.visible) return false;
        let node = hit.object;
        while (node) {
          if (node === obj.mesh) return true;
          node = node.parent;
        }
        return false;
      }) || null;
    }
    if (target) {
      const position = target.mesh.getWorldPosition(new THREE.Vector3());
      const distance = position.distanceTo(G.player.body.pos);
      if (distance > PICKUP_DISTANCE) target = null;
    }
    this._setPickupTarget(target);
    return target;
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
    if (!target || target.welded || target.carriedBy || !target.mesh.visible) {
      return false;
    }
    const distance = target.mesh.getWorldPosition(new THREE.Vector3()).distanceTo(this.G.player.body.pos);
    if (distance > PICKUP_DISTANCE) return false;
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
    this.held = obj;
    this._setPickupTarget(null);
    obj.carriedBy = G.net.id;
    obj.placed = false;
    obj.placedOnWater = false;

    this.rotation.setFromQuaternion(quaternion, 'YXZ');
    this.active = true;
    this.dragDistance = clamp(G.camera.position.distanceTo(position), 2, DEFAULT_DRAG_DISTANCE);
    document.body.classList.add('build-mode');
    if (G.input.cursorMode) G.input.setCursorMode(false);
    G.combat.setBuildMode(true);
    G.physics.setHoldTarget(obj, position, quaternion);
    this._updateHeldTarget();
    G.net.send({ t: 'carry', id: obj.id, by: G.net.id, state: this.original.placed ? this._state(obj, this.original) : null });
    G.hud.msg(`Segurando ${obj.def.nome} — encoste na jangada para soldar · [${keyOf('resetPos')}] reposiciona · [${keyOf('place')}] solta · [${keyOf('gizmo')}] gizmo · [${keyOf('weld')}] solda · [${keyOf('assist')}] build assistida`);
    this._syncAssistBadge();
  }

  _rayTargets(includePickupHitboxes = false) {
    const G = this.G;
    const targets = new Set(G.solids), pp = G.player.body.pos, reach2 = (PICKUP_DISTANCE + 4) ** 2;
    for (const obj of G.world.physObjects) {
      if (obj === this.held || obj.carriedBy || obj.welded || !obj.mesh.visible) continue;
      // para pegar, só interessa o que está ao alcance (antes testava todos os ~200 destroços por quadro)
      if (includePickupHitboxes && (obj.mesh.position.x - pp.x) ** 2 + (obj.mesh.position.z - pp.z) ** 2 > reach2 && obj.mesh.parent === G.scene) continue;
      targets.add(obj.mesh);
      if (includePickupHitboxes) {
        const hitbox = this._pickupHitbox(obj);
        if (hitbox) targets.add(hitbox);
      }
    }
    if (G.ocean && G.ocean.mesh && !includePickupHitboxes) targets.add(G.ocean.mesh); // o mar não importa para pegar peças
    if (this.held) {
      for (const object of Array.from(targets)) {
        let parent = object;
        while (parent) {
          if (parent === this.held.mesh) { targets.delete(object); break; }
          parent = parent.parent;
        }
      }
    }
    return Array.from(targets).filter((object) => object && object.visible);
  }

  _pickupHitbox(obj) {
    if (!obj.body) return null;
    let hitbox = this.pickupProxies.get(obj);
    if (!hitbox) {
      hitbox = new THREE.Mesh(this.pickupProxyGeometry, this.pickupProxyMaterial);
      hitbox.userData.pickupObject = obj;
      this.pickupProxies.set(obj, hitbox);
    }

    const body = obj.body;
    const quaternion = new THREE.Quaternion(
      body.quaternion.x, body.quaternion.y, body.quaternion.z, body.quaternion.w
    );
    const offset = this._physicsOffset(obj).applyQuaternion(quaternion);
    hitbox.position.set(
      body.position.x + offset.x,
      body.position.y + offset.y,
      body.position.z + offset.z
    );
    hitbox.quaternion.copy(quaternion);
    hitbox.scale.copy(this._physicsSize(obj));
    hitbox.updateMatrixWorld(true);
    return hitbox;
  }

  _surfaceAtCursor() {
    const G = this.G;
    this._setRayFromCursor();
    this.ray.far = BUILD_DISTANCE + G.player.camDist + 1;
    const targets = this._rayTargets();
    const hit = this.ray.intersectObjects(targets, true)[0];
    if (hit) return { ...hit, isWater: hit.object === (G.ocean && G.ocean.mesh), targets };

    const plane = new THREE.Plane(UP, -G.boat.set.y);
    const point = this.ray.ray.intersectPlane(plane, new THREE.Vector3());
    if (!point) return null;
    const distance = this.ray.ray.origin.distanceTo(point);
    if (distance > this.ray.far) return null;
    return {
      point,
      distance,
      object: G.ocean && G.ocean.mesh,
      face: { normal: UP },
      isWater: true,
      targets,
    };
  }

  _setRayFromCursor() {
    const G = this.G, rect = G.renderer.domElement.getBoundingClientRect();
    const cursor = G.input.cursor;
    const cameraCenterRay = !G.input.cursorMode && (G.input.locked || G.input.freeLook);
    const cursorX = cameraCenterRay ? rect.left + rect.width / 2 : cursor.x;
    const cursorY = cameraCenterRay ? rect.top + rect.height / 2 : cursor.y;
    this.ndc.set(
      ((cursorX - rect.left) / rect.width) * 2 - 1,
      -((cursorY - rect.top) / rect.height) * 2 + 1
    );
    G.camera.updateMatrixWorld(true);
    this.ray.setFromCamera(this.ndc, G.camera);
  }

  _surfaceNormal(hit) {
    const normal = hit.face && hit.face.normal
      ? hit.face.normal.clone().transformDirection(hit.object.matrixWorld)
      : this.ray.ray.direction.clone().negate();
    if (normal.dot(this.ray.ray.direction) > 0) normal.negate();
    return normal.normalize();
  }

  _supportExtent(size, quaternion, normal) {
    const x = new THREE.Vector3(1, 0, 0).applyQuaternion(quaternion);
    const y = new THREE.Vector3(0, 1, 0).applyQuaternion(quaternion);
    const z = new THREE.Vector3(0, 0, 1).applyQuaternion(quaternion);
    return Math.abs(normal.dot(x)) * size.x / 2 +
      Math.abs(normal.dot(y)) * size.y / 2 +
      Math.abs(normal.dot(z)) * size.z / 2;
  }

  _physicsSize(obj) {
    return new THREE.Vector3(...(obj.physicsSize || obj.def.size || [1, 1, 1]));
  }

  _physicsOffset(obj) {
    return new THREE.Vector3(...(obj.physicsOffset || [0, 0, 0]));
  }

  _positionOnSurface(point, normal, size, quaternion, offset) {
    return point.clone()
      .addScaledVector(normal, this._supportExtent(size, quaternion, normal))
      .sub(offset.clone().applyQuaternion(quaternion));
  }

  _updateHeldTarget() {
    if (!this.active || !this.held) return;
    const size = this._physicsSize(this.held);
    let position, isWater = false, rotation = this.rotation.clone();
    if (this.rotationMode && this.rotationAnchor) {
      position = this.rotationAnchor.clone();
      isWater = this.rotationWater;
    } else {
      const hit = this._surfaceAtCursor();
      if (hit && hit.object) {
        const normal = this._surfaceNormal(hit);
        const point = hit.point;
        const quaternion = new THREE.Quaternion().setFromEuler(rotation);
        position = this._positionOnSurface(
          point, normal, size, quaternion, this._physicsOffset(this.held)
        );
        isWater = hit.isWater;
        this.dragDistance = clamp(this.ray.ray.origin.distanceTo(position), 2, BUILD_DISTANCE);
      } else {
        position = this.ray.ray.origin.clone()
          .addScaledVector(this.ray.ray.direction, this.dragDistance);
      }
    }
    const playerPosition = this.G.player.body.pos;
    const offset = position.clone().sub(playerPosition);
    const distance = offset.length();
    if (distance > BUILD_DISTANCE) position.copy(playerPosition).addScaledVector(offset, BUILD_DISTANCE / distance);
    const quaternion = new THREE.Quaternion().setFromEuler(rotation);
    // build assistida: alinha e gruda nos pontos das peças vizinhas (não mexe durante o gizmo)
    const snapped = !this.rotationMode && this.snap.apply(position, quaternion, size, this._physicsOffset(this.held));
    if (this.rotationMode) this.snap.hide();
    this.candidate = { position: position.clone(), quaternion, isWater, valid: true, snapped };
    this.G.physics.setHoldTarget(this.held, position, quaternion);
  }

  resetHeldPosition() {
    if (!this.active || !this.held) return false;
    const G = this.G;
    const hit = this._surfaceAtCursor();
    const quaternion = this.candidate
      ? this.candidate.quaternion.clone()
      : this.held.mesh.getWorldQuaternion(new THREE.Quaternion());
    const size = this._physicsSize(this.held);
    let position, isWater = false;

    if (hit && hit.object) {
      const normal = this._surfaceNormal(hit);
      const point = hit.point;
      position = this._positionOnSurface(
        point, normal, size, quaternion, this._physicsOffset(this.held)
      );
      isWater = hit.isWater;
    } else {
      position = this.ray.ray.origin.clone()
        .addScaledVector(this.ray.ray.direction, DEFAULT_DRAG_DISTANCE);
    }

    const offset = position.clone().sub(G.player.body.pos);
    const distance = offset.length();
    if (distance > BUILD_DISTANCE) {
      position.copy(G.player.body.pos).addScaledVector(offset, BUILD_DISTANCE / distance);
    }

    this.candidate = { position: position.clone(), quaternion, isWater, valid: true };
    this.dragDistance = clamp(this.ray.ray.origin.distanceTo(position), 2, BUILD_DISTANCE);
    if (this.rotationMode) {
      this.rotationAnchor = position.clone();
      this.rotationWater = isWater;
    }
    G.physics.placeObject(this.held, position, quaternion);
    G.physics.setHoldTarget(this.held, position, quaternion);
    G.hud.msg('Peça reposicionada na mira');
    return true;
  }

  _updateRotationGizmo() {
    if (!this.active || !this.held || !this.rotating) {
      this.gizmo.visible = false;
      return;
    }
    if (this.candidate) this.gizmo.position.copy(this.candidate.position);
    else { this.held.mesh.updateWorldMatrix(true, false); this.held.mesh.getWorldPosition(this.gizmo.position); }
    // eixos alinhados à jangada (só o giro em Y do barco): direções previsíveis, não giram com a peça
    this.gizmo.quaternion.setFromAxisAngle(UP, this.G.boat.yaw);
    const size = this._physicsSize(this.held);
    // tamanho segue a peça, mas nunca sai da tela quando a câmera está perto
    const camD = this.G.camera.position.distanceTo(this.gizmo.position);
    this.gizmo.scale.setScalar(clamp(Math.max(size.x, size.y, size.z) * 0.75, 0.6, Math.max(0.6, camD * 0.32)));
    this.gizmo.visible = true;
    // destaque do anel sob o cursor (ou do que está sendo arrastado)
    let hover = this.rotationDrag ? this.rotationDrag.axisName : null;
    if (!hover && !this.cameraDragging) {
      this._setRayFromCursor(); this.gizmo.updateMatrixWorld(true);
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
      this.rotationMode = false;
      this.rotationDrag = null;
      this.rotationAnchor = null;
      this.cameraDragging = false;
      this.G.input.setCursorMode(false);
      this.G.hud.msg('Modo de rotação encerrado');
      return true;
    }

    const candidate = this.candidate;
    this.rotationAnchor = candidate
      ? candidate.position.clone()
      : this.held.mesh.getWorldPosition(new THREE.Vector3());
    this.rotationWater = !!(candidate && candidate.isWater);
    this.rotationQuaternion = candidate
      ? candidate.quaternion.clone()
      : this.held.mesh.getWorldQuaternion(new THREE.Quaternion());
    this.rotation.setFromQuaternion(this.rotationQuaternion, 'YXZ');
    this.rotationMode = true;
    this.rotationDrag = null;
    this.cameraDragging = false;
    this.G.input.setCursorMode(true);
    this._updateRotationGizmo();
    this.G.hud.msg(`Gizmo ativo — arraste um anel para girar · [${keyOf('gizmo')}] voltar`);
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
    this.ray.far = BUILD_DISTANCE + this.G.player.camDist + 2;
    this.gizmo.updateMatrixWorld(true);
    const hit = this.ray.intersectObjects(this.gizmoRings, false)[0];
    if (!hit) return false;
    const axisName = hit.object.userData.rotationAxis;
    const axis = new THREE.Vector3(axisName === 'x' ? 1 : 0, axisName === 'y' ? 1 : 0, axisName === 'z' ? 1 : 0)
      .applyQuaternion(this.gizmo.quaternion).normalize();
    const center = this.gizmo.position.clone(), cam = this.G.camera.position;
    const toCam = cam.clone().sub(center).normalize(), facing = axis.dot(toCam);
    const c2 = this._screen(center), cur = new THREE.Vector2(this.G.input.cursor.x, this.G.input.cursor.y);
    const drag = { axis, axisName, center: c2, prev: cur.clone(), accumulatedAngle: 0, appliedAngle: 0 };
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
    const targetAngle = this.G.input.held('fine')
      ? Math.round(drag.accumulatedAngle / ROTATION_STEP) * ROTATION_STEP
      : drag.accumulatedAngle;
    const deltaAngle = targetAngle - drag.appliedAngle;
    if (Math.abs(deltaAngle) > 1e-6) {
      this.rotationQuaternion.premultiply(new THREE.Quaternion().setFromAxisAngle(drag.axis, deltaAngle)).normalize();
      this.rotation.setFromQuaternion(this.rotationQuaternion, 'YXZ');
      drag.appliedAngle = targetAngle;
    }
  }

  // Giro rápido sem gizmo: roda do mouse = 15° em torno do vertical; Shift+roda = inclina.
  _quickRotate(steps, tilt) {
    const q = this.rotationQuaternion && this.rotationMode ? this.rotationQuaternion : new THREE.Quaternion().setFromEuler(this.rotation);
    const axis = tilt ? new THREE.Vector3(1, 0, 0).applyAxisAngle(UP, this.G.boat.yaw) : UP.clone();
    q.premultiply(new THREE.Quaternion().setFromAxisAngle(axis, steps * ROTATION_STEP)).normalize();
    this.rotation.setFromQuaternion(q, 'YXZ');
    if (this.rotationMode) this.rotationQuaternion = q;
  }

  _state(obj, transform) {
    const position = transform ? transform.position : obj.mesh.getWorldPosition(new THREE.Vector3());
    const quaternion = transform ? transform.quaternion : obj.mesh.getWorldQuaternion(new THREE.Quaternion());
    return {
      id: obj.id,
      p: position.toArray(),
      q: quaternion.toArray(),
      placed: true,
      water: transform ? transform.placedOnWater : !!obj.placedOnWater,
    };
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
    if (!this.candidate || !this.candidate.valid) {
      this.G.hud.msg('Muito longe para soltar a peça');
      return false;
    }

    const G = this.G, obj = this.held, candidate = this.candidate;
    const body = obj.body;
    const transform = {
      position: new THREE.Vector3(body.position.x, body.position.y, body.position.z),
      quaternion: new THREE.Quaternion(body.quaternion.x, body.quaternion.y, body.quaternion.z, body.quaternion.w),
      velocity: [body.velocity.x, body.velocity.y, body.velocity.z],
      angularVelocity: [body.angularVelocity.x, body.angularVelocity.y, body.angularVelocity.z],
    };
    obj.mesh.position.copy(transform.position);
    obj.mesh.quaternion.copy(transform.quaternion);
    obj.mesh.visible = true;
    obj.carriedBy = null;
    obj.placed = true;
    obj.placedOnWater = candidate.isWater;
    G.physics.releaseHold(obj);
    const position = obj.mesh.getWorldPosition(new THREE.Vector3());
    obj.x = position.x;
    obj.z = position.z;
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

  canWeld(obj) {
    if (!obj || !this.active || obj !== this.held || obj.welded || !obj.body) return false;
    const G = this.G, boat = G.boat;
    this.pendingDeckSlot = null;
    if (!G.physics.hasRaftContact(obj)) return false;
    const position = new THREE.Vector3(obj.body.position.x, obj.body.position.y, obj.body.position.z);
    const quaternion = new THREE.Quaternion(
      obj.body.quaternion.x, obj.body.quaternion.y, obj.body.quaternion.z, obj.body.quaternion.w
    );
    const size = this._physicsSize(obj);
    const deckSlot = boat.matchDeckSlot(position, obj.def.pieceType, 0.85);
    if (deckSlot && (size.x < deckSlot.size - 0.01 || size.z < deckSlot.size - 0.01)) return false;
    this.pendingDeckSlot = deckSlot;
    return true;
  }

  weld(obj) {
    if (!this.canWeld(obj)) {
      this.G.hud.msg('A peça precisa estar em contato físico com a jangada');
      return false;
    }
    const G = this.G, boat = G.boat, mesh = obj.mesh;
    const slot = this.pendingDeckSlot;
    let position = new THREE.Vector3(obj.body.position.x, obj.body.position.y, obj.body.position.z);
    let quaternion = new THREE.Quaternion(
      obj.body.quaternion.x, obj.body.quaternion.y, obj.body.quaternion.z, obj.body.quaternion.w
    );
    // build assistida: solda exatamente no encaixe (a física deixa a peça a milímetros dele)
    const c = this.candidate;
    if (c && c.snapped && c.position.distanceTo(position) < 0.4) { position = c.position.clone(); quaternion = c.quaternion.clone(); }
    mesh.position.copy(position);
    mesh.quaternion.copy(quaternion);
    G.physics.releaseHold(obj, {
      position,
      quaternion,
    });
    boat.group.updateMatrixWorld(true);
    const worldPosition = mesh.getWorldPosition(new THREE.Vector3());
    const worldQuaternion = mesh.getWorldQuaternion(new THREE.Quaternion());
    const localPosition = boat.group.worldToLocal(worldPosition.clone());
    const localQuaternion = boat.group.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(worldQuaternion);
    const localRotation = new THREE.Euler().setFromQuaternion(localQuaternion, 'YXZ');
    const size = this._physicsSize(obj).toArray();
    const physOffset = this._physicsOffset(obj).toArray();
    const piece = {
      id: G.net.nextId(),
      type: obj.def.pieceType || 'tabua',
      x: localPosition.x,
      y: localPosition.y,
      z: localPosition.z,
      yaw: localRotation.y,
      rotX: localRotation.x,
      rotZ: localRotation.z,
      physObjId: obj.id,
      physSize: size,
      physOffset,
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
    G.hud.msg(`${obj.def.nome} fixado na jangada`);
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
    const offset = new THREE.Vector3(...(piece.physOffset || obj.physicsOffset || [0, 0, 0]))
      .applyQuaternion(obj.mesh.quaternion);
    const col = {
      type: obj.def && obj.def.col === 'ramp' ? 'ramp' : 'box', // rampa: colisão inclinada (sobe para +Z)
      x: piece.x + offset.x, y: piece.y + offset.y, z: piece.z + offset.z,
      hx: size[0] / 2, hy: size[1] / 2, hz: size[2] / 2,
      yaw: piece.yaw,
    };
    boat.set.items.push(col);
    obj.mesh.traverse((child) => {
      if (child.isMesh) { child.buildPiece = piece; G.solids.push(child); }
    });
    piece.mesh = obj.mesh;
    piece.col = col;
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
  }

  applyRemoteWeld(message) {
    const G = this.G;
    if (message.piece && message.physId) G.world.weldedStates.set(message.physId, message.piece);
    const obj = G.world.physObjects.find((item) => item.id === message.physId);
    if (!obj || obj.welded) return;
    this._attachWelded(obj, message.piece);
  }

  tryRemoveWelded(pieceId, broadcast = true) {
    const G = this.G, boat = G.boat;
    const piece = boat.pieces.get(pieceId);
    if (!piece || !piece.physObj || piece.type === 'mastro' || piece.indestructible ||
        (piece.startSlotId && !G.startup.departed)) {
      G.hud.msg('Essa peça não pode ser removida');
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
    const colIndex = boat.set.items.indexOf(piece.col);
    if (colIndex >= 0) boat.set.items.splice(colIndex, 1);
    boat.pieces.delete(pieceId);
    boat.recalcRadius();

    G.scene.add(obj.mesh);
    obj.mesh.position.copy(position);
    obj.mesh.quaternion.copy(quaternion);
    obj.mesh.visible = true;
    obj.welded = false;
    obj.weldedPieceId = null;
    obj.carriedBy = null;
    obj.placed = true;
    obj.placedOnWater = false;
    obj.x = position.x;
    obj.z = position.z;
    G.world.physObjects.push(obj);
    if (!G.world.debris.includes(obj)) G.world.debris.push(obj);
    G.world.weldedStates.delete(obj.id);
    const state = this._state(obj);
    G.world.applyPlacedState(obj.id, state);
    if (broadcast) G.net.send({ t: 'unweld', pieceId, state, physId: obj.id });
    return true;
  }

  update() {
    if (this.active) {
      if (this.G.input.hit('Escape')) { this.cancel(); return; }
      if (this.G.input.act('place')) { this.place(); return; }
      if (this.G.input.act('assist')) this.toggleAssist();
      if (this.G.input.act('gizmo')) this.toggleRotationMode();
      if (this.cameraDragging && !this.G.input.mouse.right) this.endCameraDrag();
      if (this.rotationMode) this._updateGizmoDrag();
      const inp = this.G.input;
      if (inp.mouse.wheel) this._quickRotate(Math.sign(inp.mouse.wheel), inp.held('fine'));
      if (inp.act('straighten')) { this.rotation.set(0, this.G.boat.yaw, 0); if (this.rotationMode) this.rotationQuaternion = new THREE.Quaternion().setFromEuler(this.rotation); }
      if (this.G.input.act('resetPos')) this.resetHeldPosition();
      else this._updateHeldTarget();
      this._updateRotationGizmo();
      if (this.G.input.act('weld')) this.weld(this.held);
      return;
    }
    this.updatePickupTarget();
  }
}
