import { BrowserWindow, dialog } from 'electron';
import fs from 'fs';
import path from 'path';
import type { ImportedMediaItem, MediaStatusCheckResult } from '../../../shared/types';
import { MediaProbe } from './MediaProbe';
import { ThumbnailGenerator } from './ThumbnailGenerator';

/**
 * Service managing media import, metadata probing, thumbnail caching,
 * and in-memory media library reference state.
 * 
 * Per spec Section 20, imported files are referenced by path on disk and
 * NEVER duplicated or copied into application storage directories.
 */
export class MediaImportService {
  private static instance: MediaImportService | null = null;
  private importedItems: Map<string, ImportedMediaItem> = new Map();

  private constructor() {}

  public static getInstance(): MediaImportService {
    if (!this.instance) {
      this.instance = new MediaImportService();
    }
    return this.instance;
  }

  /**
   * Imports a single video file by absolute path.
   * Validates file integrity, extracts metadata with ffprobe,
   * generates cached thumbnail, and registers into library.
   */
  public async importFile(rawFilePath: string): Promise<ImportedMediaItem> {
    const resolvedPath = path.resolve(rawFilePath);

    // 1. Check if already imported
    for (const existing of this.importedItems.values()) {
      if (path.resolve(existing.filePath) === resolvedPath) {
        // Refresh availability check
        existing.isAvailable = fs.existsSync(resolvedPath);
        return existing;
      }
    }

    // 2. Validate and probe metadata via ffprobe
    const metadata = await MediaProbe.probe(resolvedPath);

    // 3. Generate thumbnail off-thread via ffmpeg
    const thumb = await ThumbnailGenerator.generate(resolvedPath, metadata.durationSeconds);

    // 4. File stats
    const stat = fs.statSync(resolvedPath);

    const item: ImportedMediaItem = {
      id: `media_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
      filePath: resolvedPath,
      fileName: path.basename(resolvedPath),
      fileSizeBytes: stat.size,
      metadata,
      thumbnailPath: thumb.thumbnailPath,
      thumbnailUrl: thumb.thumbnailUrl,
      importedAt: new Date().toISOString(),
      isAvailable: true,
    };

    this.importedItems.set(item.id, item);
    return item;
  }

  /**
   * Opens the native Windows file picker dialog filtered to supported video formats
   * and imports all user-selected files.
   */
  public async importFilesViaDialog(parentWindow?: BrowserWindow): Promise<ImportedMediaItem[]> {
    const win = parentWindow ?? BrowserWindow.getFocusedWindow();
    const options: Electron.OpenDialogOptions = {
      title: 'Import Video to Friday Recorder',
      buttonLabel: 'Import Video',
      properties: ['openFile', 'multiSelections'],
      filters: [
        {
          name: 'Video Files (*.webm, *.mp4, *.mov, *.mkv)',
          extensions: ['webm', 'mp4', 'mov', 'mkv'],
        },
        {
          name: 'All Files (*.*)',
          extensions: ['*'],
        },
      ],
    };

    const result = win
      ? await dialog.showOpenDialog(win, options)
      : await dialog.showOpenDialog(options);

    if (result.canceled || result.filePaths.length === 0) {
      return [];
    }

    const imported: ImportedMediaItem[] = [];
    for (const filePath of result.filePaths) {
      try {
        const item = await this.importFile(filePath);
        imported.push(item);
      } catch (err) {
        console.error(`[MediaImportService] Failed to import "${filePath}":`, err);
        throw err;
      }
    }

    return imported;
  }

  /**
   * Returns all imported media items currently referenced in memory.
   */
  public list(): ImportedMediaItem[] {
    return Array.from(this.importedItems.values());
  }

  /**
   * Removes a media item reference from the library.
   * Per spec Section 20, this NEVER touches or deletes the source file on disk.
   */
  public remove(id: string): boolean {
    return this.importedItems.delete(id);
  }

  /**
   * Checks whether the underlying referenced source file still exists on disk.
   * Handles moved, deleted, or unmounted files gracefully.
   */
  public checkStatus(id: string): MediaStatusCheckResult {
    const item = this.importedItems.get(id);
    if (!item) {
      throw new Error(`Media item with ID "${id}" was not found in the media library.`);
    }

    const exists = fs.existsSync(item.filePath);
    item.isAvailable = exists;

    if (exists) {
      try {
        const stat = fs.statSync(item.filePath);
        return {
          id: item.id,
          filePath: item.filePath,
          exists: true,
          fileSizeBytes: stat.size,
          lastModified: stat.mtime.toISOString(),
        };
      } catch (err) {
        return {
          id: item.id,
          filePath: item.filePath,
          exists: false,
          error: err instanceof Error ? err.message : String(err),
        };
      }
    } else {
      return {
        id: item.id,
        filePath: item.filePath,
        exists: false,
        error: `File not found on disk at "${item.filePath}". The file may have been moved, renamed, or deleted.`,
      };
    }
  }

  /**
   * Clears in-memory library (useful for test resets).
   */
  public clear(): void {
    this.importedItems.clear();
  }
}

export function getMediaImportService(): MediaImportService {
  return MediaImportService.getInstance();
}
