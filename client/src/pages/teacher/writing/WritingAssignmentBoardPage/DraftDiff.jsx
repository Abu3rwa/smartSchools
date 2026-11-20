import { useTranslation } from "react-i18next";
import { alignDraftSections } from "../../../../utils/writingDiff.js";

const Words = ({ ops, side }) => {
  const visible = ops.filter((op) =>
    side === "before" ? op.op !== "insert" : op.op !== "delete",
  );
  return visible.map((op, index) => {
    if (op.op === "equal") return <span key={index}>{op.text} </span>;
    const Tag = side === "before" ? "del" : "ins";
    return <Tag key={index}>{op.text} </Tag>;
  });
};

/**
 * F4: the two drafts side by side, aligned word by word, under the comparison
 * notes that describe them. Collapsed by default so the notes stay in view.
 */
export default function DraftDiff({ previousDraft, currentDraft }) {
  const { t } = useTranslation(["writing"]);
  const rows = alignDraftSections(previousDraft, currentDraft);
  if (!rows.length) return null;

  return (
    <details className="wa-diff">
      <summary>
        {t("writing:teacher.review.diff.title", {
          from: previousDraft?.number || "?",
          to: currentDraft?.number || "?",
        })}
      </summary>
      <p className="wa-hint">{t("writing:teacher.review.diff.hint")}</p>
      {rows.map((row) => (
        <section className="wa-diff-section" key={row.key}>
          <h5>
            {row.label}
            {row.removedSection && (
              <em>{t("writing:teacher.review.diff.removedSection")}</em>
            )}
          </h5>
          <p className="wa-hint">
            {row.stats.added + row.stats.removed > 0
              ? t("writing:teacher.review.diff.stats", {
                  added: row.stats.added,
                  removed: row.stats.removed,
                })
              : t("writing:teacher.review.diff.unchanged")}
          </p>
          {row.tooLong ? (
            <p className="wa-hint">
              {t("writing:teacher.review.diff.tooLong")}
            </p>
          ) : (
            <div className="wa-diff-cols">
              <div>
                <span className="wa-field-label">
                  {t("writing:teacher.review.diff.previous")}
                </span>
                <p>{row.before ? <Words ops={row.ops} side="before" /> : "—"}</p>
              </div>
              <div>
                <span className="wa-field-label">
                  {t("writing:teacher.review.diff.current")}
                </span>
                <p>{row.after ? <Words ops={row.ops} side="after" /> : "—"}</p>
              </div>
            </div>
          )}
        </section>
      ))}
    </details>
  );
}
