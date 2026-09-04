import React, { act } from 'react';
import { flushSync } from 'react-dom';
import { createRoot, type Root } from 'react-dom/client';
import {
  WorkloadControlBar,
  capacityUnit,
  formatCapacity,
  type ControlDimension,
} from './WorkloadControlBar';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// Matches the render helper the other component specs use; this workspace has
// no @testing-library/react.
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

function textNode(container: HTMLElement, label: string): HTMLElement {
  const match = Array.from(container.querySelectorAll<HTMLElement>('*')).find(
    (node) => node.children.length === 0 && node.textContent?.trim() === label,
  );

  if (!match) {
    throw new Error(`Text not found: ${label}`);
  }

  return match;
}

function changeRange(input: HTMLInputElement, value: string): void {
  act(() => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
    setter?.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

function dimension(overrides: Partial<ControlDimension> = {}): ControlDimension {
  return {
    id: 'storage',
    label: 'Storage',
    unit: 'GB',
    value: 500,
    min: 0,
    max: 4096,
    step: 64,
    onChange: jest.fn(),
    ...overrides,
  };
}

describe('WorkloadControlBar', () => {
  it('renders a slider per dimension with its value and unit', () => {
    const { container, unmount } = render(
      <WorkloadControlBar dimensions={[dimension()]} choices={[]} />,
    );

    expect(container.querySelectorAll('input[type="range"]')).toHaveLength(1);
    expect(textNode(container, 'Storage')).toBeTruthy();
    expect(textNode(container, '500')).toBeTruthy();

    unmount();
  });

  it('never marks a slider invalid for a value the detailed form produced', () => {
    // The regression that made this a bug rather than a nicety: these sliders
    // live inside the workload form and summarise fields the detailed form also
    // edits, so they see arbitrary values. A range input whose value does not
    // land on its step is invalid, and one invalid control blocks submission of
    // the whole form - "Compare costs" silently did nothing for any storage size
    // that was not a multiple of 64.
    const { container, unmount } = render(
      <WorkloadControlBar dimensions={[dimension({ value: 777 })]} choices={[]} />,
    );

    const slider = container.querySelector<HTMLInputElement>('input[type="range"]');

    // Asserted on the attribute, not checkValidity(): jsdom does not implement
    // stepMismatch for range inputs, so a validity assertion here passes even
    // with the bug present - it looks like a guard and is not one. The real
    // browser behaviour is covered by the App tests, which could not submit the
    // form at all while a step was set.
    expect(slider?.getAttribute('step')).toBe('any');

    unmount();
  });

  it('snaps a dragged value to the dimension granularity', () => {
    const onChange = jest.fn();
    const { container, unmount } = render(
      <WorkloadControlBar dimensions={[dimension({ onChange })]} choices={[]} />,
    );
    const slider = container.querySelector<HTMLInputElement>('input[type="range"]');

    changeRange(slider as HTMLInputElement, '700');

    // Dragging still moves in sensible increments even though the input itself
    // accepts any value.
    expect(onChange).toHaveBeenCalledWith(704);

    unmount();
  });

  it('reports each segment’s own pressed state', () => {
    const onChange = jest.fn();
    const { container, unmount } = render(
      <WorkloadControlBar
        dimensions={[]}
        choices={[
          {
            id: 'commitment',
            label: 'Commitment',
            value: '0',
            options: [
              { value: '0', label: 'On-demand' },
              { value: '100', label: 'Full' },
            ],
            onChange,
          },
        ]}
      />,
    );

    expect(textNode(container, 'On-demand').getAttribute('aria-pressed')).toBe('true');
    expect(textNode(container, 'Full').getAttribute('aria-pressed')).toBe('false');

    act(() => {
      textNode(container, 'Full').click();
    });
    expect(onChange).toHaveBeenCalledWith('100');

    unmount();
  });

  it('keeps segment buttons out of form submission', () => {
    const { container, unmount } = render(
      <WorkloadControlBar
        dimensions={[]}
        choices={[
          {
            id: 'region',
            label: 'Region',
            value: 'us-east',
            options: [{ value: 'us-east', label: 'US East' }],
            onChange: jest.fn(),
          },
        ]}
      />,
    );

    // Without type="button" these would submit the surrounding workload form.
    expect(textNode(container, 'US East').getAttribute('type')).toBe('button');

    unmount();
  });
});

describe('capacity formatting', () => {
  it('reads in GB below a terabyte', () => {
    expect(formatCapacity(512)).toBe('512');
    expect(capacityUnit(512)).toBe('GB');
  });

  it('switches to TB at and above a terabyte', () => {
    expect(capacityUnit(1024)).toBe('TB');
    expect(formatCapacity(2048)).toBe('2');
  });

  it('keeps one decimal so a part-terabyte does not read as a round number', () => {
    expect(formatCapacity(1536)).toBe('1.5');
  });
});
