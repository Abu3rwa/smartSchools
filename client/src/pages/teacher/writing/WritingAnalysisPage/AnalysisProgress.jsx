import { useTranslation } from "react-i18next";
import { progressOf } from "./analysisPresentation.js";

export default function AnalysisProgress({ analysis }) {
  const { t } = useTranslation(["writing"]);
  const progress = progressOf(analysis);
  const percent = progress.total
    ? Math.round((progress.settled / progress.total) * 100)
    : 0;

  return (
    <div className="wa-card wa-analysis-progress">
      <div className="wa-card-head">
        <div>
          <h2>{t("writing:teacher.analysis.progressTitle")}</h2>
          <p className="wa-card-sub">
            {t("writing:teacher.analysis.progressBody", {
              done: progress.settled,
              total: progress.total,
            })}
          </p>
        </div>
        <span className="wa-chip">
          {t(`writing:teacher.analysis.runStatuses.${analysis.status}`)}
        </span>
      </div>

      <div
        className="wa-analysis-bar"
        role="progressbar"
        aria-label={t("writing:teacher.analysis.progressTitle")}
        aria-valuemin={0}
        aria-valuemax={progress.total}
        aria-valuenow={progress.settled}
      >
        <span style={{ inlineSize: `${percent}%` }} />
      </div>

      {progress.failed > 0 && (
        <p className="wa-hint">
          {t("writing:teacher.analysis.progressFailed", {
            n: progress.failed,
          })}
        </p>
      )}
    </div>
  );
}
