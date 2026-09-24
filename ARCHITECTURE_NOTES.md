# Architecture Notes — Friday Recorder

## Phase 3: Screen Capture Architecture Decision

### Context
Friday Recorder requires a high-performance, low-latency screen and window capture pipeline on Windows 10/11 capable of 60 FPS capture at high resolutions (1080p, 1440p, 4K) across multi-monitor setups and arbitrary Windows DPI scaling factors (100%, 125%, 150%, 200%).

We evaluated two technical pathways:
1. **Electron Built-in `desktopCapturer` + Chromium WebRTC Media Capture Pipeline** (`navigator.mediaDevices.getUserMedia` with `chromeMediaSource: 'desktop'`).
2. **Custom Native Node.js C++/WinRT Windows Graphics Capture (WGC) Addon** (via Direct3D 11 / `Windows.Graphics.Capture`).

---

### Evaluation & Technical Analysis

| Dimension | Option 1: Electron `desktopCapturer` + Chromium WebRTC | Option 2: Custom C++/WinRT Native Addon |
| :--- | :--- | :--- |
| **Underlying OS Mechanism** | Leverages Chromium's internal Windows implementation: **Desktop Duplication API (DXGI)** for full-screen desktop capture and **Windows Graphics Capture (WGC)** / GDI for window capture. | Directly calls `Windows.Graphics.Capture` WinRT APIs and D3D11 device interop. |
| **GPU Acceleration & Zero-Copy** | Captures directly to DirectX surfaces within Chromium's GPU process. Frames feed straight into the Chromium compositor and `<video>` elements without IPC serialization overhead. | Requires manual D3D11 staging textures, custom shared memory IPC (or WebGL/DirectX texture sharing), or CPU pixel buffer copies across Node C++ boundary. |
| **Frame Rates & Latency** | Proven 60 FPS hardware-accelerated throughput with built-in frame dropping and timestamp synchronization handled by WebRTC. | Requires custom pacing loop, frame timestamping, and queue management in C++. |
| **DPI & Multi-Monitor** | Full multi-monitor enumeration and automatic DPI scaling handling across heterogeneous display configurations via Chromium's display management. | Requires manual calculation of physical vs. logical pixels, monitor bounds, coordinate translation, and per-monitor DPI awareness. |
| **Lifecycle & Window Occlusion** | Automatically emits `track.onended` when a captured window is destroyed. WGC mode captures obscured/occluded windows cleanly without visual artifacts. | Requires registering WinRT closed events and handling device loss (`DXGI_ERROR_DEVICE_RESET`) manually. |
| **Toolchain & Maintenance Risk** | Zero external native compilation dependencies. 100% stable across Electron/Node runtime updates without ABI breakage (`node-gyp`, MSVC, Visual Studio C++ build tools). | High maintenance overhead: requires MSVC C++20, C++/WinRT headers, Windows SDK targeting, and native binary rebuilds on every Electron upgrade. |
| **Resource Cleanup** | Standardized `MediaStreamTrack.stop()` cleanly destroys native capture handles in Chromium's media engine, verified to prevent memory leaks. | Manual COM reference counting, Direct3D resource release, and memory leak vulnerability if cleanup paths misfire. |

---

### Decision: Electron `desktopCapturer` + Chromium WebRTC

**Selected Strategy:** Option 1 (Electron `desktopCapturer` + Chromium WebRTC).

**Justification:**
1. **Native OS Capture Parity:** Chromium's screen capture backend on modern Windows 10/11 already utilizes the Windows Graphics Capture (WGC) API for window capture and DXGI Desktop Duplication for screen capture. A custom native addon would duplicate the exact same underlying Windows APIs while adding severe complexity.
2. **Zero IPC Frame Overhead for Preview & Recording:** By utilizing `getUserMedia({ video: { mandatory: { chromeMediaSourceId: sourceId } } })`, frames flow directly through Chromium's hardware pipeline to `<video>` preview elements with zero frame serialization over Electron IPC.
3. **Robust Window & Display Lifecycle:** Window destruction, display reconfiguration, and stream termination are natively reported via standard W3C `MediaStreamTrack` events (`onended`).
4. **Architectural Abstraction:** We encapsulate all capture orchestration behind an abstracted `CaptureProvider` interface (`electron/main/capture/CaptureProvider.ts`) with a concrete `WindowsCaptureProvider.ts`. If future phases encounter specific edge-case limitations (e.g. custom cursor compositing or specialized DirectX texture injection for external shaders), the provider implementation can be swapped or extended without impacting the renderer or recording pipeline contracts.

---

### Architectural Implementation Pattern
- **Main Process (`electron/main/capture/`):**
  - `CaptureProvider`: Interface defining `listSources()`, `startCapture(sourceId, options)`, and `stopCapture()`.
  - `WindowsCaptureProvider`: Concrete implementation invoking `desktopCapturer.getSources()` with thumbnail generation, display metrics matching (`screen.getAllDisplays()`), and lifecycle tracking.
  - `captureHandlers.ts`: Exposes typed IPC channels (`capture:listSources`, `capture:start`, `capture:stop`, `capture:getStatus`) with sender frame validation and argument sanitization.
- **Preload (`electron/preload/index.ts`):**
  - Exposes `window.friday.capture` methods via contextBridge.
- **Renderer (`src/`):**
  - Invokes `friday.capture.startCapture()` to register the session in the main process, then initializes `navigator.mediaDevices.getUserMedia()` to attach the live stream to the preview `<video>` element.
  - Listens for `track.onended` to gracefully handle closed windows or lost capture sources.

---

## Phase 4: Audio Capture Architecture Decision (Microphone & System Audio)

### Context
Friday Recorder requires high-fidelity, low-latency audio capture on Windows 10/11:
1. **Microphone Capture:** Capturing live user voice from built-in microphone arrays, USB podcast microphones, headsets, or virtual audio devices (e.g. NVIDIA Broadcast, Elgato Wave Link).
2. **System Audio Capture:** Capturing desktop ("what you hear") audio (system sounds, video playback, browser audio, meeting participants) independently from microphone input.
3. **Concurrency:** Both audio sources must operate independently and concurrently alongside 60 FPS screen capture (Phase 3) without degrading frame rate, introducing audio stutter, or causing IPC bottlenecks.

---

### System Audio Capture on Windows: Options & Technical Analysis

Capturing system audio ("loopback" audio) on Windows presents distinct architectural choices:

| Dimension | Option 1: Chromium Desktop Media Capture (`chromeMediaSource: 'desktop'` with Audio) | Option 2: Custom Native Node C++ Addon (WASAPI Loopback via `IAudioClient`) | Option 3: Virtual Audio Cable / Stereo Mix Driver |
| :--- | :--- | :--- | :--- |
| **Underlying Windows API** | Chromium's internal **WASAPI (Windows Audio Session API) Loopback** client (`media::AudioInputStream` on default render endpoint). | Direct COM calls to Windows Core Audio APIs: `IMMDeviceEnumerator` -> `eRender` -> `eConsole` -> `IAudioClient::Initialize(AUDCLNT_STREAMFLAGS_LOOPBACK)`. | Virtual WDM audio driver or third-party filter driver. |
| **Platform Integration** | Built directly into Electron's Chromium media pipeline. Zero external native dependencies. Zero compilation toolchain risk. | Requires custom C++ native addon (`node-gyp` or CMake.js), native COM threading, ring-buffer FIFO management, and Node-API interop. | Requires user to install external kernel or virtual drivers (VB-CABLE, Virtual Audio Cable), introducing severe friction and failure modes. |
| **Data Flow & Zero-Copy** | Captures loopback audio into a standard W3C `MediaStreamAudioTrack` inside the Chromium media pipeline. Ready for zero-copy Web Audio processing, live analysis, and future WebCodecs/MediaRecorder muxing. | Captures raw PCM buffers across the C++/Node boundary, requiring manual buffer copying, format conversion, and IPC bridging to the renderer. | N/A (Driver-dependent). |
| **Format & Latency** | Automatically resamples to the platform's default mix format (standard 48 kHz / 16-bit or 32-bit float stereo). Extremely low latency (~10–20ms). | Full control over WASAPI packet size and exclusive vs. shared mode, but high risk of buffer underruns if Node event loop experiences jitter. | Variable and unstable. |
| **Hardware & OS Compatibility** | 100% compatible with Windows 10 (1809+) and Windows 11 out of the box without requiring elevated administrator privileges or driver installation. | 100% compatible with Windows Core Audio, but requires maintenance against Windows SDK and Node ABI updates. | Often fails on OEM laptops with disabled "Stereo Mix" or locked audio policies. |

---

### Architectural Finding & System Audio Constraint in Electron/Chromium

During architectural discovery and hardware probing on Windows, a critical Chromium constraint was uncovered:

> **The Chromium Desktop Audio Constraint:**
> In Chromium/Electron on Windows, invoking `navigator.mediaDevices.getUserMedia({ audio: { mandatory: { chromeMediaSource: 'desktop' } }, video: false })` causes an immediate, uncatchable fatal renderer crash (`bad_message.cc(29) reason 263: BAD_MEDIA_STREAM_REQUEST`). Chromium's desktop media stream validator explicitly requires a video track descriptor when `chromeMediaSource: 'desktop'` is declared.
>
> **The Solution:**
> To deliver a clean, standalone `startSystemAudioCapture()` API that does not require an active screen preview:
> 1. The audio provider initiates a desktop stream requesting loopback audio alongside a video constraint targeted at any available display (`chromeMediaSourceId: screenSourceId`).
> 2. Immediately upon obtaining the media stream, the provider stops and detaches the video track (`videoTrack.stop()`, `stream.removeTrack(videoTrack)`).
> 3. The remaining stream contains **only** the live system audio loopback track (`label: "System Audio"`, 48 kHz stereo, `readyState: 'live'`).
> 4. Verified behavior: Chromium's media pipeline continues delivering the WASAPI loopback audio stream with zero video rendering or GPU composition overhead.

---

### Decision: Abstracted AudioProvider with Chromium WebRTC & Web Audio Engine

**Selected Strategy:** 
- **Microphone:** W3C Media Capture API (`getUserMedia({ audio: { deviceId: { exact: id } } })`) with real device enumeration via Windows Core Audio through Chromium's `enumerateDevices()`.
- **System Audio:** Chromium's built-in WASAPI loopback capture mechanism initialized via desktop constraints and decoupled from video.
- **Audio Telemetry:** Web Audio API `AudioContext` and `AnalyserNode` calculating real-time RMS signal levels for responsive volume meters in the test UI.
- **Main Process Abstraction:** `AudioProvider` interface (`electron/main/audio/AudioProvider.ts`) with a concrete `WindowsAudioProvider.ts` managing session lifecycle, device validation, and `app.on('before-quit')` cleanup.

### Separation of Concerns
Per the Friday Recorder architectural guidelines, microphone capture and system audio capture are kept completely separate:
- Separate methods: `startMicCapture(deviceId)` vs. `startSystemAudioCapture()`.
- Separate lifecycle tracking: `activeMicSession` vs. `activeSystemAudioSession`.
- Separate test UI meters and toggle controls: microphone and system audio can be started, adjusted, and stopped independently without touching or resetting each other.

