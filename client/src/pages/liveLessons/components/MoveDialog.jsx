const MoveDialog = ({
  target,
  options,
  loading,
  classId,
  setClassId,
  years,
  selectedTarget,
  error,
  saving,
  onClose,
  onMove,
}) => {
  if (!target) return null;
  return (
    <div
      className="live-import-overlay"
      role="presentation"
      onClick={() => {
        if (!saving) onClose();
      }}
    >
      <section
        className="live-share-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="live-move-lesson-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header>
          <div>
            <span className="live-eyebrow">ACADEMIC YEAR</span>
            <h2 id="live-move-lesson-title">Move “{target.title}”</h2>
          </div>
          <button
            className="live-dialog-close"
            onClick={onClose}
            aria-label="Close move lesson dialog"
            disabled={saving}
          >
            ×
          </button>
        </header>
        <p>
          Filed under{" "}
          {options?.lesson?.academicYear || "no academic year"}.
          Slides and past sessions stay as they are — only the class this
          lesson launches with, and the year it is filed under, change.
        </p>
        {loading && (
          <p className="live-preview-status" role="status">
            Loading the classes you teach…
          </p>
        )}
        {options?.canMove === false && (
          <p className="live-preview-status live-preview-error" role="alert">
            This lesson has a {options.blockingSessionStatus}{" "}
            session. End or delete it before moving the lesson.
          </p>
        )}
        {!loading && !options?.targets?.length && (
          <p className="live-list-empty">
            You are not assigned to another class yet. Rollover creates next
            year’s classes without teachers, so ask your school to assign you
            there before moving this lesson.
          </p>
        )}
        {!!options?.targets?.length && (
          <label className="live-edit-field">
            Destination class
            <select
              value={classId}
              onChange={(event) => setClassId(event.target.value)}
            >
              <option value="">Choose a class…</option>
              {years.map((year) => (
                <optgroup key={year} label={year}>
                  {options.targets
                    .filter((option) => option.academicYear === year)
                    .map((option) => (
                      <option
                        key={option._id}
                        value={option._id}
                        disabled={option.isCurrentClass}
                      >
                        {`${option.name}${option.section ? ` · ${option.section}` : ""}${
                          option.isCurrentClass ? " · current" : ""
                        }`}
                      </option>
                    ))}
                </optgroup>
              ))}
            </select>
          </label>
        )}
        {selectedTarget?.subjectCleared && (
          <p className="live-preview-status">
            That class does not teach{" "}
            {target.subject || "this subject"} yet, so the subject
            link will be cleared. The lesson keeps its subject name.
          </p>
        )}
        {error && (
          <p className="live-preview-status live-preview-error" role="alert">
            {error}
          </p>
        )}
        <footer>
          <button
            className="live-secondary-button"
            onClick={onClose}
            disabled={saving}
          >
            Cancel
          </button>
          <button
            className="live-primary-button"
            onClick={onMove}
            disabled={
              !selectedTarget
              || saving
              || loading
              || options?.canMove === false
            }
          >
            {saving ? "Moving…" : "Move lesson"}
          </button>
        </footer>
      </section>
    </div>
  );
};

export default MoveDialog;
