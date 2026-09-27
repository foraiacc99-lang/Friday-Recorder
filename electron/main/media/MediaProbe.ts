import { execFile } from 'child_process';
import fs from 'fs';
import path from 'path';
import type { VideoMetadata } from '../../../shared/types';

export const SUPPORTED_VIDEO_EXTENSIONS = ['.webm', '.mp4', '.mov', '.mkv'];

interface FFprobeStream {
  index: number;
  codec_name?: string;
  codec_type?: string;
  width?: number;
  height?: number;
  r_frame_rate?: string;
  avg_frame_rate?: string;
  duration?: string;
  sample_rate?: string;
  channels?: number;
  nb_frames?: string;
}

interface FFprobeFormat {
  filename?: string;
  format_name?: string;
  duration?: string;
  size?: string;
  bit_rate?: string;
}

interface FFprobeResult {
  streams?: FFprobeStream[];
  format?: FFprobeFormat;
}

/**
 * Validates and extracts technical metadata from video files using ffprobe.
 */
export class MediaProbe {
  /**
   * Checks if a given file extension is supported for import in Phase 6.
   */
  public static isSupportedExtension(filePath: string): boolean {
    const ext = path.extname(filePath).toLowerCase();
    return SUPPORTED_VIDEO_EXTENSIONS.includes(ext);
  }

  /**
   * Parses an FFmpeg frame rate fraction (e.g., "60/1" or "30000/1001") into a decimal number.
   */
  private static parseFrameRate(rateStr?: string): number {
    if (!rateStr || rateStr === '0/0' || rateStr === 'N/A') return 0;
    const parts = rateStr.split('/');
    const p0 = parts[0];
    const p1 = parts[1];
    if (parts.length === 2 && p0 !== undefined && p1 !== undefined) {
      const num = parseFloat(p0);
      const den = parseFloat(p1);
      if (den > 0) {
        return Math.round((num / den) * 100) / 100;
      }
    }
    const val = parseFloat(rateStr);
    return isNaN(val) ? 0 : Math.round(val * 100) / 100;
  }

  /**
   * Executes ffprobe asynchronously to extract metadata from a video file.
   */
  public static async probe(filePath: string): Promise<VideoMetadata> {
    const resolvedPath = path.resolve(filePath);

    // 1. Filesystem existence & permission checks
    if (!fs.existsSync(resolvedPath)) {
      throw new Error(`File does not exist: "${resolvedPath}"`);
    }

    try {
      fs.accessSync(resolvedPath, fs.constants.R_OK);
    } catch {
      throw new Error(`File is not readable or permission was denied: "${resolvedPath}"`);
    }

    const stat = fs.statSync(resolvedPath);
    if (stat.size === 0) {
      throw new Error(`Cannot import empty file: "${path.basename(resolvedPath)}" is 0 bytes.`);
    }

    // 2. Extension validation check
    if (!this.isSupportedExtension(resolvedPath)) {
      const ext = path.extname(resolvedPath).toLowerCase() || '(no extension)';
      throw new Error(
        `Unsupported video format "${ext}". Supported formats are: ${SUPPORTED_VIDEO_EXTENSIONS.join(', ')}.`
      );
    }

    // 3. Run ffprobe asynchronously
    const probeData = await new Promise<FFprobeResult>((resolve, reject) => {
      const args = [
        '-v',
        'error',
        '-show_format',
        '-show_streams',
        '-of',
        'json',
        resolvedPath,
      ];

      execFile('ffprobe', args, { timeout: 15000 }, (error, stdout, stderr) => {
        if (error) {
          const detail = stderr || error.message;
          reject(
            new Error(
              `Cannot import corrupted or unreadable video file "${path.basename(resolvedPath)}": ${detail.trim()}`
            )
          );
          return;
        }

        try {
          const parsed = JSON.parse(stdout) as FFprobeResult;
          resolve(parsed);
        } catch {
          reject(
            new Error(`Failed to parse ffprobe metadata output for "${path.basename(resolvedPath)}".`)
          );
        }
      });
    });

    const streams = probeData.streams || [];
    const format = probeData.format || {};

    // 4. Validate that a video stream exists
    const videoStream = streams.find((s) => s.codec_type === 'video');
    if (!videoStream) {
      throw new Error(
        `Cannot import non-video file "${path.basename(resolvedPath)}": No video stream was detected in the file container.`
      );
    }

    // 5. Extract video properties
    const width = videoStream.width || 0;
    const height = videoStream.height || 0;
    const videoCodec = videoStream.codec_name || 'unknown';

    let fps = this.parseFrameRate(videoStream.avg_frame_rate);
    if (fps <= 0 || fps > 240) {
      const rFps = this.parseFrameRate(videoStream.r_frame_rate);
      if (rFps > 0 && rFps <= 240) {
        fps = rFps;
      } else if (videoStream.nb_frames) {
        const nb = parseInt(videoStream.nb_frames, 10);
        if (!isNaN(nb) && nb > 0 && format.duration) {
          const dur = parseFloat(format.duration);
          if (dur > 0) {
            fps = Math.round((nb / dur) * 100) / 100;
          }
        }
      }
      // WebM streaming timebase artifact (1000 fps) fallback to standard 60 FPS
      if (fps > 240 || fps <= 0) {
        fps = 60;
      }
    }

    // Duration extraction with fallback from stream to container format
    let durationSeconds = 0;
    if (videoStream.duration && videoStream.duration !== 'N/A') {
      durationSeconds = parseFloat(videoStream.duration);
    } else if (format.duration && format.duration !== 'N/A') {
      durationSeconds = parseFloat(format.duration);
    }
    if (isNaN(durationSeconds)) {
      durationSeconds = 0;
    }
    durationSeconds = Math.round(durationSeconds * 100) / 100;

    // 6. Extract audio stream properties if present
    const audioStream = streams.find((s) => s.codec_type === 'audio');
    const audioCodec = audioStream?.codec_name || null;
    const audioChannels = audioStream?.channels || 0;
    const audioSampleRate = audioStream?.sample_rate ? parseInt(audioStream.sample_rate, 10) : 0;

    const containerFormat = format.format_name || path.extname(resolvedPath).replace('.', '');
    const bitRate = format.bit_rate ? parseInt(format.bit_rate, 10) : 0;

    return {
      durationSeconds,
      width,
      height,
      fps,
      videoCodec,
      audioCodec,
      audioChannels,
      audioSampleRate,
      containerFormat,
      bitRate,
    };
  }
}
