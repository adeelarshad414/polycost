export type ThemeChoice = 'light' | 'dark';
export type ResolvedTheme = 'light' | 'dark';
type ThemeMediaQueryList = Pick<MediaQueryList, 'matches'> &
  Partial<Pick<MediaQueryList, 'addEventListener' | 'removeEventListener'>> & {
    addListener?: (listener: () => void) => void;
    removeListener?: (listener: () => void) => void;
  };

export const THEME_STORAGE_KEY = 'polycost-theme';

export function isThemeChoice(value: string | null): value is ThemeChoice {
  return value === 'light' || value === 'dark';
}

export function storedTheme(
  storage: Pick<Storage, 'getItem'> = localStorage,
  matchMedia: (query: string) => Pick<MediaQueryList, 'matches'> = defaultMatchMedia,
): ThemeChoice {
  const value = storage.getItem(THEME_STORAGE_KEY);

  if (isThemeChoice(value)) {
    return value;
  }

  return systemTheme(matchMedia);
}

export function resolveTheme(choice: ThemeChoice): ResolvedTheme {
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
): ResolvedTheme {
  const resolved = resolveTheme(choice);
  root.dataset.theme = resolved;
  root.dataset.themeChoice = choice;
  root.style.colorScheme = resolved;
  storage.setItem(THEME_STORAGE_KEY, choice);
  return resolved;
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
