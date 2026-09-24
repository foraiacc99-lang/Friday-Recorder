import { contextBridge, ipcRenderer } from 'electron';
import { IPC_CHANNELS } from '../../shared/events';
import type {
  CaptureOptions,
  CaptureSessionInfo,
  CaptureSource,
  CaptureSourceType,
  CaptureStartPayload,
  CaptureStatus,
  FridayBridgeApi,
} from '../../shared/types';

/**
 * Strongly typed IPC bridge exposed to the renderer context.
 * Raw ipcRenderer or Node modules are NEVER exposed to the renderer.
 */
const bridgeApi: FridayBridgeApi = {
  app: {
    getVersion: (): Promise<string> => ipcRenderer.invoke(IPC_CHANNELS.APP.GET_VERSION),
  },
  capture: {
    listSources: (types?: CaptureSourceType[]): Promise<CaptureSource[]> =>
      ipcRenderer.invoke(IPC_CHANNELS.CAPTURE.LIST_SOURCES, types),

    startCapture: (sourceId: string, options?: CaptureOptions): Promise<CaptureSessionInfo> => {
      const payload: CaptureStartPayload = { sourceId, options };
      return ipcRenderer.invoke(IPC_CHANNELS.CAPTURE.START, payload);
    },

    stopCapture: (): Promise<void> => ipcRenderer.invoke(IPC_CHANNELS.CAPTURE.STOP),

    getStatus: (): Promise<CaptureStatus> => ipcRenderer.invoke(IPC_CHANNELS.CAPTURE.GET_STATUS),
  },
};

contextBridge.exposeInMainWorld('friday', bridgeApi);
contextBridge.exposeInMainWorld('electronAPI', bridgeApi);
