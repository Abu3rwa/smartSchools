import { localDateTimeValue } from "../utils/liveLessonPageUtils";

const SessionDialog = ({
  sessionDraft,
  setSessionDraft,
  creatingSession,
  onCreate,
  classes,
}) => {
  if (!sessionDraft) return null;
  return (
    <div
      className="live-import-overlay"
      role="presentation"
      onClick={() => !creatingSession && setSessionDraft(null)}
    >
      <section
        className="live-share-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="live-session-create-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header>
          <div>
            <span className="live-eyebrow">
              {sessionDraft.scheduled ? "SCHEDULE CLASS" : "START CLASS"}
            </span>
            <h2 id="live-session-create-title">
              {sessionDraft.lesson.title}
            </h2>
          </div>
          <button
            className="live-dialog-close"
            onClick={() => setSessionDraft(null)}
            aria-label="Close session setup"
            disabled={creatingSession}
          >
            ×
          </button>
        </header>
        <label className="live-edit-field">
          Class for this session
          <select
            value={sessionDraft.classId}
            onChange={(event) =>
              setSessionDraft((current) => ({
                ...current,
                classId: event.target.value,
              }))
            }
          >
            {classes.map((classItem) => (
              <option key={classItem._id} value={classItem._id}>
                {classItem.name}
              </option>
            ))}
          </select>
          <span>
            Defaults to the lesson’s assigned class. You can choose any of
            your classes for this session.
          </span>
        </label>
        {sessionDraft.scheduled && (
          <label className="live-edit-field">
            Scheduled date and time
            <input
              type="datetime-local"
              min={localDateTimeValue(new Date())}
              value={sessionDraft.scheduledAt}
              onChange={(event) =>
                setSessionDraft((current) => ({
                  ...current,
                  scheduledAt: event.target.value,
                }))
              }
              required
            />
          </label>
        )}
        <label className="live-edit-field">
          Online meeting link (optional)
          <input
            type="url"
            inputMode="url"
            maxLength={2048}
            placeholder="https://meet.google.com/..."
            value={sessionDraft.meetingUrl}
            onChange={(event) =>
              setSessionDraft((current) => ({
                ...current,
                meetingUrl: event.target.value,
              }))
            }
          />
          <span>
            Students in this class can open the meeting separately from the
            Live Lesson. Use a secure HTTPS link.
          </span>
        </label>
        <label className="live-edit-field live-invitation-option">
          <span>
            <input
              type="checkbox"
              checked={sessionDraft.sendInvitationEmail}
              onChange={(event) =>
                setSessionDraft((current) => ({
                  ...current,
                  sendInvitationEmail: event.target.checked,
                }))
              }
            />
            Email an invitation to students
          </span>
          <span>
            Optional. Sends the Live Lesson link, scheduled time (if set),
            and meeting link (if provided) to student email addresses.
          </span>
        </label>
        <label className="live-edit-field">
          Class timer (minutes)
          <input
            type="number"
            min="0"
            max="240"
            step="1"
            value={sessionDraft.timerDurationMinutes}
            onChange={(event) =>
              setSessionDraft((current) => ({
                ...current,
                timerDurationMinutes: event.target.value,
              }))
            }
          />
          <span>
            Starts when you start the class. Use 0 for no timer. The timer
            will notify you at zero but will not end the session.
          </span>
        </label>
        <footer>
          <button
            className="live-secondary-button"
            onClick={() => setSessionDraft(null)}
            disabled={creatingSession}
          >
            Cancel
          </button>
          <button
            className="live-primary-button"
            onClick={onCreate}
            disabled={
              creatingSession ||
              !sessionDraft.classId ||
              !/^\d+$/.test(String(sessionDraft.timerDurationMinutes)) ||
              Number(sessionDraft.timerDurationMinutes) > 240
            }
          >
            {creatingSession
              ? "Creating…"
              : sessionDraft.scheduled
                ? "Schedule session"
                : "Create session"}
          </button>
        </footer>
      </section>
    </div>
  );
};

export default SessionDialog;
