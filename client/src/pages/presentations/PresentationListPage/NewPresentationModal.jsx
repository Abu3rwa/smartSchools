import { useState, useCallback, useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import toast from "react-hot-toast";
import {
  HiOutlineXMark,
  HiOutlineCloudArrowUp,
  HiOutlineSparkles,
  HiOutlineDocumentText,
} from "react-icons/hi2";

import { selectClasses } from "../../../../store/slices/classSlice";
import { selectSubjects } from "../../../../store/slices/subjectSlice";
import {
  uploadMaterials,
  generatePresentation,
  fetchTemplates,
  clearUploadedMaterials,
} from "../../../../store/slices/presentationSlice";

const STEPS = ["details", "materials", "generate"];

const NewPresentationModal = ({ onClose }) => {
  const { t } = useTranslation(["presentations", "common"]);
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const classes = useSelector(selectClasses);
  const subjects = useSelector(selectSubjects);
  const { templates, uploadedMaterials, uploading, generating, error } =
    useSelector((s) => s.presentations);

  const [step, setStep] = useState(0);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [classId, setClassId] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [templateId, setTemplateId] = useState("");
  const [slideCount, setSlideCount] = useState(10);
  const [prompt, setPrompt] = useState("");

  useEffect(() => {
    dispatch(fetchTemplates());
    return () => {
      dispatch(clearUploadedMaterials());
    };
  }, [dispatch]);

  const handleFileUpload = useCallback(
    async (e) => {
      const files = Array.from(e.target.files);
      if (files.length === 0) return;
      const res = await dispatch(uploadMaterials(files));
      if (!res.error) {
        toast.success(`${files.length} file(s) uploaded`);
      } else {
        toast.error(res.payload || "Upload failed");
      }
    },
    [dispatch]
  );

  const handleGenerate = useCallback(async () => {
    if (!title.trim()) {
      toast.error("Title is required");
      return;
    }
    const payload = {
      title: title.trim(),
      description: description.trim(),
      classId: classId || undefined,
      subjectId: subjectId || undefined,
      templateId: templateId || undefined,
      extractionIds: uploadedMaterials.map((m) => m._id),
      slideCount,
      prompt: prompt.trim(),
    };

    const res = await dispatch(generatePresentation(payload));
    if (!res.error) {
      toast.success("Presentation generated!");
      onClose();
      navigate(`/portal/presentations/${res.payload._id}`);
    } else {
      toast.error(res.payload || "Generation failed");
    }
  }, [
    dispatch,
    title,
    description,
    classId,
    subjectId,
    templateId,
    uploadedMaterials,
    slideCount,
    prompt,
    onClose,
    navigate,
  ]);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content modal-lg" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{t("presentations:newPresentation", "New Presentation")}</h2>
          <button className="icon-btn" onClick={onClose}>
            <HiOutlineXMark size={20} />
          </button>
        </div>

        {/* Step indicators */}
        <div className="wizard-steps">
          {STEPS.map((s, i) => (
            <div
              key={s}
              className={`wizard-step ${i === step ? "active" : ""} ${i < step ? "completed" : ""}`}
              onClick={() => i < step && setStep(i)}
            >
              <span className="step-number">{i + 1}</span>
              <span className="step-label">
                {s === "details"
                  ? "Details"
                  : s === "materials"
                    ? "Materials"
                    : "Generate"}
              </span>
            </div>
          ))}
        </div>

        <div className="modal-body">
          {/* Step 1: Details */}
          {step === 0 && (
            <div className="wizard-panel">
              <div className="form-group">
                <label>Title *</label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Fractions Introduction"
                  className="form-input"
                />
              </div>
              <div className="form-group">
                <label>Description</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Brief description of the presentation"
                  className="form-input"
                  rows={2}
                />
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Class</label>
                  <select
                    value={classId}
                    onChange={(e) => setClassId(e.target.value)}
                    className="form-input"
                  >
                    <option value="">Select class...</option>
                    {(classes || []).map((c) => (
                      <option key={c._id} value={c._id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label>Subject</label>
                  <select
                    value={subjectId}
                    onChange={(e) => setSubjectId(e.target.value)}
                    className="form-input"
                  >
                    <option value="">Select subject...</option>
                    {(subjects || []).map((s) => (
                      <option key={s._id} value={s._id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Template</label>
                  <select
                    value={templateId}
                    onChange={(e) => setTemplateId(e.target.value)}
                    className="form-input"
                  >
                    <option value="">No template</option>
                    {templates.map((tmpl) => (
                      <option key={tmpl._id} value={tmpl._id}>
                        {tmpl.name} ({tmpl.slideStructure?.length || 0} slides)
                      </option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label>Slide Count</label>
                  <input
                    type="number"
                    min={3}
                    max={30}
                    value={slideCount}
                    onChange={(e) => setSlideCount(Number(e.target.value))}
                    className="form-input"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Step 2: Upload Materials */}
          {step === 1 && (
            <div className="wizard-panel">
              <div className="upload-zone">
                <label className="upload-label">
                  <HiOutlineCloudArrowUp size={36} />
                  <span>
                    Drop files here or click to upload (PDF, DOCX, PPTX, images)
                  </span>
                  <input
                    type="file"
                    multiple
                    accept=".pdf,.docx,.pptx,.jpg,.jpeg,.png,.webp"
                    onChange={handleFileUpload}
                    style={{ display: "none" }}
                  />
                </label>
                {uploading && (
                  <div className="upload-progress">Uploading...</div>
                )}
              </div>

              {uploadedMaterials.length > 0 && (
                <div className="uploaded-files">
                  <h4>Uploaded Materials</h4>
                  {uploadedMaterials.map((m) => (
                    <div key={m._id} className="uploaded-file-item">
                      <HiOutlineDocumentText size={18} />
                      <span className="file-name">{m.originalName}</span>
                      <span className="file-meta">
                        {m.wordCount} words • {m.pageCount || 1} pages
                      </span>
                    </div>
                  ))}
                </div>
              )}

              <p className="step-hint">
                Upload lesson materials, textbook pages, or reference documents.
                The AI will use these to generate accurate slide content.
              </p>
            </div>
          )}

          {/* Step 3: Prompt & Generate */}
          {step === 2 && (
            <div className="wizard-panel">
              <div className="form-group">
                <label>
                  Additional Instructions{" "}
                  <span className="label-hint">(optional)</span>
                </label>
                <textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="e.g. Focus on vocabulary, include a group activity, make it engaging for 5th graders..."
                  className="form-input"
                  rows={4}
                />
              </div>

              <div className="generation-summary">
                <h4>Summary</h4>
                <p>
                  <strong>Title:</strong> {title || "—"}
                </p>
                <p>
                  <strong>Slides:</strong> {slideCount}
                </p>
                <p>
                  <strong>Materials:</strong> {uploadedMaterials.length} files
                </p>
                {templateId && (
                  <p>
                    <strong>Template:</strong>{" "}
                    {templates.find((t) => t._id === templateId)?.name || "—"}
                  </p>
                )}
              </div>

              {error && <div className="error-banner">{error}</div>}
            </div>
          )}
        </div>

        <div className="modal-footer">
          {step > 0 && (
            <button
              className="btn-secondary"
              onClick={() => setStep(step - 1)}
              disabled={generating}
            >
              Back
            </button>
          )}
          <div style={{ flex: 1 }} />
          {step < STEPS.length - 1 ? (
            <button
              className="btn-primary"
              onClick={() => setStep(step + 1)}
              disabled={step === 0 && !title.trim()}
            >
              Next
            </button>
          ) : (
            <button
              className="btn-primary"
              onClick={handleGenerate}
              disabled={generating || !title.trim()}
            >
              {generating ? (
                <>
                  <span className="spinner-sm" /> Generating...
                </>
              ) : (
                <>
                  <HiOutlineSparkles size={18} /> Generate Presentation
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default NewPresentationModal;
