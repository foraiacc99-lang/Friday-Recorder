import { registerAppHandlers } from './appHandlers';
import { registerCaptureHandlers } from './captureHandlers';

/**
 * Central registry for all IPC handlers.
 */
export function registerIpcHandlers(): void {
  registerAppHandlers();
  registerCaptureHandlers();
}

export * from './appHandlers';
export * from './captureHandlers';
