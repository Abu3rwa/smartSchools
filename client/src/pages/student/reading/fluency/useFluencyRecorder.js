import { useCallback, useEffect, useRef, useState } from 'react';

export const MAX_RECORDING_SEC = 240;
const SILENCE_MS = 4000;
const MIN_RECORDING_MS = 1000;

// A throttled background tab fires the auto-stop late; never report past the cap.
const cappedSeconds = (value) => Math.min(MAX_RECORDING_SEC, value);

const recorderMime = () => {
  if (typeof MediaRecorder === 'undefined') return '';
  return (
    ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg'].find(
      (type) => MediaRecorder.isTypeSupported(type),
    ) || ''
  );
};

/** One recording, held in memory until the page sends it. Nothing touches disk. */
export function useFluencyRecorder() {
  const [phase, setPhase] = useState('idle');
  const [seconds, setSeconds] = useState(0);
  const [level, setLevel] = useState(0);
  const [quiet, setQuiet] = useState(false);
  const [blob, setBlob] = useState(null);
  const [playbackUrl, setPlaybackUrl] = useState('');
  const [error, setError] = useState(null);

  const mountedRef = useRef(true);
  const recorderRef = useRef(null);
  const chunksRef = useRef([]);
  const streamRef = useRef(null);
  const startedAtRef = useRef(0);
  const tickRef = useRef(null);
  const autoStopRef = useRef(null);
  const audioCtxRef = useRef(null);
  const lastSoundRef = useRef(0);
  const urlRef = useRef('');
  const stopRef = useRef(null);

  const clearUrl = useCallback(() => {
    if (urlRef.current) {
      URL.revokeObjectURL(urlRef.current);
      urlRef.current = '';
    }
    if (mountedRef.current) setPlaybackUrl('');
  }, []);

  const stopMeter = useCallback(() => {
    if (tickRef.current) clearInterval(tickRef.current);
    tickRef.current = null;
    if (autoStopRef.current) clearTimeout(autoStopRef.current);
    autoStopRef.current = null;
    const context = audioCtxRef.current;
    audioCtxRef.current = null;
    context?.close?.().catch?.(() => {});
  }, []);

  const releaseMic = useCallback(() => {
    streamRef.current?.getTracks?.().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      stopMeter();
      try {
        const recorder = recorderRef.current;
        if (recorder && recorder.state !== 'inactive') recorder.stop();
      } catch {
        // The recorder is already gone.
      }
      releaseMic();
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    };
  }, [releaseMic, stopMeter]);

  const meter = useCallback((stream) => {
    const AudioCtx = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!AudioCtx) return;
    const context = new AudioCtx();
    const analyser = context.createAnalyser();
    analyser.fftSize = 512;
    context.createMediaStreamSource(stream).connect(analyser);
    audioCtxRef.current = context;
    const data = new Uint8Array(analyser.fftSize);
    lastSoundRef.current = Date.now();
    tickRef.current = setInterval(() => {
      analyser.getByteTimeDomainData(data);
      let sum = 0;
      for (const value of data) {
        const shifted = (value - 128) / 128;
        sum += shifted * shifted;
      }
      const rms = Math.sqrt(sum / data.length);
      if (!mountedRef.current) return;
      setLevel(Math.min(1, rms * 6));
      setSeconds(cappedSeconds(Math.floor((Date.now() - startedAtRef.current) / 1000)));
      if (rms > 0.02) {
        lastSoundRef.current = Date.now();
        setQuiet(false);
      } else if (Date.now() - lastSoundRef.current > SILENCE_MS) {
        setQuiet(true);
      }
    }, 200);
  }, []);

  const start = useCallback(async () => {
    if (recorderRef.current) return false;
    clearUrl();
    setBlob(null);
    setError(null);
    setQuiet(false);
    setLevel(0);
    if (typeof MediaRecorder === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setError('unsupported');
      return false;
    }
    setPhase('requesting');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, noiseSuppression: true, echoCancellation: true },
      });
      if (!mountedRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return false;
      }
      streamRef.current = stream;
      const mimeType = recorderMime();
      let recorder;
      try {
        recorder = new MediaRecorder(stream, {
          ...(mimeType ? { mimeType } : {}),
          audioBitsPerSecond: 32000,
        });
      } catch {
        recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      }
      chunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data?.size) chunksRef.current.push(event.data);
      };
      recorderRef.current = recorder;
      startedAtRef.current = Date.now();
      recorder.start();
      setPhase('recording');
      setSeconds(0);
      meter(stream);
      autoStopRef.current = setTimeout(() => stopRef.current?.(), MAX_RECORDING_SEC * 1000);
      return true;
    } catch (micError) {
      releaseMic();
      if (mountedRef.current) {
        setPhase('idle');
        setError(micError?.name === 'NotAllowedError' || micError?.name === 'SecurityError'
          ? 'blocked'
          : 'mic');
      }
      return false;
    }
  }, [clearUrl, meter, releaseMic]);

  const stop = useCallback(async () => {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state === 'inactive') return null;
    const elapsedMs = Date.now() - startedAtRef.current;
    stopMeter();
    await new Promise((resolve) => {
      if (recorder.state === 'inactive') {
        resolve();
        return;
      }
      recorder.onstop = resolve;
      recorder.stop();
    });
    releaseMic();
    recorderRef.current = null;
    const nextBlob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' });
    chunksRef.current = [];
    if (!mountedRef.current) return null;
    setLevel(0);
    setQuiet(false);
    if (!nextBlob.size || elapsedMs < MIN_RECORDING_MS) {
      setPhase('idle');
      setSeconds(0);
      setError('tooShort');
      return null;
    }
    const url = URL.createObjectURL(nextBlob);
    urlRef.current = url;
    const durationSec = cappedSeconds(Math.round(elapsedMs / 1000));
    setBlob(nextBlob);
    setPlaybackUrl(url);
    setSeconds(durationSec);
    setPhase('review');
    return { blob: nextBlob, durationSec };
  }, [releaseMic, stopMeter]);

  useEffect(() => {
    stopRef.current = stop;
  }, [stop]);

  const discard = useCallback(async () => {
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== 'inactive') {
      stopMeter();
      await new Promise((resolve) => {
        recorder.onstop = resolve;
        recorder.stop();
      });
      releaseMic();
      recorderRef.current = null;
    }
    chunksRef.current = [];
    clearUrl();
    setBlob(null);
    setLevel(0);
    setQuiet(false);
    setSeconds(0);
    setPhase('idle');
  }, [clearUrl, releaseMic, stopMeter]);

  const rerecord = useCallback(async () => {
    await discard();
    return start();
  }, [discard, start]);

  return {
    phase,
    seconds,
    level,
    quiet,
    blob,
    playbackUrl,
    error,
    start,
    stop,
    discard,
    rerecord,
    clearError: () => setError(null),
  };
}
