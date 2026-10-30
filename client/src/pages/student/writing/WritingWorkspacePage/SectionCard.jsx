import { useTranslation } from "react-i18next";
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
        {anchored
          ? <span className="ws-badge">{number}</span>
          : <HiOutlineChat size={15} aria-hidden="true" />}
        {t("writing:student.feedbackOnThisPart")}
      </p>
      {note.strengths?.length > 0 && (
        <p className="ws-feedback-line is-good">
          <HiOutlineCheckCircle size={16} aria-hidden="true" />
          <span>{t("writing:student.workedWell")}: {note.strengths.join(" · ")}</span>
        </p>
      )}
      {action && (
        <p className="ws-feedback-line is-action">
          <HiOutlineLightBulb size={16} aria-hidden="true" />
          <span>{t("writing:student.tryThis")}: {action}</span>
        </p>
      )}
      {!anchored && note.evidence && <blockquote className="ws-feedback-quote">{note.evidence}</blockquote>}
      {note.why && <p className="ws-feedback-why">{note.why}</p>}
    </div>
  );
}

export default function SectionCard({
  canAdd,
  canRemove,
  definition,
  note,
  onChange,
  onAdd,
  onRemove,
  readOnly,
  section,
}) {
  const { t } = useTranslation(["writing"]);
  const words = countWords(section.text);
  const minWords = Number(definition?.minWords) || 0;
  const short = minWords > 0 && words < minWords;

  return (
    <section className="ws-section">
      <header className="ws-section-head">
        <h3>{definition?.label || section.label || definition?.key}</h3>
        <span className={`ws-count${short ? " is-short" : ""}`}>
          {t("writing:student.words", { n: words })}
          {minWords > 0 && <> / {t("writing:student.minWords", { n: minWords })}</>}
        </span>
      </header>

      {definition?.instructions && <p className="ws-section-help">{definition.instructions}</p>}

      <textarea
        value={section.text}
        readOnly={readOnly}
        rows={Math.min(14, Math.max(5, Math.ceil(words / 12)))}
        onChange={(event) => onChange(section.key, section.index, event.target.value)}
        placeholder={t("writing:student.sectionPlaceholder")}
        aria-label={definition?.label || section.key}
      />

      {definition?.criteria?.length > 0 && (
        <ul className="ws-criteria">
          {definition.criteria.map((item) => <li key={item}>{item}</li>)}
        </ul>
      )}

      {note && <FeedbackForSection note={note} />}

      {!readOnly && (
        <div className="ws-section-actions">
          {canAdd && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={onAdd}>
              <HiOutlinePlus size={15} aria-hidden="true" />
              {t("writing:student.addAnother", { label: definition?.label || section.key })}
            </button>
          )}
          {canRemove && (
            <button type="button" className="btn btn-ghost btn-sm ws-remove" onClick={onRemove}>
              <HiOutlineTrash size={15} aria-hidden="true" />
              {t("writing:student.removeSection")}
            </button>
          )}
        </div>
      )}
    </section>
  );
}
