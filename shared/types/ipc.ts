import type {
  CaptureOptions,
  CaptureSessionInfo,
  CaptureSource,
  CaptureSourceType,
  CaptureStatus,
} from './capture';

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
}

declare global {
  interface Window {
    friday: FridayBridgeApi;
    electronAPI: FridayBridgeApi;
  }
}
