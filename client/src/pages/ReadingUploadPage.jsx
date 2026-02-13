import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import {
  uploadText,
  selectReadingUploading,
  selectReadingError,
} from '../store/slices/readingSlice';
import { fetchClasses, selectClasses } from '../store/slices/classSlice';
import { HiOutlineArrowLeft, HiOutlineDocumentAdd } from 'react-icons/hi';
import toast from 'react-hot-toast';
import './ReadingUploadPage.css';

const ReadingUploadPage = () => {
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const uploading = useSelector(selectReadingUploading);
  const error = useSelector(selectReadingError);
  const classes = useSelector(selectClasses) || [];

  const [title, setTitle] = useState('');
  const [originalText, setOriginalText] = useState('');
  const [sourceDocument, setSourceDocument] = useState('');
  const [subjectArea, setSubjectArea] = useState('');
  const [topicTagsStr, setTopicTagsStr] = useState('');
  const [classId, setClassId] = useState('');
  const [generateVersions, setGenerateVersions] = useState(true);

  useEffect(() => {
    dispatch(fetchClasses());
  }, [dispatch]);

  useEffect(() => {
    if (error) toast.error(error);
  }, [error]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!title.trim()) {
      toast.error('Title is required');
      return;
    }
    if (!originalText.trim()) {
      toast.error('Please paste or enter the text to upload');
      return;
    }
    const topicTags = topicTagsStr
      .split(/[,;]/)
      .map((t) => t.trim())
      .filter(Boolean);
    dispatch(
      uploadText({
        title: title.trim(),
        originalText: originalText.trim(),
        sourceDocument: sourceDocument.trim() || undefined,
        subjectArea: subjectArea.trim() || undefined,
        topicTags: topicTags.length ? topicTags : undefined,
        classId: classId || undefined,
        generateVersions,
      })
    ).then((result) => {
      if (result.type === 'reading/uploadText/fulfilled') {
        toast.success('Text uploaded. Simplified versions and questions are being generated.');
        navigate('/portal/reading/texts');
      }
    });
  };

  return (
    <div className="reading-upload-page">
      <button
        type="button"
        className="btn btn-ghost back-btn"
        onClick={() => navigate('/portal/reading/texts')}
      >
        <HiOutlineArrowLeft size={18} />
        Back
      </button>

      <header className="reading-upload-header">
        <h1>Upload Reading Text</h1>
        <p className="subtitle">
          Add a text for your students. Subject and topic tags are generated from the
          text if left blank. Optionally select a target class so content is tailored
          to your students&apos; reading levels.
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
            Improves simplification and questions using this class&apos;s reading levels
          </span>
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
            Generate simplified versions (grades 6, 8, 10), vocabulary, critical thinking,
            and comprehension questions
          </label>
        </div>

        <div className="form-actions">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => navigate('/portal/reading/texts')}
          >
            Cancel
          </button>
          <button
            type="submit"
            className="btn btn-primary"
            disabled={uploading}
          >
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
};

export default ReadingUploadPage;
