/**
 * 渲染与动画层。
 *
 * 关键点：
 * 1. 背景网格（.grid）是静态的 16 个格子，只有方块层（.tiles）会变动。
 * 2. 每个方块元素按 tile.id 复用：位置变化靠 transform 过渡产生滑动效果；
 *    缩放类动画（pop / appear）放在内层 .tile-inner 上，避免和 translate 抢同一个 transform。
 * 3. 布局用像素计算（.board 的 --gap + clientWidth），配合 ResizeObserver 响应式重排。
 */

const BASE_DURATION = { slide: 120, pop: 150, appear: 150 };

const TILE_COLORS = {
  2: ['#eee4da', '#776e65'],
  4: ['#ede0c8', '#776e65'],
  8: ['#f2b179', '#f9f6f2'],
  16: ['#f59563', '#f9f6f2'],
  32: ['#f67c5f', '#f9f6f2'],
  64: ['#f65e3b', '#f9f6f2'],
  128: ['#edcf72', '#f9f6f2'],
  256: ['#edcc61', '#f9f6f2'],
  512: ['#edc850', '#f9f6f2'],
  1024: ['#edc53f', '#f9f6f2'],
  2048: ['#edc22e', '#f9f6f2'],
};

function tileColors(value) {
  return TILE_COLORS[value] ?? (value > 2048 ? ['#3c3a32', '#f9f6f2'] : ['#eee4da', '#776e65']);
}

export function prefersReducedMotion() {
  return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function createRenderer({ boardEl, gridEl, tilesLayer }) {
  /** @type {Map<number, HTMLElement>} */
  const elements = new Map();
  let layout = { gap: 12, cell: 0 };
  let size = 0;

  function durations() {
    return prefersReducedMotion() ? { slide: 0, pop: 0, appear: 0 } : BASE_DURATION;
  }

  function wait(ms) {
    return ms > 0 ? new Promise((resolve) => setTimeout(resolve, ms)) : Promise.resolve();
  }

  function measure(boardSize) {
    size = boardSize;
    const styles = getComputedStyle(boardEl);
    const gap = Number.parseFloat(styles.getPropertyValue('--gap')) || 12;
    const inner = boardEl.clientWidth - gap * 2;
    const cell = Math.max(0, (inner - gap * (size - 1)) / size);
    layout = { gap, cell };
  }

  function pos(r, c) {
    const { gap, cell } = layout;
    return { x: gap + c * (cell + gap), y: gap + r * (cell + gap), box: cell };
  }

  function applyBox(el, r, c, animate) {
    const p = pos(r, c);
    if (!animate) el.style.transition = 'none';
    el.style.width = `${p.box}px`;
    el.style.height = `${p.box}px`;
    el.style.transform = `translate(${p.x}px, ${p.y}px)`;
    el.dataset.r = String(r);
    el.dataset.c = String(c);
    if (!animate) {
      void el.offsetWidth; // 强制一次重排，避免取消 transition 后又被动画
      el.style.transition = '';
    }
  }

  function paintValues(el, tile) {
    const [bg, fg] = tileColors(tile.value);
    el.dataset.value = String(tile.value);
    el.dataset.digits = String(String(tile.value).length);
    el.style.setProperty('--tile-bg', bg);
    el.style.setProperty('--tile-fg', fg);
    el.firstChild.textContent = String(tile.value);
  }

  function createTileEl(tile) {
    const el = document.createElement('div');
    el.className = 'tile';
    const inner = document.createElement('div');
    inner.className = 'tile-inner';
    el.append(inner);
    paintValues(el, tile);
    return el;
  }

  function addTileEl(tile, r, c) {
    const el = createTileEl(tile);
    elements.set(tile.id, el);
    tilesLayer.append(el);
    applyBox(el, r, c, false);
    return el;
  }

  function runInnerAnimation(el, className, duration) {
    const inner = el.firstChild;
    if (!inner) return;
    inner.classList.remove(className);
    void inner.offsetWidth;
    inner.style.animationDuration = duration > 0 ? `${duration}ms` : '';
    inner.classList.add(className);
  }

  function buildGrid(boardSize) {
    gridEl.style.setProperty('--size', String(boardSize));
    const cells = document.createDocumentFragment();
    for (let i = 0; i < boardSize * boardSize; i++) cells.append(document.createElement('div'));
    gridEl.replaceChildren(cells);
  }

  /** 无动画整体重绘：用于开局、撤销、恢复存档、方向键无效后的兜底。 */
  function render(board) {
    measure(board.size);
    buildGrid(board.size);
    tilesLayer.replaceChildren();
    elements.clear();

    const n = board.size;
    for (let i = 0; i < board.cells.length; i++) {
      const tile = board.cells[i];
      if (!tile) continue;
      addTileEl(tile, Math.floor(i / n), i % n);
      tile.isNew = false;
    }
  }

  /**
   * 一次移动的动画：先让所有方块滑到新位置，再清理被吸收的方块、
   * 给合并结果和新方块加缩放动画。
   */
  async function animateMove(board, movements, animate = true) {
    const duration = durations();
    size = board.size;

    const absorbedIds = new Set();
    const mergedIds = new Set();

    for (const movement of movements) {
      if (movement.absorbed) absorbedIds.add(movement.id);
      else if (movement.merged) mergedIds.add(movement.id);

      const el = elements.get(movement.id);
      if (!el) continue;

      if (!animate) {
        applyBox(el, movement.to.r, movement.to.c, false);
        continue;
      }
      el.style.zIndex = movement.absorbed ? '2' : '1';
      applyBox(el, movement.to.r, movement.to.c, true);
    }

    if (animate) await wait(duration.slide);

    for (const id of absorbedIds) {
      const el = elements.get(id);
      if (!el) continue;
      el.remove();
      elements.delete(id);
    }

    const n = board.size;
    for (let i = 0; i < board.cells.length; i++) {
      const tile = board.cells[i];
      if (!tile) continue;
      const r = Math.floor(i / n);
      const c = i % n;

      let el = elements.get(tile.id);
      if (!el) {
        el = addTileEl(tile, r, c);
        if (animate && tile.isNew) runInnerAnimation(el, 'appear', duration.appear);
      } else {
        paintValues(el, tile);
        applyBox(el, r, c, false);
        if (animate && mergedIds.has(tile.id)) runInnerAnimation(el, 'pop', duration.pop);
      }
      el.style.zIndex = '';
      tile.isNew = false;
    }
  }

  /** 视口尺寸变化后按新的格子尺寸重排（不改动状态，动画中调用由上层延迟）。 */
  function relayout() {
    if (!size) return;
    measure(size);
    for (const el of elements.values()) {
      const r = Number(el.dataset.r);
      const c = Number(el.dataset.c);
      if (Number.isFinite(r) && Number.isFinite(c)) applyBox(el, r, c, false);
    }
  }

  return { render, animateMove, relayout };
}
