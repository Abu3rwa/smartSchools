import { useTranslation } from "react-i18next";
import { essayParagraphs } from "./draftEssay.js";
import { FeedbackForSection } from "./SectionCard.jsx";
import { anchorEssay } from "../../../../utils/writingAnchors.js";

/**
 * The student's sent draft as they wrote it: one piece, paragraph by paragraph.
 * Close tints keep parts distinguishable without putting headings on the text.
 * A quote the teacher commented on is highlighted in place and numbered, so the
 * note below it points at the exact words rather than the whole paragraph.
 */
export default function DraftEssayView({ assessment, assignment, draft, locale }) {
  const { t } = useTranslation(["writing"]);
  const paragraphs = essayParagraphs({ assignment, sections: draft.sections });
  const rows = anchorEssay(paragraphs, assessment?.sections);
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
        return (
          <div
            className={`ws-essay-para is-tone-${position % 4}`}
            key={`${row.key}:${row.index}`}
          >
            <p className="ws-essay-text">
              {row.segments.map((segment, index) => (segment.mark === null ? (
                <span key={index}>{segment.text}</span>
              ) : (
                <mark className={`ws-essay-mark${action ? " is-action" : ""}`} key={index}>
                  {segment.text}
                  <sup className="ws-essay-mark-n">{segment.mark}</sup>
                </mark>
              )))}
            </p>
            {row.note && <FeedbackForSection note={row.note} number={row.number} />}
          </div>
        );
      })}
    </article>
  );
}