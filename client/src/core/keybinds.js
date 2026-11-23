// Teclas configuráveis. Cada ação tem uma tecla (KeyboardEvent.code ou Mouse0..4) e os
// contextos onde fica ativa: 'pe' (andando/lutando), 'build' (construindo) ou 'all' (sempre).
// Duas ações não podem usar a mesma tecla quando estão ativas no mesmo contexto — ao trocar uma
// tecla que já está em uso, as duas trocam de lugar (nunca fica nada repetido).
const STORE = 'jangatec-binds';

export const CATS = [
  ['mov', 'Movimento e câmera'],
  ['combate', 'Combate'],
  ['itens', 'Armas e itens'],
  ['interagir', 'Interação e jangada'],
  ['build', 'Construção'],
  ['ui', 'Interface e voz'],
];

export const ACTIONS = [
  { id: 'forward', label: 'Andar para frente', cat: 'mov', ctx: 'all', def: 'KeyW' },
  { id: 'back', label: 'Andar para trás', cat: 'mov', ctx: 'all', def: 'KeyS' },
  { id: 'left', label: 'Andar para a esquerda', cat: 'mov', ctx: 'all', def: 'KeyA' },
  { id: 'right', label: 'Andar para a direita', cat: 'mov', ctx: 'all', def: 'KeyD' },
  { id: 'jump', label: 'Pular / subir em bordas', cat: 'mov', ctx: 'all', def: 'Space' },
  { id: 'sprint', label: 'Correr', cat: 'mov', ctx: 'pe', def: 'ShiftLeft' },
  { id: 'camLeft', label: 'Girar câmera ←', cat: 'mov', ctx: 'all', def: 'ArrowLeft' },
  { id: 'camRight', label: 'Girar câmera →', cat: 'mov', ctx: 'all', def: 'ArrowRight' },
  { id: 'camUp', label: 'Câmera para cima', cat: 'mov', ctx: 'all', def: 'ArrowUp' },
  { id: 'camDown', label: 'Câmera para baixo', cat: 'mov', ctx: 'all', def: 'ArrowDown' },
  { id: 'camera', label: '1ª / 3ª pessoa', cat: 'mov', ctx: 'all', def: 'KeyF' },
  { id: 'zoomIn', label: 'Zoom: aproximar (3ª pessoa)', cat: 'mov', ctx: 'pe', def: 'KeyI' },
  { id: 'zoomOut', label: 'Zoom: afastar (3ª pessoa)', cat: 'mov', ctx: 'pe', def: 'KeyO' },

  { id: 'attack', label: 'Atacar / atirar (segurar = golpe pesado)', cat: 'combate', ctx: 'pe', def: 'Mouse0' },
  { id: 'aim', label: 'Bloquear / mirar', cat: 'combate', ctx: 'pe', def: 'Mouse2' },
  { id: 'kick', label: 'Chute (quebra a guarda)', cat: 'combate', ctx: 'pe', def: 'Mouse1' },
  { id: 'lockCam', label: 'Travar o corpo na direção da câmera (3ª pessoa)', cat: 'combate', ctx: 'pe', def: 'KeyL' },
  { id: 'dodge', label: 'Esquivar', cat: 'combate', ctx: 'pe', def: 'KeyQ' },
  { id: 'reload', label: 'Recarregar', cat: 'combate', ctx: 'pe', def: 'KeyR' },

  { id: 'slot1', label: 'Slot 1', cat: 'itens', ctx: 'pe', def: 'Digit1' },
  { id: 'slot2', label: 'Slot 2', cat: 'itens', ctx: 'pe', def: 'Digit2' },
  { id: 'slot3', label: 'Slot 3', cat: 'itens', ctx: 'pe', def: 'Digit3' },
  { id: 'slot4', label: 'Slot 4 (ferramentas)', cat: 'itens', ctx: 'pe', def: 'Digit6' },
  { id: 'slot5', label: 'Slot 5 (ferramentas)', cat: 'itens', ctx: 'pe', def: 'Digit7' },
  { id: 'slot6', label: 'Slot 6 (ferramentas)', cat: 'itens', ctx: 'pe', def: 'Digit8' },
  { id: 'bandage', label: 'Usar bandagem', cat: 'itens', ctx: 'pe', def: 'Digit4' },
  { id: 'medkit', label: 'Usar kit médico', cat: 'itens', ctx: 'pe', def: 'Digit5' },
  { id: 'food1', label: 'Comer barra de proteína (+dano)', cat: 'itens', ctx: 'pe', def: 'Digit9' },
  { id: 'food2', label: 'Tomar energético (estamina)', cat: 'itens', ctx: 'pe', def: 'Digit0' },
  { id: 'food3', label: 'Comer chocolate (regenera vida)', cat: 'itens', ctx: 'pe', def: 'Minus' },
  { id: 'food4', label: 'Comer peixe (+20 de vida)', cat: 'itens', ctx: 'pe', def: 'Equal' },
  { id: 'inventory', label: 'Abrir inventário', cat: 'itens', ctx: 'pe', def: 'Tab' },
  { id: 'drop', label: 'Largar a arma da mão', cat: 'itens', ctx: 'pe', def: 'KeyT' },
  { id: 'banjoMenu', label: 'Painel de notas do banjo', cat: 'itens', ctx: 'pe', def: 'KeyB' },

  { id: 'interact', label: 'Interagir / abrir / vela', cat: 'interagir', ctx: 'pe', def: 'KeyE' },
  { id: 'unweld', label: 'Dessoldar peça', cat: 'interagir', ctx: 'pe', def: 'KeyX' },
  { id: 'sailLeft', label: 'Girar vela ←', cat: 'interagir', ctx: 'pe', def: 'KeyZ' },
  { id: 'sailRight', label: 'Girar vela →', cat: 'interagir', ctx: 'pe', def: 'KeyC' },

  { id: 'place', label: 'Soltar a peça', cat: 'build', ctx: 'build', def: 'KeyQ' },
  { id: 'weld', label: 'Soldar na jangada', cat: 'build', ctx: 'build', def: 'KeyZ' },
  { id: 'gizmo', label: 'Gizmo de rotação', cat: 'build', ctx: 'build', def: 'KeyR' },
  { id: 'straighten', label: 'Endireitar a peça', cat: 'build', ctx: 'build', def: 'KeyT' },
  { id: 'resetPos', label: 'Trazer a peça para a mira', cat: 'build', ctx: 'build', def: 'KeyG' },
  { id: 'assist', label: 'Build assistida (encaixe)', cat: 'build', ctx: 'build', def: 'KeyB' },
  { id: 'fine', label: 'Encaixar rotação / inclinar (segurar)', cat: 'build', ctx: 'build', def: 'ShiftLeft' },

  { id: 'ptt', label: 'Falar no chat de voz (segurar)', cat: 'ui', ctx: 'all', def: 'KeyV' },
  { id: 'gfx', label: 'Opções gráficas', cat: 'ui', ctx: 'pe', def: 'KeyG' },
  { id: 'help', label: 'Ajuda', cat: 'ui', ctx: 'all', def: 'KeyH' },
  { id: 'fps', label: 'Contador de FPS', cat: 'ui', ctx: 'all', def: 'F3' },
];
const BY_ID = Object.fromEntries(ACTIONS.map((a) => [a.id, a]));
export const RESERVED = ['Escape']; // Esc sempre cancela/fecha

export const binds = {};
export function resetBinds() { for (const a of ACTIONS) binds[a.id] = a.def; save(); }
function save() { try { localStorage.setItem(STORE, JSON.stringify(binds)); } catch { /* ok */ } }

const overlap = (a, b) => a.ctx === 'all' || b.ctx === 'all' || a.ctx === b.ctx;
export function conflictsOf(id, code) {
  const a = BY_ID[id];
  return ACTIONS.filter((b) => b.id !== id && binds[b.id] === code && overlap(a, b));
}
// Garante que não há tecla repetida (salvo antigo ou bug): quem perdeu volta ao padrão, ou fica sem tecla.
function fixConflicts() {
  for (const a of ACTIONS) {
    for (const b of conflictsOf(a.id, binds[a.id])) {
      binds[b.id] = conflictsOf(b.id, b.def).length ? '' : b.def;
    }
  }
}

// Troca a tecla de uma ação. Retorna as ações que trocaram de lugar com ela (para avisar).
export function setBind(id, code) {
  if (!BY_ID[id] || RESERVED.includes(code)) return [];
  const old = binds[id], clash = conflictsOf(id, code);
  binds[id] = code;
  for (const b of clash) binds[b.id] = old;
  fixConflicts(); save();
  for (const fn of listeners) fn();
  return clash;
}
const listeners = new Set();
export function onBindsChange(fn) { listeners.add(fn); }

(function load() { // carrega o que o jogador salvou
  for (const a of ACTIONS) binds[a.id] = a.def;
  try {
    const s = JSON.parse(localStorage.getItem(STORE) || '{}');
    for (const [k, v] of Object.entries(s)) if (BY_ID[k] && typeof v === 'string') binds[k] = v;
  } catch { /* ok */ }
  fixConflicts();
})();

// Nome curto para mostrar na tela: KeyW → W, Digit1 → 1, Mouse0 → Clique esq.
const NAMES = {
  Mouse0: 'Clique esq.', Mouse1: 'Botão do meio', Mouse2: 'Clique dir.', Mouse3: 'Mouse 4', Mouse4: 'Mouse 5',
  Space: 'Espaço', ShiftLeft: 'Shift', ShiftRight: 'Shift dir.', ControlLeft: 'Ctrl', ControlRight: 'Ctrl dir.',
  AltLeft: 'Alt', AltRight: 'Alt Gr', Tab: 'Tab', Enter: 'Enter', Backspace: '⌫', CapsLock: 'Caps',
  ArrowLeft: '←', ArrowRight: '→', ArrowUp: '↑', ArrowDown: '↓', Semicolon: 'Ç', Quote: '~', Comma: ',', Period: '.',
  Slash: ';', Backslash: ']', BracketLeft: '´', BracketRight: '[', Minus: '-', Equal: '=', Backquote: "'", IntlBackslash: '\\', IntlRo: '/',
};
export function keyName(code) {
  if (!code) return '—';
  if (NAMES[code]) return NAMES[code];
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Numpad')) return 'Num ' + code.slice(6);
  return code;
}
export const keyOf = (id) => keyName(binds[id]);
