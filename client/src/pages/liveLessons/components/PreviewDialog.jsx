import LiveLessonSlide from "../../../components/liveLessons/LiveLessonSlide";
import { LIVE_QUESTION_KIND_LABELS } from "../../../utils/liveLessonQuestionDraft.js";
import { liveNumericRuleSummary } from "../utils/liveLessonPageUtils";

const PreviewDialog = ({
  previewLoading,
  previewLesson,
  previewError,
  previewSlideIndex,
  onSlideChange,
  onClose,
}) => {
  if (!previewLoading && !previewLesson && !previewError) return null;
  return (
    <div
      className="live-import-overlay"
      role="presentation"
      onClick={() => {
        if (!previewLoading) onClose();
      }}
    >
      <section
        className="live-preview-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="live-preview-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="live-import-header">
          <div>
            <span className="live-eyebrow">LESSON PREVIEW</span>
            <h2 id="live-preview-title">
              {previewLesson?.title || "Preview lesson"}
            </h2>
            {previewLesson?.description && (
              <p>{previewLesson.description}</p>
            )}
          </div>
          <button
            className="live-dialog-close"
            onClick={onClose}
            aria-label="Close lesson preview"
            disabled={previewLoading}
          >
            ×
          </button>
        </header>
        {previewLoading && (
          <p className="live-preview-status" role="status">
            Loading lesson preview…
          </p>
        )}
        {previewError && (
          <p className="live-preview-status live-preview-error" role="alert">
            {previewError}
          </p>
        )}
        {previewLesson &&
          (() => {
            const slides = previewLesson.slides || [];
            const slide = slides[previewSlideIndex];
            return (
              <>
                <div className="live-preview-slide-strip">
                  {slides.map((item, index) => (
                    <button
                      type="button"
                      className={`live-preview-chip ${previewSlideIndex === index ? "active" : ""}`}
                      key={`${index}-${item.title || item.type}`}
                      onClick={() => onSlideChange(index)}
                      aria-current={
                        previewSlideIndex === index ? "step" : undefined
                      }
                    >
                      <span>{String(index + 1).padStart(2, "0")}</span>
                      {item.title || item.type}
                    </button>
                  ))}
                </div>
                <div className="live-preview-dialog-content">
                  {slide ? (
                    <>
                      <LiveLessonSlide
                        slide={slide}
                        index={previewSlideIndex}
                        total={slides.length}
                        language={previewLesson.language}
                        allowScripts
                      />
                      {slide.question && (
                        <section className="live-preview-question">
                          <span className="live-eyebrow">
                            QUESTION ·{" "}
                            {LIVE_QUESTION_KIND_LABELS[slide.question.kind] ||
                              "Multiple choice"}
                          </span>
                          <h3>{slide.question.prompt}</h3>
                          {(slide.question.options || []).length > 0 && (
                            <ol type="A">
                              {slide.question.options.map((option) => (
                                <li
                                  key={option.id}
                                  className={
                                    option.id === slide.question.correctOptionId ||
                                    (slide.question.correctOptionIds || []).includes(option.id)
                                      ? "correct"
                                      : ""
                                  }
                                >
                                  {option.text}
                                  {(option.id === slide.question.correctOptionId ||
                                    (slide.question.correctOptionIds || []).includes(option.id)) && (
                                    <strong> · Correct answer</strong>
                                  )}
                                </li>
                              ))}
                            </ol>
                          )}
                          {(slide.question.matchingPairs || []).length > 0 && (
                            <ul className="live-preview-pairs">
                              {slide.question.matchingPairs.map((pair, pairIndex) => (
                                <li key={`pair-${pairIndex}`}>
                                  {pair.left} &rarr; {pair.right}
                                </li>
                              ))}
                            </ul>
                          )}
                          {(slide.question.orderingItems || []).length > 0 && (
                            <ol>
                              {slide.question.orderingItems.map((item, itemIndex) => (
                                <li key={item.id || `step-${itemIndex}`}>{item.text}</li>
                              ))}
                            </ol>
                          )}
                          {(slide.question.blanks || []).length > 0 && (
                            <ul className="live-preview-pairs">
                              {slide.question.blanks.map((blank) => (
                                <li key={blank.id}>
                                  {blank.id}: {(blank.accepts || []).join(" / ")}
                                </li>
                              ))}
                            </ul>
                          )}
                          {slide.question.numericRule && (
                            <p>
                              <strong>Answer:</strong>{" "}
                              {liveNumericRuleSummary(slide.question.numericRule)}
                            </p>
                          )}
                          {slide.question.guidance && (
                            <p>
                              <strong>Guidance:</strong> {slide.question.guidance}
                            </p>
                          )}
                          {slide.question.criteria && (
                            <p>
                              <strong>Marking criteria:</strong> {slide.question.criteria}
                            </p>
                          )}
                          {slide.question.explanation && (
                            <p>
                              <strong>Explanation:</strong>{" "}
                              {slide.question.explanation}
                            </p>
                          )}
                          {(slide.variants || []).length > 0 && (
                            <p className="live-preview-levels">
                              This slide also sends a levelled question to{" "}
                              {slide.variants.length}{" "}
                              {slide.variants.length === 1 ? "group" : "groups"} of this class.
                            </p>
                          )}
                        </section>
                      )}
                    </>
                  ) : (
                    <p className="live-preview-status">
                      This lesson has no slides to preview.
                    </p>
                  )}
                </div>
                <footer className="live-preview-navigation">
                  <span>
                    {slides.length
                      ? `Slide ${previewSlideIndex + 1} of ${slides.length}`
                      : "No slides"}
                  </span>
                  <div>
                    <button
                      type="button"
                      className="live-secondary-button"
                      disabled={previewSlideIndex <= 0}
                      onClick={() => onSlideChange(previewSlideIndex - 1)}
                    >
                      Previous
                    </button>
                    <button
                      type="button"
                      className="live-primary-button"
                      disabled={previewSlideIndex >= slides.length - 1}
                      onClick={() => onSlideChange(previewSlideIndex + 1)}
                    >
                      Next
                    </button>
                  </div>
                </footer>
              </>
            );
          })()}
      </section>
    </div>
  );
};

export default PreviewDialog;
