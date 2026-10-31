import { useCallback, useEffect, useRef, useState } from 'react';
import i18n from '../../../../i18n/index.js';
import tutorService from '../../../../services/tutorService.js';

const unwrap = (response) => response?.data?.data;
const errorText = (error) => error?.response?.data?.message || '';

const TAP_MS = 700;

const recorderMime = () => {
  if (typeof MediaRecorder === 'undefined') return '';
  return ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg']
    .find((type) => MediaRecorder.isTypeSupported(type)) || '';
};

/**
 * The voice page: pick a lesson, then talk. The board is the server's message
 * list, so what is on screen after a reload always matches what was spoken.
 */
export const useVoiceTutor = () => {
  const [home, setHome] = useState(null);
  const [loading, setLoading] = useState(true);
  const [outlineLoading, setOutlineLoading] = useState(false);
  const [subjectId, setSubjectId] = useState('');
  const [session, setSession] = useState(null);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState('');
  const [phase, setPhase] = useState('idle');
  const [seconds, setSeconds] = useState(0);

  const recorderRef = useRef(null);
  // A press can end while the browser is still asking for microphone access.
  // The press state is tracked outside React so the late permission is honoured.
  const holdingRef = useRef(false);
  const chunksRef = useRef([]);
  const streamRef = useRef(null);
  const startedAtRef = useRef(0);
  const timerRef = useRef(null);
  const autoStopRef = useRef(null);
  const audioRef = useRef(null);
  const lastAudioRef = useRef('');
  const mountedRef = useRef(true);
  // Hold-Control state lives outside React so a keyup always matches its keydown.
  const ctrlRef = useRef({ held: false, cancelled: false });

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const loadHome = useCallback(async (nextSubjectId = '') => {
    const data = unwrap(await tutorService.voiceHome(nextSubjectId ? { subjectId: nextSubjectId } : {}));
    if (!mountedRef.current) return data;
    setHome(data);
    return data;
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const data = unwrap(await tutorService.voiceHome());
        if (!active) return;
        setHome(data);
        if (data.subjects?.length === 1) setSubjectId(data.subjects[0].id);
      } catch (fetchError) {
        if (active) setError(errorText(fetchError) || i18n.t('tutor:voice.errors.load'));
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!subjectId) return undefined;
    let active = true;
    setOutlineLoading(true);
    (async () => {
      try {
        const data = unwrap(await tutorService.voiceHome({ subjectId }));
        if (active) setHome(data);
      } catch (fetchError) {
        if (active) setError(errorText(fetchError) || i18n.t('tutor:voice.errors.load'));
      } finally {
        if (active) setOutlineLoading(false);
      }
    })();
    return () => { active = false; };
  }, [subjectId]);

  const releaseMic = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  const stopTimer = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    if (autoStopRef.current) clearTimeout(autoStopRef.current);
    autoStopRef.current = null;
  }, []);

  useEffect(() => () => {
    stopTimer();
    releaseMic();
    audioRef.current?.pause();
  }, [releaseMic, stopTimer]);

  const play = useCallback((source) => {
    if (!source) return;
    lastAudioRef.current = source;
    audioRef.current?.pause();
    const audio = new Audio(source);
    audioRef.current = audio;
    audio.onended = () => { if (mountedRef.current) setPhase('idle'); };
    audio.onerror = () => { if (mountedRef.current) setPhase('idle'); };
    setPhase('speaking');
    audio.play().catch(() => { if (mountedRef.current) setPhase('idle'); });
  }, []);

  const sendTurn = useCallback(async ({ blob, durationMs }) => {
    if (!session?.id) return;
    setPhase('thinking');
    try {
      const data = unwrap(await tutorService.voiceTurn(session.id, {
        audio: blob,
        durationMs
      }));
      if (!mountedRef.current) return;
      setSession((current) => (current ? {
        ...current,
        messages: [
          ...current.messages,
          { role: 'student', text: data.transcript || '', at: new Date().toISOString() },
          {
            role: 'tutor',
            text: data.spoken,
            spoken: data.spoken,
            lead: data.lead,
            emphasis: data.emphasis,
            blocks: data.blocks,
            followUp: data.followUp,
            stage: data.stage,
            at: new Date().toISOString()
          }
        ],
        creditsSpent: (current.creditsSpent || 0) + (current.voice?.price || 0),
        voice: data.voice || current.voice
      } : current));
      if (data.audio) play(data.audio);
      else setPhase('idle');
      return data;
    } catch (turnError) {
      if (mountedRef.current) {
        setPhase('idle');
        setError(errorText(turnError) || i18n.t('tutor:voice.errors.turn'));
      }
      return null;
    }
  }, [play, session?.id]);

  const finishListening = useCallback(async ({ cancelled = false } = {}) => {
    holdingRef.current = false;
    const recorder = recorderRef.current;
    if (!recorder || recorder.state === 'inactive') return;
    const elapsed = Date.now() - startedAtRef.current;
    stopTimer();
    setSeconds(0);
    await new Promise((resolve) => {
      recorder.onstop = resolve;
      recorder.stop();
    });
    releaseMic();
    recorderRef.current = null;
    const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' });
    chunksRef.current = [];
    if (cancelled) {
      setPhase('idle');
      return;
    }
    if (elapsed < TAP_MS) {
      setPhase('idle');
      if (lastAudioRef.current) play(lastAudioRef.current);
      return;
    }
    await sendTurn({ blob, durationMs: elapsed });
  }, [play, releaseMic, sendTurn, stopTimer]);

  const startListening = useCallback(async () => {
    if (recorderRef.current || phase === 'thinking') return;
    if (session?.voice?.canAsk === false) return;
    audioRef.current?.pause();
    setError('');
    holdingRef.current = true;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!mountedRef.current || !holdingRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      streamRef.current = stream;
      const mimeType = recorderMime();
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      chunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data?.size) chunksRef.current.push(event.data);
      };
      recorderRef.current = recorder;
      startedAtRef.current = Date.now();
      recorder.start();
      setPhase('listening');
      setSeconds(0);
      timerRef.current = setInterval(() => {
        if (mountedRef.current) setSeconds(Math.floor((Date.now() - startedAtRef.current) / 1000));
      }, 500);
      const limit = Math.max(5, Number(home?.voice?.listenSeconds) || 30);
      autoStopRef.current = setTimeout(() => {
        if (recorderRef.current) finishListening();
      }, limit * 1000);
    } catch (micError) {
      holdingRef.current = false;
      setPhase('idle');
      setError(i18n.t('tutor:voice.errors.mic'));
    }
  }, [finishListening, home?.voice?.listenSeconds, phase, session?.voice?.canAsk]);

  const stopListening = useCallback(() => finishListening(), [finishListening]);
  const cancelListening = useCallback(() => finishListening({ cancelled: true }), [finishListening]);

  /**
   * Hold Control anywhere on the board to speak. Any other key while it is held
   * means the student is using a shortcut (Ctrl+C, Ctrl+Tab), so the press is
   * thrown away instead of sent.
   */
  useEffect(() => {
    if (!session) return undefined;
    const typing = (target) => Boolean(target?.closest?.('input, textarea, select, [contenteditable="true"]'));
    const release = () => {
      const { cancelled } = ctrlRef.current;
      ctrlRef.current = { held: false, cancelled: false };
      if (cancelled) cancelListening();
      else stopListening();
    };
    const onKeyDown = (event) => {
      if (event.key !== 'Control') {
        if (ctrlRef.current.held) ctrlRef.current.cancelled = true;
        return;
      }
      if (event.repeat || ctrlRef.current.held) return;
      if (typing(event.target)) return;
      if (phase === 'thinking' || session.voice?.canAsk === false) return;
      ctrlRef.current = { held: true, cancelled: false };
      startListening();
    };
    const onKeyUp = (event) => {
      if (event.key === 'Control' && ctrlRef.current.held) release();
    };
    const onBlur = () => {
      if (ctrlRef.current.held) release();
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    return () => {
      ctrlRef.current = { held: false, cancelled: false };
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
    };
  }, [cancelListening, phase, session, startListening, stopListening]);

  const startSession = useCallback(async (lessonId) => {
    if (!subjectId || !lessonId || starting) return null;
    setStarting(true);
    setError('');
    try {
      const data = unwrap(await tutorService.startVoiceSession({
        subjectId,
        lessonId,
        language: i18n.language
      }));
      if (mountedRef.current) {
        setSession(data);
        lastAudioRef.current = '';
        // The tutor speaks first: play the generated opening, then hand over the mic.
        if (data.audio) play(data.audio);
        else setPhase('idle');
      }
      return data;
    } catch (startError) {
      if (mountedRef.current) setError(errorText(startError) || i18n.t('tutor:voice.errors.start'));
      return null;
    } finally {
      if (mountedRef.current) setStarting(false);
    }
  }, [play, starting, subjectId]);

  const leaveSession = useCallback(async () => {
    const id = session?.id;
    stopTimer();
    holdingRef.current = false;
    ctrlRef.current = { held: false, cancelled: false };
    audioRef.current?.pause();
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      recorderRef.current.onstop = null;
      recorderRef.current.stop();
    }
    recorderRef.current = null;
    chunksRef.current = [];
    releaseMic();
    setPhase('idle');
    setSession(null);
    if (id) {
      try { await tutorService.endVoiceSession(id); } catch { /* the session is closed on the server at logout */ }
    }
    try { await loadHome(subjectId); } catch { /* keep the picker as it was */ }
  }, [loadHome, releaseMic, session?.id, stopTimer, subjectId]);

  const chooseSubject = (id) => {
    setError('');
    setSubjectId(id);
  };

  const replay = useCallback(() => {
    if (lastAudioRef.current) play(lastAudioRef.current);
  }, [play]);

  return {
    home,
    loading,
    outlineLoading,
    subjectId,
    session,
    starting,
    error,
    phase,
    seconds,
    chooseSubject,
    startSession,
    leaveSession,
    startListening,
    stopListening,
    cancelListening,
    replay,
    canRecord: typeof navigator !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia)
  };
};
