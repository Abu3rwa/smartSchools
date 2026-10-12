import { useCallback, useEffect, useMemo, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useNavigate } from "react-router-dom";
import { HiOutlineArrowDownTray, HiOutlineArrowUpTray, HiOutlinePlay, HiOutlinePlus, HiOutlinePresentationChartBar } from "react-icons/hi2";
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

const downloadAiPrompt = () => {
  const blob = new Blob([LIVE_LESSON_AI_PROMPT], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "live-lesson-ai-prompt.txt";
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
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [fileName, setFileName] = useState("");
  const [errors, setErrors] = useState([]);
  const [matchedColumns, setMatchedColumns] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [selectedSlideIndex, setSelectedSlideIndex] = useState(0);
  const [selectedFile, setSelectedFile] = useState("");
  const [lessonClasses, setLessonClasses] = useState({});
  const [error, setError] = useState("");

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

  const saveImportedLesson = async () => {
    if (!selectedFile) return;
    setSaving(true);
    setErrors([]);
    try {
      await api.post("/live/lessons", {
        title: form.title,
        description: form.description,
        slides: form.slides,
      });
      setImportOpen(false);
      setForm(emptyForm);
      setSelectedSlideIndex(0);
      setSelectedFile("");
      setMatchedColumns(null);
      await loadData();
    } catch (requestError) {
      setErrors(requestError.response?.data?.errors || [{
        row: 1,
        field: "import",
        message: requestError.response?.data?.message || "Could not import this lesson.",
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
              <button className="live-text-button" onClick={downloadAiPrompt}><HiOutlineArrowDownTray /> Get AI prompt + sample</button>
              <button className="live-primary-button" onClick={() => setImportOpen(true)}><HiOutlineArrowUpTray /> Import CSV lesson</button>
            </div>
          </div>
          {lessons.length === 0 ? (
            <div className="live-empty-state">
              <div className="live-empty-icon"><HiOutlinePresentationChartBar size={32} /></div>
              <h2>Start with a lesson you already teach</h2>
              <p>Import a CSV to create opening, teaching, example, question, activity, and exit-ticket slides. No AI generation required.</p>
              <button className="live-primary-button" onClick={() => setImportOpen(true)}><HiOutlinePlus /> Import your first lesson</button>
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
                  <button className="live-delete-lesson" onClick={() => deleteLesson(lesson._id)}>Delete lesson</button>
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
              </div>
            </article>
          ))}
        </div>
      )}

      {importOpen && (
        <div className="live-import-overlay" role="presentation" onClick={() => !saving && setImportOpen(false)}>
          <section className="live-import-dialog" role="dialog" aria-modal="true" aria-labelledby="live-import-title" onClick={(event) => event.stopPropagation()}>
            <header className="live-import-header">
              <div><span className="live-eyebrow">CSV LESSON BUILDER</span><h2 id="live-import-title">Import a lesson</h2></div>
              <button className="live-dialog-close" onClick={() => setImportOpen(false)} aria-label="Close import dialog">×</button>
            </header>
            <div className="live-import-toolbar">
              <p>Each row becomes a designed lesson slide. Question rows become answerable checks in the live session.</p>
              <div className="live-session-actions">
                <button className="live-text-button" onClick={downloadAiPrompt}><HiOutlineArrowDownTray /> AI prompt</button>
                <button className="live-text-button" onClick={downloadTemplate}><HiOutlineArrowDownTray /> Sample CSV</button>
              </div>
            </div>
            <label className="live-file-drop">
              <HiOutlineArrowUpTray size={27} />
              <strong>{fileName || "Choose a CSV file to preview"}</strong>
              <span>We’ll match familiar column names, including aliases like “heading” for “title”.</span>
              <input type="file" accept=".csv,text/csv" onChange={handleSelectFile} />
            </label>
            {matchedColumns && (
              <div className="live-column-matches">
                <strong>Matched columns</strong>
                <div>{Object.entries(matchedColumns).map(([field, column]) => <span key={field}>{field}: <b>{column}</b></span>)}</div>
              </div>
            )}
            {errors.length > 0 && (
              <div className="live-import-errors" role="alert">
                <strong>Fix these CSV issues to continue</strong>
                {errors.map((item, index) => <p key={`${item.row}-${item.field}-${index}`}>Row {item.row} · {item.field}: {item.message}</p>)}
              </div>
            )}
            {form.slides.length > 0 && (
              <div className="live-import-preview">
                <div className="live-preview-heading"><div><span className="live-eyebrow">PREVIEW · {form.slides.length} SLIDES</span><h3>Review and polish before saving</h3></div></div>
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
                      <label className="live-edit-field">Slide title<input value={activeSlide.title || ""} onChange={(event) => updateSlide(selectedSlideIndex, { title: event.target.value })} /></label>
                      <label className="live-edit-field">Slide content<textarea rows={3} value={activeSlide.body || ""} onChange={(event) => updateSlide(selectedSlideIndex, { body: event.target.value })} /></label>
                      {activeSlide.question && (
                        <div className="live-preview-question-editor">
                          <label className="live-edit-field">Student question<input value={activeSlide.question.prompt} onChange={(event) => updateQuestion(selectedSlideIndex, { prompt: event.target.value })} /></label>
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
              <button className="live-secondary-button" onClick={() => setImportOpen(false)} disabled={saving}>Cancel</button>
              <button className="live-primary-button" onClick={saveImportedLesson} disabled={saving || form.slides.length === 0 || !form.title.trim()}>{saving ? "Importing…" : "Save lesson"}</button>
            </footer>
          </section>
        </div>
      )}
    </div>
  );
};

export default LiveLessonsPage;
