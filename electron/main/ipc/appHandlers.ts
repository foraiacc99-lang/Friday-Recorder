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
 * Validates that the IPC invocation originates from a trusted local origin.
 */
export function validateSenderFrame(frame: Electron.WebFrameMain | null): void {
  if (!frame) {
    throw new Error('IPC Access Denied: Missing sender frame');
  }

  const url = frame.url;
  const isAllowedDev = url.startsWith('http://localhost:5173') || url.startsWith('http://127.0.0.1:5173');
  const isAllowedProd = url.startsWith('file://');

  if (!isAllowedDev && !isAllowedProd) {
    throw new Error(`IPC Access Denied: Unauthorized sender origin (${url})`);
  }
}

/**
 * Registers application IPC handlers with basic input validation and sender frame authenticity checks.
 * Phase 2 proof-of-pattern call: app.getVersion from package.json.
 */
export function registerAppHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.APP.GET_VERSION, async (event, payload?: unknown): Promise<string> => {
    // 1. Authenticate sender frame
    validateSenderFrame(event.senderFrame);

    // 2. Validate input payload
    if (payload !== undefined && (typeof payload !== 'object' || payload === null)) {
      throw new Error('Invalid IPC request payload');
    }

    return getAppVersion();
  });
}
