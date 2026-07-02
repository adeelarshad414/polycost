import { KeyboardEvent } from 'react';
import { ThemeChoice } from '../theme';

interface ThemeSwitcherProps {
  themeChoice: ThemeChoice;
  onThemeChange: (choice: ThemeChoice) => void;
  className?: string;
}

export function ThemeSwitcher({ themeChoice, onThemeChange, className }: ThemeSwitcherProps) {
  return (
    <div
      className={['theme-toggle', className].filter(Boolean).join(' ')}
      role="group"
      aria-label="Theme preference"
    >
      <div className="theme-mode-control" role="radiogroup" aria-label="Theme">
        {THEME_OPTIONS.map((option) => (
          <button
            type="button"
            key={option.choice}
            className="theme-mode-button"
            role="radio"
            aria-label={option.ariaLabel}
            aria-checked={themeChoice === option.choice}
            data-theme-choice={option.choice}
            tabIndex={themeChoice === option.choice ? 0 : -1}
            title={option.title}
            onClick={() => onThemeChange(option.choice)}
            onKeyDown={(event) => handleThemeKeyDown(event, option.choice, onThemeChange)}
          >
            <ThemeIcon choice={option.choice} />
          </button>
        ))}
      </div>
    </div>
  );
}

const THEME_OPTIONS: Array<{
  choice: ThemeChoice;
  ariaLabel: string;
  title: string;
}> = [
  { choice: 'system', ariaLabel: 'Use system theme', title: 'Use system theme' },
  { choice: 'light', ariaLabel: 'Use light theme', title: 'Use light theme' },
  { choice: 'dark', ariaLabel: 'Use dark theme', title: 'Use dark theme' },
];

function handleThemeKeyDown(
  event: KeyboardEvent<HTMLButtonElement>,
  choice: ThemeChoice,
  onThemeChange: (choice: ThemeChoice) => void,
) {
  const group = event.currentTarget.parentElement;
  let nextChoice: ThemeChoice | null = null;

  switch (event.key) {
    case 'ArrowRight':
    case 'ArrowDown':
      nextChoice = nextThemeChoice(choice);
      break;
    case 'ArrowLeft':
    case 'ArrowUp':
      nextChoice = previousThemeChoice(choice);
      break;
    case 'Home':
      nextChoice = 'system';
      break;
    case 'End':
      nextChoice = 'dark';
      break;
    default:
      return;
  }

  event.preventDefault();
  onThemeChange(nextChoice);

  const focusNextButton = () => {
    group?.querySelector<HTMLButtonElement>(`[data-theme-choice="${nextChoice}"]`)?.focus();
  };

  if (typeof window.requestAnimationFrame === 'function') {
    window.requestAnimationFrame(focusNextButton);
    return;
  }

  focusNextButton();
}

function nextThemeChoice(choice: ThemeChoice): ThemeChoice {
  switch (choice) {
    case 'system':
      return 'light';
    case 'light':
      return 'dark';
    case 'dark':
      return 'system';
  }
}

function previousThemeChoice(choice: ThemeChoice): ThemeChoice {
  switch (choice) {
    case 'system':
      return 'dark';
    case 'light':
      return 'system';
    case 'dark':
      return 'light';
  }
}

function ThemeIcon({ choice }: { choice: ThemeChoice }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="segment-icon">
      {choice === 'system' ? (
        <path d="M4 5h16v10H4zM9 19h6M12 15v4M8 8h3M13 8h3M8 11h8" />
      ) : choice === 'light' ? (
        <path d="M12 4v2M12 18v2M4 12h2M18 12h2M6.3 6.3l1.4 1.4M16.3 16.3l1.4 1.4M17.7 6.3l-1.4 1.4M7.7 16.3l-1.4 1.4M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z" />
      ) : (
        <path d="M19 14.4A7 7 0 0 1 9.6 5a7.5 7.5 0 1 0 9.4 9.4z" />
      )}
    </svg>
  );
}
