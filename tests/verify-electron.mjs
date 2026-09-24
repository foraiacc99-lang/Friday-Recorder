import { app, BrowserWindow } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const require = createRequire(import.meta.url);

// Set application name early
app.setName('Friday Recorder');

app.whenReady().then(async () => {
  try {
    // Import and register real production IPC handlers
    const ipcModule = require(path.resolve(rootDir, 'dist-electron/main/ipc.js'));
    if (typeof ipcModule.registerIpcHandlers === 'function') {
      ipcModule.registerIpcHandlers();
    }

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
        let version = null;
        let bridgeError = null;

        if (hasFriday) {
          try {
            version = await window.friday.app.getVersion();
          } catch (e) {
            bridgeError = e.message;
          }
        }

        const titleText = document.querySelector('.title')?.textContent || '';

        return {
          hasRequire,
          hasProcess,
          hasFriday,
          version,
          bridgeError,
          titleText,
        };
      })()
    `);

    console.log('--- ELECTRON VERIFICATION RESULTS ---');
    console.log('Title text:', diagnostics.titleText);
    console.log('Require exposed:', diagnostics.hasRequire);
    console.log('Process exposed:', diagnostics.hasProcess);
    console.log('Friday bridge exposed:', diagnostics.hasFriday);
    console.log('Version via bridge:', diagnostics.version);
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
    if (!diagnostics.version) {
      console.error('FAIL: app version was not retrieved properly via IPC bridge!');
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
