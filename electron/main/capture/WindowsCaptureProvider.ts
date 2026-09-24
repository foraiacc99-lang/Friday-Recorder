import { app, desktopCapturer, screen } from 'electron';
import type {
  CaptureOptions,
  CaptureSessionInfo,
  CaptureSource,
  CaptureSourceType,
  CaptureStatus,
  DisplayInfo,
} from '../../../shared/types';
import type { CaptureProvider } from './CaptureProvider';

/**
 * Concrete Windows implementation of CaptureProvider using Electron's desktopCapturer
 * and Chromium's underlying DirectX/WGC capture engine.
 */
export class WindowsCaptureProvider implements CaptureProvider {
  private activeSession: CaptureSessionInfo | null = null;
  private isCleanupRegistered = false;

  constructor() {
    this.registerProcessCleanup();
  }

  /**
   * Registers app-level lifecycle hooks to ensure capture sessions are terminated
   * cleanly on app quit or window destruction.
   */
  private registerProcessCleanup(): void {
    if (this.isCleanupRegistered) return;
    this.isCleanupRegistered = true;

    app.on('before-quit', () => {
      this.stopCapture().catch((err) => {
        console.error('[WindowsCaptureProvider] Error stopping capture during before-quit:', err);
      });
    });
  }

  /**
   * Enumerates available display screens and open application windows.
   */
  public async listSources(types: CaptureSourceType[] = ['screen', 'window']): Promise<CaptureSource[]> {
    try {
      const capturerTypes: ('screen' | 'window')[] = [];
      if (types.includes('screen')) capturerTypes.push('screen');
      if (types.includes('window')) capturerTypes.push('window');

      if (capturerTypes.length === 0) {
        return [];
      }

      // Query raw sources from desktopCapturer
      const rawSources = await desktopCapturer.getSources({
        types: capturerTypes,
        thumbnailSize: { width: 320, height: 180 },
        fetchWindowIcons: true,
      });

      // Get real display configuration from electron.screen for multi-monitor & DPI enrichment
      let displays: Electron.Display[] = [];
      try {
        displays = screen.getAllDisplays();
      } catch (e) {
        console.warn('[WindowsCaptureProvider] Could not enumerate displays from screen API:', e);
      }

      const primaryDisplay = displays.find((d) => d.bounds.x === 0 && d.bounds.y === 0) || displays[0];

      const mappedSources: CaptureSource[] = [];

      for (let i = 0; i < rawSources.length; i++) {
        const raw = rawSources[i];
        if (!raw) continue;

        const isScreen = raw.id.startsWith('screen:');
        const sourceType: CaptureSourceType = isScreen ? 'screen' : 'window';

        let displayInfo: DisplayInfo | undefined;
        let formattedName = raw.name;

        if (isScreen) {
          // Attempt to match display by display_id or by index
          let matchedDisplay: Electron.Display | undefined;

          if (raw.display_id) {
            matchedDisplay = displays.find((d) => String(d.id) === raw.display_id);
          }

          if (!matchedDisplay) {
            // Find screen index from source id (e.g. screen:0:0 -> 0)
            const idParts = raw.id.split(':');
            const part1 = idParts[1];
            const screenIndex = part1 !== undefined ? parseInt(part1, 10) : i;
            matchedDisplay = displays[screenIndex] || primaryDisplay;
          }

          if (matchedDisplay) {
            const isPrimary = primaryDisplay ? matchedDisplay.id === primaryDisplay.id : i === 0;
            displayInfo = {
              id: matchedDisplay.id,
              bounds: {
                x: matchedDisplay.bounds.x,
                y: matchedDisplay.bounds.y,
                width: matchedDisplay.bounds.width,
                height: matchedDisplay.bounds.height,
              },
              scaleFactor: matchedDisplay.scaleFactor,
              isPrimary,
              label: matchedDisplay.label || `Display ${i + 1}`,
            };

            const physicalW = Math.round(matchedDisplay.bounds.width * matchedDisplay.scaleFactor);
            const physicalH = Math.round(matchedDisplay.bounds.height * matchedDisplay.scaleFactor);
            const dpiPercent = Math.round(matchedDisplay.scaleFactor * 100);

            formattedName = `${displayInfo.label} (${physicalW}x${physicalH} @ ${dpiPercent}% DPI)${isPrimary ? ' — Primary' : ''}`;
          } else {
            formattedName = raw.name || `Screen ${i + 1}`;
          }
        }

        // Convert NativeImage to Data URL
        let thumbnailDataUrl = '';
        try {
          thumbnailDataUrl = raw.thumbnail ? raw.thumbnail.toDataURL() : '';
        } catch (thumbErr) {
          console.warn(`[WindowsCaptureProvider] Failed to generate thumbnail for source ${raw.id}:`, thumbErr);
        }

        let appIconDataUrl: string | null = null;
        try {
          if (raw.appIcon) {
            appIconDataUrl = raw.appIcon.toDataURL();
          }
        } catch {
          // Non-critical if icon fails
        }

        mappedSources.push({
          id: raw.id,
          name: formattedName,
          type: sourceType,
          thumbnail: thumbnailDataUrl,
          appIcon: appIconDataUrl,
          displayId: raw.display_id,
          displayInfo,
        });
      }

      return mappedSources;
    } catch (err) {
      console.error('[WindowsCaptureProvider] listSources failed:', err);
      // Return empty array rather than crashing on OS-level capture permission restriction
      return [];
    }
  }

  /**
   * Validates that the requested capture source is available and initiates session tracking.
   */
  public async startCapture(sourceId: string, options?: CaptureOptions): Promise<CaptureSessionInfo> {
    if (!sourceId || typeof sourceId !== 'string') {
      throw new Error('Invalid capture source ID: sourceId must be a non-empty string');
    }

    // Verify that the requested source currently exists
    const currentSources = await this.listSources(['screen', 'window']);
    const sourceExists = currentSources.some((s) => s.id === sourceId);

    if (!sourceExists) {
      throw new Error(`Capture source '${sourceId}' is no longer available (it may have been closed)`);
    }

    // If a session is already active, cleanly stop previous session first
    if (this.activeSession) {
      await this.stopCapture();
    }

    const session: CaptureSessionInfo = {
      sourceId,
      startedAt: Date.now(),
      options: options ? { ...options } : undefined,
    };

    this.activeSession = session;
    return session;
  }

  /**
   * Stops the active capture session and resets state.
   */
  public async stopCapture(): Promise<void> {
    if (this.activeSession) {
      this.activeSession = null;
    }
  }

  /**
   * Retrieves the current capture session status.
   */
  public getStatus(): CaptureStatus {
    return {
      isCapturing: this.activeSession !== null,
      activeSourceId: this.activeSession ? this.activeSession.sourceId : null,
      startedAt: this.activeSession ? this.activeSession.startedAt : null,
    };
  }
}
