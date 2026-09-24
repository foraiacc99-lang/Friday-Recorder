import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '../../../shared/events';
import type {
  CaptureOptions,
  CaptureSessionInfo,
  CaptureSource,
  CaptureSourceType,
  CaptureStartPayload,
  CaptureStatus,
} from '../../../shared/types';
import { getCaptureProvider } from '../capture';
import { validateSenderFrame } from './appHandlers';

/**
 * Registers screen capture IPC handlers following the Phase 2 security pattern:
 * - Sender frame verification
 * - Strong payload validation
 * - Abstracted provider delegation
 */
export function registerCaptureHandlers(): void {
  const provider = getCaptureProvider();

  // capture:listSources
  ipcMain.handle(
    IPC_CHANNELS.CAPTURE.LIST_SOURCES,
    async (event, payload?: unknown): Promise<CaptureSource[]> => {
      validateSenderFrame(event.senderFrame);

      let types: CaptureSourceType[] = ['screen', 'window'];
      if (Array.isArray(payload)) {
        types = payload.filter((t): t is CaptureSourceType => t === 'screen' || t === 'window');
        if (types.length === 0) {
          types = ['screen', 'window'];
        }
      }

      return provider.listSources(types);
    }
  );

  // capture:start
  ipcMain.handle(
    IPC_CHANNELS.CAPTURE.START,
    async (event, payload?: unknown): Promise<CaptureSessionInfo> => {
      validateSenderFrame(event.senderFrame);

      if (!payload || typeof payload !== 'object') {
        throw new Error('Invalid capture:start payload: expected object');
      }

      const { sourceId, options } = payload as Partial<CaptureStartPayload>;

      if (!sourceId || typeof sourceId !== 'string') {
        throw new Error('Invalid capture:start payload: sourceId must be a non-empty string');
      }

      let sanitizedOptions: CaptureOptions | undefined;
      if (options && typeof options === 'object') {
        sanitizedOptions = {
          width: typeof options.width === 'number' ? options.width : undefined,
          height: typeof options.height === 'number' ? options.height : undefined,
          frameRate: typeof options.frameRate === 'number' ? options.frameRate : undefined,
        };
      }

      return provider.startCapture(sourceId, sanitizedOptions);
    }
  );

  // capture:stop
  ipcMain.handle(
    IPC_CHANNELS.CAPTURE.STOP,
    async (event): Promise<void> => {
      validateSenderFrame(event.senderFrame);
      return provider.stopCapture();
    }
  );

  // capture:getStatus
  ipcMain.handle(
    IPC_CHANNELS.CAPTURE.GET_STATUS,
    async (event): Promise<CaptureStatus> => {
      validateSenderFrame(event.senderFrame);
      return provider.getStatus();
    }
  );
}
