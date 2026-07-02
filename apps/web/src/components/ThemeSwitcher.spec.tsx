import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { ThemeSwitcher } from './ThemeSwitcher';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('ThemeSwitcher', () => {
  it('renders system, light, and dark theme choices', () => {
    const onThemeChange = jest.fn();
    const { container, unmount } = render(
      <ThemeSwitcher themeChoice="system" onThemeChange={onThemeChange} />,
    );

    expect(themeButton(container, 'Use system theme').getAttribute('aria-checked')).toBe('true');
    expect(themeButton(container, 'Use light theme').getAttribute('aria-checked')).toBe('false');
    expect(themeButton(container, 'Use dark theme').getAttribute('aria-checked')).toBe('false');

    act(() => {
      themeButton(container, 'Use dark theme').click();
    });

    expect(onThemeChange).toHaveBeenCalledWith('dark');
    unmount();
  });

  it('moves theme choices with radio-group keyboard controls', () => {
    const onThemeChange = jest.fn();
    const { container, unmount } = render(
      <ThemeSwitcher themeChoice="light" onThemeChange={onThemeChange} />,
    );

    act(() => {
      themeButton(container, 'Use light theme').dispatchEvent(
        new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }),
      );
    });

    expect(onThemeChange).toHaveBeenCalledWith('dark');
    unmount();
  });
});

function render(element: React.ReactElement): {
  container: HTMLDivElement;
  unmount: () => void;
} {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root: Root = createRoot(container);

  act(() => {
    root.render(element);
  });

  return {
    container,
    unmount: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
}

function themeButton(container: HTMLElement, label: string): HTMLButtonElement {
  const button = Array.from(container.querySelectorAll('button')).find(
    (candidate) => candidate.getAttribute('aria-label') === label,
  );

  if (!(button instanceof HTMLButtonElement)) {
    throw new Error(`Theme button not found: ${label}`);
  }

  return button;
}
