import { Component, ReactNode } from 'react';

interface AppErrorBoundaryProps {
  children: ReactNode;
}

interface AppErrorBoundaryState {
  hasError: boolean;
}

export class AppErrorBoundary extends Component<
  AppErrorBoundaryProps,
  AppErrorBoundaryState
> {
  state: AppErrorBoundaryState = {
    hasError: false,
  };

  static getDerivedStateFromError(): AppErrorBoundaryState {
    return {
      hasError: true,
    };
  }

  componentDidCatch(): void {
    // The UI intentionally avoids rendering exception messages or component stacks.
  }

  render(): ReactNode {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <main className="app-shell">
        <section
          className="app-fatal-state"
          role="alert"
          aria-labelledby="app-fatal-state-title"
        >
          <span className="app-fatal-state-kicker">Workspace recovery</span>
          <h1 id="app-fatal-state-title">PolyCost could not render this workspace.</h1>
          <p>
            Refresh the page to restore the comparison workspace. If this repeats, restart the web
            app and API service before rerunning the demo.
          </p>
          <button type="button" onClick={() => window.location.reload()}>
            Reload workspace
          </button>
        </section>
      </main>
    );
  }
}
