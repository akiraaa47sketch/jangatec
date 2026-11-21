// Teclado + mouse. Usa pointer lock; se o navegador recusar, cai em "freeLook"
// (mouse move a câmera sem travar) e as setas também giram a câmera.
export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.pressed = new Set();
    this.mouse = { dx: 0, dy: 0, left: false, right: false, leftPressed: false, rightPressed: false, wheel: 0 };
    this.cursor = { x: innerWidth / 2, y: innerHeight / 2, dx: 0, dy: 0 };
    this.locked = false;
    this.freeLook = false;
    this.cursorMode = false;
    this.enabled = false;

    addEventListener('keydown', (e) => {
      if (!this.enabled || e.target.tagName === 'INPUT') return;
      if (!e.repeat) this.pressed.add(e.code);
      this.keys.add(e.code);
      if (['Space', 'Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => { this.keys.clear(); this.mouse.left = this.mouse.right = false; });
    addEventListener('mousemove', (e) => {
      const dx = e.clientX - this.cursor.x, dy = e.clientY - this.cursor.y;
      this.cursor.x = e.clientX;
      this.cursor.y = e.clientY;
      if (this.cursorMode) {
        this.cursor.dx += dx;
        this.cursor.dy += dy;
      } else if (this.locked || this.freeLook) {
        this.mouse.dx += e.movementX || 0;
        this.mouse.dy += e.movementY || 0;
      }
    });
    canvas.addEventListener('mousedown', (e) => {
      if (!this.enabled) return;
      this.cursor.x = e.clientX;
      this.cursor.y = e.clientY;
      if (!this.cursorMode && !this.locked && !this.freeLook) { this.requestLock(); return; }
      if (e.button === 0) { this.mouse.left = true; this.mouse.leftPressed = true; }
      if (e.button === 2) { this.mouse.right = true; this.mouse.rightPressed = true; }
    });
    addEventListener('mouseup', (e) => {
      if (e.button === 0) this.mouse.left = false;
      if (e.button === 2) this.mouse.right = false;
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.addEventListener('wheel', (e) => { this.mouse.wheel += Math.sign(e.deltaY); e.preventDefault(); }, { passive: false });
    document.addEventListener('pointerlockchange', () => { this.locked = document.pointerLockElement === canvas; });
    document.addEventListener('pointerlockerror', () => { this.freeLook = true; });
  }
  setCursorMode(enabled) {
    this.cursorMode = enabled;
    this.mouse.dx = this.mouse.dy = 0;
    if (enabled) {
      if (this.locked) document.exitPointerLock();
    } else if (this.enabled) {
      this.requestLock();
    }
  }
  requestLock() {
    if (this.cursorMode) return;
    try {
      const p = this.canvas.requestPointerLock();
      if (p && p.catch) p.catch(() => { this.freeLook = true; });
    } catch { this.freeLook = true; }
  }
  down(code) { return this.keys.has(code); }
  hit(code) { return this.pressed.has(code); }
  endFrame() {
    this.pressed.clear();
    const m = this.mouse;
    m.dx = m.dy = m.wheel = 0;
    m.leftPressed = m.rightPressed = false;
    this.cursor.dx = this.cursor.dy = 0;
  }
}
