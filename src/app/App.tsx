import { useEffect, useState } from 'react';
import { useCapturePreview } from '../preview/useCapturePreview';
import { useAudioCapture } from '../preview/useAudioCapture';
import { useRecordingPipeline } from '../recorder/useRecordingPipeline';
import { RecordingCountdown } from '../recorder/RecordingCountdown';
import { ActiveRecordingBar } from '../recorder/ActiveRecordingBar';
import { SavedRecordingModal } from '../recorder/SavedRecordingModal';
import type { RecordingFps, RecordingOptions, RecordingResolution } from '../../shared/types';
import './App.css';

export default function App() {
  const [version, setVersion] = useState<string>('Loading...');
  const [bridgeStatus, setBridgeStatus] = useState<string>('Connecting...');

  // Phase 5 Recording Setup state
  const [resolution, setResolution] = useState<RecordingResolution>('1080p');
  const [fps, setFps] = useState<RecordingFps>(60);
  const [micEnabled, setMicEnabled] = useState<boolean>(true);
  const [systemAudioEnabled, setSystemAudioEnabled] = useState<boolean>(true);
  const [activeTab, setActiveTab] = useState<'recorder' | 'preview-tools'>('recorder');

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

  // Phase 5 Recording Pipeline Hook
  const {
    recordingState,
    countdown,
    formattedTime,
    isPaused,
    savedResult,
    error: recordingError,
    warning: recordingWarning,
    startCountdown,
    cancelCountdown,
    pauseRecording,
    resumeRecording,
    stopRecording,
    clearSavedResult,
    clearError: clearRecordingError,
  } = useRecordingPipeline();

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

  // Quick combined actions (Phase 4 compatibility)
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

  // Launch Recording Flow
  const handleStartRecording = () => {
    if (!selectedSourceId) return;

    // Stop standalone preview so the recording pipeline gets exclusive access
    if (isScreenCapturing) {
      void stopScreenCapture();
    }

    const options: RecordingOptions = {
      sourceId: selectedSourceId,
      sourceName: selectedSource ? selectedSource.name : undefined,
      resolution,
      fps,
      micEnabled,
      micDeviceId: selectedMicId,
      systemAudioEnabled,
      webcamEnabled: false,
    };

    startCountdown(options);
  };

  const isRecordingActive = recordingState === 'recording' || recordingState === 'paused';

  return (
    <div className="app-container">
      {/* 3-2-1 Fullscreen Countdown Overlay */}
      {recordingState === 'countdown' && (
        <RecordingCountdown countdown={countdown} onCancel={cancelCountdown} />
      )}

      {/* Saved Recording Confirmation Modal */}
      {savedResult && (
        <SavedRecordingModal result={savedResult} onClose={clearSavedResult} />
      )}

      <main className="foundation-card">
        <header className="header">
          <div className="status-pill">Phase 5: Recording Pipeline</div>
          <h1 className="title">Friday Recorder — v{version}</h1>
          <p className="subtitle">
            Desktop Screen, Microphone & System Audio Recording Pipeline
          </p>
        </header>

        {/* Top Active Recording Bar */}
        {isRecordingActive && (
          <ActiveRecordingBar
            isPaused={isPaused}
            formattedTime={formattedTime}
            sourceName={selectedSource?.name}
            resolution={resolution}
            fps={fps}
            micEnabled={micEnabled}
            systemAudioEnabled={systemAudioEnabled}
            onPause={() => void pauseRecording()}
            onResume={() => void resumeRecording()}
            onStop={() => void stopRecording()}
          />
        )}

        {/* Notification banners */}
        {recordingError && (
          <div className="error-banner" role="alert">
            <span className="error-icon">⚠️</span>
            <div className="error-content" style={{ flex: 1 }}>
              <strong>Recording Error:</strong> {recordingError}
            </div>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={clearRecordingError}
            >
              Dismiss
            </button>
          </div>
        )}

        {recordingWarning && (
          <div className="error-banner" style={{ background: 'rgba(245, 158, 11, 0.15)', borderColor: 'rgba(245, 158, 11, 0.4)', color: '#fde68a' }} role="alert">
            <span className="error-icon">ℹ️</span>
            <div className="error-content">
              <strong>Notice:</strong> {recordingWarning}
            </div>
          </div>
        )}

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

        {/* View Switcher Tabs */}
        <div className="segmented-group" style={{ marginBottom: '1.25rem' }}>
          <button
            type="button"
            className={`segmented-btn ${activeTab === 'recorder' ? 'active' : ''}`}
            onClick={() => setActiveTab('recorder')}
          >
            ⏺️ New Recording Studio
          </button>
          <button
            type="button"
            className={`segmented-btn ${activeTab === 'preview-tools' ? 'active' : ''}`}
            onClick={() => setActiveTab('preview-tools')}
          >
            🎛️ Diagnostics & Capture Tools
          </button>
        </div>

        {/* TAB 1: PHASE 5 RECORDING STUDIO FLOW */}
        {activeTab === 'recorder' && (
          <section className="recording-setup-card">
            <h2 className="section-title">🎬 New Recording Setup</h2>

            {/* Source Selection Row */}
            <div className="control-group" style={{ marginBottom: '1.25rem' }}>
              <label htmlFor="source-select" className="control-label">
                1. Select Capture Source (Display or Window):
              </label>
              <div className="select-row">
                <select
                  id="source-select"
                  className="source-dropdown"
                  value={selectedSourceId}
                  disabled={isRecordingActive || isLoadingSources}
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
                  disabled={isRecordingActive || isLoadingSources}
                  title="Refresh screen sources"
                >
                  {isLoadingSources ? 'Refreshing...' : '🔄'}
                </button>
              </div>
            </div>

            {/* Two-Column Setup Grid */}
            <div className="setup-grid">
              {/* Left Column: Audio & Webcam Toggles */}
              <div className="setup-column">
                <div className="control-label">2. Audio & Video Devices</div>

                {/* Microphone Toggle + Dropdown */}
                <div className="toggle-item">
                  <div className="toggle-info">
                    <span className="toggle-label">🎤 Microphone</span>
                    <span className="toggle-desc">Record voice narration</span>
                  </div>
                  <label className="switch">
                    <input
                      type="checkbox"
                      id="toggle-mic"
                      checked={micEnabled}
                      disabled={isRecordingActive}
                      onChange={(e) => setMicEnabled(e.target.checked)}
                    />
                    <span className="slider" />
                  </label>
                </div>

                {micEnabled && (
                  <div style={{ marginTop: '-0.5rem', marginBottom: '0.25rem', display: 'flex', gap: '0.5rem' }}>
                    <select
                      id="mic-select"
                      className="source-dropdown"
                      style={{ fontSize: '0.8rem', padding: '0.5rem', flex: 1 }}
                      value={selectedMicId}
                      disabled={isRecordingActive || isLoadingMicrophones}
                      onChange={(e) => setSelectedMicId(e.target.value)}
                    >
                      {microphones.length === 0 ? (
                        <option value="">No microphones found</option>
                      ) : (
                        microphones.map((m) => (
                          <option key={m.deviceId} value={m.deviceId}>
                            🎙️ {m.label || 'Default Microphone'} {m.isDefault ? '(Default)' : ''}
                          </option>
                        ))
                      )}
                    </select>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => void refreshMicrophones()}
                      disabled={isRecordingActive || isLoadingMicrophones}
                      title="Refresh microphones"
                    >
                      🔄
                    </button>
                  </div>
                )}

                {/* System Audio Toggle */}
                <div className="toggle-item">
                  <div className="toggle-info">
                    <span className="toggle-label">🔊 System Audio</span>
                    <span className="toggle-desc">Capture computer sound (music, calls, apps)</span>
                  </div>
                  <label className="switch">
                    <input
                      type="checkbox"
                      id="toggle-system-audio"
                      checked={systemAudioEnabled}
                      disabled={isRecordingActive}
                      onChange={(e) => setSystemAudioEnabled(e.target.checked)}
                    />
                    <span className="slider" />
                  </label>
                </div>

                {/* Webcam Toggle (Coming in Phase 13 - clearly disabled) */}
                <div className="toggle-item disabled">
                  <div className="toggle-info">
                    <span className="toggle-label">
                      📷 Webcam <span className="coming-soon-badge">Coming in Phase 13</span>
                    </span>
                    <span className="toggle-desc">Overlay camera feed (not yet available)</span>
                  </div>
                  <label className="switch">
                    <input
                      type="checkbox"
                      id="toggle-webcam"
                      checked={false}
                      disabled={true}
                    />
                    <span className="slider" />
                  </label>
                </div>
              </div>

              {/* Right Column: Resolution & Framerate */}
              <div className="setup-column">
                <div className="control-label">3. Video Quality & Frame Rate</div>

                <div className="toggle-item" style={{ flexDirection: 'column', alignItems: 'stretch', gap: '0.5rem' }}>
                  <div className="toggle-label">Resolution</div>
                  <div className="segmented-group">
                    <button
                      type="button"
                      id="res-1080p-btn"
                      className={`segmented-btn ${resolution === '1080p' ? 'active' : ''}`}
                      disabled={isRecordingActive}
                      onClick={() => setResolution('1080p')}
                    >
                      1080p (Full HD)
                    </button>
                    <button
                      type="button"
                      id="res-720p-btn"
                      className={`segmented-btn ${resolution === '720p' ? 'active' : ''}`}
                      disabled={isRecordingActive}
                      onClick={() => setResolution('720p')}
                    >
                      720p (HD)
                    </button>
                  </div>
                </div>

                <div className="toggle-item" style={{ flexDirection: 'column', alignItems: 'stretch', gap: '0.5rem' }}>
                  <div className="toggle-label">Frame Rate</div>
                  <div className="segmented-group">
                    <button
                      type="button"
                      id="fps-60-btn"
                      className={`segmented-btn ${fps === 60 ? 'active' : ''}`}
                      disabled={isRecordingActive}
                      onClick={() => setFps(60)}
                    >
                      60 FPS (Ultra Smooth)
                    </button>
                    <button
                      type="button"
                      id="fps-30-btn"
                      className={`segmented-btn ${fps === 30 ? 'active' : ''}`}
                      disabled={isRecordingActive}
                      onClick={() => setFps(30)}
                    >
                      30 FPS (Standard)
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Start Recording Button */}
            {!isRecordingActive ? (
              <button
                type="button"
                id="btn-start-recording"
                className="btn-start-recording"
                disabled={!selectedSourceId || isLoadingSources}
                onClick={handleStartRecording}
              >
                <span className="record-circle-icon" />
                Start Recording (3s Countdown)
              </button>
            ) : (
              <button
                type="button"
                id="btn-stop-recording-main"
                className="btn btn-danger btn-block"
                style={{ padding: '0.875rem', fontSize: '1rem', fontWeight: 700 }}
                onClick={() => void stopRecording()}
              >
                ⏹ Stop & Save Recording ({formattedTime})
              </button>
            )}
          </section>
        )}

        {/* LIVE PREVIEW CONTAINER */}
        <section className="section-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
            <h2 className="section-title" style={{ margin: 0 }}>
              🖥️ Live Screen Video Preview
            </h2>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button
                type="button"
                id="btn-start-preview"
                className="btn btn-secondary btn-sm"
                disabled={isScreenCapturing || !selectedSourceId || isRecordingActive}
                onClick={() => void startScreenCapture()}
              >
                ▶ Start Preview
              </button>
              <button
                type="button"
                id="btn-stop-preview"
                className="btn btn-danger btn-sm"
                disabled={!isScreenCapturing || isRecordingActive}
                onClick={() => void stopScreenCapture()}
              >
                ⏹ Stop Preview
              </button>
            </div>
          </div>

          <div className="preview-container">
            <video
              ref={videoRef}
              id="preview-video"
              className="preview-video-element"
              autoPlay
              playsInline
              muted
            />
            {!isScreenCapturing && !isRecordingActive && (
              <div className="preview-placeholder">
                <span className="placeholder-icon">🖥️</span>
                <p>Preview Idle — Click "Start Preview" to test or "Start Recording" to capture</p>
                <span className="placeholder-sub">
                  Selected: {selectedSource ? selectedSource.name : 'None'}
                </span>
              </div>
            )}
          </div>

          {screenMetrics && (
            <div className="metrics-grid" style={{ marginTop: '0.75rem' }}>
              <div className="metric-chip">
                <span className="metric-label">Resolution</span>
                <span id="metric-resolution" className="metric-val">
                  {screenMetrics.width} × {screenMetrics.height}
                </span>
              </div>
              <div className="metric-chip">
                <span className="metric-label">Frame Rate</span>
                <span id="metric-fps" className="metric-val">{screenMetrics.frameRate} FPS</span>
              </div>
              <div className="metric-chip">
                <span className="metric-label">Aspect Ratio</span>
                <span id="metric-aspect" className="metric-val">{screenMetrics.aspectRatio.toFixed(2)}:1</span>
              </div>
              <div className="metric-chip">
                <span className="metric-label">Stream Status</span>
                <span id="metric-label" className="metric-val" style={{ color: 'var(--accent-emerald)' }}>
                  {screenMetrics.trackReadyState.toUpperCase()}
                </span>
              </div>
            </div>
          )}
        </section>

        {/* TAB 2: DIAGNOSTICS & INDEPENDENT TEST TOOLS */}
        {activeTab === 'preview-tools' && (
          <>
            {/* AUDIO TOOLS & METERS */}
            <section className="section-card">
              <h2 className="section-title">🎙️ Audio Devices & Independent Capture Meters</h2>

              {/* Microphone Panel */}
              <div className="audio-subcard" style={{ marginBottom: '1rem' }}>
                <div className="subcard-header">
                  <span className="subcard-title">🎤 Microphone Capture</span>
                  <div className="button-group">
                    <button
                      type="button"
                      id="btn-start-mic"
                      className="btn btn-primary btn-sm"
                      disabled={isMicCapturing || isRecordingActive}
                      onClick={() => void startMicCapture()}
                    >
                      ▶ Start Mic
                    </button>
                    <button
                      type="button"
                      id="btn-stop-mic"
                      className="btn btn-danger btn-sm"
                      disabled={!isMicCapturing || isRecordingActive}
                      onClick={() => void stopMicCapture()}
                    >
                      ⏹ Stop Mic
                    </button>
                  </div>
                </div>

                <div className="meter-container">
                  <div className="meter-meta">
                    <span>Input Signal RMS</span>
                    <span id="mic-volume-val" className="meter-val">{micVolume}%</span>
                  </div>
                  <div className="meter-bar-track">
                    <div
                      id="mic-volume-fill"
                      className="meter-bar-fill"
                      style={{ width: `${micVolume}%` }}
                    />
                  </div>
                </div>
              </div>

              {/* System Audio Panel */}
              <div className="audio-subcard">
                <div className="subcard-header">
                  <span className="subcard-title">💻 System Audio (WASAPI Loopback)</span>
                  <div className="button-group">
                    <button
                      type="button"
                      id="btn-start-sys"
                      className="btn btn-primary btn-sm"
                      disabled={isSystemAudioCapturing || isRecordingActive}
                      onClick={() => void startSystemAudioCapture()}
                    >
                      ▶ Start System Audio
                    </button>
                    <button
                      type="button"
                      id="btn-stop-sys"
                      className="btn btn-danger btn-sm"
                      disabled={!isSystemAudioCapturing || isRecordingActive}
                      onClick={() => void stopSystemAudioCapture()}
                    >
                      ⏹ Stop System Audio
                    </button>
                  </div>
                </div>

                <div className="meter-container">
                  <div className="meter-meta">
                    <span>Desktop Sound RMS</span>
                    <span id="sys-volume-val" className="meter-val">{systemAudioVolume}%</span>
                  </div>
                  <div className="meter-bar-track">
                    <div
                      id="sys-volume-fill"
                      className="meter-bar-fill"
                      style={{ width: `${systemAudioVolume}%` }}
                    />
                  </div>
                </div>
              </div>
            </section>

            {/* CONCURRENCY PANEL */}
            <section className="concurrency-panel">
              <div className="concurrency-header">
                <h2 className="section-title" style={{ margin: 0 }}>⚡ Tri-Source Concurrency Verification</h2>
                <div className="concurrency-buttons">
                  <button
                    type="button"
                    id="btn-start-all"
                    className="btn btn-primary btn-sm"
                    disabled={allActive || isRecordingActive}
                    onClick={() => void handleStartAll()}
                  >
                    🚀 Start All 3 Sources
                  </button>
                  <button
                    type="button"
                    id="btn-stop-all"
                    className="btn btn-secondary btn-sm"
                    disabled={!anyActive || isRecordingActive}
                    onClick={() => void handleStopAll()}
                  >
                    🛑 Stop All
                  </button>
                </div>
              </div>

              <div className="source-badges-row">
                <div className={`source-status-pill ${isScreenCapturing ? 'active' : 'inactive'}`}>
                  <span className="pill-dot" />
                  Screen Capture: {isScreenCapturing ? 'Active' : 'Off'}
                </div>
                <div className={`source-status-pill ${isMicCapturing ? 'active' : 'inactive'}`}>
                  <span className="pill-dot" />
                  Microphone: {isMicCapturing ? 'Active' : 'Off'}
                </div>
                <div className={`source-status-pill ${isSystemAudioCapturing ? 'active' : 'inactive'}`}>
                  <span className="pill-dot" />
                  System Audio: {isSystemAudioCapturing ? 'Active' : 'Off'}
                </div>
              </div>
            </section>
          </>
        )}

        {/* DIAGNOSTICS GRID */}
        <section className="diagnostics-grid">
          <div className="diagnostic-item">
            <span className="label">IPC Bridge</span>
            <span id="status-bridge" className="value status-info">{bridgeStatus}</span>
          </div>

          <div className="diagnostic-item">
            <span className="label">Screen Source</span>
            <span id="status-screen" className="value source-truncate">
              {isScreenCapturing ? (selectedSource?.name || 'Active') : 'Idle'}
            </span>
          </div>

          <div className="diagnostic-item">
            <span className="label">Microphone</span>
            <span id="status-mic" className="value source-truncate">
              {isMicCapturing ? (selectedMic?.label || 'Active') : 'Idle'}
            </span>
          </div>

          <div className="diagnostic-item">
            <span className="label">System Loopback</span>
            <span id="status-sys" className="value">
              {isSystemAudioCapturing ? 'Active (48kHz)' : 'Idle'}
            </span>
          </div>

          <div className="diagnostic-item">
            <span className="label">Recording Pipeline</span>
            <span id="status-pipeline" className="value" style={{ color: isRecordingActive ? '#ef4444' : 'var(--text-muted)' }}>
              {recordingState.toUpperCase()} {isRecordingActive ? `(${formattedTime})` : ''}
            </span>
          </div>

          <div className="diagnostic-item">
            <span className="label">Target Output</span>
            <span className="value status-info">
              {resolution} @ {fps}fps
            </span>
          </div>
        </section>

        <footer className="footer-note">
          Friday Recorder Phase 5 Pipeline • Screen Capture + Audio Mixing + VP9/Opus WebM Output • Saves to Documents/Friday Recorder/Recordings/
        </footer>
      </main>
    </div>
  );
}
