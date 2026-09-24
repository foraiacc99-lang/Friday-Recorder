import { WindowsAudioProvider } from './WindowsAudioProvider';
import type { AudioProvider } from './AudioProvider';

let defaultAudioProvider: AudioProvider | null = null;

/**
 * Returns the active platform-specific AudioProvider singleton.
 */
export function getAudioProvider(): AudioProvider {
  if (!defaultAudioProvider) {
    defaultAudioProvider = new WindowsAudioProvider();
  }
  return defaultAudioProvider;
}

export * from './AudioProvider';
export * from './WindowsAudioProvider';
