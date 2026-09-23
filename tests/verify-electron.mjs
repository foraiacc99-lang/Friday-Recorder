import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

// Register IPC handlers matching production
ipcMain.handle('app:getInfo', () => ({
  name: 'Friday Recorder',
  version: app.getVersion(),
  isPackaged: false,
  platform: process.platform,
}));

ipcMain.handle('app:ping', () => 'pong');

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

    win.webContents.on('console-message', (_event, level, message) => {
      console.log(`[Renderer Console - Level ${level}] ${message}`);
    });

    await win.loadFile(path.resolve(rootDir, 'dist/index.html'));

    const diagnostics = await win.webContents.executeJavaScript(`
      (async () => {
        const hasRequire = typeof window.require !== 'undefined';
        const hasProcess = typeof window.process !== 'undefined';
        const hasFriday = typeof window.friday !== 'undefined';
        let appInfo = null;
        let pingResult = null;
        let bridgeError = null;

        if (hasFriday) {
          try {
            appInfo = await window.friday.app.getInfo();
            pingResult = await window.friday.app.ping();
          } catch (e) {
            bridgeError = e.message;
          }
        }

        const titleText = document.querySelector('.title')?.textContent || '';

        return {
          hasRequire,
          hasProcess,
          hasFriday,
          appInfo,
          pingResult,
          bridgeError,
          titleText,
        };
      })()
    `);

    console.log('--- VERIFICATION RESULTS ---');
    console.log('Title text:', diagnostics.titleText);
    console.log('Require exposed:', diagnostics.hasRequire);
    console.log('Process exposed:', diagnostics.hasProcess);
    console.log('Friday bridge exposed:', diagnostics.hasFriday);
    console.log('App info via bridge:', diagnostics.appInfo);
    console.log('Ping result via bridge:', diagnostics.pingResult);
    console.log('Bridge error:', diagnostics.bridgeError);

    let failed = false;
    if (diagnostics.hasRequire) {
      console.error('FAIL: nodeIntegration is active (require is exposed)!');
      failed = true;
    }
    if (diagnostics.hasProcess) {
      console.error('FAIL: process is exposed to renderer!');
      failed = true;
    }
    if (!diagnostics.hasFriday) {
      console.error('FAIL: window.friday is NOT exposed!');
      failed = true;
    }
    if (!diagnostics.appInfo || diagnostics.appInfo.name !== 'Friday Recorder') {
      console.error('FAIL: appInfo was not retrieved properly via IPC bridge!');
      failed = true;
    }
    if (diagnostics.pingResult !== 'pong') {
      console.error('FAIL: ping did not return "pong"!');
      failed = true;
    }
    if (!diagnostics.titleText.includes('Friday Recorder — Phase 1 Foundation')) {
      console.error('FAIL: Title text does not match expected placeholder!');
      failed = true;
    }

    if (failed) {
      console.error('FAILED ELECTRON VERIFICATION');
      app.exit(1);
    } else {
      console.log('ALL ELECTRON SECURITY & IPC VERIFICATIONS PASSED SUCCESSFULLY!');
      app.exit(0);
    }
  } catch (err) {
    console.error('Verification encountered an unhandled error:', err);
    app.exit(1);
  }
});
