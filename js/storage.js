/**
 * localStorage 封装：任何读写失败（隐私模式、配额满、被策略禁用）都自动降级到内存，
 * 保证游戏在无存储环境下依然可玩。
 */

export const KEYS = {
  best: 'game2048.best',
  state: 'game2048.state',
  theme: 'game2048.theme',
};

const STATE_VERSION = 1;
const memory = new Map();
let persistent = true;

try {
  const probe = '__game2048_probe__';
  window.localStorage.setItem(probe, '1');
  window.localStorage.removeItem(probe);
} catch {
  persistent = false;
}

function read(key) {
  if (persistent) {
    try {
      return window.localStorage.getItem(key);
    } catch {
      /* 降级到内存 */
    }
  }
  return memory.has(key) ? memory.get(key) : null;
}

function write(key, value) {
  if (persistent) {
    try {
      window.localStorage.setItem(key, value);
      return;
    } catch {
      persistent = false;
    }
  }
  memory.set(key, value);
}

function remove(key) {
  memory.delete(key);
  if (!persistent) return;
  try {
    window.localStorage.removeItem(key);
  } catch {
    /* 忽略 */
  }
}

function isPowerOfTwo(value) {
  return Number.isInteger(value) && value >= 2 && Number.isInteger(Math.log2(value));
}

function isValidSnapshot(snapshot, length) {
  return (
    snapshot !== null &&
    typeof snapshot === 'object' &&
    Array.isArray(snapshot.values) &&
    snapshot.values.length === length &&
    snapshot.values.every((v) => v === 0 || isPowerOfTwo(v)) &&
    Number.isFinite(snapshot.score) &&
    snapshot.score >= 0
  );
}

export function loadBest() {
  const value = Number(read(KEYS.best));
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

export function saveBest(value) {
  write(KEYS.best, String(Math.max(0, Math.floor(value))));
}

export function loadTheme() {
  const value = read(KEYS.theme);
  return value === 'dark' || value === 'light' ? value : null;
}

export function saveTheme(theme) {
  write(KEYS.theme, theme);
}

export function saveState(state) {
  write(
    KEYS.state,
    JSON.stringify({
      version: STATE_VERSION,
      values: state.values,
      score: state.score,
      history: state.history,
    }),
  );
}

/**
 * 读取存档。任何字段不合法（版本不符、长度不对、出现非 2 的幂）都返回 null，
 * 让调用方安静地开新局，而不是抛错或画出坏棋盘。
 * @returns {{ values: number[], score: number, history: Array<{values:number[],score:number}> }|null}
 */
export function loadState(size) {
  const raw = read(KEYS.state);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.version !== STATE_VERSION) return null;
    if (!Array.isArray(parsed.values) || parsed.values.length !== size * size) return null;
    if (!parsed.values.every((v) => v === 0 || isPowerOfTwo(v))) return null;
    if (parsed.values.every((v) => v === 0)) return null;

    const history = Array.isArray(parsed.history)
      ? parsed.history.filter((snapshot) => isValidSnapshot(snapshot, size * size)).slice(-20)
      : [];

    return {
      values: parsed.values.slice(),
      score: Number.isFinite(parsed.score) && parsed.score >= 0 ? Math.floor(parsed.score) : 0,
      history: history.map((snapshot) => ({
        values: snapshot.values.slice(),
        score: Math.floor(snapshot.score),
      })),
    };
  } catch {
    return null;
  }
}

export function clearState() {
  remove(KEYS.state);
}

/** 供测试/调试查看当前是否真的用上了 localStorage。 */
export function isPersistent() {
  return persistent;
}
