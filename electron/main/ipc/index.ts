import { registerAppHandlers } from './appHandlers';
import { registerCaptureHandlers } from './captureHandlers';
import { registerAudioHandlers } from './audioHandlers';
import { registerRecordingHandlers } from './recordingHandlers';
import { registerMediaHandlers } from './mediaHandlers';

/**
 * Central registry for all IPC handlers.
 */
export function registerIpcHandlers(): void {
  registerAppHandlers();
  registerCaptureHandlers();
  registerAudioHandlers();
  registerRecordingHandlers();
  registerMediaHandlers();
}

export * from './appHandlers';
export * from './captureHandlers';
export * from './audioHandlers';
export * from './recordingHandlers';
export * from './mediaHandlers';
export { IPC_CHANNELS } from '../../../shared/events';


