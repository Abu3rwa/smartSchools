import {
  HiOutlineArrowDown,
  HiOutlineArrowUp,
  HiOutlineEllipsisVertical,
  HiOutlineEye,
  HiOutlinePlay,
} from "react-icons/hi2";

const LessonRow = ({
  lesson,
  position,
  rowIndex,
  selected,
  location,
  view,
  activeFolder,
  reorderMode,
  folderSaving,
  userRole,
  folderPaths,
  onSelect,
  onReorder,
  onSetPosition,
  onPreview,
  onStart,
  getSessionClassId,
  actionMenuOpen,
  onToggleActionMenu,
}) => (
  <tr className={selected ? "is-selected" : ""}>
    <td>
      {["teacher", "admin"].includes(userRole) && (
        <input
          type="checkbox"
          aria-label={`Select ${lesson.title} for bulk actions`}
          checked={selected}
          onChange={(event) => onSelect(lesson._id, event.target.checked)}
        />
      )}
    </td>
    <td className="live-order-col live-cell-number">
      {position || rowIndex + 1}
    </td>
    <td>
      <div className="live-row-title">{lesson.title}</div>
      <div className="live-row-meta">
        {lesson.slideCount ?? lesson.slides?.length ?? 0} slides ·{" "}
        {lesson.subjectId?.name || lesson.subject || "No subject"}
        {view !== "folder" && location
          ? ` · ${folderPaths.get(String(location._id)) || location.name}`
          : ""}
        {!lesson.classId ? " · Not linked to a class" : ""}
      </div>
    </td>
    <td>
      <span className={`live-state ${lesson.isDone ? "" : "is-ready"}`}>
        <span className="live-dot" />
        {lesson.isDone ? "Taught" : "Ready"}
      </span>
    </td>
    <td className="live-list-row-actions">
      {reorderMode && view === "folder" && activeFolder ? (
        <>
          <button
            type="button"
            className="live-icon-button"
            aria-label={`Move ${lesson.title} earlier`}
            disabled={folderSaving || position <= 1}
            onClick={() => onReorder(activeFolder, lesson._id, -1)}
          >
            <HiOutlineArrowUp />
          </button>
          <button
            type="button"
            className="live-icon-button"
            aria-label={`Move ${lesson.title} later`}
            disabled={
              folderSaving ||
              position >= activeFolder.lessonIds.length
            }
            onClick={() => onReorder(activeFolder, lesson._id, 1)}
          >
            <HiOutlineArrowDown />
          </button>
          <button
            type="button"
            className="live-secondary-button"
            onClick={() => onSetPosition(lesson, position || 1)}
          >
            Position
          </button>
        </>
      ) : (
        <>
          <button
            type="button"
            className="live-secondary-button"
            onClick={() => onPreview(lesson._id)}
          >
            <HiOutlineEye /> Preview
          </button>
          <button
            type="button"
            className="live-primary-button live-start-button"
            onClick={() => onStart(lesson)}
            disabled={!getSessionClassId(lesson)}
          >
            <HiOutlinePlay /> Start
          </button>
          <button
            type="button"
            className="live-lesson-actions-trigger"
            aria-haspopup="menu"
            aria-expanded={actionMenuOpen}
            aria-label={`More actions for ${lesson.title}`}
            onClick={(event) => onToggleActionMenu(event, lesson)}
          >
            <HiOutlineEllipsisVertical />
            <span>More</span>
          </button>
        </>
      )}
    </td>
  </tr>
);

export default LessonRow;
