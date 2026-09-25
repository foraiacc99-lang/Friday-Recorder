/**
 * Core type definitions for Phase 5: Recording Pipeline.
 */

export type RecordingState =
  | 'idle'
  | 'countdown'
  | 'recording'
  | 'paused'
  | 'stopping'
  | 'saved'
  | 'error';

export type RecordingResolution = '720p' | '1080p';
export type RecordingFps = 30 | 60;

export interface RecordingOptions {
  sourceId: string;
  sourceName?: string;
  resolution: RecordingResolution;
  fps: RecordingFps;
  micEnabled: boolean;
  micDeviceId?: string;
  systemAudioEnabled: boolean;
  webcamEnabled?: boolean;
}

export interface RecordingSessionInfo {
  sessionId: string;
  state: RecordingState;
  startedAt: number;
  outputPath: string;
  fileName: string;
  options: RecordingOptions;
}

export interface SavedRecordingResult {
  sessionId: string;
  filePath: string;
  fileName: string;
  fileSizeBytes: number;
  durationMs: number;
  width: number;
  height: number;
  fps: number;
  startedAt: number;
  completedAt: number;
  hasAudio: boolean;
  micEnabled: boolean;
  systemAudioEnabled: boolean;
}

export interface RecordingStatus {
  state: RecordingState;
  activeSession: RecordingSessionInfo | null;
  lastSavedResult: SavedRecordingResult | null;
  error: string | null;
}

export interface RecordingStopPayload {
  sessionId: string;
  durationMs: number;
}
