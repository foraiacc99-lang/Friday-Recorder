import { useCallback, useEffect, useRef, useState } from 'react';
import type { CaptureSource } from '../../shared/types';

export interface StreamMetrics {
  width: number;
  height: number;
  frameRate: number;
  aspectRatio: number;
  trackReadyState: string;
  trackLabel: string;
}

export function useCapturePreview() {
  const [sources, setSources] = useState<CaptureSource[]>([]);
  const [selectedSourceId, setSelectedSourceId] = useState<string>('');
  const [isLoadingSources, setIsLoadingSources] = useState<boolean>(false);
  const [isCapturing, setIsCapturing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [metrics, setMetrics] = useState<StreamMetrics | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const activeStreamRef = useRef<MediaStream | null>(null);

  /**
   * Refreshes the list of available screen and window capture sources.
   */
  const refreshSources = useCallback(async () => {
    setIsLoadingSources(true);
    setError(null);
    try {
      if (typeof window !== 'undefined' && window.friday?.capture?.listSources) {
        const availableSources = await window.friday.capture.listSources();
        setSources(availableSources);

        // Keep existing selection if valid, otherwise select first available source
        setSelectedSourceId((prev) => {
          if (prev && availableSources.some((s) => s.id === prev)) {
            return prev;
          }
          return availableSources.length > 0 ? (availableSources[0]?.id ?? '') : '';
        });
      } else {
        setError('Friday capture bridge is unavailable in this environment.');
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(`Failed to list capture sources: ${msg}`);
    } finally {
      setIsLoadingSources(false);
    }
  }, []);

  /**
   * Cleanly stops the active stream and notifies the main process.
   */
  const stopCapture = useCallback(async () => {
    try {
      if (activeStreamRef.current) {
        const tracks = activeStreamRef.current.getTracks();
        tracks.forEach((track) => {
          track.onended = null;
          track.stop();
        });
        activeStreamRef.current = null;
      }

      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }

      setMetrics(null);
      setIsCapturing(false);

      if (typeof window !== 'undefined' && window.friday?.capture?.stopCapture) {
        await window.friday.capture.stopCapture();
      }
    } catch (err) {
      console.error('[useCapturePreview] Error stopping capture:', err);
    }
  }, []);

  /**
   * Starts capturing the selected source and binds the video stream to the preview element.
   */
  const startCapture = useCallback(
    async (sourceIdOverride?: string) => {
      const targetSourceId = sourceIdOverride || selectedSourceId;
      if (!targetSourceId) {
        setError('Please select a screen or window source to preview.');
        return;
      }

      setError(null);

      // Stop any existing capture first
      if (isCapturing) {
        await stopCapture();
      }

      try {
        // 1. Notify main process to validate source and register session
        if (typeof window !== 'undefined' && window.friday?.capture?.startCapture) {
          await window.friday.capture.startCapture(targetSourceId);
        } else {
          throw new Error('Friday capture IPC bridge unavailable');
        }

        // 2. Request userMedia stream from Chromium's native capture engine
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
          throw new Error('navigator.mediaDevices.getUserMedia is not supported in this context');
        }

        const constraints: MediaStreamConstraints = {
          audio: false,
          video: {
            // @ts-expect-error - Chromium desktop capture constraints
            mandatory: {
              chromeMediaSource: 'desktop',
              chromeMediaSourceId: targetSourceId,
              minWidth: 640,
              maxWidth: 3840,
              minHeight: 480,
              maxHeight: 2160,
              minFrameRate: 30,
              maxFrameRate: 60,
            },
          },
        };

        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        activeStreamRef.current = stream;

        const videoTrack = stream.getVideoTracks()[0];
        if (!videoTrack) {
          throw new Error('No video track available in captured stream');
        }

        // 3. Handle graceful termination if the captured window/display is closed mid-capture
        videoTrack.onended = () => {
          console.warn('[useCapturePreview] Capture track ended (source closed or removed)');
          void stopCapture();
          setError('Capture ended: The captured window or display was closed or became unavailable.');
        };

        // 4. Attach stream to preview video element
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.onloadedmetadata = () => {
            if (videoRef.current) {
              const settings = videoTrack.getSettings();
              setMetrics({
                width: videoRef.current.videoWidth || settings.width || 0,
                height: videoRef.current.videoHeight || settings.height || 0,
                frameRate: settings.frameRate || 30,
                aspectRatio: settings.aspectRatio || 16 / 9,
                trackReadyState: videoTrack.readyState,
                trackLabel: videoTrack.label || 'Screen Video Stream',
              });
            }
          };
          try {
            await videoRef.current.play();
          } catch (playErr) {
            console.warn('[useCapturePreview] Autoplay was prevented:', playErr);
          }
        }

        setIsCapturing(true);
      } catch (err) {
        console.error('[useCapturePreview] Capture failed:', err);
        // Ensure main process session is reset if renderer media capture fails
        void stopCapture();
        const msg = err instanceof Error ? err.message : String(err);
        setError(`Capture error: ${msg}`);
      }
    },
    [selectedSourceId, isCapturing, stopCapture]
  );

  // Initial source enumeration on mount
  useEffect(() => {
    void refreshSources();
  }, [refreshSources]);

  // Clean up on component unmount and window reload
  useEffect(() => {
    const handleBeforeUnload = () => {
      void stopCapture();
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      void stopCapture();
    };
  }, [stopCapture]);

  return {
    sources,
    selectedSourceId,
    setSelectedSourceId,
    isLoadingSources,
    isCapturing,
    error,
    metrics,
    videoRef,
    refreshSources,
    startCapture,
    stopCapture,
  };
}
