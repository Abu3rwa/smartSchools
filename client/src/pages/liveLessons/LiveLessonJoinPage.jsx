import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { HiOutlineArrowPath, HiOutlineArrowRight, HiOutlineSignal } from "react-icons/hi2";
import api from "../../config/api";
import "./LiveLessonJoinPage.css";

const REFRESH_INTERVAL_MS = 10000;

const LiveLessonJoinPage = () => {
  const navigate = useNavigate();
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [joiningSessionId, setJoiningSessionId] = useState("");
  const [error, setError] = useState("");

  const loadSessions = useCallback(async (showLoading = false) => {
    if (showLoading) setLoading(true);
    try {
      const response = await api.get("/live/sessions/available");
      setSessions(response.data?.data?.sessions || []);
      setError("");
    } catch (requestError) {
      setError(requestError.response?.data?.message || "Could not check for live class sessions.");
    } finally {
      if (showLoading) setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSessions(true);
    const interval = window.setInterval(() => loadSessions(), REFRESH_INTERVAL_MS);
    return () => window.clearInterval(interval);
  }, [loadSessions]);

  const join = async (sessionId) => {
    setJoiningSessionId(sessionId);
    setError("");
    try {
      const response = await api.post(`/live/sessions/${sessionId}/join`);
      navigate(`/portal/live-lessons/student/${response.data.data.sessionId}`);
    } catch (requestError) {
      setError(requestError.response?.data?.message || "Could not join this lesson.");
      await loadSessions();
    } finally {
      setJoiningSessionId("");
    }
  };

  return (
    <main className="live-join-page">
      <section className="live-join-card">
        <div className="live-join-icon"><HiOutlineSignal size={29} /></div>
        <span className="live-eyebrow">YOUR CLASSES</span>
        <h1>Live lessons</h1>
        <p>When a teacher starts a lesson for one of your classes, it will appear here automatically. Select Join to follow along.</p>

        {error && <div className="live-join-error" role="alert">{error}</div>}
        {loading ? (
          <div className="live-join-empty"><HiOutlineArrowPath className="live-join-spinner" /><span>Checking your classes…</span></div>
        ) : sessions.length ? (
          <div className="live-available-sessions" aria-live="polite">
            {sessions.map((session) => (
              <article className="live-available-session" key={session._id}>
                <div className="live-available-session-info">
                  <span className="live-available-status">LIVE NOW</span>
                  <h2>{session.title}</h2>
                  <p>
                    {session.classId?.name || "Your class"}
                    {session.classId?.grade ? ` · Grade ${session.classId.grade}` : ""}
                    {session.classId?.section ? ` · ${session.classId.section}` : ""}
                  </p>
                  <span className="live-available-progress">
                    Slide {Math.min((session.currentSlideIndex || 0) + 1, session.totalSlides)} of {session.totalSlides}
                  </span>
                </div>
                <button
                  className="live-join-action"
                  onClick={() => join(session._id)}
                  disabled={Boolean(joiningSessionId)}
                >
                  {joiningSessionId === session._id ? "Joining…" : <>Join lesson <HiOutlineArrowRight /></>}
                </button>
              </article>
            ))}
          </div>
        ) : (
          <div className="live-join-empty" aria-live="polite">
            <span className="live-join-pulse" />
            <strong>No live lessons right now</strong>
            <span>We’ll show a Join button here as soon as a teacher starts a lesson for your class.</span>
          </div>
        )}

        <button className="live-join-refresh" onClick={() => loadSessions(true)} disabled={loading || Boolean(joiningSessionId)}>
          <HiOutlineArrowPath /> Refresh
        </button>
      </section>
    </main>
  );
};

export default LiveLessonJoinPage;
