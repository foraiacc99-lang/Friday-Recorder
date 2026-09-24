import { app, BrowserWindow, systemPreferences } from 'electron';
import type {
  AudioCaptureTarget,
  AudioDeviceInfo,
  AudioSessionInfo,
  AudioStatus,
} from '../../../shared/types';
import type { AudioProvider } from './AudioProvider';

/**
 * Concrete Windows implementation of AudioProvider.
 * Handles microphone session tracking, system audio session tracking,
 * device enumeration, Windows permission checks, and graceful lifecycle cleanup.
 */
export class WindowsAudioProvider implements AudioProvider {
  private activeMicSession: AudioSessionInfo | null = null;
  private activeSystemAudioSession: AudioSessionInfo | null = null;
  private cachedMicrophones: AudioDeviceInfo[] = [];
  private isCleanupRegistered = false;

  constructor() {
    this.registerProcessCleanup();
  }

  /**
   * Registers app-level lifecycle hooks to ensure all active audio sessions
   * are terminated cleanly on app quit without leaving orphaned handles.
   */
  private registerProcessCleanup(): void {
    if (this.isCleanupRegistered) return;
    this.isCleanupRegistered = true;

    app.on('before-quit', () => {
      this.stop('all').catch((err) => {
        console.error('[WindowsAudioProvider] Error stopping audio during before-quit:', err);
      });
    });
  }

  /**
   * Enumerates available microphone devices.
   * If webContents is available, queries Chromium's CoreAudio device list directly.
   * Caches results and falls back to cached/default devices if webContents is not ready.
   */
  public async listMicrophones(webContents?: Electron.WebContents): Promise<AudioDeviceInfo[]> {
    try {
      let targetWebContents = webContents;
      if (!targetWebContents) {
        const allWindows = BrowserWindow.getAllWindows();
        const activeWin = BrowserWindow.getFocusedWindow() || allWindows[0];
        if (activeWin && !activeWin.isDestroyed()) {
          targetWebContents = activeWin.webContents;
        }
      }

      if (targetWebContents && !targetWebContents.isDestroyed()) {
        const devices = (await targetWebContents.executeJavaScript(`
          (async () => {
            if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
              return [];
            }
            const allDevices = await navigator.mediaDevices.enumerateDevices();
            return allDevices
              .filter((d) => d.kind === 'audioinput')
              .map((d) => ({
                deviceId: d.deviceId,
                label: d.label || 'Default Microphone',
                groupId: d.groupId || undefined,
                isDefault: d.deviceId === 'default',
              }));
          })()
        `)) as AudioDeviceInfo[];

        if (Array.isArray(devices) && devices.length > 0) {
          this.cachedMicrophones = devices;
          return devices;
        }
      }

      // Return cached devices if available
      if (this.cachedMicrophones.length > 0) {
        return this.cachedMicrophones;
      }

      // Default fallback
      return [
        {
          deviceId: 'default',
          label: 'Default Microphone',
          isDefault: true,
        },
      ];
    } catch (err) {
      console.warn('[WindowsAudioProvider] listMicrophones encountered error, returning fallback:', err);
      return this.cachedMicrophones.length > 0
        ? this.cachedMicrophones
        : [
            {
              deviceId: 'default',
              label: 'Default Microphone',
              isDefault: true,
            },
          ];
    }
  }

  /**
   * Validates and starts a microphone capture session.
   * Checks Windows microphone privacy settings to provide clear guidance if access is blocked.
   */
  public async startMicCapture(deviceId?: string): Promise<AudioSessionInfo> {
    // Check Windows microphone permission status
    try {
      if (process.platform === 'win32' && typeof systemPreferences.getMediaAccessStatus === 'function') {
        const status = systemPreferences.getMediaAccessStatus('microphone');
        if (status === 'denied') {
          throw new Error(
            'Microphone access is denied by Windows Privacy Settings. ' +
              'Please open Windows Settings > Privacy & security > Microphone, ' +
              'and ensure "Let desktop apps access your microphone" is turned ON.'
          );
        }
      }
    } catch (permErr) {
      if (permErr instanceof Error && permErr.message.includes('Windows Privacy Settings')) {
        throw permErr;
      }
      // Non-fatal if systemPreferences check is unavailable
    }

    if (deviceId && typeof deviceId !== 'string') {
      throw new Error('Invalid microphone deviceId: expected string');
    }

    // Stop any existing mic session before starting a new one
    if (this.activeMicSession) {
      await this.stop('mic');
    }

    const session: AudioSessionInfo = {
      type: 'mic',
      deviceId: deviceId || 'default',
      startedAt: Date.now(),
    };

    this.activeMicSession = session;
    return session;
  }

  /**
   * Validates and registers an active system (desktop loopback) audio capture session.
   */
  public async startSystemAudioCapture(): Promise<AudioSessionInfo> {
    // Stop any existing system audio session before starting a new one
    if (this.activeSystemAudioSession) {
      await this.stop('system');
    }

    const session: AudioSessionInfo = {
      type: 'system',
      startedAt: Date.now(),
    };

    this.activeSystemAudioSession = session;
    return session;
  }

  /**
   * Stops active audio capture session(s) and releases associated resources.
   */
  public async stop(target: AudioCaptureTarget = 'all'): Promise<void> {
    if (target === 'mic' || target === 'all') {
      this.activeMicSession = null;
    }
    if (target === 'system' || target === 'all') {
      this.activeSystemAudioSession = null;
    }
  }

  /**
   * Returns current active audio capture status for both microphone and system audio.
   */
  public getStatus(): AudioStatus {
    return {
      isMicCapturing: this.activeMicSession !== null,
      activeMicDeviceId: this.activeMicSession ? this.activeMicSession.deviceId ?? null : null,
      micStartedAt: this.activeMicSession ? this.activeMicSession.startedAt : null,
      isSystemAudioCapturing: this.activeSystemAudioSession !== null,
      systemAudioStartedAt: this.activeSystemAudioSession ? this.activeSystemAudioSession.startedAt : null,
    };
  }
}
