import { useEffect, useState } from 'react';
import { useCapturePreview } from '../preview/useCapturePreview';
import './App.css';

export default function App() {
  const [version, setVersion] = useState<string>('Loading...');
  const [bridgeStatus, setBridgeStatus] = useState<string>('Connecting...');

  const {
    sources,
    selectedSourceId,
    setSelectedSourceId,
    isLoadingSources,
    isCapturing,
    error,
    metrics,
    videoRef,
    refreshSources,
    startCapture,
    stopCapture,
  } = useCapturePreview();

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

  const screenSources = sources.filter((s) => s.type === 'screen');
  const windowSources = sources.filter((s) => s.type === 'window');

  const selectedSource = sources.find((s) => s.id === selectedSourceId);

  return (
    <div className="app-container">
      <main className="foundation-card">
        <header className="header">
          <div className="status-pill">Phase 3: Windows Screen Capture</div>
          <h1 className="title">Friday Recorder — v{version}</h1>
          <p className="subtitle">
            Screen & Window Capture Verification Preview (Electron desktopCapturer + WebRTC engine)
          </p>
        </header>

        {/* Error notification banner */}
        {error && (
          <div className="error-banner" role="alert">
            <span className="error-icon">⚠️</span>
            <div className="error-content">
              <strong>Capture Alert:</strong> {error}
            </div>
          </div>
        )}

        {/* Source Controls */}
        <section className="capture-controls">
          <div className="control-group">
            <label htmlFor="source-select" className="control-label">
              Capture Source:
            </label>
            <div className="select-row">
              <select
                id="source-select"
                className="source-dropdown"
                value={selectedSourceId}
                disabled={isCapturing || isLoadingSources}
                onChange={(e) => setSelectedSourceId(e.target.value)}
              >
                {sources.length === 0 ? (
                  <option value="">No sources found</option>
                ) : (
                  <>
                    {screenSources.length > 0 && (
                      <optgroup label="Screens / Displays">
                        {screenSources.map((s) => (
                          <option key={s.id} value={s.id}>
                            🖥️ {s.name}
                          </option>
                        ))}
                      </optgroup>
                    )}
                    {windowSources.length > 0 && (
                      <optgroup label="Application Windows">
                        {windowSources.map((w) => (
                          <option key={w.id} value={w.id}>
                            🪟 {w.name}
                          </option>
                        ))}
                      </optgroup>
                    )}
                  </>
                )}
              </select>

              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => void refreshSources()}
                disabled={isCapturing || isLoadingSources}
                title="Refresh sources"
              >
                {isLoadingSources ? 'Refreshing...' : '🔄 Refresh'}
              </button>
            </div>
          </div>

          <div className="button-group">
            <button
              type="button"
              id="btn-start-preview"
              className="btn btn-primary"
              disabled={isCapturing || !selectedSourceId || isLoadingSources}
              onClick={() => void startCapture()}
            >
              ▶ Start Preview
            </button>

            <button
              type="button"
              id="btn-stop-preview"
              className="btn btn-danger"
              disabled={!isCapturing}
              onClick={() => void stopCapture()}
            >
              ⏹ Stop Preview
            </button>
          </div>
        </section>

        {/* Live Video Preview Box */}
        <section className="preview-viewport">
          <video
            ref={videoRef}
            id="capture-preview-video"
            className={`preview-video ${isCapturing ? 'active' : 'hidden'}`}
            autoPlay
            playsInline
            muted
          />

          {!isCapturing && (
            <div className="preview-placeholder">
              <div className="placeholder-icon">📺</div>
              <p className="placeholder-text">Live preview inactive</p>
              <span className="placeholder-subtext">
                Select a display or window source and click &quot;Start Preview&quot;
              </span>
            </div>
          )}

          {isCapturing && (
            <div className="preview-overlay-badge">
              <span className="badge-pulse" />
              LIVE PREVIEW ACTIVE
            </div>
          )}
        </section>

        {/* Diagnostics & Stream Telemetry */}
        <section className="diagnostics-grid">
          <div className="diagnostic-item">
            <span className="label">Capture State</span>
            <span className={`value ${isCapturing ? 'status-success' : 'status-muted'}`}>
              {isCapturing ? 'Active (Live)' : 'Idle (Stopped)'}
            </span>
          </div>

          <div className="diagnostic-item">
            <span className="label">Stream Resolution</span>
            <span className="value">
              {metrics ? `${metrics.width} × ${metrics.height} px` : '—'}
            </span>
          </div>

          <div className="diagnostic-item">
            <span className="label">Frame Rate</span>
            <span className="value">{metrics ? `${metrics.frameRate} FPS` : '—'}</span>
          </div>

          <div className="diagnostic-item">
            <span className="label">Target Source</span>
            <span className="value source-truncate" title={selectedSource?.name || 'None'}>
              {selectedSource ? selectedSource.name : 'None selected'}
            </span>
          </div>

          <div className="diagnostic-item">
            <span className="label">Track State</span>
            <span className="value">{metrics ? metrics.trackReadyState : 'inactive'}</span>
          </div>

          <div className="diagnostic-item">
            <span className="label">IPC Bridge</span>
            <span className="value status-info">{bridgeStatus}</span>
          </div>
        </section>

        <footer className="footer-note">
          <p>
            Friday Recorder Phase 3 — Abstracted capture provider with Windows desktopCapturer
            pipeline, automated lifecycle cleanup, and multi-monitor DPI awareness.
          </p>
        </footer>
      </main>
    </div>
  );
}
