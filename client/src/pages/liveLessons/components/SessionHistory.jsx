import {
  HiOutlineClock,
  HiOutlineFunnel,
  HiOutlineStop,
  HiOutlineTrash,
} from "react-icons/hi2";
import {
  defaultListState,
  formatSessionDuration,
  getSessionDisplayDate,
} from "../utils/liveLessonPageUtils";
import PaginationBar from "./PaginationBar";

const SessionHistory = ({
  sessions,
  classes,
  classesById,
  sessionSubjects,
  sessionListState,
  updateSessionList,
  sessionSearchInput,
  setSessionSearchInput,
  sessionFiltersActive,
  endingSessionId,
  onEndSession,
  onDeleteSession,
  sessionPagination,
  rangeText,
  navigate,
  user,
}) => (
  <>
    <div className="live-list-filters is-grid">
      <span className="live-list-filters-heading">
        <HiOutlineFunnel size={15} aria-hidden="true" />
        Filter sessions
      </span>
      <label>
        Search sessions
        <input
          type="search"
          value={sessionSearchInput}
          placeholder="Lesson, class, subject, or code"
          onChange={(event) => setSessionSearchInput(event.target.value)}
        />
      </label>
      <label>
        Class
        <select
          value={sessionListState.classId}
          onChange={(event) =>
            updateSessionList({
              classId: event.target.value,
              subject: "",
              page: 1,
            })
          }
        >
          <option value="">All classes</option>
          {classes.map((classItem) => (
            <option key={classItem._id} value={classItem._id}>
              {classItem.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        Subject
        <select
          value={sessionListState.subject}
          onChange={(event) =>
            updateSessionList({ subject: event.target.value, page: 1 })
          }
        >
          <option value="">All subjects</option>
          <option value="__unknown__">Unknown / not set</option>
          {sessionSubjects.map((subject) => (
            <option key={subject._id} value={subject._id}>
              {subject.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        Status
        <select
          value={sessionListState.status}
          onChange={(event) =>
            updateSessionList({ status: event.target.value, page: 1 })
          }
        >
          <option value="">All statuses</option>
          <option value="waiting">Waiting</option>
          <option value="live">Live</option>
          <option value="ended">Ended</option>
        </select>
      </label>
      <label>
        From date
        <input
          type="date"
          value={sessionListState.dateFrom}
          onChange={(event) =>
            updateSessionList({ dateFrom: event.target.value, page: 1 })
          }
        />
      </label>
      <label>
        To date
        <input
          type="date"
          value={sessionListState.dateTo}
          onChange={(event) =>
            updateSessionList({ dateTo: event.target.value, page: 1 })
          }
        />
      </label>
      <button
        className="live-text-button"
        onClick={() => {
          setSessionSearchInput("");
          updateSessionList({ ...defaultListState });
        }}
        disabled={!sessionFiltersActive}
        title={
          sessionFiltersActive
            ? "Clear the search, class, subject, status and date filters"
            : "No filters are set"
        }
      >
        Clear filters
      </button>
    </div>
    <div className="live-list-table-wrap">
      <table className="live-list-table">
        <thead>
          <tr>
            <th>Session</th>
            <th>Class</th>
            <th>Subject</th>
            <th>Date</th>
            <th>Duration</th>
            <th>Timer</th>
            <th>Status</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {sessions.map((session) => (
            <tr key={session._id}>
              <td>
                <strong>
                  {session.lessonSnapshot?.title || "Live lesson"}
                </strong>
              </td>
              <td>
                {classesById.get(
                  String(session.classId?._id || session.classId),
                )?.name ||
                  session.classId?.name ||
                  "Class"}
              </td>
              <td>
                {session.lessonSnapshot?.subject || "Unknown / not set"}
              </td>
              <td>
                {getSessionDisplayDate(session)
                  ? new Date(
                      getSessionDisplayDate(session),
                    ).toLocaleString()
                  : "—"}
              </td>
              <td>{formatSessionDuration(session)}</td>
              <td>
                {session.timerDurationMinutes > 0
                  ? `${session.timerDurationMinutes} min`
                  : "—"}
                {session.scheduledAt && session.status === "waiting" && (
                  <small>
                    Scheduled{" "}
                    {new Date(session.scheduledAt).toLocaleString()}
                  </small>
                )}
              </td>
              <td>
                <span className={`live-status-pill ${session.status}`}>
                  {session.status}
                </span>
              </td>
              <td className="live-list-row-actions">
                {session.status !== "ended" && (
                  <button
                    className="live-secondary-button"
                    onClick={() =>
                      navigate(
                        `/portal/live-lessons/sessions/${session._id}`,
                      )
                    }
                  >
                    {session.status === "waiting"
                      ? "Open / start"
                      : "Open session"}
                  </button>
                )}
                {session.status === "live" &&
                  String(session.teacherId) ===
                    String(user?._id || user?.id) && (
                    <button
                      className="live-delete-session"
                      onClick={() => onEndSession(session)}
                      disabled={Boolean(endingSessionId)}
                    >
                      <HiOutlineStop />{" "}
                      {endingSessionId === String(session._id)
                        ? "Ending…"
                        : "End session"}
                    </button>
                  )}
                <button
                  className="live-secondary-button"
                  onClick={() =>
                    navigate(
                      `/portal/live-lessons/sessions/${session._id}/report`,
                    )
                  }
                >
                  Report
                </button>
                <button
                  className="live-secondary-button"
                  onClick={() =>
                    navigate(
                      `/portal/live-lessons/sessions/${session._id}/replay`,
                    )
                  }
                >
                  Replay
                </button>
                <button
                  className="live-delete-session"
                  onClick={() => onDeleteSession(session)}
                  disabled={session.status === "live"}
                  title={
                    session.status === "live"
                      ? "End the live session before deleting its history."
                      : "Delete this session history"
                  }
                >
                  <HiOutlineTrash /> Delete
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {!sessions.length && (
        <div className="live-list-empty">
          <HiOutlineClock size={22} aria-hidden="true" />
          {sessionFiltersActive ? (
            <>
              <p>No sessions match these filters.</p>
              <button
                className="live-secondary-button"
                onClick={() => {
                  setSessionSearchInput("");
                  updateSessionList({ ...defaultListState });
                }}
              >
                Clear filters
              </button>
            </>
          ) : (
            <p>
              No sessions yet. Start a live lesson to see sessions and
              reports here.
            </p>
          )}
        </div>
      )}
    </div>
    <PaginationBar
      rangeText={rangeText}
      pageSize={sessionListState.pageSize}
      pageSizeOptions={[10, 25, 50]}
      onPageSizeChange={(pageSize) =>
        updateSessionList({ pageSize, page: 1 })
      }
      prevDisabled={sessionListState.page <= 1}
      nextDisabled={
        !sessionPagination.pages ||
        sessionListState.page >= sessionPagination.pages
      }
      onPrev={() =>
        updateSessionList({ page: sessionListState.page - 1 })
      }
      onNext={() =>
        updateSessionList({ page: sessionListState.page + 1 })
      }
      pageLabel={`Page ${sessionPagination.pages ? sessionListState.page : 0} of ${sessionPagination.pages || 0}`}
      prevAriaLabel="Previous page of sessions"
      nextAriaLabel="Next page of sessions"
    />
  </>
);

export default SessionHistory;
