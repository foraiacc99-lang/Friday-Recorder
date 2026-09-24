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
}

declare global {
  interface Window {
    friday: FridayBridgeApi;
    electronAPI: FridayBridgeApi;
  }
}
