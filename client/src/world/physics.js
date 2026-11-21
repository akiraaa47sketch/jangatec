import * as CANNON from 'cannon-es';
import * as THREE from '../three.js';
import { rot, clamp } from '../core/util.js';
import { waveHeight } from './ocean.js';

const FIXED_STEP = 1 / 60;
const GRAVITY = 9.82;
const WATER_DENSITY = 1000;
const GROUP_DEBRIS = 1;
const GROUP_RAFT = 2;
const GROUP_TERRAIN = 4;
const GROUP_PLAYER = 8;

const volumeOf = (size) => size.x * size.y * size.z;

export class Physics {
  constructor(G) {
    this.G = G;
    this.world = new CANNON.World({ gravity: new CANNON.Vec3(0, -GRAVITY, 0) });
    this.world.allowSleep = true;
    this.world.broadphase = new CANNON.SAPBroadphase(this.world);
    this.world.solver.iterations = 8;
    this.world.defaultContactMaterial.friction = 0.55;
    this.world.defaultContactMaterial.restitution = 0.02;
    this.records = new Map();
    this.raftPieces = new Map();
    this.staticSets = new Map();

    this.raftRoot = new CANNON.Body({
      mass: 0,
      type: CANNON.Body.KINEMATIC,
      position: new CANNON.Vec3(),
      quaternion: new CANNON.Quaternion(),
    });
    this.world.addBody(this.raftRoot);
    this.playerCollider = new CANNON.Body({
      mass: 0,
      type: CANNON.Body.KINEMATIC,
      collisionFilterGroup: GROUP_PLAYER,
      collisionFilterMask: GROUP_DEBRIS,
    });
    for (const y of [0.35, 0.85, 1.35]) {
      this.playerCollider.addShape(new CANNON.Sphere(0.35), new CANNON.Vec3(0, y, 0));
    }
    this.playerColliderActive = false;
    this.lastRaftPose = { position: new CANNON.Vec3(), quaternion: new CANNON.Quaternion() };
  }

  _bodyForMesh(mesh, size, group, mask, offset = [0, 0, 0], kinematic = false) {
    mesh.updateWorldMatrix(true, false);
    const position = mesh.getWorldPosition(new THREE.Vector3());
    const quaternion = mesh.getWorldQuaternion(new THREE.Quaternion());
    const sizeVector = new THREE.Vector3(...size);
    const body = new CANNON.Body({
      mass: kinematic ? 0 : Math.max(0.1, volumeOf(sizeVector) * 600),
      type: kinematic ? CANNON.Body.KINEMATIC : CANNON.Body.DYNAMIC,
      position: new CANNON.Vec3(position.x, position.y, position.z),
      quaternion: new CANNON.Quaternion(quaternion.x, quaternion.y, quaternion.z, quaternion.w),
      linearDamping: 0.2,
      angularDamping: 0.42,
      allowSleep: false,
      collisionFilterGroup: group,
      collisionFilterMask: mask,
    });
    body.addShape(
      new CANNON.Box(new CANNON.Vec3(sizeVector.x / 2, sizeVector.y / 2, sizeVector.z / 2)),
      new CANNON.Vec3(offset[0], offset[1], offset[2])
    );
    this.world.addBody(body);
    return { body, size: sizeVector, volume: volumeOf(sizeVector) };
  }

  _meshBounds(mesh, fallbackSize) {
    mesh.updateWorldMatrix(true, true);
    const rootInverse = mesh.matrixWorld.clone().invert();
    const bounds = new THREE.Box3();
    mesh.traverse((child) => {
      if (!child.isMesh || !child.geometry) return;
      if (!child.geometry.boundingBox) child.geometry.computeBoundingBox();
      if (!child.geometry.boundingBox) return;
      const childToRoot = rootInverse.clone().multiply(child.matrixWorld);
      bounds.union(child.geometry.boundingBox.clone().applyMatrix4(childToRoot));
    });

    if (bounds.isEmpty()) {
      return { size: new THREE.Vector3(...fallbackSize), offset: new THREE.Vector3() };
    }
    bounds.applyMatrix4(new THREE.Matrix4().makeScale(mesh.scale.x, mesh.scale.y, mesh.scale.z));
    const size = bounds.getSize(new THREE.Vector3());
    if (![size.x, size.y, size.z].every((value) => Number.isFinite(value) && value > 1e-4)) {
      return { size: new THREE.Vector3(...fallbackSize), offset: new THREE.Vector3() };
    }
    return { size, offset: bounds.getCenter(new THREE.Vector3()) };
  }

  addFloatingObject(obj) {
    const bounds = this._meshBounds(obj.mesh, obj.def.size);
    const data = this._bodyForMesh(
      obj.mesh,
      bounds.size.toArray(),
      GROUP_DEBRIS,
      GROUP_DEBRIS | GROUP_RAFT | GROUP_TERRAIN | GROUP_PLAYER,
      bounds.offset.toArray()
    );
    obj.physicsSize = data.size.toArray();
    obj.physicsOffset = bounds.offset.toArray();
    const record = {
      id: obj.id,
      obj,
      mesh: obj.mesh,
      body: data.body,
      size: data.size,
      volume: data.volume,
      kind: 'object',
      parent: this.G.scene,
      active: true,
      constraint: null,
      holdTarget: null,
    };
    obj.body = record.body;
    this.records.set(obj.id, record);
    return record;
  }

  addRaftPiece(id, mesh, size, piece) {
    const kinematic = !!(piece && piece.locked);
    const data = this._bodyForMesh(
      mesh,
      size,
      GROUP_RAFT,
      GROUP_DEBRIS | (kinematic ? 0 : GROUP_TERRAIN),
      [0, 0, 0],
      kinematic
    );
    const record = {
      id,
      obj: piece && piece.physObj,
      mesh,
      body: data.body,
      size: data.size,
      volume: data.volume,
      kind: 'raft',
      parent: mesh.parent,
      active: true,
      kinematic,
      constraint: kinematic ? null : new CANNON.LockConstraint(this.raftRoot, data.body, { maxForce: 1e7 }),
    };
    if (record.constraint) this.world.addConstraint(record.constraint);
    this.records.set(`raft:${id}`, record);
    this.raftPieces.set(id, record);
    if (record.obj) record.obj.body = record.body;
    return record;
  }

  removeRaftPiece(id) {
    const record = this.raftPieces.get(id);
    if (!record) return;
    if (record.constraint) this.world.removeConstraint(record.constraint);
    this.world.removeBody(record.body);
    this.raftPieces.delete(id);
    this.records.delete(`raft:${id}`);
  }

  hasRaftContact(obj) {
    const record = obj && this.records.get(obj.id);
    if (!record || record.kind !== 'object' || !record.active) return false;
    for (const contact of this.world.contacts) {
      const raftBody = contact.bi === record.body
        ? contact.bj
        : contact.bj === record.body ? contact.bi : null;
      if (!raftBody) continue;
      for (const raftPiece of this.raftPieces.values()) {
        if (raftPiece.body === raftBody) return true;
      }
    }
    return false;
  }

  addStaticSet(set) {
    if (this.staticSets.has(set)) return;
    const bodies = [];
    for (const collider of set.items) {
      const body = new CANNON.Body({
        mass: 0,
        position: new CANNON.Vec3(
          set.x + rot(collider.x, collider.z, set.yaw)[0],
          set.y + collider.y,
          set.z + rot(collider.x, collider.z, set.yaw)[1]
        ),
        collisionFilterGroup: GROUP_TERRAIN,
        collisionFilterMask: GROUP_DEBRIS | GROUP_RAFT,
      });
      body.quaternion.setFromAxisAngle(new CANNON.Vec3(0, 1, 0), set.yaw + (collider.yaw || 0));
      if (collider.type === 'cyl') {
        body.addShape(new CANNON.Cylinder(collider.hx, collider.hx, collider.hy * 2, 12));
      } else {
        body.addShape(new CANNON.Box(new CANNON.Vec3(collider.hx, collider.hy, collider.hz)));
      }
      this.world.addBody(body);
      bodies.push(body);
    }
    this.staticSets.set(set, bodies);
  }

  removeStaticSet(set) {
    const bodies = this.staticSets.get(set);
    if (!bodies) return;
    for (const body of bodies) this.world.removeBody(body);
    this.staticSets.delete(set);
  }

  suspendObject(obj) {
    const record = this.records.get(obj.id);
    if (!record || record.kind !== 'object' || !record.active) return;
    this.world.removeBody(record.body);
    record.active = false;
  }

  setHoldTarget(obj, position, quaternion) {
    const record = this.records.get(obj.id);
    if (!record || record.kind !== 'object' || !record.active) return;
    record.holdTarget = {
      position: new CANNON.Vec3(position.x, position.y, position.z),
      quaternion: new CANNON.Quaternion(quaternion.x, quaternion.y, quaternion.z, quaternion.w),
    };
    record.body.wakeUp();
  }

  releaseHold(obj, transform = null) {
    const record = this.records.get(obj.id);
    if (!record || record.kind !== 'object') return;
    record.holdTarget = null;
    if (transform) {
      record.body.position.set(transform.position.x, transform.position.y, transform.position.z);
      record.body.quaternion.set(transform.quaternion.x, transform.quaternion.y, transform.quaternion.z, transform.quaternion.w);
      const velocity = transform.velocity || [0, 0, 0];
      const angularVelocity = transform.angularVelocity || [0, 0, 0];
      record.body.velocity.set(velocity[0], velocity[1], velocity[2]);
      record.body.angularVelocity.set(angularVelocity[0], angularVelocity[1], angularVelocity[2]);
      record.body.aabbNeedsUpdate = true;
    }
    record.body.wakeUp();
  }

  removeObject(obj) {
    const record = this.records.get(obj.id);
    if (!record || record.kind !== 'object') return;
    if (record.active) this.world.removeBody(record.body);
    this.records.delete(obj.id);
    obj.body = null;
  }

  resumeObject(obj) {
    const record = this.records.get(obj.id);
    if (!record || record.kind !== 'object') return;
    if (!record.active) {
      this.world.addBody(record.body);
      record.active = true;
    }
    record.body.wakeUp();
  }

  placeObject(obj, position, quaternion) {
    let record = this.records.get(obj.id);
    if (!record) record = this.addFloatingObject(obj);
    if (record.kind !== 'object') return;
    if (!record.active) {
      this.world.addBody(record.body);
      record.active = true;
    }
    const [x, y, z] = Array.isArray(position) ? position : [position.x, position.y, position.z];
    const [qx, qy, qz, qw] = Array.isArray(quaternion)
      ? quaternion
      : [quaternion.x, quaternion.y, quaternion.z, quaternion.w];
    record.body.position.set(x, y, z);
    record.body.quaternion.set(qx, qy, qz, qw);
    record.body.velocity.set(0, 0, 0);
    record.body.angularVelocity.set(0, 0, 0);
    record.body.aabbNeedsUpdate = true;
    record.body.wakeUp();
  }

  attachWeldedObject(obj, piece) {
    let record = this.records.get(obj.id);
    if (!record) record = this.addFloatingObject(obj);
    if (record.constraint) this.world.removeConstraint(record.constraint);
    if (!record.active) {
      this.world.addBody(record.body);
      record.active = true;
    }

    const group = this.G.boat.group;
    group.updateMatrixWorld(true);
    const localPosition = new THREE.Vector3(piece.x, piece.y, piece.z);
    const worldPosition = group.localToWorld(localPosition);
    const localQuaternion = new THREE.Quaternion().setFromEuler(
      new THREE.Euler(piece.rotX || 0, piece.yaw, piece.rotZ || 0, 'YXZ')
    );
    const worldQuaternion = group.getWorldQuaternion(new THREE.Quaternion()).multiply(localQuaternion);
    record.body.position.set(worldPosition.x, worldPosition.y, worldPosition.z);
    record.body.quaternion.set(worldQuaternion.x, worldQuaternion.y, worldQuaternion.z, worldQuaternion.w);
    record.body.velocity.set(0, 0, 0);
    record.body.angularVelocity.set(0, 0, 0);
    record.body.collisionFilterGroup = GROUP_RAFT;
    record.body.collisionFilterMask = GROUP_DEBRIS | GROUP_TERRAIN;
    record.body.wakeUp();
    record.kind = 'raft';
    record.parent = group;
    record.obj = obj;
    record.constraint = new CANNON.LockConstraint(this.raftRoot, record.body, { maxForce: 1e7 });
    this.world.addConstraint(record.constraint);
    this.records.delete(obj.id);
    this.records.set(`raft:${piece.id}`, record);
    this.raftPieces.set(piece.id, record);
    obj.body = record.body;
  }

  detachWeldedObject(obj, pieceId, position, quaternion) {
    const record = this.raftPieces.get(pieceId);
    if (!record) return;
    this.world.removeConstraint(record.constraint);
    this.raftPieces.delete(pieceId);
    this.records.delete(`raft:${pieceId}`);

    record.body.position.set(position.x, position.y, position.z);
    record.body.quaternion.set(quaternion.x, quaternion.y, quaternion.z, quaternion.w);
    record.body.collisionFilterGroup = GROUP_DEBRIS;
    record.body.collisionFilterMask = GROUP_DEBRIS | GROUP_RAFT | GROUP_TERRAIN | GROUP_PLAYER;
    record.body.velocity.copy(this.raftRoot.velocity);
    record.body.angularVelocity.copy(this.raftRoot.angularVelocity);
    record.body.wakeUp();
    record.kind = 'object';
    record.parent = this.G.scene;
    record.obj = obj;
    record.constraint = null;
    this.records.set(obj.id, record);
    obj.body = record.body;
  }

  setRaftPose(position, quaternion, dt) {
    const body = this.raftRoot;
    const nextPosition = new CANNON.Vec3(position.x, position.y, position.z);
    const nextQuaternion = new CANNON.Quaternion(quaternion.x, quaternion.y, quaternion.z, quaternion.w);
    if (dt > 1e-5) {
      nextPosition.vsub(this.lastRaftPose.position, body.velocity);
      body.velocity.scale(1 / dt, body.velocity);
      const delta = nextQuaternion.mult(this.lastRaftPose.quaternion.inverse(), new CANNON.Quaternion());
      const angle = 2 * Math.acos(clamp(delta.w, -1, 1));
      const denominator = Math.sqrt(Math.max(1e-8, 1 - delta.w * delta.w));
      body.angularVelocity.set(delta.x / denominator * angle / dt, delta.y / denominator * angle / dt, delta.z / denominator * angle / dt);
    } else {
      body.velocity.set(0, 0, 0);
      body.angularVelocity.set(0, 0, 0);
    }
    body.position.copy(nextPosition);
    body.quaternion.copy(nextQuaternion);
    body.aabbNeedsUpdate = true;
    body.wakeUp();
    for (const record of this.raftPieces.values()) {
      if (!record.kinematic && dt > 1e-5) continue;
      const { body, mesh } = record;
      mesh.updateWorldMatrix(true, false);
      const piecePosition = mesh.getWorldPosition(new THREE.Vector3());
      const pieceQuaternion = mesh.getWorldQuaternion(new THREE.Quaternion());
      if (record.kinematic && dt > 1e-5) {
        body.velocity.set(
          (piecePosition.x - body.position.x) / dt,
          (piecePosition.y - body.position.y) / dt,
          (piecePosition.z - body.position.z) / dt
        );
        const nextRotation = new CANNON.Quaternion(
          pieceQuaternion.x, pieceQuaternion.y, pieceQuaternion.z, pieceQuaternion.w
        );
        const delta = nextRotation.mult(body.quaternion.inverse(), new CANNON.Quaternion());
        if (delta.w < 0) {
          delta.x *= -1; delta.y *= -1; delta.z *= -1; delta.w *= -1;
        }
        const angle = 2 * Math.acos(clamp(delta.w, -1, 1));
        const denominator = Math.sqrt(Math.max(1e-8, 1 - delta.w * delta.w));
        body.angularVelocity.set(
          delta.x / denominator * angle / dt,
          delta.y / denominator * angle / dt,
          delta.z / denominator * angle / dt
        );
        continue;
      } else {
        body.velocity.set(0, 0, 0);
        body.angularVelocity.set(0, 0, 0);
      }
      body.position.set(piecePosition.x, piecePosition.y, piecePosition.z);
      body.quaternion.set(
        pieceQuaternion.x, pieceQuaternion.y, pieceQuaternion.z, pieceQuaternion.w
      );
      body.aabbNeedsUpdate = true;
      body.wakeUp();
    }
    this.lastRaftPose.position.copy(nextPosition);
    this.lastRaftPose.quaternion.copy(nextQuaternion);
  }

  _applyHold(record, dt) {
    const { body, holdTarget } = record;
    const maxAcceleration = 160;
    const linearSpeed = body.velocity.length();
    const maxSpeed = 8;
    if (linearSpeed > maxSpeed) body.velocity.scale(maxSpeed / linearSpeed, body.velocity);
    let ax = (holdTarget.position.x - body.position.x) * 140 - body.velocity.x * 23.7;
    let ay = (holdTarget.position.y - body.position.y) * 140 - body.velocity.y * 23.7;
    let az = (holdTarget.position.z - body.position.z) * 140 - body.velocity.z * 23.7;
    const acceleration = Math.hypot(ax, ay, az);
    if (acceleration > maxAcceleration) {
      const scale = maxAcceleration / acceleration;
      ax *= scale; ay *= scale; az *= scale;
    }
    body.force.x += ax * body.mass;
    body.force.y += ay * body.mass;
    body.force.z += az * body.mass;

    const error = holdTarget.quaternion.mult(body.quaternion.inverse(), new CANNON.Quaternion());
    if (error.w < 0) { error.x *= -1; error.y *= -1; error.z *= -1; error.w *= -1; }
    const sinHalf = Math.sqrt(Math.max(0, 1 - error.w * error.w));
    const angle = 2 * Math.acos(clamp(error.w, -1, 1));
    const speed = sinHalf > 1e-5 ? angle * 9 / sinHalf : 0;
    const blend = Math.min(1, dt * 18);
    body.angularVelocity.x += (error.x * speed - body.angularVelocity.x) * blend;
    body.angularVelocity.y += (error.y * speed - body.angularVelocity.y) * blend;
    body.angularVelocity.z += (error.z * speed - body.angularVelocity.z) * blend;
  }

  _applyBuoyancy(record, t) {
    const { body, size, volume, obj } = record;
    if (obj.placed && !obj.placedOnWater) return;
    if (obj.def && obj.def.sinks && !obj.welded) { // metal/pedra: afunda devagar (arrasto da água)
      if (waveHeight(body.position.x, body.position.z, t) > body.position.y) {
        body.velocity.scale(0.92, body.velocity); body.angularVelocity.scale(0.9, body.angularVelocity);
      }
      return;
    }
    for (const x of [-size.x / 2, size.x / 2]) {
      for (const [y, layerWeight] of [[-size.y / 2, 0.25], [0, 0.5], [size.y / 2, 0.25]]) {
        for (const z of [-size.z / 2, size.z / 2]) {
          const point = body.pointToWorldFrame(new CANNON.Vec3(x, y, z));
          const depth = waveHeight(point.x, point.z, t) - point.y;
          if (depth <= 0) continue;
          const submerged = clamp(depth / Math.max(0.08, size.y * 0.2), 0, 1);
          const lift = GRAVITY * WATER_DENSITY * volume * submerged * layerWeight / 4;
          const offset = point.vsub(body.position, new CANNON.Vec3());
          body.applyForce(new CANNON.Vec3(0, lift, 0), offset);
        }
      }
    }
  }

  _syncMesh(record) {
    const { body, mesh, parent } = record;
    const worldPosition = new THREE.Vector3(body.position.x, body.position.y, body.position.z);
    const worldQuaternion = new THREE.Quaternion(body.quaternion.x, body.quaternion.y, body.quaternion.z, body.quaternion.w);
    parent.updateWorldMatrix(true, false);
    mesh.position.copy(parent.worldToLocal(worldPosition));
    const parentQuaternion = parent.getWorldQuaternion(new THREE.Quaternion()).invert();
    mesh.quaternion.copy(parentQuaternion.multiply(worldQuaternion));
  }

  _syncPlayerCollider(dt) {
    const carrying = Array.from(this.records.values()).some((record) =>
      record.kind === 'object' && record.active && record.holdTarget
    );
    if (!carrying || !this.G.player) {
      if (this.playerColliderActive) this.world.removeBody(this.playerCollider);
      this.playerColliderActive = false;
      return;
    }

    const p = this.G.player.body.pos;
    const body = this.playerCollider;
    const nextX = p.x, nextY = p.y + 0.85, nextZ = p.z;
    if (!this.playerColliderActive) {
      body.position.set(nextX, nextY, nextZ);
      body.velocity.set(0, 0, 0);
      this.world.addBody(body);
      this.playerColliderActive = true;
    } else {
      body.velocity.set(
        dt > 1e-6 ? (nextX - body.position.x) / dt : 0,
        dt > 1e-6 ? (nextY - body.position.y) / dt : 0,
        dt > 1e-6 ? (nextZ - body.position.z) / dt : 0
      );
      body.position.set(nextX, nextY, nextZ);
    }
    body.aabbNeedsUpdate = true;
    body.wakeUp();
  }

  snapshot(limit = 48) {
    const boat = this.G.boat;
    const candidates = [];
    for (const record of this.records.values()) {
      if (record.kind !== 'object' || !record.active || !record.obj || record.obj.carriedBy) continue;
      const body = record.body;
      const dx = body.position.x - boat.x, dz = body.position.z - boat.z;
      candidates.push({ record, distanceSq: dx * dx + dz * dz });
    }
    candidates.sort((a, b) => a.distanceSq - b.distanceSq);
    const round = (value, precision = 100) => Math.round(value * precision) / precision;
    return candidates.slice(0, limit).map(({ record }) => {
      const body = record.body;
      return {
        id: record.id,
        p: [body.position.x, body.position.y, body.position.z].map((v) => round(v)),
        q: [body.quaternion.x, body.quaternion.y, body.quaternion.z, body.quaternion.w].map((v) => round(v, 1000)),
        v: [body.velocity.x, body.velocity.y, body.velocity.z].map((v) => round(v)),
        w: [body.angularVelocity.x, body.angularVelocity.y, body.angularVelocity.z].map((v) => round(v)),
      };
    });
  }

  applySnapshot(states) {
    if (!Array.isArray(states)) return;
    for (const state of states) {
      if (!state || typeof state.id !== 'string' ||
          ![state.p, state.q, state.v, state.w].every(Array.isArray) ||
          state.p.length !== 3 || state.q.length !== 4 ||
          state.v.length !== 3 || state.w.length !== 3 ||
          !state.p.concat(state.q, state.v, state.w).every(Number.isFinite)) continue;
      const record = this.records.get(state.id);
      if (!record || record.kind !== 'object' || !record.active || record.obj.carriedBy) continue;
      record.body.position.set(...state.p);
      record.body.quaternion.set(...state.q);
      record.body.velocity.set(...state.v);
      record.body.angularVelocity.set(...state.w);
      record.body.aabbNeedsUpdate = true;
      record.body.wakeUp();
    }
  }

  update(dt, t) {
    for (const record of this.records.values()) {
      if (!record.active || record.kind !== 'object' || !record.obj) continue;
      this._applyBuoyancy(record, t);
      if (record.holdTarget) this._applyHold(record, dt);
    }
    this._syncPlayerCollider(dt);
    this.world.step(FIXED_STEP, dt, 4);
    for (const record of this.records.values()) {
      if (!record.active) continue;
      if (record.kinematic) {
        record.mesh.updateWorldMatrix(true, false);
        const position = record.mesh.getWorldPosition(new THREE.Vector3());
        const quaternion = record.mesh.getWorldQuaternion(new THREE.Quaternion());
        record.body.position.set(position.x, position.y, position.z);
        record.body.quaternion.set(quaternion.x, quaternion.y, quaternion.z, quaternion.w);
        record.body.aabbNeedsUpdate = true;
        continue;
      }
      // Fundo do mar: destroços assentam na areia quando a água vai embora.
      if (record.kind === 'object' && record.obj && !record.holdTarget && this.G.world) {
        const b = record.body, gh = this.G.world.seabedHeight(b.position.x, b.position.z) + record.size.y * 0.5;
        if (b.position.y < gh) {
          b.position.y = gh;
          if (b.velocity.y < 0) b.velocity.y = 0;
          b.velocity.x *= 0.85; b.velocity.z *= 0.85; b.angularVelocity.scale(0.85, b.angularVelocity);
        }
      }
      this._syncMesh(record);
      if (record.obj && record.kind === 'object') {
        record.obj.x = record.mesh.position.x;
        record.obj.z = record.mesh.position.z;
      }
    }
  }
}
