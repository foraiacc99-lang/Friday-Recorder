import type {
  AudioCaptureTarget,
  AudioDeviceInfo,
  AudioSessionInfo,
  AudioStatus,
} from '../../../shared/types';

/**
 * Abstraction contract for platform-specific audio capture providers.
 * Microphone capture and system audio capture are kept strictly separate concerns.
 */
export interface AudioProvider {
  /**
   * Enumerates available microphone input devices with human-readable labels.
   */
  listMicrophones(webContents?: Electron.WebContents): Promise<AudioDeviceInfo[]>;

  /**
   * Validates and registers an active microphone audio capture session.
   */
  startMicCapture(deviceId?: string): Promise<AudioSessionInfo>;

  /**
   * Validates and registers an active system (desktop loopback) audio capture session.
   */
  startSystemAudioCapture(): Promise<AudioSessionInfo>;

  /**
   * Stops active audio capture session(s) and releases associated resources.
   * Target can be 'mic', 'system', or 'all' (defaults to 'all').
   */
  stop(target?: AudioCaptureTarget): Promise<void>;

  /**
   * Returns current active audio capture status for both microphone and system audio.
   */
  getStatus(): AudioStatus;
}
