import { useTranslation } from "react-i18next";

const PracticeLoadingState = () => {
  const { t } = useTranslation("studentPractice");

  return (
    <div className="loading-container">
      <div className="spinner"></div>
      <p>{t("dashboard.loading")}</p>
    </div>
  );
};

export default PracticeLoadingState;
