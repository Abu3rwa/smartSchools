import {
  HiOutlineFolder,
  HiOutlineFolderPlus,
  HiOutlineInformationCircle,
} from "react-icons/hi2";
import FolderCard from "./FolderCard";

const FolderGrid = ({
  rootFolders,
  folders,
  reorderMode,
  folderSaving,
  folderLessonTotal,
  unfiledCount,
  onOpenFolder,
  onReorderSibling,
  onTogglePin,
  onCreateFolder,
  onOrganizeUnfiled,
}) => (
  <section className="live-library-home" aria-label="Topic folders">
    {reorderMode && (
      <p className="live-library-reorder-hint">
        Use the arrows to change order. Pinned topics stay first.
      </p>
    )}
    {rootFolders.length ? (
      <div className="live-folder-grid">
        {rootFolders.map((folder) => {
          const siblingIndex = rootFolders.findIndex(
            (item) => String(item._id) === String(folder._id),
          );
          const childCount = folders.filter(
            (item) => String(item.parentId || "") === String(folder._id),
          ).length;
          const lessonCount = folderLessonTotal(String(folder._id));
          const previous = rootFolders[siblingIndex - 1];
          const next = rootFolders[siblingIndex + 1];
          return (
            <FolderCard
              key={folder._id}
              folder={folder}
              siblingIndex={siblingIndex}
              previous={previous}
              next={next}
              lessonCount={lessonCount}
              childCount={childCount}
              reorderMode={reorderMode}
              folderSaving={folderSaving}
              onOpen={onOpenFolder}
              onReorderSibling={onReorderSibling}
              onTogglePin={onTogglePin}
            />
          );
        })}
      </div>
    ) : (
      <div className="live-library-empty">
        <HiOutlineFolder size={26} aria-hidden="true" />
        <h3>No folders yet</h3>
        <p>
          Create a folder for a unit, topic or week, then add lessons from
          All lessons or Unfiled.
        </p>
        <button className="live-primary-button" onClick={onCreateFolder}>
          <HiOutlineFolderPlus /> Create a folder
        </button>
      </div>
    )}
    {unfiledCount > 0 && (
      <div className="live-library-hint">
        <HiOutlineInformationCircle aria-hidden="true" />
        <span>
          <strong>
            {unfiledCount} {unfiledCount === 1 ? "lesson is" : "lessons are"}{" "}
            not in a folder.
          </strong>
          <br />
          Nothing is lost. Select lessons in Unfiled and move them into a
          topic.
        </span>
        <button
          type="button"
          className="live-text-button"
          onClick={onOrganizeUnfiled}
        >
          Organize unfiled
        </button>
      </div>
    )}
  </section>
);

export default FolderGrid;
