import { registerAppHandlers } from './appHandlers';
import { registerCaptureHandlers } from './captureHandlers';
import { registerAudioHandlers } from './audioHandlers';

/**
 * Central registry for all IPC handlers.
 */
export function registerIpcHandlers(): void {
  registerAppHandlers();
  registerCaptureHandlers();
  registerAudioHandlers();
}

export * from './appHandlers';
export * from './captureHandlers';
export * from './audioHandlers';
export { IPC_CHANNELS } from '../../../shared/events';


