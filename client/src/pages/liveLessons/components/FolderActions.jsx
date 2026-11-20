import {
  HiOutlineFolderPlus,
  HiOutlinePencilSquare,
  HiOutlineTrash,
} from "react-icons/hi2";

const FolderActions = ({
  activeFolder,
  childFolders,
  folderSaving,
  onCreateFolder,
  onRenameFolder,
  onDeleteFolder,
}) => {
  if (!activeFolder) return null;
  return (
    <div className="live-folder-actions">
      <button
        type="button"
        className="live-icon-button"
        aria-label={`New subfolder inside ${activeFolder.name}`}
        title="New subfolder"
        disabled={folderSaving}
        onClick={() => onCreateFolder(String(activeFolder._id))}
      >
        <HiOutlineFolderPlus />
      </button>
      <button
        type="button"
        className="live-icon-button"
        aria-label={`Rename ${activeFolder.name}`}
        title="Rename folder"
        disabled={folderSaving}
        onClick={() => onRenameFolder(activeFolder)}
      >
        <HiOutlinePencilSquare />
      </button>
      <button
        type="button"
        className="live-icon-button is-danger"
        aria-label={`Delete the empty folder ${activeFolder.name}`}
        title={
          activeFolder.lessonIds.length || childFolders.length
            ? "Only an empty folder can be deleted. Remove its subfolders and lessons first."
            : "Delete empty folder"
        }
        disabled={
          folderSaving ||
          activeFolder.lessonIds.length > 0 ||
          childFolders.length > 0
        }
        onClick={() => onDeleteFolder(activeFolder)}
      >
        <HiOutlineTrash />
      </button>
    </div>
  );
};

export default FolderActions;
