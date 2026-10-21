import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import {
  HiOutlineArrowLeft,
  HiOutlineArrowRight,
  HiOutlineArrowsPointingIn,
  HiOutlineArrowsPointingOut,
  HiOutlineEye,
  HiOutlineEyeSlash,
  HiOutlinePause,
  HiOutlinePlay,
  HiOutlineStop,
} from "react-icons/hi2";
import api from "../../config/api";
import { selectUser } from "../../store/slices/authSlice";
import { useSelector } from "react-redux";
import LiveLessonSlide from "../../components/liveLessons/LiveLessonSlide";
import useLiveLessonSocket from "../../hooks/useLiveLessonSocket";
import "./LiveLessonSessionPage.css";

const LivePresentationToolbar = ({
  title,
  subject,
  date,
  connection,
  observer,
  isFullscreen,
  timerText,
  timerExpired,
  isTeacher,
  sessionStatus,
  sessionJoined,
  cursorSpotlightEnabled,
  onBack,
  onToggleFullscreen,
  onToggleCursorSpotlight,
}) => (
  <header className="live-presentation-toolbar">
    <button
      className="live-presentation-back"
      type="button"
      onClick={onBack}
      aria-label="Back to live lessons"
      title="Back to live lessons"
    >
      <HiOutlineArrowLeft />
    </button>
    <div className="live-presentation-title">
      <strong title={title}>{title}</strong>
      <span>
        {[observer ? "Read-only view" : "", subject, date]
          .filter(Boolean)
          .join(" · ")}
      </span>
    </div>
    <span className={`live-connection-pill ${connection}`}>
      {observer
        ? "Observer"
        : connection === "connected"
          ? "Connected"
          : connection}
    </span>
    {timerText && (
      <span
        className={`live-timer-pill${timerExpired ? " expired" : ""}`}
        role={timerExpired ? "status" : undefined}
        aria-label={
          timerExpired
            ? "Class timer is finished"
            : `Class timer ${timerText} remaining`
        }
      >
        {timerExpired ? "Time is up" : timerText}
      </span>
    )}
    {isTeacher && sessionStatus === "live" && (
      <button
        className={`live-cursor-toggle${cursorSpotlightEnabled ? " active" : ""}`}
        type="button"
        onClick={onToggleCursorSpotlight}
        disabled={connection !== "connected" || !sessionJoined}
        aria-pressed={cursorSpotlightEnabled}
        aria-label={`Toggle teacher cursor spotlight, currently ${cursorSpotlightEnabled ? "on" : "off"}`}
        title={`Toggle cursor spotlight (Q)`}
      >
        <span className="live-cursor-toggle-dot" aria-hidden="true" />
        {cursorSpotlightEnabled ? "Spotlight on" : "Spotlight off"}
      </button>
    )}
    <button
      className="live-fullscreen-toggle"
      type="button"
      onClick={onToggleFullscreen}
      aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
      title={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
    >
      {isFullscreen ? (
        <HiOutlineArrowsPointingIn />
      ) : (
        <HiOutlineArrowsPointingOut />
      )}
    </button>
  </header>
);

const LiveLessonSessionPage = () => {
  const { sessionId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const user = useSelector(selectUser);
  const role =
    user?.role === "student"
      ? "student"
      : user?.role === "teacher"
        ? "teacher"
        : "observer";
  const [session, setSession] = useState(null);
  const socketRole = session?.isOwner ? "teacher" : role;
  const {
    state: socketState,
    roster,
    connection,
    error: socketError,
    sendAction,
    sendCursor,
    cursorSpotlight,
    sessionJoined,
  } = useLiveLessonSocket(sessionId, socketRole);
  const [loadError, setLoadError] = useState("");
  const [actionError, setActionError] = useState("");
  const [replayAvailabilitySaving, setReplayAvailabilitySaving] =
    useState(false);
  const [replayAvailabilityError, setReplayAvailabilityError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [localAnswer, setLocalAnswer] = useState("");
  const [endConfirm, setEndConfirm] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [timerNow, setTimerNow] = useState(Date.now());
  const presentationRef = useRef(null);
  const slideStageRef = useRef(null);

  useEffect(() => {
    let active = true;
    api
      .get(`/live/sessions/${sessionId}`)
      .then((response) => {
        if (active) setSession(response.data?.data?.session || null);
      })
      .catch((requestError) => {
        if (active)
          setLoadError(
            requestError.response?.data?.message ||
              "Unable to open this live lesson.",
          );
      });
    return () => {
      active = false;
    };
  }, [sessionId]);

  const state = socketState || session?.state;
  const slide = state?.slide;
  const sessionStatus = state?.status || session?.status;
  const isTeacher = Boolean(session?.isOwner);
  const isObserver = role === "observer" && !isTeacher;
  const isPaused = Boolean(state?.paused ?? session?.paused);
  const currentIndex =
    state?.currentSlideIndex ?? session?.currentSlideIndex ?? 0;
  const totalSlides = state?.totalSlides ?? session?.totalSlides ?? 0;
  const selectedAnswer = state?.myAnswer?.selectedOptionId || localAnswer;
  const currentRoster = roster.length
    ? roster
    : state?.roster || session?.roster || [];
  const revealed = Boolean(state?.revealed);
  const timerDurationMinutes = Number(
    state?.timerDurationMinutes ?? session?.timerDurationMinutes ?? 0,
  );
  const timerStartedAt = state?.startedAt || session?.startedAt;
  const timerPausedAt = state?.pausedAt || session?.pausedAt;
  const totalPausedMs = Number(
    state?.totalPausedMs ?? session?.totalPausedMs ?? 0,
  );
  const timerElapsedAt =
    isPaused && timerPausedAt ? new Date(timerPausedAt).getTime() : timerNow;
  const timerElapsedMs = timerStartedAt
    ? Math.max(
        0,
        timerElapsedAt - new Date(timerStartedAt).getTime() - totalPausedMs,
      )
    : 0;
  const timerSecondsRemaining =
    timerStartedAt && timerDurationMinutes > 0
      ? Math.max(
          0,
          Math.ceil((timerDurationMinutes * 60_000 - timerElapsedMs) / 1000),
        )
      : null;
  const timerExpired = timerSecondsRemaining === 0;
  const timerText =
    timerSecondsRemaining === null
      ? ""
      : `${String(Math.floor(timerSecondsRemaining / 60)).padStart(2, "0")}:${String(timerSecondsRemaining % 60).padStart(2, "0")}`;
  const sessionDate =
    session?.startedAt || session?.scheduledAt || session?.createdAt;
  const formattedSessionDate = sessionDate
    ? new Intl.DateTimeFormat(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
        timeZoneName: "short",
        timeZone: session.timeZone || undefined,
      }).format(new Date(sessionDate))
    : "";

  const toggleCursorSpotlight = useCallback(() => {
    const enabled = !cursorSpotlight.enabled;
    const canToggle =
      !isTeacher ||
      sessionStatus !== "live" ||
      connection !== "connected" ||
      !sessionJoined;
    if (canToggle) return;
    sendCursor("toggle", { enabled });
  }, [
    connection,
    cursorSpotlight.enabled,
    isTeacher,
    sendCursor,
    sessionJoined,
    sessionStatus,
  ]);

  const sendCursorPosition = useCallback(
    (x, y) => {
      if (
        !isTeacher ||
        !cursorSpotlight.enabled ||
        sessionStatus !== "live" ||
        state?.slideHidden
      ) {
        return;
      }
      sendCursor("move", {
        x: Math.max(0, Math.min(1, x)),
        y: Math.max(0, Math.min(1, y)),
      });
    },
    [
      cursorSpotlight.enabled,
      isTeacher,
      sendCursor,
      sessionStatus,
      state?.slideHidden,
    ],
  );

  const handleSlidePointerMove = useCallback(
    (event) => {
      if (!isTeacher || event.target instanceof HTMLIFrameElement) return;
      const slideElement = event.currentTarget.querySelector(".live-slide");
      if (!slideElement) return;
      const bounds = slideElement.getBoundingClientRect();
      if (!bounds.width || !bounds.height) return;
      sendCursorPosition(
        (event.clientX - bounds.left) / bounds.width,
        (event.clientY - bounds.top) / bounds.height,
      );
    },
    [isTeacher, sendCursorPosition],
  );

  const handleSlidePointerLeave = useCallback(() => {
    if (isTeacher && cursorSpotlight.enabled) sendCursor("hide");
  }, [cursorSpotlight.enabled, isTeacher, sendCursor]);

  useEffect(() => {
    if (!isTeacher || !cursorSpotlight.enabled) return undefined;
    const handleIframePointer = (event) => {
      const stage = slideStageRef.current;
      const slideElement = stage?.querySelector(".live-slide");
      const iframe = stage?.querySelector("iframe");
      if (
        !stage ||
        !slideElement ||
        !iframe?.contentWindow ||
        event.source !== iframe.contentWindow
      )
        return;
      if (event.data?.type === "live-lesson-slide-pointer-leave") {
        handleSlidePointerLeave();
        return;
      }
      if (
        event.data?.type !== "live-lesson-slide-pointer" ||
        !Number.isFinite(event.data.x) ||
        !Number.isFinite(event.data.y) ||
        event.data.x < 0 ||
        event.data.x > 1 ||
        event.data.y < 0 ||
        event.data.y > 1
      ) {
        return;
      }
      const slideBounds = slideElement.getBoundingClientRect();
      const iframeBounds = iframe.getBoundingClientRect();
      if (!slideBounds.width || !slideBounds.height) return;
      sendCursorPosition(
        (iframeBounds.left -
          slideBounds.left +
          event.data.x * iframeBounds.width) /
          slideBounds.width,
        (iframeBounds.top -
          slideBounds.top +
          event.data.y * iframeBounds.height) /
          slideBounds.height,
      );
    };
    window.addEventListener("message", handleIframePointer);
    return () => window.removeEventListener("message", handleIframePointer);
  }, [
    cursorSpotlight.enabled,
    handleSlidePointerLeave,
    isTeacher,
    sendCursorPosition,
  ]);

  useEffect(() => {
    if (!isTeacher || sessionStatus !== "live") return undefined;
    const onKeyDown = (event) => {
      if (
        event.key.toLowerCase() !== "q" ||
        event.repeat ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey ||
        event.target?.isContentEditable ||
        ["INPUT", "TEXTAREA", "SELECT"].includes(event.target?.tagName)
      ) {
        return;
      }
      event.preventDefault();
      toggleCursorSpotlight();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isTeacher, sessionStatus, toggleCursorSpotlight]);

  useEffect(() => {
    setLocalAnswer("");
  }, [slide?._id]);

  useEffect(() => {
    if (
      sessionStatus !== "live" ||
      isPaused ||
      !timerStartedAt ||
      timerDurationMinutes <= 0
    )
      return undefined;
    const timerEndAt =
      new Date(timerStartedAt).getTime() +
      timerDurationMinutes * 60_000 +
      totalPausedMs;
    setTimerNow(Date.now());
    const timer = window.setInterval(() => {
      const now = Date.now();
      setTimerNow(now);
      if (now >= timerEndAt) window.clearInterval(timer);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [
    isPaused,
    sessionStatus,
    timerStartedAt,
    timerDurationMinutes,
    totalPausedMs,
  ]);

  useEffect(() => {
    const syncFullscreen = () => {
      setIsFullscreen(document.fullscreenElement === presentationRef.current);
    };
    document.addEventListener("fullscreenchange", syncFullscreen);
    return () =>
      document.removeEventListener("fullscreenchange", syncFullscreen);
  }, []);

  const toggleFullscreen = useCallback(async () => {
    try {
      if (document.fullscreenElement === presentationRef.current) {
        await document.exitFullscreen();
      } else {
        await presentationRef.current?.requestFullscreen();
      }
    } catch (fullscreenError) {
      setActionError(
        fullscreenError.message || "Could not change fullscreen mode.",
      );
    }
  }, []);

  const act = useCallback(
    async (action, data) => {
      setActionError("");
      try {
        await sendAction(action, data);
      } catch (actionFailure) {
        setActionError(actionFailure.message);
      }
    },
    [sendAction],
  );

  const updateReplayAvailability = async (available) => {
    setReplayAvailabilitySaving(true);
    setReplayAvailabilityError("");
    try {
      const response = await api.patch(
        `/live/sessions/${sessionId}/replay-availability`,
        { available },
      );
      setSession((current) =>
        current
          ? {
              ...current,
              replayAvailable: response.data?.data?.replayAvailable === true,
            }
          : current,
      );
    } catch (requestError) {
      setReplayAvailabilityError(
        requestError.response?.data?.message ||
          "Could not update replay availability.",
      );
    } finally {
      setReplayAvailabilitySaving(false);
    }
  };

  useEffect(() => {
    if ((!isTeacher && role !== "teacher") || sessionStatus !== "live")
      return undefined;

    const onKeyDown = (event) => {
      if (
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        event.target?.isContentEditable
      )
        return;
      if (["INPUT", "TEXTAREA", "SELECT"].includes(event.target?.tagName))
        return;

      if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        const nextIndex = currentIndex + (event.key === "ArrowRight" ? 1 : -1);
        if (
          connection !== "connected" ||
          isPaused ||
          nextIndex < 0 ||
          nextIndex >= totalSlides
        )
          return;
        event.preventDefault();
        void act("slide:change", { index: nextIndex });
        return;
      }

      const key = event.key.toLowerCase();
      if (key === "f" && event.shiftKey) {
        if (connection !== "connected" || isPaused) return;
        event.preventDefault();
        void act("students:fullscreen", {
          enabled: !state?.studentsFullscreen,
        });
        return;
      }
      if (event.shiftKey || connection !== "connected") return;
      if (isPaused && key !== "f") return;
      if (key === "f") {
        event.preventDefault();
        void toggleFullscreen();
      } else if (key === "h") {
        event.preventDefault();
        void act("slide:hide", { hidden: !state?.slideHidden });
      } else if (key === "r" && slide?.question && !revealed) {
        event.preventDefault();
        void act("results:reveal");
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    act,
    connection,
    currentIndex,
    isTeacher,
    revealed,
    role,
    sessionStatus,
    slide?.question,
    isPaused,
    state?.questionOpen,
    state?.slideHidden,
    state?.studentsFullscreen,
    toggleFullscreen,
    totalSlides,
  ]);

  const submitAnswer = async (optionId) => {
    if (submitting || selectedAnswer || !slide?._id || isPaused) return;
    setSubmitting(true);
    setActionError("");
    try {
      await sendAction("answer:submit", {
        slideId: String(slide._id),
        selectedOptionId: optionId,
      });
      setLocalAnswer(optionId);
    } catch (actionFailure) {
      setActionError(actionFailure.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (loadError)
    return (
      <div className="live-session-page">
        <div className="live-error-banner">
          {loadError}
          <button onClick={() => navigate("/portal/live-lessons")}>
            Back to lessons
          </button>
        </div>
      </div>
    );
  if (!session)
    return (
      <div className="live-session-page">
        <div className="live-loading">Opening lesson session…</div>
      </div>
    );

  return (
    <main
      className={`live-session-page ${isTeacher ? "teacher-view" : isObserver ? "observer-view" : "student-view"} ${!isTeacher && state?.studentsFullscreen ? "student-presentation-fullscreen" : ""}`}
    >
      {sessionStatus === "waiting" && (
        <header className="live-session-topbar">
          <button
            className="live-session-back"
            onClick={() => navigate("/portal/live-lessons")}
            aria-label="Back to live lessons"
          >
            <HiOutlineArrowLeft />
          </button>
          <div className="live-session-heading">
            <span className="live-eyebrow">
              {isTeacher ? "TEACHER CONSOLE" : "LIVE CLASSROOM"}
            </span>
            <h1>{session.lessonTitle}</h1>
            {(session.lessonSubject ||
              session.lessonGrade ||
              formattedSessionDate) && (
              <span className="live-session-meta">
                {[
                  session.lessonSubject,
                  session.lessonGrade,
                  formattedSessionDate,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
            )}
          </div>
          <span className={`live-connection-pill ${connection}`}>
            {connection === "connected" ? "Connected" : connection}
          </span>
        </header>
      )}

      {(socketError || actionError) && (
        <div className="live-error-banner" role="alert">
          {actionError || socketError}
          <button onClick={() => setActionError("")}>Dismiss</button>
        </div>
      )}
      {location.state?.invitationNotice && (
        <div className="live-invitation-notice" role="status">
          {location.state.invitationNotice}
        </div>
      )}
      <div className="live-session-layout">
        {role === "student" &&
          session.meetingUrl &&
          sessionStatus !== "ended" && (
            <aside className="live-meeting-banner">
              <div>
                <strong>Your class has an online meeting</strong>
                <span>
                  Keep the Live Lesson open while you join the meeting.
                </span>
              </div>
              <a
                className="live-session-primary"
                href={session.meetingUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                Join meeting
              </a>
            </aside>
          )}
        <section className="live-session-main">
          {isTeacher && sessionStatus === "waiting" && (
            <div className="live-waiting-banner">
              <div>
                <strong>Ready when you are</strong>
                <span>
                  Share this code with your students so they can join.
                </span>
              </div>
              <code>{session.joinCode}</code>
            </div>
          )}
          {isTeacher && sessionStatus === "waiting" && (
            <div className="live-teacher-prestart">
              <div className="live-presentation" ref={presentationRef}>
                <LivePresentationToolbar
                  title={session.lessonTitle}
                  subject={session.lessonSubject}
                  date={formattedSessionDate}
                  connection={connection}
                  observer={isObserver}
                  isTeacher={isTeacher}
                  sessionStatus={sessionStatus}
                  sessionJoined={sessionJoined}
                  cursorSpotlightEnabled={cursorSpotlight.enabled}
                  isFullscreen={isFullscreen}
                  timerText={sessionStatus === "live" ? timerText : ""}
                  timerExpired={timerExpired && isTeacher}
                  onBack={() => navigate("/portal/live-lessons")}
                  onToggleFullscreen={toggleFullscreen}
                  onToggleCursorSpotlight={toggleCursorSpotlight}
                />
                <div className="live-slide-stage">
                  <LiveLessonSlide
                    slide={slide || session.state?.slide}
                    index={currentIndex}
                    total={totalSlides}
                    language={session.lessonLanguage}
                    allowScripts
                    hideHtmlHeader={
                      (slide || session.state?.slide)?.type === "html"
                    }
                  />
                </div>
              </div>
              <button
                className="live-session-primary"
                disabled={connection !== "connected"}
                onClick={() => act("session:start")}
              >
                <HiOutlinePlay /> Start lesson for students
              </button>
            </div>
          )}
          {sessionStatus !== "waiting" && (
            <div className="live-presentation" ref={presentationRef}>
              <LivePresentationToolbar
                title={session.lessonTitle}
                subject={session.lessonSubject}
                date={formattedSessionDate}
                connection={connection}
                observer={isObserver}
                isTeacher={isTeacher}
                sessionStatus={sessionStatus}
                sessionJoined={sessionJoined}
                cursorSpotlightEnabled={cursorSpotlight.enabled}
                isFullscreen={isFullscreen}
                timerText={sessionStatus === "live" ? timerText : ""}
                timerExpired={timerExpired && isTeacher}
                onBack={() => navigate("/portal/live-lessons")}
                onToggleFullscreen={toggleFullscreen}
                onToggleCursorSpotlight={toggleCursorSpotlight}
              />
              <div
                className="live-slide-stage"
                ref={slideStageRef}
                onPointerMove={handleSlidePointerMove}
                onPointerLeave={handleSlidePointerLeave}
              >
                <LiveLessonSlide
                  slide={slide}
                  index={currentIndex}
                  total={totalSlides}
                  language={session.lessonLanguage}
                  allowScripts
                  hideHtmlHeader={slide?.type === "html"}
                  hidden={!isTeacher && state?.slideHidden}
                >
                  {slide?.question && (
                    <section className="live-question-card">
                      <div className="live-question-topline">
                        <span>
                          {isTeacher
                            ? "LIVE QUESTION"
                            : isObserver
                              ? "LIVE QUESTION · OBSERVING"
                              : slide.question.kind === "tf"
                                ? "TRUE OR FALSE"
                                : "YOUR ANSWER"}
                        </span>
                        <span>
                          {state?.questionOpen
                            ? "Answers open"
                            : revealed
                              ? "Results revealed"
                              : "Waiting for teacher"}
                        </span>
                      </div>
                      <h2>{slide.question.prompt}</h2>
                      <div className="live-answer-options">
                        {slide.question.options.map((option) => {
                          const selected = selectedAnswer === option.id;
                          return (
                            <button
                              key={option.id}
                              className={`live-answer-option ${selected ? "selected" : ""}`}
                              disabled={
                                isTeacher ||
                                role !== "student" ||
                                isPaused ||
                                !state?.questionOpen ||
                                Boolean(selectedAnswer) ||
                                submitting
                              }
                              onClick={() => submitAnswer(option.id)}
                            >
                              <span>{option.id.toUpperCase()}</span>
                              {option.text}
                            </button>
                          );
                        })}
                      </div>
                      {selectedAnswer && !revealed && role === "student" && (
                        <div className="live-answer-locked">
                          Answer submitted — it is locked until your teacher
                          reveals the results.
                        </div>
                      )}
                      {revealed &&
                        role === "student" &&
                        state?.myAnswer &&
                        state?.myIsCorrect !== null &&
                        state?.myIsCorrect !== undefined && (
                          <div
                            className={`live-student-result ${state.myIsCorrect ? "correct" : "incorrect"}`}
                          >
                            {state.myIsCorrect
                              ? "Your answer was correct."
                              : "Your answer was not correct."}
                          </div>
                        )}
                    </section>
                  )}
                  {(isTeacher || role === "student") &&
                    cursorSpotlight.enabled &&
                    cursorSpotlight.visible &&
                    !state?.slideHidden && (
                      <span
                        className="live-cursor-spotlight"
                        aria-hidden="true"
                        style={{
                          left: `${cursorSpotlight.x * 100}%`,
                          top: `${cursorSpotlight.y * 100}%`,
                        }}
                      />
                    )}
                </LiveLessonSlide>
              </div>
              {!isTeacher && isPaused && (
                <div className="live-paused-banner" role="status">
                  <strong>Lesson paused</strong>
                  <span>Your teacher will resume the lesson shortly.</span>
                </div>
              )}
            </div>
          )}
          {isTeacher && isPaused && (
            <div className="live-paused-banner" role="status">
              <strong>Lesson paused</strong>
              <span>
                Students cannot answer or navigate slides until you resume.
              </span>
            </div>
          )}
          {sessionStatus === "ended" && (
            <div className="live-ended-banner">
              {isTeacher
                ? "This live lesson has ended. Review the session report or replay the lesson."
                : role === "student"
                  ? "This live lesson has ended. Your teacher can now review the session."
                  : "This live lesson has ended."}
            </div>
          )}
          {isTeacher &&
            sessionStatus !== "ended" &&
            sessionStatus !== "waiting" && (
              <div className="live-teacher-controls">
                <div className="live-slide-controls">
                  <button
                    className="live-session-secondary"
                    disabled={
                      connection !== "connected" ||
                      isPaused ||
                      currentIndex <= 0
                    }
                    onClick={() =>
                      act("slide:change", { index: currentIndex - 1 })
                    }
                  >
                    <HiOutlineArrowLeft /> Previous
                  </button>
                  <span>
                    Slide {Math.min(currentIndex + 1, totalSlides)} of{" "}
                    {totalSlides}
                  </span>
                  <button
                    className="live-session-secondary"
                    disabled={
                      connection !== "connected" ||
                      isPaused ||
                      currentIndex >= totalSlides - 1
                    }
                    onClick={() =>
                      act("slide:change", { index: currentIndex + 1 })
                    }
                  >
                    Next <HiOutlineArrowRight />
                  </button>
                  <span
                    className="live-keyboard-hint"
                    aria-label="Keyboard shortcuts"
                  >
                    ← → slides · R release · H hide · F fullscreen
                  </span>
                </div>
                {slide?.question && (
                  <div className="live-question-controls">
                    <button
                      className="live-session-secondary"
                      title="Release answers (R)"
                      onClick={() => act("results:reveal")}
                      disabled={
                        connection !== "connected" || isPaused || revealed
                      }
                    >
                      Release answers <kbd>R</kbd>
                    </button>
                  </div>
                )}
                <div className="live-session-end">
                  {!endConfirm && (
                    <button
                      className="live-session-secondary"
                      disabled={connection !== "connected"}
                      onClick={() =>
                        act(isPaused ? "session:resume" : "session:pause")
                      }
                    >
                      {isPaused ? (
                        <>
                          <HiOutlinePlay /> Resume lesson
                        </>
                      ) : (
                        <>
                          <HiOutlinePause /> Pause lesson
                        </>
                      )}
                    </button>
                  )}
                  {!endConfirm ? (
                    <button
                      className="live-session-danger"
                      onClick={() => setEndConfirm(true)}
                    >
                      <HiOutlineStop /> End session
                    </button>
                  ) : (
                    <div className="live-end-confirm">
                      <span>End the session for everyone?</span>
                      <button
                        onClick={() => {
                          setEndConfirm(false);
                          act("session:end");
                        }}
                      >
                        End lesson
                      </button>
                      <button onClick={() => setEndConfirm(false)}>
                        Keep teaching
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}
        </section>

        {isTeacher || isObserver ? (
          <aside className="live-teacher-sidebar">
            {isTeacher && sessionStatus !== "waiting" && (
              <div className="live-control-card">
                <h2>Student view</h2>
                <p>
                  Hide lesson content or expand the presentation across
                  students’ app windows. Shift+F does not enter browser
                  fullscreen; each student can use the fullscreen button on
                  their slide. Use Shift+F again to restore their normal view.
                </p>
                <button
                  className="live-session-secondary full-width"
                  title="Toggle student slide visibility (H)"
                  disabled={connection !== "connected" || isPaused}
                  onClick={() =>
                    act("slide:hide", { hidden: !state?.slideHidden })
                  }
                >
                  {state?.slideHidden ? (
                    <>
                      <HiOutlineEye /> Show slide
                    </>
                  ) : (
                    <>
                      <HiOutlineEyeSlash /> Hide slide
                    </>
                  )}
                  <kbd>H</kbd>
                </button>
                <button
                  className="live-session-secondary full-width"
                  disabled={connection !== "connected" || isPaused}
                  onClick={() =>
                    act("students:fullscreen", {
                      enabled: !state?.studentsFullscreen,
                    })
                  }
                >
                  {state?.studentsFullscreen ? (
                    <>
                      <HiOutlineArrowsPointingIn /> Restore student view
                    </>
                  ) : (
                    <>
                      <HiOutlineArrowsPointingOut /> Expand student view
                    </>
                  )}
                  <kbd>Shift+F</kbd>
                </button>
              </div>
            )}
            <div className="live-control-card">
              <div className="live-roster-heading">
                <div>
                  <h2>Class roster</h2>
                  <p>{currentRoster.length} students</p>
                </div>
                <span className="live-roster-count">
                  {
                    currentRoster.filter(
                      (student) => student.presence === "in_lesson",
                    ).length
                  }{" "}
                  here
                </span>
              </div>
              <div className="live-roster-list">
                {currentRoster.map((student) => (
                  <div className="live-roster-student" key={student.studentId}>
                    <span className={`live-presence-dot ${student.presence}`} />
                    <span>{student.name}</span>
                    <small>{student.presence.replace("_", " ")}</small>
                  </div>
                ))}
                {currentRoster.length === 0 && (
                  <p className="live-sidebar-empty">No class roster found.</p>
                )}
              </div>
            </div>
            {isTeacher && slide?.question && state?.teacherAnswer && (
              <div className="live-control-card">
                <h2>Teacher answer key</h2>
                <p>
                  {slide.question.options.find(
                    (option) =>
                      option.id === state.teacherAnswer.correctOptionId,
                  )?.text || "Correct option"}
                </p>
                {state.teacherAnswer.explanation && (
                  <p>{state.teacherAnswer.explanation}</p>
                )}
                <small>Teacher only · not shown on the presentation</small>
              </div>
            )}
            {sessionStatus === "ended" &&
              (isTeacher ||
                ["admin", "department_principal"].includes(user?.role)) && (
                <div className="live-control-card live-review-actions">
                  <h2>Session complete</h2>
                  <button
                    className="live-session-primary full-width"
                    onClick={() =>
                      navigate(
                        `/portal/live-lessons/sessions/${sessionId}/report`,
                      )
                    }
                  >
                    View session report
                  </button>
                  <button
                    className="live-session-secondary full-width"
                    onClick={() =>
                      navigate(
                        `/portal/live-lessons/sessions/${sessionId}/replay`,
                      )
                    }
                  >
                    Replay lesson
                  </button>
                  {isTeacher && (
                    <div className="live-session-replay-sharing">
                      <div>
                        <strong>Student replay access</strong>
                        <span>
                          Share this lesson replay with students in this class.
                        </span>
                      </div>
                      <label>
                        <input
                          type="checkbox"
                          checked={session.replayAvailable === true}
                          disabled={replayAvailabilitySaving}
                          onChange={(event) =>
                            updateReplayAvailability(event.target.checked)
                          }
                        />
                        {replayAvailabilitySaving
                          ? "Saving…"
                          : session.replayAvailable
                            ? "Available to students"
                            : "Not shared"}
                      </label>
                      {replayAvailabilityError && (
                        <p role="alert">{replayAvailabilityError}</p>
                      )}
                    </div>
                  )}
                </div>
              )}
          </aside>
        ) : (
          sessionStatus === "waiting" && (
            <aside className="live-student-waiting">
              <span className="live-waiting-pulse" />
              <h2>Waiting for your teacher</h2>
              <p>Your lesson will appear here as soon as the teacher starts.</p>
            </aside>
          )
        )}
      </div>
    </main>
  );
};

export default LiveLessonSessionPage;
