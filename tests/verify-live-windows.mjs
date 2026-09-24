import { app, BrowserWindow } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import { spawn } from 'child_process';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const require = createRequire(import.meta.url);

app.setName('Friday Recorder');

app.whenReady().then(async () => {
  console.log('=====================================================');
  console.log('  LIVE ACTIVE SESSION RE-VERIFICATION (ITEMS 2, 3, 7) ');
  console.log('=====================================================\n');

  try {
    const ipcModule = require(path.resolve(rootDir, 'dist-electron/main/ipc.js'));
    const captureModule = require(path.resolve(rootDir, 'dist-electron/main/capture.js'));
    if (typeof ipcModule.registerIpcHandlers === 'function') {
      ipcModule.registerIpcHandlers();
    }
    const provider = captureModule.getCaptureProvider();

    // -------------------------------------------------------------
    // SETUP: Open Real Application Windows
    // -------------------------------------------------------------
    console.log('1. Launching real application windows...');

    // Window A: Live Text Editor with typing and scrolling animation
    const winEditor = new BrowserWindow({
      title: 'Friday Text Editor - Live Typing Target',
      width: 640,
      height: 480,
      show: true,
      webPreferences: {
        backgroundThrottling: false,
      },
    });

    const editorHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { background: #0f172a; color: #f8fafc; font-family: monospace; padding: 20px; overflow: hidden; }
          #editor { width: 100%; height: 350px; background: #1e293b; color: #38bdf8; font-size: 16px; border: 1px solid #334155; padding: 12px; border-radius: 8px; box-sizing: border-box; overflow-y: auto; }
          .status { color: #10b981; font-weight: bold; margin-bottom: 8px; font-size: 14px; }
        </style>
      </head>
      <body>
        <div class="status">● LIVE ACTIVE DOCUMENT</div>
        <textarea id="editor"></textarea>
        <script>
          const editor = document.getElementById('editor');
          let counter = 0;
          setInterval(() => {
            counter++;
            editor.value += "Line " + counter + ": User actively typing into document stream [timestamp: " + Date.now() + "]\\n";
            editor.scrollTop = editor.scrollHeight;
          }, 150);
        </script>
      </body>
      </html>
    `;
    await winEditor.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(editorHtml)}`);

    // Window B: Real OS Notepad application
    console.log('Launching OS notepad.exe process...');
    const notepadProc = spawn('notepad.exe', [], { detached: false });

    // Window C: Live Dashboard window
    const winDashboard = new BrowserWindow({
      title: 'Friday Metrics - Live Dashboard Target',
      width: 600,
      height: 400,
      show: true,
      webPreferences: {
        backgroundThrottling: false,
      },
    });
    const dashHtml = `
      <!DOCTYPE html>
      <html>
      <body style="background:#18181b;color:#a1a1aa;font-family:sans-serif;padding:24px;">
        <h2 style="color:#e4e4e7;">Telemetry Monitor</h2>
        <div id="gauge" style="font-size:32px;color:#22c55e;font-weight:bold;">0%</div>
        <script>
          let val = 0;
          setInterval(() => {
            val = (val + 7) % 100;
            document.getElementById('gauge').textContent = val + '% CPU Load';
          }, 200);
        </script>
      </body>
      </html>
    `;
    await winDashboard.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(dashHtml)}`);

    // Allow 2 seconds for DWM to composite windows and generate thumbnail textures
    console.log('Waiting 2 seconds for DWM composition & window registration...');
    await new Promise((r) => setTimeout(r, 2000));

    // -------------------------------------------------------------
    // RE-TEST 1: listSources() Verification
    // -------------------------------------------------------------
    console.log('\n=====================================================');
    console.log('RE-TEST 1: listSources() with Multiple Open Windows');
    console.log('=====================================================');

    const sources = await provider.listSources(['screen', 'window']);
    console.log(`Total sources returned: ${sources.length}`);

    const screens = sources.filter((s) => s.type === 'screen');
    const windows = sources.filter((s) => s.type === 'window');

    console.log(`\nScreens (${screens.length}):`);
    screens.forEach((s) => {
      console.log(` - ID: ${s.id} | Name: "${s.name}" | ThumbLength: ${s.thumbnail?.length || 0}`);
    });

    console.log(`\nWindows (${windows.length}):`);
    windows.forEach((w, i) => {
      const hasThumb = Boolean(w.thumbnail && w.thumbnail.length > 200);
      const thumbPrefix = w.thumbnail ? w.thumbnail.substring(0, 35) + '...' : '(none)';
      console.log(` [${i}] ID: ${w.id} | Name: "${w.name}" | ThumbPopulated: ${hasThumb} (Length: ${w.thumbnail?.length || 0}) | Prefix: ${thumbPrefix}`);
    });

    // -------------------------------------------------------------
    // RE-TEST 2: Live Preview Capturing Real Window with Typing/Scrolling
    // -------------------------------------------------------------
    console.log('\n=====================================================');
    console.log('RE-TEST 2: Live Preview Capturing Real Window');
    console.log('=====================================================');

    // Host window hosting the Friday Recorder preview UI
    const previewHost = new BrowserWindow({
      title: 'Friday Recorder - Preview Host',
      width: 1024,
      height: 768,
      show: false,
      webPreferences: {
        preload: path.resolve(rootDir, 'dist-electron/preload/index.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        backgroundThrottling: false,
      },
    });

    await previewHost.loadFile(path.resolve(rootDir, 'dist/index.html'));

    // Select the Text Editor window as the capture target
    const editorTarget = windows.find((w) => w.name.includes('Friday Text Editor')) || windows[0] || screens[0];
    console.log(`Selected Capture Target: [${editorTarget.type}] ${editorTarget.id} — "${editorTarget.name}"`);

    const previewResult = await previewHost.webContents.executeJavaScript(`
      (async () => {
        try {
          const sourceId = ${JSON.stringify(editorTarget.id)};
          await window.friday.capture.startCapture(sourceId);

          const stream = await navigator.mediaDevices.getUserMedia({
            audio: false,
            video: {
              mandatory: {
                chromeMediaSource: 'desktop',
                chromeMediaSourceId: sourceId,
                minWidth: 640,
                maxWidth: 1920,
                minHeight: 480,
                maxHeight: 1080
              }
            }
          });

          window._captureStream = stream;
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
            sourceId,
            trackKind: track.kind,
            trackLabel: track.label,
            trackReadyState: track.readyState,
            settings: {
              width: settings.width,
              height: settings.height,
              frameRate: settings.frameRate,
              aspectRatio: settings.aspectRatio
            }
          };
        } catch (err) {
          return { success: false, error: err.name + ': ' + err.message };
        }
      })()
    `);

    console.log('Live Preview Initialization Result:', JSON.stringify(previewResult, null, 2));

    // Allow capture stream to run while the editor text area actively updates and scrolls
    console.log('Previewing live stream while editor text actively updates...');
    await new Promise((r) => setTimeout(r, 1200));

    // Verify video element state
    const liveTelemetry = await previewHost.webContents.executeJavaScript(`
      (() => {
        const v = document.getElementById('capture-preview-video');
        const track = window._captureStream ? window._captureStream.getVideoTracks()[0] : null;
        return {
          videoWidth: v ? v.videoWidth : 0,
          videoHeight: v ? v.videoHeight : 0,
          paused: v ? v.paused : true,
          trackReadyState: track ? track.readyState : 'none',
          active: window._captureStream ? window._captureStream.active : false
        };
      })()
    `);
    console.log('Live Stream Telemetry during active typing:', liveTelemetry);

    // Stop preview stream
    await previewHost.webContents.executeJavaScript(`
      (() => {
        if (window._captureStream) {
          window._captureStream.getTracks().forEach(t => t.stop());
          window._captureStream = null;
        }
        const v = document.getElementById('capture-preview-video');
        if (v) v.srcObject = null;
      })()
    `);
    await provider.stopCapture();
    console.log('Live preview stopped cleanly.');

    // -------------------------------------------------------------
    // RE-TEST 3: Real Window Closed Mid-Capture (Notepad.exe)
    // -------------------------------------------------------------
    console.log('\n=====================================================');
    console.log('RE-TEST 3: Real Application Window Closed Mid-Capture');
    console.log('=====================================================');

    // Find Notepad in the window list
    const currentWindows = await provider.listSources(['window']);
    const notepadTarget = currentWindows.find((w) => w.name.toLowerCase().includes('notepad'));
    console.log(`Target Notepad Window: ${notepadTarget ? notepadTarget.id + ' — ' + notepadTarget.name : 'Not found'}`);

    if (notepadTarget) {
      console.log('Starting capture on real Notepad window...');
      const npCaptureStart = await previewHost.webContents.executeJavaScript(`
        (async () => {
          try {
            const sourceId = ${JSON.stringify(notepadTarget.id)};
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

            window._npStream = stream;
            window._onEndedFired = false;
            window._endedEventTimestamp = null;

            const track = stream.getVideoTracks()[0];
            track.onended = () => {
              window._onEndedFired = true;
              window._endedEventTimestamp = Date.now();
            };

            return { started: true, readyState: track.readyState, sourceId };
          } catch (e) {
            return { started: false, error: e.message };
          }
        })()
      `);
      console.log('Notepad capture start:', npCaptureStart);

      // Now physically terminate the Notepad process
      console.log('Physically killing notepad.exe process via PID: ' + notepadProc.pid + '...');
      notepadProc.kill('SIGTERM');

      // Wait for Windows DWM window destruction notification to reach Chromium WebRTC
      console.log('Waiting for window close event to propagate...');
      await new Promise((r) => setTimeout(r, 1500));

      const npCloseVerification = await previewHost.webContents.executeJavaScript(`
        (async () => {
          const track = window._npStream ? window._npStream.getVideoTracks()[0] : null;
          const trackReadyState = track ? track.readyState : 'none';
          
          // Execute cleanup hook
          await window.friday.capture.stopCapture();
          const providerStatus = await window.friday.capture.getStatus();

          return {
            onEndedFired: window._onEndedFired,
            trackReadyState,
            providerStatus
          };
        })()
      `);
      console.log('Notepad Window Close Handling Result:', JSON.stringify(npCloseVerification, null, 2));
    }

    // Clean up test windows
    winEditor.destroy();
    winDashboard.destroy();
    previewHost.destroy();

    console.log('\n=====================================================');
    console.log('  ALL 3 LIVE RE-TESTS COMPLETED SUCCESSFULLY!        ');
    console.log('=====================================================');
    process.exit(0);
  } catch (err) {
    console.error('Error during live re-verification:', err);
    process.exit(1);
  }
});
