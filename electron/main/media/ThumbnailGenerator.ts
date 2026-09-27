import { execFile } from 'child_process';
import fs from 'fs';
import path from 'path';
import { MediaStorage } from './MediaStorage';

export interface ThumbnailResult {
  thumbnailPath: string;
  thumbnailUrl: string;
}

/**
 * Asynchronously generates and caches video poster frame thumbnails using FFmpeg.
 * Operates completely off the renderer thread to prevent UI freezing.
 */
export class ThumbnailGenerator {
  /**
   * Generates a base64 data URI from a JPEG/PNG file on disk.
   */
  public static toDataUri(filePath: string): string {
    try {
      const buffer = fs.readFileSync(filePath);
      return `data:image/jpeg;base64,${buffer.toString('base64')}`;
    } catch {
      return '';
    }
  }

  /**
   * Generates or retrieves a cached 480x270 thumbnail for a video file.
   */
  public static async generate(filePath: string, durationSeconds: number): Promise<ThumbnailResult> {
    const resolvedPath = path.resolve(filePath);
    const thumbPath = MediaStorage.getThumbnailPathForMedia(resolvedPath);

    // 1. Check if cached thumbnail already exists and is valid
    if (fs.existsSync(thumbPath)) {
      try {
        const stat = fs.statSync(thumbPath);
        if (stat.size > 200) {
          return {
            thumbnailPath: thumbPath,
            thumbnailUrl: this.toDataUri(thumbPath),
          };
        }
      } catch {
        // Corrupted cache thumbnail, re-generate below
      }
    }

    // 2. Determine optimal seek timestamp (prefer 1.0s to avoid black leader frames, fallback for short clips)
    let seekSec = 1.0;
    if (durationSeconds > 0 && durationSeconds < 1.2) {
      seekSec = Math.max(0, durationSeconds * 0.2);
    } else if (durationSeconds <= 0) {
      seekSec = 0;
    }

    const seekStr = seekSec.toFixed(3);

    // 3. Run FFmpeg asynchronously with scaled 16:9 output and letterboxing
    const scaleFilter = 'scale=480:270:force_original_aspect_ratio=decrease,pad=480:270:(ow-iw)/2:(oh-ih)/2:black';

    const runFFmpeg = (seek: string): Promise<void> => {
      return new Promise<void>((resolve, reject) => {
        const args = [
          '-ss',
          seek,
          '-i',
          resolvedPath,
          '-frames:v',
          '1',
          '-vf',
          scaleFilter,
          '-q:v',
          '3',
          '-y',
          thumbPath,
        ];

        execFile('ffmpeg', args, { timeout: 15000 }, (error, _stdout, stderr) => {
          if (error) {
            reject(new Error(stderr || error.message));
          } else {
            resolve();
          }
        });
      });
    };

    try {
      await runFFmpeg(seekStr);
    } catch {
      // Fallback: If seeking ahead failed (e.g., unusual keyframe layout), try at t=0
      try {
        await runFFmpeg('0');
      } catch (fallbackErr) {
        console.warn(`[ThumbnailGenerator] Failed to generate thumbnail for ${resolvedPath}:`, fallbackErr);
        return {
          thumbnailPath: '',
          thumbnailUrl: '',
        };
      }
    }

    const dataUri = this.toDataUri(thumbPath);
    return {
      thumbnailPath: thumbPath,
      thumbnailUrl: dataUri,
    };
  }
}
