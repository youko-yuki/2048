/**
 * 输入层：键盘（方向键 / WASD / Z 撤销 / R 重开）+ Pointer Events 手势（触摸与鼠标拖拽统一处理）。
 * 只做「识别意图」，具体规则与状态交给上层。
 */

const KEY_DIRECTIONS = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
  w: 'up',
  a: 'left',
  s: 'down',
  d: 'right',
  W: 'up',
  A: 'left',
  S: 'down',
  D: 'right',
};

/** 滑动最小识别距离（px），低于此值视为点击。 */
const SWIPE_THRESHOLD = 24;

export function attachInput({ boardEl, onMove, onUndo, onNewGame }) {
  function isTypingTarget(target) {
    if (!(target instanceof HTMLElement)) return false;
    const tag = target.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable;
  }

  function handleKeydown(event) {
    if (event.defaultPrevented || event.altKey || isTypingTarget(event.target)) return;

    const direction = KEY_DIRECTIONS[event.key];
    if (direction) {
      if (event.ctrlKey || event.metaKey) return;
      event.preventDefault();
      onMove(direction);
      return;
    }

    if (event.ctrlKey || event.metaKey) {
      if (event.key === 'z' || event.key === 'Z') {
        event.preventDefault();
        onUndo();
      }
      return;
    }

    if (event.key === 'z' || event.key === 'Z') {
      event.preventDefault();
      onUndo();
    } else if (event.key === 'r' || event.key === 'R') {
      event.preventDefault();
      onNewGame();
    }
  }

  let pointer = null;

  function handlePointerDown(event) {
    if (pointer || (event.pointerType === 'mouse' && event.button !== 0)) return;
    pointer = { id: event.pointerId, x: event.clientX, y: event.clientY };
    if (typeof boardEl.setPointerCapture === 'function') {
      try {
        boardEl.setPointerCapture(event.pointerId);
      } catch {
        /* 某些浏览器在指针已释放时会抛错，忽略即可 */
      }
    }
  }

  function handlePointerUp(event) {
    if (!pointer || event.pointerId !== pointer.id) return;
    const { x, y } = pointer;
    pointer = null;

    const dx = event.clientX - x;
    const dy = event.clientY - y;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < SWIPE_THRESHOLD) return;

    if (Math.abs(dx) > Math.abs(dy)) onMove(dx > 0 ? 'right' : 'left');
    else onMove(dy > 0 ? 'down' : 'up');
  }

  function handlePointerCancel() {
    pointer = null;
  }

  // 手势期间阻止页面滚动（.board 上还有 touch-action: none 兜底）
  function handleTouchMove(event) {
    if (pointer && event.cancelable) event.preventDefault();
  }

  window.addEventListener('keydown', handleKeydown);
  boardEl.addEventListener('pointerdown', handlePointerDown);
  boardEl.addEventListener('pointerup', handlePointerUp);
  boardEl.addEventListener('pointercancel', handlePointerCancel);
  boardEl.addEventListener('touchmove', handleTouchMove, { passive: false });

  return function detach() {
    window.removeEventListener('keydown', handleKeydown);
    boardEl.removeEventListener('pointerdown', handlePointerDown);
    boardEl.removeEventListener('pointerup', handlePointerUp);
    boardEl.removeEventListener('pointercancel', handlePointerCancel);
    boardEl.removeEventListener('touchmove', handleTouchMove);
  };
}
