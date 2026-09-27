import React, { useState } from 'react';
import { useMediaImport } from './useMediaImport';
import type { ImportedMediaItem } from '../../shared/types';
import './MediaImportPanel.css';

interface MediaImportPanelProps {
  onSelectMedia?: (item: ImportedMediaItem) => void;
  externalRecordingPath?: string | null;
}

export const MediaImportPanel: React.FC<MediaImportPanelProps> = ({
  onSelectMedia,
  externalRecordingPath,
}) => {
  const {
    items,
    isImporting,
    error,
    statusMap,
    importViaDialog,
    importByPath,
    importDroppedFiles,
    removeItem,
    checkStatus,
    clearError,
  } = useMediaImport();

  const [isDragOver, setIsDragOver] = useState(false);
  const [manualPath, setManualPath] = useState('');

  React.useEffect(() => {
    if (externalRecordingPath) {
      void importByPath(externalRecordingPath);
    }
  }, [externalRecordingPath, importByPath]);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      await importDroppedFiles(e.dataTransfer.files);
    }
  };

  const handleManualImport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualPath.trim()) return;
    const res = await importByPath(manualPath.trim());
    if (res) {
      setManualPath('');
    }
  };

  const formatDuration = (seconds: number): string => {
    if (!seconds || isNaN(seconds) || seconds <= 0) return '00:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  const formatFileSize = (bytes: number): string => {
    if (!bytes || bytes <= 0) return '0 B';
    if (bytes >= 1024 * 1024 * 1024) {
      return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
    }
    if (bytes >= 1024 * 1024) {
      return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    }
    return `${Math.round(bytes / 1024)} KB`;
  };

  return (
    <div className="media-import-container" id="media-import-panel">
      {/* Header section */}
      <div className="media-import-header">
        <div className="media-header-info">
          <h2 className="media-title">Media Library & Import</h2>
          <p className="media-subtitle">
            Import existing video files into project media. Files are referenced directly on disk
            without duplicating storage.
          </p>
        </div>
        <div className="media-header-actions">
          <button
            type="button"
            className="import-btn-primary"
            id="import-video-button"
            onClick={() => importViaDialog()}
            disabled={isImporting}
          >
            <span className="import-icon">📁</span>
            {isImporting ? 'Importing...' : 'Import Video'}
          </button>
        </div>
      </div>

      {/* Error alert banner */}
      {error && (
        <div className="media-error-banner" role="alert">
          <span className="error-icon">⚠️</span>
          <div className="error-text">
            <strong>Import Error:</strong> {error}
          </div>
          <button type="button" className="error-dismiss-btn" onClick={clearError}>
            ✕
          </button>
        </div>
      )}

      {/* Quick import prompt for recent Phase 5 recording if available */}
      {externalRecordingPath && (
        <div className="recent-recording-card">
          <div className="recent-recording-info">
            <span className="recent-icon">🎬</span>
            <div>
              <strong>Recent Friday Recording Available:</strong>
              <div className="recent-path">{externalRecordingPath}</div>
            </div>
          </div>
          <button
            type="button"
            className="import-recent-btn"
            onClick={() => importByPath(externalRecordingPath)}
            disabled={isImporting}
          >
            Import Recording to Library
          </button>
        </div>
      )}

      {/* Drag & Drop Zone */}
      <div
        className={`media-dropzone ${isDragOver ? 'drag-active' : ''}`}
        id="media-dropzone"
        onDragOver={handleDragOver}
        onDragEnter={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <div className="dropzone-inner">
          <div className="dropzone-icon">📥</div>
          <div className="dropzone-prompt">
            <strong>Drag and drop video files here</strong>, or click{' '}
            <button
              type="button"
              className="dropzone-browse-link"
              onClick={() => importViaDialog()}
              disabled={isImporting}
            >
              browse
            </button>
          </div>
          <div className="dropzone-formats">
            Supported formats: <span className="format-tag">.webm</span>
            <span className="format-tag">.mp4</span>
            <span className="format-tag">.mov</span>
            <span className="format-tag">.mkv</span>
          </div>
        </div>
      </div>

      {/* Manual file path input for automation and testing */}
      <form className="manual-import-form" onSubmit={handleManualImport}>
        <input
          type="text"
          className="manual-path-input"
          id="manual-path-input"
          placeholder="Or paste an absolute video file path (e.g. C:\Users\...\recording.webm)..."
          value={manualPath}
          onChange={(e) => setManualPath(e.target.value)}
          disabled={isImporting}
        />
        <button
          type="submit"
          className="manual-import-btn"
          id="manual-import-button"
          disabled={isImporting || !manualPath.trim()}
        >
          Import Path
        </button>
      </form>

      {/* Loading state indicator */}
      {isImporting && (
        <div className="media-importing-indicator" id="media-importing-indicator">
          <div className="import-spinner" />
          <span>Probing container metadata with ffprobe and caching thumbnail...</span>
        </div>
      )}

      {/* Media Items List/Grid */}
      <div className="media-list-section">
        <div className="media-list-header">
          <h3>Imported Media ({items.length})</h3>
          <span className="reference-note">Reference-based storage (zero file duplication)</span>
        </div>

        {items.length === 0 ? (
          <div className="media-empty-state" id="media-empty-state">
            <span className="empty-icon">🎞️</span>
            <h4>No video files imported yet</h4>
            <p>Use the "Import Video" button or drag a video file onto this window to begin.</p>
          </div>
        ) : (
          <div className="media-grid" id="media-grid">
            {items.map((item) => {
              const status = statusMap[item.id];
              const isMissing = status ? !status.exists : !item.isAvailable;

              return (
                <div
                  key={item.id}
                  className={`media-card ${isMissing ? 'file-missing' : ''}`}
                  id={`media-card-${item.id}`}
                  onClick={() => onSelectMedia && onSelectMedia(item)}
                >
                  <div className="thumbnail-wrapper">
                    {item.thumbnailUrl ? (
                      <img
                        src={item.thumbnailUrl}
                        alt={`Thumbnail for ${item.fileName}`}
                        className="media-thumbnail"
                      />
                    ) : (
                      <div className="thumbnail-placeholder">
                        <span>🎬</span>
                      </div>
                    )}
                    <div className="duration-pill">
                      {formatDuration(item.metadata.durationSeconds)}
                    </div>
                    {isMissing && <div className="missing-badge">FILE MISSING</div>}
                  </div>

                  <div className="card-body">
                    <div className="card-filename" title={item.filePath}>
                      {item.fileName}
                    </div>

                    <div className="card-badges">
                      <span className="meta-tag">
                        {item.metadata.width}×{item.metadata.height}
                      </span>
                      <span className="meta-tag">{item.metadata.fps} FPS</span>
                      <span className="meta-tag codec-tag">
                        {item.metadata.videoCodec.toUpperCase()}
                      </span>
                      {item.metadata.audioCodec && (
                        <span className="meta-tag audio-tag">
                          {item.metadata.audioCodec.toUpperCase()}
                        </span>
                      )}
                    </div>

                    <div className="card-footer">
                      <span className="card-filesize">{formatFileSize(item.fileSizeBytes)}</span>

                      <div className="card-actions">
                        <button
                          type="button"
                          className="card-open-editor-btn"
                          id={`btn-open-editor-${item.id}`}
                          title="Open video in Editor (Phase 7 Preview)"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (onSelectMedia) onSelectMedia(item);
                          }}
                        >
                          🎬 Open in Editor
                        </button>
                        <button
                          type="button"
                          className="card-check-btn"
                          title="Verify file existence on disk"
                          onClick={(e) => {
                            e.stopPropagation();
                            checkStatus(item.id);
                          }}
                        >
                          Check Status
                        </button>
                        <button
                          type="button"
                          className="card-remove-btn"
                          title="Remove reference from library (does not delete file on disk)"
                          onClick={(e) => {
                            e.stopPropagation();
                            removeItem(item.id);
                          }}
                        >
                          Remove
                        </button>
                      </div>
                    </div>

                    {isMissing && (
                      <div className="missing-warning">
                        ⚠️ File not found on disk. It may have been moved, renamed, or deleted.
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
