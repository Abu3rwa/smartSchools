import { createPortal } from "react-dom";
import {
  HiOutlineArrowDownTray,
  HiOutlineCalendarDays,
  HiOutlineCheck,
  HiOutlineFolder,
  HiOutlinePencilSquare,
  HiOutlineShare,
  HiOutlineTrash,
} from "react-icons/hi2";

const LessonActionMenu = ({
  menu,
  menuRef,
  activeFolder,
  inFolderView,
  userRole,
  exportingLessonId,
  onClose,
  onEdit,
  onOrganize,
  onRemoveShortcut,
  onExport,
  onShare,
  onToggleDone,
  onMove,
  onDelete,
}) => {
  if (!menu) return null;
  const { lesson } = menu;
  const run = (action) => {
    onClose();
    action(lesson);
  };
  const inFolder = inFolderView && activeFolder;
  return createPortal(
    <div
      ref={menuRef}
      className="live-lesson-action-menu"
      role="menu"
      aria-label={`Actions for ${lesson.title}`}
      style={{
        top: menu.top,
        right: menu.right,
      }}
    >
      <button
        type="button"
        role="menuitem"
        onClick={() => run((item) => onEdit(item._id))}
      >
        <HiOutlinePencilSquare /> Edit
      </button>
      <button
        type="button"
        role="menuitem"
        onClick={() => run((item) => onOrganize([String(item._id)]))}
      >
        <HiOutlineFolder /> Move / add shortcut
      </button>
      {inFolder && (
        <button
          type="button"
          role="menuitem"
          onClick={() =>
            run((item) => onRemoveShortcut(item, activeFolder))
          }
        >
          <HiOutlineFolder /> Remove from this folder
        </button>
      )}
      <button
        type="button"
        role="menuitem"
        disabled={Boolean(exportingLessonId)}
        onClick={() => run((item) => onExport(item))}
      >
        <HiOutlineArrowDownTray />
        {exportingLessonId === String(lesson._id) ? "Exporting…" : "Export CSV"}
      </button>
      {["teacher", "admin"].includes(userRole) && (
        <button
          type="button"
          role="menuitem"
          onClick={() => run((item) => onShare(item))}
        >
          <HiOutlineShare /> Share
        </button>
      )}
      <button type="button" role="menuitem" onClick={() => run(onToggleDone)}>
        <HiOutlineCheck />
        {lesson.isDone ? "Mark not done" : "Mark done"}
      </button>
      <button
        type="button"
        role="menuitem"
        onClick={() => run((item) => onMove(item))}
      >
        <HiOutlineCalendarDays /> Move to another year
      </button>
      <div className="live-lesson-action-menu-sep" role="separator" />
      <button
        type="button"
        role="menuitem"
        className="is-danger"
        onClick={() => run((item) => onDelete(item._id))}
      >
        <HiOutlineTrash /> Delete
      </button>
    </div>,
    document.body,
  );
};

export default LessonActionMenu;
