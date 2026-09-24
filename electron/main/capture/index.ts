import { WindowsCaptureProvider } from './WindowsCaptureProvider';
import type { CaptureProvider } from './CaptureProvider';

let defaultCaptureProvider: CaptureProvider | null = null;

/**
 * Returns the active platform-specific CaptureProvider singleton.
 */
export function getCaptureProvider(): CaptureProvider {
  if (!defaultCaptureProvider) {
    // Concrete Windows provider
    defaultCaptureProvider = new WindowsCaptureProvider();
  }
  return defaultCaptureProvider;
}

export * from './CaptureProvider';
export * from './WindowsCaptureProvider';
