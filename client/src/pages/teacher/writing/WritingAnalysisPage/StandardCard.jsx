import { useTranslation } from "react-i18next";
import { HiOutlineChevronDown, HiOutlineChevronUp } from "react-icons/hi";
import { formatDate } from "../WritingAssignmentBoardPage/boardPresentation.js";
import { scaleLabel, statusTone } from "./analysisPresentation.js";
import { SCALE_OPTIONS } from "../../../../utils/sbrScaleUtils.js";

const JUDGMENTS = ["met", "partly", "not_met"];

function EvidenceRow({
  standard,
  evidence,
  piece,
  language,
  published,
  busy,
  onEvidence,
}) {
  const { t } = useTranslation(["writing"]);
  const judged = Boolean(evidence.opportunity);
  return (
    <li className="wa-ana-evidence-row">
      <div className="wa-ana-evidence-head">
        <strong>{piece?.title || t("writing:teacher.analysis.pieceTitle")}</strong>
        <span className="wa-hint">
          {formatDate(piece?.submittedAt, language)}
        </span>
        {judged && (
          <span className={`wa-ana-judgment is-${evidence.judgment}`}>
            {t(`writing:teacher.analysis.judgments.${evidence.judgment}`)}
          </span>
        )}
        {evidence.teacherOverridden && (
          <span className="wa-ana-reason">
            {t("writing:teacher.analysis.overridden")}
          </span>
        )}
      </div>

      {evidence.absence ? (
        <p className="wa-ana-absence">
          {t("writing:teacher.analysis.absenceEvidence")}
        </p>
      ) : (
        evidence.quote && <blockquote>{evidence.quote}</blockquote>
      )}
      {evidence.note && (
        <p className="wa-ana-note">
          {evidence.note}
          {!evidence.absence && (
            <span className="wa-hint">
              {t("writing:teacher.analysis.quoteOnlyNote")}
            </span>
          )}
        </p>
      )}

      {!published &&
        (judged ? (
          <div className="wa-ana-evidence-actions">
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              disabled={busy === "evidence"}
              title={t("writing:teacher.analysis.noChanceHint")}
              onClick={() =>
                onEvidence({
                  standard,
                  draft: evidence.draft,
                  opportunity: false,
                  judgment: "none",
                })
              }
            >
              {t("writing:teacher.analysis.noChance")}
            </button>
          </div>
        ) : (
          <div className="wa-ana-judgment-prompt is-block">
            <span className="wa-hint">
              {t("writing:teacher.analysis.didShow")}
            </span>
            {JUDGMENTS.map((judgment) => (
              <button
                type="button"
                key={judgment}
                className="wa-chip-button"
                disabled={busy === "evidence"}
                onClick={() =>
                  onEvidence({
                    standard,
                    draft: evidence.draft,
                    opportunity: true,
                    judgment,
                  })
                }
              >
                {t(`writing:teacher.analysis.judgments.${judgment}`)}
              </button>
            ))}
          </div>
        ))}
    </li>
  );
}

/**
 * One standard. The row is the summary; the body holds the counts, the
 * evidence, then the teacher's note — the note never comes before the evidence.
 */
export default function StandardCard({
  result,
  values,
  setLevel,
  published,
  busy,
  pieces,
  language,
  onEvidence,
  collapsed,
  onToggle,
}) {
  const { t } = useTranslation(["writing"]);
  const key = String(result.standard);
  const draft = values[key] || { level: null, note: "" };
  const counts = result.counts || {};
  const hasProposal =
    result.proposedLevel !== null && result.proposedLevel !== undefined;
  const expandable = typeof onToggle === "function";
  const expanded = expandable ? !collapsed : true;

  return (
    <section className="wa-ana-standard">
      <div className="wa-ana-standard-row">
        <div className="wa-ana-standard-title">
          <strong>
            {result.code ? `${result.code} · ` : ""}
            {result.name}
          </strong>
          <span className="wa-ana-standard-sub">
            {result.category || ""}
            {counts.applicable > 0
              ? ` · ${t("writing:teacher.analysis.metOf", {
                  met: counts.met ?? 0,
                  n: counts.applicable,
                })}`
              : ""}
          </span>
        </div>

        <div className="wa-ana-standard-meta">
          <span className={`wa-ana-status is-${statusTone(result.status)}`}>
            {t(`writing:teacher.analysis.status.${result.status}`)}
          </span>
          <span className="wa-ana-proposed-chip">
            {t("writing:teacher.analysis.proposedShort")}{" "}
            <strong>
              {hasProposal
                ? `${result.proposedLevel} · ${scaleLabel(result.proposedLevel, language)}`
                : t("writing:teacher.analysis.proposedNone")}
            </strong>
          </span>
          <label className="wa-ana-level-field">
            <span className="wa-hint">
              {t("writing:teacher.analysis.yourLevel")}
            </span>
            <select
              value={draft.level ?? ""}
              disabled={published}
              onChange={(event) =>
                setLevel(key, {
                  level:
                    event.target.value === ""
                      ? null
                      : Number(event.target.value),
                })
              }
            >
              <option value="">{t("writing:teacher.analysis.noGrade")}</option>
              {SCALE_OPTIONS.map((value) => (
                <option key={value} value={value}>
                  {value} · {scaleLabel(value, language)}
                </option>
              ))}
            </select>
          </label>
          {expandable && (
            <button
              type="button"
              className="btn btn-ghost btn-sm wa-ana-expand"
              aria-expanded={expanded}
              aria-label={
                expanded
                  ? t("writing:teacher.analysis.collapseEvidence")
                  : t("writing:teacher.analysis.expandEvidence")
              }
              onClick={onToggle}
            >
              {expanded ? (
                <HiOutlineChevronUp size={16} aria-hidden="true" />
              ) : (
                <HiOutlineChevronDown size={16} aria-hidden="true" />
              )}
            </button>
          )}
        </div>
      </div>

      {expanded && (
        <div className="wa-ana-standard-body">
          <p className="wa-ana-counts">
            {counts.applicable > 0
              ? t("writing:teacher.analysis.countsLine", {
                  applicable: counts.applicable,
                  met: counts.met ?? 0,
                  partly: counts.partly ?? 0,
                  notMet: counts.notMet ?? 0,
                })
              : t("writing:teacher.analysis.noOpportunity")}
          </p>
          {!hasProposal && (
            <p className="wa-hint">
              {t("writing:teacher.analysis.proposedNoneHint")}
            </p>
          )}

          <div className="wa-ana-evidence">
            <h4>{t("writing:teacher.analysis.evidence")}</h4>
            {(result.pieces || []).length === 0 && (
              <p className="wa-hint">
                {t("writing:teacher.analysis.noEvidence")}
              </p>
            )}
            <ul>
              {(result.pieces || []).map((evidence) => (
                <EvidenceRow
                  key={String(evidence.draft)}
                  standard={result.standard}
                  evidence={evidence}
                  piece={pieces.get(String(evidence.draft))}
                  language={language}
                  published={published}
                  busy={busy}
                  onEvidence={onEvidence}
                />
              ))}
            </ul>
          </div>

          <label className="wa-field">
            {t("writing:teacher.analysis.teacherNote")}
            <textarea
              rows={2}
              maxLength={600}
              value={draft.note || ""}
              disabled={published}
              placeholder={t("writing:teacher.analysis.teacherNotePlaceholder")}
              onChange={(event) => setLevel(key, { note: event.target.value })}
            />
          </label>
        </div>
      )}
    </section>
  );
}
