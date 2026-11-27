// Nível de detalhe por distância para os personagens (inimigos das ilhas, piratas, chefes).
// Cada pílula é montada com ~80–100 pecinhas (luvas, botas, roupa, rosto, arma...), cada uma um
// draw call próprio — e mais um no mapa de sombra. Com 8–10 inimigos espalhados pelas ilhas em volta
// isso passava de 800 draw calls por quadro, mesmo eles sendo só uns pixels na neblina.
//   • perto (< DETAIL m): modelo completo;
//   • longe: só a cápsula do corpo (2 draw calls, mesma silhueta e cores);
//   • além da neblina: nada é desenhado.
// A mira (raycast) não olha para "visible", então acertar de longe continua funcionando.
import * as THREE from '../three.js';

const DETAIL = 48; // metros (× distância de visão das opções gráficas)

export class Lod {
  constructor(G) { this.G = G; this._p = new THREE.Vector3(); }

  _prep(e) {
    const keep = [], detail = [];
    e.mesh.traverse((o) => { if (o.isMesh) (o.userData.lodKeep ? keep : detail).push(o); });
    e._lod = { root: e.mesh, detail, ok: keep.length > 0, far: false, hidden: [] };
    return e._lod;
  }

  _setFar(l, far) {
    if (l.far === far) return;
    l.far = far;
    if (far) { // esconde as pecinhas, lembrando quais estavam à mostra
      l.hidden.length = 0;
      for (const o of l.detail) if (o.visible) { o.visible = false; l.hidden.push(o); }
    } else {
      for (const o of l.hidden) o.visible = true;
      l.hidden.length = 0;
    }
  }

  update() {
    const G = this.G, cam = G.camera.position, fog = G.scene.fog;
    // com zoom (luneta, mira) o detalhe vai mais longe na mesma proporção
    const zoom = Math.max(1, Math.tan(68 * Math.PI / 360) / Math.tan(G.camera.fov * Math.PI / 360));
    const fogFar = fog ? fog.far : 1e9, detail = DETAIL * (G.viewScale || 1) * zoom;
    for (const e of G.enemies.list) {
      if (e.creature || !e.mesh) continue; // kraken/tubarões: o próprio evento cuida
      const l = e._lod && e._lod.root === e.mesh ? e._lod : this._prep(e);
      const d = cam.distanceTo(e.mesh.getWorldPosition(this._p)), sc = (e.def && e.def.scale) || 1;
      const show = d < fogFar + 6 * sc;
      if (e.mesh.visible !== show) e.mesh.visible = show;
      this._setFar(l, l.ok && show && d > detail * Math.max(1, sc));
    }
  }
}
