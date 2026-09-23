import { ipcMain } from 'electron';
import fs from 'fs';
import path from 'path';
import { IPC_CHANNELS } from '../../../shared/events';

let cachedVersion: string | null = null;

/**
 * Retrieves the application version from package.json.
 */
export function getAppVersion(): string {
  if (cachedVersion) return cachedVersion;

  try {
    // Locate package.json relative to bundled dist-electron or source
    const candidates = [
      path.resolve(__dirname, '../../package.json'),
      path.resolve(__dirname, '../package.json'),
      path.resolve(process.cwd(), 'package.json'),
    ];

    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) {
        const pkg = JSON.parse(fs.readFileSync(candidate, 'utf-8'));
        if (typeof pkg.version === 'string') {
          cachedVersion = pkg.version;
          return pkg.version;
        }
      }
    }
  } catch (err) {
    console.error('Failed to read version from package.json:', err);
  }

  const fallbackVersion = '0.1.0';
  cachedVersion = fallbackVersion;
  return fallbackVersion;
}

/**
 * Registers application IPC handlers with basic input validation.
 * Phase 2 proof-of-pattern call: app.getVersion from package.json.
 */
export function registerAppHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.APP.GET_VERSION, async (_event, payload?: unknown): Promise<string> => {
    // Basic input validation
    if (payload !== undefined && (typeof payload !== 'object' || payload === null)) {
      throw new Error('Invalid IPC request payload');
    }

    return getAppVersion();
  });
}
