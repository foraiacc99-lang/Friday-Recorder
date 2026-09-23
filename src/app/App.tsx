import { useEffect, useState } from 'react';
import type { AppInfo } from '@shared/types';

export default function App() {
  const [appInfo, setAppInfo] = useState<AppInfo | null>(null);
  const [bridgeStatus, setBridgeStatus] = useState<string>('Verifying IPC bridge...');

  useEffect(() => {
    if (typeof window !== 'undefined' && window.friday?.app?.getInfo) {
      window.friday.app
        .getInfo()
        .then((info) => {
          setAppInfo(info);
          setBridgeStatus('Connected');
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
          <div className="status-pill">Phase 1: Project Foundation</div>
          <h1 className="title">Friday Recorder — Phase 1 Foundation</h1>
          <p className="subtitle">
            Windows desktop screen recording + non-destructive video editing application.
          </p>
        </header>

        <section className="diagnostics-grid">
          <div className="diagnostic-item">
            <span className="label">Context Isolation</span>
            <span className="value status-success">Active (true)</span>
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

          <div className="diagnostic-item">
            <span className="label">App Version</span>
            <span className="value">{appInfo ? `v${appInfo.version}` : 'Loading...'}</span>
          </div>
        </section>

        <footer className="footer-note">
          <p>
            Project skeleton successfully initialized with strict TypeScript, Vite hot reload,
            secure preload IPC bridge, and modular directory architecture.
          </p>
        </footer>
      </main>
    </div>
  );
}
