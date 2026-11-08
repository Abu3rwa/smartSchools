import { useTranslation } from "react-i18next";
import { HiOutlineRefresh } from "react-icons/hi";

export default function PracticeAssessmentResultsHeader({
  academicYear,
  selectedSemester,
  loading,
  onRefresh,
}) {
  const { t } = useTranslation("studentPractice");

  return (
    <div className="page-header">
      <div>
        <h1>{t("results.title")}</h1>
        <p className="text-muted">
          {t("results.subtitle", { year: academicYear, semester: selectedSemester })}
        </p>
      </div>
      <button
        type="button"
        className="btn btn-secondary btn-sm"
        onClick={onRefresh}
        disabled={loading}
      >
        <HiOutlineRefresh size={16} />
        <span>{loading ? t("results.refreshing") : t("results.refresh")}</span>
      </button>
    </div>
  );
}
