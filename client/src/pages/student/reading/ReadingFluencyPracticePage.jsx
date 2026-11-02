import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Popover } from "@mui/material";
import {
  HiOutlineArrowLeft,
  HiOutlineArrowRight,
  HiOutlineCheck,
  HiOutlineCheckCircle,
  HiOutlineMicrophone,
  HiOutlinePlay,
  HiOutlineRefresh,
  HiOutlineStop,
  HiOutlineVolumeUp,
  HiOutlineX,
} from "react-icons/hi";
import readingService from "../../../services/readingService.js";
import { playChain } from "../../../utils/vocabAudio.js";
import {
  canSpeak,
  chunkForSpeech,
  speakChunks,
  speechLang,
} from "./ReadingViewPage/readAloud.js";
import { findVocabularyMatches } from "./ReadingViewPage/vocabularyHighlight.js";
import {
  deltaSinceFirst,
  goalDots,
  issuesByIndex,
  markedTokens,
  referenceTokens,
  signedDelta,
  smoothnessStars,
  sparklinePoints,
} from "./fluency/fluencyText.js";
import {
  MAX_RECORDING_SEC,
  useFluencyRecorder,
} from "./fluency/useFluencyRecorder.js";
import "./ReadingViewPage/ReadingViewPage.css";
import "./ReadingFluencyPracticePage.css";

const newKey = () =>
  globalThis.crypto?.randomUUID?.() ||
  `fl-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

const errorCode = (error) => error?.response?.data?.code || "";

// Slowing the model voice must not turn it into a growl.
const preservePitch = (audio) => {
  if (!audio) return;
  audio.preservesPitch = true;
  audio.mozPreservesPitch = true;
  audio.webkitPreservesPitch = true;
};

const Sparkline = ({ values, tone }) => {
  const points = sparklinePoints(values);
  if (!points) return null;
  return (
    <svg className="fluency-spark" viewBox="0 0 180 34" aria-hidden="true">
      <polyline
        points={points}
        fill="none"
        stroke={tone}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
};

const ReadingFluencyPracticePage = () => {
  const { assignmentId } = useParams();
  const navigate = useNavigate();
  const { t } = useTranslation(["reading"]);

  const [view, setView] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [activeKey, setActiveKey] = useState("");
  const [stage, setStage] = useState("listen");
  const [speed, setSpeed] = useState(1);
  const [speaking, setSpeaking] = useState(false);
  const [listenedKeys, setListenedKeys] = useState({});
  const [consentGiven, setConsentGiven] = useState(false);
  const [showConsent, setShowConsent] = useState(false);
  const [result, setResult] = useState(null);
  const [history, setHistory] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [sendError, setSendError] = useState("");
  const [idempotencyKey, setIdempotencyKey] = useState("");
  const [vocab, setVocab] = useState({ anchorEl: null, item: null });
  const [currentWord, setCurrentWord] = useState(-1);
  const [modelUrl, setModelUrl] = useState("");

  const speechRef = useRef(null);
  const audioRef = useRef(null);
  const modelAudioCacheRef = useRef(new Map());
  const modelTimesRef = useRef([]);
  const playModeRef = useRef("");
  const highlightFrameRef = useRef(0);
  const recorder = useFluencyRecorder();
  const audioSupported = canSpeak();

  useEffect(() => {
    let active = true;
    setLoading(true);
    setLoadError(null);
    readingService
      .getFluencyAssignment(assignmentId)
      .then((response) => {
        if (!active) return;
        const data = response.data.data;
        setView(data);
        setConsentGiven(Boolean(data.consent?.accepted));
        const openPart =
          data.parts.find((part) => !part.progress.goalMet && part.available) ||
          data.parts.find((part) => part.available) ||
          data.parts[0];
        setActiveKey(openPart?.key || "");
      })
      .catch((error) => {
        if (!active) return;
        setLoadError({
          code: errorCode(error),
          message: error?.response?.data?.message || "",
        });
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [assignmentId]);

  useEffect(
    () => () => {
      speechRef.current?.cancel();
      audioRef.current?.pause();
      if (highlightFrameRef.current)
        cancelAnimationFrame(highlightFrameRef.current);
      for (const url of modelAudioCacheRef.current.values())
        URL.revokeObjectURL(url);
      modelAudioCacheRef.current.clear();
    },
    [],
  );

  // A teacher can generate the model voice while this page is already open.
  const viewRef = useRef(null);
  useEffect(() => {
    viewRef.current = view;
  }, [view]);
  const lastAudioRefreshRef = useRef(0);
  useEffect(() => {
    const refreshAudio = () => {
      if (document.visibilityState !== "visible") return;
      const current = viewRef.current;
      if (!current?.parts?.some((part) => part.available && !part.modelAudio))
        return;
      if (Date.now() - lastAudioRefreshRef.current < 30000) return;
      lastAudioRefreshRef.current = Date.now();
      readingService
        .getFluencyAssignment(assignmentId)
        .then((response) => {
          const data = response.data?.data;
          if (data) setView(data);
        })
        .catch(() => {});
    };
    document.addEventListener("visibilitychange", refreshAudio);
    window.addEventListener("focus", refreshAudio);
    return () => {
      document.removeEventListener("visibilitychange", refreshAudio);
      window.removeEventListener("focus", refreshAudio);
    };
  }, [assignmentId]);

  const activeIndex = useMemo(
    () => (view?.parts || []).findIndex((part) => part.key === activeKey),
    [view, activeKey],
  );
  const activePart = activeIndex >= 0 ? view.parts[activeIndex] : null;

  useEffect(() => {
    modelTimesRef.current = activePart?.wordTimes || [];
    setCurrentWord(-1);
  }, [activePart?.key]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setModelUrl("");
    const part = activePart;
    if (!part?.modelAudio || !part.wordTimes?.length) return undefined;
    const cacheKey = `${part.key}|${part.modelAudioHash || part.level || ""}`;
    const cached = modelAudioCacheRef.current.get(cacheKey);
    if (cached) {
      setModelUrl(cached);
      return undefined;
    }
    let active = true;
    readingService
      .getFluencyModelAudio(
        view.assignment.textId,
        part.key,
        part.level,
        part.modelAudioHash,
      )
      .then((response) => {
        if (!active) return;
        const url = URL.createObjectURL(response.data);
        modelAudioCacheRef.current.set(cacheKey, url);
        setModelUrl(url);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [ // eslint-disable-line react-hooks/exhaustive-deps
    activePart?.key,
    activePart?.modelAudio,
    activePart?.modelAudioHash,
    view?.assignment?.textId,
  ]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.playbackRate = speed;
    preservePitch(audio);
  }, [speed, modelUrl]);

  const stopHighlight = useCallback(() => {
    if (highlightFrameRef.current)
      cancelAnimationFrame(highlightFrameRef.current);
    highlightFrameRef.current = 0;
    setCurrentWord(-1);
  }, []);

  const stopSpeech = useCallback(() => {
    speechRef.current?.cancel();
    speechRef.current = null;
    playModeRef.current = "";
    if (audioRef.current) {
      audioRef.current.pause();
      try {
        audioRef.current.currentTime = 0;
      } catch {
        // A media element with no source yet has no timeline to reset.
      }
    }
    stopHighlight();
    setSpeaking(false);
  }, [stopHighlight]);

  useEffect(() => {
    stopSpeech();
    setResult(null);
    setHistory(null);
    setSendError("");
    setStage("listen");
    setVocab({ anchorEl: null, item: null });
    if (recorder.phase === "review") recorder.discard();
  }, [activeKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadHistory = useCallback(
    (key) => {
      readingService
        .getFluencyAttempts(assignmentId, key)
        .then((response) => setHistory(response.data.data.attempts || []))
        .catch(() => setHistory([]));
    },
    [assignmentId],
  );

  const closeVocabulary = () => setVocab({ anchorEl: null, item: null });

  const playVocabulary = (item, term) => {
    playChain({ urls: [], text: item?.original || term });
  };

  const openVocabulary = (event, item, term) => {
    playVocabulary(item, term);
    setVocab({ anchorEl: event.currentTarget, item });
  };

  const startHighlight = () => {
    stopHighlight();
    const tick = () => {
      const audio = audioRef.current;
      const times = modelTimesRef.current;
      if (!audio || audio.paused || audio.ended) return;
      const time = audio.currentTime;
      let index = -1;
      for (let position = 0; position < times.length; position += 1) {
        if (time >= times[position][0]) index = position;
        else break;
      }
      setCurrentWord((previous) => (previous === index ? previous : index));
      highlightFrameRef.current = requestAnimationFrame(tick);
    };
    highlightFrameRef.current = requestAnimationFrame(tick);
  };

  const handleAudioEnded = () => {
    playModeRef.current = "";
    stopHighlight();
    setSpeaking(false);
    if (activePart) {
      setListenedKeys((previous) => ({ ...previous, [activePart.key]: true }));
    }
  };

  const handleAudioError = () => {
    playModeRef.current = "";
    stopHighlight();
    setSpeaking(false);
  };

  const toggleListening = async () => {
    if (!activePart) return;
    if (speaking) {
      stopSpeech();
      return;
    }

    if (modelUrl && activePart.modelAudio && activePart.wordTimes?.length) {
      const audio = audioRef.current;
      if (audio) {
        closeVocabulary();
        playModeRef.current = "model";
        audio.src = modelUrl;
        audio.playbackRate = speed;
        preservePitch(audio);
        try {
          await audio.play();
          setSpeaking(true);
          startHighlight();
          readingService
            .recordFluencyListen({
              assignmentId,
              blockKey: activePart.key,
            })
            .catch(() => {});
          return;
        } catch {
          playModeRef.current = "";
          stopHighlight();
        }
      }
    }

    if (!audioSupported) {
      setListenedKeys((previous) => ({ ...previous, [activePart.key]: true }));
      return;
    }
    closeVocabulary();
    playModeRef.current = "speech";
    speechRef.current = speakChunks(chunkForSpeech(activePart.text), {
      lang: speechLang("en"),
      rate: speed,
      onEnd: () => {
        speechRef.current = null;
        playModeRef.current = "";
        setSpeaking(false);
        setListenedKeys((previous) => ({
          ...previous,
          [activePart.key]: true,
        }));
      },
    });
    setSpeaking(true);
    readingService
      .recordFluencyListen({
        assignmentId,
        blockKey: activePart.key,
      })
      .catch(() => {});
  };

  const changeSpeed = (nextSpeed) => {
    if (nextSpeed === speed) return;
    if (playModeRef.current === "model" && audioRef.current) {
      setSpeed(nextSpeed);
      return;
    }
    stopSpeech();
    setSpeed(nextSpeed);
  };

  const applyResult = (data) => {
    setView((previous) => {
      if (!previous) return previous;
      const scoredKey = data.attempt.blockKey || activePart?.key;
      const parts = previous.parts.map((part) => {
        if (part.key !== scoredKey) return part;
        const remaining =
          data.attempt.status === "scored"
            ? Math.max(0, part.remaining - 1)
            : part.remaining;
        return {
          ...part,
          progress: data.progress,
          remaining,
          canRecord:
            previous.daily.used + 1 < previous.daily.limit && remaining > 0,
        };
      });
      const dailyUsed = previous.daily.used + 1;
      const dailyOpen = dailyUsed < previous.daily.limit;
      const partsDone = parts.filter(
        (part) => part.progress.readings >= previous.assignment.minReadings,
      ).length;
      const readings = parts.reduce(
        (total, part) => total + part.progress.readings,
        0,
      );
      return {
        ...previous,
        parts: parts.map((part) => ({
          ...part,
          canRecord: dailyOpen && part.remaining > 0,
        })),
        daily: { ...previous.daily, used: dailyUsed },
        canRecord: dailyOpen && parts.some((part) => part.remaining > 0),
        assignment: {
          ...previous.assignment,
          partsDone,
          readings,
          allPartsDone: parts.length > 0 && partsDone === parts.length,
        },
      };
    });
  };

  const beginReading = () => {
    if (!consentGiven) {
      setSendError("");
      setStage("read");
      setShowConsent(true);
      return;
    }
    if (!idempotencyKey) setIdempotencyKey(newKey());
    setSendError("");
    stopSpeech();
    setStage("read");
    recorder.start();
  };

  const acceptConsent = async () => {
    setSendError("");
    try {
      await readingService.recordFluencyConsent();
      setConsentGiven(true);
      setShowConsent(false);
      if (!idempotencyKey) setIdempotencyKey(newKey());
      stopSpeech();
      setStage("read");
      recorder.start();
    } catch {
      setSendError(t("reading:fluency.consentFailed"));
    }
  };

  const finishRecording = async () => {
    await recorder.stop();
  };

  const startOver = async () => {
    await recorder.discard();
    setIdempotencyKey(newKey());
    setSendError("");
  };

  const rerecord = async () => {
    setIdempotencyKey(newKey());
    setSendError("");
    setStage("read");
    await recorder.rerecord();
  };

  const sendRecording = async () => {
    if (!recorder.blob || !activePart) return;
    setSubmitting(true);
    setSendError("");
    try {
      const response = await readingService.scoreFluencyAttempt({
        assignmentId,
        blockKey: activePart.key,
        level: activePart.level,
        recordedSec: recorder.seconds,
        idempotencyKey,
        audio: recorder.blob,
      });
      const data = response.data.data;
      setResult(data);
      applyResult(data);
      setStage("result");
      loadHistory(activePart.key);
      await recorder.discard();
    } catch (error) {
      const code = errorCode(error);
      if (code === "FLUENCY_CONSENT_REQUIRED") {
        setConsentGiven(false);
        setShowConsent(true);
        setStage("read");
      }
      const message =
        code === "FLUENCY_DAILY_CAP_REACHED"
          ? t("reading:fluency.dailyCap")
          : code === "FLUENCY_PART_CAP_REACHED"
            ? t("reading:fluency.capReached", {
                n: view?.assignment.maxReadingsPerPart,
              })
            : code === "FLUENCY_CONSENT_REQUIRED"
              ? t("reading:fluency.consentRequired")
              : code === "AI_CREDIT_REQUIRED" || code === "AI_CREDIT_PAUSED"
                ? t("reading:fluency.noCredit")
                : error?.response?.data?.message ||
                  t("reading:fluency.sendFailed");
      setSendError(message);
    } finally {
      setSubmitting(false);
    }
  };

  const tryNotHeardAgain = () => {
    setResult(null);
    setStage("listen");
    setIdempotencyKey(newKey());
  };

  const readAgain = () => {
    setResult(null);
    setStage("listen");
    setIdempotencyKey(newKey());
  };

  const selectPart = (key) => {
    if (
      key === activeKey ||
      recorder.phase === "recording" ||
      recorder.phase === "review"
    )
      return;
    setIdempotencyKey(newKey());
    setActiveKey(key);
  };

  const nextPart = () => {
    for (let index = activeIndex + 1; index < view.parts.length; index += 1) {
      if (view.parts[index].available) {
        setIdempotencyKey(newKey());
        setActiveKey(view.parts[index].key);
        return;
      }
    }
    navigate(
      `/portal/reading/view/${view.assignment.textId}?assignmentId=${encodeURIComponent(assignmentId)}`,
    );
  };

  const goBack = () => {
    if (view?.assignment?.textId) {
      navigate(
        `/portal/reading/view/${view.assignment.textId}?assignmentId=${encodeURIComponent(assignmentId)}`,
      );
    } else {
      navigate("/portal/reading");
    }
  };

  const renderVocabularyText = (text) => {
    const matches = findVocabularyMatches(text, activePart?.vocabulary || []);
    if (!matches.length) return text;
    const pieces = [];
    let cursor = 0;
    matches.forEach(({ start, end, term, vocabulary: item }) => {
      if (start > cursor) pieces.push(text.slice(cursor, start));
      pieces.push(
        <button
          type="button"
          key={`v-${start}-${term}`}
          className="vocab-word"
          title={item?.definition || item?.simple}
          aria-label={`${term}: ${item?.definition || item?.simple || ""}`}
          onClick={(event) => openVocabulary(event, item, term)}
        >
          {term}
        </button>,
      );
      cursor = end;
    });
    if (cursor < text.length) pieces.push(text.slice(cursor));
    return pieces;
  };

  const renderListeningText = () => {
    const text = activePart?.text || "";
    const matches = findVocabularyMatches(text, activePart?.vocabulary || []);
    const tokens = referenceTokens(text);
    const highlight =
      currentWord >= 0 && currentWord < tokens.length
        ? tokens[currentWord]
        : null;
    const nodes = [];
    let cursor = 0;

    const pushPlain = (from, to) => {
      if (to <= from) return;
      if (highlight && highlight.start < to && highlight.end > from) {
        const start = Math.max(from, highlight.start);
        const end = Math.min(to, highlight.end);
        if (start > from) nodes.push(text.slice(from, start));
        nodes.push(
          <mark className="fluency-word-current" key={`h-${start}`}>
            {text.slice(start, end)}
          </mark>,
        );
        if (end < to) nodes.push(text.slice(end, to));
        return;
      }
      nodes.push(text.slice(from, to));
    };

    matches.forEach(({ start, end, term, vocabulary: item }) => {
      if (start > cursor) pushPlain(cursor, start);
      const current =
        highlight && start < highlight.end && end > highlight.start;
      nodes.push(
        <button
          type="button"
          key={`v-${start}-${term}`}
          className={`vocab-word${current ? " is-current" : ""}`}
          title={item?.definition || item?.simple}
          aria-label={`${term}: ${item?.definition || item?.simple || ""}`}
          onClick={(event) => openVocabulary(event, item, term)}
        >
          {term}
        </button>,
      );
      cursor = end;
    });
    if (cursor < text.length) pushPlain(cursor, text.length);
    return nodes;
  };

  const renderMarkedText = () => {
    const tokens = markedTokens(activePart?.text, result?.attempt?.statusMap);
    const heard = issuesByIndex(result?.attempt?.issues);
    const nodes = [];
    tokens.forEach((token, index) => {
      if (index > 0) {
        nodes.push(activePart.text.slice(tokens[index - 1].end, token.start));
      }
      const status =
        token.status === "s"
          ? "is-swapped"
          : token.status === "k"
            ? "is-skipped"
            : token.status === "e"
              ? "is-ending"
              : "";
      if (!status) {
        nodes.push(token.word);
        return;
      }
      const heardWord = heard.get(index);
      const label = heardWord
        ? t("reading:fluency.heardAs", { word: heardWord })
        : t("reading:fluency.markedWord", { word: token.word });
      nodes.push(
        <button
          type="button"
          key={`m-${token.start}`}
          className={`fluency-mark ${status}`}
          title={label}
          aria-label={label}
          onClick={() => playChain({ urls: [], text: token.word })}
        >
          {token.word}
        </button>,
      );
    });
    if (tokens.length)
      nodes.push(activePart.text.slice(tokens[tokens.length - 1].end));
    return nodes;
  };

  if (loading) {
    return (
      <div className="fluency-page">
        <div className="fluency-loading">
          <div className="spinner" />
        </div>
      </div>
    );
  }

  if (loadError || !view || !activePart) {
    const closed =
      loadError?.code === "FLUENCY_ASSIGNMENT_NOT_FOUND" ||
      loadError?.code === "FLUENCY_DISABLED";
    return (
      <div className="fluency-page">
        <div className="fluency-shell">
          <button
            type="button"
            className="btn btn-ghost fluency-back"
            onClick={() => navigate("/portal/reading")}
          >
            <HiOutlineArrowLeft size={18} />
            {t("reading:common.back")}
          </button>
          <div className="fluency-error-card">
            <HiOutlineMicrophone size={34} />
            <h1>
              {closed
                ? t("reading:fluency.closedTitle")
                : t("reading:fluency.loadFailed")}
            </h1>
            <p>
              {closed ? t("reading:fluency.closedBody") : loadError?.message}
            </p>
          </div>
        </div>
      </div>
    );
  }

  const { assignment, daily } = view;
  const partNumber = activeIndex + 1;
  const partTotal = view.parts.length;
  const partTitle =
    activePart.title || t("reading:fluency.partNumber", { n: partNumber });
  const estimatedMinutes = Math.max(
    1,
    Math.round(activePart.estimatedSeconds / 60),
  );
  const partMeta =
    estimatedMinutes <= 1
      ? t("reading:fluency.partMetaOne", { words: activePart.wordCount })
      : t("reading:fluency.partMetaMany", {
          words: activePart.wordCount,
          minutes: estimatedMinutes,
        });
  const mustListen =
    assignment.requireListenFirst &&
    (audioSupported || Boolean(activePart.modelAudio));
  const listenAvailable = audioSupported || Boolean(activePart.modelAudio);
  const listenWaiting = !audioSupported && activePart.modelAudio && !modelUrl;
  const hasListened = Boolean(listenedKeys[activePart.key]);
  const remaining = activePart.remaining;
  const dailyOpen = daily.used < daily.limit;
  const canStart =
    activePart.available &&
    remaining > 0 &&
    dailyOpen &&
    (!mustListen || hasListened);
  const nextReadingNumber = Math.min(
    activePart.progress.readings + 1,
    assignment.maxReadingsPerPart,
  );
  const resultProgress = result?.progress || activePart.progress;
  const attempt = result?.attempt;
  const goalReached = Boolean(result?.goalMet);
  const isNotHeard = attempt && attempt.status !== "scored";
  const accuracyDelta = deltaSinceFirst(
    resultProgress.latest?.accuracy,
    resultProgress.first?.accuracy,
  );
  const paceDelta = deltaSinceFirst(
    resultProgress.latest?.wpm,
    resultProgress.first?.wpm,
  );
  const showPace =
    result?.settings?.showPace !== false && attempt && !attempt.paceHidden;
  const wordsToPractise = result?.feedback?.words?.length
    ? result.feedback.words
    : (resultProgress.focusWords || []).map((item) => item.word).slice(0, 5);
  const scoredHistory = (history || []).filter(
    (row) => row.status === "scored",
  );
  const hasNextPart = view.parts
    .slice(activeIndex + 1)
    .some((part) => part.available);

  return (
    <div className="fluency-page">
      <div className="fluency-shell">
        <button
          type="button"
          className="btn btn-ghost fluency-back"
          onClick={goBack}
        >
          <HiOutlineArrowLeft size={18} />
          {t("reading:fluency.backToReading")}
        </button>

        <header className="fluency-head">
          <div>
            <h1>
              {assignment.title}
              <span className="fluency-head-suffix">
                {" "}
                · {t("reading:fluency.title")}
              </span>
            </h1>
            <p>{t("reading:fluency.subtitle")}</p>
          </div>
          {activePart.level != null && (
            <span className="reading-chip">
              {t("reading:view.gradeLevel", { level: activePart.level })}
            </span>
          )}
        </header>

        <section className="fluency-goal">
          <div className="fluency-goal-row">
            <span>
              {t("reading:fluency.goal", { n: assignment.minReadings })}
            </span>
            <strong>
              {t("reading:fluency.partsDone", {
                done: assignment.partsDone,
                total: assignment.partsTotal,
              })}
            </strong>
          </div>
          <div className="progress-track" role="presentation">
            <div
              className="progress-fill"
              style={{
                width: `${assignment.partsTotal ? Math.round((assignment.partsDone / assignment.partsTotal) * 100) : 0}%`,
              }}
            />
          </div>
        </section>

        <div className="fluency-layout">
          <nav
            className="fluency-parts"
            aria-label={t("reading:fluency.partsHeading")}
          >
            <h2>{t("reading:fluency.partsHeading")}</h2>
            {view.parts.map((part, index) => {
              const dots = goalDots(
                part.progress.readings,
                assignment.minReadings,
              );
              const latest = part.progress.latest?.accuracy;
              const isActive = index === activeIndex;
              const locked =
                recorder.phase === "recording" || recorder.phase === "review";
              return (
                <button
                  type="button"
                  key={part.key}
                  className={`fluency-part${isActive ? " is-active" : ""}${part.progress.goalMet ? " is-done" : ""}`}
                  aria-current={isActive ? "step" : undefined}
                  disabled={locked && !isActive}
                  onClick={() => selectPart(part.key)}
                >
                  <span className="fluency-part-icon" aria-hidden="true">
                    {part.progress.goalMet ? (
                      <HiOutlineCheckCircle size={18} />
                    ) : isActive ? (
                      "▶"
                    ) : (
                      "○"
                    )}
                  </span>
                  <span className="fluency-part-body">
                    <span className="fluency-part-title">
                      {part.title ||
                        t("reading:fluency.partNumber", { n: index + 1 })}
                    </span>
                    <span className="fluency-part-meta">
                      <span
                        className="fluency-dots"
                        aria-label={t("reading:fluency.readingsCount", {
                          n: part.progress.readings,
                        })}
                      >
                        {dots.map((filled, dotIndex) => (
                          <span
                            key={dotIndex}
                            className={`fluency-dot${filled ? " is-filled" : ""}`}
                          />
                        ))}
                      </span>
                      {latest != null && part.progress.readings > 0 && (
                        <span className="fluency-part-accuracy">
                          {Math.round(latest)}%
                        </span>
                      )}
                      {!part.available && (
                        <span className="fluency-part-gone">
                          {t("reading:fluency.notAvailable")}
                        </span>
                      )}
                    </span>
                  </span>
                </button>
              );
            })}
          </nav>

          <section className="fluency-card">
            <div className="fluency-card-head">
              <div>
                <h2>
                  {t("reading:fluency.partOf", {
                    n: partNumber,
                    total: partTotal,
                  })}
                  {activePart.title ? ` · ${partTitle}` : ""}
                </h2>
                <p>{partMeta}</p>
              </div>
            </div>

            <ol
              className="fluency-steps"
              aria-label={t("reading:fluency.stepsLabel")}
            >
              {["listen", "read", "results"].map((step, index) => {
                const position = ["listen", "read", "results"].indexOf(stage);
                const state =
                  index < position
                    ? "is-done"
                    : index === position
                      ? "is-active"
                      : "";
                return (
                  <li key={step} className={`fluency-step ${state}`}>
                    <span className="fluency-step-number">{index + 1}</span>
                    {t(`reading:fluency.steps.${step}`)}
                  </li>
                );
              })}
            </ol>

            {stage === "listen" && (
              <>
                {!activePart.available ? (
                  <div className="fluency-state">
                    <HiOutlineCheckCircle size={26} />
                    <h3>{t("reading:fluency.notAvailable")}</h3>
                  </div>
                ) : (
                  <>
                    <div className="fluency-listen-row">
                      <button
                        type="button"
                        className={`btn btn-primary fluency-listen${speaking ? " is-speaking" : ""}`}
                        onClick={toggleListening}
                        disabled={listenWaiting}
                      >
                        {speaking ? (
                          <HiOutlineStop size={17} />
                        ) : (
                          <HiOutlinePlay size={17} />
                        )}
                        {speaking
                          ? t("reading:fluency.stop")
                          : t("reading:fluency.listen")}
                      </button>
                      <div
                        className="fluency-speed"
                        role="group"
                        aria-label={t("reading:fluency.speedLabel")}
                      >
                        {[0.75, 1].map((value) => (
                          <button
                            type="button"
                            key={value}
                            className={`fluency-speed-btn${speed === value ? " is-active" : ""}`}
                            aria-pressed={speed === value}
                            onClick={() => changeSpeed(value)}
                          >
                            {value === 1 ? "1×" : "0.75×"}
                          </button>
                        ))}
                      </div>
                    </div>

                    <audio
                      ref={audioRef}
                      className="fluency-model-audio"
                      preload="auto"
                      onEnded={handleAudioEnded}
                      onError={handleAudioError}
                    />

                    <div className="reading-passage fluency-paper">
                      <div className="reading-essay" dir="ltr" lang="en">
                        <p className="reading-text">{renderListeningText()}</p>
                      </div>
                      {activePart.vocabulary.length > 0 && (
                        <p className="reading-instruction">
                          {t("reading:fluency.tapWords")}
                        </p>
                      )}
                    </div>

                    {!listenAvailable && (
                      <p className="fluency-note">
                        {t("reading:fluency.noSpeech")}
                      </p>
                    )}

                    {remaining <= 0 || !dailyOpen ? (
                      <div className="fluency-state">
                        <HiOutlineCheckCircle size={26} />
                        <h3>
                          {t("reading:fluency.capTitle", {
                            n: assignment.maxReadingsPerPart,
                          })}
                        </h3>
                        <p>
                          {!dailyOpen
                            ? t("reading:fluency.dailyCap")
                            : t("reading:fluency.capBody")}
                        </p>
                      </div>
                    ) : (
                      <div className="fluency-start">
                        <div className="fluency-start-text">
                          <strong>
                            {t("reading:fluency.readingOf", {
                              n: nextReadingNumber,
                              total: assignment.maxReadingsPerPart,
                            })}
                          </strong>
                          <span>{t("reading:fluency.ready")}</span>
                        </div>
                        <button
                          type="button"
                          className="btn btn-primary fluency-start-btn"
                          disabled={!canStart || showConsent}
                          onClick={beginReading}
                          aria-describedby={`fluency-start-hint-${activePart.key}`}
                        >
                          <HiOutlineMicrophone size={17} />
                          {t("reading:fluency.startReading")}
                        </button>
                        <p
                          className="fluency-start-hint"
                          id={`fluency-start-hint-${activePart.key}`}
                        >
                          {mustListen && !hasListened
                            ? t("reading:fluency.listenFirst")
                            : t("reading:fluency.startHint")}
                        </p>
                      </div>
                    )}
                  </>
                )}
              </>
            )}

            {stage === "read" && (
              <>
                {showConsent ? (
                  <div
                    className="fluency-consent"
                    role="region"
                    aria-labelledby="fluency-consent-title"
                  >
                    <HiOutlineMicrophone size={26} />
                    <h3 id="fluency-consent-title">
                      {t("reading:fluency.consentTitle")}
                    </h3>
                    <p>{t("reading:fluency.consentBody")}</p>
                    {sendError && (
                      <p className="fluency-send-error">{sendError}</p>
                    )}
                    <div className="fluency-consent-actions">
                      <button
                        type="button"
                        className="btn btn-primary"
                        onClick={acceptConsent}
                      >
                        {t("reading:fluency.consentContinue")}
                      </button>
                      <button
                        type="button"
                        className="btn btn-ghost"
                        onClick={() => {
                          setShowConsent(false);
                          setStage("listen");
                        }}
                      >
                        {t("reading:common.cancel")}
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    {recorder.error === "blocked" && (
                      <div className="fluency-state">
                        <HiOutlineMicrophone size={26} />
                        <h3>{t("reading:fluency.micBlockedTitle")}</h3>
                        <p>{t("reading:fluency.micBlockedBody")}</p>
                        <button
                          type="button"
                          className="btn btn-primary"
                          onClick={beginReading}
                        >
                          {t("reading:fluency.tryAgain")}
                        </button>
                      </div>
                    )}
                    {(recorder.error === "mic" ||
                      recorder.error === "unsupported") && (
                      <div className="fluency-state">
                        <HiOutlineVolumeUp size={26} />
                        <h3>{t("reading:fluency.noMicTitle")}</h3>
                        <p>{t("reading:fluency.noMicBody")}</p>
                        <button
                          type="button"
                          className="btn btn-secondary"
                          onClick={toggleListening}
                        >
                          {speaking
                            ? t("reading:fluency.stop")
                            : t("reading:fluency.listen")}
                        </button>
                      </div>
                    )}

                    <div className="reading-passage fluency-paper fluency-paper-plain">
                      <div className="reading-essay" dir="ltr" lang="en">
                        <p className="reading-text">
                          {renderVocabularyText(activePart.text)}
                        </p>
                      </div>
                    </div>

                    <div className="fluency-record-bar" aria-live="polite">
                      {recorder.phase === "idle" &&
                        recorder.error !== "blocked" &&
                        recorder.error !== "mic" &&
                        recorder.error !== "unsupported" && (
                          <div className="fluency-record-idle">
                            {recorder.error === "tooShort" && (
                              <p className="fluency-send-error">
                                {t("reading:fluency.tooShort")}
                              </p>
                            )}
                            <button
                              type="button"
                              className="btn btn-primary"
                              onClick={beginReading}
                            >
                              <HiOutlineMicrophone size={17} />
                              {t("reading:fluency.startReading")}
                            </button>
                          </div>
                        )}

                      {(recorder.phase === "requesting" ||
                        recorder.phase === "recording") && (
                        <div className="fluency-record-live">
                          <div className="fluency-record-status">
                            <span
                              className={`fluency-rec-dot${recorder.phase === "recording" ? " is-live" : ""}`}
                            />
                            <span>
                              {recorder.phase === "recording"
                                ? t("reading:fluency.recording")
                                : t("reading:fluency.startingMic")}
                            </span>
                            <span className="fluency-rec-time">
                              {String(
                                Math.floor(recorder.seconds / 60),
                              ).padStart(2, "0")}
                              :{String(recorder.seconds % 60).padStart(2, "0")}
                            </span>
                          </div>
                          <div className="fluency-level" aria-hidden="true">
                            {[0.35, 0.6, 0.85, 1, 0.8, 0.55, 0.3].map(
                              (threshold, index) => (
                                <span
                                  key={index}
                                  className={`fluency-level-bar${recorder.level >= threshold ? " is-on" : ""}`}
                                />
                              ),
                            )}
                          </div>
                          {recorder.quiet && (
                            <p className="fluency-quiet">
                              {t("reading:fluency.quietHint")}
                            </p>
                          )}
                          <div className="fluency-record-actions">
                            <button
                              type="button"
                              className="btn btn-primary"
                              onClick={finishRecording}
                              disabled={
                                recorder.phase !== "recording" ||
                                recorder.seconds < 1
                              }
                            >
                              <HiOutlineCheck size={17} />
                              {t("reading:fluency.finish")}
                            </button>
                            <button
                              type="button"
                              className="btn btn-ghost"
                              onClick={startOver}
                            >
                              <HiOutlineRefresh size={16} />
                              {t("reading:fluency.startOver")}
                            </button>
                          </div>
                          <span className="fluency-limit-note">
                            {t("reading:fluency.autoStop", {
                              n: MAX_RECORDING_SEC / 60,
                            })}
                          </span>
                        </div>
                      )}

                      {recorder.phase === "review" && (
                        <div className="fluency-review">
                          <div className="fluency-review-head">
                            <strong>{t("reading:fluency.reviewTitle")}</strong>
                            <span>{t("reading:fluency.reviewHint")}</span>
                          </div>
                          {recorder.playbackUrl && (
                            <audio
                              className="fluency-playback"
                              controls
                              src={recorder.playbackUrl}
                            >
                              <track kind="captions" />
                            </audio>
                          )}
                          {sendError && (
                            <p className="fluency-send-error">{sendError}</p>
                          )}
                          <div className="fluency-record-actions">
                            <button
                              type="button"
                              className="btn btn-primary"
                              onClick={sendRecording}
                              disabled={submitting}
                            >
                              <HiOutlineArrowRight size={17} />
                              {submitting
                                ? t("reading:fluency.sending")
                                : sendError
                                  ? t("reading:fluency.sendAgain")
                                  : t("reading:fluency.send")}
                            </button>
                            <button
                              type="button"
                              className="btn btn-ghost"
                              onClick={rerecord}
                              disabled={submitting}
                            >
                              <HiOutlineRefresh size={16} />
                              {t("reading:fluency.rerecord")}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>

                    {submitting && (
                      <div className="fluency-checking" aria-live="polite">
                        <div className="spinner" />
                        <h3>{t("reading:fluency.checking")}</h3>
                        <p>{t("reading:fluency.checkingHint")}</p>
                      </div>
                    )}
                  </>
                )}
              </>
            )}

            {stage === "result" &&
              attempt &&
              (isNotHeard ? (
                <div className="fluency-state fluency-not-heard">
                  <HiOutlineMicrophone size={28} />
                  <h3>{t("reading:fluency.notHeardTitle")}</h3>
                  <p>{t("reading:fluency.notHeard")}</p>
                  <p className="fluency-note">
                    {t("reading:fluency.notHeardHint")}
                  </p>
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={tryNotHeardAgain}
                  >
                    {t("reading:fluency.tryAgain")}
                  </button>
                </div>
              ) : (
                <div className="fluency-results">
                  {goalReached && (
                    <p className="fluency-goal-met">
                      <HiOutlineCheckCircle size={18} />
                      {t("reading:fluency.goalMet", {
                        n: resultProgress.readings,
                      })}
                    </p>
                  )}
                  <p className="fluency-result-lead">
                    {resultProgress.readings < assignment.minReadings
                      ? t("reading:fluency.readingOfResult", {
                          n: resultProgress.readings,
                          total: assignment.minReadings,
                        })
                      : t("reading:fluency.readingNumber", {
                          n: resultProgress.readings,
                        })}
                  </p>
                  <p className="fluency-result-words">
                    {t("reading:fluency.wordsRead", {
                      read: attempt.wordsAttempted,
                      total: activePart.wordCount,
                    })}
                  </p>

                  <div className="fluency-tiles">
                    <section className="fluency-tile">
                      <h3>{t("reading:fluency.accuracy")}</h3>
                      {resultProgress.readings > 1 && accuracyDelta !== null ? (
                        <>
                          <strong className="fluency-tile-change">
                            {accuracyDelta > 0
                              ? "▲ "
                              : accuracyDelta < 0
                                ? "▼ "
                                : ""}
                            {signedDelta(accuracyDelta)}
                          </strong>
                          <span className="fluency-tile-sub">
                            {t("reading:fluency.sinceFirst")}
                          </span>
                        </>
                      ) : (
                        <span className="fluency-tile-sub">
                          {t("reading:fluency.startingPoint")}
                        </span>
                      )}
                      <span className="fluency-tile-value">
                        {Math.round(attempt.accuracy)}%
                      </span>
                      {result?.feedback && (
                        <span
                          className={`fluency-tier is-${result.feedback.tier}`}
                        >
                          {t(`reading:${result.feedback.tierKey}`)}
                        </span>
                      )}
                    </section>

                    {showPace && (
                      <section className="fluency-tile">
                        <h3>{t("reading:fluency.pace")}</h3>
                        {resultProgress.readings > 1 && paceDelta !== null ? (
                          <>
                            <strong className="fluency-tile-change">
                              {paceDelta > 0 ? "▲ " : paceDelta < 0 ? "▼ " : ""}
                              {signedDelta(paceDelta)}
                            </strong>
                            <span className="fluency-tile-sub">
                              {t("reading:fluency.sinceFirst")}
                            </span>
                          </>
                        ) : (
                          <span className="fluency-tile-sub">
                            {t("reading:fluency.startingPoint")}
                          </span>
                        )}
                        <span className="fluency-tile-value">
                          {attempt.wpm} wpm
                        </span>
                        {result?.settings?.targetWpm != null && (
                          <span className="fluency-tile-sub">
                            {t("reading:fluency.target", {
                              value: result.settings.targetWpm,
                            })}
                          </span>
                        )}
                      </section>
                    )}

                    <section className="fluency-tile">
                      <h3>{t("reading:fluency.smoothness")}</h3>
                      <span
                        className="fluency-stars"
                        aria-label={t("reading:fluency.smoothnessLabel")}
                      >
                        {smoothnessStars(attempt.smoothness).map(
                          (filled, index) => (
                            <span
                              key={index}
                              className={filled ? "is-filled" : ""}
                            >
                              ★
                            </span>
                          ),
                        )}
                      </span>
                      <span className="fluency-tile-sub">
                        {t("reading:fluency.longPauses", {
                          n: attempt.longPauses,
                        })}
                      </span>
                    </section>
                  </div>

                  <div className="reading-passage fluency-paper">
                    <h3 className="fluency-section-title">
                      {t("reading:fluency.yourReading")}
                    </h3>
                    <p
                      className="reading-text fluency-marked"
                      dir="ltr"
                      lang="en"
                    >
                      {renderMarkedText()}
                    </p>
                    {attempt.issues?.length > 0 && (
                      <ul className="fluency-legend">
                        <li>
                          <span className="fluency-mark is-swapped">✕</span>
                          {t("reading:fluency.legendDifferent")}
                        </li>
                        <li>
                          <span className="fluency-mark is-skipped">–</span>
                          {t("reading:fluency.legendSkipped")}
                        </li>
                        <li>
                          <span className="fluency-mark is-ending">~</span>
                          {t("reading:fluency.legendEnding")}
                        </li>
                      </ul>
                    )}
                  </div>

                  {wordsToPractise.length > 0 && (
                    <section className="fluency-practice-words">
                      <h3 className="fluency-section-title">
                        {t("reading:fluency.wordsToPractise")}
                      </h3>
                      <div className="fluency-word-chips">
                        {wordsToPractise.map((word) => (
                          <button
                            type="button"
                            key={word}
                            className="fluency-word-chip"
                            onClick={() => playChain({ urls: [], text: word })}
                          >
                            <HiOutlineVolumeUp size={14} />
                            {word}
                          </button>
                        ))}
                      </div>
                    </section>
                  )}

                  {scoredHistory.length > 1 && (
                    <section className="fluency-history">
                      <h3 className="fluency-section-title">
                        {t("reading:fluency.yourReadings")}
                      </h3>
                      <div className="fluency-history-row">
                        <span>{t("reading:fluency.accuracySeries")}</span>
                        <Sparkline
                          values={scoredHistory.map((row) => row.accuracy)}
                          tone="#e2ab5f"
                        />
                      </div>
                      {scoredHistory.some((row) => row.wpm != null) && (
                        <div className="fluency-history-row">
                          <span>{t("reading:fluency.paceSeries")}</span>
                          <Sparkline
                            values={scoredHistory.map((row) => row.wpm)}
                            tone="#9fd0c3"
                          />
                        </div>
                      )}
                    </section>
                  )}

                  {result?.feedback && (
                    <p className="fluency-next-step">
                      <strong>{t("reading:fluency.nextStepLabel")}</strong>{" "}
                      {t(
                        `reading:${result.feedback.nextStep.key}`,
                        result.feedback.nextStep.params,
                      )}
                    </p>
                  )}

                  <div className="fluency-result-actions">
                    {goalReached && hasNextPart ? (
                      <>
                        <button
                          type="button"
                          className="btn btn-primary"
                          onClick={nextPart}
                        >
                          {t("reading:fluency.nextPart")}
                          <HiOutlineArrowRight size={17} />
                        </button>
                        {remaining > 0 && (
                          <button
                            type="button"
                            className="btn btn-secondary"
                            onClick={readAgain}
                          >
                            {t("reading:fluency.readAgain")}
                          </button>
                        )}
                      </>
                    ) : (
                      <>
                        {remaining > 0 ? (
                          <button
                            type="button"
                            className="btn btn-primary"
                            onClick={readAgain}
                          >
                            <HiOutlineRefresh size={16} />
                            {t("reading:fluency.readAgain")}
                          </button>
                        ) : (
                          <span className="fluency-note">
                            {t("reading:fluency.capTitle", {
                              n: assignment.maxReadingsPerPart,
                            })}
                          </span>
                        )}
                        {hasNextPart && (
                          <button
                            type="button"
                            className="btn btn-secondary"
                            onClick={nextPart}
                          >
                            {t("reading:fluency.nextPart")}
                            <HiOutlineArrowRight size={17} />
                          </button>
                        )}
                      </>
                    )}
                  </div>
                  {!hasNextPart && goalReached && (
                    <p className="fluency-all-done">
                      {t("reading:fluency.allPartsDone")}
                    </p>
                  )}
                </div>
              ))}
          </section>
        </div>

        <Popover
          open={Boolean(vocab.item && vocab.anchorEl)}
          anchorEl={vocab.anchorEl}
          onClose={closeVocabulary}
          anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
          transformOrigin={{ vertical: "top", horizontal: "center" }}
          slotProps={{
            paper: {
              className: "vocab-pop",
              sx: { width: 300, maxWidth: "calc(100vw - 32px)" },
            },
          }}
        >
          {vocab.item && (
            <>
              <div className="vocab-pop-head">
                <div className="vocab-pop-term">
                  <span className="vocab-pop-word">{vocab.item.original}</span>
                  {vocab.item.simple &&
                    vocab.item.simple !== vocab.item.original && (
                      <span className="vocab-pop-simple">
                        {vocab.item.simple}
                      </span>
                    )}
                </div>
                <button
                  type="button"
                  className="vocab-pop-close"
                  onClick={closeVocabulary}
                  aria-label={t("reading:common.close")}
                >
                  <HiOutlineX size={18} />
                </button>
              </div>
              {(vocab.item.definition || vocab.item.meaning) && (
                <p className="vocab-pop-def">
                  {vocab.item.definition || vocab.item.meaning}
                </p>
              )}
              {vocab.item.arabicMeaning && (
                <p className="vocab-pop-def" lang="ar" dir="rtl">
                  {vocab.item.arabicMeaning}
                </p>
              )}
              <div className="vocab-pop-actions">
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() =>
                    playVocabulary(vocab.item, vocab.item.original)
                  }
                >
                  <HiOutlineVolumeUp size={16} />
                  {t("reading:view.listen")}
                </button>
              </div>
            </>
          )}
        </Popover>
      </div>
    </div>
  );
};

export default ReadingFluencyPracticePage;
