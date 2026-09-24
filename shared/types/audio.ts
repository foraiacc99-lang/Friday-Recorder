/**
 * Audio domain types for microphone and system audio capture.
 */

export interface AudioDeviceInfo {
  deviceId: string;
  label: string;
  groupId?: string;
  isDefault?: boolean;
}

export type AudioCaptureTarget = 'mic' | 'system' | 'all';

export interface AudioSessionInfo {
  type: 'mic' | 'system';
  deviceId?: string;
  startedAt: number;
}

export interface AudioStatus {
  isMicCapturing: boolean;
  activeMicDeviceId: string | null;
  micStartedAt: number | null;
  isSystemAudioCapturing: boolean;
  systemAudioStartedAt: number | null;
}

export interface AudioStartMicPayload {
  deviceId?: string;
}

export interface AudioStopPayload {
  target?: AudioCaptureTarget;
}
