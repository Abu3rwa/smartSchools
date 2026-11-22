import { useLayoutEffect, useRef, useState } from "react";
import LiveLessonSlide from "../../../components/liveLessons/LiveLessonSlide";

const CANVAS_WIDTH = 1120;

const BLANK_TOKEN = /\{\{\s*(?:blank:)?\s*[A-Za-z0-9_-]+\s*\}\}/;

const hashText = (value) => {
  let hash = 0;
  for (const char of String(value)) hash = (hash * 31 + char.charCodeAt(0)) | 0;
  return hash;
};

/** Students get a shuffled column or list; the preview mimics that without server seeds. */
const previewShuffle = (rows, seed, key) =>
  rows
    .map((row, index) => ({ row, order: hashText(`${seed}:${index}:${row[key] || ""}`) }))
    .sort((a, b) => a.order - b.order)
    .map((entry) => entry.row);

const renderBlankPrompt = (prompt, t) =>
  String(prompt || "")
    .split(/(\{\{\s*(?:blank:)?\s*[A-Za-z0-9_-]+\s*\}\})/g)
    .map((part, index) =>
      BLANK_TOKEN.test(part) ? (
        <span className="llb-blank-slot" key={index} aria-label={t("slides.blankLabel")} />
      ) : (
        <span key={index}>{part}</span>
      ),
    );

const QuestionPreview = ({ question, t }) => {
  const kind = question?.kind || "mcq";
  const prompt = question?.prompt ? (
    <p className="llb-question-prompt" dir="auto">{question.prompt}</p>
  ) : null;

  if (kind === "matching") {
    const pairs = (question.matchingPairs || []).filter((pair) => pair?.left || pair?.right);
    const matches = previewShuffle(pairs, "match", "right");
    return (
      <div className="llb-question-advanced">
        {prompt}
        <div className="llb-match-grid">
          <div className="llb-match-column">
            {pairs.map((pair, index) => (
              <span key={`term-${index}`} dir="auto">{pair.left}</span>
            ))}
          </div>
          <div className="llb-match-column is-muted">
            {matches.map((pair, index) => (
              <span key={`match-${index}`} dir="auto">{pair.right}</span>
            ))}
          </div>
        </div>
        <p className="llb-question-hint">
          {t("slides.matchingHint")} {t("slides.shuffledNote")}
        </p>
      </div>
    );
  }

  if (kind === "ordering") {
    const steps = previewShuffle(
      (question.orderingItems || []).filter((step) => step?.text),
      "order",
      "text",
    );
    return (
      <div className="llb-question-advanced">
        {prompt}
        <ol className="llb-question-order">
          {steps.map((step, index) => (
            <li key={`step-${index}`} dir="auto">{step.text}</li>
          ))}
        </ol>
        <p className="llb-question-hint">
          {t("slides.orderingHint")} {t("slides.shuffledNote")}
        </p>
      </div>
    );
  }

  if (kind === "fill_in_blank") {
    return (
      <div className="llb-question-advanced">
        <p className="llb-question-prompt" dir="auto">
          {renderBlankPrompt(question.prompt, t)}
        </p>
        <p className="llb-question-hint">{t("slides.fillBlankHint")}</p>
      </div>
    );
  }

  if (kind === "numeric" || kind === "text") {
    return (
      <div className="llb-question-advanced">
        {prompt}
        <div
          className={kind === "numeric" ? "llb-numeric-slot" : "llb-written-slot"}
          aria-hidden="true"
        />
        <p className="llb-question-hint">
          {kind === "numeric" ? t("slides.numericHint") : t("slides.textHint")}
        </p>
      </div>
    );
  }

  const options = Array.isArray(question?.options) ? question.options : [];
  const hint =
    kind === "tf"
      ? t("slides.tfHint")
      : kind === "multi_select"
        ? t("slides.multiSelectHint")
        : t("slides.mcqHint");
  return (
    <div className="llb-question-options">
      {prompt}
      {options.map((option, index) => (
        <div className="llb-question-option" key={option.id || index}>
          {kind !== "tf" && (
            <span className="llb-question-letter">
              {String.fromCharCode(65 + index)}
            </span>
          )}
          <span>{option.text}</span>
        </div>
      ))}
      <p className="llb-question-hint">{hint}</p>
    </div>
  );
};

/**
 * The preview is the real slide renderer, scaled down from its fixed 16:9
 * canvas. Measuring the wrapper keeps the student view honest at every width
 * instead of giving the wizard a second, prettier slide layout.
 */
const BuilderSlidePreview = ({ slide, index, total, language, itemStatus, t }) => {
  const frameRef = useRef(null);
  const [scale, setScale] = useState(0.5);

  useLayoutEffect(() => {
    const node = frameRef.current;
    if (!node) return undefined;
    const measure = () => {
      const width = node.getBoundingClientRect().width;
      if (width > 0) setScale(width / CANVAS_WIDTH);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [slide]);

  if (!slide) {
    const status = ["failed", "stale", "generating"].includes(itemStatus)
      ? itemStatus
      : "waiting";
    return (
      <div className="llb-preview-surface">
        <div className="llb-preview-empty">
          <strong>{t(`slides.${status}`)}</strong>
          <p>{t(`slides.${status}Slide`)}</p>
        </div>
      </div>
    );
  }

  // A question whose title repeats the prompt would render it twice, and a
  // fill-in-the-blank title can hold raw {{b1}} tokens; the body shows both.
  const promptText = String(slide.question?.prompt || "").trim();
  const titleText = String(slide.title || "").trim();
  const viewSlide =
    slide.type === "question" &&
    (!titleText || BLANK_TOKEN.test(titleText) || titleText === promptText)
      ? { ...slide, title: "" }
      : slide;

  return (
    <div className="llb-preview-surface">
      <div className="llb-preview-frame" ref={frameRef}>
        <div
          className="llb-slide-canvas"
          style={{ transform: `scale(${scale})` }}
        >
          <LiveLessonSlide
            slide={viewSlide}
            index={index}
            total={total}
            language={language}
            hideHtmlHeader={slide.type === "html"}
          >
            {slide.type === "question" && (
              <QuestionPreview question={slide.question} t={t} />
            )}
          </LiveLessonSlide>
        </div>
      </div>
    </div>
  );
};

export default BuilderSlidePreview;
