const ShareDialog = ({
  shareLessons,
  onClose,
  shareRecipient,
  setShareRecipient,
  teachers,
  getTeacherName,
  shareSaving,
  onSend,
}) => {
  if (!shareLessons.length) return null;
  return (
    <div
      className="live-import-overlay"
      role="presentation"
      onClick={onClose}
    >
      <section
        className="live-share-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="live-share-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header>
          <div>
            <span className="live-eyebrow">TEACHER-TO-TEACHER</span>
            <h2 id="live-share-title">
              Share{" "}
              {shareLessons.length === 1
                ? `“${shareLessons[0].title}”`
                : `${shareLessons.length} lessons`}
            </h2>
          </div>
          <button
            className="live-dialog-close"
            onClick={onClose}
            aria-label="Close share dialog"
          >
            ×
          </button>
        </header>
        <p>
          The recipient can accept a copy of each lesson. Your lessons and
          session histories stay separate.
        </p>
        <label className="live-edit-field">
          Teacher
          <select
            value={shareRecipient}
            onChange={(event) => setShareRecipient(event.target.value)}
          >
            <option value="">Choose a teacher…</option>
            {teachers.map((teacher) => (
              <option key={teacher._id} value={teacher._id}>
                {getTeacherName(teacher)}
              </option>
            ))}
          </select>
        </label>
        {!teachers.length && (
          <p className="live-list-empty">
            No other active teachers are available to share with.
          </p>
        )}
        <footer>
          <button className="live-secondary-button" onClick={onClose}>
            Cancel
          </button>
          <button
            className="live-primary-button"
            disabled={!shareRecipient || shareSaving}
            onClick={onSend}
          >
            {shareSaving
              ? "Sending…"
              : `Send ${shareLessons.length === 1 ? "invitation" : `${shareLessons.length} invitations`}`}
          </button>
        </footer>
      </section>
    </div>
  );
};

export default ShareDialog;
