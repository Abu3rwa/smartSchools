const PositionDialog = ({
  positionDialog,
  setPositionDialog,
  positionSaving,
  maxPosition,
  onSubmit,
  onClose,
}) => {
  if (!positionDialog) return null;
  return (
    <div
      className="live-import-overlay"
      role="presentation"
      onClick={() => !positionSaving && onClose()}
    >
      <form
        className="live-share-dialog live-folder-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="live-position-dialog-title"
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit();
        }}
        onClick={(event) => event.stopPropagation()}
      >
        <header>
          <div>
            <span className="live-eyebrow">TEACHING ORDER</span>
            <h2 id="live-position-dialog-title">Move to position</h2>
          </div>
          <button
            type="button"
            className="live-dialog-close"
            onClick={onClose}
            aria-label="Close position dialog"
            disabled={positionSaving}
          >
            ×
          </button>
        </header>
        <label className="live-edit-field" htmlFor="live-position-input">
          New position for “{positionDialog.title}”
          <input
            id="live-position-input"
            type="number"
            min={1}
            max={maxPosition || undefined}
            autoFocus
            value={positionDialog.position}
            onChange={(event) =>
              setPositionDialog((current) => ({
                ...current,
                position: event.target.value,
              }))
            }
            onFocus={(event) => event.target.select()}
            disabled={positionSaving}
          />
          <span>
            A whole number from 1 to {maxPosition || 1}. Position works across
            pages, so nothing has to be dragged.
          </span>
        </label>
        <footer>
          <button
            type="button"
            className="live-secondary-button"
            onClick={onClose}
            disabled={positionSaving}
          >
            Cancel
          </button>
          <button
            type="submit"
            className="live-primary-button"
            disabled={positionSaving}
          >
            {positionSaving ? "Moving…" : "Move lesson"}
          </button>
        </footer>
      </form>
    </div>
  );
};

export default PositionDialog;
