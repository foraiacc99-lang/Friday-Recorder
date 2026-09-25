import { RecordingService } from './RecordingService';

let recordingServiceInstance: RecordingService | null = null;

/**
 * Returns the singleton instance of RecordingService.
 */
export function getRecordingService(): RecordingService {
  if (!recordingServiceInstance) {
    recordingServiceInstance = new RecordingService();
  }
  return recordingServiceInstance;
}

export * from './RecordingService';
export * from './RecordingStorage';
export * from './WebmPatcher';
