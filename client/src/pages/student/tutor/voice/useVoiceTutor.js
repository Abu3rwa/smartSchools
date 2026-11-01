import { useCallback, useEffect, useRef, useState } from "react";
import i18n from "../../../../i18n/index.js";
import tutorService from "../../../../services/tutorService.js";

const unwrap = (response) => response?.data?.data;
const errorText = (error) => error?.response?.data?.message || "";

const TAP_MS = 700;
const SEGMENT_GAP_MS = 260;

const recorderMime = () => {
  if (typeof MediaRecorder === "undefined") return "";
  return (
    ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"].find(
      (type) => MediaRecorder.isTypeSupported(type),
    ) || ""
  );
};

/**
 * The voice page: pick a lesson, then talk. The board is the server's message
 * list, so what is on screen after a reload always matches what was spoken.
 */
export const useVoiceTutor = () => {
  const [home, setHome] = useState(null);
  const [loading, setLoading] = useState(true);
  const [outlineLoading, setOutlineLoading] = useState(false);
  const [subjectId, setSubjectId] = useState("");
  const [session, setSession] = useState(null);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState("");
  const [phase, setPhase] = useState("idle");
  const [seconds, setSeconds] = useState(0);
  // Which spoken part is playing, or null when the whole turn should be shown.
  const [speakingIndex, setSpeakingIndex] = useState(null);

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
  const lastAudioRef = useRef("");
  const lastClipsRef = useRef([]);
  const gapRef = useRef(null);
  // Any interruption bumps the token; callbacks from the old sequence then stop.
  const playTokenRef = useRef(0);
  const mountedRef = useRef(true);
  // Hold-Control state lives outside React so a keyup always matches its keydown.
  const ctrlRef = useRef({ held: false, cancelled: false });

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const loadHome = useCallback(async (nextSubjectId = "") => {
    const data = unwrap(
      await tutorService.voiceHome(
        nextSubjectId ? { subjectId: nextSubjectId } : {},
      ),
    );
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
        if (active)
          setError(errorText(fetchError) || i18n.t("tutor:voice.errors.load"));
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
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
        if (active)
          setError(errorText(fetchError) || i18n.t("tutor:voice.errors.load"));
      } finally {
        if (active) setOutlineLoading(false);
      }
    })();
    return () => {
      active = false;
    };
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

  /** One sequence at a time: stopping the voice also ends its reveal timeline. */
  const stopPlayback = useCallback(({ reveal = true } = {}) => {
    playTokenRef.current += 1;
    if (gapRef.current) clearTimeout(gapRef.current);
    gapRef.current = null;
    if (audioRef.current) {
      audioRef.current.onended = null;
      audioRef.current.onerror = null;
      audioRef.current.pause();
      audioRef.current = null;
    }
    if (reveal) setSpeakingIndex(null);
  }, []);

  useEffect(
    () => () => {
      stopTimer();
      releaseMic();
      stopPlayback({ reveal: false });
    },
    [releaseMic, stopPlayback, stopTimer],
  );

  /** A whole reply in one clip: the board shows it in full while it plays. */
  const play = useCallback(
    (source) => {
      if (!source) return;
      stopPlayback();
      lastAudioRef.current = source;
      lastClipsRef.current = [];
      const token = playTokenRef.current;
      const audio = new Audio(source);
      audioRef.current = audio;
      const done = () => {
        if (!mountedRef.current || token !== playTokenRef.current) return;
        audioRef.current = null;
        setPhase("idle");
      };
      audio.onended = done;
      audio.onerror = done;
      setPhase("speaking");
      audio.play().catch(done);
    },
    [stopPlayback],
  );

  /**
   * The exact version: one clip per board part, so each part can be revealed
   * when its voice starts. The short gap lets the eye land on the new part
   * before the next sentence begins.
   */
  const playClips = useCallback(
    (clips) => {
      const list = (Array.isArray(clips) ? clips : []).filter(
        (clip) => clip?.audio,
      );
      stopPlayback();
      lastAudioRef.current = "";
      lastClipsRef.current = list;
      if (!list.length) {
        setPhase("idle");
        return;
      }
      const token = playTokenRef.current;
      let index = 0;
      setPhase("speaking");
      setSpeakingIndex(0);

      const startClip = () => {
        if (!mountedRef.current || token !== playTokenRef.current) return;
        if (index >= list.length) {
          setSpeakingIndex(null);
          setPhase("idle");
          return;
        }
        const audio = new Audio(list[index].audio);
        audioRef.current = audio;
        let settled = false;
        const advance = () => {
          if (settled) return;
          settled = true;
          if (!mountedRef.current || token !== playTokenRef.current) return;
          audioRef.current = null;
          index += 1;
          if (index >= list.length) {
            setSpeakingIndex(null);
            setPhase("idle");
            return;
          }
          setSpeakingIndex(index);
          gapRef.current = setTimeout(startClip, SEGMENT_GAP_MS);
        };
        audio.onended = advance;
        audio.onerror = advance;
        audio.play().catch(advance);
      };

      startClip();
    },
    [stopPlayback],
  );

  const playReply = useCallback(
    (data) => {
      if (Array.isArray(data?.segments) && data.segments.length)
        playClips(data.segments);
      else if (data?.audio) play(data.audio);
      else {
        stopPlayback();
        setPhase("idle");
      }
    },
    [play, playClips, stopPlayback],
  );

  const replayLast = useCallback(() => {
    if (lastClipsRef.current.length) playClips(lastClipsRef.current);
    else if (lastAudioRef.current) play(lastAudioRef.current);
  }, [play, playClips]);

  const sendTurn = useCallback(
    async ({ blob, durationMs, text }) => {
      if (!session?.id) return;
      setPhase("thinking");
      try {
        const data = unwrap(
          await tutorService.voiceTurn(session.id, {
            audio: blob,
            text,
            durationMs,
          }),
        );
        if (!mountedRef.current) return;
        setSession((current) =>
          current
            ? {
                ...current,
                messages: [
                  ...current.messages,
                  {
                    role: "student",
                    text: data.transcript || "",
                    at: new Date().toISOString(),
                  },
                  {
                    role: "tutor",
                    text: data.spoken,
                    spoken: data.spoken,
                    lead: data.lead,
                    emphasis: data.emphasis,
                    blocks: data.blocks,
                    followUp: data.followUp,
                    questionType: data.questionType,
                    stage: data.stage,
                    at: new Date().toISOString(),
                  },
                ],
                creditsSpent:
                  (current.creditsSpent || 0) + (current.voice?.price || 0),
                voice: data.voice || current.voice,
              }
            : current,
        );
        if (data.audio || data.segments?.length) playReply(data);
        else setPhase("idle");
        return data;
      } catch (turnError) {
        if (mountedRef.current) {
          setPhase("idle");
          setError(errorText(turnError) || i18n.t("tutor:voice.errors.turn"));
        }
        return null;
      }
    },
    [playReply, session?.id],
  );

  const finishListening = useCallback(
    async ({ cancelled = false } = {}) => {
      holdingRef.current = false;
      const recorder = recorderRef.current;
      if (!recorder || recorder.state === "inactive") return;
      const elapsed = Date.now() - startedAtRef.current;
      stopTimer();
      setSeconds(0);
      await new Promise((resolve) => {
        recorder.onstop = resolve;
        recorder.stop();
      });
      releaseMic();
      recorderRef.current = null;
      const blob = new Blob(chunksRef.current, {
        type: recorder.mimeType || "audio/webm",
      });
      chunksRef.current = [];
      if (cancelled) {
        setPhase("idle");
        return;
      }
      if (elapsed < TAP_MS) {
        setPhase("idle");
        replayLast();
        return;
      }
      await sendTurn({ blob, durationMs: elapsed });
    },
    [releaseMic, replayLast, sendTurn, stopTimer],
  );

  const startListening = useCallback(async () => {
    if (recorderRef.current || phase === "thinking") return;
    if (session?.voice?.canAsk === false) return;
    // Talking over the tutor stops the clip and shows the rest of the turn.
    stopPlayback();
    setError("");
    holdingRef.current = true;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!mountedRef.current || !holdingRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      streamRef.current = stream;
      const mimeType = recorderMime();
      const recorder = new MediaRecorder(
        stream,
        mimeType ? { mimeType } : undefined,
      );
      chunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data?.size) chunksRef.current.push(event.data);
      };
      recorderRef.current = recorder;
      startedAtRef.current = Date.now();
      recorder.start();
      setPhase("listening");
      setSeconds(0);
      timerRef.current = setInterval(() => {
        if (mountedRef.current)
          setSeconds(Math.floor((Date.now() - startedAtRef.current) / 1000));
      }, 500);
      const limit = Math.max(5, Number(home?.voice?.listenSeconds) || 30);
      autoStopRef.current = setTimeout(() => {
        if (recorderRef.current) finishListening();
      }, limit * 1000);
    } catch (micError) {
      holdingRef.current = false;
      setPhase("idle");
      setError(i18n.t("tutor:voice.errors.mic"));
    }
  }, [
    finishListening,
    home?.voice?.listenSeconds,
    phase,
    session?.voice?.canAsk,
    stopPlayback,
  ]);

  const answerByText = useCallback(
    (text) => {
      const answer = String(text || "").trim();
      if (!answer || phase === "thinking" || session?.voice?.canAsk === false)
        return null;
      stopPlayback();
      setError("");
      return sendTurn({ text: answer });
    },
    [phase, sendTurn, session?.voice?.canAsk, stopPlayback],
  );

  const stopListening = useCallback(() => finishListening(), [finishListening]);
  const cancelListening = useCallback(
    () => finishListening({ cancelled: true }),
    [finishListening],
  );

  /**
   * Hold Control anywhere on the board to speak. Any other key while it is held
   * means the student is using a shortcut (Ctrl+C, Ctrl+Tab), so the press is
   * thrown away instead of sent.
   */
  useEffect(() => {
    if (!session) return undefined;
    const typing = (target) =>
      Boolean(
        target?.closest?.('input, textarea, select, [contenteditable="true"]'),
      );
    const release = () => {
      const { cancelled } = ctrlRef.current;
      ctrlRef.current = { held: false, cancelled: false };
      if (cancelled) cancelListening();
      else stopListening();
    };
    const onKeyDown = (event) => {
      if (event.key !== "Control") {
        if (ctrlRef.current.held) ctrlRef.current.cancelled = true;
        return;
      }
      if (event.repeat || ctrlRef.current.held) return;
      if (typing(event.target)) return;
      if (phase === "thinking" || session.voice?.canAsk === false) return;
      ctrlRef.current = { held: true, cancelled: false };
      startListening();
    };
    const onKeyUp = (event) => {
      if (event.key === "Control" && ctrlRef.current.held) release();
    };
    const onBlur = () => {
      if (ctrlRef.current.held) release();
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    return () => {
      ctrlRef.current = { held: false, cancelled: false };
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
    };
  }, [cancelListening, phase, session, startListening, stopListening]);

  const startSession = useCallback(
    async (lessonId) => {
      if (!subjectId || !lessonId || starting) return null;
      setStarting(true);
      setError("");
      try {
        const data = unwrap(
          await tutorService.startVoiceSession({
            subjectId,
            lessonId,
            language: i18n.language,
          }),
        );
        if (mountedRef.current) {
          setSession(data);
          lastAudioRef.current = "";
          lastClipsRef.current = [];
          // The tutor speaks first: play the generated opening, then hand over the mic.
          playReply(data);
        }
        return data;
      } catch (startError) {
        if (mountedRef.current)
          setError(errorText(startError) || i18n.t("tutor:voice.errors.start"));
        return null;
      } finally {
        if (mountedRef.current) setStarting(false);
      }
    },
    [playReply, starting, subjectId],
  );

  const leaveSession = useCallback(async () => {
    const id = session?.id;
    stopTimer();
    holdingRef.current = false;
    ctrlRef.current = { held: false, cancelled: false };
    stopPlayback({ reveal: false });
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      recorderRef.current.onstop = null;
      recorderRef.current.stop();
    }
    recorderRef.current = null;
    chunksRef.current = [];
    releaseMic();
    setPhase("idle");
    setSession(null);
    if (id) {
      try {
        await tutorService.endVoiceSession(id);
      } catch {
        /* the session is closed on the server at logout */
      }
    }
    try {
      await loadHome(subjectId);
    } catch {
      /* keep the picker as it was */
    }
  }, [loadHome, releaseMic, session?.id, stopPlayback, stopTimer, subjectId]);

  const chooseSubject = (id) => {
    setError("");
    setSubjectId(id);
  };

  const replay = useCallback(() => {
    replayLast();
  }, [replayLast]);

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
    speakingIndex,
    chooseSubject,
    startSession,
    leaveSession,
    startListening,
    stopListening,
    cancelListening,
    answerByText,
    replay,
    canRecord:
      typeof navigator !== "undefined" &&
      Boolean(navigator.mediaDevices?.getUserMedia),
  };
};
