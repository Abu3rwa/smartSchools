import { useTranslation } from "react-i18next";

const PracticeStatsGrid = ({ assignmentsCount, masteredCount, needsReviewCount, inProgressCount, notStartedCount }) => {
  const { t } = useTranslation("studentPractice");

  return (
    <div className="practice-stats">
      <div className="practice-stat-card">
        <div className="stat-value">{assignmentsCount}</div>
        <div className="stat-label">{t("dashboard.stats.assigned")}</div>
      </div>
      <div className="practice-stat-card mastered">
        <div className="stat-value">{masteredCount}</div>
        <div className="stat-label">{t("dashboard.stats.completed")}</div>
      </div>
      <div className="practice-stat-card not-started">
        <div className="stat-value">{notStartedCount}</div>
        <div className="stat-label">{t("dashboard.stats.ready")}</div>
      </div>
      <div className="practice-stat-card in-progress">
        <div className="stat-value">{inProgressCount}</div>
        <div className="stat-label">{t("dashboard.stats.inProgress")}</div>
      </div>
      <div className="practice-stat-card needs-review">
        <div className="stat-value">{needsReviewCount}</div>
        <div className="stat-label">{t("dashboard.stats.needsReview")}</div>
      </div>
    </div>
  );
};

export default PracticeStatsGrid;
