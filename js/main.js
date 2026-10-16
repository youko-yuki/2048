/**
 * 装配层：把纯逻辑（game.js）、渲染（render.js）、输入（input.js）、
 * 持久化（storage.js）和主题（theme.js）连起来，并管理胜负面板与界面状态。
 */

import {
  WIN_VALUE,
  createState,
  fromValues,
  hasWon,
  isGameOver,
  stepGame,
  toValues,
  undoGame,
} from './game.js';
import { attachInput } from './input.js';
import { createRenderer } from './render.js';
import * as storage from './storage.js';
import { initTheme, toggleTheme } from './theme.js';

/** 棋盘边长，改这里即可换成 5×5（网格与动画都是按尺寸通用实现的）。 */
const SIZE = 4;

const el = {
  board: document.getElementById('board'),
  grid: document.getElementById('grid'),
  tiles: document.getElementById('tiles'),
  score: document.getElementById('score'),
  best: document.getElementById('best'),
  undo: document.getElementById('undo'),
  newGame: document.getElementById('new-game'),
  theme: document.getElementById('theme'),
  overlay: document.getElementById('overlay'),
  overlayTitle: document.getElementById('overlay-title'),
  overlayText: document.getElementById('overlay-text'),
  overlayActions: document.getElementById('overlay-actions'),
  live: document.getElementById('live'),
};

const renderer = createRenderer({ boardEl: el.board, gridEl: el.grid, tilesLayer: el.tiles });

const ui = {
  game: null,
  best: 0,
  busy: false,
  pendingLayout: false,
  wonAcknowledged: false,
};

function announce(message) {
  el.live.textContent = message;
}

function updateHud() {
  el.score.textContent = String(ui.game.score);
  el.best.textContent = String(Math.max(ui.best, ui.game.score));
  el.undo.disabled = ui.game.history.length === 0;
}

function persist() {
  storage.saveState({
    values: toValues(ui.game.board),
    score: ui.game.score,
    history: ui.game.history,
  });
}

function hideOverlay() {
  el.overlay.hidden = true;
  el.overlayActions.replaceChildren();
}

function showOverlay({ kind, title, text, actions }) {
  el.overlay.dataset.kind = kind;
  el.overlayTitle.textContent = title;
  el.overlayText.textContent = text;

  const buttons = actions.map((action) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = action.primary ? 'btn' : 'btn ghost';
    button.textContent = action.label;
    button.disabled = Boolean(action.disabled);
    button.addEventListener('click', () => {
      button.blur();
      action.onClick();
    });
    return button;
  });

  el.overlayActions.replaceChildren(...buttons);
  el.overlay.hidden = false;
  const focusTarget = buttons.find((button) => !button.disabled);
  if (focusTarget) focusTarget.focus();
}

function newGame() {
  ui.game = createState(SIZE);
  ui.busy = false;
  ui.pendingLayout = false;
  ui.wonAcknowledged = false;
  renderer.render(ui.game.board);
  hideOverlay();
  updateHud();
  persist();
  announce('新游戏开始');
}

async function handleMove(direction) {
  // 动画进行中、已结束、或胜负面板还挡在棋盘上都忽略移动
  if (ui.busy || ui.game.over || !el.overlay.hidden) return;

  const result = stepGame(ui.game, direction);
  if (!result.moved) return;

  ui.game = result.state;
  ui.busy = true;
  await renderer.animateMove(ui.game.board, result.movements, true);
  ui.busy = false;

  if (ui.pendingLayout) {
    ui.pendingLayout = false;
    renderer.relayout();
  }

  if (ui.game.score > ui.best) {
    ui.best = ui.game.score;
    storage.saveBest(ui.best);
  }
  updateHud();

  if (!ui.wonAcknowledged && hasWon(ui.game.board)) {
    ui.wonAcknowledged = true;
    showOverlay({
      kind: 'win',
      title: '你赢了！',
      text: `凑出了 ${WIN_VALUE}，还能更高吗？`,
      actions: [
        { label: '继续挑战', primary: true, onClick: hideOverlay },
        { label: '新游戏', onClick: newGame },
      ],
    });
    announce(`胜利，得分 ${ui.game.score}`);
  } else if (isGameOver(ui.game.board)) {
    ui.game = { ...ui.game, over: true };
    showOverlay({
      kind: 'over',
      title: '游戏结束',
      text: `最终得分 ${ui.game.score}`,
      actions: [
        {
          label: '撤销一步',
          primary: true,
          disabled: ui.game.history.length === 0,
          onClick: handleUndo,
        },
        { label: '新游戏', onClick: newGame },
      ],
    });
    announce(`游戏结束，最终得分 ${ui.game.score}`);
  } else {
    announce(`得分 ${ui.game.score}`);
  }

  persist();
}

function handleUndo() {
  if (ui.busy) return;

  const result = undoGame(ui.game);
  if (!result.undone) return;

  ui.game = { ...result.state, over: false };
  renderer.render(ui.game.board);
  hideOverlay();
  updateHud();
  persist();
  announce(`已撤销，当前得分 ${ui.game.score}`);
}

function restore() {
  const saved = storage.loadState(SIZE);
  if (!saved) {
    newGame();
    return;
  }

  ui.game = {
    board: fromValues(saved.values, SIZE),
    score: saved.score,
    history: saved.history,
    over: false,
  };
  ui.best = Math.max(storage.loadBest(), saved.score);
  ui.wonAcknowledged = hasWon(ui.game.board);
  renderer.render(ui.game.board);
  updateHud();

  if (isGameOver(ui.game.board)) {
    ui.game = { ...ui.game, over: true };
    showOverlay({
      kind: 'over',
      title: '游戏结束',
      text: `最终得分 ${ui.game.score}`,
      actions: [
        { label: '撤销一步', primary: true, disabled: ui.game.history.length === 0, onClick: handleUndo },
        { label: '新游戏', onClick: newGame },
      ],
    });
  } else {
    announce(`继续上次进度，当前得分 ${ui.game.score}`);
  }
}

function init() {
  ui.best = storage.loadBest();
  initTheme(el.theme);
  restore();

  el.newGame.addEventListener('click', newGame);
  el.undo.addEventListener('click', handleUndo);
  el.theme.addEventListener('click', () => toggleTheme(el.theme));

  attachInput({
    boardEl: el.board,
    onMove: handleMove,
    onUndo: handleUndo,
    onNewGame: newGame,
  });

  if (typeof ResizeObserver === 'function') {
    new ResizeObserver(() => {
      if (ui.busy) {
        ui.pendingLayout = true;
        return;
      }
      renderer.relayout();
    }).observe(el.board);
  } else {
    window.addEventListener('resize', () => renderer.relayout());
  }
}

init();
