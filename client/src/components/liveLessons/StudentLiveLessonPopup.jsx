import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useSelector } from "react-redux";
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
} from "@mui/material";
import { HiOutlineSignal } from "react-icons/hi2";
import { selectUser } from "../../store/slices/authSlice";
import api from "../../config/api";
import "./StudentLiveLessonPopup.css";

const StudentLiveLessonPopup = () => {
  const user = useSelector(selectUser);
  const location = useLocation();
  const navigate = useNavigate();
  const [sessions, setSessions] = useState([]);
  const [dismissedSessionIds, setDismissedSessionIds] = useState(() => new Set());
  const [joiningSessionId, setJoiningSessionId] = useState("");
  const [joinError, setJoinError] = useState("");
  const isStudent = user?.role === "student";
  const currentSessionId = useMemo(
    () => location.pathname.match(/\/portal\/live-lessons\/student\/([^/]+)/)?.[1],
    [location.pathname],
  );

  const loadSessions = useCallback(async () => {
    try {
      const response = await api.get("/live/sessions/available");
      setSessions(response.data?.data?.sessions || []);
    } catch {
      // A transient polling failure should not interrupt the student's current page.
    }
  }, []);

  useEffect(() => {
    if (
      !isStudent ||
      import.meta.env.VITE_LIVE_LESSONS_ENABLED !== "true"
    ) {
      setSessions([]);
      return undefined;
    }

    loadSessions();
    return undefined;
  }, [isStudent, loadSessions]);

  const activeSession = sessions.find(
    (session) =>
      session._id !== currentSessionId &&
      !dismissedSessionIds.has(session._id),
  );

  const dismiss = () => {
    if (activeSession) {
      setDismissedSessionIds((previous) => {
        const next = new Set(previous);
        next.add(activeSession._id);
        return next;
      });
    }
    setJoinError("");
  };

  const joinSession = async () => {
    if (!activeSession) return;
    setJoiningSessionId(activeSession._id);
    setJoinError("");
    try {
      const response = await api.post(
        `/live/sessions/${activeSession._id}/join`,
      );
      navigate(
        `/portal/live-lessons/student/${response.data.data.sessionId}`,
      );
    } catch (requestError) {
      setJoinError(
        requestError.response?.data?.message ||
          "Could not join this live lesson. Please try again.",
      );
      await loadSessions();
    } finally {
      setJoiningSessionId("");
    }
  };

  return (
    <Dialog
      open={Boolean(activeSession)}
      onClose={dismiss}
      aria-labelledby="student-live-lesson-title"
      aria-describedby="student-live-lesson-description"
      fullWidth
      maxWidth="sm"
    >
      {activeSession && (
        <>
          <DialogTitle
            id="student-live-lesson-title"
            className="student-live-popup-title"
          >
            <span className="student-live-popup-icon">
              <HiOutlineSignal aria-hidden="true" />
            </span>
            Your live lesson has started
          </DialogTitle>
          <DialogContent>
            <p id="student-live-lesson-description">
              <strong>{activeSession.title}</strong> is live
              {activeSession.classId?.name
                ? ` for ${activeSession.classId.name}`
                : ""}
              {activeSession.classId?.section
                ? ` · ${activeSession.classId.section}`
                : ""}
              . Join now to follow along with your class.
            </p>
            {joinError && (
              <div className="student-live-popup-error" role="alert">
                {joinError}
              </div>
            )}
          </DialogContent>
          <DialogActions className="student-live-popup-actions">
            <Button onClick={dismiss} disabled={Boolean(joiningSessionId)}>
              Not now
            </Button>
            <Button
              variant="contained"
              onClick={joinSession}
              disabled={Boolean(joiningSessionId)}
              startIcon={<HiOutlineSignal />}
            >
              {joiningSessionId ? "Joining…" : "Join lesson"}
            </Button>
          </DialogActions>
        </>
      )}
    </Dialog>
  );
};

export default StudentLiveLessonPopup;
