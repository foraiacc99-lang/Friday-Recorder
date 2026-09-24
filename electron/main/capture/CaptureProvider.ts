import type {
  CaptureOptions,
  CaptureSessionInfo,
  CaptureSource,
  CaptureSourceType,
  CaptureStatus,
} from '../../../shared/types';

/**
 * Abstraction contract for platform-specific screen capture providers.
 */
export interface CaptureProvider {
  /**
   * Enumerates available capture sources (screens and windows) with thumbnails and metadata.
   */
  listSources(types?: CaptureSourceType[]): Promise<CaptureSource[]>;

  /**
   * Validates and registers an active capture session for the given source ID.
   */
  startCapture(sourceId: string, options?: CaptureOptions): Promise<CaptureSessionInfo>;

  /**
   * Stops the active capture session and releases associated capture resources.
   */
  stopCapture(): Promise<void>;

  /**
   * Returns current active capture status.
   */
  getStatus(): CaptureStatus;
}
