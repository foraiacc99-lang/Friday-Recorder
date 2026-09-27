import { app } from 'electron';
import fs from 'fs';
import os from 'os';
import path from 'path';
import crypto from 'crypto';

/**
 * Handles persistent cache directory management for media assets
 * per Friday Recorder Specification Section 20:
 * Documents/Friday Recorder/Cache/Thumbnails/
 */
export class MediaStorage {
  /**
   * Resolves the root Friday Recorder Documents directory:
   * Documents/Friday Recorder/
   */
  public static getFridayDocumentsDirectory(): string {
    let docsPath: string;
    try {
      docsPath = app.getPath('documents');
    } catch {
      const oneDriveDocs = path.join(os.homedir(), 'OneDrive', 'Documents');
      if (fs.existsSync(oneDriveDocs)) {
        docsPath = oneDriveDocs;
      } else {
        docsPath = path.join(os.homedir(), 'Documents');
      }
    }
    return path.join(docsPath, 'Friday Recorder');
  }

  /**
   * Resolves the cache directory per spec Section 20:
   * Documents/Friday Recorder/Cache/
   */
  public static getCacheDirectory(): string {
    return path.join(this.getFridayDocumentsDirectory(), 'Cache');
  }

  /**
   * Resolves the thumbnails cache directory:
   * Documents/Friday Recorder/Cache/Thumbnails/
   */
  public static getThumbnailsDirectory(): string {
    return path.join(this.getCacheDirectory(), 'Thumbnails');
  }

  /**
   * Ensures the thumbnails cache directory exists on disk and is writable.
   */
  public static ensureThumbnailsDirectory(): string {
    const dir = this.getThumbnailsDirectory();
    try {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.accessSync(dir, fs.constants.R_OK | fs.constants.W_OK);
      return dir;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // Fallback to app userData cache if Documents is locked
      const fallbackDir = path.join(app.getPath('userData'), 'Cache', 'Thumbnails');
      if (!fs.existsSync(fallbackDir)) {
        fs.mkdirSync(fallbackDir, { recursive: true });
      }
      console.warn(`[MediaStorage] Primary cache directory unavailable (${dir}): ${msg}. Using fallback: ${fallbackDir}`);
      return fallbackDir;
    }
  }

  /**
   * Generates a deterministic cache key / filename for a video thumbnail
   * based on file path, size, and last modified timestamp.
   */
  public static getThumbnailPathForMedia(filePath: string): string {
    const thumbnailsDir = this.ensureThumbnailsDirectory();
    let fileInfo = filePath;
    try {
      if (fs.existsSync(filePath)) {
        const stat = fs.statSync(filePath);
        fileInfo = `${filePath}_${stat.size}_${stat.mtimeMs}`;
      }
    } catch {
      // Fallback to filePath string if stat fails
    }

    const hash = crypto.createHash('sha256').update(fileInfo).digest('hex').substring(0, 16);
    const baseName = path.basename(filePath, path.extname(filePath)).replace(/[^a-zA-Z0-9_-]/g, '_');
    return path.join(thumbnailsDir, `thumb_${baseName}_${hash}.jpg`);
  }
}
