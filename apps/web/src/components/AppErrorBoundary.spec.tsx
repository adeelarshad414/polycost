import React, { act } from 'react';
import { flushSync } from 'react-dom';
import { createRoot, Root } from 'react-dom/client';
import { AppErrorBoundary } from './AppErrorBoundary';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function CrashingWorkspace(): React.ReactElement {
  throw new Error('[object Object]\n    at renderWorkspace (/tmp/polycost.js:1:2)');
}

describe('AppErrorBoundary', () => {
  let host: HTMLDivElement;
  let root: Root;
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    act(() => {
      flushSync(() => root.unmount());
    });
    host.remove();
    consoleErrorSpy.mockRestore();
  });

  it('renders a recovery state without raw exception text or stack traces', () => {
    act(() => {
      flushSync(() =>
        root.render(
          <AppErrorBoundary>
            <CrashingWorkspace />
          </AppErrorBoundary>,
        ),
      );
    });

    expect(host.textContent).toContain('PolyCost could not render this workspace.');
    expect(host.textContent).toContain('Reload workspace');
    expect(host.textContent).not.toContain('[object Object]');
    expect(host.textContent).not.toContain('renderWorkspace');
    expect(host.querySelector('[role="alert"]')).toBeInstanceOf(HTMLElement);
  });
});
