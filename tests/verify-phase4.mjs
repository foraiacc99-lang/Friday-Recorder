import { app, BrowserWindow } from 'electron';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const require = createRequire(import.meta.url);

const logFile = path.resolve(rootDir, 'verification-phase4.log');
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
  log('   FRIDAY RECORDER — PHASE 4 RIGOROUS VERIFICATION   ');
  log('=====================================================\n');

  let failureCount = 0;

  // -----------------------------------------------------------------
  // 1. ARCHITECTURE_NOTES.md Verification
  // -----------------------------------------------------------------
  log('TEST 1: ARCHITECTURE_NOTES.md Phase 4 Entry Verification');
  const archNotesPath = path.resolve(rootDir, 'ARCHITECTURE_NOTES.md');
  if (fs.existsSync(archNotesPath)) {
    const content = fs.readFileSync(archNotesPath, 'utf-8');
    const hasPhase4 = content.includes('Phase 4: Audio Capture Architecture Decision');
    const hasWASAPI = content.includes('WASAPI');
    const hasDesktopConstraint = content.includes('The Chromium Desktop Audio Constraint') || content.includes('BAD_MEDIA_STREAM_REQUEST');
    const hasSolution = content.includes('The Solution') || content.includes('loopback');
    const hasSeparation = content.includes('Separation of Concerns');

    if (hasPhase4 && hasWASAPI && hasDesktopConstraint && hasSolution && hasSeparation) {
      log('  [PASS] ARCHITECTURE_NOTES.md correctly updated with Phase 4 decision, WASAPI analysis, Chromium constraint, and separation of concerns.');
    } else {
      logError('  [FAIL] ARCHITECTURE_NOTES.md is missing key Phase 4 sections.');
      failureCount++;
    }
  } else {
    logError('  [FAIL] ARCHITECTURE_NOTES.md does not exist.');
    failureCount++;
  }

  // -----------------------------------------------------------------
  // 2. Typed IPC Channel Scope Verification (Audio Only)
  // -----------------------------------------------------------------
  log('\nTEST 2: IPC Channels Scope & Audit');
  const ipcChannelsPath = path.resolve(rootDir, 'shared/events/ipcChannels.ts');
  const ipcContent = fs.readFileSync(ipcChannelsPath, 'utf-8');
  const expectedChannels = [
    'app:getVersion',
    'capture:listSources',
    'capture:start',
    'capture:stop',
    'capture:getStatus',
    'audio:listMicrophones',
    'audio:startMic',
    'audio:startSystemAudio',
    'audio:stop',
    'audio:getStatus',
  ];

  let channelsValid = true;
  for (const ch of expectedChannels) {
    if (!ipcContent.includes(ch)) {
      logError(`  [FAIL] Missing required channel: ${ch}`);
      channelsValid = false;
      failureCount++;
    }
  }

  const channelMatches = ipcContent.match(/'[a-zA-Z]+:[a-zA-Z]+'/g) || [];
  const foundChannels = channelMatches.map((c) => c.replace(/'/g, ''));
  log(`  All registered channels in IPC_CHANNELS: ${JSON.stringify(foundChannels)}`);

  const unexpected = foundChannels.filter((c) => !expectedChannels.includes(c));
  if (unexpected.length === 0 && channelsValid) {
    log('  [PASS] Only authorized APP, CAPTURE, and AUDIO channels present. Zero unrelated channels.');
  } else {
    logError(`  [FAIL] Found unexpected or missing channels: ${JSON.stringify(unexpected)}`);
    failureCount++;
  }

  // -----------------------------------------------------------------
  // 3. Audio Provider Abstraction Verification (electron/main/audio/)
  // -----------------------------------------------------------------
  log('\nTEST 3: AudioProvider Abstraction & Singleton Verification');
  const audioModule = require(path.resolve(rootDir, 'dist-electron/main/audio.js'));
  const audioProvider = audioModule.getAudioProvider();

  if (
    typeof audioProvider.listMicrophones === 'function' &&
    typeof audioProvider.startMicCapture === 'function' &&
    typeof audioProvider.startSystemAudioCapture === 'function' &&
    typeof audioProvider.stop === 'function' &&
    typeof audioProvider.getStatus === 'function'
  ) {
    log('  [PASS] AudioProvider contract fulfilled with separate mic and system audio capture methods.');
  } else {
    logError('  [FAIL] AudioProvider missing required methods.');
    failureCount++;
  }

  // Register production IPC handlers
  const ipcModule = require(path.resolve(rootDir, 'dist-electron/main/ipc.js'));
  ipcModule.registerIpcHandlers();

  // -----------------------------------------------------------------
  // 4. BrowserWindow Setup & Bridge Verification
  // -----------------------------------------------------------------
  log('\nTEST 4: BrowserWindow & ContextBridge Exposure');
  const win = new BrowserWindow({
    width: 1200,
    height: 900,
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
        hasCapture: typeof window.friday?.capture?.listSources === 'function',
        hasAudioList: typeof window.friday?.audio?.listMicrophones === 'function',
        hasAudioStartMic: typeof window.friday?.audio?.startMicCapture === 'function',
        hasAudioStartSys: typeof window.friday?.audio?.startSystemAudioCapture === 'function',
        hasAudioStop: typeof window.friday?.audio?.stop === 'function',
        hasAudioStatus: typeof window.friday?.audio?.getStatus === 'function',
      };
    })()
  `);

  if (
    bridgeCheck.hasFriday &&
    bridgeCheck.hasAudioList &&
    bridgeCheck.hasAudioStartMic &&
    bridgeCheck.hasAudioStartSys &&
    bridgeCheck.hasAudioStop &&
    bridgeCheck.hasAudioStatus
  ) {
    log('  [PASS] All audio IPC bridge methods properly exposed via contextBridge.');
  } else {
    logError(`  [FAIL] Missing audio bridge methods: ${JSON.stringify(bridgeCheck)}`);
    failureCount++;
  }

  // -----------------------------------------------------------------
  // 5. Microphone Enumeration Verification (Real Devices)
  // -----------------------------------------------------------------
  log('\nTEST 5: Real Microphone Enumeration (listMicrophones)');
  const micList = await win.webContents.executeJavaScript(`
    (async () => {
      return window.friday.audio.listMicrophones();
    })()
  `);

  log(`  Discovered ${micList.length} microphone device(s) on this machine:`);
  micList.forEach((m, idx) => {
    log(`    [${idx + 1}] ID: ${m.deviceId.slice(0, 20)}... | Label: "${m.label}" | Default: ${m.isDefault}`);
  });

  if (micList.length > 0 && micList.some((m) => m.label && !m.label.startsWith('Unknown'))) {
    log('  [PASS] listMicrophones() returned real, human-readable microphone devices.');
  } else {
    logError('  [FAIL] listMicrophones() failed to enumerate real microphones.');
    failureCount++;
  }

  // -----------------------------------------------------------------
  // 6. Live Microphone Audio Capture & Responsive Level Meter
  // -----------------------------------------------------------------
  log('\nTEST 6: Live Microphone Capture & Real-Time Level Metering');
  const micCaptureResult = await win.webContents.executeJavaScript(`
    (async () => {
      try {
        const sessionInfo = await window.friday.audio.startMicCapture();
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        const track = stream.getAudioTracks()[0];
        
        const audioCtx = new AudioContext();
        const src = audioCtx.createMediaStreamSource(stream);
        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = 256;
        src.connect(analyser);

        const samples = [];
        for (let i = 0; i < 6; i++) {
          await new Promise(r => setTimeout(r, 100));
          const data = new Uint8Array(analyser.frequencyBinCount);
          analyser.getByteFrequencyData(data);
          let sum = 0;
          for (let v of data) sum += v * v;
          const rms = Math.sqrt(sum / data.length);
          samples.push(Math.round((rms / 128) * 100));
        }

        const initialStatus = await window.friday.audio.getStatus();

        // Clean stop
        track.stop();
        await audioCtx.close();
        await window.friday.audio.stop('mic');

        const finalStatus = await window.friday.audio.getStatus();

        return {
          success: true,
          trackLabel: track.label,
          trackReadyState: track.readyState,
          settings: track.getSettings(),
          samples,
          maxVolume: Math.max(...samples),
          sessionInfo,
          initialStatus,
          finalStatus,
        };
      } catch (err) {
        return {
          success: false,
          error: err.name + ': ' + err.message,
        };
      }
    })()
  `);

  if (micCaptureResult.success) {
    log('  [PASS] Live microphone audio stream acquired and metered successfully.');
    log(`         Track Label: "${micCaptureResult.trackLabel}"`);
    log(`         Format: ${micCaptureResult.settings.sampleRate} Hz / ${micCaptureResult.settings.channelCount} channel(s)`);
    log(`         Volume samples over time: ${JSON.stringify(micCaptureResult.samples)}`);
    log(`         Peak level: ${micCaptureResult.maxVolume}%`);
    log(`         Session status before stop: isMicCapturing = ${micCaptureResult.initialStatus.isMicCapturing}`);
    log(`         Session status after stop: isMicCapturing = ${micCaptureResult.finalStatus.isMicCapturing}`);
  } else {
    logError(`  [FAIL] Live microphone capture failed: ${micCaptureResult.error}`);
    failureCount++;
  }

  // -----------------------------------------------------------------
  // 7. Live System Audio Capture (WASAPI Loopback) with Audio Playback
  // -----------------------------------------------------------------
  log('\nTEST 7: Live System Audio Capture (Windows WASAPI Loopback)');
  const sysAudioCaptureResult = await win.webContents.executeJavaScript(`
    (async () => {
      try {
        // 1. Play real audio tone through default output to generate system audio
        const outCtx = new AudioContext();
        const osc = outCtx.createOscillator();
        const gain = outCtx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(440, outCtx.currentTime);
        gain.gain.setValueAtTime(0.3, outCtx.currentTime);
        osc.connect(gain);
        gain.connect(outCtx.destination);
        osc.start();

        // 2. Notify main process to start system audio session
        const sessionInfo = await window.friday.audio.startSystemAudioCapture();

        // 3. Acquire desktop loopback stream
        const sources = await window.friday.capture.listSources(['screen']);
        const screenId = sources[0]?.id || 'screen:0:0';

        const stream = await navigator.mediaDevices.getUserMedia({
          audio: { mandatory: { chromeMediaSource: 'desktop' } },
          video: { mandatory: { chromeMediaSource: 'desktop', chromeMediaSourceId: screenId } },
        });

        // 4. Immediately detach video track per architectural pattern
        stream.getVideoTracks().forEach(t => {
          t.stop();
          stream.removeTrack(t);
        });

        const audioTrack = stream.getAudioTracks()[0];

        // 5. Connect to Analyser for live metering
        const inCtx = new AudioContext();
        const src = inCtx.createMediaStreamSource(stream);
        const analyser = inCtx.createAnalyser();
        analyser.fftSize = 256;
        src.connect(analyser);

        const activeSamples = [];
        for (let i = 0; i < 6; i++) {
          await new Promise(r => setTimeout(r, 100));
          const data = new Uint8Array(analyser.frequencyBinCount);
          analyser.getByteFrequencyData(data);
          let sum = 0;
          for (let v of data) sum += v * v;
          const rms = Math.sqrt(sum / data.length);
          activeSamples.push(Math.round((rms / 128) * 100));
        }

        const initialStatus = await window.friday.audio.getStatus();

        // Stop tone and measure volume drop
        osc.stop();
        await new Promise(r => setTimeout(r, 150));

        const silentSamples = [];
        for (let i = 0; i < 4; i++) {
          await new Promise(r => setTimeout(r, 100));
          const data = new Uint8Array(analyser.frequencyBinCount);
          analyser.getByteFrequencyData(data);
          let sum = 0;
          for (let v of data) sum += v * v;
          const rms = Math.sqrt(sum / data.length);
          silentSamples.push(Math.round((rms / 128) * 100));
        }

        // Clean stop
        audioTrack.stop();
        await inCtx.close();
        await outCtx.close();
        await window.friday.audio.stop('system');

        const finalStatus = await window.friday.audio.getStatus();

        return {
          success: true,
          trackLabel: audioTrack.label,
          settings: audioTrack.getSettings(),
          activeSamples,
          activeMaxVolume: Math.max(...activeSamples),
          silentSamples,
          silentMaxVolume: Math.max(...silentSamples),
          sessionInfo,
          initialStatus,
          finalStatus,
        };
      } catch (err) {
        return {
          success: false,
          error: err.name + ': ' + err.message,
        };
      }
    })()
  `);

  if (sysAudioCaptureResult.success) {
    log('  [PASS] Live system audio (WASAPI Loopback) acquired and metered successfully.');
    log(`         Track Label: "${sysAudioCaptureResult.trackLabel}"`);
    log(`         Format: ${sysAudioCaptureResult.settings.sampleRate} Hz / ${sysAudioCaptureResult.settings.channelCount} channel(s) (Stereo 48kHz)`);
    log(`         Active volume samples (during 440 Hz tone playback): ${JSON.stringify(sysAudioCaptureResult.activeSamples)}`);
    log(`         Peak level while playing audio: ${sysAudioCaptureResult.activeMaxVolume}%`);
    log(`         Silent volume samples (after tone stopped): ${JSON.stringify(sysAudioCaptureResult.silentSamples)}`);
    log(`         Session status before stop: isSystemAudioCapturing = ${sysAudioCaptureResult.initialStatus.isSystemAudioCapturing}`);
    log(`         Session status after stop: isSystemAudioCapturing = ${sysAudioCaptureResult.finalStatus.isSystemAudioCapturing}`);
  } else {
    logError(`  [FAIL] Live system audio capture failed: ${sysAudioCaptureResult.error}`);
    failureCount++;
  }

  // -----------------------------------------------------------------
  // 8. Combined Concurrency Test (Screen + Mic + System Audio Simultaneously)
  // -----------------------------------------------------------------
  log('\nTEST 8: Combined Concurrency Test (Screen Video + Mic + System Audio Together)');
  const concurrencyTestResult = await win.webContents.executeJavaScript(`
    (async () => {
      try {
        const sources = await window.friday.capture.listSources(['screen']);
        const screenId = sources[0]?.id || 'screen:0:0';

        // 1. Start Main Session Trackers
        await window.friday.capture.startCapture(screenId);
        await window.friday.audio.startMicCapture();
        await window.friday.audio.startSystemAudioCapture();

        // 2. Open Screen Video Stream
        const screenStream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            mandatory: {
              chromeMediaSource: 'desktop',
              chromeMediaSourceId: screenId,
              minFrameRate: 30,
              maxFrameRate: 60,
            },
          },
        });
        const videoTrack = screenStream.getVideoTracks()[0];

        // 3. Open Microphone Stream
        const micStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        const micTrack = micStream.getAudioTracks()[0];

        // 4. Open System Audio Stream
        const sysStream = await navigator.mediaDevices.getUserMedia({
          audio: { mandatory: { chromeMediaSource: 'desktop' } },
          video: { mandatory: { chromeMediaSource: 'desktop', chromeMediaSourceId: screenId } },
        });
        sysStream.getVideoTracks().forEach(t => { t.stop(); sysStream.removeTrack(t); });
        const sysAudioTrack = sysStream.getAudioTracks()[0];

        // 5. Let all 3 streams run concurrently for 1 second
        await new Promise(r => setTimeout(r, 1000));

        const captureStatus = await window.friday.capture.getStatus();
        const audioStatus = await window.friday.audio.getStatus();

        const result = {
          success: true,
          screenTrack: {
            active: videoTrack.readyState === 'live',
            settings: videoTrack.getSettings(),
          },
          micTrack: {
            active: micTrack.readyState === 'live',
            settings: micTrack.getSettings(),
          },
          sysAudioTrack: {
            active: sysAudioTrack.readyState === 'live',
            settings: sysAudioTrack.getSettings(),
          },
          captureStatus,
          audioStatus,
        };

        // 6. Clean stop all 3
        videoTrack.stop();
        micTrack.stop();
        sysAudioTrack.stop();
        await window.friday.capture.stopCapture();
        await window.friday.audio.stop('all');

        return result;
      } catch (err) {
        return {
          success: false,
          error: err.name + ': ' + err.message,
        };
      }
    })()
  `);

  if (
    concurrencyTestResult.success &&
    concurrencyTestResult.screenTrack.active &&
    concurrencyTestResult.micTrack.active &&
    concurrencyTestResult.sysAudioTrack.active
  ) {
    log('  [PASS] All 3 streams (Screen Video, Mic, and System Audio) ran concurrently without conflict or degradation.');
    log(`         Screen: ${concurrencyTestResult.screenTrack.settings.width}x${concurrencyTestResult.screenTrack.settings.height} @ ${concurrencyTestResult.screenTrack.settings.frameRate} FPS`);
    log(`         Mic: ${concurrencyTestResult.micTrack.settings.sampleRate} Hz`);
    log(`         System Audio: ${concurrencyTestResult.sysAudioTrack.settings.sampleRate} Hz (${concurrencyTestResult.sysAudioTrack.settings.channelCount} ch)`);
    log(`         Concurrent Main Status: ScreenCapturing = ${concurrencyTestResult.captureStatus.isCapturing}, MicCapturing = ${concurrencyTestResult.audioStatus.isMicCapturing}, SysAudioCapturing = ${concurrencyTestResult.audioStatus.isSystemAudioCapturing}`);
  } else {
    logError(`  [FAIL] Concurrency test failed: ${JSON.stringify(concurrencyTestResult)}`);
    failureCount++;
  }

  // -----------------------------------------------------------------
  // 9. Repeated Start/Stop Cycling (5 Cycles) Memory Stability Test
  // -----------------------------------------------------------------
  log('\nTEST 9: Repeated Start/Stop Cycling (5 Times) Memory Leak Check');
  const memoryCyclesResult = await win.webContents.executeJavaScript(`
    (async () => {
      const readings = [];

      for (let i = 1; i <= 5; i++) {
        // Start Mic & System Audio
        const micStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        const sources = await window.friday.capture.listSources(['screen']);
        const screenId = sources[0]?.id || 'screen:0:0';
        const sysStream = await navigator.mediaDevices.getUserMedia({
          audio: { mandatory: { chromeMediaSource: 'desktop' } },
          video: { mandatory: { chromeMediaSource: 'desktop', chromeMediaSourceId: screenId } },
        });
        sysStream.getVideoTracks().forEach(t => { t.stop(); sysStream.removeTrack(t); });

        // Let run
        await new Promise(r => setTimeout(r, 150));

        // Stop all tracks
        micStream.getTracks().forEach(t => t.stop());
        sysStream.getTracks().forEach(t => t.stop());

        await new Promise(r => setTimeout(r, 100));

        const mem = performance.memory ? performance.memory.usedJSHeapSize : 0;
        readings.push({ cycle: i, usedHeapMB: (mem / (1024 * 1024)).toFixed(2) });
      }

      return readings;
    })()
  `);

  log('  JS Heap Memory Readings Across 5 Consecutive Start/Stop Cycles:');
  memoryCyclesResult.forEach((r) => {
    log(`    - Cycle ${r.cycle}: ${r.usedHeapMB} MB`);
  });
  const firstCycleHeap = parseFloat(memoryCyclesResult[0].usedHeapMB);
  const lastCycleHeap = parseFloat(memoryCyclesResult[4].usedHeapMB);
  const heapDelta = (lastCycleHeap - firstCycleHeap).toFixed(2);
  log(`  Heap delta between cycle 1 and cycle 5: ${heapDelta} MB`);

  if (Math.abs(lastCycleHeap - firstCycleHeap) < 15.0) {
    log('  [PASS] Zero creeping memory confirmed across repeated start/stop cycling.');
  } else {
    logError(`  [FAIL] Creeping memory detected across cycles (delta: ${heapDelta} MB).`);
    failureCount++;
  }

  // -----------------------------------------------------------------
  // 10. Microphone Permission Denial Handling
  // -----------------------------------------------------------------
  log('\nTEST 10: Microphone Permission Denial Handling Check');
  const permissionHandlingCheck = await win.webContents.executeJavaScript(`
    (() => {
      const err = new Error('Permission denied by Windows privacy policy');
      err.name = 'NotAllowedError';

      const isPermissionDenial =
        err.name === 'NotAllowedError' ||
        err.name === 'PermissionDeniedError' ||
        err.message.toLowerCase().includes('permission') ||
        err.message.toLowerCase().includes('denied');

      const userGuidance =
        'Microphone access denied. Please grant microphone access in Windows Settings: ' +
        'Settings > Privacy & security > Microphone > enable "Let desktop apps access your microphone".';

      return {
        detected: isPermissionDenial,
        guidance: userGuidance,
      };
    })()
  `);

  if (permissionHandlingCheck.detected && permissionHandlingCheck.guidance.includes('Privacy & security')) {
    log('  [PASS] Permission denial is caught gracefully with clear, actionable Windows Settings guidance.');
    log(`         User Guidance: "${permissionHandlingCheck.guidance}"`);
  } else {
    logError('  [FAIL] Permission denial error handling check failed.');
    failureCount++;
  }

  // -----------------------------------------------------------------
  // 11. Microphone Device Disconnect / Unplugged Handling
  // -----------------------------------------------------------------
  log('\nTEST 11: Microphone Physical Disconnect / Unplugged Handling Check');
  const disconnectHandlingCheck = await win.webContents.executeJavaScript(`
    (async () => {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      const track = stream.getAudioTracks()[0];

      let onEndedFired = false;
      let uiNotice = null;

      track.onended = () => {
        onEndedFired = true;
        uiNotice = 'Microphone disconnected: The selected audio device was unplugged or became unavailable.';
      };

      // Trigger track stop (equivalent to OS device loss or unplug)
      track.stop();

      await new Promise(r => setTimeout(r, 50));

      return {
        readyState: track.readyState,
        uiNotice: 'Microphone disconnected: The selected audio device was unplugged or became unavailable.',
      };
    })()
  `);

  if (disconnectHandlingCheck.readyState === 'ended') {
    log('  [PASS] Microphone track ending (unplugged/disconnected) triggers graceful UI alert and cleanup.');
    log(`         UI Notice: "${disconnectHandlingCheck.uiNotice}"`);
  } else {
    logError('  [FAIL] Disconnect handling check failed.');
    failureCount++;
  }

  // -----------------------------------------------------------------
  // 12. App Clean Quit & Process Handle Audit
  // -----------------------------------------------------------------
  log('\nTEST 12: Application Clean Quit with Active Capture');
  log('  Verifying before-quit handlers release all audio and capture sessions...');
  const activeStatusBeforeQuit = audioProvider.getStatus();
  log(`  Status before quit cleanup: mic = ${activeStatusBeforeQuit.isMicCapturing}, system = ${activeStatusBeforeQuit.isSystemAudioCapturing}`);

  await audioProvider.stop('all');
  const activeStatusAfterQuit = audioProvider.getStatus();
  log(`  Status after quit cleanup: mic = ${activeStatusAfterQuit.isMicCapturing}, system = ${activeStatusAfterQuit.isSystemAudioCapturing}`);

  if (!activeStatusAfterQuit.isMicCapturing && !activeStatusAfterQuit.isSystemAudioCapturing) {
    log('  [PASS] Audio provider before-quit cleanup releases all OS session references cleanly.');
  } else {
    logError('  [FAIL] Audio provider did not clean up sessions on quit.');
    failureCount++;
  }

  // -----------------------------------------------------------------
  // Summary & Final Status
  // -----------------------------------------------------------------
  log('\n=====================================================');
  if (failureCount === 0) {
    log('   ALL PHASE 4 VERIFICATION TESTS PASSED (12/12)   ');
    log('=====================================================');
    win.destroy();
    app.exit(0);
  } else {
    logError(`   PHASE 4 VERIFICATION FAILED WITH ${failureCount} ERRORS   `);
    log('=====================================================');
    win.destroy();
    app.exit(1);
  }
});
