import { useCallback, useEffect, useMemo, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useNavigate } from "react-router-dom";
import { HiOutlineArrowDownTray, HiOutlineArrowUpTray, HiOutlineCheck, HiOutlineClipboardDocument, HiOutlinePencilSquare, HiOutlinePlay, HiOutlinePlus, HiOutlinePresentationChartBar, HiOutlineTrash } from "react-icons/hi2";
import api from "../../config/api";
import { fetchClasses, selectClasses } from "../../store/slices/classSlice";
import LiveLessonSlide from "../../components/liveLessons/LiveLessonSlide";
import { LIVE_LESSON_CSV_TEMPLATE } from "./liveLessonCsvTemplate";
import { LIVE_LESSON_AI_PROMPT } from "./liveLessonAiPrompt";
import "./LiveLessonsPage.css";

const emptyForm = { title: "", description: "", slides: [] };

const downloadTemplate = () => {
  const blob = new Blob([LIVE_LESSON_CSV_TEMPLATE], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "live-lesson-template.csv";
  link.click();
  URL.revokeObjectURL(url);
};

const LiveLessonsPage = () => {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const classes = useSelector(selectClasses);
  const [lessons, setLessons] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [tab, setTab] = useState("lessons");
  const [importOpen, setImportOpen] = useState(false);
  const [editorMode, setEditorMode] = useState("create");
  const [editingLessonId, setEditingLessonId] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [promptCopied, setPromptCopied] = useState(false);
  const [fileName, setFileName] = useState("");
  const [errors, setErrors] = useState([]);
  const [matchedColumns, setMatchedColumns] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [selectedSlideIndex, setSelectedSlideIndex] = useState(0);
  const [selectedFile, setSelectedFile] = useState("");
  const [lessonClasses, setLessonClasses] = useState({});
  const [error, setError] = useState("");

  const copyAiPrompt = async () => {
    try {
      await navigator.clipboard.writeText(LIVE_LESSON_AI_PROMPT);
      setPromptCopied(true);
      window.setTimeout(() => setPromptCopied(false), 2200);
    } catch (copyError) {
      setError(copyError.message || "Could not copy the AI prompt. Check clipboard permissions and try again.");
    }
  };

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [lessonResponse, sessionResponse] = await Promise.all([
        api.get("/live/lessons"),
        api.get("/live/sessions"),
      ]);
      setLessons(lessonResponse.data?.data?.lessons || []);
      setSessions(sessionResponse.data?.data?.sessions || []);
    } catch (requestError) {
      setError(requestError.response?.data?.message || "Could not load live lessons.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    dispatch(fetchClasses({ limit: 100 }));
    loadData();
  }, [dispatch, loadData]);

  const handleSelectFile = async (event) => {
    const file = event.target.files?.[0];
    setErrors([]);
    setForm(emptyForm);
    setSelectedSlideIndex(0);
    setMatchedColumns(null);
    setSelectedFile("");
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".csv")) {
      setErrors([{ row: 1, field: "file", message: "Choose a .csv file." }]);
      return;
    }
    try {
      const csv = await file.text();
      const response = await api.post("/live/lessons/preview", csv, {
        headers: { "Content-Type": "text/csv" },
      });
      setForm(response.data.data.lesson);
      setSelectedSlideIndex(0);
      setMatchedColumns(response.data.data.matchedColumns || {});
      setFileName(file.name);
      setSelectedFile(csv);
    } catch (requestError) {
      setErrors(requestError.response?.data?.errors || [{
        row: 1,
        field: "file",
        message: requestError.response?.data?.message || "CSV preview failed.",
      }]);
    } finally {
      event.target.value = "";
    }
  };

  const openLessonEditor = async (lessonId) => {
    setError("");
    setErrors([]);
    setEditorMode("edit");
    setEditingLessonId(lessonId);
    setImportOpen(true);
    setSaving(true);
    try {
      const response = await api.get(`/live/lessons/${lessonId}`);
      const lesson = response.data?.data?.lesson;
      setForm({
        title: lesson.title,
        description: lesson.description || "",
        slides: (lesson.slides || []).map((slide) => ({
          ...slide,
          examples: slide.examples || [],
          question: slide.question ? {
            ...slide.question,
            options: slide.question.options || [],
          } : undefined,
        })),
      });
      setSelectedSlideIndex(0);
      setFileName("");
      setSelectedFile("");
      setMatchedColumns(null);
    } catch (requestError) {
      closeEditor(true);
      setError(requestError.response?.data?.message || "Could not open this lesson for editing.");
    } finally {
      setSaving(false);
    }
  };

  const updateSlide = (slideIndex, change) => {
    setForm((previous) => ({
      ...previous,
      slides: previous.slides.map((slide, index) =>
        index === slideIndex ? { ...slide, ...change } : slide,
      ),
    }));
  };

  const updateQuestion = (slideIndex, change) => {
    setForm((previous) => ({
      ...previous,
      slides: previous.slides.map((slide, index) =>
        index === slideIndex
          ? { ...slide, question: { ...slide.question, ...change } }
          : slide,
      ),
    }));
  };

  const changeQuestionKind = (slideIndex, kind) => {
    const question = form.slides[slideIndex].question;
    const options = kind === "tf"
      ? [{ id: "true", text: "True" }, { id: "false", text: "False" }]
      : question.options.map((option, index) => ({
          id: String.fromCharCode(97 + index),
          text: option.text,
        }));
    updateQuestion(slideIndex, {
      kind,
      options,
      correctOptionId: options.some((option) => option.id === question.correctOptionId)
        ? question.correctOptionId
        : options[0].id,
    });
  };

  const addQuestionOption = (slideIndex) => {
    const question = form.slides[slideIndex].question;
    if (question.kind !== "mcq" || question.options.length >= 6) return;
    const usedIds = new Set(question.options.map((option) => option.id));
    const nextId = ["a", "b", "c", "d", "e", "f"].find((id) => !usedIds.has(id));
    updateQuestion(slideIndex, {
      options: [...question.options, { id: nextId, text: "" }],
    });
  };

  const removeQuestionOption = (slideIndex, optionId) => {
    const question = form.slides[slideIndex].question;
    if (question.kind !== "mcq" || question.options.length <= 2) return;
    const options = question.options.filter((option) => option.id !== optionId);
    updateQuestion(slideIndex, {
      options,
      correctOptionId: question.correctOptionId === optionId
        ? options[0].id
        : question.correctOptionId,
    });
  };

  const changeSlideType = (slideIndex, type) => {
    const currentSlide = form.slides[slideIndex];
    const question = type === "question"
      ? currentSlide.question || {
          kind: "mcq",
          prompt: "",
          options: [{ id: "a", text: "" }, { id: "b", text: "" }],
          correctOptionId: "a",
          explanation: "",
        }
      : undefined;
    updateSlide(slideIndex, { type, question });
  };

  const addSlide = () => {
    const nextSlide = {
      type: "content",
      title: "New slide",
      body: "",
      examples: [],
      imageUrl: "",
      speakerNotes: "",
    };
    setForm((previous) => ({ ...previous, slides: [...previous.slides, nextSlide] }));
    setSelectedSlideIndex(form.slides.length);
  };

  const deleteSelectedSlide = () => {
    if (form.slides.length <= 1) return;
    setForm((previous) => ({
      ...previous,
      slides: previous.slides.filter((_, index) => index !== selectedSlideIndex),
    }));
    setSelectedSlideIndex((index) => Math.max(0, Math.min(index, form.slides.length - 2)));
  };

  const closeEditor = (force = false) => {
    if (saving && !force) return;
    setImportOpen(false);
    setEditorMode("create");
    setEditingLessonId("");
    setForm(emptyForm);
    setSelectedSlideIndex(0);
    setSelectedFile("");
    setFileName("");
    setMatchedColumns(null);
    setErrors([]);
  };

  const openImportEditor = () => {
    setEditorMode("create");
    setEditingLessonId("");
    setForm(emptyForm);
    setSelectedSlideIndex(0);
    setSelectedFile("");
    setFileName("");
    setMatchedColumns(null);
    setErrors([]);
    setImportOpen(true);
  };

  const saveImportedLesson = async () => {
    if (editorMode === "create" && !selectedFile) return;
    setSaving(true);
    setErrors([]);
    try {
      const lessonData = {
        title: form.title,
        description: form.description,
        slides: form.slides,
      };
      if (editorMode === "edit") {
        await api.put(`/live/lessons/${editingLessonId}`, lessonData);
      } else {
        await api.post("/live/lessons", lessonData);
      }
      closeEditor(true);
      await loadData();
    } catch (requestError) {
      setErrors(requestError.response?.data?.errors || [{
        row: 1,
        field: "import",
        message: requestError.response?.data?.message || (editorMode === "edit" ? "Could not update this lesson." : "Could not import this lesson."),
      }]);
    } finally {
      setSaving(false);
    }
  };

  const deleteLesson = async (lessonId) => {
    if (!window.confirm("Delete this lesson? Existing session replays will be kept.")) return;
    try {
      await api.delete(`/live/lessons/${lessonId}`);
      await loadData();
    } catch (requestError) {
      setError(requestError.response?.data?.message || "Could not delete lesson.");
    }
  };

  const startSession = async (lessonId) => {
    const classId = lessonClasses[lessonId];
    if (!classId) {
      setError("Choose a class before starting a live lesson.");
      return;
    }
    try {
      const response = await api.post("/live/sessions", { lessonId, classId });
      navigate(`/portal/live-lessons/sessions/${response.data.data.session._id}`);
    } catch (requestError) {
      setError(requestError.response?.data?.message || "Could not start the lesson session.");
    }
  };

  const deleteSession = async (session) => {
    const title = session.lessonSnapshot?.title || "this lesson session";
    if (!window.confirm(`Permanently delete the session history for "${title}"? Its report, replay, answers, and timeline will be removed. The lesson itself will not be deleted.`)) return;
    try {
      await api.delete(`/live/sessions/${session._id}`);
      await loadData();
    } catch (requestError) {
      setError(requestError.response?.data?.message || "Could not delete this session history.");
    }
  };

  const activeSlide = form.slides[selectedSlideIndex];
  const classesById = useMemo(
    () => new Map(classes.map((classItem) => [String(classItem._id), classItem])),
    [classes],
  );

  return (
    <div className="live-lessons-page">
      <header className="live-lessons-hero">
        <div className="live-lessons-hero-copy">
          <span className="live-eyebrow">TEACH TOGETHER</span>
          <h1>Live lessons</h1>
          <p>Bring your lesson slides to the class screen, ask questions, and see student responses as they happen.</p>
        </div>
        <div className="live-lessons-hero-mark"><HiOutlinePresentationChartBar size={42} /></div>
      </header>

      <nav className="live-lessons-tabs" aria-label="Live lesson sections">
        <button className={tab === "lessons" ? "active" : ""} onClick={() => setTab("lessons")}>My lessons <span>{lessons.length}</span></button>
        <button className={tab === "sessions" ? "active" : ""} onClick={() => setTab("sessions")}>Session history <span>{sessions.length}</span></button>
      </nav>

      {error && <div className="live-error-banner" role="alert">{error}<button onClick={() => setError("")}>Dismiss</button></div>}
      {loading ? (
        <div className="live-loading">Loading live lessons…</div>
      ) : tab === "lessons" ? (
        <>
          <div className="live-lessons-actions">
            <p>Import a CSV lesson, preview every slide, and launch it with a class.</p>
            <div className="live-session-actions">
              <button className="live-text-button" onClick={copyAiPrompt}>
                {promptCopied ? <HiOutlineCheck /> : <HiOutlineClipboardDocument />}
                {promptCopied ? "Copied to clipboard" : "Copy AI prompt + sample"}
              </button>
              <button className="live-primary-button" onClick={openImportEditor}><HiOutlineArrowUpTray /> Import CSV lesson</button>
            </div>
          </div>
          {lessons.length === 0 ? (
            <div className="live-empty-state">
              <div className="live-empty-icon"><HiOutlinePresentationChartBar size={32} /></div>
              <h2>Start with a lesson you already teach</h2>
              <p>Import a CSV to create opening, teaching, example, question, activity, and exit-ticket slides. No AI generation required.</p>
              <button className="live-primary-button" onClick={openImportEditor}><HiOutlinePlus /> Import your first lesson</button>
              <button className="live-text-button" onClick={downloadTemplate}><HiOutlineArrowDownTray /> Download the sample lesson CSV</button>
            </div>
          ) : (
            <div className="live-lesson-grid">
              {lessons.map((lesson) => (
                <article className="live-lesson-card" key={lesson._id}>
                  <div className="live-lesson-card-top">
                    <span className="live-lesson-tag">CSV LESSON</span>
                    <span>{lesson.slides?.length || 0} slides</span>
                  </div>
                  <h2>{lesson.title}</h2>
                  {lesson.description && <p>{lesson.description}</p>}
                  <div className="live-lesson-card-footer">
                    <select
                      aria-label={`Class for ${lesson.title}`}
                      value={lessonClasses[lesson._id] || ""}
                      onChange={(event) => setLessonClasses((previous) => ({ ...previous, [lesson._id]: event.target.value }))}
                    >
                      <option value="">Choose class…</option>
                      {classes.map((classItem) => <option key={classItem._id} value={classItem._id}>{classItem.name}</option>)}
                    </select>
                    <button className="live-primary-button" onClick={() => startSession(lesson._id)}><HiOutlinePlay /> Start</button>
                  </div>
                  <div className="live-lesson-management">
                    <button className="live-edit-lesson" onClick={() => openLessonEditor(lesson._id)}><HiOutlinePencilSquare /> Edit lesson</button>
                    <button className="live-delete-lesson" onClick={() => deleteLesson(lesson._id)}><HiOutlineTrash /> Delete lesson</button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </>
      ) : (
        <div className="live-session-list">
          {sessions.length === 0 && <div className="live-empty-state"><h2>No sessions yet</h2><p>Start a live lesson to see sessions and reports here.</p></div>}
          {sessions.map((session) => (
            <article className="live-session-row" key={session._id}>
              <div>
                <span className={`live-status-pill ${session.status}`}>{session.status}</span>
                <h3>{session.lessonSnapshot?.title || "Live lesson"}</h3>
                <p>{classesById.get(String(session.classId?._id || session.classId))?.name || session.classId?.name || "Class"} · {new Date(session.createdAt).toLocaleString()}</p>
              </div>
              <div className="live-session-actions">
                {session.status !== "ended" && <button className="live-secondary-button" onClick={() => navigate(`/portal/live-lessons/sessions/${session._id}`)}>Open session</button>}
                <button className="live-secondary-button" onClick={() => navigate(`/portal/live-lessons/sessions/${session._id}/report`)}>Report</button>
                <button className="live-secondary-button" onClick={() => navigate(`/portal/live-lessons/sessions/${session._id}/replay`)}>Replay</button>
                <button
                  className="live-delete-session"
                  onClick={() => deleteSession(session)}
                  disabled={session.status === "live"}
                  title={session.status === "live" ? "End the live session before deleting its history." : "Delete this session history"}
                >
                  <HiOutlineTrash /> Delete history
                </button>
              </div>
            </article>
          ))}
        </div>
      )}

      {importOpen && (
        <div className="live-import-overlay" role="presentation" onClick={closeEditor}>
          <section className="live-import-dialog" role="dialog" aria-modal="true" aria-labelledby="live-import-title" onClick={(event) => event.stopPropagation()}>
            <header className="live-import-header">
              <div><span className="live-eyebrow">{editorMode === "edit" ? "LESSON EDITOR" : "CSV LESSON BUILDER"}</span><h2 id="live-import-title">{editorMode === "edit" ? "Edit lesson" : "Import a lesson"}</h2></div>
              <button className="live-dialog-close" onClick={closeEditor} aria-label="Close lesson editor" disabled={saving}>×</button>
            </header>
            {editorMode === "create" && <div className="live-import-toolbar">
              <p>Each row becomes a designed lesson slide. Question rows become answerable checks in the live session.</p>
              <div className="live-session-actions">
                <button className="live-text-button" onClick={copyAiPrompt}>
                  {promptCopied ? <HiOutlineCheck /> : <HiOutlineClipboardDocument />}
                  {promptCopied ? "Copied" : "Copy AI prompt"}
                </button>
                <button className="live-text-button" onClick={downloadTemplate}><HiOutlineArrowDownTray /> Sample CSV</button>
              </div>
            </div>}
            {editorMode === "create" && <label className="live-file-drop">
              <HiOutlineArrowUpTray size={27} />
              <strong>{fileName || "Choose a CSV file to preview"}</strong>
              <span>We’ll match familiar column names, including aliases like “heading” for “title”.</span>
              <input type="file" accept=".csv,text/csv" onChange={handleSelectFile} />
            </label>}
            {editorMode === "edit" && saving && <div className="live-loading">Loading lesson…</div>}
            {matchedColumns && (
              <div className="live-column-matches">
                <strong>Matched columns</strong>
                <div>{Object.entries(matchedColumns).map(([field, column]) => <span key={field}>{field}: <b>{column}</b></span>)}</div>
              </div>
            )}
            {errors.length > 0 && (
              <div className="live-import-errors" role="alert">
                <strong>{editorMode === "edit" ? "Fix these lesson issues to continue" : "Fix these CSV issues to continue"}</strong>
                {errors.map((item, index) => <p key={`${item.row}-${item.field}-${index}`}>Row {item.row} · {item.field}: {item.message}</p>)}
              </div>
            )}
            {form.slides.length > 0 && (
              <div className="live-import-preview">
                <div className="live-preview-heading">
                  <div><span className="live-eyebrow">{editorMode === "edit" ? "EDIT LESSON" : "PREVIEW"} · {form.slides.length} SLIDES</span><h3>{editorMode === "edit" ? "Update lesson content and slides" : "Review and polish before saving"}</h3></div>
                  {editorMode === "edit" &&                   <div className="live-slide-edit-actions"><button className="live-secondary-button" onClick={addSlide} disabled={form.slides.length >= 200}><HiOutlinePlus /> Add slide</button><button className="live-delete-slide" onClick={deleteSelectedSlide} disabled={form.slides.length <= 1}><HiOutlineTrash /> Remove selected</button></div>}
                </div>
                <label className="live-edit-field">Lesson title<input value={form.title} onChange={(event) => setForm((previous) => ({ ...previous, title: event.target.value }))} /></label>
                <label className="live-edit-field">Description<textarea rows={2} value={form.description || ""} onChange={(event) => setForm((previous) => ({ ...previous, description: event.target.value }))} /></label>
                <div className="live-preview-slide-strip">
                  {form.slides.map((slide, index) => (
                    <button className={`live-preview-chip ${selectedSlideIndex === index ? "active" : ""}`} key={`${index}-${slide.title}`} onClick={() => setSelectedSlideIndex(index)}>
                      <span>{String(index + 1).padStart(2, "0")}</span>{slide.title || slide.type}
                    </button>
                  ))}
                </div>
                <div className="live-preview-workspace">
                  <LiveLessonSlide slide={activeSlide} index={0} total={form.slides.length} />
                  {activeSlide && (
                    <div className="live-preview-editors">
                      {editorMode === "edit" && (
                        <label className="live-edit-field">Slide type
                          <select value={activeSlide.type} onChange={(event) => changeSlideType(selectedSlideIndex, event.target.value)}>
                            {["opening", "goals", "content", "examples", "question", "activity", "exit-ticket"].map((type) => <option value={type} key={type}>{type.replace("-", " ")}</option>)}
                          </select>
                        </label>
                      )}
                      <label className="live-edit-field">Slide title<input value={activeSlide.title || ""} onChange={(event) => updateSlide(selectedSlideIndex, { title: event.target.value })} /></label>
                      <label className="live-edit-field">Slide content<textarea rows={3} value={activeSlide.body || ""} onChange={(event) => updateSlide(selectedSlideIndex, { body: event.target.value })} /></label>
                      {editorMode === "edit" && activeSlide.type === "examples" && (
                        <label className="live-edit-field">Examples (one per line)<textarea rows={3} value={(activeSlide.examples || []).join("\n")} onChange={(event) => updateSlide(selectedSlideIndex, { examples: event.target.value.split(/\r?\n/).filter((item) => item.trim()) })} /></label>
                      )}
                      {editorMode === "edit" && (
                        <>
                          <label className="live-edit-field">Image URL<input value={activeSlide.imageUrl || ""} onChange={(event) => updateSlide(selectedSlideIndex, { imageUrl: event.target.value })} placeholder="https://…" /></label>
                          <label className="live-edit-field">Teacher notes<textarea rows={2} value={activeSlide.speakerNotes || ""} onChange={(event) => updateSlide(selectedSlideIndex, { speakerNotes: event.target.value })} /></label>
                        </>
                      )}
                      {activeSlide.question && (
                        <div className="live-preview-question-editor">
                          {editorMode === "edit" && (
                            <label className="live-edit-field">Question type
                              <select value={activeSlide.question.kind} onChange={(event) => changeQuestionKind(selectedSlideIndex, event.target.value)}>
                                <option value="mcq">Multiple choice</option>
                                <option value="tf">True or false</option>
                              </select>
                            </label>
                          )}
                          <label className="live-edit-field">Student question<input value={activeSlide.question.prompt} onChange={(event) => updateQuestion(selectedSlideIndex, { prompt: event.target.value })} /></label>
                          {editorMode === "edit" && (
                            <>
                              {activeSlide.question.options.map((option, optionIndex) => (
                                <div className="live-option-editor" key={option.id}>
                                  <label className="live-edit-field">Option {option.id.toUpperCase()}
                                    <input value={option.text} onChange={(event) => updateQuestion(selectedSlideIndex, { options: activeSlide.question.options.map((item, index) => index === optionIndex ? { ...item, text: event.target.value } : item) })} />
                                  </label>
                                  {activeSlide.question.kind === "mcq" && activeSlide.question.options.length > 2 && <button type="button" className="live-remove-option" onClick={() => removeQuestionOption(selectedSlideIndex, option.id)}>Remove option</button>}
                                </div>
                              ))}
                              {activeSlide.question.kind === "mcq" && activeSlide.question.options.length < 6 && <button type="button" className="live-text-button live-add-option" onClick={() => addQuestionOption(selectedSlideIndex)}><HiOutlinePlus /> Add answer option</button>}
                              <label className="live-edit-field">Explanation<textarea rows={2} value={activeSlide.question.explanation || ""} onChange={(event) => updateQuestion(selectedSlideIndex, { explanation: event.target.value })} /></label>
                            </>
                          )}
                          <label className="live-edit-field">Correct answer<select value={activeSlide.question.correctOptionId} onChange={(event) => updateQuestion(selectedSlideIndex, { correctOptionId: event.target.value })}>{activeSlide.question.options.map((option) => <option key={option.id} value={option.id}>{option.text}</option>)}</select></label>
                        </div>
                      )}
                    </div>
                  )}
                </div>
                <div className="live-preview-note">Slide design, question answers, and explanation are stored in the lesson; answer keys stay hidden from students until the teacher reveals results.</div>
              </div>
            )}
            <footer className="live-import-footer">
              <button className="live-secondary-button" onClick={closeEditor} disabled={saving}>Cancel</button>
              <button className="live-primary-button" onClick={saveImportedLesson} disabled={saving || (editorMode === "create" && !selectedFile) || form.slides.length === 0 || !form.title.trim()}>{saving ? "Saving…" : editorMode === "edit" ? "Update lesson" : "Save lesson"}</button>
            </footer>
          </section>
        </div>
      )}
    </div>
  );
};

export default LiveLessonsPage;
