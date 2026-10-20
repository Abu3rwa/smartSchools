import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { HiOutlineArrowPath, HiOutlineArrowRight, HiOutlineSignal } from "react-icons/hi2";
import api from "../../config/api";
import "./LiveLessonJoinPage.css";

const LiveLessonJoinPage = () => {
  const navigate = useNavigate();
  const [sessions, setSessions] = useState([]);
  const [replays, setReplays] = useState([]);
  const [loading, setLoading] = useState(true);
  const [joiningSessionId, setJoiningSessionId] = useState("");
  const [error, setError] = useState("");

  const loadSessions = useCallback(async (showLoading = false) => {
    if (showLoading) setLoading(true);
    try {
      const response = await api.get("/live/sessions/available");
      setSessions(response.data?.data?.sessions || []);
      setReplays(response.data?.data?.replays || []);
      setError("");
    } catch (requestError) {
      setError(requestError.response?.data?.message || "Could not check for live class sessions.");
    } finally {
      if (showLoading) setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSessions(true);
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
        <p>Load live lessons to check whether a teacher has started a lesson for one of your classes. Select Join to follow along.</p>
        <button className="live-join-refresh live-join-refresh-prominent" onClick={() => loadSessions(true)} disabled={loading || Boolean(joiningSessionId)}>
          <HiOutlineArrowPath /> Load live lessons
        </button>

        {error && <div className="live-join-error" role="alert">{error}</div>}
        {loading ? (
          <div className="live-join-empty"><HiOutlineArrowPath className="live-join-spinner" /><span>Checking your classes…</span></div>
        ) : (
          <>
            <section className="live-join-section">
              <h2>Live now</h2>
              {sessions.length ? (
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
                <div className="live-join-empty compact" aria-live="polite">
                  <span className="live-join-pulse" />
                  <strong>No live lessons right now</strong>
                  <span>Check again when your teacher starts a lesson.</span>
                  <button className="live-join-refresh live-join-refresh-prominent" onClick={() => loadSessions(true)} disabled={loading || Boolean(joiningSessionId)}>
                    <HiOutlineArrowPath /> Load live lessons
                  </button>
                </div>
              )}
            </section>
            <section className="live-join-section">
              <h2>Lesson replays shared by your teachers</h2>
              {replays.length ? (
                <div className="live-available-sessions" aria-live="polite">
                  {replays.map((replay) => (
                    <article className="live-available-session" key={replay._id}>
                      <div className="live-available-session-info">
                        <span className="live-replay-status">REPLAY AVAILABLE</span>
                        <h2>{replay.title}</h2>
                        <p>
                          {replay.classId?.name || "Your class"}
                          {replay.classId?.grade ? ` · Grade ${replay.classId.grade}` : ""}
                          {replay.classId?.section ? ` · ${replay.classId.section}` : ""}
                        </p>
                        <span className="live-available-progress">
                          Lesson from {new Date(replay.startedAt || replay.endedAt).toLocaleString()}
                        </span>
                      </div>
                      <button
                        className="live-join-action"
                        onClick={() => navigate(`/portal/live-lessons/sessions/${replay._id}/replay`)}
                      >
                        Watch replay <HiOutlineArrowRight />
                      </button>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="live-join-empty compact">
                  <strong>No shared replays yet</strong>
                  <span>Replays will appear here when a teacher makes one available to your class.</span>
                </div>
              )}
            </section>
          </>
        )}

      </section>
    </main>
  );
};

export default LiveLessonJoinPage;
