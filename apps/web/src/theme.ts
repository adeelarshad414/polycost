export type ThemeChoice = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

export const THEME_STORAGE_KEY = 'polycost-theme';

export function isThemeChoice(value: string | null): value is ThemeChoice {
  return value === 'light' || value === 'dark' || value === 'system';
}

export function storedTheme(storage: Pick<Storage, 'getItem'> = localStorage): ThemeChoice {
  const value = storage.getItem(THEME_STORAGE_KEY);
  return isThemeChoice(value) ? value : 'system';
}

export function resolveTheme(
  choice: ThemeChoice,
  matchMedia: (query: string) => Pick<MediaQueryList, 'matches'> = defaultMatchMedia,
): ResolvedTheme {
  if (choice === 'light' || choice === 'dark') {
    return choice;
  }

  return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function defaultMatchMedia(query: string): Pick<MediaQueryList, 'matches'> {
  if (typeof window.matchMedia === 'function') {
    return window.matchMedia(query);
  }

  return {
    matches: false,
  };
}

export function applyTheme(
  choice: ThemeChoice,
  root: HTMLElement = document.documentElement,
  storage: Pick<Storage, 'setItem'> = localStorage,
): ResolvedTheme {
  const resolved = resolveTheme(choice);
  root.dataset.theme = resolved;
  root.dataset.themeChoice = choice;
  storage.setItem(THEME_STORAGE_KEY, choice);
  return resolved;
}
