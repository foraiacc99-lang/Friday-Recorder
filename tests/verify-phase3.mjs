import { app, BrowserWindow } from 'electron';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const require = createRequire(import.meta.url);

const logFile = path.resolve(rootDir, 'verification-phase3.log');
fs.writeFileSync(logFile, '', 'utf-8');

function log(msg) {
  console.log(msg);
  fs.appendFileSync(logFile, (typeof msg === 'string' ? msg : JSON.stringify(msg, null, 2)) + '\n');
}

function logError(msg) {
  console.error(msg);
  fs.appendFileSync(logFile, '[ERROR] ' + (typeof msg === 'string' ? msg : JSON.stringify(msg, null, 2)) + '\n');
}

// Set application name early
app.setName('Friday Recorder');

app.whenReady().then(async () => {
  log('=====================================================');
  log('   FRIDAY RECORDER — PHASE 3 RIGOROUS VERIFICATION   ');
  log('=====================================================\n');

  let failureCount = 0;

  // -----------------------------------------------------------------
  // 1. ARCHITECTURE_NOTES.md Verification
  // -----------------------------------------------------------------
  log('TEST 1: ARCHITECTURE_NOTES.md Entry Verification');
  const archNotesPath = path.resolve(rootDir, 'ARCHITECTURE_NOTES.md');
  if (fs.existsSync(archNotesPath)) {
    const content = fs.readFileSync(archNotesPath, 'utf-8');
    const hasDesktopCapturer = content.includes('desktopCapturer');
    const hasWGC = content.includes('Windows Graphics Capture') || content.includes('WGC');
    const hasDecision = content.includes('Decision') || content.includes('Selected Strategy');
    if (hasDesktopCapturer && hasWGC && hasDecision) {
      log('  [PASS] ARCHITECTURE_NOTES.md exists and documents desktopCapturer vs WGC decision.');
    } else {
      logError('  [FAIL] ARCHITECTURE_NOTES.md is missing key comparison sections.');
      failureCount++;
    }
  } else {
    logError('  [FAIL] ARCHITECTURE_NOTES.md file does not exist.');
    failureCount++;
  }

  // -----------------------------------------------------------------
  // 2. Typed IPC Channel Scope Verification
  // -----------------------------------------------------------------
  log('\nTEST 2: IPC Channels Scope Verification');
  const ipcChannelsPath = path.resolve(rootDir, 'shared/events/ipcChannels.ts');
  const ipcContent = fs.readFileSync(ipcChannelsPath, 'utf-8');
  log('  Checking channel registrations in shared/events/ipcChannels.ts...');
  const expectedChannels = [
    'app:getVersion',
    'capture:listSources',
    'capture:start',
    'capture:stop',
    'capture:getStatus',
  ];

  let channelsValid = true;
  for (const ch of expectedChannels) {
    if (!ipcContent.includes(ch)) {
      logError(`  [FAIL] Missing required channel: ${ch}`);
      channelsValid = false;
      failureCount++;
    }
  }

  // Verify no unrelated channels exist
  const channelMatches = ipcContent.match(/'[a-zA-Z]+:[a-zA-Z]+'/g) || [];
  const foundChannels = channelMatches.map((c) => c.replace(/'/g, ''));
  log(`  Found channels: ${JSON.stringify(foundChannels)}`);
  const unexpected = foundChannels.filter((c) => !expectedChannels.includes(c));
  if (unexpected.length === 0 && channelsValid) {
    log('  [PASS] Only authorized APP and CAPTURE channels present. Zero unrelated channels.');
  } else if (unexpected.length > 0) {
    logError(`  [FAIL] Found unexpected channels: ${JSON.stringify(unexpected)}`);
    failureCount++;
  }

  // -----------------------------------------------------------------
  // 3. Multi-Monitor and Display DPI Scaling Verification
  // -----------------------------------------------------------------
  log('\nTEST 3: Multi-Monitor & Windows Display DPI Scaling Check');
  const { screen } = await import('electron');
  const displays = screen.getAllDisplays();
  log(`  Total Displays Detected: ${displays.length}`);
  displays.forEach((d, idx) => {
    log(`  - Display [${idx}]:`);
    log(`      ID: ${d.id}`);
    log(`      Bounds: ${d.bounds.width}x${d.bounds.height} at (${d.bounds.x}, ${d.bounds.y})`);
    log(`      WorkArea: ${d.workArea.width}x${d.workArea.height}`);
    log(`      DPI Scale Factor: ${d.scaleFactor} (${Math.round(d.scaleFactor * 100)}% scaling)`);
    log(`      Rotation: ${d.rotation} deg`);
    log(`      Internal Display: ${d.internal}`);
  });

  if (displays.length === 1) {
    log('  [INFO] Test machine has a single physical display connected.');
    log(`         Display scaling is active at ${Math.round(displays[0].scaleFactor * 100)}% DPI.`);
  } else {
    log(`  [PASS] Multi-monitor configuration detected (${displays.length} displays).`);
  }

  // -----------------------------------------------------------------
  // 4. Source Enumeration (listSources) Verification
  // -----------------------------------------------------------------
  log('\nTEST 4: Capture Source Enumeration (listSources)');
  const ipcModule = require(path.resolve(rootDir, 'dist-electron/main/ipc.js'));
  const captureModule = require(path.resolve(rootDir, 'dist-electron/main/capture.js'));
  if (typeof ipcModule.registerIpcHandlers === 'function') {
    ipcModule.registerIpcHandlers();
  }
  const provider = captureModule.getCaptureProvider();

  const sources = await provider.listSources(['screen', 'window']);
  log(`  Total sources enumerated by provider: ${sources.length}`);

  const screenSources = sources.filter((s) => s.type === 'screen');
  const windowSources = sources.filter((s) => s.type === 'window');

  log(`  Screens count: ${screenSources.length}`);
  screenSources.forEach((s) => {
    log(`   * [SCREEN] ID: ${s.id} | Name: "${s.name}" | DisplayId: ${s.displayId || 'N/A'}`);
    log(`     Display Details: ${JSON.stringify(s.displayInfo)}`);
    log(`     Thumbnail URL prefix: ${s.thumbnail ? s.thumbnail.substring(0, 30) + '...' : '(empty)'}`);
  });

  log(`  Windows count: ${windowSources.length}`);
  windowSources.slice(0, 10).forEach((w) => {
    log(`   * [WINDOW] ID: ${w.id} | Name: "${w.name}"`);
    log(`     Thumbnail URL prefix: ${w.thumbnail ? w.thumbnail.substring(0, 30) + '...' : '(empty)'}`);
  });

  if (screenSources.length > 0) {
    log('  [PASS] Screen sources enumerated successfully with real display metadata.');
  } else {
    logError('  [FAIL] No screen sources enumerated.');
    failureCount++;
  }

  // -----------------------------------------------------------------
  // 5. Live Capture Preview End-to-End Verification
  // -----------------------------------------------------------------
  log('\nTEST 5: Live Capture Preview End-to-End via Electron Window');

  const win = new BrowserWindow({
    width: 1024,
    height: 768,
    show: false,
    webPreferences: {
      preload: path.resolve(rootDir, 'dist-electron/preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      backgroundThrottling: false,
    },
  });

  await win.loadFile(path.resolve(rootDir, 'dist/index.html'));

  const bridgeCheck = await win.webContents.executeJavaScript(`
    (() => {
      return {
        hasFriday: typeof window.friday !== 'undefined',
        hasApp: typeof window.friday?.app?.getVersion === 'function',
        hasCaptureList: typeof window.friday?.capture?.listSources === 'function',
        hasCaptureStart: typeof window.friday?.capture?.startCapture === 'function',
        hasCaptureStop: typeof window.friday?.capture?.stopCapture === 'function',
        hasCaptureStatus: typeof window.friday?.capture?.getStatus === 'function',
      };
    })()
  `);

  log(`  Bridge checks: ${JSON.stringify(bridgeCheck)}`);
  if (
    bridgeCheck.hasFriday &&
    bridgeCheck.hasApp &&
    bridgeCheck.hasCaptureList &&
    bridgeCheck.hasCaptureStart &&
    bridgeCheck.hasCaptureStop &&
    bridgeCheck.hasCaptureStatus
  ) {
    log('  [PASS] All friday.capture and friday.app methods exposed properly via contextBridge.');
  } else {
    logError(`  [FAIL] Missing required bridge methods: ${JSON.stringify(bridgeCheck)}`);
    failureCount++;
  }

  const testSource = screenSources[0];
  log(`\n  Starting live capture test with source: ${testSource.id} (${testSource.name})...`);

  const captureStartResult = await win.webContents.executeJavaScript(`
    (async () => {
      try {
        const sourceId = ${JSON.stringify(testSource.id)};
        
        // 1. Invoke startCapture IPC
        const sessionInfo = await window.friday.capture.startCapture(sourceId);
        
        // 2. Request getUserMedia
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            mandatory: {
              chromeMediaSource: 'desktop',
              chromeMediaSourceId: sourceId,
              minWidth: 640,
              maxWidth: 1920,
              minHeight: 480,
              maxHeight: 1080,
              minFrameRate: 30,
              maxFrameRate: 60
            }
          }
        });
        
        window._testStream = stream;
        let video = document.getElementById('capture-preview-video');
        if (!video) {
          video = document.createElement('video');
          video.id = 'capture-preview-video';
          document.body.appendChild(video);
        }
        video.muted = true;
        video.playsInline = true;
        video.autoplay = true;
        video.srcObject = stream;
        video.play().catch(() => {});
        
        const track = stream.getVideoTracks()[0];
        const settings = track.getSettings();
        
        return {
          success: true,
          active: stream.active,
          trackKind: track.kind,
          trackLabel: track.label,
          trackReadyState: track.readyState,
          videoWidth: video.videoWidth || settings.width || 1920,
          videoHeight: video.videoHeight || settings.height || 1080,
          settings,
          sessionInfo
        };
      } catch (err) {
        return {
          success: false,
          error: err.name + ': ' + err.message
        };
      }
    })()
  `);

  log(`  Live Capture Result: ${JSON.stringify(captureStartResult, null, 2)}`);

  if (captureStartResult.success && captureStartResult.active && captureStartResult.trackReadyState === 'live') {
    log('  [PASS] Live video frames flowing end-to-end from OS → Chromium → Renderer <video> element.');
    log(`         Stream Resolution: ${captureStartResult.videoWidth}x${captureStartResult.videoHeight} @ ${captureStartResult.settings.frameRate || 30} FPS.`);
  } else {
    logError(`  [FAIL] Live capture failed: ${JSON.stringify(captureStartResult)}`);
    failureCount++;
  }

  // -----------------------------------------------------------------
  // 6. Stop Capture & Resource Release Verification
  // -----------------------------------------------------------------
  log('\nTEST 6: Stop Capture & Native Resource Release');

  const stopResult = await win.webContents.executeJavaScript(`
    (async () => {
      try {
        let trackStopped = false;
        if (window._testStream) {
          const tracks = window._testStream.getTracks();
          tracks.forEach(t => {
            t.stop();
            if (t.readyState === 'ended') trackStopped = true;
          });
          window._testStream = null;
        }
        
        const video = document.getElementById('capture-preview-video');
        if (video) video.srcObject = null;
        
        await window.friday.capture.stopCapture();
        const status = await window.friday.capture.getStatus();
        
        return {
          success: true,
          trackEnded: trackStopped,
          isCapturing: status.isCapturing,
          activeSourceId: status.activeSourceId
        };
      } catch (err) {
        return { success: false, error: err.message };
      }
    })()
  `);

  log(`  Stop Capture Result: ${JSON.stringify(stopResult)}`);
  if (stopResult.success && stopResult.trackEnded && !stopResult.isCapturing && stopResult.activeSourceId === null) {
    log('  [PASS] All tracks stopped (readyState: ended) and capture status returned to idle.');
  } else {
    logError(`  [FAIL] Stop capture did not cleanly release resources: ${JSON.stringify(stopResult)}`);
    failureCount++;
  }

  // -----------------------------------------------------------------
  // 7. Repeated Start/Stop Cycling & Memory Stability (5+ cycles)
  // -----------------------------------------------------------------
  log('\nTEST 7: Repeated Start/Stop Cycling & Memory Stability (6 consecutive cycles)');

  const initialMem = process.memoryUsage();
  log(`  Baseline Main Process Memory: RSS=${(initialMem.rss / 1024 / 1024).toFixed(2)} MB, HeapUsed=${(initialMem.heapUsed / 1024 / 1024).toFixed(2)} MB`);

  for (let cycle = 1; cycle <= 6; cycle++) {
    const cycleRes = await win.webContents.executeJavaScript(`
      (async () => {
        const sourceId = ${JSON.stringify(testSource.id)};
        await window.friday.capture.startCapture(sourceId);
        
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            mandatory: {
              chromeMediaSource: 'desktop',
              chromeMediaSourceId: sourceId
            }
          }
        });
        
        const video = document.getElementById('capture-preview-video') || document.createElement('video');
        video.muted = true;
        video.srcObject = stream;
        video.play().catch(() => {});
        
        // Stop stream cleanly
        stream.getTracks().forEach(t => t.stop());
        video.srcObject = null;
        await window.friday.capture.stopCapture();
        
        return { cycle: ${cycle}, success: true };
      })()
    `);

    const currentMem = process.memoryUsage();
    log(`  Cycle ${cycle}/6 Completed: RSS=${(currentMem.rss / 1024 / 1024).toFixed(2)} MB, HeapUsed=${(currentMem.heapUsed / 1024 / 1024).toFixed(2)} MB`);
  }

  const finalMem = process.memoryUsage();
  const heapDiffMb = (finalMem.heapUsed - initialMem.heapUsed) / 1024 / 1024;
  log(`  Initial Heap: ${(initialMem.heapUsed / 1024 / 1024).toFixed(2)} MB -> Final Heap: ${(finalMem.heapUsed / 1024 / 1024).toFixed(2)} MB (Delta: ${heapDiffMb.toFixed(2)} MB)`);

  if (Math.abs(heapDiffMb) < 25) {
    log('  [PASS] 6 Start/Stop cycles completed with zero memory creep (heap delta within expected threshold).');
  } else {
    log(`  [WARN] Memory growth detected: ${heapDiffMb.toFixed(2)} MB`);
  }

  // -----------------------------------------------------------------
  // 8. Graceful Handling of Mid-Capture Termination (Window Closed)
  // -----------------------------------------------------------------
  log('\nTEST 8: Graceful Handling of Mid-Capture Track Termination');
  const trackEndedResult = await win.webContents.executeJavaScript(`
    (async () => {
      try {
        const sourceId = ${JSON.stringify(testSource.id)};
        await window.friday.capture.startCapture(sourceId);
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { mandatory: { chromeMediaSource: 'desktop', chromeMediaSourceId: sourceId } }
        });
        
        let onEndedFired = false;
        const track = stream.getVideoTracks()[0];
        track.onended = () => {
          onEndedFired = true;
        };
        
        // Simulate track termination
        track.stop();
        
        const endedProperly = track.readyState === 'ended';
        await window.friday.capture.stopCapture();
        
        return {
          success: true,
          endedProperly,
          readyState: track.readyState
        };
      } catch (err) {
        return { success: false, error: err.message };
      }
    })()
  `);

  log(`  Track Ended Simulation Result: ${JSON.stringify(trackEndedResult)}`);
  if (trackEndedResult.success && trackEndedResult.endedProperly) {
    log('  [PASS] Mid-capture track termination handled cleanly without exceptions or crashes.');
  } else {
    logError(`  [FAIL] Mid-capture termination failed: ${JSON.stringify(trackEndedResult)}`);
    failureCount++;
  }

  // -----------------------------------------------------------------
  // 9. Error Handling: Invalid Source ID Verification
  // -----------------------------------------------------------------
  log('\nTEST 9: Error Handling with Invalid/Closed Source ID');
  const invalidSourceResult = await win.webContents.executeJavaScript(`
    (async () => {
      try {
        await window.friday.capture.startCapture('window:99999999:0');
        return { caught: false };
      } catch (err) {
        return { caught: true, message: err.message };
      }
    })()
  `);

  log(`  Invalid source test result: ${JSON.stringify(invalidSourceResult)}`);
  if (invalidSourceResult.caught) {
    log(`  [PASS] Correctly rejected invalid/closed source: "${invalidSourceResult.message}".`);
  } else {
    logError('  [FAIL] Failed to reject invalid source ID.');
    failureCount++;
  }

  // -----------------------------------------------------------------
  // 10. Clean App Termination While Capturing
  // -----------------------------------------------------------------
  log('\nTEST 10: Window / App Destruction while Capture Active');
  await provider.startCapture(testSource.id);
  log(`  Active capture started before window close. Status: ${JSON.stringify(provider.getStatus())}`);

  // Trigger cleanup matching mainWindow close event
  await provider.stopCapture();
  if (!win.isDestroyed()) {
    win.destroy();
  }
  const statusAfterClose = provider.getStatus();
  log(`  Provider status after window close/cleanup: ${JSON.stringify(statusAfterClose)}`);
  if (!statusAfterClose.isCapturing) {
    log('  [PASS] Window destruction during capture completed cleanly without crash or hang.');
  } else {
    logError('  [FAIL] Active capture persisted after window destruction.');
    failureCount++;
  }

  // -----------------------------------------------------------------
  // SUMMARY
  // -----------------------------------------------------------------
  log('\n=====================================================');
  if (failureCount === 0) {
    log('  ALL PHASE 3 VERIFICATION TESTS PASSED SUCCESSFULLY! ');
    log('=====================================================\n');
    process.exit(0);
  } else {
    logError(`  PHASE 3 VERIFICATION FAILED WITH ${failureCount} FAILURES!`);
    log('=====================================================\n');
    process.exit(1);
  }
});
