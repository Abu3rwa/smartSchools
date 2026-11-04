import { useCallback, useEffect, useRef, useState } from "react";
import i18n from "../../../../i18n/index.js";
import tutorService from "../../../../services/tutorService.js";
import { createClipQueue } from "./clipQueue.js";

const unwrap = (response) => response?.data?.data;
const errorText = (error) => error?.response?.data?.message || "";
const blobOf = async (request) => (await request).data;

const TAP_MS = 700;
const SEGMENT_GAP_MS = 260;
const SHORT_TAP_MS = 2000;
const TAP_MODE_KEY = "gb.voiceTapToToggle";
const HIDDEN_RELEASE_MS = 45 * 1000;

const dev = Boolean(import.meta.env?.DEV);
const mark = (name) => {
  if (dev && typeof performance !== "undefined") performance.mark(name);
};
const measure = (name, from) => {
  if (!dev || typeof performance === "undefined") return;
  try {
    performance.measure(name, from);
    const entry = performance.getEntriesByName(name).pop();
    console.debug(`[voice] ${name}: ${Math.round(entry.duration)}ms`);
    performance.clearMarks(from);
    performance.clearMeasures(name);
  } catch {
    /* the mark may have been cleared by a cancel */
  }
};

const recorderMime = () => {
  if (typeof MediaRecorder === "undefined") return "";
  return (
    ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"].find(
      (type) => MediaRecorder.isTypeSupported(type),
    ) || ""
  );
};

const readTapMode = () => {
  try {
    return localStorage.getItem(TAP_MODE_KEY) === "1";
  } catch {
    return false;
  }
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
  const [preparing, setPreparing] = useState(false);
  // Which spoken part is playing, or null when the whole turn should be shown.
  const [speakingIndex, setSpeakingIndex] = useState(null);
  // Set once at press time; RecordingTimer turns it into seconds on its own.
  const [listeningStartedAt, setListeningStartedAt] = useState(0);
  const [shortTap, setShortTap] = useState(false);
  const [soundFailed, setSoundFailed] = useState(false);
  const [micStatus, setMicStatus] = useState("unknown");
  const [micOpen, setMicOpen] = useState(false);
  const [tapToToggle, setTapToToggleState] = useState(readTapMode);
  const [canRetry, setCanRetry] = useState(false);
  const [pendingStudentText, setPendingStudentText] = useState("");
  // What the student just said: { text, status: "sending" | "sent" | "failed", voice }
  const [lastSaid, setLastSaid] = useState(null);

  const recorderRef = useRef(null);
  // A press can end while the browser is still asking for microphone access.
  // The press state is tracked outside React so the late permission is honoured.
  const holdingRef = useRef(false);
  const chunksRef = useRef([]);
  const streamRef = useRef(null);
  const startedAtRef = useRef(0);
  const autoStopRef = useRef(null);
  const shortTapTimerRef = useRef(null);
  const audioRef = useRef(null);
  const gapRef = useRef(null);
  const lastSegmentsRef = useRef([]);
  const lastSourceRef = useRef("");
  const lastTurnRef = useRef(null);
  const playTokenRef = useRef(0);
  const mountedRef = useRef(true);
  // Hold-Control state lives outside React so a keyup always matches its keydown.
  const ctrlRef = useRef({ held: false, cancelled: false });
  const micStatusRef = useRef("unknown");
  const retryRef = useRef(null);
  const outlineCacheRef = useRef(new Map());
  const homeRequestRef = useRef(null);
  const queueRef = useRef(null);
  if (!queueRef.current) queueRef.current = createClipQueue();

  const sessionRef = useRef(session);
  const phaseRef = useRef(phase);
  const startListeningRef = useRef(null);
  const stopListeningRef = useRef(null);
  const cancelListeningRef = useRef(null);
  const tapModeRef = useRef(tapToToggle);
  const textOnlyRef = useRef(false);

  const canRecord =
    typeof navigator !== "undefined" &&
    Boolean(navigator.mediaDevices?.getUserMedia);
  const textOnly =
    !canRecord ||
    ["denied", "blocked", "missing", "unsupported"].includes(micStatus);

  sessionRef.current = session;
  phaseRef.current = phase;
  tapModeRef.current = tapToToggle;
  textOnlyRef.current = textOnly;

  const setMic = useCallback((value) => {
    micStatusRef.current = value;
    setMicStatus(value);
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const data = unwrap(await tutorService.voiceHome());
        if (!active || !mountedRef.current) return;
        setHome(data);
        const only = data.subjects?.length === 1 ? data.subjects[0] : null;
        if (only) {
          if (Array.isArray(data.outline) && data.outline.length) {
            outlineCacheRef.current.set(String(only.id), data.outline);
          }
          setSubjectId(only.id);
        }
      } catch (fetchError) {
        if (active && mountedRef.current) {
          setError(errorText(fetchError) || i18n.t("tutor:voice.errors.load"));
        }
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
    const key = String(subjectId);
    const cached = outlineCacheRef.current.get(key);
    if (cached?.length) {
      setHome((current) => {
        if (!current) return current;
        const subject =
          current.subjects?.find((row) => String(row.id) === key) ||
          current.subject;
        return { ...current, subject, outline: cached };
      });
      setOutlineLoading(false);
      return undefined;
    }

    homeRequestRef.current?.abort();
    const controller = new AbortController();
    homeRequestRef.current = controller;
    let active = true;
    setOutlineLoading(true);
    (async () => {
      try {
        const data = unwrap(
          await tutorService.voiceHome(
            { subjectId },
            { signal: controller.signal },
          ),
        );
        if (!active || !mountedRef.current) return;
        setHome(data);
        outlineCacheRef.current.set(key, data.outline || []);
      } catch (fetchError) {
        if (!active || controller.signal.aborted || !mountedRef.current) return;
        setError(errorText(fetchError) || i18n.t("tutor:voice.errors.load"));
      } finally {
        if (active) setOutlineLoading(false);
      }
    })();
    return () => {
      active = false;
      controller.abort();
    };
  }, [subjectId]);

  useEffect(() => {
    if (!canRecord) {
      setMic("unsupported");
      return undefined;
    }
    let active = true;
    navigator.permissions
      ?.query?.({ name: "microphone" })
      ?.then((status) => {
        if (!active) return;
        if (status.state === "denied") setMic("blocked");
        else if (status.state === "granted") setMic("ready");
      })
      .catch(() => {
        /* older browsers do not expose the microphone permission */
      });
    return () => {
      active = false;
    };
  }, [canRecord, setMic]);

  const releaseMic = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setMicOpen(false);
  }, []);

  /** One stream for the whole session: no permission prompt on the first press. */
  const ensureMic = useCallback(async () => {
    if (streamRef.current) return streamRef.current;
    if (!canRecord) {
      setMic("unsupported");
      return null;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getAudioTracks().forEach((track) => {
        track.enabled = false;
      });
      streamRef.current = stream;
      setMic("ready");
      setMicOpen(true);
      return stream;
    } catch (micError) {
      const name = micError?.name || "";
      const missing =
        name === "NotFoundError" || name === "DevicesNotFoundError";
      setMic(missing ? "missing" : "blocked");
      return null;
    }
  }, [canRecord, setMic]);

  const checkMic = useCallback(async () => {
    if (!canRecord) {
      setMic("unsupported");
      return "unsupported";
    }
    const stream = await ensureMic();
    return stream ? "ready" : micStatusRef.current;
  }, [canRecord, ensureMic, setMic]);

  const stopAutoStop = useCallback(() => {
    if (autoStopRef.current) clearTimeout(autoStopRef.current);
    autoStopRef.current = null;
  }, []);

  /** One sequence at a time: stopping the voice also ends its reveal timeline. */
  const stopPlayback = useCallback(({ reveal = true } = {}) => {
    playTokenRef.current += 1;
    queueRef.current?.cancel();
    if (gapRef.current) clearTimeout(gapRef.current);
    gapRef.current = null;
    if (audioRef.current) {
      audioRef.current.onended = null;
      audioRef.current.onerror = null;
      audioRef.current.pause();
      audioRef.current = null;
    }
    if (reveal) setSpeakingIndex(null);
    setPreparing(false);
    setPhase((current) => (current === "speaking" ? "idle" : current));
  }, []);

  useEffect(
    () => () => {
      stopAutoStop();
      releaseMic();
      stopPlayback({ reveal: false });
      queueRef.current?.clear();
      if (shortTapTimerRef.current) clearTimeout(shortTapTimerRef.current);
    },
    [releaseMic, stopAutoStop, stopPlayback],
  );

  const playLazy = useCallback(async ({ turnId, clips, sessionId: id }) => {
    if (!id || !turnId || !clips?.length) {
      setPhase("idle");
      return { failed: false };
    }
    if (dev) {
      console.debug(`[voice] playLazy: ${clips.length} clips for turn ${turnId}`);
    }
    setSoundFailed(false);
    setPreparing(true);
    const result = await queueRef.current.play({
      turnId,
      clips,
      loadClip: ({ index, signal }) =>
        blobOf(tutorService.voiceClip(id, turnId, index, { signal })),
      onState: (state) => {
        if (!mountedRef.current) return;
        if (dev) {
          console.debug(`[voice] clip state:`, state);
        }
        if (state.type === "waiting") {
          setSpeakingIndex(state.index);
        } else if (state.type === "playing") {
          setPreparing(false);
          setPhase("speaking");
          setSpeakingIndex(state.index);
          if (state.index === 0) {
            measure("voice.boardToFirstSound", "voice-board");
          }
        } else if (state.type === "failed") {
          // A failed clip still advances the reveal so the next part appears.
          setSpeakingIndex(state.index);
        } else if (state.type === "done") {
          setPreparing(false);
          setSpeakingIndex(null);
          setPhase("idle");
          if (state.failed) setSoundFailed(true);
        }
      },
    });
    return result;
  }, []);

  /** A whole reply in one clip: the board shows it in full while it plays. */
  const play = useCallback(
    (source) => {
      if (!source) return;
      stopPlayback();
      lastSourceRef.current = source;
      lastSegmentsRef.current = [];
      lastTurnRef.current = null;
      const token = playTokenRef.current;
      const audio = new Audio(source);
      audioRef.current = audio;
      const done = () => {
        if (!mountedRef.current || token !== playTokenRef.current) return;
        audioRef.current = null;
        setPhase("idle");
      };
      audio.onended = done;
      audio.onerror = () => {
        if (!mountedRef.current || token !== playTokenRef.current) return;
        setSoundFailed(true);
        done();
      };
      setPhase("speaking");
      audio.play().catch(() => {
        if (!mountedRef.current || token !== playTokenRef.current) return;
        setSoundFailed(true);
        done();
      });
    },
    [stopPlayback],
  );

  /**
   * The inline fallback for an older server: one clip per board part, so each
   * part is revealed when its voice starts.
   */
  const playSegments = useCallback(
    (segments) => {
      const list = (Array.isArray(segments) ? segments : []).filter(
        (clip) => clip?.audio,
      );
      stopPlayback();
      lastSourceRef.current = "";
      lastSegmentsRef.current = list;
      lastTurnRef.current = null;
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
        const advance = (ok = true) => {
          if (settled) return;
          settled = true;
          if (!mountedRef.current || token !== playTokenRef.current) return;
          audioRef.current = null;
          if (!ok) setSoundFailed(true);
          index += 1;
          if (index >= list.length) {
            setSpeakingIndex(null);
            setPhase("idle");
            return;
          }
          setSpeakingIndex(index);
          gapRef.current = setTimeout(startClip, SEGMENT_GAP_MS);
        };
        audio.onended = () => advance(true);
        audio.onerror = () => advance(false);
        audio.play().catch(() => advance(false));
      };

      startClip();
    },
    [stopPlayback],
  );

  const playReply = useCallback(
    (data, { sessionId: id } = {}) => {
      if (data?.audioPending) {
        lastTurnRef.current = {
          turnId: data.turnId,
          clips: data.clips || [],
        };
        lastSegmentsRef.current = [];
        lastSourceRef.current = "";
        playLazy({
          turnId: data.turnId,
          clips: data.clips || [],
          sessionId: id,
        });
      } else if (Array.isArray(data?.segments) && data.segments.length) {
        playSegments(data.segments);
      } else if (data?.audio) {
        play(data.audio);
      } else {
        stopPlayback();
        setPhase("idle");
      }
    },
    [play, playLazy, playSegments, stopPlayback],
  );

  const replayLast = useCallback(() => {
    const lastTurn = lastTurnRef.current;
    if (lastTurn?.turnId) {
      playLazy({
        turnId: lastTurn.turnId,
        clips: lastTurn.clips,
        sessionId: sessionRef.current?.id,
      });
    } else if (lastSegmentsRef.current.length) {
      playSegments(lastSegmentsRef.current);
    } else if (lastSourceRef.current) {
      play(lastSourceRef.current);
    }
  }, [play, playLazy, playSegments]);

  const showShortTap = useCallback(() => {
    setShortTap(true);
    if (shortTapTimerRef.current) clearTimeout(shortTapTimerRef.current);
    shortTapTimerRef.current = setTimeout(() => {
      shortTapTimerRef.current = null;
      if (mountedRef.current) setShortTap(false);
    }, SHORT_TAP_MS);
  }, []);

  const sendTurn = useCallback(
    async ({ blob, durationMs, text } = {}) => {
      const id = sessionRef.current?.id;
      if (!id || phaseRef.current === "thinking") return null;
      stopPlayback({ reveal: false });
      setPhase("thinking");
      setError("");
      setLastSaid({ text: text || "", status: "sending", voice: !text });
      retryRef.current = { blob, durationMs, text };
      setCanRetry(true);
      setPendingStudentText(text || "");
      mark("voice-upload");
      try {
        const data = unwrap(
          await tutorService.voiceTurn(id, {
            audio: blob,
            text,
            durationMs,
            lazy: true,
          }),
        );
        if (!mountedRef.current) return null;
        retryRef.current = null;
        setCanRetry(false);
        setLastSaid({
          text: data.transcript || text || "",
          status: "sent",
          voice: false,
        });
        setPendingStudentText("");
        const at = new Date().toISOString();
        const said = {
          role: "student",
          text: data.transcript || text || "",
          at,
        };
        const tutor = {
          role: "tutor",
          text: data.spoken,
          spoken: data.spoken,
          lead: data.lead,
          emphasis: data.emphasis,
          blocks: data.blocks,
          followUp: data.followUp,
          options: data.options,
          questionType: data.questionType,
          stage: data.stage,
          wrapUp: Boolean(data.wrapUp),
          turnId: data.turnId,
          clips: data.clips || [],
          at,
        };
        setSession((current) =>
          current
            ? {
                ...current,
                messages: [...current.messages, said, tutor],
                creditsSpent:
                  (current.creditsSpent || 0) + (current.voice?.price || 0),
                voice: data.voice || current.voice,
              }
            : current,
        );
        setPhase("idle");
        mark("voice-board");
        playReply(data, { sessionId: id });
        return data;
      } catch (turnError) {
        if (mountedRef.current) {
          setPhase("idle");
          setPendingStudentText("");
          setLastSaid((current) =>
            current ? { ...current, status: "failed" } : current,
          );
          setError(errorText(turnError) || i18n.t("tutor:voice.errors.turn"));
        }
        return null;
      }
    },
    [playReply, stopPlayback],
  );

  const finishListening = useCallback(
    async ({ cancelled = false } = {}) => {
      holdingRef.current = false;
      const recorder = recorderRef.current;
      if (!recorder || recorder.state === "inactive") {
        setPhase("idle");
        return;
      }
      const elapsed = Date.now() - startedAtRef.current;
      stopAutoStop();
      setListeningStartedAt(0);
      await new Promise((resolve) => {
        recorder.onstop = resolve;
        recorder.stop();
      });
      recorderRef.current = null;
      streamRef.current?.getAudioTracks().forEach((track) => {
        track.enabled = false;
      });
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
        showShortTap();
        return;
      }
      await sendTurn({ blob, durationMs: elapsed });
    },
    [sendTurn, showShortTap, stopAutoStop],
  );

  const startListening = useCallback(async () => {
    if (recorderRef.current || phaseRef.current === "thinking") return;
    if (!sessionRef.current) return;
    if (sessionRef.current.voice?.canAsk === false) return;
    // Talking over the tutor stops the clip and shows the rest of the turn.
    stopPlayback();
    setError("");
    setLastSaid(null);
    setShortTap(false);
    retryRef.current = null;
    setCanRetry(false);
    holdingRef.current = true;
    mark("voice-press");
    const stream = streamRef.current || (await ensureMic());
    if (!mountedRef.current) return;
    if (!stream) {
      holdingRef.current = false;
      setPhase("idle");
      return;
    }
    if (!holdingRef.current) return;
    stream.getAudioTracks().forEach((track) => {
      track.enabled = true;
    });
    const mimeType = recorderMime();
    let recorder;
    try {
      recorder = new MediaRecorder(stream, {
        ...(mimeType ? { mimeType } : {}),
        audioBitsPerSecond: 24000,
      });
    } catch {
      // Speech needs far less than the default, but not every browser takes the option.
      recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    }
    chunksRef.current = [];
    recorder.ondataavailable = (event) => {
      if (event.data?.size) chunksRef.current.push(event.data);
    };
    recorderRef.current = recorder;
    startedAtRef.current = Date.now();
    recorder.start();
    setListeningStartedAt(startedAtRef.current);
    setPhase("listening");
    measure("voice.pressToRecording", "voice-press");
    const limit = Math.max(5, Number(home?.voice?.listenSeconds) || 30);
    autoStopRef.current = setTimeout(() => {
      if (recorderRef.current) finishListening();
    }, limit * 1000);
  }, [ensureMic, finishListening, home?.voice?.listenSeconds, stopPlayback]);

  const answerByText = useCallback(
    (text) => {
      const answer = String(text || "").trim();
      if (!answer || phaseRef.current === "thinking") return null;
      if (sessionRef.current?.voice?.canAsk === false) return null;
      return sendTurn({ text: answer });
    },
    [sendTurn],
  );

  const retrySend = useCallback(() => {
    const pending = retryRef.current;
    if (!pending) return null;
    return sendTurn(pending);
  }, [sendTurn]);

  const stopListening = useCallback(() => finishListening(), [finishListening]);
  const cancelListening = useCallback(
    () => finishListening({ cancelled: true }),
    [finishListening],
  );

  startListeningRef.current = startListening;
  stopListeningRef.current = stopListening;
  cancelListeningRef.current = cancelListening;

  useEffect(() => {
    let hiddenTimer = null;
    const onVisibility = () => {
      if (document.hidden) {
        hiddenTimer = setTimeout(() => {
          if (recorderRef.current) {
            holdingRef.current = false;
            try {
              recorderRef.current.stop();
            } catch {
              /* the recorder may already be gone */
            }
            recorderRef.current = null;
            chunksRef.current = [];
            setPhase("idle");
            setListeningStartedAt(0);
          }
          releaseMic();
        }, HIDDEN_RELEASE_MS);
      } else if (hiddenTimer) {
        clearTimeout(hiddenTimer);
        hiddenTimer = null;
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      if (hiddenTimer) clearTimeout(hiddenTimer);
    };
  }, [releaseMic]);

  /**
   * Hold Control anywhere on the board to speak. Any other key while it is held
   * means the student is using a shortcut (Ctrl+C, Ctrl+Tab), so the press is
   * thrown away instead of sent. The listeners attach once per session and read
   * the current state from refs.
   */
  const sessionActive = Boolean(session);
  useEffect(() => {
    if (!sessionActive) return undefined;
    const interactive = (target) =>
      Boolean(
        target?.closest?.(
          'input, textarea, select, [contenteditable="true"], button, a, [role="dialog"]',
        ),
      );
    const release = () => {
      const { cancelled } = ctrlRef.current;
      ctrlRef.current = { held: false, cancelled: false };
      if (cancelled) cancelListeningRef.current?.();
      else stopListeningRef.current?.();
    };
    const onKeyDown = (event) => {
      const toggleMode = tapModeRef.current;
      const talkKey =
        event.key === "Control" ||
        (toggleMode && (event.key === " " || event.key === "Enter"));
      if (!talkKey) {
        if (ctrlRef.current.held) ctrlRef.current.cancelled = true;
        return;
      }
      if (event.repeat || interactive(event.target)) return;
      if (toggleMode && event.key !== "Control") {
        event.preventDefault();
        if (holdingRef.current) stopListeningRef.current?.();
        else startListeningRef.current?.();
        return;
      }
      if (ctrlRef.current.held) return;
      if (
        phaseRef.current === "thinking" ||
        sessionRef.current?.voice?.canAsk === false
      ) {
        return;
      }
      ctrlRef.current = { held: true, cancelled: false };
      startListeningRef.current?.();
    };
    const onKeyUp = (event) => {
      if (event.key === "Control" && ctrlRef.current.held) release();
    };
    const onBlur = () => {
      if (ctrlRef.current.held) release();
      else if (holdingRef.current) stopListeningRef.current?.();
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
  }, [sessionActive]);

  const startSession = useCallback(
    async (lessonId) => {
      if (!subjectId || !lessonId || starting) return null;
      setStarting(true);
      setError("");
      if (!textOnlyRef.current) await ensureMic();
      try {
        const data = unwrap(
          await tutorService.startVoiceSession({
            subjectId,
            lessonId,
            language: i18n.language,
            audio: "lazy",
          }),
        );
        if (mountedRef.current) {
          setSession(data);
          setLastSaid(null);
          lastSegmentsRef.current = [];
          lastSourceRef.current = "";
          lastTurnRef.current = {
            turnId: data.turnId,
            clips: data.clips || [],
          };
          setPhase("idle");
          mark("voice-board");
          playReply(data, { sessionId: data.id });
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
    [ensureMic, playReply, starting, subjectId],
  );

  const resumeSession = useCallback(
    async (activeId) => {
      if (!activeId || starting) return null;
      setStarting(true);
      setError("");
      if (!textOnlyRef.current) await ensureMic();
      try {
        const data = unwrap(await tutorService.voiceSession(activeId));
        if (!mountedRef.current) return null;
        setSession(data);
        const lastStudent = [...(data.messages || [])]
          .reverse()
          .find((message) => message.role === "student");
        setLastSaid(
          lastStudent?.text
            ? { text: lastStudent.text, status: "sent", voice: false }
            : null,
        );
        const lastTutor = [...(data.messages || [])]
          .reverse()
          .find((message) => message.role === "tutor");
        lastTurnRef.current = lastTutor?.turnId
          ? { turnId: lastTutor.turnId, clips: lastTutor.clips || [] }
          : null;
        lastSegmentsRef.current = [];
        lastSourceRef.current = "";
        setPhase("idle");
        return data;
      } catch (resumeError) {
        if (mountedRef.current) {
          setError(errorText(resumeError) || i18n.t("tutor:voice.errors.load"));
        }
        return null;
      } finally {
        if (mountedRef.current) setStarting(false);
      }
    },
    [ensureMic, starting],
  );

  const endActiveSession = useCallback(async (activeId) => {
    if (!activeId) return null;
    try {
      await tutorService.endVoiceSession(activeId);
      setHome((current) =>
        current ? { ...current, activeSession: null } : current,
      );
      return true;
    } catch {
      return false;
    }
  }, []);

  const leaveSession = useCallback(async () => {
    const id = session?.id;
    stopAutoStop();
    holdingRef.current = false;
    ctrlRef.current = { held: false, cancelled: false };
    stopPlayback({ reveal: false });
    queueRef.current?.clear();
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      recorderRef.current.onstop = null;
      recorderRef.current.stop();
    }
    recorderRef.current = null;
    chunksRef.current = [];
    streamRef.current?.getAudioTracks().forEach((track) => {
      track.enabled = false;
    });
    releaseMic();
    retryRef.current = null;
    setCanRetry(false);
    setPhase("idle");
    setPreparing(false);
    setListeningStartedAt(0);
    setSession(null);
    setLastSaid(null);
    if (!id) return;
    try {
      const data = unwrap(await tutorService.endVoiceSession(id));
      if (data?.voice) {
        setHome((current) =>
          current
            ? { ...current, voice: { ...current.voice, wallet: data.voice } }
            : current,
        );
      }
    } catch {
      /* the session is closed on the server at logout */
    }
  }, [releaseMic, session?.id, stopAutoStop, stopPlayback]);

  const chooseSubject = useCallback((id) => {
    setError("");
    setSubjectId(id);
  }, []);

  const setTapToToggle = useCallback((value) => {
    const next = Boolean(value);
    setTapToToggleState(next);
    try {
      localStorage.setItem(TAP_MODE_KEY, next ? "1" : "0");
    } catch {
      /* a private window may refuse storage */
    }
  }, []);

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
    preparing,
    speakingIndex,
    listeningStartedAt,
    listenSeconds: home?.voice?.listenSeconds || 30,
    shortTap,
    soundFailed,
    micStatus,
    micOpen,
    canRecord,
    textOnly,
    tapToToggle,
    setTapToToggle,
    canRetry,
    pendingStudentText,
    lastSaid,
    chooseSubject,
    startSession,
    resumeSession,
    endActiveSession,
    leaveSession,
    startListening,
    stopListening,
    cancelListening,
    answerByText,
    retrySend,
    replay,
    stopPlayback,
    checkMic,
    dismissError: () => setError(""),
    dismissSoundFailed: () => setSoundFailed(false),
  };
};
