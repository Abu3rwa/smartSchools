import { HiOutlineFolder, HiOutlineShare, HiOutlineTrash, HiOutlineXMark } from "react-icons/hi2";

const SelectionBar = ({ count, onShare, onOrganize, onDelete, deleting, onClear }) => (
  <div className="live-selection-bar" role="status">
    <span className="live-selection-count">{count} selected</span>
    <button className="live-secondary-button" onClick={onShare}>
      <HiOutlineShare /> Share
    </button>
    <button className="live-secondary-button" onClick={onOrganize}>
      <HiOutlineFolder /> Move / add shortcut
    </button>
    <button
      className="live-delete-session"
      onClick={onDelete}
      disabled={deleting}
    >
      <HiOutlineTrash />
      {deleting ? "Deleting…" : "Delete"}
    </button>
    <button
      type="button"
      className="live-icon-button"
      aria-label="Clear selection"
      title="Clear selection"
      onClick={onClear}
    >
      <HiOutlineXMark />
    </button>
  </div>
);

export default SelectionBar;
