# Friday Recorder

Friday Recorder is a Windows desktop screen recording and non-destructive video editing application designed to deliver high-performance screen, audio, and webcam capture paired with a modern multi-track timeline editing and export workflow.

## Phase Status

**Current Phase: Phase 3 — Windows Screen Capture (Completed & Verified)**
- Abstracted `CaptureProvider` interface (`electron/main/capture/CaptureProvider.ts`).
- Concrete `WindowsCaptureProvider` (`electron/main/capture/WindowsCaptureProvider.ts`) with Electron `desktopCapturer` + Chromium WebRTC engine.
- Justification and tradeoffs documented in `ARCHITECTURE_NOTES.md`.
- Multi-monitor and DPI scaling enrichment from `electron.screen`.
- Strongly typed capture IPC bridge (`capture:listSources`, `capture:start`, `capture:stop`, `capture:getStatus`) with sender origin validation.
- Live video frame preview test UI with real-time stream resolution and frame rate diagnostics.
- Automatic resource cleanup on window destruction and app quit.
- Graceful handling of mid-capture stream termination (`track.onended`).

**Previous Phase: Phase 2 — Electron Desktop Shell (Completed)**

> **Note on App Icon:** The icon in `assets/icon.ico` is a placeholder icon for development. Real branding and custom icon work will be established in a future phase.

## Scripts & Usage

### Development
Launch Vite and Electron concurrently with live hot reload:
```bash
npm run dev
```

### Production Build
Build the React renderer and bundle the Electron main and preload processes:
```bash
npm run build
```

### Type Checking
Run strict TypeScript verification across main, preload, renderer, and shared:
```bash
npm run typecheck
```

### Linting
Run ESLint across the codebase:
```bash
npm run lint
```
