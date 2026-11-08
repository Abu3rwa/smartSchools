import { useTranslation } from "react-i18next";
import { formatStandardLabel } from "../../../../../utils/standardLabel";

const formatStatus = (status) =>
  String(status || "not_started")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());

export default function PracticeAssessmentResultsTable({ items }) {
  const { t } = useTranslation("studentPractice");

  const translateStatus = (status) => {
    const key = String(status || "not_started").toLowerCase();
    return t(`results.status.${key}`, { defaultValue: formatStatus(status) });
  };

  return (
    <div className="table-container">
      <table className="practice-table">
        <thead>
          <tr>
            <th>{t("results.table.assessment")}</th>
            <th>{t("results.table.standard")}</th>
            <th>{t("results.table.status")}</th>
            <th>{t("results.table.score")}</th>
            <th>{t("results.table.percent")}</th>
            <th>{t("results.table.scale")}</th>
          </tr>
        </thead>
        <tbody>
          {items.length === 0 ? (
            <tr>
              <td colSpan={6}>{t("results.empty")}</td>
            </tr>
          ) : (
            items.map((item) => (
              <tr key={item.assignmentId}>
                <td>{item.title}</td>
                <td>{formatStandardLabel(item.standard) || t("results.notAvailable")}</td>
                <td>{translateStatus(item.status)}</td>
                <td>
                  {item.score !== null && item.score !== undefined
                    ? `${item.score}/${item.maxScore}`
                    : "—"}
                </td>
                <td>
                  {item.percentage !== null && item.percentage !== undefined
                    ? `${item.percentage}%`
                    : "—"}
                </td>
                <td>
                  {item.scale4 !== null && item.scale4 !== undefined
                    ? item.scale4
                    : "—"}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
