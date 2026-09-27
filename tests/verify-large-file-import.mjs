import { app, BrowserWindow } from 'electron';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const require = createRequire(import.meta.url);

const largeFilePath = path.resolve(rootDir, 'large_5min_test_video.mp4');

app.setName('Friday Recorder');

app.whenReady().then(async () => {
  console.log('=====================================================');
  console.log('FRIDAY RECORDER — PHASE 6: REAL LARGE FILE (292 MB / 5-MIN) RE-TEST');
  console.log('=====================================================\n');

  if (!fs.existsSync(largeFilePath)) {
    console.error(`Large test file not found at: ${largeFilePath}`);
    app.exit(1);
    return;
  }

  const stat = fs.statSync(largeFilePath);
  const sizeMB = (stat.size / (1024 * 1024)).toFixed(2);
  console.log(`📁 Test File: ${path.basename(largeFilePath)}`);
  console.log(`   File Size: ${stat.size} bytes (${sizeMB} MB)`);

  const ipcModule = require(path.resolve(rootDir, 'dist-electron/main/ipc.js'));
  ipcModule.registerIpcHandlers();

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

  await win.loadFile(path.resolve(rootDir, 'dist/index.html'));
  await new Promise((r) => setTimeout(r, 600));

  // Navigate to Media Library tab
  await win.webContents.executeJavaScript(`
    (async () => {
      const tab = document.getElementById('tab-media-import');
      if (tab) tab.click();
      await new Promise(r => setTimeout(r, 200));
    })()
  `);

  console.log('\n--- MEASURING UI EVENT-LOOP JITTER DURING 292 MB FILE IMPORT ---');
  const escapedPath = largeFilePath.replace(/\\/g, '\\\\');

  const result = await win.webContents.executeJavaScript(`
    (async () => {
      const heartbeatIntervalMs = 5;
      const deltas = [];
      let lastTime = performance.now();
      let timerActive = true;

      // High-frequency heartbeat timer to detect any UI thread freezing or stutter
      const intervalId = setInterval(() => {
        if (!timerActive) return;
        const now = performance.now();
        const delta = now - lastTime;
        deltas.push(delta);
        lastTime = now;
      }, heartbeatIntervalMs);

      // Start import of the 292 MB, 5-minute video file
      const importStart = performance.now();
      const importedItem = await window.friday.media.importFile("${escapedPath}");
      const importEnd = performance.now();
      const totalImportDurationMs = importEnd - importStart;

      timerActive = false;
      clearInterval(intervalId);

      // Analyze jitter metrics
      let maxDelta = 0;
      let sumDelta = 0;
      let countOver15ms = 0;
      let countOver30ms = 0;
      let countOver50ms = 0;

      for (const d of deltas) {
        if (d > maxDelta) maxDelta = d;
        sumDelta += d;
        if (d > 15) countOver15ms++;
        if (d > 30) countOver30ms++;
        if (d > 50) countOver50ms++;
      }

      const avgDelta = deltas.length > 0 ? (sumDelta / deltas.length) : 0;
      const maxJitter = Math.max(0, maxDelta - heartbeatIntervalMs);

      // Refresh UI by calling input import to render card
      const input = document.getElementById('manual-path-input');
      const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      nativeSetter.call(input, "${escapedPath}");
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
      await new Promise(r => setTimeout(r, 100));

      const btn = document.getElementById('manual-import-button');
      btn.click();
      await new Promise(r => setTimeout(r, 300));

      const grid = document.getElementById('media-grid');
      const card = grid?.querySelector('.media-card');
      const cardFilename = card?.querySelector('.card-filename')?.textContent;
      const durationPill = card?.querySelector('.duration-pill')?.textContent;
      const badges = Array.from(card?.querySelectorAll('.meta-tag') || []).map(b => b.textContent);
      const filesize = card?.querySelector('.card-filesize')?.textContent;
      const img = card?.querySelector('.media-thumbnail');

      return {
        importedItem,
        totalImportDurationMs,
        heartbeatSamplesCount: deltas.length,
        avgHeartbeatDeltaMs: avgDelta,
        maxHeartbeatDeltaMs: maxDelta,
        maxJitterMs: maxJitter,
        countOver15ms,
        countOver30ms,
        countOver50ms,
        uiCard: {
          filename: cardFilename,
          duration: durationPill,
          badges,
          filesize,
          hasThumbnail: !!img,
          thumbnailSrcPrefix: img?.src?.substring(0, 30),
        }
      };
    })()
  `);

  console.log('\n--- PERFORMANCE TELEMETRY ---');
  console.log(`  File Size: ${sizeMB} MB`);
  console.log(`  Duration: ${result.importedItem.metadata.durationSeconds}s (5 minutes)`);
  console.log(`  Total Probing + Thumbnail Duration: ${result.totalImportDurationMs.toFixed(2)} ms`);
  console.log(`  Heartbeat Samples Collected: ${result.heartbeatSamplesCount}`);
  console.log(`  Target Heartbeat Interval: 5.00 ms`);
  console.log(`  Actual Avg Heartbeat Interval: ${result.avgHeartbeatDeltaMs.toFixed(2)} ms`);
  console.log(`  Max Heartbeat Delta: ${result.maxHeartbeatDeltaMs.toFixed(2)} ms`);
  console.log(`  Max Event-Loop Jitter: ${result.maxJitterMs.toFixed(2)} ms`);
  console.log(`  Heartbeat ticks > 15ms: ${result.countOver15ms}`);
  console.log(`  Heartbeat ticks > 30ms: ${result.countOver30ms}`);
  console.log(`  Heartbeat ticks > 50ms: ${result.countOver50ms} (UI frame drops avoided)`);

  console.log('\n--- METADATA EXTRACTION ACCURACY ---');
  console.log(`  Container Format: ${result.importedItem.metadata.containerFormat}`);
  console.log(`  Video Codec: ${result.importedItem.metadata.videoCodec}`);
  console.log(`  Audio Codec: ${result.importedItem.metadata.audioCodec}`);
  console.log(`  Dimensions: ${result.importedItem.metadata.width}x${result.importedItem.metadata.height}`);
  console.log(`  FPS: ${result.importedItem.metadata.fps} FPS`);
  console.log(`  Bitrate: ${(result.importedItem.metadata.bitRate / 1000).toFixed(0)} kbps`);

  console.log('\n--- THUMBNAIL CACHING & UI RENDERING ---');
  console.log(`  Thumbnail Path: ${result.importedItem.thumbnailPath}`);
  console.log(`  Thumbnail Exists on Disk: ${fs.existsSync(result.importedItem.thumbnailPath)}`);
  if (fs.existsSync(result.importedItem.thumbnailPath)) {
    console.log(`  Thumbnail File Size: ${fs.statSync(result.importedItem.thumbnailPath).size} bytes`);
  }
  console.log(`  Card Rendered in UI: ${result.uiCard.filename}`);
  console.log(`  Duration in UI: ${result.uiCard.duration}`);
  console.log(`  Filesize in UI: ${result.uiCard.filesize}`);
  console.log(`  Badges in UI: ${JSON.stringify(result.uiCard.badges)}`);

  console.log('\n--- ZERO FILE DUPLICATION VERIFICATION ---');
  const cacheDir = path.join(os.homedir(), 'OneDrive', 'Documents', 'Friday Recorder', 'Cache');
  const localCacheDir = path.join(os.homedir(), 'Documents', 'Friday Recorder', 'Cache');
  const activeCache = fs.existsSync(cacheDir) ? cacheDir : localCacheDir;

  let videoFilesInCache = 0;
  function scan(dir) {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, ent.name);
      if (ent.isDirectory()) scan(p);
      else if (['.webm', '.mp4', '.mov', '.mkv'].includes(path.extname(p).toLowerCase())) {
        videoFilesInCache++;
      }
    }
  }
  if (fs.existsSync(activeCache)) scan(activeCache);
  console.log(`  Video files copied into Cache/: ${videoFilesInCache}`);

  const passed =
    result.totalImportDurationMs < 3000 &&
    result.maxJitterMs < 100 &&
    result.countOver50ms === 0 &&
    result.uiCard.duration === '05:00' &&
    videoFilesInCache === 0;

  if (passed) {
    console.log('\n✅ PASS: Real large file (292 MB / 5-min) non-blocking import verified successfully!');
    win.destroy();
    app.exit(0);
  } else {
    console.error('\n❌ FAIL: Large file import criteria not met.');
    win.destroy();
    app.exit(1);
  }
});
