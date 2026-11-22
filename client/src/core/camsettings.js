// Câmera: campo de visão (FOV) e sensibilidade do mouse separados para 1ª e 3ª pessoa,
// e um multiplicador para quando está mirando. Salvo no navegador.
const KEY = 'jangatec-camera';
export const CAM_DEFAULTS = { fov1p: 75, fov3p: 68, sens1p: 1, sens3p: 1, sensAim: 1 };
export const cam = { ...CAM_DEFAULTS };
try { Object.assign(cam, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch { /* ok */ }
for (const k of Object.keys(CAM_DEFAULTS)) if (!Number.isFinite(cam[k])) cam[k] = CAM_DEFAULTS[k];
export function setCam(k, v) { cam[k] = v; try { localStorage.setItem(KEY, JSON.stringify(cam)); } catch { /* ok */ } }
