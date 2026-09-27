import React, { useState } from 'react';
import type { ImportedMediaItem } from '../../shared/types';
import { useVideoPreview } from '../preview/useVideoPreview';
import './EditorScreen.css';

interface EditorScreenProps {
  mediaItem: ImportedMediaItem;
  onBackToMedia: () => void;
}

export const EditorScreen: React.FC<EditorScreenProps> = ({
  mediaItem,
  onBackToMedia,
}) => {
  const {
    canvasRef,
    containerRef,
    currentTime,
    duration,
    isPlaying,
    isBuffering,
    isMuted,
    volume,
    error,
    timeToInteractiveMs,
    play,
    pause,
    togglePlay,
    seek,
    stepFrame,
    setVolume,
    toggleMute,
    clearError,
  } = useVideoPreview(mediaItem);

  const [isScrubbing, setIsScrubbing] = useState<boolean>(false);

  const formatTime = (seconds: number): string => {
    if (!seconds || isNaN(seconds) || seconds <= 0) return '00:00';
    const totalSecs = Math.floor(seconds);
    const mins = Math.floor(totalSecs / 60);
    const secs = totalSecs % 60;
    const ms = Math.floor((seconds % 1) * 10);
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${ms}`;
  };

  const formatShortTime = (seconds: number): string => {
    if (!seconds || isNaN(seconds) || seconds <= 0) return '00:00';
    const totalSecs = Math.floor(seconds);
    const mins = Math.floor(totalSecs / 60);
    const secs = totalSecs % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  const handleScrubberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    seek(val);
  };

  const handleScrubberMouseDown = () => {
    setIsScrubbing(true);
    if (isPlaying) pause();
  };

  const handleScrubberMouseUp = () => {
    setIsScrubbing(false);
  };

  // Keyboard shortcuts (Spacebar for Play/Pause, Left/Right arrow for frame step)
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }
      if (e.code === 'Space') {
        e.preventDefault();
        togglePlay();
      } else if (e.code === 'ArrowLeft') {
        e.preventDefault();
        stepFrame(false);
      } else if (e.code === 'ArrowRight') {
        e.preventDefault();
        stepFrame(true);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [togglePlay, stepFrame]);

  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className="editor-screen-root" id="editor-screen-container">
      {/* Top Header Bar */}
      <header className="editor-header-bar">
        <div className="editor-header-left">
          <button
            type="button"
            className="editor-back-btn"
            id="btn-back-to-media"
            onClick={onBackToMedia}
            title="Return to Media Library"
          >
            ← Media Library
          </button>
          <div className="editor-title-group">
            <h2 className="editor-video-title" id="editor-video-title" title={mediaItem.filePath}>
              {mediaItem.fileName}
            </h2>
            <div className="editor-badge-row">
              <span className="editor-badge resolution-badge">
                {mediaItem.metadata.width}×{mediaItem.metadata.height}
              </span>
              <span className="editor-badge fps-badge">{mediaItem.metadata.fps} FPS</span>
              <span className="editor-badge codec-badge">
                {mediaItem.metadata.videoCodec.toUpperCase()}
              </span>
              {mediaItem.metadata.audioCodec && (
                <span className="editor-badge audio-badge">
                  {mediaItem.metadata.audioCodec.toUpperCase()}
                </span>
              )}
              {timeToInteractiveMs !== null && (
                <span className="editor-badge tti-badge" id="preview-tti-badge">
                  TTI: {timeToInteractiveMs}ms
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="editor-header-right">
          <span className="editor-phase-tag">Phase 7: GPU Video Preview</span>
        </div>
      </header>

      {/* Main Workspace: Center Preview + Right Inspector Placeholder */}
      <div className="editor-main-workspace">
        {/* Center: Video Preview Stage + Playback Controls */}
        <section className="editor-preview-column">
          {error ? (
            <div className="preview-error-card" id="preview-error-state" role="alert">
              <div className="error-icon-large">⚠️</div>
              <h3 className="error-title">Source Video File Not Found or Unreadable</h3>
              <p className="error-desc">{error}</p>
              <div className="error-path" title={mediaItem.filePath}>
                {mediaItem.filePath}
              </div>
              <div className="error-actions">
                <button
                  type="button"
                  className="btn-return-library"
                  id="btn-error-return-library"
                  onClick={onBackToMedia}
                >
                  Return to Media Library
                </button>
                <button type="button" className="btn-retry" onClick={clearError}>
                  Dismiss Alert
                </button>
              </div>
            </div>
          ) : (
            <div className="preview-viewport-card">
              {/* WebGL Canvas Viewport */}
              <div
                className="preview-canvas-wrapper"
                ref={containerRef}
                id="preview-canvas-wrapper"
                onClick={togglePlay}
              >
                <canvas
                  ref={canvasRef}
                  id="preview-canvas"
                  className="preview-canvas-element"
                />

                {/* Center Big Play Button Overlay on Hover/Pause */}
                {!isPlaying && !isBuffering && (
                  <div className="preview-center-play-overlay">
                    <button
                      type="button"
                      className="preview-big-play-btn"
                      id="btn-big-play"
                      onClick={(e) => {
                        e.stopPropagation();
                        void play();
                      }}
                      title="Play (Spacebar)"
                    >
                      ▶
                    </button>
                  </div>
                )}

                {/* Buffering Indicator */}
                {isBuffering && (
                  <div className="preview-buffering-overlay" id="preview-buffering-indicator">
                    <div className="buffering-spinner" />
                    <span>Buffering video...</span>
                  </div>
                )}

                {/* Subtle Resolution Pill */}
                <div className="preview-floating-pill">
                  WebGL GPU Compositor • {mediaItem.metadata.width}×{mediaItem.metadata.height}
                </div>
              </div>

              {/* Scrubber & Playback Controls Bar */}
              <div className="preview-controls-bar">
                {/* Track Scrubber Slider */}
                <div className={`scrubber-track-container ${isScrubbing ? 'scrubbing-active' : ''}`}>
                  <div className="scrubber-track-bg">
                    <div
                      className="scrubber-track-fill"
                      style={{ width: `${progressPercent}%` }}
                    />
                  </div>
                  <input
                    type="range"
                    id="preview-scrubber"
                    className="scrubber-input-range"
                    min={0}
                    max={duration || 1}
                    step={0.01}
                    value={currentTime}
                    onChange={handleScrubberChange}
                    onMouseDown={handleScrubberMouseDown}
                    onMouseUp={handleScrubberMouseUp}
                    onTouchStart={handleScrubberMouseDown}
                    onTouchEnd={handleScrubberMouseUp}
                    aria-label="Video playback seeker"
                  />
                </div>

                {/* Button Controls Row */}
                <div className="controls-button-row">
                  {/* Left: Play/Pause, Step Frames */}
                  <div className="playback-btn-group">
                    <button
                      type="button"
                      className={`btn-playback-toggle ${isPlaying ? 'playing' : 'paused'}`}
                      id="btn-play-pause"
                      onClick={togglePlay}
                      title={isPlaying ? 'Pause (Spacebar)' : 'Play (Spacebar)'}
                    >
                      {isPlaying ? '⏸ Pause' : '▶ Play'}
                    </button>

                    <button
                      type="button"
                      className="btn-step-frame"
                      id="btn-step-prev"
                      onClick={() => stepFrame(false)}
                      title="Step 1 frame backward (← Arrow)"
                    >
                      ⏮ -1F
                    </button>
                    <button
                      type="button"
                      className="btn-step-frame"
                      id="btn-step-next"
                      onClick={() => stepFrame(true)}
                      title="Step 1 frame forward (→ Arrow)"
                    >
                      +1F ⏭
                    </button>

                    {/* Time Display */}
                    <div className="preview-time-display" id="preview-time-display">
                      <span className="current-time">{formatTime(currentTime)}</span>
                      <span className="time-divider">/</span>
                      <span className="duration-time">{formatShortTime(duration)}</span>
                    </div>
                  </div>

                  {/* Right: Volume & Audio Controls */}
                  <div className="audio-control-group">
                    <button
                      type="button"
                      className="btn-mute-toggle"
                      id="btn-mute-toggle"
                      onClick={toggleMute}
                      title={isMuted ? 'Unmute' : 'Mute'}
                    >
                      {isMuted || volume === 0 ? '🔇' : volume < 0.5 ? '🔉' : '🔊'}
                    </button>
                    <input
                      type="range"
                      className="volume-slider"
                      id="preview-volume-slider"
                      min={0}
                      max={1}
                      step={0.05}
                      value={isMuted ? 0 : volume}
                      onChange={(e) => setVolume(parseFloat(e.target.value))}
                      title={`Volume: ${Math.round((isMuted ? 0 : volume) * 100)}%`}
                    />
                  </div>
                </div>
              </div>
            </div>
          )}
        </section>

        {/* Right: Inspector / Properties Panel Placeholder */}
        <aside className="editor-inspector-placeholder" id="inspector-placeholder">
          <div className="placeholder-content">
            <span className="placeholder-icon">🎛️</span>
            <h3 className="placeholder-title">Inspector & Properties</h3>
            <p className="placeholder-desc">
              Controls for crop, camera zoom, cursor styles, and webcam overlay will appear here in
              Phases 10–13.
            </p>
            <div className="placeholder-specs-box">
              <div className="spec-row">
                <span>Phase 10:</span> <span>Canvas Crop & Dimensions</span>
              </div>
              <div className="spec-row">
                <span>Phase 11:</span> <span>Smooth Zoom Keyframes</span>
              </div>
              <div className="spec-row">
                <span>Phase 12:</span> <span>Cursor Ripple & Motion</span>
              </div>
              <div className="spec-row">
                <span>Phase 13:</span> <span>Webcam PiP Placement</span>
              </div>
            </div>
          </div>
        </aside>
      </div>

      {/* Bottom: Timeline Editor Placeholder */}
      <footer className="editor-timeline-placeholder" id="timeline-placeholder">
        <div className="timeline-placeholder-inner">
          <div className="timeline-header-row">
            <span className="timeline-title">🎞️ Timeline & Multi-Track Sequencing Workspace</span>
            <span className="timeline-coming-soon">Coming in Phase 8 (Timeline)</span>
          </div>
          <div className="timeline-tracks-mock">
            <div className="track-mock-lane">
              <span className="lane-label">Video Track 1</span>
              <div className="lane-clip-mock" style={{ width: `${Math.min(100, Math.max(20, progressPercent + 20))}%` }}>
                <span className="clip-name">{mediaItem.fileName}</span>
                <span className="clip-dur">{formatShortTime(duration)}</span>
              </div>
            </div>
            <div className="track-mock-lane">
              <span className="lane-label">Audio Track 1</span>
              <div className="lane-clip-mock audio-lane" style={{ width: `${Math.min(100, Math.max(20, progressPercent + 20))}%` }}>
                <span className="clip-name">Audio Waveform (Opus/AAC)</span>
              </div>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
};
