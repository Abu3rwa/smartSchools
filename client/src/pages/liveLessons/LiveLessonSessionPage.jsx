import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { HiOutlineArrowLeft, HiOutlineArrowRight, HiOutlineArrowsPointingIn, HiOutlineArrowsPointingOut, HiOutlineEye, HiOutlineEyeSlash, HiOutlinePlay, HiOutlineStop } from "react-icons/hi2";
import api from "../../config/api";
import { selectUser } from "../../store/slices/authSlice";
import { useSelector } from "react-redux";
import LiveLessonSlide from "../../components/liveLessons/LiveLessonSlide";
import useLiveLessonSocket from "../../hooks/useLiveLessonSocket";
import "./LiveLessonSessionPage.css";

const LiveLessonSessionPage = () => {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const user = useSelector(selectUser);
  const role = user?.role === "student" ? "student" : "teacher";
  const { state: socketState, answers, roster, connection, error: socketError, sendAction } =
    useLiveLessonSocket(sessionId, role);
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
    api.get(`/live/sessions/${sessionId}`)
      .then((response) => {
        if (active) setSession(response.data?.data?.session || null);
      })
      .catch((requestError) => {
        if (active) setLoadError(requestError.response?.data?.message || "Unable to open this live lesson.");
      });
    return () => { active = false; };
  }, [sessionId]);

  const state = socketState || session?.state;
  const slide = state?.slide;
  const sessionStatus = state?.status || session?.status;
  const currentIndex = state?.currentSlideIndex ?? session?.currentSlideIndex ?? 0;
  const totalSlides = state?.totalSlides ?? session?.totalSlides ?? 0;
  const selectedAnswer = state?.myAnswer?.selectedOptionId || localAnswer;
  const currentAnswers = answers || state?.answers;
  const currentRoster = roster.length ? roster : state?.roster || session?.roster || [];
  const revealed = Boolean(state?.revealed);

  useEffect(() => {
    setLocalAnswer("");
  }, [slide?._id]);

  useEffect(() => {
    const syncFullscreen = () => {
      setIsFullscreen(document.fullscreenElement === presentationRef.current);
    };
    document.addEventListener("fullscreenchange", syncFullscreen);
    return () => document.removeEventListener("fullscreenchange", syncFullscreen);
  }, []);

  const toggleFullscreen = useCallback(async () => {
    try {
      if (document.fullscreenElement === presentationRef.current) {
        await document.exitFullscreen();
      } else {
        await presentationRef.current?.requestFullscreen();
      }
    } catch (fullscreenError) {
      setActionError(fullscreenError.message || "Could not change fullscreen mode.");
    }
  }, []);

  const act = useCallback(async (action, data) => {
    setActionError("");
    try {
      await sendAction(action, data);
    } catch (actionFailure) {
      setActionError(actionFailure.message);
    }
  }, [sendAction]);

  useEffect(() => {
    if (role !== "teacher" || sessionStatus !== "live") return undefined;

    const onKeyDown = (event) => {
      if (event.altKey || event.ctrlKey || event.metaKey || event.target?.isContentEditable) return;
      if (["INPUT", "TEXTAREA", "SELECT"].includes(event.target?.tagName)) return;

      if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        const nextIndex = currentIndex + (event.key === "ArrowRight" ? 1 : -1);
        if (connection !== "connected" || nextIndex < 0 || nextIndex >= totalSlides) return;
        event.preventDefault();
        void act("slide:change", { index: nextIndex });
        return;
      }

      const key = event.key.toLowerCase();
      if (key === "f" && event.shiftKey) {
        if (connection !== "connected") return;
        event.preventDefault();
        void act("students:fullscreen", { enabled: !state?.studentsFullscreen });
        return;
      }
      if (event.shiftKey || connection !== "connected") return;
      if (key === "f") {
        event.preventDefault();
        void toggleFullscreen();
      } else if (key === "h") {
        event.preventDefault();
        void act("slide:hide", { hidden: !state?.slideHidden });
      } else if (key === "o" && slide?.question && !state?.questionOpen && !revealed) {
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
    revealed,
    role,
    sessionStatus,
    slide?.question,
    state?.questionOpen,
    state?.slideHidden,
    state?.studentsFullscreen,
    toggleFullscreen,
    totalSlides,
  ]);

  const submitAnswer = async (optionId) => {
    if (submitting || selectedAnswer || !slide?._id) return;
    setSubmitting(true);
    setActionError("");
    try {
      await sendAction("answer:submit", { slideId: String(slide._id), selectedOptionId: optionId });
      setLocalAnswer(optionId);
    } catch (actionFailure) {
      setActionError(actionFailure.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (loadError) return <div className="live-session-page"><div className="live-error-banner">{loadError}<button onClick={() => navigate("/portal/live-lessons")}>Back to lessons</button></div></div>;
  if (!session) return <div className="live-session-page"><div className="live-loading">Opening lesson session…</div></div>;

  const isTeacher = role === "teacher";
  const sessionDate = session.startedAt || session.createdAt;
  return (
    <main className={`live-session-page ${isTeacher ? "teacher-view" : "student-view"} ${!isTeacher && state?.studentsFullscreen ? "student-presentation-fullscreen" : ""}`}>
      <header className="live-session-topbar">
        <button className="live-session-back" onClick={() => navigate("/portal/live-lessons")} aria-label="Back to live lessons"><HiOutlineArrowLeft /></button>
        <div className="live-session-heading">
          <span className="live-eyebrow">{isTeacher ? "TEACHER CONSOLE" : "LIVE CLASSROOM"}</span>
          <h1>{session.lessonTitle}</h1>
          {(session.lessonSubject || session.lessonGrade || sessionDate) && <span className="live-session-meta">{[session.lessonSubject, session.lessonGrade, sessionDate && new Date(sessionDate).toLocaleDateString()].filter(Boolean).join(" · ")}</span>}
        </div>
        <span className={`live-connection-pill ${connection}`}>{connection === "connected" ? "Connected" : connection}</span>
      </header>

      {(socketError || actionError) && <div className="live-error-banner" role="alert">{actionError || socketError}<button onClick={() => setActionError("")}>Dismiss</button></div>}
      <div className="live-session-layout">
        <section className="live-session-main">
          {isTeacher && sessionStatus === "waiting" && (
            <div className="live-waiting-banner"><div><strong>Ready when you are</strong><span>Share this code with your students so they can join.</span></div><code>{session.joinCode}</code></div>
          )}
          {isTeacher && sessionStatus === "waiting" && (
            <div className="live-teacher-prestart">
              <LiveLessonSlide slide={slide || session.state?.slide} index={currentIndex} total={totalSlides} language={session.lessonLanguage} allowScripts />
              <button className="live-session-primary" disabled={connection !== "connected"} onClick={() => act("session:start")}><HiOutlinePlay /> Start lesson for students</button>
            </div>
          )}
          {sessionStatus !== "waiting" && (
            <div className="live-presentation" ref={presentationRef}>
              <button
                className="live-fullscreen-toggle"
                type="button"
                onClick={toggleFullscreen}
                aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
                title={isFullscreen ? "Exit teacher fullscreen (F)" : "Teacher fullscreen (F); fullscreen students (Shift+F)"}
              >
                {isFullscreen ? <HiOutlineArrowsPointingIn /> : <HiOutlineArrowsPointingOut />}
              </button>
              <LiveLessonSlide slide={slide} index={currentIndex} total={totalSlides} language={session.lessonLanguage} allowScripts hidden={!isTeacher && state?.slideHidden}>
                {slide?.question && (
                  <section className="live-question-card">
                    <div className="live-question-topline">
                      <span>{isTeacher ? "LIVE QUESTION" : slide.question.kind === "tf" ? "TRUE OR FALSE" : "YOUR ANSWER"}</span>
                      <span>{state?.questionOpen ? "Answers open" : revealed ? "Results revealed" : "Waiting for teacher"}</span>
                    </div>
                    <h2>{slide.question.prompt}</h2>
                    <div className="live-answer-options">
                      {slide.question.options.map((option) => {
                        const selected = selectedAnswer === option.id;
                        return (
                          <button
                            key={option.id}
                            className={`live-answer-option ${selected ? "selected" : ""}`}
                            disabled={isTeacher || role !== "student" || !state?.questionOpen || Boolean(selectedAnswer) || submitting}
                            onClick={() => submitAnswer(option.id)}
                          >
                            <span>{option.id.toUpperCase()}</span>{option.text}
                            {isTeacher && currentAnswers?.students?.some((student) => student.selectedOptionId === option.id) && (
                              <small>{currentAnswers.students.filter((student) => student.selectedOptionId === option.id).length} answers</small>
                            )}
                          </button>
                        );
                      })}
                    </div>
                    {selectedAnswer && !revealed && role === "student" && <div className="live-answer-locked">Answer submitted — it is locked until your teacher reveals the results.</div>}
                    {revealed && role === "student" && state?.myAnswer && state?.myIsCorrect !== null && state?.myIsCorrect !== undefined && (
                      <div className={`live-student-result ${state.myIsCorrect ? "correct" : "incorrect"}`}>{state.myIsCorrect ? "Your answer was correct." : "Your answer was not correct."}</div>
                    )}
                  </section>
                )}
              </LiveLessonSlide>
            </div>
          )}
          {sessionStatus === "ended" && <div className="live-ended-banner">This live lesson has ended. Your teacher can now review the session.</div>}
          {isTeacher && sessionStatus !== "ended" && sessionStatus !== "waiting" && (
            <div className="live-teacher-controls">
              <div className="live-slide-controls">
                <button className="live-session-secondary" disabled={connection !== "connected" || currentIndex <= 0} onClick={() => act("slide:change", { index: currentIndex - 1 })}><HiOutlineArrowLeft /> Previous</button>
                <span>Slide {Math.min(currentIndex + 1, totalSlides)} of {totalSlides}</span>
                <button className="live-session-secondary" disabled={connection !== "connected" || currentIndex >= totalSlides - 1} onClick={() => act("slide:change", { index: currentIndex + 1 })}>Next <HiOutlineArrowRight /></button>
                <span className="live-keyboard-hint" aria-label="Keyboard shortcuts">← → slides · O open · C close · R release · H hide · F fullscreen</span>
              </div>
              {slide?.question && (
                <div className="live-question-controls">
                  {!state?.questionOpen ? (
                    <button className="live-session-primary" title="Open question (O)" onClick={() => act("question:open")} disabled={connection !== "connected" || revealed}>Open question <kbd>O</kbd></button>
                  ) : (
                    <button className="live-session-secondary" title="Close question (C)" onClick={() => act("question:close")} disabled={connection !== "connected"}>Close question <kbd>C</kbd></button>
                  )}
                  <button className="live-session-secondary" title="Release answers (R)" onClick={() => act("results:reveal")} disabled={connection !== "connected" || revealed}>Release answers <kbd>R</kbd></button>
                </div>
              )}
              <div className="live-session-end">
                {!endConfirm ? (
                  <button className="live-session-danger" onClick={() => setEndConfirm(true)}><HiOutlineStop /> End session</button>
                ) : (
                  <div className="live-end-confirm"><span>End the session for everyone?</span><button onClick={() => { setEndConfirm(false); act("session:end"); }}>End lesson</button><button onClick={() => setEndConfirm(false)}>Keep teaching</button></div>
                )}
              </div>
            </div>
          )}
        </section>

        {isTeacher ? (
          <aside className="live-teacher-sidebar">
            {sessionStatus !== "waiting" && (
              <div className="live-control-card">
                <h2>Student view</h2>
                <p>Hide lesson content or expand the presentation across students’ app windows. Use Shift+F again to restore their normal view.</p>
                <button className="live-session-secondary full-width" title="Toggle student slide visibility (H)" disabled={connection !== "connected"} onClick={() => act("slide:hide", { hidden: !state?.slideHidden })}>
                  {state?.slideHidden ? <><HiOutlineEye /> Show slide</> : <><HiOutlineEyeSlash /> Hide slide</>}
                  <kbd>H</kbd>
                </button>
                <button className="live-session-secondary full-width" disabled={connection !== "connected"} onClick={() => act("students:fullscreen", { enabled: !state?.studentsFullscreen })}>
                  {state?.studentsFullscreen ? <><HiOutlineArrowsPointingIn /> Exit students fullscreen</> : <><HiOutlineArrowsPointingOut /> Fullscreen for students</>}
                  <kbd>Shift+F</kbd>
                </button>
              </div>
            )}
            <div className="live-control-card">
              <div className="live-roster-heading"><div><h2>Class roster</h2><p>{currentRoster.length} students</p></div><span className="live-roster-count">{currentRoster.filter((student) => student.presence === "in_lesson").length} here</span></div>
              <div className="live-roster-list">
                {currentRoster.map((student) => (
                  <div className="live-roster-student" key={student.studentId}>
                    <span className={`live-presence-dot ${student.presence}`} />
                    <span>{student.name}</span>
                    <small>{student.presence.replace("_", " ")}</small>
                  </div>
                ))}
                {currentRoster.length === 0 && <p className="live-sidebar-empty">No class roster found.</p>}
              </div>
            </div>
            {slide?.question && (
              <div className="live-control-card">
                <div className="live-roster-heading"><div><h2>Live responses</h2><p>{currentAnswers?.answered || 0} of {currentAnswers?.totalStudents || currentRoster.length} answered</p></div></div>
                <div className="live-response-counts"><span className="correct">{currentAnswers?.correctCount || 0} correct</span><span className="wrong">{currentAnswers?.wrongCount || 0} wrong</span><span className="unanswered">{currentAnswers?.unansweredCount ?? currentRoster.length} waiting</span></div>
                {currentAnswers?.students?.map((student) => (
                  <div className="live-answer-student" key={student.studentId}>
                    <span className={`live-answer-state ${student.status}`} />
                    <span>{student.name}</span>
                    <small>{student.status}</small>
                  </div>
                ))}
              </div>
            )}
            {slide?.question && state?.teacherAnswer && (
              <div className="live-control-card">
                <h2>Teacher answer key</h2>
                <p>{slide.question.options.find((option) => option.id === state.teacherAnswer.correctOptionId)?.text || "Correct option"}</p>
                {state.teacherAnswer.explanation && <p>{state.teacherAnswer.explanation}</p>}
                <small>Teacher only · not shown on the presentation</small>
              </div>
            )}
            {sessionStatus === "ended" && (
              <div className="live-control-card live-review-actions">
                <h2>Session complete</h2>
                <button className="live-session-primary full-width" onClick={() => navigate(`/portal/live-lessons/sessions/${sessionId}/report`)}>View session report</button>
                <button className="live-session-secondary full-width" onClick={() => navigate(`/portal/live-lessons/sessions/${sessionId}/replay`)}>Replay lesson</button>
              </div>
            )}
          </aside>
        ) : (
          sessionStatus === "waiting" && <aside className="live-student-waiting"><span className="live-waiting-pulse" /><h2>Waiting for your teacher</h2><p>Your lesson will appear here as soon as the teacher starts.</p></aside>
        )}
      </div>
    </main>
  );
};

export default LiveLessonSessionPage;
