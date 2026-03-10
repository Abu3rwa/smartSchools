import {
  HiOutlineArrowLeft,
  HiOutlineDocumentAdd,
  HiOutlineUserGroup,
  HiOutlineBookOpen,
} from "react-icons/hi";
import { useTranslation } from "react-i18next";
import { useReadingTextsListData } from "./hooks/useReadingTextsListData.js";
import "./ReadingTextsListPage.css";

export default function ReadingTextsListPage() {
  const { t } = useTranslation(["reading"]);
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
          {t("reading:common.back")}
        </button>
        <div className="page-header">
          <h1>{t("reading:texts.title")}</h1>
          <p className="text-muted">
            {t("reading:texts.subtitle")}
            {academicYear ? ` ${t("reading:texts.academicYear", { year: academicYear })}` : ""}
          </p>
        </div>
        <button type="button" className="btn btn-primary" onClick={onUpload}>
          <HiOutlineDocumentAdd size={18} />
          {t("reading:texts.uploadText")}
        </button>
      </div>

      {loading && texts.length === 0 ? (
        <div className="loading-container">
          <div className="spinner" />
        </div>
      ) : texts.length === 0 ? (
        <div className="reading-empty">
          <HiOutlineBookOpen size={48} className="empty-icon" />
          <h3>{t("reading:texts.emptyTitle")}</h3>
          <p>{t("reading:texts.emptySubtitle")}</p>
          <button type="button" className="btn btn-primary" onClick={onUpload}>
            {t("reading:texts.uploadText")}
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
                    {t("reading:texts.gradeLevelApprox", { level: text.originalComplexity })}
                  </span>
                )}
                {text.simplifiedVersions?.length > 0 && (
                  <span className="reading-card-meta">
                    {t("reading:texts.levelCount", { count: text.simplifiedVersions.length })}
                  </span>
                )}
                <div className="reading-card-actions">
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => openAssignModal(text)}
                  >
                    <HiOutlineUserGroup size={16} />
                    {t("reading:texts.assign")}
                  </button>
                  {assignmentCountByText(text._id) > 0 && (
                    <span className="assignment-count">
                      {t("reading:texts.assignmentCount", { count: assignmentCountByText(text._id) })}
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
            <h3>{t("reading:texts.assignTitle", { title: assignModal.title })}</h3>
            <form onSubmit={handleAssignSubmit}>
              <div className="form-group">
                <label htmlFor="assign-class">{t("reading:texts.assignClass")}</label>
                <select
                  id="assign-class"
                  value={assignClassId}
                  onChange={(e) => setAssignClassId(e.target.value)}
                  required
                >
                  <option value="">{t("reading:texts.selectClass")}</option>
                  {classes.map((c) => (
                    <option key={c._id} value={c._id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label htmlFor="assign-due">{t("reading:texts.dueDateOptional")}</label>
                <input
                  id="assign-due"
                  type="date"
                  value={assignDueDate}
                  onChange={(e) => setAssignDueDate(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label htmlFor="assign-instructions">{t("reading:texts.instructionsOptional")}</label>
                <textarea
                  id="assign-instructions"
                  value={assignInstructions}
                  onChange={(e) => setAssignInstructions(e.target.value)}
                  rows={3}
                  placeholder={t("reading:texts.instructionsPlaceholder")}
                />
              </div>
              <div className="modal-actions">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setAssignModal(null)}
                >
                  {t("reading:common.cancel")}
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={assignSubmitting}
                >
                  {assignSubmitting ? t("reading:common.creating") : t("reading:texts.createAssignment")}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
