import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

ipcMain.handle('app:getInfo', () => ({
  name: 'Friday Recorder',
  version: app.getVersion(),
  isPackaged: false,
  platform: process.platform,
}));

ipcMain.handle('app:ping', () => 'pong');

const consoleMessages = [];

app.whenReady().then(async () => {
  try {
    const win = new BrowserWindow({
      show: false,
      webPreferences: {
        preload: path.resolve(rootDir, 'dist-electron/preload/index.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });

    win.webContents.on('console-message', (_event, level, message, line, sourceId) => {
      consoleMessages.push({ level, message, line, sourceId });
    });

    await win.loadFile(path.resolve(rootDir, 'dist/index.html'));

    const typeofRequire = await win.webContents.executeJavaScript('typeof require');
    const typeofProcess = await win.webContents.executeJavaScript('typeof process');
    const typeofElectronAPI = await win.webContents.executeJavaScript('typeof window.electronAPI');
    const typeofFriday = await win.webContents.executeJavaScript('typeof window.friday');

    console.log('=== DEVTOOLS CONSOLE EVALUATION ===');
    console.log('typeof require:           ', typeofRequire);
    console.log('typeof process:           ', typeofProcess);
    console.log('typeof window.electronAPI:', typeofElectronAPI);
    console.log('typeof window.friday:     ', typeofFriday);
    console.log('===================================');

    console.log('\n=== RENDERER CONSOLE MESSAGES ON LAUNCH ===');
    if (consoleMessages.length === 0) {
      console.log('Zero console errors or warnings recorded.');
    } else {
      for (const msg of consoleMessages) {
        console.log(`[Level ${msg.level}] ${msg.message}`);
      }
    }
    console.log('===========================================');

    app.exit(0);
  } catch (err) {
    console.error('Error during DevTools verification:', err);
    app.exit(1);
  }
});
