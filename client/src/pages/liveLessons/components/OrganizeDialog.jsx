const OrganizeDialog = ({
  organizeDialog,
  setOrganizeDialog,
  organizeSaving,
  folderPaths,
  currentFolderId,
  unfiledView,
  onSubmit,
  onClose,
}) => {
  if (!organizeDialog) return null;
  return (
    <div
      className="live-import-overlay"
      role="presentation"
      onClick={() => !organizeSaving && onClose()}
    >
      <form
        className="live-share-dialog live-folder-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="live-organize-dialog-title"
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit();
        }}
        onClick={(event) => event.stopPropagation()}
      >
        <header>
          <div>
            <span className="live-eyebrow">LESSON ORGANIZATION</span>
            <h2 id="live-organize-dialog-title">Organize lessons</h2>
          </div>
          <button
            type="button"
            className="live-dialog-close"
            onClick={onClose}
            aria-label="Close organize dialog"
            disabled={organizeSaving}
          >
            ×
          </button>
        </header>
        <p className="live-library-dialog-count">
          {organizeDialog.lessonIds.length}{" "}
          {organizeDialog.lessonIds.length === 1
            ? "lesson selected"
            : "lessons selected"}
        </p>
        <label className="live-edit-field" htmlFor="live-organize-mode">
          What should happen
          <select
            id="live-organize-mode"
            value={organizeDialog.mode}
            onChange={(event) =>
              setOrganizeDialog((current) => ({
                ...current,
                mode: event.target.value,
              }))
            }
            disabled={organizeSaving}
          >
            <option value="move">
              Move to a folder (leaves its current folders)
            </option>
            <option value="shortcut">
              Add a shortcut (lesson stays where it is)
            </option>
          </select>
          <span>
            A shortcut points at the same lesson. It is never a copy, so
            slides, history and marks stay in one place.
          </span>
        </label>
        <label className="live-edit-field" htmlFor="live-organize-destination">
          Destination
          <select
            id="live-organize-destination"
            value={organizeDialog.destination}
            onChange={(event) =>
              setOrganizeDialog((current) => ({
                ...current,
                destination: event.target.value,
              }))
            }
            disabled={organizeSaving}
          >
            <option value="" disabled>
              Choose a destination…
            </option>
            <option
              value="unfiled"
              disabled={
                organizeDialog.mode === "shortcut" ||
                unfiledView
              }
            >
              {organizeDialog.mode === "shortcut"
                ? "Unfiled (not available for shortcuts)"
                : "Unfiled (remove from every folder)"}
            </option>
            {[...folderPaths.entries()]
              .sort((left, right) => left[1].localeCompare(right[1]))
              .map(([id, path]) => (
                <option
                  key={id}
                  value={id}
                  disabled={String(currentFolderId) === id}
                >
                  {path}
                  {String(currentFolderId) === id
                    ? " · current folder"
                    : ""}
                </option>
              ))}
          </select>
          {!folderPaths.size && (
            <span>No folders yet. Create a topic folder first.</span>
          )}
        </label>
        <footer>
          <button
            type="button"
            className="live-secondary-button"
            onClick={onClose}
            disabled={organizeSaving}
          >
            Cancel
          </button>
          <button
            type="submit"
            className="live-primary-button"
            disabled={organizeSaving || !organizeDialog.destination}
          >
            {organizeSaving
              ? "Saving…"
              : organizeDialog.mode === "shortcut"
                ? "Add shortcut"
                : "Move lessons"}
          </button>
        </footer>
      </form>
    </div>
  );
};

export default OrganizeDialog;
