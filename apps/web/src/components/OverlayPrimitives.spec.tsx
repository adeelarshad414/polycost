import React, { act, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { createRoot, Root } from 'react-dom/client';
import { Banner, ConfirmDialog, Dialog, ToastStack } from './OverlayPrimitives';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('Overlay primitives', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
    document.body.innerHTML = '';
  });

  it('moves focus into dialogs, traps tab, closes with escape, and returns focus', () => {
    function Harness() {
      const [open, setOpen] = useState(false);
      const closeRef = useRef<HTMLButtonElement>(null);
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>
            Open dialog
          </button>
          <Dialog
            open={open}
            title="Export report?"
            description="Choose whether to continue exporting the comparison."
            initialFocusRef={closeRef}
            onOpenChange={setOpen}
            footer={
              <>
                <button ref={closeRef} type="button" onClick={() => setOpen(false)}>
                  Cancel
                </button>
                <button type="button">Export</button>
              </>
            }
          >
            <p>Report export keeps your current comparison intact.</p>
          </Dialog>
        </>
      );
    }

    const { container, unmount } = render(<Harness />);
    const trigger = buttonByText(container, 'Open dialog');

    act(() => {
      trigger.focus();
      trigger.click();
    });

    act(() => {
      jest.runOnlyPendingTimers();
    });

    expect(document.body.querySelector('[role="dialog"]')).toBeInstanceOf(HTMLElement);
    expect(container.getAttribute('aria-hidden')).toBe('true');
    expect(container.hasAttribute('inert')).toBe(true);
    expect(document.activeElement).toBe(buttonByText(document.body, 'Cancel'));

    act(() => {
      buttonByText(document.body, 'Export').focus();
      dispatchKeyboard('Tab');
    });
    expect(document.activeElement).toBe(buttonByLabel(document.body, 'Close dialog'));

    act(() => {
      dispatchKeyboard('Tab', true);
    });
    expect(document.activeElement).toBe(buttonByText(document.body, 'Export'));

    act(() => {
      dispatchKeyboard('Escape');
    });

    expect(document.body.querySelector('[role="dialog"]')).toBeNull();
    expect(container.hasAttribute('aria-hidden')).toBe(false);
    expect(document.activeElement).toBe(trigger);

    unmount();
  });

  it('keeps destructive confirmation focus on cancel and requires typed confirmation', () => {
    const onConfirm = jest.fn();
    const onCancel = jest.fn();
    const { container, rerender, unmount } = render(
      <ConfirmDialog
        open
        destructive
        title="Delete workspace?"
        description="This permanently deletes saved comparison history."
        confirmationText="DELETE"
        confirmationValue=""
        confirmLabel="Delete workspace"
        onConfirmationValueChange={jest.fn()}
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    );

    act(() => {
      jest.runOnlyPendingTimers();
    });

    expect(document.activeElement).toBe(buttonByText(document.body, 'Cancel'));
    expect(buttonByText(document.body, 'Delete workspace').disabled).toBe(true);

    rerender(
      <ConfirmDialog
        open
        destructive
        title="Delete workspace?"
        description="This permanently deletes saved comparison history."
        confirmationText="DELETE"
        confirmationValue="DELETE"
        confirmLabel="Delete workspace"
        onConfirmationValueChange={jest.fn()}
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    );

    expect(buttonByText(document.body, 'Delete workspace').disabled).toBe(false);

    act(() => {
      buttonByText(document.body, 'Delete workspace').click();
    });

    expect(onConfirm).toHaveBeenCalledTimes(1);

    unmount();
    expect(container.isConnected).toBe(false);
  });

  it('limits toast stack to two notifications and uses alert role for critical toasts', () => {
    const onDismiss = jest.fn();
    const { unmount } = render(
      <ToastStack
        onDismiss={onDismiss}
        items={[
          { id: 'first', title: 'Saved', tone: 'success' },
          { id: 'second', title: 'Refresh failed', tone: 'critical', message: 'Retry later.' },
          { id: 'third', title: 'Queued', tone: 'info' },
        ]}
      />,
    );

    expect(document.body.querySelectorAll('.pc-toast')).toHaveLength(2);
    expect(document.body.querySelector('[role="alert"]')?.textContent).toContain('Refresh failed');

    act(() => {
      buttonByLabel(document.body, 'Dismiss Saved').click();
    });
    expect(onDismiss).toHaveBeenCalledWith('first');

    unmount();
  });

  it('renders dismissible banners without creating a modal interruption', () => {
    const onDismiss = jest.fn();
    const { unmount } = render(
      <Banner title="Pricing data degraded" tone="warning" onDismiss={onDismiss}>
        Live refresh is using cached regional fallback data.
      </Banner>,
    );

    expect(document.body.querySelector('[role="status"]')).toBeInstanceOf(HTMLElement);
    expect(document.body.querySelector('[role="dialog"]')).toBeNull();

    act(() => {
      buttonByLabel(document.body, 'Dismiss banner').click();
    });
    expect(onDismiss).toHaveBeenCalledTimes(1);

    unmount();
  });
});

function render(element: React.ReactElement): {
  container: HTMLDivElement;
  rerender: (nextElement: React.ReactElement) => void;
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
    rerender: (nextElement) => {
      act(() => {
        flushSync(() => root.render(nextElement));
      });
    },
    unmount: () => {
      act(() => {
        flushSync(() => root.unmount());
      });
      container.remove();
    },
  };
}

function dispatchKeyboard(key: string, shiftKey = false) {
  document.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key, shiftKey }));
}

function buttonByText(root: ParentNode, label: string): HTMLButtonElement {
  const button = Array.from(root.querySelectorAll('button')).find(
    (candidate): candidate is HTMLButtonElement =>
      candidate instanceof HTMLButtonElement && candidate.textContent?.trim() === label,
  );

  if (!button) {
    throw new Error(`Button not found: ${label}`);
  }

  return button;
}

function buttonByLabel(root: ParentNode, label: string): HTMLButtonElement {
  const button = Array.from(root.querySelectorAll('button')).find(
    (candidate): candidate is HTMLButtonElement =>
      candidate instanceof HTMLButtonElement && candidate.getAttribute('aria-label') === label,
  );

  if (!button) {
    throw new Error(`Button not found: ${label}`);
  }

  return button;
}
