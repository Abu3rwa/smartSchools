import { HiOutlineArrowLeft, HiOutlineDocumentAdd } from "react-icons/hi";
import { useReadingUploadData } from "./hooks/useReadingUploadData.js";
import { AI_LANGUAGE_OPTIONS } from "../../../../constants/aiLanguages.js";
import "./ReadingUploadPage.css";

export default function ReadingUploadPage() {
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
        Back
      </button>

      <header className="reading-upload-header">
        <h1>Upload Reading Text</h1>
        <p className="subtitle">
          Add a text for your students. Subject and topic tags are generated from
          the text if left blank. Optionally select a target class so content is
          tailored to your students&apos; reading levels.
        </p>
      </header>

      <form className="reading-upload-form" onSubmit={handleSubmit}>
        <div className="form-group">
          <label htmlFor="title">Title *</label>
          <input
            id="title"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. The Water Cycle"
            required
          />
        </div>

        <div className="form-row">
          <div className="form-group">
            <label htmlFor="subjectArea">Subject area (optional)</label>
            <input
              id="subjectArea"
              type="text"
              value={subjectArea}
              onChange={(e) => setSubjectArea(e.target.value)}
              placeholder="Leave blank to generate from text"
            />
            <span className="field-hint">Generated from the text if left blank</span>
          </div>
          <div className="form-group">
            <label htmlFor="sourceDocument">Source (optional)</label>
            <input
              id="sourceDocument"
              type="text"
              value={sourceDocument}
              onChange={(e) => setSourceDocument(e.target.value)}
              placeholder="e.g. Chapter 3"
            />
          </div>
        </div>

        <div className="form-group">
          <label htmlFor="topicTags">Topic tags (optional)</label>
          <input
            id="topicTags"
            type="text"
            value={topicTagsStr}
            onChange={(e) => setTopicTagsStr(e.target.value)}
            placeholder="Leave blank to generate from text (comma-separated to override)"
          />
          <span className="field-hint">Generated from the text if left blank</span>
        </div>

        <div className="form-group">
          <label htmlFor="targetClass">Target class (optional)</label>
          <select
            id="targetClass"
            value={classId}
            onChange={(e) => setClassId(e.target.value)}
          >
            <option value="">No specific class</option>
            {classes.map((c) => (
              <option key={c._id} value={c._id}>
                {c.name} (Grade {c.grade})
              </option>
            ))}
          </select>
          <span className="field-hint">
            Improves simplification and questions using this class&apos;s reading
            levels
          </span>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label htmlFor="aiPrimaryLanguage">Primary AI language</label>
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
            <label htmlFor="aiSecondaryLanguage">Secondary AI language (optional)</label>
            <select
              id="aiSecondaryLanguage"
              value={aiSecondaryLanguage}
              onChange={(e) => setAiSecondaryLanguage(e.target.value)}
            >
              <option value="">None</option>
              {AI_LANGUAGE_OPTIONS
                .filter((option) => option.value !== aiPrimaryLanguage)
                .map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
            </select>
          </div>
        </div>

        <div className="form-group">
          <label htmlFor="originalText">Text content *</label>
          <textarea
            id="originalText"
            value={originalText}
            onChange={(e) => setOriginalText(e.target.value)}
            placeholder="Paste or type the full text here..."
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
            Generate simplified versions (grades 6, 8, 10), vocabulary, critical
            thinking, and comprehension questions
          </label>
        </div>

        <div className="form-actions">
          <button type="button" className="btn btn-secondary" onClick={onCancel}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={uploading}>
            {uploading ? (
              <span className="btn-loading">Uploading…</span>
            ) : (
              <>
                <HiOutlineDocumentAdd size={18} />
                Upload text
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
