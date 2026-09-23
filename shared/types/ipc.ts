/**
 * Application metadata interface returned across the IPC bridge.
 */
export interface AppInfo {
  name: string;
  version: string;
  isPackaged: boolean;
  platform: string;
}

/**
 * Strongly-typed IPC bridge contract exposed via contextBridge.
 * Minimal plumbing for Phase 1 — no capture or editing logic.
 */
export interface FridayBridgeApi {
  app: {
    getInfo: () => Promise<AppInfo>;
    ping: () => Promise<string>;
  };
}

declare global {
  interface Window {
    friday: FridayBridgeApi;
  }
}
