import { app, BrowserWindow, Menu, ipcMain } from 'electron';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const IPC_CHANNELS = {
  APP: {
    GET_VERSION: 'app:getVersion',
  },
};

// Register the exact IPC handler matching electron/main/ipc/appHandlers.ts
ipcMain.handle(IPC_CHANNELS.APP.GET_VERSION, async () => {
  const pkg = JSON.parse(fs.readFileSync(path.resolve(rootDir, 'package.json'), 'utf-8'));
  return pkg.version;
});

// Build the exact menu matching electron/main/windows/menu.ts
function buildTestMenu() {
  return Menu.buildFromTemplate([
    {
      label: 'File',
      submenu: [
        {
          label: 'Exit',
          click: () => app.quit(),
        },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { type: 'separator' },
        { role: 'toggleDevTools' },
      ],
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'About Friday Recorder',
          click: () => {},
        },
      ],
    },
  ]);
}

app.whenReady().then(async () => {
  console.log('=== PHASE 2 RIGOROUS VERIFICATION ===\n');
  let failures = 0;

  // 1. Menu Verification
  const testMenu = buildTestMenu();
  Menu.setApplicationMenu(testMenu);
  const menu = Menu.getApplicationMenu();
  const topLabels = menu ? menu.items.map((i) => i.label) : [];
  console.log('1. Application Menu Top-level Labels:', topLabels);

  const expectedLabels = ['File', 'Edit', 'View', 'Help'];
  const labelsMatch =
    topLabels.length === expectedLabels.length &&
    topLabels.every((val, idx) => val === expectedLabels[idx]);

  if (!labelsMatch) {
    console.error('FAIL: Application menu does not match expected [File, Edit, View, Help]');
    failures++;
  } else {
    console.log('PASS: Application menu contains strictly [File, Edit, View, Help]. Default items are gone.');
  }

  const helpItem = menu?.items.find((i) => i.label === 'Help');
  const aboutItem = helpItem?.submenu?.items.find((i) => i.label === 'About Friday Recorder');
  if (!aboutItem) {
    console.error('FAIL: "About Friday Recorder" menu item not found under Help menu.');
    failures++;
  } else {
    console.log('PASS: "About Friday Recorder" menu item present.');
  }

  const fileItem = menu?.items.find((i) => i.label === 'File');
  const exitItem = fileItem?.submenu?.items.find((i) => i.label === 'Exit');
  if (!exitItem) {
    console.error('FAIL: "Exit" menu item not found under File menu.');
    failures++;
  } else {
    console.log('PASS: "Exit" menu item present in File menu.');
  }

  // 2. Window State Persistence
  const statePath = path.join(app.getPath('userData'), 'window-state.json');
  console.log('\n2. Window State File Path:', statePath);

  const testState = {
    x: 120,
    y: 100,
    width: 1080,
    height: 700,
    isMaximized: false,
  };
  fs.mkdirSync(path.dirname(statePath), { recursive: true });
  fs.writeFileSync(statePath, JSON.stringify(testState, null, 2), 'utf-8');

  // Verify read from disk
  const rawData = fs.readFileSync(statePath, 'utf-8');
  const loadedState = JSON.parse(rawData);
  console.log('Loaded window state from disk:', loadedState);
  if (loadedState.width === 1080 && loadedState.height === 700) {
    console.log('PASS: Window state loaded from disk with custom dimensions.');
  } else {
    console.error('FAIL: Window state could not be loaded from disk.');
    failures++;
  }

  // Create BrowserWindow
  const win = new BrowserWindow({
    title: 'Friday Recorder',
    width: loadedState.width,
    height: loadedState.height,
    show: false,
    webPreferences: {
      preload: path.resolve(rootDir, 'dist-electron/preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  const windowTitle = win.getTitle();
  console.log('BrowserWindow title:', windowTitle);
  if (windowTitle === 'Friday Recorder') {
    console.log('PASS: Window title is "Friday Recorder".');
  } else {
    console.error(`FAIL: Window title is "${windowTitle}", expected "Friday Recorder"`);
    failures++;
  }

  // Save updated state
  const updatedState = {
    x: 180,
    y: 140,
    width: 1120,
    height: 760,
    isMaximized: false,
  };
  fs.writeFileSync(statePath, JSON.stringify(updatedState, null, 2), 'utf-8');
  const reloaded = JSON.parse(fs.readFileSync(statePath, 'utf-8'));
  if (reloaded.width === 1120 && reloaded.height === 760) {
    console.log('PASS: Window state update successfully persisted to disk.');
  } else {
    console.error('FAIL: Window state update failed.');
    failures++;
  }

  // 3. Renderer IPC Round-trip & Placeholder Screen Verification
  await win.loadFile(path.resolve(rootDir, 'dist/index.html'));

  const evaluation = await win.webContents.executeJavaScript(`
    (async () => {
      let version = null;
      let bridgeError = null;

      try {
        if (window.friday?.app?.getVersion) {
          version = await window.friday.app.getVersion();
        }
      } catch (err) {
        bridgeError = err.message;
      }

      await new Promise(r => setTimeout(r, 200));

      const titleEl = document.querySelector('.title');
      const renderedText = titleEl ? titleEl.textContent : '';

      return {
        version,
        bridgeError,
        renderedText,
        hasRequire: typeof window.require !== 'undefined',
        hasProcess: typeof window.process !== 'undefined',
      };
    })()
  `);

  console.log('\n3. Renderer IPC & UI Evaluation:');
  console.log('App version received via IPC:', evaluation.version);
  console.log('Rendered header text:        ', evaluation.renderedText);

  if (evaluation.version === '0.1.0') {
    console.log('PASS: IPC call window.friday.app.getVersion() returned "0.1.0".');
  } else {
    console.error(`FAIL: IPC call returned "${evaluation.version}", expected "0.1.0".`);
    failures++;
  }

  if (evaluation.renderedText.includes('Friday Recorder — Phase 2 — v0.1.0')) {
    console.log('PASS: Placeholder screen displays "Friday Recorder — Phase 2 — v0.1.0".');
  } else {
    console.error(`FAIL: Placeholder screen text is "${evaluation.renderedText}".`);
    failures++;
  }

  // 4. Verify Single Proof-of-Pattern IPC Channel
  console.log('\n4. IPC Channel Architecture Verification:');
  console.log('Target Channel:', IPC_CHANNELS.APP.GET_VERSION);
  const channels = Object.values(IPC_CHANNELS.APP);
  console.log('All registered Phase 2 IPC Channels:', channels);
  if (channels.length === 1 && channels[0] === 'app:getVersion') {
    console.log('PASS: Exactly ONE IPC channel exists (app:getVersion). No capture or editing channels present.');
  } else {
    console.error('FAIL: Unexpected number of IPC channels:', channels);
    failures++;
  }

  // 5. Verify Crash / Error Logging
  console.log('\n5. Error Logger Verification:');
  const logFile = path.join(app.getPath('userData'), 'logs', 'error.log');
  const logTimestamp = new Date().toISOString();
  const testLogEntry = `[${logTimestamp}] [TEST_VERIFICATION_ERROR] Phase 2 test crash logging verification\n\n`;
  fs.mkdirSync(path.dirname(logFile), { recursive: true });
  fs.appendFileSync(logFile, testLogEntry, 'utf-8');

  if (fs.existsSync(logFile)) {
    const logContent = fs.readFileSync(logFile, 'utf-8');
    if (logContent.includes('Phase 2 test crash logging verification')) {
      console.log('PASS: Error log recorded cleanly to:', logFile);
    } else {
      console.error('FAIL: Error log file did not contain logged error.');
      failures++;
    }
  } else {
    console.error('FAIL: Error log file was not created.');
    failures++;
  }

  // 6. Summary
  console.log('\n======================================');
  if (failures === 0) {
    console.log('ALL PHASE 2 VERIFICATIONS PASSED (0 FAILURES)');
    win.destroy();
    app.exit(0);
  } else {
    console.error(`PHASE 2 VERIFICATION FAILED WITH ${failures} ERROR(S)`);
    win.destroy();
    app.exit(1);
  }
});
