import { registerAppHandlers } from './appHandlers';
import { registerCaptureHandlers } from './captureHandlers';
import { registerAudioHandlers } from './audioHandlers';
import { registerRecordingHandlers } from './recordingHandlers';

/**
 * Central registry for all IPC handlers.
 */
export function registerIpcHandlers(): void {
  registerAppHandlers();
  registerCaptureHandlers();
  registerAudioHandlers();
  registerRecordingHandlers();
}

export * from './appHandlers';
export * from './captureHandlers';
export * from './audioHandlers';
export * from './recordingHandlers';
export { IPC_CHANNELS } from '../../../shared/events';


