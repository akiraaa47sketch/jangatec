const { chromium } = require('playwright');
const RAD = +(process.argv[2] || 1.75), RX = +(process.argv[3] || -0.7854);
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 600, height: 400 } });
  page.on('pageerror', (e) => console.log('PAGEERROR ' + e.message));
  await page.goto('http://127.0.0.1:8080/'); await page.waitForTimeout(5000);
  await page.fill('#seed', '12345'); await page.evaluate(() => document.getElementById('btnSolo').click());
  await page.waitForTimeout(9000);
  console.log(await page.evaluate(async ([RAD, RX]) => {
    const THREE = await import('/src/three.js');
    const { buildRealHand, preloadHand } = await import('/src/player/gunmodels.js'); await preloadHand('./models/mao.glb');
    const h = buildRealHand(false, null);
    const bones = {}; h.root.traverse((o) => { if (o.isBone) bones[o.name] = o; });
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(RX, 0, -1.5708));
    const holder = new THREE.Group(); holder.add(h.root);
    // pele do dedo ≈ 0,85 cm do osso; palma ≈ 1 cm abaixo do nó
    const T = RAD + 0.85;
    const evalPose = (c, jm, dy, dx = 0, th = [0.5, -0.2, 0.3]) => {
      h.setPose([c, c, c, c], th, jm);
      h.root.quaternion.copy(q); h.root.position.copy(new THREE.Vector3(...h.gripOff).applyQuaternion(q)); h.root.position.y += dy / 100; h.root.position.x += dx / 100;
      holder.updateMatrixWorld(true);
      let err = 0; const ds = [];
      for (let f = 0; f < 4; f++) {
        const pts = [0, 1, 2].map((j) => bones[`d${f}_${j}`].getWorldPosition(new THREE.Vector3()));
        pts.push(pts[2].clone().add(pts[2].clone().sub(pts[1]).multiplyScalar(0.8))); // ponta
        pts.forEach((p, k) => { const d = Math.hypot(p.x, p.y) * 100; const target = k === 0 ? RAD + 1.0 : T; err += (d < target ? 3 : 1) * (d - target) ** 2; if (f === 1) ds.push(+d.toFixed(1)); });
      }
      for (const n of ['pol_1']) if (bones[n]) { const p = bones[n].getWorldPosition(new THREE.Vector3()); const d = Math.hypot(p.x, p.y) * 100; err += (d < T ? 3 : 1) * (d - T) ** 2; }
      { // ponta do polegar
        const a = bones.pol_0.getWorldPosition(new THREE.Vector3()), b = bones.pol_1.getWorldPosition(new THREE.Vector3()), t = b.clone().add(b.clone().sub(a).multiplyScalar(0.7));
        const d = Math.hypot(t.x, t.y) * 100; err += (d < T ? 3 : 0.5) * (d - T) ** 2;
      }
      return { err, ds };
    };
    let best = null;
    for (const c of [0.75, 0.85, 0.95]) for (const m0 of [0.15, 0.3, 0.45]) for (const m1 of [0.9, 1.1, 1.3]) for (const m2 of [0.3, 0.5, 0.7]) for (const dy of [0.3, 0.6, 0.9]) for (const dx of [0.3, 0.6, 0.9])
      for (const th of [[0.5, -0.2, 0.3], [0.3, -0.4, 0.15], [0.7, 0.0, 0.2], [0.2, -0.6, 0.0], [0.6, -0.4, 0.4]]) {
        const r = evalPose(c, [m0, m1, m2], dy, dx, th);
        if (!best || r.err < best.err) best = { c, jm: [m0, m1, m2], dy, dx, th, ...r };
      }
    // distâncias de todos os dedos no melhor
    const b = best; h.setPose([b.c, b.c, b.c, b.c], b.th, b.jm);
    h.root.quaternion.copy(q); h.root.position.copy(new THREE.Vector3(...h.gripOff).applyQuaternion(q)); h.root.position.y += b.dy / 100; h.root.position.x += b.dx / 100; holder.updateMatrixWorld(true);
    best.all = [0, 1, 2, 3].map((f) => [0, 1, 2].map((j) => { const p = bones[`d${f}_${j}`].getWorldPosition(new THREE.Vector3()); return +(Math.hypot(p.x, p.y) * 100).toFixed(1); }));
    best.thumb = ['pol_0', 'pol_1'].filter((n) => bones[n]).map((n) => { const p = bones[n].getWorldPosition(new THREE.Vector3()); return +(Math.hypot(p.x, p.y) * 100).toFixed(1); });
    return JSON.stringify(best);
  }, [RAD, RX]));
  await browser.close();
})();
