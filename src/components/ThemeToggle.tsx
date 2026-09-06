import { useCallback, useEffect, useState } from 'react';

type Mode = 'system' | 'light' | 'dark';

const KEY = 'scpd-theme';
const ORDER: Mode[] = ['system', 'light', 'dark'];
const LABEL: Record<Mode, string> = {
  system: 'System theme',
  light: 'Light theme',
  dark: 'Dark theme',
};

function read(): Mode {
  const v = localStorage.getItem(KEY);
  return v === 'light' || v === 'dark' ? v : 'system';
}

function apply(mode: Mode) {
  const root = document.documentElement;
  if (mode === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', mode);
}

export function ThemeToggle() {
  const [mode, setMode] = useState<Mode>('system');

  useEffect(() => {
    setMode(read());
  }, []);

  const cycle = useCallback(() => {
    setMode((m) => {
      const next = ORDER[(ORDER.indexOf(m) + 1) % ORDER.length];
      if (next === 'system') localStorage.removeItem(KEY);
      else localStorage.setItem(KEY, next);
      apply(next);
      return next;
    });
  }, []);

  return (
    <button type="button" className="theme-btn" onClick={cycle} aria-live="polite">
      {LABEL[mode]}
    </button>
  );
}
