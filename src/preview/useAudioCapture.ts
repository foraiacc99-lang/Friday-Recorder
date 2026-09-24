import { useCallback, useEffect, useRef, useState } from 'react';
import type { AudioDeviceInfo } from '../../shared/types';

export interface UseAudioCaptureReturn {
  microphones: AudioDeviceInfo[];
  selectedMicId: string;
  setSelectedMicId: (id: string) => void;
  isLoadingMicrophones: boolean;
  isMicCapturing: boolean;
  micVolume: number;
  micError: string | null;
  refreshMicrophones: () => Promise<void>;
  startMicCapture: (deviceId?: string) => Promise<void>;
  stopMicCapture: () => Promise<void>;

  isSystemAudioCapturing: boolean;
  systemAudioVolume: number;
  systemAudioError: string | null;
  startSystemAudioCapture: () => Promise<void>;
  stopSystemAudioCapture: () => Promise<void>;

  stopAllAudio: () => Promise<void>;
}

export function useAudioCapture(): UseAudioCaptureReturn {
  // --- Microphone State ---
  const [microphones, setMicrophones] = useState<AudioDeviceInfo[]>([]);
  const [selectedMicId, setSelectedMicId] = useState<string>('');
  const [isLoadingMicrophones, setIsLoadingMicrophones] = useState<boolean>(false);
  const [isMicCapturing, setIsMicCapturing] = useState<boolean>(false);
  const [micVolume, setMicVolume] = useState<number>(0);
  const [micError, setMicError] = useState<string | null>(null);

  // --- System Audio State ---
  const [isSystemAudioCapturing, setIsSystemAudioCapturing] = useState<boolean>(false);
  const [systemAudioVolume, setSystemAudioVolume] = useState<number>(0);
  const [systemAudioError, setSystemAudioError] = useState<string | null>(null);

  // --- Refs for Stream and AudioContext Lifecycle Management ---
  const micStreamRef = useRef<MediaStream | null>(null);
  const micAudioContextRef = useRef<AudioContext | null>(null);
  const micAnalyserRef = useRef<AnalyserNode | null>(null);
  const micAnimFrameRef = useRef<number | null>(null);

  const systemStreamRef = useRef<MediaStream | null>(null);
  const systemAudioContextRef = useRef<AudioContext | null>(null);
  const systemAnalyserRef = useRef<AnalyserNode | null>(null);
  const systemAnimFrameRef = useRef<number | null>(null);

  /**
   * Helper to calculate audio volume (0-100%) from an AnalyserNode using RMS.
   */
  const calculateVolume = (analyser: AnalyserNode): number => {
    const dataArray = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteFrequencyData(dataArray);

    let sum = 0;
    for (let i = 0; i < dataArray.length; i++) {
      const val = dataArray[i];
      if (val !== undefined) {
        sum += val * val;
      }
    }
    const rms = Math.sqrt(sum / dataArray.length);
    // Normalize 0-255 to 0-100 with a slight boost curve for visual clarity
    const normalized = Math.min(100, Math.round((rms / 128) * 100));
    return normalized;
  };

  /**
   * Enumerates available microphone input devices.
   */
  const refreshMicrophones = useCallback(async () => {
    setIsLoadingMicrophones(true);
    setMicError(null);
    try {
      let devices: AudioDeviceInfo[] = [];

      // Prefer IPC bridge if available
      if (typeof window !== 'undefined' && window.friday?.audio?.listMicrophones) {
        devices = await window.friday.audio.listMicrophones();
      } else if (typeof navigator !== 'undefined' && navigator.mediaDevices?.enumerateDevices) {
        const mediaDevices = await navigator.mediaDevices.enumerateDevices();
        devices = mediaDevices
          .filter((d) => d.kind === 'audioinput')
          .map((d) => ({
            deviceId: d.deviceId,
            label: d.label || 'Default Microphone',
            groupId: d.groupId || undefined,
            isDefault: d.deviceId === 'default',
          }));
      }

      setMicrophones(devices);

      setSelectedMicId((prev) => {
        if (prev && devices.some((d) => d.deviceId === prev)) {
          return prev;
        }
        return devices.length > 0 ? (devices[0]?.deviceId ?? '') : '';
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setMicError(`Failed to enumerate microphones: ${msg}`);
    } finally {
      setIsLoadingMicrophones(false);
    }
  }, []);

  /**
   * Cleanly stops microphone capture and releases audio resources.
   */
  const stopMicCapture = useCallback(async () => {
    if (micAnimFrameRef.current !== null) {
      cancelAnimationFrame(micAnimFrameRef.current);
      micAnimFrameRef.current = null;
    }

    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach((track) => {
        track.onended = null;
        track.stop();
      });
      micStreamRef.current = null;
    }

    if (micAudioContextRef.current) {
      try {
        if (micAudioContextRef.current.state !== 'closed') {
          await micAudioContextRef.current.close();
        }
      } catch {
        // AudioContext close cleanup
      }
      micAudioContextRef.current = null;
    }
    micAnalyserRef.current = null;

    setMicVolume(0);
    setIsMicCapturing(false);

    try {
      if (typeof window !== 'undefined' && window.friday?.audio?.stop) {
        await window.friday.audio.stop('mic');
      }
    } catch (err) {
      console.error('[useAudioCapture] Error notifying stop mic:', err);
    }
  }, []);

  /**
   * Starts capturing microphone audio from the selected device.
   */
  const startMicCapture = useCallback(
    async (deviceIdOverride?: string) => {
      const targetId = deviceIdOverride || selectedMicId;
      setMicError(null);

      // Stop any existing mic capture first
      if (isMicCapturing) {
        await stopMicCapture();
      }

      try {
        // 1. Notify main process to register session
        if (typeof window !== 'undefined' && window.friday?.audio?.startMicCapture) {
          await window.friday.audio.startMicCapture(targetId || undefined);
        }

        // 2. Request userMedia stream for the selected audio input
        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error('getUserMedia is not supported in this environment');
        }

        const audioConstraints: boolean | MediaTrackConstraints =
          targetId && targetId !== 'default'
            ? { deviceId: { exact: targetId } }
            : true;

        const stream = await navigator.mediaDevices.getUserMedia({
          audio: audioConstraints,
          video: false,
        });

        micStreamRef.current = stream;

        const audioTrack = stream.getAudioTracks()[0];
        if (!audioTrack) {
          throw new Error('No audio track available from microphone stream');
        }

        // 3. Handle device unplugged / lost mid-capture
        audioTrack.onended = () => {
          console.warn('[useAudioCapture] Microphone track ended (device unplugged or lost)');
          void stopMicCapture();
          setMicError('Microphone disconnected: The selected audio device was unplugged or became unavailable.');
        };

        // 4. Setup Web Audio API Analyser for real-time level metering
        const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        const audioContext = new AudioContextClass();
        micAudioContextRef.current = audioContext;

        const source = audioContext.createMediaStreamSource(stream);
        const analyser = audioContext.createAnalyser();
        analyser.fftSize = 256;
        analyser.smoothingTimeConstant = 0.3;
        source.connect(analyser);
        micAnalyserRef.current = analyser;

        // 5. Start animation loop for volume meter
        const updateLevel = () => {
          if (micAnalyserRef.current && micStreamRef.current) {
            const vol = calculateVolume(micAnalyserRef.current);
            setMicVolume(vol);
            micAnimFrameRef.current = requestAnimationFrame(updateLevel);
          }
        };
        updateLevel();

        setIsMicCapturing(true);
      } catch (err: unknown) {
        console.error('[useAudioCapture] startMicCapture failed:', err);
        void stopMicCapture();

        const errObj = err as { name?: string; message?: string };
        const msg = errObj.message || String(err);

        if (
          errObj.name === 'NotAllowedError' ||
          errObj.name === 'PermissionDeniedError' ||
          msg.toLowerCase().includes('permission') ||
          msg.toLowerCase().includes('denied')
        ) {
          setMicError(
            'Microphone access denied. Please grant microphone access in Windows Settings: ' +
              'Settings > Privacy & security > Microphone > enable "Let desktop apps access your microphone".'
          );
        } else if (errObj.name === 'NotFoundError' || msg.toLowerCase().includes('not found')) {
          setMicError('Selected microphone was not found or is currently unavailable. Please re-check device connection.');
        } else {
          setMicError(`Microphone capture error: ${msg}`);
        }
      }
    },
    [selectedMicId, isMicCapturing, stopMicCapture]
  );

  /**
   * Cleanly stops system audio capture and releases audio resources.
   */
  const stopSystemAudioCapture = useCallback(async () => {
    if (systemAnimFrameRef.current !== null) {
      cancelAnimationFrame(systemAnimFrameRef.current);
      systemAnimFrameRef.current = null;
    }

    if (systemStreamRef.current) {
      systemStreamRef.current.getTracks().forEach((track) => {
        track.onended = null;
        track.stop();
      });
      systemStreamRef.current = null;
    }

    if (systemAudioContextRef.current) {
      try {
        if (systemAudioContextRef.current.state !== 'closed') {
          await systemAudioContextRef.current.close();
        }
      } catch {
        // AudioContext close cleanup
      }
      systemAudioContextRef.current = null;
    }
    systemAnalyserRef.current = null;

    setSystemAudioVolume(0);
    setIsSystemAudioCapturing(false);

    try {
      if (typeof window !== 'undefined' && window.friday?.audio?.stop) {
        await window.friday.audio.stop('system');
      }
    } catch (err) {
      console.error('[useAudioCapture] Error notifying stop system audio:', err);
    }
  }, []);

  /**
   * Starts capturing system (desktop loopback) audio on Windows.
   * Acquires loopback audio via desktop constraints and immediately detaches video.
   */
  const startSystemAudioCapture = useCallback(async () => {
    setSystemAudioError(null);

    // Stop any existing system audio capture first
    if (isSystemAudioCapturing) {
      await stopSystemAudioCapture();
    }

    try {
      // 1. Notify main process to register system audio session
      if (typeof window !== 'undefined' && window.friday?.audio?.startSystemAudioCapture) {
        await window.friday.audio.startSystemAudioCapture();
      }

      // 2. Obtain a valid display/screen ID to satisfy Chromium's desktop capture requirement
      let screenSourceId = 'screen:0:0';
      if (typeof window !== 'undefined' && window.friday?.capture?.listSources) {
        const sources = await window.friday.capture.listSources(['screen']);
        if (sources.length > 0 && sources[0]?.id) {
          screenSourceId = sources[0].id;
        }
      }

      // 3. Request desktop media stream with loopback audio enabled
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error('getUserMedia is not supported in this environment');
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          // @ts-expect-error - Chromium desktop audio loopback constraint
          mandatory: {
            chromeMediaSource: 'desktop',
          },
        },
        video: {
          // @ts-expect-error - Chromium desktop video constraint needed for stream creation
          mandatory: {
            chromeMediaSource: 'desktop',
            chromeMediaSourceId: screenSourceId,
          },
        },
      });

      // 4. Immediately detach and stop the video track so ONLY the loopback audio track runs
      const videoTracks = stream.getVideoTracks();
      videoTracks.forEach((vt) => {
        vt.stop();
        stream.removeTrack(vt);
      });

      const audioTrack = stream.getAudioTracks()[0];
      if (!audioTrack) {
        throw new Error('System audio track could not be acquired from desktop capture pipeline');
      }

      systemStreamRef.current = stream;

      // 5. Handle audio track ending
      audioTrack.onended = () => {
        console.warn('[useAudioCapture] System audio track ended');
        void stopSystemAudioCapture();
        setSystemAudioError('System audio capture stopped unexpectedly.');
      };

      // 6. Connect to Web Audio API for volume metering
      const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const audioContext = new AudioContextClass();
      systemAudioContextRef.current = audioContext;

      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.3;
      source.connect(analyser);
      systemAnalyserRef.current = analyser;

      // 7. Start animation loop for volume meter
      const updateLevel = () => {
        if (systemAnalyserRef.current && systemStreamRef.current) {
          const vol = calculateVolume(systemAnalyserRef.current);
          setSystemAudioVolume(vol);
          systemAnimFrameRef.current = requestAnimationFrame(updateLevel);
        }
      };
      updateLevel();

      setIsSystemAudioCapturing(true);
    } catch (err: unknown) {
      console.error('[useAudioCapture] startSystemAudioCapture failed:', err);
      void stopSystemAudioCapture();
      const msg = err instanceof Error ? err.message : String(err);
      setSystemAudioError(`System audio capture error: ${msg}`);
    }
  }, [isSystemAudioCapturing, stopSystemAudioCapture]);

  /**
   * Stops both microphone and system audio capture cleanly.
   */
  const stopAllAudio = useCallback(async () => {
    await Promise.all([stopMicCapture(), stopSystemAudioCapture()]);
  }, [stopMicCapture, stopSystemAudioCapture]);

  // Initial microphone enumeration on mount
  useEffect(() => {
    void refreshMicrophones();

    // Listen for physical device changes (plug/unplug)
    if (typeof navigator !== 'undefined' && navigator.mediaDevices?.addEventListener) {
      const handleDeviceChange = () => {
        void refreshMicrophones();
      };
      navigator.mediaDevices.addEventListener('devicechange', handleDeviceChange);
      return () => {
        navigator.mediaDevices.removeEventListener('devicechange', handleDeviceChange);
      };
    }
    return undefined;
  }, [refreshMicrophones]);

  // Clean up all audio streams and AudioContexts on unmount and beforeunload
  useEffect(() => {
    const handleBeforeUnload = () => {
      void stopAllAudio();
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      void stopAllAudio();
    };
  }, [stopAllAudio]);

  return {
    microphones,
    selectedMicId,
    setSelectedMicId,
    isLoadingMicrophones,
    isMicCapturing,
    micVolume,
    micError,
    refreshMicrophones,
    startMicCapture,
    stopMicCapture,

    isSystemAudioCapturing,
    systemAudioVolume,
    systemAudioError,
    startSystemAudioCapture,
    stopSystemAudioCapture,

    stopAllAudio,
  };
}
