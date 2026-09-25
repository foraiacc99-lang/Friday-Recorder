import React from 'react';

interface ActiveRecordingBarProps {
  isPaused: boolean;
  formattedTime: string;
  sourceName?: string;
  resolution: string;
  fps: number;
  micEnabled: boolean;
  systemAudioEnabled: boolean;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
}

export const ActiveRecordingBar: React.FC<ActiveRecordingBarProps> = ({
  isPaused,
  formattedTime,
  sourceName,
  resolution,
  fps,
  micEnabled,
  systemAudioEnabled,
  onPause,
  onResume,
  onStop,
}) => {
  return (
    <div className={`active-recording-bar ${isPaused ? 'paused' : 'recording'}`} role="region" aria-label="Active recording status">
      <div className="recording-status-left">
        <div className="recording-indicator-badge">
          <span className={`recording-dot ${isPaused ? 'dot-paused' : 'dot-active'}`} />
          <span className="recording-status-text">
            {isPaused ? 'PAUSED' : 'REC'}
          </span>
        </div>
        <div className="recording-timer" id="recording-timer">
          {formattedTime}
        </div>
        <div className="recording-tags">
          <span className="tag-badge quality-badge">{resolution} @ {fps}fps</span>
          {sourceName && <span className="tag-badge source-badge" title={sourceName}>📺 {sourceName}</span>}
          {micEnabled && <span className="tag-badge audio-badge" title="Microphone Active">🎤 Mic</span>}
          {systemAudioEnabled && <span className="tag-badge audio-badge" title="System Audio Active">🔊 System</span>}
        </div>
      </div>

      <div className="recording-controls-right">
        {isPaused ? (
          <button
            type="button"
            id="btn-resume-recording"
            className="btn btn-secondary resume-btn"
            onClick={onResume}
            title="Resume recording"
          >
            ▶ Resume
          </button>
        ) : (
          <button
            type="button"
            id="btn-pause-recording"
            className="btn btn-secondary pause-btn"
            onClick={onPause}
            title="Pause recording"
          >
            ⏸ Pause
          </button>
        )}

        <button
          type="button"
          id="btn-stop-recording"
          className="btn btn-danger stop-recording-btn"
          onClick={onStop}
          title="Stop and save recording"
        >
          ⏹ Stop Recording
        </button>
      </div>
    </div>
  );
};
