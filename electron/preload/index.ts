import { contextBridge, ipcRenderer } from 'electron';
import type { AppInfo, FridayBridgeApi } from '../../shared/types';

/**
 * Minimal typed IPC bridge. Exposes strictly safe plumbing.
 * Raw ipcRenderer or Node modules are NEVER exposed to the renderer.
 */
const bridgeApi: FridayBridgeApi = {
  app: {
    getInfo: (): Promise<AppInfo> => ipcRenderer.invoke('app:getInfo'),
    ping: (): Promise<string> => ipcRenderer.invoke('app:ping'),
  },
};

contextBridge.exposeInMainWorld('friday', bridgeApi);
