import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
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
  onBack,
  onToggleFullscreen,
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
  const navigate = useNavigate();
  const user = useSelector(selectUser);
  const role = user?.role === "student"
    ? "student"
    : user?.role === "teacher"
      ? "teacher"
      : "observer";
  const {
    state: socketState,
    answers,
    roster,
    connection,
    error: socketError,
    sendAction,
  } = useLiveLessonSocket(sessionId, role);
  const [session, setSession] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [actionError, setActionError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [localAnswer, setLocalAnswer] = useState("");
  const [endConfirm, setEndConfirm] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const presentationRef = useRef(null);

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
  const currentAnswers = answers || state?.answers;
  const currentRoster = roster.length
    ? roster
    : state?.roster || session?.roster || [];
  const revealed = Boolean(state?.revealed);
  const sessionDate = session?.startedAt || session?.createdAt;
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

  useEffect(() => {
    setLocalAnswer("");
  }, [slide?._id]);

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

  useEffect(() => {
    if ((!isTeacher && role !== "teacher") || sessionStatus !== "live") return undefined;

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
      } else if (
        key === "o" &&
        slide?.question &&
        !state?.questionOpen &&
        !revealed
      ) {
        event.preventDefault();
        void act("question:open");
      } else if (key === "c" && state?.questionOpen) {
        event.preventDefault();
        void act("question:close");
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
            {(session.lessonSubject || session.lessonGrade || formattedSessionDate) && (
              <span className="live-session-meta">
                {[session.lessonSubject, session.lessonGrade, formattedSessionDate]
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
      <div className="live-session-layout">
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
                  isFullscreen={isFullscreen}
                  onBack={() => navigate("/portal/live-lessons")}
                  onToggleFullscreen={toggleFullscreen}
                />
                <LiveLessonSlide
                  slide={slide || session.state?.slide}
                  index={currentIndex}
                  total={totalSlides}
                  language={session.lessonLanguage}
                  allowScripts
                  hideHtmlHeader={(slide || session.state?.slide)?.type === "html"}
                />
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
                isFullscreen={isFullscreen}
                onBack={() => navigate("/portal/live-lessons")}
                onToggleFullscreen={toggleFullscreen}
              />
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
                            {(isTeacher || isObserver) &&
                              currentAnswers?.students?.some(
                                (student) =>
                                  student.selectedOptionId === option.id,
                              ) && (
                                <small>
                                  {
                                    currentAnswers.students.filter(
                                      (student) =>
                                        student.selectedOptionId === option.id,
                                    ).length
                                  }{" "}
                                  answers
                                </small>
                              )}
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
              </LiveLessonSlide>
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
                    ← → slides · O open · C close · R release · H hide · F
                    fullscreen
                  </span>
                </div>
                {slide?.question && (
                  <div className="live-question-controls">
                    {!state?.questionOpen ? (
                      <button
                        className="live-session-primary"
                        title="Open question (O)"
                        onClick={() => act("question:open")}
                        disabled={
                          connection !== "connected" || isPaused || revealed
                        }
                      >
                        Open question <kbd>O</kbd>
                      </button>
                    ) : (
                      <button
                        className="live-session-secondary"
                        title="Close question (C)"
                        onClick={() => act("question:close")}
                        disabled={connection !== "connected" || isPaused}
                      >
                        Close question <kbd>C</kbd>
                      </button>
                    )}
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
            {slide?.question && (
              <div className="live-control-card">
                <div className="live-roster-heading">
                  <div>
                    <h2>Live responses</h2>
                    <p>
                      {currentAnswers?.answered || 0} of{" "}
                      {currentAnswers?.totalStudents || currentRoster.length}{" "}
                      answered
                    </p>
                  </div>
                </div>
                <div className="live-response-counts">
                  <span className="correct">
                    {currentAnswers?.correctCount || 0} correct
                  </span>
                  <span className="wrong">
                    {currentAnswers?.wrongCount || 0} wrong
                  </span>
                  <span className="unanswered">
                    {currentAnswers?.unansweredCount ?? currentRoster.length}{" "}
                    waiting
                  </span>
                </div>
                {currentAnswers?.students?.map((student) => (
                  <div className="live-answer-student" key={student.studentId}>
                    <span className={`live-answer-state ${student.status}`} />
                    <span>{student.name}</span>
                    <small>{student.status}</small>
                  </div>
                ))}
              </div>
            )}
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
              (isTeacher || ["admin", "department_principal"].includes(user?.role)) && (
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
