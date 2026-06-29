import { ThemeChoice } from '../theme';

interface ThemeSwitcherProps {
  themeChoice: ThemeChoice;
  onThemeChange: (choice: ThemeChoice) => void;
  className?: string;
}

export function ThemeSwitcher({ themeChoice, onThemeChange, className }: ThemeSwitcherProps) {
  const nextTheme = themeChoice === 'dark' ? 'light' : 'dark';

  return (
    <div
      className={['theme-toggle', className].filter(Boolean).join(' ')}
      role="group"
      aria-label="Theme"
    >
      <button
        type="button"
        className={`theme-switch-button theme-switch-${themeChoice}`}
        aria-label={`Switch to ${nextTheme} mode`}
        aria-pressed={themeChoice === 'dark'}
        title={`Switch to ${nextTheme} mode`}
        onClick={() => onThemeChange(nextTheme)}
      >
        <span className="theme-switch-track" aria-hidden="true">
          <span className="theme-switch-option theme-switch-option-light">
            <ThemeIcon choice="light" />
          </span>
          <span className="theme-switch-option theme-switch-option-dark">
            <ThemeIcon choice="dark" />
          </span>
          <span className="theme-switch-thumb">
            <img src="/brand/polycost-logomark.svg" alt="" />
          </span>
        </span>
        <span className="sr-only">Switch to {nextTheme} mode</span>
      </button>
    </div>
  );
}

function ThemeIcon({ choice }: { choice: ThemeChoice }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="segment-icon">
      {choice === 'light' ? (
        <path d="M12 4v2M12 18v2M4 12h2M18 12h2M6.3 6.3l1.4 1.4M16.3 16.3l1.4 1.4M17.7 6.3l-1.4 1.4M7.7 16.3l-1.4 1.4M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z" />
      ) : (
        <path d="M19 14.4A7 7 0 0 1 9.6 5a7.5 7.5 0 1 0 9.4 9.4z" />
      )}
    </svg>
  );
}
