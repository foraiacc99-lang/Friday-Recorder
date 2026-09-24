import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '../../../shared/events';
import type {
  AudioCaptureTarget,
  AudioDeviceInfo,
  AudioSessionInfo,
  AudioStartMicPayload,
  AudioStatus,
  AudioStopPayload,
} from '../../../shared/types';
import { getAudioProvider } from '../audio';
import { validateSenderFrame } from './appHandlers';

/**
 * Registers audio capture IPC handlers following the security patterns:
 * - Sender frame verification
 * - Strong payload validation
 * - Abstracted provider delegation
 */
export function registerAudioHandlers(): void {
  const provider = getAudioProvider();

  // audio:listMicrophones
  ipcMain.handle(
    IPC_CHANNELS.AUDIO.LIST_MICROPHONES,
    async (event): Promise<AudioDeviceInfo[]> => {
      validateSenderFrame(event.senderFrame);
      return provider.listMicrophones(event.sender);
    }
  );

  // audio:startMic
  ipcMain.handle(
    IPC_CHANNELS.AUDIO.START_MIC,
    async (event, payload?: unknown): Promise<AudioSessionInfo> => {
      validateSenderFrame(event.senderFrame);

      let deviceId: string | undefined;
      if (payload && typeof payload === 'object') {
        const castPayload = payload as Partial<AudioStartMicPayload>;
        if (typeof castPayload.deviceId === 'string') {
          deviceId = castPayload.deviceId;
        }
      }

      return provider.startMicCapture(deviceId);
    }
  );

  // audio:startSystemAudio
  ipcMain.handle(
    IPC_CHANNELS.AUDIO.START_SYSTEM_AUDIO,
    async (event): Promise<AudioSessionInfo> => {
      validateSenderFrame(event.senderFrame);
      return provider.startSystemAudioCapture();
    }
  );

  // audio:stop
  ipcMain.handle(
    IPC_CHANNELS.AUDIO.STOP,
    async (event, payload?: unknown): Promise<void> => {
      validateSenderFrame(event.senderFrame);

      let target: AudioCaptureTarget = 'all';
      if (payload && typeof payload === 'object') {
        const castPayload = payload as Partial<AudioStopPayload>;
        if (
          castPayload.target === 'mic' ||
          castPayload.target === 'system' ||
          castPayload.target === 'all'
        ) {
          target = castPayload.target;
        }
      }

      return provider.stop(target);
    }
  );

  // audio:getStatus
  ipcMain.handle(
    IPC_CHANNELS.AUDIO.GET_STATUS,
    async (event): Promise<AudioStatus> => {
      validateSenderFrame(event.senderFrame);
      return provider.getStatus();
    }
  );
}
