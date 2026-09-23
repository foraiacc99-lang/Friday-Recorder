# Friday Recorder

Friday Recorder is a Windows desktop screen recording and non-destructive video editing application designed to deliver high-performance screen, audio, and webcam capture paired with a modern multi-track timeline editing and export workflow.

## Phase Status

**Current Phase: Phase 2 — Electron Desktop Shell (Completed)**
- Modular window management (`electron/main/windows/mainWindow.ts`).
- Persistent window state (size, position, and maximize state restored between launches via local JSON).
- Single-instance enforcement (`app.requestSingleInstanceLock`) focusing existing window on subsequent launch attempts.
- Native application menu with standard File, Edit, View, and Help ("About Friday Recorder" dialog).
- Crash and unhandled rejection logging to sanitized local error log (`error.log`).
- Typed IPC architecture pattern with single proof-of-concept call (`window.friday.app.getVersion()`).

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
