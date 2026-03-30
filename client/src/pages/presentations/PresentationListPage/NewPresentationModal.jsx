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

import { selectClasses } from "../../../store/slices/classSlice";
import { selectSubjects } from "../../../store/slices/subjectSlice";
import {
  fetchLessons,
  selectLessons,
  selectLessonsLoading,
} from "../../../store/slices/lessonSlice";
import {
  uploadMaterials,
  generatePresentation,
  fetchTemplates,
  clearUploadedMaterials,
} from "../../../store/slices/presentationSlice";
import {
  DEFAULT_PRESENTATION_LAYOUT_SYSTEM,
  PRESENTATION_LAYOUT_SYSTEMS,
} from "../shared/presentationLayoutSystems";

const STEPS = ["details", "materials", "generate"];
const PROMPT_PRESETS = [
  "Keep language simple and age-appropriate for grade 5.",
  "Include one short collaborative activity slide.",
  "Add checks for understanding after key concepts.",
  "Use concrete examples before abstract definitions.",
  "End with a concise recap and exit ticket.",
];

const NewPresentationModal = ({ onClose }) => {
  const { t } = useTranslation(["presentations", "common"]);
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const classes = useSelector(selectClasses);
  const subjects = useSelector(selectSubjects);
  const lessonPlans = useSelector(selectLessons);
  const lessonPlansLoading = useSelector(selectLessonsLoading);
  const { templates, uploadedMaterials, uploading, generating, error } =
    useSelector((s) => s.presentations);

  const [step, setStep] = useState(0);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [classId, setClassId] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [lessonPlanId, setLessonPlanId] = useState("");
  const [templateId, setTemplateId] = useState("");
  const [layoutSystem, setLayoutSystem] = useState(DEFAULT_PRESENTATION_LAYOUT_SYSTEM);
  const [slideCount, setSlideCount] = useState(10);
  const [prompt, setPrompt] = useState("");
  const [selectedPrompts, setSelectedPrompts] = useState([]);
  const [customPrompt, setCustomPrompt] = useState("");

  useEffect(() => {
    dispatch(fetchTemplates());
    return () => {
      dispatch(clearUploadedMaterials());
    };
  }, [dispatch]);

  useEffect(() => {
    const filters = {
      page: 1,
      limit: 100,
      class: classId || undefined,
      subject: subjectId || undefined,
    };
    dispatch(fetchLessons(filters));
  }, [dispatch, classId, subjectId]);

  useEffect(() => {
    if (!lessonPlanId) return;
    const stillExists = (lessonPlans || []).some((l) => l._id === lessonPlanId);
    if (!stillExists) {
      setLessonPlanId("");
    }
  }, [lessonPlans, lessonPlanId]);

  const togglePromptPreset = useCallback((preset) => {
    setSelectedPrompts((prev) =>
      prev.includes(preset)
        ? prev.filter((p) => p !== preset)
        : [...prev, preset]
    );
  }, []);

  const addCustomPrompt = useCallback(() => {
    const value = customPrompt.trim();
    if (!value) return;
    setSelectedPrompts((prev) =>
      prev.includes(value) ? prev : [...prev, value]
    );
    setCustomPrompt("");
  }, [customPrompt]);

  const removePrompt = useCallback((value) => {
    setSelectedPrompts((prev) => prev.filter((p) => p !== value));
  }, []);

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
    const mergedPrompt = [...selectedPrompts, prompt.trim()]
      .filter(Boolean)
      .join("\n");

    const payload = {
      title: title.trim(),
      description: description.trim(),
      classId: classId || undefined,
      subjectId: subjectId || undefined,
      lessonPlanId: lessonPlanId || undefined,
      templateId: templateId || undefined,
      layoutSystem,
      extractionIds: uploadedMaterials.map((m) => m._id),
      slideCount,
      prompt: mergedPrompt,
    };

    const res = await dispatch(generatePresentation(payload));
    if (!res.error) {
      toast.success("Presentation generated!");
      const generated = res.payload?.presentation || res.payload;
      onClose();
      if (generated?._id) {
        navigate(`/portal/presentations/${generated._id}`);
      }
    } else {
      toast.error(res.payload || "Generation failed");
    }
  }, [
    dispatch,
    title,
    description,
    classId,
    subjectId,
    lessonPlanId,
    templateId,
    layoutSystem,
    uploadedMaterials,
    slideCount,
    prompt,
    selectedPrompts,
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
              <div className="form-group">
                <label>Lesson Plan (optional)</label>
                <select
                  value={lessonPlanId}
                  onChange={(e) => setLessonPlanId(e.target.value)}
                  className="form-input"
                >
                  <option value="">
                    {lessonPlansLoading
                      ? "Loading lesson plans..."
                      : "No lesson plan selected"}
                  </option>
                  {(lessonPlans || []).map((lesson) => (
                    <option key={lesson._id} value={lesson._id}>
                      {lesson.title || "Untitled Lesson"}
                    </option>
                  ))}
                </select>
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
                  <label>Layout System</label>
                  <select
                    value={layoutSystem}
                    onChange={(e) => setLayoutSystem(e.target.value)}
                    className="form-input"
                  >
                    {PRESENTATION_LAYOUT_SYSTEMS.map((system) => (
                      <option key={system.id} value={system.id}>
                        {system.name}
                      </option>
                    ))}
                  </select>
                  <small className="helper-text">
                    {PRESENTATION_LAYOUT_SYSTEMS.find((system) => system.id === layoutSystem)?.description}
                  </small>
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
                <label>Prompt Suggestions</label>
                <div className="prompt-chip-list">
                  {PROMPT_PRESETS.map((preset) => {
                    const active = selectedPrompts.includes(preset);
                    return (
                      <button
                        key={preset}
                        type="button"
                        className={`prompt-chip ${active ? "active" : ""}`}
                        onClick={() => togglePromptPreset(preset)}
                      >
                        {preset}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="form-group">
                <label>Add Custom Prompt</label>
                <div className="prompt-custom-row">
                  <input
                    type="text"
                    value={customPrompt}
                    onChange={(e) => setCustomPrompt(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        addCustomPrompt();
                      }
                    }}
                    placeholder="e.g. Include one real-world math scenario"
                    className="form-input"
                  />
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={addCustomPrompt}
                  >
                    Add
                  </button>
                </div>
              </div>

              {selectedPrompts.length > 0 && (
                <div className="form-group">
                  <label>Selected Prompts</label>
                  <div className="prompt-selected-list">
                    {selectedPrompts.map((item) => (
                      <span key={item} className="prompt-selected-item">
                        {item}
                        <button
                          type="button"
                          className="prompt-remove-btn"
                          onClick={() => removePrompt(item)}
                          aria-label="Remove prompt"
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                </div>
              )}

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
                  <strong>Lesson Plan:</strong>{" "}
                  {lessonPlanId
                    ? lessonPlans.find((l) => l._id === lessonPlanId)?.title || "Selected"
                    : "—"}
                </p>
                <p>
                  <strong>Materials:</strong> {uploadedMaterials.length} files
                </p>
                <p>
                  <strong>Prompts:</strong> {selectedPrompts.length}
                </p>
                {templateId && (
                  <p>
                    <strong>Template:</strong>{" "}
                    {templates.find((t) => t._id === templateId)?.name || "—"}
                  </p>
                )}
                <p>
                  <strong>Layout System:</strong>{" "}
                  {PRESENTATION_LAYOUT_SYSTEMS.find((system) => system.id === layoutSystem)?.name || "—"}
                </p>
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
