// Keyboard and pointer input. Held keys give pitch/roll/throttle; one-shot
// presses (start, pause) are queued as bit flags and taken once by the loop,
// so a press between two frames is never lost and never counted twice.
// Mouse: moving the pointer steers (offset from the centre of the canvas),
// click confirms.
export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;

const PITCH_UP = new Set(['ArrowUp', 'KeyW']);
const PITCH_DOWN = new Set(['ArrowDown', 'KeyS']);
const ROLL_LEFT = new Set(['ArrowLeft', 'KeyA']);
const ROLL_RIGHT = new Set(['ArrowRight', 'KeyD']);
const YAW_LEFT = new Set(['KeyQ']);
const YAW_RIGHT = new Set(['KeyE']);
const THROTTLE_UP = new Set(['ShiftLeft', 'ShiftRight', 'Equal']);
const THROTTLE_DOWN = new Set(['ControlLeft', 'Minus']);
const CONFIRM = new Set(['Space', 'Enter']);
const PAUSE = new Set(['KeyP', 'Escape']);

export function createInput(target) {
  const held = new Set();
  let actions = 0;
  let mousePitch = 0;
  let mouseRoll = 0;
  let mouseActive = false;

  window.addEventListener('keydown', (event) => {
    if (CONFIRM.has(event.code)) {
      if (!event.repeat) actions |= ACTION_CONFIRM;
    } else if (PAUSE.has(event.code)) {
      if (!event.repeat) actions |= ACTION_PAUSE;
    } else if (
      PITCH_UP.has(event.code) || PITCH_DOWN.has(event.code)
      || ROLL_LEFT.has(event.code) || ROLL_RIGHT.has(event.code)
      || YAW_LEFT.has(event.code) || YAW_RIGHT.has(event.code)
      || THROTTLE_UP.has(event.code) || THROTTLE_DOWN.has(event.code)
    ) {
      held.add(event.code);
    } else return;
    event.preventDefault();
  });
  window.addEventListener('keyup', (event) => {
    held.delete(event.code);
  });
  window.addEventListener('blur', () => {
    held.clear();
    mouseActive = false;
    mousePitch = 0;
    mouseRoll = 0;
  });
  target.addEventListener('pointerdown', () => {
    actions |= ACTION_CONFIRM;
  });
  target.addEventListener('pointermove', (event) => {
    const rect = target.getBoundingClientRect();
    const nx = (event.clientX - rect.left) / rect.width - 0.5;
    const ny = (event.clientY - rect.top) / rect.height - 0.5;
    if (Math.abs(nx) > 0.08 || Math.abs(ny) > 0.08) {
      mouseActive = true;
      mouseRoll = Math.max(-1, Math.min(1, nx * 2.4));
      mousePitch = Math.max(-1, Math.min(1, -ny * 2.2));
    } else {
      mouseActive = false;
      mouseRoll = 0;
      mousePitch = 0;
    }
  });

  function has(set) {
    for (const code of set) if (held.has(code)) return true;
    return false;
  }

  return {
    /** Pitch -1..1 (up positive), roll -1..1, yaw -1..1, throttle -1..1. */
    controls() {
      const pitch = (has(PITCH_UP) ? 1 : 0) - (has(PITCH_DOWN) ? 1 : 0);
      const roll = (has(ROLL_RIGHT) ? 1 : 0) - (has(ROLL_LEFT) ? 1 : 0);
      const yaw = (has(YAW_RIGHT) ? 1 : 0) - (has(YAW_LEFT) ? 1 : 0);
      const throttle = (has(THROTTLE_UP) ? 1 : 0) - (has(THROTTLE_DOWN) ? 1 : 0);
      return {
        pitch,
        roll,
        yaw,
        throttleDelta: throttle * 0.55,
        mousePitch: mouseActive ? mousePitch : 0,
        mouseRoll: mouseActive ? mouseRoll : 0,
      };
    },
    /** The one-shot presses since the last call, as ACTION_* flags. */
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
  };
}
