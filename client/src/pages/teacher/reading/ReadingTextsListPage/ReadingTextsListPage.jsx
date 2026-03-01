import {
  HiOutlineArrowLeft,
  HiOutlineDocumentAdd,
  HiOutlineUserGroup,
  HiOutlineBookOpen,
} from "react-icons/hi";
import { useReadingTextsListData } from "./hooks/useReadingTextsListData.js";
import "./ReadingTextsListPage.css";

export default function ReadingTextsListPage() {
  const data = useReadingTextsListData();
  const {
    texts,
    classes,
    academicYear,
    loading,
    assignModal,
    setAssignModal,
    assignClassId,
    setAssignClassId,
    assignDueDate,
    setAssignDueDate,
    assignInstructions,
    setAssignInstructions,
    assignSubmitting,
    openAssignModal,
    handleAssignSubmit,
    assignmentCountByText,
    onBack,
    onUpload,
  } = data;

  return (
    <div className="reading-texts-list-page">
      <div className="page-header-row">
        <button type="button" className="btn btn-ghost back-btn" onClick={onBack}>
          <HiOutlineArrowLeft size={18} />
          Back
        </button>
        <div className="page-header">
          <h1>Reading texts</h1>
          <p className="text-muted">
            Upload texts and assign them to classes. Students get level-appropriate
            versions with vocabulary and critical thinking.
            {academicYear ? ` Academic Year: ${academicYear}.` : ""}
          </p>
        </div>
        <button type="button" className="btn btn-primary" onClick={onUpload}>
          <HiOutlineDocumentAdd size={18} />
          Upload text
        </button>
      </div>

      {loading && texts.length === 0 ? (
        <div className="loading-container">
          <div className="spinner" />
        </div>
      ) : texts.length === 0 ? (
        <div className="reading-empty">
          <HiOutlineBookOpen size={48} className="empty-icon" />
          <h3>No texts yet</h3>
          <p>Upload a reading text to get started.</p>
          <button type="button" className="btn btn-primary" onClick={onUpload}>
            Upload text
          </button>
        </div>
      ) : (
        <div className="reading-cards">
          {texts.map((text) => (
            <article key={text._id} className="reading-card">
              <div className="reading-card-body">
                <h3 className="reading-card-title">{text.title}</h3>
                {text.subjectArea && (
                  <span className="reading-card-meta">{text.subjectArea}</span>
                )}
                {text.originalComplexity != null && (
                  <span className="reading-card-meta">
                    Grade level ~{text.originalComplexity}
                  </span>
                )}
                {text.simplifiedVersions?.length > 0 && (
                  <span className="reading-card-meta">
                    {text.simplifiedVersions.length} level(s)
                  </span>
                )}
                <div className="reading-card-actions">
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => openAssignModal(text)}
                  >
                    <HiOutlineUserGroup size={16} />
                    Assign
                  </button>
                  {assignmentCountByText(text._id) > 0 && (
                    <span className="assignment-count">
                      {assignmentCountByText(text._id)} assignment(s)
                    </span>
                  )}
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      {assignModal && (
        <div className="modal-overlay" onClick={() => setAssignModal(null)}>
          <div
            className="modal-content reading-assign-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <h3>Assign: {assignModal.title}</h3>
            <form onSubmit={handleAssignSubmit}>
              <div className="form-group">
                <label htmlFor="assign-class">Class *</label>
                <select
                  id="assign-class"
                  value={assignClassId}
                  onChange={(e) => setAssignClassId(e.target.value)}
                  required
                >
                  <option value="">Select a class</option>
                  {classes.map((c) => (
                    <option key={c._id} value={c._id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label htmlFor="assign-due">Due date (optional)</label>
                <input
                  id="assign-due"
                  type="date"
                  value={assignDueDate}
                  onChange={(e) => setAssignDueDate(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label htmlFor="assign-instructions">Instructions (optional)</label>
                <textarea
                  id="assign-instructions"
                  value={assignInstructions}
                  onChange={(e) => setAssignInstructions(e.target.value)}
                  rows={3}
                  placeholder="e.g. Read and complete the critical thinking questions."
                />
              </div>
              <div className="modal-actions">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setAssignModal(null)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={assignSubmitting}
                >
                  {assignSubmitting ? "Creating…" : "Create assignment"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
