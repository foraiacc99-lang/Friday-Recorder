import { app, BrowserWindow } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';
import { createRequire } from 'module';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const require = createRequire(import.meta.url);

app.setName('Friday Recorder');

app.whenReady().then(async () => {
  console.log('=== REAL EXTERNAL AUDIO PLAYBACK & SYSTEM AUDIO CAPTURE TEST ===');

  try {
    const ipcModule = require(path.resolve(rootDir, 'dist-electron/main/ipc.js'));
    ipcModule.registerIpcHandlers();

    const win = new BrowserWindow({
      width: 1200,
      height: 900,
      show: false,
      webPreferences: {
        preload: path.resolve(rootDir, 'dist-electron/preload/index.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        backgroundThrottling: false,
      },
    });

    await win.loadFile(path.resolve(rootDir, 'dist/index.html'));
    await new Promise((r) => setTimeout(r, 600));

    // 1. Initialize system audio capture in renderer
    console.log('[Test] Initializing system audio capture (WASAPI Loopback)...');
    const startResult = await win.webContents.executeJavaScript(`
      (async () => {
        const sessionInfo = await window.friday.audio.startSystemAudioCapture();
        const sources = await window.friday.capture.listSources(['screen']);
        const screenId = sources[0]?.id || 'screen:0:0';

        const stream = await navigator.mediaDevices.getUserMedia({
          audio: { mandatory: { chromeMediaSource: 'desktop' } },
          video: { mandatory: { chromeMediaSource: 'desktop', chromeMediaSourceId: screenId } },
        });

        // Detach video track
        stream.getVideoTracks().forEach(t => { t.stop(); stream.removeTrack(t); });
        const audioTrack = stream.getAudioTracks()[0];

        window._sysStream = stream;
        window._audioCtx = new AudioContext();
        const src = window._audioCtx.createMediaStreamSource(stream);
        window._analyser = window._audioCtx.createAnalyser();
        window._analyser.fftSize = 256;
        window._analyser.smoothingTimeConstant = 0.2;
        src.connect(window._analyser);

        window.sampleLevel = () => {
          const data = new Uint8Array(window._analyser.frequencyBinCount);
          window._analyser.getByteFrequencyData(data);
          let sum = 0;
          for (let v of data) sum += v * v;
          const rms = Math.sqrt(sum / data.length);
          return Math.min(100, Math.round((rms / 128) * 100));
        };

        return {
          trackLabel: audioTrack.label,
          trackReadyState: audioTrack.readyState,
          settings: audioTrack.getSettings(),
        };
      })()
    `);
    console.log('[Test] System audio track active:', startResult);

    // 2. Measure baseline (silence before external playback)
    const baselineSamples = [];
    for (let i = 0; i < 4; i++) {
      await new Promise((r) => setTimeout(r, 100));
      const val = await win.webContents.executeJavaScript('window.sampleLevel()');
      baselineSamples.push(val);
    }
    console.log('[Test] Baseline silence volume levels (before playback):', baselineSamples);

    // 3. Play real external audio file via external PowerShell SoundPlayer process
    const mediaFile = 'C:\\Windows\\Media\\Alarm01.wav';
    console.log(`[Test] Launching external audio playback of real file: "${mediaFile}"...`);

    const audioProc = spawn('powershell.exe', [
      '-NoProfile',
      '-ExecutionPolicy',
      'Bypass',
      '-Command',
      `$p = New-Object System.Media.SoundPlayer '${mediaFile}'; $p.PlaySync()`,
    ]);

    // Continuously sample during external playback
    const playbackSamples = [];
    const startTime = Date.now();
    while (Date.now() - startTime < 2500) {
      await new Promise((r) => setTimeout(r, 100));
      const val = await win.webContents.executeJavaScript('window.sampleLevel()');
      playbackSamples.push(val);
    }

    console.log('[Test] Live volume levels during external audio playback:', playbackSamples);
    const maxPlaybackVol = Math.max(...playbackSamples);
    console.log(`[Test] Peak volume detected from real audio file: ${maxPlaybackVol}%`);

    // 4. Measure volume levels after external playback has finished
    await new Promise((r) => setTimeout(r, 300));
    const afterSamples = [];
    for (let i = 0; i < 4; i++) {
      await new Promise((r) => setTimeout(r, 100));
      const val = await win.webContents.executeJavaScript('window.sampleLevel()');
      afterSamples.push(val);
    }
    console.log('[Test] Volume levels after external playback stopped:', afterSamples);

    // 5. Cleanup
    await win.webContents.executeJavaScript(`
      (async () => {
        if (window._sysStream) {
          window._sysStream.getTracks().forEach(t => t.stop());
          window._sysStream = null;
        }
        if (window._audioCtx) {
          await window._audioCtx.close();
          window._audioCtx = null;
        }
        await window.friday.audio.stop('system');
      })()
    `);

    try {
      audioProc.kill();
    } catch {}

    console.log('=== REAL EXTERNAL AUDIO TEST COMPLETED SUCCESSFULLY ===');
    win.destroy();
    app.exit(0);
  } catch (err) {
    console.error('External audio test failed:', err);
    app.exit(1);
  }
});
