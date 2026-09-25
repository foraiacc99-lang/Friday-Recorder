import React, { useState } from 'react';
import type { SavedRecordingResult } from '../../shared/types';

interface SavedRecordingModalProps {
  result: SavedRecordingResult;
  onClose: () => void;
}

export const SavedRecordingModal: React.FC<SavedRecordingModalProps> = ({ result, onClose }) => {
  const [copied, setCopied] = useState<boolean>(false);

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  const formatDuration = (ms: number): string => {
    const totalSecs = Math.round(ms / 1000);
    const mins = Math.floor(totalSecs / 60);
    const secs = totalSecs % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  const handleCopyPath = () => {
    navigator.clipboard.writeText(result.filePath).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {
      // Clipboard copy fallback
    });
  };

  const handleOpenFolder = () => {
    if (typeof window !== 'undefined' && window.friday?.recording?.showInFolder) {
      window.friday.recording.showInFolder(result.filePath).catch((err) => {
        console.error('Failed to open file folder:', err);
      });
    }
  };

  return (
    <div className="saved-modal-overlay" role="dialog" aria-modal="true" aria-label="Recording saved confirmation">
      <div className="saved-modal-card">
        <div className="saved-modal-header">
          <div className="saved-success-icon">🎉</div>
          <h2 className="saved-title">Recording Saved Successfully!</h2>
          <p className="saved-subtitle">Your video was encoded and saved to disk.</p>
        </div>

        {/* File location box */}
        <div className="saved-filepath-container">
          <div className="saved-filepath-label">File Location:</div>
          <div className="saved-filepath-box">
            <span className="saved-filepath-text" title={result.filePath} id="saved-filepath">
              {result.filePath}
            </span>
            <div className="saved-filepath-actions">
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={handleCopyPath}
                title="Copy file path to clipboard"
              >
                {copied ? '✓ Copied' : '📋 Copy'}
              </button>
              <button
                type="button"
                id="btn-open-folder"
                className="btn btn-primary btn-sm"
                onClick={handleOpenFolder}
                title="Open containing folder in Windows Explorer"
              >
                📁 Open in Folder
              </button>
            </div>
          </div>
        </div>

        {/* Stats grid */}
        <div className="saved-stats-grid">
          <div className="stat-card">
            <div className="stat-label">Duration</div>
            <div className="stat-value" id="saved-duration">{formatDuration(result.durationMs)}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">File Size</div>
            <div className="stat-value" id="saved-filesize">{formatFileSize(result.fileSizeBytes)}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Resolution</div>
            <div className="stat-value" id="saved-resolution">{result.width}x{result.height}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Frame Rate</div>
            <div className="stat-value" id="saved-fps">{result.fps} FPS</div>
          </div>
        </div>

        {/* Audio Summary */}
        <div className="saved-audio-summary">
          <span className="saved-audio-tag">
            {result.hasAudio ? '🔊 Audio Included' : '🔇 No Audio'}
          </span>
          {result.micEnabled && <span className="saved-audio-detail">🎤 Microphone</span>}
          {result.systemAudioEnabled && <span className="saved-audio-detail">💻 System Audio</span>}
        </div>

        {/* Footer buttons */}
        <div className="saved-modal-footer">
          <button
            type="button"
            id="btn-new-recording"
            className="btn btn-primary btn-block"
            onClick={onClose}
          >
            🔄 New Recording
          </button>
        </div>
      </div>
    </div>
  );
};
