import { app, BrowserWindow } from 'electron';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const require = createRequire(import.meta.url);

const logFile = path.resolve(rootDir, 'verification-phase6.log');
fs.writeFileSync(logFile, '', 'utf-8');

function log(msg) {
  console.log(msg);
  fs.appendFileSync(logFile, (typeof msg === 'string' ? msg : JSON.stringify(msg, null, 2)) + '\n');
}

function logError(msg) {
  console.error(msg);
  fs.appendFileSync(logFile, '[ERROR] ' + (typeof msg === 'string' ? msg : JSON.stringify(msg, null, 2)) + '\n');
}

app.setName('Friday Recorder');

app.whenReady().then(async () => {
  log('=====================================================');
  log('FRIDAY RECORDER — PHASE 6: END-TO-END ELECTRON UI VERIFICATION');
  log('=====================================================\n');

  let failureCount = 0;
  let passCount = 0;

  function assert(condition, message) {
    if (condition) {
      log(`  ✅ PASS: ${message}`);
      passCount++;
    } else {
      logError(`  ❌ FAIL: ${message}`);
      failureCount++;
      throw new Error(`Assertion failed: ${message}`);
    }
  }

  try {
    // 1. Initialize IPC handlers
    const ipcModule = require(path.resolve(rootDir, 'dist-electron/main/ipc.js'));
    ipcModule.registerIpcHandlers();

    // 2. Discover Phase 5 real recordings
    const oneDriveDocs = path.join(os.homedir(), 'OneDrive', 'Documents', 'Friday Recorder', 'Recordings');
    const localDocs = path.join(os.homedir(), 'Documents', 'Friday Recorder', 'Recordings');
    const recordingsDir = fs.existsSync(oneDriveDocs) ? oneDriveDocs : localDocs;

    assert(fs.existsSync(recordingsDir), `Recordings directory located at: ${recordingsDir}`);
    const files = fs.readdirSync(recordingsDir).filter((f) => f.endsWith('.webm'));
    assert(files.length > 0, `Discovered ${files.length} real Phase 5 recordings`);

    const validRecordings = files
      .map(f => path.join(recordingsDir, f))
      .filter(p => fs.statSync(p).size > 5000);
    assert(validRecordings.length > 0, `Discovered ${validRecordings.length} valid Phase 5 recordings with size > 5KB`);

    const realRecording1 = validRecordings[0];
    log(`  Using real recording: "${path.basename(realRecording1)}" (${(fs.statSync(realRecording1).size / 1024).toFixed(1)} KB)`);

    // 3. Launch BrowserWindow
    const win = new BrowserWindow({
      width: 1280,
      height: 900,
      show: false,
      webPreferences: {
        preload: path.resolve(rootDir, 'dist-electron/preload/index.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });

    win.webContents.on('console-message', (_event, level, message) => {
      if (level >= 2) {
        log(`[Renderer Console Level ${level}] ${message}`);
      }
    });

    await win.loadFile(path.resolve(rootDir, 'dist/index.html'));
    await new Promise((r) => setTimeout(r, 600));

    // -------------------------------------------------------------
    // TEST 1: TAB NAVIGATION & INITIAL UI STATE
    // -------------------------------------------------------------
    log('\n--- TEST 1: TAB NAVIGATION & INITIAL UI STATE ---');
    const tabState = await win.webContents.executeJavaScript(`
      (async () => {
        const tabBtn = document.getElementById('tab-media-import');
        if (!tabBtn) return { hasTab: false };
        tabBtn.click();
        await new Promise(r => setTimeout(r, 300));

        const panel = document.getElementById('media-import-panel');
        const emptyState = document.getElementById('media-empty-state');
        const dropzone = document.getElementById('media-dropzone');
        const importBtn = document.getElementById('import-video-button');
        const pathInput = document.getElementById('manual-path-input');

        return {
          hasTab: true,
          hasPanel: !!panel,
          hasEmptyState: !!emptyState,
          hasDropzone: !!dropzone,
          hasImportBtn: !!importBtn,
          hasPathInput: !!pathInput,
        };
      })()
    `);

    assert(tabState.hasTab, 'Media Library & Import tab exists');
    assert(tabState.hasPanel, 'MediaImportPanel rendered after tab click');
    assert(tabState.hasDropzone, 'Drag-and-drop zone rendered');
    assert(tabState.hasImportBtn, 'Import Video button rendered');
    assert(tabState.hasPathInput, 'Manual path input form rendered');
    assert(tabState.hasEmptyState, 'Empty state rendered when no media imported');

    // -------------------------------------------------------------
    // TEST 2: IMPORT REAL PHASE 5 RECORDING VIA PROGRAMMATIC / PATH INPUT
    // -------------------------------------------------------------
    log('\n--- TEST 2: IMPORT REAL RECORDING VIA DIRECT PATH ---');
    const escapedPath = realRecording1.replace(/\\/g, '\\\\');

    const importResult = await win.webContents.executeJavaScript(`
      (async () => {
        const input = document.getElementById('manual-path-input');
        const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
        nativeSetter.call(input, "${escapedPath}");
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));

        await new Promise(r => setTimeout(r, 100));

        const btn = document.getElementById('manual-import-button');
        btn.click();

        // Wait for importing indicator to clear and card to render
        for (let i = 0; i < 50; i++) {
          await new Promise(r => setTimeout(r, 150));
          const errBanner = document.querySelector('.media-error-banner');
          if (errBanner) {
            return { success: false, error: 'Banner: ' + errBanner.textContent };
          }
          const grid = document.getElementById('media-grid');
          const cards = grid ? grid.querySelectorAll('.media-card') : [];
          if (cards.length > 0) {
            const card = cards[0];
            const img = card.querySelector('.media-thumbnail');
            const duration = card.querySelector('.duration-pill')?.textContent;
            const filename = card.querySelector('.card-filename')?.textContent;
            const badges = Array.from(card.querySelectorAll('.meta-tag')).map(b => b.textContent);
            const filesize = card.querySelector('.card-filesize')?.textContent;

            return {
              success: true,
              filename,
              duration,
              badges,
              filesize,
              hasImg: !!img,
              imgSrcPrefix: img?.src?.substring(0, 30),
              imgLoaded: img?.complete && img?.naturalWidth > 0,
            };
          }
        }
        return { success: false, error: 'Timed out waiting for media card' };
      })()
    `);

    assert(importResult.success, 'Media card rendered in UI');
    assert(importResult.filename === path.basename(realRecording1), `Card filename matches: ${importResult.filename}`);
    assert(importResult.hasImg, 'Card contains thumbnail <img> element');
    assert(importResult.imgSrcPrefix?.startsWith('data:image/jpeg;base64,'), 'Thumbnail is valid JPEG base64 Data URI');
    log(`  Thumbnail preview in UI: Valid base64 JPEG (${importResult.duration}, ${importResult.badges.join(', ')})`);
    log(`  Card badges: ${JSON.stringify(importResult.badges)}`);
    log(`  Card filesize: ${importResult.filesize}`);

    // Verify raw ffprobe parity
    const ffprobeRaw = execSync(`ffprobe -v error -show_entries format=duration,size:stream=width,height,codec_name,r_frame_rate -of json "${realRecording1}"`, { encoding: 'utf-8' });
    const ffprobeJson = JSON.parse(ffprobeRaw);
    log(`  Raw ffprobe comparison: ${JSON.stringify(ffprobeJson.streams[0])}`);
    assert(importResult.badges.some(b => b.includes(`${ffprobeJson.streams[0].width}×${ffprobeJson.streams[0].height}`)), 'Resolution badge matches ffprobe');
    assert(importResult.badges.some(b => b.toUpperCase().includes(ffprobeJson.streams[0].codec_name.toUpperCase())), 'Codec badge matches ffprobe');

    // -------------------------------------------------------------
    // TEST 3: DRAG AND DROP IMPORT SIMULATION
    // -------------------------------------------------------------
    log('\n--- TEST 3: DRAG AND DROP IMPORT SIMULATION ---');
    // Find second recording for drag-and-drop test if available, or create copy
    const testTempDir = path.join(rootDir, 'tests', 'temp_e2e_phase6');
    if (!fs.existsSync(testTempDir)) fs.mkdirSync(testTempDir, { recursive: true });

    const dragTestFile = path.join(testTempDir, 'drag_drop_sample.webm');
    fs.copyFileSync(realRecording1, dragTestFile);
    const escapedDragPath = dragTestFile.replace(/\\/g, '\\\\');

    const dragDropResult = await win.webContents.executeJavaScript(`
      (async () => {
        const dropzone = document.getElementById('media-dropzone');
        const fileObj = new File([''], 'drag_drop_sample.webm', { type: 'video/webm' });
        Object.defineProperty(fileObj, 'path', {
          value: "${escapedDragPath}",
          writable: false,
        });

        const dt = new DataTransfer();
        dt.items.add(fileObj);

        const dropEvent = new DragEvent('drop', {
          bubbles: true,
          cancelable: true,
          dataTransfer: dt,
        });

        dropzone.dispatchEvent(dropEvent);

        // Wait for import and re-render
        for (let i = 0; i < 50; i++) {
          await new Promise(r => setTimeout(r, 100));
          const grid = document.getElementById('media-grid');
          const cards = grid ? grid.querySelectorAll('.media-card') : [];
          if (cards.length >= 2) {
            const lastCard = cards[0];
            const filename = lastCard.querySelector('.card-filename')?.textContent;
            return {
              fileName: filename,
              totalCards: cards.length,
            };
          }
        }

        const cards = document.querySelectorAll('.media-card');
        return {
          fileName: 'timed_out',
          totalCards: cards.length,
        };
      })()
    `);

    assert(dragDropResult.fileName === 'drag_drop_sample.webm', `Drag-drop imported sample: ${dragDropResult.fileName}`);
    assert(dragDropResult.totalCards >= 2, `Total media cards in UI after drag-drop: ${dragDropResult.totalCards}`);

    // -------------------------------------------------------------
    // TEST 4: ERROR HANDLING (0-BYTE, CORRUPTED, UNSUPPORTED)
    // -------------------------------------------------------------
    log('\n--- TEST 4: ERROR HANDLING FOR INVALID / CORRUPTED FILES ---');
    const zeroByteFile = path.join(testTempDir, 'empty.webm');
    fs.writeFileSync(zeroByteFile, Buffer.alloc(0));
    const escapedZeroByte = zeroByteFile.replace(/\\/g, '\\\\');

    const zeroByteTest = await win.webContents.executeJavaScript(`
      (async () => {
        const input = document.getElementById('manual-path-input');
        const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
        nativeSetter.call(input, "${escapedZeroByte}");
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));

        await new Promise(r => setTimeout(r, 100));
        const btn = document.getElementById('manual-import-button');
        btn.click();

        await new Promise(r => setTimeout(r, 400));
        const banner = document.querySelector('.media-error-banner');
        return {
          bannerShown: !!banner,
          bannerText: banner?.textContent || '',
        };
      })()
    `);

    assert(zeroByteTest.bannerShown, 'Error banner displayed for 0-byte file');
    assert(zeroByteTest.bannerText.includes('0 bytes') || zeroByteTest.bannerText.includes('empty'), `Error message clear: "${zeroByteTest.bannerText}"`);

    // Test corrupted file
    const corruptFile = path.join(testTempDir, 'corrupt.mp4');
    fs.writeFileSync(corruptFile, 'THIS_IS_NOT_A_VALID_MP4_FILE_STREAM');
    const escapedCorrupt = corruptFile.replace(/\\/g, '\\\\');

    const corruptTest = await win.webContents.executeJavaScript(`
      (async () => {
        const input = document.getElementById('manual-path-input');
        const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
        nativeSetter.call(input, "${escapedCorrupt}");
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));

        await new Promise(r => setTimeout(r, 100));
        const btn = document.getElementById('manual-import-button');
        btn.click();

        await new Promise(r => setTimeout(r, 500));
        const banner = document.querySelector('.media-error-banner');
        return {
          bannerShown: !!banner,
          bannerText: banner?.textContent || '',
        };
      })()
    `);

    assert(corruptTest.bannerShown, 'Error banner displayed for corrupted file');
    log(`  Corrupted file error message displayed: "${corruptTest.bannerText.trim()}"`);

    // Test unsupported file format
    const unsupportedFile = path.join(testTempDir, 'test.txt');
    fs.writeFileSync(unsupportedFile, 'Hello world');
    const escapedUnsupported = unsupportedFile.replace(/\\/g, '\\\\');

    const unsupportedTest = await win.webContents.executeJavaScript(`
      (async () => {
        const input = document.getElementById('manual-path-input');
        const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
        nativeSetter.call(input, "${escapedUnsupported}");
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));

        await new Promise(r => setTimeout(r, 100));
        const btn = document.getElementById('manual-import-button');
        btn.click();

        await new Promise(r => setTimeout(r, 400));
        const banner = document.querySelector('.media-error-banner');
        return {
          bannerShown: !!banner,
          bannerText: banner?.textContent || '',
        };
      })()
    `);

    assert(unsupportedTest.bannerShown, 'Error banner displayed for unsupported format (.txt)');
    assert(unsupportedTest.bannerText.includes('Unsupported video format'), `Unsupported format error clear: "${unsupportedTest.bannerText}"`);

    // -------------------------------------------------------------
    // TEST 5: DELETED / MOVED SOURCE FILE GRACEFUL HANDLING IN UI
    // -------------------------------------------------------------
    log('\n--- TEST 5: DELETED / MOVED SOURCE FILE HANDLING IN UI ---');
    // Now delete the dragTestFile from disk
    fs.unlinkSync(dragTestFile);
    assert(!fs.existsSync(dragTestFile), 'Deleted dragTestFile from disk to simulate moved/missing file');

    // Click "Check Status" on that card in UI
    const statusCheckUiResult = await win.webContents.executeJavaScript(`
      (async () => {
        const cards = Array.from(document.querySelectorAll('.media-card'));
        const targetCard = cards.find(c => c.querySelector('.card-filename')?.textContent.includes('drag_drop_sample'));
        if (!targetCard) return { foundCard: false };

        const checkBtn = targetCard.querySelector('.card-check-btn');
        if (!checkBtn) return { foundCheckBtn: false };

        checkBtn.click();
        await new Promise(r => setTimeout(r, 400));

        const hasMissingClass = targetCard.classList.contains('file-missing');
        const missingBadge = targetCard.querySelector('.missing-badge');
        const missingWarning = targetCard.querySelector('.missing-warning');

        return {
          foundCard: true,
          foundCheckBtn: true,
          hasMissingClass,
          badgeText: missingBadge?.textContent || '',
          warningText: missingWarning?.textContent || '',
        };
      })()
    `);

    assert(statusCheckUiResult.foundCard, 'Found media card for deleted file');
    assert(statusCheckUiResult.hasMissingClass, 'Card received "file-missing" CSS class');
    assert(statusCheckUiResult.badgeText === 'FILE MISSING', 'Card displayed "FILE MISSING" badge');
    assert(statusCheckUiResult.warningText.includes('File not found on disk'), 'Card displayed clear file missing warning');
    log('  Graceful missing file indication verified in UI without crash.');

    // -------------------------------------------------------------
    // TEST 6: UI RESPONSIVENESS (EVENT LOOP HEARTBEAT DURING PROBING)
    // -------------------------------------------------------------
    log('\n--- TEST 6: UI RESPONSIVENESS / EVENT LOOP PACING ---');
    const heartbeatResult = await win.webContents.executeJavaScript(`
      (async () => {
        let maxJitterMs = 0;
        let lastTick = performance.now();
        const intervalId = setInterval(() => {
          const now = performance.now();
          const delta = now - lastTick;
          if (delta > maxJitterMs) maxJitterMs = delta;
          lastTick = now;
        }, 10);

        // Probe real file
        const t0 = performance.now();
        await window.friday.media.importFile("${escapedPath}");
        const probeDuration = performance.now() - t0;

        clearInterval(intervalId);
        return {
          probeDuration,
          maxJitterMs,
        };
      })()
    `);

    log(`  Probe Duration: ${heartbeatResult.probeDuration.toFixed(2)} ms`);
    log(`  Max UI Event Loop Jitter: ${heartbeatResult.maxJitterMs.toFixed(2)} ms`);
    assert(heartbeatResult.maxJitterMs < 100, `UI Event loop remained responsive (< 100ms jitter, actual: ${heartbeatResult.maxJitterMs.toFixed(2)}ms)`);

    // -------------------------------------------------------------
    // TEST 7: ZERO FILE DUPLICATION (SPEC SECTION 20)
    // -------------------------------------------------------------
    log('\n--- TEST 7: ZERO FILE DUPLICATION CHECK ---');
    const cacheDir = path.join(os.homedir(), 'OneDrive', 'Documents', 'Friday Recorder', 'Cache');
    const localCacheDir = path.join(os.homedir(), 'Documents', 'Friday Recorder', 'Cache');
    const activeCache = fs.existsSync(cacheDir) ? cacheDir : localCacheDir;

    let videoCopies = 0;
    if (fs.existsSync(activeCache)) {
      const scan = (dir) => {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
          const p = path.join(dir, entry.name);
          if (entry.isDirectory()) scan(p);
          else if (['.webm', '.mp4', '.mov', '.mkv'].includes(path.extname(p).toLowerCase())) {
            videoCopies++;
          }
        }
      };
      scan(activeCache);
    }
    assert(videoCopies === 0, `Zero video files copied into application cache (found ${videoCopies})`);

    // -------------------------------------------------------------
    // TEST 8: CARD REMOVAL WITHOUT DELETING SOURCE FILE
    // -------------------------------------------------------------
    log('\n--- TEST 8: REFERENCE REMOVAL TEST ---');
    const removeResult = await win.webContents.executeJavaScript(`
      (async () => {
        const cardsBefore = document.querySelectorAll('.media-card').length;
        const firstCard = document.querySelector('.media-card');
        const removeBtn = firstCard?.querySelector('.card-remove-btn');
        if (!removeBtn) return { removed: false };

        removeBtn.click();
        await new Promise(r => setTimeout(r, 300));
        const cardsAfter = document.querySelectorAll('.media-card').length;

        return {
          removed: true,
          cardsBefore,
          cardsAfter,
        };
      })()
    `);

    assert(removeResult.removed, 'Remove button clicked');
    assert(removeResult.cardsAfter === removeResult.cardsBefore - 1, 'Card removed from UI library');
    assert(fs.existsSync(realRecording1), 'Original video file on disk remains intact (non-destructive removal)');

    // Clean up temporary directory
    try {
      fs.rmSync(testTempDir, { recursive: true, force: true });
    } catch {}

    log('\n=====================================================');
    log(`ALL E2E ELECTRON VERIFICATION TESTS PASSED: ${passCount} PASSED, ${failureCount} FAILED`);
    log('=====================================================');

    win.destroy();
    app.exit(0);
  } catch (err) {
    logError(`Fatal verification error: ${err.message}\n${err.stack}`);
    app.exit(1);
  }
});
