import { create } from 'zustand';

const KEY = 'flowbase-theme'; // ключ не меняем: его читает скрипт в index.html и у людей уже сохранена тема

const apply = (theme) => {
  document.documentElement.setAttribute('data-theme', theme);
  try {
    localStorage.setItem(KEY, theme);
  } catch {
    /* приватный режим — тема просто не сохранится */
  }
};

// Один стор на всё приложение: меню профиля и страница настроек видят одну и ту же тему.
const useThemeStore = create((set, get) => ({
  theme: document.documentElement.getAttribute('data-theme') || 'dark',
  setTheme(theme) {
    apply(theme);
    set({ theme });
  },
  toggle() {
    get().setTheme(get().theme === 'dark' ? 'light' : 'dark');
  }
}));

export function useTheme() {
  const theme = useThemeStore((s) => s.theme);
  const setTheme = useThemeStore((s) => s.setTheme);
  const toggle = useThemeStore((s) => s.toggle);
  return { theme, setTheme, toggle };
}
