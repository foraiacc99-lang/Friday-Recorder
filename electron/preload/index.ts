import { contextBridge, ipcRenderer, webUtils } from 'electron';
import { IPC_CHANNELS } from '../../shared/events';
import type {
  AudioCaptureTarget,
  AudioDeviceInfo,
  AudioSessionInfo,
  AudioStartMicPayload,
  AudioStatus,
  AudioStopPayload,
  CaptureOptions,
  CaptureSessionInfo,
  CaptureSource,
  CaptureSourceType,
  CaptureStartPayload,
  CaptureStatus,
  FridayBridgeApi,
  ImportedMediaItem,
  MediaStatusCheckResult,
  RecordingOptions,
  RecordingSessionInfo,
  RecordingStatus,
  SavedRecordingResult,
} from '../../shared/types';

/**
 * Strongly typed IPC bridge exposed to the renderer context.
 * Raw ipcRenderer or Node modules are NEVER exposed to the renderer.
 */
const bridgeApi: FridayBridgeApi = {
  app: {
    getVersion: (): Promise<string> => ipcRenderer.invoke(IPC_CHANNELS.APP.GET_VERSION),
  },
  capture: {
    listSources: (types?: CaptureSourceType[]): Promise<CaptureSource[]> =>
      ipcRenderer.invoke(IPC_CHANNELS.CAPTURE.LIST_SOURCES, types),

    startCapture: (sourceId: string, options?: CaptureOptions): Promise<CaptureSessionInfo> => {
      const payload: CaptureStartPayload = { sourceId, options };
      return ipcRenderer.invoke(IPC_CHANNELS.CAPTURE.START, payload);
    },

    stopCapture: (): Promise<void> => ipcRenderer.invoke(IPC_CHANNELS.CAPTURE.STOP),

    getStatus: (): Promise<CaptureStatus> => ipcRenderer.invoke(IPC_CHANNELS.CAPTURE.GET_STATUS),
  },
  audio: {
    listMicrophones: (): Promise<AudioDeviceInfo[]> =>
      ipcRenderer.invoke(IPC_CHANNELS.AUDIO.LIST_MICROPHONES),

    startMicCapture: (deviceId?: string): Promise<AudioSessionInfo> => {
      const payload: AudioStartMicPayload = { deviceId };
      return ipcRenderer.invoke(IPC_CHANNELS.AUDIO.START_MIC, payload);
    },

    startSystemAudioCapture: (): Promise<AudioSessionInfo> =>
      ipcRenderer.invoke(IPC_CHANNELS.AUDIO.START_SYSTEM_AUDIO),

    stop: (target?: AudioCaptureTarget): Promise<void> => {
      const payload: AudioStopPayload = { target };
      return ipcRenderer.invoke(IPC_CHANNELS.AUDIO.STOP, payload);
    },

    getStatus: (): Promise<AudioStatus> => ipcRenderer.invoke(IPC_CHANNELS.AUDIO.GET_STATUS),
  },
  recording: {
    startRecording: (options: RecordingOptions): Promise<RecordingSessionInfo> =>
      ipcRenderer.invoke(IPC_CHANNELS.RECORDING.START, options),

    writeChunk: (sessionId: string, chunk: Uint8Array): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.RECORDING.WRITE_CHUNK, { sessionId, chunk }),

    stopRecording: (sessionId: string, durationMs: number): Promise<SavedRecordingResult> =>
      ipcRenderer.invoke(IPC_CHANNELS.RECORDING.STOP, { sessionId, durationMs }),

    pauseRecording: (sessionId: string): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.RECORDING.PAUSE, { sessionId }),

    resumeRecording: (sessionId: string): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.RECORDING.RESUME, { sessionId }),

    getStatus: (): Promise<RecordingStatus> =>
      ipcRenderer.invoke(IPC_CHANNELS.RECORDING.GET_STATUS),

    showInFolder: (filePath: string): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.RECORDING.SHOW_IN_FOLDER, { filePath }),
  },
  media: {
    importDialog: (): Promise<ImportedMediaItem[]> =>
      ipcRenderer.invoke(IPC_CHANNELS.MEDIA.IMPORT_DIALOG),

    importFile: (filePath: string): Promise<ImportedMediaItem> =>
      ipcRenderer.invoke(IPC_CHANNELS.MEDIA.IMPORT_PATH, { filePath }),

    list: (): Promise<ImportedMediaItem[]> =>
      ipcRenderer.invoke(IPC_CHANNELS.MEDIA.LIST),

    remove: (id: string): Promise<boolean> =>
      ipcRenderer.invoke(IPC_CHANNELS.MEDIA.REMOVE, { id }),

    checkStatus: (id: string): Promise<MediaStatusCheckResult> =>
      ipcRenderer.invoke(IPC_CHANNELS.MEDIA.CHECK_STATUS, { id }),

    getPathForFile: (file: File): string => {
      try {
        if (webUtils && typeof webUtils.getPathForFile === 'function') {
          return webUtils.getPathForFile(file);
        }
      } catch {
        // Fallback to legacy file.path if webUtils throws
      }
      return (file as unknown as { path?: string }).path || '';
    },

    getFileUrl: (filePath: string): string => {
      if (!filePath) return '';
      const normalized = filePath.replace(/\\/g, '/');
      return normalized.startsWith('/') ? `file://${normalized}` : `file:///${normalized}`;
    },
  },
};

contextBridge.exposeInMainWorld('friday', bridgeApi);
contextBridge.exposeInMainWorld('electronAPI', bridgeApi);

