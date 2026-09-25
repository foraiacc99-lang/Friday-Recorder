import { app, shell } from 'electron';
import fs from 'fs';
import type {
  RecordingOptions,
  RecordingResolution,
  RecordingSessionInfo,
  RecordingState,
  RecordingStatus,
  SavedRecordingResult,
} from '../../../shared/types';
import { getCaptureProvider, type CaptureProvider } from '../capture';
import { getAudioProvider, type AudioProvider } from '../audio';
import { RecordingStorage, type PreparedOutputFile } from './RecordingStorage';
import { WebmPatcher } from './WebmPatcher';

interface ActiveRecordingSession {
  sessionId: string;
  options: RecordingOptions;
  startedAt: number;
  output: PreparedOutputFile;
  writeStream: fs.WriteStream | null;
  bytesWritten: number;
  isPaused: boolean;
}

export class RecordingService {
  private captureProvider: CaptureProvider;
  private audioProvider: AudioProvider;

  private state: RecordingState = 'idle';
  private activeSession: ActiveRecordingSession | null = null;
  private lastSavedResult: SavedRecordingResult | null = null;
  private currentError: string | null = null;
  private isCleanupRegistered = false;

  constructor(captureProvider?: CaptureProvider, audioProvider?: AudioProvider) {
    this.captureProvider = captureProvider || getCaptureProvider();
    this.audioProvider = audioProvider || getAudioProvider();
    this.registerProcessCleanup();
  }

  /**
   * Registers app-level lifecycle hooks to ensure recordings in progress
   * are cleanly flushed and closed on app quit without corrupting files.
   */
  private registerProcessCleanup(): void {
    if (this.isCleanupRegistered) return;
    this.isCleanupRegistered = true;

    app.on('before-quit', () => {
      if (this.activeSession && this.activeSession.writeStream) {
        console.log('[RecordingService] Flushing active recording stream on before-quit...');
        try {
          this.activeSession.writeStream.end();
        } catch (e) {
          console.error('[RecordingService] Error ending writeStream on quit:', e);
        }
        void this.captureProvider.stopCapture();
        void this.audioProvider.stop('all');
        this.activeSession = null;
        this.state = 'idle';
      }
    });
  }

  /**
   * Translates human resolution and fps into dimensions.
   */
  private resolveDimensions(res: RecordingResolution): { width: number; height: number } {
    if (res === '720p') {
      return { width: 1280, height: 720 };
    }
    return { width: 1920, height: 1080 };
  }

  /**
   * Initiates a recording session.
   * Prepares storage, starts capture provider and audio provider collaborators,
   * opens disk write stream, and tracks session state.
   */
  public async startRecording(options: RecordingOptions): Promise<RecordingSessionInfo> {
    if (this.state === 'recording' || this.state === 'paused' || this.state === 'stopping') {
      throw new Error(`Cannot start recording: session is already active in state '${this.state}'`);
    }

    this.currentError = null;
    const { width, height } = this.resolveDimensions(options.resolution);

    // 1. Prepare storage destination and verify disk space
    const output = RecordingStorage.prepareOutputFile();

    // 2. Coordinate with CaptureProvider (Phase 3 collaborator)
    try {
      await this.captureProvider.startCapture(options.sourceId, {
        width,
        height,
        frameRate: options.fps,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.state = 'error';
      this.currentError = `Failed to start screen capture: ${msg}`;
      throw new Error(this.currentError);
    }

    // 3. Coordinate with AudioProvider (Phase 4 collaborator)
    try {
      if (options.micEnabled) {
        await this.audioProvider.startMicCapture(options.micDeviceId);
      }
      if (options.systemAudioEnabled) {
        await this.audioProvider.startSystemAudioCapture();
      }
    } catch (audioErr) {
      // If audio fails, stop screen capture to prevent orphaned sessions
      await this.captureProvider.stopCapture();
      const msg = audioErr instanceof Error ? audioErr.message : String(audioErr);
      this.state = 'error';
      this.currentError = `Failed to initialize audio capture: ${msg}`;
      throw new Error(this.currentError);
    }

    // 4. Open file write stream
    let writeStream: fs.WriteStream;
    try {
      writeStream = fs.createWriteStream(output.filePath, { flags: 'w' });
      writeStream.on('error', (err) => {
        console.error('[RecordingService] File write stream error:', err);
        this.currentError = `File write error: ${err.message}`;
        this.state = 'error';
      });
    } catch (err) {
      await this.captureProvider.stopCapture();
      await this.audioProvider.stop('all');
      const msg = err instanceof Error ? err.message : String(err);
      this.state = 'error';
      this.currentError = `Could not open output file for writing: ${msg}`;
      throw new Error(this.currentError);
    }

    const sessionId = `rec_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const startedAt = Date.now();

    this.activeSession = {
      sessionId,
      options,
      startedAt,
      output,
      writeStream,
      bytesWritten: 0,
      isPaused: false,
    };

    this.state = 'recording';

    return {
      sessionId,
      state: 'recording',
      startedAt,
      outputPath: output.filePath,
      fileName: output.fileName,
      options,
    };
  }

  /**
   * Appends an encoded media chunk to the disk file.
   */
  public async writeChunk(sessionId: string, chunk: Buffer | Uint8Array): Promise<void> {
    if (!this.activeSession || this.activeSession.sessionId !== sessionId) {
      if (this.state === 'stopping' || this.state === 'saved') {
        // Trailing chunk from MediaRecorder arriving after session stop — ignore cleanly
        return;
      }
      throw new Error(`Invalid recording session ID: '${sessionId}' is not active.`);
    }

    const stream = this.activeSession.writeStream;
    if (!stream || stream.destroyed || !stream.writable) {
      if (this.state === 'stopping' || this.state === 'saved') {
        return;
      }
      throw new Error('Recording file stream is closed or not writable.');
    }

    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    const writeOk = stream.write(buf);
    this.activeSession.bytesWritten += buf.length;

    if (!writeOk) {
      // Backpressure drain
      await new Promise<void>((resolve) => stream.once('drain', resolve));
    }
  }

  /**
   * Pauses the active recording session.
   */
  public async pauseRecording(sessionId: string): Promise<void> {
    if (!this.activeSession || this.activeSession.sessionId !== sessionId) {
      throw new Error(`Cannot pause: session '${sessionId}' is not active.`);
    }

    if (this.state !== 'recording') {
      return;
    }

    this.activeSession.isPaused = true;
    this.state = 'paused';
  }

  /**
   * Resumes a paused recording session.
   */
  public async resumeRecording(sessionId: string): Promise<void> {
    if (!this.activeSession || this.activeSession.sessionId !== sessionId) {
      throw new Error(`Cannot resume: session '${sessionId}' is not active.`);
    }

    if (this.state !== 'paused') {
      return;
    }

    this.activeSession.isPaused = false;
    this.state = 'recording';
  }

  /**
   * Stops the active session, flushes and finalizes the file, releases collaborator resources,
   * patches WebM duration metadata, and returns saved recording metrics.
   */
  public async stopRecording(sessionId: string, durationMs: number): Promise<SavedRecordingResult> {
    if (!this.activeSession || this.activeSession.sessionId !== sessionId) {
      throw new Error(`Cannot stop: session '${sessionId}' is not active.`);
    }

    this.state = 'stopping';
    const session = this.activeSession;
    const completedAt = Date.now();
    const resolvedDurationMs = Math.max(100, durationMs || (completedAt - session.startedAt));

    // 1. Close writeStream cleanly
    if (session.writeStream && !session.writeStream.destroyed) {
      await new Promise<void>((resolve) => {
        session.writeStream!.end(() => resolve());
      });
    }

    // 2. Release capture and audio collaborators
    try {
      await this.captureProvider.stopCapture();
    } catch (e) {
      console.warn('[RecordingService] Error stopping CaptureProvider:', e);
    }

    try {
      await this.audioProvider.stop('all');
    } catch (e) {
      console.warn('[RecordingService] Error stopping AudioProvider:', e);
    }

    // 3. Patch WebM duration in header for seekability
    WebmPatcher.patchDuration(session.output.filePath, resolvedDurationMs);

    // 4. Verify output file on disk
    let fileSizeBytes = session.bytesWritten;
    try {
      const stats = fs.statSync(session.output.filePath);
      fileSizeBytes = stats.size;
    } catch (statErr) {
      console.warn('[RecordingService] Could not stat output file:', statErr);
    }

    const { width, height } = this.resolveDimensions(session.options.resolution);

    const result: SavedRecordingResult = {
      sessionId: session.sessionId,
      filePath: session.output.filePath,
      fileName: session.output.fileName,
      fileSizeBytes,
      durationMs: resolvedDurationMs,
      width,
      height,
      fps: session.options.fps,
      startedAt: session.startedAt,
      completedAt,
      hasAudio: session.options.micEnabled || session.options.systemAudioEnabled,
      micEnabled: session.options.micEnabled,
      systemAudioEnabled: session.options.systemAudioEnabled,
    };

    this.lastSavedResult = result;
    this.activeSession = null;
    this.state = 'saved';

    return result;
  }

  /**
   * Highlights the saved video file in Windows File Explorer.
   */
  public async showInFolder(filePath: string): Promise<void> {
    if (fs.existsSync(filePath)) {
      shell.showItemInFolder(filePath);
    } else {
      throw new Error(`File does not exist: ${filePath}`);
    }
  }

  /**
   * Returns the current recording service status.
   */
  public getStatus(): RecordingStatus {
    let sessionInfo: RecordingSessionInfo | null = null;
    if (this.activeSession) {
      sessionInfo = {
        sessionId: this.activeSession.sessionId,
        state: this.state,
        startedAt: this.activeSession.startedAt,
        outputPath: this.activeSession.output.filePath,
        fileName: this.activeSession.output.fileName,
        options: this.activeSession.options,
      };
    }

    return {
      state: this.state,
      activeSession: sessionInfo,
      lastSavedResult: this.lastSavedResult,
      error: this.currentError,
    };
  }
}
