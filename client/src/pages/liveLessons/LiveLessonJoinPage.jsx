import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { HiOutlineArrowRight, HiOutlineKey } from "react-icons/hi2";
import api from "../../config/api";
import "./LiveLessonJoinPage.css";

const LiveLessonJoinPage = () => {
  const navigate = useNavigate();
  const [joinCode, setJoinCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const join = async (event) => {
    event.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const response = await api.post("/live/sessions/join", { joinCode });
      navigate(`/portal/live-lessons/student/${response.data.data.sessionId}`);
    } catch (requestError) {
      setError(requestError.response?.data?.message || "Could not join this lesson.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="live-join-page">
      <form className="live-join-card" onSubmit={join}>
        <div className="live-join-icon"><HiOutlineKey size={29} /></div>
        <span className="live-eyebrow">JOIN YOUR CLASS</span>
        <h1>Enter the lesson code</h1>
        <p>Your teacher will share a six-character code. Your lesson screen will follow along as the class moves through the slides.</p>
        <label htmlFor="live-join-code">Lesson code</label>
        <input
          id="live-join-code"
          value={joinCode}
          onChange={(event) => setJoinCode(event.target.value.toUpperCase().replace(/[^A-HJ-NP-Z2-9]/g, "").slice(0, 6))}
          placeholder="ABC234"
          autoComplete="off"
          maxLength={6}
          required
        />
        {error && <div className="live-join-error" role="alert">{error}</div>}
        <button className="live-session-primary" disabled={submitting || joinCode.length !== 6}>
          {submitting ? "Joining…" : <>Join lesson <HiOutlineArrowRight /></>}
        </button>
      </form>
    </main>
  );
};

export default LiveLessonJoinPage;
