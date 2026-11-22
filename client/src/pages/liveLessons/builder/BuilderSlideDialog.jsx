import { useMemo, useState } from "react";
import {
  HiOutlineArrowDown,
  HiOutlineArrowUp,
  HiOutlinePlus,
  HiOutlineXMark,
} from "react-icons/hi2";
import {
  AI_SINGLE_LINE_ROLES,
  BUILDER_LIMITS,
  errorCopy,
} from "./liveLessonBuilderForm.js";
import { useFeatureNamespaces } from "../../../i18n/useFeatureNamespaces";
import {
  buildLiveQuestionPayload,
  liveBlankIds,
  livePairLimit,
  liveStepLimit,
  moveLiveOrderingItem,
} from "../../../utils/liveLessonQuestionDraft.js";
import BuilderDialog from "./BuilderDialog.jsx";

const linesOf = (text) =>
  String(text || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

const makeOptionId = () => `o${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;

const SLOT_ID_PATTERN = /^[a-z][a-z0-9-]{0,39}$/;

const escapeHtml = (value) => String(value)
  .replace(/&/g, "&amp;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;")
  .replace(/'/g, "&#39;");

/**
 * The stored page is the preview: the same document the student sees, with the
 * edited text injected locally and the focused slot outlined. Nothing here is
 * saved; the server rebuilds the real document from the same text map.
 */
const withEditedTexts = (html, texts, activeSlot) => {
  if (!html) return "";
  const doc = new DOMParser().parseFromString(html, "text/html");
  doc.querySelectorAll("[data-text]").forEach((node) => {
    const id = node.getAttribute("data-text");
    if (!(id in texts)) return;
    node.innerHTML = escapeHtml(texts[id]).replace(/\r?\n/g, "<br>");
  });
  if (activeSlot && SLOT_ID_PATTERN.test(activeSlot)) {
    const style = doc.createElement("style");
    style.textContent = `[data-text="${activeSlot}"]{outline:3px solid #fbbf24 !important;outline-offset:5px;border-radius:6px}`;
    doc.head.appendChild(style);
  }
  return `<!doctype html>${doc.documentElement.outerHTML}`;
};

const slotRoleLabel = (t, slot, labels) => {
  if (labels.count > 1) {
    return `${t(`dialogs.slide.slotRoles.${slot.role}`)} ${labels.index}`;
  }
  return t(`dialogs.slide.slotRoles.${slot.role}`);
};

const AiSlideEditor = ({ item, onClose, onSaveTexts }) => {
  const { t } = useFeatureNamespaces("liveLessonBuilder");
  const content = item.content || {};
  const slots = useMemo(
    () => (Array.isArray(content.slots) ? content.slots : []),
    // The slot list belongs to this revision of the page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [item.itemId, item.rev],
  );
  // Labels number only roles that appear more than once ("Main 1", "Main 2").
  const slotNumbers = useMemo(() => {
    const totals = {};
    slots.forEach((slot) => {
      totals[slot.role] = (totals[slot.role] || 0) + 1;
    });
    const seen = {};
    const labels = {};
    slots.forEach((slot) => {
      seen[slot.role] = (seen[slot.role] || 0) + 1;
      labels[slot.id] = { count: totals[slot.role], index: seen[slot.role] };
    });
    return labels;
  }, [slots]);
  const [texts, setTexts] = useState(() => {
    const map = {};
    slots.forEach((slot) => {
      map[slot.id] = String(content.texts?.[slot.id] || "");
    });
    return map;
  });
  const [activeSlot, setActiveSlot] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const previewHtml = useMemo(
    () => withEditedTexts(content.html, texts, activeSlot),
    [content.html, texts, activeSlot],
  );

  const setSlotText = (slotId, value) =>
    setTexts((current) => ({ ...current, [slotId]: value }));

  const submit = async (event) => {
    event.preventDefault();
    const empty = slots.find((slot) => !String(texts[slot.id] || "").trim());
    if (empty) {
      setError(t("dialogs.slide.slotRequired"));
      return;
    }
    setSaving(true);
    setError("");
    try {
      await onSaveTexts(texts);
    } catch (saveError) {
      setError(errorCopy(t, saveError));
      setSaving(false);
    }
  };

  return (
    <BuilderDialog
      wide
      title={t("dialogs.slide.editTitle")}
      subtitle={t("dialogs.slide.aiCopy")}
      onClose={onClose}
      footer={
        <>
          <span className="llb-spacer" />
          <button
            type="button"
            className="llb-btn llb-btn-ghost"
            disabled={saving}
            onClick={onClose}
          >
            {t("dialogs.slide.cancel")}
          </button>
          <button
            type="submit"
            form="llb-ai-slide-form"
            className="llb-btn llb-btn-primary"
            disabled={saving}
          >
            {saving ? t("dialogs.slide.saving") : t("dialogs.slide.save")}
          </button>
        </>
      }
    >
      <form id="llb-ai-slide-form" className="llb-ai-editor" onSubmit={submit}>
        {error && (
          <div className="llb-banner is-error" role="alert">
            {error}
          </div>
        )}
        <div className="llb-ai-preview">
          <iframe
            title={t("dialogs.slide.aiPreview")}
            sandbox=""
            referrerPolicy="no-referrer"
            srcDoc={previewHtml}
          />
        </div>
        <div className="llb-ai-fields">
          {slots.map((slot) => {
            const label = slotRoleLabel(t, slot, slotNumbers[slot.id] || { count: 1, index: 1 });
            const singleLine = AI_SINGLE_LINE_ROLES.includes(slot.role);
            const fieldId = `llb-ai-slot-${slot.id}`;
            return (
              <div className="llb-field-block" key={slot.id}>
                <label className="llb-field-label" htmlFor={fieldId}>
                  {label}
                </label>
                {singleLine ? (
                  <input
                    id={fieldId}
                    className="llb-input"
                    value={texts[slot.id] || ""}
                    maxLength={BUILDER_LIMITS.aiSlotChars}
                    onFocus={() => setActiveSlot(slot.id)}
                    onBlur={() => setActiveSlot("")}
                    onChange={(event) => setSlotText(slot.id, event.target.value)}
                  />
                ) : (
                  <textarea
                    id={fieldId}
                    className="llb-textarea"
                    rows={3}
                    value={texts[slot.id] || ""}
                    maxLength={BUILDER_LIMITS.aiSlotChars}
                    onFocus={() => setActiveSlot(slot.id)}
                    onBlur={() => setActiveSlot("")}
                    onChange={(event) => setSlotText(slot.id, event.target.value)}
                  />
                )}
              </div>
            );
          })}
        </div>
      </form>
    </BuilderDialog>
  );
};

const BuilderSlideDialog = ({ item, previewQuestion = null, onClose, onSave, onSaveTexts }) => {
  const aiSlide = item.kind === "slide" && item.content?.aiHtml === true;
  if (aiSlide) {
    return (
      <AiSlideEditor item={item} onClose={onClose} onSaveTexts={onSaveTexts} />
    );
  }
  return (
    <SlideFormDialog
      item={item}
      previewQuestion={previewQuestion}
      onClose={onClose}
      onSave={onSave}
    />
  );
};

const SlideFormDialog = ({ item, previewQuestion, onClose, onSave }) => {
  const { t } = useFeatureNamespaces("liveLessonBuilder");
  const isQuestion = item.kind === "question";
  const stored = item.content?.question || {};
  const questionKind = item.questionKind || stored.kind || "mcq";
  const optionKind = ["mcq", "tf", "multi_select"].includes(questionKind);
  const seeded = stored.options?.length ? stored : previewQuestion || {};
  const initialOptions = useMemo(() => {
    if (questionKind === "tf") {
      return [
        { id: "true", text: t("dialogs.slide.true") },
        { id: "false", text: t("dialogs.slide.false") },
      ];
    }
    const rows = Array.isArray(seeded.options) ? seeded.options : [];
    if (rows.length) return rows.map((row) => ({ id: row.id, text: row.text }));
    return [
      { id: "a", text: "" },
      { id: "b", text: "" },
    ];
    // Translation changes should not reset the teacher's edits.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.itemId]);
  const [title, setTitle] = useState(item.content?.title || item.outline?.title || "");
  const [body, setBody] = useState(item.content?.body || "");
  const [examples, setExamples] = useState(
    Array.isArray(item.content?.examples) ? item.content.examples.join("\n") : "",
  );
  const [notes, setNotes] = useState(item.content?.speakerNotes || "");
  const [prompt, setPrompt] = useState(
    stored.prompt || seeded.prompt || item.outline?.title || "",
  );
  const [explanation, setExplanation] = useState(
    stored.explanation || seeded.explanation || "",
  );
  const [evidence, setEvidence] = useState(item.content?.evidence || "");
  const [options, setOptions] = useState(initialOptions);
  const [correctOptionId, setCorrectOptionId] = useState(
    stored.correctOptionId || seeded.correctOptionId || "",
  );
  const [correctOptionIds, setCorrectOptionIds] = useState(
    stored.correctOptionIds?.length
      ? stored.correctOptionIds
      : seeded.correctOptionIds || [],
  );
  const [pairs, setPairs] = useState(() =>
    Array.isArray(stored.matchingPairs) && stored.matchingPairs.length
      ? stored.matchingPairs.map((pair) => ({ left: pair?.left || "", right: pair?.right || "" }))
      : [{ left: "", right: "" }, { left: "", right: "" }],
  );
  const [steps, setSteps] = useState(() =>
    Array.isArray(stored.orderingItems) && stored.orderingItems.length
      ? stored.orderingItems.map((row) => ({ id: row?.id || "", text: row?.text || "" }))
      : [{ id: "", text: "" }, { id: "", text: "" }, { id: "", text: "" }],
  );
  const [blankAccepts, setBlankAccepts] = useState(() => {
    const map = {};
    (Array.isArray(stored.blanks) ? stored.blanks : []).forEach((blank) => {
      map[blank?.id] = (Array.isArray(blank?.accepts) ? blank.accepts : []).join("~");
    });
    return map;
  });
  const [numericRule, setNumericRule] = useState(() => ({
    mode: "exact",
    value: "",
    min: "",
    max: "",
    tolerance: "",
    unit: "",
    ...(stored.numericRule || {}),
  }));
  const [guidance, setGuidance] = useState(stored.guidance || "");
  const [criteria, setCriteria] = useState(stored.criteria || "");
  const [minWords, setMinWords] = useState(stored.minWords || 0);
  const [maxWords, setMaxWords] = useState(stored.maxWords || 0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const multi = questionKind === "multi_select";
  const blankIds = useMemo(() => liveBlankIds(prompt), [prompt]);

  const setOptionText = (id, text) =>
    setOptions((rows) => rows.map((row) => (row.id === id ? { ...row, text } : row)));

  const addOption = () => {
    if (options.length >= 6) return;
    setOptions((rows) => [...rows, { id: makeOptionId(), text: "" }]);
  };

  const removeOption = (id) => {
    setOptions((rows) => rows.filter((row) => row.id !== id));
    setCorrectOptionId((current) => (current === id ? "" : current));
    setCorrectOptionIds((current) => current.filter((row) => row !== id));
  };

  const toggleCorrect = (id, checked) => {
    if (multi) {
      setCorrectOptionIds((current) =>
        checked ? [...new Set([...current, id])] : current.filter((row) => row !== id),
      );
      return;
    }
    setCorrectOptionId(checked ? id : "");
  };

  const patchPair = (index, change) =>
    setPairs((rows) =>
      rows.map((row, rowIndex) => (rowIndex === index ? { ...row, ...change } : row)),
    );
  const patchStep = (index, change) =>
    setSteps((rows) =>
      rows.map((row, rowIndex) => (rowIndex === index ? { ...row, ...change } : row)),
    );
  const patchRule = (change) => setNumericRule((rule) => ({ ...rule, ...change }));

  const submit = async (event) => {
    event.preventDefault();
    let validation = "";
    if (isQuestion) {
      const filled = options.filter((option) => option.text.trim());
      if (!prompt.trim()) {
        validation = t("dialogs.slide.requiredPrompt");
      } else if (questionKind === "matching") {
        const complete = pairs.filter((pair) => pair.left.trim() && pair.right.trim());
        const terms = complete.map((pair) => pair.left.trim().toLowerCase());
        if (complete.length < livePairLimit.min) {
          validation = t("dialogs.slide.requiredPairs");
        } else if (new Set(terms).size !== terms.length) {
          validation = t("dialogs.slide.duplicateTerm");
        }
      } else if (questionKind === "ordering") {
        if (steps.filter((step) => step.text.trim()).length < liveStepLimit.min) {
          validation = t("dialogs.slide.requiredSteps");
        }
      } else if (questionKind === "fill_in_blank") {
        if (!blankIds.length) {
          validation = t("dialogs.slide.missingBlank");
        } else if (blankIds.some((id) => !String(blankAccepts[id] || "").trim())) {
          validation = t("dialogs.slide.requiredBlankAnswers");
        }
      } else if (questionKind === "numeric") {
        if (numericRule.mode === "range") {
          if (!String(numericRule.min || "").trim() || !String(numericRule.max || "").trim()) {
            validation = t("dialogs.slide.requiredNumericRange");
          }
        } else if (!String(numericRule.value || "").trim()) {
          validation = t("dialogs.slide.requiredNumeric");
        } else if (
          ["tolerance", "relative"].includes(numericRule.mode) &&
          !String(numericRule.tolerance || "").trim()
        ) {
          validation = t("dialogs.slide.requiredNumericTolerance");
        }
      } else if (questionKind === "text") {
        if (Number(maxWords) > 0 && Number(minWords) > Number(maxWords)) {
          validation = t("dialogs.slide.wordOrder");
        }
      } else if (questionKind !== "tf" && filled.length < 2) {
        validation = t("dialogs.slide.requiredOptions");
      } else if (multi && correctOptionIds.length < 2) {
        validation = t("dialogs.slide.requiredOptionsMulti");
      } else if (!multi && !correctOptionId) {
        validation = t("dialogs.slide.requiredOptions");
      }
    } else if (!title.trim()) {
      validation = t("dialogs.slide.requiredTitle");
    } else if (!body.trim() && !linesOf(examples).length) {
      validation = t("dialogs.slide.requiredBody");
    } else if (item.slideType === "examples" && linesOf(examples).length < 2) {
      validation = t("dialogs.slide.requiredExamples");
    }
    if (validation) {
      setError(validation);
      return;
    }

    const content = isQuestion
      ? {
          ...(item.content || {}),
          evidence: evidence.trim(),
          question: buildLiveQuestionPayload({
            ...stored,
            kind: questionKind,
            prompt: prompt.trim(),
            explanation: explanation.trim(),
            options: optionKind
              ? options
                .filter((option) => option.text.trim())
                .map((option) => ({ id: option.id, text: option.text.trim() }))
              : [],
            correctOptionId: ["mcq", "tf"].includes(questionKind) ? correctOptionId : "",
            correctOptionIds: multi ? correctOptionIds : [],
            matchingPairs: pairs.map((pair) => ({
              left: pair.left.trim(),
              right: pair.right.trim(),
            })),
            orderingItems: steps.map((step) => ({ id: step.id, text: step.text.trim() })),
            blanks: blankIds.map((id) => ({ id, acceptsText: String(blankAccepts[id] || "") })),
            numericRule: questionKind === "numeric" ? numericRule : undefined,
            guidance: questionKind === "text" ? guidance.trim() : "",
            criteria: questionKind === "text" ? criteria.trim() : "",
            minWords: questionKind === "text" ? Number(minWords) || 0 : 0,
            maxWords: questionKind === "text" ? Number(maxWords) || 0 : 0,
          }),
        }
      : {
          ...(item.content || {}),
          title: title.trim(),
          body: body.trim(),
          examples: item.slideType === "examples" ? linesOf(examples) : [],
          speakerNotes: notes.trim(),
        };

    setSaving(true);
    setError("");
    try {
      await onSave(content);
    } catch (saveError) {
      setError(errorCopy(t, saveError));
      setSaving(false);
    }
  };

  return (
    <BuilderDialog
      wide
      title={t("dialogs.slide.editTitle")}
      subtitle={t("dialogs.slide.copy")}
      onClose={onClose}
      footer={
        <>
          <span className="llb-spacer" />
          <button
            type="button"
            className="llb-btn llb-btn-ghost"
            disabled={saving}
            onClick={onClose}
          >
            {t("dialogs.slide.cancel")}
          </button>
          <button
            type="submit"
            form="llb-slide-form"
            className="llb-btn llb-btn-primary"
            disabled={saving}
          >
            {saving ? t("dialogs.slide.saving") : t("dialogs.slide.save")}
          </button>
        </>
      }
    >
      <form id="llb-slide-form" className="llb-form-grid" onSubmit={submit}>
        {error && (
          <div className="llb-banner is-error" role="alert">
            {error}
          </div>
        )}
        {isQuestion ? (
          <>
            <div className="llb-field-block llb-field-wide">
              <label className="llb-field-label" htmlFor="llb-slide-prompt">
                {t("dialogs.slide.prompt")}
              </label>
              <textarea
                id="llb-slide-prompt"
                className="llb-textarea"
                dir="auto"
                rows={3}
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
              />
            </div>
            {questionKind === "matching" && (
              <div className="llb-field-block llb-field-wide">
                <span className="llb-field-label">{t("dialogs.slide.matchingPairs")}</span>
                <span className="llb-form-note">{t("dialogs.slide.matchingHint")}</span>
                <div className="llb-option-editor">
                  {pairs.map((pair, index) => (
                    <div className="llb-pair-row" key={`pair-${index}`}>
                      <input
                        className="llb-input"
                        dir="auto"
                        value={pair.left}
                        maxLength={300}
                        placeholder={t("dialogs.slide.term")}
                        aria-label={`${t("dialogs.slide.term")} ${index + 1}`}
                        onChange={(event) => patchPair(index, { left: event.target.value })}
                      />
                      <input
                        className="llb-input"
                        dir="auto"
                        value={pair.right}
                        maxLength={300}
                        placeholder={t("dialogs.slide.match")}
                        aria-label={`${t("dialogs.slide.match")} ${index + 1}`}
                        onChange={(event) => patchPair(index, { right: event.target.value })}
                      />
                      <button
                        type="button"
                        className="llb-row-action"
                        aria-label={t("dialogs.slide.removePair", { number: index + 1 })}
                        disabled={pairs.length <= livePairLimit.min}
                        onClick={() =>
                          setPairs((rows) => rows.filter((_, rowIndex) => rowIndex !== index))
                        }
                      >
                        <HiOutlineXMark className="llb-ic-sm" aria-hidden="true" />
                      </button>
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  className="llb-btn llb-btn-ghost llb-btn-sm"
                  onClick={() => setPairs((rows) => [...rows, { left: "", right: "" }])}
                >
                  <HiOutlinePlus className="llb-ic-sm" aria-hidden="true" />
                  {t("dialogs.slide.addPair")}
                </button>
              </div>
            )}
            {questionKind === "ordering" && (
              <div className="llb-field-block llb-field-wide">
                <span className="llb-field-label">{t("dialogs.slide.orderingItems")}</span>
                <span className="llb-form-note">{t("dialogs.slide.orderingHint")}</span>
                <div className="llb-option-editor">
                  {steps.map((step, index) => (
                    <div className="llb-option-row" key={`step-${index}`}>
                      <span className="llb-answer-letter">{index + 1}</span>
                      <input
                        className="llb-input"
                        dir="auto"
                        value={step.text}
                        maxLength={300}
                        placeholder={t("dialogs.slide.step", { number: index + 1 })}
                        onChange={(event) => patchStep(index, { text: event.target.value })}
                      />
                      <button
                        type="button"
                        className="llb-row-action"
                        aria-label={t("dialogs.slide.moveUp")}
                        disabled={index === 0}
                        onClick={() => setSteps((rows) => moveLiveOrderingItem(rows, index, -1))}
                      >
                        <HiOutlineArrowUp className="llb-ic-sm" aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        className="llb-row-action"
                        aria-label={t("dialogs.slide.moveDown")}
                        disabled={index === steps.length - 1}
                        onClick={() => setSteps((rows) => moveLiveOrderingItem(rows, index, 1))}
                      >
                        <HiOutlineArrowDown className="llb-ic-sm" aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        className="llb-row-action"
                        aria-label={t("dialogs.slide.removeStep", { number: index + 1 })}
                        disabled={steps.length <= liveStepLimit.min}
                        onClick={() =>
                          setSteps((rows) => rows.filter((_, rowIndex) => rowIndex !== index))
                        }
                      >
                        <HiOutlineXMark className="llb-ic-sm" aria-hidden="true" />
                      </button>
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  className="llb-btn llb-btn-ghost llb-btn-sm"
                  disabled={steps.length >= liveStepLimit.max}
                  onClick={() => setSteps((rows) => [...rows, { id: "", text: "" }])}
                >
                  <HiOutlinePlus className="llb-ic-sm" aria-hidden="true" />
                  {t("dialogs.slide.addStep")}
                </button>
              </div>
            )}
            {questionKind === "fill_in_blank" && (
              <div className="llb-field-block llb-field-wide">
                <span className="llb-field-label">{t("dialogs.slide.blanks")}</span>
                <span className="llb-form-note">{t("dialogs.slide.blanksHint")}</span>
                {blankIds.length === 0 ? (
                  <div className="llb-note-box">{t("dialogs.slide.missingBlank")}</div>
                ) : (
                  <div className="llb-option-editor">
                    {blankIds.map((id) => (
                      <label className="llb-field-block" key={id}>
                        <span className="llb-field-label">
                          {t("dialogs.slide.blankRow", { id })}
                        </span>
                        <input
                          className="llb-input"
                          dir="auto"
                          value={blankAccepts[id] || ""}
                          onChange={(event) =>
                            setBlankAccepts((map) => ({ ...map, [id]: event.target.value }))
                          }
                        />
                      </label>
                    ))}
                  </div>
                )}
              </div>
            )}
            {questionKind === "numeric" && (
              <div className="llb-field-block llb-field-wide">
                <span className="llb-field-label">{t("dialogs.slide.numericRule")}</span>
                <div className="llb-form-grid">
                  <label className="llb-field-block">
                    <span className="llb-field-label">{t("dialogs.slide.numericRule")}</span>
                    <select
                      className="llb-select"
                      value={numericRule.mode || "exact"}
                      onChange={(event) => patchRule({ mode: event.target.value })}
                    >
                      <option value="exact">{t("dialogs.slide.numericExact")}</option>
                      <option value="tolerance">{t("dialogs.slide.numericTolerance")}</option>
                      <option value="relative">{t("dialogs.slide.numericRelative")}</option>
                      <option value="range">{t("dialogs.slide.numericRange")}</option>
                    </select>
                  </label>
                  {numericRule.mode === "range" ? (
                    <>
                      <label className="llb-field-block">
                        <span className="llb-field-label">{t("dialogs.slide.numericMin")}</span>
                        <input
                          className="llb-input"
                          value={numericRule.min || ""}
                          onChange={(event) => patchRule({ min: event.target.value })}
                        />
                      </label>
                      <label className="llb-field-block">
                        <span className="llb-field-label">{t("dialogs.slide.numericMax")}</span>
                        <input
                          className="llb-input"
                          value={numericRule.max || ""}
                          onChange={(event) => patchRule({ max: event.target.value })}
                        />
                      </label>
                    </>
                  ) : (
                    <>
                      <label className="llb-field-block">
                        <span className="llb-field-label">{t("dialogs.slide.numericValue")}</span>
                        <input
                          className="llb-input"
                          value={numericRule.value || ""}
                          onChange={(event) => patchRule({ value: event.target.value })}
                        />
                      </label>
                      {numericRule.mode !== "exact" && (
                        <label className="llb-field-block">
                          <span className="llb-field-label">
                            {numericRule.mode === "relative"
                              ? t("dialogs.slide.numericPercentTolerance")
                              : t("dialogs.slide.numericToleranceValue")}
                          </span>
                          <input
                            className="llb-input"
                            value={numericRule.tolerance || ""}
                            onChange={(event) => patchRule({ tolerance: event.target.value })}
                          />
                        </label>
                      )}
                    </>
                  )}
                  <label className="llb-field-block">
                    <span className="llb-field-label">{t("dialogs.slide.numericUnit")}</span>
                    <input
                      className="llb-input"
                      dir="auto"
                      value={numericRule.unit || ""}
                      onChange={(event) => patchRule({ unit: event.target.value })}
                    />
                  </label>
                </div>
              </div>
            )}
            {questionKind === "text" && (
              <div className="llb-field-block llb-field-wide">
                <label className="llb-field-label" htmlFor="llb-slide-guidance">
                  {t("dialogs.slide.guidance")}
                </label>
                <textarea
                  id="llb-slide-guidance"
                  className="llb-textarea"
                  dir="auto"
                  rows={2}
                  value={guidance}
                  onChange={(event) => setGuidance(event.target.value)}
                />
                <label className="llb-field-label" htmlFor="llb-slide-criteria">
                  {t("dialogs.slide.criteria")}
                </label>
                <textarea
                  id="llb-slide-criteria"
                  className="llb-textarea"
                  dir="auto"
                  rows={2}
                  value={criteria}
                  onChange={(event) => setCriteria(event.target.value)}
                />
                <div className="llb-field-pair">
                  <label className="llb-field-block">
                    <span className="llb-field-label">{t("dialogs.slide.minWords")}</span>
                    <input
                      className="llb-input"
                      type="number"
                      min={0}
                      max={2000}
                      value={minWords || ""}
                      onChange={(event) => setMinWords(Number(event.target.value) || 0)}
                    />
                  </label>
                  <label className="llb-field-block">
                    <span className="llb-field-label">{t("dialogs.slide.maxWords")}</span>
                    <input
                      className="llb-input"
                      type="number"
                      min={0}
                      max={2000}
                      value={maxWords || ""}
                      onChange={(event) => setMaxWords(Number(event.target.value) || 0)}
                    />
                  </label>
                </div>
                <span className="llb-form-note">{t("dialogs.slide.writtenHint")}</span>
              </div>
            )}
            {optionKind && (
              <>
                {questionKind === "tf" ? (
                  <div className="llb-field-block">
                    <span className="llb-field-label">{t("dialogs.slide.options")}</span>
                    <div className="llb-note-box">
                      {t("dialogs.slide.true")} / {t("dialogs.slide.false")}
                    </div>
                  </div>
                ) : (
                  <div className="llb-field-block">
                    <span className="llb-field-label">{t("dialogs.slide.options")}</span>
                    <div className="llb-option-editor">
                      {options.map((option, index) => (
                        <div className="llb-option-row" key={option.id}>
                          <span className="llb-answer-letter">
                            {String.fromCharCode(65 + index)}
                          </span>
                          <input
                            className="llb-input"
                            dir="auto"
                            value={option.text}
                            maxLength={300}
                            aria-label={t("dialogs.slide.option", {
                              letter: String.fromCharCode(65 + index),
                            })}
                            onChange={(event) => setOptionText(option.id, event.target.value)}
                          />
                          <button
                            type="button"
                            className="llb-row-action"
                            aria-label={t("dialogs.slide.removeOption", {
                              letter: String.fromCharCode(65 + index),
                            })}
                            disabled={options.length <= 2}
                            onClick={() => removeOption(option.id)}
                          >
                            <HiOutlineXMark className="llb-ic-sm" aria-hidden="true" />
                          </button>
                        </div>
                      ))}
                    </div>
                    <button
                      type="button"
                      className="llb-btn llb-btn-ghost llb-btn-sm"
                      disabled={options.length >= 6}
                      onClick={addOption}
                    >
                      <HiOutlinePlus className="llb-ic-sm" aria-hidden="true" />
                      {t("dialogs.slide.addOption")}
                    </button>
                  </div>
                )}
                <div className="llb-field-block">
                  <span className="llb-field-label">
                    {multi ? t("dialogs.slide.correctMulti") : t("dialogs.slide.correct")}
                  </span>
                  <span className="llb-form-note">
                    {multi ? t("dialogs.slide.answerHintMulti") : t("dialogs.slide.answerHint")}
                  </span>
                  <div className="llb-answer-list">
                    {options.map((option, index) => {
                      const checked = multi
                        ? correctOptionIds.includes(option.id)
                        : correctOptionId === option.id;
                      return (
                        <label
                          key={option.id}
                          className={checked ? "llb-answer-row is-correct" : "llb-answer-row"}
                        >
                          <input
                            type={multi ? "checkbox" : "radio"}
                            name="llb-correct-option"
                            checked={checked}
                            onChange={(event) => toggleCorrect(option.id, event.target.checked)}
                          />
                          <span className="llb-answer-letter">
                            {questionKind === "tf"
                              ? option.text
                              : String.fromCharCode(65 + index)}
                          </span>
                          {questionKind !== "tf" && <span>{option.text}</span>}
                        </label>
                      );
                    })}
                  </div>
                </div>
              </>
            )}
            <div className="llb-field-block">
              <label className="llb-field-label" htmlFor="llb-slide-explanation">
                {t("dialogs.slide.explanation")}
              </label>
              <textarea
                id="llb-slide-explanation"
                className="llb-textarea"
                rows={3}
                value={explanation}
                onChange={(event) => setExplanation(event.target.value)}
              />
            </div>
            <div className="llb-field-block">
              <label className="llb-field-label" htmlFor="llb-slide-evidence">
                {t("dialogs.slide.evidence")}
              </label>
              <textarea
                id="llb-slide-evidence"
                className="llb-textarea"
                rows={2}
                value={evidence}
                onChange={(event) => setEvidence(event.target.value)}
              />
            </div>
          </>
        ) : (
          <>
            <div className="llb-field-block">
              <label className="llb-field-label" htmlFor="llb-slide-title">
                {t("dialogs.slide.title")}
              </label>
              <input
                id="llb-slide-title"
                className="llb-input"
                value={title}
                maxLength={200}
                onChange={(event) => setTitle(event.target.value)}
              />
            </div>
            {item.slideType === "examples" ? (
              <div className="llb-field-block">
                <label className="llb-field-label" htmlFor="llb-slide-examples">
                  {t("dialogs.slide.examples")}
                </label>
                <span className="llb-form-note">{t("dialogs.slide.examplesHint")}</span>
                <textarea
                  id="llb-slide-examples"
                  className="llb-textarea"
                  rows={6}
                  value={examples}
                  onChange={(event) => setExamples(event.target.value)}
                />
              </div>
            ) : (
              <div className="llb-field-block">
                <label className="llb-field-label" htmlFor="llb-slide-body">
                  {t("dialogs.slide.body")}
                </label>
                <span className="llb-form-note">{t("dialogs.slide.bodyHint")}</span>
                <textarea
                  id="llb-slide-body"
                  className="llb-textarea"
                  rows={6}
                  value={body}
                  onChange={(event) => setBody(event.target.value)}
                />
              </div>
            )}
            <div className="llb-field-block">
              <label className="llb-field-label" htmlFor="llb-slide-notes">
                {t("dialogs.slide.notes")}
              </label>
              <span className="llb-form-note">{t("dialogs.slide.notesHint")}</span>
              <textarea
                id="llb-slide-notes"
                className="llb-textarea"
                rows={4}
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
              />
            </div>
          </>
        )}
      </form>
    </BuilderDialog>
  );
};

export default BuilderSlideDialog;
