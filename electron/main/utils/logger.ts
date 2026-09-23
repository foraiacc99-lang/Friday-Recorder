import { app } from 'electron';
import fs from 'fs';
import path from 'path';

function getLogFilePath(): string {
  return path.join(app.getPath('userData'), 'logs', 'error.log');
}

/**
 * Appends sanitized error messages to the local error log file.
 */
export function logError(type: string, error: unknown): void {
  try {
    const timestamp = new Date().toISOString();
    let message = 'Unknown error';
    let stack = '';

    if (error instanceof Error) {
      message = error.message;
      stack = error.stack || '';
    } else if (typeof error === 'string') {
      message = error;
    }

    const logEntry = `[${timestamp}] [${type}] ${message}\n${stack}\n\n`;

    const logFile = getLogFilePath();
    fs.mkdirSync(path.dirname(logFile), { recursive: true });
    fs.appendFileSync(logFile, logEntry, 'utf-8');
  } catch (err) {
    console.error('Failed to write to error log file:', err);
  }
}

/**
 * Initializes global process error and unhandled rejection handlers.
 */
export function initLogger(): void {
  process.on('uncaughtException', (error) => {
    console.error('[Uncaught Exception]', error);
    logError('UNCAUGHT_EXCEPTION', error);
  });

  process.on('unhandledRejection', (reason) => {
    console.error('[Unhandled Rejection]', reason);
    logError('UNHANDLED_REJECTION', reason);
  });
}
