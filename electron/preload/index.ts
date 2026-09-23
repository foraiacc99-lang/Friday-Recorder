import { contextBridge, ipcRenderer } from 'electron';
import { IPC_CHANNELS } from '../../shared/events';
import type { FridayBridgeApi } from '../../shared/types';

/**
 * Minimal typed IPC bridge for Phase 2.
 * Exposes strictly safe plumbing for app.getVersion.
 * Raw ipcRenderer or Node modules are NEVER exposed to the renderer.
 */
const bridgeApi: FridayBridgeApi = {
  app: {
    getVersion: (): Promise<string> => ipcRenderer.invoke(IPC_CHANNELS.APP.GET_VERSION),
  },
};

contextBridge.exposeInMainWorld('friday', bridgeApi);
contextBridge.exposeInMainWorld('electronAPI', bridgeApi);
