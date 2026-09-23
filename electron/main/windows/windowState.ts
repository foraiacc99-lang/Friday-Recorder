import { app, BrowserWindow, screen } from 'electron';
import fs from 'fs';
import path from 'path';

export interface WindowState {
  x?: number;
  y?: number;
  width: number;
  height: number;
  isMaximized: boolean;
}

const DEFAULT_STATE: WindowState = {
  width: 1200,
  height: 800,
  isMaximized: false,
};

function getStateFilePath(): string {
  return path.join(app.getPath('userData'), 'window-state.json');
}

/**
 * Loads persisted window state or falls back to defaults.
 * Validates whether the coordinates reside on an active display.
 */
export function loadWindowState(): WindowState {
  try {
    const filePath = getStateFilePath();
    if (!fs.existsSync(filePath)) {
      return { ...DEFAULT_STATE };
    }

    const data = fs.readFileSync(filePath, 'utf-8');
    const parsed = JSON.parse(data) as Partial<WindowState>;

    const width = typeof parsed.width === 'number' && parsed.width >= 900 ? parsed.width : DEFAULT_STATE.width;
    const height = typeof parsed.height === 'number' && parsed.height >= 600 ? parsed.height : DEFAULT_STATE.height;
    const isMaximized = Boolean(parsed.isMaximized);

    const state: WindowState = {
      width,
      height,
      isMaximized,
    };

    if (typeof parsed.x === 'number' && typeof parsed.y === 'number') {
      // Validate that the saved bounds overlap with at least one active screen display
      const targetBounds = { x: parsed.x, y: parsed.y, width, height };
      const matchingDisplay = screen.getDisplayMatching(targetBounds);

      const isWithinBounds =
        targetBounds.x >= matchingDisplay.bounds.x - 200 &&
        targetBounds.y >= matchingDisplay.bounds.y - 100 &&
        targetBounds.x < matchingDisplay.bounds.x + matchingDisplay.bounds.width &&
        targetBounds.y < matchingDisplay.bounds.y + matchingDisplay.bounds.height;

      if (isWithinBounds) {
        state.x = parsed.x;
        state.y = parsed.y;
      }
    }

    return state;
  } catch {
    return { ...DEFAULT_STATE };
  }
}

/**
 * Saves window state to a local JSON file in userData.
 */
export function saveWindowState(window: BrowserWindow): void {
  try {
    if (window.isDestroyed()) return;

    const isMaximized = window.isMaximized();
    let bounds = window.getNormalBounds();

    if (!bounds || bounds.width < 100 || bounds.height < 100) {
      bounds = window.getBounds();
    }

    const state: WindowState = {
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height,
      isMaximized,
    };

    const filePath = getStateFilePath();
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(state, null, 2), 'utf-8');
  } catch (error) {
    console.error('Failed to save window state:', error);
  }
}
