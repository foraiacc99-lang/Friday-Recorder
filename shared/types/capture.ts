/**
 * Capture source types and data structures shared between Main, Preload, and Renderer.
 */

export type CaptureSourceType = 'screen' | 'window';

export interface DisplayBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface DisplayInfo {
  id: string | number;
  bounds: DisplayBounds;
  scaleFactor: number;
  isPrimary: boolean;
  label?: string;
}

export interface CaptureSource {
  id: string;
  name: string;
  type: CaptureSourceType;
  thumbnail: string; // Base64 data URL
  appIcon?: string | null;
  displayId?: string;
  displayInfo?: DisplayInfo;
}

export interface CaptureOptions {
  width?: number;
  height?: number;
  frameRate?: number;
}

export interface CaptureSessionInfo {
  sourceId: string;
  startedAt: number;
  options?: CaptureOptions;
}

export interface CaptureStatus {
  isCapturing: boolean;
  activeSourceId: string | null;
  startedAt: number | null;
}

export interface CaptureStartPayload {
  sourceId: string;
  options?: CaptureOptions;
}
