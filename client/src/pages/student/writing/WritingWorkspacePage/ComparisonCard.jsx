import { useTranslation } from "react-i18next";
import { HiOutlineArrowNarrowUp, HiOutlineCheckCircle, HiOutlineMinusCircle } from "react-icons/hi";

/** What changed between two drafts, as the teacher published it. */
export default function ComparisonCard({ comparison, fromNumber, toNumber }) {
  const { t } = useTranslation(["writing"]);
  const detail = comparison?.comparison;
  if (!comparison || !detail) return null;

  const wordDelta = Number(detail.wordDelta) || 0;
  const hasIssues = (detail.newIssues || []).length > 0;

  return (
    <section className="ws-compare">
      <header className="ws-compare-head">
        <h3>{t("writing:student.comparisonTitle", { from: fromNumber, to: toNumber })}</h3>
        <span className={`ws-compare-delta${wordDelta < 0 ? " is-down" : ""}`}>
          <HiOutlineArrowNarrowUp size={15} aria-hidden="true" />
          {t("writing:student.comparisonWords", {
            sign: wordDelta < 0 ? "−" : "+",
            n: Math.abs(wordDelta),
          })}
        </span>
      </header>

      {detail.encouragement && <p className="ws-compare-lead">{detail.encouragement}</p>}
      {comparison.overall?.summary && <p className="ws-compare-line">{comparison.overall.summary}</p>}

      <div className="ws-compare-grid">
        {(detail.criteriaImproved || []).length > 0 && (
          <div className="ws-compare-block is-good">
            <h4>{t("writing:student.comparisonImproved")}</h4>
            <ul>
              {detail.criteriaImproved.map((item) => (
                <li key={item}>
                  <HiOutlineCheckCircle size={14} aria-hidden="true" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        )}
        {(detail.criteriaUnresolved || []).length > 0 && (
          <div className="ws-compare-block">
            <h4>{t("writing:student.comparisonUnresolved")}</h4>
            <ul>
              {detail.criteriaUnresolved.map((item) => (
                <li key={item}>
                  <HiOutlineMinusCircle size={14} aria-hidden="true" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        )}
        {hasIssues && (
          <div className="ws-compare-block is-warn">
            <h4>{t("writing:student.comparisonNewIssues")}</h4>
            <ul>
              {detail.newIssues.map((item) => <li key={item}>{item}</li>)}
            </ul>
          </div>
        )}
      </div>

      {(detail.changedBySection || []).length > 0 && (
        <div className="ws-compare-changes">
          <h4>{t("writing:student.comparisonSections")}</h4>
          {detail.changedBySection.map((row) => (
            <div className="ws-compare-change" key={`${row.kind}-${row.key}-${row.index}`}>
              <span className="ws-compare-label">{row.label || row.key}</span>
              <p>{row.summary}</p>
              <em>{t(`writing:student.comparisonKind.${row.kind || "changed"}`)}</em>
            </div>
          ))}
        </div>
      )}

      {(detail.feedbackApplied || []).length > 0 && (
        <div className="ws-compare-applied">
          <h4>{t("writing:student.comparisonApplied")}</h4>
          {detail.feedbackApplied.map((row) => (
            <p className={row.applied ? "is-applied" : "is-open"} key={`${row.key}-${row.index}`}>
              {row.applied
                ? t("writing:student.comparisonAppliedYes")
                : t("writing:student.comparisonAppliedNo")}
              {row.note ? ` — ${row.note}` : ""}
            </p>
          ))}
        </div>
      )}
    </section>
  );
}
