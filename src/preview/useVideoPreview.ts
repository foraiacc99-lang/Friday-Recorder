import { useCallback, useEffect, useRef, useState } from 'react';
import { VideoPreviewCompositor } from './VideoPreviewCompositor';
import type { ImportedMediaItem } from '../../shared/types';

export interface UseVideoPreviewResult {
  canvasRef: React.RefObject<HTMLCanvasElement>;
  containerRef: React.RefObject<HTMLDivElement>;
  currentTime: number;
  duration: number;
  isPlaying: boolean;
  isBuffering: boolean;
  isMuted: boolean;
  volume: number;
  error: string | null;
  videoWidth: number;
  videoHeight: number;
  timeToInteractiveMs: number | null;
  play: () => Promise<void>;
  pause: () => void;
  togglePlay: () => void;
  seek: (seconds: number) => void;
  stepFrame: (forward: boolean) => void;
  setVolume: (vol: number) => void;
  toggleMute: () => void;
  clearError: () => void;
}

export function useVideoPreview(mediaItem: ImportedMediaItem | null): UseVideoPreviewResult {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const compositorRef = useRef<VideoPreviewCompositor | null>(null);

  const [currentTime, setCurrentTime] = useState<number>(0);
  const [duration, setDuration] = useState<number>(mediaItem?.metadata.durationSeconds || 0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [isBuffering, setIsBuffering] = useState<boolean>(false);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [volume, setVolumeState] = useState<number>(1);
  const [error, setError] = useState<string | null>(null);
  const [videoWidth, setVideoWidth] = useState<number>(mediaItem?.metadata.width || 0);
  const [videoHeight, setVideoHeight] = useState<number>(mediaItem?.metadata.height || 0);
  const [timeToInteractiveMs, setTimeToInteractiveMs] = useState<number | null>(null);

  // Rapid scrub throttle using requestAnimationFrame
  const pendingSeekRef = useRef<number | null>(null);
  const seekRafIdRef = useRef<number | null>(null);

  // ResizeObserver for canvas resolution matching container dimensions
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0 && compositorRef.current) {
          // Multiply by devicePixelRatio for crisp High-DPI preview rendering
          const dpr = window.devicePixelRatio || 1;
          compositorRef.current.resize(Math.round(width * dpr), Math.round(height * dpr));
        }
      }
    });

    ro.observe(container);
    return () => ro.disconnect();
  }, []);

  // Initialize and load video into compositor
  useEffect(() => {
    if (!mediaItem || !canvasRef.current) return;

    // Check if media is missing before attempting playback
    if (mediaItem.isAvailable === false) {
      setError(`Cannot load missing video: "${mediaItem.fileName}" was not found on disk.`);
      return;
    }

    const canvas = canvasRef.current;
    const t0 = performance.now();

    const compositor = new VideoPreviewCompositor({
      canvas,
      onTimeUpdate: (cur, dur) => {
        setCurrentTime(cur);
        if (dur > 0) setDuration(dur);
      },
      onPlayStateChange: (playing) => {
        setIsPlaying(playing);
      },
      onLoadedMetadata: (w, h, dur) => {
        setVideoWidth(w);
        setVideoHeight(h);
        if (dur > 0) setDuration(dur);
        const tti = Math.round(performance.now() - t0);
        setTimeToInteractiveMs(tti);
      },
      onError: (err) => {
        setError(err);
      },
      onBuffering: (buffering) => {
        setIsBuffering(buffering);
      },
    });

    compositorRef.current = compositor;

    // Resolve URL (use bridge getFileUrl if available, else format file:///)
    let fileUrl = '';
    if (window.friday?.media?.getFileUrl) {
      fileUrl = window.friday.media.getFileUrl(mediaItem.filePath);
    } else {
      const normalized = mediaItem.filePath.replace(/\\/g, '/');
      fileUrl = normalized.startsWith('/') ? `file://${normalized}` : `file:///${normalized}`;
    }

    compositor
      .loadVideo(fileUrl, mediaItem.metadata.durationSeconds)
      .catch((err) => {
        const msg = err instanceof Error ? err.message : String(err);
        setError(`Failed to open video: ${msg}`);
      });

    return () => {
      compositor.destroy();
      compositorRef.current = null;
    };
  }, [mediaItem]);

  const play = useCallback(async () => {
    if (compositorRef.current) {
      await compositorRef.current.play();
    }
  }, []);

  const pause = useCallback(() => {
    if (compositorRef.current) {
      compositorRef.current.pause();
    }
  }, []);

  const togglePlay = useCallback(() => {
    if (compositorRef.current) {
      compositorRef.current.togglePlay();
    }
  }, []);

  // Frame-accurate and smooth rapid seek handler
  const seek = useCallback((targetSeconds: number) => {
    if (!compositorRef.current) return;
    pendingSeekRef.current = targetSeconds;
    setCurrentTime(targetSeconds);

    if (seekRafIdRef.current === null) {
      seekRafIdRef.current = requestAnimationFrame(() => {
        seekRafIdRef.current = null;
        if (pendingSeekRef.current !== null && compositorRef.current) {
          const t = pendingSeekRef.current;
          pendingSeekRef.current = null;
          void compositorRef.current.seek(t, false);
        }
      });
    }
  }, []);

  const stepFrame = useCallback((forward: boolean) => {
    if (compositorRef.current) {
      const fps = mediaItem?.metadata.fps || 60;
      compositorRef.current.stepFrame(forward, fps);
    }
  }, [mediaItem]);

  const setVolume = useCallback((vol: number) => {
    if (compositorRef.current) {
      compositorRef.current.setVolume(vol);
      setVolumeState(compositorRef.current.getVolume());
      setIsMuted(compositorRef.current.isMuted());
    }
  }, []);

  const toggleMute = useCallback(() => {
    if (compositorRef.current) {
      const next = !compositorRef.current.isMuted();
      compositorRef.current.setMuted(next);
      setIsMuted(next);
    }
  }, []);

  const clearError = useCallback(() => setError(null), []);

  return {
    canvasRef,
    containerRef,
    currentTime,
    duration,
    isPlaying,
    isBuffering,
    isMuted,
    volume,
    error,
    videoWidth,
    videoHeight,
    timeToInteractiveMs,
    play,
    pause,
    togglePlay,
    seek,
    stepFrame,
    setVolume,
    toggleMute,
    clearError,
  };
}
