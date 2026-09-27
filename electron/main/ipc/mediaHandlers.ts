import { BrowserWindow, ipcMain } from 'electron';
import { IPC_CHANNELS } from '../../../shared/events';
import type {
  ImportedMediaItem,
  MediaCheckStatusPayload,
  MediaImportPathPayload,
  MediaRemovePayload,
  MediaStatusCheckResult,
} from '../../../shared/types';
import { getMediaImportService } from '../media';
import { validateSenderFrame } from './appHandlers';

/**
 * Registers media import IPC handlers following established security patterns:
 * - Sender frame verification
 * - Strong payload validation & sanitization
 * - Abstracted service delegation
 */
export function registerMediaHandlers(): void {
  const service = getMediaImportService();

  // media:importDialog
  ipcMain.handle(
    IPC_CHANNELS.MEDIA.IMPORT_DIALOG,
    async (event): Promise<ImportedMediaItem[]> => {
      validateSenderFrame(event.senderFrame);
      const parentWindow = BrowserWindow.fromWebContents(event.sender) || undefined;
      return service.importFilesViaDialog(parentWindow);
    }
  );

  // media:importPath
  ipcMain.handle(
    IPC_CHANNELS.MEDIA.IMPORT_PATH,
    async (event, payload?: unknown): Promise<ImportedMediaItem> => {
      validateSenderFrame(event.senderFrame);

      if (!payload || typeof payload !== 'object') {
        throw new Error('Invalid media:importPath payload: expected object');
      }

      const raw = payload as Partial<MediaImportPathPayload>;
      if (!raw.filePath || typeof raw.filePath !== 'string' || raw.filePath.trim().length === 0) {
        throw new Error('Invalid media:importPath payload: filePath must be a non-empty string');
      }

      return service.importFile(raw.filePath.trim());
    }
  );

  // media:list
  ipcMain.handle(
    IPC_CHANNELS.MEDIA.LIST,
    async (event): Promise<ImportedMediaItem[]> => {
      validateSenderFrame(event.senderFrame);
      return service.list();
    }
  );

  // media:remove
  ipcMain.handle(
    IPC_CHANNELS.MEDIA.REMOVE,
    async (event, payload?: unknown): Promise<boolean> => {
      validateSenderFrame(event.senderFrame);

      if (!payload || typeof payload !== 'object') {
        throw new Error('Invalid media:remove payload: expected object');
      }

      const raw = payload as Partial<MediaRemovePayload>;
      if (!raw.id || typeof raw.id !== 'string') {
        throw new Error('Invalid media:remove payload: id must be a string');
      }

      return service.remove(raw.id);
    }
  );

  // media:checkStatus
  ipcMain.handle(
    IPC_CHANNELS.MEDIA.CHECK_STATUS,
    async (event, payload?: unknown): Promise<MediaStatusCheckResult> => {
      validateSenderFrame(event.senderFrame);

      if (!payload || typeof payload !== 'object') {
        throw new Error('Invalid media:checkStatus payload: expected object');
      }

      const raw = payload as Partial<MediaCheckStatusPayload>;
      if (!raw.id || typeof raw.id !== 'string') {
        throw new Error('Invalid media:checkStatus payload: id must be a string');
      }

      return service.checkStatus(raw.id);
    }
  );
}
