import { useState } from "react";
import {
  QUESTION_KIND_OPTIONS,
  SLIDE_TYPE_OPTIONS,
  errorCopy,
} from "./liveLessonBuilderForm.js";
import { useFeatureNamespaces } from "../../../i18n/useFeatureNamespaces";
import BuilderDialog from "./BuilderDialog.jsx";

const BuilderItemDialog = ({
  mode = "add",
  initialKind = "slide",
  item = null,
  onClose,
  onSave,
}) => {
  const { t } = useFeatureNamespaces("liveLessonBuilder");
  const [kind] = useState(item?.kind || initialKind);
  const [slideType, setSlideType] = useState(
    item?.slideType && item.slideType !== "question" ? item.slideType : "content",
  );
  const [questionKind, setQuestionKind] = useState(item?.questionKind || "mcq");
  const [title, setTitle] = useState(item?.outline?.title || "");
  const [brief, setBrief] = useState(item?.outline?.brief || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const submit = async (event) => {
    event.preventDefault();
    if (!title.trim()) {
      setError(t("dialogs.item.required"));
      return;
    }
    setSaving(true);
    setError("");
    try {
      await onSave({
        kind,
        slideType: kind === "slide" ? slideType : "question",
        questionKind: kind === "question" ? questionKind : "",
        title: title.trim(),
        brief: brief.trim(),
      });
    } catch (saveError) {
      setError(errorCopy(t, saveError));
      setSaving(false);
    }
  };

  const heading =
    mode === "add"
      ? kind === "question"
        ? t("dialogs.item.addQuestionTitle")
        : t("dialogs.item.addSlideTitle")
      : t("dialogs.item.editTitle");

  return (
    <BuilderDialog
      title={heading}
      subtitle={t("dialogs.item.copy")}
      onClose={onClose}
      footer={
        <>
          <span className="llb-spacer" />
          <button
            type="button"
            className="llb-btn llb-btn-ghost"
            disabled={saving}
            onClick={onClose}
          >
            {t("dialogs.item.cancel")}
          </button>
          <button
            type="submit"
            form="llb-item-form"
            className="llb-btn llb-btn-primary"
            disabled={saving}
          >
            {saving
              ? t("dialogs.item.saving")
              : mode === "add"
                ? t("dialogs.item.add")
                : t("dialogs.item.save")}
          </button>
        </>
      }
    >
      <form id="llb-item-form" className="llb-form-grid" onSubmit={submit}>
        {error && (
          <div className="llb-banner is-error" role="alert">
            {error}
          </div>
        )}
        <div className="llb-field-block">
          <label className="llb-field-label" htmlFor="llb-item-title">
            {t("dialogs.item.title")}
          </label>
          <input
            id="llb-item-title"
            className="llb-input"
            value={title}
            maxLength={120}
            autoFocus
            placeholder={t("dialogs.item.titlePlaceholder")}
            onChange={(event) => setTitle(event.target.value)}
          />
        </div>
        <div className="llb-field-block">
          <label className="llb-field-label" htmlFor="llb-item-brief">
            {t("dialogs.item.brief")}
          </label>
          <input
            id="llb-item-brief"
            className="llb-input"
            value={brief}
            maxLength={300}
            placeholder={t("dialogs.item.briefPlaceholder")}
            onChange={(event) => setBrief(event.target.value)}
          />
        </div>
        {kind === "slide" ? (
          <div className="llb-field-block">
            <label className="llb-field-label" htmlFor="llb-item-type">
              {t("dialogs.item.slideType")}
            </label>
            <select
              id="llb-item-type"
              className="llb-select"
              value={slideType}
              onChange={(event) => setSlideType(event.target.value)}
            >
              {SLIDE_TYPE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {t(option.labelKey)}
                </option>
              ))}
            </select>
          </div>
        ) : (
          <div className="llb-field-block">
            <label className="llb-field-label" htmlFor="llb-item-type">
              {t("dialogs.item.questionType")}
            </label>
            <select
              id="llb-item-type"
              className="llb-select"
              value={questionKind}
              onChange={(event) => setQuestionKind(event.target.value)}
            >
              {QUESTION_KIND_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {t(option.labelKey)}
                </option>
              ))}
            </select>
          </div>
        )}
      </form>
    </BuilderDialog>
  );
};

export default BuilderItemDialog;
