import React from 'react';

interface RecordingCountdownProps {
  countdown: number;
  onCancel: () => void;
}

export const RecordingCountdown: React.FC<RecordingCountdownProps> = ({ countdown, onCancel }) => {
  return (
    <div className="countdown-overlay" role="dialog" aria-modal="true" aria-label="Recording countdown">
      <div className="countdown-modal">
        <div className="countdown-pulse-ring" />
        <div className="countdown-number" key={countdown}>
          {countdown}
        </div>
        <p className="countdown-text">Get ready to record...</p>
        <button
          type="button"
          id="btn-cancel-countdown"
          className="btn btn-secondary countdown-cancel-btn"
          onClick={onCancel}
        >
          Cancel
        </button>
      </div>
    </div>
  );
};
