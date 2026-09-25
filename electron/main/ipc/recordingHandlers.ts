import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '../../../shared/events';
import type {
  RecordingFps,
  RecordingOptions,
  RecordingResolution,
  RecordingSessionInfo,
  RecordingStatus,
  RecordingStopPayload,
  SavedRecordingResult,
} from '../../../shared/types';
import { getRecordingService } from '../recording';
import { validateSenderFrame } from './appHandlers';

/**
 * Registers recording IPC handlers following established security patterns:
 * - Sender frame verification
 * - Strong payload validation
 * - Abstracted service delegation
 */
export function registerRecordingHandlers(): void {
  const service = getRecordingService();

  // recording:start
  ipcMain.handle(
    IPC_CHANNELS.RECORDING.START,
    async (event, payload?: unknown): Promise<RecordingSessionInfo> => {
      validateSenderFrame(event.senderFrame);

      if (!payload || typeof payload !== 'object') {
        throw new Error('Invalid recording:start payload: expected object');
      }

      const raw = payload as Partial<RecordingOptions>;
      if (!raw.sourceId || typeof raw.sourceId !== 'string') {
        throw new Error('Invalid recording:start payload: sourceId must be a non-empty string');
      }

      const resolution: RecordingResolution = raw.resolution === '720p' ? '720p' : '1080p';
      const fps: RecordingFps = raw.fps === 30 ? 30 : 60;
      const micEnabled = Boolean(raw.micEnabled);
      const systemAudioEnabled = Boolean(raw.systemAudioEnabled);

      const sanitizedOptions: RecordingOptions = {
        sourceId: raw.sourceId,
        sourceName: typeof raw.sourceName === 'string' ? raw.sourceName : undefined,
        resolution,
        fps,
        micEnabled,
        micDeviceId: typeof raw.micDeviceId === 'string' ? raw.micDeviceId : undefined,
        systemAudioEnabled,
        webcamEnabled: false, // Webcam capture deferred to Phase 13
      };

      return service.startRecording(sanitizedOptions);
    }
  );

  // recording:writeChunk
  ipcMain.handle(
    IPC_CHANNELS.RECORDING.WRITE_CHUNK,
    async (event, payload?: unknown): Promise<void> => {
      validateSenderFrame(event.senderFrame);

      if (!payload || typeof payload !== 'object') {
        throw new Error('Invalid recording:writeChunk payload: expected object');
      }

      const { sessionId, chunk } = payload as { sessionId?: unknown; chunk?: unknown };
      if (!sessionId || typeof sessionId !== 'string') {
        throw new Error('Invalid recording:writeChunk payload: sessionId must be a string');
      }

      if (!chunk || (!(chunk instanceof Uint8Array) && !Buffer.isBuffer(chunk))) {
        throw new Error('Invalid recording:writeChunk payload: chunk must be a Buffer or Uint8Array');
      }

      return service.writeChunk(sessionId, chunk);
    }
  );

  // recording:stop
  ipcMain.handle(
    IPC_CHANNELS.RECORDING.STOP,
    async (event, payload?: unknown): Promise<SavedRecordingResult> => {
      validateSenderFrame(event.senderFrame);

      if (!payload || typeof payload !== 'object') {
        throw new Error('Invalid recording:stop payload: expected object');
      }

      const { sessionId, durationMs } = payload as Partial<RecordingStopPayload>;
      if (!sessionId || typeof sessionId !== 'string') {
        throw new Error('Invalid recording:stop payload: sessionId must be a string');
      }

      const resolvedDuration = typeof durationMs === 'number' && durationMs > 0 ? durationMs : 0;
      return service.stopRecording(sessionId, resolvedDuration);
    }
  );

  // recording:pause
  ipcMain.handle(
    IPC_CHANNELS.RECORDING.PAUSE,
    async (event, payload?: unknown): Promise<void> => {
      validateSenderFrame(event.senderFrame);

      if (!payload || typeof payload !== 'object') {
        throw new Error('Invalid recording:pause payload: expected object');
      }

      const { sessionId } = payload as { sessionId?: unknown };
      if (!sessionId || typeof sessionId !== 'string') {
        throw new Error('Invalid recording:pause payload: sessionId must be a string');
      }

      return service.pauseRecording(sessionId);
    }
  );

  // recording:resume
  ipcMain.handle(
    IPC_CHANNELS.RECORDING.RESUME,
    async (event, payload?: unknown): Promise<void> => {
      validateSenderFrame(event.senderFrame);

      if (!payload || typeof payload !== 'object') {
        throw new Error('Invalid recording:resume payload: expected object');
      }

      const { sessionId } = payload as { sessionId?: unknown };
      if (!sessionId || typeof sessionId !== 'string') {
        throw new Error('Invalid recording:resume payload: sessionId must be a string');
      }

      return service.resumeRecording(sessionId);
    }
  );

  // recording:getStatus
  ipcMain.handle(
    IPC_CHANNELS.RECORDING.GET_STATUS,
    async (event): Promise<RecordingStatus> => {
      validateSenderFrame(event.senderFrame);
      return service.getStatus();
    }
  );

  // recording:showInFolder
  ipcMain.handle(
    IPC_CHANNELS.RECORDING.SHOW_IN_FOLDER,
    async (event, payload?: unknown): Promise<void> => {
      validateSenderFrame(event.senderFrame);

      if (!payload || typeof payload !== 'object') {
        throw new Error('Invalid recording:showInFolder payload: expected object');
      }

      const { filePath } = payload as { filePath?: unknown };
      if (!filePath || typeof filePath !== 'string') {
        throw new Error('Invalid recording:showInFolder payload: filePath must be a string');
      }

      return service.showInFolder(filePath);
    }
  );
}
