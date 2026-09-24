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
