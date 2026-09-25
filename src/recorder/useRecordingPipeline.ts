import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  RecordingFps,
  RecordingOptions,
  RecordingResolution,
  RecordingSessionInfo,
  RecordingState,
  SavedRecordingResult,
} from '../../shared/types';

export interface UseRecordingPipelineReturn {
  recordingState: RecordingState;
  countdown: number;
  elapsedSeconds: number;
  formattedTime: string;
  isPaused: boolean;
  savedResult: SavedRecordingResult | null;
  error: string | null;
  warning: string | null;

  startCountdown: (options: RecordingOptions) => void;
  cancelCountdown: () => void;
  pauseRecording: () => Promise<void>;
  resumeRecording: () => Promise<void>;
  stopRecording: () => Promise<void>;
  clearSavedResult: () => void;
  clearError: () => void;
}

export function useRecordingPipeline(): UseRecordingPipelineReturn {
  const [recordingState, setRecordingState] = useState<RecordingState>('idle');
  const [countdown, setCountdown] = useState<number>(3);
  const [elapsedSeconds, setElapsedSeconds] = useState<number>(0);
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [savedResult, setSavedResult] = useState<SavedRecordingResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);

  // Active session and media refs
  const activeSessionRef = useRef<RecordingSessionInfo | null>(null);
  const pendingOptionsRef = useRef<RecordingOptions | null>(null);
  const countdownTimerRef = useRef<NodeJS.Timeout | null>(null);
  const elapsedTimerRef = useRef<NodeJS.Timeout | null>(null);
  const recordingStartTimeRef = useRef<number>(0);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const systemAudioStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const sinkVideoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const canvasPumpTimerRef = useRef<NodeJS.Timeout | null>(null);
  const stopRecordingRef = useRef<(() => Promise<void>) | null>(null);

  // Formatted timer MM:SS
  const formatTime = (totalSeconds: number): string => {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  /**
   * Complete teardown of all media streams, Web Audio contexts, and timers.
   */
  const cleanupMediaResources = useCallback(() => {
    if (elapsedTimerRef.current) {
      clearInterval(elapsedTimerRef.current);
      elapsedTimerRef.current = null;
    }
    if (countdownTimerRef.current) {
      clearInterval(countdownTimerRef.current);
      countdownTimerRef.current = null;
    }
    if (canvasPumpTimerRef.current) {
      clearInterval(canvasPumpTimerRef.current);
      canvasPumpTimerRef.current = null;
    }

    if (canvasRef.current) {
      canvasRef.current.remove();
      canvasRef.current = null;
    }

    if (sinkVideoRef.current) {
      sinkVideoRef.current.pause();
      sinkVideoRef.current.srcObject = null;
      sinkVideoRef.current = null;
    }

    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach((t) => {
        t.onended = null;
        t.stop();
      });
      screenStreamRef.current = null;
    }

    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach((t) => {
        t.onended = null;
        t.stop();
      });
      micStreamRef.current = null;
    }

    if (systemAudioStreamRef.current) {
      systemAudioStreamRef.current.getTracks().forEach((t) => {
        t.onended = null;
        t.stop();
      });
      systemAudioStreamRef.current = null;
    }

    if (audioContextRef.current) {
      try {
        if (audioContextRef.current.state !== 'closed') {
          void audioContextRef.current.close();
        }
      } catch {
        // AudioContext close cleanup
      }
      audioContextRef.current = null;
    }

    mediaRecorderRef.current = null;
  }, []);

  /**
   * Chooses optimal bitrate based on resolution and FPS.
   */
  const getOptimalBitrate = (res: RecordingResolution, fps: RecordingFps): number => {
    if (res === '1080p') {
      return fps === 60 ? 10000000 : 6000000; // 10 Mbps or 6 Mbps
    }
    return fps === 60 ? 5000000 : 3000000; // 5 Mbps or 3 Mbps
  };

  /**
   * Detects the best supported WebM container MIME type.
   */
  const getSupportedMimeType = (): string => {
    const candidates = [
      'video/webm;codecs=vp9,opus',
      'video/webm;codecs=vp8,opus',
      'video/webm',
    ];
    for (const mime of candidates) {
      if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(mime)) {
        return mime;
      }
    }
    return 'video/webm';
  };

  /**
   * Internal worker executing the actual recording launch after countdown completes.
   */
  const executeStartRecording = useCallback(
    async (options: RecordingOptions) => {
      setRecordingState('recording');
      setError(null);
      setWarning(null);
      setElapsedSeconds(0);
      setIsPaused(false);

      try {
        if (typeof window === 'undefined' || !window.friday?.recording?.startRecording) {
          throw new Error('Friday recording IPC bridge is unavailable.');
        }

        // 1. Notify main process RecordingService (storage preparation, collaborator coordination)
        const sessionInfo = await window.friday.recording.startRecording(options);
        activeSessionRef.current = sessionInfo;

        const targetWidth = options.resolution === '720p' ? 1280 : 1920;
        const targetHeight = options.resolution === '720p' ? 720 : 1080;
        const targetFps = options.fps;

        // 2. Acquire screen/window video stream (and system audio if requested in unified call)
        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error('getUserMedia is not supported in this environment');
        }

        let videoStream: MediaStream;
        let systemStream: MediaStream | null = null;

        if (options.systemAudioEnabled) {
          try {
            // Unified desktop capture (video + loopback audio in single DXGI call)
            const combinedDesktop = await navigator.mediaDevices.getUserMedia({
              audio: {
                // @ts-expect-error - Chromium desktop audio constraint
                mandatory: {
                  chromeMediaSource: 'desktop',
                },
              },
              video: {
                // @ts-expect-error - Chromium desktop capture constraints
                mandatory: {
                  chromeMediaSource: 'desktop',
                  chromeMediaSourceId: options.sourceId,
                  minWidth: targetWidth,
                  maxWidth: targetWidth,
                  minHeight: targetHeight,
                  maxHeight: targetHeight,
                  minFrameRate: targetFps,
                  maxFrameRate: targetFps,
                },
              },
            });

            const sysAudioTracks = combinedDesktop.getAudioTracks();
            if (sysAudioTracks.length > 0) {
              systemStream = new MediaStream(sysAudioTracks);
              systemAudioStreamRef.current = systemStream;
            }

            const vidTracks = combinedDesktop.getVideoTracks();
            videoStream = new MediaStream(vidTracks);
            screenStreamRef.current = videoStream;
          } catch (combinedErr) {
            console.warn('[useRecordingPipeline] Unified desktop+audio capture failed, falling back to video only:', combinedErr);
            setWarning('System audio capture was unavailable; continuing with video only.');

            videoStream = await navigator.mediaDevices.getUserMedia({
              audio: false,
              video: {
                // @ts-expect-error - Chromium desktop capture constraints
                mandatory: {
                  chromeMediaSource: 'desktop',
                  chromeMediaSourceId: options.sourceId,
                  minWidth: targetWidth,
                  maxWidth: targetWidth,
                  minHeight: targetHeight,
                  maxHeight: targetHeight,
                  minFrameRate: targetFps,
                  maxFrameRate: targetFps,
                },
              },
            });
            screenStreamRef.current = videoStream;
          }
        } else {
          videoStream = await navigator.mediaDevices.getUserMedia({
            audio: false,
            video: {
              // @ts-expect-error - Chromium desktop capture constraints
              mandatory: {
                chromeMediaSource: 'desktop',
                chromeMediaSourceId: options.sourceId,
                minWidth: targetWidth,
                maxWidth: targetWidth,
                minHeight: targetHeight,
                maxHeight: targetHeight,
                minFrameRate: targetFps,
                maxFrameRate: targetFps,
              },
            },
          });
          screenStreamRef.current = videoStream;
        }

        const videoTrack = videoStream.getVideoTracks()[0];
        if (!videoTrack) {
          throw new Error('Could not acquire video track for recording.');
        }

        // Attach video to internal sink to keep frames pumping through Chromium compositor
        const sinkVideo = document.createElement('video');
        sinkVideo.muted = true;
        sinkVideo.playsInline = true;
        sinkVideo.srcObject = videoStream;
        sinkVideo.play().catch(() => {});
        sinkVideoRef.current = sinkVideo;

        // Handle source window closed mid-recording
        videoTrack.onended = () => {
          console.warn('[useRecordingPipeline] Video track ended mid-recording (window closed or display lost)');
          setWarning('Recording finalized early: The captured window was closed.');
          void stopRecordingRef.current?.();
        };

        // 3. Acquire Microphone audio (if enabled)
        let micStream: MediaStream | null = null;
        if (options.micEnabled) {
          try {
            const micConstraints: boolean | MediaTrackConstraints =
              options.micDeviceId && options.micDeviceId !== 'default'
                ? { deviceId: { exact: options.micDeviceId } }
                : true;

            micStream = await navigator.mediaDevices.getUserMedia({
              audio: micConstraints,
              video: false,
            });
            micStreamRef.current = micStream;
          } catch (micErr) {
            console.warn('[useRecordingPipeline] Could not acquire microphone stream:', micErr);
            setWarning('Microphone could not be captured; continuing with video only.');
          }
        }

        // 5. Mix audio sources using Web Audio API if any audio is active
        let mixedAudioTrack: MediaStreamTrack | null = null;
        if (micStream || systemStream) {
          const AudioContextClass =
            window.AudioContext ||
            (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
          const audioContext = new AudioContextClass({ sampleRate: 48000 });
          audioContextRef.current = audioContext;

          const destination = audioContext.createMediaStreamDestination();

          if (micStream && micStream.getAudioTracks().length > 0) {
            const micSource = audioContext.createMediaStreamSource(micStream);
            const micGain = audioContext.createGain();
            micGain.gain.value = 1.0;
            micSource.connect(micGain);
            micGain.connect(destination);
          }

          if (systemStream && systemStream.getAudioTracks().length > 0) {
            const sysSource = audioContext.createMediaStreamSource(systemStream);
            const sysGain = audioContext.createGain();
            sysGain.gain.value = 1.0;
            sysSource.connect(sysGain);
            sysGain.connect(destination);
          }

          mixedAudioTrack = destination.stream.getAudioTracks()[0] || null;
        }

        // 6. Setup Canvas Compositor
        // Guarantees constant frame rate (30 or 60 FPS) and exact target dimensions (1920x1080 / 1280x720)
        // Prevents frame drops or stalls when screen is static or DWM throttles
        const canvas = document.createElement('canvas');
        canvas.width = targetWidth;
        canvas.height = targetHeight;
        const ctx = canvas.getContext('2d', { alpha: false });
        canvasRef.current = canvas;

        const intervalMs = Math.round(1000 / targetFps);
        const pumpTimer = setInterval(() => {
          if (ctx) {
            if (sinkVideo && sinkVideo.videoWidth > 0 && sinkVideo.videoHeight > 0) {
              ctx.drawImage(sinkVideo, 0, 0, targetWidth, targetHeight);
            } else {
              ctx.fillStyle = '#090d16';
              ctx.fillRect(0, 0, targetWidth, targetHeight);
            }
          }
        }, intervalMs);
        canvasPumpTimerRef.current = pumpTimer;

        const canvasStream = canvas.captureStream(targetFps);
        const recordingVideoTrack = canvasStream.getVideoTracks()[0] || videoTrack;

        // 7. Assemble combined stream
        const recordingTracks: MediaStreamTrack[] = [recordingVideoTrack];
        if (mixedAudioTrack) {
          recordingTracks.push(mixedAudioTrack);
        }
        const combinedStream = new MediaStream(recordingTracks);

        // 8. Initialize MediaRecorder
        const mimeType = getSupportedMimeType();
        const videoBitsPerSecond = getOptimalBitrate(options.resolution, options.fps);

        const recorder = new MediaRecorder(combinedStream, {
          mimeType,
          videoBitsPerSecond,
        });
        mediaRecorderRef.current = recorder;

        // Stream chunks directly to main process
        recorder.ondataavailable = async (e: BlobEvent) => {
          if (e.data && e.data.size > 0 && activeSessionRef.current) {
            try {
              const arrayBuffer = await e.data.arrayBuffer();
              const uint8 = new Uint8Array(arrayBuffer);
              await window.friday.recording.writeChunk(activeSessionRef.current.sessionId, uint8);
            } catch (chunkErr) {
              console.error('[useRecordingPipeline] Error dispatching chunk:', chunkErr);
            }
          }
        };

        recorder.onerror = (e) => {
          console.error('[useRecordingPipeline] MediaRecorder runtime error:', e);
          setError('Recording error occurred during capture.');
        };

        // Deliver chunks every 500ms for continuous streaming and crash resilience
        recorder.start(500);
        recordingStartTimeRef.current = Date.now();

        // 8. Start elapsed timer ticking every second
        elapsedTimerRef.current = setInterval(() => {
          setElapsedSeconds((prev) => prev + 1);
        }, 1000);
      } catch (err) {
        console.error('[useRecordingPipeline] Start recording failed:', err);
        cleanupMediaResources();
        setRecordingState('error');
        const msg = err instanceof Error ? err.message : String(err);
        setError(msg);
      }
    },
    [cleanupMediaResources]
  );

  /**
   * Initiates the 3-2-1 countdown before recording starts.
   */
  const startCountdown = useCallback(
    (options: RecordingOptions) => {
      if (recordingState === 'recording' || recordingState === 'countdown') {
        return;
      }

      pendingOptionsRef.current = options;
      setSavedResult(null);
      setError(null);
      setWarning(null);
      setRecordingState('countdown');
      setCountdown(3);

      let currentCount = 3;
      countdownTimerRef.current = setInterval(() => {
        currentCount -= 1;
        if (currentCount > 0) {
          setCountdown(currentCount);
        } else {
          if (countdownTimerRef.current) {
            clearInterval(countdownTimerRef.current);
            countdownTimerRef.current = null;
          }
          if (pendingOptionsRef.current) {
            void executeStartRecording(pendingOptionsRef.current);
          }
        }
      }, 1000);
    },
    [recordingState, executeStartRecording]
  );

  /**
   * Cancels countdown before recording begins.
   */
  const cancelCountdown = useCallback(() => {
    if (countdownTimerRef.current) {
      clearInterval(countdownTimerRef.current);
      countdownTimerRef.current = null;
    }
    pendingOptionsRef.current = null;
    setRecordingState('idle');
    setCountdown(3);
  }, []);

  /**
   * Pauses the active recording.
   */
  const pauseRecording = useCallback(async () => {
    if (recordingState !== 'recording' || !mediaRecorderRef.current || !activeSessionRef.current) {
      return;
    }

    try {
      mediaRecorderRef.current.pause();
      if (elapsedTimerRef.current) {
        clearInterval(elapsedTimerRef.current);
        elapsedTimerRef.current = null;
      }
      setIsPaused(true);
      setRecordingState('paused');

      await window.friday.recording.pauseRecording(activeSessionRef.current.sessionId);
    } catch (err) {
      console.error('[useRecordingPipeline] Pause error:', err);
    }
  }, [recordingState]);

  /**
   * Resumes the paused recording.
   */
  const resumeRecording = useCallback(async () => {
    if (recordingState !== 'paused' || !mediaRecorderRef.current || !activeSessionRef.current) {
      return;
    }

    try {
      mediaRecorderRef.current.resume();
      elapsedTimerRef.current = setInterval(() => {
        setElapsedSeconds((prev) => prev + 1);
      }, 1000);
      setIsPaused(false);
      setRecordingState('recording');

      await window.friday.recording.resumeRecording(activeSessionRef.current.sessionId);
    } catch (err) {
      console.error('[useRecordingPipeline] Resume error:', err);
    }
  }, [recordingState]);

  /**
   * Stops recording, finalizes file output, releases all resources, and returns saved result.
   */
  const stopRecording = useCallback(async () => {
    if (recordingState === 'stopping' || recordingState === 'saved') {
      return;
    }

    setRecordingState('stopping');

    if (elapsedTimerRef.current) {
      clearInterval(elapsedTimerRef.current);
      elapsedTimerRef.current = null;
    }

    const session = activeSessionRef.current;
    const recorder = mediaRecorderRef.current;
    const durationMs = Date.now() - recordingStartTimeRef.current;

    try {
      // 1. Flush MediaRecorder
      if (recorder && recorder.state !== 'inactive') {
        await new Promise<void>((resolve) => {
          recorder.onstop = () => resolve();
          try {
            recorder.stop();
          } catch {
            resolve();
          }
        });
        recorder.ondataavailable = null;
      }

      // 2. Finalize recording in main process
      if (session && typeof window !== 'undefined' && window.friday?.recording?.stopRecording) {
        const result = await window.friday.recording.stopRecording(session.sessionId, durationMs);
        setSavedResult(result);
      }

      setRecordingState('saved');
    } catch (err) {
      console.error('[useRecordingPipeline] Stop recording failed:', err);
      setRecordingState('error');
      const msg = err instanceof Error ? err.message : String(err);
      setError(`Failed to save recording: ${msg}`);
    } finally {
      cleanupMediaResources();
      activeSessionRef.current = null;
      setIsPaused(false);
    }
  }, [recordingState, cleanupMediaResources]);

  useEffect(() => {
    stopRecordingRef.current = stopRecording;
  }, [stopRecording]);

  const clearSavedResult = useCallback(() => {
    setSavedResult(null);
    setRecordingState('idle');
    setElapsedSeconds(0);
  }, []);

  const clearError = useCallback(() => {
    setError(null);
    if (recordingState === 'error') {
      setRecordingState('idle');
    }
  }, [recordingState]);

  // Clean up on component unmount and window reload
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (recordingState === 'recording' || recordingState === 'paused') {
        void stopRecording();
      } else {
        cleanupMediaResources();
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      cleanupMediaResources();
    };
  }, [recordingState, stopRecording, cleanupMediaResources]);

  return {
    recordingState,
    countdown,
    elapsedSeconds,
    formattedTime: formatTime(elapsedSeconds),
    isPaused,
    savedResult,
    error,
    warning,

    startCountdown,
    cancelCountdown,
    pauseRecording,
    resumeRecording,
    stopRecording,
    clearSavedResult,
    clearError,
  };
}
