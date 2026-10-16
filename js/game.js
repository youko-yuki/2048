/**
 * 2048 核心逻辑：纯函数 + 显式状态，不依赖 DOM，可被 Node 直接 import 做单测。
 *
 * 棋盘模型：{ size, cells: (null | Tile)[] }，cells 按行优先展开，长度 size*size。
 * Tile：{ id, value, isNew? }，id 在多次移动之间保持不变，渲染层靠它复用 DOM 元素做滑动动画。
 */

export const HISTORY_LIMIT = 20;
export const WIN_VALUE = 2048;
/** 新方块出现 4 的概率，其余为 2。 */
export const FOUR_RATE = 0.1;
export const DIRECTIONS = ['up', 'down', 'left', 'right'];

let nextTileId = 1;

export function makeTile(value) {
  return { id: nextTileId++, value };
}

export function createBoard(size = 4) {
  return { size, cells: new Array(size * size).fill(null) };
}

export function cloneBoard(board) {
  return {
    size: board.size,
    cells: board.cells.map((tile) => (tile ? { ...tile } : null)),
  };
}

/** 棋盘 → 纯数值数组（0 表示空），用于持久化快照。 */
export function toValues(board) {
  return board.cells.map((tile) => (tile ? tile.value : 0));
}

/** 纯数值数组 → 棋盘（方块会拿到全新的 id，用于撤销/恢复时无动画重绘）。 */
export function fromValues(values, size = Math.round(Math.sqrt(values.length))) {
  return { size, cells: values.map((value) => (value ? makeTile(value) : null)) };
}

function emptyIndices(board) {
  const result = [];
  for (let i = 0; i < board.cells.length; i++) {
    if (!board.cells[i]) result.push(i);
  }
  return result;
}

/**
 * 在随机空格生成一个新方块（90% 为 2，10% 为 4）。
 * @returns {{ board: object, tile: object|null }} board 是新对象，原棋盘不被修改。
 */
export function spawnTile(board, rng = Math.random) {
  const empty = emptyIndices(board);
  if (empty.length === 0) return { board, tile: null };

  const pick = Math.min(empty.length - 1, Math.max(0, Math.floor(rng() * empty.length)));
  const tile = makeTile(rng() < FOUR_RATE ? 4 : 2);
  const cells = board.cells.slice();
  cells[empty[pick]] = tile;
  return { board: { size: board.size, cells }, tile };
}

/** 按方向返回一条线（从移动方向的最前端开始）上的坐标序列。 */
function lineCoords(direction, index, size) {
  const coords = [];
  for (let k = 0; k < size; k++) {
    switch (direction) {
      case 'left':
        coords.push({ r: index, c: k });
        break;
      case 'right':
        coords.push({ r: index, c: size - 1 - k });
        break;
      case 'up':
        coords.push({ r: k, c: index });
        break;
      case 'down':
        coords.push({ r: size - 1 - k, c: index });
        break;
      default:
        throw new Error(`未知方向: ${direction}`);
    }
  }
  return coords;
}

/**
 * 朝某方向移动一次。
 *
 * 合并规则：同一条线上相邻且同值的两个方块合并，且**每个方块一次移动最多参与一次合并**
 * （所以 [2,2,2,2] 左移得到 [4,4]，而不是 [8]）。
 *
 * @returns {{
 *   board: object,      // 移动后的新棋盘（不生成新方块）
 *   gained: number,     // 本次得分
 *   moved: boolean,     // 棋盘是否发生变化；false 时调用方不应生成新方块/计分/记历史
 *   movements: Array<{ id: number, from: {r:number,c:number}, to: {r:number,c:number}, merged?: boolean, absorbed?: boolean }>
 * }}
 *   movements 覆盖移动前棋盘上的每一个方块：合并时保留方块（id 不变、值翻倍）记为 merged，
 *   被吸收的方块记为 absorbed（它滑到同一格后消失）。
 */
export function move(board, direction) {
  const { size } = board;
  const cells = new Array(size * size).fill(null);
  const movements = [];
  let gained = 0;

  for (let index = 0; index < size; index++) {
    const coords = lineCoords(direction, index, size);
    const line = [];

    for (const coord of coords) {
      const tile = board.cells[coord.r * size + coord.c];
      if (!tile) continue;

      const prev = line[line.length - 1];
      if (prev && prev.absorbed.length === 0 && prev.tile.value === tile.value) {
        prev.tile = { ...prev.tile, value: prev.tile.value * 2 };
        prev.absorbed.push({ id: tile.id, src: coord });
        gained += prev.tile.value;
      } else {
        line.push({ tile, src: coord, absorbed: [] });
      }
    }

    line.forEach((entry, target) => {
      const to = coords[target];
      cells[to.r * size + to.c] = entry.tile;
      movements.push({ id: entry.tile.id, from: entry.src, to, merged: entry.absorbed.length > 0 });
      for (const absorbed of entry.absorbed) {
        movements.push({ id: absorbed.id, from: absorbed.src, to, absorbed: true });
      }
    });
  }

  const moved =
    gained > 0 ||
    movements.some((m) => !m.absorbed && (m.from.r !== m.to.r || m.from.c !== m.to.c));

  return { board: { size, cells }, gained, moved, movements };
}

export function hasWon(board, target = WIN_VALUE) {
  return board.cells.some((tile) => tile !== null && tile.value >= target);
}

/** 无空格且没有相邻同值 → 无法再移动。 */
export function isGameOver(board) {
  const { size, cells } = board;
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const tile = cells[r * size + c];
      if (!tile) return false;
      if (c + 1 < size && cells[r * size + c + 1] && cells[r * size + c + 1].value === tile.value) return false;
      if (r + 1 < size && cells[(r + 1) * size + c] && cells[(r + 1) * size + c].value === tile.value) return false;
    }
  }
  return true;
}

/** 开局状态：棋盘上两个随机方块。 */
export function createState(size = 4, rng = Math.random) {
  let board = createBoard(size);
  for (let i = 0; i < 2; i++) board = spawnTile(board, rng).board;
  return { board, score: 0, history: [], over: false };
}

/**
 * 一整套「移动一步」的业务规则：无效移动不生成方块、不计分、不写历史。
 * @returns {{ state: object, moved: boolean, gained?: number, movements?: Array }}
 *   无效移动时 state 与传入对象是同一个引用，调用方可据此跳过重绘。
 */
export function stepGame(state, direction, rng = Math.random) {
  const result = move(state.board, direction);
  if (!result.moved) return { state, moved: false };

  const history = state.history.concat({ values: toValues(state.board), score: state.score });
  if (history.length > HISTORY_LIMIT) history.splice(0, history.length - HISTORY_LIMIT);

  const spawned = spawnTile(result.board, rng);
  if (spawned.tile) spawned.tile.isNew = true;

  return {
    state: {
      ...state,
      board: spawned.board,
      score: state.score + result.gained,
      history,
    },
    moved: true,
    gained: result.gained,
    movements: result.movements,
  };
}

/** 撤销一步：回退棋盘与分数；分数记录（最高分）由调用方决定是否回退。 */
export function undoGame(state) {
  if (state.history.length === 0) return { state, undone: false };

  const snapshot = state.history[state.history.length - 1];
  return {
    state: {
      ...state,
      board: fromValues(snapshot.values, state.board.size),
      score: snapshot.score,
      history: state.history.slice(0, -1),
      over: false,
    },
    undone: true,
  };
}
