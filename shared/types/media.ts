/**
 * Extracted media metadata for an imported video file.
 */
export interface VideoMetadata {
  durationSeconds: number;
  width: number;
  height: number;
  fps: number;
  videoCodec: string;
  audioCodec: string | null;
  audioChannels: number;
  audioSampleRate: number;
  containerFormat: string;
  bitRate: number;
}

/**
 * An imported media item registered in the Friday Recorder Media Library.
 * Per spec Section 20, this stores a reference to the source file on disk
 * and NEVER copies or duplicates the file into application data.
 */
export interface ImportedMediaItem {
  id: string;
  filePath: string;
  fileName: string;
  fileSizeBytes: number;
  metadata: VideoMetadata;
  thumbnailPath: string;
  thumbnailUrl: string;
  importedAt: string;
  isAvailable: boolean;
}

/**
 * Result of checking availability of an imported file on disk.
 */
export interface MediaStatusCheckResult {
  id: string;
  filePath: string;
  exists: boolean;
  fileSizeBytes?: number;
  lastModified?: string;
  error?: string;
}

/**
 * Payload for importing a file by direct path.
 */
export interface MediaImportPathPayload {
  filePath: string;
}

/**
 * Payload for removing an item from the media library.
 */
export interface MediaRemovePayload {
  id: string;
}

/**
 * Payload for checking the disk existence of an imported media item.
 */
export interface MediaCheckStatusPayload {
  id: string;
}
