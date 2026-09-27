import type {
  CaptureOptions,
  CaptureSessionInfo,
  CaptureSource,
  CaptureSourceType,
  CaptureStatus,
} from './capture';
import type {
  AudioCaptureTarget,
  AudioDeviceInfo,
  AudioSessionInfo,
  AudioStatus,
} from './audio';

import type {
  RecordingOptions,
  RecordingSessionInfo,
  RecordingStatus,
  SavedRecordingResult,
} from './recording';
import type {
  ImportedMediaItem,
  MediaStatusCheckResult,
} from './media';

/**
 * Strongly-typed IPC bridge contract exposed via contextBridge.
 */
export interface AppGetVersionResponse {
  version: string;
}

export interface FridayBridgeApi {
  app: {
    getVersion: () => Promise<string>;
  };
  capture: {
    listSources: (types?: CaptureSourceType[]) => Promise<CaptureSource[]>;
    startCapture: (sourceId: string, options?: CaptureOptions) => Promise<CaptureSessionInfo>;
    stopCapture: () => Promise<void>;
    getStatus: () => Promise<CaptureStatus>;
  };
  audio: {
    listMicrophones: () => Promise<AudioDeviceInfo[]>;
    startMicCapture: (deviceId?: string) => Promise<AudioSessionInfo>;
    startSystemAudioCapture: () => Promise<AudioSessionInfo>;
    stop: (target?: AudioCaptureTarget) => Promise<void>;
    getStatus: () => Promise<AudioStatus>;
  };
  recording: {
    startRecording: (options: RecordingOptions) => Promise<RecordingSessionInfo>;
    writeChunk: (sessionId: string, chunk: Uint8Array) => Promise<void>;
    stopRecording: (sessionId: string, durationMs: number) => Promise<SavedRecordingResult>;
    pauseRecording: (sessionId: string) => Promise<void>;
    resumeRecording: (sessionId: string) => Promise<void>;
    getStatus: () => Promise<RecordingStatus>;
    showInFolder: (filePath: string) => Promise<void>;
  };
  media: {
    importDialog: () => Promise<ImportedMediaItem[]>;
    importFile: (filePath: string) => Promise<ImportedMediaItem>;
    list: () => Promise<ImportedMediaItem[]>;
    remove: (id: string) => Promise<boolean>;
    checkStatus: (id: string) => Promise<MediaStatusCheckResult>;
    getPathForFile?: (file: File) => string;
    getFileUrl: (filePath: string) => string;
  };
}

declare global {
  interface Window {
    friday: FridayBridgeApi;
    electronAPI: FridayBridgeApi;
  }
}
