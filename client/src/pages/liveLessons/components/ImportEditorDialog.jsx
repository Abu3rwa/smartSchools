import {
  HiOutlineArrowDownTray,
  HiOutlineArrowUpTray,
  HiOutlineCheck,
  HiOutlineClipboardDocument,
  HiOutlinePlus,
  HiOutlineTrash,
} from "react-icons/hi2";
import LiveLessonSlide from "../../../components/liveLessons/LiveLessonSlide";
import LiveQuestionEditor from "../../../components/liveLessons/LiveQuestionEditor";
import QuestionTypeGuide from "../../../components/assessment/QuestionTypeGuide";
import { downloadTemplate } from "../utils/liveLessonPageUtils";

const ImportEditorDialog = ({
  open,
  editorMode,
  saving,
  onClose,
  onCopyAiPrompt,
  promptCopied,
  fileName,
  hasSelectedFile,
  onSelectFile,
  errors,
  form,
  setForm,
  classes,
  editorSubjects,
  activeSlide,
  selectedSlideIndex,
  onSelectSlide,
  onAddSlide,
  onDeleteSelectedSlide,
  onChangeSlideType,
  onUpdateSlide,
  onSave,
}) => {
  if (!open) return null;
  return (
    <div
      className="live-import-overlay"
      role="presentation"
      onClick={onClose}
    >
      <section
        className="live-import-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="live-import-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="live-import-header">
          <div>
            <span className="live-eyebrow">
              {editorMode === "edit"
                ? "LESSON EDITOR"
                : "CSV LESSON BUILDER"}
            </span>
            <h2 id="live-import-title">
              {editorMode === "edit" ? "Edit lesson" : "Import a lesson"}
            </h2>
          </div>
          <button
            className="live-dialog-close"
            onClick={onClose}
            aria-label="Close lesson editor"
            disabled={saving}
          >
            ×
          </button>
        </header>
        {editorMode === "create" && (
          <div className="live-import-toolbar">
            <div className="live-session-actions">
              <button className="live-text-button" onClick={onCopyAiPrompt}>
                {promptCopied ? (
                  <HiOutlineCheck />
                ) : (
                  <HiOutlineClipboardDocument />
                )}
                {promptCopied ? "Copied" : "Copy AI prompt"}
              </button>
              <button className="live-text-button" onClick={downloadTemplate}>
                <HiOutlineArrowDownTray /> Sample CSV
              </button>
              <QuestionTypeGuide flow="live" className="live-text-button" />
            </div>
          </div>
        )}
        {editorMode === "create" && (
          <label className="live-file-drop">
            <HiOutlineArrowUpTray size={27} />
            <strong>{fileName || "Choose a CSV file to preview"}</strong>
            <span>
              Import standard lesson CSVs or a portable CSV exported from a
              Live Lesson. Portable files preserve slides and metadata;
              class/subject assignments are matched to this school.
            </span>
            <input
              type="file"
              accept=".csv,text/csv"
              onChange={onSelectFile}
            />
          </label>
        )}
        {editorMode === "edit" && saving && (
          <div className="live-loading">Loading lesson…</div>
        )}
        {errors.length > 0 && (
          <div className="live-import-errors" role="alert">
            <strong>
              {editorMode === "edit"
                ? "Fix these lesson issues to continue"
                : "Fix these CSV issues to continue"}
            </strong>
            {errors.map((item, index) => (
              <p key={`${item.row}-${item.field}-${index}`}>
                Row {item.row} · {item.field}: {item.message}
              </p>
            ))}
          </div>
        )}
        {form.slides.length > 0 && (
          <div className="live-import-preview">
            <div className="live-preview-heading">
              <div>
                <span className="live-eyebrow">
                  {editorMode === "edit" ? "EDIT LESSON" : "PREVIEW"} ·{" "}
                  {form.slides.length} SLIDES
                </span>
                <h3>
                  {editorMode === "edit"
                    ? "Update lesson content and slides"
                    : "Review and polish before saving"}
                </h3>
              </div>
              {editorMode === "edit" && (
                <div className="live-slide-edit-actions">
                  <button
                    className="live-secondary-button"
                    onClick={onAddSlide}
                    disabled={form.slides.length >= 200}
                  >
                    <HiOutlinePlus /> Add slide
                  </button>
                  <button
                    className="live-delete-slide"
                    onClick={onDeleteSelectedSlide}
                    disabled={form.slides.length <= 1}
                  >
                    <HiOutlineTrash /> Remove selected
                  </button>
                </div>
              )}
            </div>
            <label className="live-edit-field">
              Lesson title
              <input
                value={form.title}
                onChange={(event) =>
                  setForm((previous) => ({
                    ...previous,
                    title: event.target.value,
                  }))
                }
              />
            </label>
            <label className="live-edit-field">
              Description
              <textarea
                rows={4}
                value={form.description || ""}
                onChange={(event) =>
                  setForm((previous) => ({
                    ...previous,
                    description: event.target.value,
                  }))
                }
              />
            </label>
            <div className="live-lesson-metadata-fields">
              {form.importHints && (
                <p className="live-import-assignment-hint">
                  Exported assignment: {form.importHints.assignedClass || "No class"} · {form.importHints.assignedSubject || "No subject"}.
                  Choose the destination class and subject below; matching assignments were selected when available.
                </p>
              )}
              <label className="live-edit-field">
                Assigned class
                <select
                  value={form.classId}
                  onChange={(event) =>
                    setForm((previous) => ({
                      ...previous,
                      classId: event.target.value,
                      subjectId: "",
                      subject: "",
                    }))
                  }
                >
                  <option value="">Choose a class…</option>
                  {classes.map((classItem) => (
                    <option key={classItem._id} value={classItem._id}>
                      {classItem.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="live-edit-field">
                Class subject
                <select
                  value={form.subjectId}
                  disabled={!form.classId}
                  onChange={(event) => {
                    const selectedSubject = editorSubjects.find(
                      (item) => String(item._id) === event.target.value,
                    );
                    setForm((previous) => ({
                      ...previous,
                      subjectId: event.target.value,
                      subject: selectedSubject?.name || "",
                    }));
                  }}
                >
                  <option value="">
                    {form.classId
                      ? "Choose a subject…"
                      : "Choose a class first"}
                  </option>
                  {editorSubjects.map((subject) => (
                    <option key={subject._id} value={subject._id}>
                      {subject.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="live-edit-field">
                Grade
                <input
                  value={form.grade || ""}
                  onChange={(event) =>
                    setForm((previous) => ({
                      ...previous,
                      grade: event.target.value,
                    }))
                  }
                />
              </label>
              <label className="live-edit-field">
                Language
                <input
                  value={form.language || "en"}
                  onChange={(event) =>
                    setForm((previous) => ({
                      ...previous,
                      language: event.target.value,
                    }))
                  }
                />
              </label>
            </div>
            <div className="live-preview-slide-strip">
              {form.slides.map((slide, index) => (
                <button
                  className={`live-preview-chip ${selectedSlideIndex === index ? "active" : ""}`}
                  key={`${index}-${slide.title}`}
                  onClick={() => onSelectSlide(index)}
                >
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  {slide.title || slide.type}
                </button>
              ))}
            </div>
            <div className="live-preview-workspace">
              <LiveLessonSlide
                slide={activeSlide}
                index={selectedSlideIndex}
                total={form.slides.length}
                language={form.language}
              />
              {activeSlide && (
                <div className="live-preview-editors">
                  {editorMode === "edit" && (
                    <label className="live-edit-field">
                      Slide type
                      <select
                        value={activeSlide.type}
                        onChange={(event) =>
                          onChangeSlideType(
                            selectedSlideIndex,
                            event.target.value,
                          )
                        }
                      >
                        {[
                          "opening",
                          "goals",
                          "content",
                          "examples",
                          "html",
                          "question",
                          "activity",
                          "exit-ticket",
                        ].map((type) => (
                          <option value={type} key={type}>
                            {type.replace("-", " ")}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                  <label className="live-edit-field">
                    Slide title
                    <input
                      value={activeSlide.title || ""}
                      onChange={(event) =>
                        onUpdateSlide(selectedSlideIndex, {
                          title: event.target.value,
                        })
                      }
                    />
                  </label>
                  {activeSlide.type === "html" ? (
                    <label className="live-edit-field">
                      Slide HTML
                      <textarea
                        rows={12}
                        value={activeSlide.html || ""}
                        onChange={(event) =>
                          onUpdateSlide(selectedSlideIndex, {
                            html: event.target.value,
                          })
                        }
                      />
                    </label>
                  ) : (
                    <label className="live-edit-field">
                      Slide content
                      <textarea
                        rows={3}
                        value={activeSlide.body || ""}
                        onChange={(event) =>
                          onUpdateSlide(selectedSlideIndex, {
                            body: event.target.value,
                          })
                        }
                      />
                    </label>
                  )}
                  {editorMode === "edit" &&
                    activeSlide.type === "examples" && (
                      <label className="live-edit-field">
                        Examples (one per line)
                        <textarea
                          rows={3}
                          value={(activeSlide.examples || []).join("\n")}
                          onChange={(event) =>
                            onUpdateSlide(selectedSlideIndex, {
                              examples: event.target.value
                                .split(/\r?\n/)
                                .filter((item) => item.trim()),
                            })
                          }
                        />
                      </label>
                    )}
                  {editorMode === "edit" && (
                    <>
                      <label className="live-edit-field">
                        Image URL
                        <input
                          value={activeSlide.imageUrl || ""}
                          onChange={(event) =>
                            onUpdateSlide(selectedSlideIndex, {
                              imageUrl: event.target.value,
                            })
                          }
                          placeholder="https://…"
                        />
                      </label>
                      <label className="live-edit-field">
                        Teacher notes
                        <textarea
                          rows={4}
                          value={activeSlide.speakerNotes || ""}
                          onChange={(event) =>
                            onUpdateSlide(selectedSlideIndex, {
                              speakerNotes: event.target.value,
                            })
                          }
                        />
                      </label>
                    </>
                  )}
                  {activeSlide.question && (
                    <LiveQuestionEditor
                      question={activeSlide.question}
                      onChange={(question) =>
                        onUpdateSlide(selectedSlideIndex, { question })
                      }
                    />
                  )}
                </div>
              )}
            </div>
            <div className="live-preview-note">
              Slide design, question answers, and explanation are stored in
              the lesson; answer keys stay hidden from students until the
              teacher reveals results.
            </div>
          </div>
        )}
        <footer className="live-import-footer">
          <button
            className="live-secondary-button"
            onClick={onClose}
            disabled={saving}
          >
            Cancel
          </button>
          <button
            className="live-primary-button"
            onClick={onSave}
            disabled={
              saving ||
              (editorMode === "create" &&
                (!hasSelectedFile || !form.classId || !form.subjectId)) ||
              form.slides.length === 0 ||
              !form.title.trim()
            }
          >
            {saving
              ? "Saving…"
              : editorMode === "edit"
                ? "Update lesson"
                : "Save lesson"}
          </button>
        </footer>
      </section>
    </div>
  );
};

export default ImportEditorDialog;
