import { useTranslation } from "react-i18next";
import { essayParagraphs } from "./draftEssay.js";
import { FeedbackForSection } from "./SectionCard.jsx";
import { anchorEssay, unplacedNotes } from "../../../../utils/writingAnchors.js";
import {
  categoryLabel,
  composeParagraphRuns,
  correctionsBySlot,
  resolveParagraphCorrections,
} from "../../../../utils/writingMechanics.js";

const safeId = (value) => String(value ?? "").replace(/[^a-zA-Z0-9_-]/g, "");

/**
 * The student's sent draft as they wrote it: one piece, paragraph by paragraph.
 * Close tints keep parts distinguishable without putting headings on the text.
 * A quote the teacher commented on is highlighted in place; its note sits right
 * under that paragraph, so the text carries no number for it.
 * Language corrections layer numbers on the same text: a red span on the exact
 * source words and one red number where the span ends, matching the numbered
 * corrections listed under the paragraph.
 */
export default function DraftEssayView({ assessment, assignment, draft, locale }) {
  const { t } = useTranslation(["writing"]);
  const paragraphs = essayParagraphs({ assignment, sections: draft.sections });
  const rows = anchorEssay(paragraphs, assessment?.sections);
  const corrections = resolveParagraphCorrections(
    paragraphs,
    correctionsBySlot(assessment?.sections),
  );
  const correctionsByPath = new Map(
    corrections.map((row) => [`${row.key}:${row.index}`, row]),
  );
  // Published notes whose part no longer lines up still have to reach the student.
  const loose = unplacedNotes(paragraphs, assessment?.sections);
  const draftTag = safeId(draft.id || draft._id || draft.number);
  const languageId = (row) =>
    `ws-lang-${draftTag}-${safeId(row.key)}-${row.index}`;
  const focusCorrection = (row, number) => {
    const node = document.getElementById(`${languageId(row)}-${number}`);
    if (node) node.focus();
  };
  const when = draft.submittedAt
    ? new Date(draft.submittedAt).toLocaleDateString(locale, { day: "2-digit", month: "short" })
    : "";

  return (
    <article className="ws-essay">
      <header className="ws-essay-head">
        {draft.title && <h2 className="ws-essay-title">{draft.title}</h2>}
        <p className="ws-essay-meta">
          {t("writing:student.essayMeta", { n: draft.number, words: draft.totalWords || 0, when })}
        </p>
      </header>

      {rows.map((row, position) => {
        // Amber asks for a change; teal marks something to keep doing.
        const action = Boolean(row.note?.nextStep || row.note?.improvements?.length);
        const language = correctionsByPath.get(`${row.key}:${row.index}`) || null;
        const languageRows = language?.mechanicsList || [];
        const review = language?.mechanicsReview || null;
        const byNumber = new Map(
          languageRows
            .filter((item) => Number(item.number) > 0)
            .map((item) => [item.number, item]),
        );
        const runs = composeParagraphRuns({
          text: row.text,
          coachingSegments: row.segments,
          corrections: language?.mechanics || [],
        });
        return (
          <div
            className={`ws-essay-para is-tone-${position % 4}`}
            key={`${row.key}:${row.index}`}
          >
            <p className="ws-essay-text" dir="auto">
              {runs.map((run, index) => {
                const next = runs[index + 1];
                // Each correction gets one marker where its red span ends.
                const ended = run.mechanics.filter(
                  (number) => !next || !next.mechanics.includes(number),
                );
                // A span often ends on the space before the next word; the
                // number has to hug the word, not float off the next one.
                const gap = ended.length ? run.text.match(/\s+$/)?.[0] || "" : "";
                const words = gap ? run.text.slice(0, -gap.length) : run.text;
                const content = (
                  <>
                    {words}
                    {ended.map((number) => {
                      const correction = byNumber.get(number);
                      return (
                        <button
                          type="button"
                          className="ws-language-marker"
                          key={`lang-${number}`}
                          aria-label={t("writing:languageCorrections.marker", {
                            n: number,
                            category: categoryLabel(t, correction?.category),
                          })}
                          onClick={() => focusCorrection(row, number)}
                        >
                          {number}
                        </button>
                      );
                    })}
                    {gap}
                  </>
                );
                const marked = run.mechanics.length > 0 ? (
                  <span className="ws-language-mark">{content}</span>
                ) : (
                  content
                );
                return run.coachingMark !== null ? (
                  <mark
                    className={`ws-essay-mark${action ? " is-action" : ""}`}
                    key={index}
                  >
                    {marked}
                  </mark>
                ) : (
                  <span key={index}>{marked}</span>
                );
              })}
            </p>
            {(row.note || languageRows.length > 0 || review) && (
              <FeedbackForSection
                note={row.note}
                number={row.number}
                corrections={languageRows}
                correctionStatus={review?.status || null}
                correctionPrefix={languageId(row)}
              />
            )}
          </div>
        );
      })}

      {loose.length > 0 && (
        <section className="ws-essay-loose">
          <h3>{t("writing:student.draftNotesTitle")}</h3>
          {loose.map((note, index) => (
            <FeedbackForSection
              key={`${note.key}:${note.index}:${index}`}
              note={note}
              general
            />
          ))}
        </section>
      )}
    </article>
  );
}
