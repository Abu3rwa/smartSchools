import { memo, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { countLabel } from "../../../../utils/countText.js";
import {
  HiOutlineChat,
  HiOutlineCheckCircle,
  HiOutlineLightBulb,
  HiOutlinePlus,
  HiOutlineTrash,
} from "react-icons/hi";
import { countWords } from "../../../../utils/writingWorkflow.js";

export function FeedbackForSection({ note, number = 0 }) {
  const { t } = useTranslation(["writing"]);
  // One thing to try per part: the teacher's next step, or the first improvement if none was set.
  const action = note.nextStep || (note.improvements || []).join(" · ");
  // A numbered note is about the highlighted words above, so it does not repeat the quote.
  const anchored = number > 0;

  return (
    <div className={`ws-feedback-block${anchored ? " is-anchored" : ""}`}>
      <p className="ws-feedback-label">
        {anchored ? (
          <span className="ws-badge">{number}</span>
        ) : (
          <HiOutlineChat size={15} aria-hidden="true" />
        )}
        {t("writing:student.feedbackOnThisPart")}
      </p>
      {note.strengths?.length > 0 && (
        <p className="ws-feedback-line is-good">
          <HiOutlineCheckCircle size={16} aria-hidden="true" />
          <span>
            {t("writing:student.workedWell")}: {note.strengths.join(" · ")}
          </span>
        </p>
      )}
      {action && (
        <p className="ws-feedback-line is-action">
          <HiOutlineLightBulb size={16} aria-hidden="true" />
          <span>
            {t("writing:student.tryThis")}: {action}
          </span>
        </p>
      )}
      {!anchored && note.evidence && (
        <blockquote className="ws-feedback-quote">{note.evidence}</blockquote>
      )}
      {note.why && <p className="ws-feedback-why">{note.why}</p>}
    </div>
  );
}

/**
 * One section's editor. Memoised: typing in one paragraph must not re-render
 * every other paragraph and its feedback.
 */
function SectionCard({
  canAdd,
  canRemove,
  definition,
  label,
  note,
  onChange,
  onAdd,
  onFocus,
  onRemove,
  readOnly,
  registerEditor,
  section,
}) {
  const { t } = useTranslation(["writing"]);
  const words = countWords(section.text);
  const minWords = Number(definition?.minWords) || 0;
  const short = minWords > 0 && words < minWords;
  const attachEditor = useCallback(
    (node) => registerEditor(section.key, section.index, node),
    [registerEditor, section.key, section.index],
  );

  return (
    <section className="ws-section">
      <header className="ws-section-head">
        <h3>{label || definition?.label || section.label || definition?.key}</h3>
        <span className={`ws-count${short ? " is-short" : ""}`}>
          {countLabel(t, "writing:student.wordCount", words)}
          {minWords > 0 && (
            <> / {t("writing:student.minWords", { n: minWords })}</>
          )}
        </span>
      </header>

      {definition?.instructions && (
        <p className="ws-section-help">{definition.instructions}</p>
      )}

      <textarea
        ref={attachEditor}
        value={section.text}
        readOnly={readOnly}
        // A fixed number of rows: growing by word count shifted the caret viewport
        // under the child's hands. Height still follows the text through CSS.
        rows={8}
        onChange={(event) =>
          onChange(section.key, section.index, event.target.value)
        }
        onFocus={() => onFocus(section.key, section.index)}
        data-paste-key={section.key}
        data-paste-index={section.index}
        placeholder={t("writing:student.sectionPlaceholder")}
        aria-label={label || definition?.label || section.key}
      />

      {definition?.criteria?.length > 0 && (
        <ul className="ws-criteria">
          {definition.criteria.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      )}

      {note && <FeedbackForSection note={note} />}

      {!readOnly && (
        <div className="ws-section-actions">
          {canAdd && (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => onAdd(definition)}
            >
              <HiOutlinePlus size={15} aria-hidden="true" />
              {t("writing:student.addAnother", {
                label: definition?.label || section.key,
              })}
            </button>
          )}
          {canRemove && (
            <button
              type="button"
              className="btn btn-ghost btn-sm ws-remove"
              onClick={() => onRemove(`${section.key}:${section.index}`)}
            >
              <HiOutlineTrash size={15} aria-hidden="true" />
              {t("writing:student.removeSection")}
            </button>
          )}
        </div>
      )}
    </section>
  );
}

export default memo(SectionCard);
