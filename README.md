# Friday Recorder

Friday Recorder is a Windows desktop screen recording and non-destructive video editing application designed to deliver high-performance screen, audio, and webcam capture paired with a modern multi-track timeline editing and export workflow.

## Phase Status

**Current Phase: Phase 1 — Project Foundation (Completed)**
- Core Electron desktop window shell with React 18 and Vite.
- Strict TypeScript configuration across main, preload, renderer, and shared modules.
- Secure Electron execution: `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`.
- Typed IPC bridge plumbing with explicit context isolation (`window.friday`).
- Clean modular directory structure ready to scale into capture, editing, and timeline phases.
- Build tooling and developer scripts configured for Windows x64.

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
