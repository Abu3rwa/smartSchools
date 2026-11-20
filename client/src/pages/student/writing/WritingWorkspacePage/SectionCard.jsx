import { memo, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { countLabel } from "../../../../utils/countText.js";
import {
  HiOutlineChat,
  HiOutlineCheckCircle,
  HiOutlineLightBulb,
  HiOutlinePencil,
  HiOutlinePlus,
  HiOutlineTrash,
} from "react-icons/hi";
import { countWords } from "../../../../utils/writingWorkflow.js";
import {
  categoryLabel,
  describeLanguageSection,
} from "../../../../utils/writingMechanics.js";

export function FeedbackForSection({
  note,
  number = 0,
  general = false,
  corrections,
  correctionStatus,
  correctionPrefix,
  draftNumber = null,
}) {
  const { t } = useTranslation(["writing"]);
  const info = note || {};
  // One thing to try per part: the teacher's next step, or the first improvement if none was set.
  const action = info.nextStep || (info.improvements || []).join(" · ");
  // A numbered note is about the highlighted words above, so it does not repeat the quote.
  const anchored = number > 0;
  const rows = Array.isArray(corrections)
    ? corrections
    : info.mechanics || [];
  const status = correctionStatus ?? info.mechanicsReview?.status ?? null;
  const language = describeLanguageSection({ mechanics: rows, status });
  const typed = language.typed;
  const legacy = language.legacy;
  const hasMain = Boolean(
    anchored || general || info.strengths?.length || action || info.why || info.evidence,
  );
  if (!hasMain && !language.show) return null;

  return (
    <div className={`ws-feedback-block${anchored ? " is-anchored" : ""}`}>
      {hasMain && (
        <>
          <p className="ws-feedback-label">
            <HiOutlineChat size={15} aria-hidden="true" />
            {general
              ? t("writing:student.generalNote", { label: info.label || info.key })
              : t("writing:student.feedbackOnThisPart")}
          </p>
          {anchored && info.evidence && (
            <span className="ws-sr-only">{info.evidence}</span>
          )}
          {info.strengths?.length > 0 && (
            <p className="ws-feedback-line is-good">
              <HiOutlineCheckCircle size={16} aria-hidden="true" />
              <span>
                {t("writing:student.workedWell")}: {info.strengths.join(" · ")}
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
          {!anchored && info.evidence && (
            <blockquote className="ws-feedback-quote">{info.evidence}</blockquote>
          )}
          {info.why && <p className="ws-feedback-why">{info.why}</p>}
        </>
      )}

      {language.show && (
        <div className="ws-language-feedback">
          <p className="ws-feedback-label">
            <HiOutlinePencil size={15} aria-hidden="true" />
            {language.heading === "typed"
              ? t("writing:languageCorrections.title")
              : t("writing:languageCorrections.category.legacy")}
          </p>
          {!anchored && draftNumber && (typed.length > 0 || legacy.length > 0) && (
            <p className="ws-language-status">
              {t("writing:languageCorrections.previousDraft", { n: draftNumber })}
            </p>
          )}
          {legacy.length > 0 && (
            <ul className="ws-language-list is-legacy">
              {legacy.map((row, index) => (
                <li className="ws-language-pair" key={`legacy:${index}`}>
                  <span className="ws-language-error" dir="auto">
                    {row.original}
                  </span>
                  <span aria-hidden="true">{" → "}</span>
                  <span className="ws-sr-only">{t("writing:student.fixArrow")}</span>
                  <span className="ws-language-correction" dir="auto">
                    {row.correction || t("writing:languageCorrections.removeText")}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {typed.length > 0 && (
            <ul className="ws-language-list">
              {typed.map((row, index) => {
                const entryId =
                  correctionPrefix && Number(row.number) > 0
                    ? `${correctionPrefix}-${row.number}`
                    : undefined;
                return (
                  <li
                    className="ws-language-row"
                    key={`${row.category}:${row.original}:${index}`}
                    id={entryId}
                    tabIndex={entryId ? -1 : undefined}
                  >
                    <div className="ws-language-meta">
                      <span className="ws-language-category">
                        {categoryLabel(t, row.category)}
                      </span>
                      {Number(row.number) > 0 && (
                        <span className="ws-language-count">
                          {t("writing:languageCorrections.number", {
                            n: row.number,
                          })}
                        </span>
                      )}
                    </div>
                    <p className="ws-language-line">
                      <span className="ws-language-label">
                        {t("writing:languageCorrections.original")}
                      </span>
                      <span className="ws-language-error" dir="auto">
                        {row.original}
                      </span>
                    </p>
                    <p className="ws-language-line">
                      <span className="ws-language-label">
                        {t("writing:languageCorrections.correction")}
                      </span>
                      {String(row.correction ?? "") === "" ? (
                        <span className="ws-language-remove">
                          {t("writing:languageCorrections.removeText")}
                        </span>
                      ) : (
                        <span className="ws-language-correction" dir="auto">
                          {row.correction}
                        </span>
                      )}
                    </p>
                    {row.explanation && (
                      <p className="ws-language-line">
                        <span className="ws-language-label">
                          {t("writing:languageCorrections.explanation")}
                        </span>
                        <span className="ws-language-why" dir="auto">
                          {row.explanation}
                        </span>
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          {language.message === "noneSuggested" && (
            <p className="ws-language-status">
              {t("writing:languageCorrections.noneSuggested")}
            </p>
          )}
          {language.message === "partial" && (
            <p className="ws-language-status is-partial">
              {t("writing:languageCorrections.partial")}
            </p>
          )}
          {language.message === "unavailable" && (
            <p className="ws-language-status">
              {t("writing:languageCorrections.unavailable")}
            </p>
          )}
        </div>
      )}
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
  draftNumber,
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

      {note && (
        <FeedbackForSection note={note} draftNumber={draftNumber} />
      )}

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
