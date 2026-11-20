import {
  HiOutlineArrowDownTray,
  HiOutlinePlus,
  HiOutlinePresentationChartBar,
} from "react-icons/hi2";

const LibraryEmptyState = ({ onImport, onDownloadTemplate }) => (
  <div className="live-empty-state">
    <div className="live-empty-icon">
      <HiOutlinePresentationChartBar size={32} />
    </div>
    <h2>Start with a lesson you already teach</h2>
    <p>
      Import a CSV to create opening, teaching, example, question,
      activity, and exit-ticket slides. No AI generation required.
    </p>
    <button className="live-primary-button" onClick={onImport}>
      <HiOutlinePlus /> Import your first lesson
    </button>
    <button className="live-text-button" onClick={onDownloadTemplate}>
      <HiOutlineArrowDownTray /> Download the sample lesson CSV
    </button>
  </div>
);

export default LibraryEmptyState;
