export type ThemeChoice = 'system' | 'light' | 'dark';
export type ResolvedTheme = 'light' | 'dark';
export type AccentChoice = 'default' | 'terracotta';
type ThemeMediaQueryList = Pick<MediaQueryList, 'matches'> &
  Partial<Pick<MediaQueryList, 'addEventListener' | 'removeEventListener'>> & {
    addListener?: (listener: () => void) => void;
    removeListener?: (listener: () => void) => void;
  };

export const THEME_STORAGE_KEY = 'polycost-theme';
export const ACCENT_STORAGE_KEY = 'polycost-accent';

export function isThemeChoice(value: string | null): value is ThemeChoice {
  return value === 'system' || value === 'light' || value === 'dark';
}

export function isAccentChoice(value: string | null): value is AccentChoice {
  return value === 'default' || value === 'terracotta';
}

export function storedTheme(storage: Pick<Storage, 'getItem'> = localStorage): ThemeChoice {
  const value = storage.getItem(THEME_STORAGE_KEY);

  if (isThemeChoice(value)) {
    return value;
  }

  return 'system';
}

export function storedAccent(storage: Pick<Storage, 'getItem'> = localStorage): AccentChoice {
  const value = storage.getItem(ACCENT_STORAGE_KEY);

  if (isAccentChoice(value)) {
    return value;
  }

  return 'default';
}

export function resolveTheme(
  choice: ThemeChoice,
  matchMedia: (query: string) => Pick<MediaQueryList, 'matches'> = defaultMatchMedia,
): ResolvedTheme {
  if (choice === 'system') {
    return systemTheme(matchMedia);
  }

  return choice;
}

export function systemTheme(
  matchMedia: (query: string) => Pick<MediaQueryList, 'matches'> = defaultMatchMedia,
): ResolvedTheme {
  return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function defaultMatchMedia(query: string): ThemeMediaQueryList {
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
  matchMedia: (query: string) => Pick<MediaQueryList, 'matches'> = defaultMatchMedia,
): ResolvedTheme {
  const resolved = resolveTheme(choice, matchMedia);
  root.dataset.theme = resolved;
  root.dataset.themeChoice = choice;
  root.style.colorScheme = resolved;
  storage.setItem(THEME_STORAGE_KEY, choice);
  return resolved;
}

export function applyAccent(
  choice: AccentChoice,
  root: HTMLElement = document.documentElement,
  storage: Pick<Storage, 'setItem'> = localStorage,
): AccentChoice {
  root.dataset.accent = choice;
  root.dataset.accentChoice = choice;
  storage.setItem(ACCENT_STORAGE_KEY, choice);
  return choice;
}

export function subscribeToSystemTheme(
  onChange: (resolvedTheme: ResolvedTheme) => void,
  matchMedia: (query: string) => ThemeMediaQueryList = defaultMatchMedia,
): () => void {
  const mediaQuery = matchMedia('(prefers-color-scheme: dark)');
  const listener = () => onChange(mediaQuery.matches ? 'dark' : 'light');

  if (typeof mediaQuery.addEventListener === 'function') {
    mediaQuery.addEventListener('change', listener);
    return () => mediaQuery.removeEventListener?.('change', listener);
  }

  if (typeof mediaQuery.addListener === 'function') {
    mediaQuery.addListener(listener);
    return () => mediaQuery.removeListener?.(listener);
  }

  return () => undefined;
}
