import { app } from 'electron';
import fs from 'fs';
import os from 'os';
import path from 'path';

export const DEFAULT_MIN_FREE_DISK_BYTES = 100 * 1024 * 1024; // 100 MB minimum threshold

export interface PreparedOutputFile {
  directory: string;
  fileName: string;
  filePath: string;
}

export class RecordingStorage {
  public static getMinFreeDiskBytes(): number {
    if (process.env.FRIDAY_MIN_FREE_DISK_BYTES) {
      const val = parseInt(process.env.FRIDAY_MIN_FREE_DISK_BYTES, 10);
      if (!isNaN(val) && val > 0) return val;
    }
    return DEFAULT_MIN_FREE_DISK_BYTES;
  }

  /**
   * Resolves the standard storage directory per spec Section 20:
   * Documents/Friday Recorder/Recordings/
   */
  public static getRecordingsDirectory(): string {
    let docsPath: string;
    try {
      docsPath = app.getPath('documents');
    } catch {
      docsPath = path.join(os.homedir(), 'Documents');
    }
    return path.join(docsPath, 'Friday Recorder', 'Recordings');
  }

  /**
   * Ensures the recordings directory exists, checking write permissions.
   */
  public static ensureRecordingsDirectory(customDir?: string): string {
    const dir = customDir || this.getRecordingsDirectory();
    try {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      // Verify directory is writable
      fs.accessSync(dir, fs.constants.W_OK | fs.constants.R_OK);
      return dir;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`Output directory is not accessible or writable (${dir}): ${msg}`);
    }
  }

  /**
   * Checks available free disk space on the volume hosting the recordings directory.
   */
  public static checkDiskSpace(dirPath: string, requiredBytes: number = this.getMinFreeDiskBytes()): { freeBytes: number; totalBytes: number } {
    try {
      const stats = fs.statfsSync(dirPath);
      const freeBytes = stats.bavail * stats.bsize;
      const totalBytes = stats.blocks * stats.bsize;

      if (freeBytes < requiredBytes) {
        const freeMB = Math.round(freeBytes / (1024 * 1024));
        const requiredMB = Math.round(requiredBytes / (1024 * 1024));
        throw new Error(
          `Insufficient disk space: At least ${requiredMB} MB of free storage is required to record video. Only ${freeMB} MB available.`
        );
      }

      return { freeBytes, totalBytes };
    } catch (err) {
      if (err instanceof Error && err.message.includes('Insufficient disk space')) {
        throw err;
      }
      // If statfs is not supported on rare mounts, log warning but do not block recording
      console.warn('[RecordingStorage] Could not query disk space via statfs:', err);
      return { freeBytes: Number.MAX_SAFE_INTEGER, totalBytes: Number.MAX_SAFE_INTEGER };
    }
  }

  /**
   * Generates a collision-safe timestamped filename:
   * Friday_Recording_YYYY-MM-DD_HH-mm-ss.webm
   */
  public static generateFileName(now: Date = new Date()): string {
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');

    return `Friday_Recording_${year}-${month}-${day}_${hours}-${minutes}-${seconds}.webm`;
  }

  /**
   * Prepares the output destination: ensures directory, checks disk space,
   * and returns verified file paths.
   */
  public static prepareOutputFile(customDir?: string): PreparedOutputFile {
    const directory = this.ensureRecordingsDirectory(customDir);
    this.checkDiskSpace(directory);

    let fileName = this.generateFileName();
    let filePath = path.join(directory, fileName);

    // Collision avoidance
    if (fs.existsSync(filePath)) {
      const uniqueSuffix = Date.now().toString().slice(-4);
      fileName = fileName.replace('.webm', `_${uniqueSuffix}.webm`);
      filePath = path.join(directory, fileName);
    }

    return { directory, fileName, filePath };
  }
}
