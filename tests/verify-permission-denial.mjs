import { app, BrowserWindow, systemPreferences } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import { createRequire } from 'module';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const require = createRequire(import.meta.url);

function setWindowsMicPrivacy(value) {
  // value: 'Deny' or 'Allow'
  execSync(
    `powershell.exe -NoProfile -Command "Set-ItemProperty -Path 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\CapabilityAccessManager\\ConsentStore\\microphone\\NonPackaged' -Name 'Value' -Value '${value}'; Set-ItemProperty -Path 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\CapabilityAccessManager\\ConsentStore\\microphone' -Name 'Value' -Value '${value}'"`
  );
}

function getWindowsMicPrivacy() {
  const out = execSync(
    `powershell.exe -NoProfile -Command "(Get-ItemProperty -Path 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\CapabilityAccessManager\\ConsentStore\\microphone\\NonPackaged').Value"`
  );
  return out.toString().trim();
}


app.setName('Friday Recorder');

app.whenReady().then(async () => {
  console.log('=== REAL WINDOWS MICROPHONE PRIVACY & PERMISSION DENIAL TEST ===');

  try {
    const originalSetting = getWindowsMicPrivacy();
    console.log(`[Privacy Test] Original Windows microphone privacy setting: "${originalSetting}"`);

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

    // -------------------------------------------------------------
    // PHASE 1: TOGGLE MICROPHONE PRIVACY TO "DENIED"
    // -------------------------------------------------------------
    console.log('\n--- STEP 1: TOGGLING WINDOWS MICROPHONE PRIVACY TO OFF (DENY) ---');
    setWindowsMicPrivacy('Deny');
    const privacyStateDenied = getWindowsMicPrivacy();
    console.log(`[Privacy Test] Windows registry CapabilityAccessManager: Value = "${privacyStateDenied}"`);

    // Test capture attempt in renderer with privacy Denied
    const deniedAttemptResult = await win.webContents.executeJavaScript(`
      (async () => {
        try {
          // Attempt startMicCapture through app flow
          await window.friday.audio.startMicCapture();
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
          return { success: true };
        } catch (err) {
          const errObj = {
            name: err.name || 'Error',
            message: err.message || String(err),
          };

          // Check if App UI error banner would display guidance
          let uiGuidance = null;
          if (
            err.name === 'NotAllowedError' ||
            err.name === 'PermissionDeniedError' ||
            errObj.message.toLowerCase().includes('permission') ||
            errObj.message.toLowerCase().includes('privacy') ||
            errObj.message.toLowerCase().includes('denied')
          ) {
            uiGuidance =
              'Microphone access denied. Please grant microphone access in Windows Settings: ' +
              'Settings > Privacy & security > Microphone > enable "Let desktop apps access your microphone".';
          }

          return {
            success: false,
            errorName: errObj.name,
            errorMessage: errObj.message,
            uiGuidance,
          };
        }
      })()
    `);

    console.log('[Privacy Test] Result with microphone privacy OFF:');
    console.log('  Success:', deniedAttemptResult.success);
    console.log('  Error Name:', deniedAttemptResult.errorName);
    console.log('  Error Message:', deniedAttemptResult.errorMessage);
    console.log('  UI Guidance State:', deniedAttemptResult.uiGuidance);

    // -------------------------------------------------------------
    // PHASE 2: TOGGLE MICROPHONE PRIVACY BACK TO "ALLOWED"
    // -------------------------------------------------------------
    console.log('\n--- STEP 2: TOGGLING WINDOWS MICROPHONE PRIVACY BACK TO ON (ALLOW) ---');
    setWindowsMicPrivacy('Allow');
    const privacyStateAllowed = getWindowsMicPrivacy();
    console.log(`[Privacy Test] Windows registry CapabilityAccessManager: Value = "${privacyStateAllowed}"`);

    // Test capture attempt in renderer with privacy Restored
    const allowedAttemptResult = await win.webContents.executeJavaScript(`
      (async () => {
        try {
          await window.friday.audio.startMicCapture();
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
          const track = stream.getAudioTracks()[0];
          
          const audioCtx = new AudioContext();
          const src = audioCtx.createMediaStreamSource(stream);
          const analyser = audioCtx.createAnalyser();
          analyser.fftSize = 256;
          src.connect(analyser);

          await new Promise(r => setTimeout(r, 200));

          const data = new Uint8Array(analyser.frequencyBinCount);
          analyser.getByteFrequencyData(data);
          let sum = 0;
          for (let v of data) sum += v * v;
          const rms = Math.sqrt(sum / data.length);
          const volume = Math.min(100, Math.round((rms / 128) * 100));

          // Clean stop
          track.stop();
          await audioCtx.close();
          await window.friday.audio.stop('mic');

          return {
            success: true,
            trackLabel: track.label,
            trackReadyState: track.readyState,
            measuredVolume: volume,
          };
        } catch (err) {
          return {
            success: false,
            error: err.name + ': ' + err.message,
          };
        }
      })()
    `);

    console.log('[Privacy Test] Result with microphone privacy ON (Restored):');
    console.log('  Success:', allowedAttemptResult.success);
    console.log('  Track Label:', allowedAttemptResult.trackLabel);
    console.log('  Track ReadyState:', allowedAttemptResult.trackReadyState);
    console.log('  Measured Volume:', allowedAttemptResult.measuredVolume, '%');

    // Ensure registry is restored to original state
    setWindowsMicPrivacy(originalSetting);
    console.log(`\n[Privacy Test] Restored original Windows privacy setting: "${getWindowsMicPrivacy()}"`);

    console.log('=== REAL WINDOWS PRIVACY PERMISSION TEST COMPLETE ===');
    win.destroy();
    app.exit(0);
  } catch (err) {
    console.error('Privacy test failed:', err);
    // Safety fallback: restore to Allow
    try { setWindowsMicPrivacy('Allow'); } catch {}
    app.exit(1);
  }
});
