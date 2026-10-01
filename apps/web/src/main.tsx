import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import { AppErrorBoundary } from './components/AppErrorBoundary';
// Self-hosted brand fonts (UI-1). The tokens named these families but nothing
// loaded them, so most visitors saw system fallbacks. Each package declares
// font-display: swap and unicode-range subsets, so only the glyphs used download.
import '@fontsource-variable/inter';
import '@fontsource-variable/sora';
import '@fontsource/jetbrains-mono/500.css';
import './styles/tokens.css';
import './styles.css';

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>
  </React.StrictMode>,
);
