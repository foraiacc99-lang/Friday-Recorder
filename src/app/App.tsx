import { useEffect, useState } from 'react';
import { useCapturePreview } from '../preview/useCapturePreview';
import { useAudioCapture } from '../preview/useAudioCapture';
import './App.css';

export default function App() {
  const [version, setVersion] = useState<string>('Loading...');
  const [bridgeStatus, setBridgeStatus] = useState<string>('Connecting...');

  // Phase 3 Screen Capture Hook
  const {
    sources,
    selectedSourceId,
    setSelectedSourceId,
    isLoadingSources,
    isCapturing: isScreenCapturing,
    error: screenError,
    metrics: screenMetrics,
    videoRef,
    refreshSources,
    startCapture: startScreenCapture,
    stopCapture: stopScreenCapture,
  } = useCapturePreview();

  // Phase 4 Audio Capture Hook
  const {
    microphones,
    selectedMicId,
    setSelectedMicId,
    isLoadingMicrophones,
    isMicCapturing,
    micVolume,
    micError,
    refreshMicrophones,
    startMicCapture,
    stopMicCapture,

    isSystemAudioCapturing,
    systemAudioVolume,
    systemAudioError,
    startSystemAudioCapture,
    stopSystemAudioCapture,

    stopAllAudio,
  } = useAudioCapture();

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
  const selectedMic = microphones.find((m) => m.deviceId === selectedMicId);

  // Quick combined actions
  const anyActive = isScreenCapturing || isMicCapturing || isSystemAudioCapturing;
  const allActive = isScreenCapturing && isMicCapturing && isSystemAudioCapturing;

  const handleStartAll = async () => {
    if (!isScreenCapturing && selectedSourceId) {
      void startScreenCapture();
    }
    if (!isMicCapturing) {
      void startMicCapture();
    }
    if (!isSystemAudioCapturing) {
      void startSystemAudioCapture();
    }
  };

  const handleStopAll = async () => {
    if (isScreenCapturing) {
      await stopScreenCapture();
    }
    await stopAllAudio();
  };

  return (
    <div className="app-container">
      <main className="foundation-card">
        <header className="header">
          <div className="status-pill">Phase 4: Microphone & System Audio Capture</div>
          <h1 className="title">Friday Recorder — v{version}</h1>
          <p className="subtitle">
            Audio Capture Verification: Independent & Concurrent Microphone, Desktop WASAPI Loopback, and Screen Capture
          </p>
        </header>

        {/* Error notification banners */}
        {screenError && (
          <div className="error-banner" role="alert">
            <span className="error-icon">⚠️</span>
            <div className="error-content">
              <strong>Screen Capture Alert:</strong> {screenError}
            </div>
          </div>
        )}
        {micError && (
          <div className="error-banner" role="alert">
            <span className="error-icon">⚠️</span>
            <div className="error-content">
              <strong>Microphone Alert:</strong> {micError}
            </div>
          </div>
        )}
        {systemAudioError && (
          <div className="error-banner" role="alert">
            <span className="error-icon">⚠️</span>
            <div className="error-content">
              <strong>System Audio Alert:</strong> {systemAudioError}
            </div>
          </div>
        )}

        {/* SECTION 1: SCREEN CAPTURE (Phase 3) */}
        <section className="section-card">
          <h2 className="section-title">🖥️ Screen / Window Video Preview</h2>
          <div className="control-group">
            <label htmlFor="source-select" className="control-label">
              Video Source:
            </label>
            <div className="select-row">
              <select
                id="source-select"
                className="source-dropdown"
                value={selectedSourceId}
                disabled={isScreenCapturing || isLoadingSources}
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
                disabled={isScreenCapturing || isLoadingSources}
                title="Refresh screen sources"
              >
                {isLoadingSources ? 'Refreshing...' : '🔄 Refresh'}
              </button>
            </div>
          </div>

          <div className="button-group" style={{ marginTop: '0.75rem' }}>
            <button
              type="button"
              id="btn-start-preview"
              className="btn btn-primary"
              disabled={isScreenCapturing || !selectedSourceId || isLoadingSources}
              onClick={() => void startScreenCapture()}
            >
              ▶ Start Screen Preview
            </button>

            <button
              type="button"
              id="btn-stop-preview"
              className="btn btn-danger"
              disabled={!isScreenCapturing}
              onClick={() => void stopScreenCapture()}
            >
              ⏹ Stop Screen Preview
            </button>
          </div>

          {/* Live Video Preview Box */}
          <div className="preview-viewport" style={{ marginTop: '1rem', marginBottom: '0.5rem' }}>
            <video
              ref={videoRef}
              id="capture-preview-video"
              className={`preview-video ${isScreenCapturing ? 'active' : 'hidden'}`}
              autoPlay
              playsInline
              muted
            />

            {!isScreenCapturing && (
              <div className="preview-placeholder">
                <div className="placeholder-icon">📺</div>
                <p className="placeholder-text">Screen preview inactive</p>
                <span className="placeholder-subtext">
                  Select a display or window and click &quot;Start Screen Preview&quot;
                </span>
              </div>
            )}

            {isScreenCapturing && (
              <div className="preview-overlay-badge">
                <span className="badge-pulse" />
                SCREEN LIVE ({screenMetrics ? `${screenMetrics.width}x${screenMetrics.height} @ ${screenMetrics.frameRate} FPS` : 'Active'})
              </div>
            )}
          </div>
        </section>

        {/* SECTION 2: AUDIO CAPTURE CONTROLS (Phase 4) */}
        <section className="audio-section-grid">
          {/* Microphone Card */}
          <div className="audio-card">
            <div className="audio-card-header">
              <h2 className="section-title">🎙️ Microphone Audio</h2>
              <span className={`audio-badge ${isMicCapturing ? 'badge-active' : 'badge-idle'}`}>
                {isMicCapturing ? (micVolume > 5 ? 'Active (Signal)' : 'Listening') : 'Stopped'}
              </span>
            </div>

            <div className="control-group">
              <label htmlFor="mic-select" className="control-label">
                Microphone Device:
              </label>
              <div className="select-row">
                <select
                  id="mic-select"
                  className="source-dropdown"
                  value={selectedMicId}
                  disabled={isMicCapturing || isLoadingMicrophones}
                  onChange={(e) => setSelectedMicId(e.target.value)}
                >
                  {microphones.length === 0 ? (
                    <option value="">No microphones detected</option>
                  ) : (
                    microphones.map((m) => (
                      <option key={m.deviceId} value={m.deviceId}>
                        🎙️ {m.label}
                      </option>
                    ))
                  )}
                </select>

                <button
                  type="button"
                  id="btn-refresh-mics"
                  className="btn btn-secondary"
                  onClick={() => void refreshMicrophones()}
                  disabled={isMicCapturing || isLoadingMicrophones}
                  title="Refresh microphone devices"
                >
                  {isLoadingMicrophones ? '...' : '🔄'}
                </button>
              </div>
            </div>

            <div className="button-group" style={{ marginTop: '0.75rem' }}>
              <button
                type="button"
                id="btn-start-mic"
                className="btn btn-primary"
                disabled={isMicCapturing || microphones.length === 0}
                onClick={() => void startMicCapture()}
              >
                ▶ Start Mic Test
              </button>

              <button
                type="button"
                id="btn-stop-mic"
                className="btn btn-danger"
                disabled={!isMicCapturing}
                onClick={() => void stopMicCapture()}
              >
                ⏹ Stop Mic Test
              </button>
            </div>

            {/* Live Audio Level Meter */}
            <div className="meter-wrapper">
              <div className="meter-label-row">
                <span className="meter-title">Live Mic Level</span>
                <span className="meter-value" id="mic-level-value">{isMicCapturing ? `${micVolume}%` : '0%'}</span>
              </div>
              <div className="meter-track" role="meter" aria-valuenow={micVolume} aria-valuemin={0} aria-valuemax={100}>
                <div
                  id="mic-meter-bar"
                  className={`meter-fill meter-mic ${isMicCapturing ? 'active' : ''}`}
                  style={{ width: `${isMicCapturing ? micVolume : 0}%` }}
                />
              </div>
            </div>

            <div className="device-label-text">
              Device: <strong>{selectedMic?.label || 'None selected'}</strong>
            </div>
          </div>

          {/* System Audio Card */}
          <div className="audio-card">
            <div className="audio-card-header">
              <h2 className="section-title">🔊 System Audio (Desktop)</h2>
              <span className={`audio-badge ${isSystemAudioCapturing ? 'badge-active' : 'badge-idle'}`}>
                {isSystemAudioCapturing ? (systemAudioVolume > 5 ? 'Active (Signal)' : 'Capturing') : 'Stopped'}
              </span>
            </div>

            <p className="audio-description">
              Captures desktop loopback audio playing on Windows (media, video playback, system sounds) via WASAPI loopback capture.
            </p>

            <div className="button-group" style={{ marginTop: 'auto', paddingTop: '0.75rem' }}>
              <button
                type="button"
                id="btn-start-sys-audio"
                className="btn btn-primary"
                disabled={isSystemAudioCapturing}
                onClick={() => void startSystemAudioCapture()}
              >
                ▶ Start System Audio Test
              </button>

              <button
                type="button"
                id="btn-stop-sys-audio"
                className="btn btn-danger"
                disabled={!isSystemAudioCapturing}
                onClick={() => void stopSystemAudioCapture()}
              >
                ⏹ Stop System Audio Test
              </button>
            </div>

            {/* Live System Audio Level Meter */}
            <div className="meter-wrapper">
              <div className="meter-label-row">
                <span className="meter-title">Live System Audio Level</span>
                <span className="meter-value" id="sys-audio-level-value">{isSystemAudioCapturing ? `${systemAudioVolume}%` : '0%'}</span>
              </div>
              <div className="meter-track" role="meter" aria-valuenow={systemAudioVolume} aria-valuemin={0} aria-valuemax={100}>
                <div
                  id="sys-audio-meter-bar"
                  className={`meter-fill meter-system ${isSystemAudioCapturing ? 'active' : ''}`}
                  style={{ width: `${isSystemAudioCapturing ? systemAudioVolume : 0}%` }}
                />
              </div>
            </div>

            <div className="device-label-text">
              Source: <strong>Windows WASAPI Desktop Loopback (Stereo 48kHz)</strong>
            </div>
          </div>
        </section>

        {/* SECTION 3: COMBINED CONCURRENCY TEST & TELEMETRY */}
        <section className="concurrency-panel">
          <div className="concurrency-header">
            <h2 className="section-title">⚡ Combined Concurrency & Multi-Source Test</h2>
            <div className="concurrency-buttons">
              <button
                type="button"
                id="btn-start-all"
                className="btn btn-primary"
                disabled={allActive}
                onClick={() => void handleStartAll()}
              >
                🚀 Start All 3 Sources
              </button>
              <button
                type="button"
                id="btn-stop-all"
                className="btn btn-danger"
                disabled={!anyActive}
                onClick={() => void handleStopAll()}
              >
                ⏹ Stop All
              </button>
            </div>
          </div>

          <div className="source-badges-row">
            <div className={`source-status-pill ${isScreenCapturing ? 'active' : 'inactive'}`}>
              <span className="pill-dot" />
              <span>Screen Preview: {isScreenCapturing ? 'ACTIVE (60 FPS)' : 'INACTIVE'}</span>
            </div>
            <div className={`source-status-pill ${isMicCapturing ? 'active' : 'inactive'}`}>
              <span className="pill-dot" />
              <span>Microphone: {isMicCapturing ? 'ACTIVE' : 'INACTIVE'}</span>
            </div>
            <div className={`source-status-pill ${isSystemAudioCapturing ? 'active' : 'inactive'}`}>
              <span className="pill-dot" />
              <span>System Audio: {isSystemAudioCapturing ? 'ACTIVE' : 'INACTIVE'}</span>
            </div>
          </div>
        </section>

        {/* Diagnostics & Stream Telemetry */}
        <section className="diagnostics-grid">
          <div className="diagnostic-item">
            <span className="label">Screen Stream</span>
            <span className={`value ${isScreenCapturing ? 'status-success' : 'status-muted'}`}>
              {isScreenCapturing && screenMetrics ? `${screenMetrics.width}×${screenMetrics.height} @ ${screenMetrics.frameRate} FPS` : 'Idle'}
            </span>
          </div>

          <div className="diagnostic-item">
            <span className="label">Microphone</span>
            <span className={`value ${isMicCapturing ? 'status-success' : 'status-muted'}`}>
              {isMicCapturing ? `${selectedMic?.label?.slice(0, 20) || 'Active'} (${micVolume}%)` : 'Idle'}
            </span>
          </div>

          <div className="diagnostic-item">
            <span className="label">System Audio</span>
            <span className={`value ${isSystemAudioCapturing ? 'status-success' : 'status-muted'}`}>
              {isSystemAudioCapturing ? `WASAPI Loopback (${systemAudioVolume}%)` : 'Idle'}
            </span>
          </div>

          <div className="diagnostic-item">
            <span className="label">Target Source</span>
            <span className="value source-truncate" title={selectedSource?.name || 'None'}>
              {selectedSource ? selectedSource.name : 'None selected'}
            </span>
          </div>

          <div className="diagnostic-item">
            <span className="label">Concurrent Capture</span>
            <span className={`value ${isScreenCapturing && isMicCapturing && isSystemAudioCapturing ? 'status-success' : 'status-info'}`}>
              {[isScreenCapturing && 'Screen', isMicCapturing && 'Mic', isSystemAudioCapturing && 'SysAudio'].filter(Boolean).join(' + ') || 'None'}
            </span>
          </div>

          <div className="diagnostic-item">
            <span className="label">IPC Bridge</span>
            <span className="value status-info">{bridgeStatus}</span>
          </div>
        </section>

        <footer className="footer-note">
          <p>
            Friday Recorder Phase 4 — Independent Audio Abstraction Layer (Microphone + Windows WASAPI System Audio Loopback)
            running concurrently with Phase 3 Screen Capture. Preview and testing mode only (no file written).
          </p>
        </footer>
      </main>
    </div>
  );
}
