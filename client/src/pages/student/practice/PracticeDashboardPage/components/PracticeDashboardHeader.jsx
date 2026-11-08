import { useTranslation } from "react-i18next";
import { HiOutlineRefresh } from "react-icons/hi";

const PracticeDashboardHeader = ({ loading, onRefresh }) => {
  const { t } = useTranslation("studentPractice");

  return (
    <div className="page-header">
      <div>
        <h1>{t("dashboard.title")}</h1>
        <p className="text-muted">{t("dashboard.subtitle")}</p>
      </div>
      <button type="button" className="btn btn-secondary btn-sm" onClick={onRefresh} disabled={loading}>
        <HiOutlineRefresh size={16} />
        <span>{loading ? t("dashboard.refreshing") : t("dashboard.refresh")}</span>
      </button>
    </div>
  );
};

export default PracticeDashboardHeader;
