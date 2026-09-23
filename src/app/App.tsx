import { useEffect, useState } from 'react';

export default function App() {
  const [version, setVersion] = useState<string>('Loading...');
  const [bridgeStatus, setBridgeStatus] = useState<string>('Connecting...');

  useEffect(() => {
    if (typeof window !== 'undefined' && window.friday?.app?.getVersion) {
      window.friday.app
        .getVersion()
        .then((ver) => {
          setVersion(ver);
          setBridgeStatus('Connected (IPC Verified)');
        })
        .catch(() => {
          setBridgeStatus('IPC Error');
        });
    } else {
      setBridgeStatus('Bridge unavailable (Web preview mode)');
    }
  }, []);

  const isNodeIntegrationDisabled =
    typeof (window as unknown as { require?: unknown }).require === 'undefined' &&
    typeof (window as unknown as { process?: unknown }).process === 'undefined';

  return (
    <div className="app-container">
      <main className="foundation-card">
        <header className="header">
          <div className="status-pill">Phase 2: Electron Desktop Shell</div>
          <h1 className="title">
            Friday Recorder — Phase 2 — v{version}
          </h1>
          <p className="subtitle">
            Windows desktop screen recording + non-destructive video editing application.
          </p>
        </header>

        <section className="diagnostics-grid">
          <div className="diagnostic-item">
            <span className="label">Window State</span>
            <span className="value status-success">Persisted (JSON)</span>
          </div>

          <div className="diagnostic-item">
            <span className="label">Single Instance</span>
            <span className="value status-success">Enforced</span>
          </div>

          <div className="diagnostic-item">
            <span className="label">Node Integration</span>
            <span className="value status-success">
              {isNodeIntegrationDisabled ? 'Disabled (false)' : 'Warning: Detected'}
            </span>
          </div>

          <div className="diagnostic-item">
            <span className="label">IPC Bridge</span>
            <span className="value status-info">{bridgeStatus}</span>
          </div>
        </section>

        <footer className="footer-note">
          <p>
            Desktop shell active with native application menu, custom window persistence,
            crash logging, and typed IPC architecture.
          </p>
        </footer>
      </main>
    </div>
  );
}
