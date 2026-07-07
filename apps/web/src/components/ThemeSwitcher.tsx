import { KeyboardEvent } from 'react';
import { AccentChoice, ThemeChoice } from '../theme';

interface ThemeSwitcherProps {
  themeChoice: ThemeChoice;
  accentChoice: AccentChoice;
  onThemeChange: (choice: ThemeChoice) => void;
  onAccentChange: (choice: AccentChoice) => void;
  className?: string;
}

export function ThemeSwitcher({
  themeChoice,
  accentChoice,
  onThemeChange,
  onAccentChange,
  className,
}: ThemeSwitcherProps) {
  return (
    <div
      className={['theme-toggle', className].filter(Boolean).join(' ')}
      role="group"
      aria-label="Appearance"
    >
      <div className="theme-toggle-section" aria-label="Mode">
        <span className="theme-toggle-label">Mode</span>
        <div className="theme-mode-control" role="radiogroup" aria-label="Mode">
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
              onKeyDown={(event) =>
                handleChoiceKeyDown(event, option.choice, THEME_CHOICES, 'theme', onThemeChange)
              }
            >
              <ThemeIcon choice={option.choice} />
            </button>
          ))}
        </div>
      </div>

      <div className="theme-toggle-section" aria-label="Accent">
        <span className="theme-toggle-label">Accent</span>
        <div className="theme-accent-control" role="radiogroup" aria-label="Accent">
          {ACCENT_OPTIONS.map((option) => (
            <button
              type="button"
              key={option.choice}
              className="theme-accent-button"
              role="radio"
              aria-label={option.ariaLabel}
              aria-checked={accentChoice === option.choice}
              data-accent-choice={option.choice}
              tabIndex={accentChoice === option.choice ? 0 : -1}
              title={option.title}
              onClick={() => onAccentChange(option.choice)}
              onKeyDown={(event) =>
                handleChoiceKeyDown(event, option.choice, ACCENT_CHOICES, 'accent', onAccentChange)
              }
            >
              <span className={`accent-swatch accent-swatch-${option.choice}`} aria-hidden="true" />
              <span>{option.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

const THEME_CHOICES: ThemeChoice[] = ['system', 'light', 'dark'];
const ACCENT_CHOICES: AccentChoice[] = ['default', 'terracotta'];

const THEME_OPTIONS: Array<{
  choice: ThemeChoice;
  ariaLabel: string;
  title: string;
}> = [
  { choice: 'system', ariaLabel: 'Use system theme', title: 'Use system theme' },
  { choice: 'light', ariaLabel: 'Use light theme', title: 'Use light theme' },
  { choice: 'dark', ariaLabel: 'Use dark theme', title: 'Use dark theme' },
];

const ACCENT_OPTIONS: Array<{
  choice: AccentChoice;
  label: string;
  ariaLabel: string;
  title: string;
}> = [
  {
    choice: 'default',
    label: 'Default',
    ariaLabel: 'Use PolyCost violet accent',
    title: 'Use PolyCost violet accent',
  },
  {
    choice: 'terracotta',
    label: 'Terracotta',
    ariaLabel: 'Use terracotta accent',
    title: 'Use terracotta accent',
  },
];

function handleChoiceKeyDown<TChoice extends string>(
  event: KeyboardEvent<HTMLButtonElement>,
  choice: TChoice,
  choices: TChoice[],
  dataName: string,
  onChange: (choice: TChoice) => void,
) {
  const group = event.currentTarget.parentElement;
  const currentIndex = choices.indexOf(choice);
  let nextIndex: number | null = null;

  switch (event.key) {
    case 'ArrowRight':
    case 'ArrowDown':
      nextIndex = (currentIndex + 1) % choices.length;
      break;
    case 'ArrowLeft':
    case 'ArrowUp':
      nextIndex = (currentIndex - 1 + choices.length) % choices.length;
      break;
    case 'Home':
      nextIndex = 0;
      break;
    case 'End':
      nextIndex = choices.length - 1;
      break;
    default:
      return;
  }

  event.preventDefault();
  const nextChoice = choices.find((_candidate, index) => index === nextIndex);
  if (!nextChoice) {
    return;
  }

  onChange(nextChoice);

  const focusNextButton = () => {
    group?.querySelector<HTMLButtonElement>(`[data-${dataName}-choice="${nextChoice}"]`)?.focus();
  };

  if (typeof window.requestAnimationFrame === 'function') {
    window.requestAnimationFrame(focusNextButton);
    return;
  }

  focusNextButton();
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
