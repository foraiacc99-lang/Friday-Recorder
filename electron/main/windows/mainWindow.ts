import { BrowserWindow } from 'electron';
import path from 'path';
import { loadWindowState, saveWindowState } from './windowState';

let mainWindow: BrowserWindow | null = null;

export function getMainWindow(): BrowserWindow | null {
  return mainWindow;
}

export function focusMainWindow(): void {
  if (mainWindow) {
    if (mainWindow.isMinimized()) {
      mainWindow.restore();
    }
    mainWindow.focus();
  }
}

/**
 * Creates and initializes the main desktop window.
 */
export function createMainWindow(isDev: boolean): BrowserWindow {
  const windowState = loadWindowState();

  const iconPath = path.resolve(__dirname, '../../assets/icon.ico');

  mainWindow = new BrowserWindow({
    title: 'Friday Recorder',
    x: windowState.x,
    y: windowState.y,
    width: windowState.width,
    height: windowState.height,
    minWidth: 900,
    minHeight: 600,
    center: windowState.x === undefined || windowState.y === undefined,
    show: false,
    backgroundColor: '#0a0e17',
    icon: iconPath,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  });

  if (windowState.isMaximized) {
    mainWindow.maximize();
  }

  // Save window state on resize, move, and close
  let saveTimer: NodeJS.Timeout | null = null;
  const debouncedSave = () => {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        saveWindowState(mainWindow);
      }
    }, 200);
  };

  mainWindow.on('resize', debouncedSave);
  mainWindow.on('move', debouncedSave);
  mainWindow.on('close', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      saveWindowState(mainWindow);
    }
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    mainWindow.loadFile(path.join(__dirname, '../../dist/index.html'));
  }

  return mainWindow;
}
