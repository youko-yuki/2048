/**
 * 主题：<html data-theme="light|dark"> 上的一个属性。
 * 首屏防闪烁由 index.html 里的内联脚本负责，这里只做切换、持久化与跟随系统。
 */

import { loadTheme, saveTheme } from './storage.js';

const LABELS = {
  dark: '切换到浅色模式',
  light: '切换到深色模式',
};

function prefersDark() {
  return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function apply(theme) {
  document.documentElement.dataset.theme = theme;
}

export function currentTheme() {
  return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
}

function syncButton(button) {
  if (!button) return;
  const theme = currentTheme();
  button.dataset.theme = theme;
  button.setAttribute('aria-label', LABELS[theme]);
  button.setAttribute('title', LABELS[theme]);
}

/**
 * 初始化：若用户从未手动选过，则跟随系统，并在系统切换时跟随。
 * @returns {string} 当前主题
 */
export function initTheme(button) {
  const stored = loadTheme();
  apply(stored ?? (prefersDark() ? 'dark' : 'light'));
  syncButton(button);

  if (!stored && typeof window.matchMedia === 'function') {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = (event) => {
      if (loadTheme()) return;
      apply(event.matches ? 'dark' : 'light');
      syncButton(button);
    };
    if (typeof media.addEventListener === 'function') media.addEventListener('change', onChange);
  }

  return currentTheme();
}

export function toggleTheme(button) {
  const next = currentTheme() === 'dark' ? 'light' : 'dark';
  apply(next);
  saveTheme(next);
  syncButton(button);
  return next;
}
