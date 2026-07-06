import React, { act } from 'react';
import { flushSync } from 'react-dom';
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

  it('wraps theme choices across arrow keys and edge positions', () => {
    const onThemeChange = jest.fn();
    const { container, unmount } = render(
      <ThemeSwitcher themeChoice="system" onThemeChange={onThemeChange} />,
    );

    act(() => {
      themeButton(container, 'Use system theme').dispatchEvent(
        new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }),
      );
    });

    act(() => {
      themeButton(container, 'Use dark theme').dispatchEvent(
        new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }),
      );
    });

    expect(onThemeChange).toHaveBeenNthCalledWith(1, 'dark');
    expect(onThemeChange).toHaveBeenNthCalledWith(2, 'system');
    unmount();
  });

  it('handles home, end, and ignored keyboard input without changing invalidly', () => {
    const onThemeChange = jest.fn();
    const { container, unmount } = render(
      <ThemeSwitcher themeChoice="dark" onThemeChange={onThemeChange} />,
    );

    act(() => {
      themeButton(container, 'Use dark theme').dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Home', bubbles: true }),
      );
    });

    act(() => {
      themeButton(container, 'Use system theme').dispatchEvent(
        new KeyboardEvent('keydown', { key: 'End', bubbles: true }),
      );
    });

    act(() => {
      themeButton(container, 'Use dark theme').dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
      );
    });

    expect(onThemeChange).toHaveBeenCalledTimes(2);
    expect(onThemeChange).toHaveBeenNthCalledWith(1, 'system');
    expect(onThemeChange).toHaveBeenNthCalledWith(2, 'dark');
    unmount();
  });

  it('falls back to immediate focus when requestAnimationFrame is unavailable', () => {
    const onThemeChange = jest.fn();
    const originalRequestAnimationFrame = window.requestAnimationFrame;
    Object.defineProperty(window, 'requestAnimationFrame', {
      configurable: true,
      value: undefined,
    });
    const { container, unmount } = render(
      <ThemeSwitcher themeChoice="light" onThemeChange={onThemeChange} />,
    );

    act(() => {
      themeButton(container, 'Use light theme').dispatchEvent(
        new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }),
      );
    });

    expect(onThemeChange).toHaveBeenCalledWith('system');
    expect(document.activeElement).toBe(themeButton(container, 'Use system theme'));

    unmount();
    Object.defineProperty(window, 'requestAnimationFrame', {
      configurable: true,
      value: originalRequestAnimationFrame,
    });
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
    flushSync(() => root.render(element));
  });

  return {
    container,
    unmount: () => {
      act(() => {
        flushSync(() => root.unmount());
      });
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
