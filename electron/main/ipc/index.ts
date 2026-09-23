import { registerAppHandlers } from './appHandlers';

/**
 * Central registry for all IPC handlers.
 * Later phases (capture, recording, etc.) will plug into this registry.
 */
export function registerIpcHandlers(): void {
  registerAppHandlers();
}

export * from './appHandlers';
