import {
  HiOutlineArrowDown,
  HiOutlineArrowUp,
  HiOutlineFolder,
  HiOutlineMapPin,
} from "react-icons/hi2";

const FolderCard = ({
  folder,
  siblingIndex,
  previous,
  next,
  lessonCount,
  childCount,
  reorderMode,
  folderSaving,
  onOpen,
  onReorderSibling,
  onTogglePin,
}) => (
  <article
    className={`live-folder-card ${folder.pinned ? "is-pinned" : ""}`}
  >
    <button
      type="button"
      className="live-folder-open"
      onClick={() => onOpen(String(folder._id))}
      aria-label={`Open ${folder.name}`}
    >
      <span className="live-folder-icon">
        <HiOutlineFolder aria-hidden="true" />
      </span>
      <span className="live-folder-copy">
        <span className="live-folder-name">{folder.name}</span>
        <span className="live-folder-meta">
          {lessonCount} {lessonCount === 1 ? "lesson" : "lessons"}
          {childCount
            ? ` · ${childCount} subfolder${childCount === 1 ? "" : "s"}`
            : ""}
        </span>
      </span>
    </button>
    <div className="live-folder-end">
      {reorderMode ? (
        <>
          <button
            type="button"
            className="live-icon-button"
            aria-label={`Move ${folder.name} up`}
            disabled={
              folderSaving ||
              siblingIndex <= 0 ||
              Boolean(previous?.pinned) !== Boolean(folder.pinned)
            }
            onClick={() => onReorderSibling(folder, -1)}
          >
            <HiOutlineArrowUp />
          </button>
          <button
            type="button"
            className="live-icon-button"
            aria-label={`Move ${folder.name} down`}
            disabled={
              folderSaving ||
              !next ||
              Boolean(next?.pinned) !== Boolean(folder.pinned)
            }
            onClick={() => onReorderSibling(folder, 1)}
          >
            <HiOutlineArrowDown />
          </button>
        </>
      ) : (
        <button
          type="button"
          className={`live-icon-button ${folder.pinned ? "is-pinned" : ""}`}
          aria-label={
            folder.pinned
              ? `Unpin ${folder.name}`
              : `Pin ${folder.name}`
          }
          aria-pressed={folder.pinned === true}
          disabled={folderSaving}
          onClick={() => onTogglePin(folder)}
        >
          <HiOutlineMapPin />
        </button>
      )}
    </div>
  </article>
);

export default FolderCard;
