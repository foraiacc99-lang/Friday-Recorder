/**
 * Strongly-typed IPC bridge contract exposed via contextBridge.
 * Phase 2 Shell Scaffolding — app.getVersion single proof-of-pattern call.
 */
export interface AppGetVersionResponse {
  version: string;
}

export interface FridayBridgeApi {
  app: {
    getVersion: () => Promise<string>;
  };
}

declare global {
  interface Window {
    friday: FridayBridgeApi;
    electronAPI: FridayBridgeApi;
  }
}
