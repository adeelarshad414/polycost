import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { ButtonSystemPreview } from './Button';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('Button system', () => {
  it('renders all action variants and provider badges', () => {
    const { container, unmount } = render(<ButtonSystemPreview />);

    expect(buttonByText(container, 'Primary').className).toContain('pc-button-primary');
    expect(buttonByText(container, 'Secondary').className).toContain('pc-button-secondary');
    expect(buttonByText(container, 'Ghost').className).toContain('pc-button-ghost');
    expect(buttonByText(container, 'Destructive').className).toContain('pc-button-destructive');
    expect(buttonByText(container, 'Loading').getAttribute('aria-busy')).toBe('true');
    expect(buttonByText(container, 'Loading').disabled).toBe(false);
    expect(buttonByText(container, 'Loading').querySelector('.animate-spin')).toBeInstanceOf(
      SVGElement,
    );
    expect(providerBadge(container, 'AWS').className).toContain('provider-badge-aws');
    expect(providerBadge(container, 'Azure').className).toContain('provider-badge-azure');
    expect(providerBadge(container, 'GCP').className).toContain('provider-badge-gcp');

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

function buttonByText(container: HTMLElement, label: string): HTMLButtonElement {
  const button = Array.from(container.querySelectorAll('button')).find(
    (candidate) => candidate.textContent === label,
  );

  if (!(button instanceof HTMLButtonElement)) {
    throw new Error(`Button not found: ${label}`);
  }

  return button;
}

function providerBadge(container: HTMLElement, label: string): HTMLSpanElement {
  const badge = Array.from(container.querySelectorAll('.provider-badge')).find(
    (candidate) => candidate.textContent === label,
  );

  if (!(badge instanceof HTMLSpanElement)) {
    throw new Error(`Provider badge not found: ${label}`);
  }

  return badge;
}
