import { useState } from "react";
import { useTranslation } from "react-i18next";
import { scaleLabel } from "./analysisPresentation.js";

const labelOf = (row) => (row.code ? `${row.code} · ${row.name}` : row.name);

/**
 * What publish would write, before anything is written. New gradebook columns
 * are opt-in: the default writes only standards that already have one.
 */
export default function PublishPreview({
  preview,
  busy,
  language,
  onCancel,
  onConfirm,
}) {
  const { t } = useTranslation(["writing"]);
  const [createMissingColumns, setCreateMissingColumns] = useState(false);
  const replace = preview?.replace || [];
  const missing = preview?.missingColumns || [];
  const targets = preview?.targets || 0;
  const ready = preview?.ready || 0;
  const writable = ready > 0 || (createMissingColumns && missing.length > 0);

  return (
    <section className="wa-card wa-ana-publish">
      <div className="wa-card-head">
        <div>
          <h3>{t("writing:teacher.analysis.previewTitle")}</h3>
          <p className="wa-card-sub">
            {t("writing:teacher.analysis.previewTargets", { n: targets })}
          </p>
        </div>
        <span className="wa-chip">
          {t("writing:teacher.analysis.previewReady", { n: ready })}
        </span>
      </div>

      {replace.length > 0 && (
        <div className="wa-ana-publish-block">
          <h4>
            {t("writing:teacher.analysis.previewReplace", { n: replace.length })}
          </h4>
          <ul>
            {replace.map((row) => (
              <li key={String(row.standard)}>
                <span>{labelOf(row)}</span>
                <span className="wa-ana-score-change">
                  {row.previousManualScore} → {row.manualScore} ·{" "}
                  {scaleLabel(row.manualScore, language)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {missing.length > 0 && (
        <div className="wa-ana-publish-block is-warning">
          <h4>
            {t("writing:teacher.analysis.previewMissing", { n: missing.length })}
          </h4>
          <ul>
            {missing.map((row) => (
              <li key={String(row.standard)}>
                <span>{labelOf(row)}</span>
                <span className="wa-ana-score-change">
                  {row.manualScore} · {scaleLabel(row.manualScore, language)}
                </span>
              </li>
            ))}
          </ul>
          <label className="wa-ana-check">
            <input
              type="checkbox"
              checked={createMissingColumns}
              onChange={(event) => setCreateMissingColumns(event.target.checked)}
            />
            <span>
              {t("writing:teacher.analysis.createColumns")}
              <span className="wa-hint">
                {t("writing:teacher.analysis.createColumnsHint")}
              </span>
            </span>
          </label>
        </div>
      )}

      <div className="wa-card-actions">
        <button type="button" className="btn btn-ghost" onClick={onCancel}>
          {t("writing:teacher.analysis.cancel")}
        </button>
        <button
          type="button"
          className="btn btn-primary"
          disabled={!writable || busy === "publish"}
          onClick={() =>
            onConfirm({
              createMissingColumns,
              confirmOverwrite: replace.length > 0,
            })
          }
        >
          {busy === "publish"
            ? t("writing:teacher.analysis.publishing")
            : replace.length > 0
              ? t("writing:teacher.analysis.replaceAndPublish", {
                  n: replace.length,
                })
              : t("writing:teacher.analysis.publish")}
        </button>
      </div>
      {!writable && (
        <p className="wa-hint">{t("writing:teacher.analysis.previewNothing")}</p>
      )}
    </section>
  );
}
