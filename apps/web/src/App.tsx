export function App() {
  return (
    <main className="app-shell" aria-labelledby="page-title">
      <header className="app-header">
        <Logo />
        <h1 id="page-title">PolyCost</h1>
      </header>
      <section className="scaffold-panel" aria-label="Application status">
        <p>Application shell is ready.</p>
      </section>
    </main>
  );
}

function Logo() {
  return (
    <svg className="logo" viewBox="0 0 32 32" role="img" aria-label="PolyCost">
      <rect x="3" y="6" width="6" height="20" rx="1.5" fill="var(--pc-provider-aws)" />
      <rect x="13" y="6" width="6" height="20" rx="1.5" fill="var(--pc-provider-azure)" />
      <rect x="23" y="6" width="6" height="20" rx="1.5" fill="var(--pc-provider-gcp)" />
      <rect x="2" y="26" width="28" height="2.5" rx="1.25" fill="var(--pc-text-primary)" />
    </svg>
  );
}
