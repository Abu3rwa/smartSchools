import { useState } from "react";
import {
  HiOutlineArrowLeft,
  HiOutlineDocumentAdd,
  HiOutlineUserGroup,
  HiOutlineBookOpen,
} from "react-icons/hi";
import { useTranslation } from "react-i18next";
import { useDispatch, useSelector } from "react-redux";
import { selectUser } from "../../../../store/slices/authSlice.js";
import { useReadingTextsListData } from "./hooks/useReadingTextsListData.js";
import { fetchTexts } from "../../../../store/slices/readingSlice.js";
import readingService from "../../../../services/readingService.js";
import ReadingCsvImportPanel from "./ReadingCsvImportPanel.jsx";
import ReadingEditorModal from "./ReadingEditorModal.jsx";
import toast from "react-hot-toast";
import "./ReadingTextsListPage.css";

export default function ReadingTextsListPage() {
  const { t } = useTranslation(["reading"]);
  const dispatch = useDispatch();
  const user = useSelector(selectUser);
  const data = useReadingTextsListData();
  const [editingReading, setEditingReading] = useState(null);
  const [editorLoading, setEditorLoading] = useState(false);
  const [editorSaving, setEditorSaving] = useState(false);
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
  const handleSharingChange = async (text) => {
    try {
      await readingService.updateTextSharing(text._id, !text.isShared);
      await dispatch(fetchTexts());
      toast.success(text.isShared ? t("reading:texts.shareDisabled") : t("reading:texts.shareEnabled"));
    } catch (error) {
      toast.error(error.response?.data?.message || t("reading:texts.sharingFailed"));
    }
  };
  const canManage = (text) => user?.role === "admin"
    || String(text.createdBy?._id || text.createdBy || "") === String(user?._id || "");
  const handleEdit = async (text) => {
    setEditorLoading(true);
    try {
      const response = await readingService.getTextById(text._id);
      setEditingReading(response.data?.data);
    } catch (error) {
      toast.error(error.response?.data?.message || t("reading:texts.editFailed"));
    } finally {
      setEditorLoading(false);
    }
  };
  const handleSave = async (payload) => {
    setEditorSaving(true);
    try {
      await readingService.updateText(editingReading._id, payload);
      setEditingReading(null);
      await dispatch(fetchTexts());
      toast.success(t("reading:texts.editSuccess"));
    } finally {
      setEditorSaving(false);
    }
  };
  const handleDelete = async (text) => {
    if (!window.confirm(t("reading:texts.deleteConfirm", { title: text.title }))) return;
    try {
      await readingService.deleteText(text._id);
      await dispatch(fetchTexts());
      toast.success(t("reading:texts.deleteSuccess"));
    } catch (error) {
      toast.error(error.response?.data?.message || t("reading:texts.deleteFailed"));
    }
  };

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

      <ReadingCsvImportPanel onImported={() => dispatch(fetchTexts())} />

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
                {text.isShared && <span className="reading-card-meta">{t("reading:texts.sharedWithSchool")}</span>}
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
                  {canManage(text) && (
                    <>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => handleEdit(text)}
                        disabled={editorLoading}
                      >
                        {t("reading:texts.editReading")}
                      </button>
                      <button
                        type="button"
                        className="btn btn-danger btn-sm"
                        onClick={() => handleDelete(text)}
                      >
                        {t("reading:texts.deleteReading")}
                      </button>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => handleSharingChange(text)}
                      >
                        {text.isShared ? t("reading:texts.stopSharing") : t("reading:texts.shareReading")}
                      </button>
                    </>
                  )}
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
      {editingReading && (
        <ReadingEditorModal
          key={editingReading._id}
          reading={editingReading}
          saving={editorSaving}
          onClose={() => setEditingReading(null)}
          onSave={handleSave}
        />
      )}
    </div>
  );
}
