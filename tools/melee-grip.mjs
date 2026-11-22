import * as T from 'three';
const V = (...a) => new T.Vector3(...a);
const S = V(0.2, -0.27, 0.2), pole = V(0.75, -0.8, 0.35), A = 0.36, B = 0.33;
const fwdTilt = +(process.argv[2] || 30) * Math.PI / 180, backUp = +(process.argv[3] || 0.35);
const W = V(+(process.argv[4] || 0.22), +(process.argv[5] || -0.12), +(process.argv[6] || -0.36)); // ponto da pegada ≈ punho
// IK igual ao viewmodel
const dir = W.clone().sub(S); const dist = dir.length(); dir.normalize();
const L = Math.min(dist, A + B - 0.004), x = (A * A - B * B + L * L) / (2 * L), h = Math.sqrt(Math.max(A * A - x * x, 0));
const pp = pole.clone().addScaledVector(dir, -pole.dot(dir)).normalize();
const E = S.clone().addScaledVector(dir, x).addScaledVector(pp, h);
const f = W.clone().sub(E).normalize();               // antebraço (cotovelo → punho)
const Zh = f.clone().negate();                         // +Z da mão aponta para o cotovelo
let Yh = V(1, backUp, 0); Yh.addScaledVector(Zh, -Yh.dot(Zh)).normalize(); // dorso para fora
const Xh = new T.Vector3().crossVectors(Yh, Zh).normalize();
const qH = new T.Quaternion().setFromRotationMatrix(new T.Matrix4().makeBasis(Xh, Yh, Zh));
// mão no espaço da arma: lâmina (-Zw) = -Xh cos a - Zh sin a; dorso = +Xw
const c = Math.cos(fwdTilt), s = Math.sin(fwdTilt);
const gX = V(0, -s, c), gY = V(1, 0, 0), gZ = V(0, c, s); // eixos da mão escritos na arma
const qG = new T.Quaternion().setFromRotationMatrix(new T.Matrix4().makeBasis(gX, gY, gZ));
const eG = new T.Euler().setFromQuaternion(qG, 'XYZ');
const qW = qH.clone().multiply(qG.clone().invert());
const eW = new T.Euler().setFromQuaternion(qW, 'YXZ');
const blade = V(0, 0, -1).applyQuaternion(qW);
console.log('elbow', E.toArray().map((v) => v.toFixed(2)), 'forearm', f.toArray().map((v) => v.toFixed(2)));
console.log('gripR.r', [eG.x, eG.y, eG.z].map((v) => +v.toFixed(4)), 'hold.r', [eW.x, eW.y, eW.z].map((v) => +v.toFixed(4)), 'blade', blade.toArray().map((v) => v.toFixed(2)));
