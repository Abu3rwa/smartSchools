import { useTranslation } from "react-i18next";
import { essayParagraphs } from "./draftEssay.js";
import { noteForSlot } from "./sectionFeedback.js";
import { FeedbackForSection } from "./SectionCard.jsx";

/**
 * The student's sent draft as they wrote it: one piece, paragraph by paragraph.
 * Close tints keep parts distinguishable without putting headings on the text.
 */
export default function DraftEssayView({ assessment, assignment, draft, locale }) {
  const { t } = useTranslation(["writing"]);
  const paragraphs = essayParagraphs({ assignment, sections: draft.sections });
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

      {paragraphs.map((paragraph, position) => {
        const note = noteForSlot(assessment, paragraph);
        return (
          <div
            className={`ws-essay-para is-tone-${position % 4}`}
            key={`${paragraph.key}:${paragraph.index}`}
          >
            <p className="ws-essay-text">{paragraph.text}</p>
            {note && <FeedbackForSection note={note} />}
          </div>
        );
      })}
    </article>
  );
}
