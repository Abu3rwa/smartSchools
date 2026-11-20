const FolderDialog = ({
  folderDialog,
  setFolderDialog,
  folderSaving,
  onSubmit,
  onClose,
}) => {
  if (!folderDialog) return null;
  return (
    <div
      className="live-import-overlay"
      role="presentation"
      onClick={() => !folderSaving && onClose()}
    >
      <form
        className="live-share-dialog live-folder-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="live-folder-dialog-title"
        onSubmit={onSubmit}
        onClick={(event) => event.stopPropagation()}
      >
        <header>
          <div>
            <span className="live-eyebrow">LESSON ORGANIZATION</span>
            <h2 id="live-folder-dialog-title">
              {folderDialog.mode === "rename"
                ? "Rename folder"
                : folderDialog.parentId
                  ? "Create subfolder"
                  : "Create folder"}
            </h2>
          </div>
          <button
            type="button"
            className="live-dialog-close"
            onClick={onClose}
            aria-label="Close folder dialog"
            disabled={folderSaving}
          >
            ×
          </button>
        </header>
        <label className="live-edit-field" htmlFor="live-folder-name">
          Folder name
          <input
            id="live-folder-name"
            type="text"
            autoFocus
            required
            maxLength={100}
            value={folderDialog.name}
            onChange={(event) =>
              setFolderDialog((current) => ({
                ...current,
                name: event.target.value,
              }))
            }
            placeholder="For example, Week 1"
            disabled={folderSaving}
          />
          <span>Use a unit, week, topic, or any name that helps you find lessons.</span>
        </label>
        <footer>
          <button
            type="button"
            className="live-secondary-button"
            onClick={onClose}
            disabled={folderSaving}
          >
            Cancel
          </button>
          <button
            type="submit"
            className="live-primary-button"
            disabled={folderSaving || !folderDialog.name.trim()}
          >
            {folderSaving
              ? "Saving…"
              : folderDialog.mode === "rename"
                ? "Save name"
                : "Create folder"}
          </button>
        </footer>
      </form>
    </div>
  );
};

export default FolderDialog;
