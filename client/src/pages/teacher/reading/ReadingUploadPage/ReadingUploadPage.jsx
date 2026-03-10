import { HiOutlineArrowLeft, HiOutlineDocumentAdd } from "react-icons/hi";
import { useTranslation } from "react-i18next";
import { useReadingUploadData } from "./hooks/useReadingUploadData.js";
import { AI_LANGUAGE_OPTIONS } from "../../../../constants/aiLanguages.js";
import "./ReadingUploadPage.css";

export default function ReadingUploadPage() {
  const { t } = useTranslation(["reading"]);
  const {
    title,
    setTitle,
    originalText,
    setOriginalText,
    sourceDocument,
    setSourceDocument,
    subjectArea,
    setSubjectArea,
    topicTagsStr,
    setTopicTagsStr,
    classId,
    setClassId,
    generateVersions,
    setGenerateVersions,
    aiPrimaryLanguage,
    setAiPrimaryLanguage,
    aiSecondaryLanguage,
    setAiSecondaryLanguage,
    uploading,
    classes,
    handleSubmit,
    onCancel,
  } = useReadingUploadData();

  return (
    <div className="reading-upload-page">
      <button type="button" className="btn btn-ghost back-btn" onClick={onCancel}>
        <HiOutlineArrowLeft size={18} />
        {t("reading:common.back")}
      </button>

      <header className="reading-upload-header">
        <h1>{t("reading:upload.title")}</h1>
        <p className="subtitle">
          {t("reading:upload.subtitle")}
        </p>
      </header>

      <form className="reading-upload-form" onSubmit={handleSubmit}>
        <div className="form-group">
          <label htmlFor="title">{t("reading:upload.fields.title")}</label>
          <input
            id="title"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={t("reading:upload.fields.titlePlaceholder")}
            required
          />
        </div>

        <div className="form-row">
          <div className="form-group">
            <label htmlFor="subjectArea">{t("reading:upload.fields.subjectArea")}</label>
            <input
              id="subjectArea"
              type="text"
              value={subjectArea}
              onChange={(e) => setSubjectArea(e.target.value)}
              placeholder={t("reading:upload.fields.subjectAreaPlaceholder")}
            />
            <span className="field-hint">{t("reading:upload.fields.generatedHint")}</span>
          </div>
          <div className="form-group">
            <label htmlFor="sourceDocument">{t("reading:upload.fields.sourceDocument")}</label>
            <input
              id="sourceDocument"
              type="text"
              value={sourceDocument}
              onChange={(e) => setSourceDocument(e.target.value)}
              placeholder={t("reading:upload.fields.sourceDocumentPlaceholder")}
            />
          </div>
        </div>

        <div className="form-group">
          <label htmlFor="topicTags">{t("reading:upload.fields.topicTags")}</label>
          <input
            id="topicTags"
            type="text"
            value={topicTagsStr}
            onChange={(e) => setTopicTagsStr(e.target.value)}
            placeholder={t("reading:upload.fields.topicTagsPlaceholder")}
          />
          <span className="field-hint">{t("reading:upload.fields.generatedHint")}</span>
        </div>

        <div className="form-group">
          <label htmlFor="targetClass">{t("reading:upload.fields.targetClass")}</label>
          <select
            id="targetClass"
            value={classId}
            onChange={(e) => setClassId(e.target.value)}
          >
            <option value="">{t("reading:upload.fields.noSpecificClass")}</option>
            {classes.map((c) => (
              <option key={c._id} value={c._id}>
                {c.name} ({t("reading:upload.fields.grade", { grade: c.grade })})
              </option>
            ))}
          </select>
          <span className="field-hint">
            {t("reading:upload.fields.classHint")}
          </span>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label htmlFor="aiPrimaryLanguage">{t("reading:upload.fields.primaryLanguage")}</label>
            <select
              id="aiPrimaryLanguage"
              value={aiPrimaryLanguage}
              onChange={(e) => {
                const nextPrimary = e.target.value;
                setAiPrimaryLanguage(nextPrimary);
                if (nextPrimary === aiSecondaryLanguage) {
                  setAiSecondaryLanguage("");
                }
              }}
            >
              {AI_LANGUAGE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label htmlFor="aiSecondaryLanguage">{t("reading:upload.fields.secondaryLanguage")}</label>
            <select
              id="aiSecondaryLanguage"
              value={aiSecondaryLanguage}
              onChange={(e) => setAiSecondaryLanguage(e.target.value)}
            >
              <option value="">{t("reading:common.none")}</option>
              {AI_LANGUAGE_OPTIONS
                .filter((option) => option.value !== aiPrimaryLanguage)
                .map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
            </select>
          </div>
        </div>

        <div className="form-group">
          <label htmlFor="originalText">{t("reading:upload.fields.textContent")}</label>
          <textarea
            id="originalText"
            value={originalText}
            onChange={(e) => setOriginalText(e.target.value)}
            placeholder={t("reading:upload.fields.textContentPlaceholder")}
            rows={14}
            required
          />
        </div>

        <div className="form-group checkbox-group">
          <input
            id="generateVersions"
            type="checkbox"
            checked={generateVersions}
            onChange={(e) => setGenerateVersions(e.target.checked)}
          />
          <label htmlFor="generateVersions">
            {t("reading:upload.fields.generateVersions")}
          </label>
        </div>

        <div className="form-actions">
          <button type="button" className="btn btn-secondary" onClick={onCancel}>
            {t("reading:common.cancel")}
          </button>
          <button type="submit" className="btn btn-primary" disabled={uploading}>
            {uploading ? (
              <span className="btn-loading">{t("reading:common.uploading")}</span>
            ) : (
              <>
                <HiOutlineDocumentAdd size={18} />
                {t("reading:upload.actions.uploadText")}
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
