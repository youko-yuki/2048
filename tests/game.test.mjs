/**
 * 逻辑自测：node --test tests/  （零依赖，用 Node 内置测试运行器）
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DIRECTIONS,
  FOUR_RATE,
  HISTORY_LIMIT,
  WIN_VALUE,
  createBoard,
  createState,
  fromValues,
  hasWon,
  isGameOver,
  move,
  spawnTile,
  stepGame,
  toValues,
  undoGame,
} from '../js/game.js';

/** 可复现的伪随机数，避免测试随机失败。 */
function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const boardOf = (rows) => fromValues(rows.flat());
const values = (board) => toValues(board);
const count = (board) => values(board).filter(Boolean).length;

test('左移：相邻同值两两合并，且每个方块只合并一次', () => {
  const result = move(boardOf([
    [2, 2, 2, 2],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
  ]), 'left');

  assert.deepEqual(values(result.board).slice(0, 4), [4, 4, 0, 0]);
  assert.equal(result.gained, 8);
  assert.equal(result.moved, true);
});

test('左移：[4,4,8] → [8,8]，合并出来的 8 不再与右边的 8 合并', () => {
  const result = move(boardOf([
    [4, 4, 8, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
  ]), 'left');

  assert.deepEqual(values(result.board).slice(0, 4), [8, 8, 0, 0]);
  assert.equal(result.gained, 8);
});

test('左移：交错排列不合并，且 moved=false', () => {
  const result = move(boardOf([
    [2, 4, 2, 4],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
  ]), 'left');

  assert.deepEqual(values(result.board).slice(0, 4), [2, 4, 2, 4]);
  assert.equal(result.gained, 0);
  assert.equal(result.moved, false);
});

test('右移：[2,2,4,4] → [0,0,4,8]', () => {
  const result = move(boardOf([
    [2, 2, 4, 4],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
  ]), 'right');

  assert.deepEqual(values(result.board).slice(0, 4), [0, 0, 4, 8]);
  assert.equal(result.gained, 12);
});

test('上移 / 下移：按列处理', () => {
  const rows = [
    [2, 0, 0, 0],
    [2, 0, 0, 0],
    [4, 0, 0, 0],
    [4, 0, 0, 0],
  ];

  const up = move(boardOf(rows), 'up');
  assert.deepEqual(values(up.board).filter((_, i) => i % 4 === 0), [4, 8, 0, 0]);
  assert.equal(up.gained, 12);

  const down = move(boardOf(rows), 'down');
  assert.deepEqual(values(down.board).filter((_, i) => i % 4 === 0), [0, 0, 4, 8]);
  assert.equal(down.gained, 12);
});

test('move 不修改传入的棋盘（纯函数）', () => {
  const board = boardOf([
    [2, 2, 0, 0],
    [4, 4, 4, 0],
    [0, 0, 0, 2],
    [2, 0, 0, 0],
  ]);
  const snapshot = values(board);
  const ids = board.cells.filter(Boolean).map((t) => t.id);

  move(board, 'left');
  move(board, 'down');

  assert.deepEqual(values(board), snapshot);
  assert.deepEqual(board.cells.filter(Boolean).map((t) => t.id), ids);
});

test('movements：覆盖移动前的每个方块，合并信息自洽', () => {
  const board = boardOf([
    [2, 2, 4, 0],
    [4, 8, 8, 8],
    [0, 0, 0, 0],
    [2, 0, 2, 2],
  ]);
  const oldIds = board.cells.filter(Boolean).map((t) => t.id).sort();
  const result = move(board, 'left');

  assert.deepEqual(result.movements.map((m) => m.id).sort(), oldIds, '每个旧方块都必须有一条动画记录');

  const absorbed = result.movements.filter((m) => m.absorbed);
  const survivors = result.movements.filter((m) => !m.absorbed);
  assert.equal(absorbed.length, 3, '共发生 3 次合并：[2,2]、[8,8]、[2,2]');
  assert.equal(result.gained, 24);
  assert.equal(survivors.length, count(result.board));

  for (const m of absorbed) {
    assert.ok(m.from.r !== m.to.r || m.from.c !== m.to.c, '被吸收的方块一定发生了位移');
  }
  for (const m of survivors.filter((m) => m.merged)) {
    assert.equal(m.merged, true);
  }
});

test('isGameOver / hasWon 的边界', () => {
  assert.equal(isGameOver(boardOf([
    [2, 4, 2, 4],
    [4, 2, 4, 2],
    [2, 4, 2, 4],
    [4, 2, 4, 2],
  ])), true);

  assert.equal(isGameOver(boardOf([
    [2, 4, 2, 4],
    [4, 2, 4, 2],
    [2, 4, 2, 4],
    [4, 2, 4, 0],
  ])), false, '有空位就不算结束');

  assert.equal(isGameOver(boardOf([
    [2, 2, 4, 8],
    [4, 2, 4, 2],
    [2, 4, 2, 4],
    [4, 2, 4, 2],
  ])), false, '有相邻同值就不算结束');

  assert.equal(hasWon(boardOf([
    [WIN_VALUE, 0, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
  ])), true);

  assert.equal(hasWon(boardOf([
    [1024, 0, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
  ])), false);
});

test('spawnTile：满盘时返回原棋盘，且数值只会是 2 或 4', () => {
  const full = boardOf([
    [2, 4, 2, 4],
    [4, 2, 4, 2],
    [2, 4, 2, 4],
    [4, 2, 4, 2],
  ]);
  const rng = mulberry32(5);
  assert.equal(spawnTile(full, rng).tile, null);
  assert.equal(spawnTile(full, rng).board, full);

  for (let i = 0; i < 300; i++) {
    const { tile } = spawnTile(createBoard(4), rng);
    assert.ok(tile.value === 2 || tile.value === 4);
  }
});

test(`新方块出现 4 的比例约为 ${FOUR_RATE * 100}%`, () => {
  const rng = mulberry32(42);
  let fours = 0;
  const rounds = 4000;

  for (let i = 0; i < rounds; i++) {
    if (spawnTile(createBoard(4), rng).tile.value === 4) fours += 1;
  }

  const ratio = fours / rounds;
  assert.ok(ratio > 0.07 && ratio < 0.13, `4 的比例应在 10% 附近，实际 ${(ratio * 100).toFixed(1)}%`);
});

test('stepGame：无效移动不生成方块、不计分、不写历史，且状态引用不变', () => {
  const state = {
    board: boardOf([
      [2, 4, 8, 16],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ]),
    score: 0,
    history: [],
    over: false,
  };

  const result = stepGame(state, 'left', mulberry32(7));

  assert.equal(result.moved, false);
  assert.equal(result.state, state, '无变化时应返回同一个状态对象，便于上层跳过重绘');
  assert.equal(result.state.history.length, 0);
  assert.equal(result.state.score, 0);
  assert.equal(count(result.state.board), 4, '棋盘内容完全没变');
});

test('stepGame：有效移动恰好新增一个方块，并记录历史', () => {
  const state = {
    board: boardOf([
      [2, 2, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ]),
    score: 0,
    history: [],
    over: false,
  };

  const result = stepGame(state, 'left', () => 0.5);

  assert.equal(result.moved, true);
  assert.equal(result.gained, 4);
  assert.equal(result.state.score, 4);
  assert.equal(result.state.history.length, 1);
  assert.equal(result.state.history[0].score, 0);
  assert.deepEqual(result.state.history[0].values, [2, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
  assert.equal(count(result.state.board), 2, '合并掉 1 个 + 新增 1 个 = 仍是 2 个');

  const spawned = result.state.board.cells.find((t) => t !== null && t.isNew);
  assert.ok(spawned, '新增方块应带 isNew 标记供渲染层做出现动画');
  assert.equal(spawned.value, 2, 'rng 返回 0.5 时应生成 2');
});

test('撤销：逐步回退棋盘与分数，直到开局；无历史时返回 undone=false', () => {
  const rng = mulberry32(11);
  let state = createState(4, rng);

  const timeline = [{ values: values(state.board), score: state.score }];

  for (let i = 0; i < 5; i++) {
    let applied = null;
    for (const direction of DIRECTIONS) {
      const attempt = stepGame(state, direction, rng);
      if (attempt.moved) {
        applied = attempt;
        break;
      }
    }
    assert.ok(applied, '开局阶段至少有一个方向可移动');
    state = applied.state;
    timeline.push({ values: values(state.board), score: state.score });
  }

  assert.equal(state.history.length, 5);

  for (let i = timeline.length - 2; i >= 0; i--) {
    const undone = undoGame(state);
    assert.equal(undone.undone, true);
    state = undone.state;
    assert.deepEqual(values(state.board), timeline[i].values);
    assert.equal(state.score, timeline[i].score);
  }

  assert.equal(state.history.length, 0);
  assert.equal(undoGame(state).undone, false);
});

test(`历史记录上限为 ${HISTORY_LIMIT} 步`, () => {
  const rng = mulberry32(2024);
  let state = createState(4, rng);
  let moves = 0;

  while (!isGameOver(state.board) && moves < 200) {
    let applied = null;
    for (const direction of DIRECTIONS) {
      const attempt = stepGame(state, direction, rng);
      if (attempt.moved) {
        applied = attempt;
        break;
      }
    }
    if (!applied) break;

    state = applied.state;
    moves += 1;
    assert.ok(state.history.length <= HISTORY_LIMIT, `历史长度 ${state.history.length} 超过上限`);
  }

  assert.ok(moves > HISTORY_LIMIT, '这一局应当走了足够多步，才能真正触发上限裁剪');
  assert.equal(state.history.length, HISTORY_LIMIT);
});

test('序列化往返：toValues → fromValues 保持一致', () => {
  const rows = [
    [2, 4, 8, 16],
    [32, 64, 128, 256],
    [512, 1024, 2048, 4096],
    [0, 2, 0, 4],
  ];
  assert.deepEqual(values(fromValues(rows.flat())), rows.flat());
});

test('压力测试：200 局随机对局，状态始终合法', () => {
  const rng = mulberry32(99);
  const validValue = (v) => v === 0 || (v >= 2 && Number.isInteger(Math.log2(v)));

  for (let game = 0; game < 200; game++) {
    let state = createState(4, rng);
    assert.equal(count(state.board), 2, '开局恰好两个方块');

    let guard = 0;
    while (!isGameOver(state.board) && guard++ < 2000) {
      const direction = DIRECTIONS[Math.floor(rng() * DIRECTIONS.length) % DIRECTIONS.length];
      const attempt = stepGame(state, direction, rng);
      if (!attempt.moved) continue;

      const before = count(state.board);
      const merged = attempt.movements.filter((m) => m.absorbed).length;
      state = attempt.state;

      const board = values(state.board);
      assert.ok(board.every(validValue), '棋盘上的值必须都是 2 的幂');
      assert.ok(count(state.board) <= 16, '方块数不会超过格子数');
      assert.equal(count(state.board), before + 1 - merged, '每次有效移动：合并减少 merged 个、新增 1 个');
      assert.ok(state.history.length <= HISTORY_LIMIT);
      assert.ok(state.score >= 0);

      const ids = state.board.cells.filter(Boolean).map((t) => t.id);
      assert.equal(new Set(ids).size, ids.length, '方块 id 必须唯一');
    }

    assert.equal(isGameOver(state.board), true, '循环退出时应当已无法移动');
  }
});
