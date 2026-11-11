import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import StandardCard from "./StandardCard.jsx";
import PublishPreview from "./PublishPreview.jsx";
import {
  attentionOf,
  growthTone,
  pieceByIdOf,
  splitPatterns,
} from "./analysisPresentation.js";

function PatternList({ patterns, t }) {
  if (patterns.length === 0) return null;
  return (
    <ul className="wa-ana-patterns">
      {patterns.map((pattern, index) => (
        <li key={`${pattern.category}-${pattern.kind}-${index}`}>
          <div className="wa-card-head">
            <strong>
              {t(`writing:teacher.analysis.categories.${pattern.category}`)}
            </strong>
            <span className={`wa-ana-kind is-${pattern.kind}`}>
              {pattern.kind === "strength"
                ? t("writing:teacher.analysis.strength")
                : t("writing:teacher.analysis.issue")}
            </span>
          </div>
          {pattern.recurring && pattern.pieces >= 2 && (
            <p className="wa-hint">
              {t("writing:teacher.analysis.inPieces", { n: pattern.pieces })}
            </p>
          )}
          {(pattern.quotes || []).slice(0, 1).map((quote) => (
            <blockquote key={quote}>{quote}</blockquote>
          ))}
          {(pattern.notes || []).slice(0, 1).map((note) => (
            <p key={note}>{note}</p>
          ))}
        </li>
      ))}
    </ul>
  );
}

export default function AnalysisReview({
  analysis,
  busy,
  conflict,
  dismissConflict,
  dismissPublishPreview,
  lastEvidenceChange,
  onEvidence,
  onNewRun,
  onPublish,
  onPreparePublish,
  onRetry,
  onSave,
  onUndoEvidence,
  published,
  publishPreview,
  setLevel,
  applyProposedLevels,
  values,
}) {
  const { t, i18n } = useTranslation(["writing"]);
  const [compact, setCompact] = useState(true);
  const [expanded, setExpanded] = useState({});
  const [confirmApply, setConfirmApply] = useState(false);
  const pieces = pieceByIdOf(analysis);
  const standards = useMemo(
    () => analysis.standards || [],
    [analysis.standards],
  );
  const attention = attentionOf(analysis);
  const { recurring, single } = splitPatterns(analysis.patterns || []);
  const growth = analysis.growth || {};
  const language = i18n.language;
  const hasLevel = standards.some(
    (row) =>
      values[String(row.standard)]?.level !== null &&
      values[String(row.standard)]?.level !== undefined,
  );
  const replaceCount = useMemo(
    () =>
      standards.filter(
        (row) =>
          row.proposedLevel !== null &&
          row.proposedLevel !== undefined &&
          values[String(row.standard)]?.level !== null &&
          values[String(row.standard)]?.level !== undefined,
      ).length,
    [standards, values],
  );
  const vagueNotes = analysis.summary?.vagueNotes || 0;
  const quotesDropped = analysis.summary?.quotesDropped || 0;

  const applyProposals = () => {
    if (replaceCount > 0 && !confirmApply) {
      setConfirmApply(true);
      return;
    }
    applyProposedLevels();
    setConfirmApply(false);
  };

  return (
    <div className="wa-analysis-review">
      {analysis.status === "done_with_warnings" && (
        <div className="wa-ana-banner is-warning">
          <h3>{t("writing:teacher.analysis.partialTitle")}</h3>
          <p>{t("writing:teacher.analysis.partialBody")}</p>
          {vagueNotes > 0 && (
            <p className="wa-hint">
              {t("writing:teacher.analysis.vagueNotes", { n: vagueNotes })}
            </p>
          )}
          {quotesDropped > 0 && (
            <p className="wa-hint">
              {t("writing:teacher.analysis.quotesDropped", { n: quotesDropped })}
            </p>
          )}
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={onRetry}
            disabled={busy === "retry"}
          >
            {busy === "retry"
              ? t("writing:teacher.analysis.retrying")
              : t("writing:teacher.analysis.retryFailed")}
          </button>
        </div>
      )}

      {analysis.aiError && (
        <div className="wa-ana-banner is-error">
          <h3>{t("writing:teacher.analysis.failedTitle")}</h3>
          <p>{analysis.aiError}</p>
        </div>
      )}

      {published && (
        <div className="wa-ana-banner is-success">
          <h3>{t("writing:teacher.analysis.publishedTitle")}</h3>
          <p>{t("writing:teacher.analysis.publishedBody")}</p>
        </div>
      )}

      <section className="wa-card wa-ana-attention">
        <h3>{t("writing:teacher.analysis.attentionTitle")}</h3>
        <p>
          {attention.weak.length > 0
            ? `${t("writing:teacher.analysis.attentionWeak")} ${attention.weak
                .map(
                  (row) =>
                    `${row.code} (${t("writing:teacher.analysis.metOfShort", {
                      met: row.met,
                      n: row.applicable,
                    })})`,
                )
                .join(" · ")}`
            : t("writing:teacher.analysis.attentionNone")}
          {attention.noProposal > 0
            ? ` · ${t("writing:teacher.analysis.attentionNoProposal", {
                n: attention.noProposal,
              })}`
            : ""}
        </p>
      </section>

      <div className="wa-card wa-analysis-intro">
        <div>
          <h2>{t("writing:teacher.analysis.reviewTitle")}</h2>
          <p className="wa-hint">{t("writing:teacher.analysis.reviewHint")}</p>
        </div>
        <div className="wa-card-actions">
          {lastEvidenceChange && !published && (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              disabled={busy === "evidence"}
              onClick={onUndoEvidence}
            >
              {t("writing:teacher.analysis.undo")}
            </button>
          )}
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            aria-pressed={compact}
            onClick={() => setCompact((value) => !value)}
          >
            {compact
              ? t("writing:teacher.analysis.showAllEvidence")
              : t("writing:teacher.analysis.compactList")}
          </button>
          {!published && !confirmApply && (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={applyProposals}
            >
              {t("writing:teacher.analysis.setAllProposed")}
            </button>
          )}
        </div>
      </div>

      {confirmApply && (
        <div className="wa-ana-banner is-warning">
          <p>
            {replaceCount > 0
              ? t("writing:teacher.analysis.applyReplace", { n: replaceCount })
              : t("writing:teacher.analysis.applyKeep")}
          </p>
          <div className="wa-card-actions">
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={applyProposals}
            >
              {t("writing:teacher.analysis.apply")}
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => setConfirmApply(false)}
            >
              {t("writing:teacher.analysis.cancel")}
            </button>
          </div>
        </div>
      )}

      <div className="wa-analysis-standard-list">
        {standards.map((result) => {
          const key = String(result.standard);
          return (
            <StandardCard
              key={key}
              result={result}
              values={values}
              setLevel={setLevel}
              published={published}
              busy={busy}
              pieces={pieces}
              language={language}
              onEvidence={onEvidence}
              collapsed={compact ? expanded[key] !== true : false}
              onToggle={
                compact
                  ? () =>
                      setExpanded((previous) => ({
                        ...previous,
                        [key]: previous[key] !== true,
                      }))
                  : undefined
              }
            />
          );
        })}
      </div>

      <div className="wa-grid-2 wa-analysis-panels">
        <section className="wa-card">
          <h3>{t("writing:teacher.analysis.patternsTitle")}</h3>
          <p className="wa-hint">
            {t("writing:teacher.analysis.patternsHint")}
          </p>
          {recurring.length === 0 ? (
            <p className="wa-hint">
              {t("writing:teacher.analysis.patternsEmpty")}
            </p>
          ) : (
            <PatternList patterns={recurring} t={t} />
          )}
          {single.length > 0 && (
            <>
              <h4 className="wa-ana-subhead">
                {t("writing:teacher.analysis.patternsSingleTitle")}
              </h4>
              <PatternList patterns={single} t={t} />
            </>
          )}
        </section>

        <section className="wa-card">
          <h3>{t("writing:teacher.analysis.growthTitle")}</h3>
          {growth.usable ? (
            <>
              <span
                className={`wa-ana-direction is-${growthTone(growth.direction)}`}
              >
                {t(`writing:teacher.analysis.directions.${growth.direction}`)}
              </span>
              <p className="wa-hint">
                {t("writing:teacher.analysis.growthLine", {
                  early: growth.early,
                  late: growth.late,
                })}
              </p>
            </>
          ) : (
            <p className="wa-hint">
              {t("writing:teacher.analysis.growthUnavailable", {
                min: growth.minPieces || 4,
                n: growth.pieces ?? 0,
              })}
            </p>
          )}
        </section>
      </div>

      {conflict && (
        <div className="wa-ana-banner is-warning">
          <h3>{t("writing:teacher.analysis.conflictTitle")}</h3>
          <p>{t("writing:teacher.analysis.conflictBody")}</p>
          <ul>
            {conflict.map((row) => (
              <li key={String(row.standard)}>
                {t("writing:teacher.analysis.conflictRow", {
                  name: row.code ? `${row.code} · ${row.name}` : row.name,
                  previous: row.previousManualScore,
                  next: row.manualScore,
                })}
              </li>
            ))}
          </ul>
          <div className="wa-card-actions">
            <button
              type="button"
              className="btn btn-danger"
              onClick={() => onPublish({ confirmOverwrite: true })}
              disabled={busy === "publish"}
            >
              {busy === "publish"
                ? t("writing:teacher.analysis.publishing")
                : t("writing:teacher.analysis.replaceGrades")}
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={dismissConflict}
            >
              {t("writing:teacher.analysis.cancel")}
            </button>
          </div>
        </div>
      )}

      {publishPreview && !published && (
        <PublishPreview
          preview={publishPreview}
          busy={busy}
          language={language}
          onCancel={dismissPublishPreview}
          onConfirm={onPublish}
        />
      )}

      {!published && !conflict && (
        <footer className="wa-footer">
          <p className="wa-hint">
            {t("writing:teacher.analysis.publishHint")}
          </p>
          <div className="wa-footer-actions">
            <button
              type="button"
              className="btn btn-ghost"
              onClick={onNewRun}
            >
              {t("writing:teacher.analysis.newRun")}
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={onSave}
              disabled={busy === "save" || busy === "publish"}
            >
              {busy === "save"
                ? t("writing:teacher.analysis.saving")
                : t("writing:teacher.analysis.save")}
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={onPreparePublish}
              disabled={
                !hasLevel ||
                busy === "publish" ||
                busy === "save" ||
                busy === "preview"
              }
            >
              {busy === "preview"
                ? t("writing:teacher.analysis.previewLoading")
                : t("writing:teacher.analysis.publish")}
            </button>
          </div>
        </footer>
      )}
    </div>
  );
}
