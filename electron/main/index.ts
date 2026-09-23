import { app } from 'electron';
import { initLogger } from './utils/logger';
import { registerIpcHandlers } from './ipc';
import { createMainWindow, focusMainWindow, getMainWindow, setupApplicationMenu } from './windows';

// Explicitly set application name early to ensure userData paths resolve correctly to Friday Recorder
app.setName('Friday Recorder');

// Initialize crash and error logging early
initLogger();

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

// Enforce single-instance lock
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    // Focus the existing window when a second instance launch is attempted
    focusMainWindow();
  });

  app.whenReady().then(() => {
    setupApplicationMenu(isDev);
    registerIpcHandlers();
    createMainWindow(isDev);

    app.on('activate', () => {
      // Re-create window on macOS dock click when no windows exist
      if (getMainWindow() === null) {
        createMainWindow(isDev);
      }
    });
  });

  app.on('window-all-closed', () => {
    // Standard cross-platform quit behavior (quit on non-macOS platforms)
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });
}
