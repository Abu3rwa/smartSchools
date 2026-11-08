import { useTranslation } from "react-i18next";
import { formatStandardLabel } from "../../../../../utils/standardLabel";

export default function PracticeAssessmentResultsStandardAveragesTable({
  standardAverages,
}) {
  const { t } = useTranslation("studentPractice");

  const formatNumber = (value, decimals = 2) => {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return '0';
    return numeric
      .toFixed(decimals)
      .replace(/\.00$/, '')
      .replace(/(\.\d*[1-9])0$/, '$1');
  };

  return (
    <div className="table-container" style={{ marginTop: "var(--spacing-lg)" }}>
      <h3>{t("results.standardAverages.title")}</h3>
      <table className="practice-table">
        <thead>
          <tr>
            <th>{t("results.standardAverages.standard")}</th>
            <th>{t("results.standardAverages.assessments")}</th>
            <th>{t("results.standardAverages.averagePercent")}</th>
            <th>{t("results.standardAverages.averageScale")}</th>
          </tr>
        </thead>
        <tbody>
          {standardAverages.length === 0 ? (
            <tr>
              <td colSpan={4}>{t("results.standardAverages.empty")}</td>
            </tr>
          ) : (
            standardAverages.map((item) => (
              <tr key={item.standardId}>
                <td>
                  {formatStandardLabel(item.standardCode, item.standardName)}
                </td>
                <td>{item.totalAssessments}</td>
                <td>{formatNumber(item.averagePercentage)}%</td>
                <td>{formatNumber(item.averageScale4)}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
