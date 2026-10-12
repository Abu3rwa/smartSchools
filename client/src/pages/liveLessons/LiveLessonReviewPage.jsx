import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { HiOutlineArrowLeft, HiOutlinePause, HiOutlinePlay } from "react-icons/hi2";
import api from "../../config/api";
import LiveLessonSlide from "../../components/liveLessons/LiveLessonSlide";
import "./LiveLessonReviewPage.css";

const LiveLessonReviewPage = ({ mode }) => {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const [report, setReport] = useState(null);
  const [replay, setReplay] = useState(null);
  const [error, setError] = useState("");
  const [seconds, setSeconds] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [studentFilter, setStudentFilter] = useState("");

  useEffect(() => {
    let active = true;
    const endpoint = mode === "report" ? "report" : "replay";
    api.get(`/live/sessions/${sessionId}/${endpoint}`)
      .then((response) => {
        if (!active) return;
        if (mode === "report") setReport(response.data?.data);
        else setReplay(response.data?.data);
      })
      .catch((requestError) => {
        if (active) setError(requestError.response?.data?.message || "Could not load this session review.");
      });
    return () => { active = false; };
  }, [sessionId, mode]);

  const durationSeconds = Math.max(1, Math.ceil((replay?.session?.durationMs || 1000) / 1000));
  useEffect(() => {
    if (!playing || !replay) return undefined;
    const timer = window.setInterval(() => {
      setSeconds((value) => {
        if (value >= durationSeconds) {
          setPlaying(false);
          return durationSeconds;
        }
        return value + 1;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [playing, replay, durationSeconds]);

  const replayState = useMemo(() => {
    if (!replay) return null;
    const targetMs = seconds * 1000;
    let currentSlideIndex = 0;
    let slideHidden = false;
    let questionOpen = false;
    const revealed = new Set();
    const answers = [];
    let presenceEvents = [];
    for (const event of replay.events || []) {
      if (event.offsetMs > targetMs) break;
      if (event.type === "slide:changed") {
        currentSlideIndex = event.payload?.index ?? currentSlideIndex;
        slideHidden = false;
      } else if (event.type === "slide:hidden") {
        slideHidden = Boolean(event.payload?.hidden);
      } else if (event.type === "question:opened") {
        questionOpen = true;
      } else if (event.type === "question:closed") {
        questionOpen = false;
      } else if (event.type === "results:revealed") {
        revealed.add(String(event.payload?.slideId));
        questionOpen = false;
      } else if (event.type === "answer:submitted") {
        answers.push(event);
      } else if (event.type.startsWith("presence:")) {
        presenceEvents.push(event);
      }
    }
    const slide = replay.lesson?.slides?.[currentSlideIndex];
    return {
      currentSlideIndex,
      slideHidden,
      questionOpen,
      slide: slide && revealed.has(String(slide._id)) ? slide : slide,
      revealed: Boolean(slide && revealed.has(String(slide._id))),
      answers: answers.filter((event) =>
        String(event.payload?.slideId) === String(slide?._id) &&
        (!studentFilter || String(event.payload?.studentId) === studentFilter),
      ),
      presenceEvents: presenceEvents.filter((event) => !studentFilter || String(event.actor?.userId || event.payload?.studentId) === studentFilter),
    };
  }, [replay, seconds, studentFilter]);

  if (error) return <main className="live-review-page"><div className="live-error-banner">{error}<button onClick={() => navigate("/portal/live-lessons")}>Back to lessons</button></div></main>;
  if ((mode === "report" && !report) || (mode === "replay" && !replay)) return <main className="live-review-page"><div className="live-loading">Loading session review…</div></main>;

  return (
    <main className="live-review-page">
      <header className="live-review-header">
        <button className="live-session-back" onClick={() => navigate("/portal/live-lessons")}><HiOutlineArrowLeft /> Back</button>
        <div><span className="live-eyebrow">{mode === "report" ? "SESSION REPORT" : "SESSION REPLAY"}</span><h1>{replay?.lesson?.title || report?.session?.title || "Live lesson review"}</h1></div>
      </header>
      {mode === "report" ? (
        <div className="live-report-layout">
          <section className="live-review-card"><h2>Question results</h2>
            {(report.perQuestion || []).length ? (
              <div className="live-report-table-wrap"><table><thead><tr><th>Question</th><th>Answered</th><th>Correct</th><th>Wrong</th><th>Unanswered</th><th>Correct %</th></tr></thead><tbody>
                {report.perQuestion.map((question) => <tr key={question.slideId}><td>{question.prompt}</td><td>{question.answered}</td><td>{question.correct}</td><td>{question.wrong}</td><td>{question.unanswered}</td><td>{question.percentCorrect}%</td></tr>)}
              </tbody></table></div>
            ) : <p>No question slides were included.</p>}
          </section>
          <section className="live-review-card"><h2>Student participation</h2>
            <div className="live-report-table-wrap"><table><thead><tr><th>Student</th><th>Answered</th><th>Correct</th><th>Wrong</th><th>Score</th><th>Away</th></tr></thead><tbody>
              {(report.perStudent || []).map((student) => <tr key={student.studentId}><td>{student.name}</td><td>{student.answered}</td><td>{student.correct}</td><td>{student.wrong}</td><td>{student.scorePercent}%</td><td>{student.totalAwaySeconds}s</td></tr>)}
            </tbody></table></div>
          </section>
        </div>
      ) : (
        <section className="live-review-card live-replay-player">
          <div className="live-replay-topline"><div><h2>Recorded session</h2><span>{replay.session.startedAt ? new Date(replay.session.startedAt).toLocaleString() : "Session has not started"}</span></div>
            <label>Filter student<select value={studentFilter} onChange={(event) => setStudentFilter(event.target.value)}><option value="">Everyone</option>{replay.students.map((student) => <option key={student.studentId} value={student.studentId}>{student.name}</option>)}</select></label>
          </div>
          <LiveLessonSlide slide={replayState?.slide} index={replayState?.currentSlideIndex || 0} total={replay.lesson?.slides?.length || 0} hidden={replayState?.slideHidden} />
          {replayState?.slide?.question && (
            <>
              <section className="live-question-card live-replay-question">
                <div className="live-question-topline"><span>QUESTION</span><span>{replayState.revealed ? "Results revealed" : replayState.questionOpen ? "Answers were open" : "Question was closed"}</span></div>
                <h2>{replayState.slide.question.prompt}</h2>
                <div className="live-answer-options">
                  {replayState.slide.question.options.map((option) => {
                    const optionAnswers = replayState.answers.filter((event) => event.payload?.selectedOptionId === option.id);
                    const correct = replayState.revealed && replayState.slide.question.correctOptionId === option.id;
                    return <div className={`live-answer-option ${correct ? "correct" : ""}`} key={option.id}><span>{option.id.toUpperCase()}</span>{option.text}<small>{optionAnswers.length} responses</small></div>;
                  })}
                </div>
              </section>
              <div className="live-replay-answer-log"><strong>Answers recorded on this question</strong>
                {replayState.answers.map((event, index) => {
                  const student = replay.students.find((entry) => entry.studentId === String(event.payload?.studentId));
                  const option = replayState.slide.question.options.find((item) => item.id === event.payload?.selectedOptionId);
                  return <span key={`${event.seq}-${index}`}>{student?.name || "Student"} · {option?.text || "Answer"} · {event.payload?.isCorrect ? "correct" : "incorrect"}</span>;
                })}
                {!replayState.answers.length && <span>No responses yet at this point in the replay.</span>}
              </div>
            </>
          )}
          <div className="live-replay-controls">
            <button className="live-session-secondary" onClick={() => setPlaying((value) => !value)}>{playing ? <HiOutlinePause /> : <HiOutlinePlay />}{playing ? "Pause" : "Play"}</button>
            <span>{new Date((new Date(replay.session.startedAt || 0)).getTime() + seconds * 1000).toLocaleTimeString()}</span>
            <input type="range" min="0" max={durationSeconds} value={seconds} onChange={(event) => { setPlaying(false); setSeconds(Number(event.target.value)); }} aria-label="Seek replay timeline" />
            <span>{Math.floor(durationSeconds / 60)}:{String(durationSeconds % 60).padStart(2, "0")}</span>
          </div>
          <div className="live-replay-event-list"><strong>Lesson timeline</strong>
            {(replay.events || []).filter((event) => event.offsetMs <= seconds * 1000 && (!studentFilter || String(event.actor?.userId || event.payload?.studentId) === studentFilter)).slice(-8).map((event) => <span key={event.seq}>{Math.floor(event.offsetMs / 1000)}s · {event.type.replace(":", " ")}</span>)}
            {!(replay.events || []).some((event) => event.offsetMs <= seconds * 1000) && <span>Session has not started yet.</span>}
          </div>
        </section>
      )}
    </main>
  );
};

export default LiveLessonReviewPage;
